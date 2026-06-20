"""Pure billing constants + helpers shared by routes.billing and routes.notifications.

Kept free of FastAPI / HTTP concerns so unit tests and cron jobs can reuse it.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

# Plan constants
REFERRAL_BONUS_DAYS = 90   # 3 months free for both referrer & referee
PLAN_BASE_DAYS = 92        # 3-month quarterly plan (Razorpay + manual activation)
PLAN_LABEL = "PerkWorth Pro ₹99 / 3 months"


def fmtdt_short(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%d %b %Y")
    except Exception:
        return iso


async def apply_referral_bonus(db, user_pin: str, referral_code: str) -> dict:
    """If referral_code is valid (belongs to another active member),
    extend BOTH the referrer's and referee's expiry by REFERRAL_BONUS_DAYS.
    Idempotent — one bonus per (referrer, referee) pair."""
    if not referral_code:
        return {"applied": False, "reason": "no code"}
    code = referral_code.strip().upper()
    referrer = await db.app_membership.find_one({"referral_code": code, "active": True})
    if not referrer:
        return {"applied": False, "reason": "code not found"}
    if referrer.get("user_pin") == user_pin:
        return {"applied": False, "reason": "cannot self-refer"}

    existing = await db.referrals.find_one(
        {"referrer_pin": referrer["user_pin"], "referee_pin": user_pin}
    )
    if existing:
        return {"applied": False, "reason": "already redeemed"}

    await db.referrals.insert_one({
        "referrer_pin": referrer["user_pin"],
        "referee_pin": user_pin,
        "code": code,
        "bonus_days": REFERRAL_BONUS_DAYS,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        cur_exp = datetime.fromisoformat(referrer["expires_at"])
    except Exception:
        cur_exp = datetime.now(timezone.utc)
    new_exp = (cur_exp + timedelta(days=REFERRAL_BONUS_DAYS)).isoformat()
    await db.app_membership.update_one(
        {"user_pin": referrer["user_pin"]}, {"$set": {"expires_at": new_exp}}
    )
    await db.notifications.insert_one({
        "user_pin": referrer["user_pin"],
        "kind": "referral_bonus",
        "title": f"Bonus! +{REFERRAL_BONUS_DAYS} days added",
        "body": f"A friend used your code {code}. Your membership now extends to {fmtdt_short(new_exp)}.",
        "ref_screen": "membership",
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"applied": True, "bonus_days": REFERRAL_BONUS_DAYS, "referrer_pin": referrer["user_pin"]}
