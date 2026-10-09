import { describe, expect, it } from "vitest";
import { FLYER_ROUTES, resolveExperiment, resolveFlyerRoute } from "../src/index.ts";

describe("resolveFlyerRoute", () => {
  it("maps /a and /b to the two launch experiments, with the flyer's own source and channel", () => {
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

  it("every flyer route points at a real, resolvable experiment", () => {
    for (const route of FLYER_ROUTES) {
      expect(resolveExperiment(route.experiment_id)).toBeDefined();
    }
  });

  describe("tolerates a trailing slash", () => {
    it.each(["/a/", "/b/"])("%s resolves the same as without the slash", (path) => {
      const withSlash = resolveFlyerRoute(path);
      const withoutSlash = resolveFlyerRoute(path.slice(0, -1));
      expect(withSlash).toEqual(withoutSlash);
      expect(withSlash).toBeDefined();
    });

    it("collapses repeated trailing slashes too", () => {
      expect(resolveFlyerRoute("/a///")).toEqual(resolveFlyerRoute("/a"));
    });
  });

  describe("tolerates letter case", () => {
    it.each(["/A", "/B", "/A/"])("%s resolves like its lowercase path", (path) => {
      const upper = resolveFlyerRoute(path);
      const lower = resolveFlyerRoute(path.toLowerCase().replace(/\/$/, ""));
      expect(upper).toEqual(lower);
      expect(upper).toBeDefined();
    });
  });

  it("a query string or hash never reaches resolveFlyerRoute: callers pass pathname only", () => {
    // Mirrors how apps/web/src/lib/session.ts calls this: location.pathname already
    // excludes the query string and hash, so /a?src=x and /a#book both normalise to /a
    // before this function ever sees them.
    expect(
      resolveFlyerRoute(new URL("https://sharp.example.com/a?src=flyer-a-batch2").pathname),
    ).toEqual(resolveFlyerRoute("/a"));
    expect(resolveFlyerRoute(new URL("https://sharp.example.com/B/#book").pathname)).toEqual(
      resolveFlyerRoute("/b"),
    );
  });

  describe("does not match beyond the two known flyer paths", () => {
    it.each(["/", "/thanks", "/ab", "/a/b", "/a-2", "/aa", "/c", "/api/a", "", "a", "/a ", " /a"])(
      "%j stays unresolved",
      (path) => {
        expect(resolveFlyerRoute(path)).toBeUndefined();
      },
    );
  });

  it("still returns distinct objects for /a and /b (no cross-contamination)", () => {
    expect(resolveFlyerRoute("/A")).not.toEqual(resolveFlyerRoute("/B"));
  });
});
