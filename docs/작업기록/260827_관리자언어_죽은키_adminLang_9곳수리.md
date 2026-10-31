# 관리자 언어 — 아무도 저장하지 않는 «죽은 키» `adminLang` 을 읽던 9곳 수리

- **날짜** 2026-08-27
- **PR** [#570](https://github.com/navy111p-sudo/mangoiweb/pull/570)
- **브랜치** `claude/admin-lang-deadkey-260827`
- **바뀐 파일** 12개 (js 8 · html 2 · 원장 1 · CLAUDE.md 1)

---

## 1. 왜 했나

관리자 화면의 언어 판정이 `localStorage.getItem('adminLang')` 을 읽는 곳이 여러 곳 있었는데,
**그 키는 저장소 어디에서도 `setItem` 하지 않습니다.** 읽으면 항상 `null` 이라
그 화면들은 **EN 스태프(Maimai·Melca 등)에게도 영원히 한국어**로 떴습니다.

이 버그가 오래 안 보인 이유가 세 가지입니다.

1. **이름이 정본과 똑같습니다.** 판정 정본은 전역 변수 `window.adminLang` 이고,
   저장 정본은 `localStorage` 의 `mangoi_lang` 입니다. `localStorage['adminLang']` 은
   그 둘 사이에 낀 **이름만 같은 제3의 키**라, 코드만 읽으면 맞아 보입니다.
2. **에러가 안 납니다.** `getItem` 이 `null` 을 돌려주고 `=== 'en'` 이 `false` 가 될 뿐입니다.
3. **하니스가 못 잡습니다.** 함수도 값도 다 «있고» 틀린 것은 «어느 키를 읽는가» 뿐이라
   수리 전에도 회귀 하니스가 전부 초록이었습니다(`--fast` PASS 225).

### 실측 (2026-08-27)

```
getItem('adminLang')  → 9곳 (파일당 1회씩, 큰따옴표 변형 0건)
setItem('adminLang')  → 0건  ← 저장하는 코드가 아예 없다
```

| 화면 | 파일 |
|---|---|
| 사이드바 | `js/adm-ia6.js` |
| 경로 줄(뒤로·홈·지금 어디) | `js/adm-crumb.js` |
| 수업 관찰 — 진행 중인 수업 목록 | `js/adm-s1.js` |
| 오늘 수업 바로 입장 | `js/adm-today-classes.js` |
| 자주 쓰는 기능 | `js/adm-quick-access.js` |
| 최근 본 메뉴 | `js/adm-recent-menus.js` |
| CDO 날씨 | `js/adm-cdo-weather.js` |
| 학생 교재 일괄배정 | `js/adm-bulkbook.js` |
| 사이트 지도(독립 페이지) | `admin/site-structure-map.html` |

---

## 2. 정본이 무엇인지 — 코드로 확정한 것

추측하지 않고 선언부까지 따라가 확인했습니다.

- **저장 정본 = `mangoi_lang`** (+ `mangoi_lang_by` · `mangoi_lang_uid`).
  쓰는 곳은 `js/adm-lang-boot.js` 와 `js/adm-core.js` 의 `toggleAdminLang()`(104행).
- **판정 정본 = 전역 변수 `window.adminLang`.**
  `adm-lang-boot.js` 가 `<head>` 159행에서 **`defer` 없이** 로드돼 첫 페인트 전에 대입하고,
  `<html lang>` 변화(MutationObserver)와 다른 탭의 `storage` 이벤트로 계속 갱신합니다.

🔑 **결정적인 확인** — `adm-core.js:41` 의 선언이 **`var adminLang`** 입니다.
최상위 classic script 의 `var` 는 `window` 속성을 만들므로 **그 변수와 `window.adminLang` 은 같은 바인딩**입니다.
그래서 `toggleAdminLang()` 이 그 변수를 바꾸면 `window.adminLang` 도 함께 바뀝니다.

> ⚠️ 만약 `let adminLang` 이었다면 **둘이 다른 값**이 되어(CLAUDE.md 2장 「`let` 은 `window` 에 속성을 안 만든다」 함정)
> 이번 수정이 조용히 헛돌았을 것입니다. 그래서 이 한 줄을 먼저 확인했습니다.
> 저장소 전체에 `type="module"` 은 0건이라 스코프가 갈릴 여지도 없습니다.

---

## 3. 고친 방향

**`admin.html` 문맥의 8개** — `window.adminLang` 을 먼저 보고, 없을 때만 저장 키로 폴백:

```js
function isEn() {
  if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
  try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
}
```

**`admin/site-structure-map.html`** — 이 페이지는 `adm-lang-boot.js` 를 **안 싣는 독립 화면**이라
`window.adminLang` 이 없습니다(브라우저 실측: `typeof window.adminLang === 'undefined'`).
그래서 여기만 `localStorage.getItem('mangoi_lang')` 을 직접 읽습니다.

**`adm-bulkbook`** — 함께 보던 구버전 키 `mango_lang` 폴백도 뺐습니다.
그 키를 쓰는 화면은 저장소에서 `judgment.html:588` 하나뿐이고 **같은 줄에서 `mangoi_lang` 도 함께 저장**하므로
새 폴백이 같은 값을 집습니다 — 잃는 값이 없습니다.

### 딸려 나온 것 — CDO 날씨의 재렌더 훅

`adm-cdo-weather` 는 `textContent` 로 직접 그려 `data-ko`/`data-en` 루프가 못 고치는데
**언어 변경 시 다시 그리는 훅이 없었습니다.** 수리 «전» 에는 늘 한국어라 토글해도 어긋날 일이 없어
안 보이던 구멍인데, 정본으로 고치자 **부팅은 맞고 토글만 옛 언어로 남는** 상태가 드러났습니다
(브라우저 실측으로 잡았습니다 — EN→KO 토글 뒤에도 "Cagayan de Oro … feels 36°" 그대로).

`mangoi:lang-changed` 청취를 넣었고, **`document` 와 `window` 둘 다** 듣습니다 —
쏘는 곳이 둘이기 때문입니다(`adm-core.js` 는 `document`, `mango-i18n.js` 는 `window`).
`adm-s1.js` 가 이미 그렇게 해 둔 선례를 따랐습니다.

> 나머지 7개는 토글에도 이미 따라옵니다(브라우저 실측). 사이드바는 그리면서 `data-ko`/`data-en` 을
> 함께 박아 `applyAdminLangDom()` 이 갈아 주고, 나머지는 `toggleAdminLang()` 이 부르는 재렌더에 걸립니다.

---

## 4. 검토했다가 버린 방법

| 버린 방법 | 왜 안 했나 |
|---|---|
| **`adminLang` 키에 `setItem` 을 넣어 «살리기»** | 제일 손이 적게 가지만 **정본이 두 벌이 됩니다.** 쓰는 곳이 하나라도 빠지면 «화면 절반만 영어» 가 되고, 그 상태는 지금보다 나쁩니다(원인이 둘로 갈려 다음 사람이 못 찾습니다). CLAUDE.md 에 ⛔ 로 못 박아 뒀습니다. |
| **9곳 모두 `localStorage.getItem('mangoi_lang')` 만 읽기** | 저장 키만 보면 **🌐 토글에 안 따라옵니다.** `toggleAdminLang()` 은 저장도 하지만 화면은 새로고침 없이 갱신하는데, 그때 `window.adminLang` 이 가장 먼저·확실히 바뀝니다. 저장 키만 읽으면 다른 탭에서 바꾼 경우 등에서 어긋납니다. |
| **9곳 모두 `window.adminLang` 만 읽기** | `admin/site-structure-map.html` 이 **`adm-lang-boot.js` 를 안 싣습니다** → 그 페이지에서 영영 `undefined` 라 한국어로 굳습니다. 실측으로 확인하고 그 파일만 갈랐습니다. |
| **`adm-hr-analysis.js` 처럼 4단계 캐스케이드**(`getLang()` → `adminLang` → `mangoi_lang` → `documentElement.lang`) 복제 | `admin.html` 에서는 `window.getLang()` 이 `adminLang` 을 그대로 돌려주므로(`adm-core.js:43`) **결과가 같습니다.** 단계를 늘리면 읽는 사람만 헷갈립니다. |
| **공용 `isEn()` 헬퍼 파일을 새로 만들어 9곳이 import** | 8개는 IIFE 인 defer 파일, 1개는 독립 HTML 이라 로드 순서·전역 노출을 새로 설계해야 합니다. **2줄짜리 판정 때문에 짊어질 위험이 아닙니다**(첫 화면 예산·로드 순서 사고 전력). |
| **`<html lang>` 만 읽기** | `adm-lang-boot.js` 는 **EN 일 때만** `document.documentElement.lang='en'` 을 씁니다(159행, `if (window.__ADM_BOOT_LANG !== 'en') return`). KO 판정에서 무엇이 들어 있는지 보장이 없습니다. |

---

## 5. 확인한 방법

### 자동

- `node node_modules/typescript/bin/tsc --noEmit` → **exit 0** (`src/` 무변경이라 TS 대상 없음)
- 리포 루트 `node test-harness/run.mjs --fast` → **PASS 225 / FAIL 0 / SKIP 20(E2E 정상)**
- `node test-harness/asset_version_harness.mjs` → **212/212 통과**, `?v=` 8건 원장 기록

> 🪤 **처음엔 FAIL 6 이 나왔는데 전부 «환경 사유» 였습니다.** 이 워크트리에
> `cloudflare-deploy/node_modules` 가 없어(워크트리는 공유하지 않습니다) `esbuild`·`typescript` 를
> **절대경로로 찾는 하니스 6종**이 죽은 것이었습니다 — CLAUDE.md 2장에 적힌 그 상태 그대로입니다.
> 본 체크아웃의 `node_modules` 를 **디렉터리 정션**으로 잠깐 연결해 진짜 신호를 얻었고,
> 검증이 끝난 뒤 **정션을 지웠습니다** — 남겨 두면 나중에 워크트리를 지울 때
> 그 링크를 따라 **본 체크아웃의 `node_modules` 까지 지워질 수 있습니다**(지운 뒤 본 체크아웃 무사함을 확인).

### 브라우저 실측 (이 버그는 자동 검사로는 안 잡힙니다)

`file://` 로 열면 `<script src="/js/…">` 가 전부 404 라(CLAUDE.md 함정) **로컬 정적 서버**로 띄웠습니다.
첫 방문자 오버레이는 `mangoi_admin_welcome_v1_done='1'` 로 건너뜁니다.

`mangoi_lang='en'` 에서 9곳 전부 영어로 그려짐:

| 화면 | 실제로 그려진 글자 |
|---|---|
| 사이드바 | `Today's classes` · `Attendance` · `Long absent` · `Observe class` |
| 경로 줄 | `←Back 🏠Home Today › Today's classes` |
| 자주 쓰는 기능 | `⚡ Quick access / Approvals / Class observation …` |
| 최근 본 메뉴 | `🕘 Recent menus` |
| CDO 날씨 | `Cagayan de Oro 31° Rain · feels 36° · humidity 74%` |
| 오늘 수업 | `🔄 Load` · `Joinable only` · `Click load to see today's classes.` |
| 수업 관찰 | `· 0 room(s)` · `No one is connected to a Mango-i video room right now.` |
| 교재 일괄배정 | `📚 Bulk Assign Textbook` |
| 사이트 지도 | TTS 요청이 **`lang=en` + 영어 본문**으로 나감(네트워크로 확인) |

- `'ko'` 로 되돌리면 **전부 한국어 복귀** (회귀 없음).
- **🌐 토글 양방향** 반영 확인 — 날씨도 `카가얀데오로 31° 비 · 체감 36°` ↔ 영어로 따라옵니다.

> 🪤 날씨 훅을 고친 직후 **브라우저가 옛 `?v=3` 을 캐시하고 있어** 안 고쳐진 것처럼 보였습니다.
> 서버가 주는 파일에는 새 코드가 있었고(실측), 규칙대로 `?v=4` 로 올리자 바로 반영됐습니다.
> — 「고쳤는데 화면이 그대로」면 **서버가 주는 내용과 페이지가 쓰는 `?v=` 를 각각** 확인할 것.

### trap-check

**규칙 위반 0건.** 공동 금지구역(`public/index.html`·`src/index.ts`·`wrangler.toml`·`deploy.ps1`·`public/sw.js`) 무변경 확인.
지적받은 **CLAUDE.md 숫자 2개는 실측치로 정정**했습니다(「읽기 10회」→9곳, 「회귀 217건」→PASS 225).
이 저장소가 스스로 못 박은 「심각도를 부풀린 문장이 규칙서에 박히면 다음 사람이 엉뚱한 것을 고친다」에 걸리는 자리였습니다.

---

## 6. 형제 버그를 찾아봤고 — 없었습니다

같은 모양(읽기만 하고 아무도 저장하지 않는 키)을 `public/` 전체에서 훑었습니다.
후보 34개 중 언어 관련 둘이 눈에 띄었지만 **둘 다 이미 정리된 잔재**였습니다.

- `mangoi_payroll_lang` (`admin/duplicate-payments.html`·`retention.html`·`teacher-payroll.html`)
- `mangoi_admin_lang` (`admin/student.html`)

셋 다 **`mangoi_lang` 을 먼저 읽고** 죽은 키는 뒤 폴백입니다(2026-07-23 수리분).
즉 그때 정리하면서 **`adminLang` 9곳만 누락**된 것이고, 이번에 그 나머지를 맞춘 셈입니다.
나머지 후보는 동적으로 조립하는 접두사(`mangoi_popup_dismiss_` 등)이거나 옛 계정 키 폴백 사슬이라 무해합니다.

---

## 7. 남은 것 / 사람이 볼 것

- ⚠️ **화면이 바뀌는 작업이라 병합 후 사람이 한 번 봐야 끝납니다**(CLAUDE.md 4-1-1).
  Maimai·Melca 계정으로 실제 로그인해서 보는 것까지는 세션이 필요해 못 했습니다.
- `admin/site-structure-map.html` 은 `mangoi_lang` 만 봅니다. `adm-lang-boot.js` 의 판정
  (국적·강사 강제 EN)은 그 값을 **저장해 두기 때문에** 대개 따라오지만,
  관리자 화면을 한 번도 안 거치고 이 페이지로 바로 들어오면 KO 로 떨어집니다.
  영향은 `?speak=1` 음성 낭독 한 갈래뿐이라 작습니다.
