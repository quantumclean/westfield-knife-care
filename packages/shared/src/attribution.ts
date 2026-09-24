import { ACQUISITION_CHANNELS, type AcquisitionChannel, type Attribution } from "./types.ts";

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function isAcquisitionChannel(value: unknown): value is AcquisitionChannel {
  return typeof value === "string" && (ACQUISITION_CHANNELS as readonly string[]).includes(value);
}

/** Normalise a free-form source tag; returns undefined when unusable. */
export function normaliseSource(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, "-");
  return SOURCE_PATTERN.test(cleaned) ? cleaned : undefined;
}

/** Map a utm_medium (or similar hint) onto one of our channels. */
export function channelFromHint(hint: string | null | undefined): AcquisitionChannel | undefined {
  if (!hint) return undefined;
  const value = hint.trim().toLowerCase();
  if (isAcquisitionChannel(value)) return value;
  // Order matters: "nextdoor" must not match the print rule for "door".
  if (/(social|instagram|facebook|nextdoor|tiktok|(^|[-_.])(ig|fb)([-_.]|$))/.test(value))
    return "social";
  if (/(referral|friend|word)/.test(value)) return "referral";
  if (/(search|google|bing|duckduckgo|cpc|ppc|seo)/.test(value)) return "search";
  // Physical material is print wherever it hangs, so print is checked before partner.
  if (/(print|flyer|poster|qr|mailer|(^|[-_])door)/.test(value)) return "print";
  if (/(partner|shop|gym|coop|co-op|restaurant)/.test(value)) return "partner";
  if (/(direct|none)/.test(value)) return "direct";
  return undefined;
}

/** Guess a channel from the source tag alone, e.g. "flyer-v1-qr" -> print. */
export function channelFromSource(source: string | undefined): AcquisitionChannel | undefined {
  return channelFromHint(source);
}

export interface AttributionParams {
  /** `?src=` short tag printed on flyers and used in posts. */
  src?: string | null;
  /** `?ch=` explicit channel. */
  ch?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  referrer?: string | null;
}

/**
 * Derive attribution from URL parameters and the referrer. Works the same in
 * the browser and on the server so both agree on what a visit "is".
 */
export function deriveAttribution(params: AttributionParams): Attribution {
  const source =
    normaliseSource(params.src) ??
    normaliseSource(params.utm_source) ??
    normaliseSource(referrerHost(params.referrer)) ??
    "direct";

  const acquisition_channel =
    channelFromHint(params.ch) ??
    channelFromHint(params.utm_medium) ??
    channelFromSource(source) ??
    (params.referrer ? "other" : "direct");

  return { source, acquisition_channel };
}

function referrerHost(referrer: string | null | undefined): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}
