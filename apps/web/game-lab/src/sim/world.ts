/**
 * The game simulation: pure data in, pure data out. No DOM, canvas or audio,
 * so Vitest can drive whole levels (see test/game-lab-sim.test.ts). The engine
 * calls `step` every frame and `slice` for every swipe segment, then drains
 * `world.events` into the renderer, the sound and the HUD.
 */
import { cutAngle, distanceToSegment, type Pt } from "../../../src/toy/geometry.ts";
import {
  CLEAN_BONUS,
  CLEAN_SHARE,
  COMBO_WINDOW,
  EDGE_GONE_SECONDS,
  GLINT_EDGE,
  HAZARD_WEAR,
  INGREDIENTS,
  L1_CUT_WEAR,
  L1_HARD_STOP,
  L1_OVERTIME,
  L1_TIME_WEAR,
  L2_CUT_WEAR,
  L2_PASSIVE_WEAR,
  LEVEL1,
  LEVEL2,
  LEVEL_END_GRACE,
  MAX_ITEMS,
  PICKUP_SECONDS,
  RESTORED_SECONDS,
  SHARPEN_STROKES,
  SWEEP_COOLDOWN,
  SWISH_SPEED,
  TAP_SPEED,
  Z_FAR,
  Z_HOP,
  Z_LAND,
  Z_STILL,
  type IngredientId,
  type LevelSpec,
  type SpawnPhase,
} from "../levels.ts";
import { bandOf, cutOutcome, type Band, type Outcome } from "./edge.ts";
import { project, type Camera, type Projected } from "./projection.ts";
import { nextRandom } from "./rng.ts";

export type Phase =
  "ready" | "level1" | "edgeGone" | "pickup" | "sharpen" | "return" | "level2" | "results";

export interface WorldConfig {
  /** Nominal Level 1 length in seconds; the edge runs out around then. */
  l1Seconds: number;
  l2Seconds: number;
  reducedMotion: boolean;
  seed: number;
}

export interface Item {
  id: number;
  kind: IngredientId;
  /** Lane position, -1..1 across the cut zone (scaled by the camera's laneX). */
  u: number;
  y: number;
  z: number;
  vu: number;
  vy: number;
  vz: number;
  /** In the cut zone (hopped up off the counter). Only these can be cut. */
  air: boolean;
  age: number;
  /** Reduced motion only: how long it stays up before fading. */
  life: number;
  hits: number;
  lastStroke: number;
  spin: number;
  vspin: number;
  /** Clock time of the last glance, bounce or notch, for the wobble. */
  hurtAt: number;
  bruises: number;
  gone: boolean;
}

export type CutOutcome = Exclude<Outcome, "none">;

export type GameEvent =
  | {
      type: "cut";
      kind: IngredientId;
      outcome: CutOutcome;
      weak: boolean;
      power: boolean;
      clean: boolean;
      points: number;
      x: number;
      y: number;
      r: number;
      angle: number;
      /** Unit direction of the swipe, for flinging halves. */
      dx: number;
      dy: number;
      speed: number;
      band: Band;
    }
  | { type: "clang"; x: number; y: number; r: number }
  | { type: "glint"; x: number; y: number; r: number }
  | { type: "combo"; n: number; bonus: number; x: number; y: number }
  | { type: "miss"; kind: IngredientId }
  | { type: "band"; band: Band }
  | { type: "warn"; at: 50 | 25 }
  | { type: "phase"; phase: Phase }
  | { type: "sharpen"; edge: number; stroke: number }
  | { type: "restored" };

interface Stroke {
  id: number;
  open: boolean;
  cuts: number;
  points: number;
  lastCut: number;
  x: number;
  y: number;
}

export interface World {
  cfg: WorldConfig;
  phase: Phase;
  level: 1 | 2;
  /** Seconds in the current phase (slowed by slow motion). */
  phaseT: number;
  clock: number;
  edge: number;
  band: Band;
  /** Level 1 wear from cuts and hazards, on top of wear over time. */
  cutWear: number;
  score: number;
  l1Score: number;
  l2Score: number;
  cuts: number;
  streak: number;
  bestStreak: number;
  bestCombo: number;
  items: Item[];
  nextId: number;
  rng: { seed: number };
  spawnT: number;
  firstSpawn: boolean;
  lastU: number;
  ending: boolean;
  endAt: number;
  /** Distance the counter has scrolled, for the renderer. */
  scroll: number;
  stroke: Stroke;
  strokeSeq: number;
  lastSweep: number;
  hitstop: number;
  slowmo: number;
  warned: number;
  sharpen: number;
  restoredAt: number;
  events: GameEvent[];
}

const HIT_SLOP = 1.15;
const tmp: Projected = { x: 0, y: 0, s: 0 };

export function createWorld(cfg: WorldConfig): World {
  return {
    cfg,
    phase: "ready",
    level: 1,
    phaseT: 0,
    clock: 0,
    edge: 100,
    band: "keen",
    cutWear: 0,
    score: 0,
    l1Score: 0,
    l2Score: 0,
    cuts: 0,
    streak: 0,
    bestStreak: 0,
    bestCombo: 0,
    items: [],
    nextId: 0,
    rng: { seed: cfg.seed | 0 },
    spawnT: 0,
    firstSpawn: true,
    lastU: 0,
    ending: false,
    endAt: 0,
    scroll: 0,
    stroke: { id: 0, open: false, cuts: 0, points: 0, lastCut: 0, x: 0, y: 0 },
    strokeSeq: 0,
    lastSweep: -99,
    hitstop: 0,
    slowmo: 0,
    warned: 0,
    sharpen: 0,
    restoredAt: -1,
    events: [],
  };
}

/* ---------- Phases ---------- */

function setPhase(w: World, phase: Phase): void {
  w.phase = phase;
  w.phaseT = 0;
  w.events.push({ type: "phase", phase });
}

function resetLevel(w: World, level: 1 | 2): void {
  w.level = level;
  w.edge = 100;
  w.band = "keen";
  w.cutWear = 0;
  w.items = [];
  w.spawnT = 0.4;
  w.firstSpawn = level === 1;
  w.ending = false;
  w.endAt = 0;
  w.streak = 0;
  w.warned = 0;
  w.hitstop = 0;
  w.slowmo = 0;
  w.stroke.open = false;
  w.stroke.cuts = 0;
  w.stroke.points = 0;
}

export function startLevel1(w: World): void {
  resetLevel(w, 1);
  w.score = 0;
  w.l1Score = 0;
  w.l2Score = 0;
  w.cuts = 0;
  w.bestStreak = 0;
  w.bestCombo = 0;
  w.sharpen = 0;
  w.restoredAt = -1;
  setPhase(w, "level1");
}

export function startLevel2(w: World): void {
  resetLevel(w, 2);
  w.l2Score = 0;
  w.score = w.l1Score;
  setPhase(w, "level2");
}

export type Action = "start" | "continue" | "skip";

/** Buttons: Start, Continue and Skip. */
export function advance(w: World, action: Action): void {
  switch (w.phase) {
    case "ready":
    case "results":
      if (action === "start") startLevel1(w);
      return;
    case "edgeGone":
      w.items = [];
      setPhase(w, "pickup");
      return;
    case "pickup":
      if (action === "skip") startLevel2(w);
      else enterSharpen(w);
      return;
    case "sharpen":
      if (action === "skip") startLevel2(w);
      return;
    case "return":
      startLevel2(w);
      return;
    default:
      return;
  }
}

function enterSharpen(w: World): void {
  w.edge = 0;
  w.band = "gone";
  w.sharpen = 0;
  w.restoredAt = -1;
  setPhase(w, "sharpen");
}

/** One sharpening stroke (a back-and-forth swipe, an arrow key or the Sharpen button). */
export function sharpenStroke(w: World): void {
  if (w.phase !== "sharpen" || w.restoredAt >= 0) return;
  w.sharpen += 1;
  w.edge = Math.min(100, Math.round((w.sharpen / SHARPEN_STROKES) * 100));
  w.events.push({ type: "sharpen", edge: w.edge, stroke: w.sharpen });
  const band = bandOf(w.edge);
  if (band !== w.band) {
    w.band = band;
    w.events.push({ type: "band", band });
  }
  if (w.sharpen >= SHARPEN_STROKES) {
    w.restoredAt = w.phaseT;
    w.events.push({ type: "restored" });
  }
}

/* ---------- Edge ---------- */

/**
 * Level 1's edge: wear over time plus wear from cuts. Time alone takes it to
 * zero by about 1.2x the nominal length, and it is always zero by 1.3x, so the
 * story always reaches the sharpening, even if the player stops slicing.
 */
export function level1Edge(t: number, length: number, cutWear: number): number {
  if (t >= length * L1_HARD_STOP) return 0;
  const timeWear =
    t <= length
      ? (L1_TIME_WEAR * t) / length
      : L1_TIME_WEAR + ((100 - L1_TIME_WEAR) * (t - length)) / (length * L1_OVERTIME);
  return clamp(100 - timeWear - cutWear, 0, 100);
}

function levelLength(w: World): number {
  return w.level === 1 ? w.cfg.l1Seconds : w.cfg.l2Seconds;
}

function levelSpec(w: World): LevelSpec {
  return w.level === 1 ? LEVEL1 : LEVEL2;
}

function updateEdge(w: World, dt: number): void {
  if (w.level === 1) w.edge = level1Edge(w.phaseT, w.cfg.l1Seconds, w.cutWear);
  else w.edge = clamp(w.edge - L2_PASSIVE_WEAR * dt, 0, 100);
  const band = bandOf(w.edge);
  if (band !== w.band) {
    w.band = band;
    w.events.push({ type: "band", band });
  }
  if (w.level === 1) {
    if (w.edge < 50 && !(w.warned & 1)) {
      w.warned |= 1;
      w.events.push({ type: "warn", at: 50 });
    }
    if (w.edge < 25 && !(w.warned & 2)) {
      w.warned |= 2;
      w.events.push({ type: "warn", at: 25 });
    }
  }
}

function wear(w: World, kind: IngredientId): void {
  if (w.level === 1) {
    w.cutWear += L1_CUT_WEAR[INGREDIENTS[kind].tough] * (45 / w.cfg.l1Seconds);
    w.edge = level1Edge(w.phaseT, w.cfg.l1Seconds, w.cutWear);
  } else {
    w.edge = clamp(w.edge - L2_CUT_WEAR, 0, 100);
  }
}

/* ---------- Stepping ---------- */

export function step(w: World, dt: number, cam: Camera): void {
  dt = Math.min(Math.max(dt, 0), 0.1);
  if (w.hitstop > 0) {
    w.hitstop -= dt;
    return;
  }
  let simDt = dt;
  if (w.slowmo > 0) {
    w.slowmo -= dt;
    simDt = dt * 0.4;
  }
  w.clock += simDt;
  w.phaseT += simDt;
  const still = w.cfg.reducedMotion;
  switch (w.phase) {
    case "level1":
    case "level2":
      playStep(w, simDt, cam);
      break;
    case "edgeGone":
      moveItems(w, simDt);
      if (w.phaseT >= EDGE_GONE_SECONDS) {
        w.items = [];
        setPhase(w, "pickup");
      }
      break;
    case "pickup":
      if (!still) w.scroll += 2.4 * simDt;
      if (w.phaseT >= PICKUP_SECONDS) enterSharpen(w);
      break;
    case "sharpen":
      if (w.restoredAt >= 0 && w.phaseT - w.restoredAt >= RESTORED_SECONDS) {
        w.edge = 100;
        setPhase(w, "return");
      }
      break;
    case "return":
      if (!still) w.scroll += 1.2 * simDt;
      break;
    default:
      break;
  }
}

function playStep(w: World, dt: number, cam: Camera): void {
  const length = levelLength(w);
  const spec = levelSpec(w);
  if (!w.ending) {
    w.spawnT -= dt;
    let guard = 0;
    while (w.spawnT <= 0 && guard++ < 4) {
      const ph = spawnPhase(spec, w.phaseT / length);
      spawnGroup(w, ph);
      w.spawnT += (0.85 + 0.3 * rand(w)) / ph.rate;
    }
  }
  moveItems(w, dt);
  if (!w.cfg.reducedMotion) w.scroll += spec.ride * dt;
  updateEdge(w, dt);
  resolveCombo(w, false);
  void cam;

  if (w.level === 1) {
    if (!w.ending && w.edge <= 0) {
      w.ending = true;
      w.endAt = w.phaseT;
    }
    if (w.ending && w.phaseT - w.endAt >= LEVEL_END_GRACE) {
      endStroke(w);
      setPhase(w, "edgeGone");
    }
  } else {
    if (!w.ending && w.phaseT >= length) {
      w.ending = true;
      w.endAt = w.phaseT;
    }
    const waited = w.phaseT - w.endAt;
    if (w.ending && (waited >= LEVEL_END_GRACE + 1.4 || (w.items.length === 0 && waited > 0.4))) {
      endStroke(w);
      w.items = [];
      setPhase(w, "results");
    }
  }
}

export function spawnPhase(spec: LevelSpec, progress: number): SpawnPhase {
  for (const ph of spec.phases) if (progress < ph.until) return ph;
  return spec.phases[spec.phases.length - 1]!;
}

function rand(w: World): number {
  return nextRandom(w.rng);
}

function laneU(w: World): number {
  let u = 0;
  for (let i = 0; i < 4; i++) {
    u = (rand(w) * 2 - 1) * 0.85;
    if (Math.abs(u - w.lastU) > 0.3) break;
  }
  w.lastU = u;
  return u;
}

function pick<T>(w: World, list: readonly T[]): T {
  return list[Math.floor(rand(w) * list.length) % list.length]!;
}

function spawnGroup(w: World, ph: SpawnPhase): void {
  if (w.items.length >= MAX_ITEMS) return;
  if (w.firstSpawn) {
    w.firstSpawn = false;
    addItem(w, "tomato", 0, 0);
    return;
  }
  const r = rand(w);
  if (r < ph.hazard) return void addItem(w, "lid", laneU(w), 0);
  if (r < ph.hazard + ph.glint) return void addItem(w, "glint", laneU(w), 0);
  const roll = rand(w);
  const n = roll < ph.cluster ? (rand(w) < 0.4 ? 4 : 3) : roll < ph.cluster + ph.pair ? 2 : 1;
  const base = laneU(w) * (n > 1 ? 0.55 : 1);
  for (let i = 0; i < n && w.items.length < MAX_ITEMS; i++) {
    const u = n === 1 ? base : base + (i - (n - 1) / 2) * 0.34;
    addItem(w, pick(w, ph.pool), clamp(u, -0.95, 0.95), i * 0.1);
  }
}

function addItem(w: World, kind: IngredientId, u: number, zOffset: number): void {
  const still = w.cfg.reducedMotion;
  const spec = levelSpec(w);
  const radius = INGREDIENTS[kind].radius;
  w.items.push({
    id: ++w.nextId,
    kind,
    u,
    y: still ? 0.32 + rand(w) * 0.32 : radius,
    z: still ? Z_STILL + zOffset : Z_FAR + zOffset,
    vu: 0,
    vy: 0,
    vz: 0,
    air: still,
    age: 0,
    life: still ? spec.stillLife : 0,
    hits: 0,
    lastStroke: -1,
    spin: (rand(w) - 0.5) * 0.6,
    vspin: 0,
    hurtAt: -10,
    bruises: 0,
    gone: false,
  });
}

function launch(w: World, it: Item, spec: LevelSpec): void {
  const g = spec.gravity;
  const apex = spec.apex[0] + (spec.apex[1] - spec.apex[0]) * rand(w);
  it.air = true;
  it.vy = Math.sqrt(2 * g * Math.max(0.1, apex - it.y));
  const flight = (it.vy + Math.sqrt(it.vy * it.vy + 2 * g * it.y)) / g;
  it.vz = -(it.z - Z_LAND) / flight;
  it.vu = -it.u * 0.12 + (rand(w) - 0.5) * 0.12;
  it.vspin = (rand(w) - 0.5) * 2.4;
}

function moveItems(w: World, dt: number): void {
  const spec = levelSpec(w);
  const g = spec.gravity;
  for (let i = w.items.length - 1; i >= 0; i--) {
    const it = w.items[i]!;
    it.age += dt;
    let remove = it.gone;
    if (!remove && it.life > 0) {
      // Reduced motion: it stays where it appeared, nudged only by hits.
      if (it.vy !== 0) {
        it.y += it.vy * dt;
        it.vy *= Math.pow(0.02, dt);
        if (Math.abs(it.vy) < 0.01) it.vy = 0;
      }
      it.spin += it.vspin * dt;
      it.vspin *= Math.pow(0.05, dt);
      if (it.age >= it.life) remove = true;
    } else if (!remove && !it.air) {
      it.z -= spec.ride * dt;
      if (it.z <= Z_HOP) launch(w, it, spec);
    } else if (!remove) {
      it.y += it.vy * dt;
      it.vy -= g * dt;
      it.z = Math.max(1.02, it.z + it.vz * dt);
      it.u += it.vu * dt;
      it.spin += it.vspin * dt;
      if (it.y < -0.7) remove = true;
    }
    if (remove) {
      if (!it.gone) missed(w, it);
      w.items.splice(i, 1);
    }
  }
}

function missed(w: World, it: Item): void {
  const tough = INGREDIENTS[it.kind].tough;
  if (tough === "hazard" || tough === "pickup") return;
  if (w.level === 2 && (w.phase === "level2" || w.phase === "results")) w.streak = 0;
  w.events.push({ type: "miss", kind: it.kind });
}

/** Opacity used for fades; faint items can't be cut. */
export function alphaOf(it: Item): number {
  if (it.life > 0) {
    const fadeIn = Math.min(1, it.age / 0.25);
    const fadeOut = Math.min(1, (it.life - it.age) / 0.4);
    return clamp(Math.min(fadeIn, fadeOut), 0, 1);
  }
  return Math.min(1, it.age / 0.4);
}

/** Where an item is on screen right now. */
export function itemScreen(cam: Camera, it: Item, out?: Projected): Projected {
  return project(cam, it.u * cam.laneX, it.y, it.z, out);
}

/** Cuttable items on screen, nearest first. Used by tests and the keyboard lanes. */
export function targets(
  w: World,
  cam: Camera,
): { id: number; kind: IngredientId; x: number; y: number; r: number }[] {
  return w.items
    .filter((it) => it.air && !it.gone && alphaOf(it) >= 0.5)
    .sort((a, b) => a.z - b.z)
    .map((it) => {
      const p = itemScreen(cam, it);
      return { id: it.id, kind: it.kind, x: p.x, y: p.y, r: INGREDIENTS[it.kind].radius * p.s };
    });
}

/* ---------- Cutting ---------- */

function canCut(w: World): boolean {
  return w.phase === "level1" || w.phase === "level2" || w.phase === "edgeGone";
}

function openStroke(w: World): void {
  w.stroke.id = ++w.strokeSeq;
  w.stroke.open = true;
  w.stroke.cuts = 0;
  w.stroke.points = 0;
}

/** The finger lifted, the mouse slowed down or the pointer left: the stroke is over. */
export function endStroke(w: World): void {
  resolveCombo(w, true);
  w.stroke.open = false;
}

function resolveCombo(w: World, force: boolean): void {
  const s = w.stroke;
  if (s.cuts === 0) return;
  if (!force && w.clock - s.lastCut < COMBO_WINDOW) return;
  if (s.cuts >= 2) {
    const mult = s.cuts >= 3 ? 2 : 1.5;
    const bonus = Math.round(s.points * (mult - 1));
    addScore(w, bonus);
    w.bestCombo = Math.max(w.bestCombo, s.cuts);
    w.events.push({ type: "combo", n: s.cuts, bonus, x: s.x, y: s.y });
    if (s.cuts >= 4 && !w.cfg.reducedMotion) w.slowmo = 0.35;
  }
  s.cuts = 0;
  s.points = 0;
}

function addScore(w: World, points: number): void {
  w.score += points;
  if (w.level === 1) w.l1Score += points;
  else w.l2Score += points;
}

/**
 * One swipe segment from a to b (CSS pixels) that took dtMs. Returns how many
 * ingredients it touched. Segments slower than a swish end the stroke.
 */
export function slice(w: World, cam: Camera, a: Pt, b: Pt, dtMs: number): number {
  if (!canCut(w)) return 0;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return 0;
  const speed = len / Math.max(dtMs, 1) / cam.unit;
  if (speed < SWISH_SPEED) {
    endStroke(w);
    return 0;
  }
  if (!w.stroke.open) openStroke(w);
  let hits = 0;
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  const angle = cutAngle(a, b);
  for (const it of w.items) {
    if (!it.air || it.gone || it.lastStroke === w.stroke.id || alphaOf(it) < 0.5) continue;
    const p = itemScreen(cam, it, tmp);
    const r = INGREDIENTS[it.kind].radius * p.s;
    const d = distanceToSegment(a, b, p);
    if (d > r * HIT_SLOP) continue;
    it.lastStroke = w.stroke.id;
    hits++;
    hitItem(w, it, p.x, p.y, r, speed, angle, dx, dy, d <= r * CLEAN_SHARE);
  }
  return hits;
}

function hitItem(
  w: World,
  it: Item,
  x: number,
  y: number,
  r: number,
  speed: number,
  angle: number,
  dx: number,
  dy: number,
  clean: boolean,
): void {
  const ing = INGREDIENTS[it.kind];
  const still = w.cfg.reducedMotion;
  const side = dx >= 0 ? 1 : -1;
  if (ing.tough === "hazard") {
    // Only the first hit on a hazard costs edge; more swipes just clang.
    it.hits += 1;
    if (it.hits > 1) {
      it.hurtAt = w.clock;
      w.events.push({ type: "clang", x, y, r });
      return;
    }
    if (w.level === 1) {
      w.cutWear += HAZARD_WEAR.level1;
      w.edge = level1Edge(w.phaseT, w.cfg.l1Seconds, w.cutWear);
    } else {
      w.edge = clamp(w.edge - HAZARD_WEAR.level2, 0, 100);
    }
    w.streak = 0;
    it.hurtAt = w.clock;
    if (!still) it.vy = Math.max(it.vy, 0) + 1.2;
    it.vspin += side * 7;
    w.events.push({ type: "clang", x, y, r });
    return;
  }
  if (ing.tough === "pickup") {
    w.edge = clamp(w.edge + GLINT_EDGE, 0, 100);
    it.gone = true;
    w.events.push({ type: "glint", x, y, r });
    return;
  }
  const band = bandOf(w.edge);
  const res = cutOutcome(band, ing.tough, speed, it.hits);
  if (res.outcome === "none") return;
  let points = 0;
  switch (res.outcome) {
    case "split":
      it.gone = true;
      points =
        Math.round(ing.points * (res.power ? 1.5 : 1)) + (clean && !res.weak ? CLEAN_BONUS : 0);
      w.cuts += 1;
      w.streak += 1;
      w.bestStreak = Math.max(w.bestStreak, w.streak);
      w.stroke.cuts += 1;
      w.stroke.points += points;
      w.stroke.lastCut = w.clock;
      w.stroke.x = x;
      w.stroke.y = y;
      if (res.power && !still) w.hitstop = 0.05;
      wear(w, it.kind);
      break;
    case "squash":
      it.gone = true;
      points = Math.round(ing.points / 2);
      w.cuts += 1;
      w.streak = 0;
      wear(w, it.kind);
      break;
    case "notch":
      it.hits += 1;
      it.hurtAt = w.clock;
      points = 5;
      if (!still) it.vy = Math.max(it.vy, 0) + 0.45;
      it.vspin += side * 3;
      wear(w, it.kind);
      break;
    case "bounce":
      it.hurtAt = w.clock;
      it.bruises += 1;
      w.streak = 0;
      if (!still) it.vy = Math.max(it.vy, 0) + 1.1;
      it.vspin += side * 9;
      break;
    case "skid":
      it.hurtAt = w.clock;
      it.vspin += side * 2;
      break;
  }
  if (points) addScore(w, points);
  w.events.push({
    type: "cut",
    kind: it.kind,
    outcome: res.outcome,
    weak: res.weak,
    power: res.power,
    clean,
    points,
    x,
    y,
    r,
    angle,
    dx,
    dy,
    speed,
    band,
  });
}

/** A horizontal cut straight through one item, at a fixed speed. */
function cutThrough(w: World, cam: Camera, it: Item): void {
  const p = itemScreen(cam, it);
  const r = INGREDIENTS[it.kind].radius * p.s;
  const half = r * 1.3;
  slice(
    w,
    cam,
    { x: p.x - half, y: p.y },
    { x: p.x + half, y: p.y },
    (half * 2) / (TAP_SPEED * cam.unit),
  );
}

/** Tap to slice: a tap on an ingredient cuts it with a horizontal stroke. */
export function tapCut(w: World, cam: Camera, x: number, y: number): boolean {
  if (!canCut(w)) return false;
  let best: Item | undefined;
  for (const it of w.items) {
    if (!it.air || it.gone || alphaOf(it) < 0.5) continue;
    const p = itemScreen(cam, it, tmp);
    const r = INGREDIENTS[it.kind].radius * p.s;
    if (Math.hypot(p.x - x, p.y - y) <= r * 1.25 && (!best || it.z < best.z)) best = it;
  }
  if (!best) return false;
  endStroke(w);
  openStroke(w);
  cutThrough(w, cam, best);
  endStroke(w);
  return true;
}

/** Keyboard lanes: ← ↓ → cut the lowest item in the left, middle or right third. */
export function laneCut(w: World, cam: Camera, lane: 0 | 1 | 2): boolean {
  if (!canCut(w)) return false;
  let best: Item | undefined;
  let bestY = -Infinity;
  for (const it of w.items) {
    if (!it.air || it.gone || alphaOf(it) < 0.5) continue;
    const p = itemScreen(cam, it, tmp);
    const l = clamp(Math.floor((p.x / cam.w) * 3), 0, 2);
    if (l === lane && p.y > bestY) {
      best = it;
      bestY = p.y;
    }
  }
  if (!best) return false;
  endStroke(w);
  openStroke(w);
  cutThrough(w, cam, best);
  endStroke(w);
  return true;
}

/** Space: one sweeping cut through everything in the cut zone, with a cooldown. */
export function sweepCut(w: World, cam: Camera): boolean {
  if (!canCut(w) || w.clock - w.lastSweep < SWEEP_COOLDOWN) return false;
  w.lastSweep = w.clock;
  endStroke(w);
  openStroke(w);
  const id = w.stroke.id;
  for (const it of [...w.items]) {
    if (it.air && !it.gone && it.lastStroke !== id && alphaOf(it) >= 0.5) cutThrough(w, cam, it);
  }
  endStroke(w);
  return true;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
