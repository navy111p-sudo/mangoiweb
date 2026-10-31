# -*- coding: utf-8 -*-
"""대상별 사용설명서 PowerPoint 생성 (16:9, 캡처+차트+아이콘)"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION
from PIL import Image
import importlib
C = importlib.import_module(__import__('os').environ.get('MANUAL_MODULE','content'))

HERE = os.path.dirname(os.path.abspath(__file__))
OPT = os.path.join(HERE, "assets", "opt")
CHAR = os.path.join(HERE, "assets", "mango_char.png")
FONT = getattr(C, "FONT", "Malgun Gothic")   # 중국어판(content_zh)은 'Microsoft YaHei' 를 쓴다

EMU_IN = 914400
SW, SH = 13.333, 7.5

def hx(s):
    s = s.lstrip("#")
    return RGBColor.from_string(s[:6])

def imgpath(key):
    p = os.path.join(OPT, key + ".jpg")
    return p if os.path.exists(p) else None

def set_bg(slide, color):
    slide.background.fill.solid()
    slide.background.fill.fore_color.rgb = hx(color)

def rect(slide, x, y, w, h, color, line=None, shape=MSO_SHAPE.RECTANGLE, shadow=False):
    sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.fill.solid(); sp.fill.fore_color.rgb = hx(color)
    if line: sp.line.color.rgb = hx(line); sp.line.width = Pt(1)
    else: sp.line.fill.background()
    sp.shadow.inherit = False
    return sp

def txt(slide, x, y, w, h, text, size=14, color="#1E2340", bold=False, align=PP_ALIGN.LEFT,
        anchor=MSO_ANCHOR.TOP, font=FONT, spacing=1.0, wrap=True, pad=None):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = wrap; tf.vertical_anchor = anchor
    if pad is not None:
        tf.margin_left = tf.margin_right = Inches(pad)
    lines = text.split("\n")
    for i, ln in enumerate(lines):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align; para.line_spacing = spacing
        run = para.add_run(); run.text = ln
        run.font.size = Pt(size); run.font.bold = bold
        run.font.color.rgb = hx(color); run.font.name = font
    return tb

def bullets(slide, x, y, w, h, items, size=13, color="#334155", bullet_color="#7C3AED", gap=6):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame; tf.word_wrap = True
    for i, it in enumerate(items):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.space_after = Pt(gap); para.line_spacing = 1.15
        r1 = para.add_run(); r1.text = "● "
        r1.font.size = Pt(size-2); r1.font.color.rgb = hx(bullet_color); r1.font.name = FONT; r1.font.bold = True
        r2 = para.add_run(); r2.text = it
        r2.font.size = Pt(size); r2.font.color.rgb = hx(color); r2.font.name = FONT
    return tb

def add_img_fit(slide, key, x, y, w, h):
    p = imgpath(key)
    if not p:
        rect(slide, x, y, w, h, "#E2E8F0")
        txt(slide, x, y+h/2-0.2, w, 0.4, C.UI.get("screen","화면"), 14, "#94A3B8", align=PP_ALIGN.CENTER)
        return
    im = Image.open(p); iw, ih = im.size; ar = iw/ih; box = w/h
    if ar > box:
        nw = w; nh = w/ar; nx = x; ny = y+(h-nh)/2
    else:
        nh = h; nw = h*ar; ny = y; nx = x+(w-nw)/2
    # 배경 카드
    rect(slide, nx-0.06, ny-0.06, nw+0.12, nh+0.12, "#FFFFFF", line="#E2E8F0")
    slide.shapes.add_picture(p, Inches(nx), Inches(ny), Inches(nw), Inches(nh))

def clean_md(s):
    return s.replace("**", "")

def step_key(text, limit=13):
    """스텝 문장에서 플로우 칩에 쓸 핵심어 추출 — **볼드** 조각이 곧 그 단계의 행동/대상."""
    t = str(text).strip()
    if "**" in t:
        parts = t.split("**")
        if len(parts) >= 3 and parts[1].strip():
            k = parts[1].strip()
            return k if len(k) <= limit else k[:limit].rstrip() + "…"
    plain = t.replace("**", "")
    for cut in ("—", ".", "!", "?"):
        if cut in plain:
            plain = plain.split(cut)[0]
    plain = plain.strip()
    return plain if len(plain) <= limit else plain[:limit].rstrip() + "…"


def native_chart(slide, ch, x, y, w, h, kind="bar"):
    data = CategoryChartData()
    data.categories = ch["labels"]
    data.add_series(C.UI.get("chart_series","값"), ch["values"])
    if kind == "doughnut":
        ct = XL_CHART_TYPE.DOUGHNUT
    elif kind == "column":
        ct = XL_CHART_TYPE.COLUMN_CLUSTERED
    else:
        ct = XL_CHART_TYPE.BAR_CLUSTERED
    gf = slide.shapes.add_chart(ct, Inches(x), Inches(y), Inches(w), Inches(h), data)
    chart = gf.chart
    chart.has_legend = (kind == "doughnut")
    if chart.has_legend:
        chart.legend.position = XL_LEGEND_POSITION.RIGHT
        chart.legend.include_in_layout = False
        chart.legend.font.size = Pt(11); chart.legend.font.name = FONT
    try:
        chart.has_title = False
    except Exception:
        pass
    plot = chart.plots[0]
    plot.has_data_labels = True
    plot.data_labels.font.size = Pt(11); plot.data_labels.font.name = FONT
    plot.data_labels.font.bold = True
    # 색상
    cols = ch["colors"]
    if kind == "doughnut" or len(cols) >= len(ch["values"]):
        pts = plot.series[0].points
        for i, pt in enumerate(pts):
            pt.format.fill.solid()
            pt.format.fill.fore_color.rgb = hx(cols[i % len(cols)])
    else:
        s0 = plot.series[0]
        s0.format.fill.solid(); s0.format.fill.fore_color.rgb = hx(cols[0])
    try:
        for ax in (chart.category_axis, chart.value_axis):
            ax.tick_labels.font.size = Pt(10); ax.tick_labels.font.name = FONT
    except Exception:
        pass
    return gf

# ───────────── 슬라이드 빌더 ─────────────
def build(aud, prs):
    t = C.THEMES[aud]; m = C.MANUALS[aud]
    p, p2, acc = t["primary"], t["primary2"], t["accent"]
    g1, g2 = t["grad"]
    title, subtitle = C.COVERS[aud]
    blank = prs.slide_layouts[6]

    def header_bar(slide, section):
        rect(slide, 0, 0, SW, 0.62, p)
        rect(slide, 0, 0.62, SW, 0.06, acc)
        txt(slide, 0.4, 0.03, 8, 0.55, f"{t['emoji']} {C.BRAND['name']} {t['label']} {C.UI['guide_of']}", 15, "#FFFFFF", bold=True, anchor=MSO_ANCHOR.MIDDLE)
        txt(slide, SW-4.4, 0.03, 4, 0.55, section, 13, "#FFFFFFDD" if False else "#F1F5F9", bold=True, align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)

    # 1) 표지
    s = prs.slides.add_slide(blank); set_bg(s, g1)
    rect(s, 0, 0, SW, SH, g1)
    # 데코 원
    for (cx, cy, r, col) in [(11.6,-1.2,4.2,g2),(-1.4,6.2,3.2,g2),(1.0,1.2,1.4,"#FFFFFF")]:
        o = rect(s, cx, cy, r, r, col, shape=MSO_SHAPE.OVAL)
        o.fill.fore_color.rgb = hx(col)
        try: o.fill.transparency = 0
        except Exception: pass
    rect(s, 0.9, 0.9, 2.7, 0.5, "#FFFFFF", shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    txt(s, 0.9, 0.9, 2.7, 0.5, f"{t['emoji']} {t['en']}", 13, p, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    txt(s, 0.9, 2.5, 8, 0.5, f"{C.BRAND['name']} · MANGOI", 16, "#FFFFFFCC", bold=True)
    txt(s, 0.85, 2.95, 8.5, 1.5, title, 46, "#FFFFFF", bold=True)
    txt(s, 0.9, 4.5, 8, 0.6, subtitle, 19, "#FFFFFFE6", bold=True)
    txt(s, 0.9, 6.5, 8, 0.5, f"{C.UI['target']} · {t['who']}   |   {C.SITE}", 13, "#FFFFFFCC")
    if os.path.exists(CHAR):
        im = Image.open(CHAR); ar = im.size[0]/im.size[1]; hh = 3.6; ww = hh*ar
        s.shapes.add_picture(CHAR, Inches(SW-ww-0.7), Inches(SH-hh-0.5), Inches(ww), Inches(hh))

    # 2) 소개
    s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["intro"])
    rect(s, 0.4, 0.95, SW-0.8, 1.7, t["soft"], shape=MSO_SHAPE.ROUNDED_RECTANGLE)
    txt(s, 0.7, 1.1, 11.9, 0.5, m["intro"]["title"], 24, p, bold=True)
    txt(s, 0.7, 1.62, 12.0, 1.0, clean_md(m["intro"]["body"]), 13, "#334155", spacing=1.25)
    # 하이라이트 4카드
    cardw = (SW-0.8-0.45)/2; cx0 = 0.4; cy0 = 2.95
    for i, h in enumerate(m["intro"]["points"]):
        r_, c_ = divmod(i, 2)
        cx = cx0 + c_*(cardw+0.45); cy = cy0 + r_*1.05
        rect(s, cx, cy, cardw, 0.9, "#FFFFFF", line="#E2E8F0", shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        rect(s, cx+0.15, cy+0.17, 0.56, 0.56, t["chip"], shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, cx+0.15, cy+0.17, 0.56, 0.56, h[0], 20, p, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        txt(s, cx+0.85, cy+0.13, cardw-1.0, 0.4, h[1], 14, "#1E2340", bold=True)
        txt(s, cx+0.85, cy+0.47, cardw-1.0, 0.4, h[2], 10.5, "#64748B")
    txt(s, 0.4, 5.2, 6, 0.4, list(m["charts"].values())[0]["title"], 13, p, bold=True)
    native_chart(s, list(m["charts"].values())[0], 0.4, 5.55, 6.2, 1.7, kind="bar")
    # 우측 첫 캡처
    add_img_fit(s, m["sections"][0]["img"], 7.0, 5.15, 5.9, 2.15)

    # 2.5) 차례(목차) — 장 번호는 결정적으로 계산된다
    U = C.UI
    secs = m["sections"]; n_sec = len(secs)
    has_concl = bool(m.get("conclusion"))
    no_table, no_chart = n_sec + 1, n_sec + 2
    no_faq, no_check = n_sec + 3, n_sec + 4
    no_concl = n_sec + 5 if has_concl else None
    n_entries = 1 + n_sec + 4 + (1 if has_concl else 0)
    PER = 34
    n_toc = max(1, -(-n_entries // PER))
    base = 2 + n_toc                       # 첫 섹션 슬라이드 번호 = base + 1
    toc_entries = [(None, U["intro"], 2)]
    for i, sec in enumerate(secs, 1):
        toc_entries.append((sec["no"], sec["title"], base + i))
    tail = base + n_sec
    toc_entries.append((no_table, U["summary"], tail + 1))
    toc_entries.append((no_chart, U["data"].split(" ", 1)[-1], tail + 2))
    toc_entries.append((no_faq,   U["faq"].split(" ", 1)[-1] if " " in U["faq"] else U["faq"], tail + 3))
    toc_entries.append((no_check, U["sheet_check"], tail + 4))
    if has_concl:
        toc_entries.append((no_concl, U["concl_page"], tail + 5))

    per_slide = -(-len(toc_entries) // n_toc)
    for ti in range(n_toc):
        chunk = toc_entries[ti*per_slide:(ti+1)*per_slide]
        s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, U["toc"])
        head = U["toc_title"] + (f"  ({ti+1}/{n_toc})" if n_toc > 1 else "")
        txt(s, 0.4, 0.9, 10, 0.5, head, 22, p, bold=True)
        half = -(-len(chunk) // 2)
        colw = (SW - 1.0) / 2
        for j, (no, label, num) in enumerate(chunk):
            c_, r_ = (0, j) if j < half else (1, j - half)
            x = 0.45 + c_ * (colw + 0.1); y = 1.62 + r_ * 0.3
            if no:
                rect(s, x, y, 0.42, 0.25, p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
                txt(s, x, y - 0.02, 0.42, 0.29, f"{no:02d}", 9, "#FFFFFF", bold=True,
                    align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
            txt(s, x + 0.52, y - 0.03, colw - 1.15, 0.3, label, 10.5, "#334155", bold=True, anchor=MSO_ANCHOR.MIDDLE)
            txt(s, x + colw - 0.62, y - 0.03, 0.5, 0.3, str(num), 10.5, p, bold=True,
                align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)

    def _wrap_h(text, width_in, size, lead=0.165, pad=0.24):
        """텍스트가 차지할 상자 높이(인치) 추정 — CJK 기준 글자폭으로 줄 수를 센다."""
        if not text:
            return 0.0
        per = max(10, int(width_in / (size * 0.0142)))
        n = 0
        for para in str(text).splitlines() or [""]:
            n += max(1, -(-len(para) // per))
        return pad + lead * n

    def nt_height(note_s, tip_s, total_w=12.53):
        """하단 알아두기·꿀팁 띠가 쓸 높이 (배치 전에 미리 계산)."""
        if not note_s and not tip_s:
            return 0.0
        two = bool(note_s) and bool(tip_s)
        w = (total_w - 0.18) / 2 if two else total_w
        h = max(_wrap_h(note_s, w - 0.30, 9.5), _wrap_h(tip_s, w - 0.30, 9.5), 0.52)
        return min(h, 1.30) + 0.14

    def nt_band(slide, note_s, tip_s, y_bottom=7.32, x0=0.4, total_w=12.53):
        """알아두기 · 꿀팁을 슬라이드 하단 전폭 2열로 배치하고 사용한 높이를 돌려준다."""
        if not note_s and not tip_s:
            return 0.0
        two = bool(note_s) and bool(tip_s)
        w = (total_w - 0.18) / 2 if two else total_w
        h = max(_wrap_h(note_s, w - 0.30, 9.5), _wrap_h(tip_s, w - 0.30, 9.5), 0.52)
        h = min(h, 1.30)
        y = y_bottom - h
        if note_s:
            rect(slide, x0, y, w, h, "#FFFBEB", line="#F59E0B", shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            txt(slide, x0 + 0.15, y + 0.05, w - 0.30, h - 0.10, note_s, 9.5, "#92670A", spacing=1.0)
        if tip_s:
            tx = x0 + (w + 0.18) if two else x0
            rect(slide, tx, y, w, h, "#FFF7E6", line=acc, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            txt(slide, tx + 0.15, y + 0.05, w - 0.30, h - 0.10, tip_s, 9.5, "#5B4A2A", spacing=1.0)
        return h

    def flow_strip(slide, sec, y=2.92, x0=0.4, total_w=12.53):
        """슬라이드 하단 단계 요약 띠 — 번호 원 + 핵심어 칩을 화살표로 연결."""
        steps = sec.get("steps") or []
        if not steps:
            return
        labs = [step_key(v, 10) for v in steps]
        # 칩 폭 추정: 번호원(0.30) + 좌우여백(0.34) + 글자폭 (10.5pt 기준, CJK는 전각)
        def chw(v):
            return 0.30 + 0.40 + sum(0.172 if ord(c) > 0x2000 else 0.094 for c in v)
        arrow = 0.20
        ws = [chw(v) for v in labs]
        need = sum(ws) + arrow * max(0, len(ws) - 1)
        if need > total_w:                       # 넘치면 라벨을 더 줄여 한 줄에 맞춘다
            labs = [step_key(v, 7) for v in steps]
            ws = [chw(v) for v in labs]
            need = sum(ws) + arrow * max(0, len(ws) - 1)
        if need > total_w:                       # 그래도 넘치면 앞쪽만 싣고 말줄임
            keep = []
            acc_w = 0.0
            for i, w_ in enumerate(ws):
                if acc_w + w_ + arrow > total_w - 0.6:
                    break
                keep.append(i); acc_w += w_ + arrow
            labs = [labs[i] for i in keep] + ["…"]
            ws = [chw(v) for v in labs]
            need = sum(ws) + arrow * max(0, len(ws) - 1)
        rect(slide, x0, y - 0.10, total_w, 0.72, "#F8FAFC",
             line="#E7ECF5", shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        cx = x0 + max(0.12, (total_w - need) / 2.0)
        for i, (lab, w_) in enumerate(zip(labs, ws)):
            if i:
                txt(slide, cx, y, arrow, 0.5, "›", 15, p, bold=True,
                    align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
                cx += arrow
            rect(slide, cx, y, w_, 0.5, "#FFFFFF", line=p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            if lab != "…":
                rect(slide, cx + 0.09, y + 0.10, 0.30, 0.30, p, shape=MSO_SHAPE.OVAL)
                txt(slide, cx + 0.09, y + 0.10, 0.30, 0.30, str(i + 1), 9, "#FFFFFF", bold=True,
                    align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
                txt(slide, cx + 0.42, y, w_ - 0.46, 0.5, lab, 10.5, "#334155", bold=True,
                    anchor=MSO_ANCHOR.MIDDLE, wrap=False, pad=0.0)
            else:
                txt(slide, cx, y, w_, 0.5, "…", 12, "#94A3B8", bold=True,
                    align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
            cx += w_

    def tail_head(slide, no, label, size=22):
        """뒷섹션 제목 앞의 번호 배지 (섹션 슬라이드와 같은 모양, 작게)"""
        rect(slide, 0.4, 0.92, 0.72, 0.56, p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(slide, 0.4, 0.92, 0.72, 0.56, f"{no:02d}", 17, "#FFFFFF", bold=True,
            align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        txt(slide, 1.25, 0.95, 10, 0.5, label, size, p, bold=True)

    # 3) 섹션들
    for sec in m["sections"]:
        s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["section"])
        # 번호 배지 + 제목
        rect(s, 0.4, 0.9, 0.95, 0.95, p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, 0.4, 0.9, 0.95, 0.95, f"{sec['no']:02d}", 26, "#FFFFFF", bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
        txt(s, 1.5, 0.9, 11.4, 0.55, f"{sec['icon']} {sec['title']}", 23, "#1E2340", bold=True)
        txt(s, 1.55, 1.48, 11.4, 0.35, sec["sub"], 13, "#64748B")
        # 설명 문단 (전체 폭)
        y = 2.0
        if sec.get("desc"):
            rect(s, 0.4, y, 12.5, 0.80, t["soft"], shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            txt(s, 0.6, y+0.05, 12.1, 0.70, clean_md(sec["desc"]), 11.5, "#334155", spacing=1.12)
        # 단계 요약 띠(플로우)가 y=2.92 에 들어가므로 본문은 그 아래에서 시작
        y = 3.70
        _note_pre = (C.UI["note"] + " · " + clean_md(sec["note"])) if sec.get("note") else ""
        _tip_pre  = (C.UI["tip"]  + " · " + clean_md(sec["tip"]))  if sec.get("tip")  else ""
        nt_reserve = nt_height(_note_pre, _tip_pre)
        left_w = 6.2
        # 좌: 단계 + 핵심 포인트 — 하단 띠를 넘지 않도록 글자 크기를 자동으로 낮춘다
        steps = [clean_md(x) for x in sec["steps"]]
        pts   = [clean_md(x) for x in (sec.get("points") or [])]

        def lines_of(items, size, width_in):
            per = max(12, int(width_in / (size * 0.0142)))
            return sum(max(1, -(-len(v) // per)) for v in items)

        avail = None                      # 사용 가능한 세로 (하단 띠 위까지)
        chosen = None
        for ssz, psz in ((11.5, 10.0), (10.5, 9.5), (9.5, 9.0), (9.0, 8.5)):
            sh = 0.40 + lines_of(steps, ssz, left_w - 0.35) * (ssz * 0.0195) + 0.14 * len(steps)
            ph = (0.40 + lines_of(pts, psz, left_w - 0.55) * (psz * 0.0195) + 0.09 * len(pts)) if pts else 0.0
            chosen = (ssz, psz, sh, ph)
            if y + sh + (ph + 0.12 if pts else 0) <= 7.20 - nt_reserve:
                break
        ssz, psz, sh, ph = chosen

        txt(s, 0.5, y, left_w, 0.35, C.UI["howto"], 13.5, p, bold=True)
        yy = y + 0.40
        bullets(s, 0.5, yy, left_w, max(0.5, sh - 0.40), steps, size=ssz, bullet_color=p, gap=3)
        yy += max(0.5, sh - 0.40) + 0.10
        if pts:
            rect(s, 0.5, yy, left_w, ph, "#F4F7FF", line=p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            txt(s, 0.65, yy+0.05, left_w-0.3, 0.30, C.UI["point"], 11, p, bold=True)
            bullets(s, 0.65, yy+0.32, left_w-0.3, ph-0.36, pts, size=psz, bullet_color=p, gap=1)
            yy += ph + 0.12
        # 알아두기 · 꿀팁 — 하단 전폭 2열 (좌측열 넘침 방지)
        note_s = (C.UI["note"] + " · " + clean_md(sec["note"])) if sec.get("note") else ""
        tip_s  = (C.UI["tip"]  + " · " + clean_md(sec["tip"]))  if sec.get("tip")  else ""
        band_h = nt_band(s, note_s, tip_s)
        # 우: 캡처 (imgs면 2x2 그리드) — 하단 띠 높이만큼 세로를 양보한다
        img_h = max(2.30, 7.32 - band_h - 0.14 - 3.62)
        if sec.get("imgs"):
            gx, gy, gw, gh = 6.95, 3.62, 6.0, img_h
            cw = (gw-0.2)/2; chh = (gh-0.2)/2
            for i, (k, lbl) in enumerate(sec["imgs"][:4]):
                r_, c_ = divmod(i, 2)
                add_img_fit(s, k, gx + c_*(cw+0.2), gy + r_*(chh+0.2), cw, chh)
        else:
            add_img_fit(s, sec.get("img",""), 6.95, 3.62, 6.0, img_h)
        # 하단 단계 요약 띠 (스텝 플로우 다이어그램)
        flow_strip(s, sec)

    # 4) 기능표
    s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["summary"])
    ft = m["feature_table"]
    tail_head(s, no_table, f"📋 {ft['title']}")
    rows = len(ft["rows"])+1; cols = len(ft["head"])
    tbl_w = SW-0.8; tbl_h = min(5.6, 0.5+rows*0.5)
    gtbl = s.shapes.add_table(rows, cols, Inches(0.4), Inches(1.6), Inches(tbl_w), Inches(tbl_h)).table
    for j, hd in enumerate(ft["head"]):
        cell = gtbl.cell(0, j); cell.text = hd
        cell.fill.solid(); cell.fill.fore_color.rgb = hx(p)
        para = cell.text_frame.paragraphs[0]; para.alignment = PP_ALIGN.CENTER
        run = para.runs[0]; run.font.size = Pt(13); run.font.bold = True; run.font.color.rgb = hx("#FFFFFF"); run.font.name = FONT
    for i, row in enumerate(ft["rows"]):
        for j, val in enumerate(row):
            cell = gtbl.cell(i+1, j); cell.text = str(val)
            cell.fill.solid(); cell.fill.fore_color.rgb = hx("#F8FAFC" if i % 2 else "#FFFFFF")
            para = cell.text_frame.paragraphs[0]; para.alignment = PP_ALIGN.CENTER if j else PP_ALIGN.LEFT
            run = para.runs[0]; run.font.size = Pt(12); run.font.color.rgb = hx("#334155"); run.font.name = FONT
            if j == 0: run.font.bold = True

    # 5) 차트 슬라이드
    s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["data"].split(" ",1)[-1])
    chs = list(m["charts"].values())
    tail_head(s, no_chart, C.UI["data"])
    txt(s, 0.5, 1.7, 6, 0.4, chs[1]["title"], 14, "#1E2340", bold=True)
    native_chart(s, chs[1], 0.5, 2.1, 6.0, 4.6, kind="column")
    if len(chs) > 2:
        txt(s, 6.9, 1.7, 6, 0.4, chs[2]["title"], 14, "#1E2340", bold=True)
        native_chart(s, chs[2], 6.9, 2.1, 6.0, 4.6, kind="doughnut")

    # 6) FAQ
    s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["faq"].split(" ",1)[-1] if " " in C.UI["faq"] else C.UI["faq"])
    tail_head(s, no_faq, C.UI["faq"])
    y = 1.7
    for q, a in m["faq"]:
        rect(s, 0.4, y, SW-0.8, 0.95, "#F8FAFC", line="#E2E8F0", shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, 0.6, y+0.08, SW-1.2, 0.4, f"Q. {clean_md(q)}", 13.5, p, bold=True)
        txt(s, 0.6, y+0.45, SW-1.2, 0.45, f"A. {clean_md(a)}", 11.5, "#475569", spacing=1.05)
        y += 1.08

    # 7) 체크리스트 + 마무리
    s = prs.slides.add_slide(blank); set_bg(s, t["soft"]); header_bar(s, C.UI["sheet_check"])
    cl = m["checklist"]
    tail_head(s, no_check, f"✅ {cl['title']}")
    y = 1.75
    for it in cl["items"]:
        rect(s, 0.5, y+0.05, 0.32, 0.32, "#FFFFFF", line=p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, 1.0, y-0.02, 11, 0.45, clean_md(it), 15, "#334155", bold=True)
        y += 0.62
    if os.path.exists(CHAR):
        im = Image.open(CHAR); ar = im.size[0]/im.size[1]; hh = 2.2; ww = hh*ar
        s.shapes.add_picture(CHAR, Inches(SW-ww-0.6), Inches(SH-hh-0.4), Inches(ww), Inches(hh))

    # 7.5) 마무리(결론) — 있으면
    if m.get("conclusion"):
        cc = m["conclusion"]
        s = prs.slides.add_slide(blank); set_bg(s, "#FFFFFF"); header_bar(s, C.UI["concl_page"])
        tail_head(s, no_concl, "🏁 " + cc["title"], size=21)
        rect(s, 0.4, 1.5, 12.5, 0.95, t["soft"], shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, 0.6, 1.56, 12.1, 0.85, clean_md(cc["lead"]), 11.5, "#334155", spacing=1.15)
        # 좌: 수업 한 사이클 (flow)
        txt(s, 0.5, 2.65, 6.3, 0.35, C.UI["concl_flow"], 13.5, p, bold=True)
        fy = 3.05
        for stg, act in cc["flow"]:
            rect(s, 0.5, fy, 1.75, 0.42, p, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            txt(s, 0.5, fy, 1.75, 0.42, stg, 8.5, "#FFFFFF", bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
            txt(s, 2.35, fy-0.02, 4.5, 0.46, clean_md(act), 8.5, "#334155", anchor=MSO_ANCHOR.MIDDLE)
            fy += 0.5
        # 우: 원칙 + 기억
        txt(s, 7.0, 2.65, 6, 0.35, C.UI["concl_principles"], 13.5, p, bold=True)
        bullets(s, 7.0, 3.05, 5.9, 2.3, [clean_md(x) for x in cc["principles"]], size=11, bullet_color=p, gap=5)
        ry = 3.05 + 0.42*len(cc["principles"]) + 0.2
        txt(s, 7.0, ry, 6, 0.35, C.UI["concl_remember"], 13.5, p, bold=True)
        bullets(s, 7.0, ry+0.4, 5.9, 1.8, [clean_md(x) for x in cc["remember"]], size=10.5, bullet_color=acc, gap=4)
        # 하단 응원 박스
        rect(s, 0.5, 6.75, 12.4, 0.62, t["soft"], line=acc, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        txt(s, 0.7, 6.79, 12.0, 0.55, "🍊 " + clean_md(cc["closing"]), 10, "#5B4A2A", spacing=1.02)

    # 8) 마무리
    s = prs.slides.add_slide(blank); set_bg(s, g2)
    rect(s, 0, 0, SW, SH, g2)
    for (cx, cy, r, col) in [(-1.5,-1.5,4.0,g1),(11.5,5.0,4.0,g1)]:
        rect(s, cx, cy, r, r, col, shape=MSO_SHAPE.OVAL)
    txt(s, 0, 2.4, SW, 1.0, C.UI["closing"], 34, "#FFFFFF", bold=True, align=PP_ALIGN.CENTER)
    txt(s, 0, 3.6, SW, 0.6, C.UI["closing_sub"], 16, "#FFFFFFE6", align=PP_ALIGN.CENTER)
    txt(s, 0, 4.5, SW, 0.5, f"🌐 {C.SITE}    📞 1644-0561    ✉ support@mangoi.co.kr", 14, "#FFFFFFCC", align=PP_ALIGN.CENTER)

def make(aud, outname):
    prs = Presentation()
    prs.slide_width = Inches(SW); prs.slide_height = Inches(SH)
    build(aud, prs)
    suffix = getattr(C, "OUT_SUFFIX", "")
    out = os.path.join(HERE, "build_pptx" + suffix, outname + ".pptx")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    prs.save(out)
    print("PPTX", aud, len(prs.slides.__iter__.__self__._sldIdLst), "slides ->", out)

if __name__ == "__main__":
    for aud in list(C.MANUALS.keys()):
        make(aud, C.FILENAMES[aud])
