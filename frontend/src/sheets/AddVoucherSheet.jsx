import React, { useState, useEffect, useRef } from 'react'
import { Sparkles, ShieldCheck, Camera, Mic, Square } from 'lucide-react'
import { Sheet, PrimaryButton } from '../components/ui'
import BestCardWidget from '../components/BestCardWidget'
import { Vouchers, Extract, Loyalty } from '../lib/api'

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
      const base = (import.meta.env.VITE_BACKEND_URL) || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
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

// Predefined owner/relation options for the household ownership tag.
// "Self" is the default. The list focuses on Indian family relations.
export const OWNER_OPTIONS = [
  'Self', 'Spouse', 'Husband', 'Wife',
  'Father', 'Mother', 'Brother', 'Sister',
  'Brother-in-law', 'Sister-in-law',
  'Son', 'Daughter',
  'Father-in-law', 'Mother-in-law',
  'Other',
]

function OwnerPicker({ value, onChange }) {
  const safeValue = OWNER_OPTIONS.includes(value) ? value : 'Self'
  const [showOther, setShowOther] = React.useState(safeValue === 'Other' || (value && !OWNER_OPTIONS.includes(value)))
  const [otherText, setOtherText] = React.useState(OWNER_OPTIONS.includes(value) ? '' : (value || ''))

  return (
    <div data-testid="owner-picker-group">
      <label className="text-[11px] font-bold text-ink-500 uppercase tracking-wider">Owned by</label>
      <p className="text-[11px] text-ink-500 mt-1 leading-relaxed">Whose voucher / membership is this? Useful in the Family Circle view.</p>
      <div className="mt-2 flex flex-wrap gap-1.5" data-testid="owner-chip-row">
        {OWNER_OPTIONS.map((opt) => {
          const active = safeValue === opt
          return (
            <button
              key={opt}
              type="button"
              data-testid={`owner-chip-${opt.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')}`}
              onClick={() => {
                if (opt === 'Other') {
                  setShowOther(true); onChange('Other')
                } else {
                  setShowOther(false); setOtherText(''); onChange(opt)
                }
              }}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition active:scale-95 ${
                active
                  ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm'
                  : 'bg-ink-50 text-ink-700 border-ink-200 hover:border-emerald-700'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {showOther ? (
        <input
          data-testid="owner-other-input"
          type="text"
          value={otherText}
          onChange={(e) => { setOtherText(e.target.value); onChange(e.target.value || 'Other') }}
          placeholder="e.g. Cousin, Roommate, Uncle…"
          className="mt-2 w-full bg-ink-50 border border-ink-200 rounded-2xl px-3 py-2.5 text-sm placeholder:text-ink-400"
        />
      ) : null}
    </div>
  )
}



export default function AddVoucherSheet({ open, onClose, pin, onSaved, toast, editing }) {
  const [mode, setMode] = useState('manual')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', benefit_rate: '', how_to_redeem: '', notes: '', owner: 'Self', membership_number: '', program_type: '' })
  const [smsText, setSmsText] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [parentBrand, setParentBrand] = useState(null)
  const [dateError, setDateError] = useState('')
  // Smart loyalty auto-detect — fires when user types a known brand
  const [loyalty, setLoyalty] = useState(null)             // backend classify response when matched
  const [autoApplied, setAutoApplied] = useState(false)    // form was auto-switched (user can undo with "Custom")
  const [overrideActive, setOverrideActive] = useState(false)  // user clicked "Custom" → stop auto-applying

  // Live parent-brand resolution kept as a fallback (in case the user types
  // the brand name verbatim without picking a suggestion).
  useEffect(() => {
    if (!form.brand || form.brand.length < 2) { setParentBrand(null); return }
    const id = setTimeout(() => {
      const base = (import.meta.env.VITE_BACKEND_URL) || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
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

  // Live loyalty classifier — detect "this is an airline / hotel / fuel card / etc."
  // and auto-switch the form unless the user has opted into Custom mode.
  useEffect(() => {
    if (editing) return  // never auto-switch while editing an existing voucher
    if (!form.brand || form.brand.length < 2) { setLoyalty(null); setAutoApplied(false); return }
    const id = setTimeout(() => {
      Loyalty.classify(form.brand)
        .then((d) => {
          if (!d?.matched) { setLoyalty(null); setAutoApplied(false); return }
          setLoyalty(d)
          // Only auto-apply when:
          //  · the user hasn't switched to Custom mode,
          //  · we haven't already auto-applied (don't keep overwriting their tweaks),
          //  · the form is still in the default voucher state.
          if (!overrideActive && !autoApplied) {
            setForm((prev) => ({
              ...prev,
              category: 'memberships',
              membership_kind: d.membership_kind || prev.membership_kind || 'content',
              program_type: d.type || prev.program_type || '',
            }))
            setAutoApplied(true)
          }
        })
        .catch(() => { setLoyalty(null); setAutoApplied(false) })
    }, 320)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.brand, editing])

  const enterCustomMode = () => {
    setOverrideActive(true)
    setAutoApplied(false)
    // Keep user's typed values — only label/structure changes.
  }
  const reapplyAutoDetect = () => {
    if (!loyalty) return
    setOverrideActive(false)
    setForm((prev) => ({
      ...prev,
      category: 'memberships',
      membership_kind: loyalty.membership_kind || prev.membership_kind || 'content',
      program_type: loyalty.type || prev.program_type || '',
    }))
    setAutoApplied(true)
  }

  // Active field label for the membership number input.
  // Honors the override: in Custom mode we always fall back to generic.
  const detectedFieldLabel = (loyalty && !overrideActive) ? loyalty.field_label : null

  // Validate End >= Start for memberships
  React.useEffect(() => {
    if (form.category === 'memberships' && form.start_date && form.expiry) {
      if (new Date(form.expiry) < new Date(form.start_date)) {
        setDateError('End date cannot be before Start date')
      } else setDateError('')
    } else setDateError('')
  }, [form.start_date, form.expiry, form.category])

  const reset = () => {
    setForm({ brand: '', title: '', code: '', value: '', expiry: '', start_date: '', category: 'vouchers', membership_kind: '', fee_paid: '', benefit_rate: '', how_to_redeem: '', notes: '', owner: 'Self', membership_number: '', program_type: '' })
    setSmsText(''); setImagePreview(null); setMode('manual'); setParentBrand(null); setDateError('')
    setLoyalty(null); setAutoApplied(false); setOverrideActive(false)
  }

  // When `editing` voucher prop changes, prefill the form. When it clears OR sheet closes, reset.
  React.useEffect(() => {
    if (editing) {
      setMode('manual')
      setForm({
        brand: editing.brand || '',
        title: editing.title || '',
        code: editing.code || '',
        value: editing.value != null ? String(editing.value) : '',
        expiry: editing.expiry || '',
        start_date: editing.start_date || '',
        category: editing.category || 'vouchers',
        membership_kind: editing.membership_kind || '',
        fee_paid: editing.fee_paid != null ? String(editing.fee_paid) : '',
        // benefit_rate stored as decimal (0-1); UI uses percent (0-100)
        benefit_rate: editing.benefit_rate != null ? String(Math.round(editing.benefit_rate * 100)) : '',
        how_to_redeem: editing.how_to_redeem || '',
        notes: editing.notes || '',
        owner: editing.owner || 'Self',
        membership_number: editing.membership_number || '',
        program_type: editing.program_type || '',
      })
    } else {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const isEditMode = !!editing

  const handleSave = async () => {
    if (!form.brand || !form.title) { toast('Brand and title are required'); return }
    if (form.category === 'memberships') {
      if (!form.start_date || !form.expiry) { toast('Start and End dates are required for memberships'); return }
      if (dateError) { toast(dateError); return }
    }
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
        start_date: form.category === 'memberships' ? (form.start_date || null) : null,
        category: form.category,
        membership_kind: form.category === 'memberships' ? (form.membership_kind || 'asset') : null,
        fee_paid: form.fee_paid ? Number(form.fee_paid) : null,
        benefit_rate: (form.category === 'memberships' && form.benefit_rate) ? (Number(form.benefit_rate) / 100) : null,
        how_to_redeem: form.how_to_redeem || null,
        notes: form.notes || null,
        owner: form.owner || 'Self',
        membership_number: form.category === 'memberships' ? (form.membership_number || null) : null,
        program_type: form.category === 'memberships' ? (form.program_type || null) : null,
      }
      if (isEditMode) {
        // PATCH only — strip immutable identity fields the backend ignores on update
        // eslint-disable-next-line no-unused-vars
        const { user_pin, type, ...patchBody } = payload
        await Vouchers.update(editing.id, patchBody)
        toast(form.category === 'memberships' ? 'Membership updated' : 'Voucher updated')
      } else {
        await Vouchers.create(payload)
        toast(form.category === 'memberships' ? 'Membership saved' : 'Saved to your wallet')
      }
      reset(); onClose(); onSaved?.()
    } catch { toast(isEditMode ? 'Failed to update' : 'Failed to save') } finally { setBusy(false) }
  }

  // ─── Voice-to-Voucher state ───────────────────────────────────────────────
  const [voiceState, setVoiceState] = useState('idle')   // idle | recording | uploading | reviewing | error
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [voiceError, setVoiceError] = useState('')
  const [recordSecs, setRecordSecs] = useState(0)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const autoStopTimerRef = useRef(null)

  const stopVoiceRecording = (cancel = false) => {
    try { mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop() } catch { /* ignore */ }
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    if (autoStopTimerRef.current) { clearTimeout(autoStopTimerRef.current); autoStopTimerRef.current = null }
    if (cancel) {
      audioChunksRef.current = []
      setVoiceState('idle'); setRecordSecs(0); setVoiceTranscript('')
    }
  }

  const startVoiceRecording = async () => {
    setVoiceError(''); setVoiceTranscript(''); audioChunksRef.current = []
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setVoiceError('Microphone not supported on this browser. Try Chrome on Android or desktop.')
      setVoiceState('error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // Choose a mimeType the backend can hand off to Whisper (webm/opus is universal)
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
        : ''
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRecorderRef.current = rec
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data) }
      rec.onstop = async () => {
        // Always release the mic
        stream.getTracks().forEach(t => t.stop())
        if (audioChunksRef.current.length === 0) { setVoiceState('idle'); return }
        const blob = new Blob(audioChunksRef.current, { type: mime || 'audio/webm' })
        await uploadVoiceBlob(blob)
      }
      rec.start()
      setVoiceState('recording'); setRecordSecs(0)
      recordTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000)
      // 15-second auto-stop
      autoStopTimerRef.current = setTimeout(() => stopVoiceRecording(false), 15000)
    } catch (err) {
      const denied = (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'))
      setVoiceError(denied ? 'Microphone permission denied. Allow access from your browser settings and try again.' : 'Microphone not supported.')
      setVoiceState('error')
    }
  }

  const uploadVoiceBlob = async (blob) => {
    setVoiceState('uploading')
    try {
      const fd = new FormData()
      const ext = (blob.type.includes('mp4') ? 'm4a' : blob.type.includes('wav') ? 'wav' : 'webm')
      fd.append('file', blob, `voice.${ext}`)
      const base = (import.meta.env.VITE_BACKEND_URL) || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) || ''
      const resp = await fetch(`${base}/api/extract/voice`, { method: 'POST', body: fd })
      if (!resp.ok) {
        const t = await resp.text().catch(() => '')
        throw new Error(t || `Voice extraction failed (${resp.status})`)
      }
      const data = await resp.json()
      setVoiceTranscript(data.transcript || '')
      const p = data.parsed || {}
      // Prefill form fields, leaving non-mentioned ones untouched
      setForm(f => ({
        ...f,
        brand: p.brand || f.brand,
        title: p.title || f.title,
        code: p.code || f.code,
        value: p.value || f.value,
        expiry: p.expiry || f.expiry,
        category: p.category || f.category,
        membership_kind: p.membership_kind || f.membership_kind,
        fee_paid: p.fee_paid || f.fee_paid,
        how_to_redeem: p.how_to_redeem || f.how_to_redeem,
      }))
      setVoiceState('reviewing')
    } catch (e) {
      setVoiceError(typeof e?.message === 'string' ? e.message : 'Voice extraction failed')
      setVoiceState('error')
    }
  }

  const confirmVoiceParse = () => { setMode('manual'); setVoiceState('idle'); toast('Review and tap Save when ready') }

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
    <Sheet open={open} onClose={() => { reset(); onClose() }} title={isEditMode ? (form.category === 'memberships' ? 'Edit Membership' : 'Edit Voucher') : (form.category === 'memberships' ? 'Add Membership' : 'Add Voucher')} testid="add-sheet">
      {/* Mode selector — hidden in edit mode (only Manual makes sense when editing) */}
      {!isEditMode ? (
        <div className="flex gap-2 p-1 bg-ink-100 rounded-full mb-5">
          <button data-testid="mode-manual" onClick={() => setMode('manual')} className={`pill-tab ${mode === 'manual' ? 'active' : ''}`}>Manual</button>
          <button data-testid="mode-scan" onClick={() => setMode('scan')} className={`pill-tab ${mode === 'scan' ? 'active' : ''}`}>Scan</button>
          <button data-testid="mode-sms" onClick={() => setMode('sms')} className={`pill-tab ${mode === 'sms' ? 'active' : ''}`}>SMS</button>
          <button data-testid="mode-voice" onClick={() => { setMode('voice'); setVoiceState('idle'); setVoiceError('') }} className={`pill-tab ${mode === 'voice' ? 'active' : ''}`}>
            <Mic className="w-3.5 h-3.5 inline -mt-0.5" /> Voice
          </button>
        </div>
      ) : null}

      {mode === 'voice' ? (
        <div className="space-y-3" data-testid="voice-mode">
          <p className="text-xs text-ink-500">
            Tap the mic and describe your voucher in Hindi, English or Hinglish — for example: <em>&quot;Add Swiggy ₹150 off, code SWIGGY150, expires 25 November&quot;</em>.
          </p>
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">Audio is sent once to Whisper for transcription and is <strong>not retained</strong> on our servers.</p>
          </div>

          {voiceState === 'idle' ? (
            <button
              data-testid="voice-start-btn"
              onClick={startVoiceRecording}
              className="w-full py-8 rounded-3xl bg-emerald-800 text-white text-base font-bold flex flex-col items-center gap-3 active:scale-95 transition hover:bg-emerald-900"
            >
              <Mic className="w-10 h-10" />
              Tap to record (15 sec max)
            </button>
          ) : null}

          {voiceState === 'recording' ? (
            <button
              data-testid="voice-stop-btn"
              onClick={() => stopVoiceRecording(false)}
              className="w-full py-8 rounded-3xl bg-terracotta-600 text-white text-base font-bold flex flex-col items-center gap-3 active:scale-95 transition relative animate-pulse"
            >
              <Square className="w-10 h-10" />
              <span data-testid="voice-record-timer">Recording… {recordSecs}s / 15s · tap to stop</span>
            </button>
          ) : null}

          {voiceState === 'uploading' ? (
            <div data-testid="voice-uploading" className="w-full py-8 rounded-3xl bg-ink-100 text-ink-700 text-base font-bold flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-ink-300 border-t-emerald-800 rounded-full animate-spin" />
              Transcribing &amp; extracting…
            </div>
          ) : null}

          {voiceState === 'reviewing' ? (
            <div data-testid="voice-review" className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">We heard</p>
                <p data-testid="voice-transcript" className="text-sm text-ink-800 mt-1 leading-relaxed">&ldquo;{voiceTranscript}&rdquo;</p>
              </div>
              <div className="bg-cream border border-ink-200 rounded-2xl p-3 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Parsed fields (review below)</p>
                {form.brand ? <p className="text-xs"><span className="text-ink-500">Brand:</span> <span className="font-semibold">{form.brand}</span></p> : null}
                {form.title ? <p className="text-xs"><span className="text-ink-500">Title:</span> <span className="font-semibold">{form.title}</span></p> : null}
                {form.code ? <p className="text-xs"><span className="text-ink-500">Code:</span> <span className="font-mono font-semibold">{form.code}</span></p> : null}
                {form.value ? <p className="text-xs"><span className="text-ink-500">Value:</span> <span className="font-semibold">₹{form.value}</span></p> : null}
                {form.expiry ? <p className="text-xs"><span className="text-ink-500">Expiry:</span> <span className="font-semibold">{form.expiry}</span></p> : null}
                {form.category === 'memberships' ? <p className="text-xs"><span className="text-ink-500">Category:</span> <span className="font-semibold">Membership · {form.membership_kind}</span></p> : null}
              </div>
              <div className="flex gap-2">
                <button data-testid="voice-retry" onClick={() => { setVoiceState('idle'); setVoiceTranscript('') }} className="flex-1 py-3 rounded-full text-xs font-bold bg-ink-100 text-ink-700">Retry</button>
                <PrimaryButton data-testid="voice-confirm" onClick={confirmVoiceParse}>Review &amp; save →</PrimaryButton>
              </div>
            </div>
          ) : null}

          {voiceState === 'error' ? (
            <div data-testid="voice-error" className="bg-terracotta-50 border border-terracotta-200 rounded-2xl p-4 text-center">
              <p className="text-sm font-semibold text-terracotta-700">⚠️ {voiceError}</p>
              <button onClick={() => { setVoiceState('idle'); setVoiceError('') }} className="text-xs text-terracotta-700 underline mt-2">Try again</button>
            </div>
          ) : null}
        </div>
      ) : mode === 'sms' ? (
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

          {parentBrand?.category && !editing ? (
            <BestCardWidget
              brandCategory={parentBrand.category}
              brand={parentBrand.brand}
              voucherValue={form.category === 'vouchers' ? form.value : null}
              pin={pin}
              source="add_sheet"
            />
          ) : null}

          {/* SMART LOYALTY AUTO-DETECT BANNER (with always-visible Custom override) */}
          {loyalty && (
            <div
              data-testid="loyalty-detected-banner"
              className={`rounded-2xl px-4 py-3 border ${
                overrideActive
                  ? 'bg-ink-50 border-ink-200'
                  : 'bg-gradient-to-br from-emerald-50 to-gold-50 border-emerald-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg leading-none mt-0.5" aria-hidden="true">{loyalty.field_label?.icon || '🎫'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    {overrideActive ? 'Custom format active' : 'Detected'}
                  </p>
                  <p className="text-sm font-display font-bold text-ink-900 leading-tight mt-0.5">
                    {loyalty.brand} <span className="text-ink-500 font-semibold">·</span> {loyalty.program}
                  </p>
                  <p className="text-[11px] text-ink-600 mt-1 leading-snug">
                    {overrideActive
                      ? `Using generic 'Membership Number' field — your typed values are preserved.`
                      : `Form auto-switched to ${loyalty.type.replace(/_/g, ' ')} membership · field below is "${loyalty.field_label?.label}".`}
                  </p>
                </div>
              </div>
              <div className="flex justify-end mt-2">
                {overrideActive ? (
                  <button
                    data-testid="loyalty-reapply"
                    onClick={reapplyAutoDetect}
                    className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 bg-white border border-emerald-300 rounded-full px-3 py-1.5 hover:bg-emerald-50 active:scale-95 transition"
                  >
                    ↻ Re-apply auto-detect
                  </button>
                ) : (
                  <button
                    data-testid="loyalty-custom-override"
                    onClick={enterCustomMode}
                    className="text-[11px] font-bold uppercase tracking-wider text-ink-700 bg-white border border-ink-200 rounded-full px-3 py-1.5 hover:bg-ink-50 active:scale-95 transition"
                  >
                    Use custom format
                  </button>
                )}
              </div>
            </div>
          )}

          <FormField
            label={form.category === 'memberships' ? 'Plan name' : 'Title'}
            testid="field-title"
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
            placeholder={form.category === 'memberships' ? 'Amazon Prime Yearly' : '₹100 off on order above ₹399'}
          />

          {/* OWNER PICKER — who does this voucher/membership belong to? */}
          <OwnerPicker value={form.owner || 'Self'} onChange={(v) => setForm({ ...form, owner: v })} />

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

              {/* MEMBERSHIP NUMBER — label + placeholder are dynamic based on detected program type.
                 In Custom mode (overrideActive=true) we always fall back to the generic label,
                 preserving any value the user has typed. */}
              <FormField
                label={detectedFieldLabel ? `${detectedFieldLabel.icon} ${detectedFieldLabel.label}` : '🎫 Membership Number'}
                testid="field-membership-number"
                value={form.membership_number}
                onChange={(v) => setForm({ ...form, membership_number: v })}
                placeholder={detectedFieldLabel?.placeholder || 'Membership / Customer ID'}
                mono
              />

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
            {busy ? 'Saving…' : (isEditMode ? 'Update' : (form.category === 'memberships' ? 'Save membership' : 'Save voucher'))}
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}
