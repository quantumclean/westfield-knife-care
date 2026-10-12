import { describe, expect, it } from "vitest";
import type { AnalyticsEvent } from "@wkc/shared";
import { canonicalReport } from "../src/repo/analytics-report.ts";
import { D1Repository } from "../src/repo/d1.ts";
import { MemoryRepository } from "../src/repo/memory.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

/** Deterministic pseudo-random generator so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

const NAMES: [string, () => Record<string, string | number>][] = [
  ["page_view", () => ({})],
  ["cta_click", () => ({ cta: "sharpen", location: "hero" })],
  ["booking_opened", () => ({ location: "hero" })],
  ["booking_step", () => ({ step: "details" })],
  ["booking_submitted", () => ({ knives: 4, total_cents: 3900 })],
  ["checkout_started", () => ({ total_cents: 3900 })],
  ["section_view", () => ({ section: "pricing" })],
  ["scroll_depth", () => ({ percent: 50 })],
  ["page_engagement", () => ({ time: "10-30s", max_scroll: 50 })],
  ["address_suggest", () => ({ action: "chosen" })],
  [
    "form_error",
    () => ({ form: "booking", fields: "email,zip", kinds: "format,missing", count: 2 }),
  ],
  ["client_error", () => ({ kind: "api", area: "booking", status: "5xx" })],
  ["web_vitals", () => ({ lcp: "good", cls: "poor" })],
  ["pilot_opened", () => ({ location: "out-of-area" })],
];

function dataset(count: number, visitors: number, seed = 7): AnalyticsEvent[] {
  const random = rng(seed);
  const start = Date.now() - 20 * 86_400_000;
  return Array.from({ length: count }, (_, i) => {
    const v = Math.floor(random() * visitors);
    const [name, props] = NAMES[Math.floor(random() * NAMES.length)]!;
    const mobile = v % 3 !== 0;
    const thanks = name === "page_view" && v % 7 === 0;
    return {
      id: `ev-${String(i).padStart(7, "0")}`,
      created_at: new Date(start + Math.floor(random() * 19 * 86_400_000)).toISOString(),
      name,
      visitor_id: `00000000-0000-4000-8000-${String(v).padStart(12, "0")}`,
      experiment_id: v % 2 ? "experiment-001" : "experiment-002",
      offer_version: "x",
      price_version: "x",
      source: v % 5 === 0 ? "instagram" : v % 2 ? "flyer-a" : "flyer-b",
      acquisition_channel: v % 5 === 0 ? "social" : "print",
      // Some page views are of the thank-you page, which never makes a visitor.
      page: thanks ? "/thanks" : v % 2 ? "/a" : "/b",
      props: props(),
      v: 2,
      // The thank-you page is its own page load, as in production.
      view_id: thanks ? `thanks-${v}` : `view-${v}-${Math.floor(random() * 3)}`,
      device: mobile ? "mobile" : "desktop",
      viewport: mobile ? "xs" : "lg",
    } as AnalyticsEvent;
  });
}

async function loadD1(events: AnalyticsEvent[]) {
  const db = sqliteD1();
  const insert = db.raw.prepare(
    "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) VALUES (?, ?, ?, ?, ?)",
  );
  db.raw.exec("BEGIN");
  for (const e of events)
    insert.run(
      e.id,
      e.created_at,
      e.experiment_id,
      Math.floor(Date.now() / 1000) + 86_400 * 80,
      JSON.stringify(e),
    );
  db.raw.exec("COMMIT");
  return { db, repo: new D1Repository(db) };
}

describe("analytics aggregates: D1 SQL matches the reference implementation", () => {
  it("agrees on every aggregate for a mixed dataset, with and without a window", async () => {
    const events = dataset(4000, 300);
    const memory = new MemoryRepository();
    await memory.putEvents(events);
    const { repo } = await loadD1(events);
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
  });
});

describe("analytics aggregates at scale", () => {
  it("summarises 200,000 events into a small, bounded result", async () => {
    const events = dataset(200_000, 20_000, 11);
    const { db, repo } = await loadD1(events);
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
    console.info(`analyticsReport over 200k events: ${Math.round(ms)} ms, ${rows} aggregate rows`);
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
  }, 120_000);
});
