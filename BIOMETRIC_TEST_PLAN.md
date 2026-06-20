# Biometric Test Plan (Android APK)

> Owner: Ankita Chheda · Created 2026-02-21 · For iteration-22 Native Biometric.

This document is the **complete checklist** to verify the new native biometric flow on a physical Android device. Web (Chrome / PWA) biometric is already proven via WebAuthn; this plan only covers the new Capacitor-native path.

---

## 0 · Why this needs a real device

`@aparajita/capacitor-biometric-auth@8.0.2` (Capacitor 6 compatible — peer deps `@capacitor/core@^6.1.0`, `@capacitor/android@^6.1.0`) calls Android's `BiometricPrompt` API (AndroidX). It returns `isAvailable: false` on:

- Emulators without a configured fingerprint
- Devices in a corporate-MDM lockdown state
- Devices where the user has not enrolled at least one fingerprint / face at the OS level

A real Pixel / Samsung / OnePlus / Xiaomi with at least one fingerprint enrolled is the cheapest reliable test bed.

---

## 1 · Build the APK locally

Pre-requisites on your dev machine (one-time): Android Studio 2024.x · JDK 17 · Android SDK 34 · a registered keystore (path/alias already set in `capacitor.config.json`).

```bash
# In /app/frontend (NOT inside Emergent container — your local machine)
yarn install --frozen-lockfile
yarn build                              # produces dist/
npx cap sync android                    # copies dist/ + new plugin into android/
cd android
./gradlew assembleDebug                 # → app/build/outputs/apk/debug/app-debug.apk
# OR for release / Play Store track:
# ./gradlew bundleRelease                # → app/build/outputs/bundle/release/app-release.aab
```

If `npx cap sync android` complains the plugin wasn't registered, run:

```bash
npx cap update android
npx cap sync android
```

**Sanity check** — after `cap sync`, the file `android/app/capacitor.plugins.json` should list:

```json
{ "pkg": "@aparajita/capacitor-biometric-auth", "classpath": "...BiometricAuth" }
```

---

## 2 · Install on device

```bash
adb devices                              # confirm your phone is listed
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -s Capacitor:* BiometricAuth:* PerkWorth:*
```

---

## 3 · Test matrix

### Group A — Enrollment from Settings

| # | Pre-condition | Steps | Expected |
|---|---|---|---|
| A1 | At least 1 fingerprint enrolled at OS level | Profile → Settings → "Biometric unlock" card → tap **Enable biometric** | OS BiometricPrompt appears with "Enable biometric unlock for PerkWorth" reason. After successful fingerprint, toast `Biometric unlock enabled`. Card now shows **Disable biometric**. The grey "Mode:" tag below the description reads **`Native (Android/iOS BiometricPrompt)`**. |
| A2 | No biometric enrolled at OS level | Same as A1 | The Settings card MUST be hidden entirely (because `isBiometricAvailable()` returns false). User cannot trigger a flow that would fail. |
| A3 | User taps Enable, then dismisses the OS prompt | A1 steps, but dismiss the prompt | Toast `Biometric setup cancelled`. Card stays in disabled state. No state mutation. |
| A4 | Already enrolled → tap **Disable biometric** | Enroll first, then tap Disable | Toast `Biometric unlock disabled`. Card returns to Enable state. `localStorage.perk_biometric_v1` is removed (verify with `adb shell run-as com.perkworth.app cat …`). |

### Group B — Unlock on app launch

| # | Pre-condition | Steps | Expected |
|---|---|---|---|
| B1 | Biometric enrolled (A1 done) | Force-stop the app, relaunch | PinLock screen mounts → OS BiometricPrompt appears automatically once with reason "Unlock PerkWorth". On successful fingerprint, app unlocks directly into Home without showing the keypad. |
| B2 | Biometric enrolled, user dismisses prompt | B1 steps, dismiss the OS prompt | PIN keypad remains visible. User can enter the 4-digit PIN as fallback. The biometric button (fingerprint icon above the keypad) stays clickable for a second attempt. |
| B3 | Biometric enrolled, user fails 3 times | B1 steps, place wrong finger 3× | Android automatically locks BiometricPrompt for 30s, returns `authenticationFailed`. App should gracefully fall back to the PIN keypad (no crash, no infinite loop). |
| B4 | Biometric **not** enrolled | A4 first, then relaunch | App boots straight to the PIN keypad. No biometric button shown. No OS prompt fires. |
| B5 | User removes their OS-level fingerprint after enrolling in PerkWorth | Enroll in app (A1), then go to Android Settings → Security → remove all fingerprints → relaunch PerkWorth | App detects biometric unavailable, falls back to PIN. The Settings card is hidden until user re-enrolls at OS level. (No data loss — wallet stays intact.) |

### Group C — Multi-device & re-install scenarios

| # | Pre-condition | Steps | Expected |
|---|---|---|---|
| C1 | Two Android devices, same cloud account | Enroll biometric on Device 1, NOT on Device 2 | Device 1 prompts biometric, Device 2 prompts PIN. (Enrollment is per-device — this is intentional.) |
| C2 | Uninstall + reinstall on same device | A1, then uninstall app, then reinstall | Fresh install → no biometric enrollment carried over (localStorage wiped). User must re-enroll via Settings. |
| C3 | App update preserving data | A1, then `adb install -r` a new APK build | Biometric enrollment SHOULD persist (localStorage survives update). Unlock flow continues to work without re-enrollment. |

### Group D — Edge cases

| # | Test | Expected |
|---|---|---|
| D1 | Airplane-mode launch (no network) | Biometric prompt still works (it's OS-level, offline). After unlock, app loads cached data. |
| D2 | Device with face unlock instead of fingerprint | Same UX; OS shows face prompt instead. Toggle copy stays generic ("Face ID / Fingerprint"). |
| D3 | Working profile / dual-SIM Samsung device | Confirm the prompt uses the correct user space. |
| D4 | Android 10 (API 29 — lowest we support per `minWebViewVersion`) | Older `BiometricPrompt` UI may look different but flow should work. If the device only supports old `FingerprintManager` the plugin will report `isAvailable: false` — that's fine, PIN fallback kicks in. |

---

## 4 · Negative / security tests

| # | Test | Expected |
|---|---|---|
| S1 | Tap "Wipe data" (Settings → Danger Zone) while biometric is enabled | Wipes account + clears `perk_biometric_v1`. Next launch goes through full email + password sign-in. |
| S2 | Inspect `/data/data/com.perkworth.app/app_webview/Default/Local Storage/` (rooted device only) | `perk_biometric_v1` should contain ONLY `{ optedIn: true, backend: 'native', enrolledAt }`. **No fingerprint hash, no biometric template** — biometric data lives in the Android keystore, not in our app's storage. |
| S3 | Verify the app is not requesting `USE_BIOMETRIC` / `USE_FINGERPRINT` permission unnecessarily | `aapt dump permissions android/app/build/outputs/apk/debug/app-debug.apk` should show `android.permission.USE_BIOMETRIC` (added by the plugin) — and **nothing else extra**. |
| S4 | Logcat scan during unlock | `adb logcat \| grep -iE 'fingerprint\|biometric'` should show only `BiometricPrompt` system messages — no app-level logs that leak the enrolled status. |

---

## 5 · Pass criteria for the iteration

All **A**, **B**, **C** rows must pass on the test device.
**D1–D2** must pass; **D3–D4** are nice-to-have for v1 (document any deviations).
All **S1–S4** must pass.

When complete, paste the matrix back to the team in a single message — copy the table, mark each row ✅/❌, and attach a screenshot of the Settings card showing `Mode: Native (Android/iOS BiometricPrompt)`.

---

## 6 · Known constraints & follow-ups

- **iOS deferred** — per iter22 scope. Apple Developer account ($99/yr) required first.
- **Biometric step-up for sensitive actions** (Wipe data, change password) — proposed for iter23; not in this APK.
- **Capacitor 7 migration** — `capacitor-sms-inbox@1.3.0` warns about incorrect peer dep but doesn't block the build. Track upgrade in `ROADMAP.md`.
- **Play Store data-safety form** — the `USE_BIOMETRIC` permission must be declared in the Data Safety questionnaire as "Authentication". Add to LAUNCH_CHECKLIST item 6.7 when filing.

---

## 7 · Rollback plan

If a critical bug is found on the device:

1. Revert `frontend/src/lib/biometric.js` to the pre-iter22 commit (web-only WebAuthn).
2. `yarn remove @aparajita/capacitor-biometric-auth` to drop the plugin.
3. `npx cap sync android` and rebuild the APK.
4. Web users are unaffected — they continue using WebAuthn.

The strategy pattern means the public API of `biometric.js` does not change, so SettingsPage / PinLock work without any code changes during rollback.
