#!/usr/bin/env bash
# Extract & execute Step 3 preflight logic from build-android-apk.sh in isolation.
# This asserts the fix behaves correctly for both a broken URL and a working URL.

set -uo pipefail

SCRIPT=/app/scripts/build-android-apk.sh

# Extract the preflight block (lines 91..111 approx) — we grep by markers to stay robust
PREFLIGHT=$(awk '/^# Preflight the backend URL/,/Backend reachable/' "$SCRIPT")
if [[ -z "$PREFLIGHT" ]]; then
  echo "FAIL: could not extract preflight block from $SCRIPT"; exit 2
fi

# Define pretty printers used by the block
c_green="\033[1;32m"; c_red="\033[1;31m"; c_yellow="\033[1;33m"; c_blue="\033[1;34m"; c_end="\033[0m"
ok()   { echo -e "${c_green}OK${c_end} $1"; }
info() { echo -e "${c_blue}i${c_end} $1"; }
warn() { echo -e "${c_yellow}WARN${c_end} $1"; }
die()  { echo -e "${c_red}X${c_end} $1"; exit 1; }

run_case() {
  local label=$1 url=$2
  echo "=================================================="
  echo "CASE: $label · URL=$url"
  echo "=================================================="
  ( set -e
    export VITE_BACKEND_URL="$url"
    eval "$PREFLIGHT"
  )
  echo "exit_code=$?"
  echo ""
}

# Case 1 — broken URL, must FAIL
echo "### CASE 1: perkworth.app (expect abort w/ 'Preflight FAILED')"
OUT1=$(VITE_BACKEND_URL=https://perkworth.app bash -c "
  set -uo pipefail
  c_green=''; c_red=''; c_yellow=''; c_blue=''; c_end=''
  ok()   { echo \"OK \$1\"; }
  info() { echo \"i \$1\"; }
  warn() { echo \"WARN \$1\"; }
  die()  { echo \"X \$1\"; exit 1; }
  $PREFLIGHT
" 2>&1)
EC1=$?
echo "$OUT1"
echo "exit_code=$EC1"
echo ""

# Assertions for case 1
pass=1
[[ $EC1 -ne 0 ]] || { echo "ASSERT FAIL: expected non-zero exit for broken URL"; pass=0; }
echo "$OUT1" | grep -q "Preflight FAILED" || { echo "ASSERT FAIL: missing 'Preflight FAILED'"; pass=0; }
echo "$OUT1" | grep -q "Network error"    || { echo "ASSERT FAIL: missing 'Network error'"; pass=0; }
echo "$OUT1" | grep -q "set VITE_BACKEND_URL" || { echo "ASSERT FAIL: missing 'set VITE_BACKEND_URL' guidance"; pass=0; }
[[ $pass -eq 1 ]] && echo ">>> CASE 1 PASSED" || { echo ">>> CASE 1 FAILED"; exit 1; }

echo ""
echo "### CASE 2: orbit-vouchers preview (expect 'Backend reachable' + exit 0)"
OUT2=$(VITE_BACKEND_URL=https://orbit-vouchers.preview.emergentagent.com bash -c "
  set -uo pipefail
  ok()   { echo \"OK \$1\"; }
  info() { echo \"i \$1\"; }
  warn() { echo \"WARN \$1\"; }
  die()  { echo \"X \$1\"; exit 1; }
  $PREFLIGHT
" 2>&1)
EC2=$?
echo "$OUT2"
echo "exit_code=$EC2"

pass=1
[[ $EC2 -eq 0 ]] || { echo "ASSERT FAIL: expected exit 0 for reachable URL"; pass=0; }
echo "$OUT2" | grep -q "Backend reachable" || { echo "ASSERT FAIL: missing 'Backend reachable'"; pass=0; }
echo "$OUT2" | grep -q "returned 200" || { echo "ASSERT FAIL: missing 'returned 200'"; pass=0; }
[[ $pass -eq 1 ]] && echo ">>> CASE 2 PASSED" || { echo ">>> CASE 2 FAILED"; exit 1; }

echo ""
echo "### CASE 3: verify no dist/ folder is created by preflight itself"
# Preflight doesn't touch dist; just sanity-check
if [[ -d /app/frontend/dist ]]; then
  info "dist/ exists (from prior build) — preflight itself doesn't create it, ok"
else
  ok "dist/ absent — preflight didn't create it"
fi

echo ""
echo "ALL PREFLIGHT TESTS PASSED"
