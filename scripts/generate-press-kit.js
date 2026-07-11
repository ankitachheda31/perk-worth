#!/usr/bin/env node
/**
 * PerkWorth one-page press kit generator (A4 PDF).
 *
 * Includes: feature graphic, product name + tagline, 200-word description,
 * 3 hero screenshots, key differentiator callout, pricing, contact info,
 * QR codes for perkworth.com + store pages (placeholders until stores live).
 *
 * USAGE:  cd /app && node scripts/generate-press-kit.js
 * OUTPUT: /app/store_screenshots/PerkWorth_PressKit.pdf
 */
const { chromium } = require('playwright')
const fs = require('fs'), path = require('path')

const OUT = path.resolve(__dirname, '..', 'store_screenshots', 'PerkWorth_PressKit.pdf')
const SCREENS_DIR = path.resolve(__dirname, '..', 'store_screenshots')

// Convert a local PNG to base64 data URI so the PDF renderer sees it inline.
function dataUri(rel) {
  const buf = fs.readFileSync(path.join(SCREENS_DIR, rel))
  return `data:image/png;base64,${buf.toString('base64')}`
}

// QR code as inline SVG using a lightweight qrcode-svg style — but simpler:
// build a data URL to a public QR generator API baked into the PDF at render
// time. Since we render offline, use the `qr-server.com` open API rendered
// during Playwright load.
const qrFor = (url) => `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}&color=064E3B&bgcolor=F4F1EC&format=png&qzone=1`

const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4; margin: 0; }
  html, body { width: 210mm; height: 297mm; font-family: 'Inter', system-ui, sans-serif; background: #F4F1EC; color: #0F172A; }
  body { padding: 12mm 14mm 10mm; position: relative; }

  /* Header — feature graphic */
  .hero { width: 100%; height: 42mm; border-radius: 5mm; overflow: hidden; box-shadow: 0 4mm 8mm rgba(6,78,59,0.15); position: relative; }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Product row */
  .product { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 6mm; }
  .product .name-block h1 {
    font-family: 'Playfair Display', serif;
    font-size: 36pt; line-height: 1; letter-spacing: -0.03em;
    color: #064E3B; font-weight: 900;
  }
  .product .name-block .tagline {
    font-size: 10pt; color: #64615A; margin-top: 1.5mm; letter-spacing: 0.02em;
    font-weight: 500; font-style: italic;
  }
  .product .meta {
    text-align: right; font-size: 8pt; color: #64615A; line-height: 1.5;
  }
  .product .meta strong { color: #064E3B; font-weight: 700; }

  /* Description + differentiator side by side */
  .cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 6mm; margin-top: 5mm; }

  .desc { font-size: 9.5pt; line-height: 1.55; color: #0F172A; }
  .desc p { margin-bottom: 2mm; }
  .desc p:last-child { margin-bottom: 0; }

  .differentiator {
    background: linear-gradient(135deg, #064E3B, #052E20);
    color: #F4F1EC;
    padding: 5mm; border-radius: 3mm;
    display: flex; flex-direction: column; justify-content: center;
    position: relative; overflow: hidden;
  }
  .differentiator::before {
    content: ''; position: absolute; right: -20mm; top: -20mm;
    width: 60mm; height: 60mm; border-radius: 50%;
    background: radial-gradient(circle, rgba(230,198,133,0.25), transparent 60%);
  }
  .differentiator .kicker {
    font-size: 7pt; letter-spacing: 0.2em; text-transform: uppercase;
    color: #E6C685; font-weight: 700; margin-bottom: 2mm; position: relative;
  }
  .differentiator .headline {
    font-family: 'Playfair Display', serif;
    font-size: 20pt; line-height: 1.15; font-weight: 800;
    letter-spacing: -0.02em; position: relative;
    margin-bottom: 3mm;
  }
  .differentiator .headline em { color: #E6C685; font-style: italic; }
  .differentiator .sub { font-size: 8.5pt; line-height: 1.5; color: rgba(244,241,236,0.85); position: relative; }

  /* Screenshots row */
  .screens { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 6mm; }
  .screen-card {
    background: white; border-radius: 3mm; padding: 3mm 3mm 4mm; text-align: center;
    box-shadow: 0 2mm 6mm rgba(6,78,59,0.08);
  }
  .screen-card img {
    width: 100%; border-radius: 2mm; display: block;
    aspect-ratio: 9 / 16; object-fit: cover; object-position: top;
  }
  .screen-card .caption {
    font-size: 7.5pt; font-weight: 700; color: #064E3B;
    margin-top: 2mm; letter-spacing: 0.05em; text-transform: uppercase;
  }
  .screen-card .desc-sm {
    font-size: 6.5pt; color: #64615A; margin-top: 1mm; line-height: 1.4;
  }

  /* Footer with QR codes + contact */
  .footer {
    margin-top: 5mm; padding-top: 4mm;
    border-top: 1px dashed rgba(6,78,59,0.25);
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm;
    align-items: center;
  }
  .footer-col { display: flex; align-items: center; gap: 3mm; }
  .footer-col img { width: 20mm; height: 20mm; border-radius: 1.5mm; background: white; padding: 1mm; }
  .footer-col .label { font-size: 7pt; letter-spacing: 0.1em; text-transform: uppercase; color: #64615A; font-weight: 700; }
  .footer-col .val { font-size: 8.5pt; font-weight: 700; color: #064E3B; margin-top: 0.5mm; }
  .footer-col .val small { display: block; font-weight: 500; color: #64615A; font-size: 7pt; margin-top: 0.5mm; letter-spacing: 0; }

  /* Bottom-right corner brand mark */
  .mark {
    position: absolute; bottom: 6mm; right: 14mm;
    font-family: 'Playfair Display', serif; font-size: 8pt;
    color: rgba(6,78,59,0.35); letter-spacing: 0.1em;
  }
</style>
</head>
<body>
  <div class="hero">
    <img src="${dataUri('feature_graphic_1024x500.png')}" alt="PerkWorth" />
  </div>

  <div class="product">
    <div class="name-block">
      <h1>PerkWorth</h1>
      <div class="tagline">Voucher-first personal finance for Indian households</div>
    </div>
    <div class="meta">
      <div><strong>Launch</strong> · 2026</div>
      <div><strong>Category</strong> · Finance</div>
      <div><strong>Platforms</strong> · Android · iOS · Web</div>
      <div><strong>Pricing</strong> · Free · ₹99 / 3-month Pro</div>
    </div>
  </div>

  <div class="cols">
    <div class="desc">
      <p><strong>PerkWorth is India's voucher-first personal financial assistant</strong> — built for the millions of Indian households drowning in fragmented rewards.</p>
      <p>Your Zomato ₹100 code lives in a WhatsApp screenshot folder. Your Amazon points are locked in three apps. Your HDFC cashback is buried in a statement PDF. Your Cult.Fit membership expires next week and you have no idea. PerkWorth pulls all of it into one calm, elegant wallet — so you never forget, never miss, never overpay.</p>
      <p>Beyond storage, the app calculates <em>which credit card gives you the best cashback on each specific voucher</em>, tracks membership ROI so you know if that ₹8,999 gym is paying off, and lets you selectively share individual vouchers with your spouse or parents — designed for how Indian joint families actually work.</p>
    </div>

    <div class="differentiator">
      <div class="kicker">Why we're different</div>
      <div class="headline">Voucher-first,<br>not <em>card-first.</em></div>
      <div class="sub">Every other rewards app is card-first — designed for banks, not you. We flip it. Start from a voucher you have, and only recommend a card when it beats your current option.</div>
    </div>
  </div>

  <div class="screens">
    <div class="screen-card">
      <img src="${dataUri('02_wallet.png')}" alt="Wallet" />
      <div class="caption">One wallet</div>
      <div class="desc-sm">Every voucher, membership and points balance</div>
    </div>
    <div class="screen-card">
      <img src="${dataUri('06_my_points.png')}" alt="My Points" />
      <div class="caption">Rewards ROI</div>
      <div class="desc-sm">Points value, breakdown by brand</div>
    </div>
    <div class="screen-card">
      <img src="${dataUri('05_family_circle.png')}" alt="Family Circle" />
      <div class="caption">Family Circle</div>
      <div class="desc-sm">Selective sharing with joint family</div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-col">
      <img src="${qrFor('https://www.perkworth.com')}" alt="Website QR" />
      <div>
        <div class="label">Website</div>
        <div class="val">perkworth.com<small>Product tour, download links</small></div>
      </div>
    </div>
    <div class="footer-col">
      <img src="${qrFor('mailto:press@perkworth.com')}" alt="Press QR" />
      <div>
        <div class="label">Press &amp; Media</div>
        <div class="val">press@perkworth.com<small>Interviews, review builds, assets</small></div>
      </div>
    </div>
    <div class="footer-col">
      <img src="${qrFor('mailto:support@perkworth.com')}" alt="Support QR" />
      <div>
        <div class="label">Support</div>
        <div class="val">support@perkworth.com<small>Customer help &amp; feedback</small></div>
      </div>
    </div>
  </div>

  <div class="mark">PerkWorth · Press Kit · v1.0</div>
</body>
</html>
`

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } })
  const page = await context.newPage()
  await page.setContent(HTML, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200) // let webfonts + external QR PNGs settle
  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  })
  await browser.close()

  const size = fs.statSync(OUT).size
  console.log(`✓ Press kit PDF → ${OUT}`)
  console.log(`  Size: ${(size / 1024).toFixed(1)} KB`)

  // Also produce a PNG preview so you can inspect visually before sending
  const preview = OUT.replace('.pdf', '_preview.png')
  const b2 = await chromium.launch({ headless: true })
  const c2 = await b2.newContext({ viewport: { width: 1200, height: 1697 } })
  const p2 = await c2.newPage()
  await p2.setContent(HTML, { waitUntil: 'networkidle' })
  await p2.waitForTimeout(1200)
  await p2.screenshot({ path: preview, fullPage: true, type: 'png' })
  await b2.close()
  console.log(`✓ Preview PNG → ${preview}`)
})().catch(e => { console.error('FAILED:', e); process.exit(1) })
