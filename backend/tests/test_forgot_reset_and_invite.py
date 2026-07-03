"""Backend regression tests for forgot/reset password + family-circle invite email."""
from __future__ import annotations

import asyncio
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests
from bson import ObjectId
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
# Read backend env directly for Mongo introspection
def _read_env(key):
    try:
        for line in open("/app/backend/.env").read().splitlines():
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    except Exception:
        return None
    return None

MONGO_URL = _read_env("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = _read_env("DB_NAME") or "perk_orbit"


def _new_email(prefix="forgot-pwd-test"):
    return f"{prefix}+{secrets.token_hex(4)}@perkworth.com"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _db():
    return MongoClient(MONGO_URL)[DB_NAME]


# ---------------------------------------------------------------------------
# Forgot password — anti enumeration
# ---------------------------------------------------------------------------
class TestForgotPassword:
    def test_forgot_password_nonexistent_email_returns_200(self, s):
        r = s.post(f"{BASE_URL}/api/auth/forgot-password",
                   json={"email": f"nobody-{secrets.token_hex(4)}@perkworth.com"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "if an account exists" in body.get("message", "").lower()

    def test_forgot_password_existing_email_creates_record(self, s, db):
        email = _new_email()
        pw = "Original@1234"
        # Signup user
        r = s.post(f"{BASE_URL}/api/auth/signup",
                   json={"email": email, "password": pw, "name": "Forgot Tester"})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # Forgot
        r2 = s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
        # Verify DB row
        rec = db.password_resets.find_one({"user_id": uid, "used": False})
        assert rec is not None
        assert rec.get("token")
        assert rec.get("used") is False
        exp = rec.get("expires_at")
        assert isinstance(exp, datetime)
        exp_utc = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        delta = exp_utc - datetime.now(timezone.utc)
        # 60 minutes ± 2 mins tolerance
        assert timedelta(minutes=55) < delta < timedelta(minutes=65), f"expires_at delta = {delta}"
        # Stash for downstream tests via class attribute
        TestForgotPassword.created_email = email
        TestForgotPassword.created_uid = uid
        TestForgotPassword.created_pw = pw
        TestForgotPassword.created_token = rec["token"]


# ---------------------------------------------------------------------------
# Reset password — invalid, valid, replay, expired
# ---------------------------------------------------------------------------
class TestResetPassword:
    def test_reset_with_invalid_token_returns_400(self, s):
        r = s.post(f"{BASE_URL}/api/auth/reset-password",
                   json={"token": "bogus-token-xyz", "new_password": "newpass123"})
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower()

    def test_reset_with_valid_token_succeeds_and_autosigns(self, s):
        # Fresh user
        email = _new_email("reset-ok")
        s.post(f"{BASE_URL}/api/auth/signup",
               json={"email": email, "password": "Orig@1234", "name": "Reset OK"})
        s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
        db = _db()
        rec = db.password_resets.find_one({"email": email, "used": False})
        token = rec["token"]
        new_pw = "Brand@New99"
        r = requests.post(f"{BASE_URL}/api/auth/reset-password",
                          json={"token": token, "new_password": new_pw})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("access_token")
        assert body.get("email") == email
        assert body.get("id")
        # Old password no longer works
        r_old = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": "Orig@1234"})
        assert r_old.status_code == 401
        # New password works
        r_new = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": email, "password": new_pw})
        assert r_new.status_code == 200
        # Stash token for replay test
        TestResetPassword.used_token = token

    def test_reset_with_reused_token_returns_400(self, s):
        token = getattr(TestResetPassword, "used_token", None)
        assert token, "Prior test must run first"
        r = s.post(f"{BASE_URL}/api/auth/reset-password",
                   json={"token": token, "new_password": "Another@2233"})
        assert r.status_code == 400
        assert "invalid" in r.json().get("detail", "").lower() or "used" in r.json().get("detail", "").lower()

    def test_reset_with_expired_token_returns_400(self, s):
        email = _new_email("reset-exp")
        s.post(f"{BASE_URL}/api/auth/signup",
               json={"email": email, "password": "Orig@1234", "name": "Reset Exp"})
        s.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": email})
        db = _db()
        rec = db.password_resets.find_one({"email": email, "used": False})
        token = rec["token"]
        # Mutate expires_at to past
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.password_resets.update_one({"_id": rec["_id"]}, {"$set": {"expires_at": past}})
        r = s.post(f"{BASE_URL}/api/auth/reset-password",
                   json={"token": token, "new_password": "Whatever@99"})
        assert r.status_code == 400, r.text
        assert "expired" in r.json().get("detail", "").lower()


# ---------------------------------------------------------------------------
# Family Circle — invite email integration
# ---------------------------------------------------------------------------
class TestCircleInvite:
    def test_add_member_with_verified_email_sends_invite(self, s):
        user_pin = f"TEST_pin_{secrets.token_hex(3)}"
        r = s.post(f"{BASE_URL}/api/circle/members", json={
            "user_pin": user_pin,
            "email": "ankitagada31@gmail.com",
            "name": "Test Invitee",
            "relation": "Friend",
            "inviter_name": "Tester",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("email") == "ankitagada31@gmail.com"
        assert body.get("invite_email_sent") is True
        assert "id" in body
        # cleanup
        s.delete(f"{BASE_URL}/api/circle/members/{body['id']}")

    def test_add_member_with_unverified_email_returns_200_silently(self, s):
        user_pin = f"TEST_pin_{secrets.token_hex(3)}"
        r = s.post(f"{BASE_URL}/api/circle/members", json={
            "user_pin": user_pin,
            "email": f"someone-not-verified-{secrets.token_hex(3)}@example.com",
            "name": "Unverified",
            "relation": "Other",
            "inviter_name": "Tester",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        # With a verified Resend sender domain (perkworth.com), sends to arbitrary
        # recipients succeed. What we're guarding here is that the endpoint
        # NEVER 5xxs even if Resend fails — return 200 silently either way.
        assert "invite_email_sent" in body
        s.delete(f"{BASE_URL}/api/circle/members/{body['id']}")

    def test_add_member_without_email_backwards_compat(self, s):
        user_pin = f"TEST_pin_{secrets.token_hex(3)}"
        r = s.post(f"{BASE_URL}/api/circle/members", json={
            "user_pin": user_pin,
            "name": "No Email",
            "relation": "Cousin",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("invite_email_sent") is False
        assert body.get("email") in (None, "")
        # listing still works
        r2 = s.get(f"{BASE_URL}/api/circle/members", params={"user_pin": user_pin})
        assert r2.status_code == 200
        assert any(m.get("id") == body["id"] for m in r2.json())
        # remove still works
        r3 = s.delete(f"{BASE_URL}/api/circle/members/{body['id']}")
        assert r3.status_code == 200
        assert r3.json().get("deleted") == 1


# ---------------------------------------------------------------------------
# Regression: seeded login + core endpoints
# ---------------------------------------------------------------------------
class TestRegression:
    def test_seeded_login_works(self, s):
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "test@perkorbit.app", "password": "Perk@1234"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("access_token")
        TestRegression.token = data["access_token"]
        TestRegression.uid = data["id"]

    def test_auth_me_works(self, s):
        token = getattr(TestRegression, "token", None)
        assert token
        r = s.get(f"{BASE_URL}/api/auth/me",
                  headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json().get("email") == "test@perkorbit.app"

    def test_vouchers_list_works(self, s):
        uid = getattr(TestRegression, "uid", "probe")
        r = s.get(f"{BASE_URL}/api/vouchers", params={"user_pin": uid})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_circle_members_list_works(self, s):
        uid = getattr(TestRegression, "uid", "probe")
        r = s.get(f"{BASE_URL}/api/circle/members", params={"user_pin": uid})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_points_summary_works(self, s):
        uid = getattr(TestRegression, "uid", "probe")
        r = s.get(f"{BASE_URL}/api/points/summary", params={"user_pin": uid})
        assert r.status_code == 200
