# -*- coding: utf-8 -*-
"""각 대상별 사용설명서를 아름다운 HTML로 생성한다. (이후 Chrome로 PDF 변환)"""
import base64, os, html, importlib, json
C = importlib.import_module(os.environ.get("MANUAL_MODULE", "content"))

HERE = os.path.dirname(os.path.abspath(__file__))
OPT = os.path.join(HERE, "assets", "opt")
CHAR = os.path.join(HERE, "assets", "mango_char.png")

def datauri(path):
    if not os.path.exists(path):
        return ""
    ext = "png" if path.lower().endswith(".png") else "jpeg"
    with open(path, "rb") as f:
        return f"data:image/{ext};base64," + base64.b64encode(f.read()).decode()

def img(key):
    return datauri(os.path.join(OPT, key + ".jpg"))

CHAR_URI = datauri(CHAR)

def esc(s):
    return html.escape(str(s))

def md(s):
    # **bold** → <b>
    out = esc(s)
    while "**" in out:
        out = out.replace("**", "<b>", 1).replace("**", "</b>", 1)
    return out


def step_key(text, limit=13):
    """스텝 문장에서 플로우 칩에 쓸 핵심어를 뽑는다.
    **볼드** 로 강조된 첫 조각이 있으면 그것이 곧 그 단계의 행동/대상이다."""
    t = str(text).strip()
    if "**" in t:
        parts = t.split("**")
        if len(parts) >= 3:
            key = parts[1].strip()
            if key:
                return key if len(key) <= limit else key[:limit].rstrip() + "…"
    plain = t.replace("**", "")
    for cut in ("—", ".", "!", "?"):
        if cut in plain:
            plain = plain.split(cut)[0]
    plain = plain.strip()
    return plain if len(plain) <= limit else plain[:limit].rstrip() + "…"

# ───────── 차트 SVG ─────────
def bar_chart(ch, w=560):
    labels, values, colors = ch["labels"], ch["values"], ch["colors"]
    mx = max(values) or 1
    if len(colors) < len(values):
        colors = (colors * len(values))[:len(values)]
    rows = []
    bar_area = w - 150
    for lab, val, col in zip(labels, values, colors):
        bw = int(bar_area * val / mx)
        rows.append(f"""
        <div style="display:flex;align-items:center;margin:7px 0;font-size:12.5px">
          <div style="width:120px;color:#334155;font-weight:600">{esc(lab)}</div>
          <div style="flex:1;background:#EEF1F7;border-radius:8px;overflow:hidden;height:22px">
            <div style="width:{bw}px;height:22px;background:{col};border-radius:8px"></div>
          </div>
          <div style="width:44px;text-align:right;color:{col};font-weight:800">{val}</div>
        </div>""")
    return f'<div style="font-weight:800;color:#1E2340;margin-bottom:8px;font-size:14px">{esc(ch["title"])}</div>' + "".join(rows)

def donut_chart(ch, size=190):
    labels, values, colors = ch["labels"], ch["values"], ch["colors"]
    total = sum(values) or 1
    if len(colors) < len(values):
        colors = (colors * len(values))[:len(values)]
    r = 60; cx = cy = size/2; C_ = 2*3.14159*r
    segs = []; off = 0
    for val, col in zip(values, colors):
        frac = val/total
        dash = C_*frac
        segs.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{col}" stroke-width="26" '
                    f'stroke-dasharray="{dash:.2f} {C_-dash:.2f}" stroke-dashoffset="{-off:.2f}" transform="rotate(-90 {cx} {cy})"/>')
        off += dash
    legend = "".join(
        f'<div style="display:flex;align-items:center;margin:4px 0;font-size:12px">'
        f'<span style="width:12px;height:12px;border-radius:3px;background:{col};display:inline-block;margin-right:7px"></span>'
        f'<span style="color:#334155;font-weight:600">{esc(l)}</span>'
        f'<span style="margin-left:auto;color:{col};font-weight:800">{v}</span></div>'
        for l, v, col in zip(labels, values, colors))
    return f"""
    <div style="font-weight:800;color:#1E2340;margin-bottom:6px;font-size:14px">{esc(ch["title"])}</div>
    <div style="display:flex;align-items:center;gap:16px">
      <svg width="{size}" height="{size}" viewBox="0 0 {size} {size}">{''.join(segs)}
        <circle cx="{cx}" cy="{cy}" r="44" fill="#fff"/>
        <text x="{cx}" y="{cy-4}" text-anchor="middle" font-size="22" font-weight="800" fill="#1E2340">{total}</text>
        <text x="{cx}" y="{cy+16}" text-anchor="middle" font-size="11" fill="#64748B">{esc(C.UI.get("chart_total","합계"))}</text>
      </svg>
      <div style="flex:1">{legend}</div>
    </div>"""

TOC_META = {}

def ft_title_for_meta(m):
    return m["feature_table"]["title"]

# ───────── 페이지 조립 ─────────
def build(aud):
    t = C.THEMES[aud]; m = C.MANUALS[aud]
    p, p2, acc = t["primary"], t["primary2"], t["accent"]
    g1, g2 = t["grad"]
    title, subtitle = C.COVERS[aud]

    # 표지
    cover = f"""
    <section class="page cover" style="background:linear-gradient(135deg,{g1},{g2})">
      <div class="cover-deco d1"></div><div class="cover-deco d2"></div><div class="cover-deco d3"></div>
      <div class="cover-top">
        <span class="cover-badge">{t['emoji']} {esc(t['en'])}</span>
      </div>
      <div class="cover-mid">
        <div class="cover-eyebrow">{esc(C.BRAND["name"])} · MANGOI</div>
        <h1 class="cover-title">{esc(title)}</h1>
        <p class="cover-sub">{esc(subtitle)}</p>
        <img class="cover-char" src="{CHAR_URI}"/>
      </div>
      <div class="cover-foot">
        <div>{esc(C.UI["target"])} · {esc(t['who'])}</div>
        <div>{esc(C.SITE)}</div>
      </div>
    </section>"""

    # 소개 + 하이라이트 + 차트
    intro = m["intro"]
    hl = "".join(f"""
      <div class="hl-card">
        <div class="hl-ico" style="background:{acc}22;color:{p}">{h[0]}</div>
        <div><div class="hl-t">{esc(h[1])}</div><div class="hl-d">{esc(h[2])}</div></div>
      </div>""" for h in intro["points"])
    first_chart = list(m["charts"].values())[0]
    intro_page = f"""
    <section class="page">
      {header(aud, C.UI["intro"])}
      <div class="intro-hero" style="background:{t['soft']}">
        <div class="intro-badge" style="background:{p}">{t['emoji']} {esc(title)}</div>
        <h2 style="color:{p}">{esc(intro['title'])}</h2>
        <p class="intro-body">{md(intro['body'])}</p>
      </div>
      <div class="hl-grid">{hl}</div>
      <div class="panel">{bar_chart(first_chart)}</div>
      {footer(aud, title)}
    </section>"""

    # 섹션들 (자연 흐름 · 페이지당 1~2개, break-inside 회피)
    secs = m["sections"]
    sec_html = []
    for s in secs:
        steps = "".join(f'<li><span class="stepnum" style="background:{p}">{i+1}</span><span>{md(x)}</span></li>'
                        for i, x in enumerate(s["steps"]))
        # 🧭 스텝 플로우 다이어그램 — 각 단계의 핵심어를 칩 체인으로 시각화
        flow = ""
        if s.get("steps"):
            chips = []
            for i, x in enumerate(s["steps"]):
                lab = step_key(x)
                if i:
                    chips.append(f'<span class="sflow-arw" style="color:{p}88">›</span>')
                chips.append(
                    f'<span class="sflow-chip" style="border-color:{p}44;background:{p}0d">'
                    f'<span class="sflow-n" style="background:linear-gradient(135deg,{g1},{g2})">{i+1}</span>'
                    f'<span class="sflow-t">{esc(lab)}</span></span>')
            flow = (f'<div class="sflow-wrap"><div class="sflow-lb" style="color:{p}">{esc(C.UI["howto"])}</div>'
                    f'<div class="sflow">{"".join(chips)}</div></div>')
        desc = f'<p class="sec-desc" style="border-left-color:{p}">{md(s["desc"])}</p>' if s.get("desc") else ""
        points = ""
        if s.get("points"):
            cards = "".join(
                f'<div class="pt-card" style="border-color:{p}33;background:{p}0a">'
                f'<span class="pt-ic" style="background:{p}">✓</span><span>{md(x)}</span></div>'
                for x in s["points"])
            points = (f'<div class="pt-wrap"><div class="pt-lb" style="color:{p}">{C.UI["point"]}</div>'
                      f'<div class="pt-grid">{cards}</div></div>')
        note = f'<div class="note"><b>{C.UI["note"]}</b> {md(s["note"])}</div>' if s.get("note") else ""
        tip = f'<div class="tip" style="background:{acc}18;border-color:{acc}"><b style="color:{p}">{C.UI["tip"]}</b> {md(s["tip"])}</div>' if s.get("tip") else ""
        # 이미지: imgs(여러 장)면 그리드, 아니면 단일
        if s.get("imgs"):
            cells = "".join(
                f'<div class="gcell"><img src="{img(k)}"/>{f"<span>{esc(lbl)}</span>" if lbl else ""}</div>'
                for k, lbl in s["imgs"])
            shot = f'<div class="shot-grid">{cells}</div>'
        else:
            shot = f'<img class="shot" src="{img(s["img"])}"/>' if img(s.get("img","")) else f'<div class="shot noimg">{esc(C.UI.get("screen","화면"))}</div>'
        # 알아두기 · 꿀팁은 나란히 두어 아래 여백을 채운다
        nt = ""
        if note or tip:
            both = " nt-two" if (note and tip) else ""
            nt = f'<div class="nt-row{both}">{note}{tip}</div>'
        sec_html.append(f"""
        <div class="sec">
          <div class="sec-head">
            <span class="sec-no" style="background:linear-gradient(135deg,{g1},{g2})">{s['no']:02d}</span>
            <div><div class="sec-title">{s['icon']} {esc(s['title'])}</div>
                 <div class="sec-sub">{esc(s['sub'])}</div></div>
            <span class="sec-tag" style="background:{p}12;color:{p}">{esc(t['label'])}</span>
          </div>
          {desc}
          {flow}
          <div class="sec-body">
            <ol class="steps">{steps}</ol>
            <div class="sec-shot">{shot}</div>
          </div>
          {points}{nt}
        </div>""")
    # 페이지 패킹: 기능 1개 = 1페이지.
    # (예전엔 2개씩 묶었으나, 고정 높이 페이지에 내용이 넘쳐 물리 페이지가 갈리고
    #  아래 절반이 빈 채로 남았다. 1개씩 담고 그 공간을 도해·큰 화면으로 채운다.)
    sec_pages = [f"""<section class="page sec-page">{header(aud,C.UI['section'])}{hbit}{footer(aud,title)}</section>"""
                 for hbit in sec_html]

    # ── 차례(목차) ─────────────────────────────────────────────
    # 페이지 번호는 결정적으로 계산된다: 표지1 · 소개2 · 차례(N_TOC) · 섹션 · 기능요약 · FAQ · [마무리] · 뒷표지
    U = C.UI
    n_sec = len(secs)
    has_concl = bool(m.get("conclusion"))
    toc_entries = [(None, U["intro"], 2)]          # (번호, 제목, 쪽)
    # 한 쪽에 2단 × 최대 27행 → 54항목까지만 차례 1쪽에 담는다.
    # (2026-07-28) 64로 두었더니 학생용 64항목이 한 쪽을 넘쳐 빈 쪽이 생기고
    #  뒤 쪽번호가 통째로 1씩 밀렸다. 실측 여유가 있는 값으로 낮춘다.
    n_toc = 1 if (n_sec + 4) <= 54 else 2
    first_sec_page = 2 + n_toc + 1
    # 각 섹션이 실린 페이지 번호 (기능 1개 = 1페이지)
    pg = first_sec_page
    for s in secs:
        toc_entries.append((s["no"], s["title"], pg)); pg += 1
    # 뒷섹션 — 번호를 이어서 붙인다
    no_table = n_sec + 1
    no_faq   = n_sec + 2
    no_concl = n_sec + 3 if has_concl else None
    toc_entries.append((no_table, U["summary"], pg));  pg += 1
    toc_entries.append((no_faq,   U["faqpage"], pg));  pg += 1
    if has_concl:
        toc_entries.append((no_concl, U["concl_page"], pg)); pg += 1

    def toc_row(idx, no, label, page):
        badge = (f'<span class="toc-no" style="background:linear-gradient(135deg,{g1},{g2})">{no:02d}</span>'
                 if no else f'<span class="toc-no toc-no-plain" style="color:{p}">·</span>')
        return (f'<div class="toc-row">{badge}'
                f'<span class="toc-t">{esc(label)}</span>'
                f'<span class="toc-dots"></span>'
                f'<span class="toc-p" style="color:{p}">@@P{idx}@@</span></div>')

    per_page = -(-len(toc_entries) // n_toc)
    toc_pages_html = []
    for i in range(n_toc):
        chunk = toc_entries[i*per_page:(i+1)*per_page]
        half = -(-len(chunk) // 2)
        base = i*per_page
        colA = "".join(toc_row(base+j, *e) for j, e in enumerate(chunk[:half]))
        colB = "".join(toc_row(base+half+j, *e) for j, e in enumerate(chunk[half:]))
        head = (f'<div class="panel-title" style="color:{p};margin-bottom:10px">{esc(U["toc_title"])}'
                + (f' <span style="font-size:12px;color:#94A3B8;font-weight:600">({i+1}/{n_toc})</span>' if n_toc > 1 else '')
                + '</div>')
        toc_pages_html.append(f"""
    <section class="page">
      {header(aud, U["toc"])}
      <div class="panel">
        {head}
        <div class="toc-cols"><div class="toc-col">{colA}</div><div class="toc-col">{colB}</div></div>
      </div>
      {footer(aud, title)}
    </section>""")
    toc_html = "".join(toc_pages_html)
    TOC_META[aud] = {
        "n_toc": n_toc,
        "entries": [{"i": i, "no": e[0], "label": e[1], "est": e[2]} for i, e in enumerate(toc_entries)],
        "keys": ([("intro", m["intro"]["title"])]
                 + [("sec", s["title"]) for s in secs]
                 + [("tail", ft_title_for_meta(m))]
                 + [("tail", U["faq"])]
                 + ([("tail", m["conclusion"]["title"])] if has_concl else [])),
    }

    def pnum(no):
        """뒷섹션 제목 앞에 붙는 작은 번호 배지."""
        return (f'<span class="sec-no-sm" style="background:linear-gradient(135deg,{g1},{g2})">{no:02d}</span>')

    # 기능 표 + 차트들
    ft = m["feature_table"]
    thead = "".join(f"<th>{esc(h)}</th>" for h in ft["head"])
    trows = ""
    for r in ft["rows"]:
        tds = "".join(f"<td>{esc(c)}</td>" for c in r)
        trows += f"<tr>{tds}</tr>"
    charts = list(m["charts"].values())
    chart_blocks = f'<div class="panel">{bar_chart(charts[1])}</div>'
    if len(charts) > 2:
        chart_blocks += f'<div class="panel">{donut_chart(charts[2])}</div>'
    table_page = f"""
    <section class="page">
      {header(aud,C.UI['summary'])}
      <div class="panel">
        <div class="panel-title" style="color:{p}">{pnum(no_table)}📋 {esc(ft['title'])}</div>
        <table class="ftable"><thead style="background:{p}"><tr>{thead}</tr></thead><tbody>{trows}</tbody></table>
      </div>
      {chart_blocks}
      {footer(aud,title)}
    </section>"""

    # FAQ + 체크리스트
    faq = "".join(f"""
      <div class="faq-item">
        <div class="faq-q" style="color:{p}">Q. {md(q)}</div>
        <div class="faq-a">A. {md(a)}</div>
      </div>""" for q, a in m["faq"])
    cl = m["checklist"]
    cl_items = "".join(f'<li><span class="chk" style="border-color:{p}"></span>{md(x)}</li>' for x in cl["items"])
    faq_page = f"""
    <section class="page">
      {header(aud,C.UI['faqpage'])}
      <div class="panel">
        <div class="panel-title" style="color:{p}">{pnum(no_faq)}{C.UI["faq"]}</div>
        {faq}
      </div>
      <div class="panel" style="background:{t['soft']}">
        <div class="panel-title" style="color:{p}">✅ {esc(cl['title'])}</div>
        <ul class="checklist">{cl_items}</ul>
      </div>
      {footer(aud,title)}
    </section>"""

    # 뒷표지
    back = f"""
    <section class="page cover" style="background:linear-gradient(135deg,{g2},{g1})">
      <div class="cover-mid" style="justify-content:center">
        <img class="cover-char" style="width:170px" src="{CHAR_URI}"/>
        <h2 style="color:#fff;font-size:26px;margin:14px 0 6px">{esc(C.UI["closing"])}</h2>
        <p style="color:#ffffffcc;font-size:14px">{esc(C.UI["closing_sub"])}</p>
        <div class="back-contact">
          <div>🌐 {esc(C.SITE)}</div>
          <div>📞 1644-0561 · ✉ support@mangoi.co.kr</div>
        </div>
      </div>
    </section>"""

    concl = build_conclusion(aud, no_concl) if m.get("conclusion") else ""
    body = cover + intro_page + toc_html + "".join(sec_pages) + table_page + faq_page + concl + back
    return (PAGE_TMPL.replace("__BODY__", body).replace("__ACC__", acc).replace("__P__", p)
            .replace("__FONTCSS__", getattr(C, "FONT_CSS", "'Malgun Gothic','맑은 고딕',sans-serif")))


def build_conclusion(aud, no=None):
    t = C.THEMES[aud]; m = C.MANUALS[aud]; c = m["conclusion"]
    p, acc = t["primary"], t["accent"]; g1, g2 = t["grad"]
    flow = "".join(
        f'<div class="flow-item"><span class="flow-stage" style="background:linear-gradient(135deg,{g1},{g2})">{esc(stg)}</span>'
        f'<span class="flow-act">{md(act)}</span></div>'
        for stg, act in c["flow"])
    princ = "".join(f'<li><span class="pnum" style="background:{p}">{i+1}</span><span>{md(x)}</span></li>'
                    for i, x in enumerate(c["principles"]))
    remem = "".join(f'<li><span class="rdot" style="background:{acc}"></span><span>{md(x)}</span></li>' for x in c["remember"])
    return f"""
    <section class="page">
      {header(aud, C.UI['concl_page'])}
      <div class="intro-hero" style="background:{t['soft']}">
        <div class="intro-badge" style="background:{p}">{('%02d · ' % no) if no else ''}🏁 {esc(C.UI['concl_page'])}</div>
        <h2 style="color:{p}">{esc(c['title'])}</h2>
        <p class="intro-body">{md(c['lead'])}</p>
      </div>
      <div class="panel">
        <div class="panel-title" style="color:{p}">{esc(C.UI['concl_flow'])}</div>
        <div class="sflow">{flow}</div>
      </div>
      <div class="concl-cols">
        <div class="panel" style="flex:1">
          <div class="panel-title" style="color:{p}">{esc(C.UI['concl_principles'])}</div>
          <ol class="princ">{princ}</ol>
        </div>
        <div class="panel" style="flex:1;background:{t['soft']}">
          <div class="panel-title" style="color:{p}">{esc(C.UI['concl_remember'])}</div>
          <ul class="remem">{remem}</ul>
        </div>
      </div>
      <div class="closing-box" style="background:linear-gradient(135deg,{g1},{g2})">
        <img src="{CHAR_URI}" class="closing-char"/>
        <div class="closing-text">{md(c['closing'])}</div>
      </div>
      {footer(aud, C.COVERS[aud][0])}
    </section>"""

def header(aud, section):
    t = C.THEMES[aud]
    return f"""<div class="rhead">
      <div class="rhead-l"><span class="dot" style="background:{t['primary']}"></span>{esc(C.BRAND["name"])} {esc(t['label'])} {esc(C.UI["guide_of"])}</div>
      <div class="rhead-r" style="color:{t['primary']}">{esc(section)}</div>
    </div>"""

_page_counter = {}
def footer(aud, title):
    return f"""<div class="rfoot"><span>{esc(title)}</span><span>MANGOI · {esc(C.SITE)}</span></div>"""

PAGE_TMPL = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body { font-family:__FONTCSS__; color:#1E2340; }
.page { width:210mm; min-height:297mm; padding:16mm 15mm 14mm; position:relative; page-break-after:always; overflow:hidden; }
.page:last-child { page-break-after:auto; }
/* 표지 */
.cover { padding:0; display:flex; flex-direction:column; color:#fff; }
.cover-top { padding:20mm 18mm 0; }
.cover-badge { display:inline-block; background:#ffffff2e; color:#fff; padding:7px 16px; border-radius:999px; font-weight:800; font-size:13px; letter-spacing:2px; backdrop-filter:blur(4px); }
.cover-mid { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 18mm; }
.cover-eyebrow { color:#ffffffcc; font-weight:700; letter-spacing:4px; font-size:14px; margin-bottom:10px; }
.cover-title { font-size:44px; font-weight:900; line-height:1.15; text-shadow:0 3px 14px rgba(0,0,0,.18); }
.cover-sub { font-size:17px; color:#ffffffe6; margin-top:12px; font-weight:600; }
.cover-char { width:230px; margin-top:26px; filter:drop-shadow(0 14px 30px rgba(0,0,0,.28)); }
.cover-foot { display:flex; justify-content:space-between; padding:0 18mm 18mm; font-size:13px; color:#ffffffdd; font-weight:600; }
.cover-deco { position:absolute; border-radius:50%; background:#ffffff1c; }
.d1 { width:340px; height:340px; top:-120px; right:-90px; }
.d2 { width:220px; height:220px; bottom:40px; left:-80px; background:#ffffff14; }
.d3 { width:120px; height:120px; top:120px; left:40px; background:#ffffff12; }
/* 러닝 헤더/푸터 */
.rhead { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #EEF1F7; padding-bottom:8px; margin-bottom:14px; font-size:12px; }
.rhead-l { font-weight:800; color:#475569; display:flex; align-items:center; }
.dot { width:9px; height:9px; border-radius:50%; display:inline-block; margin-right:8px; }
.rhead-r { font-weight:800; }
.rfoot { position:absolute; bottom:8mm; left:15mm; right:15mm; display:flex; justify-content:space-between; font-size:10.5px; color:#94A3B8; border-top:1px solid #EEF1F7; padding-top:6px; }
/* 소개 */
.intro-hero { border-radius:18px; padding:22px 24px; position:relative; margin-bottom:16px; }
.intro-badge { display:inline-block; color:#fff; font-weight:800; font-size:12.5px; padding:5px 14px; border-radius:999px; margin-bottom:10px; }
.intro-hero h2 { font-size:24px; font-weight:900; margin-bottom:10px; }
.intro-body { font-size:13.5px; line-height:1.85; color:#334155; }
.hl-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
.hl-card { display:flex; gap:12px; align-items:center; background:#fff; border:1.5px solid #EEF1F7; border-radius:14px; padding:14px 16px; }
.hl-ico { width:46px; height:46px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:24px; flex:none; }
.hl-t { font-weight:800; font-size:14px; }
.hl-d { font-size:12px; color:#64748B; margin-top:3px; line-height:1.4; }
/* 섹션 */
.sec { border:1.5px solid #EEF1F7; border-radius:16px; padding:16px 18px; margin-bottom:14px; break-inside:avoid; background:#fff; }
.sec-head { display:flex; align-items:center; gap:14px; margin-bottom:12px; }
.sec-no { color:#fff; font-weight:900; font-size:17px; width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex:none; }
.sec-title { font-size:17px; font-weight:900; }
.sec-sub { font-size:12.5px; color:#64748B; margin-top:2px; }
.sec-desc { font-size:12.7px; line-height:1.7; color:#475569; margin:-4px 0 12px; background:#F8FAFC; border-left:3px solid #CBD5E1; padding:9px 13px; border-radius:0 10px 10px 0; }
.sec-body { display:flex; gap:16px; }
.sec-left { flex:1.02; }
.sec-right { flex:1; }
.points { border:1.5px solid; border-radius:12px; padding:9px 13px; margin-top:10px; font-size:12px; line-height:1.5; }
.points > b { display:block; margin-bottom:4px; font-size:12px; }
.points ul { margin:0; padding-left:16px; color:#334155; }
.points li b { color:inherit; }
.points li { margin:3px 0; }
.note { margin-top:9px; border:1.5px dashed #F59E0B; background:#FFFBEB; border-radius:12px; padding:8px 12px; font-size:11.5px; line-height:1.55; color:#92670A; }
.note b { color:#B45309; }
.shot-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.gcell { position:relative; }
.gcell img { width:100%; border-radius:9px; border:1.5px solid #E2E8F0; box-shadow:0 4px 12px rgba(30,35,64,.10); }
.gcell span { position:absolute; left:6px; bottom:6px; background:#0f172acc; color:#fff; font-size:9.5px; font-weight:700; padding:2px 7px; border-radius:6px; }
.steps { list-style:none; }
.steps li { display:flex; gap:9px; align-items:flex-start; margin:8px 0; font-size:12.7px; line-height:1.55; color:#334155; }
.stepnum { color:#fff; font-weight:800; font-size:11px; width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1px; }
.tip { margin-top:10px; border:1.5px solid; border-radius:12px; padding:10px 13px; font-size:12px; line-height:1.6; color:#334155; }
.shot { width:100%; border-radius:12px; border:1.5px solid #E2E8F0; box-shadow:0 8px 22px rgba(30,35,64,.12); }
/* ── 기능 1개 = 1페이지 레이아웃 (2026-07-28 그래픽 강화) ── */
.sec-page .sec { margin-bottom:0; padding:18px 20px 20px; height:238mm; box-sizing:border-box; display:flex; flex-direction:column; overflow:hidden; }
.sec-page .sec-body { display:flex; flex-direction:column; flex:1 1 auto; gap:12px; min-height:0; }
.sec-page .steps { flex:none; }
.sec-page .steps li { font-size:13.4px; margin:9px 0; line-height:1.6; }
.sec-page .sec-shot { flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
.sec-page .sec-shot .shot { width:auto; max-width:100%; max-height:100%; }
.sec-page .sec-shot .shot-grid { width:100%; }
.sec-page .sec-desc { font-size:13.2px; }
.sec-page .pt-card { font-size:12.3px; }
.sec-page .note, .sec-page .tip { font-size:12.2px; }
.sec-tag { margin-left:auto; font-size:10.5px; font-weight:800; padding:5px 11px; border-radius:999px; letter-spacing:.3px; flex:none; }
/* 🧭 스텝 플로우 다이어그램 */
.sflow-wrap { margin:0 0 14px; }
.sflow-lb { font-size:11px; font-weight:900; letter-spacing:.6px; margin-bottom:7px; }
.sflow { display:flex; flex-wrap:wrap; align-items:center; gap:6px 5px; }
.sflow-chip { display:inline-flex; align-items:center; gap:6px; border:1.5px solid; border-radius:999px; padding:4px 12px 4px 4px; }
.sflow-n { color:#fff; font-weight:900; font-size:10px; width:19px; height:19px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; }
.sflow-t { font-size:11.8px; font-weight:700; color:#334155; white-space:nowrap; }
.sflow-arw { font-size:15px; font-weight:900; line-height:1; }
/* ✅ 핵심 포인트 카드 그리드 */
.pt-wrap { margin-top:13px; }
.pt-lb { font-size:11px; font-weight:900; letter-spacing:.6px; margin-bottom:6px; }
.pt-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
.pt-card { display:flex; gap:8px; align-items:flex-start; border:1.5px solid; border-radius:11px; padding:8px 11px; font-size:11.8px; line-height:1.5; color:#334155; }
.pt-ic { color:#fff; font-size:9.5px; font-weight:900; width:17px; height:17px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1px; }
/* ⚠️💡 알아두기 · 꿀팁 나란히 */
.nt-row.nt-two { display:grid; grid-template-columns:1fr 1fr; gap:9px; align-items:start; }
.nt-row.nt-two .note, .nt-row.nt-two .tip { margin-top:11px; }
/* 화면 캡처 — 한 페이지를 쓰므로 더 크게 */
.sec-page .sec-body { gap:18px; }
.sec-page .sec-left { flex:1; }
.sec-page .sec-right { flex:1.16; }
.sec-page .shot { box-shadow:0 10px 26px rgba(30,35,64,.16); }
.shot.noimg { aspect-ratio:16/10; display:flex; align-items:center; justify-content:center; background:#F1F5F9; color:#94A3B8; }
/* 패널/표/차트 */
.panel { border:1.5px solid #EEF1F7; border-radius:16px; padding:18px 20px; margin-bottom:14px; background:#fff; break-inside:avoid; }
.panel-title { font-size:15px; font-weight:900; margin-bottom:12px; }
.ftable { width:100%; border-collapse:collapse; font-size:12.3px; overflow:hidden; border-radius:10px; }
.ftable th { color:#fff; padding:10px 12px; text-align:left; font-weight:800; }
.ftable td { padding:9px 12px; border-bottom:1px solid #EEF1F7; color:#334155; }
.ftable tbody tr:nth-child(even) { background:#F8FAFC; }
/* faq/체크 */
.faq-item { padding:11px 0; border-bottom:1px dashed #E2E8F0; }
.faq-q { font-weight:800; font-size:13.5px; margin-bottom:5px; }
.faq-a { font-size:12.7px; color:#475569; line-height:1.65; }
.checklist { list-style:none; }
.checklist li { display:flex; align-items:center; gap:11px; padding:9px 0; font-size:13.5px; color:#334155; font-weight:600; border-bottom:1px dashed #E2E8F0; }
.chk { width:18px; height:18px; border:2.5px solid; border-radius:6px; flex:none; }
.back-contact { margin-top:22px; background:#ffffff22; border-radius:14px; padding:14px 22px; color:#fff; font-size:13.5px; font-weight:600; line-height:2; }
/* 마무리(결론) 페이지 */
.flow { display:flex; flex-direction:column; gap:5px; }
.flow-item { display:flex; align-items:stretch; gap:10px; break-inside:avoid; }
.flow-stage { color:#fff; font-weight:800; font-size:10.8px; min-width:116px; max-width:116px; display:flex; align-items:center; justify-content:center; text-align:center; padding:5px 7px; border-radius:8px; line-height:1.2; }
.flow-act { flex:1; display:flex; align-items:center; font-size:11.6px; line-height:1.42; color:#334155; background:#F8FAFC; border:1px solid #EEF1F7; border-radius:8px; padding:5px 11px; }
.concl-cols { display:flex; gap:14px; }
.princ { list-style:none; }
.princ li { display:flex; gap:8px; align-items:flex-start; margin:6px 0; font-size:11.7px; line-height:1.42; color:#334155; }
.pnum { color:#fff; font-weight:800; font-size:10.5px; width:19px; height:19px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:none; margin-top:1px; }
.remem { list-style:none; }
.remem li { display:flex; gap:8px; align-items:flex-start; margin:6px 0; font-size:11.2px; line-height:1.42; color:#334155; }
.rdot { width:8px; height:8px; border-radius:50%; flex:none; margin-top:5px; }
.closing-box { display:flex; align-items:center; gap:16px; border-radius:14px; padding:13px 20px; margin-top:11px; break-inside:avoid; }
.closing-char { width:78px; flex:none; filter:drop-shadow(0 8px 18px rgba(0,0,0,.25)); }
.closing-text { color:#fff; font-size:12.2px; line-height:1.6; font-weight:600; }
/* 차례(목차) */
.toc-cols { display:flex; gap:18px; }
.toc-col { flex:1; min-width:0; }
.toc-row { display:flex; align-items:center; gap:8px; padding:4.5px 0; border-bottom:1px dotted #E2E8F0; }
.toc-no { color:#fff; font-weight:900; font-size:10px; min-width:24px; height:19px; border-radius:6px; display:flex; align-items:center; justify-content:center; flex:none; }
.toc-no-plain { background:transparent !important; font-size:15px; }
.toc-t { font-size:11.5px; color:#334155; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.toc-dots { flex:1; border-bottom:1px dotted #CBD5E1; margin:0 4px 4px; min-width:8px; }
.toc-p { font-size:11.5px; font-weight:800; flex:none; }
/* 뒷섹션 제목 앞 작은 번호 배지 */
.sec-no-sm { color:#fff; font-weight:900; font-size:11px; min-width:26px; height:20px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; margin-right:7px; vertical-align:middle; }
</style></head><body>__BODY__</body></html>"""

if __name__ == "__main__":
    suffix = getattr(C, "OUT_SUFFIX", "")
    outdir = os.path.join(HERE, "build_html" + suffix)
    pdfdir = os.path.join(HERE, "build_pdf" + suffix)
    os.makedirs(outdir, exist_ok=True)
    manifest = []
    for aud in list(C.MANUALS.keys()):
        html_str = build(aud)
        path = os.path.join(outdir, f"{aud}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(html_str)
        manifest.append({"aud": aud, "html": path,
                         "pdf": os.path.join(pdfdir, C.FILENAMES[aud] + ".pdf"),
                         "toc": TOC_META.get(aud, {})})
        print("HTML", aud, len(html_str)//1024, "KB ->", path)
    with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)
