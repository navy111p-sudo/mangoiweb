// ═══════════════════════════════════════════════════════════════════════
// 🔔 api-notify.ts — 알림 큐 공용 (api-mango.ts 에서 이동, 2026-07-14 8차)
//   notification_queue 적재 담당. 소비(발송)는 기존 cron/라우트가 수행.
// ═══════════════════════════════════════════════════════════════════════
import { broadcastWebPush } from './web-push';

let _notifSchemaReady = false;
export async function ensureNotifSchema(env: { DB: D1Database }): Promise<void> {
  if (_notifSchemaReady) return;
  // exec() 는 multi-statement DDL 용. IF NOT EXISTS 로 멱등.
  await env.DB.exec([
    `CREATE TABLE IF NOT EXISTS notification_queue (`,
    `  id INTEGER PRIMARY KEY AUTOINCREMENT,`,
    `  type TEXT NOT NULL,`,
    `  title TEXT,`,
    `  body TEXT,`,
    `  meta TEXT,`,
    `  channel TEXT DEFAULT 'kakao_memo',`,
    `  status TEXT DEFAULT 'pending',`,
    `  created_at INTEGER NOT NULL,`,
    `  sent_at INTEGER,`,
    `  error TEXT`,
    `);`
  ].join(' '));
  await env.DB.exec(
    `CREATE INDEX IF NOT EXISTS idx_notif_status_created ON notification_queue(status, created_at);`
  );
  _notifSchemaReady = true;
}

/**
 * 운영 이벤트를 알림 큐에 적재.
 *   - 적재 자체가 실패해도 호출 측 핵심 동작(출석 INSERT 등)을 막지 않도록
 *     try/catch 로 감싸서 console.warn 만 남기고 무시.
 */
export async function enqueueNotification(
  env: { DB: D1Database },
  evt: { type: string; title: string; body: string; meta?: any; channel?: string }
): Promise<void> {
  try {
    await ensureNotifSchema(env);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO notification_queue (type, title, body, meta, channel, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`
    ).bind(
      evt.type,
      evt.title,
      evt.body,
      evt.meta ? JSON.stringify(evt.meta) : null,
      evt.channel || 'kakao_memo',
      now
    ).run();
  } catch (e: any) {
    console.warn('[notify] enqueue 실패 (무시하고 계속):', e?.message || e);
  }
}

  // 🛡️ Inline-define sendPushToUser at the very top of the handler so all
  // notification endpoints below can use it without TDZ ReferenceError.
  // (Was previously declared deep inside the function — caused runtime crash
  // on /api/notify/lesson-started + lesson-ended + payment-success paths.)
const ensurePushTables_top = async (env: any) => {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id, enabled)`); } catch {}
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
    try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_push_queue_ep ON push_queue(endpoint, fetched_at, queued_at DESC)`); } catch {}
  };
export const sendPushToUser = async (env: any, userId: string, title: string, body: string, targetUrl: string = '/', tag?: string): Promise<any> => {
    try {
      await ensurePushTables_top(env);
      if (!userId) return { ok: true, sent: 0, total: 0, msg: 'no_user_id' };
      const rs = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(userId).all();
      const subs = (rs.results || []) as any[];
      if (!subs.length) return { ok: true, sent: 0, total: 0, msg: 'no_subscriptions' };
      const now = Date.now();
      const T = (title || '망고아이 알림').slice(0, 100);
      const B = (body || '').slice(0, 300);
      const U = targetUrl || '/';
      const TAG = tag || ('mangoi-' + now);
      for (const s of subs) {
        await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(s.endpoint, T, B, U, '/img/icon-192.png', '/img/icon-192.png', TAG, now).run();
      }
      const result = await broadcastWebPush(subs.map(s => s.endpoint), env as any);
      for (const ep of result.expired) {
        await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), ep).run();
      }
      return { ok: true, sent: result.sent, fail: result.failed, total: subs.length, mode: result.mode };
    } catch (e: any) {
      console.warn('[sendPushToUser] fail:', e?.message);
      return { ok: false, error: e?.message };
    }
  };
