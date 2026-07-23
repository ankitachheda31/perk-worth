import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Card, PrimaryButton } from '../components/ui'
import { Auth } from '../lib/api'

export default function AuthScreen({ onAuthed, existingPin }) {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  // 48h soft-delete grace: if the server tells us this account is pending
  // deletion, we surface a restore prompt with the exact same email+password.
  const [pendingDeletion, setPendingDeletion] = useState(null)

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      if (mode === 'forgot') {
        await Auth.forgotPassword(email.trim().toLowerCase())
        setForgotSent(true)
        return
      }
      const fn = mode === 'login' ? Auth.login : Auth.signup
      const cleanEmail = email.trim().toLowerCase()
      const body = mode === 'login'
        ? { email: cleanEmail, password }
        : { email: cleanEmail, password, name: name.trim(), pin_to_claim: existingPin || undefined }
      const res = await fn(body)
      // ── Detect 48h soft-delete pending state ────────────────────────
      if (res && res.pending_deletion) {
        setPendingDeletion({ ...res, email: cleanEmail })
        return
      }
      if (res.access_token) localStorage.setItem('perk_orbit_token', res.access_token)
      localStorage.setItem('perk_orbit_user', JSON.stringify({ id: res.id, email: res.email, name: res.name, phone: res.phone }))
      onAuthed(res)
    } catch (e) {
      let msg = ''
      const d = e.response?.data?.detail
      if (typeof d === 'string') {
        msg = d
      } else if (Array.isArray(d) && d.length) {
        // FastAPI 422 validation errors → surface a humane message
        const first = d[0] || {}
        const loc = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : 'input'
        const fieldName = ({ email: 'Email', password: 'Password', name: 'Name' })[loc] || loc
        msg = `${fieldName}: ${first.msg || 'invalid'}`
        // Pretty-print common cases
        if (/string_too_short/i.test(first.type || '') && loc === 'password') {
          msg = 'Password must be at least 6 characters.'
        }
        if (/value_error\.email|email/i.test(first.type || '') && loc === 'email') {
          msg = 'Please enter a valid email address.'
        }
      } else if (e.message === 'Network Error') {
        msg = 'Network error — check your connection and try again.'
      } else if (e.code === 'ECONNABORTED') {
        msg = 'Request timed out. Please try again.'
      } else if (e.response?.status === 401) {
        msg = 'Invalid email or password.'
      } else if (e.response?.status === 409) {
        msg = 'This email is already registered. Try signing in instead.'
      } else {
        // Diagnostic: surface HTTP status + actual request URL + axios error so
        // we can debug in-APK failures instead of showing a generic "try again".
        const st = e.response?.status
        const raw = e.message || e.code || 'unknown'
        const reqUrl = (e.config?.baseURL || '') + (e.config?.url || '')
        const action = mode === 'login' ? 'sign in' : mode === 'signup' ? 'create account' : 'send reset link'
        msg = st
          ? `Could not ${action} (HTTP ${st}). ${raw}\nURL: ${reqUrl || '(unknown)'}`
          : `Could not ${action}. ${raw}\nURL: ${reqUrl || '(unknown)'}`
      }
      // Persist last error for on-device inspection (Chrome DevTools remote
      // debugging or the "About" screen readout). Cleared on next attempt.
      try {
        window.__perk_last_auth_error__ = {
          status: e.response?.status,
          code: e.code,
          message: e.message,
          data: e.response?.data,
          baseURL: e.config?.baseURL,
          url: e.config?.url,
          method: e.config?.method,
          fullUrl: (e.config?.baseURL || '') + (e.config?.url || ''),
        }
      } catch { /* noop */ }
      setErr(msg)
    } finally { setBusy(false) }
  }

  const restoreAccount = async () => {
    setErr(''); setBusy(true)
    try {
      const res = await Auth.restoreAccount({ email: pendingDeletion.email, password })
      if (res.access_token) localStorage.setItem('perk_orbit_token', res.access_token)
      localStorage.setItem('perk_orbit_user', JSON.stringify({ id: res.id, email: res.email, name: res.name, phone: res.phone }))
      setPendingDeletion(null)
      onAuthed(res)
    } catch (e) {
      const s = e.response?.status
      if (s === 410) setErr('The 48-hour restore window has expired. Please sign up as a new account.')
      else if (s === 401) setErr('Password check failed. Try again.')
      else setErr('Could not restore account. Try again in a moment.')
    } finally { setBusy(false) }
  }

  const switchMode = (next) => { setMode(next); setErr(''); setForgotSent(false); setPendingDeletion(null) }

  const title = mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'
  const sub = mode === 'login'
    ? 'Cloud sync · access your wallet on any device'
    : mode === 'signup'
      ? 'Your wallet syncs across phones — never lose a voucher.'
      : "Enter the email tied to your account. We'll send you a reset link."

  return (
    <div className="app-shell flex justify-center" data-testid="auth-screen">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-6 pt-16 pb-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-2xl bg-emerald-800 grid place-items-center text-white font-display font-bold">P</div>
            <span className="font-display text-lg font-bold tracking-tight">PerkWorth</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink-900">{title}</h1>
          <p className="text-sm text-ink-500 mt-2">{sub}</p>
          {existingPin && mode === 'signup' ? (
            <p className="text-[11px] text-emerald-800 mt-2 font-semibold">Your local PIN-{existingPin.slice(0,2)}** wallet will be migrated to this account.</p>
          ) : null}
        </div>

        <Card className="p-5 space-y-3">
          {pendingDeletion ? (
            <div data-testid="pending-deletion-panel" className="space-y-3 py-2">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 grid place-items-center mx-auto">
                <span className="text-2xl">⏳</span>
              </div>
              <h2 className="font-display text-lg font-bold text-center text-ink-900">Your account is scheduled for deletion</h2>
              <p className="text-sm text-ink-700 text-center leading-relaxed">
                You have <span className="font-bold">{pendingDeletion.hours_remaining} hours</span> left in the 48-hour grace period to change your mind and bring everything back — vouchers, memberships, Pro subscription, family circle.
              </p>
              <button
                data-testid="restore-account-btn"
                onClick={restoreAccount}
                disabled={busy}
                className="w-full py-3.5 rounded-full font-bold text-white shadow-lg disabled:opacity-50"
                style={{ background: '#065F46' }}>
                {busy ? 'Restoring…' : 'Restore my account'}
              </button>
              <button
                data-testid="cancel-restore-btn"
                onClick={() => setPendingDeletion(null)}
                className="w-full py-3 rounded-full border border-neutral-300 text-sm font-semibold text-ink-700">
                Keep it deleted
              </button>
              {err && <p className="text-xs text-terracotta-700 text-center">{err}</p>}
              <p className="text-[10px] text-ink-500 text-center">After the 48-hour window, everything is permanently erased and cannot be recovered.</p>
            </div>
          ) : mode === 'forgot' && forgotSent ? (
            <div data-testid="forgot-sent" className="space-y-2 text-center py-3">
              <p className="text-sm text-emerald-800 font-semibold">If an account exists for that email, a reset link is on its way.</p>
              <p className="text-xs text-ink-500">Check your inbox (and spam folder). The link expires in 60 minutes.</p>
            </div>
          ) : (
            <>
              {mode === 'signup' ? (
                <div>
                  <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Name</label>
                  <input data-testid="auth-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm" placeholder="Your name" />
                </div>
              ) : null}
              <div>
                <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Email</label>
                <input data-testid="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm" placeholder="you@example.com" autoComplete="email" />
              </div>
              {mode !== 'forgot' ? (
                <div>
                  <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Password</label>
                  <div className="mt-1.5 relative">
                    <input
                      data-testid="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-ink-50 border border-ink-200 rounded-2xl pl-3 pr-11 py-3 text-sm"
                      placeholder="At least 6 characters"
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      data-testid="auth-password-toggle"
                      onClick={() => setShowPassword(v => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex items-center justify-center w-11 text-ink-500 hover:text-ink-800 active:scale-90 transition"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ) : null}
              {err ? <p data-testid="auth-error" className="text-xs text-terracotta-700 whitespace-pre-wrap break-words">{err}</p> : null}
              <PrimaryButton data-testid="auth-submit" onClick={submit} disabled={busy || !email || (mode !== 'forgot' && !password)}>
                {busy ? '…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </PrimaryButton>
              {mode === 'login' ? (
                <button data-testid="auth-forgot" onClick={() => switchMode('forgot')} className="block w-full text-center text-[11px] text-emerald-800 font-semibold pt-1">
                  Forgot password?
                </button>
              ) : null}
            </>
          )}
        </Card>

        <div className="text-center mt-4">
          {mode === 'forgot' ? (
            <button data-testid="auth-back" onClick={() => switchMode('login')} className="text-xs text-ink-500">
              ← Back to sign in
            </button>
          ) : (
            <button data-testid="auth-toggle" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} className="text-xs text-ink-500">
              {mode === 'login' ? "New to PerkWorth? Create an account →" : 'Already have an account? Sign in →'}
            </button>
          )}
        </div>
        <p className="text-center text-[10px] text-ink-400 mt-auto pt-6">
          By continuing you agree to our Privacy Policy & Terms.
        </p>
      </div>
    </div>
  )
}
