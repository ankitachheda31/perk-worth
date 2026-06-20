/**
 * Biometric unlock — unified facade.
 *
 *  Native (Android APK / iOS via Capacitor)
 *    Uses @aparajita/capacitor-biometric-auth (OS-level Face ID / Fingerprint /
 *    BiometricPrompt). Enrollment is OS-level — we only store a "user opted in"
 *    flag locally; verification calls the OS prompt.
 *
 *  Web (PWA, including Chrome WebView for users who skip the APK)
 *    Uses WebAuthn platform authenticator (the original implementation).
 *
 *  Why local-only (no backend)?
 *    This unlocks the *app on this device*, not the cloud account.
 *    PIN remains as fallback (cloud-recoverable). Indian banking apps (PhonePe,
 *    Paytm, GPay) work the same way — biometric is a local convenience.
 *
 *  Public API (consumed by SettingsPage and PinLock):
 *    isBiometricAvailable() -> boolean   — device supports any biometric?
 *    isBiometricEnrolled()  -> boolean   — user has opted in on this device?
 *    enrollBiometric(name)  -> true      — opt the user in (prompts on web)
 *    verifyBiometric()      -> boolean   — show OS prompt, true if verified
 *    disableBiometric()                  — clear local enrollment
 *    getBiometricBackend()  -> 'native'|'web'|'none' — diagnostics
 */

const STORAGE_KEY = 'perk_biometric_v1'
const RP_NAME = 'PerkWorth'

// ---------------------------------------------------------------------------
//  Capacitor native detection
// ---------------------------------------------------------------------------
function isCapacitorNative() {
  try {
    // Capacitor v6 exposes a global at window.Capacitor with isNativePlatform()
    if (typeof window === 'undefined') return false
    const cap = window.Capacitor
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
  } catch {
    return false
  }
}

async function loadNativePlugin() {
  // Dynamic import so web builds don't try to resolve the plugin at runtime
  // (the JS shim is fine; the native code only loads inside the APK).
  const mod = await import('@aparajita/capacitor-biometric-auth')
  return mod.BiometricAuth || mod.default || mod
}

// ---------------------------------------------------------------------------
//  Local opt-in storage (small JSON blob)
// ---------------------------------------------------------------------------
const readStore = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch { return null }
}
const writeStore = (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
const clearStore = () => localStorage.removeItem(STORAGE_KEY)

// ---------------------------------------------------------------------------
//  WebAuthn helpers (web fallback path)
// ---------------------------------------------------------------------------
const b64url = {
  encode(buffer) {
    const bytes = new Uint8Array(buffer)
    let str = ''
    for (const b of bytes) str += String.fromCharCode(b)
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  },
  decode(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/')
    while (s.length % 4) s += '='
    const bin = atob(s)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.buffer
  },
}
const random = (n = 32) => crypto.getRandomValues(new Uint8Array(n))

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------
export function getBiometricBackend() {
  if (isCapacitorNative()) return 'native'
  if (typeof window !== 'undefined' && window.PublicKeyCredential) return 'web'
  return 'none'
}

/** Does this device support any biometric? */
export async function isBiometricAvailable() {
  if (typeof window === 'undefined') return false

  if (isCapacitorNative()) {
    try {
      const BiometricAuth = await loadNativePlugin()
      const info = await BiometricAuth.checkBiometry()
      // Plugin returns `{ isAvailable, biometryType, reason }`
      return !!info?.isAvailable
    } catch (e) {
      console.warn('[biometric] native check failed', e)
      return false
    }
  }

  // Web fallback
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** Has the user opted in on this device? */
export function isBiometricEnrolled() {
  const s = readStore()
  return !!(s && (s.optedIn || s.credentialId))
}

/**
 *  Enroll biometric — opt the user into using biometric unlock on this device.
 *
 *  Native: confirms the OS reports a biometric is available; just persists the
 *          opt-in flag. The actual fingerprint/face was enrolled at the OS level
 *          by the user separately.
 *  Web:    runs a WebAuthn credentials.create() to bind a credential to this app
 *          and stores the credentialId locally.
 */
export async function enrollBiometric(displayName = 'PerkWorth user') {
  const supported = await isBiometricAvailable()
  if (!supported) throw new Error('Biometric not available on this device')

  if (isCapacitorNative()) {
    // Optional: do an immediate "authenticate" so we surface any "no enrollment
    // at OS level" error to the user now, not at first unlock attempt.
    try {
      const BiometricAuth = await loadNativePlugin()
      await BiometricAuth.authenticate({
        reason: 'Enable biometric unlock for PerkWorth',
        cancelTitle: 'Cancel',
        allowDeviceCredential: false,
        iosFallbackTitle: 'Use Passcode',
        androidTitle: 'PerkWorth',
        androidSubtitle: 'Enable biometric unlock',
        androidConfirmationRequired: false,
      })
    } catch (e) {
      const err = new Error('Biometric enrollment cancelled')
      err.name = e?.code === 'userCancel' || e?.name === 'NotAllowedError'
        ? 'NotAllowedError' : 'BiometricError'
      throw err
    }
    writeStore({
      optedIn: true,
      backend: 'native',
      enrolledAt: new Date().toISOString(),
    })
    return true
  }

  // Web — original WebAuthn enroll
  const userHandle = random(16)
  const challenge = random(32)

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: RP_NAME, id: window.location.hostname },
      user: {
        id: userHandle,
        name: 'perkworth-local',
        displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },    // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })

  if (!cred) throw new Error('Biometric enrollment cancelled')

  writeStore({
    optedIn: true,
    backend: 'web',
    credentialId: b64url.encode(cred.rawId),
    userHandle: b64url.encode(userHandle),
    enrolledAt: new Date().toISOString(),
  })
  return true
}

/**
 *  Verify biometric — show the OS prompt, return true on success, false on user
 *  cancel/timeout (so the caller falls back to PIN). Throws on hard errors.
 */
export async function verifyBiometric() {
  const store = readStore()
  if (!store) throw new Error('Biometric not enrolled')

  if (isCapacitorNative()) {
    try {
      const BiometricAuth = await loadNativePlugin()
      await BiometricAuth.authenticate({
        reason: 'Unlock PerkWorth',
        cancelTitle: 'Use PIN instead',
        allowDeviceCredential: false,
        iosFallbackTitle: 'Use Passcode',
        androidTitle: 'PerkWorth',
        androidSubtitle: 'Unlock your wallet',
        androidConfirmationRequired: false,
      })
      return true
    } catch (e) {
      // User cancel / soft fail — fall through to PIN keypad
      const code = e?.code || e?.name
      if (code === 'userCancel' || code === 'NotAllowedError' ||
          code === 'authenticationFailed' || code === 'userFallback') {
        return false
      }
      // Hard errors (no biometric enrolled at OS level, locked out, …) — let caller decide
      throw e
    }
  }

  // Web — WebAuthn get()
  if (!store.credentialId) throw new Error('Biometric not enrolled')
  const challenge = random(32)
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [{
          id: b64url.decode(store.credentialId),
          type: 'public-key',
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    })
    return !!assertion
  } catch (e) {
    if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return false
    throw e
  }
}

/** Disable biometric — wipes local enrollment. OS-level biometric stays untouched. */
export function disableBiometric() {
  clearStore()
}
