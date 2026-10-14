import {
  MAX_EVENTS_PER_VIEW,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";
import { commerceFromRecords, type CommerceArm } from "./commerce-report.ts";
import {
  profilesFromEvents,
  reportFromEvents,
  type AnalyticsReport,
  type ReportWindow,
  type VisitorProfile,
} from "./analytics-report.ts";
import {
  OrderWriteConflict,
  compareEventsDesc,
  eventExpiresAt,
  isBeforeCursor,
  type ListEventsOptions,
  type ListOrdersOptions,
  type Repository,
  type CheckoutRecord,
} from "./types.ts";

const byCreatedDesc = <T extends { created_at: string }>(a: T, b: T) =>
  b.created_at.localeCompare(a.created_at);

/** In-memory repository for tests and local development. Data is lost on restart. */
export class MemoryRepository implements Repository {
  private checkouts = new Map<string, CheckoutRecord>();

  async getCheckout(key: string): Promise<CheckoutRecord | undefined> {
    const record = this.checkouts.get(key);
    return record ? structuredClone(record) : undefined;
  }

  async claimCheckout(record: CheckoutRecord, order: Order): Promise<CheckoutRecord> {
    if (!this.checkouts.has(record.key)) {
      this.checkouts.set(record.key, structuredClone(record));
      await this.putOrder(order);
    }
    return structuredClone(this.checkouts.get(record.key)!);
  }

  async saveCheckoutSession(key: string, sessionId: string): Promise<void> {
    const record = this.checkouts.get(key);
    if (!record) throw new Error("Checkout intent missing");
    if (record.session_id && record.session_id !== sessionId)
      throw new Error("Checkout session changed");
    record.session_id ??= sessionId;
  }

  private orders = new Map<string, Order>();
  private waitlist = new Map<string, WaitlistEntry>();
  private events = new Map<string, AnalyticsEvent>();
  private deletions = new Set<string>();

  async putOrder(order: Order): Promise<void> {
    const stored = this.orders.get(order.id);
    if (!stored && order.revision !== undefined) throw new OrderWriteConflict("Order vanished");
    if (stored && stored.revision !== order.revision)
      throw new OrderWriteConflict("Order changed during update");
    order.revision = (stored?.revision ?? 0) + 1;
    this.orders.set(order.id, structuredClone(order));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const order = this.orders.get(id);
    return order ? structuredClone(order) : undefined;
  }

  async listOrders(options: ListOrdersOptions = {}): Promise<Order[]> {
    let orders = [...this.orders.values()].sort(byCreatedDesc);
    if (options.experiment_id) {
      orders = orders.filter((o) => o.experiment_id === options.experiment_id);
    }
    return structuredClone(orders.slice(0, options.limit ?? orders.length));
  }

  async findOrdersByEmail(email: string): Promise<Order[]> {
    return structuredClone(
      [...this.orders.values()].filter((o) => o.customer.email === email).sort(byCreatedDesc),
    );
  }

  async putWaitlistEntry(entry: WaitlistEntry): Promise<void> {
    this.waitlist.set(entry.id, structuredClone(entry));
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    return structuredClone([...this.waitlist.values()].sort(byCreatedDesc));
  }

  async putEvents(events: AnalyticsEvent[]): Promise<void> {
    for (const event of events) {
      if (this.deletions.has(`${event.visitor_id}:${event.owner ?? ""}`)) continue;
      const view = [...this.events.values()].filter(
        (e) =>
          e.view_id === event.view_id &&
          (event.view_id !== "legacy-v1" || e.visitor_id === event.visitor_id),
      );
      if (
        view.length >= MAX_EVENTS_PER_VIEW ||
        view.some(
          (e) =>
            e.visitor_id !== event.visitor_id ||
            e.owner !== event.owner ||
            e.experiment_id !== event.experiment_id ||
            e.source !== event.source ||
            e.acquisition_channel !== event.acquisition_channel ||
            e.page !== event.page,
        )
      )
        continue;
      if (!this.events.has(event.id)) this.events.set(event.id, structuredClone(event));
    }
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    const now = Math.floor(Date.now() / 1000);
    const { since, until, before } = options;
    const events = [...this.events.values()]
      .filter((e) => eventExpiresAt(e.created_at) > now)
      .filter((e) => (!since || e.created_at >= since) && (!until || e.created_at < until))
      .filter((e) => !before || isBeforeCursor(e, before))
      .sort(compareEventsDesc);
    return structuredClone(events.slice(0, Math.min(options.limit ?? 5000, 5000)));
  }

  async deleteVisitorEvents(visitorId: string, ownerHash: string): Promise<number> {
    this.deletions.add(`${visitorId}:${ownerHash}`);
    let removed = 0;
    for (const [id, event] of this.events) {
      if (event.visitor_id === visitorId && event.owner === ownerHash && this.events.delete(id))
        removed += 1;
    }
    return removed;
  }

  private windowEvents(window: ReportWindow = {}): AnalyticsEvent[] {
    const now = Math.floor(Date.now() / 1000);
    return [...this.events.values()].filter(
      (e) =>
        eventExpiresAt(e.created_at) > now &&
        (!window.since || e.created_at >= window.since) &&
        (!window.until || e.created_at < window.until),
    );
  }

  async analyticsReport(window: ReportWindow = {}): Promise<AnalyticsReport> {
    return reportFromEvents(this.windowEvents(window));
  }

  async commerceReport(window: ReportWindow = {}): Promise<CommerceArm[]> {
    return commerceFromRecords(
      [...this.orders.values()],
      [...this.waitlist.values()],
      this.windowEvents(window),
      window,
    );
  }

  async visitorProfiles(
    visitorIds: string[],
    window: ReportWindow = {},
  ): Promise<VisitorProfile[]> {
    return profilesFromEvents(this.windowEvents(window), visitorIds);
  }
}
