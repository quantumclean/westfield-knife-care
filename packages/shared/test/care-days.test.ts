import { describe, expect, it } from "vitest";
import {
  formatCareDay,
  hoursBetween,
  isBookableCareDay,
  parseIsoDate,
  upcomingCareDays,
} from "../src/index.ts";

// 2026-09-24 is a Thursday.
const now = new Date("2026-09-24T15:00:00Z");

describe("upcomingCareDays", () => {
  it("offers the next care days after the lead time", () => {
    expect(upcomingCareDays(now, { weekdays: [2, 4, 6], lead_days: 1, horizon: 4 })).toEqual([
      "2026-09-26",
      "2026-09-29",
      "2026-10-01",
      "2026-10-03",
    ]);
  });

  it("returns nothing when no weekdays are configured", () => {
    expect(upcomingCareDays(now, { weekdays: [], lead_days: 1, horizon: 3 })).toEqual([]);
  });

  it("validates bookable days", () => {
    expect(isBookableCareDay("2026-09-26", now)).toBe(true);
    expect(isBookableCareDay("2026-09-25", now)).toBe(false);
    expect(isBookableCareDay("not-a-date", now)).toBe(false);
  });
});

describe("date helpers", () => {
  it("parses only real ISO dates", () => {
    expect(parseIsoDate("2026-02-30")).toBeUndefined();
    expect(parseIsoDate("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("formats care days", () => {
    expect(formatCareDay("2026-09-26")).toBe("Sat, Sep 26");
  });

  it("computes fulfilment hours", () => {
    expect(hoursBetween("2026-09-26T09:00:00Z", "2026-09-27T10:30:00Z")).toBe(25.5);
    expect(hoursBetween("2026-09-27T09:00:00Z", "2026-09-26T09:00:00Z")).toBe(0);
  });
});
