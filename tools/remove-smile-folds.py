#!/usr/bin/env python3
"""Remove the smile-line creases (nasolabial folds) beside the mouth of Lily/Noah.

Why: the base portrait is a big grin, so its folds sit right on the mouth-patch
border while every mouth tile carries its own, differently placed fold - on screen
the two met as a broken double crease (2026-10-18 사장님 「입가 주름을 없애줘」).

Method (numpy + PIL only, deterministic, always starts from the originals at
sourceRev so a re-run never retouches twice):
  1. Inside the hand-drawn ROI polygons (tools/smile-folds-roi.json) find crease
     pixels: luminance darker (and the bright ridge beside it) than a 4 px
     surround by > thr, small specks (pores, stubble) dropped by area.
  2. Fill those pixels by Laplace interpolation from the surrounding skin and add
     back the original fine grain (clipped high-pass) so the skin is not plastic.
  Pixels outside the detected mask are untouched before encoding.
Mouth tiles are the base crop with a feathered mouth patch: a border strip of
the tile (plus frame pixels the base retouch never touched) takes the retouched
base verbatim, identical in every tile; the rest is healed per tile with that
strip as its boundary. Dark placeholder tiles (Noah G/H) get the retouched frame;
their patch is kept.

Run, then rebuild the inbetweens from the retouched anchors:
  python3 tools/remove-smile-folds.py
  python3 tools/build-viseme-transitions.py lily noah   (needs opencv)
Writes the report test-harness/avatar_smile_folds_harness.mjs checks.
"""
import hashlib, io, json, subprocess, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT/'cloudflare-deploy/public'
CFG = json.loads((ROOT/'tools/smile-folds-roi.json').read_text())
P = CFG['params']
LUMA = np.array([0.299, 0.587, 0.114], np.float32)


def original(rel):
    data = subprocess.run(['git', 'show', f"{CFG['sourceRev']}:cloudflare-deploy/public/{rel}"],
                          cwd=ROOT, capture_output=True, check=True).stdout
    return data, np.array(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.float32)


def poly_mask(h, w, polys, ox=0, oy=0):
    yy, xx = np.mgrid[0:h, 0:w]
    X, Y = xx+ox+0.5, yy+oy+0.5
    out = np.zeros((h, w), bool)
    for poly in polys:
        inside = np.zeros((h, w), bool)
        for (x1, y1), (x2, y2) in zip(poly, poly[1:]+poly[:1]):
            if y1 == y2:
                continue
            span = (Y >= min(y1, y2)) & (Y < max(y1, y2))
            inside ^= span & (X < x1+(Y-y1)*(x2-x1)/(y2-y1))
        out |= inside
    return out


def gblur(a, s):
    k = int(3*s+1)
    g = np.exp(-np.arange(-k, k+1)**2/(2*s*s))
    g /= g.sum()
    out = a.astype(np.float32)
    for ax in (0, 1):
        pad = [(0, 0)]*out.ndim
        pad[ax] = (k, k)
        p = np.pad(out, pad, mode='edge')
        out = sum(g[i]*np.take(p, np.arange(i, i+out.shape[ax]), axis=ax) for i in range(2*k+1))
    return out


def keep_large(b, min_area):
    h, w = b.shape
    seen = np.zeros((h, w), bool)
    keep = np.zeros((h, w), bool)
    for y0, x0 in zip(*np.nonzero(b)):
        if seen[y0, x0]:
            continue
        seen[y0, x0] = True
        q, pix = deque([(y0, x0)]), []
        while q:
            y, x = q.popleft()
            pix.append((y, x))
            for yy in range(max(0, y-1), min(h, y+2)):
                for xx in range(max(0, x-1), min(w, x+2)):
                    if b[yy, xx] and not seen[yy, xx]:
                        seen[yy, xx] = True
                        q.append((yy, xx))
        if len(pix) >= min_area:
            for y, x in pix:
                keep[y, x] = True
    return keep


def dilate(b, r):
    out = b.copy()
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            if dx*dx+dy*dy <= r*r:
                out |= np.roll(np.roll(b, dy, 0), dx, 1)
    return out


def frame_mask(same, r):
    """Clean 'tile equals base' mask: drop isolated specks and thin spurs inside the
    generated patch (they would take base pixels and leave scratch lines), keep the
    solid frame that touches the tile border."""
    h, w = same.shape
    pad = np.pad(same, r, constant_values=True)
    core = ~dilate(~pad, r)[r:-r, r:-r]          # erode
    seen = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w-1) if core[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h-1) if core[y, x])
    for y, x in q:
        seen[y, x] = True
    while q:
        y, x = q.popleft()
        for yy, xx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= yy < h and 0 <= xx < w and core[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                q.append((yy, xx))
    grown = dilate(np.pad(seen, r), r)[r:-r, r:-r]
    return grown & same


def dog(rgb):
    lum = rgb@LUMA
    return gblur(lum, 4.0)-gblur(lum, 1.0)   # >0 darker than surround, <0 brighter


def crease_mask(rgb, roi):
    v = dog(rgb)
    found = keep_large((v > P['darkThr']) & roi, P['minArea']) | keep_large((-v > P['brightThr']) & roi, P['minArea'])
    return dilate(found, P['grow']) & dilate(roi, 1)


def energy(rgb, roi):
    # Crease strength left in the ROI (luma levels beyond a 2-level texture floor).
    return float(np.maximum(np.abs(dog(rgb))-2, 0)[roi].sum())


def laplace_fill(img, m):
    x = img.copy()
    if not m.any():
        return x
    x[m] = gblur(img, 5)[m]
    for _ in range(P['iters']):
        avg = (np.roll(x, 1, 0)+np.roll(x, -1, 0)+np.roll(x, 1, 1)+np.roll(x, -1, 1))*0.25
        x[m] = avg[m]
    return x


def heal(cur, texture_src, fill, weight_mask):
    """cur: pixels to change; fill: where Laplace solves; weight_mask: unclipped crease mask."""
    hf = np.clip(texture_src-gblur(texture_src, P['hfSigma']), -P['hfClip'], P['hfClip'])
    w = (fill*np.clip(gblur(weight_mask.astype(np.float32), 1.0)*1.5, 0, 1))[..., None]
    return cur*(1-w)+(laplace_fill(cur, fill)+hf)*w


def sha(b):
    return hashlib.sha256(b).hexdigest()


def encode(rgba, **kw):
    buf = io.BytesIO()
    Image.fromarray(np.clip(np.round(rgba), 0, 255).astype(np.uint8)).save(buf, 'WEBP', method=6, **kw)
    return buf.getvalue()


def run(name):
    a = CFG['actors'][name]
    rx, ry, rw, rh = a['rect']
    pts = [p for poly in a['roi'] for p in poly]
    x0 = max(0, min(min(p[0] for p in pts), rx)-24)
    y0 = max(0, min(min(p[1] for p in pts), ry)-24)
    x1 = max(max(p[0] for p in pts), rx+rw)+24
    y1 = max(max(p[1] for p in pts), ry+rh)+24
    win = (slice(y0, y1), slice(x0, x1))
    roi = poly_mask(y1-y0, x1-x0, a['roi'], x0, y0)
    in_rect = np.zeros_like(roi)
    in_rect[ry-y0:ry-y0+rh, rx-x0:rx-x0+rw] = True
    rect_w = (slice(ry-y0, ry-y0+rh), slice(rx-x0, rx-x0+rw))
    report = {'rect': a['rect'], 'window': [x0, y0, x1-x0, y1-y0], 'files': {}}
    outside = ~dilate(roi, P['grow']+1)

    frames = {}
    for kind in ('closed', 'mid', 'wide'):
        rel = f'img/{name}-{kind}.webp'
        raw, im = original(rel)
        rgb = im[..., :3][win]
        m = crease_mask(rgb, roi)
        new = heal(rgb, rgb, m, m)
        out = im.copy()
        out[..., :3][win] = new
        data = encode(out, quality=P['frameQuality'])   # ~ the originals' size (q89)
        (PUB/rel).write_bytes(data)
        dec_full = np.array(Image.open(io.BytesIO(data)).convert('RGBA')).astype(np.float32)
        frames[kind] = (im, dec_full, m)   # tiles match what the browser decodes
        dec = dec_full[..., :3][win]
        report['files'][rel] = {
            'sourceSha256': sha(raw), 'sha256': sha(data), 'bytes': len(data), 'maskPx': int(m.sum()),
            'energyBefore': round(energy(rgb, roi), 1), 'energyAfter': round(energy(dec, roi), 1),
            'outsideMaxChangePreEncode': float(np.abs(new-rgb)[outside].max()),
            'outsideMeanChangeEncoded': round(float(np.abs(dec-rgb)[outside].mean()), 3)}
        print(name, kind, report['files'][rel]['energyBefore'], '->', report['files'][rel]['energyAfter'])

    base_im, base_ret, base_m = frames['closed']
    rel = f'img/visemes/{name}-mouths.webp'
    raw, atlas = original(rel)
    out_atlas = atlas.copy()
    tiles = []
    base_rect_orig = base_im[ry:ry+rh, rx:rx+rw, :3]
    base_rect_ret = base_ret[ry:ry+rh, rx:rx+rw, :3]
    band = np.ones((rh, rw), bool)
    band[P['frameBand']:-P['frameBand'], P['frameBand']:-P['frameBand']] = False
    base_touched = dilate(np.pad(base_m[rect_w], 2), 2)[2:-2, 2:-2]
    for i, pose in enumerate('XABCDEFGH'):
        ty, tx = (i//3)*rh, (i % 3)*rw
        tile = atlas[ty:ty+rh, tx:tx+rw]
        alpha = tile[..., 3:4]/255
        # Each tile is the base crop with a feathered mouth patch on top; outside
        # the patch it equals the base. A border strip of that frame (and frame
        # pixels the base retouch never touched) takes the retouched base verbatim,
        # so every tile meets the base without a seam and the inbetween optical
        # flow sees nothing move at the rect edge. Frame pixels inside the strip
        # that the base retouch did change are healed per tile instead: the base
        # fill there leans on the grin's mouth corner, which other poses do not have.
        raw_same = np.abs(tile[..., :3]-base_rect_orig).max(2) <= P['sameTol']
        same = frame_mask(raw_same, P['frameOpen'])
        fixed = same & (band | ~base_touched)
        out_atlas[ty:ty+rh, tx:tx+rw, :3][fixed] = base_rect_ret[fixed]
        info = {'pose': pose, 'framePx': int(same.sum()), 'fixedPx': int(fixed.sum())}
        if float((tile[..., :3].max(2) < 20).mean()) > P['darkPlaceholder']:
            out_atlas[ty:ty+rh, tx:tx+rw, :3][same] = base_rect_ret[same]
            info['skipped'] = 'dark_placeholder'   # patch left as is, whole frame retouched
            tiles.append(info)
            continue
        free = np.zeros_like(roi)
        free[rect_w] = ~fixed
        comp_orig = base_im[..., :3].copy()
        comp_orig[ry:ry+rh, rx:rx+rw] = tile[..., :3]*alpha+base_rect_orig*(1-alpha)
        comp_orig = comp_orig[win]
        cur = base_ret[..., :3][win].copy()
        cur[rect_w] = np.where(fixed[..., None], base_rect_ret,
                               tile[..., :3]*alpha+base_rect_ret*(1-alpha))
        m_full = crease_mask(comp_orig, roi)
        # Thin spurs where the patch happens to equal the base still carry the old
        # crease; they are too thin for the crease detector, so heal them as well.
        spur = np.zeros_like(roi)
        spur[rect_w] = raw_same & ~same
        m_full |= dilate(spur, 1) & roi
        new = heal(cur, comp_orig, m_full & free, m_full)
        a_rect = np.maximum(alpha, 1/255)
        delta = (new-cur)[rect_w]/a_rect
        upd = ~fixed
        out_atlas[ty:ty+rh, tx:tx+rw, :3][upd] = np.clip(tile[..., :3]+delta, 0, 255)[upd]
        shown = new
        # Seam: luma jump across the rect border inside the ROI, before vs after.
        def seam(img):
            lum = img@LUMA
            pairs = []
            ys = np.arange(ry-y0, ry-y0+rh)
            for xx, ox in ((rx-x0, -1), (rx-x0+rw-1, 1)):
                sel = roi[ys, xx] | roi[ys, xx+ox]
                if sel.any():
                    pairs.append(np.abs(lum[ys, xx]-lum[ys, xx+ox])[sel])
            return round(float(np.concatenate(pairs).mean()), 2) if pairs else 0.0
        info.update({'maskPx': int((m_full & free).sum()),
                     'energyBefore': round(energy(comp_orig, roi), 1), 'energyAfter': round(energy(shown, roi), 1),
                     'seamBefore': seam(comp_orig), 'seamAfter': seam(shown)})
        tiles.append(info)
        print(name, pose, info['energyBefore'], '->', info['energyAfter'], 'seam', info['seamBefore'], '->', info['seamAfter'])
    data = encode(out_atlas, lossless=True)
    (PUB/rel).write_bytes(data)
    report['files'][rel] = {'sourceSha256': sha(raw), 'sha256': sha(data), 'bytes': len(data), 'tiles': tiles}
    return report


def main(names):
    out = {'schema': 1, 'sourceRev': CFG['sourceRev'], 'params': P, 'actors': {}}
    for name in names:
        out['actors'][name] = run(name)
    (ROOT/'tools/smile-folds-report.json').write_text(json.dumps(out, indent=1, ensure_ascii=False)+'\n')


if __name__ == '__main__':
    main(sys.argv[1:] or list(CFG['actors']))
