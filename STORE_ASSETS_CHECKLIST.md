# Perk Orbit — Store Assets Checklist

> Brand colors: Cream `#F4F1EC` · Emerald `#064E3B` · Gold `#B48B36` · Ink `#0F172A`
> Typography: Cabinet Grotesk (logo / titles) · Manrope (body)

---

## 1. Master Source Files (create once)

| File | Spec | Purpose |
|---|---|---|
| `logo-master.svg` | Vector, 1024×1024 viewBox | Single source of truth for icon |
| `wordmark-master.svg` | Vector, 1024×256 | "Perk Orbit" with display font |
| `splash-master.svg` | Vector, 2732×2732 | Centered logo on cream background |
| `feature-graphic-master.svg` | Vector, 1024×500 | Hero banner with tagline |

> Place these in `/app/frontend/resources/` then run `npx @capacitor/assets generate` to auto-produce all the size variants below.

---

## 2. Android (Google Play Store)

### 2.1 App Icon
| Asset | Size | Format | Notes |
|---|---|---|---|
| Adaptive icon — foreground | 432×432 px | PNG with transparency | Logo with 25% safe padding |
| Adaptive icon — background | 432×432 px | PNG solid color | Cream `#F4F1EC` |
| Legacy launcher icon | 192×192 px | PNG | Combined foreground + background |
| Play Store hi-res icon | 512×512 px | PNG, 32-bit, no alpha | Required for upload |

### 2.2 Splash Screen
| Asset | Size | Notes |
|---|---|---|
| `splash.png` (portrait) | 2732×2732 px | Center-cropped on all devices |
| `splash-dark.png` (optional) | 2732×2732 px | Dark mode variant |

### 2.3 Play Store Listing Graphics
| Asset | Size | Required |
|---|---|---|
| **Feature Graphic** | 1024×500 px JPG/PNG | ✅ Yes |
| Phone screenshots (min 2, max 8) | 1080×1920 px or 1080×2400 px | ✅ Yes |
| 7-inch tablet screenshots | 1200×1920 px | Optional |
| 10-inch tablet screenshots | 1600×2560 px | Optional |
| Promo video (YouTube link) | 30s landscape MP4 | Optional but recommended |

### 2.4 Required Screenshots (suggested order)
1. **Home — Voucher-first wallet** showing Ending Soon countdown
2. **Add via AI Scan** (Camera + OCR result)
3. **Family Circle** sharing flow
4. **ROI Tracker** with break-even progress bar
5. **My Points** with ₹-value aggregation
6. **Membership ₹99** with referral benefit

---

## 3. iOS (Apple App Store)

### 3.1 App Icon (`AppIcon.appiconset/`)
| Size | Usage | Filename |
|---|---|---|
| 1024×1024 | App Store | `AppIcon-1024.png` (NO transparency, NO alpha) |
| 180×180 | iPhone @3x | `AppIcon-60@3x.png` |
| 120×120 | iPhone @2x | `AppIcon-60@2x.png` |
| 167×167 | iPad Pro @2x | `AppIcon-83.5@2x.png` |
| 152×152 | iPad @2x | `AppIcon-76@2x.png` |
| 76×76 | iPad @1x | `AppIcon-76.png` |
| 87×87 | iPhone Settings @3x | `AppIcon-29@3x.png` |
| 58×58 | iPhone Settings @2x | `AppIcon-29@2x.png` |
| 80×80 | iPhone Spotlight @2x | `AppIcon-40@2x.png` |
| 120×120 | iPhone Spotlight @3x | `AppIcon-40@3x.png` |
| 60×60 | iPhone Notification @2x | `AppIcon-20@2x.png` |
| 40×40 | iPhone Notification (anywhere) | `AppIcon-20.png` |

### 3.2 Launch Screen
- Build via Xcode Storyboard at `ios/App/App/Base.lproj/LaunchScreen.storyboard`
- Background: `#F4F1EC`
- Logo centered, 120×120 px
- "Perk Orbit" wordmark below, Cabinet Grotesk 24pt

### 3.3 App Store Listing
| Asset | Size | Required |
|---|---|---|
| App icon | 1024×1024 PNG (no alpha) | ✅ |
| iPhone 6.7" screenshots (iPhone 15 Pro Max) | 1290×2796 px | ✅ Min 3 |
| iPhone 6.5" screenshots (iPhone 14 Plus) | 1284×2778 px | Optional |
| iPhone 5.5" screenshots (iPhone 8+) | 1242×2208 px | Optional |
| iPad Pro 12.9" screenshots | 2048×2732 px | Required IF iPad supported |
| App Preview Video | up to 30s, .mov or .m4v | Optional |

### 3.4 Required iOS Screenshots
- Same 6 flows as Android, but rendered at iPhone 6.7" resolution (1290×2796)

---

## 4. Asset Production Workflow

```bash
# 1. Drop master files
cp logo-master.png /app/frontend/resources/icon.png
cp splash-master.png /app/frontend/resources/splash.png

# 2. Auto-generate all sizes
cd /app/frontend
npx @capacitor/assets generate \
  --android \
  --ios \
  --iconBackgroundColor '#F4F1EC' \
  --iconBackgroundColorDark '#0F172A' \
  --splashBackgroundColor '#F4F1EC' \
  --splashBackgroundColorDark '#0F172A'

# 3. Sync into native projects
npx cap sync
```

---

## 5. Store Metadata (other required fields)

### Google Play
- **App name** (50 chars): `Perk Orbit — Voucher Wallet`
- **Short description** (80 chars): `Save every voucher, point & membership in one premium wallet. Made in India.`
- **Full description**: see `STORE_LISTING.md`
- **Category**: Finance / Productivity
- **Tags**: voucher, wallet, cashback, loyalty, coupons, rewards, india
- **Content rating**: Everyone
- **Privacy policy URL**: `https://perkorbit.app/privacy` (host the doc from `PRIVACY_POLICY.md`)
- **Data safety form**: declare PIN (local), email/phone (local), payment (Razorpay), SMS (read-only on device)

### Apple App Store
- **App name** (30 chars): `Perk Orbit — Voucher Wallet`
- **Subtitle** (30 chars): `Save, share & redeem rewards`
- **Promotional text** (170 chars): `Stop losing vouchers in your inbox. AI-powered wallet for Indian households — track ROI, share with family, never miss an expiry.`
- **Description**: see `STORE_LISTING.md`
- **Keywords** (100 chars, comma-sep): `voucher,coupon,wallet,cashback,rewards,loyalty,points,offer,deal,membership,family,india`
- **Support URL**: `https://perkorbit.app/help`
- **Marketing URL** (optional): `https://perkorbit.app`
- **Primary category**: Finance
- **Secondary category**: Lifestyle

---

## 6. Pre-launch Checklist

- [ ] Master logo SVG finalized
- [ ] All icon sizes generated via `@capacitor/assets`
- [ ] 6 phone screenshots produced at correct resolutions for Android + iOS
- [ ] Feature graphic 1024×500 for Play Store
- [ ] Privacy policy hosted at `perkorbit.app/privacy`
- [ ] Support page hosted at `perkorbit.app/help`
- [ ] Demo video (30–60 s) showing Family Circle + AI Scan + ROI Tracker
- [ ] Google Play Sensitive Permissions form filed for SMS
- [ ] Apple App Privacy questionnaire completed in App Store Connect
