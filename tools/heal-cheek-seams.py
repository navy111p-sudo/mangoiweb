#!/usr/bin/env python3
"""Heal the line on Lily's cheeks beside the nose (2026-11-10 사장님 「코 양옆 볼에 선」).

Why: every mouth tile was generated with a feathered patch whose cheek is relaxed,
while the base portrait (lily-closed) is a big grin with raised cheeks. Where the
two meet a diagonal arc runs from under each nose wing down past the mouth
corner, and it is a little different in every tile, so it flickers while talking.
The earlier smile-fold pass (tools/remove-smile-folds.py) only healed a narrow
crease band; the arc sits on and outside that band's edge.

Method (numpy + PIL, deterministic, always starts from sourceRev so a re-run never
retouches twice): inside hand-drawn polygons (tools/cheek-seams.json, clear of the
nose outline, the eye rect and every pose's lips) replace the pixels by a Laplace
(membrane) fill from the surrounding skin plus the original fine grain (clipped
high-pass), so no shading edge survives and the skin is not plastic.
  1. Frames closed/mid/wide: the whole polygon.
  2. Mouth tiles: polygon inside the mouth rect, solved on the tile composited over
     the healed, decoded closed frame, so the fill meets the base without a seam at
     the rect border. Pixels outside the polygons are untouched before encoding.

Run, then rebuild the inbetweens from the healed anchors:
  python3 tools/heal-cheek-seams.py
  python3 tools/build-viseme-transitions.py lily   (needs opencv)
Writes tools/cheek-seams-report.json, checked by test-harness/avatar_cheek_seams_harness.mjs.
"""
import importlib.util
import io
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT/'cloudflare-deploy/public'
CFG = json.loads((ROOT/'tools/cheek-seams.json').read_text())
P = CFG['params']
_spec = importlib.util.spec_from_file_location('smile_folds', ROOT/'tools/remove-smile-folds.py')
SF = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(SF)            # helpers only (its main is __name__-guarded)
LUMA = SF.LUMA


def original(rel):
    data = subprocess.run(['git', 'show', f"{CFG['sourceRev']}:cloudflare-deploy/public/{rel}"],
                          cwd=ROOT, capture_output=True, check=True).stdout
    return data, np.array(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.float32)


def fill(img, m):
    x = img.copy()
    x[m] = SF.gblur(img, 6)[m]
    for _ in range(P['iters']):
        avg = (np.roll(x, 1, 0)+np.roll(x, -1, 0)+np.roll(x, 1, 1)+np.roll(x, -1, 1))*0.25
        x[m] = avg[m]
    hf = np.clip(img-SF.gblur(img, P['hfSigma']), -P['hfClip'], P['hfClip'])
    out = img.copy()
    out[m] = (x+hf)[m]
    return out


def line_energy(rgb, m):
    # Shading edges left in the polygons (luma beyond a 2-level texture floor).
    return float(np.maximum(np.abs(SF.dog(rgb))-2, 0)[m].sum())


def run(name):
    a = CFG['actors'][name]
    rx, ry, rw, rh = a['rect']
    pts = [p for poly in a['roi'] for p in poly]
    x0, y0 = min(min(p[0] for p in pts), rx)-16, min(min(p[1] for p in pts), ry)-16
    x1, y1 = max(max(p[0] for p in pts), rx+rw)+16, max(max(p[1] for p in pts), ry+rh)+16
    win = (slice(y0, y1), slice(x0, x1))
    roi = SF.poly_mask(y1-y0, x1-x0, a['roi'], x0, y0)
    in_rect = np.zeros_like(roi)
    in_rect[ry-y0:ry+rh-y0, rx-x0:rx+rw-x0] = True
    report = {'rect': a['rect'], 'window': [x0, y0, x1-x0, y1-y0], 'roiPx': int(roi.sum()), 'files': {}}

    frames = {}
    for kind in ('closed', 'mid', 'wide'):
        rel = f'img/{name}-{kind}.webp'
        raw, im = original(rel)
        rgb = im[..., :3][win]
        new = fill(rgb, roi)
        out = im.copy()
        out[..., :3][win] = new
        data = SF.encode(out, quality=P['frameQuality'])
        (PUB/rel).write_bytes(data)
        dec = np.array(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.float32)
        frames[kind] = dec
        report['files'][rel] = {
            'sourceSha256': SF.sha(raw), 'sha256': SF.sha(data), 'bytes': len(data),
            'energyBefore': round(line_energy(rgb, roi), 1),
            'energyAfter': round(line_energy(dec[..., :3][win], roi), 1),
            'outsideMaxChangePreEncode': float(np.abs(new-rgb)[~roi].max())}
        print(name, kind, report['files'][rel]['energyBefore'], '->', report['files'][rel]['energyAfter'])

    base = frames['closed'][..., :3]          # what the browser decodes under the tile
    rel = f'img/visemes/{name}-mouths.webp'
    raw, atlas = original(rel)
    out_atlas = atlas.copy()
    dom = roi & in_rect
    ty0, tx0 = ry-y0, rx-x0                   # rect origin inside the window

    def seam(img):
        # Luma jump across the rect's left/right border on rows the polygons cover.
        lum = img@LUMA
        jumps = []
        for xx, ox in ((tx0, -1), (tx0+rw-1, 1)):
            rows = np.arange(ty0, ty0+rh)
            sel = roi[rows, xx] | roi[rows, xx+ox]
            jumps.append(np.abs(lum[rows, xx]-lum[rows, xx+ox])[sel])
        return round(float(np.concatenate(jumps).mean()), 2)

    tiles = []
    for i, pose in enumerate('XABCDEFGH'):
        ay, ax = (i//3)*rh, (i % 3)*rw
        tile = atlas[ay:ay+rh, ax:ax+rw, :3]
        comp = base.copy()
        comp[ry:ry+rh, rx:rx+rw] = tile
        cw = comp[win]
        new = fill(cw, dom)
        out_atlas[ay:ay+rh, ax:ax+rw, :3] = new[ty0:ty0+rh, tx0:tx0+rw]
        info = {'pose': pose,
                'energyBefore': round(line_energy(cw, dom), 1), 'energyAfter': round(line_energy(new, dom), 1),
                'seamBefore': seam(cw), 'seamAfter': seam(new),
                'outsideMaxChange': float(np.abs(new-cw)[~dom].max())}
        tiles.append(info)
        print(name, pose, info['energyBefore'], '->', info['energyAfter'],
              'seam', info['seamBefore'], '->', info['seamAfter'])
    data = SF.encode(out_atlas[..., :3], lossless=True)
    (PUB/rel).write_bytes(data)
    report['files'][rel] = {'sourceSha256': SF.sha(raw), 'sha256': SF.sha(data), 'bytes': len(data), 'tiles': tiles}
    return report


def main():
    out = {'schema': 1, 'sourceRev': CFG['sourceRev'], 'params': P, 'actors': {}}
    for name in CFG['actors']:
        out['actors'][name] = run(name)
    (ROOT/'tools/cheek-seams-report.json').write_text(json.dumps(out, indent=1, ensure_ascii=False)+'\n')


if __name__ == '__main__':
    main()
