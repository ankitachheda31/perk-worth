"""PerkWorth iteration 17 — Loyalty registry + classifier + voucher membership fields.

Tests against the public REACT_APP_BACKEND_URL.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
TEST_EMAIL = "test@perkorbit.app"
TEST_PASSWORD = "Perk@1234"
TEST_PIN = "1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"auth failed: {r.status_code} {r.text[:200]}")
    return s


# ---------- Loyalty registry ----------
class TestLoyaltyPrograms:
    def test_programs_endpoint(self, session):
        r = session.get(f"{BASE_URL}/api/loyalty/programs", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "version" in data
        assert "field_labels" in data
        assert "programs" in data
        labels = data["field_labels"]
        expected_keys = {"airline", "hotel", "fuel", "retail", "ecommerce", "banking_rewards",
                         "fintech", "ott", "music", "telecom", "cab_mobility", "ota_travel",
                         "food_qsr", "entertainment", "fitness", "healthcare", "news",
                         "education", "automotive", "insurance", "beauty", "lounge", "generic"}
        assert expected_keys.issubset(set(labels.keys())), f"missing labels: {expected_keys - set(labels.keys())}"
        assert len(labels) == 23
        assert len(data["programs"]) >= 149, f"only {len(data['programs'])} programs found"


# ---------- Classifier ----------
class TestLoyaltyClassify:
    @pytest.mark.parametrize("brand,expected_type,expected_brand", [
        ("indigo", "airline", "IndiGo"),
        ("hpcl", "fuel", "HPCL"),
        ("cred", "fintech", "CRED"),
        ("pvr", "entertainment", "PVR INOX"),
        ("bookmyshow", "entertainment", "BookMyShow"),
        ("trident", "hotel", "Trident Hotels"),
        ("welcomhotel", "hotel", "Welcomhotel by ITC"),
        ("pw", "education", "PhysicsWallah"),
        ("aakash", "education", "Aakash Institute"),
        ("hdfc bank", "banking_rewards", "HDFC Bank"),
        ("axis", "banking_rewards", "Axis Bank"),
        ("tata neu", "retail", "Tata Neu"),
        ("netflix", "ott", "Netflix"),
        ("spotify", "music", "Spotify"),
    ])
    def test_alias_classification(self, session, brand, expected_type, expected_brand):
        r = session.get(f"{BASE_URL}/api/loyalty/classify", params={"brand": brand}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["matched"] is True, f"{brand} not matched: {data}"
        assert data["brand"] == expected_brand, f"{brand} → {data['brand']} (expected {expected_brand})"
        assert data["type"] == expected_type
        assert data["category"] == "memberships"
        assert "field_label" in data and data["field_label"] is not None

    def test_indigo_full_response(self, session):
        r = session.get(f"{BASE_URL}/api/loyalty/classify", params={"brand": "indigo"}, timeout=10)
        d = r.json()
        assert d["matched"] is True
        assert d["brand"] == "IndiGo"
        assert d["program"] == "6E Rewards"
        assert d["type"] == "airline"
        assert d["membership_kind"] == "content"
        assert d["category"] == "memberships"
        assert d["field_label"]["label"] == "Frequent Flyer Number"

    def test_unknown_brand_returns_generic(self, session):
        r = session.get(f"{BASE_URL}/api/loyalty/classify", params={"brand": "Foobar"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["matched"] is False
        assert d["field_label"] is not None
        assert d["field_label"]["label"] == "Membership Number"

    def test_substring_3char_match(self, session):
        # 'indi' (4 chars) should substring-match IndiGo via aliases
        r = session.get(f"{BASE_URL}/api/loyalty/classify", params={"brand": "indi"}, timeout=10)
        d = r.json()
        assert d["matched"] is True
        assert d["brand"] == "IndiGo"

    def test_substring_2char_no_false_positive(self, session):
        # 'ax' is 2 chars — should NOT substring-match (only exact match)
        # 'ax' is not an exact alias for Axis Bank (alias is 'axis')
        r = session.get(f"{BASE_URL}/api/loyalty/classify", params={"brand": "ax"}, timeout=10)
        d = r.json()
        # Must not match 'axis' via 2-char substring
        assert d["matched"] is False, f"2-char 'ax' should not match: got {d}"


# ---------- Voucher membership_number + program_type ----------
class TestVoucherMembershipFields:
    _created_ids = []

    def test_create_membership_voucher(self, session):
        payload = {
            "user_pin": TEST_PIN,
            "title": "TEST_IndiGo Membership",
            "brand": "IndiGo",
            "category": "memberships",
            "kind": "content",
            "membership_number": "6E12345678",
            "program_type": "airline",
            "start_date": "2026-01-01",
            "expiry_date": "2027-01-01",
        }
        r = session.post(f"{BASE_URL}/api/vouchers", json=payload, timeout=15)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        assert data.get("membership_number") == "6E12345678"
        assert data.get("program_type") == "airline"
        assert data.get("category") == "memberships"
        assert "id" in data
        TestVoucherMembershipFields._created_ids.append(data["id"])

    def test_get_vouchers_returns_membership_fields(self, session):
        assert TestVoucherMembershipFields._created_ids, "create test must run first"
        vid = TestVoucherMembershipFields._created_ids[0]
        r = session.get(f"{BASE_URL}/api/vouchers", params={"user_pin": TEST_PIN}, timeout=15)
        assert r.status_code == 200
        items = r.json()
        match = next((v for v in items if v.get("id") == vid), None)
        assert match is not None, f"voucher {vid} not found in list"
        assert match.get("membership_number") == "6E12345678"
        assert match.get("program_type") == "airline"

    def test_patch_membership_fields(self, session):
        assert TestVoucherMembershipFields._created_ids, "create test must run first"
        vid = TestVoucherMembershipFields._created_ids[0]
        r = session.patch(
            f"{BASE_URL}/api/vouchers/{vid}",
            params={"user_pin": TEST_PIN},
            json={"membership_number": "6E99999999", "program_type": "airline"},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"{r.status_code}: {r.text[:300]}"
        # verify by re-fetching
        r2 = session.get(f"{BASE_URL}/api/vouchers", params={"user_pin": TEST_PIN}, timeout=15)
        match = next((v for v in r2.json() if v.get("id") == vid), None)
        assert match is not None
        assert match.get("membership_number") == "6E99999999"

    @classmethod
    def teardown_class(cls):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        try:
            s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=10)
            for vid in cls._created_ids:
                s.delete(f"{BASE_URL}/api/vouchers/{vid}", params={"user_pin": TEST_PIN}, timeout=10)
        except Exception:
            pass


# ---------- Regression: critical endpoints ----------
class TestRegression:
    @pytest.mark.parametrize("path,needs_pin", [
        ("/api/cards", False),
        ("/api/vouchers", True),
        ("/api/notifications", True),
        ("/api/membership/status", True),
    ])
    def test_endpoint_ok(self, session, path, needs_pin):
        params = {"user_pin": TEST_PIN} if needs_pin else None
        r = session.get(f"{BASE_URL}{path}", params=params, timeout=15)
        assert r.status_code == 200, f"{path} returned {r.status_code}: {r.text[:200]}"
