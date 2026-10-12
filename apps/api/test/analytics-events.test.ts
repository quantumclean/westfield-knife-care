import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { LEGACY_V1_ACCEPTED_UNTIL, ownerHashOf, type AnalyticsEvent } from "@wkc/shared";
import { handlePagesApi } from "../src/cloudflare.ts";
import { D1Repository } from "../src/repo/d1.ts";
import { BODY_LIMITS } from "../src/services/request-body.ts";
import cleanup from "../../../workers/cleanup/src/index.ts";
import { ADMIN_KEY, json, makeDeps, readJson } from "./helpers.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function event(name: string, props: Record<string, unknown> = {}, overrides = {}) {
  return {
    v: 2,
    owner: "f".repeat(64),
    event_id: uuid(),
    view_id: "11111111-2222-4333-8444-555555555555",
    experiment_id: "experiment-001",
    source: "flyer-a",
    acquisition_channel: "print",
    visitor_id: "00000000-0000-4000-8000-00000000000a",
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
      owner: "f".repeat(64),
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
        { ...event("page_view"), visitor_id: "00000000-0000-4000-8000-00000000000a", email: value },
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
        visitor_id: "00000000-0000-4000-8000-00000000000b",
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

  it("stops accepting v1 bodies (no deletion proof) after the legacy window", async () => {
    const { app, deps, clock } = makeDeps();
    clock.now = new Date(LEGACY_V1_ACCEPTED_UNTIL);
    const res = await app.request(
      "/api/events",
      json("POST", {
        experiment_id: "experiment-002",
        visitor_id: "00000000-0000-4000-8000-00000000000c",
        name: "page_view",
        page: "/b",
      }),
    );
    expect(res.status).toBe(400);
    expect(await deps.repo.listEvents()).toHaveLength(0);
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

describe("POST /api/events/forget (proof of possession)", () => {
  const VICTIM_KEY = "v".repeat(43);
  const ATTACKER_KEY = "a".repeat(43);

  async function seed(app: ReturnType<typeof makeDeps>["app"]) {
    const victim = await ownerHashOf(VICTIM_KEY);
    const attacker = await ownerHashOf(ATTACKER_KEY);
    for (const body of [
      event("page_view", {}, { owner: victim }),
      event("cta_click", { cta: "sharpen", location: "hero" }, { owner: victim }),
      event("page_view", {}, { owner: attacker, view_id: uuid() }),
      event(
        "page_view",
        {},
        { visitor_id: "00000000-0000-4000-8000-00000000000f", owner: victim, view_id: uuid() },
      ),
    ])
      expect((await app.request("/api/events", json("POST", body))).status).toBe(204);
    return { victim, attacker };
  }

  it("erases only events whose owner matches the presented key, for that visitor", async () => {
    const { app, deps } = makeDeps();
    const { victim, attacker } = await seed(app);
    const res = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "00000000-0000-4000-8000-00000000000a", key: VICTIM_KEY }),
    );
    expect(res.status).toBe(204);
    const left = await deps.repo.listEvents();
    expect(left.map((e) => [e.visitor_id, e.owner])).toEqual(
      expect.arrayContaining([
        ["00000000-0000-4000-8000-00000000000a", attacker],
        ["00000000-0000-4000-8000-00000000000f", victim],
      ]),
    );
    expect(left).toHaveLength(2);
  });

  it("a visitor id alone authorises nothing", async () => {
    const { app, deps } = makeDeps();
    await seed(app);
    const res = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "00000000-0000-4000-8000-00000000000a" }),
    );
    expect(res.status).toBe(400);
    expect(await deps.repo.listEvents()).toHaveLength(4);
  });

  it("someone else's key deletes nothing of the victim's, and the response does not tell", async () => {
    const { app, deps } = makeDeps();
    const { victim } = await seed(app);
    const res = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "00000000-0000-4000-8000-00000000000a", key: ATTACKER_KEY }),
    );
    expect(res.status).toBe(204);
    const left = await deps.repo.listEvents();
    expect(left.filter((e) => e.owner === victim)).toHaveLength(3);
    const wrong = await app.request(
      "/api/events/forget",
      json("POST", { visitor_id: "00000000-0000-4000-8000-00000000000a", key: "x".repeat(43) }),
    );
    expect(wrong.status).toBe(204);
  });

  it("rejects malformed keys and extra fields", async () => {
    const { app } = makeDeps();
    for (const body of [
      { visitor_id: "00000000-0000-4000-8000-00000000000a", key: "short" },
      {
        visitor_id: "00000000-0000-4000-8000-00000000000a",
        key: "v".repeat(43),
        email: "ada@example.com",
      },
    ]) {
      expect((await app.request("/api/events/forget", json("POST", body))).status).toBe(400);
    }
  });

  it("does not store or echo the key, only its hash", async () => {
    const { app, deps } = makeDeps();
    await seed(app);
    expect(JSON.stringify(await deps.repo.listEvents())).not.toContain(VICTIM_KEY);
    const bad = await app.request(
      "/api/events",
      json("POST", event("page_view", {}, { owner: VICTIM_KEY })),
    );
    expect(bad.status).toBe(400);
  });
});

describe("D1 analytics storage (SQLite with the real migrations)", () => {
  const stored = (
    id: string,
    created_at: string,
    visitor = "00000000-0000-4000-8000-00000000000a",
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

  it("pages the raw export with a cursor, including ties on created_at", async () => {
    const repo = new D1Repository(sqliteD1());
    const now = Date.now();
    const events = Array.from({ length: 12_345 }, (_, i) =>
      stored(
        `ev-${String(i).padStart(6, "0")}`,
        new Date(now - Math.floor(i / 3) * 1000).toISOString(),
      ),
    );
    for (let i = 0; i < events.length; i += 1000) await repo.putEvents(events.slice(i, i + 1000));
    const seen = new Set<string>();
    let before: { created_at: string; id: string } | undefined;
    for (;;) {
      const page = await repo.listEvents({ before, limit: 5000 });
      expect(page.length).toBeLessThanOrEqual(5000);
      for (const e of page) seen.add(e.id);
      const last = page.at(-1);
      if (!last) break;
      before = { created_at: last.created_at, id: last.id };
    }
    expect(seen.size).toBe(12_345);
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
    const owner = "f".repeat(64);
    await repo.putEvents([
      { ...stored("ev-1", now), owner },
      { ...stored("ev-2", now, "00000000-0000-4000-8000-00000000000f"), owner },
      { ...stored("ev-3", now), owner: "0".repeat(64) },
      stored("ev-4", now),
    ]);
    expect(await repo.deleteVisitorEvents("00000000-0000-4000-8000-00000000000a", owner)).toBe(1);
    expect((await repo.listEvents()).map((e) => e.id).sort()).toEqual(["ev-2", "ev-3", "ev-4"]);
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

  it("migration 0003 keeps a row with an unparseable created_at instead of failing", () => {
    const db = sqliteD1("0002_rate_limits.sql");
    const insert = db.raw.prepare(
      "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run("ev-bad", "not a date", "experiment-001", 1_900_000_000, "{}");
    insert.run("ev-good", "2026-09-24T15:00:00.000Z", "experiment-001", 1_900_000_000, "{}");
    const migration = new URL("../../../migrations/0003_analytics_retention.sql", import.meta.url);
    db.raw.exec(readFileSync(migration, "utf8"));
    const rows = db.raw
      .prepare("SELECT id, expires_at FROM analytics_events ORDER BY id")
      .all() as { id: string; expires_at: number }[];
    expect(rows).toEqual([
      { id: "ev-bad", expires_at: 1_900_000_000 },
      {
        id: "ev-good",
        expires_at: Math.floor(Date.parse("2026-09-24T15:00:00.000Z") / 1000) + 90 * 86_400,
      },
    ]);
  });
});

describe("scheduled cleanup", () => {
  it("still cleans the other tables when one is missing, and reports the failure", async () => {
    const db = sqliteD1("0004_analytics_visitor_index.sql"); // before 0005: no tombstone table
    db.raw.exec(
      "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) VALUES ('ev-old', '2026-01-01T00:00:00Z', 'experiment-001', 0, '{}');" +
        "INSERT INTO api_rate_limits VALUES ('bucket', 1, 0);",
    );
    await expect(cleanup.scheduled({}, { DB: db })).rejects.toThrow(/analytics_deletions/);
    for (const table of ["analytics_events", "api_rate_limits"])
      expect((db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(
        0,
      );
  });
});

describe("GET /api/admin/summary", () => {
  it("rejects an unparseable since instead of comparing it as text", async () => {
    const { app } = makeDeps();
    const admin = { headers: { "x-admin-key": ADMIN_KEY } };
    expect((await app.request("/api/admin/summary?since=yesterday", admin)).status).toBe(400);
    expect((await app.request("/api/admin/summary?since=2026-10-01", admin)).status).toBe(200);
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
          body: JSON.stringify({
            visitor_id: "00000000-0000-4000-8000-00000000000a",
            key: "v".repeat(43),
          }),
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
