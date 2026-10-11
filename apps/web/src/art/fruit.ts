/**
 * Hand-inked fruit for the cutting board, the booking pass and loaders.
 *
 * Original artwork. Every fruit is drawn in its own coordinate system centred
 * on (0, 0): `whole` is the uncut fruit, `face` is its cross-section (what a
 * half shows once sliced) and `body` is the outline both share, used to clip
 * a cut line to the fruit. `bottom` is how far the fruit reaches below its
 * centre, so it can sit on the board. Colours are literal so the art reads
 * the same on paper by day and by night.
 */

export type FruitId = "tomato" | "lemon" | "apple" | "kiwi";

export interface FruitArt {
  id: FruitId;
  /** Radius used for hit testing and spacing. */
  r: number;
  bottom: number;
  body: string;
  whole: string;
  face: string;
  juice: string;
}

export const INK = "#1f2620";
const outline = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"`;

function ring(n: number, f: (i: number, a: number) => string): string {
  return Array.from({ length: n }, (_, i) => f(i, (i / n) * Math.PI * 2)).join("");
}
const fx = (v: number) => v.toFixed(1);

/* ---------- Tomato ---------- */
const TOMATO_BODY =
  "M0,-42 C30,-46 52,-22 51,6 C50,34 28,50 0,50 C-28,50 -50,34 -51,6 C-52,-22 -30,-46 0,-42 Z";
const tomato: FruitArt = {
  id: "tomato",
  r: 50,
  bottom: 50,
  body: TOMATO_BODY,
  juice: "#e5523a",
  whole: `
    <path d="${TOMATO_BODY}" fill="#e2482d" ${outline}/>
    <path d="M38,-12 C48,14 36,40 8,47 C30,36 40,16 38,-12Z" fill="#b5301d" opacity=".5"/>
    <path d="M-18,-38 C-29,-10 -27,24 -14,46 M18,-38 C29,-10 27,24 14,46" stroke="#b5301d" stroke-width="2" fill="none" opacity=".45"/>
    <path d="M-31,-12 C-28,-27 -15,-35 -3,-35" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M0,-42 L-15,-47 L-5,-49 L-13,-58 L-1,-51 L2,-61 L5,-51 L16,-57 L9,-48 L18,-45 L4,-43 Z" fill="#5d9440" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M1,-52 C2,-58 6,-62 11,-63" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`,
  face: `
    <path d="${TOMATO_BODY}" fill="#cf3b24" ${outline}/>
    <path d="${TOMATO_BODY}" transform="scale(.86)" fill="#f0644a"/>
    ${ring(
      3,
      // septa run between the three seed chambers (at -90, 30 and 150 degrees)
      (_i, a) =>
        `<path d="M0,0 L${fx(Math.cos(a - Math.PI / 6) * 42)},${fx(Math.sin(a - Math.PI / 6) * 42)}" stroke="#d94a31" stroke-width="3"/>`,
    )}
    ${ring(3, (_i, a) => {
      const cx = Math.cos(a - Math.PI / 2) * 21;
      const cy = Math.sin(a - Math.PI / 2) * 21;
      const deg = (a * 180) / Math.PI;
      return `<g transform="translate(${fx(cx)} ${fx(cy)}) rotate(${fx(deg)})">
        <ellipse rx="15" ry="11" fill="#ffb39b" stroke="#e5553b" stroke-width="1.6"/>
        <ellipse cx="-6" cy="1" rx="2.4" ry="3.6" fill="#fff0c2"/>
        <ellipse cx="0" cy="-2" rx="2.4" ry="3.6" fill="#fff0c2"/>
        <ellipse cx="6" cy="1" rx="2.4" ry="3.6" fill="#fff0c2"/>
      </g>`;
    })}
    <circle r="6.5" fill="#f58c72"/>`,
};

/* ---------- Lemon ---------- */
const LEMON_BODY =
  "M-56,0 C-61,-4 -62,-9 -57,-12 C-49,-36 -20,-43 0,-42 C20,-43 49,-36 57,-12 C62,-9 61,-4 56,0 C61,4 62,9 57,12 C49,36 20,43 0,42 C-20,43 -49,36 -57,12 C-62,9 -61,4 -56,0 Z";
const lemon: FruitArt = {
  id: "lemon",
  r: 52,
  bottom: 43,
  body: LEMON_BODY,
  juice: "#f2cd47",
  whole: `
    <path d="M52,-14 C62,-32 82,-34 92,-27 C80,-15 66,-10 52,-14Z" fill="#6f9a45" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M55,-15 C66,-22 76,-25 86,-27" stroke="${INK}" stroke-width="1.2" fill="none" opacity=".6"/>
    <path d="${LEMON_BODY}" fill="#f4cc3a" ${outline}/>
    <path d="M44,8 C40,28 18,38 -6,39 C18,30 34,22 44,8Z" fill="#d6a524" opacity=".55"/>
    <path d="M-36,-16 C-30,-28 -14,-33 0,-33" stroke="#fff" stroke-opacity=".65" stroke-width="6" stroke-linecap="round" fill="none"/>
    ${ring(9, (i, a) => `<circle cx="${fx(Math.cos(a + i) * (18 + (i % 3) * 9))}" cy="${fx(Math.sin(a + i) * (12 + (i % 2) * 8))}" r="1.3" fill="#c9971c" opacity=".7"/>`)}`,
  face: `
    <path d="${LEMON_BODY}" fill="#f2c53a" ${outline}/>
    <path d="${LEMON_BODY}" transform="scale(.9)" fill="#fff4cf"/>
    ${ring(10, (_i, a) => {
      const a0 = a + 0.07;
      const a1 = a + (Math.PI * 2) / 10 - 0.07;
      const am = (a0 + a1) / 2;
      const p = (t: number, k: number) => `${fx(Math.cos(t) * 45 * k)},${fx(Math.sin(t) * 33 * k)}`;
      return `<path d="M${p(am, 0.12)} L${p(a0, 1)} Q${p(am, 1.08)} ${p(a1, 1)} Z" fill="#f9dc5c"/>`;
    })}
    <ellipse rx="5" ry="4" fill="#fff4cf"/>`,
};

/* ---------- Apple ---------- */
const APPLE_BODY =
  "M0,-34 C10,-44 34,-46 46,-28 C58,-10 54,24 38,40 C28,50 14,50 0,44 C-14,50 -28,50 -38,40 C-54,24 -58,-10 -46,-28 C-34,-46 -10,-44 0,-34 Z";
const apple: FruitArt = {
  id: "apple",
  r: 50,
  bottom: 48,
  body: APPLE_BODY,
  juice: "#f3e3b0",
  whole: `
    <path d="${APPLE_BODY}" fill="#d6453a" ${outline}/>
    <path d="M40,-20 C52,6 46,32 26,44 C40,26 44,4 40,-20Z" fill="#a92f28" opacity=".5"/>
    <path d="M-40,-4 C-38,-20 -28,-30 -16,-32" stroke="#ffd59a" stroke-opacity=".7" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M0,-34 C0,-46 3,-54 8,-59" stroke="#5b3a1e" stroke-width="3.6" stroke-linecap="round" fill="none"/>
    <path d="M5,-48 C14,-61 31,-61 37,-55 C29,-44 15,-42 5,-48Z" fill="#6f9a45" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M8,-49 C17,-53 25,-55 33,-55" stroke="${INK}" stroke-width="1.2" fill="none" opacity=".55"/>`,
  face: `
    <path d="${APPLE_BODY}" fill="#d6453a" ${outline}/>
    <path d="${APPLE_BODY}" transform="scale(.9)" fill="#fbf0cf"/>
    <circle r="27" fill="none" stroke="#eadba8" stroke-width="1.6" stroke-dasharray="3 4"/>
    ${ring(5, (i, a) => {
      const deg = (a * 180) / Math.PI;
      const seed = i % 2 === 0;
      return `<g transform="rotate(${fx(deg)})">
        <ellipse cy="-10" rx="5.5" ry="11" fill="#efe0b0" stroke="#d9c38a" stroke-width="1.2"/>
        ${seed ? `<path d="M0,-17 C3,-13 3,-8 0,-6 C-3,-8 -3,-13 0,-17Z" fill="#4a2e17"/>` : ""}
      </g>`;
    })}
    <circle r="2.4" fill="#d9c38a"/>`,
};

/* ---------- Kiwi ---------- */
const KIWI_BODY =
  "M-52,0 C-52,-26 -28,-42 0,-42 C28,-42 52,-26 52,0 C52,26 28,42 0,42 C-28,42 -52,26 -52,0 Z";
const kiwi: FruitArt = {
  id: "kiwi",
  r: 50,
  bottom: 42,
  body: KIWI_BODY,
  juice: "#9fcf4f",
  whole: `
    <path d="${KIWI_BODY}" fill="#8b6a3e" ${outline}/>
    <path d="M40,-8 C44,16 26,34 2,38 C24,26 36,12 40,-8Z" fill="#5f4524" opacity=".5"/>
    ${ring(22, (i, a) => {
      const x = Math.cos(a) * (46 - (i % 3) * 9);
      const y = Math.sin(a) * (36 - (i % 3) * 7);
      return `<path d="M${fx(x)},${fx(y)} l${fx(Math.cos(a + 0.6) * 4)},${fx(Math.sin(a + 0.6) * 4)}" stroke="#5e4424" stroke-width="1.4" stroke-linecap="round"/>`;
    })}
    <path d="M-34,-14 C-28,-26 -14,-31 -2,-31" stroke="#e7c890" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" fill="none"/>
    <circle cx="-51" cy="0" r="3" fill="#5e4424"/>`,
  face: `
    <path d="${KIWI_BODY}" fill="#7a5a33" ${outline}/>
    <path d="${KIWI_BODY}" transform="scale(.9)" fill="#7fb83a"/>
    <path d="${KIWI_BODY}" transform="scale(.64)" fill="#a8d457"/>
    ${ring(18, (_i, a) => `<path d="M${fx(Math.cos(a) * 12)},${fx(Math.sin(a) * 9)} L${fx(Math.cos(a) * 32)},${fx(Math.sin(a) * 25)}" stroke="#d6eba6" stroke-width="1.3"/>`)}
    ${ring(16, (_i, a) => {
      const deg = (a * 180) / Math.PI;
      return `<ellipse cx="${fx(Math.cos(a) * 21)}" cy="${fx(Math.sin(a) * 16)}" rx="3.4" ry="1.7" transform="rotate(${fx(deg)} ${fx(Math.cos(a) * 21)} ${fx(Math.sin(a) * 16)})" fill="${INK}"/>`;
    })}
    <ellipse rx="12" ry="9" fill="#f3f4d6"/>`,
};

export const FRUITS: Record<FruitId, FruitArt> = { tomato, lemon, apple, kiwi };
export const FRUIT_ORDER: readonly FruitId[] = ["tomato", "lemon", "apple", "kiwi"];

/** The cutting board, side on, in a 600 x 380 scene. Fruit rests on y = BOARD_TOP. */
export const SCENE = { width: 600, height: 380 } as const;
export const BOARD_TOP = 300;

/** A hanging knife: handle up, blade down, drawn around (0, 0) at the strip. */
function hangingKnife(
  x: number,
  len: number,
  width: number,
  tilt: number,
  kind: "chef" | "paring" | "bread",
): string {
  const w = width;
  const blade =
    kind === "bread"
      ? `M${-w / 2},40 L${w / 2},40 L${w / 2},${40 + len} C${w / 2},${44 + len} ${-w / 2},${46 + len} ${-w / 2},${40 + len} Z`
      : `M${-w / 2},40 L${w / 2},40 C${w / 2 + 2},${40 + len * 0.6} ${w / 6},${40 + len * 0.92} ${-w / 2 + 1},${44 + len} Z`;
  const teeth =
    kind === "bread"
      ? `<path d="M${-w / 2},${48} ${Array.from({ length: Math.floor(len / 7) }, (_, i) => `l2.4,3.5 l-2.4,3.5`).join(" ")}" stroke="${INK}" stroke-width="1" fill="none" opacity=".6"/>`
      : "";
  return `<g transform="translate(${x} 34) rotate(${tilt})">
    <rect x="${-w / 2 + 1}" y="4" width="${w - 2}" height="34" rx="${w / 3}" fill="${INK}"/>
    <circle cx="0" cy="14" r="1.6" fill="#c9d0d4"/><circle cx="0" cy="27" r="1.6" fill="#c9d0d4"/>
    <rect x="${-w / 2 - 0.5}" y="36" width="${w + 1}" height="5" rx="1.5" fill="#b9c2c7" stroke="${INK}" stroke-width="1.2"/>
    <path d="${blade}" fill="#eef1ee" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M${-w / 2 + 3},44 L${-w / 2 + 3},${30 + len}" stroke="#fff" stroke-width="2" opacity=".9"/>
    ${teeth}
  </g>`;
}

/** Magnetic strip on the wall above the board, with three knives. */
export const KNIFE_STRIP = `
  <rect x="150" y="26" width="300" height="16" rx="8" fill="#6d4a2a" stroke="${INK}" stroke-width="2.2"/>
  <circle cx="166" cy="34" r="2.6" fill="#c9b08a"/><circle cx="434" cy="34" r="2.6" fill="#c9b08a"/>
  ${hangingKnife(222, 92, 20, -3, "chef")}
  ${hangingKnife(300, 104, 16, 1, "bread")}
  ${hangingKnife(372, 58, 13, 4, "paring")}`;

export const BOARD = `
  <ellipse cx="300" cy="350" rx="280" ry="16" fill="${INK}" opacity=".12"/>
  <path d="M34,306 C150,316 450,316 566,306 L564,328 C450,338 150,338 36,328 Z" fill="#b9824a" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M36,296 C150,286 450,286 564,296 C573,297 577,303 566,306 C450,316 150,316 34,306 C24,303 27,297 36,296 Z" fill="#e2b071" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M70,298 C190,292 330,293 420,299 M120,304 C230,300 380,301 500,305 M60,302 C110,300 150,300 190,301" stroke="#bd8a52" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <ellipse cx="538" cy="301" rx="10" ry="3.4" fill="#7d5128" stroke="${INK}" stroke-width="1.6"/>`;

/** Markup for one fruit, whole or as the face-up halves of a clean cut (for static art). */
export function fruitMarkup(id: FruitId, x: number, y: number, rotate = 0): string {
  return `<g transform="translate(${x} ${y}) rotate(${rotate})">${FRUITS[id].whole}</g>`;
}
