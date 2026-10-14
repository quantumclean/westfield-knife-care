import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Sfx } from "./audio.ts";
import { COPY } from "./copy.ts";
import { Engine } from "./engine.ts";
import { LENGTHS, type LengthMode } from "./levels.ts";
import {
  effectiveReducedMotion,
  loadBest,
  loadPrefs,
  saveBest,
  savePrefs,
  type MotionPref,
  type Prefs,
} from "./prefs.ts";
import { loadSprites } from "./render/sprites.ts";
import type { Band } from "./sim/edge.ts";
import type { GameEvent, Phase, World } from "./sim/world.ts";

type Ui = "loading" | "title" | "tutorial" | "game";

interface Results {
  total: number;
  l1: number;
  l2: number;
  bestCombo: number;
  bestStreak: number;
  best: number;
  newBest: boolean;
}

const ACTIVE: readonly Phase[] = ["level1", "level2", "edgeGone", "sharpen", "pickup", "return"];

function lengthsFor(mode: LengthMode, params: URLSearchParams): { l1: number; l2: number } {
  const base = LENGTHS[mode];
  const num = (key: string, fallback: number) => {
    const n = Number(params.get(key));
    return Number.isFinite(n) && n >= 8 && n <= 180 ? n : fallback;
  };
  return { l1: num("l1", base.l1), l2: num("l2", base.l2) };
}

function initialPrefs(params: URLSearchParams): Prefs {
  const p = loadPrefs();
  const l1 = params.get("l1");
  if (l1 === "quick" || l1 === "full") p.length = l1;
  const motion = params.get("motion");
  if (motion === "reduce" || motion === "full" || motion === "system") p.motion = motion;
  if (params.has("muted")) p.muted = true;
  return p;
}

const NEXT_MOTION: Record<MotionPref, MotionPref> = {
  system: "reduce",
  reduce: "full",
  full: "system",
};
const MOTION_LABEL: Record<MotionPref, string> = {
  system: COPY.motionSystem,
  reduce: COPY.motionReduce,
  full: COPY.motionFull,
};

export function GameLab({ params }: { params: URLSearchParams }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sfx = useMemo(() => new Sfx(), []);
  const [prefs, setPrefs] = useState<Prefs>(() => initialPrefs(params));
  const [ui, setUi] = useState<Ui>("loading");
  const [phase, setPhase] = useState<Phase>("ready");
  const [paused, setPaused] = useState(false);
  const [tip, setTip] = useState(0);
  const [restored, setRestored] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [failed, setFailed] = useState(false);
  const reduced = effectiveReducedMotion(prefs);

  // HUD nodes, written every frame without re-rendering.
  const meterRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const bandRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const streakRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const last = useRef({
    edge: -1,
    ghost: 100,
    ghostShown: -1,
    at: 0,
    band: "",
    score: -1,
    timer: "",
    streak: "",
    hint: false,
  });

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const speed = useMemo(() => {
    const n = Number(params.get("speed"));
    return Number.isFinite(n) && n > 0 && n <= 20 ? n : 1;
  }, [params]);

  function announce(text: string) {
    if (liveRef.current) liveRef.current.textContent = text;
  }

  function updateHud(w: World) {
    const l = last.current;
    const edge = Math.round(w.edge);
    if (edge !== l.edge) {
      l.edge = edge;
      if (fillRef.current) fillRef.current.style.width = `${edge}%`;
      if (pctRef.current) pctRef.current.textContent = `${edge}%`;
      meterRef.current?.setAttribute("aria-valuenow", String(edge));
    }
    // The ghost trails a drop and then catches up (instantly with reduced motion).
    const now = performance.now();
    const dt = Math.min(0.1, (now - l.at) / 1000);
    l.at = now;
    if (w.edge >= l.ghost || w.cfg.reducedMotion) l.ghost = w.edge;
    else l.ghost += (w.edge - l.ghost) * Math.min(1, dt * 4);
    const ghost = Math.round(l.ghost * 2) / 2;
    if (ghost !== l.ghostShown) {
      l.ghostShown = ghost;
      if (ghostRef.current) ghostRef.current.style.width = `${ghost}%`;
    }
    if (w.band !== l.band) {
      l.band = w.band;
      if (meterRef.current) meterRef.current.dataset.band = w.band;
      if (bandRef.current) bandRef.current.textContent = COPY.bands[w.band as Band];
    }
    if (w.score !== l.score) {
      l.score = w.score;
      if (scoreRef.current) scoreRef.current.textContent = String(w.score);
    }
    const timer = w.phase === "level2" ? COPY.time(w.cfg.l2Seconds - w.phaseT) : "";
    if (timer !== l.timer) {
      l.timer = timer;
      if (timerRef.current) timerRef.current.textContent = timer;
    }
    const streak = w.streak >= 3 ? COPY.streak(w.streak) : "";
    if (streak !== l.streak) {
      l.streak = streak;
      if (streakRef.current) streakRef.current.textContent = streak;
    }
    const hint = w.phase === "level1" && w.cuts === 0 && w.phaseT < 15;
    if (hint !== l.hint) {
      l.hint = hint;
      hintRef.current?.classList.toggle("is-on", hint);
    }
  }

  function onPhase(p: Phase) {
    setPhase(p);
    const w = engineRef.current?.world;
    if (p === "level1") announce(COPY.level1);
    if (p === "level2") announce(COPY.level2);
    if (p === "edgeGone") announce(`${COPY.edgeGoneHead} ${COPY.edgeGoneBody}`);
    if (p === "pickup") announce(`${COPY.pickupHead}. ${COPY.pickupBody}`);
    if (p === "sharpen") {
      setRestored(false);
      announce(`${COPY.sharpenHead}. ${COPY.sharpenBody}`);
    }
    if (p === "return") announce(`${COPY.returnHead}. ${COPY.returnBody}`);
    if (p === "results" && w) {
      const best = loadBest();
      const newBest = w.score > best;
      if (newBest) saveBest(w.score);
      setResults({
        total: w.score,
        l1: w.l1Score,
        l2: w.l2Score,
        bestCombo: w.bestCombo,
        bestStreak: w.bestStreak,
        best: Math.max(best, w.score),
        newBest,
      });
      announce(`${COPY.resultsHead}. ${COPY.total} ${w.score}.`);
    }
  }

  function onEvent(e: GameEvent) {
    if (e.type === "restored") {
      setRestored(true);
      announce(COPY.restored);
    } else if (e.type === "warn") announce(e.at === 50 ? COPY.warnHalf : COPY.warnLow);
  }

  // Load sprites, then build the engine once.
  useEffect(() => {
    let cancelled = false;
    let engine: Engine | null = null;
    loadSprites()
      .then((sprites) => {
        if (cancelled || !canvasRef.current) return;
        const p = prefsRef.current;
        const len = lengthsFor(p.length, params);
        engine = new Engine(
          canvasRef.current,
          sprites,
          sfx,
          {
            l1Seconds: len.l1,
            l2Seconds: len.l2,
            reducedMotion: effectiveReducedMotion(p),
            seed: Number(params.get("seed")) || Math.floor(Math.random() * 1e9),
          },
          { onPhase, onFrame: updateHud, onEvent },
          { speed },
        );
        engineRef.current = engine;
        sfx.setMuted(p.muted);
        if (params.has("test")) {
          (window as unknown as { __gameLab: unknown }).__gameLab = {
            state: () => engine?.debug(),
            sharpen: () => engine?.sharpen(),
          };
        }
        setUi("title");
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      engine?.destroy();
      sfx.close();
    };
  }, []);

  // Pause on hide and on losing focus, mid-game.
  useEffect(() => {
    const autoPause = () => {
      if (ACTIVE.includes(phaseRef.current) && !pausedRef.current) setPaused(true);
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") autoPause();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", autoPause);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", autoPause);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    engineRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  useEffect(() => {
    sfx.setMuted(prefs.muted);
    savePrefs(prefs);
  }, [prefs, sfx]);

  // Move focus to the primary button whenever the screen changes.
  useEffect(() => {
    const el = overlayRef.current?.querySelector<HTMLElement>("[data-primary]");
    el?.focus({ preventScroll: true });
  }, [ui, phase, paused, tip, restored]);

  // Keyboard: lanes, sweep, pause and mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const inGame = ACTIVE.includes(phaseRef.current);
      if ((k === "Escape" || k === "p" || k === "P") && inGame) {
        e.preventDefault();
        setPaused((v) => !v);
        return;
      }
      if (k === "m" || k === "M") {
        setPrefs((p) => ({ ...p, muted: !p.muted }));
        return;
      }
      if (pausedRef.current || !inGame) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((tag === "BUTTON" || tag === "INPUT") && (k === " " || k === "Enter")) return;
      let handled = true;
      if (k === "ArrowLeft" || k === "a" || k === "A" || k === "1") engine.lane(0);
      else if (k === "ArrowDown" || k === "s" || k === "S" || k === "2") engine.lane(1);
      else if (k === "ArrowRight" || k === "d" || k === "D" || k === "3") engine.lane(2);
      else if (k === " ") engine.sweep();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function update(patch: Partial<Prefs>) {
    setPrefs((p) => ({ ...p, ...patch }));
  }

  function begin() {
    const engine = engineRef.current;
    if (!engine) return;
    sfx.unlock();
    const len = lengthsFor(prefs.length, params);
    engine.setLengths(len.l1, len.l2);
    engine.setReducedMotion(reduced);
    setResults(null);
    setPaused(false);
    setUi("game");
    engine.start();
  }

  function onStart() {
    sfx.unlock();
    if (!prefs.seenTutorial) {
      setTip(0);
      setUi("tutorial");
    } else begin();
  }

  function restart() {
    setPaused(false);
    setResults(null);
    sfx.unlock();
    const engine = engineRef.current;
    if (engine) {
      const len = lengthsFor(prefs.length, params);
      engine.setLengths(len.l1, len.l2);
      engine.start();
    }
  }

  function quit() {
    setPaused(false);
    engineRef.current?.quit();
    setUi("title");
  }

  const act = (a: "continue" | "skip") => {
    sfx.unlock();
    engineRef.current?.action(a);
  };

  const inGame = ui === "game";
  const showHud =
    inGame &&
    (phase === "level1" || phase === "level2" || phase === "edgeGone" || phase === "sharpen");
  return (
    <div class="gl-stage" data-ui={ui} data-phase={phase} data-reduced={reduced ? "" : undefined}>
      <canvas ref={canvasRef} class="gl-canvas" aria-hidden="true" />

      <div class={`gl-hud${showHud ? " is-on" : ""}`} aria-hidden={showHud ? undefined : "true"}>
        <div class="gl-top">
          <div
            class="gl-meter"
            ref={meterRef}
            data-band="keen"
            role="meter"
            aria-label={COPY.edge}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={100}
          >
            <div class="gl-meter-head">
              <span class="gl-meter-label">{COPY.edge}</span>
              <span class="gl-meter-pct" ref={pctRef}>
                100%
              </span>
              <span class="gl-meter-band" ref={bandRef}>
                {COPY.bands.keen}
              </span>
            </div>
            <div class="gl-bar">
              <div class="gl-bar-ghost" ref={ghostRef} />
              <div class="gl-bar-fill" ref={fillRef} />
              <div class="gl-bar-ticks" />
            </div>
          </div>
          <div class="gl-side">
            <div class="gl-score">
              <span class="gl-score-label">{COPY.score}</span>
              <span class="gl-score-value" ref={scoreRef}>
                0
              </span>
            </div>
            <div class="gl-tools">
              <button
                type="button"
                class="gl-icon"
                aria-label={prefs.muted ? COPY.unmute : COPY.mute}
                aria-pressed={prefs.muted}
                onClick={() => update({ muted: !prefs.muted })}
              >
                {prefs.muted ? <IconMuted /> : <IconSound />}
              </button>
              <button type="button" class="gl-icon" aria-label={COPY.restart} onClick={restart}>
                <IconRestart />
              </button>
              <button
                type="button"
                class="gl-icon"
                aria-label={COPY.pause}
                onClick={() => setPaused(true)}
              >
                <IconPause />
              </button>
            </div>
          </div>
        </div>
        <div class="gl-sub">
          <span class="gl-level">
            {phase === "level2"
              ? COPY.level2
              : phase === "sharpen"
                ? COPY.sharpenHead
                : COPY.level1}
          </span>
          <span class="gl-timer" ref={timerRef} />
          <span class="gl-streak" ref={streakRef} />
        </div>
        <p class="gl-hint" ref={hintRef}>
          {COPY.hint}
        </p>
      </div>

      <div class="gl-overlay" ref={overlayRef}>
        {ui === "loading" && (
          <div class="gl-card gl-center">
            <p>{failed ? "Couldn't start the game in this browser." : COPY.loading}</p>
          </div>
        )}

        {ui === "title" && (
          <div class="gl-card gl-title">
            <p class="gl-kicker">{COPY.kicker}</p>
            <h1>{COPY.title}</h1>
            <button type="button" class="gl-btn gl-primary" data-primary onClick={onStart}>
              {COPY.start}
            </button>
            <div class="gl-settings">
              <div class="gl-setting" role="group" aria-label={COPY.length}>
                <span>{COPY.length}</span>
                <div class="gl-seg">
                  {(["quick", "full"] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      aria-pressed={prefs.length === m}
                      onClick={() => update({ length: m })}
                    >
                      {m === "quick" ? COPY.quick : COPY.full} · {LENGTHS[m].l1}s
                    </button>
                  ))}
                </div>
              </div>
              <div class="gl-setting">
                <span>{COPY.sound}</span>
                <button
                  type="button"
                  class="gl-toggle"
                  aria-pressed={!prefs.muted}
                  onClick={() => update({ muted: !prefs.muted })}
                >
                  {prefs.muted ? COPY.off : COPY.on}
                </button>
              </div>
              <div class="gl-setting">
                <span>{COPY.motion}</span>
                <button
                  type="button"
                  class="gl-toggle"
                  onClick={() => update({ motion: NEXT_MOTION[prefs.motion] })}
                >
                  {MOTION_LABEL[prefs.motion]}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="gl-link"
              onClick={() => {
                sfx.unlock();
                setTip(0);
                setUi("tutorial");
              }}
            >
              {COPY.howToPlay}
            </button>
            <p class="gl-note">{COPY.prototype}</p>
          </div>
        )}

        {ui === "tutorial" && (
          <div class="gl-card gl-tutorial">
            <TutorialArt step={tip} />
            <h2>{COPY.tutorial[tip]!.head}</h2>
            <p>{COPY.tutorial[tip]!.body}</p>
            <div class="gl-dots" aria-hidden="true">
              {COPY.tutorial.map((_, i) => (
                <span key={i} class={i === tip ? "is-on" : ""} />
              ))}
            </div>
            {tip < COPY.tutorial.length - 1 ? (
              <button
                type="button"
                class="gl-btn gl-primary"
                data-primary
                onClick={() => setTip(tip + 1)}
              >
                {COPY.next}
              </button>
            ) : (
              <button
                type="button"
                class="gl-btn gl-primary"
                data-primary
                onClick={() => {
                  update({ seenTutorial: true });
                  begin();
                }}
              >
                {COPY.letsCut}
              </button>
            )}
            <button type="button" class="gl-link" onClick={() => setUi("title")}>
              {COPY.quit}
            </button>
          </div>
        )}

        {inGame && !paused && phase === "edgeGone" && (
          <div class="gl-card gl-center gl-gone">
            <h2>{COPY.edgeGoneHead}</h2>
            <p>{COPY.edgeGoneBody}</p>
            <button
              type="button"
              class="gl-btn gl-primary"
              data-primary
              onClick={() => act("continue")}
            >
              {COPY.continue}
            </button>
          </div>
        )}

        {inGame && !paused && phase === "pickup" && (
          <div class="gl-caption">
            <Beats at={0} />
            <h2>{COPY.pickupHead}</h2>
            <p>{COPY.pickupBody}</p>
            <div class="gl-row">
              <button
                type="button"
                class="gl-btn gl-primary"
                data-primary
                onClick={() => act("continue")}
              >
                {COPY.continue}
              </button>
              <button type="button" class="gl-btn" onClick={() => act("skip")}>
                {COPY.skip}
              </button>
            </div>
          </div>
        )}

        {inGame && !paused && phase === "sharpen" && !restored && (
          <div class="gl-caption">
            <Beats at={1} />
            <h2>{COPY.sharpenHead}</h2>
            <p>{COPY.sharpenBody}</p>
            <p class="gl-swipe" aria-hidden="true">
              ⟵ ⟶
            </p>
            <div class="gl-row">
              <button
                type="button"
                class="gl-btn gl-primary"
                data-primary
                onClick={() => {
                  sfx.unlock();
                  engineRef.current?.sharpen();
                }}
              >
                {COPY.sharpenButton}
              </button>
              <button type="button" class="gl-btn" onClick={() => act("skip")}>
                {COPY.skip}
              </button>
            </div>
          </div>
        )}

        {inGame && !paused && phase === "sharpen" && restored && (
          <div class="gl-stamp" role="presentation">
            {COPY.restored}
          </div>
        )}

        {inGame && !paused && phase === "return" && (
          <div class="gl-caption">
            <Beats at={2} />
            <h2>{COPY.returnHead}</h2>
            <p>{COPY.returnBody}</p>
            <button
              type="button"
              class="gl-btn gl-primary"
              data-primary
              onClick={() => act("continue")}
            >
              {COPY.startLevel2}
            </button>
          </div>
        )}

        {inGame && !paused && phase === "results" && results && (
          <div class="gl-card gl-center gl-results">
            <h2>{COPY.resultsHead}</h2>
            <p class="gl-total">
              <span>{COPY.total}</span>
              <strong>{results.total}</strong>
            </p>
            {results.newBest && <p class="gl-best">{COPY.newBest}</p>}
            <dl>
              <dt>{COPY.level1Score}</dt>
              <dd>{results.l1}</dd>
              <dt>{COPY.level2Score}</dt>
              <dd>{results.l2}</dd>
              <dt>{COPY.bestCombo}</dt>
              <dd>{results.bestCombo > 1 ? COPY.combo(results.bestCombo) : "—"}</dd>
              <dt>{COPY.bestStreak}</dt>
              <dd>{results.bestStreak}</dd>
              <dt>{COPY.best}</dt>
              <dd>{results.best}</dd>
            </dl>
            <button type="button" class="gl-btn gl-primary" data-primary onClick={restart}>
              {COPY.playAgain}
            </button>
            <button type="button" class="gl-link" onClick={quit}>
              {COPY.quit}
            </button>
          </div>
        )}

        {inGame && paused && (
          <div class="gl-scrim">
            <div
              class="gl-card gl-center gl-pause"
              role="dialog"
              aria-modal="true"
              aria-label={COPY.paused}
            >
              <h2>{COPY.paused}</h2>
              <button
                type="button"
                class="gl-btn gl-primary"
                data-primary
                onClick={() => setPaused(false)}
              >
                {COPY.resume}
              </button>
              <button type="button" class="gl-btn" onClick={restart}>
                {COPY.restart}
              </button>
              <div class="gl-settings">
                <div class="gl-setting">
                  <span>{COPY.sound}</span>
                  <button
                    type="button"
                    class="gl-toggle"
                    aria-pressed={!prefs.muted}
                    onClick={() => update({ muted: !prefs.muted })}
                  >
                    {prefs.muted ? COPY.off : COPY.on}
                  </button>
                </div>
                <div class="gl-setting">
                  <span>{COPY.motion}</span>
                  <button
                    type="button"
                    class="gl-toggle"
                    onClick={() => update({ motion: NEXT_MOTION[prefs.motion] })}
                  >
                    {MOTION_LABEL[prefs.motion]}
                  </button>
                </div>
              </div>
              <button type="button" class="gl-link" onClick={quit}>
                {COPY.quit}
              </button>
            </div>
          </div>
        )}
      </div>

      <p class="gl-live" ref={liveRef} aria-live="polite" />
    </div>
  );
}

function Beats({ at }: { at: number }) {
  return (
    <ol class="gl-beats" aria-label="Pickup, sharpening and return">
      {[COPY.pickupHead, COPY.sharpenHead, COPY.returnHead].map((label, i) => (
        <li
          key={label}
          class={i === at ? "is-on" : i < at ? "is-done" : ""}
          aria-current={i === at ? "step" : undefined}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

function TutorialArt({ step }: { step: number }) {
  if (step === 0)
    return (
      <svg class="gl-tut-art" viewBox="0 0 160 80" aria-hidden="true">
        <circle cx="80" cy="44" r="22" fill="#e2482d" stroke="#1f2620" stroke-width="2.6" />
        <path
          d="M80,22 l-6,-4 l4,-1 l-3,-6 l5,4 l1,-6 l2,6 l5,-4 l-3,6 l4,1 z"
          fill="#5d9440"
          stroke="#1f2620"
          stroke-width="1.5"
        />
        <path
          d="M20,62 Q80,30 140,22"
          stroke="#24604b"
          stroke-width="5"
          fill="none"
          stroke-linecap="round"
          stroke-dasharray="2 9"
        />
        <path
          d="M132,14 L142,22 L130,28"
          stroke="#24604b"
          stroke-width="4"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    );
  if (step === 1)
    return (
      <svg class="gl-tut-art" viewBox="0 0 160 80" aria-hidden="true">
        <rect
          x="14"
          y="28"
          width="132"
          height="24"
          rx="6"
          fill="#fff7e8"
          stroke="#1f2620"
          stroke-width="2.6"
        />
        <rect x="18" y="32" width="52" height="16" rx="3" fill="#e8a76b" />
        <path d="M70,32 L82,48 M86,32 L98,48" stroke="#1f2620" stroke-width="1.5" opacity=".3" />
        <text
          x="80"
          y="22"
          text-anchor="middle"
          font-size="12"
          font-weight="700"
          fill="currentColor"
        >
          EDGE 40% · WORN
        </text>
      </svg>
    );
  return (
    <svg class="gl-tut-art" viewBox="0 0 160 80" aria-hidden="true">
      <path
        d="M30,46 L118,40 Q130,40 134,44 Q120,56 30,54 Z"
        fill="#eef3f5"
        stroke="#1f2620"
        stroke-width="2.6"
        stroke-linejoin="round"
      />
      <rect x="4" y="42" width="30" height="12" rx="5" fill="#1f2620" />
      <path
        d="M80,10 C82,24 84,26 98,28 C84,30 82,32 80,46 C78,32 76,30 62,28 C76,26 78,24 80,10 Z"
        fill="#f2c94c"
        stroke="#1f2620"
        stroke-width="2"
      />
    </svg>
  );
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
const IconSound = () => (
  <Icon d="M4 9h4l5-4v14l-5-4H4z M16 9c1.5 1.5 1.5 4.5 0 6 M18.5 6.5c3 3 3 8 0 11" />
);
const IconMuted = () => <Icon d="M4 9h4l5-4v14l-5-4H4z M16 9l5 6 M21 9l-5 6" />;
const IconPause = () => <Icon d="M8 5v14 M16 5v14" />;
const IconRestart = () => <Icon d="M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4" />;
