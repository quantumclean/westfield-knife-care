import { EXPERIMENTS, FUNNEL_STEPS } from "@wkc/shared";
import type { Deps } from "../deps.ts";
import type { CommerceArm } from "../repo/commerce-report.ts";
import type { AnalyticsReport } from "../repo/analytics-report.ts";

export interface ExperimentSummary {
  experiment_id: string;
  name: string;
  status: string;
  offer_version: string;
  price_version: string;
  /** Unique visitors per funnel step (`page_view`: landing-page visitors, not `/thanks`). */
  funnel: Record<string, number>;
  orders_created: number;
  /** Paid, not fully refunded. */
  orders_paid: number;
  orders_refunded: number;
  /** Paid orders whose browser has a counted landing visit (the rate's numerator). */
  orders_paid_with_visit: number;
  revenue_cents: number;
  average_order_cents: number;
  average_knives: number;
  /** orders_paid_with_visit / landing visitors: both sides from the same measured population */
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
  // Event counts are aggregated by the store; no raw events are loaded here.
  const [commerce, report] = await Promise.all([
    deps.repo.commerceReport(since ? { since } : {}),
    deps.repo.analyticsReport(since ? { since } : {}),
  ]);
  const experiments = EXPERIMENTS.map((experiment): ExperimentSummary => {
    const paid = commerce.find((a) => a.experiment_id === experiment.id)!;
    const funnel = uniqueVisitorsByStep(report, experiment.id);
    // Landing visitors only: a thank-you page or follow-up link is not a visit.
    funnel.page_view = report.steps
      .filter((r) => r.experiment_id === experiment.id)
      .reduce((n, r) => n + r.visited, 0);
    const views = funnel.page_view;
    const revenue = paid.revenue_cents;

    return {
      experiment_id: experiment.id,
      name: experiment.name,
      status: experiment.status,
      offer_version: experiment.offer_version,
      price_version: experiment.price_version,
      funnel,
      orders_created: paid.orders_created,
      orders_paid: paid.orders_paid,
      orders_refunded: paid.orders_refunded,
      orders_paid_with_visit: paid.paid_with_visit,
      revenue_cents: revenue,
      average_order_cents: paid.orders_paid ? Math.round(revenue / paid.orders_paid) : 0,
      average_knives: paid.orders_paid ? round(paid.knives / paid.orders_paid) : 0,
      visitor_to_paid_rate: views ? round(paid.paid_with_visit / views, 4) : 0,
      waitlist_signups: paid.waitlist_signups,
      repeat_customers: paid.repeat_customers,
      repeat_purchases: paid.repeat_purchases,
      repeat_intent: paid.repeat_intent,
      average_time_to_fulfill_hours: paid.fulfilled
        ? round(paid.fulfill_hours / paid.fulfilled)
        : null,
      by_channel: byChannel(report, experiment.id, paid),
    };
  });

  return {
    generated_at: deps.now().toISOString(),
    since: since ?? null,
    experiments,
  };
}

function uniqueVisitorsByStep(report: AnalyticsReport, experimentId: string) {
  const result: Record<string, number> = {};
  for (const step of FUNNEL_STEPS) {
    result[step] =
      report.names.find((n) => n.experiment_id === experimentId && n.name === step)?.visitors ?? 0;
  }
  return result;
}

function byChannel(report: AnalyticsReport, experimentId: string, paid: CommerceArm) {
  const result: Record<string, { views: number; paid: number; revenue_cents: number }> = {};
  const bucket = (channel: string) => (result[channel] ??= { views: 0, paid: 0, revenue_cents: 0 });
  for (const row of report.steps.filter((r) => r.experiment_id === experimentId && r.visited))
    bucket(row.channel).views += row.visited;
  for (const [channel, stats] of Object.entries(paid.by_channel)) {
    const b = bucket(channel);
    b.paid += stats.paid;
    b.revenue_cents += stats.revenue_cents;
  }
  return result;
}

function round(value: number, digits: number = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
