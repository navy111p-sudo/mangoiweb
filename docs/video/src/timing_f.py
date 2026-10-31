"""컷 타이밍 — 목소리에 바짝 붙여 빈 시간 최소화."""
import json
BEAT = 0.6
ALIGN = "align_f.json"
VO = "vo_f.mp3"
BEATS = [13, 19, 16, 24, 26, 23, 17, 19]
LEAD = [1.4] + [0.30] * 7
DUR = [b * BEAT for b in BEATS]
START = [sum(DUR[:i]) for i in range(8)]
TOTAL = sum(DUR)
SEG = json.load(open(ALIGN))["segments"]
VOICE_AT = [round(START[i] + LEAD[i], 3) for i in range(8)]
