"""PerkWorth FastAPI backend — slim entrypoint.

All business logic now lives under:
- `services/`  — shared infrastructure (DB, LLM, billing helpers, notif logic)
- `routes/`    — feature-scoped APIRouter modules
- `models.py`  — Pydantic schemas

This file only:
1. Loads env, builds the FastAPI app + CORS middleware.
2. Wires together every router (auth, vouchers, extraction, circle, billing,
   notifications, optimizer, webhook export, cards, spend, loyalty, admin,
   market-intelligence).
3. Handles startup: index creation, program seeding, cron schedulers.
"""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("perk_orbit")

from services.db import EMERGENT_LLM_KEY, db  # noqa: E402
from services.rate_limit import limiter  # noqa: E402

# ---------------------------------------------------------------------------
# FastAPI App
# ---------------------------------------------------------------------------
app = FastAPI(title="PerkWorth API", version="2.0")

# Rate limiter (slowapi) — LAUNCH_CHECKLIST §5.6
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core health/root endpoints
_core = APIRouter(prefix="/api")


@_core.get("/")
async def root():
    return {"app": "PerkWorth", "status": "ok"}


@_core.get("/health")
async def health():
    try:
        await db.command("ping")
        return {"status": "ok", "db": "up"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}


app.include_router(_core)


# ---------------------------------------------------------------------------
# Feature routers
# ---------------------------------------------------------------------------
from routes.vouchers import build_vouchers_router  # noqa: E402
from routes.extraction import build_extraction_router  # noqa: E402
from routes.circle import build_circle_router  # noqa: E402
from routes.billing import build_billing_router  # noqa: E402
from routes.notifications import build_notifications_router  # noqa: E402
from routes.whatsapp_webhook import build_whatsapp_webhook_router  # noqa: E402

app.include_router(build_vouchers_router(db))
app.include_router(build_extraction_router())
app.include_router(build_circle_router(db))
app.include_router(build_billing_router(db))
app.include_router(build_notifications_router(db))
app.include_router(build_whatsapp_webhook_router(db))


# Auth + Market Intelligence (cloud sync + daily program-change cron)
from auth_intel import (  # noqa: E402
    build_auth_router,
    build_intelligence_router,
    make_get_current_user,
    seed_programs,
    start_intelligence_cron,
)
from optimizer import build_optimizer_router  # noqa: E402
from webhook_export import build_webhook_router  # noqa: E402
from cards import build_cards_router  # noqa: E402
from spend_intel import build_spend_router  # noqa: E402
from loyalty_registry import build_loyalty_router  # noqa: E402
from registry_service import ensure_admins, start_registry_intel_cron  # noqa: E402
from admin_routes import build_admin_router  # noqa: E402
from routes.admin_dashboard import build_admin_dashboard_router  # noqa: E402

app.include_router(build_auth_router(db))
app.include_router(build_intelligence_router(db, EMERGENT_LLM_KEY))
app.include_router(build_optimizer_router(db, EMERGENT_LLM_KEY))
app.include_router(build_webhook_router(db, make_get_current_user(db)))
app.include_router(build_cards_router(db))
app.include_router(build_spend_router(db, EMERGENT_LLM_KEY))
app.include_router(build_loyalty_router(db))
app.include_router(build_admin_router(db, EMERGENT_LLM_KEY, make_get_current_user(db)))
app.include_router(build_admin_dashboard_router(db, make_get_current_user(db)))


@app.on_event("startup")
async def _on_startup():
    # Ensure indexes
    try:
        await db.users.create_index("email", unique=True)
        await db.vouchers.create_index([("user_pin", 1), ("category", 1)])
        await db.vouchers.create_index([("user_pin", 1), ("shared_with", 1)])
        await db.notifications.create_index([("user_pin", 1), ("created_at", -1)])
        # Compound index for forgot-password cooldown lookup (iter 25 flood fix)
        await db.password_resets.create_index([("email", 1), ("created_at", -1)])
        await db.brand_programs.create_index("brand", unique=True)
    except Exception as e:
        log.warning("Index init: %s", e)
    # Seed program registry
    await seed_programs(db)
    # Promote configured owner emails to role=admin
    await ensure_admins(db)
    # Schedule the daily Market Intelligence cron
    start_intelligence_cron(db, EMERGENT_LLM_KEY)
    # Schedule the Registry Intelligence cron (Mon/Wed/Fri 04:00 IST)
    start_registry_intel_cron(db, EMERGENT_LLM_KEY)
    # Indexes for the registry-intel collections
    try:
        await db.registry_pending.create_index(
            [("status", 1), ("high_impact", -1), ("detected_at", -1)]
        )
        await db.registry_pending.create_index("source_url")
        await db.registry_overlay.create_index("brand")
        await db.registry_changelog.create_index([("at", -1)])
    except Exception as e:
        log.warning("Registry index init: %s", e)


@app.get("/")
async def app_root():
    return {"service": "PerkWorth", "status": "running"}
