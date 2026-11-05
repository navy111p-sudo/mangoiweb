/** Shared request-local audit writer. Failure policy is preserved. */
import type { MangoEnv } from './api-mango';

export function createAdminAuditWriter(env: Pick<MangoEnv, 'DB'>) {



    // 감사 로그 헬퍼
    const writeAudit = async (adminUid: string, action: string, opts: any = {}) => {
      try {
        await env.DB.prepare(
          `INSERT INTO admin_audit_logs (admin_uid, action, target_room, target_user, meta, ip, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(adminUid, action, opts.room || null, opts.user || null, opts.meta ? JSON.stringify(opts.meta) : null, opts.ip || null, Date.now()).run();
      } catch (e: any) { console.error('[audit]', e?.message); }
    };
  return writeAudit;
}
