import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Section } from "@wkc/ui";
import { EVENTS, track } from "../lib/analytics.ts";

/**
 * The 23-second launch film (source: marketing/launch-video): "Dull.",
 * "Sharp.", a pickup line, a return line, logo. The return line is a
 * turnaround promise, so each offer gets the cut that repeats its own
 * promise and nothing else; an offer without a cut shows no video rather
 * than one that could contradict it or confound the A/B test.
 *
 * Files are versioned because the deploy caches non-HTML assets as
 * immutable; a re-render must ship under a new VERSION.
 */
const VERSION = "v1";
type Cut = "a" | "b";
type Format = "landscape" | "square";

const VIDEO_BY_OFFER: Record<string, Cut> = {
  "offer-001": "a", // "Back at your door within 48 hours"
  "offer-002": "b", // "Back at your door the next day"
};

const file = (cut: Cut, format: Format, suffix: string) =>
  `/video/launch-${cut}-${format}-${VERSION}${suffix}`;

const LINES: Record<Cut, { pickup: string; back: string; backScene: string }> = {
  a: {
    pickup: "Picked up at home.",
    back: "Back within 48 hours.",
    backScene: "The bag is back on the doormat.",
  },
  b: {
    pickup: "Picked up today.",
    back: "Back tomorrow.",
    backScene: "The next day, the bag is back on the doormat.",
  },
};

function transcript(cut: Cut): string[] {
  const l = LINES[cut];
  return [
    "Dull. A dull knife drags across a tomato and crushes it.",
    "Sharp. A sharp knife goes through it in one stroke; clean slices fan out.",
    `${l.pickup} A bag of knives is picked up from a front doorstep.`,
    `${l.back} ${l.backScene}`,
    "Westfield Knife Care. Sharpen My Knives. sharp.usabiology.com",
  ];
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LaunchVideo({ offerId }: { offerId: string }) {
  const cut = VIDEO_BY_OFFER[offerId];
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = useMemo(prefersReducedMotion, []);
  const format = useMemo<Format>(
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
    track(EVENTS.video_view, { trigger, cut, format });
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
  }, [reduced, userPaused, cut]);

  if (!cut) return null;

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
        track(EVENTS.video_unmute, { cut, format, at_seconds: Math.round(video.currentTime) });
      }
    }
  };

  return (
    <Section id="video" title="Sharpening, handled.">
      <div class="video-frame" style={{ aspectRatio: format === "square" ? "1 / 1" : "16 / 9" }}>
        <video
          ref={ref}
          muted={muted}
          loop
          playsInline
          preload="metadata"
          poster={file(cut, format, "-poster.jpg")}
          aria-label={`Westfield Knife Care: dull, sharp. ${LINES[cut].pickup} ${LINES[cut].back}`}
          aria-describedby="video-transcript"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        >
          <source src={file(cut, format, ".webm")} type="video/webm" />
          <source src={file(cut, format, ".mp4")} type="video/mp4" />
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
        {transcript(cut).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </details>
    </Section>
  );
}
