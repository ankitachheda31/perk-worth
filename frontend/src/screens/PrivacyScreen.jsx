import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Card, GhostButton, TopBar } from '../components/ui'

export default function PrivacyScreen({ onBack, onOpenProtect }) {
  return (
    <>
      <TopBar title="Privacy Policy" onBack={onBack} subtitle="DPDP 2023 (India) & GDPR (EU) compliant" />
      <main className="px-5 space-y-4 text-sm text-ink-700 leading-relaxed pb-10">
        <Card className="p-5 bg-emerald-50/40 border-emerald-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <p className="font-display text-lg font-bold text-ink-900">Your data, your control</p>
          </div>
          <p className="text-xs text-ink-600">Last updated · February 2026 · Operator: PerkWorth · Contact: <span className="font-mono">support@perkworth.com</span></p>
          <GhostButton data-testid="privacy-open-protect" onClick={onOpenProtect} className="mt-4">
            <ShieldCheck className="w-4 h-4" /> How we protect you (plain English)
          </GhostButton>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">1. Data Protection Clause</p>
          <p>All wallet data (vouchers, points, memberships, family circle) is <span className="font-bold">encrypted in transit (TLS 1.3)</span> and stored in <span className="font-bold">encrypted MongoDB</span>. Your password is one-way hashed with <span className="font-bold">bcrypt</span> — recoverable only via reset, never by us.</p>
          <p><span className="font-bold">PerkWorth never sells, rents, or shares your financial data with third parties.</span> We do not run ads. We do not profile you. We make money exclusively from the ₹99/quarter Pro membership.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">2. What we collect</p>
          <p>• <span className="font-semibold">You provide:</span> Email, name, phone (optional), vouchers/codes/expiries you save.</p>
          <p>• <span className="font-semibold">SMS (Android only, with consent):</span> Filtered on-device for shopping keywords; only the SMS you tap &ldquo;Save&rdquo; reaches our backend.</p>
          <p>• <span className="font-semibold">Payments:</span> Razorpay processes payments. We retain only order_id, payment_id and signature — never card/UPI/bank credentials.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">3. What we do NOT collect</p>
          <p>✗ Bank OTPs · ✗ Personal chats · ✗ Contacts · ✗ Call logs · ✗ Location · ✗ Browsing history · ✗ Biometrics · ✗ Government IDs.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">4. Your rights — DPDP 2023 (India)</p>
          <p>Under the Digital Personal Data Protection Act 2023, you have the right to: <span className="font-semibold">access</span>, <span className="font-semibold">correct</span>, <span className="font-semibold">erase</span>, and <span className="font-semibold">withdraw consent</span> for your personal data. Use Settings → <span className="font-semibold">Clear All My Data</span> to exercise erasure instantly. Grievance Officer: <span className="font-mono">grievance@perkworth.com</span>.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">5. Your rights — GDPR (EU)</p>
          <p>If you are in the EEA/UK, GDPR Articles 15–22 apply: right to <span className="font-semibold">access (Art.15)</span>, <span className="font-semibold">rectification (Art.16)</span>, <span className="font-semibold">erasure / &ldquo;right to be forgotten&rdquo; (Art.17)</span>, <span className="font-semibold">data portability (Art.20)</span>, and to <span className="font-semibold">object (Art.21)</span>. Lawful basis: consent (SMS), contract (membership), legitimate interest (fraud-prevention on payments). DPO: <span className="font-mono">dpo@perkworth.com</span>.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">6. Sub-processors</p>
          <p>• <span className="font-semibold">OpenAI / Emergent</span> — for OCR & SMS parsing (data-processing-only, no training).</p>
          <p>• <span className="font-semibold">Razorpay</span> — PCI-DSS payment processor.</p>
          <p>• <span className="font-semibold">MongoDB Atlas</span> — encrypted database hosting (Mumbai region).</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">7. Retention & deletion</p>
          <p>We retain your data only as long as your account is active. Tap <span className="font-semibold">Clear All My Data</span> to delete everything immediately. Backups are purged within 30 days.</p>
        </Card>

        <p className="text-[11px] text-ink-500 pt-2 text-center">Full policy · <span className="font-mono">perkworth.app/privacy</span></p>
      </main>
    </>
  )
}
