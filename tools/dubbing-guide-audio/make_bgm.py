"""A.i영화더빙 음성 안내 배경음악 합성 / Background music synth for the dubbing voice guide (2026-10-27)

저작권 걱정 없는 «직접 합성» 배경음악 — 밝고 잔잔한 우쿨렐레풍 뜯는 소리 + 부드러운 패드.
Self-synthesised (royalty-free) music: soft plucked arpeggio (Karplus-Strong) + warm pad.

사용 / Usage: python3 make_bgm.py <초 seconds> <out.wav>
"""
import sys
import wave
import numpy as np

SR = 44100
BPM = 92
BEAT = 60 / BPM
# C – G – Am – F (I–V–vi–IV), 한 코드 = 4박 / one chord per bar
CHORDS = [
    [60, 64, 67, 72],  # C
    [55, 59, 62, 67],  # G
    [57, 60, 64, 69],  # Am
    [53, 57, 60, 65],  # F
]
ARP = [0, 1, 2, 3, 2, 1, 2, 3]   # 8분음표 뜯는 순서 / eighth-note pattern


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def pluck(freq, dur, rng):
    """Karplus-Strong 뜯는 소리 / plucked string"""
    n = int(SR * dur)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * np.linspace(1, 0.2, n)


def pad(notes, dur):
    t = np.arange(int(SR * dur)) / SR
    s = sum(np.sin(2 * np.pi * hz(m - 12) * t) + 0.3 * np.sin(2 * np.pi * hz(m) * t * 1.003) for m in notes[:3])
    env = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    return s * env / 3


def bar(chord, rng):
    dur = BEAT * 4
    x = 0.35 * pad(chord, dur)
    step = BEAT / 2
    for k, idx in enumerate(ARP):
        p = pluck(hz(chord[idx]), step * 2.5, rng) * (0.55 if k % 2 else 0.75)
        a = int(k * step * SR)
        b = min(len(x), a + len(p))
        x[a:b] += p[: b - a]
    return x


def main():
    secs, out = float(sys.argv[1]), sys.argv[2]
    rng = np.random.default_rng(7)   # 늘 같은 음악 / deterministic
    loop = np.concatenate([bar(c, rng) for c in CHORDS])
    reps = int(np.ceil(secs * SR / len(loop)))
    y = np.tile(loop, reps)[: int(secs * SR)]
    # 아주 약한 잔향 / light echo
    d = int(0.23 * SR)
    y[d:] += 0.25 * y[:-d]
    fade = int(2.5 * SR)
    y[:fade] *= np.linspace(0, 1, fade)
    y[-fade:] *= np.linspace(1, 0, fade)
    y = y / np.max(np.abs(y)) * 0.8
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())


if __name__ == '__main__':
    main()
