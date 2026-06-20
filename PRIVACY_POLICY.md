# PerkWorth — Privacy Policy

**Effective Date:** _<INSERT LAUNCH DATE>_
**Last Updated:** _<INSERT LAUNCH DATE>_
**Operator:** PerkWorth (the "App", "we", "us", or "our")
**Contact:** support@perkworth.com · WhatsApp +91 98202 04866

> This Privacy Policy explains how PerkWorth collects, uses, stores, and shares your information when you use our mobile and web application ("Service"). By using PerkWorth you agree to this Policy. If you do not agree, please uninstall the App.

---

## 0. Data Protection Clause (Plain English)

**Your wallet data is encrypted.** All vouchers, points, memberships, and family circle records are transmitted over **HTTPS / TLS 1.3** and stored in **encrypted MongoDB Atlas** (AES-256 at rest). Your password is hashed one-way with **bcrypt** — even our engineers cannot read it.

**We never sell, rent, share, or trade your financial data.** PerkWorth's only revenue source is the ₹99/quarter Pro membership. We do not run ads, we do not profile you, we do not work with data brokers, and we do not share your wallet with advertisers under any circumstance.

**You may erase everything, instantly.** Open the app → Settings → **Clear All My Data**. This deletes your account, your wallet, your payments history, and your referral records server-side immediately. Backups are purged within 30 days.

This clause is binding and forms part of our DPDP 2023 (India) and GDPR (EU) obligations.

---

## 1. Information We Collect

### 1.1 Information You Provide Directly
- **Profile** — Optional name, email, and phone number you enter under Profile. **Stored locally on your device** (`localStorage`) by default; never transmitted unless required for support.
- **Vouchers, Coupons, Membership Cards** — Brand, title, code, expiry, value, points, redemption notes you enter manually or via AI assistance.
- **Family Circle Members** — Names and relations (e.g., "Priya · Wife") you add to share specific vouchers.

### 1.2 Information Collected via Permissions (Android only)
- **READ_SMS / RECEIVE_SMS** — On Android **only**, with your **explicit one-time consent**, PerkWorth scans incoming SMS for voucher patterns (e.g. "₹150 off", "code SWIGGY150", "valid till 25 Nov"). **The full SMS body never leaves your device until you tap "Save to PerkWorth" on a detected item.** When you do tap save, we send that one message to our backend (and onwards to OpenAI's GPT-4o via Emergent integrations) to extract structured fields. Raw SMS content is **not retained** server-side after extraction.
- **POST_NOTIFICATIONS** — to alert you of vouchers expiring within 24 hours.
- **INTERNET / ACCESS_NETWORK_STATE** — required for API calls and offline detection.
- **CAMERA** (optional, requested only when you tap "Scan") — to photograph physical coupons / gift cards / membership cards for AI OCR extraction. The captured image is sent to OpenAI's GPT-4o vision via our backend, used for extraction only, and not retained.

### 1.3 Information Collected Automatically
- **Local PIN hash** — Your 4-digit PIN is stored **only on your device** (`localStorage`). PerkWorth servers never receive or store it.
- **Anonymous device identifier (`user_pin`)** — Used solely to scope your wallet data on our backend. It is **not** linked to your name, email, or phone unless you provide them.
- **Payment data (Razorpay)** — When you upgrade to ₹99 Pro, payment is processed by Razorpay Software Pvt Ltd. We store only the resulting `order_id`, `payment_id`, and verification signature; **we do not see or store your card number, UPI ID, or bank credentials**.

### 1.4 Information We Do NOT Collect
- Contact list / address book
- Photos other than ones you explicitly upload via "Scan"
- Location data
- Browsing history
- Microphone audio (Voice Search uses the browser's on-device Web Speech API; transcripts are returned as text only)
- Any data used for advertising or third-party tracking

---

## 2. How We Use Your Information

| Purpose | Data Used |
|---|---|
| Show your voucher wallet | Vouchers, memberships, points you save |
| AI extraction from images / SMS | The single image or SMS text you submit |
| ₹99 Pro membership activation | Razorpay order + signature only |
| Family Circle sharing | Member names + voucher IDs |
| Notifications | Voucher expiry dates + membership ROI status |
| Smart Search (Brand → Parent mapping) | Your search query (not persisted) |
| Customer support history | Logged voucher metadata when you tap WhatsApp Help |

We do **not** sell your information. We do **not** use your data for advertising. We do **not** profile you for targeted marketing.

---

## 3. Data Sharing

We share data only with the following service providers, strictly for the operations described:

| Provider | Purpose | Data Shared |
|---|---|---|
| **OpenAI (via Emergent Integrations)** | GPT-4o text & image extraction | One SMS text OR one image at a time, on user action |
| **Razorpay** | Payment processing for ₹99 Pro | Order amount, payment method (chosen by you in their hosted modal) |
| **WhatsApp / Meta** | One-tap support (you initiate) | The voucher details you choose to send |
| **MongoDB Atlas** (or equivalent hosting) | Encrypted database storage of your wallet | All wallet records keyed by anonymous `user_pin` |

We do **not** share data with advertisers, data brokers, or analytics platforms.

---

## 4. Data Retention

- Wallet records persist until you delete them or uninstall the app.
- Razorpay order ledger retained for 7 years per Indian RBI / tax norms.
- Notifications older than 30 days are auto-purged.
- SMS scan history: **none retained** server-side; only extracted voucher fields persist (in your wallet).
- Account deletion: email support@perkworth.com from the email on your profile, or uninstall the app (server data automatically becomes unreachable since your `user_pin` lives only on the device).

---

## 5. Data Security

- **PIN**: stored only on-device. Never transmitted.
- **Transport**: All API requests use HTTPS / TLS 1.3.
- **Payment**: Razorpay PCI-DSS Level 1 certified. We never touch raw card data.
- **Database**: At-rest encryption (AES-256) and access-restricted to PerkWorth operations.
- **Signature verification**: Razorpay payments verified server-side via HMAC-SHA256 to prevent tampering.

---

## 6. Your Rights

You may:
- **Access** all data we hold about your wallet via the in-app screens.
- **Delete** individual vouchers, memberships, circle members, notifications at any time.
- **Self-service wipe** — Open Settings → **Clear All My Data** to delete your account and ALL server-side records instantly. No email required. (Implements DPDP 2023 §13 Right to Erasure and GDPR Article 17 Right to be Forgotten.)
- **Export** your wallet (P1 backlog — request via support@perkworth.com).
- **Withdraw consent** for SMS auto-scan via Android Settings → Apps → PerkWorth → Permissions → SMS → Deny.
- **Request deletion** of all server-side records: email support@perkworth.com from your profile email if you cannot access the in-app option.

### 6.1 DPDP Act 2023 (India) rights
Access (§11), correction (§12), erasure (§13), grievance redressal (§13(3)). Grievance Officer: grievance@perkworth.com. Statutory response within 30 days.

### 6.2 GDPR (EU / EEA / UK) rights
Articles 15 (access), 16 (rectification), 17 (erasure), 18 (restriction), 20 (portability), 21 (object), and 22 (no solely-automated decisions). Lawful basis: consent (SMS scanning), contract (Pro membership), legitimate interest (fraud prevention on payments). DPO contact: dpo@perkworth.com.

We honor all valid requests within 30 days.

---

## 7. Children's Privacy

PerkWorth is **not directed at children under 13**. We do not knowingly collect data from children. If you believe a child has used the app, contact us and we will delete the associated records.

---

## 8. International Transfers

Our servers are hosted in India. If you access the app from outside India, your data is transferred to and processed in India under the safeguards described in this Policy.

---

## 9. Permissions Justification (Google Play / App Store mandatory)

### 9.1 READ_SMS / RECEIVE_SMS (Android only)
- **Core feature**: Automatically detect voucher codes, expiry dates, and loyalty point updates from incoming SMS so users don't manually copy-paste.
- **Alternative provided**: The app remains fully usable without granting SMS permission. Users can paste SMS text manually or use the Camera scan instead.
- **Data flow**: SMS is read in-memory on-device, filtered against a voucher-keyword heuristic, and **only the single message a user explicitly saves** is sent to our backend for GPT-4o extraction. Raw SMS bodies are **not retained server-side**.

### 9.2 CAMERA
- **Core feature**: Photograph a physical voucher / gift card / membership card to auto-fill its details via AI vision.
- **Alternative provided**: Manual entry tab is always available.

### 9.3 POST_NOTIFICATIONS (Android 13+)
- **Core feature**: Notify the user when a saved voucher is expiring within 24 hours, when an asset membership reaches break-even, or when a referral bonus is applied.

---

## 10. Changes to This Policy

We may update this Policy from time to time. We will notify users of material changes via an in-app banner and update the "Last Updated" date above.

---

## 11. Contact

**Support Email:** support@perkworth.com
**WhatsApp:** +91 98202 04866
**Postal Address:** _<INSERT REGISTERED ADDRESS>_, India
**Grievance Officer (Indian DPDP Act):** _<INSERT NAME + EMAIL>_

> By continuing to use PerkWorth, you acknowledge that you have read and understood this Privacy Policy.
