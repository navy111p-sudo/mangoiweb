#!/usr/bin/env python3
"""
그린스크린 괴물 영상 → 알파 스프라이트 시트

Higgsfield 에서 '순수 크로마키 그린' 배경으로 생성한 괴물 영상을
ffmpeg chromakey + despill 로 배경 제거하고 24프레임 세로 스트립 WebP 로 만든다.
GrabCut 추정 매팅과 달리 경계가 정확하다.

사용:  python build-greenscreen-sheets.py <name> <video.mp4> [<name> <video.mp4> ...]

■ 구버전(4:5 강제)에서 바뀐 점 — 박쥐 날개 잘림 사고 대응
  1. ffmpeg 단계의 `crop=iw:iw*1.25` 제거. 원본을 통째로 받아서 잘라내지 않는다.
  2. 목표 비율을 맞출 때 **박스를 넓히기만 하고 절대 좁히지 않는다.**
     프레임 밖으로 나가면 잘라내는 대신 **투명 패딩**을 넣는다.
     (구버전은 max(0,..)/min(W,..) 로 클램프해서 비율이 어긋난 채 resize → 왜곡)
  3. 목표 비율을 괴물마다 자동 결정(가로로 넓은 박쥐 = 16:9, 사람형 = 4:5 …).
     결정된 비율은 마지막에 출력되며, 게임의 CREATURES[].ar 에 그대로 넣는다.
  4. 원본에서 이미 잘린 개체는 경고를 띄운다. 잘린 픽셀은 되살릴 수 없으므로
     그 경우 영상을 다시 생성해야 한다.
"""

import os, sys, glob, shutil, subprocess
from PIL import Image
import numpy as np

OUT = './public/img/space-monsters'
TMP = './temp/gsframes'
FRAMES = 24              # 5초 영상을 4.8fps 로 균등 샘플 (실제 속도 재생용)
AREA = 320 * 400         # 프레임 픽셀 수를 비율과 무관하게 일정하게 유지 (파일 크기 안정)
ALPHA = 40               # 이 값보다 진하면 '괴물 픽셀'

os.makedirs(OUT, exist_ok=True)


def key_color(video):
    """영상 중간 프레임의 가장자리에서 실제 배경 초록값을 뽑는다."""
    p = f'{TMP}/_probe.png'
    os.makedirs(TMP, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', video,
                    '-vf', 'select=eq(n\\,20)', '-frames:v', '1', p], check=True)
    im = Image.open(p).convert('RGB')
    w, h = im.size
    pts = [(2, 2), (w - 3, 2), (2, h // 3), (w - 3, h // 3), (w // 2, 2), (2, h // 2), (w - 3, h // 2)]
    cols = [im.getpixel(q) for q in pts]
    avg = tuple(sum(c[i] for c in cols) // len(cols) for i in range(3))
    return '0x%02X%02X%02X' % avg, avg


def extract(name, video):
    """배경만 지운다. 자르기·비율 맞추기는 여기서 하지 않는다."""
    d = f'{TMP}/{name}'
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d, exist_ok=True)
    kc, rgb = key_color(video)
    # chromakey(YUV): 조명 그라데이션이 있어도 색상만 보고 지운다 / despill: 초록 반사광 제거
    # format=rgba 필수 — 없으면 뒤쪽 필터/인코더에서 알파가 유실된다
    vf = (f"chromakey={kc}:0.06:0.02,format=rgba,"
          "despill=type=green:mix=0.6:expand=0.4,"
          "fps=4.8")
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-i', video,
         '-t', '5', '-vf', vf, '-frames:v', str(FRAMES), f'{d}/%02d.png'],
        check=True)
    print(f'    key={kc} rgb={rgb}')
    return sorted(glob.glob(f'{d}/*.png'))


def drop_residue(ims, keep_ratio=0.05):
    """
    크로마키를 통과한 촬영 스튜디오 바닥선·그림자 얼룩을 지운다.

    24프레임의 알파를 합친 마스크에서 연결성분을 구해, 가장 큰 덩어리(괴물 본체)의
    keep_ratio 미만인 조각은 전부 버린다. 프레임별로 따로 지우면 조각이 깜빡이므로
    **공통 마스크 한 장**을 만들어 모든 프레임에 똑같이 적용한다.
    괴물 아래 떠 있던 얼룩이 알파 경계를 넓혀 비율까지 틀어지게 만들기 때문에
    반드시 union_bbox 보다 먼저 돌려야 한다.
    """
    import cv2
    acc = np.zeros(np.array(ims[0]).shape[:2], dtype=np.uint8)
    for im in ims:
        acc = np.maximum(acc, np.array(im)[:, :, 3])
    n, lab, stats, _ = cv2.connectedComponentsWithStats((acc > ALPHA).astype(np.uint8), 8)
    if n <= 1:
        return ims, 0
    areas = stats[1:, cv2.CC_STAT_AREA]
    biggest = int(areas.max())
    keep = np.zeros_like(acc, dtype=bool)
    dropped = 0
    for i, ar in enumerate(areas, start=1):
        if ar >= biggest * keep_ratio:
            keep |= (lab == i)
        else:
            dropped += int(ar)
    out = []
    for im in ims:
        arr = np.array(im)
        arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0)
        out.append(Image.fromarray(arr, 'RGBA'))
    return out, dropped


def edge_clip(ims):
    """원본 프레임 테두리에 괴물이 닿아 있으면 그만큼은 이미 잘려 나간 것이다."""
    L = R = T = B = 0
    for im in ims:
        a = np.array(im)[:, :, 3]
        L = max(L, int((a[:, 0] > 150).sum()));  R = max(R, int((a[:, -1] > 150).sum()))
        T = max(T, int((a[0, :] > 150).sum()));  B = max(B, int((a[-1, :] > 150).sum()))
    return L, R, T, B


def union_bbox(ims):
    """24프레임 전체를 덮는 알파 경계 — 프레임마다 다르게 자르면 괴물이 떨리므로 공통 박스를 쓴다."""
    x0 = y0 = 10 ** 9
    x1 = y1 = -1
    for im in ims:
        a = np.array(im)[:, :, 3]
        ys, xs = np.nonzero(a > ALPHA)
        if not len(xs):
            continue
        x0 = min(x0, int(xs.min())); x1 = max(x1, int(xs.max()))
        y0 = min(y0, int(ys.min())); y1 = max(y1, int(ys.max()))
    if x1 <= x0 or y1 <= y0:
        return None
    return x0, y0, x1 + 1, y1 + 1


def snap_aspect(ar):
    """자유로운 실수 대신 몇 가지 표준 비율로 스냅 — 게임 쪽에서 다루기 쉽고 눈에도 안정적."""
    table = [(0.66, '2:3'), (0.80, '4:5'), (1.00, '1:1'), (1.33, '4:3'), (1.78, '16:9'), (2.20, '11:5')]
    best = min(table, key=lambda t: abs(np.log(ar / t[0])))
    return best


def fit_box(bbox, margin=0.10):
    """
    알파 경계에 여백을 두고, 목표 비율이 되도록 **넓히기만** 한다.
    프레임 밖으로 나가도 그대로 둔다 — crop() 이 알아서 투명 패딩을 넣는다.
    """
    x0, y0, x1, y1 = bbox
    bw, bh = x1 - x0, y1 - y0
    mw, mh = bw * margin, bh * margin
    x0 -= mw; x1 += mw; y0 -= mh; y1 += mh
    bw, bh = x1 - x0, y1 - y0

    ar, label = snap_aspect(bw / bh)
    if bw / bh > ar:            # 목표보다 가로로 넓다 → 세로를 늘린다
        nh = bw / ar
        cy = (y0 + y1) / 2
        y0, y1 = cy - nh / 2, cy + nh / 2
    else:                       # 목표보다 세로로 길다 → 가로를 늘린다
        nw = bh * ar
        cx = (x0 + x1) / 2
        x0, x1 = cx - nw / 2, cx + nw / 2
    return (int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))), ar, label


def build(name, video):
    paths = extract(name, video)
    if len(paths) < FRAMES:
        print(f'  ! {name}: 프레임 {len(paths)}개 — 건너뜀')
        return None
    ims = [Image.open(p).convert('RGBA') for p in paths[:FRAMES]]
    sw, sh = ims[0].size

    ims, dropped = drop_residue(ims)
    if dropped:
        print(f'    잔재 {dropped}px 제거 (바닥선·그림자)')

    L, R, T, B = edge_clip(ims)
    if max(L, R, T, B) > 8:
        print(f'  !! {name}: 원본이 이미 잘려 있음 (좌{L} 우{R} 상{T} 하{B} px) — 영상 재생성 필요')

    bbox = union_bbox(ims)
    if not bbox:
        print(f'  ! {name}: 알파가 비어 있음 — 건너뜀')
        return None
    box, ar, label = fit_box(bbox)

    # 비율에 관계없이 픽셀 수를 일정하게 — 파일 크기와 디코딩 비용을 고르게 유지
    fh = int(round((AREA / ar) ** 0.5))
    fw = int(round(fh * ar))
    ims = [im.crop(box).resize((fw, fh), Image.Resampling.LANCZOS) for im in ims]

    sheet = Image.new('RGBA', (fw, fh * FRAMES), (0, 0, 0, 0))
    cover = []
    for i, im in enumerate(ims):
        a = np.array(im)[:, :, 3]
        cover.append(round(float((a > ALPHA).mean()) * 100, 1))
        sheet.paste(im, (0, i * fh))
    dst = f'{OUT}/{name}-sheet.webp'
    sheet.save(dst, 'WEBP', quality=82, method=6)

    # 완성본이 정말 안 잘렸는지 자체 검사
    L2, R2, T2, B2 = edge_clip(ims)
    ok = 'OK ' if max(L2, R2, T2, B2) == 0 else '!! 여전히 잘림'
    print(f'  {ok} {name:9s} {fw}x{fh} ar={ar} ({label})  원본 {sw}x{sh} -> box {box}'
          f'  {os.path.getsize(dst)//1024} KB  불투명 {min(cover)}~{max(cover)}%')
    return name, ar


if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) < 2 or len(args) % 2:
        print(__doc__)
        sys.exit(1)
    print('=' * 72)
    print('  그린스크린 → 알파 스프라이트 시트 (전신 보존 / 괴물별 비율)')
    print('=' * 72)
    done = []
    for i in range(0, len(args), 2):
        r = build(args[i], args[i + 1])
        if r:
            done.append(r)
    print('-' * 72)
    print('게임 CREATURES[].ar 에 넣을 값:')
    for n, ar in done:
        print(f"    {n:10s} ar: {ar},")
    print('완료')
