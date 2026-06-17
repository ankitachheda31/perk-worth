// SMS Auto-Scanner: works only inside Capacitor on Android.
// On web, isNativeSmsAvailable() returns false → UI shows fallback CTA.

let pluginCache = null

async function loadPlugin() {
  if (pluginCache !== null) return pluginCache
  if (typeof window === 'undefined' || !window.Capacitor || !window.Capacitor.isNativePlatform?.()) {
    pluginCache = null
    return null
  }
  if (window.Capacitor.getPlatform?.() !== 'android') {
    pluginCache = null
    return null
  }
  try {
    const mod = await import('capacitor-sms-inbox')
    pluginCache = mod.SMSInboxReader || mod.default || null
  } catch (e) {
    pluginCache = null
  }
  return pluginCache
}

export function isNativeSmsAvailable() {
  return typeof window !== 'undefined' && !!window.Capacitor && window.Capacitor.isNativePlatform?.() && window.Capacitor.getPlatform?.() === 'android'
}

export async function checkSmsPermission() {
  const p = await loadPlugin()
  if (!p || !p.checkPermissions) return { granted: false, reason: 'unavailable' }
  try {
    const res = await p.checkPermissions()
    return { granted: res.sms === 'granted' || res === 'granted', raw: res }
  } catch (e) {
    return { granted: false, reason: String(e) }
  }
}

export async function requestSmsPermission() {
  const p = await loadPlugin()
  if (!p) return { granted: false, reason: 'native-only' }
  try {
    const fn = p.requestPermissions || p.requestPermission
    const res = await fn.call(p)
    return { granted: res.sms === 'granted' || res === 'granted', raw: res }
  } catch (e) {
    return { granted: false, reason: String(e) }
  }
}

// Read latest SMS from inbox. Returns [{address, body, date}] (latest first).
export async function readRecentSms({ maxCount = 50, lastDate = 0 } = {}) {
  const p = await loadPlugin()
  if (!p) return []
  try {
    const filter = { maxCount }
    if (lastDate) filter.minDate = lastDate
    const res = await p.getSMSList({ filter })
    return res?.smsList || res?.sms_list || res || []
  } catch (e) {
    return []
  }
}

// Persisted last-scanned timestamp so we only process new messages.
const LAST_SCAN_KEY = 'perk_orbit_last_sms_scan'
export function getLastScanTs() { return Number(localStorage.getItem(LAST_SCAN_KEY) || 0) }
export function setLastScanTs(ts) { localStorage.setItem(LAST_SCAN_KEY, String(ts)) }

// Heuristic: keep only SMS that look like coupons / vouchers / loyalty before
// invoking GPT-4o (saves cost & latency).
const KEYWORDS = [
  'coupon', 'code', 'offer', 'voucher', 'cashback', 'reward', 'discount',
  'flat ', '% off', '₹', 'rs.', 'rs ', 'points', 'redeem', 'expires', 'valid till',
  'membership', 'loyalty', 'tata neu', 'reliance one', 'amazon pay', 'flipkart',
  'myntra', 'swiggy', 'zomato', 'blinkit', 'instamart', 'croma', 'bigbasket',
]
export function isLikelyVoucherSms(body) {
  if (!body || body.length < 12) return false
  const b = body.toLowerCase()
  return KEYWORDS.some(k => b.includes(k))
}
