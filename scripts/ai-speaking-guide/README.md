# AI 말하기 사용 안내서 — PDF·Word 만들기

AI 말하기 화면(`/ai-speaking.html`)의 «사용 안내» 버튼이 여는 안내서의 **내려받기 파일**을 만듭니다.

| 원본(웹 페이지) | 만들어지는 파일 (`cloudflare-deploy/public/guide/ai-speaking/`) |
|---|---|
| `ai-speaking-guide.html` (한 장 · 초등 눈높이) | `AI-Speaking-OnePage_{KO,EN}.{pdf,docx}` — **A4 1쪽** |
| `ai-speaking-guide-full.html` (자세한 판 · 원장님용) | `AI-Speaking-Guide_{KO,EN}.{pdf,docx}` |

## 언제 돌리나

안내서 HTML·CSS 문구를 고쳤으면 **반드시 다시 만들어 함께 커밋**하세요 —
안 그러면 화면과 내려받은 PDF·Word 가 서로 다른 말을 합니다.

```bash
node scripts/ai-speaking-guide/build.js
```

## 필요한 것

- Node + Playwright(Chromium) — 전역 설치면 `NODE_PATH=$(npm root -g)` 를 앞에 붙이세요
- `pandoc` (Word), `python3` + `python-docx` (Word 글꼴·여백 템플릿)
- 한글 글꼴 하나(맑은 고딕·IBM Plex Sans KR 등) — 없으면 PDF 글자가 깨집니다

## 알아 둘 것

- 페이지가 `/img`·`/css` 같은 **사이트 절대 경로**를 써서 `file://` 로는 안 열립니다 → 빌드가 `public/` 을 작은 로컬 서버로 엽니다.
- **한 장 판 PDF 가 1쪽을 넘으면 빌드가 실패**합니다. 글자를 늘렸으면 줄이세요(영어판은 인쇄 글자를 조금 작게 해 두었습니다 — `css/ai-speaking-guide-onepage.css` 인쇄 절).
- Word 는 webp 를 못 읽어서 그림을 PNG 로 바꿔 넣고, 화면 사진은 번호가 찍힌 채로 캡처해 넣습니다.
- 감시: `test-harness/ai_speaking_guide_harness.mjs` (파일이 있는가 · 한 장 판 1쪽 · 교정 설명이 화면 버튼과 같은가 · 버튼 배선 실행).
