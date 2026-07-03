import React, { useEffect, useMemo, useState } from 'react'
import { Sparkles, Share2, PiggyBank } from 'lucide-react'
import { Vouchers } from '../lib/api'
import { getStoredPin } from '../lib/store'

/**
 * MonthlySavingsRollup — shareable "You saved ₹X this month" summary.
 *
 * Pure client-side calc from already-fetched voucher data:
 *   • codes_saved   = Σ savings_realized  (redeemed vouchers this month)
 *   • cashback_est  = Σ voucher.value × 3%   (conservative flat rate — see NOTE)
 *   • total         = codes_saved + cashback_est
 *
 * NOTE on cashback estimate: The Best Card widget elsewhere in the app derives
 * per-brand cashback rates from /api/cards/best. Here we intentionally use a
 * conservative FLAT 3% average across all redeemed vouchers to keep this
 * component API-cheap (one call: /api/vouchers) and honest — labeled as
 * an estimate, not a claim.
 */
const fmtINR = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`

const CASHBACK_ESTIMATE_RATE_PCT = 3

function isSameMonth(iso, ref) {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

export default function MonthlySavingsRollup({ onToast }) {
  const pin = getStoredPin()
  const [vouchers, setVouchers] = useState(null) // null = loading, [] = loaded

  useEffect(() => {
    if (!pin) { setVouchers([]); return }
    let cancelled = false
    Vouchers.list(pin, 'vouchers', 'redeemed')
      .then((data) => { if (!cancelled) setVouchers(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setVouchers([]) })
    return () => { cancelled = true }
  }, [pin])

  const rollup = useMemo(() => {
    if (!vouchers) return null
    const now = new Date()
    const thisMonth = vouchers.filter(v => isSameMonth(v.redeemed_at, now))
    const codes = thisMonth.reduce((s, v) => s + (Number(v.savings_realized) || 0), 0)
    const valueSum = thisMonth.reduce((s, v) => s + (Number(v.value) || 0), 0)
    const cashback = Math.round(valueSum * (CASHBACK_ESTIMATE_RATE_PCT / 100))
    return {
      count: thisMonth.length,
      codes: Math.round(codes),
      cashback,
      total: Math.round(codes) + cashback,
      monthLabel: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
    }
  }, [vouchers])

  const onShare = async () => {
    if (!rollup) return
    const text =
      `💰 PerkWorth · ${rollup.monthLabel}\n` +
      `I saved ${fmtINR(rollup.total)} this month across ${rollup.count} voucher${rollup.count === 1 ? '' : 's'}!\n` +
      `• ${fmtINR(rollup.codes)} from codes\n` +
      `• ${fmtINR(rollup.cashback)} estimated card cashback\n\n` +
      `Track yours: https://perkworth.app`
    // Prefer Web Share API on mobile; fall back to WhatsApp share URL
    if (navigator.share) {
      try {
        await navigator.share({ title: 'My PerkWorth savings this month', text })
        return
      } catch { /* user cancelled — fall through */ }
    }
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  const onCopy = async () => {
    if (!rollup) return
    const text =
      `PerkWorth · ${rollup.monthLabel} · Saved ${fmtINR(rollup.total)} across ${rollup.count} voucher${rollup.count === 1 ? '' : 's'} ` +
      `(${fmtINR(rollup.codes)} codes + ${fmtINR(rollup.cashback)} est. cashback)`
    try {
      await navigator.clipboard.writeText(text)
      onToast?.('Copied to clipboard')
    } catch {
      onToast?.('Could not copy — try Share instead')
    }
  }

  // Loading skeleton — keep it minimal
  if (rollup === null) {
    return (
      <div
        data-testid="monthly-rollup-loading"
        className="rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-900 text-white p-5 animate-pulse"
      >
        <div className="h-3 w-32 bg-white/20 rounded mb-3" />
        <div className="h-8 w-40 bg-white/20 rounded mb-2" />
        <div className="h-3 w-56 bg-white/20 rounded" />
      </div>
    )
  }

  const hasSavings = rollup.count > 0

  return (
    <div
      data-testid="monthly-rollup"
      className="rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-900 text-white p-5 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-white/15 grid place-items-center">
          <PiggyBank className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
            Monthly Savings · {rollup.monthLabel}
          </p>
        </div>
      </div>

      {hasSavings ? (
        <>
          <p
            data-testid="monthly-rollup-total"
            className="mt-3 text-4xl font-display font-bold leading-none"
          >
            {fmtINR(rollup.total)}
          </p>
          <p className="mt-1.5 text-[13px] text-white/85 leading-snug">
            across <span data-testid="monthly-rollup-count" className="font-semibold text-white">{rollup.count} voucher{rollup.count === 1 ? '' : 's'}</span> this month
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-2xl px-3 py-2.5" data-testid="monthly-rollup-codes">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">From codes</p>
              <p className="text-lg font-display font-bold text-white mt-0.5">{fmtINR(rollup.codes)}</p>
            </div>
            <div className="bg-white/10 rounded-2xl px-3 py-2.5" data-testid="monthly-rollup-cashback">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">Est. cashback</p>
              <p className="text-lg font-display font-bold text-white mt-0.5">{fmtINR(rollup.cashback)}</p>
            </div>
          </div>
          <p className="text-[10px] text-white/50 mt-2 leading-relaxed">
            *Cashback is a {CASHBACK_ESTIMATE_RATE_PCT}% estimate. Redemption codes are actuals from your wallet.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              data-testid="monthly-rollup-share"
              onClick={onShare}
              className="flex-1 py-2.5 rounded-full bg-white text-emerald-900 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition hover:bg-cream"
            >
              <Share2 className="w-3.5 h-3.5" /> Share on WhatsApp
            </button>
            <button
              data-testid="monthly-rollup-copy"
              onClick={onCopy}
              className="py-2.5 px-4 rounded-full bg-white/15 text-white text-xs font-bold flex items-center justify-center active:scale-95 transition hover:bg-white/20"
            >
              Copy
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3" data-testid="monthly-rollup-empty">
          <p className="text-2xl font-display font-bold leading-tight">No savings yet</p>
          <p className="mt-1.5 text-[13px] text-white/80 leading-snug">
            <Sparkles className="inline w-3.5 h-3.5 -mt-0.5" /> Redeem a voucher this month and it&apos;ll show up here.
          </p>
        </div>
      )}
    </div>
  )
}
