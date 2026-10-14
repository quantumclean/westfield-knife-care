import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createOrderSchema } from "@wkc/shared";
import { D1Repository } from "../src/repo/d1.ts";
import { MemoryRepository } from "../src/repo/memory.ts";
import type { Repository } from "../src/repo/types.ts";
import { createApp } from "../src/app.ts";
import { applyPaymentEvent, createOrder, updateOrder } from "../src/services/orders.ts";
import { FakePaymentGateway } from "../src/payments/fake.ts";
import { json, makeDeps, readJson, validOrder } from "./helpers.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

const KEY = "checkout-request-0001";
const input = () => createOrderSchema.parse(validOrder);

describe.each(["memory", "D1"])("durable checkout requests (%s)", (kind) => {
  function setup() {
    const db = kind === "D1" ? sqliteD1() : undefined;
    const repo: Repository = db ? new D1Repository(db) : new MemoryRepository();
    const ctx = makeDeps({ repo });
    // Recreate the app and D1 repository to model a new isolate after a lost response.
    const restart = () => createApp({ ...ctx.deps, repo: db ? new D1Repository(db) : repo });
    const send = (body: unknown = validOrder, app = ctx.app, key = KEY) =>
      app.request("/api/orders", json("POST", body, { "Idempotency-Key": key }));
    return { ...ctx, db, repo, restart, send };
  }

  it("replays the original quote and attribution after restart and after the care day closes", async () => {
    const ctx = setup();
    const first = await readJson(await ctx.send());
    ctx.clock.now = new Date("2026-10-10T15:00:00Z");
    const response = await ctx.send({ ...validOrder, total_cents: 1 }, ctx.restart());
    expect(response.status).toBe(201);
    expect(await readJson(response)).toEqual(first);
    expect(first.quote.total_cents).toBe(3900);
    expect(await ctx.repo.listOrders()).toHaveLength(1);
    const order = await ctx.repo.getOrder(first.order_id);
    expect(order).toMatchObject({
      source: "flyer-v1-qr",
      acquisition_channel: "print",
      experiment_id: "experiment-001",
    });
    expect((ctx.deps.payments as FakePaymentGateway).sessions).toHaveLength(1);
    ctx.db?.raw.close();
  });

  it.each([
    { number_of_knives: 5 },
    { notes: "Different instructions" },
    { experiment_id: "experiment-002" },
    { source: "another-flyer" },
    { acquisition_channel: "social" },
    { visitor_id: "00000000-0000-4000-8000-000000000002" },
    { customer: { ...validOrder.customer, email: "different@example.com" } },
  ])("rejects a conflicting normalized payload %j", async (change) => {
    const ctx = setup();
    expect((await ctx.send()).status).toBe(201);
    const conflict = await ctx.send({ ...validOrder, ...change });
    expect(conflict.status).toBe(409);
    expect(await readJson(conflict)).toEqual({ error: "idempotency_conflict" });
    expect(await ctx.repo.listOrders()).toHaveLength(1);
    ctx.db?.raw.close();
  });

  it("normalizes equivalent values and property ordering before comparing", async () => {
    const ctx = setup();
    const first = await readJson(await ctx.send());
    const equivalent = {
      notes: "  ",
      ...validOrder,
      customer: {
        address: { ...validOrder.customer.address, state: "nj", line2: "" },
        phone: validOrder.customer.phone,
        email: "  ADA@example.com  ",
        name: " Ada Lovelace ",
      },
    };
    expect(await readJson(await ctx.send(equivalent))).toEqual(first);
    ctx.db?.raw.close();
  });

  it("concurrent independent apps claim one order and send identical provider requests", async () => {
    const ctx = setup();
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => ctx.send(validOrder, ctx.restart())),
    );
    expect(responses.map((r) => r.status)).toEqual(Array(12).fill(201));
    const bodies = await Promise.all(responses.map(readJson));
    expect(new Set(bodies.map((b) => b.order_id)).size).toBe(1);
    expect(await ctx.repo.listOrders()).toHaveLength(1);
    const requests = (ctx.deps.payments as FakePaymentGateway).sessions;
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((r) => JSON.stringify(r) === JSON.stringify(requests[0]))).toBe(true);
    ctx.db?.raw.close();
  });

  it("concurrent different payloads cannot both claim the same key", async () => {
    const ctx = setup();
    const responses = await Promise.all([
      ctx.send(validOrder, ctx.restart()),
      ctx.send({ ...validOrder, number_of_knives: 5 }, ctx.restart()),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await ctx.repo.listOrders()).toHaveLength(1);
    ctx.db?.raw.close();
  });

  it.each([
    "claim",
    "provider",
    "session-before",
    "session-after",
    "attach-before",
    "attach-after",
  ])("recovers a lost outcome at %s without a second order", async (point) => {
    const ctx = setup();
    const fail = () => {
      throw new Error("Injected partial failure");
    };
    if (point === "claim") {
      const real = ctx.repo.claimCheckout.bind(ctx.repo);
      vi.spyOn(ctx.repo, "claimCheckout").mockImplementationOnce(async (r, o) => {
        await real(r, o);
        return fail();
      });
    } else if (point.startsWith("attach")) {
      const real = ctx.repo.putOrder.bind(ctx.repo);
      let injected = false;
      vi.spyOn(ctx.repo, "putOrder").mockImplementation(async (o) => {
        const target = Boolean(o.stripe_checkout_session_id);
        if (!injected && target) {
          injected = true;
          if (point.endsWith("after")) await real(o);
          return fail();
        }
        return real(o);
      });
    } else if (point === "provider") {
      const real = ctx.deps.payments.createCheckoutSession.bind(ctx.deps.payments);
      vi.spyOn(ctx.deps.payments, "createCheckoutSession").mockImplementationOnce(async (r) => {
        await real(r);
        return fail();
      });
    } else {
      const real = ctx.repo.saveCheckoutSession.bind(ctx.repo);
      vi.spyOn(ctx.repo, "saveCheckoutSession").mockImplementationOnce(async (k, sessionId) => {
        if (point.endsWith("after")) await real(k, sessionId);
        return fail();
      });
    }
    expect((await ctx.send()).status).toBe(500);
    // Simulate changed deploy configuration: recovery uses the saved URLs and description.
    ctx.deps.config.site_url = "https://new.example.com";
    const recovered = await ctx.send(validOrder, ctx.restart());
    expect(recovered.status).toBe(201);
    expect((await readJson(recovered)).checkout_url).toContain("https://sharp.example.com/thanks");
    const orders = await ctx.repo.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0]!.stripe_checkout_session_id).toBe(`cs_fake_${orders[0]!.id}`);
    const requests = (ctx.deps.payments as FakePaymentGateway).sessions;
    expect(requests.every((r) => JSON.stringify(r) === JSON.stringify(requests[0]))).toBe(true);
    ctx.db?.raw.close();
  });

  it("fails closed on an unknown provider outcome after the fixed expiry", async () => {
    const ctx = setup();
    const create = vi
      .spyOn(ctx.deps.payments, "createCheckoutSession")
      .mockRejectedValueOnce(new Error("Lost response"));
    expect((await ctx.send()).status).toBe(500);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 60 * 60 * 1000);
    const retry = await ctx.send(validOrder, ctx.restart());
    expect(retry.status).toBe(409);
    expect(await readJson(retry)).toEqual({ error: "checkout_recovery_required" });
    expect(create).toHaveBeenCalledTimes(1);
    expect(await ctx.repo.listOrders()).toHaveLength(1);
    ctx.db?.raw.close();
  });

  it("preserves a payment and operator update that arrive before session attachment resumes", async () => {
    const ctx = setup();
    const real = ctx.repo.saveCheckoutSession.bind(ctx.repo);
    vi.spyOn(ctx.repo, "saveCheckoutSession").mockImplementationOnce(async (k, sessionId) => {
      await real(k, sessionId);
      const order = (await ctx.repo.listOrders())[0]!;
      order.stripe_checkout_session_id = sessionId;
      await ctx.repo.putOrder(order);
      await applyPaymentEvent(ctx.deps, {
        type: "checkout_completed",
        order_id: order.id,
        checkout_session_id: sessionId,
        payment_intent_id: "pi_test",
        amount_cents: order.quote.total_cents,
        currency: "usd",
      });
      await updateOrder(ctx.deps, order.id, {
        notes: "Operator notes",
        pickup_status: "picked_up",
      });
    });
    const first = await readJson(await ctx.send());
    expect(await ctx.repo.getOrder(first.order_id)).toMatchObject({
      payment_status: "paid",
      notes: "Operator notes",
      pickup_status: "picked_up",
    });
    expect(await readJson(await ctx.send())).toEqual(first);
    expect((ctx.deps.payments as FakePaymentGateway).sessions).toHaveLength(1);
    ctx.db?.raw.close();
  });

  it.each(["complete", "expired"] as const)(
    "never replays a bearer URL for a %s Stripe Session",
    async (status) => {
      const ctx = setup();
      const first = await readJson(await ctx.send());
      const gateway = ctx.deps.payments as FakePaymentGateway;
      gateway.states.set(`cs_fake_${first.order_id}`, status);
      const replay = await ctx.send(validOrder, ctx.restart());
      expect(replay.status).toBe(409);
      expect(await readJson(replay)).toEqual({ error: `checkout_${status}` });
      ctx.db?.raw.close();
    },
  );
});

it("rejects malformed keys without side effects and allows independent keys", async () => {
  const { app, deps } = makeDeps();
  for (const key of ["", "short", "x".repeat(129), "request key spaces"])
    expect(
      (await app.request("/api/orders", json("POST", validOrder, { "Idempotency-Key": key })))
        .status,
    ).toBe(400);
  expect(await deps.repo.listOrders()).toHaveLength(0);
  await createOrder(deps, input(), KEY);
  await createOrder(deps, input(), KEY + "-other");
  expect(await deps.repo.listOrders()).toHaveLength(2);
});

it("the additive migration is repeatable and leaves historical orders unchanged", async () => {
  const db = sqliteD1("0005_analytics_abuse.sql");
  const historic = '{"id":"historic","payment_status":"paid","quote":{"total_cents":3900}}';
  db.raw
    .prepare(
      "INSERT INTO orders (id, created_at, updated_at, customer_email, experiment_id, data) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run("historic", "2026-01-01", "2026-01-01", "private@example.com", "experiment-001", historic);
  const migration = readFileSync(
    new URL("../../../migrations/0006_checkout_requests.sql", import.meta.url),
    "utf8",
  );
  db.raw.exec(migration);
  db.raw.exec(migration);
  expect(db.raw.prepare("SELECT data FROM orders WHERE id = 'historic'").get()).toEqual({
    data: historic,
  });
  const repo = new D1Repository(db);
  const { deps } = makeDeps({ repo });
  await createOrder(deps, input(), KEY);
  const saved = db.raw.prepare("SELECT * FROM checkout_requests").get() as Record<string, unknown>;
  expect(JSON.stringify(saved)).not.toContain("private@example.com");
  expect(JSON.stringify(saved)).not.toContain("checkout.stripe.com");
  expect(JSON.stringify(saved)).not.toContain("feedback_token");
  await expect(repo.saveCheckoutSession(String(saved.request_key), "cs_different")).rejects.toThrow(
    "Checkout session changed",
  );
  expect((await repo.getCheckout(String(saved.request_key)))!.session_id).not.toBe("cs_different");
  db.raw.close();
});

it("an API version started before migration fails closed without creating an order", async () => {
  const db = sqliteD1("0005_analytics_abuse.sql");
  const { app, deps } = makeDeps({ repo: new D1Repository(db) });
  expect(
    (await app.request("/api/orders", json("POST", validOrder, { "Idempotency-Key": KEY }))).status,
  ).toBe(500);
  expect(await deps.repo.listOrders()).toHaveLength(0);
  expect((deps.payments as FakePaymentGateway).sessions).toHaveLength(0);
  db.raw.close();
});
