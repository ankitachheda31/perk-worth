"""Resend transactional email mailer.

Wraps the synchronous `resend` SDK in `asyncio.to_thread` so callers don't block
the FastAPI event loop. Provides three high-level helpers:
  - send_email(to, subject, html, text=None)
  - send_password_reset(email, reset_url, name=None)
  - send_circle_invite(to_email, inviter_name, invitee_name, invite_url, relation=None)

Behaviour when `RESEND_API_KEY` is missing or empty:
  - All send_* functions log a warning and return False instead of raising.
  - Callers should treat email delivery as best-effort (it must never break
    the underlying flow, e.g. signup / circle add).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend

log = logging.getLogger("perk_orbit.mailer")


def _configured() -> bool:
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        return False
    resend.api_key = key
    return True


def _sender() -> str:
    """Return the From header. Supports both `email@example.com` and `Name <email@example.com>` forms."""
    email = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip()
    name = os.environ.get("SENDER_NAME", "").strip()
    if name:
        return f"{name} <{email}>"
    return email


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """Send an email via Resend. Returns True on success, False otherwise.

    Universal kill-switch: setting env EMAIL_SEND_ENABLED=0 short-circuits every
    outbound email in the app (forgot-password, circle invite, voucher share,
    membership receipts — everything routing through this helper). Use during
    incidents when the inbox is flooding OR in dev/CI to prevent test emails.
    """
    import os
    if os.environ.get("EMAIL_SEND_ENABLED", "1") != "1":
        log.info("EMAIL_SEND_ENABLED=0 — skipping email to=%s subject=%r", to, subject)
        return False
    if not _configured():
        log.warning("RESEND_API_KEY missing — skipping email to %s (%s)", to, subject)
        return False
    params: dict = {
        "from": _sender(),
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if text:
        params["text"] = text
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        # Resend SDK 2.x can return either a dict or an object with .id — handle both defensively
        rid = None
        if isinstance(result, dict):
            rid = result.get("id")
        else:
            rid = getattr(result, "id", None)
        log.info("Email sent to=%s id=%s subject=%r", to, rid, subject)
        return True
    except Exception as e:
        log.error("Resend send failure to=%s subject=%r err=%s", to, subject, e)
        return False


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------
_BASE_STYLE = """
  body { margin: 0; padding: 0; background: #FBFAF6; font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; color: #1B2333; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
  .card { background: #ffffff; border: 1px solid #DDE2EA; border-radius: 20px; padding: 32px; }
  .brand { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; }
  .brand-mark { width: 32px; height: 32px; border-radius: 8px; background: #065F46; color: #fff; font-weight: 800; display: inline-block; text-align: center; line-height: 32px; }
  .brand-name { font-size: 16px; font-weight: 800; color: #0F172A; vertical-align: middle; margin-left: 8px; }
  h1 { font-size: 22px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0; line-height: 1.25; }
  p { font-size: 14px; line-height: 1.6; color: #2B3648; margin: 0 0 14px 0; }
  .btn { display: inline-block; background: #065F46; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 999px; }
  .meta { font-size: 12px; color: #56647B; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #EFF1F5; padding: 4px 8px; border-radius: 6px; font-size: 12px; word-break: break-all; }
  .footer { text-align: center; font-size: 11px; color: #7C8AA0; margin-top: 24px; }
  .footer a { color: #065F46; text-decoration: none; }
"""


def _shell(title: str, inner_html: str) -> str:
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>{title}</title><style>{_BASE_STYLE}</style></head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand"><span class="brand-mark">P</span><span class="brand-name">PerkWorth</span></div>
      {inner_html}
    </div>
    <div class="footer">
      PerkWorth Technologies Pvt. Ltd. · Mumbai, India<br/>
      <a href="mailto:support@perkworth.com">support@perkworth.com</a> · DPDP 2023 &amp; GDPR compliant
    </div>
  </div>
</body></html>"""


async def send_password_reset(email: str, reset_url: str, name: Optional[str] = None) -> bool:
    greeting = f"Hi {name}," if name else "Hi,"
    inner = f"""
      <h1>Reset your PerkWorth password</h1>
      <p>{greeting}</p>
      <p>We received a request to reset the password for the PerkWorth account associated with <strong>{email}</strong>. Tap the button below to choose a new one. This link expires in <strong>60 minutes</strong>.</p>
      <p style="margin: 24px 0;"><a class="btn" href="{reset_url}">Reset my password →</a></p>
      <p class="meta">Or copy and paste this link into your browser:<br/><span class="code">{reset_url}</span></p>
      <p class="meta" style="margin-top: 20px;">If you didn't request this, you can safely ignore this email — your password won't change unless you click the link above.</p>
    """
    text = (
        f"Reset your PerkWorth password\n\n"
        f"{greeting}\n\n"
        f"We received a request to reset the password for {email}. "
        f"Open the link below within 60 minutes to choose a new one:\n\n{reset_url}\n\n"
        f"If you didn't request this, just ignore this email."
    )
    return await send_email(email, "Reset your PerkWorth password", _shell("Reset password", inner), text)


async def send_circle_invite(
    to_email: str,
    inviter_name: str,
    invitee_name: str,
    invite_url: str,
    relation: Optional[str] = None,
) -> bool:
    rel = f" ({relation})" if relation else ""
    inviter = inviter_name or "A PerkWorth member"
    inner = f"""
      <h1>{inviter} added you to their PerkWorth Family Circle</h1>
      <p>Hi {invitee_name}{rel},</p>
      <p><strong>{inviter}</strong> wants to share specific vouchers, coupons and loyalty perks with you on <strong>PerkWorth</strong> — India's voucher-first wallet.</p>
      <p>No screenshots, no group chat. Just the perks they choose to share — privately and securely.</p>
      <p style="margin: 24px 0;"><a class="btn" href="{invite_url}">Accept the invite →</a></p>
      <p class="meta">Or copy this link into your browser:<br/><span class="code">{invite_url}</span></p>
      <p class="meta" style="margin-top: 20px;">PerkWorth never shares your data with advertisers and never reads bank OTPs. <a href="https://perkworth.app/#privacy">Privacy Policy</a>.</p>
    """
    text = (
        f"{inviter} added you to their PerkWorth Family Circle\n\n"
        f"Hi {invitee_name}{rel},\n\n"
        f"{inviter} wants to share vouchers with you on PerkWorth. "
        f"Accept the invite here:\n\n{invite_url}\n"
    )
    return await send_email(to_email, f"{inviter} shared a voucher with you on PerkWorth", _shell("Family Circle invite", inner), text)
