/**
 * api-payroll-auto.ts — 강사 급여 자동화 (수기 폐지)
 *
 *  데이터 흐름:
 *    카페24 서버(mangoi MySQL, Classes+Teachers) → /root/teacher-payroll-sync.sh 가 매달
 *    "강사별·월별 완료수업 수 + 급여(₱)" 를 집계해 JSON 으로 이 워커에 POST(/api/payroll-ingest, key 보호)
 *    → D1 teacher_payroll_auto 저장 → 관리자 화면(/admin/teacher-payroll)이 표·AI요약·CSV 로 표시.
 *
 *  왜 이 구조?: 실제 수업/강사/단가는 카페24 MySQL(전체 이력)에 있고, 워커는 MySQL 에 직접
 *    접속 못 한다(내부 전용). 그래서 서버가 계산해 밀어넣고(push) 워커는 보여주기만 한다.
 *    (Neo4j 경유는 :Class 가 최근 30일치만이라 과거 월 급여엔 부적합 → 서버 직접 집계 채택)
 */
import { json, parseJsonBody } from './api-util';

const AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

async function ensureTable(env: any): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS teacher_payroll_auto (
       teacher_id INTEGER NOT NULL,
       teacher_name TEXT,
       year INTEGER NOT NULL,
       month INTEGER NOT NULL,
       completed_classes INTEGER DEFAULT 0,
       total_classes INTEGER DEFAULT 0,
       pay_php INTEGER DEFAULT 0,
       updated_at INTEGER NOT NULL,
       PRIMARY KEY (teacher_id, year, month)
     )`
  ).run();
  // 페소→원화 환율 설정 (단일 행). 회계 담당자가 화면에서 수정.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payroll_settings (id INTEGER PRIMARY KEY CHECK(id=1), php_krw REAL DEFAULT 24, updated_at INTEGER)`
  ).run();
  // 지급완료 추적 칸 (기존 배포 테이블에 없으면 추가)
  try { await env.DB.prepare(`ALTER TABLE teacher_payroll_auto ADD COLUMN paid INTEGER DEFAULT 0`).run(); } catch (_) {}
  try { await env.DB.prepare(`ALTER TABLE teacher_payroll_auto ADD COLUMN paid_at INTEGER`).run(); } catch (_) {}
}

/** 지급완료 토글 (관리자) */
export async function markPayrollPaid(env: any, teacherId: number, year: number, month: number, paid: boolean): Promise<void> {
  await ensureTable(env);
  await env.DB.prepare(
    `UPDATE teacher_payroll_auto SET paid=?, paid_at=? WHERE teacher_id=? AND year=? AND month=?`
  ).bind(paid ? 1 : 0, paid ? Date.now() : null, teacherId, year, month).run();
}

const DEFAULT_PHP_KRW = 24; // 1페소 ≈ 24원 (기본값, 화면에서 조정 가능)

/** 현재 페소→원화 환율 */
export async function getPhpKrwRate(env: any): Promise<number> {
  try {
    const r: any = await env.DB.prepare(`SELECT php_krw FROM payroll_settings WHERE id=1`).first();
    const v = Number(r?.php_krw);
    return v > 0 ? v : DEFAULT_PHP_KRW;
  } catch { return DEFAULT_PHP_KRW; }
}

/** 환율 저장 (관리자) */
export async function setPhpKrwRate(env: any, rate: number): Promise<number> {
  await ensureTable(env);
  const v = Math.max(0.01, Math.min(100000, Number(rate) || DEFAULT_PHP_KRW));
  await env.DB.prepare(
    `INSERT INTO payroll_settings (id, php_krw, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET php_krw=excluded.php_krw, updated_at=excluded.updated_at`
  ).bind(v, Date.now()).run();
  return v;
}

/**
 * 서버(카페24) → 워커 인제스트. /api/payroll-ingest?key=...  (관리자 세션 아님, 공유키 보호)
 * body: { rows: [{ teacher_id, teacher_name, year, month, completed, total, pay_php }] }
 */
export async function handlePayrollIngest(request: Request, url: URL, env: any): Promise<Response | null> {
  if (url.pathname !== '/api/payroll-ingest') return null;

  const expected = String(env.PAYROLL_INGEST_KEY || '').trim();
  const given = String(url.searchParams.get('key') || '').trim();
  if (!expected || given !== expected) return json({ ok: false, error: 'forbidden' }, 403);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const body = await parseJsonBody(request) || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json({ ok: false, error: 'no_rows' }, 400);

  await ensureTable(env);
  const now = Date.now();
  let upserted = 0;
  for (const r of rows) {
    const tid = Number(r.teacher_id) || 0;
    const y = Number(r.year) || 0;
    const m = Number(r.month) || 0;
    if (!tid || !y || m < 1 || m > 12) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO teacher_payroll_auto (teacher_id, teacher_name, year, month, completed_classes, total_classes, pay_php, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(teacher_id, year, month) DO UPDATE SET
           teacher_name=excluded.teacher_name,
           completed_classes=excluded.completed_classes,
           total_classes=excluded.total_classes,
           pay_php=excluded.pay_php,
           updated_at=excluded.updated_at`
      ).bind(tid, String(r.teacher_name || ''), y, m, Number(r.completed) || 0, Number(r.total) || 0, Math.round(Number(r.pay_php) || 0), now).run();
      upserted++;
    } catch (e) { /* 한 행 실패해도 나머지 계속 */ }
  }
  return json({ ok: true, upserted, received: rows.length });
}

/** 관리자 조회용 — 해당 월의 강사별 급여 + 합계 */
export async function getPayrollAuto(env: any, year: number, month: number): Promise<any> {
  await ensureTable(env);
  const q = await env.DB.prepare(
    `SELECT teacher_id, teacher_name, completed_classes, total_classes, pay_php, paid, paid_at, updated_at
     FROM teacher_payroll_auto WHERE year=? AND month=? ORDER BY pay_php DESC, completed_classes DESC`
  ).bind(year, month).all();
  const list: any[] = q.results || [];
  const php_krw = await getPhpKrwRate(env);
  // 각 강사 행에 원화 환산 추가 (페소 먼저, 원화 다음)
  for (const r of list) r.pay_krw = Math.round((r.pay_php || 0) * php_krw);
  const total_pay_php = list.reduce((a, b: any) => a + (b.pay_php || 0), 0);
  const total_pay_krw = Math.round(total_pay_php * php_krw);
  const total_completed = list.reduce((a, b: any) => a + (b.completed_classes || 0), 0);
  const paid_count = list.filter((r: any) => r.paid).length;
  const updated_at = list.reduce((a, b: any) => Math.max(a, b.updated_at || 0), 0);
  // 어느 달이 데이터 있는지 (화면 월 선택용)
  const months = await env.DB.prepare(
    `SELECT DISTINCT year, month FROM teacher_payroll_auto ORDER BY year DESC, month DESC LIMIT 24`
  ).all().catch(() => ({ results: [] }));
  // 📈 월별 추이(최근 6개월 합계) — 그래프용
  const trendQ = await env.DB.prepare(
    `SELECT year, month, SUM(pay_php) AS pay_php, SUM(completed_classes) AS completed
     FROM teacher_payroll_auto GROUP BY year, month
     HAVING SUM(completed_classes) > 0 ORDER BY year DESC, month DESC LIMIT 6`
  ).all().catch(() => ({ results: [] }));
  const trend = ((trendQ.results as any[]) || []).map((r: any) => ({
    year: r.year, month: r.month, pay_php: r.pay_php || 0, pay_krw: Math.round((r.pay_php || 0) * php_krw), completed: r.completed || 0,
  })).reverse(); // 오래된→최근 (차트 왼→오른)
  return {
    rows: list,
    php_krw,
    summary: { teachers: list.length, total_completed, total_pay_php, total_pay_krw, paid_count, updated_at },
    available_months: months.results || [],
    trend,
  };
}

/**
 * 🤖 AI 요약 — 급여 핵심을 한눈에. lang='en' 이면 영어(필리핀 회계 담당자용), 아니면 한국어.
 */
export async function payrollAiSummary(env: any, year: number, month: number, data: any, lang?: string): Promise<string> {
  try {
    if (!env.AI || !data?.rows?.length) return '';
    const en = String(lang || 'ko').toLowerCase() === 'en';
    // 완료가 예정 대비 유난히 낮은(노쇼/미실시 의심) 강사
    const lowRate = data.rows
      .filter((r: any) => (r.total_classes || 0) >= 20 && (r.completed_classes || 0) / (r.total_classes || 1) < 0.5)
      .map((r: any) => r.teacher_name).slice(0, 5);

    let prompt: string;
    if (en) {
      const top = data.rows.slice(0, 10)
        .map((r: any) => `${r.teacher_name || r.teacher_id}: ${r.completed_classes} completed, ₱${(r.pay_php || 0).toLocaleString('en-US')}`)
        .join(' / ');
      prompt =
        `You are the operations assistant of an online English academy. Summarize the ${year}-${String(month).padStart(2, '0')} teacher payroll below in clear English, 3-4 sentences, so the accounting manager can grasp it at a glance. Be factual and number-focused. Show amounts in Philippine Peso (₱) first, then Korean Won (₩) in parentheses.\n` +
        `Totals: ${data.summary.teachers} teachers, ${data.summary.total_completed} completed classes, total payout ₱${data.summary.total_pay_php.toLocaleString('en-US')} (₩${(data.summary.total_pay_krw || 0).toLocaleString('en-US')}).\n` +
        `Top teachers: ${top}.\n` +
        (lowRate.length ? `Teachers to double-check (completion below 50% of scheduled): ${lowRate.join(', ')}.\n` : '') +
        `End with one short practical tip (e.g. what to verify before releasing pay).`;
    } else {
      const top = data.rows.slice(0, 10)
        .map((r: any) => `${r.teacher_name || r.teacher_id}: 완료 ${r.completed_classes}회, ₱${(r.pay_php || 0).toLocaleString('en-US')}`)
        .join(' / ');
      prompt =
        `너는 화상영어 학원의 운영 비서야. 아래 ${year}년 ${month}월 강사 급여 집계를 학원장이 한눈에 파악하도록 한국어로 3~4문장으로 정리해줘. ` +
        `과장 없이 숫자 중심으로. 금액은 페소(₱)를 먼저 쓰고 괄호로 원화(₩)를 병기.\n` +
        `총 강사 ${data.summary.teachers}명, 완료수업 합계 ${data.summary.total_completed}회, 총 지급액 ₱${data.summary.total_pay_php.toLocaleString('en-US')} (₩${(data.summary.total_pay_krw || 0).toLocaleString('en-US')}).\n` +
        `상위 강사: ${top}.\n` +
        (lowRate.length ? `완료율이 낮아 확인이 필요한 강사(예정 대비 절반 미만): ${lowRate.join(', ')}.\n` : '') +
        `마지막에 한 줄로 실무 팁(예: 지급 전 확인 포인트)을 덧붙여줘.`;
    }
    const res: any = await env.AI.run(AI_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 400 });
    return String(res?.response || '').trim();
  } catch (e) {
    return '';
  }
}
