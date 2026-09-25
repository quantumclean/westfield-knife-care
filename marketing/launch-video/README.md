# Launch film

The 23-second film on the homepage (`apps/web/src/sections/LaunchVideo.tsx`),
built as code so it can be re-cut when the service changes. Four beats and
an end card, almost no copy:

> **Dull.** · **Sharp.** · **Picked up today.** · **Back tomorrow.** · logo + CTA

See `STORYBOARD.md` for the shot list and the rules it follows. The most
important one: the return line is a turnaround promise, and the homepage
A/B tests turnaround, so there is one **cut per offer**, each repeating
only that offer's own promise. Visuals are identical across cuts.

| Cut | Offer       | Pickup line        | Return line           | Offer's own promise                 |
| --- | ----------- | ------------------ | --------------------- | ----------------------------------- |
| `a` | `offer-001` | Picked up at home. | Back within 48 hours. | "Back at your door within 48 hours" |
| `b` | `offer-002` | Picked up today.   | Back tomorrow.        | "Back at your door the next day"    |

The homepage picks the cut from the visitor's assigned offer and shows no
video for an offer that has no cut. Adding an offer with a different
promise means adding a cut to `cues.json`, rendering it, and adding it to
`VIDEO_BY_OFFER` in `LaunchVideo.tsx`.

| Path                  | What it is                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `cues.json`           | Single source of timing and copy: cuts, scenes, harmony changes, every sound effect      |
| `composition/`        | HTML + GSAP (SplitText, DrawSVG) composition; `scenes.js` builds one paused timeline     |
| `composition/art.js`  | Hand-built vector art: knife (dull and sharp), tomato and slices, board, doorway, bag    |
| `audio/soundtrack.py` | Original score and sound design, synthesized with numpy/scipy, normalized to -16 LUFS    |
| `render.mjs`          | Frame capture (Playwright) → ffmpeg → MP4 + WebM + poster, per cut, 16:9 and 1:1 formats |
| `serve.mjs`           | Local static server; `node serve.mjs` to scrub the composition in a browser              |

## Re-rendering

Needs Node 22, Python 3 with numpy and scipy, and ffmpeg built with
libx264, libvpx-vp9 and libopus.

```sh
cd marketing/launch-video
npm install
npx playwright install chromium          # once, if Playwright has no browser yet
npm run audio                            # -> audio/soundtrack.wav
node render.mjs --cut b --stills 5.9,14.5  # quick PNG checks in out/stills/
node render.mjs --publish                # every cut x format -> out/, copied to apps/web/public/video/
```

Output is `launch-{cut}-{format}-v1.{mp4,webm}` plus `-poster.jpg` (the
frame at `cues.json` `poster`). Output is identical on every run: frames
come from seeking the timeline to exact times, never from wall-clock
playback. The soundtrack is shared by all cuts; only on-screen words differ.

**Bump `VERSION`** in both `render.mjs` and `LaunchVideo.tsx` before
publishing a new render. The deploy caches everything but HTML as
immutable for a year, so reusing a filename would leave returning visitors
on the old video.

## Changing the words

The pickup and return lines live in `cues.json` under `cuts`; the beat
words and end card are in `composition/scenes.js`. Keep claims to what the
site already states for that offer (`packages/shared/src/experiments.ts`,
`content.ts`, the FAQ), and update the per-cut transcript in
`LaunchVideo.tsx` to match. Keep type large: the 1:1 format is watched at
about 350px wide.
