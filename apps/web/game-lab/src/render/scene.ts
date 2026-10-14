/**
 * The 2.5D backdrops, drawn with plain Canvas 2D on the pseudo-3D camera:
 * the kitchen (a plank counter running to a vanishing point between tiled
 * walls), the street for pickup and return, and the sharpening bench. A
 * fixed horizon, no camera roll and capped scroll speed keep it comfortable.
 */
import { INK } from "../../../src/art/fruit.ts";
import type { Band } from "../sim/edge.ts";
import { project, rowAt, type Camera, type Projected } from "../sim/projection.ts";
import { star } from "./fx.ts";

const Z_NEAR = 0.6;
const Z_BACK = 16;
const p0: Projected = { x: 0, y: 0, s: 0 };
const p1: Projected = { x: 0, y: 0, s: 0 };
const p2: Projected = { x: 0, y: 0, s: 0 };
const p3: Projected = { x: 0, y: 0, s: 0 };

type RGB = [number, number, number];

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: RGB, b: RGB, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Dull Days palette (Level 1) and the restored, warmer palette (Level 2). */
const DULL = {
  wall: hex("#cfc3ad"),
  tile: hex("#b7aa92"),
  plankA: hex("#a98760"),
  plankB: hex("#9b7a55"),
  belt: hex("#6e6253"),
  chevron: hex("#857766"),
  fog: hex("#b9ae9a"),
  sky: hex("#a9b4ba"),
};
const BRIGHT = {
  wall: hex("#f6e3bf"),
  tile: hex("#e6c995"),
  plankA: hex("#e6b273"),
  plankB: hex("#d89f5f"),
  belt: hex("#4f6b5b"),
  chevron: hex("#9fd3b0"),
  fog: hex("#f8e9cc"),
  sky: hex("#9fd2e6"),
};

function quad(
  ctx: CanvasRenderingContext2D,
  a: Projected,
  b: Projected,
  c: Projected,
  d: Projected,
) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

function counterHalfWidth(cam: Camera): number {
  return Math.max(cam.laneX * 1.7, 0.9);
}

/**
 * The kitchen. `glow` runs 0 (Level 1, dull and grey) to 1 (Level 2, warm and
 * bright). `scroll` moves planks, tiles and conveyor marks toward the camera.
 */
export function drawKitchen(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  scroll: number,
  glow: number,
  t: number,
): void {
  const { w, h } = cam;
  const wall = mixRGB(DULL.wall, BRIGHT.wall, glow);
  const tile = mixRGB(DULL.tile, BRIGHT.tile, glow);
  const fog = mixRGB(DULL.fog, BRIGHT.fog, glow);
  const plankA = mixRGB(DULL.plankA, BRIGHT.plankA, glow);
  const plankB = mixRGB(DULL.plankB, BRIGHT.plankB, glow);
  const W = counterHalfWidth(cam);
  const wallX = W;
  const wallH = 2.6;

  // Back wall and ceiling glow.
  const grad = ctx.createLinearGradient(0, 0, 0, cam.horizon + 40);
  grad.addColorStop(0, mix(wall, [40, 36, 30], 0.35));
  grad.addColorStop(1, mix(wall, fog, 0.4));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Window on the back wall with a slow sky (the parallax layer).
  project(cam, -0.75, 2.1, Z_BACK, p0);
  project(cam, 0.75, 1.15, Z_BACK, p1);
  const sky = ctx.createLinearGradient(0, p0.y, 0, p1.y);
  sky.addColorStop(0, mix(mixRGB(DULL.sky, BRIGHT.sky, glow), [255, 255, 255], 0.1));
  sky.addColorStop(1, mix(mixRGB(DULL.sky, BRIGHT.sky, glow), [255, 244, 214], 0.5));
  ctx.fillStyle = sky;
  ctx.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  ctx.save();
  ctx.beginPath();
  ctx.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const ww = p1.x - p0.x;
  for (let i = 0; i < 3; i++) {
    const cxl = p0.x + ((i * 0.37 + t * 0.012) % 1.3) * ww * 1.1 - ww * 0.15;
    const cyl = p0.y + (0.25 + i * 0.22) * (p1.y - p0.y);
    ctx.beginPath();
    ctx.ellipse(cxl, cyl, ww * 0.12, ww * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
  ctx.beginPath();
  ctx.moveTo((p0.x + p1.x) / 2, p0.y);
  ctx.lineTo((p0.x + p1.x) / 2, p1.y);
  ctx.stroke();

  // Ceiling with beams riding toward the camera.
  project(cam, -wallX, wallH, Z_NEAR, p0);
  project(cam, -wallX, wallH, Z_BACK, p1);
  project(cam, wallX, wallH, Z_BACK, p2);
  project(cam, wallX, wallH, Z_NEAR, p3);
  quad(ctx, p0, p1, p2, p3);
  ctx.fillStyle = mix(wall, [40, 36, 30], 0.28);
  ctx.fill();
  ctx.strokeStyle = mix(wall, [40, 36, 30], 0.45);
  ctx.lineWidth = 3;
  ctx.beginPath();
  const beam = 1.4;
  for (let z = Z_NEAR + beam - (scroll % beam); z < Z_BACK; z += beam) {
    project(cam, -wallX, wallH, z, p0);
    project(cam, wallX, wallH, z, p1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();
  // Pendant lights, warmer once the edge is back.
  for (let z = Z_NEAR + beam * 2 - (scroll % (beam * 2)); z < Z_BACK; z += beam * 2) {
    project(cam, 0, wallH - 0.35, z, p0);
    const r = 0.09 * p0.s;
    if (r < 1) continue;
    const lg = ctx.createRadialGradient(p0.x, p0.y, 0, p0.x, p0.y, r * 4);
    lg.addColorStop(0, `rgba(255,240,200,${0.35 + 0.35 * glow})`);
    lg.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(p0.x - r * 4, p0.y - r * 4, r * 8, r * 8);
    ctx.fillStyle = mix(hex("#d9d2c2"), hex("#fff3d0"), glow);
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Side walls with scrolling tiles.
  for (const side of [-1, 1]) {
    project(cam, side * wallX, 0, Z_NEAR, p0);
    project(cam, side * wallX, 0, Z_BACK, p1);
    project(cam, side * wallX, wallH, Z_BACK, p2);
    project(cam, side * wallX, wallH, Z_NEAR, p3);
    quad(ctx, p0, p1, p2, p3);
    const wg = ctx.createLinearGradient(p0.x, 0, p1.x, 0);
    wg.addColorStop(0, mix(wall, [30, 26, 22], 0.25));
    wg.addColorStop(1, mix(wall, fog, 0.6));
    ctx.fillStyle = wg;
    ctx.fill();
    ctx.strokeStyle = mix(tile, fog, 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 0.25; y < wallH; y += 0.25) {
      project(cam, side * wallX, y, Z_NEAR, p0);
      project(cam, side * wallX, y, Z_BACK, p1);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
    const tileZ = 0.5;
    const off = scroll % tileZ;
    for (let z = Z_NEAR + tileZ - off; z < Z_BACK; z += tileZ) {
      project(cam, side * wallX, 0, z, p0);
      project(cam, side * wallX, wallH, z, p1);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
    ctx.stroke();
  }

  // Backsplash band at the far end, below the window.
  project(cam, -wallX, 0, Z_BACK, p0);
  project(cam, wallX, 1.0, Z_BACK, p1);
  ctx.fillStyle = mix(tile, fog, 0.5);
  ctx.fillRect(p0.x, p1.y, p1.x - p0.x, p0.y - p1.y);

  // Counter: planks across the room, scrolling toward the camera, with fog.
  const plank = 0.7;
  const shift = scroll % (plank * 2);
  let z = Z_BACK + plank * 2 - shift;
  let parity = 0;
  while (z > Z_NEAR) {
    const zFar = Math.min(z, Z_BACK);
    const zNear = Math.max(Z_NEAR, z - plank);
    if (zNear < zFar) {
      const yFar = rowAt(cam, 0, zFar);
      const yNear = Math.min(h + 2, rowAt(cam, 0, zNear));
      const xf = W * (cam.f / zFar);
      const xn = W * (cam.f / zNear);
      ctx.beginPath();
      ctx.moveTo(cam.cx - xf, yFar);
      ctx.lineTo(cam.cx + xf, yFar);
      ctx.lineTo(cam.cx + xn, yNear);
      ctx.lineTo(cam.cx - xn, yNear);
      ctx.closePath();
      const f = Math.pow(Math.min(1, zFar / Z_BACK), 1.2) * 0.85;
      ctx.fillStyle = mix(parity ? plankA : plankB, fog, f);
      ctx.fill();
    }
    z -= plank;
    parity ^= 1;
    if (rowAt(cam, 0, z) > h + 40) break;
  }

  // Grain lines converging on the vanishing point.
  ctx.strokeStyle = `rgba(60,40,20,${0.12 + glow * 0.04})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -W; x <= W; x += W / 7) {
    project(cam, x, 0, Z_NEAR, p0);
    project(cam, x, 0, Z_BACK, p1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();

  // The conveyor strip down the middle, with chevrons riding toward you.
  const beltX = cam.laneX * 1.15;
  project(cam, -beltX, 0, Z_NEAR, p0);
  project(cam, -beltX, 0, Z_BACK, p1);
  project(cam, beltX, 0, Z_BACK, p2);
  project(cam, beltX, 0, Z_NEAR, p3);
  quad(ctx, p0, p1, p2, p3);
  const bg = ctx.createLinearGradient(0, p1.y, 0, h);
  bg.addColorStop(0, mix(mixRGB(DULL.belt, BRIGHT.belt, glow), fog, 0.75));
  bg.addColorStop(1, mix(mixRGB(DULL.belt, BRIGHT.belt, glow), fog, 0.05));
  ctx.fillStyle = bg;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = mix(mixRGB(DULL.chevron, BRIGHT.chevron, glow), fog, 0.2);
  ctx.lineWidth = 2;
  const cz = 0.9;
  const coff = scroll % cz;
  ctx.beginPath();
  for (let zz = Z_NEAR + cz - coff; zz < Z_BACK * 0.7; zz += cz) {
    project(cam, -beltX * 0.6, 0, zz + 0.25, p0);
    project(cam, 0, 0, zz, p1);
    project(cam, beltX * 0.6, 0, zz + 0.25, p2);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(31,38,32,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    project(cam, s * beltX, 0, Z_NEAR, p0);
    project(cam, s * beltX, 0, Z_BACK, p1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();

  // A warm light pooling on the cut zone once the edge is back.
  if (glow > 0) {
    const ly = rowAt(cam, 0, 1.6);
    const lg = ctx.createRadialGradient(cam.cx, ly, 10, cam.cx, ly, Math.max(w, h) * 0.6);
    lg.addColorStop(0, `rgba(255,236,190,${0.22 * glow})`);
    lg.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Soft shadow on the counter under an item, so height reads clearly. */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  x: number,
  y: number,
  z: number,
  r: number,
  alpha: number,
): void {
  project(cam, x, 0, z, p0);
  const lift = Math.max(0, Math.min(1, y / 0.9));
  const rr = r * p0.s * (1 - lift * 0.45);
  ctx.globalAlpha = alpha * (0.32 - lift * 0.18);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(p0.x, p0.y, rr, rr * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ---------- Knife viewmodel ---------- */

const BLADE: Record<Band, { fill: string; edge: string }> = {
  keen: { fill: "#eef3f5", edge: "#ffffff" },
  worn: { fill: "#cdd2d3", edge: "#e2e6e7" },
  dull: { fill: "#a9a89f", edge: "#8f8d84" },
  gone: { fill: "#8f8b83", edge: "#6e6a62" },
};

/** First-person chef's knife in the bottom corner. */
export function drawKnife(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  band: Band,
  swing: number,
  recoil: number,
  t: number,
  still: boolean,
): void {
  const size = Math.min(cam.w * 0.46, cam.h * 0.3, 280);
  // Rotating by a positive angle points the blade (local -x) up and to the left.
  const droop = band === "gone" ? 0.22 : band === "dull" ? 0.1 : 0;
  const wobble = still ? 0 : Math.sin(t * 38) * recoil * 0.1;
  const rot = 0.5 - swing * 0.32 - droop + wobble;
  const x = cam.w - size * 0.1;
  const y = cam.h + size * 0.02 - swing * size * 0.05;
  const b = BLADE[band];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const L = size;
  const W = size * 0.17;
  // Handle
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-L * 0.06, -W * 0.36, L * 0.42, W * 0.72, W * 0.3);
  ctx.fill();
  ctx.fillStyle = "#c9d0d4";
  for (const k of [0.06, 0.18, 0.3]) {
    ctx.beginPath();
    ctx.arc(L * k, 0, W * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bolster
  ctx.fillStyle = "#b9c2c7";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-L * 0.1, -W * 0.5, L * 0.06, W * 1.0, 3);
  ctx.fill();
  ctx.stroke();
  // Blade: spine on top, edge curving up to the tip.
  ctx.beginPath();
  ctx.moveTo(-L * 0.1, -W * 0.5);
  ctx.lineTo(-L * 0.9, -W * 0.38);
  ctx.quadraticCurveTo(-L * 1.02, -W * 0.36, -L * 1.06, -W * 0.2);
  ctx.quadraticCurveTo(-L * 0.8, W * 0.62, -L * 0.1, W * 0.6);
  ctx.closePath();
  ctx.fillStyle = b.fill;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Edge bevel
  ctx.beginPath();
  ctx.moveTo(-L * 1.04, -W * 0.16);
  ctx.quadraticCurveTo(-L * 0.8, W * 0.46, -L * 0.12, W * 0.44);
  ctx.strokeStyle = b.edge;
  ctx.lineWidth = band === "keen" ? 3 : 2;
  ctx.stroke();
  if (band === "gone" || band === "dull") {
    // Nicks and dull patches along the edge.
    ctx.fillStyle = band === "gone" ? "#5e5a53" : "#8b897f";
    const n = band === "gone" ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const k = 0.25 + (i / n) * 0.65;
      ctx.beginPath();
      ctx.arc(-L * k, W * (0.5 - k * 0.25), W * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (band === "keen" && !still) {
    // A glint sliding along the blade.
    const k = (t * 0.6) % 1.6;
    if (k < 1) {
      ctx.save();
      ctx.clip();
      const gx = -L * (0.1 + k);
      const gg = ctx.createLinearGradient(gx - W, 0, gx + W, 0);
      gg.addColorStop(0, "rgba(255,255,255,0)");
      gg.addColorStop(0.5, "rgba(255,255,255,0.9)");
      gg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(gx - W, -W, W * 2, W * 2);
      ctx.restore();
    }
  }
  ctx.restore();
}

/* ---------- Street (pickup and return) ---------- */

const HOUSES = ["#e7c6a5", "#c5d9c0", "#d8c7e0", "#f0d79a", "#c9dbe6"];

/**
 * A quiet street, scrolling forward. `beat` picks what happens on the right-hand
 * doorstep: the bag waits for pickup, or the knife comes back gleaming.
 */
export function drawStreet(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  scroll: number,
  t: number,
  beat: "pickup" | "return",
  still: boolean,
): void {
  const { w, h } = cam;
  const sky = ctx.createLinearGradient(0, 0, 0, cam.horizon);
  sky.addColorStop(0, "#8fc6de");
  sky.addColorStop(1, "#f7e6c4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, cam.horizon + 1);
  // Distant hills
  ctx.fillStyle = "#9fbf8a";
  ctx.beginPath();
  ctx.moveTo(0, cam.horizon);
  for (let x = 0; x <= w; x += w / 8) {
    ctx.lineTo(x, cam.horizon - 10 - 14 * Math.abs(Math.sin(x * 0.013 + 1)));
  }
  ctx.lineTo(w, cam.horizon);
  ctx.closePath();
  ctx.fill();
  // Lawn
  ctx.fillStyle = "#8fb36a";
  ctx.fillRect(0, cam.horizon, w, h - cam.horizon);
  // Road and sidewalks, scaled so a narrow portrait screen still shows the doorstep.
  const k = Math.max(0.5, Math.min(1.6, cam.laneX / 0.9));
  const road = 1.0 * k;
  const walk = 1.6 * k;
  for (const [x0, x1, color] of [
    [-walk, walk, "#d9cfbd"],
    [-road, road, "#6d7275"],
  ] as const) {
    project(cam, x0, 0, Z_NEAR, p0);
    project(cam, x0, 0, 40, p1);
    project(cam, x1, 0, 40, p2);
    project(cam, x1, 0, Z_NEAR, p3);
    quad(ctx, p0, p1, p2, p3);
    ctx.fillStyle = color;
    ctx.fill();
  }
  // Lane dashes and sidewalk joints
  ctx.strokeStyle = "#f2e7c9";
  ctx.lineWidth = 3;
  const dash = 1.2;
  const off = scroll % dash;
  ctx.beginPath();
  for (let z = Z_NEAR + dash - off; z < 30; z += dash) {
    project(cam, 0, 0, z, p0);
    project(cam, 0, 0, z + dash * 0.5, p1);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(31,38,32,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let z = Z_NEAR + 0.6 - (scroll % 0.6); z < 30; z += 0.6) {
    for (const s of [-1, 1]) {
      project(cam, s * road, 0, z, p0);
      project(cam, s * walk, 0, z, p1);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
    }
  }
  ctx.stroke();

  // Houses on both sides, far to near.
  const spacing = 3.2;
  const hoff = scroll % spacing;
  const fronts: { z: number; side: number; i: number }[] = [];
  for (let k = 0, z = 30 - hoff; z > Z_NEAR - 2.4; z -= spacing, k++) {
    for (const side of [-1, 1])
      fronts.push({ z, side, i: (Math.floor((scroll + z) / spacing) + (side > 0 ? 2 : 0)) & 7 });
  }
  for (const f of fronts) drawHouse(ctx, cam, f.side, f.z, HOUSES[f.i % HOUSES.length]!, k);

  // The doorstep on the right, near the camera: a front door, a step and the bag.
  const doorZ = 2.3;
  project(cam, 1.2 * k, 0, doorZ, p0);
  const s = p0.s;
  ctx.fillStyle = "#e7c6a5";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.fillRect(p0.x - 0.34 * s, p0.y - 0.95 * s, 0.68 * s, 0.9 * s);
  ctx.strokeRect(p0.x - 0.34 * s, p0.y - 0.95 * s, 0.68 * s, 0.9 * s);
  ctx.fillStyle = "#5b4636";
  ctx.beginPath();
  ctx.roundRect(p0.x - 0.15 * s, p0.y - 0.8 * s, 0.3 * s, 0.75 * s, [0.12 * s, 0.12 * s, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f2c94c";
  ctx.beginPath();
  ctx.arc(p0.x + 0.09 * s, p0.y - 0.42 * s, 0.022 * s, 0, Math.PI * 2);
  ctx.fill();
  // Step
  ctx.fillStyle = "#cbbfae";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(p0.x - 0.22 * s, p0.y - 0.06 * s, 0.5 * s, 0.07 * s, 3);
  ctx.fill();
  ctx.stroke();
  if (beat === "pickup") {
    const gone = t > 2.3;
    if (!gone) drawBag(ctx, p0.x, p0.y - 0.06 * s, s * 0.16, false, t, still);
  } else {
    drawBag(ctx, p0.x, p0.y - 0.06 * s, s * 0.16, true, t, still);
  }

  // The van: comes up the road, pauses by the step, then pulls away.
  let vz: number;
  if (beat === "pickup") {
    vz =
      t < 1.6
        ? 14 - (14 - 3.2) * easeOut(t / 1.6)
        : t < 2.7
          ? 3.2
          : 3.2 + 9 * Math.pow((t - 2.7) / 1.5, 2);
  } else {
    vz = 3.2 + 10 * Math.pow(Math.min(1, t / 2.6), 1.6);
  }
  if (still) vz = beat === "pickup" ? 3.2 : 6;
  if (vz < 25) drawVan(ctx, cam, 0.45 * k, vz);
}

function easeOut(k: number): number {
  const c = Math.max(0, Math.min(1, k));
  return 1 - (1 - c) * (1 - c);
}

function drawHouse(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  side: number,
  z: number,
  color: string,
  k: number,
) {
  const x = side * 2.3 * k;
  const depth = 2.2;
  const zn = Math.max(Z_NEAR, z - depth);
  if (z < Z_NEAR) return;
  const hh = 1.5;
  project(cam, x, 0, zn, p0);
  project(cam, x, 0, z, p1);
  project(cam, x, hh, z, p2);
  project(cam, x, hh, zn, p3);
  quad(ctx, p0, p1, p2, p3);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Roof edge
  project(cam, x, hh + 0.5, (zn + z) / 2, p1);
  ctx.beginPath();
  ctx.moveTo(p3.x, p3.y);
  ctx.lineTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.closePath();
  ctx.fillStyle = "#a35b45";
  ctx.fill();
  ctx.stroke();
  // Door and window on the face toward the road
  const dz = zn + (z - zn) * 0.35;
  project(cam, x, 0, dz, p0);
  project(cam, x, 0.75, dz + 0.4, p1);
  ctx.fillStyle = "#5b4636";
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  project(cam, x, 0, dz + 0.4, p2);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p1.x, p1.y);
  project(cam, x, 0.75, dz, p3);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fill();
  const wz = zn + (z - zn) * 0.7;
  project(cam, x, 0.55, wz, p0);
  project(cam, x, 0.55, wz + 0.45, p1);
  project(cam, x, 1.0, wz + 0.45, p2);
  project(cam, x, 1.0, wz, p3);
  quad(ctx, p0, p1, p2, p3);
  ctx.fillStyle = "#cfe6ee";
  ctx.fill();
  ctx.stroke();
}

function drawBag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  returned: boolean,
  t: number,
  still: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  // Handles
  ctx.beginPath();
  ctx.arc(0, -s * 1.05, s * 0.32, Math.PI, 0);
  ctx.stroke();
  // Closed bag
  ctx.fillStyle = returned ? "#24604b" : "#536050";
  ctx.beginPath();
  ctx.roundRect(-s * 0.6, -s * 1.1, s * 1.2, s * 1.1, s * 0.12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff7e8";
  ctx.font = `700 ${Math.round(s * 0.34)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WKC", 0, -s * 0.55);
  if (returned) {
    const k = still ? 1 : 0.6 + 0.4 * Math.sin(t * 5);
    ctx.fillStyle = `rgba(255,247,207,${k})`;
    star(ctx, s * 0.55, -s * 1.3, s * 0.35);
    star(ctx, -s * 0.5, -s * 1.5, s * 0.2);
  }
  ctx.restore();
}

function drawVan(ctx: CanvasRenderingContext2D, cam: Camera, x: number, z: number) {
  project(cam, x, 0, z, p0);
  const s = p0.s;
  const vw = 0.62 * s;
  const vh = 0.5 * s;
  const bx = p0.x - vw / 2;
  const by = p0.y - vh - 0.05 * s;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, s * 0.006);
  ctx.fillStyle = INK;
  ctx.fillRect(bx + vw * 0.08, p0.y - 0.08 * s, vw * 0.18, 0.08 * s);
  ctx.fillRect(bx + vw * 0.74, p0.y - 0.08 * s, vw * 0.18, 0.08 * s);
  ctx.fillStyle = "#fff7e8";
  ctx.beginPath();
  ctx.roundRect(bx, by, vw, vh, vw * 0.08);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#cfe6ee";
  ctx.fillRect(bx + vw * 0.1, by + vh * 0.1, vw * 0.8, vh * 0.3);
  ctx.strokeRect(bx + vw * 0.1, by + vh * 0.1, vw * 0.8, vh * 0.3);
  ctx.fillStyle = "#24604b";
  ctx.fillRect(bx, by + vh * 0.55, vw, vh * 0.16);
  ctx.fillStyle = "#24604b";
  ctx.beginPath();
  ctx.arc(p0.x, by + vh * 0.82, vh * 0.12, 0, Math.PI * 2);
  ctx.fill();
  if (vh > 18) {
    ctx.fillStyle = "#fff7e8";
    ctx.font = `700 ${Math.round(vh * 0.11)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WKC", p0.x, by + vh * 0.82);
  }
  ctx.fillStyle = "#f2c94c";
  ctx.fillRect(bx + vw * 0.04, by + vh * 0.78, vw * 0.1, vh * 0.08);
  ctx.fillRect(bx + vw * 0.86, by + vh * 0.78, vw * 0.1, vh * 0.08);
  ctx.restore();
}

/* ---------- Sharpening bench ---------- */

/** A point on the bench knife's edge (k from 0 at the tip to 1 at the heel), in CSS px. */
export function benchEdgePoint(cam: Camera, k: number): { x: number; y: number } {
  const L = Math.min(cam.w * 0.8, 620);
  const W = L * 0.16;
  const ox = cam.cx + L * 0.5;
  const oy = cam.h * 0.5;
  // Same quadratic as the edge line in drawBench.
  const ax = -L * 1.0;
  const ay = -W * 0.16;
  const bx = -L * 0.78;
  const by = W * 0.46;
  const cx = -L * 0.02;
  const cy = W * 0.44;
  const u = 1 - k;
  return {
    x: ox + u * u * ax + 2 * u * k * bx + k * k * cx,
    y: oy + u * u * ay + 2 * u * k * by + k * k * cy,
  };
}

/**
 * The abstract sharpening beat: a spotlit bench and the knife, its edge line
 * brightening with every stroke. `restoredFor` is seconds since it hit 100%.
 */
export function drawBench(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  edge: number,
  t: number,
  restoredFor: number,
  still: boolean,
): void {
  const { w, h } = cam;
  const k = edge / 100;
  ctx.fillStyle = "#17191a";
  ctx.fillRect(0, 0, w, h);
  const spot = ctx.createRadialGradient(
    cam.cx,
    h * 0.48,
    10,
    cam.cx,
    h * 0.48,
    Math.max(w, h) * 0.7,
  );
  spot.addColorStop(0, `rgba(255,226,170,${0.16 + 0.22 * k})`);
  spot.addColorStop(1, "rgba(255,226,170,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, w, h);
  // Bench top in perspective
  const top = h * 0.62;
  ctx.fillStyle = "#4d3823";
  ctx.beginPath();
  ctx.moveTo(w * 0.08, top);
  ctx.lineTo(w * 0.92, top);
  ctx.lineTo(w * 1.2, h);
  ctx.lineTo(-w * 0.2, h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,226,170,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const y = top + (h - top) * (i / 6) ** 1.6;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  const L = Math.min(w * 0.8, 620);
  const cy = h * 0.5;
  const W = L * 0.16;
  ctx.save();
  ctx.translate(cam.cx + L * 0.5, cy);
  // Handle on the right
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(0, -W * 0.36, L * 0.32, W * 0.72, W * 0.3);
  ctx.fill();
  ctx.fillStyle = "#c9d0d4";
  for (const kx of [0.07, 0.16, 0.25]) {
    ctx.beginPath();
    ctx.arc(L * kx, 0, W * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  // Blade to the left
  const blade = new Path2D();
  blade.moveTo(0, -W * 0.5);
  blade.lineTo(-L * 0.86, -W * 0.38);
  blade.quadraticCurveTo(-L * 0.98, -W * 0.36, -L * 1.02, -W * 0.2);
  blade.quadraticCurveTo(-L * 0.78, W * 0.62, 0, W * 0.6);
  blade.closePath();
  ctx.fillStyle = mix(hex("#8f8b83"), hex("#eef3f5"), k);
  ctx.fill(blade);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  ctx.stroke(blade);
  // The edge: grey and nicked at 0, a hot bright line at 100.
  ctx.beginPath();
  ctx.moveTo(-L * 1.0, -W * 0.16);
  ctx.quadraticCurveTo(-L * 0.78, W * 0.46, -L * 0.02, W * 0.44);
  ctx.strokeStyle = mix(hex("#6e6a62"), hex("#ffffff"), k);
  ctx.lineWidth = 2 + 3 * k;
  if (k > 0.5) {
    ctx.shadowColor = `rgba(255,240,190,${(k - 0.5) * 1.6})`;
    ctx.shadowBlur = 18 * k;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (restoredFor >= 0) {
    // A sweep of light along the blade, then a star at the tip.
    const sweep = still ? 1 : Math.min(1, restoredFor / 0.8);
    ctx.save();
    ctx.clip(blade);
    const gx = -L * sweep * 1.05;
    const gg = ctx.createLinearGradient(gx - W * 1.5, 0, gx + W * 1.5, 0);
    gg.addColorStop(0, "rgba(255,255,255,0)");
    gg.addColorStop(0.5, "rgba(255,255,255,0.95)");
    gg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gg;
    ctx.fillRect(gx - W * 1.5, -W, W * 3, W * 2);
    ctx.restore();
    const pulse = still ? 1 : 0.8 + 0.2 * Math.sin(t * 9);
    ctx.fillStyle = "#fff7cf";
    star(ctx, -L * 1.02, -W * 0.2, W * 0.6 * pulse * Math.min(1, restoredFor * 2));
  }
  ctx.restore();

  if (restoredFor >= 0) {
    const a = Math.max(0, 0.45 - restoredFor * 0.25);
    const glow = ctx.createRadialGradient(cam.cx, cy, 10, cam.cx, cy, Math.max(w, h) * 0.6);
    glow.addColorStop(0, `rgba(255,236,190,${a})`);
    glow.addColorStop(1, "rgba(255,236,190,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    if (!still) {
      // Rays
      ctx.save();
      ctx.translate(cam.cx, cy);
      ctx.rotate(t * 0.3);
      ctx.fillStyle = `rgba(255,240,200,${Math.max(0, 0.18 - restoredFor * 0.05)})`;
      for (let i = 0; i < 12; i++) {
        ctx.rotate((Math.PI * 2) / 12);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(w, h), -24);
        ctx.lineTo(Math.max(w, h), 24);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
