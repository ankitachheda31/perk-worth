# PerkWorth Android APK · Beginner-Friendly Build Guide

> One-command build for someone who's never touched Gradle. If you hit any error, jump to the **Troubleshooting** table at the bottom — every known failure has a copy-paste fix.

---

## 🎯 TL;DR — Build the APK in one command

From the **repo root** (the folder that contains `frontend/`, `backend/`, `scripts/`), run:

```bash
bash scripts/build-android-apk.sh
```

That's it. The script does everything: environment checks, deps, web build, Gradle wrapper upgrade, Capacitor sync, and APK compile. It prints the APK path at the end.

For a signed release build (AAB for Play Store):

```bash
bash scripts/build-android-apk.sh release
```

---

## 🔧 One-time prerequisites (do these BEFORE running the script)

The script will fail loudly with fix instructions if any of these are missing — but here's the checklist to save you a round-trip.

### 1️⃣ Install JDK 17 (NOT 21, NOT 8)

Capacitor 6 + Android Gradle Plugin 8.5 need **exactly JDK 17**. JDK 21 breaks the build (AGP 8.5 doesn't officially support it yet as of Feb 2026).

**macOS**:
```bash
brew install --cask zulu@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
# Add to your shell rc file (~/.zshrc or ~/.bashrc) to persist:
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt update && sudo apt install -y openjdk-17-jdk
echo 'export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64' >> ~/.bashrc
source ~/.bashrc
```

**Windows**:
1. Download Zulu 17 MSI: https://www.azul.com/downloads/?package=jdk#zulu (pick JDK 17 · MSI installer)
2. Install with default options
3. Set `JAVA_HOME` in System Properties → Environment Variables → New:
   - Variable: `JAVA_HOME`
   - Value: `C:\Program Files\Zulu\zulu-17\`
4. Reboot terminal.

Verify: `java -version` should print `openjdk version "17.0.x"`.

### 2️⃣ Install Android Studio + SDK 34

1. Download Android Studio: https://developer.android.com/studio
2. On first launch: it downloads SDK automatically. If not, open **Settings → SDK Manager → SDK Platforms** and tick:
   - ✅ Android 14.0 (**API 34**) ← required
   - ✅ Android 13.0 (API 33) ← optional but recommended
3. Under **SDK Tools** tick:
   - ✅ Android SDK Build-Tools 34.0.0
   - ✅ Android SDK Command-line Tools (latest)
   - ✅ Android SDK Platform-Tools
4. Click Apply — Android Studio downloads everything (~2 GB).

Set `ANDROID_HOME` (script will auto-detect on macOS/Linux, but confirm):

**macOS**:
```bash
echo 'export ANDROID_HOME="$HOME/Library/Android/sdk"' >> ~/.zshrc
source ~/.zshrc
```

**Linux**:
```bash
echo 'export ANDROID_HOME="$HOME/Android/Sdk"' >> ~/.bashrc
source ~/.bashrc
```

**Windows**:
- System Properties → Environment Variables → New user variable:
- Name: `ANDROID_HOME`
- Value: `C:\Users\<you>\AppData\Local\Android\Sdk`

### 3️⃣ Install Node.js 20 (NOT 24)

PerkWorth's `package.json` locks to Node 20 or 22. Node 24 has broken native binaries for some deps.

Easiest: install `nvm` and pin Node 20.

**macOS/Linux**:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Reopen your terminal, then:
nvm install 20
nvm use 20
```

**Windows** (use nvm-windows):
```bash
# Download & install nvm-windows: https://github.com/coreybutler/nvm-windows/releases
nvm install 20.11.1
nvm use 20.11.1
```

Verify: `node -v` should say `v20.x.x`.

---

## ▶️ Now run the build

```bash
cd /path/to/perkworth-repo   # replace with your actual folder
bash scripts/build-android-apk.sh
```

You'll see 7 numbered steps scroll by. Each prints ✔ on success.

**Expected total time**: ~4-8 minutes first run, ~90 seconds on re-run (Gradle caches).

At the end you get:

```
✔ 🎉 APK ready: /path/to/repo/frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on your phone: enable "Install unknown apps" for whichever app you use to transfer files (Google Drive, Files, AirDroid), copy the APK over, tap to install.

---

## 🚑 Troubleshooting

| Symptom | Fix |
|---|---|
| `Node X detected. Need Node 20 or 22` | Run `nvm use 20` (install nvm first — see prerequisites) |
| `Java X detected` | Run the JDK 17 install steps for your OS. Restart your terminal so `JAVA_HOME` is picked up. |
| `ANDROID_HOME not set` | Follow the `ANDROID_HOME` export step above. Restart terminal. |
| `Android SDK 34 platform not installed` | Android Studio → Settings → SDK Manager → tick Android 14 (API 34) → Apply. |
| `SDK location not found` in Gradle | Create file `frontend/android/local.properties` with `sdk.dir=/path/to/your/android/sdk` |
| Gradle download hangs at "Downloading gradle-8.7-all.zip" | Slow network; wait ~5 min OR pre-download from https://gradle.org/next-steps/?version=8.7&format=all and place it in `~/.gradle/wrapper/dists/gradle-8.7-all/` |
| `error: package android.support does not exist` | Old cached build. Delete `frontend/android/app/build/` and re-run. |
| `Execution failed for task ':app:mergeDebugResources'` on macOS | Xcode command-line tools missing: `sudo xcode-select --install` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` when sideloading | Uninstall the old APK first, then install the new one. Signing keys differ between debug builds. |
| Everything else | Copy the last 30 lines of the build error and paste in chat — I'll diagnose next turn. |

---

## 📦 What the script produces

| Build type | Output path | For |
|---|---|---|
| `debug` (default) | `frontend/android/app/build/outputs/apk/debug/app-debug.apk` | Sideloading on your phone for testing |
| `release` | `frontend/android/app/build/outputs/apk/release/app-release.apk` + `.../bundle/release/app-release.aab` | Play Store upload (needs signing config — see `MOBILE_BUILD.md`) |

---

## 🔁 When something goes wrong: reset button

Wipe and rebuild from scratch (nuclear option):

```bash
cd frontend
rm -rf android node_modules dist
yarn install
bash ../scripts/build-android-apk.sh
```

This forces `npx cap add android` to regenerate the whole Android project. You'll lose any custom edits inside `android/` — but the script re-applies the Gradle 8 templates for you.

---

## 🆘 Still stuck?

Paste in chat:
1. Output of `java -version`, `node -v`, and `echo $ANDROID_HOME`
2. The last 30 lines of the failing build output
3. Your OS (macOS/Linux/Windows) + version

I'll write you the exact next command to run.
