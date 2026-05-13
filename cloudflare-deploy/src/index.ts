/**
 * index.ts - Main Worker entry point
 * Handles routing, API endpoints, and WebSocket upgrades
 */

import { SignalingRoom } from './signaling-room';
import { VideoCallRoom } from './video-call-room';
import { HealthResponse, TurnConfigResponse, PdfUploadResponse } from './types';
import { handleMangoApi } from './api-mango';
import { purgeExpired } from './retention';
import { handleLivekit, ensureLivekitSchema } from './livekit-bridge';
import { handleRecordingUpload as handleR2MultipartUpload } from './recordings-r2';
import { handleAdminAuthApi, checkAdminSession } from './auth-admin';
import { reportsRouter } from './accounting-reports';

interface Env {
  SIGNALING_ROOM: DurableObjectNamespace;
  VIDEO_CALL_ROOM: DurableObjectNamespace;
  PDF_STORE: KVNamespace;
  SESSION_STATE: KVNamespace;
  DB: D1Database;
  ASSETS: any;
  LIVEKIT_API_KEY?: string;
  LIVEKIT_API_SECRET?: string;
  LIVEKIT_URL?: string;
  // R2: 수업 녹화 파일 저장 (MediaRecorder 업로드 블롭)
  RECORDINGS?: R2Bucket;
  MAX_RECORDING_MB?: string;
  ALLOWED_RECORDING_MIME?: string;
  // Cloudflare TURN 서비스 (선택사항 - 설정하면 동적 TURN 자격증명 생성)
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  // 관리자 Basic Auth (wrangler secret put ADMIN_PASSWORD 으로 설정)
  // - 설정되어 있으면 admin.html + 관리자 API 에 Basic Auth 요구
  // - 설정 안되어 있으면 fail-open (경고 로그만 남기고 통과 — 초기 롤아웃 안전장치)
  ADMIN_PASSWORD?: string;
  // 🩺 /admin/health 의 "마지막 배포" 타일에 사용할 빌드 식별자.
  //   - wrangler.toml 의 [vars] / [env.production.vars] 에서 주입.
  //   - fix-and-deploy.ps1 이 커밋 직전 자동으로 현재 시각+단축해시로 갱신.
  BUILD_STAMP?: string;
  // 🥭 Phase 21 — Workers AI 바인딩 (검색창 AI 명령)
  //   - wrangler.toml 의 [ai] binding = "AI" 로 주입
  //   - Llama 3.3 70B Instruct fp8-fast 사용 (한국어 + function calling)
  AI?: any;
}

export { SignalingRoom, VideoCallRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Room-Id, X-Filename, X-Recording-Id, X-Duration-Ms, X-Size-Bytes, Authorization'
        }
      });
    }

    // 🔒 관리자 세션 쿠키 미들웨어 (Phase 11)
    //   - HttpOnly 쿠키 mango_admin_session 으로 인증
    //   - 미인증 페이지 요청 → 302 /admin/login 리다이렉트
    //   - 미인증 API  요청 → 401 JSON
    //   - /admin/login, /api/admin/login, /api/admin/logout 은 항상 통과
    if (isAdminPath(path, request.method) && !isAuthPublicPath(path)) {
      const sess = await checkAdminSession(request, env);
      if (!sess.ok) {
        // HTML 페이지 → 로그인 화면으로 리다이렉트 (next 파라미터로 원래 경로 보존)
        if (path === '/admin' || path === '/admin/' || path === '/admin.html'
            || path.startsWith('/admin/')) {
          const next = encodeURIComponent(path + url.search);
          return Response.redirect(new URL(`/admin/login?next=${next}`, request.url).toString(), 302);
        }
        // API → 401 JSON
        return new Response(
          JSON.stringify({ ok: false, error: 'auth_required' }),
          { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }
    }

    // Health check endpoint
    if (path === '/api/health') {
      return handleHealth();
    }

    // 🩺 /admin/health 페이지가 호출하는 서버측 자가진단 API
    //   - D1/R2/KV 바인딩 실제 호출 + 시크릿 presence + BUILD_STAMP 리턴
    //   - Basic Auth 미들웨어 뒤에 걸려 있음 (isAdminPath 참조)
    if (path === '/api/admin/health-check') {
      return handleHealthCheck(request, env);
    }

    // TURN/STUN config endpoint
    if (path === '/api/turn-config') {
      return await handleTurnConfig(env);
    }

    // PDF upload endpoint
    if (path === '/api/video-call/upload-pdf' && request.method === 'POST') {
      return await handlePdfUpload(request, env);
    }

    // PDF list endpoint
    if (path === '/api/video-call/pdf-list' && request.method === 'GET') {
      return await handlePdfList(env);
    }

    // PDF download endpoint (SPA에서 PDF.js로 렌더링할 때 사용)
    if (path.startsWith('/api/video-call/pdf/') && request.method === 'GET') {
      return await handlePdfDownload(path, env);
    }

    // 보관기간 자동 파기: 수동 실행/상태 조회
    if (path === '/api/retention/run' && request.method === 'POST') {
      const result = await purgeExpired(env);
      return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    if (path === '/api/retention/status' && request.method === 'GET') {
      const last = await env.SESSION_STATE.get('retention:last_run');
      return new Response(last || 'null', {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // 활성 방 목록 (관리자용)
    if (path === '/api/active-rooms' && request.method === 'GET') {
      return await handleActiveRooms(env);
    }

    // 특정 방 상태 조회 (관리자용)
    if (path.startsWith('/api/room-status/') && request.method === 'GET') {
      const roomId = path.replace('/api/room-status/', '');
      return await handleRoomStatus(roomId, env);
    }

    // LiveKit 하이브리드 브릿지 (v4)
    if (path.startsWith('/api/livekit')) {
      const res = await handleLivekit(request, url, env as any);
      if (res) return res;
    }

    // 📋 학생 홈페이지 — 최근 녹화 목록 (R2 source of truth, 날짜순 desc, 공개)
    //   응답: { ok, rows: [{ id, room_id, teacher, date, duration, size, url, status, playable }] }
    //   R2 의 rec/ prefix 파일을 1차 데이터로 사용하고, D1 의 recordings row 로 metadata 보강
    if (path === '/api/recordings/list-recent' && request.method === 'GET') {
      try {
        if (!env.RECORDINGS) return new Response(JSON.stringify({ ok:false, error:'R2 not configured', rows:[] }), { headers:{'Content-Type':'application/json'} });
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));

        // 1) R2 list — rec/ + recordings/ 두 prefix 모두 (legacy 호환)
        const [recList, recordingsList] = await Promise.all([
          env.RECORDINGS.list({ prefix: 'rec/', limit: 200 }),
          env.RECORDINGS.list({ prefix: 'recordings/', limit: 50 }),
        ]);
        let allFiles = [
          ...recList.objects,
          ...recordingsList.objects,
        ];
        // uploaded date desc
        allFiles.sort((a: any, b: any) => {
          const ta = a.uploaded ? new Date(a.uploaded).getTime() : 0;
          const tb = b.uploaded ? new Date(b.uploaded).getTime() : 0;
          return tb - ta;
        });
        allFiles = allFiles.slice(0, limit);

        // 2) D1 metadata 매핑 (file_url 또는 filename 기준)
        const dbMap = new Map<string, any>();
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, teacher_id TEXT, teacher_name TEXT, filename TEXT, file_url TEXT, size_bytes INTEGER, duration_ms INTEGER, participant_ids TEXT, participant_names TEXT, consented_user_ids TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, storage TEXT, expires_at INTEGER);`);
          const rs = await env.DB.prepare(
            `SELECT id, room_id, teacher_name, teacher_id, filename, file_url, size_bytes, duration_ms, started_at, ended_at, status FROM recordings WHERE COALESCE(status, '') != 'deleted'`
          ).all();
          const rows = (rs.results || []) as any[];
          rows.forEach((r: any) => {
            if (r.file_url) dbMap.set(String(r.file_url), r);
            if (r.filename) dbMap.set(String(r.filename), r);
          });
        } catch (e) { /* DB 없어도 R2 만으로 응답 */ }

        // 3) 응답 빌드
        const rows = allFiles.map((o: any, i: number) => {
          const db = dbMap.get(o.key) || dbMap.get(String(o.key).split('/').pop() || '') || {};
          // 날짜: DB started_at 우선, 없으면 R2 uploaded
          const startMs = db.started_at || (o.uploaded ? new Date(o.uploaded).getTime() : 0);
          const date = startMs ? new Date(startMs).toISOString().slice(0,10) : '-';
          // 시간: DB duration_ms 우선
          const durMs = db.duration_ms || 0;
          const durSec = durMs ? Math.round(durMs / 1000) : 0;
          const durStr = durSec >= 60 ? (Math.floor(durSec/60) + '분 ' + (durSec%60) + '초') : (durSec ? (durSec + '초') : '-');
          // 크기: R2 object size 우선 (DB 보다 정확)
          const sz = o.size || db.size_bytes || 0;
          const sizeStr = sz ? (sz >= 1048576 ? (Math.round(sz/104857.6)/10) + ' MB' : Math.round(sz/1024) + ' KB') : '-';
          // room_id 추출: rec/{roomId}/{...}.webm
          const m = /^rec\/([^\/]+)\//.exec(String(o.key));
          const roomId = (db.room_id) || (m ? m[1] : '-');
          // 🕒 시간: started_at HH:MM ~ ended_at HH:MM (DB started_at 우선, 없으면 R2 uploaded 사용)
          const fmtHM = (ms: number) => {
            if (!ms) return '';
            const d = new Date(ms);
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return hh + ':' + mm;
          };
          const sourceStartMs = startMs || (o.uploaded ? new Date(o.uploaded).getTime() : 0);
          const endedMs = db.ended_at || (sourceStartMs && durMs ? (sourceStartMs + durMs) : 0);
          const startHM = fmtHM(sourceStartMs);
          const endHM = fmtHM(endedMs);
          const timeRange = (startHM && endHM) ? (startHM + '~' + endHM) : startHM;
          return {
            id: db.id || ('r2_' + i),
            date,
            room_id: roomId,
            teacher: db.teacher_name || db.teacher_id || '정우영',
            topic: '방 ' + roomId + ' — 1:1 영어 회화',
            duration: durStr,
            time_range: timeRange,
            started_at_ms: sourceStartMs,
            ended_at_ms: endedMs,
            size: sizeStr,
            url: '/api/recordings/blob/' + encodeURIComponent(String(o.key)),
            status: db.status || 'completed',
            playable: true,
            key: o.key,
          };
        });
        return new Response(JSON.stringify({ ok: true, count: rows.length, rows }, null, 2), { headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message, rows: [] }), { headers:{'Content-Type':'application/json'} });
      }
    }

    // 🩺 R2 녹화 파일 공개 진단 (학생용) — file 존재여부 확인
    if (path === '/api/recordings/check' && request.method === 'GET') {
      try {
        if (!env.RECORDINGS) return new Response(JSON.stringify({ ok:false, error:'R2 not configured' }), { headers:{'Content-Type':'application/json'} });
        const k = url.searchParams.get('key') || '';
        if (!k) {
          // 🎬 두 prefix 모두 검사: rec/ (multipart 자동녹화) + recordings/ (옛날 단일 업로드)
          const [recList, recordingsList] = await Promise.all([
            env.RECORDINGS.list({ prefix: 'rec/', limit: 50 }),
            env.RECORDINGS.list({ prefix: 'recordings/', limit: 50 }),
          ]);
          const items = [
            ...recList.objects.map(o=>({ key:o.key, size:o.size, uploaded:o.uploaded, prefix:'rec/' })),
            ...recordingsList.objects.map(o=>({ key:o.key, size:o.size, uploaded:o.uploaded, prefix:'recordings/' })),
          ];
          return new Response(JSON.stringify({ ok:true, total: items.length, recCount: recList.objects.length, recordingsCount: recordingsList.objects.length, items }, null, 2), { headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} });
        }
        const obj = await env.RECORDINGS.head(k);
        return new Response(JSON.stringify({
          ok: true, key: k, exists: !!obj,
          size: obj?.size, uploaded: obj?.uploaded,
          contentType: obj?.httpMetadata?.contentType
        }, null, 2), { headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'} });
      } catch(e:any) {
        return new Response(JSON.stringify({ ok:false, error: e?.message }), { headers:{'Content-Type':'application/json'} });
      }
    }

    // R2 녹화 저장소 연결 테스트
    if (path === '/api/recordings/test-r2' && request.method === 'GET') {
      try {
        if (!env.RECORDINGS) return new Response(JSON.stringify({ ok: false, error: 'RECORDINGS bucket not bound' }), { headers: { 'Content-Type': 'application/json' } });
        const testKey = '_test/' + Date.now() + '.txt';
        await env.RECORDINGS.put(testKey, 'test-' + Date.now(), { httpMetadata: { contentType: 'text/plain' } });
        const obj = await env.RECORDINGS.get(testKey);
        const text = obj ? await obj.text() : null;
        await env.RECORDINGS.delete(testKey);
        // 녹화 파일 목록도 확인
        const recList = await env.RECORDINGS.list({ prefix: 'recordings/', limit: 10 });
        return new Response(JSON.stringify({
          ok: true, bucket: 'connected', testWrite: !!text, testContent: text,
          recordingFiles: recList.objects.map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }))
        }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── 자동녹화 R2 multipart upload + stream (auto-recording-patch) ──
    // 기존 /api/recordings/blob 보다 먼저 매칭해야 함
    if (path.startsWith('/api/recordings/upload') || path.startsWith('/api/recordings/stream')) {
      const res = await handleR2MultipartUpload(request, url, env as any);
      if (res) return res;
    }

    // ── 녹화 완료: blob 업로드 + DB 업데이트를 한 번에 처리 ──
    if (path === '/api/recordings/complete' && request.method === 'POST') {
      return await handleRecordingComplete(request, env);
    }

    // R2 녹화 블롭 저장소 (MediaRecorder → POST /api/recordings/blob/upload)
    // Mango DB API(`/api/recordings`)와 공존하도록 `/blob/` 서브경로 사용
    if (path === '/api/recordings/blob/upload' && request.method === 'POST') {
      return await handleRecordingUpload(request, env);
    }
    if (path === '/api/recordings/blob/list' && request.method === 'GET') {
      return await handleRecordingList(request, env);
    }
    if (path.startsWith('/api/recordings/blob/') && request.method === 'GET') {
      return await handleRecordingDownload(path, request, env);
    }
    if (path.startsWith('/api/recordings/blob/') && request.method === 'DELETE') {
      return await handleRecordingDelete(path, env);
    }

    // 🔐 Phase 11 — 관리자 인증·세션 API
    //    /api/admin/login·logout 은 isAuthPublicPath 로 미들웨어 우회됨.
    //    그 외 (me·profile·change-password·login-history·sessions/*) 는 위 미들웨어가 인증 강제.
    if (path === '/api/admin/login' ||
        path === '/api/admin/logout' ||
        path === '/api/admin/me' ||
        path === '/api/admin/profile' ||
        path === '/api/admin/change-password' ||
        path === '/api/admin/login-history' ||
        path === '/api/admin/sessions' ||
        path === '/api/admin/sessions/revoke') {
      const authRes = await handleAdminAuthApi(request, url, env);
      if (authRes) return authRes;
    }

    // v3 명세서 신규 API (출석/보상/카카오/대시보드)
    // ⚠ 새 API 경로를 api-mango.ts 에 추가했을 때는 반드시 이 게이트에도 등록할 것.
    //    여기 목록에 없으면 index.html 로 fallthrough → CF Assets 가 POST 에 405 반환.
    if (path.startsWith('/api/attendance') ||
        path.startsWith('/api/speaking-time') ||
        path.startsWith('/api/gaze-score') ||
        path.startsWith('/api/kakao-id') ||
        path.startsWith('/api/emergency') ||
        path.startsWith('/api/reward') ||
        path.startsWith('/api/consents') ||
        path.startsWith('/api/recordings') ||
        path.startsWith('/api/admin/student/') ||
        path.startsWith('/api/admin/room/') ||
        path === '/api/admin/notifications' ||
        path === '/api/admin/notifications/test' ||
        /^\/api\/admin\/notifications\/\d+$/.test(path) ||
        path.startsWith('/api/admin/export/') ||
        path.startsWith('/api/admin/stats/') ||
        path === '/api/admin/ai-command' ||
        path === '/api/admin/ai-action' ||
        path === '/api/admin/teacher-profiles' ||
        /^\/api\/admin\/teacher-profiles\/\d+$/.test(path) ||
        path === '/api/admin/teachers' ||
        /^\/api\/admin\/teachers\/\d+$/.test(path) ||
        path === '/api/admin/teacher-hours' ||
        path === '/api/admin/teacher-classes' ||
        path === '/api/admin/teacher-evaluation' ||
        path.startsWith('/api/admin/payroll/') ||
        path === '/api/admin/payroll/all' ||
        path === '/api/admin/payroll/rates' ||
        path === '/api/admin/payroll/finalize' ||
        path === '/api/admin/payroll/seed-demo' ||
        path === '/api/admin/franchises' ||
        path === '/api/admin/centers' ||
        path === '/api/admin/level-tests' ||
        path === '/api/admin/enrollments' ||
        /^\/api\/admin\/enrollments\/\d+$/.test(path) ||
        path === '/api/admin/community-posts' ||
        /^\/api\/admin\/community-posts\/\d+$/.test(path) ||
        path === '/api/admin/textbooks' ||
        path === '/api/admin/students/list' ||
        path === '/api/admin/students/erp-list' ||
        path === '/api/admin/students/erp' ||
        path === '/api/admin/students/erp-seed' ||
        path === '/api/community/posts' ||
        path === '/api/teacher-profiles' ||
        path === '/api/_bootstrap' ||
        path === '/api/dashboard') {
      const res = await handleMangoApi(request, url, env);
      if (res) return res;
    }

    // 📥 회계 리포트 6종 (2026-05-03 추가)
    //   /api/admin/reports/{monthly|quarterly|annual|franchise|payslips|kpi}
    //   format=json (기본) | csv 다운로드
    if (path.startsWith('/api/admin/reports/')) {
      return reportsRouter(request, env);
    }

    // WebSocket upgrade for signaling
    if (path.startsWith('/ws/signaling')) {
      return await handleSignalingWebSocket(request, url, env);
    }

    // WebSocket upgrade for video-call
    if (path.startsWith('/ws/video-call')) {
      return await handleVideoCallWebSocket(request, url, env);
    }

    // 관리 대시보드 경로
    if (path === '/admin' || path === '/admin/') {
      const adminRequest = new Request(new URL('/admin.html', request.url).toString(), request);
      return env.ASSETS.fetch(adminRequest);
    }

    // 🩺 /admin/health 셀프 진단 페이지 — 별도 HTML 파일로 내부 포워딩
    if (path === '/admin/health' || path === '/admin/health/') {
      const healthRequest = new Request(new URL('/admin/health.html', request.url).toString(), request);
      return env.ASSETS.fetch(healthRequest);
    }

    // 🎓 /admin/student — 학생별 드릴다운 페이지 (Phase 2)
    //   쿼리: ?uid=<user_id>&days=30
    if (path === '/admin/student' || path === '/admin/student/') {
      const studentRequest = new Request(new URL('/admin/student.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(studentRequest);
    }

    // 👨‍🎓 /admin/students — 학생 목록 ERP 풀페이지 (Phase 10)
    if (path === '/admin/students' || path === '/admin/students/') {
      const r = new Request(new URL('/admin/students.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 🔐 /admin/login — 로그인 페이지 (Phase 11) — 비인증 허용
    if (path === '/admin/login' || path === '/admin/login/') {
      const r = new Request(new URL('/admin/login.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 👤 /admin/mypage — 마이페이지 (Phase 11)
    if (path === '/admin/mypage' || path === '/admin/mypage/') {
      const r = new Request(new URL('/admin/mypage.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // Static assets (실제 파일 확장자가 있는 요청)
    if (path.match(/\.\w+$/)) {
      const assetResp = await env.ASSETS.fetch(request);
      // HTML/JS/CSS는 캐시 방지 (항상 최신 버전)
      if (path.match(/\.(html|js|css)$/)) {
        const assetHeaders = new Headers(assetResp.headers);
        assetHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        return new Response(assetResp.body, { status: assetResp.status, headers: assetHeaders });
      }
      return assetResp;
    }

    // SPA 라우팅: API/WS가 아닌 모든 경로에서 index.html 반환
    // (예: /signaling, /video-call 등 → SPA가 클라이언트에서 처리)
    // ⚠ html_handling = "none" 이라 `/` 가 index.html 로 자동 매핑되지 않음 → 명시적으로 /index.html 요청.
    const indexRequest = new Request(new URL('/index.html', request.url).toString(), request);
    const resp = await env.ASSETS.fetch(indexRequest);
    // HTML 캐시 방지 — 브라우저가 항상 최신 버전을 받도록
    const headers = new Headers(resp.headers);
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
    return new Response(resp.body, { status: resp.status, headers });
  },

  // Cron Trigger: 매일 KST 03:00 (UTC 18:00) 보관기간 만료 데이터 자동 파기
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try {
        const result = await purgeExpired(env);
        console.log('[retention] purged', JSON.stringify(result));
      } catch (err) {
        console.error('[retention] error', err);
      }
    })());
  }
};

async function handleHealth(): Promise<Response> {
  const response: HealthResponse = {
    status: 'ok',
    message: 'WebRTC Unified Platform Worker is running',
    timestamp: Date.now()
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleTurnConfig(env: Env): Promise<Response> {
  // Cloudflare TURN 키가 설정되어 있으면 동적 자격증명 생성
  if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
    try {
      const cfResp = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.TURN_KEY_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ttl: 86400 }) // 24시간 유효
        }
      );
      if (cfResp.ok) {
        const cfData: any = await cfResp.json();
        // Cloudflare가 반환한 iceServers에 Google STUN도 추가
        const iceServers = [
          { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
          ...(cfData.iceServers || [])
        ];
        return new Response(JSON.stringify({ iceServers }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      console.error('Cloudflare TURN API error:', cfResp.status, await cfResp.text());
    } catch (err) {
      console.error('Cloudflare TURN fetch error:', err);
    }
  }

  // Fallback: 정적 STUN + 공개 TURN 서버들
  const response = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: ['stun:stun.cloudflare.com:3478'] },
      // 공개 TURN 서버 (폴백)
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handlePdfUpload(request: Request, env: Env): Promise<Response> {
  try {
    const contentType = request.headers.get('content-type') || '';
    let buffer: ArrayBuffer;
    let originalName: string;
    let mimeType: string;

    if (contentType.includes('multipart/form-data')) {
      // 구형 클라이언트: FormData 업로드
      const formData = await request.formData();
      const file = formData.get('pdf') as File | null;
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      mimeType = file.type;
      originalName = file.name;
      buffer = await file.arrayBuffer();
    } else {
      // 신형 클라이언트: raw 바이너리 업로드 (프리뷰 호환)
      const url = new URL(request.url);
      originalName = url.searchParams.get('filename') || 'upload.pdf';
      mimeType = contentType || 'application/pdf';
      buffer = await request.arrayBuffer();
    }

    if (mimeType !== 'application/pdf') {
      return new Response(JSON.stringify({ error: 'Only PDF files are allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const size = buffer.byteLength;
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (size > maxSize) {
      return new Response(JSON.stringify({ error: 'File too large (max 50MB)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 한글/특수문자 파일명 안전하게 처리: ASCII만 남기고 나머지는 _로 치환
    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `pdf-${Date.now()}-${safeName}`;

    // R2 업로드 (KV는 put 일일한도 1,000회라서 PDF 저장에 부적합)
    const r2 = (env as any).RECORDINGS as R2Bucket | undefined;
    if (r2) {
      await r2.put(`pdfs/${fileKey}`, buffer, {
        httpMetadata: { contentType: 'application/pdf' },
        customMetadata: { originalName, uploadedAt: new Date().toISOString(), size: String(size) }
      });
    } else {
      await env.PDF_STORE.put(fileKey, buffer, {
        metadata: { originalName, uploadedAt: new Date().toISOString(), size } as any
      });
    }

    const response: PdfUploadResponse = {
      success: true,
      filename: originalName,
      url: `/api/video-call/pdf/${fileKey}`
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('PDF upload error:', err);
    return new Response(JSON.stringify({ error: 'Upload failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePdfList(env: Env): Promise<Response> {
  try {
    const r2 = (env as any).RECORDINGS as R2Bucket | undefined;
    let pdfs: any[] = [];
    if (r2) {
      const r2List = await r2.list({ prefix: 'pdfs/' });
      pdfs = r2List.objects.map(o => ({
        filename: o.customMetadata?.originalName || o.key.replace('pdfs/', ''),
        url: `/api/video-call/pdf/${o.key.replace('pdfs/', '')}`,
        uploadedAt: o.customMetadata?.uploadedAt || o.uploaded?.toISOString?.() || null
      }));
    }
    const list = await env.PDF_STORE.list();
    const kvPdfs = list.keys.map(key => ({
      filename: (key.metadata as any)?.originalName || key.name,
      url: `/api/video-call/pdf/${key.name}`,
      uploadedAt: (key.metadata as any)?.uploadedAt || null
    }));
    pdfs = [...pdfs, ...kvPdfs];
    // eslint-disable-next-line no-constant-condition
    if (false) {}

    return new Response(JSON.stringify(pdfs), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('PDF list error:', err);
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePdfDownload(path: string, env: Env): Promise<Response> {
  try {
    const rawKey = path.replace('/api/video-call/pdf/', '');
    const fileKey = decodeURIComponent(rawKey);

    if (!fileKey) {
      return new Response(JSON.stringify({ error: 'No file key provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // R2 우선 조회, 없으면 기존 KV fallback
    const r2 = (env as any).RECORDINGS as R2Bucket | undefined;
    let bodyStream: ReadableStream<Uint8Array> | null = null;
    let pdfBuffer: ArrayBuffer | null = null;
    if (r2) {
      const obj = await r2.get(`pdfs/${fileKey}`);
      if (obj) bodyStream = obj.body;
    }
    if (!bodyStream) {
      const kv = await env.PDF_STORE.get(fileKey, { type: 'arrayBuffer' });
      if (kv) pdfBuffer = kv;
    }

    if (!bodyStream && !pdfBuffer) {
      return new Response(JSON.stringify({ error: 'PDF not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(bodyStream || pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (err) {
    console.error('PDF download error:', err);
    return new Response(JSON.stringify({ error: 'Download failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleSignalingWebSocket(request: Request, url: URL, env: Env): Promise<Response> {
  const roomId = url.searchParams.get('roomId') || 'default';

  try {
    const durableObjectId = env.SIGNALING_ROOM.idFromName(roomId);
    const durableObject = env.SIGNALING_ROOM.get(durableObjectId);

    const response = await durableObject.fetch(request);
    return response;
  } catch (err) {
    console.error('Signaling WebSocket error:', err);
    return new Response('WebSocket connection failed', { status: 500 });
  }
}

async function handleVideoCallWebSocket(request: Request, url: URL, env: Env): Promise<Response> {
  const roomId = url.searchParams.get('roomId') || 'default';

  try {
    const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
    const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);

    const response = await durableObject.fetch(request);

    // 활성 방 목록에 등록 (fire-and-forget — WebSocket 연결을 차단하지 않음)
    env.SESSION_STATE.put(`active-room:${roomId}`, JSON.stringify({
      roomId,
      lastActivity: Date.now()
    }), { expirationTtl: 600 }).catch(() => {});

    return response;
  } catch (err) {
    console.error('VideoCall WebSocket error:', err);
    return new Response('WebSocket connection failed', { status: 500 });
  }
}

async function handleActiveRooms(env: Env): Promise<Response> {
  try {
    // KV 바인딩이 없는 경우 빈 배열로 안전 반환
    if (!env.SESSION_STATE) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // KV에서 active-room: 프리픽스로 활성 방 목록 조회
    const list = await env.SESSION_STATE.list({ prefix: 'active-room:' });
    const rooms: any[] = [];

    for (const key of list.keys) {
      const roomId = key.name.replace('active-room:', '');
      try {
        // 각 Durable Object에 상태 질의
        const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
        const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);
        const statusUrl = new URL(`https://internal/status?roomId=${roomId}`);
        const statusResp = await durableObject.fetch(statusUrl.toString());

        // 응답이 JSON 이 아니거나 비정상이면 KV 정리 후 continue
        let status: any = null;
        if (statusResp.ok) {
          const text = await statusResp.text();
          try { status = JSON.parse(text); } catch { status = null; }
        }

        if (!status || typeof status.userCount !== 'number' || status.userCount === 0) {
          try { await env.SESSION_STATE.delete(key.name); } catch {}
          continue;
        }
        rooms.push(status);
      } catch (e) {
        // DO가 이미 사라진 경우 KV 정리 — 정리 실패는 무시
        try { await env.SESSION_STATE.delete(key.name); } catch {}
      }
    }

    return new Response(JSON.stringify(rooms), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    console.error('[active-rooms] error:', err);
    // 관리자 UI 가 빈 배열도 정상적으로 처리하므로, 500 대신 []+200 반환
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

async function handleRoomStatus(roomId: string, env: Env): Promise<Response> {
  try {
    const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
    const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);
    const statusUrl = new URL(`https://internal/status?roomId=${roomId}`);
    const statusResp = await durableObject.fetch(statusUrl.toString());
    const data = await statusResp.text();
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ───────────────────────────────────────────────
// R2 녹화 블롭 저장소 핸들러
// ───────────────────────────────────────────────
function recordingJson(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * handleRecordingComplete — blob 업로드 + DB 업데이트를 한 번에 처리
 * 메타데이터는 URL 쿼리 파라미터로 전달 (커스텀 헤더 없음)
 *
 * URL: /api/recordings/complete?recording_id=X&room_id=Y&duration_ms=Z
 * Body: 녹화 blob 바이너리
 */
async function handleRecordingComplete(request: Request, env: Env): Promise<Response> {
  const url2 = new URL(request.url);
  const recordingId = url2.searchParams.get('recording_id') || request.headers.get('x-recording-id') || '';
  const roomId = (url2.searchParams.get('room_id') || request.headers.get('x-room-id') || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const durationMs = parseInt(url2.searchParams.get('duration_ms') || request.headers.get('x-duration-ms') || '0', 10);
  const ts = Date.now();
  const recIdNum = parseInt(recordingId, 10);

  // 디버그: 모든 단계의 결과를 DB에 기록
  const debugLog: string[] = [];
  debugLog.push('START:' + ts);
  debugLog.push('recId:' + recordingId + ',room:' + roomId + ',dur:' + durationMs);
  debugLog.push('hasR2:' + !!env.RECORDINGS + ',hasDB:' + !!env.DB);

  try {
    if (!env.RECORDINGS) {
      debugLog.push('ERR:NO_R2_BUCKET');
      await _saveDebug(env, recIdNum, debugLog, 0);
      return recordingJson({ ok: false, error: 'R2 bucket RECORDINGS not configured' }, 500);
    }

    const contentType = request.headers.get('content-type') || 'video/webm';
    debugLog.push('ct:' + contentType);

    // 1) blob 읽기
    let body: ArrayBuffer;
    try {
      body = await request.arrayBuffer();
      debugLog.push('bodyOK:' + body.byteLength);
    } catch (bodyErr: any) {
      debugLog.push('ERR:BODY:' + String(bodyErr?.message || bodyErr));
      await _saveDebug(env, recIdNum, debugLog, 0);
      return recordingJson({ ok: false, error: 'Body read failed: ' + bodyErr?.message }, 500);
    }

    const sizeBytes = body.byteLength;
    if (sizeBytes === 0) {
      debugLog.push('ERR:EMPTY_BODY');
      await _saveDebug(env, recIdNum, debugLog, 0);
      return recordingJson({ ok: false, error: 'Empty body' }, 400);
    }

    // 2) R2에 저장
    const date = new Date().toISOString().slice(0, 10);
    const key = `recordings/${roomId}/${date}/${ts}.webm`;
    debugLog.push('key:' + key);

    let r2ok = false;
    try {
      await env.RECORDINGS.put(key, body, {
        httpMetadata: { contentType: contentType.split(';')[0].trim() },
        customMetadata: { roomId, recordingId, size: String(sizeBytes) }
      });
      r2ok = true;
      debugLog.push('R2:OK');
    } catch (r2Err: any) {
      debugLog.push('ERR:R2:' + String(r2Err?.message || r2Err));
    }

    const fileUrl = r2ok ? key : ('DEBUG:' + debugLog.join('|'));
    const playUrl = r2ok ? `/api/recordings/blob/${encodeURIComponent(key)}` : '';

    // 3) DB 업데이트 - 항상 실행 (에러 내용도 file_url에 기록)
    if (!isNaN(recIdNum) && recIdNum > 0 && env.DB) {
      try {
        await env.DB.prepare(
          `UPDATE recordings SET ended_at = ?, duration_ms = ?, size_bytes = ?, status = 'completed',
           file_url = ?, storage = ?
           WHERE id = ?`
        ).bind(ts, durationMs, sizeBytes, fileUrl, r2ok ? 'r2' : 'debug', recIdNum).run();
        debugLog.push('DB:OK');
      } catch (dbErr: any) {
        debugLog.push('ERR:DB:' + String(dbErr?.message || dbErr));
      }
    } else {
      debugLog.push('SKIP_DB:recId=' + recordingId);
    }

    return recordingJson({
      ok: r2ok,
      key: r2ok ? key : null,
      url: playUrl,
      recording_id: recordingId,
      size: sizeBytes,
      duration_ms: durationMs,
      debug: debugLog.join('|')
    });
  } catch (err: any) {
    // 최상위 에러도 DB에 기록
    const errMsg = 'FATAL:' + String(err?.message || err);
    if (!isNaN(recIdNum) && recIdNum > 0 && env.DB) {
      try {
        await env.DB.prepare(
          `UPDATE recordings SET file_url = ?, storage = 'debug' WHERE id = ?`
        ).bind(errMsg, recIdNum).run();
      } catch (_) {}
    }
    return recordingJson({ ok: false, error: String(err?.message || err) }, 500);
  }
}

async function _saveDebug(env: Env, recId: number, log: string[], size: number) {
  if (isNaN(recId) || recId <= 0 || !env.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE recordings SET file_url = ?, storage = 'debug', size_bytes = ? WHERE id = ?`
    ).bind('DEBUG:' + log.join('|'), size, recId).run();
  } catch (_) {}
}

async function handleRecordingUpload(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.RECORDINGS) {
      return recordingJson({ error: 'R2 bucket RECORDINGS not configured' }, 500);
    }

    const contentType = request.headers.get('content-type') || 'video/webm';
    const allowed = (env.ALLOWED_RECORDING_MIME || 'video/webm,video/mp4').split(',').map(s => s.trim());
    const baseType = contentType.split(';')[0].trim();
    if (!allowed.includes(baseType)) {
      return recordingJson({ error: `Disallowed mime type: ${baseType}` }, 400);
    }

    const maxMb = parseInt(env.MAX_RECORDING_MB || '500', 10);
    const maxBytes = maxMb * 1024 * 1024;
    const lenHeader = request.headers.get('content-length');
    if (lenHeader && parseInt(lenHeader, 10) > maxBytes) {
      return recordingJson({ error: `File too large (max ${maxMb}MB)` }, 413);
    }

    const roomId = (request.headers.get('x-room-id') || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const rawName = request.headers.get('x-filename') || `recording-${Date.now()}.webm`;
    const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    const key = `${roomId}/${date}/${Date.now()}-${safeName}`;

    const body = await request.arrayBuffer();
    if (body.byteLength > maxBytes) {
      return recordingJson({ error: `File too large (max ${maxMb}MB)` }, 413);
    }

    await env.RECORDINGS.put(key, body, {
      httpMetadata: { contentType: baseType },
      customMetadata: {
        roomId,
        originalName: rawName,
        uploadedAt: new Date().toISOString(),
        size: String(body.byteLength)
      }
    });

    return recordingJson({
      success: true,
      key,
      url: `/api/recordings/blob/${encodeURIComponent(key)}`,
      size: body.byteLength
    });
  } catch (err: any) {
    console.error('[recording] upload error:', err);
    return recordingJson({ error: err?.message || 'Upload failed' }, 500);
  }
}

async function handleRecordingList(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.RECORDINGS) return recordingJson({ items: [] });
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || undefined;
    const listed = await env.RECORDINGS.list({ prefix, limit: 1000 });
    const items = listed.objects.map(o => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded,
      url: `/api/recordings/blob/${encodeURIComponent(o.key)}`,
      originalName: (o.customMetadata && o.customMetadata.originalName) || o.key.split('/').pop()
    }));
    return recordingJson({ items });
  } catch (err: any) {
    console.error('[recording] list error:', err);
    return recordingJson({ error: err?.message || 'List failed', items: [] }, 500);
  }
}

async function handleRecordingDownload(path: string, request: Request, env: Env): Promise<Response> {
  try {
    if (!env.RECORDINGS) return recordingJson({ error: 'R2 not configured' }, 500);
    const rawKey = path.replace('/api/recordings/blob/', '');
    const key = decodeURIComponent(rawKey);
    if (!key) return recordingJson({ error: 'No key provided' }, 400);

    const rangeHeader = request.headers.get('range');
    let range: { offset: number; length?: number } | undefined;
    if (rangeHeader) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : undefined;
        range = { offset: start, length: end !== undefined ? (end - start + 1) : undefined };
      }
    }

    const obj = range
      ? await env.RECORDINGS.get(key, { range })
      : await env.RECORDINGS.get(key);

    if (!obj) {
      // 🎬 R2 객체 없음 → DB 의 file_url 로 fallback redirect (다른 storage·외부 URL)
      try {
        const fname = key.startsWith('recordings/') ? key.slice('recordings/'.length) : key;
        const rs = await env.DB.prepare(
          'SELECT file_url FROM recordings WHERE filename = ? OR filename = ? LIMIT 1'
        ).bind(fname, key).first<any>();
        const fu = rs && (rs as any).file_url;
        if (fu && /^https?:\/\//.test(fu)) {
          return Response.redirect(fu, 302);
        }
      } catch(e) { /* DB 조회 실패해도 404 */ }
      return recordingJson({ error: 'Not found', key, hint: 'R2 객체가 없습니다. recordings 테이블의 file_url 도 비어 있습니다.' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', (obj.httpMetadata && obj.httpMetadata.contentType) || 'video/webm');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=3600');

    if (range && obj.size) {
      const start = range.offset;
      const end = range.length ? (start + range.length - 1) : (obj.size - 1);
      headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(obj.body, { status: 206, headers });
    }

    if (obj.size) headers.set('Content-Length', String(obj.size));
    return new Response(obj.body, { status: 200, headers });
  } catch (err: any) {
    console.error('[recording] download error:', err);
    return recordingJson({ error: err?.message || 'Download failed' }, 500);
  }
}

async function handleRecordingDelete(path: string, env: Env): Promise<Response> {
  try {
    if (!env.RECORDINGS) return recordingJson({ error: 'R2 not configured' }, 500);
    const rawKey = path.replace('/api/recordings/blob/', '');
    const key = decodeURIComponent(rawKey);
    if (!key) return recordingJson({ error: 'No key provided' }, 400);
    await env.RECORDINGS.delete(key);
    return recordingJson({ success: true, key });
  } catch (err: any) {
    console.error('[recording] delete error:', err);
    return recordingJson({ error: err?.message || 'Delete failed' }, 500);
  }
}

// ───────────────────────────────────────────────
// 🔒 관리자 Basic Auth 미들웨어
// ───────────────────────────────────────────────
/**
 * 관리자 보호 대상 경로 판별.
 * 학생용 API(출석 POST, 녹화 업로드, 시선 점수 POST 등) 는 건드리지 않음.
 * 학생 보상(POST /api/reward) 도 클라이언트 자동 호출이라 제외.
 */
function isAdminPath(path: string, method: string): boolean {
  // admin.html 페이지 자체 + /admin, /admin/ 리다이렉트
  if (path === '/admin' || path === '/admin/' || path === '/admin.html') return true;
  // 🩺 /admin/health 셀프 진단 페이지 + 그 전용 API (관리자만 접근)
  if (path === '/admin/health' || path === '/admin/health/' || path === '/admin/health.html') return true;
  if (path === '/api/admin/health-check') return true;
  // 🎓 /admin/student 드릴다운 페이지 + 그 전용 API (관리자만 접근)
  if (path === '/admin/student' || path === '/admin/student/' || path === '/admin/student.html') return true;
  if (path.startsWith('/api/admin/student/')) return true;
  // 👨‍🎓 /admin/students ERP 풀페이지 (Phase 10)
  if (path === '/admin/students' || path === '/admin/students/' || path === '/admin/students.html') return true;
  // 👤 /admin/mypage — 마이페이지 (Phase 11)
  if (path === '/admin/mypage' || path === '/admin/mypage/' || path === '/admin/mypage.html') return true;
  // 🔐 Phase 11 — 인증·세션 API (login·logout 만 isAuthPublicPath 로 예외)
  if (path === '/api/admin/me' || path === '/api/admin/profile') return true;
  if (path === '/api/admin/change-password') return true;
  if (path === '/api/admin/login-history') return true;
  if (path === '/api/admin/sessions' || path === '/api/admin/sessions/revoke') return true;
  // 🛑 관리자 개입 액션 (Phase 4) — 강제 종료 등 쓰기 작업
  if (path.startsWith('/api/admin/room/')) return true;
  // PATCH /api/recordings/{id}/status 도 관리자 전용 (복원·삭제 상태 변경)
  if (method === 'PATCH' && /^\/api\/recordings\/\d+\/status$/.test(path)) return true;
  // 📣 알림 큐 (Phase 5) — 관리자 전용
  if (path === '/api/admin/notifications' || path === '/api/admin/notifications/test') return true;
  if (/^\/api\/admin\/notifications\/\d+$/.test(path)) return true;
  // 📥 CSV 내보내기 (Phase 6) — 관리자 전용
  if (path.startsWith('/api/admin/export/')) return true;
  // 💰 저장소·비용 통계 (Phase 7) — 관리자 전용
  if (path.startsWith('/api/admin/stats/')) return true;
  // 🥭 Phase 21 — AI 명령 / 액션 (Workers AI)
  if (path === '/api/admin/ai-command' || path === '/api/admin/ai-action') return true;
  // 💼 강사 급여·평가 (Phase 8) — 관리자 전용
  if (path === '/api/admin/teachers' || /^\/api\/admin\/teachers\/\d+$/.test(path)) return true;
  // 🥭 Phase 34 — 강사 정보 (Teacher Profiles)
  if (path === '/api/admin/teacher-profiles' || /^\/api\/admin\/teacher-profiles\/\d+$/.test(path)) return true;
  if (path === '/api/admin/teacher-hours') return true;          // (deprecated, 호환성)
  if (path === '/api/admin/teacher-classes') return true;
  if (path === '/api/admin/teacher-evaluation') return true;
  if (path.startsWith('/api/admin/payroll/')) return true;
  // 🏢 Phase 9 — 추가 메뉴 6종
  if (path === '/api/admin/franchises') return true;
  if (path === '/api/admin/centers') return true;
  if (path === '/api/admin/level-tests') return true;
  if (path === '/api/admin/enrollments' || /^\/api\/admin\/enrollments\/\d+$/.test(path)) return true;
  if (path === '/api/admin/community-posts' || /^\/api\/admin\/community-posts\/\d+$/.test(path)) return true;
  if (path === '/api/admin/textbooks') return true;
  if (path === '/api/admin/students/list') return true;
  if (path === '/api/admin/students/erp-list' || path === '/api/admin/students/erp' || path === '/api/admin/students/erp-seed') return true;
  // 대시보드·활성 방·방 상태 — 모두 관리자 전용
  if (path === '/api/dashboard') return true;
  if (path === '/api/active-rooms') return true;
  if (path.startsWith('/api/room-status/')) return true;
  // 보관기간 파기 — 관리자만
  if (path.startsWith('/api/retention/')) return true;
  // R2 연결 테스트 — 관리자만
  if (path === '/api/recordings/test-r2') return true;
  // 녹화 목록·다운로드·DB삭제·R2삭제 는 관리자만.
  // 학생 클라이언트 자동 호출인 /start, /stop, /upload, /stream, /complete, /blob/upload 는 열어둠.
  if (path === '/api/recordings' && method === 'GET') return true;
  if (path === '/api/recordings/blob/list' && method === 'GET') return true;
  // 🎬 GET /api/recordings/blob/{key} — 학생 본인 녹화본 재생용. 공개 허용 (DELETE 만 관리자)
  if (path.startsWith('/api/recordings/blob/') && method === 'DELETE') return true;
  // DELETE /api/recordings/{숫자ID} (Mango DB 레코드 삭제) — 관리자
  // 단, /api/recordings/blob/* 는 위에서 이미 처리됐고, /start·/stop 은 POST 라 method 체크로 통과
  if (method === 'DELETE' && /^\/api\/recordings\/\d+$/.test(path)) return true;
  return false;
}

/**
 * Phase 11 — 비인증으로 접근 가능한 관리자 경로.
 *   - /admin/login (HTML)        : 로그인 페이지 자체
 *   - /api/admin/login (POST)    : 로그인 처리
 *   - /api/admin/logout (POST)   : 로그아웃 (인증 안 돼도 쿠키만 지우면 끝)
 */
function isAuthPublicPath(path: string): boolean {
  if (path === '/admin/login' || path === '/admin/login/' || path === '/admin/login.html') return true;
  if (path === '/api/admin/login') return true;
  if (path === '/api/admin/logout') return true;
  return false;
}

/**
 * 상수시간 문자열 비교 (타이밍 공격 방어).
 * 길이가 달라도 동일 순회로 맞춰서 빠른 리턴으로 비밀번호 길이가 노출되지 않도록 함.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Basic Auth 검사.
 * - ADMIN_PASSWORD 미설정 → null (fail-open, 경고 1회 로그)
 * - 유효한 인증 → null (통과)
 * - 인증 실패 → 401 Response
 *
 * Username 은 'admin' 고정, Password 는 env.ADMIN_PASSWORD.
 */
function checkAdminAuth(request: Request, env: Env): Response | null {
  const pw = env.ADMIN_PASSWORD;
  if (!pw || pw.length < 4) {
    // fail-open: 시크릿 미설정 상태에서는 통과시키되 경고만 기록
    // (최초 배포 → 시크릿 설정 사이의 lockout 방지)
    console.warn('[admin-auth] ADMIN_PASSWORD not configured — admin area unprotected');
    return null;
  }

  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) {
    return unauthorized();
  }

  try {
    const decoded = atob(header.slice('Basic '.length).trim());
    const colon = decoded.indexOf(':');
    if (colon < 0) return unauthorized();
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);
    const userOk = timingSafeEqual(user, 'admin');
    const passOk = timingSafeEqual(pass, pw);
    if (userOk && passOk) return null;
    return unauthorized();
  } catch {
    return unauthorized();
  }
}

function unauthorized(): Response {
  const body =
    '🔒 관리자 인증이 필요합니다.\n' +
    'Username: admin\n' +
    'Password: 운영자에게 문의하세요.\n';
  return new Response(body, {
    status: 401,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'WWW-Authenticate': 'Basic realm="Mangoi Admin", charset="UTF-8"',
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * 🩺 /admin/health 전용 셀프 진단 API.
 *
 * 목적: gaze-score 가 10초마다 405 를 뱉고 있어도 아무도 몰랐던 사고의 재발 방지.
 *   - 바인딩(D1/R2/KV) 이 실제로 살아있는지 진짜 호출해서 확인.
 *   - 시크릿(ADMIN_PASSWORD) 이 런타임에 바인딩됐는지 확인.
 *   - BUILD_STAMP 를 돌려줘서 "지금 떠 있는 코드가 언제 배포된 것인지" 한눈에.
 *
 * 엔드포인트 자가 ping 은 클라이언트 JS(/admin/health.html) 가 수행 — 실제 배포된
 * 라우트 동작을 브라우저 시점에서 정확히 반영하기 위함.
 */
async function handleHealthCheck(request: Request, env: Env): Promise<Response> {
  const startedAt = Date.now();
  const bindings: Record<string, any> = {};

  // --- D1 ----------------------------------------------------------
  try {
    const t0 = Date.now();
    const row: any = await env.DB.prepare('SELECT 1 AS ok').first();
    bindings.d1 = {
      status: row && row.ok === 1 ? 'ok' : 'warn',
      latencyMs: Date.now() - t0,
      detail: row ? `SELECT 1 → ${row.ok}` : 'no row'
    };
  } catch (e: any) {
    bindings.d1 = { status: 'error', error: String(e?.message || e) };
  }

  // --- R2 ----------------------------------------------------------
  try {
    if (!env.RECORDINGS) throw new Error('RECORDINGS binding missing');
    const t0 = Date.now();
    // head 는 존재 여부와 무관하게 버킷 연결만 검증 (null 이어도 정상)
    await env.RECORDINGS.head('__health_probe_sentinel__');
    bindings.r2 = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (e: any) {
    bindings.r2 = { status: 'error', error: String(e?.message || e) };
  }

  // --- KV: PDF_STORE ----------------------------------------------
  // ⚠ list() 는 일 1,000 무료 한도. 셀프 진단이 10초마다 호출 시 즉시 초과됨.
  //    get('__probe__') 는 read 한도(일 100,000)로 넘어가므로 100배 여유.
  //    없는 키는 null 반환(에러 아님), 실제 바인딩 연결 불량이면 throw.
  try {
    const t0 = Date.now();
    await env.PDF_STORE.get('__health_probe__');
    bindings.kv_pdf = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (e: any) {
    bindings.kv_pdf = { status: 'error', error: String(e?.message || e) };
  }

  // --- KV: SESSION_STATE ------------------------------------------
  try {
    const t0 = Date.now();
    await env.SESSION_STATE.get('__health_probe__');
    bindings.kv_session = { status: 'ok', latencyMs: Date.now() - t0 };
  } catch (e: any) {
    bindings.kv_session = { status: 'error', error: String(e?.message || e) };
  }

  // --- Durable Objects binding presence only (호출은 실제 방 진입에서만) ---
  bindings.do_signaling = { status: env.SIGNALING_ROOM ? 'ok' : 'error', configured: !!env.SIGNALING_ROOM };
  bindings.do_video_call = { status: env.VIDEO_CALL_ROOM ? 'ok' : 'error', configured: !!env.VIDEO_CALL_ROOM };

  // --- Secrets & vars ----------------------------------------------
  bindings.admin_password = {
    status: env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 4 ? 'ok' : 'warn',
    configured: !!env.ADMIN_PASSWORD,
    length: env.ADMIN_PASSWORD ? env.ADMIN_PASSWORD.length : 0,
    failOpenThreshold: 4
  };
  bindings.turn_key = {
    status: env.TURN_KEY_API_TOKEN ? 'ok' : 'warn',
    configured: !!env.TURN_KEY_API_TOKEN
  };
  bindings.livekit = {
    status: env.LIVEKIT_API_SECRET ? 'ok' : 'warn',
    configured: !!env.LIVEKIT_API_SECRET
  };

  // --- Build / deploy info ----------------------------------------
  const cf = (request as any).cf || {};
  const buildInfo = {
    stamp: env.BUILD_STAMP || '(not set — wrangler.toml vars.BUILD_STAMP 미설정)',
    workerNow: new Date().toISOString(),
    cfColo: cf.colo || '(unknown)',
    cfCountry: cf.country || '(unknown)'
  };

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    totalLatencyMs: Date.now() - startedAt,
    buildInfo,
    bindings
  }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
