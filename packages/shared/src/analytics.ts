import { normaliseSource } from "./attribution.ts";
import { FAQ } from "./content.ts";
import { FLYER_ROUTES } from "./flyer-routes.ts";
import { CADENCES, SERVICE_INTERESTS } from "./types.ts";

/**
 * Analytics event catalog (schema v2). Names are shared by the browser (first-party
 * `/api/events`, and GA4 only with consent) and the API's reports. Every property of every
 * event is allowlisted here: enums, bounded integers and lists of known ids only, so no event
 * can carry typed text, names, contact details, addresses, order ids or URLs.
 *
 * The browser runs `normalizeEvent` before sending; the API runs `validateEventProps`, which
 * rejects anything the normaliser would have changed. See docs/analytics-events.md.
 */
export const ANALYTICS_SCHEMA_VERSION = 2;

export const VISITOR_ID_PATTERN =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|v-[a-z0-9]{8}-[a-z0-9]{8})$/i;

/** Raw first-party events are deleted this many days after they are recorded. */
export const EVENT_RETENTION_DAYS = 90;

/** Report breakdown cells with fewer unique visitors than this are suppressed. */
export const MIN_REPORT_COUNT = 5;

export const EVENTS = {
  page_view: "page_view",
  cta_click: "cta_click",
  booking_opened: "booking_opened",
  booking_step: "booking_step",
  booking_closed: "booking_closed",
  booking_submitted: "booking_submitted",
  checkout_started: "checkout_started",
  checkout_returned: "checkout_returned",
  checkout_completed: "checkout_completed",
  pilot_opened: "pilot_opened",
  pilot_submitted: "pilot_submitted",
  faq_opened: "faq_opened",
  form_error: "form_error",
  section_view: "section_view",
  scroll_depth: "scroll_depth",
  page_engagement: "page_engagement",
  video_view: "video_view",
  video_progress: "video_progress",
  video_unmute: "video_unmute",
  address_suggest: "address_suggest",
  client_error: "client_error",
  web_vitals: "web_vitals",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export const EVENT_NAMES: readonly EventName[] = Object.values(EVENTS);

/** Ordered funnel used for the per-experiment summary. Unchanged since schema v1. */
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

// ---------------------------------------------------------------------------
// Context: where, and on what kind of screen, in coarse buckets only.

/** Pages we report on. Any other path is recorded as "other", never verbatim. */
export const ROUTES = ["/", "/thanks", ...FLYER_ROUTES.map((r) => r.path), "other"] as const;
export type RouteId = (typeof ROUTES)[number];

export function routeId(pathname: string): RouteId {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/index.html") return "/";
  if (path === "/thanks" || path === "/thanks.html") return "/thanks";
  const flyer = FLYER_ROUTES.find((r) => r.path === path);
  return flyer ? flyer.path : "other";
}

/** "unknown" only appears on events recorded by pre-v2 browsers. */
export const DEVICE_CLASSES = ["mobile", "tablet", "desktop", "unknown"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const VIEWPORT_BANDS = ["xs", "sm", "md", "lg", "unknown"] as const;
export type ViewportBand = (typeof VIEWPORT_BANDS)[number];

/** Phones are narrow; tablets are touch-first and mid-width; everything else is desktop. */
export function deviceClass(width: number, coarsePointer: boolean): DeviceClass {
  if (!Number.isFinite(width) || width <= 0) return "unknown";
  if (width < 640) return "mobile";
  if (coarsePointer && width < 1366) return "tablet";
  return "desktop";
}

/** CSS-pixel width bands: xs < 400 ≤ sm < 640 ≤ md < 1024 ≤ lg. */
export function viewportBand(width: number): ViewportBand {
  if (!Number.isFinite(width) || width <= 0) return "unknown";
  if (width < 400) return "xs";
  if (width < 640) return "sm";
  if (width < 1024) return "md";
  return "lg";
}

/**
 * Only reviewed source ids may enter analytics. Every unregistered value becomes "other",
 * including plausible names, street labels and short ZIP codes.
 */
/** Registered non-personal placement ids. Add new campaigns here before using them. */
export const ANALYTICS_SOURCES = [
  "direct",
  "other",
  "flyer-a",
  "flyer-b",
  "flyer-v1-qr",
  "flyer-qr",
  "instagram",
  "facebook",
  "nextdoor",
  "google",
  "bing",
  "duckduckgo",
  "google.com",
  "www.google.com",
  "bing.com",
  "duckduckgo.com",
  "nextdoor-post-1",
  "friend",
  "ig-story-3",
  "poster-coop",
] as const;

export function analyticsSource(source: string | null | undefined): string {
  if (!source) return "direct";
  const cleaned = normaliseSource(source);
  return cleaned && (ANALYTICS_SOURCES as readonly string[]).includes(cleaned) ? cleaned : "other";
}

// ---------------------------------------------------------------------------
// Property vocabularies.

export const LOCATIONS = [
  "hero",
  "nav",
  "pricing",
  "sticky",
  "footer",
  "deep-link",
  "checkout-cancelled",
  "out-of-area",
  "booking-closed",
  "thanks",
  "ways",
  "ways-mail-in",
  "ways-gift",
  "other",
] as const;

export const SECTIONS = [
  "hero",
  "ways",
  "how_it_works",
  "process_film",
  "pricing",
  "prepare",
  "faq",
] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Form fields, by identifier only. Values are never part of any event. */
export const FORM_FIELDS = [
  "name",
  "email",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "zip",
  "notes",
  "knives",
  "care_day",
  "service_interest",
  "cadence",
  "other",
] as const;
export type FormField = (typeof FORM_FIELDS)[number];

export const ERROR_KINDS = ["missing", "format", "out_of_area", "other"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const TIME_BANDS = ["<10s", "10-30s", "30-60s", "1-3m", "3m+"] as const;
export const SCROLL_MILESTONES = [25, 50, 75, 90] as const;
export const VIDEO_MILESTONES = [25, 50, 75, 100] as const;
export const VITAL_RATINGS = ["good", "needs_improvement", "poor"] as const;
export const CLIENT_ERROR_AREAS = [
  "page",
  "booking",
  "pilot",
  "thanks",
  "config",
  "order_status",
  "feedback",
  "other",
] as const;
export type ClientErrorArea = (typeof CLIENT_ERROR_AREAS)[number];

const BOOKING_STEP_IDS = ["choose", "details"] as const;

// ---------------------------------------------------------------------------
// The catalog.

export type PropValue = string | number | boolean;
export type EventProps = Record<string, PropValue>;

export type PropSpec =
  | { kind: "enum"; values: readonly (string | number)[]; required?: boolean }
  | { kind: "int"; min: number; max: number; required?: boolean }
  /** Comma-separated, de-duplicated, sorted subset of `values`. */
  | { kind: "list"; values: readonly string[]; required?: boolean };

export interface EventSpec {
  props: Record<string, PropSpec>;
  /**
   * Duplicate suppression in the browser (and in reports): "view" keeps the first per page
   * load, "booking" the first per opening of the booking sheet. `key` names the prop that
   * makes an occurrence distinct (e.g. each scroll milestone counts once).
   */
  once?: { scope: "view" | "booking"; key?: string };
  /** At most this many per page load. */
  cap?: number;
  /** May be forwarded to GA4 when the visitor has opted in. */
  thirdParty: boolean;
}

const oneOf = (values: readonly (string | number)[], required = false): PropSpec => ({
  kind: "enum",
  values,
  required,
});
const int = (min: number, max: number): PropSpec => ({ kind: "int", min, max });
const location = oneOf(LOCATIONS, true);
const videoFormat = oneOf(["standard", "landscape", "square"]);
const rating = oneOf(VITAL_RATINGS);
const money = int(0, 1_000_000);

export const CATALOG: Record<EventName, EventSpec> = {
  page_view: { props: {}, once: { scope: "view" }, thirdParty: true },
  cta_click: { props: { cta: oneOf(["sharpen", "pilot"], true), location }, thirdParty: true },
  booking_opened: { props: { location }, thirdParty: true },
  booking_step: {
    props: { step: oneOf(BOOKING_STEP_IDS, true) },
    once: { scope: "booking", key: "step" },
    thirdParty: true,
  },
  booking_closed: {
    props: { step: oneOf(BOOKING_STEP_IDS, true) },
    once: { scope: "booking" },
    thirdParty: false,
  },
  booking_submitted: { props: { knives: int(1, 50), total_cents: money }, thirdParty: true },
  checkout_started: { props: { total_cents: money }, thirdParty: true },
  checkout_returned: {
    props: { outcome: oneOf(["cancelled"], true) },
    once: { scope: "view" },
    thirdParty: false,
  },
  checkout_completed: { props: { total_cents: money }, once: { scope: "view" }, thirdParty: false },
  pilot_opened: { props: { location }, thirdParty: true },
  pilot_submitted: {
    props: { cadence: oneOf(CADENCES), interest: oneOf(SERVICE_INTERESTS) },
    thirdParty: true,
  },
  faq_opened: {
    props: {
      question: oneOf(
        FAQ.map((f) => f.id),
        true,
      ),
    },
    once: { scope: "view", key: "question" },
    thirdParty: true,
  },
  form_error: {
    props: {
      form: oneOf(["booking", "pilot"], true),
      fields: { kind: "list", values: FORM_FIELDS },
      kinds: { kind: "list", values: ERROR_KINDS },
      count: int(0, 20),
    },
    cap: 20,
    thirdParty: false,
  },
  section_view: {
    props: { section: oneOf(SECTIONS, true) },
    once: { scope: "view", key: "section" },
    thirdParty: true,
  },
  scroll_depth: {
    props: { percent: oneOf(SCROLL_MILESTONES, true) },
    once: { scope: "view", key: "percent" },
    thirdParty: true,
  },
  page_engagement: {
    props: { time: oneOf(TIME_BANDS, true), max_scroll: oneOf([0, ...SCROLL_MILESTONES]) },
    once: { scope: "view" },
    thirdParty: false,
  },
  video_view: {
    props: { trigger: oneOf(["autoplay", "click", "play"]), format: videoFormat },
    once: { scope: "view" },
    thirdParty: true,
  },
  video_progress: {
    props: { percent: oneOf(VIDEO_MILESTONES, true) },
    once: { scope: "view", key: "percent" },
    thirdParty: true,
  },
  video_unmute: {
    props: { format: videoFormat, at_seconds: int(0, 600) },
    once: { scope: "view" },
    thirdParty: false,
  },
  address_suggest: {
    props: {
      action: oneOf(["shown", "chosen", "fallback", "unavailable", "out_of_area"], true),
      results: oneOf(["0", "1-3", "4+"]),
    },
    once: { scope: "booking", key: "action" },
    thirdParty: false,
  },
  client_error: {
    props: {
      kind: oneOf(["error", "rejection", "api", "chunk"], true),
      area: oneOf(CLIENT_ERROR_AREAS),
      status: oneOf(["network", "4xx", "5xx"]),
    },
    cap: 3,
    thirdParty: false,
  },
  web_vitals: {
    props: {
      lcp: rating,
      inp: rating,
      cls: rating,
      ttfb: rating,
      nav: oneOf(["navigate", "reload", "back_forward", "prerender", "other"]),
    },
    once: { scope: "view" },
    thirdParty: false,
  },
};

/** Most events a single page load may send; the browser stops queueing after this. */
export const MAX_EVENTS_PER_VIEW = 80;

/** Most events in one `POST /api/events` batch. */
export const MAX_EVENTS_PER_BATCH = 20;

/**
 * Page views the API accepts per (salted) IP address per UTC day. Generous for a household,
 * office or mobile-carrier address on a local service's site; small next to what a script
 * could otherwise add to one arm's visitor count.
 */
export const DAILY_VIEWS_PER_IP = 200;

/**
 * Last moment (exclusive, ISO) the API accepts schema v1 bodies from browser tabs opened before
 * the v2 deploy. v1 bodies carry no deletion proof, so their rows can never be self-deleted;
 * the window only needs to cover tabs left open across the deploy. Set it about two weeks
 * after the production deploy (docs/analytics-events.md, "Versioning and migration from v1").
 */
export const LEGACY_V1_ACCEPTED_UNTIL = "2026-11-30T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Normalising (browser) and validating (server).

/** Validation paths from the booking and waitlist schemas, mapped onto field identifiers. */
const FIELD_PATHS: Record<string, FormField> = {
  "customer.name": "name",
  "customer.email": "email",
  "customer.phone": "phone",
  "customer.address.line1": "line1",
  "customer.address.line2": "line2",
  "customer.address.city": "city",
  "customer.address.state": "state",
  "customer.address.zip": "zip",
  number_of_knives: "knives",
};

/** A validation path or field name as an allowlisted identifier ("other" if unknown). */
export function formFieldId(path: string): FormField {
  const trimmed = path.trim();
  const mapped = FIELD_PATHS[trimmed];
  if (mapped) return mapped;
  return (FORM_FIELDS as readonly string[]).includes(trimmed) ? (trimmed as FormField) : "other";
}

const listItems = (value: unknown): string[] =>
  typeof value === "string" ? value.split(",").map((s) => s.trim()) : [];

function canonicalList(items: Iterable<string>, allowed: readonly string[]): string {
  const set = new Set([...items].filter((v) => allowed.includes(v)));
  return [...set].sort().join(",");
}

/**
 * Bring an event into its catalog shape: unknown props are dropped, known legacy shapes are
 * mapped (form_error `fields` may be validation paths; an unknown `location` becomes "other"),
 * and a value that does not fit is dropped. Returns null for an unknown event, or one whose
 * required props cannot be satisfied.
 */
export function normalizeEvent(
  name: string,
  props: Record<string, unknown> = {},
): { name: EventName; props: EventProps } | null {
  if (!isEventName(name)) return null;
  const spec = CATALOG[name];
  const out: EventProps = {};
  for (const [key, rule] of Object.entries(spec.props)) {
    const raw = props[key];
    if (raw === undefined || raw === null) continue;
    if (rule.kind === "enum") {
      if (rule.values.includes(raw as string | number)) out[key] = raw as string | number;
      else if (rule.values === LOCATIONS) out[key] = "other";
    } else if (rule.kind === "int") {
      if (typeof raw === "number" && Number.isInteger(raw) && raw >= rule.min && raw <= rule.max)
        out[key] = raw;
    } else {
      const items = listItems(raw);
      const list = canonicalList(
        rule.values === FORM_FIELDS ? items.map(formFieldId) : items,
        rule.values,
      );
      if (list) out[key] = list;
    }
  }
  for (const [key, rule] of Object.entries(spec.props)) {
    if (rule.required && out[key] === undefined) return null;
  }
  return { name, props: out };
}

/**
 * Strict server-side check. Returns problems (empty when valid). Never echoes the offending
 * value, so a rejected event cannot reflect personal data back to the caller or into a log.
 */
export function validateEventProps(name: string, props: Record<string, unknown>): string[] {
  if (!isEventName(name)) return ["unknown event"];
  const spec = CATALOG[name];
  const problems: string[] = [];
  for (const key of Object.keys(props)) {
    if (!Object.hasOwn(spec.props, key)) problems.push(`${name}: a property is not allowed`);
  }
  for (const [key, rule] of Object.entries(spec.props)) {
    const value = props[key];
    if (value === undefined) {
      if (rule.required) problems.push(`${name}: "${key}" is required`);
      continue;
    }
    const ok =
      rule.kind === "enum"
        ? rule.values.includes(value as string | number)
        : rule.kind === "int"
          ? typeof value === "number" &&
            Number.isInteger(value) &&
            value >= rule.min &&
            value <= rule.max
          : typeof value === "string" &&
            value.length > 0 &&
            canonicalList(listItems(value), rule.values) === value;
    if (!ok) problems.push(`${name}: "${key}" has a value that is not allowed`);
  }
  return problems;
}

/** The dedup identity of an event under its catalog `once` rule, or undefined if none. */
export function onceKey(name: EventName, props: EventProps): string | undefined {
  const once = CATALOG[name].once;
  if (!once) return undefined;
  return once.key ? `${name}:${String(props[once.key] ?? "")}` : name;
}

// ---------------------------------------------------------------------------
// Proof of possession for self-service deletion.

/** A browser's deletion key: 32 random bytes, base64url (43 characters). Never sent with events. */
export const DELETION_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** What events carry instead: the SHA-256 of the key, hex. */
export const OWNER_HASH_PATTERN = /^[0-9a-f]{64}$/;

/** SHA-256 of a deletion key, as stored on each event (`owner`). */
export async function ownerHashOf(key: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
