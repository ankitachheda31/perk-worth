"""PerkWorth — Loyalty / Membership / Rewards classifier.

Reads `/app/backend/data/loyalty_programs.json` (curated registry of 100+ Indian
loyalty programs across airlines, hotels, fuel, retail, ecommerce, banking,
OTT, telecom, food/QSR, fitness, healthcare, news, education, automotive,
insurance, lounge, beauty) and exposes a classifier endpoint so the Add Voucher
sheet can auto-detect what KIND of program the user is adding and switch the
form to the right field labels.

Endpoint:
  GET /api/loyalty/classify?brand=indigo   →  matches by alias / case-insensitive
                                              returns program type + field label
                                              + parent + suggested membership_kind
  GET /api/loyalty/programs                →  full registry (cacheable on client)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

from fastapi import APIRouter, Query

log = logging.getLogger("perk_orbit.loyalty")

_REGISTRY_PATH = os.path.join(os.path.dirname(__file__), "data", "loyalty_programs.json")
_registry: dict = {}
_alias_index: dict[str, dict] = {}


def _load() -> dict:
    global _registry, _alias_index
    if _registry:
        return _registry
    try:
        with open(_REGISTRY_PATH, "r", encoding="utf-8") as f:
            _registry = json.load(f)
    except Exception as e:
        log.warning("loyalty registry load failed: %s", e)
        _registry = {"programs": [], "field_labels": {}}

    # Build a lower-cased alias → program lookup table (O(1) classify)
    _alias_index = {}
    for p in _registry.get("programs", []):
        for key in [p.get("brand", "")] + list(p.get("aliases", [])):
            key_l = key.strip().lower()
            if key_l:
                _alias_index[key_l] = p
    return _registry


def classify(brand: str) -> Optional[dict]:
    """Look up a brand (or alias) and return the loyalty program metadata.
    Match is exact-or-substring on aliases — substring match only if the brand
    string is at least 3 chars (avoids 'a' matching everything)."""
    if not brand:
        return None
    _load()
    needle = brand.strip().lower()
    if not needle:
        return None
    # Exact alias match first (highest precision)
    if needle in _alias_index:
        return _alias_index[needle]
    # Substring fallback for partial typing — only when 3+ chars
    if len(needle) >= 3:
        for key, program in _alias_index.items():
            if needle in key or key in needle:
                return program
    return None


def build_loyalty_router() -> APIRouter:
    router = APIRouter(prefix="/api/loyalty", tags=["loyalty"])

    @router.get("/programs")
    async def list_programs():
        reg = _load()
        return {
            "version": reg.get("version"),
            "field_labels": reg.get("field_labels", {}),
            "programs": reg.get("programs", []),
            "count": len(reg.get("programs", [])),
        }

    @router.get("/classify")
    async def classify_brand(brand: str = Query(..., min_length=1, max_length=80)):
        reg = _load()
        match = classify(brand)
        if not match:
            return {
                "matched": False,
                "brand": brand,
                "field_label": reg.get("field_labels", {}).get("generic"),
            }
        program_type = match.get("type", "generic")
        field_label = reg.get("field_labels", {}).get(program_type) or reg.get("field_labels", {}).get("generic")
        return {
            "matched": True,
            "brand": match.get("brand"),
            "program": match.get("program"),
            "type": program_type,
            "parent_company": match.get("parent_company"),
            "membership_kind": match.get("kind"),  # asset | content
            "category": "memberships",  # all classified loyalty programs are memberships
            "id_hint": match.get("id_hint"),
            "earn_burn": match.get("earn_burn"),
            "aliases": match.get("aliases", []),
            "field_label": field_label,
        }

    return router
