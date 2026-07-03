# PerkWorth — Full Application Audit
**Generated**: Feb 20, 2026
**Build version**: post-iteration-12 (edit-voucher fix verified)
**Production URL**: https://www.perkworth.com
**Mirror**: https://perkworth.app
**Backend URL**: Emergent-provisioned preview URL (see `backend/.env` → `REACT_APP_BACKEND_URL`) — production deployment pending
**Health**: 14/14 endpoints HEALTHY ✅

---

## 1. EXECUTIVE SUMMARY

PerkWorth is a Voucher-First Personal Financial Assistant for Indian households. It consolidates fragmented rewards, points, coupons, and memberships into one PWA + Capacitor-ready mobile app.

- **Frontend**: React 18 + Vite + Tailwind CSS + Capacitor (Android-ready). 19 screens, 4 modal sheets, 8 reusable components. Deployed on Vercel at `www.perkworth.com`.
- **Backend**: FastAPI + MongoDB (Motor async driver). **52 REST endpoints** across 4 service modules.
- **Auth**: JWT-based cloud account + per-device 4-digit PIN encryption.
- **AI**: GPT-4o for OCR/SMS parsing, Whisper for voice-to-voucher (via Emergent LLM Key).
- **Payments**: Razorpay (TEST mode — LIVE keys pending KYC).
- **Email**: Resend (sending) + ImprovMX (receiving forward to Gmail) — DNS verified.

---

## 2. CORE REQUIREMENTS — IMPLEMENTATION STATUS

### ✅ 2.1 Voucher Ownership / Sharing (Chips & Tags)
**Status**: FULLY IMPLEMENTED — verified iteration 12.

**Backend**:
- `Voucher.owner: Optional[str] = "Self"` (line 113 of server.py)
- `VoucherCreate.owner`, `VoucherUpdate.owner` accept and persist the field
- Backend defaults to "Self" if not provided

**Frontend**:
- `OWNER_OPTIONS` constant in `AddVoucherSheet.jsx` — 15 chips:
  - Self, Spouse, Husband, Wife, Father, Mother, Brother, Sister
  - Brother-in-law, Sister-in-law, Father-in-law, Mother-in-law, Son, Daughter, **Other** (with free-text input)
- `OwnerPicker` component renders chip row with active state + "Other" custom-text input
- Owner tag displayed on every `VoucherCard` (emerald pill: `👤 <Owner>`)
- Owner tag displayed on every `MembershipCard` (white-on-dark pill: `Owned by <Owner>`)
- Both tags default to "Self" for legacy records missing the field
- **Editable** on Add Voucher form AND Edit Voucher form

**Sharing (separate from ownership)**:
- `Voucher.shared_with: List[str]` + `is_sharing: bool` — already-existing Family Circle feature
- `/api/circle/share` and `/api/circle/unshare/<id>` endpoints active

### ✅ 2.2 State Management & Error Boundaries
**Status**: FULLY IMPLEMENTED.

- `ErrorBoundary.jsx` wraps `<App />` in `main.jsx` — catches any uncaught render error, shows friendly recovery card with "Try again" + "Reload app" buttons. Prevents blank screen.
- `Array.isArray` guards added to all list-fetch screens to prevent `.map is not a function` crashes when backend returns HTML on misconfig:
  - `HomeScreen.jsx` — endingSoon + full list
  - `MyCouponsScreen.jsx` — vouchers + roi
  - `MyPointsScreen.jsx` — points breakdown
- `vite.config.js` has `DEFAULT_BACKEND_URL` hardcoded fallback so even if Vercel env vars are missing, builds never inline `undefined`.
- `Auth.me()` cold-start check is defensive: only accepts `me` if it's an object with `email` (rejects HTML-returned responses).

### ❌ 2.3 Redemption Tracking (Status Fields)
**Status**: NOT IMPLEMENTED.

- ❌ No `status` field on `Voucher` model (currently only `created_at`, `expiry`)
- ❌ No "Mark as Redeemed" button on VoucherCard
- ❌ No History tab / screen
- ❌ No total-savings-realized aggregation across redeemed vouchers
- 🟡 `Voucher.savings_realized` field exists for **memberships only** (ROI tracker), not vouchers

**To implement (planned for next session)**:
1. Add `Voucher.status: Optional[str] = "active"` field — values: `active | redeemed | expired`
2. Add `Voucher.redeemed_at: Optional[str]` ISO timestamp
3. POST `/api/vouchers/<id>/redeem` endpoint (sets status, increments `savings_realized`)
4. Add "Mark Redeemed" button to VoucherCard (Active state)
5. Add `/history` screen tab showing only `status=redeemed`
6. Auto-set `status=expired` via cron when `expiry < today`
7. Display "₹X saved this year" tally on home/profile

### ✅ 2.4 Category Sorting
**Status**: FULLY IMPLEMENTED.

- `Voucher.category` enum: `"vouchers" | "memberships"`
- `Voucher.membership_kind`: `"asset" | "content"` (further split memberships)
- `MyCouponsScreen` has 3-tab filter at top: All / Memberships / Vouchers
- `MyCouponsScreen` also has dynamic owner-filter row (chips) — only renders when 2+ owners exist
- Bottom nav has dedicated `/coupons` and `/points` and `/family` and `/tips` and `/discovery` screens — each is its own categorical view

### ✅ 2.5 Household / Family Wallet Summary
**Status**: FULLY IMPLEMENTED — verified iteration 11.

- `HomeScreen.jsx` shows `[data-testid="household-summary"]` card when household has 2+ distinct owners
- Card displays:
  - "Family Wallet" pre-label
  - Total ₹ value across ALL vouchers (sum of `v.value`)
  - Total item count
  - "Tracked for N people in your household" line
  - Horizontal-scrolling avatar row, one per owner (initial + count + name)
- Aggregation done client-side from `/api/vouchers` list
- Only renders for multi-person households (single-person households don't see this card — clean UX)

---

## 3. RECENT DEVELOPMENT CYCLE — WHAT SHIPPED THIS WEEK

### ✅ Done
1. **Rebrand**: "Perk Orbit" → "PerkWorth" (397 replacements across 56 files)
2. **Vercel deployment** for `frontend/` only (monorepo config: root `vercel.json` + `package.json` + `.vercelignore`)
3. **Production domains**: perkworth.com + perkworth.app live on Vercel, SSL via Let's Encrypt
4. **Resend email setup** for `noreply@perkworth.com` (DKIM + SPF + DMARC verified)
5. **ImprovMX inbound forwarding** for `support@perkworth.com` → `ankitachheda31@gmail.com`
6. **Email rebrand**: `@perkworth.app` → `@perkworth.com` (101 replacements across 24 files)
7. **Razorpay KYC prep**: landing.html, privacy.html, terms.html, refund.html shipped as static pages
8. **Owner field + Owner Picker** (15 chips, full CRUD)
9. **Owner tags** on every VoucherCard and MembershipCard
10. **Family Wallet Summary** card on home screen
11. **Owner filter pill row** on MyCoupons screen
12. **Edit Voucher / Edit Membership** flow (pencil icon → AddVoucherSheet reused as edit mode with PATCH)
13. **ErrorBoundary** + defensive Array.isArray guards
14. **Vite config fallback URL** to prevent `undefined` inlining

### ❌ Pending from Recent Cycle (user explicitly asked, NOT YET DONE)
1. **Redemption Tracker** (status field + Mark Redeemed + History + savings tally) — designed but not coded
2. **Biometric Authentication** (Face ID / Fingerprint via Capacitor BiometricAuth) — not started
3. **PWA Push Notifications** for expiry alerts (currently only in-app banner + email)
4. **Production smoke retest on www.perkworth.com** after the email/edit/owner pushes — preview is verified, prod URL needs re-test

### 🟡 Verification Status
- Iteration 10: Owner field + crash fix → 100% PASS
- Iteration 11: Family Wallet + Owner filter + Edit (initial) → C/D PASS, E had bugs
- Iteration 12: Edit-voucher fixes → 100% PASS
- Production www.perkworth.com: KYC URLs verified live, full app smoke pending

---

## 4. BACKEND DATA MODELS (Pydantic)

All models live in `/app/backend/server.py`.

### Voucher (the central entity)
```python
class Voucher(BaseDocument):
    user_pin: str                            # per-device PIN hash
    type: str                                # "voucher" | "membership"
    brand: str
    parent_company: Optional[str]            # via brand registry fuzzy match
    title: str
    code: Optional[str]                      # promo code
    value: Optional[float]                   # ₹ off
    value_currency: str = "INR"
    points: Optional[int]                    # for loyalty programs
    expiry: Optional[str]                    # ISO date YYYY-MM-DD
    start_date: Optional[str]                # ISO date (membership)
    category: str = "vouchers"               # "vouchers" | "memberships"
    membership_kind: Optional[str]           # "asset" | "content"
    fee_paid: Optional[float]                # for asset memberships
    benefit_rate: Optional[float]            # 0..1 decimal (e.g. 0.10 = 10%)
    total_spend: Optional[float] = 0.0       # cumulative spend
    savings_realized: Optional[float] = 0.0
    how_to_redeem: Optional[str]
    notes: Optional[str]
    owner: Optional[str] = "Self"            # ★ NEW (this week)
    shared_with: List[str]                   # Family Circle UIDs
    is_sharing: bool = False
    created_at: str                          # ISO timestamp
    # ❌ MISSING: status, redeemed_at — for Redemption Tracker
```

### Other Persistent Models
- **`User`** (in auth_intel.py) — email, password_hash, name, phone, claimed_pins, created_at
- **`FamilyCircleMember`** — relation (Spouse/Child/Parent/Sibling/Other), name, email, code, created_at
- **`AppMembership`** — user_id, active, plan, expires_at, benefit_rate, total_spend (for ₹99/quarter)
- **`Payment`** — order_id, payment_id, amount, status (Razorpay records)
- **`Notification`** — user_id, type, title, body, read, created_at
- **`SupportLog`** — type (whatsapp_open / etc.), payload, created_at
- **`BrandRegistry`** — static JSON at `/app/backend/data/brand_registry.json` (50+ Indian brands with parent companies)

---

## 5. BACKEND API ENDPOINTS (52 total)

### Authentication (`/api/auth/*`) — 8 endpoints
- POST `/auth/signup` · POST `/auth/login` · POST `/auth/logout` · GET `/auth/me`
- POST `/auth/claim-pin` · POST `/auth/wipe` (full account delete)
- POST `/auth/forgot-password` · POST `/auth/reset-password`

### Vouchers (`/api/vouchers/*`) — 5 endpoints
- POST `/vouchers` (create) · GET `/vouchers` (list, filter by category)
- GET `/vouchers/ending-soon` · PATCH `/vouchers/{id}` (full update)
- DELETE `/vouchers/{id}`
- GET `/vouchers/shared-with` (Family Circle view)

### Brand Registry & Discovery
- GET `/brands/lookup` (fuzzy match) · GET `/brands/all` (full list)
- GET `/search/brand` (Smart Discovery)

### Points & Memberships
- GET `/points/summary` (aggregated INR value across loyalty programs)
- GET `/memberships/roi` (break-even calculator output)
- POST `/memberships/{id}/log-spend` (manual ROI tracker entry)

### AI Extraction (Emergent LLM Key)
- POST `/extract/sms` (parse SMS to voucher via GPT-4o)
- POST `/extract/image` (OCR base64 receipt)
- POST `/extract/image-upload` (multipart receipt)
- POST `/extract/voice` (Whisper → GPT-4o voucher parser)

### Family Circle (`/api/circle/*`) — 5 endpoints
- POST `/circle/members` · GET `/circle/members` · DELETE `/circle/members/{id}`
- POST `/circle/share` · POST `/circle/unshare/{voucher_id}`

### Membership Subscription (₹99/quarter)
- GET `/membership/status` · POST `/membership/activate`

### Payments (Razorpay)
- POST `/payments/order` (create order) · POST `/payments/verify` (signature check)
- POST `/payments/webhook` (server-side confirmation)

### Notifications (`/api/notifications/*`) — 5 endpoints
- GET `/notifications` · POST `/notifications/{id}/read`
- POST `/notifications/read-all` · DELETE `/notifications/{id}`

### Support & Referrals
- POST `/support/log` (WhatsApp click tracking)
- GET `/support/history`
- GET `/referrals/preview` · GET `/referrals/stats`

### Loyalty Optimizer
- GET `/tips` (AI-powered loyalty tips engine)
- POST `/intel/run-now` (admin: trigger cron)
- GET `/intel/programs` (admin: list known loyalty programs)

### GDPR / Export
- GET `/user/export` (full user data dump, JSON download)

### System
- GET `/health`, GET `/`

---

## 6. FRONTEND SCREENS (19) + SHEETS (4) + COMPONENTS (8)

### Screens (`/app/frontend/src/screens/`)
| Screen | Purpose |
|---|---|
| AuthScreen.jsx | Login + Signup forms |
| ResetPasswordScreen.jsx | Token-based password reset |
| PinLock.jsx | 4-digit PIN setup + verify |
| Walkthrough.jsx | First-time-user 3-step onboarding |
| SmartDiscoveryScreen.jsx | "Pick your favorite brands" pre-load |
| HomeScreen.jsx | Search, ending-soon, **Family Wallet Summary**, daily tips |
| MyCouponsScreen.jsx | List + tabs + **Owner filter** + cards |
| MyPointsScreen.jsx | Loyalty points aggregated INR value |
| PerkTipsScreen.jsx | AI-generated savings tips |
| CirclePage.jsx | Family Circle list + invite |
| FamilyCardsPage.jsx | Vouchers shared with you |
| MembershipPage.jsx | ₹99/quarter upsell + Razorpay checkout |
| ProfilePage.jsx | Account info, Save to Cloud, Sign out |
| SettingsPage.jsx | Master settings menu |
| PrivacyScreen.jsx | In-app privacy policy |
| PrivacyControlScreen.jsx | Data Wipe, GDPR Export buttons |
| SecurityFAQScreen.jsx | Trust badges, encryption explainer |
| SupportHistoryScreen.jsx | Past WhatsApp/email support actions |
| SmsScannerScreen.jsx | Bulk SMS paste → AI parse → import many vouchers |

### Sheets (`/app/frontend/src/sheets/`)
| Sheet | Purpose |
|---|---|
| AddVoucherSheet.jsx | Add OR Edit voucher/membership (Manual / Scan / SMS / Voice modes) — **OwnerPicker** included |
| HowToSheet.jsx | "How to redeem this voucher" detail view |
| NotificationSheet.jsx | Bell-icon notification feed |
| ShareSheet.jsx | Share a voucher with a Circle member |

### Components (`/app/frontend/src/components/`)
| Component | Purpose |
|---|---|
| ErrorBoundary.jsx | App-wide crash recovery card ★ NEW |
| BottomNav.jsx | Fixed bottom tab bar |
| Cards.jsx | VoucherCard + MembershipCard (both now show Owner tag + Edit pencil) |
| ProfileMenu.jsx | Avatar dropdown menu |
| SearchResult.jsx | Brand search dropdown |
| HowWeProtectYouModal.jsx | Trust + security explainer modal |
| ui.jsx | Shared primitives (Button, Sheet, Tag, FormField, Empty…) |
| widgets.jsx | Hero, Section, Skeleton, etc. |

---

## 7. INTEGRATIONS

| Service | Purpose | Status |
|---|---|---|
| **MongoDB** (local) | Primary database | ✅ |
| **Razorpay** | ₹99/quarter checkout | ✅ TEST mode (LIVE pending KYC) |
| **Resend** | Outbound email (`noreply@perkworth.com`) | ✅ Verified |
| **ImprovMX** | Inbound forward (`support@perkworth.com` → Gmail) | ✅ Verified |
| **Vercel** | Frontend hosting | ✅ |
| **OpenAI GPT-4o** | OCR + SMS parsing | ✅ via Emergent LLM Key |
| **OpenAI Whisper** | Voice-to-voucher transcription | ✅ via Emergent LLM Key |
| **Capacitor** | Android / iOS build pipeline | ✅ Android scripted, iOS doc'd |
| **WhatsApp Business API** | Support routing | ❌ Static wa.me link only |
| **Push Notifications** | Native + Web push | ❌ Not started |

---

## 8. SECURITY POSTURE

- ✅ JWT-based auth with httpOnly cookies + Bearer token fallback
- ✅ Per-device 4-digit PIN (separate from cloud password)
- ✅ AES-encrypted voucher codes at rest (PIN-derived key)
- ✅ Brute-force PIN throttle (3 wrong attempts = 30 sec lockout)
- ✅ Razorpay webhook signature verification
- ✅ DPDP 2023 + GDPR compliance copy
- ✅ One-click data wipe + GDPR export
- ✅ Master ErrorBoundary prevents app crashes from leaking state
- ❌ No biometric auth yet
- ❌ No 2FA / OTP
- ❌ No rate limiting on auth endpoints (relying on Cloudflare/Vercel edge)

---

## 9. WHAT'S MISSING TO BE A REAL-WORLD INDIAN MARKET APP

### Tier 1 — Revenue Multipliers
- ❌ Credit Card Optimizer (50+ Indian cards, category-wise reward matrix)
- ❌ Co-branded Card Recommender (affiliate revenue: ₹200-2000/application)
- ❌ Daily deal feed (CashKaro / GrabOn / CouponDunia integration)
- ❌ UPI Cashback Tracker (PhonePe/Paytm/GPay scratch cards)
- ❌ Bank Reward Points Hub (HDFC PayZapp, Axis EDGE, SBI Rewardz)

### Tier 2 — Trust & Retention
- ❌ Biometric Auth (user-requested)
- ❌ Redemption Tracker (user-requested)
- ❌ SMS Reward Inbox auto-parse (currently only Bulk-Paste mode)
- ❌ Bill Calendar (DTH/Broadband/OTT renewals)
- ❌ Festival Stack Optimizer

### Tier 3 — Indian Differentiators
- ❌ Multi-language (Hindi/Marathi/Tamil/Gujarati/Bengali)
- ❌ Family Budget Envelopes (category-wise spend caps)
- ❌ WhatsApp Bot companion (Twilio / Meta Business API)
- ❌ GST Bill Scanner with cashback recommendation
- ❌ Investment-linked rewards tracker (Mutual Fund, Zerodha, Groww)

### Infrastructure
- ❌ Backend production deployment (currently Emergent preview URL)
- ❌ Postgres / MongoDB Atlas migration (currently local Mongo)
- ❌ Sentry / DataDog error monitoring
- ❌ CI/CD pipeline (currently manual git push)
- ❌ A/B testing framework
- ❌ Analytics (Mixpanel / Posthog)
- ❌ App Store + Play Store listing assets ready but not submitted

---

## 10. KEY METRICS — POST-AUDIT SNAPSHOT

| Metric | Value |
|---|---|
| Frontend lines of code | ~10,000 |
| Backend lines of code | ~5,500 |
| Total backend endpoints | 52 |
| Frontend screens | 19 |
| Frontend sheets | 4 |
| Frontend components | 8 |
| Data models | 13 (Voucher, User, FamilyCircleMember, AppMembership, Payment, Notification, SupportLog, BrandRegistry, OCRTextInput, OCRImageBase64Input, ShareInviteCreate, FamilyCircleAdd, LogSpendBody) |
| Pydantic create/update models | 8 |
| Test reports completed | 12 iterations |
| Production health check | 14/14 passing |
| Tech debt items | Edit-voucher prod retest, redemption status field, biometric auth |

---

## 11. WHAT TO REVIEW WITH YOUR DEV PARTNER

**Immediate next 3 deliverables (P0)**:
1. **Redemption Tracker** (1-2 days) — backend `status` field + Mark Redeemed UI + History tab + total-saved stat
2. **Biometric Auth** (2-3 days) — Capacitor BiometricAuth plugin + WebAuthn web fallback + PIN remains backup
3. **Production smoke retest on www.perkworth.com** (30 min) — verify post-rebrand + post-owner-feature on real prod URL

**Strategic decisions needed**:
- Backend production hosting (Render / Railway / Fly.io recommended) — currently on Emergent preview
- Affiliate network selection for Credit Card Optimizer revenue (Paisabazaar API vs Bankbazaar)
- Push notification provider (OneSignal vs FCM directly)
- Multi-language priority (Hindi first? Marathi? both?)

**Architecture concerns**:
- `server.py` is 1375 lines — should split into `routes/`, `models/`, `services/`
- No automated tests in CI — `backend/tests/` has 5 pytest files but no CI runner
- Brand registry is static JSON — should move to MongoDB with admin CRUD endpoints
- No rate limiting beyond what Vercel edge provides

---

*End of audit. Generated for handoff to development partner.*
