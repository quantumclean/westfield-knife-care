# Flyers

Source for the two Wave 1 print flyers, A/B testing price and headline
against otherwise identical design and copy (per `docs/experiment-plan.md`).
Each flyer's QR code points at its permanent vanity path (`/a` or `/b`, see
`packages/shared/src/flyer-routes.ts`), which keeps showing that flyer's
exact price and copy for as long as the household holds onto it — even
after the losing experiment is concluded.

| File        | Experiment     | Price          | Headline                              |
| ----------- | -------------- | -------------- | ------------------------------------- |
| `flyer-a.*` | experiment-001 | $39 / 4 knives | "Never cook with a Dull Knife Again." |
| `flyer-b.*` | experiment-002 | $49 / 5 knives | "Your Knives. Sharp Tomorrow."        |

Only the headline, price and turnaround line differ between them
(`data.mjs`) — everything else (layout, imagery, both CTA blocks, the "why
us" framing) is identical, so the test measures price and message, not
design quality.

## Regenerating

The generated HTML/PDF/PNG files are **not** committed (they're
reproducible from `data.mjs` + `template.mjs`, and would go stale silently
if left checked in). Regenerate them any time:

```sh
cd marketing/flyers
npm install
node generate.mjs                                  # placeholder QR domain (sharp.example.com)
node generate.mjs https://sharp.<your-real-domain>  # real QR domain — do this before printing
```

This writes `flyer-a.html` / `flyer-b.html`. If Playwright's Chromium is on
your machine it also writes `flyer-a.pdf` / `flyer-b.pdf` (print-ready, US
Letter, backgrounds included) and a `*-preview.png` of each. Without
Playwright, open the HTML file in any browser and use File → Print → Save
as PDF (paper size Letter, margins none, background graphics **on** —
otherwise the colored blocks print white).

**Always regenerate against the real production domain before ordering
print**, and open the PDF once to confirm the QR code's URL text at the
bottom matches what you intend to scan to. A wrong domain baked into 100+
printed flyers can't be undone after they're in mailboxes.

## Printing and distributing

- **Format**: single-sided, US Letter (8.5×11in), full color. A local copy
  shop, FedEx Office, or an online service (VistaPrint, Canva Print) can
  all print from the PDF directly.
- **Quantity**: match the Wave 1 route size in `docs/go-live.md` /
  `docs/wave-1-route.md` (roughly 100–250 households) — split evenly
  between A and B, alternating by house or by block so the two arms see
  comparable geography, not one flyer on the "good" side of the
  neighborhood and the other on a worse one.
- **Delivery**: door-to-door by hand (a USPS mailbox drop requires a bulk
  mail permit; hand delivery to the door or a door hanger does not).
  Confirm your municipality's rules on unsolicited door materials before
  going out — Westfield, like most NJ towns, generally permits door-to-door
  flyering but may restrict hanging things on mailboxes specifically (federal
  law reserves the mailbox itself for USPS); a door or storm-door hanger
  avoids that question entirely.
- **Tracking which arm went where**: keep a simple paper or spreadsheet log
  of which streets got A vs. B as you walk the route. You'll want it later
  to sanity-check the funnel numbers against actual delivered volume, and
  to notice if one arm's flyers were concentrated in, say, apartments vs.
  single-family homes.
