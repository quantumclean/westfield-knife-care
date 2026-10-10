import { EVENTS, type EventName } from "@wkc/shared";
import { API_BASE } from "./api.ts";
import { withoutFeedbackToken } from "./feedback-token.ts";
import { sessionContext, type Session } from "./session.ts";

type Props = Record<string, string | number | boolean>;

let session: Session | undefined;

/**
 * The page URL as analytics is allowed to see it: never carries the feedback token. GA4 would
 * otherwise default `page_location` to the full URL, so we set it explicitly everywhere. This is a
 * belt-and-braces guard; the thank-you page already strips `ft` from the URL before we run.
 */
export function safePageLocation(): string {
  try {
    return withoutFeedbackToken(window.location.href);
  } catch {
    return window.location.origin + window.location.pathname;
  }
}

/** Load GA4 (if configured) and remember the session for every event. */
export function initAnalytics(current: Session): void {
  session = current;
  const id = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  if (!id || window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: false,
    page_location: safePageLocation(),
    experiment_id: current.experiment.experiment.id,
    offer_version: current.experiment.offer.id,
    price_version: current.experiment.price.id,
    acquisition_source: current.attribution.source,
    acquisition_channel: current.attribution.acquisition_channel,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/**
 * Record an event in GA4 (when configured) and in our own store. The
 * first-party copy is what the experiment summary is built from, so it is
 * sent with keepalive to survive navigation to Stripe.
 */
export function track(name: EventName, props: Props = {}): void {
  if (!session) return;
  const context = sessionContext(session);
  const payload = {
    ...context,
    offer_version: session.experiment.offer.id,
    price_version: session.experiment.price.id,
    // Pin page_location so GA4 never falls back to the raw URL (which could still carry ?ft=).
    page_location: safePageLocation(),
    ...props,
  };
  window.gtag?.("event", name, payload);

  const body = JSON.stringify({
    ...context,
    name,
    page: window.location.pathname,
    props,
  });
  try {
    void fetch(`${API_BASE}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the page.
  }
}

export { EVENTS };
