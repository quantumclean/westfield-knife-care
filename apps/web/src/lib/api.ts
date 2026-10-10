import type { CreateOrderInput, CreateWaitlistInput, Quote } from "@wkc/shared";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export type ApiErrorKind = "network" | "invalid_response" | "server" | "client";

/**
 * Every message here is shown to customers as-is, so none of them may carry
 * an API error code, a status line or a JavaScript error.
 */
const MESSAGES = {
  network: "We could not reach the booking service. Check your connection and try again.",
  unavailable: "The booking service is temporarily unavailable. Please try again in a few minutes.",
  invalid: "Please check the highlighted fields.",
  notFound: "We could not find that order.",
  generic: "That request could not be completed. Please try again.",
} as const;

export class ApiError extends Error {
  readonly status: number;
  readonly issues: string[];
  readonly kind: ApiErrorKind;
  constructor(
    status: number,
    message: string,
    issues: string[] = [],
    kind: ApiErrorKind = status === 0 ? "network" : status >= 500 ? "server" : "client",
  ) {
    super(message);
    this.status = status;
    this.issues = issues;
    this.kind = kind;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unexpectedResponse(status: number): ApiError {
  return new ApiError(status, MESSAGES.unavailable, [], "invalid_response");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, MESSAGES.network, [], "network");
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text().catch(() => "");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    // A missing or HTML body means nothing is answering for the API: static
    // hosting returns index.html or a 404/405 page for /api/* when it is not
    // wired to the Lambda.
    if (!isObject(body) && (res.status === 404 || res.status === 405 || res.status >= 500)) {
      throw unexpectedResponse(res.status);
    }
    const payload = isObject(body) ? body : {};
    const issues = Array.isArray(payload.issues)
      ? payload.issues.filter((issue): issue is string => typeof issue === "string")
      : [];
    if (issues.length > 0 || payload.error === "invalid_request") {
      throw new ApiError(res.status, MESSAGES.invalid, issues);
    }
    if (res.status === 404) throw new ApiError(res.status, MESSAGES.notFound);
    if (res.status >= 500) throw new ApiError(res.status, MESSAGES.unavailable);
    throw new ApiError(res.status, MESSAGES.generic);
  }

  // Success responses must be JSON objects. Anything else (typically
  // index.html served with a 200) is treated as "the API is not there".
  if (!isObject(body)) throw unexpectedResponse(res.status);
  return body as T;
}

export interface SiteConfig {
  care_days: string[];
  payments_enabled: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate GET /config. Throws when it is not the shape the booking form relies on. */
export function parseSiteConfig(value: unknown): SiteConfig {
  if (
    !isObject(value) ||
    !Array.isArray(value.care_days) ||
    !value.care_days.every((day) => typeof day === "string" && ISO_DATE.test(day)) ||
    typeof value.payments_enabled !== "boolean"
  ) {
    throw unexpectedResponse(200);
  }
  return { care_days: value.care_days as string[], payments_enabled: value.payments_enabled };
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function assertPublicOrder(value: unknown): PublicOrder {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.payment_status !== "string" ||
    typeof value.total_cents !== "number"
  ) {
    throw unexpectedResponse(200);
  }
  return value as unknown as PublicOrder;
}

export type CreateOrderResult = {
  order_id: string;
  checkout_url: string;
  quote: Quote;
  experiment_id: string;
};

export const api = {
  config: async (): Promise<SiteConfig> => parseSiteConfig(await request<unknown>("/config")),
  createOrder: async (input: CreateOrderInput): Promise<CreateOrderResult> => {
    const result = await request<Partial<CreateOrderResult>>("/orders", {
      method: "POST",
      body: JSON.stringify(input),
    });
    // The browser is about to be sent to checkout_url, so it has to be a real URL.
    if (
      typeof result.order_id !== "string" ||
      !isHttpUrl(result.checkout_url) ||
      !isObject(result.quote) ||
      typeof result.quote.total_cents !== "number"
    ) {
      throw unexpectedResponse(201);
    }
    return result as CreateOrderResult;
  },
  getOrder: async (id: string): Promise<PublicOrder> =>
    assertPublicOrder(await request<unknown>(`/orders/${encodeURIComponent(id)}`)),
  sendFeedback: async (
    id: string,
    repeat_intent: "yes" | "maybe" | "no",
    token: string,
  ): Promise<PublicOrder> =>
    assertPublicOrder(
      await request<unknown>(`/orders/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: JSON.stringify({ repeat_intent, token }),
      }),
    ),
  joinWaitlist: async (input: CreateWaitlistInput): Promise<{ id: string }> => {
    const result = await request<{ id?: unknown }>("/waitlist", {
      method: "POST",
      body: JSON.stringify(input),
    });
    // Without this a non-API 200 would read as "you are on the list" with nothing saved.
    if (typeof result.id !== "string") throw unexpectedResponse(201);
    return { id: result.id };
  },
};

export interface PublicOrder {
  id: string;
  first_name: string;
  payment_status: string;
  pickup_status: string;
  return_status: string;
  number_of_knives: number;
  care_day: string;
  total_cents: number;
  currency: string;
  experiment_id: string;
  offer_version: string;
  price_version: string;
  source: string;
  acquisition_channel: string;
  repeat_intent: string;
}
