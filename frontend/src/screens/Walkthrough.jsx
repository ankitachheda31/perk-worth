import React, { useState } from 'react'
import { ShieldCheck, ScanLine, Sparkles, Users, ArrowRight, Check, X } from 'lucide-react'

const SLIDES = [
  {
    id: 'tracking',
    accent: 'emerald',
    icon: ScanLine,
    eyebrow: 'STEP 01 · आपके कूपन्स',
    title: 'How we track your coupons',
    body: 'Auto-scan SMS, scan paper vouchers with the camera, or paste promos in bulk. PerkWorth reads, parses, and saves every brand-loyalty code in one tap.',
    demo: (
      <div className="bg-white rounded-2xl border border-emerald-200 p-4 space-y-2 shadow-soft">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Swiggy</span>
          <span className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">Auto-saved</span>
        </div>
        <p className="font-display font-bold text-ink-900 text-sm leading-tight">Flat ₹150 off on Instamart</p>
        <code className="block bg-ink-50 rounded-lg px-2 py-1.5 text-xs font-mono tracking-widest text-ink-800">SWIGGY150</code>
        <p className="text-[10px] text-ink-500">Expires 25 Nov · saved from SMS</p>
      </div>
    ),
  },
  {
    id: 'growing',
    accent: 'gold',
    icon: Sparkles,
    eyebrow: 'STEP 02 · आपके पॉइंट्स',
    title: 'How you can grow your points',
    body: 'Perk Tips tells you the smartest way to redeem — e.g., transfer HDFC points to airline miles for 2x value, or stack SuperCoins on Cleartrip for 4x.',
    demo: (
      <div className="bg-gradient-to-br from-gold-50 to-amber-100 rounded-2xl border border-gold-200 p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-700" />
          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-800">Perk tip</span>
        </div>
        <p className="font-display font-bold text-ink-900 text-sm">Tata NeuCoins · 1.2x on BigBasket</p>
        <p className="text-[11px] text-ink-700 leading-relaxed">You have 1,200 coins. Redeem on BigBasket for ₹1,440 value (vs ₹1,200 elsewhere).</p>
        <p className="text-[11px] font-bold text-emerald-800 mt-1">+₹240 extra unlocked</p>
      </div>
    ),
  },
  {
    id: 'family',
    accent: 'rose',
    icon: Users,
    eyebrow: 'STEP 03 · फैमिली शेयरिंग',
    title: 'Share with your family — privately',
    body: 'Family Circle lets you share specific vouchers with specific members. No group chats, no screenshots, no accidental sharing.',
    demo: (
      <div className="bg-white rounded-2xl border border-ink-200 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-rose-100 grid place-items-center text-rose-700 font-display font-bold text-xs">P</div>
          <div>
            <p className="font-display font-bold text-ink-900 text-sm leading-none">Priya · Wife</p>
            <p className="text-[10px] text-ink-500 mt-0.5">2 vouchers shared</p>
          </div>
        </div>
        <div className="bg-ink-50 rounded-xl p-2">
          <p className="text-[11px] font-bold text-ink-900">Myntra · 20% off premium brands</p>
          <p className="text-[10px] text-ink-500">Shared with Priya only</p>
        </div>
      </div>
    ),
  },
  {
    id: 'safe',
    accent: 'emerald',
    icon: ShieldCheck,
    eyebrow: 'STEP 04 · सुरक्षा का वादा',
    title: 'Why PerkWorth is safe',
    body: 'We never read bank OTPs or personal chats. Your data is encrypted and never sold. You can wipe your account in one tap.',
    demo: (
      <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-emerald-800 text-xs"><Check className="w-3.5 h-3.5" /> <span>Only shopping &amp; loyalty SMS scanned</span></div>
        <div className="flex items-center gap-2 text-emerald-800 text-xs"><Check className="w-3.5 h-3.5" /> <span>Encrypted at rest &amp; in transit</span></div>
        <div className="flex items-center gap-2 text-emerald-800 text-xs"><Check className="w-3.5 h-3.5" /> <span>One-tap delete from Settings</span></div>
        <div className="flex items-center gap-2 text-terracotta-700 text-xs"><X className="w-3.5 h-3.5" /> <span>We never read bank OTPs</span></div>
        <div className="flex items-center gap-2 text-terracotta-700 text-xs"><X className="w-3.5 h-3.5" /> <span>We never sell your data</span></div>
      </div>
    ),
  },
]

const accentMap = {
  emerald: 'bg-emerald-800 text-white',
  gold: 'bg-gold-500 text-ink-900',
  rose: 'bg-rose-500 text-white',
}

export default function Walkthrough({ onComplete }) {
  const [idx, setIdx] = useState(0)
  const slide = SLIDES[idx]
  const last = idx === SLIDES.length - 1

  return (
    <div className="min-h-[100dvh] w-full bg-cream flex flex-col" data-testid="walkthrough">
      <header className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold text-sm">P</div>
          <span className="font-display font-bold text-ink-900">PerkWorth</span>
        </div>
        <button
          data-testid="walkthrough-skip"
          onClick={onComplete}
          className="text-xs font-semibold text-ink-500 hover:text-ink-800 underline underline-offset-4"
        >
          Skip tour
        </button>
      </header>

      <div className="flex-1 px-6 py-4 flex flex-col">
        <div className="flex gap-1.5 mb-6" data-testid="walkthrough-progress">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all ${i <= idx ? 'bg-emerald-800' : 'bg-ink-200'}`}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col justify-center" key={slide.id}>
          <div className={`w-16 h-16 rounded-2xl grid place-items-center ${accentMap[slide.accent]} mb-5 page-enter`}>
            <slide.icon className="w-7 h-7" strokeWidth={2} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-ink-500 page-enter" data-testid={`slide-eyebrow-${slide.id}`}>{slide.eyebrow}</p>
          <h1 className="font-display text-3xl font-bold text-ink-900 leading-tight mt-2 page-enter">{slide.title}</h1>
          <p className="text-sm text-ink-600 mt-3 leading-relaxed page-enter">{slide.body}</p>
          <div className="mt-6 page-enter" data-testid={`slide-demo-${slide.id}`}>{slide.demo}</div>
        </div>

        <div className="pt-6 pb-8">
          <button
            data-testid="walkthrough-next"
            onClick={() => last ? onComplete() : setIdx(i => i + 1)}
            className="w-full bg-emerald-800 text-white font-semibold py-4 rounded-full shadow-emerald inline-flex items-center justify-center gap-2 active:scale-95 transition"
          >
            {last ? 'Get started' : 'Continue'} <ArrowRight className="w-4 h-4" />
          </button>
          {idx > 0 && (
            <button
              data-testid="walkthrough-back"
              onClick={() => setIdx(i => i - 1)}
              className="w-full text-center mt-3 text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              ← Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
