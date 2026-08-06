"""
🎬 실사(영화풍) 보스 영상 빌더 — Higgsfield(seedance_2_0) 생성 그린스크린 mp4 → public/<out>.mp4 (제자리 루프)

battle-3d.html 의 attachBossVideo(그린 크로마키 셰이더 + 투영기반 fitBossVideo)가 그대로 읽는다.
build-octopus-video.py 의 후속판. 차이점:
  - 원본이 이미 '락오프 카메라 + 바닥/그림자 없는 순수 그린'이라 바닥 분리(침식 6회) 같은 곡예가 불필요.
  - 좌우 배회는 거의 없고 미세 드리프트만 있으므로, 앵커를 통째로 고정하지 않고 **저주파(드리프트) 성분만 상쇄**한다.
    (통째 고정은 무게중심 이동 같은 '진짜 모션'까지 죽여 부자연스러워진다.)
  - 전 프레임 합집합 bbox로 자동 크롭 → 게임 cfg 의 dinoWFrac/dinoHFrac/feetFrac 을 실측해서 출력한다.
    ⚠ 이 값이 틀리면 attachBossVideo 의 '안 잘림 가드'가 어긋나 머리/꼬리가 화면 밖으로 나간다. 출력값을 그대로 옮길 것.

  python build-real-boss-video.py monster
  python build-real-boss-video.py trex
  python build-real-boss-video.py monster --preview     # 인코딩 없이 콘택트시트만

실행 요건: pip install pillow numpy scipy + PATH 에 ffmpeg/ffprobe.
"""
import sys, os, glob, subprocess, tempfile
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

D = 'C:/Users/Admin/Desktop/mangoi_develop2-main/cloudflare-deploy/'

JOBS = {
    'monster': {
        'src': D + 'game_image/real-monster-boxing.mp4',
        'out': D + 'public/monster-boss.mp4',
        'maxw': 1000,        # 출력 가로 상한(파일 크기 ↔ 선명도 절충)
        'fps': 24,
        'minloop': 0.55,     # 루프 최소 길이(원본 대비)
    },
    'trex': {
        'src': D + 'game_image/real-trex-roar.mp4',
        'out': D + 'public/trex-real.mp4',
        'maxw': 1180,
        'fps': 24,
        'minloop': 0.55,
    },
}

GREEN = np.array([80, 176, 58], np.float32)   # 균일 크로마키 배경. ex=G-max(R,B)=96 > 게임 keyHi(0.34*255=87) → 확실히 투명
KEY_EX = 26                                   # 이 값보다 ex 가 작으면 피사체(원본 배경 ex는 60~100대)
MARGIN = 0.045                                # 크롭 여백(피사체 최대 bbox 대비)


def matte(rgb):
    """그린 키 → (알파 0..1, 본체 불리언). 원본에 바닥/그림자가 없어 '최대 덩어리 + 구멍 메움'이면 충분."""
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    ex = G - np.maximum(R, B)
    fig = ex < KEY_EX
    fig[:2, :] = 0; fig[-2:, :] = 0; fig[:, :2] = 0; fig[:, -2:] = 0
    lbl, n = ndi.label(fig)
    if n == 0:
        return np.zeros(fig.shape, np.float32), fig
    sizes = ndi.sum(np.ones_like(lbl), lbl, range(1, n + 1))
    body = (lbl == 1 + int(np.argmax(sizes)))
    body = ndi.binary_fill_holes(ndi.binary_closing(body, iterations=2))
    a = 1.0 - np.clip((ex - 6) / 20.0, 0, 1)        # 소프트 엣지(머리카락/촉수 끝 보존)
    a = a * body
    core = ndi.binary_erosion(body, iterations=3)   # 몸 내부가 반투명해지지 않게
    a = ndi.gaussian_filter(np.maximum(a, core.astype(np.float32)), 0.6)
    return a, body


def despill(rgb):
    out = rgb.copy()
    mx = np.maximum(out[..., 0], out[..., 2])
    out[..., 1] = np.minimum(out[..., 1], mx + 10)   # 최종 ex<=10 → 게임 keyLo(25.5) 아래 = 몸이 절대 안 뚫림
    return out


def analyse(files):
    """프레임별 bbox / 발 x중심 / 발 y 를 뽑는다."""
    x0 = []; x1 = []; y0 = []; y1 = []; fx = []
    for f in files:
        rgb = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        _, body = matte(rgb)
        ys, xs = np.where(body)
        if len(xs) < 50:
            for arr in (x0, x1, y0, y1, fx):
                arr.append(np.nan)
            continue
        x0.append(xs.min()); x1.append(xs.max()); y0.append(ys.min()); y1.append(ys.max())
        lowband = ys > ys.max() - 0.18 * (ys.max() - ys.min())    # 하단 18% = 발
        fx.append(np.median(xs[lowband]) if lowband.sum() > 20 else np.median(xs))

    def fill(a):
        a = np.array(a, np.float64)
        idx = np.arange(len(a)); good = ~np.isnan(a)
        return np.interp(idx, idx[good], a[good])
    return [fill(v) for v in (x0, x1, y0, y1, fx)]


def main(key, preview_only=False):
    cfg = JOBS[key]
    tmp = tempfile.mkdtemp(); src = os.path.join(tmp, 'src'); os.makedirs(src)
    subprocess.run(['ffmpeg', '-y', '-i', cfg['src'], os.path.join(src, 'f_%04d.png')],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    files = sorted(glob.glob(src + '/*.png'))
    print('frames', len(files))
    bx0, bx1, by0, by1, fx = analyse(files)
    fy = by1

    # 드리프트(저주파)만 상쇄 — 진짜 모션(빠른 성분)은 그대로 둔다
    dx = -(ndi.gaussian_filter1d(fx, 8) - fx.mean())
    dy = -(ndi.gaussian_filter1d(fy, 8) - fy.mean())
    print('drift x %.1f..%.1f  y %.1f..%.1f px' % (dx.min(), dx.max(), dy.min(), dy.max()))

    # ⚠ 드리프트 보정으로 프레임을 평행이동하면 원본 가장자리에 붙어있던 주둥이/꼬리가 캔버스 밖으로 잘린다.
    #   → 이동량만큼 캔버스를 먼저 '패딩'해서 절대 안 잘리게 한 뒤, 그 좌표계에서 합집합 bbox를 잡는다.
    H0img, W0img, _ = np.asarray(Image.open(files[0]).convert('RGB')).shape
    PADX = int(np.ceil(np.abs(dx).max())) + 8
    PADY = int(np.ceil(np.abs(dy).max())) + 8
    PW, PH = W0img + 2 * PADX, H0img + 2 * PADY

    # 보정 후 합집합 bbox → 크롭 영역 (패딩 좌표계)
    ux0 = (bx0 + dx).min() + PADX; ux1 = (bx1 + dx).max() + PADX
    uy0 = (by0 + dy).min() + PADY; uy1 = (by1 + dy).max() + PADY
    w = ux1 - ux0; h = uy1 - uy0
    mx = w * MARGIN; my = h * MARGIN
    cx0 = int(max(0, ux0 - mx)); cx1 = int(min(PW, ux1 + mx))
    cy0 = int(max(0, uy0 - my)); cy1 = int(min(PH, uy1 + my))
    CW0, CH0 = cx1 - cx0, cy1 - cy0
    sc = min(1.0, cfg['maxw'] / CW0)
    CW, CH = int(CW0 * sc) // 2 * 2, int(CH0 * sc) // 2 * 2   # ⚠ yuv420p 는 가로·세로가 짝수여야 인코딩됨(홀수면 ffmpeg 실패)
    print('crop %dx%d -> canvas %dx%d' % (CW0, CH0, CW, CH))

    comp = []
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')).astype(np.float32)
        a, _ = matte(rgb)
        canvas = np.tile(GREEN, (PH, PW, 1))
        sx, sy = PADX + int(round(dx[i])), PADY + int(round(dy[i]))
        # dx/dy 만큼 평행이동해서 패딩 캔버스에 합성(패딩 덕에 잘림 없음)
        ds_x0 = max(0, sx); ds_x1 = min(PW, sx + W0img); ss_x0 = ds_x0 - sx; ss_x1 = ss_x0 + (ds_x1 - ds_x0)
        ds_y0 = max(0, sy); ds_y1 = min(PH, sy + H0img); ss_y0 = ds_y0 - sy; ss_y1 = ss_y0 + (ds_y1 - ds_y0)
        al = a[ss_y0:ss_y1, ss_x0:ss_x1][..., None]
        fg = despill(rgb[ss_y0:ss_y1, ss_x0:ss_x1])
        canvas[ds_y0:ds_y1, ds_x0:ds_x1] = fg * al + canvas[ds_y0:ds_y1, ds_x0:ds_x1] * (1 - al)
        im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).crop((cx0, cy0, cx1, cy1))
        if sc < 1.0:
            im = im.resize((CW, CH), Image.LANCZOS)
        comp.append(np.asarray(im.filter(ImageFilter.UnsharpMask(1.4, 70, 3))))
    print('composed', len(comp))

    if preview_only:
        idxs = list(range(0, len(comp), max(1, len(comp) // 12)))[:12]
        tw, th = 240, int(240 * CH / CW)
        sheet = np.full((3 * th, 4 * tw, 3), 30, np.uint8)
        for k, i in enumerate(idxs):
            r, c = divmod(k, 4)
            sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = np.asarray(Image.fromarray(comp[i]).resize((tw, th)))
        Image.fromarray(sheet).save(D + 'public/%s-compose-sheet.jpg' % key)
        print('wrote preview sheet')
        return

    # 이음매 없는 루프 구간 탐색(합성 결과 그레이 유사도)
    small = [np.asarray(Image.fromarray(c).convert('L').resize((90, int(90 * CH / CW))), np.float32) for c in comp]
    N = len(small); span = max(6, N // 6)
    best = (1e18, 0, N - 1)
    for i in range(0, span):
        for j in range(N - span, N):
            if j - i < N * cfg['minloop']:
                continue
            d = np.abs(small[i] - small[j]).mean()
            if d < best[0]:
                best = (d, i, j)
    _, i0, j0 = best
    print('loop %d..%d (len %d) seam diff=%.2f' % (i0, j0, j0 - i0, best[0]))

    dst = os.path.join(tmp, 'out'); os.makedirs(dst)
    for k, idx in enumerate(range(i0, j0)):
        Image.fromarray(comp[idx]).save(os.path.join(dst, 'p_%04d.png' % k))
    subprocess.run(['ffmpeg', '-y', '-framerate', str(cfg['fps']), '-i', os.path.join(dst, 'p_%04d.png'),
                    '-c:v', 'libx264', '-crf', '26', '-preset', 'veryslow', '-tune', 'animation',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', cfg['out']],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # 게임 cfg 실측값 (attachBossVideo 안 잘림 가드용)
    fw = (ux1 - ux0) / CW0 * 1.0
    fh = (uy1 - uy0) / CH0
    feet = (uy1 - cy0) / CH0
    print('wrote %s  %d frames @%dfps  %.0fKB' % (cfg['out'], j0 - i0, cfg['fps'], os.path.getsize(cfg['out']) / 1024))
    print('>>> battle-3d.html BOSS_SKINS cfg:  vw:%d, vh:%d, dinoWFrac:%.3f, dinoHFrac:%.3f, feetFrac:%.3f'
          % (CW, CH, fw, fh, feet))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    main(args[0] if args else 'monster', preview_only=('--preview' in sys.argv))
