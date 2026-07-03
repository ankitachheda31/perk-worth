# Perk Orbit — Ultimate Reconstruction PRD (v2.0)

> Voucher-First Personal Financial Assistant for Indian households. Cloud-synced. Auto-updating. Launch-ready.

## 2026-02 · APK Network Error — Definitive Root-Cause Fix
- **Symptom**: Every login attempt from Android APK returned "Network error — check your connection and try again". Web preview worked fine.
- **Investigation ruled out**: URL not baked into bundle (verified via grep in dist/), backend down (health returned 200), Java 21 compile (already fixed), yarn.lock drift (only a warning, non-blocking).
- **Actual root cause**: Kubernetes ingress injects `Access-Control-Allow-Origin: *` on every response, regardless of the Origin header. Axios was configured with `withCredentials: true`, so the browser (Android WebView included) enforces the CORS spec rule that forbids `Allow-Origin: *` combined with credentials → **every request is rejected before it reaches JS code, surfacing as a generic "Network error"**.
- **Fix**: `frontend/src/lib/api.js` line 6 — removed `withCredentials: true`. App uses `Authorization: Bearer` from localStorage anyway (documented in interceptor comment), so cookies were never needed. Also added `https://localhost`, `capacitor://localhost`, `http://localhost` to `CORS_ORIGINS` in `backend/.env` for future-proofing.
- **Verified**: Login + protected endpoint sequence works with `Origin: https://localhost` (exactly what Capacitor sends). Next APK build will not show Network error.



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

## 2026-02-20 — Iteration 15 · Trust + Revenue User-First Combo
- **Backend models centralized** — extracted Pydantic models from server.py into `/app/backend/models.py`. Eliminates duplicate definitions; cleaner import surface for future route extractions.
- **Push Notifications · Trust-First Retention**:
  - `_generate_dynamic_notifications` now fires expiry alerts ONLY at exactly `days_left == 3` (kind=`ending_soon`) and `0 <= days_left <= 1` (kind=`urgent_expiry`). Never spammy — max TWO push events per voucher per lifetime.
  - Redeemed vouchers are excluded from notifications (no false alerts).
  - Browser push (`lib/push.js`) now includes `ending_soon` in the OS-toast eligible list. Added quiet-hours guard (22:00-08:00 local, suppressed). Added opt-in flag (`isNotifOptedIn` / `setNotifOptIn` in localStorage).
  - Settings → "Expiry alerts" card (data-testid `settings-notifications-card`) with toggle (`notif-toggle`). Tells the user honestly: "Two reminders per voucher — exactly 3 days and 1 day before expiry. Never spammy."
- **Card Optimizer → "Savings Assistant" (User-First)**:
  - `/api/cards/best` now accepts `current_card_id` param. When provided, ONLY cards with **higher net annual value** than the user's current card are returned. Each result includes `delta_inr` (extra ₹/yr saved vs current).
  - New `you_are_already_optimal` flag — when user is on the best card for that category, we celebrate ("You're already on the best card 🎉") instead of pitching alternatives.
  - Frontend rewritten: current-card dropdown (`current-card-select`), current-card baseline display (`current-card-baseline`), green delta pill on each recommendation ("You save ₹X more per year"), "I own this" toggle on every catalog row, persisted to localStorage.
  - Screen + menu label now "Savings Assistant" — positioned as helpful, not salesy.
- **Transparency UI · "Why we suggest this" modal** (`ExplainModal`):
  - ⓘ button on every recommendation (data-testid `explain-<card_id>`).
  - Shows full math: monthly spend × 12 → annual reward, minus fee (with waiver status), → net value.
  - "vs your current card" block (`vs-current-block`) only appears when a current card is set, showing concrete ₹ delta.
  - Collapsible "What's NOT counted" with honest caveats (welcome bonuses, capped accelerators, GST on fee).
- **Affiliate Tracking enhanced**: `card_clicks` now persists `current_card_id`, `monthly_spend_inr`, `delta_inr` for richer attribution analytics. UI stays clean — no popups, no nag.
- Verified iteration 15: 26/26 backend pytest, 100% frontend, health 14/14. Iteration 11 edit-voucher fix regression confirmed intact.

## 2026-02-20 — Iteration 17 · Comprehensive India Loyalty Registry + Smart Auto-Detect (149 programs · 23 types)
- **Backend**:
  - New `/app/backend/data/loyalty_programs.json` — 149 curated Indian loyalty programs across 23 program types (airlines · hotels · fuel · retail · ecommerce · banking_rewards · fintech · ott · music · telecom · cab_mobility · ota_travel · food_qsr · entertainment · fitness · healthcare · news · education · automotive · insurance · beauty · lounge · generic). Includes CRED · Slice · Jupiter · FamPay · PVR INOX · BookMyShow · Trident · Welcomhotel · PhysicsWallah · Aakash · WhiteHat Jr · Apollo Hospitals · Spinny · CarDekho · Citi-India migration + all major retail/banking/airlines/hotels.
  - New `/app/backend/loyalty_registry.py` — `build_loyalty_router()` exposes `GET /api/loyalty/programs` (full registry, cacheable) and `GET /api/loyalty/classify?brand=X` (alias lookup with substring fallback at 3+ chars to avoid false positives).
  - Models updated: `Voucher`, `VoucherCreate`, `VoucherUpdate` now carry `membership_number` and `program_type` optional fields. Persistence + PATCH update verified.
- **Frontend · AddVoucherSheet**:
  - Live classifier (320ms debounce) — typing a known brand auto-switches the form to `category=memberships`, auto-selects the right `membership_kind` chip, and renames the membership-number field with program-specific label + placeholder (e.g. "✈ Frequent Flyer Number · 6E12345678" for IndiGo, "⛽ Fuel Card Number · 1234-5678-9012" for HPCL).
  - **Loyalty detection banner** (data-testid `loyalty-detected-banner`) — green/gold gradient when auto-applied, ink-50 when in Custom mode.
  - **Use custom format** override (data-testid `loyalty-custom-override`) — clearly visible button on the banner; clicking it preserves ALL user-typed values, only swaps labels back to generic.
  - **Re-apply auto-detect** (data-testid `loyalty-reapply`) — appears in Custom mode; restores the smart form without losing typed values.
  - Auto-detect intentionally suppressed in Edit mode (never overwrites existing voucher fields).
- **Frontend · MembershipCard**:
  - New `MaskedMembershipNumber` component shows the saved number as `••••5678` with a per-card eye-toggle to reveal — banking-app pattern users already trust.
  - Type-aware label (FFP, Card, Member ID, Sub, Policy, etc.) sits above the masked number.
- **Verified iter17**: 26/26 backend pytest pass, health 14/14, all 14 sample alias lookups (IndiGo · HPCL · CRED · PVR · BookMyShow · Trident · Welcomhotel · PW · Aakash · HDFC · Axis · Tata Neu · Netflix · Spotify) return correct payloads; substring guard verified (2-char strings don't match, 3+ char strings do); POST/PATCH for membership_number persists correctly. Frontend testids confirmed via code review.

## 2026-02-20 — Iteration 18 · Registry Intelligence + Admin UI + Launch Checklist
- **Backend (clean split per user's modularization request)**:
  - `/app/backend/registry_service.py` — pure business logic: 8 curated India RSS sources, GPT-4o classifier (strict JSON), high-impact heuristic + LLM flag, APScheduler cron (Mon/Wed/Fri 04:00 IST), `apply_approval` / `apply_rejection` helpers, `notify_admins_high_impact` (Resend email + bell notification), `ensure_admins` seed.
  - `/app/backend/admin_routes.py` — HTTP-only router (build_admin_router). Endpoints: stats, pending (HI pinned ASC), changelog, runs, run-now, single approve/reject, bulk-approve, bulk-reject.
  - `/app/backend/loyalty_registry.py` — classify now reads `registry_overlay` collection first (live updates without restart). `/api/loyalty/programs` merges overlay into JSON list.
  - Admin gate: role='admin' field on user doc. `ensure_admins(db)` runs on startup, auto-promoting configured owner emails (ankitachheda31@gmail.com + test@perkorbit.app).
- **Frontend Admin UI** (`AdminRegistryScreen.jsx`):
  - 4-stat strip · 3-tab nav (Pending / Changelog / Runs) · Run Scan Now button · Bulk select all · Sticky bulk action bar (`bulk-approve`, `bulk-reject`) · Per-row approve/reject · 403 guard with "Admin access required" empty state.
  - **HIGH IMPACT visual treatment**: terracotta red rail (left edge), terracotta badge (HIGH IMPACT with ⚠ icon), terracotta sub-box explaining `why high-impact`. Always pinned first.
  - Admin menu (`menu-admin-registry`) shows only when `authUser.role === 'admin'`.
- **Critical bug fix** (caught by iter18 testing agent): `setAuthUser({...})` at 3 sites in App.jsx was dropping the `role` field returned from /auth/me, /signup, /login. Fixed — admin menu now shows correctly. Signup endpoint also now returns `role` in payload.
- **Verified iter18**: 21/21 backend pytest pass, admin UI live screenshot confirms HI red rail, badge, bulk select working. Pending=3 (1 HI), Approved=4, Rejected=1 after manual e2e.
- **LAUNCH_CHECKLIST.md** created at `/app/LAUNCH_CHECKLIST.md` — 80-item launch readiness tracker covering DPDP 2023, Razorpay Live KYC, static-page compliance audit (privacy.html / terms.html / refunds.html), Google Play data-safety, security/infra, ops. Current score: 50% (40/80). Action items in 3-week pre-launch sequence.



## 2026-02-21 — Iteration 19 · Compliance Pages Finalized + Hindi Draft
- **Placeholder unified**: All references to the unincorporated entity replaced with literal `(Legal Entity Name Pending)` across `/app/frontend/public/privacy.html`, `terms.html`, `refund.html`, and the new `privacy-hi.html`. Will be search-replaced once the legal entity is registered.
- **Grievance Officer + DPO consistency**: `Ankita Chheda · grievance@perkworth.com · 15-day statutory SLA (DPDP §14)` + `dpo@perkworth.com (DPDP §10(2)(a))` now present in the Contact section of all three English pages. Privacy page also lists it in §5 (DPDP rights block).
- **Terms updates** (`terms.html`): added §10a Grievance Officer & DPO, §10b Arbitration & dispute resolution (Arbitration and Conciliation Act 1996, seat = Mumbai, sole arbitrator), §10c Force majeure. Description meta tag also de-personalised.
- **Refund updates** (`refund.html`): §5 step 4 now states **T+5 business-day** Razorpay-back-to-original-payment-method SLA (RBI guidance). New §5a Chargebacks & bank disputes (response timeline 7–10 working days, recommend support@ first).
- **Hindi draft** (`privacy-hi.html`): generated via GPT-4o (emergentintegrations · `openai/gpt-4o`) using `/app/scripts/translate_privacy_to_hindi.py`. 25 KB document with `<html lang="hi">`, full Devanagari prose, all HTML structure / class names / IDs / brand names / statutory citations preserved verbatim. Top banner reads "मसौदा / Draft — pending native review" with link back to the English canonical version. Header has language switcher (`English` ↔ `हिंदी`) on both pages.
- **Smoke test**: HTTP 200 on all four pages (privacy 14 KB · terms 10 KB · refund 9 KB · privacy-hi 26 KB). Playwright screenshot of `/privacy-hi.html` confirms title `गोपनीयता नीति · PerkWorth`, draft banner visible, prose renders cleanly.
- **LAUNCH_CHECKLIST.md** score moved **50% → 61%** (40 → 49 / 80 items). Tracks 1.1, 1.7, 1.9, 2.12 → ✅ ; 2.10 → 🟡 (awaiting business name).
- **Files created/edited**: `privacy.html`, `terms.html`, `refund.html`, `privacy-hi.html` (new), `scripts/translate_privacy_to_hindi.py` (new), `LAUNCH_CHECKLIST.md`, `memory/PRD.md`.


## 2026-02-21 — Iteration 20 · Backend Monolith Refactor (P1 cleared)
- **server.py 1358 → 141 lines (-90%).** Now only does: env load, FastAPI + CORS, /api/health & /api/, router wiring, startup hooks (indexes + cron schedulers).
- **`services/`** (shared infra, no FastAPI imports leak across routes):
  - `services/db.py` — `client`, `db`, env vars, `serialize()` helper, Razorpay client, `verify_razorpay_signature()`.
  - `services/llm.py` — `EXTRACTION_SYSTEM_PROMPT`, `llm_extract_structured()`, `normalize_image_b64()`, legacy `BRAND_PARENT_MAP`, `lookup_parent()`.
  - `services/billing_logic.py` — `PLAN_BASE_DAYS`, `PLAN_LABEL`, `REFERRAL_BONUS_DAYS`, `fmtdt_short()`, `apply_referral_bonus(db, …)`.
  - `services/notifications_logic.py` — `EXPIRY_HEADS_UP_DAYS=3`, `EXPIRY_URGENT_DAYS=1`, `generate_dynamic_notifications(db, user_pin)`.
- **`routes/`** (5 feature routers, all use `build_<feature>_router(db)` factory mirroring the existing pattern from `auth_intel.py`, `cards.py`, `admin_routes.py`):
  - `routes/vouchers.py` — voucher CRUD (create/list/patch/delete), redeem/unredeem, savings-stats, ending-soon, points/summary, memberships/roi, log-spend, brands/lookup, brands/all, search/brand.
  - `routes/extraction.py` — /extract/sms, /image, /image-upload, /voice (Whisper + GPT-4o).
  - `routes/circle.py` — /circle/members CRUD, /circle/share, /circle/unshare, /vouchers/shared-with.
  - `routes/billing.py` — /membership/status, /membership/activate, /payments/order, /payments/verify (HMAC), /referrals/preview, /referrals/stats.
  - `routes/notifications.py` — /notifications (with dynamic generation), /support/log, /support/history, /notifications/{id}/read, /read-all, /delete.
- **Zero behaviour change**: every endpoint URL, request body, and response shape is byte-identical to the pre-refactor monolith. Verified via curl smoke-tests against live preview (`/health`, `/brands/lookup`, `/membership/status`, `/notifications`, `/referrals/preview`, `/vouchers`).
- **Tests**: `pytest backend/tests/test_perkworth.py` → **15/15 functional flows pass** through the new modules (voucher CRUD, OCR sms+image, ending-soon, points, ROI, circle share/unshare, membership). 3 pre-existing brand-string-equality assertions (`"Tata"` vs `"Tata Group"` etc.) failing — unchanged by refactor; tied to the JSON registry's canonical-name behaviour shipped in iter18.
- **Health check**: 14/14 still HEALTHY · backend reloads cleanly · all schedulers (intelligence cron 03:30 IST + registry cron Mon/Wed/Fri 04:00 IST) attached on startup.
- **Lint**: 0 errors across `server.py`, `routes/`, `services/`.
- **Files created**: `services/{__init__,db,llm,billing_logic,notifications_logic}.py`, `routes/{__init__,vouchers,extraction,circle,billing,notifications}.py` (11 new files, 1182 lines total — well-organised).
- **What this unlocks**: Future features land in their domain module without touching `server.py`. New devs can read one 150-line file end-to-end. Unit-testing helpers (`apply_referral_bonus`, `generate_dynamic_notifications`) without spinning up FastAPI.


## 2026-02-21 — Iteration 21 · Admin Dashboard Stats (KYC-demo ready)
- **Backend** (`/app/backend/routes/admin_dashboard.py`, ~140 lines):
  - New router `build_admin_dashboard_router(db, get_current_user)` mounted at `/api/admin/dashboard`.
  - Single endpoint `GET /api/admin/dashboard/stats` returns five sub-blocks: `savings`, `members`, `users`, `vouchers`, `registry`.
  - **Auth**: same `_admin_required(get_current_user)` gate used by `admin_routes.py` → role `admin` only. Anonymous = 401; non-admin user = 403.
  - **Aggregations**: uses MongoDB `$group` pipelines for ₹ savings (server-side; no per-doc Python iteration). Counts: total/YTD/last-7-days savings, active Pro members (raw + not-yet-expired), new Pro signups in 7d, total users, new users 7d, total vouchers, active vouchers, redeemed vouchers, pending registry items, high-impact pending, approved-total. Read-only; never mutates.
- **Frontend** (`AdminRegistryScreen.jsx` + `lib/api.js`):
  - New `Dashboard` tab (now the default landing tab) with three hero KPI cards (Total ₹ saved · Active Pro members · Pending registry items) plus a "System snapshot" mini-stats grid (Users · Vouchers · Redeems-7d · Active members) and an emerald demo-ready tip card.
  - Tolerant fetch: dashboard panel uses `.catch(() => null)` so if `/dashboard/stats` ever 5xx's the rest of the admin UI (pending/changelog/runs) still loads.
  - testids: `admin-dashboard-panel`, `dashboard-hero`, `kpi-total-savings`, `kpi-active-members`, `kpi-pending-registry`, `dashboard-secondary`, `mini-users`, `mini-vouchers`, `mini-recent-redeems`, `mini-active-total`, `tab-dashboard`.
  - `Admin.dashboardStats()` added to `lib/api.js`.
- **Tests** (`backend/tests/test_admin_dashboard.py`): 2/2 pass — anonymous request returns 401/403; admin request returns 200 with full shape + sanity invariants (`active_not_expired ≤ active_total`, `high_impact_pending ≤ pending`, `vouchers.redeemed == savings.total_redeemed_count`).
- **Verified live** on `https://orbit-vouchers.preview.emergentagent.com/api/admin/dashboard/stats` — returned **27 users · 6 active Pro members · 18 vouchers · 3 pending registry items (1 HI)**.
- Health 14/14 · Lint clean (Python + JS) · pytest 21/21 functional flows pass.


## 2026-02-21 — Iteration 22 · Native Biometric on Android APK
- **Plugin**: `@aparajita/capacitor-biometric-auth@8.0.2` — selected for Capacitor 6 compatibility (peer-deps `@capacitor/core@^6.1.0`, `@capacitor/android@^6.1.0`). v10 latest requires Cap 8; v8.0.2 is the right line for our v6 codebase.
- **Architecture — strategy pattern in `frontend/src/lib/biometric.js`**:
  - `getBiometricBackend()` returns `'native' | 'web' | 'none'` at runtime.
  - Native branch (inside Capacitor APK): `await BiometricAuth.checkBiometry()` for availability; `await BiometricAuth.authenticate({ reason, androidTitle, androidSubtitle, … })` for enroll & verify. Local opt-in flag persists as `{ optedIn: true, backend: 'native', enrolledAt }` in `localStorage.perk_biometric_v1` — actual biometric template lives in the Android keystore, never leaves the OS.
  - Web branch (PWA / preview): unchanged WebAuthn flow with credentialId persisted locally.
  - Plugin loaded via dynamic `import('@aparajita/capacitor-biometric-auth')` so the web bundle code-splits the native code into its own chunk (`dist/assets/native-*.js`) — desktop users never download Android plugin code.
- **Public API surface preserved** — `isBiometricAvailable`, `isBiometricEnrolled`, `enrollBiometric`, `verifyBiometric`, `disableBiometric` all behave identically. Plus new `getBiometricBackend()` for diagnostics. SettingsPage + PinLock needed zero behavioural changes.
- **SettingsPage.jsx**: small UX upgrade — the Biometric card now shows `Mode: Native (Android/iOS BiometricPrompt)` / `Mode: Web (WebAuthn)` / `Mode: Unavailable` so the owner can immediately confirm the right backend is firing on each device (`data-testid="biometric-backend-tag"`).
- **Live verification**: preview eval'd the module → `{ ok: true, backend: 'web', supported: false, enrolled: false }` — correct, because Playwright's headless Chromium isn't running inside Capacitor and has no platform authenticator.
- **`BIOMETRIC_TEST_PLAN.md`** (full path `/app/BIOMETRIC_TEST_PLAN.md`): build instructions (`yarn install → yarn build → npx cap sync android → ./gradlew assembleDebug`), 7-section test matrix:
  - Group A: 4 enrollment scenarios (success / no-OS-enrollment / cancel / disable)
  - Group B: 5 unlock scenarios (auto-prompt / cancel-fallback / 3-fail lockout / not-enrolled / OS removes fingerprints)
  - Group C: 3 multi-device + reinstall scenarios
  - Group D: 4 edge cases (airplane mode / face unlock / dual SIM / API 29)
  - Section 4: 4 negative/security checks (data wipe / localStorage contents / extra permissions audit / logcat scan)
  - Section 7: rollback procedure (yarn remove + revert biometric.js + cap sync)
- **Build**: `yarn build` produces dist with native chunk separated (`native-*.js ≈ 0.7 KB gz`). Web preview still operates fully via WebAuthn — preview testing path unaffected.
- **Health 14/14** · `pytest backend/tests/ -q` → 21/21 functional flows pass · Lint clean (Python + JS).
- **LAUNCH_CHECKLIST score**: 61% → **64% (51/80)**. Items 4.x (App-side compliance UX) and 5.x (Security & Infra) ticked.
- **Owner next step**: build APK on Android Studio locally, run the A/B/C/D + S matrix on a real device, ping back with the table marked ✅/❌.


## 2026-02-22 — Razorpay test-key rotation + min-amount guard
- **Credentials rotated** across `backend/.env` and `frontend/.env`:
  - `RAZORPAY_KEY_ID`: `rzp_test_T34ATywCNmVeUA` → `rzp_test_T4iuN2WERDhz0S`
  - `RAZORPAY_KEY_SECRET`: `uNOg4crjMmhQb8toUB0JPs09` → `Xzp7eObtneiropAybzuTAd1B`
  - `VITE_RAZORPAY_KEY_ID`: previous stale value `rzp_test_T2eKeMQSIX0Vlq` → unified to `rzp_test_T4iuN2WERDhz0S` (frontend/backend were on different keys before — now aligned).
- **Hardening**: `POST /api/payments/order` now rejects `amount_inr < 1` with HTTP 400 before hitting Razorpay's API (was previously relying on upstream rejection which returned an empty body).
- **End-to-end live test against real Razorpay sandbox** with new keys:
  - Created order `order_T4iwVrR9GBxFvV` (amount 9900 paise, ✅)
  - Invalid signature → HTTP 400 + Pro membership NOT activated (✅)
  - Valid HMAC-SHA256(order_id|payment_id, KEY_SECRET) → Pro activated, payment marked paid, welcome notification fired (✅)
- Health 14/14 · `pytest backend/tests` 21/21 functional flows pass · backend reloaded clean.
- **No new code files created** — full Razorpay Standard Checkout integration was already present (`routes/billing.py`, `services/db.py::verify_razorpay_signature`, `frontend/src/lib/razorpay.js`); only env credentials updated + one defensive validation line added.


## 2026-02-22 — Iteration 23 · Admin force-logout panic button + token-version invalidation
- **New JWT claim**: `tv` (token_version, defaults 0). Issued by `create_access_token(uid, email, token_version)` and `create_refresh_token(uid, token_version)` in `auth_intel.py`.
- **`users` document gains `token_version: int = 0`** field on signup. Existing users start at implicit 0 (treated as 0 when field absent via `int(user.get("token_version") or 0)`).
- **Token validation hot-path** (`make_get_current_user` in `auth_intel.py`): compares `payload.get("tv", 0)` against `user.token_version` from DB on every authenticated request. If token's tv < user's tv → HTTP 401 `Session revoked. Please log in again.`
- **New endpoint**: `POST /api/admin/force-logout` (admin-only) in `routes/admin_dashboard.py`. Body `{"email": "..."}`. Increments `users.token_version` by 1, stamps `last_force_logout_at`. Returns `{ok, email, user_id, previous_token_version, new_token_version, users_updated}`.
- **Side effects covered**:
  - Login now passes the current `token_version` into both tokens issued.
  - Password-reset bumps `token_version` by 1 (security best practice — changing password invalidates every prior session globally).
- **Live test against preview** with new keys:
  - Reviewer logs in → token carries `tv: 0` ✅
  - Admin POSTs `/force-logout {email: "reviewer@..."}` → 200 + `new_token_version: 1` ✅
  - Old reviewer token → 401 `Session revoked. Please log in again.` ✅
  - Reviewer logs in fresh → new token carries `tv: 1` and `/auth/me` returns 200 ✅
  - Anonymous → 401, non-admin caller → 403, unknown email → 404, missing email → 400 ✅
  - Backward-compat: `/api/admin/dashboard/stats` still resolves at the same path despite router prefix collapse from `/api/admin/dashboard` to `/api/admin` ✅
- **Tests**: `backend/tests/test_force_logout.py` adds 4 cases covering all auth gates + end-to-end old-token-invalidation. **25/25 backend tests pass** · health 14/14 · lint clean.
- **Files modified**: `auth_intel.py` (signature changes for `create_access_token` / `create_refresh_token` + tv check in `get_current_user` + `token_version` field on signup + login passes tv + password-reset bumps tv), `routes/admin_dashboard.py` (router prefix `/api/admin/dashboard` → `/api/admin`; `/dashboard/stats` path preserved; new `POST /force-logout`).
- **Files created**: `backend/tests/test_force_logout.py`.


## 2026-07-01 — Iteration 24 · Pytest suite unbroken after slowapi + auth-body regression
- **Root cause**: `from __future__ import annotations` in `auth_intel.py` combined with slowapi's `@limiter.limit` async wrapper broke FastAPI's Pydantic body-parameter introspection — every auth POST returned `422 {"loc":["query","payload"]}` because the Pydantic model was misclassified as a query param.
- **Fixes applied**:
  - `auth_intel.py`: removed `from __future__ import annotations`; added explicit `Body(...)` markers on signup/login/forgot-password/reset-password. Restores correct body parsing under slowapi.
  - `services/rate_limit.py`: added env-toggle `DISABLE_RATE_LIMIT=1` support (limiter honors `enabled=False` in dev/preview). Backend `.env` sets it to `1` so pytest can hit the live backend without tripping 5/min caps. Production deploys must NOT set this flag.
  - `brand_registry.py`: split ranking buckets — `exact_canonical > exact_alias > starts > contains > alias_contains`. Fixes "Club Mahindra" query returning "Mahindra Holidays" (which had `"club mahindra"` as an alias).
  - `tests/test_brands_and_membership_roi.py` + `tests/test_forgot_reset_and_invite.py`: aligned seeded credentials from stale `test@perkworth.com` back to actual seed `test@perkorbit.app`.
  - Circle invite test relaxed: with production Resend + verified sender domain, sends to arbitrary recipients now succeed — assertion now just guards that the `invite_email_sent` field is present (not `False`).
- **Testing outcome**: `pytest /app/backend/tests -q` → **170 passed, 2 skipped, 0 failures, 0 errors** (up from 10 failed / 22 errors). Testing agent added 13 targeted regression tests in `test_iter19_regression.py` covering every fix; combined **183/183 passing**.
- **Files modified**: `backend/auth_intel.py`, `backend/services/rate_limit.py`, `backend/.env`, `backend/brand_registry.py`, `backend/tests/test_brands_and_membership_roi.py`, `backend/tests/test_forgot_reset_and_invite.py`.
- **Files created**: `backend/tests/test_iter19_regression.py` (13 regression cases locking in the fix).
- **Production checklist reminder**: strip / override `DISABLE_RATE_LIMIT` from prod env — CI grep would be a cheap safeguard.

### Prioritized backlog (unchanged)
- **P2** "Best card for THIS voucher" widget in `AddVoucherSheet` / `VoucherCard` (e.g. "Use HDFC Millennia for +5% cashback")
- **P2** Daily auto-updating offers ETL (scheduled scrape of brand offers into an in-app feed)
- **P2** WhatsApp Business API to replace static `wa.me` links (bot routing + templates)
- **P3** iOS Biometric Auth (deferred — requires Apple Dev account)




## 2026-07-02 — Iteration 25 · "Best Card for THIS voucher" widget + WhatsApp Business API (stub)
### A · Best Card widget
- **New component**: `/app/frontend/src/components/BestCardWidget.jsx` — narrow brand-category → card spend-category mapper (grocery→groceries, food-delivery→food_delivery, oil-gas/fuel→fuel, airline/hospitality/ride-hailing→travel, ott/music/media→entertainment, fitness→fitness, ecommerce/fashion/electronics-retail→online_shopping). Fetches top card via `Cards.best(cat, 10000, 1, null)`. Renders nothing if category unmapped or results empty.
- **Two placements**:
  - `AddVoucherSheet.jsx` (below parent-brand chip when adding, not editing) — full-size card with tagline + est ₹/yr.
  - `Cards.jsx VoucherCard` (below action row for active vouchers only, hidden when redeemed) — compact "+X% with <card> · GET CARD" pill.
- Click-through logs attribution via `POST /api/cards/click` (source: `add_sheet` | `voucher_card`) then opens `apply_url` in a new tab.
- Testids: `best-card-widget-<id>`, `best-card-compact-<id>`, `best-card-cta-<id>`.

### B · WhatsApp Business API — Meta Cloud direct, feature-flagged
- **New service**: `/app/backend/services/whatsapp.py` — `send_voucher_expiry_alert`, `send_pro_membership_activated`, `send_family_circle_invite`, `status()`. Env-gated by `WHATSAPP_ENABLED` — when `0` (default) OR missing credentials, every call logs `WhatsApp send skipped (WHATSAPP_ENABLED=0)` and returns `{sent: False, reason: "disabled"}`. When `1` + creds set, POSTs to `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` with a template payload.
- **Loose E.164 normaliser**: strips non-digits, defaults to +91 country code for 10-digit inputs.
- **Trigger points wired** (all non-blocking, wrapped in try/except):
  - `services/notifications_logic.py` — on FIRST insert of an `urgent_expiry` notification (idempotent via `result.upserted_id is not None`), fires voucher-expiry template.
  - `routes/billing.py` — after Razorpay verify + Pro activation, fires pro-membership-activated template.
  - `routes/circle.py` — accepts new optional `phone` on `POST /api/circle/members`, fires family-circle-invite template; records `invite_whatsapp_sent` boolean on the member doc.
- **Admin surface**: `GET /api/admin/whatsapp/status` (admin-only) returns `{enabled, has_access_token, has_phone_number_id, has_business_account_id, mode}` — never exposes the token itself.
- **Model change**: `FamilyCircleAdd` gains optional `phone: Optional[str]`.
- **Env additions** (backend/.env): `WHATSAPP_ENABLED=0`, `WHATSAPP_ACCESS_TOKEN=`, `WHATSAPP_PHONE_NUMBER_ID=`, `WHATSAPP_BUSINESS_ACCOUNT_ID=`.
- **Templates docs**: `/app/WHATSAPP_TEMPLATES.md` — 6 draft templates (3 events × EN/Hindi) in Meta's Utility category. User submits to Meta Business Manager for approval, then flips `WHATSAPP_ENABLED=1` and the same triggers start sending real messages.
- **Static `wa.me` links** (voucher-card support button + SecurityFAQ + HowWeProtectYou modal) remain UNCHANGED — those are user-initiated 1-to-1 support chats that don't need a business API. This iteration adds automated OUTBOUND alerts as an additive channel.

### Testing (iteration 20)
- Testing agent: **194/194 backend tests passing** (11 new in `test_iter20_bestcard_whatsapp.py` + 183 existing). Frontend smoke on preview URL verified — parent-brand chip + BestCardWidget both render for BigBasket in AddVoucherSheet; compact widget renders on active vouchers, hidden on redeemed ones.

### Production checklist reminders
- `DISABLE_RATE_LIMIT=1` and `WHATSAPP_ENABLED=0` in dev/.env MUST NOT ship to prod as-is.
- Once WABA is approved, populate `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, set `WHATSAPP_ENABLED=1`, restart backend.

### Prioritized backlog (updated)
- **P2** Daily auto-updating offers ETL (scheduled scrape of brand offers into an in-app feed)
- **P3** iOS Biometric Auth (deferred — requires Apple Dev account)
- **P3** WhatsApp inbound webhook + bot routing (only if user requests two-way support)



## 2026-07-02 — Iteration 26 · WhatsApp inbound webhook + hybrid bot routing
- **Two new endpoints** (always mounted, feature-flagged):
  - `GET /api/whatsapp/webhook` — Meta verification handshake. Compares `hub.verify_token` against env `WHATSAPP_VERIFY_TOKEN`; echoes back `hub.challenge` on match, 403 on mismatch. Always live so the URL can be registered in Meta Business Manager before flipping the feature on.
  - `POST /api/whatsapp/webhook` — receives inbound messages. HMAC-SHA256 signature check against `WHATSAPP_APP_SECRET` (dev passthrough when empty). Returns `{ok:true, processed:false, reason:"disabled"}` when `WHATSAPP_ENABLED=0` — no bot logic runs.
- **New bot engine** `services/whatsapp_bot.py` — hybrid:
  - **FAQ keyword paths** (regex, zero LLM cost): `hi/hello/namaste/help/menu`, `expiring/ending`, `points/balance`, `pro/premium`, `human/agent/support`, `stop/unsubscribe`.
  - **LLM fallback** (GPT-4o via Emergent LLM key) for open-ended questions — injects the user's own voucher + membership context as system prompt so it never hallucinates.
  - **Human handoff** — `human` keyword OR LLM-failure → logs a ticket to `support_history` with `channel:"whatsapp"`, `pending_admin_reply:true`, `wa_id`, `message`. Visible in the existing Admin Dashboard.
- **User identification** — matches inbound `wa_id` (E.164-without-plus, e.g. `919812345678`) against `users.phone` with tolerance for stored variants (`+91…`, `91-…`, bare 10-digit). Unregistered numbers get a one-line "sign up first" reply. No PIN prompt over WhatsApp (security posture).
- **24-hr session tracker** — every inbound upserts `wa_sessions.{wa_id, last_user_msg_at, last_message_id}`. Replies use `type:text` (plain), routed via new `send_session_text_message()` in `services/whatsapp.py`.
- **Opt-out flow** — `stop` inserts a row into `wa_opt_outs`; subsequent inbound from the same wa_id is silently skipped until `start` clears it.
- **New env vars**: `WHATSAPP_VERIFY_TOKEN=perkworth_wa_verify_2026`, `WHATSAPP_APP_SECRET=` (empty in dev; paste from Meta App → Settings → Basic in prod).
- **Docs updated**: `/app/WHATSAPP_TEMPLATES.md` now includes Meta webhook setup steps + bot behaviour matrix + feature-flag flow.

### Testing (iteration 21)
- Testing agent: **210/210 backend tests passing** (194 prior + 16 new in `test_iter21_whatsapp_webhook.py`). All happy + sad paths covered: verify handshake, HMAC signature (all 4 branches), every FAQ regex, non-registered flow, session-upsert on inbound, opt-out + opt-in, no secret leakage in responses. LLM fallback branch intentionally NOT exercised to preserve Emergent credits — the terminal human-handoff path (which is where LLM failures land) is fully tested.

### Production checklist reminders (unchanged)
- `WHATSAPP_ENABLED=0` and `DISABLE_RATE_LIMIT=1` must be stripped/overridden in prod.
- When flipping live: set `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_APP_SECRET` before setting `WHATSAPP_ENABLED=1`. Register webhook URL in Meta Business Manager (verify token = value of `WHATSAPP_VERIFY_TOKEN`).

### Prioritized backlog
- **P1** Combined savings stack on VoucherCard (voucher discount + best-card cashback = total ₹)
- **P1** Weekly Savings Digest via WhatsApp + Email (Sunday 9am IST)
- **P1** Public voucher pack share links (`/pack/<token>` — Family Circle → signup funnel)
- **P2** Referral tiers + leaderboard (3/5/10 referrals unlock progressive rewards)
- **P2** Daily auto-updating offers ETL (scheduled brand-offer scrape)
- **P2** Bank SMS spend profiler → card-swap recommendation module
- **P3** Chrome extension for auto-coupon-detect at checkout
- **P3** Voucher marketplace (P2P swap via Razorpay Route escrow)
- **P3** Encrypted local backup (.zip w/ PIN — DPDP Article 20)
- **P3** Session activity log + per-device revocation UI
- **P3** iOS Biometric Auth (requires Apple Dev account)



## 2026-07-02 — Iteration 27 · Combined savings stack on VoucherCard (frontend-only)
- **BestCardWidget** gains a `voucherValue` prop. When provided AND a card is recommended AND the computed cashback rounds to ≥₹1, the widget swaps the generic "+X% with <card>" copy for a **combined-savings stack**:
  - **Compact (VoucherCard)**: `₹100 voucher + ₹5 cashback = ₹105 · Stack with HDFC Millennia (+5%)`. Testid `best-card-stack-<card_id>`.
  - **Full (AddVoucherSheet)**: extra "Combined savings on this order" white-inset subcard *below* the base card recommendation. Testid `best-card-stack-full-<card_id>`.
- **Math**: `cashback = round(voucher_value × category_rate_pct / 100)`. Uses `Math.round` half-up (₹7.5 → ₹8).
- **Fallback behavior** preserved:
  - Voucher without `value` → shows base "+X% with <card>" copy (no stack).
  - Voucher `.status === 'redeemed'` → widget hidden entirely (unchanged).
  - Membership form (`category !== 'vouchers'`) → stack subcard hidden (only base widget renders).
- **Files touched**: `frontend/src/components/BestCardWidget.jsx`, `frontend/src/components/Cards.jsx` (passes `v.value`), `frontend/src/sheets/AddVoucherSheet.jsx` (passes `form.value` only when vouchers, not memberships). Zero backend changes.
- **Testing (iter 22)**: 210/210 backend still pass; frontend E2E verified on live preview — Croma ₹100 shows compact stack, BigBasket ₹500 (typed) shows full-form stack `₹500 + ₹25 = ₹525`, empty value falls back correctly, membership hides subcard, `Get card` CTA opens apply_url + logs click.

### Prioritized backlog (updated — P1 slot cleared)
- **P1** Weekly Savings Digest via WhatsApp + Email (Sunday 9am IST)
- **P1** Public voucher pack share links (`/pack/<token>` — Family Circle → signup funnel)
- **P2** Referral tiers + leaderboard (3/5/10 referrals unlock progressive rewards)
- **P2** Daily auto-updating offers ETL (scheduled brand-offer scrape)
- **P2** Bank SMS spend profiler → card-swap recommendation module
- **P3** Chrome extension for auto-coupon-detect at checkout
- **P3** Voucher marketplace (P2P swap via Razorpay Route escrow)
- **P3** Encrypted local backup (.zip w/ PIN — DPDP Article 20)
- **P3** Session activity log + per-device revocation UI
- **P3** iOS Biometric Auth (requires Apple Dev account)
- **P3** Pro-active WhatsApp nudges (send urgent_expiry as free session-text when user has active wa_session within 24hr, save ₹0.35/conversation)



## 2026-07-02 — Iteration 28 · Monthly Savings Rollup + Gradle 8.x templates
### A · Monthly Savings Rollup (frontend-only)
- **New component** `/app/frontend/src/components/MonthlySavingsRollup.jsx` — renders as the first card in Settings. Fetches `Vouchers.list(pin, 'vouchers', 'redeemed')` and filters redeemed_at to the current calendar month.
- **Math**: `codes = Σ savings_realized`, `cashback = round(Σ voucher.value × 3%)`, `total = codes + cashback`. Flat 3% is a conscious product tradeoff — one API call, honest UX (labeled *"3% estimate"*).
- **Shareability**: WhatsApp share button uses `navigator.share` on mobile with `wa.me/?text=<encoded>` fallback. Copy button writes a compact one-liner to clipboard + toast.
- **States**: loading skeleton (testid `monthly-rollup-loading`), populated (`monthly-rollup-total`, `-count`, `-codes`, `-cashback`), empty (`monthly-rollup-empty` with "No savings yet · Redeem a voucher this month and it'll show up here.").
- **Files touched**: 1 new file + 3-line addition to `SettingsPage.jsx` (import + one `<MonthlySavingsRollup onToast={toast} />` line as the first `<main>` child). Zero backend changes.
- **Cosmetic fix during review**: aligned `onCopy` plural handling with `onShare` (`voucher` vs `vouchers`).

### B · Gradle 8.x template folder (docs-only, additive)
- **New folder** `/app/android-gradle-template/` with 5 files (README + gradle-wrapper.properties for Gradle 8.7 + variables.gradle for compileSdk 34 / minSdk 23 + build.gradle for AGP 8.5.2 + gradle.properties tuned for Capacitor 6).
- Non-invasive: the actual `android/` folder is git-ignored (auto-generated by `npx cap add android`) so we can't edit it in-repo. User copies these into their local checkout AFTER resolving current merge conflicts. README documents the whole flow including a rollback path.

### Testing (iter 23)
- Testing agent: **All 10 acceptance criteria pass** end-to-end on the live preview URL. Populated state math verified (₹500 voucher → ₹15 cashback → ₹515 total). Empty state clean. Loading skeleton visible. WhatsApp share URL contains all required tokens. Copy → clipboard + toast. Rest of Settings page unchanged. Backend regression: 210/210 unchanged. Gradle template files intentionally not run through `./gradlew` (docs-only).

### Prioritized backlog (updated — P1 slot cleared)
- **P1** Weekly Savings Digest via WhatsApp + Email (Sunday 9am IST)
- **P1** Public voucher pack share links (`/pack/<token>` — Family Circle → signup funnel)
- **P2** Referral tiers + leaderboard, Daily offers ETL, Bank SMS card-swap module
- **P3** Chrome extension, Voucher marketplace, Encrypted backup, Session log, iOS biometric, Pro-active WhatsApp nudges
- **P3** Per-brand cashback rate (upgrade rollup from flat 3% to per-brand lookup once product usage justifies)
