import React, { useState } from 'react'
import { Sparkles, ShieldCheck, X, ArrowRight, Loader2 } from 'lucide-react'
import { Spend } from '../lib/api'

/**
 * Smart Spend Inference Sheet — paste your bank/UPI SMS, GPT-4o categorises,
 * and we pre-fill the Savings Assistant with your REAL spending pattern.
 *
 * Privacy:
 *  - The SMS text is sent to OpenAI for ONE classification call.
 *  - We persist ONLY the aggregated per-category totals (never the raw SMS).
 *  - User can delete the inferred profile from Settings or by re-running.
 */
export default function SmartSpendSheet({ open, onClose, pin, onApplied, toast }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  if (!open) return null

  const fmtINR = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`

  const handleInfer = async () => {
    if (!text.trim() || text.trim().length < 20) {
      toast?.('Paste at least one transaction SMS')
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const r = await Spend.infer(text, pin, true)
      setResult(r)
    } catch {
      toast?.('Could not analyze — try fewer messages or retry')
    } finally {
      setBusy(false)
    }
  }

  const applyAndClose = () => {
    if (!result) return
    onApplied?.(result)
    setText('')
    setResult(null)
    onClose()
  }

  const labels = {
    online_shopping: '🛒 Online Shopping',
    food_delivery: '🍔 Food Delivery',
    fuel: '⛽ Fuel',
    groceries: '🥬 Groceries',
    travel: '✈️ Travel',
    entertainment: '🎬 Entertainment',
    fitness: '💪 Fitness',
    other: '📦 Other (rent / utilities / EMI)',
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center"
      data-testid="smart-spend-sheet"
      onClick={() => !busy && onClose()}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-700 inline-flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Magic auto-fill
            </p>
            <h2 className="font-display font-bold text-xl text-ink-900 mt-1 leading-tight">Read your spending from SMS</h2>
          </div>
          <button onClick={onClose} disabled={busy} data-testid="smart-spend-close" className="w-9 h-9 rounded-full bg-ink-50 grid place-items-center text-ink-600 hover:bg-ink-100 active:scale-95 transition disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!result && (
          <>
            <p className="text-sm text-ink-700 leading-relaxed mb-3">
              Paste your last 1–2 months of <strong>bank / UPI / credit-card SMS</strong>. We categorize each transaction
              and show you exactly where you can save the most.
            </p>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-4 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                <strong>Privacy first:</strong> we never store the raw SMS — only the per-category totals.
                One AI call, then it&apos;s gone from our servers.
              </p>
            </div>

            <textarea
              data-testid="smart-spend-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Paste SMS here, e.g.\n\nRs.347 debited for SWIGGY on 12-Feb...\nRs.2200 at HPCL PETROL on 15-Feb...\nRs.499 NETFLIX on 22-Feb...'}
              rows={10}
              className="w-full bg-ink-50 border border-ink-200 rounded-2xl px-4 py-3 text-xs font-mono leading-relaxed text-ink-800 focus:border-emerald-500 focus:outline-none resize-none"
            />
            <p className="text-[10px] text-ink-400 mt-1.5">
              {text.trim().length} chars · works best with 10+ transactions
            </p>

            <button
              data-testid="smart-spend-infer"
              onClick={handleInfer}
              disabled={busy || text.trim().length < 20}
              className="mt-4 w-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-sm tracking-wide px-4 py-3.5 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing your spend…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Analyze my spending
                </>
              )}
            </button>
          </>
        )}

        {result && (
          <>
            <p className="text-sm text-ink-700 leading-relaxed mb-2">
              We parsed <strong>{result.transactions_parsed} transactions</strong> across roughly{' '}
              <strong>{result.window_days_observed} days</strong>. Here&apos;s your monthly spend:
            </p>
            <p className="font-display font-bold text-2xl text-emerald-900 mb-4 tabular-nums" data-testid="smart-spend-total">
              {fmtINR(result.total_monthly_inr)} / month
            </p>

            <div className="space-y-1.5" data-testid="smart-spend-breakdown">
              {Object.entries(result.categories)
                .filter(([, v]) => v.monthly_inr > 0)
                .sort(([, a], [, b]) => b.monthly_inr - a.monthly_inr)
                .map(([cat, v]) => (
                  <div key={cat} className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl ${cat === result.recommend_category ? 'bg-emerald-50 border border-emerald-200' : 'bg-ink-50'}`}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-800">{labels[cat] || cat}</p>
                      <p className="text-[10px] text-ink-500">{v.txn_count} txn{v.txn_count === 1 ? '' : 's'}</p>
                    </div>
                    <p className="text-sm font-display font-bold tabular-nums text-ink-900 shrink-0">{fmtINR(v.monthly_inr)}</p>
                  </div>
                ))}
            </div>

            <div className="mt-4 bg-gold-50 border border-gold-200 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-gold-800 uppercase tracking-wider mb-1">Biggest reward opportunity</p>
              <p className="text-sm text-ink-800 leading-relaxed">
                Your highest reward-eligible spend is on <strong>{labels[result.recommend_category]?.replace(/^\S+\s/, '') || result.recommend_category}</strong>.
                We&apos;ll pre-load the Savings Assistant on this category.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                data-testid="smart-spend-retry"
                onClick={() => { setResult(null); setText('') }}
                disabled={busy}
                className="w-full bg-white border border-ink-200 text-ink-700 font-semibold text-xs px-4 py-3 rounded-full active:scale-95 transition"
              >
                Try again
              </button>
              <button
                data-testid="smart-spend-apply"
                onClick={applyAndClose}
                className="w-full bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs tracking-wide px-4 py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2"
              >
                Show my picks
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
