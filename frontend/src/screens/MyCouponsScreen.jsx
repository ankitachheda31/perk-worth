import React, { useEffect, useState } from 'react'
import { Plus, Ticket } from 'lucide-react'
import { Empty, TopBar } from '../components/ui'
import { PtrIndicator } from '../components/widgets'
import { VoucherCard, MembershipCard } from '../components/Cards'
import { Vouchers, Memberships, Circle } from '../lib/api'
import { getProfile } from '../lib/store'
import { fmtINR } from '../lib/format'
import usePullToRefresh from '../lib/usePullToRefresh'

export default function MyCouponsScreen({ pin, onProfileClick, onOpenAdd, toast, refreshKey, openHowTo, openShareSheet, setRefreshKey, bumpRefresh }) {
  const [tab, setTab] = useState('all')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [roi, setRoi] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const list = await Vouchers.list(pin, tab === 'all' ? undefined : tab)
      setItems(list)
      if (tab === 'memberships' || tab === 'all') {
        try { setRoi(await Memberships.roi(pin)) } catch { /* ignore */ }
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, tab, refreshKey])

  const { pullY, refreshing } = usePullToRefresh(async () => { await load(); bumpRefresh?.() })

  const handleCopy = async (v) => { if (!v.code) return; try { await navigator.clipboard.writeText(v.code); toast(`Copied ${v.code}`) } catch { toast('Copy failed') } }
  const handleDelete = async (v) => { await Vouchers.remove(v.id); toast('Deleted'); load(); setRefreshKey(k => k + 1) }
  const handleUnshare = async (v) => { await Circle.unshare(v.id, pin); toast('Stopped sharing'); load() }

  const logSavings = async (m) => {
    // If benefit_rate is configured, prompt for spend amount; backend computes savings automatically.
    // Otherwise fall back to legacy direct-savings entry.
    if (m.benefit_rate && m.benefit_rate > 0) {
      const val = prompt(`Log a purchase you made under this membership (₹).\nWe'll auto-compute savings at ${(m.benefit_rate * 100).toFixed(0)}% rate.`)
      if (!val || Number(val) <= 0) return
      try {
        const updated = await Memberships.logSpend(m.id, { user_pin: pin, amount: Number(val) })
        const newSavings = (updated.savings_realized || 0)
        toast(`Logged ₹${Number(val).toLocaleString('en-IN')} spend · saved ₹${(newSavings - (m.cumulative_savings || m.savings_realized || 0)).toFixed(0)}`)
        load(); setRefreshKey(k => k + 1)
      } catch { toast('Failed to log purchase') }
    } else {
      const val = prompt('Log savings amount (₹):')
      if (!val) return
      await Vouchers.update(m.id, { savings_realized: (m.savings_realized || 0) + Number(val) })
      toast(`Logged ${fmtINR(Number(val))}`); load()
    }
  }

  return (
    <>
      <PtrIndicator pullY={pullY} refreshing={refreshing} />
      <TopBar
        title="My Coupons"
        right={
          <button data-testid="profile-avatar-coupons" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
            {(getProfile().name || 'M')[0].toUpperCase()}
          </button>
        }
      />
      <main className="px-5 space-y-5">
        <div data-testid="coupon-tabs" className="flex gap-1.5 p-1 bg-white border border-ink-200 rounded-full">
          <button data-testid="tab-all" className={`pill-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
          <button data-testid="tab-memberships" className={`pill-tab ${tab === 'memberships' ? 'active' : ''}`} onClick={() => setTab('memberships')}>Memberships</button>
          <button data-testid="tab-vouchers" className={`pill-tab ${tab === 'vouchers' ? 'active' : ''}`} onClick={() => setTab('vouchers')}>Vouchers</button>
        </div>

        <button data-testid="add-coupon" onClick={() => onOpenAdd()} className="w-full bg-white border-2 border-dashed border-ink-200 hover:border-emerald-700 hover:bg-emerald-50/30 py-4 rounded-2xl flex items-center justify-center gap-2 text-emerald-800 font-semibold transition active:scale-[0.98]">
          <Plus className="w-4 h-4" /> Add new
        </button>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <Empty title="Nothing here yet" sub="Add your first voucher or membership card." icon={<Ticket className="w-6 h-6" />} testid="empty-coupons" />
        ) : (
          <div className="space-y-3">
            {items.map(v => v.category === 'memberships' ? (
              <MembershipCard key={v.id} m={roi.find(r => r.id === v.id) || v} onUpdateSavings={logSavings} />
            ) : (
              <VoucherCard
                key={v.id} v={v} pin={pin}
                onCopy={handleCopy} onHowTo={openHowTo}
                onDelete={handleDelete}
                onShare={() => openShareSheet(v)}
                onUnshare={handleUnshare}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
