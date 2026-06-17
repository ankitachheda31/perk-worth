import React, { useState } from 'react'
import { Sparkles, ShieldCheck, ScanLine, MessageSquareText, Check, X, ArrowRight, Smartphone, FileText, Loader2 } from 'lucide-react'
import { Card, GhostButton, PrimaryButton, TopBar } from '../components/ui'
import { Extract, Vouchers } from '../lib/api'
import { isNativeSmsAvailable, checkSmsPermission, requestSmsPermission, readRecentSms, isLikelyVoucherSms } from '../lib/smsScanner'

// 3-state machine: prompt → scanning → review
export default function SmartDiscoveryScreen({ pin, onComplete, onOpenProtect, toast }) {
  const [step, setStep] = useState('prompt') // 'prompt' | 'paste' | 'scanning' | 'review'
  const [pastedText, setPastedText] = useState('')
  const [candidates, setCandidates] = useState([]) // [{idx, source, raw, extracted, selected}]
  const [savingAll, setSavingAll] = useState(false)
  const [progress, setProgress] = useState({ scanned: 0, total: 0 })

  const native = isNativeSmsAvailable()

  const beginNativeScan = async () => {
    setStep('scanning')
    try {
      let perm = await checkSmsPermission()
      if (!perm.granted) perm = await requestSmsPermission()
      if (!perm.granted) {
        toast?.('SMS access not granted — try paste mode')
        setStep('paste'); return
      }
      const list = await readRecentSms({ maxCount: 100 })
      const filtered = list.filter(s => isLikelyVoucherSms(s.body))
      setProgress({ scanned: 0, total: filtered.length })
      const out = []
      for (let i = 0; i < filtered.length; i++) {
        const sms = filtered[i]
        try {
          const extracted = await Extract.sms(sms.body)
          if (extracted?.brand && extracted?.title) {
            out.push({ idx: i, source: sms.address || 'SMS', raw: sms.body, extracted, selected: true })
          }
        } catch { /* skip */ }
        setProgress({ scanned: i + 1, total: filtered.length })
      }
      setCandidates(out)
      setStep('review')
    } catch (e) {
      toast?.('Scan failed')
      setStep('prompt')
    }
  }

  const runPasteExtraction = async () => {
    const chunks = pastedText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    if (chunks.length === 0) { toast?.('Paste at least one SMS'); return }
    setStep('scanning')
    setProgress({ scanned: 0, total: chunks.length })
    const out = []
    for (let i = 0; i < chunks.length; i++) {
      try {
        const extracted = await Extract.sms(chunks[i])
        if (extracted?.brand && extracted?.title) {
          out.push({ idx: i, source: 'pasted', raw: chunks[i], extracted, selected: true })
        }
      } catch { /* skip */ }
      setProgress({ scanned: i + 1, total: chunks.length })
    }
    setCandidates(out)
    setStep('review')
  }

  const toggle = (idx) => {
    setCandidates(prev => prev.map(c => c.idx === idx ? { ...c, selected: !c.selected } : c))
  }

  const saveAllSelected = async () => {
    const picked = candidates.filter(c => c.selected)
    if (picked.length === 0) { onComplete(); return }
    setSavingAll(true)
    let saved = 0
    for (const c of picked) {
      const d = c.extracted
      try {
        await Vouchers.create({
          user_pin: pin,
          type: d.category === 'memberships' ? 'membership' : 'voucher',
          brand: d.brand,
          title: d.title,
          code: d.code || null,
          value: d.value || null,
          expiry: d.expiry || null,
          category: d.category || 'vouchers',
          membership_kind: d.membership_kind || null,
          how_to_redeem: d.how_to_redeem || null,
        })
        saved++
      } catch { /* skip */ }
    }
    toast?.(`Wallet pre-filled · ${saved} voucher${saved === 1 ? '' : 's'} added`)
    setSavingAll(false)
    onComplete()
  }

  // ---- Render ----
  if (step === 'prompt') {
    return (
      <div className="min-h-[100dvh] w-full bg-cream flex flex-col" data-testid="smart-discovery">
        <header className="px-5 pt-6 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold text-sm">P</div>
            <span className="font-display font-bold text-ink-900">Perk Orbit</span>
          </div>
          <button data-testid="discovery-skip" onClick={onComplete} className="text-xs font-semibold text-ink-500 hover:text-ink-800 underline underline-offset-4">Skip for now</button>
        </header>

        <main className="flex-1 px-6 py-6 flex flex-col justify-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 text-white grid place-items-center mb-5">
            <Sparkles className="w-7 h-7" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-ink-500">Smart discovery</p>
          <h1 className="font-display text-3xl font-bold text-ink-900 leading-tight mt-2">Pre-fill your wallet in 30 seconds</h1>
          <p className="text-sm text-ink-600 mt-3 leading-relaxed">
            We&apos;ll look at your recent SMS for vouchers, loyalty cards (Tata Neu, Croma, Amazon Pay…) and offer codes — and let <span className="font-bold">you</span> decide what to keep. Nothing is saved until you tap &ldquo;Add to wallet&rdquo;.
          </p>

          <Card className="mt-6 p-4 bg-emerald-50/40 border-emerald-200">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-800" />
              <p className="font-display font-bold text-ink-900 text-sm">What we&apos;ll read</p>
            </div>
            <div className="space-y-1.5 text-xs text-ink-700">
              <div className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-700 mt-0.5 shrink-0" /><span>Only SMS matching shopping &amp; loyalty keywords</span></div>
              <div className="flex items-start gap-2"><X className="w-3.5 h-3.5 text-terracotta-700 mt-0.5 shrink-0" /><span>Never bank OTPs, transaction alerts, or chats</span></div>
              <div className="flex items-start gap-2"><Check className="w-3.5 h-3.5 text-emerald-700 mt-0.5 shrink-0" /><span>You review every detected voucher before saving</span></div>
            </div>
            <button data-testid="discovery-learn" onClick={onOpenProtect} className="mt-3 text-[11px] font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300">
              How we protect you →
            </button>
          </Card>

          <div className="mt-6 space-y-2.5">
            {native ? (
              <PrimaryButton data-testid="discovery-scan-native" onClick={beginNativeScan}>
                <ScanLine className="w-4 h-4" /> Scan my SMS now
              </PrimaryButton>
            ) : (
              <PrimaryButton data-testid="discovery-paste-mode" onClick={() => setStep('paste')}>
                <FileText className="w-4 h-4" /> Paste recent SMS
              </PrimaryButton>
            )}
            <GhostButton data-testid="discovery-later" onClick={onComplete}>
              Maybe later — start with an empty wallet
            </GhostButton>
          </div>

          {!native && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2 bg-ink-50 rounded-2xl" data-testid="discovery-pwa-note">
              <Smartphone className="w-3.5 h-3.5 text-ink-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-ink-600 leading-relaxed">
                Browsers can&apos;t auto-read SMS for security reasons. Paste up to 20 messages separated by blank lines — we&apos;ll do the rest. Install the Android app for fully automatic scanning.
              </p>
            </div>
          )}
        </main>
      </div>
    )
  }

  if (step === 'paste') {
    return (
      <>
        <TopBar title="Paste your SMS" onBack={() => setStep('prompt')} subtitle="One per chunk, separated by a blank line" />
        <main className="px-5 space-y-3 pb-6" data-testid="discovery-paste">
          <Card className="p-4 bg-emerald-50/40 border-emerald-200">
            <p className="text-xs text-ink-700 leading-relaxed">
              Open your SMS app, long-press promotional messages from brands (Swiggy, Tata, Croma, Amazon, Myntra…) and paste them below. We&apos;ll extract codes &amp; expiries — bank OTPs are auto-skipped.
            </p>
          </Card>
          <textarea
            data-testid="discovery-paste-input"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={10}
            placeholder={'Flat ₹150 off on Swiggy! Code SWIGGY150 by 25 Nov.\n\nTata Neu — earn 5x NeuCoins this weekend on BigBasket.\n\nMyntra Bonanza — 20% off, code MYNTRA20, till 30 Nov.'}
            className="w-full bg-ink-50 border border-ink-200 rounded-2xl p-3 text-sm placeholder:text-ink-400"
          />
          <PrimaryButton data-testid="discovery-paste-extract" onClick={runPasteExtraction} disabled={!pastedText.trim()}>
            <Sparkles className="w-4 h-4" /> Find vouchers
          </PrimaryButton>
          <GhostButton onClick={onComplete}>Skip for now</GhostButton>
        </main>
      </>
    )
  }

  if (step === 'scanning') {
    const pct = progress.total ? Math.round((progress.scanned / progress.total) * 100) : 0
    return (
      <div className="min-h-[100dvh] w-full bg-cream flex flex-col items-center justify-center px-6" data-testid="discovery-scanning">
        <Loader2 className="w-10 h-10 text-emerald-800 animate-spin mb-5" />
        <p className="font-display text-2xl font-bold text-ink-900 leading-tight text-center">Finding your vouchers</p>
        <p className="text-sm text-ink-500 mt-2 text-center max-w-xs">Reading shopping &amp; loyalty SMS only — bank OTPs are skipped automatically.</p>
        <div className="w-full max-w-xs mt-6">
          <div className="h-1.5 bg-ink-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[11px] text-ink-500 mt-2 text-center">{progress.scanned} of {progress.total || '…'} messages scanned</p>
        </div>
      </div>
    )
  }

  // review step
  const selectedCount = candidates.filter(c => c.selected).length
  return (
    <>
      <TopBar
        title="We found these"
        onBack={() => setStep('prompt')}
        subtitle={`${candidates.length} voucher${candidates.length === 1 ? '' : 's'} detected · review &amp; add`}
      />
      <main className="px-5 space-y-3 pb-28" data-testid="discovery-review">
        {candidates.length === 0 ? (
          <Card className="p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-ink-100 mx-auto grid place-items-center mb-3"><MessageSquareText className="w-5 h-5 text-ink-500" /></div>
            <p className="font-display font-bold text-ink-900">No vouchers detected</p>
            <p className="text-sm text-ink-500 mt-1">Try pasting some recent promotional SMS or start with a clean wallet.</p>
            <PrimaryButton className="mt-4" onClick={onComplete}>Continue to home</PrimaryButton>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-2">
              <p className="text-xs text-ink-500">Uncheck anything you don&apos;t want to save.</p>
              <button
                data-testid="discovery-toggle-all"
                onClick={() => {
                  const allOn = candidates.every(c => c.selected)
                  setCandidates(candidates.map(c => ({ ...c, selected: !allOn })))
                }}
                className="text-xs font-bold text-emerald-800 underline underline-offset-4 decoration-emerald-300"
              >
                {candidates.every(c => c.selected) ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {candidates.map(c => (
              <Card key={c.idx} className={`p-4 cursor-pointer transition ${c.selected ? 'border-emerald-300' : 'opacity-60'}`} onClick={() => toggle(c.idx)} data-testid={`discovery-item-${c.idx}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 mt-0.5 ${c.selected ? 'bg-emerald-700 border-emerald-700' : 'bg-white border-ink-300'}`}>
                    {c.selected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-800">{c.extracted.brand}</span>
                      {c.extracted.code ? <code className="text-[10px] font-mono bg-ink-100 px-1.5 py-0.5 rounded">{c.extracted.code}</code> : null}
                    </div>
                    <p className="font-display font-bold text-ink-900 text-sm leading-tight">{c.extracted.title}</p>
                    {c.extracted.expiry ? <p className="text-[10px] text-ink-500 mt-0.5">Expires {c.extracted.expiry}</p> : null}
                    {c.extracted.value ? <p className="text-[10px] font-bold text-emerald-800 mt-0.5">Worth ₹{c.extracted.value}</p> : null}
                  </div>
                </div>
              </Card>
            ))}
          </>
        )}
      </main>

      {candidates.length > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-cream/95 backdrop-blur border-t border-ink-200 p-4 z-30" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <PrimaryButton
            data-testid="discovery-save-all"
            onClick={saveAllSelected}
            disabled={savingAll || selectedCount === 0}
          >
            {savingAll ? 'Adding…' : (<><Check className="w-4 h-4" /> Add {selectedCount} to my wallet</>)}
            {!savingAll && <ArrowRight className="w-4 h-4" />}
          </PrimaryButton>
        </div>
      )}
    </>
  )
}
