import React, { useEffect, useState } from 'react'
import { History, Sparkles, IndianRupee, Share2 } from 'lucide-react'
import { Vouchers, Membership } from '../lib/api'
import { VoucherCard } from '../components/Cards'
import { Empty } from '../components/ui'

/**
 * Redemption History — shows all vouchers/memberships marked as redeemed
 * with a hero "Total saved" tally + by-owner breakdown.
 */
export default function HistoryScreen({ pin, refreshKey, toast, bumpRefresh, openHowTo }) {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [memberStatus, setMemberStatus] = useState(null)  // for referral code
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [list, s, m] = await Promise.all([
        Vouchers.list(pin, undefined, 'redeemed').catch(() => []),
        Vouchers.savingsStats(pin).catch(() => null),
        Membership.status(pin).catch(() => null),
      ])
      setItems(Array.isArray(list) ? list : [])
      setStats(s || null)
      setMemberStatus(m || null)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[History] failed', e)
      setItems([]); setStats(null); setMemberStatus(null)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, refreshKey])

  const handleUnredeem = async (v) => {
    try {
      await Vouchers.unredeem(v.id)
      toast('Moved back to active')
      bumpRefresh?.()
    } catch {
      toast('Failed to undo')
    }
  }

  const handleDelete = async (v) => {
    if (!window.confirm('Delete this redeemed voucher permanently? This cannot be undone.')) return
    try {
      await Vouchers.remove(v.id)
      toast('Deleted')
      bumpRefresh?.()
    } catch {
      toast('Delete failed')
    }
  }

  /**
   * Share savings achievement via Web Share API (mobile-native sheet) or clipboard fallback.
   * Indians LOVE sharing money wins on WhatsApp — this is zero-cost viral acquisition.
   */
  const handleShare = async () => {
    if (!stats || (stats.total_saved || 0) <= 0) {
      toast('Mark a voucher as Used first — then share your savings!')
      return
    }
    const yearAmt = Math.round(stats.this_year_saved || 0).toLocaleString('en-IN')
    const allAmt = Math.round(stats.total_saved || 0).toLocaleString('en-IN')
    const count = stats.count_this_year || 0
    const year = stats.current_year || new Date().getFullYear()
    const ref = memberStatus?.referral_code  // only present for Pro members
    const link = ref
      ? `https://www.perkworth.com/?ref=${ref}`
      : 'https://www.perkworth.com'
    const refLine = ref
      ? `\n\nUse my code *${ref}* when upgrading to Pro — both of us get 3 months FREE 🎁`
      : ''
    const message =
      `Saved ₹${yearAmt} in ${year} with PerkWorth! 🎉\n\n` +
      `${count} ${count === 1 ? 'voucher' : 'vouchers'} redeemed, ₹${allAmt} all-time.\n` +
      `All my coupons, points & family memberships — tracked in one app.${refLine}\n\n` +
      `Try it free → ${link}`
    const shareData = {
      title: 'My PerkWorth Savings',
      text: message,
      url: link,
    }
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData)
        toast('Thanks for sharing 💚')
      } else {
        // Desktop / unsupported — copy to clipboard
        await navigator.clipboard.writeText(message)
        toast('Copied to clipboard — paste anywhere!')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        // user cancelled = normal, not an error
        toast('Share failed — try again')
      }
    }
  }

  return (
    <>
      <header className="px-5 pt-6 pb-3 flex items-center gap-2">
        <History className="w-5 h-5 text-emerald-800" />
        <h1 className="font-display font-bold text-xl text-ink-900">Redemption History</h1>
      </header>

      <main className="px-5 pb-32 space-y-4">
        {/* Stats hero */}
        <section
          data-testid="savings-hero"
          className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-emerald-800 via-emerald-900 to-ink-900 text-white border border-emerald-900/40"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-100/80">Saved with PerkWorth</p>
            <div className="flex items-baseline gap-1.5 mt-1.5">
              <span className="font-display font-bold text-4xl tabular-nums" data-testid="total-saved">
                ₹{Math.round(stats?.total_saved || 0).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-emerald-100/70 ml-1">all-time</span>
            </div>
            <p className="text-[12px] text-white/80 mt-1.5" data-testid="year-saved">
              <strong className="text-gold-300">₹{Math.round(stats?.this_year_saved || 0).toLocaleString('en-IN')}</strong> saved in {stats?.current_year || new Date().getFullYear()} ({stats?.count_this_year || 0} {(stats?.count_this_year || 0) === 1 ? 'voucher' : 'vouchers'})
            </p>

            {/* Share button — only render when there's something to brag about */}
            {(stats?.total_saved || 0) > 0 ? (
              <button
                data-testid="share-savings"
                onClick={handleShare}
                className="mt-4 inline-flex items-center gap-2 bg-gold-500 hover:bg-gold-400 text-ink-900 text-xs font-bold uppercase tracking-wide px-4 py-2.5 rounded-full active:scale-95 transition shadow-md"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share your savings
              </button>
            ) : null}

            {/* Per-owner breakdown */}
            {stats?.by_owner?.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2" data-testid="owner-breakdown">
                {stats.by_owner.slice(0, 6).map(o => (
                  <div key={o.owner} className="bg-white/8 backdrop-blur-sm rounded-2xl px-3 py-2 border border-white/15 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white/20 grid place-items-center text-white text-[11px] font-bold border border-white/25 shrink-0">
                      {o.owner === 'Self' ? '🪞' : (o.owner[0] || '?').toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-white/90 truncate">{o.owner}</p>
                      <p className="text-[10px] text-emerald-100/80 leading-tight">₹{Math.round(o.saved).toLocaleString('en-IN')} · {o.count}×</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* Redeemed list */}
        <section>
          <h2 className="text-[11px] font-bold text-ink-500 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Redeemed vouchers
          </h2>
          {loading ? (
            <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-28 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <Empty
              title="Nothing redeemed yet"
              sub="Tap the green 'Used' button on any voucher card to log a redemption. The savings show up here."
              icon={<IndianRupee className="w-6 h-6" />}
              testid="empty-history"
            />
          ) : (
            <div className="space-y-3">
              {items.map(v => (
                <VoucherCard
                  key={v.id}
                  v={v}
                  pin={pin}
                  onHowTo={openHowTo}
                  onCopy={() => {}}
                  onShare={() => {}}
                  onUnshare={() => {}}
                  onUnredeem={handleUnredeem}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
