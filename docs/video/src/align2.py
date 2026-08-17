"""내레이션 한 파일을 8개 컷으로 나눈다.
쉬는 지점 후보 중에서, 각 컷의 «말할 글자 수» 비율에 가장 가깝게 떨어지는 7곳을 고른다."""
import re, subprocess, json, sys

WAV = __import__("sys").argv[1] if len(__import__("sys").argv)>1 else "vo_raw.wav"
CUTS = [
 "아이가 영어를 못 하는 건, 재능이 없어서가 아닙니다. 오래 하지 못해서입니다.",
 "주 두 번, 스물다섯 분씩. 한 달이면 이백 분입니다. 한 달 사만 삼천 분 가운데, 영 점 오 퍼센트. 나머지 시간, 영어는 아이 곁에 없습니다.",
 "망고아이는 그 빈 시간을 채웁니다. 수업이 없는 날에도 말하고, 쓰고, 외우고, 노는 열네 가지 에이아이 학습 콘텐츠.",
 "발음을 듣고 바로 고쳐 주는 에이아이 음성코치. 밤이든 새벽이든 말을 받아 주는 에이아이 친구. 쓴 문장을 그 자리에서 다듬어 주는 에이아이 영작 첨삭. 그리고 잊을 때쯤 다시 물어보는 단어장.",
 "게임은 스물한 가지. 탱크를 몰고, 좀비 실험실을 탈출하고, 우주 괴물과 싸웁니다. 단, 영어로 말해야 문이 열립니다. 아이는 놀았다고 하는데, 실력은 문장으로 남습니다.",
 "재미로만 만들지 않았습니다. 혼자선 어렵지만 도와주면 해내는 구간, 비고츠키의 근접발달영역. 잊을 때쯤 다시 꺼내는 간격 반복. 교육학과 인지심리학 연구 위에 설계했습니다.",
 "시작은 간단합니다. 에이아이 레벨 진단으로 자리를 찾고, 선생님과 수업하고, 수업이 끝나면 에이아이 콘텐츠로 이어서 복습합니다.",
 "아바타는 자라고, 에이아이는 아이를 알아 갑니다. 재미가 의지를 이깁니다. 망고아이. 망고아이 닷 에이아이.",
]
# 음절 수 + 쉼표 하나당 0.35음절어치 쉬는 시간
def weight(s):
    syl = len(re.sub(r"[^가-힣0-9A-Za-z]", "", s))
    return syl + s.count(",") * 2.2 + s.count(".") * 3.0

out = subprocess.run(["ffmpeg","-hide_banner","-nostats","-i",WAV,
                      "-af","silencedetect=noise=-34dB:d=0.20","-f","null","-"],
                     capture_output=True, text=True).stderr
sil = []
cur = None
for line in out.splitlines():
    m = re.search(r"silence_start: ([\d.]+)", line)
    if m: cur = float(m.group(1))
    m = re.search(r"silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", line)
    if m and cur is not None:
        sil.append((cur, float(m.group(1)), float(m.group(2)))); cur = None

dur = float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                            "-of","default=nw=1:nk=1",WAV],capture_output=True,text=True).stdout)
head = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
tail = sil[-1][0] if sil and sil[-1][1] >= dur - 0.05 else dur
speech = tail - head
print(f"파일 {dur:.2f}s / 말하는 구간 {head:.2f}–{tail:.2f} = {speech:.2f}s / 쉬는 지점 {len(sil)}곳\n")

# 내부 후보 (앞뒤 끝 제외)
cand = [s for s in sil if s[0] > head + 0.5 and s[1] < tail - 0.5]
W = [weight(c) for c in CUTS]; TW = sum(W)
exp = [speech * w / TW for w in W]

INF = float("inf")
n = len(cand)
best = {}
def solve(i, k, t0):
    """i번째 후보부터, k번째 컷까지 남았을 때 최소 비용"""
    key = (i, k)
    if key in best: return best[key]
    if k == 7:                                   # 마지막 컷은 끝까지
        r = ((tail - t0) - exp[7]) ** 2, []
        best[key] = r; return r
    bc, bp = INF, []
    for j in range(i, n):
        s0, s1, sd = cand[j]
        mid = (s0 + s1) / 2
        seg = mid - t0
        if seg < 1.5: continue
        if seg > exp[k] * 2.6 + 4: break
        c = (seg - exp[k]) ** 2 - sd * 9.0       # 길게 쉰 곳일수록 컷 경계일 확률↑
        sub, path = solve(j + 1, k + 1, mid)
        if c + sub < bc: bc, bp = c + sub, [mid] + path
    best[key] = (bc, bp); return best[key]

cost, bounds = solve(0, 0, head)
edges = [head] + bounds + [tail]
segs = []
print(f"{'컷':>3} {'시작':>8} {'끝':>8} {'길이':>7} {'예상':>7}")
for k in range(8):
    a, b = edges[k], edges[k + 1]
    segs.append([round(a, 3), round(b, 3)])
    print(f"{k+1:>3} {a:8.2f} {b:8.2f} {b-a:7.2f} {exp[k]:7.2f}")
json.dump({"file": WAV, "head": head, "tail": tail, "segments": segs}, open(sys.argv[2] if len(sys.argv)>2 else "align.json","w"), indent=1)
print("\n->", sys.argv[2] if len(sys.argv)>2 else "align.json")
