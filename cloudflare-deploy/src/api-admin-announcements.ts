/** announcements: extracted administrator domain routes. Caller authentication and route order are preserved. */
import type { MangoEnv } from './api-mango';
import { json } from './api-util';

export async function handleAdminAnnouncementsApi(request: Request, url: URL, env: MangoEnv): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;


    // ═══════════════════════════════════════════════════════════════
    // 📢 Phase POP — 팝업/공지 관리 시스템
    // ═══════════════════════════════════════════════════════════════

    const ensurePopupTables = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'mixed', body_html TEXT, image_url TEXT, video_url TEXT, link_url TEXT, link_text TEXT, width INTEGER DEFAULT 480, height INTEGER DEFAULT 360, width_mobile INTEGER, height_mobile INTEGER, position TEXT DEFAULT 'center', priority INTEGER DEFAULT 0, start_at INTEGER, end_at INTEGER, enabled INTEGER DEFAULT 1, dismiss_options TEXT DEFAULT 'today,7days', target_filter TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, view_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_views (id INTEGER PRIMARY KEY AUTOINCREMENT, popup_id INTEGER NOT NULL, user_id TEXT, viewed_at INTEGER NOT NULL, clicked INTEGER DEFAULT 0, click_target TEXT, user_agent TEXT);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS popup_dismissals (popup_id INTEGER NOT NULL, user_id TEXT NOT NULL, dismissed_at INTEGER NOT NULL, dismissed_until INTEGER NOT NULL, PRIMARY KEY (popup_id, user_id));`);
    };

    // ── GET /api/popups?uid=xxx — 학생 페이지용 활성 팝업 목록 ──
    //   조건: enabled=1 + (start_at <= now or null) + (end_at >= now or null)
    //   + 해당 user_id 가 이 팝업을 "안보기" 처리하지 않음
    if (method === 'GET' && path === '/api/popups') {
      await ensurePopupTables();
      const uid = (url.searchParams.get('uid') || '').trim();
      const now = Date.now();
      // 활성 팝업
      const rs = await env.DB.prepare(
        `SELECT * FROM popup_announcements
          WHERE enabled = 1
            AND (start_at IS NULL OR start_at <= ?)
            AND (end_at IS NULL OR end_at >= ?)
          ORDER BY priority DESC, id DESC
          LIMIT 20`
      ).bind(now, now).all();
      let popups = rs.results || [];
      // 사용자별 dismiss 필터
      if (uid && popups.length) {
        const dismissed: any = await env.DB.prepare(
          `SELECT popup_id FROM popup_dismissals WHERE user_id=? AND dismissed_until>?`
        ).bind(uid, now).all();
        const blockedIds = new Set((dismissed.results || []).map((d: any) => d.popup_id));
        popups = popups.filter((p: any) => !blockedIds.has(p.id));
      }
      return json({ ok: true, count: popups.length, rows: popups });
    }

    // ── POST /api/popups/:id/view — 노출 기록 ──
    if (method === 'POST' && /^\/api\/popups\/\d+\/view$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim() || null;
      const ua = request.headers.get('User-Agent') || '';
      await env.DB.prepare(`INSERT INTO popup_views (popup_id, user_id, viewed_at, user_agent) VALUES (?,?,?,?)`)
        .bind(id, uid, Date.now(), ua.slice(0, 200)).run();
      await env.DB.prepare(`UPDATE popup_announcements SET view_count = view_count + 1 WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/popups/:id/click — 클릭 기록 (링크 클릭) ──
    if (method === 'POST' && /^\/api\/popups\/\d+\/click$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim() || null;
      const target = (body.target || '').slice(0, 500);
      await env.DB.prepare(`INSERT INTO popup_views (popup_id, user_id, viewed_at, clicked, click_target) VALUES (?,?,?,1,?)`)
        .bind(id, uid, Date.now(), target).run();
      await env.DB.prepare(`UPDATE popup_announcements SET click_count = click_count + 1 WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // ── POST /api/popups/:id/dismiss — "오늘/7일 안보기" 처리 ──
    //   body: { uid, period: 'today' | '7days' | '30days' }
    if (method === 'POST' && /^\/api\/popups\/\d+\/dismiss$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[3] || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const uid = (body.uid || '').trim();
      const period = body.period || 'today';
      if (!uid) return json({ ok: false, error: 'uid_required' }, 400);
      const now = Date.now();
      let until = now;
      if (period === 'today') {
        const d = new Date(); d.setHours(23, 59, 59, 999);
        until = d.getTime();
      } else if (period === '3days') until = now + 3 * 86400 * 1000;
      else if (period === '7days') until = now + 7 * 86400 * 1000;
      else if (period === '30days') until = now + 30 * 86400 * 1000;
      await env.DB.prepare(`INSERT INTO popup_dismissals (popup_id, user_id, dismissed_at, dismissed_until) VALUES (?,?,?,?) ON CONFLICT(popup_id, user_id) DO UPDATE SET dismissed_at=excluded.dismissed_at, dismissed_until=excluded.dismissed_until`)
        .bind(id, uid, now, until).run();
      return json({ ok: true, until });
    }

    // ── GET /api/admin/popups — 관리자: 전체 팝업 목록 (활성+비활성+만료) ──
    if (method === 'GET' && path === '/api/admin/popups') {
      await ensurePopupTables();
      const rs = await env.DB.prepare(`SELECT * FROM popup_announcements ORDER BY enabled DESC, priority DESC, id DESC LIMIT 500`).all();
      return json({ ok: true, count: rs.results?.length || 0, rows: rs.results || [] });
    }

    // ── POST /api/admin/popups — 신규 팝업 생성 ──
    if (method === 'POST' && path === '/api/admin/popups') {
      await ensurePopupTables();
      const body: any = await request.json().catch(() => ({}));
      if (!body.title) return json({ ok: false, error: 'title_required' }, 400);
      const now = Date.now();
      const ins = await env.DB.prepare(`INSERT INTO popup_announcements (
        title, content_type, body_html, image_url, video_url, link_url, link_text,
        width, height, width_mobile, height_mobile, position, priority,
        start_at, end_at, enabled, dismiss_options, target_filter, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        body.title, body.content_type || 'mixed',
        body.body_html || null, body.image_url || null, body.video_url || null,
        body.link_url || null, body.link_text || null,
        parseInt(body.width, 10) || 480, parseInt(body.height, 10) || 360,
        body.width_mobile ? parseInt(body.width_mobile, 10) : null,
        body.height_mobile ? parseInt(body.height_mobile, 10) : null,
        body.position || 'center', parseInt(body.priority, 10) || 0,
        body.start_at ? parseInt(body.start_at, 10) : null,
        body.end_at ? parseInt(body.end_at, 10) : null,
        body.enabled === false ? 0 : 1,
        body.dismiss_options || 'today,7days',
        body.target_filter || null, now, now
      ).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
    }

    // ── PUT /api/admin/popups/:id — 팝업 수정 ──
    if (method === 'PUT' && /^\/api\/admin\/popups\/\d+$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const now = Date.now();
      await env.DB.prepare(`UPDATE popup_announcements SET
        title=COALESCE(?,title), content_type=COALESCE(?,content_type),
        body_html=?, image_url=?, video_url=?, link_url=?, link_text=?,
        width=COALESCE(?,width), height=COALESCE(?,height),
        width_mobile=?, height_mobile=?, position=COALESCE(?,position),
        priority=COALESCE(?,priority), start_at=?, end_at=?,
        enabled=COALESCE(?,enabled), dismiss_options=COALESCE(?,dismiss_options),
        target_filter=?, updated_at=?
        WHERE id=?`).bind(
        body.title ?? null, body.content_type ?? null,
        body.body_html ?? null, body.image_url ?? null, body.video_url ?? null,
        body.link_url ?? null, body.link_text ?? null,
        body.width != null ? parseInt(body.width, 10) : null,
        body.height != null ? parseInt(body.height, 10) : null,
        body.width_mobile != null ? parseInt(body.width_mobile, 10) : null,
        body.height_mobile != null ? parseInt(body.height_mobile, 10) : null,
        body.position ?? null,
        body.priority != null ? parseInt(body.priority, 10) : null,
        body.start_at != null ? parseInt(body.start_at, 10) : null,
        body.end_at != null ? parseInt(body.end_at, 10) : null,
        body.enabled === undefined ? null : (body.enabled ? 1 : 0),
        body.dismiss_options ?? null,
        body.target_filter ?? null,
        now, id
      ).run();
      return json({ ok: true, id, updated: true });
    }

    // ── DELETE /api/admin/popups/:id — 팝업 삭제 ──
    if (method === 'DELETE' && /^\/api\/admin\/popups\/\d+$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM popup_announcements WHERE id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM popup_views WHERE popup_id=?`).bind(id).run();
      await env.DB.prepare(`DELETE FROM popup_dismissals WHERE popup_id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ══════════════════════════════════════════════════════════════
    // 🎨 포스터 만들기 — 서버 저장/재사용 (관리자)
    //   saved_posters: 만든 날짜(created_at)·수정 날짜(updated_at)로 관리
    // ══════════════════════════════════════════════════════════════
    const ensurePosterTable = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS saved_posters (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, config TEXT NOT NULL, width INTEGER DEFAULT 1080, height INTEGER DEFAULT 1080, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
    };

    // ── GET /api/admin/posters — 저장된 포스터 목록 (최근 수정순) ──
    if (method === 'GET' && path === '/api/admin/posters') {
      await ensurePosterTable();
      const rs = await env.DB.prepare(
        `SELECT id, title, config, width, height, created_at, updated_at FROM saved_posters ORDER BY updated_at DESC LIMIT 200`
      ).all();
      return json({ ok: true, count: (rs.results || []).length, rows: rs.results || [] });
    }

    // ── GET /api/admin/posters/:id — 단일 포스터 (불러오기) ──
    if (method === 'GET' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const row: any = await env.DB.prepare(`SELECT * FROM saved_posters WHERE id=?`).bind(id).first();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, row });
    }

    // ── POST /api/admin/posters — 새 포스터 저장 ──
    if (method === 'POST' && path === '/api/admin/posters') {
      await ensurePosterTable();
      const body: any = await request.json().catch(() => ({}));
      const title = String(body.title || '').trim() || '무제 포스터';
      const config = typeof body.config === 'string' ? body.config : JSON.stringify(body.config || {});
      if (config.length > 4_000_000) return json({ ok: false, error: 'config_too_large' }, 413);
      const now = Date.now();
      const ins = await env.DB.prepare(
        `INSERT INTO saved_posters (title, config, width, height, created_at, updated_at) VALUES (?,?,?,?,?,?)`
      ).bind(title, config, parseInt(body.width, 10) || 1080, parseInt(body.height, 10) || 1080, now, now).run();
      return json({ ok: true, id: ins?.meta?.last_row_id, created: true });
    }

    // ── PUT /api/admin/posters/:id — 포스터 수정 ──
    if (method === 'PUT' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      const body: any = await request.json().catch(() => ({}));
      const config = body.config == null ? null : (typeof body.config === 'string' ? body.config : JSON.stringify(body.config));
      if (config && config.length > 4_000_000) return json({ ok: false, error: 'config_too_large' }, 413);
      await env.DB.prepare(
        `UPDATE saved_posters SET title=COALESCE(?,title), config=COALESCE(?,config), width=COALESCE(?,width), height=COALESCE(?,height), updated_at=? WHERE id=?`
      ).bind(
        body.title ?? null, config,
        body.width != null ? parseInt(body.width, 10) : null,
        body.height != null ? parseInt(body.height, 10) : null,
        Date.now(), id
      ).run();
      return json({ ok: true, id, updated: true });
    }

    // ── DELETE /api/admin/posters/:id — 포스터 삭제 ──
    if (method === 'DELETE' && /^\/api\/admin\/posters\/\d+$/.test(path)) {
      await ensurePosterTable();
      const id = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.prepare(`DELETE FROM saved_posters WHERE id=?`).bind(id).run();
      return json({ ok: true, id, deleted: true });
    }

    // ── GET /api/admin/popups/:id/stats — 팝업 통계 ──
    if (method === 'GET' && /^\/api\/admin\/popups\/\d+\/stats$/.test(path)) {
      await ensurePopupTables();
      const id = parseInt(path.split('/')[4] || '0', 10);
      const pop: any = await env.DB.prepare(`SELECT * FROM popup_announcements WHERE id=?`).bind(id).first();
      if (!pop) return json({ ok: false, error: 'not_found' }, 404);
      const uniqueViewers: any = await env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM popup_views WHERE popup_id=? AND user_id IS NOT NULL`).bind(id).first();
      const clickCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM popup_views WHERE popup_id=? AND clicked=1`).bind(id).first();
      const dismissCount: any = await env.DB.prepare(`SELECT COUNT(*) AS c FROM popup_dismissals WHERE popup_id=?`).bind(id).first();
      const recent: any = await env.DB.prepare(`SELECT viewed_at, user_id, clicked, click_target FROM popup_views WHERE popup_id=? ORDER BY viewed_at DESC LIMIT 30`).bind(id).all();
      return json({
        ok: true,
        popup: pop,
        stats: {
          total_views: pop.view_count || 0,
          unique_viewers: uniqueViewers?.c || 0,
          total_clicks: clickCount?.c || 0,
          ctr: (pop.view_count > 0) ? Math.round((clickCount?.c || 0) / pop.view_count * 1000) / 10 : 0,
          dismissals: dismissCount?.c || 0,
        },
        recent_views: recent?.results || [],
      });
    }

    // ── POST /api/admin/popups/upload-media — 이미지/동영상 R2 업로드 ──
    //   multipart/form-data: file=...
    //   응답: { ok, url }
    if (method === 'POST' && path === '/api/admin/popups/upload-media') {
      try {
        const form = await request.formData();
        const file = form.get('file') as File | null;
        if (!file) return json({ ok: false, error: 'file_required' }, 400);
        const MAX_SIZE = 30 * 1024 * 1024; // 30MB
        if (file.size > MAX_SIZE) return json({ ok: false, error: 'file_too_large', max: MAX_SIZE }, 413);
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
        const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'mov'];
        if (!validExt.includes(ext)) return json({ ok: false, error: 'invalid_type', allowed: validExt }, 400);
        const key = `popup-media/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        // R2 bucket - RECORDINGS 재사용 (이미 wrangler.toml 에 있음)
        const r2 = (env as any).RECORDINGS;
        if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);
        const buf = await file.arrayBuffer();
        await r2.put(key, buf, {
          httpMetadata: { contentType: file.type || 'application/octet-stream' },
        });
        // 공개 URL — R2 public bucket 안 쓰면 우리 worker 로 프록시
        const publicUrl = `/api/popups/media/${encodeURIComponent(key)}`;
        return json({ ok: true, url: publicUrl, key, size: file.size, type: file.type });
      } catch (e: any) {
        return json({ ok: false, error: 'upload_failed', detail: String(e?.message || e) }, 500);
      }
    }

    // ── GET/HEAD /api/popups/media/:key — 업로드된 미디어 프록시 ──
    //   🎬 (2026-08-25) Range(206) 지원 추가 — 여기에 «영상» 을 올릴 수 있게 된 뒤로 필요해졌다.
    //     · iOS 사파리는 <video> 재생을 구간 요청으로 시작한다. 200 + 전체 파일만 돌려주면
    //       큰 영상이 아예 재생되지 않거나 첫 프레임 전에 통째로 버퍼링한다.
    //     · 되감기(seek)도 Accept-Ranges 가 있어야 브라우저가 허용한다.
    //   같은 사정으로 인트로 영상은 src/index.ts 의 /media/intro.mp4 라우트가 이미 206 을 준다 —
    //   그쪽은 키가 고정이고 여기는 업로드된 임의의 키라, 둘을 합치지 않고 같은 규칙만 맞춘다.
    if ((method === 'GET' || method === 'HEAD') && path.startsWith('/api/popups/media/')) {
      const key = decodeURIComponent(path.replace('/api/popups/media/', ''));
      // 🔒 이 경로는 «로그인 없이» 열린다(src/index.ts 의 공개 목록). 그런데 버킷(RECORDINGS)에는
      //    수업 «녹화» 도 같이 들어 있다 — 키를 그대로 받으면 주소만 알면 남의 수업이 열린다.
      //    업로더(/api/admin/popups/upload-media)가 만드는 키는 항상 popup-media/ 로 시작하므로
      //    읽을 수 있는 범위를 거기로 묶는다. (.. 로 위로 올라가는 것도 함께 막는다)
      if (!key.startsWith('popup-media/') || key.includes('..')) {
        return new Response('Not Found', { status: 404 });
      }
      const r2 = (env as any).RECORDINGS;
      if (!r2) return json({ ok: false, error: 'r2_not_configured' }, 500);

      const rangeHeader = request.headers.get('Range');
      const opts: any = {};
      let wantRange = false;
      if (rangeHeader) {
        const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = m[2] ? parseInt(m[2], 10) : undefined;
          opts.range = end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start };
          wantRange = true;
        }
      }

      // HEAD 는 본문 없이 헤더만 — 브라우저가 Accept-Ranges·Content-Length 를 먼저 확인할 때 쓴다.
      const obj = method === 'HEAD' ? await r2.head(key) : await r2.get(key, opts);
      if (!obj) return new Response('Not Found', { status: 404 });

      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set('Accept-Ranges', 'bytes');
      // 업로드 키에 시각이 박혀 있어 같은 주소의 내용이 바뀌지 않는다 → 길게 캐시해도 안전.
      headers.set('Cache-Control', 'public, max-age=604800, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      if (obj.httpEtag) headers.set('ETag', obj.httpEtag);

      if (method === 'HEAD') {
        headers.set('Content-Length', String(obj.size));
        return new Response(null, { status: 200, headers });
      }
      const r = (obj as any).range;
      if (wantRange && r) {
        // 끝을 안 적은 요청(bytes=N-)에 R2 가 length 를 안 채워 주면 «본문은 일부인데 길이는 전체»가
        // 되어 되감기가 깨진다. 남은 크기로 직접 계산해 둔다.
        const off = r.offset || 0;
        const len = r.length !== undefined ? r.length : (obj.size - off);
        headers.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
        headers.set('Content-Length', String(len));
        return new Response(obj.body, { status: 206, headers });
      }
      headers.set('Content-Length', String(obj.size));
      return new Response(obj.body, { headers });
    }
  return null;
}
