"""P0 security tests for POST /api/membership/activate dev-bypass gate.

Verifies:
  1. With ALLOW_DEV_MEMBERSHIP_BYPASS=1 (current dev .env), endpoint returns 200
     and activates a Pro membership (dev/demo path preserved).
  2. With flag unset OR '0', endpoint returns 403 with the expected detail
     message pointing to the proper Razorpay flow.
  3. /api/payments/order Razorpay path is unaffected by the gate.

We toggle the flag by editing /app/backend/.env and restarting the backend
via supervisor, then RESTORE the flag to '1' at the end (finalizer).
"""
from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") \
    if os.environ.get("REACT_APP_BACKEND_URL") else "https://orbit-vouchers.preview.emergentagent.com"
ENV_PATH = Path("/app/backend/.env")
FLAG_KEY = "ALLOW_DEV_MEMBERSHIP_BYPASS"
TEST_PIN = "TEST_bypass_pin_9999"


def _read_env() -> str:
    return ENV_PATH.read_text()


def _write_env(text: str) -> None:
    ENV_PATH.write_text(text)


def _set_flag(value: str | None) -> None:
    """Set flag to given value, or remove line entirely if value is None."""
    lines = _read_env().splitlines()
    new_lines = [ln for ln in lines if not ln.startswith(f"{FLAG_KEY}=")]
    if value is not None:
        new_lines.append(f"{FLAG_KEY}={value}")
    _write_env("\n".join(new_lines) + "\n")


def _restart_backend() -> None:
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=True, capture_output=True)
    # wait for backend to come back up
    for _ in range(30):
        try:
            r = requests.get(f"{BASE_URL}/api/membership/status", params={"user_pin": "warmup"}, timeout=3)
            if r.status_code == 200:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError("Backend did not come back up after restart")


@pytest.fixture(scope="module", autouse=True)
def cleanup_env_after():
    """Ensure .env is restored to flag=1 no matter what happens."""
    original = _read_env()
    yield
    # ALWAYS restore to original .env and restart
    _write_env(original)
    _restart_backend()
    # sanity: flag must be =1
    assert "ALLOW_DEV_MEMBERSHIP_BYPASS=1" in _read_env(), "cleanup failed to restore flag"


# ---- Test 1: bypass ON (current dev setting) --------------------------------

def test_bypass_flag_on_returns_200_and_activates():
    # Precondition: flag is already =1 in .env (dev default)
    assert "ALLOW_DEV_MEMBERSHIP_BYPASS=1" in _read_env()

    r = requests.post(f"{BASE_URL}/api/membership/activate", params={"user_pin": TEST_PIN}, timeout=10)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text}"
    body = r.json()
    assert body["active"] is True
    assert body["user_pin"] == TEST_PIN
    assert body["expires_at"]
    assert body["referral_code"].startswith("PERK-")

    # Verify persistence via /status
    s = requests.get(f"{BASE_URL}/api/membership/status", params={"user_pin": TEST_PIN}, timeout=10)
    assert s.status_code == 200
    sb = s.json()
    assert sb["active"] is True
    assert sb["plan"] == body["plan"]


# ---- Test 2: bypass OFF (flag removed) --------------------------------------

def test_bypass_flag_removed_returns_403():
    _set_flag(None)  # remove line entirely
    _restart_backend()
    try:
        r = requests.post(f"{BASE_URL}/api/membership/activate", params={"user_pin": TEST_PIN}, timeout=10)
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text}"
        body = r.json()
        detail = body.get("detail", "")
        assert "disabled in production" in detail.lower() or "razorpay" in detail.lower(), \
            f"detail should point to Razorpay flow, got: {detail}"
        assert "/api/payments/order" in detail
        assert "/api/payments/verify" in detail
    finally:
        # restore flag=1 and restart before next test
        _set_flag("1")
        _restart_backend()


# ---- Test 3: bypass explicitly '0' also blocks ------------------------------

def test_bypass_flag_zero_returns_403():
    _set_flag("0")
    _restart_backend()
    try:
        r = requests.post(f"{BASE_URL}/api/membership/activate", params={"user_pin": TEST_PIN}, timeout=10)
        assert r.status_code == 403
        assert "/api/payments/order" in r.json().get("detail", "")
    finally:
        _set_flag("1")
        _restart_backend()


# ---- Test 4: Razorpay path unaffected ---------------------------------------

def test_payments_order_unaffected():
    """Confirm /api/payments/order is NOT affected by the membership bypass gate.

    NB: the Razorpay test keys in dev .env currently return
    "Authentication failed" from Razorpay (unrelated, pre-existing infra
    issue — see backend log). What we care about here is that the endpoint
    is REACHABLE (not 403 from our gate) and returns either a valid order
    (200) or a Razorpay upstream error (502) — both prove the gate does
    not affect this route.
    """
    payload = {"user_pin": TEST_PIN, "amount_inr": 99}
    r = requests.post(f"{BASE_URL}/api/payments/order", json=payload, timeout=15)
    assert r.status_code != 403, "membership gate should NOT block /api/payments/order"
    assert r.status_code in (200, 502), f"unexpected status {r.status_code}: {r.text}"
    if r.status_code == 200:
        body = r.json()
        assert body.get("order_id", "").startswith("order_")
        assert body["amount"] == 9900
        assert body["currency"] == "INR"


def test_payments_order_unaffected_when_bypass_off():
    _set_flag(None)
    _restart_backend()
    try:
        payload = {"user_pin": TEST_PIN, "amount_inr": 99}
        r = requests.post(f"{BASE_URL}/api/payments/order", json=payload, timeout=15)
        assert r.status_code != 403, "membership gate must not affect /api/payments/order"
        assert r.status_code in (200, 502), f"unexpected status {r.status_code}: {r.text}"
    finally:
        _set_flag("1")
        _restart_backend()
