/** Inked icons for the booking pass "Get ready" steps (48 x 48). */
import { INK } from "./fruit.ts";

const s = `stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

/** A blade wrapped in a striped tea towel. */
const wrap = `
  <path d="M30 8 L40 4 C42 3 44 5 43 7 L35 16 Z" fill="${INK}" ${s}/>
  <path d="M8 26 L30 12 L36 18 L16 34 Z" fill="#f6af97" ${s}/>
  <path d="M14 23 L21 30 M20 19 L27 26 M26 15 L32 21" stroke="#fff7e8" stroke-width="2.4"/>
  <path d="M10 30 L5 41 M14 33 L11 43" ${s} fill="none"/>`;

/** The canvas bag with handles peeking out. */
const bag = `
  <path d="M10 18 H38 L41 43 H7 Z" fill="#f3e6c6" ${s}/>
  <path d="M17 18 C17 9 31 9 31 18" fill="none" ${s}/>
  <path d="M19 17 L18 8 M24 17 L24 6 M29 17 L31 8" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>
  <rect x="27" y="26" width="9" height="7" rx="1.5" fill="#24604b"/>`;

/** A door with a little clock: out before 8am. */
const door = `
  <rect x="8" y="5" width="22" height="38" rx="2" fill="#24604b" ${s}/>
  <circle cx="25" cy="25" r="1.6" fill="#f2c94c"/>
  <path d="M4 43 H44" ${s}/>
  <circle cx="36" cy="14" r="8" fill="#fff7e8" ${s}/>
  <path d="M36 9.5 V14 L39 16" ${s} fill="none"/>`;

export const READY_ART = { wrap, bag, door } as const;
