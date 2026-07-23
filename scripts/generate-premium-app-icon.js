#!/usr/bin/env node
/**
 * PerkWorth — Premium App Icon (CRED / OneCard inspired)
 *
 * Design language:
 *   - Obsidian black with a whisper of emerald undertone (brand continuity)
 *   - Brushed-metal gold "P" monogram (Cabinet Grotesk 800, tightened kerning)
 *   - Radial spotlight vignette + fine grain for tactile depth
 *   - 4 corner embosses (OneCard's signature tactile detail)
 *   - Zero clutter. Zero cliches. Reads at 48px.
 *
 * USAGE:  cd /app && node scripts/generate-premium-app-icon.js
 * OUTPUTS:
 *   store_screenshots/app_store_icon_1024x1024.png     (Apple, no alpha)
 *   store_screenshots/play_store_icon_512x512.png      (Play Console listing)
 *   store_screenshots/adaptive_foreground_432x432.png  (Android mipmap-anydpi)
 *   store_screenshots/adaptive_background_432x432.png  (Android mipmap-anydpi)
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')

const OUT_DIR = path.resolve(__dirname, '..', 'store_screenshots')
fs.mkdirSync(OUT_DIR, { recursive: true })

// Icon markup — single component parameterised by size so all outputs are pixel-perfect.
const iconHtml = (size, { adaptive = false } = {}) => `
<!DOCTYPE html>
<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@800&family=Playfair+Display:wght@900&display=block" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${size}px; height: ${size}px; overflow: hidden;
    background: transparent;
  }
  .card {
    width: ${size}px; height: ${size}px;
    position: relative;
    /* Deep obsidian gradient with emerald undertone — no pure black (looks dead), no pure emerald (looks generic) */
    background:
      radial-gradient(ellipse at 32% 28%, #1B2622 0%, #0E1512 42%, #050807 100%);
    ${adaptive ? '' : 'overflow: hidden;'}
    display: flex; align-items: center; justify-content: center;
  }
  /* Faint inner light source — top-left spotlight for premium 3D card feel */
  .card::before {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at 28% 22%,
      rgba(255, 228, 168, 0.10) 0%,
      rgba(255, 228, 168, 0.03) 22%,
      transparent 55%);
    pointer-events: none;
  }
  /* Fine grain overlay for tactile "brushed metal" surface */
  .card::after {
    content: ''; position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(115deg, rgba(255,255,255,0.014) 0 1px, transparent 1px 2px),
      repeating-linear-gradient(25deg,  rgba(0,0,0,0.02)      0 1px, transparent 1px 3px);
    pointer-events: none;
    mix-blend-mode: overlay;
  }
  /* The monogram — the entire brand rides on this shape.
     Playfair Display 900 (heritage serif) gives PerkWorth a "private banking /
     old-money" feel that stands out from every purple-gradient fintech clone.
     Cabinet Grotesk kept as fallback for pure modernist variant. */
  .p {
    font-family: 'Playfair Display', 'Cabinet Grotesk', Georgia, serif;
    font-weight: 900;
    font-size: ${size * 0.76}px;
    line-height: 0.85;
    letter-spacing: -0.02em;
    /* Warm-cool gold gradient — mimics engraved brass. NOT yellow. */
    background: linear-gradient(155deg,
      #F5DE9F 0%,
      #E8C67A 22%,
      #C7A45C 55%,
      #A67D3E 82%,
      #C7A45C 100%);
    -webkit-background-clip: text;
            background-clip: text;
    color: transparent;
    /* Bevel: crisp inner highlight + deep drop for embossed metal illusion */
    filter:
      drop-shadow(0 ${size * 0.008}px 0 rgba(255, 232, 176, 0.28))   /* top highlight */
      drop-shadow(0 ${size * 0.02}px ${size * 0.03}px rgba(0,0,0,0.65)); /* deep shadow */
    position: relative; z-index: 2;
    padding-bottom: ${size * 0.03}px;
    user-select: none;
  }
  /* Hairline gold underline anchor — 60% width, 2px, centered.
     Same trick CRED uses to anchor the wordmark against the card frame. */
  .underline {
    position: absolute;
    bottom: ${size * 0.185}px;
    left: 50%; transform: translateX(-50%);
    width: ${size * 0.20}px;
    height: ${size * 0.006}px;
    background: linear-gradient(90deg,
      transparent 0%,
      rgba(199, 164, 92, 0.35) 20%,
      rgba(245, 222, 159, 0.75) 50%,
      rgba(199, 164, 92, 0.35) 80%,
      transparent 100%);
    border-radius: 999px;
    z-index: 2;
  }
  /* Four tiny corner embosses — OneCard's tactile signature. Reads as "premium object". */
  .corner {
    position: absolute;
    width: ${size * 0.008}px; height: ${size * 0.008}px;
    border-radius: 50%;
    background: rgba(199, 164, 92, 0.35);
    box-shadow:
      inset 0 0 ${size * 0.003}px rgba(0,0,0,0.6),
      0 0 ${size * 0.008}px rgba(245, 222, 159, 0.10);
  }
  .corner.tl { top: ${size * 0.08}px; left: ${size * 0.08}px; }
  .corner.tr { top: ${size * 0.08}px; right: ${size * 0.08}px; }
  .corner.bl { bottom: ${size * 0.08}px; left: ${size * 0.08}px; }
  .corner.br { bottom: ${size * 0.08}px; right: ${size * 0.08}px; }
</style></head>
<body>
  <div class="card">
    <div class="corner tl"></div>
    <div class="corner tr"></div>
    <div class="corner bl"></div>
    <div class="corner br"></div>
    <div class="p">P</div>
    <div class="underline"></div>
  </div>
</body></html>
`

// Solid background version (for Android adaptive icon "background layer")
const backgroundHtml = (size) => `
<!DOCTYPE html>
<html><head>
<style>
  * { margin:0; padding:0; }
  html, body { width:${size}px; height:${size}px; overflow:hidden; }
  .bg {
    width:${size}px; height:${size}px;
    background: radial-gradient(ellipse at 32% 28%, #1B2622 0%, #0E1512 42%, #050807 100%);
  }
</style></head>
<body><div class="bg"></div></body></html>
`

// Foreground only (transparent surrounding — used with adaptive_background as the Android launcher icon)
const foregroundHtml = (size) => `
<!DOCTYPE html>
<html><head>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${size}px; height:${size}px; overflow:hidden; background:transparent; }
  .fg { width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center; position:relative; }
  .p {
    font-family: 'Playfair Display', 'Cabinet Grotesk', Georgia, serif;
    font-weight: 900;
    font-size: ${size * 0.66}px;
    line-height: 0.85;
    letter-spacing: -0.02em;
    background: linear-gradient(155deg, #F5DE9F 0%, #E8C67A 22%, #C7A45C 55%, #A67D3E 82%, #C7A45C 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 ${size * 0.008}px 0 rgba(255, 232, 176, 0.28))
            drop-shadow(0 ${size * 0.02}px ${size * 0.03}px rgba(0,0,0,0.65));
    padding-bottom: ${size * 0.03}px;
  }
</style></head>
<body><div class="fg"><div class="p">P</div></div></body></html>
`

async function renderIcon(html, size, outputPath, { omitBackground = false } = {}) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  // Wait for webfonts to actually finish loading before screenshot — otherwise
  // Chromium renders the fallback serif and the monogram loses its brand feel.
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: outputPath, type: 'png', clip: { x: 0, y: 0, width: size, height: size }, omitBackground })
  await browser.close()
  const buf = fs.readFileSync(outputPath)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  console.log(`✓ ${path.basename(outputPath).padEnd(38)} ${w}×${h}  ${(fs.statSync(outputPath).size/1024).toFixed(1)} KB`)
}

;(async () => {
  console.log('Generating PerkWorth premium icons…\n')
  // Apple App Store — 1024×1024, no alpha, no rounded corners (Apple rounds at render)
  await renderIcon(iconHtml(1024), 1024, path.join(OUT_DIR, 'app_store_icon_1024x1024.png'))
  // Google Play Store — 512×512 hi-res listing icon
  await renderIcon(iconHtml(512), 512, path.join(OUT_DIR, 'play_store_icon_512x512.png'))
  // Android adaptive icon foreground — 432×432 with transparent surround
  await renderIcon(foregroundHtml(432), 432, path.join(OUT_DIR, 'adaptive_foreground_432x432.png'), { omitBackground: true })
  // Android adaptive icon background — 432×432 solid gradient
  await renderIcon(backgroundHtml(432), 432, path.join(OUT_DIR, 'adaptive_background_432x432.png'))
  console.log('\nAll icons written to store_screenshots/.')
  console.log('Next: preview them by opening the PNGs. If happy, upload to Play + App Store.')
})()
