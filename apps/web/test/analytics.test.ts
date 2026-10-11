import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeSession, installBrowser, settle, type BrowserOptions } from "./fake-browser.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const OPTED_IN = { "wkc.privacy": JSON.stringify({ v: 1, measurement: "on", google: "granted" }) };
const PERSONAL = ["Ada Lovelace", "ada@example.com", "908-555-0123", "1 Main St", "07090"];

async function start(options: BrowserOptions = {}, arm: "a" | "b" = "a") {
  vi.resetModules();
  const browser = installBrowser(options);
  const analytics = await import("../src/lib/analytics.ts");
  const api = await import("../src/lib/api.ts");
  const consent = await import("../src/lib/consent.ts");
  analytics.initAnalytics(fakeSession(arm));
  return { browser, ...analytics, api, consent };
}

describe("first-party events", () => {
  it("sends batched v2 events with coarse context and nothing personal", async () => {
    const { browser, track, flush, EVENTS } = await start({
      href: "https://sharp.example.com/a?src=flyer-a&email=ada@example.com",
    });
    track(EVENTS.page_view);
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    track(EVENTS.form_error, { form: "booking", fields: "customer.email,customer.address.zip" });
    track(EVENTS.checkout_started, { order_id: "order-123", total_cents: 3900 });
    flush();
    await browser.drain();
    expect(browser.requests).toHaveLength(1); // one batch
    const events = browser.events();
    expect(events.map((e) => e.name)).toEqual([
      "page_view",
      "cta_click",
      "form_error",
      "checkout_started",
    ]);
    expect(events[0]).toMatchObject({
      v: 2,
      experiment_id: "experiment-001",
      source: "flyer-a",
      route: "/a",
      device: "mobile",
      viewport: "xs",
      visitor_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(events[2]!.props).toEqual({ form: "booking", fields: "email,zip" });
    expect(events[3]!.props).toEqual({ total_cents: 3900 });
    const body = browser.requests[0]!.body;
    for (const value of ["order-123", "ada@example.com", "email=", "page_location", "https://"])
      expect(body).not.toContain(value);
    expect(new Set(events.map((e) => e.view_id)).size).toBe(1);
    expect(new Set(events.map((e) => e.event_id)).size).toBe(4);
  });

  it("tags each flyer arm with its own experiment", async () => {
    const b = await start({ href: "https://sharp.example.com/b" }, "b");
    b.track(b.EVENTS.page_view);
    b.flush();
    await b.browser.drain();
    expect(b.browser.events()[0]).toMatchObject({
      experiment_id: "experiment-002",
      route: "/b",
      source: "flyer-b",
    });
  });

  it("classifies mobile and desktop screens", async () => {
    const desktop = await start({ width: 1280, coarse: false });
    desktop.track(desktop.EVENTS.page_view);
    desktop.flush();
    await desktop.browser.drain();
    expect(desktop.browser.events()[0]).toMatchObject({ device: "desktop", viewport: "lg" });
    const tablet = await start({ width: 820, coarse: true });
    tablet.track(tablet.EVENTS.page_view);
    tablet.flush();
    await tablet.browser.drain();
    expect(tablet.browser.events()[0]).toMatchObject({ device: "tablet", viewport: "md" });
  });

  it("sends funnel-critical events immediately (before a redirect to Stripe)", async () => {
    const { browser, track, EVENTS } = await start();
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    expect(browser.requests).toHaveLength(0);
    track(EVENTS.checkout_started, { total_cents: 3900 });
    await browser.drain();
    expect(browser.events().map((e) => e.name)).toEqual(["cta_click", "checkout_started"]);
  });

  it("drops repeats of once-per-view events and enforces caps and the page budget", async () => {
    const { browser, track, flush, EVENTS } = await start();
    track(EVENTS.page_view);
    track(EVENTS.page_view);
    track(EVENTS.scroll_depth, { percent: 50 });
    track(EVENTS.scroll_depth, { percent: 50 });
    track(EVENTS.scroll_depth, { percent: 75 });
    for (let i = 0; i < 6; i++) track(EVENTS.client_error, { kind: "error", area: "page" });
    for (let i = 0; i < 200; i++) track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    flush();
    await browser.drain();
    const names = browser.events().map((e) => e.name);
    expect(names.filter((n) => n === "page_view")).toHaveLength(1);
    expect(names.filter((n) => n === "scroll_depth")).toHaveLength(2);
    expect(names.filter((n) => n === "client_error")).toHaveLength(3);
    expect(names.length).toBeLessThanOrEqual(80);
    for (const request of browser.requests)
      expect((JSON.parse(request.body) as { events: unknown[] }).events.length).toBeLessThanOrEqual(
        20,
      );
  });

  it("counts a booking step once per opening of the sheet", async () => {
    const { browser, track, flush, EVENTS } = await start();
    for (let opening = 0; opening < 2; opening++) {
      track(EVENTS.booking_opened, { location: "hero" });
      track(EVENTS.booking_step, { step: "details" });
      track(EVENTS.booking_step, { step: "details" });
    }
    flush();
    await browser.drain();
    expect(browser.events().filter((e) => e.name === "booking_step")).toHaveLength(2);
  });

  it("drops unknown events and personal values at the source", async () => {
    const { browser, track, flush, EVENTS } = await start();
    for (const value of PERSONAL) {
      track("typed_value" as never, { value });
      track(EVENTS.faq_opened, { question: value });
      track(EVENTS.cta_click, { cta: "sharpen", location: value });
    }
    flush();
    await browser.drain();
    const body = browser.requests.map((r) => r.body).join("\n");
    for (const value of PERSONAL) expect(body).not.toContain(value);
    expect(
      browser.events().every((e) => e.name === "cta_click" && e.props.location === "other"),
    ).toBe(true);
  });
});

describe("opt-out and browser signals", () => {
  it("sends nothing after the visitor turns usage counts off, including what was queued", async () => {
    const { browser, track, flush, consent, EVENTS } = await start();
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    consent.saveChoices({ measurement: "off" });
    track(EVENTS.page_view);
    flush();
    await browser.drain();
    expect(browser.requests).toHaveLength(0);
  });

  it("respects a stored opt-out on the next page load", async () => {
    const { browser, track, flush, EVENTS } = await start({
      storage: { "wkc.privacy": JSON.stringify({ v: 1, measurement: "off", google: "denied" }) },
    });
    track(EVENTS.page_view);
    flush();
    await browser.drain();
    expect(browser.requests).toHaveLength(0);
  });

  it("keeps first-party counts under GPC, but no third party", async () => {
    const { browser, track, flush, EVENTS } = await start({
      gpc: true,
      ga: "G-TEST",
      storage: OPTED_IN,
    });
    track(EVENTS.page_view);
    flush();
    await browser.drain();
    expect(browser.events()).toHaveLength(1);
    expect(browser.scripts).toHaveLength(0);
    expect(browser.gtag()).toHaveLength(0);
  });

  it("treats Do Not Track like GPC for third parties", async () => {
    const { browser } = await start({ dnt: "1", ga: "G-TEST", storage: OPTED_IN });
    expect(browser.scripts).toHaveLength(0);
  });
});

describe("Google Analytics", () => {
  it("does not load without an opt-in, even when configured", async () => {
    const { browser, track, EVENTS } = await start({ ga: "G-TEST" });
    track(EVENTS.page_view);
    expect(browser.scripts).toHaveLength(0);
    expect(browser.win.gtag).toBeUndefined();
  });

  it("does not load when not configured, even with an opt-in", async () => {
    const { browser } = await start({ storage: OPTED_IN });
    expect(browser.scripts).toHaveLength(0);
  });

  it("after opting in: consent mode with ads denied, sanitised URLs, catalog events only, no ids", async () => {
    const { browser, track, EVENTS } = await start({
      ga: "G-TEST",
      storage: OPTED_IN,
      href: "https://sharp.example.com/a?utm_source=nextdoor&session_id=cs_live_1&order=o-1&name=Ada",
      referrer: "https://www.facebook.com/some/private/path?u=123",
    });
    track(EVENTS.page_view);
    track(EVENTS.checkout_started, { order_id: "order-123", total_cents: 3900 });
    track(EVENTS.form_error, { form: "booking", fields: "email" });
    expect(browser.scripts).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-TEST"]);
    const calls = browser.gtag();
    expect(calls).toContainEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(calls).toContainEqual([
      "set",
      { allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
    const events = calls.filter((c) => c[0] === "event").map((c) => c[1]);
    expect(events).toEqual(["page_view", "checkout_started"]); // form_error is first-party only
    const text = JSON.stringify(calls);
    for (const secret of [
      "00000000-0000-4000-8000-000000000001",
      "order-123",
      "o-1",
      "cs_live_1",
      "Ada",
      "event_id",
      "view_id",
      "/some/private",
    ])
      expect(text).not.toContain(secret);
    expect(text).toContain("https://sharp.example.com/a?utm_source=nextdoor");
    expect(text).toContain('"page_referrer":"https://www.facebook.com"');
  });

  it("never loads on the thank-you page", async () => {
    const { browser, track, EVENTS } = await start({
      ga: "G-TEST",
      storage: OPTED_IN,
      href: "https://sharp.example.com/thanks?order=o-1",
    });
    track(EVENTS.page_view);
    track(EVENTS.checkout_completed, { total_cents: 3900 });
    expect(browser.scripts).toHaveLength(0);
    expect(browser.gtag()).toHaveLength(0);
  });

  it("waits until no dialog is open before loading", async () => {
    const { browser, consent } = await start({ ga: "G-TEST", storage: OPTED_IN, dialogOpen: true });
    expect(browser.scripts).toHaveLength(0);
    browser.state.dialogOpen = false;
    consent.saveChoices({ google: "granted" }); // any later privacy change re-checks
    expect(browser.scripts).toHaveLength(1);
  });

  it("stops forwarding when the visitor withdraws consent", async () => {
    const { browser, track, consent, EVENTS } = await start({ ga: "G-TEST", storage: OPTED_IN });
    track(EVENTS.page_view);
    consent.saveChoices({ google: "denied" });
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    const calls = browser.gtag();
    expect(calls).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    expect(calls.filter((c) => c[0] === "event").map((c) => c[1])).toEqual(["page_view"]);
  });
});

describe("backend failures", () => {
  it("never throws when the request is blocked or offline", async () => {
    const { browser, track, flush, EVENTS } = await start({ status: "reject" });
    expect(() => {
      track(EVENTS.page_view);
      track(EVENTS.checkout_started, { total_cents: 3900 });
      flush();
    }).not.toThrow();
    await browser.drain();
    expect(browser.requests.length).toBeGreaterThan(0);
  });

  it("stops sending for the rest of the page after a 503 or 429", async () => {
    for (const status of [503, 429]) {
      const { browser, track, flush, EVENTS } = await start({ status });
      track(EVENTS.checkout_started, { total_cents: 3900 });
      await browser.drain();
      const sent = browser.requests.length;
      track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
      flush();
      await browser.drain();
      expect(browser.requests.length).toBe(sent);
    }
  });

  it("holds events while offline and sends them when back online", async () => {
    const { browser, track, flush, EVENTS } = await start({ online: false });
    track(EVENTS.page_view);
    flush();
    await browser.drain();
    expect(browser.requests).toHaveLength(0);
    browser.nav.onLine = true;
    browser.fire("window", "online");
    await browser.drain();
    expect(browser.events().map((e) => e.name)).toEqual(["page_view"]);
  });

  it("flushes when the page is hidden", async () => {
    const { browser, track, EVENTS } = await start();
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    browser.fire("window", "pagehide");
    await browser.drain();
    expect(browser.events()).toHaveLength(1);
  });

  it("counts failed API calls by area and status class only", async () => {
    const { browser, flush, api } = await start({ status: 503 });
    await expect(api.api.config()).rejects.toThrow();
    flush();
    await browser.drain();
    const errors = browser.events().filter((e) => e.name === "client_error");
    expect(errors).toEqual([
      expect.objectContaining({ props: { kind: "api", area: "config", status: "5xx" } }),
    ]);
  });
});

describe("formErrorProps", () => {
  it("reports which fields failed and whether they were empty, never their values", async () => {
    const { formErrorProps } = await start();
    const candidate = {
      customer: { name: "", email: "ada@", phone: "908", address: { zip: "10001" } },
    };
    const props = formErrorProps(
      "booking",
      [
        { path: ["customer", "name"], code: "too_small" },
        { path: ["customer", "email"], code: "invalid_format" },
        { path: ["customer", "address", "zip"], code: "custom" },
      ],
      candidate,
    );
    expect(props).toEqual({
      form: "booking",
      fields: "name,email,zip",
      kinds: "missing,format,out_of_area",
      count: 3,
    });
    expect(JSON.stringify(props)).not.toMatch(/ada@|908|10001/);
  });
});

describe("preference changes take effect immediately", () => {
  it("drops events already queued and in the middle of sending when counts are turned off", async () => {
    const { browser, track, flush, consent, EVENTS } = await start();
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    flush(); // handed to the sender, waiting for the owner hash
    consent.saveChoices({ measurement: "off" });
    await browser.drain();
    expect(browser.requests).toHaveLength(0);
  });

  it("applies a choice made in another tab, including switching Google off", async () => {
    const { browser, track, flush, EVENTS } = await start({ ga: "G-TEST", storage: OPTED_IN });
    expect((browser.win as unknown as Record<string, unknown>)["ga-disable-G-TEST"]).toBe(false);
    track(EVENTS.page_view);
    // Another tab writes the opt-out and the browser fires a storage event here.
    browser.storage.set(
      "wkc.privacy",
      JSON.stringify({ v: 1, measurement: "off", google: "denied" }),
    );
    browser.win.dispatchEvent(Object.assign(new Event("storage"), { key: "wkc.privacy" }));
    expect((browser.win as unknown as Record<string, unknown>)["ga-disable-G-TEST"]).toBe(true);
    expect(browser.gtag()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
    const before = browser.requests.length;
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    flush();
    await browser.drain();
    expect(browser.requests.length).toBe(before);
  });

  it("switches Google off at once: consent denied, Google's opt-out flag set, nothing forwarded", async () => {
    const { browser, track, consent, EVENTS } = await start({ ga: "G-TEST", storage: OPTED_IN });
    const flag = () => (browser.win as unknown as Record<string, unknown>)["ga-disable-G-TEST"];
    expect(flag()).toBe(false);
    consent.saveChoices({ google: "denied" });
    expect(flag()).toBe(true);
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    const events = browser
      .gtag()
      .filter((c) => c[0] === "event")
      .map((c) => c[1]);
    expect(events).not.toContain("cta_click");
  });

  it("turning counts off also stops Google, even if it was opted in", async () => {
    const { browser, track, consent, EVENTS } = await start({ ga: "G-TEST", storage: OPTED_IN });
    consent.saveChoices({ measurement: "off" });
    track(EVENTS.cta_click, { cta: "sharpen", location: "hero" });
    expect((browser.win as unknown as Record<string, unknown>)["ga-disable-G-TEST"]).toBe(true);
    expect(
      browser
        .gtag()
        .filter((c) => c[0] === "event")
        .map((c) => c[1]),
    ).not.toContain("cta_click");
  });
});
