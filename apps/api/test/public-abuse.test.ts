import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import type { Order } from "@wkc/shared";
import { handlePagesApi, type PagesBindings } from "../src/cloudflare.ts";
import type { D1Database, D1Statement } from "../src/repo/d1.ts";
import { ADMIN_KEY, json, makeDeps, validOrder } from "./helpers.ts";

const origin = "https://preview.example.test";
const clientIp = "192.0.2.10";

class TestDatabase implements D1Database {
  readonly hits = new Map<string, number>();
  readonly orders = new Map<string, string>();

  prepare(sql: string): D1Statement {
    let args: (string | number | null)[] = [];
    const statement: D1Statement = {
      bind: (...values) => {
        args = values;
        return statement;
      },
      first: async <T>() => {
        if (sql.includes("sqlite_master")) return { count: 4 } as T;
        if (sql.includes("INSERT INTO api_rate_limits")) {
          const bucket = String(args[0]);
          const hits = (this.hits.get(bucket) ?? 0) + 1;
          this.hits.set(bucket, hits);
          return { hits } as T;
        }
        if (sql.includes("SELECT data FROM orders WHERE id = ?")) {
          const data = this.orders.get(String(args[0]));
          return data ? ({ data } as T) : null;
        }
        throw new Error(`Unexpected D1 query: ${sql}`);
      },
      all: async () => {
        throw new Error("Unexpected D1 list query");
      },
      run: async () => {
        throw new Error("Unexpected D1 write query");
      },
    };
    return statement;
  }
}

function fixture() {
  const db = new TestDatabase();
  const env: PagesBindings = {
    DB: db,
    STAGE: "staging",
    RATE_LIMIT_SALT: "local-test-salt",
    ADMIN_API_KEY: ADMIN_KEY,
  };
  const call = (path: string, init: RequestInit = {}, ip = clientIp) =>
    handlePagesApi(
      new Request(origin + path, {
        ...init,
        headers: { "CF-Connecting-IP": ip, ...init.headers },
      }),
      env,
    );
  return { db, env, call };
}

async function addOrder(db: TestDatabase): Promise<Order> {
  const { app, deps } = makeDeps();
  const response = await app.request("/api/orders", json("POST", validOrder));
  const { order_id } = (await response.json()) as { order_id: string };
  const order = (await deps.repo.getOrder(order_id))!;
  db.orders.set(order.id, JSON.stringify(order));
  return order;
}

describe("Pages public order abuse protection", () => {
  it("limits order reads per IP without affecting another IP", async () => {
    const { db, call } = fixture();
    const order = await addOrder(db);
    for (let attempt = 0; attempt < 120; attempt++) {
      expect((await call(`/api/orders/${order.id}`)).status).toBe(200);
    }
    const blocked = await call(`/api/orders/${order.id}`);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect((await call(`/api/orders/${order.id}`, {}, "192.0.2.11")).status).toBe(200);
  });

  it("limits unknown-ID enumeration without blocking a known order on the same IP", async () => {
    const { db, call } = fixture();
    const order = await addOrder(db);
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await call(`/api/orders/guess-${attempt}`);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
    const blocked = await call("/api/orders/guess-30");
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect((await call(`/api/orders/${order.id}`)).status).toBe(200);
  });

  it("limits feedback by IP and order, so another customer behind that IP can answer", async () => {
    const { db, call } = fixture();
    const order = await addOrder(db);
    const wrong = json("POST", { repeat_intent: "yes", token: "wrong-token" });
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await call(`/api/orders/${order.id}/feedback`, wrong)).status).toBe(403);
    }
    expect((await call(`/api/orders/${order.id}/feedback`, wrong)).status).toBe(429);
    expect((await call("/api/orders/someone-else/feedback", wrong)).status).toBe(403);
    expect((await call(`/api/orders/${order.id}/feedback`, wrong, "192.0.2.11")).status).toBe(403);
  });

  it("also bounds attempts spread across many order IDs", async () => {
    const { call } = fixture();
    const wrong = json("POST", { repeat_intent: "yes", token: "wrong-token" });
    for (let attempt = 0; attempt < 60; attempt++) {
      expect((await call(`/api/orders/guess-${attempt}/feedback`, wrong)).status).toBe(403);
    }
    expect((await call("/api/orders/guess-60/feedback", wrong)).status).toBe(429);
  });

  it("never exposes contact details or the feedback token to unknown or unauthorized callers", async () => {
    const { db, call } = fixture();
    const order = await addOrder(db);
    const sensitive = [
      order.customer.email,
      order.customer.phone!,
      order.customer.address.line1,
      order.feedback_token!,
    ];
    const responses = [
      await call("/api/orders/missing"),
      await call(`/api/orders/${order.id}`),
      await call(
        `/api/orders/${order.id}/feedback`,
        json("POST", {
          repeat_intent: "yes",
          token: "wrong-token",
        }),
      ),
      await call(
        "/api/orders/missing/feedback",
        json("POST", {
          repeat_intent: "yes",
          token: "wrong-token",
        }),
      ),
      await call(`/api/admin/orders/${order.id}`, {
        headers: { "x-admin-key": "wrong-key" },
      }),
    ];
    expect(responses.map((response) => response.status)).toEqual([404, 200, 403, 403, 401]);
    expect(await responses[2]!.clone().json()).toEqual(await responses[3]!.clone().json());
    for (const response of responses) {
      const body = await response.text();
      for (const value of sensitive) expect(body).not.toContain(value);
    }
    expect(db.hits.size).toBeGreaterThan(0);
    for (const bucket of db.hits.keys()) {
      expect(bucket).not.toContain(clientIp);
      expect(bucket).not.toContain(order.id);
    }
  });

  it("accepts signed Stripe retries without consuming customer rate buckets", async () => {
    const { db, env, call } = fixture();
    env.SITE_URL = origin;
    env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    env.STRIPE_WEBHOOK_SECRET = "whsec_local_test";
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const body = JSON.stringify({ id: "evt_local", type: "unhandled.local", data: { object: {} } });
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    for (let attempt = 0; attempt < 61; attempt++) {
      const response = await call("/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body,
      });
      expect(response.status).toBe(200);
    }
    expect(db.hits.size).toBe(0);
  });
});
