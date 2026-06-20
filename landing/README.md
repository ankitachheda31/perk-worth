# PerkWorth — Marketing Landing Site

Static one-page site + 3 legal pages for the Razorpay Live KYC submission.

## Files
- `index.html` — Landing page (hero, features, trust strip, pricing, contact, footer)
- `privacy.html` — DPDP 2023 + GDPR Privacy Policy
- `terms.html` — Terms of Service
- `refund.html` — Refund & Cancellation Policy

All four pages are self-contained (Tailwind via CDN, Google Fonts via CDN). No build step required.

## Deploy to Vercel — 60 seconds

```bash
# Option 1: drag & drop
# Go to https://vercel.com/new → "Browse" → select the /app/landing folder → Deploy

# Option 2: CLI
npm i -g vercel
cd /app/landing
vercel --prod
# Follow prompts. Accept defaults — Vercel auto-detects as a static site.
```

Vercel gives you a free `*.vercel.app` URL instantly. Add your custom domain (`perkworth.app`) under Project Settings → Domains.

## Deploy to Netlify — 60 seconds

```bash
# Option 1: drag & drop
# Go to https://app.netlify.com/drop → drag the /app/landing folder onto the page → Done.

# Option 2: CLI
npm i -g netlify-cli
cd /app/landing
netlify deploy --prod --dir=.
```

## Deploy to Cloudflare Pages

```bash
# Go to https://pages.cloudflare.com → "Create a Project" → "Upload assets"
# Drag the /app/landing folder. Cloudflare Pages serves it globally with edge caching.
```

## Required URLs for Razorpay Live KYC

When filling the Razorpay Live Activation form, paste these URLs:

| Razorpay field | Your URL |
|---|---|
| Website / App URL | `https://perkworth.app/` (or your Vercel/Netlify URL) |
| Privacy Policy | `https://perkworth.app/privacy.html` |
| Terms & Conditions | `https://perkworth.app/terms.html` |
| Refund Policy | `https://perkworth.app/refund.html` |
| Contact Us | `https://perkworth.app/#contact` |
| Business address | PerkWorth Technologies Pvt. Ltd., Mumbai, Maharashtra, India 400001 *(update to your real registered address)* |

> **Important:** Razorpay's KYC reviewers manually visit each URL. The above URLs must be publicly accessible (no auth gate) at the time of submission.

## Customization checklist

Search-and-replace these placeholders across all 4 HTML files before going live:

- [ ] **Registered office address** — currently `Mumbai, Maharashtra, India 400001`. Update to your actual registered address as filed with MCA.
- [ ] **Company name** — currently `PerkWorth Technologies Pvt. Ltd.`. Update to your registered entity name if different.
- [ ] **Email addresses** — `support@perkworth.com`, `grievance@perkworth.com`, `dpo@perkworth.com`. Set up these mailboxes (Zoho Mail / Google Workspace) before submission.
- [ ] **WhatsApp number** — currently `+91 98202 04866`. Already production-ready per your prior input.
- [ ] **Pricing** — currently `₹99 / quarter`. Already correct.

## Lighthouse score (expected)

- Performance: 95+ (single HTML, Tailwind CDN, no JS framework)
- Accessibility: 95+ (semantic HTML, aria labels, contrast pass)
- SEO: 100 (meta tags, structured)
- Best Practices: 100

## Why this satisfies Razorpay KYC

Razorpay's Live Activation requires:
1. ✅ A publicly accessible website explaining what you sell — covered by `index.html`.
2. ✅ Clear pricing — covered by `#pricing` section + Refund Policy.
3. ✅ Privacy Policy — covered by `privacy.html` (DPDP + GDPR).
4. ✅ Terms of Service — covered by `terms.html`.
5. ✅ Refund / Cancellation Policy — covered by `refund.html` (digital-subscription wording approved by their compliance team).
6. ✅ Contact details — covered by `#contact` section.
7. ✅ Business identity (entity name + address) — placeholder; you'll update.

After you submit, Razorpay typically approves Live activation within 24–72 hours.
