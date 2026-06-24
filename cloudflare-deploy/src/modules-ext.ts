/**
 * modules-ext.ts — 망고아이 신규 운영 인프라 4모듈 (확장)
 * ─────────────────────────────────────────────────────────────────────
 * 라우트 prefix: /api/admin/mod/*  → 기존 라우트(reports/realtime/...)와 완전 분리.
 * 모든 핸들러는 자체 try/catch + ensureTables(IF NOT EXISTS)로 독립 동작하며
 * 기존 테이블(class_attendance / class_schedules / teacher_profiles)은 "읽기"로만 재사용.
 *
 *   [모듈1] 정산 분개 + 송금 상태관리
 *     POST /api/admin/mod/settlement/build      결제내역 → PG2.86%/본사15~18% 분개 적재
 *     GET  /api/admin/mod/settlement/list?period=YYYY-MM   월·지점별 정산 요약
 *     POST /api/admin/mod/settlement/pay        단건(ids[]) 또는 지점·월 일괄 → 송금완료
 *   [모듈2] 출석 위험군 + 알림 큐
 *     GET  /api/admin/mod/risk/scan             출석률 ≤70% 학생(Fail/Warning) 스캔
 *     POST /api/admin/mod/risk/enqueue          위험군 학부모 알림 'pending' 적재
 *     GET  /api/admin/mod/queue/list            대기 알림 큐 목록
 *   [모듈3] 공휴일(KR/PH) + 교사 휴가 + 스케줄 검증
 *     POST /api/admin/mod/holidays/sync         Nager.Date에서 KR/PH 공휴일 upsert
 *     GET  /api/admin/mod/holidays/list?year=   공휴일 목록
 *     POST /api/admin/mod/vacation/add          교사 휴가 등록
 *     POST /api/admin/mod/schedule/validate     특정 일자 배정 가능 여부(공휴일/휴가 차단)
 *   [모듈4] 교재 ↔ 비디오 매핑
 *     POST /api/admin/mod/textbook/upsert       교재 메타 등록
 *     POST /api/admin/mod/video/upsert          유튜브 비디오 등록(URL→id 파싱)
 *     POST /api/admin/mod/textbook/map          교재-비디오 매핑(중복 조합 무시)
 *     GET  /api/admin/mod/textbook/resources?textbook_id=   관련 영상+퀴즈 일괄 로딩
 */

import { sendKakaoAlimtalk, getSolapiMode, type SolapiEnv } from './solapi-client';

interface Env extends SolapiEnv {
  DB: D1Database;
  SOLAPI_TEMPLATE_ATTENDANCE_RISK?: string;   // 위험군 알림톡 템플릿 코드(선택)
}

// ── 응답 헬퍼 (모듈 독립) ──────────────────────────────────────────────
const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
const err = (msg: string, status = 400) => json({ ok: false, error: msg }, status);

// ── 정산 상수 ──────────────────────────────────────────────────────────
const PG_RATE = 0.0286;           // PG 수수료율 2.86%
const HQ_RATE_DEFAULT = 0.15;     // 본사 수수료 기본 15% (지점별 0.15~0.18)

/** 정산 핵심 계산 — 단위 테스트 대상(export) */
export function computeSettlement(gross: number, hqRate: number = HQ_RATE_DEFAULT) {
  const g = Math.max(0, Math.round(gross || 0));
  const pgFee = Math.round(g * PG_RATE);
  const net = g - pgFee;
  const rate = Math.min(0.18, Math.max(0.15, hqRate || HQ_RATE_DEFAULT)); // 15~18% 클램프
  const hqFee = Math.round(net * rate);
  const branchPayout = net - hqFee;
  return { gross: g, pgFee, net, hqRate: rate, hqFee, branchPayout };
}

/** 유튜브 URL → 11자 video id 파싱 — 단위 테스트 대상(export) */
export function extractYoutubeId(url: string): string | null {
  if (typeof url !== 'string') return null;
  const m = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** 위험군 학부모 메시지 — 톤앤매너 분기(export) */
export function buildParentMessage(s: { student_name?: string; rate?: number; segment?: string }): string {
  const name = s.student_name || '학생';
  const pct = Math.round((s.rate ?? 0) * 100);
  if (s.segment === 'Fail') {
    return `[망고아이] ${name} 학부모님, 최근 출석률이 ${pct}%로 낮아 학습 연속성이 우려됩니다. ` +
           `상담을 통해 도와드리고 싶습니다. 편하신 시간을 알려주시면 연락드리겠습니다. 감사합니다.`;
  }
  return `[망고아이] ${name} 학부모님, 안녕하세요. 최근 출석률이 ${pct}%로 조금 낮아 안내드립니다. ` +
         `궁금하신 점 있으시면 언제든 문의 주세요. 늘 응원하겠습니다!`;
}

// ── 테이블 보장 (IF NOT EXISTS — 재실행/중복 안전) ──────────────────────
async function ensureTables(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settlement_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pay_id TEXT UNIQUE, channel TEXT NOT NULL,
      branch_id TEXT NOT NULL, branch_name TEXT, period TEXT NOT NULL,
      gross_amount INTEGER NOT NULL, pg_fee INTEGER NOT NULL, net_amount INTEGER NOT NULL,
      hq_rate REAL NOT NULL DEFAULT 0.15, hq_fee INTEGER NOT NULL, branch_payout INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ledger_branch ON settlement_ledger(branch_id, period);`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_notify_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, dedup_key TEXT UNIQUE,
      student_id TEXT NOT NULL, student_name TEXT, segment TEXT, attend_rate REAL,
      parent_phone TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT, country TEXT NOT NULL, date TEXT NOT NULL,
      name TEXT NOT NULL, source TEXT DEFAULT 'api', UNIQUE(country, date));`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS teacher_vacations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, type TEXT DEFAULT 'vacation', memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(teacher_id, start_date, end_date));`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_textbooks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, isbn TEXT, level TEXT,
      unit_count INTEGER DEFAULT 0, meta_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_videos (
      id TEXT PRIMARY KEY, youtube_url TEXT NOT NULL, youtube_id TEXT, title TEXT,
      lesson_no INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS mod_tb_video_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT, textbook_id TEXT NOT NULL, video_id TEXT NOT NULL,
      unit_no INTEGER, quiz_id TEXT, UNIQUE(textbook_id, video_id, unit_no));`),
  ]);
}

// ════════════════════ 라우터 ════════════════════
export async function modulesRouter(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const p = url.pathname.replace(/^\/api\/admin\/mod\/?/, '');
  const method = request.method.toUpperCase();
  try {
    await ensureTables(env);

    // 모듈1
    if (p === 'settlement/build' && method === 'POST') return settlementBuild(request, env);
    if (p === 'settlement/list'  && method === 'GET')  return settlementList(env, url);
    if (p === 'settlement/pay'   && method === 'POST') return settlementPay(request, env);
    // 모듈2
    if (p === 'risk/scan'        && method === 'GET')  return riskScan(env);
    if (p === 'risk/enqueue'     && method === 'POST') return riskEnqueue(request, env);
    if (p === 'queue/list'       && method === 'GET')  return queueList(env);
    if (p === 'queue/send'       && method === 'POST') return queueSend(request, env);
    // 모듈3
    if (p === 'holidays/sync'    && method === 'POST') return holidaysSync(request, env);
    if (p === 'holidays/list'    && method === 'GET')  return holidaysList(env, url);
    if (p === 'vacation/add'     && method === 'POST') return vacationAdd(request, env);
    if (p === 'schedule/validate'&& method === 'POST') return scheduleValidate(request, env);
    // 모듈4
    if (p === 'textbook/upsert'  && method === 'POST') return textbookUpsert(request, env);
    if (p === 'video/upsert'     && method === 'POST') return videoUpsert(request, env);
    if (p === 'textbook/map'     && method === 'POST') return textbookMap(request, env);
    if (p === 'textbook/resources' && method === 'GET') return textbookResources(env, url);

    return err('not found: ' + p, 404);
  } catch (e: any) {
    return err(e?.message || 'modules internal error', 500);
  }
}

/* ═════════ 모듈1) 정산 분개 + 송금 ═════════ */
async function settlementBuild(request: Request, env: Env): Promise<Response> {
  const body = await request.json<any>().catch(() => ({}));
  const rows: any[] = body.payments || [];
  if (!rows.length) return json({ ok: true, inserted: 0 });
  const stmt = env.DB.prepare(
    `INSERT INTO settlement_ledger
       (pay_id,channel,branch_id,branch_name,period,gross_amount,pg_fee,net_amount,hq_rate,hq_fee,branch_payout,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')
     ON CONFLICT(pay_id) DO NOTHING`);
  const batch = rows.map(pmt => {
    const c = computeSettlement(pmt.gross_amount, pmt.hq_rate ?? HQ_RATE_DEFAULT);
    return stmt.bind(pmt.pay_id, pmt.channel || 'B2C', pmt.branch_id, pmt.branch_name ?? null,
      pmt.period, c.gross, c.pgFee, c.net, c.hqRate, c.hqFee, c.branchPayout);
  });
  await env.DB.batch(batch);
  return json({ ok: true, inserted: batch.length });
}

async function settlementList(env: Env, url: URL): Promise<Response> {
  const period = url.searchParams.get('period') || '';
  const q = `SELECT branch_id, branch_name, period, channel,
                    SUM(gross_amount) gross, SUM(pg_fee) pg, SUM(net_amount) net,
                    SUM(hq_fee) hq, SUM(branch_payout) payout,
                    SUM(CASE WHEN status='paid' THEN branch_payout ELSE 0 END) paid,
                    SUM(CASE WHEN status='pending' THEN branch_payout ELSE 0 END) unpaid,
                    MIN(status) status, COUNT(*) cnt
             FROM settlement_ledger ${period ? 'WHERE period=?' : ''}
             GROUP BY branch_id, period ORDER BY period DESC, branch_name`;
  const r = period ? await env.DB.prepare(q).bind(period).all() : await env.DB.prepare(q).all();
  return json({ ok: true, rows: r.results });
}

async function settlementPay(request: Request, env: Env): Promise<Response> {
  const { branch_id, period, ids } = await request.json<any>().catch(() => ({}));
  let res;
  if (Array.isArray(ids) && ids.length) {
    const ph = ids.map(() => '?').join(',');
    res = await env.DB.prepare(
      `UPDATE settlement_ledger SET status='paid', paid_at=datetime('now')
       WHERE id IN (${ph}) AND status='pending'`).bind(...ids).run();
  } else if (branch_id && period) {
    res = await env.DB.prepare(
      `UPDATE settlement_ledger SET status='paid', paid_at=datetime('now')
       WHERE branch_id=? AND period=? AND status='pending'`).bind(branch_id, period).run();
  } else {
    return err('branch_id+period 또는 ids[] 필요');
  }
  return json({ ok: true, updated: res.meta.changes });
}

/* ═════════ 모듈2) 위험군 + 알림 큐 ═════════ */
async function riskScan(env: Env): Promise<Response> {
  // 실데이터 연동: students_erp(학생 마스터) ⋈ attendance(세션 기록, role='student').
  //   최근 30일 출석일수 / (주당수업 × 4.3주) = 출석률. ≤70% 위험군(≤50% Fail).
  //   classes_per_week 미설정시 3회로 보정. parent_phone 있는 정상 학생만 대상.
  const real = `WITH att AS (
      SELECT e.user_id AS student_id,
             COALESCE(e.student_name, e.korean_name, e.english_name, e.user_id) AS student_name,
             e.parent_phone,
             COALESCE(NULLIF(e.classes_per_week,0),3) AS cpw,
             (SELECT COUNT(DISTINCT a.date) FROM attendance a
                WHERE a.user_id=e.user_id AND a.role='student' AND a.date>=date('now','-30 day')) AS attended
      FROM students_erp e
      WHERE e.status='정상' AND e.parent_phone IS NOT NULL AND e.parent_phone<>'')
    SELECT student_id, student_name, parent_phone,
           MIN(1.0, attended*1.0/(cpw*4.3)) AS rate
    FROM att
    WHERE (attended*1.0/(cpw*4.3)) <= 0.70
    ORDER BY rate ASC`;
  let rows: any[] = [];
  try {
    const r = await env.DB.prepare(real).all<any>();
    rows = r.results || [];
  } catch {
    // 폴백: 구버전 class_attendance 가 있는 환경
    try {
      const r = await env.DB.prepare(
        `SELECT student_id, MAX(student_name) student_name, MAX(parent_phone) parent_phone,
                AVG(CASE WHEN actual IS NOT NULL AND actual<>'' THEN 1.0 ELSE 0.0 END) rate, COUNT(*) total
         FROM class_attendance GROUP BY student_id HAVING rate <= 0.70 AND total >= 4 ORDER BY rate ASC`).all<any>();
      rows = r.results || [];
    } catch { rows = []; }
  }
  const students = rows.map(s => ({ ...s, segment: s.rate <= 0.5 ? 'Fail' : 'Warning' }));
  return json({ ok: true, count: students.length, students });
}

async function riskEnqueue(request: Request, env: Env): Promise<Response> {
  const { students } = await request.json<any>().catch(() => ({ students: [] }));
  const month = new Date().toISOString().slice(0, 7);
  const stmt = env.DB.prepare(
    `INSERT INTO mod_notify_queue
       (event_type,dedup_key,student_id,student_name,segment,attend_rate,parent_phone,message,status)
     VALUES ('attendance_risk',?,?,?,?,?,?,?,'pending')
     ON CONFLICT(dedup_key) DO NOTHING`);
  const batch = (students || []).filter((s: any) => s.parent_phone).map((s: any) => stmt.bind(
    `risk_${s.student_id}_${month}`, s.student_id, s.student_name ?? null,
    s.segment ?? null, s.rate ?? null, s.parent_phone, buildParentMessage(s)));
  if (batch.length) await env.DB.batch(batch);
  return json({ ok: true, enqueued: batch.length });
}

async function queueList(env: Env): Promise<Response> {
  const r = await env.DB.prepare(
    `SELECT * FROM mod_notify_queue WHERE status='pending' ORDER BY created_at DESC LIMIT 500`).all();
  return json({ ok: true, rows: r.results });
}

// 알림 큐 → Solapi(카카오 알림톡/SMS) 발송.
//   안전장치: dryRun(기본 true)=미리보기만. 실제 발송은 {dryRun:false} 명시 필요.
//   SOLAPI 키 미설정이면 'disabled' 로 보고 발송하지 않고 큐를 그대로 둔다.
async function queueSend(request: Request, env: Env): Promise<Response> {
  const { ids, dryRun = true } = await request.json<any>().catch(() => ({}));
  const where = Array.isArray(ids) && ids.length
    ? `id IN (${ids.map(() => '?').join(',')})` : `status='pending'`;
  const sel = `SELECT * FROM mod_notify_queue WHERE ${where} ORDER BY created_at DESC LIMIT 200`;
  const q = Array.isArray(ids) && ids.length
    ? await env.DB.prepare(sel).bind(...ids).all<any>()
    : await env.DB.prepare(sel).all<any>();
  const rows = q.results || [];
  const mode = getSolapiMode(env);

  // 미리보기 또는 키 미설정 → 발송하지 않음(큐 유지)
  if (dryRun || mode === 'disabled') {
    return json({
      ok: true, dryRun: dryRun || mode === 'disabled', mode,
      pending: rows.length,
      note: mode === 'disabled'
        ? 'SOLAPI 키 미설정 — 발송 보류(큐 유지). 미리보기만 제공.'
        : '미리보기(dryRun). 실제 발송하려면 dryRun:false 로 호출하세요.',
      preview: rows.slice(0, 20).map((r: any) => ({ student_name: r.student_name, parent_phone: r.parent_phone, segment: r.segment, message: r.message })),
    });
  }

  // 실제 발송 (mode = mock | real)
  let sent = 0, failed = 0;
  for (const r of rows) {
    const res = await sendKakaoAlimtalk(env, {
      templateCode: env.SOLAPI_TEMPLATE_ATTENDANCE_RISK || '',
      recipientPhone: r.parent_phone,
      recipientName: r.student_name,
      variables: { '#{학생명}': r.student_name || '', '#{출석률}': String(Math.round((r.attend_rate || 0) * 100)) },
      fallbackSmsText: r.message,    // 템플릿 미설정 환경에선 SMS 폴백 문구로 사용
    });
    if (res.ok) {
      sent++;
      await env.DB.prepare(`UPDATE mod_notify_queue SET status='sent', sent_at=datetime('now') WHERE id=?`).bind(r.id).run();
    } else {
      failed++;
      await env.DB.prepare(`UPDATE mod_notify_queue SET status='failed' WHERE id=?`).bind(r.id).run();
    }
  }
  return json({ ok: true, dryRun: false, mode, sent, failed });
}

/* ═════════ 모듈3) 공휴일 + 휴가 + 검증 ═════════ */
async function holidaysSync(request: Request, env: Env): Promise<Response> {
  const { year = 2026, countries = ['KR', 'PH'] } = await request.json<any>().catch(() => ({}));
  let total = 0;
  for (const cc of countries) {
    let items: any[] = [];
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`);
      if (res.ok) items = await res.json();
    } catch { /* 네트워크 실패 → 프론트 상수 폴백 사용 */ }
    if (!items.length) continue;
    const stmt = env.DB.prepare(
      `INSERT INTO holidays (country,date,name,source) VALUES (?,?,?,'api')
       ON CONFLICT(country,date) DO NOTHING`);
    const batch = items.map(h => stmt.bind(cc, h.date, h.localName || h.name));
    await env.DB.batch(batch); total += batch.length;
  }
  return json({ ok: true, upserted: total });
}

async function holidaysList(env: Env, url: URL): Promise<Response> {
  const y = url.searchParams.get('year') || '2026';
  const r = await env.DB.prepare(
    `SELECT country,date,name FROM holidays WHERE date LIKE ? ORDER BY date`).bind(`${y}-%`).all();
  return json({ ok: true, rows: r.results });
}

async function vacationAdd(request: Request, env: Env): Promise<Response> {
  const v = await request.json<any>().catch(() => ({}));
  if (!v.teacher_id || !v.start_date || !v.end_date) return err('teacher_id/start_date/end_date 필요');
  await env.DB.prepare(
    `INSERT INTO teacher_vacations (teacher_id,teacher_name,start_date,end_date,type,memo)
     VALUES (?,?,?,?,?,?) ON CONFLICT(teacher_id,start_date,end_date) DO NOTHING`)
    .bind(v.teacher_id, v.teacher_name ?? null, v.start_date, v.end_date, v.type ?? 'vacation', v.memo ?? null).run();
  return json({ ok: true });
}

async function scheduleValidate(request: Request, env: Env): Promise<Response> {
  const { date, teacher_id } = await request.json<any>().catch(() => ({}));
  if (!date) return err('date 필요');
  const hol = await env.DB.prepare(`SELECT country,name FROM holidays WHERE date=? LIMIT 1`).bind(date).first<any>();
  const vac = teacher_id ? await env.DB.prepare(
    `SELECT type FROM teacher_vacations WHERE teacher_id=? AND ? BETWEEN start_date AND end_date LIMIT 1`)
    .bind(teacher_id, date).first<any>() : null;
  const blocked = !!(hol || vac);
  return json({
    ok: true, date, blocked,
    reason: hol ? `공휴일(${hol.country}: ${hol.name})` : vac ? `교사 휴가(${vac.type})` : null,
  });
}

/* ═════════ 모듈4) 교재-비디오 매핑 ═════════ */
async function textbookUpsert(request: Request, env: Env): Promise<Response> {
  const t = await request.json<any>().catch(() => ({}));
  if (!t.id || !t.title) return err('id/title 필요');
  await env.DB.prepare(
    `INSERT INTO mod_textbooks (id,title,isbn,level,unit_count,meta_json) VALUES (?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, isbn=excluded.isbn,
        level=excluded.level, unit_count=excluded.unit_count, meta_json=excluded.meta_json`)
    .bind(t.id, t.title, t.isbn ?? null, t.level ?? null, t.unit_count ?? 0, t.meta_json ?? null).run();
  return json({ ok: true });
}

async function videoUpsert(request: Request, env: Env): Promise<Response> {
  const v = await request.json<any>().catch(() => ({}));
  if (!v.id || !v.youtube_url) return err('id/youtube_url 필요');
  const yid = extractYoutubeId(v.youtube_url);
  await env.DB.prepare(
    `INSERT INTO mod_videos (id,youtube_url,youtube_id,title,lesson_no) VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET youtube_url=excluded.youtube_url, youtube_id=excluded.youtube_id,
        title=excluded.title, lesson_no=excluded.lesson_no`)
    .bind(v.id, v.youtube_url, yid, v.title ?? null, v.lesson_no ?? null).run();
  return json({ ok: true, youtube_id: yid });
}

async function textbookMap(request: Request, env: Env): Promise<Response> {
  const { textbook_id, video_id, unit_no, quiz_id } = await request.json<any>().catch(() => ({}));
  if (!textbook_id || !video_id) return err('textbook_id/video_id 필요');
  await env.DB.prepare(
    `INSERT INTO mod_tb_video_map (textbook_id,video_id,unit_no,quiz_id) VALUES (?,?,?,?)
     ON CONFLICT(textbook_id,video_id,unit_no) DO NOTHING`)
    .bind(textbook_id, video_id, unit_no ?? null, quiz_id ?? null).run();
  return json({ ok: true });
}

async function textbookResources(env: Env, url: URL): Promise<Response> {
  const tid = url.searchParams.get('textbook_id');
  if (!tid) return err('textbook_id 필요');
  // 교재 클릭 시 관련 영상+퀴즈를 한 번에 (조인)
  const r = await env.DB.prepare(
    `SELECT m.unit_no, m.quiz_id, t.title textbook_title, t.level,
            v.id video_id, v.youtube_id, v.youtube_url, v.title video_title, v.lesson_no
     FROM mod_tb_video_map m
     JOIN mod_textbooks t ON t.id = m.textbook_id
     JOIN mod_videos    v ON v.id = m.video_id
     WHERE m.textbook_id=? ORDER BY m.unit_no, v.lesson_no`).bind(tid).all<any>();
  const rows = r.results || [];
  const mod_videos = rows.map(x => ({
    video_id: x.video_id, youtube_id: x.youtube_id, youtube_url: x.youtube_url,
    title: x.video_title, lesson_no: x.lesson_no, unit_no: x.unit_no, quiz_id: x.quiz_id,
  }));
  return json({
    ok: true, textbook_id: tid,
    textbook_title: rows[0]?.textbook_title ?? null, level: rows[0]?.level ?? null,
    mod_videos, quizzes: mod_videos.filter(v => v.quiz_id).map(v => v.quiz_id),
  });
}
