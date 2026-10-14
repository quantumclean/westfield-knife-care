/**
 * Rasterizes the inked SVG art once into bitmaps the canvas can draw cheaply.
 * Loaded through <img> with a data URL (createImageBitmap on SVG blobs is
 * unreliable in Safari). If an image fails, the renderer falls back to a
 * plain inked circle, so the game still plays.
 */
import { INK } from "../../../src/art/fruit.ts";
import { ART, type SpriteArt } from "../art/ingredients.ts";
import type { IngredientId } from "../levels.ts";

export interface Sprite {
  art: SpriteArt;
  whole: HTMLCanvasElement | null;
  face: HTMLCanvasElement | null;
}

export type Sprites = Record<IngredientId, Sprite>;

/** The art is drawn in a -100..100 box. */
const VIEW = 200;

async function rasterize(markup: string, px: number): Promise<HTMLCanvasElement | null> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200" width="${px}" height="${px}">${markup}</svg>`;
  const img = new Image();
  img.decoding = "async";
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    if (typeof img.decode === "function") await img.decode();
    else
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("sprite failed"));
      });
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    canvas.getContext("2d")?.drawImage(img, 0, 0, px, px);
    return canvas;
  } catch {
    return null;
  }
}

export async function loadSprites(px = 256): Promise<Sprites> {
  const ids = Object.keys(ART) as IngredientId[];
  const entries = await Promise.all(
    ids.map(async (id) => {
      const art = ART[id];
      const [whole, face] = await Promise.all([
        rasterize(art.whole, px),
        art.face ? rasterize(art.face, px) : Promise.resolve(null),
      ]);
      return [id, { art, whole, face }] as const;
    }),
  );
  return Object.fromEntries(entries) as Sprites;
}

/** Draws a sprite centred at (0, 0) of the current transform, `r` CSS px in radius. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  which: "whole" | "face",
  r: number,
): void {
  const img = which === "face" ? (sprite.face ?? sprite.whole) : sprite.whole;
  const k = r / sprite.art.r;
  if (img) {
    const size = VIEW * k;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    return;
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = sprite.art.juice;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, 2.6 * k);
  ctx.strokeStyle = INK;
  ctx.stroke();
}
