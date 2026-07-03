import React, { useState } from 'react'
import { Card, PrimaryButton } from '../components/ui'
import { Auth } from '../lib/api'

export default function AuthScreen({ onAuthed, existingPin }) {
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

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
        // Diagnostic: surface the actual HTTP status / axios error so we can
        // debug in-APK failures instead of showing a generic "try again".
        const st = e.response?.status
        const raw = e.message || e.code || 'unknown'
        const action = mode === 'login' ? 'sign in' : mode === 'signup' ? 'create account' : 'send reset link'
        msg = st
          ? `Could not ${action} (HTTP ${st}). ${raw}`
          : `Could not ${action}. ${raw}`
      }
      // Persist last error for on-device inspection (Chrome DevTools remote
      // debugging or the "About" screen readout). Cleared on next attempt.
      try { window.__perk_last_auth_error__ = { status: e.response?.status, code: e.code, message: e.message, data: e.response?.data } } catch { /* noop */ }
      setErr(msg)
    } finally { setBusy(false) }
  }

  const switchMode = (next) => { setMode(next); setErr(''); setForgotSent(false) }

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
          {mode === 'forgot' && forgotSent ? (
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
                  <input data-testid="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm" placeholder="At least 6 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </div>
              ) : null}
              {err ? <p data-testid="auth-error" className="text-xs text-terracotta-700">{err}</p> : null}
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
