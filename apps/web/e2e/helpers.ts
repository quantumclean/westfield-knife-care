import type { Page, Route } from "@playwright/test";

/** Obviously fake; matches the shape the API issues (base64url, 32 chars). */
export const FEEDBACK_TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

export const paidOrder = {
  id: "id-0001",
  first_name: "Ada",
  payment_status: "paid",
  pickup_status: "scheduled",
  return_status: "pending",
  number_of_knives: 4,
  care_day: "2026-10-13",
  total_cents: 3900,
  currency: "usd",
  experiment_id: "experiment-001",
  offer_version: "offer-001",
  price_version: "price-001",
  source: "direct",
  acquisition_channel: "direct",
  repeat_intent: "unknown",
};

export interface Recorded {
  /** URLs of every request the page made to the (mocked) API. */
  urls: string[];
  /** Bodies of first-party analytics events. */
  events: string[];
  /** Bodies of feedback POSTs. */
  feedback: string[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/**
 * Mock the whole `/api/*` surface. `orders` is the sequence of order bodies returned by
 * `GET /api/orders/:id` (the last one repeats), to simulate the webhook landing mid-polling.
 */
export async function mockApi(
  page: Page,
  options: { orders?: unknown[]; orderStatus?: number } = {},
): Promise<Recorded> {
  const recorded: Recorded = { urls: [], events: [], feedback: [] };
  const orders = options.orders ?? [paidOrder];
  let served = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    recorded.urls.push(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/config") {
      return json(route, { care_days: ["2026-10-13", "2026-10-14"], payments_enabled: true });
    }
    if (path === "/events") {
      recorded.events.push(request.postData() ?? "");
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/feedback")) {
      recorded.feedback.push(request.postData() ?? "");
      return json(route, { ...paidOrder, repeat_intent: "yes" });
    }
    if (path.startsWith("/orders/")) {
      if (options.orderStatus) return json(route, { error: "x" }, options.orderStatus);
      return json(route, orders[Math.min(served++, orders.length - 1)]);
    }
    return json(route, { error: "not_found" }, 404);
  });
  return recorded;
}

/** True when nothing on the page is wider than the viewport (no horizontal scroll or clipping). */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
