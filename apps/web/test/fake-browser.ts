import { vi } from "vitest";
import type { Session } from "../src/lib/session.ts";

/**
 * A small stand-in for the browser globals analytics touches, so tests can drive it without a
 * DOM library. Every network call is captured by a fake fetch; nothing leaves the process.
 */
export interface BrowserOptions {
  href?: string;
  width?: number;
  coarse?: boolean;
  gpc?: boolean;
  dnt?: string;
  online?: boolean;
  /** HTTP status for /api calls, or "reject" to simulate a blocked or offline request. */
  status?: number | "reject";
  /** Set to simulate a configured GA4 measurement id. */
  ga?: string;
  storage?: Record<string, string>;
  dialogOpen?: boolean;
  referrer?: string;
}

type Listener = (event: Event) => void;

function target() {
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: (type: string, fn: Listener) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type: string, fn: Listener) => listeners.get(type)?.delete(fn),
    dispatchEvent: (event: Event) => {
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
  };
}

export function installBrowser(options: BrowserOptions = {}) {
  const url = new URL(options.href ?? "https://sharp.example.com/a");
  const storage = new Map(Object.entries(options.storage ?? {}));
  const requests: { url: string; body: string }[] = [];
  const scripts: string[] = [];
  const state = { dialogOpen: options.dialogOpen ?? false, status: options.status ?? 204 };

  const win = {
    ...target(),
    location: {
      href: url.href,
      pathname: url.pathname,
      origin: url.origin,
      search: url.search,
      hostname: url.hostname,
    },
    innerWidth: options.width ?? 390,
    innerHeight: 800,
    scrollY: 0,
    dataLayer: undefined as unknown[] | undefined,
    gtag: undefined as ((...args: unknown[]) => void) | undefined,
  };
  const doc = {
    ...target(),
    visibilityState: "visible",
    referrer: options.referrer ?? "",
    cookie: "",
    documentElement: { scrollHeight: 4000 },
    querySelector: (selector: string) =>
      selector === "dialog[open]" && state.dialogOpen ? {} : null,
    querySelectorAll: () => [],
    createElement: () => ({}) as { src?: string },
    head: { appendChild: (el: { src?: string }) => scripts.push(el.src ?? "") },
  };
  const nav = {
    onLine: options.online ?? true,
    globalPrivacyControl: options.gpc,
    doNotTrack: options.dnt ?? null,
  };

  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("navigator", nav);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("coarse") ? (options.coarse ?? true) : false,
  }));
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, String(v)),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      requests.push({ url: String(input), body: String(init.body ?? "") });
      if (state.status === "reject") throw new TypeError("Failed to fetch");
      return new Response(null, { status: state.status });
    }),
  );
  vi.stubEnv("VITE_GA4_MEASUREMENT_ID", options.ga ?? "");
  vi.stubEnv("VITE_GA4_MANUAL_EVENTS_ONLY", "true");

  return {
    win,
    doc,
    nav,
    storage,
    requests,
    scripts,
    state,
    /** Every event sent to /api/events so far, flattened out of their batches. */
    events(): { name: string; props: Record<string, unknown>; [key: string]: unknown }[] {
      return requests
        .filter((r) => r.url.endsWith("/events"))
        .flatMap((r) => (JSON.parse(r.body) as { events: never[] }).events);
    },
    /** Everything handed to Google's tag, as plain arrays. */
    gtag(): unknown[][] {
      return (win.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
    },
    /** Let queued sends run (the owner hash is computed asynchronously). */
    async drain() {
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 5));
    },
    fire(on: "window" | "document", type: string) {
      (on === "window" ? win : doc).dispatchEvent(new Event(type));
    },
  };
}

export function fakeSession(
  arm: "a" | "b" = "a",
  visitor = "00000000-0000-4000-8000-000000000001",
): Session {
  const two = arm === "b";
  return {
    visitor_id: visitor,
    experiment: {
      experiment: { id: two ? "experiment-002" : "experiment-001" },
      offer: { id: two ? "offer-002" : "offer-001" },
      price: { id: two ? "price-002" : "price-001" },
    },
    attribution: { source: two ? "flyer-b" : "flyer-a", acquisition_channel: "print" },
  } as unknown as Session;
}

/** Let pending promise callbacks (fetch responses) run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
