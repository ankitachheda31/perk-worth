"""WhatsApp inbound webhook — Meta Cloud API integration.

Two endpoints:
  GET  /api/whatsapp/webhook   — Meta verification handshake
  POST /api/whatsapp/webhook   — incoming user messages

Both are ALWAYS mounted (even when WHATSAPP_ENABLED=0) so that Meta's URL
verification step passes during setup. The POST handler no-ops (returns 200
without processing) when the feature flag is off, so Meta doesn't retry.

Security:
  - GET: challenge/token handshake against WHATSAPP_VERIFY_TOKEN.
  - POST: HMAC-SHA256 of raw body against WHATSAPP_APP_SECRET via the
    X-Hub-Signature-256 header, per Meta's webhook security spec.
"""
import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Request

from services.whatsapp import send_session_text_message
from services.whatsapp_bot import route_incoming

log = logging.getLogger("perk_orbit.wa_webhook")


def _feature_enabled() -> bool:
    return os.environ.get("WHATSAPP_ENABLED", "0") == "1"


def _verify_signature(raw_body: bytes, signature_header: str) -> bool:
    """Meta signs webhook payloads with HMAC-SHA256(WHATSAPP_APP_SECRET, raw_body).
    The header shape is 'sha256=<hex>'. If no app-secret is configured (dev/stub),
    we skip verification but log a warning."""
    secret = os.environ.get("WHATSAPP_APP_SECRET", "").strip()
    if not secret:
        log.warning("WHATSAPP_APP_SECRET not set — skipping signature verification")
        return True  # dev mode passthrough
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    provided = signature_header.split("=", 1)[1].strip()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(provided, expected)


def build_whatsapp_webhook_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

    @router.get("/webhook")
    async def verify_webhook(
        hub_mode: str = Query(alias="hub.mode", default=""),
        hub_challenge: str = Query(alias="hub.challenge", default=""),
        hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    ):
        """Meta's one-time verification handshake. Always mounted regardless of
        WHATSAPP_ENABLED so you can wire the URL in Meta Business Manager
        before you flip the feature live."""
        expected = os.environ.get("WHATSAPP_VERIFY_TOKEN", "").strip()
        if hub_mode == "subscribe" and expected and hub_verify_token == expected:
            log.info("WhatsApp webhook verified successfully")
            # Meta expects the raw challenge echoed back
            from fastapi.responses import PlainTextResponse
            return PlainTextResponse(hub_challenge)
        log.warning("WhatsApp webhook verify failed (mode=%s token_match=%s)",
                    hub_mode, hub_verify_token == expected)
        raise HTTPException(status_code=403, detail="Verification failed")

    @router.post("/webhook")
    async def receive_message(
        request: Request,
        x_hub_signature_256: str = Header(default=""),
    ):
        """Handle inbound WhatsApp messages. Meta expects a 200 response
        within ~20 seconds otherwise it retries. We do work inline (bot is
        fast for FAQ; LLM path may take up to ~10s)."""
        raw_body = await request.body()

        # Meta may retry a message multiple times — verify signature every time
        if not _verify_signature(raw_body, x_hub_signature_256):
            log.warning("WhatsApp webhook signature check failed")
            raise HTTPException(status_code=403, detail="Invalid signature")

        # Feature-flag gate — return 200 so Meta doesn't retry, but skip work
        if not _feature_enabled():
            log.info("WhatsApp webhook received but WHATSAPP_ENABLED=0 — no-op")
            return {"ok": True, "processed": False, "reason": "disabled"}

        import json
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            log.exception("Invalid JSON in WhatsApp webhook")
            return {"ok": True}  # ack — nothing to process

        # Meta webhook shape (v21.0):
        # { entry: [{ changes: [{ value: { messages: [{ from, text: {body}, id, type, timestamp }] } }] }] }
        processed = 0
        for entry in payload.get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                for message in value.get("messages") or []:
                    if message.get("type") != "text":
                        # Not handling media/interactive/audio inbound in v1
                        continue
                    wa_id = message.get("from") or ""
                    text_body = ((message.get("text") or {}).get("body") or "").strip()
                    if not wa_id or not text_body:
                        continue

                    # 24-hour session tracker — record every inbound so we know
                    # we're currently allowed to reply with plain text (no template)
                    await db.wa_sessions.update_one(
                        {"wa_id": wa_id},
                        {"$set": {
                            "wa_id": wa_id,
                            "last_user_msg_at": datetime.now(timezone.utc).isoformat(),
                            "last_message_id": message.get("id"),
                        }},
                        upsert=True,
                    )

                    try:
                        reply = await route_incoming(db, wa_id, text_body)
                    except Exception:
                        log.exception("Bot routing failed for wa_id=%s", wa_id)
                        reply = "Sorry, something went wrong on our side. Reply *human* to reach our team."

                    if reply:
                        await send_session_text_message(wa_id, reply)
                        processed += 1

        return {"ok": True, "processed": processed}

    return router
