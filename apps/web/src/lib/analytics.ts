import {
  ANALYTICS_SCHEMA_VERSION,
  CATALOG,
  EVENTS,
  MAX_EVENTS_PER_BATCH,
  MAX_EVENTS_PER_VIEW,
  analyticsSource,
  deviceClass,
  formFieldId,
  normalizeEvent,
  onceKey,
  routeId,
  viewportBand,
  type ErrorKind,
  type EventName,
  type EventProps,
} from "@wkc/shared";
import { API_BASE, setApiFailureReporter } from "./api.ts";
import { PRIVACY_CHANGED, googleAllowed, measurementAllowed } from "./consent.ts";
import { startHealthReporting } from "./health.ts";
import { sanitizePageUrl, sanitizeReferrer } from "./privacy-url.ts";
import type { Session } from "./session.ts";

/**
 * Privacy-conscious analytics (schema v2, docs/analytics-events.md).
 *
 * Every event is normalised against the shared catalog before it leaves the page, so call
 * sites cannot add typed text, contact details, order ids or URLs. Events are batched to our
 * own `/api/events`; Google Analytics only ever sees catalog events marked third-party, only
 * after the visitor opts in, never on the thank-you page and never with our visitor id.
 * Nothing here may throw into the page, block rendering or retry in a loop.
 */

type Props = Record<string, string | number | boolean | undefined>;

interface Envelope {
  v: number;
  event_id: string;
  view_id: string;
  name: EventName;
  experiment_id: string;
  source: string;
  acquisition_channel: string;
  visitor_id: string;
  route: string;
  device: string;
  viewport: string;
  props: EventProps;
}

/** Sent right away: the page may be about to navigate (Stripe, thank-you page). */
const URGENT = new Set<EventName>([
  EVENTS.booking_submitted,
  EVENTS.checkout_started,
  EVENTS.checkout_completed,
  EVENTS.pilot_submitted,
]);
const FLUSH_DELAY_MS = 2000;
const FLUSH_AT = 10;
/** Most events held while offline before the oldest are dropped. */
const MAX_HELD = 40;

interface ViewState {
  session: Session;
  viewId: string;
  route: string;
  queue: Envelope[];
  sent: number;
  perName: Map<EventName, number>;
  once: Set<string>;
  /** Which dialog flow the visitor is in, and how far the current booking got. */
  flow: { kind: "booking" | "pilot" | null; opening: number; details: boolean; checkout: boolean };
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Set after a 429/503: stop sending for the rest of this page load. */
  paused: boolean;
  google: "off" | "loaded";
}

let state: ViewState | undefined;

const newId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

function screen(): { device: string; viewport: string } {
  try {
    const width = window.innerWidth;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    return { device: deviceClass(width, coarse), viewport: viewportBand(width) };
  } catch {
    return { device: "unknown", viewport: "unknown" };
  }
}

/** The page URL as analytics is allowed to see it (route and campaign tags only). */
export function safePageLocation(): string {
  try {
    return sanitizePageUrl(window.location.href);
  } catch {
    return "";
  }
}

/** True on screens where nothing third-party may load: the thank-you page and open dialogs. */
export function isSensitiveScreen(): boolean {
  try {
    if (routeId(window.location.pathname) === "/thanks") return true;
    return typeof document !== "undefined" && Boolean(document.querySelector?.("dialog[open]"));
  } catch {
    return true;
  }
}

/** Start measuring this page load. Safe to call once per page. */
export function initAnalytics(current: Session): void {
  state = {
    session: current,
    viewId: newId(),
    route: routeId(window.location.pathname),
    queue: [],
    sent: 0,
    perName: new Map(),
    once: new Set(),
    flow: { kind: null, opening: 0, details: false, checkout: false },
    timer: undefined,
    paused: false,
    google: "off",
  };
  try {
    const flushNow = () => flush();
    window.addEventListener("pagehide", flushNow);
    window.addEventListener("online", flushNow);
    document.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener(PRIVACY_CHANGED, applyPrivacyChoices);
  } catch {
    // Without listeners events still go out on the timer.
  }
  setApiFailureReporter((area, status) =>
    track(EVENTS.client_error, { kind: "api", area, status }),
  );
  startHealthReporting({
    track,
    flush,
    area: () => state?.flow.kind ?? (state?.route === "/thanks" ? "thanks" : "page"),
  });
  applyPrivacyChoices();
}

/**
 * Re-read the visitor's choices: drop queued events on opt-out, load or stop Google. Also
 * called when a dialog closes, since Google is not loaded while one is open.
 */
export function applyPrivacyChoices(): void {
  if (!state) return;
  if (!measurementAllowed()) state.queue.length = 0;
  if (googleAllowed()) loadGoogle();
  else if (state.google === "loaded") stopGoogle();
}

/** The dialog flow the visitor is currently in (booking sheet or waitlist), if any. */
export function activeFlow(): {
  kind: "booking" | "pilot" | null;
  details: boolean;
  checkout: boolean;
} {
  return state ? { ...state.flow } : { kind: null, details: false, checkout: false };
}

/** Called when the open dialog closes. */
export function endFlow(): void {
  if (state) state.flow.kind = null;
}

/**
 * Record an event. Unknown events and props are dropped by the catalog; repeats of
 * once-per-view events and anything beyond the page budget are dropped here.
 */
export function track(name: EventName, props: Props = {}): void {
  if (!state || !measurementAllowed()) return;
  const event = normalizeEvent(name, props);
  if (!event) return;
  const { flow } = state;
  if (event.name === EVENTS.booking_opened) {
    Object.assign(flow, {
      kind: "booking",
      opening: flow.opening + 1,
      details: false,
      checkout: false,
    });
  } else if (event.name === EVENTS.pilot_opened) {
    flow.kind = "pilot";
  } else if (event.name === EVENTS.booking_step && event.props.step === "details") {
    flow.details = true;
  } else if (event.name === EVENTS.checkout_started) {
    flow.checkout = true;
  }

  const spec = CATALOG[event.name];
  const key = onceKey(event.name, event.props);
  if (key) {
    const scoped = spec.once?.scope === "booking" ? `${flow.opening}|${key}` : key;
    if (state.once.has(scoped)) return;
    state.once.add(scoped);
  }
  const count = state.perName.get(event.name) ?? 0;
  if (spec.cap !== undefined && count >= spec.cap) return;
  if (state.sent >= MAX_EVENTS_PER_VIEW) return;
  state.perName.set(event.name, count + 1);
  state.sent += 1;

  if (spec.thirdParty) sendToGoogle(event.name, event.props);

  const { session } = state;
  state.queue.push({
    v: ANALYTICS_SCHEMA_VERSION,
    event_id: newId(),
    view_id: state.viewId,
    name: event.name,
    experiment_id: session.experiment.experiment.id,
    source: analyticsSource(session.attribution.source),
    acquisition_channel: session.attribution.acquisition_channel,
    visitor_id: session.visitor_id,
    route: state.route,
    ...screen(),
    props: event.props,
  });
  if (state.queue.length > MAX_HELD) state.queue.splice(0, state.queue.length - MAX_HELD);

  if (URGENT.has(event.name) || state.queue.length >= FLUSH_AT) flush();
  else if (!state.timer) state.timer = setTimeout(flush, FLUSH_DELAY_MS);
}

/** Send everything queued, in batches. Offline: keep (bounded) until the browser is back. */
export function flush(): void {
  if (!state) return;
  clearTimeout(state.timer);
  state.timer = undefined;
  if (state.paused || !measurementAllowed()) {
    state.queue.length = 0;
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  while (state.queue.length) send(state.queue.splice(0, MAX_EVENTS_PER_BATCH));
}

function send(events: Envelope[]): void {
  try {
    void fetch(`${API_BASE}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      // Survives navigation to Stripe or the thank-you page.
      keepalive: true,
    })
      .then((res) => {
        // Rate limited or the store is down: stop for this page load rather than retry.
        if ((res.status === 429 || res.status === 503) && state) state.paused = true;
      })
      .catch(() => {});
  } catch {
    // Blocked by an extension, or no fetch: analytics must never break the page.
  }
}

// ---------------------------------------------------------------------------
// Google Analytics 4: opt-in only (see consent.ts), consent mode with every ads signal denied.

function sendToGoogle(name: EventName, props: EventProps): void {
  if (state?.google !== "loaded" || !googleAllowed() || !window.gtag) return;
  if (routeId(window.location.pathname) === "/thanks") return;
  window.gtag("event", name, { ...props, page_location: safePageLocation() });
}

function loadGoogle(): void {
  const id = import.meta.env.VITE_GA4_MEASUREMENT_ID;
  if (!state || !id || state.google === "loaded" || isSensitiveScreen()) return;
  const { session } = state;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  window.gtag("consent", "update", { analytics_storage: "granted" });
  window.gtag("set", { allow_google_signals: false, allow_ad_personalization_signals: false });
  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: false,
    page_location: safePageLocation(),
    page_referrer: sanitizeReferrer(document.referrer),
    experiment_id: session.experiment.experiment.id,
    offer_version: session.experiment.offer.id,
    price_version: session.experiment.price.id,
    acquisition_source: analyticsSource(session.attribution.source),
    acquisition_channel: session.attribution.acquisition_channel,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  state.google = "loaded";
  // Opted in after this page's page_view was recorded: give Google the view too.
  if (state.once.has(EVENTS.page_view))
    window.gtag("event", EVENTS.page_view, { page_location: safePageLocation() });
}

/** Opt-out after opting in: deny storage and remove Google's cookies from this site. */
function stopGoogle(): void {
  if (!state) return;
  state.google = "off";
  window.gtag?.("consent", "update", { analytics_storage: "denied" });
  try {
    const host = window.location.hostname.split(".");
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.split("=")[0]?.trim();
      if (!name || !/^_ga/.test(name)) continue;
      for (let i = 0; i < host.length - 1; i++) {
        const domain = host.slice(i).join(".");
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
      }
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  } catch {
    // Best effort.
  }
}

// ---------------------------------------------------------------------------
// Form errors: which fields failed and how, never what was typed.

interface IssueLike {
  path: readonly PropertyKey[];
  code?: string;
}

function valueAt(candidate: unknown, path: readonly PropertyKey[]): unknown {
  let node = candidate;
  for (const part of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<PropertyKey, unknown>)[part];
  }
  return node;
}

/**
 * Props for `form_error` from validation issues. `candidate` (the object that was validated)
 * is only inspected to tell an empty field from a malformed one; no value leaves this function.
 */
export function formErrorProps(
  form: "booking" | "pilot",
  issues: readonly IssueLike[],
  candidate?: unknown,
): Props {
  const fields = new Set<string>();
  const kinds = new Set<ErrorKind>();
  for (const issue of issues) {
    const field = formFieldId(issue.path.map(String).join("."));
    fields.add(field);
    const empty =
      candidate === undefined
        ? issue.code === "too_small" || issue.code === "invalid_type"
        : [undefined, null, ""].includes(valueAt(candidate, issue.path) as string);
    if (empty) kinds.add("missing");
    else if (issue.code === "custom" && field === "zip") kinds.add("out_of_area");
    else kinds.add("format");
  }
  return { form, fields: [...fields].join(","), kinds: [...kinds].join(","), count: issues.length };
}

export { EVENTS };
