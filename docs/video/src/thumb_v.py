"""세로 숏폼 썸네일 (1080×1920). Mr.Mango 를 가장 크게 — 작게 줄여도 캐릭터는 알아본다."""
import numpy as np, os
from PIL import Image, ImageDraw, ImageFilter
import render as R
from thumb import shadow_text, paste_shot, fit

TW, TH = 1080, 1920
GOLD, WHITE = R.GOLD, R.WHITE

def vbg(name, mul=0.62):
    im = R.load(name)
    s = max(TW / im.width, TH / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    x = (im.width - TW) // 2; y = (im.height - TH) // 2
    return Image.fromarray((np.asarray(im.crop((x, y, x + TW, y + TH)), np.float32) * mul).astype(np.uint8))

def mascot(im, w, cx, cy):
    m = Image.open(os.path.join(R.IMG, "mascot.png")).convert("RGBA")
    h = round(m.height * w / m.width)
    m = m.resize((w, h), Image.LANCZOS)
    gl = Image.new("RGBA", im.size, (0, 0, 0, 0))
    gl.paste(Image.new("RGBA", (w, h), (251, 191, 36, 80)), (int(cx - w / 2), int(cy - h / 2)), m)
    im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(40)))
    im.alpha_composite(m, (int(cx - w / 2), int(cy - h / 2)))

def build():
    im = vbg("d_bg_cover.jpg", 0.60).convert("RGBA")
    # 아래쪽 게임 캡처 3장 — 배경 질감
    for i, nm in enumerate(["g01_spacemonster.jpg", "g07_tank.jpg", "g17_suspect.jpg"]):
        paste_shot(im, nm, (30 + i * 344, 1592, 330, 206), 8)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle([0, 1540, TW, TH], fill=(9, 13, 27, 90))
    im.alpha_composite(ov)

    d0 = ImageDraw.Draw(im)
    from thumb import KICKER
    kf = R.font("b", 40)
    kw = kf.getbbox(KICKER)[2] + 64
    d0.rounded_rectangle([TW // 2 - kw // 2, 110, TW // 2 + kw // 2, 110 + 68], 34,
                         outline=(251, 191, 36, 235), width=3)
    shadow_text(im, (TW // 2, 145), KICKER, 40, GOLD, kind="b", anchor="mm", blur=8)

    mascot(im, 600, TW // 2, 620)

    M = TW - 80
    s1 = fit("의지를 이깁니다", "xb", 150, M)
    shadow_text(im, (TW // 2, 930), "재미가", s1, WHITE, anchor="ma", blur=14)
    shadow_text(im, (TW // 2, 930 + s1 + 26), "의지를 이깁니다", s1, GOLD, anchor="ma", blur=14)
    s2 = fit("A.I 학습 콘텐츠 14가지 · 학습 게임 21종", "b", 46, M)
    shadow_text(im, (TW // 2, 1300), "A.I 학습 콘텐츠 14가지 · 학습 게임 21종", s2,
                (224, 232, 246), kind="b", anchor="ma", blur=10)

    d = ImageDraw.Draw(im)
    d.rounded_rectangle([TW // 2 - 190, 1390, TW // 2 + 190, 1390 + 92], 12, fill=(251, 191, 36, 255))
    shadow_text(im, (TW // 2, 1436), "MANGO AI", 44, (58, 42, 0), anchor="mm", blur=0)
    return im.convert("RGB")

if __name__ == "__main__":
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "thumb_shorts_세로.png")
    build().save(p); print("wrote", p)
