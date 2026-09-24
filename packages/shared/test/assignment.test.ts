import { describe, expect, it } from "vitest";
import { assignExperiment, hashString, selectExperiment } from "../src/index.ts";
import type { Experiment } from "../src/index.ts";

const make = (id: string, weight: number): Experiment => ({
  id,
  name: id,
  hypothesis: "",
  status: "active",
  offer_version: "offer-001",
  price_version: "price-001",
  weight,
});

describe("assignExperiment", () => {
  it("is deterministic for a visitor", () => {
    const a = assignExperiment("visitor-abc");
    const b = assignExperiment("visitor-abc");
    expect(a?.id).toBe(b?.id);
  });

  it("splits traffic roughly by weight", () => {
    const experiments = [make("experiment-a", 3), make("experiment-b", 1)];
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const id = assignExperiment(`visitor-${i}`, experiments)!.id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    const shareA = counts["experiment-a"]! / 4000;
    expect(shareA).toBeGreaterThan(0.7);
    expect(shareA).toBeLessThan(0.8);
  });

  it("ignores zero-weight experiments and handles empty lists", () => {
    expect(assignExperiment("v", [make("experiment-a", 0)])).toBeUndefined();
    expect(assignExperiment("v", [])).toBeUndefined();
  });

  it("hashes stably", () => {
    expect(hashString("westfield")).toBe(hashString("westfield"));
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("selectExperiment", () => {
  it("prefers an active requested experiment over a stored one", () => {
    const chosen = selectExperiment({
      requestedId: "experiment-002",
      storedId: "experiment-001",
      visitorId: "v1",
    });
    expect(chosen?.id).toBe("experiment-002");
  });

  it("keeps the stored experiment when the request is unknown", () => {
    const chosen = selectExperiment({
      requestedId: "experiment-999",
      storedId: "experiment-001",
      visitorId: "v1",
    });
    expect(chosen?.id).toBe("experiment-001");
  });

  it("assigns fresh when nothing usable is provided", () => {
    const chosen = selectExperiment({ visitorId: "v1" });
    expect(chosen).toBeDefined();
  });

  it("honors a requested pin permanently, even paused or concluded (a flyer's printed price must never move)", () => {
    const registry = [
      make("experiment-a", 1),
      { ...make("experiment-b", 0), status: "concluded" as const },
    ];
    const chosen = selectExperiment({ requestedId: "experiment-b", visitorId: "v1" }, registry);
    expect(chosen?.id).toBe("experiment-b");
  });

  it("honors a stored pin permanently, even paused or concluded", () => {
    const registry = [
      make("experiment-a", 1),
      { ...make("experiment-b", 0), status: "paused" as const },
    ];
    const chosen = selectExperiment({ storedId: "experiment-b", visitorId: "v1" }, registry);
    expect(chosen?.id).toBe("experiment-b");
  });

  it("only weighs currently active experiments for a fresh, unpinned visitor", () => {
    const registry = [
      { ...make("experiment-a", 1), status: "concluded" as const },
      make("experiment-b", 1),
    ];
    const chosen = selectExperiment({ visitorId: "v1" }, registry);
    expect(chosen?.id).toBe("experiment-b");
  });

  it("still falls through to a fresh assignment when a pin is truly unknown", () => {
    const registry = [make("experiment-a", 1)];
    const chosen = selectExperiment({ requestedId: "experiment-ghost", visitorId: "v1" }, registry);
    expect(chosen?.id).toBe("experiment-a");
  });
});
