/**
 * learning-insights.ts — 학습 패턴 분석: 위험도 세그먼트 & 장기 트렌드 (2026-06-03 추가)
 *
 * 기존 기능과 중복 회피:
 *   - ai_student_analysis(=api-mango.ts /api/admin/ai-analyze): 학생 1명을 Workers AI 로
 *     심층 분석(온디맨드·비용 발생). 본 모듈은 이를 호출하지 않는다.
 *   - 본 모듈은 출석/평가/음성 원자료를 SQL 집계해 **전체 학생을 룰 기반(무비용·결정적)으로
 *     자동 세그먼트**하고, 학생별 **장기 월별 트렌드**를 제공한다. 저장된 AI risk_level 이
 *     있으면 참고용으로 함께 노출한다.
 *
 *   GET  /api/admin/learning/overview?days=30      코호트 요약(세그먼트 분포·평균 지표)
 *   GET  /api/admin/learning/segments?days=30      학생별 위험도 자동 분류 + 사유
 *   GET  /api/admin/learning/trends?uid=&months=6  학생 장기 월별 트렌드(출석·평가·gaze·음성)
 *   GET  /api/admin/learning/snapshots?period=     저장된 월별 위험도 스냅샷
 *   POST /api/admin/learning/snapshot?period=YYYY-MM  월별 코호트 스냅샷 생성/갱신 (cron 공용)
 *
 *   format=json (기본) | csv  (segments 지원)
 *
 * 사용 테이블: students_erp · attendance · student_evaluations · voice_coaching ·
 *             ai_student_analysis(읽기). 신규 테이블 learning_trend_snapshots 만 추가.
 * 모든 핸들러 try/catch + safe() 격리 → 기존 라우트에 영향 없음(독립 오류 처리).
 */

interface Env {
  DB: D1Database;
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const csv = (filename: string, rows: (string | number)[][]): Response => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const body = '﻿' + rows.map(r => r.map(esc).join(',')).join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
};

const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn(); } catch { return fallback; }
};

const KST_OFFSET_MS = 9 * 3600 * 1000;
const SEC_OFFSET = 32400;
const DAY_MS = 86400000;

function kstDateStr(ms: number): string { return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10); }
function todayKST(): string { return kstDateStr(Date.now()); }
/** 'YYYY-MM-DD' 두 날짜 사이 일수 (a - b) */
function daysBetween(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(a) - t(b)) / DAY_MS);
}
/** 'YYYY-MM' 가감 */
function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function currentPeriod(): string { return todayKST().slice(0, 7); }

// ── 신규 테이블 (안전 생성) ───────────────────────────────────────────────
async function ensureTables(env: Env): Promise<void> {
  await safe(async () => {
    await env.DB.exec(
      `CREATE TABLE IF NOT EXISTS learning_trend_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, attendance_days INTEGER DEFAULT 0, eval_count INTEGER DEFAULT 0, eval_avg REAL, gaze_avg REAL, voice_avg REAL, risk_level TEXT, generated_at INTEGER NOT NULL, UNIQUE(period, student_uid));`
    );
    return true;
  }, false);
  await safe(async () => { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_lts_period ON learning_trend_snapshots(period);`); return true; }, false);
}

// ── 활성 학생 목록 ────────────────────────────────────────────────────────
async function activeStudents(env: Env): Promise<{ user_id: string; name: string }[]> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id, COALESCE(korean_name, english_name, user_id) AS name
       FROM students_erp
       WHERE status='정상' OR status IS NULL OR status=''`
    ).all<{ user_id: string; name: string }>();
    return rs.results || [];
  }, [] as { user_id: string; name: string }[]);
}

// ── 집계 맵: 출석(기간 내) ────────────────────────────────────────────────
async function attendanceAgg(env: Env, sinceMs: number): Promise<Record<string, { days: number; last: string | null; gaze: number | null; active_ms: number }>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT user_id,
              COUNT(DISTINCT date) AS days,
              MAX(date) AS last_date,
              AVG(CASE WHEN gaze_samples > 0 THEN gaze_score END) AS gaze,
              COALESCE(SUM(total_active_ms),0) AS active_ms
       FROM attendance
       WHERE joined_at >= ?
       GROUP BY user_id`
    ).bind(sinceMs).all<{ user_id: string; days: number; last_date: string; gaze: number; active_ms: number }>();
    const map: Record<string, any> = {};
    for (const r of (rs.results || [])) map[r.user_id] = { days: r.days || 0, last: r.last_date || null, gaze: r.gaze != null ? Math.round(r.gaze * 10) / 10 : null, active_ms: r.active_ms || 0 };
    return map;
  }, {} as Record<string, any>);
}

// ── 집계 맵: 평가(두 구간으로 추세) ──────────────────────────────────────
async function evalAgg(env: Env, sinceMs: number, midMs: number): Promise<Record<string, { count: number; avg: number | null; recent: number | null; prev: number | null }>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT student_uid,
              COUNT(*) AS c,
              AVG(score_overall) AS avg_all,
              AVG(CASE WHEN created_at >= ? THEN score_overall END) AS avg_recent,
              AVG(CASE WHEN created_at <  ? THEN score_overall END) AS avg_prev
       FROM student_evaluations
       WHERE created_at >= ?
       GROUP BY student_uid`
    ).bind(midMs, midMs, sinceMs).all<{ student_uid: string; c: number; avg_all: number; avg_recent: number; avg_prev: number }>();
    const map: Record<string, any> = {};
    const r1 = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null;
    for (const r of (rs.results || [])) map[r.student_uid] = { count: r.c || 0, avg: r1(r.avg_all), recent: r1(r.avg_recent), prev: r1(r.avg_prev) };
    return map;
  }, {} as Record<string, any>);
}

// ── 집계 맵: 음성코칭 ─────────────────────────────────────────────────────
async function voiceAgg(env: Env, sinceMs: number): Promise<Record<string, number>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT student_uid, AVG((COALESCE(accuracy_score,0)+COALESCE(pronunciation_score,0)+COALESCE(fluency_score,0))/3.0) AS v
       FROM voice_coaching WHERE created_at >= ? GROUP BY student_uid`
    ).bind(sinceMs).all<{ student_uid: string; v: number }>();
    const map: Record<string, number> = {};
    for (const r of (rs.results || [])) map[r.student_uid] = r.v != null ? Math.round(r.v * 10) / 10 : 0;
    return map;
  }, {} as Record<string, number>);
}

// ── 집계 맵: 최신 AI risk_level (참고용) ──────────────────────────────────
async function aiRiskAgg(env: Env): Promise<Record<string, string>> {
  return safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT a.student_uid, a.risk_level
       FROM ai_student_analysis a
       JOIN (SELECT student_uid, MAX(generated_at) AS g FROM ai_student_analysis GROUP BY student_uid) m
         ON a.student_uid = m.student_uid AND a.generated_at = m.g`
    ).all<{ student_uid: string; risk_level: string }>();
    const map: Record<string, string> = {};
    for (const r of (rs.results || [])) map[r.student_uid] = r.risk_level || 'unknown';
    return map;
  }, {} as Record<string, string>);
}

// ── 핵심: 학생별 룰 기반 위험도 계산 ──────────────────────────────────────
interface Seg {
  user_id: string; name: string;
  attendance_days: number; days_since_last: number | null;
  gaze: number | null; eval_count: number; eval_avg: number | null;
  eval_trend: number | null; voice: number | null; ai_risk: string | null;
  risk: 'high' | 'medium' | 'low'; score: number; reasons: string[];
}

function computeSegment(s: {
  user_id: string; name: string; days: number;
  att: any; ev: any; voice: number | undefined; aiRisk: string | undefined; today: string;
}): Seg {
  const att = s.att || {};
  const ev = s.ev || {};
  const attendance_days = att.days || 0;
  const days_since_last = att.last ? daysBetween(s.today, att.last) : null;
  const gaze = att.gaze != null ? att.gaze : null;
  const eval_avg = ev.avg != null ? ev.avg : null;
  const eval_trend = (ev.recent != null && ev.prev != null) ? Math.round((ev.recent - ev.prev) * 10) / 10 : null;

  const reasons: string[] = [];
  let score = 0; // 높을수록 위험

  // 1) 출석 신호
  if (attendance_days === 0) { score += 3; reasons.push('기간 내 출석 0회'); }
  else if (attendance_days <= Math.max(1, Math.round(s.days / 14))) { score += 2; reasons.push(`출석 저조(${attendance_days}일)`); }
  if (days_since_last != null && days_since_last >= 14) { score += 2; reasons.push(`마지막 출석 ${days_since_last}일 전`); }
  else if (days_since_last != null && days_since_last >= 7) { score += 1; reasons.push(`마지막 출석 ${days_since_last}일 전`); }

  // 2) 집중도(gaze)
  if (gaze != null && gaze < 50) { score += 2; reasons.push(`집중도 낮음(${gaze}%)`); }
  else if (gaze != null && gaze < 65) { score += 1; reasons.push(`집중도 주의(${gaze}%)`); }

  // 3) 평가 추세/수준
  if (eval_trend != null && eval_trend <= -1) { score += 2; reasons.push(`평가 하락(${eval_trend})`); }
  if (eval_avg != null && eval_avg < 3) { score += 1; reasons.push(`평가 평균 낮음(${eval_avg})`); }

  // 4) AI risk_level 참고 가중
  if (s.aiRisk === 'high') { score += 1; reasons.push('AI 분석: 고위험'); }

  const risk: 'high' | 'medium' | 'low' = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  if (reasons.length === 0) reasons.push('안정적');

  return {
    user_id: s.user_id, name: s.name,
    attendance_days, days_since_last, gaze,
    eval_count: ev.count || 0, eval_avg, eval_trend,
    voice: s.voice != null ? s.voice : null, ai_risk: s.aiRisk || null,
    risk, score, reasons,
  };
}

// ── 세그먼트 전체 계산 (overview/segments/snapshot 공용) ──────────────────
async function buildSegments(env: Env, days: number): Promise<Seg[]> {
  const today = todayKST();
  const sinceMs = Date.now() - days * DAY_MS;
  const midMs = Date.now() - Math.floor(days / 2) * DAY_MS;

  const [students, att, ev, voice, ai] = await Promise.all([
    activeStudents(env), attendanceAgg(env, sinceMs), evalAgg(env, sinceMs, midMs), voiceAgg(env, sinceMs), aiRiskAgg(env),
  ]);

  return students.map(st => computeSegment({
    user_id: st.user_id, name: st.name, days,
    att: att[st.user_id], ev: ev[st.user_id], voice: voice[st.user_id], aiRisk: ai[st.user_id], today,
  })).sort((a, b) => b.score - a.score);
}

// ════════════════════════════════════════════════════════════════════════
// 라우터
// ════════════════════════════════════════════════════════════════════════
export async function learningRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/learning\/?/, '');
  const fmt = url.searchParams.get('format') || 'json';
  const method = request.method.toUpperCase();

  try {
    await ensureTables(env);

    if (p === 'overview' && method === 'GET') return await overview(env, url);
    if (p === 'segments' && method === 'GET') return await segments(env, url, fmt);
    if (p === 'trends' && method === 'GET') return await trends(env, url);
    if (p === 'risk-history' && method === 'GET') return await riskHistory(env, url);
    if (p === 'snapshots' && method === 'GET') return await listSnapshots(env, url);
    if (p === 'snapshot' && method === 'POST') {
      const period = url.searchParams.get('period') || currentPeriod();
      const r = await runLearningSnapshot(env, period);
      return json({ ok: true, snapshot: r });
    }
    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'learning internal error', 500);
  }
}

// ── 1) 코호트 요약 ────────────────────────────────────────────────────────
async function overview(env: Env, url: URL): Promise<Response> {
  const days = clampInt(url.searchParams.get('days'), 30, 7, 180);
  const segs = await buildSegments(env, days);
  const dist = { high: 0, medium: 0, low: 0 };
  let attSum = 0, evalSum = 0, evalN = 0, gazeSum = 0, gazeN = 0;
  for (const s of segs) {
    dist[s.risk]++;
    attSum += s.attendance_days;
    if (s.eval_avg != null) { evalSum += s.eval_avg; evalN++; }
    if (s.gaze != null) { gazeSum += s.gaze; gazeN++; }
  }
  const total = segs.length;
  return json({
    ok: true, range_days: days, total_students: total,
    segments: dist,
    averages: {
      attendance_days: total ? Math.round((attSum / total) * 10) / 10 : 0,
      eval_avg: evalN ? Math.round((evalSum / evalN) * 10) / 10 : null,
      gaze_avg: gazeN ? Math.round((gazeSum / gazeN) * 10) / 10 : null,
    },
    watchlist: segs.filter(s => s.risk === 'high').slice(0, 10)
      .map(s => ({ user_id: s.user_id, name: s.name, score: s.score, reasons: s.reasons })),
  });
}

// ── 2) 세그먼트(학생별 위험도) ───────────────────────────────────────────
async function segments(env: Env, url: URL, fmt: string): Promise<Response> {
  const days = clampInt(url.searchParams.get('days'), 30, 7, 180);
  const filter = (url.searchParams.get('risk') || '').toLowerCase(); // high|medium|low|''
  let segs = await buildSegments(env, days);
  if (filter === 'high' || filter === 'medium' || filter === 'low') segs = segs.filter(s => s.risk === filter);

  if (fmt === 'csv') {
    const rows: (string | number)[][] = [['학생', 'user_id', '위험도', '점수', '출석일', '마지막출석(일전)', '집중도', '평가수', '평가평균', '평가추세', '음성', 'AI위험', '사유']];
    for (const s of segs) rows.push([s.name, s.user_id, s.risk, s.score, s.attendance_days, s.days_since_last ?? '', s.gaze ?? '', s.eval_count, s.eval_avg ?? '', s.eval_trend ?? '', s.voice ?? '', s.ai_risk ?? '', s.reasons.join(' / ')]);
    return csv(`learning-segments-${todayKST()}.csv`, rows);
  }
  const dist = { high: 0, medium: 0, low: 0 };
  for (const s of segs) dist[s.risk]++;
  return json({ ok: true, range_days: days, count: segs.length, distribution: dist, students: segs });
}

// ── 3) 학생 장기 트렌드 ──────────────────────────────────────────────────
async function trends(env: Env, url: URL): Promise<Response> {
  const uid = url.searchParams.get('uid');
  if (!uid) return err('uid required');
  const months = clampInt(url.searchParams.get('months'), 6, 1, 24);
  const startPeriod = shiftMonth(currentPeriod(), -(months - 1));
  const startMs = (() => { const [y, m] = startPeriod.split('-').map(Number); return Date.UTC(y, m - 1, 1) - KST_OFFSET_MS; })();
  const startDate = startPeriod + '-01';

  const name = await safe(async () => {
    const r = await env.DB.prepare(`SELECT COALESCE(korean_name, english_name, user_id) AS n FROM students_erp WHERE user_id=?`).bind(uid).first<{ n: string }>();
    return r?.n || uid;
  }, uid);

  const attMap = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT substr(date,1,7) AS ym, COUNT(DISTINCT date) AS days,
              AVG(CASE WHEN gaze_samples>0 THEN gaze_score END) AS gaze
       FROM attendance WHERE user_id=? AND date >= ? GROUP BY ym`
    ).bind(uid, startDate).all<{ ym: string; days: number; gaze: number }>();
    const m: Record<string, any> = {};
    for (const r of (rs.results || [])) m[r.ym] = { days: r.days || 0, gaze: r.gaze != null ? Math.round(r.gaze * 10) / 10 : null };
    return m;
  }, {} as Record<string, any>);

  const evMap = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT strftime('%Y-%m',(created_at/1000+${SEC_OFFSET}),'unixepoch') AS ym, COUNT(*) AS c, AVG(score_overall) AS a
       FROM student_evaluations WHERE student_uid=? AND created_at >= ? GROUP BY ym`
    ).bind(uid, startMs).all<{ ym: string; c: number; a: number }>();
    const m: Record<string, any> = {};
    for (const r of (rs.results || [])) m[r.ym] = { count: r.c || 0, avg: r.a != null ? Math.round(r.a * 10) / 10 : null };
    return m;
  }, {} as Record<string, any>);

  const vMap = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT strftime('%Y-%m',(created_at/1000+${SEC_OFFSET}),'unixepoch') AS ym,
              AVG((COALESCE(accuracy_score,0)+COALESCE(pronunciation_score,0)+COALESCE(fluency_score,0))/3.0) AS v
       FROM voice_coaching WHERE student_uid=? AND created_at >= ? GROUP BY ym`
    ).bind(uid, startMs).all<{ ym: string; v: number }>();
    const m: Record<string, number> = {};
    for (const r of (rs.results || [])) m[r.ym] = r.v != null ? Math.round(r.v * 10) / 10 : 0;
    return m;
  }, {} as Record<string, number>);

  const series = [];
  for (let i = 0; i < months; i++) {
    const ym = shiftMonth(startPeriod, i);
    series.push({
      period: ym,
      attendance_days: attMap[ym]?.days || 0,
      gaze_avg: attMap[ym]?.gaze ?? null,
      eval_count: evMap[ym]?.count || 0,
      eval_avg: evMap[ym]?.avg ?? null,
      voice_avg: vMap[ym] ?? null,
    });
  }
  return json({ ok: true, uid, name, months, series });
}

// ── 4) 스냅샷 목록 ────────────────────────────────────────────────────────
async function listSnapshots(env: Env, url: URL): Promise<Response> {
  const period = url.searchParams.get('period');
  const limit = clampInt(url.searchParams.get('limit'), 500, 1, 2000);
  const rows = await safe(async () => {
    if (period) {
      const rs = await env.DB.prepare(`SELECT * FROM learning_trend_snapshots WHERE period=? ORDER BY eval_avg ASC LIMIT ?`).bind(period, limit).all();
      return rs.results || [];
    }
    const rs = await env.DB.prepare(`SELECT period, COUNT(*) AS students, AVG(eval_avg) AS eval_avg, AVG(attendance_days) AS att_avg, SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) AS high_n FROM learning_trend_snapshots GROUP BY period ORDER BY period DESC LIMIT ?`).bind(limit).all();
    return rs.results || [];
  }, [] as any[]);
  return json({ ok: true, period: period || null, count: rows.length, rows });
}

// ── 4b) 월별 위험도 분포 추이 (스냅샷 기반) ───────────────────────────────
async function riskHistory(env: Env, url: URL): Promise<Response> {
  const limit = clampInt(url.searchParams.get('months'), 6, 1, 24);
  const rows = await safe(async () => {
    const rs = await env.DB.prepare(
      `SELECT period,
              SUM(CASE WHEN risk_level='high' THEN 1 ELSE 0 END) AS high,
              SUM(CASE WHEN risk_level='medium' THEN 1 ELSE 0 END) AS medium,
              SUM(CASE WHEN risk_level='low' THEN 1 ELSE 0 END) AS low,
              COUNT(*) AS total,
              ROUND(AVG(eval_avg),1) AS eval_avg,
              ROUND(AVG(attendance_days),1) AS att_avg
       FROM learning_trend_snapshots GROUP BY period ORDER BY period DESC LIMIT ?`
    ).bind(limit).all();
    return (rs.results || []).reverse();
  }, [] as any[]);
  return json({ ok: true, months: limit, series: rows });
}

// ── 5) 월별 스냅샷 생성/갱신 (라우터 + cron 공용) ──────────────────────────
export async function runLearningSnapshot(env: Env, period?: string): Promise<{ period: string; students: number; high: number }> {
  await ensureTables(env);
  const pr = period && /^\d{4}-\d{2}$/.test(period) ? period : currentPeriod();
  // 해당 월 전체를 보는 윈도(대략 31일). buildSegments 는 '최근 N일'이므로 당월 스냅샷에 한해 사용.
  const segs = await buildSegments(env, 31);
  const now = Date.now();
  let high = 0;
  for (const s of segs) {
    if (s.risk === 'high') high++;
    await safe(async () => {
      await env.DB.prepare(
        `INSERT INTO learning_trend_snapshots (period, student_uid, student_name, attendance_days, eval_count, eval_avg, gaze_avg, voice_avg, risk_level, generated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(period, student_uid) DO UPDATE SET student_name=excluded.student_name, attendance_days=excluded.attendance_days, eval_count=excluded.eval_count, eval_avg=excluded.eval_avg, gaze_avg=excluded.gaze_avg, voice_avg=excluded.voice_avg, risk_level=excluded.risk_level, generated_at=excluded.generated_at`
      ).bind(pr, s.user_id, s.name, s.attendance_days, s.eval_count, s.eval_avg, s.gaze, s.voice, s.risk, now).run();
      return true;
    }, false);
  }
  return { period: pr, students: segs.length, high };
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
function clampInt(v: string | null, def: number, min: number, max: number): number {
  const n = parseInt(v || '', 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
