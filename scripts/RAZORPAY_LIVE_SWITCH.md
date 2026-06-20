# Switching PerkWorth to Razorpay LIVE — secure key rotation playbook

This is the exact sequence to flip from **test mode** to **production / live**
without ever exposing your live keys in chat, screenshots, GitHub, or build
artifacts.

## What you need from Razorpay Dashboard

After Razorpay approves your Live Activation, log in to **https://dashboard.razorpay.com**
and grab:

| Variable | Where in the Dashboard | What it looks like |
|---|---|---|
| `RAZORPAY_KEY_ID` | Settings → API Keys → Generate Key (Live mode) | `rzp_live_XXXXXXXXXXXXXX` |
| `RAZORPAY_KEY_SECRET` | Same dialog — **shown once**, copy immediately | 24-char alphanumeric |
| `RAZORPAY_WEBHOOK_SECRET` | Settings → Webhooks → Create webhook → Secret | a 32-character random string **you choose** |

> **Critical:** the `KEY_SECRET` is shown to you exactly once. If you lose it
> you must regenerate the key pair. Store it in a password manager
> (1Password / Bitwarden) immediately after seeing it.

## Configure the webhook in Razorpay Dashboard (before switching keys)

1. Razorpay Dashboard → Settings → **Webhooks** → "+ Create New Webhook".
2. **Webhook URL:** `https://<your-deployed-backend-domain>/api/payments/webhook`
   - In production this will be your custom domain or Vercel/Railway URL.
   - It must be **HTTPS**.
3. **Secret:** Click "Generate" or paste your own 32-char random string. Copy
   this value — it becomes `RAZORPAY_WEBHOOK_SECRET`.
4. **Events to subscribe to** (tick these three):
   - `payment.captured`
   - `payment.failed`
   - `refund.created`
5. **Alert email:** your billing inbox.
6. **Save**.
7. Click the new webhook → "Test" button → verify it gets a `200 OK` from your
   server. If you see `400 Invalid signature`, the secret is wrong.

## Update the `.env` securely — step by step

> Do NOT paste live keys into Git, Slack, chat, screenshots, or screen-share.
> Use SSH or your hosting provider's secret-manager UI.

### Option A — Emergent platform (current preview environment)

Use the platform's **environment-variable UI** (do NOT edit `/app/backend/.env`
directly in chat — that file gets snapshot to backups). Look for a "Secrets"
or "Environment" tab in the Emergent dashboard:

1. Open Emergent project settings → Environment Variables → Backend.
2. **Update** these three keys (do not create new ones):
   ```
   RAZORPAY_KEY_ID=rzp_live_••••••••••••••
   RAZORPAY_KEY_SECRET=••••••••••••••••••••••••
   RAZORPAY_WEBHOOK_SECRET=••••••••••••••••••••••••••••••••
   ```
3. **Update frontend env** as well:
   ```
   VITE_RAZORPAY_KEY_ID=rzp_live_••••••••••••••   (same KEY_ID as above)
   ```
4. Hit **Save** — Emergent restarts both services automatically.
5. Run the health check to verify: `python3 /app/scripts/health_check.py`
   — must return `HEALTHY · 12/12`.

### Option B — self-hosted Linux server (after you migrate off Emergent)

```bash
# SSH into your server
ssh your-user@your-perk-worth-server.com

# Open the backend env file with restricted permissions
sudo nano /etc/perk-worth/backend.env
# (we recommend storing real prod env OUTSIDE /app)

# Edit these three lines (paste from your password manager):
RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=XXXXXXXXXXXXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Save (Ctrl+O, Enter, Ctrl+X) and lock the file down
sudo chmod 600 /etc/perk-worth/backend.env
sudo chown perk-worth:perk-worth /etc/perk-worth/backend.env

# Restart the backend
sudo supervisorctl restart backend

# Verify
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://api.perkworth.app/api/payments/webhook \
  -H "X-Razorpay-Signature: bad" -d '{}'
# Expected: 400 (rejecting bad signatures means the webhook secret loaded)
```

### Option C — Vercel / Railway / Render (frontend hosting)

For the **frontend env** (`VITE_RAZORPAY_KEY_ID`):

1. Project Settings → Environment Variables → Production.
2. Add `VITE_RAZORPAY_KEY_ID` = your `rzp_live_...` value.
3. Trigger a redeploy. Vercel/Netlify rebuild the bundle with the new env baked in.

> ⚠ The `KEY_ID` is the public part — safe to ship in the frontend bundle.
> NEVER put `KEY_SECRET` or `WEBHOOK_SECRET` in any frontend env / Vite var.

## Verify the switch worked

Run the existing health check + try a real ₹1 payment:

```bash
python3 /app/scripts/health_check.py
# Expected: HEALTHY · 12/12
```

Then in the app:
1. Sign in to your test account.
2. Settings → Membership → "Pay ₹99 with Razorpay".
3. Confirm the Razorpay checkout URL shows `r/...?key=rzp_live_...` (no `rzp_test_`).
4. Complete a real ₹99 payment with your own UPI / card.
5. Within ~5 seconds, the webhook should fire — check
   `db.webhook_events.find({}).sort({received_at:-1}).limit(3)` for a row with
   `event_type: "payment.captured"`.
6. Your membership should show `Active` immediately.
7. Cancel auto-renewal to stop future charges while testing.

## Rollback plan (if anything breaks)

If a live transaction fails, instantly switch back to test mode by reverting
the three env vars to the `rzp_test_...` values and restarting:

```bash
sudo supervisorctl restart backend
```

Test keys are saved in `/app/memory/test_credentials.md` for emergency rollback.

## Security checklist before going live

- [ ] Live `KEY_SECRET` is stored in a password manager, not a text file.
- [ ] Webhook URL is HTTPS (Razorpay rejects HTTP).
- [ ] `WEBHOOK_SECRET` is 32+ random characters (use `openssl rand -hex 32`).
- [ ] Both `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are NOT in any
      Git commit (`git grep rzp_live` should return nothing).
- [ ] The backend `.env` file has `chmod 600` (owner-read-only).
- [ ] Auto-renewal logic in `MembershipPage.jsx` is reachable and tested.
- [ ] A real ₹1 or ₹99 transaction has been completed and reconciled.

If any of the above is unchecked, do NOT submit your app to the Play Store yet.

## Emergency contacts

- Razorpay support: support@razorpay.com / 080-46669999
- PerkWorth on-call: support@perkworth.com (you)

---

Built into `/app/scripts/RAZORPAY_LIVE_SWITCH.md` for one-click reference. Run
`python3 /app/scripts/health_check.py` after every change.
