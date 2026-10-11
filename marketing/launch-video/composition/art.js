// Vector hero objects for the launch video. Each function returns an SVG
// string; `p` is an id prefix so gradients stay unique when an object
// appears more than once on the stage. Animated parts carry classes that
// scenes.js targets with GSAP.
//
// Colors follow the site's design tokens (packages/ui/src/styles.css):
// primary #1f4d34, accent #8fbf5f, cream #f3f0e6.

const BLADE = "M640 56 L170 70 C110 72 60 92 28 126 C120 144 380 148 640 140 Z";
const BEVEL = "M28 126 C120 134 380 134 640 124 L640 140 C380 148 120 144 28 126 Z";
const EDGE = "M28 126 C120 144 380 148 640 140";

export function knife(p, { dull = false } = {}) {
  const top = dull ? "#a3a9ad" : "#f6f9fb";
  const mid = dull ? "#838a8f" : "#d3dbe0";
  const bot = dull ? "#646b70" : "#9aa7af";
  return `<svg class="knife-svg" viewBox="0 0 1000 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-blade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${bot}"/>
    </linearGradient>
    <linearGradient id="${p}-bevel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${dull ? "#72797e" : "#e6ecef"}"/><stop offset="1" stop-color="${dull ? "#50575b" : "#ffffff"}"/>
    </linearGradient>
    <linearGradient id="${p}-handle" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#40464b"/><stop offset="0.35" stop-color="#24282c"/><stop offset="1" stop-color="#111316"/>
    </linearGradient>
    <linearGradient id="${p}-bolster" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#848e94"/><stop offset="0.5" stop-color="#e6ebee"/><stop offset="1" stop-color="#737d83"/>
    </linearGradient>
    <radialGradient id="${p}-rivet" cx="0.35" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#b5bec3"/><stop offset="1" stop-color="#6a7378"/>
    </radialGradient>
    <linearGradient id="${p}-glint" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="1"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${p}-clip"><path d="${BLADE}"/></clipPath>
  </defs>
  <path d="${BLADE}" fill="url(#${p}-blade)"/>
  <path d="${BEVEL}" fill="url(#${p}-bevel)" opacity="${dull ? 0.7 : 0.95}"/>
  ${
    dull
      ? `<path d="${EDGE}" fill="none" stroke="#3b4145" stroke-width="5" stroke-dasharray="22 9 7 15 30 8" opacity="0.85"/>`
      : `<path d="${EDGE}" fill="none" stroke="#ffffff" stroke-width="2.5" opacity="0.9"/>`
  }
  <path d="M168 76 L630 63" stroke="#ffffff" stroke-opacity="${dull ? 0.25 : 0.8}" stroke-width="3" stroke-linecap="round"/>
  <g clip-path="url(#${p}-clip)">
    <rect class="glint" x="-260" y="-20" width="170" height="240" fill="url(#${p}-glint)" transform="skewX(-22)" opacity="0"/>
  </g>
  <rect x="636" y="50" width="32" height="96" rx="7" fill="url(#${p}-bolster)"/>
  <path d="M668 58 L930 62 C960 63 978 80 978 100 C978 120 960 136 930 138 L668 142 Z" fill="url(#${p}-handle)"/>
  <path d="M684 67 L926 71" stroke="#ffffff" stroke-opacity="0.16" stroke-width="3" stroke-linecap="round"/>
  <circle cx="748" cy="100" r="9" fill="url(#${p}-rivet)"/>
  <circle cx="832" cy="100" r="9" fill="url(#${p}-rivet)"/>
  <circle cx="912" cy="100" r="9" fill="url(#${p}-rivet)"/>
  <g class="tip-flare" transform="translate(34 126)" opacity="0">
    <path d="M0 -46 L6 -6 L46 0 L6 6 L0 46 L-6 6 L-46 0 L-6 -6 Z" fill="#ffffff"/>
    <circle r="10" fill="#ffffff"/>
  </g>
</svg>`;
}

export function tomato(p) {
  const leaves = [-162, -118, -70, -22, 22]
    .map(
      (a) =>
        `<path d="M0 0 C12 -12 42 -14 60 -3 C42 5 14 9 0 0 Z" transform="rotate(${a})" fill="url(#${p}-leaf)" stroke="#2d6a2a" stroke-width="2"/>`,
    )
    .join("");
  return `<svg class="tomato-svg" viewBox="0 0 400 380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${p}-t" cx="0.38" cy="0.36" r="0.78">
      <stop offset="0" stop-color="#ff9272"/><stop offset="0.42" stop-color="#ee4b31"/><stop offset="1" stop-color="#a3211a"/>
    </radialGradient>
    <radialGradient id="${p}-hl" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${p}-leaf" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a8a35"/><stop offset="1" stop-color="#5fb04f"/>
    </linearGradient>
  </defs>
  <path d="M200 90 C292 86 362 142 362 220 C362 302 292 352 200 352 C108 352 38 302 38 220 C38 142 108 86 200 90 Z" fill="url(#${p}-t)"/>
  <path d="M200 98 C168 152 164 252 188 344" stroke="#b3241b" stroke-opacity="0.28" stroke-width="5" fill="none"/>
  <path d="M200 98 C236 152 242 252 216 344" stroke="#b3241b" stroke-opacity="0.28" stroke-width="5" fill="none"/>
  <ellipse cx="136" cy="168" rx="46" ry="28" transform="rotate(-32 136 168)" fill="url(#${p}-hl)"/>
  <path d="M200 94 C197 72 204 58 216 50" stroke="#3a7a32" stroke-width="10" stroke-linecap="round" fill="none"/>
  <g transform="translate(200 96)">${leaves}</g>
</svg>`;
}

/** A tomato cross-section, face on. */
export function tomatoSlice(p) {
  const locules = [0, 90, 180, 270]
    .map((a) => {
      const seeds = [-18, 0, 18]
        .map((dy) => `<ellipse cx="${(dy / 3) | 0}" cy="${dy}" rx="5" ry="8" fill="#fff4d6"/>`)
        .join("");
      return `<g transform="rotate(${a} 150 150) translate(150 88)">
        <ellipse rx="34" ry="46" fill="url(#${p}-gel)"/>${seeds}
      </g>`;
    })
    .join("");
  return `<svg class="slice-svg" viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${p}-flesh" cx="0.45" cy="0.42" r="0.6">
      <stop offset="0" stop-color="#ff8f76"/><stop offset="1" stop-color="#ef5439"/>
    </radialGradient>
    <radialGradient id="${p}-gel" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stop-color="#ffd7c4"/><stop offset="1" stop-color="#ffab8f"/>
    </radialGradient>
  </defs>
  <circle cx="150" cy="150" r="140" fill="#c8301f"/>
  <circle cx="150" cy="150" r="128" fill="url(#${p}-flesh)"/>
  ${locules}
  <circle cx="150" cy="150" r="24" fill="#ffc3ad"/>
  <ellipse cx="108" cy="92" rx="34" ry="16" transform="rotate(-35 108 92)" fill="#ffffff" opacity="0.28"/>
</svg>`;
}

export function board(p) {
  const grain = [100, 135, 172, 205, 240]
    .map(
      (y, i) =>
        `<path d="M60 ${y} C ${300 + i * 20} ${y - 18} ${620 - i * 15} ${y + 22} 1080 ${y - 6}" stroke="#8a5a2b" stroke-opacity="0.2" stroke-width="3" fill="none"/>`,
    )
    .join("");
  return `<svg class="board-svg" viewBox="0 0 1200 400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-wood" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="#e0b47a"/><stop offset="0.5" stop-color="#cc9452"/><stop offset="1" stop-color="#b27b3f"/>
    </linearGradient>
    <linearGradient id="${p}-side" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a6531"/><stop offset="1" stop-color="#6f4520"/>
    </linearGradient>
    <radialGradient id="${p}-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.45"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="600" cy="352" rx="620" ry="46" fill="url(#${p}-shadow)"/>
  <rect x="20" y="92" width="1160" height="240" rx="42" fill="url(#${p}-side)"/>
  <rect x="20" y="60" width="1160" height="240" rx="42" fill="url(#${p}-wood)"/>
  ${grain}
  <circle cx="1108" cy="180" r="26" fill="#83552a"/>
  <circle cx="1108" cy="184" r="22" fill="#5e3a18"/>
  <rect x="24" y="64" width="1152" height="232" rx="40" fill="none" stroke="#f3cf98" stroke-opacity="0.45" stroke-width="3"/>
</svg>`;
}

/** A front door at night or in the morning; the scene crossfades the two. */
export function doorway(p, mood) {
  const night = mood === "night";
  const c = night
    ? {
        wall0: "#121814",
        wall1: "#0b0f0d",
        trim: "#1d2521",
        door0: "#1b3d2c",
        door1: "#11281c",
        panel: "#0c1d14",
        floor: "#151a17",
        step: "#1b211d",
        mat: "#2b2119",
      }
    : {
        wall0: "#4a3d2c",
        wall1: "#2e2619",
        trim: "#e8dfcf",
        door0: "#347554",
        door1: "#245a3d",
        panel: "#1c4630",
        floor: "#7e715e",
        step: "#9a8c77",
        mat: "#6b4a2e",
      };
  return `<svg class="doorway-svg" viewBox="0 0 900 1000" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.wall0}"/><stop offset="1" stop-color="${c.wall1}"/>
    </linearGradient>
    <linearGradient id="${p}-door" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c.door0}"/><stop offset="1" stop-color="${c.door1}"/>
    </linearGradient>
    <linearGradient id="${p}-win" x1="0" y1="0" x2="0" y2="1">
      ${night ? '<stop offset="0" stop-color="#ffe2a0"/><stop offset="1" stop-color="#f0a646"/>' : '<stop offset="0" stop-color="#dcebf0"/><stop offset="1" stop-color="#a8c4cf"/>'}
    </linearGradient>
    <radialGradient id="${p}-lamp" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd98a" stop-opacity="0.5"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}-knob" cx="0.35" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#b98422"/>
    </radialGradient>
    <linearGradient id="${p}-sun" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffd7a0" stop-opacity="0.34"/><stop offset="1" stop-color="#ffd7a0" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="900" height="1000" fill="url(#${p}-wall)"/>
  ${night ? `<circle cx="160" cy="330" r="260" fill="url(#${p}-lamp)"/><ellipse cx="450" cy="300" rx="190" ry="150" fill="url(#${p}-lamp)" opacity="0.55"/>` : ""}
  <rect x="222" y="122" width="456" height="742" rx="8" fill="${c.trim}"/>
  <rect x="250" y="150" width="400" height="714" rx="4" fill="url(#${p}-door)"/>
  <rect x="292" y="196" width="316" height="190" rx="10" fill="url(#${p}-win)"/>
  <path d="M450 196 V386 M292 291 H608" stroke="${c.panel}" stroke-width="12"/>
  <rect x="292" y="432" width="136" height="378" rx="8" fill="none" stroke="${c.panel}" stroke-width="8"/>
  <rect x="472" y="432" width="136" height="378" rx="8" fill="none" stroke="${c.panel}" stroke-width="8"/>
  <circle cx="612" cy="540" r="15" fill="url(#${p}-knob)"/>
  <rect x="146" y="286" width="30" height="66" rx="8" fill="#1d2023"/>
  <circle cx="161" cy="330" r="12" fill="${night ? "#ffe6a6" : "#6f7471"}"/>
  <rect x="120" y="864" width="660" height="56" rx="4" fill="${c.step}"/>
  <rect x="0" y="920" width="900" height="80" fill="${c.floor}"/>
  <rect x="318" y="838" width="264" height="30" rx="8" fill="${c.mat}"/>
  ${night ? "" : `<path d="M0 0 H520 L900 700 V1000 H700 L0 160 Z" fill="url(#${p}-sun)"/>`}
</svg>`;
}

/** Canvas tote with three knife handles peeking out: what gets picked up. */
export function knifeBag(p) {
  const handle = (x, rot) => `<g transform="translate(${x} 128) rotate(${rot})">
    <rect x="-17" y="-118" width="34" height="126" rx="15" fill="url(#${p}-h)"/>
    <rect x="-17" y="-4" width="34" height="12" rx="3" fill="#b9c2c7"/>
    <circle cx="0" cy="-88" r="4.5" fill="#c9d0d4"/><circle cx="0" cy="-54" r="4.5" fill="#c9d0d4"/><circle cx="0" cy="-20" r="4.5" fill="#c9d0d4"/>
  </g>`;
  return `<svg class="bag-svg" viewBox="0 0 320 340" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a4045"/><stop offset="0.5" stop-color="#1c1f22"/><stop offset="1" stop-color="#0f1113"/>
    </linearGradient>
    <linearGradient id="${p}-canvas" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3e9d0"/><stop offset="1" stop-color="#d8c69f"/>
    </linearGradient>
    <radialGradient id="${p}-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.45"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="160" cy="326" rx="150" ry="14" fill="url(#${p}-shadow)"/>
  ${handle(118, -12)}${handle(160, 2)}${handle(202, 14)}
  <path d="M88 124 C88 52 140 52 140 124" stroke="#c7b387" stroke-width="12" fill="none"/>
  <path d="M180 124 C180 52 232 52 232 124" stroke="#c7b387" stroke-width="12" fill="none"/>
  <path d="M52 120 H268 L282 300 C284 314 274 324 260 324 H60 C46 324 36 314 38 300 Z" fill="url(#${p}-canvas)" stroke="#cbb68c" stroke-width="4"/>
  <path d="M52 120 H268 L270 142 H50 Z" fill="#ddcaa2"/>
  <g transform="translate(214 170) rotate(6)">
    <rect width="58" height="42" rx="7" fill="#1f4d34"/>
    <path d="M12 32 L24 20 M24 20 L38 7 C41 4 45 7 42 11 L30 22 L27 17 Z" stroke="#f3f0e6" stroke-width="3" fill="none" stroke-linecap="round"/>
  </g>
</svg>`;
}

/** Four-point sparkle, for "fresh edge" moments. */
export function sparkle() {
  return `<svg viewBox="-50 -50 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 -46 L7 -7 L46 0 L7 7 L0 46 L-7 7 L-46 0 L-7 -7 Z" fill="#ffffff"/>
</svg>`;
}

export function logoTile(p) {
  return `<svg class="logo-svg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-tile" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#357f57"/><stop offset="1" stop-color="#143726"/>
    </linearGradient>
    <linearGradient id="${p}-sheen" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="${p}-clip"><rect width="240" height="240" rx="60"/></clipPath>
  </defs>
  <rect width="240" height="240" rx="60" fill="url(#${p}-tile)"/>
  <g clip-path="url(#${p}-clip)"><rect class="sheen" x="-220" y="-40" width="120" height="320" fill="url(#${p}-sheen)" transform="skewX(-20)"/></g>
  <rect x="3" y="3" width="234" height="234" rx="57" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="3"/>
  <g transform="translate(120 122) rotate(-42) translate(-96 -20)">
    <path d="M0 22 C8 8 24 2 44 2 L120 2 L120 30 L20 30 C12 30 4 27 0 22 Z" fill="#f3f0e6"/>
    <path d="M10 26 C30 29 80 29 120 28" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.8"/>
    <rect x="120" y="-1" width="9" height="34" rx="3" fill="#caeea3"/>
    <rect x="129" y="3" width="66" height="26" rx="12" fill="#f3f0e6"/>
    <circle cx="148" cy="16" r="3.6" fill="#1d5238"/>
    <circle cx="174" cy="16" r="3.6" fill="#1d5238"/>
  </g>
</svg>`;
}

/** Seeded PRNG so every render is identical. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
