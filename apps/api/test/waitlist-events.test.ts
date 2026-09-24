import { describe, expect, it } from "vitest";
import { ADMIN_KEY, WEBHOOK_SECRET, json, makeDeps, readJson, validOrder } from "./helpers.ts";

const admin = { headers: { "x-admin-key": ADMIN_KEY } };

describe("POST /api/waitlist", () => {
  it("stores a pilot signup with its experiment context", async () => {
    const { app, deps } = makeDeps();
    const res = await app.request(
      "/api/waitlist",
      json("POST", {
        experiment_id: "experiment-002",
        source: "nextdoor-post-1",
        acquisition_channel: "social",
        visitor_id: "visitor-00000002",
        name: "Grace Hopper",
        email: "Grace@Example.com",
        service_interest: "always_sharp",
        cadence: "biweekly",
        notes: "Two chef knives and a bread knife.",
      }),
    );
    expect(res.status).toBe(201);
    const entries = await deps.repo.listWaitlist();
    expect(entries[0]).toMatchObject({
      email: "grace@example.com",
      experiment_id: "experiment-002",
      offer_version: "offer-002",
      price_version: "price-002",
      cadence: "biweekly",
      acquisition_channel: "social",
    });
  });

  it("validates input", async () => {
    const { app } = makeDeps();
    const res = await app.request("/api/waitlist", json("POST", { name: "x" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/events and GET /api/admin/summary", () => {
  it("builds a per-experiment funnel from events and orders", async () => {
    const { app } = makeDeps();
    const send = (name: string, visitor: string, experiment = "experiment-001", extra = {}) =>
      app.request(
        "/api/events",
        json("POST", {
          name,
          visitor_id: visitor,
          experiment_id: experiment,
          source: "flyer-v1-qr",
          acquisition_channel: "print",
          ...extra,
        }),
      );

    for (const v of ["visitor-0000000a", "visitor-0000000b", "visitor-0000000c"]) {
      expect((await send("page_view", v)).status).toBe(204);
    }
    await send("page_view", "visitor-0000000a"); // second view, same visitor
    await send("cta_click", "visitor-0000000a", "experiment-001", {
      props: { cta: "sharpen", location: "hero" },
    });
    await send("checkout_started", "visitor-0000000a");
    await send("page_view", "visitor-0000000d", "experiment-002", {
      acquisition_channel: "social",
      source: "instagram",
    });

    const created = await readJson(
      await app.request(
        "/api/orders",
        json("POST", { ...validOrder, visitor_id: "visitor-0000000a" }),
      ),
    );
    await app.request(
      "/api/webhooks/stripe",
      json(
        "POST",
        { type: "checkout_completed", order_id: created.order_id, checkout_session_id: "cs_1" },
        { "stripe-signature": WEBHOOK_SECRET },
      ),
    );
    await app.request(
      "/api/orders",
      json("POST", { ...validOrder, experiment_id: "experiment-002" }),
    );

    const res = await app.request("/api/admin/summary", admin);
    expect(res.status).toBe(200);
    const summary = await readJson(res);
    const one = summary.experiments.find(
      (e: { experiment_id: string }) => e.experiment_id === "experiment-001",
    );
    const two = summary.experiments.find(
      (e: { experiment_id: string }) => e.experiment_id === "experiment-002",
    );

    expect(one.funnel.page_view).toBe(3);
    expect(one.funnel.cta_click).toBe(1);
    expect(one.funnel.checkout_started).toBe(1);
    expect(one.orders_created).toBe(1);
    expect(one.orders_paid).toBe(1);
    expect(one.revenue_cents).toBe(3900);
    expect(one.visitor_to_paid_rate).toBeCloseTo(1 / 3, 3);
    expect(one.by_channel.print).toEqual({ views: 3, paid: 1, revenue_cents: 3900 });

    expect(two.funnel.page_view).toBe(1);
    expect(two.orders_created).toBe(1);
    expect(two.orders_paid).toBe(0);
    expect(two.by_channel.social.views).toBe(1);
  });

  it("rejects malformed events", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/events",
      json("POST", { name: "Page View", experiment_id: "experiment-001" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/config", () => {
  it("returns active experiments and care days", async () => {
    const { app } = makeDeps();
    const body = await readJson(await app.request("/api/config"));
    expect(body.experiments.map((e: { id: string }) => e.id)).toEqual([
      "experiment-001",
      "experiment-002",
    ]);
    expect(body.care_days[0]).toBe("2026-09-26");
    expect(body.payments_enabled).toBe(false);
  });
});
