# -*- coding: utf-8 -*-
"""차례(목차)의 쪽번호를 '실제 렌더 결과'로 채운다.

build_pdf.py 는 차례 쪽번호 자리에 `@@P{i}@@` 자리표시자를 넣는다.
1차 렌더된 PDF에서 각 항목의 실제 쪽을 찾아 HTML을 고친 뒤 다시 렌더하면
쪽번호가 정확해진다. (숫자 폭 차이는 차례 페이지 안에서만 생기므로 재쪽매김이 없다)

  python build_pdf.py            # 1차 HTML
  node   pdf_convert.js          # 1차 PDF
  python finalize_pdf.py         # 자리표시자 → 실제 쪽번호
  node   pdf_convert.js          # 최종 PDF
"""
import io, json, os, re, sys
import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
SUFFIX = os.environ.get("MANUAL_SUFFIX", "")
HTMLDIR = os.path.join(HERE, "build_html" + SUFFIX)


def find_page(doc, needle, start=0):
    """needle 이 처음 등장하는 쪽(1-based). 못 찾으면 None."""
    if not needle:
        return None
    probe = needle.strip()
    for cut in (probe, probe[:24], probe[:14]):
        if not cut:
            continue
        for i in range(start, doc.page_count):
            if doc[i].search_for(cut):
                return i + 1
    return None


def main():
    man_path = os.path.join(HTMLDIR, "manifest.json")
    manifest = json.load(io.open(man_path, encoding="utf-8"))
    total_fixed = total_est = 0
    for m in manifest:
        toc = m.get("toc") or {}
        entries, keys = toc.get("entries") or [], toc.get("keys") or []
        if not entries:
            continue
        if not os.path.exists(m["pdf"]):
            print("SKIP (no pdf yet)", m["aud"]); continue
        doc = fitz.open(m["pdf"])
        # 차례 페이지 자체를 건너뛰고 찾는다 (차례에도 같은 제목이 적혀 있으므로)
        after_toc = 3 + int(toc.get("n_toc", 1))     # 표지1 + 소개1 + 차례N → 첫 섹션 쪽
        html = io.open(m["html"], encoding="utf-8").read()
        fixed = est = 0
        cursor = after_toc
        for e, (kind, key) in zip(entries, keys):
            if kind == "intro":
                pg = 2
            else:
                pg = find_page(doc, key, start=cursor - 1)
                if pg:
                    cursor = pg           # 목차 순서 = 문서 순서이므로 앞으로만 진행
            if pg:
                fixed += 1
            else:
                pg = e["est"]; est += 1
            html = html.replace("@@P%d@@" % e["i"], str(pg))
        doc.close()
        leftover = len(re.findall(r"@@P\d+@@", html))
        io.open(m["html"], "w", encoding="utf-8").write(html)
        print("TOC %-8s pages=%d  found=%d  estimated=%d  leftover=%d"
              % (m["aud"], fitz.open(m["pdf"]).page_count if os.path.exists(m["pdf"]) else 0,
                 fixed, est, leftover))
        total_fixed += fixed; total_est += est
    print("DONE  found=%d estimated=%d" % (total_fixed, total_est))


if __name__ == "__main__":
    main()
