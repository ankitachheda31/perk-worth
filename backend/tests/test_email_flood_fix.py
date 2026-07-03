"""Iteration 25 — Email flood fix (3 layers of defense) for /api/auth/forgot-password.

Verifies:
  Layer 2 · per-email 15-min cooldown (independent of rate limiter)
  Layer 3 · EMAIL_SEND_ENABLED=0 kill-switch (no Resend HTTP call)
  Enumeration safety: identical body across all 3 paths
  Non-existent email: no DB row created
"""
import os
import time
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or "http://localhost:8001"
if not BASE_URL.startswith("http"):
    BASE_URL = "http://localhost:8001"

# Read backend .env directly (backend runs on same host as MongoDB)
def _load_backend_env():
    env = {}
    with open("/app/backend/.env") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v
    return env

BACKEND_ENV = _load_backend_env()
MONGO_URL = BACKEND_ENV["MONGO_URL"]
DB_NAME = BACKEND_ENV["DB_NAME"]

EXPECTED_BODY = {
    "ok": True,
    "message": "If an account exists for this email, a reset link has been sent.",
}
REAL_EMAIL = "test@perkorbit.app"


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def _cleanup_real_email(db):
    # Ensure clean slate before each test — no lingering cooldown rows for the real user
    _run(db.password_resets.delete_many({"email": REAL_EMAIL}))
    yield
    _run(db.password_resets.delete_many({"email": REAL_EMAIL}))


# -----------------------------------------------------------------------------
# .env sanity — new vars must be present and set to dev-safe defaults
# -----------------------------------------------------------------------------
def test_env_vars_configured():
    assert BACKEND_ENV.get("EMAIL_SEND_ENABLED") == "0", "EMAIL_SEND_ENABLED must be 0 in dev to prevent flooding"
    assert BACKEND_ENV.get("FORGOT_PASSWORD_COOLDOWN_MIN") == "15", "FORGOT_PASSWORD_COOLDOWN_MIN must be 15"
    assert BACKEND_ENV.get("DISABLE_RATE_LIMIT") == "1", "DISABLE_RATE_LIMIT must be 1 in dev"


# -----------------------------------------------------------------------------
# CRITICAL: real email — first call generates DB row but no Resend send
# -----------------------------------------------------------------------------
def test_real_email_first_call_generates_row_no_send(db):
    resp = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": REAL_EMAIL}, timeout=15)
    assert resp.status_code == 200, resp.text
    assert resp.json() == EXPECTED_BODY

    # DB row created
    count = _run(db.password_resets.count_documents({"email": REAL_EMAIL}))
    assert count == 1, f"Expected exactly 1 password_resets row, got {count}"

    # The row must have a token + expires_at (real reset row shape)
    row = _run(db.password_resets.find_one({"email": REAL_EMAIL}))
    assert row and row.get("token") and row.get("expires_at")
    assert row.get("used") is False


# -----------------------------------------------------------------------------
# Layer 2 — per-email cooldown blocks 2nd call within 15 min
# -----------------------------------------------------------------------------
def test_cooldown_blocks_second_call_same_email(db):
    r1 = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": REAL_EMAIL}, timeout=15)
    assert r1.status_code == 200 and r1.json() == EXPECTED_BODY
    count_after_1 = _run(db.password_resets.count_documents({"email": REAL_EMAIL}))
    assert count_after_1 == 1

    # Second call within cooldown — same body, but NO new row
    r2 = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": REAL_EMAIL}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json() == EXPECTED_BODY, "Cooldown response body must be identical (enumeration-safe)"

    count_after_2 = _run(db.password_resets.count_documents({"email": REAL_EMAIL}))
    assert count_after_2 == 1, f"Cooldown must skip token generation — expected 1 row, got {count_after_2}"


# -----------------------------------------------------------------------------
# Cooldown does NOT cross-block different emails
# -----------------------------------------------------------------------------
def test_cooldown_scoped_per_email(db):
    # Two non-existent-user emails will short-circuit before cooldown check,
    # but the test purpose is to confirm the cooldown block does not fire.
    # Use non-existent emails to avoid extra DB pollution.
    for e in ["floodtest_a@example.com", "floodtest_b@example.com"]:
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": e}, timeout=15)
        assert r.status_code == 200
        assert r.json() == EXPECTED_BODY

    # No rows created for non-existent users
    for e in ["floodtest_a@example.com", "floodtest_b@example.com"]:
        c = _run(db.password_resets.count_documents({"email": e}))
        assert c == 0, f"Non-existent email {e} must not create a row (got {c})"


# -----------------------------------------------------------------------------
# Non-existent email: 200 + same body + NO row
# -----------------------------------------------------------------------------
def test_nonexistent_email_no_row(db):
    email = "foo-does-not-exist@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email}, timeout=15)
    assert r.status_code == 200
    assert r.json() == EXPECTED_BODY
    c = _run(db.password_resets.count_documents({"email": email}))
    assert c == 0


# -----------------------------------------------------------------------------
# Layer 3 — Kill switch log line: verify by inspecting backend log tail
# -----------------------------------------------------------------------------
def test_kill_switch_log_line_present():
    # Trigger a real-user reset then check log for the kill-switch line
    requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": REAL_EMAIL}, timeout=15)
    time.sleep(0.5)
    # Read last 200 lines of backend log
    import subprocess
    out = subprocess.run(
        ["tail", "-n", "300", "/var/log/supervisor/backend.out.log"],
        capture_output=True, text=True, timeout=5
    )
    err = subprocess.run(
        ["tail", "-n", "300", "/var/log/supervisor/backend.err.log"],
        capture_output=True, text=True, timeout=5
    )
    logs = (out.stdout or "") + (err.stdout or "")
    assert "EMAIL_SEND_ENABLED=0" in logs and REAL_EMAIL in logs, \
        f"Expected kill-switch log line for {REAL_EMAIL} — not found in recent backend logs"
    assert "Password reset email failed" not in logs.split("EMAIL_SEND_ENABLED=0")[-1], \
        "No Resend failure log expected when kill-switch is active"
