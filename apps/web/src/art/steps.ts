/** Small inked illustrations for the three service steps (64 x 64). */
import { INK } from "./fruit.ts";

const s = `stroke="${INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"`;

/** A canvas bag of knives waiting by a door. */
const pickup = `
  <path d="M10 58 V12 C10 9 12 7 15 7 H35 C38 7 40 9 40 12 V58" fill="#2f6b49" ${s}/>
  <circle cx="34" cy="34" r="2" fill="#f2c94c"/>
  <path d="M30 60 L33 34 H58 L61 60 Z" fill="#f3e6c6" ${s}/>
  <path d="M39 34 C39 25 52 25 52 34" fill="none" ${s}/>
  <path d="M42 33 L41 22 M47 33 L47 20 M52 33 L54 23" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M4 61 H62" ${s}/>`;

/** A blade against a sharpening stone, with a glint. */
const sharpen = `
  <path d="M8 46 L56 46 L58 56 L6 56 Z" fill="#7d8b7f" ${s}/>
  <path d="M8 46 L56 46" stroke="#b9c4ba" stroke-width="2"/>
  <path d="M12 41 C26 34 40 27 50 21 L54 25 C44 32 30 39 15 44 Z" fill="#f4f1ea" ${s}/>
  <path d="M50 21 L58 15 C60 14 62 16 60 18 L54 25 Z" fill="${INK}" ${s}/>
  <path d="M24 16 V24 M20 20 H28" stroke="#bf3f27" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M38 8 V13 M35.5 10.5 H40.5" stroke="#bf3f27" stroke-width="2" stroke-linecap="round"/>`;

/** The bag back on the doorstep, a sliced lemon for good measure. */
const back = `
  <path d="M4 52 H60 V58 H4 Z" fill="#e2b071" ${s}/>
  <path d="M14 52 L17 26 H43 L46 52 Z" fill="#f3e6c6" ${s}/>
  <path d="M23 26 C23 17 37 17 37 26" fill="none" ${s}/>
  <path d="M26 25 L25 14 M30 25 L30 12 M34 25 L36 15" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M27 38 L30 42 L36 34" stroke="#2f6b49" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M47 52 A8 8 0 0 1 63 52 Z" fill="#f2c94c" ${s}/>
  <path d="M55 52 L55 46 M55 52 L50 48 M55 52 L60 48" stroke="#fff4cf" stroke-width="1.4"/>`;

export const STEP_ART: Record<string, string> = { truck: pickup, knife: sharpen, home: back };
