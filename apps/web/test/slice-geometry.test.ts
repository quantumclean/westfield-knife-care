import { describe, expect, it } from "vitest";
import {
  cutAngle,
  cutNormal,
  distanceToSegment,
  segmentHitsCircle,
  trailPath,
} from "../src/toy/geometry.ts";
import { pollDelay, TOTAL_POLL_MS } from "../src/lib/backoff.ts";

describe("slice geometry", () => {
  it("measures distance to a segment, clamped to its ends", () => {
    expect(distanceToSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 })).toBe(3);
    expect(distanceToSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 13, y: 4 })).toBe(5);
    expect(distanceToSegment({ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 5, y: 6 })).toBe(5);
  });

  it("hits a fruit only when the swipe passes through it", () => {
    const c = { x: 100, y: 100 };
    expect(segmentHitsCircle({ x: 0, y: 95 }, { x: 200, y: 105 }, c, 40)).toBe(true);
    expect(segmentHitsCircle({ x: 0, y: 30 }, { x: 200, y: 30 }, c, 40)).toBe(false);
    expect(segmentHitsCircle({ x: 0, y: 100 }, { x: 40, y: 100 }, c, 40)).toBe(false);
  });

  it("makes the same cut for a swipe in either direction", () => {
    expect(cutAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(cutAngle({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(0);
    expect(cutAngle({ x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45);
    expect(cutAngle({ x: 10, y: 10 }, { x: 0, y: 0 })).toBeCloseTo(45);
    expect(cutAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it("gives a unit normal perpendicular to the cut", () => {
    for (const deg of [-60, 0, 30, 90]) {
      const n = cutNormal(deg);
      const r = (deg * Math.PI) / 180;
      expect(Math.hypot(n.x, n.y)).toBeCloseTo(1);
      expect(n.x * Math.cos(r) + n.y * Math.sin(r)).toBeCloseTo(0);
    }
  });

  it("draws a trail only from live points", () => {
    expect(trailPath([{ x: 0, y: 0, t: 0 }], 10, 150, 10)).toBe("");
    const pts = [
      { x: 0, y: 0, t: 0 },
      { x: 10, y: 0, t: 10 },
      { x: 20, y: 0, t: 20 },
    ];
    expect(trailPath(pts, 30, 150, 10)).toMatch(/^M.*Z$/);
    expect(trailPath(pts, 500, 150, 10)).toBe("");
  });
});

describe("payment polling backoff", () => {
  it("starts quickly, backs off, and gives up after about a minute", () => {
    expect(pollDelay(0)).toBe(1000);
    expect(pollDelay(4)).toBeGreaterThan(pollDelay(1)!);
    expect(pollDelay(10)).toBeNull();
    expect(pollDelay(-1)).toBeNull();
    expect(TOTAL_POLL_MS).toBeGreaterThan(45_000);
    expect(TOTAL_POLL_MS).toBeLessThan(90_000);
  });
});
