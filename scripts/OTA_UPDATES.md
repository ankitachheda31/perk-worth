# PerkWorth — OTA (Over-The-Air) Updates Setup

> Goal: push UI / copy / bug-fix changes to the live Android app **without rebuilding & re-uploading the APK to Play Store**. After this is set up, every `git push` → ~60 s → all your users see the new version on next app open.

## Strategy chosen: **Remote WebView via Capacitor `server.url`**

Free, no 3rd-party SDK, no MAU limits. The APK becomes a thin shell that loads your React PWA bundle from your Netlify URL. Trade-off: needs internet at startup (acceptable for a wallet app — users need it anyway to sync). Native plugin changes (e.g. `READ_SMS`) still require a one-time APK rebuild — but those are rare.

---

## Step 1 — Deploy the React PWA to its own Netlify site (one-time)

Right now `perk-worth.netlify.app` hosts only the marketing landing page. Create a second Netlify site for the React app:

```bash
# On your local Mac, in the repo root:
cd frontend
yarn build                       # produces frontend/dist/
npx netlify deploy --prod --dir=dist --site=perk-worth-app
# (first time only: it'll ask to log in + create site → name it "perk-worth-app")
```

After deploy, Netlify gives you a URL like `https://perk-worth-app.netlify.app`. (You can later point a custom subdomain like `app.perkworth.app` to this Netlify site.)

### Set up auto-deploy on push

In Netlify Dashboard → site → **Site settings → Build & deploy → Continuous deployment → Link to repo**.
- Build command: `cd frontend && yarn install --frozen-lockfile && yarn build`
- Publish directory: `frontend/dist`

From now on, **every push to `main`** → Netlify rebuilds and replaces the live bundle in ~60s.

---

## Step 2 — Wire Capacitor to load from Netlify

Edit `frontend/capacitor.config.json` — add the `server.url` block:

```json
{
  "appId": "com.perkworth.app",
  "appName": "PerkWorth",
  "webDir": "dist",
  "server": {
    "url": "https://perk-worth-app.netlify.app",
    "androidScheme": "https",
    "cleartext": false,
    "hostname": "perk-worth-app.netlify.app"
  },
  "android": { ... },
  "plugins": { ... }
}
```

Then re-sync the native project:

```bash
cd frontend
npx cap sync android
```

This rewrites `android/app/src/main/res/xml/network_security_config.xml` and tells the WebView "load https://perk-worth-app.netlify.app/ at boot".

---

## Step 3 — Rebuild APK ONE more time, then ship-once

```bash
./scripts/android_build.sh release
```

Upload the new AAB to Play Console. **This is your last manual APK upload until you change a native plugin.** From now on, every front-end change is one `git push` away from your users.

---

## Step 4 — Verify the OTA flow works

1. After uploading the new AAB and installing it on your phone, kill and reopen the app.
2. App should open straight to Netlify-hosted bundle.
3. Make a tiny UI change on your local: e.g. change a button label.
4. `git push` to main.
5. Wait 60 s for Netlify to deploy.
6. Force-close and reopen the app on your phone → **the button label is updated** ✅

That's OTA.

---

## When you DO still need a full APK rebuild

| Change | Needs new APK? |
|---|---|
| Any CSS / JSX / copy change | ❌ NO — OTA covers it |
| New backend API call | ❌ NO — OTA covers it |
| New React screen | ❌ NO — OTA covers it |
| App icon / splash | ✅ YES |
| New Capacitor plugin (camera, push notif, etc.) | ✅ YES |
| READ_SMS / native permission added | ✅ YES |
| `applicationId` / version bump | ✅ YES |
| Capacitor version upgrade | ✅ YES |

---

## Future upgrade path — Capgo Live Updates (when you cross ~5k MAU)

If you want offline-first OTA (bundle ships inside APK, plugin downloads patches in the background), upgrade to:

```bash
yarn add @capgo/capacitor-updater
```

Then sign up at https://capgo.app (free up to 1,000 MAU, ~$15/mo above that). Capgo gives you channel-based rollouts (10% → 50% → 100%) and instant rollback.

Until then, the Netlify remote-URL flow is the right choice — zero cost, zero new SDK, zero quota.

---

## Cheat sheet

```bash
# Every release going forward (after one-time setup):
git add . && git commit -m "fix: button label" && git push origin main
# Done. Wait 60s. Users see it on next open.

# When you change something native:
./scripts/android_build.sh release
# Upload new AAB to Play Console
```
