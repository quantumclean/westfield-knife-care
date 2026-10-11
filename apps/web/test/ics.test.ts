import { describe, expect, it } from "vitest";
import { escapeText, foldLine, pickupIcs } from "../src/lib/ics.ts";

describe("pickup calendar file", () => {
  const ics = pickupIcs({
    orderId: "6a642b6b-e274-4816-9237-5f9249f3f10c",
    careDay: "2026-10-13",
    knives: 5,
    name: "Westfield Knife Care",
    now: new Date("2026-10-10T12:00:00Z"),
  });
  const lines = ics.split("\r\n");

  it("covers the 8am to 12pm window on the care day, in local time", () => {
    expect(lines).toContain("DTSTART:20261013T080000");
    expect(lines).toContain("DTEND:20261013T120000");
    expect(lines).toContain("DTSTAMP:20261010T120000Z");
  });

  it("reminds the evening before and tells people what to do", () => {
    expect(lines).toContain("TRIGGER:-PT12H");
    expect(ics.replace(/\r\n /g, "")).toContain(
      "Leave them wrapped in a bag at your door in the morning.",
    );
  });

  it("is well-formed: CRLF, balanced blocks, lines within 75 octets", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(lines.filter((l) => l.startsWith("BEGIN:"))).toHaveLength(3);
    expect(lines.filter((l) => l.startsWith("END:"))).toHaveLength(3);
    for (const l of lines) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it("escapes and folds per RFC 5545", () => {
    const input = ["a,b;c", "d", "e"].join("\\").replace("d\\e", "d\ne");
    expect(escapeText(input)).toBe(["a\\,b\\;c", "d\\ne"].join("\\\\"));
    const folded = foldLine("X".repeat(160));
    expect(folded.split("\r\n ").join("")).toBe("X".repeat(160));
  });
});
