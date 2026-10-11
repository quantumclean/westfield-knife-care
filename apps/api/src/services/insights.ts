import {
  CATALOG,
  EXPERIMENTS,
  FLYER_ROUTES,
  MIN_REPORT_COUNT,
  SCROLL_MILESTONES,
  SECTIONS,
  VIDEO_MILESTONES,
  isEventName,
  onceKey,
  type AnalyticsEvent,
  type Order,
} from "@wkc/shared";
import type { Deps } from "../deps.ts";
import { readEvents, type EventWindow } from "./event-reader.ts";

/**
 * Aggregate UX insight per experiment arm, for the operator only (behind the admin key).
 *
 * - Counts are unique visitors (random browser ids) unless named otherwise; no id, order,
 *   contact detail or free text ever appears in the output.
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
    client_errors: Record<string, number>;
    web_vitals: Record<string, Record<string, number>>;
  };
}

export interface Insights {
  generated_at: string;
  window: { since: string | null; until: string | null };
  min_count: number;
  events_read: number;
  events_truncated: boolean;
  duplicates_ignored: number;
  arms: ArmInsights[];
  notes: string[];
}

const LANDING = new Set(["/", "/a", "/b", "other"]);
const INTERACTIONS = new Set([
  "cta_click",
  "booking_opened",
  "pilot_opened",
  "faq_opened",
  "video_view",
]);
const isPaid = (o: Order) => o.payment_status === "paid" || o.payment_status === "refunded";

/** Drop repeats of once-per-view events (same page load, same key). */
export function dedupeEvents(events: AnalyticsEvent[]): {
  events: AnalyticsEvent[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const kept: AnalyticsEvent[] = [];
  let duplicates = 0;
  // Oldest first, so the first occurrence is the one kept.
  for (const event of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const key =
      isEventName(event.name) &&
      CATALOG[event.name].once?.scope === "view" &&
      event.view_id &&
      event.view_id !== "legacy-v1"
        ? `${event.view_id}|${onceKey(event.name, event.props)}`
        : undefined;
    if (key && seen.has(key)) {
      duplicates += 1;
      continue;
    }
    if (key) seen.add(key);
    kept.push(event);
  }
  return { events: kept, duplicates };
}

/** Visitor ids that sent `name` (optionally only with matching props). */
function visitorsWith(
  events: AnalyticsEvent[],
  name: string,
  match?: (props: AnalyticsEvent["props"]) => boolean,
): Set<string> {
  const result = new Set<string>();
  for (const e of events)
    if (e.name === name && (!match || match(e.props))) result.add(e.visitor_id);
  return result;
}

const rate = (num: number, den: number, digits = 4) =>
  den > 0 ? Math.round((num / den) * 10 ** digits) / 10 ** digits : null;

function countBy(values: Iterable<string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const v of values) result[v] = (result[v] ?? 0) + 1;
  return result;
}

/** One visitor's first-seen attributes in this arm. */
interface Profile {
  channel: string;
  source: string;
  device: string;
  viewport: string;
}

function profiles(events: AnalyticsEvent[]): Map<string, Profile> {
  const map = new Map<string, Profile>();
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const known = map.get(e.visitor_id);
    if (!known) {
      map.set(e.visitor_id, {
        channel: e.acquisition_channel,
        source: e.source,
        device: e.device ?? "unknown",
        viewport: e.viewport ?? "unknown",
      });
    } else if (known.device === "unknown" && e.device && e.device !== "unknown") {
      known.device = e.device;
      known.viewport = e.viewport ?? known.viewport;
    }
  }
  return map;
}

function bounceRate(events: AnalyticsEvent[]): { views: number; rate: number | null } {
  const views = new Map<string, { landing: boolean; engaged: boolean }>();
  for (const e of events) {
    if (!e.view_id || e.view_id === "legacy-v1") continue;
    const view = views.get(e.view_id) ?? { landing: false, engaged: false };
    if (e.name === "page_view" && LANDING.has(e.page)) view.landing = true;
    if (
      INTERACTIONS.has(e.name) ||
      (e.name === "scroll_depth" && Number(e.props.percent) >= 50) ||
      (e.name === "page_engagement" && e.props.time !== "<10s")
    )
      view.engaged = true;
    views.set(e.view_id, view);
  }
  const landing = [...views.values()].filter((v) => v.landing);
  return {
    views: landing.length,
    rate: rate(landing.filter((v) => !v.engaged).length, landing.length),
  };
}

function engagedVisitors(events: AnalyticsEvent[]): Set<string> {
  const result = new Set<string>();
  for (const e of events) {
    if (
      INTERACTIONS.has(e.name) ||
      (e.name === "scroll_depth" && Number(e.props.percent) >= 50) ||
      (e.name === "page_engagement" && e.props.time !== "<10s")
    )
      result.add(e.visitor_id);
  }
  return result;
}

function funnelFor(events: AnalyticsEvent[], paidOrders: Order[]): Funnel {
  return {
    visited: visitorsWith(events, "page_view").size,
    engaged: engagedVisitors(events).size,
    cta_click: visitorsWith(events, "cta_click").size,
    booking_opened: visitorsWith(events, "booking_opened").size,
    booking_details: visitorsWith(events, "booking_step", (p) => p.step === "details").size,
    booking_submitted: visitorsWith(events, "booking_submitted").size,
    checkout_started: visitorsWith(events, "checkout_started").size,
    paid: paidOrders.length,
  };
}

function segmentRows(
  keys: Iterable<string>,
  keyOf: (visitor: string) => string,
  events: AnalyticsEvent[],
  paidOrders: Order[],
  paidKey: (order: Order) => string,
  minCount: number,
): SegmentRow[] {
  const visitors = new Map<string, Set<string>>();
  for (const visitor of keys) {
    const key = keyOf(visitor);
    (visitors.get(key) ?? visitors.set(key, new Set()).get(key)!).add(visitor);
  }
  const opened = visitorsWith(events, "booking_opened");
  const submitted = visitorsWith(events, "booking_submitted");
  const paidBy = countBy(paidOrders.map(paidKey));
  const rows: SegmentRow[] = [];
  for (const key of new Set([...visitors.keys(), ...Object.keys(paidBy)])) {
    const members = visitors.get(key) ?? new Set<string>();
    const count = members.size;
    const paid = paidBy[key] ?? 0;
    const suppressed = count < minCount;
    rows.push({
      key,
      visitors: suppressed ? null : count,
      booking_opened: suppressed ? null : [...members].filter((v) => opened.has(v)).length,
      booking_submitted: suppressed ? null : [...members].filter((v) => submitted.has(v)).length,
      paid: suppressed ? null : paid,
      paid_rate: suppressed ? null : rate(paid, count),
      suppressed,
    });
  }
  return rows.sort((a, b) => (b.visitors ?? -1) - (a.visitors ?? -1) || a.key.localeCompare(b.key));
}

function dropOffs(
  funnel: Funnel,
  byDevice: Map<string, AnalyticsEvent[]>,
  paidByDevice: Map<string, Order[]>,
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
    for (const [device, deviceEvents] of byDevice) {
      const f = funnelFor(deviceEvents, paidByDevice.get(device) ?? []);
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
  allEvents: AnalyticsEvent[],
  orders: Order[],
  waitlistSignups: number,
  minCount: number,
): ArmInsights {
  const events = allEvents.filter((e) => e.experiment_id === experiment.id);
  const armOrders = orders.filter((o) => o.experiment_id === experiment.id);
  const paidOrders = armOrders.filter(isPaid);
  const people = profiles(events);
  const funnel = funnelFor(events, paidOrders);
  const visitors = funnel.visited;
  const revenue = paidOrders.reduce((sum, o) => sum + netRevenueCents(o), 0);

  const deviceOf = (visitor?: string) => (visitor && people.get(visitor)?.device) || "unknown";
  const byDevice = new Map<string, AnalyticsEvent[]>();
  for (const e of events) {
    const d = deviceOf(e.visitor_id);
    (byDevice.get(d) ?? byDevice.set(d, []).get(d)!).push(e);
  }
  const paidByDevice = new Map<string, Order[]>();
  for (const o of paidOrders) {
    const d = deviceOf(o.visitor_id);
    (paidByDevice.get(d) ?? paidByDevice.set(d, []).get(d)!).push(o);
  }

  const viewers = [...visitorsWith(events, "page_view")];
  const reached = visitorsWith(events, "booking_step", (p) => p.step === "details");
  const submitted = visitorsWith(events, "booking_submitted");
  const chose = visitorsWith(events, "address_suggest", (p) => p.action === "chosen");
  const reachedWith = [...reached].filter((v) => chose.has(v));
  const reachedWithout = [...reached].filter((v) => !chose.has(v));
  const bounce = bounceRate(events);
  const flyer = FLYER_ROUTES.find((r) => r.experiment_id === experiment.id);

  const errorFields: string[] = [];
  const errorKinds: string[] = [];
  const formErrors = new Map<string, { fields: Set<string>; kinds: Set<string> }>();
  for (const e of events.filter((e) => e.name === "form_error")) {
    const entry = formErrors.get(e.visitor_id) ?? { fields: new Set(), kinds: new Set() };
    for (const f of String(e.props.fields ?? "")
      .split(",")
      .filter(Boolean))
      entry.fields.add(f);
    for (const k of String(e.props.kinds ?? "")
      .split(",")
      .filter(Boolean))
      entry.kinds.add(k);
    formErrors.set(e.visitor_id, entry);
  }
  for (const entry of formErrors.values()) {
    errorFields.push(...entry.fields);
    errorKinds.push(...entry.kinds);
  }

  const uniquePer = (name: string, prop: string) => {
    const seen = new Map<string, Set<string>>();
    for (const e of events.filter((e) => e.name === name)) {
      const key = String(e.props[prop] ?? "unknown");
      (seen.get(key) ?? seen.set(key, new Set()).get(key)!).add(e.visitor_id);
    }
    return Object.fromEntries([...seen].map(([k, v]) => [k, v.size]));
  };

  const vitals: Record<string, Record<string, number>> = {};
  for (const metric of ["lcp", "inp", "cls", "ttfb"]) {
    vitals[metric] = countBy(
      events
        .filter((e) => e.name === "web_vitals" && typeof e.props[metric] === "string")
        .map((e) => String(e.props[metric])),
    );
  }

  return {
    experiment_id: experiment.id,
    name: experiment.name,
    status: experiment.status,
    flyer: flyer ? flyer.path : null,
    offer_version: experiment.offer_version,
    price_version: experiment.price_version,
    funnel,
    drop_offs: dropOffs(funnel, byDevice, paidByDevice, minCount),
    engagement: {
      landing_views: bounce.views,
      bounce_rate: bounce.rate,
      section_reach: Object.fromEntries(
        SECTIONS.map((s) => [s, visitorsWith(events, "section_view", (p) => p.section === s).size]),
      ),
      scroll_depth: Object.fromEntries(
        SCROLL_MILESTONES.map((m) => [
          String(m),
          visitorsWith(events, "scroll_depth", (p) => p.percent === m).size,
        ]),
      ),
      faq_openers: visitorsWith(events, "faq_opened").size,
      video: {
        viewers: visitorsWith(events, "video_view").size,
        ...Object.fromEntries(
          VIDEO_MILESTONES.map((m) => [
            `reached_${m}`,
            visitorsWith(events, "video_progress", (p) => p.percent === m).size,
          ]),
        ),
        unmuted: visitorsWith(events, "video_unmute").size,
      },
    },
    booking: {
      closed_at: uniquePer("booking_closed", "step"),
      checkout_cancelled_returns: visitorsWith(events, "checkout_returned").size,
      form_error_fields: countBy(errorFields),
      form_error_kinds: countBy(errorKinds),
      waitlist_switches: Object.fromEntries(
        Object.entries(uniquePer("pilot_opened", "location")).filter(([k]) =>
          ["out-of-area", "booking-closed"].includes(k),
        ),
      ),
      address_suggestions: uniquePer("address_suggest", "action"),
      submit_rate_with_suggestion:
        reachedWith.length >= minCount
          ? rate(reachedWith.filter((v) => submitted.has(v)).length, reachedWith.length)
          : null,
      submit_rate_without_suggestion:
        reachedWithout.length >= minCount
          ? rate(reachedWithout.filter((v) => submitted.has(v)).length, reachedWithout.length)
          : null,
    },
    outcomes: {
      orders_created: armOrders.length,
      orders_paid: paidOrders.length,
      revenue_cents: revenue,
      paid_per_visitor: rate(paidOrders.length, visitors),
      revenue_per_visitor_cents: visitors ? Math.round(revenue / visitors) : null,
      waitlist_signups: waitlistSignups,
    },
    by_channel: segmentRows(
      viewers,
      (v) => people.get(v)?.channel ?? "unknown",
      events,
      paidOrders,
      (o) => o.acquisition_channel,
      minCount,
    ),
    by_source: segmentRows(
      viewers,
      (v) => people.get(v)?.source ?? "unknown",
      events,
      paidOrders,
      (o) => o.source,
      minCount,
    ),
    by_device: segmentRows(
      viewers,
      deviceOf,
      events,
      paidOrders,
      (o) => deviceOf(o.visitor_id),
      minCount,
    ),
    by_viewport: segmentRows(
      viewers,
      (v) => people.get(v)?.viewport ?? "unknown",
      events,
      paidOrders,
      (o) => (o.visitor_id && people.get(o.visitor_id)?.viewport) || "unknown",
      minCount,
    ),
    health: {
      client_errors: countBy(
        events
          .filter((e) => e.name === "client_error")
          .map((e) => [e.props.kind, e.props.area, e.props.status].filter(Boolean).join(":")),
      ),
      web_vitals: vitals,
    },
  };
}

/** Net receipts account for Stripe's cumulative partial or full refunds. */
function netRevenueCents(order: Order): number {
  const refunded =
    order.refunded_amount_cents ??
    (order.payment_status === "refunded" ? order.quote.total_cents : 0);
  return Math.max(0, order.quote.total_cents - refunded);
}

export async function buildInsights(
  deps: Deps,
  window: EventWindow,
  minCount: number = MIN_REPORT_COUNT,
): Promise<Insights> {
  const [orders, waitlist, read] = await Promise.all([
    deps.repo.listOrders(),
    deps.repo.listWaitlist(),
    readEvents(deps.repo, window),
  ]);
  const inWindow = (at: string) =>
    (!window.since || at >= window.since) && (!window.until || at < window.until);
  const windowOrders = orders.filter((o) => inWindow(o.created_at));
  const { events, duplicates } = dedupeEvents(read.events);

  return {
    generated_at: deps.now().toISOString(),
    window: { since: window.since ?? null, until: window.until ?? null },
    min_count: minCount,
    events_read: read.events.length,
    events_truncated: read.truncated,
    duplicates_ignored: duplicates,
    arms: EXPERIMENTS.map((experiment) =>
      armInsights(
        experiment,
        events,
        windowOrders,
        waitlist.filter((w) => w.experiment_id === experiment.id && inWindow(w.created_at)).length,
        minCount,
      ),
    ),
    notes: [
      "Visitors are unique random browser ids; one person on two devices counts twice.",
      "Paid orders and revenue come from Stripe-confirmed orders, never from browser events.",
      "Paid by device or viewport joins an order to the device its browser first reported; orders without a matching browser id show as unknown.",
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
      `${insights.events_read} events read${insights.events_truncated ? " (TRUNCATED: narrow the window)" : ""}, ` +
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
