# Capacitor Android — Manifest patch instructions

After running `npx cap add android`, open `/app/frontend/android/app/src/main/AndroidManifest.xml` and **add these permissions inside `<manifest>` (above `<application>`)**:

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

## Google Play SMS Permissions Declaration (REQUIRED before publishing)

Google requires SMS permissions to have a strong product justification. When uploading to Play Console:

1. Go to **Policy → App content → Sensitive App Permissions → SMS or Call Log Permissions Form**
2. Select "**Default SMS handler** — No"
3. Core functionality: "**Read SMS messages to detect and auto-import e-commerce vouchers, loyalty points, and membership renewal alerts so users don't have to type them manually.**"
4. Provide:
   - Demo video showing the user (a) granting permission, (b) seeing an SMS auto-detected, (c) it being saved as a PerkWorth voucher
   - A link to your **Privacy Policy** (`/app/frontend/src/screens/Privacy.jsx` content — host this at `https://perkworth.app/privacy`)

## Privacy Policy excerpt (copy into your hosted page)

> PerkWorth uses Android's READ_SMS permission **exclusively** to scan incoming promotional SMS for voucher codes, expiry dates, and brand names so users can store them in their personal wallet. SMS contents are NOT stored on PerkWorth servers — only the extracted voucher fields (brand, code, expiry) are saved to your personal wallet. SMS contents leave your device only when you tap "Save to PerkWorth" on a detected voucher; we then send just that one message to our backend for GPT-4o extraction. No SMS is uploaded in bulk, used for advertising, or shared with third parties.

## Why this is necessary
- READ_SMS lets the app see all inbox messages → must declare core-use case
- RECEIVE_SMS lets the app listen for new incoming messages while running
- POST_NOTIFICATIONS (Android 13+) lets us show "Voucher detected" toasts
