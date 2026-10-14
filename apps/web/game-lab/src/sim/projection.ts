/**
 * The pseudo-3D camera (design section 4.2). World axes: x across the counter,
 * y height above it, z depth (1 is just in front of the camera). The camera
 * sits `eye` units above the counter, looking straight down the room, with a
 * fixed horizon. It never rolls, bobs or changes its field of view.
 */

export interface Camera {
  w: number;
  h: number;
  cx: number;
  /** Screen row of the vanishing point. */
  horizon: number;
  /** Focal length in CSS pixels. */
  f: number;
  eye: number;
  /** World half-width that maps to the usable cut zone at Z_CUT. */
  laneX: number;
  /** CSS pixels per scene unit, so swipe speeds compare to the hero toy's. */
  unit: number;
}

export interface Projected {
  x: number;
  y: number;
  /** CSS pixels per world unit at this depth. */
  s: number;
}

/** Depth the lane width is fitted to: the middle of the cut zone. */
export const Z_CUT = 1.6;

export function makeCamera(w: number, h: number): Camera {
  const portrait = h >= w;
  const horizon = h * (portrait ? 0.34 : 0.26);
  const f = Math.max(h * 0.62, w * 0.36);
  const half = Math.min(w * 0.4, h * 0.6);
  return {
    w,
    h,
    cx: w / 2,
    horizon,
    f,
    eye: 1,
    laneX: (half * Z_CUT) / f,
    unit: Math.min(w, h * 1.6) / 600,
  };
}

export function project(cam: Camera, x: number, y: number, z: number, out?: Projected): Projected {
  const s = cam.f / z;
  const p = out ?? { x: 0, y: 0, s: 0 };
  p.x = cam.cx + x * s;
  p.y = cam.horizon + (cam.eye - y) * s;
  p.s = s;
  return p;
}

/** Inverse of `project` on the horizontal plane at height `y`. Null above the horizon. */
export function unproject(
  cam: Camera,
  sx: number,
  sy: number,
  y = 0,
): { x: number; z: number } | null {
  const dy = sy - cam.horizon;
  const height = cam.eye - y;
  if (dy <= 0 || height <= 0) return null;
  const z = (height * cam.f) / dy;
  return { x: ((sx - cam.cx) * z) / cam.f, z };
}

/** Screen row of a horizontal plane at height y and depth z. */
export function rowAt(cam: Camera, y: number, z: number): number {
  return cam.horizon + ((cam.eye - y) * cam.f) / z;
}
