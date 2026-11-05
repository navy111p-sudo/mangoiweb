/** subscriptions: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';
import { getScope } from './scope';
import { getAdminActor, FULL_ACCESS_ACCOUNTS } from './auth-admin';
import { chargeSubscriptionOnce, runAutoRenewChargeSweep } from './api-pay';

export async function handleAdminSubscriptionsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ════════════════════════════════════════════════════════════
    // 💳 정기결제 자동화 (Recurring Billing / Subscriptions)
    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/subscriptions' || path === '/api/admin/subscription/charge-now' || path === '/api/admin/subscription/cancel' || path === '/api/subscription/create' || path === '/api/admin/subscription/cron-check'
        || path === '/api/admin/billing/auto-renew-live' || path === '/api/admin/billing/auto-renew-due') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      } catch {}

      if (method === 'GET' && path === '/api/admin/subscriptions') {
        const st: any = await env.DB.prepare(
          `SELECT SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
                  SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled,
                  IFNULL(SUM(CASE WHEN status='active' THEN amount ELSE 0 END),0) AS month_revenue
           FROM subscriptions`
        ).first().catch(() => ({}));
        const lr = await env.DB.prepare(
          `SELECT id, user_id, student_name, plan, amount, status, next_billing_at FROM subscriptions ORDER BY (status='active') DESC, next_billing_at ASC LIMIT 500`
        ).all().catch(() => ({ results: [] }));
        return json({ ok: true, stats: { active: st?.active || 0, cancelled: st?.cancelled || 0, month_revenue: st?.month_revenue || 0 }, list: (lr as any).results || [] });
      }

      /* 🔴🔴 (2026-07-31) 이전 구현은 실제로 토스에 청구하지 않고 student_payments 에
         '성공'만 써넣는 가짜였다(카드가 진짜로 청구된 적이 한 번도 없음). 제보 #2-2/#3-2
         (자동연장 정식 개발) 작업 중 발견 — 이제 billing_key 로 실제 청구한다.
         카드 등록(billing_key 발급)은 학생이 /api/pay/billing/register+confirm 로 직접 진행하며,
         billing_key 가 없는 구독행은 절대 '성공'으로 표시되지 않는다(chargeSubscriptionOnce 참고). */
      if (method === 'POST' && path === '/api/admin/subscription/charge-now') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        const sub: any = await env.DB.prepare(`SELECT * FROM subscriptions WHERE id = ?`).bind(id).first();
        if (!sub) return json({ ok: false, error: 'not_found' }, 404);
        const r = await chargeSubscriptionOnce(env, sub);
        if (!r.ok) return json({ ok: false, error: r.error || 'charge_failed' }, 402);
        return json({ ok: true, charged: r.amount || 0 });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cancel') {
        const b: any = await parseJsonBody(request);
        const id = parseInt(b?.id, 10);
        if (!id) return json({ ok: false, error: 'id_required' }, 400);
        await env.DB.prepare(`UPDATE subscriptions SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();
        return json({ ok: true });
      }

      // ⚠️ 이 엔드포인트로 만든 행은 billing_key 가 없어 실제 청구가 불가능하다(항상 no_billing_key 로 실패).
      //   실제 자동연장 등록은 학생이 enroll.html 에서 /api/pay/billing/register+confirm 로 진행해야 한다.
      if (method === 'POST' && path === '/api/subscription/create') {
        const b: any = await parseJsonBody(request);
        if (!b?.user_id) return json({ ok: false, error: 'user_id_required' }, 400);
        const now = Date.now();
        const r = await env.DB.prepare(`INSERT INTO subscriptions (user_id, student_name, plan, amount, status, next_billing_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
          .bind(b.user_id, b.student_name || null, b.plan || '월정기', parseInt(b.amount, 10) || 0, 'active', now + 30 * 86400 * 1000, now, now).run();
        return json({ ok: true, id: r.meta.last_row_id, warning: 'billing_key 없이 생성됨 — 카드 등록 전까지 실제 청구 불가' });
      }

      if (method === 'POST' && path === '/api/admin/subscription/cron-check') {
        const result = await runAutoRenewChargeSweep(env);
        return json(result);
      }

      /* ♾️ (2026-08-23) 자동청구 킬스위치(KV billing:auto_renew_live) — 사장님이 화면에서 켜고 끈다.
         지금까지는 wrangler CLI 로만 만질 수 있어 스위치가 영영 dry-run 이었다.
         ⚠️ 실돈 스위치: 변경(POST)은 본사(hq) 스코프만. 강사는 scope 'none' 이라 canEditOrg 를
            통과해 버리는 함정(CLAUDE.md 2장)이 있으므로 isTeacher 를 따로 막는다. */
      if (path === '/api/admin/billing/auto-renew-live') {
        const a = await getAdminActor(request, env as any);
        if (!a.ok) return json({ ok: false, error: 'auth_required' }, 401);
        if (a.isTeacher) return json(forbiddenTeacherBody(a), 403);
        let live = false;
        try { live = (await (env as any).SESSION_STATE.get('billing:auto_renew_live')) === '1'; } catch {}
        if (method === 'GET') return json({ ok: true, live });
        if (method === 'POST') {
          const sc = await getScope(env as any, request);
          if (sc.type !== 'hq' && !FULL_ACCESS_ACCOUNTS.has(a.username)) {
            return json({ ok: false, error: 'forbidden_hq_only', message: '자동청구 스위치는 본사만 변경할 수 있습니다.' }, 403);
          }
          const b: any = await parseJsonBody(request);
          const want = b?.live === true || b?.live === 1 || b?.live === '1';
          try { await (env as any).SESSION_STATE.put('billing:auto_renew_live', want ? '1' : '0'); }
          catch (e) { return json({ ok: false, error: 'kv_write_failed', message: String((e as any)?.message || e) }, 500); }
          console.log('[billing] auto_renew_live ->', want ? '1' : '0', 'by', a.username);
          return json({ ok: true, live: want, by: a.username });
        }
        return json({ ok: false, error: 'method_not_allowed' }, 405);
      }

      /* ♾️ 청구 예정 목록(읽기 전용) — 스위치를 켜기 «전에» 누가 얼마 청구될지 보는 미리보기.
         cron-check(POST)는 스위치가 켜져 있으면 그 자리에서 실청구가 나가므로 미리보기로 쓰면 안 된다. */
      if (method === 'GET' && path === '/api/admin/billing/auto-renew-due') {
        const now = Date.now();
        const rs: any = await env.DB.prepare(
          `SELECT id, user_id, student_name, plan, amount, next_billing_at, fail_count
           FROM subscriptions WHERE status='active' AND billing_key IS NOT NULL
           ORDER BY next_billing_at ASC LIMIT 200`
        ).all().catch(() => ({ results: [] }));
        const rows = ((rs as any)?.results as any[]) || [];
        const dueNow = rows.filter((r) => Number(r.next_billing_at || 0) <= now);
        return json({
          ok: true, total: rows.length,
          due_now: dueNow.length,
          due_now_amount: dueNow.reduce((s, r) => s + Number(r.amount || 0), 0),
          list: rows.map((r) => ({ ...r, due: Number(r.next_billing_at || 0) <= now })),
        });
      }
    }
  return null;
}
