#!/usr/bin/env node
/**
 * Play Store screenshot generator — captures 6 phone screenshots at 1080×1920
 * (Google Play Store's recommended phone screenshot dimensions).
 *
 * USAGE (locally or in CI):
 *   cd /app && node scripts/capture-store-screenshots.js
 *
 * Env vars (all optional — defaults work for the reviewer account):
 *   SS_BASE_URL   — frontend URL to screenshot (default: preview URL)
 *   SS_EMAIL      — login email (default: reviewer@perkworth.com)
 *   SS_PASSWORD   — login password (default: PerkReview@2026)
 *   SS_OUT_DIR    — output directory (default: /app/store_screenshots)
 *
 * DEPENDENCIES: playwright (installed via yarn add -D playwright && npx playwright install chromium)
 *
 * OUTPUT: 6 PNG files named 01_home.png ... 06_settings.png, each 1080×1920.
 * These are submission-ready for Google Play (Console → Store listing → Phone screenshots).
 */

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE_URL = process.env.SS_BASE_URL || 'https://orbit-vouchers.preview.emergentagent.com'
const EMAIL    = process.env.SS_EMAIL    || 'reviewer@perkworth.com'
const PASSWORD = process.env.SS_PASSWORD || 'PerkReview@2026'
const OUT_DIR  = process.env.SS_OUT_DIR  || path.resolve(__dirname, '..', 'store_screenshots')

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Fetch a fresh JWT from the backend BEFORE launching the browser so we can
  // pre-seed localStorage and skip both the login screen AND the PIN keypad.
  console.log('[1/8] Fetching JWT for ' + EMAIL)
  const loginRes = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const loginJson = await loginRes.json()
  if (!loginJson.access_token) throw new Error('Login failed: ' + JSON.stringify(loginJson))
  const TOKEN = loginJson.access_token
  console.log('   ✓ token acquired (len=' + TOKEN.length + ')')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  })

  // Seed BEFORE any script runs so login + PIN + walkthrough are all skipped.
  await context.addInitScript(({ token }) => {
    localStorage.setItem('perk_orbit_token', token)
    localStorage.setItem('perk_orbit_pin', '1234')
    localStorage.setItem('perk_orbit_pin_set', '1')
    localStorage.setItem('perk_orbit_tour_done', '1')
    localStorage.setItem('perk_orbit_discovery_done', '1')
    localStorage.setItem('perk_biometric_prompt_shown', '1')
  }, { token: TOKEN })

  const page = await context.newPage()

  console.log('[2/8] Loading app with pre-seeded auth → PinLock verify screen')
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)

  // PIN is set in localStorage but `locked` is session state → must enter PIN
  // ONCE via the keypad to unlock. Same PIN as pre-seeded: 1234.
  console.log('[3/8] Unlocking with PIN 1234 (single 4-digit entry)')
  for (const d of ['1', '2', '3', '4']) {
    await page.getByRole('button', { name: d, exact: true }).first().click()
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(2500)

  const shot = async (name) => {
    const p = path.join(OUT_DIR, name)
    await page.screenshot({ path: p, fullPage: false, type: 'png' })
    console.log('   ✓ ' + name)
  }

  console.log('[5/8] Capturing 6 store screenshots…')
  // 1. HOME dashboard (membership + Ending soon)
  await shot('01_home.png')

  // 2. MY COUPONS (voucher grid — the actual wallet)
  await page.locator('[data-testid="nav-coupons"]').click()
  await page.waitForTimeout(1500)
  await shot('02_wallet.png')

  // 3. ADD VOUCHER sheet — dashed "+ Add new" chip in the coupons grid
  {
    const btn = page.locator('[data-testid="fab-add"], [data-testid^="add-voucher"], button:has-text("Add new"), button:has-text("Add new voucher"), button:has-text("Add voucher"), button:has-text("+ Add")').first()
    if (await btn.count()) {
      await btn.click()
      await page.waitForTimeout(1800)
      await shot('03_add_voucher.png')
      // Sheets close by clicking the backdrop (Escape doesn't work).
      await page.locator('[data-testid="add-sheet-backdrop"]').click({ position: { x: 20, y: 100 }, force: true })
      await page.waitForTimeout(700)
    } else {
      await shot('03_add_voucher.png')
    }
  }

  // 4. HOW TO REDEEM sheet — showcases the step-by-step guidance PerkWorth
  //    provides per-voucher (a key value prop). Best Card widget already
  //    prominent on the wallet screenshot #2.
  await page.locator('[data-testid="nav-coupons"]').click()
  await page.waitForTimeout(1500)
  {
    const howto = page.locator('[data-testid^="howto-"]').first()
    if (await howto.count()) {
      await howto.click()
      await page.waitForTimeout(1800)
    }
  }
  await shot('04_how_to_redeem.png')
  const backdrop2 = page.locator('[data-testid="add-sheet-backdrop"], .sheet-backdrop').first()
  if (await backdrop2.count()) {
    await backdrop2.click({ position: { x: 20, y: 100 }, force: true })
    await page.waitForTimeout(600)
  }

  // 5. CIRCLE (Family Circle)
  await page.locator('[data-testid="nav-circle"]').click()
  await page.waitForTimeout(1500)
  await shot('05_family_circle.png')

  // 6. MY POINTS (ROI dashboard)
  await page.locator('[data-testid="nav-points"]').click()
  await page.waitForTimeout(1500)
  await shot('06_my_points.png')

  console.log(`[6/8] Screenshots saved to: ${OUT_DIR}`)
  console.log('[7/8] Verifying dimensions…')
  const png = fs.readFileSync(path.join(OUT_DIR, '01_home.png'))
  // PNG header: width is bytes 16-19, height bytes 20-23 (big-endian uint32)
  const w = png.readUInt32BE(16)
  const h = png.readUInt32BE(20)
  console.log(`   01_home.png actual dimensions: ${w}×${h}`)
  if (w !== 1080 || h !== 1920) console.warn(`   ⚠ expected 1080×1920, got ${w}×${h}`)

  console.log('[8/8] Done. Upload these to Google Play Console → Store listing → Graphic assets → Phone screenshots.')
  await browser.close()
}

run().catch(e => { console.error('FAILED:', e); process.exit(1) })
