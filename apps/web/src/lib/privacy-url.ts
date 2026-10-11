import { routeId } from "@wkc/shared";

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

/** Short lowercase tags only; no "@", spaces, long digit runs (phone numbers) or long values. */
function safeTag(value: string | null): string | undefined {
  const tag = value?.trim().toLowerCase();
  if (!tag || !/^[a-z0-9][a-z0-9._-]{0,39}$/.test(tag) || /\d{7,}/.test(tag)) return undefined;
  return tag;
}

/**
 * The page URL as analytics may record it: origin, a known route (unknown paths become
 * "/other") and allowlisted campaign tags. Fragments are dropped. Returns "" if unparsable.
 */
export function sanitizePageUrl(href: string): string {
  try {
    const url = new URL(href);
    const out = new URL(url.origin + routeId(url.pathname).replace(/^other$/, "/other"));
    for (const key of ALLOWED_QUERY_PARAMS) {
      const tag = safeTag(url.searchParams.get(key));
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
    return referrer ? new URL(referrer).origin : "";
  } catch {
    return "";
  }
}
