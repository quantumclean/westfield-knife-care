"""Original soundtrack for the launch video, synthesized from scratch.

    python3 audio/soundtrack.py   ->  audio/soundtrack.wav (48 kHz, 16-bit stereo)

Music and sound effects are generated here rather than licensed, so there is
no rights question for a homepage or social use. Every sound effect is placed
from ../cues.json, the same file the visuals are timed from, so hits land on
cuts by construction. Deterministic: the same code always produces the same
file. Requires numpy and scipy.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / "cues.json").read_text())
SR = 48_000
BPM = CUES["bpm"]
BEAT = 60 / BPM
BAR = 4 * BEAT
DUR = float(CUES["duration"])
N = int(DUR * SR)
rng = np.random.default_rng(20260925)


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------

def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x: np.ndarray, kind: str, freq, order: int = 4) -> np.ndarray:
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def saw(freq: float, n: int, phase: float = 0.0, max_h: int = 40) -> np.ndarray:
    """Band-limited sawtooth by additive synthesis (no aliasing)."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    top = max(1, min(max_h, int(15_000 / freq)))
    for k in range(1, top + 1):
        out += np.sin(2 * np.pi * k * freq * t + k * phase) / k
    return out * (2 / np.pi)


def env_adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    t = np.arange(n) / SR
    total = n / SR
    e = np.where(t < a, t / max(a, 1e-6), 1.0)
    e = np.where((t >= a) & (t < a + d), 1 - (1 - s) * (t - a) / max(d, 1e-6), e)
    e = np.where(t >= a + d, s, e)
    rel_start = max(total - r, a)
    e = np.where(t >= rel_start, e * np.clip(1 - (t - rel_start) / max(r, 1e-6), 0, 1), e)
    return e


class Bus:
    """A stereo buffer you can place mono or stereo clips into by time."""

    def __init__(self) -> None:
        self.buf = np.zeros((N + SR * 3, 2))

    def add(self, t: float, clip: np.ndarray, gain: float = 1.0, pan: float = 0.0) -> None:
        i = int(round(t * SR))
        if i >= N:
            return
        if clip.ndim == 1:
            left = np.cos((pan + 1) * np.pi / 4)
            right = np.sin((pan + 1) * np.pi / 4)
            clip = np.stack([clip * left * 1.414, clip * right * 1.414], axis=1)
        j = min(i + len(clip), len(self.buf))
        self.buf[i:j] += clip[: j - i] * gain

    @property
    def out(self) -> np.ndarray:
        return self.buf[:N]


def noise(n: int) -> np.ndarray:
    return rng.standard_normal(n)


# --------------------------------------------------------------------------
# Arrangement
# --------------------------------------------------------------------------

CHORDS = {
    "C": [48, 55, 60, 64, 67],
    "G": [50, 55, 59, 62, 67],
    "Am": [52, 57, 60, 64, 69],
    "F": [53, 57, 60, 65, 69],
    "E": [52, 56, 59, 64, 68],
}
ROOTS = {"C": 36, "G": 31, "Am": 33, "F": 29, "E": 28}
MAIN = ["C", "G", "Am", "F"]


def chord_at_bar(b: int) -> list[tuple[str, float]]:
    """(chord, length in beats) for each bar."""
    if b <= 1:
        return [("Am", 4)]
    if b == 2:
        return [("F", 4)]
    if b == 3:
        return [("E", 4)]
    if 4 <= b <= 18:
        return [(MAIN[(b - 4) % 4], 4)]
    if b == 19:
        return [("Am", 4)]
    if b == 20:
        return [("F", 4)]
    if b == 21:
        return [("C", 4)]
    if b == 22:
        return [("G", 4)]
    if b == 23:
        return [("F", 2), ("G", 2)]
    return [("C", 4)]


BARS = int(DUR / BAR)  # 25


def section(b: int) -> str:
    if b <= 1:
        return "intro"
    if b <= 3:
        return "tension"
    if b <= 18:
        return "main"
    if b <= 20:
        return "break"
    if b <= 23:
        return "final"
    return "outro"


GAPS = [(7.72, 8.0), (41.86, 42.0)]  # hard silences before each drop


def in_gap(t: float) -> bool:
    return any(a <= t < b for a, b in GAPS)


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------

def kick() -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 44 + 115 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.26)
    click = filt(noise(n), "high", 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6)


def clap() -> np.ndarray:
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0.0, 0.011, 0.022):
        e += np.where(t >= off, np.exp(-(t - off) / 0.006), 0)
    e += np.where(t >= 0.03, np.exp(-(t - 0.03) / 0.11) * 0.8, 0)
    return filt(noise(n), "band", [900, 3200]) * e


def hat(open_: bool = False) -> np.ndarray:
    n = int((0.22 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return filt(noise(n), "high", 7000) * np.exp(-t / (0.09 if open_ else 0.022))


def crash() -> np.ndarray:
    n = int(2.2 * SR)
    t = np.arange(n) / SR
    x = filt(noise(n), "high", 4500) * np.exp(-t / 0.7)
    return x + filt(noise(n), "band", [2500, 6000]) * np.exp(-t / 0.25) * 0.5


def pad_bar(chord: str, dur: float, bright: float) -> np.ndarray:
    n = int(dur * SR)
    out = np.zeros(n)
    for m in CHORDS[chord]:
        for det in (-0.11, 0.0, 0.11):
            out += saw(midi(m + det), n, phase=rng.uniform(0, 6.28), max_h=24)
    out /= len(CHORDS[chord]) * 3
    out = filt(out, "low", 900 + 2600 * bright, order=2)
    return out * env_adsr(n, 0.18, 0.4, 0.85, 0.25)


def bass_note(root: int, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = midi(root + 12)
    x = np.sin(2 * np.pi * f * t) * 0.8 + saw(f, n, max_h=10) * 0.35
    x = filt(x, "low", 420, order=2)
    return np.tanh(x * 1.4) * env_adsr(n, 0.005, 0.08, 0.7, 0.05)


def pluck(freq: float, dur: float = 0.3) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = saw(freq, n, max_h=18) * 0.6 + np.sin(2 * np.pi * freq * 2 * t) * 0.25
    x = filt(x, "low", 3800, order=2)
    return x * np.exp(-t / 0.11) * np.minimum(1, t / 0.003)


def sine_bell(freqs, decay: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * t) * a for f, a in freqs)
    return x * np.exp(-t / decay) * np.minimum(1, t / 0.002)


def sweep_noise(dur: float, f0: float, f1: float, bands: int = 10) -> np.ndarray:
    """Noise through a band-pass whose center glides from f0 to f1."""
    n = int(dur * SR)
    centers = np.geomspace(min(f0, f1), max(f0, f1), bands)
    pos = np.linspace(0, 1, n)
    path = np.log(f0) + (np.log(f1) - np.log(f0)) * pos
    out = np.zeros(n)
    src = noise(n)
    for c in centers:
        band = filt(src, "band", [c / 1.35, min(c * 1.35, SR / 2 - 100)], order=2)
        w = np.exp(-((path - np.log(c)) ** 2) / (2 * 0.22**2))
        out += band * w
    return out


# --------------------------------------------------------------------------
# Sound effects
# --------------------------------------------------------------------------

def sfx(kind: str) -> tuple[np.ndarray, float]:
    """Return (clip, lead) where lead shifts the clip earlier so its peak hits the cue."""
    if kind == "tick":
        return sine_bell([(2200, 0.6), (3300, 0.3)], 0.018, 0.08), 0.0
    if kind == "whoosh":
        d = 0.55
        x = sweep_noise(d, 300, 4200)
        t = np.arange(len(x)) / SR
        e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2.2
        return x * e, 0.0
    if kind == "swoosh":
        d = 0.38
        x = sweep_noise(d, 1200, 6000, bands=8)
        t = np.arange(len(x)) / SR
        return x * np.sin(np.pi * t / d) ** 2, 0.05
    if kind == "impact":
        d = 2.4
        n = int(d * SR)
        t = np.arange(n) / SR
        f = 38 + 60 * np.exp(-t / 0.08)
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
        body = filt(noise(n), "low", 900) * np.exp(-t / 0.18) * 0.6
        return np.tanh((boom * 1.2 + body) * 1.3), 0.0
    if kind == "shimmer":
        out = np.zeros(int(1.4 * SR))
        for i, m in enumerate([84, 88, 91, 96, 100]):
            b = sine_bell([(midi(m), 0.5), (midi(m) * 2.01, 0.12)], 0.35, 1.0)
            k = int(i * 0.06 * SR)
            out[k : k + len(b)] += b
        return out, 0.0
    if kind == "pop":
        n = int(0.12 * SR)
        t = np.arange(n) / SR
        f = 560 + 520 * np.exp(-t / 0.018)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.035), 0.0
    if kind == "click":
        n = int(0.04 * SR)
        t = np.arange(n) / SR
        x = np.sign(np.sin(2 * np.pi * 1700 * t)) * 0.5 + filt(noise(n), "high", 3000) * 0.4
        return filt(x, "low", 6000) * np.exp(-t / 0.006), 0.0
    if kind == "confetti":
        out = np.zeros(int(0.8 * SR))
        for _ in range(9):
            b = sine_bell([(rng.uniform(2400, 5200), 0.4)], 0.05, 0.25)
            k = int(rng.uniform(0, 0.45) * SR)
            out[k : k + len(b)] += b
        return out, 0.0
    if kind == "squish":
        n = int(0.4 * SR)
        t = np.arange(n) / SR
        wet = filt(noise(n), "band", [250, 1400]) * np.exp(-t / 0.08)
        f = 320 * np.exp(-t / 0.12) + 90
        blub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.1)
        return wet * 0.8 + blub * 0.7, 0.0
    if kind == "slip":
        x = sweep_noise(0.3, 6000, 1800, bands=8)
        t = np.arange(len(x)) / SR
        return x * np.exp(-t / 0.09), 0.0
    if kind == "drive":
        d = 1.0
        n = int(d * SR)
        t = np.arange(n) / SR
        rumble = filt(noise(n), "low", 260) * 1.6
        f = 110 - 30 * t / d
        engine = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.6 + 0.4 * np.sin(2 * np.pi * 23 * t))
        e = np.sin(np.pi * t / d) ** 1.5
        return (rumble + engine * 0.5) * e, 0.0
    if kind == "scrape":
        d = 0.46
        n = int(d * SR)
        t = np.arange(n) / SR
        grit = filt(noise(n), "band", [1400, 5200]) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 70 * t)))
        return grit * np.sin(np.pi * t / d) ** 1.4, 0.0
    if kind == "ting":
        return sine_bell([(2637, 0.5), (3951 * 1.004, 0.28), (5274 * 1.01, 0.12)], 0.55, 2.0), 0.0
    if kind == "slice":
        x = sweep_noise(0.2, 2500, 9000, bands=8)
        t = np.arange(len(x)) / SR
        return x * np.sin(np.pi * t / 0.2) ** 2, 0.08
    raise ValueError(kind)


SFX_GAIN = {
    "tick": 0.18, "whoosh": 0.28, "swoosh": 0.2, "impact": 0.9, "shimmer": 0.16,
    "pop": 0.22, "click": 0.2, "confetti": 0.12, "squish": 0.45, "slip": 0.3,
    "drive": 0.35, "scrape": 0.22, "ting": 0.26, "slice": 0.3,
}


# --------------------------------------------------------------------------
# Render
# --------------------------------------------------------------------------

def render() -> np.ndarray:
    drums, bass, pad, arp, fxb, verb_send = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()
    K, CL, CH, OH, CR = kick(), clap(), hat(False), hat(True), crash()
    kick_times: list[float] = []

    for b in range(BARS):
        t0 = b * BAR
        sec = section(b)
        # Harmony
        pos = t0
        for chord, beats in chord_at_bar(b):
            dur = beats * BEAT
            bright = {"intro": 0.05, "tension": 0.2, "main": 0.7, "break": 0.45, "final": 0.9, "outro": 0.6}[sec]
            if sec == "intro":
                bright = 0.05 + 0.2 * (b + (pos - t0) / BAR) / 2
            pdur = dur + (1.6 if sec == "outro" else 0.12)
            p = pad_bar(chord, pdur, bright)
            pad.add(pos, p, gain=0.55 if sec != "intro" else 0.42)
            verb_send.add(pos, p, gain=0.25)
            if sec in ("tension", "main", "final"):
                for i in range(int(beats * 2)):
                    bt = pos + i * BEAT / 2
                    if in_gap(bt):
                        continue
                    bass.add(bt, bass_note(ROOTS[chord], BEAT / 2 * 0.92), gain=0.5 if sec != "tension" else 0.35)
            if sec in ("main", "break", "final"):
                tones = [m + 12 for m in CHORDS[chord][1:]]
                pattern = [0, 1, 2, 3, 2, 1, 3, 2]
                for i in range(int(beats * 4)):
                    bt = pos + i * BEAT / 4
                    if in_gap(bt):
                        continue
                    note = tones[pattern[i % len(pattern)]]
                    arp.add(bt, pluck(midi(note)), gain=0.13 if sec != "break" else 0.17, pan=-0.35 if i % 2 else 0.35)
            if sec == "outro":
                arp.add(pos, pluck(midi(72), 1.5), gain=0.2)
            pos += dur

        # Drums
        for beat in range(4):
            bt = t0 + beat * BEAT
            if in_gap(bt):
                continue
            if sec in ("main", "final"):
                drums.add(bt, K, gain=0.95)
                kick_times.append(bt)
                if beat in (1, 3):
                    drums.add(bt, CL, gain=0.42)
                drums.add(bt + BEAT / 2, OH if beat % 2 else CH, gain=0.16 if beat % 2 else 0.22)
                for s16 in (1, 3):
                    drums.add(bt + s16 * BEAT / 4, CH, gain=0.1, pan=0.3)
            elif sec == "tension":
                if beat in (0, 2):
                    drums.add(bt, K, gain=0.7)
                    kick_times.append(bt)
                drums.add(bt + BEAT / 2, CH, gain=0.14)
            elif sec in ("intro", "break"):
                drums.add(bt + BEAT / 2, CH, gain=0.07 if sec == "intro" else 0.1)

    # Crashes on the drops and the last downbeat
    for t in (8.0, 24.0, 42.0, 48.0):
        drums.add(t, CR, gain=0.28)
        verb_send.add(t, CR, gain=0.1)

    # Risers into both drops
    for start, end in ((6.0, 7.72), (40.5, 41.86)):
        d = end - start
        x = sweep_noise(d, 400, 9000, bands=12)
        t = np.arange(len(x)) / SR
        rise = (t / d) ** 2.2
        f = 110 * 2 ** (3 * t / d)
        tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
        fxb.add(start, (x * 0.8 + tone) * rise, gain=0.35)

    # Sound effects from the cue list
    for cue in CUES["sfx"]:
        kind = cue["type"]
        if kind == "typing":
            t = cue["t"]
            while t < cue["until"]:
                clip = sine_bell([(rng.uniform(1800, 2600), 0.5)], 0.01, 0.05)
                fxb.add(t, clip, gain=0.11, pan=rng.uniform(-0.3, 0.3))
                t += rng.uniform(0.045, 0.075)
            continue
        clip, lead = sfx(kind)
        fxb.add(max(0.0, cue["t"] - lead), clip, gain=SFX_GAIN[kind])
        if kind in ("ting", "shimmer", "impact", "whoosh"):
            verb_send.add(max(0.0, cue["t"] - lead), clip, gain=SFX_GAIN[kind] * 0.5)

    # Sidechain pump on pad and bass
    t = np.arange(N) / SR
    duck = np.ones(N)
    for kt in kick_times:
        i = int(kt * SR)
        seg = t[i : i + int(0.3 * SR)] - kt
        duck[i : i + len(seg)] = np.minimum(duck[i : i + len(seg)], 1 - 0.55 * np.exp(-seg / 0.09))
    duck2 = duck[:, None]

    # Reverb: decaying, decorrelated stereo noise impulse response
    ir_n = int(1.8 * SR)
    it = np.arange(ir_n) / SR
    ir = np.stack([noise(ir_n), noise(ir_n)], axis=1) * np.exp(-it / 0.42)[:, None]
    ir = filt(ir, "low", 6000, order=2)
    ir[: int(0.015 * SR)] = 0
    ir /= np.sqrt((ir**2).sum() / 2)
    wet = np.stack([fftconvolve(verb_send.out[:, c], ir[:, c])[:N] for c in range(2)], axis=1)

    mix = (
        drums.out * 1.0
        + bass.out * duck2 * 1.0
        + pad.out * duck2 * 0.9
        + arp.out * 0.9
        + fxb.out * 1.0
        + wet * 0.22
    )

    # Hard silence in the pre-drop gaps (tails included) for the "cut" feel.
    for a, b in GAPS:
        i, j = int(a * SR), int(b * SR)
        ramp = int(0.01 * SR)
        mix[i - ramp : i] *= np.linspace(1, 0, ramp)[:, None]
        mix[i:j] = 0

    # Gentle bus glue, then fade edges for a seamless homepage loop.
    mix = filt(mix, "high", 28, order=2)
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    fade_in = int(0.03 * SR)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    fo_start = int(48.9 * SR)
    mix[fo_start:] *= np.linspace(1, 0, N - fo_start)[:, None] ** 1.5
    # Loudness-normalize for the web (BS.1770 integrated), with a peak ceiling.
    mix = mix * 10 ** ((TARGET_LUFS - integrated_lufs(mix)) / 20)
    peak = np.abs(mix).max()
    ceiling = 10 ** (-1.5 / 20)
    if peak > ceiling:
        mix = mix / peak * ceiling
    return mix


TARGET_LUFS = -16.0


def integrated_lufs(x: np.ndarray) -> float:
    """ITU-R BS.1770-4 integrated loudness (48 kHz K-weighting, gated)."""
    from scipy.signal import lfilter

    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    k = lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)
    block, step = int(0.4 * SR), int(0.1 * SR)
    z = np.array([(k[i : i + block] ** 2).mean(axis=0).sum() for i in range(0, len(k) - block, step)])
    loud = -0.691 + 10 * np.log10(z + 1e-12)
    z_abs = z[loud > -70]
    rel = -0.691 + 10 * np.log10(z_abs.mean()) - 10
    gated = z_abs[(-0.691 + 10 * np.log10(z_abs + 1e-12)) > rel]
    return float(-0.691 + 10 * np.log10(gated.mean()))


def main() -> None:
    mix = render()
    out = ROOT / "audio" / "soundtrack.wav"
    wavfile.write(out, SR, (mix * 32767).astype(np.int16))
    peak_db = 20 * np.log10(np.abs(mix).max())
    print(f"wrote {out} — {DUR:.0f}s, {integrated_lufs(mix):.1f} LUFS integrated, peak {peak_db:.1f} dBFS")


if __name__ == "__main__":
    main()
