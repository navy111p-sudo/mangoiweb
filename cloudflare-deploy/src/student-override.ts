/**
 * 🧹 학생 명부 «덮어쓰기 방지» 정본 — student_erp_override
 * ════════════════════════════════════════════════════════════════════════
 *
 * [왜 이 파일이 필요한가]
 *   `students_erp` 는 **카페24가 정본**이다. 매일 밤 03:00 KST 에
 *   `importCafe24Students()` 가 이렇게 한다:
 *       DELETE FROM students_erp WHERE created_at = CAFE24_STUDENT_SENTINEL   ← 전부 지우고
 *       UPSERT(ON CONFLICT DO UPDATE) INTO students_erp (...)                             ← 카페24로 다시 채운다
 *      ⚠️ (2026-08-28) 그 UPSERT 는 이제 «카페24 칸만» 덮는다 — password_hash·parent_user_id·
 *         eval_band 가 든 행은 DELETE 도 비켜 간다. 그래도 korean_name 은 카페24가 덮으므로
 *         이 파일(지정 재적용)이 여전히 필요하다.
 *   그래서 **D1 에서 손으로 고친 이름·지운 행은 하룻밤이면 사라진다.**
 *   (CLAUDE.md 2장 「대리점의 지사 소속을 D1에서 고쳤는데 다음날 원복됨」과 같은 성질)
 *
 *   2026-08-20 사장님 지시가 정확히 그 벽에 부딪혔다 —
 *   같은 사람(정우영)의 계정이 카페24에 15개 있는데, 실제로 쓰는 것은 `jeong` 하나다.
 *   나머지 14개는 명부를 어지럽히고, 「어느 계정으로 들어가야 하나」를 매번 헷갈리게 한다.
 *   카페24 원본을 지우는 것이 정도(正道)지만, 카페24를 못 건드리는 동안에도
 *   화면에서는 한 계정만 보여야 한다.
 *
 * [그래서 하는 일 — 두 가지뿐]
 *   ① 이름 덮어쓰기 : 동기화가 끝난 «직후» 우리 값을 다시 입힌다 (`applyStudentErpOverrides`)
 *   ② 명부에서 숨김 : students_erp 를 건드리지 않고 **읽는 쪽에서 거른다** (`hiddenExcludeCond`)
 *                     ⚠️ (2026-09-01) 카페24 미러도 읽는 쪽에 합류했다. 다만 «거르기» 가 아니라
 *                        «숨긴 목록을 받아»(`loadHiddenStudents`) 사실대로 말한다 — 그 이유는 아래 함수 주석.
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
 *          c24-mirror.ts   planMirror()                  (숨긴 계정의 카페24 수업은 안 만든다)
 *   한쪽만 고치면 「사이드바엔 없는데 본문엔 있는」 류의 불일치가 난다.
 *
 * ⚠️ 새 /api 경로는 만들지 않는다 — `src/index.ts` 는 공동 금지구역이라
 *    라우팅·인증 게이트를 건드려야 하는 신설 경로를 여기서 만들 수 없다.
 *    지정은 D1 에 직접 넣는다(건수가 적고 자주 바뀌지 않는다).
 */

import { selectInChunks } from './d1-chunk';

export interface OverrideEnv { DB: D1Database; [k: string]: any }

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
  try {
    const r = await env.DB.prepare(
      `UPDATE students_erp
          SET korean_name = (SELECT o.korean_name FROM student_erp_override o WHERE o.user_id = students_erp.user_id),
              username    = (SELECT o.korean_name FROM student_erp_override o WHERE o.user_id = students_erp.user_id)
        WHERE user_id IN (SELECT user_id FROM student_erp_override
                           WHERE korean_name IS NOT NULL AND TRIM(korean_name) <> '')`
    ).run();
    return Number(r.meta?.changes ?? 0);
  } catch {
    return -1;
  }
}

/**
 * 🪞 (2026-09-01) 넘긴 계정들 중 «명부에서 숨긴» 것만 골라 돌려준다.
 *
 * [왜 조건절(hiddenExcludeCond)이 아니라 목록인가]
 *   조건절로 거르면 숨긴 학생이 조회에서 그냥 «없는 학생» 이 된다.
 *   카페24 미러에서 그러면 판정이 no_student(「학생 계정이 없습니다」)가 되는데 그것은 **거짓**이고,
 *   화면에 빨간 경고로 떠서 «고쳐야 할 것» 처럼 보인다. 실제로는 «일부러 뺀 것» 이다.
 *   그래서 목록으로 받아 부르는 쪽이 «숨긴 것» 이라고 사실대로 말할 수 있게 한다.
 *
 * ⚠️ fail-open — 표가 없거나 조회가 실패하면 «숨긴 사람 없음»(빈 집합)으로 돌려준다.
 *    이 값은 «빼는» 데 쓰이므로, 못 읽었을 때 아무도 안 빠지는 쪽이 안전하다
 *    (거꾸로 전원을 뺐다가는 시간표가 통째로 안 만들어진다).
 * ⚠️ IN 목록은 손으로 자르지 않는다 — D1 바인드 100개 한도는 공용 헬퍼가 센다(CLAUDE.md 2장).
 */
export async function loadHiddenStudents(env: OverrideEnv, uids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const want = Array.from(new Set(uids.filter(Boolean)));
  if (!want.length) return out;
  try {
    const rows = await selectInChunks<any>(
      env.DB, want,
      (ph) => `SELECT user_id FROM student_erp_override WHERE hidden = 1 AND user_id IN (${ph})`,
      { swallowErrors: true },
    );
    for (const r of rows) if (r && r.user_id) out.add(String(r.user_id));
  } catch { /* fail-open */ }
  return out;
}
