// ═══════════════════════════════════════════════════════════════════════
// 🤝 teacher-handover.ts — 강사 인수인계 카드 (2026-10-10, 경쟁사 분석 적용 ②)
//
//   무엇을 하나
//     강사 포털 «오늘 수업» 줄마다 이 학생의 세 줄을 붙인다(학생 기준이라 강사가 바뀌어도 그대로).
//       🎯 지난 목표      — 직전 수업 기록의 «다음 목표»
//       🔁 아직 연습 안 한 문장 — ① 「틀린 문장 다시 말하기」 카드 중 학생이 아직 안 말해 본 문장
//          ⚠️ «고쳤는가» 가 아니라 «연습했는가» 다 — 다음 수업에서 맞게 쓰는지는 재지 않는다.
//       📝 복습 카드       — 그 카드를 몇 장 말해 봤는가
//     대체강사·강사 교체 때 «처음부터 다시» 를 없애는 것이 목적이다.
//
//   재료 — 새 표를 만들지 않는다. 이미 쌓이는 곳만 «읽는다»(SELECT)
//     · 목표: ai_lesson_reports.next_goals(JSON 배열) · student_evaluations.next_goals ·
//             옛 스키마 student_evaluations.next_goal · 강사 1분 일지 note_en 의 «Next Lesson:» 줄
//       [잰 것 — 2026-10-10 운영 D1] next_goals 0건 · AI 리포트 2건 · 옛 next_goal 102건(전부 6월 시연용)
//       · 일지 note_en 26건 중 «Next Lesson:» 줄 6건. ⟹ 지금은 대부분 «목표 없음» 이 정상이다.
//     · 못 고친 것·복습: fix-cards.ts 의 순수 함수(pickFixCards·attachPractice)를 그대로 재사용한다.
//       ⛔ 판정을 복제하지 않는다 — 학생 화면(①)과 강사 화면이 같은 카드를 말해야 한다.
//
//   규칙
//     ⛔ 지어내지 않는다 — 재료가 없으면 그 줄을 빼고, 세 줄이 다 없으면 handover 자체를 안 싣는다.
//     ⛔ 오늘 기록은 «지난» 목표가 아니다 — dayStartMs 이전만 본다.
//     ⛔ uid 는 정확일치(Kim/kim 은 다른 계정).
//     ⚠️ 학생 여러 명을 한 번에(IN 청크) 읽는다 — 학생마다 쿼리 3개씩이면 강사 화면이 느려진다.
//     ⚠️ 조회가 실패하면 그 재료만 «모름» 으로 둔다(던지지 않는다). 수업 목록을 막지 않는다.
// ═══════════════════════════════════════════════════════════════════════
import { pickFixCards, attachPractice, FIX_CARD_DAYS, type FixCard } from './fix-cards';
import { selectInChunks } from './d1-chunk';

export const HANDOVER_GOAL_DAYS = 60;
export const HANDOVER_GOAL_MAXLEN = 160;
export const HANDOVER_UNFIXED_SHOW = 2;
const DAY_MS = 86400000;
/* 학생별 행 한도 — ① 학생 화면(loadFixCards)의 LIMIT 과 같은 값(리포트 5·웜업 30·연습 300).
   ⚠️ «묶음 전체» 에 LIMIT 을 걸면 활동이 많은 한 학생이 한도를 채워 다른 학생 행이 잘린다
      (d1-chunk.ts 머리말 «ORDER BY + 전역 LIMIT 은 청크를 가로지르면 달라진다»).
      그래서 ROW_NUMBER() 로 학생마다 자른다. 리포트는 «목표» 60일 창까지 보므로 넉넉히 둔다. */
const PER_STUDENT_REPORTS = 5;      // ① 과 같은 값(카드 재료)
/* 목표는 «목표가 적힌 행만» 고른 뒤 학생마다 자른다 — 목표 없는 최근 기록이 한도를 채워
   60일 창 안의 진짜 목표를 밀어내지 않게(PR #1507 리뷰). 아래 SQL 조건은 pickGoal 이 받는 것의
   «넓은» 거르개일 뿐이고 최종 판정은 pickGoal 이 한다. */
const PER_STUDENT_GOAL_ROWS = 5;
const GOAL_REPORT_COND = `next_goals IS NOT NULL AND TRIM(next_goals) NOT IN ('', '[]')`;
const GOAL_EVAL_COND = `(TRIM(COALESCE(next_goals, '')) NOT IN ('', '[]') OR TRIM(COALESCE(next_goal, '')) <> '' OR instr(lower(COALESCE(note_en, '')), 'next') > 0)`;
/** 옛 next_goal 칸이 없는 DB 용 */
const GOAL_EVAL_COND_NO_NG = `(TRIM(COALESCE(next_goals, '')) NOT IN ('', '[]') OR instr(lower(COALESCE(note_en, '')), 'next') > 0)`;
const PER_STUDENT_WARMUP = 30;
const PER_STUDENT_COACH = 300;
function perStudent(inner: string, n: number): string {
  return `SELECT * FROM (${inner}) WHERE rn <= ${Math.max(1, Math.floor(n))} ORDER BY created_at DESC`;
}

export type HandoverGoal = { text: string; date: string | null; from: 'lesson_report' | 'teacher_note' | 'evaluation'; lang: 'ko' | 'en' };
export type Handover = {
  goal: HandoverGoal | null;
  /** null = 카드 재료를 못 물어봤다(0건과 다름) */
  fix: null | {
    total: number;
    practiced: number;                       // 한 번이라도 말해 본 카드 수
    unfixed: { from: string; to: string }[]; // 아직 안 말해 본 카드(최대 HANDOVER_UNFIXED_SHOW)
    unfixed_n: number;
  };
};

function _t(v: unknown, n: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}

/** next_goals 칸 → 첫 목표 한 줄. JSON 배열이면 첫 원소, 아니면 문자열 그대로. */
export function firstGoal(raw: unknown): string {
  if (raw == null) return '';
  if (Array.isArray(raw)) return _t(raw.find((x) => _t(x, 1)), HANDOVER_GOAL_MAXLEN);
  const s = String(raw).trim();
  if (!s || s === '[]') return '';
  if (s[0] === '[') {
    try { const v = JSON.parse(s); if (Array.isArray(v)) return firstGoal(v); } catch { /* 그냥 문자열로 */ }
  }
  return _t(s, HANDOVER_GOAL_MAXLEN);
}

/** 강사 1분 일지에서 «Next Lesson: …» 줄 값을 꺼낸다 — 없으면 ''. 지어내지 않는다. */
export function nextLessonLine(note: unknown): string {
  const m = String(note == null ? '' : note).match(/^[ \t]*next\s+(?:lesson|class)\s*[:：][ \t]*(.+)$/im);
  return m ? _t(m[1], HANDOVER_GOAL_MAXLEN) : '';
}

function _date(row: any): string | null {
  if (row && row.lesson_date) return String(row.lesson_date).slice(0, 10);
  const c = Number(row && row.created_at);
  return c ? new Date(c + 9 * 3600000).toISOString().slice(0, 10) : null;
}

/**
 * 가장 최근 목표 하나를 고른다(순수 함수).
 *   reportRows: ai_lesson_reports [{ next_goals, lesson_date, created_at }]
 *   evalRows:   student_evaluations [{ next_goals, next_goal, note_en, lesson_date, created_at }]
 *   ⚠️ «가장 최근 기록» 이 이긴다 — 출처 순서가 아니다(옛 리포트가 어제 강사 일지를 덮으면 안 된다).
 */
export function pickGoal(reportRows: any[], evalRows: any[]): HandoverGoal | null {
  const cand: { at: number; g: HandoverGoal }[] = [];
  for (const r of (reportRows || [])) {
    const text = firstGoal(r && r.next_goals);
    if (text) cand.push({ at: Number(r.created_at) || 0, g: { text, date: _date(r), from: 'lesson_report', lang: 'en' } });
  }
  for (const r of (evalRows || [])) {
    if (!r) continue;
    const ev = firstGoal(r.next_goals) || firstGoal(r.next_goal);
    const text = ev || nextLessonLine(r.note_en);
    if (text) cand.push({ at: Number(r.created_at) || 0, g: { text, date: _date(r), from: ev ? 'evaluation' : 'teacher_note', lang: 'en' } });
  }
  if (!cand.length) return null;
  cand.sort((a, b) => b.at - a.at);
  const g = cand[0].g;
  // 🌐 AI 리포트 목표는 한국어로 만들어진다(api-lessons.ts 프롬프트) — 화면이 «한국어 메모» 라고 알릴 수 있게.
  //    번역하지 않는다(사람·AI 가 쓴 글을 기계번역하지 않는다).
  return { ...g, lang: /[\uac00-\ud7a3]/.test(g.text) ? 'ko' : 'en' };
}

/** 카드 → 인수인계의 fix 칸(순수 함수). cards 가 null 이면 «모름». */
export function summarizeFix(cards: FixCard[] | null): Handover['fix'] {
  if (!cards) return null;
  const un = cards.filter((c) => !(c.practiced > 0));
  return {
    total: cards.length,
    practiced: cards.length - un.length,
    unfixed: un.slice(0, HANDOVER_UNFIXED_SHOW).map((c) => ({ from: c.from, to: c.to })),
    unfixed_n: un.length,
  };
}

/** 싣을 가치가 있는가 — 목표도 카드도 없으면 싣지 않는다(빈 줄 세 개는 소음이다). */
export function handoverWorthShowing(h: Handover): boolean {
  return !!(h.goal || (h.fix && h.fix.total > 0));
}

function _group(rows: any[], key: string): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const r of rows || []) {
    const k = String((r && r[key]) || '');
    if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  for (const arr of m.values()) arr.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
  return m;
}

/**
 * 서버 정본 — 강사 포털이 «자기 오늘 수업의 학생들» 로만 부른다(그 목록이 곧 권한 범위).
 * 던지지 않는다. 결과 Map 에는 보여 줄 가치가 있는 학생만 담긴다.
 */
export async function loadHandovers(db: any, uids: string[], nowMs: number, dayStartMs: number): Promise<Map<string, Handover>> {
  const out = new Map<string, Handover>();
  const list = [...new Set((uids || []).map((u) => String(u || '').trim()).filter(Boolean))];
  if (!list.length || !db) return out;
  const goalSince = dayStartMs - HANDOVER_GOAL_DAYS * DAY_MS;
  const fixSince = nowMs - FIX_CARD_DAYS * DAY_MS;

  // ── 목표 재료(60일·오늘 이전·«목표가 적힌 행만») ──
  let goalRepRows: any[] = [], evalRows: any[] = [];
  try {
    goalRepRows = await selectInChunks<any>(db, list,
      (ph) => perStudent(`SELECT student_uid, next_goals, lesson_date, created_at,
                      ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) AS rn
                 FROM ai_lesson_reports WHERE student_uid IN (${ph}) AND created_at >= ? AND created_at < ?
                  AND ${GOAL_REPORT_COND}`, PER_STUDENT_GOAL_ROWS),
      { tail: [goalSince, dayStartMs] });
  } catch { goalRepRows = []; }
  // 옛 행은 student_uid 가 비고 user_id 만 있다 → COALESCE 로 한 키로 본다(포털 prev_lesson 과 같은 규칙).
  const evalSql = (withNextGoal: boolean) => (ph: string) => perStudent(`SELECT COALESCE(NULLIF(student_uid, ''), user_id) AS suid,
                      next_goals, ${withNextGoal ? 'next_goal, ' : ''}substr(COALESCE(note_en, ''), 1, 1500) AS note_en,
                      lesson_date, created_at,
                      ROW_NUMBER() OVER (PARTITION BY COALESCE(NULLIF(student_uid, ''), user_id) ORDER BY created_at DESC) AS rn
                 FROM student_evaluations
                WHERE COALESCE(NULLIF(student_uid, ''), user_id) IN (${ph})
                  AND created_at >= ? AND created_at < ?
                  AND ${withNextGoal ? GOAL_EVAL_COND : GOAL_EVAL_COND_NO_NG}`, PER_STUDENT_GOAL_ROWS);
  try {
    evalRows = await selectInChunks<any>(db, list, evalSql(true), { tail: [goalSince, dayStartMs] });
  } catch {
    // 옛 next_goal 칸이 없는 DB 도 있다 — 그 칸 없이 한 번 더.
    try { evalRows = await selectInChunks<any>(db, list, evalSql(false), { tail: [goalSince, dayStartMs] }); }
    catch { evalRows = []; }
  }

  // ── ① 카드 재료(수업 리포트 — 30일·오늘 포함, ① 과 같은 학생별 5건) ──
  let reportOk = false, warmOk = false;
  let fixReportRows: any[] = [];
  try {
    fixReportRows = await selectInChunks<any>(db, list,
      (ph) => perStudent(`SELECT student_uid, grammar_errors, lesson_title, created_at,
                      ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) AS rn
                 FROM ai_lesson_reports WHERE student_uid IN (${ph}) AND created_at >= ?`, PER_STUDENT_REPORTS),
      { tail: [fixSince] });
    reportOk = true;
  } catch { fixReportRows = []; }

  // ── ① 카드 재료(웜업 교정) ──
  let warmRows: any[] = [];
  try {
    warmRows = await selectInChunks<any>(db, list,
      (ph) => perStudent(`SELECT user_id, was, fixed, why_ko, lang, created_at,
                      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
                 FROM warmup_fix_log WHERE user_id IN (${ph}) AND created_at >= ?`, PER_STUDENT_WARMUP),
      { tail: [fixSince] });
    warmOk = true;
  } catch { warmRows = []; }

  // ⛔ 오늘 리포트는 «지난» 목표가 아니다 — 목표 후보에서는 오늘 이전만.
  const repBy = _group(goalRepRows, 'student_uid');
  const fixRepBy = _group(fixReportRows, 'student_uid');
  const evBy = _group(evalRows, 'suid');
  const warmBy = _group(warmRows, 'user_id');

  // 카드를 먼저 골라 두고, 연습 기록은 카드가 있는 학생만 한 번에 읽는다.
  const cardsBy = new Map<string, FixCard[]>();
  const withCards: string[] = [];
  let oldest = nowMs;
  for (const u of list) {
    // ① 과 같은 입력 크기(리포트 5건·웜업 30건)로 자른다 — 같은 카드를 말하게.
    const cards = pickFixCards((fixRepBy.get(u) || []).slice(0, 5), (warmBy.get(u) || []).slice(0, 30));
    cardsBy.set(u, cards);
    if (cards.length) { withCards.push(u); for (const c of cards) if (c.at && c.at < oldest) oldest = c.at; }
  }
  let practiceOk = true;
  if (withCards.length) {
    try {
      const coach = await selectInChunks<any>(db, withCards,
        (ph) => perStudent(`SELECT student_uid, target_text, accuracy_score, created_at,
                        ROW_NUMBER() OVER (PARTITION BY student_uid ORDER BY created_at DESC) AS rn
                   FROM voice_coaching WHERE student_uid IN (${ph}) AND created_at >= ?`, PER_STUDENT_COACH),
        { tail: [oldest] });
      const coachBy = _group(coach, 'student_uid');
      for (const u of withCards) cardsBy.set(u, attachPractice(cardsBy.get(u) || [], coachBy.get(u) || []));
    } catch { practiceOk = false; }
  }

  for (const u of list) {
    const goal = pickGoal(repBy.get(u) || [], evBy.get(u) || []);
    const cards = cardsBy.get(u) || [];
    // 카드 재료 «둘 다» 를 읽었을 때만 숫자를 말한다 — 한쪽만 읽고 «1장» 이라 하면 거짓이다(PR #1507 리뷰).
    // 연습 기록만 못 읽었어도 «모름»(연습 0으로 위장하지 않는다).
    const fixKnown = reportOk && warmOk && (!cards.length || practiceOk);
    const h: Handover = { goal, fix: fixKnown ? summarizeFix(cards) : null };
    if (handoverWorthShowing(h)) out.set(u, h);
  }
  return out;
}
