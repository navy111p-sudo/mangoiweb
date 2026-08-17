"""망고아이 2분 브랜드 필름 — 무음 가편 렌더러.
컷 8개, 1920x1080 / 30fps / 120.0초. 프레임을 ffmpeg 로 직접 파이프."""
import numpy as np, subprocess, sys, os, math
from PIL import Image, ImageDraw, ImageFont

W, H, FPS = 1920, 1080, 30
DUR = 120.0
NF = int(DUR * FPS)
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "deck_img")
FDIR = "/usr/share/fonts/truetype/nanum/"

GOLD = (251, 191, 36); SKY = (56, 189, 248); PUR = (192, 132, 252); GRN = (52, 211, 153)
WHITE = (255, 255, 255); TXT = (203, 213, 225); MUT = (148, 163, 184)
LINE = (42, 53, 87); DIM = (58, 68, 100)

_f = {}
def font(kind, size):
    k = (kind, size)
    if k not in _f:
        p = {"xb": "NanumGothicExtraBold.ttf", "b": "NanumGothicBold.ttf", "r": "NanumGothic.ttf"}[kind]
        _f[k] = ImageFont.truetype(FDIR + p, size)
    return _f[k]

# ── 이미지 캐시 ────────────────────────────────────────────────
_im = {}
def load(name):
    if name not in _im:
        _im[name] = Image.open(os.path.join(IMG, name)).convert("RGB")
    return _im[name]

import math as _m
from PIL import ImageStat as _IS
_lift = {}
def lift(im, name):
    """평균 밝기가 낮은 캡처만 감마로 들어 올린다. 하이라이트는 안 날아감."""
    if name not in _lift:
        mn = _IS.Stat(im.convert("L")).mean[0]
        if mn >= 58: _lift[name] = None
        else:
            g = max(0.42, min(1.0, _m.log(max(mn, 6) / 255.0) / _m.log(64 / 255.0)))
            _lift[name] = [min(255, int(255 * (i / 255.0) ** g)) for i in range(256)] * 3
    lut = _lift[name]
    return im if lut is None else im.point(lut)

_cards = {}
def card(name, w, border=True):
    """캡처를 폭 w 로 맞춘 카드(테두리 포함) numpy 반환."""
    k = (name, w, border)
    if k in _cards: return _cards[k]
    im = load(name)
    h = max(1, round(im.height * w / im.width))
    im = lift(im.resize((w, h), Image.LANCZOS), name)
    if border:
        pad = 3
        bg = Image.new("RGB", (w + pad * 2, h + pad * 2), (36, 46, 76))
        bg.paste(im, (pad, pad))
        d = ImageDraw.Draw(bg)
        d.rectangle([0, 0, bg.width - 1, bg.height - 1], outline=(70, 86, 132), width=1)
        im = bg
    a = np.asarray(im, dtype=np.uint8)
    if len(_cards) < 220: _cards[k] = a
    return a

def card_fit(name, maxw, maxh, border=True):
    """maxw × maxh 박스 안에 온전히 들어가도록 폭을 계산해 카드를 만든다."""
    im = load(name)
    w = min(maxw, int(round(maxh * im.width / im.height)))
    return card(name, w, border)

# ── 합성 유틸 ─────────────────────────────────────────────────
def blit(frame, arr, x, y, alpha=1.0):
    if alpha <= 0.003: return
    h, w = arr.shape[:2]
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    src = arr[y0 - y:y1 - y, x0 - x:x1 - x]
    if alpha >= 0.997:
        frame[y0:y1, x0:x1] = src
    else:
        reg = frame[y0:y1, x0:x1]
        reg[:] = (reg.astype(np.float32) * (1 - alpha) + src.astype(np.float32) * alpha).astype(np.uint8)

class Ov:
    __slots__ = ("rgb", "a", "x", "y")
    def __init__(self, rgb, a, x, y): self.rgb, self.a, self.x, self.y = rgb, a, x, y

_ovc = {}
def text_ov(text, kind, size, color, cx=None, x=None, y=0, spacing=14, align="center", key=None):
    """텍스트를 RGBA 레이어로 한 번만 렌더해 캐시. cx 주면 가로 중앙정렬."""
    k = key or (text, kind, size, color, cx, x, y, align)
    if k in _ovc: return _ovc[k]
    fo = font(kind, size)
    tmp = Image.new("L", (4, 4))
    d0 = ImageDraw.Draw(tmp)
    bb = d0.multiline_textbbox((0, 0), text, font=fo, spacing=spacing, align=align)
    tw, th = bb[2] - bb[0] + 8, bb[3] - bb[1] + 12
    lay = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.multiline_text((4 - bb[0], 6 - bb[1]), text, font=fo, fill=color + (255,),
                     spacing=spacing, align=align)
    arr = np.asarray(lay, dtype=np.uint8)
    px = int(cx - tw / 2) if cx is not None else int(x)
    ov = Ov(arr[:, :, :3].copy(), (arr[:, :, 3].astype(np.float32) / 255.0)[:, :, None], px, int(y))
    _ovc[k] = ov
    return ov

def draw_ov(frame, ov, g=1.0):
    if g <= 0.003: return
    h, w = ov.a.shape[:2]
    x, y = ov.x, ov.y
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    a = ov.a[y0 - y:y1 - y, x0 - x:x1 - x] * g
    rgb = ov.rgb[y0 - y:y1 - y, x0 - x:x1 - x]
    reg = frame[y0:y1, x0:x1]
    reg[:] = (reg.astype(np.float32) * (1 - a) + rgb.astype(np.float32) * a).astype(np.uint8)

def rect(frame, x, y, w, h, color, alpha=1.0):
    x0, y0 = max(0, int(x)), max(0, int(y))
    x1, y1 = min(W, int(x + w)), min(H, int(y + h))
    if x1 <= x0 or y1 <= y0: return
    reg = frame[y0:y1, x0:x1]
    c = np.array(color, dtype=np.float32)
    if alpha >= 0.997: reg[:] = c.astype(np.uint8)
    else: reg[:] = (reg.astype(np.float32) * (1 - alpha) + c * alpha).astype(np.uint8)

def ease(x):  # smoothstep
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)
def eout(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3
def fade(t, a, b, d=0.45):
    """구간 [a,b] 안에서 d초 페이드인/아웃 게인."""
    if t < a or t > b: return 0.0
    return min(ease((t - a) / d), ease((b - t) / d), 1.0)

# ── 배경 ──────────────────────────────────────────────────────
BGC = np.asarray(load("d_bg_cover.jpg").resize((W, H), Image.LANCZOS), dtype=np.uint8)
BGT = np.asarray(load("d_bg_theory.jpg").resize((W, H), Image.LANCZOS), dtype=np.uint8)
BGL = np.asarray(load("d_bg_close.jpg").resize((W, H), Image.LANCZOS), dtype=np.uint8)
BGF = np.asarray(load("d_bg_feature.jpg").resize((W, H), Image.LANCZOS), dtype=np.uint8)
MASC = load("mascot.png")

_masc = {}
def mascot(w):
    if w not in _masc:
        im = Image.open(os.path.join(IMG, "mascot.png")).convert("RGBA")
        h = round(im.height * w / im.width)
        im = im.resize((w, h), Image.LANCZOS)
        a = np.asarray(im, dtype=np.uint8)
        _masc[w] = Ov(a[:, :, :3].copy(), (a[:, :, 3].astype(np.float32) / 255.0)[:, :, None], 0, 0)
    return _masc[w]

def put_mascot(frame, w, cx, cy, g=1.0):
    m = mascot(w)
    o = Ov(m.rgb, m.a, int(cx - m.rgb.shape[1] / 2), int(cy - m.rgb.shape[0] / 2))
    draw_ov(frame, o, g)

# ── 자막 (컷별 한 줄) ─────────────────────────────────────────
def caption(frame, text, g, y=902, color=WHITE, size=42):
    if g <= 0.003: return
    ov = text_ov(text, "b", size, color, cx=W // 2, y=y)
    pw = ov.rgb.shape[1] + 72; ph = ov.rgb.shape[0] + 26
    rect(frame, W // 2 - pw // 2, y - 13, pw, ph, (8, 12, 24), 0.60 * g)
    rect(frame, W // 2 - pw // 2, y - 13, 4, ph, GOLD, 0.90 * g)
    draw_ov(frame, ov, g)

# ── 점 필드 (컷2·3) ───────────────────────────────────────────
COLS, ROWS, PITCH = 360, 120, 4           # 360 × 120 = 43,200
FX, FY = (W - COLS * PITCH) // 2, 400      # 1440 × 480
LIT = np.zeros((ROWS, COLS), dtype=bool)
LIT[55:65, 172:188] = True                 # 16 × 10 = 160개
def dotfield(frame, lit_g, sweep=0.0, base_g=1.0):
    """lit_g: 200개 점의 금색 강도 / sweep: 0→1 전체가 금색으로 켜지는 진행률."""
    dark = np.array([88, 105, 162], dtype=np.float32)
    gold = np.array(GOLD, dtype=np.float32)
    col = np.repeat(dark[None, :], ROWS * COLS, 0).reshape(ROWS, COLS, 3)
    if lit_g > 0:
        col[LIT] = dark * (1 - lit_g) + gold * lit_g
    if sweep > 0:
        xs = np.linspace(0, 1, COLS)[None, :]
        ys = np.linspace(0, 1, ROWS)[:, None]
        prog = np.clip((sweep * 1.9 - (xs * 0.55 + ys * 0.45)) * 3.2, 0, 1)
        col = col * (1 - prog[:, :, None]) + gold[None, None, :] * prog[:, :, None]
    col = (col * base_g).astype(np.uint8)
    fh, fw = ROWS * PITCH, COLS * PITCH
    tile = np.zeros((fh, fw, 3), dtype=np.uint8)
    for dy in range(3):
        for dx in range(3):
            tile[dy + 1::PITCH, dx + 1::PITCH] = col
    reg = frame[FY:FY + fh, FX:FX + fw]
    reg[:] = (reg.astype(np.float32) * 0.22).astype(np.uint8)   # 필드 뒤를 눌러 준다
    np.maximum(reg, tile, out=reg)

# ══════════════════════════════════════════════════════════════
#  컷
# ══════════════════════════════════════════════════════════════
def c1(f, t):                     # 00:00–00:09  훅
    g = ease(t / 2.6)
    f[:] = (BGC.astype(np.float32) * (0.25 + 0.75 * g)).astype(np.uint8)
    put_mascot(f, 210, W // 2, 452 - 26 * eout(t / 2.2), ease((t - 0.8) / 1.6))
    draw_ov(f, text_ov("MANGO AI", "xb", 30, (110, 128, 170), cx=W // 2, y=596),
            ease((t - 1.6) / 1.4) * 0.9)
    caption(f, "재능이 없어서가 아닙니다", fade(t, 3.6, 9.0, 0.7))

def c2(f, t):                     # 00:09–00:24  문제
    f[:] = (BGC.astype(np.float32) * 0.55).astype(np.uint8)
    dotfield(f, lit_g=ease((t - 3.4) / 1.6), base_g=ease(t / 2.0))
    draw_ov(f, text_ov("한 달 43,200분", "b", 30, MUT, cx=W // 2, y=62), fade(t, 0.6, 15.0, 0.8))
    v = 0.4 * eout(min(max((t - 4.2) / 2.4, 0), 1))
    ov = text_ov(f"{v:.1f}%", "xb", 116, GOLD, cx=W // 2, y=110, key=("pct", round(v, 2)))
    draw_ov(f, ov, fade(t, 4.2, 15.0, 0.5))
    draw_ov(f, text_ov("영어를 쓰는 시간은 160분", "b", 32, TXT, cx=W // 2, y=254),
            fade(t, 5.6, 15.0, 0.6))
    caption(f, "한 달 중 영어를 쓰는 시간 0.4%", fade(t, 7.4, 15.0, 0.7))

def c3(f, t):                     # 00:24–00:38  해답
    f[:] = (BGC.astype(np.float32) * 0.55).astype(np.uint8)
    if t < 6.4:
        sw = ease((t - 0.3) / 4.0)
        dotfield(f, lit_g=1.0, sweep=sw, base_g=1.0 - 0.55 * ease((t - 4.6) / 1.6))
        draw_ov(f, text_ov("망고아이는 그 빈 시간을 채웁니다", "b", 40, WHITE, cx=W // 2, y=150),
                fade(t, 0.5, 6.2, 0.7))
    if t >= 4.6:
        u = ease((t - 4.6) / 1.6)
        f[:] = (f.astype(np.float32) * (1 - u) + BGC.astype(np.float32) * u).astype(np.uint8)
        put_mascot(f, 170, W // 2, 236, u)
        draw_ov(f, text_ov("MANGO AI", "xb", 76, WHITE, cx=W // 2, y=330), u)
        draw_ov(f, text_ov("A.I 학습 콘텐츠 14가지", "b", 34, GOLD, cx=W // 2, y=430), ease((t - 5.6) / 1.2))
        gal = ["speech.jpg", "aifriend.jpg", "aiwrite.jpg", "vocab.jpg", "microquiz.jpg", "judgment.jpg",
               "warmup.jpg", "games.jpg", "avatar.jpg", "streak.jpg", "leveltestai.jpg", "parent.jpg"]
        cw = 288
        for i, nm in enumerate(gal):
            a = ease((t - 6.6 - i * 0.16) / 0.7)
            if a <= 0: continue
            x = 84 + (i % 6) * (cw + 18); y = 520 + (i // 6) * 200
            blit(f, card(nm, cw), x, y + 14 * (1 - a), a)
    caption(f, "A.I 학습 콘텐츠 14가지", fade(t, 9.4, 14.0, 0.6))

C4 = [("speech.jpg", "A.I 음성코치", "발음을 듣고 바로 고쳐 줍니다", SKY),
      ("aifriend.jpg", "A.I 친구 대화", "밤이든 새벽이든 말을 받아 줍니다", PUR),
      ("aiwrite.jpg", "A.I 영작 첨삭", "쓴 문장을 그 자리에서 다듬어 줍니다", GRN),
      ("vocab.jpg", "단어장", "잊을 때쯤 다시 물어봅니다", GOLD)]
def c4(f, t):                     # 00:38–01:00  콘텐츠 넷
    f[:] = BGF
    i = min(3, int(t / 5.5)); lt = t - i * 5.5
    nm, ttl, sub, col = C4[i]
    z = 1.0 + 0.045 * ease(lt / 5.5)
    a = card_fit(nm, int(1400 * z), int(650 * z))
    blit(f, a, W / 2 - a.shape[1] / 2, 210 + (650 - a.shape[0]) / 2 - (a.shape[0] - 650) * 0.12,
         min(ease(lt / 0.45), ease((5.5 - lt) / 0.4)))
    g = min(ease((lt - 0.3) / 0.6), ease((5.5 - lt) / 0.4))
    draw_ov(f, text_ov(ttl, "xb", 50, WHITE, x=96, y=64), g)
    draw_ov(f, text_ov(sub, "b", 27, col, x=100, y=132), g)
    for k in range(4):
        rect(f, 1560 + k * 74, 84, 54, 5, col if k == i else DIM, 1.0 if k == i else 0.7)
    caption(f, "발음 교정 · 24시간 대화 · 문장 첨삭 · 망각 곡선 복습", fade(t, 1.2, 21.6, 0.7))

G21 = ["g01_spacemonster.jpg", "g02_avatar.jpg", "g03_pizza.jpg", "g04_escapevoice.jpg",
       "g05_escapezombie.jpg", "g06_escapeschool.jpg", "g07_tank.jpg", "g08_langace.jpg",
       "g09_p383d.jpg", "g10_battle3d.jpg", "g11_fish.jpg", "g12_shooter.jpg",
       "g13_brick.jpg", "g14_match.jpg", "g15_fill.jpg", "g16_balloon.jpg",
       "g17_suspect.jpg", "g18_speaking.jpg", "g19_wordfighter.jpg", "g20_tetris.jpg",
       "g21_rescue.jpg"]
G21N = ["우주 괴물 사냥", "아바타 키우기", "문법 피자 마스터", "말해야 열린다", "좀비 실험실 탈출",
        "학교 탈출 SOS", "셔먼 탱크대전", "P-38 라이트닝", "P-38 3D 조종석", "우주 배틀",
        "낚시+말하기", "슈팅+말하기", "문장 벽돌", "단어 매칭", "빈칸 채우기", "풍선 터뜨리기",
        "용의자 추리", "말하기 퀴즈", "워드 파이터", "단어 테트리스", "망고 구조선의 대항해"]
def c5(f, t):                     # 01:00–01:18  게임 21종
    f[:] = (BGF.astype(np.float32) * 0.8).astype(np.uint8)
    if t < 13.125:                                 # 0.625초 = BPM 96 한 박
        i = min(20, int(t / 0.625)); lt = t - i * 0.625
        z = 1.0 + 0.05 * (lt / 0.625)
        a = card_fit(G21[i], int(1420 * z), int(660 * z))
        blit(f, a, W / 2 - a.shape[1] / 2, 190 + (660 - a.shape[0]) / 2, 1.0)   # 비트에 맞춘 하드컷
        draw_ov(f, text_ov(f"{i+1:02d}", "xb", 44, GOLD, x=96, y=64), 1.0)
        draw_ov(f, text_ov(G21N[i], "b", 34, WHITE, x=168, y=74), 1.0)
        rect(f, 96, 1006, int(1728 * (t / 13.125)), 5, GOLD, 0.95)
    else:                                          # 21장 격자로 모임
        u = ease((t - 13.125) / 1.5)
        gw, gh, gx, gy = 240, 152, 30, 26
        tw = 7 * gw + 6 * gx; x0 = (W - tw) // 2; y0 = 250
        for i, nm in enumerate(G21):
            a = card(nm, gw)
            tx = x0 + (i % 7) * (gw + gx); ty = y0 + (i // 7) * (gh + gy)
            sx = W / 2 - gw / 2 + (tx - (W / 2 - gw / 2)) * u
            sy = 250 + (ty - 250) * u
            blit(f, a, sx, sy, min(1.0, 0.35 + 0.65 * u))
        draw_ov(f, text_ov("학습 게임 21종", "xb", 52, WHITE, cx=W // 2, y=118), ease((t - 13.7) / 0.9))
    caption(f, "영어로 말해야 문이 열립니다", fade(t, 1.0, 17.6, 0.6))

def c6(f, t):                     # 01:18–01:34  근거
    f[:] = (BGT.astype(np.float32) * 0.82).astype(np.uint8)
    draw_ov(f, text_ov("재미로만 만들지 않았습니다", "xb", 50, WHITE, cx=W // 2, y=84), fade(t, 0.2, 15.6, 0.7))
    for k, (nm, lab, sub) in enumerate([
            ("d_zpd.png", "근접발달영역", "Vygotsky, 1978"),
            ("d_forget.png", "간격 반복", "Ebbinghaus · Cepeda et al., 2006")]):
        a = ease((t - 0.9 - k * 0.9) / 1.3)
        if a <= 0: continue
        c = card_fit(nm, 800, 470, border=False)
        x = 96 + k * 928
        draw_ov(f, text_ov(lab, "b", 36, GOLD if k == 0 else SKY, x=x, y=196), a)
        draw_ov(f, text_ov(sub, "r", 22, MUT, x=x, y=248), a * 0.95)
        blit(f, c, x, 300 + 22 * (1 - a), a)
    caption(f, "비고츠키 근접발달영역 · 간격 반복", fade(t, 3.0, 15.6, 0.7))

C7 = [("leveltestai.jpg", "1", "A.I 레벨 진단"), ("booking.jpg", "2", "선생님과 수업"),
      ("microquiz.jpg", "3", "A.I 콘텐츠로 복습")]
def c7(f, t):                     # 01:34–01:48  사용방법
    f[:] = (BGC.astype(np.float32) * 0.72).astype(np.uint8)
    draw_ov(f, text_ov("시작은 세 단계", "xb", 50, WHITE, cx=W // 2, y=84), fade(t, 0.2, 13.6, 0.6))
    cw = 552
    for k, (nm, n, lab) in enumerate(C7):
        a = ease((t - 0.8 - k * 1.15) / 1.0)
        if a <= 0: continue
        x = 76 + k * (cw + 40)
        c = card_fit(nm, cw, 470)
        blit(f, c, x, 268 + 26 * (1 - a), a)
        draw_ov(f, text_ov(n, "xb", 40, GOLD, x=x, y=210), a)
        draw_ov(f, text_ov(lab, "b", 30, WHITE, x=x + 46, y=218), a)
        if k < 2:
            draw_ov(f, text_ov("→", "b", 40, DIM, x=x + cw + 4, y=470), a * 0.9)
    p = ease((t - 1.2) / 8.0)
    rect(f, 76, 812, 1768, 6, (30, 39, 66), 1.0)
    rect(f, 76, 812, int(1768 * p), 6, GOLD, 1.0)
    caption(f, "진단 → 수업 → 매일 이어지는 복습", fade(t, 3.4, 13.6, 0.7))

def c8(f, t):                     # 01:48–02:00  마무리
    f[:] = BGL
    if t < 4.6:
        for k, nm in enumerate(["avatar.jpg", "streak.jpg", "parent.jpg"]):
            a = ease((t - 0.2 - k * 1.0) / 0.9) * ease((4.6 - t) / 0.8)
            if a <= 0: continue
            c = card_fit(nm, 540, 400)
            blit(f, c, 90 + k * 588, 330, a)
        draw_ov(f, text_ov("아바타는 자라고, A.I는 아이를 알아 갑니다", "b", 38, TXT, cx=W // 2, y=760),
                fade(t, 1.6, 4.6, 0.6))
    u = ease((t - 4.4) / 1.2)
    if u > 0:
        f[:] = (f.astype(np.float32) * (1 - u) + BGL.astype(np.float32) * u).astype(np.uint8)
        put_mascot(f, 200, W // 2, 306, u)
        draw_ov(f, text_ov("MANGO AI", "xb", 82, WHITE, cx=W // 2, y=410), u)
        draw_ov(f, text_ov("« 재미가 의지를 이깁니다 »", "xb", 46, GOLD, cx=W // 2, y=530),
                ease((t - 5.4) / 1.0))
        draw_ov(f, text_ov("www.mangoi.ai", "xb", 40, WHITE, cx=W // 2, y=672),
                ease((t - 6.6) / 1.0))
        rect(f, W // 2 - 150, 748, 300, 3, GOLD, ease((t - 7.0) / 1.0) * 0.9)
    if t > 11.2:
        k = ease((t - 11.2) / 0.8)
        f[:] = (f.astype(np.float32) * (1 - k)).astype(np.uint8)

CUTS = [(0.0, 9.0, c1), (9.0, 24.0, c2), (24.0, 38.0, c3), (38.0, 60.0, c4),
        (60.0, 78.0, c5), (78.0, 94.0, c6), (94.0, 108.0, c7), (108.0, 120.0, c8)]
XF = 0.4   # 컷 전환 크로스페이드

def render(fr_idx, buf):
    t = fr_idx / FPS
    for k, (a, b, fn) in enumerate(CUTS):
        if a <= t < b or (k == len(CUTS) - 1 and t >= a):
            fn(buf, t - a)
            # 앞 컷과 겹치는 구간이면 섞는다
            if k > 0 and t - a < XF:
                pa, pb, pf = CUTS[k - 1]
                prev = np.empty_like(buf)
                pf(prev, t - pa)
                u = ease((t - a) / XF)
                buf[:] = (prev.astype(np.float32) * (1 - u) + buf.astype(np.float32) * u).astype(np.uint8)
            return

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "mangoi_2min_rough.mp4"
    bgm = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bgm.wav")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if os.path.exists(bgm): cmd += ["-i", bgm]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-movflags", "+faststart"]
    if os.path.exists(bgm): cmd += ["-c:a", "aac", "-b:a", "192k", "-shortest"]
    cmd += [out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    buf = np.zeros((H, W, 3), dtype=np.uint8)
    import time as _t
    t0 = _t.time()
    for i in range(NF):
        render(i, buf)
        p.stdin.write(buf.tobytes())
        if i % 300 == 0:
            el = _t.time() - t0
            print(f"  {i:4d}/{NF}  {i/FPS:6.1f}s  ({el:.0f}s elapsed)", flush=True)
    p.stdin.close(); p.wait()
    print("done ->", out)

if __name__ == "__main__":
    main()
