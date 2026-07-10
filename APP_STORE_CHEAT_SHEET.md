# PerkWorth — App Store Connect Cheat Sheet (iOS)

Every field App Store Connect asks you to fill, pre-filled with production-ready answers you can copy-paste. Follow top-to-bottom.

_Last updated: 2026-07 · Applies to App Store Connect UI as of Feb 2024+ requirements._

**Prerequisite (only you can do)**: Apple Developer Program enrollment — $99/yr — https://developer.apple.com/programs/. Business enrollment (with D-U-N-S) takes ~2 weeks; individual enrollment is same-day. Individual is fine to start; you can migrate later.

---

## 1. My Apps → Create New App

| Field | Value |
|---|---|
| Platforms | **iOS** (add macOS/tvOS later if desired) |
| Name | `PerkWorth` |
| Primary language | `English (India)` |
| Bundle ID | `com.perkworth.app` (must match Xcode project — matches Android too, good) |
| SKU | `perkworth-ios-2026` (internal use only) |
| User Access | Full Access |

---

## 2. App Information

| Field | Value |
|---|---|
| Subtitle (30 char) | `Voucher-first wallet · India` (28 chars ✓) |
| Category → Primary | **Finance** |
| Category → Secondary | **Lifestyle** |
| Content rights | **No, my app doesn't contain, show, or access 3rd-party content** (vouchers users add are their own data) |
| Age Rating | **4+** (see questionnaire below) |

### Age Rating Questionnaire
All answers: **None** except:
- Unrestricted Web Access: **No**
- Gambling: **No** (rewards are user-owned coupons)
- Digital Purchases: **Yes → Frequent/Intense: No** (₹99 subscription only)
- User Generated Content: **No** (Family Circle members only see what you invite them to; there's no chat/comments)

Expected result: **4+**.

---

## 3. Pricing and Availability

| Field | Value |
|---|---|
| Price | **Free** |
| Availability | **India only** (add more countries after 30 days of data) |
| Availability start date | Today |

---

## 4. In-App Purchases (Auto-Renewable Subscription)

Create ONE Auto-Renewable Subscription:

| Field | Value |
|---|---|
| Subscription Group Reference Name | `PerkWorth Pro` |
| Subscription Duration | **3 months** |
| Product ID | `perkworth_pro_quarterly` (identical to Play — safer for cross-platform receipt validation later) |
| Reference Name | `PerkWorth Pro (3 months)` |
| Price Tier | Custom → **₹99 INR** (Apple will localize automatically for other stores) |
| Family Sharing | **Off** (you already have Family Circle in-app; on-device sharing) |

**Localizations** — English (India):
- Display Name: `PerkWorth Pro`
- Description: `Unlimited voucher imports, best-card widget on every voucher, and Family Circle for up to 6 members. Auto-renews every 3 months. Cancel anytime.`

**Subscription Review**:
- Attach: `store_screenshots/ios_6_9in/02_wallet.png` (shows Pro features)
- Review Notes: `Auto-renewable subscription unlocks: (a) unlimited voucher imports, (b) Best Card widget, (c) Family Circle 6-member cap. To test, use the reviewer account (see App Review Information section) — it already has an active Pro membership; toggle to Free from Settings if needed for review.`

---

## 5. Privacy — Nutrition Label ⚠️

iOS's "Privacy" section = Apple's version of Data Safety. Different taxonomy, same intent. **Get this right first time — Apple audits.**

Answer at App Store Connect → App → App Privacy → Get Started.

### Q: Does this app collect data?
**Yes**

### Data Types Collected (tick these, leave rest unchecked)

#### Contact Info
- ✅ **Email Address** — Linked to user · Used for: App Functionality (account), Analytics, Product Personalization
- ✅ **Name** — Linked to user (optional at signup) · Used for: App Functionality
- ❌ Phone Number (not required at signup)
- ❌ Physical Address

#### User Content
- ✅ **Photos or Videos** — NOT Linked to user · Used for: App Functionality (OCR extraction, images processed in-memory then discarded)
- ✅ **Audio Data** — NOT Linked to user · Used for: App Functionality (Voice-to-voucher transcription, audio discarded after transcription)
- ✅ **Other User Content** — Linked to user · voucher codes, points balances, membership details · Used for: App Functionality

#### Identifiers
- ✅ **User ID** — Linked to user · Used for: App Functionality
- ❌ Device ID (we don't use IDFA)

#### Purchases
- ✅ **Purchase History** — Linked to user · Used for: App Functionality (membership status)

#### Financial Info
- ✅ **Other Financial Info** — Linked to user (voucher amounts, cashback estimates) · Used for: App Functionality

#### Usage Data
- ✅ **Product Interaction** — Linked to user · Used for: Analytics, App Functionality
- ✅ **Search History** — Linked to user (in-app brand search only) · Used for: App Functionality

#### Diagnostics
- ✅ **Crash Data** — Not Linked to user · Used for: App Functionality
- ✅ **Performance Data** — Not Linked to user · Used for: Analytics

### Data Types NOT Collected (leave all unchecked)
Location, Health & Fitness, Contacts, Sensitive Info, Browsing History, Messages (we read SMS on Android only — iOS doesn't have this permission), Other Data

### Tracking
- **Does this app use data to track the user?** → **No**
- (This means IDFA is not needed; ATT prompt won't appear; less friction on user first-launch.)

### Privacy Policy URL
`https://www.perkworth.com/privacy.html`

---

## 6. App Review Information

Critical section — reviewers spend an average of 15 minutes per app. Give them a fast, complete path.

### Contact Information
| Field | Value |
|---|---|
| First Name | (your name) |
| Last Name | (your name) |
| Phone Number | (your number with +91 country code) |
| Email | `support@perkworth.com` |

### Sign-in Required
**Yes** — provide demo account:
```
Email:    reviewer@perkworth.com
Password: PerkReview@2026
```

### Notes (paste verbatim)
```
DEMO ACCOUNT
  Email:    reviewer@perkworth.com
  Password: PerkReview@2026
  Set PIN:  1234 (any 4 digits work — locally set during first run)

FLOW TO REACH ALL FEATURES:
  1. Tap "Sign in" (bottom of the auth screen)
  2. Enter above credentials → tap "Sign in"
  3. Set a 4-digit PIN when prompted (e.g. 1234) → confirm same PIN again
  4. Skip walkthrough (top-right "Skip")
  5. Home screen: Pro membership active + 7 sample vouchers pre-loaded
  6. Tap "My Coupons" tab → tap any voucher → see "How to redeem" (voucher detail)
  7. Tap "Circle" tab → 3 sample family members already added
  8. Tap "My Points" tab → 3,240 sample points

PAYMENT REVIEW (Auto-Renewable Subscription):
  - The demo account already has an active Pro subscription for review purposes.
  - To trigger the ₹99 purchase flow: Settings → tap "Manage Pro" → tap "Renew" 
  - Use sandbox Apple ID for actual charge testing.

APP DOES NOT REQUIRE:
  - Location, Contacts, Health, HomeKit, HealthKit
  - Push notifications (opt-in only, not required for core flows)
  - Camera (used ONLY when user opts into OCR — photos are processed in-memory, never stored)
  - Microphone (used ONLY when user opts into Voice-add — audio transcribed then discarded)

NON-STANDARD FEATURES:
  - The app is a voucher wallet. Vouchers users add are their OWN data. We don't
    scrape 3rd-party merchant sites, don't display 3rd-party content, and don't
    facilitate transactions with merchants outside of showing the coupon code
    the user already possesses.
  - Family Circle shares individual vouchers (not the whole wallet) with
    invited members via email. Recipients only see what you explicitly share.
```

### Attachments
Attach: `store_screenshots/ios_6_9in/02_wallet.png` (helps reviewer visualize before installing)

---

## 7. Version Information (release-specific)

### What's New in This Version (4000 char max, first version)
```
Welcome to PerkWorth 1.0 — India's voucher-first wallet.

This first release includes:
  •  Auto-import vouchers via photo (OCR), SMS, or voice
  •  Best Card widget: see which credit card gives you the most cashback on each voucher
  •  Family Circle: selectively share individual vouchers with your spouse, parents, or kids
  •  Membership ROI Tracker: know exactly whether your ₹8,999 gym subscription is paying off
  •  Never miss an expiry: smart reminders 7, 3, and 1 day before

Ship, save, share. That's PerkWorth.

Questions? support@perkworth.com
```

### Copyright
`2026 PerkWorth Technologies`

### Trade Representative Contact (Korea only, leave blank)

### Routing App Coverage File
N/A (only for maps/routing apps)

### Version Release
- **Manually release this version** (safest for first launch — you flip the switch after review passes)

### Phased Release for Automatic Updates
- **Off** for v1.0. Turn on for subsequent versions to get a 7-day rollout.

---

## 8. App Store — Localizations

For first release, do only **English (India)**:

| Field | Value |
|---|---|
| **App Name** | `PerkWorth` |
| **Subtitle** (30 char) | `Voucher-first wallet · India` |
| **Promotional Text** (170 char) | `Vouchers, points, memberships & credit-card cashback stacking — all in one calm wallet. Never forget an expiry. Never overpay again.` (129 chars) |
| **Description** (4000 char) | See `PLAY_CONSOLE_CHEAT_SHEET.md` § 2.2 — the same text works for both stores. Just paste it in. |
| **Keywords** (100 char total, comma-separated, no spaces after commas) | `wallet,vouchers,cashback,rewards,coupons,points,membership,expiry,tracker,finance,india` |
| **Support URL** | `https://www.perkworth.com/support` (or `mailto:support@perkworth.com` if you don't have a support page yet) |
| **Marketing URL** | `https://www.perkworth.com` |
| **Privacy Policy URL** | `https://www.perkworth.com/privacy.html` |

---

## 9. Media (screenshots + preview video)

**Only 6.9" and 6.5" iPhone are REQUIRED as of Feb 2024.** Older sizes are auto-generated by Apple if you skip.

| Device Class | Required? | Path (in this repo) | Dimensions |
|---|---|---|---|
| **iPhone 6.9" display** (15/16 Pro Max) | ✅ **Required** | `store_screenshots/ios_6_9in/*.png` | 1320×2868 ✓ |
| **iPhone 6.5" display** (11 Pro Max / XS Max) | ✅ **Required** | `store_screenshots/ios_6_5in/*.png` | 1242×2688 ✓ |
| **iPhone 5.5"** (8 Plus) | Optional (auto-scaled) | `store_screenshots/ios_5_5in/*.png` | 1242×2208 ✓ |
| **iPad 12.9"** (Pro) | ✅ Required IF you check "iPad" as supported | `store_screenshots/ios_ipad_129/*.png` | 2048×2732 ✓ |
| **iPad 11"** | Auto-generated from 12.9" | – | – |
| **App Preview Video** | Optional | Skip for launch | – |

Upload order (Apple lets you set the order — first screenshot shown in search results):
1. `02_wallet.png` (hero — full wallet with stacking)
2. `01_home.png` (Pro membership + peace of mind)
3. `06_my_points.png` (ROI dashboard — dark green hero card)
4. `04_how_to_redeem.png` (guided steps)
5. `05_family_circle.png` (family sharing)
6. `03_add_voucher.png` (4 input methods)

### App Icon
- **App Store Icon (1024×1024)**: `store_screenshots/app_store_icon_1024x1024.png` ✓ (no rounded corners, no alpha — Apple rounds at render time)
- **In-app icons**: already in Xcode project via Capacitor at `frontend/ios/App/App/Assets.xcassets/AppIcon.appiconset/`. Xcode auto-generates all required sizes from a 1024×1024 source.

---

## 10. Xcode / Capacitor Build Steps (only step that needs your Mac)

Follow `/app/iOS_BUILD_GUIDE.md` for the full macOS setup. Summary:

```bash
# On your Mac, after cloning the repo:
cd frontend
yarn install
VITE_BACKEND_URL='https://orbit-vouchers.preview.emergentagent.com' \
  VITE_RAZORPAY_KEY_ID='rzp_live_TAtfKCD0rejxSC' \
  yarn build
npx cap sync ios
cd ios/App
pod install
open App.xcworkspace
```

In Xcode:
1. Select **Any iOS Device** target
2. **Product → Archive**
3. **Distribute App → App Store Connect → Upload**
4. Wait ~10 min for Apple's automated review
5. Return to App Store Connect → **TestFlight** or **App Store** → your build is now available
6. Submit for review after filling all metadata

---

## 11. TestFlight Setup (recommended before public submission)

Before public submission:
1. Add yourself + 3-5 friends as **Internal Testers** (up to 100, no email review from Apple, instant install)
2. Push a TestFlight-only build with real live Razorpay
3. Verify one full ₹99 payment loop on a real device
4. THEN submit for public App Store review

Turnaround: Apple's first review typically takes 24-72 hours. Rejection reasons on first submit are usually:
- Missing privacy explanation string in Info.plist (see Capacitor plugins — biometric plugin adds one automatically; camera+mic need explicit `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` — the iOS build guide covers these)
- Subscription not clearly disclosed on the paywall screen (we already show "Auto-renews every 3 months" in Settings)
- Missing "Restore Purchases" button (we have this in Settings → Manage Pro)

---

## 12. What I've Prepared vs What Needs You

| Task | Status |
|---|---|
| Bundle ID `com.perkworth.app` | ✅ Consistent with Android |
| App Store icon 1024×1024 | ✅ `store_screenshots/app_store_icon_1024x1024.png` |
| iPhone 6.9" screenshots (6 × 1320×2868) | ✅ `store_screenshots/ios_6_9in/*.png` |
| iPhone 6.5" screenshots (6 × 1242×2688) | ✅ `store_screenshots/ios_6_5in/*.png` |
| iPhone 5.5" screenshots (6 × 1242×2208) | ✅ `store_screenshots/ios_5_5in/*.png` |
| iPad 12.9" screenshots (6 × 2048×2732) | ✅ `store_screenshots/ios_ipad_129/*.png` |
| Privacy nutrition label answers | ✅ Section 5 above |
| Age rating answers → 4+ | ✅ Section 2 above |
| Store listing copy | ✅ Section 8 above |
| Subscription config | ✅ Section 4 above |
| App Review notes with reviewer creds | ✅ Section 6 above |
| Version release notes | ✅ Section 7 above |
| Capacitor iOS build guide | ✅ `iOS_BUILD_GUIDE.md` |
| **Apple Developer enrollment ($99/yr)** | 🔴 You |
| **macOS + Xcode 15+ on your machine** | 🔴 You (or hire a Mac freelancer for a one-time build for $50) |
| **First Xcode archive upload** | 🔴 You (30 min once Mac is set up) |
| **Fill App Store Connect using this doc** | 🔴 You (~45 min copy-paste) |

---

## 13. Cross-Store Consistency Checklist

Same product on both stores — keep aligned:

| Property | Google Play | App Store |
|---|---|---|
| App name | PerkWorth | PerkWorth ✓ |
| Package/Bundle ID | com.perkworth.app | com.perkworth.app ✓ |
| Subscription price | ₹99 / 3 months | ₹99 / 3 months ✓ |
| Product ID | perkworth_pro_quarterly | perkworth_pro_quarterly ✓ |
| Age rating | Everyone 3+ | 4+ ✓ (nearest Apple equivalent) |
| Primary category | Finance | Finance ✓ |
| Icon source | Same 1024×1024 | Same 1024×1024 ✓ |
| Screenshots aesthetic | Same UI shots | Same UI shots (different aspect) ✓ |
| Privacy policy URL | perkworth.com/privacy.html | perkworth.com/privacy.html ✓ |

---

**When you're ready**: keep this doc + Xcode + App Store Connect open on your Mac. Total time from Mac-ready to submission: ~90 min. Apple's review: 24-72 hours.
