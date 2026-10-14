/**
 * Street mode's game loop: the raycast town, thrown fruit and neighbors on
 * top, then the shared effects, trail and knife. The pickup, sharpening and
 * return beats reuse the counter's scenes. The loop stops while paused,
 * hidden or on the title screen.
 */
import { trailPath, type Pt } from "../../../src/toy/geometry.ts";
import type { Sfx } from "../audio.ts";
import { COPY } from "../copy.ts";
import type { EngineCallbacks, EngineOptions, GameEngine } from "../engine-api.ts";
import { PointerInput, TRAIL_LIFE } from "../input.ts";
import { INGREDIENTS, STREET, type IngredientId, type KnifeId } from "../levels.ts";
import { Fx } from "../render/fx.ts";
import { benchEdgePoint, drawBench, drawKnife, drawStreet } from "../render/scene.ts";
import { drawSprite, type Sprites } from "../render/sprites.ts";
import type { Band } from "../sim/edge.ts";
import { makeCamera, type Camera } from "../sim/projection.ts";
import {
  alphaOf,
  endStroke,
  sharpenStroke,
  type Action,
  type GameEvent,
  type WorldConfig,
} from "../sim/world.ts";
import { makeCam3, project3, type Cam3, type Projected3 } from "./camera.ts";
import { bubble, heart, LOOK_WORLD_H, LOOK_WORLD_W, makePeople, ringBox } from "./people.ts";
import { drawDepthClipped, makeRayView, renderStreet, type Look, type RayView } from "./raycast.ts";
import { makeTextures, type Textures } from "./textures.ts";
import {
  advanceStreet,
  createStreetWorld,
  customerBox,
  laneStreet,
  proposeNearest,
  radiusOf,
  sliceStreet,
  startStreet1,
  stepStreet,
  streetTargets,
  sweepStreet,
  tapStreet,
  type Customer,
  type StreetWorld,
} from "./world.ts";

const TRAIL_STYLE: Record<Band, { width: number; color: string; glow: string | null }> = {
  keen: { width: 12, color: "rgba(255,255,255,0.95)", glow: "rgba(170,230,255,0.9)" },
  worn: { width: 12, color: "rgba(236,234,226,0.85)", glow: null },
  dull: { width: 18, color: "rgba(150,138,120,0.6)", glow: null },
  gone: { width: 22, color: "rgba(120,110,98,0.45)", glow: null },
};

const tmp: Projected3 = { x: 0, y: 0, s: 0, d: 0 };

interface Flying {
  id: number;
  t0: number;
  x0: number;
  y0: number;
}

export class StreetEngine implements GameEngine {
  world: StreetWorld;
  fx: Fx;
  input: PointerInput;
  paused = false;
  private cam: Cam3;
  private flat: Camera;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private cssW = 1;
  private cssH = 1;
  private view: RayView | null = null;
  /** CSS px per raycast buffer pixel; raised when frames run slow. */
  private scale = 2;
  private slowFor = 0;
  private fastFor = 0;
  private frameMs = 16;
  private textures: Textures;
  private people: HTMLCanvasElement[];
  private rings: Flying[] = [];
  private hearts: Flying[] = [];
  private fade = 0;
  private lastS = 0;
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
    this.textures = makeTextures();
    this.people = makePeople();
    this.world = createStreetWorld(cfg);
    this.cam = makeCam3(1, 1, this.world.pose);
    this.flat = makeCamera(1, 1);
    this.fx = new Fx(sprites);
    this.fx.reducedMotion = cfg.reducedMotion;
    this.input = new PointerInput(canvas, {
      segment: (a, b, dt) => this.onSegment(a, b, dt),
      end: () => endStroke(this.world),
      tap: (x, y) => {
        if (tapStreet(this.world, this.cam, x, y)) this.drain();
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
    // The town is drawn at low resolution anyway, so a 1.5x backing store is
    // plenty and keeps fill cost down on phones (about 0.75 MP on an iPhone).
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (w * h * dpr * dpr > 1.2e6) dpr = Math.sqrt(1.2e6 / (w * h));
    this.dpr = dpr;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.cssW = w;
    this.cssH = h;
    this.flat = makeCamera(w, h);
    this.fx.unit = this.flat.unit;
    this.makeView();
    this.updateCam();
    if (!this.raf) this.render(performance.now());
  }

  private makeView(): void {
    const bw = Math.max(140, Math.min(420, Math.round(this.cssW / this.scale)));
    const bh = Math.max(1, Math.round((this.cssH * bw) / this.cssW));
    if (!this.view || this.view.bw !== bw || this.view.bh !== bh) this.view = makeRayView(bw, bh);
  }

  private updateCam(): void {
    const w = this.world;
    const walking = (w.phase === "level1" || w.phase === "level2") && !w.cfg.reducedMotion;
    const bob = walking ? Math.sin((w.s * Math.PI * 2) / 1.1) * this.cssH * 0.004 : 0;
    this.cam = makeCam3(this.cssW, this.cssH, w.pose, bob);
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

  configure(options: { knife: KnifeId; hardcore: boolean }): void {
    this.world.cfg.knife = options.knife;
    this.world.cfg.hardcore = options.hardcore;
  }

  start(): void {
    this.fx.clear();
    this.rings = [];
    this.hearts = [];
    startStreet1(this.world);
    this.lastS = this.world.s;
    this.drain();
    this.kick();
  }

  action(a: Action): void {
    advanceStreet(this.world, a);
    this.lastS = this.world.s;
    this.drain();
    this.kick();
  }

  quit(): void {
    this.world.phase = "ready";
    this.world.fruit = [];
    this.world.customers = [];
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
    if (laneStreet(this.world, this.cam, lane)) this.drain();
  }

  sweep(): void {
    if (this.world.phase === "sharpen") return this.sharpen();
    if (sweepStreet(this.world, this.cam)) this.drain();
  }

  propose(): void {
    if (proposeNearest(this.world, this.cam)) this.drain();
  }

  debug() {
    const w = this.world;
    return {
      phase: w.phase,
      edge: w.edge,
      band: w.band,
      score: w.score,
      cuts: w.cuts,
      items: w.fruit.length,
      proposals: w.proposals,
      yeses: w.yeses,
      walked: w.s,
      renderMs: Math.round(this.frameMs * 10) / 10,
      rayScale: this.scale,
      rayBuffer: this.view ? `${this.view.bw}x${this.view.bh}` : "",
      targets: streetTargets(w, this.cam),
      customers: w.customers
        .map((c) => ({ c, box: customerBox(this.cam, c) }))
        .filter((e) => e.box)
        .map(({ c, box }) => ({
          id: c.id,
          x: box!.x,
          y: (box!.top + box!.bottom) / 2,
          need: c.need,
          dates: c.dates,
          won: c.won,
          reply: c.reply?.shown ? (c.reply.yes ? "yes" : "no") : null,
        })),
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
      if (!this.sharpenCounted && this.sharpenTravel >= Math.max(50, this.cssW * 0.16)) {
        this.sharpenCounted = true;
        this.sharpen();
      }
      return;
    }
    const before = w.stroke.id;
    const wasOpen = w.stroke.open;
    sliceStreet(w, this.cam, a, b, dtMs);
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
      stepStreet(this.world, dt, { w: this.cssW, h: this.cssH });
      remaining -= dt;
      if (this.world.events.length) this.drain();
    }
    // Reduced motion: the view cuts forward instead of walking; soften the cut.
    if (Math.abs(this.world.s - this.lastS) > 1) this.fade = 1;
    this.lastS = this.world.s;
    this.fade = Math.max(0, this.fade - real * 3);
    this.fx.update(real * (this.world.slowmo > 0 ? 0.5 : 1));
    const t0 = performance.now();
    this.render(now);
    this.adapt(performance.now() - t0, real);
    this.cb.onFrame(this.world);
    if (this.running()) this.raf = requestAnimationFrame(this.frame);
  };

  /** Lowers the raycast resolution when frames take too long, and raises it back when they don't. */
  private adapt(ms: number, dt: number): void {
    this.frameMs = this.frameMs * 0.9 + ms * 0.1;
    if (this.frameMs > 14) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.frameMs < 6) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    if (this.slowFor > 1.5 && this.scale < 3.6) {
      this.scale += 0.4;
      this.slowFor = 0;
      this.makeView();
    } else if (this.fastFor > 4 && this.scale > 1.8) {
      this.scale -= 0.2;
      this.fastFor = 0;
      this.makeView();
    }
  }

  private drain(): void {
    const w = this.world;
    const events = w.events.splice(0);
    for (const e of events) {
      this.fx.onEvent(e, (kind: IngredientId) => this.sprites[kind].art.juice);
      this.sound(e);
      if (e.type === "sharpen") {
        for (let i = 0; i < 3; i++) {
          const p = benchEdgePoint(this.flat, Math.random());
          this.fx.sparks(p.x - 30, p.y, p.x + 30, p.y, 8);
        }
      } else if (e.type === "restored") {
        for (let i = 0; i < 8; i++) {
          const p = benchEdgePoint(this.flat, i / 7);
          this.fx.burst(p.x, p.y, "#fff3b0", 6, 10, "star");
        }
      } else if (e.type === "propose") {
        this.rings.push({ id: e.id, t0: w.clock, x0: this.cssW * 0.82, y0: this.cssH * 0.86 });
        this.fx.pop(this.cssW / 2, this.cssH * 0.6, COPY.proposal, "#fff3c4", 24);
      } else if (e.type === "date") {
        this.hearts.push({ id: e.id, t0: w.clock, x0: e.x, y0: e.y });
      } else if (e.type === "reply") {
        const c = w.customers.find((k) => k.id === e.id);
        const box = c && customerBox(this.cam, c);
        if (box && e.yes) {
          this.fx.burst(box.x, box.top, "#e2482d", 12, box.half, "star");
          this.fx.pop(box.x, box.top - 30, `+${STREET.points.yes * w.level}`, "#fff3c4", 26);
        } else if (box) {
          this.fx.pop(box.x, box.bottom + 14, COPY.persistence, "#efe6d0", 15);
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
      case "propose":
        s.play("propose");
        break;
      case "reply":
        s.play(e.yes ? "yes" : "no");
        break;
      case "date":
        s.play("date");
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

  private look(): Look {
    const bright = this.world.level === 2 || this.world.phase === "ready";
    return bright
      ? {
          skyTop: [96, 170, 214],
          skyHorizon: [246, 227, 189],
          fog: [241, 226, 196],
          fogStart: 6,
          fogEnd: 26,
          fogMax: 0.62,
          tex: this.textures.bright,
        }
      : {
          skyTop: [142, 154, 160],
          skyHorizon: [207, 202, 190],
          fog: [194, 189, 177],
          fogStart: 4,
          fogEnd: 20,
          fogMax: 0.78,
          tex: this.textures.dull,
        };
  }

  private render(now: number): void {
    const ctx = this.ctx;
    const w = this.world;
    const still = w.cfg.reducedMotion;
    const t = now / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.fx.shake > 0 && !still) {
      ctx.translate((Math.random() - 0.5) * this.fx.shake, (Math.random() - 0.5) * this.fx.shake);
    }
    switch (w.phase) {
      case "pickup":
      case "return":
        drawStreet(ctx, this.flat, w.scroll, w.phaseT, w.phase, still);
        break;
      case "sharpen":
        drawBench(
          ctx,
          this.flat,
          w.edge,
          t,
          w.restoredAt >= 0 ? w.phaseT - w.restoredAt : -1,
          still,
        );
        break;
      default:
        this.updateCam();
        this.drawTown(ctx);
        break;
    }
    this.fx.draw(ctx);
    if (w.phase === "level1" || w.phase === "level2" || w.phase === "edgeGone")
      this.drawOverlays(ctx);
    this.drawTrails(ctx, now);
    if (w.phase !== "pickup" && w.phase !== "return" && w.phase !== "sharpen") {
      drawKnife(
        ctx,
        this.flat,
        w.phase === "ready" ? "keen" : w.band,
        this.fx.swing,
        this.fx.recoil,
        t,
        still,
      );
    }
    if (this.fade > 0) {
      ctx.globalAlpha = this.fade * 0.85;
      ctx.fillStyle = "#17191a";
      ctx.fillRect(0, 0, this.cssW, this.cssH);
      ctx.globalAlpha = 1;
    }
  }

  private drawTown(ctx: CanvasRenderingContext2D): void {
    const view = this.view;
    if (!view) return;
    const cam = this.cam;
    const w = this.world;
    renderStreet(view, w.map, cam, this.look());
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(view.canvas, 0, 0, this.cssW, this.cssH);

    // Sprites far to near: neighbors and fruit, each hidden behind nearer walls.
    type Draw = { d: number; fn: () => void; x0: number; x1: number };
    const draws: Draw[] = [];
    for (const c of w.customers) {
      const box = customerBox(cam, c);
      if (!box) continue;
      const look = this.people[c.look % this.people.length]!;
      const wPx = LOOK_WORLD_W * box.s;
      const hPx = LOOK_WORLD_H * box.s;
      draws.push({
        d: box.d,
        x0: box.x - wPx / 2,
        x1: box.x + wPx / 2,
        fn: () => {
          const r = c.reply;
          const shake =
            r?.shown && !r.yes && !w.cfg.reducedMotion && w.clock - r.at < 0.4
              ? Math.sin((w.clock - r.at) * 50) * 3
              : 0;
          const hop =
            c.won && !w.cfg.reducedMotion ? Math.abs(Math.sin(w.clock * 6)) * 0.06 * box.s : 0;
          ctx.drawImage(look, box.x - wPx / 2 + shake, box.bottom - hPx - hop, wPx, hPx);
        },
      });
    }
    for (const it of w.fruit) {
      const p = project3(cam, it.mx, it.my, it.y, tmp);
      if (p.d < 0.3) continue;
      const a = alphaOf(it);
      if (a <= 0) continue;
      const r = radiusOf(it.kind) * p.s;
      const x = p.x;
      const y = p.y;
      const d = p.d;
      const g = project3(cam, it.mx, it.my, 0);
      const since = w.clock - it.hurtAt;
      const wob =
        since < 0.45 && !w.cfg.reducedMotion ? Math.sin(since * 40) * 0.25 * (1 - since / 0.45) : 0;
      draws.push({
        d,
        x0: x - r * 1.6,
        x1: x + r * 1.6,
        fn: () => {
          // Shadow on the ground, then the fruit.
          const lift = Math.max(0, Math.min(1, it.y / 0.9));
          ctx.globalAlpha = a * (0.3 - lift * 0.15);
          ctx.fillStyle = "#1f2620";
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, r * (1 - lift * 0.4), r * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.save();
          ctx.translate(x, y);
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
          ctx.restore();
          ctx.globalAlpha = 1;
        },
      });
    }
    draws.sort((a, b) => b.d - a.d);
    for (const dr of draws) drawDepthClipped(ctx, view, cam, dr.x0, dr.x1, dr.d, dr.fn);
  }

  /** Heart pips, speech bubbles, flying rings and date hearts. Screen space. */
  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    const w = this.world;
    const cam = this.cam;
    const size = Math.max(13, Math.min(18, 15 * this.flat.unit * 1.3));
    const byId = new Map<number, Customer>(w.customers.map((c) => [c.id, c]));
    for (const c of w.customers) {
      const box = customerBox(cam, c);
      if (!box || box.x < 0 || box.x > this.cssW) continue;
      // Hearts: how many dates they need, filled as you give value.
      const r = Math.max(5, Math.min(9, box.s * 0.05));
      const y = box.top - r * 2.2;
      for (let i = 0; i < c.need; i++) {
        const x = box.x + (i - (c.need - 1) / 2) * r * 2.6;
        heart(ctx, x, y, r, c.won || i < c.dates ? "#e2482d" : "#fffaf0");
      }
      const rep = c.reply;
      if (rep?.shown && w.clock - rep.at < STREET.replyShow) {
        const lines = rep.yes ? COPY.replies.yes : COPY.replies.no;
        bubble(
          ctx,
          box.x,
          y - r * 1.4,
          lines[rep.line % lines.length]!,
          rep.yes ? "yes" : "no",
          this.cssW,
          size,
        );
      }
    }
    // The ring box arcing from your hand to them.
    this.rings = this.rings.filter((f) => w.clock - f.t0 < STREET.replyDelay + 0.05);
    for (const f of this.rings) {
      const c = byId.get(f.id);
      const box = c && customerBox(cam, c);
      if (!box) continue;
      const k = Math.min(1, (w.clock - f.t0) / STREET.replyDelay);
      const x = f.x0 + (box.x - f.x0) * k;
      const y =
        f.y0 + (box.top + (box.bottom - box.top) * 0.3 - f.y0) * k - Math.sin(k * Math.PI) * 80;
      ringBox(ctx, x, y, 12, k * 6);
    }
    // Date hearts flying from the fruit to the neighbor.
    this.hearts = this.hearts.filter((f) => w.clock - f.t0 < 0.5);
    for (const f of this.hearts) {
      const c = byId.get(f.id);
      const box = c && customerBox(cam, c);
      if (!box) continue;
      const k = (w.clock - f.t0) / 0.5;
      heart(
        ctx,
        f.x0 + (box.x - f.x0) * k,
        f.y0 + (box.top - f.y0) * k - Math.sin(k * Math.PI) * 30,
        9,
        "#e2482d",
      );
    }
  }

  private drawTrails(ctx: CanvasRenderingContext2D, now: number): void {
    this.input.prune(now);
    const w = this.world;
    const style =
      w.phase === "sharpen"
        ? { width: 10, color: "rgba(255,233,168,0.9)", glow: "rgba(255,200,120,0.8)" }
        : TRAIL_STYLE[w.phase === "ready" ? "keen" : w.band];
    const width = style.width * Math.max(0.8, this.flat.unit);
    for (const pts of this.input.trails.values()) {
      const d = trailPath(pts, now, TRAIL_LIFE, width);
      if (!d) continue;
      const path = new Path2D(d);
      ctx.save();
      if (style.glow && !w.cfg.reducedMotion) {
        ctx.shadowColor = style.glow;
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = style.color;
      ctx.fill(path);
      ctx.restore();
    }
  }
}
