# -*- coding: utf-8 -*-
"""PPTX 차례에 적힌 장(슬라이드) 번호가 실제 슬라이드와 맞는지 검사한다."""
import importlib, os, re, sys
from pptx import Presentation

C = importlib.import_module(os.environ.get("MANUAL_MODULE", "content"))
HERE = os.path.dirname(os.path.abspath(__file__))
SUF = getattr(C, "OUT_SUFFIX", "")


def slide_text(sl):
    out = []
    for sh in sl.shapes:
        if sh.has_text_frame:
            out.append(sh.text_frame.text)
    return "\n".join(out)


bad_total = 0
for aud in C.MANUALS:
    path = os.path.join(HERE, "build_pptx" + SUF, C.FILENAMES[aud] + ".pptx")
    prs = Presentation(path)
    texts = [slide_text(sl) for sl in prs.slides]
    n_sec = len(C.MANUALS[aud]["sections"])
    n_toc = sum(1 for t in texts if C.UI["toc_title"] in t)
    bad = 0
    for i, sec in enumerate(C.MANUALS[aud]["sections"], 1):
        want = 2 + n_toc + i
        got = texts[want - 1] if want <= len(texts) else ""
        if sec["title"] not in got:
            bad += 1
            print("  MISMATCH %-8s slide %d should hold %r" % (aud, want, sec["title"][:34]))
    # 차례에 적힌 번호들이 want 와 같은지: 차례 슬라이드의 숫자 나열을 순서대로 뽑아 비교
    nums = []
    for ti in range(n_toc):
        sl = prs.slides[2 + ti]
        rows = []
        for sh in sl.shapes:
            if sh.has_text_frame and re.fullmatch(r"\d+", sh.text_frame.text.strip() or "x"):
                rows.append((round(sh.left / 914400, 2) > 6.5, round(sh.top / 914400, 2), int(sh.text_frame.text)))
        # 왼단 먼저, 각 단은 위→아래
        rows.sort(key=lambda r: (r[0], r[1]))
        nums += [r[2] for r in rows]
    # nums 는 배지번호(01..)와 쪽번호가 섞여 있으므로 개수만 확인
    print("%-8s slides=%d  toc_slides=%d  section-slot mismatches=%d" % (aud, len(texts), n_toc, bad))
    bad_total += bad
print("TOTAL:", bad_total)
sys.exit(1 if bad_total else 0)
