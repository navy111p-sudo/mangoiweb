# mangoi_Speech 패치 — 🇨🇳 중국어 카드 추가

## 무엇을 하는 건가요?

`https://mangoi-speech.pages.dev/practice` 의 **레벨 선택** 영역(Phonics / BTS / SIU)에
**🇨🇳 中文 (Lv 1~20)** 카드를 추가합니다. 클릭하면 우리 mangoiweb 의
`speech-coach-cn.html` (다락원 마스터 + Lv 1~20) 로 즉시 이동합니다.

## 어디를 수정하나요?

이 패치는 `navy111p-sudo/mangoi_Speech` GitHub repo 의 `js/category-ui.js` 한 파일만
교체합니다. HTML 은 건드리지 않으므로 기존 디자인·로직에 영향 없음.

## 어떻게 적용하나요?

### 방법 A — 자동 (권장)
1. **Git for Windows** 설치 확인 (https://git-scm.com) — 이미 있으면 OK
2. 이 폴더에서 **`apply-and-push.bat`** 더블클릭
3. clone → 패치 → commit → push 자동 진행
4. 1~2분 후 Cloudflare Pages 자동 빌드 → 사이트 반영

### 방법 B — GitHub 웹에서 수동 편집
1. 브라우저로 접속:
   https://github.com/navy111p-sudo/mangoi_Speech/edit/main/js/category-ui.js
2. 이 폴더의 `category-ui.js` 내용을 통째로 복사 → 붙여넣기
3. 하단 "Commit changes" 버튼 → commit
4. Cloudflare Pages 자동 배포

## 무엇이 바뀌나요? (Diff 요약)

```js
// 기존 categories (3개)
var categories = [
  {id: "cat-phonics", label: "Phonics (Level 0)", ...},
  {id: "cat-bts",     label: "BTS (Level 1~8)",   ...},
  {id: "cat-siu",     label: "SIU",               ...}
];

// 신규 categories (4개) ← 중국어 추가
var categories = [
  {id: "cat-phonics", label: "Phonics (Level 0)", ...},
  {id: "cat-bts",     label: "BTS (Level 1~8)",   ...},
  {id: "cat-siu",     label: "SIU",               ...},
  {id: "cat-zh",      label: "🇨🇳 中文 (Lv 1~20)",
                      color: "#dc2626",
                      external: true,
                      url: "https://webrtc-unified-platform.navy111p.workers.dev/speech-coach-cn.html",
                      badge: "NEW"}
];
```

추가된 로직:
- `selectCategory()` 함수 맨 앞에 `if (cat.external && cat.url) { window.location.href = cat.url; return; }` 한 줄 추가
- 버튼 생성 시 `cat.badge` 가 있으면 우상단에 노란색 "NEW" 배지 출력

## 왜 외부 링크인가요?

mangoi_Speech repo 는 영어 발음 평가용 Flutter/JS 엔진(Pronunciation/Grammar/Fluency 4점수)을
중심으로 만들어져 있고, 중국어는 별도의 STT(zh-CN) + 다락원 커리큘럼 데이터를 쓰는
완전히 다른 페이지(`speech-coach-cn.html`)로 이미 우리 mangoiweb 에 구현되어 있습니다.
같은 화면에 중국어 옵션도 노출하되, 클릭 시 적합한 페이지로 보내는 게 가장 합리적이라고
판단했습니다.

## 롤백하려면?

`apply-and-push.bat` 으로 한 번 더 푸시하기 전이면 GitHub UI 에서 commit revert 가능:
https://github.com/navy111p-sudo/mangoi_Speech/commits/main
