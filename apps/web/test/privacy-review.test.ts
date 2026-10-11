import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSession, installBrowser } from "./fake-browser.ts";
import { sanitizePageUrl, sanitizeReferrer } from "../src/lib/privacy-url.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const visitor = "00000000-0000-4000-8000-000000000001";
const key = "k".repeat(43);
async function setup(options = {}) {
  vi.resetModules();
  const browser = installBrowser({
    storage: { "wkc.visitor_id": visitor, "wkc.analytics_key": key },
    ...options,
  });
  const consent = await import("../src/lib/consent.ts");
  const analytics = await import("../src/lib/analytics.ts");
  const session = fakeSession();
  analytics.initAnalytics(session);
  return { browser, consent, analytics, session };
}
describe("privacy review browser regressions", () => {
  it.each(["alice-lovelace", "1-main-st-07090", "07090"])(
    "strips identifying campaign value %s from all analytics URL parameters",
    (value) => {
      for (const param of ["src", "ch", "exp", "utm_source", "utm_medium", "utm_campaign"])
        expect(sanitizePageUrl(`https://sharp.example.test/a?${param}=${value}`)).toBe(
          "https://sharp.example.test/a",
        );
      expect(sanitizeReferrer(`https://${value}.example.test/private`)).toBe("");
    },
  );
  it("preserves failed deletion credentials and actually retries the request", async () => {
    const { browser, consent } = await setup({ status: "reject" });
    expect(await consent.forgetThisDevice(visitor)).toBe(false);
    expect(consent.measurementAllowed()).toBe(false);
    expect(browser.storage.get("wkc.analytics_key")).toBe(key);
    expect(browser.storage.get("wkc.visitor_id")).toBe(visitor);
    browser.state.status = 204;
    expect(await consent.forgetThisDevice(visitor)).toBe(true);
    expect(browser.requests.filter((r) => r.url.endsWith("/forget"))).toHaveLength(2);
  });
  it("does not claim successful deletion when ownership proof is absent", async () => {
    const { browser, consent } = await setup();
    browser.storage.delete("wkc.analytics_key");
    expect(await consent.forgetThisDevice(visitor)).toBe(false);
    expect(consent.measurementAllowed()).toBe(false);
  });
  it("stops counting before a pending deletion request and drops previously queued sends", async () => {
    const { browser, consent, analytics } = await setup();
    analytics.track(analytics.EVENTS.page_view);
    let finish!: (response: Response) => void;
    const sends: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        sends.push(input);
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const pending = consent.forgetThisDevice(visitor);
    expect(consent.measurementAllowed()).toBe(false);
    analytics.track(analytics.EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    analytics.flush();
    await browser.drain();
    expect(sends).toEqual(["/api/events/forget"]);
    finish(new Response(null, { status: 204 }));
    await pending;
  });
  it("rotates browser identity and owner after successful deletion before re-enabling", async () => {
    const { browser, consent, analytics, session } = await setup();
    const oldOwner = await consent.deviceOwnerHash();
    expect(await consent.forgetThisDevice(visitor)).toBe(true);
    expect(session.visitor_id).not.toBe(visitor);
    consent.saveChoices({ measurement: "on" });
    analytics.track(analytics.EVENTS.page_view);
    analytics.flush();
    await browser.drain();
    const event = browser.events()[0]!;
    expect(event.visitor_id).toBe(session.visitor_id);
    expect(event.owner).not.toBe(oldOwner);
  });
  it("refreshes another tab's forgotten identity before resuming measurement", async () => {
    const { browser, consent, analytics } = await setup();
    consent.saveChoices({ measurement: "off" });
    browser.storage.set("wkc.visitor_id", "00000000-0000-4000-8000-000000000099");
    browser.storage.set("wkc.analytics_key", "x".repeat(43));
    consent.saveChoices({ measurement: "on" });
    analytics.track(analytics.EVENTS.page_view);
    analytics.flush();
    await browser.drain();
    expect(browser.events()[0]!.visitor_id).toBe("00000000-0000-4000-8000-000000000099");
  });
  it("Google never receives identifying tags, unknown referrers, visitor IDs, or events inside open forms", async () => {
    const { browser, consent, analytics, session } = await setup({
      ga: "G-SYNTHETIC",
      href: "https://sharp.example.test/a?src=1-main-st-07090&utm_campaign=alice-lovelace",
      referrer: "https://alice.example.test/private",
    });
    session.attribution.source = "alice-lovelace-07090";
    consent.saveChoices({ google: "granted" });
    analytics.track(analytics.EVENTS.page_view);
    browser.state.dialogOpen = true;
    analytics.track(analytics.EVENTS.booking_step, { step: "details" });
    const calls = JSON.stringify(browser.gtag());
    expect(calls).not.toMatch(/alice|main-st|07090|visitor_id|00000000-0000/);
    expect(calls).not.toContain('"step":"details"');
  });
  it("does not load GA4 without confirmation that automatic measurement is disabled", async () => {
    const { browser, consent } = await setup({ ga: "G-SYNTHETIC" });
    vi.stubEnv("VITE_GA4_MANUAL_EVENTS_ONLY", "false");
    consent.saveChoices({ google: "granted" });
    expect(consent.googleAllowed()).toBe(false);
    expect(browser.scripts).toHaveLength(0);
  });
});
