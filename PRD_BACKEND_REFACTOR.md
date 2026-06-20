# Backend Refactor — server.py → routes/ models/ services/

**Priority**: P1 (pure infrastructure; zero user-visible change)
**Estimated effort**: 4-6 hours in one focused session
**Status**: Not started. This doc is the spec for the next refactor session.

---

## 1. WHY

`/app/backend/server.py` is now **1,400+ lines** in a single file:
- Mixes 13 Pydantic models, 36 endpoints, helper functions, integrations
- Merge conflicts will multiply once a second developer joins
- Hard to write isolated pytest fixtures
- Cold-start times growing with each feature

---

## 2. TARGET STRUCTURE

```
/app/backend/
├── server.py                   # ENTRY POINT (~60 lines): FastAPI app, mounts router
├── core/
│   ├── __init__.py
│   ├── config.py               # env loaders, constants
│   ├── db.py                   # Mongo client, collections
│   ├── deps.py                 # FastAPI dependencies (get_current_user, etc.)
│   ├── base_document.py        # PyObjectId, BaseDocument, _serialize
│   └── security.py             # JWT encode/decode, bcrypt, AES helpers
├── models/
│   ├── __init__.py
│   ├── user.py                 # User + auth models
│   ├── voucher.py              # Voucher, VoucherCreate, VoucherUpdate
│   ├── circle.py               # FamilyCircleMember + share models
│   ├── membership.py           # AppMembership, Payment
│   ├── notification.py
│   └── support.py
├── routes/
│   ├── __init__.py             # mounts all sub-routers
│   ├── auth.py                 # /api/auth/*
│   ├── vouchers.py             # /api/vouchers/* (incl. redeem, history, stats)
│   ├── brands.py               # /api/brands/*, /api/search/brand
│   ├── points.py               # /api/points/summary
│   ├── memberships.py          # /api/memberships/*
│   ├── extraction.py           # /api/extract/* (OCR, SMS, voice)
│   ├── circle.py               # /api/circle/*
│   ├── membership.py           # /api/membership/* (subscription)
│   ├── payments.py             # /api/payments/*
│   ├── notifications.py        # /api/notifications/*
│   ├── support.py              # /api/support/*
│   ├── referrals.py            # /api/referrals/*
│   ├── tips.py                 # /api/tips, /api/intel/*
│   └── system.py               # /api/health, /api/user/export
├── services/
│   ├── __init__.py
│   ├── llm_ocr.py              # GPT-4o image parser
│   ├── llm_sms.py              # GPT-4o SMS parser
│   ├── llm_voice.py            # Whisper + GPT-4o voice parser
│   ├── brand_registry.py       # (already exists, move here)
│   ├── roi_calculator.py       # membership ROI math
│   ├── optimizer.py            # (already exists, move here)
│   ├── auth_intel.py           # (already exists, move here)
│   ├── webhook_export.py       # (already exists, move here)
│   └── mailer.py               # (already exists, move here)
└── tests/
    └── (existing structure preserved; tests now import from new paths)
```

---

## 3. EXECUTION ORDER (each step is a separate commit)

### Phase 1: Foundation (~30 min)
1. Create `core/` package — extract `PyObjectId`, `BaseDocument`, `_serialize`, JWT helpers
2. Create `models/` package — move all Pydantic classes
3. Update server.py to import from new locations — backend should still boot
4. Run health_check.py — should pass 14/14

### Phase 2: Route migration (~3 hrs)
For each route group (auth, vouchers, brands, etc.):
1. Create `routes/<group>.py` with own APIRouter
2. Move endpoints from server.py into the new file
3. Add `router.include_router(<group>.router)` in `routes/__init__.py`
4. Delete the moved endpoints from server.py
5. Run health_check.py + relevant pytest

Recommended order (least risky first):
- `system.py` (health) — smallest, no deps
- `notifications.py` — independent
- `support.py` — independent
- `referrals.py` — independent
- `points.py` — small
- `brands.py` — independent
- `auth.py` — touches User model
- `vouchers.py` — biggest; do last
- `memberships.py`, `payments.py`, `circle.py`, `extraction.py`, `tips.py`

### Phase 3: Services (~1 hr)
Move LLM integrations, ROI math, mailer into `services/`. Routes import from services, not the other way around.

### Phase 4: Cleanup (~30 min)
- Delete dead code in server.py — should now be ~60 lines (FastAPI init + middleware + router mount)
- Update `/app/scripts/health_check.py` if any endpoints moved (they shouldn't have changed URLs)
- Update README

---

## 4. INVARIANTS DURING REFACTOR

- ❌ **No URL changes** — `/api/vouchers/{id}/redeem` must still work at the same URL
- ❌ **No model field changes** — Pydantic shapes stay identical
- ❌ **No DB schema changes** — `db.vouchers` still queries the same collection
- ❌ **No env var changes**
- ✅ All existing pytest must still pass
- ✅ Health check must still report 14/14 after each phase

---

## 5. RISKS

| Risk | Mitigation |
|---|---|
| Circular imports between models | Use `__future__.annotations` + `TYPE_CHECKING` guards |
| Mongo collection access pattern | All collections via `core.db.get_db()` singleton |
| FastAPI dependency injection breaks | Test each route group's auth dep manually after migration |
| Frontend `lib/api.js` URLs no longer match | They won't — URLs are preserved (invariant above) |

---

## 6. WHEN TO DO THIS

**Do it BEFORE**:
- Adding 5+ more endpoints (Credit Card Optimizer alone will add 8-10)
- Hiring a 2nd backend dev
- Building daily ETL pipeline (will add scheduler module)

**Don't do it WHILE**:
- Mid-feature (finish Biometric Auth first)
- During Razorpay KYC review (avoid any backend behavior change risk until they approve)

---

**Recommended schedule**: After Biometric Auth ships and Razorpay KYC is approved (~2 weeks from now), spend 1 dedicated session here.
