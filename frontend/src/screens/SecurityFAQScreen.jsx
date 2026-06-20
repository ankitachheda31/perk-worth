import React, { useState } from 'react'
import { Lock, EyeOff, Database, ShieldCheck, Smartphone, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, TopBar } from '../components/ui'

const FAQ = [
  {
    q: 'Can you read my bank OTPs?',
    icon: Lock,
    a: 'No. PerkWorth only scans SMS that match shopping or loyalty keywords like "₹ off", "voucher", "code", "expires", "points", "loyalty". OTP messages, transaction alerts, and DLT-flagged confidential SMS are filtered out on-device before anything reaches our servers.',
  },
  {
    q: 'Is my data encrypted?',
    icon: ShieldCheck,
    a: 'Yes. Every API call uses HTTPS / TLS 1.3 in transit. At rest, your wallet is stored in encrypted MongoDB Atlas (AES-256). Passwords are one-way hashed with bcrypt — even PerkWorth engineers cannot read them.',
  },
  {
    q: 'Who has access to my data?',
    icon: Database,
    a: 'Only you. We do not sell, rent, or share your personal or financial data with advertisers, data brokers, or analytics platforms. Engineering access to production is logged and limited to incident response under audit.',
  },
  {
    q: 'Where does the SMS body actually go?',
    icon: Smartphone,
    a: 'When you tap "Save" on a detected voucher, only that single SMS body is sent (via HTTPS) to our backend, which forwards it to OpenAI GPT-4o for one-shot extraction. The raw SMS is not retained server-side — only the structured fields (brand, code, expiry, value) are stored against your account.',
  },
  {
    q: 'What happens if I delete my data?',
    icon: EyeOff,
    a: 'Settings → Clear All My Data wipes your account, your wallet, payments history, referrals, and notifications immediately. Database backups are purged within 30 days. This is irreversible by design.',
  },
  {
    q: 'Do you train AI models on my data?',
    icon: Lock,
    a: 'No. SMS and image extraction calls to OpenAI are sent with the data-processing-only header — no training, no profiling. We do not run any in-house ML training on your data.',
  },
  {
    q: 'What about payments?',
    icon: ShieldCheck,
    a: 'Razorpay (PCI-DSS Level 1) handles every transaction. We store only the order_id, payment_id, and HMAC-SHA256 signature for verification. Your card number, UPI ID, and bank credentials never touch our servers.',
  },
  {
    q: 'Can I revoke SMS access later?',
    icon: Smartphone,
    a: 'Yes, anytime. Android Settings → Apps → PerkWorth → Permissions → SMS → Deny. The app keeps working — you can just paste SMS manually via "Add new → Paste SMS".',
  },
]

function FaqItem({ item, open, onToggle, idx }) {
  const Icon = item.icon
  return (
    <Card className="p-0 overflow-hidden">
      <button
        data-testid={`faq-toggle-${idx}`}
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-ink-50 transition"
      >
        <div className="w-9 h-9 rounded-full bg-emerald-50 grid place-items-center shrink-0">
          <Icon className="w-4 h-4 text-emerald-800" />
        </div>
        <p className="flex-1 font-display font-bold text-ink-900 text-sm">{item.q}</p>
        {open ? <ChevronUp className="w-4 h-4 text-ink-500" /> : <ChevronDown className="w-4 h-4 text-ink-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pl-[3.75rem]" data-testid={`faq-answer-${idx}`}>
          <p className="text-sm text-ink-700 leading-relaxed">{item.a}</p>
        </div>
      )}
    </Card>
  )
}

export default function SecurityFAQScreen({ onBack, onOpenProtect }) {
  const [open, setOpen] = useState(0)
  return (
    <>
      <TopBar title="Security FAQ" onBack={onBack} subtitle="Real questions, plain answers" />
      <main className="px-5 space-y-3 pb-10">
        <Card className="p-5 bg-emerald-50/40 border-emerald-200" data-testid="faq-hero">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <p className="font-display font-bold text-ink-900">Trust, on your terms</p>
          </div>
          <p className="text-xs text-ink-600 leading-relaxed">
            We get these questions a lot — here&apos;s exactly how PerkWorth handles your data. No legalese.
          </p>
          <button
            data-testid="faq-open-protect"
            onClick={onOpenProtect}
            className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300"
          >
            See the full &ldquo;How we protect you&rdquo; deck →
          </button>
        </Card>

        {FAQ.map((item, i) => (
          <FaqItem
            key={item.q}
            item={item}
            idx={i}
            open={open === i}
            onToggle={() => setOpen(open === i ? -1 : i)}
          />
        ))}

        <p className="text-[11px] text-ink-500 text-center pt-2">
          Still got questions? WhatsApp us at <span className="font-mono">+91 98202 04866</span>.
        </p>
      </main>
    </>
  )
}
