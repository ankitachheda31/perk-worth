"""Backend tests for Razorpay webhook + GDPR/DPDP wallet export (iteration 6).

Covers:
- POST /api/payments/webhook (signature verification, idempotency, payment.captured/failed/refund.created)
- GET  /api/user/export (auth gating, JSON/CSV formats, invalid format, voucher row inclusion)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
if not BASE_URL:
    # Fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "perkworth_test_webhook_secret_2026")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def sign(body: bytes) -> str:
    return hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()


def webhook_body(event_id: str, event: str = "payment.captured", *, order_id="order_test_1", payment_id="pay_test_1", status="captured") -> bytes:
    return json.dumps({
        "id": event_id,
        "event": event,
        "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id, "status": status}}},
    }, separators=(",", ":")).encode()


# ---------------------------------------------------------------------------
# Fixtures: a fresh authenticated user (cookie-based)
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def session_user():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = f"TEST_export_{int(time.time())}@perkworth.com"
    password = "test1234"
    r = s.post(f"{BASE_URL}/api/auth/signup", json={"email": email, "password": password, "name": "Export Test"})
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    # Some apps also need explicit login; try login to ensure cookie/token
    r2 = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r2.status_code == 200 and "token" in (r2.json() if r2.headers.get("content-type", "").startswith("application/json") else {}):
        token = r2.json().get("token")
        if token:
            s.headers["Authorization"] = f"Bearer {token}"
    # /me should work
    me = s.get(f"{BASE_URL}/api/auth/me")
    assert me.status_code == 200, f"/auth/me failed: {me.status_code} {me.text}"
    user = me.json()
    return {"session": s, "user": user, "email": email}


# ---------------------------------------------------------------------------
# WEBHOOK TESTS
# ---------------------------------------------------------------------------
class TestWebhook:
    def test_invalid_signature_returns_400(self):
        body = webhook_body(f"evt_{uuid.uuid4().hex}")
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": "deadbeef"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        assert "signature" in r.text.lower()

    def test_missing_signature_header_returns_400(self):
        body = webhook_body(f"evt_{uuid.uuid4().hex}")
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 400, f"expected 400 (not 500), got {r.status_code}: {r.text}"

    def test_payment_captured_returns_ok_applied(self):
        ev_id = f"evt_{uuid.uuid4().hex}"
        body = webhook_body(ev_id, event="payment.captured", order_id=f"order_{uuid.uuid4().hex[:8]}", payment_id=f"pay_{uuid.uuid4().hex[:8]}")
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": sign(body)},
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("ok") is True
        assert data.get("applied") == "payment.captured"

    def test_duplicate_event_returns_duplicate_true(self):
        ev_id = f"evt_{uuid.uuid4().hex}"
        body = webhook_body(ev_id, event="payment.captured", order_id=f"order_{uuid.uuid4().hex[:8]}", payment_id=f"pay_{uuid.uuid4().hex[:8]}")
        headers = {"Content-Type": "application/json", "X-Razorpay-Signature": sign(body)}
        r1 = requests.post(f"{BASE_URL}/api/payments/webhook", data=body, headers=headers)
        assert r1.status_code == 200
        r2 = requests.post(f"{BASE_URL}/api/payments/webhook", data=body, headers=headers)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2.get("ok") is True
        assert d2.get("duplicate") is True, f"expected duplicate:true, got {d2}"

    def test_payment_failed_returns_applied(self):
        ev_id = f"evt_{uuid.uuid4().hex}"
        body = webhook_body(ev_id, event="payment.failed", order_id=f"order_{uuid.uuid4().hex[:8]}", payment_id=f"pay_{uuid.uuid4().hex[:8]}", status="failed")
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": sign(body)},
        )
        assert r.status_code == 200
        assert r.json().get("applied") == "payment.failed"

    def test_refund_created_returns_applied(self):
        ev_id = f"evt_{uuid.uuid4().hex}"
        body = webhook_body(ev_id, event="refund.created", order_id=f"order_{uuid.uuid4().hex[:8]}", payment_id=f"pay_{uuid.uuid4().hex[:8]}", status="refunded")
        r = requests.post(
            f"{BASE_URL}/api/payments/webhook",
            data=body,
            headers={"Content-Type": "application/json", "X-Razorpay-Signature": sign(body)},
        )
        assert r.status_code == 200
        assert r.json().get("applied") == "refund.created"


# ---------------------------------------------------------------------------
# EXPORT TESTS
# ---------------------------------------------------------------------------
class TestExport:
    def test_export_without_auth_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/user/export?format=json")
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_export_json_with_auth(self, session_user):
        s = session_user["session"]
        r = s.get(f"{BASE_URL}/api/user/export", params={"format": "json"})
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower(), f"missing attachment in Content-Disposition: {cd}"
        body = r.json()
        # Required top-level keys
        for k in ("exported_at", "exported_for", "spec_compliance", "collections"):
            assert k in body, f"missing top-level key {k}"
        assert body["spec_compliance"].get("dpdp_2023"), "dpdp_2023 key missing"
        assert body["spec_compliance"].get("gdpr"), "gdpr key missing"
        expected_colls = {"vouchers", "circle_members", "app_membership", "payments", "notifications", "referrals", "support_history"}
        assert expected_colls.issubset(set(body["collections"].keys())), f"missing collections; got {set(body['collections'].keys())}"

    def test_export_csv_with_auth(self, session_user):
        s = session_user["session"]
        r = s.get(f"{BASE_URL}/api/user/export", params={"format": "csv"})
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        ctype = r.headers.get("Content-Type", "")
        assert "text/csv" in ctype, f"content-type not csv: {ctype}"
        text = r.text
        assert text.startswith("# PerkWorth · Personal Data Export"), f"unexpected CSV header: {text[:80]!r}"
        assert "## vouchers" in text
        assert "## payments" in text

    def test_export_xml_returns_422(self, session_user):
        s = session_user["session"]
        r = s.get(f"{BASE_URL}/api/user/export", params={"format": "xml"})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"

    def test_export_contains_user_voucher(self, session_user):
        s = session_user["session"]
        user = session_user["user"]
        # The user_pin in webhook_export.fetch is uid (user["_id"]). The /auth/me payload may return id or _id.
        uid = user.get("_id") or user.get("id") or user.get("user_id")
        assert uid, f"could not determine user id from /auth/me payload: {user}"
        # Create a voucher tied to this user
        v = {
            "user_pin": uid,
            "type": "voucher",
            "brand": "TEST_BrandExport",
            "title": "TEST export voucher",
            "code": "TESTEXPORT",
            "value": 100,
            "category": "vouchers",
        }
        cr = s.post(f"{BASE_URL}/api/vouchers", json=v)
        assert cr.status_code in (200, 201), f"voucher create failed: {cr.status_code} {cr.text}"
        # Fetch export
        r = s.get(f"{BASE_URL}/api/user/export", params={"format": "json"})
        assert r.status_code == 200
        body = r.json()
        vouchers = body["collections"]["vouchers"]
        # Find our voucher
        found = [x for x in vouchers if x.get("code") == "TESTEXPORT" or x.get("brand") == "TEST_BrandExport"]
        assert found, f"voucher not present in export; got {len(vouchers)} rows; sample={vouchers[:2]}"
