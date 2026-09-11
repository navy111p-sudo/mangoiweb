/**
 * 🧹 학생 명부 «덮어쓰기 방지» 정본 — student_erp_override
 * ════════════════════════════════════════════════════════════════════════
 *
 * [왜 이 파일이 필요한가]
 *   `students_erp` 는 **카페24가 정본**이다. 매일 밤 03:00 KST 에
 *   `importCafe24Students()` 가 이렇게 한다:
 *       DELETE FROM students_erp WHERE created_at = CAFE24_STUDENT_SENTINEL   ← 전부 지우고
 *       INSERT OR REPLACE INTO students_erp (...)                             ← 카페24로 다시 채운다
 *   그래서 **D1 에서 손으로 고친 이름·지운 행은 하룻밤이면 사라진다.**
 *   (CLAUDE.md 2장 「대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨」과 같은 성질)
 *
 *   2026-08-20 사장님 지시가 정확히 그 벽에 부딪혔다 —
 *   같은 사람(정우영)의 계정이 카페24에 15개 있는데, 실제로 쓰는 것은 `jeong` 하나다.
 *   나머지 14개는 명부를 어지럽히고, 「어느 계정으로 들어가야 하나」를 매번 헷갈리게 한다.
 *   카페24 원본을 지우는 것이 정도(正道)지만, 카페24를 못 건드리는 동안에도
 *   화면에서는 한 계정만 보여야 한다.
 *
 * [그래서 하는 일 — 세 가지]
 *   ① 이름 덮어쓰기 : 동기화가 끝난 «직후» 우리 값을 다시 입힌다 (`applyStudentErpOverrides`)
 *   ② 명부에서 숨김 : students_erp 를 건드리지 않고 **읽는 쪽에서 거른다** (`hiddenExcludeCond`)
 *   ③ 관리자가 고친 개인정보 지키기 (2026-09-11 사장님 지시) — 아래 OVERRIDE_COLS
 *
 * [③ 이 왜 필요했나 — 관리자 화면의 「연락처·정보」 탭이 매일 밤 지워지고 있었다]
 *   그 탭(`public/admin/student.html`)은 주소·생년월일·카톡ID·메모·비밀번호까지 13칸을 고치고
 *   `PATCH /api/admin/student/:uid/contact` 로 students_erp 에 잘 저장한다. **그날 하루는.**
 *   위 INSERT OR REPLACE 의 컬럼 목록에 그 칸들이 없어서, 목록에 없는 칸은 NULL 이 된다 —
 *   즉 **주소를 넣고 다음 날 열면 비어 있었다.** 2026-08-18 에 전국 전화번호가 이 방식으로
 *   전멸한 것과 «똑같은 사고»가 나머지 칸에서 계속 일어나고 있었던 것이다.
 *
 *   ⚠️ 그 사고는 화면에 아무 표시도 남기지 않는다 — 저장은 «성공» 했고, 에러도 없고,
 *      다음 날 빈칸을 보는 사람은 「입력을 안 했나 보다」 라고 생각한다.
 *
 * [무엇을 지키고 무엇을 안 지키나 — 이 선을 옮기기 전에 반드시 읽을 것]
 *   ✅ 지킨다 = OVERRIDE_COLS : 연락·개인정보. 카페24가 **아예 안 주거나**(주소·생일·카톡·메모)
 *      주더라도 사람이 고친 쪽이 맞을 값(전화·학교·학년)들.
 *   ⛔ 안 지킨다 = shop_name · franchise (대리점·지사).
 *      **일부러 뺐다.** 이 둘은 정산 트리(org_nodes)와 권한 스코프를 만드는 값이라,
 *      여기서 고정해 버리면 학생이 실제로 다른 대리점으로 옮겨가도 영영 안 따라가고
 *      **수수료가 엉뚱한 곳으로 간다.** 조직 소속의 정본은 카페24다
 *      (CLAUDE.md 「대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨」과 같은 원칙).
 *      그래서 그 두 칸은 지금도 하룻밤이면 카페24 값으로 돌아가고, 화면이 그렇다고 말해 준다.
 *
 * [규칙 — 값이 있으면 고정, 비우면 해제]
 *   override 의 칸이 NULL 이면 «지정 없음» = 카페24 값을 그대로 쓴다.
 *   그래서 관리자가 칸을 **비워서 저장하면 지정이 풀리고** 다음 날 카페24 값으로 돌아온다.
 *   「잘못 고정한 것을 되돌리는 방법」이 화면 안에 있어야 해서 이렇게 정했다.
 *
 *   ⛔ 숨김을 `DELETE` 로 구현하지 말 것. 오늘 밤 되살아나고, 그 사이 붙어 있던
 *      출석·포인트 기록만 주인을 잃는다. 숨김은 «보여주지 않는 것» 이지 «지우는 것» 이 아니다.
 *
 * [고칠 때 반드시 같이 볼 곳 — 붙이는 쪽과 읽는 쪽은 짝이다]
 *   붙임 : cafe24-sync.ts `importCafe24Students()` 마지막 페이지에서 ①
 *   읽음 : api-admin.ts  `/api/admin/students/unified`   (학생 명부 카드)
 *          api-mango.ts  `/api/admin/students/erp-list`  (여러 화면이 공유하는 명부)
 *          api-mango.ts  `/api/admin/omnisearch`         (상단 통합검색)
 *          api-students.ts `/api/student/login`          (숨긴 계정은 로그인도 막는다)
 *   한쪽만 고치면 「사이드바엔 없는데 본문엔 있는」 류의 불일치가 난다.
 *
 * ⚠️ 새 /api 경로는 만들지 않는다 — `src/index.ts` 는 공동 금지구역이라
 *    라우팅·인증 게이트를 건드려야 하는 신설 경로를 여기서 만들 수 없다.
 *    지정은 D1 에 직접 넣는다(건수가 적고 자주 바뀌지 않는다).
 */

export interface OverrideEnv { DB: D1Database; [k: string]: any }

/**
 * 관리자가 고쳤을 때 «야간 동기화로부터 지켜지는» 칸들.
 *
 * ⛔ 여기에 `shop_name`·`franchise` 를 넣지 말 것 — 머리말 「무엇을 지키고 무엇을 안 지키나」 참고.
 *    정산 수수료가 엉뚱한 곳으로 갑니다.
 * ⚠️ 칸을 더하면 **세 곳이 짝**입니다: 이 목록 · `students_erp` 에 그 칸이 있는지
 *    (`ensureStudentDetailSchema`) · `PATCH /api/admin/student/:uid/contact` 의 `allowed`.
 *    하나만 고치면 「저장은 되는데 다음 날 사라지는」 지금 그 증상이 그대로 재현됩니다.
 */
export const OVERRIDE_COLS = [
  'student_phone', 'parent_phone', 'teacher_phone',
  'kakao_id', 'parent_kakao_id',
  'school', 'grade', 'birth_date', 'address', 'notes',
  'password_hash',
] as const;
export type OverrideCol = typeof OVERRIDE_COLS[number];

/** 이 isolate 에서 테이블 보장을 이미 했는지 — cold start 당 1회만 CREATE 를 때린다. */
let _ensured = false;

/**
 * 표가 없으면 만든다. **실패해도 throw 하지 않는다**(false 를 돌려준다).
 *
 * ⚠️ 이 fail-open 이 핵심이다. 읽는 쪽은 이 표를 «서브쿼리» 로 참조하는데,
 *    표가 없는 상태에서 서브쿼리를 그대로 붙이면 `no such table` 이 나고,
 *    erp-list 처럼 에러를 삼켜 빈 배열을 돌려주는 곳에서는
 *    **학생 29,000명 명부가 통째로 사라진 것처럼 보인다.**
 *    「14개가 다시 보이는 것」과 「전체가 사라지는 것」 중 전자가 압도적으로 낫다.
 */
export async function ensureStudentOverrideTable(env: OverrideEnv): Promise<boolean> {
  if (_ensured) return true;
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_erp_override (user_id TEXT PRIMARY KEY, korean_name TEXT, hidden INTEGER NOT NULL DEFAULT 0, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER)`);
    /* 🧷 (2026-09-11) 이미 운영에 있는 표에 개인정보 칸을 덧붙인다.
       ⚠️ 값싼 «탐침» 을 먼저 던진다 — 칸이 이미 다 있으면 ALTER 를 한 번도 안 친다.
          아무 확인 없이 매번 ALTER 를 돌리면 cold start 마다 실패하는 왕복이 10여 번 쌓이고,
          그 비용을 필리핀 회선이 전부 떠안는다. `address` 를 대표로 본다(가장 나중에 더한 칸).
       ⚠️ students_erp 쪽에도 같은 칸이 있어야 한다 — 없으면 아래 applyStudentErpOverrides 의
          UPDATE 가 통째로 실패해서 **이름 지정까지 같이 죽는다.** 그래서 여기서 함께 보강한다.
          (그 경우에도 살아남도록 applyStudentErpOverrides 에 폴백을 따로 뒀다) */
    let needCols = false;
    try { await env.DB.prepare(`SELECT address FROM student_erp_override LIMIT 1`).first(); }
    catch { needCols = true; }
    if (needCols) {
      for (const c of OVERRIDE_COLS) {
        try { await env.DB.exec(`ALTER TABLE student_erp_override ADD COLUMN ${c} TEXT`); } catch {}
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${c} TEXT`); } catch {}
      }
    }
    _ensured = true;
    return true;
  } catch {
    return false;
  }
}

/**
 * 「숨긴 계정 제외」 조건절을 돌려준다. 표를 보장하지 못했으면 **빈 문자열**(=거르지 않음).
 *
 * @param alias students_erp 에 붙인 별칭. 없으면 'students_erp' 를 그대로 쓴다.
 * @example
 *   const ex = await hiddenExcludeCond(env, 's');
 *   if (ex) conds.push(ex);
 */
export async function hiddenExcludeCond(env: OverrideEnv, alias?: string): Promise<string> {
  if (!(await ensureStudentOverrideTable(env))) return '';
  const col = `${alias ? alias + '.' : ''}user_id`;
  return `${col} NOT IN (SELECT user_id FROM student_erp_override WHERE hidden = 1)`;
}

/** 이 계정이 숨김 지정돼 있나 — 로그인 차단용 단건 조회. 표가 없으면 항상 false. */
export async function isStudentHidden(env: OverrideEnv, userId: string): Promise<boolean> {
  if (!userId) return false;
  if (!(await ensureStudentOverrideTable(env))) return false;
  try {
    const r = await env.DB.prepare(
      `SELECT 1 AS h FROM student_erp_override WHERE user_id = ? AND hidden = 1 LIMIT 1`
    ).bind(userId).first<{ h: number }>();
    return !!r;
  } catch {
    return false;
  }
}

/**
 * 지정한 이름을 students_erp 에 다시 입힌다 — **카페24 동기화 «직후» 에 부른다.**
 *
 * ⚠️ 순서가 전부다. 동기화 «전» 에 부르면 그 뒤 INSERT OR REPLACE 가 도로 덮는다.
 * ⚠️ korean_name 과 username 을 함께 고친다 — 화면·검색이 둘 중 아무거나 읽는다
 *    (`COALESCE(korean_name, student_name, username, user_id)` 같은 식이 여러 곳에 있다).
 * @returns 실제로 이름이 바뀐 행 수. 실패해도 throw 하지 않고 -1.
 */
export async function applyStudentErpOverrides(env: OverrideEnv): Promise<number> {
  if (!(await ensureStudentOverrideTable(env))) return -1;

  /** 이름 지정만 되돌리는 «예전 그대로» 문장 — 아래 확장판이 실패했을 때의 안전망. */
  const NAME_ONLY = `UPDATE students_erp
          SET korean_name = (SELECT o.korean_name FROM student_erp_override o WHERE o.user_id = students_erp.user_id),
              username    = (SELECT o.korean_name FROM student_erp_override o WHERE o.user_id = students_erp.user_id)
        WHERE user_id IN (SELECT user_id FROM student_erp_override
                           WHERE korean_name IS NOT NULL AND TRIM(korean_name) <> '')`;

  /* 지정이 «있는 칸만» 되돌린다 — NULL 은 «지정 없음» 이라 카페24 값을 그대로 둔다.
     COALESCE 로 칸마다 따로 판단하므로, 주소만 지정한 학생의 학교가 덩달아 덮이지 않는다. */
  const sub = (c: string) => `(SELECT o.${c} FROM student_erp_override o WHERE o.user_id = students_erp.user_id)`;
  const name = `NULLIF(TRIM(COALESCE(${sub('korean_name')}, '')), '')`;
  const sets = [
    `korean_name = COALESCE(${name}, korean_name)`,
    `username    = COALESCE(${name}, username)`,
    ...OVERRIDE_COLS.map(c => `${c} = COALESCE(${sub(c)}, ${c})`),
  ];

  try {
    const r = await env.DB.prepare(
      `UPDATE students_erp SET ${sets.join(', ')}
        WHERE user_id IN (SELECT user_id FROM student_erp_override)`
    ).run();
    return Number(r.meta?.changes ?? 0);
  } catch {
    /* 🛟 확장판이 실패했다(칸 하나가 없는 등). 그래도 **이름 지정은 반드시 살려야 한다** —
       여기서 그냥 -1 을 돌려주면 「정우영」이 하룻밤에 「jeong」으로 돌아간다.
       개인정보 칸은 이번 밤만 못 지키고, 다음 배포에서 칸이 갖춰지면 다시 지켜진다. */
    try {
      const r2 = await env.DB.prepare(NAME_ONLY).run();
      return Number(r2.meta?.changes ?? 0);
    } catch {
      return -1;
    }
  }
}

/**
 * 🧷 관리자가 고친 값을 «지켜지는 표» 에 적어 둔다 — 오늘 밤 동기화가 지우지 못하게.
 *
 * 부르는 쪽(`PATCH /api/admin/student/:uid/contact`)은 students_erp 를 이미 고쳤다.
 * 그건 «오늘 화면에 보이게» 하는 일이고, 이 함수는 «내일도 남게» 하는 일이다. 둘 다 필요하다.
 *
 * @param userId  students_erp 의 정본 아이디. 별칭(student_id·login_id)이 아니라 user_id 여야 한다 —
 *                야간 동기화가 user_id 로 다시 채우므로, 다른 값을 적으면 아무것도 안 지켜진다.
 * @param values  고친 칸들. `OVERRIDE_COLS` 에 없는 칸은 조용히 버린다(대리점·지사가 그렇다).
 *                값이 `null`/`''` 이면 **지정 해제** — 내일부터 카페24 값으로 돌아간다.
 * @returns 실제로 적은 칸 수. 실패해도 throw 하지 않고 -1 (연락처 저장 자체를 깨면 안 된다).
 */
export async function rememberStudentOverrides(
  env: OverrideEnv, userId: string, values: Record<string, any>
): Promise<number> {
  if (!userId) return -1;
  if (!(await ensureStudentOverrideTable(env))) return -1;
  const cols = (OVERRIDE_COLS as readonly string[]).filter(c => values[c] !== undefined);
  if (!cols.length) return 0;
  try {
    const now = Date.now();
    // 행이 없으면 먼저 만든다 — created_at 은 NOT NULL 이라 반드시 넣어야 한다.
    await env.DB.prepare(
      `INSERT INTO student_erp_override (user_id, created_at, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO NOTHING`
    ).bind(userId, now, now).run();
    await env.DB.prepare(
      `UPDATE student_erp_override SET ${cols.map(c => `${c} = ?`).join(', ')}, updated_at = ?
        WHERE user_id = ?`
    ).bind(...cols.map(c => (values[c] === '' ? null : values[c])), now, userId).run();
    return cols.length;
  } catch {
    return -1;
  }
}
