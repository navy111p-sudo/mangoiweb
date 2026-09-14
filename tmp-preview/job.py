# 중국어 교사 아바타 — 「같은 얼굴에서 입만 다른 3장」 만들기
#  ⚠️ 생성 모델은 «입만» 바꿔 주지 않는다(실측: 얼굴 크기·위치가 장마다 다름).
#     그래서 한 장(closed)을 기준으로 나머지를 «정렬» 한 뒤, 달라진 곳(=입)만 오려 얹는다.
#     ⟹ 입 밖은 세 장이 픽셀 단위로 같아진다 = lily·noah 와 같은 성질.
import urllib.request, io, os, subprocess
import numpy as np
from PIL import Image, ImageFilter

B = "https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/"
U = {"closed": B + "hf_20260914_071255_34dd51cf-050e-4b17-8665-56fc1f422042.png",
     "mid":    B + "hf_20260914_071256_879173e1-b851-47b7-9bbd-933c3f7853e9.png",
     "wide":   B + "hf_20260914_071257_cf92036d-b09d-41e6-a288-b413f7f8ce71.png"}
ORDER = ["closed", "mid", "wide"]
src = {}
for k in ORDER:
    src[k] = Image.open(io.BytesIO(urllib.request.urlopen(U[k], timeout=180).read())).convert("RGBA")
    print("DL", k, src[k].size)
W, H = src["closed"].size

def gray(im):
    w = Image.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, 255)), im)
    return np.asarray(w.convert("L"), dtype=np.float32)

# SSD 에서 «입·턱» 은 뺀다 — 거기가 바뀌는 곳이라 정렬 기준이 될 수 없다
mask = np.ones((H, W), dtype=bool)
mask[int(0.40 * H):int(0.64 * H), :] = False
gb_full = gray(src["closed"])

def best_fit(vk, scales, drange, step, div, seed=(1.0, 0, 0)):
    """div 배율로 줄여서 (scale,dx,dy) 를 찾는다. 좌표는 «원본» 기준으로 돌려준다."""
    h, w = H // div, W // div
    base = np.asarray(Image.fromarray(gb_full).resize((w, h), Image.BILINEAR), dtype=np.float32)
    m = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)) > 127
    best = (1e18, seed)
    for s in scales:
        sw, sh = int(round(w * s)), int(round(h * s))
        v = np.asarray(Image.fromarray(gray(src[vk])).resize((sw, sh), Image.BILINEAR), dtype=np.float32)
        # 확대/축소로 생긴 여백은 흰색으로 채워 같은 크기 캔버스에 중앙 정렬
        pad = np.full((h + 2 * abs(drange) + sh, w + 2 * abs(drange) + sw), 255.0, dtype=np.float32)
        oy, ox = abs(drange) + (h - sh) // 2, abs(drange) + (w - sw) // 2
        pad[oy:oy + sh, ox:ox + sw] = v
        for dy in range(-drange, drange + 1, step):
            for dx in range(-drange, drange + 1, step):
                cut = pad[abs(drange) + dy:abs(drange) + dy + h, abs(drange) + dx:abs(drange) + dx + w]
                d = (cut - base)[m]
                e = float(np.dot(d, d)) / d.size
                if e < best[0]:
                    best = (e, (s, dx * div, dy * div))
    return best

warped, info = {"closed": src["closed"]}, {}
for k in ["mid", "wide"]:
    e1, (s1, dx1, dy1) = best_fit(k, [0.90 + 0.01 * i for i in range(21)], 20, 1, 4)
    print("COARSE", k, round(e1, 1), round(s1, 3), dx1, dy1)
    fine = [s1 + 0.0025 * i for i in range(-4, 5)]
    # 미세조정: 원본 해상도에서 ±6px
    h, w = H, W
    base = gb_full
    best = (1e18, (s1, dx1, dy1))
    for s in fine:
        sw, sh = int(round(w * s)), int(round(h * s))
        v = np.asarray(Image.fromarray(gray(src[k])).resize((sw, sh), Image.BILINEAR), dtype=np.float32)
        R = 8 + max(abs(dx1), abs(dy1))
        pad = np.full((h + 2 * R + sh, w + 2 * R + sw), 255.0, dtype=np.float32)
        oy, ox = R + (h - sh) // 2, R + (w - sw) // 2
        pad[oy:oy + sh, ox:ox + sw] = v
        for dy in range(dy1 - 6, dy1 + 7):
            for dx in range(dx1 - 6, dx1 + 7):
                cut = pad[R + dy:R + dy + h, R + dx:R + dx + w]
                d = (cut - base)[mask]
                e = float(np.dot(d, d)) / d.size
                if e < best[0]:
                    best = (e, (s, dx, dy))
    e2, (s, dx, dy) = best
    print("FINE  ", k, round(e2, 1), round(s, 4), dx, dy)
    info[k] = (round(s, 4), dx, dy, round(e2, 1))
    sw, sh = int(round(W * s)), int(round(H * s))
    v = src[k].resize((sw, sh), Image.LANCZOS)
    canv = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    canv.paste(v, ((W - sw) // 2 + dx, (H - sh) // 2 + dy))
    warped[k] = canv

# ── 입 «부위» 찾기 — 가장 센 변화(입 안: 어두운 구멍 + 이)가 기준.
#    ⚠️ 그냥 «달라진 곳» 으로 잡으면 볼·눈썹까지 딸려 와 얼굴 전체를 갈아 끼우게 된다(실측).
base_g = gb_full
dw = np.abs(gray(warped["wide"]) - base_g)
dw = np.asarray(Image.fromarray(dw.astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)), dtype=np.float32)
sel = np.zeros_like(dw, dtype=bool)
sel[int(0.38 * H):int(0.72 * H), int(0.28 * W):int(0.72 * W)] = True
cand = dw * sel
thr = max(45.0, float(np.percentile(cand[sel], 99.5)) * 0.55)
ys, xs = np.where(cand > thr)
print("MOUTHCORE thr=%.1f px=%d" % (thr, len(xs)))
assert len(xs) > 200, "입을 못 찾았습니다"
x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
print("CORE", (x0, y0, x1, y1))
w0, h0 = x1 - x0, y1 - y0
# 입만 오려 얹으면 «턱은 닫힌 채 입만 벌어진» 얼굴이 된다 → 아래쪽(턱)을 넉넉히 포함
MR = (max(0, x0 - int(w0 * 0.35)), max(0, y0 - int(h0 * 0.55)),
      min(W, x1 + int(w0 * 0.35)), min(H, y1 + int(h0 * 0.95)))
MR = tuple(int(v) for v in MR)
print("MOUTH REGION", MR, "of", (W, H))

m = Image.new("L", (W, H), 0)
from PIL import ImageDraw
ImageDraw.Draw(m).ellipse(MR, fill=255)
m = m.filter(ImageFilter.GaussianBlur(int(max(8, (MR[2] - MR[0]) // 10))))

out = {}
os.makedirs("cloudflare-deploy/public/img", exist_ok=True)
for k in ORDER:
    im = src["closed"].copy() if k != "closed" else src["closed"].copy()
    if k != "closed":
        im = Image.composite(warped[k], im, m)
        im.putalpha(src["closed"].getchannel("A"))     # 알파는 언제나 기준 장의 것
    out[k] = im

# ── 4:5 로 잘라 640x800
def bbox(im, thr=16):
    return im.getchannel("A").point(lambda v: 255 if v > thr else 0).getbbox()
bb = bbox(out["closed"])
print("BBOX", {k: bbox(out[k]) for k in ORDER})
L, T, R, Bo = bb
T = max(0, T - int((Bo - T) * 0.05))
w, h = R - L, Bo - T
if w / h > 0.8:
    nh = int(round(w / 0.8)); d = nh - h; T -= d // 2; Bo += d - d // 2
else:
    nw = int(round(h * 0.8)); d = nw - w; L -= d // 2; R += d - d // 2
print("FRAME", (L, T, R, Bo), (R - L, Bo - T))
fin = {}
for k in ORDER:
    c = Image.new("RGBA", (R - L, Bo - T), (0, 0, 0, 0))
    c.paste(out[k], (-L, -T))
    c = c.resize((640, 800), Image.LANCZOS)
    fin[k] = c
    p = "/tmp/mei-%s.png" % k
    c.save(p)
    dst = "cloudflare-deploy/public/img/mei-%s.webp" % k
    subprocess.run(["cwebp", "-quiet", "-q", "86", "-alpha_q", "100", "-metadata", "none", p, "-o", dst], check=True)
    print("WEBP", dst, os.path.getsize(dst))

# ── 「입만 움직이는가」 를 숫자로 (mango-avatar.js v8 의 방식)
def diffstat(a, b):
    A = np.asarray(Image.alpha_composite(Image.new("RGBA", a.size, (255,) * 4), a).convert("L"), dtype=np.float32)
    Bb = np.asarray(Image.alpha_composite(Image.new("RGBA", b.size, (255,) * 4), b).convert("L"), dtype=np.float32)
    d = np.abs(A - Bb)
    ch = (d > 24)
    rows = [round(float(ch[i * 80:(i + 1) * 80].mean()) * 100, 1) for i in range(10)]
    return round(float(d.mean()), 2), round(float(ch.mean()) * 100, 2), rows
for p in [("closed", "mid"), ("closed", "wide"), ("mid", "wide")]:
    print("DIFF %s-%s mean=%s changed=%s%% rows=%s" % ((p[0], p[1]) + diffstat(fin[p[0]], fin[p[1]])))
print("ALIGN", info)

sheet = Image.new("RGB", (3 * 320 + 20, 400), (225, 228, 232))
for i, k in enumerate(ORDER):
    t = fin[k].resize((320, 400), Image.LANCZOS)
    sheet.paste(Image.alpha_composite(Image.new("RGBA", t.size, (225, 228, 232, 255)), t).convert("RGB"), (i * 330, 0))
# 입 부위 마스크가 «정말 입만» 인지 눈으로 볼 수 있게 기준 장에 테두리를 그린다
dbg = Image.alpha_composite(Image.new("RGBA", src["closed"].size, (225, 228, 232, 255)), src["closed"]).convert("RGB")
ImageDraw.Draw(dbg).ellipse(MR, outline=(255, 0, 0), width=5)
dbg.thumbnail((420, 420)); dbg.save("tmp-preview/mei-mask.jpg", quality=90)
sheet.save("tmp-preview/mei-sheet.jpg", quality=90)
# 입 부근 확대 — 좌표를 손으로 적지 않고 위에서 찾은 MR 을 그대로 쓴다
sx, sy = 640 / (R - L), 800 / (Bo - T)
mz = (int((MR[0] - L) * sx) - 30, int((MR[1] - T) * sy) - 30, int((MR[2] - L) * sx) + 30, int((MR[3] - T) * sy) + 30)
mo = Image.new("RGB", (3 * 300 + 20, 300), (255, 255, 255))
for i, k in enumerate(ORDER):
    c = fin[k].crop(mz)
    c = c.resize((300, max(1, int(300 * c.height / c.width))), Image.LANCZOS)
    mo.paste(Image.alpha_composite(Image.new("RGBA", c.size, (255,) * 4), c).convert("RGB"), (i * 310, 20))
mo.save("tmp-preview/mei-mouths.jpg", quality=92)
print("preview saved", mz)
