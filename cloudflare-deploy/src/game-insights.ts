/**
 * game-insights.ts — 🎮 전 게임 통합 학습 분석 (2026-08-08 신설)
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────────────
 * 관리자 「영어 배틀 관리」 카드는 **배틀이 아니었다.** P2P 배틀 백엔드는 만들어진 적이 없고
 * (api-admin.ts:9730 주석에 그대로 적혀 있다), 리더보드는
 *   `SELECT SUM(correct_count) FROM game_progress`
 * 였다. 즉 화면의 「완료 배틀 1235 · 평균 승수 176.4 · jeong vs AI」는 전부
 * **단어 정답 누계**를 대결처럼 그린 것이다. 이미 전 게임 통합 데이터인데 이름표만 틀렸다.
 *
 * 진짜 문제는 따로 있었다 — **`game_progress` 에 «어느 게임에서 나온 기록인지» 칸이 없다.**
 *   UNIQUE(user_id, lang, item)   ← 게임 이름이 어디에도 없음
 * 그래서 게임 8종이 한 표에 섞여 들어갔고, 「테트리스가 잘 되고 있나」를 물어볼 수조차 없었다.
 * 게다가 13종 중 6종(shooter·wordfighter·grammar-pizza·rescue-voyage·suspect-mystery·
 * battle-3d)은 정오답을 아예 보내지 않았다.
 *
 * ── 이 모듈이 하는 일 ──────────────────────────────────────────────────────
 *   POST /api/games/session          학생(공개) — 게임이 **끝날 때 딱 1행**
 *   GET  /api/admin/game-insights    관리자 — 이미 집계된 JSON 하나 (KV 10분 캐시)
 *
 * ⚡ 경량 원칙 (사장님 지시: 최대한 가볍게·빠르게·안정적으로)
 *   · 단어 하나마다 서버를 부르지 않는다. **판당 1행.** 필리핀 회선에서 그게 게임을 끊는다.
 *   · 클라이언트는 `sendBeacon` — 응답을 기다리지 않으므로 게임 프레임에 영향 0.
 *   · insights 는 서버가 집계를 **끝내서** 보낸다. 화면은 그리기만 한다(계산 0).
 *   · 기록 실패가 게임을 멈추면 안 된다 → 전 구간 try/catch, 실패해도 200 계열로 응답.
 *
 * 🔒 개인정보: uid(익명 학습키)만 저장한다. 실명·연락처는 넣지도, 내보내지도 않는다.
 *    지사·대리점도 보는 화면이라 insights 응답에도 실명이 없다.
 */

import { oncePerIsolate } from './once-per-isolate';

type Env = any;

const JSONH = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: JSONH });

const DAY = 24 * 60 * 60 * 1000;

/** 게임 식별자 화이트리스트 — 오타·장난 입력이 표를 오염시키지 않게 서버가 정본을 쥔다.
 *  새 게임을 만들면 **여기에 먼저 등록**해야 집계에 잡힌다(등록 안 하면 'other' 로 모임). */
export const KNOWN_GAMES = [
  // 액션 게임 13종
  'avatar', 'escape-school', 'escape-voice', 'escape-zombie', 'grammar-pizza',
  'language-ace', 'p38-3d', 'rescue-voyage', 'shooter', 'space-monster',
  'tank-battle', 'tetris', 'wordfighter',
  // 학습 앱
  'vocab', 'micro-quiz', 'review-quiz', 'speech-coach', 'ai-write',
  'warmup', 'judgment', 'suspect-mystery', 'battle-3d',
  // 교재 연동 쓰기 숙제(장면 탐험대 «그림 단어장» — 2026-09-24)
  'scene-words',
] as const;

const GAME_SET = new Set<string>(KNOWN_GAMES as readonly string[]);

/** 화면 표기용 이름 — 한/영 둘 다. (필리핀 강사가 다수라 영어가 «있으면 좋은 것»이 아니라 필수) */
export const GAME_LABELS: Record<string, { ko: string; en: string }> = {
  'avatar':          { ko: '아바타',        en: 'Avatar' },
  'escape-school':   { ko: '학교 탈출',      en: 'School Escape' },
  'escape-voice':    { ko: '목소리 탈출',    en: 'Voice Escape' },
  'escape-zombie':   { ko: '좀비 탈출',      en: 'Zombie Escape' },
  'grammar-pizza':   { ko: '문법 피자',      en: 'Grammar Pizza' },
  'language-ace':    { ko: '랭귀지 에이스',  en: 'Language Ace' },
  'p38-3d':          { ko: 'P-38 비행',      en: 'P-38 Flight' },
  'rescue-voyage':   { ko: '구조 항해',      en: 'Rescue Voyage' },
  'shooter':         { ko: '단어 슈터',      en: 'Word Shooter' },
  'space-monster':   { ko: '우주 몬스터',    en: 'Space Monster' },
  'tank-battle':     { ko: '탱크 배틀',      en: 'Tank Battle' },
  'tetris':          { ko: '단어 테트리스',  en: 'Word Tetris' },
  'wordfighter':     { ko: '워드파이터',     en: 'Word Fighter' },
  'vocab':           { ko: '단어장',         en: 'Vocabulary' },
  'micro-quiz':      { ko: '마이크로 퀴즈',  en: 'Micro Quiz' },
  'review-quiz':     { ko: '복습 퀴즈',      en: 'Review Quiz' },
  'speech-coach':    { ko: '발음 코치',      en: 'Speech Coach' },
  'ai-write':        { ko: 'AI 영작',        en: 'AI Writing' },
  'warmup':          { ko: '워밍업',         en: 'Warm-up' },
  'judgment':        { ko: '판단력 훈련',    en: 'Judgment' },
  'suspect-mystery': { ko: '용의자 추리',    en: 'Suspect Mystery' },
  'battle-3d':       { ko: '3D 배틀',        en: '3D Battle' },
  'scene-words':     { ko: '교재 낱말 쓰기', en: 'Textbook word writing' },
  'other':           { ko: '기타',           en: 'Other' },
  '':                { ko: '(계측 이전)',    en: '(before tracking)' },
};

/** 게임 이름 정규화 — 모르는 값은 버리지 않고 'other' 로 모은다(기록을 잃지 않기 위함).
 *  @param whenEmpty 값이 비었을 때 무엇으로 둘지. 세션 기록은 'other',
 *         game_progress 는 ''(=옛 클라이언트가 보낸 «계측 이전» 기록과 구분하기 위해). */
export function normalizeGameId(v: any, whenEmpty: string = 'other'): string {
  const g = String(v || '').trim().toLowerCase().slice(0, 40).replace(/[^a-z0-9-]/g, '');
  if (!g) return whenEmpty;
  return GAME_SET.has(g) ? g : 'other';
}
const normGame = (v: any) => normalizeGameId(v, 'other');

const clampInt = (v: any, lo: number, hi: number) => {
  const n = Math.round(Number(v) || 0);
  return n < lo ? lo : (n > hi ? hi : n);
};

/* ════════════════════════════════════════════════════════════════════════
 *  스키마 — 기존 표를 갈아엎지 않는다. 칸 하나 더하고, 표 하나 새로 만든다.
 * ════════════════════════════════════════════════════════════════════════ */
export const ensureGameTables = oncePerIsolate(async (env: Env) => {
  // ① game_progress — 없으면 만들고(game 칸 포함), 있으면 칸만 덧붙인다.
  //    ⚠️ ALTER 는 이미 칸이 있으면 오류를 던진다. 그게 정상이므로 삼킨다.
  //    (SQLite 에는 ADD COLUMN IF NOT EXISTS 가 없다)
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS game_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, lang TEXT NOT NULL, item TEXT NOT NULL, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, pron_best INTEGER DEFAULT 0, pron_last INTEGER DEFAULT 0, pron_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, game TEXT DEFAULT '', UNIQUE(user_id, lang, item));`);
  } catch { /* 이미 있으면 그대로 */ }
  try {
    await env.DB.exec(`ALTER TABLE game_progress ADD COLUMN game TEXT DEFAULT '';`);
  } catch { /* 칸이 이미 있음 — 정상 경로 */ }

  // ② game_sessions — 판(session) 단위 1행. 이게 «게임별 분석» 을 가능하게 하는 유일한 표다.
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS game_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, game TEXT NOT NULL, lang TEXT DEFAULT 'en', started_at INTEGER, ended_at INTEGER, dur_ms INTEGER DEFAULT 0, items INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, wrong INTEGER DEFAULT 0, finished INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, created_at INTEGER);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_gs_game_time ON game_sessions(game, ended_at);`);
  await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_gs_uid_time ON game_sessions(uid, ended_at);`);
});

/* ════════════════════════════════════════════════════════════════════════
 *  POST /api/games/session — 학생용(공개). 게임이 끝날 때 딱 1번.
 *  본문: {uid, game, lang, started_at, ended_at, items, correct, wrong, finished, coins}
 *
 *  ⚠️ 이 API 는 «절대 게임을 방해하면 안 된다».
 *     그래서 실패해도 4xx/5xx 로 시끄럽게 굴지 않고 {ok:false} 200 으로 조용히 끝낸다.
 *     클라이언트는 sendBeacon 이라 어차피 응답을 읽지 않는다.
 * ════════════════════════════════════════════════════════════════════════ */
export async function handleGameSession(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { body = {}; }

    const uid = String(body?.uid || body?.user_id || '').trim().slice(0, 100);
    if (!uid) return json({ ok: false, error: 'uid_required' });

    const game = normGame(body?.game);
    const lang = (String(body?.lang || 'en').toLowerCase() === 'zh') ? 'zh' : 'en';

    const now = Date.now();
    let ended = clampInt(body?.ended_at, 0, now + 60_000) || now;
    let started = clampInt(body?.started_at, 0, ended) || ended;
    // 한 판이 6시간을 넘을 수는 없다 — 창을 열어둔 채 잊은 경우를 잘라낸다.
    let dur = ended - started;
    if (dur < 0) dur = 0;
    if (dur > 6 * 60 * 60 * 1000) { dur = 0; started = ended; }

    const items   = clampInt(body?.items,   0, 5000);
    const correct = clampInt(body?.correct, 0, 5000);
    const wrong   = clampInt(body?.wrong,   0, 5000);
    const coins   = clampInt(body?.coins,   0, 5000);   // 코인과 같은 1회 상한(어뷰징 방지)
    const finished = body?.finished ? 1 : 0;

    // ⚠️ 표 준비를 «건너뛰기» 보다 먼저 한다.
    //    반대로 두면 첫 학생이 실제로 한 판을 끝내는 순간에야 DDL 이 돌아, 하필 그때
    //    실패하면 그 기록을 잃는다. oncePerIsolate 라 두 번째 요청부터는 왕복이 없다.
    await ensureGameTables(env);

    // 아무 일도 없었던 판은 기록하지 않는다(입장만 하고 나간 경우 표가 쓰레기로 찬다).
    // 단 «시작했다가 3초 만에 나갔다» 는 포기 신호라 dur 가 있으면 남긴다.
    if (!items && !correct && !wrong && !coins && dur < 3000) return json({ ok: true, skipped: true });
    await env.DB.prepare(
      `INSERT INTO game_sessions (uid, game, lang, started_at, ended_at, dur_ms, items, correct, wrong, finished, coins, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(uid, game, lang, started, ended, dur, items, correct, wrong, finished, coins, now).run();

    return json({ ok: true });
  } catch (e: any) {
    // 조용한 실패 — 게임에는 아무 영향 없어야 한다.
    console.warn('[game-session] save failed:', e?.message || e);
    return json({ ok: false, error: 'save_failed' });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  GET /api/admin/game-insights?range=7|30 — 관리자용 통합 집계
 *
 *  화면은 «그리기만» 한다. 판단 기준(성장/정체/사라짐, 포기율)도 여기서 계산해 보낸다.
 *  KV 10분 캐시 — 매니저 여러 명이 같은 아침에 열어도 D1 집계는 한 번만.
 * ════════════════════════════════════════════════════════════════════════ */
export async function gameInsightsRouter(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('range') || '7', 10) || 7));
    const nocache = url.searchParams.get('nocache') === '1';
    const cacheKey = `game-insights:v1:${days}`;

    if (!nocache) {
      try {
        const hit = await env.SESSION_STATE?.get(cacheKey);
        if (hit) return new Response(hit, { status: 200, headers: { ...JSONH, 'X-Cache': 'hit' } });
      } catch { /* KV 사고가 화면을 죽이면 안 된다 */ }
    }

    await ensureGameTables(env);
    const now = Date.now();
    const since = now - days * DAY;
    const prevSince = since - days * DAY;          // 직전 같은 기간(추세 비교용)

    const out: any = {
      ok: true, range_days: days, generated_at: now,
      games: [], totals: {}, weak: [], students: {}, pron: {}, notes: [],
    };

    /* ── ① 게임별 참여·효과 ──────────────────────────────────────────────
     *  판수·학생수·완주율·판당 학습항목·정답률을 한 번의 스캔으로. */
    try {
      const rs = await env.DB.prepare(
        `SELECT game,
                COUNT(*) AS sessions,
                COUNT(DISTINCT uid) AS students,
                SUM(finished) AS finished,
                SUM(items) AS items,
                SUM(correct) AS correct,
                SUM(wrong) AS wrong,
                SUM(dur_ms) AS dur
           FROM game_sessions WHERE ended_at >= ? AND substr(uid,1,2) <> '__'
          GROUP BY game ORDER BY sessions DESC`
      ).bind(since).all();

      // 재방문율 = 그 게임을 2판 이상 한 학생 / 1판 이상 한 학생
      const rep = await env.DB.prepare(
        `SELECT game, COUNT(*) AS repeaters FROM (
            SELECT game, uid, COUNT(*) AS c FROM game_sessions
             WHERE ended_at >= ? AND substr(uid,1,2) <> '__' GROUP BY game, uid HAVING c >= 2
         ) GROUP BY game`
      ).bind(since).all();
      const repMap: Record<string, number> = {};
      for (const r of ((rep.results as any[]) || [])) repMap[String(r.game)] = Number(r.repeaters) || 0;

      for (const r of ((rs.results as any[]) || [])) {
        const g = String(r.game || '');
        const sessions = Number(r.sessions) || 0;
        const students = Number(r.students) || 0;
        const fin = Number(r.finished) || 0;
        const items = Number(r.items) || 0;
        const c = Number(r.correct) || 0, w = Number(r.wrong) || 0;
        const label = GAME_LABELS[g] || GAME_LABELS['other'];
        out.games.push({
          game: g, ko: label.ko, en: label.en,
          sessions, students,
          finish_rate: sessions ? Math.round(fin * 100 / sessions) : 0,
          dropoff_rate: sessions ? Math.round((sessions - fin) * 100 / sessions) : 0,
          items_per_session: sessions ? Math.round(items * 10 / sessions) / 10 : 0,
          accuracy: (c + w) ? Math.round(c * 100 / (c + w)) : 0,
          repeat_rate: students ? Math.round((repMap[g] || 0) * 100 / students) : 0,
          avg_min: sessions ? Math.round((Number(r.dur) || 0) / sessions / 60000 * 10) / 10 : 0,
        });
      }
    } catch (e: any) { out.notes.push('games_agg_failed'); }

    /* ── ② 전체 합계 + 직전 기간 대비 ─────────────────────────────────── */
    try {
      const a: any = await env.DB.prepare(
        `SELECT COUNT(*) s, COUNT(DISTINCT uid) u FROM game_sessions WHERE ended_at >= ? AND substr(uid,1,2) <> '__'`
      ).bind(since).first();
      const b: any = await env.DB.prepare(
        `SELECT COUNT(*) s, COUNT(DISTINCT uid) u FROM game_sessions WHERE ended_at >= ? AND ended_at < ? AND substr(uid,1,2) <> '__'`
      ).bind(prevSince, since).first();
      const first: any = await env.DB.prepare(`SELECT MIN(created_at) m FROM game_sessions WHERE substr(uid,1,2) <> '__'`).first();
      out.totals = {
        sessions: Number(a?.s) || 0,
        students: Number(a?.u) || 0,
        prev_sessions: Number(b?.s) || 0,
        prev_students: Number(b?.u) || 0,
        tracking_since: Number(first?.m) || 0,     // 계측 시작 시점 — 0 이면 «아직 한 판도 없음»
        games_live: out.games.length,
        games_total: KNOWN_GAMES.length,
      };
    } catch { out.notes.push('totals_failed'); }

    /* ── ③ 전 게임 통합 약점 단어 Top 20 ─────────────────────────────────
     *  이건 game_progress 에서 온다(계측 이전 데이터도 살아 있다). */
    try {
      const rs = await env.DB.prepare(
        `SELECT item, ko, lang, game, SUM(wrong_count) w, SUM(correct_count) c, COUNT(DISTINCT user_id) students
           FROM game_progress
          WHERE wrong_count > 0 AND user_id NOT LIKE 'guest%'
          GROUP BY item, lang HAVING w >= 1
          ORDER BY w DESC, students DESC LIMIT 20`
      ).all();
      out.weak = ((rs.results as any[]) || []).map(r => ({
        item: r.item, ko: r.ko || '', lang: r.lang || 'en',
        wrong: Number(r.w) || 0, correct: Number(r.c) || 0,
        students: Number(r.students) || 0,
        game: String(r.game || ''),
      }));
    } catch { out.notes.push('weak_failed'); }

    /* ── ④ 학생 3구간: 성장 / 정체 / 사라짐 ──────────────────────────────
     *  기준은 «설명할 수 있게» 단순하게 둔다. 매니저가 학부모에게 말해야 하는 숫자다.
     *    성장   = 이번 기간 판수 > 직전 기간 판수
     *    정체   = 판수는 비슷한데 정답률이 5%p 넘게 오르지 않음
     *    사라짐 = 예전엔 했는데 14일째 0판  ← 이탈 조기신호
     */
    try {
      const rs = await env.DB.prepare(
        `SELECT uid,
                SUM(CASE WHEN ended_at >= ? THEN 1 ELSE 0 END) cur_s,
                SUM(CASE WHEN ended_at >= ? AND ended_at < ? THEN 1 ELSE 0 END) prev_s,
                SUM(CASE WHEN ended_at >= ? THEN correct ELSE 0 END) cur_c,
                SUM(CASE WHEN ended_at >= ? THEN wrong ELSE 0 END) cur_w,
                SUM(CASE WHEN ended_at >= ? AND ended_at < ? THEN correct ELSE 0 END) prev_c,
                SUM(CASE WHEN ended_at >= ? AND ended_at < ? THEN wrong ELSE 0 END) prev_w,
                MAX(ended_at) last_at
           FROM game_sessions WHERE ended_at >= ? AND uid NOT LIKE 'guest%' AND substr(uid,1,2) <> '__'
          GROUP BY uid`
      ).bind(since, prevSince, since, since, since, prevSince, since, prevSince, since, prevSince).all();

      let growing = 0, stuck = 0;
      const gone: any[] = [];
      const acc = (c: number, w: number) => (c + w) ? (c * 100 / (c + w)) : -1;

      for (const r of ((rs.results as any[]) || [])) {
        const cur = Number(r.cur_s) || 0, prev = Number(r.prev_s) || 0;
        const lastAt = Number(r.last_at) || 0;
        if (cur === 0 && prev > 0) {
          // 이번 기간 0판 — 마지막으로 논 지 며칠 됐나
          const idle = Math.floor((now - lastAt) / DAY);
          if (idle >= 14) gone.push({ uid: r.uid, idle_days: idle, prev_sessions: prev });
          continue;
        }
        if (cur > prev) { growing++; continue; }
        const a1 = acc(Number(r.cur_c) || 0, Number(r.cur_w) || 0);
        const a0 = acc(Number(r.prev_c) || 0, Number(r.prev_w) || 0);
        if (a1 >= 0 && a0 >= 0 && (a1 - a0) < 5) stuck++;
        else if (cur > 0) stuck++;
      }
      gone.sort((x, y) => y.idle_days - x.idle_days);
      out.students = { growing, stuck, gone: gone.length, gone_list: gone.slice(0, 30) };
    } catch { out.notes.push('students_failed'); out.students = { growing: 0, stuck: 0, gone: 0, gone_list: [] }; }

    /* ── ⑤ 발음 분포 ─────────────────────────────────────────────────────
     *  voice_coaching(Azure 발음평가) + game_progress.pron_best 를 함께 본다.
     *  ⚠️ 실측(2026-08-08): voice_coaching 380건 중 278건이 uid='guest' 라 학생에게 못 붙는다.
     *     그래서 «귀속 불가» 건수를 숨기지 않고 같이 내보낸다 — 숫자를 믿을지 판단하려면 필요하다. */
    try {
      const rs: any = await env.DB.prepare(
        `SELECT
            SUM(CASE WHEN pronunciation_score >= 90 THEN 1 ELSE 0 END) a,
            SUM(CASE WHEN pronunciation_score >= 75 AND pronunciation_score < 90 THEN 1 ELSE 0 END) b,
            SUM(CASE WHEN pronunciation_score >= 60 AND pronunciation_score < 75 THEN 1 ELSE 0 END) c,
            SUM(CASE WHEN pronunciation_score <  60 THEN 1 ELSE 0 END) d,
            SUM(CASE WHEN student_uid = 'guest' OR student_uid IS NULL OR student_uid = '' THEN 1 ELSE 0 END) anon,
            COUNT(*) total
           FROM voice_coaching WHERE created_at >= ?`
      ).bind(since).first();
      out.pron = {
        excellent: Number(rs?.a) || 0, good: Number(rs?.b) || 0,
        fair: Number(rs?.c) || 0, weak: Number(rs?.d) || 0,
        unattributed: Number(rs?.anon) || 0, total: Number(rs?.total) || 0,
      };
    } catch { out.notes.push('pron_failed'); out.pron = { excellent: 0, good: 0, fair: 0, weak: 0, unattributed: 0, total: 0 }; }

    const bodyStr = JSON.stringify(out);
    try { await env.SESSION_STATE?.put(cacheKey, bodyStr, { expirationTtl: 600 }); } catch { /* 캐시 실패는 무시 */ }
    return new Response(bodyStr, { status: 200, headers: { ...JSONH, 'X-Cache': 'miss' } });
  } catch (e: any) {
    // 분석 화면 때문에 업무가 멈추면 안 된다 — 빈 구조를 주고 화면은 «데이터 없음» 을 그린다.
    console.warn('[game-insights] failed:', e?.message || e);
    return json({ ok: false, error: String(e?.message || e), games: [], totals: {}, weak: [], students: {}, pron: {} });
  }
}
