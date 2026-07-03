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

/** 🏢 지사(240)·센터(916) → D1 franchises/centers. cafe24 ID 를 D1 id 로 보존. */
export async function importCafe24Org(env: SyncEnv): Promise<{ franchises: number; centers: number }> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  const nowMs = Date.now();
  const br = await runCypher(env, `MATCH (b:Branch) RETURN b.branch_id AS id, b.name AS name, b.address AS address, b.phone AS phone, b.manager AS manager, b.active AS active ORDER BY b.branch_id`, {}, 'READ');
  const insF = env.DB.prepare(`INSERT OR REPLACE INTO franchises (id, name, address, phone, owner_name, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < br.values.length; i += 200) {
    const rows = rowsToObjects(br.fields, br.values.slice(i, i + 200));
    await env.DB.batch(rows.map(r => insF.bind(Number(r.id), r.name || '(무명지사)', r.address || null, r.phone || null, r.manager || null, Number(r.active) ? 1 : 0, '[cafe24]', nowMs, nowMs)));
  }
  const ce = await runCypher(env, `MATCH (c:Center) RETURN c.center_id AS id, c.branch_id AS branch_id, c.name AS name, c.address AS address, c.manager AS manager, c.active AS active ORDER BY c.center_id`, {}, 'READ');
  const insC = env.DB.prepare(`INSERT OR REPLACE INTO centers (id, franchise_id, name, address, manager, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < ce.values.length; i += 200) {
    const rows = rowsToObjects(ce.fields, ce.values.slice(i, i + 200));
    await env.DB.batch(rows.map(r => insC.bind(Number(r.id), Number(r.branch_id) || null, r.name || '(무명센터)', r.address || null, r.manager || null, Number(r.active) ? 1 : 0, nowMs, nowMs)));
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

/** 👨‍🎓 학생(2.9만) 한 페이지 → D1 students_erp (INSERT OR REPLACE, user_id PK 스키마 대응). */
export async function importCafe24Students(env: SyncEnv, off: number, lim: number): Promise<{ imported: number; done: boolean }> {
  if (off === 0) {
    await env.DB.prepare(`DELETE FROM students_erp WHERE created_at = ?`).bind(CAFE24_STUDENT_SENTINEL).run();
  }
  const { fields, values } = await runCypher(env,
    `MATCH (s:Student)
     RETURN coalesce(s.student_id, s.user_id) AS user_id, coalesce(s.name, s.student_id) AS korean_name,
            s.grade AS grade, s.school AS school, coalesce(s.status,'active') AS status,
            s.signup_date AS signup_date, s.end_date AS end_date, s.shop_name AS shop_name,
            s.points AS points
     ORDER BY user_id SKIP $off LIMIT $lim`, { off, lim }, 'READ');
  const ins = env.DB.prepare(
    `INSERT OR REPLACE INTO students_erp (user_id, student_id, login_id, username, korean_name, grade, school, status, signup_date, end_date, shop_name, points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let imported = 0;
  for (let i = 0; i < values.length; i += 400) {
    const rows = rowsToObjects(fields, values.slice(i, i + 400));
    await env.DB.batch(rows.map(r => {
      const uid = String(r.user_id ?? '');
      const kname = r.korean_name || uid;
      return ins.bind(uid, uid, uid, kname, kname, r.grade || null, r.school || null, r.status || 'active',
        r.signup_date || null, r.end_date || null, r.shop_name || null, Number(r.points) || 0,
        CAFE24_STUDENT_SENTINEL, CAFE24_STUDENT_SENTINEL);
    }));
    imported += Math.min(400, values.length - i);
  }
  return { imported, done: values.length < lim };
}

/** 📅 출석/수업 (:Class) 한 페이지 → D1 attendance (room_id='c24-{class_id}').
 *  sinceDate 지정 시 해당 날짜 이후만(증분). offset 0 이면 대상 구간 기존행 삭제(멱등). */
export async function importCafe24Attendance(
  env: SyncEnv, off: number, lim: number, sinceDate?: string,
): Promise<{ imported: number; done: boolean }> {
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_room ON attendance(room_id);`); } catch {}
  if (off === 0) {
    if (sinceDate) await env.DB.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%' AND date >= ?`).bind(sinceDate).run();
    else await env.DB.prepare(`DELETE FROM attendance WHERE room_id LIKE 'c24-%'`).run();
  }
  const where = sinceDate ? `WHERE c.date >= $since` : '';
  const { fields, values } = await runCypher(env,
    `MATCH (c:Class) ${where}
     RETURN c.class_id AS class_id, c.user_id AS user_id, c.start_ms AS start_ms, c.end_ms AS end_ms,
            c.date AS date, c.class_state AS class_state
     ORDER BY c.class_id SKIP $off LIMIT $lim`,
    sinceDate ? { off, lim, since: sinceDate } : { off, lim }, 'READ');
  const ins = env.DB.prepare(
    `INSERT INTO attendance (room_id, user_id, role, joined_at, left_at, status, date, total_session_ms)
     VALUES (?, ?, 'student', ?, ?, ?, ?, ?)`);
  let imported = 0;
  for (let i = 0; i < values.length; i += 400) {
    const rows = rowsToObjects(fields, values.slice(i, i + 400));
    await env.DB.batch(rows.map(r => {
      const start = Number(r.start_ms) || 0;
      const end = Number(r.end_ms) || 0;
      // ClassState 2 = 수업 완료(출석) / 1 = 예정·미실시
      const status = Number(r.class_state) === 2 ? 'present' : 'scheduled';
      return ins.bind(`c24-${r.class_id}`, String(r.user_id ?? ''), start || null, end || null, status, r.date || null, end > start ? end - start : 0);
    }));
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
    out.students = { imported: total };
  } catch (e: any) { out.students = { error: String(e?.message || e) }; }
  try {
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    let off = 0, total = 0;
    for (let page = 0; page < 10; page++) {           // 최근 14일 수업 — 수천건 예상
      const r = await importCafe24Attendance(env, off, 3000, since);
      total += r.imported;
      if (r.done) break;
      off += 3000;
    }
    out.attendance = { imported: total, since };
  } catch (e: any) { out.attendance = { error: String(e?.message || e) }; }
  console.log('[cafe24-sync] nightly refresh', JSON.stringify(out));
  return out;
}
