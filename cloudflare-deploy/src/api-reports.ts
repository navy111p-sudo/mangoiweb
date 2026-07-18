// ═══════════════════════════════════════════════════════════════════════
// 📄 api-reports.ts — 월간 학습 보고서(MR)·월간 AI 레포트(MAR) (20차 분리)
//   runMonthlyReports 는 index.ts 크론이 import 해서 매월 자동 실행.
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';
import { sendKakaoAlimtalk, getSolapiMode } from './solapi-client';
import { computeGrowthForStudent } from './api-judgment';  // 🧠 판단력 성장(월간 리포트 삽입)
import type { MangoEnv } from './api-mango';

// ═══════════════════════════════════════════════════════════════════════
// 📊 월간 AI 레포트 — 공용 헬퍼 (생성 + AI + 카카오 발송 + 월간 배치)
//   엔드포인트: /api/admin/monthly-report/{generate,send,list}, /api/report/monthly-view
//   Cron(scheduled)에서 runMonthlyReports() 호출.
// ═══════════════════════════════════════════════════════════════════════
const MONTHLY_SITE_ORIGIN = 'https://webrtc-unified-platform.navy111p.workers.dev';

function _monthlyToken(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function ensureMonthlyReportsTable(env: MangoEnv): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS monthly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, period TEXT NOT NULL, ai_text TEXT, metrics_json TEXT, access_token TEXT NOT NULL, status TEXT DEFAULT 'draft', sent_to_student INTEGER DEFAULT 0, sent_to_parent INTEGER DEFAULT 0, sent_log TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, UNIQUE(student_uid, period));`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period)`); } catch {}
}

// 학생 월간 데이터 수집(+선택적 AI 서술). Phase MR GET 과 동일 형태 반환.
async function buildMonthlyReportData(env: MangoEnv, uid: string, period: string, withAI: boolean): Promise<any> {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1;
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime();
  let student: any = null, att: any = { d: 0 }, voiceStats: any = {}, evalRows: any[] = [];
  try { student = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, phone FROM students_erp WHERE user_id = ?`).bind(uid).first(); } catch {}
  try { att = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, start, end).first(); } catch {}
  try {
    const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, strengths, improvements, next_goals, teacher_comment, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
    evalRows = (evals.results || []) as any[];
  } catch {}
  try { voiceStats = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first(); } catch {}
  const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

  let aiText = '';
  if (withAI) {
    try {
      const nm = (student && student.student_name) || uid;
      if (evalRows.length === 0 && (att?.d || 0) === 0) {
        aiText = `${nm} 학부모님, 이번 달은 수업 기록이 많지 않아 상세 요약을 생략합니다. 다음 달 꾸준한 참여를 함께 응원하겠습니다. 감사합니다.`;
      } else {
        const recentComment = evalRows.length ? (evalRows[evalRows.length - 1].teacher_comment || '') : '';
        const strengths = evalRows.map((r: any) => r.strengths).filter(Boolean).slice(-3).join('; ');
        const improvements = evalRows.map((r: any) => r.improvements).filter(Boolean).slice(-3).join('; ');
        const nextGoals = evalRows.map((r: any) => r.next_goals).filter(Boolean).slice(-2).join('; ');
        const sys = '당신은 영어학원 담임 강사입니다. 학부모님께 보내는 따뜻하고 구체적인 한국어 월간 학습 레포트를 4~6문장으로 작성하세요. 반드시 칭찬 1가지, 성장 영역 1가지, 다음 달 목표 1가지를 포함하세요. 과장하지 말고, 주어진 숫자/사실만 사용하며 없는 내용은 지어내지 마세요. 존댓말로 작성하세요.';
        const usr = `학생: ${nm}\n기간: ${period}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;
        const aiRes: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], max_tokens: 420,
        });
        aiText = String((aiRes && (aiRes.response || aiRes.result)) || '').trim();
      }
    } catch { aiText = ''; }
  }

  return {
    ok: true,
    student: student || { user_id: uid, student_name: uid },
    year_month: period,
    attendance: { days: att?.d || 0 },
    evaluations: { count: evalRows.length, avg_score: evalAvg, items: evalRows },
    voice: {
      sessions: voiceStats?.n || 0,
      avg_accuracy: Math.round(voiceStats?.acc || 0),
      avg_pronunciation: Math.round(voiceStats?.pron || 0),
      avg_fluency: Math.round(voiceStats?.flu || 0),
      best: voiceStats?.best || 0,
    },
    ai_text: aiText,
    generated_at: Date.now(),
  };
}

// 레포트 행 보장(없으면 생성). 토큰 포함 행 반환.
async function ensureMonthlyReportRow(env: MangoEnv, uid: string, period: string): Promise<any> {
  await ensureMonthlyReportsTable(env);
  let row: any = null;
  try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
  if (row) return row;
  const data = await buildMonthlyReportData(env, uid, period, true);
  if (!data) return null;
  const token = _monthlyToken();
  const nm = (data.student && data.student.student_name) || uid;
  await env.DB.prepare(`INSERT OR REPLACE INTO monthly_reports (student_uid, student_name, period, ai_text, metrics_json, access_token, status, created_at) VALUES (?,?,?,?,?,?, 'draft', ?)`)
    .bind(uid, nm, period, data.ai_text || '', JSON.stringify(data), token, Date.now()).run();
  try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
  return row;
}

// 학생+학부모에게 월간 레포트 알림톡 발송 (키 없으면 'skipped'=모의).
async function sendMonthlyReportKakao(env: MangoEnv, uid: string, period: string, origin: string): Promise<any> {
  const row = await ensureMonthlyReportRow(env, uid, period);
  if (!row) return { ok: false, error: 'bad_period' };
  let stu: any = null;
  try { stu = await env.DB.prepare(`SELECT student_name, parent_name, parent_phone, phone FROM students_erp WHERE user_id=?`).bind(uid).first(); } catch {}
  const url = `${origin}/monthly-report.html?uid=${encodeURIComponent(uid)}&period=${encodeURIComponent(period)}&t=${row.access_token}`;
  const tmpl = (env as any).SOLAPI_TEMPLATE_MONTHLY_REPORT || '';
  const name = row.student_name || uid;
  let attDays = 0;
  try { attDays = (JSON.parse(row.metrics_json || '{}').attendance || {}).days || 0; } catch {}
  const vars: Record<string, string> = { '#{학생명}': name, '#{기간}': period, '#{출석}': String(attDays), '#{URL}': url };
  const fallback = `[망고아이] ${name} ${period} 학습 레포트가 도착했어요: ${url}`;
  const out: any = { url, mode: getSolapiMode(env), student: null, parent: null };
  const sPhone = stu && stu.phone;
  const pPhone = stu && stu.parent_phone;
  if (sPhone) out.student = await sendKakaoAlimtalk(env, { templateCode: tmpl, recipientPhone: sPhone, recipientName: name, variables: { ...vars }, fallbackSmsText: fallback, logContext: { userId: uid, reason: 'monthly_report' } });
  if (pPhone) out.parent = await sendKakaoAlimtalk(env, { templateCode: tmpl, recipientPhone: pPhone, recipientName: (stu && stu.parent_name) || name, variables: { ...vars }, fallbackSmsText: fallback, logContext: { userId: uid, reason: 'monthly_report' } });
  const sentStudent = out.student && out.student.ok ? 1 : 0;
  const sentParent = out.parent && out.parent.ok ? 1 : 0;
  try {
    await env.DB.prepare(`UPDATE monthly_reports SET status=?, sent_to_student=?, sent_to_parent=?, sent_log=?, sent_at=? WHERE id=?`)
      .bind((sentStudent || sentParent) ? 'sent' : 'skipped', sentStudent, sentParent, JSON.stringify(out), Date.now(), row.id).run();
  } catch {}
  out.ok = true; out.sent_to_student = sentStudent; out.sent_to_parent = sentParent;
  return out;
}

// 월간 배치 — 활성 학생 전체에 생성+발송 (Cron 에서 호출)
export async function runMonthlyReports(env: MangoEnv, period: string, origin?: string): Promise<any> {
  const org = origin || MONTHLY_SITE_ORIGIN;
  await ensureMonthlyReportsTable(env);
  let students: any[] = [];
  try {
    const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE (status='정상' OR status IS NULL OR status='') LIMIT 1000`).all();
    students = (rs.results || []) as any[];
  } catch {}
  let generated = 0, sent = 0, errors = 0;
  for (const s of students) {
    try {
      const r = await sendMonthlyReportKakao(env, s.user_id, period, org);
      generated++;
      if (r && (r.sent_to_student || r.sent_to_parent)) sent++;
    } catch { errors++; }
  }
  return { period, total: students.length, generated, sent, errors };
}

export async function handleReportsApi(
  request: Request,
  url: URL,
  env: MangoEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ═══════════════════════════════════════════════════════════════
    // 📄 Phase MR — 월별 학습 보고서 (학생별 / 학부모용)
    //   GET /api/report/monthly/:uid/:yyyy-mm — JSON 데이터 + URL 로 page 렌더
    // ═══════════════════════════════════════════════════════════════
    const monthlyMatch = path.match(/^\/api\/report\/monthly\/([^\/]+)\/(\d{4})-(\d{2})$/);
    if (method === 'GET' && monthlyMatch) {
      const uid = decodeURIComponent(monthlyMatch[1]);
      const year = parseInt(monthlyMatch[2], 10);
      const month = parseInt(monthlyMatch[3], 10) - 1;
      const start = new Date(year, month, 1).getTime();
      const end = new Date(year, month + 1, 1).getTime();

      // 🔐 [PII] 본인(학생/학부모 토큰) 또는 관리자만 — 월간 리포트(결제 총액·평가 포함) IDOR 차단.
      //   공유 링크로 보려면 별도 /api/report/monthly-view?t= (토큰 검증) 경로 사용.
      const rmAuth = await authUidGlobal(request, url, env);
      const rmAdmin = await checkAdminSession(request, env as any);
      if (!rmAdmin.ok && (!rmAuth || rmAuth !== uid)) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 리포트만 조회할 수 있습니다.' }, 401);
      }

      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, joined_at INTEGER, date TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, lesson_date TEXT, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, created_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, created_at INTEGER NOT NULL);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, paid_at INTEGER, amount_krw INTEGER);`);

        const student: any = await env.DB.prepare(`SELECT user_id, student_name, parent_name FROM students_erp WHERE user_id = ?`).bind(uid).first();
        const att: any = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, start, end).first();
        const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, strengths, improvements, next_goals, teacher_comment, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
        const voiceStats: any = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first();
        const pays: any = await env.DB.prepare(`SELECT IFNULL(SUM(amount_krw),0) AS total FROM student_payments WHERE user_id = ? AND paid_at >= ? AND paid_at < ?`).bind(uid, start, end).first();

        const evalRows = (evals.results || []) as any[];
        const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

        // fix (2026-06-02) — ?ai=1 이면 학부모용 한국어 레포트 텍스트를 AI(Llama)로 생성.
        //   데이터가 없으면 안전한 안내문으로 대체. 실패해도 보고서는 정상 반환(빈 ai_text).
        let aiText = '';
        if (url.searchParams.get('ai') === '1') {
          try {
            const nm = (student?.student_name) || uid;
            const recentComment = evalRows.length ? (evalRows[evalRows.length - 1].teacher_comment || '') : '';
            const strengths = evalRows.map((r: any) => r.strengths).filter(Boolean).slice(-3).join('; ');
            const improvements = evalRows.map((r: any) => r.improvements).filter(Boolean).slice(-3).join('; ');
            const nextGoals = evalRows.map((r: any) => r.next_goals).filter(Boolean).slice(-2).join('; ');
            if (evalRows.length === 0 && (att?.d || 0) === 0) {
              aiText = `${nm} 학부모님, 이번 달은 수업 기록이 많지 않아 상세 요약을 생략합니다. 다음 달 꾸준한 참여를 함께 응원하겠습니다. 감사합니다.`;
            } else {
              const sys = '당신은 영어학원 담임 강사입니다. 학부모님께 보내는 따뜻하고 구체적인 한국어 월간 학습 레포트를 4~6문장으로 작성하세요. 반드시 칭찬 1가지, 성장 영역 1가지, 다음 달 목표 1가지를 포함하세요. 과장하지 말고, 주어진 숫자/사실만 사용하며 없는 내용은 지어내지 마세요. 존댓말로 작성하세요.';
              const usr = `학생: ${nm}\n기간: ${year}-${String(month + 1).padStart(2, '0')}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;
              const aiRes: any = await (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }],
                max_tokens: 420,
              });
              aiText = String((aiRes && (aiRes.response || aiRes.result)) || '').trim();
            }
          } catch (e) { aiText = ''; }
        }

        return json({
          ok: true,
          student: student || { user_id: uid, student_name: uid },
          year_month: `${year}-${String(month + 1).padStart(2, '0')}`,
          attendance: { days: att?.d || 0 },
          evaluations: { count: evalRows.length, avg_score: evalAvg, items: evalRows },
          voice: {
            sessions: voiceStats?.n || 0,
            avg_accuracy: Math.round(voiceStats?.acc || 0),
            avg_pronunciation: Math.round(voiceStats?.pron || 0),
            avg_fluency: Math.round(voiceStats?.flu || 0),
            best: voiceStats?.best || 0,
          },
          payments: { total_krw: pays?.total || 0 },
          ai_text: aiText,
          generated_at: Date.now(),
        });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }
    // ═══════════════════════════════════════════════════════════════
    // 📄 Phase MR 끝
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase MAR — 월간 AI 레포트 (생성/목록/발송 + 토큰 열람)
    // ═══════════════════════════════════════════════════════════════
    // POST /api/admin/monthly-report/generate  { uid, period:"YYYY-MM" }
    if (method === 'POST' && path === '/api/admin/monthly-report/generate') {
      await ensureMonthlyReportsTable(env);
      const b: any = await parseJsonBody(request);
      const uid = String(b?.uid || '').trim();
      const period = String(b?.period || '').trim();
      if (!uid || !/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'uid/period 필요 (period=YYYY-MM)' }, 400);
      const data = await buildMonthlyReportData(env, uid, period, true);
      if (!data) return json({ ok: false, error: 'bad_period' }, 400);
      let existing: any = null;
      try { existing = await env.DB.prepare(`SELECT access_token FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
      const token = (existing && existing.access_token) || _monthlyToken();
      const nm = (data.student && data.student.student_name) || uid;
      await env.DB.prepare(`INSERT OR REPLACE INTO monthly_reports (student_uid, student_name, period, ai_text, metrics_json, access_token, status, created_at) VALUES (?,?,?,?,?,?, 'draft', ?)`)
        .bind(uid, nm, period, data.ai_text || '', JSON.stringify(data), token, Date.now()).run();
      const origin = new URL(request.url).origin;
      const viewUrl = `${origin}/monthly-report.html?uid=${encodeURIComponent(uid)}&period=${encodeURIComponent(period)}&t=${token}`;
      return json({ ok: true, report: data, token, url: viewUrl });
    }

    // GET /api/admin/monthly-report/list?period=YYYY-MM
    if (method === 'GET' && path === '/api/admin/monthly-report/list') {
      await ensureMonthlyReportsTable(env);
      const period = url.searchParams.get('period') || '';
      let rows: any[] = [];
      try {
        const stmt = period
          ? env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports WHERE period=? ORDER BY created_at DESC LIMIT 500`).bind(period)
          : env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports ORDER BY created_at DESC LIMIT 200`);
        const rs = await stmt.all();
        rows = (rs.results || []) as any[];
      } catch {}
      return json({ ok: true, items: rows });
    }

    // POST /api/admin/monthly-report/send  { uid, period }  (학생+학부모 알림톡)
    if (method === 'POST' && path === '/api/admin/monthly-report/send') {
      const b: any = await parseJsonBody(request);
      const uid = String(b?.uid || '').trim();
      const period = String(b?.period || '').trim();
      if (!uid || !/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'uid/period 필요' }, 400);
      const r = await sendMonthlyReportKakao(env, uid, period, new URL(request.url).origin);
      return json(r);
    }

    // POST /api/admin/monthly-report/run-all  { period }  (전체 학생 일괄)
    if (method === 'POST' && path === '/api/admin/monthly-report/run-all') {
      const b: any = await parseJsonBody(request);
      const period = String(b?.period || '').trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'period 필요 (YYYY-MM)' }, 400);
      const r = await runMonthlyReports(env, period, new URL(request.url).origin);
      return json({ ok: true, ...r });
    }

    // GET /api/report/monthly-view?uid=&period=&t=  (공개 · 토큰 검증)
    if (method === 'GET' && path === '/api/report/monthly-view') {
      await ensureMonthlyReportsTable(env);
      const uid = url.searchParams.get('uid') || '';
      const period = url.searchParams.get('period') || '';
      const tok = url.searchParams.get('t') || '';
      if (!uid || !period || !tok) return json({ ok: false, error: 'missing' }, 400);
      let row: any = null;
      try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
      if (!row || row.access_token !== tok) return json({ ok: false, error: 'forbidden' }, 403);
      let data: any = {};
      try { data = JSON.parse(row.metrics_json || '{}'); } catch {}
      data.ai_text = row.ai_text || data.ai_text || '';
      data.ok = true;
      return json(data);
    }
    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase MAR 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
