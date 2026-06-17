import React from 'react'

export function Shell({ children }) {
  return (
    <div className="app-shell w-full flex justify-center">
      <div className="relative w-full max-w-md min-h-[100dvh] pb-24" data-testid="app-shell">
        {children}
      </div>
    </div>
  )
}

export function TopBar({ title, onBack, right, subtitle }) {
  return (
    <header className="sticky top-0 z-30 px-5 pt-6 pb-3 backdrop-blur-xl bg-[rgba(244,241,236,0.78)]" data-testid="top-bar">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button data-testid="topbar-back" onClick={onBack}
              className="w-10 h-10 rounded-full bg-white border border-ink-200 flex items-center justify-center active:scale-95 transition">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-ink-900 leading-none truncate">{title}</h1>
            {subtitle ? <p className="text-xs text-ink-500 mt-1 truncate">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  )
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`bg-white border border-ink-200 rounded-3xl shadow-soft ${className}`} {...props}>
      {children}
    </div>
  )
}

export function PrimaryButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`w-full bg-emerald-800 text-white font-semibold py-3.5 rounded-full shadow-emerald active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`w-full bg-white border border-ink-200 text-ink-800 font-semibold py-3.5 rounded-full active:scale-95 transition hover:bg-ink-50 flex items-center justify-center gap-2 ${className}`}
    >
      {children}
    </button>
  )
}

export function Tag({ children, tone = 'neutral', ...rest }) {
  const tones = {
    neutral: 'bg-ink-100 text-ink-700',
    gold: 'bg-gold-100 text-gold-600',
    emerald: 'bg-emerald-100 text-emerald-700',
    warn: 'bg-terracotta-50 text-terracotta-700',
  }
  return <span {...rest} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tones[tone]}`}>{children}</span>
}

export function ProgressBar({ value, tone = 'emerald' }) {
  const cls = tone === 'gold' ? 'bg-gold-500' : 'bg-emerald-700'
  return (
    <div className="h-2 w-full bg-ink-100 rounded-full overflow-hidden">
      <div className={`${cls} h-full rounded-full transition-all duration-700`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Sheet({ open, onClose, title, children, testid = 'sheet' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sheet-backdrop" data-testid={`${testid}-backdrop`} onClick={onClose}>
      <div
        data-testid={testid}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-t-4xl shadow-sheet px-5 pt-5 pb-8 page-enter"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="w-12 h-1.5 bg-ink-200 rounded-full mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
          <button data-testid={`${testid}-close`} onClick={onClose} className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center active:scale-95">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="max-h-[78dvh] overflow-y-auto no-scrollbar">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ title, sub, icon, testid = 'empty' }) {
  return (
    <div className="text-center py-12 px-6" data-testid={testid}>
      <div className="w-14 h-14 rounded-full bg-ink-100 mx-auto flex items-center justify-center mb-3 text-ink-500">{icon}</div>
      <p className="font-display text-lg font-semibold text-ink-800">{title}</p>
      {sub ? <p className="text-sm text-ink-500 mt-1">{sub}</p> : null}
    </div>
  )
}

export function Toast({ message }) {
  if (!message) return null
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] bg-ink-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-card animate-fade-in" data-testid="toast">
      {message}
    </div>
  )
}

export function OfflineBanner({ online }) {
  if (online) return null
  return (
    <div data-testid="offline-banner" className="fixed top-0 left-1/2 -translate-x-1/2 z-[90] w-full max-w-md px-3 pt-3 page-enter">
      <div className="rounded-2xl bg-terracotta-700 text-white px-4 py-2.5 shadow-card flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <p className="text-xs font-semibold leading-tight">You're offline · आप ऑफलाइन हैं</p>
        <span className="ml-auto text-[10px] text-white/70 font-medium">Some features paused</span>
      </div>
    </div>
  )
}
