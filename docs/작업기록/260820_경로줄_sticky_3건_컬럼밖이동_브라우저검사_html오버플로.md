# 경로 줄(#mi-crumb) 3건 — 컬럼 밖으로 옮겨 sticky 살리기 · 화면에 그려서 재는 검사 신설 · ≤900px 에서 `html{overflow-x:hidden}` 이 sticky 를 죽이던 것

- 날짜: 2026-08-20
- 작업자: 사장님(navy111p) + Claude Code
- 브랜치 / PR:
  - PR **#386** `claude/vertical-line-display-issue-emejvu` — 병합·배포 완료 (`0b8967e`, 배포 run #2584 success)
  - PR **#393** 같은 브랜치(머지 후 main 에서 새로 시작) — 검사 신설 + ≤900px 수리

---

## 1. 왜 했나

사장님 제보(스크린샷 2장):

> 「화면 맨 위에 있는 세로줄이 어떨 때는 나타나고 어떨 때는 나타나지 않아.
> **관리자 자료실에는 나타나고 강사나 기타 다른 자료실을 클릭하면 사라져.**
> 여기뿐만 아니라 다른 곳들도 어떤 자식이나 손자 메뉴를 클릭하면 안 나타난다.」

여기서 「세로줄」은 본문 맨 위의 **경로 줄**(`#mi-crumb` — `← 뒤로 · 🏠 홈 · 시스템 › 자료실`)입니다.
2026-08-19 에 「관리자 화면에는 뒤로도 홈도 없다」는 지시로 만든 그 줄입니다.

🔴 **이 버그가 났을 때 타입체크·회귀 하니스 211개·CI 배포 게이트가 전부 초록불이었습니다.**
그 사실이 이 작업의 절반(②번)을 만들었습니다.

---

## 2. 무엇을 바꿨나

### ① 경로 줄을 `.admin-layout` 밖으로 (PR #386)

- `cloudflare-deploy/public/admin.html`
  - `<style id="mi-crumb-css">` + `<div id="mi-crumb">` 블록을 `#admin-main-scale` 안에서
    **`<body>` 직속**(`.admin-layout` 바로 앞)으로 옮김
  - ≤920px 에서만 컬럼의 오른쪽 12px 여백을 맞추는 `margin-right` 한 줄 추가
  - 왜 밖에 두는지·되돌리면 안 되는 이유를 그 자리에 주석으로 남김

### ② 화면에 그려서 좌표를 재는 검사 (PR #393)

- **새 파일** `test-harness/manual/crumb-sticky-browser.mjs` (29건)
  - 사이드바 항목 43개 × (누른 직후 · 맨 아래까지 굴린 뒤) 줄이 `top≈0` 인가
  - 「자료실」 손자 5개 — 줄이 붙어 있는가 + 카드 제목이 줄에 안 가리는가
  - 폭 6가지(1920·1440·1024·1023·768·390) — 줄의 왼쪽·너비가 본문 컬럼과 같은가 / 굴린 뒤에도 붙어 있는가
  - 폭 5가지 — 가로 넘침이 없는가
  - 정적 서버를 스스로 띄웠다 내림. 준비물(playwright-core·Chromium)이 없으면 «건너뜀»

### ③ ≤900px 수리 (PR #393)

- `cloudflare-deploy/public/css/admin-inline-c.css` (`@media (max-width:900px)` 「대시보드 가로 잘림 방지」)
  - `html, body { overflow-x: hidden !important; max-width: 100vw !important; }`
    → `body { overflow-x: hidden !important; }` + `html, body { max-width: 100vw !important; }`
- `cloudflare-deploy/public/admin.html`
  - 2026-08-19 에 넣었던 `@media(max-width:900px){ html body{overflow-x:clip !important} }` **삭제**
    (효과가 0 이었음 — 아래 3장 참고). 자리에 «왜 안 됐는지» 주석
  - `admin-inline-c.css?v=39` → **`?v=40`**

---

## 3. 왜 그렇게 풀었나 — 검토했다가 버린 방법

### ①번 — 원인은 「손자 메뉴」가 아니라 「sticky 의 부모 상자」

`position:sticky` 는 **자기 부모 상자 안에서만** 붙어 있을 수 있습니다. 부모 바닥이 화면 위로
올라가면 sticky 요소도 함께 끌려 올라갑니다.

그런데 **카드 87장 중 14장이 `#admin-main-scale` 밖**에 있었습니다(`.admin-layout` 은
`admin.html:9378` 에서 닫히는데, 그 카드들은 10563줄 이후 `<body>` 직속):

```
card-payments-b2b / b2c · card-report-forms · card-notice-board · card-timetable
card-lesson-log · card-gallery · card-homework · card-school-attendance-stats
card-lib-admin / teacher / branch / agency / student   ← 신고 지점
```

실측(1920×1080, 고치기 전):

| 상태 | 부모 상자 바닥 | 줄 top | 결과 |
|---|---|---|---|
| 「자료실」 ▸ 1 관리자 자료실 | 54 | −13 | 13px 잘린 채 겨우 보임 |
| ▸ 2 강사 자료실 | −246 | **−463** | 사라짐 |
| ▸ 5 학생·학부모 자료실 | − | **−1216** | 사라짐 |
| 「회계」(카드가 컬럼 안) + 800px 스크롤 | 1113 | 0 | 정상 |

즉 **손자를 눌러서가 아니라 «그 카드가 문서 어디에 있느냐»** 가 전부였습니다.
그 14장에 해당하는 메뉴는 손자를 안 눌러도 마우스로 조금만 내리면 똑같이 사라졌습니다.

**⛔ 버린 방법 A — 그 14장을 컬럼 안으로 옮기기(뿌리 해결).**
`adm-ia6.js` 의 `fitTail()` 이 꼬리 여백을 «`#legacy-cards` 안이 아니라 body 맨 끝»에 붙이는
이유가 **바로 그 14장**입니다(그 파일 주석: 「실측으로 밟은 함정 — 수업 일지 326px 남음」).
즉 그 구조를 전제로 만든 코드가 이미 있어서 함께 손봐야 하고, 1.3MB 파일에 700줄짜리
diff 가 생깁니다. **이득 대비 사고 반경이 안 맞습니다.**

**⛔ 버린 방법 B — `#mi-crumb` 을 `position:fixed` 로.**
`body{zoom:1.3}` 이라 좌표계가 어긋나고, 흐름에서 빠져 아래 내용이 줄 밑으로 올라탑니다.

**✅ 택한 것 — `<body>` 직속으로 옮기기.**
부모 상자가 «문서 전체» 라 어디까지 내려가도 붙습니다. 그리고 **왼쪽 위치·폭을 손으로 맞출
필요가 없습니다** — 컬럼을 오른쪽으로 미는 것이 body 자신의 padding
(PC `24px 24px 24px 312px` · 모바일 0)이라, body 직속이면 `.admin-layout` 과 저절로 같은
자리가 되고 사이드바를 접어도 함께 움직입니다.

### ②번 — 왜 검사를 «문자열» 이 아니라 «좌표» 로 만들었나

CLAUDE.md 2장에 같은 뿌리의 함정이 이미 여럿 있습니다 — 도크 모달이 드로어 밑에 깔린 것,
카드는 열렸는데 그 칸으로 화면이 안 간 것, 교재 페이지 창이 「보이는데 안 눌리는」 것.
전부 **「열렸다」와 「보인다」는 다르다** 는 같은 이야기이고, 문자열을 찾는 검사로는 하나도
못 잡습니다. 이번에도 게이트가 전부 초록인 채로 사장님 화면에서만 틀렸습니다.

**⛔ 버린 방법 — `*_harness.mjs` 로 만들어 CI 게이트에 넣기.**
`test-harness/manual/README.md` 에 「파일 이름을 `*_harness.mjs` 로 짓지 말 것 — 게이트가
물어 간다」고 팀 규칙이 적혀 있습니다. playwright 는 이 저장소 의존성이 아니라서 CI 에서
매번 걸립니다. 규칙을 혼자 깨지 않고 `manual/` 규약을 따랐습니다.
⚠️ 그래서 **이 검사는 자동으로 돌지 않습니다.** 경로 줄·sticky·레이아웃을 건드릴 때 사람이
불러야 합니다(4장에 명령 있음).

### ③번 — 범인은 `body` 가 아니라 `html` 이었다

②번 검사가 PC 는 전부 통과인데 390·768·900px 만 FAIL 로 떨어뜨렸습니다
(맨 아래까지 굴린 뒤 줄 top **−1397 · −1152 · −1135**). 901px 이상은 원래부터 정상.

원인은 `@media(max-width:900px)` 의 `html, body{overflow-x:hidden}` 중 **`html` 쪽**입니다.
루트가 스크롤 상자가 되면 body 의 overflow 가 뷰포트로 올라가지 못하고 body 가 자기
스크롤 상자를 갖는데, 실제로 굴러가는 것은 뷰포트라 body 의 `scrollTop` 은 영영 0 입니다.
그 안의 sticky 는 「내 상자는 한 번도 안 굴렀으니 붙을 일도 없다」로 판단해 흘러갑니다.

> 같은 교훈이 `css/mangoi-layout.css` 머리말에 **이미 적혀 있었습니다** —
> 「⛔ html/body 에 overflow-x:hidden 을 걸지 않는다. position:sticky 가 죽는다」.
> 적어 두고도 다른 파일에서 그대로 밟았습니다.

**⛔ 버린 방법 A — 2026-08-19 의 `html body{overflow-x:clip}` (그 자리에 이미 있던 것).**
**선택자가 body 만 가리켜서 효과가 0 이었습니다**(그대로 −1397px). 게다가
`overflow-x: clip` 은 다른 축이 스크롤 값이면 표준에 따라 `hidden` 으로 계산되므로,
**한 축만 clip 으로 바꾸는 방법 자체가 성립하지 않습니다.** 그래서 걷어냈습니다.

**⛔ 버린 방법 B — `:root{overflow-x:clip}` 로 덮기.**
실측으로 안 먹었습니다(A 와 같은 이유). `<style>` 로 주입해 본 후보 3종 전부 실패,
`document.body.style` 인라인만 통했는데 그건 «덮어쓰기 층» 을 하나 더 쌓는 것이라
근본 해결이 아닙니다.

**⛔ 버린 방법 C — `html{overflow-x:visible}` 로 그냥 풀기.**
그 규칙은 2026-07-27 「왼쪽이 잘려 나감」 제보의 대응책입니다. 방어를 없애면 안 됩니다.

**✅ 택한 것 — 잘림 방어를 `body` 에만 남기기.**
html 이 visible 이면 **body 의 overflow 가 뷰포트로 올라가 뷰포트가 대신 자릅니다**
(CSS 표준의 «전파»). 실측으로 모든 폭에서 `scrollWidth ≤ innerWidth` 유지됩니다.

### 🔴 검사 자신의 거짓 실패를 하나 걷어냈다 — 기록해 둘 가치가 있음

②번 검사가 처음엔 **1023px 도 실패**로 보고했습니다. 실제로는 **검사의 착오**였습니다.
`js/adm-welcome.js` 의 «환영 안내»(`#aw-overlay`)가 열릴 때 `html{overflow:hidden}` 을 걸고
**사람이 닫아야만** 푸는데, 빈 브라우저로 열면 그 안내가 계속 떠 있습니다.
→ 검사가 시작 전에 그 안내를 «본 것으로» 표시(`localStorage['mangoi_admin_welcome_v1_done']='1'`)
하고 엽니다. 실제 사용자는 한 번 닫으면 다시 안 뜹니다.

⚠️ **헤드리스로 관리자 화면을 재는 모든 검사에 해당합니다.** 빈 브라우저 = 첫 방문자이고,
첫 방문자에게만 뜨는 오버레이가 스크롤·클릭을 막습니다.

### ③′ 「컬럼 밖 카드 14장」 — 재 보니 할 일이 없었다

「그 14장이 `#admin-main-scale{min-width:0}` 가로넘침 방어를 못 받는다」가 걱정이었는데,
**실제로 재 보니 어느 폭에서도 문서가 옆으로 밀려나지 않았습니다**
(1024·1280·1500·1920px × 메뉴 8개 전부 `scrollWidth − innerWidth = −13`).
유일하게 자기 안에서 가로 스크롤이 생기는 1024px 의 `card-payments-b2b` 는
`details.menu-card{overflow-x:auto}` 로 **의도된 동작**(넓은 표는 카드 «안»에서만 스크롤)입니다.

→ **구조 이동은 하지 않았습니다.**
⚠️ 단, 이 측정은 API 가 없는 로컬 환경이라 표에 실제 행이 거의 없는 상태입니다.
실데이터로 표가 넓어지면 달라질 수 있고, 그때는 **그 카드에만 국소 수리**하는 것이 맞습니다.

---

## 4. 확인한 방법

### 브라우저 검사 (`test-harness/manual/crumb-sticky-browser.mjs`)

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
cd /경로/mangoiweb && PW_DIR=/tmp/pw node test-harness/manual/crumb-sticky-browser.mjs
```

| 시점 | 결과 |
|---|---|
| ≤900px 고치기 **전** | ✅ 26 / ❌ **3** (390·768 + 1023 는 위 «환영 안내» 착오) |
| 고친 **뒤** | ✅ **29 / ❌ 0** |

### 게이트

- `bash test-harness/ci-gates.sh` → **EXIT=0**, 4종 전부 통과 (PASS **192** / SKIP 20 / **FAIL 0**)
- `cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit` → 통과
- 정적자산 `?v=` 197건 통과 (`admin-inline-c.css` v=39 → v=40)

### 배포 (PR #386 분)

- 병합 `0b8967e` → 배포 워크플로 run **#2584 success** (23:38:42 → 23:40:58)

### ⚠️ 사람이 봐야 끝나는 부분

작업 환경 프록시가 `mangoi.ai` 를 막아 **Claude 는 배포된 실제 화면을 못 봅니다.**
로컬에 `public/` 을 그대로 서빙해 렌더한 결과까지가 한계입니다.

---

## 5. 남은 것 / 주의할 것

1. **휴대폰에서 한 번 봐야 합니다** — PR #393 은 `admin-inline-c.css` 를 건드립니다.
   관리자 화면 전체에 걸리는 파일이라, 배포 후 폰에서
   ① 맨 위 「← 뒤로 · 🏠 홈」 줄이 굴려도 따라오는지 ② 화면이 좌우로 안 밀리는지 확인이 필요합니다.
2. **옛 사파리(iOS 15 이하)** — 이번 고침은 `clip` 을 쓰지 않으므로 옛 사파리도 함께 정상입니다
   (2026-08-19 판은 `clip` 에 기대고 있었고, 그 기기에서는 통째로 무시됐습니다).
3. **컬럼 밖 카드 14장** — 지금은 실측으로 문제 없음. 실데이터로 표가 넓어졌을 때 다시 재고,
   문제가 있으면 **구조 이동이 아니라 그 카드에만** 국소 수리할 것.
4. **이 검사는 자동으로 안 돕니다**(`manual/` 규약). 경로 줄·sticky·`overflow`·레이아웃을
   건드리면 위 명령으로 사람이 불러야 합니다.
5. `#mi-crumb` 을 다시 `#admin-main-scale` 안으로 되돌리지 마세요 — 그대로 재발합니다.
