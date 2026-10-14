/**
 * A seeded little Westfield: streets (5 tiles wide: sidewalk, three road
 * lanes, sidewalk) joined by alleys (3 wide), laid out as a staircase so the
 * route never crosses itself. Side alleys are where fruit comes from, and
 * doorway recesses are where neighbors stand. Pure data, no DOM.
 */
import { nextRandom } from "../sim/rng.ts";

/** Wall height in world units (a tile is 1 unit; the eye is 0.5 above the ground). */
export const WALL_H = 2.4;

export const FLOOR = {
  none: 0,
  road: 1,
  lineX: 2,
  lineY: 3,
  sidewalk: 4,
  cobble: 5,
  porch: 6,
} as const;

export const WALL = {
  open: 0,
  sage: 1,
  butter: 2,
  sky: 3,
  coral: 4,
  lilac: 5,
  brick: 6,
  bakery: 7,
  market: 8,
  wkc: 9,
  fence: 10,
  garage: 11,
  door: 12,
} as const;
export const WALL_KINDS = 13;
export const FLOOR_KINDS = 7;

export interface Pt {
  x: number;
  y: number;
}

/** A side-alley mouth or doorway that fruit is thrown from. `n` points into the street. */
export interface Source extends Pt {
  nx: number;
  ny: number;
  kind: "alley" | "door";
}

/** A doorway recess where a neighbor can stand. */
export type Door = Source;

export interface StreetMap {
  w: number;
  h: number;
  walls: Uint8Array;
  floors: Uint8Array;
  sources: Source[];
  doors: Door[];
  /** Route corner points (tile centres), in order. */
  path: Pt[];
}

export function isOpen(map: StreetMap, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return false;
  return map.walls[iy * map.w + ix] === WALL.open;
}

interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Half-width in tiles (2 for streets, 1 for alleys). */
  half: number;
  street: boolean;
}

const HOUSES = [WALL.sage, WALL.butter, WALL.sky, WALL.coral, WALL.lilac] as const;

/**
 * Builds a map whose route is at least `minLength` units long. Same seed,
 * same town.
 */
export function generateMap(seed: number, minLength: number): StreetMap {
  const rng = { seed: seed | 0 };
  const r = () => nextRandom(rng);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

  // 1. Route corners: east along a street, north up an alley, and repeat.
  const corners: Pt[] = [{ x: 0, y: 0 }];
  const segs: Seg[] = [];
  let length = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; length < minLength + 12; i++) {
    const street = i % 2 === 0;
    const len = street ? int(14, 20) : int(11, 13);
    const nx = street ? x + len : x;
    const ny = street ? y : y - len;
    segs.push({ ax: x, ay: y, bx: nx, by: ny, half: street ? 2 : 1, street });
    corners.push({ x: nx, y: ny });
    length += len;
    x = nx;
    y = ny;
  }

  // 2. Fit the grid around the route with a margin.
  const M = 8;
  const minX = Math.min(...corners.map((p) => p.x));
  const minY = Math.min(...corners.map((p) => p.y));
  const maxX = Math.max(...corners.map((p) => p.x));
  const maxY = Math.max(...corners.map((p) => p.y));
  const ox = M - minX;
  const oy = M - minY;
  const w = maxX - minX + 2 * M + 1;
  const h = maxY - minY + 2 * M + 1;
  const walls = new Uint8Array(w * h).fill(WALL.brick);
  const floors = new Uint8Array(w * h);
  const idx = (tx: number, ty: number) => ty * w + tx;
  const inside = (tx: number, ty: number) => tx >= 1 && ty >= 1 && tx < w - 1 && ty < h - 1;
  const open = (tx: number, ty: number) => inside(tx, ty) && walls[idx(tx, ty)] === WALL.open;
  const carve = (tx: number, ty: number, floor: number) => {
    if (!inside(tx, ty)) return;
    walls[idx(tx, ty)] = WALL.open;
    floors[idx(tx, ty)] = floor;
  };
  for (const s of segs) {
    s.ax += ox;
    s.bx += ox;
    s.ay += oy;
    s.by += oy;
  }
  const path = corners.map((p) => ({ x: p.x + ox + 0.5, y: p.y + oy + 0.5 }));

  // 3. Carve alleys first, then streets, so street floors win at junctions.
  for (const pass of [false, true]) {
    for (const s of segs) {
      if (s.street !== pass) continue;
      const horizontal = s.ay === s.by;
      const a0 = Math.min(horizontal ? s.ax : s.ay, horizontal ? s.bx : s.by) - s.half;
      const a1 = Math.max(horizontal ? s.ax : s.ay, horizontal ? s.bx : s.by) + s.half;
      const c = horizontal ? s.ay : s.ax;
      for (let a = a0; a <= a1; a++) {
        for (let o = -s.half; o <= s.half; o++) {
          let floor: number = FLOOR.cobble;
          if (s.street) {
            floor = Math.abs(o) === 2 ? FLOOR.sidewalk : FLOOR.road;
            if (o === 0) floor = horizontal ? FLOOR.lineX : FLOOR.lineY;
          }
          if (horizontal) carve(a, c + o, floor);
          else carve(c + o, a, floor);
        }
      }
    }
  }

  // 4. Side alleys (fruit sources) and doorways (neighbors) along each segment.
  const sources: Source[] = [];
  const doors: Door[] = [];
  const special: [number, number, number][] = [];
  for (const s of segs) {
    const horizontal = s.ay === s.by;
    const dir = horizontal ? Math.sign(s.bx - s.ax) : Math.sign(s.by - s.ay);
    const len = Math.abs(horizontal ? s.bx - s.ax : s.by - s.ay);
    const at = (along: number, off: number): [number, number] =>
      horizontal ? [s.ax + dir * along, s.ay + off] : [s.ax + off, s.ay + dir * along];
    let t = 4;
    while (t < len - 3) {
      const side = r() < 0.5 ? -1 : 1;
      const isAlley = s.street && r() < 0.55;
      const depth = isAlley ? 3 : 1;
      // Keep at least one solid tile between this and any other open space.
      let clear = true;
      for (let k = 1; k <= depth + 1 && clear; k++) {
        for (const da of [-1, 0, 1]) {
          const [tx, ty] = at(t + da, side * (s.half + k));
          if (!inside(tx, ty) || open(tx, ty)) clear = false;
        }
      }
      if (clear) {
        for (let k = 1; k <= depth; k++) {
          const [tx, ty] = at(t, side * (s.half + k));
          carve(tx, ty, isAlley ? FLOOR.cobble : FLOOR.porch);
        }
        const [ex, ey] = at(t, side * (s.half + depth + 1));
        special.push([ex, ey, isAlley ? WALL.fence : WALL.door]);
        if (isAlley) {
          for (let k = 1; k <= depth; k++) {
            for (const da of [-1, 1]) {
              const [tx, ty] = at(t + da, side * (s.half + k));
              special.push([tx, ty, WALL.brick]);
            }
          }
        }
        // Alley: just inside its mouth. Doorway: the middle of the recess.
        const alongC = (horizontal ? s.ax : s.ay) + dir * t + 0.5;
        const perpC = (horizontal ? s.ay : s.ax) + 0.5;
        const off = isAlley ? s.half + 0.8 : s.half + 1;
        const nxv = horizontal ? 0 : -side;
        const nyv = horizontal ? -side : 0;
        const spot: Source = {
          x: horizontal ? alongC : perpC + side * off,
          y: horizontal ? perpC + side * off : alongC,
          nx: nxv,
          ny: nyv,
          kind: isAlley ? "alley" : "door",
        };
        sources.push(spot);
        if (!isAlley) doors.push(spot);
      }
      t += int(3, 5);
    }
  }

  // 5. Facades: pick a material per 3-tile stretch of wall that faces open space.
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      if (walls[idx(tx, ty)] === WALL.open) continue;
      const faces = open(tx - 1, ty) || open(tx + 1, ty) || open(tx, ty - 1) || open(tx, ty + 1);
      if (!faces) continue;
      const hsh = hash2(Math.floor(tx / 3), Math.floor(ty / 3), seed);
      const roll = hsh % 100;
      walls[idx(tx, ty)] =
        roll < 58
          ? HOUSES[hsh % HOUSES.length]!
          : roll < 72
            ? WALL.brick
            : roll < 80
              ? WALL.bakery
              : roll < 88
                ? WALL.market
                : WALL.garage;
    }
  }
  for (const [tx, ty, kind] of special) if (inside(tx, ty)) walls[idx(tx, ty)] = kind;

  // 6. Westfield Knife Care's shop front on the first street, near the start.
  const first = segs[0]!;
  for (const dx of [5, 6]) {
    const tx = first.ax + dx;
    const ty = first.ay - first.half - 1;
    if (inside(tx, ty) && !open(tx, ty)) walls[idx(tx, ty)] = WALL.wkc;
  }

  return { w, h, walls, floors, sources, doors, path };
}

function hash2(a: number, b: number, seed: number): number {
  let x = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x ^ (x >>> 16)) >>> 0;
}

/* ---------- The route the camera walks ---------- */

interface Piece {
  s0: number;
  len: number;
  /** Straight line, or a quadratic curve around a corner. */
  p0: Pt;
  p1: Pt;
  p2?: Pt;
  /** Curves only: cumulative arc length at evenly spaced t, for arc-length lookup. */
  table?: number[];
}

export interface Route {
  pieces: Piece[];
  length: number;
}

export interface Pose extends Pt {
  /** Heading in radians (0 = east, +y is south). */
  a: number;
}

const CORNER = 1.2;
const SAMPLES = 16;

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

/** Straight runs between corners, with each corner rounded by a short curve. */
export function buildRoute(path: readonly Pt[]): Route {
  const pieces: Piece[] = [];
  let s = 0;
  let from = path[0]!;
  for (let i = 1; i < path.length; i++) {
    const c = path[i]!;
    const next = path[i + 1];
    const din = unit(from, c);
    const end = next ? { x: c.x - din.x * CORNER, y: c.y - din.y * CORNER } : c;
    const lineLen = Math.hypot(end.x - from.x, end.y - from.y);
    pieces.push({ s0: s, len: lineLen, p0: from, p1: end });
    s += lineLen;
    if (!next) break;
    const dout = unit(c, next);
    const exit = { x: c.x + dout.x * CORNER, y: c.y + dout.y * CORNER };
    const table = [0];
    let prev = end;
    let acc = 0;
    for (let k = 1; k <= SAMPLES; k++) {
      const p = quad(end, c, exit, k / SAMPLES);
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      table.push(acc);
      prev = p;
    }
    pieces.push({ s0: s, len: acc, p0: end, p1: c, p2: exit, table });
    s += acc;
    from = exit;
  }
  return { pieces, length: s };
}

function unit(a: Pt, b: Pt): Pt {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
}

/** Where the walker is, and which way they face, `s` units along the route. */
export function poseAt(route: Route, s: number): Pose {
  const clamped = Math.max(0, Math.min(route.length, s));
  let piece = route.pieces[route.pieces.length - 1]!;
  for (const p of route.pieces) {
    if (clamped <= p.s0 + p.len) {
      piece = p;
      break;
    }
  }
  const local = clamped - piece.s0;
  if (!piece.p2 || !piece.table) {
    const k = piece.len > 0 ? local / piece.len : 0;
    return {
      x: piece.p0.x + (piece.p1.x - piece.p0.x) * k,
      y: piece.p0.y + (piece.p1.y - piece.p0.y) * k,
      a: Math.atan2(piece.p1.y - piece.p0.y, piece.p1.x - piece.p0.x),
    };
  }
  const tbl = piece.table;
  let j = 1;
  while (j < tbl.length - 1 && tbl[j]! < local) j++;
  const seg = tbl[j]! - tbl[j - 1]! || 1;
  const t = (j - 1 + (local - tbl[j - 1]!) / seg) / SAMPLES;
  const p = quad(piece.p0, piece.p1, piece.p2, t);
  // Tangent of the quadratic.
  const tx = 2 * (1 - t) * (piece.p1.x - piece.p0.x) + 2 * t * (piece.p2.x - piece.p1.x);
  const ty = 2 * (1 - t) * (piece.p1.y - piece.p0.y) + 2 * t * (piece.p2.y - piece.p1.y);
  return { x: p.x, y: p.y, a: Math.atan2(ty, tx) };
}
