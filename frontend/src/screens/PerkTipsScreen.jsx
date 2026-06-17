import React, { useEffect, useState } from 'react'
import { Sparkles, ArrowUpRight, AlertTriangle, Clock, TrendingUp, Lock, Star } from 'lucide-react'
import { Card, GhostButton, PrimaryButton, TopBar, Empty } from '../components/ui'
import { Optimizer } from '../lib/api'

const KIND_STYLE = {
  urgent: { tone: 'rose', label: 'Urgent', icon: Clock },
  warn: { tone: 'amber', label: 'Heads up', icon: AlertTriangle },
  transfer: { tone: 'emerald', label: 'Transfer', icon: ArrowUpRight },
  stack: { tone: 'indigo', label: 'Stack', icon: TrendingUp },
  redeem: { tone: 'emerald', label: 'Redeem', icon: Sparkles },
}

const TONE_CLS = {
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
}

function TipCard({ tip, gated, onUnlock }) {
  const style = KIND_STYLE[tip.kind] || KIND_STYLE.redeem
  const Icon = style.icon
  return (
    <Card className={`p-5 relative overflow-hidden ${gated ? 'opacity-95' : ''}`} data-testid={`tip-${tip.id}`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full grid place-items-center border ${TONE_CLS[style.tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${TONE_CLS[style.tone]}`}>{style.label}</span>
            {tip.brand ? <span className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider">{tip.brand}</span> : null}
            {tip.source === 'llm' && <span className="text-[9px] text-ink-400 font-mono">AI</span>}
          </div>
          <p className="font-display font-bold text-ink-900 leading-tight">{tip.title}</p>
          <p className={`text-sm text-ink-700 mt-1.5 leading-relaxed ${gated ? 'blur-sm select-none pointer-events-none' : ''}`}>{tip.body}</p>
          {tip.potential_gain_inr ? (
            <p className={`text-xs font-bold text-emerald-800 mt-2 ${gated ? 'blur-[3px] select-none' : ''}`}>
              + ₹{Number(tip.potential_gain_inr).toLocaleString('en-IN')} potential gain
            </p>
          ) : null}
        </div>
      </div>
      {gated && (
        <button
          onClick={onUnlock}
          data-testid={`tip-unlock-${tip.id}`}
          className="absolute inset-0 grid place-items-center bg-white/40 backdrop-blur-[2px]"
        >
          <span className="inline-flex items-center gap-2 bg-ink-900 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg">
            <Lock className="w-3.5 h-3.5" /> Unlock with Pro
          </span>
        </button>
      )}
    </Card>
  )
}

function FreeVsPro({ onUpgrade }) {
  const rows = [
    { feature: 'Save vouchers manually', free: true, pro: true },
    { feature: 'AI scan & SMS extract', free: 'limited', pro: 'unlimited' },
    { feature: 'Family Circle (1 member)', free: true, pro: true },
    { feature: 'Family Circle (unlimited)', free: false, pro: true },
    { feature: 'Perk Tips suggestions', free: '2 tips', pro: 'Unlimited' },
    { feature: 'Auto-Scan SMS background', free: false, pro: true },
    { feature: 'Membership ROI tracker', free: 'basic', pro: 'advanced' },
    { feature: 'Brand-change alerts', free: false, pro: true },
    { feature: 'Priority WhatsApp support', free: false, pro: true },
  ]
  const cell = (v) => {
    if (v === true) return <span className="text-emerald-700 font-bold">✓</span>
    if (v === false) return <span className="text-ink-300">—</span>
    return <span className="text-[10px] font-semibold text-ink-700">{v}</span>
  }
  return (
    <Card className="p-0 overflow-hidden" data-testid="free-vs-pro">
      <div className="grid grid-cols-3 px-4 py-3 bg-ink-900 text-white text-xs font-bold uppercase tracking-wider">
        <span>Feature</span>
        <span className="text-center">Free</span>
        <span className="text-center text-gold-400">Pro</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.feature} className={`grid grid-cols-3 px-4 py-3 text-xs items-center ${i % 2 ? 'bg-ink-50' : 'bg-white'}`}>
          <span className="text-ink-800">{r.feature}</span>
          <span className="text-center">{cell(r.free)}</span>
          <span className="text-center">{cell(r.pro)}</span>
        </div>
      ))}
      <div className="p-4 bg-gradient-to-br from-ink-900 to-emerald-900">
        <PrimaryButton data-testid="fvp-upgrade" onClick={onUpgrade} className="bg-gold-500 hover:bg-gold-600 shadow-none">
          <Star className="w-4 h-4" /> Unlock Pro · ₹99 / quarter
        </PrimaryButton>
        <p className="text-[10px] text-center text-white/60 mt-2">Cancel anytime · UPI / Card / NetBanking</p>
      </div>
    </Card>
  )
}

export default function PerkTipsScreen({ onBack, pin, isPro, onUpgrade }) {
  const [tips, setTips] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    Optimizer.tips(pin)
      .then(d => { if (alive) setTips(d.tips || []) })
      .catch(e => { if (alive) setError('Could not load tips') })
    return () => { alive = false }
  }, [pin])

  const FREE_LIMIT = 2

  return (
    <>
      <TopBar
        title="Perk Tips"
        onBack={onBack}
        subtitle={isPro ? 'Advanced Optimizer · Pro' : 'Masterclass for your loyalty points'}
        right={isPro ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gold-700 bg-gold-50 border border-gold-200 rounded-full px-2 py-0.5"><Star className="w-3 h-3" />PRO</span> : null}
      />
      <main className="px-5 space-y-3 pb-10" data-testid="perk-tips-main">
        {tips === null && !error && (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
        )}

        {error && (
          <Empty title="Could not load tips" sub={error} icon={<AlertTriangle className="w-6 h-6" />} testid="empty-perk-tips-err" />
        )}

        {tips !== null && tips.length === 0 && !error && (
          <Empty
            title="No tips yet"
            sub="Add some vouchers and points balances. Once we see your wallet, we'll surface optimization paths here."
            icon={<Sparkles className="w-6 h-6" />}
            testid="empty-perk-tips"
          />
        )}

        {tips !== null && tips.length > 0 && (
          <>
            <Card className="p-4 bg-emerald-50/40 border-emerald-200">
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">Loyalty masterclass · live</p>
              <p className="font-display font-bold text-ink-900 mt-1 leading-tight">
                {isPro
                  ? `${tips.length} actionable optimization${tips.length === 1 ? '' : 's'} found`
                  : `${tips.length} optimization${tips.length === 1 ? '' : 's'} found · ${Math.min(FREE_LIMIT, tips.length)} unlocked`}
              </p>
            </Card>

            <div className="space-y-2.5">
              {tips.map((t, i) => (
                <TipCard
                  key={t.id || i}
                  tip={t}
                  gated={!isPro && i >= FREE_LIMIT}
                  onUnlock={onUpgrade}
                />
              ))}
            </div>

            {!isPro && tips.length > FREE_LIMIT && (
              <FreeVsPro onUpgrade={onUpgrade} />
            )}
          </>
        )}

        {!isPro && tips !== null && tips.length <= FREE_LIMIT && (
          <FreeVsPro onUpgrade={onUpgrade} />
        )}
      </main>
    </>
  )
}
