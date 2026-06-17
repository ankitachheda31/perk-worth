# Perk Orbit — Product Requirements Document

> Voucher-First Personal Financial Assistant for Indian households. Consolidates fragmented rewards, points, memberships, and coupons in one premium interface.

## Architecture
- **Frontend**: Vite + React 19 (mobile-first PWA), Tailwind, Cabinet Grotesk + Manrope, Capacitor-ready for Android/iOS.
- **Backend**: FastAPI + Motor + MongoDB. GPT-4o vision via `emergentintegrations` (Emergent LLM key).
- **Auth**: Local 4-digit PIN (per-device, stored in `localStorage`). No server-side accounts.

## Personas
- **Saver** — adult Indian household member who collects vouchers from banks, brands, OTT, retail memberships, and SMS promos.
- **Family head** — wants to selectively share specific coupons (not entire wallet) with spouse/kids/siblings.

## Core Requirements (static)
1. Voucher-first home feed with "Ending soon" priority (≤7 days).
2. Smart Search — brand → parent company (Croma → Tata, Myntra → Flipkart…). Also searches user's own coupons by Brand_Name OR Parent_Company.
3. My Coupons with 3 pill tabs: All / Memberships / Vouchers + Add New (Manual / Scan / Paste SMS).
4. AI OCR via GPT-4o for scan, AI parse for pasted SMS.
5. My Points — total balance, approximate ₹ value, breakdown by program with shared flag.
6. Smart Membership Tracker — asset memberships show break-even progress bar (Fees vs Savings); content subscriptions show only renewal date.
7. Family Circle (formerly "Reward Circle") — add family members, share specific coupons with their User_ID, per-member Family Cards page with `Where Shared_With == member.id` filter.
8. Profile/Avatar top-right — Profile, Settings, Membership (₹99 status + Referral link), Family Circle, Lock app.
9. Sticky bottom nav (Home / My Coupons / My Points). Hardware back button respected.
10. ₹99 / 6-month Pro membership — MOCKED Razorpay activation; real keys to be wired later.
11. Full English UI, no emoji icons in branded chrome, premium Swiss-style aesthetic.

## What's been implemented (Jun 17, 2026)
- ✅ PIN lock (set + verify), localStorage persistence
- ✅ Home: smart search w/ user-coupon matches, Pro upsell or Pro status card, Ending Soon list
- ✅ My Coupons: 3-tab filter, voucher tickets with Copy/HowTo/Share/Delete, membership ROI cards
- ✅ My Points: total balance + ₹ value, brand breakdown with is_shared
- ✅ Add Voucher sheet: Manual / Scan (GPT-4o OCR) / Paste SMS (GPT-4o extract)
- ✅ Family Circle: add member with invite token + link, list & remove, tap → Family Cards filtered view
- ✅ Family Cards page: per-member filter `shared_with contains member_id`, per-member unshare
- ✅ Membership: mocked Razorpay activation, referral code, link share
- ✅ Profile + Settings pages, PIN reset
- ✅ Hardware back button + screen back-stack
- ✅ FastAPI endpoints + 18/18 backend pytest tests passing
- ✅ Branding audit: ZERO instances of "Reward Circle" in active codebase (functional rename → "Family Circle")

## Backlog (P1)
- Wire real Razorpay live keys (POST body + signature verification)
- Push/Web notifications for ending-soon alerts (`Bell` icon is currently inert)
- Capacitor build pipeline → publish Android / iOS apps
- Index `vouchers.shared_with` for scale
- Split App.jsx (~1070 lines) into per-screen files (`/screens/*.jsx`)
- SendGrid/Resend email invites for circle members (only invite-link today)

## Backlog (P2)
- Multi-user sync (currently single-device by design)
- WhatsApp share intent for redeemed codes
- Auto-detect missed savings via spend history
- Phone-OTP migration path if multi-device needed

## Test Credentials
See `/app/memory/test_credentials.md`. PIN: `1234`. `user_pin` query param: `1234`.
