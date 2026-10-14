import { describe, expect, it } from "vitest";
import { dataset, loadD1 } from "./analytics-report-fixtures.ts";

describe("analytics aggregates at scale", () => {
  it("summarises 200,000 events into a small, bounded result", async () => {
    const events = dataset(200_000, 20_000, 11);
    const { db, repo } = await loadD1(events);
    try {
      const started = performance.now();
      const report = await repo.analyticsReport();
      const ms = performance.now() - started;
      expect(report.events_read).toBe(200_000);
      const rows =
        report.steps.length +
        report.props.length +
        report.names.length +
        report.views.length +
        report.form_errors.length;
      // Bounded by arms × devices × viewports × channels × sources and the allowlisted enums,
      // not by the number of events or visitors.
      expect(report.steps.length).toBeLessThanOrEqual(2 * 2 * 2 * 2 * 3);
      expect(rows).toBeLessThan(200);
      expect(report.steps.reduce((n, r) => n + r.visited, 0)).toBeLessThanOrEqual(20_000);
      // Hourly new-visitor rows: at most arms × hours in the window, never per visitor.
      expect(report.hours.length).toBeLessThanOrEqual(2 * 24 * 20);
      console.info(
        `analyticsReport over 200k events: ${Math.round(ms)} ms, ${rows} aggregate rows`,
      );
      expect(ms).toBeLessThan(30_000);

      // Deletion and the paid-order join use the visitor index rather than scanning.
      const plan = db.raw
        .prepare(
          "EXPLAIN QUERY PLAN SELECT 1 FROM analytics_events WHERE json_extract(data, '$.visitor_id') = ?",
        )
        .all("00000000-0000-4000-8000-000000000001") as { detail: string }[];
      expect(plan.map((p) => p.detail).join(" ")).toContain("events_visitor_idx");
      const profiled = performance.now();
      const ids = Array.from(
        { length: 500 },
        (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      );
      expect((await repo.visitorProfiles(ids)).length).toBeGreaterThan(0);
      expect(performance.now() - profiled).toBeLessThan(5_000);
    } finally {
      db.raw.close();
    }
  }, 120_000);
});
