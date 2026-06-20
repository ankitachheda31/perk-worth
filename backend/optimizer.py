"""PerkWorth — Intelligent Redemption Optimizer (a.k.a. Masterclass engine).

Hybrid approach:
- A curated rules-based library covering top Indian loyalty programs
  (Tata Neu, Amazon Pay, Flipkart, Swiggy/Zomato, HDFC/SBI/Axis miles, etc.)
- GPT-4o fallback for any brand not in the rules library

Endpoint surface (mounted at /api/optimizer):
- GET  /api/optimizer/tips?user_pin=...  → list of suggestions
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Query

log = logging.getLogger("perk_orbit.optimizer")


# ---------------------------------------------------------------------------
# Rules library — keyed by brand (case-insensitive)
# Each rule produces a tip dict given the user's voucher document.
# ---------------------------------------------------------------------------
def _tata_neu_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    if pts >= 1000:
        action = (
            "Redeem on BigBasket or 1mg for ~1.2x value (1 NeuCoin ≈ ₹1.2 vs ₹1 elsewhere)."
        )
    elif pts >= 250:
        action = "Use on Tata 1mg for chronic medicine refills — best per-coin redemption rate."
    else:
        action = "Hold and top up via Tata Neu HDFC card (5% NeuCoins) until you cross 250 — minimum useful threshold."
    return {
        "id": f"tip-tataneu-{v.get('id','')}",
        "kind": "redeem",
        "brand": v.get("brand"),
        "title": "Tata NeuCoins — optimize your redemption",
        "body": action,
        "potential_gain_inr": round(pts * 0.2, 0) if pts >= 1000 else None,
        "confidence": "high",
        "source": "rules",
    }


def _amazon_pay_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    if pts >= 500:
        action = "Pay Amazon Pay balance for Bharat Petroleum fuel — 1% back + no card surcharge."
    else:
        action = "Set Amazon Pay as default on UPI Lite for ₹1-cashback per txn — accumulates fast."
    return {
        "id": f"tip-amazonpay-{v.get('id','')}",
        "kind": "redeem",
        "brand": v.get("brand"),
        "title": "Amazon Pay balance — squeeze extra value",
        "body": action,
        "potential_gain_inr": round(pts * 0.02, 0) if pts >= 500 else None,
        "confidence": "high",
        "source": "rules",
    }


def _flipkart_supercoins_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    if pts >= 100:
        action = "Use SuperCoins on Cleartrip flights — 1 coin = ₹1 on airfare vs ₹0.25 on Flipkart shopping. 4x value."
    else:
        action = "Top up via Flipkart Plus subscriptions or Myntra orders — both earn SuperCoins at 4x normal rate."
    return {
        "id": f"tip-supercoins-{v.get('id','')}",
        "kind": "transfer",
        "brand": v.get("brand"),
        "title": "Flipkart SuperCoins — 4x via Cleartrip",
        "body": action,
        "potential_gain_inr": round(pts * 0.75, 0) if pts >= 100 else None,
        "confidence": "high",
        "source": "rules",
    }


def _swiggy_money_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    if pts >= 200:
        action = "Stack Swiggy Money with One BHIM UPI offer — get 5% extra on next Instamart grocery order."
    else:
        action = "Order via Swiggy One ₹49 trial — Swiggy Money + free delivery + 10% off. Net positive even for one order."
    return {
        "id": f"tip-swiggy-{v.get('id','')}",
        "kind": "stack",
        "brand": v.get("brand"),
        "title": "Swiggy Money — stack with UPI for 5% extra",
        "body": action,
        "potential_gain_inr": round(pts * 0.05, 0) if pts >= 200 else None,
        "confidence": "medium",
        "source": "rules",
    }


def _hdfc_smartbuy_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    action = (
        "Transfer HDFC reward points to airline miles via SmartBuy "
        "(InterMiles, Vistara CV, Air India) for 1.5–2x redemption value vs cashback."
    )
    return {
        "id": f"tip-hdfc-{v.get('id','')}",
        "kind": "transfer",
        "brand": v.get("brand"),
        "title": "HDFC reward points — convert via SmartBuy",
        "body": action,
        "potential_gain_inr": round(pts * 0.5, 0) if pts >= 1000 else None,
        "confidence": "high",
        "source": "rules",
    }


def _axis_edge_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    action = "Transfer Axis Edge Miles to Marriott Bonvoy at 5:4 — best partner ratio (vs 5:2 to airlines)."
    return {
        "id": f"tip-axis-{v.get('id','')}",
        "kind": "transfer",
        "brand": v.get("brand"),
        "title": "Axis Edge Miles — Marriott is the sweet spot",
        "body": action,
        "potential_gain_inr": round(pts * 0.4, 0) if pts >= 5000 else None,
        "confidence": "high",
        "source": "rules",
    }


def _sbi_rewardz_tip(v: dict) -> Optional[dict]:
    pts = v.get("points") or 0
    if pts <= 0:
        return None
    action = "Redeem SBI Rewardz against statement credit at ₹0.25/pt; for higher value, use on Shop & Smile catalog for ~₹0.35/pt."
    return {
        "id": f"tip-sbi-{v.get('id','')}",
        "kind": "redeem",
        "brand": v.get("brand"),
        "title": "SBI Reward Points — catalog beats statement credit",
        "body": action,
        "potential_gain_inr": round(pts * 0.1, 0) if pts >= 1000 else None,
        "confidence": "medium",
        "source": "rules",
    }


def _generic_expiry_tip(v: dict) -> Optional[dict]:
    expiry = v.get("expiry")
    if not expiry:
        return None
    try:
        d = datetime.fromisoformat(expiry).date()
    except Exception:
        return None
    days = (d - datetime.now(timezone.utc).date()).days
    if 0 < days <= 14:
        return {
            "id": f"tip-expiry-{v.get('id','')}",
            "kind": "urgent",
            "brand": v.get("brand"),
            "title": f"{v.get('brand') or 'Voucher'} expires in {days} day{'s' if days != 1 else ''}",
            "body": f"Use {v.get('title') or 'this voucher'} before it disappears — worth {v.get('value') or '—'}.",
            "potential_gain_inr": v.get("value"),
            "confidence": "high",
            "source": "rules",
        }
    return None


def _membership_renewal_tip(v: dict) -> Optional[dict]:
    if v.get("category") != "memberships":
        return None
    kind = v.get("membership_kind")
    fee = v.get("fee_paid") or 0
    saved = v.get("savings_realized") or 0
    if kind == "asset" and fee and saved < fee * 0.5:
        return {
            "id": f"tip-renew-{v.get('id','')}",
            "kind": "warn",
            "brand": v.get("brand"),
            "title": f"{v.get('brand')} not paying back",
            "body": f"You've recovered ₹{saved} of ₹{fee}. Consider pausing renewal — switch to a cheaper alternative or use a free tier.",
            "potential_gain_inr": round(fee - saved, 0),
            "confidence": "high",
            "source": "rules",
        }
    return None


RULES_LIBRARY = {
    "tata neu": _tata_neu_tip,
    "tata neucoins": _tata_neu_tip,
    "neucoins": _tata_neu_tip,
    "tata neu hdfc": _tata_neu_tip,
    "amazon pay": _amazon_pay_tip,
    "amazon": _amazon_pay_tip,
    "flipkart": _flipkart_supercoins_tip,
    "flipkart plus": _flipkart_supercoins_tip,
    "supercoins": _flipkart_supercoins_tip,
    "myntra": _flipkart_supercoins_tip,
    "swiggy": _swiggy_money_tip,
    "swiggy one": _swiggy_money_tip,
    "hdfc": _hdfc_smartbuy_tip,
    "hdfc smartbuy": _hdfc_smartbuy_tip,
    "hdfc bank": _hdfc_smartbuy_tip,
    "axis": _axis_edge_tip,
    "axis bank": _axis_edge_tip,
    "axis edge": _axis_edge_tip,
    "sbi": _sbi_rewardz_tip,
    "sbi rewardz": _sbi_rewardz_tip,
    "sbi card": _sbi_rewardz_tip,
}


def _rule_for(brand: str):
    if not brand:
        return None
    key = brand.strip().lower()
    if key in RULES_LIBRARY:
        return RULES_LIBRARY[key]
    # Loose match: take longest matching key
    matches = [(k, fn) for k, fn in RULES_LIBRARY.items() if k in key or key in k]
    if not matches:
        return None
    matches.sort(key=lambda kv: -len(kv[0]))
    return matches[0][1]


# ---------------------------------------------------------------------------
# Optional GPT-4o fallback for unknown brands
# ---------------------------------------------------------------------------
async def _llm_fallback_tip(v: dict, emergent_llm_key: str) -> Optional[dict]:
    if not emergent_llm_key:
        return None
    brand = v.get("brand") or ""
    pts = v.get("points") or 0
    if not brand or pts <= 0:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=emergent_llm_key,
            session_id=f"optimizer-{secrets.token_hex(4)}",
            system_message=(
                "You are a loyalty-program optimizer for Indian consumers. "
                "Given a brand and a point balance, return STRICT JSON: "
                '{"title": str, "body": str, "kind": "redeem|transfer|stack|warn|urgent", '
                '"confidence": "low|medium|high", "potential_gain_inr": int|null}. '
                "Body must be a single actionable sentence under 160 chars, mentioning the partner or method. "
                "If no genuine optimization exists, set kind='redeem' and body explaining the best default redemption."
            ),
        ).with_model("openai", "gpt-4o")
        msg = f"Brand: {brand}\nPoints balance: {pts}\nIndian market context only."
        response = await chat.send_message(UserMessage(text=msg))
        import json
        import re
        raw = response if isinstance(response, str) else str(response)
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        try:
            data = json.loads(raw)
        except Exception:
            m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            if not m:
                return None
            data = json.loads(m.group(0))
        return {
            "id": f"tip-llm-{v.get('id','')}",
            "kind": data.get("kind", "redeem"),
            "brand": brand,
            "title": data.get("title") or f"{brand} — best redemption",
            "body": data.get("body") or "Use against statement credit for guaranteed ₹0.25/point.",
            "potential_gain_inr": data.get("potential_gain_inr"),
            "confidence": data.get("confidence", "medium"),
            "source": "llm",
        }
    except Exception as e:
        log.warning("LLM optimizer fallback failed: %s", e)
        return None

# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
def build_optimizer_router(db, emergent_llm_key: str) -> APIRouter:
    router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])

    @router.get("/tips")
    async def list_tips(
        user_pin: str = Query(...),
        use_llm_fallback: bool = Query(True),
        limit: int = Query(20, ge=1, le=50),
    ):
        cursor = db.vouchers.find({"user_pin": user_pin})
        tips: list[dict] = []
        unknowns: list[dict] = []

        async for d in cursor:
            d["id"] = str(d.pop("_id")) if "_id" in d else d.get("id")
            # Always run cross-brand rules first
            for fn in (_generic_expiry_tip, _membership_renewal_tip):
                t = fn(d)
                if t:
                    tips.append(t)
            # Brand-specific rule (if any)
            rule = _rule_for(d.get("brand") or "")
            if rule:
                t = rule(d)
                if t:
                    tips.append(t)
            else:
                # Candidate for LLM fallback if it has points
                if d.get("points"):
                    unknowns.append(d)

        # LLM fallback for unknown brands (cap to avoid runaway cost)
        if use_llm_fallback and emergent_llm_key:
            for v in unknowns[:3]:
                t = await _llm_fallback_tip(v, emergent_llm_key)
                if t:
                    tips.append(t)

        # De-duplicate by title + brand
        seen = set()
        unique: list[dict] = []
        for t in tips:
            key = (t.get("brand"), t.get("title"))
            if key in seen:
                continue
            seen.add(key)
            unique.append(t)

        # Sort: urgent > warn > transfer > stack > redeem
        priority = {"urgent": 0, "warn": 1, "transfer": 2, "stack": 3, "redeem": 4}
        unique.sort(key=lambda t: (priority.get(t.get("kind"), 5), -(t.get("potential_gain_inr") or 0)))

        return {"tips": unique[:limit], "total": len(unique)}

    return router
