/** Pure geometry for the cutting board: hit tests, cut angles and the blade trail. */

export interface Pt {
  x: number;
  y: number;
}

export interface TrailPoint extends Pt {
  t: number;
}

/** Shortest distance from point c to the segment a-b. */
export function distanceToSegment(a: Pt, b: Pt, c: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y);
}

/** True when the swipe segment a-b passes within r of the centre c. */
export function segmentHitsCircle(a: Pt, b: Pt, c: Pt, r: number): boolean {
  return distanceToSegment(a, b, c) <= r;
}

/**
 * Direction of a cut in degrees, folded into (-90, 90]: a left-to-right and a
 * right-to-left swipe along the same line make the same cut.
 */
export function cutAngle(a: Pt, b: Pt): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg <= -90) deg += 180;
  return deg;
}

/**
 * Unit normal of a cut at `deg`: the +y axis of a frame rotated by `deg`.
 * The half on this side moves along it, the other half against it.
 */
export function cutNormal(deg: number): Pt {
  const r = (deg * Math.PI) / 180;
  return { x: -Math.sin(r), y: Math.cos(r) };
}

/**
 * A tapered blade trail as one closed path: zero width at the oldest point,
 * `width` at the newest, and thinner as points age towards `life` ms.
 */
export function trailPath(
  points: readonly TrailPoint[],
  now: number,
  life: number,
  width: number,
): string {
  const alive = points.filter((p) => now - p.t < life);
  if (alive.length < 2) return "";
  const n = alive.length;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = alive[i]!;
    const prev = alive[Math.max(0, i - 1)]!;
    const next = alive[Math.min(n - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const fresh = 1 - (now - p.t) / life;
    const w = (width / 2) * (i / (n - 1)) * Math.max(0, fresh);
    const nx = (-dy / len) * w;
    const ny = (dx / len) * w;
    left.push(`${(p.x + nx).toFixed(1)},${(p.y + ny).toFixed(1)}`);
    right.push(`${(p.x - nx).toFixed(1)},${(p.y - ny).toFixed(1)}`);
  }
  return `M${left.join(" L")} L${right.reverse().join(" L")} Z`;
}
