import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { EVENTS, track } from "../lib/analytics.ts";

/**
 * The 23-second launch film (source: marketing/launch-video): "Dull.",
 * "Sharp.", "Picked up at your door.", "Back on your doorstep.", logo.
 * One cut for every visitor: it shows no price and makes no timing promise,
 * so it says the same thing in both experiment arms.
 *
 * Nothing but the poster loads until the film is half on screen.
 * Files are versioned so a re-render never collides with a cached copy.
 */
const VERSION = "v3";
type Format = "landscape" | "square";

const file = (format: Format, suffix: string) => `/video/launch-${format}-${VERSION}${suffix}`;

const TRANSCRIPT = [
  "Dull. A dull knife drags across a tomato and crushes it.",
  "Sharp. A sharp knife goes through it in one stroke; clean slices fan out.",
  "Picked up at your door. A bag of knives is picked up from a front doorstep.",
  "Back on your doorstep. The bag is back on the doormat.",
  "Westfield Knife Care. Sharpen My Knives. sharp.usabiology.com",
];

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LaunchVideo() {
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
    track(EVENTS.video_view, { trigger, format });
  };

  // Autoplay (muted) only while at least half the film is on screen.
  useEffect(() => {
    const video = ref.current;
    if (!video || reduced || userPaused || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // isIntersecting is true for any sliver on screen (including the first
        // callback), so check the actual ratio against the 50% threshold.
        if (entry && entry.intersectionRatio >= 0.5) {
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
        track(EVENTS.video_unmute, { format, at_seconds: Math.round(video.currentTime) });
      }
    }
  };

  return (
    <div class="process-film" id="process-film">
      <div class="process-film-copy">
        <p class="eyebrow">Watch the story · 23 seconds</p>
        <h3 id="process-film-title">Less struggle. More chopping.</h3>
        <p>
          See the difference a sharp edge makes, and how your knives go from your door to sharpening
          and back home again.
        </p>
        <details class="process-description" id="video-transcript">
          <summary>Read the video description</summary>
          {TRANSCRIPT.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </details>
      </div>
      <figure class="process-film-frame">
        <div class="video-frame" style={{ aspectRatio: format === "square" ? "1 / 1" : "16 / 9" }}>
          <video
            ref={ref}
            muted={muted}
            loop
            playsInline
            preload="none"
            poster={file(format, "-poster.jpg")}
            aria-labelledby="process-film-title"
            aria-describedby="video-transcript"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            <source src={file(format, ".webm")} type="video/webm" />
            <source src={file(format, ".mp4")} type="video/mp4" />
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
        <figcaption>A little care. A fresh start for dinner.</figcaption>
      </figure>
    </div>
  );
}
