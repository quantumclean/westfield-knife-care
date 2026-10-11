# Launch film

The 23-second film on the homepage (`apps/web/src/sections/LaunchVideo.tsx`),
built as code so it can be re-cut when the service changes. Four beats and
an end card, almost no copy:

> **Dull.** · **Sharp.** · **Picked up at your door.** · **Back on your doorstep.** · logo + CTA

See `STORYBOARD.md` for the shot list and the rules it follows. The most
important one: the homepage A/B tests price and offer copy, so the film
shows no price and makes **no timing promise** (the owner's 2026-10-09
copy rules ban unverified speed claims). One cut serves every visitor.
Its look follows the site's "Workshop paper" style: paper stage, ink type
in Instrument Serif, forest and tomato accents.

| Path                  | What it is                                                                            |
| --------------------- | ------------------------------------------------------------------------------------- |
| `cues.json`           | Single source of timing and copy: lines, scenes, harmony changes, every sound effect  |
| `composition/`        | HTML + GSAP (SplitText, DrawSVG) composition; `scenes.js` builds one paused timeline  |
| `composition/art.js`  | Hand-built vector art: knife (dull and sharp), tomato and slices, board, doorway, bag |
| `audio/soundtrack.py` | Original score and sound design, synthesized with numpy/scipy, normalized to -16 LUFS |
| `render.mjs`          | Frame capture (Playwright) → ffmpeg → MP4 + WebM + poster, 16:9 and 1:1 formats       |
| `serve.mjs`           | Local static server; `node serve.mjs` to scrub the composition in a browser           |

## Re-rendering

Needs Node 22, Python 3 with numpy and scipy, and ffmpeg built with
libx264, libvpx-vp9 and libopus.

```sh
cd marketing/launch-video
npm install
npx playwright install chromium          # once, if Playwright has no browser yet
npm run audio                            # -> audio/soundtrack.wav
node render.mjs --stills 5.9,14.5        # quick PNG checks in out/stills/
node render.mjs --publish                # both formats -> out/, copied to apps/web/public/video/
```

Output is `launch-{format}-v3.{mp4,webm}` plus `-poster.jpg` (the
frame at `cues.json` `poster`). Output is identical on every run: frames
come from seeking the timeline to exact times, never from wall-clock
playback.

**Bump `VERSION`** in both `render.mjs` and `LaunchVideo.tsx` before
publishing a new render. The deploy caches everything but HTML as
immutable for a year, so reusing a filename would leave returning visitors
on the old video.

## Changing the words

The pickup and return lines live in `cues.json` under `copy`; the beat
words and end card are in `composition/scenes.js`. Keep claims to what the
site states for every visitor (`packages/shared/src/content.ts`, the FAQ)
and inside `apps/web/test/copy-claims.test.ts`, and update the transcript
in `LaunchVideo.tsx` to match. Keep type large: the 1:1 format is watched at
about 350px wide.
