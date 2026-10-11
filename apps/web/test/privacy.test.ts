import { afterEach, describe, expect, it, vi } from "vitest";
import { sanitizePageUrl, sanitizeReferrer } from "../src/lib/privacy-url.ts";
import { installBrowser } from "./fake-browser.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sanitizePageUrl", () => {
  it("keeps the route and campaign tags only", () => {
    expect(sanitizePageUrl("https://sharp.example.com/a?src=flyer-a&utm_medium=print#book")).toBe(
      "https://sharp.example.com/a?src=flyer-a&utm_medium=print",
    );
  });

  it.each([
    ["the feedback token", "/thanks?order=o-1&ft=AbCdEfGhIjKlMnOp&session_id=cs_test_1", "/thanks"],
    ["an order id", "/thanks?order=3f1c-uuid", "/thanks"],
    ["Stripe's session id", "/?cancelled=1&session_id=cs_live_abc", "/"],
    ["unknown parameters", "/?email=ada%40example.com&name=Ada&phone=9085550123", "/"],
    ["an unknown path", "/ada@example.com/profile", "/other"],
    ["an email in a campaign tag", "/?utm_source=ada%40example.com", "/"],
    ["a phone number in a campaign tag", "/?src=9085550123", "/"],
    ["an over-long campaign tag", `/?src=${"x".repeat(60)}`, "/"],
  ])("drops %s", (_label, path, expected) => {
    expect(sanitizePageUrl(`https://sharp.example.com${path}`)).toBe(
      `https://sharp.example.com${expected}`,
    );
  });

  it("returns an empty string for something that is not a URL", () => {
    expect(sanitizePageUrl("not a url")).toBe("");
  });
});

describe("sanitizeReferrer", () => {
  it("keeps the referring origin only", () => {
    expect(sanitizeReferrer("https://www.google.com/search?q=knife+sharpening+westfield")).toBe(
      "https://www.google.com",
    );
    expect(sanitizeReferrer("")).toBe("");
    expect(sanitizeReferrer("garbage")).toBe("");
  });
});

describe("privacy choices", () => {
  async function consent(options = {}) {
    vi.resetModules();
    const browser = installBrowser(options);
    return { browser, ...(await import("../src/lib/consent.ts")) };
  }

  it("defaults to first-party counts on and Google off", async () => {
    const { readChoices, measurementAllowed, googleAllowed } = await consent({ ga: "G-TEST" });
    expect(readChoices()).toEqual({ v: 1, measurement: "on", google: "denied" });
    expect(measurementAllowed()).toBe(true);
    expect(googleAllowed()).toBe(false);
  });

  it("reads Global Privacy Control and Do Not Track", async () => {
    expect((await consent({ gpc: true })).browserSignal()).toBe("gpc");
    expect((await consent({ dnt: "1" })).browserSignal()).toBe("dnt");
    expect((await consent()).browserSignal()).toBeNull();
  });

  it("lets a browser signal override a Google opt-in", async () => {
    const { saveChoices, googleAllowed } = await consent({ ga: "G-TEST", gpc: true });
    saveChoices({ google: "granted" });
    expect(googleAllowed()).toBe(false);
  });

  it("deleting erases this browser's events, forgets its ids, keeps its price, and stops counting", async () => {
    const { browser, forgetThisDevice, measurementAllowed } = await consent({
      storage: {
        "wkc.visitor_id": "visitor-00000001",
        "wkc.attribution": '{"source":"flyer-a","acquisition_channel":"print"}',
        "wkc.experiment_id": "experiment-001",
      },
    });
    expect(await forgetThisDevice("visitor-00000001")).toBe(true);
    expect(browser.requests).toEqual([
      { url: "/api/events/forget", body: '{"visitor_id":"visitor-00000001"}' },
    ]);
    expect(browser.storage.has("wkc.visitor_id")).toBe(false);
    expect(browser.storage.has("wkc.attribution")).toBe(false);
    expect(browser.storage.get("wkc.experiment_id")).toBe("experiment-001");
    expect(measurementAllowed()).toBe(false);
  });

  it("still stops counting locally when the server cannot be reached", async () => {
    const { forgetThisDevice, measurementAllowed } = await consent({ status: "reject" });
    expect(await forgetThisDevice("visitor-00000001")).toBe(false);
    expect(measurementAllowed()).toBe(false);
  });
});
