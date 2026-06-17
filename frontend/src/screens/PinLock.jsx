import React, { useEffect, useRef, useState } from 'react'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']

export default function PinLock({ mode = 'verify', expected, onSuccess }) {
  // mode: 'set' (create new pin) | 'verify' (existing)
  const [pin, setPin] = useState('')
  const [stage, setStage] = useState(mode === 'set' ? 'create' : 'verify') // create -> confirm -> done
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState('')

  const len = 4

  const handleKey = (k) => {
    setError('')
    const target = stage === 'confirm' ? confirmPin : pin
    const setter = stage === 'confirm' ? setConfirmPin : setPin
    if (k === 'back') { setter(target.slice(0, -1)); return }
    if (!/^\d$/.test(k)) return
    if (target.length >= len) return
    setter(target + k)
  }

  useEffect(() => {
    if (stage === 'verify' && pin.length === len) {
      if (pin === expected) {
        onSuccess(pin)
      } else {
        setError('Incorrect PIN')
        setTimeout(() => setPin(''), 250)
      }
    } else if (stage === 'create' && pin.length === len) {
      setStage('confirm')
    } else if (stage === 'confirm' && confirmPin.length === len) {
      if (confirmPin === pin) {
        onSuccess(pin)
      } else {
        setError('PINs do not match. Try again.')
        setTimeout(() => { setPin(''); setConfirmPin(''); setStage('create') }, 600)
      }
    }
  }, [pin, confirmPin, stage, expected, onSuccess])

  const visible = stage === 'confirm' ? confirmPin : pin

  const title = stage === 'verify' ? 'Welcome back' : stage === 'create' ? 'Set a 4-digit PIN' : 'Confirm your PIN'
  const sub = stage === 'verify' ? 'Enter your PIN to unlock Perk Orbit' : stage === 'create' ? 'Used locally on this device only' : 'Re-enter to confirm'

  return (
    <div className="app-shell flex justify-center" data-testid="pin-screen">
      <div className="w-full max-w-md min-h-[100dvh] flex flex-col px-6 pt-16 pb-10">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-2xl bg-emerald-800 grid place-items-center text-white font-display font-bold">P</div>
            <span className="font-display text-lg font-bold tracking-tight">Perk Orbit</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink-900">{title}</h1>
          <p className="text-sm text-ink-500 mt-2">{sub}</p>
        </div>

        <div className="flex justify-center gap-4 mb-2">
          {Array.from({ length: len }).map((_, i) => (
            <div key={i} className={`pin-dot ${i < visible.length ? 'filled' : ''}`} data-testid={`pin-dot-${i}`} />
          ))}
        </div>
        <div className="text-center text-xs text-terracotta-700 h-5 mt-3" data-testid="pin-error">{error}</div>

        <div className="mt-auto grid grid-cols-3 gap-3" data-testid="pin-keypad">
          {KEYS.map((k, idx) => (
            <button
              key={`${k}-${idx}`}
              data-testid={k === 'back' ? 'key-back' : k === '' ? 'key-empty' : `key-${k}`}
              onClick={() => k && handleKey(k)}
              disabled={!k}
              className={`keypad-btn ${!k ? 'opacity-0 pointer-events-none' : ''}`}
            >
              {k === 'back' ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12l4-4h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H7l-4-4z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
              ) : k}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
