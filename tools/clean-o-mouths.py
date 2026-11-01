#!/usr/bin/env python3
"""Clean the «O» mouth poses (E open-o, F pucker) of Lily and Noah.

Why (2026-10-18, 사장님): 「특히 Noah랑 Lily가 o 발음 할때 가장 어색해. 입가에 주름도
많아지고 이것을 최소화 시키고 어색하지 않게 해줘」 + 「Noah 의 «오» 입모양 주변에 옅은
붉은 사각 얼룩 … 이것도 수정해줘」.

What it does, per atlas tile of the poses in params.poses:
  1) Colour: each pose was made by compositing a generated mouth ellipse onto the
     portrait (tools/build-viseme-poses.py). Inside that ellipse the generated skin
     tone differs from the portrait — that is Noah's «pale red square». We find the
     ellipse (where the tile differs from the portrait crop), measure the
     low-frequency skin difference to the portrait (lips of both excluded) and add it
     back, feathered to zero at the ellipse edge. Nose/skin detail is kept.
  2) Creases: in a ring around the pose's own lips (not the lips, not the nose) the
     mid frequencies are replaced by the tile's own masked smoothing plus clipped fine
     grain, so folds soften without a plastic look.
  Pixels near the tile border are never changed (borderMaxChange == 0), so the tile
  still meets the base portrait seamlessly.
Noah G/H shipped as solid black ovals (failed generation); they are replaced by B/C,
the substitution the README originally used.

Deterministic: always starts from the atlas at sourceRev, which must equal the
tools/shrink-mouth.py output recorded in tools/mouth-scale-report.json.
Run, then rebuild the inbetweens:
  python3 tools/clean-o-mouths.py
  python3 tools/build-viseme-transitions.py lily noah
Writes tools/o-mouth-clean-report.json (checked by test-harness/avatar_mouth_scale_harness.mjs).
"""
import hashlib, io, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
import cv2

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT/'cloudflare-deploy/public'
CFG = json.loads((ROOT/'tools/o-mouth-clean.json').read_text())
P = CFG['params']
MS = json.loads((ROOT/'tools/mouth-scale-report.json').read_text())
POSES = 'XABCDEFGH'


def sha(b):
    return hashlib.sha256(b).hexdigest()


def gb(a, s):
    return cv2.GaussianBlur(a, (0, 0), s)


def nblur(a, m, s):
    """Masked (normalised) blur: average of a over m only."""
    m = m.astype(np.float32)
    return gb(a*m[..., None], s)/np.maximum(gb(m, s), 1e-4)[..., None]


def dil(m, r):
    return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2*r+1,)*2)).astype(bool)


def lips(rgb):
    """Lips + mouth opening: redder than this tile's own skin (Lab a*), or dark. Largest blob near the centre."""
    lab = cv2.cvtColor(np.clip(rgb, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    L, A = lab[..., 0], lab[..., 1]
    m = ((A > np.median(A)+P['lipK']) | (L < 70)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab_, st, cen = cv2.connectedComponentsWithStats(m)
    h, w = m.shape
    best, bs = 0, -1
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA]
        cx, cy = cen[i]
        if a < 60 or cy < h*0.3:
            continue                                  # nostrils sit at the top of the tile
        score = a/(1+((cx-w/2)/w)**2*20)
        if score > bs:
            best, bs = i, score
    keep = (lab_ == best).astype(np.uint8) if best else np.zeros_like(m)
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cs, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = np.zeros_like(keep)
    cv2.drawContours(out, cs, -1, 1, -1)
    return out.astype(bool)


def ellipse_region(t, bs):
    """The generated-mouth ellipse: where the tile differs from the portrait."""
    d = gb(np.abs(t-bs).max(2), 2) > P['ellipseThr']
    n, lab, st, _ = cv2.connectedComponentsWithStats(d.astype(np.uint8))
    if n <= 1:
        return np.zeros(d.shape, bool)
    k = 1+int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    ell = cv2.morphologyEx((lab == k).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    cs, _ = cv2.findContours(ell, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    E = np.zeros(d.shape, np.uint8)
    cv2.drawContours(E, cs, -1, 1, -1)
    return E.astype(bool)


def clean(tile, base):
    t = tile[..., :3].copy()
    bs = base[..., :3]
    lt, lb = lips(t), lips(bs)
    h, w = lt.shape
    yy, xx = np.mgrid[0:h, 0:w]
    db = np.minimum(np.minimum(xx, w-1-xx), np.minimum(yy, h-1-yy)).astype(np.float32)
    wb = np.clip((db-P['borderKeep'])/P['borderFade'], 0, 1)
    dist = cv2.distanceTransform((~lt).astype(np.uint8), cv2.DIST_L2, 5)
    off_lip = np.clip((dist-P['lipMargin'])/P['lipFade'], 0, 1)
    # 1) skin colour inside the generated ellipse → the portrait's
    E = ellipse_region(t, bs)
    skin = (E & ~(dil(lt, P['tipMargin']) | dil(lb, P['baseLipMargin']))).astype(np.float32)
    s = P['colorSigma']
    den, den3 = gb(skin, s), gb(skin, 3*s)
    c1 = gb((bs-t)*skin[..., None], s)/np.maximum(den, 1e-4)[..., None]
    c3 = gb((bs-t)*skin[..., None], 3*s)/np.maximum(den3, 1e-4)[..., None]
    a = np.clip(den/0.25, 0, 1)[..., None]          # sparse skin → fall back to the wider estimate
    corr = c1*a+c3*(1-a)
    ein = np.clip(cv2.distanceTransform(E.astype(np.uint8), cv2.DIST_L2, 5)/P['colorFeather'], 0, 1)
    ein = ein*ein*(3-2*ein)
    t = t+corr*(ein*off_lip*wb)[..., None]
    # 2) soften folds in a ring around the lips (not on the nose)
    smooth = nblur(t, ~dil(lt, P['tipMargin']), P['smoothSigma'])
    detail = np.clip(t-gb(t, P['grainSigma']), -P['grainClip'], P['grainClip'])
    ring = off_lip*np.clip((P['ringOut']-dist)/P['ringFade'], 0, 1)
    ys = np.nonzero(lt.any(1))[0]
    top = ys.min() if ys.size else h//2
    nose = np.clip((yy-(top-P['noseGap']))/P['noseFade'], 0, 1)
    wg = (ring*nose*ein*wb)[..., None]
    out = tile.copy()
    out[..., :3] = t*(1-wg)+(smooth+detail)*wg
    keep = (wb == 0)
    out[keep] = tile[keep]
    return out, E, lt, ring


def fold_energy(rgb, region):
    """Mean mid-frequency darkness (folds) in a region."""
    g = rgb.mean(2)
    band = gb(g, 1.0)-gb(g, 4.0)
    return float(np.abs(band)[region].mean()) if region.any() else 0.0


def git_bytes(rev, rel):
    return subprocess.run(['git', 'show', f'{rev}:cloudflare-deploy/public/{rel}'], cwd=ROOT,
                          capture_output=True, check=True).stdout


def run(name):
    a = CFG['actors'][name]
    x, y, w, h = a['rect']
    ms = MS['actors'][name]
    assert ms['rect'] == a['rect'], f'{name}: rect differs from mouth-scale-report'
    rel = f'img/visemes/{name}-mouths.webp'
    raw = git_bytes(CFG['sourceRev'], rel)
    assert sha(raw) == ms['files'][rel]['sha256'], f'{name}: atlas at sourceRev is not the shrink-mouth output'
    brel = f'img/{name}-closed.webp'
    braw = (PUB/brel).read_bytes()
    assert sha(braw) == ms['files'][brel]['sha256'], f'{name}: base portrait is not the shrink-mouth output'
    atlas = np.array(Image.open(io.BytesIO(raw)).convert('RGBA')).astype(np.float32)
    base = np.array(Image.open(io.BytesIO(braw)).convert('RGBA')).astype(np.float32)[y:y+h, x:x+w]
    assert atlas.shape[:2] == (3*h, 3*w), f'{name}: atlas size'
    cell = lambda i: atlas[(i//3)*h:(i//3+1)*h, (i % 3)*w:(i % 3+1)*w]
    out = atlas.copy()
    tiles = []
    for i, pose in enumerate(POSES):
        old = cell(i)
        info = {'pose': pose}
        if pose in a['substitute']:
            src = a['substitute'][pose]
            new = cell(POSES.index(src)).copy()
            info.update(action='substitute:'+src, blackBefore=round(float((old[..., :3].max(2) < 20).mean()), 3))
        elif pose in P['poses']:
            new, E, lt, ring = clean(old, base)
            region = (ring > 0.5) & ~dil(lt, P['tipMargin'])
            skin = E & ~dil(lt, P['tipMargin'])
            lowd = lambda im: float(np.abs(gb(im[..., :3]-base[..., :3], 6).mean(2))[skin].mean()) if skin.any() else 0.0
            info.update(action='clean', foldBefore=round(fold_energy(old[..., :3], region), 3),
                        foldAfter=round(fold_energy(new[..., :3], region), 3),
                        skinToBaseBefore=round(lowd(old), 2), skinToBaseAfter=round(lowd(new), 2),
                        lipMaxChange=float(np.abs(new-old)[lt].max()) if lt.any() else 0.0)
        else:
            new = old
            info.update(action='keep')
        border = np.ones((h, w), bool)
        border[2:-2, 2:-2] = False
        info['borderMaxChange'] = float(np.abs(np.round(new)-np.round(old))[border].max())
        out[(i//3)*h:(i//3+1)*h, (i % 3)*w:(i % 3+1)*w] = new
        tiles.append(info)
        print(name, pose, info)
    buf = io.BytesIO()
    Image.fromarray(np.clip(np.round(out), 0, 255).astype(np.uint8)).save(buf, 'WEBP', lossless=True, method=6)
    data = buf.getvalue()
    (PUB/rel).write_bytes(data)
    return {'rect': a['rect'], 'files': {rel: {'sourceSha256': sha(raw), 'sha256': sha(data), 'bytes': len(data), 'tiles': tiles}}}


def main(names):
    rep = {'schema': 1, 'sourceRev': CFG['sourceRev'], 'params': P, 'actors': {}}
    for n in names:
        rep['actors'][n] = run(n)
    (ROOT/'tools/o-mouth-clean-report.json').write_text(json.dumps(rep, indent=1, ensure_ascii=False)+'\n')


if __name__ == '__main__':
    main(sys.argv[1:] or list(CFG['actors']))
