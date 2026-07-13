# -*- coding: utf-8 -*-
"""
홈 화면 우주인(astronaut.png) 재생성 — 신발 잘림 수정판 (2026-07-13)
원본: Downloads/Gemini_Generated_Image_c8pmfac8pmfac8pm.png (그린스크린 1075x976)
이전 버전 문제: 크로마키 임계값이 신발 밑창의 녹색 반사(스필)까지 배경으로 판정해
밑창이 통째로 깎임. 이번엔 (1) 임계값 상향 (2) 신발 영역은 채도 낮은 흰색이므로
excess-green 판정을 밝기 대비로 보정 (3) 최종 실루엣에 fill_holes 로 비침 0 유지.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SRC = 'C:/Users/Admin/Downloads/Gemini_Generated_Image_c8pmfac8pmfac8pm.png'
OUT = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/img/astronaut.png'

im = Image.open(SRC).convert('RGB')
A = np.asarray(im).astype(np.float32)
R, G, B = A[..., 0], A[..., 1], A[..., 2]

# ── 1) 배경 판정 ──
# 신발 밑창에 녹색 바닥반사가 섞여 excess 가 60~140 까지 올라감.
# 순수 배경은 excess 170~190 이므로 150 을 경계로 하면 밑창이 연결된 채 살아남는다.
# (임계값을 낮게 잡으면 밑창 중간이 끊겨 largest-component 단계에서 통째로 삭제됨 — 이전 버전 버그)
excess = G - np.maximum(R, B)
bg = (excess > 150) & (G > 140)
# 신발 옆 바닥 그림자(어두운 초록: 저휘도+중간 excess)도 배경 처리 — 검은 조각으로 남는 것 방지
lum0 = 0.299 * R + 0.587 * G + 0.114 * B
bg |= (excess > 50) & (lum0 < 105)
# 굽 뒤 아주 짙은 그림자(초록끼 살짝)도 발 영역(y>870) 한정 배경 처리
yy = np.arange(A.shape[0])[:, None]
bg |= (yy > 870) & (lum0 < 90) & (G > R + 10)

fig = ~bg
# 최대 연결성분만 (배경 노이즈 제거)
lbl, n = ndi.label(fig)
if n > 1:
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    fig = lbl == (1 + int(np.argmax(sizes)))
# 몸통 내부 비침(구멍) 전부 메움 — "비침 0" 유지
fig = ndi.binary_fill_holes(fig)
# fill_holes 가 굽 뒤 그림자 포켓을 되살리므로 발 영역 그림자는 메움 후 다시 깎는다
fig &= ~((yy > 870) & (lum0 < 90) & (G > R + 10))
# 경계 1px 정리(스필 프린지 제거)만 — 밑창 보호를 위해 erosion 1회만
fig = ndi.binary_erosion(fig, iterations=1)

# ── 2) 알파: 부드러운 엣지 + 크리스프닝 ──
a = ndi.gaussian_filter(fig.astype(np.float32), 0.8)
a = np.clip((a - 0.25) / 0.5, 0, 1)

# ── 3) despill: 경계의 녹색 번짐 제거 ──
rgb = A.copy()
mx = np.maximum(rgb[..., 0], rgb[..., 2])
rgb[..., 1] = np.minimum(rgb[..., 1], mx + 8)
# 스필이 심한 픽셀(원본 excess 40↑)은 무채색(휘도 그레이)으로 → 연두 프린지 제거
spill = np.clip((excess - 40) / 90, 0, 1)[..., None]
lum = (0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2])[..., None]
rgb = rgb * (1 - spill) + np.repeat(lum, 3, axis=2) * spill

# ── 4) 피사체 bbox 크롭 (여백 10px) 후 저장 ──
ys, xs = np.where(a > 0.05)
pad = 10
y0, y1 = max(0, ys.min() - pad), min(A.shape[0], ys.max() + 1 + pad)
x0, x1 = max(0, xs.min() - pad), min(A.shape[1], xs.max() + 1 + pad)
out = np.dstack([rgb, a * 255])[y0:y1, x0:x1].astype(np.uint8)
img = Image.fromarray(out, 'RGBA')
# 기존과 비슷한 크기로 축소(폭 500 근처) — 홈에서 max 560px 로 표시됨
scale = 560 / img.width
img = img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)
img.save(OUT)
print('wrote', OUT, img.size)

# 검증용 프리뷰(어두운 배경 합성)
prev = Image.new('RGBA', img.size, (25, 28, 55, 255))
prev.alpha_composite(img)
prev.convert('RGB').save(OUT.replace('public/img/astronaut.png', '.tmp_astronaut_preview_check.png'))  # public 밖에 저장(배포 오염 방지)
print('preview saved')
