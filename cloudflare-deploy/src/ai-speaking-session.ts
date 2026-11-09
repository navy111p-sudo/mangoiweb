import type { MangoEnv } from './api-mango';
import { authUidFromRequest } from './auth-token';
import { json } from './api-util';
import { evaluateSpeaking } from './ai-speaking-progress';
import { checkAndAwardBadges } from './api-games-badges';
import { readSpeakingVocabularyWeek } from './ai-speaking-vocabulary';

const MAX_TURNS = 100;

async function ensure(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_speaking_sessions (
    id TEXT PRIMARY KEY, student_uid TEXT NOT NULL, app TEXT NOT NULL,
    source_id TEXT, status TEXT NOT NULL DEFAULT 'open', turns_json TEXT NOT NULL DEFAULT '[]', capture_limited INTEGER NOT NULL DEFAULT 0,
    result_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
  )`).run();
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_ai_speaking_student_finished
    ON ai_speaking_sessions(student_uid,status,finished_at)`).run();
}

export async function clearSpeakingSessions(env: MangoEnv, uid: string) {
  await ensure(env.DB);
  await env.DB.prepare(`DELETE FROM ai_speaking_sessions WHERE student_uid=? AND app='friend'`).bind(uid).run();
}

/** Only the conversation handlers call this, after producing a real reply. */
export async function recordSpeakingTurn(request: Request, env: MangoEnv, body: any,
  turn: { app: 'friend' | 'warmup'; student: string; assistant: string; correction?: string }) {
  if (!body.progress_session || body.kickoff) return false;
  try {
    const uid = await authUidFromRequest(request, new URL(request.url), env, body);
    if (!uid || /^(guest|anon)/i.test(uid)) return false;
    if (typeof body.progress_turn !== 'string' || (!body.progress_turn || body.progress_turn.length > 100)) return false;
    const item = { id: body.progress_turn.toLowerCase(), student: turn.student.slice(0, 4000), assistant: turn.assistant.slice(0, 4000),
      correction: String(turn.correction || '').slice(0, 1000), at: Date.now() };   // at = 자동 마감의 «마지막 활동» 근거
    const saved = await env.DB.prepare(`UPDATE ai_speaking_sessions SET
      capture_limited=CASE WHEN json_array_length(turns_json)>=? OR ? THEN 1 ELSE capture_limited END,
      turns_json=CASE WHEN json_array_length(turns_json)<? THEN json_insert(turns_json,'$[#]',json(?)) ELSE turns_json END
      WHERE id=? AND student_uid=? AND app=? AND status='open'
      AND (app='friend' OR source_id=?)
      AND NOT EXISTS (SELECT 1 FROM json_each(turns_json) WHERE json_extract(value,'$.id')=?)`)
      .bind(MAX_TURNS, turn.student.length > 4000 ? 1 : 0, MAX_TURNS, JSON.stringify(item), body.progress_session, uid, turn.app, body.session_id || '', item.id).run();
    if ((saved as {success?:boolean}).success === false) return false;
    if (saved.meta?.changes === 1) return true;
    // A concurrent retry may have recorded the same turn before this request.
    const existing = await env.DB.prepare(`SELECT turns_json FROM ai_speaking_sessions
      WHERE id=? AND student_uid=? AND app=? AND status='open' AND (app='friend' OR source_id=?)`)
      .bind(body.progress_session,uid,turn.app,body.session_id || '').first<{turns_json:string}>();
    return !!existing && JSON.parse(existing.turns_json).some((entry:any)=>entry.id===item.id && entry.student===item.student);

  } catch (error) {
    console.warn('[speaking-progress] turn capture unavailable');
    return false;
  }
}

export function speakingWords(text: string): string[] {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
}

/** Bound observed vocabulary without rejecting an otherwise completed session. */
function wordEvidence(words: string[]) {
  const unique = new Set<string>();
  let limited = false;
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (word.length > 200 || (!unique.has(normalized) && unique.size >= 10000)) {
      limited = true;
      continue;
    }
    unique.add(normalized);
  }
  return { words: [...unique], limited };
}

/** Words and turn counts the server itself recorded — the same shape for a pressed finish and an auto-close. */
function sessionObservations(id: string, uid: string, turns: any[], capturedLimited: boolean) {
  const words = wordEvidence(turns.flatMap((turn: any) => speakingWords(turn.student)));
  const review = wordEvidence(turns.flatMap((turn: any) => {
    const original = new Set(speakingWords(turn.student).map(word => word.toLowerCase()));
    return speakingWords(turn.correction).filter(word => !original.has(word.toLowerCase()));
  }));
  const skills: Record<string, number> = {};
  return { ...evaluateSpeaking({ lessonId: id, studentId: uid, finishedNormally: true,
    evaluatedAt: new Date().toISOString(), skills, spokenWords: words.words, correctedWords: review.words,
    // Turn count is observed; completed sentence count has not been measured.
    sentencesCompleted: 0, evaluationSource: 'server-confirmed-session-observations' }),
    evaluationStatus: 'unavailable', evaluationReason: 'validated_evaluator_unavailable', evaluationSource:'server-confirmed-session-observations',
    evaluatedSkills: Object.keys(skills).length, recordedTurns: turns.length,
    captureLimited: capturedLimited || words.limited || review.limited, sentenceCountStatus: 'unmeasured' };
}

const AUTO_CLOSE_MAX = 5;
const AUTO_CLOSE_IDLE_MS = 10 * 60 * 1000;
/** 🔒 자동 마감 (2026-11-09 사장님 결정) — «끝내기» 없이 새로고침·이동·닫기로 떠난 대화는
 *  같은 학생이 새 대화를 «시작» 할 때 닫는다. 결과 화면은 안 띄우고 단어·성장 기록(status='complete')에만 넣는다.
 *  · 마지막 활동(시작 시각·마지막 턴 시각 중 늦은 것) 뒤 10분이 지난 것만 닫는다 — 다른 탭에서 아직 이어 가는 대화를
 *    닫으면 그 탭의 다음 턴이 기록되지 않는다. 그래서 막 떠난 대화는 그다음 시작 때 닫힌다(오래된 것부터).
 *    (이 변경 전에 기록된 턴에는 시각이 없어 시작 시각만 본다.)
 *  · 0턴 대화는 건드리지 않는다 — 셀 낱말이 없고, 다른 탭이 막 시작한 대화일 수 있다.
 *  · 보상(포인트·배지)은 셈하지 않는다 — 모르면 null(지어낸 0 금지). 배지 검사도 안 돈다(새 세션 시작을 늦추지 않게).
 *  · 그 사이 다른 탭이 턴을 더했으면(turns_json 이 달라짐) 건드리지 않는다 — 다음 시작 때 다시 본다.
 *  · 실패해도 던지지 않는다 — 새 대화 시작을 막지 않는다.
 *  EN: a session left without «finish» is closed when the same student starts the next one. Never throws. */
async function closeAbandoned(env: MangoEnv, uid: string, keepId: string) {
  try {
    const idleBefore = Date.now() - AUTO_CLOSE_IDLE_MS;
    const rows = await env.DB.prepare(`SELECT id,turns_json,capture_limited,started_at FROM ai_speaking_sessions
      WHERE student_uid=? AND status='open' AND id<>? AND started_at<? AND turns_json<>'[]' ORDER BY started_at ASC LIMIT ?`)
      .bind(uid, keepId, idleBefore, AUTO_CLOSE_MAX).all();
    for (const row of (rows.results || []) as any[]) {
      try {   // 한 줄이 깨져도 나머지는 닫는다
        const now = Date.now();
        const turns = JSON.parse(row.turns_json);
        const lastAt = Math.max(Number(row.started_at) || 0, ...(Array.isArray(turns) ? turns : []).map((t: any) => Number(t && t.at) || 0));
        if (lastAt >= idleBefore) continue;   // 아직 이어 가는 중일 수 있다
        if (!Array.isArray(turns) || !turns.length) continue;   // 말한 것이 없으면 셀 것도 없다 — 그대로 둔다
        const result = { ...sessionObservations(row.id, uid, turns, !!row.capture_limited), closedBy: 'auto-next-session',
          rewards: { pointsBalance: null, gemsBalance: null, pointsEarned: null, badges: null } };
        await env.DB.prepare(`UPDATE ai_speaking_sessions SET status='complete',result_json=?,finished_at=?,capture_limited=?
          WHERE id=? AND student_uid=? AND status='open' AND turns_json=?`)
          .bind(JSON.stringify(result), now, result.captureLimited ? 1 : 0, row.id, uid, row.turns_json).run();
      } catch { console.warn('[speaking-progress] auto-close row skipped'); }
    }
  } catch { console.warn('[speaking-progress] auto-close unavailable'); }
}

/** A model's numeric output is not a calibrated measurement contract. */
export function speakingTextScores(_raw: unknown): Record<string, number> {
  throw new Error('unvalidated_evaluator');
}

async function wallet(env: MangoEnv, uid: string, app: string, id: string, sourceId: string, startedAt: number) {
  const rewards: any = { pointsBalance: null, gemsBalance: null, pointsEarned: null, badges: null };
  // A missing legacy table or failed lookup means unknown, never a made-up zero.
  try {
    const row = await env.DB.prepare(`SELECT balance FROM student_points WHERE user_id=?`).bind(uid).first<any>();
    rewards.pointsBalance = row && Number.isSafeInteger(row.balance) ? row.balance : null;
  } catch {}
  try {
    const row = await env.DB.prepare(`SELECT gems FROM student_streaks WHERE student_uid=?`).bind(uid).first<any>();
    rewards.gemsBalance = row && Number.isSafeInteger(row.gems) ? row.gems : null;
  } catch {}
  try {
    const rules = app === 'friend' ? "rule_code IN ('ai_friend_chat','ai_friend_word','ai_friend_voice','ai_friend_listen')" : "rule_code='warmup_talk'";
    const key = app === 'friend' ? '$.speaking_session' : '$.session_id';
    const row = await env.DB.prepare(`SELECT COALESCE(SUM(amount),0) AS earned FROM point_transactions
      WHERE user_id=? AND ${rules} AND created_at>=?
      AND CASE WHEN json_valid(meta) THEN json_extract(meta,?) END=?`)
      .bind(uid, startedAt, key, app === 'friend' ? id : sourceId).first<any>();
    rewards.pointsEarned = row && Number.isSafeInteger(row.earned) ? row.earned : null;
  } catch {}
  try {
    const rows = await env.DB.prepare(`SELECT badge_code FROM student_badges WHERE user_id=? ORDER BY awarded_at DESC`).bind(uid).all();
    if ((rows as { success?: boolean }).success !== false && Array.isArray(rows.results)) rewards.badges = rows.results.map((row: any) => row.badge_code);
  } catch {}
  return rewards;
}

function measuredOnlyResult(result: any) {
  return {...result,rewards:result.rewardAttributionVersion===1?result.rewards:{...result.rewards,pointsEarned:null},skills:{},score:null,evaluationStatus:'unavailable',
    evaluationReason:'validated_evaluator_unavailable',evaluatedSkills:0,
    evaluationSource:'server-confirmed-session-observations'};
}

export async function handleSpeakingSession(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  if (url.pathname !== '/api/ai/speaking-progress') return null;
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const body: any = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ ok: false, error: 'invalid_request' }, 400);
  const uid = await authUidFromRequest(request, url, env, body);
  if (!uid || /^(guest|anon)/i.test(uid)) return json({ ok: false, error: 'auth_required' }, 401);
  try {
    await ensure(env.DB);
    if (body.action === 'history') return json({ ok: true, weeklyVocabulary: await readSpeakingVocabularyWeek(env.DB, uid) });
    if (body.action === 'start') {
      if (!['friend', 'warmup'].includes(body.app)) return json({ ok: false, error: 'invalid_app' }, 400);
      if (body.app === 'warmup' && (typeof body.sourceId !== 'string' || !body.sourceId || body.sourceId.length > 200))
        return json({ ok: false, error: 'invalid_session' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO ai_speaking_sessions (id,student_uid,app,source_id,started_at) VALUES (?,?,?,?,?)`)
        .bind(id, uid, body.app, body.app === 'warmup' ? body.sourceId : null, Date.now()).run();
      await closeAbandoned(env, uid, id);
      return json({ ok: true, sessionId: id });
    }
    if (body.action !== 'finish' || typeof body.sessionId !== 'string' || body.sessionId.length > 100)
      return json({ ok: false, error: 'invalid_request' }, 400);
    const row = await env.DB.prepare(`SELECT * FROM ai_speaking_sessions WHERE id=? AND student_uid=?`)
      .bind(body.sessionId, uid).first<any>();
    if (!row) return json({ ok: false, error: 'session_not_found' }, 404);
    if (row.status === 'complete') {
      const result = measuredOnlyResult(JSON.parse(row.result_json));
      // A confirmed turn can finish its atomic payout after the result snapshot.
      // Refresh only attributable results; legacy unknown attribution stays unknown.
      if (result.rewardAttributionVersion === 1) {
        const current = await wallet(env, uid, row.app, row.id, row.source_id, row.started_at);
        result.rewards = { ...result.rewards, pointsEarned: current.pointsEarned, pointsBalance: current.pointsBalance };
      }
      return json({ ok: true, result: { ...result, weeklyVocabulary: await readSpeakingVocabularyWeek(env.DB, uid) } });
    }
    let turns = JSON.parse(row.turns_json);
    if (!turns.length) return json({ ok: false, error: 'no_completed_turns' }, 409);
    const claimAt = Date.now();
    const claim = await env.DB.prepare(`UPDATE ai_speaking_sessions SET status='evaluating',finished_at=?
      WHERE id=? AND student_uid=? AND (status='open' OR (status='evaluating' AND finished_at<?))`)
      .bind(claimAt, row.id, uid, claimAt - 30000).run();
    if (!claim.meta?.changes) return json({ ok: false, error: 'evaluation_pending' }, 409);
    const captured = await env.DB.prepare(`SELECT turns_json,capture_limited FROM ai_speaking_sessions WHERE id=? AND student_uid=? AND finished_at=?`)
      .bind(row.id, uid, claimAt).first<any>();
    if (!captured) throw new Error('session_changed');
    turns = JSON.parse(captured.turns_json);
    // Preserve confirmed words/rewards; no unvalidated model scores or paid inference.
    try { await checkAndAwardBadges(env, uid); }
    catch { console.warn('[speaking-progress] badge check unavailable'); }
    const result = { ...sessionObservations(row.id, uid, turns, !!captured.capture_limited),
      rewardAttributionVersion:1, rewards: await wallet(env, uid, row.app, row.id, row.source_id, row.started_at) };
    const saved = await env.DB.prepare(`UPDATE ai_speaking_sessions SET status='complete',result_json=?,finished_at=?,capture_limited=?
      WHERE id=? AND student_uid=? AND status='evaluating' AND finished_at=?`)
      .bind(JSON.stringify(result), Date.now(), result.captureLimited ? 1 : 0, row.id, uid, claimAt).run();
    if (!saved.meta?.changes) throw new Error('result_not_saved');
    return json({ ok: true, result: { ...result, weeklyVocabulary: await readSpeakingVocabularyWeek(env.DB, uid) } });
  } catch {
    return json({ ok: false, error: 'progress_unavailable' }, 503);
  }
}
