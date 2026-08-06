"""
🔫 슈팅게임 사수 — '무기를 실제로 쥔' 실사 컷 13종 빌더

왜 별도 파일인가:
  build-shooter-assets.py 는 병행 세션이 좀비 테마로 재작성 중이다.
  이 작업(무기별 사수)은 우주/좀비 어느 테마로 가든 그대로 쓰이므로,
  같은 파일을 동시에 고쳐 서로 깨뜨리지 않도록 독립 스크립트로 분리했다.

무엇을 고치는 작업인가:
  기존에는 사수 사진을 '빈손'으로 만들고 총은 별개 SVG 를 CSS 좌표로 얹었다.
  그래서 손과 총이 구조적으로 절대 안 맞았다(사수 사진의 손은 x≈10%, 총은 x=52%).
  → 무기를 쥔 채로 촬영된 한 장으로 합쳐 근본 해결한다.

  python build-shooter-armed.py

산출: public/img/shooter-armed-<gunid>.webp  (알파, 13장 전부 동일 캔버스)
⚠ 원본 png 는 game_image/ 에만. public/ 에 두면 배포에 그대로 실린다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os

SRC = 'C:/Users/Admin/Desktop/mangoi_develop2-main/game_image/'
OUT = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/img/'

# 모델이 3x3 을 주문해도 4행으로 뽑아버렸다(A). 실제 나온 격자에 맞춰 매핑한다.
# None = 쓰지 않는 칸(중복 소총 2컷 + 빈칸 1개).
SHEETS = [
    {'path': SRC + 'shooter-armed-A.png', 'grid': (3, 4),
     'ids': ['pistol', 'revolver', 'rifle',
             'shotgun', 'sniper', 'ar',
             None, None, None,
             'mg', 'minigun', 'flame']},
    {'path': SRC + 'shooter-armed-B.png', 'grid': (2, 2),
     'ids': ['tank', 'railgun', 'grenade', 'handnade']},
]

# 13종 전부 총구가 '오른쪽 위'를 향하도록 방향을 통일한다(뒷모습이라 좌우반전해도 티가 안 난다).
# ⚠ 시트 단위로 반전하면 안 된다 — 같은 시트 안에서도 칸마다 방향이 제각각으로 나왔다.
#   1차에 A시트를 통째로 반전했다가 mg·minigun·flame 이 거꾸로 됐고(원본이 이미 오른쪽),
#   B시트를 통째로 안 뒤집었다가 tank 만 왼쪽으로 남았다. 총구 자동검출이 엉뚱한 데를
#   찍는 걸로 발견했다 → 반드시 굽고 나서 총구 마커를 눈으로 확인할 것.
# 방향이 맞는지 확인하는 법: 굽고 나서 총구 추정 x 가 몸통 중심(43%)보다 확실히 크면 정상.
# 몸통 중심과 비슷하게 나오면 그 무기는 왼쪽을 겨누고 있는 것이다(tank 가 그랬다).
FLIP = {'pistol': 1, 'revolver': 1, 'rifle': 1, 'shotgun': 1, 'sniper': 1, 'ar': 1,
        'mg': 0, 'minigun': 0, 'flame': 0,
        'tank': 0, 'railgun': 0, 'grenade': 0, 'handnade': 0}

HEAD_TARGET_W = 104   # 머리 폭을 이 값으로 맞춰 시트 간 카메라 거리 차이를 없앤다(=출력 해상도 결정)
KEY_EX, KEY_G = 20, 28
HOLE = 600
INSET = 0.035         # 셀 사이 검은 구분선을 확실히 피한다(1.2% 로는 선이 알파에 붙어 남았다)
PAD = 8


def despill(rgb):
    """가장자리 초록끼 제거 — 반드시 키잉 '뒤'에만. 먼저 하면 초록이 눌려 키가 실패한다."""
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


def cell_rgb(A, cell, grid):
    H, W, _ = A.shape
    cols, rows = grid
    c, r = cell % cols, cell // cols
    cw, ch = W / cols, H / rows
    ix, iy = int(cw * INSET), int(ch * INSET)
    return A[int(r * ch) + iy:int((r + 1) * ch) - iy, int(c * cw) + ix:int((c + 1) * cw) - ix].copy()


def alpha_of(raw):
    R, G, B = raw[..., 0], raw[..., 1], raw[..., 2]
    fig = ~(((G - np.maximum(R, B)) > KEY_EX) & (G > KEY_G))
    fig = largest(fig)
    fig = fill_small_holes(fig, HOLE)
    fig = ndi.binary_opening(fig, iterations=2)
    fig = largest(fig)
    fig = ndi.binary_erosion(fig, iterations=2)
    a = ndi.gaussian_filter(fig.astype(np.float32), 1.2)
    return np.clip((a - 0.30) / 0.42, 0, 1)


def head_blob(raw):
    """머리(살빛+머리카락) = 붉은기가 있되 과채도는 아닌 픽셀.
    ⚠ (r-b)<85 상한이 없으면 나무 개머리판·주황 연료탱크를 머리로 오인한다(실제로 그랬다).
    반환: (머리폭, 꼭대기y, 꼭대기쪽 30% 구간의 가로중심)
    가로중심을 덩어리 전체가 아니라 '위쪽 30%'에서 재는 이유 —
    소총 컷에서 개머리판 일부가 머리 덩어리에 붙어 중심이 오른쪽으로 끌려간다."""
    r, g, b = raw[..., 0], raw[..., 1], raw[..., 2]
    m = (r > 60) & (r >= g) & ((r - b) > 15) & ((r - b) < 85)
    m = ndi.binary_opening(m, iterations=3)
    lbl, n = ndi.label(m)
    if n == 0:
        return None
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    ys, xs = np.where(lbl == (1 + int(np.argmax(sizes))))
    top = int(ys.min())
    band = ys <= top + max(8, int(0.30 * (ys.max() - top + 1)))
    return int(xs.max() - xs.min() + 1), float(top), float(xs[band].mean())


def body_anchor(raw, alpha):
    """정렬 기준 = 청록 위장복의 가로중심 + 피사체의 바닥(허리 잘린 선).

    🔴 여기서 두 번 헤맸다. 남기는 이유는 같은 함정을 또 밟지 않기 위해서다.
      1차: '어깨선(위장복 최상단)' → 기관총·전차포처럼 무기가 등을 가리는 컷에서
           최상단이 어깨가 아니라 등 한복판으로 잡혀 세로로 밀렸다.
      2차: '머리(살빛 덩어리)' → 살빛 규칙에 **두 손·팔뚝**과 **모래색 위장복**까지 걸려서
           가장 큰 덩어리가 머리가 아니라 손/재킷이 됐다. 권총 컷은 앵커가 아예 권총 위에
           찍혔다(마커를 그려 눈으로 확인). 무기마다 기준이 달라지니 총을 바꿀 때 사수가 튄다.

    지금 기준은 둘 다 무기와 무관하다:
      · 가로 = 청록 위장복 덩어리의 중심(무기는 회흑·나무·주황이라 안 걸린다)
      · 세로 = 알파의 맨 아래(모든 컷이 허리에서 잘려 있어 가장 안정적이다)
    ⚠ 청록 검출 전에 크로마 초록을 반드시 뺀다 — 초록 배경 자체가 (g>r, b>r) 을 만족해서
      안 빼면 배경이 최대 덩어리로 잡힌다(실제로 그랬다)."""
    r, g, b = raw[..., 0], raw[..., 1], raw[..., 2]
    fg = ~(((g - np.maximum(r, b)) > 20) & (g > 28))
    teal = fg & (b > r + 10) & (g > r + 5) & (g > 40)
    teal = ndi.binary_opening(teal, iterations=4)
    lbl, n = ndi.label(teal)
    if n == 0:
        return None
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    if sizes.max() < 3000:
        return None
    xs = np.where(lbl == (1 + int(np.argmax(sizes))))[1]
    ys = np.where(alpha > 0.2)[0]
    return float(xs.mean()), float(ys.max())


def main():
    parts = []
    for sh in SHEETS:
        if not os.path.exists(sh['path']):
            print('  -- 소스 없음, 건너뜀:', sh['path'])
            continue
        A = np.asarray(Image.open(sh['path']).convert('RGB')).astype(np.float32)
        cols, rows = sh['grid']

        # 스케일은 셀별이 아니라 '시트별 중앙값'으로 잡는다 — 한 시트 안에서는 카메라가
        # 고정이라 이쪽이 더 정확하고, 개머리판/탱크를 머리로 오인한 셀에 흔들리지 않는다.
        hbs = [head_blob(cell_rgb(A, c, sh['grid'])) for c in range(cols * rows)]
        widths = [h[0] for h in hbs if h]
        med = float(np.median(widths))
        scale = HEAD_TARGET_W / med
        print('%s  머리폭 중앙값 %.0f → 배율 %.3f' % (os.path.basename(sh['path']), med, scale))

        for cell, gid in enumerate(sh['ids']):
            if not gid:
                continue
            raw = cell_rgb(A, cell, sh['grid'])
            a = alpha_of(raw)
            a[:3, :] = 0; a[-3:, :] = 0; a[:, :3] = 0; a[:, -3:] = 0
            ys, xs = np.where(a > 0.2)
            if len(ys) == 0:
                print('  !! 빈 셀', gid); continue
            anc = body_anchor(raw, a)
            if anc is None:
                print('  !! 몸통 못 찾음', gid); continue
            ax, ay = anc
            y0, x0 = int(ys.min()), int(xs.min())
            rgbc = despill(raw)[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            ac = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            ax, ay = ax - x0, ay - y0                       # 앵커를 크롭 좌표계로

            im = Image.fromarray(np.dstack([rgbc, ac * 255]).astype(np.uint8), 'RGBA')
            nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            im = im.resize((nw, nh), Image.LANCZOS)
            ax, ay = ax * scale, ay * scale
            if FLIP.get(gid):
                im = im.transpose(Image.FLIP_LEFT_RIGHT)
                ax = nw - ax
            parts.append((gid, im, (ax, ay)))

    if not parts:
        print('산출 없음 — 시트를 먼저 생성하세요.'); return

    # 머리 앵커를 원점(0,0)에 둔 좌표계에서 13장의 합집합 = 공통 캔버스.
    # 고정 캔버스면 미니건처럼 큰 무기가 잘린다. 아래쪽만 min 인 이유는 허리 잘린 높이가
    # 컷마다 달라 max 로 잡으면 짧은 컷 밑에 빈칸이 생기고, #turret{bottom:0} 이라
    # 그 빈칸만큼 몸통 잘린 선이 화면 위로 떠올라 '떠 있는 상반신'이 되기 때문.
    l = min(-ax for _, _, (ax, ay) in parts)
    t = min(-ay for _, _, (ax, ay) in parts)
    r = max(im.width - ax for _, im, (ax, ay) in parts)
    b = 0.0   # 앵커가 '바닥'이라 모든 컷의 아래끝이 앵커선에 맞는다
    cw, ch = int(r - l) + PAD * 2, int(b - t) + PAD
    sx, sy = int(-l) + PAD, int(-t) + PAD
    print('\n공통 캔버스 %dx%d · 캔버스 내 몸통 기준점(가로중심,바닥) (%d,%d) = (%.1f%%, %.1f%%)\n'
          % (cw, ch, sx, sy, 100 * sx / cw, 100 * sy / ch))
    print('%-9s %8s  %-18s' % ('무기', '용량', '총구 추정(x%, y%)'))

    for gid, im, (ax, ay) in parts:
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(im, (int(-l - ax) + PAD, int(-t - ay) + PAD))
        p = OUT + 'shooter-armed-%s.webp' % gid
        canvas.save(p, 'WEBP', quality=80, method=6)

        # 총구 추정 = 몸통 기준점보다 오른쪽에서 가장 높이 솟은 알파 지점.
        # 13종 전부 총구가 오른쪽 위를 향하도록 통일했으므로 대개 맞지만, 자동값을
        # 그대로 믿지 말고 눈으로 확인한 뒤 JS 테이블에 옮길 것.
        na = np.asarray(canvas)[..., 3] > 90
        na[:, :sx] = False
        ys2, xs2 = np.where(na)
        m = '(못 찾음)'
        if len(ys2):
            k = int(np.argmin(ys2))
            m = '%.1f%%, %.1f%%' % (100.0 * xs2[k] / cw, 100.0 * ys2[k] / ch)
        print('%-9s %6.0fKB  %-18s' % (gid, os.path.getsize(p) / 1024, m))


if __name__ == '__main__':
    main()
