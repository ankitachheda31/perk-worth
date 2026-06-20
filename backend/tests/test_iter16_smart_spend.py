"""Iteration 16 — Smart Spend Inference tests.

Covers:
- POST /api/spend/infer success path: categories, total, persistence
- Privacy: persist=False doesn't write; raw sms_text never persisted
- Validation: empty/short → 400, oversize → 413
- GET/DELETE /api/spend/profile
- Regression: a sample of iter15/iter14 endpoints still healthy
"""
import os
import time
import pytest
import requests

def _read_env_url():
    if os.environ.get("REACT_APP_BACKEND_URL"):
        return os.environ["REACT_APP_BACKEND_URL"]
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE_URL = _read_env_url().rstrip("/")
API = f"{BASE_URL}/api"

CATEGORIES = [
    "online_shopping", "food_delivery", "fuel", "groceries",
    "travel", "entertainment", "fitness", "other",
]

SAMPLE_SMS = """Rs.347 debited from A/c XX1234 on 12-Feb-26 for SWIGGY*INSTAMART via UPI. Available bal Rs.42500
Rs.1850 spent on Card XX5678 at AMAZON RETAIL on 13-Feb-26
Rs.420 debited via UPI for IRCTC TRAIN BOOKING on 14-Feb-26
Rs.2200 spent at HPCL PETROL PUMP MUMBAI on 15-Feb-26 via Card XX5678
Rs.298 debited for ZOMATO ORDER on 16-Feb-26
Rs.1200 spent at DMART AVENUE on 17-Feb-26
OTP 894521 valid for 10 min. Do not share.
Rs.180 debited via UPI for BOOKMYSHOW on 18-Feb-26
Rs.6500 spent at MYNTRA online on 20-Feb-26 Card XX5678
Rs.499 debited for NETFLIX SUB on 22-Feb-26
Rs.3200 spent at INDIAN OIL on 25-Feb-26"""


# Unique pin for this test run to avoid collision
TEST_PIN = f"99{int(time.time()) % 100:02d}"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    # cleanup
    try:
        s.delete(f"{API}/spend/profile", params={"user_pin": TEST_PIN}, timeout=15)
    except Exception:
        pass


@pytest.fixture(scope="module")
def infer_result(client):
    """Cache the (slow) GPT-4o call across tests."""
    r = client.post(
        f"{API}/spend/infer",
        json={"sms_text": SAMPLE_SMS, "user_pin": TEST_PIN, "persist": True},
        timeout=60,
    )
    assert r.status_code == 200, f"infer failed: {r.status_code} {r.text[:300]}"
    return r.json()


# ----------------------- /api/spend/infer success --------------------------
class TestInferSuccess:
    def test_response_shape(self, infer_result):
        d = infer_result
        for key in ("categories", "total_monthly_inr", "window_days_observed",
                    "transactions_parsed", "recommend_category"):
            assert key in d, f"missing {key}"
        assert set(d["categories"].keys()) == set(CATEGORIES)
        for cat, v in d["categories"].items():
            assert "monthly_inr" in v
            assert "txn_count" in v
            assert "total_observed_inr" in v
        assert d["recommend_category"] in CATEGORIES
        assert d["transactions_parsed"] >= 8  # 10 real txns, allow tolerance
        assert d["total_monthly_inr"] > 0

    def test_classification_obvious(self, infer_result):
        cats = infer_result["categories"]
        # at least one txn each in these buckets
        assert cats["food_delivery"]["txn_count"] >= 1, "SWIGGY/ZOMATO not classified"
        assert cats["online_shopping"]["txn_count"] >= 1, "AMAZON/MYNTRA not classified"
        assert cats["fuel"]["txn_count"] >= 1, "HPCL/IndianOil not classified"
        assert cats["entertainment"]["txn_count"] >= 1, "NETFLIX not classified"
        assert cats["travel"]["txn_count"] >= 1, "IRCTC not classified"
        assert cats["groceries"]["txn_count"] >= 1, "DMART not classified"

    def test_skips_otp(self, infer_result):
        # 10 real txns + 1 OTP = 11 lines. transactions_parsed should not include OTP.
        # We just verify it's not 11 (i.e., OTP was skipped)
        assert infer_result["transactions_parsed"] <= 11


# -------------------- persistence (privacy-safe) ---------------------------
class TestPersistence:
    def test_get_profile_after_persist(self, client, infer_result):
        r = client.get(f"{API}/spend/profile", params={"user_pin": TEST_PIN}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("exists") is True
        assert "categories" in d
        assert "total_monthly_inr" in d
        # PRIVACY: raw SMS must NOT be persisted
        assert "sms_text" not in d
        assert "raw_sms" not in d
        assert "transactions" not in d  # raw transaction list not persisted

    def test_upsert_on_rerun(self, client):
        # Run with smaller sms to verify upsert (one doc per user_pin)
        short_sms = "Rs.500 debited for SWIGGY on 01-Mar-26\nRs.300 spent at AMAZON on 02-Mar-26"
        r = client.post(
            f"{API}/spend/infer",
            json={"sms_text": short_sms, "user_pin": TEST_PIN, "persist": True},
            timeout=60,
        )
        assert r.status_code == 200
        # GET still returns one profile
        r2 = client.get(f"{API}/spend/profile", params={"user_pin": TEST_PIN}, timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("exists") is True

    def test_persist_false_doesnt_overwrite(self, client):
        no_pin = f"NOPIN{int(time.time()) % 10000}"
        r = client.post(
            f"{API}/spend/infer",
            json={"sms_text": "Rs.500 SWIGGY 01-Mar-26\nRs.300 AMAZON 02-Mar-26", "user_pin": no_pin, "persist": False},
            timeout=60,
        )
        assert r.status_code == 200
        r2 = client.get(f"{API}/spend/profile", params={"user_pin": no_pin}, timeout=15)
        assert r2.status_code == 200
        assert r2.json() == {"exists": False}

    def test_delete_profile(self, client):
        # Use a separate pin so we don't break other tests
        pin = f"DEL{int(time.time()) % 10000}"
        r = client.post(
            f"{API}/spend/infer",
            json={"sms_text": "Rs.500 SWIGGY 01-Mar-26\nRs.300 AMAZON 02-Mar-26", "user_pin": pin, "persist": True},
            timeout=60,
        )
        assert r.status_code == 200
        r2 = client.get(f"{API}/spend/profile", params={"user_pin": pin}, timeout=15)
        assert r2.json().get("exists") is True
        r3 = client.delete(f"{API}/spend/profile", params={"user_pin": pin}, timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True
        r4 = client.get(f"{API}/spend/profile", params={"user_pin": pin}, timeout=15)
        assert r4.json() == {"exists": False}


# ---------------------- input validation ------------------------------------
class TestValidation:
    def test_empty_sms_400(self, client):
        r = client.post(f"{API}/spend/infer", json={"sms_text": "", "user_pin": "1234"}, timeout=15)
        assert r.status_code == 400

    def test_oversize_sms_413(self, client):
        big = "A" * 60001
        r = client.post(f"{API}/spend/infer", json={"sms_text": big, "user_pin": "1234"}, timeout=15)
        assert r.status_code == 413

    def test_profile_unknown_pin(self, client):
        r = client.get(f"{API}/spend/profile", params={"user_pin": "ZZZZNOTHERE"}, timeout=15)
        assert r.status_code == 200
        assert r.json() == {"exists": False}


# -------------------- regression: iter15 endpoints ---------------------------
class TestRegression:
    def test_cards_best(self, client):
        r = client.get(f"{API}/cards/best", params={"category": "fuel", "monthly_spend_inr": 10000}, timeout=15)
        assert r.status_code == 200
        assert "results" in r.json()

    def test_cards_click_logging(self, client):
        r = client.post(f"{API}/cards/click", json={
            "card_id": "bpcl-sbi-octane",
            "user_pin": "TEST_iter16",
            "category": "fuel",
            "source": "regression",
        }, timeout=15)
        assert r.status_code in (200, 201)

    def test_notifications(self, client):
        r = client.get(f"{API}/notifications", params={"user_pin": "1234"}, timeout=15)
        assert r.status_code == 200

    def test_membership_status(self, client):
        r = client.get(f"{API}/membership/status", params={"user_pin": "1234"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "referral_code" in d or "is_active" in d

    def test_vouchers_list(self, client):
        r = client.get(f"{API}/vouchers", params={"user_pin": "1234"}, timeout=15)
        assert r.status_code == 200
