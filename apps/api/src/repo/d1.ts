import {
  ERROR_KINDS,
  ANALYTICS_SOURCES,
  EXPERIMENTS,
  ACQUISITION_CHANNELS,
  DEVICE_CLASSES,
  VIEWPORT_BANDS,
  CATALOG,
  MAX_EVENTS_PER_VIEW,
  FORM_FIELDS,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";
import { emptyCommerce, type CommerceArm } from "./commerce-report.ts";
import {
  INTERACTIONS,
  LANDING_ROUTES,
  ONCE_PER_VIEW,
  PROFILE_CHUNK,
  PROP_BREAKDOWNS,
  type AnalyticsReport,
  type FormErrorRow,
  type HourRow,
  type NameRow,
  type PropRow,
  type ReportWindow,
  type StepRow,
  type ViewRow,
  type VisitorProfile,
} from "./analytics-report.ts";
import {
  OrderWriteConflict,
  eventExpiresAt,
  type ListEventsOptions,
  type ListOrdersOptions,
  type Repository,
} from "./types.ts";

/** Structural D1 types keep the existing Node-only API build independent. */
export interface D1Statement {
  bind(...values: (string | number | null)[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  /** D1 runs a batch as one transaction; absent in some test doubles. */
  batch?(statements: D1Statement[]): Promise<unknown[]>;
}

interface DataRow {
  data: string;
}

const DEFAULT_LIMIT = 5000;
const limitValue = (value?: number) =>
  value === undefined || !Number.isFinite(value)
    ? DEFAULT_LIMIT
    : Math.max(1, Math.min(DEFAULT_LIMIT, Math.trunc(value)));

/** All customer data stays behind the API; the frontend never receives a D1 binding. */
export class D1Repository implements Repository {
  constructor(private readonly db: D1Database) {}

  async putOrder(order: Order): Promise<void> {
    const previousRevision = order.revision;
    const nextRevision = (previousRevision ?? 0) + 1;
    const updated = { ...order, revision: nextRevision };
    const result =
      previousRevision === undefined
        ? await this.db
            .prepare(
              "INSERT INTO orders (id, created_at, updated_at, customer_email, experiment_id, data) " +
                "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
            )
            .bind(
              order.id,
              order.created_at,
              order.updated_at,
              order.customer.email.trim().toLowerCase(),
              order.experiment_id,
              JSON.stringify(updated),
            )
            .run()
        : await this.db
            .prepare(
              "UPDATE orders SET updated_at = ?, customer_email = ?, experiment_id = ?, data = ? " +
                "WHERE id = ? AND COALESCE(json_extract(data, '$.revision'), 0) = ?",
            )
            .bind(
              order.updated_at,
              order.customer.email.trim().toLowerCase(),
              order.experiment_id,
              JSON.stringify(updated),
              order.id,
              previousRevision,
            )
            .run();
    if (result.meta.changes !== 1) throw new OrderWriteConflict("Order changed during update");
    order.revision = nextRevision;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const row = await this.db
      .prepare("SELECT data FROM orders WHERE id = ?")
      .bind(id)
      .first<DataRow>();
    if (!row) return undefined;
    const order = JSON.parse(row.data) as Order;
    order.revision ??= 0; // Existing staging rows created before revision tracking.
    return order;
  }

  async listOrders(options: ListOrdersOptions = {}): Promise<Order[]> {
    const query = options.experiment_id
      ? "SELECT data FROM orders WHERE experiment_id = ? ORDER BY created_at DESC LIMIT ?"
      : "SELECT data FROM orders ORDER BY created_at DESC LIMIT ?";
    const statement = this.db.prepare(query);
    const rows = options.experiment_id
      ? await statement.bind(options.experiment_id, limitValue(options.limit)).all<DataRow>()
      : await statement.bind(limitValue(options.limit)).all<DataRow>();
    return rows.results.map((row) => {
      const order = JSON.parse(row.data) as Order;
      order.revision ??= 0;
      return order;
    });
  }

  async findOrdersByEmail(email: string): Promise<Order[]> {
    const rows = await this.db
      .prepare("SELECT data FROM orders WHERE customer_email = ? ORDER BY created_at DESC LIMIT ?")
      .bind(email.trim().toLowerCase(), DEFAULT_LIMIT)
      .all<DataRow>();
    return rows.results.map((row) => {
      const order = JSON.parse(row.data) as Order;
      order.revision ??= 0;
      return order;
    });
  }

  async putWaitlistEntry(entry: WaitlistEntry): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO waitlist (id, created_at, email, data) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
      )
      .bind(entry.id, entry.created_at, entry.email.trim().toLowerCase(), JSON.stringify(entry))
      .run();
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .prepare("SELECT data FROM waitlist ORDER BY created_at DESC LIMIT ?")
      .bind(DEFAULT_LIMIT)
      .all<DataRow>();
    return rows.results.map((row) => JSON.parse(row.data) as WaitlistEntry);
  }

  async putEvents(events: AnalyticsEvent[]): Promise<void> {
    const statements = events.map((event) =>
      this.db
        .prepare(
          "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) " +
            "SELECT ?, ?, ?, ?, ? WHERE " +
            "NOT EXISTS (SELECT 1 FROM analytics_deletions WHERE visitor_id = ? AND owner = ?) " +
            "AND (SELECT COUNT(*) FROM analytics_events WHERE json_extract(data, '$.view_id') = ? AND (? <> 'legacy-v1' OR json_extract(data, '$.visitor_id') = ?)) < ? " +
            "AND NOT EXISTS (SELECT 1 FROM analytics_events WHERE json_extract(data, '$.view_id') = ? AND (? <> 'legacy-v1' OR json_extract(data, '$.visitor_id') = ?) " +
            "AND (json_extract(data, '$.visitor_id') <> ? OR COALESCE(json_extract(data, '$.owner'), '') <> ? " +
            "OR experiment_id <> ? OR json_extract(data, '$.source') <> ? " +
            "OR json_extract(data, '$.acquisition_channel') <> ? OR json_extract(data, '$.page') <> ?)) " +
            "ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          event.id,
          event.created_at,
          event.experiment_id,
          eventExpiresAt(event.created_at),
          JSON.stringify(event),
          event.visitor_id,
          event.owner ?? "",
          event.view_id ?? event.id,
          event.view_id ?? event.id,
          event.visitor_id,
          MAX_EVENTS_PER_VIEW,
          event.view_id ?? event.id,
          event.view_id ?? event.id,
          event.visitor_id,
          event.visitor_id,
          event.owner ?? "",
          event.experiment_id,
          event.source,
          event.acquisition_channel,
          event.page,
        ),
    );
    if (statements.length === 0) return;
    if (this.db.batch) await this.db.batch(statements);
    else for (const statement of statements) await statement.run();
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    const clauses = ["expires_at > CAST(strftime('%s', 'now') AS INTEGER)"];
    const values: (string | number)[] = [];
    if (options.since) {
      clauses.push("created_at >= ?");
      values.push(options.since);
    }
    if (options.until) {
      clauses.push("created_at < ?");
      values.push(options.until);
    }
    if (options.before) {
      clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
      values.push(options.before.created_at, options.before.created_at, options.before.id);
    }
    const rows = await this.db
      .prepare(
        "SELECT data FROM analytics_events WHERE " +
          clauses.join(" AND ") +
          " ORDER BY created_at DESC, id DESC LIMIT ?",
      )
      .bind(...values, limitValue(options.limit))
      .all<DataRow>();
    return rows.results.map((row) => JSON.parse(row.data) as AnalyticsEvent);
  }

  async deleteVisitorEvents(visitorId: string, ownerHash: string): Promise<number> {
    const tombstone = this.db
      .prepare(
        "INSERT INTO analytics_deletions(visitor_id, owner, expires_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(visitor_id, owner) DO UPDATE SET expires_at = MAX(expires_at, excluded.expires_at)",
      )
      .bind(visitorId, ownerHash, Math.floor(Date.now() / 1000) + 90 * 86400);
    const remove = this.db
      .prepare(
        "DELETE FROM analytics_events WHERE json_extract(data, '$.visitor_id') = ? AND json_extract(data, '$.owner') = ?",
      )
      .bind(visitorId, ownerHash);
    if (this.db.batch) {
      const results = (await this.db.batch([tombstone, remove])) as { meta: { changes: number } }[];
      return results[1]?.meta.changes ?? 0;
    }
    await tombstone.run(); // tombstone first also protects adapters without batch support
    return (await remove.run()).meta.changes;
  }

  /**
   * Report aggregates computed inside D1: six GROUP BY queries over the window, each one
   * indexed range scan of `analytics_events`. Only aggregate rows (bounded by arms × device ×
   * viewport × channel × source, and by the allowlisted enums) come back to the Worker.
   */
  async analyticsReport(window: ReportWindow = {}): Promise<AnalyticsReport> {
    const clauses = ["expires_at > CAST(strftime('%s', 'now') AS INTEGER)"];
    const values: string[] = [];
    if (window.since) {
      clauses.push("created_at >= ?");
      values.push(window.since);
    }
    if (window.until) {
      clauses.push("created_at < ?");
      values.push(window.until);
    }
    const list = (items: readonly string[]) => items.map((i) => `'${i}'`).join(", ");
    const canonical = (expr: string, allowed: readonly string[], fallback: string) =>
      `CASE WHEN ${expr} IN (${list(allowed)}) THEN ${expr} ELSE '${fallback}' END`;
    const j = (field: string) => `json_extract(data, '$.${field}')`;
    const base =
      "WITH e AS (SELECT id, created_at, " +
      canonical(
        "experiment_id",
        EXPERIMENTS.map((e) => e.id),
        "unknown",
      ) +
      " AS exp, " +
      `${j("visitor_id")} AS vid, ${j("view_id")} AS view_id, ` +
      `${canonical(j("name"), Object.keys(CATALOG), "unknown")} AS name, ${canonical(j("page"), [...LANDING_ROUTES, "/thanks"], "other")} AS page, ` +
      `${canonical(j("device"), DEVICE_CLASSES, "unknown")} AS device, ${canonical(j("viewport"), VIEWPORT_BANDS, "unknown")} AS viewport, ` +
      `${canonical(j("acquisition_channel"), ACQUISITION_CHANNELS, "other")} AS channel, ` +
      `${canonical(j("source"), ANALYTICS_SOURCES, "other")} AS source, ${j("props")} AS props ` +
      `FROM analytics_events WHERE ${clauses.join(" AND ")}) `;
    const all = async <T>(sql: string) =>
      (
        await this.db
          .prepare(base + sql)
          .bind(...values)
          .all<T>()
      ).results;
    const engaging =
      `(name IN (${list(INTERACTIONS)}) ` +
      "OR (name = 'scroll_depth' AND json_extract(props, '$.percent') >= 50) " +
      "OR (name = 'page_engagement' AND COALESCE(json_extract(props, '$.time'), '<10s') <> '<10s'))";
    const flag = (expr: string) => `COALESCE(MAX(CASE WHEN ${expr} THEN 1 ELSE 0 END), 0)`;
    // One first page-view row supplies every dimension together (then first event fallback).
    const ranked =
      ", ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY exp, vid ORDER BY CASE WHEN name = 'page_view' THEN 0 ELSE 1 END, created_at, id) AS rn FROM e)";
    const pick = (col: string) => `MAX(CASE WHEN rn = 1 THEN ${col} END)`;

    // A landing visit: a page view of anything but the thank-you page (see isLandingView).
    const landing = "name = 'page_view' AND page <> '/thanks'";
    const [totals, steps, props, names, views, errors, hours] = await Promise.all([
      all<{ events_read: number; duplicates: number }>(
        "SELECT (SELECT COUNT(*) FROM e) AS events_read, " +
          "(SELECT COUNT(*) - COUNT(DISTINCT COALESCE(view_id, '') || '|' || name || '|' || props) " +
          `FROM e WHERE name IN (${list(ONCE_PER_VIEW)})) AS duplicates`,
      ),
      all<StepRow>(
        ranked +
          `, v AS (SELECT exp, vid, ${pick("device")} AS device, ${pick("viewport")} AS viewport, ` +
          `${pick("channel")} AS channel, ${pick("source")} AS source, ` +
          `${flag(landing)} AS visited, ${flag(engaging)} AS engaged, ` +
          "MIN(CASE WHEN name = 'page_view' THEN 1 ELSE 0 END) AS only_views, " +
          `${flag("name = 'cta_click'")} AS cta, ${flag("name = 'booking_opened'")} AS opened, ` +
          `${flag("name = 'booking_step' AND json_extract(props, '$.step') = 'details'")} AS details, ` +
          `${flag("name = 'booking_submitted'")} AS submitted, ` +
          `${flag("name = 'checkout_started'")} AS checkout, ` +
          `${flag("name = 'address_suggest' AND json_extract(props, '$.action') = 'chosen'")} AS chose ` +
          "FROM ranked GROUP BY exp, vid) " +
          "SELECT exp AS experiment_id, device, viewport, channel, source, " +
          "SUM(visited) AS visited, SUM(visited * only_views) AS view_only, " +
          "SUM(engaged) AS engaged, SUM(cta) AS cta, SUM(opened) AS opened, " +
          "SUM(details) AS details, SUM(submitted) AS submitted, SUM(checkout) AS checkout, " +
          "SUM(details * chose) AS details_chose, SUM(details * chose * submitted) AS details_chose_submitted, " +
          "SUM(details * (1 - chose)) AS details_typed, " +
          "SUM(details * (1 - chose) * submitted) AS details_typed_submitted " +
          "FROM v GROUP BY exp, device, viewport, channel, source",
      ),
      all<PropRow>(
        PROP_BREAKDOWNS.map(({ name, prop }) => {
          const spec = CATALOG[name as keyof typeof CATALOG].props[prop];
          const allowed = spec?.kind === "enum" ? spec.values.map(String) : [];
          return (
            `SELECT exp AS experiment_id, '${name}' AS name, '${prop}' AS prop, ` +
            `CAST(json_extract(props, '$.${prop}') AS TEXT) AS value, COUNT(DISTINCT vid) AS visitors ` +
            `FROM e WHERE name = '${name}' AND CAST(json_extract(props, '$.${prop}') AS TEXT) IN (${list(allowed)}) ` +
            "GROUP BY exp, value"
          );
        }).join(" UNION ALL "),
      ),
      all<NameRow>(
        "SELECT exp AS experiment_id, name, COUNT(DISTINCT vid) AS visitors FROM e GROUP BY exp, name",
      ),
      all<ViewRow>(
        ", w AS (SELECT exp, view_id, " +
          `${flag(`name = 'page_view' AND page IN (${list(LANDING_ROUTES)})`)} AS landing, ` +
          `${flag(engaging)} AS engaged FROM e ` +
          "WHERE view_id IS NOT NULL AND view_id <> 'legacy-v1' GROUP BY exp, view_id) " +
          "SELECT exp AS experiment_id, COUNT(*) AS landing_views, SUM(1 - engaged) AS bounced " +
          "FROM w WHERE landing = 1 GROUP BY exp",
      ),
      all<Record<string, string | number>>(
        "SELECT exp AS experiment_id, " +
          [
            ...FORM_FIELDS.map((f) => ["fields", "field", f] as const),
            ...ERROR_KINDS.map((k) => ["kinds", "kind", k] as const),
          ]
            .map(
              ([prop, kind, value]) =>
                `COUNT(DISTINCT CASE WHEN instr(',' || COALESCE(json_extract(props, '$.${prop}'), '') || ',', ',${value},') > 0 THEN vid END) AS "${kind}:${value}"`,
            )
            .join(", ") +
          " FROM e WHERE name = 'form_error' GROUP BY exp",
      ),
      all<HourRow>(
        `, l AS (SELECT exp, vid, MIN(created_at) AS landed FROM e WHERE ${landing} GROUP BY exp, vid) ` +
          "SELECT exp AS experiment_id, substr(landed, 1, 13) AS hour, COUNT(*) AS visitors " +
          "FROM l GROUP BY exp, hour",
      ),
    ]);

    const form_errors: FormErrorRow[] = [];
    for (const row of errors) {
      for (const [column, count] of Object.entries(row)) {
        if (column === "experiment_id" || !Number(count)) continue;
        const [kind, value] = column.split(":") as ["field" | "kind", string];
        form_errors.push({
          experiment_id: String(row.experiment_id),
          kind,
          value,
          visitors: Number(count),
        });
      }
    }
    const numeric = <T extends object>(rows: T[]) =>
      rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([k, v]) => [k, typeof v === "bigint" ? Number(v) : v]),
        ),
      ) as T[];
    return {
      events_read: Number(totals[0]?.events_read ?? 0),
      duplicates: Number(totals[0]?.duplicates ?? 0),
      steps: numeric(steps),
      props: numeric(props),
      names: numeric(names),
      views: numeric(views),
      form_errors,
      hours: numeric(hours),
    };
  }

  /** Window filters precede aggregation: no list limit and no customer JSON returned. */
  async commerceReport(window: ReportWindow = {}): Promise<CommerceArm[]> {
    const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(",");
    const j = (key: string) => `json_extract(o.data, '$.${key}')`;
    const canonical = (expr: string, values: readonly string[], fallback: string) =>
      `CASE WHEN ${expr} IN (${list(values)}) THEN ${expr} ELSE '${fallback}' END`;
    const bounds = (column: string) =>
      `${window.since ? ` AND ${column} >= ?` : ""}${window.until ? ` AND ${column} < ?` : ""}`;
    const values = [window.since, window.until].filter((v): v is string => Boolean(v));
    const base =
      `WITH o AS (SELECT * FROM orders WHERE experiment_id IN (${list(EXPERIMENTS.map((e) => e.id))})${bounds("created_at")}), facts AS (` +
      // A fully refunded order is not a paid order (partial refunds stay paid, net of the refund).
      `SELECT experiment_id, ${j("payment_status")} = 'paid' AS paid, ${j("payment_status")} = 'refunded' AS refunded, ` +
      `MAX(0, ${j("quote.total_cents")} - COALESCE(${j("refunded_amount_cents")}, CASE WHEN ${j("payment_status")} = 'refunded' THEN ${j("quote.total_cents")} ELSE 0 END)) AS revenue, ` +
      `${j("number_of_knives")} AS knives, COALESCE(${j("is_repeat_customer")},0) AS repeat_customer, COALESCE(${j("actual_repeat_purchase")},0) AS repeat_purchase, ` +
      `${canonical(j("repeat_intent"), ["yes", "maybe", "no", "unknown"], "unknown")} AS repeat_intent, ${j("time_to_fulfill_hours")} AS hours, ` +
      `${canonical(j("source"), ANALYTICS_SOURCES, "other")} AS source, ${canonical(j("acquisition_channel"), ACQUISITION_CHANNELS, "other")} AS channel, ` +
      `(SELECT e.data FROM analytics_events e WHERE json_extract(e.data,'$.visitor_id') = ${j("visitor_id")} ` +
      `AND e.experiment_id = o.experiment_id AND json_extract(e.data,'$.name') = 'page_view' AND json_extract(e.data,'$.page') <> '/thanks' ` +
      `AND e.expires_at > CAST(strftime('%s','now') AS INTEGER) AND e.created_at <= o.created_at${bounds("e.created_at")} ` +
      `ORDER BY e.created_at, e.id LIMIT 1) AS profile FROM o) `;
    const all = async <T>(sql: string) =>
      (
        await this.db
          .prepare(base + sql)
          .bind(...values, ...values)
          .all<T>()
      ).results;
    const [totals, intents, segments, waitlist] = await Promise.all([
      all<Record<string, string | number>>(
        "SELECT experiment_id, COUNT(*) AS orders_created, SUM(paid) AS orders_paid, SUM(refunded) AS orders_refunded, SUM(paid AND profile IS NOT NULL) AS paid_with_visit, SUM(paid * revenue) AS revenue_cents, SUM(CASE WHEN paid AND profile IS NOT NULL THEN revenue ELSE 0 END) AS revenue_with_visit_cents, SUM(paid * knives) AS knives, SUM(paid * repeat_customer) AS repeat_customers, SUM(paid * repeat_purchase) AS repeat_purchases, SUM(CASE WHEN paid THEN COALESCE(hours,0) ELSE 0 END) AS fulfill_hours, SUM(paid AND hours IS NOT NULL) AS fulfilled FROM facts GROUP BY experiment_id",
      ),
      all<{ experiment_id: string; value: string; count: number }>(
        "SELECT experiment_id, repeat_intent AS value, COUNT(*) AS count FROM facts WHERE paid GROUP BY experiment_id, repeat_intent",
      ),
      all<{
        experiment_id: string;
        source: string;
        channel: string;
        device: string;
        viewport: string;
        paid: number;
        revenue_cents: number;
      }>(
        `SELECT experiment_id, source, channel, ${canonical("json_extract(profile,'$.device')", DEVICE_CLASSES, "unknown")} AS device, ` +
          `${canonical("json_extract(profile,'$.viewport')", VIEWPORT_BANDS, "unknown")} AS viewport, COUNT(*) AS paid, SUM(revenue) AS revenue_cents FROM facts WHERE paid GROUP BY experiment_id, source, channel, device, viewport`,
      ),
      this.db
        .prepare(
          `SELECT json_extract(data, '$.experiment_id') AS experiment_id, COUNT(*) AS count FROM waitlist WHERE json_extract(data, '$.experiment_id') IN (${list(EXPERIMENTS.map((e) => e.id))})${bounds("created_at")} GROUP BY experiment_id`,
        )
        .bind(...values)
        .all<{ experiment_id: string; count: number }>(),
    ]);
    const add = (counts: Record<string, number>, key: string, count: number) => {
      counts[key] = (counts[key] ?? 0) + Number(count);
    };
    return EXPERIMENTS.map((exp) => {
      const arm = emptyCommerce(exp.id);
      const total = totals.find((t) => t.experiment_id === exp.id);
      if (total)
        for (const key of [
          "orders_created",
          "orders_paid",
          "orders_refunded",
          "paid_with_visit",
          "revenue_cents",
          "revenue_with_visit_cents",
          "knives",
          "repeat_customers",
          "repeat_purchases",
          "fulfill_hours",
          "fulfilled",
        ] as const)
          arm[key] = Number(total[key] ?? 0);
      arm.waitlist_signups = Number(
        waitlist.results.find((w) => w.experiment_id === exp.id)?.count ?? 0,
      );
      for (const row of intents.filter((i) => i.experiment_id === exp.id))
        arm.repeat_intent[row.value] = Number(row.count);
      for (const row of segments.filter((s) => s.experiment_id === exp.id)) {
        const b = (arm.by_channel[row.channel] ??= { paid: 0, revenue_cents: 0 });
        b.paid += Number(row.paid);
        b.revenue_cents += Number(row.revenue_cents);
        add(arm.by_source, row.source, row.paid);
        add(arm.by_device, row.device, row.paid);
        add(arm.by_viewport, row.viewport, row.paid);
      }
      return arm;
    });
  }

  /** Device and viewport for the given visitors' page views (bounded IN lists). */
  async visitorProfiles(
    visitorIds: string[],
    window: ReportWindow = {},
  ): Promise<VisitorProfile[]> {
    const out: VisitorProfile[] = [];
    for (let i = 0; i < visitorIds.length; i += PROFILE_CHUNK) {
      const chunk = visitorIds.slice(i, i + PROFILE_CHUNK);
      const bounds = `${window.since ? " AND created_at >= ?" : ""}${window.until ? " AND created_at < ?" : ""}`;
      const rows = await this.db
        .prepare(
          "WITH ranked AS (SELECT json_extract(data,'$.visitor_id') AS visitor_id, " +
            "COALESCE(json_extract(data,'$.device'),'unknown') AS device, COALESCE(json_extract(data,'$.viewport'),'unknown') AS viewport, " +
            "ROW_NUMBER() OVER (PARTITION BY json_extract(data,'$.visitor_id') ORDER BY created_at, id) AS rn " +
            "FROM analytics_events WHERE json_extract(data,'$.visitor_id') IN (" +
            chunk.map(() => "?").join(",") +
            ") AND json_extract(data,'$.name') = 'page_view' AND json_extract(data,'$.page') <> '/thanks' " +
            "AND expires_at > CAST(strftime('%s','now') AS INTEGER)" +
            bounds +
            ") SELECT visitor_id, device, viewport FROM ranked WHERE rn = 1",
        )
        .bind(...chunk, ...[window.since, window.until].filter((v): v is string => Boolean(v)))
        .all<VisitorProfile>();
      out.push(...rows.results);
    }
    return out;
  }
}
