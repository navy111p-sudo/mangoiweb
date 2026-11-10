#!/usr/bin/env python3
"""Build the torso layers that sit *behind* the AI-speaking face canvas.

EN: The face canvas (mango-avatar.js) shows each friend from the chest up and the
    body is cut flat at the canvas bottom. This script draws the missing torso,
    shoulders-to-waist and the arms, *below* that cut. It only READS the original
    face images; it never writes them. The canvas keeps drawing the face, eyes,
    mouth and lip sync exactly as before, on top of this layer.
KO: AI 말하기 얼굴 캔버스는 가슴 위까지만 보여 주고 몸통이 캔버스 아래에서 잘립니다.
    이 스크립트는 그 아래의 몸통(어깨~허리)과 팔을 그립니다. 원본 얼굴 이미지는
    읽기만 하고 절대 쓰지 않습니다. 얼굴·눈·입·입모양 동기화는 기존 캔버스가 그대로
    위에서 그립니다.

Output (one file per friend): img/bodies/<name>-body.webp
  * width  = canvas width x2, height = (canvas height + EXT) x2, transparent.
  * Rows above the seam are transparent except a thin overlap band (OVERLAP) that
    repeats the canvas pixels, so no gap shows under anti-aliased canvas edges.
  * The head is never copied (it sways on the canvas; a copy would ghost).

How the drawing works (no generative model, no external download):
  1. Map the original still into canvas space with the same crop rect the face
     engine uses (CHARACTERS[*].rect in js/mango-avatar.js).
  2. Read the garment in the last canvas rows: per-column colour + knit texture.
  3. Continue it downward with soft lighting, then draw two arms: a crease shadow
     where each arm meets the torso, slightly darker sleeves, a rim highlight.
  4. Hair or collar columns that touch the seam fade into the garment colour.

Run:  python3 cloudflare-deploy/build-avatar-bodies.py
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'public', 'img')
OUT = os.path.join(IMG, 'bodies')

S = 2            # output pixels per canvas pixel (sharp on 2x screens)
EXT = 160        # canvas px of torso drawn below the seam (40% of a 400px canvas)
OVERLAP = 20     # canvas px repeated above the seam
BAND = 14        # canvas px sampled above the seam to learn the garment
CUT = 4          # canvas px: the drawn torso starts this far above the seam, under the canvas's
                 # faded bottom edge (css/warmup-body.css mask), so a picture's own last rows
                 # (Emma's lighter bottom line) never touch the torso. Must stay < the fade.

# Same sources and crop rects as mango-avatar.js CHARACTERS (read-only).
#   canvas: the face canvas size the engine uses for that friend.
#   arm:    x of the arm/torso crease at the armpit and at the bottom (0..1 of width).
#   ink:    comic outline colour for drawn characters (None = photo shading).
FRIENDS = {
    'emma': dict(src='visemes/emma-v2-rest.webp', rect=(0, 0, 1, 1), canvas=(320, 400),
                 arm=(0.17, 0.21), ink=None),
    'lily': dict(src='lily-closed.webp', rect=(0.05, 0.02, 0.95, 0.92), canvas=(320, 400),
                 arm=(0.15, 0.19), ink=None),
    'noah': dict(src='noah-closed.webp', rect=(0.05, 0.02, 0.95, 0.92), canvas=(320, 400),
                 arm=(0.13, 0.17), ink=None),
    'mei':  dict(src='mei-closed.webp', rect=(0, 0, 1, 1), canvas=(320, 400),
                 arm=(0.17, 0.21), ink=None),
    'long': dict(src='long-closed.webp', rect=(0, 0, 1, 1), canvas=(320, 400),
                 arm=(0.15, 0.19), ink=None),
    'jake': dict(src='jake-closed.webp', rect=(0, 0, 1, 1), canvas=(320, 310),
                 arm=(0.14, 0.18), ink=(20, 14, 18)),
}


def to_canvas(name: str, cfg: dict) -> np.ndarray:
    """Original still -> RGBA float array in canvas space at S x resolution."""
    im = Image.open(os.path.join(IMG, cfg['src'])).convert('RGBA')
    l, t, r, b = cfg['rect']
    box = (im.width * l, im.height * t, im.width * r, im.height * b)
    cw, ch = cfg['canvas']
    out = im.resize((cw * S, ch * S), Image.LANCZOS, box=box)
    return np.asarray(out).astype(np.float32)


def garment_colour(band: np.ndarray) -> np.ndarray:
    """Dominant colour of the opaque seam band (largest of 3 k-means clusters)."""
    px = band[band[..., 3] > 250][:, :3]
    if len(px) < 50:
        px = band.reshape(-1, 4)[:, :3]
    rng = np.random.default_rng(7)
    centers = px[rng.choice(len(px), 3, replace=False)]
    for _ in range(12):
        d = ((px[:, None, :] - centers[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        centers = np.array([px[lab == k].mean(0) if (lab == k).any() else centers[k] for k in range(3)])
    counts = np.bincount(lab, minlength=3)
    return centers[counts.argmax()]


def smooth1d(v: np.ndarray, radius: int) -> np.ndarray:
    k = np.ones(radius * 2 + 1) / (radius * 2 + 1)
    pad = np.pad(v, ((radius, radius),) + ((0, 0),) * (v.ndim - 1), mode='edge')
    return np.stack([np.convolve(pad[:, i], k, 'valid') for i in range(v.shape[1])], 1) if v.ndim == 2 \
        else np.convolve(pad, k, 'valid')


def fabric_noise(shape: tuple, std: np.ndarray, seed: int) -> np.ndarray:
    """Fine knit/weave grain: vertical-ribbed noise scaled to the garment's own grain."""
    h, w = shape
    rng = np.random.default_rng(seed)
    n = Image.fromarray(((rng.standard_normal((h, w)) * 40) + 128).clip(0, 255).astype(np.uint8), 'L')
    n = n.resize((w, h // 3 + 1)).resize((w, h), Image.BICUBIC)   # stretch => vertical rib
    n = np.asarray(n.filter(ImageFilter.GaussianBlur(1.0 * S))).astype(np.float32) - 128
    n /= max(n.std(), 1e-3)
    return n[..., None] * std[None, None, :]


def arm_geometry(cfg: dict, W: int, ext: int):
    """Distance (px) to the nearest arm/torso crease, arm mask and crease reveal."""
    y = np.arange(ext, dtype=np.float32)[:, None] / ext          # 0 at seam .. 1 at bottom
    x = np.arange(W, dtype=np.float32)[None, :] / W
    a0, a1 = cfg['arm']
    start = 0.08                                                  # armpit just below the seam
    t_arm = np.clip((y - start) / (1 - start), 0, 1)
    xl = a0 + (a1 - a0) * t_arm ** 0.8
    xr = 1 - xl
    reveal = np.clip((y - start) / 0.18, 0, 1) ** 1.5             # crease grows in, no hard start
    d = np.minimum(np.abs(x - xl), np.abs(x - xr)) * W
    in_arm = (x < xl) | (x > xr)
    return x, y, d, in_arm, reveal, xl


def photo_torso(src: np.ndarray, seam: int, ext: int, cfg: dict, seed: int) -> np.ndarray:
    """Continue a photographed garment below the seam with arms and soft light."""
    W = src.shape[1]
    band = src[seam - BAND * S:seam]
    edge = src[seam - 3 * S:seam, :, :3].mean(0)                  # exact colour at the cut

    # 1) per-column colour; hair/collar/skin columns fade into the garment colour.
    base = garment_colour(band)
    col = np.median(band[..., :3], axis=0)
    col_g = col.copy()
    col_g[np.linalg.norm(col - base, axis=1) > 60] = base
    col_g = smooth1d(col_g, 8 * S)

    # 2) grain measured on the band, regenerated (no tiling => no stripes).
    bandimg = Image.fromarray(band.clip(0, 255).astype(np.uint8), 'RGBA')
    hf = band[..., :3] - np.asarray(bandimg.filter(ImageFilter.GaussianBlur(3 * S))).astype(np.float32)[..., :3]
    grain = fabric_noise((ext, W), np.minimum(hf.reshape(-1, 3).std(0), 6.0) * 0.45, seed)

    x, y, d, in_arm, reveal, _ = arm_geometry(cfg, W, ext)
    blend = (np.clip(y / 0.22, 0, 1) ** 1.2)[..., None]
    colour = edge[None] * (1 - blend) + col_g[None] * blend
    colour = colour + grain * np.clip(y / 0.06, 0, 1)[..., None]

    # 3) light: 1.0 exactly at the seam, soft fall-off, chest centre a touch brighter.
    ramp = np.clip(y / 0.25, 0, 1)
    light = (1.0 - 0.14 * y ** 1.3) * (1.0 + 0.04 * ramp * np.exp(-((x - 0.5) / 0.24) ** 2))
    # 4) arms: wide soft occlusion where arm meets torso, slightly darker sleeve,
    #    a faint rim of light on the arm side, and a low elbow fold.
    # light garments show a dark line too easily: weaker and wider there.
    lum = float(col_g.mean())
    depth, width = (0.13, 9.0) if lum > 170 else (0.22, 6.0)
    occl = 1 - depth * reveal * np.exp(-(d / (width * S)) ** 2)
    sleeve = 1 - 0.06 * reveal * in_arm
    rim = 1 + 0.05 * reveal * in_arm * np.exp(-((d - 7 * S) / (3.5 * S)) ** 2)
    fold = 1 - 0.06 * in_arm * np.exp(-((y - 0.8) / 0.06) ** 2)
    rgb = colour * (light * occl * sleeve * rim * fold)[..., None]

    alpha = np.repeat(src[seam - 1, :, 3][None], ext, 0)
    return np.dstack([rgb.clip(0, 255), alpha])


def comic_torso(src: np.ndarray, seam: int, ext: int, cfg: dict) -> np.ndarray:
    """Jake is a comic drawing whose cut falls on the neck: grow a plain hero suit (no logo)
    out of the cut itself, so nothing changes at the seam. The cape's front edge starts at
    the neck, where the picture's cape ends, and sweeps out to the arm; the neckline starts
    at the neck's own edges; colours come from the picture; light is smooth (no flat
    blocks); and the first rows cross-fade from the picture's last row."""
    W = src.shape[1]
    ink = np.array(cfg['ink'], np.float32)
    last = src[seam - 2 * S:seam]
    a = last[..., 3].mean(0)
    rgb_last = last[..., :3].mean(0)
    skin_ref = np.array([236, 190, 140], np.float32)
    is_skin = (a > 200) & (np.linalg.norm(rgb_last - skin_ref, axis=1) < 70)
    is_skin[:int(W * 0.2)] = is_skin[int(W * 0.8):] = False       # the neck is central
    reds = rgb_last[(a > 200) & (rgb_last[:, 0] > 150) & (rgb_last[:, 1] < 90)]
    red = reds.mean(0) if len(reds) else np.array([200, 40, 30], np.float32)
    skin = rgb_last[is_skin].mean(0) if is_skin.any() else skin_ref
    blue = np.array([38, 72, 150], np.float32)                     # suit body
    xs = np.where(is_skin)[0]
    nl, nr = (xs.min(), xs.max()) if len(xs) else (int(W * 0.35), int(W * 0.65))

    x, y, _, _, _, xl = arm_geometry(cfg, W, ext)
    yy, xx = y * ext, x * W
    # cape front edges: from the neck at the seam (where the picture's cape ends) out to
    # the arm creases, ease-out; below that they are the arm creases.
    sweep = 1 - (1 - np.clip(y / 0.32, 0, 1)) ** 2
    el = nl / W + (xl - nl / W) * sweep
    er = nr / W + (1 - xl - nr / W) * sweep
    in_cape = (x < el) | (x > er)
    dc = np.minimum(np.abs(x - el), np.abs(x - er)) * W            # px to a cape edge
    ax = np.abs(x - 0.5)
    # neckline: a shallow U joining the skin edges of the neck.
    cx, half = (nl + nr) / 2, max((nr - nl) / 2, 1)
    u = np.clip(1 - ((xx - cx) / half) ** 2, 0, 1)
    neck_y = 22 * S * u
    in_neck = (np.abs(xx - cx) < half) & (yy < neck_y)
    rgb = np.empty((ext, W, 3), np.float32)
    rgb[:] = blue
    rgb[in_cape] = red
    rgb[in_neck] = skin
    # smooth light: darker downwards, chest centre brighter, soft depth beside the cape.
    light = (1.0 - 0.16 * y ** 1.2) * (1.0 + 0.07 * np.exp(-((x - 0.5) / 0.2) ** 2))
    light = light * (1 - 0.18 * np.exp(-(dc / (7 * S)) ** 2) * ~in_cape)
    light = light * (1 - 0.10 * np.clip((ax - 0.36) / 0.14, 0, 1) * in_cape)
    rgb *= light[..., None]
    # ink: one line along the cape edge (the neck outline continues into it) and the neckline.
    line = dc < 1.3 * S
    line |= (np.abs(yy - neck_y) < 1.3 * S) & (np.abs(xx - cx) < half)
    rgb[line] = ink
    alpha = np.full((ext, W), 255, np.float32)
    alpha[:, (src[seam - 1, :, 3] < 10)] = 0                       # keep the picture's side margins
    # first rows: cross-fade from the picture's own last row, so the cut never shows.
    t = np.clip(yy[:, :1] / (8 * S), 0, 1)
    t = t * t * (3 - 2 * t)
    row = src[seam - 1]
    rgb = row[None, :, :3] * (1 - t[..., None]) + rgb * t[..., None]
    alpha = row[None, :, 3] * (1 - t) + alpha * t
    return np.dstack([rgb.clip(0, 255), alpha])


def build(name: str, cfg: dict) -> Image.Image:
    cw, ch = cfg['canvas']
    W, seam, ext = cw * S, ch * S, EXT * S
    src = to_canvas(name, cfg)
    top = seam - CUT * S                                           # first drawn row
    if cfg['ink'] is None:
        body = photo_torso(src, top, seam + ext - top, cfg, seed=sum(map(ord, name)))
    else:
        body = comic_torso(src, top, seam + ext - top, cfg)

    # 5) assemble: transparent canvas area, overlap band of real pixels, drawn torso.
    full = np.zeros((seam + ext, W, 4), np.float32)
    full[seam - OVERLAP * S:top] = src[seam - OVERLAP * S:top]
    full[top:] = body
    return Image.fromarray(full.round().astype(np.uint8), 'RGBA')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, cfg in FRIENDS.items():
        img = build(name, cfg)
        path = os.path.join(OUT, f'{name}-body.webp')
        img.save(path, 'WEBP', quality=86, method=6, exact=False)
        print(f'{name}: {img.size[0]}x{img.size[1]} -> {os.path.relpath(path, HERE)} '
              f'({os.path.getsize(path):,} bytes)')


if __name__ == '__main__':
    main()
