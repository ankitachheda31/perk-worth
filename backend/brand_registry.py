"""Indian-market parent → child brand registry.

Loads the curated `data/brand_registry.json` once at import time and exposes:

  - lookup(brand_name) -> (parent_company, normalized_brand) | (None, None)
  - search(query, limit=10) -> list[{"brand", "parent_company", "category"}]
  - all_brands() -> full flat list (used by /api/brands/all)

Lookup is case-insensitive and tolerant to whitespace / punctuation. It first
attempts an exact alias match, then a normalized substring containment match.
This is intentionally synchronous and pure-Python (no fuzzy libs) so it stays
fast at module import time and adds zero runtime dependencies.
"""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional, Tuple, List, Dict

log = logging.getLogger("perk_orbit.brand_registry")

_REGISTRY_PATH = Path(__file__).parent / "data" / "brand_registry.json"
_PUNCT_RE = re.compile(r"[^a-z0-9]+")


def _norm(s: str) -> str:
    """Aggressive normalisation — lowercase, strip all non-alphanumerics."""
    return _PUNCT_RE.sub("", (s or "").lower())


@lru_cache(maxsize=1)
def _load_index() -> Dict:
    """Build an in-memory inverted index from the JSON file.

    Returns:
        {
          "by_norm": { normalized_str: {"brand": ..., "parent_company": ..., "category": ...} },
          "all": [ {brand, parent_company, category, aliases:[...] } ]
        }
    """
    try:
        with _REGISTRY_PATH.open("r", encoding="utf-8") as fh:
            raw = json.load(fh)
    except Exception as e:
        log.error("Could not load brand registry: %s", e)
        return {"by_norm": {}, "all": []}

    by_norm: Dict[str, Dict] = {}
    flat: List[Dict] = []
    for parent_name, parent_data in (raw.get("conglomerates") or {}).items():
        for sub in parent_data.get("subsidiaries", []):
            brand = sub.get("brand")
            if not brand:
                continue
            entry = {
                "brand": brand,
                "parent_company": parent_name,
                "category": sub.get("category"),
                "aliases": sub.get("aliases", []) or [],
            }
            flat.append(entry)
            # Index canonical brand + every alias
            for key in [brand] + entry["aliases"]:
                n = _norm(key)
                if n and n not in by_norm:
                    by_norm[n] = entry
    log.info("Brand registry loaded: %d brands across %d conglomerates",
             len(flat), len(raw.get("conglomerates") or {}))
    return {"by_norm": by_norm, "all": flat}


def lookup(brand_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Resolve a user-typed brand name to (parent_company, canonical_brand).

    Order of attempts:
      1. Exact normalised match against any registered alias.
      2. Substring containment — typed name contained in any canonical brand.
      3. Reverse — any canonical brand contained in the typed name.
    """
    if not brand_name or not brand_name.strip():
        return (None, None)
    n = _norm(brand_name)
    idx = _load_index()
    by_norm = idx["by_norm"]

    # 1) Exact alias hit
    if n in by_norm:
        e = by_norm[n]
        return (e["parent_company"], e["brand"])

    # 2/3) Substring containment — pick the longest matched canonical brand
    best: Optional[Dict] = None
    best_len = 0
    for key, entry in by_norm.items():
        if key in n or n in key:
            if len(key) > best_len:
                best, best_len = entry, len(key)
    if best:
        return (best["parent_company"], best["brand"])
    return (None, None)


def search(query: str, limit: int = 10) -> List[Dict]:
    """Front-end autocomplete helper. Returns brand entries whose canonical
    name or any alias contains the (normalised) query.

    Ranking buckets (highest priority first):
      1. EXACT alias hit (or exact canonical match)   — e.g. `bb` → BigBasket
      2. Canonical-name starts-with                    — e.g. `big` → BigBasket
      3. Canonical-name contains                       — e.g. `bb` → FBB
      4. Alias contains                                — fuzzier matches
    """
    n = _norm(query)
    if not n:
        return []
    idx = _load_index()
    exact: List[Dict] = []
    starts: List[Dict] = []
    contains: List[Dict] = []
    alias_only: List[Dict] = []
    seen = set()
    for entry in idx["all"]:
        if entry["brand"] in seen:
            continue
        brand_n = _norm(entry["brand"])
        # 1) EXACT alias OR canonical equality
        if brand_n == n or any(_norm(a) == n for a in entry["aliases"]):
            exact.append(entry); seen.add(entry["brand"]); continue
        # 2) Starts-with on canonical name
        if brand_n.startswith(n):
            starts.append(entry); seen.add(entry["brand"]); continue
        # 3) Contains on canonical name
        if n in brand_n:
            contains.append(entry); seen.add(entry["brand"]); continue
        # 4) Contains on any alias
        for a in entry["aliases"]:
            if n in _norm(a):
                alias_only.append(entry); seen.add(entry["brand"]); break
    out = (exact + starts + contains + alias_only)[:limit]
    return [{"brand": e["brand"], "parent_company": e["parent_company"], "category": e["category"]} for e in out]


def all_brands() -> List[Dict]:
    """Flat list — used for client-side autocomplete cache."""
    return [
        {"brand": e["brand"], "parent_company": e["parent_company"], "category": e["category"]}
        for e in _load_index()["all"]
    ]
