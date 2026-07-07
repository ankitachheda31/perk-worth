import React, { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Backend health banner — surfaces config drift (wrong URL baked into APK,
 * backend down, DNS issue, corp firewall) within ~3 seconds of app open,
 * BEFORE the user tries to log in and gets a mystery "Network error".
 *
 * On mount, does a lightweight GET to /api/health. If it fails or takes > 8s,
 * shows a red persistent banner at the top with the configured URL so the
 * user can copy it and send to support. Retries every 30s so if the backend
 * comes back up the banner disappears automatically.
 *
 * No effect on happy path: banner is hidden entirely when /health returns 200.
 */
export default function BackendHealthBanner() {
  const [status, setStatus] = useState('checking') // 'checking' | 'ok' | 'error'
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let cancelled = false
    const BACKEND = import.meta.env.VITE_BACKEND_URL || ''

    const ping = async () => {
      if (cancelled) return
      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 8000)
      try {
        const res = await fetch(`${BACKEND}/api/health`, { signal: ctrl.signal, cache: 'no-store' })
        clearTimeout(timeout)
        if (cancelled) return
        if (res.ok) {
          setStatus('ok')
          setDetail('')
        } else {
          setStatus('error')
          setDetail(`HTTP ${res.status} · ${BACKEND || '(empty URL)'}`)
        }
      } catch (e) {
        clearTimeout(timeout)
        if (cancelled) return
        setStatus('error')
        setDetail(`${e.name === 'AbortError' ? 'Timed out after 8s' : (e.message || 'Network unreachable')} · ${BACKEND || '(empty URL)'}`)
      }
    }

    ping()
    const iv = setInterval(ping, 30000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  if (status !== 'error') return null

  return (
    <div
      data-testid="backend-health-banner"
      className="fixed top-0 inset-x-0 z-[100] bg-rose-700 text-white px-4 py-2.5 shadow-lg"
      role="alert"
    >
      <div className="max-w-md mx-auto flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight">Can&apos;t reach PerkWorth servers</p>
          <p className="text-[11px] leading-relaxed opacity-90 break-all mt-0.5">
            {detail}
          </p>
          <p className="text-[10px] opacity-75 mt-1">
            Auto-retrying every 30s · Screenshot this and send to support@perkworth.com if it persists.
          </p>
        </div>
      </div>
    </div>
  )
}
