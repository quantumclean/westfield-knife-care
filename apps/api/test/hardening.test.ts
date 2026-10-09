import { describe, expect, it } from "vitest";
import { MemoryRepository } from "../src/repo/memory.ts";
import { OrderWriteConflict } from "../src/repo/types.ts";
import { handlePagesApi, type PagesBindings } from "../src/cloudflare.ts";
import { makeDeps, validOrder } from "./helpers.ts";
import { createOrder } from "../src/services/orders.ts";

describe("optimistic order persistence", () => {
  it("rejects stale writes that would overwrite payment or pickup data", async () => {
    const { deps } = makeDeps({ repo: new MemoryRepository() });
    const { order } = await createOrder(deps, {
      ...validOrder,
      acquisition_channel: "print",
      customer: { ...validOrder.customer, address: { ...validOrder.customer.address, line2: undefined } },
      notes: undefined,
    });
    const first = (await deps.repo.getOrder(order.id))!;
    const stale = (await deps.repo.getOrder(order.id))!;
    first.pickup_status = "picked_up";
    await deps.repo.putOrder(first);
    stale.payment_status = "paid";
    await expect(deps.repo.putOrder(stale)).rejects.toBeInstanceOf(OrderWriteConflict);
    const stored = (await deps.repo.getOrder(order.id))!;
    expect(stored.pickup_status).toBe("picked_up");
    expect(stored.payment_status).toBe("pending");
  });
});

describe("Cloudflare API write protection", () => {
  it("rejects public writes when the configured rate-limit secret is absent", async () => {
    const db = {
      prepare: () => ({ first: async () => ({ name: "orders" }) }),
    } as unknown as NonNullable<PagesBindings["DB"]>;
    const request = new Request("https://preview.example.test/api/waitlist", {
      method: "POST",
      headers: { "CF-Connecting-IP": "192.0.2.10" },
      body: "{}",
    });
    const response = await handlePagesApi(request, { DB: db, STAGE: "staging" });
    expect(response.status).toBe(503);
  });

  it("returns 429 when the salted D1 window limit is exceeded", async () => {
    const db = {
      prepare: (sql: string) =>
        sql.includes("sqlite_master")
          ? { first: async () => ({ name: "orders" }) }
          : { bind: () => ({ first: async () => ({ hits: 6 }) }) },
    } as unknown as NonNullable<PagesBindings["DB"]>;
    const request = new Request("https://preview.example.test/api/waitlist", {
      method: "POST",
      headers: { "CF-Connecting-IP": "192.0.2.10" },
      body: "{}",
    });
    const response = await handlePagesApi(request, {
      DB: db,
      STAGE: "staging",
      RATE_LIMIT_SALT: "unit-test-secret",
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
  });
});
