"""Jake 입모양·눈 깜빡임 만들기 — 영상 seek 대신 «같은 얼굴에서 입만 다른» 투명 WebP 3장.
Build Jake's three mouth poses as transparent WebPs (mouth-only differences).

Usage: python tools/build-jake-poses.py [OUT_DIR]
  needs: ffmpeg (H.264 decode), opencv-python-headless, numpy, pillow

1) hero-avatar.mp4 에서 기존 입모양 순간(closed 3.2s · mid 7.1s · wide 3.5s)을 뽑는다.
2) mid·wide 를 closed 에 SIFT/RANSAC(입 부위 제외)로 정렬한 뒤 «입 타원» 만 얹는다
   — 입 밖 픽셀은 closed 와 바이트 단위로 같다(assert).
3) mango-avatar.js 의 keyFrame() 과 같은 문턱으로 초록을 지워 알파로 굽고,
   원본 위쪽 검은 띠(16px)를 잘라 512x496 으로 저장한다.
4) (2026-10-18) 눈 깜빡임·눈썹 아틀라스 jake-eyes.webp(반감음·감음·눈썹 올림 3칸) —
   영상에 실제로 있는 깜빡임 프레임을 rest 에 정렬해 «눈+눈썹 타원» 만 얹는다(입과 같은 방식).
   영상에는 눈썹을 올리는 순간이 없어서(200프레임 실측: 눈썹 높이 차 최대 ±3px) 눈썹 칸만은
   rest 의 눈썹을 몇 px 부드럽게 끌어올려 만든다 — 역시 새 얼굴 생성이 아니다.
   rect 는 mango-avatar.js 의 EYES.jake 와 «같아야» 한다(512x496 기준).
새 얼굴을 생성하지 않는다 — 원래 Jake 영상의 프레임만 쓴다.
"""
import sys, json, subprocess, tempfile
from pathlib import Path
import cv2, numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'cloudflare-deploy/public/img/hero-avatar.mp4'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'cloudflare-deploy/public/img'
# 6가지 입모양 — 영상 프레임 번호(25fps). 2026-10-17 사장님 「입모양을 6가지로」.
#   rest 80(=3.2s 다문 입) · spread 118(«이» 옆으로) · teeth 46(이가 보이는 작은 벌림)
#   open 186(중간 벌림) · wide 90(«아» 크게) · round 150(«오/우» 둥글게)
POSES = {'rest': 80, 'spread': 118, 'teeth': 46, 'open': 186, 'wide': 90, 'round': 150}
# Rhubarb 9칸(XABCDEFGH) → 6가지. X·A=rest · B=spread · C·H=open · D=wide · E·F=round · G=teeth
ATLAS = ['rest', 'rest', 'spread', 'open', 'wide', 'round', 'round', 'teeth', 'open']
# 단순 3단계(음량 기반) 장 — 옛 jake-closed/mid/wide 이름 유지
TIERS = {'closed': 'rest', 'mid': 'open', 'wide': 'wide'}
CX, CY, RX, RY = 256, 366, 60, 38                    # 입 타원(원본 512x512 좌표)
# 눈+눈썹 타원(원본 512x512 좌표) · 깜빡임 프레임 · 눈썹 들어 올림(px)
EYE_ELL = [(207, 234, 48, 31), (308, 234, 48, 31)]
EYE_POSES = {'half': 3, 'closed': 100}               # 3 = 감기 시작(대칭) · 100 = 다 감음(속눈썹 선)
BROW_LIFT, BROW_Y = 7.0, 221                         # 눈썹 중심선 y 와 들어 올릴 양
TOP = 16                                             # 원본 위 검은 띠

def grab_all(tmp):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(SRC), str(Path(tmp) / '%03d.png')], check=True)

def key_green(bgr):
    """mango-avatar.js keyFrame() 과 같은 문턱(38/10/0) — 초록 우세도로 알파·스필 처리."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = np.maximum(r, b); diff = g - mx
    a = np.full(r.shape, 255, np.int32)
    a[diff > 38] = 0
    mid = (diff > 10) & (diff <= 38)
    a[mid] = ((38 - diff[mid]) * 255 // 28)
    g2 = np.where(diff > 0, mx, g)
    return np.dstack([r, g2, b, a]).clip(0, 255).astype(np.uint8)

with tempfile.TemporaryDirectory() as tmp:
    grab_all(tmp)   # ffmpeg 의 %03d 는 1부터 — 프레임 번호 n 은 파일 n+1
    frames = {k: cv2.imread(str(Path(tmp) / f'{n + 1:03d}.png'), cv2.IMREAD_COLOR) for k, n in POSES.items()}
    eye_frames = {k: cv2.imread(str(Path(tmp) / f'{n + 1:03d}.png'), cv2.IMREAD_COLOR) for k, n in EYE_POSES.items()}
base = frames['rest']; h, w = base.shape[:2]
mask = np.full((h, w), 255, np.uint8)
cv2.ellipse(mask, (CX, CY), (RX + 30, RY + 30), 0, 0, 360, 0, -1); mask[:TOP + 4] = 0
sift = cv2.SIFT_create(); kb, db = sift.detectAndCompute(base, mask)
alpha = np.zeros((h, w), np.float32); cv2.ellipse(alpha, (CX, CY), (RX, RY), 0, 0, 360, 1, -1)
alpha = cv2.GaussianBlur(alpha, (0, 0), 4); alpha[alpha < .005] = 0
report = {}
out = {'rest': base}
for k in [k for k in POSES if k != 'rest']:
    o = frames[k]; ko, do = sift.detectAndCompute(o, mask)
    good = [a for a, c in cv2.BFMatcher().knnMatch(do, db, k=2) if a.distance < .7 * c.distance]
    if len(good) < 8: raise RuntimeError(f'{k}: too few matches {len(good)}')
    src = np.float32([ko[m.queryIdx].pt for m in good]); dst = np.float32([kb[m.trainIdx].pt for m in good])
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3)
    if M is None or inl.sum() < 6: raise RuntimeError(f'{k}: registration failed')
    warped = cv2.warpAffine(o, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
    a = alpha[:, :, None]
    res = np.round(base * (1 - a) + warped * a).astype(np.uint8)
    assert np.array_equal(res[alpha == 0], base[alpha == 0])   # 입 밖은 그대로
    out[k] = res
    report[k] = dict(matches=len(good), inliers=int(inl.sum()))
OUT.mkdir(parents=True, exist_ok=True)
keyed = {k: key_green(img)[TOP:] for k, img in out.items()}
for name, k in TIERS.items():
    Image.fromarray(keyed[k], 'RGBA').save(OUT / f'jake-{name}.webp', quality=88, method=6)
# 9칸 아틀라스(3열) — mango-avatar.js PRECISION.jake 의 x,y,w,h 와 짝
PAD = 8; X0, Y0 = CX - RX - PAD, CY - RY - PAD - TOP; PW, PH = (RX + PAD) * 2, (RY + PAD) * 2
sheet = Image.new('RGBA', (PW * 3, PH * 3))
for n, k in enumerate(ATLAS):
    cell = Image.fromarray(keyed[k], 'RGBA').crop((X0, Y0, X0 + PW, Y0 + PH))
    sheet.paste(cell, ((n % 3) * PW, (n // 3) * PH))
(OUT / 'visemes').mkdir(exist_ok=True)
sheet.save(OUT / 'visemes' / 'jake-mouths.webp', lossless=True)

# ── 눈 아틀라스 ── 입과 같은 정렬(SIFT/RANSAC)인데, 이번엔 «눈 부위·입·초록 배경» 을 빼고 맞춘다.
emask = np.full((h, w), 255, np.uint8)
for cx, cy, rx, ry in EYE_ELL: cv2.ellipse(emask, (cx, cy), (int(rx * 1.6), int(ry * 1.8)), 0, 0, 360, 0, -1)
cv2.ellipse(emask, (CX, CY), (RX + 35, RY + 32), 0, 0, 360, 0, -1); emask[:TOP + 4] = 0
bi = base.astype(np.int32); emask[(bi[..., 1] - np.maximum(bi[..., 0], bi[..., 2])) > 10] = 0
ek, ed = sift.detectAndCompute(base, emask)
ealpha = np.zeros((h, w), np.float32)
for cx, cy, rx, ry in EYE_ELL: cv2.ellipse(ealpha, (cx, cy), (rx, ry), 0, 0, 360, 1, -1)
ealpha = cv2.GaussianBlur(ealpha, (0, 0), 3); ealpha[ealpha < .005] = 0
ring = (ealpha > .02) & (ealpha < .5); ea = ealpha[:, :, None]
eyes, ereport = {}, {}
for k, o in eye_frames.items():
    ko, do = sift.detectAndCompute(o, emask)
    good = [a for a, c in cv2.BFMatcher().knnMatch(do, ed, k=2) if a.distance < .7 * c.distance]
    if len(good) < 8: raise RuntimeError(f'eyes {k}: too few matches {len(good)}')
    M, inl = cv2.estimateAffinePartial2D(np.float32([ko[m.queryIdx].pt for m in good]),
                                         np.float32([ek[m.trainIdx].pt for m in good]), method=cv2.RANSAC, ransacReprojThreshold=3)
    if M is None or inl.sum() < 6: raise RuntimeError(f'eyes {k}: registration failed')
    warped = cv2.warpAffine(o, M, (w, h), borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
    # 프레임마다 노출이 조금씩 다르다 — 타원 테두리(피부) 중앙값으로 맞춘다(build-eye-patches.py 와 같음).
    shift = np.clip(np.median(base[ring].astype(np.float32) - warped[ring], axis=0), -25, 25)
    warped = np.clip(warped + shift, 0, 255)
    gw = cv2.cvtColor(warped.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    err = float(np.mean(np.abs(gw[ring] - cv2.cvtColor(base, cv2.COLOR_BGR2GRAY).astype(np.float32)[ring])))
    if err > 14: raise RuntimeError(f'eyes {k}: registration doubtful (ring err {err:.2f})')
    eyes[k] = np.round(base * (1 - ea) + warped * ea).astype(np.uint8)
    ereport[k] = dict(frame=EYE_POSES[k], matches=len(good), inliers=int(inl.sum()), ring_err=round(err, 2))
# 눈썹 올림 — 눈썹 중심선에서 가장 세게, 눈꺼풀·타원 가장자리로 갈수록 0 이 되게 위로 당긴다.
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32); wt = np.zeros((h, w), np.float32)
for cx, cy, rx, ry in EYE_ELL:
    wt = np.maximum(wt, np.exp(-((xx - cx) ** 2) / (2 * 34 ** 2)) * np.exp(-((yy - BROW_Y) ** 2) / (2 * 9 ** 2)))
lifted = cv2.remap(base, xx, yy + BROW_LIFT * wt, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
eyes['brows'] = np.round(base * (1 - ea) + lifted * ea).astype(np.uint8)
ereport['brows'] = dict(lift_px=BROW_LIFT, brow_y=BROW_Y)
for k, img in eyes.items():
    assert np.array_equal(img[ealpha == 0], base[ealpha == 0])   # 타원 밖은 rest 와 같다
    diff = np.abs(img.astype(int) - base.astype(int)).max(2) > 12
    ereport[k]['changed_pct_by_tenth'] = [round(float(diff[i * h // 10:(i + 1) * h // 10].mean()) * 100, 2) for i in range(10)]
EP = 6
ex0 = min(cx - rx for cx, cy, rx, ry in EYE_ELL) - EP; ey0 = min(cy - ry for cx, cy, rx, ry in EYE_ELL) - EP
ex1 = max(cx + rx for cx, cy, rx, ry in EYE_ELL) + EP; ey1 = max(cy + ry for cx, cy, rx, ry in EYE_ELL) + EP
EW, EH = ex1 - ex0, ey1 - ey0
eatlas = Image.new('RGBA', (EW * 3, EH)); rest_a = key_green(base)[..., 3]
for n, k in enumerate(['half', 'closed', 'brows']):   # 칸 번호 = mango-avatar.js eyeState - 1
    # 알파는 rest 의 것을 그대로 — 영상 압축 잡음으로 어두운 눈썹이 «살짝 초록» 이 되어 반투명해지는 것을 막는다.
    kd = key_green(eyes[k]); kd[..., 3] = rest_a
    eatlas.paste(Image.fromarray(kd, 'RGBA').crop((ex0, ey0, ex1, ey1)), (n * EW, 0))
eatlas.save(OUT / 'visemes' / 'jake-eyes.webp', lossless=True)
print(json.dumps(dict(size=[w, h - TOP], ellipse=[CX, CY, RX, RY], atlas=dict(x=X0, y=Y0, w=PW, h=PH), poses=report,
                      eyes=dict(rect=dict(x=ex0, y=ey0 - TOP, w=EW, h=EH), poses=ereport))))
