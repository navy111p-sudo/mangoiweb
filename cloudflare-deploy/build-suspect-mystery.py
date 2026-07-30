"""
🕵️ 용의자 추리(suspect-mystery.html) 실사화 빌더 — Higgsfield(nano_banana_2) → public/img/*.webp
이모지 아바타(교사·용의자4명)와 배경을 3D Pixar풍 실사 포트레이트/배경으로 교체.

  python build-suspect-mystery.py

산출:
  public/img/suspect-leo.webp / suspect-zoe.webp / suspect-mia.webp / suspect-max.webp
  public/img/suspect-teacher.webp
  public/img/suspect-bg.webp
원본: suspect_img_src/*.png (재가공용, 깃에 커밋 안 함)
"""
import os
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, 'suspect_img_src')
OUT = os.path.join(D, 'public', 'img')

PORTRAIT_PX = 360
WEBP_Q = 82
BG_OUT_W = 1600
BG_WEBP_Q = 78

PORTRAITS = {
    'leo.png': 'suspect-leo.webp',
    'zoe.png': 'suspect-zoe.webp',
    'mia.png': 'suspect-mia.webp',
    'max.png': 'suspect-max.webp',
    'teacher.png': 'suspect-teacher.webp',
}


def process_portrait(src_name, out_name):
    p = os.path.join(SRC, src_name)
    if not os.path.exists(p):
        print('  skip (missing):', src_name)
        return
    im = Image.open(p).convert('RGB')
    # 정사각형이 아니면 중앙 크롭
    w, h = im.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        im = im.crop((left, top, left + side, top + side))
    out = im.resize((PORTRAIT_PX, PORTRAIT_PX), Image.LANCZOS)
    outp = os.path.join(OUT, out_name)
    out.save(outp, 'WEBP', quality=WEBP_Q, method=6)
    print('  %-20s %dKB' % (out_name, os.path.getsize(outp) // 1024))


def process_bg():
    p = os.path.join(SRC, 'bg.png')
    if not os.path.exists(p):
        print('  skip (missing): bg.png')
        return
    im = Image.open(p).convert('RGB')
    out_h = int(BG_OUT_W * im.height / im.width)
    out = im.resize((BG_OUT_W, out_h), Image.LANCZOS)
    outp = os.path.join(OUT, 'suspect-bg.webp')
    out.save(outp, 'WEBP', quality=BG_WEBP_Q, method=6)
    print('  %-20s %dKB' % ('suspect-bg.webp', os.path.getsize(outp) // 1024))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_name in PORTRAITS.items():
        process_portrait(src_name, out_name)
    process_bg()
    print('done')
