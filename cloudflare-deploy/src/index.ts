/**
 * index.ts - Main Worker entry point
 * Handles routing, API endpoints, and WebSocket upgrades
 */

import { SignalingRoom } from './signaling-room';
import { VideoCallRoom } from './video-call-room';
import { HealthResponse, TurnConfigResponse, PdfUploadResponse } from './types';
import { handleMangoApi, runMonthlyReports, reconcileAllStreaks } from './api-mango';
import { handlePayApi, runPaymentAudit } from './api-pay';
import { handlePayrollIngest, getPayrollAuto, payrollAiSummary, setPhpKrwRate, markPayrollPaid } from './api-payroll-auto';
import { handleRetentionIngest, getRetention, markRetentionContacted } from './api-retention';
import { getDuplicatePayments, resolveDuplicate } from './api-refund-audit';
import { runSiteWatchdog } from './api-uptime';   // 🐕 사이트 자체 감시견(cron */15)
import { purgeExpired } from './retention';
import { purgeOrphanedRecordings } from './recordings-cleanup';
import { handleLivekit, ensureLivekitSchema } from './livekit-bridge';
import { handleRecordingUpload as handleR2MultipartUpload } from './recordings-r2';
import { handleAdminAuthApi, checkAdminSession } from './auth-admin';
import { reportsRouter } from './accounting-reports';
import { settlementRouter } from './org-settlement';
import { realtimeRouter, runFinanceSnapshot } from './accounting-realtime';
import { modulesRouter } from './modules-ext';
import { execRouter } from './exec-summary';
import { getScope } from './scope';
import { learningRouter, runLearningSnapshot } from './learning-insights';
import { runAbsenceSweep } from './churn-graph';
import { marketingRouter } from './marketing-studio';
import { teacherMatchRouter, runTeacherGraphSync } from './teacher-match';
import { warmupGraphRouter, runWarmupGraphSync, getWeakSentences } from './warmup-graph';
import { churnContagionRouter, runContagionGraphSync } from './churn-contagion';
import { nightlyCafe24Refresh } from './cafe24-sync';  // 🔄 카페24→D1 야간 자동 새로고침

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
  // 🎯 강사 매칭(teacher-match.ts) — Neo4j Aura HTTP Query API 자격증명
  //   wrangler secret put 으로 설정. 미설정 시 해당 API 만 503 으로 graceful degrade.
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
}

export { SignalingRoom, VideoCallRoom };

// 🔒 보안 헤더 — 모든 응답에 일괄 부착(클릭재킹·MIME스니핑·리퍼러 유출 방어).
//   이미 설정된 값은 존중하고(중복 방지), nosniff 만 항상 강제. 응답 헤더가 불변인
//   redirect/asset/스트림 응답도 안전하게 재구성한다(Location·Content-Range 등 보존).
function applySecurityHeaders(resp: Response): Response {
  try {
    const h = new Headers(resp.headers);
    h.set('X-Content-Type-Options', 'nosniff');
    if (!h.has('X-Frame-Options')) h.set('X-Frame-Options', 'SAMEORIGIN');
    if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!h.has('Strict-Transport-Security')) h.set('Strict-Transport-Security', 'max-age=15552000');
    if (!h.has('X-Permitted-Cross-Domain-Policies')) h.set('X-Permitted-Cross-Domain-Policies', 'none');
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
  } catch {
    return resp; // 어떤 이유로든 재구성 실패 시 원본 응답 유지(가용성 우선)
  }
}

const worker = {
  // 얇은 래퍼: 실제 처리는 handle()이 하고, 여기서 보안 헤더만 씌운다.
  //   this 바인딩에 의존하지 않도록 worker.handle 로 명시 참조(진입점 안정성).
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let resp: Response;
    try {
      resp = await worker.handle(request, env, ctx);
    } catch (e: any) {
      console.error('[fetch] unhandled:', e?.message || e);
      resp = new Response(JSON.stringify({ ok: false, error: 'internal_error' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
    return applySecurityHeaders(resp);
  },

  async handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    // 🔗 Digital Asset Links — /.well-known/assetlinks.json (TWA 전체화면 검증)
    //   안드로이드 TWA(Trusted Web Activity)가 주소창 없이 전체화면으로 실행되려면
    //   이 도메인에서 앱 패키지명 + 서명키 SHA-256 지문을 공개 검증 파일로 노출해야 함.
    //   - package_name : PWABuilder 생성 패키지(AndroidManifest)의 applicationId
    //   - sha256_cert_fingerprints : 해당 APK/AAB 를 서명한 키스토어(mangoi-release.keystore)의 지문
    //   ⚠️ Google Play 앱 서명(Play App Signing) 사용 시, Play Console 의 "앱 서명 키" SHA-256 을
    //      배열에 '추가'해야 정식(www) 출시 후에도 전체화면이 유지됨.
    //   CF Assets 의 dot-directory 처리에 의존하지 않도록 워커가 직접 응답한다.
    if (path === '/.well-known/assetlinks.json') {
      const assetlinks = [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'dev.workers.navy111p.webrtc_unified_platform.twa',
            sha256_cert_fingerprints: [
              'D3:8E:1B:5A:C3:CE:F1:8C:F3:FE:C0:49:F1:AB:D0:14:47:2A:89:AA:91:78:6D:00:C6:74:57:96:0A:9C:77:11'
            ]
          }
        }
      ];
      return new Response(JSON.stringify(assetlinks, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*'
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
        if (_sc.type === 'agency' || _sc.type === 'branch' || _sc.type === 'franchise') {
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

    // 🔥 학습 불꽃(스픽식 연속학습) — Cloudflare 네이티브 (KV: SESSION_STATE)
    //   ⚠️ 기존 '출석 스트릭'(/api/streak/status·check-in·leaderboard, api-mango.ts)과는
    //      별개 개념. 여기서는 게임/퀴즈 완료 기반의 '학습 불꽃'만 처리한다.
    //   - POST /api/streak/complete-quiz  {student_id}
    //   - GET  /api/streak/:student_id     (단, 예약어 status/leaderboard/check-in 은 제외 → 아래 게이트로 통과)
    if (path === '/api/streak/complete-quiz' && request.method === 'POST') {
      return handleLearnStreakComplete(request, env);
    }
    {
      const _sm = path.match(/^\/api\/streak\/([^\/]+)$/);
      if (_sm && request.method === 'GET') {
        const _seg = _sm[1];
        // 기존 출석 스트릭 예약 경로는 건드리지 않고 그대로 흘려보낸다.
        if (_seg !== 'status' && _seg !== 'leaderboard' && _seg !== 'check-in' && _seg !== 'complete-quiz') {
          return handleLearnStreakGet(decodeURIComponent(_seg), env);
        }
      }
    }

    // 🗣️ 수업 전 AI 웜업 — Cloudflare Workers AI(Llama 3.3 70B)로 실제 대화 (키 불필요)
    //   - POST /api/warmup/chat     {session_id, student_input, lesson_topic?, user_id?, textbook?, level?, lesson_no?}
    //   - GET  /api/warmup/context  ?user_id=&textbook=&level=&lesson=  → 오늘 배울 교재/문장 (students_erp + review_quizzes)
    if (path === '/api/warmup/chat' && request.method === 'POST') {
      return handleWarmupChat(request, env);
    }
    if (path === '/api/warmup/context' && request.method === 'GET') {
      return handleWarmupContext(request, env);
    }
    // 🎮 학생게임 맞춤 출제 — GET /api/games/vocab?user_id=  → 학생 배정 교재/레벨의 문장+단어(en/ko)
    if (path === '/api/games/vocab' && request.method === 'GET') {
      return handleGamesVocab(request, env);
    }
    // 🀄 중국어 게임 어휘 — GET /api/games/zh-vocab?textbook=&level=&lesson=  → 다락원 교재 추출 한자+병음+뜻(zh_vocab)
    if (path === '/api/games/zh-vocab' && request.method === 'GET') {
      return handleGamesZhVocab(request, env);
    }
    // 🔤 영어 게임 어휘 은행 — GET /api/games/en-vocab  → 난이도별 영어 문장+단어(en_vocab, 폴백 강화)
    if (path === '/api/games/en-vocab' && request.method === 'GET') {
      return handleGamesEnVocab(request, env);
    }
    // 🧠 게임 학습기록 — POST /api/games/progress {user_id,lang,events:[{item,ko,correct}]} → 오답/정답 누적(game_progress)
    if (path === '/api/games/progress' && request.method === 'POST') {
      return handleGamesProgress(request, env);
    }
    // 🧠 약점 단어 — GET /api/games/weak?user_id=&lang=&limit=  → 자주 틀린 단어(교사 대시보드·맞춤 복습용)
    if (path === '/api/games/weak' && request.method === 'GET') {
      return handleGamesWeak(request, env);
    }
    // 🎤 발음 점수 — POST /api/games/shadow {user_id,lang,item,ko,score} → 따라말하기 발음 점수 누적(game_progress)
    if (path === '/api/games/shadow' && request.method === 'POST') {
      return handleGamesShadow(request, env);
    }
    // 🪙 코인 적립 — POST /api/games/coins {user_id,nickname,add} → 주간/누적 코인(game_stats), 주간 리더보드용
    if (path === '/api/games/coins' && request.method === 'POST') {
      return handleGamesCoins(request, env);
    }
    // 🏆 주간 랭킹 — GET /api/games/leaderboard?limit=  → 이번 주 코인 상위 학생(닉네임)
    if (path === '/api/games/leaderboard' && request.method === 'GET') {
      return handleGamesLeaderboard(request, env);
    }

    // 📩 알림톡 클릭추적 (공개·학부모용) — 버튼 클릭 시 read_at 기록 후 원래 URL 로 리다이렉트.
    //    이탈위험 그래프의 (학부모)-[:IGNORED]->(알림톡) 판정을 정밀화한다.
    if (path === '/api/alimtalk/r') {
      const t = url.searchParams.get('t') || '';
      const to = url.searchParams.get('to') || '/';
      if (t) {
        try { const { markAlimtalkRead } = await import('./solapi-client'); await markAlimtalkRead(env as any, t); } catch {}
      }
      // open-redirect 방지: 자체 도메인(또는 *.workers.dev) 절대 URL · 상대경로만 허용
      let dest = new URL('/', request.url).toString();
      try {
        if (/^https?:\/\//i.test(to)) {
          const u = new URL(to);
          if (u.host === url.host || u.host.endsWith('.workers.dev')) dest = u.toString();
        } else if (to.startsWith('/')) {
          dest = new URL(to, request.url).toString();
        }
      } catch {}
      return Response.redirect(dest, 302);
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
      const ttsHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
      try {
        const reqBody = await request.text();
        let ttsText = '';
        try { ttsText = String((JSON.parse(reqBody || '{}') || {}).text || ''); } catch { ttsText = ''; }

        // 1순위: 아바타 Worker(Typecast) 한국어 음성 — 크레딧 소진/장애 시 아래 폴백으로 넘어감
        try {
          const up = await fetch('https://mangoi-ai-avatar-cf.navy111p.workers.dev/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: reqBody,
          });
          if (up.ok && up.body) {
            const ct = up.headers.get('Content-Type') || 'audio/mpeg';
            return new Response(up.body, { status: 200, headers: { ...ttsHeaders, 'Content-Type': ct } });
          }
        } catch (_) { /* 폴백으로 진행 */ }

        // 2순위(폴백): Google 번역 TTS — 무료·무키. Typecast 크레딧이 없어도 항상 소리가 나도록 보장.
        //   (요청당 ~200자 제한이 있어 안내문 길면 잘릴 수 있으나, '무음'보다 낫다)
        if (ttsText) {
          const q = encodeURIComponent(ttsText.slice(0, 200));
          const g = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ko&q=${q}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' },
          });
          if (g.ok && g.body) {
            return new Response(g.body, { status: 200, headers: ttsHeaders });
          }
        }
        return new Response('tts_all_failed', { status: 502 });
      } catch (e: any) {
        return new Response('tts_proxy_error: ' + (e?.message || ''), { status: 502 });
      }
    }

    // 🔊 무료 '기계음' 전용 TTS — Google 번역 TTS(무료·무키·크레딧 0). Typecast 절대 안 씀.
    //    사이드바 음성안내처럼 '클릭마다' 울리는 곳에서 비용 없이, OS 한국어 음성 유무와 무관하게 소리내기 위함.
    //    Google TTS 는 요청당 ~200자 제한 → 서버에서 문장 단위로 잘라 여러 번 받아 MP3 를 이어붙여 반환한다.
    if (path === '/api/tts-free' && request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    // GET(?q=) 도 지원 — 모바일 브라우저는 클릭(제스처) 안에서 audio.src=URL 로 '즉시' 재생해야 소리남.
    //   fetch→blob→play 는 비동기라 제스처가 끊겨 모바일에서 자동재생 차단됨. 그래서 GET 스트리밍 경로 추가.
    if (path === '/api/tts-free' && (request.method === 'POST' || request.method === 'GET')) {
      const freeHeaders = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' };
      try {
        let text = '';
        let lang = 'ko';
        if (request.method === 'GET') {
          text = url.searchParams.get('q') || '';
          lang = (url.searchParams.get('lang') || 'ko').toLowerCase();
        } else {
          try { const j = JSON.parse((await request.text()) || '{}') || {}; text = String(j.text || ''); lang = String(j.lang || 'ko').toLowerCase(); } catch { text = ''; }
        }
        // Google TTS 언어 코드(tl): 한국어(기본)·영어·중국어 지원 — 외국인 사용자용
        const tl = (lang === 'en' || lang === 'en-us') ? 'en'
                 : (lang === 'zh' || lang === 'zh-cn' || lang === 'cn') ? 'zh-CN'
                 : 'ko';
        text = text.replace(/\s+/g, ' ').trim().slice(0, 600);
        if (!text) return new Response('empty', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });

        // ≤180자 청크로 분할(마침표/쉼표/공백 경계 우선)
        const chunks: string[] = [];
        let rest = text;
        while (rest.length) {
          if (rest.length <= 180) { chunks.push(rest); break; }
          let cut = rest.slice(0, 180);
          const b = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf(', '), cut.lastIndexOf(' '));
          if (b > 60) cut = rest.slice(0, b + 1);
          chunks.push(cut.trim());
          rest = rest.slice(cut.length);
        }

        const parts: Uint8Array[] = [];
        for (const c of chunks) {
          if (!c) continue;
          const g = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${encodeURIComponent(c)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' },
          });
          if (g.ok) { const buf = new Uint8Array(await g.arrayBuffer()); if (buf.byteLength > 200) parts.push(buf); }
        }
        if (!parts.length) return new Response('tts_failed', { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });

        const total = parts.reduce((n, p) => n + p.byteLength, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const p of parts) { out.set(p, off); off += p.byteLength; }
        return new Response(out, { status: 200, headers: freeHeaders });
      } catch (e: any) {
        return new Response('tts_free_error: ' + (e?.message || ''), { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
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
        path === '/api/admin/sessions/revoke' ||
        path.startsWith('/api/admin/2fa/')) {
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
        path === '/api/admin/schedules' ||
        path === '/api/admin/unassigned-students' ||
        path === '/api/admin/notify-queue' ||
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
        // 📅 Phase SR — 수업 연기·변경 요청 (강사 제출 + 관리자 승인/거절)
        path.startsWith('/api/admin/schedule-requests') ||
        // 📝 Phase FD — AI 학부모 피드백 초안 + 강사 원클릭 승인
        path.startsWith('/api/admin/feedback-drafts') ||
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
        // 🎓 Phase RM — 예약기반 '항상 같은 방' 라우팅 (sessions/today, verify-room)
        path.startsWith('/api/class/') ||
        // 🪟 팝업/미디어 (관리자 + 공개)
        path === '/api/admin/popups' ||
        /^\/api\/admin\/popups\/\d+$/.test(path) ||
        path === '/api/admin/popups/upload-media' ||
        /^\/api\/admin\/popups\/\d+\/stats$/.test(path) ||
        path.startsWith('/api/popups/media/') ||
        path === '/api/popups' ||
        path === '/api/popups/active' ||
        /^\/api\/popups\/\d+\/(view|click|dismiss)$/.test(path) ||
        // 🎨 포스터 만들기 (관리자 — 저장/재사용)
        path === '/api/admin/posters' ||
        /^\/api\/admin\/posters\/\d+$/.test(path) ||
        // 📅 Phase CAL — 캘린더(교사 휴가 + 한국/필리핀 공휴일)
        path === '/api/calendar/events' ||
        path === '/api/admin/calendar/events' ||
        /^\/api\/admin\/calendar\/events\/\d+$/.test(path) ||
        path === '/api/admin/calendar/seed-holidays' ||
        // 🧩 Phase RQ — 복습퀴즈 (관리자 출제 + 학생 풀이)
        path === '/api/review-quiz/list' ||
        path === '/api/review-quiz/get' ||
        path === '/api/review-quiz/submit' ||
        path === '/api/review-quiz/check' ||
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
        path === '/api/admin/students/graph-list' ||
        path === '/api/admin/teachers/graph-list' ||
        path === '/api/admin/staff/graph-list' ||
        path === '/api/admin/books/graph-list' ||
        path === '/api/admin/leveltest/overview' ||
        path === '/api/admin/selfscore/trend' ||
        /^\/api\/admin\/finance-cafe24\/[a-z]+$/.test(path) ||
        path === '/api/admin/students/import-cafe24' ||
        path === '/api/admin/org/import-cafe24' ||
        path === '/api/admin/attendance/import-cafe24' ||
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
        path === '/api/admin/payments/import-cafe24' ||
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
        // 📵 Phase RM — 노쇼(수업 미입장) 리포트 + 재알림
        path.startsWith('/api/admin/no-shows') ||
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
        path === '/api/vocab/reward' ||
        path === '/api/vocab/stats' ||
        path === '/api/vocab/leaderboard' ||
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
        path === '/api/ai/write-stats' ||
        path === '/api/ai/write-leaderboard' ||
        // 💬 Phase CF AI 영어 친구 챗봇
        path === '/api/ai/chat-friend' ||
        path === '/api/ai/chat-history' ||
        path === '/api/ai/chat-clear' ||
        path === '/api/ai/chat-guest-token' ||
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
        path === '/api/points/leaderboard' ||   // 🏆 학원 랭킹(공개, admin/points/list 대체)
        path === '/api/uptime-hook' ||          // 📟 UptimeRobot 장애 웹훅(토큰 보호) → 관리자 문자
        // 🌟 실시간 칭찬 포인트 — 학생 입장 등록 + 선생님 서버측 적립(학생 전체 포인트 확실 반영)
        path === '/api/vc/roster' ||
        path === '/api/points/award-praise' ||
        // ⭐ 수업 강사 평가 (수업 종료 직후 별 7개 + 태그 + 건의사항)
        path === '/api/ratings' ||
        path === '/api/ratings/check' ||
        // 🎯 레벨테스트 신청 (학생 제출 저장 + 관리자·강사 목록/상태변경)
        path === '/api/leveltest/apply' ||
        path === '/api/admin/leveltest/applications' ||
        // 🧠 AI 자동 진단 (CEFR 배치테스트 문항 + 서버채점)
        path === '/api/leveltest/questions' ||
        path === '/api/leveltest/diagnose' ||
        path === '/api/admin/ratings/summary' ||
        path === '/api/admin/ratings/list' ||
        path === '/api/admin/ratings/analytics' ||
        path === '/api/teacher/my-ratings' ||
        // 🤖 교사 수업 AI 피드백 (수업 종료 직후 잘한점/개선점 한·영 생성·조회)
        path === '/api/ai-feedback/generate' ||
        path === '/api/ai-feedback' ||
        // 🌐 양방향 번역 (평가 글·건의사항 영↔한)
        path === '/api/translate' ||
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

    // 💳 결제 API (토스페이먼츠 안전결제) — 공개(학부모/학생 결제), /api/pay/*
    //   서버 확정(confirm)·금액검증·멱등은 api-pay.ts 가 담당. 관리자 인증 불필요.
    if (path.startsWith('/api/pay/')) {
      try {
        const res = await handlePayApi(request, url, env as any);
        if (res) return res;
      } catch (e: any) {
        return new Response(
          JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
        );
      }
    }

    // 🧾 강사 급여 자동화 — 카페24 서버가 집계결과를 밀어넣는 인제스트(공유키 보호, 관리자세션 아님)
    //   /api/payroll-ingest?key=...  (POST). 서버→워커 전용이라 /api/admin/ 밖에 둔다.
    if (path === '/api/payroll-ingest') {
      try {
        const res = await handlePayrollIngest(request, url, env as any);
        if (res) return res;
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🔁 수강권 만료·재활성 인제스트 (카페24 서버 → 워커, 공유키 보호)
    if (path === '/api/retention-ingest') {
      try {
        const res = await handleRetentionIngest(request, url, env as any);
        if (res) return res;
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🔁 수강권 만료·재활성 조회 (관리자 전용). ?type=expiring|expired|inactive
    if (path === '/api/admin/retention') {
      try {
        const data = await getRetention(env as any, url.searchParams.get('type') || 'expiring');
        return new Response(JSON.stringify({ ok: true, ...data }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🔁 수강권 '연락함' 토글 (관리자 전용). POST { user_id, contacted }
    if (path === '/api/admin/retention/contacted' && request.method === 'POST') {
      try {
        const b: any = await request.json().catch(() => ({}));
        await markRetentionContacted(env as any, String(b?.user_id || ''), !!b?.contacted);
        return new Response(JSON.stringify({ ok: true }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🔁 /admin/retention — 수강권 만료·재활성 대시보드 (관리자 전용)
    if (path === '/admin/retention' || path === '/admin/retention/') {
      const r = new Request(new URL('/admin/retention.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 💸 이중결제 감사 조회 (관리자 전용). ?type=all|unresolved|resolved&since=YYYY
    if (path === '/api/admin/duplicate-payments') {
      try {
        const data = await getDuplicatePayments(env as any, { type: url.searchParams.get('type') || 'all', since: url.searchParams.get('since') || '' });
        return new Response(JSON.stringify({ ok: true, ...data }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }
    // 💸 이중결제 처리 저장 (관리자 전용). POST { dup_key, status, note }
    if (path === '/api/admin/duplicate-payments/resolve' && request.method === 'POST') {
      try {
        const b: any = await request.json().catch(() => ({}));
        await resolveDuplicate(env as any, String(b?.dup_key || ''), String(b?.status || ''), String(b?.note || ''), String(b?.by || ''));
        return new Response(JSON.stringify({ ok: true }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }
    // 💸 /admin/duplicate-payments — 이중결제 감사·환불 처리 (관리자 전용)
    if (path === '/admin/duplicate-payments' || path === '/admin/duplicate-payments/') {
      const r = new Request(new URL('/admin/duplicate-payments.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 🧾 강사 급여 자동 조회 (관리자 전용 — 위 default-deny 미들웨어가 인증 보장)
    //   /api/admin/payroll/auto?year=&month=&ai=1  → 강사별 완료수업·급여(₱)+합계(+AI요약)
    if (path === '/api/admin/payroll/auto') {
      try {
        const now = new Date();
        const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
        const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
        const data = await getPayrollAuto(env as any, year, month);
        let ai = '';
        if (url.searchParams.get('ai') === '1') ai = await payrollAiSummary(env as any, year, month, data, url.searchParams.get('lang') || 'ko');
        return new Response(JSON.stringify({ ok: true, year, month, ...data, ai }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🧾 강사 급여 페소→원화 환율 저장 (관리자 전용). POST { rate }
    if (path === '/api/admin/payroll/rate' && request.method === 'POST') {
      try {
        const b: any = await request.json().catch(() => ({}));
        const v = await setPhpKrwRate(env as any, Number(b?.rate));
        return new Response(JSON.stringify({ ok: true, php_krw: v }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🧾 강사 급여 지급완료 토글 (관리자 전용). POST { teacher_id, year, month, paid }
    if (path === '/api/admin/payroll/mark-paid' && request.method === 'POST') {
      try {
        const b: any = await request.json().catch(() => ({}));
        await markPayrollPaid(env as any, Number(b?.teacher_id), Number(b?.year), Number(b?.month), !!b?.paid);
        return new Response(JSON.stringify({ ok: true }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🧾 /admin/teacher-payroll — 강사 급여 자동 대시보드 페이지 (관리자 전용)
    if (path === '/admin/teacher-payroll' || path === '/admin/teacher-payroll/') {
      const r = new Request(new URL('/admin/teacher-payroll.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // 📥 회계 리포트 6종 (2026-05-03 추가)
    //   /api/admin/reports/{monthly|quarterly|annual|franchise|payslips|kpi}
    //   format=json (기본) | csv 다운로드
    if (path.startsWith('/api/admin/reports/')) {
      return reportsRouter(request, env);
    }

    // 🌳 조직 그래프 트리 정산 엔진 (2026-06-29 추가)
    //   /api/admin/settlement/{tree|rollup|node/:id|rates|close|ledger|rebuild}
    //   (:HQ)-[:PARENT_OF]->(지사)->(대리점)->(학생)-[:PAID]->(:Payment) 그래프를
    //   D1 WITH RECURSIVE 로 순회해 하위집계·상위역추적·수수료(15~18%) 정확 산출.
    //   기존 reports/franchise 의 "균등분배 추정"을 정확 정산으로 대체. scope 격리.
    if (path.startsWith('/api/admin/settlement/') || path === '/api/admin/settlement') {
      return settlementRouter(request, env);
    }

    // 💸 실시간 수입·지출 분석 & 재무 스냅샷 (2026-06-03 추가)
    //   /api/admin/realtime/{summary|daily|weekly|expenses|snapshots|snapshot}
    //   기존 reports 와 prefix 분리 + 자체 try/catch 로 독립 동작
    if (path.startsWith('/api/admin/realtime/')) {
      return realtimeRouter(request, env);
    }

    // 🧩 신규 운영 인프라 4모듈 (정산분개·위험군큐·공휴일·교재비디오) — 2026-06-24
    //   /api/admin/mod/* — 기존 라우트와 prefix 완전 분리 + 자체 try/catch 독립 동작
    if (path.startsWith('/api/admin/mod/')) {
      return modulesRouter(request, env);
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

    // 🎯 강사 매칭: 학생 관심사 + MBTI 궁합 기반 강사 추천 (Neo4j Aura HTTP Query API)
    //   /api/admin/teacher-match/recommend?student_id=...&limit=5
    //   '강사관리 > MBTI' RDB 조건문 매칭을 그래프 점수 정렬로 대체. 자체 try/catch 독립 동작.
    if (path.startsWith('/api/admin/teacher-match/')) {
      return teacherMatchRouter(request, env);
    }

    // 🗣️ 웜업 개인화 그래프: 학생 오답 문장 ⇄ 교재 (Neo4j Aura) — ETL/디버그 조회
    //   POST /api/admin/warmup-graph/sync · GET /api/admin/warmup-graph/weak?student_id=
    if (path.startsWith('/api/admin/warmup-graph/')) {
      return warmupGraphRouter(request, env);
    }

    // 🕸 이탈 전염 위험: 가족·동반수업·추천 관계망 기반 (Neo4j Aura)
    //   POST /sync · GET /risk · GET /student?uid= · GET /stats. 자체 try/catch 독립 동작.
    if (path.startsWith('/api/admin/churn-contagion/')) {
      return churnContagionRouter(request, env);
    }

    // 🎯 /admin/teacher-match — 강사 매칭 추천 페이지 (관리자 전용)
    if (path === '/admin/teacher-match' || path === '/admin/teacher-match/') {
      const r = new Request(new URL('/admin/teacher-match.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
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

    // 🚧 fix (2026-06-22) — 매칭되지 않은 /api/* 경로는 SPA(index.html)로 흘려보내지 않고 404 JSON 반환.
    //    잘못된 API 호출이 200 + HTML 로 가려져 디버깅이 어려워지던 문제 방지.
    //    (정상 API 핸들러·확장자 정적자원·WS/시그널링 경로는 모두 이 지점 이전에 처리됨)
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not Found', path }), {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      });
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
  //   - UTC 18:00 (KST 03:00) : 보관기간 만료 데이터 자동 파기 + streak 일괄 정합화
  //   - UTC 10:00 (KST 19:00) : 학생 일일 streak/참여 푸시 알림
  //   - UTC 10:00 + 금요일      : 학부모 위클리 다이제스트 일괄 발송 (Phase WD)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const date = new Date(event.scheduledTime);
    const hour = date.getUTCHours();
    // KST 기준 요일 (UTC + 9시간) — Friday = 5
    const kstDay = new Date(event.scheduledTime + 9 * 3600 * 1000).getUTCDay();

    ctx.waitUntil((async () => {
      // 🐕 사이트 자체 감시견 — 매 cron(특히 */15분)마다 사이트 확인, 죽으면 관리자 문자.
      //   실패해도 다른 cron 작업에 영향 없게 격리.
      try {
        const w = await runSiteWatchdog(env as any);
        if (w.changed) console.log('[watchdog] state change', JSON.stringify(w));
      } catch (err) {
        console.error('[watchdog] error', err);
      }

      // ── UTC 18:00 — retention purge
      if (hour === 18) {
        try {
          const result = await purgeExpired(env);
          console.log('[retention] purged', JSON.stringify(result));
        } catch (err) {
          console.error('[retention] error', err);
        }

        // 🔄 카페24 → D1 야간 자동 새로고침 (KST 03:00)
        //   서버 cron(KST 02:00)이 MySQL→Neo4j 를 갱신한 뒤, 여기서 Neo4j→D1 을 갱신.
        //   조직·결제 전량 + 학생 전 페이지 + 출석 최근 14일 증분. 실패해도 항목별 격리.
        try {
          const syncOut = await nightlyCafe24Refresh(env);
          console.log('[cafe24-sync] nightly done', JSON.stringify(syncOut));
        } catch (err) {
          console.error('[cafe24-sync] nightly error', err);
        }

        // 🔍 결제 대사(장부 맞추기) — 동기화 직후 최신 데이터로 이중결제·수업연결 누락 점검.
        //   이상 발견 시에만 사장님 SMS (정상일 땐 조용).
        try {
          const audit = await runPaymentAudit(env, { sms: true });
          console.log('[pay-audit] nightly done', JSON.stringify(audit?.summary || {}));
        } catch (err) {
          console.error('[pay-audit] error', err);
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

        // 🚨 이탈위험 — 어제 결석 감지 + 케어 대상 집계 (KST 03:00)
        //   감지는 항상 수행. 학부모 알림톡 발송은 게이트(AUTO_ALIMTALK='on' + SOLAPI_TEMPLATE_ABSENCE)
        //   가 켜진 경우에만. 기본값(플래그 미설정)은 '발송 안 함' → 안전.
        try {
          const sweep = await runAbsenceSweep(env as any, { send: true });
          console.log('[absence-sweep] cron ran', JSON.stringify({
            date: sweep.date, detected: sweep.detected, care: sweep.care_total,
            sending: sweep.sending, sent: sweep.sent, skipped: sweep.skipped,
          }));
        } catch (err) {
          console.error('[absence-sweep] error', err);
        }

        // 🔥 Streak 일괄 정합화 (KST 03:00) — 출결(attendance) 기준 단일 권위로
        //   student_streaks 의 current/longest 를 동기화(gems 보존). gaps-and-islands
        //   윈도우 쿼리 1방 + 배치 UPSERT 라 학생 수가 많아도 부하가 작다.
        //   → 리더보드를 한 번도 status/체크인을 안 거친 학생까지 일관화.
        try {
          const rc = await reconcileAllStreaks(env as any);
          console.log('[streak-reconcile] cron ran', JSON.stringify(rc));
        } catch (err) {
          console.error('[streak-reconcile] error', err);
        }

        // 🎯 강사 매칭 그래프 동기화 (KST 03:00) — D1(teacher_mbti·students_erp) → Neo4j Aura
        //   Neo4j 미설정(NEO4J_QUERY_URL 없음)이면 조용히 건너뜀. 멱등 MERGE 라 반복 안전.
        if (env.NEO4J_QUERY_URL) {
          try {
            const ts = await runTeacherGraphSync(env as any);
            console.log('[teacher-match-sync] cron ran', JSON.stringify(ts));
          } catch (err) {
            console.error('[teacher-match-sync] error', err);
          }
        }

        // 🗣️ 웜업 개인화 그래프 동기화 (KST 03:00) — D1(students_erp·review_quizzes·review_quiz_results) → Neo4j Aura
        //   학생별 오답 문장 ⇄ 교재 그래프. Neo4j 미설정이면 조용히 건너뜀. 멱등 MERGE(count 절대값 SET).
        if (env.NEO4J_QUERY_URL) {
          try {
            const ws = await runWarmupGraphSync(env as any);
            console.log('[warmup-graph-sync] cron ran', JSON.stringify(ws));
          } catch (err) {
            console.error('[warmup-graph-sync] error', err);
          }
        }

        // 🕸 이탈 전염 그래프 동기화 (KST 03:00) — D1(students_erp·family_members·attendance) → Neo4j Aura
        //   가족·동반수업·추천 관계망. Neo4j 미설정이면 조용히 건너뜀. 멱등 MERGE 라 반복 안전.
        if (env.NEO4J_QUERY_URL) {
          try {
            const cs = await runContagionGraphSync(env as any);
            console.log('[churn-contagion-sync] cron ran', JSON.stringify(cs));
          } catch (err) {
            console.error('[churn-contagion-sync] error', err);
          }
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

export default worker;

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

/* ════════════════════════════════════════════════════════════════════════
 *  🔥 학습 불꽃(스픽식 연속학습) — Cloudflare 네이티브 구현
 *    저장: KV(SESSION_STATE), 키 prefix 'learnstreak:'
 *    로직: FastAPI(app/routers/streak.py)와 동일 — 자정(KST) 기준
 *          어제 활동→+1 / 오늘 이미→유지 / 끊김→1 리셋 / longest 갱신
 * ════════════════════════════════════════════════════════════════════════ */
const _MS_JSON = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };

// 한국 시간(KST, UTC+9) 기준 'YYYY-MM-DD' — offsetDays 로 어제 계산
function kstDateStr(offsetDays: number = 0): string {
  const now = Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000;
  return new Date(now).toISOString().slice(0, 10);
}

async function handleLearnStreakGet(studentId: string, env: Env): Promise<Response> {
  try {
    const raw = env.SESSION_STATE ? await env.SESSION_STATE.get('learnstreak:' + studentId) : null;
    const today = kstDateStr(0);
    if (!raw) {
      return new Response(JSON.stringify({
        student_id: studentId, current_streak: 0, longest_streak: 0,
        last_activity_date: null, is_quiz_completed_today: false
      }), { status: 200, headers: _MS_JSON });
    }
    const s = JSON.parse(raw);
    return new Response(JSON.stringify({
      student_id: studentId,
      current_streak: s.current || 0,
      longest_streak: s.longest || 0,
      last_activity_date: s.last || null,
      is_quiz_completed_today: s.last === today
    }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'streak_get_failed', detail: String(e?.message || e) }),
      { status: 500, headers: _MS_JSON });
  }
}

async function handleLearnStreakComplete(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch { /* 빈 본문 방어 */ }
    const studentId = (body && typeof body.student_id === 'string') ? body.student_id.trim() : '';
    if (!studentId) {
      return new Response(JSON.stringify({ error: 'student_id_required', detail: 'student_id 는 비어 있을 수 없습니다.' }),
        { status: 422, headers: _MS_JSON });
    }
    if (!env.SESSION_STATE) {
      return new Response(JSON.stringify({ error: 'kv_unavailable' }), { status: 500, headers: _MS_JSON });
    }

    const key = 'learnstreak:' + studentId;
    const today = kstDateStr(0);
    const yesterday = kstDateStr(-1);
    const raw = await env.SESSION_STATE.get(key);
    let s = raw ? JSON.parse(raw) : { current: 0, longest: 0, last: null };

    if (s.last === today) {
      // 오늘 이미 달성 → 유지(중복 카운트 방지)
    } else if (s.last === yesterday) {
      s.current = (s.current || 0) + 1;   // 어제 활동 → 연속 성공
    } else {
      s.current = 1;                       // 처음이거나 끊김 → 1로 리셋
    }
    s.last = today;
    if (s.current > (s.longest || 0)) s.longest = s.current;

    await env.SESSION_STATE.put(key, JSON.stringify(s));

    return new Response(JSON.stringify({
      student_id: studentId,
      current_streak: s.current,
      longest_streak: s.longest,
      last_activity_date: s.last,
      is_quiz_completed_today: true
    }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'streak_complete_failed', detail: String(e?.message || e) }),
      { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  🗣️ 수업 전 AI 웜업 — Cloudflare Workers AI(Llama 3.3 70B)로 실제 대화
 *    시스템 프롬프트는 FastAPI(app/services/ai_warmup.py)와 동일 취지.
 *    대화 문맥: session_id 별 최근 N턴을 KV(SESSION_STATE, 'warmup:' prefix)에 6시간 보관.
 * ════════════════════════════════════════════════════════════════════════ */
const WARMUP_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const WARMUP_SYSTEM = "너는 망고아이의 AI 대화 친구야. 학생의 레벨에 맞춰 최대 2문장 이내로 친절하게 질문해줘. 만약 학생이 한국어로 '이걸 영어로 어떻게 해?'라고 물어보면 자연스러운 영어 문장으로 교정해주고 영어로 다시 말하도록 유도해줘.";
const WARMUP_MAX_TURNS = 12;   // 저장할 최근 대화(사용자/AI) 최대 개수

/* 오늘 배울 교재 컨텍스트 — students_erp(학생 배정 교재/레벨) + review_quizzes(그 교재의 실제 영어 문장)
 * textbook/level 을 직접 넘기면 그 값을 우선, 없으면 user_id 로 학생 명부에서 조회.
 * 문장 샘플은 해당 교재(→레벨) 복습퀴즈 은행의 audio_text/answer_text 에서 추출. */
async function warmupLessonContext(env: Env, o: { userId?: string; textbook?: string; level?: string; lessonNo?: number | null }) {
  let textbook = String(o.textbook || '').trim();
  let level = String(o.level || '').trim();
  const lessonNo = (Number(o.lessonNo) > 0) ? Number(o.lessonNo) : null;
  let studentName = '';
  if (o.userId) {
    try {
      const s: any = await env.DB.prepare(`SELECT english_name, korean_name, level, textbook FROM students_erp WHERE user_id = ? LIMIT 1`).bind(o.userId).first();
      if (s) {
        if (!textbook && s.textbook) textbook = String(s.textbook).trim();
        if (!level && s.level) level = String(s.level).trim();
        studentName = String(s.english_name || s.korean_name || '').trim();
      }
    } catch {}
  }
  const sentences: string[] = [];
  try {
    if (textbook || level) {
      const tries: Array<{ sql: string; binds: any[] }> = [];
      if (textbook && lessonNo) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(textbook)=LOWER(?) AND lesson_no=? ORDER BY id DESC LIMIT 2`, binds: [textbook, lessonNo] });
      if (textbook) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(textbook)=LOWER(?) ORDER BY id DESC LIMIT 2`, binds: [textbook] });
      if (level) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(level)=LOWER(?) AND (textbook IS NULL OR textbook='') ORDER BY id DESC LIMIT 2`, binds: [level] });
      for (const t of tries) {
        const rs = await env.DB.prepare(t.sql).bind(...t.binds).all();
        for (const row of (((rs.results as any[]) || []))) {
          let qs: any[] = []; try { qs = JSON.parse(row.questions) || []; } catch {}
          for (const q of qs) {
            for (const c of [q.audio_text, q.answer_text, q.target]) {
              const s = String(c || '').trim();
              if (s && /[a-zA-Z]/.test(s) && s.length <= 80 && !sentences.includes(s)) sentences.push(s);
            }
          }
        }
        if (sentences.length >= 4) break;   // 교재 매칭에서 충분히 얻었으면 레벨 폴백 생략
      }
    }
  } catch {}
  return { textbook, level, lesson_no: lessonNo, student_name: studentName, sentences: sentences.slice(0, 8) };
}

/* GET /api/warmup/context — 웜업 페이지가 첫 화면에서 '오늘 교재'를 표시할 때 사용 */
async function handleWarmupContext(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const userId = (u.searchParams.get('user_id') || '').trim();
    const ctx = await warmupLessonContext(env, {
      userId,
      textbook: (u.searchParams.get('textbook') || '').trim(),
      level: (u.searchParams.get('level') || '').trim(),
      lessonNo: parseInt(u.searchParams.get('lesson') || '0', 10) || null,
    });
    // 🕸️ 개인화(Neo4j): 자주 틀린 문장 — 미설정/장애 시 빈 배열 (페이지 로드당 1회 호출이라 캐시 불필요)
    let weak: Array<{ text: string; wrongCount: number; inTodayTextbook: boolean }> = [];
    if (userId && env.NEO4J_QUERY_URL) {
      try { weak = await getWeakSentences(env as any, userId, ctx.textbook || '', 5); } catch {}
    }
    return new Response(JSON.stringify({ ok: true, ...ctx, weak_sentences: weak }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  🎮 학생게임 맞춤 출제 — GET /api/games/vocab?user_id=
 *  로그인 학생의 배정 교재/레벨(students_erp) → 그 교재의 복습퀴즈 은행(review_quizzes)에서
 *  영어 문장(+가능하면 한국어 뜻)과, 학생 단어장(vocabulary)의 en/ko 단어쌍을 반환한다.
 *  게임(문장벽돌·빈칸·매칭·풍선·낚시·슈팅·3D배틀)이 이 데이터로 맞춤 출제한다.
 *  응답: { ok, textbook, level, student_name, sentences:[{en,ko}], words:[{en,ko}] }
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesVocab(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const userId = (u.searchParams.get('user_id') || '').trim();
    let textbook = (u.searchParams.get('textbook') || '').trim();
    let level = (u.searchParams.get('level') || '').trim();
    let studentName = '';
    if (userId) {
      try {
        const s: any = await env.DB.prepare(`SELECT english_name, korean_name, level, textbook FROM students_erp WHERE user_id = ? LIMIT 1`).bind(userId).first();
        if (s) {
          if (!textbook && s.textbook) textbook = String(s.textbook).trim();
          if (!level && s.level) level = String(s.level).trim();
          studentName = String(s.english_name || s.korean_name || '').trim();
        }
      } catch {}
    }

    // ── 문장: 교재(→레벨 폴백) 복습퀴즈 은행에서 추출. write형 "…: 한국어" 프롬프트에서 ko 짝 확보(있을 때만)
    const sentences: Array<{ en: string; ko: string }> = [];
    const seenEn = new Set<string>();
    const pushSentence = (en: any, ko: string) => {
      const s = String(en || '').trim();
      if (!s || !/[a-zA-Z]/.test(s) || s.length > 90) return;
      const key = s.toLowerCase();
      if (seenEn.has(key)) return;
      seenEn.add(key);
      sentences.push({ en: s, ko });
    };
    const koFromPrompt = (q: any): string => {
      // "다음 뜻의 영어 문장을 쓰세요: 나는 망고를 좋아해요." → 콜론 뒤 한국어만 채택
      const t = String(q || '');
      const i = Math.max(t.lastIndexOf(':'), t.lastIndexOf('：'));
      if (i < 0) return '';
      const tail = t.slice(i + 1).trim();
      return (/[가-힣]/.test(tail) && tail.length >= 2 && tail.length <= 60) ? tail : '';
    };
    try {
      if (textbook || level) {
        const tries: Array<{ sql: string; binds: any[] }> = [];
        if (textbook) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(textbook)=LOWER(?) ORDER BY id DESC LIMIT 4`, binds: [textbook] });
        if (level) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(level)=LOWER(?) ORDER BY id DESC LIMIT 4`, binds: [level] });
        for (const t of tries) {
          const rs = await env.DB.prepare(t.sql).bind(...t.binds).all();
          for (const row of (((rs.results as any[]) || []))) {
            let qs: any[] = []; try { qs = JSON.parse((row as any).questions) || []; } catch {}
            for (const q of qs) {
              const ko = koFromPrompt(q?.q);
              pushSentence(q?.answer_text || q?.audio_text || q?.target, ko);
            }
          }
          if (sentences.length >= 6) break;   // 교재 매칭에서 충분하면 레벨 폴백 생략
        }
      }
    } catch {}

    // ── 단어(en/ko 쌍): 학생 단어장(vocabulary) 최근 30개 — 매칭/풍선 게임용
    const words: Array<{ en: string; ko: string }> = [];
    try {
      if (userId) {
        const rs = await env.DB.prepare(`SELECT word, korean FROM vocabulary WHERE user_id = ? ORDER BY id DESC LIMIT 30`).bind(userId).all();
        const seenW = new Set<string>();
        for (const row of (((rs.results as any[]) || []))) {
          const en = String((row as any).word || '').trim();
          const ko = String((row as any).korean || '').trim();
          if (!en || !ko || !/[a-zA-Z]/.test(en) || en.length > 30) continue;
          const key = en.toLowerCase();
          if (seenW.has(key)) continue;
          seenW.add(key);
          words.push({ en, ko });
        }
      }
    } catch {}

    return new Response(JSON.stringify({
      ok: true, textbook, level, student_name: studentName,
      sentences: sentences.slice(0, 20), words: words.slice(0, 24),
    }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  🀄 중국어 게임 어휘 — GET /api/games/zh-vocab?textbook=&level=&lesson=
 *  다락원 교재 스캔에서 추출해 zh_vocab 에 저장한 한자+병음+한국어뜻(+문장 분절)을
 *  게임이 쓰는 형태로 반환한다. (없으면 게임은 내장 기본 중국어 어휘로 폴백)
 *  응답: { ok, textbook, level, sentences:[{en,pinyin,ko,words[]}], words:[{en,pinyin,ko}] }
 *    · en 필드에 한자(게임 호환), pinyin 병음, ko 한국어 뜻.
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesZhVocab(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const textbook = (u.searchParams.get('textbook') || '').trim();
    const level = (u.searchParams.get('level') || '').trim();
    const lesson = parseInt(u.searchParams.get('lesson') || '0', 10) || 0;
    const conds: string[] = ['active=1'];
    const binds: any[] = [];
    if (textbook) { conds.push('LOWER(textbook)=LOWER(?)'); binds.push(textbook); }
    if (level) { conds.push('LOWER(level)=LOWER(?)'); binds.push(level); }
    if (lesson > 0) { conds.push('lesson_no=?'); binds.push(lesson); }
    let rows: any[] = [];
    try {
      const rs = await env.DB.prepare(
        `SELECT type, hanzi, pinyin, ko, words FROM zh_vocab WHERE ${conds.join(' AND ')} ORDER BY id ASC LIMIT 400`
      ).bind(...binds).all();
      rows = (rs.results as any[]) || [];
    } catch { rows = []; }
    const sentences: Array<{ en: string; pinyin: string; ko: string; words: string[] }> = [];
    const words: Array<{ en: string; pinyin: string; ko: string }> = [];
    for (const r of rows) {
      const hanzi = String(r.hanzi || '').trim(); if (!hanzi) continue;
      const pinyin = String(r.pinyin || '').trim();
      const ko = String(r.ko || '').trim();
      if (r.type === 'sentence') {
        let ws: string[] = []; try { ws = JSON.parse(r.words || '[]') || []; } catch {}
        // 🛡️ 안전장치: 분절(words)이 원문 한자를 온전히 복원하지 못하면(글자 누락/불일치)
        //   병음·한국어와 어긋난 깨진 문장이 화면에 나온다. 이때는 한자를 낱글자로 분해해
        //   전체 문장이 항상 정확히 표시되도록 강제 복구한다.
        const cjk = (hanzi.match(/[㐀-鿿]/g) || []);              // 구두점 제외 한자만
        const joined = ws.map((x) => String(x)).join('');
        if (cjk.length && joined !== cjk.join('')) ws = cjk;             // 불일치 → 낱글자 폴백
        if (ws.length >= 2) sentences.push({ en: hanzi, pinyin, ko, words: ws });
      } else {
        if (ko) words.push({ en: hanzi, pinyin, ko });
      }
    }
    return new Response(JSON.stringify({ ok: true, textbook, level, sentences, words }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  🧠 게임 학습기록 — 오답/정답 누적으로 학생별 약점 단어 파악
 *  · POST /api/games/progress  {user_id, lang, events:[{item, ko, correct}]}
 *      게임(간격반복 엔진)이 정오답 이벤트를 모아 보내면 game_progress 에 UPSERT 누적.
 *  · GET  /api/games/weak?user_id=&lang=&limit=  → 약점(자주 틀린) 단어 목록.
 *      교사 대시보드 + 웜업/복습 맞춤 재출제에 사용.
 * ════════════════════════════════════════════════════════════════════════ */
async function _ensureGameProgressTable(env: Env) {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS game_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, lang TEXT NOT NULL, item TEXT NOT NULL, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, pron_best INTEGER DEFAULT 0, pron_last INTEGER DEFAULT 0, pron_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, UNIQUE(user_id, lang, item));`);
}
/* 🪙🏆 게임 코인 + 주간 랭킹 — game_stats(user_id, nickname, coins_total, coins_week, week_start)
 *   · POST /api/games/coins {user_id, nickname, add}  → 코인 적립(주 바뀌면 주간 리셋). 리더보드 = 이번 주 적립 코인.
 *   · GET  /api/games/leaderboard?limit=              → 이번 주 코인 상위(닉네임).
 *   닉네임은 학생이 정한 게임 핸들(students_erp PII 조회 회피). 스킨 구매는 클라이언트에서 잔액 차감. */
function _weekStart(now: number): number {
  // 주 시작(월요일 00:00 UTC 근사) — 주간 리셋 기준
  const day = 24 * 60 * 60 * 1000;
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7;   // 월=0
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - dow * day;
}
async function _ensureGameStatsTable(env: Env) {
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS game_stats (user_id TEXT PRIMARY KEY, nickname TEXT, coins_total INTEGER DEFAULT 0, coins_week INTEGER DEFAULT 0, week_start INTEGER DEFAULT 0, updated_at INTEGER);`);
}
async function handleGamesCoins(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const userId = String(body?.user_id || '').trim().slice(0, 100);
    let nickname = String(body?.nickname || '').trim().slice(0, 24).replace(/[<>]/g, '');
    let add = Math.round(Number(body?.add) || 0);
    if (add < 0) add = 0; if (add > 5000) add = 5000;   // 1회 상한(어뷰징 방지)
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'user_id_required' }), { status: 400, headers: _MS_JSON });
    await _ensureGameStatsTable(env);
    const now = Date.now(); const ws = _weekStart(now);
    const cur: any = await env.DB.prepare(`SELECT coins_total, coins_week, week_start, nickname FROM game_stats WHERE user_id = ?`).bind(userId).first();
    if (!nickname) nickname = (cur && cur.nickname) || '';
    let total = (cur?.coins_total || 0) + add;
    let week = ((cur && cur.week_start === ws) ? (cur.coins_week || 0) : 0) + add;   // 주 바뀌면 주간 리셋
    await env.DB.prepare(
      `INSERT INTO game_stats (user_id, nickname, coins_total, coins_week, week_start, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET nickname=excluded.nickname, coins_total=excluded.coins_total, coins_week=excluded.coins_week, week_start=excluded.week_start, updated_at=excluded.updated_at`
    ).bind(userId, nickname, total, week, ws, now).run();
    return new Response(JSON.stringify({ ok: true, coins_total: total, coins_week: week }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}
async function handleGamesLeaderboard(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const limit = Math.min(50, parseInt(u.searchParams.get('limit') || '20', 10) || 20);
    await _ensureGameStatsTable(env);
    const ws = _weekStart(Date.now());
    const rs = await env.DB.prepare(
      `SELECT nickname, coins_week FROM game_stats WHERE week_start = ? AND coins_week > 0 AND nickname IS NOT NULL AND nickname != '' ORDER BY coins_week DESC LIMIT ?`
    ).bind(ws, limit).all();
    const top = ((rs.results as any[]) || []).map((r, i) => ({ rank: i + 1, nickname: r.nickname, coins: r.coins_week || 0 }));
    return new Response(JSON.stringify({ ok: true, week_start: ws, top }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* 🔤 영어 게임 어휘 은행 — 난이도별 영어 문장+단어(en_vocab). 게임 폴백을 12→풍부하게. */
async function handleGamesEnVocab(request: Request, env: Env): Promise<Response> {
  try {
    let rows: any[] = [];
    try {
      const rs = await env.DB.prepare(`SELECT type, en, ko, words FROM en_vocab WHERE active=1 ORDER BY id ASC LIMIT 400`).all();
      rows = (rs.results as any[]) || [];
    } catch { rows = []; }
    const sentences: Array<{ en: string; ko: string; words: string[] }> = [];
    const words: Array<{ en: string; ko: string }> = [];
    for (const r of rows) {
      const en = String(r.en || '').trim(); if (!en) continue;
      const ko = String(r.ko || '').trim();
      if (r.type === 'sentence') {
        let ws: string[] = []; try { ws = JSON.parse(r.words || '[]') || []; } catch {}
        if (!ws.length) ws = en.replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean);
        if (ws.length >= 2) sentences.push({ en, ko, words: ws });
      } else if (ko) {
        words.push({ en, ko });
      }
    }
    return new Response(JSON.stringify({ ok: true, sentences, words }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

async function handleGamesProgress(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const userId = String(body?.user_id || '').trim().slice(0, 100);
    const lang = (String(body?.lang || 'en').toLowerCase() === 'zh') ? 'zh' : 'en';
    const events: any[] = Array.isArray(body?.events) ? body.events.slice(0, 200) : [];
    if (!userId || !events.length) return new Response(JSON.stringify({ ok: false, error: 'missing' }), { status: 400, headers: _MS_JSON });
    await _ensureGameProgressTable(env);
    const now = Date.now();
    const stmt = env.DB.prepare(
      `INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, last_seen, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lang, item) DO UPDATE SET
         wrong_count = wrong_count + excluded.wrong_count,
         correct_count = correct_count + excluded.correct_count,
         ko = COALESCE(NULLIF(excluded.ko,''), ko),
         last_seen = excluded.last_seen, updated_at = excluded.updated_at`
    );
    const batch: any[] = [];
    for (const e of events) {
      const item = String(e?.item || '').trim().slice(0, 200); if (!item) continue;
      const ko = String(e?.ko || '').trim().slice(0, 200);
      const correct = e?.correct ? 1 : 0;
      batch.push(stmt.bind(userId, lang, item, ko, correct ? 0 : 1, correct, now, now));
    }
    if (batch.length) await env.DB.batch(batch);
    return new Response(JSON.stringify({ ok: true, saved: batch.length }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}
async function handleGamesWeak(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const userId = String(u.searchParams.get('user_id') || '').trim();
    const lang = (String(u.searchParams.get('lang') || 'en').toLowerCase() === 'zh') ? 'zh' : 'en';
    const limit = Math.min(50, parseInt(u.searchParams.get('limit') || '15', 10) || 15);
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'user_id_required' }), { status: 400, headers: _MS_JSON });
    await _ensureGameProgressTable(env);
    // 약점 = 오답이 있고 (오답 ≥ 정답) 인 항목, 오답 많은 순
    const rs = await env.DB.prepare(
      `SELECT item, ko, wrong_count, correct_count, pron_best, pron_count FROM game_progress
       WHERE user_id = ? AND lang = ? AND wrong_count > 0 AND wrong_count >= correct_count
       ORDER BY wrong_count DESC, (wrong_count - correct_count) DESC LIMIT ?`
    ).bind(userId, lang, limit).all();
    const weak = ((rs.results as any[]) || []).map((r) => ({
      item: r.item, ko: r.ko || '', wrong: r.wrong_count || 0, correct: r.correct_count || 0,
      pron_best: r.pron_best || 0, pron_count: r.pron_count || 0
    }));
    return new Response(JSON.stringify({ ok: true, lang, weak }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}
// 🎤 따라말하기 발음 점수 저장 — game_progress 에 발음 지표(최고/최근/횟수) 누적
async function handleGamesShadow(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const userId = String(body?.user_id || '').trim().slice(0, 100);
    const lang = (String(body?.lang || 'en').toLowerCase() === 'zh') ? 'zh' : 'en';
    const item = String(body?.item || '').trim().slice(0, 200);
    const ko = String(body?.ko || '').trim().slice(0, 200);
    let score = Math.round(Number(body?.score) || 0); if (score < 0) score = 0; if (score > 100) score = 100;
    if (!userId || !item) return new Response(JSON.stringify({ ok: false, error: 'missing' }), { status: 400, headers: _MS_JSON });
    await _ensureGameProgressTable(env);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, pron_best, pron_last, pron_count, last_seen, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, 1, ?, ?)
       ON CONFLICT(user_id, lang, item) DO UPDATE SET
         pron_best = MAX(pron_best, excluded.pron_best),
         pron_last = excluded.pron_last,
         pron_count = pron_count + 1,
         ko = COALESCE(NULLIF(excluded.ko,''), ko),
         last_seen = excluded.last_seen, updated_at = excluded.updated_at`
    ).bind(userId, lang, item, ko, score, score, now, now).run();
    return new Response(JSON.stringify({ ok: true, score }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

async function handleWarmupChat(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const sessionId = (body && typeof body.session_id === 'string') ? body.session_id.trim() : '';
    const studentInput = (body && typeof body.student_input === 'string') ? body.student_input.trim() : '';
    const lessonTopic = (body && typeof body.lesson_topic === 'string') ? body.lesson_topic.trim() : '';
    const ctxUserId = (body && typeof body.user_id === 'string') ? body.user_id.trim().slice(0, 100) : '';
    const ctxTextbook = (body && typeof body.textbook === 'string') ? body.textbook.trim().slice(0, 200) : '';
    const ctxLevel = (body && typeof body.level === 'string') ? body.level.trim().slice(0, 100) : '';
    const ctxLessonNo = Number(body && body.lesson_no) > 0 ? Number(body.lesson_no) : null;

    // ── 입력 검증(Pydantic 대응) ──
    if (!sessionId) {
      return new Response(JSON.stringify({ detail: 'session_id 가 비어 있습니다.' }), { status: 422, headers: _MS_JSON });
    }
    if (!studentInput) {
      return new Response(JSON.stringify({ detail: 'student_input 가 비어 있습니다.' }), { status: 422, headers: _MS_JSON });
    }
    if (!env.AI) {
      return new Response(JSON.stringify({ detail: 'Workers AI(AI 바인딩)를 사용할 수 없습니다.' }), { status: 502, headers: _MS_JSON });
    }

    // ── 이전 대화 히스토리 불러오기 ──
    const hkey = 'warmup:' + sessionId;
    let history: any[] = [];
    try {
      const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(hkey) : null;
      if (raw) history = JSON.parse(raw);
    } catch {}

    // ── 시스템 프롬프트(주제 + 오늘 배울 교재 반영) + 히스토리 + 이번 발화로 messages 구성 ──
    let sys = WARMUP_SYSTEM;
    if (lessonTopic) sys += ` 오늘의 대화 주제는 '${lessonTopic}' 이야.`;
    // 🗓️ 오늘 배울 교재 연동: 학생 배정 교재(students_erp) + 그 교재의 실제 문장(review_quizzes)으로 워밍업 질문
    if (ctxUserId || ctxTextbook || ctxLevel) {
      try {
        const lc = await warmupLessonContext(env, { userId: ctxUserId, textbook: ctxTextbook, level: ctxLevel, lessonNo: ctxLessonNo });
        if (lc.textbook || lc.level || lc.sentences.length) {
          if (lc.student_name) sys += ` 학생 이름은 '${lc.student_name}' 이야.`;
          sys += ` [오늘 수업 정보] 학생이 오늘 수업에서 배울 교재: '${lc.textbook || '미지정'}'${lc.level ? ` (레벨 ${lc.level})` : ''}${lc.lesson_no ? `, Lesson ${lc.lesson_no}` : ''}.`;
          if (lc.sentences.length) sys += ` 오늘 배울 핵심 영어 문장 예시: ${lc.sentences.map((s) => `"${s}"`).join(' / ')}.`;
          sys += " 웜업 방식: 이 교재 내용(위 문장들의 단어·표현·주제)을 활용해서 아주 쉬운 영어 질문을 한 번에 하나만 물어봐. 학생이 답하면 1문장으로 칭찬하거나 자연스럽게 교정해 주고, 이어서 교재와 관련된 다음 질문을 해줘.";
        }
        // 🕸️ 개인화(Neo4j): 이 학생이 복습퀴즈에서 자주 틀린 문장 → 우선 복습 질문.
        //    Aura 는 외부 HTTP 라 세션당 1회만 조회하고 KV 에 30분 캐시(매 메시지 호출 방지).
        //    Neo4j 미설정/장애 시 빈 배열로 조용히 degrade — 기본 교재 연동은 그대로 동작.
        if (ctxUserId && env.NEO4J_QUERY_URL) {
          let weak: Array<{ text: string; wrongCount: number; inTodayTextbook: boolean }> = [];
          const wkey = 'warmupweak:' + sessionId + ':' + ctxUserId;
          let cached = false;
          try {
            const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(wkey) : null;
            if (raw != null) { weak = JSON.parse(raw); cached = true; }
          } catch {}
          if (!cached) {
            try { weak = await getWeakSentences(env as any, ctxUserId, ctxTextbook || lc.textbook || '', 5); } catch { weak = []; }
            try { if (env.SESSION_STATE) await env.SESSION_STATE.put(wkey, JSON.stringify(weak), { expirationTtl: 1800 }); } catch {}
          }
          if (weak.length) {
            const list = weak.map((w) => `"${w.text}"(${w.wrongCount}회 틀림${w.inTodayTextbook ? '·오늘 교재' : ''})`).join(' / ');
            sys += ` [개인화] 이 학생이 복습퀴즈에서 자주 틀린 문장: ${list}. 웜업 질문을 만들 때 이 표현들을 우선으로 자연스럽게 섞어서 다시 연습시켜줘. 단, 틀렸다는 사실은 언급하지 말고 격려하는 톤을 유지해.`;
          }
        }
      } catch {}
    }
    const messages = [{ role: 'system', content: sys }]
      .concat(history)
      .concat([{ role: 'user', content: studentInput }]);

    // ── Workers AI 호출 ──
    let aiText = '';
    try {
      const result: any = await env.AI.run(WARMUP_MODEL, { messages, max_tokens: 200, temperature: 0.7 });
      aiText = (result && (result.response || result.result || '')).toString().trim();
    } catch (e: any) {
      return new Response(JSON.stringify({ detail: 'AI 응답 생성 실패: ' + String(e?.message || e) }), { status: 502, headers: _MS_JSON });
    }
    if (!aiText) aiText = "Let's try again! Tell me about your day. 😊";

    // ── 히스토리 갱신(최근 N턴만) + 6시간 TTL 저장 ──
    try {
      const updated = history.concat([
        { role: 'user', content: studentInput },
        { role: 'assistant', content: aiText }
      ]).slice(-WARMUP_MAX_TURNS * 2);
      if (env.SESSION_STATE) await env.SESSION_STATE.put(hkey, JSON.stringify(updated), { expirationTtl: 6 * 3600 });
    } catch {}

    const turnCount = Math.floor(history.length / 2) + 1;
    return new Response(JSON.stringify({ session_id: sessionId, ai_response: aiText, turn_count: turnCount }),
      { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: 'warmup_failed: ' + String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
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

  // 🔒🔒 [보안 근본수정 2026-07-09] /api/admin/* 는 기본 전부 인증 필요 (DEFAULT-DENY).
  //   과거엔 아래처럼 경로를 하나씩 allowlist 로 나열했는데, 새 admin API 를 추가하면서
  //   여기 등록을 빠뜨리면 그 API 가 '무인증 공개'로 뚫렸다(감사로그·미납독촉·평가·매출예측·
  //   카톡수신함 등 대량 노출 실제 확인). 이제는 /api/admin/ 로 시작하면 무조건 인증을 요구하고,
  //   학생 화면이 재사용하는 소수 예외만 isAdminPublicApi() 로 명시 공개한다.
  //   → login/logout 은 isAuthPublicPath() 로 미들웨어에서 별도 우회되므로 여기서 true 여도 무방.
  if (path.startsWith('/api/admin/')) {
    if (isAdminPublicApi(path, method)) return false;  // 학생용 공개 예외 → 인증 불필요
    return true;                                        // 그 외 모든 admin API → 인증 필수
  }
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
  // 🧩 신규 운영 인프라 4모듈 API (2026-06-24) — 관리자 전용
  if (path.startsWith('/api/admin/mod/')) return true;
  // 📊 경영진 대시보드 + API (2026-06-09) — 관리자 전용
  if (path === '/admin/exec' || path === '/admin/exec/' || path === '/admin/exec.html') return true;
  if (path.startsWith('/api/admin/exec/')) return true;
  // 🧾 강사 급여 자동 대시보드 + API (2026-07-11) — 관리자 전용
  if (path === '/admin/teacher-payroll' || path === '/admin/teacher-payroll/' || path === '/admin/teacher-payroll.html') return true;
  if (path === '/api/admin/payroll/auto') return true;
  if (path === '/api/admin/payroll/rate') return true;
  if (path === '/api/admin/payroll/mark-paid') return true;
  // 🔁 수강권 만료·재활성 대시보드 + API (2026-07-11) — 관리자 전용
  if (path === '/admin/retention' || path === '/admin/retention/' || path === '/admin/retention.html') return true;
  if (path === '/api/admin/retention' || path === '/api/admin/retention/contacted') return true;
  // 💸 이중결제 감사·환불 처리 + API (2026-07-11) — 관리자 전용
  if (path === '/admin/duplicate-payments' || path === '/admin/duplicate-payments/' || path === '/admin/duplicate-payments.html') return true;
  if (path === '/api/admin/duplicate-payments' || path === '/api/admin/duplicate-payments/resolve') return true;
  // 🎓 학습 인사이트 대시보드 + API (2026-06-03) — 관리자 전용
  if (path === '/admin/learning-insights' || path === '/admin/learning-insights/' || path === '/admin/learning-insights.html') return true;
  if (path.startsWith('/api/admin/learning/')) return true;
  // 🎯 강사 매칭 추천 대시보드 + API (teacher-match) — 관리자 전용 (인증 필수)
  if (path === '/admin/teacher-match' || path === '/admin/teacher-match/' || path === '/admin/teacher-match.html') return true;
  if (path.startsWith('/api/admin/teacher-match/')) return true;
  // 🗣️ 웜업 개인화 그래프 ETL/디버그 (warmup-graph) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/warmup-graph/')) return true;
  // 🕸 이탈 전염 위험 그래프 (churn-contagion) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/churn-contagion/')) return true;
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
  // 🎨 포스터 만들기 (관리자 전용 — 저장/수정/삭제)
  if (path === '/api/admin/posters' || /^\/api\/admin\/posters\/\d+$/.test(path)) return true;
  // 📥 CSV 내보내기 (Phase 6) — 관리자 전용
  if (path.startsWith('/api/admin/export/')) return true;
  // 💰 저장소·비용 통계 (Phase 7) — 관리자 전용
  if (path.startsWith('/api/admin/stats/')) return true;
  // 🥭 Phase 21 — AI 명령 / 액션 (Workers AI)
  if (path === '/api/admin/ai-command' || path === '/api/admin/ai-action') return true;
  if (path === '/api/admin/omnisearch') return true;
  if (path === '/api/admin/class-schedules' || path === '/api/admin/class-schedules/seed-demo' || /^\/api\/admin\/class-schedules\/\d+$/.test(path)) return true;
  if (path === '/api/admin/schedules') return true;
  if (path === '/api/admin/unassigned-students') return true;
  if (path === '/api/admin/notify-queue') return true;
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
  if (path === '/api/admin/students/graph-list') return true;   // 🕸️ Neo4j 그래프 학생 명부
  if (path === '/api/admin/teachers/graph-list') return true;   // 👩‍🏫 Neo4j 그래프 강사 명부
  if (path === '/api/admin/staff/graph-list') return true;      // 🧑‍💼 Neo4j 그래프 직원 명부
  if (path === '/api/admin/books/graph-list') return true;      // 📚 Neo4j 그래프 교재 명부
  if (path === '/api/admin/leveltest/overview') return true;    // 🏅 Neo4j 레벨테스트 배치 현황
  if (path === '/api/admin/selfscore/trend') return true;       // 📈 Neo4j 자가평가 월별 추이
  if (/^\/api\/admin\/finance-cafe24\/[a-z]+$/.test(path)) return true;  // 💰 Neo4j 회계(장부·급여·지출·세금·예치금)
  if (path === '/api/admin/students/import-cafe24') return true; // 👨‍🎓 카페24 학생 이관(쓰기) — 반드시 인증 뒤
  if (path === '/api/admin/org/import-cafe24') return true;      // 🏢 카페24 조직 이관(쓰기) — 반드시 인증 뒤
  if (path === '/api/admin/attendance/import-cafe24') return true; // 📅 카페24 출석 이관(쓰기) — 반드시 인증 뒤
  if (path === '/api/admin/payments/import-cafe24') return true; // 💰 카페24 결제 이관(쓰기) — 반드시 인증 뒤
  if (path === '/api/admin/students/erp-list' || path === '/api/admin/students/erp' || path === '/api/admin/students/erp-seed') return true;
  // 📚 Phase HW — 숙제 관리 (출제/목록/삭제) — 관리자 전용
  if (path.startsWith('/api/admin/homework/')) return true;
  // 🔁 Streak 일괄 정합화 수동 트리거 — HQ 관리자 전용 (agency 허용목록에 없어 403)
  if (path === '/api/admin/streak/reconcile') return true;
  // 💰 회계 보고서 (accounting-reports) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/reports/')) return true;
  // 🏢 조직 정산 트리 (org-settlement) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/settlement/') || path === '/api/admin/settlement') return true;
  // 🔒 [PII 감사 2026-07-10] 대량 개인정보 덤프 엔드포인트 — 관리자 전용으로 잠금.
  //   (감사에서 무인증 전체명단 유출 확인 + 학생/강사 프론트가 호출 안 함 → 안전하게 게이트)
  //   나머지 per-user IDOR 은 프론트 토큰 연동이 필요해 별도 계획(docs/보안_PII_감사.md)으로 진행.
  if (path === '/api/kakao-id/teachers') return true;              // 전 강사 kakao_id·전화 덤프
  if (path.startsWith('/api/parent/digest/')) return true;         // 전 학부모 전화+메시지·일괄발송
  if (path === '/api/eval/ai-lesson-report/list') return true;     // 전 학생 수업 리포트(전사 포함) 목록
  if (path === '/api/alumni/list') return true;                    // 전 동문 프로필(지역 등) 덤프
  if (path === '/api/recordings/check') return true;               // R2 녹화 객체 열거(재생키 유출 보조)
  // 🔒 [PII 4차 2026-07-10] 영상/전사 — 미성년자 수업영상 키 열거·전사 유출 통로 차단(프론트 미사용/우아한 실패).
  if (path.startsWith('/api/recordings/stream/')) return true;     // 영상 id 스트리밍(프론트 미사용)
  if (path === '/api/recordings/list-recent') return true;         // 전체 녹화 메타+blob키 덤프(열거 벡터)
  if (/^\/api\/eval\/ai-lesson-report\/\d+$/.test(path)) return true; // 수업 전사 전문 단건(정수 id, 프론트 미사용)
  // 🔒 [PII 2차 2026-07-10] 무단구독 — 프론트 미사용 확인 후 관리자 전용 잠금.
  //   (set-password 는 학부모 '내 자녀 계정 잠그기(claim)' 흐름에 필요해 공개 유지.
  //    비번 없는 계정=최초 설정(claim), 비번 있는 계정=옛 비번 검증 필수 → 탈취 방지는 claim 순서로 담보)
  if (path === '/api/subscription/create') return true;            // 임의 유저 구독 무단생성 방지
  // 🔒 [PII 3차 2026-07-10] 학부모/전화 — 관리자 진단페이지만 사용(admin/health) 또는 호출없음 → 잠금.
  if (path === '/api/kakao-id' || path.startsWith('/api/kakao-id/')) return true;  // 임의유저 전화·kakao_id 조회/덮어쓰기
  if (path === '/api/consents' || path.startsWith('/api/consents/')) return true;  // 동의서 전화·IP·기기정보 조회/위조
  if (path === '/api/parent/link-child') return true;              // 아무 학생을 공격자 학부모에 연결
  if (path === '/api/parent/my-children') return true;             // 학부모 자녀명단 조회
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
  // 🏬 상세 관리자 콘솔(화상수업 대시보드) — 대리점·지사도 '대리점 모드'로 진입 허용.
  //   데이터는 여전히 isAgencyAllowedApi + getScope 로 자기 소속만 보이게 격리됨(본인 학생반 접근 권한).
  if (path === '/admin' || path === '/admin/' || path === '/admin.html') return true;
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
    // 🏢 정산 트리(org-settlement)는 자체 scopedRootId()로 agency/branch를 자기 노드로,
    //   franchise는 설계상 HQ 진입 후 합산으로 이미 격리하므로 공통 허용목록에 포함.
    '/api/admin/settlement/',
  ];
  return allow.some(a => path === a || path.startsWith(a));
}

/**
 * 🔒 /api/admin/* 중 '무인증 공개'로 남겨둘 소수 예외.
 *   - 역사적으로 학생/홈 화면(index.html)이 관리자 API 를 그대로 재사용해 만든 것들.
 *   - 원칙적으로는 전용 학생 엔드포인트로 옮겨야 할 기술부채(아래 TODO).
 *     그 전까지 default-deny 를 깨지 않으면서 학생 기능이 안 죽게 최소만 열어둔다.
 *   ⚠️ 여기에 항목을 추가하는 것은 '공개'를 뜻한다 — 개인정보/경영데이터 엔드포인트는 절대 넣지 말 것.
 *
 *   ⚙️ 선정 기준: '현재(수정 전) prod 에서 이미 무인증 공개(200)라서, 막으면 학생 기능이 깨지는 것'만 예외로 둔다.
 *      → 회귀(기능 깨짐) 0 을 보장하면서, 진짜 새던 관리자 API(감사로그·미납독촉·평가 등)는 전부 닫는다.
 *      (참고: /api/admin/class-schedules 는 현재 이미 401 로 차단돼 있어 예외에 넣지 않는다.
 *             공개로 열면 ?user_id= 로 남의 수업일정을 조회하는 새 IDOR 가 생기므로 그대로 차단 유지.)
 *
 *   ✅ 2026-07-10 정리: points/list, gifts/seed-catalog 예외는 제거됨(전용 공개 엔드포인트로 대체).
 *      - 학원 랭킹 → /api/points/leaderboard (top-N, 최소필드) 신설, index.html 이 이걸 호출.
 *      - 기프트 시드 → 공개 /api/gifts/catalog 가 비면 서버가 자동 시드. admin/gifts/seed-catalog 는 이제 인증 필요.
 *
 *   ⚠️ 남은 1개(학부모 인증 체계 도입 후 잠글 것):
 *     - /api/admin/ai-analyze/student(POST) → 학부모 화면(parent.html)이 사용. parent.html 에는 로그인/토큰이
 *       아예 없어서 지금 잠그면 학부모가 못 봄. student_uid 만 알면 누구나 조회되는 상태이므로,
 *       학부모 토큰 인증(로그인)을 먼저 붙인 뒤 이 예외를 제거해야 함.
 */
function isAdminPublicApi(path: string, _method: string): boolean {
  if (path === '/api/admin/ai-analyze/student') return true; // 학부모 성장분석(parent.html) — 학부모인증 도입 전까지 공개 유지
  return false;
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
