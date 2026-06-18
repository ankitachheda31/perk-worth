import React from 'react'
import { Copy, Clock, KeyRound, Share2, Trash2, MessageSquareText, BadgeCheck } from 'lucide-react'
import { Tag } from './ui'
import { daysUntil, fmtDate, fmtINR } from '../lib/format'
import { WA_SUPPORT_NUMBER } from '../lib/constants'
import { Support } from '../lib/api'

export function buildWaHelpUrl(v) {
  const text = encodeURIComponent(
    `Hi Perk Orbit support — I need help with this voucher:\n\n• Brand: ${v.brand || '—'}\n• Title: ${v.title || '—'}\n• Code: ${v.code || '—'}\n• Issue: This code is not working / I cannot redeem it.\n\nPlease assist.`
  )
  return `https://wa.me/${WA_SUPPORT_NUMBER}?text=${text}`
}

export async function logSupportThenOpenWa(v, pin) {
  try {
    await Support.log({
      user_pin: pin, voucher_id: v.id, brand: v.brand, title: v.title, code: v.code,
      issue: 'code-not-working', channel: 'whatsapp',
    })
  } catch { /* ignore */ }
  window.open(buildWaHelpUrl(v), '_blank', 'noopener,noreferrer')
}

export function VoucherCard({ v, onCopy, onHowTo, onDelete, onShare, onUnshare, pin }) {
  const dleft = daysUntil(v.expiry)
  const endingSoon = dleft != null && dleft <= 7 && dleft >= 0
  return (
    <div className="ticket p-4 page-enter" data-testid={`voucher-${v.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-display font-bold text-ink-900 text-base truncate">{v.brand}</span>
            {v.parent_company && v.parent_company !== v.brand ? <Tag tone="neutral">{v.parent_company}</Tag> : null}
          </div>
          <p className="text-sm text-ink-700 leading-snug">{v.title}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {v.value ? <span className="text-emerald-800 font-display font-bold text-sm">{fmtINR(v.value)} off</span> : null}
            {v.expiry ? (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${endingSoon ? 'text-terracotta-700' : 'text-ink-500'}`}>
                <Clock className="w-3 h-3" />
                {endingSoon ? `${dleft} day${dleft === 1 ? '' : 's'} left` : `Expires ${fmtDate(v.expiry)}`}
              </span>
            ) : null}
            {v.is_sharing ? <Tag tone="emerald">Shared</Tag> : null}
          </div>
        </div>
        {v.code ? <div className="code-box text-xs whitespace-nowrap">{v.code}</div> : null}
      </div>

      <div className="mt-3 pt-3 border-t border-dashed border-ink-200 flex items-center gap-2">
        {v.code ? (
          <button data-testid={`copy-${v.id}`} onClick={() => onCopy(v)} className="flex-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-full active:scale-95 transition flex items-center justify-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy code
          </button>
        ) : null}
        <button data-testid={`howto-${v.id}`} onClick={() => onHowTo(v)} className="flex-1 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 py-2 rounded-full active:scale-95 transition flex items-center justify-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> How to redeem
        </button>
        <button data-testid={`share-${v.id}`} onClick={() => v.is_sharing ? onUnshare(v) : onShare(v)} className="text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center">
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <a
          data-testid={`wa-help-${v.id}`}
          href={buildWaHelpUrl(v)}
          onClick={(e) => { if (pin) { e.preventDefault(); logSupportThenOpenWa(v, pin) } }}
          target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center"
          title="Get help on WhatsApp"
        >
          <MessageSquareText className="w-3.5 h-3.5" />
        </a>
        <button data-testid={`delete-${v.id}`} onClick={() => onDelete(v)} className="text-xs font-semibold text-terracotta-700 bg-terracotta-50 hover:bg-terracotta-50 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function MembershipCard({ m, onUpdateSavings }) {
  const kind = m.membership_kind || 'asset'
  const isAsset = kind === 'asset'
  const fee = m.fee_paid || 0
  const saved = m.savings_realized || 0
  const progress = fee > 0 ? Math.min(100, (saved / fee) * 100) : 0
  const breakEven = saved >= fee && fee > 0

  // Time-based metrics (computed server-side in /memberships/roi, but we
  // recompute locally as a graceful fallback for old records without dates)
  const daysRemaining = (typeof m.days_remaining === 'number') ? m.days_remaining : null
  const daysTotal = (typeof m.days_total === 'number') ? m.days_total : null
  const daysPct = (typeof m.days_elapsed_pct === 'number') ? m.days_elapsed_pct : null
  const costPerDay = (typeof m.cost_per_day === 'number') ? m.cost_per_day : null
  const expiringSoon = !!m.expiring_soon
  const expired = !!m.expired

  return (
    <div className="rounded-3xl border border-ink-200 p-5 bg-gradient-to-br from-ink-900 to-ink-800 text-white shadow-card overflow-hidden relative page-enter" data-testid={`membership-${m.id}`}>
      <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-3 relative">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-bold tracking-[0.18em] text-white/60">{isAsset ? 'Retail / Asset' : 'Subscription'}</p>
          <h3 className="font-display text-xl font-bold mt-1">{m.brand}</h3>
          {m.parent_company && m.parent_company !== m.brand ? (
            <p className="text-[11px] text-white/60 mt-0.5">By {m.parent_company}</p>
          ) : null}
        </div>
        <Tag tone={expired ? 'red' : expiringSoon ? 'gold' : (isAsset ? 'gold' : 'neutral')}>
          {expired ? 'Expired' : expiringSoon ? `${daysRemaining}d left` : (isAsset ? 'ROI' : 'Renews')}
        </Tag>
      </div>

      <p className="text-sm text-white/80 mt-2">{m.title}</p>

      {/* Days-remaining progress bar — visible for any membership with dates */}
      {daysTotal !== null && daysRemaining !== null ? (
        <div className="mt-4 space-y-1.5" data-testid={`days-remaining-${m.id}`}>
          <div className="flex justify-between text-[11px] text-white/70">
            <span>
              {expired ? 'Expired' : `${daysRemaining} of ${daysTotal} days left`}
            </span>
            {costPerDay !== null ? <span data-testid={`cost-per-day-${m.id}`}>₹{costPerDay.toFixed(2)}/day</span> : null}
          </div>
          <div className="h-1.5 w-full bg-white/15 rounded-full overflow-hidden">
            <div
              data-testid={`days-progress-bar-${m.id}`}
              className={`h-full rounded-full transition-all ${expired ? 'bg-terracotta-500' : expiringSoon ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, daysPct || 0)}%` }}
            />
          </div>
        </div>
      ) : null}

      {isAsset ? (
        <div className="mt-5 space-y-2 relative">
          <div className="flex justify-between text-xs">
            <span className="text-white/70">Break-even (savings vs fee)</span>
            <span className="font-semibold">{fmtINR(saved)} / {fmtINR(fee)}</span>
          </div>
          <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${breakEven ? 'bg-emerald-500' : 'bg-gold-500'}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-white/70">
              {breakEven ? 'Worth renewing — saved more than fee' : progress >= 60 ? 'On track — keep using' : 'Needs more usage to break-even'}
            </p>
            <button data-testid={`log-savings-${m.id}`} onClick={() => onUpdateSavings(m)} className="text-[11px] font-semibold text-gold-100 underline">Log savings</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 relative">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/70">Next renewal</span>
            <span className="font-semibold">{fmtDate(m.expiry) || '—'}</span>
          </div>
          <p className="text-[11px] text-white/70 mt-2">Content subscription — ROI tracked via time/cost-per-day above</p>
        </div>
      )}
    </div>
  )
}
