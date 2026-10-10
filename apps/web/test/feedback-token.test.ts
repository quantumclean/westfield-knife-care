import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { takeFeedbackToken, withoutFeedbackToken } from "../src/lib/feedback-token.ts";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";
const SUCCESS = `https://sharp.example.com/thanks?order=id-1&ft=${TOKEN}&session_id=cs_test_1#top`;

function fakeHistory() {
  return { state: { keep: true }, replaceState: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("takeFeedbackToken", () => {
  it("returns the token and rewrites the URL without it, keeping order, session_id and hash", () => {
    const history = fakeHistory();
    expect(takeFeedbackToken({ href: SUCCESS }, history)).toBe(TOKEN);
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    const [state, , url] = history.replaceState.mock.calls[0]!;
    expect(state).toEqual({ keep: true });
    expect(url).toBe("https://sharp.example.com/thanks?order=id-1&session_id=cs_test_1#top");
    expect(url).not.toContain(TOKEN);
  });

  it("does nothing when there is no token", () => {
    const history = fakeHistory();
    expect(takeFeedbackToken({ href: "https://x.test/thanks?order=id-1" }, history)).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ["short"],
    ["has spaces in it but is long enough"],
    ["<script>alert(1)</script>"],
    [""],
  ])("drops an invalid token (%j) but still strips it from the URL", (bad) => {
    const history = fakeHistory();
    const href = `https://x.test/thanks?order=id-1&ft=${encodeURIComponent(bad)}`;
    expect(takeFeedbackToken({ href }, history)).toBeNull();
    expect(history.replaceState.mock.calls[0]![2]).toBe("https://x.test/thanks?order=id-1");
  });

  it("still returns a valid token if replaceState throws", () => {
    const history = {
      state: null,
      replaceState: vi.fn(() => {
        throw new Error("denied");
      }),
    };
    expect(takeFeedbackToken({ href: SUCCESS }, history)).toBe(TOKEN);
  });
});

describe("withoutFeedbackToken", () => {
  it("removes only ft", () => {
    expect(withoutFeedbackToken("https://x.test/thanks?a=1&ft=zzz&b=2")).toBe(
      "https://x.test/thanks?a=1&b=2",
    );
  });
});

describe("analytics never sees the feedback token", () => {
  async function run(href: string) {
    vi.resetModules();
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST123");
    const url = new URL(href);
    const win = {
      location: { href, pathname: url.pathname, origin: url.origin },
      gtag: undefined as unknown,
      dataLayer: undefined as unknown,
    };
    const fetchBodies: string[] = [];
    vi.stubGlobal("window", win);
    vi.stubGlobal("document", { createElement: () => ({}), head: { appendChild: () => {} } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        fetchBodies.push(String(init.body));
        return new Response(null, { status: 204 });
      }),
    );
    const { initAnalytics, track, EVENTS } = await import("../src/lib/analytics.ts");
    const session = {
      visitor_id: "visitor-00000001",
      experiment: { experiment: { id: "experiment-001" }, offer: { id: "o" }, price: { id: "p" } },
      attribution: { source: "direct", acquisition_channel: "direct" },
    } as unknown as Parameters<typeof initAnalytics>[0];
    initAnalytics(session);
    track(EVENTS.page_view);
    track(EVENTS.checkout_completed, { order_id: "id-1" });
    const gtag = JSON.stringify(
      ((win.dataLayer as ArrayLike<unknown>[]) ?? []).map((e) => Array.from(e)),
    );
    return { gtag, fetchBodies };
  }

  it("sends no token after the page has sanitised its URL", async () => {
    const { gtag, fetchBodies } = await run(withoutFeedbackToken(SUCCESS));
    expect(gtag).toContain("page_location");
    expect(gtag).not.toContain(TOKEN);
    expect(fetchBodies).toHaveLength(2);
    for (const body of fetchBodies) expect(body).not.toContain(TOKEN);
  });

  it("still sends no token even if the URL somehow still carries it", async () => {
    const { gtag, fetchBodies } = await run(SUCCESS);
    expect(gtag).toContain("page_location");
    expect(gtag).toContain("order=id-1");
    expect(gtag).not.toContain(TOKEN);
    for (const body of fetchBodies) expect(body).not.toContain(TOKEN);
  });
});

describe("thank-you page bootstrap", () => {
  const dir = import.meta.dirname;
  const source = readFileSync(resolve(dir, "../src/thanks.tsx"), "utf8");

  it("strips the token before the session loads, analytics initialises or any event is tracked", () => {
    const strip = source.indexOf("takeFeedbackToken(window.location");
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(source.indexOf("loadSession()"));
    expect(strip).toBeLessThan(source.indexOf("initAnalytics(session)"));
    expect(strip).toBeLessThan(source.indexOf("track(EVENTS.page_view)"));
  });

  it("does not read ft from the query string anywhere else", () => {
    expect(source).not.toMatch(/get\(["']ft["']\)/);
  });

  it("sets a same-origin referrer policy on the thank-you document", () => {
    const html = readFileSync(resolve(dir, "../thanks.html"), "utf8");
    expect(html).toMatch(/<meta name="referrer" content="same-origin"/);
  });
});
