import React, { useEffect, useRef, useState } from 'react'
import { Star, ShieldCheck, LinkIcon, ImageDown } from 'lucide-react'
import { Card, GhostButton, PrimaryButton, TopBar } from '../components/ui'
import { Membership, Referrals } from '../lib/api'
import { getProfile } from '../lib/store'
import { openRazorpayCheckout } from '../lib/razorpay'
import { fmtDate } from '../lib/format'
import { toPng } from 'html-to-image'

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID

export default function MembershipPage({ onBack, pin, status, refresh, toast, online = true }) {
  const [busy, setBusy] = useState(false)
  const [refInput, setRefInput] = useState('')
  const [refPreview, setRefPreview] = useState(null)
  const [stats, setStats] = useState({ total_referrals: 0, bonus_days_earned: 0 })

  useEffect(() => { Referrals.stats(pin).then(setStats).catch(() => {}) }, [pin, status?.active])

  useEffect(() => {
    if (!refInput.trim() || refInput.length < 6) { setRefPreview(null); return }
    const id = setTimeout(() => {
      Referrals.preview(refInput.trim()).then(setRefPreview).catch(() => setRefPreview(null))
    }, 250)
    return () => clearTimeout(id)
  }, [refInput])

  const startCheckout = async () => {
    setBusy(true)
    try {
      const order = await Membership.createOrder(pin, 99)
      const profile = getProfile()
      openRazorpayCheckout({
        keyId: order.key_id || RAZORPAY_KEY_ID,
        orderId: order.order_id, amount: order.amount, currency: order.currency,
        prefill: { name: profile.name || 'PerkWorth Member', email: profile.email || '', contact: profile.phone || '' },
        onSuccess: async (resp) => {
          try {
            const result = await Membership.verifyPayment({
              user_pin: pin,
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
              referral_code: refPreview?.valid ? refInput.trim().toUpperCase() : undefined,
            })
            await refresh()
            toast(result.referral?.applied
              ? `Welcome to Pro! +${result.referral.bonus_days} bonus days applied`
              : 'Welcome to PerkWorth Pro!')
          } catch { toast('Payment verification failed') } finally { setBusy(false) }
        },
        onDismiss: () => { setBusy(false); toast('Payment cancelled') },
        onFailure: () => { setBusy(false); toast('Payment failed') },
      })
    } catch { setBusy(false); toast('Could not start checkout') }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DEV-ONLY bypass: lets us verify the membership-activation pipeline end-to-end
  // even when Razorpay's checkout modal is unusable (KYC under review, BIN-block,
  // sandbox quirks, etc.). The button is rendered ONLY in dev / preview builds,
  // never in production, and calls /api/membership/activate directly. Server-side
  // this endpoint is gated by the same backend env so it cannot be abused in prod.
  const showDevBypass = (typeof import.meta !== 'undefined') && (import.meta.env?.DEV === true || /preview\.emergent/i.test(window.location.hostname))
  const devActivate = async () => {
    if (!confirm('DEV ONLY — activate Pro membership without Razorpay payment?')) return
    setBusy(true)
    try {
      await Membership.activate(pin)
      await refresh()
      toast('DEV: Pro activated (no payment processed)')
    } catch { toast('Bypass activation failed') } finally { setBusy(false) }
  }

  const cardRef = useRef(null)

  const shareSavingsReport = async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'perk-worth-savings.png', { type: 'image/png' })
      const link = `https://perkworth.app/?ref=${status?.referral_code}`
      const text = `I'm saving smarter with PerkWorth 💎\nReferred ${stats.total_referrals} friends · earned +${stats.bonus_days_earned} bonus days\nJoin me with code ${status?.referral_code} — both get 3 months FREE: ${link}`
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'My PerkWorth savings' })
      } else if (navigator.share) {
        await navigator.share({ text, title: 'My PerkWorth savings' })
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = 'perk-worth-savings.png'; a.click()
        toast('Image downloaded')
      }
    } catch { toast('Could not generate report') }
  }

  const shareRef = async () => {
    const link = `https://perkworth.app/?ref=${status?.referral_code}`
    const text = `Join me on PerkWorth — India's voucher-first wallet. Use my code ${status?.referral_code} when you upgrade to Pro and get 3 months FREE on top of your 3-month plan (I get 3 months free too 🎁): ${link}`
    try {
      if (navigator.share) { await navigator.share({ title: 'PerkWorth Pro', text }) }
      else { await navigator.clipboard.writeText(text); toast('Referral message copied') }
    } catch { toast('Share cancelled') }
  }

  return (
    <>
      <TopBar title="Membership" onBack={onBack} right={<span data-testid="membership-encrypted-badge" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><ShieldCheck className="w-3 h-3" /> Secure</span>} />
      <main className="px-5 space-y-4">
        {status?.active ? (
          <>
            <Card className="p-6 bg-gradient-to-br from-gold-500 to-gold-600 text-white border-gold-500 relative overflow-hidden">
              <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-white/15 blur-2xl" />
              <div className="flex items-center gap-2 mb-2"><Star className="w-4 h-4" /><span className="text-[10px] uppercase tracking-[0.18em] font-bold">Active</span></div>
              <p className="font-display text-2xl font-bold leading-tight">{status.plan}</p>
              <p className="text-sm text-white/85 mt-1">Renews on {fmtDate(status.expires_at)}</p>
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-[10px] uppercase tracking-wider font-bold text-white/80">Your referral code</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="font-mono font-bold text-lg" data-testid="my-referral-code">{status.referral_code}</code>
                  <button data-testid="share-referral" onClick={shareRef} className="bg-white/15 hover:bg-white/25 text-xs font-semibold px-3 py-2 rounded-full inline-flex items-center gap-1"><LinkIcon className="w-3.5 h-3.5" /> Share & earn</button>
                </div>
                <p className="text-[11px] text-white/85 mt-3 leading-relaxed">
                  🎁 Refer a friend → both of you get <span className="font-bold">+1 month</span> FREE on PerkWorth Pro.
                </p>
              </div>
            </Card>

            <Card className="p-5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Your referral impact</p>
              <div className="mt-2 flex items-end gap-6">
                <div>
                  <p className="font-display text-3xl font-bold text-emerald-800 leading-none" data-testid="ref-total">{stats.total_referrals}</p>
                  <p className="text-[11px] text-ink-500 mt-1">friends joined</p>
                </div>
                <div>
                  <p className="font-display text-3xl font-bold text-gold-600 leading-none" data-testid="ref-bonus">+{stats.bonus_days_earned}d</p>
                  <p className="text-[11px] text-ink-500 mt-1">bonus days earned</p>
                </div>
              </div>
            </Card>

            <div className="fixed -left-[9999px] top-0" aria-hidden="true">
              <div
                ref={cardRef}
                data-testid="savings-report-card"
                style={{
                  width: 1080, height: 1080, padding: 80,
                  background: 'linear-gradient(135deg, #0F172A 0%, #064E3B 100%)',
                  color: '#fff', fontFamily: 'Cabinet Grotesk, ui-sans-serif',
                  display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                }}
              >
                <div>
                  <p style={{ fontSize: 24, color: '#FCD34D', fontWeight: 700, letterSpacing: 4 }}>PERK ORBIT · SAVINGS REPORT</p>
                  <p style={{ fontSize: 56, fontWeight: 800, marginTop: 24, lineHeight: 1.1 }}>{getProfile().name || 'Saver'}&apos;s wallet is paying off.</p>
                </div>
                <div style={{ display: 'flex', gap: 40 }}>
                  <div>
                    <p style={{ fontSize: 22, color: '#94A3B8' }}>Friends referred</p>
                    <p style={{ fontSize: 120, fontWeight: 800, color: '#10B981', lineHeight: 1 }}>{stats.total_referrals}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 22, color: '#94A3B8' }}>Bonus days earned</p>
                    <p style={{ fontSize: 120, fontWeight: 800, color: '#FCD34D', lineHeight: 1 }}>+{stats.bonus_days_earned}</p>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 26, color: '#E5E7EB' }}>Join me on PerkWorth · use my code</p>
                  <p style={{ fontSize: 72, fontWeight: 800, color: '#FCD34D', fontFamily: 'JetBrains Mono, monospace', marginTop: 8 }}>{status?.referral_code}</p>
                  <p style={{ fontSize: 24, color: '#9CA3AF', marginTop: 16 }}>Both of us get 3 months FREE on Pro 🎁</p>
                  <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18, color: '#34D399', fontWeight: 700 }}>🔒</span>
                    <p style={{ fontSize: 16, color: '#9CA3AF', lineHeight: 1.5 }}>
                      Your data is encrypted &amp; private. We only track savings, not your identity.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-ink-500 text-center inline-flex items-center justify-center gap-1.5" data-testid="savings-report-trust-footer">
              <ShieldCheck className="w-3 h-3 text-emerald-800" />
              Your data is encrypted &amp; private. We only track savings, not your identity.
            </p>

            <GhostButton data-testid="share-savings-report" onClick={shareSavingsReport}>
              <ImageDown className="w-4 h-4" /> Share Savings Report card
            </GhostButton>
          </>
        ) : (
          <>
            <Card className="p-6 bg-gradient-to-br from-ink-900 to-emerald-900 text-white border-ink-800 relative overflow-hidden">
              <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-gold-500/20 blur-2xl" />
              <div className="flex items-center gap-2 mb-2"><Star className="w-4 h-4 text-gold-400" /><span className="text-[10px] uppercase tracking-[0.18em] font-bold text-gold-100">PerkWorth Pro</span></div>
              <p className="font-display text-2xl font-bold leading-tight">₹99 for 3 months</p>
              <ul className="mt-4 space-y-2 text-sm">
                {['Unlimited voucher storage', 'AI scan & SMS extract', 'Family Circle sharing', 'Membership ROI tracker', 'Smart expiry alerts'].map(t => (
                  <li key={t} className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold-300" /> {t}</li>
                ))}
              </ul>
              <PrimaryButton data-testid="activate-pro" onClick={startCheckout} disabled={busy || !online} className="mt-5 bg-gold-500 hover:bg-gold-600 shadow-none">
                {busy ? 'Opening checkout…' : online ? 'Pay ₹99 with Razorpay' : 'Offline · reconnect to pay'}
              </PrimaryButton>
              <p className="text-center text-[10px] text-white/60 mt-3">Razorpay test mode · UPI / Card / NetBanking · Auto-renews quarterly</p>
              {showDevBypass ? (
                <button
                  data-testid="dev-activate-bypass"
                  onClick={devActivate}
                  disabled={busy}
                  className="mt-4 w-full text-[11px] font-semibold uppercase tracking-wider text-amber-300 border border-amber-300/40 rounded-full py-2.5 hover:bg-amber-300/10 active:scale-95 transition"
                  title="Dev/preview-only: activate Pro without Razorpay (bypasses payment)"
                >
                  🛠 DEV ONLY · Activate without payment
                </button>
              ) : null}
            </Card>

            <Card className="p-5">
              <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Have a referral code?</label>
              <input
                data-testid="referral-input"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                placeholder="e.g. PERK-09092A"
                className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm font-mono tracking-wider placeholder:text-ink-400"
              />
              {refPreview ? (
                <p data-testid="referral-preview" className={`text-xs mt-2 leading-relaxed ${refPreview.valid ? 'text-emerald-800' : 'text-terracotta-700'}`}>
                  {refPreview.valid ? '🎁 ' : '⚠️ '}{refPreview.message}
                </p>
              ) : (
                <p className="text-xs text-ink-500 mt-2">Get <span className="font-bold">+3 months</span> bonus when you use a friend&apos;s code (they also get +3 months).</p>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  )
}
