"""Tests for brand registry, voucher auto-tagging, and membership ROI.

Iteration 8 — PerkWorth voucher wallet:
  - /api/brands/lookup, /api/brands/all
  - POST /api/vouchers auto-populates parent_company from brand registry
  - /api/memberships/roi extended fields: days_total, days_remaining,
    days_elapsed_pct, cost_per_day, expired, expiring_soon
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests


def _load_backend_url() -> str:
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fall back to frontend/.env (CI / pytest envs)
    try:
        with open("/app/frontend/.env", "r") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

TEST_EMAIL = "test@perkworth.com"
TEST_PASSWORD = "Perk@1234"
PIN = "1234"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def client() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


# ---------- /api/brands/lookup ----------
class TestBrandLookup:
    def test_lookup_bigbasket_resolves_to_tata(self, client):
        r = client.get(f"{API}/brands/lookup", params={"q": "BigBasket"})
        assert r.status_code == 200
        body = r.json()
        assert "results" in body
        assert len(body["results"]) >= 1
        first = body["results"][0]
        assert first["brand"] == "BigBasket"
        assert first["parent_company"] == "Tata Group"
        assert first["category"] == "grocery"

    def test_lookup_alias_with_space_resolves(self, client):
        r = client.get(f"{API}/brands/lookup", params={"q": "big basket"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) >= 1
        assert body["results"][0]["brand"] == "BigBasket"
        assert body["results"][0]["parent_company"] == "Tata Group"

    def test_lookup_short_alias_bb(self, client):
        r = client.get(f"{API}/brands/lookup", params={"q": "bb"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) >= 1
        # "bb" is a registered alias of BigBasket. The endpoint should rank
        # alias-exact matches above substring matches like "FBB".
        top = body["results"][0]
        brands = [r["brand"] for r in body["results"]]
        assert "BigBasket" in brands, f"BigBasket missing from results: {brands}"
        # Strict spec check: top result should be BigBasket
        assert top["brand"] == "BigBasket", (
            f"Ranking bug: 'bb' alias should resolve to BigBasket first, got '{top['brand']}'. "
            f"All results: {brands}"
        )
        assert top["parent_company"] == "Tata Group"

    @pytest.mark.parametrize("q,brand,parent", [
        ("Ajio", "Ajio", "Reliance Industries"),
        ("Pantaloons", "Pantaloons", "Aditya Birla Group"),
        ("Sunfeast", "Sunfeast", "ITC Limited"),
        ("Club Mahindra", "Club Mahindra", "Mahindra Group"),
        ("Bajaj Finserv", "Bajaj Finserv", "Bajaj Group"),
    ])
    def test_lookup_cross_conglomerate(self, client, q, brand, parent):
        r = client.get(f"{API}/brands/lookup", params={"q": q})
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["results"]) >= 1, f"No results for {q}"
        top = body["results"][0]
        assert top["brand"] == brand, f"{q} -> got {top['brand']}, expected {brand}"
        assert top["parent_company"] == parent

    def test_lookup_empty_query_safe(self, client):
        r = client.get(f"{API}/brands/lookup", params={"q": ""})
        assert r.status_code in (200, 400, 422)
        if r.status_code == 200:
            assert r.json().get("results") == []


# ---------- /api/brands/all ----------
class TestBrandsAll:
    def test_all_brands_returns_flat_list(self, client):
        r = client.get(f"{API}/brands/all")
        assert r.status_code == 200
        body = r.json()
        # accept either a top-level list or {brands: [...]}
        arr = body if isinstance(body, list) else body.get("brands") or body.get("results")
        assert isinstance(arr, list), f"unexpected shape: {type(body)} -> {body!r}"
        assert len(arr) >= 190, f"Expected ~190+ brands, got {len(arr)}"
        # spot-check shape
        sample = arr[0]
        assert "brand" in sample and "parent_company" in sample


# ---------- POST /api/vouchers — auto-tag parent_company ----------
class TestVoucherAutoTag:
    def test_create_voucher_auto_populates_parent(self, client):
        payload = {
            "user_pin": PIN,
            "brand": "BigBasket",
            "title": "TEST BigBasket gift card",
            "code": f"TEST-{uuid.uuid4().hex[:8]}",
            "value": 500,
            "expiry": (datetime.utcnow() + timedelta(days=60)).strftime("%Y-%m-%d"),
            "category": "vouchers",
        }
        r = client.post(f"{API}/vouchers", json=payload)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc.get("brand") == "BigBasket"
        assert doc.get("parent_company") == "Tata Group", (
            f"parent_company not auto-tagged: {doc}"
        )
        # cleanup
        vid = doc.get("id") or doc.get("_id")
        if vid:
            client.delete(f"{API}/vouchers/{vid}")


# ---------- /api/memberships/roi extended fields ----------
class TestMembershipROI:
    """Memberships ROI math: days_total, days_remaining, cost_per_day, flags."""

    def _create_membership(self, client, start_date: str, expiry: str, fee: float = 1499):
        brand = f"TEST-Membership-{uuid.uuid4().hex[:6]}"
        payload = {
            "user_pin": PIN,
            "brand": brand,
            "title": f"TEST {brand}",
            "category": "memberships",
            "membership_kind": "asset",
            "start_date": start_date,
            "expiry": expiry,
            "fee_paid": fee,
            "value": fee,
        }
        r = client.post(f"{API}/vouchers", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def _find_in_roi(self, roi_payload, brand_name):
        """Find this membership in the ROI response."""
        items = roi_payload if isinstance(roi_payload, list) else (
            roi_payload.get("memberships") or roi_payload.get("items") or roi_payload.get("results") or []
        )
        for it in items:
            if it.get("brand") == brand_name:
                return it
        return None

    def test_active_membership_roi_fields(self, client):
        start = "2026-01-01"
        end = "2026-12-31"
        m = self._create_membership(client, start, end, 1499)
        try:
            r = client.get(f"{API}/memberships/roi", params={"user_pin": PIN})
            assert r.status_code == 200, r.text
            row = self._find_in_roi(r.json(), m["brand"])
            assert row is not None, f"Membership not present in ROI payload: {r.json()}"
            assert row.get("days_total") == 364, f"days_total: {row.get('days_total')}"
            dr = row.get("days_remaining")
            assert isinstance(dr, int) and 0 <= dr <= 364
            pct = row.get("days_elapsed_pct")
            assert isinstance(pct, (int, float)) and 0 <= pct <= 100
            cpd = row.get("cost_per_day")
            assert isinstance(cpd, (int, float))
            assert abs(cpd - (1499 / 364)) < 0.5, f"cost_per_day={cpd}"
            assert row.get("expired") is False
            # existing fields preserved
            for f in ("roi_progress", "break_even", "renewal_recommended"):
                assert f in row, f"missing legacy ROI field: {f}"
        finally:
            vid = m.get("id") or m.get("_id")
            if vid:
                client.delete(f"{API}/vouchers/{vid}")

    def test_expired_membership_flagged(self, client):
        m = self._create_membership(client, "2025-01-01", "2025-12-31", 999)
        try:
            r = client.get(f"{API}/memberships/roi", params={"user_pin": PIN})
            assert r.status_code == 200
            row = self._find_in_roi(r.json(), m["brand"])
            assert row is not None
            assert row.get("expired") is True
            assert row.get("days_remaining") == 0
        finally:
            vid = m.get("id") or m.get("_id")
            if vid:
                client.delete(f"{API}/vouchers/{vid}")

    def test_expiring_soon_membership_flagged(self, client):
        today = datetime.now(timezone.utc).date()
        start = (today - timedelta(days=355)).isoformat()
        end = (today + timedelta(days=5)).isoformat()
        m = self._create_membership(client, start, end, 1200)
        try:
            r = client.get(f"{API}/memberships/roi", params={"user_pin": PIN})
            assert r.status_code == 200
            row = self._find_in_roi(r.json(), m["brand"])
            assert row is not None
            assert row.get("expiring_soon") is True, f"expecting expiring_soon=true, got: {row}"
            assert 1 <= row.get("days_remaining") <= 7
            assert row.get("expired") is False
        finally:
            vid = m.get("id") or m.get("_id")
            if vid:
                client.delete(f"{API}/vouchers/{vid}")


# ---------- Regression ----------
class TestRegression:
    def test_voucher_creation_without_dates(self, client):
        payload = {
            "user_pin": PIN,
            "brand": "Independent-Test",
            "title": "TEST regression",
            "code": f"REG-{uuid.uuid4().hex[:8]}",
            "value": 100,
            "expiry": (datetime.utcnow() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "category": "vouchers",
        }
        r = client.post(f"{API}/vouchers", json=payload)
        assert r.status_code in (200, 201), r.text
        vid = r.json().get("id") or r.json().get("_id")
        if vid:
            client.delete(f"{API}/vouchers/{vid}")

    def test_points_summary_shape_unchanged(self, client):
        r = client.get(f"{API}/points/summary", params={"user_pin": PIN})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)

    def test_roi_handles_old_records_without_start_date(self, client):
        # endpoint must not crash even when older docs lack start_date
        r = client.get(f"{API}/memberships/roi", params={"user_pin": PIN})
        assert r.status_code == 200, r.text
