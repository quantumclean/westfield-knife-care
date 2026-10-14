/**
 * The street raycaster: one ray per buffer column through the tile grid (DDA),
 * textured walls, per-pixel floor casting, a sky gradient and distance fog,
 * written straight into an ImageData buffer at reduced resolution and then
 * scaled up. It also fills a per-column depth buffer so sprites drawn on top
 * hide correctly behind walls.
 */
import type { Cam3 } from "./camera.ts";
import { FLOOR, WALL_H, type StreetMap } from "./map.ts";
import { FLOOR_TEX, TEX_H, TEX_W, type TextureSet } from "./textures.ts";

export interface RayView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  px: Uint32Array;
  /** Wall depth per buffer column (Infinity where the ray found no wall). */
  z: Float32Array;
  bw: number;
  bh: number;
}

export interface Look {
  skyTop: [number, number, number];
  skyHorizon: [number, number, number];
  fog: [number, number, number];
  fogStart: number;
  fogEnd: number;
  fogMax: number;
  tex: TextureSet;
}

export function makeRayView(bw: number, bh: number): RayView {
  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");
  const img = ctx.createImageData(bw, bh);
  return {
    canvas,
    ctx,
    img,
    px: new Uint32Array(img.data.buffer),
    z: new Float32Array(bw),
    bw,
    bh,
  };
}

const pack = (r: number, g: number, b: number) =>
  (0xff << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

export function renderStreet(view: RayView, map: StreetMap, cam: Cam3, look: Look): void {
  const { bw, bh, px, z } = view;
  const k = bw / cam.w;
  const f = cam.f * k;
  const cx = bw / 2;
  const hor = cam.horizon * k;
  const eye = cam.eye;
  const posX = cam.x;
  const posY = cam.y;
  const dirX = cam.dx;
  const dirY = cam.dy;
  const rX = cam.rx;
  const rY = cam.ry;
  const W = map.w;
  const H = map.h;
  const walls = map.walls;
  const floors = map.floors;
  const [fr, fg, fb] = look.fog;
  const fogSpan = look.fogEnd - look.fogStart;
  const fogMax = look.fogMax;
  const fogAt = (d: number) => Math.min(1, Math.max(0, (d - look.fogStart) / fogSpan)) * fogMax;

  // Sky: a vertical gradient that meets the fog colour at the horizon.
  const horRow = Math.max(0, Math.min(bh, Math.ceil(hor)));
  const sky = new Uint32Array(horRow + 1);
  for (let y = 0; y <= horRow; y++) {
    const t = horRow ? y / horRow : 1;
    const a = look.skyTop;
    const b = look.skyHorizon;
    sky[y] = pack(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  }

  // Floor: one row at a time, stepping across the ground under that row.
  const floorTex = look.tex.floors;
  const stepScale = 1 / f;
  for (let y = horRow; y < bh; y++) {
    const p = y + 0.5 - hor;
    if (p <= 0) continue;
    const rowDist = (eye * f) / p;
    const t = fogAt(rowDist);
    const keep = 1 - t;
    const fR = fr * t;
    const fG = fg * t;
    const fB = fb * t;
    const camX0 = (0.5 - cx) / f;
    let wx = posX + rowDist * (dirX + rX * camX0);
    let wy = posY + rowDist * (dirY + rY * camX0);
    const sx = rowDist * rX * stepScale;
    const sy = rowDist * rY * stepScale;
    let o = y * bw;
    for (let x = 0; x < bw; x++, o++, wx += sx, wy += sy) {
      const tx = Math.floor(wx);
      const ty = Math.floor(wy);
      let kind: number = FLOOR.sidewalk;
      if (tx >= 0 && ty >= 0 && tx < W && ty < H) kind = floors[ty * W + tx] || FLOOR.sidewalk;
      const tex = floorTex[kind]!;
      const u = ((wx - tx) * FLOOR_TEX) | 0;
      const v = ((wy - ty) * FLOOR_TEX) | 0;
      const c = tex[(v & 63) * FLOOR_TEX + (u & 63)]!;
      px[o] = pack(
        (c & 255) * keep + fR,
        ((c >>> 8) & 255) * keep + fG,
        ((c >>> 16) & 255) * keep + fB,
      );
    }
  }

  // Walls: one ray per column.
  const wallTex = look.tex.walls;
  for (let x = 0; x < bw; x++) {
    const camX = (x + 0.5 - cx) / f;
    const rdx = dirX + rX * camX;
    const rdy = dirY + rY * camX;
    let mapX = Math.floor(posX);
    let mapY = Math.floor(posY);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
    const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX: number;
    let stepY: number;
    let sideX: number;
    let sideY: number;
    if (rdx < 0) {
      stepX = -1;
      sideX = (posX - mapX) * ddx;
    } else {
      stepX = 1;
      sideX = (mapX + 1 - posX) * ddx;
    }
    if (rdy < 0) {
      stepY = -1;
      sideY = (posY - mapY) * ddy;
    } else {
      stepY = 1;
      sideY = (mapY + 1 - posY) * ddy;
    }
    let side = 0;
    let wall = 0;
    for (let i = 0; i < 96; i++) {
      if (sideX < sideY) {
        sideX += ddx;
        mapX += stepX;
        side = 0;
      } else {
        sideY += ddy;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapY < 0 || mapX >= W || mapY >= H) break;
      wall = walls[mapY * W + mapX]!;
      if (wall) break;
    }
    if (!wall) {
      z[x] = Infinity;
      for (let y = 0; y < horRow; y++) px[y * bw + x] = sky[y]!;
      continue;
    }
    const dist = side === 0 ? sideX - ddx : sideY - ddy;
    z[x] = dist;
    let wallX = side === 0 ? posY + dist * rdy : posX + dist * rdx;
    wallX -= Math.floor(wallX);
    let tu = (wallX * TEX_W) | 0;
    if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tu = TEX_W - 1 - tu;
    const top = hor + ((eye - WALL_H) * f) / dist;
    const bottom = hor + (eye * f) / dist;
    const y0 = Math.max(0, Math.ceil(top));
    const y1 = Math.min(bh, Math.ceil(bottom));
    for (let y = 0; y < Math.min(y0, horRow); y++) px[y * bw + x] = sky[y]!;
    const t = fogAt(dist);
    const shade = (side === 1 ? 0.84 : 1) * (1 - t);
    const fR = fr * t;
    const fG = fg * t;
    const fB = fb * t;
    const tex = wallTex[wall]!;
    const step = TEX_H / (bottom - top);
    let tv = (y0 - top) * step;
    for (let y = y0; y < y1; y++, tv += step) {
      const c = tex[Math.min(TEX_H - 1, tv | 0) * TEX_W + tu]!;
      px[y * bw + x] = pack(
        (c & 255) * shade + fR,
        ((c >>> 8) & 255) * shade + fG,
        ((c >>> 16) & 255) * shade + fB,
      );
    }
  }
  view.ctx.putImageData(view.img, 0, 0);
}

/**
 * Draws something that occupies screen columns x0..x1 (CSS px) at `depth`,
 * clipped to the columns where it is nearer than the wall there.
 */
export function drawDepthClipped(
  ctx: CanvasRenderingContext2D,
  view: RayView,
  cam: Cam3,
  x0: number,
  x1: number,
  depth: number,
  draw: () => void,
): void {
  const k = view.bw / cam.w;
  const c0 = Math.max(0, Math.floor(x0 * k));
  const c1 = Math.min(view.bw - 1, Math.floor(x1 * k));
  if (c1 < c0) return;
  // Fast path: nothing in front of it.
  let all = true;
  for (let c = c0; c <= c1; c++) if (view.z[c]! <= depth) all = false;
  if (all) {
    draw();
    return;
  }
  let run = -1;
  for (let c = c0; c <= c1 + 1; c++) {
    const visible = c <= c1 && view.z[c]! > depth;
    if (visible && run < 0) run = c;
    if (!visible && run >= 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(run / k, 0, (c - run) / k, cam.h);
      ctx.clip();
      draw();
      ctx.restore();
      run = -1;
    }
  }
}
