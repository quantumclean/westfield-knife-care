// Shared print-flyer layout. Mirrors apps/web's design tokens
// (packages/ui/src/styles.css) and reuses the same hero illustration and
// icon set as the landing page, so the flyer and the page someone lands on
// after scanning it look like the same product.

const ICONS = {
  truck:
    "M3 7h10v8H3zM13 10h4l3 3v2h-7zM6 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm11 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  knife: "M4 20l8-8m0 0l7.5-7.5c1.5-1.5 3 0 2 2L13 15l-1-3z",
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
};

function icon(name, size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
}

/** Small house-and-tree mark, standing in for the Westfield Knife Care logo. */
function logoMark() {
  return `<svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M4 26l9-8 9 8v9H4z" fill="#1f4d34"/>
    <path d="M4 26l9-8 9 8" stroke="#1f4d34" stroke-width="1.5" fill="none"/>
    <circle cx="30" cy="14" r="6" fill="#8fbf5f"/>
    <rect x="29" y="18" width="2" height="6" fill="#5c6360"/>
    <circle cx="22" cy="10" r="4.5" fill="#8fbf5f"/>
    <rect x="21.2" y="13.5" width="1.6" height="5" fill="#5c6360"/>
  </svg>`;
}

export function renderFlyer(flyer, { heroSvg, qrSvg, baseUrl }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Westfield Knife Care — Flyer ${flyer.id.toUpperCase()}</title>
<style>
  @page { size: Letter; margin: 0; }
  :root {
    --color-primary: #1f4d34;
    --color-primary-dark: #163a27;
    --color-accent: #8fbf5f;
    --color-cream: #f3f0e6;
    --color-text: #1a1d1b;
    --color-muted: #5c6360;
    --color-border: #e3e6e2;
    --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 8.5in;
    height: 11in;
    font-family: var(--font);
    color: var(--color-text);
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page { width: 8.5in; height: 11in; padding: 0.55in 0.6in; display: flex; flex-direction: column; }
  .eyebrow {
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--color-muted); margin: 0 0 10px;
  }
  .logo-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .wordmark { font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; font-size: 15px; line-height: 1.1; }
  .wordmark span { display: block; font-size: 9px; font-weight: 600; color: var(--color-muted); letter-spacing: 0.18em; }
  .badge {
    border: 2px solid var(--color-primary); border-radius: 999px; width: 108px; height: 108px;
    display: flex; align-items: center; justify-content: center; text-align: center;
    font-size: 10px; font-weight: 800; letter-spacing: 0.02em; line-height: 1.35; color: var(--color-primary);
    padding: 6px; flex-shrink: 0;
  }
  h1 {
    font-size: 46px; font-weight: 800; line-height: 1.04; margin: 0 0 14px; letter-spacing: -0.01em;
  }
  h1 .hl { color: var(--color-accent); }
  .subhead { font-size: 18px; color: var(--color-muted); margin: 0 0 22px; max-width: 5in; }
  .hero-wrap { border-radius: 18px; overflow: hidden; margin-bottom: 26px; box-shadow: 0 10px 26px rgba(20,40,30,0.18); height: 2.5in; }
  .hero-wrap svg { display: block; width: 100%; height: 100%; }
  .steps { display: flex; gap: 18px; margin-bottom: 26px; }
  .step { flex: 1; text-align: center; }
  .step-num {
    display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border-radius: 50%; background: var(--color-primary); color: #fff; font-weight: 700; font-size: 13px; margin-bottom: 6px;
  }
  .step-icon { display: block; margin: 0 auto 4px; color: var(--color-text); }
  .step h3 { font-size: 14px; margin: 0 0 2px; font-weight: 700; }
  .step p { font-size: 11.5px; color: var(--color-muted); margin: 0; }
  .ctas { display: flex; gap: 16px; margin-bottom: auto; }
  .cta { flex: 1; border-radius: 14px; padding: 18px 20px; }
  .cta-primary { background: var(--color-primary); color: #fff; }
  .cta-secondary { background: var(--color-cream); border: 1px solid var(--color-border); }
  .cta-title { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
  .cta-price { font-size: 26px; font-weight: 800; }
  .cta-sub { font-size: 12.5px; margin: 2px 0 0; }
  .cta-primary .cta-sub { color: rgba(255,255,255,0.85); }
  .cta-secondary .cta-sub { color: var(--color-muted); }
  .footer {
    display: flex; align-items: center; justify-content: space-between; gap: 20px;
    border-top: 1px solid var(--color-border); padding-top: 22px; margin-top: 22px;
  }
  .qr-block { display: flex; align-items: center; gap: 16px; }
  .qr-block .qr { width: 108px; height: 108px; background: #fff; }
  .qr-copy p { margin: 0; }
  .scan-label { font-size: 13px; font-weight: 800; color: var(--color-primary); margin-bottom: 2px !important; }
  .url { font-size: 15px; font-weight: 700; }
  .turnaround { font-size: 11.5px; color: var(--color-muted); margin-top: 2px !important; }
  .brand-block { text-align: right; }
  .tagline { font-size: 11px; color: var(--color-muted); margin: 4px 0 0; }
  .brand-mark { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
  .brand-name { font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; font-size: 12px; text-align: left; }
  .brand-name span { display: block; font-size: 8px; font-weight: 600; color: var(--color-muted); letter-spacing: 0.14em; }
  .print-hint { display: none; }
  @media screen {
    body { background: #ddd; padding: 24px 0; height: auto; }
    .page { margin: 0 auto; box-shadow: 0 8px 30px rgba(0,0,0,0.25); }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="logo-row">
      <div class="wordmark">Westfield<span>Knife Care</span></div>
      <div class="badge">SHARPER<br/>SAFER<br/>MORE JOY IN COOKING</div>
    </div>

    <p class="eyebrow">Local Pickup &bull; Professional Sharpening &bull; Fast Return</p>
    <h1>${flyer.headline} <span class="hl">${flyer.headlineHighlight}</span> ${flyer.headlineRest}</h1>
    <p class="subhead">${flyer.subhead}</p>

    <div class="hero-wrap">${heroSvg}</div>

    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <span class="step-icon">${icon("truck")}</span>
        <h3>We Pick Up</h3>
        <p>Schedule a pickup at your home or office in Westfield.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <span class="step-icon">${icon("knife")}</span>
        <h3>We Sharpen</h3>
        <p>Professional sharpening by hand or precision equipment.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <span class="step-icon">${icon("home")}</span>
        <h3>We Return</h3>
        <p>${flyer.turnaround}</p>
      </div>
    </div>

    <div class="ctas">
      <div class="cta cta-primary">
        <p class="cta-title">Sharpen My Knives</p>
        <p class="cta-price">${flyer.price} <span style="font-size:15px;font-weight:600;">${flyer.priceDetail}</span></p>
        <p class="cta-sub">${flyer.perKnife}.</p>
      </div>
      <div class="cta cta-secondary">
        <p class="cta-title">Join the Always Sharp Pilot</p>
        <p class="cta-price" style="font-size:18px;">Join the waitlist</p>
        <p class="cta-sub">Give us a dull knife, get a sharp one. Always.</p>
      </div>
    </div>

    <div class="footer">
      <div class="qr-block">
        ${qrSvg}
        <div class="qr-copy">
          <p class="scan-label">Scan to get started</p>
          <p class="url">${baseUrl.replace(/^https?:\/\//, "")}${flyer.path}</p>
          <p class="turnaround">Local service. No shipping. Real people.</p>
        </div>
      </div>
      <div class="brand-block">
        <div class="brand-mark">
          <div class="brand-name">Westfield<span>Knife Care</span></div>
          ${logoMark()}
        </div>
        <p class="tagline">westfieldknifecare.example &bull; hello@sharp.example.com</p>
      </div>
    </div>
  </div>
</body>
</html>
`;
}
