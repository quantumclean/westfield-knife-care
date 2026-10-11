import {
  ERROR_KINDS,
  FORM_FIELDS,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";
import {
  INTERACTIONS,
  LANDING_ROUTES,
  ONCE_PER_VIEW,
  PROFILE_CHUNK,
  PROP_BREAKDOWNS,
  type AnalyticsReport,
  type FormErrorRow,
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
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(
          event.id,
          event.created_at,
          event.experiment_id,
          eventExpiresAt(event.created_at),
          JSON.stringify(event),
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
    const result = await this.db
      .prepare(
        "DELETE FROM analytics_events WHERE json_extract(data, '$.visitor_id') = ? " +
          "AND json_extract(data, '$.owner') = ?",
      )
      .bind(visitorId, ownerHash)
      .run();
    return result.meta.changes;
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
    const base =
      "WITH e AS (SELECT experiment_id AS exp, " +
      "json_extract(data, '$.visitor_id') AS vid, json_extract(data, '$.view_id') AS view_id, " +
      "json_extract(data, '$.name') AS name, json_extract(data, '$.page') AS page, " +
      "json_extract(data, '$.device') AS device, json_extract(data, '$.viewport') AS viewport, " +
      "json_extract(data, '$.acquisition_channel') AS channel, " +
      "json_extract(data, '$.source') AS source, json_extract(data, '$.props') AS props " +
      `FROM analytics_events WHERE ${clauses.join(" AND ")}) `;
    const all = async <T>(sql: string) =>
      (
        await this.db
          .prepare(base + sql)
          .bind(...values)
          .all<T>()
      ).results;
    const list = (items: readonly string[]) => items.map((i) => `'${i}'`).join(", ");
    const engaging =
      `(name IN (${list(INTERACTIONS)}) ` +
      "OR (name = 'scroll_depth' AND json_extract(props, '$.percent') >= 50) " +
      "OR (name = 'page_engagement' AND COALESCE(json_extract(props, '$.time'), '<10s') <> '<10s'))";
    const flag = (expr: string) => `COALESCE(MAX(CASE WHEN ${expr} THEN 1 ELSE 0 END), 0)`;
    const pick = (col: string) =>
      `COALESCE(MAX(CASE WHEN name = 'page_view' THEN ${col} END), MAX(${col}), 'unknown')`;

    const [totals, steps, props, names, views, errors] = await Promise.all([
      all<{ events_read: number; duplicates: number }>(
        "SELECT (SELECT COUNT(*) FROM e) AS events_read, " +
          "(SELECT COUNT(*) - COUNT(DISTINCT COALESCE(view_id, '') || '|' || name || '|' || props) " +
          `FROM e WHERE name IN (${list(ONCE_PER_VIEW)})) AS duplicates`,
      ),
      all<StepRow>(
        `, v AS (SELECT exp, vid, ${pick("device")} AS device, ${pick("viewport")} AS viewport, ` +
          `${pick("channel")} AS channel, ${pick("source")} AS source, ` +
          `${flag("name = 'page_view'")} AS visited, ${flag(engaging)} AS engaged, ` +
          `${flag("name = 'cta_click'")} AS cta, ${flag("name = 'booking_opened'")} AS opened, ` +
          `${flag("name = 'booking_step' AND json_extract(props, '$.step') = 'details'")} AS details, ` +
          `${flag("name = 'booking_submitted'")} AS submitted, ` +
          `${flag("name = 'checkout_started'")} AS checkout, ` +
          `${flag("name = 'address_suggest' AND json_extract(props, '$.action') = 'chosen'")} AS chose ` +
          "FROM e GROUP BY exp, vid) " +
          "SELECT exp AS experiment_id, device, viewport, channel, source, " +
          "SUM(visited) AS visited, SUM(engaged) AS engaged, SUM(cta) AS cta, SUM(opened) AS opened, " +
          "SUM(details) AS details, SUM(submitted) AS submitted, SUM(checkout) AS checkout, " +
          "SUM(details * chose) AS details_chose, SUM(details * chose * submitted) AS details_chose_submitted, " +
          "SUM(details * (1 - chose)) AS details_typed, " +
          "SUM(details * (1 - chose) * submitted) AS details_typed_submitted " +
          "FROM v GROUP BY exp, device, viewport, channel, source",
      ),
      all<PropRow>(
        PROP_BREAKDOWNS.map(
          ({ name, prop }) =>
            `SELECT exp AS experiment_id, '${name}' AS name, '${prop}' AS prop, ` +
            `CAST(json_extract(props, '$.${prop}') AS TEXT) AS value, COUNT(DISTINCT vid) AS visitors ` +
            `FROM e WHERE name = '${name}' AND json_extract(props, '$.${prop}') IS NOT NULL ` +
            "GROUP BY exp, value",
        ).join(" UNION ALL "),
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
    };
  }

  /** Device and viewport for the given visitors' page views (bounded IN lists). */
  async visitorProfiles(visitorIds: string[]): Promise<VisitorProfile[]> {
    const out: VisitorProfile[] = [];
    for (let i = 0; i < visitorIds.length; i += PROFILE_CHUNK) {
      const chunk = visitorIds.slice(i, i + PROFILE_CHUNK);
      const rows = await this.db
        .prepare(
          "SELECT json_extract(data, '$.visitor_id') AS visitor_id, " +
            "COALESCE(MAX(json_extract(data, '$.device')), 'unknown') AS device, " +
            "COALESCE(MAX(json_extract(data, '$.viewport')), 'unknown') AS viewport " +
            "FROM analytics_events WHERE json_extract(data, '$.visitor_id') IN (" +
            chunk.map(() => "?").join(", ") +
            ") AND json_extract(data, '$.name') = 'page_view' " +
            "AND expires_at > CAST(strftime('%s', 'now') AS INTEGER) " +
            "GROUP BY json_extract(data, '$.visitor_id')",
        )
        .bind(...chunk)
        .all<VisitorProfile>();
      out.push(...rows.results);
    }
    return out;
  }
}
