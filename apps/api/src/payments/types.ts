import type { Order } from "@wkc/shared";

export interface CheckoutRequest {
  order: Order;
  /** Product line shown on the Stripe page, e.g. "Knife sharpening: 4 knives". */
  description: string;
  success_url: string;
  cancel_url: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

/** Provider-agnostic payment events the order service reacts to. */
export type PaymentEvent =
  | {
      type: "checkout_completed";
      order_id: string;
      checkout_session_id: string;
      payment_intent_id?: string;
      amount_cents?: number;
      currency?: string;
    }
  | { type: "checkout_expired"; order_id: string; checkout_session_id: string }
  | { type: "payment_failed"; order_id: string; checkout_session_id: string }
  | {
      type: "refunded";
      order_id: string;
      payment_intent_id?: string;
      /** Stripe charge.amount_refunded is the cumulative total, not this event delta. */
      refunded_amount_cents?: number;
      original_amount_cents?: number;
    }
  | { type: "ignored"; provider_type: string };

export class WebhookVerificationError extends Error {
  override name = "WebhookVerificationError";
}

export interface PaymentGateway {
  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Verify and normalise a webhook. Throws WebhookVerificationError on a bad signature. */
  parseWebhook(rawBody: string, signature: string | undefined): Promise<PaymentEvent>;
}
