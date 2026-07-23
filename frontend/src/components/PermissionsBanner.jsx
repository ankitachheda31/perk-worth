import React, { useEffect, useState } from 'react'
import { X, Info } from 'lucide-react'
import { Permissions } from '../lib/api'

/**
 * Non-intrusive banner shown at the bottom of the app when the user has
 * declined SMS scanning. Explains the trade-off in the user's own words
 * (see product spec) and offers a one-tap "Enable" or "Not now" action.
 *
 * Auto-dismisses (session-only) if the user closes it. Reappears on next
 * app open until they either grant SMS or explicitly say "Don't ask again".
 */
export default function PermissionsBanner({ onOpenSettings }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let alive = true
    const check = async () => {
      // Session-dismiss: hide until next reload if user closed it once.
      if (sessionStorage.getItem('perkworth_perm_banner_dismissed') === '1') return
      // Persistent "don't ask again": hide forever.
      if (localStorage.getItem('perkworth_perm_banner_muted') === '1') return
      try {
        const state = await Permissions.get()
        const perms = state?.permissions || {}
        // Only nudge if onboarding is complete (avoid double-messaging while
        // the wizard is still visible) AND SMS was explicitly denied.
        const declined = perms.sms === false
        const completed = !!state?.onboarding_completed
        if (alive && completed && declined) setVisible(true)
      } catch { /* silent */ }
    }
    check()
    return () => { alive = false }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    sessionStorage.setItem('perkworth_perm_banner_dismissed', '1')
    setVisible(false)
  }
  const mute = () => {
    localStorage.setItem('perkworth_perm_banner_muted', '1')
    setVisible(false)
  }

  return (
    <div
      data-testid="permissions-banner"
      className="fixed bottom-20 left-3 right-3 z-40 max-w-md mx-auto rounded-2xl bg-white border border-neutral-200 shadow-lg p-3 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
      <div className="w-8 h-8 rounded-full grid place-items-center shrink-0" style={{ background: '#F5E9C8' }}>
        <Info className="w-4 h-4" style={{ color: '#8A6A1A' }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-800 leading-snug">
          Since you haven't given permission, we can't auto-scan and keep your wallet up to date. Your call — <span className="font-semibold">enter memberships manually</span>, or <span className="font-semibold">allow auto-feed</span> (we'll always verify with you first).
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            data-testid="permissions-banner-enable"
            onClick={onOpenSettings}
            className="text-xs font-bold px-3 py-1.5 rounded-lg text-white"
            style={{ background: '#065F46' }}>
            Enable auto-scan
          </button>
          <button
            data-testid="permissions-banner-later"
            onClick={dismiss}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700">
            Not now
          </button>
          <button
            data-testid="permissions-banner-mute"
            onClick={mute}
            className="text-xs text-neutral-500 px-2 py-1.5">
            Don't ask again
          </button>
        </div>
      </div>
      <button
        data-testid="permissions-banner-close"
        onClick={dismiss}
        aria-label="Close"
        className="text-neutral-400 hover:text-neutral-700">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
