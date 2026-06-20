import React, { useEffect, useMemo, useState } from 'react'
import { CreditCard, ExternalLink, Sparkles, Award, Info, Check, X, Wand2 } from 'lucide-react'
import { Card, TopBar } from '../components/ui'
import { Cards as CardsApi, Spend } from '../lib/api'
import SmartSpendSheet from '../sheets/SmartSpendSheet'

const LS_CURRENT_CARD = 'perk_current_card_id'

/**
 * Credit Card Optimizer — Savings Assistant, not a sales pitch.
 *
 * User-First philosophy:
 *  1. User picks the card they CURRENTLY use (or "I don't have one").
 *  2. We only recommend cards with a HIGHER net annual value vs their current card.
 *  3. Every recommendation has a "Why we suggest this" modal explaining the math.
 *  4. When user is already on the best card → celebrate, don't pitch.
 *
 * Affiliate revenue stays — but always second to user benefit.
 */
export default function CardOptimizerScreen({ onBack, pin, toast }) {
  const [meta, setMeta] = useState({ cards: [], categories: [] })
  const [category, setCategory] = useState('online_shopping')
  const [spend, setSpend] = useState(10000)
  const [currentCardId, setCurrentCardId] = useState(() => {
    try { return localStorage.getItem(LS_CURRENT_CARD) || '' } catch { return '' }
  })
  const [bestData, setBestData] = useState(null)
  const [loadingBest, setLoadingBest] = useState(true)
  const [loadingList, setLoadingList] = useState(true)
  const [explainCard, setExplainCard] = useState(null)  // card object for "Why we suggest" modal
  const [smartOpen, setSmartOpen] = useState(false)
  const [inferredProfile, setInferredProfile] = useState(null)

  // Try to restore a previously inferred spend profile so the user doesn't have to redo SMS paste.
  useEffect(() => {
    let alive = true
    Spend.profile(pin).then((p) => { if (alive && p?.exists) setInferredProfile(p) })
    return () => { alive = false }
  }, [pin])

  // When user finishes inference, auto-set category to the top reward-eligible bucket
  // and seed the slider with their REAL monthly spend.
  const applyInferred = (profile) => {
    setInferredProfile(profile)
    const cat = profile?.recommend_category
    if (cat) {
      setCategory(cat)
      const monthly = profile.categories?.[cat]?.monthly_inr
      if (monthly && monthly > 0) {
        // Clamp slider range (2K to 1L) so wild values still fit
        setSpend(Math.max(2000, Math.min(100000, Math.round(monthly / 1000) * 1000)))
      }
    }
    toast?.('Spending profile loaded — see your picks below')
  }

  useEffect(() => {
    CardsApi.list()
      .then((d) => setMeta(d))
      .catch(() => setMeta({ cards: [], categories: [] }))
      .finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    setLoadingBest(true)
    CardsApi.best(category, spend, 3, currentCardId || null)
      .then((d) => setBestData(d || null))
      .catch(() => setBestData(null))
      .finally(() => setLoadingBest(false))
  }, [category, spend, currentCardId])

  const fmtINR = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`

  const persistCurrentCard = (id) => {
    setCurrentCardId(id)
    try { localStorage.setItem(LS_CURRENT_CARD, id || '') } catch { /* private mode */ }
  }

  const handleApply = (card, source) => {
    CardsApi.logClick({
      card_id: card.id,
      user_pin: pin,
      category,
      source,
      current_card_id: currentCardId || null,
      monthly_spend_inr: spend,
      delta_inr: card.delta_inr ?? null,
    })
    window.open(card.apply_url, '_blank', 'noopener,noreferrer')
    toast?.(`Opening ${card.name}…`)
  }

  const selectedCatLabel = useMemo(
    () => meta.categories.find((c) => c.id === category)?.label || category,
    [category, meta.categories],
  )

  const best = bestData?.results || []
  const alreadyOptimal = !!bestData?.you_are_already_optimal
  const currentCard = bestData?.current_card || null

  return (
    <>
      <TopBar
        title="Savings Assistant"
        onBack={onBack}
        subtitle="Honest card picks · we only suggest if you save more"
      />
      <main className="px-5 pb-32 space-y-4">
        {/* Hero */}
        <section
          data-testid="card-optimizer-hero"
          className="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-emerald-800 via-emerald-900 to-ink-900 text-white border border-emerald-900/40"
        >
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-100/80 inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Personalised
            </p>
            <h2 className="font-display font-bold text-2xl mt-1.5 leading-tight">
              Find a better card for <span className="text-gold-300">{selectedCatLabel}</span>
            </h2>
            <p className="text-[12px] text-white/80 mt-2">
              We compare against the card you already use. No card shown = nothing beats yours.
            </p>
          </div>
        </section>

        {/* Smart Spend Inference CTA */}
        <button
          data-testid="smart-spend-open"
          onClick={() => setSmartOpen(true)}
          className="w-full text-left rounded-3xl p-5 bg-gradient-to-br from-gold-50 via-white to-emerald-50/40 border-2 border-dashed border-gold-300 hover:border-gold-400 active:scale-[0.99] transition group"
        >
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gold-400/20 border border-gold-300 grid place-items-center shrink-0">
              <Wand2 className="w-5 h-5 text-gold-700" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold text-ink-900 text-sm leading-tight">
                {inferredProfile ? 'Refresh spend profile' : 'Auto-fill from your SMS'}
              </p>
              <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">
                {inferredProfile
                  ? `Last analyzed ${inferredProfile.transactions_parsed} txns · ₹${Math.round(inferredProfile.total_monthly_inr).toLocaleString('en-IN')}/mo. Tap to re-run with newer SMS.`
                  : 'Paste your bank/UPI SMS — we categorize your spending and pre-fill the sliders with your real data.'}
              </p>
              <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-gold-700 uppercase tracking-wider">
                <Sparkles className="w-3 h-3" /> One-tap magic
              </p>
            </div>
          </div>
        </button>

        {/* Inputs */}
        <Card className="p-5">
          <p className="text-[11px] font-bold text-ink-500 uppercase tracking-wider mb-3">
            Your spend profile
          </p>

          <label className="text-xs font-semibold text-ink-700 mb-2 block">
            What card do you use today?
          </label>
          <select
            data-testid="current-card-select"
            value={currentCardId}
            onChange={(e) => persistCurrentCard(e.target.value)}
            className="w-full bg-ink-50 border border-ink-200 rounded-2xl px-4 py-3 text-sm font-semibold text-ink-800 mb-4 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">— I don&apos;t have a card yet —</option>
            {meta.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.issuer})
              </option>
            ))}
            <option value="other">Some other card (not in this list)</option>
          </select>

          <label className="text-xs font-semibold text-ink-700 mb-2 block">
            Category
          </label>
          <div className="flex flex-wrap gap-2 mb-4" data-testid="category-chips">
            {meta.categories.map((c) => (
              <button
                key={c.id}
                data-testid={`cat-${c.id}`}
                onClick={() => setCategory(c.id)}
                className={`text-xs font-semibold px-3 py-2 rounded-full border transition active:scale-95 ${
                  category === c.id
                    ? 'bg-emerald-800 text-white border-emerald-800'
                    : 'bg-white text-ink-700 border-ink-200 hover:border-emerald-300'
                }`}
              >
                <span className="mr-1">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>

          <label className="text-xs font-semibold text-ink-700 mb-2 block">
            Monthly spend in this category:{' '}
            <span className="text-emerald-800 font-bold tabular-nums">
              {fmtINR(spend)}
            </span>
          </label>
          <input
            data-testid="spend-slider"
            type="range"
            min={2000}
            max={100000}
            step={1000}
            value={spend}
            onChange={(e) => setSpend(Number(e.target.value))}
            className="w-full accent-emerald-800"
          />
          <div className="flex justify-between text-[10px] text-ink-500 mt-1 tabular-nums">
            <span>₹2K</span>
            <span>₹1L</span>
          </div>
        </Card>

        {/* Current card baseline */}
        {currentCard && (
          <Card className="p-4 bg-ink-50/60 border-ink-200" data-testid="current-card-baseline">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-white border border-ink-200 grid place-items-center shrink-0">
                <CreditCard className="w-4 h-4 text-ink-700" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold text-ink-500 uppercase tracking-wider">Your current card</p>
                <p className="font-display font-bold text-ink-900 text-sm">{currentCard.name}</p>
                <p className="text-[11px] text-ink-600 mt-0.5">
                  {currentCard.category_rate_pct}% on {selectedCatLabel.toLowerCase()} ·{' '}
                  <span className="font-semibold">Net value {fmtINR(currentCard.net_annual_value_inr)}/yr</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Recommendations or "Already optimal" celebration */}
        <section>
          <h3 className="text-[11px] font-bold text-ink-500 uppercase tracking-wider px-1 mb-2 flex items-center gap-1.5">
            <Award className="w-3 h-3" />
            {alreadyOptimal ? 'Your card is already the best' : currentCard ? 'Cards that beat yours' : 'Top picks for your spend'}
          </h3>

          {loadingBest ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 bg-white rounded-3xl border border-ink-200 animate-pulse" />
              ))}
            </div>
          ) : alreadyOptimal ? (
            <Card className="p-6 text-center bg-emerald-50/60 border-emerald-200" data-testid="already-optimal">
              <div className="w-14 h-14 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-3">
                <Check className="w-7 h-7 text-emerald-800" strokeWidth={3} />
              </div>
              <p className="font-display font-bold text-emerald-900 text-lg">You&apos;re already on the best card 🎉</p>
              <p className="text-xs text-ink-700 mt-2 leading-relaxed max-w-xs mx-auto">
                For your {selectedCatLabel.toLowerCase()} spend of {fmtINR(spend)}/mo, no other card in our curated list gives a better net return after fees.
              </p>
            </Card>
          ) : best.length === 0 ? (
            <Card className="p-5 text-center text-sm text-ink-500" data-testid="best-empty">
              No clearly better card for this category yet.
            </Card>
          ) : (
            <div className="space-y-3" data-testid="best-cards-list">
              {best.map((c, idx) => (
                <BestCardRow
                  key={c.id}
                  card={c}
                  rank={idx + 1}
                  selectedCatLabel={selectedCatLabel}
                  hasCurrentCard={!!currentCard}
                  onExplain={() => setExplainCard({ card: c, currentCard, category: selectedCatLabel, spend })}
                  onApply={() => handleApply(c, 'best')}
                />
              ))}
            </div>
          )}
        </section>

        {/* Full catalog */}
        <section>
          <h3 className="text-[11px] font-bold text-ink-500 uppercase tracking-wider px-1 mb-2 mt-6 flex items-center gap-1.5">
            <CreditCard className="w-3 h-3" /> All curated cards ({meta.cards.length})
          </h3>
          {loadingList ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3" data-testid="all-cards-list">
              {meta.cards.map((c) => (
                <CatalogCardRow
                  key={c.id}
                  card={c}
                  isMine={c.id === currentCardId}
                  onSetMine={() => persistCurrentCard(c.id === currentCardId ? '' : c.id)}
                  onApply={() => handleApply(c, 'list')}
                />
              ))}
            </div>
          )}
          <p className="text-[10px] text-ink-400 text-center mt-4 leading-relaxed">
            Rates reflect publicly listed program terms. Card terms can change anytime — we recalibrate quarterly.
            PerkWorth may earn a referral fee at no cost to you when you apply via these links. We only suggest cards that put more money in your pocket.
          </p>
        </section>
      </main>

      {explainCard && (
        <ExplainModal
          {...explainCard}
          onClose={() => setExplainCard(null)}
        />
      )}

      <SmartSpendSheet
        open={smartOpen}
        onClose={() => setSmartOpen(false)}
        pin={pin}
        toast={toast}
        onApplied={applyInferred}
      />
    </>
  )
}

function BestCardRow({ card, rank, selectedCatLabel, hasCurrentCard, onExplain, onApply }) {
  const fmtINR = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
  return (
    <Card className="p-5" data-testid={`best-card-${card.id}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-2xl grid place-items-center font-display font-bold text-sm shrink-0 ${
          rank === 1
            ? 'bg-gold-500 text-ink-900'
            : rank === 2
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-ink-100 text-ink-700'
        }`}>
          {rank === 1 ? '🏆' : `#${rank}`}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-ink-900 text-sm leading-tight">{card.name}</p>
          <p className="text-[11px] text-ink-500">{card.issuer}</p>
          <p className="text-[12px] text-ink-700 mt-1.5 leading-snug">{card.tagline}</p>
        </div>
        <button
          data-testid={`explain-${card.id}`}
          onClick={onExplain}
          className="w-8 h-8 shrink-0 rounded-full bg-ink-50 border border-ink-200 grid place-items-center text-ink-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-800 active:scale-95 transition"
          aria-label="Why we suggest this"
          title="Why we suggest this"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={`Rate on ${selectedCatLabel.toLowerCase()}`} value={`${card.category_rate_pct}%`} tone="emerald" />
        <Stat label="Annual reward" value={fmtINR(card.estimated_annual_reward_inr)} tone="gold" />
        <Stat label="Net value" value={fmtINR(card.net_annual_value_inr)} tone={card.net_annual_value_inr > 0 ? 'emerald' : 'ink'} />
      </div>

      {hasCurrentCard && card.delta_inr != null && card.delta_inr > 0 && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5">
          <Sparkles className="w-3 h-3" />
          You save {fmtINR(card.delta_inr)} more per year
        </div>
      )}

      <div className="mt-3 text-[11px] text-ink-600 leading-relaxed">
        <span className="font-semibold text-ink-700">Annual fee:</span>{' '}
        {card.annual_fee_inr === 0 ? (
          <span className="text-emerald-800 font-bold">LIFETIME FREE</span>
        ) : card.fee_waived ? (
          <span>
            {fmtINR(card.annual_fee_inr)} —{' '}
            <span className="text-emerald-800 font-bold">waived at your spend</span>
          </span>
        ) : (
          <>
            {fmtINR(card.annual_fee_inr)} (waived at {fmtINR(card.fee_waiver_spend_inr)} spend/yr)
          </>
        )}
      </div>

      <button
        data-testid={`apply-${card.id}`}
        onClick={onApply}
        className="mt-4 w-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wide px-4 py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2"
      >
        Apply on issuer site
        <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </Card>
  )
}

function CatalogCardRow({ card, isMine, onSetMine, onApply }) {
  return (
    <Card className={`p-4 ${isMine ? 'border-emerald-300 bg-emerald-50/40' : ''}`} data-testid={`catalog-card-${card.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display font-bold text-ink-900 text-sm leading-tight">{card.name}</p>
            {isMine && (
              <span className="text-[9px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 rounded-full px-2 py-0.5 uppercase">
                Mine
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-500 mb-1.5">{card.issuer}</p>
          <p className="text-[11px] text-ink-700 leading-snug">{card.tagline}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {(card.best_for || []).slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            data-testid={`set-mine-${card.id}`}
            onClick={onSetMine}
            className="text-[10px] font-semibold text-ink-700 px-2.5 py-1.5 rounded-full border border-ink-200 bg-white hover:bg-ink-50 active:scale-95 transition"
          >
            {isMine ? 'Not mine' : 'I own this'}
          </button>
          <button
            data-testid={`catalog-apply-${card.id}`}
            onClick={onApply}
            className="text-[11px] font-bold text-emerald-800 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition inline-flex items-center gap-1"
          >
            Apply
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>
    </Card>
  )
}

function Stat({ label, value, tone = 'ink' }) {
  const toneCls = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    gold: 'bg-gold-50 border-gold-200 text-ink-900',
    ink: 'bg-ink-50 border-ink-200 text-ink-700',
  }[tone] || 'bg-ink-50 border-ink-200 text-ink-700'
  return (
    <div className={`rounded-2xl px-2.5 py-2 border ${toneCls}`}>
      <p className="text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="font-display font-bold text-sm tabular-nums leading-tight mt-0.5">{value}</p>
    </div>
  )
}

function ExplainModal({ card, currentCard, category, spend, onClose }) {
  const fmtINR = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`
  const annualSpend = spend * 12
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      data-testid="explain-modal"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-700">Why we suggest this</p>
            <h2 className="font-display font-bold text-xl text-ink-900 mt-1 leading-tight">{card.name}</h2>
          </div>
          <button onClick={onClose} data-testid="explain-close" className="w-9 h-9 rounded-full bg-ink-50 grid place-items-center text-ink-600 hover:bg-ink-100 active:scale-95 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-ink-700 leading-relaxed mb-4">
          We&apos;re a savings assistant — we only suggest a card if it puts <strong>more money in your pocket</strong> than what you use today. Here&apos;s the math.
        </p>

        <div className="bg-ink-50 rounded-2xl p-4 space-y-2 mb-4">
          <Row label={`Your ${category.toLowerCase()} spend`} value={`${fmtINR(spend)} / month`} />
          <Row label="Over 12 months" value={fmtINR(annualSpend)} />
          <hr className="border-ink-200" />
          <Row label={`Reward rate on ${card.name}`} value={`${card.category_rate_pct}%`} bold />
          <Row label="Annual reward earned" value={fmtINR(card.estimated_annual_reward_inr)} bold />
          <Row
            label="Annual fee"
            value={
              card.annual_fee_inr === 0
                ? 'Lifetime FREE'
                : card.fee_waived
                ? `${fmtINR(card.annual_fee_inr)} (waived)`
                : `−${fmtINR(card.annual_fee_inr)}`
            }
          />
          <hr className="border-ink-200" />
          <Row label="Net annual value" value={fmtINR(card.net_annual_value_inr)} bold tone="emerald" />
        </div>

        {currentCard && card.delta_inr != null && card.delta_inr > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4" data-testid="vs-current-block">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1.5">vs your current card</p>
            <p className="text-sm text-ink-800 leading-relaxed">
              Your <strong>{currentCard.name}</strong> earns {fmtINR(currentCard.net_annual_value_inr)} on the same spend.
            </p>
            <p className="font-display font-bold text-xl text-emerald-900 mt-2">
              You&apos;d save {fmtINR(card.delta_inr)} more per year
            </p>
          </div>
        )}

        <details className="text-xs text-ink-600 leading-relaxed">
          <summary className="font-semibold text-ink-700 cursor-pointer">What&apos;s NOT counted</summary>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Welcome bonuses (often have spend thresholds or expire).</li>
            <li>Capped accelerator rewards (e.g. &ldquo;5% only up to ₹500/mo&rdquo;).</li>
            <li>Lounge access, insurance perks, and other non-cash benefits.</li>
            <li>GST on annual fee. The actual net may be ~18% lower.</li>
          </ul>
          <p className="mt-3">
            Bank Terms &amp; Conditions always override our estimates. Card terms can change anytime — we recalibrate quarterly.
          </p>
        </details>
      </div>
    </div>
  )
}

function Row({ label, value, bold = false, tone = 'ink' }) {
  const toneCls = tone === 'emerald' ? 'text-emerald-900' : 'text-ink-800'
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-600">{label}</span>
      <span className={`text-sm tabular-nums ${bold ? 'font-display font-bold' : 'font-semibold'} ${toneCls}`}>{value}</span>
    </div>
  )
}
