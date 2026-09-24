/**
 * Analytics event catalog. Names are shared by the browser (GA4 + first-party
 * /events endpoint) and the API's funnel summary. See docs/analytics-events.md.
 */
export const EVENTS = {
  page_view: "page_view",
  cta_click: "cta_click",
  booking_opened: "booking_opened",
  booking_submitted: "booking_submitted",
  checkout_started: "checkout_started",
  checkout_completed: "checkout_completed",
  pilot_opened: "pilot_opened",
  pilot_submitted: "pilot_submitted",
  faq_opened: "faq_opened",
  form_error: "form_error",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const EVENT_NAMES: readonly EventName[] = Object.values(EVENTS);

/** Ordered funnel used for the per-experiment summary. */
export const FUNNEL_STEPS: readonly EventName[] = [
  EVENTS.page_view,
  EVENTS.cta_click,
  EVENTS.booking_opened,
  EVENTS.booking_submitted,
  EVENTS.checkout_started,
  EVENTS.checkout_completed,
];

export function isEventName(value: string): value is EventName {
  return (EVENT_NAMES as readonly string[]).includes(value);
}
