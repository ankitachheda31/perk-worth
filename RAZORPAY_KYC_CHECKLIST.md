# Razorpay KYC Submission Checklist — PerkWorth

> **STATUS**: Domains live, SSL valid, all policy pages KYC-ready. Submit to Razorpay today.

---

## 1. Pre-Submission: Push the Latest Build

Before submitting, push to GitHub via Emergent's **"Save to GitHub"** button so Vercel rebuilds with these new static pages:

- `/landing.html` — Marketing homepage with hero, features, pricing, contact
- `/privacy.html` — DPDP + GDPR-compliant privacy policy
- `/terms.html` — Full Terms of Service
- `/refund.html` — Refund & Cancellation policy (₹99 quarterly)

After push, wait 60-90 seconds for Vercel to rebuild, then verify:

```bash
curl -I https://perkworth.com/landing.html   # → 200
curl -I https://perkworth.com/privacy.html   # → 200
curl -I https://perkworth.com/terms.html     # → 200
curl -I https://perkworth.com/refund.html    # → 200
```

---

## 2. Open Razorpay Dashboard

1. Log in at https://dashboard.razorpay.com/
2. Top banner / sidebar → **"Account & Settings"** → **"KYC Verification"**
3. Or: https://dashboard.razorpay.com/app/account-settings/kyc

---

## 3. Field-by-Field Submission

### Business Profile

| Razorpay Field | What to Enter |
|---|---|
| **Business Name** | `PerkWorth Technologies Pvt. Ltd.` *(or your registered entity name)* |
| **Business Type** | Private Limited Company *(adjust if sole prop / LLP)* |
| **Business Category** | **Software** → **SaaS / Subscription** |
| **Business Sub-category** | Personal Finance / Productivity |
| **Business Model Description** | *"PerkWorth is a voucher-first personal financial assistant for Indian households. Users consolidate vouchers, loyalty points, and memberships from 200+ Indian brands into one wallet. Free tier with manual entry; ₹99/quarter Pro tier unlocks AI-powered OCR auto-import, SMS voucher auto-scan, voice-to-voucher capture, family circle sharing, ROI break-even tracking for memberships, and AI loyalty optimizer tips. Revenue is purely subscription — we never sell user data and never read bank OTPs."* |

### Website / URLs

| Razorpay Field | URL to Enter |
|---|---|
| **Website URL** | `https://perkworth.com/landing.html` |
| **About Us / Service Description** | `https://perkworth.com/landing.html#features` |
| **Privacy Policy URL** | `https://perkworth.com/privacy.html` |
| **Terms & Conditions URL** | `https://perkworth.com/terms.html` |
| **Refund / Cancellation Policy URL** | `https://perkworth.com/refund.html` |
| **Contact Us URL** | `https://perkworth.com/landing.html#contact` |
| **Pricing URL** | `https://perkworth.com/landing.html#pricing` |
| **Shipping Policy URL** | *N/A — digital service* — leave blank, or enter `https://perkworth.com/refund.html` |

### Contact Information

| Razorpay Field | Value |
|---|---|
| **Support Email** | `support@perkworth.com` *(once Resend DNS is verified)* — interim: your personal email |
| **Support Phone** | Your business phone |
| **Grievance Email** | `grievance@perkworth.com` |
| **Business Address** | Your full registered address with PIN code |

### Bank Account (Razorpay Settlement)

- **Bank Name** + **Account Number** + **IFSC**: the account where you want monthly settlements
- **Account Holder Name**: must exactly match Business Name above
- **Cancelled cheque or bank statement upload**: latest 3-month bank statement (PDF)

### Identity / KYC Documents (upload PDFs / JPGs)

| Document | Required |
|---|---|
| **PAN of Business** | ✅ Mandatory |
| **PAN of Authorised Signatory** | ✅ |
| **Certificate of Incorporation** (Pvt Ltd) | ✅ |
| **GST Certificate** | If GST-registered |
| **Cancelled Cheque** | ✅ (matches settlement bank) |
| **Address Proof of Business** | ✅ (electricity bill / rental agreement / GST cert) |

---

## 4. Pre-Submission QA Checklist

Open each URL in **incognito** and confirm:

- [ ] `/landing.html` loads, hero is visible, "PerkWorth" branding consistent, pricing section shows ₹99/quarter
- [ ] `/privacy.html` opens, scroll-able, mentions DPDP 2023 + GDPR, has last-updated date
- [ ] `/terms.html` opens, full content visible
- [ ] `/refund.html` opens, refund policy clearly stated
- [ ] Contact links (`mailto:support@perkworth.com`, WhatsApp `+91 98202 04866`) clickable
- [ ] Footer shows "© 2026 PerkWorth Technologies Pvt. Ltd." or your entity
- [ ] No "Coming Soon" / "Under Construction" anywhere
- [ ] Mobile view also looks clean (resize browser to 375px width)

---

## 5. After Submission

- Razorpay typically responds within **2-4 business days**
- Most rejections come from: missing refund policy on website (we have it ✅), unclear business description (we cover it ✅), website not loading reliably (we're on Vercel CDN ✅), or business documents mismatch
- If approved → switch from `rzp_test_*` to `rzp_live_*` keys in:
  - `frontend/.env`: `VITE_RAZORPAY_KEY_ID=rzp_live_XXXXXXXX`
  - `backend/.env`: `RAZORPAY_KEY_ID_LIVE=rzp_live_XXXXXXXX` + `RAZORPAY_KEY_SECRET_LIVE=...`
- Remove the "DEV ONLY" bypass button in `frontend/src/screens/MembershipPage.jsx`

---

## Common Razorpay Rejection Reasons & Our Defense

| Reason | Why We're Safe |
|---|---|
| "No clear refund policy" | `/refund.html` explicitly states 7-day refund + cancellation rules |
| "Website doesn't load / parking page" | Vercel + Let's Encrypt SSL, real content live |
| "Mismatch between bank and business name" | You confirm during submission |
| "Subscription products need clear cancellation" | Refund page covers this |
| "Privacy policy missing or generic" | DPDP 2023 + GDPR compliance explicit |
| "Contact info insufficient" | Email + WhatsApp + grievance contact provided |
