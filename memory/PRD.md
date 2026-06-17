# Perk Orbit — Product Requirements Document

> Voucher-First Personal Financial Assistant for Indian households. Consolidates fragmented rewards, points, memberships, and coupons in one premium interface.

## Architecture
- **Frontend**: Vite + React 19 (mobile-first PWA), Tailwind, Cabinet Grotesk + Manrope, Capacitor-ready for Android/iOS.
- **Backend**: FastAPI + Motor + MongoDB. GPT-4o vision via `emergentintegrations` (Emergent LLM key).
- **Auth**: Local 4-digit PIN (per-device, stored in `localStorage`). No server-side accounts.

## Personas
- **Saver** — adult Indian household member collecting vouchers from banks, brands, OTT, retail memberships, and SMS promos.
- **Family head** — wants to selectively share specific coupons (not the entire wallet) with spouse/kids/siblings.

## Core Requirements (static)
1. Voucher-first home with "Ending soon" countdown (≤7 days, "N days left" badge).
2. Smart Search — brand → parent company (Croma → Tata, Myntra → Flipkart…). Also searches user's own vouchers by Brand_Name OR Parent_Company.
3. My Coupons with 3 pill tabs: All / Memberships / Vouchers + Add New (Manual / Scan / Paste SMS).
4. AI OCR via GPT-4o for scan; AI parse for pasted SMS — both via Emergent LLM key.
5. My Points — total balance, approximate ₹ value, per-brand breakdown with is_shared flag.
6. Smart Membership Tracker — Asset memberships show break-even progress bar; Content subscriptions show only renewal date + "ROI tracking not applicable".
7. Family Circle (top-level bottom-nav tab): add family members, share specific coupons by member User_ID; per-member Family Cards page filtered by `Where Shared_With == member.id`.
8. Profile avatar top-right → Profile, Settings, Membership (₹99) + Referral Link, Family Circle, Lock app.
9. **Persistent 4-tab sticky bottom nav: Home / My Coupons / My Points / Circle.**
10. ₹99 / 6-month Pro membership — MOCKED Razorpay activation; real keys to be wired later.
11. Full English UI; premium Swiss-style aesthetic (emerald + matte gold + paper grain).

## Iteration log
- **Jun 17, 2026 — MVP delivered.**
  - PIN lock (set + verify), localStorage persistence
  - Home with smart search w/ user-coupon matches, Pro upsell or Pro status card, Ending Soon list with countdown
  - My Coupons: 3-tab filter, voucher tickets with Copy/HowTo/Share/Delete, membership ROI cards
  - My Points: total balance + ₹ value, brand breakdown with is_shared
  - Add Voucher sheet: Manual / Scan (GPT-4o OCR) / Paste SMS (GPT-4o extract)
  - Family Circle: add member with invite token + link, list & remove
  - Family Cards page: per-member filter `shared_with contains member_id`, per-member unshare
  - Membership: mocked Razorpay activation, referral code, link share
  - Profile + Settings pages, PIN reset
  - Hardware back button + screen back-stack

- **Jun 17, 2026 — Schema update.**
  - `Rewards_And_Coupons.Shared_With` now User_ID array (was names)
  - `/api/circle/share` accepts `family_member_id`; partial `/api/circle/unshare?family_member_id=…`
  - New `/api/vouchers/shared-with` (Family Cards filtered query)
  - Smart search now also returns `user_matches[]` (user's own vouchers)
  - Points breakdown now includes `program_name`, `points_balance`, `current_cash_value`, `is_shared`

- **Jun 17, 2026 — Branding audit.**
  - "Reward Circle" → "Family Circle" everywhere (functional name; "Perk Orbit" is the app name)
  - Pydantic models renamed: `RewardCircleMember/Add` → `FamilyCircleMember/Add`
  - Design-guideline JSON key renamed: `reward_circle` → `family_circle`
  - Mongo collections were already neutral (`circle_members`); no schema rename needed

- **Jun 17, 2026 — Final sign-off pass.**
  - Circle promoted to top-level 4th tab in BottomNav
  - 18/18 backend tests PASS, 14/14 frontend checklist PASS, zero issues

## Backlog (P1)
- Wire real Razorpay live keys (POST body + signature verification)
- In-app notification center for ending-soon vouchers (Bell icon is wired in chrome but currently inert)
- Capacitor `cap add android && cap add ios` + native build pipeline (Android Studio / Xcode required locally — preview env can't produce binaries)
- Split `App.jsx` (~1090 lines) into `/screens/*` and `/sheets/*` files
- `db.vouchers.create_index([('user_pin', 1), ('shared_with', 1)])` for scale

## Backlog (P2)
- Multi-user sync (currently single-device by design)
- WhatsApp share intent for codes; "Share my savings card" auto-generated image
- Auto-detect missed savings via spend history
- Phone-OTP migration path if multi-device needed
- SendGrid/Resend email invites (only invite-link today)
- /api/circle/unshare additional membership validation; close in-flight sheets on Lock

## Test Credentials
See `/app/memory/test_credentials.md`. PIN: `1234`. `user_pin` query param: `1234`.
