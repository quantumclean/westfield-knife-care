import { Hono } from "hono";
import { MIN_REPORT_COUNT, formatIssues, updateOrderSchema } from "@wkc/shared";
import type { Deps } from "../deps.ts";
import { BODY_LIMITS, readJsonBody } from "../services/request-body.ts";
import { safeEqual } from "../services/safe-equal.ts";
import { updateOrder } from "../services/orders.ts";
import { buildInsights, renderInsightsMarkdown } from "../services/insights.ts";
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
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.adminPatch);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = updateOrderSchema.safeParse(body.value);
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

  app.get("/summary", async (c) => {
    const since = c.req.query("since");
    if (since !== undefined && Number.isNaN(Date.parse(since)))
      return c.json({ error: "invalid_request" }, 400);
    return c.json(await buildSummary(deps, since && new Date(since).toISOString()));
  });

  /**
   * Aggregate UX report: arms, acquisition, device, engagement and booking friction, with
   * paid orders from Stripe-confirmed order state. `?since=&until=` (ISO), `?min_count=` (1-100,
   * default 5) and `?format=markdown`. See docs/analytics-insights.md.
   */
  app.get("/insights", async (c) => {
    const since = c.req.query("since");
    const until = c.req.query("until");
    const minCount = c.req.query("min_count");
    const validDate = (v?: string) => v === undefined || !Number.isNaN(Date.parse(v));
    const count = minCount === undefined ? MIN_REPORT_COUNT : Number(minCount);
    if (
      !validDate(since) ||
      !validDate(until) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    )
      return c.json({ error: "invalid_request" }, 400);
    const insights = await buildInsights(
      deps,
      {
        since: since && new Date(since).toISOString(),
        until: until && new Date(until).toISOString(),
      },
      count,
    );
    if (c.req.query("format") === "markdown")
      return c.text(renderInsightsMarkdown(insights), 200, {
        "content-type": "text/markdown; charset=utf-8",
      });
    return c.json(insights);
  });

  return app;
}
