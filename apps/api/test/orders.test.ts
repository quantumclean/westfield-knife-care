import { describe, expect, it } from "vitest";
import { ADMIN_KEY, WEBHOOK_SECRET, json, makeDeps, readJson, validOrder } from "./helpers.ts";

const webhook = (body: unknown) => json("POST", body, { "stripe-signature": WEBHOOK_SECRET });
const admin = (method: string, body?: unknown) =>
  body === undefined
    ? { method, headers: { "x-admin-key": ADMIN_KEY } }
    : json(method, body, { "x-admin-key": ADMIN_KEY });

describe("POST /api/orders", () => {
  it("creates a pending order priced by the server and returns a checkout url", async () => {
    const { app, deps } = makeDeps();
    const res = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, number_of_knives: 6 }),
    );
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.order_id).toBe("id-0001");
    expect(body.quote.total_cents).toBe(5900);
    expect(body.checkout_url).toContain("/thanks?order=id-0001");

    const order = await deps.repo.getOrder("id-0001");
    expect(order).toMatchObject({
      experiment_id: "experiment-001",
      offer_version: "offer-001",
      price_version: "price-001",
      source: "flyer-v1-qr",
      acquisition_channel: "print",
      number_of_knives: 6,
      care_day: "2026-09-26",
      payment_status: "pending",
      pickup_status: "scheduled",
      return_status: "pending",
      repeat_intent: "unknown",
      is_repeat_customer: false,
      actual_repeat_purchase: false,
      stripe_checkout_session_id: "cs_fake_id-0001",
    });
  });

  it("ignores any price the client sends and uses the experiment's price version", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, experiment_id: "experiment-002", quote: { total_cents: 1 } }),
    );
    const body = await readJson(res);
    expect(body.quote.total_cents).toBe(4900);
    expect(body.experiment_id).toBe("experiment-002");
  });

  it("falls back to the default experiment for unknown ids", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, experiment_id: "experiment-777" }),
    );
    expect(res.status).toBe(201);
    expect((await readJson(res)).experiment_id).toBe("experiment-001");
  });

  it("rejects invalid payloads and unavailable care days with readable issues", async () => {
    const { app } = makeDeps();
    const bad = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, customer: { name: "x" } }),
    );
    expect(bad.status).toBe(400);
    expect((await readJson(bad)).issues.length).toBeGreaterThan(0);

    const badDay = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, care_day: "2026-09-25" }),
    );
    expect(badDay.status).toBe(400);
    expect((await readJson(badDay)).issues[0]).toMatch(/care_day/);

    const tooMany = await app.request(
      "/api/orders",
      json("POST", { ...validOrder, number_of_knives: 13 }),
    );
    expect(tooMany.status).toBe(400);
  });
});

describe("payment webhooks", () => {
  it("marks the order paid exactly once and records repeat purchases", async () => {
    const { app, deps, clock } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    const paid = await app.request(
      "/api/webhooks/stripe",
      webhook({
        type: "checkout_completed",
        order_id: "id-0001",
        checkout_session_id: "cs_1",
        payment_intent_id: "pi_1",
        amount_cents: 3900,
      }),
    );
    expect(paid.status).toBe(200);
    let order = (await deps.repo.getOrder("id-0001"))!;
    expect(order.payment_status).toBe("paid");
    expect(order.paid_at).toBe("2026-09-24T15:00:00.000Z");
    expect(order.stripe_payment_intent_id).toBe("pi_1");

    // Replayed webhook is a no-op.
    clock.now = new Date("2026-09-24T16:00:00Z");
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "id-0001", checkout_session_id: "cs_1" }),
    );
    order = (await deps.repo.getOrder("id-0001"))!;
    expect(order.paid_at).toBe("2026-09-24T15:00:00.000Z");

    // Same customer orders again two weeks later.
    clock.now = new Date("2026-10-08T15:00:00Z");
    const second = await app.request(
      "/api/orders",
      json("POST", {
        ...validOrder,
        care_day: "2026-10-10",
        source: "direct",
        acquisition_channel: "direct",
      }),
    );
    expect((await readJson(second)).order_id).toBe("id-0002");
    let secondOrder = (await deps.repo.getOrder("id-0002"))!;
    expect(secondOrder.is_repeat_customer).toBe(true);
    expect((await deps.repo.getOrder("id-0001"))!.actual_repeat_purchase).toBe(false);

    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "id-0002", checkout_session_id: "cs_2" }),
    );
    expect((await deps.repo.getOrder("id-0001"))!.actual_repeat_purchase).toBe(true);
    secondOrder = (await deps.repo.getOrder("id-0002"))!;
    expect(secondOrder.actual_repeat_purchase).toBe(false);
  });

  it("handles expiry, failure and refunds", async () => {
    const { app, deps } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_expired", order_id: "id-0001", checkout_session_id: "cs_1" }),
    );
    expect((await deps.repo.getOrder("id-0001"))!.payment_status).toBe("expired");

    await app.request("/api/orders", json("POST", validOrder));
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "id-0002", checkout_session_id: "cs_2" }),
    );
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "refunded", order_id: "id-0002", payment_intent_id: "pi_2" }),
    );
    expect((await deps.repo.getOrder("id-0002"))!.payment_status).toBe("refunded");

    const orphan = await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "nope", checkout_session_id: "cs_x" }),
    );
    expect((await readJson(orphan)).order_id).toBeNull();
  });

  it("rejects bad signatures", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/webhooks/stripe",
      json("POST", { type: "checkout_completed" }, { "stripe-signature": "wrong" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/orders/:id", () => {
  it("exposes only the public view", async () => {
    const { app } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    const res = await app.request("/api/orders/id-0001");
    const body = await readJson(res);
    expect(body).toMatchObject({
      id: "id-0001",
      first_name: "Ada",
      payment_status: "pending",
      total_cents: 3900,
    });
    expect(body.customer).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("ada@example.com");
    expect((await app.request("/api/orders/missing")).status).toBe(404);
  });
});

describe("POST /api/orders/:id/feedback", () => {
  it("records repeat intent for paid orders only", async () => {
    const { app } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    expect(
      (await app.request("/api/orders/id-0001/feedback", json("POST", { repeat_intent: "yes" })))
        .status,
    ).toBe(400);
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "id-0001", checkout_session_id: "cs_1" }),
    );
    const res = await app.request(
      "/api/orders/id-0001/feedback",
      json("POST", { repeat_intent: "maybe" }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).repeat_intent).toBe("maybe");
    expect(
      (
        await app.request(
          "/api/orders/id-0001/feedback",
          json("POST", { repeat_intent: "unknown" }),
        )
      ).status,
    ).toBe(400);
  });
});

describe("admin", () => {
  it("requires the admin key", async () => {
    const { app } = makeDeps();
    expect((await app.request("/api/admin/orders")).status).toBe(401);
    expect(
      (await app.request("/api/admin/orders", { headers: { "x-admin-key": "nope" } })).status,
    ).toBe(401);
    const { app: disabled } = makeDeps({
      config: { site_url: "https://x", cors_origins: [], stage: "test" },
    });
    expect((await disabled.request("/api/admin/orders", admin("GET"))).status).toBe(503);
  });

  it("records pickups and returns with fulfilment time", async () => {
    const { app, clock } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    await app.request(
      "/api/webhooks/stripe",
      webhook({ type: "checkout_completed", order_id: "id-0001", checkout_session_id: "cs_1" }),
    );

    clock.now = new Date("2026-09-26T09:00:00Z");
    let res = await app.request(
      "/api/admin/orders/id-0001",
      admin("PATCH", { pickup_status: "picked_up" }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).picked_up_at).toBe("2026-09-26T09:00:00.000Z");

    clock.now = new Date("2026-09-27T10:30:00Z");
    res = await app.request(
      "/api/admin/orders/id-0001",
      admin("PATCH", { return_status: "returned", repeat_intent: "yes" }),
    );
    const order = await readJson(res);
    expect(order.return_status).toBe("returned");
    expect(order.time_to_fulfill_hours).toBe(25.5);
    expect(order.repeat_intent).toBe("yes");

    expect((await app.request("/api/admin/orders/id-0001", admin("PATCH", {}))).status).toBe(400);
    expect(
      (await app.request("/api/admin/orders/zzz", admin("PATCH", { repeat_intent: "no" }))).status,
    ).toBe(404);
  });

  it("lists orders filtered by experiment", async () => {
    const { app } = makeDeps();
    await app.request("/api/orders", json("POST", validOrder));
    await app.request(
      "/api/orders",
      json("POST", { ...validOrder, experiment_id: "experiment-002" }),
    );
    const res = await app.request("/api/admin/orders?experiment_id=experiment-002", admin("GET"));
    const body = await readJson(res);
    expect(body.count).toBe(1);
    expect(body.orders[0].price_version).toBe("price-002");
  });
});
