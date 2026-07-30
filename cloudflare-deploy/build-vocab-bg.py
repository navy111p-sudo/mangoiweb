"""
단어장(vocab.html) 배경 빌더 — Higgsfield(nano_banana_2) 1376x768 PNG -> public/img/vocab-bg.webp

  python build-vocab-bg.py

프롬프트 재현: 블루/바이올렛 네뷸라 + 우상단 골드 별무리, 중앙~좌하단은 비워둠(콘텐츠 자리,
크롭 안전성 기준은 home-bg-photoreal-deepfield와 동일한 이유). 16:9, resolution 기본 1k.
원본: vocab_bg_src/vocab-bg.png (재가공용, 깃에 커밋 안 함)
"""
import os
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, 'vocab_bg_src', 'vocab-bg.png')
OUT = os.path.join(D, 'public', 'img', 'vocab-bg.webp')
OUT_W = 1600
WEBP_Q = 80

if __name__ == '__main__':
    im = Image.open(SRC).convert('RGB')
    out = im.resize((OUT_W, int(OUT_W * im.height / im.width)), Image.LANCZOS)
    out.save(OUT, 'WEBP', quality=WEBP_Q, method=6)
    print('done -', os.path.getsize(OUT) // 1024, 'KB ->', OUT)
