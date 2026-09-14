import urllib.request, io, os, subprocess
from PIL import Image, ImageChops, ImageStat

B = "https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/"
U = {
 "closed": B + "hf_20260914_071255_34dd51cf-050e-4b17-8665-56fc1f422042.png",
 "mid":    B + "hf_20260914_071256_879173e1-b851-47b7-9bbd-933c3f7853e9.png",
 "wide":   B + "hf_20260914_071257_cf92036d-b09d-41e6-a288-b413f7f8ce71.png",
}
ORDER = ["closed", "mid", "wide"]
ims = {}
for k in ORDER:
    raw = urllib.request.urlopen(U[k], timeout=180).read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    ims[k] = im
    print("DL", k, im.size, len(raw))

# ── 세 장의 알파 경계 «합집합» 으로 같은 좌표계를 잡는다 (lily·noah 와 같은 방식)
def bbox(im, thr=16):
    a = im.getchannel("A").point(lambda v: 255 if v > thr else 0)
    return a.getbbox()
bbs = {k: bbox(ims[k]) for k in ORDER}
for k in ORDER:
    print("BBOX", k, bbs[k])
L = min(b[0] for b in bbs.values()); T = min(b[1] for b in bbs.values())
R = max(b[2] for b in bbs.values()); Bo = max(b[3] for b in bbs.values())
print("UNION", (L, T, R, Bo))

W0, H0 = ims["closed"].size
# 머리 위 여백을 조금 — 카드에서 정수리가 닿지 않게
pad_top = int((Bo - T) * 0.05)
T = max(0, T - pad_top)
w, h = R - L, Bo - T
# 4:5 로 맞추기 (모자라는 쪽을 늘림 · 원본 밖은 투명으로 채움)
if w / h > 0.8:
    nh = int(round(w / 0.8)); dy = nh - h; T -= dy // 2; Bo += dy - dy // 2
else:
    nw = int(round(h * 0.8)); dx = nw - w; L -= dx // 2; R += dx - dx // 2
print("FRAME", (L, T, R, Bo), "size", (R - L, Bo - T), "ratio", round((R - L) / (Bo - T), 4))

os.makedirs("cloudflare-deploy/public/img", exist_ok=True)
out = {}
for k in ORDER:
    canvas = Image.new("RGBA", (R - L, Bo - T), (0, 0, 0, 0))
    canvas.paste(ims[k], (-L, -T))
    canvas = canvas.resize((640, 800), Image.LANCZOS)
    out[k] = canvas
    p = "/tmp/mei-%s.png" % k
    canvas.save(p)
    dst = "cloudflare-deploy/public/img/mei-%s.webp" % ("closed" if k == "closed" else ("mid" if k == "mid" else "wide"))
    subprocess.run(["cwebp", "-quiet", "-q", "86", "-alpha_q", "100", "-metadata", "none", p, "-o", dst], check=True)
    print("WEBP", dst, os.path.getsize(dst), "bytes")

# ── «입만 움직이는가» 를 숫자로 (mango-avatar.js v8 이 잰 것과 같은 방식)
def diff(a, b):
    A = Image.alpha_composite(Image.new("RGBA", a.size, (255, 255, 255, 255)), a).convert("L")
    Bb = Image.alpha_composite(Image.new("RGBA", b.size, (255, 255, 255, 255)), b).convert("L")
    d = ImageChops.difference(A, Bb)
    mean = ImageStat.Stat(d).mean[0]
    px = d.point(lambda v: 255 if v > 24 else 0)
    changed = ImageStat.Stat(px).mean[0] / 255 * 100
    rows = []
    for i in range(10):
        band = px.crop((0, i * 80, 640, (i + 1) * 80))
        rows.append(round(ImageStat.Stat(band).mean[0] / 255 * 100, 1))
    return round(mean, 2), round(changed, 2), rows
for pair in [("closed", "mid"), ("closed", "wide"), ("mid", "wide")]:
    m, c, rows = diff(out[pair[0]], out[pair[1]])
    print("DIFF %s-%s mean=%s changed=%s%% rows=%s" % (pair[0], pair[1], m, c, rows))

# ── 미리보기 (회색 바탕에 얹어 알파 경계를 눈으로 볼 수 있게)
sheet = Image.new("RGB", (3 * 320 + 20, 400), (225, 228, 232))
for i, k in enumerate(ORDER):
    t = out[k].resize((320, 400), Image.LANCZOS)
    sheet.paste(Image.alpha_composite(Image.new("RGBA", t.size, (225, 228, 232, 255)), t).convert("RGB"), (i * 330, 0))
sheet.save("tmp-preview/mei-sheet.jpg", quality=90)
mouths = Image.new("RGB", (3 * 260 + 20, 260), (255, 255, 255))
for i, k in enumerate(ORDER):
    c = out[k].crop((220, 430, 420, 560)).resize((260, 169), Image.LANCZOS)
    mouths.paste(Image.alpha_composite(Image.new("RGBA", c.size, (255, 255, 255, 255)), c).convert("RGB"), (i * 270, 40))
mouths.save("tmp-preview/mei-mouths.jpg", quality=92)
print("preview saved")
