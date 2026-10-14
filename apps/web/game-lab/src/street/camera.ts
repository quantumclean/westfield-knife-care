/**
 * First-person camera for the street: the same pinhole maths as the counter's
 * projection.ts (screenX = cx + side/forward · f), plus a position and heading.
 * The raycaster and every hit test use this one camera, so what you see is
 * exactly what you can cut.
 */
import type { Pose } from "./map.ts";

export interface Cam3 {
  w: number;
  h: number;
  cx: number;
  horizon: number;
  f: number;
  /** Eye height above the ground. */
  eye: number;
  /** CSS pixels per scene unit, for swipe speeds (same as the counter). */
  unit: number;
  x: number;
  y: number;
  /** Facing direction (unit) and the screen-right direction. */
  dx: number;
  dy: number;
  rx: number;
  ry: number;
}

export interface Projected3 {
  x: number;
  y: number;
  /** CSS px per world unit at this depth. */
  s: number;
  /** Distance in front of the camera (negative: behind). */
  d: number;
}

export const EYE = 0.5;

export function makeCam3(w: number, h: number, pose: Pose, bob = 0): Cam3 {
  const portrait = h >= w;
  // About 29 degrees either side on a portrait phone, wider on landscape and desktop.
  const f = Math.min(Math.max(w * 0.8, h * 0.42), h * 0.95);
  const dx = Math.cos(pose.a);
  const dy = Math.sin(pose.a);
  return {
    w,
    h,
    cx: w / 2,
    horizon: h * (portrait ? 0.42 : 0.4) + bob,
    f,
    eye: EYE,
    unit: Math.min(w, h * 1.6) / 600,
    x: pose.x,
    y: pose.y,
    dx,
    dy,
    rx: -dy,
    ry: dx,
  };
}

/** Distance of a ground point in front of the camera. */
export function depthOf(cam: Pick<Cam3, "x" | "y" | "dx" | "dy">, wx: number, wy: number): number {
  return (wx - cam.x) * cam.dx + (wy - cam.y) * cam.dy;
}

export function project3(
  cam: Cam3,
  wx: number,
  wy: number,
  height: number,
  out?: Projected3,
): Projected3 {
  const ox = wx - cam.x;
  const oy = wy - cam.y;
  const d = ox * cam.dx + oy * cam.dy;
  const side = ox * cam.rx + oy * cam.ry;
  const p = out ?? { x: 0, y: 0, s: 0, d: 0 };
  p.d = d;
  if (d <= 0.05) {
    p.s = 0;
    p.x = -9999;
    p.y = -9999;
    return p;
  }
  const s = cam.f / d;
  p.s = s;
  p.x = cam.cx + side * s;
  p.y = cam.horizon + (cam.eye - height) * s;
  return p;
}

/** The ground point under a screen pixel (below the horizon), or null. */
export function unproject3(cam: Cam3, sx: number, sy: number): { x: number; y: number } | null {
  const dy = sy - cam.horizon;
  if (dy <= 0) return null;
  const d = (cam.eye * cam.f) / dy;
  const side = ((sx - cam.cx) * d) / cam.f;
  return { x: cam.x + cam.dx * d + cam.rx * side, y: cam.y + cam.dy * d + cam.ry * side };
}
