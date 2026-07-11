/**
 * api-retention.ts — 수강권 만료·재활성 관리 (기간제 정기수업 모델)
 *
 *  이 시스템은 "N회권"이 아니라 "시작일~만료일 매주 정기수업"(기간제)이다.
 *  그래서 '잔여 횟수'가 아니라, 매출·리텐션에 직결되는 다음 대상을 관리한다:
 *    - expiring : 만료 임박(30일 내) 활성 학생 → 갱신 유도
 *    - expired  : 최근 만료된(60일 내) 활성 학생 → 재등록 권유
 *    - inactive : 활성인데 최근(21~90일) 수업이 끊긴 학생 → 이탈 위험, 재활성 연락
 *
 *  데이터 흐름(급여 자동화와 동일): 카페24 서버가 mangoi MySQL 에서 위 대상을 집계해
 *    /api/retention-ingest(공유키 PAYROLL_INGEST_KEY)로 push → D1 student_retention →
 *    /admin/retention 화면이 이름(students_erp 조인)·만료·휴면일수와 함께 표시.
 */
import { json, parseJsonBody } from './api-util';

async function ensureTable(env: any): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS student_retention (
       user_id TEXT PRIMARY KEY,
       member_id INTEGER,
       start_date TEXT,
       end_date TEXT,
       last_class TEXT,
       days_inactive INTEGER,
       days_to_expiry INTEGER,
       category TEXT,
       contacted INTEGER DEFAULT 0,
       contacted_at INTEGER,
       updated_at INTEGER NOT NULL
     )`
  ).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_student_retention_cat ON student_retention(category, days_to_expiry)`).run();
}

/** 서버(카페24) → 워커 인제스트. /api/retention-ingest?key=...  전량 교체(snapshot). */
export async function handleRetentionIngest(request: Request, url: URL, env: any): Promise<Response | null> {
  if (url.pathname !== '/api/retention-ingest') return null;
  const expected = String(env.PAYROLL_INGEST_KEY || '').trim();
  const given = String(url.searchParams.get('key') || '').trim();
  if (!expected || given !== expected) return json({ ok: false, error: 'forbidden' }, 403);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const body = await parseJsonBody(request) || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  await ensureTable(env);
  const now = Date.now();

  // 스냅샷 방식: '연락함' 표시는 보존하고, 나머지는 새로 덮어씀.
  //   먼저 이번에 안 들어온(=이제 대상 아닌) 학생은 목록에서 제거하되, contacted 표시는 남기지 않음(대상 해제).
  const incoming = new Set(rows.map((r: any) => String(r.user_id || '')).filter(Boolean));
  // 기존 목록 중 이번 스냅샷에 없는 것 삭제
  try {
    const existing = await env.DB.prepare(`SELECT user_id FROM student_retention`).all();
    for (const e of (existing.results || [])) {
      if (!incoming.has(String((e as any).user_id))) {
        await env.DB.prepare(`DELETE FROM student_retention WHERE user_id=?`).bind((e as any).user_id).run();
      }
    }
  } catch (_) {}

  let upserted = 0;
  for (const r of rows) {
    const uid = String(r.user_id || '').trim();
    if (!uid) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO student_retention (user_id, member_id, start_date, end_date, last_class, days_inactive, days_to_expiry, category, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           member_id=excluded.member_id, start_date=excluded.start_date, end_date=excluded.end_date,
           last_class=excluded.last_class, days_inactive=excluded.days_inactive, days_to_expiry=excluded.days_to_expiry,
           category=excluded.category, updated_at=excluded.updated_at`
      ).bind(uid, Number(r.member_id) || null, r.start_date || null, r.end_date || null, r.last_class || null,
        r.days_inactive == null ? null : Number(r.days_inactive), r.days_to_expiry == null ? null : Number(r.days_to_expiry),
        String(r.category || 'inactive'), now).run();
      upserted++;
    } catch (_) {}
  }
  return json({ ok: true, upserted, received: rows.length });
}

/** '연락함' 토글 (관리자) */
export async function markRetentionContacted(env: any, userId: string, contacted: boolean): Promise<void> {
  await ensureTable(env);
  await env.DB.prepare(`UPDATE student_retention SET contacted=?, contacted_at=? WHERE user_id=?`)
    .bind(contacted ? 1 : 0, contacted ? Date.now() : null, userId).run();
}

/** 관리자 조회 — 카테고리별 목록 + 이름(students_erp 조인) + 요약 */
export async function getRetention(env: any, type: string): Promise<any> {
  await ensureTable(env);
  const cat = ['expiring', 'expired', 'inactive'].includes(type) ? type : null;
  // 이름은 students_erp 에서 조인 (없으면 user_id 표시). 정렬: 만료 임박/휴면 오래된 순.
  const where = cat ? `WHERE r.category=?` : ``;
  const orderBy = cat === 'inactive'
    ? `ORDER BY r.days_inactive DESC`
    : `ORDER BY r.days_to_expiry ASC`;
  const stmt = env.DB.prepare(
    `SELECT r.user_id, r.member_id, r.start_date, r.end_date, r.last_class, r.days_inactive, r.days_to_expiry,
            r.category, r.contacted, s.korean_name AS name
     FROM student_retention r
     LEFT JOIN students_erp s ON s.user_id = r.user_id
     ${where} ${orderBy} LIMIT 500`
  );
  const q = cat ? await stmt.bind(cat).all() : await stmt.all();
  const rows = q.results || [];
  // 카테고리별 카운트
  const counts: any = { expiring: 0, expired: 0, inactive: 0, total: 0 };
  const cq = await env.DB.prepare(`SELECT category, COUNT(*) AS n FROM student_retention GROUP BY category`).all().catch(() => ({ results: [] }));
  for (const c of ((cq.results as any[]) || [])) { if (counts[c.category] != null) counts[c.category] = c.n; counts.total += c.n; }
  const updated = await env.DB.prepare(`SELECT MAX(updated_at) AS u FROM student_retention`).first().catch(() => null);
  return { rows, counts, updated_at: (updated as any)?.u || 0 };
}
