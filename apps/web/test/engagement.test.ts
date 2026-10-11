import { afterEach, describe, expect, it, vi } from "vitest";
import { isChunkFailure, ratingFor } from "../src/lib/health.ts";
import { fakeSession, installBrowser } from "./fake-browser.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function start() {
  vi.resetModules();
  const browser = installBrowser();
  const analytics = await import("../src/lib/analytics.ts");
  const engagement = await import("../src/lib/engagement.ts");
  analytics.initAnalytics(fakeSession());
  const sent = () => {
    analytics.flush();
    return browser.events().map((e) => [e.name, e.props]);
  };
  return { browser, sent, ...analytics, ...engagement };
}

/** A form field inside an open dialog whose value must never be read. */
function field(name: string, inDialog = true, tagName = "INPUT") {
  return {
    tagName,
    getAttribute: (attr: string) => (attr === "name" ? name : null),
    closest: (selector: string) => (selector === "dialog[open]" && inDialog ? {} : null),
    get value(): string {
      throw new Error("analytics must not read field values");
    },
  };
}

const focus = (target: unknown) => ({ target }) as unknown as Event;
const closeDialog = () => ({ target: { tagName: "DIALOG" } }) as unknown as Event;

describe("coarse buckets", async () => {
  const { timeBand, scrollPercent, reachedMilestones } = await import("../src/lib/engagement.ts");

  it("bands visible time", () => {
    expect([5_000, 12_000, 45_000, 90_000, 400_000].map(timeBand)).toEqual([
      "<10s",
      "10-30s",
      "30-60s",
      "1-3m",
      "3m+",
    ]);
  });

  it("turns scroll position into milestones", () => {
    expect(scrollPercent(0, 800, 4000)).toBe(20);
    expect(reachedMilestones(scrollPercent(2200, 800, 4000), [25, 50, 75, 90])).toEqual([
      25, 50, 75,
    ]);
    expect(scrollPercent(0, 800, 0)).toBe(0);
  });

  it("rates web vitals with web.dev thresholds", () => {
    expect(ratingFor("lcp", 1800)).toBe("good");
    expect(ratingFor("lcp", 3000)).toBe("needs_improvement");
    expect(ratingFor("cls", 0.4)).toBe("poor");
    expect(ratingFor("inp", 150)).toBe("good");
  });

  it("recognises a failed lazy chunk", () => {
    expect(
      isChunkFailure(new TypeError("Failed to fetch dynamically imported module: /x.js")),
    ).toBe(true);
    expect(isChunkFailure(new Error("boom"))).toBe(false);
  });
});

describe("booking steps from the DOM", () => {
  it("marks details reached on the first focus in the booking sheet, reading names only", async () => {
    const { track, onFocusIn, sent, EVENTS } = await start();
    track(EVENTS.booking_opened, { location: "hero" });
    expect(() => {
      onFocusIn(focus(field("knives", true, "SELECT")));
      onFocusIn(focus(field("email")));
      onFocusIn(focus(field("phone")));
    }).not.toThrow();
    expect(sent()).toEqual([
      ["booking_opened", { location: "hero" }],
      ["booking_step", { step: "details" }],
    ]);
  });

  it("ignores focus outside a dialog and in the waitlist form", async () => {
    const { track, onFocusIn, sent, EVENTS } = await start();
    onFocusIn(focus(field("email", false)));
    track(EVENTS.pilot_opened, { location: "hero" });
    onFocusIn(focus(field("email")));
    expect(sent().map(([name]) => name)).toEqual(["pilot_opened"]);
  });

  it("records where an unfinished booking was closed", async () => {
    const { track, onFocusIn, onDialogClose, sent, EVENTS } = await start();
    track(EVENTS.booking_opened, { location: "hero" });
    onDialogClose(closeDialog());
    track(EVENTS.booking_opened, { location: "pricing" });
    onFocusIn(focus(field("name")));
    onDialogClose(closeDialog());
    const closes = sent().filter(([name]) => name === "booking_closed");
    expect(closes).toEqual([
      ["booking_closed", { step: "choose" }],
      ["booking_closed", { step: "details" }],
    ]);
  });

  it("does not call a booking abandoned once checkout started", async () => {
    const { track, onDialogClose, sent, EVENTS } = await start();
    track(EVENTS.booking_opened, { location: "hero" });
    track(EVENTS.checkout_started, { total_cents: 3900 });
    onDialogClose(closeDialog());
    expect(sent().map(([name]) => name)).not.toContain("booking_closed");
  });
});

describe("process film", () => {
  it("records play, progress milestones and unmute once each", async () => {
    const { watchVideo, sent } = await start();
    const listeners = new Map<string, () => void>();
    const video = {
      muted: true,
      volume: 1,
      currentTime: 0,
      duration: 23,
      videoWidth: 1080,
      videoHeight: 1080,
      paused: true,
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: () => {},
    };
    watchVideo(video as unknown as HTMLVideoElement);
    listeners.get("play")!();
    for (const t of [3, 6, 12, 12, 18]) {
      video.currentTime = t;
      listeners.get("timeupdate")!();
    }
    video.muted = false;
    listeners.get("volumechange")!();
    listeners.get("volumechange")!();
    listeners.get("ended")!();
    expect(sent()).toEqual([
      ["video_view", { trigger: "autoplay", format: "square" }],
      ["video_progress", { percent: 25 }],
      ["video_progress", { percent: 50 }],
      ["video_progress", { percent: 75 }],
      ["video_unmute", { format: "square", at_seconds: 18 }],
      ["video_progress", { percent: 100 }],
    ]);
  });
});

describe("landing page observers", () => {
  it("measures scroll depth, but not while a dialog is open, and reports visible time on leave", async () => {
    const { browser, startEngagement, sent } = await start();
    const frames: (() => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: () => void) => frames.push(fn));
    const scroll = (y: number) => {
      browser.win.scrollY = y;
      browser.fire("window", "scroll");
      browser.fire("window", "scroll"); // same frame: sampled once
      frames.splice(0).forEach((fn) => fn());
    };
    const stop = startEngagement();
    browser.state.dialogOpen = true;
    scroll(3200);
    expect(sent()).toEqual([]);
    browser.state.dialogOpen = false;
    scroll(1200);
    browser.fire("window", "pagehide");
    expect(sent()).toEqual([
      ["scroll_depth", { percent: 25 }],
      ["scroll_depth", { percent: 50 }],
      ["page_engagement", { time: "<10s", max_scroll: 50 }],
    ]);
    stop();
  });

  it("records a return from a cancelled checkout", async () => {
    vi.resetModules();
    const browser = installBrowser({ href: "https://sharp.example.com/?cancelled=1" });
    const analytics = await import("../src/lib/analytics.ts");
    const { startEngagement } = await import("../src/lib/engagement.ts");
    analytics.initAnalytics(fakeSession());
    startEngagement();
    analytics.flush();
    expect(browser.events().map((e) => [e.name, e.props])).toEqual([
      ["checkout_returned", { outcome: "cancelled" }],
    ]);
  });
});

describe("one source for film analytics", () => {
  it("leaves play, progress and unmute to the DOM observer", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../src/sections/LaunchVideo.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\btrack\(/);
  });
});
