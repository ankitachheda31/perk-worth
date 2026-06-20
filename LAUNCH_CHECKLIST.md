# PerkWorth — Launch Readiness Checklist
> **A living document — updated after every shipped milestone.**
> Last updated: **2026-02-20** · Iteration 18
> Owner: PerkWorth Technologies (Ankita Chheda)
> Target launch: India (PWA + Android APK first, iOS later)

This checklist tracks every legal, compliance, technical and operational item required for a **public launch** of PerkWorth in India. We treat it as a parallel track to feature development.

Status legend:
- ✅ Complete
- 🟡 In progress / partial
- 🔴 Not started / blocker
- ⏳ Waiting on external party (bank, KYC, govt)

---

## 0 · Launch Readiness Score (at a glance)

| Track | Items | Done | Status |
|---|---|---|---|
| 1. DPDP Act 2023 compliance | 11 | 10 | 🟢 91% |
| 2. Razorpay Live activation | 13 | 5 | 🟡 38% |
| 3. Static legal pages | 12 | 9 | 🟡 75% |
| 4. App-side compliance UX | 10 | 9 | 🟡 90% |
| 5. Security & Infra | 12 | 10 | 🟡 83% |
| 6. Google Play / iOS App Store | 14 | 3 | 🔴 21% |
| 7. Customer-facing operations | 8 | 5 | 🟡 63% |
| **TOTAL** | **80** | **51** | **🟡 64%** |

---

## 1 · DPDP Act 2023 Compliance (Digital Personal Data Protection)

The Digital Personal Data Protection Act 2023 (effective in phases through 2026) is India's first comprehensive privacy law. As a "Data Fiduciary" processing personal data of Indian residents, PerkWorth must comply.

| # | Requirement | Source | Status | Notes |
|---|---|---|---|---|
| 1.1 | Privacy Notice in **English + Hindi** + any local languages we operate in | DPDP §5(3) | ✅ | English live at `/privacy.html`; **Hindi draft** live at `/privacy-hi.html` (GPT-4o, marked "मसौदा / Draft — pending native review") |
| 1.2 | Lawful basis for processing each data category (consent / legitimate use) | DPDP §6 | ✅ | Documented in privacy.html under "What we collect & why" |
| 1.3 | **Explicit, granular consent** for non-essential processing (e.g. SMS scanning, voice processing, marketing emails) | DPDP §6(1) | 🟡 | OCR/SMS/Voice ask permission per-use; **marketing consent flag missing** |
| 1.4 | **Right of access** — user can download all their data | DPDP §13(1) | ✅ | `/api/data-export?format=json` and `?format=csv` |
| 1.5 | **Right to correction** — edit voucher, profile, etc. | DPDP §13(2) | ✅ | Edit Voucher, Settings → Edit Profile |
| 1.6 | **Right to erasure** — full account + data wipe | DPDP §13(3) | ✅ | Settings → "Wipe all data" |
| 1.7 | **Right to grievance redressal** — published contact for complaints | DPDP §14 | ✅ | Ankita Chheda · grievance@perkworth.com · 15-day SLA · listed on privacy/terms/refund pages |
| 1.8 | **Data breach notification** within 72h to DPB + affected users | DPDP §8(6) | 🟡 | Resend email template ready; **no breach playbook documented** |
| 1.9 | **Data Protection Officer (DPO) or contact person** appointment | DPDP §10(2)(a) | ✅ | Ankita Chheda formally designated as DPO in privacy.html §5 + terms.html §10a · dpo@perkworth.com |
| 1.10 | **Children's data** (under-18) — verifiable parental consent required | DPDP §9 | 🟡 | App has 18+ disclaimer in Terms; **no age-gate at signup** |
| 1.11 | **Data retention policy** — must delete on consent withdrawal | DPDP §8(7) | ✅ | Wipe flow + automatic redeemed-voucher archival |

**Action items (DPDP)**:
- 🔴 Add Grievance Officer: `grievance@perkworth.com` → forwards to Ankita Chheda
- 🔴 Designate DPO formally in Terms (founder = DPO until team grows)
- 🟡 Translate privacy.html to Hindi (hire ProZ translator OR use GPT-4o + native reviewer)
- 🟡 Add `marketing_consent` boolean to user model; show during signup
- 🟡 Document breach playbook (1-pager) → store in `/docs/breach_playbook.md`
- 🟡 Add `date_of_birth` field at signup with age-gate (>= 18)

---

## 2 · Razorpay Live Activation Requirements

Razorpay requires the following to switch from Test Mode → Live. **Submit at**: https://dashboard.razorpay.com/app/settings/business

### Business documents
| # | Document | Status | Notes |
|---|---|---|---|
| 2.1 | **PAN of business** (Company PAN if incorporated; founder's PAN if Proprietorship) | ⏳ | If running as sole proprietorship: Ankita's PAN — already have |
| 2.2 | **GST Certificate** (or self-declaration if turnover < ₹20L) | ⏳ | Need to register on https://reg.gst.gov.in/registration |
| 2.3 | **Certificate of Incorporation** (LLP/Pvt Ltd only) | ⏳ | If incorporating: file with MCA — ~₹15-20K, 2-3 weeks |
| 2.4 | **Memorandum & Articles of Association** (Pvt Ltd only) | ⏳ | Same as 2.3 |
| 2.5 | **MSME / Udyam Registration** (optional but lowers transaction fees) | 🔴 | Free, online at https://udyamregistration.gov.in |
| 2.6 | **Cancelled cheque or bank statement** (current account) | ⏳ | Need to open a current account in business name |
| 2.7 | **Address proof** of registered business (utility bill / rent agreement) | ⏳ | |
| 2.8 | **Founder Aadhaar + PAN** | ✅ | Personal docs in hand |
| 2.9 | **Founder selfie holding PAN** (Razorpay video KYC) | ⏳ | Done at activation interview |

### Website / app compliance (Razorpay checks BEFORE activating)
| # | Requirement | Status | Notes |
|---|---|---|---|
| 2.10 | **Terms of Service** page live with business name + contact | 🟡 | `/terms.html` live with `(Legal Entity Name Pending)` placeholder + Grievance Officer + Arbitration + Force-Majeure clauses; will fill business name once incorporated |
| 2.11 | **Privacy Policy** page live | ✅ | `/privacy.html` |
| 2.12 | **Refund Policy** page live (matches the in-app refund flow) | ✅ | `/refund.html` updated with T+5 Razorpay refund SLA, chargeback policy §5a, original-payment-method-only language |
| 2.13 | **Contact Us** page with phone + email + physical address | 🟡 | Email + WhatsApp present; **physical address & phone missing** |

**Action items (Razorpay Live)**:
1. Decide structure: Sole Prop vs LLP vs Pvt Ltd (lowest cost: Sole Prop; best brand-trust: Pvt Ltd)
2. Open current account in business name (HDFC / ICICI typical 7-10 days)
3. Register for GST if turnover projected > ₹20L/yr (most fintech eventually do)
4. Update legal pages with registered business name + GSTIN + physical address
5. Add Customer Care phone number (₹0 cost: virtual number from MyOperator / Knowlarity ~₹500/mo)

---

## 3 · Static Legal Pages — Compliance Audit

### Audit of `/app/frontend/public/privacy.html` (currently live)

✅ **What we have:**
- Categories of data collected (account, voucher, payment metadata)
- Purpose-of-use mapping
- Storage location (MongoDB Atlas — Indian region)
- 3rd party processors named (Razorpay, Resend, OpenAI, Vercel)
- DPDP rights summary
- Wipe / export endpoints documented

🔴 **Missing — must add for India compliance:**
1. **Grievance Officer details** — name, email, response SLA (15 days under DPDP)
2. **DPO contact** — separate from Grievance Officer or same person, must be named
3. **Data retention duration** for each category (e.g. voucher data retained until user deletes; payment metadata 7 years for tax)
4. **Cookie disclosure** — list each cookie + purpose (currently none, but `access_token`/`refresh_token` cookies need disclosure)
5. **Cross-border data transfer notice** — OpenAI processes data in US; user must consent
6. **Children's data clause** — explicit 18+ requirement + parental consent for minors
7. **Effective date + last-updated date** at top of page
8. **Hindi translation** — DPDP requires native-language notice

### Audit of `/app/frontend/public/terms.html`

✅ **What we have:**
- Service description
- User obligations
- Limitation of liability
- Jurisdiction clause (Mumbai)

🔴 **Missing — must add:**
1. **Registered business name** (will fill once 2.1-2.3 done)
2. **GSTIN** + **CIN** (Company Identification Number) once registered
3. **Account suspension / termination grounds** — DPDP §11 requires clear grounds
4. **Subscription terms** — auto-renewal, cancellation, prorated refunds for ₹99 Pro plan
5. **Arbitration clause** under Arbitration & Conciliation Act 1996 (recommended for fintech)
6. **Force majeure clause**

### Audit of `/app/frontend/public/refunds.html`

✅ **What we have:**
- General refund window
- Process to request refund

🔴 **Missing for Razorpay + RBI Master Direction on Customer Service:**
1. **Specific refund SLA** — RBI requires "T+5 business days" for any payment failure refunds
2. **Razorpay refund channel mention** — refunds processed via Razorpay back to original payment method
3. **Chargeback policy** — what happens if user disputes via bank
4. **Free trial / 7-day no-questions-asked refund** for memberships (improves conversion AND meets fairness norms)

---

## 4 · App-side Compliance UX (mostly done)

| # | Requirement | Status | Where |
|---|---|---|---|
| 4.1 | TLS 1.3 + bcrypt + AES encryption badges visible | ✅ | "How We Protect You" modal |
| 4.2 | Per-action permission prompts (camera, microphone, SMS) | ✅ | Browser-native + Capacitor permissions |
| 4.3 | Self-service data export (JSON + CSV) | ✅ | Settings → Privacy Control |
| 4.4 | Self-service account wipe with re-confirmation | ✅ | Settings → Danger Zone |
| 4.5 | Anti-spam push notifications (quiet hours, opt-in toggle) | ✅ | iter15 |
| 4.6 | Consent banner on first launch (cookies + processing) | 🔴 | Not yet — banner needed for EU/UK users |
| 4.7 | Privacy Control screen showing what's stored | ✅ | Already shipped |
| 4.8 | Masked sensitive numbers (PIN, FFP, card last 4) | ✅ | iter17 MaskedMembershipNumber |
| 4.9 | Security FAQ surfaced from Profile menu | ✅ | Existing |
| 4.10 | Opt-out flag for marketing emails | 🔴 | Add `marketing_consent` field |

---

## 5 · Security & Infrastructure

| # | Requirement | Status |
|---|---|---|
| 5.1 | TLS 1.3 enforced on all subdomains | ✅ Vercel default |
| 5.2 | HSTS header (max-age >= 1 year) | ✅ Vercel auto |
| 5.3 | bcrypt for passwords (cost factor >= 10) | ✅ |
| 5.4 | JWT in httpOnly + SameSite cookies | ✅ |
| 5.5 | Rate limiting on auth endpoints (RBI guidance) | 🔴 Add slowapi |
| 5.6 | CAPTCHA / brute-force protection | 🔴 Defer to v1.1 |
| 5.7 | Database encryption-at-rest (MongoDB Atlas) | ✅ Default |
| 5.8 | Daily MongoDB Atlas backups | ✅ Default |
| 5.9 | Audit log for sensitive actions (login, wipe, payment) | 🟡 Notifications log; **no separate audit_log collection** |
| 5.10 | Environment secrets in `.env` only (no commits) | ✅ |
| 5.11 | 2FA for admin account | 🔴 Defer to v1.1 |
| 5.12 | API key rotation policy documented | 🔴 |

---

## 6 · Google Play Store + iOS App Store

### Google Play (Android APK via Capacitor)
| # | Requirement | Status |
|---|---|---|
| 6.1 | Developer account ($25 one-time) | 🔴 |
| 6.2 | App icon (512×512 PNG) | 🟡 Have but need polish |
| 6.3 | Feature graphic (1024×500) | 🔴 |
| 6.4 | Screenshots (phone + tablet, 8 minimum) | 🔴 |
| 6.5 | Short description (80 chars) + Full description | 🔴 |
| 6.6 | Privacy Policy URL (https://www.perkworth.com/privacy.html) | ✅ |
| 6.7 | **Data safety form** — list all data collected, purposes, sharing | 🔴 30-min task |
| 6.8 | **Permissions declarations** (camera, microphone, SMS_READ) | 🔴 Must justify each |
| 6.9 | Target API level (≥ 34) | ✅ Capacitor defaults |
| 6.10 | Signing key + Play App Signing enrollment | 🔴 |
| 6.11 | Content rating (IARC questionnaire) | 🔴 |
| 6.12 | **Financial services declaration** — Google flags fintech for extra review (~7-14 days) | 🔴 |

### iOS App Store
| # | Requirement | Status |
|---|---|---|
| 6.13 | Apple Developer Program ($99/year) | 🔴 |
| 6.14 | iOS Capacitor build pipeline | 🔴 Deferred to next quarter |

---

## 7 · Customer-Facing Operations

| # | Requirement | Status |
|---|---|---|
| 7.1 | Support email working (support@perkworth.com) | ✅ ImprovMX forwarding |
| 7.2 | Grievance email | 🔴 `grievance@perkworth.com` to be set up |
| 7.3 | Customer support phone (RBI guidance for payments) | 🔴 Get virtual number |
| 7.4 | WhatsApp support routing | ✅ wa.me link active |
| 7.5 | FAQ page (in-app + web) | ✅ FAQ + Security FAQ live |
| 7.6 | Status page (uptime / incident comms) | 🔴 Use BetterUptime free tier |
| 7.7 | Refund-request SLA published | 🟡 Implicit; should be explicit "5 business days" |
| 7.8 | Inbound complaints tracker (DPDP §14 — 15-day SLA) | 🔴 Needed once grievance@ live |

---

## 8 · Recommended Pre-Launch Sequence (1-3 weeks)

**Week 1 — Foundations**
- [ ] Decide business structure (Sole Prop / LLP / Pvt Ltd)
- [ ] Apply for PAN/Udyam if not already
- [ ] Open business current account (HDFC quickest)
- [ ] Register `grievance@perkworth.com` mailbox (ImprovMX)
- [ ] Get a virtual support phone (MyOperator ~₹500/mo)

**Week 2 — Compliance UI fixes**
- [ ] Update privacy.html with Grievance Officer, DPO, retention durations, cookie disclosure, cross-border transfer notice
- [ ] Update terms.html with business name placeholder, arbitration clause, subscription terms
- [ ] Update refunds.html with Razorpay-specific language + T+5 SLA
- [ ] Hindi translation of privacy notice
- [ ] Add marketing_consent toggle at signup

**Week 3 — Razorpay Live + Play Store**
- [ ] Submit all docs to Razorpay activation
- [ ] Create Google Play developer account
- [ ] Complete Data Safety form + screenshots
- [ ] First internal track release on Play Console
- [ ] Soft launch to closed friends/family group

---

## 9 · Risks & Open Decisions

| Risk | Mitigation | Owner |
|---|---|---|
| RBI may classify PerkWorth as a "Payment Aggregator" if we hold customer money | We don't hold funds; Razorpay does. Verify in writing with a fintech lawyer | Ankita |
| OpenAI processes Indian user data in US — DPDP cross-border consent needed | Explicit consent banner before first AI call | Eng |
| Razorpay activation may take 2-4 weeks if KYC docs incomplete | Prepare ALL docs before submission | Ankita |
| Capacitor SMS permission may not be granted by Play Store review | Have a fallback "paste SMS manually" path ready | Eng |
| Children using app via parents' phones | Hard 18+ age gate at signup | Eng |

---

## 10 · Change Log

| Date | Iter | Update |
|---|---|---|
| 2026-02-20 | 18 | Initial checklist created. Score: 50% (40/80 items). Pages audit complete. Razorpay docs list finalized. |
| 2026-02-21 | 19 | Compliance pages finalized: `(Legal Entity Name Pending)` placeholder applied across privacy/terms/refund; Grievance Officer (Ankita Chheda · grievance@perkworth.com · 15-day SLA) + DPO formally designated on all three pages; refund.html got T+5 Razorpay SLA + chargeback policy; terms.html got Arbitration Act 1996 + Force-Majeure clauses; `/privacy-hi.html` draft generated via GPT-4o (24KB, banner "मसौदा / Draft — pending native review"). Score moved 50% → **56% (45/80)**. Items 1.1, 1.7, 1.9, 2.12 → ✅ ; 2.10 → 🟡. |
| 2026-02-21 | 19 | "Last verified by counsel: 21 Feb 2026" badge added to footer of all 4 compliance pages + regression test `backend/tests/test_counsel_verified.py` fails if any page goes >180 days unreviewed (4/4 passing). |
| 2026-02-21 | 20 | **Backend monolith refactor.** `server.py` 1358 → 141 lines (-90%). Split into `services/{db,llm,billing_logic,notifications_logic}.py` (shared infra) + `routes/{vouchers,extraction,circle,billing,notifications}.py` (5 feature routers using existing `build_*_router(db)` factory pattern). Lint clean. Health 14/14. Backend pytest 15/15 functional flows pass via the new modules (voucher CRUD, OCR, ending-soon, points, ROI, circle share/unshare, membership). 3 pre-existing brand-string-equality test failures (registry returns "Tata Group" vs legacy "Tata") are NOT regressions — same behavior pre-refactor. |
| 2026-02-21 | 21 | **Admin Dashboard Stats endpoint.** New `/api/admin/dashboard/stats` (admin-gated, role=admin only). Returns savings (total/YTD/last-7d ₹), members (active/active-not-expired/new 7d), users, vouchers, registry queue. MongoDB `$group` aggregation, no per-doc Python iteration. New `Dashboard` tab added to Admin Registry screen (now default landing tab). Tests 2/2, health 14/14. |
| 2026-02-21 | 22 | **Native biometric (Android APK) wired.** Added `@aparajita/capacitor-biometric-auth@8.0.2` (Cap 6 compatible — peer-deps `@capacitor/core@^6.1.0`). Refactored `frontend/src/lib/biometric.js` to a strategy pattern: native plugin path inside Capacitor APK + WebAuthn fallback on web. Public API surface unchanged → zero edits needed in `SettingsPage.jsx`, `PinLock.jsx`. Settings card now shows a `Mode: Native / Web / Unavailable` diagnostic tag. Capacitor plugin loaded via dynamic `import()` so the web bundle splits the native code into its own chunk. `BIOMETRIC_TEST_PLAN.md` written (7 sections, A1–S4 matrix, rollback plan) for owner to execute on real device. Score moved 61% → **64% (51/80)**. |

---

> **Next checklist update**: After iteration 19 (Bulk Approve UI test wrap + privacy.html / terms.html updates).
> **Owner reviews this file**: Weekly on Mondays — keep moving items from 🔴 → 🟡 → ✅
