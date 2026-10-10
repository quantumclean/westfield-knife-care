import { Hono } from "hono";
import type { Deps } from "../deps.ts";
import { WebhookVerificationError } from "../payments/types.ts";
import { BODY_LIMITS, readTextBody } from "../services/request-body.ts";
import { applyPaymentEvent } from "../services/orders.ts";

export function webhookRoutes(deps: Deps) {
  const app = new Hono();

  app.post("/webhooks/stripe", async (c) => {
    const body = await readTextBody(c.req.raw, BODY_LIMITS.webhook);
    if (!body.ok) return c.json({ error: body.error }, body.status);
    const signature = c.req.header("stripe-signature");
    let event;
    try {
      event = await deps.payments.parseWebhook(body.value, signature);
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        deps.log("webhook.rejected", { reason: error.message });
        return c.json({ error: "invalid_signature" }, 400);
      }
      throw error;
    }
    const order = await applyPaymentEvent(deps, event);
    return c.json({ received: true, type: event.type, order_id: order?.id ?? null });
  });

  return app;
}
