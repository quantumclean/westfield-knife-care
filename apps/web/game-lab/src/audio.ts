/**
 * Every sound is synthesized at runtime with Web Audio (design section 2.9):
 * no audio files, no licensing question. The context is created on the Start
 * press (a user gesture, which iOS requires). Sound is never the only cue.
 */

type Ctor = typeof AudioContext;

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const MAX_VOICES = 12;

export type Sound =
  | "swish"
  | "cut"
  | "wet"
  | "thud"
  | "skid"
  | "clang"
  | "notch"
  | "warn"
  | "sharpen"
  | "restored"
  | "glint"
  | "combo"
  | "start1"
  | "start2"
  | "gone"
  | "results";

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = 0;
  muted = false;

  /** Create or resume the context. Call from a click or touch handler. */
  unlock(): void {
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      // Respect the iPhone's silent switch and don't interrupt the visitor's own audio.
      if (nav.audioSession) nav.audioSession.type = "ambient";
    } catch {
      /* not supported */
    }
    if (!this.ctx) {
      const AC: Ctor | undefined =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const comp = this.ctx.createDynamicsCompressor();
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(comp);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {});
  }

  close(): void {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  play(sound: Sound, arg = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== "running") return;
    if (this.voices >= MAX_VOICES) return;
    const t = ctx.currentTime;
    switch (sound) {
      case "swish":
        this.noiseBurst(t, 0.12, "bandpass", 2000, 6000, 0.12 * Math.min(1, arg / 2), 1.2);
        break;
      case "cut": {
        this.noiseBurst(t, 0.05, "highpass", 3000, 3000, 0.22);
        const step = PENTA[Math.min(PENTA.length - 1, Math.max(0, Math.floor(arg)))]!;
        this.tone(t, "sine", 1400 * Math.pow(2, step / 12), 0.16, 0.16);
        break;
      }
      case "wet":
        this.noiseBurst(t, 0.09, "lowpass", 700, 400, 0.3);
        this.tone(t, "sine", 320, 0.12, 0.2, 110);
        break;
      case "thud":
        this.noiseBurst(t, 0.09, "lowpass", 320, 200, 0.55);
        this.tone(t, "sine", 95, 0.12, 0.35, 60);
        break;
      case "notch":
        this.noiseBurst(t, 0.06, "bandpass", 1500, 900, 0.25, 2);
        this.tone(t, "triangle", 440, 0.08, 0.1, 300);
        break;
      case "skid":
        this.noiseBurst(t, 0.26, "bandpass", 1600, 900, 0.22, 4);
        this.tone(t, "sawtooth", 180, 0.2, 0.04, 140);
        break;
      case "clang":
        this.tone(t, "sine", 520, 0.45, 0.18);
        this.tone(t, "sine", 1310, 0.35, 0.12);
        this.tone(t, "sine", 1840, 0.25, 0.06);
        break;
      case "warn":
        this.tone(t, "triangle", 330, 0.16, 0.16);
        this.tone(t + 0.17, "triangle", 262, 0.2, 0.16);
        break;
      case "sharpen": {
        this.noiseBurst(t, 0.12, "bandpass", 3500, 5500, 0.2, 1.5);
        const scale = [262, 294, 330, 349, 392, 440, 494, 523];
        this.tone(t, "triangle", scale[Math.min(7, Math.max(0, arg - 1))]!, 0.22, 0.12);
        break;
      }
      case "restored":
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          this.tone(t + i * 0.09, "triangle", f, 0.6, 0.14),
        );
        [2093, 2637].forEach((f, i) => this.tone(t + 0.45 + i * 0.07, "sine", f, 0.7, 0.05));
        break;
      case "glint":
        this.tone(t, "sine", 1568, 0.18, 0.1);
        this.tone(t + 0.06, "sine", 2093, 0.22, 0.1);
        break;
      case "combo": {
        const n = Math.min(6, Math.max(2, arg));
        for (let i = 0; i < n; i++)
          this.tone(t + i * 0.05, "triangle", 880 * Math.pow(2, PENTA[i]! / 12), 0.15, 0.08);
        break;
      }
      case "start1":
        [392, 330, 392].forEach((f, i) => this.tone(t + i * 0.12, "triangle", f, 0.18, 0.12));
        break;
      case "start2":
        [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.08, "triangle", f, 0.2, 0.13));
        break;
      case "gone":
        [330, 294, 247, 196].forEach((f, i) => this.tone(t + i * 0.16, "triangle", f, 0.25, 0.12));
        break;
      case "results":
        [523, 659, 784, 659, 1047].forEach((f, i) =>
          this.tone(t + i * 0.11, "triangle", f, 0.25, 0.12),
        );
        break;
    }
  }

  private voice(node: AudioScheduledSourceNode): void {
    this.voices++;
    node.onended = () => {
      this.voices--;
    };
  }

  private tone(
    t: number,
    type: OscillatorType,
    freq: number,
    dur: number,
    gain: number,
    endFreq?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    this.voice(osc);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(
    t: number,
    dur: number,
    type: BiquadFilterType,
    f0: number,
    f1: number,
    gain: number,
    q = 0.8,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master!);
    this.voice(src);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}
