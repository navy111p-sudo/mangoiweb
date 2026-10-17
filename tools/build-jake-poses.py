"""Jake 입모양 3장 만들기 — 영상 seek 대신 «같은 얼굴에서 입만 다른» 투명 WebP 3장.
Build Jake's three mouth poses as transparent WebPs (mouth-only differences).

Usage: python tools/build-jake-poses.py [OUT_DIR]
  needs: ffmpeg (H.264 decode), opencv-python-headless, numpy, pillow

1) hero-avatar.mp4 에서 기존 입모양 순간(closed 3.2s · mid 7.1s · wide 3.5s)을 뽑는다.
2) mid·wide 를 closed 에 SIFT/RANSAC(입 부위 제외)로 정렬한 뒤 «입 타원» 만 얹는다
   — 입 밖 픽셀은 closed 와 바이트 단위로 같다(assert).
3) mango-avatar.js 의 keyFrame() 과 같은 문턱으로 초록을 지워 알파로 굽고,
   원본 위쪽 검은 띠(16px)를 잘라 512x496 으로 저장한다.
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
print(json.dumps(dict(size=[w, h - TOP], ellipse=[CX, CY, RX, RY], atlas=dict(x=X0, y=Y0, w=PW, h=PH), poses=report)))
