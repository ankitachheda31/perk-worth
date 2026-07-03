# PerkWorth · WhatsApp Business Cloud API — Template Copy (EN + Hindi)

Submit these six templates in **Meta Business Manager → WhatsApp Manager → Message templates → Create template**. Category: **Utility** for all six (service/transactional). Header + Footer: none. Buttons: optional (see notes).

The backend service (`/app/backend/services/whatsapp.py`) refers to them by **exact names** below — do not rename after approval.

---

## 1 · voucher_expiry_alert  (Trigger: voucher expires in ≤3 days)

### `voucher_expiry_alert_en`  · Language `en` · Category `UTILITY`
**Body:**
```
Hi {{1}}, your {{2}} voucher {{3}} is expiring on {{4}}. Use it before it expires.
```
Parameter order: `{name} · {brand} · {code} · {expiry_date}`

### `voucher_expiry_alert_hi`  · Language `hi` · Category `UTILITY`
**Body:**
```
नमस्ते {{1}}, आपका {{2}} वाउचर {{3}} {{4}} को समाप्त हो रहा है। कृपया समय से पहले उपयोग करें।
```

---

## 2 · pro_membership_activated  (Trigger: Razorpay payment verified, Pro activated)

### `pro_membership_activated_en`  · Language `en` · Category `UTILITY`
**Body:**
```
Hi {{1}}, your PerkWorth {{2}} membership is now active until {{3}}. Enjoy your benefits.
```
Parameter order: `{name} · {plan_label} · {expires_on}`

### `pro_membership_activated_hi`  · Language `hi` · Category `UTILITY`
**Body:**
```
नमस्ते {{1}}, आपकी PerkWorth {{2}} मेंबरशिप {{3}} तक सक्रिय हो गई है। अपने लाभ का आनंद लें।
```

---

## 3 · family_circle_invite  (Trigger: user adds a Family Circle member with phone)

### `family_circle_invite_en`  · Language `en` · Category `UTILITY`
**Body:**
```
Hi {{1}}, {{2}} has invited you to join their PerkWorth Family Circle. Tap {{3}} to accept.
```
Parameter order: `{invitee_name} · {inviter_name} · {invite_url}`

### `family_circle_invite_hi`  · Language `hi` · Category `UTILITY`
**Body:**
```
नमस्ते {{1}}, {{2}} ने आपको अपने PerkWorth फैमिली सर्कल में शामिल होने के लिए आमंत्रित किया है। स्वीकार करने के लिए {{3}} पर टैप करें।
```

---

## Once approved — flip the flag

Set in production `/app/backend/.env`:
```
WHATSAPP_ENABLED=1
WHATSAPP_ACCESS_TOKEN=EAAG...    # System user long-lived token
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=1122334455
```

Restart backend. Existing triggers (`services/notifications_logic.py` for expiry, `routes/billing.py` for membership, `routes/circle.py` for invite) will start firing real messages.

## Where to get credentials
1. https://developers.facebook.com/apps/ → create a Meta App → add "WhatsApp" product
2. Business Manager → connect WABA + test phone number
3. WhatsApp → API Setup page shows Phone Number ID (temp token for 24h; get long-lived via System User)
4. Business Verification (required for prod scale) — Meta docs walk through the KYC steps

## Cost note (Feb 2026)
Utility conversations in India are **~₹0.35 per conversation** on Meta's Cloud API (business-initiated). All three templates fall under Utility, not Marketing, so pricing stays low.

---

# Inbound Webhook + Bot Routing (v2)

The backend now also handles INCOMING WhatsApp messages via a bot that answers FAQs, escalates to GPT-4o for open-ended questions, and logs tickets to `support_history` for admin follow-up.

## Endpoints (always mounted, feature-flagged)

- `GET  /api/whatsapp/webhook` — Meta's one-time verification handshake. Compares `hub.verify_token` against env `WHATSAPP_VERIFY_TOKEN` and echoes back `hub.challenge` on match. Always live so you can register the URL in Meta before flipping `WHATSAPP_ENABLED=1`.
- `POST /api/whatsapp/webhook` — receives inbound message payloads. Validates HMAC-SHA256 signature via `X-Hub-Signature-256` against env `WHATSAPP_APP_SECRET`. No-ops (returns 200) when `WHATSAPP_ENABLED=0`.

## New env vars

```
WHATSAPP_VERIFY_TOKEN=perkworth_wa_verify_2026   # any random string; paste into Meta's "verify token" field
WHATSAPP_APP_SECRET=                             # Meta App → Settings → Basic → App Secret (long hex)
```

## Meta setup steps (once WABA is approved)

1. **Meta Business Manager** → WhatsApp → Configuration → **Webhook**
2. Callback URL: `https://<your-domain>/api/whatsapp/webhook`
3. Verify token: paste the value of `WHATSAPP_VERIFY_TOKEN` from your `.env`
4. Click **Verify and Save** → Meta issues a `GET` to your webhook; the endpoint echoes the challenge and Meta records the URL.
5. **Webhook fields**: subscribe to `messages` at minimum. `message_status` if you want delivery receipts later.
6. **App Dashboard → Settings → Basic → App Secret** → copy into `WHATSAPP_APP_SECRET` so signature verification passes on every incoming POST.

## Bot behaviour (hybrid — FAQ + LLM)

Zero-cost keyword paths handle 90% of expected traffic:

| Keyword pattern | Reply |
|---|---|
| `hi` / `hello` / `namaste` / `help` / `menu` | Personalized welcome + menu |
| `expiring` / `ending` | List up to 10 vouchers expiring in ≤7 days with brand + code + days-left |
| `points` / `balance` / `membership status` | Per-membership ROI summary (₹ saved / ₹ fee, %) |
| `pro` / `premium` / `subscription` | Pro plan expiry + referral code |
| `human` / `agent` / `support` / `talk to` | Logs ticket to `support_history` with `pending_admin_reply=True`, replies "team will reply within 24h" |
| `stop` / `unsubscribe` / `opt out` | Adds row to `wa_opt_outs`, bot stays silent until `start` is sent |

Anything else → GPT-4o via Emergent LLM key with the user's own voucher/membership context injected as system prompt. If LLM errors or returns empty, we fall back to human handoff.

## User identification

We match the incoming `wa_id` (Meta's E.164-without-plus format, e.g. `919812345678`) against `users.phone`. Users without a matching phone get a one-line "sign up first" reply — we never ask for their PIN over WhatsApp.

## 24-hour session window

Every inbound message upserts `wa_sessions.{wa_id, last_user_msg_at}`. Since replies happen INSIDE the 24hr window Meta grants after any user-initiated message, we send plain text (`type: text`) not templates. `send_session_text_message()` in `services/whatsapp.py` handles this — never call it cold.

## Admin visibility

Every human-handoff ticket lands in `support_history` with `channel="whatsapp"` and `pending_admin_reply=True`. You can filter for these in your existing Admin Dashboard's support tab to reply from the app.

## Feature-flag flow

Until you set `WHATSAPP_ENABLED=1`:
- `GET /webhook` still verifies (so you can complete Meta's URL registration ahead of time)
- `POST /webhook` returns `{ok: true, processed: false, reason: "disabled"}` — no bot logic runs, no messages get sent, no LLM cost.

