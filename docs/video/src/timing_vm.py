"""숏폼 컷 타이밍 — 본편 1·3·5·8컷."""
import json
BEAT = 0.6
ALIGN = "align.json"; VO = "vo_raw.mp3"
PICK = [0, 2, 4, 7]
BEATS = [12, 18, 26, 18]
LEAD = [0.8, 0.30, 0.30, 0.30]
DUR = [b * BEAT for b in BEATS]
START = [sum(DUR[:i]) for i in range(len(DUR))]
TOTAL = sum(DUR)
SEG = [json.load(open(ALIGN))["segments"][i] for i in PICK]
VOICE_AT = [round(START[i] + LEAD[i], 3) for i in range(len(DUR))]
