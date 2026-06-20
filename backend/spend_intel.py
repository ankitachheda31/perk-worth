"""PerkWorth — Smart Spend Inference.

Privacy-first feature: user pastes their bank/UPI transaction SMS messages
(could be 1 or 50), GPT-4o categorizes each into our spend categories, and
we aggregate to a monthly average per category. The Savings Assistant then
auto-fills sliders with these REAL numbers so the user immediately sees
"you're leaving ₹X/yr on the table" — no manual data entry.

Privacy guarantees:
- The raw SMS text is sent to OpenAI for one classification call only.
- We do NOT persist the raw SMS — only the aggregated per-category amounts.
- User can disable storage entirely via `persist=False` query param (default true
  to enable showing "your last inferred spend" next visit; opt-out by setting false).
"""
from __future__ import annotations

import json
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

log = logging.getLogger("perk_orbit.spend")


# Categories must match cards.py CATEGORIES exactly so the Savings Assistant
# can pre-fill sliders without translation. "other" is a bucket for spends that
# don't map to any reward category (rent, utilities, etc.) — surfaced for transparency.
CATEGORIES = [
    "online_shopping",
    "food_delivery",
    "fuel",
    "groceries",
    "travel",
    "entertainment",
    "fitness",
    "other",
]


SPEND_PROMPT = """You parse Indian bank / UPI / credit-card SMS messages and categorize spends.

Given a block of SMS text (multiple messages concatenated, possibly with junk lines),
return ONLY strict JSON with this shape:

{
  "transactions": [
    {"amount_inr": number, "merchant": string|null, "category": string, "date": "YYYY-MM-DD"|null}
  ],
  "window_days_observed": number   // estimated number of days the SMS span (e.g. 30, 60, 7)
}

Category MUST be ONE OF:
  - "online_shopping"  — Amazon, Flipkart, Myntra, Ajio, BigBasket-app, etc.
  - "food_delivery"    — Swiggy, Zomato, Domino's, KFC, Pizza Hut, etc.
  - "fuel"             — IOC, BPCL, HPCL, Shell, Indian Oil, petrol pump SMS
  - "groceries"        — DMart, More, Reliance Fresh, BigBasket (offline), Spencer's, local kirana
  - "travel"           — IRCTC, MakeMyTrip, Goibibo, IndiGo, Vistara, Uber, Ola, OYO, RedBus
  - "entertainment"    — BookMyShow, Netflix, Prime, Hotstar, Spotify, YouTube Premium
  - "fitness"          — Cult.fit, Gold's Gym, Decathlon, fitness subscriptions
  - "other"            — rent, utilities, EMI, insurance, ATM, salary, transfer, P2P, hospital, school fees

Rules:
- Skip credit/refund/reversal/cashback-credit/salary-credit messages.
- Skip OTP/verification SMS with no transaction amount.
- For amount, only the rupee value debited from user's account (not balance/limit).
- If you cannot guess merchant clearly, use null.
- Be CONSERVATIVE — if a spend can't be classified, use "other".
- For window_days_observed, estimate the date span from first to last txn (default 30 if unclear).
"""


class SpendInferRequest(BaseModel):
    user_pin: Optional[str] = None
    sms_text: str
    persist: bool = True


def _strip_json_fences(s: str) -> str:
    return re.sub(r"^```(?:json)?|```$", "", s.strip(), flags=re.MULTILINE).strip()


async def _call_llm(api_key: str, sms_text: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    session_id = f"spend-{secrets.token_hex(6)}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=SPEND_PROMPT,
    ).with_model("openai", "gpt-4o")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prompt = f"Today is {today}. Parse the following SMS dump:\n\n{sms_text}"

    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    cleaned = _strip_json_fences(text)
    try:
        return json.loads(cleaned)
    except Exception:
        m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not m:
            raise HTTPException(status_code=502, detail=f"LLM returned non-JSON: {text[:200]}")
        return json.loads(m.group(0))


def _aggregate_monthly(parsed: dict) -> dict:
    """Convert the LLM's transaction list into per-category monthly averages."""
    txs = parsed.get("transactions") or []
    window_days = max(int(parsed.get("window_days_observed") or 30), 1)
    by_cat: dict[str, dict] = {c: {"sum_inr": 0, "count": 0} for c in CATEGORIES}

    for t in txs:
        try:
            amt = float(t.get("amount_inr") or 0)
        except (TypeError, ValueError):
            continue
        if amt <= 0:
            continue
        cat = t.get("category") or "other"
        if cat not in by_cat:
            cat = "other"
        by_cat[cat]["sum_inr"] += amt
        by_cat[cat]["count"] += 1

    scale = 30.0 / window_days   # normalize to a 30-day month
    categories = {
        c: {
            "monthly_inr": round(v["sum_inr"] * scale),
            "txn_count": v["count"],
            "total_observed_inr": round(v["sum_inr"]),
        }
        for c, v in by_cat.items()
    }
    total_monthly = sum(v["monthly_inr"] for v in categories.values())
    # Recommended category = highest non-"other" monthly spend (Savings Assistant default)
    reward_cats = {k: v for k, v in categories.items() if k != "other"}
    recommend_category = max(reward_cats, key=lambda k: reward_cats[k]["monthly_inr"]) if reward_cats else "online_shopping"
    return {
        "categories": categories,
        "total_monthly_inr": total_monthly,
        "window_days_observed": window_days,
        "transactions_parsed": len(txs),
        "recommend_category": recommend_category,
    }


def build_spend_router(db, emergent_llm_key: str) -> APIRouter:
    router = APIRouter(prefix="/api/spend", tags=["spend"])

    @router.post("/infer")
    async def infer(body: SpendInferRequest):
        text = (body.sms_text or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="sms_text is required")
        if len(text) > 60000:
            raise HTTPException(status_code=413, detail="SMS block too large (max 60KB)")

        parsed = await _call_llm(emergent_llm_key, text)
        result = _aggregate_monthly(parsed)

        # Persist ONLY the aggregated summary (never raw SMS). User-controllable.
        if body.persist and body.user_pin:
            try:
                await db.spend_profiles.update_one(
                    {"user_pin": body.user_pin},
                    {
                        "$set": {
                            **result,
                            "user_pin": body.user_pin,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                    upsert=True,
                )
            except Exception as e:
                log.warning("spend persist failed: %s", e)

        return result

    @router.get("/profile")
    async def get_profile(user_pin: str):
        doc = await db.spend_profiles.find_one({"user_pin": user_pin})
        if not doc:
            return {"exists": False}
        doc.pop("_id", None)
        return {"exists": True, **doc}

    @router.delete("/profile")
    async def clear_profile(user_pin: str):
        await db.spend_profiles.delete_one({"user_pin": user_pin})
        return {"ok": True}

    return router
