"""Notifications + Support history endpoints."""
from __future__ import annotations

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timezone

from models import SupportLog
from services.notifications_logic import generate_dynamic_notifications


def build_notifications_router(db) -> APIRouter:
    r = APIRouter(prefix="/api")

    @r.get("/notifications")
    async def list_notifications(user_pin: str = Query(...)):
        await generate_dynamic_notifications(db, user_pin)
        cursor = db.notifications.find({"user_pin": user_pin}).sort("created_at", -1).limit(50)
        items = []
        unread = 0
        async for d in cursor:
            d["id"] = str(d.pop("_id"))
            if not d.get("read"):
                unread += 1
            items.append(d)
        return {"items": items, "unread": unread}

    @r.post("/notifications/{notification_id}/read")
    async def mark_read(notification_id: str):
        if not ObjectId.is_valid(notification_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        await db.notifications.update_one(
            {"_id": ObjectId(notification_id)}, {"$set": {"read": True}}
        )
        return {"ok": True}

    @r.post("/notifications/read-all")
    async def mark_all_read(user_pin: str = Query(...)):
        res = await db.notifications.update_many(
            {"user_pin": user_pin, "read": False}, {"$set": {"read": True}}
        )
        return {"updated": res.modified_count}

    @r.delete("/notifications/{notification_id}")
    async def delete_notification(notification_id: str):
        if not ObjectId.is_valid(notification_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        await db.notifications.delete_one({"_id": ObjectId(notification_id)})
        return {"ok": True}

    @r.post("/support/log")
    async def log_support(payload: SupportLog):
        doc = payload.model_dump()
        doc["created_at"] = datetime.now(timezone.utc).isoformat()
        res = await db.support_history.insert_one(doc)
        return {"id": str(res.inserted_id), "logged": True}

    @r.get("/support/history")
    async def support_history(user_pin: str = Query(...)):
        cursor = db.support_history.find({"user_pin": user_pin}).sort("created_at", -1).limit(50)
        return [
            {**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])}
            async for d in cursor
        ]

    return r
