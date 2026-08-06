#!/usr/bin/env python3
"""
우주 괴물 — 배경 제거 알파 스프라이트 시트 생성 (OpenCV GrabCut)

temp/monframes/<name>/01..12.png (배경 포함)
  → GrabCut 매팅으로 복도 배경 제거 → RGBA
  → 12프레임 세로 스트립 WebP
  → public/img/space-monsters/<name>-sheet.webp

게임은 background-position-y 를 steps(12) 로 넘겨 애니메이션.
WebP 알파는 Safari 14+/Chrome/Firefox 전부 지원.

사용:  python build-monster-alpha-sheets.py [name ...]
"""

import os, sys, glob
import cv2
import numpy as np
from PIL import Image

SRC, OUT = './temp/monframes', './public/img/space-monsters'
ALL = ['tripod', 'blob', 'spider', 'cyclops', 'flyer', 'tentacle', 'armor', 'phantom']
FRAMES, W, H = 12, 320, 400

os.makedirs(OUT, exist_ok=True)


def matte(bgr):
    """복도 배경을 제거하고 알파(0~255)를 돌려준다."""
    h, w = bgr.shape[:2]

    # 1) GrabCut — 테두리는 확실한 배경, 중앙 기둥은 확실한 전경 후보
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[int(h * .06):int(h * .97), int(w * .10):int(w * .90)] = cv2.GC_PR_FGD
    m = int(w * .045)
    mask[:, :m] = cv2.GC_BGD
    mask[:, -m:] = cv2.GC_BGD
    mask[:int(h * .03), :] = cv2.GC_BGD
    mask[int(h * .985):, :] = cv2.GC_BGD

    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(bgr, mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return None
    a = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # 2) 배경색 거리 기반 보강 — 밝든 어둡든 "복도 색과 다른" 픽셀이 괴물이다
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = np.vstack([
        lab[:int(h * .05)].reshape(-1, 3),
        lab[int(h * .95):].reshape(-1, 3),
        lab[:, :int(w * .07)].reshape(-1, 3),
        lab[:, int(w * .93):].reshape(-1, 3),
    ])
    mu = border.mean(0)
    sd = border.std(0) + 6.0
    dist = np.linalg.norm((lab - mu) / sd, axis=2)
    diff = (dist > np.percentile(dist, 78)).astype(np.uint8) * 255
    diff = cv2.morphologyEx(diff, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8))
    diff = cv2.morphologyEx(diff, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    # GrabCut 결과가 사실상 비었으면 색거리 결과로 대체, 아니면 합집합
    a = diff if (a > 0).mean() < 0.02 else cv2.bitwise_or(a, diff)

    # 3) 2차 GrabCut 정제 — 1차 결과를 씨앗으로 다시 분리
    if 0.03 < (a > 0).mean() < 0.92:
        core = cv2.erode(a, np.ones((15, 15), np.uint8))
        far = cv2.dilate(a, np.ones((21, 21), np.uint8))
        m2 = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
        m2[far > 0] = cv2.GC_PR_FGD
        m2[core > 0] = cv2.GC_FGD
        m2[far == 0] = cv2.GC_BGD
        try:
            cv2.grabCut(bgr, m2, None,
                        np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                        3, cv2.GC_INIT_WITH_MASK)
            a = np.where((m2 == cv2.GC_FGD) | (m2 == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        except cv2.error:
            pass

    # 4) 구멍 메우기 + 가장 큰 덩어리만 남기기
    a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((13, 13), np.uint8))
    n, lab2, stats, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8), 8)
    if n > 1:
        big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        a = np.where(lab2 == big, 255, 0).astype(np.uint8)

    # 5) 적응형 중앙 가중 — 마스크 무게중심에서 멀리 뻗은 복도 꼬리를 잘라낸다
    ys, xs = np.nonzero(a)
    if len(xs) > 50:
        cx, cy = xs.mean(), ys.mean()
        d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
        R = max(20.0, np.percentile(d, 72))      # 괴물 본체 반경 (붙은 복도는 소수라 영향 적음)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        rr = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / R
        wgt = np.clip((1.85 - rr) / 0.55, 0, 1)
        a = (a.astype(np.float32) * wgt).astype(np.uint8)

    # 6) 가장자리 부드럽게 (하드 컷 방지)
    a = cv2.erode(a, np.ones((3, 3), np.uint8), iterations=1)
    a = cv2.GaussianBlur(a, (0, 0), 3.0)
    return a


def build(name):
    paths = sorted(glob.glob(f'{SRC}/{name}/*.png'))[:FRAMES]
    if len(paths) < FRAMES:
        print(f'  ! {name}: 프레임 {len(paths)}개 — 건너뜀')
        return
    sheet = Image.new('RGBA', (W, H * FRAMES), (0, 0, 0, 0))
    for i, p in enumerate(paths):
        bgr = cv2.imread(p, cv2.IMREAD_COLOR)
        if bgr.shape[1] != W or bgr.shape[0] != H:
            bgr = cv2.resize(bgr, (W, H), interpolation=cv2.INTER_LANCZOS4)
        a = matte(bgr)
        if a is None:
            a = np.full((H, W), 255, np.uint8)
        rgba = np.dstack([cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), a])
        sheet.paste(Image.fromarray(rgba, 'RGBA'), (0, i * H))
    dst = f'{OUT}/{name}-sheet.webp'
    sheet.save(dst, 'WEBP', quality=82, method=6)
    print(f'  OK {name:9s} -> {os.path.getsize(dst)//1024} KB')


if __name__ == '__main__':
    names = sys.argv[1:] or ALL
    print('=' * 52)
    print('  괴물 배경 제거 → 알파 스프라이트 시트')
    print('=' * 52)
    for n in names:
        build(n)
    print('완료')
