import type { SiteConfig } from "./api.ts";

/** Keep the chosen pickup day if the server still offers it, otherwise the first offered day. */
export function pickCareDay(current: string, days: readonly string[]): string {
  if (current && days.includes(current)) return current;
  return days[0] ?? "";
}

export type ConfigState =
  { status: "loading" } | { status: "error" } | { status: "ready"; config: SiteConfig };

export type ClosedReason = "unreachable" | "payments_disabled" | "no_pickup_days";

export type Availability =
  { status: "checking" } | { status: "open" } | { status: "closed"; reason: ClosedReason };

/**
 * Whether the booking form may submit.
 *
 * A production build fails closed: it only opens once GET /config has
 * answered with a valid body that says payments are enabled and pickup days
 * exist. Anything else (API down, HTML from static hosting, payments off)
 * keeps submission disabled, so nobody "books" against a simulated checkout.
 * `dev` is the Vite dev server, where the API runs without Stripe on purpose.
 */
export function resolveAvailability(state: ConfigState, opts: { dev: boolean }): Availability {
  if (opts.dev) return { status: "open" };
  if (state.status === "loading") return { status: "checking" };
  if (state.status === "error") return { status: "closed", reason: "unreachable" };
  if (!state.config.payments_enabled) return { status: "closed", reason: "payments_disabled" };
  if (state.config.care_days.length === 0) return { status: "closed", reason: "no_pickup_days" };
  return { status: "open" };
}

export function closedMessage(reason: ClosedReason, supportEmail: string): string {
  switch (reason) {
    case "unreachable":
      return `Online booking is temporarily unavailable. Please try again in a few minutes, or email ${supportEmail}.`;
    case "payments_disabled":
      return `Online payments are not available right now, so booking is paused. Nothing has been charged. Please try again later or email ${supportEmail}.`;
    case "no_pickup_days":
      return `There are no pickup days open for booking right now. Please check back soon or email ${supportEmail}.`;
  }
}
