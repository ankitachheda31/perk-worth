# PerkWorth — iOS Build Guide (Xcode → .ipa)

> **Hardware required**: macOS Sonoma+ on Apple Silicon (M1/M2/M3) or recent Intel Mac.
> Builds will NOT run from this preview environment — these steps execute on your local Mac.

---

## 1. Prerequisites (one-time)

### 1.1 Install tools
```bash
# Homebrew (if missing)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Xcode 15+
xcode-select --install
# Then download Xcode 15+ from App Store (≈8 GB)

# CocoaPods (Capacitor uses it for iOS deps)
brew install cocoapods

# Node 20 + Yarn
brew install node@20
npm i -g yarn
```

### 1.2 Apple Developer enrollment
- Enroll at https://developer.apple.com/programs/ (₹8,300 / year)
- Create an **App ID** at https://developer.apple.com/account/resources/identifiers/list
  - Bundle ID: `com.perkworth.app`
  - Capabilities: Push Notifications, Associated Domains (for universal links)
- Create a **Distribution Certificate** + **App Store Provisioning Profile** in Xcode → Settings → Accounts → Manage Certificates

---

## 2. Clone and Build the Web App

```bash
git clone <your-repo> perk-worth
cd perk-worth/frontend

# Install JS deps
yarn install

# Build production web bundle (reads REACT_APP_BACKEND_URL from .env)
yarn build
# → produces /dist
```

## 3. Add the iOS Platform (first time only)

```bash
cd /path/to/perk-worth/frontend

# Generate native iOS project (creates ./ios)
npx cap add ios

# Sync web bundle + plugins into the iOS project
npx cap sync ios
```

This creates:
```
frontend/ios/
├── App/
│   ├── App.xcodeproj
│   ├── App.xcworkspace          ← OPEN THIS in Xcode (NOT .xcodeproj)
│   ├── App/
│   │   ├── Info.plist           ← bundle ID, version, permissions
│   │   ├── AppDelegate.swift
│   │   ├── Assets.xcassets/     ← app icons & launch images
│   │   └── Base.lproj/
│   │       └── LaunchScreen.storyboard
│   └── Podfile                  ← CocoaPods deps
└── capacitor.config.json        ← symlinked from frontend root
```

## 4. Configure Info.plist (iOS Permissions)

Open `ios/App/App/Info.plist` and add:

```xml
<!-- Camera (for voucher scan) -->
<key>NSCameraUsageDescription</key>
<string>PerkWorth uses the camera to scan vouchers, coupons and membership cards. Photos are used only for AI extraction and not stored.</string>

<!-- Photo library (alternative to camera) -->
<key>NSPhotoLibraryUsageDescription</key>
<string>PerkWorth needs access to import voucher screenshots from your photo library.</string>

<!-- Microphone (for voice search) -->
<key>NSMicrophoneUsageDescription</key>
<string>PerkWorth uses the microphone for voice search. Audio is processed on-device and never recorded.</string>

<!-- Speech recognition (voice search) -->
<key>NSSpeechRecognitionUsageDescription</key>
<string>PerkWorth uses on-device speech recognition to power voice search.</string>

<!-- Status bar style override (avoids white-on-cream) -->
<key>UIStatusBarStyle</key>
<string>UIStatusBarStyleDarkContent</string>
<key>UIViewControllerBasedStatusBarAppearance</key>
<false/>
```

> **Note**: iOS does NOT permit third-party apps to read SMS at all (Apple platform restriction). The SMS auto-scanner is Android-only. On iOS the app shows a "Camera + Manual entry + Paste SMS" experience.

## 5. Set App Icons & Launch Screen

### 5.1 Auto-generate from masters
```bash
cd frontend
# Drop your masters first:
cp /path/to/logo-1024.png resources/icon.png
cp /path/to/splash-2732.png resources/splash.png

# Generate all iOS sizes
npx @capacitor/assets generate --ios --iconBackgroundColor '#F4F1EC'

# Re-sync
npx cap sync ios
```

This populates `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with all 13 required sizes.

### 5.2 Launch Storyboard
- Open `ios/App/App/Base.lproj/LaunchScreen.storyboard` in Xcode → Interface Builder
- Set background colour to `#F4F1EC`
- Drag an Image View, set image = `Splash`, content mode = Aspect Fill

## 6. Set Bundle ID, Version, Team

In Xcode:
1. **Open** `ios/App/App.xcworkspace` (always the `.xcworkspace`, never the `.xcodeproj`)
2. Select the **App** target → **Signing & Capabilities** tab
3. Team: select your **Apple Developer** team
4. Bundle Identifier: `com.perkworth.app`
5. Provisioning Profile: select **Automatic** (Xcode-managed) or your manually created profile
6. Under **General** tab:
   - Display Name: `PerkWorth`
   - Version: `1.0.0` (semantic, user-visible)
   - Build: `1` (increment for every TestFlight upload)

## 7. Add Required Capabilities

In **Signing & Capabilities** → "+ Capability":
- **Push Notifications** (for expiry alerts)
- **Background Modes** → check "Remote notifications"
- **Associated Domains** → add `applinks:perkworth.app` (for universal links — optional)

## 8. Test on Simulator

```bash
# Open Xcode workspace
npx cap open ios

# In Xcode: select an iPhone 15 simulator → ⌘R
```

## 9. Test on a Physical Device

1. Plug your iPhone into the Mac via USB-C
2. In Xcode top bar: select your device from the run-destination dropdown
3. The first run will prompt: "Untrusted Developer" → on iPhone go to **Settings → General → VPN & Device Management → trust your developer profile**
4. ⌘R to install + launch

## 10. Build a Release .ipa

### 10.1 Archive
1. Top menu: **Product → Scheme → Edit Scheme**
2. Run → Build Configuration = **Release** (close)
3. Top menu: **Product → Destination → Any iOS Device (arm64)**
4. Top menu: **Product → Archive** (takes 2–5 min)

### 10.2 Distribute
When Archive finishes the **Organizer window** opens:
1. Select the new archive → **Distribute App**
2. Choose **App Store Connect** → Next
3. Upload → Next → Automatic signing → Next
4. Xcode signs the .ipa and uploads to App Store Connect (~5 min)

### 10.3 (Alternative) Export .ipa file locally
If you want the .ipa as a file (e.g. for AdHoc / Enterprise distribution):
- Distribute App → **Ad Hoc** or **Development**
- Choose where to save → produces `PerkWorth.ipa`

## 11. App Store Connect Submission

1. Go to https://appstoreconnect.apple.com/apps
2. Click **+** → New App
3. Fill:
   - Platform: iOS
   - Name: `PerkWorth — Voucher Wallet`
   - Primary Language: English (India)
   - Bundle ID: `com.perkworth.app`
   - SKU: `PO-IOS-001`
4. **App Information**:
   - Privacy Policy URL: `https://perkworth.app/privacy`
   - Subtitle: `AI wallet for Indian rewards`
5. **Pricing**: Free (or your chosen tier)
6. **Prepare for Submission**:
   - Upload screenshots from `STORE_ASSETS_CHECKLIST.md`
   - Promotional text + Description + Keywords → see `STORE_LISTING.md`
   - **Build**: pick the build you uploaded in §10.2
   - **App Review Information**: provide a demo PIN (`1234`) so reviewers can test
7. Submit for Review → typically 24–48 hours

## 12. TestFlight (Beta)

Same Archive flow as §10.2, but in App Store Connect:
- Go to **TestFlight** tab
- The uploaded build appears under "iOS Builds"
- Add internal testers (up to 100 Apple IDs) → instant access
- For external testers (up to 10 000) → Apple Beta App Review (~24 h) → invite via email or public link

## 13. Daily Dev Loop

```bash
# 1. Edit React code
# 2. Build web
cd frontend && yarn build
# 3. Sync into iOS project
npx cap sync ios
# 4. In Xcode press ⌘R
```

## 14. Common Issues

| Symptom | Fix |
|---|---|
| **`pod install` fails** | `sudo gem install cocoapods --pre` then `cd ios/App && pod repo update && pod install` |
| **WebView shows white screen** | Confirm `frontend/dist/index.html` exists. Re-run `yarn build && npx cap sync ios` |
| **Status bar shows white text** | In `Info.plist` set `UIStatusBarStyleDarkContent` (see §4) |
| **Razorpay checkout doesn't open in WebView** | iOS WKWebView allows external popups by default; confirm `Info.plist` has no restrictive `WKAppBoundDomains` |
| **Voice search fails** | Add `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription` (see §4) |
| **App rejected for missing privacy URL** | Host `PRIVACY_POLICY.md` at `https://perkworth.app/privacy` first |
| **Notification permission never asked** | Ensure Push Notifications capability is added (§7) and the app calls `Notification.requestPermission()` |

## 15. Universal Links (deep links → web)

To make `perkworth.app/invite/<token>` open the app on iPhones with the app installed:

1. **Apple Developer Console**: enable **Associated Domains** capability for `com.perkworth.app`
2. **Xcode → Signing & Capabilities**: add `applinks:perkworth.app`
3. **Host this JSON** at `https://perkworth.app/.well-known/apple-app-site-association` (no extension, served as `application/json`):

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.com.perkworth.app"],
        "components": [
          { "/": "/invite/*", "comment": "Family circle invites" },
          { "/": "/?ref=*",  "comment": "Referral landing" }
        ]
      }
    ]
  }
}
```

---

## 16. Final iOS Pre-launch Checklist

- [ ] App icons (all 13 sizes) under `AppIcon.appiconset/`
- [ ] Launch storyboard with logo + cream background
- [ ] `Info.plist` has all permission usage strings (Camera, Mic, Speech)
- [ ] Bundle ID `com.perkworth.app` matches App Store Connect record
- [ ] Distribution signing certificate + provisioning profile installed
- [ ] Privacy URL hosted at `perkworth.app/privacy`
- [ ] At least 3 phone screenshots at 1290×2796 px uploaded
- [ ] Demo PIN `1234` shared in App Review Information
- [ ] Build version incremented for every upload
- [ ] Archive → Distribute → App Store Connect → Submit for Review

You should have an Apple-reviewed live app within 48 hours of submitting.
