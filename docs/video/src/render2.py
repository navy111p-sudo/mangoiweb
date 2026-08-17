"""내레이션 길이에 맞춘 본편 렌더러. 컷 길이를 timing.py 에서 받아 내부 타이밍을 늘리고 줄인다."""
import numpy as np, subprocess, sys, os
from render import (W, H, FPS, IMG, GOLD, SKY, PUR, GRN, WHITE, TXT, MUT, DIM,
                    font, load, card, card_fit, blit, Ov, text_ov, draw_ov, rect,
                    ease, eout, fade, BGC, BGT, BGL, BGF, put_mascot, caption,
                    dotfield, G21, G21N, C4, C7)
import importlib
T = importlib.import_module(os.environ.get('TIMING','timing_m'))

DUR, START, TOTAL, LEAD = T.DUR, T.START, T.TOTAL, T.LEAD
NF = int(round(TOTAL * FPS))
D0 = [9.0, 15.0, 14.0, 22.0, 18.0, 16.0, 14.0, 12.0]   # 무음 가편 때의 컷 길이
PCT = float(os.environ.get("PCT", "0.5"))              # 화면에 띄울 퍼센트
MIN_TXT = os.environ.get("MIN_TXT", "160분")           # 화면에 띄울 월 수업시간


def c1(f, t, D):
    s = D / D0[0]
    f[:] = (BGC.astype(np.float32) * (0.25 + 0.75 * ease(t / 2.4))).astype(np.uint8)
    put_mascot(f, 210, W // 2, 452 - 26 * eout(t / 2.2), ease((t - 0.7) / 1.5))
    draw_ov(f, text_ov("MANGO AI", "xb", 30, (110, 128, 170), cx=W // 2, y=596),
            ease((t - 1.5) / 1.3) * 0.9)
    caption(f, "재능이 없어서가 아닙니다", fade(t, LEAD[0] + 1.5, D - 0.35, 0.7))


def c2(f, t, D):
    s = D / D0[1]
    f[:] = (BGC.astype(np.float32) * 0.55).astype(np.uint8)
    dotfield(f, lit_g=ease((t - 3.2 * s) / 1.6), base_g=ease(t / 2.0))
    draw_ov(f, text_ov("한 달 43,200분", "b", 30, MUT, cx=W // 2, y=62), fade(t, 0.6, D - 0.3, 0.8))
    v = PCT * eout(min(max((t - 4.2 * s) / 2.6, 0), 1))
    draw_ov(f, text_ov(f"{v:.1f}%", "xb", 116, GOLD, cx=W // 2, y=110, key=("pct", round(v, 2))),
            fade(t, 4.2 * s, D - 0.3, 0.5))
    draw_ov(f, text_ov(f"영어를 쓰는 시간은 {MIN_TXT}", "b", 32, TXT, cx=W // 2, y=254),
            fade(t, 5.6 * s, D - 0.3, 0.6))
    caption(f, f"한 달 중 영어를 쓰는 시간 {PCT:.1f}%", fade(t, 7.4 * s, D - 0.35, 0.7))


def c3(f, t, D):
    s = D / D0[2]
    sw_end, logo_at = 4.0 * s, 4.6 * s
    f[:] = (BGC.astype(np.float32) * 0.55).astype(np.uint8)
    if t < logo_at + 1.8:
        dotfield(f, lit_g=1.0, sweep=ease((t - 0.3) / sw_end),
                 base_g=1.0 - 0.55 * ease((t - logo_at) / 1.6))
        draw_ov(f, text_ov("망고아이는 그 빈 시간을 채웁니다", "b", 40, WHITE, cx=W // 2, y=150),
                fade(t, 0.5, logo_at + 1.6, 0.7))
    if t >= logo_at:
        u = ease((t - logo_at) / 1.6)
        f[:] = (f.astype(np.float32) * (1 - u) + BGC.astype(np.float32) * u).astype(np.uint8)
        put_mascot(f, 170, W // 2, 236, u)
        draw_ov(f, text_ov("MANGO AI", "xb", 76, WHITE, cx=W // 2, y=330), u)
        draw_ov(f, text_ov("A.I 학습 콘텐츠 14가지", "b", 34, GOLD, cx=W // 2, y=430),
                ease((t - logo_at - 1.0) / 1.2))
        gal = ["speech.jpg", "aifriend.jpg", "aiwrite.jpg", "vocab.jpg", "microquiz.jpg", "judgment.jpg",
               "warmup.jpg", "games.jpg", "avatar.jpg", "streak.jpg", "leveltestai.jpg", "parent.jpg"]
        st = (D - 0.9 - (logo_at + 2.0)) / 12
        for i, nm in enumerate(gal):
            a = ease((t - logo_at - 2.0 - i * min(0.16, st)) / 0.7)
            if a <= 0: continue
            x = 84 + (i % 6) * 306; y = 520 + (i // 6) * 200
            blit(f, card(nm, 288), x, y + 14 * (1 - a), a)
    caption(f, "A.I 학습 콘텐츠 14가지", fade(t, LEAD[2] + 6.8 * s, D - 0.35, 0.6))


def c4(f, t, D):
    sub = D / 4.0
    f[:] = BGF
    i = min(3, int(t / sub)); lt = t - i * sub
    nm, ttl, subt, col = C4[i]
    z = 1.0 + 0.045 * ease(lt / sub)
    a = card_fit(nm, int(1400 * z), int(650 * z))
    blit(f, a, W / 2 - a.shape[1] / 2, 210 + (650 - a.shape[0]) / 2 - (a.shape[0] - 650) * 0.12,
         min(ease(lt / 0.42), ease((sub - lt) / 0.38)))
    g = min(ease((lt - 0.25) / 0.55), ease((sub - lt) / 0.38))
    draw_ov(f, text_ov(ttl, "xb", 50, WHITE, x=96, y=64), g)
    draw_ov(f, text_ov(subt, "b", 27, col, x=100, y=132), g)
    for k in range(4):
        rect(f, 1560 + k * 74, 84, 54, 5, col if k == i else DIM, 1.0 if k == i else 0.7)
    caption(f, "발음 교정 · 24시간 대화 · 문장 첨삭 · 망각 곡선 복습",
            fade(t, LEAD[3] + 0.8, D - 0.35, 0.7))


BEAT = T.BEAT
def c5(f, t, D):
    burst = 21 * BEAT                                   # 12.6초 — 한 게임당 한 박
    f[:] = (BGF.astype(np.float32) * 0.8).astype(np.uint8)
    if t < burst:
        i = min(20, int(t / BEAT)); lt = t - i * BEAT
        z = 1.0 + 0.05 * (lt / BEAT)
        a = card_fit(G21[i], int(1420 * z), int(660 * z))
        blit(f, a, W / 2 - a.shape[1] / 2, 190 + (660 - a.shape[0]) / 2, 1.0)
        draw_ov(f, text_ov(f"{i+1:02d}", "xb", 44, GOLD, x=96, y=64), 1.0)
        draw_ov(f, text_ov(G21N[i], "b", 34, WHITE, x=168, y=74), 1.0)
        rect(f, 96, 1006, int(1728 * (t / burst)), 5, GOLD, 0.95)
    else:
        u = ease((t - burst) / 1.5)
        gw, gh, gx, gy = 240, 152, 30, 26
        x0 = (W - (7 * gw + 6 * gx)) // 2; y0 = 250
        for i, nm in enumerate(G21):
            a = card(nm, gw)
            tx = x0 + (i % 7) * (gw + gx); ty = y0 + (i // 7) * (gh + gy)
            blit(f, a, W / 2 - gw / 2 + (tx - (W / 2 - gw / 2)) * u, y0 + (ty - y0) * u,
                 min(1.0, 0.35 + 0.65 * u))
        draw_ov(f, text_ov("학습 게임 21종", "xb", 52, WHITE, cx=W // 2, y=118),
                ease((t - burst - 0.6) / 0.9))
    caption(f, "영어로 말해야 문이 열립니다", fade(t, LEAD[4] + 0.7, D - 0.35, 0.6))


def c6(f, t, D):
    s = D / D0[5]
    f[:] = (BGT.astype(np.float32) * 0.82).astype(np.uint8)
    draw_ov(f, text_ov("재미로만 만들지 않았습니다", "xb", 50, WHITE, cx=W // 2, y=84),
            fade(t, 0.2, D - 0.35, 0.7))
    for k, (nm, lab, sub) in enumerate([("d_zpd.png", "근접발달영역", "Vygotsky, 1978"),
                                        ("d_forget.png", "간격 반복", "Ebbinghaus · Cepeda et al., 2006")]):
        a = ease((t - (0.9 + k * 1.4) * s) / 1.3)
        if a <= 0: continue
        c = card_fit(nm, 800, 470, border=False)
        x = 96 + k * 928
        draw_ov(f, text_ov(lab, "b", 36, GOLD if k == 0 else SKY, x=x, y=196), a)
        draw_ov(f, text_ov(sub, "r", 22, MUT, x=x, y=248), a * 0.95)
        blit(f, c, x, 300 + 22 * (1 - a), a)
    caption(f, "비고츠키 근접발달영역 · 간격 반복", fade(t, LEAD[5] + 2.4 * s, D - 0.35, 0.7))


def c7(f, t, D):
    s = D / D0[6]
    f[:] = (BGC.astype(np.float32) * 0.72).astype(np.uint8)
    draw_ov(f, text_ov("시작은 세 단계", "xb", 50, WHITE, cx=W // 2, y=84), fade(t, 0.2, D - 0.35, 0.6))
    cw = 552
    for k, (nm, n, lab) in enumerate(C7):
        a = ease((t - (0.8 + k * 1.9) * s) / 1.0)
        if a <= 0: continue
        x = 76 + k * (cw + 40)
        blit(f, card_fit(nm, cw, 470), x, 268 + 26 * (1 - a), a)
        draw_ov(f, text_ov(n, "xb", 40, GOLD, x=x, y=210), a)
        draw_ov(f, text_ov(lab, "b", 30, WHITE, x=x + 46, y=218), a)
        if k < 2:
            draw_ov(f, text_ov("→", "b", 40, DIM, x=x + cw + 4, y=470), a * 0.9)
    rect(f, 76, 812, 1768, 6, (30, 39, 66), 1.0)
    rect(f, 76, 812, int(1768 * ease((t - 1.0) / (D - 2.2))), 6, GOLD, 1.0)
    caption(f, "진단 → 수업 → 매일 이어지는 복습", fade(t, LEAD[6] + 2.6 * s, D - 0.35, 0.7))


def c8(f, t, D):
    grow = min(5.0, D * 0.38)                            # 아바타 3컷
    f[:] = BGL
    if t < grow + 0.4:
        st = (grow - 1.4) / 3
        for k, nm in enumerate(["avatar.jpg", "streak.jpg", "parent.jpg"]):
            a = ease((t - 0.2 - k * st) / 0.9) * ease((grow - t) / 0.8)
            if a <= 0: continue
            blit(f, card_fit(nm, 540, 400), 90 + k * 588, 330, a)
        draw_ov(f, text_ov("아바타는 자라고, A.I는 아이를 알아 갑니다", "b", 38, TXT, cx=W // 2, y=760),
                fade(t, 1.4, grow, 0.6))
    u = ease((t - (grow - 0.2)) / 1.2)
    if u > 0:
        f[:] = (f.astype(np.float32) * (1 - u) + BGL.astype(np.float32) * u).astype(np.uint8)
        put_mascot(f, 200, W // 2, 306, u)
        draw_ov(f, text_ov("MANGO AI", "xb", 82, WHITE, cx=W // 2, y=410), u)
        draw_ov(f, text_ov("« 재미가 의지를 이깁니다 »", "xb", 46, GOLD, cx=W // 2, y=530),
                ease((t - grow - 0.8) / 1.0))
        draw_ov(f, text_ov("www.mangoi.ai", "xb", 40, WHITE, cx=W // 2, y=672),
                ease((t - grow - 2.0) / 1.0))
        rect(f, W // 2 - 150, 748, 300, 3, GOLD, ease((t - grow - 2.4) / 1.0) * 0.9)
    if t > D - 1.0:
        f[:] = (f.astype(np.float32) * (1 - ease((t - (D - 1.0)) / 0.9))).astype(np.uint8)


FN = [c1, c2, c3, c4, c5, c6, c7, c8]
XF = 0.4


def render(i, buf):
    t = i / FPS
    for k in range(8):
        a = START[k]; b = a + DUR[k]
        if a <= t < b or (k == 7 and t >= a):
            FN[k](buf, t - a, DUR[k])
            if k > 0 and t - a < XF:
                prev = np.empty_like(buf)
                FN[k - 1](prev, t - START[k - 1], DUR[k - 1])
                u = ease((t - a) / XF)
                buf[:] = (prev.astype(np.float32) * (1 - u) + buf.astype(np.float32) * u).astype(np.uint8)
            return


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "video_only.mp4"
    p = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                          "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                          "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                          "-pix_fmt", "yuv420p", "-profile:v", "high", out], stdin=subprocess.PIPE)
    buf = np.zeros((H, W, 3), dtype=np.uint8)
    import time as _t
    t0 = _t.time()
    for i in range(NF):
        render(i, buf)
        p.stdin.write(buf.tobytes())
        if i % 300 == 0:
            print(f"  {i:4d}/{NF}  {i/FPS:6.1f}s  ({_t.time()-t0:.0f}s)", flush=True)
    p.stdin.close(); p.wait()
    print("done ->", out, f"{TOTAL:.1f}s")


if __name__ == "__main__":
    main()
