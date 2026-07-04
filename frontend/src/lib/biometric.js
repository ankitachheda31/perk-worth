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

/**
 * Biometric unlock — unified facade.
 *
 * ⚠️ FEATURE FLAG (2026-02): `BIOMETRIC_UI_ENABLED` is currently `false`.
 * The `@aparajita/capacitor-biometric-auth` plugin bridge times out on MIUI /
 * ColorOS / FunTouch OS devices even with a 15s timeout (elapsedMs: 15001 in
 * production diagnostics), suggesting a deep OS-level restriction we can't
 * work around from JS. We're shipping with the 4-digit PIN as the primary
 * security method and hiding all biometric UI. To re-enable in a future build
 * (e.g. after switching to `capacitor-native-biometric` or shipping to devices
 * confirmed working), flip this flag to `true`. All the code paths below are
 * preserved so this is a one-line reversal.
 */
const BIOMETRIC_UI_ENABLED = false

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
export function isBiometricUiEnabled() {
  return BIOMETRIC_UI_ENABLED
}

export function getBiometricBackend() {
  if (!BIOMETRIC_UI_ENABLED) return 'none'
  if (isCapacitorNative()) return 'native'
  if (typeof window !== 'undefined' && window.PublicKeyCredential) return 'web'
  return 'none'
}

/** Does this device support any biometric? */
export async function isBiometricAvailable() {
  if (!BIOMETRIC_UI_ENABLED) return false
  const d = await getBiometricDiagnostic()
  return !!d.isAvailable
}

/**
 * Rich diagnostic — returns everything the plugin knows, plus a timeout guard
 * so a hung native bridge doesn't leave the UI on "Checking…" forever.
 * Also console.logs the full payload so you can inspect it via Chrome remote
 * debugging (chrome://inspect) even in a released APK.
 */
export async function getBiometricDiagnostic({ timeoutMs = 15000 } = {}) {
  const t0 = Date.now()
  const backend = getBiometricBackend()
  const base = { backend, isAvailable: false, biometryType: null, reason: '', code: '', deviceIsSecure: null, elapsedMs: 0, diagnostic: '' }

  if (typeof window === 'undefined') {
    const out = { ...base, diagnostic: 'window is undefined (SSR context)' }
    console.log('[biometric] diagnostic', out)
    return out
  }

  if (isCapacitorNative()) {
    try {
      // Race the plugin call against a timeout so a broken bridge can't hang UI.
      const info = await Promise.race([
        (async () => {
          const BiometricAuth = await loadNativePlugin()
          return await BiometricAuth.checkBiometry()
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`Native checkBiometry() did not respond within ${timeoutMs}ms — plugin may not be registered / cap sync missed`)), timeoutMs)),
      ])
      const out = {
        ...base,
        isAvailable: !!info?.isAvailable,
        biometryType: info?.biometryType ?? null,
        biometryTypes: info?.biometryTypes ?? [],
        strongBiometryIsAvailable: info?.strongBiometryIsAvailable ?? null,
        reason: info?.reason || '',
        code: info?.code || '',
        strongReason: info?.strongReason || '',
        strongCode: info?.strongCode || '',
        deviceIsSecure: info?.deviceIsSecure ?? null,
        elapsedMs: Date.now() - t0,
        diagnostic: info?.isAvailable
          ? 'Ready'
          : `Native check returned isAvailable=false · code="${info?.code || '(empty)'}" · reason="${info?.reason || '(empty)'}"`,
      }
      console.log('[biometric] native diagnostic', out)
      return out
    } catch (e) {
      const msg = e?.message || e?.name || String(e)
      const out = { ...base, elapsedMs: Date.now() - t0, diagnostic: `Native check threw: ${msg}` }
      console.error('[biometric] native check FAILED', msg, e)
      return out
    }
  }

  // Web fallback
  if (!window.PublicKeyCredential) {
    const out = { ...base, elapsedMs: Date.now() - t0, diagnostic: 'WebAuthn not exposed (no window.PublicKeyCredential)' }
    console.log('[biometric] web diagnostic', out)
    return out
  }
  try {
    const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    const out = { ...base, isAvailable: !!ok, elapsedMs: Date.now() - t0, diagnostic: ok ? 'Ready (WebAuthn)' : 'No platform authenticator (no OS-level biometric enrolled in the browser)' }
    console.log('[biometric] web diagnostic', out)
    return out
  } catch (e) {
    const out = { ...base, elapsedMs: Date.now() - t0, diagnostic: `WebAuthn probe threw: ${e?.message || e}` }
    console.error('[biometric] web check FAILED', e)
    return out
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
