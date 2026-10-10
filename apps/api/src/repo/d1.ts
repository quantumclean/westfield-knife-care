import type { AnalyticsEvent, Order, WaitlistEntry } from "@wkc/shared";
import {
  OrderWriteConflict,
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

  async putEvent(event: AnalyticsEvent): Promise<void> {
    const expiresAt = Math.floor(new Date(event.created_at).getTime() / 1000) + 180 * 86400;
    await this.db
      .prepare(
        "INSERT INTO analytics_events (id, created_at, experiment_id, expires_at, data) " +
          "VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
      )
      .bind(event.id, event.created_at, event.experiment_id, expiresAt, JSON.stringify(event))
      .run();
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    const clause = options.since ? "AND created_at >= ? " : "";
    const query =
      "SELECT data FROM analytics_events " +
      "WHERE expires_at > CAST(strftime('%s', 'now') AS INTEGER) " +
      clause +
      "ORDER BY created_at DESC LIMIT ?";
    const statement = this.db.prepare(query);
    const rows = options.since
      ? await statement.bind(options.since, limitValue(options.limit)).all<DataRow>()
      : await statement.bind(limitValue(options.limit)).all<DataRow>();
    return rows.results.map((row) => JSON.parse(row.data) as AnalyticsEvent);
  }
}
