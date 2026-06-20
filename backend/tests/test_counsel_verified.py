"""Regression: every compliance page must carry a counsel verification badge
that is not older than 180 days. Catches stale legal copy before launch QA.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from pathlib import Path

import pytest

PAGES = [
    "/app/frontend/public/privacy.html",
    "/app/frontend/public/terms.html",
    "/app/frontend/public/refund.html",
    "/app/frontend/public/privacy-hi.html",
]
MAX_AGE_DAYS = 180


@pytest.mark.parametrize("path", PAGES)
def test_counsel_verified_badge_present_and_fresh(path):
    html = Path(path).read_text(encoding="utf-8")
    m = re.search(r'data-counsel-verified="(\d{4}-\d{2}-\d{2})"', html)
    assert m, f"{path}: missing data-counsel-verified=YYYY-MM-DD attribute"
    verified = datetime.strptime(m.group(1), "%Y-%m-%d").date()
    age = (date.today() - verified).days
    assert age <= MAX_AGE_DAYS, (
        f"{path}: counsel verification is {age} days old "
        f"(>{MAX_AGE_DAYS} day limit). Re-review and bump the badge."
    )
