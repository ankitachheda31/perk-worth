import React, { useEffect, useState } from 'react'
import { ShieldCheck, KeyRound, ChevronRight, FileText, MessageCircle, Lock, Sparkles, LogOut, Trash2, AlertTriangle, Fingerprint, Bell, User, MessageSquare, Image as ImageIcon } from 'lucide-react'
import { Card, GhostButton, TopBar } from '../components/ui'
import MonthlySavingsRollup from '../components/MonthlySavingsRollup'
import { Auth, Permissions } from '../lib/api'
import { setStoredPin, setProfile, getProfile } from '../lib/store'
import { isBiometricAvailable, isBiometricEnrolled, enrollBiometric, disableBiometric, getBiometricBackend, verifyBiometric, getBiometricDiagnostic, isBiometricUiEnabled } from '../lib/biometric'
import { isNotifOptedIn, setNotifOptIn, requestNotificationPermission } from '../lib/push'
import { isNativeSmsAvailable, requestSmsPermission } from '../lib/smsScanner'

export default function SettingsPage({ onBack, onResetPin, onOpenProtect, onOpenPrivacy, onOpenFAQ, onOpenPrivacyControl, onOpenPerkTips, onReplayTour, onWipe, onLogout, toast }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioSupported, setBioSupported] = useState(false)
  const [bioCheckDone, setBioCheckDone] = useState(false)  // has async availability check finished?
  const [bioReason, setBioReason] = useState('')            // human-readable reason if unavailable
  const [bioDiag, setBioDiag] = useState(null)              // full raw plugin response for on-screen debugging
  const [bioEnabled, setBioEnabled] = useState(isBiometricEnrolled())
  const [bioBusy, setBioBusy] = useState(false)
  const [bioBackend, setBioBackend] = useState(getBiometricBackend())
  const [notifOn, setNotifOn] = useState(isNotifOptedIn())
  const [notifBusy, setNotifBusy] = useState(false)

  // ---- Profile auto-fill from server /me (source of truth) ------------
  // Populate the greeting + name/phone fields with the authenticated user
  // instead of asking the user to re-type what we already know.
  const [profile, setProfileLocal] = useState(() => getProfile() || { name: '', email: '', phone: '' })
  const [nameEdit, setNameEdit] = useState('')
  const [phoneEdit, setPhoneEdit] = useState('')
  const [profSaving, setProfSaving] = useState(false)

  // ---- Permissions state (server-authoritative) -----------------------
  const [perms, setPerms] = useState({})  // { sms, notifications, photos, voice }
  const [permBusy, setPermBusy] = useState(null)  // which key is being toggled

  useEffect(() => {
    let alive = true
    Auth.me().then(me => {
      if (!alive || !me) return
      const p = { name: me.name || '', email: me.email || '', phone: me.phone || '' }
      setProfileLocal(p)
      setProfile(p)  // sync local store
      setNameEdit(p.name)
      setPhoneEdit(p.phone)
    }).catch(() => null)
    Permissions.get().then(s => {
      if (!alive) return
      setPerms(s?.permissions || {})
    }).catch(() => null)
    return () => { alive = false }
  }, [])

  const saveProfile = async () => {
    setProfSaving(true)
    try {
      const updated = await Auth.updateMe({ name: nameEdit.trim(), phone: phoneEdit.trim() })
      const p = { name: updated.name || '', email: updated.email || profile.email, phone: updated.phone || '' }
      setProfileLocal(p)
      setProfile(p)
      toast?.('Profile updated')
    } catch {
      toast?.('Could not save profile')
    } finally {
      setProfSaving(false)
    }
  }

  const togglePerm = async (key) => {
    setPermBusy(key)
    try {
      let granted = !perms[key]
      // For OS-gated permissions we actually re-request the OS prompt on
      // "enable" so the user sees a real system dialog. On "disable" we just
      // record the intent (OS-level revoke happens in device Settings).
      if (granted) {
        if (key === 'sms') {
          if (!isNativeSmsAvailable()) {
            toast?.('SMS access is only available on Android')
            setPermBusy(null); return
          }
          const res = await requestSmsPermission()
          granted = !!res.granted
          if (!granted) {
            toast?.('SMS access denied — you can enable it later in device Settings')
          }
        } else if (key === 'notifications') {
          const res = await requestNotificationPermission()
          granted = res === 'granted' || res === true
          if (granted) setNotifOptIn(true)
          if (!granted) toast?.('Notification permission was not granted')
        }
      }
      const next = await Permissions.set({ [key]: granted })
      setPerms(next?.permissions || {})
    } catch {
      toast?.('Could not update permission')
    } finally {
      setPermBusy(null)
    }
  }

  useEffect(() => {
    // Async detection with rich diagnostic + one automatic retry. Some Android
    // devices (especially MIUI / ColorOS with aggressive process throttling)
    // take 8-12s to initialize the Capacitor plugin bridge on cold start, so
    // we retry once with a longer timeout before giving up.
    let alive = true
    runBioCheck(alive, false)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runBioCheck = async (aliveFlag, isManualRetry) => {
    setBioCheckDone(false)
    setBioReason('')
    let ok = false
    let reason = ''
    let diag = null
    try {
      diag = await getBiometricDiagnostic({ timeoutMs: 15000 })
      ok = !!diag.isAvailable

      // Auto-retry once if the first attempt timed out (plugin bridge cold start).
      if (!ok && !isManualRetry && diag.backend === 'native' && /timed out|did not respond/i.test(diag.diagnostic)) {
        await new Promise(r => setTimeout(r, 500))
        diag = await getBiometricDiagnostic({ timeoutMs: 15000 })
        ok = !!diag.isAvailable
      }

      if (!ok) {
        if (diag.backend === 'none') {
          reason = 'This device does not report any biometric hardware or platform authenticator.'
        } else if (diag.backend === 'native') {
          if (/timed out|did not respond/i.test(diag.diagnostic)) {
            reason = 'The native biometric bridge is not responding on this device. This is common on MIUI / Xiaomi / Oppo / Vivo phones with aggressive background limits. Try: 1) Open Android Settings → Apps → PerkWorth → Battery → set to "Unrestricted" or "No restrictions". 2) Force-stop PerkWorth and reopen. 3) If still failing, your device may not support Capacitor biometric plugins — you can still use the app with a 4-digit PIN.'
          } else if (diag.code === 'biometryNotEnrolled' || /not enrolled|no fingerprint|not been set up/i.test(diag.reason || '')) {
            reason = 'Your device has biometric hardware, but no fingerprint or face is enrolled at the Android system level. Open Android Settings → Security → Fingerprint / Face unlock, enroll one, then reopen PerkWorth.'
          } else if (diag.code === 'biometryNotAvailable' || diag.deviceIsSecure === false) {
            reason = diag.deviceIsSecure === false
              ? 'Your device lock (PIN / pattern / password) is not set at the Android system level. Enable device lock in Android Settings first, then biometric unlock will become available.'
              : 'Biometric hardware is not available on this device.'
          } else {
            reason = `${diag.diagnostic || 'Biometric unavailable'} (code=${diag.code || 'unknown'})`
          }
        } else if (diag.backend === 'web') {
          reason = 'This browser does not expose a platform authenticator. Try Chrome or Safari with the device unlock set up.'
        }
      }
    } catch (e) {
      reason = `Detection failed: ${e?.message || e?.name || 'unknown error'}`
    }
    if (!aliveFlag) return
    setBioSupported(ok)
    setBioReason(reason)
    setBioDiag(diag)
    setBioCheckDone(true)
  }

  const toggleNotifs = async () => {
    if (notifBusy) return
    setNotifBusy(true)
    try {
      if (notifOn) {
        setNotifOptIn(false)
        setNotifOn(false)
        toast?.('Expiry alerts turned off')
      } else {
        const perm = await requestNotificationPermission()
        if (perm === 'denied') {
          toast?.('Browser blocked notifications — enable in browser settings')
        } else {
          setNotifOptIn(true)
          setNotifOn(true)
          toast?.('Expiry alerts turned on · 3 days + 1 day before')
        }
      }
    } finally { setNotifBusy(false) }
  }

  const toggleBiometric = async () => {
    if (bioBusy) return
    setBioBusy(true)
    try {
      if (bioEnabled) {
        disableBiometric()
        setBioEnabled(false)
        toast?.('Biometric unlock disabled')
      } else {
        await enrollBiometric()
        setBioEnabled(true)
        toast?.('Biometric unlock enabled')
      }
    } catch (e) {
      const msg = e?.name === 'NotAllowedError' ? 'Biometric setup cancelled' : 'Could not set up biometric'
      toast?.(msg)
    } finally {
      setBioBusy(false)
    }
  }
  const wipe = async () => {
    // Biometric step-up: if enrolled, require fingerprint/face before wiping.
    // Falls through silently if not enrolled — never traps the user.
    if (isBiometricEnrolled()) {
      try {
        const ok = await verifyBiometric()
        if (!ok) {
          toast?.('Biometric required to delete account')
          return
        }
      } catch {
        toast?.('Biometric check failed — try again or turn it off first')
        return
      }
    }
    setBusy(true)
    try {
      const res = await Auth.wipe()
      localStorage.removeItem('perk_orbit_token')
      setStoredPin(null)
      setProfile({ name: '', email: '', phone: '' })
      const hrs = res?.grace_hours || 48
      toast?.(`Deletion scheduled — log in within ${hrs}h to restore`)
      onWipe?.()
    } catch {
      toast?.('Could not delete · try again')
      setBusy(false)
    }
  }

  // Biometric step-up wrapper for the "Change PIN" button.
  // If biometric is enrolled, verify first; otherwise proceed directly.
  const guardedResetPin = async () => {
    if (isBiometricEnrolled()) {
      try {
        const ok = await verifyBiometric()
        if (!ok) { toast?.('Biometric required to change PIN'); return }
      } catch {
        toast?.('Biometric check failed'); return
      }
    }
    onResetPin?.()
  }
  return (
    <>
      <TopBar title="Settings" onBack={onBack} />
      <main className="px-5 space-y-3 pb-10">
        <MonthlySavingsRollup onToast={toast} />

        {/* Profile — greet the user by name, allow inline edits (auto-filled
            from /me on mount, saves via PATCH /api/auth/me on Save). */}
        <Card className="p-5" data-testid="settings-profile-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-full grid place-items-center font-extrabold text-white text-lg" style={{ background: '#065F46' }}>
              {(profile.name || profile.email || 'P').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ink-900 truncate" data-testid="settings-profile-greeting">
                Hi{profile.name ? `, ${profile.name.split(' ')[0]}` : ''} 👋
              </p>
              <p className="text-xs text-ink-500 truncate" data-testid="settings-profile-email">{profile.email || 'No email on file'}</p>
            </div>
          </div>
          <label className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">Full name</label>
          <input
            data-testid="settings-profile-name"
            value={nameEdit}
            onChange={(e) => setNameEdit(e.target.value)}
            placeholder="Your name"
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2.5 text-sm mb-3"
            maxLength={80}
          />
          <label className="block text-[11px] font-semibold text-ink-500 uppercase tracking-wide mb-1">Phone (optional)</label>
          <input
            data-testid="settings-profile-phone"
            value={phoneEdit}
            onChange={(e) => setPhoneEdit(e.target.value)}
            placeholder="+91 98xxxxxxxx"
            inputMode="tel"
            className="w-full bg-ink-50 border border-ink-200 rounded-xl px-3 py-2.5 text-sm mb-3"
            maxLength={20}
          />
          <button
            data-testid="settings-profile-save"
            onClick={saveProfile}
            disabled={profSaving || (nameEdit === profile.name && phoneEdit === profile.phone)}
            className="w-full py-2.5 rounded-xl font-bold text-white text-sm disabled:opacity-50"
            style={{ background: '#065F46' }}>
            {profSaving ? 'Saving…' : 'Save profile'}
          </button>
        </Card>

        {/* Permissions — dedicated toggle panel. See product spec item #3.
            Each toggle re-requests OS permission on enable + records the
            answer to /api/permissions/state so the backend can nudge later. */}
        <Card className="p-5" data-testid="settings-permissions-card">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-emerald-800" />
            <p className="font-display font-bold text-ink-900">Permissions</p>
          </div>
          <p className="text-xs text-ink-500 mb-3 leading-relaxed">
            Control what PerkWorth can access. You can turn any of these on or off at any time — no re-installation needed.
          </p>
          <PermRow
            testid="perm-row-sms"
            icon={<MessageSquare className="w-4 h-4 text-emerald-800" />}
            label="Read voucher SMS"
            help={isNativeSmsAvailable()
              ? 'Auto-import coupons and memberships from brand SMS. Personal messages are ignored on-device.'
              : 'Available only on the Android app.'}
            on={!!perms.sms}
            busy={permBusy === 'sms'}
            disabled={!isNativeSmsAvailable() && !perms.sms}
            onToggle={() => togglePerm('sms')}
          />
          <PermRow
            testid="perm-row-notif"
            icon={<Bell className="w-4 h-4 text-emerald-800" />}
            label="Expiry alerts"
            help="Ping me 7 days before any voucher expires and when family members share perks."
            on={!!perms.notifications}
            busy={permBusy === 'notifications'}
            onToggle={() => togglePerm('notifications')}
          />
          <PermRow
            testid="perm-row-photos"
            icon={<ImageIcon className="w-4 h-4 text-emerald-800" />}
            label="Photo library (OCR)"
            help="Attach voucher screenshots so I can extract the code automatically."
            on={!!perms.photos}
            busy={permBusy === 'photos'}
            onToggle={() => togglePerm('photos')}
            last
          />
        </Card>

        <Card className="p-5 bg-emerald-50/40 border-emerald-200" data-testid="settings-trust-card">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-100 grid place-items-center"><ShieldCheck className="w-5 h-5 text-emerald-800" /></div>
            <div className="min-w-0">
              <p className="font-display font-bold text-ink-900">Your data is encrypted</p>
              <p className="text-[11px] text-ink-600">TLS 1.3 in transit · bcrypt + AES at rest · DPDP 2023 & GDPR compliant</p>
            </div>
          </div>
          <button data-testid="settings-learn-protect" onClick={onOpenProtect} className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300">
            Learn more → How we protect you
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">App PIN</p>
          <p className="text-xs text-ink-500 mb-3">PIN is stored locally on this device only. Cloud account stays signed in across devices.</p>
          <GhostButton data-testid="reset-pin" onClick={guardedResetPin}><KeyRound className="w-4 h-4" /> Change PIN</GhostButton>
        </Card>

        <Card className="p-5" data-testid="settings-notifications-card">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gold-50 grid place-items-center shrink-0">
              <Bell className="w-5 h-5 text-gold-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ink-900">Expiry alerts</p>
              <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                Two reminders per voucher — exactly <strong>3 days</strong> and <strong>1 day</strong> before expiry.
                Never spammy. Quiet hours from 10pm to 8am respected automatically.
              </p>
              <button
                data-testid="notif-toggle"
                onClick={toggleNotifs}
                disabled={notifBusy}
                className={`mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-full active:scale-95 transition disabled:opacity-60 ${
                  notifOn
                    ? 'bg-ink-100 text-ink-800 border border-ink-200'
                    : 'bg-emerald-800 text-white'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                {notifBusy ? 'Working…' : (notifOn ? 'Turn off alerts' : 'Turn on alerts')}
              </button>
            </div>
          </div>
        </Card>

        {/* Biometric — hidden entirely via feature flag (2026-02) because the
            native plugin bridge times out on MIUI/ColorOS devices even at 15s.
            Shipping with PIN as the primary security method. Flip the flag in
            frontend/src/lib/biometric.js to re-enable when we swap plugins. */}
        {isBiometricUiEnabled() && (
        <Card className="p-5" data-testid="settings-biometric-card">
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 ${bioSupported ? 'bg-emerald-50' : 'bg-ink-100'}`}>
              <Fingerprint className={`w-5 h-5 ${bioSupported ? 'text-emerald-800' : 'text-ink-400'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ink-900">Biometric unlock</p>
              <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                Unlock with Face ID / Fingerprint. PIN stays as backup — your cloud account is always recoverable.
              </p>
              <p className="text-[10px] text-ink-400 mt-1.5 font-mono" data-testid="biometric-backend-tag">
                Mode: {bioBackend === 'native' ? 'Native (Android/iOS BiometricPrompt)' : bioBackend === 'web' ? 'Web (WebAuthn)' : 'Unavailable'}
                {bioCheckDone && (bioSupported ? ' · Ready' : ' · Not available')}
              </p>
              {bioCheckDone && !bioSupported && bioReason && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mt-2 leading-relaxed" data-testid="biometric-unavailable-reason">
                  {bioReason}
                </p>
              )}
              {bioCheckDone && !bioSupported && (
                <button
                  data-testid="biometric-retry"
                  onClick={() => runBioCheck(true, true)}
                  className="mt-2 text-[11px] font-bold text-emerald-800 underline decoration-dotted underline-offset-2 active:scale-95 transition"
                >
                  ↻ Retry biometric check
                </button>
              )}
              {bioCheckDone && bioDiag && (
                <details className="mt-2" data-testid="biometric-diagnostic-details">
                  <summary className="text-[10px] text-ink-500 font-bold uppercase tracking-wide cursor-pointer select-none">
                    Show technical details
                  </summary>
                  <pre className="text-[10px] font-mono bg-ink-900 text-emerald-300 rounded-lg p-2.5 mt-1.5 overflow-x-auto whitespace-pre-wrap break-all" data-testid="biometric-diagnostic-raw">
{JSON.stringify(bioDiag, null, 2)}
                  </pre>
                  <p className="text-[10px] text-ink-400 mt-1">Screenshot this and share it if biometric still won't enable.</p>
                </details>
              )}
              <button
                data-testid="biometric-toggle"
                onClick={toggleBiometric}
                disabled={bioBusy || !bioCheckDone || !bioSupported}
                className={`mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-full active:scale-95 transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  bioEnabled
                    ? 'bg-ink-100 text-ink-800 border border-ink-200'
                    : 'bg-emerald-800 text-white'
                }`}
              >
                <Fingerprint className="w-3.5 h-3.5" />
                {!bioCheckDone
                  ? 'Checking…'
                  : bioBusy
                    ? 'Working…'
                    : !bioSupported
                      ? 'Unavailable on this device'
                      : (bioEnabled ? 'Disable biometric' : 'Enable biometric')}
              </button>
            </div>
          </div>
        </Card>
        )}

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">Privacy & legal</p>
          <button data-testid="settings-privacy" onClick={onOpenPrivacy} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><FileText className="w-4 h-4 text-ink-700" /> Privacy Policy</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-faq" onClick={onOpenFAQ} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><MessageCircle className="w-4 h-4 text-ink-700" /> Security FAQ</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-privacy-control" onClick={onOpenPrivacyControl} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Lock className="w-4 h-4 text-ink-700" /> Privacy Control</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-protect" onClick={onOpenProtect} className="w-full flex items-center justify-between py-3">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-800" /> How we protect you</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">Features</p>
          <button data-testid="settings-perk-tips" onClick={onOpenPerkTips} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-700" /> Perk Tips · Masterclass</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-replay-tour" onClick={onReplayTour} className="w-full flex items-center justify-between py-3">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-700" /> Take the tour again</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-1">Sign out</p>
          <p className="text-xs text-ink-500 mb-3">Sign out of this device. Your wallet stays safe in the cloud.</p>
          <GhostButton data-testid="settings-logout" onClick={onLogout}><LogOut className="w-4 h-4" /> Sign out</GhostButton>
        </Card>

        <Card className="p-5 border-terracotta-200 bg-terracotta-50/30" data-testid="settings-danger-zone">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-terracotta-700" />
            <p className="font-display font-bold text-terracotta-800">Delete my account</p>
          </div>
          <p className="text-xs text-ink-700 leading-relaxed mb-3">
            Your account will be marked for deletion and permanently removed after a <span className="font-bold">48-hour grace period</span>. During those 48 hours you can log back in and choose "Restore my account" to cancel. Your active Pro membership is deactivated immediately so no renewals fire.
          </p>
          <button data-testid="settings-wipe-open" onClick={() => setConfirmOpen(true)}
            className="w-full bg-terracotta-700 text-white font-semibold py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
          <p className="text-[10px] text-ink-500 text-center mt-2">DPDP 2023 §13 Right to Erasure · GDPR Art. 17 · 48h grace</p>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-1">About</p>
          <p className="text-xs text-ink-500">PerkWorth · v1.0 · Built for Indian households.</p>
        </Card>
      </main>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" data-testid="wipe-confirm-modal" onClick={() => !busy && setConfirmOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-terracotta-100 grid place-items-center"><AlertTriangle className="w-5 h-5 text-terracotta-700" /></div>
              <h2 className="font-display text-xl font-bold text-ink-900">Delete everything?</h2>
            </div>
            <p className="text-sm text-ink-700 leading-relaxed mb-3">
              We'll mark your account for deletion. You have <span className="font-bold">48 hours</span> to change your mind — just log back in and choose "Restore my account". After 48 hours everything is <span className="font-bold">permanently erased</span> and cannot be recovered. Your Pro membership is paused immediately (no billing).
            </p>
            <p className="text-xs text-ink-600 mb-2">Type <span className="font-mono font-bold text-terracotta-700">DELETE</span> to confirm:</p>
            <input data-testid="wipe-confirm-input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus
              className="w-full bg-ink-50 border border-ink-200 rounded-2xl px-4 py-3 text-sm font-mono tracking-wider" placeholder="DELETE" />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <GhostButton data-testid="wipe-cancel" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</GhostButton>
              <button data-testid="wipe-confirm" onClick={wipe}
                disabled={busy || confirmText.trim().toUpperCase() !== 'DELETE'}
                className="w-full bg-terracotta-700 text-white font-semibold py-3.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
                {busy ? 'Deleting…' : (<><Trash2 className="w-4 h-4" /> Delete</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Compact one-line toggle used by the Permissions section.
 * When `on=true`, shows a filled emerald pill. When `on=false`, shows a
 * grey pill. Click always calls onToggle (which will handle the OS prompt
 * on enable and clear the flag on disable).
 */
function PermRow({ testid, icon, label, help, on, busy, disabled, onToggle, last }) {
  return (
    <div
      data-testid={testid}
      className={`flex items-start gap-3 py-3 ${last ? '' : 'border-b border-ink-100'}`}>
      <div className="w-8 h-8 rounded-lg bg-emerald-50 grid place-items-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink-800">{label}</p>
        <p className="text-[11px] text-ink-500 leading-relaxed">{help}</p>
      </div>
      <button
        data-testid={`${testid}-toggle`}
        onClick={onToggle}
        disabled={busy || disabled}
        role="switch"
        aria-checked={on}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-1 disabled:opacity-40 ${on ? 'bg-emerald-700' : 'bg-ink-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
