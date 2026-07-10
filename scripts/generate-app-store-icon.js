#!/usr/bin/env node
/**
 * App Store icon generator — 1024×1024 PNG (no rounded corners, no alpha,
 * no transparency — Apple applies rounding at rendering time).
 *
 * USAGE:  cd /app && node scripts/generate-app-store-icon.js
 * OUTPUT: /app/store_screenshots/app_store_icon_1024x1024.png
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')

const OUT = path.resolve(__dirname, '..', 'store_screenshots', 'app_store_icon_1024x1024.png')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const HTML = `
<!DOCTYPE html>
<html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1024px; height: 1024px; overflow: hidden; }
  .icon {
    width: 1024px; height: 1024px;
    background: linear-gradient(140deg, #064E3B 0%, #052E20 50%, #041F16 100%);
    position: relative; display: flex; align-items: center; justify-content: center;
  }
  /* Gold coin motif behind letter */
  .icon::before {
    content: ''; position: absolute;
    width: 620px; height: 620px; border-radius: 50%;
    background: radial-gradient(circle at 32% 32%, rgba(230,198,133,0.55), rgba(180,139,54,0.28) 50%, transparent 78%);
    filter: blur(4px);
  }
  /* Subtle grain — depth */
  .icon::after {
    content: ''; position: absolute; inset: 0;
    background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0 3px, transparent 3px 6px);
    pointer-events: none;
  }
  .glyph {
    font-family: 'Playfair Display', serif;
    font-size: 640px; line-height: 1;
    color: #F4F1EC; font-weight: 900; letter-spacing: -0.05em;
    text-shadow: 0 12px 30px rgba(0,0,0,0.55);
    position: relative; z-index: 1;
    padding-bottom: 40px;
  }
  .glyph .p { color: #F4F1EC; }
  .glyph .w {
    color: #E6C685;
    font-style: italic;
    font-size: 560px;
    margin-left: -60px;
    position: relative; top: 40px;
  }
</style></head>
<body>
  <div class="icon">
    <div class="glyph"><span class="p">P</span><span class="w">w</span></div>
  </div>
</body></html>
`

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.setContent(HTML, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: OUT, type: 'png', clip: { x: 0, y: 0, width: 1024, height: 1024 }, omitBackground: false })
  await browser.close()
  const buf = fs.readFileSync(OUT)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  console.log(`✓ App Store icon → ${OUT}`)
  console.log(`  ${w}×${h}, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB`)
})()
