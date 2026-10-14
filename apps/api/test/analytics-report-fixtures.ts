import type { AnalyticsEvent } from "@wkc/shared";
import { D1Repository } from "../src/repo/d1.ts";
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

export function dataset(count: number, visitors: number, seed = 7): AnalyticsEvent[] {
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

export async function loadD1(events: AnalyticsEvent[]) {
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
