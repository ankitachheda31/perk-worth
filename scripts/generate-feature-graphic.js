#!/usr/bin/env node
/**
 * Play Store Feature Graphic generator — 1024×500 PNG, brand-consistent.
 * Feature Graphic appears at the TOP of your Play Store listing.
 *
 * USAGE:  cd /app && node scripts/generate-feature-graphic.js
 * OUTPUT: /app/store_screenshots/feature_graphic_1024x500.png
 */
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '..', 'store_screenshots', 'feature_graphic_1024x500.png')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

// Inline HTML — no external assets needed. Colors match PerkWorth brand
// (dark emerald + cream + gold), font uses system serif for the ligature-heavy
// wordmark and sans-serif for the tagline.
const HTML = `
<!DOCTYPE html>
<html>
<head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@800&family=Inter:wght@500;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1024px; height: 500px;
    background: linear-gradient(135deg, #064E3B 0%, #052E20 100%);
    display: flex; align-items: center; padding: 0 72px;
    color: #F4F1EC;
    font-family: 'Inter', system-ui, sans-serif;
    position: relative; overflow: hidden;
  }
  /* Subtle diagonal grain — depth without distraction */
  body::before {
    content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 2px, transparent 2px 4px);
    pointer-events: none;
  }
  /* Big gold coin motif — subtle, off to the right */
  body::after {
    content: ''; position: absolute;
    right: -80px; bottom: -80px;
    width: 480px; height: 480px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, rgba(180,139,54,0.28), rgba(180,139,54,0.08) 60%, transparent 80%);
    filter: blur(4px);
  }
  .left { flex: 1; z-index: 1; }
  .badge {
    display: inline-block;
    background: rgba(180,139,54,0.18);
    border: 1px solid rgba(180,139,54,0.55);
    color: #E6C685;
    padding: 6px 14px; border-radius: 999px;
    font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    margin-bottom: 22px;
  }
  h1 {
    font-family: 'Playfair Display', serif;
    font-size: 68px; line-height: 1.02; letter-spacing: -0.02em;
    color: #F4F1EC; margin-bottom: 16px;
  }
  h1 .accent { color: #E6C685; font-style: italic; }
  p {
    font-size: 20px; font-weight: 500; line-height: 1.35;
    color: rgba(244,241,236,0.82); max-width: 560px;
    margin-bottom: 24px;
  }
  .chips { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.14);
    padding: 6px 14px; border-radius: 999px;
    font-size: 13px; font-weight: 600; color: #F4F1EC;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .chip::before { content: '●'; color: #E6C685; font-size: 9px; }
  .right { z-index: 1; position: relative; margin-left: 40px; }
  .phone {
    width: 260px; height: 460px;
    background: linear-gradient(180deg, #0A0A0A 0%, #1a1a1a 100%);
    border-radius: 36px; padding: 12px;
    box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 0 0 2px #333;
    transform: rotate(6deg);
  }
  .screen {
    width: 100%; height: 100%;
    border-radius: 26px; overflow: hidden;
    background: #F4F1EC;
    display: flex; flex-direction: column;
  }
  .status-bar {
    height: 24px; display: flex; align-items: center; justify-content: space-between;
    padding: 0 14px; font-size: 10px; font-weight: 700; color: #0F172A;
  }
  .app-head {
    padding: 14px 16px 8px; border-bottom: 1px solid #E5E1D6;
  }
  .app-head .title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 800; color: #064E3B; letter-spacing: -0.02em; }
  .app-head .sub { font-size: 10px; color: #64615A; margin-top: 3px; letter-spacing: 0.05em; }
  .voucher {
    margin: 8px 12px; padding: 10px 12px;
    background: white; border-radius: 12px;
    border: 1px solid #E5E1D6;
    display: flex; flex-direction: column; gap: 4px;
  }
  .voucher .brand { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 800; color: #0F172A; }
  .voucher .off { font-size: 11px; color: #0F172A; font-weight: 600; }
  .voucher .stack { font-size: 9px; color: #064E3B; background: #ECFDF5; padding: 3px 6px; border-radius: 6px; font-weight: 700; align-self: flex-start; letter-spacing: 0.03em; }
</style>
</head>
<body>
  <div class="left">
    <div class="badge">Voucher-first · India</div>
    <h1>All your <span class="accent">perks</span>,<br>one wallet.</h1>
    <p>Vouchers, points, memberships and best-card cashback stacking — beautifully in one place.</p>
    <div class="chips">
      <span class="chip">Auto-import OCR/SMS</span>
      <span class="chip">Family Circle</span>
      <span class="chip">₹99/quarter</span>
    </div>
  </div>
  <div class="right">
    <div class="phone">
      <div class="screen">
        <div class="status-bar"><span>9:41</span><span>●●●●</span></div>
        <div class="app-head">
          <div class="title">PerkWorth</div>
          <div class="sub">MY COUPONS · 7 ACTIVE</div>
        </div>
        <div class="voucher">
          <div class="brand">Zomato</div>
          <div class="off">₹100 off · orders ₹499+</div>
          <span class="stack">+ 5% HDFC · Stack ₹115</span>
        </div>
        <div class="voucher">
          <div class="brand">Amazon</div>
          <div class="off">₹200 Great Indian Sale</div>
          <span class="stack">+ 3% SBI · Stack ₹230</span>
        </div>
        <div class="voucher">
          <div class="brand">Myntra</div>
          <div class="off">₹300 off fashion</div>
          <span class="stack">+ 5% Millennia · Stack ₹315</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1024, height: 500 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await page.setContent(HTML, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600) // let fonts settle
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: 1024, height: 500 } })
  await browser.close()

  const stat = fs.statSync(OUT)
  const buf = fs.readFileSync(OUT)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  console.log(`✓ Feature graphic → ${OUT}`)
  console.log(`  Dimensions: ${w}×${h} (Play Store requires exactly 1024×500)`)
  console.log(`  Size: ${(stat.size / 1024).toFixed(1)} KB (limit 15MB)`)
})()
