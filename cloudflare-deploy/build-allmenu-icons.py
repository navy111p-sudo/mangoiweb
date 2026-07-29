"""
📋 전체메뉴 26칸 실사 아이콘 빌더 — Higgsfield(nano_banana_2) 1024x1024 PNG 26장 → 256px webp 26장

  python build-allmenu-icons.py            # 다운로드 + 가공 + 대조시트
  python build-allmenu-icons.py sheet      # 이미 받은 원본으로 가공만 (재다운로드 안 함)

왜 바운딩박스 정규화를 하는가:
  생성 모델은 "화면 중앙에 오브젝트 하나"를 지켜도 **피사체가 프레임을 채우는 비율**은 장마다 제멋대로다.
  그대로 쓰면 어떤 칸은 아이콘이 크고 어떤 칸은 콩알만 해서 26칸이 한 세트로 안 읽힌다.
  → 검은 배경 대비 밝은 픽셀의 bbox 를 찾아 정사각으로 펴고, 여백 비율을 26장 모두 동일(MARGIN)하게 맞춘다.

산출:
  menu_image/<slug>.png          원본 1024 (재가공용, 깃에 커밋 안 함)
  public/img/menu/<slug>.webp    실제 서비스가 읽는 파일 (256px)
  menu_image/_contact-sheet.jpg  눈검증용 대조시트
"""
import sys, os, io, json, urllib.request
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(D, 'menu_image')
OUT = os.path.join(D, 'public', 'img', 'menu')

OUT_PX = 256          # 최종 한 변(px). 카드에서 72px 표시 → 레티나 3.5배
MARGIN = 0.06         # 피사체 bbox 바깥 여백 비율(정사각 한 변 대비). 26장 공통
# 이 밝기 이하는 '검은 배경'으로 본다 (0~255).
# ⚠ 20 으로 두면 화면 전체에 깔린 은은한 글로우까지 피사체로 쳐서 bbox 가 1024x1024 가 되고,
#   그 장만 크기 정규화가 통째로 무력화된다(첫 시도에서 5/26장이 그랬다). 확산광은 버리고
#   실제 피사체의 하이라이트만 남기도록 높게 잡는다.
BG_THRESH = 55
WEBP_Q = 82

# slug: (원본 URL)
ITEMS = {
 'admin':      'hf_20260729_175250_b7031e1e-de9d-4a02-9b93-dfe1a29f954f',
 'mypage':     'hf_20260729_175253_e5910284-4055-464e-a12e-c424804fa33f',
 'students':   'hf_20260729_175258_1eea350d-d8eb-4b03-a1f6-8dd3df7056f1',
 'schedule':   'hf_20260729_175301_0cddac5d-7993-4ec0-b9bc-6d88059bf45d',
 'contact':    'hf_20260729_175305_339b8c20-b0f6-4dfc-a6a6-51f610aa9ff9',
 'curriculum': 'hf_20260729_175308_167abb65-cfad-4f80-9db8-0446fb88af4f',
 'lessons':    'hf_20260729_175312_1040192b-13cf-4c28-9228-daec48662742',
 'eval':       'hf_20260729_175315_40134707-7813-4b0d-8818-4d696b55abd9',
 'report':     'hf_20260729_175318_b8fd0f14-6973-4803-8b85-6b3963dff18d',
 'ai-friend':  'hf_20260729_175328_0792121e-4fac-4eb6-a303-fd7dc5faeb81',
 'ai-write':   'hf_20260729_175332_e68e3953-eb44-4100-a948-cc50f4c38154',
 'speech':     'hf_20260729_175335_eafe0a1d-1b0f-4d62-a0d2-6c27fa798e5e',
 'speech-cn':  'hf_20260729_175339_f977e099-6ad7-4810-ba17-53f134a69a25',
 'uploader':   'hf_20260729_175342_365f9940-7dea-418c-ab1a-ae2b704c2dc0',
 'vocab':      'hf_20260729_175346_50d2c540-f5fb-4217-b4ea-e9ed6b5e903f',
 'quiz':       'hf_20260729_175349_9cf01b71-318d-4d9c-8dcb-1834bc99e776',
 'mbti':       'hf_20260729_175352_8e4d1ba2-3146-4639-b67b-ca1f08637a13',
 'mbti-test':  'hf_20260729_175357_4b9d586e-abd2-42e5-bfda-c891e7bdd146',
 'streak':     'hf_20260729_175404_db67085e-2ebb-4960-b5c3-332be8786b4b',
 # 1차 생성분(e43431ba)은 별이 구겨진 금박처럼 나와 '별'로 안 읽혀서 재생성했다.
 'praise':     'hf_20260729_180002_2ab3b5d7-e0b2-43d5-8934-6edb2b9d2ef7',
 'booking':    'hf_20260729_175413_57b4cc4d-e2a7-418f-8ca4-ece3b4f9d8a1',
 'postpone':   'hf_20260729_175416_ac065550-30d6-4600-a098-42e6b55b5043',
 'parent':     'hf_20260729_175420_c7675f1e-39a2-4cf2-ae40-72ce5824e406',
 'health':     'hf_20260729_175423_a0dfb354-23a3-4d6e-8251-3ac73fbc0dc6',
 'observe':    'hf_20260729_175427_aab66bc3-a2ba-466f-8090-b057dca51c9c',
 'login':      'hf_20260729_175431_0f79cec5-5dda-4258-8728-0d2c35b5d193',
}
CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/'


def download():
    os.makedirs(SRC, exist_ok=True)
    for slug, stem in ITEMS.items():
        dst = os.path.join(SRC, slug + '.png')
        if os.path.exists(dst):
            print('  skip (있음)', slug); continue
        url = CDN + stem + '.png'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
        with open(dst, 'wb') as f:
            f.write(data)
        print('  받음', slug, len(data) // 1024, 'KB')


def bbox_of(im):
    """검은 배경 위 피사체의 bbox. 글로우까지 포함되도록 낮은 임계값 사용."""
    g = np.asarray(im.convert('L'), dtype=np.uint8)
    mask = g > BG_THRESH
    if not mask.any():
        return (0, 0, im.width, im.height)
    ys = np.where(mask.any(axis=1))[0]
    xs = np.where(mask.any(axis=0))[0]
    return (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)


def process(slug):
    im = Image.open(os.path.join(SRC, slug + '.png')).convert('RGB')
    x0, y0, x1, y1 = bbox_of(im)
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    side = max(x1 - x0, y1 - y0) * (1.0 + 2 * MARGIN)

    # 정사각 크롭 창이 원본을 벗어나면 검정으로 패딩(잘라내지 않는다)
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
    print('  %-11s bbox=%dx%d 채움率=%.0f%%  %dKB' %
          (slug, x1 - x0, y1 - y0, fill * 100, os.path.getsize(p) // 1024))
    return out


def contact_sheet(tiles):
    cols, cell, pad = 6, 150, 10
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (cell + pad) + pad, rows * (cell + pad) + pad), (14, 17, 32))
    for i, (slug, im) in enumerate(tiles):
        r, c = divmod(i, cols)
        sheet.paste(im.resize((cell, cell), Image.LANCZOS),
                    (pad + c * (cell + pad), pad + r * (cell + pad)))
    p = os.path.join(SRC, '_contact-sheet.jpg')
    sheet.save(p, 'JPEG', quality=88)
    print('대조시트:', p)


if __name__ == '__main__':
    if 'sheet' not in sys.argv:
        print('▼ 다운로드')
        download()
    print('▼ 가공')
    tiles = [(s, process(s)) for s in ITEMS]
    contact_sheet(tiles)
    total = sum(os.path.getsize(os.path.join(OUT, s + '.webp')) for s in ITEMS)
    print('완료 — %d장, 합계 %.0f KB' % (len(ITEMS), total / 1024))
