"""Family Circle: members + share/unshare + shared-with views."""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query

from models import FamilyCircleAdd, ShareInviteCreate
from services.db import serialize


def build_circle_router(db) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.post("/circle/members")
    async def add_circle_member(payload: FamilyCircleAdd):
        token = secrets.token_urlsafe(10)
        doc = {
            "user_pin": payload.user_pin,
            "name": payload.name,
            "relation": payload.relation,
            "email": payload.email,
            "invite_token": token,
            "invite_email_sent": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        res = await db.circle_members.insert_one(doc)
        saved = await db.circle_members.find_one({"_id": res.inserted_id})

        if payload.email:
            try:
                from mailer import send_circle_invite
                frontend = os.environ.get("FRONTEND_URL", "https://perkworth.app").rstrip("/")
                invite_url = f"{frontend}/invite/{token}"
                ok = await send_circle_invite(
                    to_email=str(payload.email),
                    inviter_name=(payload.inviter_name or "A PerkWorth member"),
                    invitee_name=payload.name,
                    invite_url=invite_url,
                    relation=payload.relation,
                )
                if ok:
                    await db.circle_members.update_one(
                        {"_id": res.inserted_id},
                        {"$set": {
                            "invite_email_sent": True,
                            "invite_email_sent_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                    saved = await db.circle_members.find_one({"_id": res.inserted_id})
            except Exception:
                logging.exception("Circle invite email failed (continuing)")
        return serialize(saved)

    @r.get("/circle/members")
    async def list_circle_members(user_pin: str = Query(...)):
        cursor = db.circle_members.find({"user_pin": user_pin}).sort("created_at", -1)
        return [serialize(d) async for d in cursor]

    @r.delete("/circle/members/{member_id}")
    async def remove_circle_member(member_id: str):
        if not ObjectId.is_valid(member_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        res = await db.circle_members.delete_one({"_id": ObjectId(member_id)})
        return {"deleted": res.deleted_count}

    @r.post("/circle/share")
    async def share_voucher(payload: ShareInviteCreate):
        if not ObjectId.is_valid(payload.voucher_id):
            raise HTTPException(status_code=400, detail="Invalid voucher id")
        if not ObjectId.is_valid(payload.family_member_id):
            raise HTTPException(status_code=400, detail="Invalid member id")
        member = await db.circle_members.find_one(
            {"_id": ObjectId(payload.family_member_id), "user_pin": payload.user_pin}
        )
        if not member:
            raise HTTPException(status_code=404, detail="Circle member not found")
        res = await db.vouchers.find_one_and_update(
            {"_id": ObjectId(payload.voucher_id), "user_pin": payload.user_pin},
            {
                "$addToSet": {"shared_with": payload.family_member_id},
                "$set": {"is_sharing": True},
            },
            return_document=True,
        )
        if not res:
            raise HTTPException(status_code=404, detail="Voucher not found")
        return serialize(res)

    @r.post("/circle/unshare/{voucher_id}")
    async def stop_sharing(
        voucher_id: str,
        user_pin: str = Query(...),
        family_member_id: Optional[str] = Query(None),
    ):
        if not ObjectId.is_valid(voucher_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        if family_member_id and ObjectId.is_valid(family_member_id):
            res = await db.vouchers.find_one_and_update(
                {"_id": ObjectId(voucher_id), "user_pin": user_pin},
                {"$pull": {"shared_with": family_member_id}},
                return_document=True,
            )
            if res and not res.get("shared_with"):
                res = await db.vouchers.find_one_and_update(
                    {"_id": ObjectId(voucher_id)},
                    {"$set": {"is_sharing": False}},
                    return_document=True,
                )
        else:
            res = await db.vouchers.find_one_and_update(
                {"_id": ObjectId(voucher_id), "user_pin": user_pin},
                {"$set": {"is_sharing": False, "shared_with": []}},
                return_document=True,
            )
        if not res:
            raise HTTPException(status_code=404, detail="Voucher not found")
        return serialize(res)

    @r.get("/vouchers/shared-with")
    async def vouchers_shared_with(
        user_pin: str = Query(...),
        member_id: str = Query(...),
    ):
        if not ObjectId.is_valid(member_id):
            raise HTTPException(status_code=400, detail="Invalid member id")
        member = await db.circle_members.find_one(
            {"_id": ObjectId(member_id), "user_pin": user_pin}
        )
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")
        cursor = db.vouchers.find(
            {"user_pin": user_pin, "shared_with": member_id}
        ).sort("created_at", -1)
        items = [serialize(d) async for d in cursor]
        return {
            "member": {
                "id": str(member["_id"]),
                "name": member["name"],
                "relation": member.get("relation"),
            },
            "vouchers": items,
        }

    return r
