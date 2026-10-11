import { CATALOG, ERROR_KINDS, FORM_FIELDS, type AnalyticsEvent } from "@wkc/shared";

/**
 * Aggregates the reports need, computed where the events live. D1 answers these with a few
 * GROUP BY queries (see d1.ts), so a report never pulls raw events into the Worker; the
 * in-memory repository uses `reportFromEvents` below, which defines the same semantics and is
 * checked against the SQL by a contract test.
 *
 * Every count of people is a count of distinct random browser ids. No id leaves this module.
 */

/** One row per (arm, device, viewport, channel, source): visitors and how far they got. */
export interface StepRow {
  experiment_id: string;
  device: string;
  viewport: string;
  channel: string;
  source: string;
  /** Visitors with a page_view (the denominator everywhere). */
  visited: number;
  engaged: number;
  cta: number;
  opened: number;
  details: number;
  submitted: number;
  checkout: number;
  /** Reached details and chose an address suggestion / and then submitted. */
  details_chose: number;
  details_chose_submitted: number;
  details_typed: number;
  details_typed_submitted: number;
}

/** Distinct visitors per (arm, event, property, value) for the allowlisted breakdowns. */
export interface PropRow {
  experiment_id: string;
  name: string;
  prop: string;
  value: string;
  visitors: number;
}

export interface NameRow {
  experiment_id: string;
  name: string;
  visitors: number;
}

export interface ViewRow {
  experiment_id: string;
  landing_views: number;
  bounced: number;
}

export interface FormErrorRow {
  experiment_id: string;
  kind: "field" | "kind";
  value: string;
  visitors: number;
}

export interface AnalyticsReport {
  events_read: number;
  /** Repeats of once-per-view events (same page load, same event and props). */
  duplicates: number;
  steps: StepRow[];
  props: PropRow[];
  names: NameRow[];
  views: ViewRow[];
  form_errors: FormErrorRow[];
}

export interface VisitorProfile {
  visitor_id: string;
  device: string;
  viewport: string;
}

/** Breakdowns reported per value. Paths are fixed here, never taken from a request. */
export const PROP_BREAKDOWNS: readonly { name: string; prop: string }[] = [
  { name: "section_view", prop: "section" },
  { name: "scroll_depth", prop: "percent" },
  { name: "video_progress", prop: "percent" },
  { name: "booking_closed", prop: "step" },
  { name: "address_suggest", prop: "action" },
  { name: "pilot_opened", prop: "location" },
  { name: "web_vitals", prop: "lcp" },
  { name: "web_vitals", prop: "inp" },
  { name: "web_vitals", prop: "cls" },
  { name: "web_vitals", prop: "ttfb" },
  { name: "client_error", prop: "kind" },
  { name: "client_error", prop: "area" },
];

export const LANDING_ROUTES = ["/", "/a", "/b", "other"] as const;
export const INTERACTIONS = [
  "cta_click",
  "booking_opened",
  "pilot_opened",
  "faq_opened",
  "video_view",
] as const;

/** Events whose repeats within one page load are duplicates (catalog `once` per view). */
export const ONCE_PER_VIEW = Object.entries(CATALOG)
  .filter(([, spec]) => spec.once?.scope === "view")
  .map(([name]) => name);

const listHas = (list: unknown, item: string) =>
  typeof list === "string" && `,${list},`.includes(`,${item},`);

export function isEngaging(e: Pick<AnalyticsEvent, "name" | "props">): boolean {
  return (
    (INTERACTIONS as readonly string[]).includes(e.name) ||
    (e.name === "scroll_depth" && Number(e.props.percent) >= 50) ||
    (e.name === "page_engagement" && e.props.time !== undefined && e.props.time !== "<10s")
  );
}

/** Reference implementation (memory repository, tests). Same semantics as the D1 SQL. */
export function reportFromEvents(events: AnalyticsEvent[]): AnalyticsReport {
  // Duplicates.
  let onceRows = 0;
  const onceKeys = new Set<string>();
  for (const e of events) {
    if (!ONCE_PER_VIEW.includes(e.name)) continue;
    onceRows += 1;
    onceKeys.add(`${e.view_id ?? ""}|${e.name}|${JSON.stringify(e.props)}`);
  }

  // Per visitor, per arm.
  interface Facts {
    experiment_id: string;
    pvDevice?: string;
    anyDevice?: string;
    pvViewport?: string;
    anyViewport?: string;
    pvChannel?: string;
    anyChannel?: string;
    pvSource?: string;
    anySource?: string;
    flags: Set<string>;
  }
  const visitors = new Map<string, Facts>();
  const maxStr = (a: string | undefined, b: string | undefined) =>
    a === undefined ? b : b === undefined ? a : a > b ? a : b;
  for (const e of events) {
    const key = `${e.experiment_id}\u0000${e.visitor_id}`;
    const f = visitors.get(key) ?? { experiment_id: e.experiment_id, flags: new Set<string>() };
    visitors.set(key, f);
    if (e.name === "page_view") {
      f.pvDevice = maxStr(f.pvDevice, e.device);
      f.pvViewport = maxStr(f.pvViewport, e.viewport);
      f.pvChannel = maxStr(f.pvChannel, e.acquisition_channel);
      f.pvSource = maxStr(f.pvSource, e.source);
      f.flags.add("visited");
    }
    f.anyDevice = maxStr(f.anyDevice, e.device);
    f.anyViewport = maxStr(f.anyViewport, e.viewport);
    f.anyChannel = maxStr(f.anyChannel, e.acquisition_channel);
    f.anySource = maxStr(f.anySource, e.source);
    if (isEngaging(e)) f.flags.add("engaged");
    if (e.name === "cta_click") f.flags.add("cta");
    if (e.name === "booking_opened") f.flags.add("opened");
    if (e.name === "booking_step" && e.props.step === "details") f.flags.add("details");
    if (e.name === "booking_submitted") f.flags.add("submitted");
    if (e.name === "checkout_started") f.flags.add("checkout");
    if (e.name === "address_suggest" && e.props.action === "chosen") f.flags.add("chose");
  }
  const steps = new Map<string, StepRow>();
  for (const f of visitors.values()) {
    const device = f.pvDevice ?? f.anyDevice ?? "unknown";
    const viewport = f.pvViewport ?? f.anyViewport ?? "unknown";
    const channel = f.pvChannel ?? f.anyChannel ?? "unknown";
    const source = f.pvSource ?? f.anySource ?? "unknown";
    const key = [f.experiment_id, device, viewport, channel, source].join("\u0000");
    const row =
      steps.get(key) ??
      steps
        .set(key, {
          experiment_id: f.experiment_id,
          device,
          viewport,
          channel,
          source,
          visited: 0,
          engaged: 0,
          cta: 0,
          opened: 0,
          details: 0,
          submitted: 0,
          checkout: 0,
          details_chose: 0,
          details_chose_submitted: 0,
          details_typed: 0,
          details_typed_submitted: 0,
        })
        .get(key)!;
    const has = (flag: string) => (f.flags.has(flag) ? 1 : 0);
    row.visited += has("visited");
    row.engaged += has("engaged");
    row.cta += has("cta");
    row.opened += has("opened");
    row.details += has("details");
    row.submitted += has("submitted");
    row.checkout += has("checkout");
    const details = f.flags.has("details");
    const chose = f.flags.has("chose");
    row.details_chose += details && chose ? 1 : 0;
    row.details_chose_submitted += details && chose ? has("submitted") : 0;
    row.details_typed += details && !chose ? 1 : 0;
    row.details_typed_submitted += details && !chose ? has("submitted") : 0;
  }

  // Distinct visitors per property value and per event name.
  const distinct = new Map<string, Set<string>>();
  const add = (key: string, visitor: string) =>
    (distinct.get(key) ?? distinct.set(key, new Set()).get(key)!).add(visitor);
  for (const e of events) {
    add(`n\u0000${e.experiment_id}\u0000${e.name}`, e.visitor_id);
    for (const b of PROP_BREAKDOWNS) {
      const value = e.props[b.prop];
      if (e.name === b.name && value !== undefined)
        add(
          `p\u0000${e.experiment_id}\u0000${b.name}\u0000${b.prop}\u0000${String(value)}`,
          e.visitor_id,
        );
    }
    if (e.name === "form_error") {
      for (const field of FORM_FIELDS)
        if (listHas(e.props.fields, field))
          add(`f\u0000${e.experiment_id}\u0000field\u0000${field}`, e.visitor_id);
      for (const kind of ERROR_KINDS)
        if (listHas(e.props.kinds, kind))
          add(`f\u0000${e.experiment_id}\u0000kind\u0000${kind}`, e.visitor_id);
    }
  }
  const props: PropRow[] = [];
  const names: NameRow[] = [];
  const form_errors: FormErrorRow[] = [];
  for (const [key, set] of distinct) {
    const [type, experiment_id, a, b, c] = key.split("\u0000") as [
      string,
      string,
      string,
      string,
      string,
    ];
    if (type === "n") names.push({ experiment_id, name: a, visitors: set.size });
    if (type === "p") props.push({ experiment_id, name: a, prop: b, value: c, visitors: set.size });
    if (type === "f")
      form_errors.push({
        experiment_id,
        kind: a as "field" | "kind",
        value: b,
        visitors: set.size,
      });
  }

  // Bounces per landing page load.
  const views = new Map<string, { experiment_id: string; landing: boolean; engaged: boolean }>();
  for (const e of events) {
    if (!e.view_id || e.view_id === "legacy-v1") continue;
    const key = `${e.experiment_id}\u0000${e.view_id}`;
    const v = views.get(key) ?? { experiment_id: e.experiment_id, landing: false, engaged: false };
    views.set(key, v);
    if (e.name === "page_view" && (LANDING_ROUTES as readonly string[]).includes(e.page))
      v.landing = true;
    if (isEngaging(e)) v.engaged = true;
  }
  const viewRows = new Map<string, ViewRow>();
  for (const v of views.values()) {
    if (!v.landing) continue;
    const row =
      viewRows.get(v.experiment_id) ??
      viewRows
        .set(v.experiment_id, { experiment_id: v.experiment_id, landing_views: 0, bounced: 0 })
        .get(v.experiment_id)!;
    row.landing_views += 1;
    if (!v.engaged) row.bounced += 1;
  }

  return {
    events_read: events.length,
    duplicates: onceRows - onceKeys.size,
    steps: [...steps.values()],
    props,
    names,
    views: [...viewRows.values()],
    form_errors,
  };
}

/** Order-independent form for comparing two reports (contract tests). */
export function canonicalReport(report: AnalyticsReport): AnalyticsReport {
  const sort = <T>(rows: T[]) =>
    [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    ...report,
    steps: sort(report.steps),
    props: sort(report.props),
    names: sort(report.names),
    views: sort(report.views),
    form_errors: sort(report.form_errors),
  };
}

/** Report window: `since` inclusive, `until` exclusive (ISO timestamps). */
export interface ReportWindow {
  since?: string;
  until?: string;
}

/** Paid-order joins look visitors up in chunks of this size (bounded IN lists). */
export const PROFILE_CHUNK = 50;

/** Device and viewport each visitor's page views reported (reference implementation). */
export function profilesFromEvents(
  events: AnalyticsEvent[],
  visitorIds: string[],
): VisitorProfile[] {
  const wanted = new Set(visitorIds);
  const found = new Map<string, VisitorProfile>();
  for (const e of events) {
    if (e.name !== "page_view" || !wanted.has(e.visitor_id)) continue;
    const p = found.get(e.visitor_id) ?? { visitor_id: e.visitor_id, device: "", viewport: "" };
    if ((e.device ?? "") > p.device) p.device = e.device ?? "";
    if ((e.viewport ?? "") > p.viewport) p.viewport = e.viewport ?? "";
    found.set(e.visitor_id, p);
  }
  return [...found.values()].map((p) => ({
    ...p,
    device: p.device || "unknown",
    viewport: p.viewport || "unknown",
  }));
}
