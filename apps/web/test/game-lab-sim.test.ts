import { describe, expect, it } from "vitest";
import { POWER_SPEED, SHARPEN_STROKES } from "../game-lab/src/levels.ts";
import { bandOf, cutOutcome } from "../game-lab/src/sim/edge.ts";
import { makeCamera, project, unproject } from "../game-lab/src/sim/projection.ts";
import {
  advance,
  createWorld,
  endStroke,
  level1Edge,
  sharpenStroke,
  slice,
  startLevel1,
  startLevel2,
  step,
  targets,
  type GameEvent,
  type World,
} from "../game-lab/src/sim/world.ts";

const cam = makeCamera(390, 844); // an iPhone-sized portrait screen
const config = (over: Partial<World["cfg"]> = {}) => ({
  l1Seconds: 25,
  l2Seconds: 30,
  reducedMotion: false,
  seed: 7,
  ...over,
});

/** Steps the world in 1/60 s ticks until `until` is true or `seconds` pass. */
function run(w: World, seconds: number, until?: (w: World) => boolean): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    step(w, 1 / 60, cam);
    events.push(...w.events.splice(0));
    if (until?.(w)) break;
  }
  return events;
}

const food = (w: World) => targets(w, cam).filter((t) => t.kind !== "lid" && t.kind !== "glint");

/** A fast vertical swipe straight through the first cuttable ingredient, if any. */
function swipeFirst(w: World, speedPxPerMs = 3): number {
  const t = food(w)[0];
  if (!t) return 0;
  const a = { x: t.x - 4, y: t.y - t.r * 2 };
  const b = { x: t.x + 4, y: t.y + t.r * 2 };
  const hits = slice(w, cam, a, b, Math.hypot(b.x - a.x, b.y - a.y) / speedPxPerMs);
  endStroke(w);
  return hits;
}

describe("edge bands and cut outcomes", () => {
  it("maps the meter to bands at 70, 40 and 15", () => {
    expect(bandOf(100)).toBe("keen");
    expect(bandOf(70)).toBe("keen");
    expect(bandOf(69.9)).toBe("worn");
    expect(bandOf(40)).toBe("worn");
    expect(bandOf(39)).toBe("dull");
    expect(bandOf(15)).toBe("dull");
    expect(bandOf(14.9)).toBe("gone");
    expect(bandOf(0)).toBe("gone");
  });

  it("cuts everything cleanly when keen, and needs two strokes or a power cut for tough items", () => {
    expect(cutOutcome("keen", "firm", 1, 0)).toMatchObject({ outcome: "split", weak: false });
    expect(cutOutcome("keen", "tough", 1, 0).outcome).toBe("notch");
    expect(cutOutcome("keen", "tough", 1, 1).outcome).toBe("split");
    expect(cutOutcome("keen", "tough", POWER_SPEED, 0)).toMatchObject({
      outcome: "split",
      power: true,
    });
  });

  it("gets worse as the edge wears, deterministically", () => {
    expect(cutOutcome("worn", "medium", 1, 0)).toMatchObject({ outcome: "split", weak: true });
    expect(cutOutcome("worn", "firm", 1, 0).outcome).toBe("notch");
    expect(cutOutcome("dull", "soft", 2, 0).outcome).toBe("squash");
    expect(cutOutcome("dull", "medium", 2, 0).outcome).toBe("notch");
    expect(cutOutcome("dull", "firm", 2, 0).outcome).toBe("bounce");
    expect(cutOutcome("dull", "soft", 0.8, 0).outcome).toBe("bounce"); // too slow for a dull blade
    expect(cutOutcome("gone", "soft", 3, 0).outcome).toBe("skid");
    expect(cutOutcome("keen", "soft", 0.2, 0).outcome).toBe("none"); // a slow drift is not a cut
  });
});

describe("the pseudo-3D camera", () => {
  it("round-trips a point on the counter through project and unproject", () => {
    const p = project(cam, 0.3, 0, 2.5);
    const back = unproject(cam, p.x, p.y, 0);
    expect(back!.x).toBeCloseTo(0.3, 6);
    expect(back!.z).toBeCloseTo(2.5, 6);
  });

  it("draws nearer things bigger and lower on screen", () => {
    const far = project(cam, 0, 0, 8);
    const near = project(cam, 0, 0, 1.5);
    expect(near.s).toBeGreaterThan(far.s);
    expect(near.y).toBeGreaterThan(far.y);
  });
});

describe("Level 1: Dull Days", () => {
  it("always runs the edge out, even if the player never cuts (the story guarantee)", () => {
    for (const l1Seconds of [20, 25, 45]) {
      const w = createWorld(config({ l1Seconds }));
      startLevel1(w);
      run(w, l1Seconds * 1.6, (w) => w.phase === "edgeGone");
      expect(w.phase).toBe("edgeGone");
      expect(w.edge).toBe(0);
      expect(w.clock).toBeLessThan(l1Seconds * 1.35 + 2);
    }
  });

  it("wears the edge over time and with every cut, and never sharpens on its own", () => {
    expect(level1Edge(0, 25, 0)).toBe(100);
    expect(level1Edge(12.5, 25, 0)).toBeCloseTo(70, 6);
    expect(level1Edge(12.5, 25, 10)).toBeCloseTo(60, 6);
    let prev = 101;
    for (let t = 0; t < 40; t += 0.5) {
      const e = level1Edge(t, 25, 0);
      expect(e).toBeLessThanOrEqual(prev);
      prev = e;
    }
  });

  it("replays exactly with the same seed", () => {
    const a = createWorld(config({ seed: 42 }));
    const b = createWorld(config({ seed: 42 }));
    startLevel1(a);
    startLevel1(b);
    run(a, 8);
    run(b, 8);
    expect(a.items.map((i) => [i.kind, i.u.toFixed(4), i.z.toFixed(4)])).toEqual(
      b.items.map((i) => [i.kind, i.u.toFixed(4), i.z.toFixed(4)]),
    );
  });

  it("opens with a tomato, and a swipe through it scores", () => {
    const w = createWorld(config());
    startLevel1(w);
    run(w, 6, (w) => targets(w, cam).length > 0);
    expect(targets(w, cam)[0]?.kind).toBe("tomato");
    expect(swipeFirst(w)).toBe(1);
    const cut = w.events.find((e) => e.type === "cut");
    expect(cut).toMatchObject({ type: "cut", outcome: "split", kind: "tomato" });
    expect(w.score).toBeGreaterThan(0);
    expect(w.cuts).toBe(1);
  });

  it("ignores ingredients still riding the counter", () => {
    const w = createWorld(config());
    startLevel1(w);
    run(w, 0.6);
    expect(w.items.length).toBeGreaterThan(0);
    expect(targets(w, cam)).toHaveLength(0);
  });

  it("squashes soft items and skids off when the edge is dull or gone", () => {
    const w = createWorld(config());
    startLevel1(w);
    w.cutWear = 70; // edge about 30: Dull
    run(w, 6, (w) => targets(w, cam).some((t) => t.kind === "tomato" || t.kind === "kiwi"));
    swipeFirst(w);
    const outcomes = w.events
      .filter((e) => e.type === "cut")
      .map((e) => (e as { outcome: string }).outcome);
    expect(outcomes.some((o) => o === "squash" || o === "notch" || o === "bounce")).toBe(true);
    expect(outcomes).not.toContain("skid");

    w.cutWear = 95; // Gone
    w.events.length = 0;
    run(w, 4, (w) => food(w).length > 0);
    swipeFirst(w);
    expect(
      w.events.filter((e) => e.type === "cut").map((e) => (e as { outcome: string }).outcome),
    ).toEqual(["skid"]);
  });
});

describe("hazards", () => {
  it("costs edge on the first hit only, however many times the lid is swiped", () => {
    const w = createWorld(config({ seed: 7 }));
    startLevel2(w); // seed 7 opens Level 2 with a pan lid
    run(w, 5, (w) => targets(w, cam).some((t) => t.kind === "lid"));
    const lid = targets(w, cam).find((t) => t.kind === "lid")!;
    const before = w.edge;
    for (let i = 0; i < 5; i++) {
      slice(w, cam, { x: lid.x, y: lid.y - lid.r * 2 }, { x: lid.x, y: lid.y + lid.r * 2 }, 20);
      endStroke(w);
    }
    expect(w.events.filter((e) => e.type === "clang")).toHaveLength(5);
    expect(before - w.edge).toBeGreaterThanOrEqual(8);
    expect(before - w.edge).toBeLessThan(9);
  });
});

describe("the service sequence and Level 2", () => {
  it("goes edge gone → pickup → sharpening → return → Level 2 → results", () => {
    const w = createWorld(config({ l1Seconds: 20, l2Seconds: 20 }));
    startLevel1(w);
    run(w, 60, (w) => w.phase === "edgeGone");
    expect(w.phase).toBe("edgeGone");
    run(w, 10, (w) => w.phase === "pickup"); // advances on its own
    expect(w.phase).toBe("pickup");
    run(w, 10, (w) => w.phase === "sharpen");
    expect(w.phase).toBe("sharpen");
    expect(w.edge).toBe(0);
    for (let i = 0; i < SHARPEN_STROKES; i++) sharpenStroke(w);
    expect(w.edge).toBe(100);
    expect(w.events.some((e) => e.type === "restored")).toBe(true);
    run(w, 5, (w) => w.phase === "return");
    expect(w.phase).toBe("return");
    advance(w, "continue");
    expect(w.phase).toBe("level2");
    expect(w.edge).toBe(100);
    run(w, 40, (w) => w.phase === "results");
    expect(w.phase).toBe("results");
  });

  it("lets Skip jump from the service beats straight to Level 2", () => {
    const w = createWorld(config());
    startLevel1(w);
    run(w, 60, (w) => w.phase === "edgeGone");
    advance(w, "continue");
    expect(w.phase).toBe("pickup");
    advance(w, "skip");
    expect(w.phase).toBe("level2");
  });

  it("keeps the edge keen in Level 2 for a competent player", () => {
    const w = createWorld(config({ l2Seconds: 30 }));
    startLevel2(w);
    run(w, 30, (w) => {
      swipeFirst(w);
      return w.phase !== "level2";
    });
    expect(w.l2Score).toBeGreaterThan(0);
    expect(w.edge).toBeGreaterThan(70);
  });

  it("pays a combo bonus for several items in one stroke", () => {
    const w = createWorld(config());
    startLevel2(w);
    // Wait for two cuttable items, then one long stroke through both.
    run(w, 30, (w) => food(w).length >= 2);
    const [t1, t2] = food(w);
    expect(t1 && t2).toBeTruthy();
    const before = w.score;
    const a = { x: t1!.x, y: t1!.y };
    const b = { x: t2!.x, y: t2!.y };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ext = (k: number) => ({ x: a.x + (dx / len) * k, y: a.y + (dy / len) * k });
    const from = ext(-t1!.r * 2);
    const to = ext(len + t2!.r * 2);
    slice(w, cam, from, to, Math.hypot(to.x - from.x, to.y - from.y) / 3);
    endStroke(w);
    const combo = w.events.find((e) => e.type === "combo");
    expect(combo).toMatchObject({ type: "combo", n: 2 });
    expect(w.score - before).toBeGreaterThan(0);
  });

  it("restarts cleanly", () => {
    const w = createWorld(config());
    startLevel2(w);
    run(w, 5, () => {
      swipeFirst(w);
      return false;
    });
    advance(w, "start"); // ignored mid-level
    expect(w.phase).toBe("level2");
    startLevel1(w);
    expect(w.phase).toBe("level1");
    expect(w.score).toBe(0);
    expect(w.items).toHaveLength(0);
  });
});

describe("reduced motion", () => {
  it("holds ingredients still in the cut zone instead of flying them along the counter", () => {
    const w = createWorld(config({ reducedMotion: true }));
    startLevel1(w);
    run(w, 1);
    const it = w.items[0]!;
    expect(it.air).toBe(true);
    const z = it.z;
    const y = it.y;
    run(w, 0.5);
    expect(it.z).toBe(z);
    expect(it.y).toBe(y);
    expect(w.scroll).toBe(0);
    run(w, 3, (w) => food(w).length > 0);
    expect(swipeFirst(w)).toBeGreaterThan(0);
  });
});
