/**
 * The feedback token arrives as `?ft=` in the Stripe success URL. It is a bearer secret, so it
 * must leave the address bar — and therefore `page_location`, history entries and any later
 * `Referer` — before any analytics code runs. The thank-you page calls `takeFeedbackToken` first,
 * keeps the result only in memory, and passes it to the feedback POST body.
 */

/** Tokens the API issues are base64url of 24 random bytes; anything else is treated as absent. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/** `url` with the `ft` parameter removed; the order id, session_id, other params and hash stay. */
export function withoutFeedbackToken(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("ft")) return url;
  parsed.searchParams.delete("ft");
  return parsed.toString();
}

/**
 * Read and validate `ft`, then immediately rewrite the visible URL without it via
 * `history.replaceState`, preserving history state and every other part of the URL. The returned
 * token must be held only in memory. An invalid token is dropped (treated as absent); the
 * parameter is stripped from the URL either way. Returns null when there is no token.
 */
export function takeFeedbackToken(
  location: Pick<Location, "href">,
  history: Pick<History, "replaceState" | "state">,
): string | null {
  const raw = new URL(location.href).searchParams.get("ft");
  if (raw === null) return null;
  try {
    history.replaceState(history.state, "", withoutFeedbackToken(location.href));
  } catch {
    // If the URL cannot be rewritten the token is still never handed to analytics (see
    // analytics `safePageLocation`); it only stays visible in the address bar.
  }
  return TOKEN_PATTERN.test(raw) ? raw : null;
}
