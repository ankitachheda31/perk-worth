"""
Onboarding & Permissions routes.
- POST /api/onboarding/scan-sms — batch parse a user's SMS history for
  vouchers / memberships / points; keyword-filter first, then LLM-verify.
- POST /api/permissions/state    — user toggles sms/notif/photo permissions.
- GET  /api/permissions/state    — read current permission state for UI.
- POST /api/onboarding/complete  — mark first-run walkthrough as done.

Called by:
- Frontend post-signup onboarding wizard (OnboardingPermissions.jsx)
- Settings → Permissions panel (SettingsPage.jsx)
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("onboarding")

# Broad keyword catalog covering Indian voucher / membership SMS.
# Case-insensitive scanning. Kept in code (not DB) so it's atomic per deploy.
_KEYWORDS = [
    # Voucher/coupon language
    "voucher", "coupon", "code", "gift card", "gc code", "e-gift",
    "discount", "% off", "flat rs", "flat ₹", "₹ off", "cashback",
    "reward", "rewards", "points", "loyalty", "member exclusive",
    # Membership / subscription language
    "membership", "subscription", "auto-renew", "auto-renewal", "plan",
    "prime", "pass", "one pass", "flipkart plus", "swiggy one", "zomato gold",
    "cult pass", "netflix", "hotstar", "spotify", "youtube premium",
    # Expiry
    "expires on", "valid till", "valid until", "expiry", "expiring",
    # Bank / card rewards
    "reward points", "credit card", "smart pay", "credit shield",
]

# Sender-ID allow-list. Indian carriers prefix with 6-char AD/AX ids
# (e.g. VM-SWIGGY, JD-AMAZON, VK-ZOMATO). Only trust from these prefixes to
# reduce spam signal. Skip messages from personal numbers.
_TRUSTED_SENDER_RE = re.compile(r"^(?:[A-Z]{2}-)?[A-Z0-9]{2,8}$")


class SmsMessage(BaseModel):
    body: str = Field(..., max_length=2000)
    sender: Optional[str] = Field(None, max_length=64)
    received_at: Optional[str] = None  # ISO timestamp, optional


class SmsBatchRequest(BaseModel):
    messages: list[SmsMessage] = Field(..., max_length=1000)


class PermissionsUpdate(BaseModel):
    # Any subset is fine; unspecified keys are untouched.
    sms: Optional[bool] = None
    notifications: Optional[bool] = None
    photos: Optional[bool] = None
    voice: Optional[bool] = None


def _keyword_hit(text: str) -> bool:
    t = text.lower()
    return any(k in t for k in _KEYWORDS)


def _looks_trusted(sender: Optional[str]) -> bool:
    if not sender:
        return True  # if we don't know, don't filter it out
    s = sender.strip().upper()
    return bool(_TRUSTED_SENDER_RE.match(s))


def build_onboarding_router(db, get_current_user, emergent_llm_key: str) -> APIRouter:
    r = APIRouter(prefix="/api", tags=["onboarding"])

    # ---------------- Permissions state ---------------------------------
    @r.get("/permissions/state")
    async def get_permissions_state(user=Depends(get_current_user)):
        doc = await db.users.find_one({"_id": ObjectId(user["_id"])},
                                       {"permissions": 1, "onboarding": 1})
        return {
            "permissions": (doc or {}).get("permissions", {}) or {},
            "onboarding_completed": bool((doc or {}).get("onboarding", {}).get("completed")),
        }

    @r.post("/permissions/state")
    async def set_permissions_state(
        payload: PermissionsUpdate = Body(...),
        user=Depends(get_current_user),
    ):
        # Only apply keys that were sent (None means "don't touch").
        updates: dict = {}
        now_iso = datetime.now(timezone.utc).isoformat()
        for field in ("sms", "notifications", "photos", "voice"):
            val = getattr(payload, field)
            if val is None:
                continue
            updates[f"permissions.{field}"] = bool(val)
            updates[f"permissions.{field}_updated_at"] = now_iso
        if not updates:
            raise HTTPException(status_code=400, detail="no permission fields to update")
        await db.users.update_one({"_id": ObjectId(user["_id"])}, {"$set": updates})
        doc = await db.users.find_one({"_id": ObjectId(user["_id"])}, {"permissions": 1})
        return {"ok": True, "permissions": (doc or {}).get("permissions", {})}

    @r.post("/onboarding/complete")
    async def mark_onboarding_complete(user=Depends(get_current_user)):
        await db.users.update_one(
            {"_id": ObjectId(user["_id"])},
            {"$set": {"onboarding.completed": True,
                      "onboarding.completed_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    # ---------------- Batch SMS scan (Feature 2c) -----------------------
    @r.post("/onboarding/scan-sms")
    async def scan_sms(
        payload: SmsBatchRequest = Body(...),
        user=Depends(get_current_user),
    ):
        """Two-stage parser: cheap regex/keyword filter → LLM structured extract.
        Returns per-message result. Frontend can decide to auto-save or preview.
        """
        uid = user["_id"]

        # ---- Stage 1: fast, deterministic keyword filter -----------------
        candidates: list[dict] = []
        for i, m in enumerate(payload.messages):
            body = (m.body or "").strip()
            if len(body) < 12:
                continue
            if not _looks_trusted(m.sender):
                continue
            if not _keyword_hit(body):
                continue
            candidates.append({
                "index": i,
                "body": body,
                "sender": (m.sender or "").strip(),
                "received_at": m.received_at,
            })

        # Hard cap to avoid runaway LLM cost — user's most-recent 40 hits.
        candidates = candidates[:40]

        # ---- Stage 2: LLM structured extract (batched for cost) ----------
        parsed_results: list[dict] = []
        if candidates and emergent_llm_key:
            from services.llm import llm_extract_structured  # existing helper
            for c in candidates:
                try:
                    parsed = await llm_extract_structured(
                        f"SMS from {c.get('sender') or 'unknown sender'}:\n{c['body']}",
                    )
                    if isinstance(parsed, dict) and (parsed.get("brand") or parsed.get("code")):
                        parsed_results.append({
                            "sender": c.get("sender"),
                            "received_at": c.get("received_at"),
                            "raw": c["body"][:280],
                            "parsed": parsed,
                        })
                except Exception:
                    log.exception("LLM parse failed for one SMS candidate")

        # ---- Stage 3: dedupe against user's existing vouchers ------------
        existing = set()
        async for v in db.vouchers.find(
            {"user_pin": uid},
            {"brand": 1, "code": 1, "category": 1},
        ):
            key = (
                (v.get("brand") or "").lower().strip(),
                (v.get("code") or "").lower().strip(),
                (v.get("category") or "").lower().strip(),
            )
            existing.add(key)

        # Do NOT auto-insert — return everything so the user can confirm on the
        # onboarding screen. Trust-first architecture: never write on their
        # behalf without a review step. The frontend calls /api/vouchers for
        # accepted items using the existing create endpoint.
        for p in parsed_results:
            b = (p["parsed"].get("brand") or "").lower().strip()
            c = (p["parsed"].get("code") or "").lower().strip()
            cat = (p["parsed"].get("category") or "coupons").lower().strip()
            p["is_duplicate"] = (b, c, cat) in existing

        return {
            "ok": True,
            "scanned": len(payload.messages),
            "keyword_hits": len(candidates),
            "parsed": len(parsed_results),
            "new_candidates": [p for p in parsed_results if not p["is_duplicate"]],
            "duplicates_skipped": sum(1 for p in parsed_results if p["is_duplicate"]),
        }

    return r
