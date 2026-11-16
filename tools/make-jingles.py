#!/usr/bin/env python3
"""Make the Vice Ident jingle candidates (original, synthesised here; no samples).
   python3 tools/make-jingles.py OUTDIR  -> OUTDIR/jingle-a.wav, -b.wav, -c.wav (44.1 kHz mono, ~2.8 s)
A "Sunset": a soft detuned-saw Fmaj9 pad swelling under a rising FM-bell arpeggio.
B "Chime":  three electric-piano (FM) notes falling to a held chord, like an 80s station ident.
C "Neon":   a gated-reverb drum hit and a bright synth-brass stab, then a short bell tail."""
import math, random, struct, sys, wave

SR = 44100
LEN = 2.8
N = int(SR * LEN)
random.seed(84)


def hz(note):  # MIDI note -> Hz
    return 440.0 * 2 ** ((note - 69) / 12)


def env(t, a, d, s, r, length):  # ADSR, times in seconds
    if t < a: return t / a
    if t < a + d: return 1 - (1 - s) * (t - a) / d
    if t < length: return s
    return max(0.0, s * (1 - (t - length) / r))


def add(buf, start, samples):
    i0 = int(start * SR)
    for i, v in enumerate(samples):
        if 0 <= i0 + i < N: buf[i0 + i] += v


def bell(note, dur, amp, ratio=2.0, index=2.2):  # 2-op FM bell / electric piano
    f = hz(note); out = []
    for i in range(int(dur * SR)):
        t = i / SR
        e = math.exp(-t * 3.2); ie = index * math.exp(-t * 5)
        out.append(amp * e * math.sin(2 * math.pi * f * t + ie * math.sin(2 * math.pi * f * ratio * t)))
    return out


def saw_pad(notes, dur, amp, attack=0.9, release=0.9, cutoff=1800):
    out = [0.0] * int((dur + release) * SR); lp = 0.0
    a = 1 - math.exp(-2 * math.pi * cutoff / SR)
    ph = {}
    for i in range(len(out)):
        t = i / SR; s = 0.0
        for n in notes:
            for det in (-0.12, 0.12):
                k = (n, det); f = hz(n + det)
                ph[k] = (ph.get(k, random.random()) + f / SR) % 1.0
                s += 2 * ph[k] - 1
        s /= len(notes) * 2
        lp += a * (s - lp)
        out[i] = amp * env(t, attack, 0.3, 0.8, release, dur) * lp
    return out


def noise_hit(dur, amp):  # snare-ish: noise burst, gated (cut hard at the end)
    out = []
    for i in range(int(dur * SR)):
        t = i / SR
        out.append(amp * (random.random() * 2 - 1) * (math.exp(-t * 9) * 0.6 + 0.4) * (1 if t < dur - 0.01 else 0))
    return out


def brass(notes, dur, amp):  # bright saw stab with a fast filter sweep
    out = []; lp = 0.0; ph = {}
    for i in range(int(dur * SR)):
        t = i / SR
        cutoff = 600 + 4200 * math.exp(-t * 6)
        a = 1 - math.exp(-2 * math.pi * cutoff / SR); s = 0.0
        for n in notes:
            f = hz(n); ph[n] = (ph.get(n, 0) + f / SR) % 1.0; s += 2 * ph[n] - 1
        lp += a * (s / len(notes) - lp)
        out.append(amp * env(t, 0.01, 0.25, 0.55, 0.5, dur - 0.5) * lp)
    return out


def reverb(buf, mix=0.28):  # a few feedback combs, enough for a roomy 80s tail
    out = buf[:]
    for d, g in ((1557, .78), (1617, .76), (1491, .77), (1422, .75)):
        c = [0.0] * N
        for i in range(N):
            c[i] = buf[i] + (g * c[i - d] if i >= d else 0)
        for i in range(N): out[i] += mix * c[i] / 4
    return out


def finish(buf, path):
    buf = reverb(buf)
    peak = max(abs(v) for v in buf) or 1
    fade = int(0.25 * SR)
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        frames = bytearray()
        for i, v in enumerate(buf):
            v = v / peak * 0.85
            if i > N - fade: v *= (N - i) / fade
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))


def a():
    b = [0.0] * N
    add(b, 0.0, saw_pad([53, 57, 60, 64, 67], 1.7, 0.55))           # F A C E G
    for k, n in enumerate([72, 76, 79, 84]):                          # C E G C, rising
        add(b, 0.35 + k * 0.22, bell(n, 1.8, 0.32))
    return b


def b_():
    b = [0.0] * N
    for k, n in enumerate([79, 76, 72]):                              # G E C, falling
        add(b, k * 0.28, bell(n, 1.6, 0.42, ratio=1.0, index=1.6))
    add(b, 0.84, saw_pad([48, 55, 60, 64], 1.2, 0.35, attack=0.25))
    add(b, 0.84, bell(67, 1.9, 0.18, ratio=1.0, index=1.2))
    return b


def c():
    b = [0.0] * N
    add(b, 0.0, noise_hit(0.32, 0.5))
    add(b, 0.0, brass([57, 60, 64, 69], 1.1, 0.6))                    # A minor stab
    add(b, 0.55, brass([53, 60, 65, 69], 1.2, 0.5))                   # resolves to F
    add(b, 0.55, bell(81, 1.8, 0.2))
    return b


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, fn in (("a", a), ("b", b_), ("c", c)):
        finish(fn(), f"{out}/jingle-{name}.wav")
        print(f"{out}/jingle-{name}.wav")
