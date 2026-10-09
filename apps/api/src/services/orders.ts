import {
  describePrice,
  formatCareDay,
  hoursBetween,
  isBookableCareDay,
  quoteOrder,
  resolveExperimentOrDefault,
  PricingError,
  type CreateOrderInput,
  type Order,
  type OrderFeedbackInput,
  type ResolvedExperiment,
  type UpdateOrderInput,
} from "@wkc/shared";
import type { Deps } from "../deps.ts";
import type { PaymentEvent } from "../payments/types.ts";
import { OrderWriteConflict } from "../repo/types.ts";
import { NotFoundError, ValidationError } from "./errors.ts";

export interface CreateOrderResult {
  order: Order;
  checkout_url: string;
}

/**
 * Pick the experiment an order is recorded under: a currently active
 * experiment, or one permanently pinned to a physical flyer (see
 * `isHonorablePin`), charges and labels the order exactly as it always did —
 * even paused or concluded, since a printed flyer or a returning customer's
 * browser can still be pinned to it. Anything else, including an id that was
 * merely active in the past but was never printed on anything, falls back
 * to the default experiment: the full registry ships inside the public web
 * bundle, so a client-supplied experiment_id is not proof the customer ever
 * saw that offer.
 */
export function resolveForOrder(experimentId: string): ResolvedExperiment {
  return resolveExperimentOrDefault(experimentId);
}

export async function createOrder(deps: Deps, input: CreateOrderInput): Promise<CreateOrderResult> {
  const { experiment, offer, price } = resolveForOrder(input.experiment_id);
  const now = deps.now();

  if (!isBookableCareDay(input.care_day, now)) {
    throw new ValidationError(["care_day: not an available care day"]);
  }

  let quote;
  try {
    quote = quoteOrder(price, input.number_of_knives);
  } catch (error) {
    if (error instanceof PricingError)
      throw new ValidationError([`number_of_knives: ${error.message}`]);
    throw error;
  }

  const previous = await deps.repo.findOrdersByEmail(input.customer.email);
  const isRepeat = previous.some((o) => o.payment_status === "paid");

  const order: Order = {
    id: deps.newId(),
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    customer: input.customer,
    experiment_id: experiment.id,
    offer_version: offer.id,
    price_version: price.id,
    source: input.source,
    acquisition_channel: input.acquisition_channel,
    visitor_id: input.visitor_id,
    number_of_knives: input.number_of_knives,
    care_day: input.care_day,
    quote,
    notes: input.notes,
    payment_status: "pending",
    pickup_status: "scheduled",
    return_status: "pending",
    repeat_intent: "unknown",
    is_repeat_customer: isRepeat,
    actual_repeat_purchase: false,
  };
  await deps.repo.putOrder(order);

  const site = deps.config.site_url;
  const session = await deps.payments.createCheckoutSession({
    order,
    description: `${input.number_of_knives} knives, ${describePrice(price)} bundle, pickup ${formatCareDay(order.care_day)}`,
    success_url: `${site}/thanks?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/?exp=${experiment.id}&src=${order.source}&ch=${order.acquisition_channel}&order=${order.id}&cancelled=1#book`,
  });
  order.stripe_checkout_session_id = session.id;
  order.updated_at = deps.now().toISOString();
  await deps.repo.putOrder(order);

  deps.log("order.created", {
    order_id: order.id,
    experiment_id: order.experiment_id,
    total_cents: quote.total_cents,
    is_repeat_customer: isRepeat,
  });
  return { order, checkout_url: session.url };
}

export async function getOrder(deps: Deps, id: string): Promise<Order> {
  const order = await deps.repo.getOrder(id);
  if (!order) throw new NotFoundError(`order ${id} not found`);
  return order;
}

/** Retry conflicts by re-reading the latest order. Never retry unrelated errors. */
async function retryOrderChange<T>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (!(error instanceof OrderWriteConflict) || attempt >= 5) throw error;
    }
  }
}

/** Apply verified payment events. Stale webhooks cannot reverse refunds or other terminal states. */
export async function applyPaymentEvent(
  deps: Deps,
  event: PaymentEvent,
): Promise<Order | undefined> {
  if (event.type === "ignored") return undefined;
  return retryOrderChange(async () => {
    const order = await deps.repo.getOrder(event.order_id);
    if (!order) {
      deps.log("payment.orphan_event", { type: event.type, order_id: event.order_id });
      return undefined;
    }
    const now = deps.now().toISOString();
    switch (event.type) {
      case "checkout_completed": {
        if (order.payment_status !== "pending") return order;
        if (order.stripe_checkout_session_id !== event.checkout_session_id) {
          deps.log("payment.session_mismatch", { order_id: order.id });
          throw new Error("Stripe checkout session does not match order");
        }
        if (event.amount_cents === undefined || event.amount_cents !== order.quote.total_cents) {
          deps.log("payment.amount_mismatch", {
            order_id: order.id,
            expected: order.quote.total_cents,
            received: event.amount_cents,
          });
          throw new Error("Stripe checkout amount does not match the order quote");
        }
        if (event.currency !== undefined && event.currency !== order.quote.currency) {
          throw new Error("Stripe checkout currency does not match order");
        }
        order.payment_status = "paid";
        order.paid_at = now;
        if (event.payment_intent_id) order.stripe_payment_intent_id = event.payment_intent_id;
        break;
      }
      case "checkout_expired":
      case "payment_failed":
        if (order.payment_status !== "pending") return order;
        if (order.stripe_checkout_session_id !== event.checkout_session_id) {
          throw new Error("Stripe checkout session does not match order");
        }
        order.payment_status = event.type === "checkout_expired" ? "expired" : "failed";
        break;
      case "refunded": {
        if (order.payment_status !== "paid" && order.payment_status !== "refunded") return order;
        if (
          !event.payment_intent_id ||
          order.stripe_payment_intent_id !== event.payment_intent_id
        ) {
          throw new Error("Stripe refund payment intent does not match order");
        }
        if (
          event.refunded_amount_cents === undefined ||
          event.original_amount_cents === undefined ||
          event.original_amount_cents !== order.quote.total_cents ||
          event.refunded_amount_cents < 0 ||
          event.refunded_amount_cents > order.quote.total_cents
        ) {
          throw new Error("Stripe refund total is missing or invalid");
        }
        const cumulative = Math.max(order.refunded_amount_cents ?? 0, event.refunded_amount_cents);
        if (cumulative === order.refunded_amount_cents) return order;
        order.refunded_amount_cents = cumulative;
        if (cumulative === order.quote.total_cents) order.payment_status = "refunded";
        break;
      }
    }
    order.updated_at = now;
    await deps.repo.putOrder(order);
    if (event.type === "checkout_completed") {
      // Update repeat metrics after the primary paid state has safely persisted.
      await markEarlierOrdersRepeated(deps, order, now);
    }
    deps.log("order.payment_updated", { order_id: order.id, payment_status: order.payment_status });
    return order;
  });
}

/** A paid order makes every earlier paid order by the same customer a "repeat purchase" success. */
async function markEarlierOrdersRepeated(deps: Deps, order: Order, now: string): Promise<void> {
  const earlier = await deps.repo.findOrdersByEmail(order.customer.email);
  for (const previous of earlier) {
    if (previous.id === order.id || previous.payment_status !== "paid") continue;
    if (previous.created_at >= order.created_at || previous.actual_repeat_purchase) continue;
    previous.actual_repeat_purchase = true;
    previous.updated_at = now;
    try {
      await deps.repo.putOrder(previous);
    } catch (error) {
      if (!(error instanceof OrderWriteConflict)) throw error;
      // A later request can safely recompute the secondary repeat metric.
      deps.log("repeat.metric_conflict", { order_id: previous.id });
    }
  }
  order.is_repeat_customer = earlier.some(
    (o) => o.id !== order.id && o.payment_status === "paid" && o.created_at < order.created_at,
  );
}

/** Operator update from the field. Sets timestamps and derived metrics. */
export async function updateOrder(deps: Deps, id: string, input: UpdateOrderInput): Promise<Order> {
  return retryOrderChange(async () => {
  const order = await getOrder(deps, id);
  const now = deps.now().toISOString();

  if (input.pickup_status && input.pickup_status !== order.pickup_status) {
    order.pickup_status = input.pickup_status;
    if (input.pickup_status === "picked_up") order.picked_up_at = now;
  }
  if (input.return_status && input.return_status !== order.return_status) {
    order.return_status = input.return_status;
    if (input.return_status === "returned") {
      order.returned_at = now;
      const start = order.picked_up_at ?? order.paid_at ?? order.created_at;
      order.time_to_fulfill_hours = hoursBetween(start, now);
    }
  }
  if (input.repeat_intent) order.repeat_intent = input.repeat_intent;
  if (input.notes !== undefined) order.notes = input.notes;

  order.updated_at = now;
  await deps.repo.putOrder(order);
  deps.log("order.updated", { order_id: order.id, ...input });
  return order;
  });
}

/** Customer answers "would you use this again?" from the thank-you page. Paid orders only. */
export async function recordFeedback(
  deps: Deps,
  id: string,
  input: OrderFeedbackInput,
): Promise<Order> {
  return retryOrderChange(async () => {
  const order = await getOrder(deps, id);
  if (order.payment_status !== "paid" && order.payment_status !== "refunded") {
    throw new ValidationError(["order: feedback is only accepted for paid orders"]);
  }
  order.repeat_intent = input.repeat_intent;
  order.updated_at = deps.now().toISOString();
  await deps.repo.putOrder(order);
  deps.log("order.feedback", { order_id: order.id, repeat_intent: order.repeat_intent });
  return order;
  });
}

/** What the thank-you page is allowed to see. No address, no email. */
export function publicOrderView(order: Order) {
  return {
    id: order.id,
    first_name: order.customer.name.split(" ")[0] ?? "",
    payment_status: order.payment_status,
    pickup_status: order.pickup_status,
    return_status: order.return_status,
    number_of_knives: order.number_of_knives,
    care_day: order.care_day,
    total_cents: order.quote.total_cents,
    currency: order.quote.currency,
    experiment_id: order.experiment_id,
    offer_version: order.offer_version,
    price_version: order.price_version,
    source: order.source,
    acquisition_channel: order.acquisition_channel,
    repeat_intent: order.repeat_intent,
  };
}
