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
 * [그래서 하는 일 — 세 가지]
 *   ① 이름 덮어쓰기 : 동기화가 끝난 «직후» 우리 값을 다시 입힌다 (`applyStudentErpOverrides`)
 *   ② 명부에서 숨김 : students_erp 를 건드리지 않고 **읽는 쪽에서 거른다** (`hiddenExcludeCond`)
 *                     ⚠️ (2026-09-01) 카페24 미러도 읽는 쪽에 합류했다. 다만 «거르기» 가 아니라
 *                        «숨긴 목록을 받아»(`loadHiddenStudents`) 사실대로 말한다 — 그 이유는 아래 함수 주석.
 *   ③ 전화번호 보관 : 우리 화면에서 받은 번호를 **여기에** 둔다 (`setOverridePhones`/`getOverridePhones`)
 *   ④ 가맹점·소속 보관 : 관리자가 학생 상세에서 고친 franchise·shop_name 을 **여기에** 둔다
 *      (`setOverrideOrgField`/`getOverrideOrg`) — 아래 [④ 는 왜 여기인가] 참고.
 *
 * [③ 은 왜 여기인가 — 2026-09-10]
 *   `students_erp` 의 phone·student_phone·parent_phone 은 카페24 UPSERT 의 SET 목록에 들어 있어
 *   **매일 밤 덮인다.** 실측: 그 표 29,485행의 번호 칸 네 개가 전부 0건이고, 8월에 수업 리마인더
 *   문자가 실제로 나갔던 체험계정 세 개(lt15·lt16·lt18)는 지금 번호를 잃어 다시 못 보낸다.
 *   그래서 리마인더가 7일간 671건의 수업을 정확히 찾고도 **한 통도 못 보냈다.**
 *   ⟹ 받는 것은 우리 화면에서, 두는 것은 동기화가 안 건드리는 이 표에서.
 *   읽는 쪽 정본은 `notify-contacts.ts` 의 `phonesForStudent` 하나다 — 거기서 이 표를 «먼저» 본다.
 *   ⛔ 번호 판정을 다른 파일에 복제하지 말 것(규칙서 2장 — no-show-truth.ts 가 그 선례).
 *
 *   ⛔ 숨김을 `DELETE` 로 구현하지 말 것. 오늘 밤 되살아나고, 그 사이 붙어 있던
 *      출석·포인트 기록만 주인을 잃는다. 숨김은 «보여주지 않는 것» 이지 «지우는 것» 이 아니다.
 *
 * [④ 는 왜 여기인가 — 2026-09-15]
 *   `students_erp.franchise`·`shop_name` 도 카페24 UPSERT 의 SET 목록에 있어 **매일 밤 덮인다**
 *   (cafe24-sync.ts — `franchise = excluded.franchise` 는 카페24 쪽 값이 비어도 그대로 NULL 을
 *   덮어쓴다). 그래서 사장님 제보(「학생 정보 화면 왼쪽에 가입일·가맹점이 비어있다」)를 보고 관리자가
 *   상세 화면에서 가맹점을 손으로 채워도, **아무 안전장치가 없으면 오늘 밤 다시 비워진다** — 위
 *   ③ 전화번호가 겪었던 것과 정확히 같은 사고(2026-09-10)를 franchise 칸에서 반복하게 된다.
 *   ⟹ 이름·전화번호와 같은 자리에, 같은 «지정 후 재적용» 방식으로 지킨다.
 *   ⛔ `setOverridePhones` 처럼 **한 호출에 두 필드(franchise+shop_name)를 함께 넘기지 말 것** —
 *      그 함수의 clear 가 «필드별» 이 아니라 «호출 전체」 로 걸려 있던 것이 trap-check 로 드러난
 *      사고(2026-09-15, 위 PATCH 핸들러 주석)라, `setOverrideOrgField` 는 아예 **한 번에 한 필드만**
 *      받도록 시그니처 자체를 그렇게 만들었다(호출자가 규율을 지킬 필요가 없게).
 *
 * [고칠 때 반드시 같이 볼 곳 — 붙이는 쪽과 읽는 쪽은 짝이다]
 *   붙임 : cafe24-sync.ts `importCafe24Students()` 마지막 페이지에서 ①·④ 모두
 *   읽음 : api-admin.ts  `/api/admin/students/unified`   (학생 명부 카드)
 *          api-mango.ts  `/api/admin/students/erp-list`  (여러 화면이 공유하는 명부)
 *          api-mango.ts  `/api/admin/omnisearch`         (상단 통합검색)
 *          api-students.ts `/api/student/login`          (숨긴 계정은 로그인도 막는다)
 *          c24-mirror.ts   planMirror()                  (숨긴 계정의 카페24 수업은 안 만든다)
 *   ④ 쓰는 쪽 : api-mango.ts `PATCH /api/admin/student/:uid/contact` (franchise·shop_name 을
 *              고쳤을 때 `setOverrideOrgField` 를 필드마다 따로 부른다)
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
    /* 📞 (2026-09-10) 전화번호 보관 — 세 번째 용도. 이유는 파일 머리말의 «③ 전화번호» 절.
       지연 ALTER 인 이유: 이 표는 이미 운영에 있고, CREATE 문만 고치면 **기존 표에는 칸이
       안 생긴다**(규칙서 2장 「students_erp 에 id 컬럼이 없습니다」와 같은 함정).
       ⚠️ 실패해도 넘어간다 — 칸이 없으면 아래 조회들이 빈 값을 돌려주고, 그건 «고치기 전» 과 같다. */
    for (const col of ['parent_phone TEXT', 'student_phone TEXT', 'phone_by TEXT', 'phone_at INTEGER']) {
      try { await env.DB.exec(`ALTER TABLE student_erp_override ADD COLUMN ${col}`); } catch { /* 이미 있음 */ }
    }
    /* 🏢 (2026-09-15) 가맹점·소속 보관 — 이유는 파일 머리말의 «④ 가맹점·소속» 절. 지연 ALTER 인
       이유는 위 전화번호 칸과 같다(CREATE 문만 고치면 이미 운영에 있는 표에는 칸이 안 생긴다). */
    for (const col of ['franchise TEXT', 'shop_name TEXT', 'org_by TEXT', 'org_at INTEGER']) {
      try { await env.DB.exec(`ALTER TABLE student_erp_override ADD COLUMN ${col}`); } catch { /* 이미 있음 */ }
    }
    _ensured = true;
    return true;
  } catch {
    return false;
  }
}

/** 숫자만 남긴다 — 형식이 아니라 «있는가» 만 본다(국가별 표기가 섞여 있다). notify-contacts.ts 와 같은 규칙. */
function normPhone(v: any): string {
  const s = String(v ?? '').replace(/[^0-9]/g, '');
  return s.length >= 9 ? s : '';
}

/** 한 사람의 «우리가 받아 둔» 번호. 못 찾으면 빈 문자열(= 명부로 떨어지라는 뜻). */
export interface OverridePhones { parent: string; student: string }
const NO_PHONES: OverridePhones = { parent: '', student: '' };

/**
 * 📞 우리가 화면에서 받아 둔 번호를 읽는다 — **카페24 야간 동기화가 못 건드리는 자리.**
 *
 * ⚠️ fail-open — 표·칸이 없거나 조회가 실패하면 빈 값을 돌려준다. 부르는 쪽은 그때
 *    학생 명부(`students_erp`)로 떨어지므로 «고치기 전» 과 똑같이 동작한다.
 *    거꾸로 여기서 throw 하면 수업 리마인더 전체가 그 자리에서 멈춘다.
 * ⚠️ 대소문자 — `user_id` 는 BINARY 라 `Kim`/`kim` 이 갈린다. 로그인·notify-contacts 와
 *    같은 규칙으로 «정확일치 우선, 없으면 대소문자 무시» 로 찾는다(규칙서 2장).
 */
export async function getOverridePhones(env: OverrideEnv, userId: string): Promise<OverridePhones> {
  const u = String(userId || '').trim();
  if (!u) return NO_PHONES;
  if (!(await ensureStudentOverrideTable(env))) return NO_PHONES;
  try {
    const row: any = await env.DB.prepare(
      `SELECT parent_phone, student_phone FROM student_erp_override
        WHERE user_id = ? COLLATE NOCASE
        ORDER BY (user_id = ?) DESC, user_id ASC LIMIT 1`,
    ).bind(u, u).first();
    if (!row) return NO_PHONES;
    return { parent: normPhone(row.parent_phone), student: normPhone(row.student_phone) };
  } catch (e: any) {
    console.warn('[student-override] 번호 조회 실패:', e?.message, 'uid=', u);
    return NO_PHONES;
  }
}

/**
 * 📞 여러 계정의 번호를 한 번에 — 목록 화면이 «번호가 있는가» 를 칸으로 보여줄 때 쓴다.
 * ⚠️ IN 목록은 손으로 자르지 않는다(D1 바인드 100개 한도는 공용 헬퍼가 센다 — 규칙서 2장).
 * ⚠️ 여기는 정확일치로만 찾는다 — 여러 명을 한꺼번에 볼 때 대소문자 후보를 섞으면
 *    누구의 번호인지가 흐려진다. 단건 조회(위)가 그 폴백을 담당한다.
 */
export async function loadOverridePhones(env: OverrideEnv, uids: string[]): Promise<Map<string, OverridePhones>> {
  const out = new Map<string, OverridePhones>();
  const want = Array.from(new Set(uids.filter(Boolean).map(u => String(u).trim())));
  if (!want.length) return out;
  if (!(await ensureStudentOverrideTable(env))) return out;
  try {
    const rows = await selectInChunks<any>(
      env.DB, want,
      (ph) => `SELECT user_id, parent_phone, student_phone FROM student_erp_override WHERE user_id IN (${ph})`,
      { swallowErrors: true },
    );
    for (const r of rows) {
      if (!r || !r.user_id) continue;
      const p = { parent: normPhone(r.parent_phone), student: normPhone(r.student_phone) };
      if (p.parent || p.student) out.set(String(r.user_id), p);
    }
  } catch { /* fail-open — 번호 칸이 비어 보일 뿐 */ }
  return out;
}

/**
 * 📞 번호를 적어 둔다 — 수강신청 등록 화면이 부른다.
 *
 * ⛔ `students_erp` 에 직접 쓰지 말 것. 그 표의 phone·parent_phone·student_phone 은
 *    카페24 동기화의 UPSERT SET 목록에 들어 있어 **매일 밤 03:00 KST 에 덮인다**
 *    (실측 2026-09-10: 8월에 문자가 나갔던 체험계정 lt15·lt16·lt18 이 그렇게 번호를 잃었다).
 *
 * ⚠️ 빈 값을 넘기면 그 칸은 **안 건드린다**(지우지 않는다). 지우려면 `clear` 를 쓴다 —
 *    「아직 안 받았다」와 「지웠다」를 한 값으로 뭉개면 되돌릴 수가 없다.
 * ⚠️ `clear` 도 **넘긴 칸만** 지운다. 학부모 번호를 지우러 온 요청이 학생 번호까지 NULL 로
 *    만들면 그 뒤 문자가 조용히 한 통만 나간다 — 위 COALESCE 가 막으려던 것과 같은 사고다
 *    (처음에 clear 경로가 그 보호를 비켜 가 있었고, 함정 대조가 잡았다).
 * @returns 저장에 성공했나. **실패를 삼키지 않는다** — 부르는 쪽이 사람에게 말해야 한다
 *          (조용히 실패하면 「입력했는데 문자가 안 온다」가 되고 아무도 이유를 모른다).
 */
export async function setOverridePhones(
  env: OverrideEnv,
  userId: string,
  phones: { parent?: any; student?: any; clear?: boolean },
  by?: string,
): Promise<{ ok: boolean; parent: string; student: string; reason?: string }> {
  const u = String(userId || '').trim();
  if (!u) return { ok: false, parent: '', student: '', reason: 'no_uid' };
  const parent = normPhone(phones?.parent);
  const student = normPhone(phones?.student);
  /* `clear` 는 **넘긴 칸만** 지운다 — 어느 칸을 지울지는 그 키를 넘겼는지로 본다
     (값이 빈 문자열이어도 «그 칸을 지우겠다» 는 뜻이다). 안 넘긴 칸은 아래 SQL 이 그대로 둔다.
     ⚠️ `{clear:true}` 만 넘기면 «무엇을 지울지» 를 모른다 — 그때는 아무것도 안 하고 거절한다.
        말 없이 둘 다 지우면 학부모 번호를 지우러 온 요청이 학생 번호까지 없애고,
        그 뒤 문자가 조용히 한 통만 나간다. */
  const clear = !!phones?.clear;
  const clearParent = clear && phones?.parent !== undefined;
  const clearStudent = clear && phones?.student !== undefined;
  if (clear && !clearParent && !clearStudent) {
    return { ok: false, parent: '', student: '', reason: 'clear_needs_field' };
  }
  if (!clear && !parent && !student) return { ok: false, parent: '', student: '', reason: 'no_phone' };
  if (!(await ensureStudentOverrideTable(env))) return { ok: false, parent, student, reason: 'no_table' };
  const now = Date.now();
  try {
    /* ⚠️ COALESCE 로 «안 넘긴 칸은 그대로» 둔다. 학부모 번호만 고치러 온 요청이
       학생 번호를 NULL 로 지우면, 그 뒤 문자가 조용히 한 통만 나간다. */
    await env.DB.prepare(
      `INSERT INTO student_erp_override (user_id, hidden, parent_phone, student_phone, phone_by, phone_at, created_at, updated_at)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         parent_phone  = ${clearParent ? '?' : 'COALESCE(NULLIF(?, \'\'), parent_phone)'},
         student_phone = ${clearStudent ? '?' : 'COALESCE(NULLIF(?, \'\'), student_phone)'},
         phone_by = ?, phone_at = ?, updated_at = ?`,
    ).bind(
      u, parent || null, student || null, by || null, now, now, now,
      clearParent ? (parent || null) : parent,
      clearStudent ? (student || null) : student,
      by || null, now, now,
    ).run();
    return { ok: true, parent, student };
  } catch (e: any) {
    console.warn('[student-override] 번호 저장 실패:', e?.message, 'uid=', u);
    return { ok: false, parent, student, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** 한 사람의 «우리가 지정해 둔» 가맹점·소속. 못 찾으면 빈 문자열(= students_erp 값을 그대로 쓰라는 뜻). */
export interface OverrideOrg { franchise: string; shop_name: string }
const NO_ORG: OverrideOrg = { franchise: '', shop_name: '' };

/**
 * 🏢 우리가 화면에서 고쳐 둔 가맹점·소속을 읽는다 — **카페24 야간 동기화가 못 건드리는 자리.**
 * ⚠️ fail-open — 표·칸이 없거나 조회가 실패하면 빈 값을 돌려준다. 부르는 쪽은 그때
 *    학생 명부(`students_erp`)로 떨어지므로 «고치기 전» 과 똑같이 동작한다.
 */
export async function getOverrideOrg(env: OverrideEnv, userId: string): Promise<OverrideOrg> {
  const u = String(userId || '').trim();
  if (!u) return NO_ORG;
  if (!(await ensureStudentOverrideTable(env))) return NO_ORG;
  try {
    const row: any = await env.DB.prepare(
      `SELECT franchise, shop_name FROM student_erp_override WHERE user_id = ? COLLATE NOCASE LIMIT 1`,
    ).bind(u).first();
    if (!row) return NO_ORG;
    return { franchise: String(row.franchise ?? '').trim(), shop_name: String(row.shop_name ?? '').trim() };
  } catch {
    return NO_ORG;
  }
}

/**
 * 🏢 가맹점(franchise) 또는 소속(shop_name)을 **한 번에 한 필드만** 지정한다 — 관리자 학생 상세
 * 화면(PATCH .../contact)이 그 필드를 고쳤을 때 부른다. 정본 이유는 파일 머리말 [④].
 *
 * ⛔ 두 필드를 한 호출에 합치지 말 것 — `setOverridePhones` 가 겪은 교차 오염 사고(2026-09-15
 *    trap-check)와 같은 함정이라, 아예 시그니처로 막는다. franchise·shop_name 을 둘 다 고쳤으면
 *    이 함수를 **두 번** 부른다.
 * @param value 빈 문자열이면 그 칸을 **지운다**(= students_erp 값을 다시 따르게). 관리자가 입력칸을
 *   비우고 저장한 것도 «그 값을 원한다» 는 뜻이라 phones 의 `clear` 같은 별도 플래그가 필요 없다.
 * @returns 저장에 성공했나. **실패를 삼키지 않는다** — 부르는 쪽이 사람에게 말해야 한다.
 */
export async function setOverrideOrgField(
  env: OverrideEnv,
  userId: string,
  field: 'franchise' | 'shop_name',
  value: string,
  by?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const u = String(userId || '').trim();
  if (!u) return { ok: false, reason: 'no_uid' };
  if (!(await ensureStudentOverrideTable(env))) return { ok: false, reason: 'no_table' };
  const v = String(value ?? '').trim();
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO student_erp_override (user_id, ${field}, org_by, org_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         ${field} = excluded.${field}, org_by = excluded.org_by, org_at = excluded.org_at, updated_at = excluded.updated_at`,
    ).bind(u, v || null, by || null, now, now, now).run();
    return { ok: true };
  } catch (e: any) {
    console.warn('[student-override] 가맹점·소속 저장 실패:', e?.message, 'uid=', u, 'field=', field);
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
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
    let changes = Number(r.meta?.changes ?? 0);
    /* 🏢 (2026-09-15) franchise·shop_name — korean_name 과 «따로» 돈다(위 함수 두 개짜리
       UPDATE 를 하나로 합치지 않는 이유는 아래). 이 두 칸은 한 학생에게 항상 같이 지정돼
       있지 않을 수 있다(가맹점만 고치고 소속은 그대로 두는 경우가 실제로 흔하다) — 합쳐서
       한 SET 절로 쓰면 «한쪽만 지정된» 행에서 지정 안 한 칸까지 override 의 빈 값(NULL)으로
       덮어써 버린다(korean_name 이 그 WHERE 조건에 없는 행을 건드리게 되므로). 그래서 각 칸을
       **자기 칸이 지정된 행만** 골라 따로 채운다 — 정확히 korean_name 과 같은 모양의 문장을
       칸마다 하나씩 둔다. */
    try {
      const rf = await env.DB.prepare(
        `UPDATE students_erp
            SET franchise = (SELECT o.franchise FROM student_erp_override o WHERE o.user_id = students_erp.user_id)
          WHERE user_id IN (SELECT user_id FROM student_erp_override
                             WHERE franchise IS NOT NULL AND TRIM(franchise) <> '')`
      ).run();
      changes += Number(rf.meta?.changes ?? 0);
    } catch { /* franchise 지정 재적용 실패 — 오늘은 바뀌고 내일 밤 되돌아갈 뿐, 이름 재적용은 막지 않는다 */ }
    try {
      const rs = await env.DB.prepare(
        `UPDATE students_erp
            SET shop_name = (SELECT o.shop_name FROM student_erp_override o WHERE o.user_id = students_erp.user_id)
          WHERE user_id IN (SELECT user_id FROM student_erp_override
                             WHERE shop_name IS NOT NULL AND TRIM(shop_name) <> '')`
      ).run();
      changes += Number(rs.meta?.changes ?? 0);
    } catch { /* shop_name 지정 재적용 실패 — 같은 이유로 나머지는 막지 않는다 */ }
    return changes;
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
