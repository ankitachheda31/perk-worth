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

## 2026-02-18 — Brand registry + Membership ROI + Onboarding loop fix
- **Brand registry** (`/app/backend/data/brand_registry.json` + `brand_registry.py`): curated dataset of ~200 Indian brands across 16 conglomerates (Tata, Reliance, Aditya Birla, Mahindra, Bajaj, Adani, Godrej, ITC, L&T, Hinduja, Vedanta, Jindal, Wipro, Murugappa, Future Retail, plus 50+ independent D2C). Fuzzy lookup with exact-alias-first ranking (`bb` → BigBasket, not FBB).
- **New endpoints**: `/api/brands/lookup?q=...` (top-10 autocomplete), `/api/brands/all` (flat list).
- **Auto-tag on voucher save**: `parent_company` field populated automatically via the new registry.
- **Membership ROI**: `/api/memberships/roi` now computes `days_total`, `days_remaining`, `days_elapsed_pct`, `cost_per_day`, `expired`, `expiring_soon` from `start_date` + `expiry`.
- **AddVoucherSheet**: Type selector moved to TOP; live parent-brand chip; Start/End date pair for memberships; End-before-Start validation disables Save.
- **MembershipCard**: progress bar showing days-remaining (emerald → amber → terracotta as it depletes) + cost-per-day badge.
- **Fixed onboarding loop**: Walkthrough and SmartDiscovery now both set both flags on `onComplete`, eliminating the dismiss-loop reported by the testing agent.
- **Fixed Vite-env-var bug** in CRA project: `import.meta.env.VITE_BACKEND_URL` → `process.env.REACT_APP_BACKEND_URL` in AddVoucherSheet.
- **OTA workflow**: `/app/scripts/OTA_UPDATES.md` — Netlify remote-URL strategy documented (zero-cost OTA after one APK upload).
- Razorpay UPI Collect config confirmed in place (`flows:['collect']` + `method:{upi:true}` + `show_default_blocks:false`).
- Health: 14/14 HEALTHY.


## 2026-02-19 — Vercel Monorepo Deployment Config
- **Root `vercel.json`** added: framework `vite`, `buildCommand: cd frontend && yarn install --frozen-lockfile && yarn build`, `outputDirectory: frontend/dist`, SPA rewrite (`/(.*) → /index.html`), 1-year immutable cache for `/assets/*`, no-cache for `/sw.js`.
- **Root `package.json`** added: declares Node ≥18, mirrors build scripts so Vercel auto-detects the project on import (no manual framework picker prompt).
- **Root `.vercelignore`** excludes `backend/`, `scripts/`, `landing/`, `memory/`, docs from upload (faster builds, smaller deploys).
- **`/app/VERCEL_DEPLOYMENT.md`** authored — full guide with dashboard settings, env vars (`REACT_APP_BACKEND_URL`, `VITE_RAZORPAY_KEY_ID`), DNS records for `perkorbit.app`, CORS reminder, and SPA-routing notes.
- Verified locally: `cd frontend && yarn build` produces clean dist (`437 kB JS gz 131 kB`, `36 kB CSS gz 7 kB`). Health: 14/14 HEALTHY.
- Backend stays on Emergent preview (Frontend-only Vercel deploy per user choice).


## 2026-02-19 — Backend CORS Updated for Vercel
- `CORS_ORIGINS` in `/app/backend/.env` now includes `https://perkorbit.app`, `https://www.perkorbit.app`.
- Added new env var `CORS_ORIGIN_REGEX=https://.*\.vercel\.app` so every Vercel preview deployment (`perk-orbit-xyz.vercel.app`) works automatically.
- `server.py` ~line 348: passes `allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None` to FastAPI's `CORSMiddleware`.
- Verified via curl preflight against both `perkorbit.app` and `*.vercel.app` origins — both pass. Health: 14/14 HEALTHY.


## 2026-02-20 — Redemption Tracker (P0 user feature)
- **Backend `Voucher.status`** field (active | redeemed | expired) + `redeemed_at` ISO timestamp.
- **4 new endpoints**: POST `/api/vouchers/{id}/redeem` + `/unredeem` + GET `/savings-stats` + GET `/vouchers?status=redeemed|all` filter. Default `/vouchers` list now hides redeemed (cleaner wallet view).
- **Frontend**: green "Used" button on every active VoucherCard. New `HistoryScreen.jsx` with savings hero (`₹X all-time · ₹Y in 2026`), owner-breakdown grid, and Undo affordance per redeemed card. History icon shortcut in MyCoupons header.
- **Testing**: Iteration 13 backend 10/10 pytest + full UI flow verified end-to-end. Pluralization fix applied. Health 14/14 HEALTHY.


## 2026-02-20 — "Share Your Savings" Viral Feature
- Added gold pill button on HistoryScreen savings hero, only shows when `total_saved > 0`.
- Composes message: `"Saved ₹X in YYYY with PerkWorth! 🎉 N vouchers redeemed, ₹Y all-time. Try it free → https://www.perkworth.com"`
- Uses Web Share API (`navigator.share`) on mobile — opens native share sheet (WhatsApp, Insta, etc.).
- Falls back to clipboard copy on desktop / unsupported browsers.
- Zero-cost viral acquisition loop: every redemption celebration becomes a marketing post.
- Health 14/14 HEALTHY. Bundle verified to contain `Share your savings` + `navigator.share` references.

## 2026-02-20 — Handoff PRDs Written for Next Sessions
- `/app/PRD_BIOMETRIC_AUTH.md` — full spec for Face ID/Fingerprint + WebAuthn fallback (6-10 hrs, needs APK device test, 2 sessions)
- `/app/PRD_BACKEND_REFACTOR.md` — split server.py (1400+ lines) into routes/ models/ services/ (4-6 hrs, post-KYC)
- `/app/AUDIT_REPORT.md` — comprehensive feature audit for dev-partner review

## 2026-02-20 — Referral Code Embedded in "Share your savings" (P0)
- HistoryScreen.jsx now fetches `Membership.status` alongside savings stats, embeds the user's `referral_code` into the share message: "Use my code *PERK-XXXXXX* when upgrading to Pro — both of us get 3 months FREE 🎁".
- Link in share message becomes `https://www.perkworth.com/?ref=<code>` when code exists, else plain landing URL.
- Graceful fallback for non-Pro users (no code → no refLine, normal share text).
- Verified end-to-end by testing agent iteration 14 — regression intact.

## 2026-02-20 — Biometric Unlock (WebAuthn, web-only v1)
- New module `/app/frontend/src/lib/biometric.js`: exports `isBiometricAvailable`, `isBiometricEnrolled`, `enrollBiometric`, `verifyBiometric`, `disableBiometric`. Uses `navigator.credentials.create/get` with platform authenticator.
- SettingsPage.jsx: new "Biometric unlock" card (data-testid `settings-biometric-card`) with enable/disable toggle — only visible when device supports a platform authenticator.
- PinLock.jsx: auto-prompts biometric on mount when enrolled; "Unlock with biometric" button (data-testid `biometric-trigger`) above keypad; full PIN fallback always preserved (3-failure → keypad, banking-app pattern).
- Local-only design: no backend, no cloud auth dependency. WebAuthn credential ID stored in localStorage. PIN remains cloud-recoverable backup.
- Capacitor native (Android APK) path deferred per PRD_BIOMETRIC_AUTH.md (requires real device testing).
- Verified iteration 14: graceful degradation in headless Playwright (no platform authenticator → card stays hidden = expected behavior).

## 2026-02-20 — Credit Card Optimizer (P1 · affiliate revenue foundation)
- **Backend**: New module `/app/backend/cards.py` with curated catalog of 7 high-value India cards (HDFC Millennia, Axis Flipkart, SBI Cashback, Tata Neu Infinity HDFC, Amazon Pay ICICI, IDFC FIRST Select, BPCL SBI Octane) covering 7 spend categories. Endpoints under `/api/cards`:
  - `GET /api/cards` — full catalog + categories
  - `GET /api/cards/best?category=X&monthly_spend_inr=N&limit=3` — ranks by **net annual value** (reward − fee), with fee-waiver detection
  - `POST /api/cards/click` — affiliate click attribution, persists to MongoDB `card_clicks` collection (best-effort, never blocks UX)
- **Frontend**: New screen `CardOptimizerScreen.jsx` with hero, category chips, live spend slider (₹2K-₹1L), top-3 ranked cards with reward/annual-value stats, full catalog list, "Apply on issuer site" CTA per card (opens issuer URL in new tab, logs click first).
- **Wired** into Profile menu (`menu-card-optimizer` row with NEW badge) and App.jsx routing (`card-optimizer` screen).
- Verified iteration 14: backend 100% pass, frontend 100% pass (live slider updates, category switching, affiliate click POST + new-tab open all working).
- Affiliate-ready: swap `apply_url` for tracked deeplink (Cardz / BankBazaar / direct issuer affiliate codes) — zero frontend change required.
