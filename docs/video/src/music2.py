"""망고아이 2분 필름 배경음악 — 큐 시트대로 8구간 편성.
BPM 96 / C 장조 / 44.1kHz 스테레오. 전부 합성이라 저작권 문제 없음."""
import numpy as np, wave, sys

import timing as T
SR = 44100
DUR = T.TOTAL
BPM = 100.0
BEAT = 60.0 / BPM            # 0.625s
BAR = BEAT * 4               # 2.5s
N = int(SR * DUR)
t = np.arange(N) / SR

def note(name, octv):
    idx = {"C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11}[name]
    return 440.0 * 2 ** ((idx - 9) / 12 + (octv - 4))

# I - vi - IV - V, 한 마디씩 (10초 순환)
PROG = [("C", ["C","E","G"]), ("A", ["A","C","E"]), ("F", ["F","A","C"]), ("G", ["G","B","D"])]

def env_ramp(a, b, fade=1.2):
    """a초부터 b초까지 1, 양끝 fade초 동안 부드럽게."""
    e = np.zeros(N)
    ia, ib = int(a * SR), int(b * SR)
    e[ia:ib] = 1.0
    f = int(fade * SR)
    if f > 0:
        up = np.linspace(0, 1, f) ** 2
        e[ia:ia + f] *= up
        e[max(ia, ib - f):ib] *= up[::-1][:ib - max(ia, ib - f)]
    return e

def softsaw(freq, n_harm=6):
    o = np.zeros(N)
    for h in range(1, n_harm + 1):
        o += np.sin(2 * np.pi * freq * h * t + h * 0.7) / (h ** 1.6)
    return o

# ── 패드 (코드) ───────────────────────────────────────────────
pad = np.zeros(N)
bar_i = 0
tt = 0.0
while tt < DUR:
    root, chord = PROG[bar_i % 4]
    i0, i1 = int(tt * SR), min(N, int((tt + BAR) * SR))
    seg = np.arange(i1 - i0) / SR
    a = np.minimum(seg / 0.5, 1.0) * np.minimum((BAR - seg) / 0.6, 1.0)
    a = np.clip(a, 0, 1)
    for k, nm in enumerate(chord):
        f = note(nm, 4 if k else 3)
        pad[i0:i1] += (np.sin(2 * np.pi * f * seg) * 0.55 +
                       np.sin(2 * np.pi * f * 2 * seg) * 0.14) * a
    tt += BAR; bar_i += 1
pad /= np.max(np.abs(pad)) + 1e-9

# ── 저음 드론 (문제 구간의 «비어 있음») ────────────────────────
drone = (np.sin(2 * np.pi * note("A", 1) * t) * 0.7 +
         np.sin(2 * np.pi * note("A", 2) * t) * 0.3 +
         np.sin(2 * np.pi * note("E", 2) * t) * 0.18)
drone *= 1 + 0.06 * np.sin(2 * np.pi * 0.13 * t)

# ── 베이스 ────────────────────────────────────────────────────
bass = np.zeros(N)
tt, bar_i = 0.0, 0
while tt < DUR:
    root = PROG[bar_i % 4][0]
    f = note(root, 2)
    for b in (0, 2):                       # 1박, 3박
        s = tt + b * BEAT
        i0, i1 = int(s * SR), min(N, int((s + BEAT * 1.9) * SR))
        seg = np.arange(i1 - i0) / SR
        a = np.exp(-seg * 2.2)
        bass[i0:i1] += (np.sin(2 * np.pi * f * seg) + 0.25 * np.sin(2 * np.pi * f * 2 * seg)) * a
    tt += BAR; bar_i += 1
bass /= np.max(np.abs(bass)) + 1e-9

# ── 아르페지오 ────────────────────────────────────────────────
arp = np.zeros(N)
tt, bar_i = 0.0, 0
while tt < DUR:
    chord = PROG[bar_i % 4][1]
    for s16 in range(8):                   # 8분음표 8개
        nm = chord[[0, 1, 2, 1, 2, 1, 0, 1][s16]]
        f = note(nm, 5 if s16 % 4 in (1, 2) else 4)
        s = tt + s16 * BEAT / 2
        i0, i1 = int(s * SR), min(N, int((s + 0.42) * SR))
        seg = np.arange(i1 - i0) / SR
        a = np.exp(-seg * 9.0)
        arp[i0:i1] += (np.sin(2 * np.pi * f * seg) * 0.8 +
                       np.sin(2 * np.pi * f * 3 * seg) * 0.12) * a
    tt += BAR; bar_i += 1
arp /= np.max(np.abs(arp)) + 1e-9

# ── 킥 / 클랩 / 하이햇 ────────────────────────────────────────
kick = np.zeros(N); clap = np.zeros(N); hat = np.zeros(N)
rng = np.random.default_rng(7)
noise = rng.normal(0, 1, N)
tt = 0.0
while tt < DUR:
    for b in range(4):
        s = tt + b * BEAT
        i0 = int(s * SR); i1 = min(N, i0 + int(0.34 * SR))
        seg = np.arange(i1 - i0) / SR
        fsw = 105 * np.exp(-seg * 26) + 44
        kick[i0:i1] += np.sin(2 * np.pi * np.cumsum(fsw) / SR) * np.exp(-seg * 12)
        if b in (1, 3):                    # 2·4박 클랩
            j1 = min(N, i0 + int(0.16 * SR))
            sg = np.arange(j1 - i0) / SR
            clap[i0:j1] += noise[i0:j1] * np.exp(-sg * 34) * 0.5
        for half in (0.5,):                # 엇박 하이햇
            s2 = s + half * BEAT
            k0 = int(s2 * SR); k1 = min(N, k0 + int(0.07 * SR))
            sg = np.arange(k1 - k0) / SR
            hat[k0:k1] += noise[k0:k1] * np.exp(-sg * 90) * 0.32
    tt += BAR
for a in (kick, clap, hat):
    a /= np.max(np.abs(a)) + 1e-9

# ── 인트로 피아노 단음 + 노이즈 스웰 ──────────────────────────
piano = np.zeros(N)
for s, nm, oc in [(0.4, "G", 4), (2.0, "E", 4), (3.9, "C", 5), (6.0, "G", 4)]:
    f = note(nm, oc)
    i0, i1 = int(s * SR), min(N, int((s + 3.2) * SR))
    seg = np.arange(i1 - i0) / SR
    a = np.exp(-seg * 1.5)
    piano[i0:i1] += (np.sin(2 * np.pi * f * seg) * 0.9 +
                     np.sin(2 * np.pi * f * 2 * seg) * 0.25 +
                     np.sin(2 * np.pi * f * 3 * seg) * 0.09) * a
piano /= np.max(np.abs(piano)) + 1e-9

swell = np.zeros(N)
i1 = int(9.4 * SR)
sg = np.arange(i1) / SR
sm = np.convolve(np.abs(noise[:i1]), np.ones(2200) / 2200, mode="same")
swell[:i1] = (sm - sm.mean()) * (sg / 9.4) ** 3
swell /= np.max(np.abs(swell)) + 1e-9

# ── 큐 시트대로 구간 편성 (컷 시작 시각에 정확히 맞춤) ────────
C = T.START + [T.TOTAL]
mix = np.zeros(N)
mix += piano  * env_ramp(0.0, C[1] + 0.8, 1.0)                  * 0.42   # 컷1 정적
mix += swell  * env_ramp(0.0, C[1] + 0.4, 0.8)                  * 0.18
mix += drone  * (env_ramp(C[1] - 0.6, C[2] + 0.6, 1.2) * 0.30 +          # 컷2 비어 있음
                 env_ramp(C[5] - 0.5, C[6] + 0.4, 1.6) * 0.16)
mix += pad    * (env_ramp(C[2] - 0.8, C[5] + 0.4, 1.2) * 0.30 +
                 env_ramp(C[5] - 0.4, C[6] + 0.4, 1.6) * 0.40 +          # 컷6 패드만
                 env_ramp(C[6] - 0.4, C[8] - 1.0, 1.2) * 0.30)
mix += bass   * (env_ramp(C[2] - 0.3, C[5] - 0.1, 1.0) * 0.34 +          # 컷3 진입
                 env_ramp(C[6] - 0.3, C[8] - 0.6, 1.0) * 0.34)
mix += arp    * (env_ramp(C[3] - 0.3, C[5] - 0.1, 1.2) * 0.20 +          # 컷4 아르페지오
                 env_ramp(C[6] - 0.3, C[8] - 0.6, 1.0) * 0.20)
mix += kick   * (env_ramp(C[2] - 0.3, C[5] - 0.1, 0.9) * 0.30 +
                 env_ramp(C[4] - 0.2, C[5] - 0.1, 0.7) * 0.26 +          # 컷5 최고 에너지
                 env_ramp(C[6] - 0.3, C[8] - 0.6, 0.9) * 0.34)
mix += clap   * (env_ramp(C[4] - 0.2, C[5] - 0.1, 0.7) * 0.30 +
                 env_ramp(C[7] - 0.2, C[8] - 0.6, 0.7) * 0.26)
mix += hat    * (env_ramp(C[3] - 0.3, C[5] - 0.1, 1.0) * 0.16 +
                 env_ramp(C[4] - 0.2, C[5] - 0.1, 0.7) * 0.16 +
                 env_ramp(C[6] - 0.3, C[8] - 0.6, 0.9) * 0.18)

# 전체 페이드
mix[:int(0.6 * SR)] *= np.linspace(0, 1, int(0.6 * SR))
tail = int(4.6 * SR)                                            # 마지막 여운
mix[-tail:] *= np.linspace(1, 0, tail) ** 1.6

# 소프트 리미터 + 스테레오 살짝 넓히기
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix /= np.max(np.abs(mix)) + 1e-9
d = int(0.010 * SR)
left = mix * 0.94 + np.concatenate([np.zeros(d), mix[:-d]]) * 0.10
right = mix * 0.94 + np.concatenate([np.zeros(d * 2), mix[:-d * 2]]) * 0.10
st = np.stack([left, right], 1)
st /= np.max(np.abs(st)) + 1e-9
st *= 0.80

out = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("wrote", out, f"{DUR:.0f}s")
