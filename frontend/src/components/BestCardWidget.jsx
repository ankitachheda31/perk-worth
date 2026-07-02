import React, { useEffect, useState } from 'react'
import { CreditCard, TrendingUp } from 'lucide-react'
import { Cards } from '../lib/api'

/**
 * Brand-category → card spend-category mapping. Deliberately narrow — only
 * categories we can actually optimise a card recommendation for. Anything
 * unmapped renders nothing.
 */
const CATEGORY_MAP = {
  grocery: 'groceries',
  'quick-commerce': 'groceries',
  'food-delivery': 'food_delivery',
  'meat-delivery': 'food_delivery',
  ecommerce: 'online_shopping',
  'ecommerce-baby': 'online_shopping',
  'super-app': 'online_shopping',
  fashion: 'online_shopping',
  'fashion-ecommerce': 'online_shopping',
  'fashion-ethnic': 'online_shopping',
  'fashion-luxury': 'online_shopping',
  'beauty-ecommerce': 'online_shopping',
  'furniture-ecommerce': 'online_shopping',
  'electronics-retail': 'online_shopping',
  electronics: 'online_shopping',
  jewellery: 'online_shopping',
  'oil-gas': 'fuel',
  fuel: 'fuel',
  airline: 'travel',
  hospitality: 'travel',
  travel: 'travel',
  airports: 'travel',
  'ride-hailing': 'travel',
  ott: 'entertainment',
  dth: 'entertainment',
  'dth-streaming': 'entertainment',
  media: 'entertainment',
  music: 'entertainment',
  events: 'entertainment',
  sports: 'entertainment',
  fitness: 'fitness',
}

function mapCategory(brandCategory) {
  if (!brandCategory) return null
  return CATEGORY_MAP[brandCategory.toLowerCase()] || null
}

const fmtINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

/**
 * BestCardWidget — inline "Use this card for +X cashback" recommendation.
 *
 * Props:
 *   brandCategory  — brand's registry category (e.g. "grocery"). Optional —
 *                    if omitted, the widget resolves it via /api/brands/lookup.
 *   brand          — display brand name (also used to resolve category)
 *   pin            — user_pin/user_id for click attribution
 *   source         — where the widget is mounted ("voucher_card" | "add_sheet")
 *   compact        — tighter styling for use inside VoucherCard
 *
 * Renders nothing if the brand category doesn't map to a card spend category,
 * or if the API returns no cards.
 */
export default function BestCardWidget({ brandCategory, brand, pin, source = 'voucher_card', compact = false }) {
  const [resolvedCategory, setResolvedCategory] = useState(brandCategory || null)
  const [best, setBest] = useState(null)
  const [loading, setLoading] = useState(false)

  // Auto-resolve brand category from registry when only `brand` is passed
  useEffect(() => {
    if (brandCategory) { setResolvedCategory(brandCategory); return }
    if (!brand || brand.length < 2) { setResolvedCategory(null); return }
    let cancelled = false
    const base = (import.meta.env.VITE_BACKEND_URL) || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
    fetch(`${base}/api/brands/lookup?q=${encodeURIComponent(brand)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        const top = d?.results?.[0]
        setResolvedCategory(top?.category || null)
      })
      .catch(() => { if (!cancelled) setResolvedCategory(null) })
    return () => { cancelled = true }
  }, [brand, brandCategory])

  const cardCategory = mapCategory(resolvedCategory)

  useEffect(() => {
    if (!cardCategory) { setBest(null); return }
    setLoading(true)
    Cards.best(cardCategory, 10000, 1, null)
      .then((d) => {
        const top = d?.results?.[0]
        setBest(top || null)
      })
      .catch(() => setBest(null))
      .finally(() => setLoading(false))
  }, [cardCategory])

  if (!cardCategory || loading || !best) return null

  const onLearnMore = (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Fire-and-forget click attribution — never blocks navigation
    Cards.logClick({
      card_id: best.id,
      user_pin: pin,
      category: cardCategory,
      source,
    })
    window.open(best.apply_url, '_blank', 'noopener,noreferrer')
  }

  if (compact) {
    return (
      <div
        data-testid={`best-card-compact-${best.id}`}
        className="mt-2.5 -mx-1 flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-gold-50 border border-emerald-200 rounded-2xl px-3 py-2"
      >
        <CreditCard className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-ink-900 truncate">
            <span className="text-emerald-800">+{best.category_rate_pct}%</span> with {best.name}
          </p>
          <p className="text-[10px] text-ink-500 truncate">on {brand || 'this brand'} · ~{fmtINR(best.estimated_annual_reward_inr)}/yr</p>
        </div>
        <button
          onClick={onLearnMore}
          data-testid={`best-card-cta-${best.id}`}
          className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-white border border-emerald-300 rounded-full px-2.5 py-1 hover:bg-emerald-50 active:scale-95 transition shrink-0"
        >
          Get card
        </button>
      </div>
    )
  }

  return (
    <div
      data-testid={`best-card-widget-${best.id}`}
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-gold-50 p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-emerald-800 text-white grid place-items-center shrink-0">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Best card for this</p>
          <p className="text-sm font-display font-bold text-ink-900 leading-tight mt-0.5">
            {best.name}
            <span className="text-emerald-800 ml-1.5">+{best.category_rate_pct}%</span>
          </p>
          <p className="text-[11px] text-ink-600 mt-1 leading-snug">
            {best.tagline} · ~{fmtINR(best.estimated_annual_reward_inr)}/yr on this category
          </p>
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <button
          onClick={onLearnMore}
          data-testid={`best-card-cta-${best.id}`}
          className="text-[11px] font-bold uppercase tracking-wider text-white bg-emerald-800 rounded-full px-3 py-1.5 hover:bg-emerald-900 active:scale-95 transition"
        >
          Learn more →
        </button>
      </div>
    </div>
  )
}
