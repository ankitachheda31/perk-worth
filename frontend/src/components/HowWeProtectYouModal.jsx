import React from 'react'
import { ShieldCheck, X, Lock, EyeOff, Database, Smartphone } from 'lucide-react'

const ITEMS = [
  { icon: Lock, title: 'Encrypted in transit & at rest', body: 'All wallet data travels over HTTPS (TLS 1.3) and is stored in encrypted MongoDB. Your password is one-way hashed with bcrypt — even we can\'t read it.' },
  { icon: EyeOff, title: 'We never read bank OTPs or personal chats', body: 'When you grant SMS access, PerkWorth only scans messages matching shopping/loyalty keywords (e.g. "₹", "off", "code", "voucher", "expires"). Bank OTPs, family chats, and DLT-flagged transactional SMS are skipped on-device.' },
  { icon: Database, title: 'We never sell your data', body: 'PerkWorth makes money from the ₹99/quarter Pro membership — not from ads or data brokers. Your vouchers, points, and savings are never sold, rented, or shared with advertisers.' },
  { icon: ShieldCheck, title: 'You stay in control', body: 'Export, delete, or wipe your entire wallet anytime from Settings → Clear All My Data. We honour your DPDP 2023 (India) and GDPR (EU) rights within 30 days.' },
  { icon: Smartphone, title: 'On-device first', body: 'Your 4-digit unlock PIN never leaves this device. SMS bodies are sent to our backend only for the one voucher you tap "Save" on — never in bulk.' },
]

export default function HowWeProtectYouModal({ open, onClose }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center" data-testid="how-we-protect-modal" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-cream rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 bg-cream/95 backdrop-blur px-5 pt-5 pb-3 flex items-center justify-between border-b border-ink-100">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <h2 className="font-display text-xl font-bold text-ink-900">How we protect you</h2>
          </div>
          <button data-testid="how-we-protect-close" onClick={onClose} className="w-9 h-9 rounded-full bg-white border border-ink-200 grid place-items-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-ink-600 leading-relaxed">
            PerkWorth is built privacy-first. Here&apos;s exactly what that means — in plain English (and हिन्दी).
          </p>
          {ITEMS.map((it, i) => (
            <div key={i} className="bg-white border border-ink-200 rounded-2xl p-4 flex gap-3" data-testid={`protect-item-${i}`}>
              <div className="w-10 h-10 rounded-full bg-emerald-50 grid place-items-center shrink-0">
                <it.icon className="w-5 h-5 text-emerald-800" />
              </div>
              <div className="min-w-0">
                <p className="font-display font-bold text-ink-900 text-sm">{it.title}</p>
                <p className="text-xs text-ink-600 mt-1 leading-relaxed">{it.body}</p>
              </div>
            </div>
          ))}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mt-3">
            <p className="text-xs text-emerald-900 leading-relaxed">
              <span className="font-bold">Questions?</span> Email <span className="font-mono">support@perkworth.com</span> or message us on WhatsApp +91 98202 04866. We reply within 24 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
