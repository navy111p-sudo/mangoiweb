/** families: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody } from './api-util';
import { authUidFromRequest as authUidGlobal } from './auth-token';
import { checkAdminSession } from './auth-admin';

export async function handleAdminFamiliesApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // [Phase FAM] - 가족 계정 통합 (2026-06-12 구현: 게이트만 있고 핸들러가 누락돼
    //   /api/admin/families 등이 HTML로 폴스루 → "not valid JSON" 에러였던 것 수정)
    const ensureFamilyTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_uid TEXT NOT NULL, family_name TEXT NOT NULL, discount_percent INTEGER DEFAULT 10, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS family_members (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER NOT NULL, student_uid TEXT NOT NULL, relationship TEXT, created_at INTEGER NOT NULL, UNIQUE(family_id, student_uid));`);
    };


    if (path === '/api/admin/family/create' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const parent_uid = String(body.parent_uid || '').trim();
        const family_name = String(body.family_name || '').trim();
        const discount_percent = Math.min(50, Math.max(0, Number(body.discount_percent) || 10));
        if (!parent_uid || !family_name) return json({ ok: false, error: 'parent_uid_and_family_name_required' }, 400);
        const dup = await env.DB.prepare(`SELECT id FROM families WHERE parent_uid = ?`).bind(parent_uid).first();
        if (dup) return json({ ok: false, error: 'family_already_exists_for_parent' }, 409);
        const r = await env.DB.prepare(`INSERT INTO families (parent_uid, family_name, discount_percent, created_at) VALUES (?,?,?,?)`)
          .bind(parent_uid, family_name, discount_percent, Date.now()).run();
        return json({ ok: true, id: r.meta?.last_row_id ?? null });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_create_failed' }, 500);
      }
    }


    if (path === '/api/admin/family/add-child' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const family_id = Number(body.family_id) || 0;
        const student_uid = String(body.student_uid || '').trim();
        const relationship = String(body.relationship || '자녀').trim();
        if (!family_id || !student_uid) return json({ ok: false, error: 'family_id_and_student_uid_required' }, 400);
        const fam = await env.DB.prepare(`SELECT id FROM families WHERE id = ?`).bind(family_id).first();
        if (!fam) return json({ ok: false, error: 'family_not_found' }, 404);
        try {
          await env.DB.prepare(`INSERT INTO family_members (family_id, student_uid, relationship, created_at) VALUES (?,?,?,?)`)
            .bind(family_id, student_uid, relationship, Date.now()).run();
        } catch {
          return json({ ok: false, error: 'already_member' }, 409);
        }
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_add_child_failed' }, 500);
      }
    }


    if (path === '/api/admin/family/remove-child' && method === 'POST') {
      try {
        await ensureFamilyTables();
        const body = (await parseJsonBody(request)) || {};
        const member_id = Number(body.member_id) || 0;
        if (!member_id) return json({ ok: false, error: 'member_id_required' }, 400);
        await env.DB.prepare(`DELETE FROM family_members WHERE id = ?`).bind(member_id).run();
        return json({ ok: true });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'family_remove_child_failed' }, 500);
      }
    }


    if (path === '/api/admin/families' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const fams = ((await env.DB.prepare(`SELECT * FROM families ORDER BY created_at DESC`).all()).results || []) as any[];
        const mems = ((await env.DB.prepare(`SELECT * FROM family_members ORDER BY created_at ASC`).all()).results || []) as any[];
        const byFam: Record<string, any[]> = {};
        for (const m of mems) (byFam[String(m.family_id)] ||= []).push(m);
        const list = fams.map(f => {
          const members = byFam[String(f.id)] || [];
          return { ...f, members, member_count: members.length };
        });
        return json({ ok: true, list });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'families_list_failed' }, 500);
      }
    }


    if (path === '/api/family/my-children' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const uid = String(url.searchParams.get('user_id') || '').trim();
        if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);
        // 🔐 [PII] 본인 가족만 — 토큰 uid 일치 요구
        const fmAuth = await authUidGlobal(request, url, env);
        if (!fmAuth || fmAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
        const fam = await env.DB.prepare(`SELECT * FROM families WHERE parent_uid = ?`).bind(uid).first<any>();
        if (!fam) return json({ ok: true, family: null, children: [] });
        const mems = ((await env.DB.prepare(`SELECT * FROM family_members WHERE family_id = ? ORDER BY created_at ASC`).bind(fam.id).all()).results || []) as any[];
        return json({ ok: true, family: { id: fam.id, family_name: fam.family_name, discount_percent: fam.discount_percent }, children: mems });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'my_children_failed' }, 500);
      }
    }


    if (path === '/api/family/discount-status' && method === 'GET') {
      try {
        await ensureFamilyTables();
        const uid = String(url.searchParams.get('user_id') || '').trim();
        if (!uid) return json({ ok: false, error: 'user_id_required' }, 400);
        // 🔐 [PII] 본인 가족 할인상태만 — 토큰 uid 일치 요구
        const fdAuth = await authUidGlobal(request, url, env);
        if (!fdAuth || fdAuth !== uid) return json({ ok: false, error: 'auth_required' }, 401);
        let fam = await env.DB.prepare(`SELECT * FROM families WHERE parent_uid = ?`).bind(uid).first<any>();
        if (!fam) {
          const mem = await env.DB.prepare(`SELECT family_id FROM family_members WHERE student_uid = ?`).bind(uid).first<any>();
          if (mem) fam = await env.DB.prepare(`SELECT * FROM families WHERE id = ?`).bind(mem.family_id).first<any>();
        }
        if (!fam) return json({ ok: true, eligible: false, discount_percent: 0, member_count: 0 });
        const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM family_members WHERE family_id = ?`).bind(fam.id).first<any>();
        const member_count = Number(cnt?.c || 0);
        const eligible = member_count >= 2;
        return json({ ok: true, eligible, discount_percent: eligible ? Number(fam.discount_percent || 0) : 0, member_count, family_name: fam.family_name });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'discount_status_failed' }, 500);
      }
    }


    // [Phase ALU] - Alumni Community
    //   - Graduates/long-term students join alumni pool, share mentorship/careers/news
    //   - Admin auto-detect: enrolled_months >= 12 -> prompt alumni registration (TODO: separate cron)
    if (path === '/api/alumni/register' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.user_id) return json({ ok: false, error: 'missing_user_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        await env.DB.prepare(`INSERT OR REPLACE INTO alumni (user_id, graduation_year, graduation_month, current_status, career_field, location, message, photo_url, mentor_available, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(
            String(body.user_id),
            body.graduation_year ? Number(body.graduation_year) : null,
            body.graduation_month ? Number(body.graduation_month) : null,
            body.current_status || '',
            body.career_field || '',
            body.location || '',
            body.message || '',
            body.photo_url || '',
            body.mentor_available ? 1 : 0,
            now
          ).run();
        return json({ ok: true, registered_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_register_failed' }, 500);
      }
    }


    if (path === '/api/alumni/list' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const year = url.searchParams.get('year');
        const field = url.searchParams.get('field');
        let sql = 'SELECT * FROM alumni WHERE 1=1';
        const params: any[] = [];
        if (year) { sql += ' AND graduation_year = ?'; params.push(Number(year)); }
        if (field) { sql += ' AND career_field LIKE ?'; params.push(`%${field}%`); }
        sql += ' ORDER BY created_at DESC LIMIT 200';
        const rs = await env.DB.prepare(sql).bind(...params).all();
        return json({ ok: true, alumni: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_list_failed' }, 500);
      }
    }


    if (path === '/api/alumni/profile' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);`);
        const userId = url.searchParams.get('user_id');
        if (!userId) return json({ ok: false, error: 'missing_user_id' }, 400);
        // 🔐 [PII] 본인 또는 관리자만 — 남의 동문 프로필(위치·경력) 열람 차단
        const alAuth = await authUidGlobal(request, url, env);
        if (alAuth !== userId) {
          const alAdmin = await checkAdminSession(request, env as any);
          if (!alAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
        }
        const row = await env.DB.prepare('SELECT * FROM alumni WHERE user_id = ?').bind(userId).first();
        if (!row) return json({ ok: false, error: 'not_found' }, 404);
        return json({ ok: true, profile: row });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_profile_failed' }, 500);
      }
    }


    if (path === '/api/alumni/post' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.author_uid || !body.title) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO alumni_posts (author_uid, title, body, tags, likes, comments_count, created_at) VALUES (?,?,?,?,0,0,?)`)
          .bind(String(body.author_uid), String(body.title), body.body || '', body.tags || '', now).run();
        return json({ ok: true, post_id: result?.meta?.last_row_id, created_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_post_failed' }, 500);
      }
    }


    if (path === '/api/alumni/posts' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        const limit = Math.min(100, Number(url.searchParams.get('limit')) || 20);
        const rs = await env.DB.prepare('SELECT * FROM alumni_posts ORDER BY created_at DESC LIMIT ?').bind(limit).all();
        return json({ ok: true, posts: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_posts_failed' }, 500);
      }
    }


    if (path === '/api/alumni/post/like' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.post_id) return json({ ok: false, error: 'missing_post_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);`);
        await env.DB.prepare('UPDATE alumni_posts SET likes = likes + 1 WHERE id = ?').bind(Number(body.post_id)).run();
        const row: any = await env.DB.prepare('SELECT likes FROM alumni_posts WHERE id = ?').bind(Number(body.post_id)).first();
        return json({ ok: true, likes: row?.likes || 0 });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'alumni_like_failed' }, 500);
      }
    }
  return null;
}
