/**
 * livekit-bridge.ts — 카페24 대신 임시로 Cloudflare Workers에서 LiveKit 토큰 발급/Webhook 처리
 *
 * 엔드포인트:
 *   POST /api/livekit/token    : 방 입장용 JWT 발급 (15분)
 *   POST /api/livekit/refresh  : 만료 60초 전 무중단 재발급
 *   POST /api/livekit/webhook  : LiveKit → D1 동기화 (participant_left, egress_*)
 *   GET  /api/livekit/config   : 프론트가 ws URL만 필요할 때
 *
 * 인증:
 *   PoC 단계에서는 요청 body의 user_id/role을 그대로 신뢰 (Cafe24 세션 연동 전).
 *   운영 단계에서는 Cafe24 PHP가 동일 로직으로 대체.
 */

export interface LivekitEnv {
  LIVEKIT_API_KEY: string;        // wrangler secret put
  LIVEKIT_API_SECRET: string;     // wrangler secret put
  LIVEKIT_URL: string;            // 예: wss://xxx.livekit.cloud (var로 설정)
  DB: D1Database;
  SESSION_STATE?: KVNamespace;
}

const TOKEN_TTL_SEC = 15 * 60;

// ─────────────────────────────────────────────
// JWT (HS256) — Web Crypto
// ─────────────────────────────────────────────
function b64url(data: ArrayBuffer | Uint8Array | string): string {
  const bytes = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : (data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_');
}
function b64urlDecodeToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g,'+').replace(/_/g,'/') + pad);
  const u = new Uint8Array(bin.length);
  for (let i=0; i<bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

async function signJwt(payload: Record<string, any>, apiKey: string, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: apiKey,
    nbf: now - 5,
    exp: now + TOKEN_TTL_SEC,
    ...payload,
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(claims));
  const data = `${head}.${body}`;
  const key = await hmacKey(secret, 'sign');
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const key = await hmacKey(secret, 'verify');
  const ok = await crypto.subtle.verify(
    'HMAC', key,
    b64urlDecodeToBytes(sig),
    new TextEncoder().encode(`${head}.${body}`)
  );
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(body))); }
  catch { return null; }
}

// ─────────────────────────────────────────────
// 토큰 발급
// ─────────────────────────────────────────────
interface TokenReq {
  user_id: string;
  user_name?: string;
  role?: 'teacher' | 'student';
  room_id: string;
  lesson_id?: number;
  recording_consent?: boolean;
}

async function buildAccessToken(req: TokenReq, env: LivekitEnv): Promise<string> {
  const video: Record<string, any> = {
    room: req.room_id,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  if (req.role === 'teacher') {
    video.roomAdmin = true;
    video.roomCreate = true;
  }
  const metadata = JSON.stringify({
    role: req.role ?? 'student',
    recording_consent: !!req.recording_consent,
    lesson_id: req.lesson_id ?? 0,
  });
  return signJwt({
    sub: req.user_id,
    name: req.user_name ?? req.user_id,
    metadata,
    video,
  }, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

// ─────────────────────────────────────────────
// HTTP 라우터
// ─────────────────────────────────────────────
const J = (data: any, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
});

export async function handleLivekit(
  request: Request, url: URL, env: LivekitEnv
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) {
    if (path.startsWith('/api/livekit')) {
      return J({
        error: 'LiveKit not configured',
        hint: 'wrangler secret put LIVEKIT_API_KEY / LIVEKIT_API_SECRET, vars.LIVEKIT_URL 설정 필요'
      }, 503);
    }
    return null;
  }

  // ── GET /api/livekit/config
  if (path === '/api/livekit/config' && method === 'GET') {
    return J({ url: env.LIVEKIT_URL });
  }

  // ── POST /api/livekit/token
  if (path === '/api/livekit/token' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as Partial<TokenReq>;
    if (!body.user_id || !body.room_id) return J({ error: 'user_id, room_id required' }, 400);

    // PoC: user_id를 그대로 신뢰. 카페24 세션 붙이면 서버측에서 덮어쓰기.
    const req: TokenReq = {
      user_id: String(body.user_id),
      user_name: body.user_name ?? String(body.user_id),
      role: body.role === 'teacher' ? 'teacher' : 'student',
      room_id: String(body.room_id).replace(/[^a-zA-Z0-9_-]/g, ''),
      lesson_id: Number(body.lesson_id ?? 0),
      recording_consent: !!body.recording_consent,
    };

    // 동의 체크 (D1 consents 테이블이 있으면)
    try {
      const c = await env.DB.prepare(
        `SELECT attendance_consent, recording_consent FROM consents
         WHERE user_id = ? AND withdrawn_at IS NULL
         ORDER BY consented_at DESC LIMIT 1`
      ).bind(req.user_id).first<any>();
      if (c) {
        if (!c.attendance_consent) return J({ error: 'attendance consent required' }, 403);
        req.recording_consent = !!c.recording_consent;
      }
    } catch (_) { /* consents 테이블 없으면 패스 (v3 스키마 호환) */ }

    const token = await buildAccessToken(req, env);

    // 출결 시작 기록
    try {
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO attendance (room_id, user_id, username, role, joined_at, status, date)
         VALUES (?, ?, ?, ?, ?, 'active', date('now'))`
      ).bind(req.room_id, req.user_id, req.user_name, req.role, now).run();
    } catch (_) {}

    return J({
      token,
      url: env.LIVEKIT_URL,
      expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC,
      recording_consent: req.recording_consent,
    });
  }

  // ── POST /api/livekit/refresh
  if (path === '/api/livekit/refresh' && method === 'POST') {
    const body = await request.json().catch(() => ({})) as any;
    const prevToken: string = body.token ?? '';
    const prev = await verifyJwt(prevToken, env.LIVEKIT_API_SECRET);
    if (!prev || !prev.sub || !prev.video?.room) return J({ error: 'invalid token' }, 401);

    const req: TokenReq = {
      user_id: prev.sub,
      user_name: prev.name,
      role: prev.video?.roomAdmin ? 'teacher' : 'student',
      room_id: prev.video.room,
    };
    try {
      const meta = prev.metadata ? JSON.parse(prev.metadata) : {};
      req.recording_consent = !!meta.recording_consent;
      req.lesson_id = meta.lesson_id ?? 0;
    } catch {}
    const token = await buildAccessToken(req, env);
    return J({ token, expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC });
  }

  // ── POST /api/livekit/webhook
  if (path === '/api/livekit/webhook' && method === 'POST') {
    const auth = request.headers.get('Authorization') || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) return new Response('no auth', { status: 401 });
    const claims = await verifyJwt(token, env.LIVEKIT_API_SECRET);
    if (!claims) return new Response('bad signature', { status: 401 });

    const event = await request.json().catch(() => null) as any;
    if (!event) return new Response('bad payload', { status: 400 });

    const type = event.event as string;
    const now = Date.now();

    try {
      if (type === 'participant_left') {
        const userId = event.participant?.identity;
        const roomId = event.room?.name;
        if (userId && roomId) {
          await env.DB.prepare(
            `UPDATE attendance SET left_at = ?, status = 'left'
             WHERE user_id = ? AND room_id = ? AND status = 'active'`
          ).bind(now, userId, roomId).run();
        }
      } else if (type === 'egress_started') {
        const eg = event.egressInfo || {};
        await env.DB.prepare(
          `INSERT OR REPLACE INTO recordings
             (id, room_id, teacher_id, teacher_name, filename, participant_ids, participant_names, consented_user_ids, started_at, expires_at, storage, status)
           VALUES (
             (SELECT id FROM recordings WHERE filename = ?),
             ?, '', '', ?, '[]', '[]', '[]', ?, ?, 'livekit', 'recording'
           )`
        ).bind(
          eg.egressId, eg.roomName ?? '', eg.egressId,
          now, now + 30 * 24 * 3600 * 1000
        ).run().catch(async () => {
          await env.DB.prepare(
            `INSERT INTO recordings
               (room_id, teacher_id, teacher_name, filename, participant_ids, participant_names, consented_user_ids, started_at, expires_at, storage, status)
             VALUES (?, '', '', ?, '[]', '[]', '[]', ?, ?, 'livekit', 'recording')`
          ).bind(eg.roomName ?? '', eg.egressId, now, now + 30 * 24 * 3600 * 1000).run();
        });
      } else if (type === 'egress_ended') {
        const eg = event.egressInfo || {};
        const file = (eg.fileResults && eg.fileResults[0]) || {};
        await env.DB.prepare(
          `UPDATE recordings
           SET ended_at = ?, duration_ms = ?, size_bytes = ?, file_url = ?, status = 'completed'
           WHERE filename = ?`
        ).bind(now, file.duration ?? 0, file.size ?? 0, file.location ?? '', eg.egressId).run().catch(()=>{});

        // STT 큐 등록
        if (file.location) {
          await env.DB.prepare(
            `INSERT INTO stt_queue (egress_id, file_url, status) VALUES (?, ?, 'pending')`
          ).bind(eg.egressId, file.location).run().catch(()=>{});
        }
      } else if (type === 'room_finished') {
        const roomId = event.room?.name;
        if (roomId) {
          await env.DB.prepare(
            `UPDATE attendance SET left_at = ?, status = 'left'
             WHERE room_id = ? AND status = 'active'`
          ).bind(now, roomId).run();
        }
      }
    } catch (e: any) {
      console.error('[livekit webhook] error', e.message, 'type=', type);
    }
    return new Response('ok');
  }

  return null;
}

// D1 마이그레이션: recordings에 file_url 컬럼, stt_queue 테이블 보장
export async function ensureLivekitSchema(env: LivekitEnv): Promise<void> {
  try {
    await env.DB.prepare(`ALTER TABLE recordings ADD COLUMN file_url TEXT`).run();
  } catch {}
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stt_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        egress_id TEXT NOT NULL,
        file_url TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        result_json TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()*1000),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()*1000)
      )
    `).run();
  } catch {}
}
