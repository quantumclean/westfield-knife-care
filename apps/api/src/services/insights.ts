import {
  EXPERIMENTS,
  FLYER_ROUTES,
  MIN_REPORT_COUNT,
  SCROLL_MILESTONES,
  SECTIONS,
  VIDEO_MILESTONES,
} from "@wkc/shared";
import type { CommerceArm } from "../repo/commerce-report.ts";
import type { Deps } from "../deps.ts";
import type { AnalyticsReport, ReportWindow, StepRow } from "../repo/analytics-report.ts";

/**
 * Aggregate UX insight per experiment arm, for the operator only (behind the admin key).
 *
 * - Built from store-side aggregates (`repo.analyticsReport`): D1 runs a handful of GROUP BY
 *   queries and returns aggregate rows, so the Worker never loads raw events. Paid-order
 *   device splits look up only the paid visitors, in small chunks.
 * - Counts are unique visitors (random browser ids); no id, order, contact detail or free text
 *   ever appears in the output.
 * - Paid orders and revenue come only from orders, whose payment status is set by Stripe's
 *   webhook. Client-side `checkout_completed` events are never used to count money.
 * - Breakdown rows with fewer than `min_count` visitors are suppressed (numbers become null).
 */

export const FUNNEL = [
  "visited",
  "engaged",
  "cta_click",
  "booking_opened",
  "booking_details",
  "booking_submitted",
  "checkout_started",
  "paid",
] as const;
export type FunnelStep = (typeof FUNNEL)[number];

export type Funnel = Record<FunnelStep, number>;

export interface SegmentRow {
  key: string;
  visitors: number | null;
  booking_opened: number | null;
  booking_submitted: number | null;
  paid: number | null;
  /** paid orders / visitors */
  paid_rate: number | null;
  suppressed: boolean;
}

export interface DropOff {
  from: FunnelStep;
  to: FunnelStep;
  lost: number;
  conversion: number;
  /** The device class with the lowest conversion at this step (enough visitors only). */
  worst_device: { device: string; conversion: number; visitors: number } | null;
}

export interface ArmInsights {
  experiment_id: string;
  name: string;
  status: string;
  flyer: string | null;
  offer_version: string;
  price_version: string;
  funnel: Funnel;
  drop_offs: DropOff[];
  engagement: {
    landing_views: number;
    bounce_rate: number | null;
    section_reach: Record<string, number>;
    scroll_depth: Record<string, number>;
    faq_openers: number;
    video: Record<string, number>;
  };
  booking: {
    closed_at: Record<string, number>;
    checkout_cancelled_returns: number;
    form_error_fields: Record<string, number>;
    form_error_kinds: Record<string, number>;
    waitlist_switches: Record<string, number>;
    address_suggestions: Record<string, number>;
    /** Of visitors who reached details: share who submitted, split by suggestion use. */
    submit_rate_with_suggestion: number | null;
    submit_rate_without_suggestion: number | null;
  };
  outcomes: {
    orders_created: number;
    orders_paid: number;
    revenue_cents: number;
    paid_per_visitor: number | null;
    revenue_per_visitor_cents: number | null;
    waitlist_signups: number;
  };
  by_channel: SegmentRow[];
  by_source: SegmentRow[];
  by_device: SegmentRow[];
  by_viewport: SegmentRow[];
  health: {
    /** Visitors with a client error, by `kind:<kind>` and by `area:<area>`. */
    client_errors: Record<string, number>;
    web_vitals: Record<string, Record<string, number>>;
  };
}

export interface Insights {
  generated_at: string;
  window: { since: string | null; until: string | null };
  min_count: number;
  events_read: number;
  duplicates_ignored: number;
  arms: ArmInsights[];
  notes: string[];
}

const rate = (num: number, den: number, digits = 4) =>
  den > 0 ? Math.round((num / den) * 10 ** digits) / 10 ** digits : null;

function countBy(values: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of values) result[v] = (result[v] ?? 0) + 1;
  return result;
}

/** Funnel from step rows (each visitor is in exactly one row per arm) and paid orders. */
function funnelOf(rows: StepRow[], paid: number): Funnel {
  const sum = (key: keyof StepRow) => rows.reduce((n, r) => n + Number(r[key]), 0);
  return {
    visited: sum("visited"),
    engaged: sum("engaged"),
    cta_click: sum("cta"),
    booking_opened: sum("opened"),
    booking_details: sum("details"),
    booking_submitted: sum("submitted"),
    checkout_started: sum("checkout"),
    paid,
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items)
    (map.get(key(item)) ?? map.set(key(item), []).get(key(item))!).push(item);
  return map;
}

function segmentRows(
  rows: StepRow[],
  dim: "channel" | "source" | "device" | "viewport",
  paidBy: Record<string, number>,
  minCount: number,
): SegmentRow[] {
  const groups = groupBy(rows, (r) => r[dim]);
  const out: SegmentRow[] = [];
  for (const key of new Set([...groups.keys(), ...Object.keys(paidBy)])) {
    const members = groups.get(key) ?? [];
    const visitors = members.reduce((n, r) => n + r.visited, 0);
    if (visitors === 0 && !paidBy[key]) continue;
    const paid = paidBy[key] ?? 0;
    const suppressed = visitors < minCount;
    out.push({
      key,
      visitors: suppressed ? null : visitors,
      booking_opened: suppressed ? null : members.reduce((n, r) => n + r.opened, 0),
      booking_submitted: suppressed ? null : members.reduce((n, r) => n + r.submitted, 0),
      paid: suppressed ? null : paid,
      paid_rate: suppressed ? null : rate(paid, visitors),
      suppressed,
    });
  }
  return out.sort((a, b) => (b.visitors ?? -1) - (a.visitors ?? -1) || a.key.localeCompare(b.key));
}

function dropOffs(
  funnel: Funnel,
  byDevice: Map<string, StepRow[]>,
  paidByDevice: Record<string, number>,
  minCount: number,
): DropOff[] {
  const steps: DropOff[] = [];
  for (let i = 0; i < FUNNEL.length - 1; i++) {
    const from = FUNNEL[i]!;
    const to = FUNNEL[i + 1]!;
    if (from === "visited" && to === "engaged") continue; // engagement is reported separately
    const fromStep = from === "engaged" ? "visited" : from;
    const base = funnel[fromStep];
    if (base === 0) continue;
    let worst: DropOff["worst_device"] = null;
    for (const [device, rows] of byDevice) {
      const f = funnelOf(rows, paidByDevice[device] ?? 0);
      if (f[fromStep] < minCount) continue;
      const conversion = rate(f[to], f[fromStep])!;
      if (!worst || conversion < worst.conversion)
        worst = { device, conversion, visitors: f[fromStep] };
    }
    steps.push({
      from: fromStep,
      to,
      lost: Math.max(0, base - funnel[to]),
      conversion: rate(funnel[to], base)!,
      worst_device: worst,
    });
  }
  return steps
    .filter((step) => step.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3);
}

function armInsights(
  experiment: (typeof EXPERIMENTS)[number],
  report: AnalyticsReport,
  commerce: CommerceArm,
  minCount: number,
): ArmInsights {
  const id = experiment.id;
  const rows = report.steps.filter((r) => r.experiment_id === id);
  const funnel = funnelOf(rows, commerce.orders_paid);
  const visitors = funnel.visited;
  const revenue = commerce.revenue_cents;
  const paidByDevice = commerce.by_device;
  const paidByViewport = commerce.by_viewport;

  const prop = (name: string, key: string) =>
    Object.fromEntries(
      report.props
        .filter((p) => p.experiment_id === id && p.name === name && p.prop === key)
        .map((p) => [p.value, p.visitors]),
    );
  const named = (name: string) =>
    report.names.find((n) => n.experiment_id === id && n.name === name)?.visitors ?? 0;
  const errors = (kind: "field" | "kind") =>
    Object.fromEntries(
      report.form_errors
        .filter((f) => f.experiment_id === id && f.kind === kind)
        .map((f) => [f.value, f.visitors]),
    );
  const sum = (key: keyof StepRow) => rows.reduce((n, r) => n + Number(r[key]), 0);
  const view = report.views.find((v) => v.experiment_id === id);
  const sections = prop("section_view", "section");
  const scroll = prop("scroll_depth", "percent");
  const progress = prop("video_progress", "percent");
  const locations = prop("pilot_opened", "location");
  const flyer = FLYER_ROUTES.find((r) => r.experiment_id === id);
  const chose = sum("details_chose");
  const typed = sum("details_typed");

  const clientErrors: Record<string, number> = {};
  for (const [k, n] of Object.entries(prop("client_error", "kind"))) clientErrors[`kind:${k}`] = n;
  for (const [k, n] of Object.entries(prop("client_error", "area"))) clientErrors[`area:${k}`] = n;

  return {
    experiment_id: id,
    name: experiment.name,
    status: experiment.status,
    flyer: flyer ? flyer.path : null,
    offer_version: experiment.offer_version,
    price_version: experiment.price_version,
    funnel,
    drop_offs: dropOffs(
      funnel,
      groupBy(rows, (r) => r.device),
      paidByDevice,
      minCount,
    ),
    engagement: {
      landing_views: view?.landing_views ?? 0,
      bounce_rate: view ? rate(view.bounced, view.landing_views) : null,
      section_reach: Object.fromEntries(SECTIONS.map((s) => [s, sections[s] ?? 0])),
      scroll_depth: Object.fromEntries(SCROLL_MILESTONES.map((m) => [String(m), scroll[m] ?? 0])),
      faq_openers: named("faq_opened"),
      video: {
        viewers: named("video_view"),
        ...Object.fromEntries(VIDEO_MILESTONES.map((m) => [`reached_${m}`, progress[m] ?? 0])),
        unmuted: named("video_unmute"),
      },
    },
    booking: {
      closed_at: prop("booking_closed", "step"),
      checkout_cancelled_returns: named("checkout_returned"),
      form_error_fields: errors("field"),
      form_error_kinds: errors("kind"),
      waitlist_switches: Object.fromEntries(
        Object.entries(locations).filter(([k]) => ["out-of-area", "booking-closed"].includes(k)),
      ),
      address_suggestions: prop("address_suggest", "action"),
      submit_rate_with_suggestion:
        chose >= minCount ? rate(sum("details_chose_submitted"), chose) : null,
      submit_rate_without_suggestion:
        typed >= minCount ? rate(sum("details_typed_submitted"), typed) : null,
    },
    outcomes: {
      orders_created: commerce.orders_created,
      orders_paid: commerce.orders_paid,
      revenue_cents: revenue,
      paid_per_visitor: rate(commerce.orders_paid, visitors),
      revenue_per_visitor_cents: visitors ? Math.round(revenue / visitors) : null,
      waitlist_signups: commerce.waitlist_signups,
    },
    by_channel: segmentRows(
      rows,
      "channel",
      Object.fromEntries(
        Object.entries(commerce.by_channel).map(([key, value]) => [key, value.paid]),
      ),
      minCount,
    ),
    by_source: segmentRows(rows, "source", commerce.by_source, minCount),
    by_device: segmentRows(rows, "device", paidByDevice, minCount),
    by_viewport: segmentRows(rows, "viewport", paidByViewport, minCount),
    health: {
      client_errors: clientErrors,
      web_vitals: Object.fromEntries(
        ["lcp", "inp", "cls", "ttfb"].map((m) => [m, prop("web_vitals", m)]),
      ),
    },
  };
}

export async function buildInsights(
  deps: Deps,
  window: ReportWindow,
  minCount: number = MIN_REPORT_COUNT,
): Promise<Insights> {
  const [commerce, report] = await Promise.all([
    deps.repo.commerceReport(window),
    deps.repo.analyticsReport(window),
  ]);

  return {
    generated_at: deps.now().toISOString(),
    window: { since: window.since ?? null, until: window.until ?? null },
    min_count: minCount,
    events_read: report.events_read,
    duplicates_ignored: report.duplicates,
    arms: EXPERIMENTS.map((experiment) =>
      armInsights(
        experiment,
        report,
        commerce.find((a) => a.experiment_id === experiment.id)!,
        minCount,
      ),
    ),
    notes: [
      "Browser telemetry is untrusted: bots can fabricate ids and steps. Visitor, UX and conversion estimates are not verified people or a strictly ordered cohort funnel.",
      "Visitors are unique random browser ids; one person on two devices counts twice. Orders can exceed visitors when counting is disabled or events expire.",
      "Paid orders and revenue come from Stripe-confirmed orders, never from browser events.",
      "Paid device/viewport use the first retained page view in the same report window and arm, no later than order creation. Unknown includes missing, opted-out and expired telemetry.",
      `Breakdown rows under ${minCount} visitors are suppressed (null).`,
      "Events are kept for 90 days; compare arms over the same window.",
    ],
  };
}

const pct = (value: number | null) => (value === null ? "–" : `${(value * 100).toFixed(1)}%`);
const num = (value: number | null) => (value === null ? "<min" : String(value));
const money = (cents: number | null) => (cents === null ? "–" : `$${(cents / 100).toFixed(2)}`);

function table(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}

function segmentTable(title: string, rows: SegmentRow[]): string {
  if (rows.length === 0) return "";
  return `#### ${title}\n\n${table(
    ["", "visitors", "opened booking", "submitted", "paid", "paid / visitor"],
    rows.map((r) => [
      r.key,
      num(r.visitors),
      num(r.booking_opened),
      num(r.booking_submitted),
      num(r.paid),
      pct(r.paid_rate),
    ]),
  )}\n`;
}

/** A plain Markdown rendering of the same report, for pasting into notes or an issue. */
export function renderInsightsMarkdown(insights: Insights): string {
  const out: string[] = [
    "# Westfield Knife Care: visitor insights",
    "",
    `Generated ${insights.generated_at}. Window: ${insights.window.since ?? "all retained"} to ${insights.window.until ?? "now"}. ` +
      `${insights.events_read} events aggregated, ` +
      `${insights.duplicates_ignored} duplicates ignored.`,
    "",
    "## Arms side by side",
    "",
    table(
      ["", ...insights.arms.map((a) => `${a.experiment_id}${a.flyer ? ` (${a.flyer})` : ""}`)],
      [
        ["visitors", ...insights.arms.map((a) => a.funnel.visited)],
        ["bounce rate", ...insights.arms.map((a) => pct(a.engagement.bounce_rate))],
        ...FUNNEL.slice(2).map((step) => [step, ...insights.arms.map((a) => a.funnel[step])]),
        ["paid / visitor", ...insights.arms.map((a) => pct(a.outcomes.paid_per_visitor))],
        ["revenue", ...insights.arms.map((a) => money(a.outcomes.revenue_cents))],
        [
          "revenue / visitor",
          ...insights.arms.map((a) => money(a.outcomes.revenue_per_visitor_cents)),
        ],
        ["waitlist signups", ...insights.arms.map((a) => a.outcomes.waitlist_signups)],
      ],
    ),
    "",
  ];
  for (const arm of insights.arms) {
    out.push(`## ${arm.experiment_id}: ${arm.name}`, "");
    if (arm.drop_offs.length) {
      out.push("Biggest drop-offs:", "");
      for (const d of arm.drop_offs) {
        const device = d.worst_device
          ? ` Weakest on ${d.worst_device.device} (${pct(d.worst_device.conversion)} of ${d.worst_device.visitors}).`
          : "";
        out.push(`- ${d.from} → ${d.to}: ${d.lost} lost, ${pct(d.conversion)} continue.${device}`);
      }
      out.push("");
    }
    const fields = Object.entries(arm.booking.form_error_fields).sort((a, b) => b[1] - a[1]);
    if (fields.length)
      out.push(
        `Form errors (visitors per field): ${fields.map(([f, n]) => `${f} ${n}`).join(", ")}`,
        "",
      );
    const suggest = Object.entries(arm.booking.address_suggestions);
    if (suggest.length)
      out.push(
        `Address suggestions (visitors): ${suggest.map(([k, n]) => `${k} ${n}`).join(", ")}. ` +
          `Submit rate after details: with a chosen suggestion ${pct(arm.booking.submit_rate_with_suggestion)}, without ${pct(arm.booking.submit_rate_without_suggestion)}.`,
        "",
      );
    out.push(segmentTable("By acquisition channel", arm.by_channel));
    out.push(segmentTable("By source", arm.by_source));
    out.push(segmentTable("By device", arm.by_device));
    out.push(segmentTable("By viewport", arm.by_viewport));
  }
  out.push("## Notes", "", ...insights.notes.map((n) => `- ${n}`), "");
  return out.join("\n");
}
