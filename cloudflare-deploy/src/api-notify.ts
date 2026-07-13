// ═══════════════════════════════════════════════════════════════════════
// 🔔 api-notify.ts — 알림 큐 공용 (api-mango.ts 에서 이동, 2026-07-14 8차)
//   notification_queue 적재 담당. 소비(발송)는 기존 cron/라우트가 수행.
// ═══════════════════════════════════════════════════════════════════════

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
