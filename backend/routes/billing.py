"""Membership status/activate, Razorpay payments (order/verify), referrals."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from models import RzpOrderRequest, RzpVerifyRequest
from services.billing_logic import (
    PLAN_BASE_DAYS,
    PLAN_LABEL,
    REFERRAL_BONUS_DAYS,
    apply_referral_bonus,
)
from services.db import RAZORPAY_KEY_ID, rzp_client, verify_razorpay_signature

log = logging.getLogger("perk_orbit.billing")


def build_billing_router(db) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/membership/status")
    async def membership_status(user_pin: str = Query(...)):
        doc = await db.app_membership.find_one({"user_pin": user_pin})
        if not doc:
            return {"active": False, "plan": None, "expires_at": None, "referral_code": None}
        return {
            "active": doc.get("active", False),
            "plan": doc.get("plan"),
            "expires_at": doc.get("expires_at"),
            "referral_code": doc.get("referral_code"),
        }

    @r.post("/membership/activate")
    async def activate_membership(user_pin: str = Query(...)):
        """MOCKED Razorpay activation — issues a 3-month ₹99 plan."""
        expires = (datetime.now(timezone.utc) + timedelta(days=PLAN_BASE_DAYS)).isoformat()
        ref = f"PERK-{secrets.token_hex(3).upper()}"
        doc = {
            "user_pin": user_pin,
            "active": True,
            "plan": PLAN_LABEL,
            "expires_at": expires,
            "referral_code": ref,
            "activated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.app_membership.update_one(
            {"user_pin": user_pin}, {"$set": doc}, upsert=True
        )
        return doc

    @r.post("/payments/order")
    async def create_payment_order(payload: RzpOrderRequest):
        if not rzp_client:
            raise HTTPException(status_code=503, detail="Razorpay not configured")
        # Razorpay minimum: 100 paise = ₹1. Guard before hitting the API.
        if not payload.amount_inr or payload.amount_inr < 1:
            raise HTTPException(status_code=400, detail="Minimum amount is ₹1 (100 paise)")
        receipt = f"perk-{secrets.token_hex(6)}"[:40]
        try:
            order = rzp_client.order.create({
                "amount": payload.amount_inr * 100,  # paise
                "currency": "INR",
                "receipt": receipt,
                "payment_capture": 1,
                "notes": {"user_pin": payload.user_pin, "plan": "perk-worth-pro-6m"},
            })
        except Exception as e:
            log.exception("Razorpay order create failed")
            raise HTTPException(status_code=502, detail=f"Razorpay order failed: {e}")
        await db.payments.insert_one({
            "user_pin": payload.user_pin,
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "status": "created",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return {
            "key_id": RAZORPAY_KEY_ID,
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "receipt": receipt,
        }

    @r.post("/payments/verify")
    async def verify_payment(payload: RzpVerifyRequest):
        if not rzp_client:
            raise HTTPException(status_code=503, detail="Razorpay not configured")
        if not verify_razorpay_signature(
            payload.razorpay_order_id,
            payload.razorpay_payment_id,
            payload.razorpay_signature,
        ):
            await db.payments.update_one(
                {"order_id": payload.razorpay_order_id},
                {"$set": {"status": "signature_failed"}},
            )
            raise HTTPException(status_code=400, detail="Invalid signature")

        await db.payments.update_one(
            {"order_id": payload.razorpay_order_id},
            {
                "$set": {
                    "status": "paid",
                    "payment_id": payload.razorpay_payment_id,
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        bonus_days = 0
        referral_outcome = await apply_referral_bonus(
            db, payload.user_pin, payload.referral_code or ""
        )
        if referral_outcome.get("applied"):
            bonus_days = REFERRAL_BONUS_DAYS
        expires = (
            datetime.now(timezone.utc) + timedelta(days=PLAN_BASE_DAYS + bonus_days)
        ).isoformat()
        ref = f"PERK-{secrets.token_hex(3).upper()}"
        doc = {
            "user_pin": payload.user_pin,
            "active": True,
            "plan": PLAN_LABEL + (f" (+{bonus_days}d referral bonus)" if bonus_days else ""),
            "expires_at": expires,
            "referral_code": ref,
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "last_payment_id": payload.razorpay_payment_id,
            "last_order_id": payload.razorpay_order_id,
            "applied_referral": payload.referral_code or None,
        }
        await db.app_membership.update_one(
            {"user_pin": payload.user_pin}, {"$set": doc}, upsert=True
        )

        welcome_body = "Your ₹99 membership is active for 3 months. Tap to view benefits."
        if bonus_days:
            welcome_body = (
                f"Your ₹99 membership is active for 3 months + {bonus_days} bonus days "
                f"from your referral. Tap to view benefits."
            )
        await db.notifications.insert_one({
            "user_pin": payload.user_pin,
            "kind": "membership_activated",
            "title": "Welcome to PerkWorth Pro",
            "body": welcome_body,
            "ref_screen": "membership",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        # Best-effort WhatsApp confirmation — stub-safe (no-op if disabled)
        try:
            from bson import ObjectId
            from services.whatsapp import send_pro_membership_activated
            user = None
            try:
                user = await db.users.find_one({"_id": ObjectId(payload.user_pin)})
            except Exception:
                user = None
            if user and user.get("phone"):
                expires_on = expires[:10]  # YYYY-MM-DD
                await send_pro_membership_activated(
                    phone=user.get("phone"),
                    user_name=user.get("name") or "",
                    plan_label=doc["plan"],
                    expires_on=expires_on,
                )
        except Exception:
            log.exception("Pro membership WhatsApp send failed (non-blocking)")
        return {**doc, "referral": referral_outcome}

    @r.get("/referrals/preview")
    async def referral_preview(code: str = Query(...)):
        code = code.strip().upper()
        found = await db.app_membership.find_one({"referral_code": code, "active": True})
        return {
            "valid": bool(found),
            "code": code,
            "bonus_days": REFERRAL_BONUS_DAYS,
            "message": (
                f"Valid code! You'll get +{REFERRAL_BONUS_DAYS} bonus days (3 months FREE), "
                f"and your friend will also get +{REFERRAL_BONUS_DAYS} days."
                if found
                else "Invalid or inactive referral code."
            ),
        }

    @r.get("/referrals/stats")
    async def referral_stats(user_pin: str = Query(...)):
        count = await db.referrals.count_documents({"referrer_pin": user_pin})
        return {
            "total_referrals": count,
            "bonus_days_earned": count * REFERRAL_BONUS_DAYS,
        }

    return r
