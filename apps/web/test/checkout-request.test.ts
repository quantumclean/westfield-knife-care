import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderSchema } from "@wkc/shared";
import {
  checkoutRequestKey,
  clearCheckoutRequest,
  CHECKOUT_REQUEST_KEY,
} from "../src/lib/checkout-request.ts";
import { clearDraft } from "../src/lib/draft.ts";
import { api } from "../src/lib/api.ts";

const input = createOrderSchema.parse({
  experiment_id: "experiment-001",
  number_of_knives: 4,
  care_day: "2026-10-17",
  customer: {
    name: "Ada",
    email: "ada@example.com",
    phone: "555-010-2030",
    address: { line1: "1 Main St", city: "Westfield", state: "NJ", zip: "07090" },
  },
});
function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}
afterEach(() => {
  clearCheckoutRequest(null);
  vi.unstubAllGlobals();
});

describe("browser checkout intent", () => {
  it("keeps a key across errors and reloads, with only hashes and keys in storage", async () => {
    const storage = memory();
    const first = await checkoutRequestKey(input, storage);
    clearCheckoutRequest(null); // Simulate a reload that loses module memory.
    expect(await checkoutRequestKey(input, storage)).toBe(first);
    expect(storage.getItem(CHECKOUT_REQUEST_KEY)).not.toContain("ada@example.com");
    expect(
      await checkoutRequestKey(
        { ...input, customer: { ...input.customer, email: " ADA@example.com " } },
        storage,
      ),
    ).toBe(first);
  });
  it("changes key for a new intent and clears after a confirmed booking", async () => {
    const storage = memory();
    const key = await checkoutRequestKey(input, storage);
    expect(await checkoutRequestKey({ ...input, number_of_knives: 5 }, storage)).not.toBe(key);
    clearDraft(storage);
    expect(storage.getItem(CHECKOUT_REQUEST_KEY)).toBeNull();
    expect(await checkoutRequestKey(input, storage)).not.toBe(key);
  });
  it("retains a usable key when storage is blocked", async () => {
    const storage = {
      getItem() {
        throw Error("blocked");
      },
      setItem() {
        throw Error("blocked");
      },
      removeItem() {
        throw Error("blocked");
      },
    };
    expect(await checkoutRequestKey(input, storage)).toBe(await checkoutRequestKey(input, storage));
  });
  it("uses the same header after a lost HTTP response", async () => {
    vi.stubGlobal("window", { localStorage: memory() });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            order_id: "order-1",
            experiment_id: "experiment-001",
            quote: { total_cents: 3900 },
            checkout_url: "https://checkout.stripe.com/pay/test",
          }),
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.createOrder(input)).rejects.toThrow();
    await api.createOrder(input);
    expect(fetchMock.mock.calls[0]![1].headers["Idempotency-Key"]).toBe(
      fetchMock.mock.calls[1]![1].headers["Idempotency-Key"],
    );
  });
});
