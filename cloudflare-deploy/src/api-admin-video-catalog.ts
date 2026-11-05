/** video-catalog: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json, parseJsonBody, invalidBody } from './api-util';

export async function handleAdminVideoCatalogApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════════════
    // 🎬 Phase 39 — 망고아이 비디오 (자체 제작 YouTube 영상)
    //   • 경쟁사 참고: Tutoring(레벨별 영상), Khan Academy(레슨 단위), 야나두/시원스쿨
    //   • 관리자가 YouTube URL 입력만 하면 학생 페이지에 자동 노출
    // ═══════════════════════════════════════════════════════════════════════
    const ensureMangoVideosTable = async () => {
      await env.DB.exec(
        `CREATE TABLE IF NOT EXISTS mango_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_en TEXT, youtube_url TEXT NOT NULL, youtube_id TEXT NOT NULL, thumbnail_url TEXT, level TEXT, lesson_no INTEGER, category TEXT, description TEXT, description_en TEXT, duration_sec INTEGER, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`
      );
    };

    const extractYoutubeId = (raw: string): string | null => {
      if (!raw) return null;
      try {
        const u = new URL(raw.trim());
        if (u.hostname.includes('youtu.be')) {
          return u.pathname.split('/').filter(Boolean)[0] || null;
        }
        if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
          const v = u.searchParams.get('v');
          if (v) return v;
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v')) {
            return parts[1];
          }
        }
      } catch (e) { /* ignore */ }
      if (/^[a-zA-Z0-9_-]{11}$/.test(raw.trim())) return raw.trim();
      return null;
    };


    // POST /api/admin/mango-videos — 비디오 등록
    if (method === 'POST' && path === '/api/admin/mango-videos') {
      await ensureMangoVideosTable();
      const b = await parseJsonBody(request);
      if (!b || !b.title || !b.youtube_url) return invalidBody(['title', 'youtube_url']);
      const yid = extractYoutubeId(b.youtube_url);
      if (!yid) return json({ ok: false, error: 'invalid_youtube_url' }, 400);
      const thumb = b.thumbnail_url || `https://img.youtube.com/vi/${yid}/hqdefault.jpg`;
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO mango_videos (title, title_en, youtube_url, youtube_id, thumbnail_url, level, lesson_no, category, description, description_en, duration_sec, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.title, b.title_en || null, b.youtube_url, yid, thumb,
        b.level || null, b.lesson_no != null ? Number(b.lesson_no) : null,
        b.category || null, b.description || null, b.description_en || null,
        b.duration_sec != null ? Number(b.duration_sec) : null,
        b.sort_order != null ? Number(b.sort_order) : 0,
        b.active === false ? 0 : 1,
        now, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id, youtube_id: yid, thumbnail_url: thumb });
    }


    // GET /api/admin/mango-videos — 관리자 목록
    if (method === 'GET' && path === '/api/admin/mango-videos') {
      await ensureMangoVideosTable();
      const lv = url.searchParams.get('level');
      const where: string[] = ['1=1'];
      const binds: any[] = [];
      if (lv) { where.push('level = ?'); binds.push(lv); }
      const rs: any = await env.DB.prepare(
        `SELECT * FROM mango_videos WHERE ${where.join(' AND ')} ORDER BY active DESC, level ASC, lesson_no ASC, sort_order ASC, created_at DESC LIMIT 500`
      ).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }


    // PATCH /api/admin/mango-videos/:id
    if (method === 'PATCH' && /^\/api\/admin\/mango-videos\/\d+$/.test(path)) {
      await ensureMangoVideosTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['body']);
      const sets: string[] = [];
      const binds: any[] = [];
      const patchFields: Record<string, (v: any) => any> = {
        title: v => String(v),
        title_en: v => v || null,
        youtube_url: v => String(v),
        thumbnail_url: v => v || null,
        level: v => v || null,
        lesson_no: v => v != null ? Number(v) : null,
        category: v => v || null,
        description: v => v || null,
        description_en: v => v || null,
        duration_sec: v => v != null ? Number(v) : null,
        sort_order: v => v != null ? Number(v) : 0,
        active: v => v ? 1 : 0,
      };
      for (const [k, fn] of Object.entries(patchFields)) {
        if (b[k] !== undefined) {
          sets.push(`${k} = ?`);
          binds.push(fn(b[k]));
        }
      }
      if (b.youtube_url !== undefined) {
        const yid = extractYoutubeId(b.youtube_url);
        if (!yid) return json({ ok: false, error: 'invalid_youtube_url' }, 400);
        sets.push('youtube_id = ?'); binds.push(yid);
        if (b.thumbnail_url === undefined) {
          sets.push('thumbnail_url = ?'); binds.push(`https://img.youtube.com/vi/${yid}/hqdefault.jpg`);
        }
      }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE mango_videos SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }


    // DELETE /api/admin/mango-videos/:id
    if (method === 'DELETE' && /^\/api\/admin\/mango-videos\/\d+$/.test(path)) {
      await ensureMangoVideosTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM mango_videos WHERE id = ?`).bind(id).run();
      return json({ ok: true, id });
    }


    // GET /api/mango-videos — 공개 학생용
    if (method === 'GET' && path === '/api/mango-videos') {
      await ensureMangoVideosTable();
      const lv = url.searchParams.get('level');
      const cat = url.searchParams.get('category');
      const where: string[] = ['active = 1'];
      const binds: any[] = [];
      if (lv)  { where.push('level = ?');    binds.push(lv); }
      if (cat) { where.push('category = ?'); binds.push(cat); }
      const rs: any = await env.DB.prepare(
        `SELECT id, title, title_en, youtube_id, thumbnail_url, level, lesson_no, category, description, description_en, duration_sec FROM mango_videos WHERE ${where.join(' AND ')} ORDER BY level ASC, lesson_no ASC, sort_order ASC LIMIT 500`
      ).bind(...binds).all();
      return json({ ok: true, items: rs.results || [] });
    }
  return null;
}
