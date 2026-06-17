import axios from 'axios'

const BACKEND = import.meta.env.VITE_BACKEND_URL || process.env.REACT_APP_BACKEND_URL
const API = `${BACKEND}/api`

export const api = axios.create({ baseURL: API, timeout: 60000 })

export const Vouchers = {
  list: (pin, category) => api.get('/vouchers', { params: { user_pin: pin, category } }).then(r => r.data),
  endingSoon: (pin, days = 7) => api.get('/vouchers/ending-soon', { params: { user_pin: pin, days } }).then(r => r.data),
  create: (body) => api.post('/vouchers', body).then(r => r.data),
  update: (id, body) => api.patch(`/vouchers/${id}`, body).then(r => r.data),
  remove: (id) => api.delete(`/vouchers/${id}`).then(r => r.data),
}

export const Points = {
  summary: (pin) => api.get('/points/summary', { params: { user_pin: pin } }).then(r => r.data),
}

export const Memberships = {
  roi: (pin) => api.get('/memberships/roi', { params: { user_pin: pin } }).then(r => r.data),
}

export const Extract = {
  sms: (text) => api.post('/extract/sms', { text }).then(r => r.data),
  image: (image_base64) => api.post('/extract/image', { image_base64 }).then(r => r.data),
}

export const Search = {
  brand: (q) => api.get('/search/brand', { params: { q } }).then(r => r.data),
}

export const Circle = {
  list: (pin) => api.get('/circle/members', { params: { user_pin: pin } }).then(r => r.data),
  add: (body) => api.post('/circle/members', body).then(r => r.data),
  remove: (id) => api.delete(`/circle/members/${id}`).then(r => r.data),
  share: (body) => api.post('/circle/share', body).then(r => r.data),
  unshare: (voucher_id, user_pin) => api.post(`/circle/unshare/${voucher_id}`, null, { params: { user_pin } }).then(r => r.data),
}

export const Membership = {
  status: (pin) => api.get('/membership/status', { params: { user_pin: pin } }).then(r => r.data),
  activate: (pin) => api.post('/membership/activate', null, { params: { user_pin: pin } }).then(r => r.data),
}

export default api
