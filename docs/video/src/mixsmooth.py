"""내레이션 + 배경음악 믹스 (부드러운 버전).

이전 버전은 afftdn(잡음제거)·dynaudnorm(자동레벨)·sidechaincompress(덕킹)를 겹쳐 써서
말이 끊길 때마다 음악이 확 튀어 올랐습니다. 여기서는
  · 목소리는 하이패스 + 완만한 컴프레서만 (잡음제거 없음)
  · 각 구간 앞뒤 30ms 페이드로 «툭» 소리 제거
  · 덕킹은 ffmpeg 대신 numpy 로 포락선을 직접 만들어
    빠르게 내리고(120ms) 아주 천천히 올립니다(1.1s). 최대 −6dB.
로 바꿔서 음악이 펌핑하지 않고 물 흐르듯 이어집니다.

사용: python3 mixsmooth.py <timing모듈> <bgm.wav> <출력.wav>
"""
import numpy as np, subprocess, sys, importlib, wave, os

T = importlib.import_module(sys.argv[1] if len(sys.argv) > 1 else "timing_f")
BGM = sys.argv[2] if len(sys.argv) > 2 else "bgm_f.wav"
OUT = sys.argv[3] if len(sys.argv) > 3 else "audio_smooth.wav"
SR = 48000
PRE, POST = 0.0, 0.0   # align3.py 가 이미 무음 안쪽에서 잘라 줌 (겹치면 말이 두 번 들림)
FADE = 0.030                       # 구간 앞뒤 페이드
DUCK_DB = -6.0                     # 말할 때 음악이 내려가는 최대치
ATK, REL = 0.12, 1.10              # 덕킹 반응 속도 (내릴 때 / 올릴 때)

TMP = "_voice_tmp.wav"
seg = T.SEG
# 안전장치 — 구간이 겹치면 다음 문장 첫 단어가 두 번 들린다
for k in range(len(seg) - 1):
    ov = (seg[k][1] + POST) - (seg[k + 1][0] - PRE)
    if ov > 0.001:
        raise SystemExit(f"구간 {k+1}과 {k+2}가 {ov:.3f}s 겹칩니다. align3.py 로 다시 정렬하세요.")
cmd = ["ffmpeg", "-y", "-loglevel", "error"]
for a, b in seg:
    cmd += ["-ss", f"{max(0, a - PRE):.3f}", "-to", f"{b + POST:.3f}", "-i", T.VO]
f = []
for k, (a, b) in enumerate(seg):
    dur = (b + POST) - max(0, a - PRE)
    ms = int(round((T.VOICE_AT[k] - PRE) * 1000))
    f.append(f"[{k}:a]aresample={SR},highpass=f=85,"
             f"acompressor=threshold=-19dB:ratio=3:attack=25:release=260:makeup=2,"
             f"afade=t=in:st=0:d={FADE},afade=t=out:st={max(0,dur-FADE):.3f}:d={FADE},"
             f"adelay={ms}:all=1[v{k}]")
n = len(seg)
f.append("".join(f"[v{k}]" for k in range(n)) + f"amix=inputs={n}:normalize=0:duration=longest[m]")
f.append(f"[m]loudnorm=I=-16:TP=-1.5:LRA=12,apad,atrim=0:{T.TOTAL:.3f},asetpts=N/SR/TB[o]")
cmd += ["-filter_complex", ";".join(f), "-map", "[o]",
        "-c:a", "pcm_s16le", "-ar", str(SR), "-ac", "1", "-f", "wav", TMP]
subprocess.run(cmd, check=True)


def rd(path):
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=channels",
                        "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    ch = int(p.stdout.strip().split("\n")[0])
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "s16le",
                          "-ar", str(SR), "-ac", str(ch), "-"], capture_output=True).stdout
    x = np.frombuffer(raw, "<i2").astype(np.float32) / 32768.0
    return x.reshape(-1, ch) if ch > 1 else x[:, None]


voice = rd(TMP)                       # (N,1)
bgm = rd(BGM)                         # (N,2)
N = int(round(T.TOTAL * SR))
def fit(a):
    if len(a) < N: a = np.vstack([a, np.zeros((N - len(a), a.shape[1]), np.float32)])
    return a[:N]
voice, bgm = fit(voice), fit(bgm)
if bgm.shape[1] == 1: bgm = np.repeat(bgm, 2, 1)
if voice.shape[1] == 1: voice = np.repeat(voice, 2, 1)

# ── 덕킹 포락선 ───────────────────────────────────────────────
mono = voice.mean(1)
blk = int(SR * 0.01)                                   # 10ms
m = len(mono) // blk * blk
rms = np.sqrt((mono[:m].reshape(-1, blk) ** 2).mean(1) + 1e-12)
lvl = np.clip((20 * np.log10(rms + 1e-9) + 46) / 26, 0, 1)   # -46dB→0, -20dB→1

ka = 1 - np.exp(-blk / (ATK * SR))
kr = 1 - np.exp(-blk / (REL * SR))
env = np.zeros_like(lvl); y = 0.0
for i, v in enumerate(lvl):
    y += (v - y) * (ka if v > y else kr)
    env[i] = y
gain_blk = 10 ** (DUCK_DB * env / 20.0)
gain = np.repeat(gain_blk, blk)
if len(gain) < N: gain = np.concatenate([gain, np.full(N - len(gain), gain[-1] if len(gain) else 1.0)])
gain = gain[:N][:, None]

mix = bgm * gain * 0.72 + voice * 1.0
peak = np.max(np.abs(mix)) + 1e-9
if peak > 0.97: mix *= 0.97 / peak
mix = np.tanh(mix * 1.06) / np.tanh(1.06) * 0.95

with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
os.remove(TMP)
print(f"-> {OUT}  {T.TOTAL:.1f}s  덕킹 최대 {DUCK_DB}dB (attack {ATK*1000:.0f}ms / release {REL*1000:.0f}ms)")
