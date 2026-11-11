/** referrals: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';

export async function handleAdminReferralsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ── 🎁 추천 친구 보상 (card-referral) ──
    //   컬럼 관례: churn-contagion.ts 가 referrer_uid/referred_uid 를 읽으므로 동일하게.
    //   프런트는 referee_uid 를 기대 → SELECT 별칭으로 정합.
    if (path === '/api/admin/referrals' || path === '/api/admin/referrals/stats') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_uid TEXT NOT NULL, referred_uid TEXT NOT NULL, code TEXT, status TEXT DEFAULT 'pending', reward_points INTEGER DEFAULT 0, created_at INTEGER, UNIQUE(referrer_uid, referred_uid));`); } catch {}
    }

    if (method === 'GET' && path === '/api/admin/referrals') {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 500);
      try {
        const rs = await env.DB.prepare(`SELECT id, referrer_uid, referred_uid AS referee_uid, code, status, reward_points, created_at FROM referrals ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, list: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }

    if (method === 'GET' && path === '/api/admin/referrals/stats') {
      try {
        const cs = await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM referrals GROUP BY status`).all();
        const counts: Record<string, number> = {};
        for (const r of (cs.results || []) as any[]) counts[String(r.status || 'pending')] = Number(r.n) || 0;
        const lb = await env.DB.prepare(`SELECT referrer_uid, COUNT(*) AS n FROM referrals GROUP BY referrer_uid ORDER BY n DESC LIMIT 10`).all();
        return json({ ok: true, counts, leaderboard: lb.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }


    /* ── 🎁 학생측 추천 코드 (홈 '내 추천 코드' 칩이 부르는 경로) ─────────────────
     * [왜] 관리자 카드(/api/admin/referrals)는 있는데 **학생이 코드를 받을 곳이 없었다.**
     *      그래서 표가 영영 비어 있었다. 홈 화면은 이미 이 경로를 부르고 있었다(index.html).
     * ⚠️ 코드는 uid 로부터 **항상 같은 값**이 나오게 만든다 — 새로고침마다 코드가 바뀌면
     *    친구에게 이미 보낸 코드가 죽는다.
     */
    if (path.startsWith('/api/referral/')) {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referral_codes (code TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, created_at INTEGER);`); } catch {}
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_uid TEXT NOT NULL, referred_uid TEXT NOT NULL, code TEXT, status TEXT DEFAULT 'pending', reward_points INTEGER DEFAULT 0, created_at INTEGER, UNIQUE(referrer_uid, referred_uid));`); } catch {}
    }

    if (method === 'GET' && path === '/api/referral/my-code') {
      const uid = String(url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      try {
        const has: any = await env.DB.prepare(`SELECT code FROM referral_codes WHERE uid = ? COLLATE NOCASE`).bind(uid).first();
        if (has?.code) return json({ ok: true, code: String(has.code) });
        // uid 로 결정적 코드 생성(같은 사람 = 항상 같은 코드). 충돌하면 뒤에 한 글자씩 붙여 피한다.
        let h = 0;
        for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
        const AB = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 헷갈리는 0/O/1/I 제외
        const make = (seed: number, len: number) => {
          let s = '', v = seed;
          for (let i = 0; i < len; i++) { s += AB[v % AB.length]; v = Math.floor(v / AB.length) + 7; }
          return s;
        };
        let code = 'MG' + make(h, 4);
        for (let t = 1; t <= 8; t++) {
          const dup: any = await env.DB.prepare(`SELECT 1 AS x FROM referral_codes WHERE code = ?`).bind(code).first();
          if (!dup) break;
          code = 'MG' + make(h + t * 977, 4);
        }
        await env.DB.prepare(`INSERT OR IGNORE INTO referral_codes (code, uid, created_at) VALUES (?, ?, ?)`)
          .bind(code, uid, Date.now()).run();
        const now2: any = await env.DB.prepare(`SELECT code FROM referral_codes WHERE uid = ? COLLATE NOCASE`).bind(uid).first();
        return json({ ok: true, code: String(now2?.code || code) });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'query_failed' }, 500); }
    }

    if (method === 'POST' && path === '/api/referral/use') {
      const b = await parseJsonBody(request);
      const code = String(b?.code || '').trim().toUpperCase();
      const uid = String(b?.uid || '').trim();
      if (!code || !uid) return invalidBody(['code', 'uid']);
      try {
        const owner: any = await env.DB.prepare(`SELECT uid FROM referral_codes WHERE code = ?`).bind(code).first();
        if (!owner?.uid) return json({ ok: false, error: 'code_not_found' }, 404);
        if (String(owner.uid).toLowerCase() === uid.toLowerCase()) return json({ ok: false, error: 'self_referral' }, 400);
        /* ⛔ 포인트를 여기서 바로 주지 않는다. 적립 규칙(얼마·언제·회수 조건)이 아직 확정 전이고,
         *    uid 만으로 호출되는 경로에서 자동 지급하면 코드만 알면 무한 적립이 된다.
         *    'pending' 으로 남기고 관리자 카드에서 확인 후 지급한다. */
        await env.DB.prepare(
          `INSERT OR IGNORE INTO referrals (referrer_uid, referred_uid, code, status, reward_points, created_at)
             VALUES (?, ?, ?, 'pending', 500, ?)`
        ).bind(String(owner.uid), uid, code, Date.now()).run();
        return json({ ok: true, status: 'pending', referrer_uid: String(owner.uid),
                      message_ko: '추천이 접수되었습니다. 확인 후 포인트가 지급됩니다.',
                      message_en: 'Referral received. Points will be granted after review.' });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'save_failed' }, 500); }
    }
  return null;
}
