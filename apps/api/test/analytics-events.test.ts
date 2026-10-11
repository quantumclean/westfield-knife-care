import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsEvent } from "@wkc/shared";
import { handlePagesApi } from "../src/cloudflare.ts";
import { D1Repository } from "../src/repo/d1.ts";
import { BODY_LIMITS } from "../src/services/request-body.ts";
import { readEvents } from "../src/services/event-reader.ts";
import { json, makeDeps, readJson } from "./helpers.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function event(name: string, props: Record<string, unknown> = {}, overrides = {}) {
  return {
    v: 2,
    event_id: uuid(),
    view_id: "11111111-2222-4333-8444-555555555555",
    experiment_id: "experiment-001",
    source: "flyer-a",
    acquisition_channel: "print",
    visitor_id: "visitor-0000000a",
    route: "/a",
    device: "mobile",
    viewport: "xs",
    name,
    props,
    ...overrides,
  };
}

const PERSONAL = ["ada@example.com", "Ada Lovelace", "908-555-0123", "1 Main St 07090"];

describe("POST /api/events (schema v2)", () => {
  it("stores a batch with coarse context and nothing else", async () => {
    const { app, deps } = makeDeps();
    const res = await app.request(
      "/api/events",
      json("POST", {
        events: [
          event("page_view"),
          event("scroll_depth", { percent: 50 }),
          event("booking_step", { step: "details" }, { device: "desktop", viewport: "lg" }),
        ],
      }),
    );
    expect(res.status).toBe(204);
    const stored = await deps.repo.listEvents();
    expect(stored).toHaveLength(3);
    expect(stored.find((e) => e.name === "page_view")).toMatchObject({
      experiment_id: "experiment-001",
      offer_version: "offer-001",
      price_version: "price-001",
      page: "/a",
      device: "mobile",
      viewport: "xs",
      v: 2,
      props: {},
    });
  });

  it.each(PERSONAL)(
    "rejects personal data (%s) without echoing it or storing anything",
    async (value) => {
      const { app, deps } = makeDeps();
      for (const body of [
        event("form_error", { form: "booking", fields: value }),
        event("cta_click", { cta: "sharpen", location: "hero", note: value }),
        { ...event("page_view"), page_location: `https://x.test/?q=${value}` },
        { ...event("page_view"), visitor_id: "visitor-0000000a", email: value },
      ]) {
        const res = await app.request("/api/events", json("POST", { events: [body] }));
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toBe('{"error":"invalid_event"}');
      }
      expect(await deps.repo.listEvents()).toHaveLength(0);
    },
  );

  it("rejects unknown event names", async () => {
    const { app } = makeDeps();
    const res = await app.request("/api/events", json("POST", event("typed_value")));
    expect(res.status).toBe(400);
  });

  it("stores a retried event once", async () => {
    const { app, deps } = makeDeps();
    const once = event("checkout_started", { total_cents: 3900 });
    for (let i = 0; i < 3; i++) {
      expect((await app.request("/api/events", json("POST", { events: [once] }))).status).toBe(204);
    }
    expect(await deps.repo.listEvents()).toHaveLength(1);
  });

  it("keeps an identifying source tag out of storage", async () => {
    const { app, deps } = makeDeps();
    await app.request(
      "/api/events",
      json("POST", event("page_view", {}, { source: "9085550123" })),
    );
    expect((await deps.repo.listEvents())[0]!.source).toBe("other");
  });

  it("accepts a v1 event from an old tab, minus the order id", async () => {
    const { app, deps } = makeDeps();
    const res = await app.request(
      "/api/events",
      json("POST", {
        experiment_id: "experiment-002",
        visitor_id: "visitor-0000000b",
        name: "checkout_started",
        page: "/b",
        props: { order_id: "order-abc-123", total_cents: 4900 },
      }),
    );
    expect(res.status).toBe(204);
    const [stored] = await deps.repo.listEvents();
    expect(stored).toMatchObject({ page: "/b", device: "unknown", props: { total_cents: 4900 } });
    expect(JSON.stringify(stored)).not.toContain("order-abc-123");
  });

  it("never logs event bodies", async () => {
    const log = vi.fn();
    const { app } = makeDeps({ log });
    await app.request(
      "/api/events",
      json("POST", event("form_error", { form: "booking", fields: "ada@example.com" })),
    );
    await app.request("/api/events", json("POST", event("page_view")));
    expect(log).not.toHaveBeenCalled();
  });

  it("fits a full batch inside the body limit", () => {
    const events = Array.from({ length: 20 }, () =>
      event("form_error", {
        form: "booking",
        fields: "city,email,line1,name,phone,state,zip",
        kinds: "format,missing",
        count: 7,
      }),
    );
    expect(JSON.stringify({ events }).length).toBeLessThan(BODY_LIMITS.event);
  });
});

describe("POST /api/events/forget", () => {
  it("erases only the requesting visitor's events", async () => {
    const { app, deps } = makeDeps();
    await app.request(
      "/api/events",
      json("POST", {
        events: [
          event("page_view"),
          event("page_view", {}, { visitor_id: "visitor-0000000z", view_id: uuid() }),
        ],
      }),
    );
    const res = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "visitor-0000000a" }),
    );
    expect(res.status).toBe(204);
    expect((await deps.repo.listEvents()).map((e) => e.visitor_id)).toEqual(["visitor-0000000z"]);
  });

  it("rejects anything but a visitor id", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "visitor-0000000a", email: "ada@example.com" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("D1 analytics storage (SQLite with the real migrations)", () => {
  const stored = (
    id: string,
    created_at: string,
    visitor = "visitor-0000000a",
  ): AnalyticsEvent => ({
    id,
    created_at,
    name: "page_view",
    visitor_id: visitor,
    experiment_id: "experiment-001",
    offer_version: "offer-001",
    price_version: "price-001",
    source: "flyer-a",
    acquisition_channel: "print",
    page: "/a",
    props: {},
  });

  it("expires events 90 days after they were recorded", async () => {
    const db = sqliteD1();
    const repo = new D1Repository(db);
    const created = new Date().toISOString();
    await repo.putEvents([stored("ev-1", created)]);
    const row = db.raw.prepare("SELECT expires_at FROM analytics_events").get() as {
      expires_at: number;
    };
    expect(row.expires_at - Math.floor(Date.parse(created) / 1000)).toBe(90 * 86_400);
  });

  it("skips duplicate ids inside and across batches", async () => {
    const repo = new D1Repository(sqliteD1());
    const now = new Date().toISOString();
    await repo.putEvents([stored("ev-1", now), stored("ev-1", now)]);
    await repo.putEvents([stored("ev-1", now)]);
    expect(await repo.listEvents()).toHaveLength(1);
  });

  it("pages through every event, including ties on created_at", async () => {
    const repo = new D1Repository(sqliteD1());
    const now = Date.now();
    const events = Array.from({ length: 12_345 }, (_, i) =>
      stored(
        `ev-${String(i).padStart(6, "0")}`,
        new Date(now - Math.floor(i / 3) * 1000).toISOString(),
      ),
    );
    for (let i = 0; i < events.length; i += 1000) await repo.putEvents(events.slice(i, i + 1000));
    const read = await readEvents(repo, {});
    expect(read.truncated).toBe(false);
    expect(new Set(read.events.map((e) => e.id)).size).toBe(12_345);
    const capped = await readEvents(repo, {}, 6000);
    expect(capped).toMatchObject({ truncated: true });
    expect(capped.events).toHaveLength(6000);
  });

  it("filters by window and hides expired rows", async () => {
    const db = sqliteD1();
    const repo = new D1Repository(db);
    const now = Date.now();
    await repo.putEvents([
      stored("ev-new", new Date(now - 1000).toISOString()),
      stored("ev-old", new Date(now - 10 * 86_400_000).toISOString()),
      stored("ev-expired", new Date(now - 91 * 86_400_000).toISOString()),
    ]);
    expect((await repo.listEvents()).map((e) => e.id)).toEqual(["ev-new", "ev-old"]);
    const since = new Date(now - 86_400_000).toISOString();
    expect((await repo.listEvents({ since })).map((e) => e.id)).toEqual(["ev-new"]);
    expect((await repo.listEvents({ until: since })).map((e) => e.id)).toEqual(["ev-old"]);
  });

  it("deletes one visitor's events", async () => {
    const repo = new D1Repository(sqliteD1());
    const now = new Date().toISOString();
    await repo.putEvents([stored("ev-1", now), stored("ev-2", now, "visitor-0000000z")]);
    expect(await repo.deleteVisitorEvents("visitor-0000000a")).toBe(1);
    expect((await repo.listEvents()).map((e) => e.id)).toEqual(["ev-2"]);
  });

  it("migration 0003 brings rows written under the 180-day policy down to 90 days", () => {
    const db = sqliteD1("0002_rate_limits.sql");
    const created = "2026-09-24T15:00:00.000Z";
    const createdSeconds = Math.floor(Date.parse(created) / 1000);
    db.raw
      .prepare(
        "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) VALUES (?, ?, ?, ?, ?)",
      )
      .run("ev-legacy", created, "experiment-001", createdSeconds + 180 * 86_400, "{}");
    const migration = new URL("../../../migrations/0003_analytics_retention.sql", import.meta.url);
    const sql = readFileSync(migration, "utf8");
    db.raw.exec(sql);
    db.raw.exec(sql); // idempotent
    const row = db.raw.prepare("SELECT expires_at FROM analytics_events").get() as {
      expires_at: number;
    };
    expect(row.expires_at).toBe(createdSeconds + 90 * 86_400);
  });
});

describe("Pages protection for the forget endpoint", () => {
  it("allows five erase requests a minute per IP", async () => {
    const env = { DB: sqliteD1(), STAGE: "staging", RATE_LIMIT_SALT: "salt" };
    const call = () =>
      handlePagesApi(
        new Request("https://preview.example.test/api/events/forget", {
          method: "POST",
          headers: { "content-type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
          body: JSON.stringify({ visitor_id: "visitor-0000000a" }),
        }),
        env,
      );
    for (let i = 0; i < 5; i++) expect((await call()).status).toBe(204);
    expect((await call()).status).toBe(429);
  });

  it("stores a batch end to end through the Pages adapter", async () => {
    const db = sqliteD1();
    const res = await handlePagesApi(
      new Request("https://preview.example.test/api/events", {
        method: "POST",
        headers: { "content-type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
        body: JSON.stringify({
          events: [event("page_view"), event("section_view", { section: "pricing" })],
        }),
      }),
      { DB: db, STAGE: "staging", RATE_LIMIT_SALT: "salt" },
    );
    expect(res.status).toBe(204);
    const rows = db.raw.prepare("SELECT data FROM analytics_events").all() as { data: string }[];
    expect(rows).toHaveLength(2);
    expect(await readJson(new Response(rows[0]!.data))).toHaveProperty("view_id");
  });
});
