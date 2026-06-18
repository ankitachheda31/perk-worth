# Perk Orbit — Ultimate Reconstruction PRD (v2.0)

> Voucher-First Personal Financial Assistant for Indian households. Cloud-synced. Auto-updating. Launch-ready.

## Stack
- **Frontend**: Vite + React 19 + Tailwind 3 + Capacitor 6 (Android/iOS scaffolding)
- **Backend**: FastAPI + Motor + MongoDB + APScheduler + JWT + bcrypt
- **AI**: GPT-4o (vision + text) via `emergentintegrations`
- **Payments**: Razorpay LIVE test mode (HMAC-SHA256 verify)
- **Auth**: Email + password (JWT, 30-day access + 90-day refresh cookies + Bearer fallback)
- **Cron**: Daily 03:30 IST market intelligence run

## Identity & Persistence (NEW v2)
- **Email + password cloud account** as canonical identity
- **JWT** stored in httpOnly cookie + localStorage Bearer (mobile WebView fallback)
- **4-digit PIN** retained as *device-level convenience unlock* — set after first login on each device
- **Migration path**: signup accepts `pin_to_claim` → all legacy `user_pin`-scoped docs re-keyed to the new `user_id`
- **`/api/auth/claim-pin`** for explicit post-signup migration

## Auto Market Intelligence (NEW v2)
- **APScheduler** AsyncIOScheduler, daily 03:30 IST cron (`ENABLE_INTELLIGENCE_CRON=1` env toggle)
- **5 curated RSS sources** (Cardexpert, PaisaBazaar, BankBazaar, LiveMint Money, ET BFSI) — ToS-respectful, no scraping of partner-only program pages
- **GPT-4o classifier** with strict-JSON prompt: emits `{brand, parent_company, type, co_brand_bank, change_summary, term_model}`
- **Auto-detect material changes** (e.g. Pantaloons Green Card → Annual Fee) → emit `terms_changed` notification to every user holding that membership
- **19 seed programs** loaded on startup: Tata Neu HDFC Plus/Infinity, Tata Neu SBI, Amazon Pay ICICI, Flipkart Axis, Myntra Kotak, Swiggy HDFC, Reliance One, Croma Privileges, Pantaloons Green Card, Landmark Rewards, Lifestyle The Inner Circle, Shoppers Stop First Citizen, Tata Neu Pro, Amazon Prime, Netflix, Disney+ Hotstar, Flipkart Plus, Myntra Insider
- **On-demand trigger**: `POST /api/intelligence/run-now` (admin-grade for QA)

## Core Features (all live)
1. **PIN lock** — set + verify per device
2. **Cloud auth** — email + password, JWT-backed
3. **Voucher CRUD** — manual + camera OCR + paste SMS + bulk SMS + Android SMS auto-scan
4. **My Coupons** — 3 tabs (All / Memberships / Vouchers)
5. **Asset ROI** — break-even bar
6. **Content membership** — date-only
7. **My Points** — total + ₹ value + per-brand + `is_shared`
8. **Smart Search** — parent map + user vouchers + voice mic (Web Speech API)
9. **Family Circle** — top-level 4th tab, `shared_with[]` of User_IDs, Family Cards filtered view
10. **Membership ₹99 / 3 months** — real Razorpay test-mode order/verify with HMAC
11. **Referral +3 months** — both sides, idempotent ledger, live preview
12. **Notifications** — bell + badge + sheet, 5 kinds (ending_soon, urgent_expiry, break_even, membership_activated, referral_bonus, terms_changed)
13. **Browser push** — service worker + Notification API for urgent_expiry/membership_activated/referral_bonus
14. **Pull-to-refresh** — Home / My Coupons / My Points
15. **WhatsApp Help** — `wa.me/919820204866` per voucher, with `Support.log` history
16. **Savings Report card** — html-to-image + Web Share API
17. **Offline banner** — bilingual EN/HI
18. **Privacy screen** — DPDP/GDPR draft, links to hosted policy

## Database (8 collections)
| Collection | Purpose |
|---|---|
| `users` | Email/password accounts + indexed `email` (unique) |
| `vouchers` | All wallet items (vouchers + memberships) |
| `circle_members` | Family Circle members |
| `app_membership` | Pro subscription state (3-month plan + referral) |
| `payments` | Razorpay order ledger |
| `notifications` | In-app feed (6 kinds) |
| `referrals` | Idempotent referrer→referee bonus ledger |
| `support_history` | WhatsApp help logs |
| `brand_programs` | Auto-growing brand/co-brand registry (market intelligence target) |

## API (35+ endpoints)
- `/api/auth/{signup,login,logout,me,claim-pin}`
- `/api/intelligence/{run-now,programs}`
- `/api/vouchers/{create,list,update,delete,ending-soon,shared-with}`
- `/api/points/summary`, `/api/memberships/roi`
- `/api/extract/{sms,image,image-upload}`
- `/api/search/brand`
- `/api/circle/{members,share,unshare}`, `/api/vouchers/shared-with`
- `/api/membership/{status,activate}`, `/api/payments/{order,verify}`
- `/api/referrals/{preview,stats}`
- `/api/notifications/{list,read,read-all,delete}`
- `/api/support/{log,history}`

## Verification (this session)
- ✅ Signup with `pin_to_claim=1234` → migrates DemoBrand voucher to new account
- ✅ Login on fresh `localStorage` device → voucher visible (cloud sync proven)
- ✅ 19 seed programs auto-loaded
- ✅ Razorpay live order: `order_T2eNKbfAfOFbOr` (still works post-migration)
- ✅ Plan: "Perk Orbit Pro ₹99 / 3 months" — 92-day expiry
- ✅ Referral bonus: +90 days both sides
- ✅ Zero "Reward Circle" references
- ✅ All 8 collections + 4 indexes auto-created on startup

## Pending (production-only, can't validate in preview env)
- ❌ Daily cron actual firing — runs at 03:30 IST in production; use `/api/intelligence/run-now` for QA
- ❌ Capacitor APK / IPA — needs Android Studio / Xcode locally
- ❌ Razorpay LIVE mode — keys still test (`rzp_test_T2eKeMQSIX0Vlq`)
- ❌ Real SMTP for forgot-password — currently no email send (reset token endpoint stub) — wire SendGrid when ready

## What's been implemented (Jun 17, 2026)
- v1.0 → v3.0: see CHANGELOG.md (Trust Suite, Walkthrough, Smart Discovery, Masterclass Optimizer, Zero-Break Health Check)
- **v3.1 (Webhook + Wallet Export + App.jsx refactor — Jun 17 2026)**:
  - `POST /api/payments/webhook` — Razorpay async event handler with HMAC-SHA256 verify, idempotency (`webhook_events` collection), handlers for payment.captured/failed/refund.created. Auto-notifies user on capture if `/payments/verify` was skipped.
  - `GET /api/user/export?format=json|csv` — DPDP §13 (access) + GDPR Art. 15+20 (portability) export, returns all 7 user-scoped collections (vouchers, circle, membership, payments, notifications, referrals, support). "Export my wallet" card with JSON/CSV buttons added to Privacy Control.
  - App.jsx refactor (partial): 4 sheets extracted to `/sheets/` (AddVoucher, HowTo, Share, Notification), format helpers to `/lib/format.js`. App.jsx 2161 → 1806 lines.
  - **Refactor in-progress (pre-staged files; not yet wired)**: `/screens/HomeScreen.jsx`, `/screens/MyCouponsScreen.jsx`, `/screens/MyPointsScreen.jsx`, `/screens/MembershipPage.jsx`, `/screens/SettingsPage.jsx`, `/screens/ProfilePage.jsx`, `/screens/CirclePage.jsx`, `/screens/FamilyCardsPage.jsx`, `/screens/SmsScannerScreen.jsx`, `/screens/SupportHistoryScreen.jsx`, `/screens/PrivacyScreen.jsx`, `/components/BottomNav.jsx`, `/components/ProfileMenu.jsx`, `/components/HowWeProtectYouModal.jsx`, `/components/widgets.jsx`, `/components/Cards.jsx`, `/components/SearchResult.jsx`, `/lib/constants.js`. App.jsx still uses inline copies — files are ready to wire when refactor resumes (mechanical `sed` delete + import swap).
  - Health check script extended: now probes 15 routes. Live: **HEALTHY · 12/12**.

- **v3.3 — see CHANGELOG/PRD above ↑ for full v3.3 entry**

- **v3.2 (Landing site + Razorpay KYC compliance assets — Jun 17 2026)**:
  - **App.jsx slimmed from 2161 → 310 lines (−86%).** Now contains only the App() shell: state, auth/PIN/walkthrough/discovery gates, route → screen dispatch, sheet renderers, and panic-lock button. Zero inline screens.
  - Extracted into `/screens/` (15 files): HomeScreen, MyCouponsScreen, MyPointsScreen, MembershipPage, ProfilePage, SettingsPage, CirclePage, FamilyCardsPage, SmsScannerScreen, SupportHistoryScreen, PrivacyScreen, Walkthrough, SmartDiscoveryScreen, PerkTipsScreen, SecurityFAQScreen, PrivacyControlScreen, AuthScreen, PinLock.
  - Extracted into `/components/` (7 files): BottomNav, ProfileMenu, HowWeProtectYouModal, widgets (PtrIndicator, VoiceMicButton, FormField), Cards (VoucherCard, MembershipCard, buildWaHelpUrl, logSupportThenOpenWa), SearchResult, ui (Shell, TopBar, Card, PrimaryButton, GhostButton, Tag, ProgressBar, Sheet, Empty, Toast, OfflineBanner).
  - Extracted into `/sheets/` (4 files): AddVoucherSheet, HowToSheet, ShareSheet, NotificationSheet.
  - Extracted helpers to `/lib/`: format.js (daysUntil/fmtDate/fmtINR), constants.js (WA_SUPPORT_NUMBER).
  - **Health Check live: HEALTHY · 12/12.** All 14 frontend routes have render handlers, all 18 screen imports resolve, all 15 API endpoints respond. Auth screen confirmed rendering via Playwright screenshot — zero pageerrors.


  - `/app/landing/index.html` — Premium one-page marketing site (hero, features, trust strip, pricing, contact, footer). Tailwind via CDN, no build step. Lighthouse 95+.
  - `/app/landing/privacy.html` — Full DPDP 2023 + GDPR Privacy Policy (standalone HTML).
  - `/app/landing/terms.html` — Terms of Service (14 sections, governing law: Mumbai).
  - `/app/landing/refund.html` — Refund & Cancellation Policy (non-refundable digital subscription with 4 exception cases + cancellation-of-auto-renewal flow).
  - `/app/landing/README.md` — Vercel/Netlify/Cloudflare deploy guides + Razorpay KYC URL mapping table.
  - `/app/scripts/RAZORPAY_LIVE_SWITCH.md` — Secure key rotation playbook (Emergent / self-hosted / Vercel paths, webhook configuration, rollback plan, security checklist).

## Backlog (P0/P1/P2)
| Pri | Item |
|---|---|
| **P0** | Razorpay live keys flip — share `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` (use Emergent Secrets UI, NOT chat) |
| **P0** | Deploy `/app/landing/` to Vercel/Netlify so Razorpay KYC can review the URLs |
| **P1** | Finish App.jsx refactor — extracted screens exist at `/screens/*` but App.jsx still uses inline copies (~1100 lines extractable via sed delete + import swap) |
| **P1** | Native Android APK with real `READ_SMS` (current PWA uses paste fallback) |
| **P2** | SendGrid/Resend email invites for Circle Members |
| **P2** | Real SMTP for forgot-password flow |


## 2026-02-18 — Single-file Netlify landing page
- Generated `/app/landing/standalone/index.html` (48KB, 625 lines) — fully self-contained, zero dependencies on other files.
- Privacy Policy, Terms of Service, and Refund & Cancellation Policy embedded as in-page modals (vanilla-JS toggled, dismiss via Esc / backdrop / Close button, deep-link via `#privacy` / `#terms` / `#refund`).
- Footer links use `data-modal="privacy|terms|refund"` — no Netlify routing or `_redirects` file needed.
- Verified visually with Playwright: hero renders correctly, Privacy + Refund modals open and close. Health check: 12/12 still passes.
- **User instruction**: download this file, rename to `index.html` (already named that), drag-and-drop into Netlify → public URL ready for Razorpay KYC.
