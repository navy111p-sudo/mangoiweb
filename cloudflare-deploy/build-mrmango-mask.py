#!/usr/bin/env python3
"""미스터 망고 실사 페이스(그린스크린) → 화상수업 '얼굴 꾸미기' 가면 소재

  입력 : cloudflare-deploy/Mr.Mango실사.png   (2048x2048, 순수 그린 배경 + 전시대)
  출력 : cloudflare-deploy/public/face-fx/r/mrmango.png

face-fx/r/*.png 와 같은 규격으로 만든다.
  1. 전시대(받침 + 바닥)는 크로마키로 못 지운다(초록이 아님) → 먼저 y 로 잘라낸다.
  2. 크로마키(초록 우세도 기준) + 디스필(초록 반사광 제거)
  3. 알파 1px 수축 + 약한 블러 → 초록 실선 잔재 제거
  4. 내용 bbox 로 크롭. 배치는 idx-x6.js 의 FX_ITEMS scale/imgYOff 가 담당하므로 여백을 남기지 않는다.
  5. 마지막에 FX_ITEMS 에 넣을 scale/imgYOff 를 계산해서 출력한다.
     - anchor 'face' 는 이미지 '가로' 폭 = faceW * scale, 중심 = 이마~턱 중점.
     - 헤드폰·잎이 망고 머리보다 넓고 높으므로 그대로 두면 얼굴을 못 덮는다.
       → 망고 머리(헤드폰·잎 제외)만 따로 재서 역산한다.
"""

import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'Mr.Mango실사.png')
OUT = os.path.join(HERE, 'public', 'face-fx', 'r', 'mrmango.png')

# 전시대 윗면보다 위, 망고 턱끝보다 아래 (원본 2048 기준). 여기서 자르면 받침·바닥·케이블이 통째로 빠진다.
CUT_Y = 1712

# 망고 머리를 드러난 얼굴 폭(faceW)의 몇 배로 그릴지.
#   1.70 = 사람 실제 머리보다 16% 큰 크기(= 확실히 다 덮음). 첫 배포값이었는데
#   실제 화면에서 "몸에 비해 얼굴이 크다"는 피드백 → 1.40 으로 낮춤(가로 -18%, 면적 -32%).
#   ⚠️ 1.35 아래로 내리면 턱이 망고 밑으로 삐져나온다. 실측 기준선이니 함부로 낮추지 말 것.
HEAD_TO_FACE = 1.40

# 세로 미세조정(size 비율, +면 아래로). 순수 기하학적 중심맞춤(-0.041)에 더해진다.
#   +0.07 이었다가 -0.02 로 뒤집혔다. 이유:
#     1차 — 크기를 줄이면 턱이 삐져나올까 봐 아래로 밀었다(+0.07).
#     2차 — 실제 화면에서 **망고가 턱보다 19px 아래까지 내려와 목을 가렸다**("목이 보이게 해줘").
#           턱이 나오는 것보다 목이 안 보이는 게 먼저 눈에 띄는 문제였다.
#   -0.02 = 캡처 실측으로 망고 아래끝을 턱선(+1px)에 맞춘 값. 더 올리면 턱이 드러난다.
Y_BIAS = -0.02

# 출력 긴 변 픽셀. 그리드 썸네일도 이 파일을 그대로 받으므로 무작정 키우면 안 된다.
#   (기존 소재 150~170px / 30~56KB. 망고는 피부 결이 있어 224px = 약 78KB 로 맞췄다)
MAX_SIDE = 224


def key_green(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]

    # 초록 우세도 — G 가 R/B 중 큰 쪽보다 얼마나 큰가. 조명 그라데이션에 강하다.
    excess = G - np.maximum(R, B)
    LO, HI = 18.0, 65.0
    alpha = np.clip((HI - excess) / (HI - LO), 0.0, 1.0)

    # 디스필 — 남는 픽셀의 초록 반사광 억제 (망고 노란색이 상하지 않게 0.85 로 제한)
    G2 = G - np.clip(excess, 0, None) * 0.85
    rgba = np.concatenate([np.clip(np.stack([R, G2, B], -1), 0, 255),
                           (alpha * 255)[..., None]], axis=-1).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')

    al = img.getchannel('A')
    al = al.filter(ImageFilter.MinFilter(3))       # 1px 수축 = 초록 실선 제거
    al = al.filter(ImageFilter.GaussianBlur(1.0))  # 경계 부드럽게
    img.putalpha(al)

    arr = np.asarray(img).copy()
    arr[..., 3][arr[..., 3] < 10] = 0              # 유령 픽셀 제거
    return Image.fromarray(arr, 'RGBA')


def head_box(img: Image.Image):
    """헤드폰(검정·빨강)·잎(초록)을 뺀 '망고 살' 픽셀의 bbox.

    망고 = 노랑~주황(R 이 B 보다 확실히 큼) + 어느 정도 밝음.
    눈·입 같은 어두운 부분은 빠지지만 bbox 는 바깥 살이 결정하므로 문제 없다."""
    a = np.asarray(img).astype(np.int16)
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mango = (A > 200) & (R > 110) & (R - B > 45) & (G - B > 20)

    # 헤드폰의 빨강 포인트·잎맥 하이라이트가 몇 픽셀씩 걸린다. 그대로 min/max 를 쓰면
    # 머리 폭이 실제보다 20% 넘게 부풀어 scale 이 어긋난다 → 열·행별 개수로 잡티를 버린다.
    def span(counts):
        thr = counts.max() * 0.05
        idx = np.nonzero(counts > thr)[0]
        return int(idx.min()), int(idx.max()) + 1

    x0, x1 = span(mango.sum(axis=0))
    y0, y1 = span(mango.sum(axis=1))
    return x0, y0, x1, y1


def main():
    src = Image.open(SRC)
    print('원본', src.size, src.mode)

    cut = src.crop((0, 0, src.width, CUT_Y))
    keyed = key_green(cut)

    bb = keyed.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    print('내용 bbox', bb)
    img = keyed.crop(bb)

    hb = head_box(img)
    print('망고 머리 bbox(크롭 후)', hb, '/ 이미지', img.size)

    # 축소는 머리 bbox 측정 후에 (비율만 쓰므로 순서는 무관하지만 측정 정밀도를 위해)
    W, H = img.size
    hx0, hy0, hx1, hy1 = hb
    head_w_ratio = (hx1 - hx0) / W                       # 이미지 폭 대비 망고 머리 폭
    head_cx_ratio = ((hx0 + hx1) / 2) / W                # 머리 중심 x (0~1)
    head_cy_ratio = ((hy0 + hy1) / 2) / H                # 머리 중심 y (0~1)

    scale = HEAD_TO_FACE / head_w_ratio                  # 이미지 전체 폭 배율
    center_y_off = -(head_cy_ratio - 0.5) * (H / W)      # 망고 머리 중심을 배치 원점에 맞추는 값
    img_y_off = center_y_off + Y_BIAS                    # + 목이 보이게 하는 세로 보정
    x_off_ratio = head_cx_ratio - 0.5                    # 0 에 가까우면 좌우 대칭

    if MAX_SIDE and max(img.size) > MAX_SIDE:
        r = MAX_SIDE / max(img.size)
        img = img.resize((max(1, round(W * r)), max(1, round(H * r))), Image.LANCZOS)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, optimize=True)
    print('저장', OUT, img.size, os.path.getsize(OUT), 'bytes')
    print()
    print('── FX_ITEMS 권장값 ──')
    print('  머리폭/이미지폭 = %.4f   머리중심 x=%.4f y=%.4f' % (head_w_ratio, head_cx_ratio, head_cy_ratio))
    print('  좌우 치우침(0 이면 대칭) = %+.4f' % x_off_ratio)
    print('  scale   = %.2f   (HEAD_TO_FACE=%.2f)' % (scale, HEAD_TO_FACE))
    print('  imgYOff = %+.3f  (중심맞춤 %+.3f + 세로보정 %+.2f)' % (img_y_off, center_y_off, Y_BIAS))


if __name__ == '__main__':
    main()
