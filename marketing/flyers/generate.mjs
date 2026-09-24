// Regenerates the QR codes and the two flyer HTML files, and (if Playwright
// is available) renders each to a print-ready PDF and a quick-look PNG.
//
// Usage:
//   node generate.mjs                                   # placeholder domain
//   node generate.mjs https://sharp.yourrealdomain.com   # real domain, before printing
//
// Each flyer's QR points at its vanity path (/a or /b — see
// packages/shared/src/flyer-routes.ts), which permanently pins that
// flyer's exact experiment, price and copy no matter what else changes on
// the site later (see packages/shared/src/experiments.ts:isHonorablePin).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import { FLYERS } from "./data.mjs";
import { renderFlyer } from "./template.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const baseUrl = (process.argv[2] ?? "https://sharp.example.com").replace(/\/$/, "");
const isPlaceholder = baseUrl.includes("example.com");

const heroSvg = (await readFile(path.join(here, "../../apps/web/public/images/hero.svg"), "utf8"))
  .replace(/<\?xml[^>]*\?>\s*/, "")
  .replace("<svg ", '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice" ');

for (const flyer of Object.values(FLYERS)) {
  const url = `${baseUrl}${flyer.path}`;
  const rawSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#1a1d1b", light: "#ffffff" },
  });
  const qrSvg = rawSvg.replace(/^<\?xml[^>]*\?>\s*/, "").replace("<svg ", '<svg class="qr" ');

  const html = renderFlyer(flyer, { heroSvg, qrSvg, baseUrl });
  const outPath = path.join(here, `flyer-${flyer.id}.html`);
  await writeFile(outPath, html);
  console.log(`flyer-${flyer.id}.html -> ${url}`);
}

if (isPlaceholder) {
  console.log(
    "\nNOTE: generated against the placeholder domain sharp.example.com.\n" +
      "Re-run with your real domain before sending these to print:\n" +
      "  node generate.mjs https://sharp.<your-real-domain>\n",
  );
}

// Render PDFs + PNG previews if Playwright's Chromium is reachable. This is
// optional: the HTML files alone are enough to print (open in a browser,
// File -> Print -> Save as PDF, paper size Letter, background graphics on).
try {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const flyer of Object.values(FLYERS)) {
    const htmlPath = path.join(here, `flyer-${flyer.id}.html`);
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle" });
    await page.pdf({
      path: path.join(here, `flyer-${flyer.id}.pdf`),
      format: "Letter",
      printBackground: true,
    });
    await page.setViewportSize({ width: 816, height: 1056 });
    await page.screenshot({ path: path.join(here, `flyer-${flyer.id}-preview.png`) });
    console.log(`flyer-${flyer.id}.pdf, flyer-${flyer.id}-preview.png`);
  }
  await browser.close();
} catch (err) {
  console.log(`\n(Skipped PDF/PNG export: ${err.message})`);
}
