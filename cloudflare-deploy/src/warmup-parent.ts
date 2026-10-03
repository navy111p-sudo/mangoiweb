// ═══════════════════════════════════════════════════════════════════════
// 👪 웜업 결과를 학부모에게 (2026-10-02, 제안서 P4 — 사장님 결정: «횟수 + 고쳐 준 표현 1~2개»)
//
//   발단: 파일럿에서 가장 많이 쓰는 AI 기능이 수업 전 웜업(48%)인데, 학부모 대시보드
//         (parent.html)·월간 성적표 어디에도 웜업이 한 줄도 안 나왔습니다.
//
//   [잰 것 — 2026-10-02 운영 D1 SELECT]
//     · warmup_session_log 141행(2026-08-26~) — user_id 가 찬 행 101 · 계정 16명 · 첫마디 기록 100행.
//     · 그 user_id 는 «계정 아이디» 입니다(lee·jeong·delaware…) — 16명 전원이 students_erp 에 있습니다.
//       ⚠️ attendance 의 user_id(기기 임시번호)와 뜻이 다릅니다(CLAUDE.md 2장 attendance_uid).
//       ⚠️ 그 값은 웜업 화면이 localStorage 에서 읽어 «스스로» 보내는 값입니다(서버 검증 없음).
//     · 교정 카드(fix)는 D1 어디에도 남지 않습니다 — KV `warmupfix:<세션>` 에 «몇 번 틀렸나» 메모만
//       6시간 남고 사라집니다. 그래서 「고쳐 준 표현」 은 «지금은 원리상 0건» 입니다.
//
//   이 파일이 하는 일 — 셋뿐입니다.
//     ① warmup_fix_log 표(교정 «쌍» 만) + 기록 함수 logWarmupFix — **아직 아무도 부르지 않습니다.**
//        부를 자리는 src/index.ts 의 handleWarmupChat(공동 금지구역)뿐이라 사람이 한 줄을 넣어야 합니다.
//        (넣을 줄은 이 파일 맨 아래 주석에 그대로 적어 두었습니다.)
//     ② readParentWarmup — 학부모 대시보드가 부르는 «이번 달 횟수·일수 + 최근 교정 2개».
//     ③ warmupCountsBetween — 월간 성적표 데이터가 부르는 «기간 횟수·일수».
//
//   ⛔ 지어내지 않습니다 — 표가 없거나 조회가 실패하면 «모름(null)» 으로 돌려주고 화면이 그렇게 말합니다.
//      0 과 «모름» 은 다른 사실입니다(CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」).
//   ⛔ 학생의 «다른 말» 은 싣지 않습니다 — 교정 «쌍»(학생이 쓴 문장 · 고친 문장 · 한국어 이유)만.
//      그 학생 본인 / 그 학생 계정 토큰을 가진 학부모에게만 보입니다(대시보드 게이트 그대로).
//   ⚠️ 이 파일은 import 가 없습니다 — 하니스가 esbuild 없이 타입만 벗겨 그대로 돌립니다.
// ═══════════════════════════════════════════════════════════════════════

export const WARMUP_FIX_TABLE = 'warmup_fix_log';

/** 스키마 정본 — 하니스가 이 배열을 그대로 메모리 SQLite 에 돌립니다(쪼개거나 템플릿을 섞지 말 것). */
export const WARMUP_FIX_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS warmup_fix_log (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id  TEXT,
     user_id     TEXT NOT NULL,
     was         TEXT NOT NULL,
     fixed       TEXT NOT NULL,
     why_ko      TEXT,
     tag         TEXT,
     severity    TEXT,
     lang        TEXT,
     created_at  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_warmup_fix_user ON warmup_fix_log (user_id, created_at)`,
  /* 같은 세션에서 같은 문장을 다시 고쳐 줘도 한 줄만 — 학부모 화면에 같은 예가 두 번 뜨지 않게 */
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_warmup_fix_dedupe ON warmup_fix_log (session_id, was)`,
];

const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
/** 「최근 고쳐 준 표현」 을 몇 일 안에서 고르는가 — 달 초에도 예가 비지 않게 «이번 달» 대신 30일. */
export const WARMUP_FIX_RECENT_DAYS = 30;
/** 학부모 화면에 보여 줄 교정 예 수 — 사장님 결정 «1~2개». */
export const WARMUP_FIX_SHOW_MAX = 2;

function _t(v: any, n: number): string {
  return String(v == null ? '' : v).trim().slice(0, n);
}

/** 비로그인·게스트 아이디는 기록하지 않는다 — 그 기록을 볼 학부모가 원리상 없다. */
export function isRealStudentUid(uid: any): boolean {
  const u = _t(uid, 100);
  if (!u) return false;
  return !/^(guest|anon)/i.test(u);
}

/** KST 기준 «이번 달 1일 00:00» ~ «다음 달 1일 00:00» (ms). */
export function kstMonthRange(nowMs: number): { start: number; end: number; ym: string } {
  const k = new Date(nowMs + KST_MS);
  const y = k.getUTCFullYear(), m = k.getUTCMonth();
  const start = Date.UTC(y, m, 1) - KST_MS;
  const end = Date.UTC(y, m + 1, 1) - KST_MS;
  return { start, end, ym: `${y}-${String(m + 1).padStart(2, '0')}` };
}

let _fixSchemaReady = false;

/**
 * 교정 카드 «한 장» 을 기록한다 — **학생 화면에 실제로 보여 준 것만** 넘기세요(decideWarmupFixShow 의 show).
 * ⚠️ 절대 던지지 않습니다 — 기록 때문에 웜업이 멈추면 안 됩니다. 실패는 로그로 남깁니다.
 */
export async function logWarmupFix(env: any, o: {
  sessionId?: string; userId?: string; lang?: string;
  fix?: { was?: string; now?: string; why_ko?: string; tag?: string; severity?: string } | null;
}): Promise<boolean> {
  try {
    if (!env || !env.DB || !o || !o.fix) return false;
    const uid = _t(o.userId, 100);
    if (!isRealStudentUid(uid)) return false;
    const was = _t(o.fix.was, 300), fixed = _t(o.fix.now, 300);
    if (!was || !fixed || was === fixed) return false;
    if (!_fixSchemaReady) {
      for (const sql of WARMUP_FIX_DDL) await env.DB.prepare(sql).run();
      _fixSchemaReady = true;
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO warmup_fix_log (session_id, user_id, was, fixed, why_ko, tag, severity, lang, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      _t(o.sessionId, 200) || null, uid, was, fixed,
      _t(o.fix.why_ko, 300) || null, _t(o.fix.tag, 40) || null, _t(o.fix.severity, 10) || null,
      (_t(o.lang, 10) === 'zh') ? 'zh' : 'en', Date.now(),
    ).run();
    return true;
  } catch (e: any) {
    console.error('warmup-fix-log: 기록 실패 —', String(e && e.message || e));
    return false;
  }
}

export type WarmupCounts = { sessions: number; spoke_sessions: number; days: number } | null;

/**
 * 기간 안의 웜업 횟수 — 월간 성적표·학부모 대시보드가 같은 식을 씁니다.
 *   sessions       = 시작된 세션(설정을 닫고 열린 것)
 *   spoke_sessions = 그중 학생이 «첫마디를 뗀» 세션(first_reply_at) — 화면 머리 숫자는 이것입니다
 *   days           = 학생이 말한 날(KST)
 * ⚠️ user_id 는 «정확일치» — `Kim`/`kim` 처럼 대소문자만 다른 실제 계정이 있습니다(CLAUDE.md 2장).
 * 조회가 실패하면(표 없음 포함) null = 모름.
 */
export async function warmupCountsBetween(db: any, uid: string, startMs: number, endMs: number): Promise<WarmupCounts> {
  try {
    const r: any = await db.prepare(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(first_reply_at IS NOT NULL), 0) AS spoke,
              COUNT(DISTINCT CASE WHEN first_reply_at IS NOT NULL
                                  THEN date(started_at/1000, 'unixepoch', '+9 hours') END) AS days
         FROM warmup_session_log
        WHERE user_id = ? AND started_at >= ? AND started_at < ?`
    ).bind(uid, startMs, endMs).first();
    if (!r) return null;
    return { sessions: Number(r.n) || 0, spoke_sessions: Number(r.spoke) || 0, days: Number(r.days) || 0 };
  } catch {
    return null;
  }
}

export type ParentWarmup = {
  month: string;
  sessions_this_month: number | null;
  spoke_sessions_this_month: number | null;
  days_this_month: number | null;
  /** false = 교정 기록 표가 아직 없음(기록이 연결되지 않음) — 0건과 다른 사실 */
  fixes_recorded: boolean;
  recent_fixes: Array<{ from: string; to: string; why_ko: string; at: number }>;
};

/** 학부모 대시보드용 — 부르는 쪽이 이미 «그 학생 계정 토큰» 게이트를 통과시킨 뒤에만 부르세요. */
export async function readParentWarmup(db: any, uid: string, nowMs: number): Promise<ParentWarmup> {
  const { start, end, ym } = kstMonthRange(nowMs);
  const c = await warmupCountsBetween(db, uid, start, end);
  let fixesRecorded = false;
  let fixes: ParentWarmup['recent_fixes'] = [];
  try {
    const rs: any = await db.prepare(
      `SELECT was, fixed, why_ko, created_at FROM warmup_fix_log
        WHERE user_id = ? AND created_at >= ?
        ORDER BY created_at DESC LIMIT ?`
    ).bind(uid, nowMs - WARMUP_FIX_RECENT_DAYS * DAY_MS, WARMUP_FIX_SHOW_MAX).all();
    fixesRecorded = true;
    fixes = ((rs && rs.results) || []).map((r: any) => ({
      from: String(r.was || ''), to: String(r.fixed || ''), why_ko: String(r.why_ko || ''), at: Number(r.created_at) || 0,
    })).filter((f: any) => f.from && f.to);
  } catch {
    /* 표가 아직 없다 = 기록이 연결되지 않았다. 지어내지 않고 «기록 없음» 이라고 말한다. */
    fixesRecorded = false;
    fixes = [];
  }
  return {
    month: ym,
    sessions_this_month: c ? c.sessions : null,
    spoke_sessions_this_month: c ? c.spoke_sessions : null,
    days_this_month: c ? c.days : null,
    fixes_recorded: fixesRecorded,
    recent_fixes: fixes,
  };
}

/* ─────────────────────────────────────────────────────────────────────
   🔌 아직 연결되지 않은 한 줄 (사람이 넣어야 함 — src/index.ts 는 공동 금지구역)

   handleWarmupChat 안, `showFix = decided.show;` 바로 다음 줄에:

     if (showFix) await logWarmupFix(env, { sessionId, userId: ctxUserId, fix: showFix, lang: ctxLang });

   + 파일 머리 import 에 `import { logWarmupFix } from './warmup-parent';`

   ⚠️ 그 자리가 «통째로 try/catch» 안이고 logWarmupFix 자체도 던지지 않습니다.
   ⚠️ ctxUserId 는 웜업 화면이 스스로 보내는 값(서버 검증 없음)입니다 — 다른 아이디를 실어
      그 아이의 학부모 화면에 «교정 문장» 을 심을 수 있습니다. 화면은 esc() 로만 그리므로 스크립트는
      안 되지만 «글자» 는 심깁니다. 막으려면 이 한 줄을 넣을 때 mango_token(resolveOwnerScope 'self')
      을 확인하는 조건을 함께 거세요 — 그것도 사람이 정할 일입니다.
   ───────────────────────────────────────────────────────────────────── */
