import React from 'react'
import { Sheet } from '../components/ui'
import { fmtDate } from '../lib/format'

export default function HowToSheet({ voucher, open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="How to redeem" testid="howto-sheet">
      {voucher ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Brand</p>
            <p className="font-display font-bold text-ink-900 text-lg">{voucher.brand}</p>
            <p className="text-sm text-ink-700">{voucher.title}</p>
          </div>
          {voucher.code ? (
            <div>
              <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Code</p>
              <div className="mt-1 inline-block code-box">{voucher.code}</div>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] uppercase tracking-wider font-bold text-ink-500">Steps</p>
            <p className="text-sm text-ink-700 mt-1 leading-relaxed whitespace-pre-line">
              {voucher.how_to_redeem || `1) Open ${voucher.brand} app or website.\n2) Add items to your cart and proceed to checkout.\n3) Apply the code ${voucher.code || ''} under "Promo / Coupon code".\n4) Confirm the discount and complete payment.`}
            </p>
          </div>
          {voucher.expiry ? (
            <p className="text-[11px] text-ink-500">Valid until {fmtDate(voucher.expiry)}</p>
          ) : null}
          <p className="text-[11px] text-ink-500">Tip: All steps happen inside PerkWorth — no redirects to external browsers.</p>
        </div>
      ) : null}
    </Sheet>
  )
}
