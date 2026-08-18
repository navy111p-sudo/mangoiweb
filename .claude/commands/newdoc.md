---
description: 새로 만든 문서를 docs/INDEX.md 목차에 등록합니다
argument-hint: [문서 경로 — 생략하면 미등록 문서를 전부 찾습니다]
---

대상: $ARGUMENTS

## 1. 미등록 문서 찾기

`docs/` 및 저장소 루트의 문서 파일 중 `docs/INDEX.md` 에서 링크되지 않은 것을 찾으세요.

```bash
python3 - <<'PY'
import os, re, urllib.parse
idx = open('docs/INDEX.md', encoding='utf-8').read()
linked = {urllib.parse.unquote(m) for m in re.findall(r'\]\(([^)]+)\)', idx)}
linked = {os.path.normpath(os.path.join('docs', p)) for p in linked if not p.startswith(('http', '#'))}
exts = ('.md', '.html', '.pdf', '.docx', '.pptx')
for d in ('docs', '.'):
    for f in sorted(os.listdir(d)):
        p = os.path.join(d, f)
        if os.path.isfile(p) and f.endswith(exts) and os.path.normpath(p) not in linked:
            print('미등록:', p)
PY
```

## 2. 목차에 추가

`docs/INDEX.md` 의 **주제에 맞는 절**에 한 줄 추가하세요.
맞는 절이 없으면 새로 만들되, 절을 늘리기보다 기존 절에 넣는 쪽을 먼저 검토하세요.

```markdown
| [파일명.md](파일명.md) | 한 줄 설명 — 「무슨 내용인지」이지 「무슨 제목인지」가 아닙니다 |
```

⚠️ 파일명에 **공백이 있으면 `%20` 으로 바꿔야** 깃허브에서 링크가 열립니다.
한글 파일명 자체는 그대로 써도 됩니다.

## 3. 확인

추가한 뒤 링크가 실제로 열리는지 검사하세요.

```bash
python3 - <<'PY'
import re, os, urllib.parse
txt = open('docs/INDEX.md', encoding='utf-8').read()
bad = [urllib.parse.unquote(m) for m in re.findall(r'\]\(([^)]+)\)', txt)
       if not m.startswith(('http', '#'))
       and not os.path.exists(os.path.normpath(os.path.join('docs', urllib.parse.unquote(m))))]
print('깨진 링크:', bad or '없음')
PY
```
