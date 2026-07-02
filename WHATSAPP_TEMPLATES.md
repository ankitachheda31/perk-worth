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
