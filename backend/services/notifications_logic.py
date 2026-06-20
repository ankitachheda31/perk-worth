"""Dynamic expiry & break-even notifications.

User-first expiry policy: notify ONLY at exactly 3 days and 1 day before expiry.
Idempotent (upsert keyed by user_pin + kind + ref_voucher_id) so each voucher
fires at most ONE "ending_soon" and ONE "urgent_expiry" — never spammy.
"""
from __future__ import annotations

from datetime import datetime, timezone

EXPIRY_HEADS_UP_DAYS = 3   # "Ending Soon" notification trigger
EXPIRY_URGENT_DAYS = 1     # "Urgent Expiry" notification trigger


async def generate_dynamic_notifications(db, user_pin: str) -> list[dict]:
    """Compute ending-soon + ROI break-even alerts from current voucher data
    and upsert them into the notifications collection so the bell stays in sync."""
    today = datetime.now(timezone.utc).date()
    items: list[dict] = []

    # Expiry alerts — fire at exactly 3 days and 1 day before expiry
    async for v in db.vouchers.find(
        {"user_pin": user_pin, "category": "vouchers", "status": {"$ne": "redeemed"}}
    ):
        exp = v.get("expiry")
        if not exp:
            continue
        try:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        except Exception:
            continue
        days_left = (exp_date - today).days
        if days_left == EXPIRY_HEADS_UP_DAYS:
            kind = "ending_soon"
        elif 0 <= days_left <= EXPIRY_URGENT_DAYS:
            kind = "urgent_expiry"
        else:
            continue
        brand = v.get("brand", "Voucher")
        if kind == "urgent_expiry":
            when = "today" if days_left == 0 else "tomorrow"
            title = f"⚠️ {brand} expires {when}"
        else:
            title = f"{brand} expires in {days_left} days"
        items.append({
            "user_pin": user_pin,
            "kind": kind,
            "ref_voucher_id": str(v["_id"]),
            "ref_screen": "coupons",
            "title": title,
            "body": v.get("title") or v.get("code") or "Tap to view",
            "priority": 0 if kind == "urgent_expiry" else 1,
        })

    # Asset memberships nearing break-even
    async for m in db.vouchers.find(
        {"user_pin": user_pin, "category": "memberships", "membership_kind": "asset"}
    ):
        fee = m.get("fee_paid") or 0
        saved = m.get("savings_realized") or 0
        if fee > 0 and saved >= fee:
            items.append({
                "user_pin": user_pin,
                "kind": "break_even",
                "ref_voucher_id": str(m["_id"]),
                "ref_screen": "coupons",
                "title": f"{m.get('brand', 'Membership')} reached break-even",
                "body": f"You've saved ₹{int(saved)} on a ₹{int(fee)} fee — keep using.",
                "priority": 2,
            })

    # Upsert (idempotent by user_pin + kind + ref_voucher_id)
    for n in items:
        n["created_at"] = datetime.now(timezone.utc).isoformat()
        await db.notifications.update_one(
            {
                "user_pin": n["user_pin"],
                "kind": n["kind"],
                "ref_voucher_id": n.get("ref_voucher_id"),
            },
            {"$setOnInsert": {**n, "read": False}},
            upsert=True,
        )
    # Clean stale ending-soon / urgent_expiry for vouchers that no longer qualify
    keep_voucher_ids = [n["ref_voucher_id"] for n in items
                        if n["kind"] in ("ending_soon", "urgent_expiry")]
    await db.notifications.delete_many({
        "user_pin": user_pin,
        "kind": {"$in": ["ending_soon", "urgent_expiry"]},
        "ref_voucher_id": {"$nin": keep_voucher_ids},
    })
    return items
