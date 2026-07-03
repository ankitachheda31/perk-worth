# PerkWorth — Backend URL Configuration

## The one place where the raw preview URL lives

**`frontend/.env`** contains the `REACT_APP_BACKEND_URL` — that's the Emergent-provisioned preview URL for the FastAPI backend. It's the *only* place the raw hostname appears in the source tree; everywhere else references the env var.

```
frontend/.env
  REACT_APP_BACKEND_URL=<Emergent-provisioned preview URL>
```

## Why the URL contains "orbit-vouchers"

`orbit-vouchers` is the container slug that Emergent's Kubernetes ingress assigned to this dev container when it was provisioned. It's a platform-controlled DNS name — not the project name — and it can't be renamed by the developer. The project itself is called **`perk-worth`** (see `package.json`), and everywhere in code / docs / scripts you'll see `perk-worth` (the project) referenced via `$REACT_APP_BACKEND_URL` (the URL env var).

## How each layer picks up the URL

| Layer | Source of truth | Fallback |
|---|---|---|
| Frontend runtime (browser / Capacitor WebView) | `import.meta.env.VITE_BACKEND_URL` — baked in by `vite build` from `frontend/.env` | `process.env.REACT_APP_BACKEND_URL` |
| Backend pytest suite | `os.environ["REACT_APP_BACKEND_URL"]` — set by the dev container | `http://localhost:8001` (for local runs) |
| Build script preflight | `$VITE_BACKEND_URL` → `$REACT_APP_BACKEND_URL` → parses `frontend/.env` | Refuses to build if unset — see `scripts/build-android-apk.sh` |
| Android APK web assets | Baked into `frontend/dist/**/*.js` at `vite build` time. Copied into `android/app/src/main/assets/public/` by `npx cap sync android` (or manually staged in `/app/android/app/src/main/assets/public/`) | N/A — this is compile-time |

## When to change the URL

- **Dev/preview** — never change `frontend/.env` by hand; it's set by the Emergent platform.
- **Production launch** — deploy the FastAPI backend to a URL you control (e.g. `api.perkworth.app` on Railway/Render/Fly.io), then update `REACT_APP_BACKEND_URL` in both `frontend/.env` AND your Vercel/Netlify env config. See `VERCEL_DEPLOYMENT.md`.

## Verifying the URL baked into an APK

After building, this one-liner tells you exactly what URL the phone will call:

```bash
grep -oE '"https?://[^"]+"' frontend/dist/assets/index-*.js | grep -i preview | head -1
```

Should print your backend URL exactly once. If it prints `undefined` or an unexpected value, the build didn't pick up your env — rebuild with `VITE_BACKEND_URL=<url> yarn build`.
