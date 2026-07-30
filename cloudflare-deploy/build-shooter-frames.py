"""
🚶 슈팅게임 적(괴물·좀비) 걷기 애니메이션 스프라이트 빌더

사장님 지시(2026-07-30): "괴물들과 좀비들의 손과 발이 움직이게 하고 싶어".
정지 사진 + CSS 좌우 흔들림만으로는 죽어 보인다 → 4프레임 걷기 사이클로 교체.

왜 스프라이트인가 (영상 아님):
  이 게임은 DOM/CSS 라 알파(투명 배경)가 필요한데 mp4 에는 알파가 없다.
  battle-3d 처럼 WebGL 셰이더로 실시간 키잉할 수도 없다. 그래서 가로 스트립 webp 1장 +
  CSS `animation: steps(N)` 으로 돌린다. 파일도 1개라 요청 수도 안 늘어난다.

입력: game_image/shooter-anim-<시트>.png  — 4x4 격자(행=캐릭터, 열=걷기 4프레임)
출력: public/img/shooter-anim-<id>.webp    — 가로 4프레임 스트립 (BOX*4 x BOX)

  python build-shooter-frames.py

⚠ 원본 png 는 game_image/ 에만. public/ 에 두면 배포에 그대로 실린다.
"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os

SRC = 'C:/Users/Admin/Desktop/mangoi_develop2-main/game_image/'
OUT = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/public/img/'

# (시트파일, id 목록, 캐릭터당 프레임수)
#  · 4프레임 시트: 한 행 = 캐릭터 하나 (4x4 = 4캐릭터)
#  · 8프레임 시트: 두 행 = 캐릭터 하나 (4x4 = 2캐릭터). 읽는 순서는 왼→오, 위→아래.
#    8프레임이 더 부드럽다(사장님 "자연스럽고 부드럽게"). 재생 시간은 그대로 두고 프레임만
#    늘리므로 초당 5.5컷 → 11컷이 된다.
SHEETS = [
    # ⚠ 8프레임으로 올린 캐릭터는 4프레임 시트에서 None 으로 비워 둔다.
    #    안 그러면 뒤에 도는 4프레임 시트가 같은 파일명을 덮어써 8프레임이 사라진다(실제로 그랬다).
    (SRC + 'shooter-anim-zom8A.png', ['office', 'sprinter'], 8),
    (SRC + 'shooter-anim-zom8B.png', ['tank', 'soldier'], 8),
    (SRC + 'shooter-anim-zom8C.png', ['trooper', 'worker'], 8),
    (SRC + 'shooter-anim-zom8D.png', ['doc', 'medic'], 8),
    (SRC + 'shooter-anim-zomA.png', [None, None, None, None], 4),
    (SRC + 'shooter-anim-zomB.png', [None, None, None, None], 4),
    (SRC + 'shooter-anim-spc8A.png', ['alien', 'bug'], 8),
    (SRC + 'shooter-anim-spc8B.png', ['dragon', 'parasite'], 8),
    (SRC + 'shooter-anim-spc8C.png', ['phantom', 'mech'], 8),
    (SRC + 'shooter-anim-spc8D.png', ['oni', 'imp'], 8),
    (SRC + 'shooter-anim-spcA.png', [None, None, None, None], 4),
    (SRC + 'shooter-anim-spcB.png', [None, None, None, None], 4),
    # 🙋 민간인 — 좀비 사이에 섞여 걸어온다. 잘못 쏘면 감점(사장님 지시).
    #    옷 색을 일부러 밝게(남색·빨강·노랑·갈색) 뽑아 회녹색 좀비와 한눈에 구분되게 했다.
    (SRC + 'shooter-anim-civ.png', ['civ-girl', 'civ-man', 'civ-woman', 'civ-elder'], 4),
]
COLS, ROWS = 4, 4

# 정지 컷과 같은 규격(정사각)이라 게임 CSS(.face{width:X;height:X})를 그대로 쓴다.
# 220 = 가로화면 최대 표시 142px 의 1.5배. 4프레임을 한 파일에 담으므로 정지컷(260)보다 조금 줄여 용량을 잡는다.
BOX = 220
QUALITY = 78

KEY_EX, KEY_G = 34, 55   # 좀비 피부가 창백한 초록이라 낮추면 얼굴이 뚫린다 — 기본값 유지
INSET = 0.03
HOLE = 600
# parasite 는 반투명 호박색 껍데기 안에 '초록' 정맥이 흘러 몸 안쪽이 배경으로 키잉된다.
# 실루엣이 닫힌 덩어리라 구멍을 전부 메우면 해결된다(정지컷 빌더에서도 같은 처리를 했다).
HOLE_OVERRIDE = {'parasite': 10 ** 7}


def despill(rgb):
    """가장자리 초록끼 제거 — 반드시 키잉 '뒤'에만."""
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


def piece(A, cell, hole=HOLE):
    """셀번호(왼→오, 위→아래) → (rgb, alpha). 셀 사이 검은 구분선을 피해 안쪽으로 판다."""
    H, W, _ = A.shape
    col, row = cell % COLS, cell // COLS
    cw, ch = W / COLS, H / ROWS
    ix, iy = int(cw * INSET), int(ch * INSET)
    raw = A[int(row * ch) + iy:int((row + 1) * ch) - iy,
            int(col * cw) + ix:int((col + 1) * cw) - ix].copy()
    R, G, B = raw[..., 0], raw[..., 1], raw[..., 2]
    fig = largest(~(((G - np.maximum(R, B)) > KEY_EX) & (G > KEY_G)))
    fig = fill_small_holes(fig, hole)
    fig = ndi.binary_opening(fig, iterations=2)
    fig = largest(fig)
    fig = ndi.binary_erosion(fig, iterations=2)
    a = ndi.gaussian_filter(fig.astype(np.float32), 1.2)
    a = np.clip((a - 0.30) / 0.42, 0, 1)
    a[:3, :] = 0; a[-3:, :] = 0; a[:, :3] = 0; a[:, -3:] = 0
    return despill(raw), a


def anchor(a):
    """걷기 사이클 정렬 기준 = (몸통 가로중심, 발바닥).
    · 세로: 알파의 맨 아래 = 발 → 걸어도 지면에 붙어 있다.
    · 가로: '위쪽 40%'(머리+몸통)의 중심 — 전체 bbox 로 잡으면 팔다리가 흔들릴 때마다
      중심이 따라 흔들려 캐릭터가 좌우로 미끄러지듯 보인다."""
    ys, xs = np.where(a > 0.25)
    if len(ys) == 0:
        return None
    top, bot = int(ys.min()), int(ys.max())
    band = ys <= top + max(4, int(0.40 * (bot - top + 1)))
    return float(xs[band].mean()), float(bot)


def build_sheet(path, ids, frames):
    if not os.path.exists(path):
        print('  -- 소스 없음, 건너뜀:', os.path.basename(path))
        return
    A = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    for idx, cid in enumerate(ids):
        if not cid:
            continue           # 이미 다른 시트(8프레임)에서 만든 캐릭터
        cuts = []
        for f in range(frames):
            rgb, a = piece(A, idx * frames + f, HOLE_OVERRIDE.get(cid, HOLE))
            anc = anchor(a)
            if anc is None:
                print('  !! 빈 셀', cid, col); cuts = []; break
            cuts.append((rgb, a, anc))
        if not cuts:
            continue

        # 4프레임 공통 크기 = 앵커를 원점(0,0)에 둔 좌표계에서의 합집합 상자.
        # 프레임마다 따로 자르면 팔다리 폭이 달라 캐릭터가 커졌다 작아졌다 한다.
        #   앵커 = (가로중심, 발바닥) 이므로 이 좌표계에서 아래끝은 항상 0.
        l = min(-ax for _, _, (ax, ay) in cuts)                  # 왼쪽 끝(음수)
        r = max(a.shape[1] - ax for _, a, (ax, ay) in cuts)      # 오른쪽 끝
        t = min(-ay for _, _, (ax, ay) in cuts)                  # 위쪽 끝(음수)
        uw, uh = r - l, -t
        s = min(BOX / uw, BOX / uh)                              # 정사각 BOX 에 contain
        ox = (BOX - uw * s) / 2.0                                # 합집합 상자를 가로 가운데
        oy = BOX - uh * s                                        # 세로는 바닥 정렬(발이 지면에)

        strip = Image.new('RGBA', (BOX * frames, BOX), (0, 0, 0, 0))
        for i, (rgb, a, (ax, ay)) in enumerate(cuts):
            im = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), 'RGBA')
            im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
            px = i * BOX + int(round(ox + (-ax - l) * s))
            py = int(round(oy + (-ay - t) * s))
            strip.alpha_composite(im, (px, py))
        p = OUT + 'shooter-anim-%s.webp' % cid
        strip.save(p, 'WEBP', quality=QUALITY, method=6)
        print('anim %-9s %d프레임 %dx%d  %.0fKB' % (cid, frames, BOX * frames, BOX, os.path.getsize(p) / 1024))


if __name__ == '__main__':
    for path, ids, frames in SHEETS:
        build_sheet(path, ids, frames)
