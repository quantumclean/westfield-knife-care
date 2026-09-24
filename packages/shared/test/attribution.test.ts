import { describe, expect, it } from "vitest";
import { deriveAttribution, normaliseSource } from "../src/index.ts";

describe("deriveAttribution", () => {
  it("uses flyer parameters when present", () => {
    expect(deriveAttribution({ src: "flyer-v1-qr", ch: "print" })).toEqual({
      source: "flyer-v1-qr",
      acquisition_channel: "print",
    });
  });

  it("infers the channel from the source tag", () => {
    expect(deriveAttribution({ src: "nextdoor-post-2" }).acquisition_channel).toBe("social");
    expect(deriveAttribution({ src: "poster-gym" }).acquisition_channel).toBe("print");
  });

  it("falls back to utm parameters, then referrer, then direct", () => {
    expect(deriveAttribution({ utm_source: "Instagram", utm_medium: "social" })).toEqual({
      source: "instagram",
      acquisition_channel: "social",
    });
    expect(deriveAttribution({ referrer: "https://www.google.com/search?q=x" })).toEqual({
      source: "google.com",
      acquisition_channel: "search",
    });
    expect(deriveAttribution({})).toEqual({ source: "direct", acquisition_channel: "direct" });
  });

  it("rejects junk sources", () => {
    expect(normaliseSource("<script>")).toBeUndefined();
    expect(normaliseSource("Flyer QR")).toBe("flyer-qr");
  });
});
