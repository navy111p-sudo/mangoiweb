/** Authenticated teacher connection receipts. Separate from payroll/attendance judgments.
 * No client-provided name, role, account ID or clock is used to identify a teacher.
 * A recent receipt confirms signaling-page activity, not two-way video delivery.
 */
import { getAdminActor } from './auth-admin';
import { selectInChunks } from './d1-chunk';

export const LIVE_RECEIPT_MS = 75000; // speaking-time normally arrives every 30 seconds
const ready = new WeakMap<object, Promise<void>>();
export async function ensureTeacherRoomPresence(db: any): Promise<void> {
  let task = ready.get(db);
  if (!task) {
    task = (async () => {
      // D1 exec() runs each line as its own statement, so a multi-line CREATE never ran
      // (the table was absent in production until 2026-10-28). One prepare() per statement.
      await db.prepare(`CREATE TABLE IF NOT EXISTS teacher_room_presence (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_uid TEXT NOT NULL,
        peer_id TEXT NOT NULL, room_id TEXT NOT NULL, host TEXT NOT NULL,
        joined_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, left_at INTEGER,
        entry_kind TEXT NOT NULL DEFAULT 'join')`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS idx_teacher_room_presence_account_seen
        ON teacher_room_presence(account_uid, last_seen_at)`).run();
    })();
    ready.set(db, task);
    task.catch(() => { ready.delete(db); });
  }
  await task;
}

export async function recordTeacherRoomPresence(
  env: any, request: Request, body: any, event: 'join' | 'heartbeat' | 'leave',
): Promise<void> {
  try {
    const room = String(body?.room_id || '');
    const peer = String(body?.user_id || '');
    if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(room) || !/^[A-Za-z0-9_.:@-]{1,128}$/.test(peer)) return;
    const actor = await getAdminActor(request, env);
    if (!actor.ok || !actor.isTeacher || !actor.username) return;
    const db = env.DB;
    await ensureTeacherRoomPresence(db);
    const now = Date.now();
    const host = new URL(request.url).hostname;
    const old = await db.prepare(`SELECT id, left_at FROM teacher_room_presence
      WHERE account_uid=? AND peer_id=? AND room_id=? AND host=?
      ORDER BY id DESC LIMIT 1`).bind(actor.username, peer, room, host).first();
    if (event === 'leave') {
      if (old && old.left_at == null) await db.prepare(`UPDATE teacher_room_presence
        SET left_at=?, last_seen_at=? WHERE id=? AND left_at IS NULL`).bind(now, now, old.id).run();
    } else if (event === 'join' || !old) {
      await db.prepare(`INSERT INTO teacher_room_presence
        (account_uid,peer_id,room_id,host,joined_at,last_seen_at,entry_kind)
        VALUES (?,?,?,?,?,?,?)`).bind(actor.username, peer, room, host, now, now, event === 'join' ? 'join' : 'heartbeat').run();
    } else if (old.left_at == null) {
      await db.prepare(`UPDATE teacher_room_presence SET last_seen_at=?
        WHERE id=? AND left_at IS NULL`).bind(now, old.id).run();
    }
    // A delayed heartbeat must never reopen a session that has explicitly left.
  } catch (e: any) { console.warn('[teacher-room-presence] receipt:', e?.message); }
}

export function receiptState(row: any, now: number): 'recent' | 'left' | 'stale' {
  if (row.left_at != null) return 'left';
  const age = now - Number(row.last_seen_at);
  return Number.isFinite(age) && age >= 0 && age <= LIVE_RECEIPT_MS ? 'recent' : 'stale';
}

export function teacherRoomSummary(accounts: string[], rows: any[], room: string, now: number, date: string) {
  const sessions = rows.filter(r => accounts.includes(String(r.account_uid)))
    .map(r => ({ account_uid: r.account_uid, room_id: r.room_id, host: r.host,
      joined_at: r.joined_at, last_seen_at: r.last_seen_at, left_at: r.left_at,
      entry_kind: r.entry_kind, state: receiptState(r, now) }))
    .sort((a, b) => Number(b.last_seen_at) - Number(a.last_seen_at));
  const currentDay = new Date(now + 9 * 3600000).toISOString().slice(0, 10) === date;
  const recent = currentDay ? sessions.filter(r => r.state === 'recent') : [];
  const same = recent.filter(r => r.room_id === room);
  const elsewhere = recent.filter(r => r.room_id !== room);
  const state = !accounts.length ? 'unlinked'
    : !currentDay ? 'history'
    : same.length && elsewhere.length ? 'multiple'
    : same.length ? 'same'
    : elsewhere.length ? 'other'
    : sessions.some(r => r.state === 'stale') ? 'stale'
    : sessions.length ? 'left' : 'none';
  return { state, accounts, expected_room: room, checked_at: now, date,
    valid_until: recent.length ? Math.min(...recent.map(r => Number(r.last_seen_at) + LIVE_RECEIPT_MS)) : null,
    sessions, truncated: sessions.length > 30 };
}

/** Only explicit evals:true (HQ admin contact scope) may receive cross-room details.
 * Teacher/branch callers of enrichClassesToday do not request this field.
 * Link accounts via the existing explicit account-to-teacher table, never names.
 */
export async function enrichTeacherRoomPresence(env: any, sessions: any[], date: string, now: number) {
  for (const s of sessions) s.teacher_connection = { state: 'unavailable', checked_at: now };
  try {
    const db = env.DB;
    await ensureTeacherRoomPresence(db);
    const ids = Array.from(new Set(sessions.map(s => String(s.teacher_id || '')).filter(Boolean)));
    const links = ids.length ? await selectInChunks<any>(db, ids, ph =>
      `SELECT username, teacher_id FROM teacher_account_links WHERE CAST(teacher_id AS TEXT) IN (${ph})`) : [];
    const accountsByTeacher = new Map<string, string[]>();
    for (const l of links) {
      const id = String(l.teacher_id); const uid = String(l.username || '').trim();
      if (!uid) continue;
      const list = accountsByTeacher.get(id) || [];
      if (!list.includes(uid)) list.push(uid);
      accountsByTeacher.set(id, list);
    }
    const accounts = Array.from(new Set(links.map(l => String(l.username || '').trim()).filter(Boolean)));
    const start = Date.parse(date + 'T00:00:00+09:00');
    if (!Number.isFinite(start)) throw new Error('invalid_date');
    // Include a previous-day session which continued after midnight.
    const rows = accounts.length ? await selectInChunks<any>(db, accounts, ph =>
      `SELECT account_uid, room_id, host, joined_at, last_seen_at, left_at, entry_kind
       FROM teacher_room_presence WHERE account_uid IN (${ph})
       AND joined_at < ${start + 86400000} AND last_seen_at >= ${start}
       ORDER BY last_seen_at DESC`) : [];
    for (const s of sessions) {
      if (s.source === 'cafe24' || s.source === 'lms' || /^c24-/.test(String(s.room_id || ''))) {
        s.teacher_connection = { state: 'external', checked_at: now }; continue;
      }
      const summary = teacherRoomSummary(accountsByTeacher.get(String(s.teacher_id || '')) || [], rows, String(s.room_id || ''), now, date);
      // More than 30 receipts remain counted in the classification, but never overfill the popup.
      s.teacher_connection = { ...summary, sessions: summary.sessions.slice(0, 30) };
    }
  } catch (e: any) { console.warn('[teacher-room-presence] lookup:', e?.message); }
}
