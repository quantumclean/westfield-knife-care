import { describe, expect, it } from "vitest";
import {
  closedMessage,
  pickCareDay,
  resolveAvailability,
  type ConfigState,
} from "../src/lib/booking.ts";

const ready = (
  over: Partial<{ payments_enabled: boolean; care_days: string[] }> = {},
): ConfigState => ({
  status: "ready",
  config: { payments_enabled: true, care_days: ["2026-10-13", "2026-10-15"], ...over },
});

describe("pickCareDay", () => {
  const days = ["2026-10-15", "2026-10-17"];
  it("keeps the current day while the server still offers it", () => {
    expect(pickCareDay("2026-10-17", days)).toBe("2026-10-17");
  });
  it("moves to the first offered day when the current one is gone", () => {
    expect(pickCareDay("2026-10-13", days)).toBe("2026-10-15");
  });
  it("picks the first day when nothing is selected yet", () => {
    expect(pickCareDay("", days)).toBe("2026-10-15");
  });
  it("returns an empty string when there are no days", () => {
    expect(pickCareDay("2026-10-13", [])).toBe("");
  });
});

describe("resolveAvailability in a production build", () => {
  const prod = { dev: false };
  it("keeps submission off while the config is loading", () => {
    expect(resolveAvailability({ status: "loading" }, prod)).toEqual({ status: "checking" });
  });
  it("fails closed when the config cannot be loaded or is invalid", () => {
    expect(resolveAvailability({ status: "error" }, prod)).toEqual({
      status: "closed",
      reason: "unreachable",
    });
  });
  it("fails closed when payments are disabled", () => {
    expect(resolveAvailability(ready({ payments_enabled: false }), prod)).toEqual({
      status: "closed",
      reason: "payments_disabled",
    });
  });
  it("fails closed when no pickup days are offered", () => {
    expect(resolveAvailability(ready({ care_days: [] }), prod)).toEqual({
      status: "closed",
      reason: "no_pickup_days",
    });
  });
  it("opens only when payments are enabled and pickup days exist", () => {
    expect(resolveAvailability(ready(), prod)).toEqual({ status: "open" });
  });
});

describe("resolveAvailability in local development", () => {
  const dev = { dev: true };
  it("stays open so simulated checkout keeps working without Stripe", () => {
    expect(resolveAvailability(ready({ payments_enabled: false }), dev).status).toBe("open");
    expect(resolveAvailability({ status: "error" }, dev).status).toBe("open");
    expect(resolveAvailability({ status: "loading" }, dev).status).toBe("open");
  });
});

describe("closedMessage", () => {
  it("is customer-facing and points to the support address", () => {
    for (const reason of ["unreachable", "payments_disabled", "no_pickup_days"] as const) {
      const message = closedMessage(reason, "help@example.com");
      expect(message).toContain("help@example.com");
      expect(message).not.toMatch(/undefined|error|payments_enabled|api/i);
    }
  });
  it("tells customers nothing was charged when payments are off", () => {
    expect(closedMessage("payments_disabled", "x@y.z")).toMatch(/Nothing has been charged/);
  });
});
