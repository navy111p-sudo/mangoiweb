"""
🎣 낚시게임(english-mastery-suite.html #fish) 크리처 실사화 에셋 빌더

Higgsfield 그린스크린 시트를 게임이 읽는 webp 로 굽는다.
키잉/디스필 로직은 build-shooter-assets.py 와 동일 계열(검증된 것)이고, 배치만 다르다.

  python build-fish-atlas.py            # 전부
  python build-fish-atlas.py bg         # 바닷물 배경만
  python build-fish-atlas.py mons       # 크리처 8종만

산출(public/img/, 합계 약 300~400KB 예상):
  fish-ocean-bg.webp     배경 (알파 없음, 1200px 폭)
  fish-mon-<id>.webp     크리처 8종 (알파, 220x220 정사각)

⚠ 원본 png 는 game_image/ 에만 둔다. public/ 에 두면 배포에 그대로 실린다.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
SRC = 'C:/Users/Admin/Desktop/mangoi_develop2-main/game_image/'
OUT = D + 'public/img/'

# ── 배경 ────────────────────────────────────────────────────────────────────
BG_SRC = SRC + 'fish-ocean-bg.png'
BG_W = 1200

# ── 크리처: 4x2 그린스크린 시트 ─────────────────────────────────────────────
MON_SRC = SRC + 'fish-mon-sheet.png'
MON_GRID = (4, 2)   # 4열 2행
MONS = [
    (0, 'clown', {}),     # 흰동가리(clownfish)
    (1, 'fish', {}),      # 열대어
    (2, 'puffer', {}),    # 복어
    (3, 'shark', {}),     # 상어
    (4, 'dolphin', {}),   # 돌고래
    (5, 'squid', {}),     # 오징어
    (6, 'octopus', {}),   # 문어
    (7, 'shrimp', {}),    # 새우
]
MON_BOX = 220   # 가로화면 최대 표시 ~110px(#fish .fish .face clamp) 라 220 이면 레티나까지 충분

KEY_EX, KEY_G = 34, 55


def despill(rgb):
    """가장자리에 남은 초록끼 제거 — 반드시 키잉 '뒤'에만."""
    out = rgb.copy()
    mx = np.maximum(out[..., 0], out[..., 2])
    out[..., 1] = np.minimum(out[..., 1], mx + 8)
    return out


def largest(mask):
    lbl, n = ndi.label(mask)
    if n == 0:
        return mask
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    return lbl == (1 + int(np.argmax(sizes)))


def fill_small_holes(fig, maxarea):
    filled = ndi.binary_fill_holes(fig)
    holes = filled & ~fig
    lbl, n = ndi.label(holes)
    if n == 0:
        return fig
    out = fig.copy()
    for i in range(1, n + 1):
        comp = (lbl == i)
        if comp.sum() < maxarea:
            out |= comp
    return out


def key_green(rgb, erode=2, keep_largest=True, hole=600, ex=None, gmin=None):
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bg = ((G - np.maximum(R, B)) > (KEY_EX if ex is None else ex)) & (G > (KEY_G if gmin is None else gmin))
    fig = ~bg
    if keep_largest:
        fig = largest(fig)
    fig = fill_small_holes(fig, hole)
    fig = ndi.binary_opening(fig, iterations=2)
    if keep_largest:
        fig = largest(fig)
    if erode:
        fig = ndi.binary_erosion(fig, iterations=erode)
    a = ndi.gaussian_filter(fig.astype(np.float32), 1.2)
    return np.clip((a - 0.30) / 0.42, 0, 1)


def cell_rgb(A, cell, grid, inset_frac=0.012):
    H, W, _ = A.shape
    cols, rows = grid
    c, r = cell % cols, cell // cols
    cw, ch = W / cols, H / rows
    x0, x1 = int(c * cw), int((c + 1) * cw)
    y0, y1 = int(r * ch), int((r + 1) * ch)
    ix, iy = int(cw * inset_frac), int(ch * inset_frac)
    return A[y0 + iy:y1 - iy, x0 + ix:x1 - ix].copy()


def piece(A, cell, grid, erode=2, keep_largest=True, hole=600, ex=None, gmin=None):
    raw = cell_rgb(A, cell, grid)
    a = key_green(raw, erode=erode, keep_largest=keep_largest, hole=hole, ex=ex, gmin=gmin)
    rgb = despill(raw)
    a[:3, :] = 0
    a[-3:, :] = 0
    a[:, :3] = 0
    a[:, -3:] = 0
    ys, xs = np.where(a > 0.2)
    if len(ys) == 0:
        return None, None
    return rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def to_rgba(rgb, a):
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')


def build_bg():
    import os
    if not os.path.exists(BG_SRC):
        print('  -- 배경 소스 없음, 건너뜀:', BG_SRC)
        return
    im = Image.open(BG_SRC).convert('RGB')
    h = round(BG_W * im.height / im.width)
    im = im.resize((BG_W, h), Image.LANCZOS)
    p = OUT + 'fish-ocean-bg.webp'
    im.save(p, 'WEBP', quality=82, method=6)
    print('bg   %dx%d  %.0fKB  %s' % (BG_W, h, os.path.getsize(p) / 1024, p))


def build_mons():
    import os
    if not os.path.exists(MON_SRC):
        print('  -- 크리처 시트 없음, 건너뜀:', MON_SRC)
        return
    A = np.asarray(Image.open(MON_SRC).convert('RGB')).astype(np.float32)
    for cell, mid, opt in MONS:
        rgb, a = piece(A, cell, MON_GRID, **opt)
        if rgb is None:
            print('  !! 빈 셀', cell, mid)
            continue
        ph, pw = a.shape
        s = min(MON_BOX / pw, MON_BOX / ph)
        nw, nh = max(1, round(pw * s)), max(1, round(ph * s))
        im = to_rgba(rgb, a).resize((nw, nh), Image.LANCZOS)
        canvas = Image.new('RGBA', (MON_BOX, MON_BOX), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((MON_BOX - nw) // 2, MON_BOX - nh))
        p = OUT + 'fish-mon-%s.webp' % mid
        canvas.save(p, 'WEBP', quality=82, method=6)
        print('mon  %-8s 내용 %dx%d → %dx%d  %.0fKB'
              % (mid, nw, nh, MON_BOX, MON_BOX, os.path.getsize(p) / 1024))


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'bg'):
        build_bg()
    if what in ('all', 'mons'):
        build_mons()
