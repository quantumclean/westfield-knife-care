/**
 * New inked art for the game, in the same shape and style as
 * apps/web/src/art/fruit.ts: drawn around (0, 0) at roughly radius 50, with
 * INK outlines and literal colours. Original artwork.
 */
import { FRUITS, INK, type FruitArt } from "../../../src/art/fruit.ts";
import type { IngredientId } from "../levels.ts";

export interface SpriteArt {
  /** Art radius that matches the ingredient's world radius on screen. */
  r: number;
  whole: string;
  /** Cross-section shown on cut halves. Hazards and pickups have none. */
  face?: string;
  juice: string;
}

const outline = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"`;

const CARROT_BODY =
  "M-40,-30 C-28,-44 -10,-38 4,-24 L44,30 C50,38 44,46 36,42 L-30,-4 C-46,-16 -48,-22 -40,-30 Z";
const carrot: SpriteArt = {
  r: 46,
  juice: "#f39c3d",
  whole: `
    <path d="M-40,-30 C-52,-40 -58,-52 -56,-64 M-40,-30 C-44,-46 -40,-58 -32,-66 M-40,-30 C-56,-34 -66,-42 -70,-52" stroke="#4f8a37" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M-40,-30 C-52,-40 -58,-52 -56,-64 M-40,-30 C-44,-46 -40,-58 -32,-66" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".5"/>
    <path d="${CARROT_BODY}" fill="#ee8a2c" ${outline}/>
    <path d="M-22,-24 L-14,-30 M-6,-10 L2,-16 M8,4 L16,-2 M20,18 L28,12" stroke="#b9601a" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M-34,-24 C-20,-34 -6,-28 6,-16" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round" fill="none"/>`,
  face: `
    <circle r="34" fill="#ec8526" ${outline}/>
    <circle r="22" fill="#f6a347"/>
    <circle r="11" fill="#f9c06a" stroke="#e2862e" stroke-width="1.5"/>`,
};

const ONION_BODY =
  "M0,-38 C26,-38 46,-16 46,8 C46,32 26,46 0,46 C-26,46 -46,32 -46,8 C-46,-16 -26,-38 0,-38 Z";
const onion: SpriteArt = {
  r: 48,
  juice: "#f3ecc6",
  whole: `
    <path d="M-5,-36 C-6,-48 -2,-58 6,-66 C5,-56 7,-46 6,-36 Z" fill="#c98a3a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${ONION_BODY}" fill="#d39446" ${outline}/>
    <path d="M0,-38 C-18,-20 -22,24 0,46 M0,-38 C18,-20 22,24 0,46 M-6,-36 C-36,-14 -34,30 -14,44 M6,-36 C36,-14 34,30 14,44" stroke="#9c6226" stroke-width="2" fill="none" opacity=".6"/>
    <path d="M-10,46 L-14,54 M-2,47 L-3,56 M6,46 L9,55 M13,44 L18,52" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-30,-10 C-26,-24 -16,-32 -6,-34" stroke="#fff" stroke-opacity=".5" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  face: `
    <circle r="44" fill="#d39446" ${outline}/>
    <circle r="40" fill="#f7efd0"/>
    <circle r="32" fill="none" stroke="#dccb8e" stroke-width="2.4"/>
    <circle r="24" fill="none" stroke="#dccb8e" stroke-width="2.4"/>
    <circle r="16" fill="none" stroke="#dccb8e" stroke-width="2.4"/>
    <circle r="8" fill="#efe2b0" stroke="#dccb8e" stroke-width="2"/>`,
};

const PINEAPPLE_BODY =
  "M0,-30 C28,-30 42,-8 42,14 C42,40 24,56 0,56 C-24,56 -42,40 -42,14 C-42,-8 -28,-30 0,-30 Z";
const pineapple: SpriteArt = {
  r: 52,
  juice: "#f7d65a",
  whole: `
    <defs><clipPath id="pa"><path d="${PINEAPPLE_BODY}"/></clipPath></defs>
    <path d="M0,-28 L-24,-64 L-8,-44 L-6,-82 L4,-46 L18,-76 L12,-40 L34,-58 Z" fill="#5d9440" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="${PINEAPPLE_BODY}" fill="#d9a23a" ${outline}/>
    <g clip-path="url(#pa)" stroke="#9c6a1e" stroke-width="2.2" opacity=".75">
      ${[-60, -40, -20, 0, 20, 40, 60].map((o) => `<path d="M${o - 40},-40 L${o + 40},60 M${o + 40},-40 L${o - 40},60"/>`).join("")}
    </g>
    <path d="${PINEAPPLE_BODY}" fill="none" ${outline}/>
    <path d="M-28,0 C-26,-14 -16,-24 -4,-26" stroke="#fff" stroke-opacity=".45" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  face: `
    <circle r="44" fill="#b9822c" ${outline}/>
    <circle r="38" fill="#f7d65a"/>
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<path d="M${(Math.cos(a) * 12).toFixed(1)},${(Math.sin(a) * 12).toFixed(1)} L${(Math.cos(a) * 34).toFixed(1)},${(Math.sin(a) * 34).toFixed(1)}" stroke="#eabf3c" stroke-width="2"/>`;
    }).join("")}
    <circle r="11" fill="#f2e3a0" stroke="#d9b43c" stroke-width="2"/>`,
};

const SQUASH_BODY =
  "M-12,-44 C-4,-50 8,-48 12,-42 C18,-28 16,-16 22,-6 C40,8 44,30 30,44 C16,56 -16,56 -30,44 C-44,30 -40,8 -22,-6 C-16,-16 -18,-28 -12,-44 Z";
const squash: SpriteArt = {
  r: 50,
  juice: "#f29b38",
  whole: `
    <path d="M-3,-46 L-4,-58 C-4,-61 4,-62 5,-58 L4,-46 Z" fill="#7a5a2c" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${SQUASH_BODY}" fill="#e9c189" ${outline}/>
    <path d="M-30,30 C-20,44 20,44 30,30" stroke="#c99a5a" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M-8,-36 C-12,-24 -10,-12 -16,-2" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" fill="none"/>`,
  face: `
    <circle r="44" fill="#e9c189" ${outline}/>
    <circle r="39" fill="#f29b38"/>
    <ellipse rx="20" ry="16" fill="#f7c27a" stroke="#d9802a" stroke-width="2"/>
    ${[-10, -3, 4, 11].map((x, i) => `<ellipse cx="${x}" cy="${i % 2 ? 4 : -4}" rx="3" ry="5" fill="#fbe6b8" stroke="#c98a3a" stroke-width="1.2"/>`).join("")}`,
};

const lid: SpriteArt = {
  r: 52,
  juice: "#c9d0d4",
  whole: `
    <ellipse cx="0" cy="22" rx="50" ry="10" fill="#7d878c" ${outline}/>
    <path d="M-48,20 C-44,-14 -24,-26 0,-26 C24,-26 44,-14 48,20 Z" fill="#b6bfc4" ${outline}/>
    <path d="M-32,4 C-26,-10 -14,-16 -2,-18" stroke="#fff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="-16" y="-42" width="32" height="14" rx="6" fill="${INK}"/>
    <rect x="-5" y="-30" width="10" height="6" fill="${INK}"/>`,
};

const glint: SpriteArt = {
  r: 40,
  juice: "#fff3b0",
  whole: `
    <path d="M0,-48 C5,-10 10,-5 48,0 C10,5 5,10 0,48 C-5,10 -10,5 -48,0 C-10,-5 -5,-10 0,-48 Z" fill="#fff7cf" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M0,-22 C2,-4 4,-2 22,0 C4,2 2,4 0,22 C-2,4 -4,2 -22,0 C-4,-2 -2,-4 0,-22 Z" fill="#f2c94c"/>`,
};

function fromFruit(f: FruitArt): SpriteArt {
  return { r: f.r, whole: f.whole, face: f.face, juice: f.juice };
}

export const ART: Record<IngredientId, SpriteArt> = {
  tomato: fromFruit(FRUITS.tomato),
  lemon: fromFruit(FRUITS.lemon),
  apple: fromFruit(FRUITS.apple),
  kiwi: fromFruit(FRUITS.kiwi),
  carrot,
  onion,
  pineapple,
  squash,
  lid,
  glint,
};
