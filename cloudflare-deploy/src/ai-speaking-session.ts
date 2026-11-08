import type { MangoEnv } from './api-mango';
import { authUidFromRequest } from './auth-token';
import { json } from './api-util';
import { evaluateSpeaking } from './ai-speaking-progress';
import { checkAndAwardBadges } from './api-games-badges';

const MAX_TURNS = 100;

async function ensure(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_speaking_sessions (
    id TEXT PRIMARY KEY, student_uid TEXT NOT NULL, app TEXT NOT NULL,
    source_id TEXT, status TEXT NOT NULL DEFAULT 'open', turns_json TEXT NOT NULL DEFAULT '[]', capture_limited INTEGER NOT NULL DEFAULT 0,
    result_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
  )`).run();
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
      correction: String(turn.correction || '').slice(0, 1000) };
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
    if (body.action === 'start') {
      if (!['friend', 'warmup'].includes(body.app)) return json({ ok: false, error: 'invalid_app' }, 400);
      if (body.app === 'warmup' && (typeof body.sourceId !== 'string' || !body.sourceId || body.sourceId.length > 200))
        return json({ ok: false, error: 'invalid_session' }, 400);
      const id = crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO ai_speaking_sessions (id,student_uid,app,source_id,started_at) VALUES (?,?,?,?,?)`)
        .bind(id, uid, body.app, body.app === 'warmup' ? body.sourceId : null, Date.now()).run();
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
        result.rewards = { ...result.rewards, pointsEarned: current.pointsEarned };
      }
      return json({ ok: true, result });
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
    const words = turns.flatMap((turn: any) => speakingWords(turn.student));
    const review = turns.flatMap((turn: any) => {
      const original = new Set(speakingWords(turn.student).map(word => word.toLowerCase()));
      return speakingWords(turn.correction).filter(word => !original.has(word.toLowerCase()));
    });
    // Preserve confirmed words/rewards; no unvalidated model scores or paid inference.
    const skills: Record<string, number> = {};
    const evaluationStatus = 'unavailable', evaluationReason = 'validated_evaluator_unavailable';
    try { await checkAndAwardBadges(env, uid); }
    catch { console.warn('[speaking-progress] badge check unavailable'); }
    const result = { ...evaluateSpeaking({ lessonId: row.id, studentId: uid, finishedNormally: true,
      evaluatedAt: new Date().toISOString(), skills, spokenWords: words, correctedWords: review,
      // Turn count is observed; completed sentence count has not been measured.
      sentencesCompleted: 0, evaluationSource: 'server-confirmed-session-observations' }),
      evaluationStatus, evaluationReason, evaluationSource:'server-confirmed-session-observations', evaluatedSkills: Object.keys(skills).length, recordedTurns: turns.length, captureLimited: !!captured.capture_limited, sentenceCountStatus: 'unmeasured',
      rewardAttributionVersion:1, rewards: await wallet(env, uid, row.app, row.id, row.source_id, row.started_at) };
    const saved = await env.DB.prepare(`UPDATE ai_speaking_sessions SET status='complete',result_json=?,finished_at=?
      WHERE id=? AND student_uid=? AND status='evaluating' AND finished_at=?`)
      .bind(JSON.stringify(result), Date.now(), row.id, uid, claimAt).run();
    if (!saved.meta?.changes) throw new Error('result_not_saved');
    return json({ ok: true, result });
  } catch {
    return json({ ok: false, error: 'progress_unavailable' }, 503);
  }
}
