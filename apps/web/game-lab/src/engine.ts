/**
 * The game loop: one requestAnimationFrame loop that steps the simulation,
 * drains its events into effects, sound and the HUD, and draws the frame.
 * It stops while paused, while the page is hidden and on the title screen.
 */
import { trailPath, type Pt } from "../../src/toy/geometry.ts";
import type { Sfx } from "./audio.ts";
import { PointerInput, TRAIL_LIFE } from "./input.ts";
import { INGREDIENTS, type IngredientId } from "./levels.ts";
import { Fx } from "./render/fx.ts";
import {
  benchEdgePoint,
  drawBench,
  drawKitchen,
  drawKnife,
  drawShadow,
  drawStreet,
} from "./render/scene.ts";
import { drawSprite, type Sprites } from "./render/sprites.ts";
import type { Band } from "./sim/edge.ts";
import { makeCamera, type Camera, type Projected } from "./sim/projection.ts";
import {
  advance,
  alphaOf,
  createWorld,
  endStroke,
  itemScreen,
  laneCut,
  sharpenStroke,
  slice,
  startLevel1,
  step,
  sweepCut,
  tapCut,
  targets,
  type Action,
  type GameEvent,
  type Phase,
  type World,
  type WorldConfig,
} from "./sim/world.ts";

export interface EngineCallbacks {
  onPhase(phase: Phase): void;
  /** Every frame, for the HUD (which writes to the DOM directly, not via Preact). */
  onFrame(world: World): void;
  onEvent(e: GameEvent): void;
}

export interface EngineOptions {
  /** Time multiplier for playtesting and tests (?speed=4). */
  speed: number;
}

const TRAIL_STYLE: Record<Band, { width: number; color: string; glow: string }> = {
  keen: { width: 12, color: "rgba(255,255,255,0.95)", glow: "rgba(170,230,255,0.9)" },
  worn: { width: 12, color: "rgba(236,234,226,0.85)", glow: "rgba(0,0,0,0)" },
  dull: { width: 18, color: "rgba(150,138,120,0.6)", glow: "rgba(0,0,0,0)" },
  gone: { width: 22, color: "rgba(120,110,98,0.45)", glow: "rgba(0,0,0,0)" },
};

const tmp: Projected = { x: 0, y: 0, s: 0 };

export class Engine {
  world: World;
  cam: Camera;
  fx: Fx;
  input: PointerInput;
  paused = false;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private glow = 0;
  private sharpenDir = 0;
  private sharpenTravel = 0;
  private sharpenCounted = false;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private sprites: Sprites,
    private sfx: Sfx,
    cfg: WorldConfig,
    private cb: EngineCallbacks,
    private opts: EngineOptions,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
    this.world = createWorld(cfg);
    this.cam = makeCamera(1, 1);
    this.fx = new Fx(sprites);
    this.fx.reducedMotion = cfg.reducedMotion;
    this.input = new PointerInput(canvas, {
      segment: (a, b, dt) => this.onSegment(a, b, dt),
      end: () => endStroke(this.world),
      tap: (x, y) => {
        if (tapCut(this.world, this.cam, x, y)) this.drain();
      },
    });
    this.resize();
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
    this.render(performance.now());
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
  }

  private onResize = () => this.resize();

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    // Backing store at up to 2x, capped near 2.5 megapixels.
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 2.5e6) dpr = Math.sqrt(2.5e6 / (w * h));
    this.dpr = dpr;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.cam = makeCamera(w, h);
    this.fx.unit = this.cam.unit;
    if (!this.raf) this.render(performance.now());
  }

  /* ---------- Control ---------- */

  private running(): boolean {
    return !this.paused && !this.destroyed && this.world.phase !== "ready";
  }

  private kick(): void {
    if (this.raf || !this.running()) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      endStroke(this.world);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.sfx.suspend();
      this.render(performance.now());
    } else {
      this.sfx.resume();
      this.kick();
    }
  }

  setReducedMotion(still: boolean): void {
    this.world.cfg.reducedMotion = still;
    this.fx.reducedMotion = still;
    if (!this.raf) this.render(performance.now());
  }

  setLengths(l1: number, l2: number): void {
    this.world.cfg.l1Seconds = l1;
    this.world.cfg.l2Seconds = l2;
  }

  /** Start (or restart) from Level 1. */
  start(): void {
    this.fx.clear();
    startLevel1(this.world);
    this.drain();
    this.kick();
  }

  action(a: Action): void {
    advance(this.world, a);
    this.drain();
    this.kick();
  }

  /** Back to the title screen. */
  quit(): void {
    this.world.phase = "ready";
    this.world.items = [];
    this.fx.clear();
    this.cb.onPhase("ready");
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.render(performance.now());
  }

  sharpen(): void {
    sharpenStroke(this.world);
    this.drain();
  }

  lane(lane: 0 | 1 | 2): void {
    if (this.world.phase === "sharpen") return this.sharpen();
    if (laneCut(this.world, this.cam, lane)) this.drain();
  }

  sweep(): void {
    if (this.world.phase === "sharpen") return this.sharpen();
    if (sweepCut(this.world, this.cam)) this.drain();
  }

  /** Read-only view for tests (?test). */
  debug() {
    return {
      phase: this.world.phase,
      edge: this.world.edge,
      band: this.world.band,
      score: this.world.score,
      cuts: this.world.cuts,
      items: this.world.items.length,
      targets: targets(this.world, this.cam),
    };
  }

  /* ---------- Input ---------- */

  private onSegment(a: Pt, b: Pt, dtMs: number): void {
    const w = this.world;
    if (this.paused) return;
    if (w.phase === "sharpen") {
      const dx = b.x - a.x;
      const dir = Math.sign(dx);
      if (!dir) return;
      if (dir !== this.sharpenDir) {
        this.sharpenDir = dir;
        this.sharpenTravel = 0;
        this.sharpenCounted = false;
      }
      this.sharpenTravel += Math.abs(dx);
      if (!this.sharpenCounted && this.sharpenTravel >= Math.max(50, this.cam.w * 0.16)) {
        this.sharpenCounted = true;
        this.sharpen();
      }
      return;
    }
    const before = w.stroke.id;
    const wasOpen = w.stroke.open;
    slice(w, this.cam, a, b, dtMs);
    if (w.stroke.open && (!wasOpen || w.stroke.id !== before)) {
      const speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(dtMs, 1) / this.cam.unit;
      this.sfx.play("swish", speed);
    }
    if (w.events.length) this.drain();
  }

  /* ---------- Loop ---------- */

  private frame = (now: number): void => {
    this.raf = 0;
    if (!this.running()) return;
    const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    let remaining = real * this.opts.speed;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 64) {
      const dt = Math.min(remaining, 1 / 60);
      step(this.world, dt, this.cam);
      remaining -= dt;
      if (this.world.events.length) this.drain();
    }
    this.fx.update(real * (this.world.slowmo > 0 ? 0.5 : 1));
    this.render(now);
    this.cb.onFrame(this.world);
    if (this.running()) this.raf = requestAnimationFrame(this.frame);
  };

  private drain(): void {
    const w = this.world;
    const events = w.events.splice(0);
    for (const e of events) {
      this.fx.onEvent(e, juiceOf(this.sprites));
      this.sound(e);
      if (e.type === "sharpen") {
        for (let i = 0; i < 3; i++) {
          const p = benchEdgePoint(this.cam, Math.random());
          this.fx.sparks(p.x - 30, p.y, p.x + 30, p.y, 8);
        }
      } else if (e.type === "restored") {
        for (let i = 0; i < 8; i++) {
          const p = benchEdgePoint(this.cam, i / 7);
          this.fx.burst(p.x, p.y, "#fff3b0", 6, 10, "star");
        }
      }
      if (e.type === "phase") {
        if (e.phase === "pickup" || e.phase === "level2" || e.phase === "level1") this.fx.clear();
        this.sharpenDir = 0;
        this.sharpenTravel = 0;
        this.cb.onPhase(e.phase);
      }
      this.cb.onEvent(e);
    }
    if (!this.raf) this.cb.onFrame(w);
  }

  private sound(e: GameEvent): void {
    const s = this.sfx;
    switch (e.type) {
      case "cut":
        if (e.outcome === "split") {
          if (e.weak) s.play("notch");
          else s.play("cut", Math.max(0, this.world.stroke.cuts - 1) + (e.power ? 3 : 0));
          if (INGREDIENTS[e.kind].tough === "soft") s.play("wet");
          try {
            navigator.vibrate?.(8);
          } catch {
            /* ignore */
          }
        } else if (e.outcome === "squash") {
          s.play("wet");
          s.play("thud");
        } else if (e.outcome === "notch") s.play("notch");
        else if (e.outcome === "bounce") s.play("thud");
        else if (e.outcome === "skid") s.play("skid");
        break;
      case "clang":
        s.play("clang");
        break;
      case "glint":
        s.play("glint");
        break;
      case "combo":
        s.play("combo", e.n);
        break;
      case "warn":
        s.play("warn");
        break;
      case "sharpen":
        s.play("sharpen", e.stroke);
        break;
      case "restored":
        s.play("restored");
        break;
      case "phase":
        if (e.phase === "level1") s.play("start1");
        else if (e.phase === "level2") s.play("start2");
        else if (e.phase === "edgeGone") s.play("gone");
        else if (e.phase === "results") s.play("results");
        break;
      default:
        break;
    }
  }

  /* ---------- Drawing ---------- */

  private render(now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    const cam = this.cam;
    const still = w.cfg.reducedMotion;
    const t = now / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bright = w.level === 2 || w.phase === "return";
    this.glow += ((bright ? 1 : 0) - this.glow) * (still ? 1 : 0.08);
    if (this.fx.shake > 0 && !still) {
      ctx.translate((Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake);
    }
    switch (w.phase) {
      case "pickup":
      case "return":
        drawStreet(ctx, cam, w.scroll, w.phaseT, w.phase, still);
        break;
      case "sharpen":
        drawBench(ctx, cam, w.edge, t, w.restoredAt >= 0 ? w.phaseT - w.restoredAt : -1, still);
        break;
      default:
        drawKitchen(ctx, cam, w.scroll, this.glow, t);
        this.drawItems(ctx);
        break;
    }
    this.fx.draw(ctx);
    this.drawTrails(ctx, now);
    if (w.phase !== "pickup" && w.phase !== "return" && w.phase !== "sharpen") {
      drawKnife(
        ctx,
        cam,
        w.phase === "ready" ? "keen" : w.band,
        this.fx.swing,
        this.fx.recoil,
        t,
        still,
      );
    }
  }

  private drawItems(ctx: CanvasRenderingContext2D): void {
    const w = this.world;
    const cam = this.cam;
    const items = [...w.items].sort((a, b) => b.z - a.z);
    for (const it of items) {
      const a = alphaOf(it);
      if (a <= 0) continue;
      const radius = INGREDIENTS[it.kind].radius;
      drawShadow(ctx, cam, it.u * cam.laneX, it.y, it.z, radius, a);
    }
    for (const it of items) {
      const a = alphaOf(it);
      if (a <= 0) continue;
      const p = itemScreen(cam, it, tmp);
      const r = INGREDIENTS[it.kind].radius * p.s;
      if (p.y - r > cam.h || p.y + r < 0) continue;
      const since = w.clock - it.hurtAt;
      const wob =
        since < 0.45 && !w.cfg.reducedMotion ? Math.sin(since * 40) * 0.25 * (1 - since / 0.45) : 0;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(it.spin + wob);
      drawSprite(ctx, this.sprites[it.kind], "whole", r);
      if (it.hits > 0) {
        ctx.strokeStyle = "rgba(31,38,32,0.8)";
        ctx.lineWidth = Math.max(1.5, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.05);
        ctx.lineTo(r * 0.6, r * 0.05);
        ctx.stroke();
      }
      if (it.bruises > 0) {
        ctx.fillStyle = "rgba(90,40,30,0.35)";
        for (let i = 0; i < Math.min(3, it.bruises); i++) {
          ctx.beginPath();
          ctx.arc(r * (0.3 - i * 0.3), r * (0.2 - i * 0.15), r * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  private drawTrails(ctx: CanvasRenderingContext2D, now: number): void {
    this.input.prune(now);
    const w = this.world;
    const style =
      w.phase === "sharpen"
        ? { width: 10, color: "rgba(255,233,168,0.9)", glow: "rgba(255,200,120,0.8)" }
        : TRAIL_STYLE[w.phase === "ready" ? "keen" : w.band];
    const width = style.width * Math.max(0.8, this.cam.unit);
    for (const pts of this.input.trails.values()) {
      const d = trailPath(pts, now, TRAIL_LIFE, width);
      if (!d) continue;
      const path = new Path2D(d);
      ctx.save();
      if (style.glow !== "rgba(0,0,0,0)" && !w.cfg.reducedMotion) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = style.color;
      ctx.fill(path);
      ctx.restore();
    }
  }
}

function juiceOf(sprites: Sprites): (kind: IngredientId) => string {
  return (kind) => sprites[kind].art.juice;
}
