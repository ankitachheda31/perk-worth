import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Home, Ticket, Coins, Users, ChevronRight, Search, Plus, Sparkles, Copy, Clock, Share2, BadgeCheck, ArrowLeft, X, ScanLine, MessageSquareText, KeyRound, Trash2, Star, ShieldCheck, Camera, LinkIcon, UserPlus, Settings as SettingsIcon, LogOut, ChevronDown, Bell, Mic, RefreshCw, ImageDown, LifeBuoy, FileText, MessageCircle, Smartphone, Lock, EyeOff, Database, AlertTriangle, Check } from 'lucide-react'
import { Card, GhostButton, PrimaryButton, ProgressBar, Sheet, Tag, TopBar, Shell, Empty, Toast } from './components/ui'
import PinLock from './screens/PinLock'
import AuthScreen from './screens/AuthScreen'
import Walkthrough from './screens/Walkthrough'
import SmartDiscoveryScreen from './screens/SmartDiscoveryScreen'
import PerkTipsScreen from './screens/PerkTipsScreen'
import SecurityFAQScreen from './screens/SecurityFAQScreen'
import PrivacyControlScreen from './screens/PrivacyControlScreen'
import { Auth, Vouchers, Points, Memberships, Search as SearchApi, Extract, Circle, Membership, Notifications, Referrals, Support } from './lib/api'
import { getStoredPin, setStoredPin, getProfile, setProfile } from './lib/store'
import { openRazorpayCheckout } from './lib/razorpay'
import { OfflineBanner } from './components/ui'
import { ensureServiceWorker, requestNotificationPermission, maybeFireBrowserNotifications } from './lib/push'
import usePullToRefresh from './lib/usePullToRefresh'
import { isVoiceSupported, startVoiceRecognition } from './lib/voice'
import { isNativeSmsAvailable, checkSmsPermission, requestSmsPermission, readRecentSms, getLastScanTs, setLastScanTs, isLikelyVoucherSms } from './lib/smsScanner'
import { toPng } from 'html-to-image'

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID
const WA_SUPPORT_NUMBER = '919820204866' // Perk Orbit support

// ---------- Helpers ----------
function daysUntil(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / (1000 * 60 * 60 * 24))
}
function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return iso }
}
function fmtINR(v) {
  if (v == null) return '—'
  return '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

// ---------- Bottom Nav ----------
function BottomNav({ active, onChange }) {
  const items = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'coupons', label: 'My Coupons', icon: Ticket },
    { id: 'points', label: 'My Points', icon: Coins },
    { id: 'circle', label: 'Circle', icon: Users },
  ]
  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[rgba(255,255,255,0.92)] backdrop-blur-2xl border-t border-ink-200 flex justify-around items-center z-40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const isActive = active === id
        return (
          <button
            key={id}
            data-testid={`nav-${id}`}
            onClick={() => onChange(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 transition ${isActive ? 'text-emerald-800' : 'text-ink-400'}`}
          >
            <Icon strokeWidth={isActive ? 2.4 : 1.8} className="w-[22px] h-[22px]" />
            <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ---------- Profile Menu (top-right) ----------
function ProfileMenu({ open, onClose, onNavigate, memberStatus }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40" onClick={onClose} data-testid="profile-menu-backdrop">
      <div
        onClick={(e) => e.stopPropagation()}
        data-testid="profile-menu"
        className="absolute top-16 right-3 w-[78%] max-w-[300px] bg-white border border-ink-200 rounded-3xl shadow-card overflow-hidden page-enter"
      >
        <button data-testid="menu-profile" onClick={() => { onNavigate('profile'); onClose() }} className="w-full flex items-center gap-3 px-5 py-4 hover:bg-ink-50 transition">
          <div className="w-10 h-10 rounded-full bg-emerald-100 grid place-items-center text-emerald-800 font-display font-bold">{(getProfile().name || 'M')[0]}</div>
          <div className="text-left min-w-0 flex-1">
            <p className="font-display font-semibold text-ink-900 text-sm leading-tight">{getProfile().name || 'Member'}</p>
            <p className="text-[11px] text-ink-500 truncate">View profile</p>
          </div>
          <span data-testid="profile-encrypted-badge" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <ShieldCheck className="w-3 h-3" /> Encrypted
          </span>
        </button>
        <div className="border-t border-ink-100" />
        <button data-testid="menu-membership" onClick={() => { onNavigate('membership'); onClose() }} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-ink-50">
          <div className="flex items-center gap-3">
            <Star className="w-4 h-4 text-gold-500" />
            <span className="text-sm font-semibold text-ink-800">Membership</span>
          </div>
          {memberStatus?.active ? <Tag tone="gold">Active</Tag> : <Tag tone="neutral">₹99</Tag>}
        </button>
        <button data-testid="menu-perk-tips" onClick={() => { onNavigate('perk-tips'); onClose() }} className="w-full flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-ink-50">
          <div className="flex items-center gap-3">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <span className="text-sm font-semibold text-ink-800">Perk Tips</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">Masterclass</span>
        </button>
        <button data-testid="menu-circle" onClick={() => { onNavigate('circle'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <UserPlus className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Family Circle</span>
        </button>
        <button data-testid="menu-sms-scanner" onClick={() => { onNavigate('sms-scanner'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <Smartphone className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">SMS Auto-Scanner</span>
        </button>
        <button data-testid="menu-support" onClick={() => { onNavigate('support'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <LifeBuoy className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Support History</span>
        </button>
        <button data-testid="menu-privacy" onClick={() => { onNavigate('privacy'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <FileText className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Privacy Policy</span>
        </button>
        <button data-testid="menu-protect" onClick={() => { onNavigate('protect'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <ShieldCheck className="w-4 h-4 text-emerald-800" />
          <span className="text-sm font-semibold text-ink-800">How we protect you</span>
        </button>
        <button data-testid="menu-faq" onClick={() => { onNavigate('faq'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <MessageCircle className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Security FAQ</span>
        </button>
        <button data-testid="menu-privacy-control" onClick={() => { onNavigate('privacy-control'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <Lock className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Privacy Control</span>
        </button>
        <button data-testid="menu-settings" onClick={() => { onNavigate('settings'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50">
          <SettingsIcon className="w-4 h-4 text-ink-700" />
          <span className="text-sm font-semibold text-ink-800">Settings</span>
        </button>
        <div className="border-t border-ink-100" />
        <button data-testid="menu-lock" onClick={() => { onNavigate('lock'); onClose() }} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50 text-terracotta-700">
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-semibold">Lock app</span>
        </button>
      </div>
    </div>
  )
}

// ---------- Trust & Transparency: How We Protect You modal ----------
function HowWeProtectYouModal({ open, onClose }) {
  if (!open) return null
  const items = [
    {
      icon: Lock,
      title: 'Encrypted in transit & at rest',
      body: 'All wallet data travels over HTTPS (TLS 1.3) and is stored in encrypted MongoDB. Your password is one-way hashed with bcrypt — even we can\'t read it.',
    },
    {
      icon: EyeOff,
      title: 'We never read bank OTPs or personal chats',
      body: 'When you grant SMS access, Perk Orbit only scans messages matching shopping/loyalty keywords (e.g. "₹", "off", "code", "voucher", "expires"). Bank OTPs, family chats, and DLT-flagged transactional SMS are skipped on-device.',
    },
    {
      icon: Database,
      title: 'We never sell your data',
      body: 'Perk Orbit makes money from the ₹99/quarter Pro membership — not from ads or data brokers. Your vouchers, points, and savings are never sold, rented, or shared with advertisers.',
    },
    {
      icon: ShieldCheck,
      title: 'You stay in control',
      body: 'Export, delete, or wipe your entire wallet anytime from Settings → Clear All My Data. We honour your DPDP 2023 (India) and GDPR (EU) rights within 30 days.',
    },
    {
      icon: Smartphone,
      title: 'On-device first',
      body: 'Your 4-digit unlock PIN never leaves this device. SMS bodies are sent to our backend only for the one voucher you tap "Save" on — never in bulk.',
    },
  ]
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
            Perk Orbit is built privacy-first. Here&apos;s exactly what that means — in plain English (and हिन्दी).
          </p>
          {items.map((it, i) => (
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
              <span className="font-bold">Questions?</span> Email <span className="font-mono">support@perkorbit.app</span> or message us on WhatsApp +91 98202 04866. We reply within 24 hours.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- SMS Auto-Scanner Screen ----------
function PtrIndicator({ pullY, refreshing }) {
  if (!pullY && !refreshing) return null
  const opacity = refreshing ? 1 : Math.min(1, pullY / 70)
  return (
    <div
      data-testid="ptr-indicator"
      className="fixed left-1/2 -translate-x-1/2 z-[45] w-9 h-9 rounded-full bg-white border border-ink-200 shadow-card grid place-items-center"
      style={{ top: `${Math.min(60, 10 + (refreshing ? 40 : pullY * 0.6))}px`, opacity }}
    >
      <RefreshCw className={`w-4 h-4 text-emerald-800 ${refreshing ? 'animate-spin' : ''}`} />
    </div>
  )
}

function VoiceMicButton({ onText, lang = 'en-IN' }) {
  const [listening, setListening] = useState(false)
  if (!isVoiceSupported) return null
  const handle = () => {
    if (listening) return
    setListening(true)
    startVoiceRecognition({
      lang,
      onResult: (t) => onText(t),
      onEnd: () => setListening(false),
      onError: () => setListening(false),
    })
  }
  return (
    <button
      data-testid="voice-search-btn"
      onClick={handle}
      aria-label="Voice search"
      className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full transition ${listening ? 'bg-terracotta-600 text-white animate-pulse' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'} active:scale-95`}
    >
      <Mic className="w-4 h-4" />
    </button>
  )
}

function SmsScannerScreen({ onBack, pin, toast, onSaved, onOpenProtect }) {
  const native = isNativeSmsAvailable()
  const [perm, setPerm] = useState({ granted: false })
  const [scanning, setScanning] = useState(false)
  const [candidates, setCandidates] = useState([]) // [{address, body, extracted}]
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
      // Pre-extract each in parallel (max 5)
      const out = []
      for (const sms of filtered.slice(0, 10)) {
        try {
          const extracted = await Extract.sms(sms.body)
          if (extracted?.brand && extracted?.title) {
            out.push({ ...sms, extracted })
          }
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
        user_pin: pin,
        type: d.category === 'memberships' ? 'membership' : 'voucher',
        brand: d.brand,
        title: d.title,
        code: d.code || null,
        value: d.value || null,
        expiry: d.expiry || null,
        category: d.category || 'vouchers',
        how_to_redeem: d.how_to_redeem || null,
      })
      setCandidates(prev => prev.filter(x => x !== c))
      toast(`Saved ${d.brand}`)
      onSaved?.()
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
            <p className="text-sm text-ink-500 mt-1">Browsers cannot read SMS due to platform security. Install the Perk Orbit Android app from Play Store to enable automatic SMS scanning.</p>
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
              <button
                data-testid="sms-learn-more"
                onClick={onOpenProtect}
                className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300 hover:decoration-emerald-700"
              >
                Learn more → How we protect you
              </button>
            </Card>

            <Card className="p-5">
              <label className="flex items-start gap-3 cursor-pointer" data-testid="sms-acknowledge">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-emerald-700"
                />
                <span className="text-xs text-ink-700 leading-relaxed">
                  I understand Perk Orbit will scan my SMS <span className="font-semibold">only for vouchers and loyalty offers</span>, and that I can revoke this anytime from device Settings.
                </span>
              </label>
              <PrimaryButton
                data-testid="sms-grant"
                onClick={grant}
                disabled={!acknowledged}
                className="mt-4"
              >
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
                        {busyId === c.body ? 'Saving…' : 'Save to Perk Orbit'}
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

// ---------- Support History ----------
function SupportHistoryScreen({ onBack, pin }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { Support.history(pin).then(setItems).finally(() => setLoading(false)) }, [pin])
  return (
    <>
      <TopBar title="Support History" onBack={onBack} subtitle="Your WhatsApp Help requests" />
      <main className="px-5 space-y-3">
        {loading ? (
          <div className="space-y-3">{[0,1].map(i => <div key={i} className="h-20 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <Empty title="No support requests yet" sub="Tap the WhatsApp icon on any voucher to get help — we'll log it here." icon={<LifeBuoy className="w-6 h-6" />} testid="empty-support" />
        ) : (
          <div className="space-y-2" data-testid="support-list">
            {items.map(s => (
              <Card key={s.id} className="p-4" data-testid={`support-${s.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-bold text-ink-900">{s.brand || 'Help request'}</p>
                    <p className="text-[11px] text-ink-500">{fmtDate(s.created_at)} · via {s.channel}</p>
                  </div>
                  <Tag tone="emerald"><MessageCircle className="w-3 h-3 mr-0.5" /> WhatsApp</Tag>
                </div>
                {s.title ? <p className="text-xs text-ink-700 mt-1">{s.title}</p> : null}
                {s.code ? <code className="text-[10px] code-box inline-block mt-2">{s.code}</code> : null}
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ---------- Privacy Policy ----------
function PrivacyScreen({ onBack, onOpenProtect }) {
  return (
    <>
      <TopBar title="Privacy Policy" onBack={onBack} subtitle="DPDP 2023 (India) & GDPR (EU) compliant" />
      <main className="px-5 space-y-4 text-sm text-ink-700 leading-relaxed pb-10">
        <Card className="p-5 bg-emerald-50/40 border-emerald-200">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <p className="font-display text-lg font-bold text-ink-900">Your data, your control</p>
          </div>
          <p className="text-xs text-ink-600">Last updated · February 2026 · Operator: Perk Orbit · Contact: <span className="font-mono">support@perkorbit.app</span></p>
          <GhostButton data-testid="privacy-open-protect" onClick={onOpenProtect} className="mt-4">
            <ShieldCheck className="w-4 h-4" /> How we protect you (plain English)
          </GhostButton>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">1. Data Protection Clause</p>
          <p>All wallet data (vouchers, points, memberships, family circle) is <span className="font-bold">encrypted in transit (TLS 1.3)</span> and stored in <span className="font-bold">encrypted MongoDB</span>. Your password is one-way hashed with <span className="font-bold">bcrypt</span> — recoverable only via reset, never by us.</p>
          <p><span className="font-bold">Perk Orbit never sells, rents, or shares your financial data with third parties.</span> We do not run ads. We do not profile you. We make money exclusively from the ₹99/quarter Pro membership.</p>
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
          <p>Under the Digital Personal Data Protection Act 2023, you have the right to: <span className="font-semibold">access</span>, <span className="font-semibold">correct</span>, <span className="font-semibold">erase</span>, and <span className="font-semibold">withdraw consent</span> for your personal data. Use Settings → <span className="font-semibold">Clear All My Data</span> to exercise erasure instantly. Grievance Officer: <span className="font-mono">grievance@perkorbit.app</span>.</p>
        </Card>

        <Card className="p-5 space-y-2">
          <p className="font-display font-bold text-ink-900">5. Your rights — GDPR (EU)</p>
          <p>If you are in the EEA/UK, GDPR Articles 15–22 apply: right to <span className="font-semibold">access (Art.15)</span>, <span className="font-semibold">rectification (Art.16)</span>, <span className="font-semibold">erasure / &ldquo;right to be forgotten&rdquo; (Art.17)</span>, <span className="font-semibold">data portability (Art.20)</span>, and to <span className="font-semibold">object (Art.21)</span>. Lawful basis: consent (SMS), contract (membership), legitimate interest (fraud-prevention on payments). DPO: <span className="font-mono">dpo@perkorbit.app</span>.</p>
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

        <p className="text-[11px] text-ink-500 pt-2 text-center">
          Full policy · <span className="font-mono">perkorbit.app/privacy</span>
        </p>
      </main>
    </>
  )
}

// ---------- Voucher Card ----------
function buildWaHelpUrl(v) {
  const text = encodeURIComponent(
    `Hi Perk Orbit support — I need help with this voucher:\n\n• Brand: ${v.brand || '—'}\n• Title: ${v.title || '—'}\n• Code: ${v.code || '—'}\n• Issue: This code is not working / I cannot redeem it.\n\nPlease assist.`
  )
  return `https://wa.me/${WA_SUPPORT_NUMBER}?text=${text}`
}

async function logSupportThenOpenWa(v, pin) {
  try {
    await Support.log({
      user_pin: pin,
      voucher_id: v.id,
      brand: v.brand,
      title: v.title,
      code: v.code,
      issue: 'code-not-working',
      channel: 'whatsapp',
    })
  } catch { /* ignore logging failure */ }
  window.open(buildWaHelpUrl(v), '_blank', 'noopener,noreferrer')
}

function VoucherCard({ v, onCopy, onHowTo, onDelete, onShare, onUnshare, pin }) {
  const dleft = daysUntil(v.expiry)
  const endingSoon = dleft != null && dleft <= 7 && dleft >= 0
  return (
    <div className="ticket p-4 page-enter" data-testid={`voucher-${v.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-display font-bold text-ink-900 text-base truncate">{v.brand}</span>
            {v.parent_company && v.parent_company !== v.brand ? (
              <Tag tone="neutral">{v.parent_company}</Tag>
            ) : null}
          </div>
          <p className="text-sm text-ink-700 leading-snug">{v.title}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {v.value ? <span className="text-emerald-800 font-display font-bold text-sm">{fmtINR(v.value)} off</span> : null}
            {v.expiry ? (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${endingSoon ? 'text-terracotta-700' : 'text-ink-500'}`}>
                <Clock className="w-3 h-3" />
                {endingSoon ? `${dleft} day${dleft === 1 ? '' : 's'} left` : `Expires ${fmtDate(v.expiry)}`}
              </span>
            ) : null}
            {v.is_sharing ? <Tag tone="emerald">Shared</Tag> : null}
          </div>
        </div>
        {v.code ? <div className="code-box text-xs whitespace-nowrap">{v.code}</div> : null}
      </div>

      <div className="mt-3 pt-3 border-t border-dashed border-ink-200 flex items-center gap-2">
        {v.code ? (
          <button data-testid={`copy-${v.id}`} onClick={() => onCopy(v)} className="flex-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2 rounded-full active:scale-95 transition flex items-center justify-center gap-1.5">
            <Copy className="w-3.5 h-3.5" /> Copy code
          </button>
        ) : null}
        <button data-testid={`howto-${v.id}`} onClick={() => onHowTo(v)} className="flex-1 text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 py-2 rounded-full active:scale-95 transition flex items-center justify-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> How to redeem
        </button>
        <button data-testid={`share-${v.id}`} onClick={() => v.is_sharing ? onUnshare(v) : onShare(v)} className="text-xs font-semibold text-ink-700 bg-ink-100 hover:bg-ink-200 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center">
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <a
          data-testid={`wa-help-${v.id}`}
          href={buildWaHelpUrl(v)}
          onClick={(e) => { if (pin) { e.preventDefault(); logSupportThenOpenWa(v, pin) } }}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center"
          title="Get help on WhatsApp"
        >
          <MessageSquareText className="w-3.5 h-3.5" />
        </a>
        <button data-testid={`delete-${v.id}`} onClick={() => onDelete(v)} className="text-xs font-semibold text-terracotta-700 bg-terracotta-50 hover:bg-terracotta-50 py-2 px-3 rounded-full active:scale-95 transition flex items-center justify-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------- Membership Card ----------
function MembershipCard({ m, onUpdateSavings }) {
  const kind = m.membership_kind || 'asset'
  const isAsset = kind === 'asset'
  const fee = m.fee_paid || 0
  const saved = m.savings_realized || 0
  const progress = fee > 0 ? Math.min(100, (saved / fee) * 100) : 0
  const breakEven = saved >= fee && fee > 0

  return (
    <div className="rounded-3xl border border-ink-200 p-5 bg-gradient-to-br from-ink-900 to-ink-800 text-white shadow-card overflow-hidden relative page-enter" data-testid={`membership-${m.id}`}>
      <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
      <div className="flex items-start justify-between gap-3 relative">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-bold tracking-[0.18em] text-white/60">{isAsset ? 'Retail / Asset' : 'Subscription'}</p>
          <h3 className="font-display text-xl font-bold mt-1">{m.brand}</h3>
          {m.parent_company && m.parent_company !== m.brand ? (
            <p className="text-[11px] text-white/60 mt-0.5">By {m.parent_company}</p>
          ) : null}
        </div>
        <Tag tone={isAsset ? 'gold' : 'neutral'}>{isAsset ? 'ROI' : 'Renews'}</Tag>
      </div>

      <p className="text-sm text-white/80 mt-2">{m.title}</p>

      {isAsset ? (
        <div className="mt-5 space-y-2 relative">
          <div className="flex justify-between text-xs">
            <span className="text-white/70">Break-even</span>
            <span className="font-semibold">{fmtINR(saved)} / {fmtINR(fee)}</span>
          </div>
          <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${breakEven ? 'bg-emerald-500' : 'bg-gold-500'}`} style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-white/70">
              {breakEven ? 'Worth renewing — saved more than fee' : progress >= 60 ? 'On track — keep using' : 'Needs more usage to break-even'}
            </p>
            <button data-testid={`log-savings-${m.id}`} onClick={() => onUpdateSavings(m)} className="text-[11px] font-semibold text-gold-100 underline">Log savings</button>
          </div>
        </div>
      ) : (
        <div className="mt-5 relative">
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/70">Next renewal</span>
            <span className="font-semibold">{fmtDate(m.expiry) || '—'}</span>
          </div>
          <p className="text-[11px] text-white/70 mt-2">Content subscription — ROI tracking not applicable</p>
        </div>
      )}
    </div>
  )
}

// ---------- Add Voucher Sheet ----------
function AddVoucherSheet({ open, onClose, pin, onSaved, toast }) {
  const [mode, setMode] = useState('manual') // manual | scan | sms
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ brand: '', title: '', code: '', value: '', expiry: '', category: 'vouchers', membership_kind: '', fee_paid: '', how_to_redeem: '', notes: '' })
  const [smsText, setSmsText] = useState('')
  const [imagePreview, setImagePreview] = useState(null)

  const reset = () => {
    setForm({ brand: '', title: '', code: '', value: '', expiry: '', category: 'vouchers', membership_kind: '', fee_paid: '', how_to_redeem: '', notes: '' })
    setSmsText(''); setImagePreview(null); setMode('manual')
  }

  const handleSave = async () => {
    if (!form.brand || !form.title) { toast('Brand and title are required'); return }
    setBusy(true)
    try {
      const payload = {
        user_pin: pin,
        type: form.category === 'memberships' ? 'membership' : 'voucher',
        brand: form.brand,
        title: form.title,
        code: form.code || null,
        value: form.value ? Number(form.value) : null,
        expiry: form.expiry || null,
        category: form.category,
        membership_kind: form.category === 'memberships' ? (form.membership_kind || 'asset') : null,
        fee_paid: form.fee_paid ? Number(form.fee_paid) : null,
        how_to_redeem: form.how_to_redeem || null,
        notes: form.notes || null,
      }
      await Vouchers.create(payload)
      toast('Saved to your wallet')
      reset(); onClose(); onSaved?.()
    } catch (e) {
      toast('Failed to save')
    } finally { setBusy(false) }
  }

  const handleSmsExtract = async () => {
    if (!smsText.trim()) return
    setBusy(true)
    // Split into chunks separated by blank lines or "---" so users can paste many SMS at once
    const chunks = smsText
      .split(/\n\s*\n|---+/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
    try {
      if (chunks.length <= 1) {
        const data = await Extract.sms(smsText)
        setForm(f => ({
          ...f,
          brand: data.brand || f.brand,
          title: data.title || f.title,
          code: data.code || f.code,
          value: data.value || f.value,
          expiry: data.expiry || f.expiry,
          category: data.category || f.category,
          membership_kind: data.membership_kind || f.membership_kind,
          how_to_redeem: data.how_to_redeem || f.how_to_redeem,
        }))
        setMode('manual')
        toast('Extracted from SMS')
      } else {
        // Bulk: extract each chunk and save directly
        let saved = 0
        for (const chunk of chunks) {
          try {
            const data = await Extract.sms(chunk)
            if (data?.brand && data?.title) {
              await Vouchers.create({
                user_pin: pin,
                type: data.category === 'memberships' ? 'membership' : 'voucher',
                brand: data.brand,
                title: data.title,
                code: data.code || null,
                value: data.value || null,
                expiry: data.expiry || null,
                category: data.category || 'vouchers',
                membership_kind: data.membership_kind || null,
                how_to_redeem: data.how_to_redeem || null,
              })
              saved++
            }
          } catch { /* skip this chunk */ }
        }
        toast(`Saved ${saved} of ${chunks.length} vouchers`)
        reset(); onClose(); onSaved?.()
      }
    } catch (e) {
      toast('Could not parse SMS')
    } finally { setBusy(false) }
  }

  const handleImage = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const b64 = String(reader.result).split(',')[1]
        setImagePreview(reader.result)
        try {
          const data = await Extract.image(b64)
          setForm(f => ({
            ...f,
            brand: data.brand || f.brand,
            title: data.title || f.title,
            code: data.code || f.code,
            value: data.value || f.value,
            expiry: data.expiry || f.expiry,
            category: data.category || f.category,
            membership_kind: data.membership_kind || f.membership_kind,
            how_to_redeem: data.how_to_redeem || f.how_to_redeem,
          }))
          setMode('manual')
          toast('Scanned voucher details')
        } catch (e) {
          toast('Scan failed — fill manually')
          setMode('manual')
        } finally { setBusy(false) }
      }
      reader.readAsDataURL(file)
    } catch { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="Add Voucher" testid="add-sheet">
      {/* Mode tabs */}
      <div className="flex gap-2 p-1 bg-ink-100 rounded-full mb-5">
        <button data-testid="mode-manual" onClick={() => setMode('manual')} className={`pill-tab ${mode === 'manual' ? 'active' : ''}`}>Manual</button>
        <button data-testid="mode-scan" onClick={() => setMode('scan')} className={`pill-tab ${mode === 'scan' ? 'active' : ''}`}>Scan</button>
        <button data-testid="mode-sms" onClick={() => setMode('sms')} className={`pill-tab ${mode === 'sms' ? 'active' : ''}`}>Paste SMS</button>
      </div>

      {mode === 'sms' ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">Paste a promotional SMS, or <span className="font-semibold text-emerald-800">paste many at once</span> separated by a blank line — we'll save them all in one go.</p>
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5" data-testid="add-sms-secure-note">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">Your SMS data is processed securely and is never stored on external servers. We only extract the voucher fields.</p>
          </div>
          <textarea data-testid="sms-input" value={smsText} onChange={(e) => setSmsText(e.target.value)} rows={8}
            className="w-full bg-ink-50 border border-ink-200 rounded-2xl p-3 text-sm placeholder:text-ink-400"
            placeholder={'Flat ₹150 off on Swiggy! Code SWIGGY150 by 25 Nov.\n\nMyntra Bonanza — 20% off, code MYNTRA20, till 30 Nov.'} />
          <PrimaryButton data-testid="sms-extract" onClick={handleSmsExtract} disabled={busy || !smsText.trim()}>
            <Sparkles className="w-4 h-4" />
            {busy ? 'Extracting…' : 'Extract details'}
          </PrimaryButton>
        </div>
      ) : mode === 'scan' ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">Snap or upload a screenshot of a coupon, gift card or membership card. We extract details using AI.</p>
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5" data-testid="add-camera-secure-note">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">Why we need this: AI reads the image once to extract brand, code, and expiry. The image is <span className="font-bold">not retained</span> on our servers.</p>
          </div>
          <label data-testid="scan-upload" className="block border-2 border-dashed border-ink-200 rounded-2xl p-6 text-center cursor-pointer hover:border-emerald-700 transition">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} />
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="max-h-40 mx-auto rounded-xl" />
            ) : (
              <>
                <Camera className="w-7 h-7 mx-auto text-ink-500 mb-2" />
                <p className="text-sm font-semibold text-ink-800">Tap to choose photo</p>
                <p className="text-[11px] text-ink-500 mt-1">JPEG / PNG / WEBP</p>
              </>
            )}
          </label>
          {busy ? <p className="text-xs text-ink-500 text-center">Scanning with AI…</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <FormField label="Brand" testid="field-brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="Swiggy, Croma…" />
          <FormField label="Title" testid="field-title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="₹100 off on order above ₹399" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Code" testid="field-code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} placeholder="SAVE100" mono />
            <FormField label="Value (₹)" testid="field-value" type="number" value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="100" />
          </div>
          <FormField label="Expiry" testid="field-expiry" type="date" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
          <div>
            <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Category</label>
            <div className="flex gap-2 mt-2">
              <button data-testid="cat-vouchers" onClick={() => setForm({ ...form, category: 'vouchers' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold ${form.category === 'vouchers' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>Voucher</button>
              <button data-testid="cat-memberships" onClick={() => setForm({ ...form, category: 'memberships' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold ${form.category === 'memberships' ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700'}`}>Membership</button>
            </div>
          </div>
          {form.category === 'memberships' ? (
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Membership type</label>
                <div className="flex gap-2 mt-2">
                  <button data-testid="kind-asset" onClick={() => setForm({ ...form, membership_kind: 'asset' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold ${form.membership_kind === 'asset' ? 'bg-emerald-800 text-white' : 'bg-ink-100 text-ink-700'}`}>Retail / Asset</button>
                  <button data-testid="kind-content" onClick={() => setForm({ ...form, membership_kind: 'content' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold ${form.membership_kind === 'content' ? 'bg-emerald-800 text-white' : 'bg-ink-100 text-ink-700'}`}>Content</button>
                </div>
              </div>
              {form.membership_kind === 'asset' ? (
                <FormField label="Annual fee paid (₹)" testid="field-fee" type="number" value={form.fee_paid} onChange={(v) => setForm({ ...form, fee_paid: v })} placeholder="1499" />
              ) : null}
            </div>
          ) : null}
          <FormField label="How to redeem" testid="field-howto" textarea value={form.how_to_redeem} onChange={(v) => setForm({ ...form, how_to_redeem: v })} placeholder="Apply at checkout under 'Promo code'..." />
          <PrimaryButton data-testid="save-voucher" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save voucher'}
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

function FormField({ label, value, onChange, placeholder, testid, type = 'text', textarea, mono }) {
  return (
    <div>
      <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">{label}</label>
      {textarea ? (
        <textarea data-testid={testid} value={value || ''} onChange={(e) => onChange(e.target.value)} rows={3}
          className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl p-3 text-sm placeholder:text-ink-400" placeholder={placeholder} />
      ) : (
        <input data-testid={testid} type={type} value={value || ''} onChange={(e) => onChange(e.target.value)}
          className={`mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm placeholder:text-ink-400 ${mono ? 'font-mono' : ''}`} placeholder={placeholder} />
      )}
    </div>
  )
}

// ---------- Smart Search Result ----------
function SearchResult({ q, pin, onOpenVoucher }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!q.trim()) { setData(null); return }
    const id = setTimeout(() => {
      SearchApi.brand(q.trim(), pin).then(setData).catch(() => setData(null))
    }, 250)
    return () => clearTimeout(id)
  }, [q, pin])
  if (!q.trim() || !data) return null
  return (
    <div className="mt-3 bg-white border border-ink-200 rounded-2xl p-3 page-enter space-y-3" data-testid="search-result">
      {data.parent_company ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-ink-500 uppercase font-bold tracking-wider">Parent company</p>
            <p className="font-display font-bold text-ink-900 text-lg leading-tight">{data.parent_company}</p>
          </div>
          <Tag tone="gold">Smart Match</Tag>
        </div>
      ) : (
        <p className="text-sm text-ink-500">No parent-company match. Try a brand like “Croma” or “Myntra”.</p>
      )}

      {data.user_matches?.length ? (
        <div className="pt-3 border-t border-ink-100" data-testid="search-user-matches">
          <p className="text-[11px] text-ink-500 uppercase font-bold tracking-wider mb-2">Your coupons</p>
          <div className="space-y-1.5">
            {data.user_matches.slice(0, 4).map(u => (
              <button
                key={u.id}
                data-testid={`user-match-${u.id}`}
                onClick={() => onOpenVoucher?.(u)}
                className="w-full flex items-center justify-between gap-2 p-2 rounded-xl hover:bg-ink-50 active:scale-[0.98] transition text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900 truncate">{u.brand} <span className="text-ink-400 font-normal text-xs">· {u.parent_company || '—'}</span></p>
                  <p className="text-[11px] text-ink-500 truncate">{u.title}</p>
                </div>
                {u.code ? <span className="code-box text-[10px]">{u.code}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {data.matches?.length ? (
        <div className="pt-3 border-t border-ink-100 flex flex-wrap gap-1.5" data-testid="search-matches">
          {data.matches.slice(0, 6).map((m, i) => (
            <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-ink-100 text-ink-700">{m.brand} · {m.parent_company}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ---------- Home Screen ----------
function HomeScreen({ pin, onProfileClick, memberStatus, onOpenAdd, toast, refreshKey, openHowTo, onOpenNotifs, unread, bumpRefresh }) {
  const [ending, setEnding] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setEnding(await Vouchers.endingSoon(pin, 7)) } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, refreshKey])

  const { pullY, refreshing } = usePullToRefresh(async () => { await load(); bumpRefresh?.() })

  const handleCopy = async (v) => {
    if (!v.code) return
    try { await navigator.clipboard.writeText(v.code); toast(`Copied ${v.code}`) } catch { toast('Copy failed') }
  }

  return (
    <>
      <PtrIndicator pullY={pullY} refreshing={refreshing} />
      <TopBar
        title="Perk Orbit"
        subtitle="Voucher-first wallet"
        right={
          <>
            <button data-testid="bell-button" onClick={onOpenNotifs} className="relative w-10 h-10 rounded-full bg-white border border-ink-200 grid place-items-center active:scale-95 transition">
              <Bell className="w-4 h-4 text-ink-700" />
              {unread > 0 ? (
                <span data-testid="bell-badge" className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-terracotta-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">{unread > 9 ? '9+' : unread}</span>
              ) : null}
            </button>
            <button data-testid="profile-avatar" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
              {(getProfile().name || 'M')[0].toUpperCase()}
            </button>
          </>
        }
      />
      <main className="px-5 space-y-6 pt-2">
        {/* Smart search */}
        <section data-testid="smart-search">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 w-4 h-4" />
            <input
              data-testid="search-input"
              type="text"
              placeholder="Search brand (e.g. Croma → Tata)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-white border border-ink-200 rounded-full pl-11 pr-12 py-3 text-sm focus:border-emerald-700 focus:ring-2 focus:ring-emerald-200 transition"
            />
            <VoiceMicButton onText={(t) => setQ(t)} />
          </div>
          <SearchResult q={q} pin={pin} onOpenVoucher={(u) => openHowTo(u)} />
        </section>

        {/* Membership / Pro banner */}
        {!memberStatus?.active ? (
          <button
            data-testid="upsell-pro"
            onClick={() => onOpenAdd('upsell')}
            className="w-full relative overflow-hidden rounded-3xl p-5 bg-gradient-to-br from-ink-900 via-ink-800 to-emerald-900 text-left text-white active:scale-[0.99] transition"
          >
            <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-gold-500/20 blur-2xl" />
            <div className="flex items-center gap-2 mb-2">
              <Star className="w-4 h-4 text-gold-400" />
              <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-gold-100">Perk Orbit Pro</span>
            </div>
            <p className="font-display font-bold text-xl leading-tight">Unlock unlimited vouchers, family sharing & ROI tracking</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-sm text-white/80">₹99 / 3 months</span>
              <span className="inline-flex items-center gap-1 text-gold-200 text-xs font-bold">Upgrade <ChevronRight className="w-4 h-4" /></span>
            </div>
          </button>
        ) : (
          <Card className="p-5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gold-100 grid place-items-center text-gold-600"><BadgeCheck className="w-5 h-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Pro Member</p>
              <p className="font-display font-bold text-ink-900 leading-tight">{memberStatus.plan}</p>
              <p className="text-[11px] text-ink-500">Renews {fmtDate(memberStatus.expires_at)}</p>
            </div>
          </Card>
        )}

        {/* Ending soon */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="font-display text-lg font-bold text-ink-900">Ending soon</h2>
            <span className="text-[11px] text-ink-500 font-semibold">Next 7 days</span>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}
            </div>
          ) : ending.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="font-display font-semibold text-ink-800">All clear ✦</p>
              <p className="text-sm text-ink-500 mt-1">No vouchers expiring in the next 7 days.</p>
              <button data-testid="cta-add-first" onClick={() => onOpenAdd()} className="mt-3 text-sm text-emerald-800 font-bold inline-flex items-center gap-1">Add a voucher <ChevronRight className="w-4 h-4" /></button>
            </Card>
          ) : (
            <div className="space-y-3" data-testid="ending-soon-list">
              {ending.map(v => (
                <VoucherCard key={v.id} v={v}
                  onCopy={handleCopy}
                  onHowTo={openHowTo}
                  onDelete={() => {}}
                  onShare={() => {}}
                  onUnshare={() => {}}
                />
              ))}
            </div>
          )}
        </section>

        <button data-testid="add-from-home" onClick={() => onOpenAdd()} className="w-full bg-emerald-800 text-white py-4 rounded-2xl flex items-center justify-center gap-2 font-semibold shadow-emerald active:scale-[0.98] transition">
          <Plus className="w-4 h-4" />
          Add new voucher
        </button>
      </main>
    </>
  )
}

// ---------- My Coupons Screen ----------
function MyCouponsScreen({ pin, onProfileClick, onOpenAdd, toast, refreshKey, openHowTo, openShareSheet, setRefreshKey, bumpRefresh }) {
  const [tab, setTab] = useState('all') // all | memberships | vouchers
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [roi, setRoi] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const list = await Vouchers.list(pin, tab === 'all' ? undefined : tab)
      setItems(list)
      if (tab === 'memberships' || tab === 'all') {
        try { setRoi(await Memberships.roi(pin)) } catch { /* ignore */ }
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, tab, refreshKey])

  const { pullY, refreshing } = usePullToRefresh(async () => { await load(); bumpRefresh?.() })

  const handleCopy = async (v) => { if (!v.code) return; try { await navigator.clipboard.writeText(v.code); toast(`Copied ${v.code}`) } catch { toast('Copy failed') } }
  const handleDelete = async (v) => { await Vouchers.remove(v.id); toast('Deleted'); load(); setRefreshKey(k => k + 1) }
  const handleUnshare = async (v) => { await Circle.unshare(v.id, pin); toast('Stopped sharing'); load() }

  const logSavings = async (m) => {
    const val = prompt('Log savings amount (₹):')
    if (!val) return
    await Vouchers.update(m.id, { savings_realized: (m.savings_realized || 0) + Number(val) })
    toast(`Logged ${fmtINR(Number(val))}`); load()
  }

  return (
    <>
      <PtrIndicator pullY={pullY} refreshing={refreshing} />
      <TopBar
        title="My Coupons"
        right={
          <button data-testid="profile-avatar-coupons" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
            {(getProfile().name || 'M')[0].toUpperCase()}
          </button>
        }
      />
      <main className="px-5 space-y-5">
        {/* Tabs */}
        <div data-testid="coupon-tabs" className="flex gap-1.5 p-1 bg-white border border-ink-200 rounded-full">
          <button data-testid="tab-all" className={`pill-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
          <button data-testid="tab-memberships" className={`pill-tab ${tab === 'memberships' ? 'active' : ''}`} onClick={() => setTab('memberships')}>Memberships</button>
          <button data-testid="tab-vouchers" className={`pill-tab ${tab === 'vouchers' ? 'active' : ''}`} onClick={() => setTab('vouchers')}>Vouchers</button>
        </div>

        <button data-testid="add-coupon" onClick={() => onOpenAdd()} className="w-full bg-white border-2 border-dashed border-ink-200 hover:border-emerald-700 hover:bg-emerald-50/30 py-4 rounded-2xl flex items-center justify-center gap-2 text-emerald-800 font-semibold transition active:scale-[0.98]">
          <Plus className="w-4 h-4" />
          Add new
        </button>

        {loading ? (
          <div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <Empty title="Nothing here yet" sub="Add your first voucher or membership card." icon={<Ticket className="w-6 h-6" />} testid="empty-coupons" />
        ) : (
          <div className="space-y-3">
            {items.map(v => v.category === 'memberships' ? (
              <MembershipCard key={v.id} m={roi.find(r => r.id === v.id) || v} onUpdateSavings={logSavings} />
            ) : (
              <VoucherCard
                key={v.id}
                v={v}
                pin={pin}
                onCopy={handleCopy}
                onHowTo={openHowTo}
                onDelete={handleDelete}
                onShare={() => openShareSheet(v)}
                onUnshare={handleUnshare}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ---------- My Points Screen ----------
function MyPointsScreen({ pin, onProfileClick, refreshKey, openHowTo, bumpRefresh }) {
  const [data, setData] = useState({ total_points: 0, approx_value_inr: 0, breakdown: [] })
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try { setData(await Points.summary(pin)) } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, refreshKey])

  const { pullY, refreshing } = usePullToRefresh(async () => { await load(); bumpRefresh?.() })

  return (
    <>
      <PtrIndicator pullY={pullY} refreshing={refreshing} />
      <TopBar
        title="My Points"
        right={<button data-testid="profile-avatar-points" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">{(getProfile().name || 'M')[0].toUpperCase()}</button>}
      />
      <main className="px-5 space-y-5">
        <Card className="p-6 bg-gradient-to-br from-emerald-900 to-emerald-700 text-white border-emerald-800 relative overflow-hidden">
          <div className="absolute -top-10 -right-12 w-44 h-44 rounded-full bg-gold-500/15 blur-2xl" />
          <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-emerald-100">Total balance</p>
          <p className="font-display text-5xl font-bold mt-2 leading-none">{Number(data.total_points || 0).toLocaleString('en-IN')}</p>
          <p className="text-sm text-emerald-100 mt-1">points across brands</p>
          <div className="mt-4 pt-4 border-t border-white/15 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-100">Approx value</p>
              <p className="font-display text-2xl font-bold mt-1">{fmtINR(data.approx_value_inr)}</p>
            </div>
            <button data-testid="howto-points" onClick={() => openHowTo({ brand: 'Loyalty points', title: 'Redeem your points', how_to_redeem: 'Open each brand’s app or website, navigate to “Rewards” or “Loyalty”, and apply your point balance at checkout. Some programs (HDFC SmartBuy, Tata Neu, Amazon Pay) let you convert points into vouchers — always compare the conversion rate before redeeming.' })} className="bg-white/10 hover:bg-white/15 text-xs font-semibold px-3 py-2 rounded-full">How to redeem</button>
          </div>
        </Card>

        <div>
          <h3 className="font-display font-bold text-ink-900 text-base mb-2 px-1">By brand</h3>
          {loading ? (
            <div className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />
          ) : data.breakdown?.length === 0 ? (
            <Empty title="No points logged" sub="Add a voucher with points to start tracking." icon={<Coins className="w-6 h-6" />} />
          ) : (
            <div className="space-y-2" data-testid="points-breakdown">
              {data.breakdown.map((b, i) => (
                <Card key={i} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-display font-bold text-ink-900">{b.brand}</p>
                    {b.parent_company ? <p className="text-[11px] text-ink-500">By {b.parent_company}</p> : null}
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-emerald-800">{Number(b.points).toLocaleString('en-IN')}</p>
                    <p className="text-[11px] text-ink-500">{fmtINR(b.value)}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}

// ---------- Profile & Settings Pages ----------
function ProfilePage({ onBack }) {
  const [p, setP] = useState(getProfile())
  const save = () => { setProfile(p); onBack() }
  return (
    <>
      <TopBar title="Profile" onBack={onBack} />
      <main className="px-5 space-y-4">
        <Card className="p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-800 grid place-items-center text-white font-display text-2xl font-bold">{(p.name || 'M')[0].toUpperCase()}</div>
          <div>
            <p className="font-display font-bold text-ink-900 text-lg">{p.name || 'Member'}</p>
            <p className="text-xs text-ink-500">{p.phone || 'No phone added'}</p>
          </div>
        </Card>
        <Card className="p-5 space-y-3">
          <FormField label="Name" testid="profile-name" value={p.name} onChange={(v) => setP({ ...p, name: v })} placeholder="Your name" />
          <FormField label="Email" testid="profile-email" value={p.email} onChange={(v) => setP({ ...p, email: v })} placeholder="you@example.com" />
          <FormField label="Phone" testid="profile-phone" value={p.phone} onChange={(v) => setP({ ...p, phone: v })} placeholder="+91 …" />
          <PrimaryButton data-testid="profile-save" onClick={save}>Save</PrimaryButton>
        </Card>
      </main>
    </>
  )
}

function SettingsPage({ onBack, onResetPin, onOpenProtect, onOpenPrivacy, onOpenFAQ, onOpenPrivacyControl, onOpenPerkTips, onReplayTour, onWipe, onLogout, toast }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const wipe = async () => {
    setBusy(true)
    try {
      await Auth.wipe()
      localStorage.removeItem('perk_orbit_token')
      setStoredPin(null)
      setProfile({ name: '', email: '', phone: '' })
      toast?.('All your data has been deleted')
      onWipe?.()
    } catch (e) {
      toast?.('Could not delete · try again')
      setBusy(false)
    }
  }
  return (
    <>
      <TopBar title="Settings" onBack={onBack} />
      <main className="px-5 space-y-3 pb-10">
        {/* Trust banner */}
        <Card className="p-5 bg-emerald-50/40 border-emerald-200" data-testid="settings-trust-card">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-100 grid place-items-center"><ShieldCheck className="w-5 h-5 text-emerald-800" /></div>
            <div className="min-w-0">
              <p className="font-display font-bold text-ink-900">Your data is encrypted</p>
              <p className="text-[11px] text-ink-600">TLS 1.3 in transit · bcrypt + AES at rest · DPDP 2023 & GDPR compliant</p>
            </div>
          </div>
          <button data-testid="settings-learn-protect" onClick={onOpenProtect} className="mt-3 text-xs font-semibold text-emerald-800 underline underline-offset-4 decoration-emerald-300">
            Learn more → How we protect you
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">App PIN</p>
          <p className="text-xs text-ink-500 mb-3">PIN is stored locally on this device only. Cloud account stays signed in across devices.</p>
          <GhostButton data-testid="reset-pin" onClick={onResetPin}><KeyRound className="w-4 h-4" /> Change PIN</GhostButton>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">Privacy & legal</p>
          <button data-testid="settings-privacy" onClick={onOpenPrivacy} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><FileText className="w-4 h-4 text-ink-700" /> Privacy Policy</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-faq" onClick={onOpenFAQ} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><MessageCircle className="w-4 h-4 text-ink-700" /> Security FAQ</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-privacy-control" onClick={onOpenPrivacyControl} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Lock className="w-4 h-4 text-ink-700" /> Privacy Control</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-protect" onClick={onOpenProtect} className="w-full flex items-center justify-between py-3">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-800" /> How we protect you</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-2">Features</p>
          <button data-testid="settings-perk-tips" onClick={onOpenPerkTips} className="w-full flex items-center justify-between py-3 border-b border-ink-100">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-700" /> Perk Tips · Masterclass</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="settings-replay-tour" onClick={onReplayTour} className="w-full flex items-center justify-between py-3">
            <span className="text-sm text-ink-800 inline-flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-700" /> Take the tour again</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-1">Sign out</p>
          <p className="text-xs text-ink-500 mb-3">Sign out of this device. Your wallet stays safe in the cloud.</p>
          <GhostButton data-testid="settings-logout" onClick={onLogout}><LogOut className="w-4 h-4" /> Sign out</GhostButton>
        </Card>

        {/* Danger zone */}
        <Card className="p-5 border-terracotta-200 bg-terracotta-50/30" data-testid="settings-danger-zone">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-terracotta-700" />
            <p className="font-display font-bold text-terracotta-800">Danger zone</p>
          </div>
          <p className="text-xs text-ink-700 leading-relaxed mb-3">
            Permanently delete <span className="font-bold">your account and ALL your data</span> — vouchers, points, family circle, payment history, referrals. This cannot be undone.
          </p>
          <button
            data-testid="settings-wipe-open"
            onClick={() => setConfirmOpen(true)}
            className="w-full bg-terracotta-700 text-white font-semibold py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Clear All My Data
          </button>
          <p className="text-[10px] text-ink-500 text-center mt-2">DPDP 2023 Right to Erasure · GDPR Art. 17</p>
        </Card>

        <Card className="p-5">
          <p className="font-display font-bold text-ink-900 mb-1">About</p>
          <p className="text-xs text-ink-500">Perk Orbit · v1.0 · Built for Indian households.</p>
        </Card>
      </main>

      {/* Confirm wipe modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" data-testid="wipe-confirm-modal" onClick={() => !busy && setConfirmOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-terracotta-100 grid place-items-center"><AlertTriangle className="w-5 h-5 text-terracotta-700" /></div>
              <h2 className="font-display text-xl font-bold text-ink-900">Delete everything?</h2>
            </div>
            <p className="text-sm text-ink-700 leading-relaxed mb-3">
              This will permanently remove your account, vouchers, points, family circle, and history. It <span className="font-bold">cannot be undone</span>.
            </p>
            <p className="text-xs text-ink-600 mb-2">Type <span className="font-mono font-bold text-terracotta-700">DELETE</span> to confirm:</p>
            <input
              data-testid="wipe-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoFocus
              className="w-full bg-ink-50 border border-ink-200 rounded-2xl px-4 py-3 text-sm font-mono tracking-wider"
              placeholder="DELETE"
            />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <GhostButton data-testid="wipe-cancel" onClick={() => setConfirmOpen(false)} disabled={busy}>Cancel</GhostButton>
              <button
                data-testid="wipe-confirm"
                onClick={wipe}
                disabled={busy || confirmText.trim().toUpperCase() !== 'DELETE'}
                className="w-full bg-terracotta-700 text-white font-semibold py-3.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {busy ? 'Deleting…' : (<><Trash2 className="w-4 h-4" /> Delete</>)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MembershipPage({ onBack, pin, status, refresh, toast, online = true }) {
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
        orderId: order.order_id,
        amount: order.amount,
        currency: order.currency,
        prefill: {
          name: profile.name || 'Perk Orbit Member',
          email: profile.email || '',
          contact: profile.phone || '',
        },
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
            if (result.referral?.applied) {
              toast(`Welcome to Pro! +${result.referral.bonus_days} bonus days applied`)
            } else {
              toast('Welcome to Perk Orbit Pro!')
            }
          } catch (e) {
            toast('Payment verification failed')
          } finally { setBusy(false) }
        },
        onDismiss: () => { setBusy(false); toast('Payment cancelled') },
        onFailure: () => { setBusy(false); toast('Payment failed') },
      })
    } catch (e) {
      setBusy(false)
      toast('Could not start checkout')
    }
  }

  const cardRef = useRef(null)

  const shareSavingsReport = async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, { cacheBust: true, pixelRatio: 2 })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'perk-orbit-savings.png', { type: 'image/png' })
      const link = `https://perkorbit.app/?ref=${status?.referral_code}`
      const text = `I'm saving smarter with Perk Orbit 💎\nReferred ${stats.total_referrals} friends · earned +${stats.bonus_days_earned} bonus days\nJoin me with code ${status?.referral_code} — both get 3 months FREE: ${link}`
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text, title: 'My Perk Orbit savings' })
      } else if (navigator.share) {
        await navigator.share({ text, title: 'My Perk Orbit savings' })
      } else {
        const a = document.createElement('a'); a.href = dataUrl; a.download = 'perk-orbit-savings.png'; a.click()
        toast('Image downloaded')
      }
    } catch (e) { toast('Could not generate report') }
  }

  const shareRef = async () => {
    const link = `https://perkorbit.app/?ref=${status?.referral_code}`
    const text = `Join me on Perk Orbit — India's voucher-first wallet. Use my code ${status?.referral_code} when you upgrade to Pro and get 3 months FREE on top of your 3-month plan (I get 3 months free too 🎁): ${link}`
    try {
      if (navigator.share) { await navigator.share({ title: 'Perk Orbit Pro', text }) }
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
                  🎁 Refer a friend → both of you get <span className="font-bold">+1 month</span> FREE on Perk Orbit Pro.
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

            {/* Hidden share-card rendered for html-to-image capture */}
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
                  <p style={{ fontSize: 56, fontWeight: 800, marginTop: 24, lineHeight: 1.1 }}>{getProfile().name || 'Saver'}'s wallet is paying off.</p>
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
                  <p style={{ fontSize: 26, color: '#E5E7EB' }}>Join me on Perk Orbit · use my code</p>
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
              <div className="flex items-center gap-2 mb-2"><Star className="w-4 h-4 text-gold-400" /><span className="text-[10px] uppercase tracking-[0.18em] font-bold text-gold-100">Perk Orbit Pro</span></div>
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
                <p className="text-xs text-ink-500 mt-2">Get <span className="font-bold">+3 months</span> bonus when you use a friend's code (they also get +3 months).</p>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  )
}

function _online() {
  return typeof navigator === 'undefined' || navigator.onLine
}
// eslint-disable-next-line no-unused-vars
const _unused = _online

function CirclePage({ onBack, pin, toast, onOpenMember, onProfileClick }) {
  const [members, setMembers] = useState([])
  const [name, setName] = useState('')
  const [relation, setRelation] = useState('Family')
  const load = () => Circle.list(pin).then(setMembers)
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin])

  const add = async () => {
    if (!name.trim()) return
    await Circle.add({ user_pin: pin, name: name.trim(), relation })
    setName(''); load(); toast('Member added')
  }
  const remove = async (id) => { await Circle.remove(id); load(); toast('Removed') }
  const copyInvite = async (m) => {
    const link = `https://perkorbit.app/invite/${m.invite_token}`
    try { await navigator.clipboard.writeText(link); toast('Invite link copied') } catch { toast('Copy failed') }
  }

  return (
    <>
      <TopBar
        title="Family Circle"
        subtitle="Selectively share vouchers with family"
        onBack={onBack}
        right={onProfileClick ? (
          <button data-testid="profile-avatar-circle" onClick={onProfileClick} className="w-10 h-10 rounded-full bg-emerald-800 grid place-items-center text-white font-display font-bold border-2 border-white shadow-soft">
            {(getProfile().name || 'M')[0].toUpperCase()}
          </button>
        ) : null}
      />
      <main className="px-5 space-y-4">
        <Card className="p-5 space-y-3">
          <FormField label="Family member name" testid="circle-name" value={name} onChange={setName} placeholder="e.g. Priya (Wife)" />
          <FormField label="Relation" testid="circle-relation" value={relation} onChange={setRelation} placeholder="Family / Parent / Sibling" />
          <PrimaryButton data-testid="circle-add" onClick={add}><UserPlus className="w-4 h-4" /> Add to circle</PrimaryButton>
        </Card>

        {members.length === 0 ? (
          <Empty title="Your circle is empty" sub="Add a member to start sharing vouchers." icon={<UserPlus className="w-6 h-6" />} testid="empty-circle" />
        ) : (
          <div className="space-y-2" data-testid="circle-list">
            {members.map(m => (
              <Card key={m.id} className="p-4 flex items-center justify-between gap-3">
                <button
                  data-testid={`open-family-cards-${m.id}`}
                  onClick={() => onOpenMember(m)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left active:scale-[0.99] transition"
                >
                  <div className="w-11 h-11 rounded-full bg-emerald-100 grid place-items-center text-emerald-800 font-display font-bold">{m.name[0].toUpperCase()}</div>
                  <div className="min-w-0">
                    <p className="font-display font-bold text-ink-900 truncate">{m.name}</p>
                    <p className="text-[11px] text-ink-500">{m.relation || 'Family'} · View their cards</p>
                  </div>
                </button>
                <div className="flex items-center gap-1">
                  <button data-testid={`copy-invite-${m.id}`} onClick={() => copyInvite(m)} className="w-9 h-9 rounded-full bg-ink-100 grid place-items-center text-ink-700 active:scale-95"><LinkIcon className="w-4 h-4" /></button>
                  <button data-testid={`remove-member-${m.id}`} onClick={() => remove(m.id)} className="w-9 h-9 rounded-full bg-terracotta-50 grid place-items-center text-terracotta-700 active:scale-95"><Trash2 className="w-4 h-4" /></button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ---------- Family Cards (filtered: Where Shared_With == member.id) ----------
function FamilyCardsPage({ onBack, pin, member, toast, refresh, openHowTo }) {
  const [data, setData] = useState({ member, vouchers: [] })
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Circle.sharedWith(pin, member.id).then(setData).finally(() => setLoading(false))
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [pin, member.id])

  const handleCopy = async (v) => { if (!v.code) return; try { await navigator.clipboard.writeText(v.code); toast(`Copied ${v.code}`) } catch { toast('Copy failed') } }
  const handleUnshare = async (v) => {
    await Circle.unshare(v.id, pin, member.id)
    toast('Removed from this member')
    load(); refresh?.()
  }

  return (
    <>
      <TopBar
        title={member.name}
        subtitle={`Family Cards · ${member.relation || 'Family'}`}
        onBack={onBack}
      />
      <main className="px-5 space-y-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-emerald-800 grid place-items-center text-white font-display text-lg font-bold">{member.name[0].toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="font-display font-bold text-ink-900 leading-tight truncate">{member.name}</p>
            <p className="text-[11px] text-ink-500">Showing vouchers where Shared_With = this member</p>
          </div>
          <Tag tone="emerald" data-testid="family-count">{data.vouchers?.length || 0} cards</Tag>
        </Card>

        {loading ? (
          <div className="space-y-3">{[0, 1].map(i => <div key={i} className="h-24 bg-white rounded-3xl border border-ink-200 animate-pulse" />)}</div>
        ) : (data.vouchers?.length || 0) === 0 ? (
          <Empty
            title="Nothing shared yet"
            sub={`Share a voucher from My Coupons with ${member.name} to see it here.`}
            icon={<Share2 className="w-6 h-6" />}
            testid="empty-family-cards"
          />
        ) : (
          <div className="space-y-3" data-testid="family-cards-list">
            {data.vouchers.map(v => (
              <VoucherCard
                key={v.id}
                v={v}
                onCopy={handleCopy}
                onHowTo={openHowTo}
                onDelete={() => {}}
                onShare={() => {}}
                onUnshare={handleUnshare}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

// ---------- Notification Center ----------
function NotificationSheet({ open, onClose, pin, toast, onJumpToScreen, refreshNotifs }) {
  const [data, setData] = useState({ items: [], unread: 0 })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setData(await Notifications.list(pin)) } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { if (open) load() /* eslint-disable-next-line */ }, [open, pin])

  const markRead = async (n) => {
    if (!n.read) {
      await Notifications.markRead(n.id)
      load(); refreshNotifs?.()
    }
  }
  const handleJump = async (n) => {
    await markRead(n)
    onJumpToScreen?.(n.ref_screen || 'home')
    onClose()
  }
  const markAll = async () => {
    await Notifications.markAllRead(pin)
    load(); refreshNotifs?.()
    toast('All marked as read')
  }
  const remove = async (id) => {
    await Notifications.remove(id)
    load(); refreshNotifs?.()
  }

  const iconFor = (k) => {
    if (k === 'ending_soon') return <Clock className="w-4 h-4 text-terracotta-700" />
    if (k === 'break_even') return <BadgeCheck className="w-4 h-4 text-emerald-700" />
    if (k === 'membership_activated') return <Star className="w-4 h-4 text-gold-500" />
    return <Bell className="w-4 h-4 text-ink-600" />
  }
  const bgFor = (k) => {
    if (k === 'ending_soon') return 'bg-terracotta-50'
    if (k === 'break_even') return 'bg-emerald-50'
    if (k === 'membership_activated') return 'bg-gold-50'
    return 'bg-ink-100'
  }

  return (
    <Sheet open={open} onClose={onClose} title="Notifications" testid="notif-sheet">
      {data.unread > 0 ? (
        <button data-testid="notif-mark-all" onClick={markAll} className="text-xs font-semibold text-emerald-800 mb-3 active:scale-95">Mark all as read</button>
      ) : null}

      {loading ? (
        <div className="space-y-3">{[0,1,2].map(i => <div key={i} className="h-16 bg-ink-100 rounded-2xl animate-pulse" />)}</div>
      ) : data.items.length === 0 ? (
        <Empty title="You're all caught up" sub="We'll ping you when vouchers are about to expire." icon={<Bell className="w-6 h-6" />} testid="empty-notifs" />
      ) : (
        <div className="space-y-2" data-testid="notif-list">
          {data.items.map(n => (
            <div
              key={n.id}
              data-testid={`notif-${n.id}`}
              className={`relative rounded-2xl p-3 border ${n.read ? 'border-ink-200 bg-white' : 'border-emerald-200 bg-emerald-50/40'} flex items-start gap-3`}
            >
              <button onClick={() => handleJump(n)} className="flex items-start gap-3 flex-1 text-left">
                <div className={`w-9 h-9 rounded-full grid place-items-center ${bgFor(n.kind)}`}>{iconFor(n.kind)}</div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm leading-tight ${n.read ? 'text-ink-700' : 'font-bold text-ink-900'}`}>{n.title}</p>
                  {n.body ? <p className="text-[11px] text-ink-500 mt-0.5 line-clamp-2">{n.body}</p> : null}
                </div>
                {!n.read ? <span className="w-2 h-2 rounded-full bg-emerald-700 mt-2 shrink-0" /> : null}
              </button>
              <button data-testid={`notif-del-${n.id}`} onClick={() => remove(n.id)} className="w-7 h-7 rounded-full bg-ink-100 grid place-items-center text-ink-500 hover:text-terracotta-700 active:scale-95">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
function HowToSheet({ voucher, open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to redeem" testid="howto-sheet">
      {voucher ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Brand</p>
            <p className="font-display font-bold text-ink-900 text-lg">{voucher.brand}</p>
            <p className="text-sm text-ink-700">{voucher.title}</p>
          </div>
          {voucher.code ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Code</p>
              <div className="mt-1 inline-block code-box">{voucher.code}</div>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Steps</p>
            <p className="text-sm text-ink-700 mt-1 leading-relaxed whitespace-pre-line">
              {voucher.how_to_redeem || `1) Open ${voucher.brand} app or website.\n2) Add items to your cart and proceed to checkout.\n3) Apply the code ${voucher.code || ''} under “Promo / Coupon code”.\n4) Confirm the discount and complete payment.`}
            </p>
          </div>
          {voucher.expiry ? (
            <p className="text-[11px] text-ink-500">Valid until {fmtDate(voucher.expiry)}</p>
          ) : null}
          <p className="text-[11px] text-ink-500">Tip: All steps happen inside Perk Orbit — no redirects to external browsers.</p>
        </div>
      ) : null}
    </Sheet>
  )
}

// ---------- Share with circle sheet ----------
function ShareSheet({ open, onClose, voucher, pin, toast, refresh }) {
  const [members, setMembers] = useState([])
  useEffect(() => { if (open) Circle.list(pin).then(setMembers) }, [open, pin])
  const share = async (m) => {
    await Circle.share({ user_pin: pin, voucher_id: voucher.id, family_member_id: m.id })
    toast(`Shared with ${m.name}`); onClose(); refresh()
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Share "${voucher?.brand || 'voucher'}"`} testid="share-sheet">
      {members.length === 0 ? (
        <Empty title="No circle members yet" sub="Add family in Profile → Family Circle to share." icon={<UserPlus className="w-6 h-6" />} />
      ) : (
        <div className="space-y-2">
          {members.map(m => (
            <button key={m.id} data-testid={`share-to-${m.id}`} onClick={() => share(m)} className="w-full bg-white border border-ink-200 hover:border-emerald-700 rounded-2xl p-4 flex items-center justify-between active:scale-[0.98] transition">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 grid place-items-center text-emerald-800 font-display font-bold">{m.name[0]}</div>
                <div className="text-left">
                  <p className="font-display font-bold text-ink-900">{m.name}</p>
                  <p className="text-[11px] text-ink-500">{m.relation || 'Family'}</p>
                </div>
              </div>
              <Share2 className="w-4 h-4 text-emerald-800" />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

// ---------- Main App ----------
export default function App() {
  const [authUser, setAuthUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('perk_orbit_user') || 'null') } catch { return null }
  })
  const [authChecked, setAuthChecked] = useState(false)
  const [pin, setPin] = useState(() => getStoredPin())
  const [locked, setLocked] = useState(true) // require PIN each session
  const [stack, setStack] = useState([{ screen: 'home' }])
  const [profileOpen, setProfileOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [howToFor, setHowToFor] = useState(null)
  const [shareFor, setShareFor] = useState(null)
  const [toastMsg, setToastMsg] = useState('')
  const [memberStatus, setMemberStatus] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [notifsOpen, setNotifsOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [protectOpen, setProtectOpen] = useState(false)
  const [tourDone, setTourDone] = useState(() => localStorage.getItem('perk_orbit_tour_done') === '1')
  const [discoveryDone, setDiscoveryDone] = useState(() => localStorage.getItem('perk_orbit_discovery_done') === '1')

  // Online / offline detection
  useEffect(() => {
    const goOnline = () => { setOnline(true) }
    const goOffline = () => { setOnline(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const current = stack[stack.length - 1]
  const isTab = ['home', 'coupons', 'points', 'circle'].includes(current.screen)

  const toast = (m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2200) }
  const push = (screen, params = {}) => setStack(s => [...s, { screen, params }])
  const pop = () => setStack(s => s.length > 1 ? s.slice(0, -1) : s)
  const switchTab = (screen) => setStack([{ screen, params: {} }])

  const refreshMember = async () => {
    if (!pin) return
    try { setMemberStatus(await Membership.status(pin)) } catch (e) { /* ignore */ }
  }

  useEffect(() => { if (pin && !locked) refreshMember() /* eslint-disable-next-line */ }, [pin, locked])

  const refreshNotifs = async () => {
    if (!pin) return
    try {
      const d = await Notifications.list(pin)
      setUnread(d.unread || 0)
      // Fire OS-level toasts for high-priority unread items
      maybeFireBrowserNotifications(d.items || [])
    } catch { /* ignore */ }
  }
  useEffect(() => {
    if (!pin || locked) return
    // One-shot push permission ask + SW registration
    ensureServiceWorker()
    requestNotificationPermission()
    refreshNotifs()
    const t = setInterval(refreshNotifs, 60000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, locked, refreshKey])

  // Hardware back button
  useEffect(() => {
    const onPop = () => { if (stack.length > 1) pop() }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [stack.length])

  // Verify cloud session on cold start
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const me = await Auth.me()
        if (alive && me) setAuthUser({ id: me._id || me.id, email: me.email, name: me.name, phone: me.phone })
      } catch {
        if (alive) { setAuthUser(null); localStorage.removeItem('perk_orbit_token') }
      } finally {
        if (alive) setAuthChecked(true)
      }
    })()
    return () => { alive = false }
  }, [])

  // PIN flow
  if (!authChecked) return null
  if (!authUser) {
    return <AuthScreen existingPin={pin} onAuthed={(u) => { setAuthUser({ id: u.id, email: u.email, name: u.name, phone: u.phone }); setLocked(false) }} />
  }
  if (!pin) {
    return <PinLock mode="set" onSuccess={(p) => { setStoredPin(p); setPin(p); setLocked(false) }} />
  }
  if (locked) {
    return <PinLock mode="verify" expected={pin} onSuccess={() => setLocked(false)} />
  }

  // First-launch walkthrough (after PIN setup, before HomeScreen)
  if (!tourDone) {
    return <Walkthrough onComplete={() => { localStorage.setItem('perk_orbit_tour_done', '1'); setTourDone(true) }} />
  }

  // Smart Discovery — pre-fill the wallet using SMS scan / paste
  if (!discoveryDone) {
    return (
      <Shell>
        <SmartDiscoveryScreen
          pin={authUser?.id || pin}
          toast={(m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2200) }}
          onOpenProtect={() => setProtectOpen(true)}
          onComplete={() => { localStorage.setItem('perk_orbit_discovery_done', '1'); setDiscoveryDone(true) }}
        />
        <HowWeProtectYouModal open={protectOpen} onClose={() => setProtectOpen(false)} />
        <Toast message={toastMsg} />
      </Shell>
    )
  }

  // After auth: use user's id as canonical scope (cloud sync). Legacy PIN data
  // was migrated via signup's pin_to_claim. PIN remains as device-unlock.
  const effectivePin = authUser?.id || pin

  const handleNavigate = (where) => {
    if (where === 'lock') { setLocked(true); setStack([{ screen: 'home' }]); return }
    if (where === 'profile') push('profile')
    if (where === 'settings') push('settings')
    if (where === 'membership') push('membership')
    if (where === 'circle') push('circle')
    if (where === 'sms-scanner') push('sms-scanner')
    if (where === 'support') push('support')
    if (where === 'privacy') push('privacy')
    if (where === 'protect') setProtectOpen(true)
    if (where === 'perk-tips') push('perk-tips')
    if (where === 'faq') push('faq')
    if (where === 'privacy-control') push('privacy-control')
    if (where === 'replay-tour') { localStorage.removeItem('perk_orbit_tour_done'); setTourDone(false) }
  }

  const handleLogout = async () => {
    try { await Auth.logout() } catch { /* ignore */ }
    localStorage.removeItem('perk_orbit_token')
    setAuthUser(null)
    setLocked(true)
    setStack([{ screen: 'home' }])
  }

  const handleWipeComplete = () => {
    setAuthUser(null)
    setPin(null)
    setLocked(true)
    setMemberStatus(null)
    setStack([{ screen: 'home' }])
  }

  const onOpenAdd = (kind) => { if (kind === 'upsell') { push('membership'); return } setAddOpen(true) }

  return (
    <Shell>
      <OfflineBanner online={online} />
      {/* Page content */}
      <div key={current.screen} className="page-enter">
        {current.screen === 'home' && (
          <HomeScreen
            pin={effectivePin}
            memberStatus={memberStatus}
            onProfileClick={() => setProfileOpen(true)}
            onOpenAdd={onOpenAdd}
            toast={toast}
            refreshKey={refreshKey}
            openHowTo={setHowToFor}
            onOpenNotifs={() => setNotifsOpen(true)}
            unread={unread}
            bumpRefresh={() => setRefreshKey(k => k + 1)}
          />
        )}
        {current.screen === 'coupons' && (
          <MyCouponsScreen pin={effectivePin} onProfileClick={() => setProfileOpen(true)} onOpenAdd={onOpenAdd} toast={toast} refreshKey={refreshKey} openHowTo={setHowToFor} openShareSheet={setShareFor} setRefreshKey={setRefreshKey} bumpRefresh={() => setRefreshKey(k => k + 1)} />
        )}
        {current.screen === 'points' && (
          <MyPointsScreen pin={effectivePin} onProfileClick={() => setProfileOpen(true)} refreshKey={refreshKey} openHowTo={setHowToFor} bumpRefresh={() => setRefreshKey(k => k + 1)} />
        )}
        {current.screen === 'profile' && (<ProfilePage onBack={pop} />)}
        {current.screen === 'settings' && (
          <SettingsPage
            onBack={pop}
            onResetPin={() => { setStoredPin(null); setPin(null) }}
            onOpenProtect={() => setProtectOpen(true)}
            onOpenPrivacy={() => push('privacy')}
            onOpenFAQ={() => push('faq')}
            onOpenPrivacyControl={() => push('privacy-control')}
            onOpenPerkTips={() => push('perk-tips')}
            onReplayTour={() => { localStorage.removeItem('perk_orbit_tour_done'); setTourDone(false) }}
            onLogout={handleLogout}
            onWipe={handleWipeComplete}
            toast={toast}
          />
        )}
        {current.screen === 'membership' && (<MembershipPage onBack={pop} pin={effectivePin} status={memberStatus} refresh={refreshMember} toast={toast} online={online} />)}
        {current.screen === 'circle' && (
          <CirclePage
            onBack={stack.length > 1 ? pop : undefined}
            pin={effectivePin}
            toast={toast}
            onOpenMember={(m) => push('family-cards', { member: m })}
            onProfileClick={() => setProfileOpen(true)}
          />
        )}
        {current.screen === 'family-cards' && (
          <FamilyCardsPage
            onBack={pop}
            pin={effectivePin}
            member={current.params.member}
            toast={toast}
            refresh={() => setRefreshKey(k => k + 1)}
            openHowTo={setHowToFor}
          />
        )}
        {current.screen === 'sms-scanner' && (<SmsScannerScreen onBack={pop} pin={effectivePin} toast={toast} onSaved={() => setRefreshKey(k => k + 1)} onOpenProtect={() => setProtectOpen(true)} />)}
        {current.screen === 'support' && (<SupportHistoryScreen onBack={pop} pin={effectivePin} />)}
        {current.screen === 'privacy' && (<PrivacyScreen onBack={pop} onOpenProtect={() => setProtectOpen(true)} />)}
        {current.screen === 'perk-tips' && (
          <PerkTipsScreen
            onBack={pop}
            pin={effectivePin}
            isPro={!!memberStatus?.active}
            onUpgrade={() => push('membership')}
          />
        )}
        {current.screen === 'faq' && (
          <SecurityFAQScreen onBack={pop} onOpenProtect={() => setProtectOpen(true)} />
        )}
        {current.screen === 'privacy-control' && (
          <PrivacyControlScreen
            onBack={pop}
            onOpenProtect={() => setProtectOpen(true)}
            onOpenFAQ={() => push('faq')}
            onOpenPrivacy={() => push('privacy')}
            onWipeOpen={() => push('settings')}
          />
        )}
      </div>

      <HowWeProtectYouModal open={protectOpen} onClose={() => setProtectOpen(false)} />

      <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} onNavigate={handleNavigate} memberStatus={memberStatus} />
      <AddVoucherSheet open={addOpen} onClose={() => setAddOpen(false)} pin={effectivePin} onSaved={() => setRefreshKey(k => k + 1)} toast={toast} />
      <HowToSheet voucher={howToFor} open={!!howToFor} onClose={() => setHowToFor(null)} />
      <ShareSheet open={!!shareFor} onClose={() => setShareFor(null)} voucher={shareFor} pin={effectivePin} toast={toast} refresh={() => setRefreshKey(k => k + 1)} />
      <NotificationSheet
        open={notifsOpen}
        onClose={() => setNotifsOpen(false)}
        pin={effectivePin}
        toast={toast}
        onJumpToScreen={(screen) => {
          if (['home','coupons','points','circle'].includes(screen)) switchTab(screen)
          else if (screen === 'membership') push('membership')
        }}
        refreshNotifs={refreshNotifs}
      />

      <Toast message={toastMsg} />
      {isTab && <BottomNav active={current.screen} onChange={switchTab} />}
      {/* Panic Lock floating button — always available */}
      <button
        data-testid="panic-lock-btn"
        onClick={() => { setLocked(true); setStack([{ screen: 'home' }]) }}
        aria-label="Lock app"
        title="Lock app instantly"
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/90 backdrop-blur border border-ink-200 shadow-card grid place-items-center text-emerald-800 hover:bg-emerald-50 active:scale-90 transition"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <Lock className="w-4 h-4" />
      </button>
    </Shell>
  )
}
