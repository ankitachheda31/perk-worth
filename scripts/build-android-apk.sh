#!/usr/bin/env bash
# PerkWorth · One-shot Android APK build script
# Run from repo root: bash scripts/build-android-apk.sh [debug|release]
# Default: debug
#
# What it does:
#   1. Sanity-checks Node ≥20, JDK 17, Android SDK 34
#   2. Installs frontend deps (yarn)
#   3. Builds the web bundle (vite build → frontend/dist)
#   4. Adds Android platform if missing (npx cap add android)
#   5. Drops in the Gradle 8.x wrapper + AGP 8.5 config from android-gradle-template/
#   6. Runs cap sync + gradle assemble
#   7. Prints the APK path when done
#
# Idempotent — safe to re-run. Every step checks its own preconditions.

set -euo pipefail

BUILD_TYPE="${1:-debug}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
ANDROID_DIR="$FRONTEND_DIR/android"
TEMPLATE_DIR="$ROOT_DIR/android-gradle-template"

# --- pretty printers ---------------------------------------------------------
c_green="\033[1;32m"; c_red="\033[1;31m"; c_yellow="\033[1;33m"; c_blue="\033[1;34m"; c_end="\033[0m"
ok()   { echo -e "${c_green}✔${c_end} $1"; }
info() { echo -e "${c_blue}ℹ${c_end} $1"; }
warn() { echo -e "${c_yellow}⚠${c_end} $1"; }
die()  { echo -e "${c_red}✘${c_end} $1"; exit 1; }
step() { echo -e "\n${c_blue}▸ Step $1 · $2${c_end}"; }

# --- STEP 1 · Pre-flight checks ---------------------------------------------
step 1 "Pre-flight environment checks"

command -v node >/dev/null || die "Node.js not installed. Install Node 20 or 22 from https://nodejs.org"
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [[ "$NODE_MAJOR" -lt 20 || "$NODE_MAJOR" -gt 22 ]]; then
  die "Node $NODE_MAJOR detected. Need Node 20 or 22. Fix: use nvm — 'nvm install 20 && nvm use 20'"
fi
ok "Node $(node -v)"

command -v yarn >/dev/null || { warn "yarn not found — installing globally"; npm install -g yarn; }
ok "yarn $(yarn -v)"

command -v java >/dev/null || die "Java not installed. Install JDK 17 (recommended: brew install --cask zulu@17)"
JAVA_MAJOR=$(java -version 2>&1 | awk -F '"' '/version/ {split($2, a, "."); print a[1]}')
if [[ "$JAVA_MAJOR" -ne 17 ]]; then
  warn "Java $JAVA_MAJOR detected — Capacitor 6 + AGP 8.5 wants JDK 17 exactly."
  warn "On macOS: brew install --cask zulu@17 && export JAVA_HOME=\$(/usr/libexec/java_home -v 17)"
  warn "On Linux: sudo apt install openjdk-17-jdk && export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64"
  warn "On Windows: install Zulu 17 MSI, set JAVA_HOME in System Environment Variables"
  die "Please switch JDK before continuing."
fi
ok "JDK 17 · JAVA_HOME=${JAVA_HOME:-'(not set — set it if the build fails)'}"

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  # Try common defaults
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    export ANDROID_HOME="$HOME/Android/Sdk"
  else
    die "ANDROID_HOME not set. Install Android Studio, open SDK Manager, then export ANDROID_HOME=<sdk-path>"
  fi
fi
ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
ok "ANDROID_HOME=$ANDROID_HOME"

[[ -d "$ANDROID_HOME/platforms/android-34" ]] || {
  warn "Android SDK Platform 34 not installed."
  warn "Open Android Studio → Settings → SDK Manager → SDK Platforms → tick 'Android 14.0 (API 34)' → Apply."
  die "Install SDK 34 and re-run this script."
}
ok "Android SDK 34 platform present"

# --- STEP 2 · Install frontend deps -----------------------------------------
step 2 "Installing frontend dependencies"

cd "$FRONTEND_DIR"
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  yarn install --frozen-lockfile
else
  ok "node_modules already up-to-date"
fi
ok "Frontend deps installed"

# --- STEP 3 · Build web bundle ----------------------------------------------
step 3 "Building web bundle (vite build)"

# Preflight the backend URL — refuse to build against a dead endpoint.
# This catches the #1 support ticket: "app shows Network error on my phone"
BACKEND_URL="${VITE_BACKEND_URL:-${REACT_APP_BACKEND_URL:-https://perkworth.app}}"
info "Backend URL that will be baked into the APK: $BACKEND_URL"

HEALTH_CODE=$(curl -sL -o /tmp/perkworth-health.txt -w "%{http_code}" --max-time 10 "$BACKEND_URL/api/health" || echo "000")
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo ""
  warn "Preflight FAILED — $BACKEND_URL/api/health returned HTTP $HEALTH_CODE"
  warn "Building the APK against this URL will produce a 'Network error' on your phone."
  warn ""
  warn "Fix: set VITE_BACKEND_URL to a URL where /api/health returns 200. Example:"
  warn "    export VITE_BACKEND_URL=https://your-backend.example.com"
  warn "    bash scripts/build-android-apk.sh"
  warn ""
  warn "If you don't have a production backend yet, use the current dev preview URL:"
  warn "    export VITE_BACKEND_URL=https://orbit-vouchers.preview.emergentagent.com"
  warn "    bash scripts/build-android-apk.sh"
  die "Aborting so you don't ship a broken APK."
fi
ok "Backend reachable → /api/health returned 200"

VITE_BACKEND_URL="$BACKEND_URL" yarn build
[[ -d "$FRONTEND_DIR/dist" ]] || die "vite build did not produce a dist/ folder"
ok "Web bundle built → $FRONTEND_DIR/dist/"

# --- STEP 4 · Add Android platform if missing --------------------------------
step 4 "Ensuring Android platform is added"

if [[ ! -d "$ANDROID_DIR" ]]; then
  info "android/ folder missing — running 'npx cap add android'"
  npx cap add android
  ok "Android platform added"
else
  ok "Android platform already exists at $ANDROID_DIR"
fi

# --- STEP 5 · Drop in Gradle 8.x template files ------------------------------
step 5 "Applying Gradle 8.x / AGP 8.5 template files"

if [[ ! -d "$TEMPLATE_DIR" ]]; then
  die "Template folder $TEMPLATE_DIR not found — did you pull the latest?"
fi

# Only replace if content differs, so re-runs are noise-free
apply_if_diff() {
  local src=$1 dst=$2
  if [[ ! -f "$dst" ]] || ! cmp -s "$src" "$dst"; then
    cp "$src" "$dst"
    ok "Wrote $(basename "$dst")"
  else
    info "$(basename "$dst") already up-to-date"
  fi
}

mkdir -p "$ANDROID_DIR/gradle/wrapper"
apply_if_diff "$TEMPLATE_DIR/gradle-wrapper.properties" "$ANDROID_DIR/gradle/wrapper/gradle-wrapper.properties"
apply_if_diff "$TEMPLATE_DIR/variables.gradle"          "$ANDROID_DIR/variables.gradle"
apply_if_diff "$TEMPLATE_DIR/build.gradle"              "$ANDROID_DIR/build.gradle"
apply_if_diff "$TEMPLATE_DIR/gradle.properties"         "$ANDROID_DIR/gradle.properties"

# --- STEP 6 · Sync Capacitor -------------------------------------------------
step 6 "Syncing Capacitor plugins into Android"

npx cap sync android
ok "Capacitor sync complete"

# --- STEP 7 · Build the APK --------------------------------------------------
step 7 "Building the APK ($BUILD_TYPE)"

cd "$ANDROID_DIR"
chmod +x gradlew

if [[ "$BUILD_TYPE" == "release" ]]; then
  ./gradlew :app:assembleRelease
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
  BUNDLE_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"
  if [[ -f "$BUNDLE_PATH" ]]; then
    ok "Release AAB ready: $BUNDLE_PATH"
  fi
else
  ./gradlew :app:assembleDebug
  APK_PATH="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
fi

if [[ -f "$APK_PATH" ]]; then
  echo ""
  ok "🎉 APK ready: $APK_PATH"
  ls -lh "$APK_PATH"
else
  die "APK not produced — check Gradle output above for errors."
fi
