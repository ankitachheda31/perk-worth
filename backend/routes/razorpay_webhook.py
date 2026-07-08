"""Razorpay webhook receiver — server-to-server fallback for payment events.

WHY: The existing `/api/payments/verify` flow relies on the frontend calling
back after checkout completes. If the user's tab crashes / phone rings /
network dies AFTER payment but BEFORE the callback fires, they've been
charged but never receive their membership. Webhooks are Razorpay's
guaranteed delivery — they retry up to 24 hours until we return 200.

FLOW:
  1. Razorpay POSTs the event body + `X-Razorpay-Signature` header
  2. We compute HMAC-SHA256(body, WEBHOOK_SECRET) and compare — reject on mismatch
  3. Idempotency check via `X-Razorpay-Event-Id` header (Razorpay retries
     the same event on failures — we must process each event exactly once)
  4. Dispatch by `event` field:
       - payment.captured  → activate membership (fallback for missed callback)
       - payment.failed    → mark order as failed
       - refund.processed  → deactivate membership + notification
  5. Return 200 quickly — Razorpay times out at 5s

SETUP (one-time, user action required):
  1. https://dashboard.razorpay.com → Settings → Webhooks → Create webhook
  2. URL: https://orbit-vouchers.preview.emergentagent.com/api/webhooks/razorpay
  3. Secret: generate a strong random string, save it to backend/.env as
     RAZORPAY_WEBHOOK_SECRET (also paste it into the Razorpay dashboard
     "Secret" field — must match exactly)
  4. Events to subscribe: payment.captured, payment.failed, refund.processed
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request

from services.billing_logic import PLAN_BASE_DAYS, PLAN_LABEL

log = logging.getLogger("perk_orbit.webhooks")

RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")


def _verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """HMAC-SHA256(raw_body, webhook_secret) — Razorpay's documented scheme."""
    if not RAZORPAY_WEBHOOK_SECRET or not signature:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def build_webhook_router(db) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.post("/webhooks/razorpay")
    async def razorpay_webhook(request: Request):
        # ---- 1. Signature verification (over the RAW body bytes) ----
        raw_body = await request.body()
        signature = request.headers.get("x-razorpay-signature", "")
        if not _verify_webhook_signature(raw_body, signature):
            log.warning("Razorpay webhook signature mismatch — rejected")
            raise HTTPException(status_code=400, detail="Invalid signature")

        # ---- 2. Parse the payload (safe now that signature is verified) ----
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON")

        event = payload.get("event", "")
        event_id = request.headers.get("x-razorpay-event-id") or payload.get("id", "")
        if not event_id:
            log.warning("Razorpay webhook missing event id — cannot dedupe")
            raise HTTPException(status_code=400, detail="Missing event id")

        # ---- 3. Idempotency guard — Razorpay retries the same event on our
        #        5xx or timeout. Unique index on event_id ensures we act once.
        existing = await db.webhook_events.find_one({"event_id": event_id})
        if existing:
            log.info(f"Razorpay webhook {event_id} already processed — noop")
            return {"status": "already_processed"}

        await db.webhook_events.insert_one({
            "event_id": event_id,
            "event": event,
            "received_at": datetime.now(timezone.utc).isoformat(),
        })

        # ---- 4. Dispatch by event type ----
        entity = (
            payload.get("payload", {}).get("payment", {}).get("entity")
            or payload.get("payload", {}).get("refund", {}).get("entity")
            or {}
        )

        if event == "payment.captured":
            await _handle_payment_captured(db, entity)
        elif event == "payment.failed":
            await _handle_payment_failed(db, entity)
        elif event in ("refund.processed", "refund.created"):
            await _handle_refund(db, entity)
        else:
            log.info(f"Razorpay webhook event {event} received but not handled")

        return {"status": "ok"}

    async def _handle_payment_captured(db, payment: dict) -> None:
        """A payment was successfully captured. If our /verify hasn't already
        activated the membership (e.g. because the callback never fired), do
        it now as a fallback."""
        order_id = payment.get("order_id", "")
        payment_id = payment.get("id", "")
        if not order_id:
            log.warning("payment.captured with no order_id — dropped")
            return

        order_doc = await db.payments.find_one({"order_id": order_id})
        if not order_doc:
            log.warning(f"payment.captured for unknown order {order_id}")
            return

        # If the /verify path already activated this membership, do nothing.
        if order_doc.get("status") == "paid":
            log.info(f"payment.captured for {order_id} — already verified, noop")
            return

        user_pin = order_doc.get("user_pin", "")
        if not user_pin:
            log.warning(f"payment.captured for {order_id} — no user_pin in db")
            return

        # Mark order paid
        await db.payments.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": "paid",
                "payment_id": payment_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "verified_via": "webhook",
            }},
        )

        # Activate membership (mirrors /payments/verify logic minus referral
        # bonus — referral bonus depends on user input at /verify time and
        # can't be reconstructed from a webhook alone).
        expires = (
            datetime.now(timezone.utc) + timedelta(days=PLAN_BASE_DAYS)
        ).isoformat()
        ref = f"PERK-{secrets.token_hex(3).upper()}"

        # Preserve existing referral_code if member already had one.
        existing_membership = await db.app_membership.find_one({"user_pin": user_pin})
        if existing_membership and existing_membership.get("referral_code"):
            ref = existing_membership["referral_code"]

        await db.app_membership.update_one(
            {"user_pin": user_pin},
            {"$set": {
                "active": True,
                "plan": PLAN_LABEL,
                "expires_at": expires,
                "referral_code": ref,
                "activated_at": datetime.now(timezone.utc).isoformat(),
                "last_payment_id": payment_id,
                "last_order_id": order_id,
                "activated_via": "webhook",
            }},
            upsert=True,
        )

        # Notification so user sees "membership active" without reopening app
        await db.notifications.insert_one({
            "user_pin": user_pin,
            "title": "PerkWorth Pro activated",
            "body": "Your ₹99 membership is active for 3 months. Tap to view benefits.",
            "type": "membership",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False,
        })
        log.info(f"Membership activated via webhook for user_pin={user_pin}")

    async def _handle_payment_failed(db, payment: dict) -> None:
        order_id = payment.get("order_id", "")
        if not order_id:
            return
        error_desc = payment.get("error_description", "") or payment.get("error_code", "")
        await db.payments.update_one(
            {"order_id": order_id},
            {"$set": {
                "status": "failed",
                "failure_reason": error_desc,
                "failed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        log.info(f"Payment failed for order {order_id}: {error_desc}")

    async def _handle_refund(db, refund: dict) -> None:
        payment_id = refund.get("payment_id", "")
        amount = refund.get("amount", 0)
        refund_id = refund.get("id", "")
        if not payment_id:
            return

        # Find the membership tied to this payment
        member = await db.app_membership.find_one({"last_payment_id": payment_id})
        if not member:
            log.warning(f"refund for unknown payment_id={payment_id}")
            return

        user_pin = member.get("user_pin", "")
        await db.app_membership.update_one(
            {"user_pin": user_pin},
            {"$set": {
                "active": False,
                "refunded": True,
                "refund_id": refund_id,
                "refund_amount": amount,
                "refunded_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        await db.notifications.insert_one({
            "user_pin": user_pin,
            "title": "PerkWorth Pro refunded",
            "body": f"Your ₹{amount // 100} payment has been refunded. Pro benefits are paused.",
            "type": "membership",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "read": False,
        })
        log.info(f"Refund processed for user_pin={user_pin}, amount={amount}")

    return r
