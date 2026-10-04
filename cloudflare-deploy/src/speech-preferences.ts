import { authUidFromRequest } from './auth-token';

// Account-owned, durable preferences. Never accept a client-supplied owner id.
export async function handleSpeechPreferences(request: Request, env: any): Promise<Response> {
  const reply = (data: any, status = 200) => new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
  if (!['GET', 'PUT'].includes(request.method)) return reply({ ok: false }, 405);
  const uid = await authUidFromRequest(request, new URL(request.url), env);
  if (!uid || /^guest[_:-]/i.test(uid)) return reply({ ok: false }, 401);
  const app = new URL(request.url).searchParams.get('app');
  if (app !== 'warmup' && app !== 'friend') return reply({ ok: false }, 400);
  let level: number | undefined;
  if (request.method === 'PUT') {
    try { level = (await request.json() as any).level; } catch { return reply({ ok: false }, 400); }
    if (!Number.isInteger(level) || level! < 1 || level! > 5) return reply({ ok: false }, 400);
  }
  try {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS student_speech_preferences (uid TEXT NOT NULL, app TEXT NOT NULL, level INTEGER NOT NULL CHECK(level BETWEEN 1 AND 5), PRIMARY KEY(uid, app))');
    const db = env.DB.withSession ? env.DB.withSession('first-primary') : env.DB;
    const owner = uid.toLowerCase();
    if (request.method === 'PUT') {
      await db.prepare('INSERT INTO student_speech_preferences (uid, app, level) VALUES (?, ?, ?) ON CONFLICT(uid, app) DO UPDATE SET level=excluded.level').bind(owner, app, level).run();
      return reply({ ok: true, level });
    }
    const row = await db.prepare('SELECT level FROM student_speech_preferences WHERE uid=? AND app=?').bind(owner, app).first();
    return reply({ ok: true, level: row?.level ?? null });
  } catch {
    return reply({ ok: false, error: 'preference_unavailable' }, 503);
  }
}
