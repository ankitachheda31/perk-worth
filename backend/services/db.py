"""Shared DB + Razorpay singletons + tiny serializer helper.

Lives in `services/` so every route module can import it without circular
dependencies on `server.py`.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from typing import Optional

import razorpay
from motor.motor_asyncio import AsyncIOMotorClient

# ---- Env (fail fast if missing) ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

# ---- Mongo ----
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ---- Razorpay (test mode unless env switched to live) ----
rzp_client: Optional[razorpay.Client] = None
if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET:
    rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


def serialize(doc: dict) -> dict:
    """Replace `_id` ObjectId with `id` str — for JSON-safe responses."""
    doc["id"] = str(doc.pop("_id"))
    return doc


def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC-SHA256(order_id + '|' + payment_id, key_secret) == signature ?"""
    body = f"{order_id}|{payment_id}".encode("utf-8")
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
