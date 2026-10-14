import { describe, expect, it } from "vitest";
import { canonicalReport } from "../src/repo/analytics-report.ts";
import { MemoryRepository } from "../src/repo/memory.ts";
import { dataset, loadD1 } from "./analytics-report-fixtures.ts";

describe("analytics aggregates: D1 SQL matches the reference implementation", () => {
  it("agrees on every aggregate for a mixed dataset, with and without a window", async () => {
    const events = dataset(4000, 300);
    const memory = new MemoryRepository();
    await memory.putEvents(events);
    const { db, repo } = await loadD1(events);
    try {
      expect(canonicalReport(await repo.analyticsReport())).toEqual(
        canonicalReport(await memory.analyticsReport()),
      );
      const window = {
        since: new Date(Date.now() - 12 * 86_400_000).toISOString(),
        until: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      };
      expect(canonicalReport(await repo.analyticsReport(window))).toEqual(
        canonicalReport(await memory.analyticsReport(window)),
      );
      const ids = [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000099999999",
      ];
      const sortById = (rows: { visitor_id: string }[]) =>
        [...rows].sort((a, b) => a.visitor_id.localeCompare(b.visitor_id));
      expect(sortById(await repo.visitorProfiles(ids))).toEqual(
        sortById(await memory.visitorProfiles(ids)),
      );
    } finally {
      db.raw.close();
    }
  });
});
