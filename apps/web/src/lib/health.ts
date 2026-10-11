import { EVENTS, VITAL_RATINGS, type ClientErrorArea, type EventName } from "@wkc/shared";

/**
 * Coarse page health: uncaught errors (kind and area only, never the message or stack) and
 * Core Web Vitals as good / needs improvement / poor. Native PerformanceObserver, no library.
 */

type Rating = (typeof VITAL_RATINGS)[number];
type Metric = "lcp" | "inp" | "cls" | "ttfb";

/** web.dev thresholds: at or under the first is good, over the second is poor. */
const LIMITS: Record<Metric, [number, number]> = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  ttfb: [800, 1800],
};

export function ratingFor(metric: Metric, value: number): Rating {
  const [good, poor] = LIMITS[metric];
  return value <= good ? "good" : value <= poor ? "needs_improvement" : "poor";
}

/** Dynamic import failures (an old tab after a deploy, a flaky connection). */
export function isChunkFailure(reason: unknown): boolean {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(
    message,
  );
}

export interface HealthDeps {
  track: (name: EventName, props: Record<string, string | number>) => void;
  flush: () => void;
  area: () => ClientErrorArea;
}

function observe(type: string, callback: (entries: PerformanceEntry[]) => void, extra = {}) {
  try {
    new PerformanceObserver((list) => callback(list.getEntries())).observe({
      type,
      buffered: true,
      ...extra,
    } as PerformanceObserverInit);
  } catch {
    // Unsupported entry type in this browser: that metric is simply not reported.
  }
}

export function startHealthReporting(deps: HealthDeps): void {
  try {
    watch(deps);
  } catch {
    // Health reporting is optional; the page works without it.
  }
}

function watch(deps: HealthDeps): void {
  if (typeof window === "undefined") return;
  const values: Partial<Record<Metric, number>> = {};
  let nav: string | undefined;

  if (typeof PerformanceObserver === "function") {
    observe("largest-contentful-paint", (entries) => {
      const last = entries.at(-1);
      if (last) values.lcp = last.startTime;
    });
    observe("layout-shift", (entries) => {
      for (const entry of entries as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!entry.hadRecentInput) values.cls = (values.cls ?? 0) + entry.value;
    });
    observe(
      "event",
      (entries) => {
        for (const entry of entries as (PerformanceEntry & { interactionId?: number })[])
          if (entry.interactionId) values.inp = Math.max(values.inp ?? 0, entry.duration);
      },
      { durationThreshold: 40 },
    );
  }
  try {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entry) {
      values.ttfb = entry.responseStart;
      nav = ["navigate", "reload", "back_forward", "prerender"].includes(entry.type)
        ? entry.type
        : "other";
    }
  } catch {
    // No navigation timing.
  }

  let reported = false;
  const report = () => {
    if (reported) return;
    reported = true;
    const props: Record<string, string> = {};
    for (const metric of Object.keys(LIMITS) as Metric[]) {
      const value = values[metric];
      if (value !== undefined && Number.isFinite(value)) props[metric] = ratingFor(metric, value);
    }
    if (nav) props.nav = nav;
    if (Object.keys(props).length) deps.track(EVENTS.web_vitals, props);
    deps.flush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") report();
  });
  window.addEventListener("pagehide", report);

  window.addEventListener("error", (event) => {
    // Errors from other origins (extensions, third-party scripts) are not ours to count.
    if (event.filename && !event.filename.startsWith(window.location.origin)) return;
    deps.track(EVENTS.client_error, { kind: "error", area: deps.area() });
  });
  window.addEventListener("unhandledrejection", (event) => {
    deps.track(EVENTS.client_error, {
      kind: isChunkFailure(event.reason) ? "chunk" : "rejection",
      area: deps.area(),
    });
  });
}
