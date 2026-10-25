import { livePermission, handleEleaderLive } from './eleader-live';
import type { EleaderEngines } from './eleader-engines';
import { verifyUidToken } from './auth-token';
import { getAdminActor } from './auth-admin';
import type { MangoEnv } from './api-mango';
import { ELEADER_UNITS } from './eleader-pack';

type PilotEnv = MangoEnv & { ELEADER_PILOT?: string };
const prefix = '/api/ai/eleader/';
function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('json_required');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('body_required');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > 4096) { await reader.cancel(); throw new Error('body_too_large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('invalid_body');
  return data;
}

/** Default off. No AI, speech upload, recording, schema creation or membership provisioning. */
export async function handleEleaderApi(request: Request, url: URL, env: PilotEnv, engines?: EleaderEngines): Promise<Response | null> {
  if (!url.pathname.startsWith(prefix)) return null;
  if (env.ELEADER_PILOT !== 'on') return reply({ error: 'pilot_disabled' }, 404);
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405);
  if (request.method === 'POST' && request.headers.get('Origin') !== url.origin) return reply({ error: 'same_origin_required' }, 403);
  const academy = url.searchParams.get('academy') || '';
  const action = url.pathname.slice(prefix.length);
  if (action !== 'entry' && !/^[a-z0-9-]{1,64}$/.test(academy)) return reply({ error: 'invalid_academy' }, 400);
  try {
    // A supplied student identity never falls back to an administrator cookie.
    const authorization = request.headers.get('Authorization');
    let subject = '', kind: 'student' | 'admin' = 'student';
    if (authorization !== null) {
      if (!authorization.startsWith('Bearer ')) return reply({ error: 'login_required' }, 401);
      subject = await verifyUidToken(authorization.slice(7), env) || '';
      if (/^guest/i.test(subject)) subject = '';
    } else {
      const actor = await getAdminActor(request, env);
      if (actor.ok && !actor.isTeacher) { subject = actor.username; kind = 'admin'; }
    }
    if (!subject) return reply({ error: 'login_required' }, 401);
    if (request.headers.has('X-Eleader-Subject') && request.headers.get('X-Eleader-Subject') !== subject) return reply({ error: 'identity_changed' }, 409);
    // Discover only explicitly provisioned memberships. Never infer tenant from a
    // client display name, URL academy, username prefix or an ERP label match.
    if (action === 'entry') {
      if (request.method !== 'GET') return reply({error:'method_not_allowed'},405);
      const rows = await env.DB.prepare(`SELECT a.id, a.name FROM eleader_members m JOIN eleader_academies a ON a.id=m.academy_id WHERE m.kind=? AND m.subject=? AND m.role=? AND a.enabled=1 ORDER BY a.id`).bind(kind,subject,kind==='student'?'student':'director').all<{id:string;name:string}>();
      return reply({subject,entries:rows.results.filter(a=>/^[a-z0-9-]{1,64}$/.test(a.id)).map(a=>({academy:a.id,name:a.name,role:kind==='student'?'student':'director',href:'/eleader-pilot.html?academy='+encodeURIComponent(a.id)+(kind==='admin'?'&view=director':'')}))});
    }
    const member = await env.DB.prepare(`SELECT m.role, a.name, a.enabled FROM eleader_members m JOIN eleader_academies a ON a.id=m.academy_id WHERE m.academy_id=? AND m.kind=? AND m.subject=?`).bind(academy, kind, subject).first<{role: string; name: string; enabled: number}>();
    if (!member || (kind === 'student' ? member.role !== 'student' : member.role !== 'director')) return reply({ error: 'academy_access_denied' }, 403);
    const director = kind === 'admin';
    if (!director && !member.enabled) return reply({ error: 'academy_paused' }, 403);
    if (request.method === 'GET' && action === 'state') {
      const assignments = await env.DB.prepare(`SELECT student_uid, unit_id FROM eleader_assignments WHERE academy_id=? AND (?=1 OR student_uid=?) ORDER BY student_uid,unit_id`).bind(academy, director ? 1 : 0, subject).all();
      const progress = await env.DB.prepare(`SELECT student_uid, unit_id, question_id, completed_at FROM eleader_progress WHERE academy_id=? AND (?=1 OR student_uid=?) ORDER BY student_uid,unit_id,question_id`).bind(academy, director ? 1 : 0, subject).all();
      const students = director ? (await env.DB.prepare(`SELECT subject FROM eleader_members WHERE academy_id=? AND kind='student' AND role='student' ORDER BY subject`).bind(academy).all()).results : [];
      const live = director ? {allowed:false,reason:'student_required',policy:'',notice:''} : await livePermission(env,academy,subject);
      return reply({ live, academy, name: member.name, enabled: !!member.enabled, role: member.role, subject, units: ELEADER_UNITS, assignments: assignments.results, progress: progress.results, students, mode: live.allowed ? 'engine-enabled' : 'guided-pilot', external_processing_enabled: live.allowed, recording_stored: false });
    }
    if (request.method !== 'POST') return reply({ error: 'not_found' }, 404);
    if (['chat','transcribe','tts'].includes(action)) {
      if (director) return reply({error:'student_required'},403);
      return await handleEleaderLive(request,url,env,academy,subject,engines);
    }
    let b: Record<string, unknown>;
    try { b = await body(request); } catch { return reply({ error: 'invalid_json_body' }, 400); }
    if (action === 'settings' || action === 'assign') {
      if (!director) return reply({ error: 'director_required' }, 403);
      if (action === 'settings') {
        if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 60 || typeof b.enabled !== 'boolean') return reply({ error: 'invalid_settings' }, 400);
        await env.DB.prepare('UPDATE eleader_academies SET name=?, enabled=? WHERE id=?').bind(b.name.trim(), b.enabled ? 1 : 0, academy).run();
      } else {
        if (typeof b.student !== 'string' || typeof b.assigned !== 'boolean' || !ELEADER_UNITS.some(u => u.id === b.unit)) return reply({ error: 'invalid_assignment' }, 400);
        const student = await env.DB.prepare("SELECT subject FROM eleader_members WHERE academy_id=? AND kind='student' AND role='student' AND subject=?").bind(academy, b.student).first();
        if (!student) return reply({ error: 'student_not_in_academy' }, 403);
        if (b.assigned) await env.DB.prepare('INSERT OR IGNORE INTO eleader_assignments (academy_id,student_uid,unit_id) VALUES (?,?,?)').bind(academy,b.student,b.unit).run();
        else await env.DB.prepare('DELETE FROM eleader_assignments WHERE academy_id=? AND student_uid=? AND unit_id=?').bind(academy,b.student,b.unit).run();
      }
      return reply({ ok: true });
    }
    if (action === 'complete') {
      if (director) return reply({ error: 'student_required' }, 403);
      const unit = ELEADER_UNITS.find(u => u.id === b.unit);
      if (!unit || !unit.questions.some(q => q.id === b.question)) return reply({ error: 'invalid_question' }, 400);
      // Authorization and insertion in one statement; unique key makes retries idempotent.
      await env.DB.prepare(`INSERT OR IGNORE INTO eleader_progress (academy_id,student_uid,unit_id,question_id,completed_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM eleader_assignments WHERE academy_id=? AND student_uid=? AND unit_id=?) AND EXISTS (SELECT 1 FROM eleader_academies WHERE id=? AND enabled=1) AND EXISTS (SELECT 1 FROM eleader_members WHERE academy_id=? AND kind='student' AND subject=? AND role='student')`).bind(academy,subject,unit.id,b.question,Date.now(),academy,subject,unit.id,academy,academy,subject).run();
      const assigned = await env.DB.prepare('SELECT unit_id FROM eleader_assignments WHERE academy_id=? AND student_uid=? AND unit_id=?').bind(academy,subject,unit.id).first();
      if (!assigned) return reply({ error: 'unit_not_assigned' }, 403);
      return reply({ ok: true });
    }
    return reply({ error: 'not_found' }, 404);
  } catch {
    // Fail closed on missing migration/binding; never expose DB details or student data.
    return reply({ error: 'pilot_unavailable' }, 503);
  }
}
