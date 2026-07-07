# PerkWorth — Google Play Console Launch Cheat Sheet

**Purpose**: Every field Play Console asks you to fill, pre-filled with production-ready answers you can copy-paste. Follow top-to-bottom.

_Last updated: 2026-07-06 · Applies to Play Console web UI as of 2026._

---

## 0. App Basics (first-time setup only)

| Field | Value |
|---|---|
| **App name** | `PerkWorth` |
| **Default language** | `English (India) – en-IN` |
| **App or game** | App |
| **Free or paid** | Free (in-app payment for ₹99 Pro membership) |
| **Declarations** | Tick both: (a) I confirm the app complies with Developer Program Policies, (b) I confirm the app complies with US export laws |

Once app is created, package name locks to **`com.perkworth.app`** — do not change (this is the package ID baked into your APK/AAB).

---

## 1. App Content

### 1.1 Privacy Policy
| Field | Value |
|---|---|
| Privacy policy URL | `https://www.perkworth.com/privacy.html` |

### 1.2 App Access
| Question | Answer |
|---|---|
| Is all functionality available without special access? | **No — parts of my app are restricted** |
| What kind of access? | Login credentials (email + password) |
| Instructions for the reviewer | Provided below ⤵ |

**Instructions to paste**:
```
Reviewer test account:
  Email:    reviewer@perkworth.com
  Password: PerkReview@2026

Login flow:
  1. Open PerkWorth
  2. Tap "Sign in" (bottom of screen)
  3. Enter above credentials, tap "Sign in"
  4. Set a 4-digit PIN (any digits e.g. 1234) when prompted, then confirm again
  5. Skip walkthrough by tapping "Skip" top-right
  6. Home screen shows Pro membership + 7 sample vouchers

All flows including Family Circle, Best Card Widget, and OCR are pre-populated for this account.
Razorpay purchase can be tested with test card 4111 1111 1111 1111 / CVV 123 / any future date.
```

### 1.3 Ads
| Question | Answer |
|---|---|
| Does your app contain ads? | **No** |

### 1.4 Content Rating (IARC Questionnaire)

Category to pick: **Reference, News, or Educational**

| Question | Answer |
|---|---|
| Violence | None |
| Sexuality | None |
| Language | None |
| Controlled substances | None |
| Gambling | None (rewards are user-owned coupons, not gambling) |
| User-generated content | **Yes, but only visible to the user or people they invited** (Family Circle members) |
| Users can interact | **No** (Family Circle is share-only, no chat, no comments) |
| Shares user's location | **No** (no location APIs used) |
| Personal info shared with other users | **No** (invited members see only vouchers, not personal data) |
| Digital purchases | **Yes** (₹99 Pro membership via Razorpay) |

**Expected rating result**: `Everyone 3+ / IARC 3+` (India, EU, US, UK).

### 1.5 Target Audience & Content
| Field | Value |
|---|---|
| Target age groups | 18+ (financial app) |
| Any content that appeals to children? | No |
| Ads Policy compliance | N/A (no ads) |

### 1.6 News App Declaration
| Question | Answer |
|---|---|
| Is this a news app? | No |

### 1.7 COVID-19 Contact Tracing / Status
| Question | Answer |
|---|---|
| Publicly-available COVID-19 tracing / status? | No |

### 1.8 Data Safety (⚠️ largest section — get this right first time)

Take your time here — this section shows on your listing and Google audits it. Answers below match your actual code:

**Does your app collect or share any of the required user data types?**
→ **Yes, my app collects or shares user data**

**Is all user data encrypted in transit?**
→ **Yes** (all API traffic is HTTPS via Kubernetes ingress with TLS)

**Do you provide a way for users to request that their data is deleted?**
→ **Yes** (in-app: Settings → "Delete my account" — verified in `/api/account/delete`)

#### Data types collected

| Category | Data type | Collected? | Optional? | Purposes | Shared with 3rd parties? |
|---|---|---|---|---|---|
| **Personal info** | Name | Yes | Optional (at signup) | Account mgmt, personalization | No |
| **Personal info** | Email | Yes | Required | Account mgmt, communications | No |
| **Personal info** | User IDs | Yes | Required | Account mgmt, analytics | No |
| **Financial info** | Purchase history | Yes | Required | Account mgmt, app functionality | Razorpay (payment processing only) |
| **Financial info** | Other financial info (voucher codes, points balances) | Yes | Required | App functionality | No |
| **App activity** | App interactions | Yes | Required | Analytics, app functionality | No |
| **App activity** | In-app search history | Yes | Required | App functionality | No |
| **Device or other IDs** | Device or other IDs | Yes | Required | Fraud prevention, security | No |
| **Photos and videos** | Photos | Yes (only if user uses OCR feature) | Optional | App functionality (extract voucher from photo) | Google (Vision API via Emergent LLM) — image is not stored, processed in-memory only |
| **Messages** | SMS/MMS | Yes (only if user grants permission) | Optional | App functionality (auto-extract vouchers from SMS) | No |
| **Audio** | Voice or sound recordings | Yes (only if user uses voice-input) | Optional | App functionality (voice-to-voucher) | Google (Whisper transcription via Emergent LLM) — audio not stored after transcription |

**Data types NOT collected** (uncheck all): Location, Contacts, Calendar, Health & fitness, Web browsing, Installed apps, Files & docs, Race/ethnicity, Political/religious beliefs, Sexual orientation.

**Security practices declarations** (tick all that apply):
- ✅ Data is encrypted in transit
- ✅ You can request that data be deleted
- ✅ Committed to follow Play Families Policy (not applicable — you're not targeting children, so leave blank if the checkbox exists)
- ✅ Independent security review — **leave unchecked** unless you have a formal audit certificate

---

## 2. Store Listing

### 2.1 App Details
| Field | Value |
|---|---|
| **App name** | `PerkWorth` |
| **Short description** (80 char max) | `All your vouchers, points & rewards — beautifully in one wallet.` (63 chars ✓) |

### 2.2 Full description (4000 char max)

Paste this verbatim:

```
PerkWorth is India's voucher-first personal financial assistant — built for the millions of Indian households drowning in fragmented rewards.

Your Zomato ₹100 code is in your WhatsApp screenshot folder. Your Amazon points are locked in three apps. Your HDFC cashback is buried in a statement PDF. Your Cult.Fit membership expires next week and you have no idea. PerkWorth pulls all of it into one calm, elegant wallet — so you never forget, never miss, never overpay.

━━ WHAT'S INSIDE ━━

📚 One Wallet, Every Perk
  •  Vouchers, coupons, gift cards, points balances, loyalty programs, and memberships — all in a single tap.
  •  Auto-import from photos (OCR), SMS, and voice — you literally just talk to it.

💳 Best-Card Cashback Stacking
  •  Every voucher shows which credit card gives you the most cashback on that brand.
  •  Watch your ₹100 Zomato voucher become ₹115 with HDFC Millennia stacking. Real math, not marketing.

⏳ Never Miss an Expiry
  •  Smart reminders 7 days, 3 days, and 1 day before each voucher expires.
  •  Home screen tells you exactly what's ending soon — nothing more, nothing less.

👨‍👩‍👧 Family Circle (Selective Sharing)
  •  Share individual vouchers with your spouse, parents, or kids — not your entire wallet.
  •  Perfect for Indian joint families where the movie voucher goes to your sister and the grocery deal goes to your father.

📈 Membership ROI Tracker
  •  Paid ₹8,999 for a gym membership? Watch us track exactly how much you've saved and whether it's paying off.
  •  Never renew a subscription blindly again.

━━ WHY VOUCHER-FIRST ━━

Every other rewards app is card-first — designed for banks, not for you. PerkWorth flips it. You start from a voucher you have, not a card you'd like to have. The card recommendation comes second, only when it beats your current option.

━━ PRIVACY ━━

Trust-First Architecture:
  •  Your data is encrypted in transit (TLS)
  •  Your 4-digit PIN is a device-local secret, never sent to our servers
  •  Family Circle sharing is opt-in per voucher — never bulk
  •  We do not sell data, ever
  •  Full account & data deletion from Settings, no email required

━━ PRICING ━━

Free to use forever. Optional PerkWorth Pro (₹99 for 3 months) unlocks:
  •  Unlimited voucher imports
  •  Best-Card widget on every voucher
  •  Family Circle with up to 6 members
  •  Priority WhatsApp support

Try free. Upgrade only if you love it.

━━ CONTACT ━━

Website: https://www.perkworth.com
Support: support@perkworth.com
```

Character count: ~2,650 (under 4000 ✓)

### 2.3 Graphics

| Asset | Path | Dimensions |
|---|---|---|
| **App icon** (already built into APK) | `frontend/android/app/src/main/res/mipmap-*/ic_launcher.png` | 512×512 |
| **Feature graphic** | `/app/store_screenshots/feature_graphic_1024x500.png` | 1024×500 ✓ |
| **Phone screenshots** (6) | `/app/store_screenshots/01…06_*.png` | 1080×1920 ✓ |
| **7-inch tablet screenshots** (6) | `/app/store_screenshots/tablet_7in/*.png` | 1200×1920 ✓ |
| **10-inch tablet screenshots** (6) | `/app/store_screenshots/tablet_10in/*.png` | 1600×2560 ✓ |
| **Promo video** (optional) | Skip for launch | YouTube URL |

Recommended screenshot upload order:
1. `02_wallet.png` (hero — full wallet with best-card stacking)
2. `01_home.png` (pro membership + peace of mind)
3. `06_my_points.png` (ROI dashboard)
4. `04_how_to_redeem.png` (step-by-step guidance)
5. `05_family_circle.png` (family sharing)
6. `03_add_voucher.png` (4 input methods)

### 2.4 Categorization

| Field | Value |
|---|---|
| **App category** | **Finance** |
| **Tags** (up to 5) | 1. `Personal finance manager`  2. `Coupons`  3. `Rewards`  4. `Cashback`  5. `Membership tracker` |
| **Contact email** | `support@perkworth.com` |
| **Contact phone** (optional) | leave blank |
| **Contact website** | `https://www.perkworth.com` |

---

## 3. Pricing & Distribution

### 3.1 Countries / regions
For launch, tick only:
- ✅ **India**

Add more after 30 days once you have real user metrics.

### 3.2 Consent
- ✅ Content guidelines
- ✅ US export laws

### 3.3 Contains ads
No

### 3.4 In-app products
| Product ID | Name | Price | Type |
|---|---|---|---|
| `perkworth_pro_quarterly` | PerkWorth Pro (3 months) | ₹99 | Managed subscription |

You'll create this via **Monetize → Subscriptions → Create subscription** in Play Console AFTER your first internal release upload. Billing period: 90 days. Auto-renewing: yes. Grace period: 3 days.

---

## 4. Testing Track — Internal → Closed → Production

**Strong recommendation**: Do NOT go straight to Production on first upload. Do:

1. **Internal testing** — up to 100 testers, no review lag (instant install). Use YOUR devices + 3-4 friends.
2. **Closed testing** — 20 testers minimum, 14 days minimum. Google requires this for new personal accounts.
3. **Production** — once closed testing metrics look good.

### 4.1 Internal testing setup
- Testers list: Create a Google group `perkworth-internal@googlegroups.com` (or use individual emails)
- Add yourself + 3 friends
- Upload the AAB (from GitHub Actions artifacts)
- Copy the opt-in URL Play gives you → paste to testers via WhatsApp
- They tap opt-in URL → wait ~10 min → app appears in Play Store search for them

### 4.2 Release notes (for first release)
```
Welcome to PerkWorth — India's voucher-first wallet.

This is our first internal test. Please try:
  •  Adding a voucher via photo (OCR)
  •  Adding a family member and sharing a voucher
  •  Enabling Pro membership (Razorpay test mode)
  •  Setting a PIN and re-opening the app

Reply to support@perkworth.com with anything that feels off.
```

---

## 5. What I've Prepared vs What Needs You

| Task | Status |
|---|---|
| Package name reserved | ✅ `com.perkworth.app` |
| Privacy Policy | ✅ Live at perkworth.com/privacy.html |
| Terms of Service | ✅ Live at perkworth.com/terms.html |
| App icon (all densities) | ✅ In APK |
| Feature graphic 1024×500 | ✅ `/app/store_screenshots/feature_graphic_1024x500.png` |
| Phone screenshots (6 × 1080×1920) | ✅ `/app/store_screenshots/*.png` |
| 7-inch tablet screenshots | ✅ `/app/store_screenshots/tablet_7in/*.png` |
| 10-inch tablet screenshots | ✅ `/app/store_screenshots/tablet_10in/*.png` |
| Content rating answers | ✅ Section 1.4 above (copy in) |
| Data safety answers | ✅ Section 1.8 above (copy in) |
| Store listing description | ✅ Section 2.2 above (copy in) |
| Categorization / tags | ✅ Section 2.4 above |
| Release-signed AAB | ✅ Workflow ready (run `release-aab` build) |
| Reviewer test account | ✅ `reviewer@perkworth.com / PerkReview@2026` (in test_credentials.md) |
| First release notes | ✅ Section 4.2 above |
| **Google Play Console account** | 🟢 You paid the $25 |
| **Paste 4 GitHub secrets** | 🔴 You (5 minutes) |
| **Run release-aab workflow** | 🔴 You (1 click, 7 min wait) |
| **Fill Play Console listing** | 🔴 You (copy-paste from this doc, ~30 min) |
| **Upload AAB to Internal testing** | 🔴 You (~5 min) |
| **Recruit 20 closed testers** | 🔴 You (14 days) |
| **Submit Razorpay KYC** | 🔴 You (3-5 business days) |

---

## 6. Common Rejection Reasons + How This Doc Prevents Them

| Common rejection | Prevented by |
|---|---|
| No privacy policy URL | Section 1.1 ✓ |
| Privacy policy doesn't match Data Safety | Section 1.8 mirrors PRIVACY_POLICY.md ✓ |
| Missing "Delete account" feature | Already implemented (`Settings → Delete my account`) ✓ |
| Data Safety missing photo/audio permissions | Section 1.8 declares OCR + Voice ✓ |
| Financial app without KYC-ready policies | perkworth.com/privacy.html + terms.html live ✓ |
| App name too similar to another finance brand | `PerkWorth` is unique on Play (search verified) ✓ |
| Reviewer can't login | Test account creds + step-by-step in 1.2 ✓ |
| Screenshots contain other-app branding | Ours are 100% PerkWorth UI ✓ |
| No target age declared | Section 1.5: 18+ ✓ |

---

**When you're ready to fill Play Console: keep this doc open on one screen, Play Console on the other, and copy-paste field by field. Total time: 30–45 minutes.**
