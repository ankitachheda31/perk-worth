import React, { useEffect, useState } from 'react'
import { Search, Plus, Star, ChevronRight, Bell, BadgeCheck } from 'lucide-react'
import { Card, Empty, TopBar } from '../components/ui'
import { PtrIndicator, VoiceMicButton } from '../components/widgets'
import { VoucherCard } from '../components/Cards'
import SearchResult from '../components/SearchResult'
import { Vouchers } from '../lib/api'
import { getProfile } from '../lib/store'
import { fmtDate } from '../lib/format'
import usePullToRefresh from '../lib/usePullToRefresh'

export default function HomeScreen({ pin, onProfileClick, memberStatus, onOpenAdd, toast, refreshKey, openHowTo, onOpenNotifs, unread, bumpRefresh }) {
  const [ending, setEnding] = useState([])
  const [allItems, setAllItems] = useState([])  // for Household Wallet Summary
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const [data, fullList] = await Promise.all([
        Vouchers.endingSoon(pin, 7).catch(() => []),
        Vouchers.list(pin).catch(() => []),
      ])
      setEnding(Array.isArray(data) ? data : [])
      setAllItems(Array.isArray(fullList) ? fullList : [])
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[HomeScreen] failed to load', e)
      setEnding([]); setAllItems([])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, refreshKey])

  const { pullY, refreshing } = usePullToRefresh(async () => { await load(); bumpRefresh?.() })

  // Household Wallet Summary — only meaningful with 2+ distinct owners
  const householdSummary = React.useMemo(() => {
    if (!allItems.length) return null
    const perOwner = new Map()
    let totalValue = 0
    for (const v of allItems) {
      const o = v.owner || 'Self'
      const value = (typeof v.value === 'number' && v.value > 0) ? v.value : 0
      totalValue += value
      const cur = perOwner.get(o) || { count: 0, value: 0 }
      cur.count += 1; cur.value += value
      perOwner.set(o, cur)
    }
    const owners = Array.from(perOwner.entries()).map(([name, stats]) => ({ name, ...stats }))
    owners.sort((a, b) => b.value - a.value)
    return { owners, totalValue, totalCount: allItems.length }
  }, [allItems])

  const handleCopy = async (v) => {
    if (!v.code) return
    try { await navigator.clipboard.writeText(v.code); toast(`Copied ${v.code}`) } catch { toast('Copy failed') }
  }

  return (
    <>
      <PtrIndicator pullY={pullY} refreshing={refreshing} />
      <TopBar
        title="PerkWorth"
        subtitle="Voucher-first wallet"
        right={
          <>
            <button data-testid="bell-button" onClick={onOpenNotifs} className="relative w-10 h-10 rounded-full bg-white border border-ink-200 grid place-items-center active:scale-95 transition">
              <Bell className="w-4 h-4 text-ink-700" />
              {unread > 0 ? (
                <span data-testid="bell-badge" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{unread > 9 ? '9+' : unread}</span>
              ) : null}
            </button>
            <button data-testid="profile-avatar" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
              {(getProfile().name || 'M')[0].toUpperCase()}
            </button>
          </>
        }
      />
      <main className="px-5 space-y-6 pt-2">
        <section data-testid="smart-search">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 w-4 h-4" />
            <input
              data-testid="search-input"
              type="text"
              placeholder="Search brand (e.g. Croma → Tata)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-white border border-ink-200 rounded-full pl-11 pr-12 py-3 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-200 transition"
            />
            <VoiceMicButton onText={(t) => setQ(t)} />
          </div>
          <SearchResult q={q} pin={pin} onOpenVoucher={(u) => openHowTo(u)} />
        </section>

        {/* Household Wallet Summary — surfaces multi-person value, only shows when family has 2+ owners */}
        {householdSummary && householdSummary.owners.length >= 2 ? (
          <section data-testid="household-summary" className="relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-emerald-900 via-emerald-800 to-ink-900 text-white border border-emerald-900/40">
            <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-100/80">Family Wallet</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="font-display font-bold text-3xl" data-testid="household-total-value">
                  ₹{Math.round(householdSummary.totalValue).toLocaleString('en-IN')}
                </span>
                <span className="text-xs text-white/70">
                  across {householdSummary.totalCount} {householdSummary.totalCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <p className="text-[12px] text-white/80 mt-1" data-testid="household-owner-count">
                Tracked for <strong>{householdSummary.owners.length}</strong> {householdSummary.owners.length === 1 ? 'person' : 'people'} in your household
              </p>
              <div className="flex items-center gap-2 mt-4 -ml-1 overflow-x-auto no-scrollbar">
                {householdSummary.owners.slice(0, 8).map((o, i) => (
                  <div key={o.name} data-testid={`household-owner-${o.name.toLowerCase().replace(/\s+/g, '-')}`} className="flex flex-col items-center gap-1 px-2 py-1.5 bg-white/10 backdrop-blur-sm rounded-2xl border border-white/15 min-w-[68px]">
                    <div className="w-7 h-7 rounded-full bg-white/20 grid place-items-center text-white text-[11px] font-bold border border-white/25">
                      {o.name === 'Self' ? '🪞' : (o.name[0] || '?').toUpperCase()}
                    </div>
                    <span className="text-[9px] font-bold text-white/90 leading-tight text-center whitespace-nowrap">{o.name}</span>
                    <span className="text-[9px] text-emerald-100/70 leading-none">{o.count}×</span>
                  </div>
                ))}
                {householdSummary.owners.length > 8 ? (
                  <div className="text-[10px] text-white/60 px-1 font-semibold">+{householdSummary.owners.length - 8} more</div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {!memberStatus?.active ? (
          <button
            data-testid="upsell-pro"
            onClick={() => onOpenAdd('upsell')}
            className="w-full relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-ink-900 via-ink-800 to-emerald-900 text-left text-white active:scale-[0.99] transition"
          >
            <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-gold-500/20 blur-2xl" />
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-gold-400" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold-100">PerkWorth Pro</span>
            </div>
            <p className="font-display font-bold text-xl leading-tight">Unlock unlimited vouchers, family sharing & ROI tracking</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-white/80">₹99 / 3 months</span>
              <span className="inline-flex items-center gap-1 text-gold-200 text-xs font-bold">Upgrade <ChevronRight className="w-4 h-4" /></span>
            </div>
          </button>
        ) : (
          <Card className="p-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gold-100 grid place-items-center text-gold-600"><BadgeCheck className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Pro Member</p>
              <p className="font-display font-bold text-ink-900 leading-tight">{memberStatus.plan}</p>
              <p className="text-[11px] text-ink-500">Renews {fmtDate(memberStatus.expires_at)}</p>
            </div>
          </Card>
        )}

        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-display text-lg font-bold text-ink-900">Ending soon</h2>
            <span className="text-[11px] text-ink-500 font-semibold">Next 7 days</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}
            </div>
          ) : ending.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="font-display font-semibold text-ink-800">All clear ✦</p>
              <p className="text-sm text-ink-500 mt-1">No vouchers expiring in the next 7 days.</p>
              <button data-testid="cta-add-first" onClick={() => onOpenAdd()} className="mt-3 text-sm text-emerald-800 font-bold inline-flex items-center gap-1">Add a voucher <ChevronRight className="w-4 h-4" /></button>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="ending-soon-list">
              {ending.map(v => (
                <VoucherCard key={v.id} v={v} onCopy={handleCopy} onHowTo={openHowTo} onDelete={() => {}} onShare={() => {}} onUnshare={() => {}} />
              ))}
            </div>
          )}
        </section>

        <button data-testid="add-from-home" onClick={() => onOpenAdd()} className="w-full bg-emerald-800 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold shadow-emerald active:scale-[0.98] transition">
          <Plus className="w-4 h-4" /> Add new voucher
        </button>
      </main>
    </>
  )
}
