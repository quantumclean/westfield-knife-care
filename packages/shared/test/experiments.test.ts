import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPERIMENT_ID,
  EXPERIMENTS,
  activeExperiments,
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
});
