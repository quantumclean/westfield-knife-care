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

export function whetstone(p) {
  return `<svg class="stone-svg" viewBox="0 0 1000 420" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-top" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eb9a63"/><stop offset="1" stop-color="#c7672f"/>
    </linearGradient>
    <linearGradient id="${p}-front" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b35a2b"/><stop offset="1" stop-color="#8c421c"/>
    </linearGradient>
    <linearGradient id="${p}-base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a3f43"/><stop offset="1" stop-color="#1c1f22"/>
    </linearGradient>
    <radialGradient id="${p}-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#000000" stop-opacity="0.5"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="500" cy="372" rx="480" ry="40" fill="url(#${p}-shadow)"/>
  <path d="M90 290 L910 290 L950 352 L50 352 Z" fill="url(#${p}-base)"/>
  <path d="M90 290 L910 290" stroke="#5a6065" stroke-width="3"/>
  <path d="M150 180 L850 180 L892 252 L108 252 Z" fill="url(#${p}-top)"/>
  <path d="M108 252 L892 252 L892 300 L108 300 Z" fill="url(#${p}-front)"/>
  <ellipse cx="380" cy="214" rx="120" ry="14" fill="#ffffff" opacity="0.16"/>
  <ellipse cx="640" cy="222" rx="80" ry="9" fill="#ffffff" opacity="0.12"/>
  <path d="M230 228 C 400 212 560 236 760 214" stroke="#f7c29b" stroke-opacity="0.45" stroke-width="5" fill="none"/>
  <g class="sparks"></g>
</svg>`;
}

export function doorScene(p) {
  const siding = Array.from({ length: 18 }, (_, i) => 30 + i * 46)
    .map((y) => `<path d="M0 ${y} H1000" stroke="#e1d5bd" stroke-width="3"/>`)
    .join("");
  return `<svg class="door-svg" viewBox="0 0 1000 900" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-win" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffefbf"/><stop offset="1" stop-color="#f5b75a"/>
    </linearGradient>
    <radialGradient id="${p}-glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd98a" stop-opacity="0.55"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${p}-knob" cx="0.35" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#fff0b8"/><stop offset="1" stop-color="#bf8a25"/>
    </radialGradient>
    <linearGradient id="${p}-door" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a6444"/><stop offset="1" stop-color="#1a4230"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="900" fill="#efe5d3"/>
  ${siding}
  <circle cx="262" cy="310" r="230" fill="url(#${p}-glow)"/>
  <rect x="318" y="160" width="364" height="578" rx="10" fill="#fbfaf6"/>
  <rect x="345" y="188" width="310" height="552" rx="6" fill="url(#${p}-door)"/>
  <rect x="382" y="226" width="236" height="156" rx="10" fill="url(#${p}-win)"/>
  <path d="M500 226 V382 M382 304 H618" stroke="#1d4631" stroke-width="10"/>
  <rect x="382" y="422" width="100" height="264" rx="8" fill="none" stroke="#153626" stroke-width="7"/>
  <rect x="518" y="422" width="100" height="264" rx="8" fill="none" stroke="#153626" stroke-width="7"/>
  <circle cx="616" cy="470" r="14" fill="url(#${p}-knob)"/>
  <rect x="712" y="238" width="78" height="52" rx="8" fill="#1f4d34"/>
  <text x="751" y="275" text-anchor="middle" font-family="Inter Variable, sans-serif" font-weight="800" font-size="30" fill="#f3f0e6">12</text>
  <rect x="244" y="270" width="36" height="66" rx="8" fill="#23272b"/>
  <circle cx="262" cy="316" r="14" fill="#ffe29a"/>
  <rect x="0" y="812" width="1000" height="88" fill="#a79d8f"/>
  <rect x="262" y="772" width="476" height="48" rx="4" fill="#b8b1a5"/>
  <rect x="292" y="736" width="416" height="42" rx="4" fill="#cdc6ba"/>
  <rect x="384" y="712" width="232" height="30" rx="8" fill="#6b4a2e" stroke="#523820" stroke-width="4"/>
  <g transform="translate(770 600)">
    <path d="M-44 20 L44 20 L34 136 L-34 136 Z" fill="#c66c40"/>
    <rect x="-50" y="8" width="100" height="22" rx="6" fill="#b25d33"/>
    <ellipse cx="-28" cy="-24" rx="22" ry="54" transform="rotate(-28 -28 -24)" fill="#4f9a4a"/>
    <ellipse cx="26" cy="-30" rx="22" ry="58" transform="rotate(24 26 -30)" fill="#3e823b"/>
    <ellipse cx="0" cy="-52" rx="20" ry="60" fill="#5aa853"/>
  </g>
  <g class="bag">
    <path d="M470 646 C470 596 530 596 530 646" stroke="#c7b58c" stroke-width="9" fill="none"/>
    <path d="M488 646 C488 610 512 610 512 646" stroke="#b9a67c" stroke-width="7" fill="none"/>
    <path d="M438 640 H562 L572 718 C572 726 566 732 558 732 H442 C434 732 428 726 428 718 Z" fill="#efe3c8" stroke="#d3c19d" stroke-width="4"/>
    <path d="M448 660 H552" stroke="#dccda9" stroke-width="3"/>
    <g transform="translate(528 664) rotate(8)">
      <rect x="-2" y="0" width="44" height="30" rx="5" fill="#1f4d34"/>
      <path d="M8 24 L18 14 M18 14 L28 4 C30 2 33 4 31 7 L22 16 L20 12 Z" stroke="#f3f0e6" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;
}

export function van(p) {
  return `<svg class="van-svg" viewBox="0 0 760 380" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${p}-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#d4ecf6"/><stop offset="1" stop-color="#7fb0c9"/>
    </linearGradient>
    <linearGradient id="${p}-body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9ece8"/>
    </linearGradient>
    <radialGradient id="${p}-hub" cx="0.4" cy="0.4" r="0.7">
      <stop offset="0" stop-color="#e3e8ea"/><stop offset="1" stop-color="#8a9398"/>
    </radialGradient>
  </defs>
  <ellipse cx="390" cy="364" rx="360" ry="14" fill="#000000" opacity="0.25"/>
  <path d="M40 250 L40 176 C40 156 54 144 74 140 L192 112 C212 72 242 60 282 60 L702 60 C727 60 742 75 742 100 L742 292 C742 307 730 318 714 318 L62 318 C50 318 40 308 40 296 Z" fill="url(#${p}-body)" stroke="#cfd4d0" stroke-width="3"/>
  <path d="M204 116 L262 74 L336 74 L336 152 L204 152 Z" fill="url(#${p}-glass)"/>
  <rect x="356" y="80" width="120" height="72" rx="10" fill="url(#${p}-glass)"/>
  <rect x="40" y="198" width="702" height="36" fill="#1f4d34"/>
  <rect x="40" y="236" width="702" height="8" fill="#8fbf5f"/>
  <text x="612" y="178" text-anchor="middle" font-family="Inter Variable, sans-serif" font-weight="800" font-size="24" letter-spacing="3" fill="#1f4d34">WESTFIELD</text>
  <text x="612" y="296" text-anchor="middle" font-family="Inter Variable, sans-serif" font-weight="700" font-size="18" letter-spacing="4" fill="#6a716c">KNIFE CARE</text>
  <path d="M344 162 V310" stroke="#d3d8d4" stroke-width="3"/>
  <ellipse cx="54" cy="222" rx="12" ry="18" fill="#ffe7a0"/>
  <rect x="26" y="284" width="130" height="26" rx="12" fill="#2a2e31"/>
  <circle cx="176" cy="318" r="62" fill="#2a2e31"/>
  <circle cx="604" cy="318" r="62" fill="#2a2e31"/>
  <g class="wheel" transform="translate(176 318)"><circle r="48" fill="#1b1e21"/><circle r="24" fill="url(#${p}-hub)"/><path d="M-24 0 H24 M0 -24 V24" stroke="#6d767b" stroke-width="4"/></g>
  <g class="wheel" transform="translate(604 318)"><circle r="48" fill="#1b1e21"/><circle r="24" fill="url(#${p}-hub)"/><path d="M-24 0 H24 M0 -24 V24" stroke="#6d767b" stroke-width="4"/></g>
</svg>`;
}

/** Street-grid neighborhood with a delivery route. */
export function routeMap(p, rand) {
  const cols = [
    [40, 206],
    [234, 396],
    [424, 586],
    [614, 760],
  ];
  const rows = [
    [40, 176],
    [204, 356],
    [384, 520],
  ];
  let blocks = "";
  let houses = "";
  cols.forEach(([x0, x1], ci) =>
    rows.forEach(([y0, y1], ri) => {
      const park = ci === 3 && ri === 0;
      blocks += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="16" fill="${park ? "#cfe3bd" : "#fbfbf7"}"/>`;
      if (park) {
        for (let i = 0; i < 6; i++) {
          const x = x0 + 24 + rand() * (x1 - x0 - 48);
          const y = y0 + 24 + rand() * (y1 - y0 - 48);
          houses += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(10 + rand() * 8).toFixed(1)}" fill="#9cc57d"/>`;
        }
        return;
      }
      for (let hx = x0 + 14; hx < x1 - 30; hx += 36) {
        houses += `<rect x="${hx}" y="${y0 + 12}" width="24" height="18" rx="4" fill="#e2e8d9"/>`;
        houses += `<rect x="${hx}" y="${y1 - 30}" width="24" height="18" rx="4" fill="#e2e8d9"/>`;
      }
    }),
  );
  const pins = [
    [220, 112],
    [330, 190],
    [410, 290],
    [516, 370],
  ]
    .map(
      ([x, y], i) => `<g class="pin" data-i="${i}" transform="translate(${x} ${y})">
      <g class="pin-inner">
        <ellipse cx="0" cy="2" rx="12" ry="5" fill="#000000" opacity="0.18"/>
        <path d="M0 0 C-14 -18 -24 -30 -24 -44 A24 24 0 1 1 24 -44 C24 -30 14 -18 0 0 Z" fill="#1f4d34"/>
        <circle cx="0" cy="-44" r="9" fill="#f3f0e6"/>
      </g>
    </g>`,
    )
    .join("");
  return `<svg class="map-svg" viewBox="0 0 800 560" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="560" rx="30" fill="#e3eada"/>
  ${blocks}
  ${houses}
  <path class="route-glow" d="M220 30 V190 H410 V370 H600 V530" stroke="#9ccc6e" stroke-opacity="0.45" stroke-width="22" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path class="route" id="${p}-route" d="M220 30 V190 H410 V370 H600 V530" stroke="#1f4d34" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${pins}
  <g class="van-dot"><circle r="17" fill="#9ccc6e" stroke="#ffffff" stroke-width="5"/></g>
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

export function cursor() {
  return `<svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 2 L3 28 L9.5 21.5 L14 32.5 L19 30.5 L14.5 19.5 L24 19.5 Z" fill="#ffffff" stroke="#111814" stroke-width="2" stroke-linejoin="round"/>
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
