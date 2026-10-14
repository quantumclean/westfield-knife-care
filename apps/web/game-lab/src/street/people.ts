/**
 * Westfield's neighbors: inked, friendly, drawn once into small canvases in a
 * handful of looks. Plus the speech bubbles, heart pips and the proposal ring
 * drawn on top of the world.
 */
import { INK } from "../../../src/art/fruit.ts";

/** Each look canvas is 128 x 256 and covers 0.5 x 1.0 world units, feet at the bottom. */
export const LOOK_W = 128;
export const LOOK_H = 256;
export const LOOK_WORLD_W = 0.5;
export const LOOK_WORLD_H = 1.0;

interface LookSpec {
  skin: string;
  hair: string;
  style: 0 | 1 | 2 | 3;
  shirt: string;
  legs: string;
  apron?: string;
}

const LOOKS: LookSpec[] = [
  { skin: "#f1c7a2", hair: "#5b3a24", style: 0, shirt: "#2f6f8f", legs: "#3d4a42" },
  {
    skin: "#c98d63",
    hair: "#1f2620",
    style: 1,
    shirt: "#b2432a",
    legs: "#283b32",
    apron: "#fff7e8",
  },
  { skin: "#8d5a3c", hair: "#1f2620", style: 2, shirt: "#f2c94c", legs: "#3d4a42" },
  { skin: "#f5d6b8", hair: "#c98a3a", style: 3, shirt: "#6f9a45", legs: "#536050" },
  {
    skin: "#e0b08a",
    hair: "#9a9a9a",
    style: 0,
    shirt: "#d6c6e0",
    legs: "#283b32",
    apron: "#24604b",
  },
  { skin: "#a9714b", hair: "#3b2618", style: 3, shirt: "#f0b49c", legs: "#3d4a42" },
];

function paintPerson(spec: LookSpec): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = LOOK_W;
  c.height = LOOK_H;
  const ctx = c.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  // Shadow
  ctx.fillStyle = "rgba(31,38,32,0.25)";
  ctx.beginPath();
  ctx.ellipse(64, 248, 40, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Legs and shoes
  ctx.fillStyle = spec.legs;
  for (const x of [46, 70]) {
    ctx.beginPath();
    ctx.roundRect(x, 168, 14, 72, 6);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(52, 244, 13, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(78, 244, 13, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Arms
  ctx.fillStyle = spec.shirt;
  ctx.beginPath();
  ctx.roundRect(20, 100, 16, 66, 8);
  ctx.roundRect(92, 100, 16, 66, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = spec.skin;
  ctx.beginPath();
  ctx.arc(28, 168, 8, 0, Math.PI * 2);
  ctx.arc(100, 168, 8, 0, Math.PI * 2);
  ctx.fill();
  // Torso
  ctx.fillStyle = spec.shirt;
  ctx.beginPath();
  ctx.roundRect(32, 94, 64, 84, 18);
  ctx.fill();
  ctx.stroke();
  if (spec.apron) {
    ctx.fillStyle = spec.apron;
    ctx.beginPath();
    ctx.roundRect(42, 112, 44, 64, 8);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 4;
  }
  // Head
  ctx.fillStyle = spec.skin;
  ctx.beginPath();
  ctx.arc(64, 58, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Hair
  ctx.fillStyle = spec.hair;
  ctx.beginPath();
  if (spec.style === 0) {
    ctx.arc(64, 54, 33, Math.PI * 1.02, Math.PI * 1.98);
    ctx.closePath();
  } else if (spec.style === 1) {
    ctx.arc(64, 52, 33, Math.PI, 0);
    ctx.closePath();
    ctx.moveTo(78, 22);
    ctx.arc(64, 18, 14, 0, Math.PI * 2);
  } else if (spec.style === 2) {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.moveTo(64 + Math.cos(a) * 26, 54 + Math.sin(a) * 26);
      ctx.lineTo(64 + Math.cos(a) * 40, 50 + Math.sin(a) * 40);
      ctx.lineTo(64 + Math.cos(a + 0.25) * 28, 54 + Math.sin(a + 0.25) * 28);
    }
  } else {
    ctx.arc(64, 54, 34, Math.PI, 0);
    ctx.lineTo(98, 100);
    ctx.lineTo(84, 100);
    ctx.lineTo(84, 60);
    ctx.lineTo(44, 60);
    ctx.lineTo(44, 100);
    ctx.lineTo(30, 100);
    ctx.closePath();
  }
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.stroke();
  // Face
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(52, 62, 4, 0, Math.PI * 2);
  ctx.arc(76, 62, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(226,72,45,0.35)";
  ctx.beginPath();
  ctx.arc(44, 74, 6, 0, Math.PI * 2);
  ctx.arc(84, 74, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(64, 72, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  return c;
}

export function makePeople(): HTMLCanvasElement[] {
  return LOOKS.map(paintPerson);
}

/** A small heart centred at (x, y). */
export function heart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string | null,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.2, r * 0.22);
  ctx.stroke();
}

/** A speech bubble whose tail points down at (x, y). Kept on screen. */
export function bubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  tone: "no" | "yes" | "ask",
  screenW: number,
  size: number,
): void {
  ctx.font = `700 ${Math.round(size)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  const padX = size * 0.7;
  const maxW = Math.min(screenW - 24, size * 16);
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW - padX * 2 && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  const lineH = size * 1.2;
  const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2);
  const h = lines.length * lineH + size * 0.8;
  const bx = Math.max(12, Math.min(screenW - 12 - w, x - w / 2));
  const by = y - h - size * 0.8;
  ctx.fillStyle = tone === "yes" ? "#fff3c4" : tone === "ask" ? "#e8f3ec" : "#fffaf0";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, size * 0.6);
  ctx.fill();
  ctx.stroke();
  const tx = Math.max(bx + size, Math.min(bx + w - size, x));
  ctx.beginPath();
  ctx.moveTo(tx - size * 0.45, by + h - 1);
  ctx.lineTo(x, y - 2);
  ctx.lineTo(tx + size * 0.45, by + h - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tone === "yes" ? "#b2432a" : INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + size * 0.4 + lineH * (i + 0.5)));
}

/** The proposal: a little ring box. */
export function ringBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  spin: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.fillStyle = "#b2432a";
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, r * 0.15);
  ctx.beginPath();
  ctx.roundRect(-r, -r * 0.2, r * 2, r * 1.1, r * 0.25);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#f2c94c";
  ctx.lineWidth = Math.max(2, r * 0.22);
  ctx.beginPath();
  ctx.arc(0, -r * 0.45, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e8f6ff";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.25);
  ctx.lineTo(r * 0.3, -r * 0.95);
  ctx.lineTo(0, -r * 0.7);
  ctx.lineTo(-r * 0.3, -r * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
