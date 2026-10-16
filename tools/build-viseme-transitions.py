#!/usr/bin/env python3
"""Build reproducible mouth-only inbetweens from the reviewed nine-pose atlases.

9 anchors + 9*8 ordered transitions*4 inbetweens = 297 rendered shapes/actor.
These are transitional shapes, NOT 297 independently recognized phonemes.
Bidirectional optical flow aligns lip texture before blending. Alpha is blended
in premultiplied space, avoiding a dark fringe around the transparent patch.
"""
from pathlib import Path
import hashlib
import json
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'cloudflare-deploy/public/img/visemes'
ACTORS = {'lily': (144, 122, 'lily-mouths.webp'),
          'noah': (154, 130, 'noah-mouths.webp'),
          'emma': (146, 126, 'emma-v2-mouths.webp')}
STEPS, COLS = 4, 18


def warp_pair(a, b):
    # Fixed background outside the mouth prevents flow following alpha edges.
    ga = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY)
    gb = cv2.cvtColor(b[..., :3], cv2.COLOR_RGB2GRAY)
    flow = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    ab, ba = flow.calc(ga, gb, None), flow.calc(gb, ga, None)
    # Bound motion to the mouth patch; large mismatches must not drag the face.
    ab = np.clip(ab, -18, 18)
    ba = np.clip(ba, -18, 18)
    yy, xx = np.mgrid[:a.shape[0], :a.shape[1]].astype(np.float32)
    af, bf = a.astype(np.float32)/255, b.astype(np.float32)/255
    af[..., :3] *= af[..., 3:4]
    bf[..., :3] *= bf[..., 3:4]
    for step in range(1, STEPS+1):
        t = step/(STEPS+1)
        aw = cv2.remap(af, xx-t*ab[..., 0], yy-t*ab[..., 1], cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT)
        bw = cv2.remap(bf, xx-(1-t)*ba[..., 0], yy-(1-t)*ba[..., 1], cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT)
        mixed = aw*(1-t)+bw*t
        mixed[..., :3] /= np.maximum(mixed[..., 3:4], 1e-6)
        yield np.clip(np.rint(mixed*255), 0, 255).astype(np.uint8)


def main():
    report = {'schema': 1, 'anchors': 'XABCDEFGH', 'steps': STEPS,
              'columns': COLS, 'shapesPerActor': 297, 'actors': {}}
    for actor, (w, h, source) in ACTORS.items():
        im = np.array(Image.open(OUT/source).convert('RGBA'))
        poses = [im[(i//3)*h:(i//3+1)*h, (i%3)*w:(i%3+1)*w].copy()
                 for i in range(9)]
        tiles = []
        for a in range(9):
            for b in range(9):
                if a != b:
                    tiles.extend(warp_pair(poses[a], poses[b]))
        sheet = Image.new('RGBA', (COLS*w, ((len(tiles)+COLS-1)//COLS)*h))
        for i, tile in enumerate(tiles):
            sheet.paste(Image.fromarray(tile), ((i % COLS)*w, (i//COLS)*h))
        target = OUT/f'{actor}-transitions.webp'
        sheet.save(target, 'WEBP', quality=88, method=6)
        report['actors'][actor] = {'tileWidth': w, 'tileHeight': h,
            'transitionShapes': len(tiles), 'bytes': target.stat().st_size,
            'sourceSha256': hashlib.sha256((OUT/source).read_bytes()).hexdigest()}
        print(actor, len(tiles)+9, 'shapes,', target.stat().st_size, 'bytes')
    (OUT/'transitions.json').write_text(json.dumps(report, indent=2)+'\n')


if __name__ == '__main__':
    main()
