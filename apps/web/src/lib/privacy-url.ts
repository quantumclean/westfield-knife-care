import { ANALYTICS_SOURCES, EXPERIMENTS, ACQUISITION_CHANNELS, routeId } from "@wkc/shared";

/**
 * Campaign tags are the only query parameters any analytics tool may see. Everything else is
 * dropped, including ones we know are sensitive (`order`, Stripe's `session_id`, the feedback
 * token `ft`) and any we have never heard of.
 */
export const ALLOWED_QUERY_PARAMS = [
  "src",
  "ch",
  "exp",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

/**
 * The page URL as analytics may record it: origin, a known route (unknown paths become
 * "/other") and allowlisted campaign tags. Fragments are dropped. Returns "" if unparsable.
 */
export function sanitizePageUrl(href: string): string {
  try {
    const url = new URL(href);
    const out = new URL(url.origin + routeId(url.pathname).replace(/^other$/, "/other"));
    for (const key of ALLOWED_QUERY_PARAMS) {
      const value = url.searchParams.get(key)?.trim().toLowerCase();
      const allowed: readonly string[] =
        key === "exp"
          ? EXPERIMENTS.map((e) => e.id)
          : key === "ch" || key === "utm_medium"
            ? ACQUISITION_CHANNELS
            : ANALYTICS_SOURCES;
      const tag = value && allowed.includes(value) ? value : undefined;
      if (tag) out.searchParams.set(key, tag);
    }
    return out.toString();
  } catch {
    return "";
  }
}

/** The referrer as analytics may record it: its origin only, or "" if none or unparsable. */
export function sanitizeReferrer(referrer: string): string {
  try {
    if (!referrer) return "";
    const url = new URL(referrer);
    return [
      "www.google.com",
      "google.com",
      "bing.com",
      "www.bing.com",
      "duckduckgo.com",
      "www.instagram.com",
      "www.facebook.com",
      "nextdoor.com",
    ].includes(url.hostname) && url.protocol === "https:"
      ? url.origin
      : "";
  } catch {
    return "";
  }
}
