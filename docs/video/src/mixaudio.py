"""내레이션 8구간을 컷 위치에 얹고, 배경음악을 목소리에 맞춰 자동으로 낮춘다(덕킹)."""
import json, subprocess, timing as T

seg = json.load(open("align.json"))["segments"]
PRE, POST = 0.08, 0.30                      # 첫 자음이 잘리지 않게 앞뒤로 조금 더
cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", "bgm2.wav"]
for k, (a, b) in enumerate(seg):
    cmd += ["-ss", f"{max(0,a-PRE):.3f}", "-to", f"{b+POST:.3f}", "-i", "vo_raw.wav"]

f = []
for k in range(8):
    ms = int(round((T.VOICE_AT[k] - PRE) * 1000))
    f.append(f"[{k+1}:a]aresample=48000,highpass=f=90,afftdn=nr=12:nf=-42,"
             f"adelay={ms}:all=1[v{k}]")
f.append("".join(f"[v{k}]" for k in range(8)) +
         "amix=inputs=8:normalize=0:duration=longest[vraw]")
f.append("[vraw]dynaudnorm=g=9:m=5:p=0.62,loudnorm=I=-16:TP=-1.5:LRA=11,"
         "pan=stereo|c0=c0|c1=c0,apad,atrim=0:%.3f,asetpts=N/SR/TB,asplit=2[vc][sc]" % T.TOTAL)
f.append("[0:a]aresample=48000,volume=0.62[bg]")
f.append("[bg][sc]sidechaincompress=threshold=0.035:ratio=9:attack=18:release=380:"
         "level_sc=2.4:makeup=1[bgd]")
f.append("[bgd][vc]amix=inputs=2:normalize=0:weights=1 1[m]")
f.append("[m]alimiter=limit=0.94:level=disabled[out]")

cmd += ["-filter_complex", ";".join(f), "-map", "[out]",
        "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", "audio_mix.wav"]
print(" ".join(cmd[:6]), "...")
subprocess.run(cmd, check=True)
print("-> audio_mix.wav")
