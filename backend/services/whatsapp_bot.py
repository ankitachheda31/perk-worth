"""WhatsApp inbound-bot decision engine.

Hybrid: keyword FAQ first (zero LLM cost), then GPT-4o fallback for genuinely
open-ended questions. Both paths are constrained to the user's own voucher
wallet — the bot never hallucinates brand info that isn't already stored.

Escalation: if the user asks for "human"/"agent" OR the LLM path errors, we
log a ticket to `support_history` with `channel="whatsapp"` and
`pending_admin_reply=True` so it surfaces in the admin dashboard inbox.
"""
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from bson import ObjectId

log = logging.getLogger("perk_orbit.wa_bot")


HUMAN_TRIGGER_RE = re.compile(r"\b(human|agent|support|talk\s+to|customer\s+care|representative)\b", re.I)
OPT_OUT_RE = re.compile(r"\b(stop|unsubscribe|opt\s*out|cancel\s+messages)\b", re.I)
GREETING_RE = re.compile(r"^\s*(hi|hello|hey|namaste|namaskar)\b", re.I)
HELP_RE = re.compile(r"\b(help|menu|options|what\s+can\s+you|start)\b", re.I)
EXPIRING_RE = re.compile(r"\b(expir(y|ing)?|ending|about\s+to\s+end|running\s+out)\b", re.I)
POINTS_RE = re.compile(r"\b(points|balance|reward|membership\s+status)\b", re.I)
PRO_RE = re.compile(r"\b(pro|premium|₹99|99\s*rupee|membership\s+plan|subscription)\b", re.I)


MENU_TEXT = (
    "🎯 *PerkWorth Bot*\n"
    "I can help with:\n"
    "• *expiring* — vouchers ending soon\n"
    "• *points* — your loyalty balance\n"
    "• *pro* — Pro membership status\n"
    "• *human* — talk to a person\n"
    "• *stop* — pause these messages"
)

NOT_REGISTERED = (
    "👋 Welcome to PerkWorth! I don't see this number linked to an account yet.\n"
    "Sign up at https://perkworth.app to start tracking your vouchers, then message me again."
)

OPT_OUT_ACK = (
    "You've been opted out of PerkWorth WhatsApp messages. "
    "Reply *start* anytime to turn them back on."
)


def _normalize_msisdn(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = "".join(ch for ch in str(raw) if ch.isdigit())
    if len(s) < 10 or len(s) > 15:
        return None
    if len(s) == 10:
        s = "91" + s
    return s


async def _find_user_by_wa_id(db, wa_id: str) -> Optional[dict]:
    """Match incoming wa_id against users.phone — tolerating stored values
    with or without country code / plus sign."""
    n = _normalize_msisdn(wa_id)
    if not n:
        return None
    candidates = [n, "+" + n]
    if n.startswith("91") and len(n) == 12:
        candidates.extend([n[2:], "+91" + n[2:], "91-" + n[2:]])
    return await db.users.find_one({"phone": {"$in": candidates}})


async def _list_expiring_vouchers(db, user_id: str, days: int = 7) -> list[dict]:
    today = datetime.now(timezone.utc).date()
    end = today + timedelta(days=days)
    out: list[dict] = []
    async for v in db.vouchers.find({
        "user_pin": user_id,
        "category": "vouchers",
        "status": {"$ne": "redeemed"},
    }):
        exp = v.get("expiry")
        if not exp:
            continue
        try:
            exp_date = datetime.strptime(exp, "%Y-%m-%d").date()
        except Exception:
            continue
        if today <= exp_date <= end:
            out.append({"brand": v.get("brand"), "code": v.get("code"),
                        "title": v.get("title"), "expiry": exp,
                        "days_left": (exp_date - today).days})
    out.sort(key=lambda x: x["days_left"])
    return out


async def _summarize_points(db, user_id: str) -> str:
    memberships = []
    async for m in db.vouchers.find({"user_pin": user_id, "category": "memberships"}):
        memberships.append(m)
    if not memberships:
        return "No memberships tracked yet. Add one at https://perkworth.app so I can watch its ROI."
    lines = [f"💎 *{len(memberships)} membership{'s' if len(memberships) > 1 else ''} tracked*"]
    for m in memberships[:5]:
        fee = m.get("fee_paid") or 0
        saved = m.get("savings_realized") or 0
        pct = int((saved / fee) * 100) if fee else 0
        lines.append(f"• {m.get('brand')} — ₹{int(saved)} saved / ₹{int(fee)} fee ({pct}% ROI)")
    return "\n".join(lines)


async def _pro_status(db, user_id: str) -> str:
    doc = await db.app_membership.find_one({"user_pin": user_id})
    if not doc or not doc.get("active"):
        return "You're on the free plan. Upgrade to Pro (₹99 / 3 months) at https://perkworth.app for unlimited vouchers + priority support."
    return (f"⭐ *Pro member* · Plan: {doc.get('plan')}\n"
            f"Renews / expires on: {(doc.get('expires_at') or '')[:10]}\n"
            f"Your referral code: `{doc.get('referral_code')}`")


async def _handoff_to_human(db, wa_id: str, user_id: Optional[str], message: str) -> str:
    """Log a support ticket for the admin dashboard inbox."""
    doc = {
        "channel": "whatsapp",
        "wa_id": wa_id,
        "user_pin": user_id,
        "message": message[:2000],
        "issue": "wa-inbound",
        "pending_admin_reply": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.support_history.insert_one(doc)
    return ("Got it 👍 A PerkWorth team member will reply here within 24 hours. "
            "You can keep messaging in the meantime — everything you send lands in our inbox.")


async def _llm_reply(user: dict, message: str, vouchers: list[dict], memberships: list[dict]) -> Optional[str]:
    """GPT-4o fallback via Emergent LLM key. Returns None on any error so the
    caller can fall back to human handoff."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception:
        log.exception("emergentintegrations not available")
        return None

    ctx_lines = []
    if vouchers:
        ctx_lines.append("Their vouchers:")
        for v in vouchers[:10]:
            ctx_lines.append(f"- {v.get('brand')} · {v.get('title')} · code {v.get('code') or '—'} · expires {v.get('expiry') or '—'}")
    if memberships:
        ctx_lines.append("Their memberships:")
        for m in memberships[:8]:
            ctx_lines.append(f"- {m.get('brand')} · fee ₹{int(m.get('fee_paid') or 0)} · saved ₹{int(m.get('savings_realized') or 0)}")
    context = "\n".join(ctx_lines) or "(no vouchers or memberships yet)"

    try:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"wa-{user.get('_id')}-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
            system_message=(
                "You are the PerkWorth WhatsApp assistant for an Indian rewards-tracker app. "
                "Answer briefly (under 900 characters), in the same language the user wrote in (English/Hindi/Hinglish). "
                "Use ONLY the user's own voucher/membership context below — never invent brands, codes, or dates. "
                "If they ask something outside your knowledge or the app's scope, reply "
                "'Reply *human* to talk to our support team.' Never break character."
                f"\n\nUser name: {user.get('name') or '(unknown)'}\n{context}"
            ),
        ).with_model("openai", "gpt-4o")
        response = await chat.send_message(UserMessage(text=message))
        text = response if isinstance(response, str) else str(response)
        return text.strip()[:4096] or None
    except Exception:
        log.exception("LLM bot fallback failed")
        return None


async def route_incoming(db, wa_id: str, message_text: str) -> str:
    """Main entrypoint for the webhook. Returns the reply text to send back."""
    msg = (message_text or "").strip()
    if not msg:
        return MENU_TEXT

    # 1) Opt-out — no user lookup needed
    if OPT_OUT_RE.search(msg):
        await db.wa_opt_outs.update_one(
            {"wa_id": wa_id},
            {"$set": {"wa_id": wa_id, "opted_out_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return OPT_OUT_ACK

    # If previously opted out and they haven't said "start", stay silent
    opt = await db.wa_opt_outs.find_one({"wa_id": wa_id})
    if opt and not re.search(r"\bstart\b", msg, re.I):
        return ""  # empty string signals caller to skip sending

    if opt and re.search(r"\bstart\b", msg, re.I):
        await db.wa_opt_outs.delete_one({"wa_id": wa_id})

    # 2) Match to user
    user = await _find_user_by_wa_id(db, wa_id)
    user_id = str(user["_id"]) if user else None

    # Explicit human handoff — works even for non-registered
    if HUMAN_TRIGGER_RE.search(msg):
        return await _handoff_to_human(db, wa_id, user_id, msg)

    if not user:
        return NOT_REGISTERED

    # 3) Keyword FAQ (zero LLM cost)
    if GREETING_RE.match(msg) or HELP_RE.search(msg):
        return f"Namaste {user.get('name') or 'there'} 👋\n\n{MENU_TEXT}"

    if EXPIRING_RE.search(msg):
        exps = await _list_expiring_vouchers(db, user_id, days=7)
        if not exps:
            return "🎉 No vouchers expiring in the next 7 days. You're all clear!"
        header = f"⏰ *{len(exps)} voucher{'s' if len(exps) > 1 else ''} expiring in ≤7 days*"
        lines = [header]
        for v in exps[:10]:
            when = "today" if v["days_left"] == 0 else ("tomorrow" if v["days_left"] == 1 else f"in {v['days_left']}d")
            lines.append(f"• {v['brand']} · code `{v['code'] or '—'}` · {when} ({v['expiry']})")
        return "\n".join(lines)

    if POINTS_RE.search(msg):
        return await _summarize_points(db, user_id)

    if PRO_RE.search(msg):
        return await _pro_status(db, user_id)

    # 4) LLM fallback for open-ended questions
    vouchers = [v async for v in db.vouchers.find({"user_pin": user_id, "category": "vouchers"}).limit(20)]
    memberships = [m async for m in db.vouchers.find({"user_pin": user_id, "category": "memberships"}).limit(10)]
    ai_reply = await _llm_reply(user, msg, vouchers, memberships)
    if ai_reply:
        return ai_reply

    # 5) Last-resort human handoff
    return await _handoff_to_human(db, wa_id, user_id, msg)
