#!/usr/bin/env bash
# PerkWorth — Native Android APK / AAB build helper.
#
# Run this ON YOUR LOCAL MACHINE (Mac/Windows/Linux with Android Studio installed),
# NOT inside the Emergent container. The container has no Android SDK / JDK.
#
# Usage (one-time setup):
#     ./scripts/android_build.sh setup
#
# Usage (every release):
#     ./scripts/android_build.sh release      # produces signed AAB for Play Store
#     ./scripts/android_build.sh debug        # produces debug APK for sideload
#
# Prereqs (do these once on your machine):
#   1. Android Studio (latest)             https://developer.android.com/studio
#   2. JDK 17 (Android Gradle Plugin 8+)   `brew install --cask temurin@17`  (Mac)
#   3. Node 18+ and Yarn                    `brew install node yarn`
#   4. Set ANDROID_HOME and JAVA_HOME in your shell (Android Studio shows the paths)
set -euo pipefail

cd "$(dirname "$0")/../frontend"

CMD="${1:-help}"

case "$CMD" in
  setup)
    echo "→ 1/4 yarn install (front-end deps)"
    yarn install --frozen-lockfile
    echo "→ 2/4 yarn build (Vite production bundle into ./dist)"
    yarn build
    if [ ! -d "android" ]; then
      echo "→ 3/4 npx cap add android (creates ./android Gradle project)"
      npx cap add android
    else
      echo "→ 3/4 android/ already exists — skipping cap add"
    fi
    echo "→ 4/4 npx cap sync android (copies web bundle + plugins → native project)"
    npx cap sync android
    echo
    echo "✓ Setup complete."
    echo "  • Generate a release keystore (one-time):"
    echo "      keytool -genkey -v -keystore perk-worth-release.jks \\"
    echo "        -keyalg RSA -keysize 2048 -validity 10000 -alias perkworth"
    echo "    Then move it to: frontend/android/app/perk-worth-release.jks"
    echo "  • Add the keystore password to frontend/android/keystore.properties (see ANDROID_BUILD.md)"
    echo "  • Open Android Studio:  npx cap open android"
    ;;

  debug)
    echo "→ Building DEBUG APK (sideload only — not for Play Store)"
    yarn build
    npx cap sync android
    cd android && ./gradlew assembleDebug
    OUT="app/build/outputs/apk/debug/app-debug.apk"
    echo
    echo "✓ Debug APK: frontend/android/$OUT"
    echo "  Sideload:  adb install -r frontend/android/$OUT"
    ;;

  release)
    echo "→ Building SIGNED RELEASE AAB (for Play Store)"
    if [ ! -f "android/app/perk-worth-release.jks" ]; then
      echo "✗ Missing keystore at android/app/perk-worth-release.jks"
      echo "  Generate with:"
      echo "    keytool -genkey -v -keystore perk-worth-release.jks \\"
      echo "      -keyalg RSA -keysize 2048 -validity 10000 -alias perkworth"
      exit 1
    fi
    if [ ! -f "android/keystore.properties" ]; then
      echo "✗ Missing android/keystore.properties (passwords). See ANDROID_BUILD.md §4."
      exit 1
    fi
    yarn build
    npx cap sync android
    cd android && ./gradlew bundleRelease
    OUT="app/build/outputs/bundle/release/app-release.aab"
    echo
    echo "✓ Release AAB: frontend/android/$OUT"
    echo "  Upload at: https://play.google.com/console → Production → Create new release"
    ;;

  open)
    echo "→ Opening Android Studio…"
    npx cap open android
    ;;

  help|*)
    echo "Usage: $0 {setup|debug|release|open}"
    echo
    echo "  setup    — one-time: install deps, build web bundle, generate android/ project"
    echo "  debug    — build a debug APK for sideloading"
    echo "  release  — build a signed AAB for Play Store upload"
    echo "  open     — open the android/ project in Android Studio"
    exit 0
    ;;
esac
