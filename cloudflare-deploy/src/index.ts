/**
 * index.ts - Main Worker entry point
 * Handles routing, API endpoints, and WebSocket upgrades
 */

import { SignalingRoom } from './signaling-room';
import { VideoCallRoom } from './video-call-room';
import { HealthResponse, TurnConfigResponse, PdfUploadResponse } from './types';
import { handleMangoApi } from './api-mango';
import { handleDurationQueue } from './duration-change-queue';   // 📅 수업 길이 변경 신청함(월 1회 일괄 반영)
import { wrapDbDdlOnce } from './db-ddl-once';                              // ⚡ 같은 DDL 은 격리당 한 번만
import { beginNightlyRun, markNightlyStep, endNightlyRun } from './nightly-run';  // 🌙 야간 배치가 어디까지 갔나
import { runMonthlyReports } from './api-reports';  // 20차 이동
import { reconcileAllStreaks } from './api-games';  // 3차 이동(2026-07-14)
import { handlePayApi, runPaymentAudit, runAutoRenewChargeSweep } from './api-pay';
import { runEnrollExpirySweep, runHolidayShiftSweep } from './enroll-ops';   // 📚 수강 만료 안내 · 공휴일 자동 연기
import { runWeeklyParentDigestSweep } from './api-students';   // 📅 학부모 주간 리포트(금요일 크론)
import { handlePayrollIngest, getPayrollAuto, payrollAiSummary, setPhpKrwRate, markPayrollPaid } from './api-payroll-auto';
import { handleRetentionIngest, getRetention, markRetentionContacted, getRetentionSettings, setRetentionSettings, previewRetentionMessage, sendRetentionMessages, runRetentionAutoSend } from './api-retention';
import { runAbsentStudentSweep } from './absent-sweep';
import { runLessonInsightSweep } from './lesson-insight';   // 🎥 수업 종료 후 학생별 AI 리포트 배치
import { runLessonReminderSweep, runFeedbackReminderSweep } from './lesson-reminder';
import { runLeveltestReminderSweep, runLeveltestDayBeforeSweep, runLeveltestHourBeforeSweep } from './leveltest-ticket';   // 🎟️ 레벨테스트 T-10 «확인+입장» 링크
import { handleTraitsApi } from './api-traits';
import { resolveFriendName, wrongSelfName, askedOwnName } from './ai-friends';   // 🧑 AI 친구 이름 정본 + «다른 이름으로 소개했나» 판정
import { getDuplicatePayments, resolveDuplicate } from './api-refund-audit';
import { runSiteWatchdog } from './api-uptime';   // 🐕 사이트 자체 감시견(cron */15)
import { purgeExpired } from './retention';
import { purgeOrphanedRecordings } from './recordings-cleanup';
import { handleLivekit, ensureLivekitSchema } from './livekit-bridge';
import { handleRecordingUpload as handleR2MultipartUpload, runRecordingFinalizeSweep } from './recordings-r2';
import { handleAdminAuthApi, checkAdminSession, getAdminActor, isOrgScopedRole, PH_MANAGERS } from './auth-admin';
import { handleTeacherApi } from './api-teacher';   // 🇵🇭 강사 전용 초경량 포털 (1요청 집계)
import { handleApprovalApi } from './api-approval'; // 🧾 결재(기안·지출·문서)
import { handleSalesHrApi } from './api-sales-hr';   // 🚗 영업담당자 실적·인사평가·보상
import { handleOutageApi } from './api-outage';     // ⚡ 정전·인터넷 장애 신고
import { handleMenuHitApi } from './api-menuhit';   // 📏 관리자 메뉴 클릭 계측(«무엇이 안 눌리는가»)
import { reportsRouter } from './accounting-reports';
import { settlementRouter } from './org-settlement';
import { capitownRouter } from './api-capitown';
import { realtimeRouter, runFinanceSnapshot } from './accounting-realtime';
import { modulesRouter } from './modules-ext';
import { execRouter } from './exec-summary';
import { getScope } from './scope';
import { learningRouter, runLearningSnapshot } from './learning-insights';
import { runAbsenceSweep } from './churn-graph';
import { marketingRouter } from './marketing-studio';
import { teacherMatchRouter, runTeacherGraphSync } from './teacher-match';
import { warmupGraphRouter, runWarmupGraphSync, getWeakSentences } from './warmup-graph';
import { warmupAgeLine, normalizeWarmupAge } from './warmup-audience';    // 🧑‍🎓 웜업 연령대(소재·말투 축)
import { logWarmupSessionStart, markWarmupFirstReply, warmupShouldMarkFirstReply } from './warmup-log';  // 📊 웜업 «몇 단계로 쓰는가» 기록
import { warmupAnswerChips } from './warmup-answers';                    // 💬 웜업 «이렇게 대답해 보세요» 보기 칩
import { WARMUP_CORRECTION_RULE, parseWarmupOutput, verifyWarmupFix, decideWarmupFixShow, warmupShouldOfferRepeat } from './warmup-correction';  // ✏️ 웜업 «교정 카드» 정본
import { replyRejectReason } from './reply-sanity';                    // 🧯 무너진 AI 출력 차단(학생에게 안 내보낸다)
// «영어만» 게이트 — review_quizzes 는 영어 전용 표가 아니다(중국어 교재 「다락원」이 함께 들어 있다).
// 라틴 글자 유무로 판정하면 병음이 그대로 통과한다. 정본은 english-only.ts 한 곳뿐.
import { isEnglishText, isEnglishQuestion } from './english-only';
import { decisionGraphRouter, runDecisionGraphSync } from './decision-graph';  // 🧠 판단 경로 그래프(3단계)
import { runGrowthSnapshot } from './api-judgment';                            // 📈 판단력 성장 스냅샷(3단계)
import { churnContagionRouter, runContagionGraphSync } from './churn-contagion';
import { nightlyCafe24Refresh } from './cafe24-sync';  // 🔄 카페24→D1 야간 자동 새로고침
import { handleSpaceMonsterApi } from './api-space-monster';  // 🛸 Space Monster Hunter 게임 API

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
    // 🖼️ 클릭재킹 방어 — 우리 소유 도메인끼리는 iframe 임베드 허용(화상수업 '동영상 탭'에서
    //   test.mangoi.co.kr 같은 우리 교재/사이트를 화면 안에 띄우기 위함).
    //   X-Frame-Options 는 여러 도메인 화이트리스트를 못하고(SAMEORIGIN 이 교차도메인을 강제 차단),
    //   크롬은 ALLOW-FROM 도 무시하므로 → CSP frame-ancestors 로 대체한다.
    //   허용 대상: 같은 origin + mangoi.co.kr / mangoi.com / *.navy111p.workers.dev(우리 계정 전용).
    //   그 외 외부 사이트가 우리 페이지를 프레임에 끼우는 것은 여전히 차단된다.
    if (!h.has('Content-Security-Policy')) {
      h.set('Content-Security-Policy',
        "frame-ancestors 'self' https://mangoi.co.kr https://*.mangoi.co.kr https://mangoi.com https://*.mangoi.com https://*.navy111p.workers.dev");
    }
    // X-Frame-Options 가 남아있으면 SAMEORIGIN 이 CSP 화이트리스트보다 우선해 교차도메인 임베드를
    //   막아버리므로, 위 CSP 로 일원화하기 위해 제거한다.
    h.delete('X-Frame-Options');
    if (!h.has('Referrer-Policy')) h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!h.has('Strict-Transport-Security')) h.set('Strict-Transport-Security', 'max-age=15552000');
    if (!h.has('X-Permitted-Cross-Domain-Policies')) h.set('X-Permitted-Cross-Domain-Policies', 'none');
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
  } catch {
    return resp; // 어떤 이유로든 재구성 실패 시 원본 응답 유지(가용성 우선)
  }
}

// 🏷️ HTML 전용 ETag — Cloudflare Assets 는 .js/.css 에는 ETag 를 주지만 HTML 에는 주지 않는다.
//   그래서 index.html(약 430KB 압축)이 수업 시작마다 통째로 다시 내려가고 있었다.
//   deploy.ps1 이 배포마다 모든 HTML 에 BUILD 스탬프를 새로 찍으므로, BUILD_STAMP 는
//   'HTML 이 바뀌었는가'와 정확히 일치하는 검증자다 → 안전하게 304 를 줄 수 있다.
//   반환값이 있으면 그대로 응답(304), null 이면 호출부가 정상 200 을 이어서 만든다.
function htmlEtag304(request: Request, path: string, env: Env, headers: Headers): Response | null {
  if (!path.endsWith('.html')) return null;
  const stamp = env.BUILD_STAMP;
  if (!stamp) return null;
  // ⚠️ 기존의 `headers.has('ETag')` 조기반환 제거(26-07-22) — Assets 가 워커 안에서는
  //   HTML 에도 ETag 를 실어 주는데 CF 가 밖으로 나갈 때 떼는 경우, 이 가드에 걸려
  //   우리 검증자(ETag+Last-Modified)를 한 번도 못 싣고 있었다. 항상 덮어쓴다.
  const tag = `W/"b-${stamp}"`;
  headers.set('ETag', tag);
  // 🆕 Last-Modified 폴백(26-07-22) — 실측 결과 CF 가 text/html 응답의 ETag 를 떼어
  //   브라우저에 안 닿는다(= If-None-Match 가 영영 안 옴 = 1.3MB HTML 매번 전체 다운로드).
  //   같은 검증자(빌드 스탬프 시각)를 Last-Modified 로도 실어 보내고, 브라우저가
  //   If-Modified-Since 를 보내오면 스탬프와 비교해 304(본문 0바이트)로 응답한다.
  //   Last-Modified 가 마저 잘려도 동작은 기존과 동일(무해).
  let lastMod = '';
  if (/^\d{14}$/.test(stamp)) {
    // BUILD_STAMP = KST(yyyymmddHHMMSS) → UTC 로 변환해 HTTP 날짜 생성
    const t = Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8),
                       +stamp.slice(8, 10), +stamp.slice(10, 12), +stamp.slice(12, 14)) - 9 * 3600 * 1000;
    lastMod = new Date(t).toUTCString();
  } else {
    // 실제 wrangler.toml 의 BUILD_STAMP 는 ISO("2026-07-22T00:59:14Z") — Date.parse 로 처리
    const t = Date.parse(stamp);
    if (!isNaN(t)) lastMod = new Date(t).toUTCString();
  }
  if (lastMod) headers.set('Last-Modified', lastMod);
  // If-None-Match 는 콤마 목록일 수 있고 약한 검증자 접두사(W/)가 붙을 수 있다.
  const inm = request.headers.get('If-None-Match') || '';
  const matched = inm.split(',').some((t) => t.trim().replace(/^W\//, '') === `"b-${stamp}"`);
  if (matched) return new Response(null, { status: 304, headers });
  // HTTP 스펙: If-None-Match 가 있으면 If-Modified-Since 는 무시해야 한다 → !inm 가드
  const ims = request.headers.get('If-Modified-Since') || '';
  if (lastMod && ims && !inm) {
    const imsT = Date.parse(ims), lmT = Date.parse(lastMod);
    if (!isNaN(imsT) && !isNaN(lmT) && lmT <= imsT) return new Response(null, { status: 304, headers });
  }
  return null;
}

const worker = {
  // 얇은 래퍼: 실제 처리는 handle()이 하고, 여기서 보안 헤더만 씌운다.
  //   this 바인딩에 의존하지 않도록 worker.handle 로 명시 참조(진입점 안정성).
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // ⚡ (2026-08-09) 같은 DDL 을 이 격리에서 한 번만 D1 으로 보낸다.
    //   이 저장소는 표를 요청 처리 도중 만든다(CREATE TABLE IF NOT EXISTS 가 핸들러 첫 줄마다).
    //   실측: DDL 411건 중 392건이 «요청마다» 나갈 수 있었다. 표가 이미 있어도 왕복은 그대로다.
    //   호출부 392곳을 손대는 건 그 자체가 사고 위험이라 DB 층에서 막는다 — exec 만 감싼다
    //   (DDL 300건이 exec 으로 나가고, exec 의 반환값을 쓰는 곳이 한 군데도 없다).
    env = { ...env, DB: wrapDbDdlOnce(env.DB) } as Env;
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

    /* 🔗 정본 호스트로 모은다 — www.mangoi.ai → mangoi.ai (2026-08-17)
     *
     * [왜]
     *   www 를 추가로 붙이면서 «같은 사이트» 가 브라우저에겐 **두 사이트**가 됐다.
     *   오리진이 갈리면 아래가 전부 따로 논다:
     *     · 교사·본사·지사 세션 쿠키 — Domain= 이 없는 호스트 전용 쿠키(auth-admin.ts)
     *     · 학생·학부모 로그인 — localStorage 의 mangoi_logged_user·mango_token
     *     · 언어 설정 mangoi_lang, 패스키 rpId, 뒤로가기의 «같은 사이트» 판정
     *   쿠키는 Domain 을 넓히면 되지만 **localStorage 는 오리진별로 갈리는 게 웹 표준이라
     *   공유할 방법이 아예 없다.** 그래서 «주소를 하나로 모으는» 것이 유일한 완전 해결책이다.
     *   이걸 안 하면 CLAUDE.md 의 「로그인했는데 또 로그인하래요」가 그대로 재현된다.
     *
     * [주의]
     *   ⛔ test.mangoi.co.kr 은 절대 건드리지 않는다 — 앱 시작 URL·스모크 테스트·워치독이
     *      그 주소를 붙박이로 쓴다. workers.dev·localhost 도 그대로 둔다(개발·진단용).
     *   ⛔ WebSocket 업그레이드는 리다이렉트하지 않는다 — 화상수업이 끊긴다.
     *   · OPTIONS(프리플라이트)는 위에서 이미 답했으므로 여기까지 오지 않는다.
     *   · GET/HEAD 는 301, 나머지는 308 을 쓴다. POST 를 301 로 보내면 클라이언트가
     *     GET 으로 바꾸면서 **본문을 버린다**(308 은 메서드와 본문을 지킨다).
     */
    if (url.hostname === 'www.mangoi.ai'
        && (request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      const canonical = new URL(url.toString());
      canonical.hostname = 'mangoi.ai';
      const permanent = request.method === 'GET' || request.method === 'HEAD';
      return Response.redirect(canonical.toString(), permanent ? 301 : 308);
    }

    // 💬 문의·신규상담 페이지 폐지 → 카카오톡 실시간 상담으로 통합 (2026-08-14 피드백 ⑤)
    //   public/contact.html 을 지웠다. 그런데 이 주소는 검색엔진에 색인돼 있고, 카톡·문자로
    //   돌던 옛 링크도 살아 있다. 그냥 지우면 그 사람들이 404 를 본다 — 상담하러 온 사람이다.
    //   그래서 워커가 여기서 카카오 채널로 넘긴다. 301(영구)이라 색인도 함께 정리된다.
    //   ⚠️ `/chat` 을 붙이지 말 것 — pf.kakao.com/<id>/chat 은 비로그인 PC 를 카카오 로그인
    //      화면으로 튕긴다. 채널 «홈» 은 로그인 없이 열리고 그 안에 채팅·챗봇·전화가 다 있다.
    //   ⚠️ 관리자 「💌 신규상담 관리」와 /api/student/inquiry 는 그대로다 — 이미 들어와 있는
    //      문의를 계속 봐야 한다. 없앤 것은 «새로 접수받는 창구» 뿐이다.
    if (path === '/contact.html' || path === '/contact' || path === '/inquiry' || path === '/inquiry.html') {
      return new Response(null, {
        status: 301,
        headers: {
          Location: 'https://pf.kakao.com/_xlqnSxd',
          'Cache-Control': 'public, max-age=3600'
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
        },
        // 😊 WebView 앱(kr.co.mangoi.app) 패스키(WebAuthn) — get_login_creds 가 있어야
        //   Android Credential Manager 가 이 도메인 패스키를 앱에서 쓰도록 허용한다.
        //   지문 = mobile-app/keystore/mango.jks 서명 인증서 SHA-256.
        {
          relation: [
            'delegate_permission/common.handle_all_urls',
            'delegate_permission/common.get_login_creds'
          ],
          target: {
            namespace: 'android_app',
            package_name: 'kr.co.mangoi.app',
            sha256_cert_fingerprints: [
              'D5:02:29:A3:5B:E1:1A:65:74:3C:06:B3:3E:1A:C9:0C:18:BF:C0:70:96:2E:46:FD:1F:6B:9A:A1:F1:3E:EC:30'
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
        //   ⚠️ (2026-08-02) 여기에 `/teacher` 를 빠뜨려서, 로그아웃 상태의 강사가 /teacher 를
        //      열면 로그인 화면 대신 `{"ok":false,"error":"auth_required"}` 라는 **JSON 원문**이
        //      화면에 그대로 떴다(라이브에서 확인). isAdminPath 에만 등록하면 인증은 걸리지만
        //      이 목록에 없으면 'API 취급'이 되어 401 로 떨어진다. 새 화면 경로를 추가할 때는
        //      **두 곳 모두**(isAdminPath + 아래 리다이렉트 목록) 등록할 것.
        if (path === '/admin' || path === '/admin/' || path === '/admin.html'
            || path.startsWith('/admin/')
            || path === '/teacher' || path === '/teacher/' || path === '/teacher.html'
            || path === '/manager' || path === '/manager/' || path === '/manager.html'
            || path === '/work' || path === '/work/' || path === '/work.html'
            || path === '/sales' || path === '/sales/' || path === '/sales.html') {
          const next = encodeURIComponent(path + url.search);
          return Response.redirect(new URL(`/admin/login?next=${next}`, request.url).toString(), 302);
        }
        // API → 401 JSON
        return new Response(
          JSON.stringify({ ok: false, error: 'auth_required' }),
          { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
        );
      }

      // 🇵🇭 역할 분기 라우터 (2026-08-02) — 강사는 초경량 /teacher, 그 외는 기존 관리자 화면.
      //   여기서(=서버에서) 판정하는 이유: 프론트에서만 나누면 URL 을 직접 치는 것으로 뚫린다.
      //   판정 근거는 getAdminActor() 의 권위 역할(scope_type='teacher' · hq_t_* · 이름) 하나뿐.
      if (sess.ok) {
        const _tp = await teacherPortalRedirect(request, url, path, env);
        if (_tp) return _tp;
      }

      // 🏫 지사·대리점 분기 (2026-08-08) — 강사에게 해 준 것과 같은 일.
      //   반드시 아래 «대리점 제한 뷰» 블록보다 **먼저** 온다: 그 블록은 admin.html 을
      //   허용 페이지로 보고 통과시키므로, 여기서 먼저 경량 화면으로 보내야 한다.
      if (sess.ok) {
        const _mp = await managerPortalRedirect(request, url, path, env);
        if (_mp) return _mp;
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

        // 🔐 강사(teacher) 제한 — 회사 전체 재무·경영 API 전면 차단 (2026-07-12)
        //   회계 보고서·경영 요약·실시간 지표·정산은 전 강사 급여 총액과 개별 명세를 담고 있어
        //   강사가 URL 로 직접 호출하면 남의 급여가 노출된다 → 이 네임스페이스는 강사 전면 차단.
        //   ⚠️ 스코프로 거르지 않는다: 일부 강사 계정은 scope_type='hq'로 잘못 세팅돼 있어(auth-admin
        //      resolveRole 주석 참고) 스코프 기준이면 새어나간다. 항상 role 기준(getAdminActor)으로 판정.
        //   (개별 급여·평가 API 의 '본인만' 필터는 각 핸들러에 이중으로 적용됨)
        //   🔐 (2026-07-22 확장) 기존엔 위 6개 네임스페이스만 막았고 나머지 /api/admin/* 는
        //      전부 열려 있었다. 관리자 콘솔의 권한 매트릭스(adm-core.js PERM_FEATURES)는
        //      교사에게 '차단(❌)'으로 표시되는 기능이 30개인데, 그 표는 화면에 표를 그릴 뿐
        //      아무것도 막지 않아 교사가 URL 로 직접 호출하면 그대로 응답이 나왔다.
        //      → 그 30개 기능이 쓰는 네임스페이스를 여기서 실제로 차단한다.
        //      ⚠️ 이건 '차단 목록'이라 새 API 를 추가하면 기본이 '교사 허용'이다.
        //         교사가 볼 수 없어야 할 API 를 새로 만들면 이 목록에 반드시 추가할 것.
        //         (근본 해결 = 허용 목록 방식 default-deny. 별도 작업으로 예정)
        {
          const TEACHER_BLOCKED_PREFIXES = [
            // ── 회사 전체 재무·경영 (2026-07-12 최초) ──
            '/api/admin/reports/', '/api/admin/exec/', '/api/admin/realtime/',
            '/api/admin/settlement/', '/api/admin/capitown/', '/api/admin/accounting',
            // ── 결제·정산·구독 (student_payments · refunds · recurring_billing · auto_dunning) ──
            '/api/admin/payments', '/api/admin/duplicate-payments',
            '/api/admin/subscription', '/api/admin/subscriptions', '/api/admin/dunning',
            // ── 조직·가맹점 관리 (franchise_mgmt) ──
            '/api/admin/franchises', '/api/admin/org', '/api/admin/centers',
            // ── 강사 연락처 (2026-08-07) — 동료의 전화·이메일·카톡ID 가 한 화면에 모인다.
            //    수업 배정과 달리 «남의 개인 연락처» 라 교사에게는 열지 않는다. 본사/매니저만.
            '/api/admin/teacher-contacts',
            // ── 💬 강사 카카오ID 명부 + 단체 전달 (2026-08-13) — 동료 전원의 카톡ID·전화번호가
            //    한 화면에 모이고, 여기서 전체에게 문자·카톡을 뿌릴 수 있다. 본사/매니저만.
            //    (핸들러 첫머리에서도 한 번 더 막지만, URL 직접 호출까지 여기서 끊는다)
            '/api/admin/teachers/kakao',
            // ── 🚗 영업담당자 인사평가·보상 (2026-08-18) — 남의 급여·성과급·평가 등급이 담긴다.
            //    거래처 학원장 연락처도 함께 들어 있어 강사에게는 열지 않는다.
            '/api/admin/sales/',
            // ── 💳 법인카드 사용내역 (2026-08-13) — 회사 지출 내역. 본사/매니저만.
            '/api/admin/corpcard/',
            // ── 🏦 신한은행 계좌 입출금 (2026-08-14) — 회사 계좌 원장. 본사/매니저만.
            '/api/admin/bankacct/',
            // ── 🙈 교재 라이브러리 숨김 (2026-08-13) — 한 강사가 체크하면 **전 강사의 교재가 사라진다.**
            //    반경이 회사 전체라 강사에게는 열지 않는다(읽기 목록도 같은 경로라 함께 막힌다).
            '/api/admin/textbook-hidden-books',
            // ── 계정·권한·감사 (permissions · audit_log) ──
            '/api/admin/permissions', '/api/admin/audit-logs', '/api/admin/login-history',
            '/api/admin/staff', '/api/admin/sessions', '/api/admin/2fa',
            // ── 마케팅·대량발송 (marketing_studio · kakao_blast · nps_survey · 웹푸시 · 팝업 · 포스터) ──
            '/api/admin/marketing', '/api/admin/kakao', '/api/admin/nps',
            '/api/admin/push', '/api/admin/popups', '/api/admin/posters',
            // ── 운영 감시·데이터 반출 (card-admin-ghost · card-admin-alerts · card-data-export) ──
            '/api/admin/ghost', '/api/admin/alerts', '/api/admin/export',
            // ── 🔴 지금 수업 현황 (2026-08-20) — 전사 학생 이름·강사 배정이 한 화면에 모인다.
            //    강사는 자기 수업만 보면 되고 그것은 teacher.html 이 이미 준다. 핸들러도 403 을
            //    내지만(이중 방어), URL 직접 호출은 여기서 끊는다.
            '/api/admin/classes-now',
            // ── 📶 화상 회선품질·강제 릴레이 (2026-08-27, 관문 등록과 동시) — quality 는
            //    전사 강사·학생 이름+회선 지표 200행이 한 응답에 담긴다(classes-now 와 같은 사유).
            //    relay 는 핸들러가 강사를 403 으로 막지만 URL 직접 호출은 여기서 끊는다.
            '/api/admin/vc/',
            // ── 📅 (2026-08-25) 오늘 전체 수업 목록 — 위와 같은 사유(전사 학생 이름·강사 배정).
            //    카페24 예약까지 합쳐 주게 되면서 한 화면에 모이는 양이 더 늘었다.
            //    핸들러도 403 을 내지만(이중 방어), URL 직접 호출은 여기서 끊는다.
            '/api/admin/classes/today',
            // ── 🌅 아침 브리핑 (2026-08-08) — 전사 매출·미납 학생 수·2주+ 결석·출석률 요약이 한 문장에 담긴다.
            //    지금까지 이 목록에도, 화면 권한 매트릭스(adm-q10.js PERMS)에도 없어서 강사에게 그대로 열려 있었다.
            //    (PERMS 는 «목록에 있는 카드만» 가리는 방식이라, 등록 안 된 카드는 아무에게도 안 가려진다)
            '/api/admin/briefing',
            // ── 📊 운영 KPI 대시보드 — 매출·미납·상담이 한 번에 나온다. 카드는 이미 교사 차단이지만
            //    화면만 가리는 것이라 URL 로 직접 부르면 그대로 응답했다. 서버에서도 막는다.
            '/api/admin/kpi/',
            // ── 가족·리퍼럴 (card-family-mgmt · card-referral) ──
            '/api/admin/family', '/api/admin/families', '/api/admin/referrals',
            // ── 결재(기안·지출) — 회사 지출 내역. 핸들러도 막지만 여기에도 이중으로 둔다 ──
            //    ⚠️ 아래 _TEACHER_APPROVAL_OK 로 «긴급·고객불만» 경로만 예외로 연다.
            '/api/approval',
          ];
          /* 🧾 (2026-08-16) 강사에게 열어 주는 결재 경로 — 여기 적힌 것만 통과한다.
           *   왜 여는가: 사고·학부모 항의는 **현장의 강사가 가장 먼저 안다.** 그걸 매니저에게
           *   따로 연락해서 대신 올리게 하면 그 시간만큼 늦는다.
           *   ⚠️ 여는 것은 «올리기»와 «내 결재함»뿐이다. 분류 제한(긴급·고객불만만)과
           *      열람 제한은 approval-policy 의 canSubmit()·canView() 가 판정한다 —
           *      즉 강사가 /home 을 불러도 남의 지출 결재는 응답에 담기지 않는다.
           *   ⛔ 결재(decide)·위임(delegate)·목록(requests GET)은 여전히 막힌다. */
          const _TEACHER_APPROVAL_OK = (p: string, m: string): boolean => {
            if (p === '/api/approval/home' && m === 'GET') return true;
            if (p === '/api/approval/requests' && m === 'POST') return true;   // 올리기(분류는 핸들러가 제한)
            if (p === '/api/approval/voice' && m === 'POST') return true;      // 말로 올리기
            if (/^\/api\/approval\/requests\/\d+\/file$/.test(p) && m === 'GET') return true;  // 본인 첨부(핸들러가 재확인)
            return false;
          };
          const _teacherBlocked = TEACHER_BLOCKED_PREFIXES.some(p => path.startsWith(p))
                               && !_TEACHER_APPROVAL_OK(path, request.method);
          if (_teacherBlocked) {
            const _actor = await getAdminActor(request, env as any);
            if (_actor.isTeacher) {
              return new Response(JSON.stringify({
                ok: false, error: 'forbidden_teacher',
                message: '강사 권한으로는 볼 수 없는 정보입니다.',
                message_en: 'This information is not available with a teacher account.'
              }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
            }
          }
        }
      }
    }

    // Health check endpoint
    if (path === '/api/health') {
      return handleHealth();
    }

    // 🎬 인트로 영상 — R2에서 Range(206) 지원 스트리밍 (2026-07-22)
    //   왜 R2? Workers Assets(env.ASSETS)는 이 mp4에 HTTP Range 요청을 무시하고
    //   200 + 전체 파일을 내려준다. 모바일(특히 iOS 사파리)은 <video> 재생을 206
    //   구간 요청으로 시작하려 하는데, 200만 받으면 첫 프레임 전에 큰 덩어리를
    //   통째로 버퍼링해야 해 '재생 시작 시 렉'이 생긴다. R2 프록시는 206을 지원.
    //   키: media/intro-v2.mp4 (재인코딩 4.1MB, faststart). 없으면 정적자산 폴백.
    if (path === '/media/intro.mp4' && request.method === 'GET') {
      try {
        const range = request.headers.get('Range');
        const opts: R2GetOptions = {};
        let start = 0, end: number | undefined;
        if (range) {
          const m = /bytes=(\d+)-(\d*)/.exec(range);
          if (m) {
            start = parseInt(m[1], 10);
            end = m[2] ? parseInt(m[2], 10) : undefined;
            opts.range = end !== undefined ? { offset: start, length: end - start + 1 } : { offset: start };
          }
        }
        const obj = await env.RECORDINGS.get('media/intro-v2.mp4', opts);
        if (obj) {
          const h = new Headers();
          h.set('Content-Type', 'video/mp4');
          h.set('Accept-Ranges', 'bytes');
          h.set('Cache-Control', 'public, max-age=604800, immutable');
          if ((obj as any).range && (obj as any).range.length !== undefined) {
            const off = (obj as any).range.offset || 0;
            const len = (obj as any).range.length;
            h.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
            h.set('Content-Length', String(len));
            return new Response(obj.body, { status: 206, headers: h });
          }
          h.set('Content-Length', String(obj.size));
          return new Response(obj.body, { status: 200, headers: h });
        }
      } catch (e) { /* R2 미존재/오류 → 아래 정적자산 폴백 */ }
      // 폴백: 기존 정적 파일
      const fb = new Request(new URL('/intro.mp4', request.url).toString(), request);
      return env.ASSETS.fetch(fb);
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
    //   - POST /api/warmup/questions {session_id?, user_id?, textbook?, level?, topic?, difficulty?, pick?}
    //     → 레벨·교재·주제 기반 추가 질문(Follow-up Questions) 3개 동적 생성 (반복 방지)
    if (path === '/api/warmup/questions' && request.method === 'POST') {
      return handleWarmupQuestions(request, env);
    }
    // 🎮 학생게임 맞춤 출제 — GET /api/games/vocab?user_id=  → 학생 배정 교재/레벨의 문장+단어(en/ko)
    if (path === '/api/games/vocab' && request.method === 'GET') {
      return handleGamesVocab(request, env);
    }
    // 🀄 중국어 게임 어휘 — GET /api/games/zh-vocab?textbook=&level=&lesson=  → 다락원 교재 추출 한자+병음+뜻(zh_vocab)
    if (path === '/api/games/zh-vocab' && request.method === 'GET') {
      return handleGamesZhVocab(request, env);
    }
    // 📖 중국어 독해 문단 — GET /api/games/zh-passage?textbook=&level=&lesson=  → 다락원 读&说 문단+이해질문(zh_passage)
    if (path === '/api/games/zh-passage' && request.method === 'GET') {
      return handleGamesZhPassage(request, env);
    }
    // 📚 진도(레슨) 순차 — GET /api/games/lessons?glang=&textbook=&level=&user_id=  → 교재의 레슨별 문장(예습/복습 네비게이션)
    if (path === '/api/games/lessons' && request.method === 'GET') {
      return handleGamesLessons(request, env);
    }
    // 🔤 영어 게임 어휘 은행 — GET /api/games/en-vocab  → 난이도별 영어 문장+단어(en_vocab, 폴백 강화)
    if (path === '/api/games/en-vocab' && request.method === 'GET') {
      return handleGamesEnVocab(request, env);
    }
    // 📖 단어 뜻 — GET /api/games/define?word=&lang=en|zh&sent=  → 단어 브릭 클릭 시 한국어 뜻(+병음). D1 캐시+어휘은행+AI 폴백
    if (path === '/api/games/define' && request.method === 'GET') {
      return handleGamesDefine(request, env);
    }
    // 🧠 게임 학습기록 — POST /api/games/progress {user_id,lang,events:[{item,ko,correct}]} → 오답/정답 누적(game_progress)
    if (path === '/api/games/progress' && request.method === 'POST') {
      return handleGamesProgress(request, env);
    }
    // 📊 UX 사용률 — POST /api/games/ux-track {user_id?, events:[{k,n?}]} → 메뉴·버튼 클릭 집계(ux_events)
    if (path === '/api/games/ux-track' && request.method === 'POST') {
      return handleUxTrack(request, env);
    }
    // 🧠 약점 단어 — GET /api/games/weak?user_id=&lang=&limit=  → 자주 틀린 단어(교사 대시보드·맞춤 복습용)
    if (path === '/api/games/weak' && request.method === 'GET') {
      return handleGamesWeak(request, env);
    }
    // 🎤 발음 점수 — POST /api/games/shadow {user_id,lang,item,ko,score} → 따라말하기 발음 점수 누적(game_progress)
    if (path === '/api/games/shadow' && request.method === 'POST') {
      return handleGamesShadow(request, env);
    }
    // 🎯 맞춤 추천 — GET /api/games/recommend?user_id=&lang= → 정오답·발음 진단 + 다음 연습 추천(룰 기반, KV 10분 캐시)
    if (path === '/api/games/recommend' && request.method === 'GET') {
      return handleGamesRecommend(request, env);
    }
    // 🪙 코인 적립 — POST /api/games/coins {user_id,nickname,add} → 주간/누적 코인(game_stats), 주간 리더보드용
    if (path === '/api/games/coins' && request.method === 'POST') {
      return handleGamesCoins(request, env);
    }
    // 🏆 주간 랭킹 — GET /api/games/leaderboard?limit=  → 이번 주 코인 상위 학생(닉네임)
    if (path === '/api/games/leaderboard' && request.method === 'GET') {
      return handleGamesLeaderboard(request, env);
    }
    // 🎮 판(session) 기록 — POST /api/games/session → 게임이 끝날 때 딱 1행(game_sessions)
    //   여기가 «게임별 분석» 을 가능하게 하는 유일한 통로다. game_progress 에는 게임 이름 칸이
    //   없어서 8종이 한 표에 섞여 있었다(2026-08-08 실측). 학생 공개 경로 — sendBeacon 으로 온다.
    if (path === '/api/games/session' && request.method === 'POST') {
      const { handleGameSession } = await import('./game-insights');
      return handleGameSession(request, env);
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
      /* 🔑 여기 이름은 **코드가 실제로 읽는 env 이름과 글자 그대로 같아야 한다.**
         2026-08-18 실측: 10개 중 5개(KAKAO_API_KEY·KAKAO_TEMPLATE_ID·SOLAPI_SENDER·
         GIFTISHOW_AUTH_CODE·GIFTISHOW_AUTH_TOKEN)가 이 줄에만 있고 코드 어디서도 안 쓰는
         «유령 이름» 이었다. 그래서 등록을 제대로 해 둬도 영원히 false 로 나왔다 —
         웹푸시가 안 되는 원인을 찾다가 SOLAPI_SENDER: false 를 보고 「문자 발송도 죽었구나」로
         읽을 뻔했다. 실제로는 그런 변수가 없었을 뿐이고, 진짜 발신번호(SOLAPI_FROM_PHONE)는
         이 목록이 아예 묻지도 않고 있었다.
         ⚠️ 점검 도구가 거짓을 말하면 없는 문제를 쫓게 된다. 코드 버그보다 비싸다.
         ℹ️ 이 값(secrets_present)을 그리는 화면은 없다 — /api/admin/health-check 의 JSON 을
            직접 열어서 본다(admin/health.html 은 이 필드를 렌더링하지 않는다).
         감시: test-harness/secret_names_harness.mjs 가 «코드가 안 쓰는 이름» 을 FAIL 낸다. */
      const secretKeys = [
        'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT',   // 🔔 웹푸시
        'SOLAPI_API_KEY', 'SOLAPI_API_SECRET',                       // 💬 문자·알림톡
        'SOLAPI_FROM_PHONE',                                         //    발신번호 (구 SOLAPI_SENDER — 그런 이름은 없었다)
        'SOLAPI_PFID',                                               //    카카오 채널 ID
        'KAKAO_CLIENT_ID', 'KAKAO_CLIENT_SECRET',                    // 🔑 카카오 소셜로그인
        'GIFTISHOW_API_KEY', 'GIFTISHOW_USER_ID',                    // 🎁 기프티콘
      ];
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
      return await handlePdfDownload(path, env, request);
    }

    // 📎 모든 파일 공유 업로드 (Word/Excel/PPT/ZIP 등) — 수업 중 파일 첨부. R2 files/ 에 저장.
    if (path === '/api/video-call/upload-file' && request.method === 'POST') {
      return await handleFileShareUpload(request, env);
    }
    // 📎 공유 파일 다운로드 (첨부 형태로 내려줌)
    if (path.startsWith('/api/video-call/file/') && request.method === 'GET') {
      return await handleFileShareDownload(path, env);
    }

    /* 보관기간 자동 파기: 수동 실행/상태 조회
       ⛔ 2026-09-02 부터 이 경로는 R2 영상 파일을 «실제로» 지운다 — 되돌릴 수 없다.
          그전에는 D1 에 표시만 해서 되돌릴 수 있었기에 게이트가 «로그인했는가» 뿐이었는데,
          그 상태로 실삭제를 켜면 **강사·지사·대리점 계정이 전체 녹화를 파기**할 수 있다.
          스코프 차단(forbidden_scope)과 TEACHER_BLOCKED_PREFIXES 는 `/api/admin/` 접두사에만
          걸려서 이 경로에는 오지 않는다(2장 「관리자 API 를 만들었는데 지사·대리점이 그대로 씁니다」).
       ⛔ canEditOrg() 로 막지 말 것 — 그 함수는 'none'(내부직원·**교사**)에 true 라 강사를 못 막는다.
          두 가드를 «따로» 둔다: 강사(isTeacher) · 조직 계정(isOrgScopedRole).
       ✅ `?dry_run=1` 이면 아무것도 지우지 않고 건수만 센다. 켜기 전 확인용이며
          `retention.ts` 주석이 요구하는 «dryRun 선행» 을 실제로 부를 수 있는 유일한 통로다. */
    if (path === '/api/retention/run' && request.method === 'POST') {
      const _retActor = await getAdminActor(request, env as any);
      if (!_retActor.ok || _retActor.isTeacher || isOrgScopedRole(_retActor.role)) {
        return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
          status: 403, headers: { 'Content-Type': 'application/json' }
        });
      }
      const result = await purgeExpired(env, { dryRun: url.searchParams.get('dry_run') === '1' });
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

    // 📡 fix (2026-07-13) — 수업 참가자용 공유 미디어 상태 폴링 (공개, PII 없음).
    //   /api/room-status/* 가 보안 스윕(7-12)에서 관리자 전용으로 잠기면서 학생의
    //   교재/동영상 폴링 폴백이 전부 401 → WS 신호를 놓친 학생은 재연결 때까지
    //   동영상·교재를 못 받았음("동영상이 시간이 지나야 보임"의 원인).
    //   이 엔드포인트는 pdfState/videoState 만 노출(참가자 명단·이름 등 PII 제외).
    if (path.startsWith('/api/room-media/') && request.method === 'GET') {
      const roomId = path.replace('/api/room-media/', '');
      return await handleRoomMedia(roomId, env);
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

    /* 📊 저장소 상태 — 화면 KPI 타일용 «진짜» 숫자 (2026-08-26 신설)
       예전 타일 4개(12.4GB · 156파일 · 248MB · ₩4,820)는 HTML 에 박아 둔 **예시 숫자**였고,
       옆의 「🔄 새로고침」이 부르는 window.refreshStorageStats 는 저장소 어디에도 없었다.
       ⚠️ KV 호출수·월 청구액은 Worker 안에서 알 수 없다(Cloudflare 계정 API 영역).
          그래서 그 두 칸은 «지어내지 않고» 뺐고, 대신 이 화면에서 실제로 궁금한 값
          — 저장 실패 건수와 곧 만료될 건수 — 를 준다. */
    if (path === '/api/recordings/storage-stats' && request.method === 'GET') {
      try {
        const out: any = { ok: true, r2: null, d1: null };
        if (env.RECORDINGS) {
          /* ⚠️ 버킷 전체를 세면 «녹화 파일» 이 아닌 것까지 들어간다 — 2026-08-26 실측에서
             이 타일이 17.8GB · 15,084 파일로 떴는데 그 대부분이 화상수업 교재(`pdfs/`)였다.
             제목이 「R2 저장소 (녹화 파일)」인데 교재를 세면 그것도 거짓말이다.
             → REC_LIST_PREFIXES 만 센다(위 주석 참고). 덤으로 훨씬 싸고 잘리지도 않는다. */
          let files = 0, bytes = 0, snaps = 0, truncated = false;
          for (const prefix of REC_LIST_PREFIXES) {
            let cursor: string | undefined = undefined;
            for (let page = 0; page < REC_LIST_MAX_PAGES; page++) {
              const listed: any = await env.RECORDINGS.list({ prefix, limit: 1000, cursor });
              for (const o of (listed.objects || [])) {
                if (String(o.key).endsWith('.snap')) { snaps++; continue; }   // 안전망 사본은 «파일» 로 안 센다
                files++; bytes += (o.size || 0);
              }
              cursor = listed.truncated ? (listed.cursor as string) : undefined;
              if (!cursor) break;
              if (page === REC_LIST_MAX_PAGES - 1) truncated = true;
            }
          }
          out.r2 = { files, bytes, snapshots: snaps, truncated };
        }
        try {
          const now = Date.now();
          const r = await env.DB.prepare(
            `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'completed'     THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN status = 'upload_failed' THEN 1 ELSE 0 END) AS failed,
                    SUM(CASE WHEN status = 'recording'     THEN 1 ELSE 0 END) AS recording,
                    SUM(CASE WHEN expires_at IS NOT NULL AND expires_at > ? AND expires_at < ? THEN 1 ELSE 0 END) AS expiring
               FROM recordings
              WHERE COALESCE(status, '') != 'deleted'`
          ).bind(now, now + 30 * 24 * 3600 * 1000).first<any>();
          out.d1 = {
            total: Number(r?.total || 0), completed: Number(r?.completed || 0),
            failed: Number(r?.failed || 0), recording: Number(r?.recording || 0),
            expiring30d: Number(r?.expiring || 0),
          };
        } catch (e: any) { out.d1 = { error: String(e?.message || e) }; }
        return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message }), { headers: { 'Content-Type': 'application/json' } });
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
        /* 🔴 2026-08-26: 여기가 'recordings/' **한 접두사만** 보고 있었다.
           그런데 실제 자동녹화는 전부 'rec/' 에 쌓인다(recordings-r2.ts 의 create).
           그래서 파일이 멀쩡히 있어도 이 진단은 늘 「녹화 파일 0개」라고 답했고,
           「저장소가 비었나 보다」로 읽혔다. 두 접두사를 함께 센다. */
        const [recList, legacyList] = await Promise.all([
          env.RECORDINGS.list({ prefix: 'rec/', limit: 1000 }),
          env.RECORDINGS.list({ prefix: 'recordings/', limit: 1000 }),
        ]);
        // `.snap` 은 짧은 녹화 안전망의 «사본» 이라 파일 수에서 뺀다(recordings-r2.ts)
        const recObjs = (recList.objects || []).filter(o => !String(o.key).endsWith('.snap'));
        const legacyObjs = legacyList.objects || [];
        const sample = [...recObjs, ...legacyObjs]
          .sort((x: any, y: any) => new Date(y.uploaded).getTime() - new Date(x.uploaded).getTime())
          .slice(0, 5)
          .map(o => ({ key: o.key, size: o.size, uploaded: o.uploaded }));
        return new Response(JSON.stringify({
          ok: true, bucket: 'connected', testWrite: !!text, testContent: text,
          rec:    { prefix: 'rec/',        count: recObjs.length,    truncated: !!recList.truncated },
          legacy: { prefix: 'recordings/', count: legacyObjs.length, truncated: !!legacyList.truncated },
          // 옛 화면(캐시된 admin.html)이 이 이름으로 읽으므로 남겨 둔다 — 이제 두 접두사를 합친 표본이다
          recordingFiles: sample
        }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: e?.message }), { headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── 자동녹화 R2 multipart upload + stream (auto-recording-patch) ──
    // 기존 /api/recordings/blob 보다 먼저 매칭해야 함
    if (path.startsWith('/api/recordings/upload') || path.startsWith('/api/recordings/stream')
        || path === '/api/recording/play') {   // 🔐 통합 재생(관리자 세션 OR 본인 mango_token) — recordings-r2.ts
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
        path === '/api/admin/staff-password-reset' ||
        // ➕ 직원 계정 생성 (2026-08-18) — 게이트는 handleAdminAuthApi 안에서 경영진·본사로 한 번 더.
        path === '/api/admin/staff-create' ||
        // 🔑 비밀번호 찾기(셀프 재설정) — 로그인 전에 부르는 API 라 isAuthPublicPath 에도 등록돼 있다.
        path === '/api/admin/password-reset/request' ||
        path === '/api/admin/password-reset/confirm' ||
        // 📇 복구 연락처 채우기(본사가 대신) — 인증 필요. 게이트는 handleAdminAuthApi 안에서 hq·staff 로 한 번 더.
        path === '/api/admin/contacts-missing' ||
        path === '/api/admin/staff-contact' ||
        path === '/api/admin/login-history' ||
        path === '/api/admin/sessions' ||
        path === '/api/admin/sessions/revoke' ||
        path.startsWith('/api/admin/2fa/')) {
      const authRes = await handleAdminAuthApi(request, url, env);
      if (authRes) return authRes;
    }

    // 🇵🇭 강사 포털 집계 API — 첫 화면에 필요한 전부를 한 번에 (필리핀 회선 왕복 최소화)
    if (path === '/api/teacher/portal') {
      const tRes = await handleTeacherApi(request, url, env as any);
      if (tRes) return tRes;
    }

    // 🧾 결재(기안·지출·문서) — 구 그룹웨어에서 유일하게 신규에 없던 기능
    if (path.startsWith('/api/approval/')) {
      const aRes = await handleApprovalApi(request, url, env as any);
      if (aRes) return aRes;
    }

    // ⚡ 정전·인터넷 장애 신고 — 필리핀 강사가 끊겼을 때 사무실이 «가장 먼저» 알게
    if (path.startsWith('/api/outage/')) {
      const oRes = await handleOutageApi(request, url, env as any);
      if (oRes) return oRes;
    }

    // 🚗 영업담당자 실적·인사평가·보상 (2026-08-18)
    //   인증은 위 미들웨어(/api/admin/* DEFAULT-DENY)가 이미 걸었고,
    //   역할 게이트(본사 또는 담당자 본인)는 핸들러 안에서 한 번 더 본다.
    //   ⚠️ 이 등록을 빼면 CF Assets 로 흘러가 POST 가 405 가 된다(게이트 주석 참고).
    if (path.startsWith('/api/admin/sales/')) {
      const sRes = await handleSalesHrApi(request, url, env as any);
      if (sRes) return sRes;
    }

    // 📏 관리자 메뉴 클릭 계측 — 메뉴를 87개에서 줄이려면 «안 눌리는 메뉴» 를 알아야 한다.
    //   지금까지 이 사실이 서버에 한 번도 기록된 적이 없어 우선순위가 전부 인터뷰와 감이었다.
    //   ⚠️ 누가 눌렀는지는 저장하지 않는다(역할만). 직원 감시 도구가 되면 켜 둘 수 없다.
    if (path === '/api/admin/menu-hit' || path === '/api/admin/menu-hit/stats') {
      const mRes = await handleMenuHitApi(request, url, env as any);
      if (mRes) return mRes;
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
        /* 🧹 (2026-08-24) LMS·시드 자리표시 일괄 정리.
           ⚠️ 이 목록은 «허용목록» 이다 — 인증 게이트(isAdminPath)가 `/api/admin/` 을
              통째로 default-deny 하는 것과 **다른 것**이다. 인증은 통과하는데 여기 없으면
              라우팅이 안 돼 핸들러까지 못 가고 «Not Found» 가 된다.
              실제로 그렇게 밟았다: 화면 버튼이 「⚠️ 건수를 확인하지 못했습니다: Not Found」.
           ⚠️ `/api/admin/class-schedules` 는 **정확일치**로만 올라와 있어(위 두 줄),
              하위 경로를 새로 만들면 매번 여기에 한 줄을 더해야 한다. */
        path === '/api/admin/class-schedules/purge-placeholders' ||
        // 🚫 강사 근무불가(휴가·휴식시간) — 강사 피드백(2026-07-24), /api/admin/class-schedules 등록 시 자동 차단에 사용
        path === '/api/admin/teacher-unavailability' ||
        /^\/api\/admin\/teacher-unavailability\/\d+$/.test(path) ||
        path === '/api/admin/schedules' ||
        path === '/api/admin/unassigned-students' ||
        path === '/api/admin/notify-queue' ||
        path === '/api/admin/students/merge-duplicates' ||
        /^\/api\/admin\/class-schedules\/\d+$/.test(path) ||
        path === '/api/admin/teacher-profiles' ||
        path === '/api/admin/teacher-profiles/import' ||
        // 🔗 (2026-07-31) 제보 #2-1 후속 — 이름 자동매칭(payroll teachers ↔ teacher_profiles)
        path === '/api/admin/teacher-profiles/auto-match' ||
        /^\/api\/admin\/teacher-profiles\/\d+$/.test(path) ||
        path === '/api/admin/teachers' ||
        /^\/api\/admin\/teachers\/\d+$/.test(path) ||
        // 🔗 (2026-08-08) 강사 ↔ 로그인 아이디 연결. 근태 계산의 전제라 화면 하나가 통째로 여기 걸린다.
        //   api-mango 게이트는 startsWith('/api/admin/teachers') 라 이미 통과 — 여기만 등록하면 된다.
        path === '/api/admin/teachers/links' ||
        // 💬 (2026-08-13) 강사 카카오ID 명부 + 강사에게 메시지 전달(문자 자동발송 + 카톡 붙여넣기 전달)
        path.startsWith('/api/admin/teachers/kakao') ||
        path === '/api/admin/teacher-hours' ||
        path === '/api/admin/teacher-classes' ||
        path === '/api/admin/teacher-evaluation' ||
        // 📊 인사평가 근거 분석 (목록 점수 클릭 → "왜 이 점수인가")
        path === '/api/admin/teacher-hr-analysis' ||
        path.startsWith('/api/admin/payroll/') ||
        // 📅 Phase SR — 수업 연기·변경 요청 (강사 제출 + 관리자 승인/거절)
        path.startsWith('/api/admin/schedule-requests') ||
        // 📜 수업 변경 이력(연기/삭제/종료) 조회·기록
        path === '/api/admin/class-audit' ||
        // 📅 (2026-08-17) 수업 «길이 변경» 신청함 — 신청은 상시, 반영은 월 1회
        path.startsWith('/api/admin/duration-requests') ||
        // ⏸ 연기 수업 통합 조회(매니저 화면) — 요청+감사로그를 합쳐 유료/무료·연기시각까지 (2026-07-23)
        path === '/api/admin/postponed-classes' ||
        // 📅 오늘 수업 전체(매니저용) — 강사 미입장 시 매니저가 바로 대신 입장 (2026-07-23)
        path === '/api/admin/classes/today' ||
        // 📝 Phase FD — AI 학부모 피드백 초안 + 강사 원클릭 승인
        path.startsWith('/api/admin/feedback-drafts') ||
        path === '/api/admin/payroll/all' ||
        path === '/api/admin/payroll/rates' ||
        path === '/api/admin/payroll/finalize' ||
        path === '/api/admin/payroll/seed-demo' ||
        // 🏯 (2026-08-18) 본사 관리 — 「시스템 › 조직 관리 › 본사 관리」 목록·등록·수정·삭제.
        //    '/api/admin/org' 접두사라 TEACHER_BLOCKED_PREFIXES 에 이미 걸려 강사에게는 닫힌다.
        path === '/api/admin/org/hq' ||
        /* 🗓 (2026-08-19) 지난 수업(attendance)에서 주간 일정을 만드는 도구.
           preview 는 읽기만, apply 는 «사람이 화면에서 고른 것» 만 만든다.
           ⚠️ 본사 전용 — 핸들러가 canEditOrg() 로 한 번 더 막는다. */
        path.startsWith('/api/admin/schedule-seed/') ||
        path === '/api/admin/franchises' ||
        path === '/api/admin/centers' ||
        path === '/api/admin/level-tests' ||
        path === '/api/admin/enrollments' ||
        // 📚 :id · :id/plan(미리보기) · :id/activate(확정 파이프라인) — 2026-08-08
        /^\/api\/admin\/enrollments\/\d+(\/(plan|activate))?$/.test(path) ||
        path === '/api/admin/community-posts' ||
        /^\/api\/admin\/community-posts\/\d+$/.test(path) ||
        path === '/api/admin/textbooks' ||
        /^\/api\/get-lesson-video\/\d+$/.test(path) ||
        path === '/api/lesson-video' ||
        // 📚 Phase 39 — 교재 파일 라이브러리 + 망고아이 비디오
        path === '/api/admin/textbook-files' ||
        /^\/api\/admin\/textbook-files\/\d+$/.test(path) ||
        // 🔍✏️ (2026-08-19) 교재 중복 진단(읽기 전용) · 묶음 일괄 이름변경(본사 전용, dry_run 기본)
        //     ⚠️ 위 정규식은 /\d+$/ 라 이 두 경로를 안 잡는다 — 반드시 따로 적어야 인증을 거친다.
        path === '/api/admin/textbook-files/dup-report' ||
        path === '/api/admin/textbook-files/rebook' ||
        // 👥 (2026-08-19) 진행 중인 방 번호 → 강사·학생 이름. 핸들러가 스코프로 잘라서 준다.
        path === '/api/admin/live-classes' ||
        // 🔴 (2026-08-20) 예약 기준 «지금 진행 중이어야 할 수업». 핸들러가 스코프로 자르고 강사는 막는다.
        path === '/api/admin/classes-now' ||
        // 📶 (2026-08-27) 화상 회선품질 조회(admin.html 「회선 품질」 패널)·강제 릴레이 지정(vc_relay_force).
        //    핸들러(api-admin.ts)는 각각 7/19·8/21 부터 있었는데 이 목록과 api-mango 위임 가드에
        //    빠져 있어 «조용한 404» 였다 — 중국 회선 강제 릴레이 기능이 켤 방법이 없는 죽은 코드였음.
        path === '/api/admin/vc/quality' ||
        path === '/api/admin/vc/relay' ||
        // 🙈 (2026-08-13) 라이브러리에서 숨길 교재 묶음 (관리자가 고른다)
        path === '/api/admin/textbook-hidden-books' ||
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
        // 📚 교재 일괄 배정 (학생관리 카드)
        path === '/api/admin/students/bulk-assign-textbook' ||
        // ➕ 학생 수동 등록 (학생관리 카드 「학생 등록」 버튼)
        path === '/api/admin/students/create' ||
        path === '/api/community/posts' ||
        path === '/api/teacher-profiles' ||
        path === '/api/_bootstrap' ||
        path === '/api/dashboard' ||
        // 📊 Phase D1-D2 KPI Dashboard
        path === '/api/admin/kpi/dashboard' ||
        // 💸 Phase F1-F2 미납 자동 알림
        path === '/api/admin/payments/overdue' ||
        path === '/api/admin/payments/import-cafe24' ||
        path === '/api/admin/payments/cafe24-diag' ||
        // 🚨 결석 위험 자동 알림 수동 실행/진단 (dry=1 지원)
        path === '/api/admin/absent-sweep/run' ||
        // 🛟 버려진 녹화 자동 마무리 수동 실행/진단 (stale_min= 로 기준시간 조절)
        path === '/api/admin/recordings/finalize/run' ||
        // 📣 수업 전 리마인더 수동 실행/진단 (dry=1 지원)
        path === '/api/admin/lesson-reminder/run' ||
        path === '/api/admin/payments/notify-overdue' ||
        path === '/api/admin/payments/notify-all-overdue' ||
        path === '/api/admin/payments/overdue-log' ||
        path === '/api/admin/payments/record' ||
        // 💬 Phase I1-I2 신규상담
        path.startsWith('/api/admin/inquiry/') ||
        // 🐞 Phase BUG 교사 버그/피드백 신고 (관리자 접수함)
        path === '/api/admin/bug-reports' || path.startsWith('/api/admin/bug-reports/') ||
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
        path === '/api/vocab/extract' ||
        path === '/api/vocab/bulk-add' ||
        path === '/api/vocab/list' ||
        path === '/api/vocab/due' ||
        path === '/api/vocab/review' ||
        path === '/api/vocab/reward' ||
        path === '/api/vocab/stats' ||
        path === '/api/vocab/leaderboard' ||
        /^\/api\/vocab\/\d+$/.test(path) ||
        // 📄 Phase MR 월별 보고서 (HTML/PDF 페이지)
        /^\/api\/report\/monthly\/[^\/]+\/\d{4}-\d{2}$/.test(path) ||
        path === '/api/report/monthly/latest' ||  // 🌟 2026-07-25 — 학생/학부모 "성적표 바로가기"(parent.html)용, admin 접두 아니라 여기 등록 필요
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
        // 🎯 학생 본인 집중도 이력 — 관리자 게이트가 아니라 **본인 서명토큰**으로 지킨다
        //   (핸들러 안에서 uid 일치를 검사한다. api-students.ts 참고)
        path === '/api/student/focus-history' ||
        path === '/api/student/full' ||
        path === '/api/student/today' ||        // 📅 «오늘의 A.i 학습» — 본인 토큰/관리자 세션 (핸들러 안 resolveOwnerScope, api-students.ts)
        // 🔐 Phase LOGIN 통합 로그인
        path === '/api/student/login' ||
        // 🔒 (2026-08-08) 세션 상태 조회 — 401 을 받았을 때 «왜» 인지 화면에 알려주기 위한 것.
        //   토큰만 보고 판정하며 개인정보를 돌려주지 않는다(uid 는 요청자가 이미 가진 값).
        //   ⚠️ 경로가 반드시 `/api/student/` 로 시작해야 한다 — api-mango.ts 가 그 네 개
        //      접두사일 때만 handleStudentsApi 를 부른다(여기만 등록하면 404 가 난다).
        path === '/api/student/session-status' ||
        path === '/api/student/register' ||
        path === '/api/student/lookup' ||
        path === '/api/student/set-password' ||
        // 🔑 비밀번호 재설정 (SMS 인증) — 2026-07-22
        path === '/api/student/password-reset/request' ||
        path === '/api/student/password-reset/confirm' ||
        // 🔞 워드파이터 보호자 인증(SMS) — 2026-07-30
        path === '/api/student/wf-verify/status' ||
        path === '/api/student/wf-verify/request' ||
        path === '/api/student/wf-verify/confirm' ||
        // 😊 Phase PASSKEY 얼굴/지문 로그인 (WebAuthn)
        /^\/api\/passkey\/(register\/options|register\/verify|login\/options|login\/verify|list|remove)$/.test(path) ||
        // 🌐 Phase OAUTH 소셜 로그인
        path === '/api/oauth/status' ||
        /^\/api\/oauth\/(kakao|naver|google)\/(url|callback)$/.test(path) ||
        // 🎙 Phase AV AI 음성 코칭
        path === '/api/voice/tts' ||
        path === '/api/voice/transcribe' ||
        path === '/api/voice/coach' ||
        path === '/api/voice/history' ||
        path === '/api/voice/stats' ||
        // 🎤 (2026-08-08) Azure 발음평가용 «10분짜리 임시 출입증». 키 자체는 서버에만 있다.
        //   REST 창구가 발음평가 헤더를 무시해서, 평가는 브라우저 SDK 가 직접 한다.
        //   음성코치는 비로그인(게스트)도 쓰므로 여기(공개 목록)에 있어야 한다.
        path === '/api/voice/azure-token' ||
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
        // 🔗 강사 계정 ↔ 강사 원부 연결 (이름 추측 대신 사람이 정한 정답표)
        path === '/api/admin/teacher-links' ||
        // 📇 강사 원부 ↔ 프로필(연락처) 연결 — 핸들러는 8/7부터 있었는데 이 게이트와
        //    api-mango 위임 가드 «둘 다» 등록이 빠져 라이브 404 였다(2026-08-13 수리)
        path === '/api/admin/teacher-contacts' ||
        // 💳 법인카드 CODEF 연동 (corpcard-sync.ts) — 게이트+위임가드+강사차단 3종 세트
        path.startsWith('/api/admin/corpcard/') ||
        // 🏦 신한은행 계좌 입출금 (bankacct-sync.ts) — 같은 3종 세트 (2026-08-14)
        path.startsWith('/api/admin/bankacct/') ||
        // 🎁 Phase RF — 추천 친구 보상
        path === '/api/referral/my-code' ||
        path === '/api/referral/use' ||
        path === '/api/admin/referrals' ||
        path === '/api/admin/referrals/stats' ||
        // 📊 (2026-08-11 삭제) 자녀 성장 비교(/api/report/comparison) 게이트 등록 제거.
        //    핸들러가 없어 라이브 404 였다(반쪽 배선). UI 카드를 통째로 지우며 함께 제거.
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
        // 🚷 (2026-08-13 수정요청 #05) 장기 결석생 — 핸들러는 api-admin.ts.
        //    ⚠️ 여기 + api-mango.ts 위임 가드 «둘 다» 등록해야 동작한다(CLAUDE.md 함정).
        //       test-harness/mango_gate_harness.mjs 가 이 등록 누락을 배포 게이트에서 잡는다.
        //    ℹ️ isAgencyAllowedApi 에는 넣지 않았다 — 이 화면은 본사 전용이고
        //       지사·대리점 계정은 위쪽에서 /admin/exec 로 돌아간다.
        path === '/api/admin/attendance/long-absent' ||
        // 📊 (2026-08-19) 학원별 학생 수업현황(SLP 출석 통계) — 핸들러는 api-admin.ts.
        //    ⚠️ 여기 + api-mango.ts 위임 가드 «둘 다» 등록해야 동작한다(CLAUDE.md 함정).
        //    지사·대리점도 보는 화면이라 isAgencyAllowedApi 에도 등록했다(핸들러가 scopeStudentCond 로 자기 범위만 자름).
        path === '/api/admin/attendance/school-stats' ||
        // 📺📖 (2026-08-10 삭제) 비디오 자막·AI 사전 게이트 등록 5종 제거.
        //    전부 핸들러가 없어 라이브 404/미구현이었다(반쪽 배선):
        //      /api/admin/video/subtitle-upload · /api/video/subtitle · /api/admin/video/subtitles
        //      /api/dictionary · /api/vocab/save-from-dict
        //    관련 UI(홈 단어 사전 · 관리자 «비디오 자막+사전» 카드)를 통째로 지우며 함께 제거.
        // 👨‍👩‍👧 Phase FAM — 가족 계정 통합
        path === '/api/admin/family/create' ||
        path === '/api/admin/family/add-child' ||
        path === '/api/admin/family/remove-child' ||
        path === '/api/admin/families' ||
        path === '/api/family/my-children' ||
        path === '/api/family/discount-status' ||
        // 📝 Phase MT — Mini TOEIC 자체 영어 시험 (api-exam.ts, 프리픽스 전체 위임)
        //   /api/admin/exam* 은 위 default-deny 미들웨어가 관리자 인증을 이미 보장.
        path.startsWith('/api/admin/exam') ||
        path.startsWith('/api/exam/') ||
        // 🎮 (2026-08-11 삭제) 영어 배틀 게이트 등록 9종 제거 — 학생·관리자 UI 를 통째로 지웠다.
        //    challenge·incoming·active·accept·decline·submit-score·word-set 은 핸들러 없이 죽어 있었고,
        //    history·leaderboard 는 살아있었지만 실제로 «게임 단어 통계» 였고 관리자 카드째 삭제했다.
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
        path === '/api/points/rules' ||         // 🎁 "포인트 모으는 법" 공개 안내(2026-07-30, PII 아님)
        path === '/api/points/leaderboard' ||   // 🏆 학원 랭킹(공개, admin/points/list 대체)
        path === '/api/uptime-hook' ||          // 📟 UptimeRobot 장애 웹훅(토큰 보호) → 관리자 문자
        // 🌟 실시간 칭찬 포인트 — 학생 입장 등록 + 선생님 서버측 적립(학생 전체 포인트 확실 반영)
        path === '/api/vc/roster' ||
        path === '/api/vc/quality-log' ||       // 📶 화상수업 회선품질 로깅(공개, fire-and-forget)
        path === '/api/points/award-praise' ||
        // ⭐ 수업 강사 평가 (수업 종료 직후 별 7개 + 태그 + 건의사항)
        path === '/api/ratings' ||
        path === '/api/ratings/check' ||
        // 🤖 AI 상담봇 (전화·사람 없이 24시간 자동 응대)
        path === '/api/consult-bot' ||
        // 💬 신규상담 공개 제출 (그동안 게이트 누락으로 404였음 — 리드 저장 복구)
        path === '/api/student/inquiry' ||
        // 🐞 교사 버그/피드백 신고 공개 제출 (교사에겐 admin 세션 없음)
        path === '/api/bug-report' ||
        // 🎯 레벨테스트 신청 (학생 제출 저장 + 관리자·강사 목록/상태변경)
        path === '/api/leveltest/apply' ||
        // 🙋 학생·학부모 본인 조회(«내 레벨테스트») — 핸들러가 mango_token 으로 소유자 검증
        path === '/api/leveltest/my' ||
        // 🎟️ 티켓(확인+입장 링크 하나) — 핸들러가 서명 토큰으로 본인 확인. 계정 없어도 열림
        path === '/api/leveltest/ticket' ||
        path === '/api/leveltest/ticket.ics' ||
        path === '/api/admin/leveltest/applications' ||
        // 🧠 AI 자동 진단 (CEFR 배치테스트 문항 + 서버채점)
        path === '/api/leveltest/questions' ||
        path === '/api/leveltest/diagnose' ||
        path === '/api/admin/ratings/summary' ||
        path === '/api/admin/ratings/list' ||
        path === '/api/admin/ratings/analytics' ||
        path === '/api/teacher/my-ratings' ||
        // 🧑‍🏫 교사 마이페이지: 나에게 배정된 레벨테스트 목록 + 미확인 배지/확인처리
        path === '/api/teacher/leveltest-assignments' ||
        // 🧠 교사 본인 MBTI 자가기록(조회/저장)
        path === '/api/teacher/mbti-self' ||
        // 🤖 교사 수업 AI 피드백 (수업 종료 직후 잘한점/개선점 한·영 생성·조회)
        path === '/api/ai-feedback/generate' ||
        path === '/api/ai-feedback' ||
        // 🎥 수업 종료 후 학생별 AI 리포트 (집중도·발화·영어사용 통합)
        //   /api/admin/* 이므로 위 default-deny 미들웨어가 관리자 인증을 이미 보장한다.
        path === '/api/admin/lesson-insights' ||
        path === '/api/admin/lesson-insights/generate' ||
        path === '/api/admin/lesson-insights/sweep' ||
        // 🧠 판단력 엔진(3단계) — 학생/학부모 성장 리포트 + 맞춤 시나리오 + 훈련 답안 채점
        path === '/api/judgment/growth' ||
        path === '/api/judgment/scenario' ||
        path === '/api/judgment/answer' ||
        path === '/api/judgment/inclass' ||
        // 🧠 판단력 «관리자» 3종 (2026-08-09 배선 복구)
        //   api-points.ts:670·687·697 에 온전히 구현돼 있는데 이 게이트에 없어서
        //   URL 로 부르면 index.html 로 흘러가 405/HTML 이 나왔다 — 즉 통째로 죽어 있었다.
        //   (api-mango.ts:1320 은 이미 받을 준비가 돼 있었다. 빠진 건 여기 한 곳뿐)
        path.startsWith('/api/admin/judgment/') ||
        // 🔁 Streak 일괄 정합화 (api-games.ts:2048, POST) — 같은 사고.
        //   index.ts:4881 의 «인증 필수» 목록에는 등록해 놓고 이 전달 목록엔 빠뜨렸다.
        //   목록이 둘이라 한쪽만 고치면 이렇게 된다.
        path === '/api/admin/streak/reconcile' ||
        // 🌐 양방향 번역 (평가 글·건의사항 영↔한)
        path === '/api/translate' ||
        // Audit-added: student recordings listing
        path === '/api/student/recordings' ||
        // 📝 학생/학부모 수업 피드백 조회 (본인 것만, 토큰 필수) — 2026-07-22 컴플레인 #3
        path === '/api/student/feedbacks' ||
        // 🛸 Space Monster Hunter 게임 API
        path === '/api/games/space-monster/hit' ||
        path === '/api/games/space-monster/stage-complete' ||
        path === '/api/games/space-monster/results') {
      // fix (2026-06-01) — 미처리 예외가 Cloudflare 503 으로 새지 않도록 방어:
      //   어떤 경우에도 JSON 응답을 보장 (콘솔 503 도배 방지).
      try {
        // 🛸 Space Monster Hunter 게임 API (우선순위 높음)
        if (path.startsWith('/api/games/space-monster/')) {
          const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
          const res = await handleSpaceMonsterApi(request.method, path, url, body, env as any);
          if (res) return res;
        }

        // 📅 (2026-08-17) 수업 «길이 변경» 신청함 — 신청은 상시, 반영은 월 1회.
        //   ⚠️ 여기 등록하지 않으면 라우팅이 안 붙어 404 다(CLAUDE.md 의 «새 API 추가» 함정).
        {
          const dq = await handleDurationQueue(request, env as any, path, request.method);
          if (dq) return dq;
        }

        const res = await handleMangoApi(request, url, env, ctx);
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

    // 🧬 아이 성향 수집 — 학부모 폼(토큰) + 관리자. /api/traits/* (공개, 토큰검증) · /api/admin/student-traits (관리자)
    if (path === '/api/traits/get' || path === '/api/traits/save' || path === '/api/admin/student-traits') {
      try {
        const res = await handleTraitsApi(request, url, env as any);
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

    // 🔁 수강권 자동연락 — 문자 미리보기 (관리자). ?uid=
    if (path === '/api/admin/retention/preview') {
      try {
        const data = await previewRetentionMessage(env as any, url.searchParams.get('uid') || '');
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
    // 🔁 수강권 자동연락 — 실제 발송 (관리자). POST { user_ids: [] }
    if (path === '/api/admin/retention/send' && request.method === 'POST') {
      try {
        const b: any = await request.json().catch(() => ({}));
        const ids = Array.isArray(b?.user_ids) ? b.user_ids.map((x: any) => String(x)).filter(Boolean) : [];
        const data = await sendRetentionMessages(env as any, ids, { by: 'admin' });
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }
    // 🔁 수강권 자동연락 — 설정 조회/저장 (관리자). GET / POST { auto_enabled, daily_cap, resend_gap_days, link_url }
    if (path === '/api/admin/retention/settings') {
      try {
        if (request.method === 'POST') {
          const b: any = await request.json().catch(() => ({}));
          return new Response(JSON.stringify({ ok: true, settings: await setRetentionSettings(env as any, b) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        }
        return new Response(JSON.stringify({ ok: true, settings: await getRetentionSettings(env as any) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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
    //   🔐 강사(teacher) 로그인 시엔 서버가 본인 급여 행만 내려준다(타 강사 총액·순위 노출 방지).
    if (path === '/api/admin/payroll/auto') {
      try {
        const now = new Date();
        const year = parseInt(url.searchParams.get('year') || String(now.getFullYear()), 10);
        const month = parseInt(url.searchParams.get('month') || String(now.getMonth() + 1), 10);
        const actor = await getAdminActor(request, env as any);
        const ownName = actor.isTeacher ? actor.name : '';
        const data = await getPayrollAuto(env as any, year, month, ownName ? { teacherName: ownName } : undefined);
        // 강사 본인 뷰에서는 전체 급여를 요약하는 AI 문장을 생성하지 않는다(타인 정보 노출 방지)
        let ai = '';
        if (!actor.isTeacher && url.searchParams.get('ai') === '1') ai = await payrollAiSummary(env as any, year, month, data, url.searchParams.get('lang') || 'ko');
        return new Response(JSON.stringify({ ok: true, year, month, ...data, ai, own_only: !!ownName }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🧾 강사 급여 페소→원화 환율 저장 (관리자 전용, 쓰기). POST { rate }
    //   🔐 강사는 환율(급여 정책)을 바꿀 수 없다 — 관리자·경영진만.
    if (path === '/api/admin/payroll/rate' && request.method === 'POST') {
      try {
        const actor = await getAdminActor(request, env as any);
        if (actor.isTeacher) {
          return new Response(JSON.stringify({ ok: false, error: 'forbidden_teacher', message: '강사는 급여 환율을 변경할 수 없습니다.' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        }
        const b: any = await request.json().catch(() => ({}));
        const v = await setPhpKrwRate(env as any, Number(b?.rate));
        return new Response(JSON.stringify({ ok: true, php_krw: v }),
          { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ ok: false, error: 'api_error', detail: String(e?.message || e) }),
          { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
      }
    }

    // 🧾 강사 급여 지급완료 토글 (관리자 전용, 쓰기). POST { teacher_id, year, month, paid }
    //   🔐 강사는 지급 상태를 바꿀 수 없다(본인 것 포함) — 관리자·경영진만.
    if (path === '/api/admin/payroll/mark-paid' && request.method === 'POST') {
      try {
        const actor = await getAdminActor(request, env as any);
        if (actor.isTeacher) {
          return new Response(JSON.stringify({ ok: false, error: 'forbidden_teacher', message: '강사는 지급 상태를 변경할 수 없습니다.' }),
            { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        }
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

    // 🚗 /sales — 영업 전용 휴대폰 화면 (2026-08-18)
    //   ⚠️ 확장자 없는 주소는 **여기서 한 줄로 직접 이어 줘야** 한다.
    //      [assets] 가 html_handling="none" 이라 /sales → /sales.html 자동 연결이 없다.
    //      2026-08-18 실제로 밟음: 인증 게이트(isAdminPath)에만 등록하고 이 줄을 빠뜨려
    //      /sales 가 아무 데도 안 걸리고 **홈 화면(index.html)이 떴다.**
    //      게이트는 통과했으니 «권한 문제» 로 보이지도 않아 원인 찾기가 더 어렵다.
    if (path === '/sales' || path === '/sales/') {
      const r = new Request(new URL('/sales.html' + url.search, request.url).toString(), request);
      return env.ASSETS.fetch(r);
    }

    // ⏸ /admin/postponed-classes — 연기 수업 현황 페이지 (매니저 전용, 2026-07-23)
    if (path === '/admin/postponed-classes' || path === '/admin/postponed-classes/') {
      const r = new Request(new URL('/admin/postponed-classes.html' + url.search, request.url).toString(), request);
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

    // 🏢 캐피타운 프랜차이즈 정산 (2026-07-22) — 경영진·캐피타운 본사=전체, capi_* 지사=자기 지사만
    if (path.startsWith('/api/admin/capitown/')) {
      return capitownRouter(request, env);
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

    // 🎮 전 게임 통합 분석 API (2026-08-08 신설) — GET /api/admin/game-insights?range=7
    //   /api/admin/ 접두사라 인증 게이트(default-deny)에 자동으로 걸린다.
    //   지사·대리점도 봐야 하므로 isAgencyAllowedApi 에 함께 등록했다.
    if (path === '/api/admin/game-insights') {
      const { gameInsightsRouter } = await import('./game-insights');
      return gameInsightsRouter(request, env);
    }

    // 🎮 /admin/game-insights — 전 게임 통합 분석 화면 (관리자·매니저·지사)
    //   ⚠️ admin.html(1.0MB · 카드 91개)에 카드로 넣지 않았다. 얹으면 전원이 함께 느려진다.
    //      manager.html 이 같은 이유로 934KB→10KB(44배)를 냈다. 여기도 같은 길을 간다.
    //   경로가 /admin/ 로 시작하므로 isAdminPath 와 미인증 리다이렉트 목록에 **이미 걸린다**
    //   (둘 다 startsWith('/admin/')). 그래서 이 화면은 JSON 원문 사고가 구조적으로 안 난다.
    if (path === '/admin/game-insights' || path === '/admin/game-insights/') {
      const r = new Request(new URL('/admin/game-insights.html' + url.search, request.url).toString(), request);
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
    // 🧠 판단 경로 그래프 ETL/디버그 (decision-graph) — 관리자 전용
    if (path.startsWith('/api/admin/decision-graph/')) {
      return decisionGraphRouter(request, env as any);
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

    // 🇵🇭 /teacher — 강사 전용 초경량 포털 (2026-08-02)
    //   admin.html 의 공통 레이아웃(LNB·차트·i18n 스윕·서비스워커)을 일절 상속하지 않는
    //   독립 HTML 한 장. 인증·역할 분기는 위 미들웨어에서 이미 끝났다.
    if (path === '/teacher' || path === '/teacher/') {
      const r = new Request(new URL('/teacher.html' + url.search, request.url).toString(), request);
      const tResp = await env.ASSETS.fetch(r);
      // 🚀 확장자 없는 경로는 아래 '정적자산' 블록(경로에 `.확장자`가 있어야 진입)을 타지 않는다.
      //   그래서 여기서 직접 ETag/304 를 달아 주지 않으면, 강사가 페이지를 열 때마다
      //   36KB HTML 이 **매번 통째로** 다시 내려간다. 필리핀 회선에서 이게 체감 지연이 된다.
      //   BUILD_STAMP 는 '배포 때만 바뀌는' 검증자라 안전하게 304 를 줄 수 있다.
      //   ※ /admin/mypage 등 다른 확장자 없는 경로도 같은 상태다(이번 범위 밖).
      const tHeaders = new Headers(tResp.headers);
      tHeaders.set('Cache-Control', 'no-cache');   // 캐시 금지가 아니라 '쓰기 전 재검증'
      const tNotMod = htmlEtag304(request, '/teacher.html', env, tHeaders);
      if (tNotMod) return tNotMod;
      return new Response(tResp.body, { status: tResp.status, headers: tHeaders });
    }

    /* 🏫 /manager — 매니저 전용 초경량 포털 (2026-08-08 신설)
     *
     * 🔴 (2026-08-09 버그수정) **이 블록이 통째로 빠져 있었다.**
     *    `/manager` 는 확장자가 없어 아래 «정적자산» 블록(`path.match(/\.\w+$/)`)에 들어가지
     *    못하고, 그대로 맨 아래 **SPA 폴백(index.html)** 까지 굴러떨어졌다.
     *    → 매니저가 「내 페이지로 이동」을 눌러도 **홈 화면이 다시 뜬다.** 사장님 제보의 원인.
     *    같은 자리에서 `/teacher` 만 재작성돼 있었다(바로 위 블록). 만들 때 한 쌍을 놓친 것이다.
     *
     *    🪤 이걸 왜 못 잡았나 — 검증을 **미인증 상태**로만 했다. 로그아웃 상태의 `/manager` 는
     *       위 미들웨어가 302 `/admin/login?next=%2Fmanager` 를 주므로 «라우팅 정상» 처럼 보인다.
     *       깨지는 건 **로그인한 뒤**뿐이다. 인증 뒤 경로는 인증된 상태로 확인해야 한다.
     *
     *    ⚠️ managerPortalRedirect 가 보내는 목적지도 `/manager`(확장자 없음)라, 지사·대리점과
     *       필리핀 본사 매니저가 `/admin.html` 을 열 때마다 홈으로 튕겨 왔다.
     */
    if (path === '/manager' || path === '/manager/') {
      const r = new Request(new URL('/manager.html' + url.search, request.url).toString(), request);
      const mResp = await env.ASSETS.fetch(r);
      // /teacher 와 같은 이유로 ETag/304 를 직접 붙인다 — 안 붙이면 열 때마다 통째로 다시 받는다.
      const mHeaders = new Headers(mResp.headers);
      mHeaders.set('Cache-Control', 'no-cache');
      const mNotMod = htmlEtag304(request, '/manager.html', env, mHeaders);
      if (mNotMod) return mNotMod;
      return new Response(mResp.body, { status: mResp.status, headers: mHeaders });
    }

    /* 🧾 /work — 결재 전용 초경량 화면 (2026-08-16 신설)
     *
     * 왜 — 결재 API 는 2026-08-05 부터 있었는데, 화면이 **강사 포털(192KB) 안**에 있었다.
     *      강사는 그 카드가 403 이라 못 보고, 정작 결재를 가장 많이 올리는 필리핀 매니저의
     *      전용 화면(manager.html)에는 결재가 **한 줄도 없었다**. 매니저는 결재 한 건 올리려고
     *      자기 경량 화면을 나가 10배 무거운 페이지를 받아야 했다 — 「경로가 복잡하다」의 실체.
     *
     * ⚠️ /teacher · /manager 와 같은 이유로 ETag/304 를 직접 붙인다.
     *    확장자가 없는 경로라 아래 «정적자산» 블록에 들어가지 못해, 안 붙이면 열 때마다
     *    통째로 다시 내려간다(필리핀 회선에서 이게 체감 지연이 된다).
     * ⚠️ 이 한 쌍(/teacher·/manager)을 놓쳐서 2026-08-09 에 매니저가 홈으로 튕긴 사고가 있었다.
     *    새 경량 화면을 추가할 땐 반드시 여기에도 블록을 만들 것.
     */
    if (path === '/work' || path === '/work/') {
      const r = new Request(new URL('/work.html' + url.search, request.url).toString(), request);
      const wResp = await env.ASSETS.fetch(r);
      const wHeaders = new Headers(wResp.headers);
      wHeaders.set('Cache-Control', 'no-cache');   // 캐시 금지가 아니라 '쓰기 전 재검증'
      const wNotMod = htmlEtag304(request, '/work.html', env, wHeaders);
      if (wNotMod) return wNotMod;
      return new Response(wResp.body, { status: wResp.status, headers: wHeaders });
    }

    // Static assets (실제 파일 확장자가 있는 요청)
    if (path.match(/\.\w+$/)) {
      const assetResp = await env.ASSETS.fetch(request);
      // HTML/JS/CSS는 '항상 최신'을 보장하되 ETag 재검증만 하게 한다.
      //   이전: no-store → 브라우저가 저장 자체를 금지당해, 안 바뀐 파일까지
      //         수업 시작마다 전부 재다운로드(약 1.7MB). 필리핀 저속 회선에서 로딩 지연의 주원인.
      //   현재: no-cache → 매번 서버에 확인은 하되, 안 바뀌었으면 304(본문 0바이트).
      //   ※ no-cache 는 '캐시 금지'가 아니라 '쓰기 전에 반드시 재검증'이라는 뜻이다.
      //     따라서 최신 버전 보장은 이전과 완전히 동일하다.
      if (path.match(/\.(html|js|css)$/)) {
        const assetHeaders = new Headers(assetResp.headers);
        // 🚀 (2026-07-22) 버전이 박힌 js/css 는 '영구 캐시'로 — 필리핀 저속·고지연 회선 대책.
        //   문제: admin.html 은 js 파일을 80개 부른다. no-cache 는 '캐시 금지'가 아니라
        //   '쓰기 전 반드시 재검증'이라, 안 바뀐 파일도 매 접속마다 80번 왕복 확인을 한다.
        //   본문은 304(0바이트)라 용량은 작지만, 왕복 지연이 큰 회선에서는 이 80번이
        //   로그인 체감 시간의 대부분을 차지한다(측정: JS 실행은 79개 합쳐 101ms 뿐).
        //   해결: URL 에 ?v= 가 붙은 요청은 내용이 바뀌면 URL 도 바뀌므로 재검증이 불필요하다.
        //        → immutable 로 주면 두 번째 로그인부터 js 요청이 0건이 된다.
        //   ⚠️ 전제: js/css 를 고치면 admin.html 의 ?v= 를 반드시 올려야 한다.
        //      안 올리면 사용자에게 1년간 옛 파일이 남는다. 이 규칙은
        //      test-harness/asset_version_harness.mjs 가 배포 게이트에서 강제한다.
        //   버전이 없는 요청은 종전대로 no-cache(매번 재검증) — 안전한 기본값.
        const _versioned = /\.(js|css)$/.test(path) && /(^|&)v=/.test(url.search.replace(/^\?/, ''));
        if (_versioned) {
          assetHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(assetResp.body, { status: assetResp.status, headers: assetHeaders });
        }
        assetHeaders.set('Cache-Control', 'no-cache');
        const notMod = htmlEtag304(request, path, env, assetHeaders);
        if (notMod) return notMod;
        return new Response(assetResp.body, { status: assetResp.status, headers: assetHeaders });
      }
      // 🖼️ (2026-08-14 피드백 ②) 이미지·폰트·소리·영상에는 캐시 지시가 «아예 없었다».
      //   js/css 는 위에서 immutable 로 챙겼는데 그림은 빠져 있어서, CF Assets 기본값
      //   (max-age=0, must-revalidate)이 그대로 나갔다 — 즉 페이지를 옮길 때마다 그림
      //   한 장 한 장을 서버에 다시 물어본다. 홈 한 화면에만 그림이 수십 장이고,
      //   필리핀·지방 저속 회선에서는 이 왕복이 그대로 «버퍼링» 으로 보인다.
      //   · 파일명에 해시·버전이 있거나 ?v= 가 붙은 요청 → 1년 immutable (재검증 0회)
      //   · 그 외 → 7일 캐시 + stale-while-revalidate (다음 요청은 즉시 그리고 뒤에서 갱신)
      //   ⚠️ 그림을 «같은 이름으로» 교체하면 최대 7일간 옛 그림이 남는다. 내용이 바뀌면
      //      파일명을 바꾸거나 ?v= 를 올릴 것(js/css 와 같은 규칙).
      if (/\.(png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|mp3|m4a|ogg|wav|mp4|webm|glb|gltf)$/i.test(path)) {
        const mediaHeaders = new Headers(assetResp.headers);
        //   폰트는 언제나 1년 — 글자 모양이 «같은 이름으로» 바뀌는 일은 없다.
        //   (css/mangoi-han.css 주석이 이미 «한 번 받으면 1년간 캐시된다» 고 약속하고 있는데,
        //    정작 그 헤더를 아무도 안 붙이고 있었다. 983KB 짜리 한자 폰트다.)
        const _isFont = /\.(woff2?|ttf|otf)$/i.test(path);
        const _mVersioned = /(^|&)v=/.test(url.search.replace(/^\?/, '')) || /[.-][0-9a-f]{8,}\./i.test(path);
        mediaHeaders.set('Cache-Control', (_isFont || _mVersioned)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=604800, stale-while-revalidate=86400');
        return new Response(assetResp.body, { status: assetResp.status, headers: mediaHeaders });
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
    // HTML — 항상 최신 버전을 받도록 매번 재검증(no-cache).
    //   no-store 를 쓰면 안 바뀐 배포에서도 index.html(약 430KB 압축)을 통째로 다시 받는다.
    //   Pragma: no-cache 도 제거 — HTTP/1.0 잔재라 ETag 재검증 경로를 방해할 수 있다.
    const headers = new Headers(resp.headers);
    headers.set('Cache-Control', 'no-cache');
    const notMod = htmlEtag304(request, '/index.html', env, headers);
    if (notMod) return notMod;
    return new Response(resp.body, { status: resp.status, headers });
  },

  // Cron Trigger
  //   - UTC 18:00 (KST 03:00) : 보관기간 만료 데이터 자동 파기 + streak 일괄 정합화
  //   - UTC 10:00 (KST 19:00) : 학생 일일 streak/참여 푸시 알림
  //   - UTC 10:00 + 금요일      : 학부모 위클리 다이제스트 일괄 발송 (Phase WD)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    env = { ...env, DB: wrapDbDdlOnce(env.DB) } as Env;   // fetch 와 같은 이유 — DDL 1회화
    const date = new Date(event.scheduledTime);
    const hour = date.getUTCHours();
    // KST 기준 요일 (UTC + 9시간) — Friday = 5
    const kstDay = new Date(event.scheduledTime + 9 * 3600 * 1000).getUTCDay();
    // 🕐 «어느 cron 이 울렸나» — 야간 작업을 시(hour)로 가르면 안 된다 (2026-08-28 수리)
    //   wrangler.toml 의 crons 에는 15분마다 도는 감시견 트리거가 함께 들어 있다.
    //   그래서 `hour === 18` 같은 조건은 그 시간대에 «네 번»(정각·15·30·45분) 참이 되고,
    //   정각에는 전용 cron 이 **별도 호출**로 한 번 더 들어와 같은 작업이 «동시에» 돈다
    //   → 하루 5회 실행 + 정각 동시 2회. 그 결과가 문자 이중 발송·이중 청구다.
    //   이 파일은 이미 그 사실을 알고 있었다 — 아래 법인카드 블록 한 곳만
    //   `cron === '0 0 * * *'` 로 걸러 두고 나머지 여섯 곳이 hour 비교로 남아 있었다.
    //   ⚠️ 새 야간 작업은 반드시 cronIs() 로 가를 것. hour 비교를 다시 쓰지 말 것.
    const cronIs = (spec: string) => String((event as any).cron || '') === spec;
    // 감시견(15분) 트리거인가 — 정각 전용 cron 과 구분해야 하는 곳에서만 쓴다
    const isWatchdogTick = !!String((event as any).cron || '').startsWith('*');

    ctx.waitUntil((async () => {
      // 🐕 사이트 자체 감시견 — 매 cron(특히 */15분)마다 사이트 확인, 죽으면 관리자 문자.
      //   실패해도 다른 cron 작업에 영향 없게 격리.
      try {
        const w = await runSiteWatchdog(env as any);
        if (w.changed) console.log('[watchdog] state change', JSON.stringify(w));
      } catch (err) {
        console.error('[watchdog] error', err);
      }

      // 💳 법인카드(신한) 자동 동기화 — CODEF 키가 등록돼 있을 때만.
      //   cron 은 계정 한도 5/5 라 새로 못 늘려서, 기존 "0 0 * * *"(09:00 KST 일일)에 얹는다.
      //   event.cron 정확 일치로 거른다 — 같은 시각에 15분 cron 도 울리므로 hour 비교는 이중 실행.
      if ((event as any).cron === '0 0 * * *') {
        try {
          /* 🔀 (2026-08-14) 바로빌 키가 있으면 바로빌이 정본 — CODEF 는 바로빌이 없을 때만.
             예전엔 cron 이 CODEF 만 돌려서, 바로빌로 옮긴 뒤에도 ①바로빌 데이터가 자동으로
             안 들어오고 ②매일 아침 CODEF 실패(CF-00017)가 last_sync_result 를 덮었다.
             바로빌 수집(매일 04:00 KST)보다 늦은 09:00 KST 라 시각은 그대로 좋다. */
          const { corpcardConfigured, runCorpCardSync } = await import('./corpcard-sync');
          const { barobillConfigured, runBarobillSync } = await import('./barobill-sync');
          if (barobillConfigured(env)) {
            const bb = await runBarobillSync(env as any);
            console.log('[barobill-sync]', JSON.stringify(bb).slice(0, 500));
          } else if (corpcardConfigured(env)) {
            const cc = await runCorpCardSync(env as any);
            console.log('[corpcard-sync]', JSON.stringify(cc).slice(0, 500));
          }
        } catch (err) {
          console.error('[corpcard-sync] error', err);
        }
        // 📊 주간 결재 요약 — 월요일 아침(09:00 KST)에 경영진에게 한 번.
        //   페널티를 «벌점»이 아니라 «가시성»으로 두기로 한 설계의 마지막 조각이다.
        //   숨겨진 지연은 아무도 고치지 않지만, 드러난 지연은 대부분 스스로 해결된다.
        if (kstDay === 1) {
          try {
            const { runApprovalWeeklyReport } = await import('./api-approval');
            const wr = await runApprovalWeeklyReport(env as any);
            if (wr && wr.total > 0) console.log('[approval-weekly]', JSON.stringify(wr));
          } catch (err) {
            console.error('[approval-weekly] error', err);
          }
        }

        // 📰 영업 주간 보고 — 월요일 아침(09:00 KST)에 한 번.
        //   사람이 보고서를 쓰지 않는다. 숫자는 서버가 세고, 활동이 0인 주는 아예 보내지 않는다
        //   (빈 보고서가 매주 오면 아무도 안 읽게 되고, 그러면 진짜 보고서도 같이 묻힌다).
        if (kstDay === 1) {
          try {
            const { runSalesWeeklyReport } = await import('./api-sales-hr');
            const sw = await runSalesWeeklyReport(env as any);
            if (sw && sw.sent > 0) console.log('[sales-weekly]', JSON.stringify(sw));
          } catch (err) {
            console.error('[sales-weekly] error', err);
          }
        }

        // 🔁 영업 계약의 «3개월 유지» 자동 판정 (2026-08-18)
        //   왜 cron 인가 — 사람이 화면에서 버튼을 눌러야만 성과급 2차(50%)가 나가면,
        //   바쁜 달에는 담당자 월급이 밀린다. 제도가 사람의 부지런함에 기대면 언젠가 깨진다.
        //   학생 명부·수업 기록으로 기계가 판정할 수 있는 건 기계가 하고, 사람은 애매한 것만 본다.
        //   ⚠️ cron 한도 5/5 라 새로 못 만든다 — 기존 일일(09:00 KST)에 얹는다.
        try {
          const { runSalesRetentionSweep } = await import('./api-sales-hr');
          const sr = await runSalesRetentionSweep(env as any);
          if (sr && sr.checked > 0) console.log('[sales-retention]', JSON.stringify(sr));
        } catch (err) {
          console.error('[sales-retention] error', err);
        }

        // 🏦 신한은행 계좌 입출금 — 계좌번호 시크릿이 등록돼 있을 때만 (2026-08-14)
        try {
          const { bankConfigured, runBankSync } = await import('./bankacct-sync');
          if (bankConfigured(env)) {
            const bk = await runBankSync(env as any);
            console.log('[bankacct-sync]', JSON.stringify(bk).slice(0, 500));
          }
        } catch (err) {
          console.error('[bankacct-sync] error', err);
        }
      }

      // 🛟 버려진 녹화 자동 마무리 — 매 15분: 브라우저가 complete 를 못 보내고 죽어
      //   조각만 R2에 붕 떠 있는 녹화를, 서버가 파트 장부(recording_parts)를 보고 대신 마무리.
      //   15분 이상 새 파트가 없는 status='recording' 만 건드린다(진행 중 수업은 안 건드림).
      //   킬스위치 = KV 'recording_finalize'='off'.
      try {
        const rf = await runRecordingFinalizeSweep(env as any);
        if (rf && (rf.finalized > 0 || rf.failed > 0)) console.log('[rec-finalize]', JSON.stringify(rf));
      } catch (err) {
        console.error('[rec-finalize] error', err);
      }

      // 🧾 결재 마감 관리 — 매 15분: 시한을 넘긴 결재를 재알림하고, 이틀을 더 넘기면
      //   경영진 결재함으로 승격한다(원 결재자에게도 알린다).
      //   ⚠️ cron 은 계정 한도 5/5 로 꽉 차서 새로 못 만든다(wrangler.toml 주석) — 기존 15분에 얹는다.
      //   재알림은 건당 하루 1회로 제한된다(approval_requests.warned_at) — 도배 방지.
      try {
        const { runApprovalSlaSweep } = await import('./api-approval');
        const ap = await runApprovalSlaSweep(env as any);
        if (ap && (ap.warned > 0 || ap.escalated > 0)) console.log('[approval-sla]', JSON.stringify(ap));
      } catch (err) {
        console.error('[approval-sla] error', err);
      }

      // 📣 수업 전 리마인더 — 매 15분: 시작 15~45분 전 수업을 찾아 학부모+학생에게 문자.
      //   세션당 1회(lesson_reminder_log), 킬스위치 = KV 'lesson_reminder_send'='off'.
      try {
        const lr = await runLessonReminderSweep(env as any);
        if (lr && (lr.reminded > 0 || !lr.ok)) console.log('[lesson-reminder]', JSON.stringify(lr));
      } catch (err) {
        console.error('[lesson-reminder] error', err);
      }

      /* 🎟️ 레벨테스트 T-10 리마인더 — 매 15분.
         위의 lesson-reminder 와 겹치지 않는다: 저쪽은 전화번호를 students_erp 에서만 찾아
         «아직 학생 계정이 아닌 신청자»(실측 절반)에겐 구조적으로 못 간다. 여기서는
         신청서에 직접 적은 번호로 «확인+입장» 티켓 링크를 보낸다.
         킬스위치 = KV 'leveltest_reminder_send'='off'. */
      try {
        const lt = await runLeveltestReminderSweep(env as any);
        if (lt && (lt.reminded > 0 || !lt.ok)) console.log('[leveltest-reminder]', JSON.stringify(lt));
      } catch (err) {
        console.error('[leveltest-reminder] error', err);
      }

      /* 📅 레벨테스트 «전날 저녁» 리마인더 — 같은 15분 크론을 타되, 저녁 20시대에만 일한다.
         [왜] 알림이 «접수 순간» 과 «T-10» 두 끝뿐이라, 그 사이가 통째로 비어 있었다.
              시작 10분 전 문자 한 통을 놓치면 그대로 노쇼다 — 저녁 6시는 놓치기 쉬운 시간이다.
              레벨테스트를 받는 사람은 망고아이를 처음 써 보는 사람이라
              카메라·마이크 권한을 미리 만나 볼 시간이 필요하다.
         킬스위치는 T-10 과 공유(leveltest_reminder_send='off'). */
      try {
        const ltd = await runLeveltestDayBeforeSweep(env as any);
        if (ltd && (ltd.reminded > 0 || !ltd.ok)) console.log('[leveltest-daybefore]', JSON.stringify(ltd));
      } catch (err) {
        console.error('[leveltest-daybefore] error', err);
      }

      /* ⏱ 레벨테스트 «1시간 전» 리마인더 — 전날 알림과 T-10 사이를 메운다.
         전날 것은 «있다는 걸 알게» 하고 T-10 은 «지금 들어가라» 인데,
         그 사이에 «자리에 앉게» 만드는 알림이 없었다. */
      try {
        const lth = await runLeveltestHourBeforeSweep(env as any);
        if (lth && (lth.reminded > 0 || !lth.ok)) console.log('[leveltest-hourbefore]', JSON.stringify(lth));
      } catch (err) {
        console.error('[leveltest-hourbefore] error', err);
      }

      // 🚨 결석 위험 자동 알림 — 매 15분: 시작 10분+ 경과했는데 학생 미입장 수업 감지.
      //   기본 = 안전 모드(기록 + 담당 강사 알림). 사람에게 나가는 문자 «둘 다» 기본 OFF 이고
      //   KV(SESSION_STATE) 스위치로만 켠다 — 운영자 'absent_alert_owner_send',
      //   학부모 'absent_alert_parent_send' (각각 'on').
      //   ⚠️ 운영자 요약 문자는 2026-09-06 사장님 지시로 껐다(수업마다 문자가 계속 왔다).
      //      감지·class_no_show 기록·강사 알림은 그대로 — 관리자 › 노쇼 리포트에서 다 보인다.
      try {
        const ab = await runAbsentStudentSweep(env as any);
        if (ab && (ab.alerted > 0 || !ab.ok)) console.log('[absent-sweep]', JSON.stringify(ab));
      } catch (err) {
        console.error('[absent-sweep] error', err);
      }

      // 🎥 수업 종료 후 AI 리포트 — 매 15분: 끝난 지 3분~6시간 지난 수업을 훑어
      //   집중도(시선)·발화량·끊김 + 학생이 친 영어 문장을 합쳐 학생별 리포트 생성.
      //   수업 통신 경로와 완전 분리. 킬스위치 = KV 'insight:off'.
      try {
        const li = await runLessonInsightSweep(env as any);
        if (li && (li.processed > 0 || !li.ok)) console.log('[lesson-insight]', JSON.stringify(li));
      } catch (err) {
        console.error('[lesson-insight] error', err);
      }

      // 📨 수강권 만료·휴면 자동 연락 (KST 10:00 = UTC 01:00) — 설정에서 켰을 때만 발송(기본 OFF, 하루 상한·재발송갭 안전장치 내장).
      if (cronIs('0 1 * * *')) {
        try {
          const rs = await runRetentionAutoSend(env as any);
          console.log('[retention-autosend] cron ran', JSON.stringify(rs));
        } catch (err) {
          console.error('[retention-autosend] error', err);
        }

        // 📚 수강 만료 임박 재결제 안내 (KST 10:00) — 마지막 수업 7일·3일 전 1회씩.
        //   부장님 답변 17번(만료 7일전·3일전 자동 문자) 그대로. 멱등=enroll_notify_log.
        try {
          const ex = await runEnrollExpirySweep(env as any);
          if (ex && (ex.sent > 0 || !ex.ok)) console.log('[enroll-expiry]', JSON.stringify({ ok: ex.ok, checked: ex.checked, sent: ex.sent, skipped: ex.skipped }));
        } catch (err) {
          console.error('[enroll-expiry] error', err);
        }

        /* 🪙 포인트 유효기간 (KST 10:00) — 2026-08-07 승인 ③.
           마지막 적립으로부터 12개월에 소멸, 30일 전 1회 안내.
           멱등=point_expiry_log. 실패해도 다른 스윕을 막지 않는다. */
        try {
          const { runPointExpirySweep } = await import('./point-policy');
          const pe = await runPointExpirySweep(env as any);
          if (pe && (pe.notified > 0 || pe.expired > 0 || !pe.ok)) {
            console.log('[point-expiry]', JSON.stringify(pe));
          }
        } catch (err) {
          console.error('[point-expiry] error', err);
        }

        // ♾️ 자동연장(정기결제) 자동 청구 (KST 10:00) — 제보 #2-2/#3-2. 카드 등록한 학생을 매월 재청구.
        //   킬스위치: KV 'billing:auto_renew_live'='1' 이어야 실제 청구(기본은 dry-run으로 대상자만 집계).
        try {
          const ar = await runAutoRenewChargeSweep(env as any);
          console.log('[auto-renew]', JSON.stringify(ar));
        } catch (err) {
          console.error('[auto-renew] error', err);
        }
      }

      // 🎌 공휴일 자동 연기 (KST 06:00 = UTC 21:00) — 부장님 답변 23번: 새벽 6시에 그날 수업을 자동 연기.
      //   확인답변 ⑤: 그 회차를 맨 뒤로 밀어 종료일이 늦어짐(회차 수 보존). 공휴일이 없으면 아무 일도 안 함.
      // 이 작업만은 전용 cron 이 없다 — 15분 트리거를 타고 그 시간대에만 돈다(종전 동작 그대로).
      if (isWatchdogTick && hour === 21) {
        try {
          const hs = await runHolidayShiftSweep(env as any);
          if (hs && (hs.moved > 0 || !hs.ok)) console.log('[holiday-shift]', JSON.stringify({ ok: hs.ok, holidays: hs.holidays, moved: hs.moved, failed: hs.failed }));
        } catch (err) {
          console.error('[holiday-shift] error', err);
        }
      }

      /* 🪞 카페24 → 망고아이 시간표 미러 «좁은 창» (오늘~+2일) — 2026-08-31 사장님 지시
         카페24 예약은 당일에도 채워진다(실측: Ana 의 8/31 11건 대 9월 이후 4건).
         하루 한 번만 돌면 그날 오후에 들어온 수업을 놓치므로 15분 트리거를 함께 탄다.
         ⛔ 새 cron 을 못 만든다 — 계정 한도 5/5 가 이미 꽉 찼다(wrangler.toml).
         ⛔ hour 비교를 쓰지 않는다. isWatchdogTick 하나로만 가른다.
         ✅ 끄는 스위치는 c24_mirror_config.mode='off' 하나 — 그러면 카페24를 부르지도 않는다.
         ⚠️ runMirrorSweep 은 스스로 예외를 삼킨다(감시견을 같이 죽이면 안 된다). */
      if (isWatchdogTick) {
        try {
          const [{ runMirrorSweep }, { runCypher }] = await Promise.all([
            import('./c24-mirror'), import('./teacher-match'),
          ]);
          const mr = await runMirrorSweep(env as any, runCypher as any, { days: 2, label: 'watchdog' });
          if (!mr.skipped) console.log('[c24-mirror] watchdog', JSON.stringify(mr));
        } catch (err) {
          console.error('[c24-mirror] watchdog error', err);
        }
      }

      // ── UTC 18:00 — retention purge
      if (cronIs('0 18 * * *')) {
        /* 🌙 (2026-08-31) 이 블록은 «하나의 순차 체인» 이라, CPU·subrequest 한도를 넘기면
           격리가 통째로 종료되고 그 뒤 작업들은 **아무 로그도 없이** 안 돈다(try/catch 가 못 본다).
           그래서 «어디까지 갔는지» 를 D1(corpcard_meta)에 남긴다. 기록만 하고 작업 순서·내용은
           바꾸지 않는다 — 어느 작업이 오래 걸리는지 먼저 알아야 무엇을 뗄지 정할 수 있고,
           지금은 «블록 전체가 몇 분인가» 를 아무도 모른다(그것을 재려고 넣은 기록이다).
           ⚠️ 표시(markNightlyStep)는 try…catch «밖» 이어야 한다. catch 안에 넣으면 뜻이 뒤집혀
              «그 작업이 에러를 던졌다» 가 되고 정상적인 밤에는 기록이 한 줄도 안 남는다. */
        const _nightly = await beginNightlyRun(env as any, '0 18 * * *').catch(() => null);
        try {
          const result = await purgeExpired(env);
          console.log('[retention] purged', JSON.stringify(result));
        } catch (err) {
          console.error('[retention] error', err);
        }
        await markNightlyStep(env as any, _nightly, 'retention');

        // 🔄 카페24 → D1 야간 자동 새로고침 (KST 03:00)
        //   서버 cron(KST 02:00)이 MySQL→Neo4j 를 갱신한 뒤, 여기서 Neo4j→D1 을 갱신.
        //   조직·결제 전량 + 학생 전 페이지 + 출석 최근 14일 증분. 실패해도 항목별 격리.
        try {
          const syncOut = await nightlyCafe24Refresh(env);
          console.log('[cafe24-sync] nightly done', JSON.stringify(syncOut));
        } catch (err) {
          console.error('[cafe24-sync] nightly error', err);
        }
        await markNightlyStep(env as any, _nightly, 'cafe24-sync');

        /* 🪞 카페24 → 망고아이 시간표 미러 «넓은 창» (오늘~+14일)
           위 좁은 창(15분)이 당일치를 따라잡고, 여기서 멀리 있는 예약까지 맞춘다.
           동기화 «뒤» 에 두는 이유: 이 미러는 Neo4j 를 직접 읽지만, 학생 계정 확인은
           D1(students_erp)을 보므로 그날 새로 들어온 학생이 먼저 채워져 있어야 한다. */
        try {
          const [{ runMirrorSweep }, { runCypher }] = await Promise.all([
            import('./c24-mirror'), import('./teacher-match'),
          ]);
          const mr = await runMirrorSweep(env as any, runCypher as any, { days: 14, label: 'nightly' });
          console.log('[c24-mirror] nightly', JSON.stringify(mr));
        } catch (err) {
          console.error('[c24-mirror] nightly error', err);
        }
        await markNightlyStep(env as any, _nightly, 'c24-mirror');

        // 🔍 결제 대사(장부 맞추기) — 동기화 직후 최신 데이터로 이중결제·수업연결 누락 점검.
        //   이상 발견 시에만 사장님 SMS (정상일 땐 조용).
        try {
          const audit = await runPaymentAudit(env, { sms: true });
          console.log('[pay-audit] nightly done', JSON.stringify(audit?.summary || {}));
        } catch (err) {
          console.error('[pay-audit] error', err);
        }
        await markNightlyStep(env as any, _nightly, 'pay-audit');

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
        await markNightlyStep(env as any, _nightly, 'recordings-cleanup');

        // 🌅 Daily briefing (KST 03:00)
        try {
          const briefUrl = new URL('https://internal.local/api/admin/briefing/generate');
          const briefReq = new Request(briefUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(briefReq, briefUrl, env as any);
          console.log('[daily-briefing] cron ran', r?.status);
        } catch (err) {
          console.error('[daily-briefing] error', err);
        }
        await markNightlyStep(env as any, _nightly, 'daily-briefing');

        // 💰 Auto dunning (KST 03:00)
        try {
          const dunUrl = new URL('https://internal.local/api/admin/dunning/run');
          const dunReq = new Request(dunUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(dunReq, dunUrl, env as any);
          console.log('[auto-dunning] cron ran', r?.status);
        } catch (err) {
          console.error('[auto-dunning] error', err);
        }
        await markNightlyStep(env as any, _nightly, 'auto-dunning');

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
        await markNightlyStep(env as any, _nightly, 'finance-snapshot');

        /* 🎓 학습 인사이트 스냅샷은 **여기 없습니다** — 2026-09-04 에 `0 0 * * *`(KST 09:00)로 옮겼습니다.
           ⚠️ 되돌리기 전에 읽으세요.
           [잰 값] `corpcard_meta` 의 `nightly:0 18 * * *:last_ok` 를 사흘 연속 조회:
              09-01 8분 48초(527,969ms) · 09-02 10분 07초(606,993ms) · 09-03 12분 27초(746,707ms).
              그중 learning-snapshot 이 144,928 → 168,660 → **203,845ms**(전체의 27%).
           [판단] 세 점이 같은 방향이고 상한 15분까지 2분 33초였다. 넘으면 격리가 죽고
              **꼬리부터 조용히 잘린다** — 먼저 잘리는 것은 decision-graph-sync·growth-snapshot·
              auto-schedule 이다. ⚠️ 미러는 3번째라 «가장 늦게까지 안전한 축» 이지만,
              체인이 더 늘면 그 절단점이 앞으로 당겨져 결국 미러까지 닿는다.
              (처음 이 주석에 「미러가 3번째라 함께 잘립니다」라고 적었다가 고쳤다 —
               심각도를 부풀린 문장이 규칙서에 박히면 다음 사람이 엉뚱한 것을 고친다.)
           ℹ️ 순서 의존은 «없다» 가 아니라 «좋아졌다» — 이 작업은 attendance·students_erp·
              student_evaluations·voice_coaching 과 ai_student_analysis·churn-graph 를 읽는데,
              옮긴 자리(KST 09:00)는 이 블록의 카페24 동기화(KST 03:00) **6시간 뒤**라
              같은 날 갱신된 자료를 봅니다. */

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
        await markNightlyStep(env as any, _nightly, 'absence-sweep');

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
        await markNightlyStep(env as any, _nightly, 'streak-reconcile');

        // 🎯 강사 매칭 그래프 동기화 (KST 03:00) — D1(teacher_mbti·students_erp) → Neo4j Aura
        //   Neo4j 미설정(NEO4J_QUERY_URL 없음)이면 조용히 건너뜀. 멱등 MERGE 라 반복 안전.
        if (env.NEO4J_QUERY_URL) {
          try {
            const ts = await runTeacherGraphSync(env as any);
            console.log('[teacher-match-sync] cron ran', JSON.stringify(ts));
          } catch (err) {
            console.error('[teacher-match-sync] error', err);
          }
          await markNightlyStep(env as any, _nightly, 'teacher-match-sync');
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
          await markNightlyStep(env as any, _nightly, 'warmup-graph-sync');
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
          await markNightlyStep(env as any, _nightly, 'churn-contagion-sync');
        }

        // 🧠 판단 경로 그래프 동기화 (KST 03:00) — D1(judgment_events·judgment_analysis) → Neo4j Aura
        //   학생별 판단 이벤트·취약 스킬·오답유형·시간순 경로. Neo4j 미설정이면 조용히 건너뜀. 멱등 MERGE.
        if (env.NEO4J_QUERY_URL) {
          try {
            const ds = await runDecisionGraphSync(env as any);
            console.log('[decision-graph-sync] cron ran', JSON.stringify(ds));
          } catch (err) {
            console.error('[decision-graph-sync] error', err);
          }
          await markNightlyStep(env as any, _nightly, 'decision-graph-sync');
        }

        // 📈 판단력 성장 스냅샷 (KST 03:00) — 이번 달 이벤트가 있는 학생의 5축 지수·delta 재계산(순수 D1)
        try {
          const gs = await runGrowthSnapshot(env as any);
          console.log('[growth-snapshot] cron ran', JSON.stringify(gs));
        } catch (err) {
          console.error('[growth-snapshot] error', err);
        }
        await markNightlyStep(env as any, _nightly, 'growth-snapshot');

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
        await markNightlyStep(env as any, _nightly, 'auto-schedule');
        await endNightlyRun(env as any, _nightly);
      }

      // ── UTC 00:00 (KST 09:00) — 정기결제 자동 청구 cron (Phase RB)
      if (cronIs('0 0 * * *')) {
        /* 🌙 (2026-09-04) 이 블록도 «어디까지 갔는지» 를 남깁니다 — `0 18` 과 같은 방식.
           learning-snapshot 을 여기로 옮기면서 함께 넣었습니다. 재지 않는 곳으로 3분 24초짜리
           작업을 옮기면, 고치려던 «조용히 잘리는» 문제를 자리만 바꿔 되살리는 셈입니다.
           ⚠️ markNightlyStep 은 try…catch «밖» 이어야 합니다 — 안에 넣으면 뜻이 뒤집혀
              «그 작업이 에러를 던졌다» 가 되고 정상적인 날엔 기록이 한 줄도 안 남습니다. */
        const _morning = await beginNightlyRun(env as any, '0 0 * * *').catch(() => null);
        try {
          const subUrl = new URL('https://internal.local/api/admin/subscription/cron-check');
          const subReq = new Request(subUrl.toString(), { method: 'POST' });
          const r = await handleMangoApi(subReq, subUrl, env as any);
          console.log('[recurring-billing] cron ran', r?.status);
        } catch (err) {
          console.error('[recurring-billing] error', err);
        }
        await markNightlyStep(env as any, _morning, 'recurring-billing');

        // 📊 경영 브리핑 알림톡 (KST 09:00) — 수신자에게 학생수·매출·비용 발송
        try {
          const briefUrl = new URL('https://internal.local/api/admin/exec/send-briefing');
          const briefReq = new Request(briefUrl.toString(), { method: 'POST' });
          const r = await execRouter(briefReq, env as any);
          console.log('[exec-briefing] cron ran', r?.status);
        } catch (err) {
          console.error('[exec-briefing] error', err);
        }
        await markNightlyStep(env as any, _morning, 'exec-briefing');

        /* 🎓 학습 인사이트 — 당월 위험도 스냅샷 (KST 09:00 · 2026-09-04 에 `0 18` 에서 옮겨옴)
           learning_trend_snapshots 에 당월 코호트 위험도 upsert. 실패해도 무영향.
           ⚠️ 옮긴 이유는 `0 18` 블록의 그 자리 주석에 적혀 있습니다(체인이 15분 상한에 근접).
           ℹ️ 읽는 것은 attendance·students_erp·student_evaluations·voice_coaching 과
              ai_student_analysis·churn-graph 이고(정본 `buildSegments`),
              카페24 동기화(KST 03:00) 6시간 뒤라 같은 날 갱신분을 봅니다.
           ⛔ 이 블록의 순서(billing → briefing → snapshot)를 바꾸지 마세요 — 잘려도
              «돈이 나가는 쪽» 이 아니라 꼬리가 잘리도록 일부러 이렇게 두었습니다.
           ⚠️ period 는 여기서도 KST 로 계산합니다 — 매월 1일에 «당월» 이 되어야 합니다. */
        try {
          const kstNow = new Date(event.scheduledTime + 9 * 3600 * 1000);
          const period = kstNow.toISOString().slice(0, 7);
          const rl = await runLearningSnapshot(env as any, period);
          console.log('[learning-snapshot] cron ran', JSON.stringify(rl));
        } catch (err) {
          console.error('[learning-snapshot] error', err);
        }
        await markNightlyStep(env as any, _morning, 'learning-snapshot');
        await endNightlyRun(env as any, _morning);
      }

      // ── UTC 01:00 + day===1 KST (KST 1일 10:00) — 월간 NPS 자동 발송 (Phase NPS)
      if (cronIs('0 1 * * *')) {
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
      if (cronIs('0 10 * * *')) {
        try {
          await sendDailyStreakPush(env);
        } catch (err) {
          console.error('[daily-streak] error', err);
        }

        // ── 금요일이면 학부모 위클리 다이제스트 (Phase WD) — 실발송은 KV digest:send_all_live=1 일 때만(기본 dry)
        if (kstDay === 5) {
          try {
            const wd = await runWeeklyParentDigestSweep(env as any);
            console.log('[weekly-digest]', JSON.stringify({ live: wd.live, eligible: wd.eligible, sent: wd.sent, failed: wd.failed }));
          } catch (err) {
            console.error('[weekly-digest] error', err);
          }
        }

        // 🧑‍🏫 당일 피드백 미작성 교사 리마인드 (KST 19:00) — 자정 전 작성 유도, 하루 1회 dedup 내장
        try {
          const fr = await runFeedbackReminderSweep(env as any);
          if (fr && (fr.teachers > 0 || !fr.ok)) console.log('[feedback-reminder]', JSON.stringify(fr));
        } catch (err) {
          console.error('[feedback-reminder] error', err);
        }
      }
    })());
  }
};

export default worker;

// 📅 Phase WD — 학부모 주간 리포트는 api-students.ts 의 runWeeklyParentDigestSweep 로 이관(실제 내용 생성+KV 게이트 발송)

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
/* 🗣️ (2026-08-17) 웜업 프롬프트 정비 — 「웜업이 엉뚱한 말을 한다」 제보 후속.
 *   프런트(public/warmup.html)가 실제로 어떻게 동작하는지에 맞춰 규칙을 «명시» 했다. 근거 4가지:
 *
 *   ① speak() 는 서버 TTS 를 `{ lang:'en' }` «고정» 으로 부르고, 서버 TTS 가 실패했을 때의
 *      브라우저 폴백도 영어 보이스만 고른다(_scoreVoice 가 비영어에 -120, en 이 하나도 없으면
 *      아예 재생 포기). 그런데 예전 프롬프트는 처음부터 끝까지 한국어로만 쓰여 있고
 *      «영어로 답하라» 는 문장이 한 줄도 없었다 → 모델이 한국어로 답하는 일이 잦고,
 *      그 한국어를 영어 목소리가 읽어 소리가 뭉개진다.
 *      (CLAUDE.md 2장: "Cloudflare발 구글 TTS(한국어·중국어)는 깨진 음성. 서버 TTS는 영어만 정상")
 *   ② _speechText() 는 괄호 안 내용을 «읽지 않고 버린다». 그래서 한국어 도움말을 괄호에 넣으면
 *      자막에는 보이고 음성은 영어만 나간다 — 그 구조를 그대로 규칙으로 적었다.
 *   ③ renderMsg() 는 escapeHtml 만 한다(마크다운 렌더링 없음) → `**굵게**` 의 별표가 자막에
 *      그대로 보인다. 그래서 평문만 쓰게 했다.
 *   ④ 학생 발화는 «음성인식» 을 거쳐 오므로 깨져서 들어올 수 있다. 그걸 그대로 진지하게 받아
 *      엉뚱한 대답을 만들지 않도록 처리 규칙을 넣었다.
 *
 *   ⚠️ 규칙을 더 넣을 때 위 4가지와 어긋나게 쓰지 말 것. 특히 «괄호 = 자막 전용» 은
 *      _speechText() 의 동작이라, 거기를 고치면 이 프롬프트도 같이 고쳐야 한다.
 *   ⚠️ 프롬프트가 길어진 만큼 매 요청 토큰이 조금 늘어난다(체감 지연은 교재 조회 캐시로 상쇄).
 *      새 규칙은 «실제로 겪은 증상» 이 있을 때만 추가할 것. */
/* 🧑 친구 이름은 학생이 고른다(Emma·Jake·Lily·Noah). 이 프롬프트는 그 이름을 «값» 으로 받는다 —
   예전에는 '망고(Mango)' 로 하드코딩돼 있어서, 화면이 "Hi! I'm Lily." 라고 인사해 놓고
   학생이 이름을 물으면 AI 가 다른 이름을 대는 어긋남이 있었다(2026-08-31 사장님 제보).
   ⛔ 화면이 보낸 문자열을 그대로 끼우지 말 것 — 정본 표(src/ai-friends.ts)를 거친 이름만 넣는다. */
const warmupSystem = (friendName: string) => [
  `너는 망고아이의 AI 대화 친구 '${friendName}' 야. 수업 전에 학생의 입을 풀어 주는 영어 워밍업 상대야. 밝고 장난기 많은 단짝 친구처럼 신나게 리액션해줘.`,
  `[이름] 학생이 이름을 물으면 반드시 '${friendName}' 라고 답해. 다른 이름을 지어내지 마.`,
  "[언어] 네 대사는 반드시 영어로 말해. 한국어가 꼭 필요하면 영어 문장 뒤 «괄호 안» 에만 짧게 덧붙여 — 괄호 안은 음성으로 읽히지 않고 자막에만 보인다. 괄호 밖에 한국어를 쓰면 영어 목소리가 그대로 읽어서 소리가 뭉개진다.",
  "[길이] 한 번에 2문장을 넘기지 마. 그리고 질문은 «한 번에 하나만» 해 — 두세 개를 몰아 묻지 마.",
  "[형식] 사람이 말하듯 평문으로만 써. 마크다운(**, *, #, 목록)·'Mango:' 같은 이름표·(웃으며) 같은 지문은 쓰지 마. 이모지는 1~2개까지.",
  "[칭찬] 학생이 잘 대답하면 크게 기뻐하며 칭찬한 뒤 다음 질문으로 이어가줘. 칭찬 말은 «직전 두 번과 다른 것» 으로 골라 써 — Wow!, Awesome!, Nice one!, That's great!, Yes!, Perfect!, Cool!, You got it!, Well said!, I love that!, Amazing!, Haha nice! 처럼 돌려 쓰고 같은 말을 연달아 반복하지 마.",
  "[막혔을 때] 학생이 'I don't know' 나 '몰라요' 라고 하거나 한국어로만 답하면 그냥 넘어가지 마. ① 학생이 따라 말할 수 있는 짧은 영어 예시 문장을 하나 주고 ② 더 쉬운 질문으로 다시 물어봐.",
  "[영어로 어떻게 말해요?] 학생이 한국어로 '이거 영어로 어떻게 해?' 라고 물으면 자연스러운 영어 문장을 알려주고, 그 문장을 소리 내어 말해 보도록 이끌어줘.",
  "[잘 못 알아들었을 때] 학생의 말은 음성인식을 거쳐 오기 때문에 글자가 깨지거나 엉뚱한 단어로 바뀌어 올 수 있어. 뜻이 통하지 않으면 아무 말이나 지어내지 말고, 문맥상 가장 그럴듯한 뜻으로 받아 주거나 'Sorry, I didn't catch that — can you say it again?' 처럼 «한 번만» 짧게 되물어.",
  "[재미] 가끔 재미있는 방식으로 물어봐 — 'Would you rather ~?' 양자택일, '만약 ~라면?' 상상 질문, 스무고개(Guess what I'm thinking of!), 좋아하는 것 맞히기. 같은 방식을 연속으로 반복하지 말고 대화가 게임처럼 이어지게 해줘.",
  "[주제] 학생 또래가 편하게 말할 수 있는 일상 주제로 이어가. 아래에 오늘의 주제나 교재 정보가 주어지면 그것과 이어지도록 물어봐.",
].join('\n');
const WARMUP_MAX_TURNS = 20;   // 저장할 최근 대화(사용자/AI) 최대 개수
/* 🔴 2026-09-03 — 12(=6턴)에서 20(=10턴)으로 넓혔다. 벨잉글리시 원장님 제보
   「대화가 매끄럽게 이어지지 않는다」의 한 갈래 — 조금만 길어지면 앞 얘기를 잊는다.
   AI 영어친구(ai_friend_chats LIMIT 20)와 «같은 폭» 으로 맞췄다. */
// 📊 대화 난이도 8단계(1 기초 ~ 8 최고) — 프론트 warmup.html 레벨 슬라이더와 1:1 대응.
//    각 단계별 어휘·문법·문장 길이 가이드를 시스템 프롬프트에 주입해 AI가 눈높이를 맞춘다.
/* 🪜 여덟 칸 — 화면 warmup.html 의 LEVEL_CATALOG, 그리고 AI 영어친구
     (src/ai-friend-level.ts 의 AI_FRIEND_LEVELS)와 «같은 눈금» 이다.
     이름·교재 Lv 구간의 정본은 판단력 훈련 judgment-level.ts 의 BAND_SPECS 이고,
     단어 수는 여기가 정본이다 — 세 파일이 같은 말을 해야 한다(하니스가 대조).
     ⛔ 눈금을 «한 칸 밀어» 쉽게 만들려고 하지 마세요. 2026-08-31 에 실제로 그렇게 했다가
        되돌렸습니다 — 저장된 mangoi_warmup_level 이 그대로인 채 «뜻» 만 바뀌어
        레벨 5 학생이 말없이 한 단계 쉬운 대화를 받고, 같은 밴드 이름(중급)을
        판단력 훈련과 웜업이 서로 다른 단어 수로 부르게 됩니다.
        낮은 단계를 쉽게 하는 길은 «길이» 가 아니라 «열린 질문을 없애는 것» 입니다(아래 1·2번).
     ⚠️ 한국어 도움말은 «괄호 안» 이라고 못박는다 — 위 [언어] 규칙과 어긋나면 모델이 괄호 밖에
        한국어를 쓰고, 그걸 영어 TTS 가 읽어 소리가 뭉개진다(레벨 1이 가장 자주 걸리는 자리다). */
const WARMUP_LEVELS: Record<number, string> = {
  1: "레벨 1(첫걸음·A1): 아주 쉬운 기초 단어만 쓰고, 현재시제로 한 번에 3~5단어의 짧은 문장만 말해줘. 질문은 학생이 'Yes.' 'No.' 로 답할 수 있는 것만 해 — wh- 질문이나 'or' 질문은 하지 마. 학생이 어려워하면 더 쉽게 바꿔주고, 한국어 도움말이 필요하면 영어 문장 뒤 괄호 안에 짧게만 덧붙여.",
  2: "레벨 2(기초·A2): 기초 일상 단어, 현재시제 위주로 5~7단어의 짧고 쉬운 문장으로 말해줘. 질문은 Yes/No 이거나, 고를 말이 질문 안에 들어 있는 양자택일로 해줘(학생이 네 말을 그대로 따라 답할 수 있게).",
  3: "레벨 3(초급·A2+): 익숙한 일상 표현과 현재/현재진행 시제로 7~9단어 정도의 문장을 써줘.",
  4: "레벨 4(초중급·B1): 과거시제와 and/but/because 같은 간단한 접속사를 섞어 9~12단어 문장으로 말해줘.",
  5: "레벨 5(중급·B1+): 다양한 시제와 이유·비교 표현을 12~15단어 문장으로 쓰고, 필요하면 두 문장까지 자연스럽게 이어서 말해줘.",
  6: "레벨 6(중고급·B2): 조건·가정·관계절과 쉬운 관용구를 조금씩 섞어 15~18단어 문장으로 자연스럽게 대화해줘.",
  7: "레벨 7(고급·B2+): 원어민이 실제로 쓰는 구동사·연결어·관용표현을 활용해 18~22단어 문장으로 좀 더 깊이 있는 후속 질문을 해줘.",
  8: "레벨 8(최상급·C1): 유창한 원어민 수준으로 관용구·뉘앙스·추상적 주제까지 다루며 도전적인 질문으로 대화를 이끌어줘.",
};


/* 🧯 레벨별 «한 문장 단어 상한» — 무너진 출력 판정(replyIsSane)의 길이 안전망에만 쓴다.
   ⚠️ AI 영어친구(src/ai-friend-level.ts 의 AI_FRIEND_LEVELS S1~S8)와 «같은 눈금» 이다.
      여기서 import 하지 않는 이유는 위 WARMUP_LEVELS 문자열이 이미 그 숫자를 들고 있어서,
      두 곳이 어긋나면 하니스가 문자열에서 읽어 대조하기 때문이다(reply_sanity_harness).
   ⚠️ 이 값은 «버릴 기준» 이 아니다 — replyTooLongFor 가 두 배 + 6낱말로 넉넉히 잡는다.
      문법을 지키다 한두 낱말 넘는 것을 버리면 안 된다(PR #626 「문법이 길이에 진다」). */
const WARMUP_WORD_CAP: Record<number, number> = { 1: 5, 2: 7, 3: 9, 4: 12, 5: 15, 6: 18, 7: 22, 8: 0 };

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
            if (!isEnglishQuestion(q)) continue;   // 중국어·일본어 문항은 영어 웜업 프롬프트에 넣지 않는다
            for (const c of [q.audio_text, q.answer_text, q.target]) {
              const s = String(c || '').trim();
              if (isEnglishText(s) && !sentences.includes(s)) sentences.push(s);
            }
          }
        }
        if (sentences.length >= 4) break;   // 교재 매칭에서 충분히 얻었으면 레벨 폴백 생략
      }
    }
  } catch {}
  return { textbook, level, lesson_no: lessonNo, student_name: studentName, sentences: sentences.slice(0, 8) };
}

/* 🚀 (2026-08-17) 위 조회의 세션당 1회 + KV 30분 캐시 래퍼.
 *   [왜] handleWarmupChat 은 학생이 «한 마디 할 때마다» warmupLessonContext() 를 불렀고,
 *        그 안에서 D1 을 최대 3번(students_erp 1 + review_quizzes 2) «순차» 조회한다.
 *        오늘 배울 교재·문장은 대화 중에 바뀌지 않는데도 매 발화마다 다시 물어본 것이라,
 *        모델을 부르기도 전에 그 왕복 지연이 매번 그대로 얹혔다
 *        (2026-08-17 사장님 제보 「반응이 테스트보다 느리다」의 서버 쪽 몫).
 *   [방식] 바로 아래 getWeakSentences(Neo4j)가 이미 쓰는 것과 «똑같은» 패턴 —
 *        SESSION_STATE 에 30분. 새 규칙을 만들지 않는다.
 *   ⚠️ 캐시 키에 입력값(user/textbook/level/lesson)을 함께 넣는다. ?textbook 을 바꿔 다시
 *      들어온 같은 세션에 옛 교재를 물려주면 그거야말로 «엉뚱한 말» 이 된다.
 *   ⚠️ 결과가 비어도(교재 미배정 학생) 그대로 캐시한다 — 오히려 그 경우가 D1 3번을
 *      «다» 도는 가장 느린 경로다. 캐시에서 빼면 제일 느린 쪽만 안 고쳐진다.
 *   ⚠️ KV 장애·미바인딩이면 조용히 원래대로(직접 조회) 동작한다 — 웜업이 멈추면 안 된다. */
type WarmupLessonCtx = Awaited<ReturnType<typeof warmupLessonContext>>;
async function warmupLessonContextCached(
  env: Env,
  sessionId: string,
  o: { userId?: string; textbook?: string; level?: string; lessonNo?: number | null },
): Promise<WarmupLessonCtx> {
  const sig = [o.userId || '', o.textbook || '', o.level || '', o.lessonNo || 0].join('|');
  const ckey = 'warmupctx:' + String(sessionId || 'noses').slice(0, 120) + ':' + sig.slice(0, 260);
  if (env.SESSION_STATE) {
    try {
      const raw = await env.SESSION_STATE.get(ckey);
      if (raw != null) return JSON.parse(raw) as WarmupLessonCtx;
    } catch {}
  }
  const lc = await warmupLessonContext(env, o);
  try { if (env.SESSION_STATE) await env.SESSION_STATE.put(ckey, JSON.stringify(lc), { expirationTtl: 1800 }); } catch {}
  return lc;
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
    // 📊 세션 시작 기록 — 설정 화면을 «닫은 뒤» 오는 호출이라 여기 diff/age 가 학생이 고른 값이다.
    //    이 한 줄이 「낮은 단계 학생이 실제로 몇 단계로 쓰는가」와 「입을 뗐는가」의 분모다.
    //    실패는 조용히 삼킨다(src/warmup-log.ts) — 기록 때문에 웜업이 멈추면 안 된다.
    await logWarmupSessionStart(env, {
      sessionId: (u.searchParams.get('session_id') || '').trim(),
      userId,
      difficulty: parseInt(u.searchParams.get('diff') || '0', 10),
      ageGroup: normalizeWarmupAge(u.searchParams.get('age')),
      textbook: ctx.textbook,
      level: ctx.level,
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
      /* 여기가 「cāochǎng 이 영어 게임에 섞이던」 자리다 — 옛 판정 `/[a-zA-Z]/` 는
         「라틴 글자가 한 자라도 있으면 영어」라 병음을 그대로 통과시켰다.
         ⛔ 낱말 수 하한으로 풀지 말 것 — 영어 정답이 한 낱말인 문항이 많다(BTS 2 → 'red'). */
      if (!isEnglishText(s, 90)) return;
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
        /* ⚠️ 레벨 폴백에는 «교재에 안 묶인» 문제은행만 쓴다 — 웜업(warmupLessonContext)과 같은 조건.
           [왜] review_quizzes 는 영어 전용 표가 아니다. 이 조건이 없으면 「그 레벨의 아무 교재나」가
                걸려서, 예컨대 level='Lv 3' 인 활성 퀴즈는 2026-08-26 실측 기준 «전부 중국어 교재
                「다락원」» 이라 영어 게임이 순수 병음만 받게 된다(위 게이트가 막지만, 애초에
                엉뚱한 교재를 긁어 오는 것 자체가 틀렸다).
           ⚠️ 그래서 이 폴백은 «교재 없는 공용 문제은행» 이 생기기 전까지 항상 0건이다
              (실측: 활성 퀴즈 29건이 전부 교재가 붙어 있어 «교재 없음» 0건). 웜업도 같은 상태다.
              0건이면 게임은 내장 기본 어휘로 폴백한다 — 조용히 잘못된 교재를 주는 것보다 낫다.
           ⛔ 「그래도 뭐라도 주자」고 이 조건을 빼지 말 것. 2026-08-26 사장님 지시로 맞춘 것이다. */
        if (level) tries.push({ sql: `SELECT questions FROM review_quizzes WHERE active=1 AND LOWER(level)=LOWER(?) AND (textbook IS NULL OR textbook='') ORDER BY id DESC LIMIT 4`, binds: [level] });
        for (const t of tries) {
          const rs = await env.DB.prepare(t.sql).bind(...t.binds).all();
          for (const row of (((rs.results as any[]) || []))) {
            let qs: any[] = []; try { qs = JSON.parse((row as any).questions) || []; } catch {}
            for (const q of qs) {
              if (!isEnglishQuestion(q)) continue;   // 중국어·일본어 문항은 통째로 건너뛴다
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
          // 단어장에 병음·한자를 적어 둔 학생이 있어도 «영어» 게임에는 내보내지 않는다
          if (!ko || !isEnglishText(en, 30)) continue;
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
 *  📚 진도(레슨) 순차 — GET /api/games/lessons?glang=en|zh&textbook=&level=&user_id=
 *  교재의 레슨(lesson_no)별 문장을 '순서대로' 묶어 반환 → 게임에서 ◀복습/▶예습 이동.
 *  zh=zh_vocab(다락원 등 실제 교재), en=review_quizzes. 학생 user_id 주면 배정 교재 자동사용.
 *  응답: { ok, glang, textbook, level, assigned, textbooks:[교재명…], lessons:[{lesson_no,count,sentences:[{en,ko,pinyin?,words}]}] }
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesLessons(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const glang = ((u.searchParams.get('glang') || 'en').trim() === 'zh') ? 'zh' : 'en';
    const userId = (u.searchParams.get('user_id') || '').trim();
    const wantCourse = (u.searchParams.get('course') || '').trim();
    let level = (u.searchParams.get('level') || '').trim();
    let myTextbook = '';
    if (userId) {
      try {
        const s: any = await env.DB.prepare(`SELECT level, textbook FROM students_erp WHERE user_id = ? LIMIT 1`).bind(userId).first();
        if (s) { if (s.textbook) myTextbook = String(s.textbook).trim(); if (!level && s.level) level = String(s.level).trim(); }
      } catch {}
    }
    // 교재명 파싱: "BTS 1 001 (Welcome to school)" → {course:'BTS 1', seq:1, title:'Welcome to school'} / "004. 제목" → {course:'기타 교재', seq:4}
    function parseEn(tb: string): { course: string; seq: number; title: string; key: string } {
      const s = String(tb || '').trim();
      let m = s.match(/^(.*\S)\s+0*(\d{1,4})\s*(?:[（(]([^)）]*)[)）])?\s*$/);
      if (m && /[A-Za-z가-힣]/.test(m[1])) return { course: m[1].trim(), seq: parseInt(m[2], 10) || 0, title: (m[3] || '').trim(), key: s };
      const n = s.match(/^0*(\d{1,4})[.)\s]+(.*)$/);
      if (n) return { course: '기타 교재', seq: parseInt(n[1], 10) || 0, title: n[2].trim(), key: s };
      return { course: s, seq: 0, title: '', key: s };
    }

    /* 영어 코스 목록에서 «중국어 교재» 를 빼기 위한 이름표.
       [왜] 아래 코스 목록은 review_quizzes 를 통째로 훑는데 그 표에는 중국어 교재
            「다락원」이 함께 들어 있다(그 표는 영어 전용이 아니다). 그래서 영어 게임의
            코스 고르기에 중국어 교재가 한 칸 섞여 나오고, 골라도 레슨이 0개다 —
            그 교재에서 라틴 글자로 된 값은 전부 «한 낱말 병음» 이라 아래 w.length<2 에
            걸린다(2026-08-26 D1 실측: 활성 문항 178개 중 라틴 글자 14개, 두 낱말 이상 0개).
       ⚠️ count 는 «퀴즈 건수» 가 아니라 «그 코스로 묶이는 distinct textbook 문자열 수» 다
            (아래 cc.count = cc.keys.length). 다락원은 문자열이 하나라 count=1 이고,
            같은 날 실측 기준 1위는 BTS 1(001~008 = 8)이라 «기본 코스» 가 되지는 않았다.
            ⛔ 이 줄을 「기본 코스가 다락원이었다」로 되돌리지 말 것 — 한 번 그렇게 적었다가
               정정했다. 심각도를 부풀리면 다음 사람이 엉뚱한 것을 고친다.
       [판정] 「zh_vocab 에 있는 교재 = 중국어 코스」 — 중국어 게임이 이미 그 표를
            정본으로 쓰고 있어서(/api/games/zh-vocab · zh-passage · 아래 glang==='zh' 갈래)
            새 규칙을 만들지 않아도 된다.
       ⚠️ active=1 을 «일부러» 안 건다 — 여기서 하는 일은 «빼기» 라, 비활성 중국어 교재까지
          넓게 잡는 쪽이 안전하다(좁게 잡으면 중국어가 영어 목록으로 새어 든다).
       ⚠️ 실패해도 영어 목록이 멈추면 안 된다 — 표가 없으면 빈 집합으로 두고 그냥 진행한다. */
    const zhCourses = new Set<string>();
    if (glang !== 'zh') {
      try {
        const zr = await env.DB.prepare(`SELECT DISTINCT textbook FROM zh_vocab WHERE textbook IS NOT NULL AND textbook != '' LIMIT 200`).all();
        for (const r of (((zr.results as any[]) || []))) {
          const t = String((r as any).textbook || '').trim().toLowerCase();
          if (t) zhCourses.add(t);
        }
      } catch {}
    }

    // ── 코스(교재) 목록 ──
    const courseMap = new Map<string, { course: string; count: number; keys: Array<{ key: string; seq: number; title: string }> }>();
    try {
      if (glang === 'zh') {
        const rs = await env.DB.prepare(`SELECT textbook, COUNT(DISTINCT lesson_no) c FROM zh_vocab WHERE active=1 AND type='sentence' AND textbook IS NOT NULL AND textbook!='' GROUP BY textbook ORDER BY c DESC LIMIT 50`).all();
        for (const r of (((rs.results as any[]) || []))) { const t = String((r as any).textbook || '').trim(); if (t) courseMap.set(t, { course: t, count: Number((r as any).c) || 0, keys: [] }); }
      } else {
        const rs = await env.DB.prepare(`SELECT textbook FROM review_quizzes WHERE active=1 AND textbook IS NOT NULL AND textbook!='' GROUP BY textbook ORDER BY textbook ASC LIMIT 500`).all();
        for (const r of (((rs.results as any[]) || []))) {
          const rawTb = String((r as any).textbook || '').trim();
          const p = parseEn(rawTb); if (!p.key) continue;
          /* 중국어 교재는 영어 코스 목록에서 뺀다. 원문과 «파싱된 코스명» 을 둘 다 본다 —
             정확일치만 보면 나중에 중국어 퀴즈가 「다락원 001」처럼 과 번호를 달고 들어오는
             순간 에러 없이 필터가 통째로 헛돈다(CLAUDE.md 「헬퍼에 행을 넘겼는데 아무 일도
             안 일어남」과 같은 모양). */
          if (zhCourses.has(rawTb.toLowerCase()) || zhCourses.has(p.course.trim().toLowerCase())) continue;
          if (!courseMap.has(p.course)) courseMap.set(p.course, { course: p.course, count: 0, keys: [] });
          const cc = courseMap.get(p.course)!; cc.keys.push({ key: p.key, seq: p.seq, title: p.title }); cc.count = cc.keys.length;
        }
        for (const cc of courseMap.values()) cc.keys.sort((a, b) => a.seq - b.seq);
      }
    } catch {}
    const courses = [...courseMap.values()].map((c) => ({ course: c.course, count: c.count })).sort((a, b) => b.count - a.count).slice(0, 80);

    const myCourse = glang === 'zh' ? myTextbook : (myTextbook ? parseEn(myTextbook).course : '');
    let course = wantCourse;
    if (!course) { if (myCourse && courseMap.has(myCourse)) course = myCourse; else if (courses.length) course = courses[0].course; }

    // ── 선택 코스의 레슨(과)별 문장 + 단어 ──
    const lessons: Array<any> = [];
    if (course && courseMap.has(course)) {
      if (glang === 'zh') {
        const conds = ['active=1', 'LOWER(textbook)=LOWER(?)']; const binds: any[] = [course];
        if (level) { conds.push('LOWER(level)=LOWER(?)'); binds.push(level); }
        const rs = await env.DB.prepare(`SELECT lesson_no, type, hanzi, pinyin, ko, words FROM zh_vocab WHERE ${conds.join(' AND ')} ORDER BY lesson_no ASC, id ASC LIMIT 1500`).bind(...binds).all();
        const lm = new Map<number, { sentences: any[]; words: any[] }>();
        for (const r of (((rs.results as any[]) || []))) {
          const ln = parseInt((r as any).lesson_no, 10) || 0; const hz = String((r as any).hanzi || '').trim(); if (!hz) continue;
          if (!lm.has(ln)) lm.set(ln, { sentences: [], words: [] }); const L = lm.get(ln)!;
          if ((r as any).type === 'sentence') {
            let ws: string[] = []; try { ws = JSON.parse((r as any).words || '[]') || []; } catch {}
            const cjk = (hz.match(/[㐀-鿿]/g) || []); if (cjk.length && ws.join('') !== cjk.join('')) ws = cjk;
            if (ws.length >= 2 && L.sentences.length < 8) L.sentences.push({ en: hz, ko: String((r as any).ko || '').trim(), pinyin: String((r as any).pinyin || '').trim(), words: ws });
          } else if (L.words.length < 24) L.words.push({ en: hz, pinyin: String((r as any).pinyin || '').trim(), ko: String((r as any).ko || '').trim() });
        }
        [...lm.entries()].filter(([, v]) => v.sentences.length > 0).sort((a, b) => a[0] - b[0]).forEach(([ln, v]) => lessons.push({ seq: ln, title: '', key: course + ' · ' + ln, sentences: v.sentences, words: v.words }));
      } else {
        const keys = courseMap.get(course)!.keys.slice(0, 50);
        const byKey = new Map<string, any[]>();
        if (keys.length) {
          const ph = keys.map(() => '?').join(',');
          const rs = await env.DB.prepare(`SELECT textbook, questions FROM review_quizzes WHERE active=1 AND textbook IN (${ph}) LIMIT 400`).bind(...keys.map((k) => k.key)).all();
          for (const r of (((rs.results as any[]) || []))) { const tb = String((r as any).textbook || '').trim(); if (!byKey.has(tb)) byKey.set(tb, []); byKey.get(tb)!.push(r); }
        }
        for (const k of keys) {
          const rows = byKey.get(k.key) || []; const sents: any[] = []; const seen = new Set<string>(); const words: any[] = []; const wseen = new Set<string>();
          for (const r of rows) {
            let qs: any[] = []; try { qs = JSON.parse((r as any).questions) || []; } catch {}
            for (const q of qs) {
              if (!isEnglishQuestion(q)) continue;   // 중국어·일본어 문항은 통째로 건너뛴다
              const en = String(q?.answer_text || q?.audio_text || q?.target || '').trim();
              if (!isEnglishText(en, 90)) continue;
              const t = String(q?.q || ''); const ci = Math.max(t.lastIndexOf(':'), t.lastIndexOf('：')); const tail = ci >= 0 ? t.slice(ci + 1).trim() : '';
              const ko = (/[가-힣]/.test(tail) && tail.length >= 2 && tail.length <= 60) ? tail : '';
              const w = en.replace(/[.,!?;:"]/g, '').split(/\s+/).filter(Boolean); if (w.length < 2) continue;
              const kk = en.toLowerCase(); if (!seen.has(kk) && sents.length < 8) { seen.add(kk); sents.push({ en, ko, words: w }); }
              for (const tok of w) { const lw = tok.toLowerCase(); if (lw.length >= 2 && !wseen.has(lw) && words.length < 24) { wseen.add(lw); words.push({ en: tok }); } }
            }
          }
          if (sents.length > 0) lessons.push({ seq: k.seq, title: k.title, key: k.key, sentences: sents, words });
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, glang, myCourse, course, courses, lessons }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  📖 중국어 독해 문단 — GET /api/games/zh-passage?textbook=&level=&lesson=
 *  다락원 교재 각 과의 읽기(读&说) 문단을 게임(독해 탐정)이 쓰는 형태로 반환.
 *  zh_passage: 문단 원문 + 문장 분절(병음·뜻) + 이해질문(3지선다) + 요약 핵심단어.
 *  응답: { ok, passages:[{lesson,title_zh,title_ko,page,hz,ko,sentences[],questions[],keywords[]}] }
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesZhPassage(request: Request, env: Env): Promise<Response> {
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
        `SELECT lesson_no, title_zh, title_ko, page, hanzi, ko, sentences, questions, keywords FROM zh_passage WHERE ${conds.join(' AND ')} ORDER BY lesson_no ASC LIMIT 40`
      ).bind(...binds).all();
      rows = (rs.results as any[]) || [];
    } catch { rows = []; }
    const passages: any[] = [];
    for (const r of rows) {
      const hz = String(r.hanzi || '').trim(); if (!hz) continue;
      let sentences: any[] = []; let questions: any[] = []; let keywords: any[] = [];
      try { sentences = JSON.parse(r.sentences || '[]') || []; } catch {}
      try { questions = JSON.parse(r.questions || '[]') || []; } catch {}
      try { keywords = JSON.parse(r.keywords || '[]') || []; } catch {}
      // 🛡️ 안전장치(zh_vocab words 깨짐 사고 재발방지): 문장 분절을 이어붙이면 원문과
      //   정확히 일치해야 한다. 불일치하면 원문을 구두점 기준으로 재분절해 항상
      //   "깨지지 않은 문단"이 화면에 나가도록 강제 복구한다(병음·뜻은 비워짐).
      const joined = sentences.map((s: any) => String(s?.hz || '')).join('');
      if (joined !== hz) {
        const parts = hz.match(/[^。？！]+[。？！]?/g) || [hz];
        sentences = parts.map((p: string) => ({ hz: p, py: '', ko: '' }));
      }
      if (sentences.length < 2) continue;
      passages.push({
        lesson: Number(r.lesson_no) || 0,
        title_zh: String(r.title_zh || ''), title_ko: String(r.title_ko || ''),
        page: Number(r.page) || 0,
        hz, ko: String(r.ko || ''),
        sentences, questions, keywords,
      });
    }
    return new Response(JSON.stringify({ ok: true, textbook, level, passages }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  📖 게임 단어 뜻 — GET /api/games/define?word=&lang=en|zh&sent=
 *  문장 벽돌 등에서 단어 브릭을 눌렀을 때 보여줄 한국어 뜻(+중국어 병음).
 *  ① D1 캐시(game_word_defs) → ② 어휘은행(zh_vocab/en_vocab) → ③ Workers AI 폴백 후 캐시.
 *  단어 1개만 허용(문장 통번역 남용 방지) — sent 는 다의어 구분용 예문 힌트.
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesDefine(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const raw = (u.searchParams.get('word') || '').trim();
    const lang = (u.searchParams.get('lang') === 'zh') ? 'zh' : 'en';
    const sent = (u.searchParams.get('sent') || '').trim().slice(0, 160);
    const okWord = lang === 'zh' ? /^[㐀-鿿]{1,6}$/.test(raw) : /^[A-Za-z][A-Za-z']{0,23}$/.test(raw);
    if (!raw || !okWord) {
      return new Response(JSON.stringify({ ok: false, error: 'bad_word' }), { status: 400, headers: _MS_JSON });
    }
    const word = lang === 'en' ? raw.toLowerCase() : raw;
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS game_word_defs (id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT NOT NULL, word TEXT NOT NULL, ko TEXT, pinyin TEXT, updated_at INTEGER, UNIQUE(lang, word));`);
    // ① D1 캐시
    try {
      const c: any = await env.DB.prepare(`SELECT ko, pinyin FROM game_word_defs WHERE lang=? AND word=?`).bind(lang, word).first();
      if (c && c.ko) return new Response(JSON.stringify({ ok: true, word: raw, ko: c.ko, pinyin: c.pinyin || '' }), { status: 200, headers: _MS_JSON });
    } catch {}
    // ② 어휘은행(교재 추출 데이터) — 단어 항목 우선
    let ko = '', pinyin = '';
    try {
      if (lang === 'zh') {
        const r: any = await env.DB.prepare(`SELECT ko, pinyin FROM zh_vocab WHERE hanzi=? AND ko!='' ORDER BY (type='word') DESC LIMIT 1`).bind(word).first();
        if (r && r.ko) { ko = String(r.ko); pinyin = String(r.pinyin || ''); }
      } else {
        const r: any = await env.DB.prepare(`SELECT ko FROM en_vocab WHERE LOWER(en)=? AND ko!='' ORDER BY (type='word') DESC LIMIT 1`).bind(word).first();
        if (r && r.ko) ko = String(r.ko);
      }
    } catch {}
    // ③ Workers AI 폴백 — 짧은 뜻만 JSON 한 줄 (모델이 형식을 어겨도 평문 첫 줄로 구제)
    if (!ko) {
      try {
        const prompt = lang === 'zh'
          ? `중국어 단어 "${raw}"${sent ? ` (예문: "${sent}")` : ''}의 초등학생용 짧은 한국어 뜻과 병음. JSON 한 줄로만 답해: {"ko":"뜻","pinyin":"병음"}`
          : `영어 단어 "${raw}"${sent ? ` (예문: "${sent}")` : ''}의 초등학생용 짧은 한국어 뜻. JSON 한 줄로만 답해: {"ko":"뜻"}`;
        const r: any = await env.AI.run(WARMUP_MODEL, { messages: [
          { role: 'system', content: '너는 단어 사전이다. 반드시 JSON 한 줄로만 답한다. 설명이나 다른 말은 금지.' },
          { role: 'user', content: prompt },
        ], max_tokens: 100, temperature: 0.1 });
        // ⚠️ 모델이 순수 JSON 을 내면 Workers AI 가 response 를 '객체'로 줄 때가 있다(String() 금지)
        const rr: any = r && (r.response ?? r.result);
        // 값이 중첩 객체("ko":{"뜻":...})로 오는 경우까지 문자열만 안전 추출
        const pickStr = (v: any): string => {
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ');
          if (v && typeof v === 'object') return Object.values(v).filter((x) => typeof x === 'string').join(', ');
          return '';
        };
        let j: any = null;
        if (rr && typeof rr === 'object') {
          j = rr;
        } else {
          const txt = String(rr || '').trim();
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) { try { j = JSON.parse(m[0]); } catch {} }
          if (!j && txt && !txt.includes('{')) {
            ko = txt.split('\n')[0].replace(/^["'\s]+|["'\s.]+$/g, '').slice(0, 60);
          }
        }
        if (j) {
          ko = pickStr(j.ko).trim().slice(0, 60);
          if (lang === 'zh' && !pinyin) pinyin = pickStr(j.pinyin).trim().slice(0, 60);
        }
        if (/\[object/i.test(ko)) ko = '';   // 최종 방어
        // 한글 뜻에 섞여 든 다른 언어(한자·가나) 제거 — 다의어에서 모델이 中/日 번역을 덧붙이는 것 방지
        if (ko) {
          ko = ko.replace(/[぀-ヿ㐀-䶿一-鿿豈-﫿]/g, '')
                 .replace(/\s*[,，、/·]\s*/g, ', ')
                 .replace(/(^[\s,，、/·.]+)|([\s,，、/·]+$)/g, '')
                 .replace(/,\s*,/g, ',').replace(/,\s*$/,'').trim().slice(0, 60);
        }
      } catch {}
    }
    if (!ko) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 200, headers: _MS_JSON });
    try {
      await env.DB.prepare(`INSERT INTO game_word_defs (lang, word, ko, pinyin, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(lang, word) DO UPDATE SET ko=excluded.ko, pinyin=excluded.pinyin, updated_at=excluded.updated_at`)
        .bind(lang, word, ko, pinyin, Date.now()).run();
    } catch {}
    return new Response(JSON.stringify({ ok: true, word: raw, ko, pinyin }), { status: 200, headers: _MS_JSON });
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
    // 🎮 (2026-08-08) 어느 게임에서 온 기록인지 — 이 칸이 없어서 게임 8종이 한 표에 섞여 있었다.
    //    옛 클라이언트는 game 을 안 보낸다 → '' 로 남고 분석 화면이 «(계측 이전)» 으로 구분해 준다.
    const { ensureGameTables, normalizeGameId } = await import('./game-insights');
    const game = normalizeGameId(body?.game, '');
    await ensureGameTables(env);
    const now = Date.now();
    const stmt = env.DB.prepare(
      `INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, last_seen, updated_at, game)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lang, item) DO UPDATE SET
         wrong_count = wrong_count + excluded.wrong_count,
         correct_count = correct_count + excluded.correct_count,
         ko = COALESCE(NULLIF(excluded.ko,''), ko),
         game = COALESCE(NULLIF(excluded.game,''), game),
         last_seen = excluded.last_seen, updated_at = excluded.updated_at`
    );
    const batch: any[] = [];
    for (const e of events) {
      const item = String(e?.item || '').trim().slice(0, 200); if (!item) continue;
      const ko = String(e?.ko || '').trim().slice(0, 200);
      const correct = e?.correct ? 1 : 0;
      batch.push(stmt.bind(userId, lang, item, ko, correct ? 0 : 1, correct, now, now, game));
    }
    if (batch.length) await env.DB.batch(batch);
    return new Response(JSON.stringify({ ok: true, saved: batch.length }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}
// 📊 UX 사용률 집계 — (day, key, uid) 단위 UPSERT. 기능 정리·홈 개편은 감이 아니라 이 데이터로 결정한다.
//    uid 는 자기신고 값(인증 없음) — 통계 용도로만 쓰고 개인 판단에 사용 금지. 실패해도 학습 흐름에 영향 없어야 한다.
async function handleUxTrack(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const uid = (String(body?.user_id || '').trim().slice(0, 100)) || 'guest';
    const events: any[] = Array.isArray(body?.events) ? body.events.slice(0, 50) : [];
    if (!events.length) return new Response(JSON.stringify({ ok: false, error: 'missing' }), { status: 400, headers: _MS_JSON });
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS ux_events (day TEXT NOT NULL, key TEXT NOT NULL, uid TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key, uid))`);
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 기준 날짜
    const stmt = env.DB.prepare(
      `INSERT INTO ux_events (day, key, uid, hits) VALUES (?, ?, ?, ?)
       ON CONFLICT(day, key, uid) DO UPDATE SET hits = hits + excluded.hits`
    );
    const agg = new Map<string, number>();
    for (const e of events) {
      const k = String((e && (e.k ?? e)) || '').trim().slice(0, 80).replace(/[^0-9A-Za-z:._\-\/가-힣]/g, '');
      if (!k) continue;
      const n = Math.min(20, Math.max(1, Number(e?.n) || 1));
      agg.set(k, (agg.get(k) || 0) + n);
    }
    const batch: any[] = [];
    agg.forEach((n, k) => batch.push(stmt.bind(day, k, uid, n)));
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
    // 🎮 (2026-08-08) 발음 기록에도 게임 이름을 남긴다 — 「어느 게임에서 따라말하기를 하나」.
    const { ensureGameTables: _ensureGT, normalizeGameId: _normGid } = await import('./game-insights');
    const game = _normGid(body?.game, '');
    await _ensureGT(env);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, pron_best, pron_last, pron_count, last_seen, updated_at, game)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, 1, ?, ?, ?)
       ON CONFLICT(user_id, lang, item) DO UPDATE SET
         pron_best = MAX(pron_best, excluded.pron_best),
         pron_last = excluded.pron_last,
         pron_count = pron_count + 1,
         ko = COALESCE(NULLIF(excluded.ko,''), ko),
         game = COALESCE(NULLIF(excluded.game,''), game),
         last_seen = excluded.last_seen, updated_at = excluded.updated_at`
    ).bind(userId, lang, item, ko, score, score, now, now, game).run();
    return new Response(JSON.stringify({ ok: true, score }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ════════════════════════════════════════════════════════════════════════
 *  🎯 학생 맞춤 추천(피드백 루프) — GET /api/games/recommend?user_id=&lang=
 *  · 룰 기반(AI 무호출·무비용): game_progress(정오답+발음) + voice_coaching(스피치코치)
 *    최근 기록을 집계해 상태 진단 → 다음에 뭘 연습하면 좋을지 추천.
 *  · 진단 규칙: 정답률/발음 80 미만 = 보완 필요, 90 이상 = 우수 (예: MangoiFeedbackLoop 설계)
 *  · 응답 focus: pronunciation(발음 연습) | weak_words(취약 단어 복습) | advanced(심화) | keep_going
 *  · KV(SESSION_STATE) 10분 캐시 — 게임 허브 진입마다 D1 집계 방지. 실패 시 조용히 no_data.
 * ════════════════════════════════════════════════════════════════════════ */
async function handleGamesRecommend(request: Request, env: Env): Promise<Response> {
  try {
    const u = new URL(request.url);
    const userId = String(u.searchParams.get('user_id') || '').trim().slice(0, 100);
    const lang = (String(u.searchParams.get('lang') || 'en').toLowerCase() === 'zh') ? 'zh' : 'en';
    if (!userId) return new Response(JSON.stringify({ ok: false, error: 'user_id_required' }), { status: 400, headers: _MS_JSON });

    // 10분 KV 캐시 (게임을 하고 오면 다음 캐시 만료 때 자연 갱신)
    const ckey = 'gamerec:' + userId + ':' + lang;
    try {
      const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(ckey) : null;
      if (raw != null) return new Response(raw, { status: 200, headers: _MS_JSON });
    } catch {}

    await _ensureGameProgressTable(env);
    const since = Date.now() - 30 * 24 * 3600 * 1000;   // 최근 30일

    // ① 게임 정오답 합계 + 게임 내 따라말하기 발음 평균
    const agg: any = await env.DB.prepare(
      `SELECT SUM(correct_count) AS c, SUM(wrong_count) AS w,
              AVG(CASE WHEN pron_count > 0 THEN pron_last END) AS p
         FROM game_progress WHERE user_id = ? AND lang = ? AND last_seen >= ?`
    ).bind(userId, lang, since).first();
    const correct = Number(agg?.c || 0), wrong = Number(agg?.w || 0);
    const attempts = correct + wrong;
    const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : null;
    const gamePron = (agg?.p != null) ? Math.round(Number(agg.p)) : null;

    // ② 스피치코치 최근 10회 발음/정확도 평균 (테이블 없거나 기록 없으면 조용히 무시)
    let coachPron: number | null = null;
    try {
      const vc: any = await env.DB.prepare(
        `SELECT AVG(pronunciation_score) AS p, AVG(accuracy_score) AS a FROM (
           SELECT pronunciation_score, accuracy_score FROM voice_coaching
           WHERE student_uid = ? ORDER BY created_at DESC LIMIT 10)`
      ).bind(userId).first();
      if (vc && vc.p != null) coachPron = Math.round((Number(vc.p) + Number(vc.a || vc.p)) / 2);
    } catch {}
    const pronVals = [gamePron, coachPron].filter((v): v is number => v != null);
    const pron = pronVals.length ? Math.round(pronVals.reduce((s, v) => s + v, 0) / pronVals.length) : null;

    // ③ 취약 단어 상위 5 (handleGamesWeak 과 동일 기준)
    const wrs = await env.DB.prepare(
      `SELECT item, ko, wrong_count, correct_count FROM game_progress
       WHERE user_id = ? AND lang = ? AND wrong_count > 0 AND wrong_count >= correct_count
       ORDER BY wrong_count DESC, (wrong_count - correct_count) DESC LIMIT 5`
    ).bind(userId, lang).all();
    const weak = ((wrs.results as any[]) || []).map((r) => ({ item: r.item, ko: r.ko || '', wrong: r.wrong_count || 0, correct: r.correct_count || 0 }));

    // ④ 진단 → 추천 (룰 기반: <80 보완 필요 · ≥90 우수)
    let status: string, focus: string;
    if (attempts < 8 && pron == null) {
      status = 'no_data'; focus = 'start';
    } else if ((accuracy != null && accuracy < 80) || (pron != null && pron < 80)) {
      status = 'needs_improvement';
      focus = (pron != null && pron < 80 && (accuracy == null || pron <= accuracy)) ? 'pronunciation' : 'weak_words';
    } else if ((accuracy == null || accuracy >= 90) && (pron == null || pron >= 90)) {
      status = 'excellent'; focus = 'advanced';
    } else {
      status = 'good'; focus = weak.length >= 3 ? 'weak_words' : 'keep_going';
    }

    // ⑤ 친근한 안내 문구 (한/영 — 프론트가 사이트 언어에 맞춰 선택)
    const MSG: Record<string, [string, string]> = {
      start:         ['게임을 몇 판 하면 나에게 딱 맞는 연습을 추천해 드려요! 🌱', 'Play a few games and I\'ll recommend the perfect practice for you! 🌱'],
      pronunciation: ['발음을 조금만 더 연습하면 훨씬 좋아져요! 말하기 게임 어때요? 🎤', 'A little more pronunciation practice will make a big difference! Try a speaking game? 🎤'],
      weak_words:    ['어려웠던 단어들을 게임으로 다시 만나 볼까요? 💪', 'Shall we meet those tricky words again in a game? 💪'],
      keep_going:    ['잘하고 있어요! 지금처럼 꾸준히 연습해요 ✨', 'You\'re doing great! Keep up the steady practice ✨'],
      advanced:      ['최고예요! 이제 더 어려운 도전을 해 볼까요? 🏆', 'Amazing! Ready for a harder challenge? 🏆'],
    };
    const m = MSG[focus] || MSG.keep_going;

    /* ⑥ 🎫 레벨테스트 «통과» 여부 — 게임 허브의 단계별 해금을 한 번에 여는 두 번째 열쇠
       ────────────────────────────────────────────────────────────────
       왜 여기에 얹었나: 게임 허브(student-games.html)는 이미 이 응답 하나를 받아
         잠금 판정(_questApplyServer)에 쓰고 있다. 새 엔드포인트를 만들면 라우팅·인증
         게이트에 또 등록해야 하고(CLAUDE.md 2장 «새 API 추가»), 허브가 요청을 한 번 더
         보낸다. 같은 학생·같은 캐시(10분)에 실어 보내는 편이 실수할 자리가 적다.
       판정 근거: 상담·예약 단계가 아니라 **결과가 확정된 것**만 통과로 본다.
         · final_level 이 채워졌다 = 강사·본사가 레벨을 확정했다(관리자 화면의 «결과 확정»).
         · status='done' = 레벨테스트 일정이 끝난 것으로 표시됐다.
       ⛔ status='confirmed'(일정만 잡힘)를 통과로 세지 말 것 — 신청만 하고 안 본 학생까지
          게임이 전부 열린다. 그러면 「레벨테스트로 바로 열기」가 «신청 버튼»이 되어 버린다.
       표가 없는 계정(레벨테스트를 아예 안 만든 환경)에서는 조용히 false 로 둔다. */
    let leveltestPassed = false;
    let leveltestLevel: string | null = null;
    try {
      const lt: any = await env.DB.prepare(
        `SELECT final_level, status FROM leveltest_applications
          WHERE student_uid = ?
            AND ( (final_level IS NOT NULL AND TRIM(final_level) <> '') OR status = 'done' )
          ORDER BY updated_at DESC LIMIT 1`
      ).bind(userId).first();
      if (lt) {
        leveltestPassed = true;
        const lv = String(lt.final_level || '').trim();
        leveltestLevel = lv || null;
      }
    } catch {}

    const out = JSON.stringify({ ok: true, lang, status, focus, accuracy, pron, attempts, weak, message_ko: m[0], message_en: m[1], leveltest_passed: leveltestPassed, leveltest_level: leveltestLevel });
    try { if (env.SESSION_STATE) await env.SESSION_STATE.put(ckey, out, { expirationTtl: 600 }); } catch {}
    return new Response(out, { status: 200, headers: _MS_JSON });
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
    // 📊 대화 난이도(1 기초 ~ 8 최고) — 프론트 레벨 슬라이더 값. 범위 밖이면 0(미지정).
    const rawDiff = Math.floor(Number(body && body.difficulty));
    const ctxDifficulty = (rawDiff >= 1 && rawDiff <= 8) ? rawDiff : 0;
    // 🧑‍🎓 연령대(kid/child/teen/adult) — 난이도와 «독립» 인 축. 소재·말투만 바꾼다(src/warmup-audience.ts).
    //    모르는 값·미지정이면 기본값(child)이 되므로 옛 화면의 요청도 지금과 똑같이 동작한다.
    const ctxAge = normalizeWarmupAge(body && body.age_group);
    // 🚀 kickoff — 화면이 «학생 대신» AI 에게 첫 인사를 시키는 합성 발화(교재 연동 경로)다.
    //    학생이 한 말이 아니므로 「입을 뗐다」로 세면 안 된다(src/warmup-log.ts 주석 참고).
    const ctxKickoff = !!(body && body.kickoff);
    // 🧑 학생이 고른 AI 친구 이름 — 정본 표를 거쳐 «아는 이름» 으로만 바꾼다(프롬프트 주입 차단).
    //    「번갈아」는 화면이 «그 턴에 말할 사람» 을 보낸다. 안 보내면 예전처럼 'Mango'.
    const ctxFriend = resolveFriendName(body && body.friend);

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

    // 📊 웜업 기록(src/warmup-log.ts) — 세션당 INSERT 1 + 조건부 UPDATE 최대 2. 발화마다 쓰지 않는다.
    //   ① 첫 턴의 INSERT 는 «안전망» 이다. 로그인 학생은 /api/warmup/context 에서 이미 잡히고,
    //      비로그인·교재 미배정 세션만 여기서 처음 기록된다(INSERT OR IGNORE 라 겹쳐도 무해).
    //   ② 「입을 뗐다」 판정은 히스토리가 비었는지로 하면 «틀린다» — kickoff 합성 발화가 이미
    //      user 로 저장돼 있기 때문이다. 판정은 순수 함수 하나에 모아 두고 하니스가 직접 돌린다.
    if (history.length === 0) {
      await logWarmupSessionStart(env, {
        sessionId, userId: ctxUserId, difficulty: ctxDifficulty, ageGroup: ctxAge,
        textbook: ctxTextbook, level: ctxLevel,
      });
    }
    if (warmupShouldMarkFirstReply(history, ctxKickoff)) await markWarmupFirstReply(env, sessionId);

    // ── 시스템 프롬프트(주제 + 오늘 배울 교재 반영) + 히스토리 + 이번 발화로 messages 구성 ──
    let sys = warmupSystem(ctxFriend);
    sys += ' ' + warmupAgeLine(ctxAge);
    if (ctxDifficulty) sys += ` [난이도] ${WARMUP_LEVELS[ctxDifficulty]}`;
    if (lessonTopic) sys += ` 오늘의 대화 주제는 '${lessonTopic}' 이야.`;
    // 🗓️ 오늘 배울 교재 연동: 학생 배정 교재(students_erp) + 그 교재의 실제 문장(review_quizzes)으로 워밍업 질문
    if (ctxUserId || ctxTextbook || ctxLevel) {
      try {
        // 세션당 1회만 D1 을 본다(30분 캐시) — 매 발화마다 재조회하던 것이 지연의 한 축이었다
        const lc = await warmupLessonContextCached(env, sessionId, { userId: ctxUserId, textbook: ctxTextbook, level: ctxLevel, lessonNo: ctxLessonNo });
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
    // 🔁 반복 방지: 직전에 했던 질문/문장을 그대로 다시 묻는 문제(한 문장 반복) 차단
    sys += ' [중요] 이전 대화에서 이미 했던 질문이나 문장을 그대로 반복하지 마. 매번 새로운 표현과 다른 각도의 질문으로 대화를 이어가.';
    /* ✏️ 교정 카드 (2026-09-08) — 답장과 «같은 한 번의 호출» 에서 JSON 으로 함께 받는다.
       따로 부르면 왕복이 하나 더 붙어 한 턴이 두 배가 된다. 판정 정본은 src/warmup-correction.ts.
       ⚠️ 이 절이 출력 형식을 평문 → JSON 으로 바꾸므로, 아래 모든 추출 자리는 반드시
          takeWarmupReply() 를 지나야 한다. 안 지나면 무너진출력·이름·반복 게이트가
          중괄호 덩어리를 보고 «무너졌다» 로 판정해 대화가 통째로 안전문구로 떨어진다. */
    sys += '\n' + WARMUP_CORRECTION_RULE;
    /* 🏷️ 첫 턴에는 «화면 인사» 를 모델 문맥에 넣어 준다 (2026-09-01).
       ⚠️ 이 파일은 공동 금지구역이다 — 2026-08-31 사장님이 「진행해」로 승인하신 «AI 가 자기
          이름을 못 지키는» 그 버그의 연장이고, 변경은 이 조립 1줄 + 주석뿐이다.
       화면 인사(BEGINNER_GREETINGS)는 "Hi! I'm Lily." 인데 그것은 «화면에서만» 그려지고
       히스토리에는 안 들어간다. 그래서 모델은 자기가 이름을 말한 적이 없는 상태에서
       첫 답을 만들고, 학생이 이름을 물으면 그 자리에서 지어낸다(사장님 「계속 루이라고 말해」).
       ⚠️ «학생이 본 문장 그대로» 인 것은 fallbackGreeting 경로뿐이다. 교재가 잡힌 학생은
          kickoff 로 들어와 그 인사를 화면에서 «본 적이 없고», 7·8단계 인사는 모양이 다르다
          ("{name} here."). 즉 어느 경로에서나 같은 것은 «이름» 이고 문장은 아니다 —
          여기서 필요한 것도 이름이므로 그대로 두지만, 단정해 적지 않는다.
       ⚠️ 첫 턴에만 넣는다. 둘째 턴부터는 진짜 히스토리에 이름이 이미 들어 있다. */
    const messages = [{ role: 'system', content: sys }]
      .concat(history.length ? history : [{ role: 'assistant', content: `Hi! I'm ${ctxFriend}.` }])
      .concat([{ role: 'user', content: studentInput }]);

    // ── Workers AI 호출 ──
    let aiText = '';
    /* ✏️ 모델 출력은 이제 JSON({reply,fix}) 이다. 아래 다섯 자리(첫 호출·빈응답 재시도·
       무너짐 재시도·이름 재시도·반복 재시도)가 «전부» 이 한 곳을 지나야 한다.
       ⛔ 새 재시도를 추가할 때 이것을 빼먹으면 그 경로만 조용히 중괄호를 내보낸다.
       fix 는 «마지막으로 본 것» 을 남긴다 — 다시 뽑았으면 그 답의 교정이 맞다.
       파싱이 깨지면 fix 는 null 이고 reply 만 살아난다 = 고치기 전과 같은 동작. */
    let rawFix: any = null;
    let stagedFix: any = null;
    const takeWarmupReply = (r: any): string => {
      const parsed = parseWarmupOutput((r && (r.response || r.result || '')));
      stagedFix = parsed.fix;
      return parsed.reply;
    };
    /* ⚠️ 교정은 «그 답장을 실제로 채택했을 때만» 확정한다.
       재시도 답장은 거절될 수 있는데(이름·반복 검사), 파싱하자마자 rawFix 를 덮으면
       화면의 답장은 옛것인데 교정 카드만 새 답장의 것이 되어 서로 어긋난다. */
    const commitFix = () => { rawFix = stagedFix; };
    try {
      const result: any = await env.AI.run(WARMUP_MODEL, { messages, max_tokens: 200, temperature: 0.7 });
      aiText = takeWarmupReply(result); commitFix();
      // 🔁 (2026-07-27) Workers AI 가 드물게 빈 응답을 준다 — 이걸 그대로 두면 아래
      //    "Let's try again" 문구가 나가서, 학생은 자기가 잘 말했는데도 AI가 못 알아들은
      //    것으로 오해한다(직원 확인 사례: 정상적인 영어 문장에도 발생). 진짜 이해 실패가
      //    아니라 API 호출 자체의 실패이므로, 한 번 더 시도해 본다.
      if (!aiText) {
        try {
          const retryEmpty: any = await env.AI.run(WARMUP_MODEL, { messages, max_tokens: 200, temperature: 0.8 });
          aiText = takeWarmupReply(retryEmpty); commitFix();
        } catch {}
      }
      /* 🧯 무너진 출력 차단 (2026-08-31 사장님 화면 실사고 — 1단계인데 200토큰짜리 낱말 죽이
             그대로 나갔다. 「뜻」 버튼이 그 한국어 번역까지 나란히 그렸다).
         여기까지 «출력을 보는 단계» 가 한 곳도 없었다 — 재시도 조건이 «비었나»·«직전과 같나» 둘뿐이라
         모델이 무너지면 그게 학생 화면으로 직행했다. 판정 정본은 src/reply-sanity.ts.
         ⚠️ 느슨한 쪽으로 실패한다 — 멀쩡한 답을 버리면 대화가 그 자리에서 끊기고, 그건 학생에게
            깨진 문장 하나보다 나쁘다. 그래서 «누가 봐도 무너진» 것만 잡는다(거짓경보 0 을 하니스가 못 박는다).
         ⛔ 문장을 고쳐 쓰지 않는다 — 다시 뽑게만 한다. 아이가 따라 읽을 문장을 코드가 지어내면 안 된다. */
      const sanityCap = WARMUP_WORD_CAP[ctxDifficulty] || 0;
      let broke = aiText ? replyRejectReason(aiText, sanityCap) : '';
      if (broke) {
        /* ⚠️ 본문을 로그에 남기지 않는다 — 학생 이름·대화 내용이 섞입니다.
           원인 추적에는 «무슨 이유로, 얼마나 길게» 면 충분합니다. */
        console.warn('[warmup] broken reply:', broke, 'len=' + aiText.length, 'lv=' + ctxDifficulty);
        try {
          /* ⚠️ 온도를 «낮추지» 않는다 — 같은 프롬프트에서 낮은 온도는 오히려 같은 방향으로
             다시 무너지기 쉽습니다. 이 파일의 다른 재시도도 올리는 쪽입니다(빈 응답 0.8·반복 0.95). */
          const fresh: any = await env.AI.run(WARMUP_MODEL, { messages, max_tokens: 200, temperature: 0.8 });
          const freshText = takeWarmupReply(fresh);
          // 다시 뽑은 것이 «멀쩡할 때만» 받는다 — 둘 다 무너졌으면 아래 안전 문장으로 간다
          if (freshText && !replyRejectReason(freshText, sanityCap)) { aiText = freshText; broke = ''; commitFix(); }
        } catch {}
        if (broke) aiText = '';   // 아래 «잠깐의 딸꾹질» 문구가 받아 준다
      }
      /* 🏷️ 이름을 어기면 다시 뽑는다 (2026-08-31 사장님 지시).
         프롬프트에 「너는 ${ctxFriend} 야」가 이미 들어가는데도 모델이 가끔 어긴다 —
         제보가 두 번 왔고 그때마다 «다른» 이름이었다(루이 → 로이). 즉 매번 지어내는 것이라
         화면 이름을 바꿔 맞추는 것은 움직이는 과녁을 쫓는 일이다.
         ⛔ 이름만 갈아 끼우지 않는다 — 뒤따르는 말과 앞뒤가 안 맞을 수 있다. 다시 뽑게만 한다.
         ⚠️ 두 번째도 어기면 «그냥 내보낸다» — 이름 한 번 틀린 것이 대화가 끊기는 것보다 낫다. */
      const badName = aiText ? wrongSelfName(aiText, ctxFriend, { askedName: askedOwnName(studentInput) }) : '';
      if (badName) {
        console.warn('[warmup] wrong self-name:', badName, 'expected=' + ctxFriend);
        try {
          const again: any = await env.AI.run(WARMUP_MODEL, {
            messages: messages.concat([
              { role: 'assistant', content: aiText },
              { role: 'user', content: `(You said your name is ${badName}, but your name is ${ctxFriend}. Say it again correctly.)` },
            ]),
            max_tokens: 200, temperature: 0.7,
          });
          const againText = takeWarmupReply(again);
          if (againText && !wrongSelfName(againText, ctxFriend) && !replyRejectReason(againText, sanityCap)) {
            aiText = againText; commitFix();
          }
        } catch {}
      }
      // 🔁 그래도 직전 AI 발화와 (거의) 같은 문장이 나오면 1회 재생성 — temperature 를 올리고 명시적으로 지시
      if (aiText && warmupIsRepeat(aiText, history)) {
        const retry: any = await env.AI.run(WARMUP_MODEL, {
          messages: messages.concat([
            { role: 'assistant', content: aiText },
            { role: 'user', content: '(방금 질문은 이미 했던 거야. 완전히 다른 새로운 질문 하나로 다시 물어봐 줘!)' },
          ]),
          max_tokens: 200, temperature: 0.95,
        });
        const retryText = takeWarmupReply(retry);
        if (retryText && !warmupIsRepeat(retryText, history)) { aiText = retryText; commitFix(); }
      }
    } catch (e: any) {
      return new Response(JSON.stringify({ detail: 'AI 응답 생성 실패: ' + String(e?.message || e) }), { status: 502, headers: _MS_JSON });
    }
    // (2026-07-27) 문구 변경: "Let's try again"은 "네가 잘못 말했다"로 읽혀서 학생이
    // 자기 탓으로 오해하기 쉽다 — 위 재시도로도 안 되는 진짜 드문 경우이므로, AI 쪽 잠깐의
    // 딸꾹질임을 알리는 톤으로 바꾼다(학생향 문구는 항상 희망적/격려 톤 유지).
    if (!aiText) {
      aiText = "Oops, I got a little confused there! Can you tell me one more time? 😊";
      /* ⚠️ 답장을 버렸으면 그 출력에서 뽑은 교정도 함께 버린다 — 안 그러면 AI 가
         「못 알아들었어」라고 말하는 바로 밑에 「내가 말한 것 → 이렇게」 카드가 붙는다. */
      rawFix = null;
    }

    // ── 히스토리 갱신(최근 N턴만) + 6시간 TTL 저장 ──
    try {
      const updated = history.concat([
        { role: 'user', content: studentInput },
        { role: 'assistant', content: aiText }
      ]).slice(-WARMUP_MAX_TURNS * 2);
      if (env.SESSION_STATE) await env.SESSION_STATE.put(hkey, JSON.stringify(updated), { expirationTtl: 6 * 3600 });
    } catch {}

    const turnCount = Math.floor(history.length / 2) + 1;

    /* ✏️ 교정 카드 (2026-09-08) — 모델이 준 fix 를 «믿지 않고» 검증한 뒤, 보여 줄지까지 정한다.
       ⛔ 매 턴 고치지 않는다. 2026-09-03 AI 영어친구에서 「주제를 벗어나지 마」를 세 겹으로
          넣었다가 「정해진 문장 안에서만 한다」는 현장 제보를 받고 되돌린 전례가 있다.
       ⚠️ 이 블록은 절대 던지면 안 된다 — 여기서 던지면 멀쩡한 대화가 통째로 500 이 된다.
          그래서 통으로 try/catch 이고, 실패하면 fix 없이(=고치기 전과 똑같이) 내려간다. */
    let showFix: any = null;
    let offerRepeat = false;
    try {
      const verified = verifyWarmupFix(rawFix, studentInput);
      if (verified) {
        const mkey = 'warmupfix:' + sessionId;
        let memoIn: any = null;
        try {
          const rawMemo = env.SESSION_STATE ? await env.SESSION_STATE.get(mkey) : null;
          if (rawMemo != null) memoIn = JSON.parse(rawMemo);
        } catch {}
        const decided = decideWarmupFixShow(verified, memoIn, turnCount);
        showFix = decided.show;
        offerRepeat = warmupShouldOfferRepeat(decided.show, decided.memo, turnCount);
        // 히스토리와 같은 6시간 — 세션이 끝나면 함께 사라진다(발화를 저장하는 것이 아니다)
        try {
          if (env.SESSION_STATE) await env.SESSION_STATE.put(mkey, JSON.stringify(decided.memo), { expirationTtl: 6 * 3600 });
        } catch (e: any) {
          /* 이게 조용히 실패하면 «연달아 교정하지 않기»·«두 번째부터 보여주기» 가 통째로
             풀려 매 턴 교정이 뜬다 — 그런데 화면은 멀쩡해 보인다. 반드시 한 줄 남긴다. */
          console.warn('[warmup] fix memo save failed:', e?.message || e);
        }
      }
    } catch (e: any) {
      console.warn('[warmup] fix gate skipped:', e?.message || e);
    }

    // 💬 「어떻게 대답하면 되나」 보기 칩 — AI 질문에서 «결정론적으로» 유도한다(src/warmup-answers.ts).
    //    LLM 을 한 번 더 부르지 않으므로 응답이 느려지지 않고, 못 만들면 빈 배열이라 화면이 아무것도 안 그린다.
    return new Response(JSON.stringify({
      session_id: sessionId, ai_response: aiText, turn_count: turnCount,
      answer_chips: warmupAnswerChips(aiText, ctxDifficulty),
      fix: showFix, repeat: offerRepeat,
    }), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ detail: 'warmup_failed: ' + String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* ── 🔁 웜업 반복 감지 헬퍼 — 정규화 후 직전 AI 발화들과 (거의) 같은지 판정 ── */
function warmupNormSent(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9가-힣' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function warmupIsRepeat(text: string, history: any[]): boolean {
  const t = warmupNormSent(text);
  if (t.length < 8) return false;   // 아주 짧은 리액션("wow", "great")은 반복 허용
  const recent = history.filter((m) => m && m.role === 'assistant').slice(-4);
  for (const m of recent) {
    const p = warmupNormSent(String(m.content || ''));
    if (!p) continue;
    if (p === t) return true;
    if (t.length >= 20 && p.length >= 20 && (p.includes(t) || t.includes(p))) return true;
  }
  return false;
}

/* ════════════════════════════════════════════════════════════════════════
 *  🗣️ POST /api/warmup/questions — AI 동적 추가 질문(Follow-up Questions) 생성
 *    학생 레벨·교재·주제를 반영해 자연스럽고 다양한 질문 3개를 JSON 으로 반환.
 *    같은 문장 반복을 막기 위해 세션별 최근 생성 질문(KV)을 제외 목록으로 주입.
 *    body: { session_id?, user_id?, textbook?, level?, lesson_no?, topic?, difficulty?(1~8), count?(1~5),
 *            pick? }  — pick(질문 문자열)이 오면 생성 대신 그 질문을 대화 히스토리에 AI 발화로 기록만 한다
 *    응답: { ok, questions: string[], textbook, level, topic }
 * ════════════════════════════════════════════════════════════════════════ */
const WARMUP_FALLBACK_QUESTIONS: Record<'low' | 'mid' | 'high', string[]> = {
  low: ['What is your favorite color?', 'Do you like pizza or chicken?', 'What did you eat today?', 'Do you have a pet?', 'What day is it today?'],
  mid: ['What did you do last weekend?', 'What is your favorite subject, and why?', 'If you could travel anywhere, where would you go?', 'What makes you happy these days?', 'Would you rather live in the mountains or by the sea?'],
  high: ['What is something new you learned recently, and how did it change your thinking?', 'If you could change one rule at school, what would it be and why?', 'What do you think the world will look like in 20 years?', "Describe a moment you felt proud of yourself.", 'Would you rather be able to fly or read minds? Defend your choice!'],
};
async function handleWarmupQuestions(request: Request, env: Env): Promise<Response> {
  try {
    let body: any = {};
    try { body = await request.json(); } catch {}
    const sessionId = (typeof body.session_id === 'string') ? body.session_id.trim().slice(0, 200) : '';
    const userId = (typeof body.user_id === 'string') ? body.user_id.trim().slice(0, 100) : '';
    const reqTextbook = (typeof body.textbook === 'string') ? body.textbook.trim().slice(0, 200) : '';
    const reqLevel = (typeof body.level === 'string') ? body.level.trim().slice(0, 100) : '';
    const topic = (typeof body.topic === 'string') ? body.topic.trim().slice(0, 200) : '';
    const lessonNo = Number(body.lesson_no) > 0 ? Number(body.lesson_no) : null;
    const rawDiff = Math.floor(Number(body.difficulty));
    const difficulty = (rawDiff >= 1 && rawDiff <= 8) ? rawDiff : 0;
    const ageGroup = normalizeWarmupAge(body.age_group);   // 🧑‍🎓 대화와 같은 연령대 축(소재·말투)
    const rawCount = Math.floor(Number(body.count));
    const count = (rawCount >= 1 && rawCount <= 5) ? rawCount : 3;

    // ── pick 모드: 학생이 고른 질문을 대화 히스토리에 AI 발화로 기록 (문맥 유지) ──
    const pick = (typeof body.pick === 'string') ? body.pick.trim().slice(0, 500) : '';
    if (pick) {
      if (sessionId && env.SESSION_STATE) {
        try {
          const hkey = 'warmup:' + sessionId;
          let history: any[] = [];
          try { const raw = await env.SESSION_STATE.get(hkey); if (raw) history = JSON.parse(raw); } catch {}
          history = history.concat([{ role: 'assistant', content: pick }]).slice(-WARMUP_MAX_TURNS * 2);
          await env.SESSION_STATE.put(hkey, JSON.stringify(history), { expirationTtl: 6 * 3600 });
        } catch {}
      }
      // 고른 질문도 곧바로 AI 발화가 되므로 «대답 보기» 를 같이 내려준다(대화 응답과 같은 규칙).
      return new Response(JSON.stringify({ ok: true, picked: pick, answer_chips: warmupAnswerChips(pick, difficulty) }),
        { status: 200, headers: _MS_JSON });
    }

    if (!env.AI) {
      return new Response(JSON.stringify({ ok: false, detail: 'Workers AI(AI 바인딩)를 사용할 수 없습니다.' }), { status: 502, headers: _MS_JSON });
    }

    // ── 학생 컨텍스트 (배정 교재/레벨/오늘 문장) ──
    let lc = { textbook: reqTextbook, level: reqLevel, lesson_no: lessonNo, student_name: '', sentences: [] as string[] };
    // 채팅과 같은 캐시를 공유한다 — 같은 세션이면 추가 질문 생성 때 D1 을 다시 보지 않는다
    try { lc = await warmupLessonContextCached(env, sessionId, { userId, textbook: reqTextbook, level: reqLevel, lessonNo }); } catch {}

    // ── 반복 방지: 이 세션에서 이미 생성/사용한 질문 목록 (KV, 6시간) ──
    const qkey = sessionId ? ('warmupq:' + sessionId) : '';
    let recentQs: string[] = [];
    if (qkey && env.SESSION_STATE) {
      try { const raw = await env.SESSION_STATE.get(qkey); if (raw) recentQs = JSON.parse(raw) || []; } catch {}
    }

    // ── 프롬프트 (전문 화상영어 AI 조교 — 사장님 사양 이식) ──
    const levelDesc = difficulty ? WARMUP_LEVELS[difficulty] : (lc.level ? `학생 레벨: ${lc.level}` : '');
    let prompt = `당신은 전문 화상영어 AI 조교입니다. 수업 전 워밍업에서 학생에게 물어볼 영어 질문을 만듭니다.\n`;
    if (levelDesc) prompt += `- 학생 수준: ${levelDesc}\n`;
    prompt += `- ${warmupAgeLine(ageGroup)}\n`;
    if (lc.textbook) prompt += `- 교재 이름: '${lc.textbook}'${lc.lesson_no ? ` (Lesson ${lc.lesson_no})` : ''}\n`;
    if (topic) prompt += `- 오늘의 주제: '${topic}'\n`;
    if (lc.sentences.length) prompt += `- 오늘 배울 핵심 문장: ${lc.sentences.slice(0, 6).map((s) => `"${s}"`).join(' / ')}\n`;
    if (recentQs.length) prompt += `- 이미 사용한 질문(절대 반복 금지): ${recentQs.slice(-12).map((q) => `"${q}"`).join(' / ')}\n`;
    // 🕸️ 개인화(Neo4j): 이 학생이 복습퀴즈에서 자주 틀린 문장 → 그 표현·문형을 다시 쓰게 만드는 질문 우선.
    //    채팅(handleWarmupChat)과 동일하게 세션당 1회 조회 + KV 30분 캐시, 장애 시 조용히 생략.
    if (userId && env.NEO4J_QUERY_URL) {
      let weak: Array<{ text: string; wrongCount: number; inTodayTextbook: boolean }> = [];
      const wkey = 'warmupweak:' + (sessionId || 'noses') + ':' + userId;
      let cached = false;
      try {
        const raw = env.SESSION_STATE ? await env.SESSION_STATE.get(wkey) : null;
        if (raw != null) { weak = JSON.parse(raw); cached = true; }
      } catch {}
      if (!cached) {
        try { weak = await getWeakSentences(env as any, userId, lc.textbook || '', 5); } catch { weak = []; }
        try { if (env.SESSION_STATE) await env.SESSION_STATE.put(wkey, JSON.stringify(weak), { expirationTtl: 1800 }); } catch {}
      }
      if (weak.length) {
        prompt += `- 이 학생이 자주 틀리는 표현: ${weak.slice(0, 5).map((w) => `"${w.text}"`).join(' / ')}\n`;
        prompt += `  → 이 표현들의 단어·문형을 학생이 대답에서 자연스럽게 다시 쓰게 만드는 질문을 1~2개 포함하세요(틀렸다는 언급은 금지).\n`;
      }
    }
    prompt += `하나의 문장만 반복되는 것을 방지하기 위해, 학생의 수준에 맞는 자연스럽고 서로 다른 유형의 추가 질문(Follow-up Questions) ${count}가지를 영어로 생성하세요. `;
    prompt += `각 질문은 한 문장으로 짧게, 서로 다른 각도(경험 묻기, 양자택일, 상상 질문 등)로 만드세요. `;
    prompt += `결과는 반드시 JSON 문자열 배열만 반환하세요. 예: ["...", "...", "..."]`;

    let questions: string[] = [];
    let dbgRaw = ''; let dbgErr = '';
    try {
      const result: any = await env.AI.run(WARMUP_MODEL, {
        messages: [
          { role: 'system', content: 'You are a helpful English teaching assistant. Reply with a JSON array of strings only — no prose, no code fence.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 300, temperature: 0.9,
      });
      const text = (result && (result.response || result.result || '')).toString();
      dbgRaw = text.slice(0, 400);
      const m = text.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const arr = JSON.parse(m[0]);
          if (Array.isArray(arr)) {
            questions = arr
              .map((q: any) => String((q && typeof q === 'object') ? (q.question || q.q || '') : q).trim())
              .filter((q: string) => q.length >= 5 && q.length <= 200);
          }
        } catch {}
      }
      // JSON 파싱 실패(홑따옴표·후행쉼표 등 모델 변주) → 따옴표 문자열만 긁어 복구
      if (!questions.length) {
        const qs = text.match(/"([^"\n]{5,200}\?)"/g) || [];
        questions = qs.map((s: string) => s.slice(1, -1).trim());
      }
      // 모델이 괄호·따옴표 없이 "Q1?,Q2?,Q3?" 로 반환하는 변주 → '?' 경계로 문장 분리
      if (!questions.length) {
        questions = text.split(/\r?\n|(?<=\?)\s*(?:,\s*)?/)
          .map((s: string) => s.replace(/^[\s\-\*\d.)"']+|["']+\s*$/g, '').trim())
          .filter((q: string) => q.length >= 5 && q.length <= 200 && /\?$/.test(q));
      }
      if (!questions.length) console.error('[warmup-questions] unparsed AI output:', text.slice(0, 300));
    } catch (e: any) {
      dbgErr = String(e?.message || e);
      console.error('[warmup-questions] AI error:', dbgErr);
    }

    /* 🧯 무너진 질문 차단 (2026-08-31) — 웜업 대화와 «같은 사고» 가 여기서도 성립한다.
       같은 모델·같은 온도로 만드는데 검증이 「5~200자 + ? 로 끝남」 뿐이라,
       200자짜리 낱말 죽이 ? 로 끝나면 그대로 학생 화면의 질문 칩이 된다.
       ⚠️ 길이 상한은 넘기지 않는다(0) — 이 칩은 «AI 가 물어볼 질문» 이라 레벨별 단어 수를
          이미 프롬프트가 정하고, 여기서 또 자르면 멀쩡한 질문이 사라진다. 무너진 모양만 본다.
       ✅ 전부 걸러져 비면 아래 WARMUP_FALLBACK_QUESTIONS 가 받아 준다(화면이 안 빈다). */
    const brokenQs = questions.filter((q) => replyRejectReason(q));
    if (brokenQs.length) console.warn('[warmup-questions] dropped', brokenQs.length, 'broken:',
      brokenQs.map((q) => replyRejectReason(q)).join(','));
    questions = questions.filter((q) => !replyRejectReason(q));

    // 반복 제거(기존 사용분과 정규화 비교) + 개수 보정
    const seen = new Set(recentQs.map(warmupNormSent));
    questions = questions.filter((q) => !seen.has(warmupNormSent(q))).slice(0, count);
    if (!questions.length) {
      // AI 실패/전부 중복 → 레벨대별 준비 질문에서 미사용분 채움 (화면이 비지 않게)
      const band = difficulty >= 6 ? 'high' : difficulty >= 4 ? 'mid' : 'low';
      questions = WARMUP_FALLBACK_QUESTIONS[band].filter((q) => !seen.has(warmupNormSent(q))).slice(0, count);
    }

    // 사용 질문 목록 갱신 (최근 30개, 6시간)
    if (qkey && env.SESSION_STATE && questions.length) {
      try { await env.SESSION_STATE.put(qkey, JSON.stringify(recentQs.concat(questions).slice(-30)), { expirationTtl: 6 * 3600 }); } catch {}
    }

    const payload: any = { ok: true, questions, textbook: lc.textbook || '', level: lc.level || '', topic };
    if (body.debug === true) payload._debug = { raw: dbgRaw, err: dbgErr };   // 진단용 — AI 원문/오류 확인
    return new Response(JSON.stringify(payload), { status: 200, headers: _MS_JSON });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, detail: 'warmup_questions_failed: ' + String(e?.message || e) }), { status: 500, headers: _MS_JSON });
  }
}

/* 📶 TURN 설정 — 수업 입장마다 호출되는 경로다(페이지 로드 1회 = 여기 1회).
 *
 *  (2026-08-06 동시접속 진단) 고친 것 2가지:
 *   ① 캐시가 없었다 — 학생이 페이지를 열 때마다 Cloudflare TURN API 로 자격증명을 새로 발급받았다.
 *      50명이 정각에 몰리면 외부 API 호출 50번이 동시에 나간다. → KV 에 1시간 캐시.
 *      자격증명 자체는 24시간(ttl=86400) 짜리라 1시간 캐시로 만료 위험이 없다.
 *   ② 마지막으로 성공한 자격증명을 붙잡아 두지 않았다 — CF API 가 잠깐 흔들리면 곧바로
 *      «무료 공개 TURN(openrelay)» 으로 떨어졌다. 그 서버는 50명을 받을 수 있는 서버가 아니라서,
 *      아무 에러 없이 «영상만 안 나오는» 상태가 된다. → 마지막 성공분(24시간 보관)을 먼저 쓴다.
 *  ⚠️ 공개 TURN 은 지우지 않고 «최후의 수단» 으로만 남겼다. 대칭형 NAT 환경에서는 이것마저 없으면
 *     연결 자체가 불가능해지므로, 느리더라도 있는 편이 낫다.
 */
const TURN_CACHE_KEY = 'turn:ice-servers:v1';       // 1시간 캐시(정상 경로)
const TURN_LKG_KEY = 'turn:ice-servers:last-good';  // 마지막 성공분(24시간, 장애 시 구명줄)

async function handleTurnConfig(env: Env): Promise<Response> {
  /* 📶 X-Turn-Detail — «왜 그 경로였나» (2026-08-26 사장님 지시로 추가).
   *
   *  [왜 필요했나] X-Turn-Source 하나로는 `public-fallback` 이 **서로 완전히 다른 세 가지**를
   *  뭉뚱그린다 — ① 시크릿이 없다 ② CF API 가 거절했다(403·429·한도초과) ③ 연결조차 안 됐다.
   *  해야 할 일이 각각 «키 등록»·«계정 확인»·«장애 대기» 로 다른데 화면에 나오는 글자는 똑같다.
   *  그래서 2026-08-26 에 반나절을 잘못 짚었다 — 「시크릿이 없다」고 단정하고 사장님께 키 발급을
   *  안내했는데, 대시보드 실측 결과 **워커 두 벌 모두 등록돼 있었다.** 진짜 원인은
   *  「시크릿은 있는데 24시간 넘게 발급이 한 번도 성공하지 못했다」였다.
   *  이유는 console.error 로 남고 있었지만 `wrangler tail` 을 켜고 있어야만 보였다.
   *
   *  ⛔ 값에 자격증명·CF 응답 «본문» 을 넣지 말 것. 이 API 는 **로그인 없이 누구나** 부른다
   *     (`Access-Control-Allow-Origin: *`). 상태 «코드» 까지만 싣는다.
   *  ⚠️ 이 헤더는 진단용이라 없어도 수업은 그대로 된다. 값이 늘어날 수 있으니 읽는 쪽은
   *     «모르는 값» 을 만나면 그냥 표시만 하고 판정하지 말 것(deploy.yml·watchdog 이 그렇게 한다).
   */
  let detail = 'unknown';
  const J = (body: any, cached: string) => new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
      'X-Turn-Source': cached, 'X-Turn-Detail': detail
    }
  });

  // 0) 캐시 우선 — 외부 API 호출 없이 즉시 응답
  if (env.SESSION_STATE) {
    try {
      const hit = await env.SESSION_STATE.get(TURN_CACHE_KEY, 'json');
      if (hit && (hit as any).iceServers) { detail = 'cache'; return J(hit, 'kv-cache'); }
    } catch {}
  }

  // Cloudflare TURN 키가 설정되어 있으면 동적 자격증명 생성
  detail = 'no-secrets';   // 아래 if 에 못 들어가면 이 값 그대로 나간다 = «키가 없다»
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
        const payload = { iceServers };
        if (env.SESSION_STATE) {
          // 캐시(1시간) + 마지막 성공분(24시간) 동시 저장. 실패해도 응답은 그대로 나간다.
          try { await env.SESSION_STATE.put(TURN_CACHE_KEY, JSON.stringify(payload), { expirationTtl: 3600 }); } catch {}
          try { await env.SESSION_STATE.put(TURN_LKG_KEY, JSON.stringify(payload), { expirationTtl: 86400 }); } catch {}
        }
        detail = 'ok';
        return J(payload, 'cloudflare');
      }
      // ⛔ 본문(cfResp.text())은 로그에만. 헤더에는 상태 «코드» 만 싣는다(위 주석).
      detail = 'cf-http-' + cfResp.status;
      console.error('Cloudflare TURN API error:', cfResp.status, await cfResp.text());
    } catch (err) {
      detail = 'cf-fetch-error';
      console.error('Cloudflare TURN fetch error:', err);
    }
  }

  // 1) CF 실패 → 마지막으로 성공했던 자격증명(최대 24시간 전)을 먼저 쓴다.
  //    공개 무료 TURN 으로 떨어지기 전에 반드시 이 단계를 거친다.
  if (env.SESSION_STATE) {
    try {
      const lkg = await env.SESSION_STATE.get(TURN_LKG_KEY, 'json');
      if (lkg && (lkg as any).iceServers) {
        console.warn('[turn-config] Cloudflare TURN 실패(' + detail + ') → 마지막 성공 자격증명으로 응답');
        return J(lkg, 'last-known-good');
      }
    } catch {}
  }

  // 2) 최후의 수단: 정적 STUN + 공개 TURN 서버들
  //    ⚠️ 여기까지 왔다는 것은 «수업 품질이 무너지고 있다» 는 뜻이다. 로그로 남긴다.
  console.error('[turn-config] ⚠️ 공개 무료 TURN 폴백 사용(' + detail + ') — 동시 수업이 많으면 영상이 끊긴다');
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
  // X-Turn-Source 로 «어느 경로였나», X-Turn-Detail 로 «왜 그랬나» 를 밖에서 바로 볼 수 있다.
  //   curl -sI https://mangoi.ai/api/turn-config | grep -i '^x-turn-'
  //   → public-fallback 인데 detail 이 no-secrets 면 키 등록, cf-http-403 이면 키 무효,
  //     cf-http-429 면 사용량 한도, cf-fetch-error 면 CF 쪽 장애다.
  return J(response, 'public-fallback');
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
    // fix (2026-07-13) — 동영상(MP4/WEBM/MOV/M4V)도 허용: 수업 중 학생·강사가 올린 영상을
    //   방 전체에 공유(video-share)하는 기능의 저장소로 이 엔드포인트를 재사용한다.
    const _allowedUpload = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'];
    if (mimeType && mimeType.indexOf('image/') !== 0 && mimeType.indexOf('video/') !== 0 && mimeType !== 'application/pdf') {
      // mimeType 이 비거나 octet-stream 이면 파일명 확장자로 보정
      const ln = (originalName || '').toLowerCase();
      if (/\.(jpe?g)$/.test(ln)) mimeType = 'image/jpeg';
      else if (/\.png$/.test(ln)) mimeType = 'image/png';
      else if (/\.webp$/.test(ln)) mimeType = 'image/webp';
      else if (/\.pdf$/.test(ln)) mimeType = 'application/pdf';
      else if (/\.mp4$/.test(ln)) mimeType = 'video/mp4';
      else if (/\.webm$/.test(ln)) mimeType = 'video/webm';
      else if (/\.mov$/.test(ln)) mimeType = 'video/quicktime';
      else if (/\.m4v$/.test(ln)) mimeType = 'video/x-m4v';
    }
    if (!_allowedUpload.includes(mimeType)) {
      return new Response(JSON.stringify({ error: 'Only PDF, image (JPG/PNG/WEBP) or video (MP4/WEBM/MOV) files are allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const size = buffer.byteLength;
    // 동영상은 100MB, 문서/이미지는 기존 50MB 상한 유지
    const maxSize = mimeType.indexOf('video/') === 0 ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
    if (size > maxSize) {
      return new Response(JSON.stringify({ error: mimeType.indexOf('video/') === 0 ? 'File too large (max 100MB for video)' : 'File too large (max 50MB)' }), {
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

// 📎 모든 파일 공유 — 업로드(R2 files/). 형식 제한 없음(문서/압축 등), 50MB 상한.
async function handleFileShareUpload(request: Request, env: Env): Promise<Response> {
  const J = (o: any, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  try {
    const url = new URL(request.url);
    const originalName = (url.searchParams.get('filename') || 'file').slice(0, 200);
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const buffer = await request.arrayBuffer();
    const size = buffer.byteLength;
    if (size === 0) return J({ error: 'empty_file' }, 400);
    if (size > 50 * 1024 * 1024) return J({ error: 'File too large (max 50MB)' }, 400);
    const safeName = (originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)) || 'file';
    const fileKey = `file-${Date.now()}-${safeName}`;
    const r2 = (env as any).RECORDINGS as R2Bucket | undefined;
    if (!r2) return J({ error: 'storage_unavailable' }, 500);
    await r2.put(`files/${fileKey}`, buffer, {
      httpMetadata: { contentType },
      customMetadata: { originalName, uploadedAt: new Date().toISOString(), size: String(size) },
    });
    return J({ success: true, filename: originalName, url: `/api/video-call/file/${fileKey}`, size });
  } catch (e: any) {
    return J({ error: 'upload_failed', detail: String(e?.message || e) }, 500);
  }
}

// 📎 모든 파일 공유 — 다운로드(첨부 형태, 원본 파일명 유지). 학생·강사 양쪽이 받아 각자 앱으로 연다.
async function handleFileShareDownload(path: string, env: Env): Promise<Response> {
  try {
    const fileKey = decodeURIComponent(path.replace('/api/video-call/file/', ''));
    if (!fileKey || fileKey.indexOf('/') >= 0) return new Response('Not found', { status: 404 });
    const r2 = (env as any).RECORDINGS as R2Bucket | undefined;
    if (!r2) return new Response('storage unavailable', { status: 500 });
    const obj = await r2.get(`files/${fileKey}`);
    if (!obj) return new Response('Not found', { status: 404 });
    const originalName = (obj.customMetadata && obj.customMetadata.originalName) || fileKey.replace(/^file-\d+-/, '');
    const ct = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
    const asciiName = originalName.replace(/[^\x20-\x7E]/g, '_');
    const headers = new Headers();
    headers.set('Content-Type', ct);
    headers.set('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    headers.set('Cache-Control', 'private, max-age=3600');
    return new Response(obj.body, { headers });
  } catch (e) {
    return new Response('error', { status: 500 });
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

async function handlePdfDownload(path: string, env: Env, request?: Request): Promise<Response> {
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
          const ct = row.mime || (row.ext === 'pdf' ? 'application/pdf' : 'image/jpeg');
          /* ⏱ (2026-08-08 강사 피드백 — Belle ① 「수업을 열 때 로딩이 지연된다」)
           *  이 갈래가 **라이브러리 교재**(BTS·MES 등 실제 수업에서 쓰는 책)다. 그런데 여기만
           *  Range 처리도 Accept-Ranges 도 없어서, 브라우저는 34과짜리 책을 **통째로 다 받은 뒤에야**
           *  1페이지를 그렸다. 업로드 교재(pdfs/…) 쪽은 2026-07-13 에 이미 Range 를 넣어 뒀는데
           *  라이브러리만 빠져 있었다 — 정작 수업에서 더 많이 쓰는 쪽이 느렸다.
           *  → 같은 방식으로 맞춘다. Content-Length 를 반드시 실어야 pdf.js 가 «조각 받기» 를 켠다. */
          const rh = request ? (request.headers.get('range') || '') : '';
          const rm = rh.match(/^bytes=(\d*)-(\d*)$/);
          if (rm && (rm[1] !== '' || rm[2] !== '')) {
            const head = await r2b.head(row.r2_key);
            if (head) {
              const total = head.size;
              let start: number; let end: number;
              if (rm[1] === '') { const suffix = Math.min(Number(rm[2]), total); start = total - suffix; end = total - 1; }
              else { start = Number(rm[1]); end = rm[2] === '' ? total - 1 : Math.min(Number(rm[2]), total - 1); }
              if (start <= end && start < total) {
                const part = await r2b.get(row.r2_key, { range: { offset: start, length: end - start + 1 } });
                if (part) {
                  return new Response(part.body, {
                    status: 206,
                    headers: {
                      'Content-Type': ct,
                      'Content-Range': `bytes ${start}-${end}/${total}`,
                      'Content-Length': String(end - start + 1),
                      'Accept-Ranges': 'bytes',
                      'Access-Control-Allow-Origin': '*',
                      'Cache-Control': 'public, max-age=3600'
                    }
                  });
                }
              }
            }
          }
          const obj = await r2b.get(row.r2_key);
          if (obj) {
            const h: Record<string, string> = {
              'Content-Type': ct,
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=3600'
            };
            if (typeof obj.size === 'number') h['Content-Length'] = String(obj.size);
            return new Response(obj.body, { status: 200, headers: h });
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
    let objSize: number | null = null;
    let ctype = 'application/pdf';   // fix (2026-06-01) 저장된 실제 형식으로 서빙 (이미지 교재 지원)
    if (r2) {
      // fix (2026-07-13) — 동영상 구간 재생(Range) 지원: iOS Safari 는 Range 206 응답이
      //   없으면 <video> 재생 자체를 거부하고, 다른 브라우저도 탐색(seek)이 안 된다.
      const rangeHeader = request ? (request.headers.get('range') || '') : '';
      const rangeMatch = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
      if (rangeMatch && (rangeMatch[1] !== '' || rangeMatch[2] !== '')) {
        const head = await r2.head(`pdfs/${fileKey}`);
        if (head) {
          const total = head.size;
          let start: number; let end: number;
          if (rangeMatch[1] === '') {           // bytes=-N : 끝에서 N바이트
            const suffix = Math.min(Number(rangeMatch[2]), total);
            start = total - suffix; end = total - 1;
          } else {
            start = Number(rangeMatch[1]);
            end = rangeMatch[2] === '' ? total - 1 : Math.min(Number(rangeMatch[2]), total - 1);
          }
          if (start <= end && start < total) {
            const part = await r2.get(`pdfs/${fileKey}`, { range: { offset: start, length: end - start + 1 } });
            if (part) {
              const pct = (part.httpMetadata && part.httpMetadata.contentType) || 'application/octet-stream';
              return new Response(part.body, {
                status: 206,
                headers: {
                  'Content-Type': pct,
                  'Content-Range': `bytes ${start}-${end}/${total}`,
                  'Content-Length': String(end - start + 1),
                  'Accept-Ranges': 'bytes',
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=3600'
                }
              });
            }
          }
        }
      }
      const obj = await r2.get(`pdfs/${fileKey}`);
      if (obj) {
        bodyStream = obj.body;
        if (obj.httpMetadata && obj.httpMetadata.contentType) ctype = obj.httpMetadata.contentType;
        // ⏱ Content-Length 가 없으면 pdf.js 가 «조각 받기» 를 켜지 못하고 통짜로 받는다(Belle ①)
        if (typeof obj.size === 'number') objSize = obj.size;
      }
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

    const okHeaders: Record<string, string> = {
      'Content-Type': ctype,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    };
    if (objSize !== null) okHeaders['Content-Length'] = String(objSize);
    return new Response(bodyStream || pdfBuffer, { status: 200, headers: okHeaders });
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
    /* ⏱ TTL 2시간 (2026-08-20 — 그 전에는 600초였다)
       ═══════════════════════════════════════════════════════════════════════
       [무엇이 문제였나] 이 키는 **WebSocket 이 붙는 순간에만** 쓰이고 수업이
          진행되는 동안 갱신되지 않는다. TTL 이 10분이라 **10분 넘게 안정적으로
          연결된 수업은 관리자 「실시간 수업 현황」 표에서 사라졌다.**
          하필 그 표가 «수업 종료 / 연장»·«Ghost 참관» 의 입구라, 정작 손봐야 할
          수업일수록 목록에 없었다. 실측(2026-08-19 `meet-123`): 19:58~22:04
          2시간 6분 수업인데 마지막 접속이 20:00:51 — 그 뒤 약 1시간 53분간
          화면에는 «진행 중인 수업 없음» 이었다.
       [왜 TTL 만 늘려도 되나] 아래 handleActiveRooms 가 방마다 Durable Object 에
          `/status` 를 물어 **인원 0이면 그 자리에서 KV 키를 지운다.** 즉 TTL 은
          «정답» 이 아니라 «후보 목록» 의 안전망일 뿐이고, 유령 방은 다음 조회
          (관리자 화면 15초 주기)에서 곧바로 정리된다.
       ⛔ 하트비트마다 KV 를 다시 쓰는 방식은 일부러 택하지 않았다 — 화상수업
          Durable Object 를 건드려야 하는데(CLAUDE.md 4-2 공동 금지구역) 사고
          반경 대비 이득이 없다. 숫자 하나가 가장 안전하다. */
    const kvPut = env.SESSION_STATE.put(`active-room:${roomId}`, JSON.stringify({
      roomId,
      lastActivity: Date.now()
    }), { expirationTtl: 7200 }).catch(() => {});
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

    /* ⚡ (2026-08-07) 방을 **한꺼번에** 물어본다.
     *   예전엔 for 루프 안에서 `await durableObject.fetch(...)` 라 방 20개면 왕복이 20번 쌓였다.
     *   관리자 대시보드가 주기적으로 부르는 경로여서 그대로 응답 지연 + 워커 시간으로 나갔다.
     *   ⚠️ 동작은 바꾸지 않는다 — 빈 방/죽은 방의 KV 정리, 반환 순서(KV 키 순)까지 그대로.
     *      순서를 안 지키면 관리자 화면의 방 목록이 새로고침마다 뒤바뀐다. */
    const settled = await Promise.all(list.keys.map(async (key) => {
      const roomId = key.name.replace('active-room:', '');
      try {
        const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
        const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);
        const statusUrl = new URL(`https://internal/status?roomId=${roomId}`);
        const statusResp = await durableObject.fetch(statusUrl.toString());

        // 응답이 JSON 이 아니거나 비정상이면 정리 대상
        let status: any = null;
        if (statusResp.ok) {
          const text = await statusResp.text();
          try { status = JSON.parse(text); } catch { status = null; }
        }
        if (!status || typeof status.userCount !== 'number' || status.userCount === 0) {
          return { stale: key.name, status: null as any };
        }
        return { stale: null as string | null, status };
      } catch (e) {
        // DO 가 이미 사라진 경우 — 정리 대상
        return { stale: key.name, status: null as any };
      }
    }));

    // 정리(삭제)는 응답을 막지 않게 한꺼번에. 실패는 무시(다음 조회에서 다시 걸린다).
    const staleKeys = settled.map((r) => r.stale).filter(Boolean) as string[];
    if (staleKeys.length) {
      await Promise.all(staleKeys.map((k) => env.SESSION_STATE.delete(k).catch(() => {})));
    }
    const rooms: any[] = settled.filter((r) => r.status).map((r) => r.status);

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

/** 📡 수업 참가자용 공유 미디어 상태 — pdfState/videoState 만 (PII 없음, 공개).
 *   DO /status 응답에서 참가자 명단(users)·인원수 등은 제거하고 미디어 상태만 전달. */
async function handleRoomMedia(roomId: string, env: Env): Promise<Response> {
  try {
    if (!roomId || roomId.length > 120) {
      return new Response(JSON.stringify({ error: 'bad_room' }), {
        status: 400, headers: { 'Content-Type': 'application/json' }
      });
    }
    const durableObjectId = env.VIDEO_CALL_ROOM.idFromName(roomId);
    const durableObject = env.VIDEO_CALL_ROOM.get(durableObjectId);
    const statusUrl = new URL(`https://internal/status?roomId=${encodeURIComponent(roomId)}`);
    const statusResp = await durableObject.fetch(statusUrl.toString());
    const full = await statusResp.json().catch(() => null) as any;
    const out = {
      roomId,
      pdfState: (full && full.pdfState) || null,
      videoState: (full && full.videoState) || null,
    };
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json' }
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

// 🔴 2026-08-25 — 여기서 «있는 녹화가 없다고» 나왔다.
//   R2 list 는 한 번에 최대 1000개다. 예전엔 커서 없이 딱 한 번만 불렀는데,
//   버킷 객체가 1000개를 넘으면 **키 사전순 앞 1000개만** 온다.
//   그런데 실제 녹화 키는 `rec/...` 라 `class-...`·`mangoi-...` 같은 옛 키들보다 뒤로 밀린다.
//   → 파일이 멀쩡히 있어도 관리자 화면(js/adm-core.js)이 짝을 못 찾아 **전부 「⚠️ 영상 없음」**.
//   ⚠️ 게다가 «잘렸다» 는 신호가 없어서 «파일이 없다» 와 «목록에 없다» 가 구분되지 않았다.
//   ✅ 커서로 끝까지 훑고, 그래도 못 다 읽으면 truncated 로 **정직하게** 알린다.
const REC_LIST_MAX_PAGES = 20;    // 접두사당 최대 20,000개 — 워커 시간·메모리 상한

/* 🔴 2026-08-26(2차) — **이 R2 버킷은 녹화 전용이 아니다.** 여럿이 나눠 쓴다:
     · `rec/`          자동녹화 multipart (recordings-r2.ts)        ← 녹화
     · `recordings/`   옛 단일 업로드 (handleRecordingComplete)      ← 녹화
     · `pdfs/`         화상수업 교재 파일 (아래 /api/video-call/pdf) ← 녹화 아님
     · `popup-media/`  홈 팝업 이미지·영상 (api-admin.ts)            ← 녹화 아님
     · `_test/`        진단 버튼이 만들었다 지우는 임시 파일          ← 녹화 아님
   커서를 넣어 «끝까지» 읽게 고치자(1차 수정) 교재 파일이 전부 딸려 나와, 관리자 녹화 목록에
   「⚠ 기록 없음(고아)」이 **15,046줄** 찍혔다(2026-08-26 사장님 화면 실측 — 총 15,096건 중).
   ▶재생 버튼까지 붙어 JPG 를 동영상으로 틀려고 한다.
   → 버킷 전체를 훑지 말고 **녹화 접두사 두 개만** 훑는다. 싸고, 정확하고, 잘릴 일도 없다.
   ⚠️ D1 `recordings.file_url` 이 가리키는 키는 이 둘뿐이다(옛 `/blob/upload` 경로는
      `{방번호}/{날짜}/…` 를 만들지만 **D1 에 아무것도 안 쓰고** 부르는 화면도 없다).
      혹시 그런 키를 확인해야 하면 `?prefix=` 로 지정해 부를 수 있다. */
const REC_LIST_PREFIXES = ['rec/', 'recordings/'];

async function handleRecordingList(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.RECORDINGS) return recordingJson({ items: [], count: 0, truncated: false });
    const url = new URL(request.url);
    const only = url.searchParams.get('prefix');
    const prefixes = only ? [only] : REC_LIST_PREFIXES;
    const items: any[] = [];
    let truncated = false;
    for (const prefix of prefixes) {
      let cursor: string | undefined = undefined;
      for (let page = 0; page < REC_LIST_MAX_PAGES; page++) {
        const listed: any = await env.RECORDINGS.list({ prefix, limit: 1000, cursor });
        for (const o of (listed.objects || [])) {
          // 🛟 `<키>.snap` 은 짧은 녹화 안전망의 «사본» 이라 목록에 내보내지 않는다.
          //   내보내면 관리자 화면에 「⚠ 기록 없음(고아)」 로 한 줄씩 더 뜬다(recordings-r2.ts 참고).
          if (String(o.key).endsWith('.snap')) continue;
          items.push({
            key: o.key,
            size: o.size,
            uploaded: o.uploaded,
            url: `/api/recordings/blob/${encodeURIComponent(o.key)}`,
            originalName: (o.customMetadata && o.customMetadata.originalName) || String(o.key).split('/').pop()
          });
        }
        // ⚠️ 판별 유니온을 좁히지 않는다 — 이 저장소는 tsconfig 가 strict:false 라
        //    listed.cursor 직접 접근이 TS2339 로 막힌다(CLAUDE.md 2장 함정).
        cursor = listed.truncated ? (listed.cursor as string) : undefined;
        if (!cursor) break;
        if (page === REC_LIST_MAX_PAGES - 1) truncated = true;
      }
    }
    return recordingJson({ items, count: items.length, truncated });
  } catch (err: any) {
    console.error('[recording] list error:', err);
    return recordingJson({ error: err?.message || 'List failed', items: [], count: 0, truncated: false }, 500);
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
// ────────────────────────────────────────────────────────────────────────────
// 🇵🇭 역할 기반 라우팅 — 강사 ↔ 관리자 분기 (2026-08-02)
//
//   role === 'teacher'  → /teacher        (초경량 강사 포털)
//   그 외(hq·staff 등)  → /admin.html     (기존 통합 관리자)
//
// 설계 원칙:
//   1) 기존 /admin/* 화면은 **건드리지 않는다.** 강사가 /admin/mypage(급여·평가서 초안 등
//      기존 기능 전부)로 직접 들어가는 길은 그대로 열어 둔다. 이 함수가 막는 것은
//      "강사가 1.3MB 짜리 admin.html 첫 화면에 떨어지는 것" 하나뿐이다.
//   2) 되돌릴 수 있게 — `?full=1` 이 붙으면 리다이렉트하지 않는다(강사 지원·디버깅용).
//   3) 판정 실패(DB 오류 등)는 리다이렉트하지 않고 기존 동작을 유지한다(가용성 우선).
// ────────────────────────────────────────────────────────────────────────────
async function teacherPortalRedirect(
  request: Request, url: URL, path: string, env: Env
): Promise<Response | null> {
  const isTeacherPage  = (path === '/teacher' || path === '/teacher/' || path === '/teacher.html');
  const isAdminHome    = (path === '/admin' || path === '/admin/' || path === '/admin.html');
  const isTeacherApi   = (path === '/api/teacher/portal');
  if (!isTeacherPage && !isAdminHome && !isTeacherApi) return null;
  if (url.searchParams.get('full') === '1') return null;   // 탈출구

  let actor: { ok: boolean; isTeacher: boolean; role: string };
  try {
    actor = await getAdminActor(request, env as any);
  } catch (e) {
    console.warn('[teacher-route] actor resolve failed:', (e as any)?.message);
    return null;                                            // 판정 실패 → 기존 동작 유지
  }
  if (!actor.ok) return null;                               // 미인증은 세션 미들웨어가 이미 처리

  // 🇵🇭 (2026-08-05 사장님 지시) 본사 매니저도 이 가벼운 화면을 쓴다.
  //   경위: mgr_melca·mgr_maimai·mgr_karl 은 scope_type='hq' → isTeacher=false 라
  //   아래 분기에 걸려 **1MB admin.html 로 되튕겼다.** 그래서 이 화면에 만들어 둔
  //   문제 신고·PC 사양·본사 공지·카운트다운·자동 갱신이 정작 그것을 요청한
  //   필리핀 매니저들에게 하나도 닿지 않았다(요청 13·21 "페이지가 무겁다"의 실체).
  //   ⚠️ 권한이 늘어나는 변경이 아니다 — hq 는 admin.html 에서 이미 전부 본다.
  //      같은 정보를 가볍게 보는 창을 하나 더 주는 것뿐이다.
  //   ⚠️ 외부 조직(agency·branch·franchise)은 여기에 넣지 않는다. 그들은 남의 학원
  //      수업 현황을 보면 안 되고, 위쪽 미들웨어가 이미 /admin/exec 로 가둔다.
  const isHqStaff = (actor.role === 'hq' || actor.role === 'staff');

  // 강사 → 관리자 첫 화면 대신 강사 포털로
  //   (매니저는 여기에 걸리지 않는다 — 관리자 화면이 그들의 주 업무 도구다)
  if (actor.isTeacher && isAdminHome) {
    return Response.redirect(new URL('/teacher', request.url).toString(), 302);
  }
  // 강사도 본사도 아닌 계정 → 강사 포털은 볼 것이 없다. 관리자 화면으로.
  if (!actor.isTeacher && !isHqStaff && isTeacherPage) {
    return Response.redirect(new URL('/admin.html?full=1', request.url).toString(), 302);
  }
  // API 는 리다이렉트가 아니라 403 — fetch() 가 로그인 HTML 을 JSON 으로 파싱하다 죽지 않게.
  if (!actor.isTeacher && !isHqStaff && isTeacherApi) {
    return new Response(JSON.stringify({
      ok: false, error: 'not_a_teacher',
      message: '강사 또는 본사 계정만 사용할 수 있습니다.',
      message_en: 'Teacher or head-office accounts only.',
    }), { status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }
  return null;
}

/**
 * 🏫 지사·대리점 → 초경량 매니저 포털 (2026-08-08)
 *
 *   왜 —
 *     지금 지사·대리점은 admin.html 로 들어간다(isAgencyAllowedPage 가 '대리점 모드'로 허용).
 *     그런데 실측하면 그 화면은 gzip 934KB · 요청 145개 · DOM 8,762개고,
 *     거기서 부르는 관리자 API 231개 중 **매니저에게 허용되는 것은 25개(10%)** 뿐이다.
 *     나머지 90%는 열어도 403 이다(isAgencyAllowedApi). 즉 «안 맞는 옷»을 주고 있었다.
 *     → 강사에게 해 준 것과 똑같이, 그들이 실제로 쓸 수 있는 것만 담은 화면으로 보낸다.
 *
 *   판정 근거는 getScope() 하나뿐이다. 프런트에서만 나누면 URL 을 직접 치는 것으로 뚫린다.
 *   ⚠️ 권한이 늘거나 주는 변경이 **아니다** — 서버 허용목록(isAgencyAllowedApi)은 그대로다.
 *      어느 화면에 착지하는가만 바뀐다.
 *   ⚠️ ?full=1 은 탈출구다. 매니저가 옛 화면을 봐야 할 때(그리고 사고 시 되돌릴 때) 쓴다.
 */
async function managerPortalRedirect(
  request: Request, url: URL, path: string, env: Env
): Promise<Response | null> {
  const isManagerPage = (path === '/manager' || path === '/manager/' || path === '/manager.html');
  const isAdminHome   = (path === '/admin' || path === '/admin/' || path === '/admin.html');
  if (!isManagerPage && !isAdminHome) return null;
  if (url.searchParams.get('full') === '1') return null;      // 탈출구

  let sc: { type: string };
  try {
    sc = await getScope(env as any, request) as any;
  } catch (e) {
    console.warn('[manager-route] scope resolve failed:', (e as any)?.message);
    return null;                                              // 판정 실패 → 기존 동작 유지
  }
  const isOrg = (sc.type === 'agency' || sc.type === 'branch' || sc.type === 'franchise');

  // 지사·대리점이 관리자 첫 화면을 열었다 → 경량 포털로
  if (isOrg && isAdminHome) {
    return Response.redirect(new URL('/manager', request.url).toString(), 302);
  }

  // 🇵🇭 필리핀 본사 매니저(Maimai·Melca·Karl)도 경량 포털로 (2026-08-08 사장님 지시)
  //   경위: 세 분은 scope_type='hq' 라 위 조직 분기에 걸리지 않아, 「페이지가 무겁다」고
  //   요청한 당사자인데도 계속 admin.html(gzip 934KB · 흉내회선 19초)을 받고 있었다.
  //   ⚠️ 권한은 그대로다 — hq 는 admin.html 에서 이미 전부 본다. 착지 화면만 바뀐다.
  //   ⚠️ 판정은 PH_MANAGERS 상수 하나로만 한다. `mgr_` 접두사로 «필리핀» 을 가르면 안 된다 —
  //      mgr_jjw·mgr_lby 처럼 **한국 본사 매니저도 같은 접두사**를 쓴다(auth-admin.ts 주석,
  //      과거에 그렇게 갈랐다가 한국 매니저 두 분이 영어 화면을 받는 사고를 냈다).
  //   무거운 작업(급여 명세 편집·인사평가 등)은 화면 안의 「전체 경영 대시보드」 링크와
  //   ?full=1 탈출구로 언제든 갈 수 있다.
  if (isAdminHome) {
    try {
      const _a = await getAdminActor(request, env as any);
      if (_a.ok && PH_MANAGERS.indexOf(String((_a as any).username || '')) >= 0) {
        return Response.redirect(new URL('/manager', request.url).toString(), 302);
      }
    } catch (e) { /* 판정 실패 → 기존 동작(관리자 화면) 유지 */ }
  }

  // 조직 계정이 아닌 사람이 /manager 를 열었다 → 각자의 화면으로 돌려보낸다.
  //   본사(hq·staff)는 그대로 통과시킨다 — 강사 포털과 같은 이유로, 같은 정보를
  //   가볍게 보는 창을 하나 더 갖는 것뿐이다(권한 변화 없음).
  if (isManagerPage && !isOrg) {
    let actor: { ok: boolean; isTeacher: boolean; role: string };
    try {
      actor = await getAdminActor(request, env as any);
    } catch (e) {
      return null;
    }
    if (!actor.ok) return null;                               // 미인증은 세션 미들웨어가 처리
    if (actor.isTeacher) {
      return Response.redirect(new URL('/teacher', request.url).toString(), 302);
    }
    if (actor.role !== 'hq' && actor.role !== 'staff') {
      return Response.redirect(new URL('/admin.html?full=1', request.url).toString(), 302);
    }
  }
  return null;
}

function isAdminPath(path: string, method: string): boolean {
  // 🔒🔒 [보안 근본수정 2026-07-27] 관리자 **화면**도 DEFAULT-DENY 로 전환.
  //   과거엔 /admin/xxx.html 을 한 줄씩 이 목록에 등록하는 allowlist 였다. 그래서 새 화면을
  //   만들면서 등록을 빠뜨리면 그 페이지가 로그인 없이 그대로 내려갔다 —
  //   캐피타운 정산(2026-07-22)에 이어 /admin/ghost-view.html(수업 관찰) 이 같은 이유로 뚫렸다.
  //   이제 /admin 으로 시작하면 무조건 인증을 요구한다. 등록을 잊어도 안전한 쪽으로 실패한다.
  //   · 로그인 화면(/admin/login*)은 isAuthPublicPath() 가 미들웨어에서 먼저 빼준다.
  //   · public/admin/ 아래는 .html 21개뿐이고 js·css 정적자산이 없다(자산은 /js, /css 루트).
  //     따라서 이 규칙이 로그인 페이지의 리소스 로딩을 막지 않는다. 새로 자산을 넣지 말 것.
  if (path === '/admin' || path === '/admin/' || path === '/admin.html') return true;
  if (path.startsWith('/admin/')) return true;

  // 🇵🇭 강사 전용 초경량 포털 (2026-08-02) — 화면·API 모두 로그인 필수.
  //   같은 도메인·같은 세션쿠키(mango_admin_session)를 그대로 쓴다 → 재로그인 없음.
  //   역할 분기(강사만 통과)는 미들웨어의 teacherPortalRedirect() 가 담당한다.
  if (path === '/teacher' || path === '/teacher/' || path === '/teacher.html') return true;

  // 🏫 지사·대리점 전용 초경량 포털 (2026-08-08) — 화면 로그인 필수.
  //   강사에게 해 준 것과 같은 일이다. 역할 분기는 managerPortalRedirect() 가 담당한다.
  //   ⚠️ 새 화면 경로를 추가할 때는 **두 곳 모두** 등록할 것 —
  //      여기(isAdminPath)와, 미인증 시 로그인으로 보내는 리다이렉트 목록.
  //      한쪽만 하면 인증은 걸리는데 'API 취급' 이 되어 화면에 JSON 원문이 뜬다(2026-08-02 실사고).
  if (path === '/manager' || path === '/manager/' || path === '/manager.html') return true;

  // 🧾 결재 전용 초경량 화면 (2026-08-16) — 회사 지출 내역이 담긴다. 로그인 필수.
  //   위 두 포털과 같은 규칙이다. 역할 분기는 하지 않는다 —
  //   강사는 긴급·고객불만만 올릴 수 있고, 그 판정은 /api/approval/* 핸들러가 분류별로 한다.
  if (path === '/work' || path === '/work/' || path === '/work.html') return true;

  // 🚗 영업 전용 휴대폰 화면 (2026-08-18) — 거래처 학원장 연락처와 본인 성과급이 담긴다.
  //   로그인 필수. 역할 게이트(본사 또는 담당자 본인)는 /api/admin/sales/* 핸들러가 한 번 더 본다.
  //   ⚠️ 위 «미인증 리다이렉트 목록» 에도 함께 등록했다 — 한쪽만 하면 인증은 걸리는데
  //      'API 취급' 이 되어 화면에 JSON 원문이 뜬다(2026-08-02 실사고).
  if (path === '/sales' || path === '/sales/' || path === '/sales.html') return true;

  //   ⚠️ `/api/teacher/` 전체를 잠그지 말 것. 이미 있는 `/api/teacher/praise`(수업 중 실시간 칭찬)
  //      `/api/teacher/my-ratings` 등이 함께 걸린다 — 수업 경로를 건드리는 변경이 된다.
  //      새로 만든 포털 엔드포인트만 콕 집어 잠근다.
  if (path === '/api/teacher/portal') return true;

  // 🧾 결재 API — 회사 지출 내역이 담긴다. 로그인 필수(핸들러가 본사 계정인지 한 번 더 본다).
  if (path.startsWith('/api/approval/')) return true;

  // ⚡ 장애 신고 API — 누가 언제 끊겼는지는 강사 개인 정보다. 로그인 필수.
  //   (강사 본인도 써야 하므로 TEACHER_BLOCKED_PREFIXES 에는 넣지 않는다 — 여기서 로그인만 요구.)
  if (path.startsWith('/api/outage/')) return true;

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
  // 🏢 캐피타운 정산 화면 (2026-07-22) — 그동안 이 목록에 빠져 있어 로그인 없이도 HTML(내장 정산표)이
  //   그대로 내려갔다(소스보기 노출). 데이터는 API 로 옮겼고 페이지 자체도 로그인 필수로 게이트.
  if (path === '/admin/capitown-settlement' || path === '/admin/capitown-settlement/' || path === '/admin/capitown-settlement.html') return true;
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
  // ⏸ 연기 수업 현황 페이지 (2026-07-23) — 관리자·매니저 전용 (API 는 /api/admin/ 기본 게이트)
  if (path === '/admin/postponed-classes' || path === '/admin/postponed-classes/' || path === '/admin/postponed-classes.html') return true;
  // 🔁 수강권 만료·재활성 대시보드 + API (2026-07-11) — 관리자 전용
  if (path === '/admin/retention' || path === '/admin/retention/' || path === '/admin/retention.html') return true;
  if (path === '/api/admin/retention' || path === '/api/admin/retention/contacted') return true;
  if (path === '/api/admin/retention/preview' || path === '/api/admin/retention/send' || path === '/api/admin/retention/settings') return true;
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
  // 🧠 판단 경로 그래프 ETL/디버그 (decision-graph) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/decision-graph/')) return true;
  // 🕸 이탈 전염 위험 그래프 (churn-contagion) — 관리자 전용 (인증 필수)
  if (path.startsWith('/api/admin/churn-contagion/')) return true;
  // 📣 마케팅 스튜디오 대시보드 + API (2026-06-03) — 관리자 전용
  if (path === '/admin/marketing-studio' || path === '/admin/marketing-studio/' || path === '/admin/marketing-studio.html') return true;
  if (path.startsWith('/api/admin/marketing/')) return true;
  // 🔐 Phase 11 — 인증·세션 API (login·logout 만 isAuthPublicPath 로 예외)
  if (path === '/api/admin/me' || path === '/api/admin/profile') return true;
  if (path === '/api/admin/change-password') return true;
  // 🔑 강사·직원 비번 재설정 — 인증 필수. 역할 게이트(경영진·본사만)는 핸들러 안에서 한 번 더 건다.
  //   ⚠️ isAgencyAllowedApi 에는 **일부러 넣지 않았다** — 대리점이 남의 비번을 바꾸면 안 된다.
  if (path === '/api/admin/staff-password-reset') return true;
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
  // 🚫 강사 근무불가(휴가·휴식시간) — 강사 피드백(2026-07-24)
  if (path === '/api/admin/teacher-unavailability' || /^\/api\/admin\/teacher-unavailability\/\d+$/.test(path)) return true;
  if (path === '/api/admin/class-audit') return true;   // 📜 수업 변경 이력(연기/삭제/종료)
  if (path === '/api/admin/schedules') return true;
  if (path === '/api/admin/unassigned-students') return true;
  if (path === '/api/admin/notify-queue') return true;
  if (path === '/api/admin/students/merge-duplicates') return true;
  // 💼 강사 급여·평가 (Phase 8) — 관리자 전용
  if (path === '/api/admin/teachers' || /^\/api\/admin\/teachers\/\d+$/.test(path)) return true;
  // 💬 강사 카카오ID 명부 + 전달 — 강사 연락처가 나가는 경로라 반드시 인증 뒤 (2026-08-13)
  if (path.startsWith('/api/admin/teachers/kakao')) return true;
  // 🥭 Phase 34 — 강사 정보 (Teacher Profiles)
  if (path === '/api/admin/teacher-profiles' || path === '/api/admin/teacher-profiles/import' || /^\/api\/admin\/teacher-profiles\/\d+$/.test(path)) return true;
  if (path === '/api/admin/teacher-hours') return true;          // (deprecated, 호환성)
  if (path === '/api/admin/teacher-classes') return true;
  if (path === '/api/admin/teacher-evaluation') return true;
  if (path.startsWith('/api/admin/payroll/')) return true;
  // 🏢 Phase 9 — 추가 메뉴 6종
  if (path === '/api/admin/franchises') return true;
  if (path === '/api/admin/org/hq') return true;                 // 🏯 본사 관리(법인정보) — 반드시 인증 뒤
  if (path.startsWith('/api/admin/schedule-seed/')) return true; // 🗓 지난 수업 → 일정 만들기 — 반드시 인증 뒤(본사 전용)
  if (path === '/api/admin/centers') return true;
  if (path === '/api/admin/level-tests') return true;
  if (path === '/api/admin/enrollments' || /^\/api\/admin\/enrollments\/\d+(\/(plan|activate))?$/.test(path)) return true;
  if (path === '/api/admin/community-posts' || /^\/api\/admin\/community-posts\/\d+$/.test(path)) return true;
  if (path === '/api/admin/textbooks') return true;
  // 📚 Phase 39 — 교재 파일 라이브러리 (관리자 전용 업로드/관리)
  if (path === '/api/admin/textbook-files' || /^\/api\/admin\/textbook-files\/\d+$/.test(path)) return true;
  // 🔍✏️ (2026-08-19) 중복 진단 · 묶음 일괄 이름변경 — 위 정규식(\d+)에 안 걸리므로 따로 적는다
  if (path === '/api/admin/textbook-files/dup-report' || path === '/api/admin/textbook-files/rebook') return true;
  // 👥 (2026-08-19) 진행 중인 수업의 강사·학생 이름 — 반드시 인증 뒤
  if (path === '/api/admin/live-classes') return true;
  // 🔴 (2026-08-20) 예약 기준 지금 수업 현황 — 학생 이름이 나가므로 반드시 인증 뒤
  if (path === '/api/admin/classes-now') return true;
  // 🙈 (2026-08-13) 라이브러리 숨김 목록 — 관리자 전용
  if (path === '/api/admin/textbook-hidden-books') return true;
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
  if (path.startsWith('/api/recordings/stream/')) return true;     // 영상 id 스트리밍(관리자 전용 — admin/student 드릴다운 재생이 사용, 쿠키 인증)
  if (path === '/api/recordings/list-recent') return true;         // 전체 녹화 메타+blob키 덤프(열거 벡터)
  if (/^\/api\/eval\/ai-lesson-report\/\d+$/.test(path)) return true; // 수업 전사 전문 단건(정수 id, 프론트 미사용)
  // 🔒 [PII 2차 2026-07-10] 무단구독 — 프론트 미사용 확인 후 관리자 전용 잠금.
  //   (set-password 는 학부모 '내 자녀 계정 잠그기(claim)' 흐름에 필요해 공개 유지.
  //    비번 없는 계정=최초 설정(claim), 비번 있는 계정=옛 비번 검증 필수 → 탈취 방지는 claim 순서로 담보)
  if (path === '/api/subscription/create') return true;            // 임의 유저 구독 무단생성 방지
  // 🔒 [PII 3차 2026-07-10] 학부모/전화 — 관리자 진단페이지만 사용(admin/health) 또는 호출없음 → 잠금.
  if (path === '/api/kakao-id' || path.startsWith('/api/kakao-id/')) return true;  // 임의유저 전화·kakao_id 조회/덮어쓰기
  /* 🔓 (2026-08-12) 동의서 — «본인이 남기는 것» 만 연다. 조회·열거는 계속 관리자 전용.
     [왜 열어야 하나] 이 경로가 통째로 관리자 전용이라 **학생 화면이 동의를 남길 방법이 없었다.**
       그래서 consents 표가 1행도 없이 0행이었고, 녹화 1,552건의 동의가 전부 빈 값이었다.
       그 상태에서 「동의 없으면 녹화 안 함」을 켜면 녹화가 통째로 멈춘다.
     [무엇을 여는가] 쓰기 두 개뿐이다.
       · POST /api/consents           — 내 동의를 남긴다
       · POST /api/consents/withdraw  — 내 동의를 철회한다(철회는 학생의 권리다)
       둘 다 핸들러에서 _attnSoftAuthOk 로 «토큰이 있는데 다른 uid» 면 거부한다.
     [무엇을 계속 잠그는가] GET /api/consents/<uid> 는 전화·IP·기기정보가 나오는 조회다.
       핸들러가 resolveOwnerScope 로 «관리자 또는 본인» 만 통과시키므로 게이트에서 빼도
       남의 것은 못 본다. 열거(목록) 경로는 애초에 없다.
     ⚠️ 여기에 새 하위 경로를 추가할 때는 «쓰기인가 조회인가» 를 먼저 판단할 것. */
  if (path === '/api/consents' && method !== 'POST') return true;                  // 열거·기타 메서드는 관리자만
  if (path.startsWith('/api/consents/')
      && method !== 'GET'                                                          // GET /api/consents/<uid> = 본인 조회(핸들러가 resolveOwnerScope 로 막는다)
      && !(method === 'POST' && path === '/api/consents/withdraw')) return true;
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
  if (path === '/api/recordings/storage-stats') return true;   // 저장소 KPI (건수·용량) — 관리자만
  // 녹화 목록·다운로드·DB삭제·R2삭제 는 관리자만.
  // 학생 클라이언트 자동 호출인 /start, /stop, /upload, /stream, /complete, /blob/upload 는 열어둠.
  if (path === '/api/recordings' && method === 'GET') return true;
  if (path === '/api/recordings/blob/list' && method === 'GET') return true;
  // 🔒 [PII 2026-07-20] GET /api/recordings/blob/{key} — 키만 알면 누구나 미성년자 수업영상을
  //   받을 수 있던 공개 통로. 학생 재생은 인증 게이트가 있는 /api/recording/play?id= 로 전면
  //   전환됐고(목록 API가 blob 키를 더는 노출 안 함), 남은 소비처는 관리자 화면(adm-core.js)
  //   뿐이라 관리자 전용으로 잠금. (blob/upload 는 POST 라 이 GET 게이트에 안 걸림)
  if (path.startsWith('/api/recordings/blob/') && method === 'GET') return true;
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
  // 🏢 캐피타운 정산 화면 — 캐피타운 지사(capi_*, scope=branch)·본사(franchise 스코프)도 진입 허용.
  //   데이터는 /api/admin/capitown/ 가 계정별로 자기 지사만 내려주므로 화면 진입 자체는 안전(2026-07-22).
  if (path === '/admin/capitown-settlement' || path === '/admin/capitown-settlement/' || path === '/admin/capitown-settlement.html') return true;
  // 🎮 전 게임 통합 분석 (2026-08-08) — 지사·대리점도 본다.
  //   개인정보가 없는 화면이다: 집계 숫자 + 익명 uid 뿐이고 실명·연락처는 응답에도 없다.
  if (path === '/admin/game-insights' || path === '/admin/game-insights/' || path === '/admin/game-insights.html') return true;
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
    // 🏢 캐피타운 정산 — 핸들러가 계정별(경영진·capitown=전체 / capi_* 지사=자기 지사만) 자체 격리(2026-07-22)
    '/api/admin/capitown/',
    // 🎮 전 게임 통합 분석 (2026-08-08) — 집계 숫자만 나가고 실명·연락처가 응답에 없다.
    '/api/admin/game-insights',
    // 📏 메뉴 클릭 계측 (2026-08-08) — 지사·대리점이 «무엇을 쓰는지» 가 오히려 가장 궁금하다.
    //   저장하는 것은 (날짜·카드id·역할·경로) 카운터뿐이고, 개인을 식별할 값이 응답에도 저장에도 없다.
    '/api/admin/menu-hit',
    /* 🗓 수업 연기·변경 요청 (2026-08-17 사장님) — «학부모·학생도 하고 학원장님도 한다».
         그동안 이 경로가 막혀 있어 지사·대리점은 매니저 화면에서 처리할 수 없었다.
       ⚠️ 여는 조건이 하나 있다 — **핸들러가 스코프로 격리한 뒤에만** 연다.
          api-admin.ts 의 GET 목록은 class_schedules → students_erp 로 자기 학생 요청만 돌려주고,
          POST /decide 도 같은 조건으로 다시 확인한다(id 만 알면 남의 요청을 승인하던 것을 막음).
          이 줄만 지우고 핸들러 격리를 빼면 **다른 대리점 학생 이름이 새어 나간다.** */
    '/api/admin/schedule-requests',
    /* 🏢 조직 명부 (2026-08-18 사장님 수정요청 #03·#04) — 「영업사원·지사장·학원장이 보기 쉽게」.
         그동안 조직 관리 화면은 지사장이 열어도 이 두 경로가 여기 없어 403 → **빈 표**만 떴고,
         학원장에게는 카드 등급('branch')이 걸려 화면 자체가 안 보였다. 둘 다 이번에 연다.
       ⚠️ 여는 조건은 하나 — **핸들러가 스코프로 자른 뒤에만** 연다. api-admin.ts 의
          두 핸들러는 scopeFranchiseCond()/scopeCenterCond()(src/scope.ts)로
          지사 = 자기 지사, 대리점(학원) = 자기 한 칸까지 잘라서 내려주고,
          등록·수정·대표지사 지정은 canEditOrg() 로 본사만 허용한다(403).
          그 조건절을 빼고 이 두 줄만 남기면 **전국 지사 241건·대리점 921건이 통째로 샌다.**
          org_scope_harness.mjs 가 «열림» 과 «잘림» 을 함께 감시한다. */
    '/api/admin/franchises',
    '/api/admin/centers',
    /* 📊 (2026-08-19) 학원별 학생 수업현황 — 지사장·학원장도 «자기 지사·자기 학원» 출석 통계를 봐야 한다.
       핸들러(api-admin.ts)가 scopeStudentCond() 로 이미 자기 범위만 잘라서 주므로 여기 열어도 안 샌다. */
    '/api/admin/attendance/school-stats',
    /* 🔴 (2026-08-20) 예약 기준 지금 수업 현황 — 지사장·학원장도 «우리 학원 수업이 지금
       돌고 있나» 를 봐야 한다. 핸들러가 scopeStudentCond() 로 자기 범위 학생의 수업만
       잘라서 주고(범위 밖은 목록·건수 양쪽에서 빠진다), 강사에게는 아예 닫혀 있다. */
    '/api/admin/classes-now',
    /* 📅 (2026-08-25) 오늘 전체 수업 — manager.html 은 지사장·학원장도 쓴다. 「우리 학원 수업이
       오늘 몇 건인가」는 그들이 봐야 하는 것이고, 핸들러가 scopeStudentCond() 로 자기 범위
       학생의 수업만 잘라서 준다(범위 밖은 목록·건수 양쪽에서 빠진다). 강사에게는 위에서 닫았다. */
    '/api/admin/classes/today',
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
  // 🔑 비밀번호 찾기 — 비번을 잊은 사람은 당연히 로그인 상태가 아니다. 인증 게이트를 우회해야 한다.
  //   ⚠️ 우회 = 무방비가 아니다. handleAdminAuthApi 안에서 계정당 1시간 3회·IP 1시간 10회·
  //      코드 10분·검증 5회로 조이고, 응답은 아이디 존재 여부를 흘리지 않는다.
  if (path === '/api/admin/password-reset/request') return true;
  if (path === '/api/admin/password-reset/confirm') return true;
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
