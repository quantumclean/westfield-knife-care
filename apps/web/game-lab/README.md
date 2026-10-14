# The Edge Returns: game-lab prototype

A playable vertical slice of the game in `docs/game/the-edge-returns-design.md` (PR #31).
It covers Level 1 (Dull Days), the pickup, sharpening and return intermission, Level 2 (The
Edge Returns) and the results.

**Isolated on purpose.** This folder has its own Vite config, so `vite build` for the site (and
so Cloudflare Pages) never includes it. It has no route in the site, no link from the site, no
booking, payment, analytics, session or API code, and it collects nothing. Settings and the best
score stay in this browser's `localStorage` (`wkc.game.prefs`, `wkc.game.best`). The production
game stays off until the launch freeze ends.

## Run it

```sh
pnpm install
pnpm --filter @wkc/web dev:game-lab      # http://localhost:5174/game-lab/
```

The dev server listens on your network (`host: true`), so a phone on the same Wi-Fi can open
`http://<computer-ip>:5174/game-lab/`. On Windows, find the IP with `ipconfig` (IPv4 Address),
and allow Node.js through Windows Defender Firewall on private networks when prompted.

URL options for playtesting (query string, dev or static build only):

| Option           | Effect                                          |
| ---------------- | ----------------------------------------------- |
| `?l1=quick`      | Level 1 about 25 s (default)                    |
| `?l1=full`       | Level 1 about 45 s                              |
| `?l1=20&l2=30`   | Exact lengths in seconds (8 to 180)             |
| `?speed=2`       | Run time faster                                 |
| `?seed=5`        | Repeatable spawns                               |
| `?motion=reduce` | Reduced motion regardless of the device setting |
| `?test`          | Exposes read-only state as `window.__gameLab`   |

The title screen also has a Quick/Full switch, sound and motion settings.

## Controls

- Swipe (finger or mouse) through ingredients as they hop up off the counter. A tap on an
  ingredient also cuts it.
- Keyboard: ← ↓ → (or A S D, 1 2 3) cut the left, middle or right lane; Space sweeps; Esc or P
  pauses; M mutes.
- Sharpening: swipe back and forth, press ← →, or tap Sharpen.

## Build and test

```sh
pnpm --filter @wkc/web build:game-lab                  # static site in .tmp/game-lab-dist (relative paths)
pnpm --filter @wkc/web build:game-lab --mode artifact  # also a single self-contained artifact.html
pnpm --filter @wkc/web test                            # includes test/game-lab-sim.test.ts
pnpm --filter @wkc/web test:game-lab                   # Playwright: iPhone-sized and desktop Chromium
GAME_LAB_STATIC=1 pnpm --filter @wkc/web test:game-lab         # against the static build, from a subpath
GAME_LAB_STATIC=artifact pnpm --filter @wkc/web test:game-lab  # against the single-file build
```

Chromium's phone emulation is not iOS Safari: check touch, audio and the silent switch on a real
iPhone.

## Layout

- `src/sim/`: the pure simulation (edge bands, spawns, cutting, scoring, phases), unit-tested.
- `src/render/`: Canvas 2D drawing: the pseudo-3D kitchen, street and bench, sprites and effects.
- `src/engine.ts`: the game loop; `src/input.ts`: pointer input; `src/audio.ts`: synthesized sound.
- `src/GameLab.tsx`: Preact screens and the DOM HUD; `src/copy.ts`: every visible string.
- Reuses `src/toy/geometry.ts` (hit tests, cut angles, trail) and `src/art/fruit.ts` (fruit art)
  from the site without changing them.
