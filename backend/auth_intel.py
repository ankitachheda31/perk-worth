"""Auth + Market Intelligence module — appended to server via include_router.

Keeps server.py uncluttered while adding:
  - JWT email/password auth (cookie + Bearer)
  - PIN-binding migration ("claim my old wallet")
  - Daily market intelligence cron (APScheduler)
"""
from __future__ import annotations

import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import httpx
import jwt
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field

log = logging.getLogger("perk_orbit.auth")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24 * 30  # 30 days for convenience-grade mobile app
REFRESH_TOKEN_DAYS = 90

# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
def _jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(uid: str, email: str) -> str:
    payload = {
        "sub": uid,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    payload = {
        "sub": uid,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_TOKEN_MINUTES * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=REFRESH_TOKEN_DAYS * 86400, path="/")


# ---------------------------------------------------------------------------
# Current user dependency (factory — bound to a db instance)
# ---------------------------------------------------------------------------
def make_get_current_user(db):
    async def get_current_user(request: Request) -> dict:
        token = request.cookies.get("access_token")
        if not token:
            auth = request.headers.get("Authorization", "")
            if auth.startswith("Bearer "):
                token = auth[7:]
        if not token:
            raise HTTPException(status_code=401, detail="Not authenticated")
        try:
            payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
            if payload.get("type") != "access":
                raise HTTPException(status_code=401, detail="Invalid token type")
            user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
            user["_id"] = str(user["_id"])
            user.pop("password_hash", None)
            return user
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
    return get_current_user


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: Optional[str] = None
    phone: Optional[str] = None
    pin_to_claim: Optional[str] = None  # legacy `user_pin` to migrate into this account


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6)


# ---------------------------------------------------------------------------
# Router factory — takes the running app's db instance
# ---------------------------------------------------------------------------
def build_auth_router(db) -> APIRouter:
    router = APIRouter(prefix="/api/auth", tags=["auth"])
    get_current_user = make_get_current_user(db)

    async def _bind_legacy_pin(user_id: str, pin: str):
        """Re-key all legacy `user_pin`-scoped docs to the new authenticated user_id."""
        for coll in ("vouchers", "circle_members", "app_membership", "payments", "notifications", "referrals", "support_history"):
            try:
                await db[coll].update_many({"user_pin": pin}, {"$set": {"user_pin": user_id}})
            except Exception:
                pass
            # Also re-key referrer_pin / referee_pin in referrals
            if coll == "referrals":
                await db.referrals.update_many({"referrer_pin": pin}, {"$set": {"referrer_pin": user_id}})
                await db.referrals.update_many({"referee_pin": pin}, {"$set": {"referee_pin": user_id}})

    @router.post("/signup")
    async def signup(payload: SignupRequest, response: Response):
        email = payload.email.lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(status_code=409, detail="Email already registered")
        doc = {
            "email": email,
            "password_hash": hash_password(payload.password),
            "name": payload.name or "",
            "phone": payload.phone or "",
            "role": "user",
            "created_at": datetime.now(timezone.utc),
        }
        res = await db.users.insert_one(doc)
        uid = str(res.inserted_id)
        if payload.pin_to_claim:
            await _bind_legacy_pin(uid, payload.pin_to_claim)
        access = create_access_token(uid, email)
        refresh = create_refresh_token(uid)
        _set_auth_cookies(response, access, refresh)
        return {"id": uid, "email": email, "name": doc["name"], "phone": doc["phone"], "access_token": access}

    @router.post("/login")
    async def login(payload: LoginRequest, response: Response):
        email = payload.email.lower()
        user = await db.users.find_one({"email": email})
        if not user or not verify_password(payload.password, user.get("password_hash", "")):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        uid = str(user["_id"])
        access = create_access_token(uid, email)
        refresh = create_refresh_token(uid)
        _set_auth_cookies(response, access, refresh)
        return {
            "id": uid,
            "email": email,
            "name": user.get("name", ""),
            "phone": user.get("phone", ""),
            "role": user.get("role", "user"),
            "access_token": access,
        }

    @router.post("/logout")
    async def logout(response: Response):
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return {"ok": True}

    @router.get("/me")
    async def me(user=Depends(get_current_user)):
        return user

    @router.post("/claim-pin")
    async def claim_pin(payload: dict, user=Depends(get_current_user)):
        pin = (payload or {}).get("pin")
        if not pin or len(pin) < 4:
            raise HTTPException(status_code=400, detail="Invalid pin")
        await _bind_legacy_pin(user["_id"], pin)
        return {"ok": True, "claimed": pin}

    @router.post("/wipe")
    async def wipe_all_data(response: Response, user=Depends(get_current_user)):
        """DPDP/GDPR Article 17 — Right to erasure.
        Deletes ALL user-scoped data (vouchers, circle members, memberships,
        payments, notifications, referrals, support history) AND the user
        account itself. Irreversible. Clears auth cookies.
        """
        uid = user["_id"]
        deleted = {}
        for coll in (
            "vouchers", "circle_members", "app_membership", "payments",
            "notifications", "referrals", "support_history",
        ):
            try:
                # Account for both new (user_id) and legacy (user_pin / referrer_pin) scoping
                res = await db[coll].delete_many({
                    "$or": [{"user_pin": uid}, {"referrer_pin": uid}, {"referee_pin": uid}]
                })
                deleted[coll] = res.deleted_count
            except Exception:
                deleted[coll] = 0
        # Finally delete the user record itself
        try:
            await db.users.delete_one({"_id": ObjectId(uid)})
        except Exception:
            pass
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return {"ok": True, "deleted": deleted}

    @router.post("/forgot-password")
    async def forgot_password(payload: ForgotPasswordRequest):
        """DPDP-compliant password reset trigger.

        Always returns 200 with the same shape regardless of whether the email
        exists — this prevents account enumeration attacks. If the email DOES
        match a user, a one-time reset token (TTL 60 min) is generated and an
        email is sent via Resend.
        """
        from mailer import send_password_reset  # local import to avoid hard dep on startup

        email = payload.email.lower()
        user = await db.users.find_one({"email": email})
        if user:
            # Invalidate any prior unused tokens for this user (one active reset at a time)
            await db.password_resets.update_many(
                {"user_id": str(user["_id"]), "used": False},
                {"$set": {"used": True, "invalidated_at": datetime.now(timezone.utc)}},
            )
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=60)
            await db.password_resets.insert_one({
                "user_id": str(user["_id"]),
                "email": email,
                "token": token,
                "expires_at": expires_at,
                "used": False,
                "created_at": datetime.now(timezone.utc),
            })
            frontend = os.environ.get("FRONTEND_URL", "https://perkorbit.app").rstrip("/")
            reset_url = f"{frontend}/?reset_token={token}"
            # Best-effort send — never break the flow if Resend fails
            try:
                await send_password_reset(email, reset_url, name=user.get("name") or None)
            except Exception as e:
                log.error("Password reset email failed: %s", e)
        # Always return the same response (no enumeration)
        return {"ok": True, "message": "If an account exists for this email, a reset link has been sent."}

    @router.post("/reset-password")
    async def reset_password(payload: ResetPasswordRequest, response: Response):
        rec = await db.password_resets.find_one({"token": payload.token, "used": False})
        if not rec:
            raise HTTPException(status_code=400, detail="Invalid or already-used reset link")
        # Expiry check — handle naive datetimes from older drivers defensively
        exp = rec.get("expires_at")
        if isinstance(exp, datetime):
            exp_utc = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
            if exp_utc < datetime.now(timezone.utc):
                raise HTTPException(status_code=400, detail="Reset link expired. Please request a new one.")
        else:
            raise HTTPException(status_code=400, detail="Invalid reset link")

        user = await db.users.find_one({"_id": ObjectId(rec["user_id"])})
        if not user:
            raise HTTPException(status_code=400, detail="Account no longer exists")

        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"password_hash": hash_password(payload.new_password)}},
        )
        await db.password_resets.update_one(
            {"_id": rec["_id"]},
            {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}},
        )
        # Auto-sign in after reset for a friction-free flow
        uid = str(user["_id"])
        email = user["email"]
        access = create_access_token(uid, email)
        refresh = create_refresh_token(uid)
        _set_auth_cookies(response, access, refresh)
        return {"ok": True, "email": email, "id": uid, "access_token": access}

    return router


# ---------------------------------------------------------------------------
# Market Intelligence
# ---------------------------------------------------------------------------
# Curated, ToS-respectful sources: RSS / public press / API endpoints only.
# (Full HTML scraping of partner-only program pages is intentionally avoided.)
INTELLIGENCE_SOURCES = [
    {"name": "Cardexpert (Indian credit cards)", "url": "https://www.cardexpert.in/feed/", "kind": "rss"},
    {"name": "PaisaBazaar reward cards", "url": "https://www.paisabazaar.com/credit-card/feed/", "kind": "rss"},
    {"name": "BankBazaar reward news", "url": "https://www.bankbazaar.com/banking/feed/", "kind": "rss"},
    {"name": "LiveMint Banking", "url": "https://www.livemint.com/rss/money", "kind": "rss"},
    {"name": "Economic Times BFSI", "url": "https://bfsi.economictimes.indiatimes.com/rss/topstories", "kind": "rss"},
]

# Seed of co-branded card / loyalty programs to monitor (auto-grows via intelligence runs)
SEED_PROGRAMS = [
    {"brand": "Tata Neu HDFC Bank Plus", "parent_company": "Tata", "co_brand_bank": "HDFC", "type": "credit-card"},
    {"brand": "Tata Neu HDFC Bank Infinity", "parent_company": "Tata", "co_brand_bank": "HDFC", "type": "credit-card"},
    {"brand": "Tata Neu SBI", "parent_company": "Tata", "co_brand_bank": "SBI", "type": "credit-card"},
    {"brand": "Amazon Pay ICICI", "parent_company": "Amazon", "co_brand_bank": "ICICI", "type": "credit-card"},
    {"brand": "Flipkart Axis Bank", "parent_company": "Flipkart", "co_brand_bank": "Axis", "type": "credit-card"},
    {"brand": "Myntra Kotak", "parent_company": "Flipkart", "co_brand_bank": "Kotak", "type": "credit-card"},
    {"brand": "Swiggy HDFC", "parent_company": "Swiggy", "co_brand_bank": "HDFC", "type": "credit-card"},
    {"brand": "Reliance One", "parent_company": "Reliance", "co_brand_bank": None, "type": "retail-membership"},
    {"brand": "Croma Privileges", "parent_company": "Tata", "co_brand_bank": None, "type": "retail-membership"},
    {"brand": "Pantaloons Green Card", "parent_company": "Aditya Birla", "co_brand_bank": None, "type": "retail-membership", "term_model": "Free"},
    {"brand": "Landmark Rewards", "parent_company": "Landmark Group", "co_brand_bank": None, "type": "retail-membership"},
    {"brand": "Lifestyle The Inner Circle", "parent_company": "Landmark Group", "co_brand_bank": None, "type": "retail-membership"},
    {"brand": "Shoppers Stop First Citizen", "parent_company": "Reliance", "co_brand_bank": None, "type": "retail-membership"},
    {"brand": "Tata Neu Pro", "parent_company": "Tata", "co_brand_bank": None, "type": "app-membership", "term_model": "Annual Fee"},
    {"brand": "Amazon Prime", "parent_company": "Amazon", "co_brand_bank": None, "type": "subscription"},
    {"brand": "Netflix", "parent_company": "Netflix", "co_brand_bank": None, "type": "subscription"},
    {"brand": "Disney+ Hotstar", "parent_company": "Disney", "co_brand_bank": None, "type": "subscription"},
    {"brand": "Flipkart Plus", "parent_company": "Flipkart", "co_brand_bank": None, "type": "app-membership", "term_model": "Coins"},
    {"brand": "Myntra Insider", "parent_company": "Flipkart", "co_brand_bank": None, "type": "app-membership"},
]


async def seed_programs(db) -> None:
    for p in SEED_PROGRAMS:
        await db.brand_programs.update_one(
            {"brand": p["brand"]},
            {"$setOnInsert": {**p, "first_seen": datetime.now(timezone.utc).isoformat(), "version": 1}},
            upsert=True,
        )


async def fetch_rss(client: httpx.AsyncClient, url: str) -> str:
    try:
        r = await client.get(url, timeout=15, headers={"User-Agent": "PerkOrbit-Intelligence/1.0"})
        if r.status_code == 200:
            return r.text[:80000]
    except Exception as e:
        log.warning("Intelligence fetch failed for %s: %s", url, e)
    return ""


async def run_intelligence_once(db, emergent_llm_key: str) -> dict:
    """One pass: pull RSS feeds → ask GPT-4o to extract program changes →
    upsert into brand_programs and notify affected users."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    started = datetime.now(timezone.utc)
    digest: list[str] = []

    async with httpx.AsyncClient(follow_redirects=True) as client:
        for src in INTELLIGENCE_SOURCES:
            text = await fetch_rss(client, src["url"])
            if not text:
                continue
            digest.append(f"### Source: {src['name']}\n{text[:8000]}")

    if not digest:
        return {"ok": False, "reason": "no sources reachable"}

    chat = LlmChat(
        api_key=emergent_llm_key,
        session_id=f"intel-{secrets.token_hex(4)}",
        system_message=(
            "You are a market intelligence analyst for an Indian rewards-tracker app. "
            "Read the news/RSS digests below and return STRICT JSON of program/co-branded-card updates relevant to Indian loyalty: "
            '{"changes": [{"brand": str, "parent_company": str|null, "type": "credit-card|retail-membership|app-membership|subscription", '
            '"co_brand_bank": str|null, "change_summary": str, "term_model": str|null}]}. '
            "Only include items with concrete information (new launch, fee change, T&C update). "
            "Skip rumour/opinion. Max 12 items."
        ),
    ).with_model("openai", "gpt-4o")

    payload = "\n\n".join(digest)[:60000]
    try:
        response = await chat.send_message(UserMessage(text=payload))
    except Exception as e:
        log.exception("Intelligence LLM failed")
        return {"ok": False, "reason": str(e)}

    import json, re
    raw = response if isinstance(response, str) else str(response)
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(raw)
    except Exception:
        m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        data = json.loads(m.group(0)) if m else {"changes": []}

    applied: list[str] = []
    notified: list[str] = []
    for change in (data.get("changes") or [])[:20]:
        brand = (change.get("brand") or "").strip()
        if not brand:
            continue
        existing = await db.brand_programs.find_one({"brand": brand})
        if existing:
            # Detect material change
            old_term = existing.get("term_model")
            new_term = change.get("term_model")
            if new_term and new_term != old_term:
                await db.brand_programs.update_one(
                    {"brand": brand},
                    {"$set": {
                        "term_model": new_term,
                        "previous_term_model": old_term,
                        "last_change_at": datetime.now(timezone.utc).isoformat(),
                        "last_change_summary": change.get("change_summary"),
                    }, "$inc": {"version": 1}},
                )
                applied.append(f"{brand} term_model: {old_term} → {new_term}")
                # Notify any user who has this brand saved as a membership
                async for v in db.vouchers.find({"category": "memberships", "brand": brand}):
                    await db.notifications.insert_one({
                        "user_pin": v["user_pin"],
                        "kind": "terms_changed",
                        "ref_voucher_id": str(v["_id"]),
                        "ref_screen": "coupons",
                        "title": f"⚠️ {brand} terms changed",
                        "body": f"Membership model: {old_term or 'previous'} → {new_term}. {change.get('change_summary','Tap to review.')}",
                        "priority": 1,
                        "read": False,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                    notified.append(v["user_pin"])
        else:
            await db.brand_programs.insert_one({
                **change,
                "brand": brand,
                "first_seen": datetime.now(timezone.utc).isoformat(),
                "version": 1,
                "auto_discovered": True,
            })
            applied.append(f"new: {brand}")

    return {
        "ok": True,
        "ran_at": started.isoformat(),
        "took_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
        "applied": applied,
        "users_notified": len(set(notified)),
    }


def build_intelligence_router(db, emergent_llm_key: str) -> APIRouter:
    router = APIRouter(prefix="/api/intelligence", tags=["intelligence"])

    @router.post("/run-now")
    async def run_now():
        return await run_intelligence_once(db, emergent_llm_key)

    @router.get("/programs")
    async def list_programs(limit: int = 100):
        cursor = db.brand_programs.find({}).sort("first_seen", -1).limit(limit)
        out = []
        async for d in cursor:
            d["id"] = str(d.pop("_id"))
            out.append(d)
        return out

    return router


# ---------------------------------------------------------------------------
# Scheduler bootstrap (called from server.py startup)
# ---------------------------------------------------------------------------
_scheduler: Optional[AsyncIOScheduler] = None


def start_intelligence_cron(db, emergent_llm_key: str):
    global _scheduler
    if os.environ.get("ENABLE_INTELLIGENCE_CRON", "0") != "1":
        log.info("Intelligence cron disabled (ENABLE_INTELLIGENCE_CRON=0)")
        return
    if _scheduler:
        return
    _scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")

    async def job():
        try:
            await seed_programs(db)
            result = await run_intelligence_once(db, emergent_llm_key)
            log.info("Intelligence cron: %s", result)
        except Exception:
            log.exception("Intelligence cron error")

    # Run daily at 03:30 IST
    _scheduler.add_job(job, "cron", hour=3, minute=30, id="market-intelligence")
    _scheduler.start()
    log.info("Intelligence cron scheduled (daily 03:30 IST)")
