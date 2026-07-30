"""
🖼 학부모 대시보드(parent.html) 신규 아이콘 2장 빌더 — Higgsfield(nano_banana_2) 1024x1024 → 256px webp
기존 build-allmenu-icons.py 와 완전히 같은 가공 파이프라인(bbox 정규화)을 재사용한다.

  python build-parent-icons.py

산출: public/img/menu/payment.webp, public/img/menu/badge.webp (256px, 검은배경 스타일 통일)
원본: parent_icon_src/*.png (재가공용, 깃에 커밋 안 함)
"""
import os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, 'parent_icon_src')
OUT = os.path.join(D, 'public', 'img', 'menu')

OUT_PX = 256
MARGIN = 0.06
BG_THRESH = 55   # allmenu 아이콘과 동일 임계값 — 확산광은 버리고 피사체 하이라이트만 남김
WEBP_Q = 82

# badge.png는 배경 확산광(청록/앰버)이 55 임계값에서 프레임 전체(100% 채움)를 삼켜버려
# bbox 정규화가 무력화됐다(allmenu 때와 같은 함정). 메달의 진짜 하이라이트만 남도록 개별 상향.
BG_THRESH_OVERRIDE = {'badge': 175}

ITEMS = ['payment', 'badge']


def bbox_of(im, thresh):
    g = np.asarray(im.convert('L'), dtype=np.uint8)
    mask = g > thresh
    if not mask.any():
        return (0, 0, im.width, im.height)
    ys = np.where(mask.any(axis=1))[0]
    xs = np.where(mask.any(axis=0))[0]
    return (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)


def process(slug):
    im = Image.open(os.path.join(SRC, slug + '.png')).convert('RGB')
    thresh = BG_THRESH_OVERRIDE.get(slug, BG_THRESH)
    x0, y0, x1, y1 = bbox_of(im, thresh)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    side = max(x1 - x0, y1 - y0) * (1.0 + 2 * MARGIN)

    half = side / 2.0
    box = (int(round(cx - half)), int(round(cy - half)),
           int(round(cx + half)), int(round(cy + half)))
    canvas = Image.new('RGB', (box[2] - box[0], box[3] - box[1]), (0, 0, 0))
    sx0, sy0 = max(0, box[0]), max(0, box[1])
    sx1, sy1 = min(im.width, box[2]), min(im.height, box[3])
    canvas.paste(im.crop((sx0, sy0, sx1, sy1)), (sx0 - box[0], sy0 - box[1]))

    out = canvas.resize((OUT_PX, OUT_PX), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, slug + '.webp')
    out.save(p, 'WEBP', quality=WEBP_Q, method=6)
    fill = (x1 - x0) * (y1 - y0) / float(im.width * im.height)
    print('  %-9s bbox=%dx%d fill=%.0f%%  %dKB' %
          (slug, x1 - x0, y1 - y0, fill * 100, os.path.getsize(p) // 1024))


if __name__ == '__main__':
    for s in ITEMS:
        process(s)
    total = sum(os.path.getsize(os.path.join(OUT, s + '.webp')) for s in ITEMS)
    print('done - %d files, total %.0f KB' % (len(ITEMS), total / 1024))
