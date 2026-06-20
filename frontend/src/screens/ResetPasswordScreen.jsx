import React, { useState } from 'react'
import { Card, PrimaryButton } from '../components/ui'
import { Auth } from '../lib/api'

/**
 * Shown when the URL contains ?reset_token=...
 * On success, auto-signs in and clears the token from the URL.
 */
export default function ResetPasswordScreen({ token, onAuthed, onCancel }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const submit = async () => {
    setErr('')
    if (pw.length < 6) { setErr('Password must be at least 6 characters.'); return }
    if (pw !== pw2) { setErr('Passwords do not match.'); return }
    setBusy(true)
    try {
      const res = await Auth.resetPassword(token, pw)
      if (res?.access_token) localStorage.setItem('perk_orbit_token', res.access_token)
      if (res?.email) localStorage.setItem('perk_orbit_user', JSON.stringify({ id: res.id, email: res.email, name: '' }))
      setDone(true)
      // Strip token from URL so a refresh doesn't try again
      try {
        const u = new URL(window.location.href)
        u.searchParams.delete('reset_token')
        window.history.replaceState({}, '', u.toString())
      } catch { /* ignore */ }
      setTimeout(() => { onAuthed?.(res) }, 700)
    } catch (e) {
      const d = e.response?.data?.detail
      setErr(typeof d === 'string' ? d : 'Could not reset password. The link may have expired — request a new one.')
    } finally { setBusy(false) }
  }

  return (
    <div className="app-shell flex justify-center" data-testid="reset-password-screen">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-6 pt-16 pb-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-2xl bg-emerald-800 grid place-items-center text-white font-display font-bold">P</div>
            <span className="font-display text-lg font-bold tracking-tight">PerkWorth</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink-900">Choose a new password</h1>
          <p className="text-sm text-ink-500 mt-2">You'll be signed in automatically once it's saved.</p>
        </div>

        <Card className="p-5 space-y-3">
          {done ? (
            <p data-testid="reset-success" className="text-sm text-emerald-800 font-semibold text-center py-2">Password updated · signing you in…</p>
          ) : (
            <>
              <div>
                <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">New password</label>
                <input data-testid="reset-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm" placeholder="At least 6 characters" autoComplete="new-password" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Confirm password</label>
                <input data-testid="reset-pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm" placeholder="Repeat it" autoComplete="new-password" />
              </div>
              {err ? <p data-testid="reset-error" className="text-xs text-terracotta-700">{err}</p> : null}
              <PrimaryButton data-testid="reset-submit" onClick={submit} disabled={busy || !pw || !pw2}>
                {busy ? '…' : 'Save & sign in'}
              </PrimaryButton>
            </>
          )}
        </Card>

        {!done && (
          <div className="text-center mt-4">
            <button data-testid="reset-cancel" onClick={onCancel} className="text-xs text-ink-500">Back to sign in</button>
          </div>
        )}
      </div>
    </div>
  )
}
