import { Hono } from "hono";
import {
  EXPERIMENTS,
  OFFER_VERSIONS,
  PRICE_VERSIONS,
  activeExperiments,
  createEventSchema,
  createOrderSchema,
  createWaitlistSchema,
  formatIssues,
  orderFeedbackSchema,
  upcomingCareDays,
  type AnalyticsEvent,
  type WaitlistEntry,
} from "@wkc/shared";
import type { Deps } from "../deps.ts";
import { createOrder, getOrder, publicOrderView, recordFeedback } from "../services/orders.ts";

export function publicRoutes(deps: Deps) {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ ok: true, stage: deps.config.stage, at: deps.now().toISOString() }),
  );

  /** Current experiment registry and bookable care days. Lets the web stay in sync after a deploy. */
  app.get("/config", (c) =>
    c.json({
      experiments: activeExperiments(),
      all_experiments: EXPERIMENTS.map((e) => ({ id: e.id, status: e.status })),
      offers: OFFER_VERSIONS,
      prices: PRICE_VERSIONS,
      care_days: upcomingCareDays(deps.now()),
      payments_enabled: Boolean(deps.config.stripe_secret_key),
    }),
  );

  app.post("/orders", async (c) => {
    const parsed = createOrderSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const { order, checkout_url } = await createOrder(deps, parsed.data);
    return c.json(
      { order_id: order.id, checkout_url, quote: order.quote, experiment_id: order.experiment_id },
      201,
    );
  });

  app.get("/orders/:id", async (c) => {
    const order = await getOrder(deps, c.req.param("id"));
    return c.json(publicOrderView(order));
  });

  app.post("/orders/:id/feedback", async (c) => {
    const parsed = orderFeedbackSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const order = await recordFeedback(deps, c.req.param("id"), parsed.data);
    return c.json(publicOrderView(order));
  });

  app.post("/waitlist", async (c) => {
    const parsed = createWaitlistSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const input = parsed.data;
    const { experiment, offer, price } = resolveContext(input.experiment_id);
    const entry: WaitlistEntry = {
      id: deps.newId(),
      created_at: deps.now().toISOString(),
      name: input.name,
      email: input.email,
      phone: input.phone,
      service_interest: input.service_interest,
      cadence: input.cadence,
      notes: input.notes,
      experiment_id: experiment,
      offer_version: offer,
      price_version: price,
      source: input.source,
      acquisition_channel: input.acquisition_channel,
      visitor_id: input.visitor_id,
    };
    await deps.repo.putWaitlistEntry(entry);
    deps.log("waitlist.created", {
      id: entry.id,
      experiment_id: entry.experiment_id,
      cadence: entry.cadence,
    });
    return c.json({ id: entry.id }, 201);
  });

  app.post("/events", async (c) => {
    const parsed = createEventSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const input = parsed.data;
    const { experiment, offer, price } = resolveContext(input.experiment_id);
    const event: AnalyticsEvent = {
      id: deps.newId(),
      created_at: deps.now().toISOString(),
      name: input.name,
      visitor_id: input.visitor_id,
      experiment_id: experiment,
      offer_version: offer,
      price_version: price,
      source: input.source,
      acquisition_channel: input.acquisition_channel,
      page: input.page,
      props: input.props,
    };
    await deps.repo.putEvent(event);
    return c.body(null, 204);
  });

  return app;
}

/** Record the versions the visitor actually saw; unknown ids are kept verbatim for debugging. */
function resolveContext(experimentId: string) {
  const experiment = EXPERIMENTS.find((e) => e.id === experimentId);
  return {
    experiment: experimentId,
    offer: experiment?.offer_version ?? "unknown",
    price: experiment?.price_version ?? "unknown",
  };
}
