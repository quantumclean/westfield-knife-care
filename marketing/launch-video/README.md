# Launch video

The 50-second motion-graphics video on the homepage (`apps/web/src/sections/LaunchVideo.tsx`),
built as code so it can be re-cut when the service changes. See
`STORYBOARD.md` for the script and the rules it follows — most importantly,
it never shows a price, an offer headline or a turnaround time, because the
homepage A/B tests those and both arms must see an identical video.

| Path                  | What it is                                                                              |
| --------------------- | --------------------------------------------------------------------------------------- |
| `cues.json`           | Single source of timing: scenes and every sound effect, at 120 BPM                      |
| `composition/`        | HTML + GSAP composition; `scenes.js` builds a paused timeline seeked frame by frame     |
| `composition/art.js`  | Hand-built vector art: knife, tomato and slices, board, whetstone, door, van, route map |
| `audio/soundtrack.py` | Original music and sound design, synthesized with numpy/scipy, normalized to -16 LUFS   |
| `render.mjs`          | Frame capture (Playwright) → ffmpeg → MP4 + WebM + poster, 16:9 and 1:1 cuts            |
| `serve.mjs`           | Local static server; `node serve.mjs` to scrub the composition in a browser             |
| `assets/photos.json`  | Chosen stock photos for an optional photographic cut, with licenses                     |
| `fetch-photos.mjs`    | Downloads those photos; the composition swaps them in wherever a file exists            |

## Re-rendering

Needs Node 22, Python 3 with numpy and scipy, and ffmpeg built with
libx264, libvpx-vp9 and libopus.

```sh
cd marketing/launch-video
npm install
npx playwright install chromium        # once, if Playwright has no browser yet
npm run audio                          # -> audio/soundtrack.wav
node render.mjs --stills 9.5,16.8      # quick PNG checks in out/stills/
node render.mjs --publish              # both cuts -> out/, then copied to apps/web/public/video/
```

A full render of both cuts takes roughly half an hour on a 4-core machine
with software rendering. Output is identical on every run: frames come from
seeking the timeline to exact times, never from wall-clock playback.

**Bump `VERSION`** in both `render.mjs` and `LaunchVideo.tsx` before
publishing a new render. The deploy caches everything but HTML as
immutable for a year, so reusing a filename would leave returning visitors
on the old video.

## Photographic cut

The shipped video uses vector art throughout. `assets/photos.json` lists
real photos for the pickup, sharpening and slicing scenes. To use them, run
`node fetch-photos.mjs` (Unsplash downloads automatically; the Pixabay
whetstone photo has to be saved by hand as `assets/photos/sharpen.jpg`),
look at each one, then re-render with a new `VERSION`. Any scene without a
photo file keeps its vector art. Those hosts were blocked by the network
policy of the environment this was built in, which is why the first cut is
all vector.

## Changing the words

All copy lives in `composition/scenes.js`. Keep claims to what the site
already states (`packages/shared/src/content.ts`, the FAQ), keep it
experiment-neutral, and keep type sizes large — the 1:1 cut is watched at
about 350px wide.
