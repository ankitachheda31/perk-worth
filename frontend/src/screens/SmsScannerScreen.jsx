import React, { useEffect, useState } from 'react'
import { ScanLine, MessageSquareText, Smartphone, ShieldCheck, Lock, Check, X } from 'lucide-react'
import { Card, GhostButton, PrimaryButton, TopBar, Empty } from '../components/ui'
import { Vouchers, Extract } from '../lib/api'
import { isNativeSmsAvailable, checkSmsPermission, requestSmsPermission, readRecentSms, getLastScanTs, setLastScanTs, isLikelyVoucherSms } from '../lib/smsScanner'
import { fmtDate } from '../lib/format'

export default function SmsScannerScreen({ onBack, pin, toast, onSaved, onOpenProtect }) {
  const native = isNativeSmsAvailable()
  const [perm, setPerm] = useState({ granted: false })
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState([])
  const [busyId, setBusyId] = useState(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => { if (native) checkSmsPermission().then(setPerm) }, [native])

  const grant = async () => { setPerm(await requestSmsPermission()) }

  const scan = async () => {
    setScanning(true); setCandidates([])
    try {
      const last = getLastScanTs()
      const list = await readRecentSms({ maxCount: 50, lastDate: last })
      const filtered = list.filter(s => isLikelyVoucherSms(s.body))
      const out = []
      for (const sms of filtered.slice(0, 10)) {
        try {
          const extracted = await Extract.sms(sms.body)
          if (extracted?.brand && extracted?.title) out.push({ ...sms, extracted })
        } catch { /* skip */ }
      }
      setCandidates(out)
      setLastScanTs(Date.now())
      toast(`Scanned · ${out.length} voucher${out.length === 1 ? '' : 's'} detected`)
    } finally { setScanning(false) }
  }

  const saveOne = async (c) => {
    setBusyId(c.body)
    try {
      const d = c.extracted
      await Vouchers.create({
        user_pin: pin, type: d.category === 'memberships' ? 'membership' : 'voucher',
        brand: d.brand, title: d.title, code: d.code || null, value: d.value || null,
        expiry: d.expiry || null, category: d.category || 'vouchers',
        how_to_redeem: d.how_to_redeem || null,
      })
      setCandidates(prev => prev.filter(x => x !== c))
      toast(`Saved ${d.brand}`); onSaved?.()
    } catch { toast('Save failed') } finally { setBusyId(null) }
  }

  return (
    <>
      <TopBar title="SMS Auto-Scanner" onBack={onBack} subtitle="Auto-detect vouchers from your inbox" />
      <main className="px-5 space-y-4">
        {!native ? (
          <Card className="p-5 text-center" data-testid="sms-web-fallback">
            <div className="w-14 h-14 rounded-full bg-ink-100 mx-auto grid place-items-center mb-3 text-ink-500">
              <Smartphone className="w-6 h-6" />
            </div>
            <p className="font-display font-bold text-ink-900">Available on Android app</p>
            <p className="text-sm text-ink-500 mt-1">Browsers cannot read SMS due to platform security. Install the PerkWorth Android app from Play Store to enable automatic SMS scanning.</p>
            <p className="text-xs text-ink-400 mt-3">Meanwhile, use <span className="font-semibold text-emerald-800">Add new → Paste SMS</span> to import multiple SMS at once.</p>
          </Card>
        ) : !perm.granted ? (
          <div className="space-y-4" data-testid="sms-permission-context">
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-10 h-10 rounded-full bg-emerald-50 grid place-items-center"><ShieldCheck className="w-5 h-5 text-emerald-800" /></div>
                <div>
                  <p className="font-display font-bold text-ink-900 leading-tight">Before we read your SMS</p>
                  <p className="text-[11px] text-ink-500">Permission context · पारदर्शिता</p>
                </div>
              </div>
              <p className="text-sm text-ink-700 leading-relaxed">
                We use SMS access to <span className="font-semibold">auto-detect shopping vouchers, loyalty points and offer codes</span> in your inbox — so you never miss a deal.
              </p>
              <p className="text-sm text-ink-700 leading-relaxed mt-2" lang="hi">
                <span className="font-semibold">हम आपका SMS</span> केवल <span className="font-semibold">शॉपिंग और लॉयल्टी कूपन</span> ढूंढने के लिए पढ़ते हैं। बैंक OTP, OTP messages, और निजी बातचीत कभी नहीं।
              </p>
              <div className="mt-4 space-y-2">
                <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl p-3" data-testid="perm-yes-1">
                  <Check className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" />
                  <p className="text-xs text-emerald-900 leading-relaxed"><span className="font-bold">YES, we read:</span> SMS containing keywords like &ldquo;₹ off&rdquo;, &ldquo;voucher&rdquo;, &ldquo;code&rdquo;, &ldquo;expires&rdquo;, &ldquo;points&rdquo;, &ldquo;loyalty&rdquo;.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-terracotta-50 border border-terracotta-200 rounded-2xl p-3" data-testid="perm-no-1">
                  <X className="w-4 h-4 text-terracotta-700 mt-0.5 shrink-0" />
                  <p className="text-xs text-terracotta-900 leading-relaxed"><span className="font-bold">NO, we never read:</span> Bank OTPs, transaction alerts, personal chats, DLT-flagged confidential SMS.</p>
                </div>
                <div className="flex items-start gap-2.5 bg-white border border-ink-200 rounded-2xl p-3" data-testid="perm-where-1">
                  <Lock className="w-4 h-4 text-emerald-800 mt-0.5 shrink-0" />
                  <p className="text-xs text-ink-700 leading-relaxed"><span className="font-bold">Where it happens:</span> Filtering runs on your device. SMS content reaches our servers <span className="font-bold">only</span> when you tap &ldquo;Save&rdquo; on a detected voucher.</p>
                </div>
              </div>
              <button data-testid="sms-learn-more" onClick={onOpenProtect}
                className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300 hover:decoration-emerald-700">
                Learn more → How we protect you
              </button>
            </Card>

            <Card className="p-5">
              <label className="flex items-start gap-3 cursor-pointer" data-testid="sms-acknowledge">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 w-4 h-4 accent-emerald-700" />
                <span className="text-xs text-ink-700 leading-relaxed">
                  I understand PerkWorth will scan my SMS <span className="font-semibold">only for vouchers and loyalty offers</span>, and that I can revoke this anytime from device Settings.
                </span>
              </label>
              <PrimaryButton data-testid="sms-grant" onClick={grant} disabled={!acknowledged} className="mt-4">
                <ShieldCheck className="w-4 h-4" /> Allow SMS access
              </PrimaryButton>
              <p className="text-[10px] text-ink-400 text-center mt-2">You can change this anytime · DPDP 2023 compliant</p>
            </Card>
          </div>
        ) : (
          <>
            <Card className="p-5 flex items-center justify-between gap-3">
              <div>
                <p className="font-display font-bold text-ink-900">Inbox scanner</p>
                <p className="text-xs text-ink-500 mt-0.5">{scanning ? 'Scanning…' : 'Tap to scan recent SMS for vouchers'}</p>
              </div>
              <PrimaryButton data-testid="sms-scan-now" onClick={scan} disabled={scanning} className="w-auto px-5">
                <ScanLine className="w-4 h-4" /> {scanning ? '…' : 'Scan now'}
              </PrimaryButton>
            </Card>

            {candidates.length === 0 && !scanning ? (
              <Empty title="Nothing new" sub="No voucher-like SMS found since your last scan." icon={<MessageSquareText className="w-6 h-6" />} testid="empty-sms-scan" />
            ) : (
              <div className="space-y-2" data-testid="sms-candidate-list">
                {candidates.map((c, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-display font-bold text-ink-900">{c.extracted.brand}</p>
                        <p className="text-xs text-ink-500">{c.address}</p>
                      </div>
                      {c.extracted.code ? <span className="code-box text-xs">{c.extracted.code}</span> : null}
                    </div>
                    <p className="text-sm text-ink-700 mt-2">{c.extracted.title}</p>
                    {c.extracted.expiry ? <p className="text-[11px] text-ink-500 mt-1">Expires {fmtDate(c.extracted.expiry)}</p> : null}
                    <div className="flex gap-2 mt-3">
                      <PrimaryButton data-testid={`sms-save-${i}`} onClick={() => saveOne(c)} disabled={busyId === c.body} className="w-auto px-4">
                        {busyId === c.body ? 'Saving…' : 'Save to PerkWorth'}
                      </PrimaryButton>
                      <GhostButton onClick={() => setCandidates(prev => prev.filter(x => x !== c))} className="w-auto px-4">Skip</GhostButton>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
