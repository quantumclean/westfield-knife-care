import { describe, expect, it } from "vitest";
import type { CreateOrderInput, Order } from "@wkc/shared";
import { applyPaymentEvent, createOrder } from "../src/services/orders.ts";
import { WEBHOOK_SECRET, json, makeDeps, validOrder } from "./helpers.ts";

const input = (over: Partial<CreateOrderInput> = {}): CreateOrderInput => ({
  ...validOrder,
  acquisition_channel: "print",
  customer: {
    ...validOrder.customer,
    address: { ...validOrder.customer.address, line2: undefined },
  },
  notes: undefined,
  ...over,
});

const completed = (o: Order) => ({
  type: "checkout_completed" as const,
  order_id: o.id,
  checkout_session_id: o.stripe_checkout_session_id!,
  payment_intent_id: `pi_${o.id}`,
  amount_cents: o.quote.total_cents,
  currency: o.quote.currency,
});

const refunded = (o: Order, cents: number) => ({
  type: "refunded" as const,
  order_id: o.id,
  payment_intent_id: `pi_${o.id}`,
  original_amount_cents: o.quote.total_cents,
  refunded_amount_cents: cents,
});

describe("repeat-customer flag is saved with the paid state", () => {
  it("is true for a later order whose earlier sibling was paid first", async () => {
    const { deps, clock } = makeDeps();
    const { order: first } = await createOrder(deps, input());
    clock.now = new Date(clock.now.getTime() + 60_000);
    // Created while the first order is still pending, so it is not yet a repeat.
    const { order: second } = await createOrder(deps, input());
    expect((await deps.repo.getOrder(second.id))!.is_repeat_customer).toBe(false);

    await applyPaymentEvent(deps, completed(first));
    await applyPaymentEvent(deps, completed(second));

    expect((await deps.repo.getOrder(second.id))!.is_repeat_customer).toBe(true);
    expect((await deps.repo.getOrder(first.id))!.actual_repeat_purchase).toBe(true);
    expect((await deps.repo.getOrder(first.id))!.is_repeat_customer).toBe(false);
  });

  it("stays false for a customer's first paid order", async () => {
    const { deps } = makeDeps();
    const { order } = await createOrder(deps, input());
    await applyPaymentEvent(deps, completed(order));
    const stored = (await deps.repo.getOrder(order.id))!;
    expect(stored.payment_status).toBe("paid");
    expect(stored.is_repeat_customer).toBe(false);
  });

  it("ignores another customer's paid order", async () => {
    const { deps, clock } = makeDeps();
    const { order: other } = await createOrder(
      deps,
      input({ customer: { ...input().customer, email: "someone-else@example.com" } }),
    );
    clock.now = new Date(clock.now.getTime() + 60_000);
    const { order: mine } = await createOrder(deps, input());
    await applyPaymentEvent(deps, completed(other));
    await applyPaymentEvent(deps, completed(mine));
    expect((await deps.repo.getOrder(mine.id))!.is_repeat_customer).toBe(false);
    expect((await deps.repo.getOrder(other.id))!.actual_repeat_purchase).toBe(false);
  });
});

describe("a refund that outruns its payment confirmation", () => {
  it("is rejected so Stripe retries, then applies once the payment is recorded", async () => {
    const { deps } = makeDeps();
    const { order } = await createOrder(deps, input());
    const total = order.quote.total_cents;

    await expect(applyPaymentEvent(deps, refunded(order, total))).rejects.toThrow(
      /before the payment was confirmed/,
    );
    const pending = (await deps.repo.getOrder(order.id))!;
    expect(pending.payment_status).toBe("pending");
    expect(pending.refunded_amount_cents).toBeUndefined();

    await applyPaymentEvent(deps, completed(order));
    await applyPaymentEvent(deps, refunded(order, total)); // Stripe's retry
    const stored = (await deps.repo.getOrder(order.id))!;
    expect(stored.payment_status).toBe("refunded");
    expect(stored.refunded_amount_cents).toBe(total);
  });

  it("answers the webhook with a non-2xx until the payment is known, then 200", async () => {
    const { app, deps } = makeDeps();
    const { order } = await createOrder(deps, input());
    const post = (event: unknown) =>
      app.request(
        "/api/webhooks/stripe",
        json("POST", event, { "stripe-signature": WEBHOOK_SECRET }),
      );

    expect((await post(refunded(order, order.quote.total_cents))).status).toBe(500);
    expect((await post(completed(order))).status).toBe(200);
    expect((await post(refunded(order, order.quote.total_cents))).status).toBe(200);
    expect((await deps.repo.getOrder(order.id))!.payment_status).toBe("refunded");
  });

  it("is still quietly ignored for orders that can never have been paid", async () => {
    const { deps } = makeDeps();
    const { order } = await createOrder(deps, input());
    await applyPaymentEvent(deps, {
      type: "payment_failed",
      order_id: order.id,
      checkout_session_id: order.stripe_checkout_session_id!,
    });
    await expect(
      applyPaymentEvent(deps, refunded(order, order.quote.total_cents)),
    ).resolves.toBeDefined();
    expect((await deps.repo.getOrder(order.id))!.payment_status).toBe("failed");
  });
});
