# 사람에게 건네던 «갈린 워커 주소» 네 자리를 정본 주소로

- 날짜: 2026-10-30
- 작업자: 사장님(wooyoung@mangoi.co.kr) 지시 · Claude Code 작업
- 브랜치: `claude/classroom-connection-issue-vki673`
- 지시: 「api-reports.ts, exec-summary.ts, admin/student.html 세 곳 SITE_ORIGIN으로 고쳐줘」
  → 이어서 「**api-notify.ts:383 도 같이 고쳐줘**」(아래 ④)

> 🔴 **④ 를 고치다 더 큰 것을 찾았습니다** — 그 문자가 가리키는 페이지
> `/admin/chat-summary.html` 은 **저장소에 없습니다.** 오리진은 고쳤지만 링크는
> 여전히 갈 곳이 없습니다. 5-2장을 보세요(사람이 정할 일).

## 1. 왜 했나

2026-08-25 `class-895-20260825` 사고(학생 `delaware`·강사 `mangoi_167` 이 **같은 방 번호인데
서로 못 봄**)를 조사하면서 찾은 것입니다. 그 사고의 뿌리는 「워커가 두 벌이라 Durable Object
네임스페이스가 갈린다」인데(진단은 `260825_화상수업_같은방못만남_재발진단_attendance_host칸.md`),
조사 중에 **그 갈린 워커 주소를 사람에게 그대로 건네주는 자리가 셋** 남아 있는 것을 봤습니다.

```
https://webrtc-unified-platform.navy111p.workers.dev
```

CLAUDE.md 0장이 못 박은 대로, 오리진이 갈리면 브라우저가 두 사이트로 봅니다 —
교사 세션 쿠키는 `Domain=` 이 없는 **호스트 전용**이고, 학생 로그인(`mangoi_logged_user`·
`mango_token`)과 언어(`mangoi_lang`)는 `localStorage` 라 **오리진별로 갈리는 게 웹 표준**입니다.
그래서 이 주소로 들어간 사람은 「로그인했는데 또 로그인하래요」를 만나고, 수업 링크였다면
「같은 방 번호인데 다른 교실」이 그대로 재현됩니다.

## 2. 어디였나 — 그리고 그중 하나는 «실제로 돌고 있던» 경로

| 자리 | 누구에게 가나 | 비고 |
|---|---|---|
| `src/api-reports.ts` `MONTHLY_SITE_ORIGIN` | **학부모** — 월간 AI 레포트 링크 | 아래 ⚠️ |
| `src/exec-summary.ts` 경영 브리핑 문자 | 경영진 — 대시보드 링크 | |
| `public/admin/student.html` 머리글 「망고아이」 | 직원 — 학생 홈으로 이동 | |

⚠️ **첫 번째는 «폴백» 이 아니라 사실상 주 경로였습니다.** `runMonthlyReports(env, period, origin?)`
를 부르는 곳이 둘인데,

- `src/api-reports.ts:717` — 관리자가 화면에서 누를 때. `new URL(request.url).origin` 을 넘깁니다(정상).
- **`src/index.ts:3005` — 매월 1일 KST 자동 발송 크론. `origin` 을 안 넘깁니다.**

즉 **자동으로 학부모에게 나가던 월간 리포트 링크가 그 갈린 워커 주소**였습니다.
(실제로 몇 건이 나갔는지는 D1 을 못 봐서 **안 쟀습니다** — 코드 경로만 확인한 것입니다.)

## 3. 무엇을 했나

### ① `src/api-reports.ts` — 정본에서 가져온다

```ts
import { SITE_ORIGIN } from './site-url';
...
const MONTHLY_SITE_ORIGIN = SITE_ORIGIN;
```

`origin || MONTHLY_SITE_ORIGIN` 쓰는 자리는 그대로입니다(화면에서 부를 때는 여전히 요청 오리진).

### ② `src/exec-summary.ts` — `siteUrl()` 로

```ts
import { siteUrl } from './site-url';
...
`… 대시보드 ${siteUrl('/admin/exec')}`
```

### ③ `public/admin/student.html` — **상대경로**

정적 HTML 이라 `site-url.ts` 를 가져올 수 없습니다. 그런데 **여기는 `SITE_ORIGIN` 을 박으면
안 되는 자리**입니다 — CLAUDE.md 2장이 「«남에게 보내는 링크» 만 정본으로 못 박고,
**«내가 지금 이 페이지에서 옮겨 가는 주소» 는 상대경로 그대로 두세요**」라고 적어 둔 그 경우입니다.
절대 주소를 박으면 옛 도메인에서 일하던 직원이 그 링크를 누르는 순간 자기 로그인을 잃습니다.

```html
<a href="/" target="_blank" rel="noopener" class="brand" …>
```

### ④ `src/api-notify.ts` — 채팅 요약 문자 (덧붙인 지시)

```ts
import { siteUrl } from './site-url';
...
const summaryUrl = siteUrl(`/admin/chat-summary.html?room=${encodeURIComponent(roomId)}`);
```

이 자리가 ①~③ 과 다른 점: **라우트에 조건이 하나도 없습니다.** 서버가 계정으로 찾은
**학생 번호와 학부모 번호 둘 다**에 보냅니다(`resolveNotifyPhones` → `sendChatSummaryAlert`).
게다가 `/api/notify/*` 는 **무인증**이라 밖에서 `student_uid` 를 담아 부르면 그대로 나갑니다.

> 🔴 **처음에 여기 「수업이 끝나고 1.5초 뒤 조건 없이 나가므로 반경이 제일 넓다」고 적었는데
> 틀렸습니다**(2026-11-05 함정 대조 지적 → 제가 다시 재서 확인). 자세한 것은 **§4** 입니다.
> 고친 것(오리진)은 그대로 옳습니다 — 무인증 경로가 살아 있기 때문입니다.

`-prod` 워커라 **DO 는 안 갈리지만** 오리진이 달라 **로그인은 그대로 갈립니다**
(교사 쿠키는 호스트 전용, 학생 `mangoi_logged_user`·`mango_token` 은 `localStorage`).

## 4. 🔴 ④ 의 «반경» 을 틀리게 적었습니다 — 라우트만 보고 호출자를 안 셌습니다

> 🪤 번호 4 는 원래 비어 있었습니다(§5 를 끼우며 옛 4→6 으로 밀어 놓고 안 채웠습니다).
> 그 자리에 이 정정을 넣습니다.

처음 판에서 저는 **다섯 곳**(CLAUDE.md 2장 · 이 문서 §3-④·§5-3 · `api-notify.ts` 주석 ·
하니스 ⑥-4 주석 · `docs/INDEX.md`)에 이렇게 적었습니다 —

> 「수업이 끝나고 1.5초 뒤 학생·학부모에게 **조건 없이** 나가므로 반경이 제일 넓다」

**라우트 코드만 보고 쓴 것이고, 사실이 아닙니다.** 2026-11-05 함정 대조가 잡았고
**세 겹을 제가 각각 다시 쟀습니다.**

| | 잰 것 | 방법 |
|---|---|---|
| ⓐ | 유일한 호출자 `vcNotifyLessonEnded`(`public/js/idx-main.js:3729`)를 **부르는 곳이 저장소에 0곳** — 그 이름이 나오는 자리가 **자기 정의 한 줄뿐**입니다(`window[...]` 류 동적 호출도 0건) | `grep -rnoE "vcNotifyLessonEnded" js/ *.html` |
| ⓑ | 불려도 **넷째 줄에서 return** 합니다 — `const s = (typeof demoStudents !== 'undefined') ? demoStudents[u.uid] : null; if (!s) return;` 인데 `demoStudents` 는 `js/idx-user-session.js` 의 **IIFE 안 `var`** 라 전역이 아닙니다(전역은 `window.__demoStudents` 뿐). 게다가 그 표는 `hong`·`kim`·`lee`·`park`·`navy111p` **데모 5계정 하드코딩**입니다 | 그 파일을 `node:vm` 샌드박스에 실제로 실행 → `typeof window.demoStudents === 'undefined'` · `typeof window.__demoStudents === 'object'` |
| ⓒ | 지나가도 **서버가 받을 것이 없습니다** — 클라이언트 본문은 `room_id`·`student_name`·`student_phone`·`parent_phone`·`lesson_title` 뿐이라 **`student_uid`·`parent_uid` 가 없고**, `resolveNotifyPhones` 는 그 둘이 비면 전부 건너뛰어 빈 값을 줍니다 → `targets` 빈 배열 → **발송 0건** | `idx-main.js:3752~3756` + `notify-contacts.ts:295~321` 코드 |

### ⛔ 그렇다고 «안전하다» 로 뒤집지 마세요

`/api/notify/*` 는 **무인증**입니다. 밖에서 `{room_id, student_uid}` 를 담아 부르면 서버가
그 학생의 번호를 찾아 **갈 곳 없는 링크가 든 문자**를 그 학생·학부모에게 보냅니다.
⟹ **오리진 수리는 여전히 옳고**, 바뀐 것은 «반경» 서술 하나입니다.

### 다음에 안 밟으려면

✅ **«조건 없이 보내는 코드» 를 봤으면 «그 요청이 실제로 나가는가» 를 호출자까지 거슬러 세세요**
(`grep -c` 한 줄이면 됩니다). 특히 `typeof X !== 'undefined'` 가드가 줄줄이 달려 있으면
그 자체가 **«그 이름이 전역이 아닐 수도»** 라는 신호입니다 — 이 저장소에만 그런 자리가
`demoStudents` 하나로 **8곳**입니다.

⚠️ 그리고 주석을 근거로 쓰지 마세요 — 그 자리 주석은
「수업 종료 시 호출 (closeVideoCall 등에서 트리거)」라고 적혀 있는데 **부르는 곳이 없습니다.**
CLAUDE.md 2장 「문서에 「고쳤다」고 적혀 있는데 같은 사고가 또 남」의 그 형태입니다.


## 5. 🔴 ④ 를 고치다 찾은 것 — 그 링크는 갈 곳이 없습니다

### 5-1. 잰 것

| 물은 것 | 답 |
|---|---|
| `cloudflare-deploy/public/admin/chat-summary.html` 이 있는가 | **없습니다** |
| git 이력에 한 번이라도 있었는가 | **없습니다**(`git log --all -- <그 경로>` 빈 결과) |
| 그 경로가 로그인 게이트 안인가 | **예** — `src/index.ts` 의 `isAdminPath` 가 `path.startsWith('/admin/')` **default-deny** |
| 알림톡 템플릿이 없으면 폴백 문자라도 나가는가 | **안 나갑니다** — `solapi-client.ts:214` 의 `if (!params.templateCode) return … 'skipped'` 가 폴백 조립(`:261`)보다 **앞**입니다 |

⟹ 오리진을 고쳐도 학생·학부모가 누르면 **로그인 화면**(파일이 있었다면 404)입니다.
«고쳤다» 는 **«갈린 워커 주소가 안 나간다» 까지**이고, **«그 문자가 쓸모 있어졌다» 는 아닙니다.**

### 5-2. 🟡 사람이 정할 일

세 가지 중 하나여야 합니다 — 제가 고르지 않았습니다.

1. `/admin/chat-summary.html` 을 **만든다**(관리자용이면 지금 경로 그대로. 다만 학부모는 못 봅니다)
2. 학부모용 페이지를 **로그인 게이트 밖**(`/chat-summary.html` 류)에 만든다
   — ⛔ 그때는 방 번호만으로 남의 수업 채팅이 열리지 않게 토큰이 필요합니다
3. **링크를 빼고** 건수만 알린다(「오늘 채팅 N개가 오갔어요」)

### 5-3. 안 잰 것

- **그 문자가 실제로 몇 건 나갔는지** — `SOLAPI_TEMPLATE_CHAT_SUMMARY` 시크릿을 볼 수 없고
  D1 `alimtalk_log` 도 못 봅니다. ⛔ 「안 나가고 있었을 것」으로 단정하지 마세요.
- 🔴 **처음에 「`idx-main.js:3750` 이 아직 `student_phone`·`parent_phone` 을 싣지만 서버가
  일부러 무시한다 — 고장은 아니다」고 적었는데, 심각도를 거꾸로 봤습니다.** 서버가 무시하는
  것은 맞지만, **그 본문에 `student_uid`·`parent_uid` 가 없는 것**이 곧 「아무에게도 안 간다」의
  원인입니다(§4 ⓒ). CLAUDE.md 2장 「심각도를 낮추는 결론은 특히 조심하세요」에 걸립니다.
- ⚠️ 덤 — 「D1 `alimtalk_log` 도 못 봅니다」라고 적었지만 **봐도 소용없습니다.**
  `sendChatSummaryAlert` 는 `logContext` 를 **안 넘겨서** 그 표에 한 줄도 안 남습니다
  (CLAUDE.md 2장 「그 기능은 한 번도 안 돌았다」를 로그 표가 비었다는 근거로 말하려 할 때).

## 6. 되돌아가지 않게 — 하니스 ⑥절

`test-harness/outgoing_link_domain_harness.mjs` 는 **②절이 «문자를 보내는 모듈» 만** 보고 있어서
이 네 자리를 한 번도 안 봤습니다. ⑥절(**21건**)을 신설했습니다.

- 세 TS 파일: `site-url` 을 가져오는가 · `SITE_ORIGIN`/`siteUrl()` 을 쓰는가 · ⛔ 갈린 워커 주소가 **코드에** 없는가
- HTML: 머리글 링크의 `href` 가 **정확히 `/`** 인가 · ⛔ 갈린 워커 주소가 화면에 없는가

**짝 검사를 함께 뒀습니다** — 「워커 주소가 없다」만 두면 «링크를 통째로 지우기» 도 통과합니다.
그래서 ⓐ 월간 리포트는 「그 기본 주소를 실제로 쓰는가(`origin || MONTHLY_SITE_ORIGIN`)」
ⓑ 경영 브리핑은 「문자에 대시보드 링크가 그대로 들어 있는가」
ⓒ 학생 상세는 「그 `class="brand"` 링크가 아직 있는가」
ⓓ 채팅 요약은 「그 주소를 **실제로 발송 호출에 넘기는가**」를 각각 짝으로 뒀습니다.

ⓓ 는 「그 이름이 파일에 있는가」로 묻지 않습니다 — `sendChatSummaryAlert(env, …)` 의
**인자 묶음을 괄호 짝으로 잘라** 그 «안» 에서 봅니다. 그리고 **「잘라 냈다」를 전제 검사 한 줄로**
뒀습니다(앵커가 어긋나면 빈 문자열을 보고 조용히 통과하니까).

🔴 **그래도 구멍이 둘 남아 있었습니다**(2026-11-05 함정 대조가 실측 → 같은 날 메움).

| 통과하던 변이 | 왜 | 메운 방법 |
|---|---|---|
| `summaryUrl: ''` — **이름은 남기고 값만 죽이기** | 검사가 `/\bsummaryUrl\b/` 라 «그 **이름**이 인자 묶음에 있는가» 까지만 물었다 | 「그 키에 묶인 값이 **그 변수 자신인가**」를 짝으로(축약형도 받음) |
| `for (const phone of (false ? targets : []))` — **조건 뒤집기로 발송 루프 무력화** | 주소·인자가 다 맞아도 **아무 데도 안 간다**. 그 글자는 그대로 남아 전부 통과 | 라우트 블록을 중괄호 짝으로 잘라 ①「게이트가 채운 `targets` 를 그대로 도는가」 ②「**«항상 거짓» 인 죽은 조건이 없는가**」 둘을 짝으로 |

⚠️ CLAUDE.md 가 콕 집어 말하는 그것입니다 — **「변이 N종 전부 FAIL」이라고 적을 때
그 N 에 «조건 뒤집기» 가 들어 있는지 세어 보세요.** 제 열 종에는 **0종**이었습니다.

ℹ️ **FAIL 이 아니라 이름만 찍는 줄**도 하나 넣었습니다 — 「채팅 요약이 가리키는
`/admin/chat-summary.html` 이 아직 저장소에 없다」(5장). 나중에 그 페이지를 만들면
**멀쩡한 수리가 빨간불이 되면 안 되므로** FAIL 로 만들지 않았습니다
(선례: `popup_open_return_harness` 의 «사람 결정 대기»).

부정 검사는 **주석을 벗겨 낸 사본**으로 판정합니다(기존 `codeOnly()`, HTML 은 `<!-- -->` 제거) —
제가 넣은 ⛔ 설명 주석에 그 주소가 들어 있어서, 안 벗기면 **자기 주석을 잡습니다**.

⛔ **이 절을 «src/public 전체에 workers.dev 가 없다» 로 넓히지 마세요** — CSP `frame-ancestors`·
open-redirect 허용목록·아바타 TTS 처럼 **일부러** 워커 주소를 쓰는 자리가 실재합니다
(`src/index.ts`·`src/eleader-trial-site.ts`). 넓히면 멀쩡한 코드가 빨간불이 됩니다.

### 변이시험 — 되돌리면 실제로 FAIL 나는가

실제로 소스에 넣어 돌렸습니다(사본을 떠 두고 되돌림 — `git checkout` 금지).

| 변이 | 결과 |
|---|---|
| Ⓐ `api-reports.ts` 옛 주소로 되돌리기 | FAIL 2 (SITE_ORIGIN 아님 · 워커 주소 있음) |
| Ⓑ `exec-summary.ts` 옛 주소로 되돌리기 | FAIL |
| Ⓒ `student.html` 옛 주소로 되돌리기 | FAIL |
| Ⓓ (짝) 경영 브리핑에서 대시보드 줄 통째로 빼기 | FAIL |
| Ⓔ (짝) `origin \|\| MONTHLY_SITE_ORIGIN` 폴백 지우기 | FAIL 1 |
| Ⓕ (짝) 학생 상세 brand 링크 없애기 | FAIL |
| Ⓖ `api-notify.ts` 옛 `-prod` 주소로 되돌리기 | FAIL 2 (siteUrl 아님 · 워커 주소 있음) |
| Ⓗ (짝) 발송 인자에서 `summaryUrl` 빼기 | FAIL 1 |
| Ⓘ `site-url` import 줄 지우기 | FAIL 1 |
| Ⓙ (전제) 발송 호출을 통째로 지우기 | FAIL 2 (전제 · 짝) |
| Ⓗ' **이름은 남기고 값만 죽이기**(`summaryUrl: ''`) | FAIL 1 — ⚠️ 첫 판에서는 **통과했습니다** |
| Ⓚ **조건 뒤집기**(`of (false ? targets : [])`) | FAIL 1 — ⚠️ 첫 판에서는 **통과했습니다** |
| Ⓚ' 죽은 조건 없이 루프만 비우기(`targets.slice(0, 0)`) | FAIL 1 (「targets 를 그대로 돈다」가 잡음) |

**열세 가지 전부 실제 FAIL**(그중 **조건 뒤집기 1종**). 되돌린 뒤 **107/107** 통과로
복귀하는 것도 매번 확인했습니다.

## 7. 검토했다가 안 한 것

- **`admin/student.html` 에 `https://mangoi.ai` 박기** — 위 ③. 직원 로그인이 끊깁니다.
- **「src 전체에서 workers.dev 금지」 하니스** — 위 ⛔. 일부러 쓰는 자리를 빨간불로 만듭니다.
- **남은 `-prod` 워커 주소 고치기** — 아래 8장 ⓐ. 지시 범위 밖이라 **안 건드렸습니다.**
- **채팅 요약 링크를 «살아 있는 페이지» 로 바꾸기** — 5-2장. 어느 쪽이 맞는지는 제가 고를 일이
  아닙니다(학부모에게 열어 줄지 말지가 걸립니다). 오리진만 고치고 사실을 적어 뒀습니다.
- **`/admin/chat-summary.html` 을 내가 만들기** — 지시는 「주소를 고쳐 달라」였습니다.
  없는 화면을 짐작으로 만들면 「만들었다」가 「쓸 수 있다」로 읽힙니다.

## 8. 🟡 아직 남은 것 — 사람이 정할 일

### ⓐ `-prod` 워커 주소 — **세 곳** (네 곳 중 하나는 이번에 고쳤습니다)

이쪽은 `-prod`(고객 도메인을 실제로 서비스하는 워커)라 **DO 는 안 갈리지만**,
오리진이 `mangoi.ai` 와 다르므로 **로그인은 그대로 갈립니다.**

| 자리 | 누구에게 | 조건 |
|---|---|---|
| `src/solapi-client.ts:58` `WORKER_BASE`(227행에서 사용) | 알림톡 클릭추적 리다이렉트 기준 | `ALIMTALK_TRACK='on'` 이고 `PUBLIC_BASE_URL` 이 없을 때만 |
| `src/solapi-client.ts:396` `#{입장URL}` 기본값 | 학부모 — 수업 시작 알림 | `roomUrl` 이 없을 때만 |
| `src/solapi-client.ts:444` `#{입장URL}` 기본값 | 학부모 — 강사 호출 | 〃 |
| ~~`src/api-notify.ts:383` 채팅 요약 주소~~ | ~~학생·학부모 문자~~ | ✅ **2026-10-30 고침**(위 ④) |

⚠️ 남은 셋은 전부 **조건부**라 평소에는 안 닿습니다. 그래도 고치는 편이 낫지만
지시 범위 밖이므로 **보고만 하고 손대지 않았습니다.**
⚠️ `WORKER_BASE` 는 `env.PUBLIC_BASE_URL || WORKER_BASE` 라 **환경변수로 이미 덮을 수 있습니다** —
코드를 안 고치고도 막을 수 있는 자리입니다(그 값이 지금 설정돼 있는지는 **못 쟀습니다**).

### ⓑ 비-prod(= DO 가 갈리는 그 주소) — 두 곳 더 있습니다

🔴 **제가 처음에 「세 곳 남아 있었다」로 적었는데 사실이 아닙니다**(함정 대조가 잡았습니다).
«사람에게 건네는» 자리가 셋이었을 뿐, 같은 주소가 `public/js/idx-main.js` 에 두 곳 더 있습니다.

| 자리 | 무엇 |
|---|---|
| `public/js/idx-main.js:11614` | 파일 공유 안내 `alert` |
| `public/js/idx-main.js:11780` | 교재 업로드 안내 `alert` |

**둘 다 `if (location.protocol === 'file:')` 안이라 `https://mangoi.ai` 에서는 원리상 안 닿습니다**
— 그래서 «고칠 것» 이 아니라 **«문장을 고칠 것»** 이었습니다(`idx-main.js` 는 blocking 이고
고치면 `index.html` 의 `?v=` 까지 걸리는 별건). 하니스 ⑥절 머리 주석에도 적어 뒀습니다.

⛔ **그러니 이 작업을 「비-prod 주소를 전수로 정리했다」로 읽지 마세요.**

## 9. 확인한 방법

- **타입체크** — `node_modules` 가 없는 컨테이너라 전역 `tsc` + `types: []` 임시 tsconfig.
  `origin/main` 을 `git worktree` 로 떠서 **같은 명령을 돌려 대조**했습니다
  (⛔ `git stash` 로 기준선을 만들면 커밋 안 한 편집이 함께 치워집니다).
  → 기준선 179건 · 지금 179건, **줄번호를 지우고 대조해 새 오류 0건 · 사라진 오류 0건.**
  (그 179건은 전부 `Cannot find name 'D1Database'` 류 — `@cloudflare/workers-types` 가 없어서지 코드 탓이 아닙니다.)
- **회귀 하니스** — `node test-harness/run.mjs --fast`, 기준선 worktree 와 **FAIL 목록을 `comm` 으로 대조**.
  → 기준선 PASS 591 / FAIL 32, 지금도 **PASS 591 / FAIL 32 · 목록 완전 동일**(새로 깨뜨린 것 0건).
  그 32건은 이 컨테이너에 `node_modules`·esbuild 가 없어서 나는 환경 사유이거나 다른 작업의 것입니다.
- **`outgoing_link_domain_harness`** 단독 98/98 통과, `--fast` 안에서도 ✅ 로 도는 것 확인.
- `git diff` 의 **삭제줄이 전부 내 것인지** 눈으로 확인(4줄 — 바꾸려던 그 네 줄).

### 9-2. ④(api-notify.ts)를 더할 때 다시 잰 것 — **방법이 달랐습니다**

- **타입체크** — 이번에는 `git worktree` 가 **120초 안에 안 끝나** 쓰지 못했습니다(저장소가 큽니다).
  대신 **그 파일만 `git checkout -- <파일>` 로 되돌려 같은 tsc 를 한 번 더 돌리고**,
  내 사본을 다시 덮어 복원했습니다(사본을 미리 떠 뒀습니다).
  → 기준선 179건 · 지금 179건, **줄번호를 지우고 `comm` 으로 대조해 새 오류 0건.**
  (`api-notify.ts` 의 2건은 둘 다 `Cannot find name 'D1Database'` — `types: []` 때문이지 제 변경 탓이 아닙니다.)
- **회귀 하니스** — `node test-harness/run.mjs --fast` → **끝까지 돌았습니다.**
  `📌 기준선 유지(fast): PASS 590 ≥ 140 · SKIP 20 ≤ 20` · **⚠ 33건.**

  🔴 **제가 중간에 「30분 제한에 걸려 끊겼다」고 한 번 틀리게 판단했습니다.** `pgrep` 이
  조용해진 것을 «죽었다» 로 읽었는데 사실은 **마지막 요약을 쓰는 중**이었고, 출력 파일이
  아직 flush 전이라 중간에서 끝난 것처럼 보였습니다. ⟹ **`pgrep` 이 조용한 것과
  «끝났다» 는 다릅니다** — 끝은 **마지막 요약 줄**(`📌 기준선 유지`)로 판정하세요.
  (그래서 커밋 메시지 `38ac54420` 에는 「끊겼다」가 그대로 적혀 있습니다. 이 줄이 정본입니다.)

  **그 33건 중 제 변경 탓은 0건입니다** — 근거를 둘로 나눠 적습니다.
  ⓐ 33개 중 제가 바꾼 네 파일(`api-notify.ts`·`CLAUDE.md`·이 하니스·이 문서)을
     **한 글자라도 읽는 것이 9개**(`grep -E` 로 기계 대조), 나머지 **24개는 아예 안 읽습니다.**
  ⓑ 그 9개를 하나씩 돌려 **실패 사유를 직접 봤습니다** — 전부
     `Cannot find module 'esbuild'` / `… typescript` / 「정본을 **번들해 돌리지 못했다**」입니다.
     이 컨테이너에 `cloudflare-deploy/node_modules` 가 없어서이고, **파일을 읽기도 «전» 에** 죽습니다.

  ⚠️ 옛 측정(9장)의 「기준선 FAIL 32」와 **한 건 차이**가 납니다. 그 32 는 며칠 전
  **다른 트리 상태**에서 잰 값이고 그 사이 `origin/main` 이 8 커밋 움직였으므로
  ⛔ 「내가 하나 늘렸다」로 읽지 마세요 — 위 ⓐⓑ 가 그것을 각각 배제합니다.
  (⚠️ 그래도 **그 한 건이 무엇인지는 안 쟀습니다.** 옛 FAIL 목록을 저장해 두지 않았습니다.)

- **바뀐 파일을 읽는 하니스 전수** — `grep -l` 로 11개(`api-notify.ts` 9 + `CLAUDE.md` 를
  파일로 읽는 `body_class_observer`·`outgoing_link_domain`)를 따로 돌려 **전부 exit=0**
  (위 esbuild 둘 제외).
- **`outgoing_link_domain_harness`** 단독 **103/103** 통과.
- **함정 대조**(trap-check) — 「막는 것 없음」. 제가 적은 사실 주장 넷(파일 없음·로그인 게이트·
  폴백 문자 안 나감·학생+학부모 둘 다)을 각각 다시 재서 **전부 맞다**고 확인해 줬습니다.
  ⚠️ 다만 `src/api-notify.ts` 는 **CLAUDE.md 4-2 담당 표에 어느 영역으로도 안 적혀 있습니다**
  (공동 금지구역도 아닙니다). 알려 드립니다.

### ⚠️ 중간에 밟은 함정 하나

`student_status_literal_harness` 가 **새로 빨간불**이 났습니다. 그 하니스의 예외 목록이
`api-reports.ts:549` 처럼 **«파일:줄번호» 로** 적혀 있는데, 제가 import 1줄 + 주석 2줄을 넣어
그 코드가 **552행으로 밀린** 것이었습니다(CLAUDE.md 2장에 이미 적힌 함정).
`sed -n 552p` 로 **같은 코드인지 확인한 뒤 번호만** 옮겼습니다. ⛔ 예외를 지우거나 넓히지 않았습니다.

## 10. 못 한 것

- **배포된 화면을 못 봤습니다.** 이 컨테이너의 프록시가 `mangoi.ai`·`test.mangoi.co.kr`·
  `*.workers.dev` 를 전부 403 으로 막습니다.
- **D1 을 못 봤습니다.** 그래서 「그 주소로 실제로 몇 건이 나갔나」는 **안 쟀습니다.**
- 월간 리포트 크론은 **매월 1일**에 돕니다 — 다음 1일에 사람이 학부모에게 간 문자의 링크가
  `https://mangoi.ai/...` 인지 한 번 봐 주시면 끝입니다.
