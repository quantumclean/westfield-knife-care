import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { jsonLog, newId, newToken, type Deps } from "./deps.ts";
import { StripeGateway } from "./payments/stripe.ts";
import { WebhookVerificationError, type PaymentGateway } from "./payments/types.ts";
import { D1Repository, type D1Database } from "./repo/d1.ts";

export interface PagesBindings {
  DB?: D1Database;
  STAGE?: string;
  SITE_URL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  ADMIN_API_KEY?: string;
  RATE_LIMIT_SALT?: string;
}

class DisabledPayments implements PaymentGateway {
  async createCheckoutSession(): Promise<never> {
    throw new Error("Payments are not configured");
  }

  async parseWebhook(): Promise<never> {
    throw new WebhookVerificationError("Payments are not configured");
  }
}

const orderRead = /^\/api\/orders\/[^/]+$/;
const feedbackWrite = /^\/api\/orders\/[^/]+\/feedback$/;

const ratePolicy = (path: string, method: string): { limit: number; scope: string } | undefined => {
  if (method === "POST" && path === "/api/orders") return { limit: 5, scope: "orders" };
  if (method === "POST" && path === "/api/waitlist") return { limit: 5, scope: "waitlist" };
  if (method === "POST" && path === "/api/events") return { limit: 120, scope: "events" };
  if (method === "GET" && orderRead.test(path)) return { limit: 120, scope: "order-read" };
  if (method === "POST" && feedbackWrite.test(path)) return { limit: 60, scope: "feedback-write" };
  if (path.startsWith("/api/admin/")) return { limit: 30, scope: "admin" };
  // Stripe webhooks use cryptographic signatures and must remain retryable.
  return undefined;
};

async function withinRateLimit(
  db: D1Database,
  salt: string,
  ip: string,
  scope: string,
  limit: number,
  orderId?: string,
): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  // Hash the complete identity so neither the IP nor an order ID appears in D1 buckets.
  const input = new TextEncoder().encode(JSON.stringify([salt, ip, orderId]));
  const digest = await crypto.subtle.digest("SHA-256", input);
  const identifier = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const result = await db
    .prepare(
      "INSERT INTO api_rate_limits (bucket, hits, expires_at) VALUES (?, 1, ?) " +
        "ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1 RETURNING hits",
    )
    .bind(scope + ":" + minute + ":" + identifier, (minute + 2) * 60)
    .first<{ hits: number }>();
  return Boolean(result && result.hits <= limit);
}

const unavailable = (message: string) =>
  Response.json(
    { error: "service_unavailable", message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

const rateLimited = () =>
  Response.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } },
  );

/** Cloudflare Pages Functions adapter; no AWS SDK or fake payment fallback. */
export async function handlePagesApi(request: Request, env: PagesBindings): Promise<Response> {
  if (!env.DB) return unavailable("Booking database has not been connected.");

  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' " +
        "AND name IN ('orders', 'waitlist', 'analytics_events', 'api_rate_limits')",
    ).first<{ count: number }>();
    if (row?.count !== 4) return unavailable("Booking database has not been initialized.");
  } catch {
    return unavailable("Booking database is unavailable.");
  }

  const requestOrigin = new URL(request.url).origin;
  let configuredOrigin: string | undefined;
  try {
    if (env.SITE_URL) {
      const parsed = new URL(env.SITE_URL);
      if (
        parsed.protocol === "https:" &&
        parsed.origin === requestOrigin &&
        parsed.pathname === "/" &&
        !parsed.search &&
        !parsed.hash
      ) {
        configuredOrigin = parsed.origin;
      }
    }
  } catch {
    // A missing, mismatched or malformed SITE_URL cannot enable Stripe.
  }

  const isProd = env.STAGE === "production";
  const isStaging = env.STAGE === "staging";
  const key = env.STRIPE_SECRET_KEY?.trim();
  const signatureSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const correctKeyMode = isProd
    ? key?.startsWith("sk_live_")
    : isStaging
      ? key?.startsWith("sk_test_")
      : false;
  const paymentsReady = Boolean(configuredOrigin && key && signatureSecret && correctKeyMode);

  const path = new URL(request.url).pathname;
  const policy = ratePolicy(path, request.method);
  let protection: { ip: string; salt: string } | undefined;
  if (policy) {
    const ip = request.headers.get("CF-Connecting-IP");
    const salt = env.RATE_LIMIT_SALT?.trim();
    if (!ip || !salt) return unavailable("Request protection is not configured.");
    protection = { ip, salt };
    try {
      if (!(await withinRateLimit(env.DB, salt, ip, policy.scope, policy.limit)))
        return rateLimited();
      if (request.method === "POST" && feedbackWrite.test(path)) {
        const orderId = path.slice("/api/orders/".length, -"/feedback".length);
        if (!(await withinRateLimit(env.DB, salt, ip, "feedback-order", 10, orderId)))
          return rateLimited();
      }
    } catch {
      return unavailable("Request protection is unavailable.");
    }
  }
  if (
    request.method === "POST" &&
    (path === "/api/orders" || path === "/api/webhooks/stripe") &&
    !paymentsReady
  ) {
    return unavailable("Online booking is temporarily unavailable.");
  }

  const config: Config = {
    stage: env.STAGE || "unconfigured",
    site_url: configuredOrigin ?? "",
    cors_origins: configuredOrigin ? [configuredOrigin] : [],
    stripe_secret_key: paymentsReady ? key : undefined,
    stripe_webhook_secret: paymentsReady ? signatureSecret : undefined,
    admin_api_key: env.ADMIN_API_KEY?.trim() || undefined,
  };
  const deps: Deps = {
    config,
    repo: new D1Repository(env.DB),
    payments: paymentsReady
      ? new StripeGateway({
          secret_key: key!,
          webhook_secret: signatureSecret,
          runtime: "worker",
        })
      : new DisabledPayments(),
    now: () => new Date(),
    newId,
    newToken,
    log: jsonLog,
  };

  const response = await createApp(deps).fetch(request);
  if (request.method === "GET" && orderRead.test(path) && response.status === 404 && protection) {
    try {
      if (!(await withinRateLimit(env.DB, protection.salt, protection.ip, "order-miss", 30)))
        return rateLimited();
    } catch {
      return unavailable("Request protection is unavailable.");
    }
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
