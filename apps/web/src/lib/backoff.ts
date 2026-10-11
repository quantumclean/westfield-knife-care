/**
 * Delay before the next "is it paid yet?" check on the thank-you page.
 * Stripe's webhook usually lands within a second or two, so start quick and
 * back off, giving up after about a minute instead of hammering every 2s.
 */
const STEPS = [1000, 1500, 2000, 3000, 5000, 8000, 8000, 10000, 12000, 12000] as const;

/** Milliseconds to wait before poll number `attempt` (0-based), or null to stop. */
export function pollDelay(attempt: number): number | null {
  return attempt >= 0 && attempt < STEPS.length ? STEPS[attempt]! : null;
}

export const TOTAL_POLL_MS = STEPS.reduce((sum, ms) => sum + ms, 0);
