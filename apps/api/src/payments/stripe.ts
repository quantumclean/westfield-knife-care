import Stripe from "stripe";
import {
  WebhookVerificationError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentGateway,
} from "./types.ts";

export interface StripeGatewayOptions {
  secret_key: string;
  webhook_secret?: string;
  /** Minutes before an unpaid Checkout session expires (Stripe minimum 30). */
  session_ttl_minutes?: number;
}

/**
 * Stripe Checkout. Prices are passed inline from the server-side quote, so
 * no Stripe Products or Payment Links need to be maintained per experiment.
 */
export class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string | undefined;
  private readonly ttlMinutes: number;

  constructor(options: StripeGatewayOptions) {
    this.stripe = new Stripe(options.secret_key);
    this.webhookSecret = options.webhook_secret;
    this.ttlMinutes = Math.max(30, options.session_ttl_minutes ?? 60);
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    const { order } = request;
    const metadata = {
      order_id: order.id,
      experiment_id: order.experiment_id,
      offer_version: order.offer_version,
      price_version: order.price_version,
      source: order.source,
      acquisition_channel: order.acquisition_channel,
    };
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer_email: order.customer.email,
        client_reference_id: order.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: order.quote.currency,
              unit_amount: order.quote.total_cents,
              product_data: {
                name: "Westfield Knife Care: sharpening",
                description: request.description,
              },
            },
          },
        ],
        metadata,
        payment_intent_data: { metadata },
        success_url: request.success_url,
        cancel_url: request.cancel_url,
        expires_at: Math.floor(Date.now() / 1000) + this.ttlMinutes * 60,
      },
      { idempotencyKey: `checkout-${order.id}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { id: session.id, url: session.url };
  }

  async parseWebhook(rawBody: string, signature: string | undefined): Promise<PaymentEvent> {
    if (!this.webhookSecret) throw new WebhookVerificationError("Webhook secret not configured");
    if (!signature) throw new WebhookVerificationError("Missing Stripe-Signature header");
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (error) {
      throw new WebhookVerificationError((error as Error).message);
    }
    return normaliseStripeEvent(event);
  }
}

/** Exported for tests: maps Stripe event shapes onto PaymentEvent. */
export function normaliseStripeEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      const order_id = session.metadata?.order_id ?? session.client_reference_id;
      if (!order_id) return { type: "ignored", provider_type: event.type };
      if (session.payment_status !== "paid") return { type: "ignored", provider_type: event.type };
      return {
        type: "checkout_completed",
        order_id,
        checkout_session_id: session.id,
        payment_intent_id: stringId(session.payment_intent),
        amount_cents: session.amount_total ?? undefined,
      };
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const order_id = session.metadata?.order_id ?? session.client_reference_id;
      return order_id
        ? { type: "checkout_expired", order_id, checkout_session_id: session.id }
        : { type: "ignored", provider_type: event.type };
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const order_id = session.metadata?.order_id ?? session.client_reference_id;
      return order_id
        ? { type: "payment_failed", order_id, checkout_session_id: session.id }
        : { type: "ignored", provider_type: event.type };
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const order_id = charge.metadata?.order_id;
      return order_id
        ? { type: "refunded", order_id, payment_intent_id: stringId(charge.payment_intent) }
        : { type: "ignored", provider_type: event.type };
    }
    default:
      return { type: "ignored", provider_type: event.type };
  }
}

function stringId(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}
