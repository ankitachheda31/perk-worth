import axios from 'axios'

const BACKEND = import.meta.env.VITE_BACKEND_URL || process.env.REACT_APP_BACKEND_URL
const API = `${BACKEND}/api`

export const api = axios.create({ baseURL: API, timeout: 60000, withCredentials: true })

// Attach Bearer token from localStorage if present (mobile WebView cookie fallback)
api.interceptors.request.use((config) => {
  const t = localStorage.getItem('perk_orbit_token')
  if (t) config.headers.Authorization = `Bearer ${t}`
  return config
})

export const Auth = {
  signup: (body) => api.post('/auth/signup', body).then(r => r.data),
  login: (body) => api.post('/auth/login', body).then(r => r.data),
  me: () => api.get('/auth/me').then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  claimPin: (pin) => api.post('/auth/claim-pin', { pin }).then(r => r.data),
  wipe: () => api.post('/auth/wipe').then(r => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then(r => r.data),
  resetPassword: (token, new_password) => api.post('/auth/reset-password', { token, new_password }).then(r => r.data),
  // DPDP §13 / GDPR Art.15+20 self-service export → triggers a file download.
  exportData: async (format = 'json') => {
    const r = await api.get('/user/export', { params: { format }, responseType: 'blob' })
    const blob = new Blob([r.data], { type: format === 'json' ? 'application/json' : 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.download = `perk-worth-export-${ts}.${format}`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  },
}

export const Intelligence = {
  programs: (limit = 50) => api.get('/intelligence/programs', { params: { limit } }).then(r => r.data),
  runNow: () => api.post('/intelligence/run-now').then(r => r.data),
}

export const Vouchers = {
  list: (pin, category, status) => api.get('/vouchers', { params: { user_pin: pin, category, status } }).then(r => r.data),
  endingSoon: (pin, days = 7) => api.get('/vouchers/ending-soon', { params: { user_pin: pin, days } }).then(r => r.data),
  create: (body) => api.post('/vouchers', body).then(r => r.data),
  update: (id, body) => api.patch(`/vouchers/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/vouchers/${id}`).then(r => r.data),
  redeem: (id, savings_realized) => api.post(`/vouchers/${id}/redeem`, savings_realized != null ? { savings_realized } : {}).then(r => r.data),
  unredeem: (id) => api.post(`/vouchers/${id}/unredeem`).then(r => r.data),
  savingsStats: (pin) => api.get('/vouchers/savings-stats', { params: { user_pin: pin } }).then(r => r.data),
}

export const Points = {
  summary: (pin) => api.get('/points/summary', { params: { user_pin: pin } }).then(r => r.data),
}

export const Memberships = {
  roi: (pin) => api.get('/memberships/roi', { params: { user_pin: pin } }).then(r => r.data),
  logSpend: (id, body) => api.post(`/memberships/${id}/log-spend`, body).then(r => r.data),
}

export const Extract = {
  sms: (text) => api.post('/extract/sms', { text }).then(r => r.data),
  image: (image_base64) => api.post('/extract/image', { image_base64 }).then(r => r.data),
}

export const Search = {
  brand: (q, user_pin) => api.get('/search/brand', { params: { q, user_pin } }).then(r => r.data),
}

export const Loyalty = {
  programs: () => api.get('/loyalty/programs').then(r => r.data),
  classify: (brand) => api.get('/loyalty/classify', { params: { brand } }).then(r => r.data),
}

export const Admin = {
  stats: () => api.get('/admin/registry/stats').then(r => r.data),
  dashboardStats: () => api.get('/admin/dashboard/stats').then(r => r.data),
  pending: (status = 'pending') => api.get('/admin/registry/pending', { params: { status } }).then(r => r.data),
  changelog: () => api.get('/admin/registry/changelog').then(r => r.data),
  runs: () => api.get('/admin/registry/runs').then(r => r.data),
  approve: (id, note) => api.post(`/admin/registry/pending/${id}/approve`, { note }).then(r => r.data),
  reject: (id, note) => api.post(`/admin/registry/pending/${id}/reject`, { note }).then(r => r.data),
  bulkApprove: (ids, note) => api.post('/admin/registry/pending/bulk-approve', { ids, note }).then(r => r.data),
  bulkReject: (ids, note) => api.post('/admin/registry/pending/bulk-reject', { ids, note }).then(r => r.data),
  runNow: () => api.post('/admin/registry/run-now').then(r => r.data),
}

export const Circle = {
  list: (pin) => api.get('/circle/members', { params: { user_pin: pin } }).then(r => r.data),
  add: (body) => api.post('/circle/members', body).then(r => r.data),
  remove: (id) => api.delete(`/circle/members/${id}`).then(r => r.data),
  share: (body) => api.post('/circle/share', body).then(r => r.data),
  unshare: (voucher_id, user_pin, family_member_id) => api.post(`/circle/unshare/${voucher_id}`, null, { params: { user_pin, family_member_id } }).then(r => r.data),
  sharedWith: (pin, member_id) => api.get('/vouchers/shared-with', { params: { user_pin: pin, member_id } }).then(r => r.data),
}

export const Membership = {
  status: (pin) => api.get('/membership/status', { params: { user_pin: pin } }).then(r => r.data),
  activate: (pin) => api.post('/membership/activate', null, { params: { user_pin: pin } }).then(r => r.data),
  // Real Razorpay flow
  createOrder: (pin, amount_inr = 99) => api.post('/payments/order', { user_pin: pin, amount_inr }).then(r => r.data),
  verifyPayment: (body) => api.post('/payments/verify', body).then(r => r.data),
}

export const Notifications = {
  list: (pin) => api.get('/notifications', { params: { user_pin: pin } }).then(r => r.data),
  markRead: (id) => api.post(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: (pin) => api.post('/notifications/read-all', null, { params: { user_pin: pin } }).then(r => r.data),
  remove: (id) => api.delete(`/notifications/${id}`).then(r => r.data),
}

export const Support = {
  log: (body) => api.post('/support/log', body).then(r => r.data),
  history: (pin) => api.get('/support/history', { params: { user_pin: pin } }).then(r => r.data),
}

export const Referrals = {
  preview: (code) => api.get('/referrals/preview', { params: { code } }).then(r => r.data),
  stats: (pin) => api.get('/referrals/stats', { params: { user_pin: pin } }).then(r => r.data),
}

export const Optimizer = {
  tips: (pin) => api.get('/optimizer/tips', { params: { user_pin: pin } }).then(r => r.data),
}

export const Cards = {
  list: () => api.get('/cards').then(r => r.data),
  best: (category, monthly_spend_inr = 10000, limit = 3, current_card_id = null) =>
    api.get('/cards/best', {
      params: { category, monthly_spend_inr, limit, current_card_id: current_card_id || undefined },
    }).then(r => r.data),
  logClick: (body) => api.post('/cards/click', body).then(r => r.data).catch(() => null),
}

export const Spend = {
  infer: (sms_text, user_pin, persist = true) =>
    api.post('/spend/infer', { sms_text, user_pin, persist }).then(r => r.data),
  profile: (pin) => api.get('/spend/profile', { params: { user_pin: pin } }).then(r => r.data).catch(() => ({ exists: false })),
  clear: (pin) => api.delete('/spend/profile', { params: { user_pin: pin } }).then(r => r.data),
}

export default api
