import {
  EVENTS,
  SCROLL_MILESTONES,
  TIME_BANDS,
  VIDEO_MILESTONES,
  type SectionId,
} from "@wkc/shared";
import {
  activeFlow,
  applyPrivacyChoices,
  endFlow,
  flush,
  isSensitiveScreen,
  track,
} from "./analytics.ts";

/**
 * Landing-page engagement, observed from the DOM so components need no tracking code:
 * sections reached, scroll depth, visible time, the process film and booking sheet closed.
 * Nothing here reads form fields. Booking step progress comes only from the explicit
 * `booking_step` event the booking sheet sends when it changes step. While a dialog is open,
 * page scrolling is not measured.
 */

export const SECTION_SELECTORS: Record<SectionId, string> = {
  hero: ".hero",
  how_it_works: "#how-it-works",
  process_film: "#process-film",
  pricing: "#pricing",
  faq: "#faq",
};

export function timeBand(ms: number): (typeof TIME_BANDS)[number] {
  const s = ms / 1000;
  if (s < 10) return "<10s";
  if (s < 30) return "10-30s";
  if (s < 60) return "30-60s";
  if (s < 180) return "1-3m";
  return "3m+";
}

/** How far down the page the bottom of the viewport is, 0-100. */
export function scrollPercent(scrollY: number, viewport: number, documentHeight: number): number {
  if (documentHeight <= 0) return 0;
  return Math.min(100, Math.max(0, ((scrollY + viewport) / documentHeight) * 100));
}

export function reachedMilestones<T extends number>(
  percent: number,
  milestones: readonly T[],
): T[] {
  return milestones.filter((m) => percent >= m);
}

/** A dialog closed. A booking sheet closed before checkout is an abandoned booking. */
export function onDialogClose(event: Event): void {
  if ((event.target as Element | null)?.tagName !== "DIALOG") return;
  const flow = activeFlow();
  if (flow.kind === "booking" && !flow.checkout)
    track(EVENTS.booking_closed, { step: flow.details ? "details" : "choose" });
  if (flow.kind) endFlow();
  // Third-party loading waits while a dialog is open; this is the moment to check again.
  queueMicrotask(applyPrivacyChoices);
}

/** Play, progress milestones and unmute for one video element. */
export function watchVideo(video: HTMLVideoElement): () => void {
  const format = () =>
    video.videoWidth &&
    video.videoHeight &&
    Math.abs(video.videoWidth / video.videoHeight - 1) < 0.05
      ? "square"
      : "landscape";
  let wasMuted = video.muted;
  const onPlay = () => {
    const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation;
    const trigger = activation?.isActive ? "click" : video.muted ? "autoplay" : "play";
    track(EVENTS.video_view, { trigger, format: format() });
  };
  const onTime = () => {
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const percent = (video.currentTime / video.duration) * 100;
    for (const m of reachedMilestones(percent, VIDEO_MILESTONES))
      track(EVENTS.video_progress, { percent: m });
  };
  const onEnded = () => track(EVENTS.video_progress, { percent: 100 });
  const onVolume = () => {
    if (wasMuted && !video.muted && video.volume > 0)
      track(EVENTS.video_unmute, {
        format: format(),
        at_seconds: Math.min(600, Math.max(0, Math.round(video.currentTime))),
      });
    wasMuted = video.muted;
  };
  // Already playing when this loaded (it is loaded on idle): count the view now.
  if (!video.paused) onPlay();
  video.addEventListener("play", onPlay);
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("ended", onEnded);
  video.addEventListener("volumechange", onVolume);
  return () => {
    video.removeEventListener("play", onPlay);
    video.removeEventListener("timeupdate", onTime);
    video.removeEventListener("ended", onEnded);
    video.removeEventListener("volumechange", onVolume);
  };
}

/** Start observing the landing page. Call after the first render; returns a stop function. */
export function startEngagement(): () => void {
  const stops: (() => void)[] = [];
  const listen = (
    target: EventTarget,
    type: string,
    fn: (e: Event) => void,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(type, fn, opts);
    stops.push(() => target.removeEventListener(type, fn, opts));
  };

  try {
    if (new URLSearchParams(window.location.search).get("cancelled") === "1")
      track(EVENTS.checkout_returned, { outcome: "cancelled" });

    // Sections: counted once each, when a good part of them is on screen.
    if (typeof IntersectionObserver === "function") {
      const sections = new Map<Element, SectionId>();
      for (const [id, selector] of Object.entries(SECTION_SELECTORS) as [SectionId, string][]) {
        const element = document.querySelector(selector);
        if (element) sections.set(element, id);
      }
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = sections.get(entry.target);
            if (!id || !entry.isIntersecting || isSensitiveScreen()) continue;
            const viewport = entry.rootBounds?.height ?? window.innerHeight;
            if (entry.intersectionRatio >= 0.35 || entry.intersectionRect.height >= viewport * 0.5)
              track(EVENTS.section_view, { section: id });
          }
        },
        { threshold: [0, 0.2, 0.35, 0.5] },
      );
      for (const element of sections.keys()) io.observe(element);
      stops.push(() => io.disconnect());
    }

    // Scroll depth, sampled at most once a frame.
    let maxScroll = 0;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (isSensitiveScreen()) return;
      const percent = scrollPercent(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      for (const m of reachedMilestones(percent, SCROLL_MILESTONES)) {
        maxScroll = Math.max(maxScroll, m);
        track(EVENTS.scroll_depth, { percent: m });
      }
    };
    listen(
      window,
      "scroll",
      () => {
        frame ||= requestAnimationFrame(measure);
      },
      { passive: true },
    );

    // Visible time until the visitor first leaves the page.
    let visibleSince = document.visibilityState === "visible" ? performance.now() : undefined;
    let visibleMs = 0;
    const onHidden = () => {
      if (visibleSince !== undefined) visibleMs += performance.now() - visibleSince;
      visibleSince = undefined;
      track(EVENTS.page_engagement, { time: timeBand(visibleMs), max_scroll: maxScroll });
      flush();
    };
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") onHidden();
      else visibleSince = performance.now();
    });
    listen(window, "pagehide", onHidden);

    // The process film (any video inside it).
    for (const video of document.querySelectorAll<HTMLVideoElement>("#process-film video"))
      stops.push(watchVideo(video));

    // Booking sheet closed without checkout. (Step progress is reported explicitly by the
    // booking sheet when it changes step, never inferred from which field has focus.)
    listen(document, "close", onDialogClose, { capture: true });
  } catch {
    // Engagement is optional; the page works without it.
  }
  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}
