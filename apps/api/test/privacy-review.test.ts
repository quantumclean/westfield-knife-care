import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerHashOf, type AnalyticsEvent, type Order } from "@wkc/shared";
import { handlePagesApi } from "../src/cloudflare.ts";
import { D1Repository } from "../src/repo/d1.ts";
import { MemoryRepository } from "../src/repo/memory.ts";
import { canonicalReport } from "../src/repo/analytics-report.ts";
import { buildInsights } from "../src/services/insights.ts";
import { buildSummary } from "../src/services/summary.ts";
import cleanup from "../../../workers/cleanup/src/index.ts";
import { sqliteD1 } from "./sqlite-d1.ts";
import { json, makeDeps, validOrder } from "./helpers.ts";

const uuid = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
const key = "k".repeat(43);
const event = (i: number, overrides = {}) => ({
  v: 2,
  event_id: uuid(i),
  view_id: uuid(1),
  visitor_id: uuid(2),
  owner: "f".repeat(64),
  experiment_id: "experiment-001",
  source: "flyer-a",
  acquisition_channel: "print",
  route: "/a",
  device: "mobile",
  viewport: "xs",
  name: "page_view",
  props: {},
  ...overrides,
});
const stored = (i: number, overrides = {}): AnalyticsEvent => {
  const e = event(i);
  return {
    ...e,
    id: `ev-${e.event_id}`,
    created_at: new Date().toISOString(),
    page: e.route,
    offer_version: "offer-001",
    price_version: "price-001",
    ...overrides,
  } as AnalyticsEvent;
};
function rawEvent(db: ReturnType<typeof sqliteD1>, e: AnalyticsEvent) {
  db.raw
    .prepare(
      "INSERT INTO analytics_events(id,created_at,experiment_id,expires_at,data) VALUES (?,?,?,?,?)",
    )
    .run(
      e.id,
      e.created_at,
      e.experiment_id,
      Math.floor(Date.now() / 1000) + 86400,
      JSON.stringify(e),
    );
}

describe("privacy review: API and real D1 regressions", () => {
  it.each(["alice@example.test", "1-main-st-07090", "alice-lovelace"])(
    "rejects identifying visitor id %s without reflecting it",
    async (visitor_id) => {
      const { app, deps } = makeDeps();
      const res = await app.request("/api/events", json("POST", event(10, { visitor_id })));
      expect(res.status).toBe(400);
      expect(await res.text()).not.toContain(visitor_id);
      expect(await deps.repo.listEvents()).toHaveLength(0);
    },
  );
  it("canonicalizes names, ZIPs and addresses in source tags and rejects unknown experiments", async () => {
    const { app, deps } = makeDeps();
    for (const [i, source] of ["alice-lovelace", "1-main-st-07090", "07090"].entries()) {
      expect(
        (
          await app.request(
            "/api/events",
            json("POST", event(20 + i, { view_id: uuid(20 + i), source })),
          )
        ).status,
      ).toBe(204);
    }
    expect((await deps.repo.listEvents()).every((e) => e.source === "other")).toBe(true);
    expect(
      (
        await app.request(
          "/api/events",
          json("POST", event(25, { experiment_id: "experiment-999999" })),
        )
      ).status,
    ).toBe(400);
  });
  it("rejects multi-visitor and multi-view batches instead of accepting invented cohorts in one request", async () => {
    const { app, deps } = makeDeps();
    for (const second of [
      event(31, { visitor_id: uuid(99) }),
      event(31, { view_id: uuid(99) }),
      event(31, { owner: "0".repeat(64) }),
    ]) {
      expect(
        (await app.request("/api/events", json("POST", { events: [event(30), second] }))).status,
      ).toBe(400);
    }
    expect(await deps.repo.listEvents()).toHaveLength(0);
  });
  it("enforces the 80-event view budget and binds view identity atomically in D1", async () => {
    const repo = new D1Repository(sqliteD1());
    await repo.putEvents(Array.from({ length: 100 }, (_, i) => stored(i + 100)));
    expect(await repo.listEvents()).toHaveLength(80);
    await repo.putEvents([
      stored(201, { visitor_id: uuid(99) }),
      stored(202, { owner: "0".repeat(64) }),
    ]);
    expect(await repo.listEvents()).toHaveLength(80);
    // Same IP is irrelevant to this per-view protection; independent customers have independent budgets.
    await repo.putEvents([stored(203, { view_id: uuid(99), visitor_id: uuid(99) })]);
    expect(await repo.listEvents()).toHaveLength(81);
  });
  it("prevents late owned events from resurrecting a deleted identity; wrong proofs do not erase victims", async () => {
    for (const repo of [new D1Repository(sqliteD1()), new MemoryRepository()]) {
      const owner = await ownerHashOf(key);
      await repo.putEvents([stored(300, { owner })]);
      expect(await repo.deleteVisitorEvents(uuid(2), "0".repeat(64))).toBe(0);
      expect(await repo.listEvents()).toHaveLength(1);
      expect(await repo.deleteVisitorEvents(uuid(2), owner)).toBe(1);
      await repo.putEvents([stored(301, { owner }), stored(302, { owner, view_id: uuid(302) })]);
      expect(await repo.listEvents()).toHaveLength(0);
    }
  });
  it("bounds historical high-cardinality tags before aggregation and never exports raw keys", async () => {
    const db = sqliteD1();
    const repo = new D1Repository(db);
    for (let i = 0; i < 200; i++)
      rawEvent(
        db,
        stored(400 + i, {
          visitor_id: uuid(400 + i),
          view_id: uuid(400 + i),
          source: `alice-main-st-${i}`,
          experiment_id: i < 100 ? "experiment-001" : `experiment-${i}`,
          props: {},
        }),
      );
    rawEvent(
      db,
      stored(700, { name: "client_error", props: { area: "alice@example.test", kind: "error" } }),
    );
    const report = await repo.analyticsReport();
    expect(report.events_read).toBe(201);
    expect(report.steps.length).toBeLessThanOrEqual(3);
    expect(JSON.stringify(report)).not.toMatch(/alice|main-st|experiment-199/);
    const output = await buildInsights(makeDeps({ repo }).deps, {}, 5);
    expect(output.notes.join(" ")).toContain("untrusted");
    expect(JSON.stringify(output)).not.toMatch(/alice|main-st/);
  });
  it("uses complete windowed order/waitlist totals beyond 5,000 records and sanitizes paid source keys", async () => {
    const db = sqliteD1();
    const repo = new D1Repository(db);
    const { deps } = makeDeps({ repo });
    const window = { since: "2026-09-24T00:00:00.000Z", until: "2026-09-25T00:00:00.000Z" };
    const insert = db.raw.prepare(
      "INSERT INTO orders(id,created_at,updated_at,customer_email,experiment_id,data) VALUES(?,?,?,?,?,?)",
    );
    const wait = db.raw.prepare("INSERT INTO waitlist(id,created_at,email,data) VALUES(?,?,?,?)");
    db.raw.exec("BEGIN");
    for (let i = 0; i < 5002; i++) {
      const at = i === 0 ? "2026-09-24T15:00:00.000Z" : "2026-09-25T15:00:00.000Z";
      const order = {
        ...validOrder,
        id: `order-${i}`,
        created_at: at,
        updated_at: at,
        quote: { total_cents: 3900 },
        payment_status: "paid",
        source: "9085550123",
        repeat_intent: "unknown",
        is_repeat_customer: false,
        actual_repeat_purchase: false,
      } as unknown as Order;
      insert.run(
        order.id,
        at,
        at,
        "synthetic@example.test",
        order.experiment_id,
        JSON.stringify(order),
      );
      wait.run(
        `wait-${i}`,
        at,
        "synthetic@example.test",
        JSON.stringify({ id: `wait-${i}`, created_at: at, experiment_id: "experiment-001" }),
      );
    }
    db.raw.exec("COMMIT");
    const report = await buildInsights(deps, window, 5);
    expect(report.arms[0]!.outcomes).toMatchObject({
      orders_created: 1,
      orders_paid: 1,
      revenue_cents: 3900,
      waitlist_signups: 1,
    });
    expect(report.arms[0]!.by_source[0]!.key).toBe("other");
    expect(JSON.stringify(report)).not.toContain("9085550123");
    const summary = await buildSummary(deps, window.since);
    expect(summary.experiments[0]!.orders_paid).toBe(5002);
    expect(summary.experiments[0]!.waitlist_signups).toBe(5002);
  });
  it("uses one first page view in the same arm/window before order creation for every paid dimension", async () => {
    const db = sqliteD1();
    const repo = new D1Repository(db);
    const memory = new MemoryRepository();
    const since = new Date(Date.now() - 86400).toISOString();
    const until = new Date(Date.now() + 86400).toISOString();
    const at = new Date(Date.now() - 1000).toISOString();
    const events = [
      stored(800, {
        created_at: new Date(Date.now() - 2 * 86400).toISOString(),
        device: "desktop",
        viewport: "lg",
      }),
      stored(801, {
        created_at: new Date(Date.now() - 2000).toISOString(),
        device: "mobile",
        viewport: "xs",
        source: "flyer-a",
      }),
      stored(802, {
        created_at: new Date(Date.now() + 1000).toISOString(),
        device: "tablet",
        viewport: "lg",
        source: "flyer-b",
      }),
      stored(803, {
        created_at: new Date(Date.now() - 3000).toISOString(),
        experiment_id: "experiment-002",
        device: "desktop",
        viewport: "md",
      }),
    ];
    // Each visit has its own view, as in production.
    for (const e of events) e.view_id = e.id;
    await repo.putEvents(events);
    await memory.putEvents(events);
    const order = {
      ...validOrder,
      id: "order-profile",
      created_at: at,
      updated_at: at,
      visitor_id: uuid(2),
      quote: { total_cents: 3900 },
      payment_status: "paid",
      repeat_intent: "unknown",
    } as unknown as Order;
    await repo.putOrder({ ...order });
    await memory.putOrder({ ...order });
    const window = { since, until };
    const commerce = await repo.commerceReport(window);
    expect(commerce).toEqual(await memory.commerceReport(window));
    expect(commerce[0]!.by_device).toEqual({ mobile: 1 });
    expect(commerce[0]!.by_viewport).toEqual({ xs: 1 });
    expect(canonicalReport(await repo.analyticsReport(window))).toEqual(
      canonicalReport(await memory.analyticsReport(window)),
    );
    const step = (await repo.analyticsReport(window)).steps.find(
      (s) => s.experiment_id === "experiment-001",
    )!;
    expect([step.device, step.viewport, step.source]).toEqual(["mobile", "xs", "flyer-a"]);
  });
  it("counts batch units for rate exhaustion and allows independent customers on a shared IP", async () => {
    const env = { DB: sqliteD1(), STAGE: "staging", RATE_LIMIT_SALT: "synthetic-salt" };
    const send = (view: number) =>
      handlePagesApi(
        new Request("https://preview.example.test/api/events", {
          method: "POST",
          headers: { "content-type": "application/json", "CF-Connecting-IP": "192.0.2.10" },
          body: JSON.stringify({
            events: Array.from({ length: 20 }, (_, i) =>
              event(view * 20 + i, { view_id: uuid(view + 2000), visitor_id: uuid(view + 3000) }),
            ),
          }),
        }),
        env,
      );
    for (let i = 0; i < 60; i++) expect((await send(i)).status).toBe(204);
    expect((await send(61)).status).toBe(429);
    expect((await send(62)).headers.get("Retry-After")).toBe("60");
  });
  it("migration 0005 is idempotent and scheduled cleanup physically removes expired events, proofs and counters", async () => {
    const db = sqliteD1();
    db.raw.exec(
      readFileSync(
        new URL("../../../migrations/0005_analytics_abuse.sql", import.meta.url),
        "utf8",
      ),
    );
    rawEvent(db, stored(900));
    db.raw.exec("UPDATE analytics_events SET expires_at=0");
    db.raw.exec(
      "INSERT INTO analytics_deletions VALUES ('synthetic','hash',0); INSERT INTO api_rate_limits VALUES ('synthetic',1,0)",
    );
    await cleanup.scheduled({}, { DB: db });
    for (const table of ["analytics_events", "analytics_deletions", "api_rate_limits"])
      expect((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(
        0,
      );
  });
});
