import type { CommerceArm } from "./commerce-report.ts";
import type { AnalyticsReport, ReportWindow, VisitorProfile } from "./analytics-report.ts";
import {
  EVENT_RETENTION_DAYS,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";

export interface ListOrdersOptions {
  experiment_id?: string;
  limit?: number;
}

/** Position in a newest-first event listing: rows strictly older than this come next. */
export interface EventCursor {
  created_at: string;
  id: string;
}

export interface ListEventsOptions {
  /** Inclusive lower bound on `created_at` (ISO timestamp). */
  since?: string;
  /** Exclusive upper bound on `created_at` (ISO timestamp). */
  until?: string;
  before?: EventCursor;
  limit?: number;
}

/** Unix seconds after which a stored event is deleted (see EVENT_RETENTION_DAYS). */
export function eventExpiresAt(createdAt: string): number {
  return Math.floor(new Date(createdAt).getTime() / 1000) + EVENT_RETENTION_DAYS * 86_400;
}

/** Newest first, ties broken by id, so a cursor can resume exactly where a page ended. */
export function compareEventsDesc(a: AnalyticsEvent, b: AnalyticsEvent): number {
  return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/** True when `event` sorts strictly after `cursor` in newest-first order. */
export function isBeforeCursor(event: AnalyticsEvent, cursor: EventCursor): boolean {
  return (
    event.created_at < cursor.created_at ||
    (event.created_at === cursor.created_at && event.id < cursor.id)
  );
}

/** Explicit conflict: caller must reload and retry a read-modify-write. */
export class OrderWriteConflict extends Error {
  override name = "OrderWriteConflict";
}

/** Minimal immutable intent. Customer data and bearer Checkout URLs stay in their source systems. */
export interface CheckoutRecord {
  key: string;
  fingerprint: string;
  order_id: string;
  created_at: string;
  expires_at: number;
  site_origin: string;
  description: string;
  session_id?: string;
}

/**
 * Persistence boundary. Implementations: D1Repository (Cloudflare staging and production),
 * MemoryRepository (tests, local dev) and the legacy DynamoRepository (AWS Lambda build).
 */
export interface Repository {
  getCheckout(key: string): Promise<CheckoutRecord | undefined>;
  /** Atomically insert or return the winning record for this key. */
  claimCheckout(record: CheckoutRecord, order: Order): Promise<CheckoutRecord>;
  /** Write-once provider result. A different session must never replace it. */
  saveCheckoutSession(key: string, sessionId: string): Promise<void>;
  putOrder(order: Order): Promise<void>;
  getOrder(id: string): Promise<Order | undefined>;
  listOrders(options?: ListOrdersOptions): Promise<Order[]>;
  findOrdersByEmail(email: string): Promise<Order[]>;

  putWaitlistEntry(entry: WaitlistEntry): Promise<void>;
  listWaitlist(): Promise<WaitlistEntry[]>;

  /** Insert events; an id that already exists is skipped, which makes retries harmless. */
  putEvents(events: AnalyticsEvent[]): Promise<void>;
  /** Unexpired events, newest first (ties by id), at most `limit` (capped) per call. */
  listEvents(options?: ListEventsOptions): Promise<AnalyticsEvent[]>;
  /**
   * Erase one browser's analytics events (privacy request): rows with this visitor id whose
   * `owner` is this deletion-key hash. Returns how many were removed.
   */
  deleteVisitorEvents(visitorId: string, ownerHash: string): Promise<number>;
  /** Aggregates for /admin/summary and /admin/insights, computed by the store (no raw events). */
  analyticsReport(window?: ReportWindow): Promise<AnalyticsReport>;
  /** Device and viewport of specific visitors (paid-order joins), looked up in small chunks. */
  visitorProfiles(visitorIds: string[], window?: ReportWindow): Promise<VisitorProfile[]>;
  commerceReport(window?: ReportWindow): Promise<CommerceArm[]>;
}
