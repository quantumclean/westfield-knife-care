/**
 * Procedural textures for the street, painted once at load with Canvas 2D in
 * the site's inked style and read back as packed pixels for the raycaster.
 * No image files. Each texture comes in two palettes: dull (Walk 1, overcast
 * and washed out) and bright (Walk 2, warm and saturated).
 */
import { INK } from "../../../src/art/fruit.ts";
import { FLOOR, FLOOR_KINDS, WALL, WALL_KINDS } from "./map.ts";

export const TEX_W = 64;
export const TEX_H = 128;
export const FLOOR_TEX = 64;

export interface TextureSet {
  walls: Uint32Array[];
  floors: Uint32Array[];
}

export interface Textures {
  dull: TextureSet;
  bright: TextureSet;
}

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D is not available");
  return [c, ctx];
}

function pixels(ctx: Ctx, w: number, h: number): Uint32Array {
  const data = ctx.getImageData(0, 0, w, h).data;
  return new Uint32Array(data.buffer.slice(0));
}

/** Small deterministic noise so textures are the same every load. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------- Walls (64 x 128: one tile wide, full wall height) ---------- */

function windowPane(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#d9eef4");
  g.addColorStop(1, "#8fbccc");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + h - 6);
  ctx.lineTo(x + w * 0.45, y + 4);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.fillRect(x + w / 2 - 1, y, 2, h);
  ctx.fillRect(x, y + h / 2 - 1, w, 2);
  ctx.fillStyle = "#f3ecdc";
  ctx.fillRect(x - 4, y + h + 2, w + 8, 3);
}

function eave(ctx: Ctx, roof: string): void {
  ctx.fillStyle = roof;
  ctx.fillRect(0, 0, TEX_W, 9);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 9, TEX_W, 2);
}

function siding(ctx: Ctx, base: string): void {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let y = 14; y < TEX_H; y += 7) {
    ctx.fillStyle = "rgba(31,38,32,0.16)";
    ctx.fillRect(0, y, TEX_W, 1);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, y + 1, TEX_W, 1);
  }
  eave(ctx, "#7a4f3d");
  ctx.fillStyle = "#f6efe0";
  ctx.fillRect(0, 11, 3, TEX_H);
  ctx.fillStyle = "rgba(31,38,32,0.35)";
  ctx.fillRect(3, 11, 1, TEX_H);
  ctx.fillStyle = "#5a5f57";
  ctx.fillRect(0, TEX_H - 6, TEX_W, 6);
}

function house(ctx: Ctx, base: string): void {
  siding(ctx, base);
  windowPane(ctx, 16, 22, 32, 30);
  windowPane(ctx, 16, 70, 32, 34);
}

function brick(ctx: Ctx, rnd: () => number): void {
  ctx.fillStyle = "#c9a184";
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let row = 0, y = 0; y < TEX_H; row++, y += 8) {
    const off = row % 2 ? 8 : 0;
    for (let x = -off; x < TEX_W; x += 16) {
      const t = rnd();
      ctx.fillStyle = t < 0.15 ? "#8f4c3a" : t < 0.3 ? "#b56a50" : "#a35b45";
      ctx.fillRect(x + 1, y + 1, 14, 6);
    }
  }
  ctx.fillStyle = "#5a5f57";
  ctx.fillRect(0, TEX_H - 4, TEX_W, 4);
}

function shop(ctx: Ctx, rnd: () => number, kind: "bakery" | "market" | "wkc"): void {
  brick(ctx, rnd);
  eave(ctx, "#3d4a42");
  // Sign board
  ctx.fillStyle = INK;
  ctx.fillRect(6, 20, 52, 26);
  ctx.fillStyle = kind === "wkc" ? "#24604b" : "#fff7e8";
  ctx.fillRect(8, 22, 48, 22);
  if (kind === "wkc") {
    ctx.fillStyle = "#fff7e8";
    ctx.font = "bold 14px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("WKC", 32, 34);
  } else if (kind === "bakery") {
    ctx.fillStyle = "#d39446";
    ctx.beginPath();
    ctx.ellipse(32, 33, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    for (const x of [24, 32, 40]) {
      ctx.moveTo(x - 2, 29);
      ctx.lineTo(x + 2, 37);
    }
    ctx.stroke();
  } else {
    for (const [x, c] of [
      [22, "#e2482d"],
      [32, "#f4cc3a"],
      [42, "#6f9a45"],
    ] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, 33, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  // Striped awning with a scalloped edge
  const [a, b] =
    kind === "wkc"
      ? ["#24604b", "#fff7e8"]
      : kind === "bakery"
        ? ["#b2432a", "#fff7e8"]
        : ["#2f6f8f", "#fff7e8"];
  for (let x = 0; x < TEX_W; x += 8) {
    ctx.fillStyle = (x / 8) % 2 ? b : a;
    ctx.fillRect(x, 54, 8, 12);
    ctx.beginPath();
    ctx.arc(x + 4, 66, 4, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = INK;
  ctx.fillRect(0, 53, TEX_W, 2);
  // Shop window
  windowPane(ctx, 6, 76, 52, 42);
  if (kind === "wkc") {
    // A knife on display in the window
    ctx.fillStyle = "#eef3f5";
    ctx.beginPath();
    ctx.moveTo(14, 100);
    ctx.lineTo(42, 96);
    ctx.lineTo(44, 99);
    ctx.lineTo(16, 103);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(43, 95, 10, 5);
  }
}

function fence(ctx: Ctx, rnd: () => number): void {
  ctx.fillStyle = "#8a6a45";
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  for (let x = 0; x < TEX_W; x += 8) {
    const t = rnd();
    ctx.fillStyle = t < 0.3 ? "#b58a58" : t < 0.6 ? "#c49a66" : "#aa804f";
    ctx.fillRect(x + 1, 6, 6, TEX_H - 6);
    ctx.beginPath();
    ctx.moveTo(x + 1, 6);
    ctx.lineTo(x + 4, 1);
    ctx.lineTo(x + 7, 6);
    ctx.fill();
  }
  ctx.fillStyle = "#6d5034";
  ctx.fillRect(0, 34, TEX_W, 5);
  ctx.fillRect(0, 96, TEX_W, 5);
}

function garage(ctx: Ctx, base: string): void {
  siding(ctx, base);
  windowPane(ctx, 18, 22, 28, 22);
  ctx.fillStyle = INK;
  ctx.fillRect(4, 56, 56, 66);
  ctx.fillStyle = "#e9e4d8";
  ctx.fillRect(6, 58, 52, 64);
  ctx.fillStyle = "rgba(31,38,32,0.25)";
  for (let y = 66; y < 122; y += 10) ctx.fillRect(6, y, 52, 2);
}

function door(ctx: Ctx, base: string, paint: string): void {
  siding(ctx, base);
  windowPane(ctx, 20, 20, 24, 18);
  ctx.fillStyle = INK;
  ctx.fillRect(16, 50, 32, 74);
  ctx.fillStyle = paint;
  ctx.fillRect(18, 52, 28, 72);
  ctx.strokeStyle = "rgba(31,38,32,0.35)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(22, 58, 20, 24);
  ctx.strokeRect(22, 88, 20, 28);
  ctx.fillStyle = "#f2c94c";
  ctx.beginPath();
  ctx.arc(41, 90, 2.2, 0, Math.PI * 2);
  ctx.fill();
  // Porch light
  ctx.fillStyle = "#fff3c4";
  ctx.fillRect(52, 58, 6, 8);
  ctx.strokeStyle = INK;
  ctx.strokeRect(52, 58, 6, 8);
}

/* ---------- Floors (64 x 64: one tile) ---------- */

function asphalt(ctx: Ctx, rnd: () => number): void {
  ctx.fillStyle = "#62676a";
  ctx.fillRect(0, 0, FLOOR_TEX, FLOOR_TEX);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.1)";
    ctx.fillRect((rnd() * FLOOR_TEX) | 0, (rnd() * FLOOR_TEX) | 0, 1, 1);
  }
}

function sidewalk(ctx: Ctx, rnd: () => number): void {
  ctx.fillStyle = "#d9d1c1";
  ctx.fillRect(0, 0, FLOOR_TEX, FLOOR_TEX);
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect((rnd() * FLOOR_TEX) | 0, (rnd() * FLOOR_TEX) | 0, 2, 2);
  }
  ctx.fillStyle = "rgba(31,38,32,0.28)";
  ctx.fillRect(0, 0, FLOOR_TEX, 1);
  ctx.fillRect(0, 0, 1, FLOOR_TEX);
  ctx.fillRect(0, 32, FLOOR_TEX, 1);
  ctx.fillRect(32, 0, 1, FLOOR_TEX);
}

function cobble(ctx: Ctx, rnd: () => number): void {
  ctx.fillStyle = "#6f6659";
  ctx.fillRect(0, 0, FLOOR_TEX, FLOOR_TEX);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 10; col++) {
      const t = rnd();
      ctx.fillStyle = t < 0.33 ? "#a39684" : t < 0.66 ? "#958877" : "#b0a390";
      const x = col * 7 + (row % 2 ? 3.5 : 0) - 2;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, row * 4 + 0.5, 6, 3, 1.5);
      ctx.fill();
    }
  }
}

function porch(ctx: Ctx): void {
  ctx.fillStyle = "#b48a5a";
  ctx.fillRect(0, 0, FLOOR_TEX, FLOOR_TEX);
  ctx.fillStyle = "rgba(31,38,32,0.3)";
  for (let y = 0; y < FLOOR_TEX; y += 8) ctx.fillRect(0, y, FLOOR_TEX, 1);
}

/* ---------- Building both palettes ---------- */

function paintWall(id: number): Uint32Array {
  const [, ctx] = canvas(TEX_W, TEX_H);
  const rnd = noise(id * 977 + 13);
  switch (id) {
    case WALL.sage:
      house(ctx, "#b9cfa4");
      break;
    case WALL.butter:
      house(ctx, "#f1d98d");
      break;
    case WALL.sky:
      house(ctx, "#b9d8e3");
      break;
    case WALL.coral:
      house(ctx, "#f0b49c");
      break;
    case WALL.lilac:
      house(ctx, "#d6c6e0");
      break;
    case WALL.bakery:
      shop(ctx, rnd, "bakery");
      break;
    case WALL.market:
      shop(ctx, rnd, "market");
      break;
    case WALL.wkc:
      shop(ctx, rnd, "wkc");
      break;
    case WALL.fence:
      fence(ctx, rnd);
      break;
    case WALL.garage:
      garage(ctx, "#e7c6a5");
      break;
    case WALL.door:
      door(ctx, ["#b9cfa4", "#f1d98d", "#b9d8e3"][id % 3]!, "#24604b");
      break;
    default:
      brick(ctx, rnd);
  }
  return pixels(ctx, TEX_W, TEX_H);
}

function paintFloor(id: number): Uint32Array {
  const [, ctx] = canvas(FLOOR_TEX, FLOOR_TEX);
  const rnd = noise(id * 331 + 7);
  switch (id) {
    case FLOOR.lineX:
      asphalt(ctx, rnd);
      ctx.fillStyle = "#f2c94c";
      ctx.fillRect(4, 30, 28, 4);
      break;
    case FLOOR.lineY:
      asphalt(ctx, rnd);
      ctx.fillStyle = "#f2c94c";
      ctx.fillRect(30, 4, 4, 28);
      break;
    case FLOOR.sidewalk:
      sidewalk(ctx, rnd);
      break;
    case FLOOR.cobble:
      cobble(ctx, rnd);
      break;
    case FLOOR.porch:
      porch(ctx);
      break;
    default:
      asphalt(ctx, rnd);
  }
  return pixels(ctx, FLOOR_TEX, FLOOR_TEX);
}

/** Washed out and a little cool: the town before the edge returns. */
function dullCopy(src: Uint32Array): Uint32Array {
  const out = new Uint32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    const r = c & 255;
    const g = (c >>> 8) & 255;
    const b = (c >>> 16) & 255;
    const grey = (r * 3 + g * 4 + b) >> 3;
    const k = 0.5; // keep half the colour
    const nr = Math.min(255, (grey + (r - grey) * k) * 0.9);
    const ng = Math.min(255, (grey + (g - grey) * k) * 0.92);
    const nb = Math.min(255, (grey + (b - grey) * k) * 0.97);
    out[i] = (0xff << 24) | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
  }
  return out;
}

export function makeTextures(): Textures {
  const walls: Uint32Array[] = [];
  const floors: Uint32Array[] = [];
  for (let i = 0; i < WALL_KINDS; i++) walls.push(paintWall(i));
  for (let i = 0; i < FLOOR_KINDS; i++) floors.push(paintFloor(i));
  return {
    bright: { walls, floors },
    dull: { walls: walls.map(dullCopy), floors: floors.map(dullCopy) },
  };
}
