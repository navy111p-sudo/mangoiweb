"""망고아이 필름 배경음악 v3 — 전부 합성이라 저작권 문제 없음.
BPM 100 / C 장조 / Cmaj9–Am7–Fmaj7–G6.
v2 와 다른 점: 되풀이되는 벨 멜로디(후크)를 넣고, 패드를 3중 디튠으로 두껍게,
드럼을 부드럽게 바꿨습니다. 구간 역할만 넘기면 어떤 길이에도 맞춰 편성합니다.

사용:  python3 music3.py <출력.wav> <timing 모듈> <역할1,역할2,...>
예:    python3 music3.py bgm2.wav timing quiet,empty,enter,build,peak,break,return,finale
"""
import numpy as np, wave, sys, importlib

SR = 44100
BPM = 100.0
BEAT = 60.0 / BPM          # 0.6
BAR = BEAT * 4             # 2.4

out_path = sys.argv[1] if len(sys.argv) > 1 else "bgm3.wav"
Tm = importlib.import_module(sys.argv[2] if len(sys.argv) > 2 else "timing")
ROLES = (sys.argv[3] if len(sys.argv) > 3 else
         "quiet,empty,enter,build,peak,break,return,finale").split(",")
DUR = Tm.TOTAL
N = int(SR * DUR)
t = np.arange(N) / SR
C = list(Tm.START) + [DUR]

NOTE = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
        "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
def hz(n, o): return 440.0 * 2 ** ((NOTE[n] - 9) / 12 + (o - 4))

# I–vi–IV–V 를 7th·9th 로 넓혀 따뜻하게
PROG = [("C", ["C", "E", "G", "B", "D"]),
        ("A", ["A", "C", "E", "G"]),
        ("F", ["F", "A", "C", "E"]),
        ("G", ["G", "B", "D", "E"])]
# 되풀이되는 4마디 벨 멜로디 — 이 곡의 «후크»
MEL = [[("E", 5, 0), ("G", 5, 1), ("A", 5, 2), ("G", 5, 3)],
       [("C", 5, 0), ("E", 5, 1), ("G", 5, 2), ("E", 5, 3)],
       [("A", 4, 0), ("C", 5, 1), ("D", 5, 2), ("C", 5, 3)],
       [("B", 4, 0), ("D", 5, 1), ("G", 5, 2), ("D", 5, 3)]]

def nbars(): return int(np.ceil(DUR / BAR))

def ramp(a, b, f=1.0):
    """[a,b] 구간 게인, 양끝 f초 부드럽게."""
    e = np.zeros(N)
    ia, ib = max(0, int(a * SR)), min(N, int(b * SR))
    if ib <= ia: return e
    e[ia:ib] = 1.0
    k = int(f * SR)
    if k > 0:
        up = np.linspace(0, 1, k) ** 2
        n1 = min(k, ib - ia); e[ia:ia + n1] *= up[:n1]
        n2 = min(k, ib - ia); e[ib - n2:ib] *= up[::-1][:n2]
    return e

def add(buf, start, wave_, ):
    i0 = int(start * SR)
    if i0 >= N: return
    n = min(len(wave_), N - i0)
    if n > 0: buf[i0:i0 + n] += wave_[:n]

def env(n, atk, dec):
    s = np.arange(n) / SR
    return np.minimum(s / max(atk, 1e-4), 1.0) * np.exp(-np.maximum(s - atk, 0) * dec)

# ── 레이어 ────────────────────────────────────────────────────
pad_w = np.zeros(N); pad_b = np.zeros(N)     # 어두운 패드 / 밝은 패드
sub = np.zeros(N); bassp = np.zeros(N)
bell = np.zeros(N); arp = np.zeros(N)
kick = np.zeros(N); clap = np.zeros(N); hat = np.zeros(N); shk = np.zeros(N)

rng = np.random.default_rng(11)
noise = rng.normal(0, 1, N)

for b in range(nbars()):
    root, chord = PROG[b % 4]
    t0 = b * BAR
    n = int(BAR * SR) + int(0.6 * SR)
    s = np.arange(n) / SR
    a = np.minimum(s / 0.45, 1.0) * np.minimum(np.maximum(BAR + 0.25 - s, 0) / 0.5, 1.0)

    # 패드 — 코드음마다 3중 디튠
    dark = np.zeros(n); bright = np.zeros(n)
    for k, nm in enumerate(chord):
        f0 = hz(nm, 4 if k else 3)
        for d in (-0.13, 0.0, 0.13):
            f = f0 * 2 ** (d / 12)
            dark += np.sin(2 * np.pi * f * s + k) * 0.33
            bright += (np.sin(2 * np.pi * f * s + k) * 0.33 +
                       np.sin(2 * np.pi * f * 2 * s) * 0.11 +
                       np.sin(2 * np.pi * f * 3 * s) * 0.045)
    add(pad_w, t0, dark * a); add(pad_b, t0, bright * a)

    # 서브베이스 + 베이스 플럭
    fb = hz(root, 1)
    add(sub, t0, np.sin(2 * np.pi * fb * s) * a * 0.9)
    for k in (0, 2, 3):
        st = t0 + k * BEAT
        m = int(BEAT * 2.1 * SR); ss = np.arange(m) / SR
        e = env(m, 0.004, 3.0)
        f2 = hz(root, 2)
        add(bassp, st, (np.sin(2 * np.pi * f2 * ss) + 0.3 * np.sin(2 * np.pi * f2 * 2 * ss)) * e)

    # 벨 멜로디 (후크)
    for nm, oc, beat_i in MEL[b % 4]:
        st = t0 + beat_i * BEAT
        m = int(1.4 * SR); ss = np.arange(m) / SR
        f = hz(nm, oc)
        e = np.exp(-ss * 3.0)
        add(bell, st, (np.sin(2 * np.pi * f * ss) +
                       0.30 * np.sin(2 * np.pi * f * 2 * ss) +
                       0.12 * np.sin(2 * np.pi * f * 3 * ss) +
                       0.06 * np.sin(2 * np.pi * f * 4.21 * ss)) * e)

    # 아르페지오 8분음표
    for i8 in range(8):
        nm = chord[[0, 1, 2, 1, 3 % len(chord), 1, 0, 2][i8] % len(chord)]
        f = hz(nm, 5 if i8 % 4 in (1, 2) else 4)
        st = t0 + i8 * BEAT / 2
        m = int(0.4 * SR); ss = np.arange(m) / SR
        add(arp, st, (np.sin(2 * np.pi * f * ss) * 0.85 +
                      0.1 * np.sin(2 * np.pi * f * 3 * ss)) * np.exp(-ss * 10))

    # 드럼
    for k in range(4):
        st = t0 + k * BEAT
        m = int(0.32 * SR); ss = np.arange(m) / SR
        sw = 96 * np.exp(-ss * 24) + 46
        add(kick, st, np.sin(2 * np.pi * np.cumsum(sw) / SR) * np.exp(-ss * 11) * 0.95)
        if k in (1, 3):
            m2 = int(0.20 * SR); s2 = np.arange(m2) / SR
            i0 = int(st * SR)
            nz = noise[i0:i0 + m2] if i0 + m2 <= N else np.zeros(m2)
            add(clap, st, (nz * 0.55 + 0.25 * np.sin(2 * np.pi * 190 * s2)) * np.exp(-s2 * 26))
        for h, amp in ((0.0, 0.20), (0.5, 0.34)):
            st2 = st + h * BEAT
            m2 = int((0.14 if h else 0.05) * SR); s2 = np.arange(m2) / SR
            i0 = int(st2 * SR)
            nz = noise[i0:i0 + m2] if i0 + m2 <= N else np.zeros(m2)
            add(hat, st2, nz * np.exp(-s2 * (34 if h else 110)) * amp)
        for q in range(4):                      # 셰이커 16분
            st3 = st + q * BEAT / 4
            m3 = int(0.045 * SR); s3 = np.arange(m3) / SR
            i0 = int(st3 * SR)
            nz = noise[i0:i0 + m3] if i0 + m3 <= N else np.zeros(m3)
            add(shk, st3, nz * np.exp(-s3 * 150) * (0.16 if q % 2 else 0.24))

for a in (pad_w, pad_b, sub, bassp, bell, arp, kick, clap, hat, shk):
    a /= np.max(np.abs(a)) + 1e-9

# 인트로 피아노
piano = np.zeros(N)
for st, nm, oc in [(0.35, "G", 4), (1.9, "E", 4), (3.6, "C", 5), (5.6, "G", 4)]:
    m = int(3.4 * SR); ss = np.arange(m) / SR
    f = hz(nm, oc); e = np.exp(-ss * 1.4)
    add(piano, st, (np.sin(2 * np.pi * f * ss) + 0.26 * np.sin(2 * np.pi * f * 2 * ss) +
                    0.09 * np.sin(2 * np.pi * f * 3 * ss)) * e)
piano /= np.max(np.abs(piano)) + 1e-9

def riser(at, length=2.0):
    """구간 진입 직전에 올라가는 노이즈 스윕."""
    o = np.zeros(N)
    i0 = max(0, int((at - length) * SR)); i1 = min(N, int(at * SR))
    if i1 <= i0: return o
    m = i1 - i0
    s = np.arange(m) / SR
    sm = np.convolve(np.abs(noise[i0:i1]), np.ones(1400) / 1400, mode="same")
    o[i0:i1] = (sm - sm.mean()) * (s / (m / SR)) ** 3.2
    return o / (np.max(np.abs(o)) + 1e-9)

def impact(at):
    o = np.zeros(N)
    m = int(1.6 * SR); s = np.arange(m) / SR
    sw = 130 * np.exp(-s * 9) + 38
    add(o, at, np.sin(2 * np.pi * np.cumsum(sw) / SR) * np.exp(-s * 3.2))
    return o / (np.max(np.abs(o)) + 1e-9)

# ── 구간 역할별 편성 ──────────────────────────────────────────
G = {"pad_w": 0, "pad_b": 0, "sub": 0, "bassp": 0, "bell": 0, "arp": 0,
     "kick": 0, "clap": 0, "hat": 0, "shk": 0, "piano": 0}
LEVEL = {
    #                pad_w pad_b  sub  bass bell  arp kick clap  hat  shk
    "quiet":  dict(pad_w=.10, piano=.44),
    "empty":  dict(pad_w=.26, sub=.20),
    "enter":  dict(pad_w=.20, pad_b=.14, sub=.30, bassp=.26, bell=.20, kick=.26, hat=.10),
    "build":  dict(pad_b=.26, sub=.28, bassp=.28, bell=.26, arp=.17, kick=.28, hat=.13, shk=.10),
    "peak":   dict(pad_b=.30, sub=.30, bassp=.30, bell=.30, arp=.20, kick=.34, clap=.26, hat=.17, shk=.14),
    "break":  dict(pad_w=.34, pad_b=.12, sub=.18, bell=.18),
    "return": dict(pad_b=.26, sub=.28, bassp=.28, bell=.24, arp=.16, kick=.28, hat=.13, shk=.10),
    "finale": dict(pad_b=.32, sub=.30, bassp=.30, bell=.32, arp=.18, kick=.32, clap=.24, hat=.15, shk=.12),
}
SRC = dict(pad_w=pad_w, pad_b=pad_b, sub=sub, bassp=bassp, bell=bell, arp=arp,
           kick=kick, clap=clap, hat=hat, shk=shk, piano=piano)

mix = np.zeros(N)
for i, role in enumerate(ROLES):
    a = C[i] - (0.5 if i else 0.0)
    b = C[i + 1] + 0.35
    for name, lvl in LEVEL.get(role, {}).items():
        mix += SRC[name] * ramp(a, b, 1.1) * lvl

# 가장 밝은 구간(peak) 앞에 라이저·임팩트
if "peak" in ROLES:
    pi = ROLES.index("peak")
    mix += riser(C[pi]) * 0.16
    mix += impact(C[pi]) * 0.30

mix[:int(0.5 * SR)] *= np.linspace(0, 1, int(0.5 * SR))
tl = int(min(4.4, DUR * 0.1) * SR)
mix[-tl:] *= np.linspace(1, 0, tl) ** 1.5

mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix /= np.max(np.abs(mix)) + 1e-9
d = int(0.011 * SR)
L = mix * 0.93 + np.concatenate([np.zeros(d), mix[:-d]]) * 0.12
R = mix * 0.93 + np.concatenate([np.zeros(d * 2), mix[:-d * 2]]) * 0.12
st = np.stack([L, R], 1)
st /= np.max(np.abs(st)) + 1e-9
st *= 0.82

with wave.open(out_path, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print(f"wrote {out_path}  {DUR:.1f}s  roles={','.join(ROLES)}")
