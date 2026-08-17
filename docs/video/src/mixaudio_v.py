"""숏폼 오디오 — 고른 4구간 내레이션 + 배경음악 덕킹."""
import subprocess, timing_v as T
PRE, POST = 0.08, 0.30
cmd = ["ffmpeg","-y","-loglevel","error","-i","bgm_v.wav"]
for a, b in T.SEG:
    cmd += ["-ss", f"{max(0,a-PRE):.3f}", "-to", f"{b+POST:.3f}", "-i", "vo_raw.mp3"]
n = len(T.SEG)
f = []
for k in range(n):
    ms = int(round((T.VOICE_AT[k]-PRE)*1000))
    f.append(f"[{k+1}:a]aresample=48000,highpass=f=90,afftdn=nr=12:nf=-42,adelay={ms}:all=1[v{k}]")
f.append("".join(f"[v{k}]" for k in range(n))+f"amix=inputs={n}:normalize=0:duration=longest[vraw]")
f.append("[vraw]dynaudnorm=g=9:m=5:p=0.62,loudnorm=I=-15:TP=-1.5:LRA=11,"
         "pan=stereo|c0=c0|c1=c0,apad,atrim=0:%.3f,asetpts=N/SR/TB,asplit=2[vc][sc]" % T.TOTAL)
f.append("[0:a]aresample=48000,volume=0.66[bg]")
f.append("[bg][sc]sidechaincompress=threshold=0.035:ratio=9:attack=18:release=380:level_sc=2.4:makeup=1[bgd]")
f.append("[bgd][vc]amix=inputs=2:normalize=0:weights=1 1[m]")
f.append("[m]alimiter=limit=0.94:level=disabled[out]")
cmd += ["-filter_complex",";".join(f),"-map","[out]","-c:a","pcm_s16le","-ar","48000","-ac","2","audio_v.wav"]
subprocess.run(cmd, check=True); print("-> audio_v.wav")
