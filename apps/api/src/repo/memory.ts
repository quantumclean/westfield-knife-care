import type { AnalyticsEvent, Order, WaitlistEntry } from "@wkc/shared";
import type { ListEventsOptions, ListOrdersOptions, Repository } from "./types.ts";

const byCreatedDesc = <T extends { created_at: string }>(a: T, b: T) =>
  b.created_at.localeCompare(a.created_at);

/** In-memory repository for tests and local development. Data is lost on restart. */
export class MemoryRepository implements Repository {
  private orders = new Map<string, Order>();
  private waitlist = new Map<string, WaitlistEntry>();
  private events = new Map<string, AnalyticsEvent>();

  async putOrder(order: Order): Promise<void> {
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

  async putEvent(event: AnalyticsEvent): Promise<void> {
    this.events.set(event.id, structuredClone(event));
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    let events = [...this.events.values()].sort(byCreatedDesc);
    if (options.since) events = events.filter((e) => e.created_at >= options.since!);
    return structuredClone(events.slice(0, options.limit ?? events.length));
  }
}
