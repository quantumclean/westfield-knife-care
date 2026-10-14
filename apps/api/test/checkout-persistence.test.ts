import { describe, expect, it, vi } from "vitest";
import { GetCommand, PutCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { createOrderSchema } from "@wkc/shared";
import { DynamoRepository } from "../src/repo/dynamo.ts";
import { OrderWriteConflict, type CheckoutRecord } from "../src/repo/types.ts";
import { StripeGateway } from "../src/payments/stripe.ts";
import { createOrder } from "../src/services/orders.ts";
import { FakePaymentGateway } from "../src/payments/fake.ts";
import { makeDeps, validOrder } from "./helpers.ts";

async function fixture() {
  const { deps } = makeDeps();
  await createOrder(deps, createOrderSchema.parse(validOrder), "checkout-request-0001");
  const request = (deps.payments as FakePaymentGateway).sessions[0]!;
  return {
    request,
    order: request.order,
    checkout: {
      key: "a".repeat(64),
      fingerprint: "b".repeat(64),
      order_id: request.order.id,
      created_at: request.order.created_at,
      expires_at: request.expires_at,
      site_origin: "https://sharp.example.com",
      description: request.description,
    } satisfies CheckoutRecord,
  };
}
function dynamo(send: ReturnType<typeof vi.fn>) {
  const repo = new DynamoRepository("synthetic-table");
  (repo as unknown as { doc: { send: typeof send } }).doc = { send };
  return repo;
}
const conditional = { name: "ConditionalCheckFailedException" };
const session = { id: "cs_test", url: "https://checkout.stripe.com/pay/test" };

describe("Dynamo checkout persistence (mocked SDK, no AWS requests)", () => {
  it("claims only absent keys and consistently reads the concurrent winner", async () => {
    const { checkout: winner, order } = await fixture();
    const send = vi
      .fn()
      .mockRejectedValueOnce({ name: "TransactionCanceledException" })
      .mockResolvedValueOnce({ Item: { data: winner } });
    expect(
      await dynamo(send).claimCheckout({ ...winner, fingerprint: "c".repeat(64) }, order),
    ).toEqual(winner);
    const transaction = send.mock.calls[0]![0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems).toHaveLength(2);
    expect(transaction.input.TransactItems![0]!.Put!.Item!.pk).toBe(`CHECKOUT#${winner.key}`);
    expect((send.mock.calls[1]![0] as GetCommand).input.ConsistentRead).toBe(true);
  });
  it("saves a session once and rejects a different provider result", async () => {
    const winner = { ...(await fixture()).checkout, session_id: session.id };
    const send = vi
      .fn()
      .mockRejectedValueOnce(conditional)
      .mockResolvedValueOnce({ Item: { data: winner } });
    await dynamo(send).saveCheckoutSession(winner.key, session.id);
    const command = send.mock.calls[0]![0] as UpdateCommand;
    expect(command.input.ConditionExpression).toContain("attribute_not_exists(#data.#session)");
    send.mockRejectedValueOnce(conditional).mockResolvedValueOnce({ Item: { data: winner } });
    await expect(dynamo(send).saveCheckoutSession(winner.key, "cs_other")).rejects.toThrow(
      "Checkout session changed",
    );
  });
  it("propagates storage failures without classifying them as duplicates", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Store unavailable"));
    const repo = dynamo(send);
    const { checkout, order } = await fixture();
    await expect(repo.claimCheckout(checkout, order)).rejects.toThrow("Store unavailable");
    await expect(repo.saveCheckoutSession("key", session.id)).rejects.toThrow("Store unavailable");
    await expect(repo.putOrder(order)).rejects.toThrow("Store unavailable");
  });
  it("guards order creation, legacy revision zero and later revisions", async () => {
    const send = vi.fn().mockResolvedValue({});
    const repo = dynamo(send);
    const order = structuredClone((await fixture()).order);
    delete order.revision;
    expect(order.revision).toBeUndefined();
    await repo.putOrder(order);
    expect((send.mock.calls[0]![0] as PutCommand).input.ConditionExpression).toBe(
      "attribute_not_exists(pk)",
    );
    expect(order.revision).toBe(1);
    order.revision = 0;
    await repo.putOrder(order);
    expect((send.mock.calls[1]![0] as PutCommand).input.ConditionExpression).toContain(
      "attribute_not_exists(#data.#revision)",
    );
    send.mockRejectedValueOnce(conditional);
    await expect(repo.putOrder(order)).rejects.toBeInstanceOf(OrderWriteConflict);
    expect(order.revision).toBe(1);
    send.mockResolvedValueOnce({ Item: { data: { ...order, revision: undefined } } });
    expect((await repo.getOrder(order.id))!.revision).toBe(0);
    expect((send.mock.calls.at(-1)![0] as GetCommand).input.ConsistentRead).toBe(true);
  });
});

it("Stripe retries use identical parameters and one order-based key despite a changing clock", async () => {
  const request = (await fixture()).request;
  const create = vi.fn().mockResolvedValue(session);
  const gateway = new StripeGateway({ secret_key: "sk_test_synthetic" });
  (gateway as unknown as { stripe: { checkout: { sessions: { create: typeof create } } } }).stripe =
    { checkout: { sessions: { create } } };
  const clock = vi.spyOn(Date, "now");
  try {
    clock.mockReturnValue(1000);
    await gateway.createCheckoutSession(request);
    clock.mockReturnValue(300000);
    await gateway.createCheckoutSession(request);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    const [params, options] = create.mock.calls[0]!;
    expect(options.idempotencyKey).toBe(`checkout-${request.order.id}`);
    expect(params.line_items[0].price_data.unit_amount).toBe(request.order.quote.total_cents);
    expect(params.metadata).toMatchObject({
      experiment_id: "experiment-001",
      source: "flyer-v1-qr",
      acquisition_channel: "print",
    });
    expect(params.expires_at).toBe(request.expires_at);
  } finally {
    clock.mockRestore();
  }
});
