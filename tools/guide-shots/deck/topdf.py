#!/usr/bin/env python3
# 슬라이드 그림(01.jpg …)을 한 권의 PDF 로 묶는다.
#   쓰기: python3 tools/guide-shots/deck/topdf.py <그림폴더> <내보낼 PDF>
#   왜 브라우저 인쇄 대신 이걸 쓰나 — page.pdf() 는 PNG 를 그대로 심어 7MB 를 넘겼다.
#   같은 그림을 JPEG 로 묶으면 1/3 이하가 되고, 눈으로는 차이가 없다.
import sys, glob, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
files = sorted(glob.glob(os.path.join(src, '[0-9][0-9].jpg')))
if not files:
    sys.exit('그림을 찾지 못했습니다: ' + src)
pages = [Image.open(f).convert('RGB') for f in files]
pages[0].save(out, save_all=True, append_images=pages[1:], resolution=96.0, quality=88)
print(f'✅ PDF {len(files)}장 → {out} ({os.path.getsize(out)//1024} KB)')
