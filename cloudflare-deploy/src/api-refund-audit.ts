/**
 * api-refund-audit.ts — 이중결제 감사·환불 처리 도구
 *
 *  student_payments(카페24 동기화본)에서 "같은 회원 · 같은 금액 · 10분 내 2회 이상" = 이중결제 의심을
 *  뽑아, 관리자가 건별로 환불완료/크레딧지급/오인(중복아님) 처리하며 추적한다.
 *  데이터는 이미 D1 에 있어 서버 왕복 없이 계산한다.
 *
 *  dup_key = user_id | KST날짜 | 금액  (한 이중결제 그룹의 안정적 식별자)
 */
import { json } from './api-util';

async function ensureTable(env: any): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS refund_resolutions (
       dup_key TEXT PRIMARY KEY,
       status TEXT,            -- refunded | credited | dismissed
       note TEXT,
       resolved_by TEXT,
       updated_at INTEGER NOT NULL
     )`
  ).run();
}

/**
 * 이중결제 목록. type=all|unresolved|resolved, since=YYYY(연도 하한, 기본 전체)
 */
export async function getDuplicatePayments(env: any, opts: { type?: string; since?: string } = {}): Promise<any> {
  await ensureTable(env);
  const sinceYear = /^\d{4}$/.test(String(opts.since || '')) ? String(opts.since) : null;
  const dateFilter = sinceYear ? `AND date(p.paid_at/1000,'unixepoch','+9 hours') >= '${sinceYear}-01-01'` : '';

  const sql =
    `SELECT g.dup_key, g.user_id, g.d AS pay_date, g.amount_krw, g.cnt, g.excess, g.times,
            s.korean_name AS name, r.status AS res_status, r.note AS res_note, r.updated_at AS res_at
     FROM (
       SELECT p.user_id,
              (p.user_id || '|' || date(p.paid_at/1000,'unixepoch','+9 hours') || '|' || p.amount_krw) AS dup_key,
              date(p.paid_at/1000,'unixepoch','+9 hours') AS d,
              p.amount_krw,
              COUNT(*) AS cnt,
              (COUNT(*)-1)*p.amount_krw AS excess,
              GROUP_CONCAT(time(p.paid_at/1000,'unixepoch','+9 hours')) AS times
       FROM student_payments p
       WHERE p.status='paid' AND p.amount_krw>0 AND p.paid_at IS NOT NULL ${dateFilter}
       GROUP BY p.user_id, d, p.amount_krw
       HAVING COUNT(*)>=2 AND (MAX(p.paid_at)-MIN(p.paid_at)) BETWEEN 1000 AND 600000
     ) g
     LEFT JOIN students_erp s ON s.user_id = g.user_id
     LEFT JOIN refund_resolutions r ON r.dup_key = g.dup_key
     ORDER BY g.d DESC`;
  const q = await env.DB.prepare(sql).all();
  let rows: any[] = q.results || [];

  if (opts.type === 'unresolved') rows = rows.filter((r) => !r.res_status);
  else if (opts.type === 'resolved') rows = rows.filter((r) => !!r.res_status);

  const summary = {
    groups: rows.length,
    total_excess: rows.reduce((a, b: any) => a + (b.excess || 0), 0),
    resolved: rows.filter((r: any) => r.res_status).length,
  };
  return { rows, summary };
}

/** 처리 저장 (환불완료/크레딧/오인) — status 빈값이면 처리 취소 */
export async function resolveDuplicate(env: any, dupKey: string, status: string, note: string, by: string): Promise<void> {
  await ensureTable(env);
  const valid = ['refunded', 'credited', 'dismissed'].includes(status) ? status : '';
  if (!valid) {
    await env.DB.prepare(`DELETE FROM refund_resolutions WHERE dup_key=?`).bind(dupKey).run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO refund_resolutions (dup_key, status, note, resolved_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(dup_key) DO UPDATE SET status=excluded.status, note=excluded.note, resolved_by=excluded.resolved_by, updated_at=excluded.updated_at`
  ).bind(dupKey, valid, String(note || '').slice(0, 500), String(by || '').slice(0, 60), Date.now()).run();
}
