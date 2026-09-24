import type { CreateOrderInput, CreateWaitlistInput, Quote } from "@wkc/shared";

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "/api").replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly issues: string[];
  constructor(status: number, message: string, issues: string[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      0,
      "We could not reach the booking service. Check your connection and try again.",
    );
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.error ?? `Request failed (${res.status})`,
      body.issues ?? [],
    );
  }
  return body as T;
}

export interface SiteConfig {
  care_days: string[];
  payments_enabled: boolean;
}

export const api = {
  config: () => request<SiteConfig>("/config"),
  createOrder: (input: CreateOrderInput) =>
    request<{ order_id: string; checkout_url: string; quote: Quote; experiment_id: string }>(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  getOrder: (id: string) => request<PublicOrder>(`/orders/${encodeURIComponent(id)}`),
  sendFeedback: (id: string, repeat_intent: "yes" | "maybe" | "no") =>
    request<PublicOrder>(`/orders/${encodeURIComponent(id)}/feedback`, {
      method: "POST",
      body: JSON.stringify({ repeat_intent }),
    }),
  joinWaitlist: (input: CreateWaitlistInput) =>
    request<{ id: string }>("/waitlist", { method: "POST", body: JSON.stringify(input) }),
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
