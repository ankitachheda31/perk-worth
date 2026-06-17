// Browser local-push helpers: registers service worker, requests permission,
// fires OS-level notifications when polled feed has new urgent items.
let registration = null

export async function ensureServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  if (registration) return registration
  try { registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }) } catch { /* ignore */ }
  return registration
}

export async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

const FIRED_KEY = 'perk_orbit_fired_notifs'
function loadFired() { try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')) } catch { return new Set() } }
function saveFired(s) { localStorage.setItem(FIRED_KEY, JSON.stringify([...s].slice(-200))) }

export async function maybeFireBrowserNotifications(items) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const fired = loadFired()
  const reg = await ensureServiceWorker()
  for (const n of items || []) {
    // Only fire OS toasts for HIGH-PRIORITY (urgent_expiry, membership_activated, referral_bonus)
    if (!['urgent_expiry', 'membership_activated', 'referral_bonus'].includes(n.kind)) continue
    if (n.read) continue
    if (fired.has(n.id)) continue
    const payload = {
      body: n.body || '',
      tag: n.id,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: { ref_screen: n.ref_screen || 'home' },
    }
    try {
      if (reg && reg.showNotification) { await reg.showNotification(n.title, payload) }
      else { new Notification(n.title, payload) }
      fired.add(n.id)
    } catch { /* ignore */ }
  }
  saveFired(fired)
}
