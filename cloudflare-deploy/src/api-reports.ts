// ═══════════════════════════════════════════════════════════════════════
// 📄 api-reports.ts — 월간 학습 보고서(MR)·월간 AI 레포트(MAR) (20차 분리)
//   runMonthlyReports 는 index.ts 크론이 import 해서 매월 자동 실행.
// ═══════════════════════════════════════════════════════════════════════
import { json, parseJsonBody } from './api-util';
import { resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정(소유자/관리자 인증 일원화)
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

// ═══════════════════════════════════════════════════════════════════════
// 🌟 2026-07-25 — 오각형 리포트(성적표) 보완: 5축 레이더 + 강사승인 + 희망톤 헬퍼
// ═══════════════════════════════════════════════════════════════════════

// student_evaluations 의 점수 필드는 스키마 드리프트로 0~5(overall류)와 0~100(AI산출류)가 섞여 있다.
// ⚠️ 가정: 5 이하 값은 0~5 척도로 보고 ×20, 아니면 이미 0~100으로 본다(추후 커리큘럼 기준표 확정 시 재검토 — 기획안 5-3).
function toHundred(v: number | null | undefined): number | null {
  if (v == null || isNaN(Number(v))) return null;
  const n = Number(v);
  return n <= 5 ? Math.round(n * 20) : Math.round(Math.min(100, Math.max(0, n)));
}

function avgField(rows: any[], field: string): number | null {
  const vals = rows.map((r) => (r[field] == null ? null : Number(r[field]))).filter((v): v is number => v != null && !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const RADAR_AXIS_KO: Record<string, string> = { pronunciation: '발음·유창성', vocab: '어휘 수준', sentence: '문장 구성력', attitude: '수업 태도', participation: '학습 참여도' };
const RADAR_AXIS_EN: Record<string, string> = { pronunciation: 'Pronunciation & Fluency', vocab: 'Vocabulary Level', sentence: 'Sentence Building', attitude: 'Class Attitude', participation: 'Participation' };

// 직전 리포트(period 이전 중 가장 최근)의 오각형 점수 — "이번 기간 최고 성장" 계산용.
async function getPreviousRadar(env: MangoEnv, uid: string, period: string): Promise<Record<string, number> | null> {
  try {
    const row: any = await env.DB.prepare(`SELECT metrics_json FROM monthly_reports WHERE student_uid=? AND period<? ORDER BY period DESC LIMIT 1`).bind(uid, period).first();
    if (!row) return null;
    const data = JSON.parse(row.metrics_json || '{}');
    return data.radar || null;
  } catch { return null; }
}

// "이번 기간 최고 성장" — AI 문장이 아니라 템플릿(사실 오류 방지, 기획안 3장·4-1장).
function computeGrowthHighlight(radar: Record<string, number | null>, prevRadar: Record<string, number> | null): { axis: string; axis_ko: string; axis_en: string; delta: number; text_ko: string; text_en: string } | null {
  if (!prevRadar) return null;
  let best: string | null = null, bestDelta = 0;
  for (const k of Object.keys(radar)) {
    const cur = radar[k], prev = prevRadar[k];
    if (cur == null || prev == null) continue;
    const delta = cur - prev;
    if (delta > bestDelta) { bestDelta = delta; best = k; }
  }
  if (!best || bestDelta <= 0) return null;
  const delta = Math.round(bestDelta);
  return {
    axis: best, axis_ko: RADAR_AXIS_KO[best], axis_en: RADAR_AXIS_EN[best], delta,
    text_ko: `이번 기간 최고 성장 · ${RADAR_AXIS_KO[best]} (+${delta})`,
    text_en: `Biggest growth this period · ${RADAR_AXIS_EN[best]} (+${delta})`,
  };
}

// 연령대별 톤 — students_erp.birth_date 가 있을 때만 활성화된다.
// ⚠️ 2026-07-25 확인: 실서비스 students_erp.birth_date 는 29,373명 전원 미입력 상태(0%).
//   그래서 지금은 아래가 사실상 항상 null 을 반환해 연령대 미지정(범용 희망톤)으로 생성된다.
//   birth_date 입력이 채워지기 시작하면 코드 수정 없이 자동으로 연령대별 톤이 켜진다.
function computeAgeBand(birthDate: string | null | undefined): { ko: string; en: string } | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (isNaN(d.getTime())) return null;
  const ageYears = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  if (ageYears <= 9) return { ko: '유아~초등저학년', en: 'early elementary (age 6-9)' };
  if (ageYears <= 12) return { ko: '초등고학년', en: 'upper elementary (age 10-12)' };
  return { ko: '중·고등', en: 'teen (13+)' };
}

// AI 응답을 "코멘트\n---\n팁" 형식으로 요청 → 분리.
function splitCommentTip(raw: string): { comment: string; tip: string } {
  const parts = String(raw || '').split(/\n?-{2,}\n?/);
  return { comment: (parts[0] || '').trim(), tip: (parts[1] || '').trim() };
}

async function ensureMonthlyReportsTable(env: MangoEnv): Promise<void> {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS monthly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, period TEXT NOT NULL, ai_text TEXT, metrics_json TEXT, access_token TEXT NOT NULL, status TEXT DEFAULT 'draft', sent_to_student INTEGER DEFAULT 0, sent_to_parent INTEGER DEFAULT 0, sent_log TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, UNIQUE(student_uid, period));`);
  try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period)`); } catch {}
  // 🔒 2026-07-25 — 강사 승인 게이트 + AI 초안 통합 코멘트 컬럼 (가산 마이그레이션, api-lessons.ts ensureEvalTable 패턴과 동일)
  //   지금까지는 이 컬럼들이 없어 sendMonthlyReportKakao() 가 승인 확인 없이 바로 발송하고 있었음.
  try {
    const info: any = await env.DB.prepare(`PRAGMA table_info(monthly_reports)`).all();
    const have = new Set(((info && info.results) || []).map((r: any) => String(r.name)));
    const want: Array<[string, string]> = [
      ['approval_status', "TEXT DEFAULT 'pending'"],  // pending → approved 로만 전이. sendMonthlyReportKakao 가드 조건.
      ['approved_by', 'TEXT'],
      ['approved_at', 'INTEGER'],
      ['ai_draft_comment_ko', 'TEXT'],
      ['ai_draft_comment_en', 'TEXT'],
      ['ai_draft_tip_ko', 'TEXT'],
      ['ai_draft_tip_en', 'TEXT'],
    ];
    for (const [col, typ] of want) {
      if (!have.has(col)) { try { await env.DB.exec(`ALTER TABLE monthly_reports ADD COLUMN ${col} ${typ}`); } catch {} }
    }
  } catch {}
}

// 학생 리포트 데이터 수집(+선택적 AI 서술). Phase MR GET 과 동일 형태 반환.
// spanMonths: 몇 개월치를 모을지 — 2026-07-25 확정(발송 2개월 1회)으로 기본 2.
//   period="2026-07", spanMonths=2 → 2026-06-01 ~ 2026-07-31 을 모두 포함(한 달도 빠뜨리지 않음).
async function buildMonthlyReportData(env: MangoEnv, uid: string, period: string, withAI: boolean, spanMonths: number = 2): Promise<any> {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1;
  const end = new Date(year, month + 1, 1).getTime();
  const start = new Date(year, month + 1 - Math.max(1, spanMonths), 1).getTime();
  let student: any = null, att: any = { d: 0 }, voiceStats: any = {}, evalRows: any[] = [];
  try { student = await env.DB.prepare(`SELECT user_id, student_name, parent_name, parent_phone, phone, birth_date FROM students_erp WHERE user_id = ?`).bind(uid).first(); } catch {}
  try { att = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ?`).bind(uid, start, end).first(); } catch {}
  try {
    const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, score_vocab, score_grammar, score_attitude, score_participation, strengths, improvements, next_goals, teacher_comment, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
    evalRows = (evals.results || []) as any[];
  } catch {}
  try { voiceStats = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first(); } catch {}
  const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

  // 🧠 판단력 성장(해당 기간) — 이벤트가 있을 때만
  let judgment: any = null;
  try {
    const g = await computeGrowthForStudent(env, uid, period);
    if (g && (g.events_count || 0) > 0) {
      const MISC_KO: Record<string, string> = { REGISTER_MISMATCH: '상황에 맞는 말투', DIRECT_TRANSLATION: '자연스러운 영어', TENSE_CONFUSION: '시제', WORD_CHOICE: '알맞은 단어 고르기', OVER_LITERAL_REASON: '이유 설명', NO_CONTEXT: '맥락 살피기', GRAMMAR_FORM: '문법 형태' };
      judgment = {
        events: g.events_count, index: g.judgment_index,
        axis: { choice: g.axis_choice, reasoning: g.axis_reasoning, selfcorrection: g.axis_selfcorrection, register: g.axis_register, consistency: g.axis_consistency },
        top_gaps: (g.top_misconceptions || []).slice(0, 3).map((m: any) => MISC_KO[m.code] || m.code),
      };
    }
  } catch { /* 판단력 데이터 없으면 리포트에서 생략 */ }

  // 🌟 오각형(레이더) 5축 — 기획안 4-1장. 발음=voice_coaching, 나머지 4개는 student_evaluations 기존 컬럼 재사용.
  const pronRaw = (voiceStats?.n || 0) > 0 ? ((Number(voiceStats.pron) || 0) + (Number(voiceStats.flu) || 0)) / 2 : null;
  const radar: Record<string, number | null> = {
    pronunciation: toHundred(pronRaw),
    vocab: toHundred(avgField(evalRows, 'score_vocab')),
    sentence: toHundred(avgField(evalRows, 'score_grammar')),   // ⚠️ 전용 컬럼 없어 문법 점수로 근사(기획안 5-3, 일단 상대평가로 시작 확정)
    attitude: toHundred(avgField(evalRows, 'score_attitude')),
    participation: toHundred(avgField(evalRows, 'score_participation')),
  };
  const prevRadar = await getPreviousRadar(env, uid, period);
  const growthHighlight = computeGrowthHighlight(radar, prevRadar);

  const nm = (student && student.student_name) || uid;
  const ageBand = computeAgeBand(student && student.birth_date);
  const hasSignal = evalRows.length > 0 || (att?.d || 0) > 0 || !!judgment;

  let aiDraftCommentKo = '', aiDraftCommentEn = '', aiDraftTipKo = '', aiDraftTipEn = '';
  if (withAI) {
    if (!hasSignal) {
      // 근거 없으면 AI 호출 안 함(있는 실력 지어내기 방지 — lesson-insight.ts 와 같은 원칙)
      aiDraftCommentKo = `${nm} 학생은 이번 기간 수업 기록이 아직 적어요. 다음 기간엔 함께 더 채워가요!`;
      aiDraftCommentEn = `${nm} doesn't have many lesson records yet this period. Let's build up more together next time!`;
    } else {
      try {
        const recentComment = evalRows.length ? (evalRows[evalRows.length - 1].teacher_comment || '') : '';
        const strengths = evalRows.map((r: any) => r.strengths).filter(Boolean).slice(-3).join('; ');
        const improvements = evalRows.map((r: any) => r.improvements).filter(Boolean).slice(-3).join('; ');
        const nextGoals = evalRows.map((r: any) => r.next_goals).filter(Boolean).slice(-2).join('; ');
        const judgeLine = judgment
          ? `\n판단력(선택+이유): 판단력지수 ${judgment.index ?? '-'}/100, ${judgment.events}회 판단${judgment.top_gaps && judgment.top_gaps.length ? `, 더 연습할 점: ${judgment.top_gaps.join(', ')}` : ''}`
          : '';
        const radarLine = `\n오각형 점수: 발음·유창성 ${radar.pronunciation ?? '-'}, 어휘 ${radar.vocab ?? '-'}, 문장구성 ${radar.sentence ?? '-'}, 수업태도 ${radar.attitude ?? '-'}, 참여도 ${radar.participation ?? '-'}`;
        const usr = `학생: ${nm}\n기간: ${period}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}${judgeLine}${radarLine}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;

        // 🌟 2026-07-25 확정(사장님 지시) — 항상 동기부여·희망 톤, 조건부 표현만, 과장 확언 금지.
        //   "담임의 한마디"+"강사 코멘트" 이중 표시를 없애고 이 하나로 통합(기획안 4-3).
        const sysBase = (lang: 'ko' | 'en') => {
          const ageNote = ageBand ? (lang === 'ko' ? `학생 연령대: ${ageBand.ko}. 이 연령대에 맞는 말투로 쓰세요.` : `Student age band: ${ageBand.en}. Match your tone to this age.`) : '';
          return lang === 'ko'
            ? `당신은 영어학원 담임 강사입니다. 학부모(또는 학생 본인)에게 보내는 코멘트를 한국어 존댓말로 2문장 이내로 짧게 쓰세요. 반드시 성장 마인드셋 언어를 쓰세요 — 약점도 "부족하다"가 아니라 "지금 자라는 중이다"로 표현하세요. 문장 끝에는 앞날에 대한 희망을 담되, "이 속도로 계속하면"·"이렇게 노력이 쌓이면" 같은 조건부 표현만 쓰고 "다음엔 원어민처럼" 같은 근거 없는 과장 확언은 절대 쓰지 마세요. 숫자나 이름을 새로 만들지 말고 주어진 사실만 쓰세요. ${ageNote}\n마지막 줄에 "---"를 넣고, 다음 줄에 가정(또는 학생 스스로)에서 실천할 수 있는 팁을 1문장으로 쓰세요.`
            : `You are the homeroom teacher at a children's English academy. Write a short comment (max 2 sentences) in English for the parent (or the student). Always use growth-mindset language — describe weak areas as "still growing", never as "lacking". End with hope, but only using conditional phrasing ("at this pace", "as this effort builds up") — never an unfounded overclaim like "fluent like a native speaker soon". Do not invent numbers or names — use only the given facts. ${ageNote}\nThen add a line "---" followed by one sentence of a practical tip to try at home (or for the student themselves).`;
        };

        const [resKo, resEn]: any[] = await Promise.all([
          (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: sysBase('ko') }, { role: 'user', content: usr }], max_tokens: 220 }),
          (env as any).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages: [{ role: 'system', content: sysBase('en') }, { role: 'user', content: usr }], max_tokens: 220 }),
        ]);
        const ko = splitCommentTip(String((resKo && (resKo.response || resKo.result)) || ''));
        const en = splitCommentTip(String((resEn && (resEn.response || resEn.result)) || ''));
        aiDraftCommentKo = ko.comment; aiDraftTipKo = ko.tip;
        aiDraftCommentEn = en.comment; aiDraftTipEn = en.tip;
      } catch { /* AI 실패해도 리포트 자체는 정상 반환(빈 코멘트) */ }
    }
  }

  return {
    ok: true,
    student: student || { user_id: uid, student_name: uid },
    year_month: period,
    span_months: spanMonths,
    attendance: { days: att?.d || 0 },
    evaluations: { count: evalRows.length, avg_score: evalAvg, items: evalRows },
    voice: {
      sessions: voiceStats?.n || 0,
      avg_accuracy: Math.round(voiceStats?.acc || 0),
      avg_pronunciation: Math.round(voiceStats?.pron || 0),
      avg_fluency: Math.round(voiceStats?.flu || 0),
      best: voiceStats?.best || 0,
    },
    judgment,
    radar,
    growth_highlight: growthHighlight,
    ai_text: aiDraftCommentKo,  // 기존 monthly-report.html "담임의 한마디" 카드 하위호환(Phase 2 전까지)
    ai_draft_comment_ko: aiDraftCommentKo,
    ai_draft_comment_en: aiDraftCommentEn,
    ai_draft_tip_ko: aiDraftTipKo,
    ai_draft_tip_en: aiDraftTipEn,
    generated_at: Date.now(),
  };
}

// 신규 생성 시에만 토큰/승인상태 초기값을 쓰고, 이미 있는 행이면 승인·발송 이력은 절대 건드리지 않는다.
//   (예전엔 /generate 라우트가 INSERT OR REPLACE 로 승인된 행까지 매번 pending 으로 되돌릴 수 있었음 — 이번에 고침)
async function saveMonthlyReportRow(env: MangoEnv, uid: string, nm: string, period: string, data: any, token: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO monthly_reports
       (student_uid, student_name, period, ai_text, metrics_json, access_token, status, approval_status,
        ai_draft_comment_ko, ai_draft_comment_en, ai_draft_tip_ko, ai_draft_tip_en, created_at)
     VALUES (?,?,?,?,?,?, 'draft', 'pending', ?,?,?,?, ?)
     ON CONFLICT(student_uid, period) DO UPDATE SET
       student_name=excluded.student_name,
       ai_text=excluded.ai_text,
       metrics_json=excluded.metrics_json,
       ai_draft_comment_ko=excluded.ai_draft_comment_ko,
       ai_draft_comment_en=excluded.ai_draft_comment_en,
       ai_draft_tip_ko=excluded.ai_draft_tip_ko,
       ai_draft_tip_en=excluded.ai_draft_tip_en`
  ).bind(
    uid, nm, period, data.ai_text || '', JSON.stringify(data), token,
    data.ai_draft_comment_ko || '', data.ai_draft_comment_en || '', data.ai_draft_tip_ko || '', data.ai_draft_tip_en || '',
    Date.now()
  ).run();
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
  await saveMonthlyReportRow(env, uid, nm, period, data, token);
  try { row = await env.DB.prepare(`SELECT * FROM monthly_reports WHERE student_uid=? AND period=?`).bind(uid, period).first(); } catch {}
  return row;
}

// 학생+학부모에게 리포트 알림톡 발송 (키 없으면 'skipped'=모의).
// 🔒 2026-07-25 확정 — 강사가 승인(approval_status='approved')하지 않으면 발송을 막는다.
//   (기획안 7장 — AI 문구가 승인 없이 나가던 기존 문제를 여기서 고친다)
async function sendMonthlyReportKakao(env: MangoEnv, uid: string, period: string, origin: string): Promise<any> {
  const row = await ensureMonthlyReportRow(env, uid, period);
  if (!row) return { ok: false, error: 'bad_period' };
  if (row.approval_status !== 'approved') {
    return { ok: false, error: 'not_approved', message: '강사 승인 후에만 발송할 수 있습니다. POST /api/admin/monthly-report/approve 를 먼저 호출하세요.' };
  }
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

// 배치 — 활성 학생 전체에 생성+발송 (Cron 에서 매월 호출됨)
// 🔒 2026-07-25 확정 — 발송 주기는 "2개월 1회"(원장님 결정). 크론 호출 자체는 매월 그대로 두고,
//   짝수 달만 여기서 건너뛴다 → 홀수 달 발송분이 buildMonthlyReportData(spanMonths=2)로 직전 달까지
//   함께 모아 보내므로, 건너뛴 짝수 달의 데이터도 다음 홀수 달 리포트에 포함돼 유실되지 않는다.
export async function runMonthlyReports(env: MangoEnv, period: string, origin?: string): Promise<any> {
  const pm = period.match(/^\d{4}-(\d{2})$/);
  if (pm && parseInt(pm[1], 10) % 2 === 0) {
    return { period, total: 0, generated: 0, sent: 0, errors: 0, skipped: true, reason: 'bi_monthly_cadence_even_month' };
  }
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
      // [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
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
      await saveMonthlyReportRow(env, uid, nm, period, data, token);
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
          ? env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, approval_status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports WHERE period=? ORDER BY created_at DESC LIMIT 500`).bind(period)
          : env.DB.prepare(`SELECT id, student_uid, student_name, period, access_token, status, approval_status, sent_to_student, sent_to_parent, created_at, sent_at FROM monthly_reports ORDER BY created_at DESC LIMIT 200`);
        const rs = await stmt.all();
        rows = (rs.results || []) as any[];
      } catch {}
      return json({ ok: true, items: rows });
    }

    // POST /api/admin/monthly-report/approve  { uid, period, approved_by, comment_ko?, comment_en?, tip_ko?, tip_en? }
    //   강사가 AI 초안을 확인(필요하면 수정)하고 승인 — 이걸 해야만 /send 가 통과한다.
    if (method === 'POST' && path === '/api/admin/monthly-report/approve') {
      await ensureMonthlyReportsTable(env);
      const b: any = await parseJsonBody(request);
      const uid = String(b?.uid || '').trim();
      const period = String(b?.period || '').trim();
      if (!uid || !/^\d{4}-\d{2}$/.test(period)) return json({ ok: false, error: 'uid/period 필요' }, 400);
      const row = await ensureMonthlyReportRow(env, uid, period);
      if (!row) return json({ ok: false, error: 'bad_period' }, 400);
      const approvedBy = String(b?.approved_by || '').trim() || 'unknown';
      const commentKo = b?.comment_ko != null ? String(b.comment_ko) : row.ai_draft_comment_ko;
      const commentEn = b?.comment_en != null ? String(b.comment_en) : row.ai_draft_comment_en;
      const tipKo = b?.tip_ko != null ? String(b.tip_ko) : row.ai_draft_tip_ko;
      const tipEn = b?.tip_en != null ? String(b.tip_en) : row.ai_draft_tip_en;
      await env.DB.prepare(
        `UPDATE monthly_reports SET approval_status='approved', approved_by=?, approved_at=?,
           ai_draft_comment_ko=?, ai_draft_comment_en=?, ai_draft_tip_ko=?, ai_draft_tip_en=?, ai_text=?
         WHERE id=?`
      ).bind(approvedBy, Date.now(), commentKo, commentEn, tipKo, tipEn, commentKo, row.id).run();
      return json({ ok: true, uid, period, approval_status: 'approved', approved_by: approvedBy });
    }

    // POST /api/admin/monthly-report/send  { uid, period }  (학생+학부모 알림톡, 승인된 건만 통과)
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
      // 승인 시 강사가 코멘트/팁을 수정했을 수 있으므로, 생성 시점 스냅샷(metrics_json)보다
      // DB 컬럼(승인 절차에서 최신화됨)을 항상 우선한다 — 안 그러면 Phase 2 화면에 수정 전 문구가 나갈 수 있음.
      data.ai_text = row.ai_text || data.ai_text || '';
      data.ai_draft_comment_ko = row.ai_draft_comment_ko || data.ai_draft_comment_ko || '';
      data.ai_draft_comment_en = row.ai_draft_comment_en || data.ai_draft_comment_en || '';
      data.ai_draft_tip_ko = row.ai_draft_tip_ko || data.ai_draft_tip_ko || '';
      data.ai_draft_tip_en = row.ai_draft_tip_en || data.ai_draft_tip_en || '';
      data.approval_status = row.approval_status || 'pending';
      data.ok = true;
      return json(data);
    }
    // ═══════════════════════════════════════════════════════════════
    // 📊 Phase MAR 끝
    // ═══════════════════════════════════════════════════════════════

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}
