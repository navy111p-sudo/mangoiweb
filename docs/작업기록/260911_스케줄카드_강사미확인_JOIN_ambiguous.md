# 학생 상세 「AI 등록 수업 스케줄」이 강사를 전부 「강사 미확인」으로 그리던 것 수리

- **날짜**: 2026-09-11
- **작업자**: Claude (사장님 제보)
- **브랜치 / PR**: `claude/bold-archimedes-ze7y7l` → [PR #937](https://github.com/navy111p-sudo/mangoiweb/pull/937) (병합 `c683f75`)

---

## 1. 왜 했나

사장님 제보 — **「여기 왜 강사가 미확인으로 뜨지?」**

관리자 › 학생 상세 › 스케줄 탭의 「🤖 AI 등록 수업 스케줄」 카드가 7건을 보여 주는데
담당 교사 자리가 **전부 「강사 미확인」** 이었습니다(정우영 학생).

그 칩은 하루 전([PR #933](https://github.com/navy111p-sudo/mangoiweb/pull/933), 같은 날 15:47 배포)에
처음 붙은 것입니다. 그전에는 그 카드가 담당 교사를 **한 글자도 안 그렸습니다.**

---

## 2. 무엇을 바꿨나

### `cloudflare-deploy/src/api-admin.ts` — `GET /api/admin/class-schedules` (6104~6215행)

WHERE 절의 컬럼에 **`cs.` 접두사**를 붙이고, 폴백 SQL(`sqlNoJoin`)에 `FROM class_schedules cs` 별칭을 줬습니다.

```diff
- const where: string[] = [`status != 'cancelled'`];
+ const where: string[] = [`cs.status != 'cancelled'`];
- where.push('user_id = ?');
+ where.push('cs.user_id = ?');
  … (scheduled_date · schedule_kind · student_name 도 같음)
```

**⛔ 서브쿼리 «안» 은 그대로 뒀습니다** — `SELECT COALESCE(user_id, login_id) FROM students_erp`
여기의 `user_id` 는 `students_erp` 의 칸입니다. `cs.` 를 붙이면 **상관 서브쿼리**가 되어
매 행마다 전수 스캔합니다(2026-08-27 실측 4.3초 / 2,348만 행).

### `test-harness/class_schedules_join_harness.mjs` — 신설 38종

화면(`admin/student.html`)과 데이터는 **한 줄도 안 건드렸습니다.**

---

## 3. 왜 그렇게 풀었나 — 원인과, 검토했다가 버린 방법

### 원인 — 폴백이 «조용히» 삼키고 있었습니다

`teachers` 표에는 **`status` 와 `user_id` 가 둘 다 있습니다**(운영 실측 스키마).
`class_schedules` 에도 그 두 칸이 있습니다. 그래서 JOIN 을 붙이는 순간:

```
ambiguous column name: status at offset 141: SQLITE_ERROR
```

운영 D1 에 옛 쿼리를 그대로 넣어 **직접 재현**했습니다. 그러면 `catch` 가
«JOIN 없는» 폴백으로 떨어뜨리는데, 그 SQL 에는 `teacher_name` 칸이 아예 없습니다.
화면의 `teacherLabel()` 은 «이름이 비었고 번호는 있다» → 규칙대로 「강사 미확인」.

**WHERE 첫 줄이 언제나 `status` 조건이라, 이 JOIN 은 도입 이래 한 번도 성공한 적이 없습니다.**
어제까지 아무도 몰랐던 것은 화면이 그 칸을 안 그렸기 때문입니다.

겹치는 칸을 실제로 구해 보면 이렇습니다:
`created_at` · `id` · `status` · `updated_at` · `user_id` — 다섯.

### 버린 방법

| 검토한 것 | 왜 버렸나 |
|---|---|
| **D1 데이터를 고친다**(강사 번호·이름 UPDATE) | **데이터가 멀쩡했습니다.** 7건 전부 `teacher_id='29'` 이고 원부 29번 = 중국어 강선생님. 애초에 고칠 것이 없었고, 개발·운영이 같은 DB 라 테스트 UPDATE 도 금지입니다(CLAUDE.md 1-1) |
| **화면 `teacherLabel()` 을 고쳐 번호라도 보여 준다** | 강사 번호는 **체계가 세 벌**(카페24 · 원부 `teachers.id` · 프로필)이라 숫자를 그대로 보여 주면 «누구인지» 를 잘못 읽습니다. 그 함수 주석이 이미 그렇게 못 박아 두었습니다 |
| **폴백(`sqlNoJoin`)을 없앤다** | `teachers` 표가 없는 환경에서 **목록이 통째로 안 나옵니다.** 이름만 없는 쪽이 낫습니다 |
| **`cs.` 를 전역 문자열 치환으로 붙인다** | 서브쿼리 안 `students_erp` 의 `user_id` 까지 걸려 **2026-08-27 전수 스캔 사고가 재현**됩니다. 그래서 `where.push` 를 하나씩 손으로 고치고, 각 치환이 «정확히 1회» 일어났는지 확인했습니다 |
| **폴백 SQL 은 그대로 둔다** | 두 SQL 이 **같은 where 문자열**을 씁니다. `cs.` 를 붙이면 폴백이 「no such column: cs.status」로 함께 죽습니다 → 별칭이 필요합니다 |
| **응답에 `teacher_join` 표시를 더하고 화면이 「조회 실패」라고 말하게 한다** | **옳은 방향이지만 지시 범위 밖**입니다(화면도 함께 고쳐야 의미가 있습니다). 5장에 남겼습니다 |
| **`ai_auto` 가드를 다른 화면 3곳에도 단다** | 같은 이유로 범위 밖이고, 지금 그 행은 **0건**입니다. 5장에 남겼습니다 |

### 감시를 «진짜 SQLite» 로 만든 이유

문자열 검사로는 이 자리를 **원리상** 못 봅니다 — SQL 은 «있고» 호출도 «되고»,
죽는 것은 실행뿐인데 폴백이 그것을 삼킵니다. 수리 전에도 `--fast` 가 전부 초록이었습니다.

기존 브라우저 검사(`manual/schedule-teacher-name-browser.mjs:106`)도 못 봅니다 —
그 API 를 **`teacher_name` 이 든 fixture 로 스텁**하기 때문입니다.

그래서 소스에서 두 SQL 을 **오려 내** 진짜 SQLite 에 prepare·실행합니다.
스키마도 하니스에 베끼지 않고 `ensurePayrollSchema` 의 CREATE·ALTER 를 **읽어서** 만듭니다.

---

## 4. 확인한 방법

### 운영 D1 (SELECT 만 · `status != 'cancelled'` 기준 · 2026-09-11 17시 KST)

| | |
|---|---|
| 옛 쿼리 | `ambiguous column name: status` 로 거절 — **직접 재현** |
| 고친 쿼리 | 예약 **1,262건이 1,262건 전부** 이름이 풀림 (미확인 **0건**) |
| 사장님 화면의 7건 | 848·849·850·851·2333·2334·2335 전부 「중국어 강선생님」 |

### 검사

- 신설 하니스 **38/0**
- **변이 8종 전부 실제 FAIL** — 원래 버그 되돌리기 2 · 폴백 별칭 제거 ·
  서브쿼리 SELECT 에 `cs.` · `teacher_name` 제거 · 정본 DDL 에서 `status` 제거 ·
  겹치는 칸을 접두사 없이 새 조건으로 · 서브쿼리가 바깥 컬럼 참조. 되돌리니 38/0 복귀
- `tsc --noEmit` 통과 · `run.mjs --fast` **PASS 322 / FAIL 0**
  (`origin/main` #934·#935 병합 후 재검증. 의존성을 `--legacy-peer-deps` 로 설치해
  이 컨테이너에서 평소 환경 사유로 빠지던 15건까지 전부 돌렸습니다)
- 형제 자리 전수 확인 — `class_schedules`×`teachers` JOIN 은 저장소에 **7곳**인데
  깨져 있던 곳은 **여기 하나**였습니다. 나머지는 이미 `cs.` 접두사이고,
  하니스 ⑥절이 `api-mango.ts` 쪽을 대조합니다
- CI 4종 게이트 통과(run #1166, 최신 sha 기준)

### 함정 대조(trap-check)가 잡은 것 — 🔴 없음, 🟡 7건 중 넷 반영

| 지적 | 한 것 |
|---|---|
| 하니스가 **자기가 적은 DDL 상수**를 검사 | 정본(`ensurePayrollSchema`)에서 CREATE·ALTER 를 읽어 실제로 표를 만들고 `pragma_table_info` 로 물음 |
| 시나리오를 **손으로 골라** 조합 → 미래 조건이 검사에 안 닿음 | ③-2 절 — **모든 조건을 AND 로 이어** 바인드 없이 prepare. `created_at` 을 접두사 없이 새 조건으로 넣어 보니 기존 ③은 통과하는데 ③-2 가 FAIL |
| 서브쿼리 검사가 **SELECT 목록만** 봄 | `EXPLAIN QUERY PLAN` 에 `CORRELATED` 가 없는지로. 서브쿼리 WHERE 의 `username` → `teacher_id` 로 바꾸니 2건 FAIL |
| 같은 날 숫자가 **1,262 대 1,263** | 세는 기준(`status != 'cancelled'` · 17시 KST)을 함께 적음 |

⚠️ **처음 돌린 변이 둘이 헛돌았습니다.** `source`·`student_name` 을 썼는데 그 둘은
두 표에 «겹치지 않아» ambiguous 가 안 납니다. **검사가 틀린 줄 알았지만 갈라 보니 변이 쪽이 틀렸습니다** —
겹치는 칸 목록을 실제로 구해 다시 했습니다.

⚠️ 그리고 첫 변이는 **하니스를 크래시**시켰습니다(씨앗 INSERT 가 `status` 를 써서 먼저 던짐).
스택트레이스만 남아 «무엇이 깨졌는지» 가 안 보입니다 → 씨앗에서 그 칸을 뺐습니다.

---

## 5. 남은 것 / 주의할 것

### 🟡 사람이 정할 일

1. **폴백이 여전히 «조용합니다».**
   `teacher_name` 이 없을 때 화면은 「강사 미확인」이라고만 하는데, 그것이
   **«원부에 없다»** 인지 **«못 물어봤다»** 인지 구분이 없습니다. 유일한 신호인
   `console.warn('[class-schedules] JOIN failed…')` 는 `wrangler.toml` 의
   **`head_sampling_rate = 0.05`** 라 **20번 중 19번은 로그도 안 남습니다.**
   응답에 칸 하나(`teacher_join: 'ok'|'fallback'`)를 더하면 모양을 안 깨고
   화면이 사실대로 말할 수 있습니다.

2. **`teacher_name` 이 다른 화면 3곳에서 «처음» 켜집니다.**
   그 칸은 그동안 **언제나 `undefined`** 였으므로, 이 수리는 그것을 읽던 곳을 전부 처음 동작시킵니다.

   | 화면 | 바뀌는 것 | `ai_auto` 가드 |
   |---|---|---|
   | `admin/student.html:2770` | 의도한 수리 | ✅ 있음 |
   | `admin.html:9485` `clsOn()` | 달력 수업검색이 **강사 이름으로 처음 검색됨** | ❌ 없음 |
   | `js/idx-user-session.js:1082` | 수업 모달 라벨이 `🤖 AI: 정규수업` → 실제 강사명 | ❌ 없음 |
   | `lesson-postpone-demo.html:1231` | `it.teacher_name` 이 처음 채워짐 | ❌ 없음 |

   `source='ai_auto'` 행은 `teacher_id` 에 **프로필 번호**를 넣는데 이 JOIN 은 그것을
   **원부 번호**로 읽습니다 — 겹치는 번호 26개가 **26개 전부 다른 사람**입니다.
   지금 그런 행은 **0건**이라 실피해는 없지만, 생기는 날 «남의 강사 이름»이 조용히 붙습니다.
   뿌리 수리는 **writer**(`POST /api/admin/schedule/approve`)가 원부 번호를 넣게 하는 것입니다.

3. **`lesson-postpone-demo.html`**(낮음) — `tobj = TEACHERS.find(x => x.name === tn) || TEACHERS[0]`
   에서 `tn` 은 **원부 이름**, `TEACHERS` 는 **프로필**에서 옵니다. 못 맞추면 이름은 진짜인데
   번호·아이콘이 `TEACHERS[0]` 이 됩니다. 서버로는 이름만 보내므로 쓰기 오염은 없고 데모 화면 표시만 어긋납니다.

### ❌ 못 한 것

- **배포된 화면 확인** — 프록시가 `mangoi.ai` 를 막아 Claude 는 배포된 화면을 못 봅니다.
  위 표의 **네 화면**은 사람이 한 번 봐야 끝입니다.
