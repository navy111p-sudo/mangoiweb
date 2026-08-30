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

/* ═══════════════════════════════════════════════════════════════════════
   🤖 AI 활동으로 4축 채우기 (2026-08-07)

   왜 필요한가 — 오각형 5축 중 발음만 AI(voice_coaching)에서 나오고,
   나머지 어휘·문장구성·태도·참여도 4축은 전부 student_evaluations,
   즉 «강사가 손으로 쓴 평가서»에서만 나온다. 그래서 강사 없이 AI만 쓰는 학원은
   student_evaluations 가 0행이라 성적표가 통째로 빈 종이로 나간다.
   경쟁사(클라우봇)가 Lexile·WPM 같은 숫자를 내놓는 자리에 우리는 낼 것이 없었다.

   원칙 3개 — 이걸 어기면 성적표가 거짓말이 된다.
     ① 강사 점수가 우선. AI 는 «그 축이 비어 있을 때만» 채운다. 축 단위로 판단하므로
        일부만 평가된 학생도 나머지가 AI 로 메워진다(기존 리포트 값은 하나도 안 바뀐다).
     ② 근거가 모자라면 채우지 않는다. 축마다 최소 표본을 두고, 미만이면 null 로 남긴다.
        빈 칸은 부끄러운 게 아니지만 지어낸 점수는 사고다(lesson-insight 와 같은 원칙).
     ③ 무엇으로 쟀는지 반드시 같이 낸다(radar_source·radar_basis). 학부모가 AI 활동 점수를
        «선생님이 매긴 점수»로 오해하면 안 된다. 근거 문구는 한/영 두 벌(강사 다수가 필리핀).
   ═══════════════════════════════════════════════════════════════════════ */

// 0~100 으로 자르기 — 비율/개수 기반 축이 공통으로 쓴다
function clamp100(n: number): number { return Math.round(Math.min(100, Math.max(0, n))); }

type AiAxis = { score: number | null; basis_ko: string; basis_en: string };
const NO_AXIS: AiAxis = { score: null, basis_ko: '', basis_en: '' };

async function computeAiRadar(env: MangoEnv, uid: string, start: number, end: number): Promise<{
  vocab: AiAxis; sentence: AiAxis; attitude: AiAxis; participation: AiAxis;
}> {
  const out = { vocab: NO_AXIS, sentence: NO_AXIS, attitude: NO_AXIS, participation: NO_AXIS };

  /* ── 어휘 수준 ← 단어장 복습 정답률 + 복습퀴즈 득점률 ──
     ⚠️ 표본이 적으면 «운» 이 점수가 된다. 10문항 미만이면 채우지 않는다. */
  try {
    const v: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n, SUM(CASE WHEN correct=1 THEN 1 ELSE 0 END) AS ok
         FROM vocab_review_log WHERE user_id = ? AND reviewed_at >= ? AND reviewed_at < ?`
    ).bind(uid, start, end).first();
    const q: any = await env.DB.prepare(
      `SELECT COUNT(*) AS sessions, SUM(score) AS s, SUM(total) AS t
         FROM review_quiz_results WHERE user_id = ? AND created_at >= ? AND created_at < ?`
    ).bind(uid, start, end).first();
    const items = (Number(v?.n) || 0) + (Number(q?.t) || 0);
    const right = (Number(v?.ok) || 0) + (Number(q?.s) || 0);
    if (items >= 10) {
      out.vocab = {
        score: clamp100((right / items) * 100),
        basis_ko: `단어·퀴즈 ${items}문항 중 ${right}개 정답`,
        basis_en: `${right} correct out of ${items} vocabulary and quiz items`,
      };
    }
  } catch { /* 테이블이 없어도 리포트 전체는 계속 간다 */ }

  /* ── 문장 구성력 ← AI 영작첨삭 점수(주) + AI 대화에서 학생이 쓴 문장 길이(보조) ──
     첨삭 점수가 곧 «문장을 얼마나 바르게 쓰는가» 라 이걸 우선 쓰고,
     첨삭이 없으면 대화 발화 길이로 근사한다(한 문장 12단어면 만점 — 초·중등 기준). */
  try {
    const w: any = await env.DB.prepare(
      `SELECT COUNT(*) AS n, AVG(score) AS avg FROM ai_writing_corrections
        WHERE student_uid = ? AND score IS NOT NULL AND created_at >= ? AND created_at < ?`
    ).bind(uid, start, end).first();
    if ((Number(w?.n) || 0) >= 3) {
      out.sentence = {
        score: toHundred(Number(w.avg)),
        basis_ko: `AI 영작 첨삭 ${w.n}편 평균`,
        basis_en: `Average of ${w.n} AI-corrected writings`,
      };
    } else {
      const c: any = await env.DB.prepare(
        `SELECT COUNT(*) AS n, AVG(LENGTH(content) - LENGTH(REPLACE(content,' ','')) + 1) AS words
           FROM ai_friend_chats WHERE student_uid = ? AND role='user' AND created_at >= ? AND created_at < ?`
      ).bind(uid, start, end).first();
      const msgs = Number(c?.n) || 0;
      if (msgs >= 10) {
        const words = Number(c?.words) || 0;
        out.sentence = {
          score: clamp100((words / 12) * 100),
          basis_ko: `AI 대화 ${msgs}번, 한 번에 평균 ${words.toFixed(1)}단어`,
          basis_en: `${msgs} AI conversations, ${words.toFixed(1)} words per turn on average`,
        };
      }
    }
  } catch {}

  /* ── 수업 태도 ← 연속 학습일(스트릭) ──
     ⚠️ 이건 «강사가 본 태도» 와 같은 것이 아니다. 꾸준히 켰는가를 잰 것이다.
        그래서 basis 에 무엇을 쟀는지 반드시 적는다. 2주(14일) 연속을 만점으로 본다.
     ⚠️ student_streaks 는 기간 필터가 없는 현재 상태값이라, 스트릭이 0이면 채우지 않는다. */
  try {
    const s: any = await env.DB.prepare(
      `SELECT current_streak, longest_streak FROM student_streaks WHERE student_uid = ?`
    ).bind(uid).first();
    const best = Math.max(Number(s?.current_streak) || 0, Number(s?.longest_streak) || 0);
    if (best >= 3) {
      out.attitude = {
        score: clamp100((best / 14) * 100),
        basis_ko: `연속 학습 최고 ${best}일 (꾸준함으로 측정)`,
        basis_en: `Best streak ${best} days (measured by consistency)`,
      };
    }
  } catch {}

  /* ── 학습 참여도 ← 실제로 공부한 «날 수» ──
     횟수가 아니라 날 수로 센다. 하루에 몰아서 20번 한 것과 스무 날에 걸쳐 한 것은 다르다.
     기간 중 주 3회(≈ 12일/월) 를 만점으로 본다. */
  try {
    const days = Math.max(1, Math.round((end - start) / 86400000));
    const target = Math.max(4, Math.round((days / 7) * 3));   // 주 3회 기준, 최소 4일
    const d: any = await env.DB.prepare(
      `SELECT COUNT(DISTINCT day) AS n FROM (
         SELECT CAST(created_at/86400000 AS INTEGER) AS day FROM ai_friend_chats
           WHERE student_uid = ? AND role='user' AND created_at >= ? AND created_at < ?
         UNION
         SELECT CAST(reviewed_at/86400000 AS INTEGER) AS day FROM vocab_review_log
           WHERE user_id = ? AND reviewed_at >= ? AND reviewed_at < ?
         UNION
         SELECT CAST(created_at/86400000 AS INTEGER) AS day FROM review_quiz_results
           WHERE user_id = ? AND created_at >= ? AND created_at < ?
       )`
    ).bind(uid, start, end, uid, start, end, uid, start, end).first();
    const n = Number(d?.n) || 0;
    if (n >= 2) {
      out.participation = {
        score: clamp100((n / target) * 100),
        basis_ko: `${days}일 중 ${n}일 학습`,
        basis_en: `Studied on ${n} of ${days} days`,
      };
    }
  } catch {}

  return out;
}

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
      ['teacher_name', 'TEXT'],  // 검수 화면에서 "내 담당분만" 필터링용 — 마지막 평가서 작성 강사 이름(기획안 Phase 3)
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
  try { att = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS d FROM attendance WHERE user_id = ? AND joined_at >= ? AND joined_at < ? AND COALESCE(status,'') <> 'scheduled'`).bind(uid, start, end).first(); } catch {}
  try {
    const evals = await env.DB.prepare(`SELECT id, lesson_date, score_overall, score_vocab, score_grammar, score_attitude, score_participation, strengths, improvements, next_goals, teacher_comment, teacher_name, created_at FROM student_evaluations WHERE student_uid = ? AND created_at >= ? AND created_at < ? ORDER BY created_at ASC`).bind(uid, start, end).all();
    evalRows = (evals.results || []) as any[];
  } catch {}
  try { voiceStats = await env.DB.prepare(`SELECT COUNT(*) AS n, AVG(accuracy_score) AS acc, AVG(pronunciation_score) AS pron, AVG(fluency_score) AS flu, MAX(accuracy_score) AS best FROM voice_coaching WHERE student_uid = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first(); } catch {}
  const evalAvg = evalRows.length ? Math.round((evalRows.reduce((s, r) => s + (r.score_overall || 0), 0) / evalRows.length) * 10) / 10 : 0;

  // 📋 AI 학습 활동 — 단어장(vocab_review_log) + 복습퀴즈(review_quiz_results) 실사용 횟수만 합산.
  //   ⚠️ 2026-07-25 확인: `microlearn_logs`는 이름과 달리 학습기록이 아니라 알림 발송 로그라 제외했고,
  //   "예습·복습"(homework_submissions)은 테이블 자체가 없어 지어내지 않고 아예 안 넣는다(기획안 안전원칙).
  let aiActivityCount = 0;
  try {
    const vc: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM vocab_review_log WHERE user_id = ? AND reviewed_at >= ? AND reviewed_at < ?`).bind(uid, start, end).first();
    const qc: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM review_quiz_results WHERE user_id = ? AND created_at >= ? AND created_at < ?`).bind(uid, start, end).first();
    aiActivityCount = (vc?.n || 0) + (qc?.n || 0);
  } catch { /* 테이블이 없거나 조회 실패해도 리포트 전체는 계속 진행 */ }

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
  /* 🤖 강사 평가서가 없어서 빈 축을 AI 학습 활동으로 채운다 (2026-08-07).
     ⚠️ 축 단위다 — 강사가 매긴 축은 절대 덮지 않는다. 그래서 기존 리포트는 값이 하나도 안 바뀐다.
     ⚠️ 출처를 같이 낸다. 화면이 «선생님 평가»와 «AI 활동 기록»을 구분해 보여줄 수 있어야 한다. */
  const radarSource: Record<string, 'teacher' | 'ai' | null> = {
    pronunciation: radar.pronunciation == null ? null : 'ai',   // 발음은 원래부터 voice_coaching(=AI)
    vocab: radar.vocab == null ? null : 'teacher',
    sentence: radar.sentence == null ? null : 'teacher',
    attitude: radar.attitude == null ? null : 'teacher',
    participation: radar.participation == null ? null : 'teacher',
  };
  const radarBasis: Record<string, { ko: string; en: string }> = {};
  /* 발음 축은 예전부터 강사가 아니라 AI 음성코치가 매긴 점수였다. 그동안 출처를 안 밝혀서
     강사 평가처럼 읽혔을 뿐이다. 이제 표시하는 김에 근거도 같이 적는다 —
     표시만 붙고 근거가 없으면 «이건 뭐지» 가 된다. */
  if (radar.pronunciation != null && (voiceStats?.n || 0) > 0) {
    radarBasis.pronunciation = {
      ko: `AI 음성코치 ${voiceStats.n}회 측정 평균`,
      en: `Average over ${voiceStats.n} AI speech-coach sessions`,
    };
  }
  if (radar.vocab == null || radar.sentence == null || radar.attitude == null || radar.participation == null) {
    const ai = await computeAiRadar(env, uid, start, end);
    for (const k of ['vocab', 'sentence', 'attitude', 'participation'] as const) {
      if (radar[k] != null) continue;              // 강사 점수가 있으면 그대로 둔다
      if (ai[k].score == null) continue;           // 근거가 모자라면 비워 둔다 (지어내지 않음)
      radar[k] = ai[k].score;
      radarSource[k] = 'ai';
      radarBasis[k] = { ko: ai[k].basis_ko, en: ai[k].basis_en };
    }
  }
  const aiAxisCount = Object.values(radarSource).filter((v) => v === 'ai').length;

  const prevRadar = await getPreviousRadar(env, uid, period);
  const growthHighlight = computeGrowthHighlight(radar, prevRadar);

  const nm = (student && student.student_name) || uid;
  // 검수(승인) 화면에서 "내 담당분만" 걸러 보려면 담당 강사가 필요한데, 이 리포트는 여러 강사의
  // 평가서를 묶은 것일 수 있어 하나로 못 정한다 — 기간 중 가장 최근 평가서를 쓴 강사로 근사한다.
  const teacherName = evalRows.length ? (evalRows[evalRows.length - 1].teacher_name || '') : '';
  const ageBand = computeAgeBand(student && student.birth_date);
  /* 🤖 (2026-08-07) AI 학습 기록만 있는 학생도 «근거 있음» 이다.
     여길 안 고치면 AI 만 쓰는 학원의 성적표가 오각형은 채워졌는데 코멘트는
     «수업 기록이 아직 적어요» 로 나가는 앞뒤 안 맞는 종이가 된다. */
  const hasSignal = evalRows.length > 0 || (att?.d || 0) > 0 || !!judgment || aiAxisCount > 0;

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
        /* 🤖 AI 학습 기록으로 채운 축은 «무엇을 근거로 나온 숫자인지» 를 모델에도 알려 준다.
           안 알려 주면 모델이 «선생님께서 칭찬하신» 처럼 없던 일을 지어낸다. */
        const aiBasisLine = Object.keys(radarBasis).length
          ? `\n※ 아래 항목은 강사 평가가 아니라 학생의 AI 학습 기록에서 자동 계산된 값이다. 강사가 말했다고 쓰지 말 것: `
            + Object.keys(radarBasis).map((k) => `${RADAR_AXIS_KO[k]}(${radarBasis[k].ko})`).join(', ')
          : '';
        const usr = `학생: ${nm}\n기간: ${period}\n출석일수: ${att?.d || 0}\n평가 횟수: ${evalRows.length}, 종합 평균(5점 만점): ${evalAvg}\n발음 평균: 정확도 ${Math.round(voiceStats?.acc || 0)}, 발음 ${Math.round(voiceStats?.pron || 0)}, 유창성 ${Math.round(voiceStats?.flu || 0)}${judgeLine}${radarLine}${aiBasisLine}\n강점: ${strengths || '기록 적음'}\n개선점: ${improvements || '기록 적음'}\n다음 목표(강사 기록): ${nextGoals || '없음'}\n최근 강사 코멘트: ${recentComment || '없음'}`;

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
    /* 축마다 «누가 매긴 점수인가» — 'teacher'(강사 평가서) / 'ai'(AI 학습 활동) / null(근거 없음).
       화면은 이걸로 구분해 표시해야 한다. AI 활동 점수를 강사 평가처럼 보여주면 거짓말이 된다. */
    radar_source: radarSource,
    radar_basis: radarBasis,          // AI 로 채운 축만 { ko, en } 근거 문구가 들어 있다
    radar_ai_axis_count: aiAxisCount, // AI 로 채운 축 수 (0 이면 종전과 완전히 동일한 리포트)
    growth_highlight: growthHighlight,
    ai_activity_count: aiActivityCount,
    teacher_name: teacherName,
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
        ai_draft_comment_ko, ai_draft_comment_en, ai_draft_tip_ko, ai_draft_tip_en, teacher_name, created_at)
     VALUES (?,?,?,?,?,?, 'draft', 'pending', ?,?,?,?,?, ?)
     ON CONFLICT(student_uid, period) DO UPDATE SET
       student_name=excluded.student_name,
       ai_text=excluded.ai_text,
       metrics_json=excluded.metrics_json,
       ai_draft_comment_ko=excluded.ai_draft_comment_ko,
       ai_draft_comment_en=excluded.ai_draft_comment_en,
       ai_draft_tip_ko=excluded.ai_draft_tip_ko,
       ai_draft_tip_en=excluded.ai_draft_tip_en,
       teacher_name=excluded.teacher_name`
  ).bind(
    uid, nm, period, data.ai_text || '', JSON.stringify(data), token,
    data.ai_draft_comment_ko || '', data.ai_draft_comment_en || '', data.ai_draft_tip_ko || '', data.ai_draft_tip_en || '',
    data.teacher_name || '',
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
      const period = `${monthlyMatch[2]}-${monthlyMatch[3]}`;

      // 🔐 [PII] 본인(학생/학부모 토큰) 또는 관리자만 — 월간 리포트(결제 총액·평가 포함) IDOR 차단.
      //   공유 링크로 보려면 별도 /api/report/monthly-view?t= (토큰 검증) 경로 사용.
      // [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 리포트만 조회할 수 있습니다.' }, 401);
      }

      try {
        // 🔧 2026-07-25 — 이 라우트가 buildMonthlyReportData() 와 별개로 같은 걸 다시 짜고 있어서
        //   오각형·판단력·AI초안·AI활동 등 신규 필드가 여기(관리자/학생 무토큰 미리보기)엔 하나도
        //   안 나오고 있었다(기획안 Phase 2 갭). 공용 함수로 합쳐 두 경로가 항상 같은 걸 보여주게 한다.
        const data = await buildMonthlyReportData(env, uid, period, url.searchParams.get('ai') === '1', 2);
        if (!data) return json({ ok: false, error: 'bad_period' }, 400);

        // 결제 총액 — buildMonthlyReportData 는 계산하지 않는 필드(report.html 전용 소비처)라 여기서만 덧붙인다.
        let payTotal = 0;
        try {
          const m = period.match(/^(\d{4})-(\d{2})$/)!;
          const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1;
          const start = new Date(y, mo, 1).getTime(), end = new Date(y, mo + 1, 1).getTime();
          const pays: any = await env.DB.prepare(`SELECT IFNULL(SUM(amount_krw),0) AS total FROM student_payments WHERE user_id = ? AND paid_at >= ? AND paid_at < ?`).bind(uid, start, end).first();
          payTotal = pays?.total || 0;
        } catch { /* student_payments 없거나 실패해도 리포트 자체는 정상 반환 */ }

        return json({ ...data, payments: { total_krw: payTotal } });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }

    // GET /api/report/monthly/latest?uid=  (본인/관리자 전용 — 최신 리포트의 period+token만 조회)
    //   학생·학부모 화면에 "내 성적표 보기" 바로가기를 달 때, period/token을 미리 몰라도
    //   이 엔드포인트로 알아낸 뒤 /monthly-report.html?uid=&period=&t= 로 이동하면 된다(기획안 Phase 4).
    if (method === 'GET' && path === '/api/report/monthly/latest') {
      const uid = url.searchParams.get('uid') || '';
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, uid))) {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      await ensureMonthlyReportsTable(env);
      let row: any = null;
      try { row = await env.DB.prepare(`SELECT period, access_token FROM monthly_reports WHERE student_uid=? ORDER BY period DESC LIMIT 1`).bind(uid).first(); } catch {}
      if (!row) return json({ ok: false, error: 'no_report' });
      return json({ ok: true, period: row.period, token: row.access_token });
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

    // GET /api/admin/monthly-report/list?period=YYYY-MM&teacher_name=&approval_status=
    //   teacher_name/approval_status는 강사 마이페이지 "성적표 승인" 탭이 검수 대기만 걸러볼 때 씀(기획안 Phase 3).
    if (method === 'GET' && path === '/api/admin/monthly-report/list') {
      await ensureMonthlyReportsTable(env);
      const period = url.searchParams.get('period') || '';
      const teacherName = url.searchParams.get('teacher_name') || '';
      const approvalStatus = url.searchParams.get('approval_status') || '';
      const cols = `id, student_uid, student_name, period, access_token, status, approval_status, teacher_name,
        ai_draft_comment_ko, ai_draft_comment_en, ai_draft_tip_ko, ai_draft_tip_en,
        sent_to_student, sent_to_parent, created_at, sent_at`;
      const where: string[] = [];
      const binds: any[] = [];
      if (period) { where.push('period=?'); binds.push(period); }
      if (teacherName) { where.push('teacher_name=?'); binds.push(teacherName); }
      if (approvalStatus) { where.push('approval_status=?'); binds.push(approvalStatus); }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
      const limit = where.length ? 500 : 200;
      let rows: any[] = [];
      try {
        const rs = await env.DB.prepare(`SELECT ${cols} FROM monthly_reports ${whereSql} ORDER BY created_at DESC LIMIT ${limit}`).bind(...binds).all();
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
