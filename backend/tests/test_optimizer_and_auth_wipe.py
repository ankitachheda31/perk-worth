"""PerkWorth — Optimizer + Auth wipe tests (Phase A/B/C feature pass).

Tested endpoints:
- GET  /api/optimizer/tips?user_pin=...&use_llm_fallback=false
- POST /api/auth/signup, /api/auth/login, /api/auth/me, /api/auth/logout
- POST /api/auth/wipe (with Bearer token)
- POST /api/vouchers (used as setup for optimizer rules tests)
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pathlib import Path

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE = line.split("=", 1)[1].strip()
BASE = BASE.rstrip("/")
API = f"{BASE}/api"


# ---------- Optimizer: empty wallet ----------
def test_optimizer_tips_empty_wallet():
    # Use a fresh, unused user_pin to guarantee no vouchers
    pin = f"empty-{int(time.time())}"
    r = requests.get(f"{API}/optimizer/tips", params={"user_pin": pin, "use_llm_fallback": "false"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data == {"tips": [], "total": 0}


# ---------- Optimizer: rules-based Tata Neu ----------
def test_optimizer_rules_tata_neu():
    pin = f"opt-tn-{int(time.time())}"
    vp = {
        "user_pin": pin, "brand": "Tata Neu", "title": "TEST Tata NeuCoins",
        "category": "vouchers", "points": 1200,
    }
    v = requests.post(f"{API}/vouchers", json=vp, timeout=30)
    assert v.status_code == 200, v.text
    vid = v.json()["id"]
    try:
        r = requests.get(f"{API}/optimizer/tips", params={"user_pin": pin, "use_llm_fallback": "false"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total"] >= 1
        tata_tips = [t for t in data["tips"] if (t.get("brand") or "").lower() == "tata neu"]
        assert tata_tips, f"No Tata Neu tip found in {data}"
        t = tata_tips[0]
        assert t["kind"] in ("redeem", "transfer"), t
        assert t["source"] == "rules"
    finally:
        requests.delete(f"{API}/vouchers/{vid}", timeout=15)


# ---------- Optimizer: expiry urgent tip ----------
def test_optimizer_expiry_urgent():
    pin = f"opt-exp-{int(time.time())}"
    exp = (datetime.now(timezone.utc).date() + timedelta(days=5)).isoformat()
    vp = {
        "user_pin": pin, "brand": "TEST_Expiring", "title": "TEST expiring soon",
        "category": "vouchers", "points": 0, "expiry": exp,
    }
    v = requests.post(f"{API}/vouchers", json=vp, timeout=30)
    assert v.status_code == 200, v.text
    vid = v.json()["id"]
    try:
        r = requests.get(f"{API}/optimizer/tips", params={"user_pin": pin, "use_llm_fallback": "false"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        urgents = [t for t in data["tips"] if t.get("kind") == "urgent"]
        assert urgents, f"No urgent tip found in {data}"
    finally:
        requests.delete(f"{API}/vouchers/{vid}", timeout=15)


# ---------- Auth: full flow signup/login/me/logout ----------
@pytest.fixture
def signed_up_user():
    ts = int(time.time() * 1000)
    email = f"e2e-{ts}@perkworth.app"
    password = "test1234"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "E2E User"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["access_token"]
    return {"email": email, "password": password, "token": token, "session": s, "id": data["id"]}


def test_auth_full_flow_and_logout():
    ts = int(time.time() * 1000)
    email = f"flow-{ts}@perkworth.app"
    password = "test1234"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # signup
    r = s.post(f"{API}/auth/signup", json={"email": email, "password": password, "name": "Flow"}, timeout=30)
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    assert isinstance(token, str) and len(token) > 20

    # /me via Bearer (use a new session w/o cookies)
    s2 = requests.Session()
    r = s2.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == email

    # login (same creds) returns valid token
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    login_token = r.json()["access_token"]
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {login_token}"}, timeout=30)
    assert r.status_code == 200

    # logout (cookie-based) — endpoint must work
    r = s.post(f"{API}/auth/logout", timeout=30)
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth: wipe deletes user + data ----------
def test_auth_wipe_deletes_user_and_returns_401_on_me(signed_up_user):
    token = signed_up_user["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # create a voucher scoped to this user_id (user_pin = uid)
    uid = signed_up_user["id"]
    vp = {"user_pin": uid, "brand": "TEST_WipeMe", "title": "x", "category": "vouchers"}
    v = requests.post(f"{API}/vouchers", json=vp, timeout=30)
    assert v.status_code == 200, v.text

    # wipe
    r = requests.post(f"{API}/auth/wipe", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert "deleted" in body and isinstance(body["deleted"], dict)
    assert body["deleted"].get("vouchers", 0) >= 1

    # /me with the same token must now return 401 "User not found"
    r = requests.get(f"{API}/auth/me", headers=headers, timeout=30)
    assert r.status_code == 401, r.text
    detail = (r.json().get("detail") or "").lower()
    assert "user not found" in detail or "not authenticated" in detail
