import { describe, expect, it } from "vitest";
import { BODY_LIMITS } from "../src/services/request-body.ts";
import { ADMIN_KEY, WEBHOOK_SECRET, json, makeDeps, validOrder } from "./helpers.ts";

const cases = [
  ["/api/orders", "POST", BODY_LIMITS.order],
  ["/api/waitlist", "POST", BODY_LIMITS.waitlist],
  ["/api/events", "POST", BODY_LIMITS.event],
  ["/api/orders/missing/feedback", "POST", BODY_LIMITS.feedback],
  ["/api/admin/orders/missing", "PATCH", BODY_LIMITS.adminPatch],
] as const;

describe("bounded API request bodies", () => {
  it.each(cases)("rejects oversized %s bodies before parsing", async (path, method, limit) => {
    const { app, deps } = makeDeps();
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
      body: `{"padding":"${"x".repeat(limit)}"}`,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "payload_too_large" });
    expect(await deps.repo.listOrders()).toHaveLength(0);
    expect(await deps.repo.listWaitlist()).toHaveLength(0);
    expect(await deps.repo.listEvents()).toHaveLength(0);
  });

  it("does not trust a falsely short Content-Length", async () => {
    const { app } = makeDeps();
    const response = await app.request("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "1" },
      body: `{"padding":"${"x".repeat(BODY_LIMITS.event)}"}`,
    });
    expect(response.status).toBe(413);
  });

  it("rejects a streaming body without Content-Length at the byte limit", async () => {
    const { app } = makeDeps();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
        controller.enqueue(new TextEncoder().encode("x".repeat(BODY_LIMITS.event)));
        controller.close();
      },
    });
    const request = new Request("https://sharp.example.com/api/events", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect((await app.request(request)).status).toBe(413);
  });

  it.each(cases)("returns 400 for malformed small JSON at %s", async (path, method) => {
    const { app } = makeDeps();
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
      body: "{",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects an invalid order schema after reading a small JSON body", async () => {
    const { app } = makeDeps();
    const response = await app.request("/api/orders", json("POST", { customer: {} }));
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toHaveProperty("error", "invalid_request");
  });

  it("checks admin authorization before reading a large PATCH body", async () => {
    const { app } = makeDeps();
    const response = await app.request("/api/admin/orders/missing", {
      method: "PATCH",
      body: "x".repeat(BODY_LIMITS.adminPatch + 1),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("allows a valid order body and a verified webhook retry", async () => {
    const { app } = makeDeps();
    const created = await app.request("/api/orders", json("POST", validOrder));
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { order_id: string }).order_id;
    const order = await app.request(`/api/orders/${id}`);
    expect(order.status).toBe(200);

    const event = { type: "ignored" };
    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = await app.request(
        "/api/webhooks/stripe",
        json("POST", event, { "stripe-signature": WEBHOOK_SECRET }),
      );
      expect(retry.status).toBe(200);
    }
  });

  it("caps unsigned webhook bodies separately from customer JSON", async () => {
    const { app } = makeDeps();
    const response = await app.request("/api/webhooks/stripe", {
      method: "POST",
      body: "x".repeat(BODY_LIMITS.webhook + 1),
    });
    expect(response.status).toBe(413);
  });
});
