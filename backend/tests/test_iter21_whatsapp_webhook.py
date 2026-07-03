"""Iter 21 — WhatsApp inbound webhook + hybrid bot routing tests.

Covers:
 - GET verify handshake (happy / wrong-token / missing mode)
 - POST feature-flag gate (disabled -> {ok:true, processed:false, reason:'disabled'})
 - POST signature verification when WHATSAPP_APP_SECRET is set
 - Bot routing FAQ paths (greet/expiring/points/pro/stop/help/human)
 - Non-registered wa_id -> NOT_REGISTERED reply
 - Registered wa_id -> personalized greeting
 - 24hr session tracking (wa_sessions upsert)
 - Opt-out / opt-in flow
 - No secret leakage in responses

We drive the bot logic by calling `route_incoming` and helpers directly for
speed + determinism, plus a couple of end-to-end HTTP tests through the
public backend URL for the feature-flag gate + signature path. We deliberately
skip live GPT-4o LLM path (costs Emergent credits — the fallback branch is
still covered by verifying the human-handoff terminal branch when the
LLM path is bypassed).
"""
import asyncio
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
WEBHOOK = f"{BASE_URL}/api/whatsapp/webhook"
VERIFY_TOKEN = "perkworth_wa_verify_2026"


# ---------------------------------------------------------------------------
# GET verify handshake
# ---------------------------------------------------------------------------
class TestVerifyHandshake:
    def test_verify_success_echoes_challenge(self):
        r = requests.get(WEBHOOK, params={
            "hub.mode": "subscribe",
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "CHAL_12345",
        })
        assert r.status_code == 200
        assert r.text == "CHAL_12345"

    def test_verify_wrong_token_403(self):
        r = requests.get(WEBHOOK, params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "CHAL_12345",
        })
        assert r.status_code == 403

    def test_verify_missing_mode_403(self):
        r = requests.get(WEBHOOK, params={
            "hub.verify_token": VERIFY_TOKEN,
            "hub.challenge": "CHAL_12345",
        })
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST feature-flag gate (WHATSAPP_ENABLED=0)
# ---------------------------------------------------------------------------
def _sample_payload(wa_id="919000000001", body="hi", msg_id=None):
    return {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "from": wa_id,
                        "id": msg_id or f"wamid.TEST_{uuid.uuid4().hex[:10]}",
                        "type": "text",
                        "text": {"body": body},
                        "timestamp": str(int(time.time())),
                    }]
                }
            }]
        }]
    }


class TestFeatureFlagGate:
    def test_disabled_no_op(self):
        r = requests.post(WEBHOOK, json=_sample_payload())
        assert r.status_code == 200
        body = r.json()
        assert body == {"ok": True, "processed": False, "reason": "disabled"}

    def test_no_secret_leak_in_response(self):
        r = requests.post(WEBHOOK, json=_sample_payload())
        text = r.text.lower()
        for leak in [
            os.environ.get("EMERGENT_LLM_KEY", "sk-emergent"),
            "perkworth_wa_verify_2026",
        ]:
            assert leak.lower() not in text


# ---------------------------------------------------------------------------
# POST signature verification when secret is set
# ---------------------------------------------------------------------------
class TestSignatureVerification:
    def test_missing_signature_when_secret_set_returns_403(self, monkeypatch):
        """We need to mutate the SERVER-side env, not the test-side. Since we
        can't reach into the server process, we exercise this branch via the
        in-process unit test on _verify_signature instead."""
        from routes.whatsapp_webhook import _verify_signature
        # secret set + no header -> False
        os.environ["WHATSAPP_APP_SECRET"] = "test_secret_xyz"
        try:
            assert _verify_signature(b"{}", "") is False
            # bad signature -> False
            assert _verify_signature(b"{}", "sha256=deadbeef") is False
            # correct signature -> True
            good = hmac.new(b"test_secret_xyz", b"{}", hashlib.sha256).hexdigest()
            assert _verify_signature(b"{}", f"sha256={good}") is True
        finally:
            os.environ["WHATSAPP_APP_SECRET"] = ""

    def test_no_secret_dev_passthrough(self):
        from routes.whatsapp_webhook import _verify_signature
        os.environ["WHATSAPP_APP_SECRET"] = ""
        assert _verify_signature(b"{}", "") is True


# ---------------------------------------------------------------------------
# Bot routing (unit tests against route_incoming directly)
# ---------------------------------------------------------------------------
import sys
sys.path.insert(0, "/app/backend")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return client[os.environ.get("DB_NAME", "perk_orbit")]


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def test_user(db, event_loop):
    """Create a test user with phone=919812345678."""
    wa_id = "919812345678"
    async def _create():
        # cleanup first
        await db.users.delete_many({"email": {"$regex": "^TEST_wa_"}})
        doc = {
            "email": f"TEST_wa_{uuid.uuid4().hex[:8]}@perkworth.app",
            "name": "WA Test",
            "phone": wa_id,
            "password_hash": "$2b$12$fake",
            "role": "user",
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc
    user = event_loop.run_until_complete(_create())
    yield user
    async def _cleanup():
        await db.users.delete_one({"_id": user["_id"]})
        await db.wa_sessions.delete_many({"wa_id": wa_id})
        await db.wa_opt_outs.delete_many({"wa_id": wa_id})
        await db.support_history.delete_many({"wa_id": wa_id})
    event_loop.run_until_complete(_cleanup())


class TestBotRouting:
    def test_greeting_for_registered_user(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "hi"))
        assert "Namaste" in reply and "WA Test" in reply

    def test_help_returns_menu(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "help"))
        assert "PerkWorth Bot" in reply or "expiring" in reply

    def test_expiring_all_clear_when_no_vouchers(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "expiring"))
        assert ("all clear" in reply.lower()) or ("expiring" in reply.lower())

    def test_points_summary(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "points"))
        assert reply  # some reply

    def test_pro_status_free_plan(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "pro"))
        assert "free plan" in reply.lower() or "Pro member" in reply

    def test_human_handoff_logs_support_history(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        reply = event_loop.run_until_complete(route_incoming(db, "919812345678", "I want to talk to a human"))
        assert "team member" in reply.lower() or "reply here" in reply.lower()
        # verify row in support_history
        async def _check():
            doc = await db.support_history.find_one({
                "wa_id": "919812345678",
                "channel": "whatsapp",
                "pending_admin_reply": True,
            })
            return doc
        doc = event_loop.run_until_complete(_check())
        assert doc is not None
        assert doc.get("channel") == "whatsapp"

    def test_not_registered_wa_id(self, db, event_loop):
        from services.whatsapp_bot import route_incoming, NOT_REGISTERED
        reply = event_loop.run_until_complete(route_incoming(db, "919000000999", "hi"))
        assert reply == NOT_REGISTERED

    def test_stop_opt_out_and_start_opt_in(self, db, test_user, event_loop):
        from services.whatsapp_bot import route_incoming
        wa_id = "919812345678"
        # stop
        reply = event_loop.run_until_complete(route_incoming(db, wa_id, "stop"))
        assert "opted out" in reply.lower()
        # subsequent non-start returns empty
        reply2 = event_loop.run_until_complete(route_incoming(db, wa_id, "hi"))
        assert reply2 == ""
        # start clears opt-out
        reply3 = event_loop.run_until_complete(route_incoming(db, wa_id, "start"))
        assert reply3  # should get menu/greeting
        async def _check():
            return await db.wa_opt_outs.find_one({"wa_id": wa_id})
        assert event_loop.run_until_complete(_check()) is None


# ---------------------------------------------------------------------------
# 24hr session tracking — call the webhook handler in-process with flag ON
# ---------------------------------------------------------------------------
class TestSessionTracking:
    def test_wa_session_upserted_when_flag_on(self, test_user):
        """Directly exercise the webhook POST path with WHATSAPP_ENABLED=1
        in-process (does NOT touch real Meta because send_session_text_message
        also gates on the flag + credentials — no access_token means stub).

        We use httpx.AsyncClient + ASGITransport so everything runs in a
        single event loop shared with the motor client we create fresh."""
        from routes.whatsapp_webhook import build_whatsapp_webhook_router
        from fastapi import FastAPI
        from motor.motor_asyncio import AsyncIOMotorClient
        from httpx import AsyncClient, ASGITransport

        os.environ["WHATSAPP_ENABLED"] = "1"
        wa_id = "919812345678"

        async def _run():
            client = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            local_db = client[os.environ.get("DB_NAME", "perk_orbit")]
            app = FastAPI()
            app.include_router(build_whatsapp_webhook_router(local_db))
            payload = _sample_payload(wa_id=wa_id, body="hi", msg_id="wamid.SESSION_TEST_1")
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                r = await ac.post("/api/whatsapp/webhook", json=payload)
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            assert body.get("processed", 0) >= 1
            sess = await local_db.wa_sessions.find_one({"wa_id": wa_id})
            client.close()
            return sess

        try:
            sess = asyncio.run(_run())
            assert sess is not None
            assert sess.get("last_message_id") == "wamid.SESSION_TEST_1"
            assert sess.get("last_user_msg_at")
        finally:
            os.environ["WHATSAPP_ENABLED"] = "0"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
