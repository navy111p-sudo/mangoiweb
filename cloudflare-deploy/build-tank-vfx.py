"""
🎯 탱크대전(student-game-tank-battle.html) 포격 이펙트 실사화

Higgsfield(nano_banana_2) 로 만든 그린스크린 포구섬광/폭발 이미지를 게임이 읽는 webp 로 굽는다.
키잉/디스필 로직은 build-shooter-assets.py 와 동일 계열(검증된 것) — 그리드가 없는 단일 이미지판.

  python build-tank-vfx.py

산출(public/img/):
  tank-vfx-muzzle.webp    포구섬광(정사각, 384x384 캔버스에 contain)
  tank-vfx-explosion.webp 명중 폭발(정사각, 640x640 캔버스에 contain)

⚠ 원본 png 는 game_image/ 에만 둔다. public/ 에 두면 배포에 그대로 실린다.
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'
SRC = 'C:/Users/Admin/Desktop/mangoi_develop2-main/game_image/'
OUT = D + 'public/img/'

# 그린 키: 배경 excess(G-max(R,B)) 는 100 이상, 피사체(주황/노랑 불꽃)는 0 근처 → 34 가 갭 한가운데
KEY_EX, KEY_G = 34, 55


def despill(rgb):
    """가장자리(특히 반투명한 연기 페더)에 남은 초록끼 제거 — 반드시 키잉 '뒤'에만.
    연기/불꽃은 진짜 초록이 없는 피사체라, max(R,B) 로 살짝 눌러도 반투명 경계에
    초록 배경이 섞여든 픽셀엔 여전히 올리브색 테두리가 남는다(1차 시도에서 실측).
    (R+B)/2 로 더 세게 눌러 배경 혼입분을 확실히 지운다."""
    out = rgb.copy()
    avg = (out[..., 0].astype(np.float32) + out[..., 2].astype(np.float32)) / 2
    out[..., 1] = np.minimum(out[..., 1], avg + 4)
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


def key_green(rgb, erode=2, hole=4000):
    """불꽃/연기 이펙트는 조각(스파크·파편)이 사방에 흩어져 있어 largest 로 고르면 안 된다
    (largest 는 크리처처럼 '하나의 덩어리'용) — 여기선 전부 유지."""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bg = ((G - np.maximum(R, B)) > KEY_EX) & (G > KEY_G)
    fig = ~bg
    fig = fill_small_holes(fig, hole)
    fig = ndi.binary_opening(fig, iterations=1)
    if erode:
        fig = ndi.binary_erosion(fig, iterations=erode)
    a = ndi.gaussian_filter(fig.astype(np.float32), 1.2)
    return np.clip((a - 0.30) / 0.42, 0, 1)


def build_vfx(name, out_id, box):
    path = SRC + name
    if not os.path.exists(path):
        print('  -- 소스 없음, 건너뜀:', name)
        return
    raw = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    a = key_green(raw)
    rgb = despill(raw)
    a[:3, :] = 0
    a[-3:, :] = 0
    a[:, :3] = 0
    a[:, -3:] = 0
    ys, xs = np.where(a > 0.2)
    if len(ys) == 0:
        print('  !! 빈 이미지', name)
        return
    rgb = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
    s = min(box / im.width, box / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new('RGBA', (box, box), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((box - nw) // 2, (box - nh) // 2))   # 중앙 정렬(격파 스프라이트는 위치 기준점이 중심)
    p = OUT + out_id + '.webp'
    canvas.save(p, 'WEBP', quality=84, method=6)
    print('%-18s 내용 %dx%d → %dx%d  %.0fKB  %s' % (out_id, nw, nh, box, box, os.path.getsize(p) / 1024, p))


def build_shell(name, out_id, max_w):
    """포탄은 폭발/섬광과 달리 정사각 스프라이트가 아니라 길쭉한 평면 메시에 그대로 입힌다
    (스케일 균일한 빌보드가 아니라 회전하는 판이라 원본 종횡비를 그대로 써야 늘어나 보이지 않음).
    여백 없이 내용 bbox 그대로 저장 — 정사각 캔버스에 넣지 않는다."""
    path = SRC + name
    if not os.path.exists(path):
        print('  -- 소스 없음, 건너뜀:', name)
        return
    raw = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    a = key_green(raw, erode=1, hole=2000)   # 모션블러 꼬리가 가늘어 erode 를 약하게(세게 깎으면 꼬리가 끊김)
    rgb = despill(raw)
    a[:3, :] = 0
    a[-3:, :] = 0
    a[:, :3] = 0
    a[:, -3:] = 0
    ys, xs = np.where(a > 0.15)   # 꼬리 페더가 여리므로 임계값을 살짝 낮춰 꼬리 끝까지 살린다
    if len(ys) == 0:
        print('  !! 빈 이미지', name)
        return
    rgb = rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    im = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
    s = min(1.0, max_w / im.width)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    p = OUT + out_id + '.webp'
    im.save(p, 'WEBP', quality=86, method=6)
    print('%-18s %dx%d  %.0fKB  %s' % (out_id, nw, nh, os.path.getsize(p) / 1024, p))


if __name__ == '__main__':
    build_vfx('tank-muzzle-flash.png', 'tank-vfx-muzzle', 384)
    build_vfx('tank-explosion.png', 'tank-vfx-explosion', 640)
    build_shell('tank-shell.png', 'tank-vfx-shell', 480)
