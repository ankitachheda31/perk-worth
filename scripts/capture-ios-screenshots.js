#!/usr/bin/env node
/**
 * iOS App Store screenshot generator — captures 6 screenshots at each of
 * the 3 REQUIRED iPhone display sizes that Apple demands:
 *
 *   • 6.9"  (1320 × 2868) — iPhone 15/16 Pro Max — REQUIRED as of Feb 2024
 *   • 6.5"  (1242 × 2688) — iPhone 14 Plus / 11 Pro Max — REQUIRED
 *   • 5.5"  (1242 × 2208) — iPhone 8 Plus  — REQUIRED for older device compat
 *   • 12.9" iPad Pro (2048 × 2732) — REQUIRED if you enable iPad support
 *
 * USAGE:  cd /app && node scripts/capture-ios-screenshots.js
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')

const BASE_URL = process.env.SS_BASE_URL || 'https://orbit-vouchers.preview.emergentagent.com'
const EMAIL    = process.env.SS_EMAIL    || 'reviewer@perkworth.com'
const PASSWORD = process.env.SS_PASSWORD || 'PerkReview@2026'
const ROOT_OUT = path.resolve(__dirname, '..', 'store_screenshots')

const DIMS = [
  { label: '6.9in',  dir: 'ios_6_9in',    w: 1320, h: 2868 },
  { label: '6.5in',  dir: 'ios_6_5in',    w: 1242, h: 2688 },
  { label: '5.5in',  dir: 'ios_5_5in',    w: 1242, h: 2208 },
  { label: 'iPad',   dir: 'ios_ipad_129', w: 2048, h: 2732 },
]

async function captureAt(size, token) {
  const outDir = path.join(ROOT_OUT, size.dir); fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: 1,
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1`,
  })
  await context.addInitScript(({ token }) => {
    localStorage.setItem('perk_orbit_token', token)
    localStorage.setItem('perk_orbit_pin', '1234')
    localStorage.setItem('perk_orbit_pin_set', '1')
    localStorage.setItem('perk_orbit_tour_done', '1')
    localStorage.setItem('perk_orbit_discovery_done', '1')
    localStorage.setItem('perk_biometric_prompt_shown', '1')
  }, { token })

  const page = await context.newPage()
  console.log(`[${size.label}] loading…`)
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(2000)
  for (const d of ['1','2','3','4']) {
    await page.getByRole('button', { name: d, exact: true }).first().click()
    await page.waitForTimeout(180)
  }
  await page.waitForTimeout(2200)

  const shot = async (name) => {
    await page.screenshot({ path: path.join(outDir, name), fullPage: false, type: 'png' })
    console.log(`  ✓ ${size.label}/${name}`)
  }

  await shot('01_home.png')
  await page.locator('[data-testid="nav-coupons"]').click(); await page.waitForTimeout(1500)
  await shot('02_wallet.png')

  const addBtn = page.locator('[data-testid="fab-add"], button:has-text("Add new"), button:has-text("+ Add")').first()
  if (await addBtn.count()) {
    await addBtn.click(); await page.waitForTimeout(1600); await shot('03_add_voucher.png')
    const bp = page.locator('[data-testid="add-sheet-backdrop"], .sheet-backdrop').first()
    if (await bp.count()) { await bp.click({ position: { x: 20, y: 100 }, force: true }); await page.waitForTimeout(500) }
  } else { await shot('03_add_voucher.png') }

  await page.locator('[data-testid="nav-coupons"]').click(); await page.waitForTimeout(1000)
  const howto = page.locator('[data-testid^="howto-"]').first()
  if (await howto.count()) { await howto.click(); await page.waitForTimeout(1700) }
  await shot('04_how_to_redeem.png')
  const bp2 = page.locator('[data-testid="add-sheet-backdrop"], .sheet-backdrop').first()
  if (await bp2.count()) { await bp2.click({ position: { x: 20, y: 100 }, force: true }); await page.waitForTimeout(500) }

  await page.locator('[data-testid="nav-circle"]').click(); await page.waitForTimeout(1500)
  await shot('05_family_circle.png')

  await page.locator('[data-testid="nav-points"]').click(); await page.waitForTimeout(1500)
  await shot('06_my_points.png')

  await browser.close()
}

;(async () => {
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const { access_token } = await res.json()
  if (!access_token) throw new Error('login failed')
  for (const size of DIMS) await captureAt(size, access_token)
  console.log('\n=== iOS screenshots done ===')
  for (const size of DIMS) {
    const n = fs.readdirSync(path.join(ROOT_OUT, size.dir)).length
    console.log(`  ${size.dir}: ${n} PNGs @ ${size.w}×${size.h}`)
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
