# 기존 친구(lily·noah)와 새 중국어 교사(mei)의 «카드 안 얼굴 크기» 대조
from PIL import Image
import numpy as np
P = "cloudflare-deploy/public/img/"
names = ["lily-closed.webp", "noah-closed.webp", "mei-closed.webp"]
sheet = Image.new("RGB", (3 * 300 + 20, 375), (225, 228, 232))
for i, n in enumerate(names):
    im = Image.open(P + n).convert("RGBA")
    a = np.asarray(im.getchannel("A"))
    ys, xs = np.where(a > 16)
    print(n, im.size, "alpha bbox", (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
          "머리 꼭대기 y=%.3f" % (ys.min() / im.height),
          "채움 %.1f%%" % (float((a > 16).mean()) * 100))
    t = im.resize((300, 375), Image.LANCZOS)
    sheet.paste(Image.alpha_composite(Image.new("RGBA", t.size, (225, 228, 232, 255)), t).convert("RGB"), (i * 310, 0))
sheet.save("tmp-preview/mei-vs.jpg", quality=90)
print("ok")
