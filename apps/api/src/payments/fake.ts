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
  readonly states = new Map<string, "open" | "complete" | "expired">();
  private readonly secret: string;

  constructor(secret: string = "fake-webhook-secret") {
    this.secret = secret;
  }

  async createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession> {
    this.sessions.push(request);
    const id = `cs_fake_${request.order.id}`;
    this.states.set(id, "open");
    return { id, url: request.success_url.replace("{CHECKOUT_SESSION_ID}", id) };
  }

  async retrieveCheckoutSession(id: string) {
    const status = this.states.get(id) ?? "expired";
    const request = this.sessions.find((candidate) => `cs_fake_${candidate.order.id}` === id);
    return {
      id,
      status,
      url:
        status === "open" && request
          ? request.success_url.replace("{CHECKOUT_SESSION_ID}", id)
          : undefined,
    };
  }

  async parseWebhook(rawBody: string, signature: string | undefined): Promise<PaymentEvent> {
    if (signature !== this.secret) throw new WebhookVerificationError("Bad fake signature");
    return JSON.parse(rawBody) as PaymentEvent;
  }
}
