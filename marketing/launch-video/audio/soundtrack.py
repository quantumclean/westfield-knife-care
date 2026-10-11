"""Original score and sound design for the launch film, synthesized from scratch.

    python3 audio/soundtrack.py   ->  audio/soundtrack.wav (48 kHz, 16-bit stereo)

Everything is generated here rather than licensed, so there is no rights
question for a homepage or social use. Harmony changes and every sound effect
are placed from ../cues.json, the same file the visuals are timed from, so
hits land on cuts by construction. Deterministic: the same code always
produces the same file. Requires numpy and scipy.

The score is deliberately sparse: a muffled, detuned drone under "Dull.",
silence, then a clean piano chord on the hard cut to "Sharp.", a few
unhurried piano notes over warm pads through the doorstep scenes, and a
resolved chord with a shimmer on the logo.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / "cues.json").read_text())
SR = 48_000
DUR = float(CUES["duration"])
N = int(DUR * SR)
TARGET_LUFS = -16.0
rng = np.random.default_rng(20260925)


# --------------------------------------------------------------------------
# Building blocks
# --------------------------------------------------------------------------

def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def n(name: str) -> int:
    """'A2' -> 45 (MIDI note number)."""
    return 12 * (int(name[-1]) + 1) + NOTE[name[:-1]]


def filt(x: np.ndarray, kind: str, freq, order: int = 4) -> np.ndarray:
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def noise(length: int) -> np.ndarray:
    return rng.standard_normal(length)


def saw(freq: float, length: int, phase: float = 0.0, max_h: int = 40, fm: np.ndarray | None = None) -> np.ndarray:
    """Band-limited sawtooth by additive synthesis; `fm` is a per-sample pitch ratio."""
    ratio = np.ones(length) if fm is None else fm
    ph = 2 * np.pi * np.cumsum(freq * ratio) / SR
    out = np.zeros(length)
    top = max(1, min(max_h, int(15_000 / freq)))
    for k in range(1, top + 1):
        out += np.sin(k * (ph + phase)) / k
    return out * (2 / np.pi)


def fade(length: int, a: float, r: float) -> np.ndarray:
    t = np.arange(length) / SR
    total = length / SR
    return np.clip(t / max(a, 1e-6), 0, 1) * np.clip((total - t) / max(r, 1e-6), 0, 1)


def sine_bell(freqs, decay: float, dur: float) -> np.ndarray:
    length = int(dur * SR)
    t = np.arange(length) / SR
    x = sum(np.sin(2 * np.pi * f * t) * a for f, a in freqs)
    return x * np.exp(-t / decay) * np.minimum(1, t / 0.002)


def sweep_noise(dur: float, f0: float, f1: float, bands: int = 10) -> np.ndarray:
    """Noise through a band-pass whose center glides from f0 to f1."""
    length = int(dur * SR)
    centers = np.geomspace(min(f0, f1), max(f0, f1), bands)
    pos = np.linspace(0, 1, length)
    path = np.log(f0) + (np.log(f1) - np.log(f0)) * pos
    out = np.zeros(length)
    src = noise(length)
    for c in centers:
        band = filt(src, "band", [c / 1.35, min(c * 1.35, SR / 2 - 100)], order=2)
        out += band * np.exp(-((path - np.log(c)) ** 2) / (2 * 0.22**2))
    return out


def smooth_random(length: int, step: float, lo: float = 0.0, hi: float = 1.0) -> np.ndarray:
    """Piecewise-linear random control signal, one new value every `step` seconds."""
    k = int(length / (step * SR)) + 2
    pts = rng.uniform(lo, hi, k)
    return np.interp(np.arange(length) / (step * SR), np.arange(k), pts)


class Bus:
    """A stereo buffer you can place mono or stereo clips into by time."""

    def __init__(self) -> None:
        self.buf = np.zeros((N + SR * 4, 2))

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


# --------------------------------------------------------------------------
# Instruments
# --------------------------------------------------------------------------

def piano(m: int, vel: float = 0.6, dur: float = 4.0, muffle: float | None = None) -> np.ndarray:
    """Additive piano: stretched partials, two detuned strings, double decay, hammer."""
    f0 = midi(m)
    length = int(dur * SR)
    t = np.arange(length) / SR
    out = np.zeros(length)
    inharm = 0.0004
    base_t60 = 7.0 * (261.6 / f0) ** 0.55
    for k in range(1, 16):
        fk = k * f0 * np.sqrt(1 + inharm * k * k)
        if fk > 15_000:
            break
        amp = k ** -1.15 * np.exp(-(k - 1) * (1.05 - vel) * 0.45)
        tau = base_t60 / 6.9 / (1 + 0.45 * (k - 1))
        env = 0.72 * np.exp(-t / tau) + 0.28 * np.exp(-t / (tau * 3.2))
        ph = rng.uniform(0, 2 * np.pi)
        strings = np.sin(2 * np.pi * fk * t + ph) + np.sin(2 * np.pi * fk * 1.00045 * t + ph * 0.7)
        out += amp * strings * 0.5 * env
    hammer = filt(noise(length), "band", [700, 3800], order=2) * np.exp(-t / 0.005) * 0.12
    out = (out + hammer * vel) * np.minimum(1, t / 0.002) * fade(length, 0, 0.25)
    if muffle:
        out = filt(out, "low", muffle, order=2)
    return out * vel


def pad(notes: list[int], dur: float, cutoff: float, attack: float, release: float, wow: float = 0.0) -> np.ndarray:
    """Soft detuned-saw pad; `wow` adds a slow, uneven pitch wobble (in cents)."""
    length = int(dur * SR)
    t = np.arange(length) / SR
    fm = None
    if wow:
        drift = np.sin(2 * np.pi * 0.43 * t) + 0.6 * np.sin(2 * np.pi * 0.71 * t + 1.3)
        fm = 2 ** (wow * drift / 1200)
    out = np.zeros(length)
    for m in notes:
        for det in (-0.08, 0.0, 0.08):
            out += saw(midi(m + det), length, phase=rng.uniform(0, 6.28), max_h=20, fm=fm)
    out /= len(notes) * 3
    out = filt(out, "low", cutoff, order=2)
    return out * fade(length, attack, release)


# --------------------------------------------------------------------------
# Sound design (one generator per cue type in cues.json)
# --------------------------------------------------------------------------

def sfx(kind: str) -> np.ndarray:
    if kind == "thud":  # blade meets tomato / bag meets doormat: soft, heavy
        length = int(0.4 * SR)
        t = np.arange(length) / SR
        f = 52 + 70 * np.exp(-t / 0.03)
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
        soft = filt(noise(length), "low", 450) * np.exp(-t / 0.035) * 0.6
        return np.tanh((body + soft) * 1.2)
    if kind == "drag":  # a dull edge sawing at skin: stick-slip friction, wet
        d = 0.9
        length = int(d * SR)
        t = np.arange(length) / SR
        stick = smooth_random(length, 0.018, 0.1, 1.0) ** 2.2
        grit = filt(noise(length), "band", [350, 1700]) * stick
        squelch = filt(noise(length), "band", [110, 380]) * smooth_random(length, 0.07, 0.2, 1.0) * 0.9
        return (grit + squelch) * np.sin(np.pi * t / d) ** 0.8
    if kind == "hit":  # the hard cut to "Sharp."
        length = int(1.6 * SR)
        t = np.arange(length) / SR
        f = 40 + 90 * np.exp(-t / 0.045)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
        click = filt(noise(length), "high", 3500) * np.exp(-t / 0.003) * 0.7
        air = filt(noise(length), "high", 6500) * np.exp(-t / 0.22) * 0.12
        return np.tanh((sub * 1.1 + click + air) * 1.2)
    if kind == "ting":  # light running down the edge
        return sine_bell([(2637, 0.5), (3951 * 1.004, 0.28), (5274 * 1.01, 0.12)], 0.6, 2.2)
    if kind == "slice":  # one clean stroke, then the tip meets the board
        d = 0.24
        swish = sweep_noise(d, 2200, 9500, bands=8)
        ts = np.arange(len(swish)) / SR
        swish *= np.sin(np.pi * ts / d) ** 2
        tock_len = int(0.25 * SR)
        tt = np.arange(tock_len) / SR
        tock = (np.sin(2 * np.pi * 1150 * tt) * 0.5 + np.sin(2 * np.pi * 2320 * tt) * 0.25) * np.exp(-tt / 0.022)
        tock += filt(noise(tock_len), "band", [1500, 6000]) * np.exp(-tt / 0.004) * 0.6
        k = int(0.26 * SR)
        out = np.zeros(k + tock_len)
        out[: len(swish)] += swish
        out[k : k + tock_len] += tock * 1.3
        return out
    if kind == "tap":  # a slice settling on the board
        length = int(0.12 * SR)
        t = np.arange(length) / SR
        wet = filt(noise(length), "band", [500, 2400]) * np.exp(-t / 0.012)
        body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.025)
        return wet * 0.7 + body * 0.6
    if kind == "lift":  # canvas bag lifted, knives shift inside
        d = 0.65
        cloth = sweep_noise(d, 380, 1600, bands=8)
        t = np.arange(len(cloth)) / SR
        cloth *= np.sin(np.pi * t / d) ** 1.6
        for off in (0.06, 0.14, 0.23):
            b = sine_bell([(rng.uniform(3100, 5200), 0.5), (rng.uniform(6200, 7400), 0.15)], 0.06, 0.2)
            k = int(off * SR)
            cloth[k : k + len(b)] += b * 0.5
        return cloth
    if kind == "morning":  # two small birds
        out = np.zeros(int(1.4 * SR))
        for off, f0, f1, d in ((0.0, 3900, 5200, 0.09), (0.16, 4300, 5600, 0.08), (0.62, 5400, 3800, 0.12), (0.8, 4100, 5000, 0.07)):
            length = int(d * SR)
            t = np.arange(length) / SR
            f = f0 + (f1 - f0) * (t / d) + 180 * np.sin(2 * np.pi * 38 * t)
            chirp = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
            k = int(off * SR)
            out[k : k + length] += chirp
        return out
    if kind == "arrive":  # the bag swings back into frame
        d = 0.62
        x = sweep_noise(d, 1800, 420, bands=8)
        t = np.arange(len(x)) / SR
        return x * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    if kind == "sparkle":  # three sparks, pitched to the G chord underneath
        out = np.zeros(int(1.2 * SR))
        for i, m in enumerate([n("D6"), n("G6"), n("B6")]):
            b = sine_bell([(midi(m), 0.6), (midi(m) * 2.01, 0.15)], 0.3, 0.9)
            k = int(i * 0.11 * SR)
            out[k : k + len(b)] += b
        return out
    if kind == "bloom":  # logo arrives: sub swell and air
        length = int(2.2 * SR)
        t = np.arange(length) / SR
        f = 46 + 30 * np.exp(-t / 0.12)
        sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9) * np.minimum(1, t / 0.02)
        air = filt(noise(length), "band", [2000, 9000]) * np.exp(-t / 0.5) * np.minimum(1, t / 0.08) * 0.1
        return sub * 0.8 + air
    if kind == "shimmer":  # sheen across the logo tile, up a Cmaj9
        out = np.zeros(int(1.6 * SR))
        for i, m in enumerate([n("C6"), n("E6"), n("G6"), n("B6"), n("D7")]):
            b = sine_bell([(midi(m), 0.5), (midi(m) * 2.01, 0.12)], 0.4, 1.1)
            k = int(i * 0.07 * SR)
            out[k : k + len(b)] += b
        return out
    raise ValueError(kind)


SFX_GAIN = {
    "thud": 0.5, "drag": 0.32, "hit": 0.6, "ting": 0.22, "slice": 0.34, "tap": 0.16,
    "lift": 0.3, "morning": 0.05, "arrive": 0.26, "sparkle": 0.1, "bloom": 0.4, "shimmer": 0.12,
}
SFX_VERB = {"hit", "ting", "sparkle", "bloom", "shimmer", "morning"}


# --------------------------------------------------------------------------
# Score
# --------------------------------------------------------------------------

def chord_notes(names: str) -> list[int]:
    return [n(x) for x in names.split()]


# Pad voicing and color per harmony block in cues.json "music".
PAD = {
    "dark": dict(cutoff=380, wow=9.0, gain=0.5),
    "bright": dict(cutoff=2400, wow=0.0, gain=0.28),
    "warm": dict(cutoff=1300, wow=0.0, gain=0.32),
    "resolve": dict(cutoff=1800, wow=0.0, gain=0.34),
}
VOICING = {
    "Am": "A1 E2 A2 C3",
    "C": "C2 G2 E3 B3 D4",
    "F": "F2 C3 A3 E4",
    "G": "G2 D3 B3 A4",
}

# Piano: (time, notes, velocity). Muffled under "Dull.", open afterwards.
DULL_PIANO = [(0.6, "A2", 0.42), (2.65, "F2 C3", 0.34)]
PIANO = [
    (4.5, "C3 G3 C4 E4 G4", 0.85),
    (6.05, "E5", 0.42),
    (6.675, "D5", 0.36),
    (7.3, "G5", 0.4),
    (8.75, "F2", 0.5),
    (9.1, "A4", 0.4),
    (9.725, "C5", 0.36),
    (10.35, "E5", 0.4),
    (10.975, "C5", 0.33),
    (11.6, "A4", 0.36),
    (12.225, "G4", 0.3),
    (13.3, "G2", 0.5),
    (13.6, "B4", 0.42),
    (14.225, "D5", 0.38),
    (14.85, "A5", 0.36),
    (15.475, "G5", 0.4),
    (16.1, "D5", 0.34),
    (16.725, "B4", 0.3),
    (18.0, "C2 G2 C3 E4 G4 B4 D5", 0.8),
    (19.4, "G5", 0.34),
    (20.025, "E5", 0.3),
    (20.65, "C6", 0.28),
]

GAPS = [(4.36, 4.5)]  # hard silence before the cut to "Sharp."
END_FADE = (22.3, 22.9)


def render() -> np.ndarray:
    pads, keys, fx, verb = Bus(), Bus(), Bus(), Bus()

    for block in CUES["music"]:
        mood = PAD[block["mood"]]
        t0, t1 = block["t"], block["until"]
        attack = 1.0 if block["mood"] in ("dark", "resolve") else 0.35
        tail = 0.4 if block["mood"] == "dark" else 1.2
        p = pad(chord_notes(VOICING[block["chord"]]), t1 - t0 + tail, mood["cutoff"], attack, tail, mood["wow"])
        pads.add(t0, p, gain=mood["gain"])
        verb.add(t0, p, gain=mood["gain"] * 0.3)

    for t, notes, vel in DULL_PIANO:
        for m in chord_notes(notes):
            keys.add(t, piano(m, vel, dur=3.5, muffle=900), gain=0.9, pan=(m - 60) / 48)
    for t, notes, vel in PIANO:
        ms = chord_notes(notes)
        ring = 5.0 if len(ms) > 1 else 3.2
        voice = 0.8 / np.sqrt(len(ms))  # a chord should not be N times louder than a note
        for m in ms:
            clip = piano(m, vel, dur=ring)
            keys.add(t, clip, gain=voice, pan=(m - 60) / 40)
            verb.add(t, clip, gain=voice * 0.6)

    for cue in CUES["sfx"]:
        clip = sfx(cue["type"])
        pan = rng.uniform(-0.35, 0.35) if cue["type"] == "tap" else 0.0
        fx.add(cue["t"], clip, gain=SFX_GAIN[cue["type"]], pan=pan)
        if cue["type"] in SFX_VERB:
            verb.add(cue["t"], clip, gain=SFX_GAIN[cue["type"]] * 0.6)

    # Reverb: decaying, decorrelated stereo noise impulse response (a large,
    # soft room: the piano should feel like it is in a quiet space).
    ir_n = int(3.0 * SR)
    it = np.arange(ir_n) / SR
    ir = np.stack([noise(ir_n), noise(ir_n)], axis=1) * np.exp(-it / 0.62)[:, None]
    ir = filt(ir, "low", 5200, order=2)
    ir[: int(0.022 * SR)] = 0
    ir /= np.sqrt((ir**2).sum() / 2)
    wet = np.stack([fftconvolve(verb.out[:, c], ir[:, c])[:N] for c in range(2)], axis=1)

    # Pads only fill the middle; the low end belongs to the piano and impacts.
    mix = filt(pads.out, "high", 75, order=2) + keys.out + fx.out + wet * 0.28

    # Hard silence before the hit, tails included: the cut is felt, not heard.
    for a, b in GAPS:
        i, j = int(a * SR), int(b * SR)
        ramp = int(0.012 * SR)
        mix[i - ramp : i] *= np.linspace(1, 0, ramp)[:, None]
        mix[i:j] = 0

    mix = filt(mix, "high", 30, order=2)
    fade_in = int(0.03 * SR)
    mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    i, j = int(END_FADE[0] * SR), int(END_FADE[1] * SR)
    mix[i:j] *= (np.linspace(1, 0, j - i) ** 1.5)[:, None]
    mix[j:] = 0

    # Loudness-normalize for the web (BS.1770 integrated) with a soft peak
    # ceiling; two passes because the limiter trims a little loudness.
    ceiling = 10 ** (-1.5 / 20)
    for _ in range(2):
        mix = mix * 10 ** ((TARGET_LUFS - integrated_lufs(mix)) / 20)
        over = np.abs(mix) > ceiling * 0.8
        if over.any():
            knee = ceiling * 0.8
            mix = np.where(over, np.sign(mix) * (knee + (ceiling - knee) * np.tanh((np.abs(mix) - knee) / (ceiling - knee))), mix)
    return mix


def integrated_lufs(x: np.ndarray) -> float:
    """ITU-R BS.1770-4 integrated loudness (48 kHz K-weighting, gated)."""
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
