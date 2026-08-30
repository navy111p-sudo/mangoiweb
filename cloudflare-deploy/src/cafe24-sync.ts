/**
 * cafe24-sync.ts — 카페24(Neo4j 중계) → D1 데이터 동기화 모듈
 *
 * 파이프라인 전체:
 *   카페24 MySQL ──(서버 cron 02:00 KST /root/mangoi-sync.sh)──▶ Neo4j(mangoi.co.kr:8880)
 *   Neo4j ──(이 모듈: 수동 트리거 or 워커 cron 03:00 KST)──▶ D1(관리자 화면)
 *
 * 개인정보는 카페24 서버와 Cloudflare 사이에서만 이동(로컬 PC 미경유).
 * 모든 함수는 멱등 — 재실행해도 중복 없음.
 *
 * 사용처:
 *   - api-mango.ts 의 /api/admin/{students,payments,org,attendance}/import-cafe24 라우트
 *   - index.ts scheduled() 의 야간 자동 새로고침 (nightlyCafe24Refresh)
 */
import { runCypher } from './teacher-match';
import { applyStudentErpOverrides } from './student-override';

export interface SyncEnv {
  DB: D1Database;
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  [k: string]: any;
}

/** 학생 이관 배치 식별용 created_at 센티넬 (students_erp 재적재 시 이 값으로 식별) */
export const CAFE24_STUDENT_SENTINEL = 1751500000000;

const rowsToObjects = (fields: string[], values: any[][]) =>
  values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));

/** 전화번호 정리 — 빈칸·공백만 있는 값은 NULL 로. 숫자/기호는 손대지 않는다.
 *  ⚠️ 형식을 «고쳐» 주지 않는다. 010-1234-5678 과 01012345678 을 섞어 쓰는 곳이 있어
 *     여기서 한쪽으로 바꾸면 기존 조회(REPLACE(parent_phone,'-','') 로 맞추는 곳)와 어긋난다. */
const normPhone = (v: any): string | null => {
  const t = String(v ?? '').trim();
  return t ? t : null;
};

/** 🏢 지사(240)·센터(916) → D1 franchises/centers. cafe24 ID 를 D1 id 로 보존. */
export async function importCafe24Org(env: SyncEnv): Promise<{ franchises: number; centers: number }> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  const nowMs = Date.now();
  const br = await runCypher(env, `MATCH (b:Branch) RETURN b.branch_id AS id, b.name AS name, b.address AS address, b.phone AS phone, b.manager AS manager, b.active AS active ORDER BY b.branch_id`, {}, 'READ');
  // ⚠️ INSERT OR REPLACE 를 쓰면 안 된다 — SQLite 의 REPLACE 는 «기존 행을 지우고 새로 넣는» 것이라
  //    아래 컬럼 목록에 없는 값(franchises.opened_at)이 매일 밤 NULL 로 날아간다.
  //    카페24가 주는 컬럼만 덮어쓰고 «우리가 D1 에서만 관리하는 값»은 보존하도록 UPSERT 로 바꿨다(2026-08-14).
  const insF = env.DB.prepare(
    `INSERT INTO franchises (id, name, address, phone, owner_name, active, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, address = excluded.address, phone = excluded.phone,
       owner_name = excluded.owner_name, active = excluded.active, notes = excluded.notes,
       updated_at = excluded.updated_at`
  );
  for (let i = 0; i < br.values.length; i += 200) {
    const rows = rowsToObjects(br.fields, br.values.slice(i, i + 200));
    await env.DB.batch(rows.map(r => insF.bind(Number(r.id), r.name || '(무명지사)', r.address || null, r.phone || null, r.manager || null, Number(r.active) ? 1 : 0, '[cafe24]', nowMs, nowMs)));
  }
  const ce = await runCypher(env, `MATCH (c:Center) RETURN c.center_id AS id, c.branch_id AS branch_id, c.name AS name, c.address AS address, c.manager AS manager, c.active AS active ORDER BY c.center_id`, {}, 'READ');
  // ⚠️ 여기가 «대리점 B2B/B2C 지정이 매일 밤 사라지던» 자리다(2026-08-14 발견).
  //    centers.payment_type 은 카페24에 없는, D1 에서만 사람이 지정하는 값인데
  //    INSERT OR REPLACE 가 행을 통째로 갈아치우면서 매일 03:00 KST 에 전부 NULL 로 되돌렸다.
  //    (PATCH /api/admin/centers 로 지정해도 그날 밤이면 없어졌다는 뜻이다.)
  //    → UPSERT 로 바꿔 카페24가 주는 컬럼만 덮어쓴다. payment_type · country 는 건드리지 않는다.
  const insC = env.DB.prepare(
    `INSERT INTO centers (id, franchise_id, name, address, manager, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       franchise_id = excluded.franchise_id, name = excluded.name, address = excluded.address,
       manager = excluded.manager, active = excluded.active, updated_at = excluded.updated_at`
  );
  for (let i = 0; i < ce.values.length; i += 200) {
    const rows = rowsToObjects(ce.fields, ce.values.slice(i, i + 200));
    await env.DB.batch(rows.map(r => insC.bind(Number(r.id), Number(r.branch_id) || null, r.name || '(무명센터)', r.address || null, r.manager || null, Number(r.active) ? 1 : 0, nowMs, nowMs)));
  }

  /* 🏢 대리점 → 지사 «수동 정정» 을 다시 입힌다 (2026-08-16 신설).

     [왜 필요한가] 위 UPSERT 는 `franchise_id = excluded.franchise_id` 라, 카페24가 주는
     소속이 매일 밤 D1 을 덮어쓴다. payment_type 은 UPSERT 목록에서 빼서 지켰지만
     (2026-08-14), franchise_id 는 카페24가 정본이라 뺄 수 없다 — 새 대리점이 생기거나
     지사가 바뀌면 따라가야 하기 때문이다.

     [그런데 실제로 이런 일이 있었다] 「강서SLP」라는 같은 이름의 센터가 7개인데
     389번 하나만 지사 113(SLP)으로 갈려 있었다. 이름이 두 지사로 갈리면 가맹점
     정산이 **어느 쪽에도 배정하지 못해** 학생 419명의 매출이 통째로 «배정 불가» 가
     됐다(accounting-reports.ts franchiseReport 의 cmap.nf=1 조건).

     [그래서] center_franchise_override 에 «이 센터는 이 지사» 를 적어 두면, 카페24가
     덮어쓴 뒤 여기서 다시 입힌다. 예외는 이 표에 적힌 것만이라 사고 반경이 좁다.
     ⚠️ 정본은 어디까지나 카페24다. 여기 적는 것은 «카페24를 고치기 전까지의 임시 정정»
        이며, 카페24에서 고치고 나면 이 표의 행을 지우는 것이 맞다. */
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS center_franchise_override (center_id INTEGER PRIMARY KEY, franchise_id INTEGER NOT NULL, prev_franchise_id INTEGER, reason TEXT, updated_at INTEGER NOT NULL);`);
    await env.DB.prepare(
      `UPDATE centers SET franchise_id = (SELECT o.franchise_id FROM center_franchise_override o WHERE o.center_id = centers.id)
        WHERE id IN (SELECT center_id FROM center_franchise_override)
          AND franchise_id IS NOT (SELECT o.franchise_id FROM center_franchise_override o WHERE o.center_id = centers.id)`
    ).run();
  } catch (e: any) {
    console.warn('[cafe24-sync] 대리점 지사 수동정정 재적용 실패(동기화 자체는 정상):', e?.message);
  }

  return { franchises: br.values.length, centers: ce.values.length };
}

/** 💰 결제(1.1만) → D1 student_payments. memo '[cafe24]%' 행 삭제 후 재삽입(멱등). */
export async function importCafe24Payments(env: SyncEnv): Promise<{ imported: number }> {
  const { fields, values } = await runCypher(env,
    `MATCH (p:Payment)
     RETURN p.user_id AS user_id, p.paid_at AS paid_at, p.period_start AS period_start, p.period_end AS period_end,
            p.amount_krw AS amount_krw, p.method AS method, p.memo AS memo, p.status AS status
     ORDER BY p.pay_id`, {}, 'READ');
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_student_payments_user_id ON student_payments(user_id);`); } catch {}
  await env.DB.prepare(`DELETE FROM student_payments WHERE memo LIKE '[cafe24]%'`).run();
  const nowMs = Date.now();
  const ins = env.DB.prepare(`INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let imported = 0;
  for (let i = 0; i < values.length; i += 500) {
    const rows = rowsToObjects(fields, values.slice(i, i + 500));
    await env.DB.batch(rows.map(r => ins.bind(String(r.user_id ?? ''), Number(r.paid_at) || null, r.period_start || null, r.period_end || null, Number(r.amount_krw) || 0, r.method || 'card', r.memo || '[cafe24]', r.status || 'paid', nowMs)));
    imported += Math.min(500, values.length - i);
  }
  return { imported };
}

/** 👨‍🎓 학생(2.9만) 한 페이지 → D1 students_erp (UPSERT — 카페24 칸만 덮고 우리 칸은 보존, 2026-08-28). */
export async function importCafe24Students(env: SyncEnv, off: number, lim: number): Promise<{ imported: number; done: boolean }> {
  if (off === 0) {
    // franchise·hq_name 컬럼 보강 (정산 트리 rebuildTree 가 이 3개로 org_nodes 구성).
    // 첫 페이지에서만 1회 — 이후 페이지는 컬럼이 이미 존재하므로 불필요.
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN franchise TEXT`); } catch {}
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN hq_name TEXT`); } catch {}
    /* 🔒 (2026-08-28) 아래 DELETE 의 보존 조건이 이 세 칸을 읽는다. 그런데 셋 다 «처음 쓰일 때»
       ALTER 로 생기는 지연 컬럼이라(api-lessons·api-students 참고) 없는 DB 에서는
       DELETE 가 no such column 으로 죽고, 그 예외를 nightlyCafe24Refresh 가 삼켜서
       **학생 29,000명 동기화가 조용히 멈춘다.** 멱등 ALTER 로 먼저 있게 만든다.
       (attendance.host·vc_quality.novideo 와 같은 방식 — 있으면 catch 로 넘어간다) */
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN password_hash TEXT`); } catch {}
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN parent_user_id TEXT`); } catch {}
    try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN eval_band TEXT`); } catch {}
    /* 🔒 (2026-08-28) «우리가 D1 에서만 관리하는 값» 이 든 행은 지우지 않는다.
       [왜] 이 DELETE 는 카페24 학생 전원(현재 29,428행)을 매일 밤 지우고 다시 넣는다.
            아래 INSERT 컬럼 목록에 없는 칸은 그때 전부 사라진다 — 그 목록에 없는 칸이 25개고
            그중 password_hash·parent_user_id·eval_band 는 **카페24가 아니라 우리 코드가 쓰는 값**이다
            (/api/student/set-password · /api/parent/link-child · 수업평가 밴드).
            즉 학생이 오늘 비밀번호를 정해도 오늘 밤 사라진다 → 학생 비밀번호를 도입할 수 없다.
       [지금 피해가 없는 이유] 2026-08-28 실측으로 그 세 칸이 모두 0건이다. 잃을 것이 아직 없다.
            바꿔 말하면 «앞으로 쓰기 시작하는 순간» 사고가 된다 — 그래서 지금 막는다.
       [순서가 전부다] 아래 INSERT 를 UPSERT 로 바꾼 것과 짝이다. DELETE 가 전부 지우면
            ON CONFLICT 가 영영 발동하지 않아 UPSERT 가 무의미해진다.
       ⚠️ 카페24를 떠난 학생인데 이 칸들에 값이 있으면 행이 남는다(status 갱신도 멈춘다).
          그 편이 «비밀번호·학부모 연결을 파괴하는 것» 보다 낫다는 판단이다.
       📜 같은 수리를 franchises·centers 는 2026-08-14 에 이미 했다(위 UPSERT). 학생만 남아 있었다. */
    await env.DB.prepare(
      `DELETE FROM students_erp
        WHERE created_at = ?
          AND (password_hash  IS NULL OR TRIM(password_hash)  = '')
          AND (parent_user_id IS NULL OR TRIM(parent_user_id) = '')
          AND (eval_band      IS NULL OR TRIM(eval_band)      = '')`
    ).bind(CAFE24_STUDENT_SENTINEL).run();
  }
  /* 📞 (2026-08-18 사장님) 학부모·학생 전화번호를 함께 가져온다.
       왜 필요했나 — D1 의 students_erp 29,398행 중 전화번호가 parent_phone 3개 · phone 9개뿐이라
       미납 안내도 결석 알림도 **아무에게도 닿지 않았다.** 원인은 두 가지였고 둘 다 여기다.
         ① 이 Cypher 가 전화번호를 아예 안 가져왔다.
         ② 아래 문장이 INSERT OR REPLACE 인데 컬럼 목록에 전화번호가 없었다.
            INSERT OR REPLACE 는 «행을 지우고 다시 넣는» 것이라, 목록에 없는 칸은 NULL 이 된다.
            즉 누가 번호를 채워 넣어도 **그날 밤 동기화가 지웠다.**(실제로 재현해 확인)
       ⚠️ 그래서 전화번호를 목록에 넣는 것은 «추가» 가 아니라 «지워지는 것을 멈추는» 일이기도 하다.
          이 컬럼들을 목록에서 다시 빼면 그 순간 전국 전화번호가 하룻밤에 사라진다.
          phone_sync_harness 가 그것을 막는다.

     번호가 그래프 어디에 있나 — 관리자 학생목록(api-admin.ts GRAPH_STUDENT_LIST_QUERY)이
     이미 쓰고 있는 길을 그대로 따른다. 새로 만든 방식이 아니다.
         (par:Parent)-[]->(s) 의 par.phone  ← 학부모 번호의 정본
         없으면 s.parent_phone 으로 대체
     ⚠️ 부모가 여럿 붙을 수 있어 collect(...)[0] 로 하나만 취한다(위 화면과 동일).
     ⚠️ 카페24가 정본이다. D1 에서 손으로 고친 번호는 다음 동기화 때 덮인다 —
        centers.franchise_id 와 같은 성질이다(CLAUDE.md 참고). 임시 정정이 필요하면
        덮어쓰기용 별도 표를 두는 방식을 써야지, 여기 값을 손으로 고치면 안 된다. */
  const { fields, values } = await runCypher(env,
    `MATCH (s:Student)
     OPTIONAL MATCH (par:Parent)-[]->(s)
     WITH s, collect(DISTINCT par.phone)[0] AS parent_phone_g
     RETURN coalesce(s.student_id, s.user_id) AS user_id, coalesce(s.name, s.student_id) AS korean_name,
            s.grade AS grade, s.school AS school, coalesce(s.status,'active') AS status,
            s.signup_date AS signup_date, s.end_date AS end_date, s.shop_name AS shop_name,
            s.franchise AS franchise, s.hq_name AS hq_name, s.points AS points,
            coalesce(parent_phone_g, s.parent_phone) AS parent_phone,
            s.student_phone AS student_phone
     ORDER BY user_id SKIP $off LIMIT $lim`, { off, lim }, 'READ');
  /* ⚠️ INSERT OR REPLACE 를 쓰면 안 된다 — SQLite 의 REPLACE 는 «기존 행을 지우고 새로 넣는» 것이라
     이 컬럼 목록에 없는 25개 칸이 매일 밤 NULL 이 된다(전화번호가 그렇게 전멸했던 것이 2026-08-18 건).
     카페24가 주는 칸만 덮어쓰고 우리가 관리하는 칸은 보존한다 — franchises 와 같은 방식(2026-08-14).
     ⛔ created_at 은 갱신하지 않는다: 그 값이 «카페24가 정본» 임을 나타내는 표식이라,
        로컬에서 만든 행(체험계정 lt* 등)을 이 동기화가 자기 것으로 바꿔 버리면 안 된다. */
  const ins = env.DB.prepare(
    `INSERT INTO students_erp (user_id, student_id, login_id, username, korean_name, grade, school, status, signup_date, end_date, shop_name, franchise, hq_name, points, parent_phone, student_phone, phone, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       student_id = excluded.student_id, login_id = excluded.login_id, username = excluded.username,
       korean_name = excluded.korean_name, grade = excluded.grade, school = excluded.school,
       status = excluded.status, signup_date = excluded.signup_date, end_date = excluded.end_date,
       shop_name = excluded.shop_name, franchise = excluded.franchise, hq_name = excluded.hq_name,
       points = excluded.points, parent_phone = excluded.parent_phone,
       student_phone = excluded.student_phone, phone = excluded.phone,
       updated_at = excluded.updated_at`);
  let imported = 0;
  for (let i = 0; i < values.length; i += 400) {
    const rows = rowsToObjects(fields, values.slice(i, i + 400));
    await env.DB.batch(rows.map(r => {
      const uid = String(r.user_id ?? '');
      const kname = r.korean_name || uid;
      /* 번호는 «있는 그대로» 넣되 빈 문자열은 NULL 로 통일한다 —
         ''(빈칸)이 들어가면 `parent_phone IS NOT NULL` 류 조건이 «번호 있음» 으로 오판한다.
         phone 칸에는 학생 번호를 넣는다(기존 코드가 학생 연락처로 se.phone 을 읽는 곳이 있다). */
      const pPhone = normPhone(r.parent_phone);
      const sPhone = normPhone(r.student_phone);
      return ins.bind(uid, uid, uid, kname, kname, r.grade || null, r.school || null, r.status || 'active',
        r.signup_date || null, r.end_date || null, r.shop_name || null, r.franchise || null, r.hq_name || '망고아이 본사',
        Number(r.points) || 0, pPhone, sPhone, sPhone, CAFE24_STUDENT_SENTINEL, CAFE24_STUDENT_SENTINEL);
    }));
    imported += Math.min(400, values.length - i);
  }
  const done = values.length < lim;
  /* 🧹 (2026-08-20) 마지막 페이지를 넣은 «직후» 우리 지정을 다시 입힌다.
        위 UPSERT 가 korean_name 을 카페24 값으로 덮기 때문에,
        여기서 되돌리지 않으면 D1 에서 고친 이름은 하룻밤이면 사라진다.
        ⚠️ 순서가 전부다 — 이 호출이 «동기화 앞» 으로 옮겨가면 그 순간 무의미해진다.
        ⚠️ 마지막 페이지에서만 부른다. 중간 페이지에서 불러 봐야 뒤 페이지가 다시 덮는다.
        정본·이유는 src/student-override.ts 머리말. */
  if (done) { try { await applyStudentErpOverrides(env); } catch { /* 동기화 자체는 계속 */ } }
  return { imported, done };
}

/** 📅 출석/수업 (:Class) 한 페이지 → D1 attendance (room_id='c24-{class_id}').
 *  🔒 멱등·안전 규칙 (2026-07-04 버그픽스): DELETE 범위와 INSERT(Cypher) 범위를 **정확히 일치**시킨다.
 *    - 증분: [sinceDate, untilDate] **양쪽 경계**로 창을 닫는다. 이렇게 안 하면
 *      미래 예약수업(최대 2030년)이 date>=since 에 전부 걸려 삭제되는데, 페이지 상한 때문에
 *      다시 못 넣어 대량 손실이 난다(실제 505k→184k 사고 발생).
 *    - 전체: sinceDate 미지정 → c24-% 전부 삭제 후 전부 재삽입(초기적재/복구용).
 *    창 밖(과거·먼미래) 데이터는 건드리지 않으므로 전체적재분이 보존된다. */
export async function importCafe24Attendance(
  env: SyncEnv, off: number, lim: number, sinceDate?: string, untilDate?: string,
): Promise<{ imported: number; done: boolean }> {
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_room ON attendance(room_id);`); } catch {}
  /* 👩‍🏫 (2026-08-18) 강사 칸 — 「수업일지가 한 건도 안 써진다」의 뿌리.
     옛 LMS 수업은 여기로 179,998건이 들어와 있는데 **누가 가르쳤는지가 없었다**.
     강사 화면은 자기 수업 목록을 보고 「일지 쓰기」 버튼을 그리는데, 목록을 만들
     방법이 없으니 버튼이 뜰 일도 없었다(실측 2026-08-18: 수업일지 누적 0건 —
     student_evaluations 104건은 전부 데모·시드였다).
     ⚠️ Neo4j 는 **없는 속성을 물어도 오류가 아니라 null** 을 준다. 그래서 아래 Cypher 에
        teacher_id 를 넣어도 카페24 :Class 에 그 속성이 없으면 조용히 null 이 들어올 뿐
        동기화가 깨지지 않는다. 즉 이 한 줄이 «속성이 오는가» 를 하룻밤에 실측해 준다.
        (확인: SELECT COUNT(*) FROM attendance WHERE room_id LIKE 'c24-%' AND teacher_uid IS NOT NULL) */
  try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN teacher_uid TEXT`); } catch {}
  try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN teacher_name TEXT`); } catch {}
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON attendance(teacher_uid, date);`); } catch {}
  if (off === 0) {
    if (sinceDate) {
      // DELETE 창 = INSERT 창과 동일 (양쪽 경계). untilDate 없으면 상한 없는 삭제 금지 → until 필수화.
      const until = untilDate || '9999-12-31';
      await env.DB.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%' AND date >= ? AND date <= ?`).bind(sinceDate, until).run();
    } else {
      await env.DB.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%'`).run();
    }
  }
  const conds: string[] = [];
  const params: Record<string, unknown> = { off, lim };
  if (sinceDate) { conds.push('c.date >= $since'); params.since = sinceDate; params.until = untilDate || '9999-12-31'; conds.push('c.date <= $until'); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { fields, values } = await runCypher(env,
    `MATCH (c:Class) ${where}
     RETURN c.class_id AS class_id, c.user_id AS user_id, c.start_ms AS start_ms, c.end_ms AS end_ms,
            c.date AS date, c.class_state AS class_state,
            coalesce(c.teacher_id, c.teacher_no, c.t_id) AS teacher_id,
            coalesce(c.teacher_name, c.teacher) AS teacher_name
     ORDER BY c.class_id SKIP $off LIMIT $lim`,
    params, 'READ');
  const ins = env.DB.prepare(
    `INSERT INTO attendance (room_id, user_id, username, role, joined_at, left_at, status, date, total_session_ms, teacher_uid, teacher_name)
     VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, ?)`);
  // 🔒 username 조회용 캐시 — nightlyCafe24Refresh 순서상 students_erp 는 attendance 보다 먼저 동기화된다.
  const nameCache = new Map<string, string | null>();
  async function nameFor(uid: string): Promise<string | null> {
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    let name: string | null = null;
    try {
      const row = await env.DB.prepare(
        `SELECT korean_name FROM students_erp WHERE user_id = ? LIMIT 1`
      ).bind(uid).first<{ korean_name: string }>();
      name = row?.korean_name || null;
    } catch { /* students_erp 미존재 시 username=null 로 계속 진행 */ }
    nameCache.set(uid, name);
    return name;
  }
  /* 🔴 (2026-08-19) 여기서 «다른 강사 이름» 을 써 넣던 사고를 고쳤다.
        teacher_uid 는 **카페24 강사번호**(실측 9~196)인데, 처음 판에서는 이걸
        D1 `teachers.id`(지역 일련번호 1~29)로 조회해 이름을 붙였다. 둘은 **다른 체계**다.
        번호가 우연히 겹치는 자리에서 정확히 남의 이름이 들어갔다(2026-08-19 실측):
          · 카페24 24 = Teacher Mariane → `teachers` 24 = HANNAH  로 기록됨 (127건)
          · 카페24 26 = Teacher Rica    → `teachers` 26 = MELCA   로 기록됨 (11건)
          · 카페24  9 = 테스트 강사     → `teachers`  9 = ZEE     로 기록됨 (2건)
        (참고: 진짜 Hannah 의 카페24 번호는 189 다.)
     → 이름은 **같은 번호 체계를 쓰는** teacher_payroll_auto 에서만 찾는다.
        이 표는 카페24 서버가 강사번호와 함께 직접 밀어넣은 것이라 번호↔이름이 일치한다.
     ⛔ `teachers` 로는 절대 되돌리지 말 것. 번호가 겹치는 세 자리에서 조용히 틀린다. */
  const tNameCache = new Map<string, string | null>();
  async function teacherNameFor(tid: string): Promise<string | null> {
    if (tNameCache.has(tid)) return tNameCache.get(tid)!;
    let name: string | null = null;
    try {
      const row = await env.DB.prepare(
        `SELECT teacher_name FROM teacher_payroll_auto WHERE CAST(teacher_id AS TEXT) = ?
          AND teacher_name IS NOT NULL ORDER BY year DESC, month DESC LIMIT 1`
      ).bind(tid).first<{ teacher_name: string }>();
      name = row?.teacher_name || null;
    } catch { /* 표가 없으면 이름 없이 계속 — 번호만으로도 담당 판정은 된다 */ }
    tNameCache.set(tid, name);
    return name;
  }
  let imported = 0;
  for (let i = 0; i < values.length; i += 400) {
    const rows = rowsToObjects(fields, values.slice(i, i + 400));
    const stmts = [];
    for (const r of rows) {
      const start = Number(r.start_ms) || 0;
      const end = Number(r.end_ms) || 0;
      // ClassState 2 = 수업 완료(출석) / 1 = 예정·미실시
      const status = Number(r.class_state) === 2 ? 'present' : 'scheduled';
      const uid = String(r.user_id ?? '');
      const username = await nameFor(uid);
      // 카페24에 강사 속성이 아직 없으면 tid 는 빈 문자열 → 두 칸 다 null 로 들어간다(동기화는 계속된다).
      const tid = r.teacher_id == null ? '' : String(r.teacher_id);
      const tname = tid ? (r.teacher_name ? String(r.teacher_name) : await teacherNameFor(tid)) : null;
      stmts.push(ins.bind(`c24-${r.class_id}`, uid, username, start || null, end || null, status, r.date || null, end > start ? end - start : 0, tid || null, tname));
    }
    await env.DB.batch(stmts);
    imported += Math.min(400, values.length - i);
  }
  return { imported, done: values.length < lim };
}

/** 🌙 야간 자동 새로고침 — 워커 cron(KST 03:00, 서버 Neo4j 동기화 02:00 이후)에서 호출.
 *  조직·결제는 전량, 학생은 전 페이지 루프, 출석은 최근 14일 증분만. */
export async function nightlyCafe24Refresh(env: SyncEnv): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  try { out.org = await importCafe24Org(env); } catch (e: any) { out.org = { error: String(e?.message || e) }; }
  try { out.payments = await importCafe24Payments(env); } catch (e: any) { out.payments = { error: String(e?.message || e) }; }
  try {
    let off = 0, total = 0;
    for (let page = 0; page < 15; page++) {           // 29k/3000 = 10페이지 + 여유
      const r = await importCafe24Students(env, off, 3000);
      total += r.imported;
      if (r.done) break;
      off += 3000;
    }
    /* 🧹 한 번 더 — importCafe24Students 는 «마지막 페이지» 에서만 지정을 다시 입힌다.
       학생이 늘어 15페이지를 다 쓰고도 done 이 안 나면 그 호출이 없다. 멱등한 UPDATE 라
       두 번 돌아도 무해하니, 못 도는 경우를 없애는 쪽을 택한다. */
    out.students = { imported: total, overrides: await applyStudentErpOverrides(env) };
  } catch (e: any) { out.students = { error: String(e?.message || e) }; }
  try {
    // 🔒 경계 있는 창 [60일 전, 180일 후] 만 삭제·재삽입. 창 밖(과거·먼미래 예약)은 보존.
    //    상한(until) 없이 date>=since 로 삭제하면 미래 예약수업 전체가 날아가므로 반드시 양쪽 경계.
    const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const until = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
    let off = 0, total = 0;
    for (let page = 0; page < 40; page++) {           // 창 내 최대 120k 안전 커버
      const r = await importCafe24Attendance(env, off, 3000, since, until);
      total += r.imported;
      if (r.done) break;
      off += 3000;
    }
    out.attendance = { imported: total, since, until };
  } catch (e: any) { out.attendance = { error: String(e?.message || e) }; }
  console.log('[cafe24-sync] nightly refresh', JSON.stringify(out));
  return out;
}
