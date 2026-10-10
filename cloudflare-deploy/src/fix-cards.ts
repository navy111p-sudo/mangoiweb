// ═══════════════════════════════════════════════════════════════════════
// 📝 fix-cards.ts — «내가 틀린 문장 다시 말하기» 카드 (2026-10-10, 경쟁사 분석 적용 ①)
//
//   무엇을 하나
//     학생이 «실제로 틀린» 영어 문장을 최근 30일 기록에서 최대 3개 골라
//     「내가 한 말 → 고친 문장 → 이유」 카드로 돌려준다. 학생은 «오늘의 A.i 학습» 화면에서
//     그 카드를 보고 «🎤 따라 말하기» 로 발음 코칭(/speech-coach.html?say=…)을 연다.
//
//   재료 — 새로 만들지 않고 이미 쌓이는 두 곳만 읽는다
//     ① ai_lesson_reports.grammar_errors — 녹화 수업 AI 리포트({original, corrected, reason})
//        [잰 것 — 2026-10-10 운영 D1] 2건·학생 1명·마지막 2026-08-09. 리포트를 관리자가 버튼으로
//        만들어야 해서 거의 비어 있다(«자동 생성» 은 별건 — 사람이 정할 일).
//     ② warmup_fix_log — 웜업에서 학생에게 «실제로 보여 준» 교정 카드({was, fixed, why_ko})
//        [잰 것 — 2026-10-10] 8건·학생 3명·2026-10-02부터 쌓이는 중.
//     ⟹ 지금은 대부분의 학생에게 카드가 «없는» 것이 정상이다. 화면은 그때 칸을 통째로 감춘다.
//
//   «연습했나» 판정 — 새 표를 만들지 않는다
//     발음 코칭이 채점할 때마다 voice_coaching 에 (student_uid, target_text, accuracy_score) 를
//     남긴다(api-games.ts /api/voice/coach). 카드가 생긴 «뒤» 에 그 문장을 말한 기록이 있으면
//     «연습함» 이다. ⚠️ 점수는 «정확도(accuracy_score)» 칸을 그대로 쓴다 — 종합 점수는 저장되지
//     않으므로 지어내지 않는다.
//
//   규칙
//     ⛔ 지어내지 않는다 — 고친 문장이 영어가 아니거나(isEnglishText) 원문과 사실상 같으면 버린다.
//     ⛔ 조회가 실패하면 그 재료만 «모름» 으로 두고(sources.x = false) 나머지는 그대로 돌려준다.
//        카드 칸 하나 때문에 «오늘의 A.i 학습» 이 통째로 비면 안 된다.
//     ⛔ uid 는 «정확일치» — `Kim`/`kim` 처럼 대소문자만 다른 실제 계정이 있다(CLAUDE.md 2장).
//     ⚠️ 수업 리포트가 웜업보다 «먼저» 다(수업에서 한 실수가 이 기능의 핵심). 같은 고친 문장은 한 장.
//     ⚠️ 중국어(lang='zh')는 아직 안 한다 — 발음 코칭 ?say= 가 영어 화면이다.
// ═══════════════════════════════════════════════════════════════════════
import { isEnglishText } from './english-only';

export const FIX_CARD_MAX = 3;
export const FIX_CARD_DAYS = 30;
/** 카드 문장 길이 상한 — 발음 코칭은 한 문장(15초 녹음 상한) 연습이다 */
export const FIX_CARD_MAXLEN = 160;
const DAY_MS = 86400000;

export type FixCardSource = 'lesson' | 'warmup';
export type FixCard = {
  key: string;            // 같은 문장인지 가르는 열쇠(normSentence(to))
  from: string;           // 학생이 한 말
  to: string;             // 고친 문장 — 따라 말할 문장
  why_ko: string;         // 이유(한국어). 없으면 ''
  source: FixCardSource;
  at: number;             // 그 교정이 생긴 시각(ms)
  lesson_title: string;   // 수업 리포트일 때만
  practiced: number;      // 카드가 생긴 뒤 그 문장을 말한 횟수
  best_accuracy: number | null;  // 그중 가장 높은 정확도 — 말한 적 없으면 null
};

/** 같은 문장인지 가르는 꼴 — 대소문자·겹공백·끝 구두점을 무시한다 */
export function normSentence(s: unknown): string {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.!?,;:]+$/g, '');
}

function _t(v: unknown, n: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}

/** 활자 부호(‘’ “” – — …)를 ASCII 로 — 발음 코칭 ?say= 는 ASCII 만 받으므로 카드 문장도 맞춘다 */
export function asciiPunct(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
          .replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...');
}

/** 교정 «쌍» 하나를 카드로 쓸 수 있는가 — 쓸 수 없으면 null(지어내지 않는다) */
export function cleanPair(from: unknown, to: unknown, why: unknown): { from: string; to: string; why_ko: string } | null {
  const f = asciiPunct(_t(from, FIX_CARD_MAXLEN)), t = asciiPunct(_t(to, FIX_CARD_MAXLEN + 1));
  if (!f || !t) return null;
  if (t.length > FIX_CARD_MAXLEN) return null;                 // 잘린 문장을 따라 말하게 하지 않는다
  if (!isEnglishText(t, FIX_CARD_MAXLEN)) return null;         // 고친 문장은 반드시 영어
  if (normSentence(f) === normSentence(t)) return null;        // 대소문자·마침표만 다르면 «고친 것» 이 아니다
  return { from: f, to: t, why_ko: _t(why, 200) };
}

function _arr(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  try { const v = JSON.parse(String(raw || '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
}

/**
 * 두 재료를 합쳐 카드를 고른다(순수 함수 — 하니스가 직접 돌린다).
 *   lessonRows: [{ grammar_errors, lesson_title, created_at }]  (최근 것 먼저)
 *   warmupRows: [{ was, fixed, why_ko, lang, created_at }]       (최근 것 먼저)
 */
export function pickFixCards(lessonRows: any[], warmupRows: any[], max = FIX_CARD_MAX): FixCard[] {
  const out: FixCard[] = [];
  const seen = new Set<string>();
  const push = (p: { from: string; to: string; why_ko: string } | null, source: FixCardSource, at: number, title: string) => {
    if (!p || out.length >= max) return;
    const key = normSentence(p.to);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, from: p.from, to: p.to, why_ko: p.why_ko, source, at: Number(at) || 0,
               lesson_title: title, practiced: 0, best_accuracy: null });
  };
  for (const r of (lessonRows || [])) {
    for (const e of _arr(r && r.grammar_errors)) {
      if (!e || typeof e !== 'object') continue;
      push(cleanPair(e.original, e.corrected, e.reason), 'lesson', r.created_at, _t(r.lesson_title, 80));
    }
  }
  for (const r of (warmupRows || [])) {
    if (!r || String(r.lang || 'en') === 'zh') continue;
    push(cleanPair(r.was, r.fixed, r.why_ko), 'warmup', r.created_at, '');
  }
  return out;
}

/**
 * 연습 기록을 붙인다 — 카드가 «생긴 뒤» 에 그 문장을 말한 것만 센다(순수 함수).
 *   coachRows: [{ target_text, accuracy_score, created_at }]
 */
export function attachPractice(cards: FixCard[], coachRows: any[]): FixCard[] {
  return (cards || []).map((c) => {
    let n = 0, best: number | null = null;
    for (const r of (coachRows || [])) {
      if (!r || normSentence(r.target_text) !== c.key) continue;
      if ((Number(r.created_at) || 0) < c.at) continue;
      n++;
      const a = Number(r.accuracy_score);
      if (Number.isFinite(a) && (best === null || a > best)) best = a;
    }
    return { ...c, practiced: n, best_accuracy: best };
  });
}

export type FixCardsResult = {
  cards: FixCard[];
  /** false = 그 재료를 «못 물어봤다»(표 없음·조회 실패) — 0건과 다른 사실 */
  sources: { lesson: boolean; warmup: boolean; practice: boolean };
};

/** 서버 정본 — 부르는 쪽이 이미 «본인 토큰 또는 관리자» 게이트를 통과시킨 뒤에만 부르세요. 던지지 않는다. */
export async function loadFixCards(db: any, uid: string, nowMs: number): Promise<FixCardsResult> {
  const since = nowMs - FIX_CARD_DAYS * DAY_MS;
  const sources = { lesson: false, warmup: false, practice: false };
  let lessonRows: any[] = [], warmupRows: any[] = [];
  try {
    const rs: any = await db.prepare(
      `SELECT grammar_errors, lesson_title, created_at FROM ai_lesson_reports
        WHERE student_uid = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 5`
    ).bind(uid, since).all();
    lessonRows = (rs && rs.results) || [];
    sources.lesson = true;
  } catch { lessonRows = []; }
  try {
    const rs: any = await db.prepare(
      `SELECT was, fixed, why_ko, lang, created_at FROM warmup_fix_log
        WHERE user_id = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT 30`
    ).bind(uid, since).all();
    warmupRows = (rs && rs.results) || [];
    sources.warmup = true;
  } catch { warmupRows = []; }

  let cards = pickFixCards(lessonRows, warmupRows);
  if (cards.length) {
    let oldest = nowMs;
    for (const c of cards) if (c.at && c.at < oldest) oldest = c.at;
    try {
      const rs: any = await db.prepare(
        `SELECT target_text, accuracy_score, created_at FROM voice_coaching
          WHERE student_uid = ? AND created_at >= ?
          ORDER BY created_at DESC LIMIT 300`
      ).bind(uid, oldest).all();
      cards = attachPractice(cards, (rs && rs.results) || []);
      sources.practice = true;
    } catch { /* 연습 기록을 못 읽으면 카드는 그대로, «연습함» 표시만 없다 */ }
  }
  return { cards, sources };
}
