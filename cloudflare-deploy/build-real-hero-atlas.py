"""
🎬 실사(영화풍) 히어로 아틀라스 빌더 — Higgsfield(nano_banana_pro) 생성 그린스크린 3x2 시트 5장 → 5x5 22프레임 아틀라스

카툰판 build-astro-atlas.py 와 '아틀라스 레이아웃/프레임 순서'는 완전히 동일하다.
battle-3d.html 의 attachSpriteBillboard(5x5, cell 540x500) 상태머신을 그대로 쓰기 위해서다.
바뀐 것은 (1) 소스가 실사 시트, (2) 셀이 훨씬 고해상(1365x2048)이라 '축소'라서 선명화가 거의 필요없음,
(3) 카툰용 metal_enhance(채도-14%·강한 언샵) 대신 아주 약한 클래리티만 적용(실사 질감 보존).

  python build-real-hero-atlas.py            # 둘 다
  python build-real-hero-atlas.py astro      # 우주인만
  python build-real-hero-atlas.py dog        # 우주 강아지만

산출: public/<name>-real.webp (게임이 읽는 파일, 알파 포함) + public/<name>-real.png (원본) + _showcase.jpg (눈검증용)
시트 교체 시 SHEETS 경로만 바꾸고 재실행 + battle-3d.html 의 ?v= 를 올릴 것.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

D = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'

CHARS = {
    'astro': {
        'out': 'astro-real',
        'sheets': {
            'react':    D + 'game_image/real-astro-react.png',
            'sidekick': D + 'game_image/real-astro-sidekick.png',
            'flykick':  D + 'game_image/real-astro-flykick.png',
            'dash':     D + 'game_image/real-astro-dash.png',
            'victory':  D + 'game_image/real-astro-victory.png',
            # ↓ 부드러움 전용 시트(2차) — 큰 동작이 아니라 '한 동작을 6등분한 슬로모 프레임'
            'idle':     D + 'game_image/real-astro-idle.png',
            'punch':    D + 'game_image/real-astro-punch.png',
        },
    },
    'dog': {
        'out': 'dog-real',
        # ⚠ 시트마다 캐릭터가 보는 방향이 다르다. 강아지는 '가드로 복귀'(react·sidekick 6번 셀)만 왼쪽을 보고
        #   나머지 20프레임은 오른쪽(보스 쪽)을 본다. 하필 그 둘이 idle 프레임(0·1)이라 대기 중에 보스를
        #   등지고 서 있었다 → 이 두 프레임만 좌우반전. (판단 근거 = 꼬리 위치: 꼬리가 오른쪽이면 왼쪽을 보는 것)
        # ⚠ 2차로 추가한 idle 슬로모 시트(22~27)도 통째로 왼쪽을 본다. 게임의 대기 상태가 쓰는 게 0·1이 아니라
        #   바로 이 22~27(attachSpriteBillboard 의 IDLE 배열)이라, 여기를 안 뒤집으면 대기 중에 다시 보스를
        #   등진다. punch 시트(28~33)는 원본이 오른쪽을 보므로 건드리지 않는다.
        'flips': {0: True, 1: True, 22: True, 23: True, 24: True, 25: True, 26: True, 27: True},
        'sheets': {
            'react':    D + 'game_image/real-dog-react.png',
            'sidekick': D + 'game_image/real-dog-sidekick.png',
            'flykick':  D + 'game_image/real-dog-flykick.png',
            'dash':     D + 'game_image/real-dog-dash.png',
            'victory':  D + 'game_image/real-dog-victory.png',
            'idle':     D + 'game_image/real-dog-idle.png',
            'punch':    D + 'game_image/real-dog-punch.png',
        },
    },
}

GRID = {'cols': 3, 'rows': 2}
# 스케일 정규화 기준 셀(=똑바로 선 전신 포즈). 이 셀의 키(px)를 서로 맞춰 시트간 덩치 차이를 없앤다.
REFCELL = {'react': 5, 'sidekick': 5, 'flykick': 5, 'dash': 5, 'victory': 0, 'idle': 0, 'punch': 0}

# (sheet, cell, flip, lift)  lift = 셀높이 대비 공중부양 비율(날아차기용)
FRAMES = [
    ('react', 5, False, 0),      # 0  idle guard A
    ('sidekick', 5, False, 0),   # 1  idle guard B
    ('dash', 4, False, 0),       # 2  punch strike (lunge)
    ('sidekick', 0, False, 0),   # 3  sidekick chamber
    ('sidekick', 2, False, 0),   # 4  sidekick extend
    ('sidekick', 3, False, 0),   # 5  sidekick peak
    ('sidekick', 4, False, 0),   # 6  sidekick retract
    ('flykick', 0, False, 0),    # 7  fly crouch load
    ('flykick', 1, False, 0.16),  # 8  fly launch
    ('flykick', 3, False, 0.26),  # 9  fly extend (최고점)
    ('flykick', 4, False, 0.12),  # 10 fly descend
    ('flykick', 5, False, 0),    # 11 fly land
    ('react', 1, False, 0),      # 12 hit body flinch
    ('react', 2, False, 0),      # 13 hit head snap
    ('react', 3, False, 0),      # 14 death stagger
    ('dash', 1, False, 0),       # 15 dash push off
    ('dash', 2, False, 0),       # 16 dash stride1
    ('dash', 3, False, 0),       # 17 dash stride2
    ('victory', 1, False, 0),    # 18 victory fist pump
    ('victory', 0, False, 0),    # 19 victory v-sign
    ('victory', 3, False, 0),    # 20 victory chest thump
    ('react', 0, False, 0),      # 21 high guard block
    # ===== 2차: '부드러움' 프레임 =====
    # 큰 동작을 늘린 게 아니라 한 동작을 6등분한 슬로모 프레임이다. 인접 프레임 차이가 작아야
    # 크로스페이드가 잔상처럼 읽히고 실제로 부드러워진다(차이가 크면 몸이 두 겹으로 보이는 고스트).
    ('idle', 0, False, 0),       # 22 idle 숨쉬기 1 (기준 가드)
    ('idle', 1, False, 0),       # 23 idle 2 (들숨 시작)
    ('idle', 2, False, 0),       # 24 idle 3 (들숨 최고)
    ('idle', 3, False, 0),       # 25 idle 4 (날숨 시작)
    ('idle', 4, False, 0),       # 26 idle 5 (최저점)
    ('idle', 5, False, 0),       # 27 idle 6 (복귀 → 22로 루프)
    ('punch', 0, False, 0),      # 28 펀치 1 (가드)
    ('punch', 1, False, 0),      # 29 펀치 2 (와인드업)
    ('punch', 2, False, 0),      # 30 펀치 3 (출발)
    ('punch', 3, False, 0),      # 31 펀치 4 (2/3 뻗음)
    ('punch', 4, False, 0),      # 32 펀치 5 (임팩트)
    ('punch', 5, False, 0),      # 33 펀치 6 (회수)
]

COLS_A, ROWS_A = 6, 6            # 34프레임 → 6x6(36칸). ⚠ 바꾸면 battle-3d.html attachSpriteBillboard 의 COLS/ROWS 도 같이!
CELL_W, CELL_H = 540, 500
STAND_FRAC = 0.80      # 서있는 캐릭터가 셀 높이에서 차지하는 비율
BASE_FRAC = 0.975      # 발바닥이 놓이는 셀 내 y 비율

# 그린 키: 배경 excess(G-max(R,B)) 실측 84~96 / 피사체 <=10 → 34 는 갭 한가운데(그림자 진 초록 바닥도 77+라 안전)
KEY_EX, KEY_G = 34, 55


def despill(rgb):
    """가장자리에 남은 초록끼 제거 — 반드시 키잉 '뒤'에만 적용(먼저 하면 초록이 눌려 키가 실패)."""
    out = rgb.copy()
    mx = np.maximum(out[..., 0], out[..., 2])
    out[..., 1] = np.minimum(out[..., 1], mx + 8)
    return out


def clarity(rgb):
    """실사 질감 보존용 아주 약한 선명화 + 미세 콘트라스트(카툰판의 강한 언샵/채도감소 없음)."""
    x = rgb / 255.0
    blur = ndi.gaussian_filter(x, sigma=(1.1, 1.1, 0))
    x = np.clip(x + 0.28 * (x - blur), 0, 1)
    x = np.clip(0.5 + (x - 0.5) * 1.05, 0, 1)
    return x * 255.0


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


def key_green(rgb):
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    bg = ((G - np.maximum(R, B)) > KEY_EX) & (G > KEY_G)
    fig = ~bg
    fig = largest(fig)
    fig = fill_small_holes(fig, 40000)          # 셀이 커서(1365x2048) 구멍 허용치도 크게
    fig = ndi.binary_opening(fig, iterations=2)  # 초록 얼룩/노이즈 제거
    fig = largest(fig)
    fig = ndi.binary_erosion(fig, iterations=2)  # 초록 헤일로 1~2px 제거
    a = ndi.gaussian_filter(fig.astype(np.float32), 1.2)
    return np.clip((a - 0.30) / 0.42, 0, 1)      # 엣지 크리스프닝(부연 번짐 없이 AA만)


# ⚠ 2차 '부드러움' 시트는 생성기가 균일한 3x2 격자를 안 지킨다(인물이 행 경계를 넘거나 셀마다 크기가 다름).
#   → 이 시트들만 격자 가정을 버리고 **인물을 연결성분으로 자동 검출**하고, 크기도 **프레임별로 정규화**한다.
#     (제자리 슬로모라 키가 거의 일정 → 프레임별 정규화가 안전하고, 셀 간 덩치 튐을 없애준다)
AUTO_SHEETS = {'idle', 'punch'}
_auto_cache = {}


def find_figures_auto(A, key, n=6):
    if key in _auto_cache:
        return _auto_cache[key]
    R, G, B = A[..., 0], A[..., 1], A[..., 2]
    fig = ~(((G - np.maximum(R, B)) > KEY_EX) & (G > KEY_G))
    fig = ndi.binary_opening(fig, iterations=3)          # 격자선/먼지 제거
    lbl, k = ndi.label(fig)
    if k == 0:
        return []
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, k + 1))
    objs = ndi.find_objects(lbl)
    order = np.argsort(sizes)[::-1][:n]
    boxes = [(objs[i][0].start, objs[i][0].stop, objs[i][1].start, objs[i][1].stop) for i in order]
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)          # 세로 중심으로 위/아래 행 분리
    half = len(boxes) // 2
    out = []
    for row in (boxes[:half], boxes[half:]):
        row = sorted(row, key=lambda b: (b[2] + b[3]) / 2)   # 행 안에서는 가로 순
        out.extend(row)
    _auto_cache[key] = out
    return out


def cell_rgb(A, cell):
    H, W, _ = A.shape
    c = cell % GRID['cols']
    r = cell // GRID['cols']
    cw, ch = W / GRID['cols'], H / GRID['rows']
    x0, x1 = int(c * cw), int((c + 1) * cw)
    y0, y1 = int(r * ch), int((r + 1) * ch)
    ins = 6
    return A[y0 + ins:y1 - ins, x0 + ins:x1 - ins].copy()


def piece(A, cell, flip, sheet=None, cachekey=None):
    if sheet in AUTO_SHEETS:
        boxes = find_figures_auto(A, cachekey or sheet)
        if cell >= len(boxes):
            return None, None
        y0, y1, x0, x1 = boxes[cell]
        pad = 24
        raw = A[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad].copy()
    else:
        raw = cell_rgb(A, cell)
    a = key_green(raw)
    rgb = despill(raw)
    a[:6, :] = 0
    a[-6:, :] = 0                                # 셀 경계선이 붙는 것 방지
    ys, xs = np.where(a > 0.2)
    if len(ys) == 0:
        return None, None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crgb, ca = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    if flip:
        crgb, ca = crgb[:, ::-1], ca[:, ::-1]
    return crgb, ca


def build(key):
    cfg = CHARS[key]
    sheets = cfg['sheets']
    imgs = {k: np.asarray(Image.open(v).convert('RGB')).astype(np.float32) for k, v in sheets.items()}
    refh = {}
    for sh in sheets:
        _, ca = piece(imgs[sh], REFCELL[sh], False, sh, key + sh)
        refh[sh] = ca.shape[0]
    target = CELL_H * STAND_FRAC
    atlas = Image.new('RGBA', (COLS_A * CELL_W, ROWS_A * CELL_H), (0, 0, 0, 0))
    flips = cfg.get('flips', {})
    for idx, (sh, cell, flip, lift) in enumerate(FRAMES):
        crgb, ca = piece(imgs[sh], cell, flips.get(idx, flip), sh, key + sh)
        if crgb is None:
            print('  !! empty frame', idx, sh, cell)
            continue
        # 자동검출 시트는 셀마다 카메라 거리가 흔들려 덩치가 튄다 → 프레임별로 키를 맞춘다(제자리 슬로모라 안전)
        scale = (target / ca.shape[0]) if sh in AUTO_SHEETS else (target / refh[sh])
        ph, pw = ca.shape
        nw, nh = max(1, int(pw * scale)), max(1, int(ph * scale))
        rp = Image.fromarray(np.dstack([crgb, ca * 255]).astype(np.uint8), 'RGBA').resize((nw, nh), Image.LANCZOS)
        arr = np.asarray(rp).astype(np.float32)
        rp = Image.fromarray(np.dstack([clarity(arr[..., :3]), arr[..., 3]]).astype(np.uint8), 'RGBA')
        na = np.asarray(rp)[:, :, 3]
        cut = int(nh * 0.80)
        yy, xx = np.where(na[cut:] > 40)          # 하단 20% 무게중심 = 발 x앵커
        ax = int(xx.mean()) if len(xx) > 0 else nw // 2
        yb = np.where(na.max(1) > 40)[0]
        foot = int(yb.max()) if len(yb) > 0 else nh - 1
        c, r = idx % COLS_A, idx // COLS_A
        cx = c * CELL_W + CELL_W // 2
        baseline = r * CELL_H + int(CELL_H * (BASE_FRAC - lift))
        atlas.alpha_composite(rp, (cx - ax, baseline - foot))

    # ⚠ png 은 game_image/(소스 보관용)에 둔다 — public/ 는 통째로 배포되므로 2~3MB 짜리 미사용 파일을 넣지 말 것
    png = D + 'game_image/' + cfg['out'] + '.png'
    webp = D + 'public/' + cfg['out'] + '.webp'
    atlas.save(png)
    atlas.save(webp, format='WEBP', quality=90, method=6)   # 게임이 읽는 파일(알파 지원·PNG 대비 5~8배 작음)
    show = Image.new('RGBA', atlas.size, (16, 18, 34, 255))
    show.alpha_composite(atlas)
    show.convert('RGB').save(D + 'public/' + cfg['out'] + '-showcase.jpg', quality=86)
    import os
    print('wrote', webp, atlas.size, 'webp=%.0fKB png=%.0fKB' % (os.path.getsize(webp) / 1024, os.path.getsize(png) / 1024),
          'refh', {k: int(v) for k, v in refh.items()})


if __name__ == '__main__':
    keys = sys.argv[1:] or list(CHARS.keys())
    for k in keys:
        print('==', k)
        build(k)
