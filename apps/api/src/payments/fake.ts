import {
  WebhookVerificationError,
  type CheckoutRequest,
  type CheckoutSession,
  type PaymentEvent,
  type PaymentGateway,
} from "./types.ts";

/**
 * Stand-in used in tests and local development when no Stripe key is set.
 * "Checkout" sends the customer straight to the success URL; a webhook body
 * is accepted as a JSON PaymentEvent when signed with the shared secret.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly sessions: CheckoutRequest[] = [];
  private readonly secret: string;

  constructor(secret: string = "fake-webhook-secret") {
    this.secret = secret;
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    this.sessions.push(request);
    const id = `cs_fake_${request.order.id}`;
    return { id, url: request.success_url.replace("{CHECKOUT_SESSION_ID}", id) };
  }

  async parseWebhook(rawBody: string, signature: string | undefined): Promise<PaymentEvent> {
    if (signature !== this.secret) throw new WebhookVerificationError("Bad fake signature");
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
