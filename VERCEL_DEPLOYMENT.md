# PerkWorth — Vercel Deployment Guide

This repo is a monorepo: **`frontend/`** (Vite + React PWA) deploys to Vercel; **`backend/`** (FastAPI) stays on Emergent / another host.

The root `vercel.json` + `package.json` make Vercel auto-detect the project on import. No manual framework selection should be needed.

---

## 1. Import the repo on Vercel

1. Go to https://vercel.com/new
2. Select your Git provider and pick the **PerkWorth** repo.
3. Vercel will read `/vercel.json` and auto-fill the settings below.

---

## 2. Verify Project Settings (Vercel Dashboard)

If Vercel still asks you to confirm, use these **exact** values:

| Field | Value |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` (leave as repository root) |
| **Build Command** | `cd frontend && yarn install --frozen-lockfile && yarn build` |
| **Output Directory** | `frontend/dist` |
| **Install Command** | `echo 'Install handled by buildCommand'` |
| **Node.js Version** | `20.x` (or `18.x`) |

> All of the above are already encoded in `/vercel.json`. You should not need to override them in the UI.

---

## 3. Environment Variables (REQUIRED)

In the Vercel project → **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `REACT_APP_BACKEND_URL` | `https://orbit-vouchers.preview.emergentagent.com` | Production, Preview, Development |
| `VITE_RAZORPAY_KEY_ID` | `rzp_test_T2eKeMQSIX0Vlq` | Production, Preview, Development |

> Replace `REACT_APP_BACKEND_URL` with your final backend URL once you migrate the FastAPI backend off Emergent (e.g. Railway / Render / Fly).
> When Razorpay KYC is approved, swap `VITE_RAZORPAY_KEY_ID` to the LIVE key (`rzp_live_…`).

After adding env vars, click **Redeploy** on the latest deployment so the new values are baked into the build.

---

## 4. Domain & HTTPS

1. Vercel → **Settings → Domains** → add `perkworth.app` and `www.perkworth.app`.
2. At your DNS registrar, point:
   - `perkworth.app` → `A 76.76.21.21`
   - `www.perkworth.app` → `CNAME cname.vercel-dns.com`
3. Vercel auto-issues SSL certificates within a few minutes.

---

## 5. Backend CORS Reminder

Once deployed on `https://perkworth.app`, ensure your FastAPI backend's `CORS_ORIGINS` env var includes that domain. Update `/app/backend/.env`:

```
CORS_ORIGINS=https://perkworth.app,https://www.perkworth.app,https://*.vercel.app,...
```

Then restart backend: `sudo supervisorctl restart backend`.

---

## 6. SPA Routing & PWA Caching

`vercel.json` includes:
- **Rewrite** `/(.*) → /index.html` for client-side React routing (so refreshing on `/coupons` doesn't 404).
- **Cache headers** — fingerprinted assets in `/assets/*` get 1-year immutable cache; `/sw.js` never caches.

---

## 7. Smoke Test After Deployment

After Vercel reports ✓ Ready:
1. Visit `https://your-vercel-url.vercel.app/`
2. Login with `test@perkworth.com` / `Perk@1234` / PIN `1234`.
3. Open browser DevTools → **Network** tab → confirm API calls go to your `REACT_APP_BACKEND_URL` (not localhost).
4. Try **Add Voucher** → ensures backend connectivity.
5. Try **Membership** → confirms Razorpay key loaded.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Vercel asks to pick framework | Confirm `/vercel.json` is at repo root (not inside `frontend/`). |
| Build fails: `vite: not found` | Check that buildCommand has `yarn install` before `yarn build`. |
| Blank page after deploy | Check Settings → Environment Variables → `REACT_APP_BACKEND_URL` is set, then Redeploy. |
| API calls return CORS error | Add Vercel domain to backend `CORS_ORIGINS`. |
| Refresh on subroute returns 404 | Already handled by SPA rewrite in `vercel.json`. |
