# 망고아이 — Claude 작업 규칙

> 이 파일은 Claude Code가 이 저장소에서 작업할 때 **매번 자동으로 읽는** 규칙서입니다.
> 사람이 읽는 상세 문서는 [MAINTENANCE.md](MAINTENANCE.md)입니다. 작업 전에 함께 참고하세요.
>
> **2인 공동 유지보수 중입니다.** 내 판단만으로 남의 영역을 바꾸지 마세요.

---

## 0. 가장 먼저 알아야 할 것

- **실서비스는 `cloudflare-deploy/` 폴더 하나.** 나머지는 보조·실험·레거시입니다.
- 운영 주소: **https://mangoi.ai** → Cloudflare Worker `webrtc-unified-platform-prod`
  (사장님·직원이 실제로 여는 주소입니다. 사람에게 안내할 링크는 **이 주소**를 쓰세요)
  - **`www.mangoi.ai` 는 `mangoi.ai` 로 넘어갑니다** (2026-08-17 추가 → 같은 날 정본으로 합침).
    `src/index.ts` 진입부가 www 요청을 apex 로 돌립니다(GET/HEAD 는 301, 나머지는 308 — POST 본문 보존).
    **WebSocket 업그레이드는 제외**합니다(화상수업이 끊깁니다). 안내 링크의 정본은 `src/site-url.ts` 의 `SITE_ORIGIN` 한 줄.
    ⚠️ **왜 굳이 합쳤나** — 오리진이 갈리면 브라우저가 두 사이트로 봅니다. 교사 세션 쿠키는 `Domain=` 이 없는
    호스트 전용이고, 학생 로그인(`mangoi_logged_user`·`mango_token`)과 언어(`mangoi_lang`)는 `localStorage` 라
    **오리진별로 갈리는 게 웹 표준이라 공유가 불가능**합니다. 쿠키만 넓혀선 절반만 고쳐집니다.
    안 합치면 「로그인했는데 또 로그인하래요」가 그대로 재현됩니다.
    ⚠️ 호스트명을 그대로 쓰는 코드는 여전히 조심하세요. 패스키가 정확히 그랬고
    (`rpId` 가 달라져 «어제까진 지문으로 됐는데» 가 됩니다), `src/api-passkey.ts` 의 `resolveRpId()` 로 apex 에 묶어
    리다이렉트가 없어도 버티게 해 뒀습니다. 비슷한 코드를 새로 쓸 때 같은 함정을 확인하세요
  - **`test.mangoi.co.kr` 도 같은 Worker 입니다.** 죽은 주소가 아니라 **먼저 붙인 커스텀 도메인**이라,
    아직 여러 곳에 하드코딩돼 있습니다 — `cloudflare-deploy/scripts/smoke-test.ps1` 의 기본 `BaseUrl`(=`deploy.ps1` 의 배포 전/후 스모크 15종),
    `ops/mangoi-watchdog.sh`, 여러 하니스. **그 코드들을 무심코 `mangoi.ai` 로 바꾸지 마세요** —
    워치독·스모크까지 같이 확인해야 하는 별건 작업입니다 (도메인 정리는 사람이 결정)
  - ⏳ **앱 시작 URL 은 `mangoi.ai` 로 옮기는 중입니다** (2026-08-17). 소스는 바꿨지만
    **이미 깔린 앱은 APK 에 박힌 옛 주소를 계속 봅니다.** 그래서 `test.mangoi.co.kr` 은
    **설치 기반이 새 버전으로 넘어갈 때까지 반드시 살려 둬야 합니다.**
    ⚠️ 먼저 죽이면 앱이 흰 화면이 되고, **업데이트 확인 주소(`app-version.json`)도 같은 도메인이라
    앱이 자기 힘으로 복구할 수 없습니다.** 지우는 건 새 APK 보급률을 확인한 뒤 맨 마지막입니다.
    ⚠️ ⛔ `test.mangoi.co.kr` 을 `mangoi.ai` 로 **리다이렉트하는 것도 안 됩니다** — www 때와 달리
    여기엔 잃을 게 있습니다. 그 도메인으로 등록된 **패스키 6건(계정 3개: jeong 4·Lee 1·kang 1)이 무효화**되고(재등록 필요),
    앱 사용자의 `localStorage` 로그인도 날아갑니다.
  - `mangoi.co.kr` / `www.mangoi.co.kr` (118.219.234.180) 는 **구 서버**. 옛 LMS만 있고 Worker 경로(`/library/...` 등)는 404입니다
  - ~~`mango-i.com`~~ 은 **존재하지 않는 도메인**입니다(2026-07-28 확인: 등록조차 안 됨 → NXDOMAIN).
    옛 문서 표기 오류이니 이 주소로 curl 검증하지 마세요. 무조건 실패합니다
- `modules/`, `public/`, `server.js` 는 **레거시**. 운영에 안 씁니다. 수정도 삭제도 하지 마세요.
- **실제 학생 29,000명이 쓰는 라이브 서비스입니다.** 실험은 실서비스에서 하지 않습니다.

---

## 1. ⛔ 절대 하지 말 것

### 1-1. 데이터베이스

- **D1 `mango-db` 는 개발/운영이 같은 DB입니다.** 테스트용 DB가 따로 없습니다.
  `wrangler.toml` 의 기본 환경과 `[env.production]` 이 같은 `database_id` 를 가리킵니다.
- 따라서 **DELETE / UPDATE / DROP 를 테스트 목적으로 실행하지 마세요.** 실제 학생 데이터입니다.
- 데이터 확인은 **SELECT 만**. 변경이 필요하면 사람에게 먼저 알리세요.

### 1-2. 배포

- **배포 권한이 있는 사람만 `deploy.ps1` 을 실행합니다.** 권한 없는 작업자는 코드만 고치고 PR로 넘깁니다.
- `deploy.ps1` 은 **로컬 `cloudflare-deploy/public/` 폴더를 통째로 업로드**합니다.
  커밋하지 않은 미완성 파일도 그대로 실서비스에 올라갑니다. 실행 전 `git status` 확인은 필수입니다.
- 배포 경로가 두 개입니다. 중복 배포로 서로 덮어쓰지 않게 주의하세요.
  - 로컬: `deploy.ps1`
  - 자동: `main` 브랜치에 `cloudflare-deploy/**` 변경이 push되면 GitHub Actions가 자동 배포

### 1-3. 되살리면 안 되는 것 (과거에 의도적으로 제거함)

아래는 문제가 있어서 **일부러 없앤 것들**입니다. "없네?" 하고 다시 넣지 마세요.

- 관리자 사이드바 hover 상세 카드 (`#mi-menu-fly`), 파란 플라이아웃 (`#ph123-flyout`)
- 관리자 화면의 서비스워커 등록, `controllerchange` 시 자동 reload
- 화상수업 독(dock)의 웜업 버튼, 상단바 X 버튼
- 인트로 화면의 별도 입장 버튼
- 관리자 KPI 타일의 이모지
- 판단력 훈련 UI의 게임 요소
- 관리자 메뉴 카드(`.menu-card`)·서브아이템·표행·칩의 **hover 확대(scale/translate)** — "정신없다"고 제거함. hover 강조는 **색만**, 크기·위치는 고정
- 정산·매출 화면의 **「케이씨피M」·«운영자금 보충» 표시** — 매출–입금 대사 카드, 손익계산서 매출액 칸,
  월간 회계 리포트의 «운영자금 보충» 줄·내역, 「카페24 회계 실데이터」 탭의 KPI 부제·안내 상자·장부 배지까지
  **2026-08-18 사장님 지시로 전부 뺐습니다.** 하나은행 → 신한 자금이체는 매출이 아니라, 매출·회계 화면에
  그 이름과 금액이 뜨는 것 자체를 원치 않으십니다. «제외했습니다» 라고 적어 주는 것도 「아직 남아 있다」로
  읽힙니다. 분류(`classifyDeposit` → `transfer`)와 집계 제외는 그대로지만 **그 값으로 화면 줄을 다시 만들지 마세요.**
  「카페24 회계 실데이터 > 회계장부」 목록에서는 **그 행 자체를 빼고** 내려줍니다(`api-admin.ts` 의 ledger Cypher
  `WHERE NOT (…kcpmRe…)`). ⚠️ 그래서 그 목록은 «카페24 원본 그대로» 가 아닙니다 — 원본 대조는 카페24에서 하세요.
  회귀 감시는 `test-harness/c24_finance_kcpm_harness.mjs` ④·⑤번이 «목록에서 뺀다»·«표시하지 않는다» 로 못 박아 두었습니다.
  ⛔ 같은 날 «성격 미확인 입금»(`transferUnknown`) 줄도 뺐습니다 — 월간 리포트 줄·내역, 손익계산서 각주,
  대사 안내, 경고 목록, 엑셀 「확인필요 입금」 시트까지 전부. 그 돈을 매출로 잡지 않는 계산은 그대로이고
  금액도 payload(`deposit_transfer_unknown_krw`)에 남아 있지만 **화면에는 그리지 않습니다.**
  ⚠️ 그래서 성격이 안 잡힌 입금이 있어도 화면이 알려 주지 않습니다 — 확인이 필요하면 D1 `bankacct_transactions` 를 직접 보세요
- 화상수업 왼쪽 아래의 **«🎤 내 마이크» 떠 있는 음량 미터**(`#vc-mic-meter`, `startMicLevelMeter`) — 얼굴 타일의 음량 막대와 중복이라 제거함(2026-08-10). 자리를 두 번 옮겨도 결국 중복이 문제였음

### 1-4. 기타 금지

- `src/signaling-room.ts` (SignalingRoom Durable Object) **삭제 금지** — 진단 페이지가 사용 중
- 화상수업의 저대역폭 오디오 전용 모드(AAO+DTX) **제거 금지**
- 화상수업에서 `dropped` 상태로 수업을 자동 종료하지 말 것 — `left` 만 종료
- 이모지는 **Unicode 13 이상 사용 금지** (Win10에서 두부 표시됨)
- 관리자 PC 확대는 각 페이지에서 `zoom:1.3`. 공용 CSS로 묶지 말 것

---

## 2. ⚠️ 자주 밟는 함정

| 함정 | 실제로 이렇습니다 |
|---|---|
| wrangler 명령 | wrangler 4에는 `r2 put`, `kv` 에 **`--remote` 옵션이 없습니다** |
| `deploy.ps1` 위치 | **리포 루트**입니다. `cloudflare-deploy/` 안이 아닙니다 |
| 배포 후 curl 검증 | 주소는 **`https://mangoi.ai`**(`test.mangoi.co.kr` 도 같은 Worker 라 둘 다 됩니다). `mango-i.com` 은 없는 도메인이라 무조건 실패합니다. CDN에 구버전이 남아 있을 수 있으니 `curl --compressed` + 캐시 우회로 확인 |
| 사람에게 링크를 안내할 때 | 문자·알림톡·안내문에 넣는 주소는 **`https://mangoi.ai`**. 「어디에도 안 보인다」 류의 제보는 **엉뚱한 도메인을 안내해서** 생기는 경우가 있습니다(2026-08-17 실제로 밟음 — 문서엔 `test.mangoi.co.kr`, 사장님 화면엔 `mangoi.ai`) |
| D1 쿼리 | 파라미터 **100개 제한**. `IN` 절은 90개 이하로 잘라서 실행 |
| `wrangler.toml` 값 수정 | `[vars]` 와 `[env.production.vars]` 에 **같은 값이 한 벌 더** 있습니다. 둘 다 고쳐야 함 |
| 언어 설정 키 | 공통 키는 `mangoi_lang` 입니다. `mango_lang` 은 구버전 키 |
| i18n 사전 | 전체 문자열 일치 방식입니다. 라벨에서 이모지만 떼도 번역이 깨집니다 |
| 언어 판정 | `index.html` 은 i18n 엔진이 **두 개**입니다. 나중에 로드되는 `js/mango-i18n.js` 가 `setLang/getLang/toggleLang` 을 덮어쓰는데, 인라인 엔진의 전역 `currentLang` 은 안 건드립니다. **언어 판정은 반드시 `getLang()`** 로 하세요. 인라인 `currentLang` 을 직접 읽으면 🌐 를 눌러도 안 따라옵니다 |
| JS 로 그린 라벨 | `textContent` 로 직접 쓴 글자는 `data-ko/data-en` 루프도, `i18n-sweep` 의 `restore()` 도 못 고칩니다(대입이 텍스트 노드를 갈아치워 복원이 죽은 노드에 쓰입니다). 상태에 따라 라벨이 바뀌는 버튼은 **그릴 때 `data-ko`/`data-en` 도 함께 갱신**하세요 |
| TTS 검증 | Cloudflare발 구글 TTS(한국어·중국어)는 **깨진 음성**이 나옵니다. 서버 TTS는 영어만 정상 |
| 셸에서 한글 POST | UTF-8 파일로 저장해서 보내세요. 인라인 한글은 깨집니다 |
| 카카오 상담 링크 | 주소 뒤에 **`/chat` 을 붙이지 마세요.** `pf.kakao.com/<id>/chat` 은 **비로그인 PC 를 `accounts.kakao.com` 로그인 화면으로 튕깁니다.** 채널 홈 `pf.kakao.com/_xlqnSxd` 은 로그인 없이 열리고 그 안에 채팅·챗봇·전화·길찾기가 다 있습니다 |
| `window.open` 이 안 열림 | 카톡·문자앱 **인앱 브라우저는 새 창을 못 엽니다.** 예외를 던지지 않고 **null 만 돌려주므로 `try/catch` 로는 못 잡습니다.** 반환값이 비면 `location.href` 로 같은 창에서 여세요 |
| 새 API 추가 | `src/index.ts` 의 라우팅 + 인증 게이트에 **반드시 등록**해야 동작합니다 |
| 브라우저 애니메이션 | 백그라운드 탭·저전력 모드에서 CSS transition과 rAF가 멈춥니다. `opacity:0` 으로 시작하는 요소는 영영 안 보일 수 있습니다 |
| 사이드바 손자 메뉴를 눌렀는데 아무 데도 안 감 | **손자 목록을 손으로 적으면 반드시 어긋납니다.** 옛 `adm-r25.js` 는 카드마다 이름 4개씩을 적어 두고 「카드 안 N번째 `details`」로 점프했는데, 그런 칸이 **0개인 카드가 63개**라 무엇을 눌러도 «카드 전체가 한 번 반짝이고» 끝났습니다. 에러가 안 나서 죽은 줄도 몰랐고, 실제로 「학생 명부 ▸ 2 학생 상세 프로필」이 「⏰ 만료 임박 학생」을 열었습니다(2026-08-18 사장님 지적). 지금은 손자를 **카드 안 실제 칸에서 화면으로 읽습니다** — 접이칸(`details.sub-item`·`.sub-menu > details`)은 summary 글자 그대로, 접이식이 아닌 구역은 **그 구역 자체에 붙인 `data-gc="이름"` 이름표**(126개)로. 목적지는 문자열 id 가 아니라 **DOM 참조**라 같은 id 가 두 벌 있어도(`sub-popup-list`) 정확히 그 칸으로 갑니다. ⛔ 새 손자를 «목록에 이름만» 추가하지 마세요 — 화면에 그 구역이 없으면 조용히 실패합니다. 이름표는 **그 구역 옆에** 답니다(딴 파일에 적으면 화면이 바뀔 때 또 어긋납니다). 감시는 `test-harness/admin_grandchild_menu_harness.mjs`(33종)가 «▸ 가 있는데 갈 곳이 없는 항목 0건» 으로 못 박습니다 |
| 손자 메뉴를 눌렀는데 휴대폰에서 화면이 안 움직임 | **드로어를 스크롤보다 «먼저» 닫아야 합니다.** 드로어가 열린 동안 `body` 가 `overflow:hidden` 이라, 그 상태에서 `scrollIntoView` 를 부르면 브라우저가 **통째로 무시**합니다. 자식 메뉴(`.ph85-sub`)는 `adm-s11.js` 가 이미 이렇게 처리하는데, **손자(`.ph125-gc`)는 `.ph85-sub` 의 «형제» 라 그 처리를 못 받고 있었습니다** — 카드는 제자리로 갔는데 드로어가 화면을 덮고 있어 쓰는 사람에게는 «아무 일도 안 일어났다» 로 보였습니다. 목적지가 **숨은 탭 안**(공지 스튜디오 `data-nspanel`)일 때도 같습니다 — 탭을 먼저 켜야 스크롤이 먹습니다 |
| 사이드바를 고쳤는데 화면이 그대로 | **사이드바가 두 벌입니다.** 옛 `#ph85-sidebar`(9그룹 87항목)는 CSS 로 감춰져 있고, 화면에 실제로 보이는 것은 그 위에 `adm-ia6.js` 가 다시 그린 **7그룹 44항목**입니다. 같은 class(`.ph85-group`·`.ph85-sub`)를 쓰기 때문에 코드만 봐서는 구분이 안 되고, 옛 쪽만 고치면 **하니스도 통과하고 검증도 통과하는데 사장님 화면만 안 바뀝니다**(2026-08-18 실제로 밟음 — 「결제 손자가 안 뜬다」). ⚠️ IA6 항목은 **카드를 여러 장 묶습니다**(44개 중 23개). `data-card` 는 대표 첫 장뿐이고 전부는 `data-cards` 에 있습니다. 그리고 `openSub` 가 있으면 그 항목은 **카드 «안의 한 칸»을 가리키는 잎**이라 손자를 만들면 안 됩니다 — 안 보면 「대표지사·지사·대리점」이 전부 같은 4줄을 보여 줍니다 |
| 사이드바 클릭이 안 먹거나 엉뚱하게 동작 | **`#ph85-sidebar` 클릭을 가로채는 window 캡처 핸들러가 둘입니다** — `adm-s11.js`(ph97)와 `adm-ia6.js`(wireDelegate). 사이드바에 리스너를 달면 ph97 의 `stopPropagation` 때문에 **영원히 발화하지 않습니다.** 새 조작(토글 등)을 넣을 때는 **둘 다에 예외**를 넣어야 합니다. ph97 은 2026-08-06 에, IA6 는 2026-08-18 에 각각 「▸ 손자 토글이 삼켜져 열 방법이 아예 없던」 사고를 냈습니다 |
| CSS 를 JS 로 덮었는데 안 먹음 | **작성자 CSS 가 `!important` 면 인라인 `el.style.xxx =` 도 집니다.** `el.style.setProperty('max-height', v, 'important')` 를 써야 이깁니다. 손자 메뉴 높이(`.ph125-grandchildren` 600px·`.ph85-subs` 900px)를 넓히려다 밟았습니다(2026-08-18). ⚠️ 상한 숫자를 키워서 푸는 건 임시방편입니다 — 상한이 클수록 닫을 때 «반응 없는 시간» 이 길어지고 언젠가 또 넘칩니다. **열 때만 실제 내용 높이를 넣으세요** |
| `file://` 로 `admin.html` 을 열어 확인했더니 아무것도 안 뜸 | **외부 스크립트가 하나도 실행되지 않습니다.** `<script src="/js/…">` 의 절대경로가 `file://` 에서는 **파일시스템 루트**(`/js/…`)를 가리켜 전부 404 입니다. 에러가 화면에 안 뜨니 「기능이 죽었다」로 오진하게 됩니다(2026-08-18 실제로 밟음 — 손자 메뉴가 0개로 보였음). 확인할 때는 `cd cloudflare-deploy/public && python3 -m http.server 8899` 로 띄우고 `http://127.0.0.1:8899/admin.html` 을 여세요 |
| hover 때 글자가 움직임 | `transform` 만 찾으면 못 찾습니다. 사이드바 `.ph85-sub` 는 **별점과 말풍선이 같은 `::after` 를 나눠 써서**, hover 시 별점이 `absolute` 로 흐름에서 빠지고 그 순간 `justify-content:space-between` 이 라벨을 가운데로 밀었습니다. **flex 컨테이너에서 `space-between` 금지, `flex-start` + `margin-left:auto` 로 오른쪽 정렬**할 것 |
| 로그인 역할 판정 로직 | `public/index.html`(`tryAdminLoginFallback`, 학생홈 통합 로그인)·`public/admin/login.html`(ph239)·`public/js/idx-user-session.js`(상단바 표시·이동 분기) **세 곳에 역할판정이 복제**돼 있습니다. 역할 분기(교사/본사/지사/대리점/캐피타운)를 고치면 반드시 셋 다 고쳐야 합니다. 접두사 규칙 «자체» 의 정본은 `src/auth-admin.ts` 의 `resolveUiIdentity()` 입니다 |
| 관리자 카드 안 박스 색이 안 먹음 | 인라인 `style="background:linear-gradient(135deg,…"` 나 `background:#f…` 는 **`admin-inline-c.css` 의 옛 다크 규칙**(`details.menu-card [style*="background:linear-gradient(135deg"]` 등)이 `!important` 남색으로 덮고, 그걸 본 `js/adm-s13.js` 페인터가 다시 흰-회청색으로 칠합니다. **`background-color:` 로 쓰면** 어느 선택자에도 안 걸려 고른 색이 그대로 나옵니다. 글자색은 `.sub-body :is(p,span,div,b,strong…)` 가 통째로 `#101828 !important` — `<a>` 만 예외 |
| 앱(APK) 업데이트가 안 나감 | `mobile-app/**` 을 main 에 올리면 android.yml 이 APK 를 빌드해 `downloads/mangoi.apk`+`app-version.json` 을 main 에 커밋하는데, **그 커밋은 사이트 배포를 트리거하지 못합니다** — 워크플로가 기본 `GITHUB_TOKEN` 으로 푸시한 커밋은 GitHub 규칙상 다른 워크플로를 안 깨웁니다(skip ci 문구를 빼도 마찬가지 — 2026-08-14 실측). 새 APK 를 사이트로 내보내려면 **그 뒤에 사람 쪽 main 푸시(아무 PR 머지)가 한 번 더 필요**합니다. 그 «한 번 더 푸시» 의 PR 제목·커밋 메시지에 skip ci 문구를 그대로 쓰면 그것도 건너뛰어집니다(같은 날 실제로 밟음) |
| `el.hidden = true` 인데 그대로 보임 | **작성자 CSS 가 `display` 를 정하면 브라우저 기본 `[hidden]{display:none}` 을 이깁니다**(특정성이 아니라 «작성자 > UA» 우선순위 문제라, 선택자를 아무리 봐도 원인이 안 보입니다). `teacher.html` 의 `.btn{display:inline-block}` 이 정확히 이랬고, 숨긴 버튼이 계속 떠 있었습니다(2026-08-15 실측). 화면이 `hidden` 으로 보이기/숨기기를 한다면 `[hidden]{display:none !important}` 를 한 줄 박아 두세요 |
| 관리자 카드를 `style.display='none'` 로 숨겼는데 PC 에서 그대로 보임 | **작성자 `!important` 는 인라인 스타일도 이깁니다.** 위 「`el.hidden`」 함정의 형제인데, 이건 인라인까지 집니다. `admin-inline-c.css` 의 `@media (min-width:1024px){ #legacy-cards details{display:block!important} }` 가 `#legacy-cards` 안 **모든** `details`·`.menu-card`·`.table-card` 를 되살립니다. 그래서 역할별 메뉴 숨김(`_applyMenuVisibility`)이 **PC 에서 하나도 안 먹고 있었습니다**(2026-08-18 실측: 카드 85개 중 71개 무력화, 경영진 전용 「권한 관리」·「이탈 관리」가 본사 매니저에게 노출). ⚠️ **휴대폰(<1024px)에서는 정상 동작**해서 모바일로 확인하면 멀쩡해 보입니다 — 이래서 발견이 늦었습니다. ⛔ 그 복구 규칙을 지워서 풀지 마세요 — ph87 이 `#legacy-cards` 를 숨겨 「메뉴를 눌러도 카드가 안 보인다」 사고가 났던 것의 복구책입니다. ✅ 숨김은 **`.rbac-hide` 클래스**로 하세요(미디어쿼리 밖에 정의돼 있어 모바일도 함께 먹습니다). ⚠️ 이 클래스는 **붙이는 쪽과 읽는 쪽이 짝**입니다 — 붙임 `_applyMenuVisibility`·`_applyPayrollTeacherUI`, 읽음 `buildMenuIndex`·메뉴검색색인·`adm-quickmenu visible()`·`adm-quick-access roleHidden()`·`adm-p1 memberVisible()`·`adm-ia6 applyRoleFilter()`. 한쪽만 고치면 「사이드바엔 없는데 본문엔 있는」 불일치가 납니다. ⚠️ PC 사이드바(`adm-ia6.js`)는 **정적 GROUPS 목록**이라 역할을 스스로 모릅니다 — `adm-core` 가 쏘는 `mangoi:menu-visibility` 이벤트를 받아 「가리키는 카드가 전부 감춰진」 항목을 감춥니다(`.ia6-role-hide`). ⛔ 그 클래스에 `.ia6-hide` 를 재사용하지 마세요 — 그건 카드용 `showOnly` 전용이라 **항목 클릭 한 번에 숨김이 풀립니다** |
| 새 `IN (...)` 목록 | 손으로 90개씩 자르지 마세요. `test-harness/d1_bind_limit_harness.mjs` 의 회귀 감시가 `+= 90` 과 새 `map(() => '?')` 를 **잡아서 FAIL 냅니다.** 공용 `selectInChunks`(`src/d1-chunk.ts`)를 쓰거나, 상한 근거를 하니스의 `ALLOW` 에 적어야 합니다 |
| 학부모에게 문자가 두 번 감 | **학부모 발송 경로가 두 갈래입니다** — 강사 수업일지 `/api/eval/create`(→`student_evaluations`)와 AI 초안 승인 `/api/admin/feedback-drafts/approve`(→`teacher_feedbacks`). 둘 다 문자를 보냅니다. 한쪽에서 «이미 썼는지» 판정할 때 **자기 표만 보면 안 됩니다**(초안 생성이 `feedback_drafts` 만 보다가 이미 일지를 쓴 수업까지 다시 초안을 만들던 것이 2026-08-15 수리 건) |
| 대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨 | `centers.franchise_id` 는 **카페24가 정본**이라 `importCafe24Org` 의 UPSERT 가 매일 밤 03:45 KST 에 덮어씁니다(`franchise_id = excluded.franchise_id`). `payment_type` 은 UPSERT 목록에서 빼서 지켰지만(2026-08-14) `franchise_id` 는 뺄 수 없습니다 — 새 대리점·지사 이동을 따라가야 하니까요. 임시 정정이 필요하면 **`center_franchise_override`** 에 적으세요(동기화 직후 다시 입혀집니다). 정본 수정은 카페24에서 해야 하고, 고친 뒤엔 override 행을 지우는 것이 맞습니다 |
| 가맹점 정산에서 특정 지사 매출이 통째로 안 잡힘 | `centers.name` 이 **유일하지 않습니다.** 같은 이름이 두 지사 이상으로 갈리면 `franchiseReport` 가 «어느 쪽인지 모름» 으로 판정해 **아무 데도 배정하지 않습니다**(아무 쪽에 몰아주면 그게 또 균등분배라서). 2026-08-16 기준 5개 이름·학생 2,603명이 이랬습니다. 확인: `SELECT name FROM centers GROUP BY name HAVING COUNT(DISTINCT franchise_id)>1` |
| 매출 대사가 «장부에 매출이 없다» 고 경고함 | 신한 계좌 입금 적요에 **「케이씨피」와 「케이씨피M」 두 가지**가 있습니다. 「케이씨피」(타행PC·기업)만 진짜 PG 정산금이고, **「케이씨피M」(타행IB·하나)은 회사의 하나은행 계좌에서 옮겨 온 «운영자금»** 입니다(2026-08-17 사장님 확인 — 매출 아님). `LIKE '%케이씨피%'` 로 찾으면 둘 다 잡혀 누적 4,632만원이 «장부에 없는 매출» 로 오진됩니다(2026-08-16 실측). 입금 판정은 반드시 `classifyDeposit()`(`src/accounting-reports.ts`)을 쓰세요 |
| 「카페24 회계 실데이터」 화면 매출이 통장·리포트보다 큼 | **「케이씨피M」 함정이 여기에도 있습니다.** 이 화면은 D1 이 아니라 **Neo4j `AccBook`** 을 봅니다. `type`(1=수입/2=지출)만 보고 더하면 하나은행에서 옮겨 온 운영자금(적요·거래처 「케이씨피M」)까지 매출이 됩니다(2026-08-18 수리). 판정 정본은 `KCP_TRANSFER_CYPHER_RE`·`isKcpTransferRow()`(`src/accounting-reports.ts`) — **통장용 `classifyDeposit()` 과 같은 파일에 나란히 둔 이유가 이것**입니다. Neo4j 는 TS 정규식을 못 쓰므로 Cypher(Java)용 문자열을 따로 내보내니 **한쪽만 고치지 마세요**(`c24_finance_kcpm_harness.mjs` 가 둘이 어긋나면 FAIL 냅니다). ⚠️ **단, 2026-08-18 현재 `AccBook` 은 0건입니다** — 같은 Neo4j 의 `Book` 62건은 조회되므로 연결 문제가 아니라 **카페24 쪽이 회계 노드를 아직 적재하지 않은 것**입니다(이 저장소엔 적재 코드가 없고 읽기만 합니다). 화면이 비어 보이면 코드보다 먼저 `/api/admin/finance-cafe24/ledger?limit=20` 의 `count` 를 확인하세요. 적재 요청서: `docs/카페24_회계데이터_적재요청_2026-08-18.md` |
| 「기타출금」 한 덩어리로 뭉쳐 무슨 돈인지 모름 | 통장 출금의 상당액이 적요만으로 분류가 안 돼 「기타출금」이 됩니다. 그 **대부분은 지사 수수료**입니다(2026-08-17 확인). 판정은 ① `expense_payee_category` 지정표 ② `franchises.owner_name`(241곳 전부 채워져 있음) 일치 → 「지사수수료」 순입니다. 적요는 길이가 잘려 「김영진(지성교」 처럼 오므로 `(` 앞까지로 비교합니다. ⛔ 법인 형태((주)…·센터·보험)는 자동 분류 금지 — (주)새하컴즈·호스트센터 같은 **진짜 다른 비용**이 섞여 있습니다 |
| 「로그인했는데 또 로그인하래요」 | **로그인 세션이 두 갈래입니다.** 학생·학부모 = `mangoi_logged_user` + `mango_token`, 교사·본사·지사 = `mangoi_admin_session` + `admin_sessions` **쿠키**(토큰 없음). 학생 키나 `mango_token` 만 보는 화면·API 는 **교사를 미로그인으로 판정**합니다(2026-07-30 Kaye 17번, 2026-08-13 Karl 「Double Login」 둘 다 이 뿌리). ⛔ 교사에게 `mangoi_logged_user` 를 만들어 주는 방식으로 풀지 마세요 — 학생 전용 기능이 통째로 열립니다. 서버는 토큰이 없을 때 `checkAdminSession()` 도 보게 하고(개인정보 API 는 `resolveOwnerScope()`), **짝이 되는 API 끼리 판정이 어긋나지 않았는지** 확인하세요(Karl 건 = 녹화 «재생» 은 관리자 세션을 받는데 «목록» 만 안 받던 한쪽짜리 게이트) |
| 「비번을 바꿨는데 새 비번으로 로그인이 안 돼요」 | **관리자 화면의 비밀번호 변경 자리가 두 종류였습니다.** 진짜 = `/admin/mypage.html`(→ `/api/admin/change-password`). 가짜 = 우상단 사용자 메뉴의 «🔑 비밀번호 변경» — 프롬프트 3개를 받아 놓고 **`alert('…실서비스에서는 백엔드 API 호출')` 만 띄우고 아무것도 안 보내던 시연 껍데기**가 `adm-q9(ph111)`·`adm-r19(ph113)`·`adm-r20(ph114)`·`adm-r21(ph115)` **네 벌** 있었습니다(2026-08-17 실제로 밟음 → 넷 다 실제 API 호출로 교체). 확인 방법: `SELECT updated_at FROM admin_account WHERE username=?` 가 안 움직였으면 **애초에 서버에 안 갔다**는 뜻입니다 |
| 새 화면을 만들었는데 **홈 화면(index.html)이 뜸** | **확장자 없는 주소는 `src/index.ts` 에서 한 줄로 직접 이어 줘야 합니다.** `wrangler.toml` 의 `[assets]` 가 `html_handling = "none"` 이라 `/sales` → `/sales.html` 자동 연결이 **없습니다**(`/admin/retention` 등도 전부 한 줄씩 손으로 이어 둔 것입니다). 2026-08-18 실제로 밟음 — `/sales` 를 `isAdminPath` 와 미인증 리다이렉트 목록 **두 곳에 등록하고도** 이 줄을 빠뜨려 홈 화면이 떴습니다. ⚠️ **인증 게이트는 통과하므로 「권한 문제」로 보이지도 않아** 원인 찾기가 더 어렵습니다. 새 화면은 **세 곳**(isAdminPath · 리다이렉트 목록 · ASSETS 재작성)을 전부 등록하세요 |
| 「직원을 등록했는데 로그인이 안 돼요」 | **위 «시연 껍데기» 함정의 형제입니다.** 관리자 › 권한 설정 › 「➕ 본사 직원 등록」이 입력값을 **localStorage 에만 넣고 「✅ 등록 완료」를 띄웠습니다**(`adm-core.js` `registerHqEmployee`, 코드에 `password:'demo'`). 더 근본적으로 **직원 계정을 만드는 서버 API 자체가 없었습니다** — `admin_account` INSERT 는 부트스트랩·데모시드·강사 자동생성 셋뿐 (2026-08-18 실제로 밟음 → `POST /api/admin/staff-create` 신설, 화면을 실호출로 교체). 새 계정 관련 화면을 만나면 **서버에 요청이 실제로 가는지**부터 확인하세요. ⚠️ 계정 만들 때: `hq_t*` 아이디와 이름의 «교사·강사·선생» 은 `resolveRole()` 이 무조건 강사로 판정합니다 — staff-create 가 입구에서 막지만, 다른 경로로 만들면 그대로 밟습니다 |
| 가맹점별 정산서 매출이 월간 리포트보다 적음 | **매출이 두 갈래로 들어옵니다.** 카페24 결제 장부(`student_payments`)와, 학원이 통장으로 바로 보내는 **B2B 직접입금**(`bankacct_transactions` → `classifyDeposit()='b2b'`)입니다. 월간·분기·연간·KPI 는 2026-08-16 부터 둘을 합쳐 쓰는데 **가맹점별 정산서만 장부 결제만 보고 있었습니다**(2026-08-18 수리 — B2B 로 받는 가맹점은 매출이 0 으로 찍혔습니다). B2B 입금은 학생 정보가 없어 **적요를 대리점·지사 이름과 맞춰** 붙입니다(`attributeB2bDeposits()`). 적요는 잘리거나 사람 이름으로 오므로(「박선유(에스와이피(SY」) 자동으로 안 붙는 것이 정상이고, 그건 `b2b_payee_franchise_override` 에 사람이 지정합니다(관리자 › 회계관리 › 🏦 배정 못 한 B2B 입금). ⛔ 비슷하게 생겼다고 추측해서 붙이지 마세요 — 정산서는 가맹점에 보내는 문서입니다 |
| `public/js/*.js` 를 고쳤는데 하니스가 FAIL | `asset_version_harness.mjs` 가 **파일 내용이 바뀌었는데 HTML 의 `?v=` 가 그대로면 FAIL** 냅니다(immutable 캐시에 옛 파일이 남는 사고 방지). 고친 js 를 부르는 HTML 의 `?v=` 를 함께 올리세요 |
| 지사·대리점에게 관리자 API 를 열었는데 남의 자료가 보임 | `isAgencyAllowedApi`(`src/index.ts`)에 경로를 넣는 것은 **«스코프로 자른 뒤» 에만** 하는 일입니다. 조직 명부(`/api/admin/franchises` 241건·`/api/admin/centers` 921건)는 2026-08-18 에 열었지만, 그 전에 `scopeFranchiseCond()`·`scopeCenterCond()`(`src/scope.ts`)로 지사=자기 지사, 대리점=자기 한 칸까지 자르고 등록·수정은 `canEditOrg()` 로 본사만 남겼습니다. **조건절만 지우면 전국 명부가 통째로 샙니다** — `org_scope_harness.mjs` 가 «열림»과 «잘림»을 함께 감시합니다. ⚠️ 목록을 `IN (?,?,…)` 로 펴지 마세요. 지사본사는 소유 지사가 241개까지 가서 D1 바인드 100개 한도를 넘고, 그 예외는 대개 삼켜져 «빈 표» 로 보입니다 — 콤마 문자열 한 개로 맞춥니다 |
| 카드를 역할에 열었는데 그 안의 다른 칸까지 열림 | 카드 등급(`CARD_POLICY`, `adm-core.js`)은 **카드 한 장 단위**입니다. 조직 관리 카드처럼 한 카드 안에 «보여도 되는 것»(자기 지사·대리점)과 «본사만 볼 것»(🏛️ 대표지사 권역표·🏯 본사 법인정보·등록 폼)이 섞여 있으면, 등급만 낮추면 안 되고 칸 단위로 한 번 더 감춰야 합니다(`_applyOrgScopeUI()`). **서버 403 과 화면 감추기 둘 다** 필요합니다 — 서버만 있으면 «눌러도 안 되는 버튼»이 남고, 화면만 있으면 URL 로 뚫립니다 |
| `test-harness/asset-versions.json` 이 병합할 때마다 충돌 | **원장은 「주소 순 정렬」 상태로 유지합니다.** 정렬을 없애면 새 항목이 다시 파일 맨끝에 몰리고, 병렬 PR 끼리 «내용은 무관한데 자리만 겹쳐» 충돌합니다(2026-08-17 에 PR 하나 병합하는 동안 네 번 밟음 — `/js/adm-core.js` 대 `/css/admin-inline-c.css`). 정렬은 `asset_version_harness.mjs` 의 저장부가 합니다. ⛔ `.gitattributes` 의 `merge=union` 으로 풀지 마세요 — 마지막 줄에 쉼표가 없어서 **깨진 JSON** 이 되는데 git 이 «병합 성공» 이라고 조용히 넘어갑니다. 충돌이 나면 «추가끼리 부딪힌 것» 이므로 **양쪽 항목을 다 남기세요**(같은 파일의 버전을 둘이 동시에 올린 경우만 진짜 충돌이니 사람이 판단) |
| 새 PC 에서 `npm ci` 가 «ERESOLVE / peer» 로 죽음 | **Node 버전 문제입니다. 의존성 문제가 아닙니다.** `wrangler@3.114.x` 가 `@cloudflare/workers-types@^4` 를 기대하는데 이 저장소는 `^5` 를 씁니다. **npm 11(Node 24)은 이 `peerOptional` 충돌을 그냥 통과시키고, npm 10(Node 22)은 막습니다** — CI 는 `node-version: '24'` 라 늘 초록불이라서 내 PC 에서만 죽는 것처럼 보입니다(2026-08-18 실측). `.nvmrc` 가 있으니 `nvm use` 로 24 를 켜세요. ⚠️ **설치 시점에 원인을 알려 주는 방법은 없습니다** — `engines`·`.npmrc engine-strict`·`preinstall` 셋 다 시험했지만 npm 은 **항상 의존성 해석을 먼저** 해서 ERESOLVE 가 앞서 터집니다. `--legacy-peer-deps` 는 임시방편이고, 정본 해결(wrangler 4 올리기 등)은 배포 담당이 판단 |
| 차트가 카드 밖으로 한없이 길어짐 | **Chart.js 는 `maintainAspectRatio:false` 일 때 «부모 상자» 의 크기를 그대로 따라갑니다.** 높이가 없는 부모에 캔버스를 넣으면 캔버스가 자기 높이로 부모를 늘리고, 다음 리사이즈에서 그 늘어난 높이를 다시 읽어 **창을 건드릴 때마다 누적해서 길어집니다**(2026-08-18 매출 대시보드 실측: 첫 렌더 690px → 폭 줄이니 3,070px → 세 번 흔드니 5,758px). `<canvas height="…">` 속성은 responsive 모드에서 **무시되므로 방어가 안 됩니다.** 캔버스는 반드시 **`position:relative` + 높이를 정한 래퍼** 안에 넣으세요. 같은 패턴이 `adm-core.js`·`adm-p5.js`·`adm-p7.js` 에 여러 곳 있습니다 — 대부분은 부모에 높이가 있어 멀쩡하니 **새로 만들 때 래퍼를 빠뜨리지 않는 것**이 요령입니다. 덧붙여 그리드가 `1fr 1fr` 이면 **내용보다 작아지지 않아**(=`minmax(auto,1fr)`) 좁은 폭에서 옆으로 삐져나옵니다. `repeat(auto-fit,minmax(min(100%,300px),1fr))` + 각 칸에 `min-width:0` 을 쓰세요 |
| PR 을 열었는데 CI 체크런이 **0건** | 빨간불도 초록불도 아니고 **실행 자체가 안 만들어집니다.** 저장소 Actions 는 멀쩡하고 다른 PR 은 다 도는데 그 PR 만 조용합니다(2026-08-18 PR #233 실측). `deploy.yml` 주석의 「아무 신호 없이 실행이 안 생긴다」와 같은 종류입니다. 안 통하는 것: **빈 커밋 push**(synchronize), **PR 닫았다 다시 열기**(reopened), `workflow_dispatch` API(토큰 권한 없어 403). 통한 것: **`main` 을 브랜치에 병합한 커밋을 push**(2026-08-18 PR #241 에서 재발 — 위 셋을 순서대로 다 시도했고 `main` 병합 푸시만 통했습니다. 즉 **한 번 있었던 일이 아니라 반복되는 현상**입니다). 그동안 게이트를 직접 확인하려면 CI 가 부르는 바로 그 스크립트 **`bash test-harness/ci-gates.sh`** 를 로컬에서 돌리면 됩니다(종료코드 0 = 4종 통과). ⚠️ 그래도 **PR 화면에 초록이 안 보이는 상태로 병합할지는 사람이 결정**하세요 — ci.yml 을 만든 취지가 「머지 버튼을 누르기 전에 게이트 결과가 보여야 한다」입니다 |
| 저장소의 A4 인쇄용 HTML 을 화면·웹으로 내보냈더니 아래가 잘림 | `docs/` 의 인쇄용 문서 중에는 **`height:297mm` + `overflow:hidden`** 으로 「A4 딱 한 장」에 맞춰 놓은 것이 있습니다(`회계리포트_점검보고_2026-08-17.html`). 인쇄할 때는 맞지만 **폰트가 원본과 조금만 달라도 몇 mm 넘치고, 넘친 부분은 경고 없이 잘려 사라집니다** — 2026-08-18 실측으로 내용 높이가 1,134~1,142px, A4 는 1,123px 이라 아래가 잘렸습니다. ⚠️ 이 문서들은 **같은 폴더의 `NotoSansKR.ttf` 를 찾는데 10MB 라 깃에 없습니다.** 그래서 다른 폰트로 그려지고, 그게 넘침의 원인입니다. 화면용으로 낼 때는 `height:auto` + `overflow:visible` 로 풀고 폰트를 명시하세요 |
| 화면이 「모바일에서 잘린다」고 나오는데 실제로는 멀쩡함 | **헤드리스 크로미움의 최소 뷰포트가 500px 입니다.** `--window-size=390,...` 로 찍으면 **500px 로 레이아웃한 화면을 390px 폭으로 «잘라» 저장**하므로, 멀쩡한 반응형 화면도 오른쪽이 잘린 것처럼 보입니다(2026-08-18 실제로 오진). 스크린샷 눈대중 대신 **`document.documentElement.scrollWidth > innerWidth` 를 재세요.** 브라우저는 이 컨테이너에 이미 있습니다 — `/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --dump-dom`. ⚠️ 다만 이 컨테이너에서는 구글 폰트가 프록시에 막혀 안 받아집니다. 글꼴이 걸린 문제는 여기서 재현되지 않습니다 |
| 원본 HTML 에 내 CSS 를 덮었는데 안 먹음 | **적응층 `<style>` 은 원본 `<style>` «뒤» 에 와야 합니다.** 앞에 두면 같은 특정성일 때 뒤에 오는 원본이 이깁니다(`.artifact-shell > *{max-width:100%}` 대 `.wrap{max-width:860px}` — 2026-08-18 실제로 밟음). ⚠️ 또 하나: 부모가 `display:flex; align-items:center` 면 **자식이 «내용 폭» 으로 부풀어** `max-width` 를 걸어도 표의 `min-width` 가 문서를 밀어냅니다. `width:100%; min-width:0` 을 함께 주세요 |
| 배포 워크플로가 «cancelled» 로 떴는데 실패가 아님 | **`deploy.yml` 의 `concurrency` 때문입니다.** PR 이 몇 분 안에 연달아 병합되면(2026-08-18 에 네 건이 5분 안에 들어옴) 대기하던 run 들이 **cancelled 로 정리되고 마지막 run 하나가 최신 `main` 을 통째로 배포**합니다. `cancel-in-progress: false` 라 «도는 것» 은 안 끊고 «대기 중» 만 정리하는 것이라 정상 동작입니다. ⚠️ Actions 목록에서 자기 커밋 줄이 cancelled 인 것만 보고 「배포가 안 나갔다」고 판단하지 마세요. 확인은 **`git merge-base --is-ancestor <내 커밋> <배포 성공한 run 의 head_sha>`** 로 합니다(포함돼 있으면 나간 것) |
| 월 단위 리포트를 «기간 합산» 으로 넓혔더니 숫자가 이상함 | **더해도 되는 값(흐름)과 더하면 안 되는 값(잔액)을 갈라야 합니다.** 손익계산서 분기 조회(2026-08-18)에서 매출·비용·현금흐름은 3개월을 더하지만, **통장 월말 잔액·미지급 강사급여는 시점값이라 더하면 3배**가 됩니다 → «분기 마지막 달» 기준으로 봅니다(`.bind(lastMonth)`). ⚠️ 이때 `period` 를 그대로 바인딩하면 `'2026-Q1'` 이 `substr(trans_at,1,7)<=?` 문자열 비교에 들어가 **에러 없이 엉뚱한 값**이 나옵니다. ⛔ 그리고 기간용 SQL 을 새로 쓰지 마세요 — 월 계산(`monthPL`/`monthCash`)을 그대로 3번 돌려 더하면 월 화면과 구조적으로 어긋날 수 없습니다. 부가세처럼 반올림이 있는 값은 **달마다 계산해 더해야** 월 화면 합과 1원도 안 틀립니다. 감시: `test-harness/statement_quarter_harness.mjs` |
| `git stash pop` 충돌을 `--theirs` 로 풀었더니 남의 작업이 사라짐 | **stash 충돌에서 `--theirs` 는 «내 stash» 입니다**(평소 병합과 반대로 느껴집니다). `test-harness/asset-versions.json` 을 그렇게 풀었다가 **main 이 추가한 항목 4개를 통째로 날릴 뻔했습니다**(2026-08-18 실측 — `/js/adm-core.js?v=123`·`v=125`·`adm-ia6`·`adm-r25`). 원장이 충돌하면 **`git checkout origin/main -- test-harness/asset-versions.json` 으로 main 것을 되살린 뒤 하니스를 다시 돌려** 내 항목만 새로 기록하세요. 그러면 diff 가 «내가 추가한 한 줄» 로 깨끗하게 남습니다 |
| 하니스에 «이 단어가 없어야 한다» 검사를 넣었는데 내 주석 때문에 FAIL | **부정 검사는 반드시 주석을 벗겨 낸 사본으로 판정하세요.** 「왜 지웠는지」 적은 설명 주석에 그 단어가 들어가면 검사가 자기 주석을 잡습니다(2026-08-18 `c24_finance_kcpm_harness` ③에서 실제로 밟음). `c24_finance_kcpm_harness` ⑤에 이미 있는 방식(`const strip = t => t.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^[ \t]*\/\/.*$/gm,'')`)을 그대로 쓰면 됩니다. ⚠️ 긍정 검사(«이 로직이 있는가»)는 주석이 섞여도 무해하니 원본으로 두세요 |
| 자식 메뉴를 눌러 무언가를 폈는데 **휴대폰에서 바로 사라짐** | **자식 클릭에 드로어를 닫는 곳이 «세 곳»입니다** — `adm-s11.js`(ph97)·`adm-ia6.js`(wireDelegate)·`admin.html` 의 pointerdown 자동닫기. 셋 다 «그 클릭은 카드로 이동» 이던 시절 규칙이라, 자식 클릭으로 펴는 기능(손자 메뉴)을 넣으면 **편 것이 드로어와 함께 통째로 사라집니다.** 한 곳만 고치면 나머지 둘이 닫습니다. ✅ `adm-r25.js` 가 남기는 «방금 폈다» 표시(`window.__ph125OpenedUntil`, 800ms)를 셋이 함께 봅니다 — 새 조작을 넣을 때 그 표시를 같이 쓰세요. ⛔ 세 곳을 «항상 안 닫게» 바꾸지 마세요: 손자를 골라 화면으로 갈 때는 반드시 닫아야 합니다(열린 동안 `body` 가 `overflow:hidden` 이라 `scrollIntoView` 가 통째로 무시됩니다). 감시는 `test-harness/sidebar_three_level_harness.mjs` ⑤ 가 «다섯 곳 짝 맞음» 으로 못 박습니다 |
| 자식 메뉴를 눌러 무언가를 폈는데 **그룹째 접혀 버림** | `adm-s11.js`(ph97)는 `.ph85-sub` 클릭마다 **모든 `.ph85-group` 에서 `open` 을 벗깁니다**(「하위 항목 선택 시 모든 그룹 자동 접기」). 카드로 이동만 하던 시절엔 «사이드바 정리» 라 맞았지만, 이제 같은 클릭이 손자를 여는 클릭이라 **편 순간 사라집니다.** ph97 은 window 캡처에서 먼저 도니 그 뒤에 되돌리면 됩니다(`adm-r25.js` 의 `keepGroupOpen`) |
| 딴 페이지로 가는 사이드바 항목에 무언가를 펴 보이려 했는데 **화면이 그냥 넘어감** | `adm-ia6.js` 의 `select()` 는 `href` 항목을 만나면 **맨 앞에서 `location.href` 로 빠집니다.** 그래서 「수업 길이 변경」·「수강 운영」은 손자를 그릴 새도 없이 페이지가 바뀌었습니다. ✅ 첫 누름은 펴기, 한 번 더 누르면 이동 — 판정은 위 「방금 폈다」 표시(`__ph125OpenedEl`/`__ph125OpenedUntil`)입니다. ⚠️ 그 항목들의 손자는 **다른 문서라 화면에서 읽을 수 없어** 목록을 손으로 적습니다(`secs`). 그 id 가 그 파일에 진짜 있는지는 하니스가 파일을 열어 대조합니다 — 없으면 **에러 없이 페이지 맨 위만** 열립니다 |
| 사이드바 항목을 눌렀는데 **카드는 열렸지만 그 «칸» 으로 화면이 안 감** | **한 클릭에 스크롤 주인이 둘입니다.** `adm-s11.js`(ph97)는 `.ph85-sub` 클릭마다 **50ms 뒤 `dataset.card`(=카드)를 따로 `scrollIntoView`** 합니다(smooth 한 번 + rAF 안에서 auto 한 번). 한편 `adm-ia6.js` 의 `wireRevealOnJump` 에는 「내 목적지가 아닌 곳으로 가려는 스크롤이면 손을 뗀다」는 줄이 있어서, `openSub` 로 **카드 «안의 칸»** 을 목적지로 잡으면 ph97 의 그 카드 스크롤이 **곧바로 우리 맞추기를 죽입니다** — 1.8초 재보정이 한 번도 못 돕니다. 결과는 «칸은 `open=true` 인데 화면은 카드 맨 위»(2026-08-19 실측 1440×900: 칸 제목줄 top **1492px** = 화면 밖 592px). ⚠️ **「열렸다」와 「보인다」는 다릅니다** — `open` 만 확인하고 넘어가면 이 사고를 못 봅니다. 반드시 `getBoundingClientRect().top` 이 화면 안인지 재세요. 판정: 조상으로 오는 스크롤은 «다른 곳» 이 아니라 **«같은 목적지의 거친 판»** 이므로 양보하지 않습니다(`!this.contains(alignLead)`). ⛔ 그 조건을 지우면 그대로 되돌아갑니다 — `admin_sidebar_ia6_click_harness.mjs` 가 「조상에는 양보하지 않는다」·「연 칸을 맨 위로」 두 줄로 못 박아 두었습니다. 그동안 안 걸린 이유는 `openSub` 가 조직 그룹(칸 3개짜리 카드)에만 있어 카드를 맞춰도 칸이 화면에 들어왔기 때문입니다 — 회계 카드는 칸이 12개입니다 |
| `overflow:auto` 를 걸어 뒀는데 표가 화면을 옆으로 밀어냄 | **상자가 아니라 «조상 그리드 칸» 을 보세요.** `.admin-layout` 은 `grid-template-columns:260px 1fr` 인데 **그리드 칸의 기본값이 `min-width:auto`** 라 «내용보다 작아지지 않습니다». 그래서 `1fr` 칸(`#admin-main-scale`)이 안쪽 표만큼 부풀고, **상자도 같이 커져 «넘칠 일이 없어지니» `overflow:auto` 가 영영 발동하지 않습니다**(2026-08-18 실측: 1500px 창에서 「학생관리」 컬럼 17개·표 1,703px → 카드 1,821px, 문서가 586px 가로로 넘침. 페이지 전체에 가로 스크롤바). ⚠️ 상자에는 이미 `overflow:auto` 가 있었기 때문에 **그 상자만 들여다보면 원인이 안 보입니다** — 조상을 타고 올라가며 `min-width` 와 부모 `display` 를 같이 재세요. ✅ 고침은 칸에 **`min-width:0`** 한 줄(`#admin-main-scale`). 위 「차트가 카드 밖으로」 항목의 그리드 함정과 같은 뿌리입니다. 감시: `test-harness/admin_layout_overflow_harness.mjs` |
| 표에 전용 검색창을 달았더니 **검색창이 두 개** 보임 | `admin.html` 의 `ph-frn-filter-js` 가 **`TABLES` 에 적힌 표마다 «🔍 목록 검색» 입력을 자동으로 끼워 넣습니다.** 그 표에 서버 검색창을 새로 달면서 목록에서 빼지 않으면 둘이 같이 나옵니다(2026-08-18 「🏯 본사 관리」에서 실제로 밟음 — 헤드리스 렌더로 발견). ⚠️ 보기 싫은 것만이 문제가 아닙니다 — 이 필터의 `MutationObserver` 가 표가 다시 그려질 때마다 «화면에 있는 행» 을 자기 입력값으로 **한 번 더 거르기 때문에**, 서버가 찾아 준 행까지 `display:none` 으로 숨겨 「검색했는데 아무것도 없다」가 됩니다. ✅ 전용 서버 검색창을 만들면 `TABLES` 에서 그 표를 **빼세요**(2026-08-08 `centers-table`·2026-08-18 `hq-table` 이 같은 이유). 반대로 **서버 페이징이 없고 전부 그리는** 표라면 자동 필터가 맞습니다(`mbranches-table`) |
| 「CI 도 통과했고 하니스도 초록인데」 화면이 틀림 | **프록시가 `mangoi.ai` 를 막아 Claude 는 배포된 화면을 못 봅니다**(4-1-1). 그렇다고 화면 확인을 포기할 필요는 없습니다 — **`public/` 을 그대로 서빙하는 로컬 서버 + 컨테이너에 이미 있는 크로미움**(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `playwright-core` 로 구동)으로 **배포된 그 파일들을 그대로 렌더**할 수 있습니다. 로그인이 필요한 API 는 시드값을 돌려주는 스텁으로 대신합니다. 2026-08-18 에 이 방법으로 **타입체크·하니스·CI 를 전부 통과한 상태에서 버그 2건**(검색창 중복 · 학생관리 가로 넘침)을 눈으로 찾았습니다. ⚠️ 첫 화면의 «환영 안내» 오버레이(`#aw-overlay`)가 클릭을 가로막고, 카드는 `ia6-hide` 로 한 번에 하나만 보이므로 `jumpToMenu(id)` 로 여세요. ⚠️ 스텁 응답 때문에 나는 `TypeError` 를 진짜 버그로 착각하지 마세요 — **진짜 응답으로 재현되기 전엔 단정하지 말 것** |

---

## 3. 백엔드 파일 지도 — "이 기능 어디 있지?"

| 파일 | 담당 |
|---|---|
| `src/index.ts` | 라우팅 진입점 + 관리자 인증 게이트 |
| `src/api-mango.ts` | 수업 입장(`class/*`), 번역, 통합검색 |
| `src/api-admin.ts` | 관리자 전반: 통계·KPI·급여·강사·팝업·스케줄·구독·레벨테스트 |
| `src/api-games.ts` | 단어장·마이크로러닝·복습퀴즈·배지·스트릭·음성코칭 |
| `src/api-points.ts` | 포인트·기프티콘·수업 별점평가 |
| `src/api-students.ts` | 학부모 대시보드·학생 로그인/가입·소셜로그인 |
| `src/api-lessons.ts` | 평가서·숙제·캘린더·AI 학습리포트 |
| `src/api-notify.ts` | 알림톡·웹푸시·채팅 영속화·카카오 |
| `src/api-ai.ts` | AI 영작첨삭·영어친구챗·AI 명령 라우터 |
| `src/video-call-room.ts` | 화상수업 Durable Object (실사용) |
| `src/signaling-room.ts` | 구 시그널링 DO (진단용, 삭제 금지) |

화면(`cloudflare-deploy/public/`)은 HTML 53개. 주요 파일은 `index.html`(홈+화상수업), `admin.html`(관리자), `student.html`(학생).

---

## 4. 작업 방식

### 4-1. 브랜치

`main` 에 직접 커밋하지 마세요. 작업용 브랜치를 만들고 PR로 올립니다.

```bash
git pull
git checkout -b 작업내용-요약
```

### 4-1-1. 병합 — CI 게이트가 통과하면 Claude 가 물어보지 않고 병합합니다

> **2026-08-17 사장님 지시.** 그 전에는 「병합할까요?」를 매번 물었는데, CI 를 기다리는
> 2분 사이 `main` 이 움직여 충돌 → 다시 병합 → 또 기다리기를 **한 PR 에서 네 번**
> 반복한 일이 있었습니다(PR #182).

**동작:** 작업 → PR → CI 통과 시 병합 → 배포 확인 → 결과 보고.
중간에 확인을 구하지 않습니다.

**GitHub 의 「Allow auto-merge」는 쓸 수 없습니다.** 찾지 마세요 —
**비공개 저장소의 자동 병합은 유료 플랜(Pro 이상)에서만** 제공되고, 이 저장소는
개인 계정의 비공개 저장소라 Settings → General → Pull Requests 에 **체크박스가 아예
없습니다**(2026-08-17 확인: API 도 `Auto-merge is not enabled for this repository` 로 거절).
그래서 「예약해 두고 자리를 떠나는」 방식은 불가능하고, **CI 결과를 기다렸다가 직접
병합**해야 합니다. 결과는 같고, 기다리는 동안 `main` 이 움직이면 한 번 더 병합하면 됩니다
(그 충돌의 대부분은 2장 「원장」 함정의 정렬 수정으로 이미 사라졌습니다).

**⛔ 그래도 멈추고 사람에게 묻는 경우** — 「CI 통과」로는 판단할 수 없는 것들입니다.

| 상황 | 왜 |
|---|---|
| **CI 가 빨간불** | 원인을 찾아 고쳐서 초록불을 만든 뒤 병합합니다. **게이트를 우회하거나 테스트를 끄는 방식은 금지** |
| **진짜 충돌** — 둘이 «같은 파일» 의 버전을 각자 올린 경우 | 아무 쪽으로 몰면 한쪽 수정이 조용히 묻힙니다. («다른 파일끼리» 자리만 겹친 충돌은 양쪽을 다 남기고 그냥 진행 — 2장 원장 함정 참고) |
| **D1 데이터 변경**(DELETE/UPDATE/DROP) | 개발·운영이 같은 DB 입니다. 실제 학생 데이터라 **CI 가 막아 주지 못합니다** |
| **지우거나 되돌리는 변경** | 일부러 없앤 기능을 되살리는 것, 파일·기능 삭제 |
| **지시 범위를 벗어나는 것** | 「이것도 같이 고치면 좋겠다」 싶은 건 먼저 말합니다 |
| **1-3 공동 금지구역** | `public/index.html`, `src/index.ts`, `wrangler.toml`, `deploy.ps1`, `public/sw.js` — 사고 반경이 서비스 전체입니다 |

**⚠️ CI 통과 ≠ 화면이 맞다.** 작업 환경(원격 컨테이너)의 프록시가 `mangoi.ai` 를 막아서
**Claude 는 배포된 실제 화면을 못 봅니다.** 「배포 워크플로 성공」까지만 확인 가능합니다.
2026-08-17 에 정확히 이 틈에서 사고가 났습니다 — 검증은 전부 통과했는데 사장님 PC 화면에는
시계·날씨가 아예 없었습니다(모바일 전용으로 만들어 놓고 PC 를 확인하지 않았음).
**화면이 바뀌는 작업은 병합 후 사람이 한 번 봐야 끝난 것입니다.**

### 4-2. 2인 담당 분담 — 같은 파일을 동시에 만지지 않는 것이 원칙

`index.html`(1.6MB)과 `admin.html`(1.3MB)이 전체 작업의 대부분을 차지합니다.
이 둘을 두 사람이 같이 만지면 충돌 해결이 사실상 불가능합니다. 그래서 영역을 나눕니다.

| 영역 | 담당 | 파일 |
|---|---|---|
| **관리자·운영·정산** | A (배포 권한자) | `public/admin.html`, `src/api-admin.ts`, `src/accounting-*.ts`, `src/api-payroll-auto.ts`, `src/org-settlement.ts`, `src/api-retention.ts`, `src/churn-*.ts` |
| **학생 학습 콘텐츠** | B | `public/student-game-*.html`, `public/student-games.html`, `public/vocab.html`, `public/micro-quiz.html`, `public/review-quiz.html`, `public/warmup.html`, `public/ai-write.html`, `public/speech-coach*.html`, `public/suspect-mystery.html`, `public/battle-3d.html`, `src/api-games.ts`, `src/api-points.ts` |
| **🚫 공동 금지구역** | A만 | `public/index.html`(홈+화상수업), `src/index.ts`(라우팅+인증게이트), `src/video-call-room.ts`, `src/signaling-room.ts`, `wrangler.toml`, `deploy.ps1`, `public/sw.js` |

- 학습 콘텐츠는 게임마다 **파일이 독립**이라 충돌이 거의 없고, 사고가 나도 반경이 게임 하나입니다.
- 금지구역은 사고 반경이 서비스 전체입니다. 배포 권한자만 만집니다.
- **담당 밖 파일을 고쳐야 하면 먼저 상대에게 알리세요.** 원격이라 서로 뭘 하는지 안 보입니다.

### 4-3. ⚠️ 배포 커밋은 HTML 53개를 전부 건드립니다

`deploy.ps1` 은 캐시 무효화를 위해 **모든 HTML에 `<!-- BUILD:시각 -->` 주석을 새로 박습니다.**
그래서 배포 커밋 하나가 파일 59개를 바꾼 것처럼 보이지만, 대부분은 **1줄짜리 스탬프뿐**입니다.

- **배포 직후 `git pull` 하면 HTML 전부가 바뀐 것으로 나옵니다. 정상입니다.**
- 리뷰할 때는 스탬프를 빼고 보세요. 진짜 변경만 나옵니다.

```bash
git diff -I'BUILD:' main..작업브랜치
```

- 작업 중 배포가 일어나 충돌이 나면, 충돌 지점이 `</body>` 바로 위의 `<!-- BUILD: -->` 줄인지 먼저 확인하세요.
  스탬프 줄이면 **어느 쪽을 택해도 무방**합니다(다음 배포 때 어차피 새로 박힘).

### 4-4. 검증 — 코드를 고쳤으면 반드시

1. `cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit` — 컴파일 통과
   ⚠️ `npx tsc` 는 **"출력 없음"이 통과가 아닙니다**(npx 가 조용히 실패해도 똑같이 아무것도 안 찍힘)
2. **리포 루트에서** `node test-harness/run.mjs --fast` — 회귀 하니스 (약 90초, PASS 114 / SKIP 20)
   ⚠️ 하니스는 **리포 루트 `test-harness/`** 에 있습니다. `cloudflare-deploy/test-harness/` 에도
   같은 이름의 폴더가 있지만 그 안엔 `run.mjs` 가 **없습니다** — 1번의 `cd cloudflare-deploy` 를
   그대로 이어서 실행하면 `MODULE_NOT_FOUND` 가 납니다
3. 화면 변경이면 실제 브라우저에서 확인

**"고쳤습니다"라고만 말하지 말고, 무엇으로 확인했는지 함께 보고하세요.**
서버 배포 후에는 배포 스탬프(`BUILD_STAMP`)로 실제 반영 여부를 확인합니다.

### 4-5. 보고 방식

- 사실만. 테스트가 실패했으면 실패했다고 출력과 함께 말할 것
- 건너뛴 단계가 있으면 명시할 것
- 확인되지 않은 것을 "됐습니다"라고 하지 말 것

### 4-6. 판단을 기록으로 남기기 — 대화는 상대에게 안 갑니다

**클로드 코드의 대화 기록은 작업한 사람 쪽에만 남습니다.** 팀 요금제로 묶어도
서로의 대화가 보이지 않습니다. 그래서 코드에는 「택한 것」만 남고,
**「왜 다른 길로 안 갔는지」는 대화와 함께 사라집니다.**

작업이 끝나면 `/worklog` 로 `docs/작업기록/` 에 남기세요. 특히 다음 셋:

1. **왜 했나** — 어떤 제보·증상에서 출발했는지
2. **검토했다가 버린 방법과 그 이유** ← 가장 중요합니다
3. **확인한 방법** — 타입체크·하니스 결과, 사람이 화면에서 본 것

> 🔑 **새로 발견한 함정은 작업기록 말고 이 파일 2장 표에 넣으세요.**
> 작업기록은 사람이 찾아 읽어야 하지만, `CLAUDE.md` 는 클로드가 매번 자동으로 읽습니다.

공유 슬래시 명령·서브에이전트 목록은 [.claude/README.md](.claude/README.md) 를 보세요
(`/verify` 검증, `/worklog` 기록, `/newdoc` 목차 등록, `trap-check` 함정 대조).

---

## 5. 환경·문서 링크

- **📚 문서 전체 목차: [docs/INDEX.md](docs/INDEX.md)** — 이 저장소의 모든 문서는 여기서 찾습니다
- **🤝 팀 공유 방법: [docs/팀공유_가이드.md](docs/팀공유_가이드.md)** — 무엇을 어디에 두고 어떻게 공유하는지
- 유지보수 매뉴얼(사람용): [MAINTENANCE.md](MAINTENANCE.md)
- 환경변수·시크릿: [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- 장애 대응: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- 공동작업 안내(직원용): [docs/개발_공동작업_안내_직원용.md](docs/개발_공동작업_안내_직원용.md)
- 공유 클로드 설정 설명: [.claude/README.md](.claude/README.md) — 슬래시 명령·서브에이전트 목록

`.env`, `.dev.vars` 는 깃에 없습니다. 없으면 사람에게 요청하세요. **깃에 올리지 마세요.**

---

*이 파일은 두 사람이 공유합니다. 새 함정을 발견하면 여기에 추가하고 PR에 포함하세요.*
