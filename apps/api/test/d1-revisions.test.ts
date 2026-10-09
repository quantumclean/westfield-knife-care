import { describe, expect, it } from "vitest";
import { D1Repository, type D1Database } from "../src/repo/d1.ts";
import type { Order } from "@wkc/shared";

describe("D1 legacy order revisions", () => {
  it("normalizes pre-revision orders returned by email lookup", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({
            results: [
              {
                data: JSON.stringify({
                  id: "legacy-order",
                  payment_status: "paid",
                  customer: { email: "test@example.com" },
                }),
              },
            ],
          }),
        }),
      }),
    } as unknown as D1Database;
    const repo = new D1Repository(db);
    const orders = await repo.findOrdersByEmail("test@example.com");
    expect(orders).toHaveLength(1);
    expect(orders[0]?.revision).toBe(0);
  });

  it("preserves an existing revision from email lookup", async () => {
    const row = { id: "existing", revision: 4 } as Order;
    const db = {
      prepare: () => ({
        bind: () => ({
          all: async () => ({ results: [{ data: JSON.stringify(row) }] }),
        }),
      }),
    } as unknown as D1Database;
    expect((await new D1Repository(db).findOrdersByEmail("test@example.com"))[0]?.revision).toBe(4);
  });
});
