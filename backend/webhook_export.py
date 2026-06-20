"""PerkWorth — Webhook + GDPR/DPDP Wallet Export module.

Mounted at /api via include_router.

Exposes:
- POST /api/payments/webhook        Razorpay async event handler (HMAC-SHA256 signature verify)
- GET  /api/user/export             DPDP §13 / GDPR Art. 15+20 data export (JSON or CSV)
"""
from __future__ import annotations

import csv
import hashlib
import hmac
import io
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

log = logging.getLogger("perk_orbit.webhook_export")


# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------
def _verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """HMAC-SHA256(raw_body, webhook_secret) == signature.

    Razorpay sends the signature in the `X-Razorpay-Signature` header. The
    expected hash is computed over the **exact raw request body**, NOT the
    parsed JSON (a re-serialization may differ in whitespace).
    """
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def build_webhook_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api", tags=["payments-webhook"])

    @router.post("/payments/webhook")
    async def razorpay_webhook(request: Request):
        """Async event handler for Razorpay payment events.

        Configured via Razorpay Dashboard → Webhooks. Listens to:
          - payment.captured  → mark payment paid, ensure membership active
          - payment.failed    → mark payment failed (helps reconciliation)
          - refund.created    → mark payment refunded + log

        Idempotency: each event ID is recorded in `webhook_events`; duplicates
        are no-ops. Frontend-driven /payments/verify remains primary; this is
        the safety net for when the user closes the tab before verify fires.
        """
        secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "")
        if not secret:
            # Webhook not configured — refuse rather than process unauthenticated events
            raise HTTPException(status_code=503, detail="Webhook secret not configured")

        raw = await request.body()
        sig = request.headers.get("X-Razorpay-Signature", "")
        if not _verify_webhook_signature(raw, sig, secret):
            log.warning("Webhook signature failed · sig_len=%d body_len=%d", len(sig), len(raw))
            raise HTTPException(status_code=400, detail="Invalid signature")

        try:
            event = json.loads(raw.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Malformed JSON")

        event_id = event.get("id") or event.get("payload", {}).get("payment", {}).get("entity", {}).get("id", "")
        event_type = event.get("event", "")
        if not event_id:
            return {"ok": True, "ignored": "no event id"}

        # Idempotency guard
        existing = await db.webhook_events.find_one({"event_id": event_id})
        if existing:
            return {"ok": True, "duplicate": True}

        await db.webhook_events.insert_one({
            "event_id": event_id,
            "event_type": event_type,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "raw_signature": sig[:32],
        })

        payment = event.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        order_id = payment.get("order_id")
        payment_id = payment.get("id")
        status = payment.get("status")

        if event_type == "payment.captured" and order_id and payment_id:
            await db.payments.update_one(
                {"order_id": order_id},
                {"$set": {
                    "status": "paid",
                    "payment_id": payment_id,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                    "source": "webhook",
                }},
            )
            # Notify only if not already verified by /payments/verify
            payment_doc = await db.payments.find_one({"order_id": order_id})
            if payment_doc:
                already_active = await db.app_membership.find_one({
                    "user_pin": payment_doc.get("user_pin"), "last_order_id": order_id, "active": True,
                })
                if not already_active and payment_doc.get("user_pin"):
                    await db.notifications.insert_one({
                        "user_pin": payment_doc["user_pin"],
                        "kind": "membership_activated",
                        "title": "Payment confirmed (webhook)",
                        "body": "Your ₹99 membership payment was confirmed. Open the app to view benefits.",
                        "ref_screen": "membership",
                        "read": False,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
            return {"ok": True, "applied": "payment.captured"}

        if event_type == "payment.failed" and order_id:
            await db.payments.update_one(
                {"order_id": order_id},
                {"$set": {
                    "status": "failed",
                    "payment_id": payment_id,
                    "failure_reason": payment.get("error_description") or payment.get("error_code") or "unknown",
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            return {"ok": True, "applied": "payment.failed"}

        if event_type.startswith("refund."):
            await db.payments.update_one(
                {"order_id": order_id},
                {"$set": {
                    "status": "refunded",
                    "refunded_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            return {"ok": True, "applied": event_type}

        return {"ok": True, "ignored_event": event_type, "status": status}

    # -----------------------------------------------------------------------
    # GDPR/DPDP export
    # -----------------------------------------------------------------------
    @router.get("/user/export")
    async def export_user_data(format: str = Query("json", pattern="^(json|csv)$"),
                                user=Depends(get_current_user)):
        """DPDP 2023 §13 (Right to Access) + GDPR Art. 15 (access) & Art. 20
        (portability) self-service export.

        Returns every record we hold against the user, scoped by `user_pin == user_id`,
        in JSON (single file) or CSV (multi-section text file).
        """
        uid = user["_id"]

        async def fetch(coll: str) -> list[dict]:
            out: list[dict] = []
            cursor = db[coll].find({
                "$or": [
                    {"user_pin": uid},
                    {"referrer_pin": uid},
                    {"referee_pin": uid},
                ]
            })
            async for d in cursor:
                d["_id"] = str(d.get("_id", ""))
                # Strip any sensitive internals
                d.pop("password_hash", None)
                out.append(d)
            return out

        export = {
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_for": {
                "user_id": uid,
                "email": user.get("email"),
                "name": user.get("name"),
            },
            "spec_compliance": {
                "dpdp_2023": "Section 13 – Right to access",
                "gdpr": "Article 15 – Right of access · Article 20 – Right to data portability",
            },
            "collections": {
                "vouchers": await fetch("vouchers"),
                "circle_members": await fetch("circle_members"),
                "app_membership": await fetch("app_membership"),
                "payments": await fetch("payments"),
                "notifications": await fetch("notifications"),
                "referrals": await fetch("referrals"),
                "support_history": await fetch("support_history"),
            },
        }

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        if format == "json":
            body = json.dumps(export, indent=2, default=str).encode("utf-8")
            return StreamingResponse(
                io.BytesIO(body),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="perk-worth-export-{timestamp}.json"'},
            )

        # CSV: multi-section text file (one section per collection)
        buf = io.StringIO()
        buf.write("# PerkWorth · Personal Data Export\n")
        buf.write(f"# Exported at: {export['exported_at']}\n")
        buf.write(f"# User: {user.get('email')} ({uid})\n")
        buf.write("# DPDP 2023 §13 & GDPR Art. 15+20 compliant.\n\n")
        for coll_name, rows in export["collections"].items():
            buf.write(f"## {coll_name} ({len(rows)} rows)\n")
            if not rows:
                buf.write("(empty)\n\n")
                continue
            # Union of keys for stable header
            keys = sorted({k for r in rows for k in r.keys()})
            writer = csv.DictWriter(buf, fieldnames=keys, extrasaction="ignore")
            writer.writeheader()
            for r in rows:
                writer.writerow({k: ("" if r.get(k) is None else json.dumps(r[k], default=str) if isinstance(r.get(k), (dict, list)) else str(r.get(k))) for k in keys})
            buf.write("\n")
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="perk-worth-export-{timestamp}.csv"'},
        )

    return router
