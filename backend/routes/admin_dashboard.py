"""Admin Dashboard — app-wide aggregate metrics for the operator console.

Separate from `admin_routes.py` (which is registry-intel-only) so we keep
each concern in its own thin router. Endpoints live under /api/admin/dashboard.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

log = logging.getLogger("perk_orbit.admin_dashboard")


def _admin_required(get_current_user):
    async def _dep(user=Depends(get_current_user)):
        if user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return user
    return _dep


def build_admin_dashboard_router(db, get_current_user) -> APIRouter:
    router = APIRouter(prefix="/api/admin/dashboard", tags=["admin"])
    admin_only = _admin_required(get_current_user)

    @router.get("/stats")
    async def dashboard_stats(_admin=Depends(admin_only)):
        """Single roll-up of the metrics an admin demos to investors / KYC:
        total ₹ saved, active Pro members, pending registry items + recent activity.
        Read-only; never mutates state."""
        now = datetime.now(timezone.utc)
        today = now.date()
        year_start_iso = f"{today.year}-01-01T00:00:00+00:00"
        seven_days_ago_iso = (now - timedelta(days=7)).isoformat()

        # ---- Savings (aggregate over ALL users) ----
        # Mongo $group runs server-side; far cheaper than streaming docs to Python.
        pipeline = [
            {"$match": {"status": "redeemed"}},
            {"$group": {
                "_id": None,
                "total_saved": {"$sum": {"$ifNull": ["$savings_realized", 0]}},
                "count": {"$sum": 1},
            }},
        ]
        agg = await db.vouchers.aggregate(pipeline).to_list(length=1)
        total_saved = round(float(agg[0]["total_saved"]) if agg else 0.0, 2)
        total_redeemed = int(agg[0]["count"]) if agg else 0

        ytd_pipeline = [
            {"$match": {"status": "redeemed", "redeemed_at": {"$gte": year_start_iso}}},
            {"$group": {
                "_id": None,
                "saved": {"$sum": {"$ifNull": ["$savings_realized", 0]}},
                "count": {"$sum": 1},
            }},
        ]
        ytd_agg = await db.vouchers.aggregate(ytd_pipeline).to_list(length=1)
        ytd_saved = round(float(ytd_agg[0]["saved"]) if ytd_agg else 0.0, 2)
        ytd_redeemed = int(ytd_agg[0]["count"]) if ytd_agg else 0

        # ---- Membership (Pro plan) ----
        active_members = await db.app_membership.count_documents({"active": True})
        # Active members whose expires_at is still in the future (lapsed actives count as 0)
        active_not_expired = await db.app_membership.count_documents({
            "active": True,
            "expires_at": {"$gte": now.isoformat()},
        })
        new_pro_7d = await db.app_membership.count_documents({
            "activated_at": {"$gte": seven_days_ago_iso},
        })

        # ---- Users & vouchers (system size) ----
        total_users = await db.users.count_documents({})
        total_vouchers = await db.vouchers.count_documents({})
        total_active_vouchers = await db.vouchers.count_documents({
            "$or": [
                {"status": "active"},
                {"status": {"$exists": False}},
                {"status": None},
            ]
        })

        # ---- Registry intel queue ----
        pending_registry = await db.registry_pending.count_documents({"status": "pending"})
        high_impact_pending = await db.registry_pending.count_documents({
            "status": "pending", "high_impact": True,
        })
        approved_total = await db.registry_pending.count_documents({"status": "approved"})

        # ---- Recent activity (last 7 days) ----
        new_users_7d = await db.users.count_documents({
            "created_at": {"$gte": seven_days_ago_iso},
        })
        # Redemptions in the last 7 days
        recent_redeem_pipeline = [
            {"$match": {"status": "redeemed", "redeemed_at": {"$gte": seven_days_ago_iso}}},
            {"$group": {
                "_id": None,
                "saved": {"$sum": {"$ifNull": ["$savings_realized", 0]}},
                "count": {"$sum": 1},
            }},
        ]
        recent_agg = await db.vouchers.aggregate(recent_redeem_pipeline).to_list(length=1)
        recent_saved_7d = round(float(recent_agg[0]["saved"]) if recent_agg else 0.0, 2)
        recent_redeemed_7d = int(recent_agg[0]["count"]) if recent_agg else 0

        return {
            "generated_at": now.isoformat(),
            "savings": {
                "total_saved_inr": total_saved,
                "total_redeemed_count": total_redeemed,
                "ytd_saved_inr": ytd_saved,
                "ytd_redeemed_count": ytd_redeemed,
                "current_year": today.year,
                "recent_saved_inr_7d": recent_saved_7d,
                "recent_redeemed_count_7d": recent_redeemed_7d,
            },
            "members": {
                "active_total": active_members,
                "active_not_expired": active_not_expired,
                "new_in_7d": new_pro_7d,
            },
            "users": {
                "total": total_users,
                "new_in_7d": new_users_7d,
            },
            "vouchers": {
                "total": total_vouchers,
                "active": total_active_vouchers,
                "redeemed": total_redeemed,
            },
            "registry": {
                "pending": pending_registry,
                "high_impact_pending": high_impact_pending,
                "approved_total": approved_total,
            },
        }

    return router
