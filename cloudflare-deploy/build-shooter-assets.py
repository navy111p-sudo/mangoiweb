"""
🎬 슈팅게임(student-game-shooter.html) 실사화 에셋 빌더

Higgsfield(nano_banana_pro) 로 만든 그린스크린 시트를 게임이 읽는 webp 로 굽는다.
키잉/디스필 로직은 build-real-hero-atlas.py 와 동일 계열(검증된 것)이고, 배치만 다르다.

게임은 테마 2종(우주 / 좀비)을 옵션으로 고를 수 있다 — 사장님 지시(2026-07-30).
그래서 두 테마 에셋이 **둘 다** public/img/ 에 있어야 한다. 한쪽을 지우면
wrangler 가 배포에서 그 파일들을 제거해 그 테마가 라이브에서 깨진다(실제로 한 번 지워졌었다).

  python build-shooter-assets.py            # 전부
  python build-shooter-assets.py bg         # 우주 배경만
  python build-shooter-assets.py mons       # 우주 크리처 8종만
  python build-shooter-assets.py soldier    # 사수 9포즈만(구 빈손 포즈)
  python build-shooter-assets.py zombie     # 좀비 테마(배경+좀비 8종)만

산출(public/img/):
  [우주] shooter-space-bg.webp / shooter-mon-<id>.webp 8종 (260x260 정사각)
  [좀비] shooter-city-bg.webp  / shooter-zom-<id>.webp 8종 (260x260 정사각)
  [공용] shooter-pose-<n>.webp 사수 9포즈
         ※ 무기를 쥔 사수 13종은 별도 스크립트 build-shooter-armed.py 가 굽는다

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
BG_SRC = SRC + 'shooter-space-bg.png'
BG_W = 1600                     # 이보다 크게 둘 이유가 없다(어두운 성운이라 디테일이 없음). 용량이 곧 로딩속도.

# ── 크리처: (소스키, 셀번호, 출력 id) ───────────────────────────────────────
MON_SHEETS = {
    'A': SRC + 'shooter-mon-A2.png',      # 2x2 — 1차본은 용 날개가 프레임 밖으로 잘려서 재생성한 것
    'B': SRC + 'shooter-mon-B.png',       # 2x2
    'ALIEN': SRC + 'shooter-mon-alien.png',  # 단독 — 시트A의 그레이 외계인이 나체라 '우주복 입은' 버전으로 교체
}
MON_GRIDS = {'A': (2, 2), 'B': (2, 2), 'ALIEN': (1, 1)}
# 4번째 항목 = piece() 추가 옵션.
# parasite 는 껍데기가 반투명 호박색 + 안에 '초록' 정맥이 흐른다 → 몸 안쪽이 배경으로 키잉돼
# 구멍이 뻥뻥 뚫린다. 실루엣이 닫힌 덩어리라 구멍을 전부 메우면(hole 아주 크게) 해결된다.
MONS = [
    ('ALIEN', 0, 'alien', {}),          # 그레이 외계인(우주복)
    ('A', 1, 'bug', {}),                # 곤충형 침략자
    ('A', 2, 'dragon', {}),             # 드래곤
    ('A', 3, 'parasite', {'hole': 10 ** 7}),  # 기생생물
    ('B', 0, 'phantom', {}),            # 에너지 유령
    ('B', 1, 'mech', {}),               # 전투로봇
    ('B', 2, 'oni', {}),                # 오니 전사
    ('B', 3, 'imp', {}),                # 불꽃 임프
]
# 크리처는 전부 MON_BOX x MON_BOX 정사각 캔버스에 '들어맞게'(contain) 앉힌다.
# 가로로 넓은 기생생물(430x300)과 세로로 긴 외계인(124x300)을 같은 '높이'로 맞추면
# 기생생물만 화면을 가로로 다 차지한다 → 정사각 통일이라야 8종 표시 크기가 고르다.
# CSS 쪽은 .face{height:X;width:X} 로 끝난다(aspect-ratio·max-height 안 씀 — 크롬에서 어긋남).
MON_BOX = 260               # 가로화면 최대 표시가 142px 이라 260 이면 레티나(1.8x)까지 충분

# ── 좀비 테마 ───────────────────────────────────────────────────────────────
# 4x2 시트 1장. ⚠ 좀비 피부가 '창백한 초록'이라 그린스크린 키잉과 충돌할 수 있다 —
#   실측하니 피부는 G-max(R,B) ≈ 20 이고 배경은 100 이상이라 기본 임계값(34)으로 안전하다.
#   임계값을 낮추면(사수용 20 처럼) 좀비 얼굴이 뚫리니 여기선 절대 낮추지 말 것.
ZOM_SRC = SRC + 'shooter-zombie-sheet.png'
ZOM_GRID = (4, 2)
ZOMS = ['office', 'sprinter', 'tank', 'soldier',     # 사무직 · 달리는 좀비 · 방호복 · 군인
        'trooper', 'worker', 'doc', 'medic']          # 트루퍼 · 건설노동자 · 연구원 · 의무병
CITY_SRC = SRC + 'shooter-city-bg.png'

# ── 사수: 3x3 시트 → 9포즈 (3x2 로 주문했는데 모델이 9칸으로 뽑았다. 포즈가 많아 오히려 이득) ──
SOL_SRC = SRC + 'shooter-soldier-sheet2.png'
SOL_GRID = (3, 3)
# 9장 전부 같은 캔버스 크기로 굽고 '머리'를 같은 자리에 놓는다 → <img src> 를 갈아끼워도 안 튄다.
# 캔버스 크기는 build_soldier 가 9장 합집합 bbox 로 자동 산출한다(고정값이면 뻗은 팔이 잘림).
HEAD_TARGET_W = 100            # 모든 포즈의 '머리 폭'을 이 값으로 맞춰 덩치 차이를 없앰(=출력 해상도 결정)

# 그린 키: 배경 excess(G-max(R,B)) 는 100 이상, 피사체는 10 이하 → 34 가 갭 한가운데
KEY_EX, KEY_G = 34, 55


def despill(rgb):
    """가장자리에 남은 초록끼 제거 — 반드시 키잉 '뒤'에만. 먼저 하면 초록이 눌려 키가 실패한다."""
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
    """hole = 메워버릴 '구멍'의 최대 면적(px). 크게 잡으면 겨드랑이·목 아래처럼 몸에 둘러싸인
    진짜 초록 배경까지 몸으로 메워져 초록 삼각형이 남는다(사수 1차 빌드에서 실제로 남았다).

    ex/gmin = 키 임계값. 사수는 턱 밑·깃 안쪽처럼 '그늘진 초록'이 남아서 더 낮춰야 하고
    (군복이 청록 계열이지만 G-max(R,B) 는 0 근처라 안전),
    크리처는 드래곤 비늘이 에메랄드라 임계값을 낮추면 몸이 통째로 뚫린다 → 기본값 유지."""
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
    """셀 잘라내기. nano_banana 가 셀 사이에 얇은 검은 구분선을 그리므로 안쪽으로 조금 파고든다."""
    H, W, _ = A.shape
    cols, rows = grid
    c, r = cell % cols, cell // cols
    cw, ch = W / cols, H / rows
    x0, x1 = int(c * cw), int((c + 1) * cw)
    y0, y1 = int(r * ch), int((r + 1) * ch)
    ix, iy = int(cw * inset_frac), int(ch * inset_frac)
    return A[y0 + iy:y1 - iy, x0 + ix:x1 - ix].copy()


def piece(A, cell, grid, erode=2, keep_largest=True, hole=600, ex=None, gmin=None):
    """셀 → (rgb, alpha) bbox 크롭. 잘라낼 게 없으면 (None, None)."""
    raw = cell_rgb(A, cell, grid)
    a = key_green(raw, erode=erode, keep_largest=keep_largest, hole=hole, ex=ex, gmin=gmin)
    rgb = despill(raw)
    a[:3, :] = 0
    a[-3:, :] = 0
    a[:, :3] = 0
    a[:, -3:] = 0                        # 셀 경계선이 알파에 붙는 것 방지
    ys, xs = np.where(a > 0.2)
    if len(ys) == 0:
        return None, None
    return rgb[ys.min():ys.max() + 1, xs.min():xs.max() + 1], a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def to_rgba(rgb, a):
    return Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')


# ═══════════════════════════════════════════════════════════════════════════
def build_bg():
    im = Image.open(BG_SRC).convert('RGB')
    h = round(BG_W * im.height / im.width)
    im = im.resize((BG_W, h), Image.LANCZOS)
    p = OUT + 'shooter-space-bg.webp'
    im.save(p, 'WEBP', quality=80, method=6)
    print('bg   %dx%d  %.0fKB  %s' % (BG_W, h, __import__('os').path.getsize(p) / 1024, p))


def build_mons():
    import os
    imgs = {k: np.asarray(Image.open(v).convert('RGB')).astype(np.float32)
            for k, v in MON_SHEETS.items() if os.path.exists(v)}
    for sheet, cell, mid, opt in MONS:
        if sheet not in imgs:
            print('  -- 소스 없음, 건너뜀:', mid, MON_SHEETS[sheet])
            continue
        rgb, a = piece(imgs[sheet], cell, MON_GRIDS[sheet], **opt)
        if rgb is None:
            print('  !! 빈 셀', sheet, cell, mid)
            continue
        ph, pw = a.shape
        s = min(MON_BOX / pw, MON_BOX / ph)
        nw, nh = max(1, round(pw * s)), max(1, round(ph * s))
        im = to_rgba(rgb, a).resize((nw, nh), Image.LANCZOS)
        canvas = Image.new('RGBA', (MON_BOX, MON_BOX), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((MON_BOX - nw) // 2, MON_BOX - nh))   # 가로 가운데 · 바닥 정렬
        p = OUT + 'shooter-mon-%s.webp' % mid
        canvas.save(p, 'WEBP', quality=82, method=6)
        print('mon  %-9s 내용 %dx%d → %dx%d  %.0fKB'
              % (mid, nw, nh, MON_BOX, MON_BOX, __import__('os').path.getsize(p) / 1024))


def build_zombie():
    """좀비 테마 = 폐허도시 배경 + 좀비 8종. 크리처와 같은 정사각 캔버스 규격이라
    게임 쪽 CSS(.face{width:X;height:X})를 그대로 공유한다."""
    import os
    im = Image.open(CITY_SRC).convert('RGB')
    h = round(BG_W * im.height / im.width)
    p = OUT + 'shooter-city-bg.webp'
    im.resize((BG_W, h), Image.LANCZOS).save(p, 'WEBP', quality=80, method=6)
    print('bg   city %dx%d  %.0fKB' % (BG_W, h, os.path.getsize(p) / 1024))

    A = np.asarray(Image.open(ZOM_SRC).convert('RGB')).astype(np.float32)
    for cell, zid in enumerate(ZOMS):
        rgb, a = piece(A, cell, ZOM_GRID)
        if rgb is None:
            print('  !! 빈 셀', zid); continue
        ph, pw = a.shape
        s = min(MON_BOX / pw, MON_BOX / ph)
        nw, nh = max(1, round(pw * s)), max(1, round(ph * s))
        canvas = Image.new('RGBA', (MON_BOX, MON_BOX), (0, 0, 0, 0))
        canvas.alpha_composite(to_rgba(rgb, a).resize((nw, nh), Image.LANCZOS),
                               ((MON_BOX - nw) // 2, MON_BOX - nh))   # 가로 가운데 · 바닥 정렬
        p = OUT + 'shooter-zom-%s.webp' % zid
        canvas.save(p, 'WEBP', quality=82, method=6)
        print('zom  %-9s 내용 %dx%d → %dx%d  %.0fKB'
              % (zid, nw, nh, MON_BOX, MON_BOX, os.path.getsize(p) / 1024))


def head_metrics(a):
    """머리 꼭대기 y 와, 상단 12% 구간의 알파 폭·가로중심 → 포즈가 달라도 잘 안 흔들리는 정렬 기준."""
    rows = np.where(a.max(1) > 0.35)[0]
    top = int(rows.min())
    band = a[top:top + max(4, int(a.shape[0] * 0.12))]
    cols = np.where(band.max(0) > 0.35)[0]
    return top, int(cols.min()), int(cols.max()) + 1


def build_soldier():
    """
    9포즈를 '머리 폭'으로 크기 정규화하고 '머리 꼭대기'를 원점으로 정렬한다.
    머리는 포즈가 바뀌어도 거의 안 변하는 유일한 부위라, 몸통 bbox 로 맞추면
    팔을 뻗은 포즈에서 캐릭터가 통째로 작아졌다 커졌다 하며 튄다.

    캔버스는 고정값이 아니라 '9장을 정렬해서 겹쳤을 때의 합집합 bbox' 로 잡는다.
    고정 캔버스에 넣으면 어깨나 뻗은 팔이 잘린다(1차 시도에서 실제로 잘렸다).
    """
    A = np.asarray(Image.open(SOL_SRC).convert('RGB')).astype(np.float32)
    n = SOL_GRID[0] * SOL_GRID[1]
    parts = []
    for cell in range(n):
        rgb, a = piece(A, cell, SOL_GRID, ex=20, gmin=28)
        if rgb is None:
            print('  !! 빈 셀', cell)
            continue
        top, hx0, hx1 = head_metrics(a)
        s = HEAD_TARGET_W / max(1, (hx1 - hx0))
        ph, pw = a.shape
        im = to_rgba(rgb, a).resize((max(1, round(pw * s)), max(1, round(ph * s))), Image.LANCZOS)
        na = np.asarray(im)[..., 3].astype(np.float32) / 255.0
        ntop, nhx0, nhx1 = head_metrics(na)
        anchor = ((nhx0 + nhx1) / 2.0, float(ntop))     # 머리 가로중심 · 머리 꼭대기
        parts.append((cell, im, anchor))

    # 머리 원점(0,0) 기준 좌표계에서 9장의 합집합 bbox
    l = min(-ax for _, _, (ax, ay) in parts)
    t = min(-ay for _, _, (ax, ay) in parts)
    r = max(im.width - ax for _, im, (ax, ay) in parts)
    # ⚠ 아래쪽은 '최대'가 아니라 '최소'로 잡는다.
    #   포즈마다 허리 잘린 높이가 조금씩 달라서 최대로 잡으면 짧은 포즈 밑에 빈칸이 생기고,
    #   게임에서 #turret{bottom:0} 이라 그 빈칸만큼 몸통 잘린 선이 화면 위로 떠올라 '떠 있는 상반신'이 된다.
    #   최소로 잡으면 9장 전부 캔버스 바닥에 닿고 잘린 선은 화면 밖으로 나간다(허리 아래를 조금 버릴 뿐).
    b = min(im.height - ay for _, im, (ax, ay) in parts)
    pad = 6
    cw, ch = int(r - l) + pad * 2, int(b - t) + pad
    print('canvas %dx%d  (머리원점 기준 l=%.0f t=%.0f r=%.0f b=%.0f)' % (cw, ch, l, t, r, b))

    for cell, im, (ax, ay) in parts:
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(im, (int(-l - ax) + pad, int(-t - ay) + pad))
        p = OUT + 'shooter-pose-%d.webp' % cell
        canvas.save(p, 'WEBP', quality=78, method=6)   # 군복 디지털 위장무늬는 고주파 노이즈라 용량을 크게 먹는다. 190px 로 줄여 그리므로 78 로도 차이가 안 보인다
        print('pose %d  %dx%d  %.0fKB' % (cell, im.width, im.height, __import__('os').path.getsize(p) / 1024))


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('all', 'bg'):
        build_bg()
    if what in ('all', 'mons'):
        build_mons()
    if what in ('all', 'soldier'):
        build_soldier()
    if what in ('all', 'zombie'):
        build_zombie()
