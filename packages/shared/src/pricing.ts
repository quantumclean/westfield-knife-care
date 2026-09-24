import type { PriceVersion, Quote } from "./types.ts";

export class PricingError extends Error {
  override name = "PricingError";
}

/**
 * Compute what a customer pays for `numberOfKnives` under a price version.
 * Pure and deterministic: the API recomputes it and never trusts the client.
 */
export function quoteOrder(price: PriceVersion, numberOfKnives: number): Quote {
  if (!Number.isInteger(numberOfKnives) || numberOfKnives < 1) {
    throw new PricingError("number_of_knives must be a positive integer");
  }
  if (numberOfKnives > price.max_knives) {
    throw new PricingError(`number_of_knives exceeds maximum of ${price.max_knives}`);
  }
  const extraKnives = Math.max(0, numberOfKnives - price.knives_included);
  const extraKnivesCents = extraKnives * price.extra_knife_price_cents;
  return {
    currency: price.currency,
    knives_included: price.knives_included,
    bundle_price_cents: price.bundle_price_cents,
    extra_knives: extraKnives,
    extra_knife_price_cents: price.extra_knife_price_cents,
    extra_knives_cents: extraKnivesCents,
    total_cents: price.bundle_price_cents + extraKnivesCents,
  };
}

/** Format cents as a currency string, e.g. 3900 -> "$39". Whole dollars drop the cents. */
export function formatMoney(cents: number, currency: string = "usd"): string {
  const amount = cents / 100;
  const hasCents = cents % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount);
}

/** Human label for a price version, e.g. "$39 for 4 knives". */
export function describePrice(price: PriceVersion): string {
  const knives = price.knives_included === 1 ? "knife" : "knives";
  return `${formatMoney(price.bundle_price_cents, price.currency)} for ${price.knives_included} ${knives}`;
}

/** Effective per-knife price of the bundle, useful for pricing analysis. */
export function perKnifeCents(price: PriceVersion): number {
  return Math.round(price.bundle_price_cents / price.knives_included);
}
