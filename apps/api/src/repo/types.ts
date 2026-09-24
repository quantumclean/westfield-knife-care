import type { AnalyticsEvent, Order, WaitlistEntry } from "@wkc/shared";

export interface ListOrdersOptions {
  experiment_id?: string;
  limit?: number;
}

export interface ListEventsOptions {
  since?: string;
  limit?: number;
}

/**
 * Persistence boundary. Implementations: MemoryRepository (tests, local dev)
 * and DynamoRepository (production).
 */
export interface Repository {
  putOrder(order: Order): Promise<void>;
  getOrder(id: string): Promise<Order | undefined>;
  listOrders(options?: ListOrdersOptions): Promise<Order[]>;
  findOrdersByEmail(email: string): Promise<Order[]>;

  putWaitlistEntry(entry: WaitlistEntry): Promise<void>;
  listWaitlist(): Promise<WaitlistEntry[]>;

  putEvent(event: AnalyticsEvent): Promise<void>;
  listEvents(options?: ListEventsOptions): Promise<AnalyticsEvent[]>;
}
