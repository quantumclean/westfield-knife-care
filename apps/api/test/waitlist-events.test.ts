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
        visitor_id: "00000000-0000-4000-8000-000000000002",
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

  it("stores interest-only mail-in and gift entries, with no order and no payment", async () => {
    const { app, deps } = makeDeps();
    for (const service_interest of ["mail_in", "gift"] as const) {
      const res = await app.request(
        "/api/waitlist",
        json("POST", {
          experiment_id: "experiment-001",
          name: "Ada Example",
          email: "ada@example.com",
          service_interest,
          cadence: "once",
          notes: "Roughly six knives.",
        }),
      );
      expect(res.status, service_interest).toBe(201);
    }
    const entries = await deps.repo.listWaitlist();
    expect(entries.map((e) => [e.service_interest, e.cadence]).sort()).toEqual([
      ["gift", "once"],
      ["mail_in", "once"],
    ]);
    // Interest only: nothing was ordered or charged.
    expect(await deps.repo.listOrders()).toHaveLength(0);
  });

  it("still rejects an interest the site does not offer", async () => {
    const { app } = makeDeps();
    const res = await app.request(
      "/api/waitlist",
      json("POST", {
        experiment_id: "experiment-001",
        name: "Ada",
        email: "ada@example.com",
        service_interest: "overnight_shipping",
        cadence: "once",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts the new interest events and rejects ones that smuggle in an address", async () => {
    const { app } = makeDeps();
    // A schema v2 batch: the strict path, where the shared catalog is the only allowlist.
    let n = 0;
    const send = (props: Record<string, unknown>) =>
      app.request(
        "/api/events",
        json("POST", {
          events: [
            {
              v: 2,
              owner: "f".repeat(64),
              event_id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
              view_id: "11111111-2222-4333-8444-555555555555",
              experiment_id: "experiment-001",
              source: "direct",
              acquisition_channel: "direct",
              visitor_id: "00000000-0000-4000-8000-00000000000a",
              route: "/a",
              device: "mobile",
              viewport: "xs",
              name: "pilot_opened",
              props,
            },
          ],
        }),
      );
    expect((await send({ location: "ways-gift" })).status).toBe(204);
    expect((await send({ location: "ways-mail-in" })).status).toBe(204);
    expect((await send({ location: "ways-gift", address: "1 Main St" })).status).toBe(400);
    expect((await send({ location: "12 Elm St, Westfield" })).status).toBe(400);
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

    for (const v of [
      "00000000-0000-4000-8000-00000000000a",
      "00000000-0000-4000-8000-00000000000b",
      "00000000-0000-4000-8000-00000000000c",
    ]) {
      expect((await send("page_view", v)).status).toBe(204);
    }
    await send("page_view", "00000000-0000-4000-8000-00000000000a"); // second view, same visitor
    await send("cta_click", "00000000-0000-4000-8000-00000000000a", "experiment-001", {
      props: { cta: "sharpen", location: "hero" },
    });
    await send("checkout_started", "00000000-0000-4000-8000-00000000000a");
    await send("page_view", "00000000-0000-4000-8000-00000000000d", "experiment-002", {
      acquisition_channel: "social",
      source: "instagram",
    });

    const created = await readJson(
      await app.request(
        "/api/orders",
        json("POST", { ...validOrder, visitor_id: "00000000-0000-4000-8000-00000000000a" }),
      ),
    );
    await app.request(
      "/api/webhooks/stripe",
      json(
        "POST",
        {
          type: "checkout_completed",
          order_id: created.order_id,
          checkout_session_id: "cs_fake_" + created.order_id,
          payment_intent_id: "pi_1",
          amount_cents: 3900,
          currency: "usd",
        },
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
