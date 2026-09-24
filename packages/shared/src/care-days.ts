/**
 * Care days are the days we run pickup routes. Batching pickups onto fixed
 * weekdays is what makes a one-person operation scale to neighbourhood routes.
 * Weekdays use JavaScript's convention: 0 = Sunday ... 6 = Saturday.
 */
export interface CareDayConfig {
  /** Weekdays we pick up on. */
  weekdays: readonly number[];
  /** Minimum full days between booking and pickup. */
  lead_days: number;
  /** How many upcoming care days to offer. */
  horizon: number;
}

export const DEFAULT_CARE_DAY_CONFIG: CareDayConfig = {
  weekdays: [2, 4, 6], // Tue, Thu, Sat
  lead_days: 1,
  horizon: 6,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date as YYYY-MM-DD using UTC fields. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD to a UTC Date; undefined for anything else. */
export function parseIsoDate(value: string): Date | undefined {
  if (!ISO_DATE.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? undefined : date;
}

/** Upcoming care days as ISO dates, starting after the lead time. */
export function upcomingCareDays(
  now: Date = new Date(),
  config: CareDayConfig = DEFAULT_CARE_DAY_CONFIG,
): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cursor.setUTCDate(cursor.getUTCDate() + config.lead_days + 1);
  // Never scan more than a year; guards against an empty weekday list.
  for (let i = 0; i < 366 && days.length < config.horizon; i++) {
    if (config.weekdays.includes(cursor.getUTCDay())) days.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** True when `careDay` is one of the currently bookable care days. */
export function isBookableCareDay(
  careDay: string,
  now: Date = new Date(),
  config: CareDayConfig = DEFAULT_CARE_DAY_CONFIG,
): boolean {
  return parseIsoDate(careDay) !== undefined && upcomingCareDays(now, config).includes(careDay);
}

/** Human label, e.g. "Tue, Sep 29". */
export function formatCareDay(careDay: string, locale: string = "en-US"): string {
  const date = parseIsoDate(careDay);
  if (!date) return careDay;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Whole hours between two ISO timestamps, never negative. */
export function hoursBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / 36_000) / 100);
}
