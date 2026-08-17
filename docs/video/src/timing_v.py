"""세로 숏폼 타이밍. 본편 내레이션 8구간 중 1·3·5·8번만 골라 45초로 재구성."""
import json
BEAT = 0.6
PICK = [0, 2, 4, 7]                 # 훅 · 답 · 게임 · 마무리
BEATS = [12, 17, 27, 18]            # 7.2 / 10.2 / 16.2 / 10.8
LEAD = [0.8, 0.30, 0.30, 0.30]
DUR = [b * BEAT for b in BEATS]
START = [sum(DUR[:i]) for i in range(len(DUR))]
TOTAL = sum(DUR)
SEG = [json.load(open("align.json"))["segments"][i] for i in PICK]
VOICE_AT = [round(START[i] + LEAD[i], 3) for i in range(len(DUR))]
if __name__ == "__main__":
    print(f"총 {TOTAL:.1f}초")
    for i in range(len(DUR)):
        sd = SEG[i][1] - SEG[i][0]
        print(f" 장면{i+1} {START[i]:5.1f}–{START[i]+DUR[i]:5.1f} ({DUR[i]:4.1f}s)"
              f"  목소리 {VOICE_AT[i]:5.1f}s 부터 {sd:5.2f}s  여백 {DUR[i]-LEAD[i]-sd:5.2f}s")
