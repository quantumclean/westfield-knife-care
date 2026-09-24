import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPERIMENT_ID,
  EXPERIMENTS,
  activeExperiments,
  isHonorablePin,
  resolveExperiment,
  resolveExperimentOrDefault,
  validateRegistry,
} from "../src/index.ts";

describe("experiment registry", () => {
  it("is internally consistent", () => {
    expect(validateRegistry()).toEqual([]);
  });

  it("ships the two launch experiments with the specified offers and prices", () => {
    const one = resolveExperiment("experiment-001");
    const two = resolveExperiment("experiment-002");
    expect(one?.price.bundle_price_cents).toBe(3900);
    expect(one?.price.knives_included).toBe(4);
    expect(one?.offer.headline).toBe("Never cook with a dull knife again.");
    expect(two?.price.bundle_price_cents).toBe(4900);
    expect(two?.price.knives_included).toBe(5);
    expect(two?.offer.headline).toBe("Your knives. Sharp tomorrow.");
  });

  it("falls back to the default experiment for unknown ids", () => {
    expect(resolveExperiment("experiment-999")).toBeUndefined();
    expect(resolveExperimentOrDefault("experiment-999").experiment.id).toBe(DEFAULT_EXPERIMENT_ID);
    expect(resolveExperimentOrDefault(null).experiment.id).toBe(DEFAULT_EXPERIMENT_ID);
  });

  it("only returns active, weighted experiments", () => {
    const active = activeExperiments([
      ...EXPERIMENTS,
      { ...EXPERIMENTS[0]!, id: "experiment-900", status: "paused" },
      { ...EXPERIMENTS[0]!, id: "experiment-901", weight: 0 },
    ]);
    expect(active.map((e) => e.id)).toEqual(["experiment-001", "experiment-002"]);
  });

  it("resolveExperiment ignores status entirely — it's a raw lookup, not an authorization check", () => {
    const registry = [{ ...EXPERIMENTS[1]!, status: "concluded" as const, weight: 0 }];
    const resolved = resolveExperiment("experiment-002", registry);
    expect(resolved?.price.bundle_price_cents).toBe(4900);
    expect(resolved?.offer.headline).toBe("Your knives. Sharp tomorrow.");
  });

  describe("isHonorablePin / resolveExperimentOrDefault", () => {
    it("honors a flyer-pinned experiment (experiment-002) even paused or concluded", () => {
      const registry = [{ ...EXPERIMENTS[1]!, status: "concluded" as const, weight: 0 }];
      expect(isHonorablePin("experiment-002", registry)).toBe(true);
      expect(resolveExperimentOrDefault("experiment-002", registry).price.bundle_price_cents).toBe(
        4900,
      );
    });

    it("honors any currently active experiment, flyer-pinned or not", () => {
      const registry = [
        { ...EXPERIMENTS[1]!, id: "experiment-organic", status: "active" as const },
      ];
      expect(isHonorablePin("experiment-organic", registry)).toBe(true);
    });

    it("does NOT honor a concluded experiment that was never pinned to a flyer", () => {
      const registry = [
        EXPERIMENTS[0]!, // a valid DEFAULT_EXPERIMENT_ID to fall back to
        { ...EXPERIMENTS[1]!, id: "experiment-organic", status: "concluded" as const },
      ];
      expect(isHonorablePin("experiment-organic", registry)).toBe(false);
      // Falls back to the default rather than charging a stale, unprinted price.
      expect(resolveExperimentOrDefault("experiment-organic", registry).experiment.id).toBe(
        DEFAULT_EXPERIMENT_ID,
      );
    });

    it("does not honor a flyer-pinned id that isn't actually in the given registry", () => {
      // experiment-001 is flyer-pinned, but isHonorablePin still requires
      // getExperiment to find it in the registry passed in — being a known
      // flyer id alone is not enough if the experiment record is gone.
      const registry = EXPERIMENTS.filter((e) => e.id !== "experiment-001");
      expect(isHonorablePin("experiment-001", registry)).toBe(false);
    });
  });
});
