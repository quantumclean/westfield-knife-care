import { describe, expect, it } from "vitest";
import { handlePagesApi, type PagesBindings } from "../src/cloudflare.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

const request = (path: string, method = "GET") =>
  new Request("https://preview.example.test" + path, { method });

const db = {
  prepare: () => ({ first: async () => ({ count: 4 }) }),
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

  it("rejects traffic until the rate-limit migration is present", async () => {
    const incomplete = {
      prepare: () => ({ first: async () => ({ count: 3 }) }),
    } as unknown as NonNullable<PagesBindings["DB"]>;
    const res = await handlePagesApi(request("/api/health"), { DB: incomplete });
    expect(res.status).toBe(503);
  });

  it("answers 503 for analytics only until migration 0005 is applied", async () => {
    const before0005 = sqliteD1("0004_analytics_visitor_index.sql");
    const env: PagesBindings = { DB: before0005, STAGE: "staging", RATE_LIMIT_SALT: "salt" };
    const post = (path: string) =>
      handlePagesApi(
        new Request("https://preview.example.test" + path, {
          method: "POST",
          headers: { "content-type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
          body: "{}",
        }),
        env,
      );
    for (const path of ["/api/events", "/api/events/forget"]) {
      const res = await post(path);
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ error: "service_unavailable" });
    }
    expect((await handlePagesApi(request("/api/config"), env)).status).toBe(200);
    // Booking still reaches validation (400 for an empty body), not a 503.
    expect((await post("/api/waitlist")).status).toBe(400);
    const after0005 = { ...env, DB: sqliteD1() };
    expect(
      (
        await handlePagesApi(
          new Request("https://preview.example.test/api/events", {
            method: "POST",
            headers: { "content-type": "application/json", "CF-Connecting-IP": "192.0.2.1" },
            body: "{}",
          }),
          after0005,
        )
      ).status,
    ).toBe(400);
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

  it("enables staging payments only with the complete test-mode configuration", async () => {
    const config = await handlePagesApi(request("/api/config"), {
      DB: db,
      STAGE: "staging",
      SITE_URL: "https://preview.example.test",
      STRIPE_SECRET_KEY: "sk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
    });
    expect(config.status).toBe(200);
    expect((await config.json()) as { payments_enabled: boolean }).toMatchObject({
      payments_enabled: true,
    });
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
