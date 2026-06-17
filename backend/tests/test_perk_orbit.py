"""Perk Orbit Backend API tests.
Covers: health, voucher CRUD, brand search, SMS extract, image extract,
ending-soon filter, points summary, memberships ROI, reward circle,
share/unshare, membership activate (mocked Razorpay).
"""
import base64
import io
import os
from datetime import datetime, timedelta, timezone

import pytest
import requests
from PIL import Image, ImageDraw, ImageFont

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend/.env file
    from pathlib import Path
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL"):
            BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
PIN = "1234"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup(session):
    yield
    # remove all vouchers/members created for PIN
    try:
        for v in session.get(f"{API}/vouchers", params={"user_pin": PIN}).json():
            session.delete(f"{API}/vouchers/{v['id']}")
        for m in session.get(f"{API}/circle/members", params={"user_pin": PIN}).json():
            session.delete(f"{API}/circle/members/{m['id']}")
    except Exception:
        pass


# ---------- Health ----------
def test_health(session):
    r = session.get(f"{API}/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["db"] == "up"


# ---------- Voucher CRUD ----------
def test_voucher_crud_full_cycle(session, cleanup):
    # CREATE
    payload = {
        "user_pin": PIN, "brand": "TEST_Swiggy", "title": "TEST ₹100 off",
        "code": "TEST100", "value": 100, "expiry": "2026-12-31",
        "category": "vouchers", "points": 50,
    }
    r = session.post(f"{API}/vouchers", json=payload)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["brand"] == "TEST_Swiggy"
    assert v["code"] == "TEST100"
    assert "id" in v
    vid = v["id"]

    # LIST
    r = session.get(f"{API}/vouchers", params={"user_pin": PIN})
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert vid in ids

    # PATCH
    r = session.patch(f"{API}/vouchers/{vid}", json={"title": "TEST updated title"})
    assert r.status_code == 200
    assert r.json()["title"] == "TEST updated title"

    # Verify persistence
    r = session.get(f"{API}/vouchers", params={"user_pin": PIN})
    found = [x for x in r.json() if x["id"] == vid][0]
    assert found["title"] == "TEST updated title"

    # DELETE
    r = session.delete(f"{API}/vouchers/{vid}")
    assert r.status_code == 200
    assert r.json()["deleted"] == 1


# ---------- Brand parent mapping ----------
def test_brand_search_croma(session):
    r = session.get(f"{API}/search/brand", params={"q": "croma"})
    assert r.status_code == 200
    assert r.json()["parent_company"] == "Tata"


def test_brand_search_myntra(session):
    r = session.get(f"{API}/search/brand", params={"q": "myntra"})
    assert r.status_code == 200
    assert r.json()["parent_company"] == "Flipkart"


# ---------- LLM SMS extraction ----------
def test_extract_sms_swiggy(session):
    sms = "Flat ₹150 off on Swiggy! Use code SWIGGY150 valid till 25 Nov 2026."
    r = session.post(f"{API}/extract/sms", json={"text": sms}, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "swiggy" in (data.get("brand") or "").lower()
    assert (data.get("code") or "").upper() == "SWIGGY150"
    # value may be 150 or None depending on model
    if data.get("value") is not None:
        assert float(data["value"]) == 150 or float(data["value"]) >= 100


# ---------- LLM image extraction ----------
def _make_voucher_jpeg_b64():
    img = Image.new("RGB", (800, 400), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
        small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
    except Exception:
        font = ImageFont.load_default()
        small = ImageFont.load_default()
    d.text((40, 40), "MYNTRA", fill=(20, 20, 20), font=font)
    d.text((40, 110), "Flat Rs 500 OFF", fill=(20, 20, 20), font=font)
    d.text((40, 180), "Code: MYNTRA500", fill=(0, 100, 0), font=small)
    d.text((40, 240), "Valid till 31 Dec 2026", fill=(80, 80, 80), font=small)
    d.rectangle([20, 20, 780, 380], outline=(0, 0, 0), width=3)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def test_extract_image_voucher(session):
    b64 = _make_voucher_jpeg_b64()
    r = session.post(f"{API}/extract/image", json={"image_base64": b64}, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    # brand should be present in some shape
    assert data.get("brand") is not None
    # code likely MYNTRA500
    code = (data.get("code") or "").upper()
    assert "MYNTRA" in (data.get("brand") or "").upper() or "MYNTRA" in code


# ---------- ending-soon filter ----------
def test_ending_soon_filter(session, cleanup):
    today = datetime.now(timezone.utc).date()
    in3 = (today + timedelta(days=3)).isoformat()
    in30 = (today + timedelta(days=30)).isoformat()

    v1 = session.post(f"{API}/vouchers", json={
        "user_pin": PIN, "brand": "TEST_A", "title": "TEST 3-day",
        "expiry": in3, "category": "vouchers", "code": "T3"
    }).json()
    v2 = session.post(f"{API}/vouchers", json={
        "user_pin": PIN, "brand": "TEST_B", "title": "TEST 30-day",
        "expiry": in30, "category": "vouchers", "code": "T30"
    }).json()

    r = session.get(f"{API}/vouchers/ending-soon", params={"user_pin": PIN, "days": 7})
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert v1["id"] in ids
    assert v2["id"] not in ids

    # cleanup these specifically
    session.delete(f"{API}/vouchers/{v1['id']}")
    session.delete(f"{API}/vouchers/{v2['id']}")


# ---------- Points summary ----------
def test_points_summary(session, cleanup):
    v = session.post(f"{API}/vouchers", json={
        "user_pin": PIN, "brand": "TEST_Loyalty", "title": "TEST pts",
        "points": 400, "category": "vouchers"
    }).json()
    r = session.get(f"{API}/points/summary", params={"user_pin": PIN})
    assert r.status_code == 200
    data = r.json()
    assert data["total_points"] >= 400
    assert data["approx_value_inr"] >= 100  # 400 * 0.25
    assert any(b["brand"] == "TEST_Loyalty" for b in data["breakdown"])
    session.delete(f"{API}/vouchers/{v['id']}")


# ---------- Membership ROI ----------
def test_memberships_roi(session, cleanup):
    m = session.post(f"{API}/vouchers", json={
        "user_pin": PIN, "brand": "TEST_Croma", "title": "TEST Croma Privileges",
        "category": "memberships", "membership_kind": "asset",
        "fee_paid": 1000, "savings_realized": 500,
    }).json()
    r = session.get(f"{API}/memberships/roi", params={"user_pin": PIN})
    assert r.status_code == 200
    found = [x for x in r.json() if x["id"] == m["id"]]
    assert found, "membership not in ROI list"
    item = found[0]
    assert item["roi_progress"] == 50.0
    assert item["break_even"] is False
    session.delete(f"{API}/vouchers/{m['id']}")


# ---------- Reward Circle ----------
def test_circle_member_crud(session, cleanup):
    r = session.post(f"{API}/circle/members", json={
        "user_pin": PIN, "name": "TEST_Priya", "relation": "Wife"
    })
    assert r.status_code == 200
    m = r.json()
    assert m["invite_token"]
    mid = m["id"]

    r = session.get(f"{API}/circle/members", params={"user_pin": PIN})
    ids = [x["id"] for x in r.json()]
    assert mid in ids

    r = session.delete(f"{API}/circle/members/{mid}")
    assert r.status_code == 200
    assert r.json()["deleted"] == 1


def test_share_and_unshare(session, cleanup):
    v = session.post(f"{API}/vouchers", json={
        "user_pin": PIN, "brand": "TEST_Share", "title": "TEST share voucher",
        "category": "vouchers"
    }).json()
    vid = v["id"]

    r = session.post(f"{API}/circle/share", json={
        "user_pin": PIN, "voucher_id": vid, "family_member_name": "TEST_Priya"
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_sharing"] is True
    assert "TEST_Priya" in data["shared_with"]

    r = session.post(f"{API}/circle/unshare/{vid}", params={"user_pin": PIN})
    assert r.status_code == 200
    data = r.json()
    assert data["is_sharing"] is False
    assert data["shared_with"] == []
    session.delete(f"{API}/vouchers/{vid}")


# ---------- Membership activate / status ----------
def test_membership_activate_and_status(session):
    r = session.post(f"{API}/membership/activate", params={"user_pin": PIN})
    assert r.status_code == 200
    data = r.json()
    assert data["active"] is True
    assert "Perk Orbit Pro" in data["plan"]
    assert data["referral_code"].startswith("PERK-")

    r = session.get(f"{API}/membership/status", params={"user_pin": PIN})
    assert r.status_code == 200
    status = r.json()
    assert status["active"] is True
    assert status["referral_code"] == data["referral_code"]
