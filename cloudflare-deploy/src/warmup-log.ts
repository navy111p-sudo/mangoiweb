// ═══════════════════════════════════════════════════════════════════════
// 📊 수업 전 AI 웜업 — «누가 · 몇 단계로 · 입을 뗐는가» 기록 (2026-08-26)
//
//   발단: 「낮은 단계 학생이 첫 인사도 못 알아듣는다」는 사장님 제보를 조사하다,
//         정작 «낮은 단계 학생이 몇 명이고 몇 단계로 쓰는지» 를 셀 방법이 없다는 것을
//         알았습니다. 대화 수준(1~8)·연령대는 화면 localStorage 에만 있고 서버에는
//         한 글자도 안 남습니다. 기본값이 3(초급·7~9단어·과거형)이라 왕초보가
//         레벨 3으로 시작하고 있을 가능성이 큰데, 그것조차 추측이었습니다.
//         → CLAUDE.md 2장 「자동화하려는 축마다 원료가 있는지 먼저 세어 보세요」와 같은 뿌리.
//
//   이 표로 답하려는 질문은 «둘» 뿐입니다. 그 이상은 담지 않습니다.
//     ① 학생들이 실제로 몇 단계·어느 연령대로 웜업을 시작하는가  (difficulty · age_group)
//     ② 그 학생이 «첫마디를 뗐는가»                              (first_reply_at)
//        ← 낮은 단계 인사말을 고친 효과가 드러나는 자리입니다.
//           인사를 보고 아무 말도 못 하고 나간 세션은 지금까지 흔적이 0 이었습니다.
//
//   ⚠️ 세션당 쓰기는 최대 3회입니다(INSERT 1 + 조건부 UPDATE 최대 2). 발화마다 쓰지 않습니다 —
//      웜업은 매 발화가 이미 D1·KV·Workers AI 를 거쳐서, 여기에 쓰기를 더하면 지연이 됩니다.
//
//   ⚠️ CREATE 는 «이 파일 한 곳» 에만 둡니다. 같은 표의 CREATE 를 두 벌 두면 먼저 도는 쪽이
//      이겨서 새 DB 에서 칸이 갈립니다(CLAUDE.md 2장 vc_quality 사고). 칸을 늘릴 때는
//      여기 DDL 을 고치지 말고 ALTER 로 붙이세요 — 이미 만들어진 표는 CREATE 를 다시 안 봅니다.
//
//   ⚠️ 이 표에만 씁니다. 학생 자료(students_erp·attendance 등)는 한 줄도 건드리지 않습니다.
//
//   이 파일은 import 가 하나도 없어 하니스가 그대로 불러 검증합니다
//   (test-harness/warmup_age_level_harness.mjs G절 — 진짜 SQLite 에 이 DDL 을 그대로 돌립니다).
// ═══════════════════════════════════════════════════════════════════════

/** 표 이름 — 하니스가 «CREATE 가 한 곳뿐인가» 를 이 이름으로 훑습니다. */
export const WARMUP_LOG_TABLE = 'warmup_session_log';

/**
 * 스키마 정본. 하니스가 이 배열을 그대로 꺼내 메모리 SQLite 에 돌립니다.
 * ⚠️ 문자열을 쪼개거나 템플릿 변수를 섞지 마세요 — 그러면 하니스가 실제 SQL 을 못 만듭니다.
 */
export const WARMUP_LOG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS warmup_session_log (
     session_id     TEXT PRIMARY KEY,
     user_id        TEXT,
     difficulty     INTEGER,
     age_group      TEXT,
     textbook       TEXT,
     level          TEXT,
     started_at     INTEGER NOT NULL,
     first_reply_at INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_warmup_log_started ON warmup_session_log (started_at)`,
];

/**
 * 나중에 붙인 칸 — «이미 만들어진 표는 CREATE 를 다시 안 봅니다».
 * ⛔ 위 `WARMUP_LOG_DDL` 의 CREATE 에 칸을 더하지 마세요. 그러면 새 DB 에만 생기고 운영 표는
 *    그대로라, 같은 코드가 환경에 따라 다르게 동작합니다(CLAUDE.md 2장 attendance.host 와 같은 방식).
 * ⚠️ 그래서 **첫 기록이 들어와야 칸이 생깁니다** — 배포 직후 `SELECT lang …` 은
 *    `no such column: lang` 이 납니다. 배포 실패가 아닙니다.
 * 🀄 lang — 2026-09-13 중국어 대화를 붙이며 추가. 이 칸이 없으면 「중국어로 몇 명이 쓰는가」를
 *    셀 방법이 없고, 그러면 「친구하기에도 붙일까」를 숫자로 판단할 수 없습니다
 *    (CLAUDE.md 2장 「자동화하려는 축마다 원료가 있는지 먼저 세어 보세요」).
 */
export const WARMUP_LOG_ALTERS: Array<{ column: string; sql: string }> = [
  { column: 'lang', sql: `ALTER TABLE warmup_session_log ADD COLUMN lang TEXT` },
];

/** 아이솔레이트당 1회만 스키마를 확인한다(발화마다 CREATE 를 보내지 않기 위해). */
let _schemaReady = false;
/** 🀄 나중에 붙인 칸이 «실제로 있는가». ALTER 가 실패했으면 그 칸 없이 적는다.
 *  🔴 이것이 없으면 ALTER 한 번 실패에 **세션 기록 전체가 조용히 죽습니다** —
 *     INSERT 가 `lang` 을 요구해 `no such column` 으로 던지고, 그것을 바깥 catch 가
 *     삼킵니다. 그러면 이 파일이 존재하는 이유(「몇 단계로 쓰는가」·「입을 뗐는가」)가
 *     통째로 사라지는데 화면은 아무 말도 안 합니다.
 *  ⚠️ 「lang 없이라도 남긴다」가 맞는 방향입니다 — 언어 한 칸 때문에 분모를 잃지 않습니다. */
let _hasLangCol = true;

async function ensureWarmupLogSchema(env: any): Promise<void> {
  if (_schemaReady || !env || !env.DB) return;
  for (const sql of WARMUP_LOG_DDL) await env.DB.prepare(sql).run();
  /* ⚠️ «이미 있는 칸» 을 먼저 물어보고 없는 것만 붙인다.
     ⛔ try/catch 로 duplicate 를 삼키는 방식으로 쓰지 마세요 — 그러면 «정상적인 중복» 과
        «진짜 실패» 가 같은 글자가 되어 조용히 묻힙니다(이 파일이 지키려는 바로 그것).
     ℹ️ PRAGMA 는 아이솔레이트당 1회입니다(_schemaReady 가 막습니다). */
  try {
    const info: any = await env.DB.prepare(`PRAGMA table_info(${WARMUP_LOG_TABLE})`).all();
    const have = new Set((info && info.results ? info.results : []).map((r: any) => String(r && r.name)));
    for (const { column, sql } of WARMUP_LOG_ALTERS) {
      if (have.has(column)) continue;
      await env.DB.prepare(sql).run();
      have.add(column);
    }
    _hasLangCol = have.has('lang');
  } catch (e: any) {
    /* 칸을 못 붙였으면 «그 칸 없이» 적는다 — 기록을 통째로 잃는 것보다 낫다.
       ⛔ 여기서 조용히 넘기지 않는다(사유가 없으면 「학생이 안 왔다」와 구분이 안 된다). */
    _hasLangCol = false;
    console.error('warmup-log: lang 칸 추가 실패 — lang 없이 기록합니다:', String(e && e.message || e));
  }
  _schemaReady = true;
}

function _trim(v: any, n: number): string {
  return String(v == null ? '' : v).trim().slice(0, n);
}

/**
 * 세션 시작 1회 기록. 이미 있는 세션이면 «그대로 둡니다»(INSERT OR IGNORE) —
 * 남기려는 값이 «시작할 때 고른 수준» 이라서, 대화 중에 ⋮ 로 바꾼 값이 덮어쓰면 안 됩니다.
 *
 * ⚠️ 부르는 곳이 둘입니다(둘 다 «세션당 첫 번째»):
 *    ① GET /api/warmup/context — 설정 화면을 닫고 웜업이 열린 순간. 로그인 학생은 여기서 잡힙니다.
 *    ② POST /api/warmup/chat 첫 턴 — ①을 안 거친 세션(비로그인·교재 미배정)의 안전망.
 * ⚠️ 실패는 조용히 삼킵니다 — 기록 때문에 학생 웜업이 멈추면 안 됩니다.
 */
export async function logWarmupSessionStart(env: any, o: {
  sessionId?: string; userId?: string; difficulty?: number; ageGroup?: string;
  textbook?: string; level?: string; lang?: string;
}): Promise<void> {
  const sessionId = _trim(o && o.sessionId, 200);
  if (!sessionId || !env || !env.DB) return;
  const rawDiff = Math.floor(Number(o && o.difficulty));
  const difficulty = (rawDiff >= 1 && rawDiff <= 8) ? rawDiff : null;
  try {
    await ensureWarmupLogSchema(env);
    const base = [
      sessionId,
      _trim(o && o.userId, 100) || null,
      difficulty,
      _trim(o && o.ageGroup, 20) || null,
      _trim(o && o.textbook, 200) || null,
      _trim(o && o.level, 100) || null,
    ];
    // 🀄 모르는 값은 «영어» 로 적는다 — 화면 기본값과 서버 normalizeWarmupLang 이 그렇다.
    const lang = (_trim(o && o.lang, 10) === 'zh') ? 'zh' : 'en';
    if (_hasLangCol) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO warmup_session_log
           (session_id, user_id, difficulty, age_group, textbook, level, lang, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...base, lang, Date.now()).run();
    } else {
      /* 칸을 못 붙인 환경 — 언어만 잃고 나머지는 그대로 남긴다(위 _hasLangCol 주석 참고). */
      await env.DB.prepare(
        `INSERT OR IGNORE INTO warmup_session_log
           (session_id, user_id, difficulty, age_group, textbook, level, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(...base, Date.now()).run();
    }
  } catch (e: any) {
    // ⚠️ 삼키되 «조용히» 삼키지는 않는다 — 기록이 통째로 안 들어오는 것과 「학생이 안 왔다」는
    //    숫자로 구분이 안 된다. 이 워커는 관찰 가능성이 켜져 있어 Workers 로그에 남는다.
    console.error('warmup-log: session start 기록 실패 —', String(e && e.message || e));
  }
}

/**
 * 「학생이 실제로 입을 뗀 첫 순간」 1회 기록.
 * ⚠️ `first_reply_at IS NULL` 조건 덕분에 몇 번을 불러도 값이 안 바뀝니다(첫 시각이 정본).
 */
export async function markWarmupFirstReply(env: any, sessionId: string): Promise<void> {
  const sid = _trim(sessionId, 200);
  if (!sid || !env || !env.DB) return;
  try {
    await ensureWarmupLogSchema(env);
    await env.DB.prepare(
      `UPDATE warmup_session_log SET first_reply_at = ?
        WHERE session_id = ? AND first_reply_at IS NULL`
    ).bind(Date.now(), sid).run();
  } catch (e: any) {
    // 여기가 조용히 실패하면 「아무도 입을 못 뗐다」로 보인다 — 고치려던 것의 정반대 결론이 된다.
    console.error('warmup-log: first reply 기록 실패 —', String(e && e.message || e));
  }
}

/**
 * 이번 발화에서 «첫마디» 표시를 시도할지 판정한다 — 순수 함수라 하니스가 직접 돌립니다.
 *
 * 🔴 「히스토리가 비었으면 첫 턴」으로 판정하면 «틀립니다».
 *    교재가 배정된 학생은 화면이 먼저 AI 에게 인사를 시키는데(kickoff), 그 합성 발화도
 *    히스토리에 `role:'user'` 로 저장됩니다. 그래서 학생의 진짜 첫마디가 올 때 히스토리는
 *    이미 비어 있지 않고, 「첫 턴」 판정은 그 학생을 영영 놓칩니다.
 *
 * 규칙: kickoff 는 학생의 말이 아니므로 제외하고, 학생 발화가 아직 0~1개일 때만 시도합니다.
 *   · 자유 대화: 1번째 발화(0개) ✅ · 2번째(1개) — UPDATE 가 0행이라 무해 · 3번째부터 안 부름
 *   · 교재 연동: kickoff ⏭ · 학생 1번째(1개) ✅ · 2번째부터(2개) 안 부름
 * ⇒ 세션당 UPDATE 는 최대 2회입니다.
 */
export function warmupShouldMarkFirstReply(history: any[], kickoff: boolean): boolean {
  if (kickoff) return false;
  const list = Array.isArray(history) ? history : [];
  let userTurns = 0;
  for (const m of list) if (m && m.role === 'user') userTurns++;
  return userTurns <= 1;
}
