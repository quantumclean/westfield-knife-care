import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { formatIssues, updateOrderSchema } from "@wkc/shared";
import type { Deps } from "../deps.ts";
import { updateOrder } from "../services/orders.ts";
import { buildSummary } from "../services/summary.ts";

/**
 * Operator endpoints, protected by a shared key in the `x-admin-key` header.
 * Used from the command line (see docs/operations.md), not from the website.
 */
export function adminRoutes(deps: Deps) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const expected = deps.config.admin_api_key;
    if (!expected) return c.json({ error: "admin_disabled" }, 503);
    const provided = c.req.header("x-admin-key") ?? "";
    if (!safeEqual(provided, expected)) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/orders", async (c) => {
    const experiment_id = c.req.query("experiment_id");
    const limit = Number(c.req.query("limit") ?? 500);
    const orders = await deps.repo.listOrders({ experiment_id, limit });
    return c.json({ count: orders.length, orders });
  });

  app.get("/orders/:id", async (c) => {
    const order = await deps.repo.getOrder(c.req.param("id"));
    return order ? c.json(order) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/orders/:id", async (c) => {
    const parsed = updateOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const order = await updateOrder(deps, c.req.param("id"), parsed.data);
    return c.json(order);
  });

  app.get("/waitlist", async (c) => {
    const entries = await deps.repo.listWaitlist();
    return c.json({ count: entries.length, entries });
  });

  app.get("/events", async (c) => {
    const since = c.req.query("since");
    const limit = Number(c.req.query("limit") ?? 5000);
    const events = await deps.repo.listEvents({ since, limit });
    return c.json({ count: events.length, events });
  });

  app.get("/summary", async (c) => c.json(await buildSummary(deps, c.req.query("since"))));

  return app;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
