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
  // Sanitise prefill so it never *disables* UPI. We explicitly seed an empty
  // `vpa` field so Razorpay's UPI block opens in Collect (typeable) mode and
  // not in Intent/QR mode.
  const mergedPrefill = { ...(prefill || {}) }
  if (mergedPrefill.vpa === undefined) mergedPrefill.vpa = ''
  // Force-strip any prefill keys that could shunt the user to a non-UPI method
  delete mergedPrefill.method

  const options = {
    key: keyId,
    amount,
    currency,
    name: 'PerkWorth',
    description: 'Pro Membership — 6 months',
    order_id: orderId,
    prefill: mergedPrefill,
    theme: { color: '#064E3B' },

    // Top-level method whitelist: which payment families are allowed at all.
    // Setting upi:true ensures UPI is treated as a first-class method by the
    // Razorpay modal (not buried under "Show all options").
    method: {
      upi: true,
      card: true,
      netbanking: true,
      wallet: true,
      paylater: false,
      emi: false,
    },

    // Display blocks: render UPI Collect (VPA input) at the very top, then
    // Card, then a single "Other" block for QR / Intent / Netbanking / Wallet.
    // `show_default_blocks: false` is critical — it stops Razorpay from
    // injecting its own QR-first block above ours.
    config: {
      display: {
        blocks: {
          upi_collect: {
            name: 'Pay using UPI ID (recommended)',
            instruments: [
              { method: 'upi', flows: ['collect'] },
            ],
          },
          card_pay: {
            name: 'Pay using a card',
            instruments: [
              { method: 'card' },
            ],
          },
          other: {
            name: 'Other ways to pay (QR · Netbanking · Wallets)',
            instruments: [
              { method: 'upi', flows: ['intent', 'qr'] },
              { method: 'netbanking' },
              { method: 'wallet' },
            ],
          },
        },
        sequence: ['block.upi_collect', 'block.card_pay', 'block.other'],
        preferences: { show_default_blocks: false },
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
