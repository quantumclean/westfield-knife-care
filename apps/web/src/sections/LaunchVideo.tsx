import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Section } from "@wkc/ui";
import { EVENTS, track } from "../lib/analytics.ts";

/**
 * The 50-second launch video (source: marketing/launch-video). It is
 * experiment-neutral — no price, headline or turnaround time — so both A/B
 * arms see the same thing and it can't confound the test.
 *
 * Files are versioned because the deploy caches non-HTML assets as
 * immutable; a re-render must ship under a new VERSION.
 */
const VERSION = "v1";
const file = (cut: "landscape" | "square", suffix: string) =>
  `/video/launch-${cut}-${VERSION}${suffix}`;

const TRANSCRIPT = [
  "When did you last sharpen your knives?",
  "Dull knives crush. They slip. Cooking feels like work.",
  "Westfield Knife Care. Sharpening, handled. Local pickup, pro sharpening, fast return.",
  "1. Book in about a minute. 2. We pick up at your door. 3. Professionally sharpened, by hand or precision equipment. 4. Back at your door. Sharp.",
  "The details, handled: one local route, no shipping. Pickup and return included. Secure checkout through Stripe. Full refund if we can't make your pickup.",
  "Coming soon: Always Sharp. Swap a dull knife for a sharp one, on repeat.",
  "Sharp knives. Zero hassle. Book your pickup at sharp.usabiology.com.",
];

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LaunchVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const cut = useMemo<"landscape" | "square">(
    () =>
      typeof matchMedia === "function" && matchMedia("(max-width: 640px)").matches
        ? "square"
        : "landscape",
    [],
  );
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const viewed = useRef(false);
  const unmuted = useRef(false);

  const markViewed = (trigger: string) => {
    if (viewed.current) return;
    viewed.current = true;
    track(EVENTS.video_view, { trigger, cut });
  };

  // Autoplay (muted) only while at least half the video is on screen.
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced || userPaused || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          video
            .play()
            .then(() => markViewed("autoplay"))
            .catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(video);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, userPaused]);

  const togglePlay = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
      void video.play().then(() => markViewed("click"));
    } else {
      setUserPaused(true);
      video.pause();
    }
  };

  const toggleSound = () => {
    const video = ref.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    setMuted(next);
    if (!next) {
      if (video.paused) {
        setUserPaused(false);
        void video.play().then(() => markViewed("click"));
      }
      if (!unmuted.current) {
        unmuted.current = true;
        track(EVENTS.video_unmute, { cut, at_seconds: Math.round(video.currentTime) });
      }
    }
  };

  return (
    <Section id="video" title="Sharpening, handled." subtitle="The whole service in 50 seconds.">
      <div class="video-frame" style={{ aspectRatio: cut === "square" ? "1 / 1" : "16 / 9" }}>
        <video
          ref={ref}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          poster={file(cut, "-poster.jpg")}
          aria-label="Westfield Knife Care: how the service works, in 50 seconds"
          aria-describedby="video-transcript"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src={file(cut, ".webm")} type="video/webm" />
          <source src={file(cut, ".mp4")} type="video/mp4" />
        </video>
        {!playing && (
          <button type="button" class="video-play" onClick={togglePlay} aria-label="Play video">
            <span aria-hidden="true">▶</span>
          </button>
        )}
        <div class="video-controls">
          <button type="button" class="video-btn" onClick={togglePlay}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" class="video-btn" onClick={toggleSound} aria-pressed={!muted}>
            {muted ? "Sound on" : "Mute"}
          </button>
        </div>
      </div>
      <details class="video-transcript" id="video-transcript">
        <summary>What's in the video</summary>
        {TRANSCRIPT.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </details>
    </Section>
  );
}
