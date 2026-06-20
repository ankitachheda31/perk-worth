"""PerkWorth FastAPI backend.

Provides:
- OCR voucher extraction (image → structured voucher JSON) via GPT-4o vision
- SMS parsing (text → structured voucher JSON) via GPT-4o
- CRUD for vouchers and memberships persisted in MongoDB
- Family Circle invite/share endpoints
- Membership ROI tracking
"""
from __future__ import annotations

import base64
import hmac
import hashlib
import io
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any, List, Optional

from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, APIRouter, Body
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field
import razorpay

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("perk_orbit")

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Razorpay client (test mode)
_rzp_client: Optional[razorpay.Client] = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    _rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# ---------------------------------------------------------------------------
# PyObjectId helper + Pydantic models — moved to models.py
# ---------------------------------------------------------------------------
from models import (  # noqa: E402  (centralized models module)
    PyObjectId,
    BaseDocument,
    Voucher,
    VoucherCreate,
    VoucherUpdate,
    OCRTextInput,
    OCRImageBase64Input,
    ShareInviteCreate,
    FamilyCircleMember,
    FamilyCircleAdd,
    LogSpendBody,
    RzpOrderRequest,
    RzpVerifyRequest,
    SupportLog,
)


# ---------------------------------------------------------------------------
# Brand → Parent Company map (Smart Search)
# ---------------------------------------------------------------------------
BRAND_PARENT_MAP = {
    "croma": "Tata",
    "tata cliq": "Tata",
    "westside": "Tata",
    "tata neu": "Tata",
    "bigbasket": "Tata",
    "1mg": "Tata",
    "starbucks india": "Tata",
    "taj": "Tata",
    "zudio": "Tata",
    "reliance digital": "Reliance",
    "jiomart": "Reliance",
    "ajio": "Reliance",
    "trends": "Reliance",
    "smart bazaar": "Reliance",
    "netmeds": "Reliance",
    "tira": "Reliance",
    "myntra": "Flipkart",
    "flipkart": "Flipkart",
    "cleartrip": "Flipkart",
    "shopsy": "Flipkart",
    "amazon": "Amazon",
    "amazon pay": "Amazon",
    "amazon fresh": "Amazon",
    "swiggy": "Swiggy",
    "instamart": "Swiggy",
    "zomato": "Zomato",
    "blinkit": "Zomato",
    "hyperpure": "Zomato",
    "district": "Zomato",
    "lifestyle": "Landmark Group",
    "max": "Landmark Group",
    "home centre": "Landmark Group",
    "splash": "Landmark Group",
    "shoppers stop": "Reliance",
    "netflix": "Netflix",
    "prime video": "Amazon",
    "hotstar": "Disney",
    "disney+ hotstar": "Disney",
    "sonyliv": "Sony",
    "zee5": "Zee",
    "spotify": "Spotify",
    "youtube premium": "Google",
    "uber": "Uber",
    "ola": "Ola",
    "ixigo": "Ixigo",
    "makemytrip": "MakeMyTrip",
    "goibibo": "MakeMyTrip",
    "bookmyshow": "BookMyShow",
    "dominos": "Jubilant FoodWorks",
    "pizza hut": "Devyani International",
    "kfc": "Devyani International",
    "mcdonalds": "Westlife Foodworld",
    "starbucks": "Tata",
}


def lookup_parent(brand: str) -> Optional[str]:
    if not brand:
        return None
    # 1) Comprehensive curated registry (data/brand_registry.json — ~200 Indian brands)
    try:
        from brand_registry import lookup as _registry_lookup
        parent, _canonical = _registry_lookup(brand)
        if parent:
            return parent
    except Exception:
        pass
    # 2) Legacy inline map (kept for any niche brand not yet in the JSON registry)
    key = brand.strip().lower()
    if key in BRAND_PARENT_MAP:
        return BRAND_PARENT_MAP[key]
    for k, v in BRAND_PARENT_MAP.items():
        if k in key or key in k:
            return v
    return None


# ---------------------------------------------------------------------------
# LLM helpers (emergentintegrations) — non-streaming (structured JSON)
# ---------------------------------------------------------------------------
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

    session_id = f"extract-{secrets.token_hex(6)}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=EXTRACTION_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-4o")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    prompt = f"Today is {today}. Extract the voucher details. Input:\n\n{user_text}"

    file_contents = None
    if image_base64:
        file_contents = [ImageContent(image_base64=image_base64)]

    msg = UserMessage(text=prompt, file_contents=file_contents) if file_contents else UserMessage(text=prompt)

    # Use send_message (non-streaming) for structured JSON tasks
    response = await chat.send_message(msg)

    text = response if isinstance(response, str) else str(response)
    # strip code fences if present
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
    except Exception:
        # try to find first {...} block
        m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not m:
            raise HTTPException(status_code=502, detail=f"LLM returned non-JSON: {text[:200]}")
        data = json.loads(m.group(0))

    # normalize
    if data.get("brand"):
        data["parent_company"] = lookup_parent(data["brand"])
    if data.get("code"):
        data["code"] = str(data["code"]).strip().upper()
    return data


# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(title="PerkWorth API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"app": "PerkWorth", "status": "ok"}


@api.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "up"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}


# -------- Voucher CRUD --------
def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


@api.post("/vouchers")
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
    return _serialize(doc)


@api.get("/brands/lookup")
async def brand_lookup(q: str = Query(..., min_length=1, max_length=80)):
    """Live-suggest endpoint for the Add Voucher / Membership form.

    Returns top-10 brand matches with their parent conglomerate so the UI can
    show a `Tata Group → BigBasket` chip as the user types.
    """
    from brand_registry import search as _registry_search
    return {"results": _registry_search(q, limit=10)}


@api.get("/brands/all")
async def brand_all():
    """Flat list of all known brands. Cache-friendly — frontend can fetch once."""
    from brand_registry import all_brands as _all
    return {"brands": _all()}


@api.get("/vouchers")
async def list_vouchers(user_pin: str = Query(...), category: Optional[str] = None, status: Optional[str] = None):
    """
    List vouchers/memberships for a user.
    By default, only `active` items are returned (redeemed/expired hidden from main wallet).
    Pass status='all' to include redeemed+expired, or status='redeemed' for the History view.
    """
    q: dict = {"user_pin": user_pin}
    if category and category != "all":
        q["category"] = category
    if status == "all":
        pass  # no status filter
    elif status:
        q["status"] = status
    else:
        # Default: hide redeemed (active OR status missing = legacy data treated as active)
        q["$or"] = [{"status": "active"}, {"status": {"$exists": False}}, {"status": None}]
    cursor = db.vouchers.find(q).sort("created_at", -1)
    items = [_serialize(d) async for d in cursor]
    return items


@api.post("/vouchers/{voucher_id}/redeem")
async def redeem_voucher(voucher_id: str, body: dict = Body(default={})):
    """
    Mark a voucher as redeemed. Optionally record the actual savings_realized
    (defaults to the voucher's stated `value`). Adds redeemed_at timestamp.
    """
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
        {"_id": ObjectId(voucher_id)},
        {"$set": update},
        return_document=True,
    )
    return _serialize(res)


@api.post("/vouchers/{voucher_id}/unredeem")
async def unredeem_voucher(voucher_id: str):
    """Undo a redemption (move back to active). For the misclick safety net."""
    if not ObjectId.is_valid(voucher_id):
        raise HTTPException(status_code=400, detail="Invalid voucher id")
    res = await db.vouchers.find_one_and_update(
        {"_id": ObjectId(voucher_id)},
        {"$set": {"status": "active", "redeemed_at": None, "savings_realized": 0.0}},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return _serialize(res)


@api.get("/vouchers/savings-stats")
async def savings_stats(user_pin: str = Query(...)):
    """
    Aggregate stats for the Redemption Tracker dashboard:
    total ₹ saved, count redeemed, by-owner breakdown, current calendar year saved.
    """
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
        "by_owner": [{"owner": k, **v} for k, v in sorted(by_owner.items(), key=lambda kv: -kv[1]["saved"])],
    }


@api.get("/vouchers/ending-soon")
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
            items.append(_serialize(d))
    items.sort(key=lambda x: x["days_left"])
    return items


@api.patch("/vouchers/{voucher_id}")
async def update_voucher(voucher_id: str, payload: VoucherUpdate):
    if not ObjectId.is_valid(voucher_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    update = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if "brand" in update and update["brand"]:
        update["parent_company"] = lookup_parent(update["brand"])
    if not update:
        raise HTTPException(status_code=400, detail="No updates")
    res = await db.vouchers.find_one_and_update(
        {"_id": ObjectId(voucher_id)},
        {"$set": update},
        return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Not found")
    return _serialize(res)


@api.delete("/vouchers/{voucher_id}")
async def delete_voucher(voucher_id: str):
    if not ObjectId.is_valid(voucher_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.vouchers.delete_one({"_id": ObjectId(voucher_id)})
    return {"deleted": res.deleted_count}


# -------- Points summary --------
@api.get("/points/summary")
async def points_summary(user_pin: str = Query(...)):
    cursor = db.vouchers.find({"user_pin": user_pin})
    total_points = 0
    total_value = 0.0
    breakdown: list[dict] = []
    async for d in cursor:
        pts = d.get("points") or 0
        if pts:
            total_points += pts
            breakdown.append(
                {
                    "program_name": d.get("brand"),
                    "brand": d.get("brand"),
                    "parent_company": d.get("parent_company"),
                    "points_balance": pts,
                    "points": pts,
                    "current_cash_value": round(pts * 0.25, 2),
                    "value": round(pts * 0.25, 2),
                    "is_shared": bool(d.get("is_sharing", False)),
                }
            )
            total_value += pts * 0.25
    return {
        "total_points": total_points,
        "approx_value_inr": round(total_value, 2),
        "breakdown": breakdown,
    }


# -------- Membership ROI --------
@api.get("/memberships/roi")
async def memberships_roi(user_pin: str = Query(...)):
    cursor = db.vouchers.find({"user_pin": user_pin, "category": "memberships"})
    items = []
    today = datetime.now(timezone.utc).date()
    async for d in cursor:
        d = _serialize(d)
        kind = d.get("membership_kind")
        fee = d.get("fee_paid") or 0

        # Asset ROI (savings vs fee) — unchanged behaviour
        if kind == "asset":
            saved = d.get("savings_realized") or 0
            d["roi_progress"] = round(min(100, (saved / fee * 100) if fee else 0), 1)
            d["break_even"] = saved >= fee and fee > 0
            d["renewal_recommended"] = saved >= fee * 0.8 if fee else False

        # Break-even calculator — works for any membership that has a
        # benefit_rate (e.g. 10% discount → 0.10). Computes:
        #   break_even_spend  : spend (₹) needed for savings to equal fee
        #   remaining_spend    : spend still needed to break even
        #   cumulative_savings : total_spend × benefit_rate
        #   profit_mode        : True once cumulative_savings ≥ fee
        #   profit_earned      : ₹ surplus beyond fee (only when profit_mode)
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
            # Keep savings_realized in sync so legacy ROI display also reflects spend-based math
            if not d.get("savings_realized") or d.get("savings_realized") < cum_savings:
                d["savings_realized"] = cum_savings
        else:
            d["break_even_spend"] = None
            d["cumulative_savings"] = d.get("savings_realized") or 0
            d["remaining_spend_to_break_even"] = None
            d["profit_mode"] = (d.get("savings_realized") or 0) >= fee and fee > 0
            d["profit_earned"] = 0
            d["recovery_progress"] = round(min(100, ((d.get("savings_realized") or 0) / fee * 100)), 1) if fee else 0

        # Time-based ROI — Days Remaining, Cost per Day, % elapsed.
        # Works for BOTH asset and content memberships as long as start_date
        # and expiry are present (start_date defaults to created_at date).
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


@api.post("/memberships/{membership_id}/log-spend")
async def log_membership_spend(membership_id: str, payload: LogSpendBody):
    """Log a purchase made under this membership. Increments `total_spend`
    and recomputes `savings_realized = total_spend × benefit_rate` so the
    dashboard break-even bar and 'recovered ₹X of ₹Y' message stay live."""
    try:
        oid = ObjectId(membership_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid membership id")
    doc = await db.vouchers.find_one({"_id": oid, "user_pin": payload.user_pin})
    if not doc or doc.get("category") != "memberships":
        raise HTTPException(status_code=404, detail="Membership not found")

    new_spend = (doc.get("total_spend") or 0) + payload.amount
    rate = doc.get("benefit_rate") or 0
    new_savings = round(new_spend * rate, 2) if rate else (doc.get("savings_realized") or 0)
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
    return _serialize(updated)


# -------- OCR & SMS extraction --------
def _normalize_image_b64(raw: str) -> str:
    """Strip data URL prefix if present and re-encode to JPEG to ensure compat."""
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    try:
        binary = base64.b64decode(raw)
        img = Image.open(io.BytesIO(binary))
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        # downscale large images
        img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"bad image: {e}")


@api.post("/extract/sms")
async def extract_sms(payload: OCRTextInput):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="text required")
    data = await llm_extract_structured(payload.text)
    return data


@api.post("/extract/image")
async def extract_image(payload: OCRImageBase64Input):
    if not payload.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 required")
    normalized = _normalize_image_b64(payload.image_base64)
    data = await llm_extract_structured(
        "Extract voucher / coupon / membership card information from this image.",
        image_base64=normalized,
    )
    return data


@api.post("/extract/image-upload")
async def extract_image_upload(file: UploadFile = File(...)):
    raw = await file.read()
    b64 = base64.b64encode(raw).decode("ascii")
    normalized = _normalize_image_b64(b64)
    data = await llm_extract_structured(
        "Extract voucher / coupon / membership card information from this image.",
        image_base64=normalized,
    )
    return data


@api.post("/extract/voice")
async def extract_voice(file: UploadFile = File(...)):
    """Voice-to-voucher pipeline.

    1. Receive a short (≤15 sec, ≤25 MB) audio recording from the browser's
       MediaRecorder API — typically webm/opus container.
    2. Transcribe via OpenAI Whisper with auto language detection (handles
       Hindi, English, and code-switched Hinglish natively).
    3. Feed the transcript into the same GPT-4o structured-extraction prompt
       used by `/extract/sms`, so the parser already understands the schema
       (brand, title, code, value, expiry, category, membership_kind, etc.).
    4. Return both the raw transcript (so the UI can show "we heard: …")
       AND the parsed voucher fields (so the form pre-fills).
    """
    from emergentintegrations.llm.openai import OpenAISpeechToText
    import tempfile

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty audio")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="audio too large (max 25 MB)")

    # Whisper SDK wants a file-like object; write to a NamedTemporaryFile so it
    # has a real on-disk path + extension (helps content-type sniffing).
    suffix = ".webm"
    ct = (file.content_type or "").lower()
    if "wav" in ct: suffix = ".wav"
    elif "mp4" in ct or "m4a" in ct: suffix = ".m4a"
    elif "mp3" in ct or "mpeg" in ct: suffix = ".mp3"

    try:
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
            tmp.write(raw)
            tmp.flush()
            tmp.seek(0)
            with open(tmp.name, "rb") as audio_file:
                stt_resp = await stt.transcribe(
                    file=audio_file,
                    model="whisper-1",
                    response_format="json",
                    # No `language` hint — let Whisper auto-detect so Hindi /
                    # English / Hinglish all work. A prompt nudges the model to
                    # expect voucher/wallet vocabulary, improving accuracy on
                    # brand names and codes.
                    prompt=(
                        "Voucher and membership entry. Brands include Swiggy, "
                        "Zomato, Amazon, Flipkart, BigBasket, Croma, Myntra, "
                        "Tata Neu, Reliance, Jio, Ajio, Pantaloons. Codes are "
                        "uppercase alphanumeric. Currency is rupees (₹/Rs)."
                    ),
                    temperature=0.0,
                )
        transcript = (stt_resp.text or "").strip()
    except Exception as e:
        logging.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"voice transcription failed: {e}")

    if not transcript:
        raise HTTPException(status_code=422, detail="no speech detected — please retry")

    # Reuse the SMS extractor — its schema already matches Add Voucher form
    parsed = await llm_extract_structured(transcript)
    return {"transcript": transcript, "parsed": parsed}


# -------- Smart Search --------
@api.get("/search/brand")
async def search_brand(q: str = Query(...), user_pin: Optional[str] = None):
    """Searches both the global brand→parent dictionary AND the user's saved
    vouchers (Brand_Name and Parent_Company fields)."""
    ql = q.strip().lower()
    parent = lookup_parent(q)

    matches = [
        {"brand": k.title(), "parent_company": v}
        for k, v in BRAND_PARENT_MAP.items()
        if ql in k or k in ql
    ][:8]

    user_matches: list[dict] = []
    if user_pin and ql:
        cursor = db.vouchers.find(
            {
                "user_pin": user_pin,
                "$or": [
                    {"brand": {"$regex": ql, "$options": "i"}},
                    {"parent_company": {"$regex": ql, "$options": "i"}},
                ],
            }
        ).limit(10)
        async for d in cursor:
            user_matches.append(
                {
                    "id": str(d["_id"]),
                    "brand": d.get("brand"),
                    "parent_company": d.get("parent_company"),
                    "title": d.get("title"),
                    "code": d.get("code"),
                    "expiry": d.get("expiry"),
                    "category": d.get("category"),
                }
            )

    return {
        "query": q,
        "parent_company": parent,
        "matches": matches,
        "user_matches": user_matches,
    }


# -------- Family Circle --------
@api.post("/circle/members")
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

    # Best-effort invite email — never block / fail the add flow
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
                    {"$set": {"invite_email_sent": True, "invite_email_sent_at": datetime.now(timezone.utc).isoformat()}},
                )
                saved = await db.circle_members.find_one({"_id": res.inserted_id})
        except Exception:
            logging.exception("Circle invite email failed (continuing)")
    return _serialize(saved)


@api.get("/circle/members")
async def list_circle_members(user_pin: str = Query(...)):
    cursor = db.circle_members.find({"user_pin": user_pin}).sort("created_at", -1)
    return [_serialize(d) async for d in cursor]


@api.delete("/circle/members/{member_id}")
async def remove_circle_member(member_id: str):
    if not ObjectId.is_valid(member_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.circle_members.delete_one({"_id": ObjectId(member_id)})
    return {"deleted": res.deleted_count}


@api.post("/circle/share")
async def share_voucher(payload: ShareInviteCreate):
    if not ObjectId.is_valid(payload.voucher_id):
        raise HTTPException(status_code=400, detail="Invalid voucher id")
    if not ObjectId.is_valid(payload.family_member_id):
        raise HTTPException(status_code=400, detail="Invalid member id")
    # validate that the member belongs to this user
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
    return _serialize(res)


@api.post("/circle/unshare/{voucher_id}")
async def stop_sharing(
    voucher_id: str,
    user_pin: str = Query(...),
    family_member_id: Optional[str] = Query(None),
):
    """If family_member_id is provided, only that member is removed; otherwise
    sharing is fully revoked (legacy 'Stop sharing' behaviour)."""
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
    return _serialize(res)


@api.get("/vouchers/shared-with")
async def vouchers_shared_with(
    user_pin: str = Query(...),
    member_id: str = Query(...),
):
    """Family Cards view: returns vouchers from `user_pin`'s wallet whose
    `shared_with` array contains `member_id` (Where Shared_With == Current_User_ID).
    """
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
    items = [_serialize(d) async for d in cursor]
    return {
        "member": {
            "id": str(member["_id"]),
            "name": member["name"],
            "relation": member.get("relation"),
        },
        "vouchers": items,
    }


# -------- Membership status (₹99 plan, mocked Razorpay) --------
@api.get("/membership/status")
async def membership_status(user_pin: str = Query(...)):
    doc = await db.app_membership.find_one({"user_pin": user_pin})
    if not doc:
        return {"active": False, "plan": None, "expires_at": None, "referral_code": None}
    return {
        "active": doc.get("active", False),
        "plan": doc.get("plan"),
        "expires_at": doc.get("expires_at"),
        "referral_code": doc.get("referral_code"),
    }


@api.post("/membership/activate")
async def activate_membership(user_pin: str = Query(...)):
    """MOCKED Razorpay activation — issues a 3-month ₹99 plan."""
    expires = (datetime.now(timezone.utc) + timedelta(days=PLAN_BASE_DAYS)).isoformat()
    ref = f"PERK-{secrets.token_hex(3).upper()}"
    doc = {
        "user_pin": user_pin,
        "active": True,
        "plan": PLAN_LABEL,
        "expires_at": expires,
        "referral_code": ref,
        "activated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.app_membership.update_one(
        {"user_pin": user_pin}, {"$set": doc}, upsert=True
    )
    return doc


# -------- Razorpay Payments (LIVE — test mode) --------
REFERRAL_BONUS_DAYS = 90  # 3 months free for both referrer & referee
PLAN_BASE_DAYS = 92  # 3-month quarterly plan
PLAN_LABEL = "PerkWorth Pro ₹99 / 3 months"


async def _apply_referral_bonus(user_pin: str, referral_code: str) -> dict:
    """If referral_code is valid (belongs to another active member),
    extend BOTH the referrer's and referee's expiry by REFERRAL_BONUS_DAYS."""
    if not referral_code:
        return {"applied": False, "reason": "no code"}
    code = referral_code.strip().upper()
    referrer = await db.app_membership.find_one({"referral_code": code, "active": True})
    if not referrer:
        return {"applied": False, "reason": "code not found"}
    if referrer.get("user_pin") == user_pin:
        return {"applied": False, "reason": "cannot self-refer"}

    bonus = timedelta(days=REFERRAL_BONUS_DAYS).total_seconds()
    # Track redemption (idempotent — one bonus per (referrer, referee))
    existing = await db.referrals.find_one({"referrer_pin": referrer["user_pin"], "referee_pin": user_pin})
    if existing:
        return {"applied": False, "reason": "already redeemed"}

    await db.referrals.insert_one(
        {
            "referrer_pin": referrer["user_pin"],
            "referee_pin": user_pin,
            "code": code,
            "bonus_days": REFERRAL_BONUS_DAYS,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    # extend referrer's expiry
    try:
        cur_exp = datetime.fromisoformat(referrer["expires_at"])
    except Exception:
        cur_exp = datetime.now(timezone.utc)
    new_exp = (cur_exp + timedelta(days=REFERRAL_BONUS_DAYS)).isoformat()
    await db.app_membership.update_one(
        {"user_pin": referrer["user_pin"]}, {"$set": {"expires_at": new_exp}}
    )
    # drop a notification for the referrer
    await db.notifications.insert_one(
        {
            "user_pin": referrer["user_pin"],
            "kind": "referral_bonus",
            "title": f"Bonus! +{REFERRAL_BONUS_DAYS} days added",
            "body": f"A friend used your code {code}. Your membership now extends to {fmtdt_short(new_exp)}.",
            "ref_screen": "membership",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"applied": True, "bonus_days": REFERRAL_BONUS_DAYS, "referrer_pin": referrer["user_pin"]}


def fmtdt_short(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%d %b %Y")
    except Exception:
        return iso


@api.post("/payments/order")
async def create_payment_order(payload: RzpOrderRequest):
    if not _rzp_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    receipt = f"perk-{secrets.token_hex(6)}"[:40]
    try:
        order = _rzp_client.order.create(
            {
                "amount": payload.amount_inr * 100,  # paise
                "currency": "INR",
                "receipt": receipt,
                "payment_capture": 1,
                "notes": {"user_pin": payload.user_pin, "plan": "perk-worth-pro-6m"},
            }
        )
    except Exception as e:
        log.exception("Razorpay order create failed")
        raise HTTPException(status_code=502, detail=f"Razorpay order failed: {e}")
    # persist pending order
    await db.payments.insert_one(
        {
            "user_pin": payload.user_pin,
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"],
            "status": "created",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {
        "key_id": RAZORPAY_KEY_ID,
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "receipt": receipt,
    }


def _verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC-SHA256(order_id + '|' + payment_id, key_secret) compared to signature."""
    body = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@api.post("/payments/verify")
async def verify_payment(payload: RzpVerifyRequest):
    if not _rzp_client:
        raise HTTPException(status_code=503, detail="Razorpay not configured")
    if not _verify_razorpay_signature(
        payload.razorpay_order_id,
        payload.razorpay_payment_id,
        payload.razorpay_signature,
    ):
        await db.payments.update_one(
            {"order_id": payload.razorpay_order_id},
            {"$set": {"status": "signature_failed"}},
        )
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Mark order paid
    await db.payments.update_one(
        {"order_id": payload.razorpay_order_id},
        {
            "$set": {
                "status": "paid",
                "payment_id": payload.razorpay_payment_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )

    # Activate membership (3 months + optional referee bonus)
    bonus_days = 0
    referral_outcome = await _apply_referral_bonus(payload.user_pin, payload.referral_code or "")
    if referral_outcome.get("applied"):
        bonus_days = REFERRAL_BONUS_DAYS
    expires = (
        datetime.now(timezone.utc) + timedelta(days=PLAN_BASE_DAYS + bonus_days)
    ).isoformat()
    ref = f"PERK-{secrets.token_hex(3).upper()}"
    doc = {
        "user_pin": payload.user_pin,
        "active": True,
        "plan": PLAN_LABEL + (f" (+{bonus_days}d referral bonus)" if bonus_days else ""),
        "expires_at": expires,
        "referral_code": ref,
        "activated_at": datetime.now(timezone.utc).isoformat(),
        "last_payment_id": payload.razorpay_payment_id,
        "last_order_id": payload.razorpay_order_id,
        "applied_referral": payload.referral_code or None,
    }
    await db.app_membership.update_one(
        {"user_pin": payload.user_pin}, {"$set": doc}, upsert=True
    )

    # Drop a notification
    welcome_body = "Your ₹99 membership is active for 3 months. Tap to view benefits."
    if bonus_days:
        welcome_body = f"Your ₹99 membership is active for 3 months + {bonus_days} bonus days from your referral. Tap to view benefits."
    await db.notifications.insert_one(
        {
            "user_pin": payload.user_pin,
            "kind": "membership_activated",
            "title": "Welcome to PerkWorth Pro",
            "body": welcome_body,
            "ref_screen": "membership",
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {**doc, "referral": referral_outcome}


# -------- Notifications --------
# User-first expiry policy: notify ONLY at exactly 3 days and 1 day before expiry.
# Idempotent (upsert keyed by user_pin + kind + ref_voucher_id) so each voucher
# fires at most ONE "ending_soon" and ONE "urgent_expiry" — never spammy.
EXPIRY_HEADS_UP_DAYS = 3   # "Ending Soon" notification trigger
EXPIRY_URGENT_DAYS = 1     # "Urgent Expiry" notification trigger


async def _generate_dynamic_notifications(user_pin: str) -> list[dict]:
    """Compute ending-soon + ROI break-even alerts from current voucher data
    and upsert them into the notifications collection so the bell is in sync
    with reality on every fetch."""
    today = datetime.now(timezone.utc).date()
    items: list[dict] = []

    # Expiry alerts — fire at exactly 3 days and 1 day before expiry (helpful, not spammy)
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
        # Two well-spaced triggers: 3 days out (heads up) + 1 day / today (urgent)
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
        items.append(
            {
                "user_pin": user_pin,
                "kind": kind,
                "ref_voucher_id": str(v["_id"]),
                "ref_screen": "coupons",
                "title": title,
                "body": v.get("title") or v.get("code") or "Tap to view",
                "priority": 0 if kind == "urgent_expiry" else 1,
            }
        )

    # Asset memberships nearing break-even
    async for m in db.vouchers.find(
        {"user_pin": user_pin, "category": "memberships", "membership_kind": "asset"}
    ):
        fee = m.get("fee_paid") or 0
        saved = m.get("savings_realized") or 0
        if fee > 0 and saved >= fee:
            items.append(
                {
                    "user_pin": user_pin,
                    "kind": "break_even",
                    "ref_voucher_id": str(m["_id"]),
                    "ref_screen": "coupons",
                    "title": f"{m.get('brand', 'Membership')} reached break-even",
                    "body": f"You've saved ₹{int(saved)} on a ₹{int(fee)} fee — keep using.",
                    "priority": 2,
                }
            )

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
    keep_voucher_ids = [n["ref_voucher_id"] for n in items if n["kind"] in ("ending_soon", "urgent_expiry")]
    await db.notifications.delete_many(
        {
            "user_pin": user_pin,
            "kind": {"$in": ["ending_soon", "urgent_expiry"]},
            "ref_voucher_id": {"$nin": keep_voucher_ids},
        }
    )
    return items


@api.get("/notifications")
async def list_notifications(user_pin: str = Query(...)):
    await _generate_dynamic_notifications(user_pin)
    cursor = db.notifications.find({"user_pin": user_pin}).sort("created_at", -1).limit(50)
    items = []
    unread = 0
    async for d in cursor:
        d["id"] = str(d.pop("_id"))
        if not d.get("read"):
            unread += 1
        items.append(d)
    return {"items": items, "unread": unread}


# -------- Support / WhatsApp History --------
@api.post("/support/log")
async def log_support(payload: SupportLog):
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.support_history.insert_one(doc)
    return {"id": str(res.inserted_id), "logged": True}


@api.get("/support/history")
async def support_history(user_pin: str = Query(...)):
    cursor = db.support_history.find({"user_pin": user_pin}).sort("created_at", -1).limit(50)
    return [
        {**{k: v for k, v in d.items() if k != "_id"}, "id": str(d["_id"])}
        async for d in cursor
    ]


@api.post("/notifications/{notification_id}/read")
async def mark_read(notification_id: str):
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    await db.notifications.update_one(
        {"_id": ObjectId(notification_id)}, {"$set": {"read": True}}
    )
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(user_pin: str = Query(...)):
    res = await db.notifications.update_many(
        {"user_pin": user_pin, "read": False}, {"$set": {"read": True}}
    )
    return {"updated": res.modified_count}


@api.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str):
    if not ObjectId.is_valid(notification_id):
        raise HTTPException(status_code=400, detail="Invalid id")
    await db.notifications.delete_one({"_id": ObjectId(notification_id)})
    return {"ok": True}


@api.get("/referrals/preview")
async def referral_preview(code: str = Query(...)):
    """Allow the UI to validate a referral code before checkout."""
    code = code.strip().upper()
    found = await db.app_membership.find_one({"referral_code": code, "active": True})
    return {
        "valid": bool(found),
        "code": code,
        "bonus_days": REFERRAL_BONUS_DAYS,
        "message": (
            f"Valid code! You'll get +{REFERRAL_BONUS_DAYS} bonus days (3 months FREE), and your friend will also get +{REFERRAL_BONUS_DAYS} days."
            if found
            else "Invalid or inactive referral code."
        ),
    }


@api.get("/referrals/stats")
async def referral_stats(user_pin: str = Query(...)):
    count = await db.referrals.count_documents({"referrer_pin": user_pin})
    return {
        "total_referrals": count,
        "bonus_days_earned": count * REFERRAL_BONUS_DAYS,
    }


app.include_router(api)

# Auth + Market Intelligence (cloud sync + daily program-change cron)
from auth_intel import build_auth_router, build_intelligence_router, start_intelligence_cron, seed_programs, make_get_current_user
from optimizer import build_optimizer_router
from webhook_export import build_webhook_router
from cards import build_cards_router
from spend_intel import build_spend_router
from loyalty_registry import build_loyalty_router

app.include_router(build_auth_router(db))
app.include_router(build_intelligence_router(db, EMERGENT_LLM_KEY))
app.include_router(build_optimizer_router(db, EMERGENT_LLM_KEY))
app.include_router(build_webhook_router(db, make_get_current_user(db)))
app.include_router(build_cards_router(db))
app.include_router(build_spend_router(db, EMERGENT_LLM_KEY))
app.include_router(build_loyalty_router())


@app.on_event("startup")
async def _on_startup():
    # Ensure indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.vouchers.create_index([("user_pin", 1), ("category", 1)])
        await db.vouchers.create_index([("user_pin", 1), ("shared_with", 1)])
        await db.notifications.create_index([("user_pin", 1), ("created_at", -1)])
        await db.brand_programs.create_index("brand", unique=True)
    except Exception as e:
        log.warning("Index init: %s", e)
    # Seed program registry
    await seed_programs(db)
    # Schedule daily cron
    start_intelligence_cron(db, EMERGENT_LLM_KEY)


@app.get("/")
async def app_root():
    return {"service": "PerkWorth", "status": "running"}
