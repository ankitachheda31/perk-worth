import React, { useState } from 'react'
import { ShieldCheck, MessageSquare, Bell, Sparkles, ChevronRight, X, CheckCircle2 } from 'lucide-react'
import { Permissions, Onboarding, Vouchers } from '../lib/api'
import { isNativeSmsAvailable, requestSmsPermission, readRecentSms } from '../lib/smsScanner'
import { requestNotificationPermission, setNotifOptIn } from '../lib/push'

/**
 * Post-signup Permission wizard.
 * - Shown ONCE after signup, before user hits the main dashboard.
 * - Asks for SMS + Notifications up-front so PerkWorth can auto-scan
 *   (Feature 2c) and auto-populate the wallet on first launch.
 * - "Skip" is always available — non-coercive per Trust-First Architecture.
 * - Records the answer in both localStorage AND server (/api/permissions/state).
 */
export default function OnboardingPermissions({ user, onDone, toast }) {
  const [step, setStep] = useState(0)  // 0=intro, 1=sms, 2=notif, 3=scan, 4=summary
  const [smsGranted, setSmsGranted] = useState(false)
  const [notifGranted, setNotifGranted] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)  // { new_candidates, keyword_hits, ... }
  const [selected, setSelected] = useState({})        // idx → true
  const [saving, setSaving] = useState(false)
  const nativeSms = isNativeSmsAvailable()

  const persistState = (partial) => Permissions.set(partial).catch(() => null)

  const askSms = async () => {
    if (!nativeSms) {
      // Web/iOS — record the intent, but there's no OS-level ask.
      await persistState({ sms: false })
      toast?.('SMS scan not available on this device (Android-only)')
      setStep(2)
      return
    }
    const res = await requestSmsPermission()
    const granted = !!res.granted
    setSmsGranted(granted)
    await persistState({ sms: granted })
    if (!granted) toast?.('You can enable this later from Settings → Permissions')
    setStep(2)
  }

  const skipSms = async () => { await persistState({ sms: false }); setStep(2) }

  const askNotif = async () => {
    const res = await requestNotificationPermission()
    const granted = res === 'granted' || res === true
    setNotifGranted(granted)
    if (granted) setNotifOptIn(true)
    await persistState({ notifications: granted })
    if (smsGranted) setStep(3)
    else setStep(4)
  }

  const skipNotif = async () => {
    await persistState({ notifications: false })
    if (smsGranted) setStep(3)
    else setStep(4)
  }

  const runScan = async () => {
    setScanning(true)
    try {
      const inbox = await readRecentSms({ maxCount: 200 })
      const messages = (inbox || []).map(m => ({
        body: m.body || '',
        sender: m.address || '',
        received_at: m.date ? new Date(Number(m.date)).toISOString() : null,
      }))
      const res = await Onboarding.scanSms(messages)
      setScanResult(res || { new_candidates: [] })
      // Preselect everything by default — user can uncheck things.
      const pre = {}
      ;(res?.new_candidates || []).forEach((_, i) => { pre[i] = true })
      setSelected(pre)
    } catch (e) {
      toast?.('Scan failed. You can try again anytime from Settings.')
    } finally {
      setScanning(false)
    }
  }

  const saveSelected = async () => {
    if (!scanResult) return
    setSaving(true)
    let added = 0
    for (const [i, keep] of Object.entries(selected)) {
      if (!keep) continue
      const c = scanResult.new_candidates?.[Number(i)]
      if (!c || !c.parsed) continue
      try {
        await Vouchers.create({
          brand: c.parsed.brand || 'Unknown',
          title: c.parsed.title || c.parsed.brand || 'Voucher',
          code: c.parsed.code || null,
          value: c.parsed.value || null,
          points: c.parsed.points || null,
          expiry: c.parsed.expiry || null,
          category: c.parsed.category || 'vouchers',
          source: 'sms_onboarding',
          raw_text: c.raw || null,
        })
        added += 1
      } catch { /* skip one bad row, keep going */ }
    }
    setSaving(false)
    toast?.(added ? `Added ${added} ${added === 1 ? 'voucher' : 'vouchers'} from your SMS` : 'No vouchers added')
    setStep(4)
  }

  const finish = async () => {
    await Onboarding.markComplete().catch(() => null)
    onDone?.()
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#FBFAF6] flex flex-col" data-testid="onboarding-permissions-screen">
      <div className="max-w-lg w-full mx-auto flex-1 flex flex-col px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg grid place-items-center font-extrabold text-sm text-white" style={{ background: '#065F46' }}>P</div>
            <span className="font-extrabold text-lg" style={{ fontFamily: 'Cabinet Grotesk, system-ui' }}>PerkWorth</span>
          </div>
          <button data-testid="onboarding-skip-all" onClick={finish} className="text-xs text-neutral-500 flex items-center gap-1">
            Skip <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {step === 0 && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-6" style={{ background: '#065F461A' }}>
              <Sparkles className="w-7 h-7" style={{ color: '#065F46' }} />
            </div>
            <h1 className="text-3xl font-extrabold mb-3" style={{ fontFamily: 'Cabinet Grotesk' }}>
              Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}.
            </h1>
            <p className="text-neutral-600 text-base leading-relaxed mb-6">
              Instead of typing 15 memberships one by one, let PerkWorth <span className="font-semibold text-emerald-800">auto-discover them from your SMS</span> — Zomato Gold, Amazon Prime, Cult Pass, credit-card rewards, everything.
            </p>
            <div className="rounded-xl bg-white border border-neutral-200 p-4 mb-6">
              <p className="text-xs text-neutral-500 mb-2 uppercase tracking-wider font-semibold">Trust-first, always</p>
              <ul className="text-sm text-neutral-700 space-y-1.5">
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> Parsed on-device. Only voucher-like SMS ever reach our server.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> Everything we find is shown for your review — nothing auto-saved.</li>
                <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" /> Revoke anytime in Settings → Permissions.</li>
              </ul>
            </div>
            <button
              data-testid="onboarding-start"
              onClick={() => setStep(1)}
              className="w-full py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg"
              style={{ background: '#065F46' }}>
              Let's set up <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 1 && (
          <PermissionCard
            testid="perm-sms"
            icon={<MessageSquare className="w-7 h-7" style={{ color: '#065F46' }} />}
            title="Read voucher SMS?"
            description={
              nativeSms
                ? "PerkWorth can scan your inbox to find voucher SMS from brands like Amazon, Zomato, Swiggy, Flipkart and your bank. We ignore everything else — personal messages, OTPs, chats. This one-time scan builds your wallet in seconds."
                : "SMS scanning is only available on Android. On this device you'll need to add vouchers manually or via photo scan."
            }
            primaryLabel={nativeSms ? 'Allow SMS access' : 'Continue'}
            secondaryLabel="Not now"
            onPrimary={askSms}
            onSecondary={skipSms}
          />
        )}

        {step === 2 && (
          <PermissionCard
            testid="perm-notif"
            icon={<Bell className="w-7 h-7" style={{ color: '#065F46' }} />}
            title="Get expiry alerts?"
            description="We'll ping you 7 days before any voucher expires, and when Family Circle members share a perk with you. No promotional spam — ever."
            primaryLabel="Allow notifications"
            secondaryLabel="Not now"
            onPrimary={askNotif}
            onSecondary={skipNotif}
          />
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-6" style={{ background: '#065F461A' }}>
              <ShieldCheck className="w-7 h-7" style={{ color: '#065F46' }} />
            </div>
            <h2 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Cabinet Grotesk' }}>Scan your SMS</h2>
            <p className="text-sm text-neutral-600 mb-6">We'll look through your last 200 messages for vouchers, coupons, memberships, and reward points. Anything obviously personal is ignored on-device.</p>

            {!scanResult && (
              <button
                data-testid="onboarding-run-scan"
                onClick={runScan}
                disabled={scanning}
                className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg disabled:opacity-50"
                style={{ background: '#065F46' }}>
                {scanning ? 'Scanning…' : 'Start scan'}
              </button>
            )}

            {scanResult && (
              <>
                <div className="text-xs text-neutral-500 mb-3">
                  Scanned {scanResult.scanned} • Matched {scanResult.keyword_hits} • Parsed {scanResult.parsed}
                  {scanResult.duplicates_skipped ? ` • ${scanResult.duplicates_skipped} already in wallet` : ''}
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-1" style={{ maxHeight: '55vh' }}>
                  {(scanResult.new_candidates || []).length === 0 && (
                    <div className="text-sm text-neutral-500 border border-dashed rounded-xl p-4 text-center">
                      No new vouchers detected. You can add them manually later.
                    </div>
                  )}
                  {(scanResult.new_candidates || []).map((c, i) => (
                    <label key={i} data-testid={`onboarding-candidate-${i}`} className="flex items-start gap-3 bg-white border border-neutral-200 rounded-xl p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selected[i]}
                        onChange={(e) => setSelected(s => ({ ...s, [i]: e.target.checked }))}
                        className="mt-1 accent-emerald-700"
                        data-testid={`onboarding-candidate-check-${i}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{c.parsed.brand || 'Unknown brand'}</div>
                        <div className="text-xs text-neutral-600 truncate">{c.parsed.title || c.raw?.slice(0, 60)}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                          {c.parsed.code && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono">{c.parsed.code}</span>}
                          {c.parsed.expiry && <span className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">exp {c.parsed.expiry}</span>}
                          {c.parsed.value && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800">₹{c.parsed.value}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    data-testid="onboarding-skip-scan"
                    onClick={() => setStep(4)}
                    className="flex-1 py-3 rounded-xl border border-neutral-300 text-sm font-semibold">
                    Skip
                  </button>
                  <button
                    data-testid="onboarding-save-selected"
                    onClick={saveSelected}
                    disabled={saving || !Object.values(selected).some(Boolean)}
                    className="flex-1 py-3 rounded-xl font-bold text-white disabled:opacity-50"
                    style={{ background: '#065F46' }}>
                    {saving ? 'Adding…' : `Add ${Object.values(selected).filter(Boolean).length}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="w-14 h-14 rounded-2xl grid place-items-center mb-6" style={{ background: '#065F461A' }}>
              <CheckCircle2 className="w-7 h-7" style={{ color: '#065F46' }} />
            </div>
            <h2 className="text-3xl font-extrabold mb-3" style={{ fontFamily: 'Cabinet Grotesk' }}>You're all set.</h2>
            <p className="text-neutral-600 text-base mb-6">Anytime you want to change permissions, head to <span className="font-semibold">Settings → Permissions</span>.</p>
            <button
              data-testid="onboarding-finish"
              onClick={finish}
              className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg"
              style={{ background: '#065F46' }}>
              Open PerkWorth
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PermissionCard({ icon, title, description, primaryLabel, secondaryLabel, onPrimary, onSecondary, testid }) {
  return (
    <div className="flex-1 flex flex-col justify-center" data-testid={testid}>
      <div className="w-14 h-14 rounded-2xl grid place-items-center mb-6" style={{ background: '#065F461A' }}>
        {icon}
      </div>
      <h2 className="text-2xl font-extrabold mb-2" style={{ fontFamily: 'Cabinet Grotesk' }}>{title}</h2>
      <p className="text-neutral-600 text-base leading-relaxed mb-8">{description}</p>
      <button
        data-testid={`${testid}-primary`}
        onClick={onPrimary}
        className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg mb-3"
        style={{ background: '#065F46' }}>
        {primaryLabel}
      </button>
      <button
        data-testid={`${testid}-secondary`}
        onClick={onSecondary}
        className="w-full py-3.5 rounded-xl border border-neutral-300 font-semibold text-neutral-700">
        {secondaryLabel}
      </button>
    </div>
  )
}
