// Razorpay checkout helper — loads checkout.js on demand
let scriptPromise = null

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.async = true
    s.onload = () => resolve(window.Razorpay)
    s.onerror = () => { scriptPromise = null; reject(new Error('Razorpay script failed to load')) }
    document.body.appendChild(s)
  })
  return scriptPromise
}

export async function openRazorpayCheckout({ keyId, orderId, amount, currency, userName, prefill, onSuccess, onDismiss, onFailure }) {
  const Razorpay = await loadRazorpay()
  // Inject an empty `vpa` field into prefill so Razorpay's UPI block shows the
  // "Enter UPI ID" Collect input by default (instead of jumping to QR/Intent).
  const mergedPrefill = { ...(prefill || {}) }
  if (mergedPrefill.vpa === undefined) mergedPrefill.vpa = ''
  const options = {
    key: keyId,
    amount,
    currency,
    name: 'Perk Orbit',
    description: 'Pro Membership — 6 months',
    order_id: orderId,
    prefill: mergedPrefill,
    theme: { color: '#064E3B' },
    // Force a custom block order so the "Enter UPI ID" field (UPI Collect) is
    // always visible at the top, then Card, then a fallback "Other" block that
    // surfaces QR / Netbanking / Wallets. show_default_blocks:true ensures any
    // method we missed (e.g. EMI, Pay Later) still appears further down rather
    // than being silently hidden.
    config: {
      display: {
        blocks: {
          upi_collect: {
            name: 'Pay using UPI ID',
            instruments: [
              { method: 'upi', flows: ['collect'] },
            ],
          },
          card_pay: {
            name: 'Pay using a card (domestic)',
            instruments: [
              { method: 'card' },
            ],
          },
          other: {
            name: 'Other ways to pay',
            instruments: [
              { method: 'upi', flows: ['intent', 'qr'] },
              { method: 'netbanking' },
              { method: 'wallet' },
            ],
          },
        },
        sequence: ['block.upi_collect', 'block.card_pay', 'block.other'],
        preferences: { show_default_blocks: true },
      },
    },
    modal: {
      ondismiss: () => { onDismiss && onDismiss() },
    },
    handler: (resp) => onSuccess && onSuccess(resp),
  }
  const rzp = new Razorpay(options)
  rzp.on('payment.failed', (resp) => onFailure && onFailure(resp))
  rzp.open()
  return rzp
}
