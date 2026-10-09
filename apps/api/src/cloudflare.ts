import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { jsonLog, newId, type Deps } from "./deps.ts";
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
}

class DisabledPayments implements PaymentGateway {
  async createCheckoutSession(): Promise<never> {
    throw new Error("Payments are not configured");
  }

  async parseWebhook(): Promise<never> {
    throw new WebhookVerificationError("Payments are not configured");
  }
}

const unavailable = (message: string) =>
  Response.json(
    { error: "service_unavailable", message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );

/** Cloudflare Pages Functions adapter; no AWS SDK or fake payment fallback. */
export async function handlePagesApi(request: Request, env: PagesBindings): Promise<Response> {
  if (!env.DB) return unavailable("Booking database has not been connected.");

  try {
    const row = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'orders'",
    ).first<{ name: string }>();
    if (!row) return unavailable("Booking database has not been initialized.");
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
    log: jsonLog,
  };

  const response = await createApp(deps).fetch(request);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
