# 사람에게 건네던 «갈린 워커 주소» 세 자리를 정본 주소로

- 날짜: 2026-10-30
- 작업자: 사장님(wooyoung@mangoi.co.kr) 지시 · Claude Code 작업
- 브랜치: `claude/classroom-connection-issue-vki673`
- 지시: 「api-reports.ts, exec-summary.ts, admin/student.html 세 곳 SITE_ORIGIN으로 고쳐줘」

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

## 4. 되돌아가지 않게 — 하니스 ⑥절

`test-harness/outgoing_link_domain_harness.mjs` 는 **②절이 «문자를 보내는 모듈» 만** 보고 있어서
이 세 자리를 한 번도 안 봤습니다. ⑥절(12건)을 신설했습니다.

- 두 TS 파일: `site-url` 을 가져오는가 · `SITE_ORIGIN`/`siteUrl()` 을 쓰는가 · ⛔ 갈린 워커 주소가 **코드에** 없는가
- HTML: 머리글 링크의 `href` 가 **정확히 `/`** 인가 · ⛔ 갈린 워커 주소가 화면에 없는가

**짝 검사를 함께 뒀습니다** — 「워커 주소가 없다」만 두면 «링크를 통째로 지우기» 도 통과합니다.
그래서 ⓐ 월간 리포트는 「그 기본 주소를 실제로 쓰는가(`origin || MONTHLY_SITE_ORIGIN`)」
ⓑ 경영 브리핑은 「문자에 대시보드 링크가 그대로 들어 있는가」
ⓒ 학생 상세는 「그 `class="brand"` 링크가 아직 있는가」를 각각 짝으로 뒀습니다.

부정 검사는 **주석을 벗겨 낸 사본**으로 판정합니다(기존 `codeOnly()`, HTML 은 `<!-- -->` 제거) —
제가 넣은 ⛔ 설명 주석에 그 주소가 들어 있어서, 안 벗기면 **자기 주석을 잡습니다**.

⛔ **이 절을 «src/public 전체에 workers.dev 가 없다» 로 넓히지 마세요** — CSP `frame-ancestors`·
open-redirect 허용목록·아바타 TTS 처럼 **일부러** 워커 주소를 쓰는 자리가 실재합니다
(`src/index.ts`·`src/eleader-trial-site.ts`). 넓히면 멀쩡한 코드가 빨간불이 됩니다.

### 변이시험 — 되돌리면 실제로 FAIL 나는가

여섯 가지를 **실제로 소스에 넣어** 돌렸습니다(사본을 떠 두고 되돌림 — `git checkout` 금지).

| 변이 | 결과 |
|---|---|
| Ⓐ `api-reports.ts` 옛 주소로 되돌리기 | FAIL 2 (SITE_ORIGIN 아님 · 워커 주소 있음) |
| Ⓑ `exec-summary.ts` 옛 주소로 되돌리기 | FAIL |
| Ⓒ `student.html` 옛 주소로 되돌리기 | FAIL |
| Ⓓ (짝) 경영 브리핑에서 대시보드 줄 통째로 빼기 | FAIL |
| Ⓔ (짝) `origin \|\| MONTHLY_SITE_ORIGIN` 폴백 지우기 | FAIL 1 |
| Ⓕ (짝) 학생 상세 brand 링크 없애기 | FAIL |

여섯 전부 실제 FAIL. 되돌린 뒤 98/98 통과로 복귀하는 것도 확인했습니다.

## 5. 검토했다가 안 한 것

- **`admin/student.html` 에 `https://mangoi.ai` 박기** — 위 ③. 직원 로그인이 끊깁니다.
- **「src 전체에서 workers.dev 금지」 하니스** — 위 ⛔. 일부러 쓰는 자리를 빨간불로 만듭니다.
- **남은 `-prod` 워커 주소 고치기** — 아래 6장. 지시 범위 밖이라 **안 건드렸습니다.**

## 6. 🟡 아직 남은 것 — 사람이 정할 일

같은 종류가 **네 자리** 더 있습니다. 이쪽은 `-prod`(고객 도메인을 실제로 서비스하는 워커)라
**DO 는 안 갈리지만**, 오리진이 `mangoi.ai` 와 다르므로 **로그인은 그대로 갈립니다.**

### ⓐ `-prod` 워커 주소 — 네 곳

이쪽은 `-prod`(고객 도메인을 실제로 서비스하는 워커)라 **DO 는 안 갈리지만**,
오리진이 `mangoi.ai` 와 다르므로 **로그인은 그대로 갈립니다.**

| 자리 | 누구에게 | 조건 |
|---|---|---|
| `src/solapi-client.ts:58` `WORKER_BASE`(227행에서 사용) | 알림톡 클릭추적 리다이렉트 기준 | `ALIMTALK_TRACK='on'` 이고 `PUBLIC_BASE_URL` 이 없을 때만 |
| `src/solapi-client.ts:396` `#{입장URL}` 기본값 | 학부모 — 수업 시작 알림 | `roomUrl` 이 없을 때만 |
| `src/solapi-client.ts:444` `#{입장URL}` 기본값 | 학부모 — 강사 호출 | 〃 |
| `src/api-notify.ts:383` 채팅 요약 주소 | **학생·학부모 문자** | 항상 |

⚠️ 마지막 것은 조건 없이 학생·학부모에게 나갑니다. 고칠 가치가 있어 보이지만
지시가 「세 곳」이었으므로 **보고만 하고 손대지 않았습니다.**

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

## 7. 확인한 방법

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

### ⚠️ 중간에 밟은 함정 하나

`student_status_literal_harness` 가 **새로 빨간불**이 났습니다. 그 하니스의 예외 목록이
`api-reports.ts:549` 처럼 **«파일:줄번호» 로** 적혀 있는데, 제가 import 1줄 + 주석 2줄을 넣어
그 코드가 **552행으로 밀린** 것이었습니다(CLAUDE.md 2장에 이미 적힌 함정).
`sed -n 552p` 로 **같은 코드인지 확인한 뒤 번호만** 옮겼습니다. ⛔ 예외를 지우거나 넓히지 않았습니다.

## 8. 못 한 것

- **배포된 화면을 못 봤습니다.** 이 컨테이너의 프록시가 `mangoi.ai`·`test.mangoi.co.kr`·
  `*.workers.dev` 를 전부 403 으로 막습니다.
- **D1 을 못 봤습니다.** 그래서 「그 주소로 실제로 몇 건이 나갔나」는 **안 쟀습니다.**
- 월간 리포트 크론은 **매월 1일**에 돕니다 — 다음 1일에 사람이 학부모에게 간 문자의 링크가
  `https://mangoi.ai/...` 인지 한 번 봐 주시면 끝입니다.
