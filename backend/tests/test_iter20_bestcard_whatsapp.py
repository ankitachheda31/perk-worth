"""Iter 20 regression: Best Card widget backend + WhatsApp stub-mode triggers.

Covers:
  - GET /api/cards/best?category=<x> for groceries / food_delivery / fuel
  - POST /api/cards/click
  - GET /api/brands/lookup?q=Swiggy → category present
  - POST /api/circle/members with optional `phone` field (returns invite_whatsapp_sent=False in stub)
  - Backwards compat: POST /api/circle/members without `phone`
  - GET /api/admin/whatsapp/status non-admin → 403; admin → 200 with fields
  - Backend logs show "WhatsApp send skipped (WHATSAPP_ENABLED=0)"
"""
import os
import time
import uuid
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

ADMIN_EMAIL = "test@perkorbit.app"
ADMIN_PASSWORD = "Perk@1234"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def non_admin_token():
    ss = requests.Session()
    email = f"TEST_nonadm_{uuid.uuid4().hex[:8]}@perkworth.app"
    r = ss.post(f"{BASE}/api/auth/signup", json={
        "email": email, "password": "TestPass@2026", "name": "Non Admin", "pin_to_claim": "1234"
    })
    assert r.status_code in (200, 201), r.text
    return r.json().get("access_token")


# ------------------------------ Best Card ----------------------------------
class TestBestCard:
    def test_best_groceries(self, s):
        r = s.get(f"{BASE}/api/cards/best", params={"category": "groceries"})
        assert r.status_code == 200
        data = r.json()
        assert "results" in data
        assert len(data["results"]) > 0
        top = data["results"][0]
        assert "net_annual_value_inr" in top
        assert "category_rate_pct" in top

    def test_best_food_delivery(self, s):
        r = s.get(f"{BASE}/api/cards/best", params={"category": "food_delivery"})
        assert r.status_code == 200
        assert len(r.json().get("results", [])) > 0

    def test_best_fuel_bpcl_top(self, s):
        r = s.get(f"{BASE}/api/cards/best", params={"category": "fuel"})
        assert r.status_code == 200
        results = r.json().get("results", [])
        assert results
        top = results[0]
        name = (top.get("name") or top.get("card_name") or "").lower()
        assert "bpcl" in name and "octane" in name, f"Expected BPCL SBI Octane on top, got {top}"
        # 7.25% rate
        assert abs(float(top.get("category_rate_pct", 0)) - 7.25) < 0.01

    def test_click_track(self, s):
        # Grab a card id from best
        r = s.get(f"{BASE}/api/cards/best", params={"category": "groceries"})
        top = r.json()["results"][0]
        card_id = top.get("card_id") or top.get("id") or top.get("_id")
        assert card_id, f"No card id in {top}"
        r2 = s.post(f"{BASE}/api/cards/click", json={
            "card_id": card_id,
            "user_pin": "TEST_clicker",
            "category": "groceries",
            "source": "best_card_widget",
        })
        assert r2.status_code == 200, r2.text


# ------------------------------ Brand lookup ----------------------------------
def test_brand_lookup_swiggy_has_category(s):
    r = s.get(f"{BASE}/api/brands/lookup", params={"q": "Swiggy"})
    assert r.status_code == 200
    data = r.json()
    # Response can be either list or {results:[...]}
    items = data.get("results") if isinstance(data, dict) else data
    assert items, f"No brand results for Swiggy: {data}"
    top = items[0]
    assert "category" in top, f"Category missing from brand lookup: {top}"


# ------------------------------ Circle members ----------------------------------
class TestCircle:
    def test_add_with_phone_stub_mode(self, s):
        pin = f"TEST_pin_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE}/api/circle/members", json={
            "user_pin": pin,
            "name": "TEST_Family_WA",
            "relation": "sibling",
            "phone": "+919812345678",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invite_email_sent" in data
        assert "invite_whatsapp_sent" in data
        # WhatsApp disabled → must be False
        assert data["invite_whatsapp_sent"] is False
        # cleanup
        mid = data.get("id") or data.get("_id")
        if mid:
            s.delete(f"{BASE}/api/circle/members/{mid}")

    def test_add_without_phone_backcompat(self, s):
        pin = f"TEST_pin_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{BASE}/api/circle/members", json={
            "user_pin": pin,
            "name": "TEST_Family_NoPhone",
            "relation": "parent",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invite_email_sent" in data
        assert data.get("invite_whatsapp_sent") is False
        mid = data.get("id") or data.get("_id")
        if mid:
            s.delete(f"{BASE}/api/circle/members/{mid}")


# ------------------------------ Admin WhatsApp status ----------------------------------
class TestWhatsAppAdminStatus:
    def test_non_admin_gets_403(self, non_admin_token):
        r = requests.get(
            f"{BASE}/api/admin/whatsapp/status",
            headers={"Authorization": f"Bearer {non_admin_token}"},
        )
        assert r.status_code == 403, r.text

    def test_no_auth_gets_401_or_403(self):
        r = requests.get(f"{BASE}/api/admin/whatsapp/status")
        assert r.status_code in (401, 403), r.text

    def test_admin_gets_200_with_fields(self, admin_token):
        r = requests.get(
            f"{BASE}/api/admin/whatsapp/status",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("enabled", "has_access_token", "has_phone_number_id",
                  "has_business_account_id", "mode"):
            assert k in data, f"Missing {k} in {data}"
        # WHATSAPP_ENABLED=0 → stub mode
        assert data["enabled"] is False
        assert data["mode"] == "stub"


# ------------------------------ Log skip line ----------------------------------
def test_backend_log_has_stub_skip_marker(s):
    """Trigger a WhatsApp call path (circle member with phone), then grep logs."""
    pin = f"TEST_pin_log_{uuid.uuid4().hex[:6]}"
    r = s.post(f"{BASE}/api/circle/members", json={
        "user_pin": pin, "name": "TEST_LogTrigger", "phone": "+919999999999",
    })
    assert r.status_code == 200
    time.sleep(1)
    # Read supervisor logs
    found = False
    for path in (
        "/var/log/supervisor/backend.err.log",
        "/var/log/supervisor/backend.out.log",
    ):
        try:
            with open(path, "r") as f:
                # tail
                content = f.read()[-40000:]
                if "WhatsApp send skipped (WHATSAPP_ENABLED=0)" in content:
                    found = True
                    break
        except FileNotFoundError:
            continue
    assert found, "Expected 'WhatsApp send skipped (WHATSAPP_ENABLED=0)' in backend logs"
    mid = r.json().get("id") or r.json().get("_id")
    if mid:
        s.delete(f"{BASE}/api/circle/members/{mid}")
