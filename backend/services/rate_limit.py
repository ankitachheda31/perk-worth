"""Shared slowapi Limiter — imported by both server.py (to register the exception
handler) and auth_intel.py (to decorate individual endpoints).

Keeping this in its own module avoids circular imports between server.py and
routes.

LAUNCH_CHECKLIST §5.6 · Razorpay KYC security questionnaire compliance.

Rate limiting can be disabled by setting `DISABLE_RATE_LIMIT=1` in the
environment — used in the dev/preview container so the automated pytest
suite (which hits the live backend via REACT_APP_BACKEND_URL) doesn't hit
5/minute caps. Production must NOT set this flag.
"""
from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# Sensible defaults for a personal-finance app.
# Auth endpoints (login/signup/reset) explicitly override to 5/min.
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],
    headers_enabled=True,  # emit X-RateLimit-* headers for client backoff
    enabled=os.environ.get("DISABLE_RATE_LIMIT", "0") != "1",
)
