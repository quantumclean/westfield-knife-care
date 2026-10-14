/**
 * Screen-space effects: cut halves, juice, sparks, squashes and text pops.
 * Halves use the hero toy's approach (a face clipped to one side of the cut
 * line, flung along the cut normal) in CSS pixels with simple gravity.
 */
import { INK } from "../../../src/art/fruit.ts";
import { cutNormal } from "../../../src/toy/geometry.ts";
import { COPY } from "../copy.ts";
import type { IngredientId } from "../levels.ts";
import type { GameEvent } from "../sim/world.ts";
import { drawSprite, type Sprites } from "./sprites.ts";

interface Half {
  kind: IngredientId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  cut: number;
  side: 1 | -1;
  r: number;
  age: number;
  life: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  kind: "drop" | "spark" | "star";
  gravity: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  age: number;
  life: number;
}

interface Mush {
  kind: IngredientId;
  x: number;
  y: number;
  r: number;
  age: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
  life: number;
  color: string;
}

const MAX_PARTICLES = 120;
const MAX_HALVES = 32;

const pickFrom = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)]!;

export class Fx {
  halves: Half[] = [];
  particles: Particle[] = [];
  pops: Pop[] = [];
  mush: Mush[] = [];
  rings: Ring[] = [];
  shake = 0;
  /** 0..1 knife swing, set on every cut attempt. */
  swing = 0;
  recoil = 0;
  reducedMotion = false;
  /** CSS px per scene unit, so effects scale with the screen. */
  unit = 1;

  constructor(private sprites: Sprites) {}

  clear(): void {
    this.halves.length = 0;
    this.particles.length = 0;
    this.pops.length = 0;
    this.mush.length = 0;
    this.rings.length = 0;
    this.shake = 0;
  }

  /** Turns simulation events into effects. Sound is handled by the engine. */
  onEvent(e: GameEvent, juice: (kind: IngredientId) => string): void {
    const u = this.unit;
    const still = this.reducedMotion;
    switch (e.type) {
      case "cut": {
        this.swing = 1;
        if (e.outcome === "split") {
          const sep = (e.weak ? 50 : e.power ? 420 : 250) * u * (still ? 0.25 : 1);
          const n = cutNormal(e.angle);
          const cut = (e.angle * Math.PI) / 180;
          for (const side of [1, -1] as const) {
            this.addHalf({
              kind: e.kind,
              x: e.x + n.x * side * 2,
              y: e.y + n.y * side * 2,
              vx: n.x * side * sep + (still ? 0 : e.dx * 90 * u),
              vy: n.y * side * sep - (still ? 0 : (e.weak ? 60 : 160) * u),
              rot: 0,
              vrot: still ? 0 : side * (e.weak ? 1 : e.power ? 7 : 4) * (0.7 + Math.random() * 0.6),
              cut,
              side,
              r: e.r,
              age: 0,
              life: still ? 0.9 : 1.6,
            });
          }
          this.burst(e.x, e.y, juice(e.kind), e.weak ? 5 : e.power ? 22 : 14, e.r, "drop");
          if (e.power) {
            this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.power), "#fff7cf", 26);
            this.ring(e.x, e.y, e.r * 1.6, "#fff7cf");
            if (!still) this.shake = Math.max(this.shake, 6);
          } else if (e.points) {
            this.pop(e.x, e.y - e.r * 0.6, `+${e.points}`, e.weak ? "#efe6d0" : "#fff", 20);
          }
        } else if (e.outcome === "squash") {
          this.mush.push({ kind: e.kind, x: e.x, y: e.y, r: e.r, age: 0 });
          this.burst(e.x, e.y, juice(e.kind), 18, e.r * 0.7, "drop");
          this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.squash), "#ffd2c4", 24);
          if (!still) this.shake = Math.max(this.shake, 4);
        } else if (e.outcome === "notch") {
          this.burst(e.x, e.y, juice(e.kind), 5, e.r * 0.5, "drop");
          this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.notch), "#fff1c2", 18);
        } else if (e.outcome === "bounce") {
          this.recoil = 1;
          this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.bounce), "#ffe0a8", 26);
          this.ring(e.x, e.y, e.r * 1.2, "#e7c18a");
          if (!still) this.shake = Math.max(this.shake, 5);
        } else if (e.outcome === "skid") {
          this.recoil = 1;
          this.burst(e.x, e.y, "#d9dde0", 6, e.r * 0.4, "spark");
          this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.skid), "#e8e3d8", 22);
        }
        break;
      }
      case "clang":
        this.swing = 1;
        this.recoil = 1;
        this.burst(e.x, e.y, "#fff2b8", 16, e.r * 0.5, "spark");
        this.ring(e.x, e.y, e.r * 1.8, "#ffffff");
        this.pop(e.x, e.y - e.r, pickFrom(COPY.pops.clang), "#ffd2c4", 28);
        if (!still) this.shake = Math.max(this.shake, 9);
        break;
      case "glint":
        this.burst(e.x, e.y, "#fff3b0", 14, e.r * 0.4, "star");
        this.ring(e.x, e.y, e.r * 2.2, "#fff3b0");
        this.pop(e.x, e.y - e.r, COPY.pops.glint[0], "#fff3b0", 22);
        break;
      case "combo":
        this.pop(e.x, e.y - 40 * u, `${COPY.combo(e.n)}  +${e.bonus}`, "#f2c94c", 30 + e.n * 2);
        this.ring(e.x, e.y, 70 * u, "#f2c94c");
        break;
      default:
        break;
    }
  }

  private addHalf(h: Half): void {
    if (this.halves.length >= MAX_HALVES) this.halves.shift();
    this.halves.push(h);
  }

  burst(
    x: number,
    y: number,
    color: string,
    n: number,
    spread: number,
    kind: Particle["kind"],
  ): void {
    const u = this.unit;
    const still = this.reducedMotion;
    const count = still ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (still ? 20 : 120 + Math.random() * 260) * u;
      this.particles.push({
        x: x + Math.cos(a) * spread * 0.3,
        y: y + Math.sin(a) * spread * 0.3,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (still ? 0 : 120 * u),
        age: 0,
        life: kind === "spark" ? 0.35 + Math.random() * 0.25 : 0.6 + Math.random() * 0.5,
        size:
          (kind === "drop" ? 3 + Math.random() * 4 : 2 + Math.random() * 2.5) * Math.max(0.8, u),
        color,
        kind,
        gravity: kind === "star" || still ? 0 : 1600 * u,
      });
    }
  }

  /** Sparks along a line, for the sharpening bench. */
  sparks(x0: number, y0: number, x1: number, y1: number, n: number, color = "#ffe9a8"): void {
    const u = this.unit;
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const t = Math.random();
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = (this.reducedMotion ? 40 : 200 + Math.random() * 380) * u;
      this.particles.push({
        x: x0 + (x1 - x0) * t,
        y: y0 + (y1 - y0) * t,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        age: 0,
        life: 0.3 + Math.random() * 0.4,
        size: (1.5 + Math.random() * 2) * Math.max(0.8, u),
        color,
        kind: "spark",
        gravity: this.reducedMotion ? 0 : 1400 * u,
      });
    }
  }

  pop(x: number, y: number, text: string, color: string, size: number): void {
    if (this.pops.length > 8) this.pops.shift();
    this.pops.push({
      x,
      y,
      text,
      color,
      size: size * Math.max(0.85, Math.min(1.3, this.unit)),
      age: 0,
      life: 0.9,
    });
  }

  ring(x: number, y: number, r: number, color: string): void {
    if (this.rings.length > 6) this.rings.shift();
    this.rings.push({ x, y, r, age: 0, life: 0.35, color });
  }

  update(dt: number): void {
    const g = 1600 * this.unit;
    for (let i = this.halves.length - 1; i >= 0; i--) {
      const h = this.halves[i]!;
      h.age += dt;
      if (h.age >= h.life) {
        this.halves.splice(i, 1);
        continue;
      }
      if (!this.reducedMotion) h.vy += g * dt;
      else {
        h.vx *= Math.pow(0.05, dt);
        h.vy *= Math.pow(0.05, dt);
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vrot * dt;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(0.4, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      p.age += dt;
      if (!this.reducedMotion) p.y -= 40 * this.unit * dt;
      if (p.age >= p.life) this.pops.splice(i, 1);
    }
    for (let i = this.mush.length - 1; i >= 0; i--) {
      const m = this.mush[i]!;
      m.age += dt;
      if (m.age >= 1.1) this.mush.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!;
      r.age += dt;
      if (r.age >= r.life) this.rings.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 40);
    this.swing = Math.max(0, this.swing - dt * 5);
    this.recoil = Math.max(0, this.recoil - dt * 2.5);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const m of this.mush) {
      const t = m.age / 1.1;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(m.x, m.y + m.r * 0.3 * Math.min(1, t * 4));
      ctx.scale(1 + 0.45 * Math.min(1, t * 5), 1 - 0.5 * Math.min(1, t * 5));
      drawSprite(ctx, this.sprites[m.kind], "whole", m.r);
      ctx.restore();
    }
    for (const h of this.halves) {
      const s = h.r * 2.2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (h.life - h.age) / 0.35);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.rot + h.cut);
      ctx.beginPath();
      if (h.side === 1) ctx.rect(-s, 0, s * 2, s);
      else ctx.rect(-s, -s, s * 2, s);
      ctx.clip();
      ctx.rotate(-h.cut);
      drawSprite(ctx, this.sprites[h.kind], "face", h.r);
      ctx.restore();
    }
    for (const p of this.particles) {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.kind === "star") {
        star(ctx, p.x, p.y, p.size * 2.2);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = 0.8 * (1 - t);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.6 + 0.6 * t), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of this.pops) {
      const t = p.age / p.life;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const grow = this.reducedMotion ? 1 : 0.8 + 0.2 * Math.min(1, t * 6);
      ctx.font = `700 ${Math.round(p.size * grow)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + r * 0.15, y - r * 0.15, x + r, y);
  ctx.quadraticCurveTo(x + r * 0.15, y + r * 0.15, x, y + r);
  ctx.quadraticCurveTo(x - r * 0.15, y + r * 0.15, x - r, y);
  ctx.quadraticCurveTo(x - r * 0.15, y - r * 0.15, x, y - r);
  ctx.fill();
}
