import React, { useEffect, useState } from 'react'
import { ShieldCheck, KeyRound, ChevronRight, FileText, MessageCircle, Lock, Sparkles, LogOut, Trash2, AlertTriangle, Fingerprint, Bell } from 'lucide-react'
import { Card, GhostButton, TopBar } from '../components/ui'
import { Auth } from '../lib/api'
import { setStoredPin, setProfile } from '../lib/store'
import { isBiometricAvailable, isBiometricEnrolled, enrollBiometric, disableBiometric, getBiometricBackend, verifyBiometric } from '../lib/biometric'
import { isNotifOptedIn, setNotifOptIn, requestNotificationPermission } from '../lib/push'

export default function SettingsPage({ onBack, onResetPin, onOpenProtect, onOpenPrivacy, onOpenFAQ, onOpenPrivacyControl, onOpenPerkTips, onReplayTour, onWipe, onLogout, toast }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [bioSupported, setBioSupported] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(isBiometricEnrolled())
  const [bioBusy, setBioBusy] = useState(false)
  const [bioBackend, setBioBackend] = useState(getBiometricBackend())
  const [notifOn, setNotifOn] = useState(isNotifOptedIn())
  const [notifBusy, setNotifBusy] = useState(false)

  useEffect(() => {
    isBiometricAvailable().then(setBioSupported)
  }, [])

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
      await Auth.wipe()
      localStorage.removeItem('perk_orbit_token')
      setStoredPin(null)
      setProfile({ name: '', email: '', phone: '' })
      toast?.('All your data has been deleted')
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

        {bioSupported && (
          <Card className="p-5" data-testid="settings-biometric-card">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 grid place-items-center shrink-0">
                <Fingerprint className="w-5 h-5 text-emerald-800" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display font-bold text-ink-900">Biometric unlock</p>
                <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                  Unlock with Face ID / Fingerprint. PIN stays as backup — your cloud account is always recoverable.
                </p>
                <p className="text-[10px] text-ink-400 mt-1.5 font-mono" data-testid="biometric-backend-tag">
                  Mode: {bioBackend === 'native' ? 'Native (Android/iOS BiometricPrompt)' : bioBackend === 'web' ? 'Web (WebAuthn)' : 'Unavailable'}
                </p>
                <button
                  data-testid="biometric-toggle"
                  onClick={toggleBiometric}
                  disabled={bioBusy}
                  className={`mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-full active:scale-95 transition disabled:opacity-60 ${
                    bioEnabled
                      ? 'bg-ink-100 text-ink-800 border border-ink-200'
                      : 'bg-emerald-800 text-white'
                  }`}
                >
                  <Fingerprint className="w-3.5 h-3.5" />
                  {bioBusy ? 'Working…' : (bioEnabled ? 'Disable biometric' : 'Enable biometric')}
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
            Permanently delete <span className="font-bold">your account and ALL your data</span> — login, vouchers, points, family circle, Pro membership, payment history, referrals. This cannot be undone. After deletion you can sign up again with the same email and start fresh.
          </p>
          <button data-testid="settings-wipe-open" onClick={() => setConfirmOpen(true)}
            className="w-full bg-terracotta-700 text-white font-semibold py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Delete my account
          </button>
          <p className="text-[10px] text-ink-500 text-center mt-2">DPDP 2023 §13 Right to Erasure · GDPR Art. 17</p>
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
              This will permanently remove your account, vouchers, points, family circle, and history. It <span className="font-bold">cannot be undone</span>.
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
