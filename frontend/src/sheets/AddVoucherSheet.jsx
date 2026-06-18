import React, { useState, useEffect, useRef } from 'react'
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

/**
 * Brand input with live-fuzzy autocomplete from the curated parent-child
 * registry. As the user types, hits /api/brands/lookup and shows up to 8
 * results in a dropdown with the parent conglomerate tag. Selecting a
 * suggestion fills the brand and immediately resolves the parent.
 */
function BrandAutocomplete({ value, onChange, placeholder, onSelectSuggestion }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef(null)
  const ignoreNextFetch = useRef(false)

  // Debounced search
  useEffect(() => {
    if (ignoreNextFetch.current) { ignoreNextFetch.current = false; return }
    if (!value || value.length < 2) { setSuggestions([]); setOpen(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      const base = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
      fetch(`${base}/api/brands/lookup?q=${encodeURIComponent(value)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const list = (d?.results || []).slice(0, 8)
          setSuggestions(list)
          setOpen(list.length > 0)
          setActiveIdx(-1)
        })
        .catch(() => { setSuggestions([]); setOpen(false) })
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(t)
  }, [value])

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (s) => {
    ignoreNextFetch.current = true
    onChange(s.brand)
    onSelectSuggestion?.(s)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(suggestions.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Brand</label>
      <input
        data-testid="field-brand"
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-3 text-sm placeholder:text-ink-400"
        placeholder={placeholder}
      />
      {loading && open && suggestions.length === 0 ? (
        <div className="text-[11px] text-ink-400 mt-1.5">Searching…</div>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul
          data-testid="brand-suggestions"
          className="absolute z-20 left-0 right-0 mt-1.5 bg-white border border-ink-200 rounded-2xl shadow-xl overflow-hidden max-h-80 overflow-y-auto"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.brand}-${i}`}
              data-testid={`brand-suggestion-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-2 border-b border-ink-100 last:border-b-0 transition ${i === activeIdx ? 'bg-emerald-50' : 'hover:bg-ink-50'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-900 truncate">{s.brand}</div>
                <div className="text-[11px] text-ink-500 truncate">
                  🏢 {s.parent_company}
                  {s.category ? <span className="ml-1.5 text-ink-400">· {s.category}</span> : null}
                </div>
              </div>
              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 shrink-0">Tap</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export default function AddVoucherSheet({ open, onClose, pin, onSaved, toast }) {
  const [mode, setMode] = useState('manual')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', benefit_rate: '', how_to_redeem: '', notes: '' })
  const [smsText, setSmsText] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [parentBrand, setParentBrand] = useState(null)
  const [dateError, setDateError] = useState('')

  // Live parent-brand resolution kept as a fallback (in case the user types
  // the brand name verbatim without picking a suggestion).
  useEffect(() => {
    if (!form.brand || form.brand.length < 2) { setParentBrand(null); return }
    const id = setTimeout(() => {
      const base = (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
      fetch(`${base}/api/brands/lookup?q=${encodeURIComponent(form.brand)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const top = d?.results?.[0]
          if (!top) { setParentBrand(null); return }
          const typed = form.brand.toLowerCase().trim()
          const canon = top.brand.toLowerCase()
          if (canon === typed || canon.includes(typed) || typed.includes(canon)) {
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
    setForm({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', benefit_rate: '', how_to_redeem: '', notes: '' })
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
        benefit_rate: (form.category === 'memberships' && form.benefit_rate) ? (Number(form.benefit_rate) / 100) : null,
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
          <BrandAutocomplete
            value={form.brand}
            onChange={(v) => setForm({ ...form, brand: v })}
            placeholder={form.category === 'memberships' ? 'Amazon, Croma, BigBasket…' : 'Swiggy, Croma, Myntra…'}
            onSelectSuggestion={(s) => {
              // Immediate parent-tag resolution on tap — no debounce wait
              setParentBrand(s)
              // If the title is still empty, prefill with a helpful placeholder
              if (!form.title) {
                setForm((prev) => ({
                  ...prev,
                  brand: s.brand,
                  title: prev.category === 'memberships' ? `${s.brand} membership` : '',
                }))
              }
            }}
          />
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
              <FormField label="Benefit rate (%) — e.g. 10 for 10% off all purchases" testid="field-benefit-rate" type="number" value={form.benefit_rate} onChange={(v) => setForm({ ...form, benefit_rate: v })} placeholder="10" />
              {form.fee_paid && form.benefit_rate && Number(form.benefit_rate) > 0 ? (
                <p data-testid="break-even-preview" className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 -mt-1">
                  💡 Break-even point: ₹{(Number(form.fee_paid) / (Number(form.benefit_rate) / 100)).toLocaleString('en-IN')} of spending recovers your ₹{Number(form.fee_paid).toLocaleString('en-IN')} fee
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3" data-testid="membership-dates">
                <FormField label="Start date *" testid="field-start-date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
                <FormField label="End date *" testid="field-end-date" type="date" value={form.expiry} onChange={(v) => setForm({ ...form, expiry: v })} />
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
