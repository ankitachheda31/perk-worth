"""Lightweight verification of /api/admin/dashboard/stats — admin-only, shape check.

Uses the live backend (preview URL from frontend .env), same pattern as the
existing iter18 admin registry test. Skips if admin credentials don't work.
"""
from __future__ import annotations

import os
import re
import pytest
import requests

with open("/app/frontend/.env", "r", encoding="utf-8") as f:
    _env = f.read()
m = re.search(r"REACT_APP_BACKEND_URL=(.+)", _env)
API = (m.group(1).strip() if m else "http://localhost:8001")

ADMIN_EMAIL = "test@perkorbit.app"
ADMIN_PASS = "Perk@1234"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    if r.status_code != 200:
        pytest.skip(f"Admin login unavailable ({r.status_code}); skipping.")
    body = r.json()
    if body.get("role") != "admin":
        pytest.skip("Logged-in user is not an admin; skipping.")
    return s


def test_dashboard_stats_unauthenticated_returns_401():
    r = requests.get(f"{API}/api/admin/dashboard/stats")
    assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


def test_dashboard_stats_shape(admin_session):
    r = admin_session.get(f"{API}/api/admin/dashboard/stats")
    assert r.status_code == 200, r.text
    data = r.json()

    # Top-level keys
    for k in ["generated_at", "savings", "members", "users", "vouchers", "registry"]:
        assert k in data, f"missing top-level key {k}"

    # Savings
    s = data["savings"]
    for k in ["total_saved_inr", "total_redeemed_count", "ytd_saved_inr",
              "ytd_redeemed_count", "current_year",
              "recent_saved_inr_7d", "recent_redeemed_count_7d"]:
        assert k in s, f"savings.{k} missing"
    assert isinstance(s["total_saved_inr"], (int, float))
    assert isinstance(s["total_redeemed_count"], int)
    assert s["current_year"] >= 2025

    # Members
    m = data["members"]
    for k in ["active_total", "active_not_expired", "new_in_7d"]:
        assert k in m
    assert m["active_total"] >= 0
    # Sanity: never-expired count cannot exceed total active count
    assert m["active_not_expired"] <= m["active_total"]

    # Registry
    r_ = data["registry"]
    for k in ["pending", "high_impact_pending", "approved_total"]:
        assert k in r_
    assert r_["high_impact_pending"] <= r_["pending"]

    # Users / vouchers
    assert data["users"]["total"] >= 0
    assert data["vouchers"]["total"] >= 0
    assert data["vouchers"]["redeemed"] == s["total_redeemed_count"]
