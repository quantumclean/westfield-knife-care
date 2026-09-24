import { describe, expect, it } from "vitest";
import {
  PricingError,
  describePrice,
  formatMoney,
  getPriceVersion,
  perKnifeCents,
  quoteOrder,
} from "../src/index.ts";

const price001 = getPriceVersion("price-001")!;
const price002 = getPriceVersion("price-002")!;

describe("quoteOrder", () => {
  it("charges the bundle price up to the included count", () => {
    expect(quoteOrder(price001, 1).total_cents).toBe(3900);
    expect(quoteOrder(price001, 4).total_cents).toBe(3900);
    expect(quoteOrder(price002, 5).total_cents).toBe(4900);
  });

  it("adds extra knives at the per-knife rate", () => {
    const quote = quoteOrder(price001, 6);
    expect(quote.extra_knives).toBe(2);
    expect(quote.extra_knives_cents).toBe(2000);
    expect(quote.total_cents).toBe(5900);
  });

  it("rejects invalid counts", () => {
    expect(() => quoteOrder(price001, 0)).toThrow(PricingError);
    expect(() => quoteOrder(price001, 2.5)).toThrow(PricingError);
    expect(() => quoteOrder(price001, price001.max_knives + 1)).toThrow(PricingError);
  });
});

describe("formatting", () => {
  it("formats whole dollars without cents", () => {
    expect(formatMoney(3900)).toBe("$39");
    expect(formatMoney(4950)).toBe("$49.50");
  });

  it("describes a price version", () => {
    expect(describePrice(price001)).toBe("$39 for 4 knives");
    expect(perKnifeCents(price002)).toBe(980);
  });
});
