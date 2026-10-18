// ═══════════════════════════════════════════════════════════════════════
// 🔁 recent-mistakes.ts — «지난번 실수를 다음 대화에 다시 가져오기» (2026-10-18, 개선안 1순위 ②)
//
//   무엇을 하나
//     학생이 최근에 «교정 카드로 실제로 받은» 표현을 골라, 다음 AI 친구 대화의 시스템 프롬프트에
//     「이 표현을 자연스럽게 다시 쓰게 유도하라」는 한 줄로 넣는다. 틀린 표현을 실제 대화에서
//     «맞게 다시 써 보는» 경험을 만드는 것이 목적이다.
//
//   재료
//     ① warmup_fix_log      — 웜업이 보여 준 교정(warmup-parent.ts 가 정본 스키마)
//     ② ai_friend_fix_log   — AI 친구가 보여 준 교정(이 파일이 정본 스키마). 2026-10-18 전에는
//        KV 메모(6시간)에만 «간격» 이 남고 교정 내용은 어디에도 안 남았다.
//        ⛔ warmup_fix_log 에 섞어 적지 않는다 — 학부모 대시보드·강사 인수인계·«틀린 문장 다시 말하기»
//           카드가 그 표를 «웜업 교정» 으로 읽어 출처를 거짓으로 말하게 된다.
//
//   규칙
//     ⛔ 던지지 않는다 — 조회·기록이 실패하면 빈 목록/false. 대화가 멈추면 안 된다.
//     ⛔ uid 는 정확일치(`Kim`/`kim` 처럼 대소문자만 다른 실제 계정이 있다).
//     ⛔ 영어(ASCII)만 — 고친 문장에 한글·한자가 섞이면 버린다(영어 프롬프트에 한국어가 새면
//        모델이 그것을 답장에 옮긴다). why_ko 는 싣지 않는다.
//     ⛔ 학생에게 «지난번에 틀렸다» 고 말하게 하지 않는다 — 기회만 만든다.
//     ⚠️ 이 파일은 import 가 없다 — 하니스가 타입만 벗겨 그대로 돌린다.
// ═══════════════════════════════════════════════════════════════════════

export const AIFRIEND_FIX_TABLE = 'ai_friend_fix_log';
/** 며칠 안의 교정을 쓰나 */
export const RECENT_MISTAKE_DAYS = 14;
/** 프롬프트에 넣을 최대 개수 — 기초(plain) 단계는 1개만 */
export const RECENT_MISTAKE_MAX = 3;
export const RECENT_MISTAKE_MAX_PLAIN = 1;
/** 한 문장 길이 상한 — 길면 프롬프트만 부풀린다 */
export const RECENT_MISTAKE_MAXLEN = 120;
const DAY_MS = 86400000;

/** 스키마 정본 — 하니스가 그대로 메모리 SQLite 에 돌린다. */
export const AIFRIEND_FIX_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_friend_fix_log (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id     TEXT NOT NULL,
     was         TEXT NOT NULL,
     fixed       TEXT NOT NULL,
     tag         TEXT,
     severity    TEXT,
     day         TEXT NOT NULL,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_aifriend_fix_user ON ai_friend_fix_log (user_id, created_at)`,
  /* 같은 날 같은 문장은 한 줄만 */
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_aifriend_fix_dedupe ON ai_friend_fix_log (user_id, day, was)`,
];

function _t(v: any, n: number): string {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
}

/** 프롬프트에 넣어도 되는 영어 한 문장인가 — ASCII 인쇄가능 문자만, 따옴표 «»·" 는 뺀다 */
export function isPromptSafeEnglish(s: any): boolean {
  const t = _t(s, 1000);
  if (!t || t.length > RECENT_MISTAKE_MAXLEN) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  return /^[\x20-\x7E]+$/.test(t) && !/["\\`]/.test(t);
}

/** 같은 문장인지 — 대소문자·끝 구두점 무시 */
function _norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[\s.!?,;:]+$/g, '');
}

function _kstDay(ms: number): string {
  const k = new Date(ms + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
}

let _schemaReady = false;

/** AI 친구가 «학생 화면에 실제로 보여 준» 교정 한 장을 기록한다. 절대 던지지 않는다. */
export async function logAiFriendFix(db: any, uid: any, fix: any, nowMs: number): Promise<boolean> {
  try {
    const u = _t(uid, 100);
    if (!db || !u || /^(guest|anon)/i.test(u) || !fix) return false;
    const was = _t(fix.was, 300), fixed = _t(fix.now, 300);
    if (!was || !fixed || _norm(was) === _norm(fixed)) return false;
    if (!_schemaReady) {
      for (const sql of AIFRIEND_FIX_DDL) await db.prepare(sql).run();
      _schemaReady = true;
    }
    await db.prepare(
      `INSERT OR IGNORE INTO ai_friend_fix_log (user_id, was, fixed, tag, severity, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(u, was, fixed, _t(fix.tag, 40) || null, _t(fix.severity, 10) || null, _kstDay(nowMs), nowMs).run();
    return true;
  } catch (e: any) {
    console.warn('[recent-mistakes] log failed:', String(e && e.message || e));
    return false;
  }
}

export type RecentMistake = { was: string; fixed: string; at: number };

/**
 * 최근 교정 «쌍» — 두 표를 각각 묻고(한쪽이 없거나 실패해도 다른 쪽은 쓴다), 최신 순·고친 문장 기준 중복 제거.
 * 절대 던지지 않는다. 없으면 [].
 */
export async function loadRecentMistakes(db: any, uid: any, nowMs: number, max: number = RECENT_MISTAKE_MAX): Promise<RecentMistake[]> {
  const u = _t(uid, 100);
  if (!db || !u) return [];
  const since = nowMs - RECENT_MISTAKE_DAYS * DAY_MS;
  const rows: RecentMistake[] = [];
  const pull = async (sql: string) => {
    try {
      const rs: any = await db.prepare(sql).bind(u, since).all();
      for (const r of ((rs && rs.results) || [])) {
        rows.push({ was: _t(r.was, 300), fixed: _t(r.fixed, 300), at: Number(r.created_at) || 0 });
      }
    } catch { /* 표가 아직 없음 = 그 재료만 «모름» */ }
  };
  await pull(`SELECT was, fixed, created_at FROM warmup_fix_log
               WHERE user_id = ? AND created_at >= ? AND COALESCE(lang, 'en') = 'en'
               ORDER BY created_at DESC LIMIT 20`);
  await pull(`SELECT was, fixed, created_at FROM ai_friend_fix_log
               WHERE user_id = ? AND created_at >= ?
               ORDER BY created_at DESC LIMIT 20`);
  rows.sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const out: RecentMistake[] = [];
  for (const r of rows) {
    if (!isPromptSafeEnglish(r.was) || !isPromptSafeEnglish(r.fixed)) continue;
    if (_norm(r.was) === _norm(r.fixed)) continue;
    const k = _norm(r.fixed);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= Math.max(0, max)) break;
  }
  return out;
}

/** 시스템 프롬프트에 붙일 한 덩어리(앞에 줄바꿈 포함). 없으면 '' */
export function recentMistakesPromptLine(list: RecentMistake[] | null | undefined, plain: boolean): string {
  const items = (list || []).slice(0, plain ? RECENT_MISTAKE_MAX_PLAIN : RECENT_MISTAKE_MAX);
  if (!items.length) return '';
  const lines = items.map((m) => `  - they said "${m.was}" → correct: "${m.fixed}"`).join('\n');
  return `\nThis student was recently corrected on these (old mistake → correct form):\n${lines}\n`
    + `When it fits the chat naturally, give them ONE easy chance to use a correct form again — for example ask a question whose natural answer uses it, or use it yourself in your reply. `
    + `Never mention the old mistake, never quiz or list these, and never let this break the level rule or the "follow the student" rule. Cheer if they get it right.`;
}
