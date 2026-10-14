/**
 * Street mode's simulation: a walk through Westfield where fruit is thrown
 * out of alleys and neighbors stand in doorways. It extends the counter's
 * World, so the edge rules, scoring, combos and the pickup, sharpening and
 * return beats are shared, not copied. Pure: no DOM, canvas or audio.
 */
import type { Pt } from "../../../src/toy/geometry.ts";
import { cutAngle, distanceToSegment } from "../../../src/toy/geometry.ts";
import {
  CLEAN_SHARE,
  INGREDIENTS,
  LEVEL_END_GRACE,
  MAX_ITEMS,
  STREET,
  SWEEP_COOLDOWN,
  SWISH_SPEED,
  TAP_SPEED,
  type IngredientId,
  type SpawnPhase,
} from "../levels.ts";
import {
  addScore,
  alphaOf,
  createWorld,
  endStroke,
  enterSharpen,
  hitItem,
  knifeOf,
  levelLength,
  levelSpec,
  openStroke,
  pick,
  rand,
  resolveCombo,
  serviceStep,
  setPhase,
  spawnPhase,
  spawnRateMult,
  startLevel1,
  startLevel2,
  updateEdge,
  type Action,
  type Item,
  type World,
  type WorldConfig,
} from "../sim/world.ts";
import { depthOf, makeCam3, project3, type Cam3, type Projected3 } from "./camera.ts";
import {
  buildRoute,
  generateMap,
  isOpen,
  poseAt,
  type Door,
  type Pose,
  type Route,
  type Source,
  type StreetMap,
} from "./map.ts";

/** A thrown ingredient. Height is `y` and vertical speed `vy`, as on the counter. */
export interface StreetItem extends Item {
  mx: number;
  my: number;
  vmx: number;
  vmy: number;
}

export interface Customer {
  id: number;
  x: number;
  y: number;
  /** Where they're walking to: out of the doorway onto the sidewalk. */
  tx: number;
  ty: number;
  /** Which way the doorway faces (into the street). */
  nx: number;
  ny: number;
  look: number;
  need: number;
  dates: number;
  asked: number;
  won: boolean;
  reply: { yes: boolean; line: number; at: number; shown: boolean } | null;
}

export interface StreetWorld extends World {
  map: StreetMap;
  route: Route;
  /** Distance walked along the route. */
  s: number;
  pose: Pose;
  fruit: StreetItem[];
  customers: Customer[];
  usedDoors: Set<Door>;
  nextCustomer: number;
  proposals: number;
  yeses: number;
  lastSide: number;
  /** Reduced motion: when the view last cut forward. */
  viewAt: number;
  /** The viewport the last step saw, for screen positions in events. */
  view: { w: number; h: number };
}

const HIT_SLOP = 1.15;

/** An ingredient's radius in Street mode. */
export function radiusOf(kind: IngredientId): number {
  return INGREDIENTS[kind].radius * STREET.fruitScale;
}
const tmp: Projected3 = { x: 0, y: 0, s: 0, d: 0 };

export function createStreetWorld(cfg: WorldConfig): StreetWorld {
  const base = createWorld(cfg);
  const map = generateMap(cfg.seed, 40);
  const route = buildRoute(map.path);
  return Object.assign(base, {
    map,
    route,
    s: 1.5,
    pose: poseAt(route, 1.5),
    fruit: [],
    customers: [],
    usedDoors: new Set<Door>(),
    nextCustomer: 0,
    proposals: 0,
    yeses: 0,
    lastSide: 0,
    viewAt: 0,
    view: { w: 390, h: 844 },
  });
}

/* ---------- Levels and phases ---------- */

export function walkSpeed(w: StreetWorld): number {
  const base = w.level === 1 ? STREET.walk.level1 : STREET.walk.level2;
  return w.cfg.hardcore && w.level === 2 ? base * STREET.hardcoreWalk : base;
}

/** A fresh stretch of town for each walk, long enough for its length. */
function newTown(w: StreetWorld): void {
  const need = walkSpeed(w) * levelLength(w) * 1.4 + 16;
  w.map = generateMap(w.cfg.seed * 7 + w.level * 101, need);
  w.route = buildRoute(w.map.path);
  w.s = 1.5;
  w.pose = poseAt(w.route, w.s);
  w.fruit = [];
  w.customers = [];
  w.usedDoors = new Set();
  w.nextCustomer = w.clock + 1.2;
  w.viewAt = w.clock;
}

export function startStreet1(w: StreetWorld): void {
  startLevel1(w);
  w.proposals = 0;
  w.yeses = 0;
  newTown(w);
}

export function startStreet2(w: StreetWorld): void {
  startLevel2(w);
  newTown(w);
}

/** Start, Continue and Skip, with the same story beats as the counter. */
export function advanceStreet(w: StreetWorld, action: Action): void {
  switch (w.phase) {
    case "ready":
    case "results":
      if (action === "start") startStreet1(w);
      return;
    case "edgeGone":
      w.fruit = [];
      w.customers = [];
      setPhase(w, "pickup");
      return;
    case "pickup":
      if (action === "skip") startStreet2(w);
      else enterSharpen(w);
      return;
    case "sharpen":
      if (action === "skip") startStreet2(w);
      return;
    case "return":
      startStreet2(w);
      return;
    default:
      return;
  }
}

/* ---------- Stepping ---------- */

export function stepStreet(w: StreetWorld, dt: number, view: { w: number; h: number }): void {
  w.view = view;
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
  switch (w.phase) {
    case "level1":
    case "level2":
      playStreet(w, simDt);
      break;
    case "edgeGone":
      moveFruit(w, simDt);
      revealReplies(w);
      serviceStep(w, simDt);
      if (w.phase !== "edgeGone") {
        w.fruit = [];
        w.customers = [];
      }
      break;
    default:
      serviceStep(w, simDt);
      break;
  }
}

function playStreet(w: StreetWorld, dt: number): void {
  const length = levelLength(w);
  const spec = levelSpec(w);
  walk(w, dt);
  if (!w.ending) {
    w.spawnT -= dt;
    let guard = 0;
    while (w.spawnT <= 0 && guard++ < 4) {
      const ph = spawnPhase(spec, w.phaseT / length);
      const thrown = spawnStreetGroup(w, ph);
      w.spawnT += thrown
        ? (0.85 + 0.3 * rand(w)) / (ph.rate * STREET.rate * spawnRateMult(w))
        : 0.25;
    }
    spawnCustomer(w);
  }
  moveFruit(w, dt);
  updateCustomers(w, dt);
  revealReplies(w);
  updateEdge(w, dt);
  resolveCombo(w, false);

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
    if (w.ending && (waited >= LEVEL_END_GRACE + 1.4 || (w.fruit.length === 0 && waited > 0.4))) {
      endStroke(w);
      w.fruit = [];
      setPhase(w, "results");
    }
  }
}

function walk(w: StreetWorld, dt: number): void {
  if (w.cfg.reducedMotion) {
    // No walking: hold a view, then cut forward to the next one.
    if (w.clock - w.viewAt >= STREET.stillHold) {
      w.viewAt = w.clock;
      w.s += STREET.stillStep;
      w.fruit = w.fruit.filter((it) => depthOf(cam0(w), it.mx, it.my) > 0.6);
    }
  } else {
    w.s += walkSpeed(w) * dt;
  }
  w.s = Math.min(w.s, w.route.length - 2);
  w.pose = poseAt(w.route, w.s);
}

/** The camera for the walker's current pose and the last viewport. */
export function cam0(w: StreetWorld): Cam3 {
  return makeCam3(w.view.w, w.view.h, w.pose);
}

/* ---------- Fruit ---------- */

function pickSource(w: StreetWorld): Source | null {
  const cam = cam0(w);
  const ok = w.map.sources.filter((src) => {
    const d = depthOf(cam, src.x, src.y);
    if (d < STREET.spawnDepth[0] || d > STREET.spawnDepth[1]) return false;
    const side = (src.x - cam.x) * cam.rx + (src.y - cam.y) * cam.ry;
    // It must face the walker's street and sit beside it, not across a block.
    const facing = src.nx * cam.rx + src.ny * cam.ry;
    return Math.abs(side) < 3.6 && Math.sign(facing) === -Math.sign(side || 1);
  });
  if (!ok.length) return null;
  // Prefer the other side from last time, so throws alternate left and right.
  const other = ok.filter((src) => {
    const side = (src.x - cam.x) * cam.rx + (src.y - cam.y) * cam.ry;
    return Math.sign(side) !== w.lastSide;
  });
  const list = other.length ? other : ok;
  const src = list[Math.floor(rand(w) * list.length) % list.length]!;
  w.lastSide = Math.sign((src.x - cam.x) * cam.rx + (src.y - cam.y) * cam.ry);
  return src;
}

/** Throws one spawn event's worth of ingredients. False if nothing could be thrown yet. */
function spawnStreetGroup(w: StreetWorld, ph: SpawnPhase): boolean {
  if (w.fruit.length >= MAX_ITEMS) return true;
  const still = w.cfg.reducedMotion;
  const src = still ? null : pickSource(w);
  if (!still && !src) return false;
  let kinds: IngredientId[];
  if (w.firstSpawn) {
    w.firstSpawn = false;
    kinds = ["tomato"];
  } else {
    const r = rand(w);
    if (r < ph.hazard) kinds = ["lid"];
    else if (r < ph.hazard + ph.glint) kinds = ["glint"];
    else {
      const roll = rand(w);
      const n = roll < ph.cluster ? (rand(w) < 0.4 ? 4 : 3) : roll < ph.cluster + ph.pair ? 2 : 1;
      kinds = Array.from({ length: n }, () => pick(w, ph.pool));
    }
  }
  kinds.forEach((kind, i) => {
    if (w.fruit.length < MAX_ITEMS) addFruit(w, kind, src, i, kinds.length);
  });
  return true;
}

function addFruit(
  w: StreetWorld,
  kind: IngredientId,
  src: Source | null,
  i: number,
  n: number,
): void {
  const cam = cam0(w);
  const lr = (lo: number, hi: number) => lo + (hi - lo) * rand(w);
  const spread = (i - (n - 1) / 2) * 0.32;
  const base: Omit<StreetItem, "mx" | "my" | "vmx" | "vmy" | "y" | "vy" | "life"> = {
    id: ++w.nextId,
    kind,
    u: 0,
    z: 0,
    vu: 0,
    vz: 0,
    air: true,
    age: 0,
    hits: 0,
    lastStroke: -1,
    spin: (rand(w) - 0.5) * 0.6,
    vspin: (rand(w) - 0.5) * 3,
    hurtAt: -10,
    bruises: 0,
    gone: false,
  };
  if (!src) {
    // Reduced motion: it appears in place ahead and holds still.
    const d = lr(1.6, 2.3);
    const side = lr(-0.42, 0.42) + spread * 0.6;
    w.fruit.push({
      ...base,
      vspin: 0,
      mx: cam.x + cam.dx * d + cam.rx * side,
      my: cam.y + cam.dy * d + cam.ry * side,
      vmx: 0,
      vmy: 0,
      y: lr(0.32, 0.68),
      vy: 0,
      life: levelSpec(w).stillLife,
    });
    return;
  }
  const g = w.level === 1 ? STREET.gravity.level1 : STREET.gravity.level2;
  const T = lr(STREET.flight[0], STREET.flight[1]) * (w.level === 2 ? 0.88 : 1) + i * 0.05;
  // Aim where the walker will be when it arrives.
  const ahead = lr(STREET.targetDepth[0], STREET.targetDepth[1]) + walkSpeed(w) * T;
  const lateral = lr(-0.3, 0.3) + spread;
  const tx = cam.x + cam.dx * ahead + cam.rx * lateral;
  const ty = cam.y + cam.dy * ahead + cam.ry * lateral;
  const h0 = 0.3 + i * 0.04;
  const ht = lr(STREET.targetHeight[0], STREET.targetHeight[1]);
  w.fruit.push({
    ...base,
    mx: src.x,
    my: src.y,
    vmx: (tx - src.x) / T,
    vmy: (ty - src.y) / T,
    y: h0,
    vy: (ht - h0) / T + 0.5 * g * T,
    life: 0,
  });
}

function moveFruit(w: StreetWorld, dt: number): void {
  const g = w.level === 1 ? STREET.gravity.level1 : STREET.gravity.level2;
  const cam = cam0(w);
  for (let i = w.fruit.length - 1; i >= 0; i--) {
    const it = w.fruit[i]!;
    it.age += dt;
    let remove = it.gone;
    if (!remove && it.life > 0) {
      if (it.vy !== 0) {
        it.y += it.vy * dt;
        it.vy *= Math.pow(0.02, dt);
        if (Math.abs(it.vy) < 0.01) it.vy = 0;
      }
      it.spin += it.vspin * dt;
      it.vspin *= Math.pow(0.05, dt);
      if (it.age >= it.life || depthOf(cam, it.mx, it.my) < 0.4) remove = true;
    } else if (!remove) {
      const nx = it.mx + it.vmx * dt;
      const ny = it.my + it.vmy * dt;
      if (isOpen(w.map, nx, ny) || it.age < 0.5) {
        it.mx = nx;
        it.my = ny;
      } else {
        // Hit a wall: drop straight down.
        it.vmx = 0;
        it.vmy = 0;
      }
      it.y += it.vy * dt;
      it.vy -= g * dt;
      it.spin += it.vspin * dt;
      if (it.y < -0.05 || depthOf(cam, it.mx, it.my) < 0.35 || it.age > 7) remove = true;
    }
    if (remove) {
      if (!it.gone) missed(w, it);
      w.fruit.splice(i, 1);
    }
  }
}

function missed(w: StreetWorld, it: StreetItem): void {
  const tough = INGREDIENTS[it.kind].tough;
  if (tough === "hazard" || tough === "pickup") return;
  if (w.level === 2) w.streak = 0;
  w.events.push({ type: "miss", kind: it.kind });
}

function cuttable(it: StreetItem, d: number): boolean {
  return (
    it.air && !it.gone && alphaOf(it) >= 0.5 && d >= STREET.cutDepth[0] && d <= STREET.cutDepth[1]
  );
}

/** Cuttable fruit on screen, nearest first. For tests and keyboard lanes. */
export function streetTargets(
  w: StreetWorld,
  cam: Cam3,
): { id: number; kind: IngredientId; x: number; y: number; r: number; d: number }[] {
  const out: { id: number; kind: IngredientId; x: number; y: number; r: number; d: number }[] = [];
  for (const it of w.fruit) {
    const p = project3(cam, it.mx, it.my, it.y);
    if (!cuttable(it, p.d)) continue;
    const r = radiusOf(it.kind) * p.s;
    if (p.x < -r || p.x > cam.w + r || p.y < -r || p.y > cam.h + r) continue;
    out.push({ id: it.id, kind: it.kind, x: p.x, y: p.y, r, d: p.d });
  }
  return out.sort((a, b) => a.d - b.d);
}

/* ---------- Cutting ---------- */

function canCut(w: World): boolean {
  return w.phase === "level1" || w.phase === "level2" || w.phase === "edgeGone";
}

/** One swipe segment (CSS px, dtMs long). Returns how many items it touched. */
export function sliceStreet(w: StreetWorld, cam: Cam3, a: Pt, b: Pt, dtMs: number): number {
  if (!canCut(w)) return 0;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return 0;
  const speed = len / Math.max(dtMs, 1) / cam.unit;
  if (speed < SWISH_SPEED) {
    endStroke(w);
    return 0;
  }
  if (!w.stroke.open) openStroke(w);
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  const angle = cutAngle(a, b);
  const slop = HIT_SLOP * knifeOf(w).slop;
  let hits = 0;
  for (const it of w.fruit) {
    if (it.lastStroke === w.stroke.id) continue;
    const p = project3(cam, it.mx, it.my, it.y, tmp);
    if (!cuttable(it, p.d)) continue;
    const r = radiusOf(it.kind) * p.s;
    const dist = distanceToSegment(a, b, p);
    if (dist > r * slop) continue;
    it.lastStroke = w.stroke.id;
    hits++;
    const px = p.x;
    const py = p.y;
    const outcome = hitItem(w, it, px, py, r, speed, angle, dx, dy, dist <= r * CLEAN_SHARE);
    if (outcome === "split") giveDate(w, cam, px, py);
  }
  return hits;
}

function cutThrough(w: StreetWorld, cam: Cam3, it: StreetItem): void {
  const p = project3(cam, it.mx, it.my, it.y);
  const r = radiusOf(it.kind) * p.s;
  const half = r * 1.3;
  sliceStreet(
    w,
    cam,
    { x: p.x - half, y: p.y },
    { x: p.x + half, y: p.y },
    (half * 2) / (TAP_SPEED * cam.unit),
  );
}

/** A tap: cut the fruit under the finger, or else propose to the neighbor under it. */
export function tapStreet(
  w: StreetWorld,
  cam: Cam3,
  x: number,
  y: number,
): "cut" | "propose" | null {
  if (!canCut(w)) return null;
  let best: StreetItem | undefined;
  let bestD = Infinity;
  for (const it of w.fruit) {
    const p = project3(cam, it.mx, it.my, it.y, tmp);
    if (!cuttable(it, p.d)) continue;
    const r = radiusOf(it.kind) * p.s;
    if (Math.hypot(p.x - x, p.y - y) <= r * 1.25 && p.d < bestD) {
      best = it;
      bestD = p.d;
    }
  }
  if (best) {
    endStroke(w);
    openStroke(w);
    cutThrough(w, cam, best);
    endStroke(w);
    return "cut";
  }
  return proposeAt(w, cam, x, y) ? "propose" : null;
}

/** Keyboard lanes: ← ↓ → cut the lowest fruit in the left, middle or right third. */
export function laneStreet(w: StreetWorld, cam: Cam3, lane: 0 | 1 | 2): boolean {
  if (!canCut(w)) return false;
  let best: StreetItem | undefined;
  let bestY = -Infinity;
  for (const it of w.fruit) {
    const p = project3(cam, it.mx, it.my, it.y, tmp);
    if (!cuttable(it, p.d)) continue;
    const l = Math.min(2, Math.max(0, Math.floor((p.x / cam.w) * 3)));
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

/** Space: one sweep through every cuttable fruit, with a cooldown. */
export function sweepStreet(w: StreetWorld, cam: Cam3): boolean {
  if (!canCut(w) || w.clock - w.lastSweep < SWEEP_COOLDOWN) return false;
  w.lastSweep = w.clock;
  endStroke(w);
  openStroke(w);
  const id = w.stroke.id;
  for (const it of [...w.fruit]) {
    const d = depthOf(cam, it.mx, it.my);
    if (cuttable(it, d) && it.lastStroke !== id) cutThrough(w, cam, it);
  }
  endStroke(w);
  return true;
}

/* ---------- Neighbors and proposals ---------- */

function spawnCustomer(w: StreetWorld): void {
  const C = STREET.customer;
  if (w.clock < w.nextCustomer || w.customers.length >= C.max) return;
  const cam = cam0(w);
  const ok = w.map.doors.filter((d) => {
    if (w.usedDoors.has(d)) return false;
    const depth = depthOf(cam, d.x, d.y);
    const side = (d.x - cam.x) * cam.rx + (d.y - cam.y) * cam.ry;
    const facing = d.nx * cam.rx + d.ny * cam.ry;
    return (
      depth >= (w.cfg.reducedMotion ? 2.5 : C.depth[0]) &&
      depth <= C.depth[1] &&
      Math.abs(side) < 4 &&
      Math.sign(facing) === -Math.sign(side || 1)
    );
  });
  if (!ok.length) {
    w.nextCustomer = w.clock + 0.5;
    return;
  }
  const door = ok[Math.floor(rand(w) * ok.length) % ok.length]!;
  w.usedDoors.add(door);
  const [lo, hi] = w.level === 1 ? C.need.level1 : C.need.level2;
  w.customers.push({
    id: ++w.nextId,
    x: door.x,
    y: door.y,
    tx: door.x + door.nx * C.stepOut,
    ty: door.y + door.ny * C.stepOut,
    nx: door.nx,
    ny: door.ny,
    look: Math.floor(rand(w) * 1000),
    need: lo + Math.floor(rand(w) * (hi - lo + 1)),
    dates: 0,
    asked: 0,
    won: false,
    reply: null,
  });
  w.nextCustomer = w.clock + C.gap[0] + rand(w) * (C.gap[1] - C.gap[0]);
}

function updateCustomers(w: StreetWorld, dt: number): void {
  const cam = cam0(w);
  const C = STREET.customer;
  for (const c of w.customers) {
    const dx = c.tx - c.x;
    const dy = c.ty - c.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-3) {
      const step = Math.min(dist, w.cfg.reducedMotion ? dist : C.stepSpeed * dt);
      c.x += (dx / dist) * step;
      c.y += (dy / dist) * step;
    }
  }
  w.customers = w.customers.filter((c) => depthOf(cam, c.x, c.y) > 0.7);
}

/** Screen box of a neighbor (feet to head), or null if behind or off screen. */
export function customerBox(
  cam: Cam3,
  c: Customer,
): { x: number; top: number; bottom: number; half: number; s: number; d: number } | null {
  const p = project3(cam, c.x, c.y, 0);
  if (p.d < 0.6) return null;
  const top = p.y - STREET.customer.height * p.s;
  const half = (STREET.customer.width / 2) * p.s;
  if (p.x + half < 0 || p.x - half > cam.w) return null;
  return { x: p.x, top, bottom: p.y, half, s: p.s, d: p.d };
}

/** A split while a neighbor is in view counts as a date with the nearest one. */
function giveDate(w: StreetWorld, cam: Cam3, x: number, y: number): void {
  let best: Customer | undefined;
  let bestD = Infinity;
  for (const c of w.customers) {
    if (c.won || c.dates >= c.need) continue;
    const box = customerBox(cam, c);
    if (!box || box.d > 10) continue;
    const dist = Math.hypot(box.x - x, box.top - y);
    if (dist < bestD) {
      best = c;
      bestD = dist;
    }
  }
  if (!best) return;
  best.dates += 1;
  w.events.push({ type: "date", id: best.id, x, y });
}

/** Throws a proposal at the neighbor at (x, y). True if one was there to ask. */
export function proposeAt(w: StreetWorld, cam: Cam3, x: number, y: number): boolean {
  for (const c of [...w.customers].sort(
    (a, b) => depthOf(cam, a.x, a.y) - depthOf(cam, b.x, b.y),
  )) {
    const box = customerBox(cam, c);
    if (!box) continue;
    const pad = Math.max(10, box.half * 0.3);
    if (
      x >= box.x - box.half - pad &&
      x <= box.x + box.half + pad &&
      y >= box.top - pad &&
      y <= box.bottom + pad
    ) {
      return propose(w, c);
    }
  }
  return false;
}

/** Keyboard: propose to the nearest neighbor in view. */
export function proposeNearest(w: StreetWorld, cam: Cam3): boolean {
  const near = w.customers
    .filter((c) => customerBox(cam, c))
    .sort((a, b) => depthOf(cam, a.x, a.y) - depthOf(cam, b.x, b.y))[0];
  return near ? propose(w, near) : false;
}

function propose(w: StreetWorld, c: Customer): boolean {
  if (c.won) return false;
  if (c.reply && w.clock - c.reply.at < STREET.askCooldown) return false;
  w.proposals += 1;
  c.asked += 1;
  const yes = c.dates >= c.need;
  if (yes) {
    c.won = true;
    w.yeses += 1;
    addScore(w, STREET.points.yes * w.level);
  } else {
    addScore(w, STREET.points.persist);
  }
  c.reply = {
    yes,
    line: Math.floor(rand(w) * 1000),
    at: w.clock + STREET.replyDelay,
    shown: false,
  };
  w.events.push({ type: "propose", id: c.id });
  return true;
}

function revealReplies(w: StreetWorld): void {
  for (const c of w.customers) {
    if (c.reply && !c.reply.shown && w.clock >= c.reply.at) {
      c.reply.shown = true;
      w.events.push({ type: "reply", id: c.id, yes: c.reply.yes, line: c.reply.line });
    }
  }
}
