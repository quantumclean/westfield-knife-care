import { describe, expect, it } from "vitest";
import { handlePagesApi, type PagesBindings } from "../src/cloudflare.ts";

const request = (path: string, method = "GET") =>
  new Request("https://preview.example.test" + path, { method });

const db = {
  prepare: () => ({ first: async () => ({ name: "orders" }) }),
} as unknown as NonNullable<PagesBindings["DB"]>;

describe("Cloudflare staging payment readiness", () => {
  it("rejects traffic when the database is missing", async () => {
    const res = await handlePagesApi(request("/api/health"), {});
    expect(res.status).toBe(503);
  });

  it("rejects traffic when database migrations have not run", async () => {
    const missing = {
      prepare: () => ({ first: async () => null }),
    } as unknown as NonNullable<PagesBindings["DB"]>;
    const res = await handlePagesApi(request("/api/config"), { DB: missing });
    expect(res.status).toBe(503);
  });

  it("does not simulate a checkout on Pages", async () => {
    const env: PagesBindings = {
      DB: db,
      STAGE: "staging",
      SITE_URL: "https://preview.example.test",
    };
    const config = await handlePagesApi(request("/api/config"), env);
    expect(config.status).toBe(200);
    const configBody = (await config.json()) as { payments_enabled: boolean };
    expect(configBody.payments_enabled).toBe(false);
    const order = await handlePagesApi(request("/api/orders", "POST"), env);
    expect(order.status).toBe(503);
  });

  it("rejects test Stripe keys in production", async () => {
    const env: PagesBindings = {
      DB: db,
      STAGE: "production",
      SITE_URL: "https://preview.example.test",
      STRIPE_SECRET_KEY: "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    };
    const config = await handlePagesApi(request("/api/config"), env);
    const configBody = (await config.json()) as { payments_enabled: boolean };
    expect(configBody.payments_enabled).toBe(false);
  });

  it("rejects live Stripe keys in staging", async () => {
    const env: PagesBindings = {
      DB: db,
      STAGE: "staging",
      SITE_URL: "https://preview.example.test",
      STRIPE_SECRET_KEY: "sk_live_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    };
    const config = await handlePagesApi(request("/api/config"), env);
    const configBody = (await config.json()) as { payments_enabled: boolean };
    expect(configBody.payments_enabled).toBe(false);
  });

  it("rejects checkout if the configured origin does not match", async () => {
    const env: PagesBindings = {
      DB: db,
      STAGE: "staging",
      SITE_URL: "https://different.example.test",
      STRIPE_SECRET_KEY: "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    };
    const order = await handlePagesApi(request("/api/orders", "POST"), env);
    expect(order.status).toBe(503);
  });
});
