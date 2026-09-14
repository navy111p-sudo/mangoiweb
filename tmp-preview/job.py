# 龙老师(룽 선생님) 입모양 3장 — 메이 때와 «똑같은» 절차(260914_중국어교사_아바타_메이.md §8).
import urllib.request, io, os, subprocess
from PIL import Image, ImageChops, ImageStat

B = "https://d8j0ntlcm91z4.cloudfront.net/user_3GD1yS6zlj6afu2oFQqivYqvn7k/"
NAME = "long"
U = {
 "closed": B + "hf_20260914_122457_dbbd888d-b2f8-43c2-bb0f-9eb128869343.png",
 "mid":    B + "hf_20260914_122459_b15ba8a7-d652-47bc-9071-b0683dfc2316.png",
 "wide":   B + "hf_20260914_122502_9ef77315-5a18-427b-aa0c-81a5d24f129c.png",
}
# 고르지 않은 두 번째 얼굴 후보(배경 있음) — 미리보기에만 씁니다.
ALT = B + "hf_20260914_122306_77c48965-d539-4948-96b6-49aef257d27b.png"
ORDER = ["closed", "mid", "wide"]
ims = {}
for k in ORDER:
    raw = urllib.request.urlopen(U[k], timeout=180).read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    ims[k] = im
    print("DL", k, im.size, len(raw))

# ── 세 장의 알파 경계 «합집합» 으로 같은 좌표계를 잡는다 (mei·lily·noah 와 같은 방식)
def bbox(im, thr=16):
    a = im.getchannel("A").point(lambda v: 255 if v > thr else 0)
    return a.getbbox()
bbs = {k: bbox(ims[k]) for k in ORDER}
for k in ORDER:
    print("BBOX", k, bbs[k])
L = min(b[0] for b in bbs.values()); T = min(b[1] for b in bbs.values())
R = max(b[2] for b in bbs.values()); Bo = max(b[3] for b in bbs.values())
print("UNION", (L, T, R, Bo))

pad_top = int((Bo - T) * 0.05)          # 카드에서 정수리가 닿지 않게
T = max(0, T - pad_top)
w, h = R - L, Bo - T
if w / h > 0.8:                          # 4:5 로 맞추기
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
    p = "/tmp/%s-%s.png" % (NAME, k)
    canvas.save(p)
    dst = "cloudflare-deploy/public/img/%s-%s.webp" % (NAME, k)
    subprocess.run(["cwebp", "-quiet", "-q", "86", "-alpha_q", "100", "-metadata", "none", p, "-o", dst], check=True)
    print("WEBP", dst, os.path.getsize(dst), "bytes")

# ── «입만 움직이는가» 를 숫자로 (mango-avatar.js v8 이 잰 것과 같은 방식)
#    메이 기준 0.33~1.32%, 입 부근 3칸만. Emma 사고는 11.4~18.3%, 10칸 전부.
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
sheet.save("tmp-preview/%s-sheet.jpg" % NAME, quality=90)
mouths = Image.new("RGB", (3 * 260 + 20, 260), (255, 255, 255))
for i, k in enumerate(ORDER):
    c = out[k].crop((220, 430, 420, 560)).resize((260, 169), Image.LANCZOS)
    mouths.paste(Image.alpha_composite(Image.new("RGBA", c.size, (255, 255, 255, 255)), c).convert("RGB"), (i * 270, 40))
mouths.save("tmp-preview/%s-mouths.jpg" % NAME, quality=92)

# 두 번째 얼굴 후보도 함께 — 「다른 얼굴이 낫다」 하실 때 바로 쓰려고.
try:
    raw = urllib.request.urlopen(ALT, timeout=180).read()
    a = Image.open(io.BytesIO(raw)).convert("RGB")
    a.thumbnail((400, 500))
    a.save("tmp-preview/%s-alt-face.jpg" % NAME, quality=90)
    print("ALT saved", a.size)
except Exception as e:
    print("ALT failed", e)
print("preview saved")
