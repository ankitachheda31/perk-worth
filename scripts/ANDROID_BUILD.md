# PerkWorth — Android APK / AAB build playbook

> **Where to run this:** on YOUR LOCAL machine (Mac / Windows / Linux) with Android Studio installed. The Emergent cloud container has no Android SDK, no JDK, and no Gradle, so it cannot build native APKs.

---

## 0 · Get the code onto your machine

Easiest path: use Emergent's "Save to GitHub" button (top-right of the chat composer), then on your Mac:

```bash
git clone git@github.com:<you>/<your-repo>.git perk-worth
cd perk-worth
```

Alternatively, download the project ZIP from Emergent and unzip it.

---

## 1 · One-time machine setup (~30 min)

| Tool | Install command (Mac) | Verify |
|---|---|---|
| **Android Studio** | https://developer.android.com/studio → drag to /Applications | `open -a "Android Studio"` |
| **JDK 17** | `brew install --cask temurin@17` | `java -version` → should print `17.x` |
| **Node 18+** | `brew install node` | `node -v` |
| **Yarn** | `corepack enable && corepack prepare yarn@stable --activate` | `yarn -v` |
| **adb** (optional, for sideload) | comes with Android Studio "SDK Platform Tools" | `adb version` |

**Set environment variables** (one-time — add to `~/.zshrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Reload: `source ~/.zshrc`

---

## 2 · First build (creates the `android/` Gradle project)

```bash
cd perk-worth
./scripts/android_build.sh setup
```

This runs:
1. `yarn install` — fetch React deps
2. `yarn build` — Vite production bundle → `frontend/dist/`
3. `npx cap add android` — generate `frontend/android/` Gradle project
4. `npx cap sync android` — copy web bundle + Capacitor plugins (incl. `capacitor-sms-inbox`) into the native project

After this, **commit `frontend/android/`** so future builds are deterministic.

---

## 3 · Generate the release keystore (ONE TIME)

> ⚠️ Keep this file **offline and backed up**. Losing it means you can never publish updates to the same app on Play Store again.

```bash
cd frontend
keytool -genkey -v \
  -keystore perk-worth-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias perkworth
```

You'll be prompted for:
- **Keystore password** (pick a strong one, e.g. 24-char alphanumeric)
- **Key password** (use the same as keystore for simplicity)
- Your name, org unit (PerkWorth Technologies Pvt. Ltd.), city (Mumbai), state (MH), country code (IN)

Move it into the android project:

```bash
mv perk-worth-release.jks android/app/
```

**Back up the .jks file** to 1Password / Google Drive / a USB key — never commit it to git.

---

## 4 · Wire keystore passwords into Gradle (one time)

Create `frontend/android/keystore.properties`:

```properties
storeFile=perk-worth-release.jks
storePassword=YOUR_KEYSTORE_PASSWORD
keyAlias=perkworth
keyPassword=YOUR_KEY_PASSWORD
```

Then add a `signingConfigs` block to `frontend/android/app/build.gradle` (Android Studio will show you where — search for `android {` near the top):

```gradle
// add NEAR TOP of build.gradle, BEFORE the android { } block
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ... existing config ...
    signingConfigs {
        release {
            storeFile file("../" + (keystoreProperties['storeFile'] ?: 'perk-worth-release.jks'))
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

**Add `keystore.properties` to your global `.gitignore`** — never commit passwords:

```bash
echo "frontend/android/keystore.properties" >> .gitignore
echo "frontend/android/app/perk-worth-release.jks" >> .gitignore
```

---

## 5 · Add the SMS permissions (already pre-wired)

The `capacitor-sms-inbox` plugin auto-injects these into `AndroidManifest.xml` during `cap sync`. After §2, verify `frontend/android/app/src/main/AndroidManifest.xml` contains:

```xml
<uses-permission android:name="android.permission.READ_SMS" />
<uses-permission android:name="android.permission.RECEIVE_SMS" />
```

If they're missing, add them manually inside `<manifest>` and re-run `npx cap sync android`.

> 🛑 **Play Store policy**: READ_SMS apps must submit a Permissions Declaration form explaining why you read SMS. Use this template:
>
> > PerkWorth's voucher-scan feature reads commercial / promotional SMS (Swiggy, Myntra, Tata Neu) to auto-extract coupon codes and save users from manual entry. Bank OTPs, personal chats, and contacts are NEVER read — only messages matching shopping keywords (₹ off, voucher, code, expires, points, loyalty). No SMS content is uploaded to our servers — extraction happens on-device, only the parsed voucher (code + expiry) is sent to our backend after the user taps Save. Verified by independent security audit available on request.

---

## 6 · Every-time release build

```bash
./scripts/android_build.sh release
```

This produces a signed AAB at:
```
frontend/android/app/build/outputs/bundle/release/app-release.aab
```

Upload at https://play.google.com/console → your app → **Production → Create new release** → drag the AAB.

For internal testing / sideload:
```bash
./scripts/android_build.sh debug
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 7 · Bumping the version

Edit `frontend/android/app/build.gradle`:

```gradle
android {
    defaultConfig {
        applicationId "com.perkworth.app"
        versionCode 2          // ← bump by 1 every Play upload (integer)
        versionName "1.0.1"    // ← user-visible string (semver)
    }
}
```

---

## 8 · Troubleshooting

| Symptom | Fix |
|---|---|
| `JAVA_HOME is not set` | `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` on Mac |
| `SDK location not found` | Open Android Studio once → it auto-creates `local.properties` in `android/` |
| `Execution failed for task ':capacitor-sms-inbox:compileReleaseJavaWithJavac'` | Run `cd frontend/android && ./gradlew clean` then re-build |
| App opens but can't reach backend | Check `frontend/.env` has the correct `REACT_APP_BACKEND_URL` BEFORE `yarn build` |
| SMS permission never prompts | Plugin only prompts on first call; clear app data in Settings → Apps → PerkWorth → Storage → Clear data |

---

## 9 · Play Store checklist before submitting

- [ ] App icon (`android/app/src/main/res/mipmap-*/ic_launcher.png`) — generate with https://icon.kitchen
- [ ] Splash screen (`android/app/src/main/res/drawable*/splash.png`)
- [ ] 2 phone screenshots minimum (1080×1920) + 2 tablet (optional)
- [ ] Privacy policy URL: `https://perk-worth.netlify.app/#privacy` ✓
- [ ] Refund / cancellation URL: `https://perk-worth.netlify.app/#refund` ✓
- [ ] Data Safety form (Play Console → Policy) — declare: Email + Voucher data, encrypted in transit, user-deletable
- [ ] Permissions Declaration form for `READ_SMS` (template in §5 above)
- [ ] App content rating (IARC questionnaire) — likely "Everyone"
- [ ] In-app purchase: Razorpay Web Checkout is fine for Play Store (utility apps qualify for non-IAP billing for subscription value-added services)
