import React, { useState } from 'react'
import { Sparkles, ShieldCheck, Camera } from 'lucide-react'
import { Sheet, PrimaryButton } from '../components/ui'
import { Vouchers, Extract } from '../lib/api'

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

export default function AddVoucherSheet({ open, onClose, pin, onSaved, toast }) {
  const [mode, setMode] = useState('manual')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', how_to_redeem: '', notes: '' })
  const [smsText, setSmsText] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [parentBrand, setParentBrand] = useState(null)
  const [dateError, setDateError] = useState('')

  // Live parent-brand suggestion (debounced)
  React.useEffect(() => {
    if (!form.brand || form.brand.length < 2) { setParentBrand(null); return }
    const id = setTimeout(() => {
      fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/api/brands/lookup?q=${encodeURIComponent(form.brand)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const top = d?.results?.[0]
          if (top && (top.brand.toLowerCase() === form.brand.toLowerCase() || form.brand.toLowerCase().includes(top.brand.toLowerCase().slice(0, 4)))) {
            setParentBrand(top)
          } else setParentBrand(null)
        }).catch(() => setParentBrand(null))
    }, 280)
    return () => clearTimeout(id)
  }, [form.brand])

  // Validate End >= Start for memberships
  React.useEffect(() => {
    if (form.category === 'memberships' && form.start_date && form.expiry) {
      if (new Date(form.expiry) < new Date(form.start_date)) {
        setDateError('End date cannot be before Start date')
      } else setDateError('')
    } else setDateError('')
  }, [form.start_date, form.expiry, form.category])

  const reset = () => {
    setForm({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', how_to_redeem: '', notes: '' })
    setSmsText(''); setImagePreview(null); setMode('manual'); setParentBrand(null); setDateError('')
  }

  const handleSave = async () => {
    if (!form.brand || !form.title) { toast('Brand and title are required'); return }
    if (form.category === 'memberships') {
      if (!form.start_date || !form.expiry) { toast('Start and End dates are required for memberships'); return }
      if (dateError) { toast(dateError); return }
    }
    setBusy(true)
    try {
      await Vouchers.create({
        user_pin: pin,
        type: form.category === 'memberships' ? 'membership' : 'voucher',
        brand: form.brand,
        title: form.title,
        code: form.code || null,
        value: form.value ? Number(form.value) : null,
        expiry: form.expiry || null,
        start_date: form.category === 'memberships' ? (form.start_date || null) : null,
        category: form.category,
        membership_kind: form.category === 'memberships' ? (form.membership_kind || 'asset') : null,
        fee_paid: form.fee_paid ? Number(form.fee_paid) : null,
        how_to_redeem: form.how_to_redeem || null,
        notes: form.notes || null,
      })
      toast(form.category === 'memberships' ? 'Membership saved' : 'Saved to your wallet')
      reset(); onClose(); onSaved?.()
    } catch { toast('Failed to save') } finally { setBusy(false) }
  }

  const handleSmsExtract = async () => {
    if (!smsText.trim()) return
    setBusy(true)
    const chunks = smsText.split(/\n\s*\n|---+/).map(s => s.trim()).filter(s => s.length > 10)
    try {
      if (chunks.length <= 1) {
        const data = await Extract.sms(smsText)
        setForm(f => ({
          ...f,
          brand: data.brand || f.brand, title: data.title || f.title, code: data.code || f.code,
          value: data.value || f.value, expiry: data.expiry || f.expiry,
          category: data.category || f.category, membership_kind: data.membership_kind || f.membership_kind,
          how_to_redeem: data.how_to_redeem || f.how_to_redeem,
        }))
        setMode('manual'); toast('Extracted from SMS')
      } else {
        let saved = 0
        for (const chunk of chunks) {
          try {
            const data = await Extract.sms(chunk)
            if (data?.brand && data?.title) {
              await Vouchers.create({
                user_pin: pin,
                type: data.category === 'memberships' ? 'membership' : 'voucher',
                brand: data.brand, title: data.title,
                code: data.code || null, value: data.value || null, expiry: data.expiry || null,
                category: data.category || 'vouchers',
                membership_kind: data.membership_kind || null,
                how_to_redeem: data.how_to_redeem || null,
              })
              saved++
            }
          } catch { /* skip */ }
        }
        toast(`Saved ${saved} of ${chunks.length} vouchers`)
        reset(); onClose(); onSaved?.()
      }
    } catch { toast('Could not parse SMS') } finally { setBusy(false) }
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
            brand: data.brand || f.brand, title: data.title || f.title, code: data.code || f.code,
            value: data.value || f.value, expiry: data.expiry || f.expiry,
            category: data.category || f.category, membership_kind: data.membership_kind || f.membership_kind,
            how_to_redeem: data.how_to_redeem || f.how_to_redeem,
          }))
          setMode('manual'); toast('Scanned voucher details')
        } catch { toast('Scan failed — fill manually'); setMode('manual') }
        finally { setBusy(false) }
      }
      reader.readAsDataURL(file)
    } catch { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title={form.category === 'memberships' ? 'Add Membership' : 'Add Voucher'} testid="add-sheet">
      <div className="flex gap-2 p-1 bg-ink-100 rounded-full mb-5">
        <button data-testid="mode-manual" onClick={() => setMode('manual')} className={`pill-tab ${mode === 'manual' ? 'active' : ''}`}>Manual</button>
        <button data-testid="mode-scan" onClick={() => setMode('scan')} className={`pill-tab ${mode === 'scan' ? 'active' : ''}`}>Scan</button>
        <button data-testid="mode-sms" onClick={() => setMode('sms')} className={`pill-tab ${mode === 'sms' ? 'active' : ''}`}>Paste SMS</button>
      </div>

      {mode === 'sms' ? (
        <div className="space-y-3">
          <p className="text-xs text-ink-500">Paste a promotional SMS, or <span className="font-semibold text-emerald-800">paste many at once</span> separated by a blank line — we&apos;ll save them all in one go.</p>
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5" data-testid="add-sms-secure-note">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">Your SMS data is processed securely and is never stored on external servers. We only extract the voucher fields.</p>
          </div>
          <textarea data-testid="sms-input" value={smsText} onChange={(e) => setSmsText(e.target.value)} rows={8}
            className="w-full bg-ink-50 border border-ink-200 rounded-2xl p-3 text-sm placeholder:text-ink-400"
            placeholder={'Flat ₹150 off on Swiggy! Code SWIGGY150 by 25 Nov.\n\nMyntra Bonanza — 20% off, code MYNTRA20, till 30 Nov.'} />
          <PrimaryButton data-testid="sms-extract" onClick={handleSmsExtract} disabled={busy || !smsText.trim()}>
            <Sparkles className="w-4 h-4" /> {busy ? 'Extracting…' : 'Extract details'}
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
          {/* TYPE SELECTOR — at the very top so the rest of the form adapts to it */}
          <div data-testid="type-selector-group">
            <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">What are you adding?</label>
            <div className="flex gap-2 mt-2">
              <button
                data-testid="cat-vouchers"
                onClick={() => setForm({ ...form, category: 'vouchers', membership_kind: '', fee_paid: '' })}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold transition active:scale-95 ${form.category === 'vouchers' ? 'bg-ink-900 text-white shadow-md' : 'bg-ink-100 text-ink-700'}`}
              >
                🎟 Voucher / Coupon
              </button>
              <button
                data-testid="cat-memberships"
                onClick={() => setForm({ ...form, category: 'memberships', membership_kind: form.membership_kind || 'asset', code: '', value: '' })}
                className={`flex-1 py-3 rounded-2xl text-sm font-bold transition active:scale-95 ${form.category === 'memberships' ? 'bg-emerald-800 text-white shadow-md' : 'bg-ink-100 text-ink-700'}`}
              >
                💎 Membership
              </button>
            </div>
            <p className="text-[11px] text-ink-500 mt-2 leading-relaxed">
              {form.category === 'memberships'
                ? 'Tracks ROI on paid memberships like Amazon Prime, Croma Plus, BigBasket Super.'
                : 'For one-time discount codes, gift cards or loyalty coupons.'}
            </p>
          </div>

          {/* COMMON FIELDS */}
          <FormField label="Brand" testid="field-brand" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder={form.category === 'memberships' ? 'Amazon, Croma, BigBasket…' : 'Swiggy, Croma, Myntra…'} />
          {parentBrand ? (
            <div data-testid="parent-brand-chip" className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-full px-2.5 py-1 -mt-1">
              🏢 Part of <span className="font-bold">{parentBrand.parent_company}</span> · auto-tagged for ROI tracking
            </div>
          ) : null}
          <FormField
            label={form.category === 'memberships' ? 'Plan name' : 'Title'}
            testid="field-title"
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
            placeholder={form.category === 'memberships' ? 'Amazon Prime Yearly' : '₹100 off on order above ₹399'}
          />

          {/* VOUCHER-ONLY FIELDS */}
          {form.category === 'vouchers' ? (
            <>
              <div className="grid grid-cols-2 gap-3" data-testid="voucher-only-fields">
                <FormField label="Code" testid="field-code" value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} placeholder="SAVE100" mono />
                <FormField label="Value (₹)" testid="field-value" type="number" value={form.value} onChange={(v) => setForm({ ...form, value: v })} placeholder="100" />
              </div>
              <FormField label="Expires on" testid="field-expiry" type="date" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
            </>
          ) : (
            /* MEMBERSHIP-ONLY FIELDS */
            <div className="space-y-3" data-testid="membership-only-fields">
              <div>
                <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Membership type</label>
                <div className="flex gap-2 mt-2">
                  <button data-testid="kind-asset" onClick={() => setForm({ ...form, membership_kind: 'asset' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold transition active:scale-95 ${form.membership_kind === 'asset' ? 'bg-emerald-800 text-white' : 'bg-ink-100 text-ink-700'}`}>Retail / Asset</button>
                  <button data-testid="kind-content" onClick={() => setForm({ ...form, membership_kind: 'content' })} className={`flex-1 py-2.5 rounded-full text-xs font-semibold transition active:scale-95 ${form.membership_kind === 'content' ? 'bg-emerald-800 text-white' : 'bg-ink-100 text-ink-700'}`}>Content / Streaming</button>
                </div>
                <p className="text-[10px] text-ink-500 mt-1.5 leading-relaxed">
                  {form.membership_kind === 'content'
                    ? 'Netflix, Hotstar, Spotify — content/streaming subscriptions.'
                    : 'Amazon Prime, BigBasket Super — earns back via discounts (ROI tracked).'}
                </p>
              </div>
              <FormField label="Annual / membership fee paid (₹)" testid="field-fee" type="number" value={form.fee_paid} onChange={(v) => setForm({ ...form, fee_paid: v })} placeholder={form.membership_kind === 'asset' ? '1499' : '149/month'} />
              <div className="grid grid-cols-2 gap-3" data-testid="membership-dates">
                <FormField label="Start date *" testid="field-start-date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
                <FormField label="End date *" testid="field-expiry" type="date" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
              </div>
              {dateError ? (
                <p data-testid="date-validation-error" className="text-[11px] text-terracotta-700 font-semibold -mt-1">⚠️ {dateError}</p>
              ) : (form.start_date && form.expiry && !dateError ? (
                <p data-testid="date-duration-preview" className="text-[11px] text-emerald-800 font-semibold -mt-1">
                  ✓ Valid · {Math.round((new Date(form.expiry) - new Date(form.start_date)) / 86400000)} days total
                  {form.fee_paid ? ` · ₹${(Number(form.fee_paid) / Math.max(1, Math.round((new Date(form.expiry) - new Date(form.start_date)) / 86400000))).toFixed(2)}/day` : ''}
                </p>
              ) : null)}
            </div>
          )}

          <FormField
            label={form.category === 'memberships' ? 'Notes / benefits' : 'How to redeem'}
            testid="field-howto"
            textarea
            value={form.how_to_redeem}
            onChange={(v) => setForm({ ...form, how_to_redeem: v })}
            placeholder={form.category === 'memberships' ? 'Includes Prime Video, free delivery on Pantry, exclusive deals on Lightning Sale…' : "Apply at checkout under 'Promo code'…"}
          />
          <PrimaryButton data-testid="save-voucher" onClick={handleSave} disabled={busy || !!dateError}>
            {busy ? 'Saving…' : (form.category === 'memberships' ? 'Save membership' : 'Save voucher')}
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}
