# 2026-08-25 · 개발 업무 보고서(8/25) 대조 검토 → 미병합 4건 병합 + `#lang-toggle` 폴백 복원

> PR #483 · 브랜치 `claude/claude-md-docs-745784` · 병합 커밋 `f9e6282`

---

## 1. 왜 했나

사장님이 **「MANGOI · 개발 업무 누적 보고서」 PDF(2026-08-25, 37쪽)** 를 주시며
「이거 확인하고 이상없음 PR해주고 배포해줘」.

보고서는 두 부분입니다.
- 앞 8쪽 — 8/25 하루의 작업(이 세션이 아닌 **다른 세션**이 한 것) 5건 + 같은 날 다른 PR 17건 요약
- 9쪽 뒤 — 이미 제출됐던 8/24·8/21 보고서 원본

## 2. 대조해서 확인한 것

### 2-1. 「완료」로 적힌 4건이 **병합되지 않은 상태**였습니다

보고서가 근거로 든 커밋(`b2be75c` `f6f5011` `c090357` `710454e` `db8ee61` `f6db434` `2bbd7af` `d73495c`)이
`main` 에 하나도 없었습니다. 전부 브랜치 `claude/login-button-placement-x4o5sa` 에만 있었고 **PR 이 열려 있지도 않았습니다**
(열린 PR 은 #93·#464·#480 뿐). 즉 「완료」는 «코드가 됐다» 는 뜻이었고 실서비스에는 한 줄도 안 나가 있었습니다.

- 로그인 버튼 중앙 배치 (`index.html`, `js/idx-user-session.js` v7→v8)
- 수강신청 등록 — 강사 우선 배정 시 이미 예약된 시간 🚫 표시 (`js/adm-core.js`)
- 학생 등록 모달 — 비밀번호 직접 입력 + 대리점 검색 (`admin.html`, `adm-core.js`, `src/api-admin.ts`)
- 학생 목록 기본 정렬 → 가입일 최신순 (`js/adm-core.js`)

그 브랜치는 `main` 을 **전부 포함**하고 있어(0 behind) 그대로 담아 PR 을 열었습니다.

### 2-2. 보고서의 기술적 주장은 실제 코드와 일치했습니다

| 보고서가 말한 것 | 대조 결과 |
|---|---|
| 새 API 없이 기존 공개 엔드포인트 재사용 | 사실 — `POST /api/pay/enroll/busy-times`(`enroll-ops.ts:782`), `/api/pay/*` 는 `index.ts:1645` 에서 통째 위임. **`src/index.ts` 무변경** |
| `busyTimesForTeacher()` 를 그대로 씀 | 사실 — 판정 복제 없음 |
| 학생 비밀번호 해시가 로그인과 같은 방식 | 사실 — SHA-256 + `\|mangoi-salt-2026`, 관리자용 `hashPassword()` 아님 |
| 캐시 TTL 30초 추가 | 사실 (`_EN_BUSY_TTL_MS`) |

**강사 번호 함정**(CLAUDE.md 2장)도 따로 확인했습니다 — `GET /api/admin/teachers` 가 주는 `id` 는 `teachers.id`,
`busyTimesForTeacher()` 가 보는 `class_schedules.teacher_id` 도 같은 번호 체계라 카페24 번호와 섞이지 않습니다.

### 2-3. 8/24 보고서(9쪽 뒤)의 「PR 승인 대기」 5건은 이미 병합돼 있었습니다

브랜치 `claude/student-password-min-length-vlz93d` 는 `main` 기준 **0 ahead** — 남은 것이 없습니다.

## 3. 검토에서 찾은 문제 1건 (고침)

로그인 버튼 리팩터(`b2be75c`) 때 `@media (max-width:640px)` 「헤더」 블록에서 규칙 **세 줄**이 지워졌는데,
같은 브랜치의 trap-check 가 `#user-menu`·`#login-btn` 두 줄만 되살리고 **`#lang-toggle` 한 줄이 빠져 있었습니다.**
바로 위 주석이 「이웃 칩(lang-toggle 등)과 마찬가지로 지우지 않는다」고 적어 둔 그 이웃입니다.

- **영향** — `ph50MoveChips()` 가 🌐 칩을 우상단 줄로 옮기기 **전** 잠깐, 381~640px 폭에서
  `padding`·`font-size`·`border-radius` 가 데스크톱 값으로 그려집니다.
  그 세 값은 `!important` 라 아래 `#lang-toggle.hero-chip-lang`(비-`!important`)을 이기고 있었습니다.
  `top`·`right` 는 `hero-chip-lang`(1,1,0)이 이미 이기고 있어 변화 없음.
  칩이 줄 안으로 들어간 뒤에는 `#ph50-chip-row > *`(문서 뒤쪽·`!important`)가 이기므로 어느 쪽이든 같습니다.
- **고침** — `main` 에 있던 줄을 글자 그대로 복원 + 왜 필요한지 주석 (`e37da62`)

### 🔎 이걸 어떻게 찾았나 — 다음 사람을 위해

`git diff main...브랜치` 를 **삭제줄까지 눈으로** 읽었습니다. 추가된 코드만 보면 안 보입니다.
그리고 「없어진 선택자」는 `git show main:파일 | grep -n "#선택자{"` 와 브랜치 쪽을 **나란히 세어** 확인했습니다.
문자열 하니스·타입체크·CI 게이트는 이걸 **한 건도** 잡지 못합니다(규칙이 «없어진» 것은 아무 검사에도 안 걸립니다).

## 4. 검토했다가 **하지 않은** 것

| 하지 않은 것 | 왜 |
|---|---|
| 원래 브랜치(`claude/login-button-placement-x4o5sa`)에 직접 커밋 | 다른 세션의 브랜치입니다. 이 세션의 지정 브랜치에 그대로 담아(fast-forward) 올렸습니다 |
| ≤640px `#login-btn:hover` 도 되살리기 | 옛 hover 는 앰버 틱트 `!important` 라 지금 골드 배경을 덮습니다. 터치 기기엔 hover 자체가 없어 되살리면 오히려 어긋납니다 — 일부러 두었습니다 |
| 보고서 2번(「수업 없음」 오판 팝업) 손대기 | 보고서 자체가 «정보 대기 중» 이라고 적은 미해결 건이고, 화상수업 입장 경로는 공동 금지구역입니다. 추측으로 고치지 않았습니다 |
| 이 컨테이너에서 배포된 화면 확인 | 프록시가 `mangoi.ai` 를 막습니다(실측: `CONNECT tunnel failed, 403`). CLAUDE.md 4-1-1 그대로 |

## 5. 확인한 방법

- `node node_modules/typescript/bin/tsc --noEmit` → **exit 0**
- `node test-harness/run.mjs --fast` → **PASS 205 / SKIP 20 / FAIL 0**
- `bash test-harness/ci-gates.sh` → 배포 게이트 **4종 통과**
- `first_paint_budget_harness` → 첫 화면 예산 유지(`index.html` blocking 1562KB)
- CI 배포 게이트(PR #483) — 09:30:09~09:31:50 **101초 success**
- 자동 배포(run 2680) — 09:32:24~09:34:49 **2분 25초 success**

⚠️ **처음 하니스를 돌렸을 때 FAIL 6 이 났습니다** — 이 컨테이너에 `node_modules` 가 없어서였고,
`main` 에서 똑같이 돌려 **같은 6건이 그대로 FAIL** 하는 것을 확인해 브랜치 탓이 아님을 가렸습니다.
설치는 `npm ci` 가 Node 22 에서 ERESOLVE 로 죽어(CLAUDE.md 2장) `--legacy-peer-deps` 로 했습니다. CI 는 Node 24 라 해당 없음.

## 6. 사람이 봐야 끝나는 것

- `public/index.html` 은 **공동 금지구역**입니다 — 배포 후 **PC·모바일 홈 화면**에서 로그인 버튼 위치와 🌐 칩 모양 확인
- 관리자 화면에서 HANNAH 화/목 21:10 이 실제로 🚫 로 막히는지
- 직접 입력한 비밀번호로 학생이 실제 로그인되는지
