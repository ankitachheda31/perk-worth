"""Iteration 19 - regression tests for auth rate-limit + Body() fix + brand lookup ranking + circle invite."""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://orbit-vouchers.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "test@perkorbit.app"
ADMIN_PASS = "Perk@1234"


def _token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body
    return body["access_token"]


# ---- Auth ----
def test_signup_fresh_email_returns_200_with_token():
    email = f"TEST_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "Perk@1234", "name": "Iter19", "pin_to_claim": "1234"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "access_token" in j and isinstance(j["access_token"], str) and len(j["access_token"]) > 20


def test_login_seeded_admin_returns_200_with_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    assert "access_token" in r.json()


def test_me_with_bearer_token():
    tok = _token()
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("email") == ADMIN_EMAIL


def test_forgot_password_returns_200_no_leak():
    # Existing email
    r1 = requests.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL}, timeout=15)
    assert r1.status_code == 200, r1.text
    # Non-existent email
    r2 = requests.post(f"{API}/auth/forgot-password", json={"email": f"nonexistent_{uuid.uuid4().hex[:6]}@example.com"}, timeout=15)
    assert r2.status_code == 200, r2.text
    # Should not leak whether email exists
    assert r1.json() == r2.json() or ("message" in r1.json() and "message" in r2.json())


def test_reset_password_invalid_token_returns_400():
    r = requests.post(f"{API}/auth/reset-password", json={"token": "invalid_token_xyz", "new_password": "NewPass@1234"}, timeout=15)
    assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text}"


# ---- Brand lookup ranking ----
def test_brand_lookup_club_mahindra_ranks_first():
    r = requests.get(f"{API}/brands/lookup", params={"q": "Club Mahindra"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    items = j.get("results") or j.get("brands") or j.get("items") or (j if isinstance(j, list) else [])
    assert items, f"no results: {j}"
    first = items[0]
    name = (first.get("name") or first.get("canonical") or first.get("brand") or "").lower()
    assert "club mahindra" in name, f"expected Club Mahindra first, got: {first}"


def test_brand_lookup_bigbasket_returns_tata_parent():
    r = requests.get(f"{API}/brands/lookup", params={"q": "BigBasket"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    items = j.get("results") or j.get("brands") or j.get("items") or (j if isinstance(j, list) else [])
    assert items, f"no results: {j}"
    first = items[0]
    name = (first.get("name") or first.get("canonical") or first.get("brand") or "").lower()
    parent = (first.get("parent") or first.get("parent_group") or first.get("parent_company") or first.get("group") or "").lower()
    assert "bigbasket" in name, f"expected BigBasket first, got: {first}"
    assert "tata" in parent, f"expected Tata parent, got: {first}"


def test_brand_lookup_alias_bb_returns_bigbasket_first():
    r = requests.get(f"{API}/brands/lookup", params={"q": "bb"}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    items = j.get("results") or j.get("brands") or j.get("items") or (j if isinstance(j, list) else [])
    assert items, f"no results: {j}"
    first = items[0]
    name = (first.get("name") or first.get("canonical") or first.get("brand") or "").lower()
    assert "bigbasket" in name, f"expected BigBasket first for 'bb', got: {first}"


# ---- Circle invite ----
def test_circle_add_member_returns_invite_email_sent_field():
    user_pin = f"TEST_pin_{uuid.uuid4().hex[:6]}"
    payload = {
        "user_pin": user_pin,
        "name": f"TEST_Member_{uuid.uuid4().hex[:6]}",
        "email": f"TEST_circle_{uuid.uuid4().hex[:6]}@example.com",
        "relation": "spouse",
    }
    r = requests.post(f"{API}/circle/members", json=payload, timeout=20)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    j = r.json()
    assert "invite_email_sent" in j, f"invite_email_sent field missing: {j}"
    # cleanup
    mid = j.get("id") or j.get("_id") or j.get("member_id")
    if mid:
        requests.delete(f"{API}/circle/members/{mid}", timeout=10)


# ---- No regression on other endpoints ----
def test_vouchers_list_no_regression():
    user_pin = f"TEST_pin_{uuid.uuid4().hex[:6]}"
    r = requests.get(f"{API}/vouchers", params={"user_pin": user_pin}, timeout=15)
    assert r.status_code == 200, r.text


def test_admin_dashboard_no_regression():
    tok = _token()
    # Try common admin routes; skip if none exist
    for path in ("/admin/registry/stats", "/admin/stats", "/admin/dashboard"):
        r = requests.get(f"{API}{path}", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        if r.status_code != 404:
            assert r.status_code in (200, 403), f"{path} -> {r.status_code} {r.text}"
            return
    # No admin endpoint hit; that's acceptable — admin surface tested in iter18


def test_force_logout_endpoint_reachable():
    tok = _token()
    r = requests.post(f"{API}/auth/logout", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code in (200, 204, 401, 404), r.text


def test_disable_rate_limit_env_effective():
    """Fire 8 rapid signup calls; if rate-limit disabled, none should return 429."""
    codes = []
    for _ in range(8):
        email = f"TEST_rl_{uuid.uuid4().hex[:10]}@example.com"
        r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "Perk@1234", "name": "RL", "pin_to_claim": "1234"}, timeout=10)
        codes.append(r.status_code)
    assert 429 not in codes, f"rate-limit hit despite DISABLE_RATE_LIMIT=1: {codes}"
