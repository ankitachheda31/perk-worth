# Perk Orbit — Zero-Break Build Health System

A mandatory automated health check that runs after every code change to enforce
the **Zero-Break policy**. Validates routes, screens, API endpoints, MongoDB
connectivity, CORS, and authentication flow.

## Usage

```bash
# Human-readable report (run after any code change)
python3 /app/scripts/health_check.py

# Machine-readable JSON (for CI / regression dashboards)
python3 /app/scripts/health_check.py --json > /app/test_reports/health_$(date +%s).json

# Custom backend URL (e.g., production)
python3 /app/scripts/health_check.py --api-url https://api.perkorbit.app
```

Exit code is **0** if healthy, **1** if any check fails — safe to chain into
deploy gates (`python3 health_check.py && deploy.sh`).

## What it verifies (6 stages)

| Stage | What | Failure means |
|---|---|---|
| **1. Backend connectivity** | FastAPI reachable + CORS preflight | App can't reach API at all |
| **2. Auth + Mongo smoke** | Real signup → /me → wipe → re-/me=401 | Auth or DB write/delete broken |
| **3. API route smoke** | 13 production endpoints respond 200 | A specific endpoint is broken |
| **4. Route ↔ screen integrity** | Every `push('xxx')` has a render handler; every screen import file exists | Dead route — blank screen risk |
| **5. Frontend boot** | `GET /` serves the SPA shell | Build pipeline broken |
| **6. Core module reachability** | All 13 core modules (Home, Coupons, Points, Circle, Profile, Membership, Perk Tips, Settings, Privacy, FAQ, Privacy Control, SMS Scanner, Support) have render handlers | Module dropped from router |

## Self-healing checks

The script will **automatically detect**:

- A route that's been added to `push('xxx')` but has no matching `current.screen === 'xxx'` handler → flagged as **missing handler** (blank screen risk).
- A `current.screen === 'xxx'` handler whose route is never pushed → flagged as **orphan**.
- An imported screen file (`from './screens/Foo'`) that doesn't exist on disk → flagged immediately.

If any of these appear, **roll back** the offending commit and re-run.

## Sample output (healthy)

```
PERK ORBIT · BUILD HEALTH REPORT

── 1. Backend connectivity ──
✓ FastAPI alive · https://...preview.emergentagent.com → 200
✓ CORS preflight OK (Allow-Origin: *)

── 2. Auth flow & MongoDB write/read/delete ──
✓ POST /api/auth/signup → 200 · uid=6a3283be…
✓ GET  /api/auth/me     → 200
✓ POST /api/auth/wipe   → 200
✓ erasure verified · /me after wipe → 401 (expected 401)

── 6. Core module reachability ──
✓ Home                    → /home
✓ My Coupons              → /coupons
✓ My Points               → /points
✓ Family Circle           → /circle
✓ Profile                 → /profile
✓ Membership              → /membership
✓ Perk Tips · Masterclass → /perk-tips
✓ Settings                → /settings
✓ Privacy Policy          → /privacy
✓ Security FAQ            → /faq
✓ Privacy Control         → /privacy-control
✓ SMS Auto-Scanner        → /sms-scanner
✓ Support History         → /support

── BUILD HEALTH ──
Status: HEALTHY  ·  12/12 checks passed
```

## Adding new routes — Zero-Break checklist

When you add a new screen / API:

1. Add the file: `frontend/src/screens/NewScreen.jsx`
2. Import it: `import NewScreen from './screens/NewScreen'`
3. Handle navigation: `if (where === 'new-route') push('new-route')`
4. Add the render guard: `{current.screen === 'new-route' && <NewScreen ... />}`
5. **Run `python3 /app/scripts/health_check.py`** — exit code must be 0 before
   you `finish` the task.

## CI integration (recommended)

Add to deploy pipeline:

```yaml
- name: Build Health Check
  run: |
    sudo supervisorctl restart backend
    sleep 4
    python3 /app/scripts/health_check.py
```

A non-zero exit code blocks deploy.
