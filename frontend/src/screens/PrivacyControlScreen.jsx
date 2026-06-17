import React, { useState, useEffect } from 'react'
import { ScanLine, MessageSquareText, Camera, Bell, ShieldCheck, Trash2, AlertTriangle, ChevronRight } from 'lucide-react'
import { Card, GhostButton, TopBar } from '../components/ui'

// Stored as JSON in localStorage under "perk_orbit_privacy_prefs"
// Defaults are intentionally privacy-friendly: scanning OFF by default.
const KEY = 'perk_orbit_privacy_prefs'
const defaults = {
  smsScanEnabled: false,        // automatic background SMS scan (Android native only)
  cameraScanEnabled: true,      // image-to-voucher AI scan (in-app)
  notificationsEnabled: true,   // expiry / ROI nudges
  pasteSmsExtractionEnabled: true, // manual paste-to-extract
}

export function getPrivacyPrefs() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch { return { ...defaults } }
}

export function setPrivacyPrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...defaults, ...p })) } catch { /* persist failure ignored */ }
}

function Toggle({ checked, onChange, testid }) {
  return (
    <button
      data-testid={testid}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition shrink-0 ${checked ? 'bg-emerald-700' : 'bg-ink-300'}`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function PrefRow({ icon: Icon, title, body, checked, onChange, testid }) {
  return (
    <div className="flex items-start gap-3 py-3" data-testid={`pref-${testid}`}>
      <div className="w-10 h-10 rounded-full bg-emerald-50 grid place-items-center shrink-0">
        <Icon className="w-4 h-4 text-emerald-800" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-ink-900 text-sm leading-tight">{title}</p>
        <p className="text-[11px] text-ink-600 mt-0.5 leading-relaxed">{body}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} testid={`toggle-${testid}`} />
    </div>
  )
}

export default function PrivacyControlScreen({ onBack, onOpenProtect, onOpenFAQ, onOpenPrivacy, onWipeOpen }) {
  const [prefs, setPrefs] = useState(getPrivacyPrefs())

  useEffect(() => { setPrivacyPrefs(prefs) }, [prefs])

  return (
    <>
      <TopBar title="Privacy Control" onBack={onBack} subtitle="Decide what Perk Orbit can see" />
      <main className="px-5 space-y-3 pb-10">
        <Card className="p-5 bg-emerald-50/40 border-emerald-200" data-testid="privacy-control-hero">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-emerald-800" />
            <p className="font-display font-bold text-ink-900">Your data, your switches</p>
          </div>
          <p className="text-xs text-ink-600 leading-relaxed">
            Every feature that touches your data is a toggle. Flip anything off — the app keeps working.
          </p>
        </Card>

        <Card className="p-5 divide-y divide-ink-100">
          <p className="font-display font-bold text-ink-900 pb-2">Data transparency</p>
          <PrefRow
            icon={MessageSquareText}
            title="Auto-scan SMS (Android only)"
            body="Background read of incoming SMS to detect vouchers. Bank OTPs and personal chats are filtered on-device."
            checked={prefs.smsScanEnabled}
            onChange={(v) => setPrefs(p => ({ ...p, smsScanEnabled: v }))}
            testid="sms-scan"
          />
          <PrefRow
            icon={ScanLine}
            title="Paste SMS extraction"
            body="When you paste SMS text in Add Voucher, send it to AI to extract details. One message at a time."
            checked={prefs.pasteSmsExtractionEnabled}
            onChange={(v) => setPrefs(p => ({ ...p, pasteSmsExtractionEnabled: v }))}
            testid="paste-sms"
          />
          <PrefRow
            icon={Camera}
            title="Camera scan"
            body="Upload a photo of a voucher / membership card for AI extraction. Image is not retained."
            checked={prefs.cameraScanEnabled}
            onChange={(v) => setPrefs(p => ({ ...p, cameraScanEnabled: v }))}
            testid="camera"
          />
          <PrefRow
            icon={Bell}
            title="Expiry & ROI notifications"
            body="Local push reminders for vouchers expiring soon or memberships hitting break-even."
            checked={prefs.notificationsEnabled}
            onChange={(v) => setPrefs(p => ({ ...p, notificationsEnabled: v }))}
            testid="notifs"
          />
        </Card>

        <Card className="p-0 overflow-hidden">
          <button data-testid="pc-faq" onClick={onOpenFAQ} className="w-full flex items-center justify-between px-5 py-4 hover:bg-ink-50 border-b border-ink-100">
            <span className="text-sm font-semibold text-ink-800 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-800" /> Security FAQ</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="pc-protect" onClick={onOpenProtect} className="w-full flex items-center justify-between px-5 py-4 hover:bg-ink-50 border-b border-ink-100">
            <span className="text-sm font-semibold text-ink-800 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-800" /> How we protect you</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
          <button data-testid="pc-privacy" onClick={onOpenPrivacy} className="w-full flex items-center justify-between px-5 py-4 hover:bg-ink-50">
            <span className="text-sm font-semibold text-ink-800 inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-800" /> Full Privacy Policy</span>
            <ChevronRight className="w-4 h-4 text-ink-400" />
          </button>
        </Card>

        <Card className="p-5 border-terracotta-200 bg-terracotta-50/30" data-testid="pc-danger">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-terracotta-700" />
            <p className="font-display font-bold text-terracotta-800">Delete my data</p>
          </div>
          <p className="text-xs text-ink-700 leading-relaxed mb-3">
            One-tap erasure of your account and every record we hold — vouchers, points, payments, referrals.
          </p>
          <button
            data-testid="pc-wipe"
            onClick={onWipeOpen}
            className="w-full bg-terracotta-700 text-white font-semibold py-3 rounded-full active:scale-95 transition inline-flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> Clear All My Data
          </button>
        </Card>
      </main>
    </>
  )
}
