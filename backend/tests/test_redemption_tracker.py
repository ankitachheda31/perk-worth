"""
Iteration 13 — Redemption Tracker backend regression tests.
Covers: POST /api/vouchers/{id}/redeem, /unredeem, GET /api/vouchers/savings-stats,
and the status filter on GET /api/vouchers.
"""
import os
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
PIN = "1234"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _create_voucher(api, value=500, brand="TEST_RedemptionBrand", title="TEST_redeem_voucher"):
    payload = {
        "user_pin": PIN,
        "type": "voucher",
        "brand": brand,
        "title": title,
        "code": "TESTRDM01",
        "value": value,
        "currency": "INR",
        "expiry": "2099-12-31",
        "owner": "Self",
        "category": "vouchers",
    }
    r = api.post(f"{BASE_URL}/api/vouchers", json=payload)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data
    return data


@pytest.fixture(scope="module")
def created_ids(api_client):
    ids = []
    yield ids
    # teardown — best-effort delete
    for vid in ids:
        try:
            api_client.delete(f"{BASE_URL}/api/vouchers/{vid}")
        except Exception:
            pass


# ---------- Health ----------
def test_health(api_client):
    r = api_client.get(f"{BASE_URL}/api/")
    assert r.status_code in (200, 404)  # tolerate either


# ---------- Redeem default (uses voucher.value) ----------
def test_redeem_with_default_savings(api_client, created_ids):
    v = _create_voucher(api_client, value=500, title="TEST_redeem_default")
    vid = v["id"]; created_ids.append(vid)
    r = api_client.post(f"{BASE_URL}/api/vouchers/{vid}/redeem", json={})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "redeemed"
    assert data.get("savings_realized") == 500
    assert data.get("redeemed_at"), "redeemed_at must be set"
    # ensure ISO format-ish
    assert "T" in data["redeemed_at"]


# ---------- Redeem with override ----------
def test_redeem_with_override_savings(api_client, created_ids):
    v = _create_voucher(api_client, value=500, title="TEST_redeem_override")
    vid = v["id"]; created_ids.append(vid)
    r = api_client.post(f"{BASE_URL}/api/vouchers/{vid}/redeem", json={"savings_realized": 250})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "redeemed"
    assert data.get("savings_realized") == 250


# ---------- List hides redeemed by default ----------
def test_list_hides_redeemed_by_default(api_client, created_ids):
    # ensure at least 1 redeemed voucher exists
    v = _create_voucher(api_client, value=100, title="TEST_redeem_hide")
    vid = v["id"]; created_ids.append(vid)
    api_client.post(f"{BASE_URL}/api/vouchers/{vid}/redeem", json={})
    r = api_client.get(f"{BASE_URL}/api/vouchers", params={"user_pin": PIN})
    assert r.status_code == 200
    ids = {x["id"] for x in r.json()}
    assert vid not in ids, "Redeemed voucher should NOT appear in default list"


# ---------- List status=redeemed returns only redeemed ----------
def test_list_status_redeemed(api_client, created_ids):
    v = _create_voucher(api_client, value=100, title="TEST_redeem_filter")
    vid = v["id"]; created_ids.append(vid)
    api_client.post(f"{BASE_URL}/api/vouchers/{vid}/redeem", json={})
    r = api_client.get(f"{BASE_URL}/api/vouchers", params={"user_pin": PIN, "status": "redeemed"})
    assert r.status_code == 200
    items = r.json()
    assert all(x.get("status") == "redeemed" for x in items), "All returned must be redeemed"
    assert vid in {x["id"] for x in items}


# ---------- Unredeem reverts ----------
def test_unredeem_reverts_to_active(api_client, created_ids):
    v = _create_voucher(api_client, value=300, title="TEST_unredeem")
    vid = v["id"]; created_ids.append(vid)
    api_client.post(f"{BASE_URL}/api/vouchers/{vid}/redeem", json={})
    r = api_client.post(f"{BASE_URL}/api/vouchers/{vid}/unredeem")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "active"
    assert (data.get("savings_realized") or 0) == 0
    # appears in default list again
    lst = api_client.get(f"{BASE_URL}/api/vouchers", params={"user_pin": PIN}).json()
    assert vid in {x["id"] for x in lst}


# ---------- Savings stats aggregation ----------
def test_savings_stats(api_client, created_ids):
    # create + redeem two vouchers
    v1 = _create_voucher(api_client, value=400, brand="TEST_StatsA", title="TEST_stats_1")
    v2 = _create_voucher(api_client, value=600, brand="TEST_StatsB", title="TEST_stats_2")
    created_ids.extend([v1["id"], v2["id"]])
    api_client.post(f"{BASE_URL}/api/vouchers/{v1['id']}/redeem", json={})
    api_client.post(f"{BASE_URL}/api/vouchers/{v2['id']}/redeem", json={"savings_realized": 150})
    r = api_client.get(f"{BASE_URL}/api/vouchers/savings-stats", params={"user_pin": PIN})
    assert r.status_code == 200, r.text
    s = r.json()
    for k in ("total_saved", "this_year_saved", "count_total", "count_this_year", "current_year", "by_owner"):
        assert k in s, f"missing key {k}"
    assert s["current_year"] == datetime.now(timezone.utc).year
    assert s["count_total"] >= 2
    assert s["total_saved"] >= 400 + 150
    assert isinstance(s["by_owner"], list)
    # by_owner items shape
    for o in s["by_owner"]:
        assert "owner" in o and "saved" in o and "count" in o


# ---------- Edge: redeem non-existent voucher → 404 ----------
def test_redeem_not_found(api_client):
    r = api_client.post(f"{BASE_URL}/api/vouchers/64b8f3c2c8e4a1b2c3d4e5f6/redeem", json={})
    assert r.status_code == 404


# ---------- Edge: redeem invalid id → 400 ----------
def test_redeem_invalid_id(api_client):
    r = api_client.post(f"{BASE_URL}/api/vouchers/not-an-id/redeem", json={})
    assert r.status_code == 400


# ---------- Edge: unredeem non-existent → 404 ----------
def test_unredeem_not_found(api_client):
    r = api_client.post(f"{BASE_URL}/api/vouchers/64b8f3c2c8e4a1b2c3d4e5f6/unredeem")
    assert r.status_code == 404
