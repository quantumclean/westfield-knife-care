import { describe, expect, it } from "vitest";
import { KNIVES, STREET } from "../game-lab/src/levels.ts";
import { makeCam3, project3, unproject3 } from "../game-lab/src/street/camera.ts";
import { buildRoute, generateMap, isOpen, poseAt } from "../game-lab/src/street/map.ts";
import {
  advanceStreet,
  cam0,
  createStreetWorld,
  customerBox,
  proposeAt,
  sliceStreet,
  startStreet1,
  startStreet2,
  stepStreet,
  streetTargets,
  type StreetWorld,
} from "../game-lab/src/street/world.ts";
import { cutOutcome } from "../game-lab/src/sim/edge.ts";
import { endStroke, sharpenStroke, type GameEvent } from "../game-lab/src/sim/world.ts";

const VIEW = { w: 390, h: 844 }; // an iPhone-sized portrait screen

const config = (over: Partial<StreetWorld["cfg"]> = {}) => ({
  l1Seconds: 25,
  l2Seconds: 30,
  reducedMotion: false,
  seed: 11,
  ...over,
});

function run(w: StreetWorld, seconds: number, until?: (w: StreetWorld) => boolean): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepStreet(w, 1 / 60, VIEW);
    events.push(...w.events.splice(0));
    if (until?.(w)) break;
  }
  return events;
}

const food = (w: StreetWorld) =>
  streetTargets(w, cam0(w)).filter((t) => t.kind !== "lid" && t.kind !== "glint");

/** A fast vertical swipe through the nearest cuttable fruit. */
function swipeFirst(w: StreetWorld): number {
  const t = food(w)[0];
  if (!t) return 0;
  const a = { x: t.x - 3, y: t.y - t.r * 2 };
  const b = { x: t.x + 3, y: t.y + t.r * 2 };
  const n = sliceStreet(w, cam0(w), a, b, Math.hypot(b.x - a.x, b.y - a.y) / 3);
  endStroke(w);
  return n;
}

describe("the Westfield street map", () => {
  it("is the same town for the same seed, and a different one for another", () => {
    const a = generateMap(5, 80);
    const b = generateMap(5, 80);
    const c = generateMap(6, 80);
    expect(Array.from(a.walls)).toEqual(Array.from(b.walls));
    expect(a.path).toEqual(b.path);
    expect(Array.from(a.walls)).not.toEqual(Array.from(c.walls));
  });

  it("has a walkable route that never passes through a wall", () => {
    for (const seed of [1, 2, 3, 42]) {
      const map = generateMap(seed, 120);
      const route = buildRoute(map.path);
      expect(route.length).toBeGreaterThanOrEqual(120);
      for (let s = 0; s <= route.length; s += 0.1) {
        const p = poseAt(route, s);
        expect(isOpen(map, p.x, p.y), `seed ${seed} at s=${s.toFixed(1)}`).toBe(true);
      }
    }
  });

  it("turns smoothly: heading never jumps between nearby steps", () => {
    const route = buildRoute(generateMap(9, 80).path);
    let prev = poseAt(route, 0).a;
    for (let s = 0.05; s <= route.length; s += 0.05) {
      const a = poseAt(route, s).a;
      const diff = Math.abs(Math.atan2(Math.sin(a - prev), Math.cos(a - prev)));
      expect(diff).toBeLessThan(0.1);
      prev = a;
    }
  });

  it("has alleys to throw fruit from and doorways for neighbors, all opening onto open ground", () => {
    const map = generateMap(3, 120);
    expect(map.sources.filter((s) => s.kind === "alley").length).toBeGreaterThan(4);
    expect(map.doors.length).toBeGreaterThan(4);
    for (const s of map.sources) {
      expect(isOpen(map, s.x, s.y)).toBe(true);
      expect(isOpen(map, s.x + s.nx, s.y + s.ny)).toBe(true); // one step toward the street
    }
  });
});

describe("the first-person camera", () => {
  it("round-trips a ground point through project and unproject", () => {
    const cam = makeCam3(390, 844, { x: 10, y: 10, a: 0.7 });
    const p = project3(cam, 12, 11.5, 0);
    const back = unproject3(cam, p.x, p.y)!;
    expect(back.x).toBeCloseTo(12, 6);
    expect(back.y).toBeCloseTo(11.5, 6);
  });

  it("puts things behind the camera off screen", () => {
    const cam = makeCam3(390, 844, { x: 10, y: 10, a: 0 });
    expect(project3(cam, 8, 10, 0.5).s).toBe(0);
  });
});

describe("Walk 1", () => {
  it("throws a tomato out of an alley first, and a swipe through it scores", () => {
    const w = createStreetWorld(config());
    startStreet1(w);
    run(w, 8, (w) => food(w).length > 0);
    expect(food(w)[0]?.kind).toBe("tomato");
    expect(swipeFirst(w)).toBe(1);
    expect(w.events.find((e) => e.type === "cut")).toMatchObject({ outcome: "split" });
    expect(w.score).toBeGreaterThan(0);
  });

  it("walks forward along the route", () => {
    const w = createStreetWorld(config());
    startStreet1(w);
    const s0 = w.s;
    run(w, 2);
    expect(w.s - s0).toBeCloseTo(2 * STREET.walk.level1, 1);
    expect(isOpen(w.map, w.pose.x, w.pose.y)).toBe(true);
  });

  it("always runs the edge out and reaches the sharpening, even with no input", () => {
    const w = createStreetWorld(config({ l1Seconds: 20, l2Seconds: 20 }));
    startStreet1(w);
    run(w, 60, (w) => w.phase === "sharpen");
    expect(w.phase).toBe("sharpen");
    for (let i = 0; i < 8; i++) sharpenStroke(w);
    run(w, 5, (w) => w.phase === "return");
    advanceStreet(w, "continue");
    expect(w.phase).toBe("level2");
    expect(w.edge).toBe(100);
    run(w, 40, (w) => w.phase === "results");
    expect(w.phase).toBe("results");
  });
});

describe("Hardcore and knife styles", () => {
  it("Hardcore Walk 1: nothing cuts until pickup, sharpening and return, and it is shorter", () => {
    const w = createStreetWorld(config({ hardcore: true, l1Seconds: 25 }));
    startStreet1(w);
    const outcomes: string[] = [];
    run(w, 40, (w) => {
      if (food(w).length) {
        swipeFirst(w);
        for (const e of w.events) if (e.type === "cut") outcomes.push(e.outcome);
      }
      return w.phase !== "level1";
    });
    expect(outcomes.length).toBeGreaterThan(0);
    expect(new Set(outcomes)).toEqual(new Set(["skid"]));
    expect(w.clock).toBeLessThan(25 * 0.6 * 1.35 + 3);
  });

  it("knife styles only change the thresholds they say they change", () => {
    expect(KNIVES.american).toEqual({ speed: 1, wear: 1, hazard: 1, slop: 1 });
    // A swipe just under the Worn minimum glances off with the all-rounder...
    expect(cutOutcome("worn", "soft", 0.65, 0).outcome).toBe("bounce");
    // ...but cuts with the Japanese knife, whose thresholds are lower.
    expect(cutOutcome("worn", "soft", 0.65 / KNIVES.japanese.speed, 0).outcome).toBe("split");
  });
});

describe("neighbors and proposals", () => {
  function withCustomer(w: StreetWorld) {
    run(w, 20, (w) => w.customers.some((c) => customerBox(cam0(w), c)));
    const c = w.customers.find((c) => customerBox(cam0(w), c))!;
    expect(c).toBeTruthy();
    return c;
  }

  it("says no to an early proposal, and yes once enough dates have happened", () => {
    const w = createStreetWorld(config());
    startStreet2(w);
    const c = withCustomer(w);
    const box = () => customerBox(cam0(w), c)!;
    expect(proposeAt(w, cam0(w), box().x, (box().top + box().bottom) / 2)).toBe(true);
    expect(w.proposals).toBe(1);
    run(w, 1, () => c.reply?.shown === true);
    expect(c.reply).toMatchObject({ yes: false, shown: true });
    // Asking again straight away is ignored (a short cooldown after each answer).
    expect(proposeAt(w, cam0(w), box().x, (box().top + box().bottom) / 2)).toBe(false);
    // Give value: dates, then ask again once the cooldown has passed.
    c.dates = c.need;
    c.reply!.at = w.clock - STREET.askCooldown;
    expect(proposeAt(w, cam0(w), box().x, (box().top + box().bottom) / 2)).toBe(true);
    expect(c.won).toBe(true);
    expect(w.yeses).toBe(1);
    expect(w.proposals).toBe(2);
  });

  it("counts a clean split near a neighbor as a date, but not a squash", () => {
    const w = createStreetWorld(config());
    startStreet2(w);
    withCustomer(w);
    let dated = false;
    run(w, 20, (w) => {
      if (food(w).length && w.customers.length) {
        swipeFirst(w);
        dated ||= w.events.some((e) => e.type === "date");
      }
      return dated;
    });
    expect(dated).toBe(true);

    const dull = createStreetWorld(config());
    startStreet1(dull);
    dull.cutWear = 70; // Dull: soft fruit squashes
    let squashes = 0;
    let dates = 0;
    run(dull, 15, (w) => {
      if (food(w).length) {
        swipeFirst(w);
        for (const e of w.events) {
          if (e.type === "cut" && e.outcome === "squash") squashes++;
          if (e.type === "date") dates++;
        }
        w.events.length = 0;
      }
      return squashes > 0;
    });
    expect(squashes).toBeGreaterThan(0);
    expect(dates).toBe(0);
  });
});

describe("reduced motion", () => {
  it("holds the view still, then cuts forward instead of walking", () => {
    const w = createStreetWorld(config({ reducedMotion: true }));
    startStreet1(w);
    const s0 = w.s;
    run(w, 3);
    expect(w.s).toBe(s0);
    run(w, STREET.stillHold);
    expect(w.s).toBeCloseTo(s0 + STREET.stillStep, 6);
    run(w, 3, (w) => food(w).length > 0);
    const t = food(w)[0]!;
    run(w, 0.3);
    const again = food(w).find((f) => f.id === t.id);
    expect(again && Math.abs(again.y - t.y)).toBeLessThan(1);
  });
});
