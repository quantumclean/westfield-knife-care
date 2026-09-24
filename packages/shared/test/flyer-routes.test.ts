import { describe, expect, it } from "vitest";
import { FLYER_ROUTES, resolveExperiment, resolveFlyerRoute } from "../src/index.ts";

describe("resolveFlyerRoute", () => {
  it("maps /a and /b to the two launch experiments", () => {
    expect(resolveFlyerRoute("/a")).toMatchObject({
      experiment_id: "experiment-001",
      source: "flyer-a",
      acquisition_channel: "print",
    });
    expect(resolveFlyerRoute("/b")).toMatchObject({
      experiment_id: "experiment-002",
      source: "flyer-b",
      acquisition_channel: "print",
    });
  });

  it("returns undefined for any other path", () => {
    expect(resolveFlyerRoute("/")).toBeUndefined();
    expect(resolveFlyerRoute("/thanks")).toBeUndefined();
    expect(resolveFlyerRoute("/a/")).toBeUndefined();
    expect(resolveFlyerRoute("/ab")).toBeUndefined();
  });

  it("every flyer route points at a real, resolvable experiment", () => {
    for (const route of FLYER_ROUTES) {
      expect(resolveExperiment(route.experiment_id)).toBeDefined();
    }
  });
});
