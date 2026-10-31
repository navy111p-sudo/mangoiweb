# -*- coding: utf-8 -*-
"""차례에 넣은 쪽번호가 '최종 PDF'의 실제 쪽과 같은지 검사한다.

HTML 에 기록된 toc-p 값(=1차 렌더 기준)을 최종 PDF에서 다시 찾은 쪽과 비교한다.
둘이 같아야 1·2차 렌더의 쪽매김이 동일하다는 뜻이다.
"""
import io, json, os, re, sys
import fitz
from finalize_pdf import find_page

HERE = os.path.dirname(os.path.abspath(__file__))
SUFFIX = os.environ.get("MANUAL_SUFFIX", "")
HTMLDIR = os.path.join(HERE, "build_html" + SUFFIX)
ROW = re.compile(r'<span class="toc-p"[^>]*>(\d+)</span>')


def main():
    manifest = json.load(io.open(os.path.join(HTMLDIR, "manifest.json"), encoding="utf-8"))
    bad_total = 0
    for m in manifest:
        toc = m.get("toc") or {}
        if not toc:
            continue
        html = io.open(m["html"], encoding="utf-8").read()
        printed = [int(x) for x in ROW.findall(html)]
        doc = fitz.open(m["pdf"])
        n_toc = int(toc.get("n_toc", 1))
        bad = 0
        cursor = 3 + n_toc
        for idx, ((kind, key), e) in enumerate(zip(toc["keys"], toc["entries"])):
            want = printed[idx] if idx < len(printed) else None
            if kind == "intro":
                got = 2
            else:
                got = find_page(doc, key, start=cursor - 1)   # finalize_pdf 와 동일한 탐색
                if got:
                    cursor = got
            if want != got:
                bad += 1
                print("  MISMATCH %-8s %-30s toc=%s actual=%s" % (m["aud"], key[:30], want, got))
        print("%-8s %-3d pages · entries=%d · mismatches=%d" % (m["aud"], doc.page_count, len(toc["entries"]), bad))
        bad_total += bad
        doc.close()
    print("TOTAL MISMATCHES:", bad_total)
    sys.exit(1 if bad_total else 0)


if __name__ == "__main__":
    main()
