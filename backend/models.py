"""PerkWorth — shared Pydantic models + BaseDocument helper.

Single source of truth for request/response shapes used across all route modules.
Keeps server.py + routes_*.py free of model definitions so no circular imports.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, List, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------------------
# PyObjectId helper
# ---------------------------------------------------------------------------
def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str) and ObjectId.is_valid(v):
        return v
    raise ValueError("Invalid ObjectId")


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True)

    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    @classmethod
    def from_mongo(cls, doc: dict | None):
        if not doc:
            return None
        return cls(**doc)

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        if "_id" in data and data["_id"] is not None:
            data["_id"] = ObjectId(data["_id"])
        else:
            data.pop("_id", None)
        return data


# ---------------------------------------------------------------------------
# Voucher models
# ---------------------------------------------------------------------------
class Voucher(BaseDocument):
    user_pin: str = Field(..., description="PIN hash / user identifier")
    type: str = Field(..., description="voucher | membership")
    brand: str
    parent_company: Optional[str] = None
    title: str
    code: Optional[str] = None
    value: Optional[float] = None
    value_currency: str = "INR"
    points: Optional[int] = None
    expiry: Optional[str] = None  # ISO date YYYY-MM-DD
    start_date: Optional[str] = None  # ISO date — membership start, used for ROI math
    category: str = "vouchers"  # vouchers | memberships
    membership_kind: Optional[str] = None  # asset | content
    fee_paid: Optional[float] = None  # for asset memberships
    benefit_rate: Optional[float] = None  # 0..1 decimal — e.g. 0.10 = 10% discount
    total_spend: Optional[float] = 0.0    # cumulative ₹ spent under this membership
    savings_realized: Optional[float] = 0.0
    how_to_redeem: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = "Self"
    status: Optional[str] = "active"  # active | redeemed | expired
    redeemed_at: Optional[str] = None  # ISO timestamp when marked redeemed
    membership_number: Optional[str] = None  # for memberships: FF#, loyalty id, fuel card, etc.
    program_type: Optional[str] = None  # airline | hotel | fuel | retail | ecommerce | banking_rewards | ott | music | telecom | cab_mobility | ota_travel | food_qsr | fitness | healthcare | news | education | automotive | insurance | beauty | lounge | generic
    shared_with: List[str] = Field(default_factory=list)
    is_sharing: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class VoucherCreate(BaseModel):
    user_pin: str
    type: str = "voucher"
    brand: str
    parent_company: Optional[str] = None
    title: str
    code: Optional[str] = None
    value: Optional[float] = None
    points: Optional[int] = None
    expiry: Optional[str] = None
    start_date: Optional[str] = None
    category: str = "vouchers"
    membership_kind: Optional[str] = None
    fee_paid: Optional[float] = None
    benefit_rate: Optional[float] = None
    total_spend: Optional[float] = 0.0
    savings_realized: Optional[float] = 0.0
    how_to_redeem: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = "Self"
    membership_number: Optional[str] = None
    program_type: Optional[str] = None


class VoucherUpdate(BaseModel):
    brand: Optional[str] = None
    parent_company: Optional[str] = None
    title: Optional[str] = None
    code: Optional[str] = None
    value: Optional[float] = None
    points: Optional[int] = None
    expiry: Optional[str] = None
    start_date: Optional[str] = None
    category: Optional[str] = None
    membership_kind: Optional[str] = None
    fee_paid: Optional[float] = None
    benefit_rate: Optional[float] = None
    total_spend: Optional[float] = None
    savings_realized: Optional[float] = None
    how_to_redeem: Optional[str] = None
    notes: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[str] = None
    redeemed_at: Optional[str] = None
    membership_number: Optional[str] = None
    program_type: Optional[str] = None
    is_sharing: Optional[bool] = None
    shared_with: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# Extraction inputs
# ---------------------------------------------------------------------------
class OCRTextInput(BaseModel):
    text: str
    user_pin: Optional[str] = None


class OCRImageBase64Input(BaseModel):
    image_base64: str
    user_pin: Optional[str] = None


# ---------------------------------------------------------------------------
# Family Circle
# ---------------------------------------------------------------------------
class ShareInviteCreate(BaseModel):
    user_pin: str
    voucher_id: str
    family_member_id: str  # ID of the circle member from /api/circle/members


class FamilyCircleMember(BaseDocument):
    user_pin: str
    name: str
    relation: Optional[str] = None
    invite_token: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class FamilyCircleAdd(BaseModel):
    user_pin: str
    name: str
    relation: Optional[str] = None
    email: Optional[EmailStr] = None
    inviter_name: Optional[str] = None


# ---------------------------------------------------------------------------
# Membership ROI
# ---------------------------------------------------------------------------
class LogSpendBody(BaseModel):
    user_pin: str
    amount: float = Field(..., gt=0)  # ₹ spent on this purchase
    note: Optional[str] = None


# ---------------------------------------------------------------------------
# Payments (Razorpay)
# ---------------------------------------------------------------------------
class RzpOrderRequest(BaseModel):
    user_pin: str
    amount_inr: int = 99  # rupees; converted to paise
    referral_code: Optional[str] = None  # apply a friend's code for bonus


class RzpVerifyRequest(BaseModel):
    user_pin: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    referral_code: Optional[str] = None


# ---------------------------------------------------------------------------
# Support
# ---------------------------------------------------------------------------
class SupportLog(BaseModel):
    user_pin: str
    voucher_id: Optional[str] = None
    brand: Optional[str] = None
    title: Optional[str] = None
    code: Optional[str] = None
    issue: str = "code-not-working"
    channel: str = "whatsapp"
