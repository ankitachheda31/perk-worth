# Node version policy for PerkWorth frontend

This project targets **Node 20 LTS** (currently 20.18.1). Vite 5.x — which we use for the React + Capacitor build pipeline — officially supports Node 18, 20, and 22. **Node 23 and 24 are NOT supported** and cause the well-known Rollup native-binary error:

```
Error: Cannot find module @rollup/rollup-win32-x64-msvc (or similar platform suffix)
```

## How to use the right Node version

### Option 1 — nvm (recommended for Mac/Linux)

```bash
nvm install              # reads .nvmrc automatically
nvm use
node --version           # → v20.18.1
```

### Option 2 — nvm-windows (Windows)

```powershell
nvm install 20.18.1
nvm use 20.18.1
node --version
```

### Option 3 — Volta (cross-platform)

```bash
volta install node@20
```

### Option 4 — Manual install

Download Node 20 LTS from https://nodejs.org/dist/v20.18.1/

## If you still see the Rollup native-binary error

Even on a supported Node version, npm/yarn occasionally fails to install Rollup's platform-specific optional dep. Nuclear reset:

```bash
# Mac/Linux
rm -rf node_modules yarn.lock
yarn install --network-timeout 600000

# Windows PowerShell
Remove-Item -Recurse -Force node_modules
Remove-Item yarn.lock
yarn install --network-timeout 600000
```

After this, `yarn build` should succeed. Then proceed with the Android APK steps in `BIOMETRIC_TEST_PLAN.md`.

## Verifying your setup

```bash
node --version              # must be v20.x.x or v22.x.x
yarn --version              # must be 1.22.x
yarn build                  # should produce dist/ with no errors
npx cap sync android        # should populate android/ with the new biometric plugin
```
