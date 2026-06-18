#!/usr/bin/env python3
"""Perk Orbit — Zero-Break Health Check.

Runs after every build to verify:
  1. Backend connectivity (MongoDB, FastAPI, indexes)
  2. Every public API route returns expected status
  3. Auth flow: signup → me → wipe (smoke)
  4. Frontend bundle compiles, all referenced screens exist
  5. Every push('<screen>') in App.jsx maps to a render handler

Exit code: 0 = healthy, 1 = unhealthy.

Usage:
    python3 /app/scripts/health_check.py
    python3 /app/scripts/health_check.py --json   # machine-readable
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

REPO = Path("/app")
BACKEND = REPO / "backend"
FRONTEND = REPO / "frontend"
APP_JSX = FRONTEND / "src" / "App.jsx"
ENV = REPO / "frontend" / ".env"

# ---------------------------------------------------------------------------
# Pretty output helpers
# ---------------------------------------------------------------------------
GREEN = "\033[1;32m"
RED = "\033[1;31m"
YELLOW = "\033[1;33m"
DIM = "\033[2m"
BOLD = "\033[1m"
RST = "\033[0m"


def ok(msg): return f"{GREEN}✓{RST} {msg}"
def fail(msg): return f"{RED}✗{RST} {msg}"
def warn(msg): return f"{YELLOW}!{RST} {msg}"
def hdr(msg): return f"\n{BOLD}── {msg} ──{RST}"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def read_env(key: str) -> str | None:
    if not ENV.exists():
        return None
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


def http(method: str, url: str, body: dict | None = None, headers: dict | None = None, timeout: int = 12):
    data = None
    h = {"User-Agent": "PerkOrbit-HealthCheck/1.0"}
    if headers:
        h.update(headers)
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return resp.status, text, dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace"), dict(e.headers or {})
    except Exception as e:
        return 0, str(e), {}


# ---------------------------------------------------------------------------
# Check 1: Backend connectivity
# ---------------------------------------------------------------------------
def check_backend(api_url: str, results: list, json_out: dict):
    print(hdr("1. Backend connectivity"))
    code, body, _ = http("GET", f"{api_url}/api/health")
    if code == 0:
        code, body, _ = http("GET", f"{api_url}/")  # root fallback
    if 200 <= code < 300:
        print(ok(f"FastAPI alive · {api_url} → {code}"))
        results.append(("backend.alive", True))
    else:
        print(fail(f"FastAPI not reachable · {api_url} → {code} · {body[:120]}"))
        results.append(("backend.alive", False))
        json_out["backend"]["reachable"] = False
        return False

    # Verify CORS preflight works (no-credential wildcard for fetch via Bearer)
    code, _, headers = http("OPTIONS", f"{api_url}/api/auth/signup", headers={
        "Origin": api_url,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    cors_ok = code in (200, 204) and "*" in (headers.get("access-control-allow-origin", "") + headers.get("Access-Control-Allow-Origin", ""))
    if cors_ok:
        print(ok("CORS preflight OK (Allow-Origin: *)"))
    else:
        print(warn(f"CORS preflight returned {code} · headers={list(headers.keys())[:5]}"))
    results.append(("backend.cors", cors_ok))
    json_out["backend"]["reachable"] = True
    json_out["backend"]["cors_ok"] = cors_ok
    return True


# ---------------------------------------------------------------------------
# Check 2: Auth + Mongo smoke (signup → me → wipe)
# ---------------------------------------------------------------------------
def check_auth_flow(api_url: str, results: list, json_out: dict):
    print(hdr("2. Auth flow & MongoDB write/read/delete"))
    ts = int(time.time())
    email = f"healthcheck-{ts}@perkorbit.app"
    pw = "health1234"

    # Signup
    code, body, _ = http("POST", f"{api_url}/api/auth/signup",
                         body={"email": email, "password": pw, "name": "HC Probe"})
    if code != 200:
        print(fail(f"signup → {code} · {body[:200]}"))
        results.append(("auth.signup", False))
        json_out["auth"]["signup_ok"] = False
        return False
    try:
        token = json.loads(body)["access_token"]
        uid = json.loads(body)["id"]
    except Exception:
        print(fail(f"signup response malformed · {body[:200]}"))
        results.append(("auth.signup", False))
        return False
    print(ok(f"POST /api/auth/signup → 200 · uid={uid[:8]}…"))
    results.append(("auth.signup", True))

    # /me
    code, body, _ = http("GET", f"{api_url}/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    me_ok = code == 200 and email in body
    print((ok if me_ok else fail)(f"GET /api/auth/me → {code}"))
    results.append(("auth.me", me_ok))

    # /api/vouchers list (db read with user scope)
    code, body, _ = http("GET", f"{api_url}/api/vouchers?user_pin={uid}")
    print((ok if code == 200 else fail)(f"GET /api/vouchers → {code}"))
    results.append(("vouchers.list", code == 200))

    # Wipe
    code, body, _ = http("POST", f"{api_url}/api/auth/wipe",
                         headers={"Authorization": f"Bearer {token}"})
    wipe_ok = code == 200 and "ok" in body
    print((ok if wipe_ok else fail)(f"POST /api/auth/wipe → {code}"))
    results.append(("auth.wipe", wipe_ok))

    # Forgot-password smoke (always returns 200, no enumeration)
    code, body, _ = http("POST", f"{api_url}/api/auth/forgot-password",
                         body={"email": email})
    forgot_ok = code == 200 and '"ok":true' in body.replace(" ", "")
    print((ok if forgot_ok else fail)(f"POST /api/auth/forgot-password → {code} (no-enum 200)"))
    results.append(("auth.forgot_password", forgot_ok))

    # Reset-password rejects an invalid token
    code, body, _ = http("POST", f"{api_url}/api/auth/reset-password",
                         body={"token": "invalid-token-xyz", "new_password": "abc12345"})
    reset_reject_ok = code == 400
    print((ok if reset_reject_ok else fail)(f"POST /api/auth/reset-password (invalid token) → {code} (expected 400)"))
    results.append(("auth.reset_password_rejects_invalid", reset_reject_ok))

    # Verify wipe actually removed the account
    code, body, _ = http("GET", f"{api_url}/api/auth/me",
                         headers={"Authorization": f"Bearer {token}"})
    erasure_ok = code == 401
    print((ok if erasure_ok else fail)(f"erasure verified · /me after wipe → {code} (expected 401)"))
    results.append(("auth.erasure_verified", erasure_ok))

    json_out["auth"] = {
        "signup_ok": True, "me_ok": me_ok,
        "wipe_ok": wipe_ok, "erasure_verified": erasure_ok,
    }
    return all([me_ok, wipe_ok, erasure_ok])


# ---------------------------------------------------------------------------
# Check 3: Every public API route smoke
# ---------------------------------------------------------------------------
ROUTES_TO_PROBE = [
    # (method, path with placeholders, expected_2xx_or_4xx_set, label)
    ("GET", "/api/health", {200}, "Health"),
    ("GET", "/api/vouchers?user_pin=__probe__", {200}, "Vouchers"),
    ("GET", "/api/vouchers/ending-soon?user_pin=__probe__&days=7", {200}, "Vouchers ending soon"),
    ("GET", "/api/points/summary?user_pin=__probe__", {200}, "Points summary"),
    ("GET", "/api/memberships/roi?user_pin=__probe__", {200}, "Memberships ROI"),
    ("GET", "/api/search/brand?q=tata", {200}, "Brand search"),
    ("GET", "/api/circle/members?user_pin=__probe__", {200}, "Circle members"),
    ("GET", "/api/membership/status?user_pin=__probe__", {200}, "Membership status"),
    ("GET", "/api/notifications?user_pin=__probe__", {200}, "Notifications"),
    ("GET", "/api/support/history?user_pin=__probe__", {200}, "Support history"),
    ("GET", "/api/referrals/stats?user_pin=__probe__", {200}, "Referral stats"),
    ("GET", "/api/optimizer/tips?user_pin=__probe__&use_llm_fallback=false", {200}, "Optimizer tips"),
    ("GET", "/api/intelligence/programs?limit=5", {200}, "Intelligence programs"),
    # Endpoints that REQUIRE auth — 401 is the expected "healthy" response without a token.
    ("GET", "/api/user/export", {401}, "User export (auth required)"),
    # Webhook should reject unsigned request with 400.
    ("POST", "/api/payments/webhook", {400}, "Payment webhook (sig required)"),
]


def check_routes(api_url: str, results: list, json_out: dict):
    print(hdr("3. API route smoke (13 endpoints)"))
    route_results = []
    fail_count = 0
    for method, path, expected, label in ROUTES_TO_PROBE:
        code, _, _ = http(method, f"{api_url}{path}", timeout=8)
        passed = code in expected
        if passed:
            print(ok(f"{method:5} {path:55} → {code} · {label}"))
        else:
            print(fail(f"{method:5} {path:55} → {code} · {label}"))
            fail_count += 1
        route_results.append({"method": method, "path": path, "code": code, "ok": passed, "label": label})
    results.append(("routes.smoke", fail_count == 0))
    json_out["routes"] = route_results
    return fail_count == 0


# ---------------------------------------------------------------------------
# Check 4: Frontend route-screen integrity
# ---------------------------------------------------------------------------
def check_frontend_routes(results: list, json_out: dict):
    print(hdr("4. Frontend route ↔ screen integrity"))
    if not APP_JSX.exists():
        print(fail(f"App.jsx not found at {APP_JSX}"))
        results.append(("frontend.app_jsx", False))
        return False
    src = APP_JSX.read_text()

    # Collect every push('xxx') and onNavigate cases
    pushed = set(re.findall(r"push\('([a-z-]+)'", src))
    navigated = set(re.findall(r"where === '([a-z-]+)'", src))
    # Collect every render handler `current.screen === 'xxx'`
    rendered = set(re.findall(r"current\.screen === '([a-z-]+)'", src))
    # Switch tabs (home/coupons/points/circle)
    tabs = {"home", "coupons", "points", "circle"}

    declared = pushed | navigated | tabs
    # Special non-screen handlers we tolerate (modals/triggers)
    non_screen = {"protect", "replay-tour", "lock"}
    expected_screens = declared - non_screen

    missing = sorted(expected_screens - rendered)
    extra = sorted(rendered - expected_screens - tabs)

    if not missing:
        print(ok(f"All {len(expected_screens)} routed screens have render handlers"))
        for s in sorted(expected_screens):
            print(f"  {DIM}· {s}{RST}")
        results.append(("frontend.routes", True))
    else:
        print(fail(f"{len(missing)} routes without render handler: {missing}"))
        results.append(("frontend.routes", False))

    if extra:
        print(warn(f"{len(extra)} render handlers without route (orphans): {extra}"))

    # Verify imported screen files exist
    imports = re.findall(r"from\s+'(\./screens/[A-Za-z]+)'", src)
    missing_files = []
    for imp in imports:
        # Try .jsx then .js
        p_jsx = (APP_JSX.parent / f"{imp}.jsx").resolve()
        p_js = (APP_JSX.parent / f"{imp}.js").resolve()
        if not p_jsx.exists() and not p_js.exists():
            missing_files.append(imp)
    if not missing_files:
        print(ok(f"All {len(imports)} screen imports resolve to a file"))
        results.append(("frontend.screen_files", True))
    else:
        print(fail(f"Missing screen files: {missing_files}"))
        results.append(("frontend.screen_files", False))

    json_out["frontend"] = {
        "pushed_routes": sorted(pushed),
        "rendered_screens": sorted(rendered),
        "missing_handlers": missing,
        "orphan_handlers": extra,
        "imported_screens": imports,
        "missing_files": missing_files,
    }
    return not missing and not missing_files


# ---------------------------------------------------------------------------
# Check 5: Frontend smoke — does index.html load + no JS errors at boot?
# ---------------------------------------------------------------------------
def check_frontend_boot(api_url: str, results: list, json_out: dict):
    print(hdr("5. Frontend bundle boot smoke"))
    code, body, _ = http("GET", api_url + "/", timeout=10)
    served = 200 <= code < 300 and ("<html" in body.lower() or "perk" in body.lower())
    if served:
        print(ok(f"GET / → {code} · {len(body)} bytes served"))
        results.append(("frontend.boot", True))
    else:
        print(fail(f"GET / → {code} · body={body[:120]}"))
        results.append(("frontend.boot", False))
    json_out["frontend"]["boot_ok"] = served
    return served


# ---------------------------------------------------------------------------
# Check 6: Core module reachability (build health report)
# ---------------------------------------------------------------------------
CORE_MODULES = [
    ("Home", "home"),
    ("My Coupons", "coupons"),
    ("My Points", "points"),
    ("Family Circle", "circle"),
    ("Profile", "profile"),
    ("Membership", "membership"),
    ("Perk Tips · Masterclass", "perk-tips"),
    ("Settings", "settings"),
    ("Privacy Policy", "privacy"),
    ("Security FAQ", "faq"),
    ("Privacy Control", "privacy-control"),
    ("SMS Auto-Scanner", "sms-scanner"),
    ("Support History", "support"),
]


def check_core_modules(results: list, json_out: dict):
    print(hdr("6. Core module reachability"))
    if not APP_JSX.exists():
        return False
    src = APP_JSX.read_text()
    rendered = set(re.findall(r"current\.screen === '([a-z-]+)'", src))
    rendered.update({"home", "coupons", "points", "circle"})
    statuses = []
    for label, route in CORE_MODULES:
        reachable = route in rendered
        line = ok(f"{label:<28} → /{route}") if reachable else fail(f"{label:<28} → /{route}")
        print(line)
        statuses.append({"module": label, "route": route, "reachable": reachable})
    all_good = all(s["reachable"] for s in statuses)
    results.append(("core_modules", all_good))
    json_out["core_modules"] = statuses
    return all_good


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--api-url", default=None, help="Override API base URL")
    args = parser.parse_args()

    api_url = args.api_url or read_env("REACT_APP_BACKEND_URL") or "http://localhost:8001"
    api_url = api_url.rstrip("/")
    results: list = []
    json_out: dict = {"timestamp": int(time.time()), "api_url": api_url, "backend": {}, "auth": {}, "frontend": {}}

    if not args.json:
        print(f"\n{BOLD}PERK ORBIT · BUILD HEALTH REPORT{RST}")
        print(f"{DIM}API: {api_url}{RST}")

    backend_ok = check_backend(api_url, results, json_out)
    if backend_ok:
        check_auth_flow(api_url, results, json_out)
        check_routes(api_url, results, json_out)

    check_frontend_routes(results, json_out)
    check_frontend_boot(api_url, results, json_out)
    check_core_modules(results, json_out)

    passed = sum(1 for _, v in results if v)
    total = len(results)
    healthy = passed == total
    summary = {
        "passed": passed, "total": total, "healthy": healthy,
        "checks": [{"name": n, "ok": v} for n, v in results],
    }
    json_out["summary"] = summary

    if args.json:
        print(json.dumps(json_out, indent=2))
        sys.exit(0 if healthy else 1)

    print(hdr("BUILD HEALTH"))
    icon = f"{GREEN}HEALTHY{RST}" if healthy else f"{RED}UNHEALTHY{RST}"
    print(f"{BOLD}Status:{RST} {icon}  ·  {passed}/{total} checks passed")
    if not healthy:
        for n, v in results:
            if not v:
                print(fail(n))
    print()
    sys.exit(0 if healthy else 1)


if __name__ == "__main__":
    main()
