"""LLM-powered voucher extraction + brand→parent lookup."""
from __future__ import annotations

import base64
import io
import json
import logging
import re
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from PIL import Image

from services.db import EMERGENT_LLM_KEY

log = logging.getLogger("perk_orbit.llm")


# ---- Legacy inline brand → parent map (preserved for any niche brand not in JSON registry) ----
BRAND_PARENT_MAP = {
    "croma": "Tata", "tata cliq": "Tata", "westside": "Tata", "tata neu": "Tata",
    "bigbasket": "Tata", "1mg": "Tata", "starbucks india": "Tata", "taj": "Tata",
    "zudio": "Tata",
    "reliance digital": "Reliance", "jiomart": "Reliance", "ajio": "Reliance",
    "trends": "Reliance", "smart bazaar": "Reliance", "netmeds": "Reliance",
    "tira": "Reliance",
    "myntra": "Flipkart", "flipkart": "Flipkart", "cleartrip": "Flipkart", "shopsy": "Flipkart",
    "amazon": "Amazon", "amazon pay": "Amazon", "amazon fresh": "Amazon",
    "swiggy": "Swiggy", "instamart": "Swiggy",
    "zomato": "Zomato", "blinkit": "Zomato", "hyperpure": "Zomato", "district": "Zomato",
    "lifestyle": "Landmark Group", "max": "Landmark Group",
    "home centre": "Landmark Group", "splash": "Landmark Group",
    "shoppers stop": "Reliance",
    "netflix": "Netflix", "prime video": "Amazon", "hotstar": "Disney",
    "disney+ hotstar": "Disney", "sonyliv": "Sony", "zee5": "Zee",
    "spotify": "Spotify", "youtube premium": "Google",
    "uber": "Uber", "ola": "Ola", "ixigo": "Ixigo",
    "makemytrip": "MakeMyTrip", "goibibo": "MakeMyTrip",
    "bookmyshow": "BookMyShow",
    "dominos": "Jubilant FoodWorks", "pizza hut": "Devyani International",
    "kfc": "Devyani International", "mcdonalds": "Westlife Foodworld",
    "starbucks": "Tata",
}


def lookup_parent(brand: str) -> Optional[str]:
    """Look up parent conglomerate for a brand. Tries curated JSON registry first,
    then falls back to the legacy inline map."""
    if not brand:
        return None
    try:
        from brand_registry import lookup as _registry_lookup
        parent, _canonical = _registry_lookup(brand)
        if parent:
            return parent
    except Exception:
        pass
    key = brand.strip().lower()
    if key in BRAND_PARENT_MAP:
        return BRAND_PARENT_MAP[key]
    for k, v in BRAND_PARENT_MAP.items():
        if k in key or key in k:
            return v
    return None


# ---- GPT-4o extraction ----
EXTRACTION_SYSTEM_PROMPT = """You extract Indian voucher / coupon / gift card details from text or images.

Return ONLY a strict JSON object (no markdown fences, no commentary) with these keys:
{
  "brand": string (e.g. "Swiggy", "Croma", "Myntra"),
  "title": string (short human label, e.g. "₹100 off on order above ₹399"),
  "code": string|null (the coupon code if present, uppercase, trimmed),
  "value": number|null (rupee value of the discount, integer or float),
  "points": number|null (loyalty points if mentioned),
  "expiry": string|null (ISO date YYYY-MM-DD if a date is present, else null),
  "category": "vouchers" | "memberships",
  "membership_kind": "asset" | "content" | null,
  "how_to_redeem": string|null (1-2 sentence redemption instructions extracted)
}

Rules:
- Be conservative: if a field is not clearly present, return null.
- For membership_kind: "asset" = retail/shopping/lounge memberships (Reliance One, Landmark Rewards, Croma Privileges). "content" = streaming/subscription (Netflix, Prime, Spotify).
- If the input is a marketing SMS for a coupon code, set category=vouchers.
- Today's date is provided by the system; convert relative dates ("valid till 25 Oct") to ISO.
- Never invent codes or expiry."""


async def llm_extract_structured(user_text: str, image_base64: Optional[str] = None) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"extract-{secrets.token_hex(6)}",
        system_message=EXTRACTION_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-4o")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prompt = f"Today is {today}. Extract the voucher details. Input:\n\n{user_text}"

    file_contents = [ImageContent(image_base64=image_base64)] if image_base64 else None
    msg = UserMessage(text=prompt, file_contents=file_contents) if file_contents else UserMessage(text=prompt)
    response = await chat.send_message(msg)

    text = response if isinstance(response, str) else str(response)
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
    except Exception:
        m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not m:
            raise HTTPException(status_code=502, detail=f"LLM returned non-JSON: {text[:200]}")
        data = json.loads(m.group(0))

    if data.get("brand"):
        data["parent_company"] = lookup_parent(data["brand"])
    if data.get("code"):
        data["code"] = str(data["code"]).strip().upper()
    return data


def normalize_image_b64(raw: str) -> str:
    """Strip data URL prefix, re-encode to JPEG, downscale large images."""
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        binary = base64.b64decode(raw)
        img = Image.open(io.BytesIO(binary))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"bad image: {e}")
