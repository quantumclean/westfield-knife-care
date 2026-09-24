import { EXPERIMENTS, FUNNEL_STEPS, type AnalyticsEvent, type Order } from "@wkc/shared";
import type { Deps } from "../deps.ts";

export interface ExperimentSummary {
  experiment_id: string;
  name: string;
  status: string;
  offer_version: string;
  price_version: string;
  /** Unique visitors per funnel step. */
  funnel: Record<string, number>;
  orders_created: number;
  orders_paid: number;
  revenue_cents: number;
  average_order_cents: number;
  average_knives: number;
  /** paid orders / unique page views */
  visitor_to_paid_rate: number;
  waitlist_signups: number;
  repeat_customers: number;
  repeat_purchases: number;
  repeat_intent: Record<string, number>;
  average_time_to_fulfill_hours: number | null;
  by_channel: Record<string, { views: number; paid: number; revenue_cents: number }>;
}

export interface Summary {
  generated_at: string;
  since: string | null;
  experiments: ExperimentSummary[];
}

/** Per-experiment funnel and economics, computed from stored events and orders. */
export async function buildSummary(deps: Deps, since?: string): Promise<Summary> {
  const [orders, waitlist, events] = await Promise.all([
    deps.repo.listOrders(),
    deps.repo.listWaitlist(),
    deps.repo.listEvents(since ? { since } : {}),
  ]);
  const inWindow = <T extends { created_at: string }>(x: T) => !since || x.created_at >= since;

  const experiments = EXPERIMENTS.map((experiment): ExperimentSummary => {
    const expOrders = orders.filter((o) => o.experiment_id === experiment.id && inWindow(o));
    const paid = expOrders.filter(
      (o) => o.payment_status === "paid" || o.payment_status === "refunded",
    );
    const expEvents = events.filter((e) => e.experiment_id === experiment.id);
    const funnel = uniqueVisitorsByStep(expEvents);
    const views = funnel.page_view ?? 0;
    const revenue = paid.reduce((sum, o) => sum + o.quote.total_cents, 0);
    const fulfilled = paid.filter((o) => o.time_to_fulfill_hours !== undefined);

    return {
      experiment_id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      offer_version: experiment.offer_version,
      price_version: experiment.price_version,
      funnel,
      orders_created: expOrders.length,
      orders_paid: paid.length,
      revenue_cents: revenue,
      average_order_cents: paid.length ? Math.round(revenue / paid.length) : 0,
      average_knives: paid.length
        ? round(paid.reduce((s, o) => s + o.number_of_knives, 0) / paid.length)
        : 0,
      visitor_to_paid_rate: views ? round(paid.length / views, 4) : 0,
      waitlist_signups: waitlist.filter((w) => w.experiment_id === experiment.id && inWindow(w))
        .length,
      repeat_customers: paid.filter((o) => o.is_repeat_customer).length,
      repeat_purchases: paid.filter((o) => o.actual_repeat_purchase).length,
      repeat_intent: countBy(paid, (o) => o.repeat_intent),
      average_time_to_fulfill_hours: fulfilled.length
        ? round(
            fulfilled.reduce((s, o) => s + (o.time_to_fulfill_hours ?? 0), 0) / fulfilled.length,
          )
        : null,
      by_channel: byChannel(expEvents, paid),
    };
  });

  return { generated_at: deps.now().toISOString(), since: since ?? null, experiments };
}

function uniqueVisitorsByStep(events: AnalyticsEvent[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const step of FUNNEL_STEPS) {
    result[step] = new Set(events.filter((e) => e.name === step).map((e) => e.visitor_id)).size;
  }
  return result;
}

function byChannel(events: AnalyticsEvent[], paid: Order[]) {
  const result: Record<string, { views: number; paid: number; revenue_cents: number }> = {};
  const bucket = (channel: string) => (result[channel] ??= { views: 0, paid: 0, revenue_cents: 0 });
  const viewers = new Map<string, Set<string>>();
  for (const e of events.filter((e) => e.name === "page_view")) {
    (
      viewers.get(e.acquisition_channel) ??
      viewers.set(e.acquisition_channel, new Set()).get(e.acquisition_channel)!
    ).add(e.visitor_id);
  }
  for (const [channel, visitors] of viewers) bucket(channel).views = visitors.size;
  for (const o of paid) {
    const b = bucket(o.acquisition_channel);
    b.paid += 1;
    b.revenue_cents += o.quote.total_cents;
  }
  return result;
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return result;
}

function round(value: number, digits: number = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
