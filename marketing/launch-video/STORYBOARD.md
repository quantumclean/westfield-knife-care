# Launch video storyboard

50 seconds, 120 BPM (one beat = 0.5s, one bar = 2s). Two renders from one
composition: **16:9** (1920×1080) for desktop and **1:1** (1080×1080) for
phones, where most flyer scans land. Every visual beat and every sound effect
comes from `cues.json`, so cuts land on the music by construction.

## Rules the video follows

- **Experiment-neutral.** The homepage A/B tests price, headline and
  turnaround time (`packages/shared/src/experiments.ts`). The video shows
  none of them — no price, neither offer's headline, no "48 hours" or
  "next day". Both arms see an identical video, so it can't confound the
  test. Price lives in the page's pricing section, right below.
- **Only true claims.** Everything shown is already stated in the site copy
  (`packages/shared/src/content.ts` and the FAQ): pickup at home, pro
  sharpening by hand or precision equipment, fast return, local with no
  shipping, secure Stripe checkout, full refund if a pickup can't happen,
  the Always Sharp pilot waitlist. No testimonials, ratings or statistics —
  there aren't any yet.
- **Readable on a phone.** Few words, very large type. The 1:1 cut stacks
  the layouts so text stays legible at ~350px wide.

## Scenes

| Time   | Bars  | Scene               | What happens                                                                                                   |
| ------ | ----- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| 0–4s   | 1–2   | Cold open           | "When did you last sharpen your knives?" word by word; "knives?" in lime serif italic.                         |
| 4–8s   | 3–4   | The problem         | A dull knife squashes a tomato. "Dull knives crush." / "They slip." / "Cooking feels like work." Riser, cut.   |
| 8–12s  | 5–6   | Brand reveal (drop) | Logo tile slams in with a shockwave; wordmark; "Sharpening, handled."; three service chips.                    |
| 12–18s | 7–9   | 01 Book             | Browser window with the booking flow: knives stepper, pickup day, address typed, "Book pickup" → Booked.       |
| 18–22s | 10–11 | 02 Pickup           | Front door, knife bag on the mat, the van pulls up, "Picked up", bag goes in the van.                          |
| 22–26s | 12–13 | 03 Sharpen          | Knife strokes a whetstone four times with sparks, lifts, glint runs down the edge.                             |
| 26–30s | 14–15 | 04 Return           | The sharp knife slices a tomato into clean fanned slices. "Back at your door. Sharp."                          |
| 30–38s | 16–19 | The details (light) | Bento grid: local route map drawing between stops, pickup & return, secure checkout, pro sharpening, refund.   |
| 38–42s | 20–21 | Always Sharp teaser | "Coming soon: Always Sharp — swap a dull knife for a sharp one. On repeat." Knives swap on a loop.             |
| 42–50s | 22–25 | Call to action      | "Sharp knives. Zero hassle." Book button clicked, URL typed, QR code. Fades to the opening background to loop. |
