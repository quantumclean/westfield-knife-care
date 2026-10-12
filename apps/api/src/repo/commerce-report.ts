import {
  EXPERIMENTS,
  analyticsSource,
  isAcquisitionChannel,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";
import { profilesFromEvents, type ReportWindow } from "./analytics-report.ts";

/** Customer-free financial aggregates. D1 computes these without returning order JSON. */
export interface CommerceArm {
  experiment_id: string;
  orders_created: number;
  /** Paid and not fully refunded (partial refunds stay paid, net of the refund). */
  orders_paid: number;
  /** Fully refunded orders, reported apart and never counted as paid. */
  orders_refunded: number;
  /** Paid orders whose browser has a landing page view in the same arm and window. */
  paid_with_visit: number;
  revenue_cents: number;
  /** Net revenue of the `paid_with_visit` orders. */
  revenue_with_visit_cents: number;
  knives: number;
  repeat_customers: number;
  repeat_purchases: number;
  repeat_intent: Record<string, number>;
  fulfill_hours: number;
  fulfilled: number;
  waitlist_signups: number;
  by_channel: Record<string, { paid: number; revenue_cents: number }>;
  by_source: Record<string, number>;
  by_device: Record<string, number>;
  by_viewport: Record<string, number>;
}
export function emptyCommerce(experiment_id: string): CommerceArm {
  return {
    experiment_id,
    orders_created: 0,
    orders_paid: 0,
    orders_refunded: 0,
    paid_with_visit: 0,
    revenue_cents: 0,
    revenue_with_visit_cents: 0,
    knives: 0,
    repeat_customers: 0,
    repeat_purchases: 0,
    repeat_intent: {},
    fulfill_hours: 0,
    fulfilled: 0,
    waitlist_signups: 0,
    by_channel: {},
    by_source: {},
    by_device: {},
    by_viewport: {},
  };
}
export const paidOrder = (o: Order) => o.payment_status === "paid";
export const netRevenue = (o: Order) =>
  Math.max(
    0,
    o.quote.total_cents -
      (o.refunded_amount_cents ?? (o.payment_status === "refunded" ? o.quote.total_cents : 0)),
  );

/** Reference implementation for memory / legacy AWS, matching the D1 GROUP BY queries. */
export function commerceFromRecords(
  orders: Order[],
  waitlist: WaitlistEntry[],
  events: AnalyticsEvent[],
  window: ReportWindow = {},
): CommerceArm[] {
  const inWindow = (at: string) =>
    (!window.since || at >= window.since) && (!window.until || at < window.until);
  const add = (counts: Record<string, number>, key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  return EXPERIMENTS.map((exp) => {
    const arm = emptyCommerce(exp.id);
    arm.waitlist_signups = waitlist.filter(
      (w) => w.experiment_id === exp.id && inWindow(w.created_at),
    ).length;
    for (const o of orders) {
      if (o.experiment_id !== exp.id || !inWindow(o.created_at)) continue;
      arm.orders_created++;
      if (o.payment_status === "refunded") arm.orders_refunded++;
      if (!paidOrder(o)) continue;
      arm.orders_paid++;
      arm.revenue_cents += netRevenue(o);
      arm.knives += o.number_of_knives;
      arm.repeat_customers += o.is_repeat_customer ? 1 : 0;
      arm.repeat_purchases += o.actual_repeat_purchase ? 1 : 0;
      add(
        arm.repeat_intent,
        ["yes", "maybe", "no", "unknown"].includes(o.repeat_intent) ? o.repeat_intent : "unknown",
      );
      if (o.time_to_fulfill_hours !== undefined) {
        arm.fulfilled++;
        arm.fulfill_hours += o.time_to_fulfill_hours;
      }
      const channel = isAcquisitionChannel(o.acquisition_channel) ? o.acquisition_channel : "other";
      const b = (arm.by_channel[channel] ??= { paid: 0, revenue_cents: 0 });
      b.paid++;
      b.revenue_cents += netRevenue(o);
      add(arm.by_source, analyticsSource(o.source));
      const profile = o.visitor_id
        ? profilesFromEvents(
            events.filter(
              (e) =>
                e.experiment_id === exp.id &&
                inWindow(e.created_at) &&
                e.created_at <= o.created_at,
            ),
            [o.visitor_id],
          )[0]
        : undefined;
      if (profile) {
        arm.paid_with_visit++;
        arm.revenue_with_visit_cents += netRevenue(o);
      }
      add(arm.by_device, profile?.device ?? "unknown");
      add(arm.by_viewport, profile?.viewport ?? "unknown");
    }
    return arm;
  });
}
