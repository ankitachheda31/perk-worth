// Tiny pub-sub for global app state (PIN, screen, profile menu)
import { useEffect, useState, useCallback } from 'react'

const KEY_PIN = 'perk_orbit_pin'
const KEY_PROFILE = 'perk_orbit_profile'

export function getStoredPin() {
  return localStorage.getItem(KEY_PIN) || null
}
export function setStoredPin(pin) {
  if (pin) localStorage.setItem(KEY_PIN, pin)
  else localStorage.removeItem(KEY_PIN)
}

export function getProfile() {
  try {
    const raw = localStorage.getItem(KEY_PROFILE)
    return raw ? JSON.parse(raw) : { name: 'Member', email: '', phone: '' }
  } catch {
    return { name: 'Member', email: '', phone: '' }
  }
}
export function setProfile(p) {
  localStorage.setItem(KEY_PROFILE, JSON.stringify(p))
}

// Back-stack hook: maintains screen history for hardware back button
export function useScreenStack(initial = 'home') {
  const [stack, setStack] = useState([initial])

  const push = useCallback((screen, params = {}) => {
    setStack((s) => [...s, { screen, params }])
  }, [])
  const replace = useCallback((screen, params = {}) => {
    setStack((s) => [...s.slice(0, -1), { screen, params }])
  }, [])
  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }, [])
  const reset = useCallback((screen) => {
    setStack([{ screen, params: {} }])
  }, [])

  // Normalize initial as object
  useEffect(() => {
    if (typeof stack[0] === 'string') setStack([{ screen: stack[0], params: {} }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hardware/browser back button handling
  useEffect(() => {
    const handlePop = () => {
      pop()
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [pop])

  const current = typeof stack[stack.length - 1] === 'string'
    ? { screen: stack[stack.length - 1], params: {} }
    : stack[stack.length - 1]

  return { current, push, pop, replace, reset, depth: stack.length }
}
