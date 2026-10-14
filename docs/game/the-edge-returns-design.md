# The Edge Returns: game design and technical plan

Status: **design proposal, nothing implemented.** Written 2026-10-14 against `main` at `467d1a9`
(plus the gifting UX review, `docs/reviews/claude-gifting-ux-review.md` on branch `worktree-gifting-ux-review`). No application code, configuration, analytics
schema or data was changed. Every number below (timings, budgets, estimates) is a starting point
to tune during the build, not a measurement.

## Summary

- **What it is.** A two-level, first-person kitchen arcade game. In Level 1 the knife dulls until
  it can no longer cut. Westfield Knife Care picks it up, sharpens it and brings it back. In
  Level 2 the edge is restored, and the cuts are faster and more satisfying, against tougher
  ingredients.
- **How it beats the current toy.** The hero's "Swipe to test the edge" board
  (`apps/web/src/toy/slice-board.ts`) is a decorative three-fruit loop with no goal, story or
  sound. The game adds a pseudo-3D world, a sharpness meter, a story that matches the real
  service, two levels, original sound, keyboard and single-tap play, and privacy-safe measurement.
  The hero toy stays as it is and becomes the teaser.
- **Recommended technology.** Canvas 2D with a hand-written pseudo-3D projection, Web Audio
  synthesis for every sound, and Preact for menus and the HUD. **No new dependencies**, no new
  image or audio files, and the game is a lazily loaded chunk. A WebGL engine is not justified
  (section 4.1).
- **Commerce stays untouched.** The game opens as an overlay inside the existing app, so `/a`,
  `/b` and `/` keep their own session and price. Its CTA calls the existing `openBooking`, so the
  game never sees or shows a price.
- **Two conflicts with the brief need an owner decision** (section 10). "Professional sharpening"
  is banned in customer copy by `apps/web/test/copy-claims.test.ts` (owner decision 2026-10-09),
  so the game says "pickup, sharpening and return". A new feature is out of scope during the
  launch freeze (`docs/launch-freeze.md`), so this is **[post-freeze]** unless the owner grants an
  exception that ships it to both arms on the same day.

## 1. Constraints from the repository

| Constraint                                                                                                                                             | Source                                                                           | What the design does                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/a` and `/b` pin experiment-001 ($39, 4 knives) and experiment-002 ($49, 5 knives) by path. The price comes from the session's experiment.            | `packages/shared/src/flyer-routes.ts`, `apps/web/src/lib/session.ts`             | The game is an overlay on the same page (`/a#play` keeps the pin). The CTA calls `openBooking("game")`. The game gets no price or experiment props.                                |
| Customer copy may not say "professional", "trusted", "fast turnaround/return", "safer, better" or "refund", among others. The toy file is scanned too. | `apps/web/test/copy-claims.test.ts`                                              | All game strings live in one file, `src/game/copy.ts`, which is added to that test. No timing, safety, equipment or performance claims.                                            |
| Launch freeze: no new features until experiment-001/002 conclude. Exceptions ship to both arms at once, and the deploy time is recorded.               | `docs/launch-freeze.md`                                                          | Built behind a build flag. Enabled after the freeze (backstop around 2026-11-19), or by owner exception for both arms the same day.                                                |
| Analytics is a strict allowlist. The API rejects a **whole batch** if it holds an unknown event, key or value.                                         | `packages/shared/src/analytics.ts` (`CATALOG`), `docs/analytics-events.md`       | New events are added to the shared catalog, so the browser and API ship them together. On Cloudflare Pages, the Function deploys atomically with the site. Section 8 has the list. |
| Reduced motion: the hero board becomes a still life, and the film does not autoplay.                                                                   | `apps/web/src/sections/CuttingBoard.tsx`, `LaunchVideo.tsx`                      | A full reduced-motion variant (section 6.3), not just a disabled game.                                                                                                             |
| Original assets only. The launch film's music is synthesized in code.                                                                                  | `marketing/launch-video/audio/soundtrack.py`, `CREDITS.md`                       | All game sound is synthesized at runtime with Web Audio. All art is drawn in the inked style of `apps/web/src/art/fruit.ts`.                                                       |
| Lazy-loaded heavy UI: the forms load on intent or idle, and the toy loads on idle.                                                                     | `apps/web/src/app.tsx`, `CuttingBoard.tsx`                                       | The game chunk loads only when the visitor opens the game (or hovers or focuses its button).                                                                                       |
| Dialogs use native `<dialog>`. While one is open, `isSensitiveScreen()` holds third-party loading and scroll measurement.                              | `packages/ui/src/Modal.tsx`, `apps/web/src/lib/analytics.ts`                     | The game is a full-screen native `<dialog>`, so it inherits focus trapping and the same privacy behaviour.                                                                         |
| The gifting review found that the toy "proves nothing about the service", and that the packing guidance (towel and bag) is weak.                       | `docs/reviews/claude-gifting-ux-review.md` (branch `worktree-gifting-ux-review`) | The game does not pretend to prove anything. Its doorstep scene shows a covered blade in a closed bag without giving instructions.                                                 |

## 2. Gameplay specification

### 2.1 Story and fiction rules

| Beat         | What happens                                                                                                    | Length  |
| ------------ | --------------------------------------------------------------------------------------------------------------- | ------- |
| Title        | The kitchen counter stretches to a vanishing point. Start, sound, settings.                                     | —       |
| Level 1      | **Dull Days.** Slice ingredients riding the counter. The Edge meter drains, and cuts get worse until none work. | 45–60 s |
| Edge gone    | The knife skids off a tomato. "Your edge is gone."                                                              | 2 s     |
| Service      | Three beats: the knife waits at the door, it gets sharpened (the player helps refill the meter), it comes back. | 10–15 s |
| Interstitial | The meter is full. "Start Level 2" is the primary action; the subtle CTA sits below it.                         | —       |
| Level 2      | **The Edge Returns.** Faster spawns, tougher ingredients, combos, satisfying cut effects.                       | 60 s    |
| Results      | Score, best on this device, play again, back to the site, the subtle CTA again.                                 | —       |

Fiction rules (these also guide copy review):

1. The Edge meter is a **game stat**. It is never presented as a measurement of real knives.
2. No statements about real cutting performance, injury or safety, food quality, how long an edge
   lasts, how sharpening is done, or turnaround time.
3. The service beats show only what the site already says: pickup at your door, sharpening, and
   return to your door. No equipment, method or timing is shown. The sharpening beat is an
   abstract glint-and-sparks animation, not a specific tool (the real method is unconfirmed, per
   the gifting review).
4. No price in the game. The booking sheet shows the visitor's own arm.
5. Copy says "Westfield Knife Care", "pickup", "sharpening" and "return". It never says
   "professional" (see section 10).

### 2.2 Controls

| Input                  | Slice                                                                                                                                                          | Other                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Mouse / trackpad       | Move across an ingredient fast enough. No button needed, as with the hero toy. Holding the button is optional.                                                 | Click the HUD buttons                                                  |
| Touch                  | Swipe across an ingredient. The game area uses `touch-action: none` (it is a full-screen dialog, so page scrolling is not affected).                           | Tap the HUD buttons. Two-finger tap pauses.                            |
| Single tap (any input) | **Tap to slice**, on by default for touch and in Relaxed mode: tapping an ingredient cuts it with a horizontal stroke. No path-based gesture is ever required. | —                                                                      |
| Keyboard               | The cut zone has three lanes. ← ↓ → (or A S D, or 1 2 3) slice the left, middle or right lane. Space makes a sweeping cut across all lanes (1.5 s cooldown).   | Esc or P pauses, M mutes, Enter or Space activates focused buttons     |
| Sharpening beat        | Swipe back and forth on the bench, alternate ← and →, or hold Space.                                                                                           | In Relaxed or reduced-motion mode, one "Sharpen" button press fills it |

Hit testing reuses `segmentHitsCircle` and `cutAngle` from `apps/web/src/toy/geometry.ts`,
applied in screen space to each ingredient's projected radius. Fast swipes read
`PointerEvent.getCoalescedEvents()`, where available, so that no ingredient is skipped between
frames.

### 2.3 The Edge meter

A segmented bar in the top-left corner, inspired by fighting-game health bars but drawn in the
site's inked style. It has 20 segments, a numeric percentage and a state word. When it drops, a
lighter "ghost" section lags behind for about 400 ms and then catches up (in reduced motion it
catches up instantly). Its state never relies on colour alone.

Edge `E` runs from 0 to 100. Each band changes how cuts behave. The rules are deterministic, with
no random misses, so the game feels fair:

| Band | E      | Minimum swipe speed\* | Soft (tomato, kiwi)   | Medium (lemon, apple, cucumber) | Firm (carrot, onion) | Tough (squash, pineapple; L2 only) | Feel                                   |
| ---- | ------ | --------------------- | --------------------- | ------------------------------- | -------------------- | ---------------------------------- | -------------------------------------- |
| Keen | 70–100 | 0.45                  | 1 cut, clean split    | 1 cut                           | 1 cut                | 2 cuts, or 1 power cut (≥ 1.4)     | Bright "shink", halves fly apart       |
| Worn | 40–69  | 0.70                  | 1 cut                 | 1 cut, halves barely separate   | 2 cuts               | —                                  | Duller sound, less spin                |
| Dull | 15–39  | 1.00                  | Squashes (half score) | 2 cuts                          | Bounces off          | —                                  | "Thup", bruise sprite, meter cracks    |
| Gone | 0–14   | —                     | Skids off             | Skids off                       | Skids off            | —                                  | Scrape sound, the knife tilts, no cuts |

\* In scene units per millisecond, the same unit as `MIN_SPEED = 0.45` in `slice-board.ts`.

Level 1 drain:

- Passive: 0.6 per second.
- Per cut: soft 1.2, medium 1.8, firm 2.5.
- Hazard (pan lid or tin): −12.
- **Story guarantee:** after 60 s the passive drain triples, so the meter always reaches 0 even if
  the player stops slicing. In Relaxed mode the drain counts cuts instead of seconds, so there is
  no time pressure.

Level 2 drain: starts at 100, passive 0.15 per second, 0.3 per cut, hazards −8. A **glint**
pickup restores +10. The edge stays Keen for a competent player and only slips to Worn after
repeated hazard hits.

### 2.4 Level 1: Dull Days

| Time    | Spawns                                | Rate    | Notes                                                                    |
| ------- | ------------------------------------- | ------- | ------------------------------------------------------------------------ |
| 0–15 s  | Tomato, lemon, apple, kiwi (one each) | 0.7 / s | Teaching: a hint arrow appears until the first cut, as on the hero board |
| 15–35 s | Plus cucumber; pairs now and then     | 0.9 / s | First hazard at about 20 s, with a "Clang!" and a visible edge drop      |
| 35 s on | Plus carrot and onion                 | 1.0 / s | Worn and Dull feedback dominates. Warnings at 50% and 25%                |
| E = 0   | Spawns stop and the last items skid   | —       | 1.5 s pause, then the Edge gone screen                                   |

Ingredients ride a conveyor-like counter from the far distance (z ≈ 12) to the cut zone (z ≈ 1.2)
and hop up into it in an arc. Only items in the cut zone can be cut. Missed items roll off the end
of the counter with no penalty in Level 1, because the story is the point.

### 2.5 The service sequence

| Beat          | Visual                                                                                                                                              | Interaction                                                         | Copy (draft)                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------- |
| A. Pickup     | Pseudo-3D street scroll. The knife, blade covered, waits in a closed bag on a doorstep. An unbranded car with the WKC logo on its door glides past. | Skip (always visible), or wait 4 s                                  | "Leave it wrapped at your door." |
| B. Sharpening | Abstract bench with sparks and a glint. The Edge meter refills in ticks, with a rising tone per stroke.                                             | Swipe back and forth, alternate ← →, or hold Space; about 8 strokes | "Sharpening… help it along."     |
| C. Return     | The doorstep again; the knife gleams. The meter reads 100% KEEN.                                                                                    | Continue                                                            | "Back at your door."             |

Then the interstitial screen with the subtle CTA: "Bring back your edge — Sharpen My Knives."
"Sharpen My Knives" is the button label and comes from `experiment.offer.cta_primary`, which is
identical in both arms.

### 2.6 Level 2: The Edge Returns

| Time    | Spawns                                      | Rate    | New mechanics                                                                                                  |
| ------- | ------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- |
| 0–20 s  | All Level 1 items                           | 1.0 / s | Everything cuts in one stroke. Counter scrolls 1.6× faster                                                     |
| 20–40 s | Plus butternut squash and pineapple (tough) | 1.5 / s | Tough items take 2 cuts, or 1 **power cut** (swipe ≥ 1.4). Hit-stop of 50 ms on a power cut                    |
| 40–60 s | Clusters of 3–4; glints                     | 2.0 / s | **Combo:** several items in one stroke. 2 items ×1.5, 3 or more ×2. 4 or more: brief 0.4× slow motion (100 ms) |
| 55–60 s | Rush                                        | 2.2 / s | Bonus round. Results at 60 s                                                                                   |

Level 2 has no lives. Missing an item only breaks the streak. Hazards cost edge and the streak.
Relaxed mode removes the timer (the level ends after 40 items), slows the counter to 0.6× and
removes hazards.

"More satisfying" comes from game feel only: cleaner sound, more spin on the halves, bigger juice
bursts, a hit-stop, rising combo notes, and a small screen nudge (off in reduced motion). No copy
links this to real knives.

### 2.7 Scoring

- Points per cut: soft 1, medium 2, firm 3, tough 5.
- **Clean cut** +1 when the stroke passes within 30% of the item's centre.
- Combo multiplier as above. A streak counter rises with consecutive clean cuts.
- Level 1 points carry into the total, but Level 2 decides the "best" score.
- The best score is stored only in this browser (`wkc.game.best`). There are no leaderboards, names
  or sharing of scores.

### 2.8 Ingredients and art

| Item             | Toughness | Levels | Art                                                                 | Notes                                                              |
| ---------------- | --------- | ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Tomato           | Soft      | 1, 2   | Exists (`art/fruit.ts`)                                             | Squashes when Dull                                                 |
| Kiwi             | Soft      | 1, 2   | Exists                                                              |                                                                    |
| Lemon            | Medium    | 1, 2   | Exists                                                              |                                                                    |
| Apple            | Medium    | 1, 2   | Exists                                                              |                                                                    |
| Cucumber         | Medium    | 1, 2   | New: `whole`, `face`, `body`, `juice`, as in `FruitArt`             | Long shape: hit test uses a capsule (two circles)                  |
| Carrot           | Firm      | 1, 2   | New                                                                 | Thin target: rewards accuracy                                      |
| Onion            | Firm      | 1, 2   | New                                                                 | Ring cross-section                                                 |
| Butternut squash | Tough     | 2      | New                                                                 | Two cuts or one power cut                                          |
| Pineapple        | Tough     | 2      | New                                                                 | Two cuts or one power cut                                          |
| Pan lid, tin     | Hazard    | 1, 2   | New, grey, with a distinct silhouette (a handle or ribs)            | Recognisable by shape, not just colour. "Clang"                    |
| Glint            | Pickup    | 2      | New: a four-point sparkle                                           | +10 edge                                                           |
| Knife viewmodel  | —         | All    | New: a chef's knife in the bottom right, like a first-person weapon | Three states: keen (glint), worn (dull grey), gone (visible nicks) |

New art follows the conventions in `art/fruit.ts`: drawn around (0, 0), with `INK` outlines and
literal colours. That keeps it consistent with the hero board and lets the slicing code reuse the
`face` and `body` clip approach.

### 2.9 Sound design

All sounds are synthesized at runtime with Web Audio, following the precedent of
`marketing/launch-video/audio/soundtrack.py`. That means zero audio bytes to download and no
licensing question.

| Event            | Recipe (starting point)                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| Swish (a miss)   | White noise through a band-pass filter swept 2 → 6 kHz, 120 ms. Gain follows swipe speed                         |
| Clean cut        | Short noise burst plus a sine ping at 2.4–3.2 kHz with a fast decay. Pitch steps up a pentatonic scale per combo |
| Wet cut (tomato) | Low-passed noise plus a quick downward pitch "plp"                                                               |
| Dull thud        | Noise low-passed at 200–400 Hz, 90 ms                                                                            |
| Skid (Gone)      | Filtered noise scrape, 250 ms, with a slight pitch wobble                                                        |
| Clang (hazard)   | Two inharmonic sines (about 520 and 1,310 Hz) with a 400 ms decay                                                |
| Meter warning    | Two soft low marimba-like notes. Not a siren                                                                     |
| Sharpen stroke   | Alternating filtered-noise "shhk" with a rising tone as the meter fills. A major-arpeggio chime at 100%          |
| Stings           | Original 3–5 note motifs for level start and results, written for this game                                      |

Mixing and behaviour:

- At most 12 simultaneous voices. One master gain feeds a `DynamicsCompressorNode`.
- The `AudioContext` is created on the Start press, which is a user gesture. Where Safari's Audio
  Session API exists, set `navigator.audioSession.type = "ambient"` so the silent switch is
  respected and the visitor's own audio isn't interrupted.
- A mute button is always visible (and M toggles it). The choice is remembered in `wkc.game.prefs`.
  Sound is never the only cue: every sound has a visual counterpart.
- Haptics: `navigator.vibrate(8)` on clean cuts, where supported (as the hero toy does). It has its
  own toggle.
- No background music by default. That keeps the chunk small and avoids sounding like any known
  game theme.

### 2.10 Originality guardrails

- No characters, names, logos, fonts, UI frames, sounds, music, voice lines or catchphrases from
  existing games. That means no "K.O.", "Fight!", "Round 1" or announcer voice, no "ninja", and no
  fuse bombs.
- The meter borrows only a common genre convention: a segmented bar with a delayed ghost drain.
  It is drawn in the house style.
- The "classic 3D" feel comes from generic techniques: a perspective floor, flat-shaded low-poly
  shapes, and a fixed horizon. It does not recreate any recognisable level, model or palette.
- Swipe-to-slice is a widespread genre. This game is distinguished by its counter-in-depth
  conveyor, the Edge meter and the service story.
- This is a design guideline, not legal advice. The owner may want counsel to look before paid
  promotion.

## 3. Screens

Desktop is shown at 16:9. On phones the same screens stack vertically (notes follow each). Every
control is a real DOM button at least 44 × 44 px. The world is drawn on a canvas behind the DOM
HUD.

**S0. Entry point** (post-freeze; before then, only the `#play` deep link opens the game)

```
 Hero card (unchanged board art)
 ┌───────────────────────────────┐
 │   knife strip                 │
 │   (tomato) (lemon) (apple)    │
 │ ───────── board ───────────── │
 └───────────────────────────────┘
   ↗ Swipe to test the edge        ← existing hint (aria-hidden)
   [ ▸ Play The Edge Returns ]      ← new, focusable, quiet text button
```

**S1. Title**

```
┌────────────────────────────────────────────────────────────────────┐
│ [× Close]                                          [Sound: on] [⚙] │
│                                                                    │
│                       THE EDGE RETURNS                             │
│           A two-level kitchen arcade by Westfield Knife Care        │
│                                                                    │
│          ░░░ counter recedes to a vanishing point ░░░               │
│              (lemon)      (tomato)      (apple) idle bob            │
│                                                                    │
│                        [ ▶  Start ]                                │
│        Swipe or tap to slice · Keys ← ↓ → and Space · Esc pauses   │
│              [ Settings ]    [ Read the story instead ]            │
└────────────────────────────────────────────────────────────────────┘
```

Phone: the title takes the top third; Start is at thumb height; settings and the text version sit
below it.

**S2. Level 1 HUD**

```
┌────────────────────────────────────────────────────────────────────┐
│ EDGE ▕████████████▒▒▒░░░░░▏ 62%  WORN        SCORE 18    0:41  [II] │
│                                                                    │
│        ▓▓▓▓▓▓▓▓▓ backsplash tiles (parallax) ▓▓▓▓▓▓▓▓▓              │
│                         · vanishing point ·                        │
│                     (lemon)          (kiwi)       far, small       │
│               ═══════════ counter scrolls toward you ══════════     │
│          (apple)                         (tomato)   near, large    │
│  ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ cut zone ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
│      ~~~~~~ blade trail ~~~~~~                          ╱╲ knife   │
│                                                        ╱  ╲ (nicks)│
│ [Sound]                                                            │
└────────────────────────────────────────────────────────────────────┘
```

- Phone portrait: the meter spans the full top row, with score, time and pause on a second row.
  The cut zone fills the lower 55% (thumb reach) and the knife viewmodel is smaller, bottom
  centre. Respect `env(safe-area-inset-*)`.
- Keyboard mode: the cut zone shows three lane markers labelled ← ↓ →.
- Warnings at 50% and 25%: the meter pulses at 2 Hz or less, and a polite live region says "Edge at
  half" and then "Edge almost gone".

**S3. Edge gone**

```
┌────────────────────────────────────────────────────────────────────┐
│ EDGE ▕░░░░░░░░░░░░░░░░░░░░▏ 0%  GONE                               │
│                                                                    │
│                     Your edge is gone.                             │
│              (tomato squashed, knife tilted on the board)          │
│                                                                    │
│              [ Call in Westfield Knife Care  → ]                    │
└────────────────────────────────────────────────────────────────────┘
```

**S4. Service sequence** (three beats, progress dots, Skip always visible)

```
┌────────────────────────────────────────────────────────────────────┐
│  ● ○ ○                                                    [Skip ⏭] │
│                                                                    │
│    A. Pickup: street scrolls sideways, the doorstep slides in       │
│       [covered knife in a closed bag]   car with WKC logo passes   │
│                                                                    │
│                Leave it wrapped at your door.                      │
└────────────────────────────────────────────────────────────────────┘
   B. Sharpening: EDGE ▕████▒▒▒▒░░░░▏ fills tick by tick
      "Sharpening… help it along."  ⟵ swipe ⟶  (or ← → / hold Space)
   C. Return: the doorstep again, the knife gleams, EDGE 100% KEEN
      "Back at your door."  [ Continue ]
```

Reduced motion: three still illustrated panels with captions, advanced with Continue. Beat B is
one "Sharpen" button that fills the meter in steps.

**S5. Interstitial with the subtle CTA**

```
┌────────────────────────────────────────────────────────────────────┐
│ EDGE ▕████████████████████▏ 100%  KEEN                              │
│                                                                    │
│              Your knife is back. Level 2 is ready.                 │
│                                                                    │
│                   [ ▶  Start Level 2 ]          ← focused, primary │
│                                                                    │
│      Bring back your edge — Sharpen My Knives                      │
│                             ^^^^^^^^^^^^^^^^^^ quiet text button   │
└────────────────────────────────────────────────────────────────────┘
```

The CTA closes the game and opens the existing booking sheet (`openBooking("game")`), which shows
the visitor's own price. It is not a banner, does not pulse, and never blocks play.

**S6. Level 2 HUD:** as S2, plus a combo counter beside the score ("×2 COMBO"), glint pickups and
a streak pip row under the meter.

**S7. Results**

```
┌────────────────────────────────────────────────────────────────────┐
│                         Level 2 complete                           │
│          Score 214   ·   Best on this device 240                   │
│          Clean cuts 31   ·   Longest combo 4                       │
│                                                                    │
│           [ ↻ Play again ]        [ Back to the site ]             │
│                                                                    │
│      Bring back your edge — Sharpen My Knives                      │
│      Was this fun?  [👍] [👎]        (optional, section 8)          │
└────────────────────────────────────────────────────────────────────┘
```

**S8. Pause and settings:** Resume (focused) · Sound on/off · Vibration on/off · Reduce motion
(defaults to the device setting) · Relaxed mode (no timer) · Controls · Quit game. Opened with Esc
or P, the pause button, a two-finger tap, or automatically when the tab is hidden or the window
loses focus.

**S9. Read the story instead:** a short text version of the three beats, with "Sharpen My Knives"
and a Close button. It is the screen-reader and low-vision path, and it is also useful to anyone
who doesn't want to play.

## 4. Technology

### 4.1 Rendering choice

| Option                                            | Added bundle                                       | Phone performance                                              | Fit                                                                                     | Verdict                    |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- |
| SVG DOM (extend the hero toy)                     | None                                               | Degrades with dozens of moving nodes, clip paths and particles | Ideal for three fruits. It cannot scroll a perspective floor cheaply                    | Keep for the hero toy only |
| **Canvas 2D with pseudo-3D projection**           | None (own code)                                    | Good: one surface, `drawImage` of pre-rasterized sprites       | A perspective floor, z-scaled sprites and flat-shaded polygons give the classic-3D look | **Recommended**            |
| WebGL through a small library (OGL, twgl, PixiJS) | Tens of KB gzipped or more (check before choosing) | Very good for many sprites                                     | Needed only if the Phase 0 spike shows Canvas 2D missing its frame budget               | Fallback                   |
| Full 3D engine (three.js, Babylon.js)             | Hundreds of KB minified (check before choosing)    | Shader compilation, GPU memory, battery                        | Real 3D also needs a modelling pipeline and model assets                                | Not recommended            |

The game's look is a perspective counter, billboarded ingredients and a few flat-shaded props.
That sits comfortably in Canvas 2D. A full engine would add weight and an asset pipeline for no
visible gain at this scale.

### 4.2 Pseudo-3D camera

World axes: `x` across the counter (−1 to 1), `y` height, `z` depth (1 is the near cut plane, 12
is the far end). The camera sits at height `h` with focal length `f`, and the horizon is a fixed
screen row `Y₀`.

```
screenX = cx + (x / z) · f
screenY = Y₀ + ((h − y) / z) · f
scale   = f / z
```

- **Floor:** about 40 horizontal bands below the horizon. For each band, `z = h·f / (screenY − Y₀)`,
  and the plank colour is `floor(z + scroll) mod 2`. This is the affine-scrolled floor of 16-bit
  racing games, drawn as trapezoids rather than per pixel.
- **Walls:** backsplash tiles as perspective quads, plus one parallax window layer. The street
  outside is generic, with no real landmarks.
- **Ingredients:** billboards sorted far to near (painter's algorithm). Hit tests use the projected
  centre and `r · scale`.
- **Cut halves:** once cut, halves leave the projection and use screen-space physics, ported from
  `slice-board.ts` (gravity, spin, rocking onto the flat side).
- **Comfort:** the horizon is fixed, the camera never rolls or bobs, the field of view is constant,
  and scroll speed is capped (section 6.3).

### 4.3 Architecture

```
apps/web/src/game/
  GameDialog.tsx      Preact shell: full-screen <dialog>, screens S1–S9, DOM HUD
  copy.ts             every visible game string (scanned by copy-claims.test.ts)
  levels.ts           data: spawn tables, drain rates, bands (sections 2.3–2.6)
  sim/edge.ts         pure: edge value → band → cut outcome per toughness
  sim/world.ts        pure: spawns (seeded RNG), conveyor, cut zone, scoring, combos
  sim/projection.ts   pure: camera maths and inverse for hit tests
  input.ts            pointer (coalesced) and keyboard lanes → slice segments
  render/canvas.ts    floor, walls, sprites, halves, particles, trail
  render/sprites.ts   rasterize art/fruit.ts + art/ingredients.ts SVG to bitmaps once
  audio/sfx.ts        Web Audio synth voices (section 2.9)
  prefs.ts            wkc.game.prefs and wkc.game.best (try/catch like session.ts)
apps/web/src/art/ingredients.ts   new inked art in the FruitArt shape
```

- **Pure simulation, thin renderer.** `sim/*` has no DOM or canvas, and takes `now` and a seed, so
  Vitest can test it like `test/slice-geometry.test.ts`. jsdom has no canvas, so rendering stays
  thin and is covered by Playwright.
- **One `requestAnimationFrame` loop** that runs only while playing. It stops when paused, hidden or
  closed, the same principle as the hero toy's idle loop.
- **HUD outside Preact's render path.** The meter and score update through CSS custom properties or
  `textContent` on refs every frame. Preact re-renders only when the screen changes (at most a
  few times a second).
- **Sprites:** each SVG string is wrapped in `<svg>` and loaded as a `data:image/svg+xml` image,
  then drawn once to an offscreen canvas at 2–3 sizes. Load via `<img>` and not via
  `createImageBitmap(svgBlob)`, which is unreliable for SVG in Safari. Bitmaps are released on
  close.
- **Trail:** `trailPath()` from `toy/geometry.ts` returns an SVG path string. Canvas can draw that
  directly with `new Path2D(d)`.

### 4.4 Reused as is

| Existing                                                                     | Reused for                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `toy/geometry.ts`: `segmentHitsCircle`, `cutAngle`, `cutNormal`, `trailPath` | Hit tests, cut direction, half separation, trail     |
| `art/fruit.ts`: tomato, lemon, apple, kiwi, `INK`                            | Sprites and cross-sections                           |
| `slice-board.ts` physics constants and `lowestPoint`/`nearestTurn`           | Behaviour of the halves (moved into a shared module) |
| `@wkc/ui` `Button`, `Logo`, `Icon`                                           | Menus, the WKC logo in the service beats             |
| `app.tsx` lazy-load pattern (`loadBooking`) and `openBooking`                | Loading the game, the CTA                            |
| `analytics.ts` `track`, the catalog's `once` rules, `TIME_BANDS`             | Measurement (section 8)                              |

### 4.5 Integration with the site (pricing and checkout unchanged)

- `app.tsx` gains `"game"` in its `Dialog` union, a `loadGame()` lazy import mirroring
  `loadBooking`, `#play` in its `fromHash` deep-link handler, and a "Play" entry button (post-freeze).
- `GameDialog` receives only `open`, `onClose`, `ctaLabel` (`experiment.offer.cta_primary`) and
  `onSharpen`. `onSharpen` closes the game and calls `openBooking("game")`. The game never reads the
  session, experiment or price, so it cannot alter them.
- `/a#play` and `/b#play` keep the flyer pin, because `loadSession` reads the path on load. A booking
  opened from the game shows exactly the price the hero shows.
- Esc inside the dialog pauses instead of closing: listen for `cancel` and call `preventDefault()`.
  Quit is in the pause menu.
- A build flag, `VITE_GAME_ENABLED`, defaults to off. With it off, `#play` does nothing and the
  entry button isn't rendered. The game chunk is not imported until the visitor opens the game,
  so the flag costs flag-off visitors nothing.
- The hero toy is unchanged: still decorative, `aria-hidden` and outside the tab order. The new entry
  button is a separate, focusable control.

### 4.6 Deliberately not added

No game engine, physics engine, state library, audio files, image files, web fonts beyond the
existing Instrument Serif, Web Workers, `OffscreenCanvas` transfer, service worker, or remote
calls of any kind beyond the existing analytics endpoint.

## 5. Performance requirements

| Area             | Requirement                                                                                                                      | How it is checked                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Landing page     | Main bundle grows by ≤ 1.5 KB gzipped (entry button, hash handler). No change to LCP or CLS. Nothing loads until the game opens. | Compare `vite build` output before and after; existing `web_vitals` |
| Game chunk       | ≤ 40 KB gzipped JS + CSS, including new art. Zero new binary assets.                                                             | Build output; a size assertion in CI                                |
| Open to playable | < 1 s on a mid-range phone over 4G (chunk fetch plus ≤ 150 ms rasterizing sprites)                                               | Playwright with network and CPU throttling                          |
| Frame rate       | 60 fps target. p95 frame time ≤ 16.7 ms on desktop and ≤ 20 ms on the reference phone (proxy: Playwright at 4× CPU throttle)     | rAF frame-time sampling in a dev-only harness                       |
| Adaptive quality | If p95 exceeds 22 ms for 2 s, step down: device pixel ratio 2 → 1.5 → 1, half the particles, then drop the parallax layer        | Unit-tested policy; manual check on a slow phone                    |
| Canvas size      | Backing store = CSS size × min(devicePixelRatio, 2), capped at about 2.5 megapixels                                              | Code review                                                         |
| Allocation       | Object pools for halves, particles and trail points. No allocations in the per-frame hot path                                    | DevTools memory timeline: no sawtooth during play                   |
| Limits           | ≤ 24 live ingredients, ≤ 120 particles, ≤ 12 audio voices                                                                        | Constants in `levels.ts`                                            |
| Idle cost        | The loop stops on pause, `visibilitychange`, blur and close. No timers remain after close                                        | Playwright: no rAF callbacks after close                            |
| Memory           | ≤ 40 MB extra while open. Bitmaps and the `AudioContext` are released on close                                                   | DevTools heap snapshot                                              |
| Input latency    | A swipe is visible on the next frame. Coalesced pointer events are used where available                                          | Manual, plus INP from `web_vitals`                                  |

## 6. Accessibility requirements

These target the relevant WCAG 2.2 success criteria. This is not a claim of conformance; that
needs an audit.

### 6.1 Operability

- **Keyboard (2.1.1):** the whole game, including both levels, the sharpening beat and every menu,
  is playable with the keyboard alone (section 2.2). Focus is visible and moves to the primary
  button on each screen change. Esc pauses.
- **Pointer gestures (2.5.1):** tap to slice is always available, so path-based swipes are never
  required.
- **Target size (2.5.8):** all controls are at least 44 × 44 px, matching the site's existing rule.
- **Timing adjustable (2.2.1):** Relaxed mode removes timers, and pause is always available.
  Pausing happens automatically when the tab is hidden.
- **Pause, stop, hide (2.2.2):** the title screen's idle animation stops after 5 s and in reduced
  motion.
- **No traps:** Close (title), Quit (pause menu) and "Back to the site" (results) always return to
  the page, with focus restored to the button that opened the game.

### 6.2 Perception

- **Not colour alone (1.4.1):** the meter shows segments, a percentage and a state word. Hazards
  have distinct shapes.
- **Contrast (1.4.3, 1.4.11):** HUD text sits on its own opaque plate, at least 4.5:1, in light and
  dark themes. Lane markers and the meter outline are at least 3:1.
- **Flashing (2.3.1):** never more than 3 flashes a second. Warnings pulse at 2 Hz or less, with a
  small luminance change. There are no full-screen white flashes, and cut flashes stay small.
- **Sound is never the only cue.** Every audio event has a visual one.
- **Status messages (4.1.3):** one polite live region announces level start, edge at half, edge
  almost gone, edge gone, level complete and the score, at most once every 2 s. Individual cuts are
  never announced.
- **The canvas is `aria-hidden`.** Its meaning is carried by the HUD, the live region and screen S9.
- **Zoom:** the DOM HUD reflows at 200% zoom. The canvas keeps the game area, and the HUD never
  overlaps the cut zone.

### 6.3 Motion (`prefers-reduced-motion: reduce`, or the in-game toggle)

- The camera is fixed: no counter scroll, no parallax, no screen nudge, no slow motion and no
  hit-stop.
- Ingredients fade in at their lane positions instead of flying along the counter. Cut halves fade
  apart in place, with a few static juice dots instead of sprays.
- The meter's ghost catches up instantly.
- The service sequence becomes three still panels (screen S4).
- The game is still fully playable, and the story and CTA are unchanged.
- Even with motion allowed: the horizon is fixed, the camera never rolls, the field of view is
  constant, and the counter's scroll speed is capped, to reduce the risk of motion sickness.

## 7. Implementation plan

Estimates are for one developer who knows the codebase. They are rough and include tests.

| Phase | Scope                                                                                                                                                                                                                      | Complexity   | Estimate  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| 0     | Owner decisions (section 10). Spikes: the perspective counter with 30 sprites on a slow phone; SVG-to-bitmap in iOS Safari; audio unlock and `audioSession` on iOS.                                                        | Small        | 2–3 days  |
| 1     | `sim/*` with Vitest, the canvas renderer, pointer and touch input, the Edge meter HUD, Level 1 tuning with the four existing fruits.                                                                                       | Medium       | 5–7 days  |
| 2     | The service sequence, Level 2 mechanics, new inked art (5 ingredients, 2 hazards, glint, three knife states), the SFX synth, the results screen.                                                                           | Large        | 7–10 days |
| 3     | Keyboard lanes, tap to slice, Relaxed mode, the reduced-motion variant, the live region, auto-pause, safe areas and orientation, screen S9.                                                                                | Medium       | 4–6 days  |
| 4     | Site integration: `app.tsx` overlay, `#play`, CTA to `openBooking("game")`, build flag. Analytics catalog additions (shared, API tests, `docs/analytics-events.md`), privacy doc updates, copy-claims coverage, e2e tests. | Medium       | 3–5 days  |
| 5     | Device matrix QA, performance tuning to the budgets, bundle-size check in CI, launch behind the flag, enable after the freeze, record the deploy time in `docs/launch-freeze.md`.                                          | Small–Medium | 3–4 days  |

**Total: about 24–35 working days (5–7 weeks).** Overall complexity is medium-high, mostly in game
feel and art. Technical risk to commerce is low, because the game is isolated from pricing and
checkout.

**Smaller first cut (about 2 weeks)** if the owner wants to test interest first: Level 1, a static
three-panel story, and Level 2 using only the four existing fruits plus the power cut. Minimal
sound, with keyboard and tap to slice included. Accessibility is never deferred.

### Risks

| Risk                                                                    | Mitigation                                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| It confounds the running price test                                     | Post-freeze, or both arms on the same day with the deploy time recorded. Analyse within periods, not across them              |
| An analytics batch is rejected if the browser and API catalogs differ   | Catalog changes ship in the shared package. Deploy the API (Pages Function) with or before the web; check the Lambda path too |
| Canvas 2D misses the frame budget on low-end phones                     | Phase 0 spike, adaptive quality, then WebGL through a small library as the fallback                                           |
| iOS: audio unlock, silent switch, edge-swipe back gesture, no vibration | Start on a gesture, `audioSession` ambient, full-screen dialog with `overscroll-behavior: contain`, vibration optional        |
| Claims creep into game copy over time                                   | One `copy.ts` file, scanned by `copy-claims.test.ts`. Fiction rules in section 2.1                                            |
| Looks too close to a known game                                         | Section 2.10 guardrails, plus an art review before launch                                                                     |
| Motion sickness or photosensitivity                                     | Section 6.3 defaults and the flash limits                                                                                     |
| Scope creep (leaderboards, sharing, more levels)                        | Out of scope. Leaderboards would collect personal data (section 8)                                                            |

## 8. Measuring engagement without sensitive data

The game uses the existing first-party pipeline unchanged: allowlisted catalog, consent and opt-out,
90-day retention, self-deletion, and small cells suppressed in reports (`MIN_REPORT_COUNT = 5`).
Game events are **first-party only**; none are forwarded to GA4.

### 8.1 Proposed catalog additions

| Event           | When                                  | Props (enums and bands only)                                                                                         | Once            |
| --------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| `game_opened`   | The game dialog is shown              | `entry`: hero, deep-link, other                                                                                      | view            |
| `game_stage`    | A story beat is reached               | `stage`: level1_start, edge_half, edge_gone, service_start, service_skipped, service_done, level2_start, level2_done | view, per stage |
| `game_result`   | A level ends                          | `level`: 1, 2; `score`: 0, 1-24, 25-99, 100-199, 200+; `time`: the existing `TIME_BANDS`                             | view, per level |
| `game_closed`   | Closed before Level 2 is complete     | `stage`: the last stage reached                                                                                      | view            |
| `game_feedback` | Optional thumbs on the results screen | `vote`: up, down                                                                                                     | view            |

Reused events and vocabularies:

- `cta_click` with `{ cta: "sharpen", location: "game" }` and `booking_opened` with
  `{ location: "game" }`. This puts game-originated bookings into the existing funnel. It needs
  `"game"` added to `LOCATIONS`.
- `client_error` with `area: "game"` for a failed chunk load or a runtime error. It needs `"game"`
  added to `CLIENT_ERROR_AREAS`.

At most about 15 game events per page load, well under `MAX_EVENTS_PER_VIEW = 80`. "Once per view"
means replays are not counted again, which is intended: it counts reach, not grinding. If replays
matter later, add an `attempt` enum (1, 2, 3+) instead of exact counts.

### 8.2 Never collected

- Pointer or touch paths, coordinates, swipe speeds, keystrokes, or exact scores and timings.
- Input method, and **accessibility settings** (reduced motion, Relaxed mode, mute, vibration).
  These can reveal disability and add fingerprinting entropy. Accessibility is validated by testing
  and feedback instead.
- Device motion or orientation, camera, microphone, and Web Audio output (reading audio back is a
  known fingerprinting technique; the game only plays sound).
- Names, initials, leaderboards, or share links that carry scores.

### 8.3 Stored only in the browser

| Key              | Holds                                                           | Notes               |
| ---------------- | --------------------------------------------------------------- | ------------------- |
| `wkc.game.prefs` | Sound, vibration, Relaxed mode, and the reduced-motion override | Never sent anywhere |
| `wkc.game.best`  | Best Level 2 score                                              | Never sent anywhere |

Both keys are added to the storage table in `docs/analytics-privacy.md` and to the privacy panel's
description. Recommended: "Delete my analytics data" clears them too, so one button clears
everything the site stored (an owner decision; section 10).

### 8.4 What to look at

| Question                      | Measure (per arm and device class, within a period after the deploy)                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Do visitors find and open it? | Visitors with `game_opened` ÷ landing visitors                                                                           |
| Does the story land?          | Funnel: `level1_start` → `edge_gone` → `service_done` (vs `service_skipped`) → `level2_start` → `level2_done`            |
| Is it fun?                    | `level2_done` ÷ `level2_start`; the up share of `game_feedback`; distribution of `game_result.time`                      |
| Does it lead to bookings?     | `cta_click` (location game) ÷ `game_opened`; then `booking_opened` (game) → `checkout_started` → paid orders             |
| Does it hurt anything?        | Arm conversion before vs after the deploy; `web_vitals` for visitors who never open the game; `client_error` (area game) |

How to read it:

- People who open a game are already engaged, so a higher booking rate among them is **not
  causal**.
- Decisions stay on paid orders, as in `docs/experiment-plan.md`.
- Small cells are suppressed.
- For a causal read after the freeze, the owner could approve a holdout: show the entry button to
  half of visitors, using a deterministic bucket from the visitor id that is independent of the
  price arm. That is a separate, reviewed change to assignment and reporting, not part of this
  build.

## 9. Verification plan (for the build)

- **Unit (Vitest):**
  - The band and cut table.
  - The drain guarantee: the meter reaches 0 in Level 1 whatever the input.
  - Projection and its inverse, and seeded spawn determinism.
  - Keyboard lane mapping and the adaptive-quality policy.
  - The catalog accepts the new events and rejects unknown values.
  - `copy-claims.test.ts` scans `src/game/copy.ts`.
- **End to end (Playwright, existing config):**
  - `/a#play`: play with the keyboard → CTA → the booking sheet shows $39 for 4 knives.
  - `/b#play`: the same → $49 for 5 knives.
  - `/` with reduced motion emulated: the static variant renders and is playable.
  - Esc pauses, and mute survives a reload.
  - Closing restores focus to the opener.
  - No console errors, and no horizontal overflow at 320 px.
  - With the flag off, `#play` does nothing and the game chunk is never requested.
- **Performance:** a trace at 4× CPU throttle with frame-time sampling against section 5, and a
  bundle-size check of the main and game chunks.
- **Manual:**
  - iOS Safari, Android Chrome, and desktop Chrome, Firefox and Safari.
  - VoiceOver and NVDA on the menus and screen S9.
  - A test with the silent switch on.
- **Existing suites:** `pnpm lint`, `pnpm typecheck`, `pnpm test` and the browser checks in
  `docs/browser-checks.md` all pass unchanged for `/`, `/a` and `/b`.

## 10. Decisions for the owner

| #   | Decision                                                                                  | Recommendation                                                                                                       |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | The brief says "professional sharpening". The copy rule bans "professional".              | Keep the rule: "pickup, sharpening and return". Change it only with evidence and an update to `copy-claims.test.ts`. |
| 2   | When to ship                                                                              | After the freeze. Otherwise an owner exception that ships to both arms the same day, with the deploy time recorded.  |
| 3   | Entry point                                                                               | The `#play` deep link first (for social posts). Add the hero "Play" button after the freeze.                         |
| 4   | How the sharpening beat looks                                                             | Abstract glint and sparks. Show a specific tool only if it is what is actually used.                                 |
| 5   | The optional `game_feedback` thumbs                                                       | Include it: one enum, and the cheapest "is it fun" signal.                                                           |
| 6   | Should "Delete my analytics data" also clear the game's local preferences and best score? | Yes, for one clear "forget me" button.                                                                               |
| 7   | Full scope or the 2-week first cut                                                        | The first cut if the goal is to test interest. Full scope if it is a brand piece.                                    |
