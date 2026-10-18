#!/usr/bin/env python3
"""Make the mouth a little smaller relative to the face (Lily), keeping every
mouth pose registered to the base portrait.

Why: on the warmup card Lily's mouth looked too big for her face
(2026-10-18 사장님 「입이 얼굴에 비해 좀 큰 것 같아. 얼굴을 조금 더 크게 해서
비례에 맞게 · 아주 자연스럽게」). The face is enlarged on screen by a tighter
crop (CHARACTERS.lily.rect in js/mango-avatar.js); this tool shrinks only the
mouth region so the two together keep the mouth at its old on-screen size
while the face grows.

Method (deterministic, always starts from the files at sourceRev so a re-run
never shrinks twice):
  One smooth "pucker" warp around the mouth centre, identical for every file:
    source = c + (p - c) * (1 + k * w(rho)),  rho = elliptical distance / radius
  w = 1 on a plateau (rho <= plateau) and eases to 0 at rho = 1, so the mouth
  itself is scaled uniformly by 1/(1+k) and the cheeks blend back with no fold.
  The support ellipse lies strictly inside the mouth-patch rect (PRECISION), so
  the rect border - where the browser lays each mouth tile over the base - is
  bit-identical to before. Tiles are warped in premultiplied RGBA, so
  warp(tile) over warp(base) == warp(tile over base): every pose stays aligned.
  The three full frames (closed/mid/wide) get the same warp at the same
  absolute centre. Pixels outside the support are never touched before encode.

Run, then rebuild the inbetweens from the new anchors:
  python3 tools/shrink-mouth.py
  python3 tools/build-viseme-transitions.py lily      (needs opencv)
Writes tools/mouth-scale-report.json, checked by
test-harness/avatar_mouth_scale_harness.mjs.
"""
import hashlib, io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
import cv2

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT/'cloudflare-deploy/public'
CFG = json.loads((ROOT/'tools/mouth-scale.json').read_text())
P = CFG['params']


def original(rel):
    data = subprocess.run(['git', 'show', f"{CFG['sourceRev']}:cloudflare-deploy/public/{rel}"],
                          cwd=ROOT, capture_output=True, check=True).stdout
    return data, np.array(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.float32)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def weight(rho):
    t = np.clip((rho-P['plateau'])/(1-P['plateau']), 0, 1)
    return 1-t*t*(3-2*t)                        # 1 on the plateau, smoothstep to 0 at the edge


def warp(rgba, cx, cy, rx, ry, k):
    """Backward-map an RGBA image (float, straight alpha) around (cx,cy) in its own pixel coords."""
    h, w = rgba.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx, dy = xx-cx, yy-cy
    rho = np.sqrt((dx/rx)**2+(dy/ry)**2)
    f = (1+k*weight(rho)).astype(np.float32)
    mx, my = (cx+dx*f).astype(np.float32), (cy+dy*f).astype(np.float32)
    pm = rgba.copy()
    pm[..., :3] *= pm[..., 3:4]/255
    out = cv2.remap(pm, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    out = np.clip(out, 0, 255)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 0, out[..., :3]*255/np.maximum(a, 1e-6), 0)
    support = rho < 1
    res = rgba.copy()
    res[support] = out[support]                 # outside the support: the original, untouched
    return res, support


def encode(rgba, **kw):
    buf = io.BytesIO()
    Image.fromarray(np.clip(np.round(rgba), 0, 255).astype(np.uint8)).save(buf, 'WEBP', method=6, **kw)
    return buf.getvalue()


def lip_width(rgb):
    red = rgb[..., 0]-rgb[..., 1]
    xs = np.nonzero((red > P['lipRedThr']).any(0))[0]
    return int(xs.max()-xs.min()+1) if xs.size else 0


def run(name):
    a = CFG['actors'][name]
    ox0, oy0, ow, oh = a['rect']                # the rect the committed tiles were cut at
    rx0, ry0, rw, rh = a.get('newRect', a['rect'])   # Noah: widened so the support can reach the mouth corners
    assert rx0 <= ox0 and ry0 <= oy0 and rx0+rw >= ox0+ow and ry0+rh >= oy0+oh, 'newRect must contain rect'
    cx, cy = a['centre']
    erx, ery = a['radius']
    k = 1/P['scale']-1
    assert cx-erx > rx0 and cx+erx < rx0+rw and cy-ery > ry0 and cy+ery < ry0+rh, 'support must stay inside the rect'
    rep = {'rect': [rx0, ry0, rw, rh], 'oldRect': a['rect'], 'centre': a['centre'], 'radius': a['radius'], 'files': {}}

    base0 = None
    for kind in ('closed', 'mid', 'wide'):
        rel = f'img/{name}-{kind}.webp'
        raw, im = original(rel)
        if kind == 'closed':
            base0 = im                              # PRECISION base (noah-closed / lily-closed), pre-warp
        new, support = warp(im, cx, cy, erx, ery, k)
        data = encode(new, quality=P['frameQuality'])
        (PUB/rel).write_bytes(data)
        rect = (slice(ry0, ry0+rh), slice(rx0, rx0+rw))
        rep['files'][rel] = {
            'sourceSha256': sha(raw), 'sha256': sha(data), 'bytes': len(data),
            'outsideMaxChangePreEncode': float(np.abs(new-im)[~support].max()),
            'lipWidthBefore': lip_width(im[..., :3][rect]), 'lipWidthAfter': lip_width(new[..., :3][rect])}
        print(name, kind, rep['files'][rel]['lipWidthBefore'], '->', rep['files'][rel]['lipWidthAfter'])

    rel = f'img/visemes/{name}-mouths.webp'
    raw, atlas = original(rel)
    out = np.zeros((3*rh, 3*rw, 4), np.float32)
    tiles = []
    for i, pose in enumerate('XABCDEFGH'):
        old = atlas[(i//3)*oh:(i//3+1)*oh, (i % 3)*ow:(i % 3+1)*ow]
        # Widened tile = the base around it + the old tile composited on top (straight alpha over).
        tile = base0[ry0:ry0+rh, rx0:rx0+rw].copy()
        al = old[..., 3:4]/255
        sub = tile[oy0-ry0:oy0-ry0+oh, ox0-rx0:ox0-rx0+ow]
        a_out = al+sub[..., 3:4]/255*(1-al)
        sub[..., :3] = np.where(a_out > 0, (old[..., :3]*al+sub[..., :3]*(sub[..., 3:4]/255)*(1-al))/np.maximum(a_out, 1e-6), 0)
        sub[..., 3:4] = a_out*255
        ty, tx = (i//3)*rh, (i % 3)*rw
        new, support = warp(tile, cx-rx0, cy-ry0, erx, ery, k)
        out[ty:ty+rh, tx:tx+rw] = new
        border = np.ones((rh, rw), bool)
        border[2:-2, 2:-2] = False
        tiles.append({'pose': pose, 'borderMaxChange': float(np.abs(new-tile)[border].max()),
                      'lipWidthBefore': lip_width(tile[..., :3]), 'lipWidthAfter': lip_width(new[..., :3])})
        print(name, pose, tiles[-1]['lipWidthBefore'], '->', tiles[-1]['lipWidthAfter'])
    data = encode(out, lossless=True)
    (PUB/rel).write_bytes(data)
    rep['files'][rel] = {'sourceSha256': sha(raw), 'sha256': sha(data), 'bytes': len(data), 'tiles': tiles}
    return rep


def main(names):
    out = {'schema': 1, 'sourceRev': CFG['sourceRev'], 'params': P, 'actors': {}}
    for name in names:
        out['actors'][name] = run(name)
    (ROOT/'tools/mouth-scale-report.json').write_text(json.dumps(out, indent=1, ensure_ascii=False)+'\n')


if __name__ == '__main__':
    main(sys.argv[1:] or list(CFG['actors']))
