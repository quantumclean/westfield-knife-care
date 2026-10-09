import { describe, expect, it } from "vitest";
import type { Order } from "@wkc/shared";
import { D1Repository, type D1Database, type D1Statement } from "../src/repo/d1.ts";
import { OrderWriteConflict } from "../src/repo/types.ts";

const storedOrder = (): Order => ({
  id: "order-1",
  created_at: "2026-09-01T12:00:00.000Z",
  updated_at: "2026-09-01T12:00:00.000Z",
  revision: 3,
  customer: {
    name: "Ada Example",
    email: "ada@example.com",
    address: { line1: "1 Main St", city: "Westfield", state: "NJ", zip: "07090" },
  },
  experiment_id: "experiment-001",
  offer_version: "offer-001",
  price_version: "price-001",
  source: "flyer",
  acquisition_channel: "print",
  number_of_knives: 4,
  care_day: "2026-09-26",
  quote: {
    currency: "usd",
    knives_included: 4,
    bundle_price_cents: 3900,
    extra_knives: 0,
    extra_knife_price_cents: 1000,
    extra_knives_cents: 0,
    total_cents: 3900,
  },
  payment_status: "paid",
  pickup_status: "scheduled",
  return_status: "pending",
  repeat_intent: "unknown",
  is_repeat_customer: false,
  actual_repeat_purchase: false,
});

class NoChangeStatement implements D1Statement {
  values: (string | number | null)[] = [];

  constructor(readonly query: string) {}

  bind(...values: (string | number | null)[]): D1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: [] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    return { meta: { changes: 0 } };
  }
}

class NoChangeDatabase implements D1Database {
  statement: NoChangeStatement | undefined;

  prepare(query: string): D1Statement {
    this.statement = new NoChangeStatement(query);
    return this.statement;
  }
}

describe("D1 optimistic order persistence", () => {
  it("reports a conflict when the revision-guarded update changes no row", async () => {
    const db = new NoChangeDatabase();
    const repo = new D1Repository(db);
    const order = storedOrder();

    await expect(repo.putOrder(order)).rejects.toBeInstanceOf(OrderWriteConflict);
    expect(db.statement?.query).toContain("COALESCE(json_extract(data, '$.revision'), 0) = ?");
    expect(db.statement?.values.at(-1)).toBe(3);
    expect(order.revision).toBe(3);
  });
});
