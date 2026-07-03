"""WhatsApp Business Cloud API (Meta) — outbound-only template sender.

Feature-flagged via env: WHATSAPP_ENABLED=1 turns on real sends. When disabled
(or credentials missing), each send is logged and returns
`{"sent": False, "reason": "disabled"}` so callers never break.

Supported templates (submit these to Meta Business Manager for approval —
draft copy in /app/WHATSAPP_TEMPLATES.md):
  - voucher_expiry_alert_en / voucher_expiry_alert_hi
  - pro_membership_activated_en / pro_membership_activated_hi
  - family_circle_invite_en / family_circle_invite_hi
"""
import logging
import os
from typing import Any, Dict, Literal, Optional

import httpx

log = logging.getLogger("perk_orbit.whatsapp")

LanguageCode = Literal["en", "hi"]
GRAPH_API_VERSION = "v21.0"


def _cfg() -> Dict[str, Any]:
    return {
        "enabled": os.environ.get("WHATSAPP_ENABLED", "0") == "1",
        "access_token": os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip(),
        "phone_number_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip(),
        "business_account_id": os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "").strip(),
    }


def status() -> Dict[str, Any]:
    """Health probe used by admin surface — never exposes the token."""
    c = _cfg()
    return {
        "enabled": c["enabled"],
        "has_access_token": bool(c["access_token"]),
        "has_phone_number_id": bool(c["phone_number_id"]),
        "has_business_account_id": bool(c["business_account_id"]),
        "mode": "live" if (c["enabled"] and c["access_token"] and c["phone_number_id"]) else "stub",
    }


def _normalize_e164(phone: Optional[str]) -> Optional[str]:
    """Loose E.164 normaliser. Returns digits-only string acceptable to Meta,
    or None if the input can't be salvaged. Meta accepts the number WITHOUT
    the leading '+' but with the country code — e.g. '919812345678'."""
    if not phone:
        return None
    s = "".join(ch for ch in str(phone) if ch.isdigit())
    if len(s) < 10 or len(s) > 15:
        return None
    # Default to India country code when a 10-digit number is passed
    if len(s) == 10:
        s = "91" + s
    return s


async def _post_template(payload: Dict[str, Any]) -> Dict[str, Any]:
    c = _cfg()
    if not c["enabled"]:
        log.info("WhatsApp send skipped (WHATSAPP_ENABLED=0). template=%s to=%s",
                 payload.get("template", {}).get("name"), payload.get("to"))
        return {"sent": False, "reason": "disabled"}
    if not c["access_token"] or not c["phone_number_id"]:
        log.warning("WhatsApp send skipped (missing credentials). template=%s",
                    payload.get("template", {}).get("name"))
        return {"sent": False, "reason": "disabled"}

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{c['phone_number_id']}/messages"
    headers = {
        "Authorization": f"Bearer {c['access_token']}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except Exception as e:
        log.exception("WhatsApp HTTP error: %s", e)
        return {"sent": False, "reason": "http_error", "error": str(e)}

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}
    if response.status_code == 200:
        message_id = (data.get("messages") or [{}])[0].get("id")
        log.info("WhatsApp sent. id=%s template=%s to=%s",
                 message_id, payload.get("template", {}).get("name"), payload.get("to"))
        return {"sent": True, "message_id": message_id}
    log.error("WhatsApp API error status=%s body=%s", response.status_code, data)
    return {"sent": False, "reason": "api_error", "status": response.status_code, "response": data}


def _build(template_base: str, to: str, language: LanguageCode, params: list[str]) -> Dict[str, Any]:
    return {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": f"{template_base}_{language}",
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": p} for p in params],
                }
            ],
        },
    }


# ---------------------------------------------------------------------------
# Public send helpers — one per trigger event.
# ---------------------------------------------------------------------------
async def send_voucher_expiry_alert(
    phone: Optional[str],
    user_name: str,
    brand: str,
    code: str,
    expiry_date: str,
    language: LanguageCode = "en",
) -> Dict[str, Any]:
    to = _normalize_e164(phone)
    if not to:
        return {"sent": False, "reason": "no_phone"}
    payload = _build("voucher_expiry_alert", to, language,
                     [user_name or "there", brand or "your brand", code or "voucher", expiry_date or "soon"])
    return await _post_template(payload)


async def send_pro_membership_activated(
    phone: Optional[str],
    user_name: str,
    plan_label: str,
    expires_on: str,
    language: LanguageCode = "en",
) -> Dict[str, Any]:
    to = _normalize_e164(phone)
    if not to:
        return {"sent": False, "reason": "no_phone"}
    payload = _build("pro_membership_activated", to, language,
                     [user_name or "there", plan_label or "Pro", expires_on or "3 months"])
    return await _post_template(payload)


async def send_family_circle_invite(
    phone: Optional[str],
    invitee_name: str,
    inviter_name: str,
    invite_url: str,
    language: LanguageCode = "en",
) -> Dict[str, Any]:
    to = _normalize_e164(phone)
    if not to:
        return {"sent": False, "reason": "no_phone"}
    payload = _build("family_circle_invite", to, language,
                     [invitee_name or "there", inviter_name or "A PerkWorth member", invite_url or ""])
    return await _post_template(payload)


async def send_session_text_message(to_wa_id: str, body: str) -> Dict[str, Any]:
    """Send a plain-text reply INSIDE an active 24hr session window.
    Called by the inbound webhook bot — never call this cold, use a template.
    Meta rejects `type:text` sends outside the 24hr window with error 131047.
    """
    c = _cfg()
    if not c["enabled"]:
        log.info("WhatsApp session reply skipped (WHATSAPP_ENABLED=0). to=%s body=%.60s", to_wa_id, body)
        return {"sent": False, "reason": "disabled"}
    if not c["access_token"] or not c["phone_number_id"]:
        return {"sent": False, "reason": "disabled"}
    to = _normalize_e164(to_wa_id)
    if not to:
        return {"sent": False, "reason": "no_phone"}
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": body[:4096]},  # WhatsApp text-message hard cap
    }
    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{c['phone_number_id']}/messages"
    headers = {
        "Authorization": f"Bearer {c['access_token']}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, headers=headers, json=payload)
    except Exception as e:
        log.exception("WhatsApp session-text HTTP error: %s", e)
        return {"sent": False, "reason": "http_error", "error": str(e)}
    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}
    if response.status_code == 200:
        return {"sent": True, "message_id": (data.get("messages") or [{}])[0].get("id")}
    return {"sent": False, "reason": "api_error", "status": response.status_code, "response": data}
