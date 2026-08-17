"""내레이션 길이에 맞춘 컷 타이밍. BPM 100 → 한 박 0.6초 = 정확히 18프레임."""
import json
BEAT = 0.6
LEAD = [2.0] + [0.35] * 7          # 컷 시작부터 목소리가 나오기까지
BEATS = [14, 22, 18, 25, 30, 24, 18, 22]   # 컷별 박 수
DUR = [b * BEAT for b in BEATS]
START = [sum(DUR[:i]) for i in range(8)]
TOTAL = sum(DUR)
seg = json.load(open("align.json"))["segments"]
VOICE_AT = [round(START[i] + LEAD[i], 3) for i in range(8)]
if __name__ == "__main__":
    print(f"총 {TOTAL:.1f}초 ({int(TOTAL//60)}:{TOTAL%60:04.1f})")
    for i in range(8):
        sd = seg[i][1] - seg[i][0]
        print(f"컷{i+1}  {START[i]:6.1f}–{START[i]+DUR[i]:6.1f} ({DUR[i]:4.1f}s)"
              f"  목소리 {VOICE_AT[i]:6.1f}s 부터 {sd:5.2f}s  여백 {DUR[i]-LEAD[i]-sd:5.2f}s")
