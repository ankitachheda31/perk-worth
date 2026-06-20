# PerkWorth — Mobile Build Guide

The web app is **Capacitor-ready**. The web build (`/app/frontend/dist`) is wrapped natively for Android & iOS using Capacitor 6.

## Prerequisites (one-time, local machine)
- **Node 20+** and **Yarn** (already installed in repo)
- **Android**: Android Studio (Hedgehog/Iguana+) with Android SDK 34, Build-Tools 34, and a configured AVD or physical device
- **iOS** (macOS only): Xcode 15+, CocoaPods (`brew install cocoapods`)

## File layout
```
/app/frontend
├── capacitor.config.json   ← appId, appName, splash, status bar config
├── package.json            ← @capacitor/* deps installed
└── (after first sync)
    ├── android/            ← generated native project
    └── ios/                ← generated native project (mac only)
```

## First-time setup (run locally — preview env can't build native binaries)

```bash
cd /app/frontend

# 1) Install (already done in repo)
yarn install

# 2) Build the web bundle
yarn build              # produces dist/

# 3) Add Android platform (one-time)
npx cap add android

# 4) Add iOS platform (one-time, macOS only)
npx cap add ios

# 5) Sync web bundle + plugins into native shells
npx cap sync
```

## Daily dev / release workflow

```bash
# After any frontend code change:
yarn build && npx cap sync

# Open Android Studio (build APK / Bundle / push to device)
npx cap open android

# Open Xcode (build IPA / push to device — macOS only)
npx cap open ios
```

## Build an APK quickly (Android)
1. `yarn build && npx cap sync`
2. `npx cap open android` — Android Studio launches
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. The signed (debug) APK is at `android/app/build/outputs/apk/debug/app-debug.apk`

For a **release** APK / AAB:
1. Generate a keystore (one-time): `keytool -genkey -v -keystore perk-worth-release.jks -alias perkworth -keyalg RSA -keysize 2048 -validity 10000`
2. Put it in `/app/frontend/android/app/perk-worth-release.jks`
3. Add signing config in `android/app/build.gradle` (Android Studio → Build → Generate Signed Bundle / APK guides you through this)

## App Identity
- **App ID**: `com.perkworth.app`
- **App Name**: `PerkWorth`
- **Splash**: Colour `#F4F1EC` (paper cream); 1.2 s
- **Status bar**: Dark text on cream background

## Backend URL (important)
The native shell loads the React app from `dist/index.html`. The web app reads `REACT_APP_BACKEND_URL` at **build time** from `/app/frontend/.env`. Before every `yarn build`:
- For local dev → use your laptop's LAN IP (e.g. `http://192.168.1.5:8001`)
- For staging / production → use the Emergent preview URL (current) or your final domain

> If you want the app to point to different URLs per environment, set `REACT_APP_BACKEND_URL` per build (`REACT_APP_BACKEND_URL=https://api.perkworth.com yarn build`).

## App icons & splash
- Drop a 1024×1024 PNG at `/app/frontend/resources/icon.png`
- Drop a 2732×2732 PNG at `/app/frontend/resources/splash.png`
- Run `npx @capacitor/assets generate --android` (and `--ios` on mac) to auto-generate all sizes

## Plugins included
- `@capacitor/core`, `@capacitor/cli` — Capacitor 6 runtime
- `@capacitor/android` — Android platform
- `@capacitor/splash-screen` — splash control
- `@capacitor/status-bar` — status-bar style/colour
- `@capacitor/app` — back-button / app lifecycle events

## Wiring the hardware back button (already implemented in web)
The web app already handles `popstate` via the back-stack hook in `App.jsx`. Capacitor's `App` plugin automatically maps the Android hardware back to `history.back()`, so it just works out of the box.

If you want to override (e.g. close a sheet first), add this to `App.jsx`:

```js
import { App as CapApp } from '@capacitor/app'

useEffect(() => {
  const sub = CapApp.addListener('backButton', ({ canGoBack }) => {
    if (notifsOpen) { setNotifsOpen(false); return }
    if (addOpen) { setAddOpen(false); return }
    if (stack.length > 1) pop()
    else CapApp.exitApp()
  })
  return () => sub.remove()
}, [notifsOpen, addOpen, stack.length])
```

## Razorpay on mobile
The current implementation uses Razorpay's **web checkout.js** loaded via `https://checkout.razorpay.com/v1/checkout.js`. It works inside Capacitor's WebView. For a **native** experience (better UX), swap to the `razorpay-capacitor` plugin later:

```bash
yarn add razorpay-capacitor
npx cap sync
```

## Play Store / App Store submission
- **Play Store**: Use the Android Studio "Generate Signed Bundle" flow to produce `app-release.aab`. Upload at https://play.google.com/console
- **App Store**: Use Xcode → Product → Archive → Distribute App → App Store Connect

## Done
- The web build is mobile-ready right now.
- Run the 5-step setup above on a machine with Android Studio / Xcode and you'll have an installable APK / IPA within minutes.
