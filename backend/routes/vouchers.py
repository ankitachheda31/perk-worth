"""Voucher CRUD, redeem/unredeem, savings-stats, ending-soon, points summary,
memberships ROI, log-spend, brand search."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Body, HTTPException, Query

from models import VoucherCreate, VoucherUpdate, LogSpendBody
from services.db import serialize
from services.llm import BRAND_PARENT_MAP, lookup_parent


def build_vouchers_router(db) -> APIRouter:
    r = APIRouter(prefix="/api")

    # -------- Voucher CRUD --------
    @r.post("/vouchers")
    async def create_voucher(payload: VoucherCreate):
        if payload.brand and not getattr(payload, "parent_company", None):
            parent = lookup_parent(payload.brand)
        else:
            parent = payload.parent_company
        data = payload.model_dump()
        data["parent_company"] = parent
        data["created_at"] = datetime.now(timezone.utc).isoformat()
        data["shared_with"] = []
        data["is_sharing"] = False
        if data.get("savings_realized") is None:
            data["savings_realized"] = 0.0
        result = await db.vouchers.insert_one(data)
        doc = await db.vouchers.find_one({"_id": result.inserted_id})
        return serialize(doc)

    @r.get("/brands/lookup")
    async def brand_lookup(q: str = Query(..., min_length=1, max_length=80)):
        from brand_registry import search as _registry_search
        return {"results": _registry_search(q, limit=10)}

    @r.get("/brands/all")
    async def brand_all():
        from brand_registry import all_brands as _all
        return {"brands": _all()}

    @r.get("/vouchers")
    async def list_vouchers(
        user_pin: str = Query(...),
        category: Optional[str] = None,
        status: Optional[str] = None,
    ):
        q: dict = {"user_pin": user_pin}
        if category and category != "all":
            q["category"] = category
        if status == "all":
            pass
        elif status:
            q["status"] = status
        else:
            q["$or"] = [
                {"status": "active"},
                {"status": {"$exists": False}},
                {"status": None},
            ]
        cursor = db.vouchers.find(q).sort("created_at", -1)
        return [serialize(d) async for d in cursor]

    @r.post("/vouchers/{voucher_id}/redeem")
    async def redeem_voucher(voucher_id: str, body: dict = Body(default={})):
        if not ObjectId.is_valid(voucher_id):
            raise HTTPException(status_code=400, detail="Invalid voucher id")
        existing = await db.vouchers.find_one({"_id": ObjectId(voucher_id)})
        if not existing:
            raise HTTPException(status_code=404, detail="Voucher not found")
        saved_amount = body.get("savings_realized")
        if saved_amount is None:
            saved_amount = existing.get("value") or 0
        try:
            saved_amount = float(saved_amount)
        except Exception:
            saved_amount = 0.0
        update = {
            "status": "redeemed",
            "redeemed_at": datetime.now(timezone.utc).isoformat(),
            "savings_realized": saved_amount,
        }
        res = await db.vouchers.find_one_and_update(
            {"_id": ObjectId(voucher_id)}, {"$set": update}, return_document=True,
        )
        return serialize(res)

    @r.post("/vouchers/{voucher_id}/unredeem")
    async def unredeem_voucher(voucher_id: str):
        if not ObjectId.is_valid(voucher_id):
            raise HTTPException(status_code=400, detail="Invalid voucher id")
        res = await db.vouchers.find_one_and_update(
            {"_id": ObjectId(voucher_id)},
            {"$set": {"status": "active", "redeemed_at": None, "savings_realized": 0.0}},
            return_document=True,
        )
        if not res:
            raise HTTPException(status_code=404, detail="Voucher not found")
        return serialize(res)

    @r.get("/vouchers/savings-stats")
    async def savings_stats(user_pin: str = Query(...)):
        today = datetime.now(timezone.utc).date()
        year_start_iso = f"{today.year}-01-01T00:00:00+00:00"
        cursor = db.vouchers.find({"user_pin": user_pin, "status": "redeemed"})
        total_saved = 0.0
        this_year_saved = 0.0
        count_total = 0
        count_this_year = 0
        by_owner: dict = {}
        async for d in cursor:
            s = float(d.get("savings_realized") or 0)
            total_saved += s
            count_total += 1
            ra = d.get("redeemed_at") or ""
            if ra and ra >= year_start_iso:
                this_year_saved += s
                count_this_year += 1
            owner = d.get("owner") or "Self"
            cur = by_owner.get(owner, {"saved": 0.0, "count": 0})
            cur["saved"] += s
            cur["count"] += 1
            by_owner[owner] = cur
        return {
            "total_saved": round(total_saved, 2),
            "this_year_saved": round(this_year_saved, 2),
            "count_total": count_total,
            "count_this_year": count_this_year,
            "current_year": today.year,
            "by_owner": [
                {"owner": k, **v}
                for k, v in sorted(by_owner.items(), key=lambda kv: -kv[1]["saved"])
            ],
        }

    @r.get("/vouchers/ending-soon")
    async def ending_soon(user_pin: str = Query(...), days: int = 7):
        today = datetime.now(timezone.utc).date()
        cutoff = today + timedelta(days=days)
        cursor = db.vouchers.find({"user_pin": user_pin, "category": "vouchers"})
        items = []
        async for d in cursor:
            exp = d.get("expiry")
            if not exp:
                continue
            try:
                exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
            except Exception:
                continue
            if today <= exp_date <= cutoff:
                d["days_left"] = (exp_date - today).days
                items.append(serialize(d))
        items.sort(key=lambda x: x["days_left"])
        return items

    @r.patch("/vouchers/{voucher_id}")
    async def update_voucher(voucher_id: str, payload: VoucherUpdate):
        if not ObjectId.is_valid(voucher_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
        if "brand" in update and update["brand"]:
            update["parent_company"] = lookup_parent(update["brand"])
        if not update:
            raise HTTPException(status_code=400, detail="No updates")
        res = await db.vouchers.find_one_and_update(
            {"_id": ObjectId(voucher_id)}, {"$set": update}, return_document=True,
        )
        if not res:
            raise HTTPException(status_code=404, detail="Not found")
        return serialize(res)

    @r.delete("/vouchers/{voucher_id}")
    async def delete_voucher(voucher_id: str):
        if not ObjectId.is_valid(voucher_id):
            raise HTTPException(status_code=400, detail="Invalid id")
        res = await db.vouchers.delete_one({"_id": ObjectId(voucher_id)})
        return {"deleted": res.deleted_count}

    # -------- Points summary --------
    @r.get("/points/summary")
    async def points_summary(user_pin: str = Query(...)):
        cursor = db.vouchers.find({"user_pin": user_pin})
        total_points = 0
        total_value = 0.0
        breakdown: list[dict] = []
        async for d in cursor:
            pts = d.get("points") or 0
            if pts:
                total_points += pts
                breakdown.append({
                    "program_name": d.get("brand"),
                    "brand": d.get("brand"),
                    "parent_company": d.get("parent_company"),
                    "points_balance": pts,
                    "points": pts,
                    "current_cash_value": round(pts * 0.25, 2),
                    "value": round(pts * 0.25, 2),
                    "is_shared": bool(d.get("is_sharing", False)),
                })
                total_value += pts * 0.25
        return {
            "total_points": total_points,
            "approx_value_inr": round(total_value, 2),
            "breakdown": breakdown,
        }

    # -------- Membership ROI --------
    @r.get("/memberships/roi")
    async def memberships_roi(user_pin: str = Query(...)):
        cursor = db.vouchers.find({"user_pin": user_pin, "category": "memberships"})
        items = []
        today = datetime.now(timezone.utc).date()
        async for d in cursor:
            d = serialize(d)
            kind = d.get("membership_kind")
            fee = d.get("fee_paid") or 0
            if kind == "asset":
                saved = d.get("savings_realized") or 0
                d["roi_progress"] = round(min(100, (saved / fee * 100) if fee else 0), 1)
                d["break_even"] = saved >= fee and fee > 0
                d["renewal_recommended"] = saved >= fee * 0.8 if fee else False
            benefit_rate = d.get("benefit_rate") or 0
            total_spend = d.get("total_spend") or 0
            if benefit_rate and benefit_rate > 0 and fee > 0:
                be_spend = round(fee / benefit_rate, 2)
                cum_savings = round(total_spend * benefit_rate, 2)
                remaining = max(0, round(be_spend - total_spend, 2))
                profit_mode = cum_savings >= fee
                d["break_even_spend"] = be_spend
                d["cumulative_savings"] = cum_savings
                d["remaining_spend_to_break_even"] = remaining
                d["profit_mode"] = profit_mode
                d["profit_earned"] = round(cum_savings - fee, 2) if profit_mode else 0
                d["recovery_progress"] = round(min(100, (cum_savings / fee * 100)), 1)
                if not d.get("savings_realized") or d.get("savings_realized") < cum_savings:
                    d["savings_realized"] = cum_savings
            else:
                d["break_even_spend"] = None
                d["cumulative_savings"] = d.get("savings_realized") or 0
                d["remaining_spend_to_break_even"] = None
                d["profit_mode"] = (d.get("savings_realized") or 0) >= fee and fee > 0
                d["profit_earned"] = 0
                d["recovery_progress"] = (
                    round(min(100, ((d.get("savings_realized") or 0) / fee * 100)), 1)
                    if fee else 0
                )
            start_str = d.get("start_date") or (d.get("created_at") or "")[:10]
            exp_str = d.get("expiry")
            try:
                start = datetime.fromisoformat(start_str).date() if start_str else None
            except Exception:
                start = None
            try:
                end = datetime.fromisoformat(exp_str).date() if exp_str else None
            except Exception:
                end = None
            if start and end and end >= start:
                days_total = (end - start).days or 1
                days_remaining = max(0, (end - today).days)
                days_elapsed = max(0, min(days_total, (today - start).days))
                d["days_total"] = days_total
                d["days_remaining"] = days_remaining
                d["days_elapsed"] = days_elapsed
                d["days_elapsed_pct"] = round(days_elapsed / days_total * 100, 1)
                d["cost_per_day"] = round((fee / days_total), 2) if fee else None
                d["expired"] = days_remaining == 0 and today > end
                d["expiring_soon"] = 0 < days_remaining <= 7
            else:
                d["days_total"] = None
                d["days_remaining"] = None
                d["days_elapsed_pct"] = None
                d["cost_per_day"] = None
                d["expired"] = False
                d["expiring_soon"] = False
            items.append(d)
        return items

    @r.post("/memberships/{membership_id}/log-spend")
    async def log_membership_spend(membership_id: str, payload: LogSpendBody):
        try:
            oid = ObjectId(membership_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid membership id")
        doc = await db.vouchers.find_one({"_id": oid, "user_pin": payload.user_pin})
        if not doc or doc.get("category") != "memberships":
            raise HTTPException(status_code=404, detail="Membership not found")
        new_spend = (doc.get("total_spend") or 0) + payload.amount
        rate = doc.get("benefit_rate") or 0
        new_savings = (
            round(new_spend * rate, 2) if rate else (doc.get("savings_realized") or 0)
        )
        await db.vouchers.update_one(
            {"_id": oid},
            {
                "$set": {"total_spend": round(new_spend, 2), "savings_realized": new_savings},
                "$push": {
                    "spend_log": {
                        "amount": payload.amount,
                        "note": payload.note,
                        "logged_at": datetime.now(timezone.utc).isoformat(),
                    }
                },
            },
        )
        updated = await db.vouchers.find_one({"_id": oid})
        return serialize(updated)

    # -------- Smart Search --------
    @r.get("/search/brand")
    async def search_brand(q: str = Query(...), user_pin: Optional[str] = None):
        ql = q.strip().lower()
        parent = lookup_parent(q)
        matches = [
            {"brand": k.title(), "parent_company": v}
            for k, v in BRAND_PARENT_MAP.items()
            if ql in k or k in ql
        ][:8]
        user_matches: list[dict] = []
        if user_pin and ql:
            cursor = db.vouchers.find({
                "user_pin": user_pin,
                "$or": [
                    {"brand": {"$regex": ql, "$options": "i"}},
                    {"parent_company": {"$regex": ql, "$options": "i"}},
                ],
            }).limit(10)
            async for d in cursor:
                user_matches.append({
                    "id": str(d["_id"]),
                    "brand": d.get("brand"),
                    "parent_company": d.get("parent_company"),
                    "title": d.get("title"),
                    "code": d.get("code"),
                    "expiry": d.get("expiry"),
                    "category": d.get("category"),
                })
        return {
            "query": q,
            "parent_company": parent,
            "matches": matches,
            "user_matches": user_matches,
        }

    return r
