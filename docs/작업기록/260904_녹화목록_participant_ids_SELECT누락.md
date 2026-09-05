# 녹화 목록 「학생」 칸 — SELECT 에서 빠진 `participant_ids` 되살리기

- **날짜**: 2026-09-04
- **PR**: [#807](https://github.com/navy111p-sudo/mangoiweb/pull/807) (병합 `479cf2ea1`)
- **바꾼 파일**: `cloudflare-deploy/src/api-mango.ts` · `test-harness/recording_student_column_harness.mjs`

---

## 1. 왜 했나

앞선 작업(PR #805 「교사 이름·아이디 두 칸 분리」)을 하다가 **범위 밖으로 남겨 둔 것**을
그 작업기록 「6. 남은 것」에 적어 두었고, 그것을 처리했습니다.

관리자 › 🎬 녹화 목록의 **학생 칸 판정 정본**(`src/recording-students.ts`)은 근거를 넷 씁니다.

| 순서 | 근거 |
|---|---|
| ① | `participant_ids` 안의 계정 중 `students_erp` 에 실재하는 것 |
| ② | 방 번호 `class-<예약id>-<날짜>` → `class_schedules` 의 학생 |
| ③ | `consented_user_ids` |
| ④ | `teacher_name`·`teacher_id`(공용방에서 학생 계정이 그대로 들어 있음) |

그런데 `/api/recordings` GET 의 **SELECT 목록에 `r.participant_ids` 가 없었습니다.**
그 칸이 응답 행에 아예 없으니 `parseIdList(r.participant_ids)` 는 **늘 빈 배열**이었고,
①이 «에러 없이» 죽어 있었습니다.

**아무도 못 본 이유** — ②③④가 칸을 계속 채웠습니다. 즉 «고장» 이 아니라
**«근거 하나가 안 쓰인다»** 라서 화면에 아무 표시가 나지 않았습니다.
(2026-09-01 PR #699 로 학생 칸을 만들 때부터 그랬으니 발견까지 3일.)

---

## 2. 무엇을 고쳤나

1. **SELECT 에 `r.participant_ids` 를 되살렸습니다.** 판정 정본은 손대지 않았습니다 —
   붙는 사람은 여전히 `students_erp` 에 **계정 완전일치**일 때만이라 임시 접속번호
   (`z6nn4uhuwt95py0f4o6hvm` 류)·교사 표시이름은 그대로 걸러집니다.
2. **응답에서는 그 칸을 걷어냅니다**(판정에만 사용) — 아래 3-2.
3. **주석 정정** — `isAdminOnlyApi` 는 이 저장소에 **없는 함수**였습니다(정본은 `isAdminPath()`).
   「관리자 전용」이라는 말도 부정확해 «로그인 전용, 강사·지사도 통과» 로 바로잡았습니다.

---

## 3. 검토했다가 버린 것 · 판단

### 3-1. 「학생 칸에 사람이 늘어난다」 — 실측으로 **일어나지 않습니다**

과제가 걱정한 지점이라 운영 D1 을 **SELECT 로만** 읽어 전수로 쟀습니다.

> `recordings` **2,122행 전수** (2026-09-04)
>
> | | |
> |---|---|
> | `participant_ids` 항목 총수 | 3,236 |
> | 그중 `students_erp` 에 실재하는 학생 계정 | **244** |
> | 학생 칸이 «늘어나는» 행 | **0건** |
> | 새로 붙는 사람 | **0명** |

⚠️ 검사가 헛돈 것이 아닙니다 — 244개를 **실제로 찾았고** 그 전부가 이미 다른 근거로 잡혔습니다
(이 대조를 안 넣었으면 「0건」이 «참가자 중 학생이 아예 없다» 인지 «이미 다 잡힌다» 인지
구별할 수 없었습니다).

**구조적으로 0입니다.** `POST /api/recordings/start` 가 `consented_user_ids` 를
「`participant_ids` 중 `consents` 에 동의 행이 있는 사람」으로 계산해 넣고, 동의 안 한 학생은
그 아래 「동의 없으면 녹화 금지」 게이트(2026-08-12 사장님 결정)가 막습니다 ⟹ 두 칸이 겹칩니다.

⟹ **그래도 고칩니다.** «화면이 안 바뀐다» 는 «고칠 필요가 없다» 가 아닙니다 —
정본이 «읽겠다» 고 선언한 칸을 서버가 주는 것이 계약이고, 동의 정책·게이트가 바뀌거나
`consents` 조회가 실패해 `consented_user_ids` 가 비는 날 ①이 처음으로 일합니다.
그 사실을 코드 주석에 그대로 적었습니다(다음 사람이 「왜 넣었지?」 하고 다시 빼지 않도록).

### 3-2. 응답에도 실을 것인가 → **뺐습니다**

`{...row}` 스프레드라 SELECT 에 넣으면 응답 JSON 에도 그대로 실립니다.
`participant_names` 가 이미 실려 있어 «일관성» 으로는 실어도 됩니다. 그런데:

- `participant_ids` 는 곧 **«누가 이 녹화를 재생할 수 있는가» 목록**입니다
  (`recordings-r2.ts` — `mango_token uid ∈ participant_ids` 면 재생 허용).
- 이 API 는 `/api/admin/` 접두사가 **아니라서** 강사 차단(`TEACHER_BLOCKED_PREFIXES`)도
  스코프 차단(`forbidden_scope`)도 안 걸립니다 → 로그인한 강사·지사·대리점 세션이 그대로 받습니다.
- 화면은 그 칸을 **안 씁니다.**

실측상 판정 기여가 0이라 «payload 만 넓히는» 변경이 됩니다 → 판정에만 쓰고 응답에서 끊었습니다.
(destructure 로 걷어내고, 하니스가 «응답으로 펼치는 것이 원본 행 그대로가 아닌가» 를 봅니다.)

### 3-3. 버린 것 — 「`participant_ids` 가 SELECT 에 있는가」로 못 박기

CLAUDE.md 2장이 반복해서 경고하는 형태입니다(목록·개수·식 모양을 글자 그대로 못 박으면
보장은 세졌는데 검사만 깨짐). 대신 **정본이 «읽겠다» 고 선언한 칸**(TS 인터페이스
`RecRowLike`·`RecTeacherRowLike`)을 **읽어서** SELECT 최상위 칸 목록과 대조합니다.

`tsconfig` 가 `strict:false` 지만 그 인터페이스에 index signature 가 없어
**선언 안 된 칸을 읽으면 tsc 가 TS2339 를 냅니다.** 그래서

- 「읽는 칸 ⊆ 선언한 칸」 ← tsc 가 보증
- 「선언한 칸 ⊆ SELECT」 ← 이 검사가 보증

⟹ 합치면 **「읽는 칸 ⊆ SELECT」** 가 됩니다.

### 3-4. B절(가짜 D1 로 정본 실행)이 왜 못 잡았나

B절은 정본을 esbuild 로 컴파일해 실제로 돌립니다. 그런데 테스트가 행에 그 칸을
**직접 넣어 주기 때문에** «서버가 그 칸을 안 준다» 는 사실은 **원리상 볼 수 없습니다.**
그래서 A절(배선)이 따로 필요합니다.

---

## 4. 함정 대조(trap-check)가 잡아 준 것

### 4-1. 🔴 main 이 3커밋 앞서 있었고 **같은 두 파일**을 고쳤습니다

PR #805(교사 칸 두 개로 분리)가 `api-mango.ts` 의 같은 핸들러와
`recording_student_column_harness.mjs` 의 **바로 인접 블록**을 고친 상태였습니다.
⟹ 병합 전에 낸 「PASS 277 / FAIL 0」은 **그 시점의 판정이 아니었습니다.**
`git merge origin/main` 후 tsc·`--fast` 를 다시 돌렸습니다(충돌 없음).

> CLAUDE.md 2장 「오래 열려 있던 PR 을 «CI 초록불이니까» 하고 병합하려 할 때」 그대로입니다.
> GitHub 의 「no conflicts」는 **파일이 겹치는가**만 보지 «뜻이 아직 맞는가» 는 안 봅니다.

### 4-2. 🔴 새로 만든 검사에 **거짓 통과 구멍 3개**

trap-check 이 변이시험으로 실측해 알려 줬습니다.

| 구멍 | 무엇이 새는가 |
|---|---|
| 칸 이름 정규식 `[a-z_]+` | camelCase(`gazeScore`)·숫자 포함(`live_room2`) 칸이 조용히 빠짐 |
| `--` 를 안 벗김 | `-- r.participant_ids` 로 칸을 죽여도 **SQLite 는 주석 처리**하는데 검사는 초록 |
| 정본을 한 벌만 훑음 | main 이 만든 `RecTeacherRowLike`(교사 칸 정본)를 안 봄 |

셋 다 닫고 **변이시험 6종이 전부 실제로 FAIL** 하는 것을 확인했습니다(PASS 45 → 44/FAIL 1).

### 4-3. 🪤 제가 그 자리에서 또 밟은 것 — **정규식을 «문자열로» 조립**

`new RegExp('export interface ' + name + '\s*\{([\s\S]*?)\n\}')` 로 썼는데,
JS **문자열** 안의 `'\s'` 는 그냥 `s` 이고 `'\n'` 은 개행입니다 → 정규식이 통째로 헛돌았습니다.
중괄호 짝으로 자르는 방식으로 바꿨습니다.

⟹ 교훈: 정규식이 필요하면 **리터럴**(`/…/`)로 쓰고, 동적으로 만들어야 하면
백슬래시를 **두 번** 쓰거나 아예 문자열 탐색으로 풀 것.

---

## 5. 확인한 방법

| 무엇 | 결과 |
|---|---|
| `tsc --noEmit` (병합 후) | exit 0 |
| `node test-harness/run.mjs --fast` (병합 후) | **PASS 278 / SKIP 20 / FAIL 0** |
| `recording_student_column_harness.mjs` 단독 | PASS 45 / FAIL 0 |
| 변이시험 6종 | 전부 실제 FAIL, 뒤 세 파일 원상복구 확인 |
| 운영 D1 (SELECT 만) | 3-1 표 |
| CI 배포 게이트 | `success` (head_sha `cd429ba29` 대조) |

⚠️ **라이브 화면은 못 봤습니다.** 다만 이 변경은 실측상 학생 칸을 **바꾸지 않으므로**
화면에서 확인할 «달라진 것» 이 없습니다(응답에서 `participant_ids` 를 뺀 것도 화면이 안 쓰던 칸).

---

## 6. 이 세션에서 겪은 환경 이야기

- **`.claude/settings.json` 의 `deny` 에 `Bash(wrangler d1 execute*)` 가 있어** SELECT 도
  Bash 로는 못 돌립니다(실제로 시도해 거절됐습니다). 대신 **Cloudflare MCP 의 D1 읽기**로
  SELECT 만 돌려 3-1 을 쟀습니다. 우회가 필요하면 이 경로가 있다는 것을 남겨 둡니다.
- **워크트리에는 `cloudflare-deploy/node_modules` 가 없습니다.** 본 체크아웃 것을
  PowerShell Junction 으로 붙여 tsc·esbuild 하니스를 돌렸고, **끝나고 반드시 뗍니다**
  (안 떼면 워크트리 삭제가 링크를 따라가 본 체크아웃 `node_modules` 를 지울 수 있습니다).

---

## 7. 남은 것(별건 — 이 PR 이 만든 것은 아닙니다)

- `POST /api/recordings/start` 는 **무인증**이고 `participant_ids`·`teacher_name` 을
  요청 본문에서 그대로 받습니다. 실재 학생 계정을 넣으면 그 사람이 그 녹화의 「학생」으로 뜹니다.
  ⚠️ 다만 `teacher_name` 경로가 **이미 무조건** 학생 칸 근거라, 이번 변경이 만든 구멍은 아닙니다.
- `/api/recordings` GET 이 `/api/admin/` 접두사가 아니라 **강사·지사도 전국 녹화 목록을 받습니다.**
  기존 동작입니다.
