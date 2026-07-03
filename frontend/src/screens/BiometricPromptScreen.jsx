import React, { useState } from 'react'
import { Fingerprint, Lock, Zap, ShieldCheck, Check } from 'lucide-react'
import { Card, PrimaryButton } from '../components/ui'
import { enrollBiometric } from '../lib/biometric'

/**
 * First-run biometric enrollment prompt. Shown ONCE per user after PIN setup,
 * before the walkthrough. Modeled on PhonePe / GPay onboarding flow.
 *
 * Gates in App.jsx ensure this only renders when:
 *   - user is authenticated + PIN set + unlocked
 *   - device has biometric hardware available
 *   - user hasn't enrolled yet
 *   - user hasn't previously dismissed this prompt
 */
export default function BiometricPromptScreen({ onEnrolled, onSkip, backend = 'native' }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const enable = async () => {
    if (busy) return
    setErr(''); setBusy(true)
    try {
      await enrollBiometric()
      onEnrolled?.()
    } catch (e) {
      const cancelled = e?.name === 'NotAllowedError'
      setErr(cancelled ? 'Setup cancelled — you can enable it later in Settings.' : 'Could not enable biometric — try again later from Settings.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell flex justify-center" data-testid="biometric-prompt-screen">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-6 pt-16 pb-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-emerald-800 grid place-items-center mx-auto mb-5 shadow-card">
            <Fingerprint className="w-10 h-10 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="font-display text-3xl font-bold text-ink-900 mb-2 tracking-tight">
            Unlock in a tap
          </h1>
          <p className="text-sm text-ink-600 leading-relaxed max-w-xs mx-auto">
            Use your fingerprint or face to open PerkWorth instantly — no need to type your PIN every time.
          </p>
        </div>

        {/* Benefits */}
        <Card className="p-5 mb-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 grid place-items-center shrink-0">
                <Zap className="w-4 h-4 text-emerald-800" />
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-ink-900 text-sm">Faster access</p>
                <p className="text-xs text-ink-500 mt-0.5">Skip the PIN keypad on every open.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 grid place-items-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-800" />
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-ink-900 text-sm">Stays on your device</p>
                <p className="text-xs text-ink-500 mt-0.5">Biometric never leaves your phone — we only see "verified".</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 grid place-items-center shrink-0">
                <Lock className="w-4 h-4 text-emerald-800" />
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-ink-900 text-sm">PIN stays as backup</p>
                <p className="text-xs text-ink-500 mt-0.5">If biometric fails, use your 4-digit PIN. Cloud account is always recoverable.</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Backend diagnostic tag (matches SettingsPage style) */}
        <p className="text-[10px] text-ink-400 font-mono text-center mb-4" data-testid="biometric-prompt-backend">
          Mode: {backend === 'native' ? 'Native (Android/iOS BiometricPrompt)' : 'Web (WebAuthn)'}
        </p>

        {err && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-center mb-3" data-testid="biometric-prompt-err">
            {err}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto space-y-3">
          <PrimaryButton
            data-testid="biometric-prompt-enable"
            onClick={enable}
            disabled={busy}
            className="w-full"
          >
            <span className="inline-flex items-center gap-2">
              {busy ? (
                <>Working…</>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Enable biometric unlock
                </>
              )}
            </span>
          </PrimaryButton>
          <button
            data-testid="biometric-prompt-skip"
            onClick={onSkip}
            disabled={busy}
            className="w-full text-sm font-bold text-ink-600 py-3 active:scale-95 transition disabled:opacity-60"
          >
            Not now, use PIN
          </button>
          <p className="text-[11px] text-ink-400 text-center leading-relaxed">
            You can change this anytime in <span className="font-bold">Settings → Biometric unlock</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
