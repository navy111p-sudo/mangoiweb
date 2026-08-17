"""망고아이 2분 필름 썸네일 3종 (1280×720).
작게 줄여도 읽히는지가 전부라, 글자는 크게·자막은 짧게."""
import numpy as np, os
from PIL import Image, ImageDraw, ImageFilter
import render as R

TW, TH = 1280, 720
OUT = os.path.dirname(os.path.abspath(__file__))

GOLD, WHITE, SKY = R.GOLD, R.WHITE, R.SKY
MUT = (150, 164, 196)
KICKER = "A.I 화상영어"


def base(bgname="d_bg_cover.jpg", dark=0.55):
    im = R.load(bgname).resize((TW, TH), Image.LANCZOS)
    return Image.fromarray((np.asarray(im, np.float32) * dark).astype(np.uint8))


def shadow_text(im, xy, text, size, color, kind="xb", anchor="la", blur=9, sh=(0, 0, 0)):
    """작은 크기에서도 배경과 안 섞이도록 글자 뒤에 그림자를 깐다."""
    f = R.font(kind, size)
    lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.text(xy, text, font=f, fill=sh + (215,), anchor=anchor)
    lay = lay.filter(ImageFilter.GaussianBlur(blur))
    im.alpha_composite(lay)
    d = ImageDraw.Draw(im)
    d.text(xy, text, font=f, fill=color + (255,), anchor=anchor)


def fit(text, kind, size, maxw):
    """maxw 안에 들어올 때까지 글자 크기를 줄인다. 썸네일은 잘리면 끝이라."""
    while size > 20:
        f = R.font(kind, size)
        if f.getbbox(text)[2] <= maxw: break
        size -= 2
    return size


def paste_shot(im, name, box, radius=10):
    x, y, w, h = box
    src = R.load(name)
    s = min(src.width / w, src.height / h)
    cw, ch = int(w * s), int(h * s)
    c = src.crop(((src.width - cw) // 2, 0, (src.width - cw) // 2 + cw, min(src.height, ch)))
    c = R.lift(c.resize((w, h), Image.LANCZOS), name).convert("RGBA")
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=255)
    c.putalpha(m)
    im.alpha_composite(c, (x, y))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([x, y, x + w - 1, y + h - 1], radius, outline=(96, 114, 168, 210), width=2)


def mascot(im, w, cx, cy):
    m = Image.open(os.path.join(R.IMG, "mascot.png")).convert("RGBA")
    h = round(m.height * w / m.width)
    m = m.resize((w, h), Image.LANCZOS)
    gl = Image.new("RGBA", im.size, (0, 0, 0, 0))
    gl.paste(Image.new("RGBA", (w, h), (251, 191, 36, 70)), (int(cx - w / 2), int(cy - h / 2)), m)
    im.alpha_composite(gl.filter(ImageFilter.GaussianBlur(26)))
    im.alpha_composite(m, (int(cx - w / 2), int(cy - h / 2)))


# ── A. 카피형 — 캠페인 문구를 전면에 ──────────────────────────
def thumb_a():
    im = base("d_bg_cover.jpg", 0.62).convert("RGBA")
    for i, nm in enumerate(["speech.jpg", "g01_spacemonster.jpg", "aifriend.jpg", "g07_tank.jpg"]):
        paste_shot(im, nm, (36 + i * 306, 512, 286, 172), 8)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle([0, 470, TW, 720], fill=(9, 13, 27, 120))
    im.alpha_composite(ov)
    mascot(im, 396, 250, 246)
    X, MAXW = 500, 1280 - 500 - 36
    d = ImageDraw.Draw(im)
    kf = R.font("b", 26)
    kw = kf.getbbox(KICKER)[2] + 40
    d.rounded_rectangle([X, 30, X + kw, 30 + 44], 22, outline=(251, 191, 36, 235), width=2)
    shadow_text(im, (X + kw // 2, 53), KICKER, 26, GOLD, kind="b", anchor="mm", blur=6)
    s1 = fit("의지를 이깁니다", "xb", 110, MAXW)
    shadow_text(im, (X, 96), "재미가", s1, WHITE)
    shadow_text(im, (X, 96 + s1 + 16), "의지를 이깁니다", s1, GOLD)
    s2 = fit("A.I 학습 콘텐츠 14가지  ·  학습 게임 21종", "b", 38, MAXW)
    shadow_text(im, (X + 4, 352), "A.I 학습 콘텐츠 14가지  ·  학습 게임 21종", s2, (222, 231, 245), kind="b", blur=7)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([X, 420, X + 218, 420 + 52], 8, fill=(251, 191, 36, 255))
    shadow_text(im, (X + 109, 446), "MANGO AI", 28, (58, 42, 0), kind="xb", anchor="mm", blur=0)
    return im.convert("RGB")


# ── B. 문제제기형 — 숫자 하나로 붙잡기 ────────────────────────
def thumb_b():
    im = base("d_bg_cover.jpg", 0.5).convert("RGBA")
    fld = Image.new("RGB", (TW, TH), (0, 0, 0))
    a = np.asarray(fld).copy()
    dark = np.array([84, 100, 154], np.uint8)
    cols, rows, pitch = 240, 62, 4
    fx, fy = (TW - cols * pitch) // 2, 470
    col = np.repeat(dark[None, :], rows * cols, 0).reshape(rows, cols, 3)
    col[24:34, 112:132] = np.array(GOLD, np.uint8)
    tile = np.zeros((rows * pitch, cols * pitch, 3), np.uint8)
    for dy in range(3):
        for dx in range(3):
            tile[dy + 1::pitch, dx + 1::pitch] = col
    arr = np.asarray(im.convert("RGB")).copy()
    reg = arr[fy:fy + rows * pitch, fx:fx + cols * pitch]
    reg[:] = (reg.astype(np.float32) * 0.2).astype(np.uint8)
    np.maximum(reg, tile, out=reg)
    im = Image.fromarray(arr).convert("RGBA")
    shadow_text(im, (TW // 2, 56), "한 달 43,200분 중", 44, (198, 210, 232), kind="b", anchor="ma", blur=8)
    shadow_text(im, (TW // 2, 108), "영어를 쓰는 시간", 72, WHITE, anchor="ma")
    shadow_text(im, (TW // 2, 200), "0.5%", 158, GOLD, anchor="ma")
    mascot(im, 190, 1116, 148)
    shadow_text(im, (TW // 2, 396), "나머지 시간은 망고아이가 채웁니다", 38, (226, 232, 246), kind="b", anchor="ma", blur=7)
    return im.convert("RGB")


# ── C. 게임형 — 21종을 벽으로 ─────────────────────────────────
def thumb_c():
    im = base("d_bg_feature.jpg", 0.5).convert("RGBA")
    g = R.G21
    for i in range(14):
        paste_shot(im, g[i], (18 + (i % 7) * 180, 26 + (i // 7) * 116, 168, 106), 6)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle([0, 246, TW, 720], fill=(9, 13, 27, 178))
    im.alpha_composite(ov)
    for i in range(7):
        paste_shot(im, g[14 + i], (18 + i * 180, 592, 168, 106), 6)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([44, 274, 44 + 162, 274 + 58], 10, fill=(251, 191, 36, 255))
    shadow_text(im, (125, 303), "21종", 38, (58, 42, 0), anchor="mm", blur=0)
    shadow_text(im, (228, 276), "학습 게임", 54, WHITE)
    sz = fit("영어로 말해야", "xb", 88, 900)
    shadow_text(im, (44, 362), "영어로 말해야", sz, WHITE)
    shadow_text(im, (44, 362 + sz + 14), "문이 열립니다", sz, GOLD)
    mascot(im, 250, 1105, 404)
    return im.convert("RGB")


if __name__ == "__main__":
    for nm, fn in [("thumb_a_카피", thumb_a), ("thumb_b_문제제기", thumb_b), ("thumb_c_게임", thumb_c)]:
        p = os.path.join(OUT, nm + ".png")
        fn().save(p)
        print("wrote", p)
