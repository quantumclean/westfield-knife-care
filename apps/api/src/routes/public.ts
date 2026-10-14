import { Hono } from "hono";
import {
  EXPERIMENTS,
  LEGACY_V1_ACCEPTED_UNTIL,
  OFFER_VERSIONS,
  PRICE_VERSIONS,
  activeExperiments,
  analyticsSource,
  createOrderSchema,
  createWaitlistSchema,
  forgetVisitorSchema,
  formatIssues,
  orderFeedbackSchema,
  ownerHashOf,
  parseEventPayload,
  upcomingCareDays,
  type AnalyticsEvent,
  type WaitlistEntry,
} from "@wkc/shared";
import type { Deps } from "../deps.ts";
import { BODY_LIMITS, readJsonBody } from "../services/request-body.ts";
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
    const requestKey = c.req.header("Idempotency-Key");
    if (requestKey !== undefined && !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey))
      return c.json(
        {
          error: "invalid_request",
          issues: ["idempotency_key: use 16-128 letters, numbers, underscores or hyphens"],
        },
        400,
      );
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.order);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = createOrderSchema.safeParse(body.value);
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const { order, checkout_url } = await createOrder(deps, parsed.data, requestKey);
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
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.feedback);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = orderFeedbackSchema.safeParse(body.value);
    if (!parsed.success)
      return c.json({ error: "invalid_request", issues: formatIssues(parsed.error) }, 400);
    const order = await recordFeedback(deps, c.req.param("id"), parsed.data);
    return c.json(publicOrderView(order));
  });

  app.post("/waitlist", async (c) => {
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.waitlist);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = createWaitlistSchema.safeParse(body.value);
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

  /**
   * First-party analytics. Accepts a batch (or one event) that passes the shared catalog and
   * nothing else: a rejected body gets a bare 400 that never repeats what was sent, and
   * nothing about the request is logged. Client `event_id`s make retried batches idempotent.
   */
  app.post("/events", async (c) => {
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.event);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = parseEventPayload(body.value);
    if (!parsed.ok) return c.json({ error: "invalid_event" }, 400);
    if (parsed.events.some((e) => e.view_id !== "legacy-v1" && !e.owner))
      return c.json({ error: "invalid_event" }, 400);
    const created_at = deps.now().toISOString();
    // v1 bodies (no deletion proof) are accepted only for a short window after the v2 deploy.
    if (
      created_at >= LEGACY_V1_ACCEPTED_UNTIL &&
      parsed.events.some((e) => e.view_id === "legacy-v1")
    )
      return c.json({ error: "invalid_event" }, 400);
    const events = parsed.events.map((input): AnalyticsEvent => {
      const { experiment, offer, price } = resolveContext(input.experiment_id);
      return {
        id: input.event_id ? `ev-${input.event_id}` : deps.newId(),
        created_at,
        name: input.name,
        visitor_id: input.visitor_id,
        experiment_id: experiment,
        offer_version: offer,
        price_version: price,
        source: analyticsSource(input.source),
        acquisition_channel: input.acquisition_channel,
        page: input.route,
        props: input.props,
        v: input.v,
        view_id: input.view_id,
        device: input.device,
        viewport: input.viewport,
        ...(input.owner ? { owner: input.owner } : {}),
      };
    });
    await deps.repo.putEvents(events);
    return c.body(null, 204);
  });

  /**
   * Erase this browser's analytics events ("Delete my analytics data" in the privacy panel).
   * Proof of possession: events carry the SHA-256 of a random key that only the sending
   * browser holds, and only events whose hash matches the presented key are deleted. A visitor
   * id alone (for example one copied from an order export) deletes nothing. Orders and waitlist
   * entries are not touched here; those requests go to the support address.
   */
  app.post("/events/forget", async (c) => {
    const body = await readJsonBody(c.req.raw, BODY_LIMITS.forget);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const parsed = forgetVisitorSchema.safeParse(body.value);
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    // Same response whether or not anything matched, so this cannot probe for visitors.
    await deps.repo.deleteVisitorEvents(parsed.data.visitor_id, await ownerHashOf(parsed.data.key));
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
