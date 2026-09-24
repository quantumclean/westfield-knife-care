import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { normaliseStripeEvent } from "../src/payments/stripe.ts";

const session = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "cs_test_1",
    object: "checkout.session",
    client_reference_id: "order-1",
    metadata: { order_id: "order-1" },
    payment_status: "paid",
    payment_intent: "pi_1",
    amount_total: 3900,
    ...overrides,
  }) as unknown as Stripe.Checkout.Session;

const event = (type: string, object: unknown) =>
  ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;

describe("normaliseStripeEvent", () => {
  it("maps a completed, paid session", () => {
    expect(normaliseStripeEvent(event("checkout.session.completed", session()))).toEqual({
      type: "checkout_completed",
      order_id: "order-1",
      checkout_session_id: "cs_test_1",
      payment_intent_id: "pi_1",
      amount_cents: 3900,
    });
  });

  it("ignores completed sessions that are not yet paid (delayed methods)", () => {
    const result = normaliseStripeEvent(
      event("checkout.session.completed", session({ payment_status: "unpaid" })),
    );
    expect(result.type).toBe("ignored");
  });

  it("maps expiry and refunds", () => {
    expect(normaliseStripeEvent(event("checkout.session.expired", session())).type).toBe(
      "checkout_expired",
    );
    const refund = normaliseStripeEvent(
      event("charge.refunded", {
        id: "ch_1",
        metadata: { order_id: "order-1" },
        payment_intent: { id: "pi_1" },
      }),
    );
    expect(refund).toEqual({ type: "refunded", order_id: "order-1", payment_intent_id: "pi_1" });
  });

  it("ignores unrelated events", () => {
    expect(normaliseStripeEvent(event("customer.created", {})).type).toBe("ignored");
  });
});
