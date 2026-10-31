"""유튜브 쇼츠용 세로 숏폼 (1080×1920 / 30fps / 44.4초).
쇼츠는 소리를 끄고 보는 사람이 많아 자막을 크게 태워 넣고, 하단 UI 영역을 비워 둔다."""
import numpy as np, subprocess, sys, os
from PIL import Image, ImageDraw
import render as R
import importlib
T = importlib.import_module(os.environ.get('TIMING_V','timing_vm'))

W, H, FPS = 1080, 1920, 30
DUR, START, TOTAL, LEAD = T.DUR, T.START, T.TOTAL, T.LEAD
NF = int(round(TOTAL * FPS))
BEAT = T.BEAT
GOLD, WHITE, TXT, MUT, DIM = R.GOLD, R.WHITE, R.TXT, R.MUT, R.DIM
ease, eout, fade = R.ease, R.eout, R.fade

# ── 세로 배경 (가로 배경을 폭에 맞춰 키우고 가운데를 잘라 쓴다) ──
def vbg(name, mul=1.0):
    im = R.load(name)
    s = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    x = (im.width - W) // 2; y = (im.height - H) // 2
    a = np.asarray(im.crop((x, y, x + W, y + H)), np.float32) * mul
    return a.astype(np.uint8)

BG1 = vbg("d_bg_cover.jpg", 0.72)
BG2 = vbg("d_bg_cover.jpg", 0.62)
BG3 = vbg("d_bg_feature.jpg", 0.66)
BG4 = vbg("d_bg_close.jpg", 1.0)

_ov = {}
def txt(s, kind, size, color, y, cx=None, x=None):
    k = (s, kind, size, color, y, cx, x)
    if k in _ov: return _ov[k]
    f = R.font(kind, size)
    tmp = ImageDraw.Draw(Image.new("L", (4, 4)))
    bb = tmp.textbbox((0, 0), s, font=f)
    tw, th = bb[2] - bb[0] + 10, bb[3] - bb[1] + 16
    lay = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.text((5 - bb[0], 8 - bb[1]), s, font=f, fill=color + (255,))
    arr = np.asarray(lay, np.uint8)
    px = int((cx if cx is not None else W // 2) - tw / 2) if x is None else int(x)
    o = R.Ov(arr[:, :, :3].copy(), (arr[:, :, 3].astype(np.float32) / 255)[:, :, None], px, int(y))
    _ov[k] = o
    return o

def draw(f, o, g=1.0):
    if g <= 0.003: return
    h, w = o.a.shape[:2]
    x0, y0 = max(0, o.x), max(0, o.y)
    x1, y1 = min(W, o.x + w), min(H, o.y + h)
    if x1 <= x0 or y1 <= y0: return
    a = o.a[y0 - o.y:y1 - o.y, x0 - o.x:x1 - o.x] * g
    rgb = o.rgb[y0 - o.y:y1 - o.y, x0 - o.x:x1 - o.x]
    reg = f[y0:y1, x0:x1]
    reg[:] = (reg.astype(np.float32) * (1 - a) + rgb.astype(np.float32) * a).astype(np.uint8)

def rect(f, x, y, w, h, c, alpha=1.0):
    x0, y0 = max(0, int(x)), max(0, int(y))
    x1, y1 = min(W, int(x + w)), min(H, int(y + h))
    if x1 <= x0 or y1 <= y0: return
    reg = f[y0:y1, x0:x1]
    col = np.array(c, np.float32)
    reg[:] = col.astype(np.uint8) if alpha >= 0.997 else \
             (reg.astype(np.float32) * (1 - alpha) + col * alpha).astype(np.uint8)

def blit(f, arr, x, y, alpha=1.0):
    if alpha <= 0.003: return
    h, w = arr.shape[:2]
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0: return
    src = arr[y0 - y:y1 - y, x0 - x:x1 - x]
    if alpha >= 0.997: f[y0:y1, x0:x1] = src
    else:
        reg = f[y0:y1, x0:x1]
        reg[:] = (reg.astype(np.float32) * (1 - alpha) + src.astype(np.float32) * alpha).astype(np.uint8)

def mascot(f, w, cx, cy, g=1.0):
    m = R.mascot(w)
    draw(f, R.Ov(m.rgb, m.a, int(cx - m.rgb.shape[1] / 2), int(cy - m.rgb.shape[0] / 2)), g)

CAPY = 1452
def cap(f, s, g, size=52):
    """하단 자막 — 쇼츠 UI(맨 아래 ~350px)와 겹치지 않는 높이."""
    if g <= 0.003: return
    o = txt(s, "b", size, WHITE, CAPY)
    pw, ph = o.rgb.shape[1] + 64, o.rgb.shape[0] + 20
    rect(f, W // 2 - pw // 2, CAPY - 10, pw, ph, (8, 12, 24), 0.66 * g)
    rect(f, W // 2 - pw // 2, CAPY - 10, 5, ph, GOLD, 0.9 * g)
    draw(f, o, g)


# ── 장면 1 · 훅 ───────────────────────────────────────────────
def s1(f, t, D):
    f[:] = (BG1.astype(np.float32) * (0.3 + 0.7 * ease(t / 2.0))).astype(np.uint8)
    mascot(f, 460, W // 2, 620 - 30 * eout(t / 2.0), ease((t - 0.4) / 1.3))
    g = ease((t - 1.4) / 1.0)
    draw(f, txt("재능이", "xb", 128, WHITE, 980), g)
    draw(f, txt("없어서가 아닙니다", "xb", 118, GOLD, 1130), ease((t - 1.9) / 1.0))
    draw(f, txt("오래 하지 못해서입니다", "b", 52, TXT, 1300), ease((t - 3.2) / 1.0))
    draw(f, txt("MANGO AI", "xb", 34, (120, 138, 182), 1620), ease((t - 4.2) / 1.2) * 0.9)


# ── 장면 2 · 답 ───────────────────────────────────────────────
GAL = ["speech.jpg", "aifriend.jpg", "aiwrite.jpg", "vocab.jpg", "games.jpg", "avatar.jpg"]
def s2(f, t, D):
    f[:] = BG2
    mascot(f, 190, W // 2, 240, ease(t / 0.8))
    draw(f, txt("MANGO AI", "xb", 84, WHITE, 340), ease((t - 0.2) / 0.9))
    draw(f, txt("A.I 학습 콘텐츠 14가지", "b", 50, GOLD, 458), ease((t - 0.8) / 0.9))
    cw, gx, gy = 420, 20, 16
    for i, nm in enumerate(GAL):
        a = ease((t - 1.5 - i * 0.22) / 0.7)
        if a <= 0: continue
        c = R.card_fit(nm, cw, 270)
        x = (W - (2 * cw + gx)) // 2 + (i % 2) * (cw + gx)
        y = 600 + (i // 2) * (c.shape[0] + gy)
        blit(f, c, x, y + 16 * (1 - a), a)
    cap(f, "수업이 없는 날에도 채웁니다", fade(t, LEAD[1] + 1.6, D - 0.3, 0.6))


# ── 장면 3 · 게임 21종 ────────────────────────────────────────
def s3(f, t, D):
    burst = 21 * BEAT
    f[:] = BG3
    if t < burst:
        i = min(20, int(t / BEAT)); lt = t - i * BEAT
        z = 1.0 + 0.05 * (lt / BEAT)
        c = R.card_fit(R.G21[i], int(1010 * z), int(700 * z))
        blit(f, c, W / 2 - c.shape[1] / 2, 700 - c.shape[0] / 2, 1.0)
        draw(f, txt(f"{i+1:02d}", "xb", 72, GOLD, 250), 1.0)
        draw(f, txt(R.G21N[i], "b", 50, WHITE, 350), 1.0)
        rect(f, 60, 1180, 960, 6, (30, 39, 66), 1.0)
        rect(f, 60, 1180, int(960 * (t / burst)), 6, GOLD, 0.95)
    else:
        u = ease((t - burst) / 1.2)
        tw, th, gx, gy = 290, 181, 12, 10
        x0 = (W - (3 * tw + 2 * gx)) // 2; y0 = 300
        for i, nm in enumerate(R.G21):
            c = R.card_fit(nm, tw, th)
            tx = x0 + (i % 3) * (tw + gx); ty = y0 + (i // 3) * (th + gy)
            blit(f, c, W / 2 - tw / 2 + (tx - (W / 2 - tw / 2)) * u, 700 + (ty - 700) * u,
                 min(1.0, 0.35 + 0.65 * u))
        draw(f, txt("학습 게임 21종", "xb", 70, WHITE, 190), ease((t - burst - 0.4) / 0.8))
    cap(f, "영어로 말해야 문이 열립니다", fade(t, LEAD[2] + 0.6, burst - 0.2, 0.6))


# ── 장면 4 · 마무리 ───────────────────────────────────────────
def s4(f, t, D):
    f[:] = BG4
    mascot(f, 400, W // 2, 560, ease(t / 0.9))
    draw(f, txt("MANGO AI", "xb", 108, WHITE, 830), ease((t - 0.3) / 0.9))
    draw(f, txt("« 재미가 의지를 이깁니다 »", "xb", 56, GOLD, 990), ease((t - 1.2) / 1.0))
    draw(f, txt("A.I 학습 콘텐츠 14가지 · 학습 게임 21종", "b", 40, TXT, 1120),
         ease((t - 2.2) / 1.0))
    g = ease((t - 3.4) / 1.0)
    rect(f, W // 2 - 250, 1290, 500, 96, (251, 191, 36), 0.96 * g)
    draw(f, txt("www.mangoi.ai", "xb", 46, (58, 42, 0), 1316), g)
    if t > D - 0.9:
        f[:] = (f.astype(np.float32) * (1 - ease((t - (D - 0.9)) / 0.8))).astype(np.uint8)


FN = [s1, s2, s3, s4]
XF = 0.35

def frame(i, buf):
    t = i / FPS
    for k in range(4):
        a = START[k]; b = a + DUR[k]
        if a <= t < b or (k == 3 and t >= a):
            FN[k](buf, t - a, DUR[k])
            if k > 0 and t - a < XF:
                prev = np.empty_like(buf)
                FN[k - 1](prev, t - START[k - 1], DUR[k - 1])
                u = ease((t - a) / XF)
                buf[:] = (prev.astype(np.float32) * (1 - u) + buf.astype(np.float32) * u).astype(np.uint8)
            return

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "short_video.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                          "-pix_fmt", "yuv420p", "-profile:v", "high", out], stdin=subprocess.PIPE)
    buf = np.zeros((H, W, 3), np.uint8)
    for i in range(NF):
        frame(i, buf)
        p.stdin.write(buf.tobytes())
        if i % 240 == 0: print(f"  {i}/{NF}", flush=True)
    p.stdin.close(); p.wait()
    print("done ->", out, f"{TOTAL:.1f}s")

if __name__ == "__main__":
    main()
