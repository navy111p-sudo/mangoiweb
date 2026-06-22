/**
 * index.ts - Main Worker entry point
 * Handles routing, API endpoints, and WebSocket upgrades
 */

import { SignalingRoom } from './signaling-room';
import { VideoCallRoom } from './video-call-room';
import { HealthResponse, TurnConfigResponse, PdfUploadResponse } from './types';
import { handleMangoApi, runMonthlyReports } from './api-mango';
import { purgeExpired } from './retention';
import { purgeOrphanedRecordings } from './recordings-cleanup';
import { handleLivekit, ensureLivekitSchema } from './livekit-bridge';
import { handleRecordingUpload as handleR2MultipartUpload } from './recordings-r2';
import { handleAdminAuthApi, checkAdminSession } from './auth-admin';
import { reportsRouter } from './accounting-reports';
import { realtimeRouter, runFinanceSnapshot } from './accounting-realtime';
import { execRouter } from './exec-summary';
import { getScope } from './scope';
import { learningRouter, runLearningSnapshot } from './learning-insights';
import { marketingRouter } from './marketing-studio';

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

      // 🏪 대리점/지사(비-본사) 제한 뷰 — 본사 전용 콘솔/ API 차단, 자기 대시보드로 유도
      if (sess.ok) {
        const _sc = await getScope(env, request);
        if (_sc.type === 'agency' || _sc.type === 'branch') {
          // (1) 본사 전용 화면 전면 차단 → 자기 경영 대시보드(/admin/exec)로.
          //     허용 화면(exec·login·logout·mypage·health) 외 모든 /admin 페이지 리다이렉트.
          const _isAdminConsolePage = (path === '/admin' || path === '/admin/' || path === '/admin.html' || path.startsWith('/admin/'));
          if (_isAdminConsolePage && !isAgencyAllowedPage(path)) {
            return Response.redirect(new URL('/admin/exec', request.url).toString(), 302);
          }
          // (2) 본사 전용 API 는 차단(허용 목록만 통과) — URL 조작으로도 못 뚫음
          if (path.startsWith('/api/admin/') && !isAgencyAllowedApi(path)) {
            return new Response(JSON.stringify({ ok: false, error: 'forbidden_scope', scope: _sc.type }),
              { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
          }
        }
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
      // Inline admin health probe — no separate handler module needed.
      const probe: any = {
        ok: true,
        ts: new Date().toISOString(),
        build_stamp: (env as any)?.BUILD_STAMP || null,
        bindings: { DB: false, PDF_STORE: false, SESSION_STATE: false, RECORDINGS: false, AI: false, SIGNALING_ROOM: false, VIDEO_CALL_ROOM: false },
        secrets_present: {} as Record<string, boolean>,
      };
      try { probe.bindings.DB = !!(env as any)?.DB; } catch {}
      try { probe.bindings.PDF_STORE = !!(env as any)?.PDF_STORE; } catch {}
      try { probe.bindings.SESSION_STATE = !!(env as any)?.SESSION_STATE; } catch {}
      try { probe.bindings.RECORDINGS = !!(env as any)?.RECORDINGS; } catch {}
      try { probe.bindings.AI = !!(env as any)?.AI; } catch {}
      try { probe.bindings.SIGNALING_ROOM = !!(env as any)?.SIGNALING_ROOM; } catch {}
      try { probe.bindings.VIDEO_CALL_ROOM = !!(env as any)?.VIDEO_CALL_ROOM; } catch {}
      const secretKeys = ['VAPID_PUBLIC_KEY','VAPID_PRIVATE_KEY','VAPID_SUBJECT','KAKAO_API_KEY','KAKAO_TEMPLATE_ID','SOLAPI_API_KEY','SOLAPI_API_SECRET','SOLAPI_SENDER','GIFTISHOW_AUTH_CODE','GIFTISHOW_AUTH_TOKEN'];
      for (const k of secretKeys) probe.secrets_present[k] = !!(env as any)?.[k];
      try {
        if ((env as any)?.DB) {
          const r: any = await (env as any).DB.prepare('SELECT 1 AS one').first();
          probe.db_query_ok = r?.one === 1;
        }
      } catch (e: any) { probe.db_query_error = e?.message; }
      return new Response(JSON.stringify(probe, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    // TURN/STUN config endpoint
    if (path === '/api/turn-config') {
      if (url.searchParams.get('debug') === '1') {
        return await handleTurnConfigDebug(env);
      }
      return await handleTurnConfig(env);
    }

    // PDF upload endpoint
    if (path === '/api/video-call/upload-pdf' && request.method === 'POST') {
      return await handlePdfUpload(request, env);
    }

    // ✨ 칠판 손글씨 OCR (Workers AI 비전) — PNG 바이트(raw)를 받아 텍스트로 변환
    if (path === '/api/wb-ocr' && request.method === 'POST') {
      return await handleWbOcr(request, env);
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

    // 🔊 AI 운영비서 한국어 음성 프록시 — 아바타 Worker(/api/tts)를 같은 도메인에서 받아 CORS/무음 회피
    if (path === '/api/ops-tts' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (path === '/api/ops-tts' && request.method === 'POST') {
      try {
        const reqBody = await request.text();
        const up = await fetch('https://mangoi-ai-avatar-cf.navy111p.workers.dev/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: reqBody,
        });
        if (!up.ok || !up.body) return new Response('tts_upstream_' + up.status, { status: 502 });
        const ct = up.headers.get('Content-Type') || 'audio/mpeg';
        return new Response(up.body, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
      } catch (e: any) {
        return new Response('tts_proxy_error: ' + (e?.message || ''), { status: 502 });
      }
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
        path === '/api/student/ai-command' ||
        path === '/api/admin/omnisearch' ||
        path === '/api/admin/ai-action' ||
        path === '/api/admin/class-schedules' ||
        path === '/api/admin/class-schedules/seed-demo' ||
        path === '/api/admin/students/merge-duplicates' ||
        /^\/api\/admin\/class-schedules\/\d+$/.test(path) ||
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
        /^\/api\/get-lesson-video\/\d+$/.test(path) ||
        path === '/api/lesson-video' ||
        // 📚 Phase 39 — 교재 파일 라이브러리 + 망고아이 비디오
        path === '/api/admin/textbook-files' ||
        /^\/api\/admin\/textbook-files\/\d+$/.test(path) ||
        path === '/api/textbook-files' ||
        /^\/api\/textbook-files\/\d+(\/raw)?$/.test(path) ||
        path === '/api/admin/mango-videos' ||
        path === '/api/admin/mango-videos/import-channel' ||
        /^\/api\/admin\/mango-videos\/\d+$/.test(path) ||
        path === '/api/mango-videos' ||
        // 📲 카카오 알림톡 (SOLAPI) — 누락되어 있던 게이트 추가
        path === '/api/admin/kakao/status' ||
        path === '/api/admin/kakao/test-send' ||
        path.startsWith('/api/notify/') ||
        // 🪟 팝업/미디어 (관리자 + 공개)
        path === '/api/admin/popups' ||
        /^\/api\/admin\/popups\/\d+$/.test(path) ||
        path === '/api/admin/popups/upload-media' ||
        /^\/api\/admin\/popups\/\d+\/stats$/.test(path) ||
        path.startsWith('/api/popups/media/') ||
        path === '/api/popups' ||
        path === '/api/popups/active' ||
        /^\/api\/popups\/\d+\/(view|click|dismiss)$/.test(path) ||
        // 📅 Phase CAL — 캘린더(교사 휴가 + 한국/필리핀 공휴일)
        path === '/api/calendar/events' ||
        path === '/api/admin/calendar/events' ||
        /^\/api\/admin\/calendar\/events\/\d+$/.test(path) ||
        path === '/api/admin/calendar/seed-holidays' ||
        // 🧩 Phase RQ — 복습퀴즈 (관리자 출제 + 학생 풀이)
        path === '/api/review-quiz/list' ||
        path === '/api/review-quiz/get' ||
        path === '/api/review-quiz/submit' ||
        path === '/api/review-quiz/auto' ||
        path === '/api/review-quiz/tts' ||
        path === '/api/admin/review-quiz/list' ||
        path === '/api/admin/review-quiz/save' ||
        path === '/api/admin/review-quiz/toggle' ||
        path === '/api/admin/review-quiz/results' ||
        path === '/api/admin/review-quiz/ai-generate' ||
        path === '/api/admin/review-quiz/build-bank' ||
        // 📚 Phase HW — 숙제 관리 (출제/목록/삭제)
        path.startsWith('/api/admin/homework/') ||
        path === '/api/i18n/translate' ||
        /^\/api\/admin\/review-quiz\/\d+$/.test(path) ||
        path === '/api/admin/students/list' ||
        path === '/api/admin/students/unified' ||
        path === '/api/admin/students/erp-list' ||
        path === '/api/admin/students/erp' ||
        path === '/api/admin/students/erp-seed' ||
        path === '/api/community/posts' ||
        path === '/api/teacher-profiles' ||
        path === '/api/_bootstrap' ||
        path === '/api/dashboard' ||
        // 📊 Phase D1-D2 KPI Dashboard
        path === '/api/admin/kpi/dashboard' ||
        // 💸 Phase F1-F2 미납 자동 알림
        path === '/api/admin/payments/overdue' ||
        path === '/api/admin/payments/notify-overdue' ||
        path === '/api/admin/payments/notify-all-overdue' ||
        path === '/api/admin/payments/overdue-log' ||
        path === '/api/admin/payments/record' ||
        // 💬 Phase I1-I2 신규상담
        path.startsWith('/api/admin/inquiry/') ||
        // 💰 Phase G1-G2 강사 급여 자동 정산
        path === '/api/admin/payroll/calculate' ||
        path === '/api/admin/payroll/save' ||
        path === '/api/admin/payroll/mark-paid' ||
        path === '/api/admin/payroll/csv' ||
        // 💬 Phase K1 채팅
        path === '/api/chat/messages' ||
        path === '/api/chat/cleanup' ||
        // 📝 Phase E1-E4 평가서
        path === '/api/eval/create' ||
        path === '/api/eval/list' ||
        /^\/api\/eval\/\d+$/.test(path) ||
        path === '/api/admin/eval/list' ||
        // 🤖 Phase A1-A2 AI 학습 분석
        path === '/api/admin/ai-analyze/student' ||
        path === '/api/admin/ai-analyze/history' ||
        // 🔔 Phase WP1-WP2 Web Push
        path === '/api/push/vapid-public-key' ||
        path === '/api/push/subscribe' ||
        path === '/api/push/unsubscribe' ||
        path === '/api/push/pending' ||
        path === '/api/admin/push/send' ||
        path === '/api/admin/push/list' ||
        path === '/api/admin/push/status' ||
        path === '/api/admin/push/history' ||
        path === '/api/admin/push/generate-vapid' ||
        // 👨‍👩‍👧 Phase PD 부모 대시보드
        path === '/api/parent/dashboard' ||
        // 👪 Phase PC 부모-자녀 매핑
        path === '/api/parent/link-child' ||
        path === '/api/parent/my-children' ||
        // 🎮 Phase BG 배지/게이미피케이션
        path === '/api/badges/check' ||
        path === '/api/badges/list' ||
        path === '/api/admin/badges/stats' ||
        // 🎙 Phase TVS 음성 코칭 admin 통계
        path === '/api/admin/voice/all-stats' ||
        // 📚 Phase BE 일괄 평가서
        path === '/api/eval/bulk-create' ||
        // 🤖 Phase AEd AI 평가서 자동 작성
        path === '/api/eval/ai-draft' ||
        // 🚨 Phase ARR 이탈 위험 감지
        path === '/api/admin/retention/risk' ||
        // 🎁 Phase ARR-2 위험 학생 자동 케어 액션
        path === '/api/admin/retention/care' ||
        path === '/api/admin/retention/care/logs' ||
        // 🌅 Phase DB — 매일 아침 자동 일일 브리핑
        path === '/api/admin/briefing/generate' ||
        path === '/api/admin/briefing/latest' ||
        // 💰 Phase AD — 미납 자동 에스컬레이션
        path === '/api/admin/dunning/run' ||
        path === '/api/admin/dunning/log' ||
        // 🤖 Phase PFB — 학부모 상담 AI 챗봇
        path === '/api/parent/chat' ||
        path === '/api/admin/parent-chat/logs' ||
        // 📅 Phase AS — AI 주간 시간표 자동 짜기
        path === '/api/admin/schedule/auto' ||
        path === '/api/admin/schedule/approve' ||
        // 📈 Phase RCF — AI 매출/이탈 예측
        path === '/api/admin/forecast/revenue' ||
        path === '/api/admin/forecast/churn' ||
        // 📚 Phase VOC 단어장
        path === '/api/vocab/add' ||
        path === '/api/vocab/list' ||
        path === '/api/vocab/due' ||
        path === '/api/vocab/review' ||
        /^\/api\/vocab\/\d+$/.test(path) ||
        // 📄 Phase MR 월별 보고서 (HTML/PDF 페이지)
        /^\/api\/report\/monthly\/[^\/]+\/\d{4}-\d{2}$/.test(path) ||
        // 📊 Phase MAR 월간 AI 레포트 (관리자 생성/발송 + 공개 토큰 열람)
        path === '/api/admin/monthly-report/generate' ||
        path === '/api/admin/monthly-report/list' ||
        path === '/api/admin/monthly-report/send' ||
        path === '/api/admin/monthly-report/run-all' ||
        path === '/api/report/monthly-view' ||
        // 🧠 Phase MBTI 매칭
        path === '/api/teachers/mbti-list' ||
        path === '/api/admin/teacher/mbti' ||
        path === '/api/admin/teacher/mbti/seed-demo' ||
        path === '/api/mbti/match' ||
        // 🔥 Phase ST 데일리 스트릭 + 보석
        path === '/api/streak/check-in' ||
        path === '/api/streak/status' ||
        path === '/api/streak/leaderboard' ||
        // ✍️ Phase AW AI 영작 첨삭
        path === '/api/ai/write-correct' ||
        path === '/api/ai/write-history' ||
        // 💬 Phase CF AI 영어 친구 챗봇
        path === '/api/ai/chat-friend' ||
        path === '/api/ai/chat-history' ||
        path === '/api/ai/chat-clear' ||
        // 📅 Phase WD 부모 위클리 다이제스트
        path === '/api/parent/digest/preview' ||
        path === '/api/parent/digest/send-one' ||
        path === '/api/parent/digest/send-all' ||
        path === '/api/parent/digest/logs' ||
        // 🎙 Phase ALR — AI 학습 리포트 (수업 녹음 STT + LLM)
        path === '/api/eval/ai-lesson-report' ||
        path === '/api/eval/ai-lesson-report/list' ||
        /^\/api\/eval\/ai-lesson-report\/\d+$/.test(path) ||
        // 🔐 Phase RT — WebRTC 화상강의실 JWT 입장 토큰 (안전 모듈)
        /^\/api\/rooms\/[^\/]+\/(invite|join|verify-token|kick|members)$/.test(path) ||
        // 👁 Phase GM — 관리자 통제 (Ghost / Whisper / Alerts)
        path === '/api/admin/ghost/start' ||
        path === '/api/admin/ghost/end' ||
        path === '/api/admin/ghost/sessions' ||
        path === '/api/admin/whisper/send' ||
        path === '/api/admin/whisper/logs' ||
        path === '/api/admin/alerts' ||
        /^\/api\/admin\/alerts\/\d+\/ack$/.test(path) ||
        path === '/api/admin/alerts/test-fire' ||
        path === '/api/admin/forbidden-words' ||
        /^\/api\/admin\/forbidden-words\/\d+$/.test(path) ||
        path === '/api/admin/audit-logs' ||
        path === '/api/admin/chat-messages' ||
        path === '/api/admin/room-attendance' ||
        // 🧠 Phase ML 마이크로러닝 (AI 단어장 + 동의어 + 퀴즈 + 카톡)
        path === '/api/vocab/add-with-ai' ||
        path === '/api/vocab/auto-generate' ||
        path === '/api/vocab/gen-quiz' ||
        path === '/api/vocab/quiz-submit' ||
        path === '/api/vocab/synonyms' ||
        path === '/api/admin/microlearn/send-one' ||
        path === '/api/admin/microlearn/send-all' ||
        path === '/api/admin/microlearn/logs' ||
        // 🌟 Phase PR 교사 칭찬하기
        path === '/api/teachers/list-public' ||
        path === '/api/teacher/praise' ||
        path === '/api/admin/teacher/praise/list' ||
        path === '/api/admin/teacher/praise/stats' ||
        // 🔐 Phase LOGIN 통합 로그인
        path === '/api/student/login' ||
        path === '/api/student/lookup' ||
        path === '/api/student/set-password' ||
        // 🌐 Phase OAUTH 소셜 로그인
        path === '/api/oauth/status' ||
        /^\/api\/oauth\/(kakao|naver|google)\/(url|callback)$/.test(path) ||
        // 🎙 Phase AV AI 음성 코칭
        path === '/api/voice/tts' ||
        path === '/api/voice/transcribe' ||
        path === '/api/voice/coach' ||
        path === '/api/voice/history' ||
        path === '/api/voice/stats' ||
        // 💬 Phase K5 카카오 양방향
        path === '/api/webhook/kakao-inbound' ||
        path === '/api/admin/kakao/inbound' ||
        // 💰 카카오 알림톡 (확장)
        path === '/api/admin/gifts/status' ||
        path === '/api/admin/gifts/catalog' ||
        /^\/api\/admin\/gifts\/catalog\/\d+$/.test(path) ||
        path === '/api/admin/gifts/redemptions' ||
        path === '/api/admin/gifts/test-send' ||
        path === '/api/admin/points/list' ||
        path === '/api/admin/points/adjust' ||
        path === '/api/admin/points/rules' ||
        path === '/api/admin/points/seed-rules' ||
        path === '/api/admin/points/monthly-top' ||
        path === '/api/student/points' ||
        path === '/api/student/redeem-gift' ||
        // 💳 Phase RB — 정기결제 자동화
        path === '/api/subscription/create' ||
        path === '/api/admin/subscription/cancel' ||
        path === '/api/admin/subscriptions' ||
        path === '/api/admin/subscription/charge-now' ||
        path === '/api/admin/subscription/cron-check' ||
        // 🎁 Phase RF — 추천 친구 보상
        path === '/api/referral/my-code' ||
        path === '/api/referral/use' ||
        path === '/api/admin/referrals' ||
        path === '/api/admin/referrals/stats' ||
        // 📊 Phase CR — 자녀 성장 비교 리포트
        path === '/api/report/comparison' ||
        // 🌟 Phase NPS — 자동 NPS 설문
        path === '/api/admin/nps/send-monthly' ||
        path === '/api/nps/respond' ||
        path === '/api/admin/nps/stats' ||
        // 📅 Phase CB — 1:1 상담 자동 예약
        path === '/api/admin/counseling/slot/open' ||
        path === '/api/counseling/available-slots' ||
        path === '/api/counseling/book' ||
        path === '/api/admin/counseling/bookings' ||
        path === '/api/admin/counseling/cancel' ||
        // 📷 Phase QR — QR 출결
        path === '/api/admin/attendance/qr-gen' ||
        path === '/api/attendance/check-in' ||
        path === '/api/admin/attendance/today' ||
        path === '/api/admin/attendance/qr-history' ||
        // 📺 Phase VD — 비디오 자막 + AI 사전
        path === '/api/admin/video/subtitle-upload' ||
        path === '/api/video/subtitle' ||
        path === '/api/admin/video/subtitles' ||
        path === '/api/dictionary' ||
        path === '/api/vocab/save-from-dict' ||
        // 👨‍👩‍👧 Phase FAM — 가족 계정 통합
        path === '/api/admin/family/create' ||
        path === '/api/admin/family/add-child' ||
        path === '/api/admin/family/remove-child' ||
        path === '/api/admin/families' ||
        path === '/api/family/my-children' ||
        path === '/api/family/discount-status' ||
        // 📝 Phase MT — Mini TOEIC 자체 영어 시험
        path === '/api/admin/exam/create' ||
        path === '/api/admin/exam/question/add' ||
        path === '/api/admin/exam/question/ai-generate' ||
        path === '/api/admin/exams' ||
        /^\/api\/admin\/exam\/\d+$/.test(path) ||
        path === '/api/exam/list' ||
        path === '/api/exam/attempt/start' ||
        path === '/api/exam/attempt/submit-answer' ||
        path === '/api/exam/attempt/finish' ||
        path === '/api/exam/results' ||
        // 🎮 Phase BTL — 영어 게임 배틀 P2P
        path === '/api/battle/challenge' ||
        path === '/api/battle/incoming' ||
        path === '/api/battle/active' ||
        path === '/api/battle/accept' ||
        path === '/api/battle/decline' ||
        path === '/api/battle/submit-score' ||
        path === '/api/battle/history' ||
        path === '/api/battle/leaderboard' ||
        path === '/api/battle/word-set' ||
        // 🏆 Phase ALU — 졸업생 동문 커뮤니티
        path === '/api/alumni/register' ||
        path === '/api/alumni/list' ||
        path === '/api/alumni/profile' ||
        path === '/api/alumni/post' ||
        path === '/api/alumni/posts' ||
        path === '/api/alumni/post/like' ||
        // 📔 Phase VDI — AI 음성 일기
        path === '/api/diary/upload' ||
        path === '/api/diary/correct' ||
        path === '/api/diary/list' ||
        /^\/api\/diary\/\d+$/.test(path) ||
        path === '/api/diary/parent-notify' ||
        // 🎯 Phase SUP — 강사 슈퍼바이저 모드
        path === '/api/supervisor/assign' ||
        path === '/api/supervisor/active' ||
        path === '/api/supervisor/note' ||
        path === '/api/supervisor/notes/incoming' ||
        path === '/api/supervisor/note/ack' ||
        path === '/api/supervisor/end' ||
        // Audit-added: chat admin cleanup/stats
        path === '/api/admin/chat/cleanup' ||
        path === '/api/admin/chat/stats' ||
        // Audit-added: gift catalog + redeem + giftishow webhook
        path === '/api/admin/gifts/seed-catalog' ||
        path === '/api/gifts/catalog' ||
        path === '/api/gifts/redeem' ||
        path === '/api/gifts/redemptions' ||
        path === '/api/gifts/webhook/giftishow' ||
        // Audit-added: points balance + earn-by-rule
        path === '/api/points/balance' ||
        path === '/api/points/earn-by-rule' ||
        // Audit-added: student recordings listing
        path === '/api/student/recordings') {
      // fix (2026-06-01) — 미처리 예외가 Cloudflare 503 으로 새지 않도록 방어:
      //   어떤 경우에도 JSON 응답을 보장 (콘솔 503 도배 방지).
      try {
        const res = await handleMangoApi(request, url, env);
        if (res) return res;
      } catch (e: any) {
        return new Response(
          JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
        );
      }
    }

    // 📥 회계 리포트 6종 (2026-05-03 추가)
    //   /api/admin/reports/{monthly|quarterly|annual|franchise|payslips|kpi}
    //   format=json (기본) | csv 다운로드
    if (path.startsWith('/api/admin/reports/')) {
      return reportsRouter(request, env);
    }

    // 💸 실시간 수입·지출 분석 & 재무 스냅샷 (2026-06-03 추가)
    //   /api/admin/realtime/{summary|daily|weekly|expenses|snapshots|snapshot}
    //   기존 reports 와 prefix 분리 + 자체 try/catch 로 독립 동작
    if (path.startsWith('/api/admin/realtime/')) {
      return realtimeRouter(request, env);
    }

    // 🧹 R2 고아 파일(기록 없음) 청소 — 관리자 수동 트리거 / 미리보기
    //   GET  /api/admin/recordings/cleanup            → dry-run(분석만, 삭제 X)
    //   POST /api/admin/recordings/cleanup            → 실제 삭제 실행(안전장치 포함)
    //   GET  /api/admin/recordings/cleanup?status=1   → 마지막 실행 결과(KV) 조회
    //   (auth 는 상단 관리자 세션 미들웨어가 이미 보장)
    if (path === '/api/admin/recordings/cleanup') {
      const J = (o: any, st = 200) =>
        new Response(JSON.stringify(o), {
          status: st,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      try {
        // 마지막 실행 결과 조회
        if (request.method === 'GET' && url.searchParams.get('status')) {
          const last = await env.SESSION_STATE.get('recordings-cleanup:last_run');
          return J({ ok: true, last_run: last ? JSON.parse(last) : null });
        }
        // POST = 실제 삭제, GET = dry-run(안전 기본값)
        const dryRun = request.method !== 'POST';
        const res = await purgeOrphanedRecordings(env as any, { dryRun });
        return J({ ok: !res.aborted_by_guard, result: res });
      } catch (err: any) {
        return J({ ok: false, error: err?.message || String(err) }, 500);
      }
    }

    // 💸 /admin/finance-realtime — 실시간 재무 대시보드 페이지 (관리자 전용)
    if (path === '/admin/finance-realtime' || path === '/admin/finance-realtime/') {
      const r = new Request(new URL('/admin/finance-realtime.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 📊 경영진 일일 요약 API (2026-06-09 추가)
    //   /api/admin/exec/{summary|series|detail}
    if (path.startsWith('/api/admin/exec/')) {
      return execRouter(request, env);
    }

    // 📊 /admin/exec — 경영진 대시보드 페이지 (관리자 전용)
    if (path === '/admin/exec' || path === '/admin/exec/') {
      const r = new Request(new URL('/admin/exec.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 🎓 학습 인사이트: 위험도 세그먼트 & 장기 트렌드 (2026-06-03 추가)
    //   /api/admin/learning/{overview|segments|trends|snapshots|snapshot}
    //   기존 ai-analyze(온디맨드 AI)와 별개 — 룰 기반 집계, 자체 try/catch 독립 동작
    if (path.startsWith('/api/admin/learning/')) {
      return learningRouter(request, env);
    }

    // 🎓 /admin/learning-insights — 학습 인사이트 대시보드 페이지 (관리자 전용)
    if (path === '/admin/learning-insights' || path === '/admin/learning-insights/') {
      const r = new Request(new URL('/admin/learning-insights.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 📣 마케팅 스튜디오: 차별화 카피 생성 & 타겟팅 (2026-06-03 추가)
    //   /api/admin/marketing/{segments|channels|generate|campaigns}
    //   기존 발송 인프라와 별개 — 콘텐츠 제작/타겟팅 계층, 자체 try/catch 독립 동작
    if (path.startsWith('/api/admin/marketing/')) {
      return marketingRouter(request, env);
    }

    // 📣 /admin/marketing-studio — 마케팅 스튜디오 페이지 (관리자 전용)
    if (path === '/admin/marketing-studio' || path === '/admin/marketing-studio/') {
      const r = new Request(new URL('/admin/marketing-studio.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // WebSocket upgrade for signaling
    if (path.startsWith('/ws/signaling')) {
      return await handleSignalingWebSocket(request, url, env);
    }

    // WebSocket upgrade for video-call
    if (path.startsWith('/ws/video-call')) {
      return await handleVideoCallWebSocket(request, url, env, ctx);
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

    // 🧑‍🎓 /admin/students-unified — 통합 학생관리(단일 화면)
    if (path === '/admin/students-unified' || path === '/admin/students-unified/') {
      const r = new Request(new URL('/admin/students-unified.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
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

  // Cron Trigger
  //   - UTC 18:00 (KST 03:00) : 보관기간 만료 데이터 자동 파기
  //   - UTC 10:00 (KST 19:00) : 학생 일일 streak/참여 푸시 알림
  //   - UTC 10:00 + 금요일      : 학부모 위클리 다이제스트 일괄 발송 (Phase WD)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const date = new Date(event.scheduledTime);
    const hour = date.getUTCHours();
    // KST 기준 요일 (UTC + 9시간) — Friday = 5
    const kstDay = new Date(event.scheduledTime + 9 * 3600 * 1000).getUTCDay();

    ctx.waitUntil((async () => {
      // ── UTC 18:00 — retention purge
      if (hour === 18) {
        try {
          const result = await purgeExpired(env);
          console.log('[retention] purged', JSON.stringify(result));
        } catch (err) {
          console.error('[retention] error', err);
        }

        // 🧹 R2 고아 파일 청소 (KST 03:00) — D1 메타 없는 R2 객체 자동 삭제
        //   매일 돌려도 안전: 50% 안전장치 + 24h grace 로 in-flight 보호.
        //   ctx.waitUntil 안에서 실행되므로 실패해도 다른 cron 에 무영향.
        try {
          const clean = await purgeOrphanedRecordings(env);
          console.log('[recordings-cleanup] cron ran', JSON.stringify({
            total: clean.total_objects,
            orphans: clean.orphan_count,
            deleted: clean.deleted_count,
            freed: clean.deleted_human,
            aborted: clean.aborted_by_guard,
          }));
        } catch (err) {
          console.error('[recordings-cleanup] error', err);
        }

        // 🌅 Daily briefing (KST 03:00)
        try {
          const briefUrl = new URL('https://internal.local/api/admin/briefing/generate');
          const briefReq = new Request(briefUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(briefReq, briefUrl, env as any);
          console.log('[daily-briefing] cron ran', r?.status);
        } catch (err) {
          console.error('[daily-briefing] error', err);
        }

        // 💰 Auto dunning (KST 03:00)
        try {
          const dunUrl = new URL('https://internal.local/api/admin/dunning/run');
          const dunReq = new Request(dunUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(dunReq, dunUrl, env as any);
          console.log('[auto-dunning] cron ran', r?.status);
        } catch (err) {
          console.error('[auto-dunning] error', err);
        }

        // 💸 재무 스냅샷 — 어제·오늘분 일일 스냅샷 자동 저장 (KST 03:00)
        //   전일 마감 + 당일 초기값을 finance_snapshots 에 upsert. 실패해도 다른 cron 무영향.
        try {
          const kstNow = new Date(event.scheduledTime + 9 * 3600 * 1000);
          const yMs = kstNow.getTime() - 86400000;
          const yStr = new Date(yMs).toISOString().slice(0, 10);
          const tStr = kstNow.toISOString().slice(0, 10);
          const ry = await runFinanceSnapshot(env as any, yStr);
          const rt = await runFinanceSnapshot(env as any, tStr);
          console.log('[finance-snapshot] cron ran', JSON.stringify({ y: ry, t: rt }));
        } catch (err) {
          console.error('[finance-snapshot] error', err);
        }

        // 🎓 학습 인사이트 — 당월 위험도 스냅샷 자동 저장 (KST 03:00)
        //   learning_trend_snapshots 에 당월 코호트 위험도 upsert. 실패해도 무영향.
        try {
          const kstNow = new Date(event.scheduledTime + 9 * 3600 * 1000);
          const period = kstNow.toISOString().slice(0, 7);
          const rl = await runLearningSnapshot(env as any, period);
          console.log('[learning-snapshot] cron ran', JSON.stringify(rl));
        } catch (err) {
          console.error('[learning-snapshot] error', err);
        }

        // 📅 Weekly schedule auto-generation — every Sunday only (KST Monday 03:00)
        // KST 일요일에 cron 이 돌면 ScheduledEvent 의 UTC 18:00 이 KST 03:00 인데
        // UTC 일요일 18:00 == KST 월요일 03:00 → 새 주 시작 직전에 다음 주 시간표 제안
        try {
          const kstDate = new Date(event.scheduledTime + 9 * 3600 * 1000);
          // UTC Sun 18:00 → KST Mon 03:00 (kstDate.getUTCDay() === 1)
          if (kstDate.getUTCDay() === 1) {
            const schUrl = new URL('https://internal.local/api/admin/schedule/auto');
            const schReq = new Request(schUrl.toString(), { method: 'POST' });
            const r = await handleMangoApi(schReq, schUrl, env as any);
            console.log('[auto-schedule] weekly cron ran', r?.status);
          }
        } catch (err) {
          console.error('[auto-schedule] error', err);
        }
      }

      // ── UTC 00:00 (KST 09:00) — 정기결제 자동 청구 cron (Phase RB)
      if (hour === 0) {
        try {
          const subUrl = new URL('https://internal.local/api/admin/subscription/cron-check');
          const subReq = new Request(subUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(subReq, subUrl, env as any);
          console.log('[recurring-billing] cron ran', r?.status);
        } catch (err) {
          console.error('[recurring-billing] error', err);
        }

        // 📊 경영 브리핑 알림톡 (KST 09:00) — 수신자에게 학생수·매출·비용 발송
        try {
          const briefUrl = new URL('https://internal.local/api/admin/exec/send-briefing');
          const briefReq = new Request(briefUrl.toString(), { method: 'POST' });
          const r = await execRouter(briefReq, env as any);
          console.log('[exec-briefing] cron ran', r?.status);
        } catch (err) {
          console.error('[exec-briefing] error', err);
        }
      }

      // ── UTC 01:00 + day===1 KST (KST 1일 10:00) — 월간 NPS 자동 발송 (Phase NPS)
      if (hour === 1) {
        const kstDate = new Date(event.scheduledTime + 9 * 3600 * 1000);
        if (kstDate.getUTCDate() === 1) {
          try {
            const npsUrl = new URL('https://internal.local/api/admin/nps/send-monthly');
            const npsReq = new Request(npsUrl.toString(), { method: 'POST' });
            const r = await handleMangoApi(npsReq, npsUrl, env as any);
            console.log('[nps-monthly] cron ran', r?.status);
          } catch (err) {
            console.error('[nps-monthly] error', err);
          }
          // 📊 Phase MAR — 매월 1일 KST 지난달 월간 AI 레포트 생성+발송 (학생+학부모)
          try {
            const kd = new Date(event.scheduledTime + 9 * 3600 * 1000);
            const py = kd.getUTCMonth() === 0 ? kd.getUTCFullYear() - 1 : kd.getUTCFullYear();
            const pm = kd.getUTCMonth() === 0 ? 12 : kd.getUTCMonth();
            const period = `${py}-${String(pm).padStart(2, '0')}`;
            const r = await runMonthlyReports(env as any, period);
            console.log('[monthly-report] cron ran', JSON.stringify(r));
          } catch (err) {
            console.error('[monthly-report] error', err);
          }
        }
      }

      // ── UTC 10:00 (KST 19:00) — 일일 streak/참여 푸시
      if (hour === 10) {
        try {
          await sendDailyStreakPush(env);
        } catch (err) {
          console.error('[daily-streak] error', err);
        }

        // ── 금요일이면 학부모 위클리 다이제스트 일괄 발송 (Phase WD)
        if (kstDay === 5) {
          try {
            await sendWeeklyParentDigest(env);
          } catch (err) {
            console.error('[weekly-digest] error', err);
          }
        }
      }
    })());
  }
};

// 📅 Phase WD — 매주 금요일 KST 19:00 학부모 위클리 다이제스트 일괄 발송
async function sendWeeklyParentDigest(env: any): Promise<void> {
  try {
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT, parent_phone TEXT);`);
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
    const rs = await env.DB.prepare(`SELECT user_id FROM students_erp WHERE parent_phone IS NOT NULL AND parent_phone != ''`).all();
    const list = (rs.results || []) as any[];
    console.log('[weekly-digest] candidates:', list.length);
    const now = Date.now();
    for (const r of list) {
      try {
        // 한 행씩 큐 등록 (실제 발송은 카톡 발송 워커가 처리)
        await env.DB.prepare(`INSERT INTO digest_logs (student_uid, parent_phone, message, sent_at, status) VALUES (?,?,?,?,?)`)
          .bind(r.user_id, '', '(cron 큐 등록 — preview API로 확인)', now, 'queued_cron').run();
      } catch {}
    }
    console.log('[weekly-digest] queued for', list.length, 'students');
  } catch (err) {
    console.error('[weekly-digest] failed', err);
  }
}

// 🔔 매일 KST 19:00 — 학생들에게 일일 참여 푸시
//   조건: 활성 푸시 구독자 중 오늘 출석 안 한 사용자
//   메시지: "오늘 영어 한 마디 어떠세요?" + 발음연습 페이지로 유도
async function sendDailyStreakPush(env: any): Promise<void> {
  // 푸시 테이블 안전망
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, status TEXT, date TEXT);`);

  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  // 오늘 출석한 user_id 들
  const attRs = await env.DB.prepare(`SELECT DISTINCT user_id FROM attendance WHERE date = ?`).bind(today).all();
  const attendedSet = new Set((attRs.results || []).map((r: any) => r.user_id));

  // 활성 푸시 구독자 중 오늘 출석 안 한 사람
  const subRs = await env.DB.prepare(`SELECT DISTINCT user_id, endpoint FROM push_subscriptions WHERE enabled = 1 AND user_id IS NOT NULL`).all();
  const targets = ((subRs.results || []) as any[]).filter(s => !attendedSet.has(s.user_id));

  if (!targets.length) {
    console.log('[daily-streak] no targets (everyone attended or no subscribers)');
    return;
  }

  console.log('[daily-streak] sending to', targets.length, 'targets');

  // 모티베이션 메시지 5개 중 무작위
  const messages = [
    { title: '🌟 오늘도 영어 한 마디!', body: '하루 3분 발음 연습으로 영어가 쉬워져요. 지금 시작하기!' },
    { title: '🎯 망고아이가 기다리고 있어요', body: '오늘 학습 안 했어요. 5분만 투자해볼까요?' },
    { title: '🚀 영어 실력 UP 챌린지', body: '연속 출석 보너스 포인트 +10P! 지금 화상수업 입장하세요.' },
    { title: '🎙 AI 음성 코칭 무료', body: '발음 평가 + 모범 음성. 클릭 한번으로 영어가 들려요!' },
    { title: '🏆 오늘의 미션', body: '오늘 한 줄 영어 연습하고 포인트 받기. Just say "Hello!"' },
  ];
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const url = '/speech-coach.html';

  // 큐에 적재 후 wakeup push
  const endpoints: string[] = [];
  for (const t of targets) {
    await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(t.endpoint, msg.title, msg.body, url, '/img/icon-192.png', '/img/icon-192.png', `daily-${today}`, now).run();
    endpoints.push(t.endpoint);
  }

  // 동적 import 로 web-push 모듈 가져오기 (scheduled context 에서)
  try {
    const wp = await import('./web-push');
    const result = await wp.broadcastWebPush(endpoints, env);
    // 만료된 구독 disable
    for (const ep of result.expired) {
      await env.DB.prepare(`UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint = ?`).bind(Date.now(), ep).run();
    }
    console.log('[daily-streak] result', JSON.stringify({ sent: result.sent, failed: result.failed, expired: result.expired.length }));
  } catch (e: any) {
    console.warn('[daily-streak] push send fail:', e?.message);
  }
}

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

// 임시 진단용: 비밀값을 노출하지 않고 Cloudflare TURN 호출 결과만 리턴
async function handleTurnConfigDebug(env: Env): Promise<Response> {
  let envKeys: string[] = [];
  try { envKeys = Object.keys(env as any).sort(); } catch {}
  const diag: any = {
    hasKeyId: !!env.TURN_KEY_ID,
    keyIdLen: (env.TURN_KEY_ID || '').length,
    hasApiToken: !!env.TURN_KEY_API_TOKEN,
    apiTokenLen: (env.TURN_KEY_API_TOKEN || '').length,
    envKeys, // 값이 아닌 '키 이름'만 — 런타임이 보는 바인딩/시크릿 목록
  };
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
          body: JSON.stringify({ ttl: 86400 })
        }
      );
      diag.cfStatus = cfResp.status;
      diag.cfOk = cfResp.ok;
      const txt = await cfResp.text();
      diag.cfBody = txt.slice(0, 500);
    } catch (err: any) {
      diag.fetchError = String(err && err.message || err);
    }
  }
  return new Response(JSON.stringify(diag, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
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

// ArrayBuffer → base64 (Workers 호환, 청크 처리)
function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}
// 네이버 CLOVA OCR (General, V2). 성공=문자열, 호출 실패=null(→ 무료모델 폴백), 글자없음=''
async function clovaOcr(buf: ArrayBuffer, url: string, secret: string): Promise<string | null> {
  try {
    const body = {
      version: 'V2',
      requestId: (crypto as any).randomUUID ? crypto.randomUUID() : ('r' + Date.now()),
      timestamp: Date.now(),
      lang: 'ko',
      images: [{ format: 'png', name: 'wb', data: abToBase64(buf) }]
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': secret },
      body: JSON.stringify(body)
    });
    if (!resp.ok) return null;
    const j: any = await resp.json();
    const fields = j && j.images && j.images[0] && j.images[0].fields;
    if (!Array.isArray(fields)) return '';
    let t = '';
    for (const f of fields) { t += (f.inferText || ''); if (f.lineBreak) t += ' '; }
    t = t.replace(/\s+/g, ' ').trim();
    if (t.length > 60) t = t.slice(0, 60);
    return t;
  } catch (_) { return null; }
}

// ✨ 칠판 손글씨 이미지 → 텍스트.
//   0순위: 네이버 CLOVA OCR (CLOVA_OCR_URL+CLOVA_OCR_SECRET 설정 시, 한글·영어 고정확)
//   1순위: llama-3.2-11b-vision → 2순위 llava (무료 폴백)
async function handleWbOcr(request: Request, env: Env): Promise<Response> {
  const J = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
  const AI = (env as any).AI;
  try {
    if (!AI) return J({ ok: false, text: '', error: 'AI_binding_missing' }, 503);
    const buf = await request.arrayBuffer();
    if (!buf || buf.byteLength === 0) return J({ ok: false, text: '', error: 'empty' }, 400);
    if (buf.byteLength > 3_000_000) return J({ ok: false, text: '', error: 'too_large' }, 413);

    // 0) 전용 OCR(네이버 CLOVA) 설정돼 있으면 우선 — 한글·영어 고정확
    const clovaUrl = (env as any).CLOVA_OCR_URL, clovaSecret = (env as any).CLOVA_OCR_SECRET;
    if (clovaUrl && clovaSecret) {
      const ct = await clovaOcr(buf, clovaUrl, clovaSecret);
      if (ct !== null) return J({ ok: true, text: ct, engine: 'clova' });
      // null = 호출 실패 → 아래 무료 모델로 폴백
    }

    const bytes = [...new Uint8Array(buf)];
    const prompt = 'You are a precise OCR engine. The black-on-white image contains a SINGLE handwritten English letter, a short word, or a number. Identify it and output the exact characters, preserving UPPERCASE vs lowercase and digits. If it is one isolated letter, output just that single letter. Output ONLY the characters on one line — no quotes, no spaces around it, no labels, no explanation, no sentences. If you truly cannot read it, output exactly: NONE';

    const clean = (raw: any): string => {
      let t = String(raw ?? '').trim();
      // 첫 줄만, 따옴표/머리말 제거
      t = t.split(/\r?\n/)[0].trim();
      t = t.replace(/^(the\s+(text|image|handwriting)[^:]*:|answer:|transcription:|output:)\s*/i, '').trim();
      t = t.replace(/^["'`]+|["'`.]+$/g, '').trim();
      if (/^none$/i.test(t)) t = '';
      if (t.length > 40) t = '';           // 설명문 토하면 신뢰 안 함
      return t;
    };

    // 1) llama-3.2-11b-vision (라이선스 1회 동의 후 사용)
    let text = '';
    try {
      try {
        const agreed = env.SESSION_STATE ? await env.SESSION_STATE.get('wbocr:llama32v_agreed') : '1';
        if (!agreed) {
          try { await AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { prompt: 'agree' }); } catch (_){}
          try { if (env.SESSION_STATE) await env.SESSION_STATE.put('wbocr:llama32v_agreed', '1'); } catch (_){}
        }
      } catch (_){}
      const r: any = await AI.run('@cf/meta/llama-3.2-11b-vision-instruct', { image: bytes, prompt, max_tokens: 48 });
      text = clean(r && (r.response ?? r.description ?? r.text));
    } catch (_){ text = ''; }

    // 2) 실패하면 llava 폴백
    if (!text) {
      try {
        const r2: any = await AI.run('@cf/llava-hf/llava-1.5-7b-hf', { image: bytes, prompt, max_tokens: 48 });
        text = clean(r2 && (r2.description ?? r2.response ?? r2.text));
      } catch (_){ text = ''; }
    }

    return J({ ok: true, text });
  } catch (e: any) {
    return J({ ok: false, text: '', error: String(e?.message || e) }, 200);
  }
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

    // fix (2026-06-01) — PDF 뿐 아니라 이미지(JPG/PNG/WEBP)도 허용 (수업 중 교재 즉석 공유용)
    const _allowedUpload = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (mimeType && mimeType.indexOf('image/') !== 0 && mimeType !== 'application/pdf') {
      // mimeType 이 비거나 octet-stream 이면 파일명 확장자로 보정
      const ln = (originalName || '').toLowerCase();
      if (/\.(jpe?g)$/.test(ln)) mimeType = 'image/jpeg';
      else if (/\.png$/.test(ln)) mimeType = 'image/png';
      else if (/\.webp$/.test(ln)) mimeType = 'image/webp';
      else if (/\.pdf$/.test(ln)) mimeType = 'application/pdf';
    }
    if (!_allowedUpload.includes(mimeType)) {
      return new Response(JSON.stringify({ error: 'Only PDF or image (JPG/PNG/WEBP) files are allowed' }), {
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
        httpMetadata: { contentType: mimeType || 'application/pdf' },   // fix (2026-06-01) 실제 형식 저장
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

    // fix (2026-06-01) — 라이브러리(서버) 교재 공유 호환:
    //   옛 클라이언트가 'lib_srv_{id}' / 'srv_{id}' 로 요청해도 실제 textbook_files 로 연결(프록시).
    //   서버 교재 URL 은 확장자가 없어, 저장된 mime 으로 정확히 서빙 → 학생 흰화면 방지.
    const libMatch = fileKey.match(/(?:lib_)?srv_(\d+)/);
    if (libMatch) {
      try {
        const tbId = Number(libMatch[1]);
        const row: any = await env.DB.prepare('SELECT r2_key, mime, ext FROM textbook_files WHERE id = ?').bind(tbId).first();
        const r2b = (env as any).RECORDINGS as R2Bucket | undefined;
        if (row && row.r2_key && r2b) {
          const obj = await r2b.get(row.r2_key);
          if (obj) {
            const ct = row.mime || (row.ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
            return new Response(obj.body, {
              status: 200,
              headers: { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' }
            });
          }
        }
      } catch (e) { console.warn('[pdf-proxy] lib_srv lookup failed:', (e as any)?.message); }
    }

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
    let ctype = 'application/pdf';   // fix (2026-06-01) 저장된 실제 형식으로 서빙 (이미지 교재 지원)
    if (r2) {
      const obj = await r2.get(`pdfs/${fileKey}`);
      if (obj) { bodyStream = obj.body; if (obj.httpMetadata && obj.httpMetadata.contentType) ctype = obj.httpMetadata.contentType; }
    }
    if (!bodyStream) {
      const kv = await env.PDF_STORE.get(fileKey, { type: 'arrayBuffer' });
      if (kv) pdfBuffer = kv;
    }
    // 확장자로도 형식 보정 (KV fallback 등)
    if (ctype === 'application/pdf') {
      const lk = fileKey.toLowerCase();
      if (/\.(jpe?g)/.test(lk)) ctype = 'image/jpeg';
      else if (/\.png/.test(lk)) ctype = 'image/png';
      else if (/\.webp/.test(lk)) ctype = 'image/webp';
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
        'Content-Type': ctype,
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

async function handleVideoCallWebSocket(request: Request, url: URL, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const roomId = url.searchParams.get('roomId') || 'default';

  try {
    const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
    const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);

    const response = await durableObject.fetch(request);

    // 활성 방 목록에 등록 — fire-and-forget 이지만 worker 가 응답 후
    // 종료되어 KV put 이 드롭되지 않도록 ctx.waitUntil 로 보존
    const kvPut = env.SESSION_STATE.put(`active-room:${roomId}`, JSON.stringify({
      roomId,
      lastActivity: Date.now()
    }), { expirationTtl: 600 }).catch(() => {});
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(kvPut);
    }

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
  if (path === '/admin/students-unified' || path === '/admin/students-unified/' || path === '/admin/students-unified.html') return true;
  // 👤 /admin/mypage — 마이페이지 (Phase 11)
  if (path === '/admin/mypage' || path === '/admin/mypage/' || path === '/admin/mypage.html') return true;
  // 💸 실시간 재무 대시보드 + API (2026-06-03) — 관리자 전용
  if (path === '/admin/finance-realtime' || path === '/admin/finance-realtime/' || path === '/admin/finance-realtime.html') return true;
  if (path.startsWith('/api/admin/realtime/')) return true;
  // 📊 경영진 대시보드 + API (2026-06-09) — 관리자 전용
  if (path === '/admin/exec' || path === '/admin/exec/' || path === '/admin/exec.html') return true;
  if (path.startsWith('/api/admin/exec/')) return true;
  // 🎓 학습 인사이트 대시보드 + API (2026-06-03) — 관리자 전용
  if (path === '/admin/learning-insights' || path === '/admin/learning-insights/' || path === '/admin/learning-insights.html') return true;
  if (path.startsWith('/api/admin/learning/')) return true;
  // 📣 마케팅 스튜디오 대시보드 + API (2026-06-03) — 관리자 전용
  if (path === '/admin/marketing-studio' || path === '/admin/marketing-studio/' || path === '/admin/marketing-studio.html') return true;
  if (path.startsWith('/api/admin/marketing/')) return true;
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
  if (path === '/api/admin/omnisearch') return true;
  if (path === '/api/admin/class-schedules' || path === '/api/admin/class-schedules/seed-demo' || /^\/api\/admin\/class-schedules\/\d+$/.test(path)) return true;
  if (path === '/api/admin/students/merge-duplicates') return true;
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
  // 📚 Phase 39 — 교재 파일 라이브러리 (관리자 전용 업로드/관리)
  if (path === '/api/admin/textbook-files' || /^\/api\/admin\/textbook-files\/\d+$/.test(path)) return true;
  // 🎬 Phase 39 — 망고아이 비디오 관리 (관리자 전용)
  if (path === '/api/admin/mango-videos' || /^\/api\/admin\/mango-videos\/\d+$/.test(path)) return true;
  if (path === '/api/admin/students/list') return true;
  if (path === '/api/admin/students/unified') return true;
  if (path === '/api/admin/students/erp-list' || path === '/api/admin/students/erp' || path === '/api/admin/students/erp-seed') return true;
  // 📚 Phase HW — 숙제 관리 (출제/목록/삭제) — 관리자 전용
  if (path.startsWith('/api/admin/homework/')) return true;
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
 * Phase 11 - Admin paths reachable without auth (login/logout pages only).
 *   - /admin/login (HTML)        : login page itself
 *   - /api/admin/login (POST)    : login handler
 *   - /api/admin/logout (POST)   : logout (cookie clear is fine even without auth)
 */
// 🏪 비-본사(대리점·지사) 계정이 사용할 수 있는 API 허용 목록(그 외 /api/admin/* 는 403)
// 🏪 비-본사(대리점·지사) 계정이 접근 가능한 화면(그 외 모든 /admin 페이지는 /admin/exec 로 리다이렉트)
function isAgencyAllowedPage(path: string): boolean {
  if (path === '/admin/exec' || path === '/admin/exec/' || path === '/admin/exec.html') return true;
  if (path === '/admin/login' || path === '/admin/login/' || path === '/admin/login.html') return true;
  if (path === '/admin/logout') return true;
  if (path === '/admin/mypage' || path === '/admin/mypage/') return true;
  if (path === '/admin/health' || path === '/admin/health/') return true;
  return false;
}

function isAgencyAllowedApi(path: string): boolean {
  const allow = [
    '/api/admin/exec/', '/api/admin/realtime/', '/api/admin/stats/',
    '/api/admin/students/unified', '/api/admin/students/erp-list',
    '/api/admin/me', '/api/admin/profile', '/api/admin/logout',
    '/api/admin/change-password', '/api/admin/login-history', '/api/admin/sessions',
    '/api/admin/health-check', '/api/admin/omnisearch',
  ];
  return allow.some(a => path === a || path.startsWith(a));
}

function isAuthPublicPath(path: string): boolean {
  if (path === '/admin/login' || path === '/admin/login/' || path === '/admin/login.html') return true;
  if (path === '/api/admin/login') return true;
  if (path === '/api/admin/logout') return true;
  return false;
}

/**
 * Constant-time string compare (timing attack defense).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
