/**
 * api-mango.ts - v3 명세서 신규 API
 *  - 출석 자동 감지 / 발화시간(VAD) 기록
 *  - 비상 카카오 ID 관리 / 비상 이벤트 로깅
 *  - 보상(스티커/쿠폰) 발급 with 일일 상한
 *  - 관리 대시보드 KPI
 *  - 🥭 Phase 21: AI 명령 엔드포인트 (Workers AI Llama 3.3 70B)
 */

// ※ ai-command / cafe24-sync 라우트는 다른 모듈로 옮겨졌다. 여기 남아 있던 import 는
//   실제로 한 번도 쓰이지 않는 껍데기라 제거했다(런타임 동작 변화 없음).
import { runCypher } from './teacher-match';  // 🕸️ Neo4j 그래프 학생 명부
import { studentScopeWhere, getScope } from './scope';
import { selectInChunks } from './d1-chunk';   // 🔢 IN(...) 목록을 D1 바인드 100개 한도에 맞춰 분할
import { checkAdminSession, resolveOwnerScope } from './auth-admin';  // 🔐 공용 소유자 판정
import { signRecDlSig } from './auth-token';  // 📼 녹화 1건 전용 다운로드 서명 (쿠키 못 싣는 모바일 다운로드용)
import { siteUrl } from './site-url';  // 사람에게 보내는 링크의 정본 주소(mangoi.ai)
import { entryWindow, canEnterNow, enterBlockedMsg, nextStartAfter } from './class-entry-window';  // 🚪 「문을 열어 줄 것인가」 정본 («수업 시간인가» 와 별개)
import { applyPIIScope, canViewPII, maskRecordPII, isMaskedValue } from './pii-mask';  // 🔒 PII 권한별 마스킹
import { type GiftishowEnv } from './giftishow-client';  // (MangoEnv 가 상속하는 타입만 사용)
import { json, parseJsonBody, invalidBody, toCSV, csvResponse, today } from './api-util';
import { handleNotifyApi, ensureNotifSchema, enqueueNotification, sendPushToUser } from './api-notify';  // 🔔 알림큐·웹푸시 (분리됨)  // 🧰 공용 헬퍼 (REFACTOR_PLAN 1단계 분리)
import { handleDiaryApi } from './api-diary';
import { handleGamesApi } from './api-games';
import { handlePointsApi } from './api-points';  // 🎁 포인트 도메인 (분리됨)
import { handleLessonsApi } from './api-lessons';  // 📝 평가서·숙제 (분리됨)
import { handleReportsApi } from './api-reports';  // 📄 월간리포트 (분리됨)
import { handleAiApi } from './api-ai';  // 🤖 AI 영작·친구챗 (분리됨)
import { handleStudentsApi } from './api-students';  // 👨‍👩‍👧 학부모 도메인 (분리됨)
import { handlePasskeyApi } from './api-passkey';    // 😊 패스키(WebAuthn) 얼굴/지문 로그인
import { handleAdminApi } from './api-admin';       // 🛡️ 관리자 도메인 (분리 진행중)    // 🎮 게임/단어장·마이크로러닝 라우트 (분리됨)
import { handleLessonInsightApi } from './lesson-insight';  // 🎥 수업 종료 후 AI 리포트 (집중도·발화·영어사용)
import { handleExamApi } from './api-exam';         // 📝 Mini TOEIC 시험 라우트 (2026-07-13 신규)
import { handleUptimeApi } from './api-uptime';     // 📟 UptimeRobot 장애 웹훅 → 관리자 문자
import { authUidFromRequest as authUidGlobal, signUidToken } from './auth-token';  // 🔐 모듈레벨 소유자 검증(IDOR 방지)
import { sendPlainSms, type SolapiEnv } from './solapi-client';
import { type EmailEnv } from './email';   // 📧 이메일(Resend) — MangoEnv 가 상속하는 타입만 사용
import { broadcastWebPush } from './web-push';
import { ipToNet, asLabel } from './net-prefix';
import { recordHostRoomNamespace } from './room-split-guard';   // 🚪 도메인–워커 배치 기록(방 갈림 감시)
import { peelLearnLead, joinLearnLead, curatedLearnMeaning, LEARN_GLOSS_HINT } from './learn-phrase-ko';  // 🗣️ 「뜻 보기」 칭찬 상투구 한국어 정본 (Good job! ≠ 훌륭한 직업)

/* 🔎 «학생 상세» 가 students_erp 에서 한 학생을 찾는 조건 — 정본 한 벌.
   ⚠️ 2026-09-14 실사고(yahee): 옛 조건이 `student_id OR login_id OR username` 뿐이라 **`user_id`(PK) 를 안 봤다.**
   카페24 동기화 행(29,494)은 세 칸이 user_id 와 같아 우연히 걸렸지만, 관리자 「학생 등록」으로 만든 행은
   student_id·login_id 가 NULL 이고 username 이 한글 이름이라 **어느 조건에도 안 걸려** 카드가 전부 «—» 였고,
   같은 조건을 쓰는 수정(UPDATE)·수강 연장도 0행 갱신으로 조용히 안 먹었다(에러 없음).
   ⛔ 아래 다섯 자리에 조건을 각각 다시 적지 말 것 — 한 곳만 고쳐지는 사고가 그대로 재현된다.
   감시: test-harness/student_erp_lookup_harness.mjs (이 조각을 오려 내 진짜 SQLite 에 돌린다). */
const ERP_BY_UID = `(user_id = ? OR student_id = ? OR login_id = ? OR username = ?)`;
const erpUidBinds = (uid: string): string[] => [uid, uid, uid, uid];
import { hiddenExcludeCond, ensureStudentOverrideTable } from './student-override';   // 🧹 중복 학생계정 숨김·이름 고정(카페24 덮어쓰기 방지)
import { resolveRecordingStudents } from './recording-students';   // 🎓 녹화 목록 「학생」 칸 정본(계정 완전일치로만 판정)
import { resolveRecordingTeachers } from './recording-teacher';    // 🧑‍🏫 녹화 목록 「교사」·「아이디」 칸 정본(같은 규칙)
import { sfuProxy, sfuConfigured, SFU_OPS, SFU_SESSION_RE } from './realtime-sfu';  // 📡 Realtime SFU 자격증명 경계 (C안 1단계 — 시크릿 없으면 꺼짐)
import { recordingDupGate, REC_DUP_LIVE_WINDOW_MS } from './recording-dup-guard';  // 🎥 같은 방 «동시 녹화» 방지 정본 (실패하면 «찍는 쪽» 으로)
import { applyRoomOverrides } from './class-room-override';       // 🚪 「오늘은 이 방으로」 — 예약 한 건을 하루만 회의방으로 돌린다
import { loadSchedSummaryMap, loadSchedSummaryOne, EMPTY_SCHED_SUMMARY } from './student-schedule-summary';  // 📘 「예약 수업」 칸 정본 (students_erp 의 수강 칸은 카페24가 정본이라 늘 «—» 였다)       // 🚪 「오늘은 이 방으로」 — 예약 한 건을 하루만 회의방으로 돌린다

export interface MangoEnv extends GiftishowEnv, SolapiEnv, EmailEnv {
  DB: D1Database;
  SESSION_STATE: KVNamespace;
  // 📼 수업 녹화 파일 저장소 — 런타임엔 wrangler.toml 로 이미 묶여 있는데 «타입 선언만»
  //   없었다. /api/recordings/stop 이 «실물이 있는가» 를 직접 확인하려면 필요하다(2026-08-26).
  RECORDINGS?: R2Bucket;
  // 📧 이메일(Resend) — 레벨테스트 신규신청 관리자 알림 + 교사 배정 알림
  //   RESEND_API_KEY, RESEND_FROM, LEVELTEST_ADMIN_EMAIL (email.ts / EmailEnv)
  // 🎯 레벨테스트 신청자 확정 알림톡 템플릿(선택) — 미설정 시 문자(SMS) 폴백
  SOLAPI_TEMPLATE_LEVELTEST?: string;
  // 🕸️ Neo4j 그래프 DB (teacher-match.ts runCypher 공용 시크릿)
  NEO4J_QUERY_URL?: string;
  NEO4J_USER?: string;
  NEO4J_PASSWORD?: string;
  // 🥭 Phase 21 — Workers AI 바인딩 (검색창 AI 명령)
  AI?: any;
  // 🔒 (2026-08-08) 동시접속 1세션 킬 스위치 — 'on' 일 때만 작동. 기본 off(dormant).
  //   auth-token.ts 의 singleSessionOn / startSession / verifyUidToken 이 읽는다.
  SINGLE_SESSION?: string;
  // 📟 UptimeRobot 장애 웹훅 → 관리자 문자 알림 (api-uptime.ts)
  UPTIME_HOOK_KEY?: string;    // 웹훅 호출 보호 토큰(무단 호출 방지)
  OWNER_ALERT_PHONE?: string;  // 장애 문자 받을 관리자 번호
  // 🎁 Phase P4 — 기프티쇼 비즈 환경변수 (giftishow-client.ts)
  //   GIFTISHOW_API_KEY, GIFTISHOW_USER_ID, GIFTISHOW_API_BASE, GIFTISHOW_CALLBACK_URL, GIFTISHOW_TEST_MODE
  // 💬 Phase K2~K4 — 카카오 알림톡 환경변수 (solapi-client.ts)
  //   SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_PFID, SOLAPI_TEMPLATE_*, SOLAPI_TEST_MODE
}

// json / parseJsonBody 는 api-util.ts 로 분리 (도메인별 api-*.ts 공용)

// (월간리포트 모듈함수 4종 → api-reports.ts, 20차 — 크론은 api-reports 에서 import)

// fix (2026-06-01) — 포인트 테이블 DDL 을 isolate 당 1회만 실행.
//   매 요청마다 CREATE TABLE 6개를 돌리면, 페이지 로드 시 동시 요청 폭주 →
//   D1 락/과부하 → 미처리 예외 → Cloudflare 503 발생. 이 플래그로 방지.
// (DDL 1회 실행 플래그 3종 → api-points.ts, 11차)

// (today() KST 날짜 헬퍼 → api-util.ts, 11차)

// (computeAttendanceStreak · reconcileAllStreaks → api-games.ts 로 이동, 3차 2026-07-14)



// (invalidBody → api-util.ts, 8차)

// (toCSV → api-util.ts, 8차)

// ========================================================================
// 💼 Payroll (Phase 8) — Mangoi 강사 급여·평가 시스템
//   - 모델: salary-heatmap.pages.dev 와 동일
//   - 월급 = 총 수업수(20분 단위) × 2 × 10분당 단가(PHP)
//   - 평가 = 5개 카테고리 가중 평균 → 4등급 자동 분류
//   - 근무 형태: 'office' | 'home' (rank 폐기, 호환성 위해 컬럼만 유지)
// (payroll 상수·계산 클러스터 → api-admin.ts, 8차)

// (csvResponse → api-util.ts, 8차)

// ========================================================================
// 📣 알림 큐 (Phase 5) — Worker 는 적재만 하고, 발송은 외부 도구가 폴링.
//   - 카카오톡 직접 발송은 후속 Phase (KAKAO_ACCESS_TOKEN 시크릿 도입) 에서.
//   - 큐 모델은 다채널 확장 가능 (slack/email/discord 등).
// ========================================================================
// (_notifSchemaReady → api-notify.ts, 8차)
// (ensureNotifSchema → api-notify.ts, 8차)

// (enqueueNotification → api-notify.ts, 8차)

// (seedGiftCatalog → api-points.ts, 11차)

/* 🧱 (2026-08-06 동시접속 진단) 자가치유 DDL 을 «요청마다» 돌리지 않기 위한 isolate 단위 빗장.
 *
 *  왜 — 수업 입장(출결 기록) 한 번에 스키마 명령이 5개 실행되고 있었다:
 *    CREATE TABLE attendance / ALTER ADD attended_at / ALTER ADD last_seen_at / CREATE INDEX
 *    (+ sessions/today 의 CREATE TABLE class_schedules)
 *  50명이 정각에 몰리면 실제 일을 하기도 전에 250개의 스키마 명령이 D1 에 먼저 쌓인다.
 *  게다가 ALTER 두 개는 «항상 실패하는» 문장이라(이미 컬럼이 있으므로) 매번 예외까지 만들었다.
 *
 *  무엇을 지키고 무엇을 바꿨나 — 자가치유 «기능» 은 그대로 둔다(운영 D1 에 컬럼이 없을 수 있다는
 *  전제는 여전히 유효하다). 다만 한 isolate 안에서 한 번만 돌린다. Workers 는 isolate 를 재사용하므로
 *  사실상 대부분의 요청에서 사라진다. 새 isolate 가 뜨면 다시 한 번 돌아 자가치유는 계속 보장된다.
 *  ⚠️ 실패하면 빗장을 걸지 않는다 — 한 번 삐끗했다고 영영 안 고치면 자가치유가 무너진다.
 */
const _ddlDone = new Set<string>();
async function ensureSchemaOnce(key: string, run: () => Promise<void>): Promise<void> {
  if (_ddlDone.has(key)) return;
  try { await run(); _ddlDone.add(key); }
  catch { /* 다음 요청에서 다시 시도 — 일부러 빗장을 걸지 않는다 */ }
}

/* 📡 SFU 를 켤 수 있는 방인가 — «그 수업의 사람» 인지 본다. (2026-09-04)
   [왜 필요한가] 위 sfu-peers 주석 참고. 소유권 기록만으로는 아무나 아무 방으로 세션을 만든다.
   [규칙] · `class-{예약id}-{YYYYMMDD}` 예약방 → 관리자·강사 세션은 통과, 학생은 그 예약의 학생일 때만
          · 그 밖의 방(공용 연습방 `mangoi-class`·`demo-*`·`meet-*`) → 통과.
            그 방들은 mesh 도 누구나 들어가므로 SFU 만 좁히면 «되던 것» 이 깨진다.
   ⛔ 못 찾으면 **막는다**(false). verify-room 은 수업을 막지 않으려고 fail-open 이지만,
      여기서 막히는 것은 SFU 하나뿐이라 반대 방향이 맞다.
   ⚠️ 대소문자는 정확일치 먼저 — `Kim`/`kim` 처럼 대소문자만 다른 계정이 실재한다(CLAUDE.md 2장). */
async function sfuRoomAllowed(env: any, room: string, ident: { uid: string; kind: 'admin' | 'student' }): Promise<boolean> {
  const m = /^class-(\d+)-\d{8}$/.exec(room);
  if (!m) return true;                       // 예약방이 아니면 mesh 와 같은 문턱
  if (ident.kind === 'admin') return true;    // 강사·본사 — 참관·수업이 이 경로로 온다
  try {
    /* ⚠️ `.first<any>()` 로 쓰지 말 것 — env 가 any 라 prepare 체인이 «타입 없는 호출» 이고,
       거기에 타입인자를 주면 TS2347 로 컴파일이 깨진다(CI 게이트 ①이 실제로 잡았다). */
    const row = await env.DB.prepare(`SELECT user_id FROM class_schedules WHERE id = ?`).bind(Number(m[1])).first() as any;
    if (!row) return false;
    const mine = String(ident.uid || '');
    const owner = String(row.user_id || '');
    if (!owner || !mine) return false;
    return owner === mine || owner.toLowerCase() === mine.toLowerCase();
  } catch { return false; }                   // 조회 실패 = 모름 = 막는다(SFU 만 안 켜진다)
}

export async function handleMangoApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  ctx?: ExecutionContext   // 🧠 판단력 비동기 분석(waitUntil) 전달용 — 선택적(하위호환)
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

  // (sendPushToUser → api-notify.ts 로 승격 — admin 5회차)

  try {
    // ===== 📶 화상수업 회선품질 로깅 (fire-and-forget, 통화 경로와 무관) — 강사별 인터넷 품질 파악 =====
    if (path === '/api/vc/quality-log' && method === 'POST') {
      try {
        const b: any = await request.json().catch(() => null);
        if (!b || !b.uid) return json({ ok: true });   // 로깅은 실패해도 무관 → 조용히 무시
        await ensureSchemaOnce('vc_quality', async () => {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_quality (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, room TEXT, uid TEXT, name TEXT, role TEXT, avg_loss REAL, max_loss REAL, avg_rtt REAL, aao INTEGER, samples INTEGER)`);
          /* 📶 (2026-08-26) novideo — «영상 표본이 아예 없던 4초 틱» 의 수(카메라 끔·영상 죽음).
             예전엔 그런 사람의 기록이 **통째로 안 남았다**(js/idx-vc-qlog.js 머리말) — 8/26 하루
             예상 ~2,900건 중 실제 25건. 「끊긴다」 제보를 숫자로 확인할 방법이 없던 이유다.
             ⚠️ CREATE 문에는 넣지 않는다 — 같은 표를 만드는 CREATE 가 api-admin.ts:582 에
                «한 벌 더» 있고, IF NOT EXISTS 는 먼저 실행된 쪽이 이긴다. 두 벌의 모양이
                갈리면 새 DB(개발용·복구본)에서 어느 쪽이 이겼느냐로 결과가 달라진다
                (schema_drift_harness 가 그래서 FAIL 을 낸다). 그러니 ALTER 로만 붙인다 —
                `attendance.host` 와 같은 방식이다. 이미 있으면 예외가 나는데 그게 정상이라 삼킨다. ⚠️ 이 ALTER 는 **첫 로그가 들어와야** 돈다 — 배포 직후
                SQL 을 돌리면 `no such column: novideo` 가 나오지만 배포 실패가 아니다
                (CLAUDE.md 2장 `attendance.host` 와 같은 사정). */
          try { await env.DB.exec(`ALTER TABLE vc_quality ADD COLUMN novideo INTEGER DEFAULT 0`); } catch {}
          /* 📥 (2026-09-01 class-1015 「화면이 흐리고 소리가 끊긴다」) «받는 쪽» 지표.
             그전까지 이 표는 sender.getStats() 만 담았다 = «내가 보내는 것» 뿐이었다.
             그런데 제보는 전부 «내가 받는 화면·소리» 였고, 그 숫자가 아예 없어서
             매번 추측으로 끝났다(js/idx-vc-qlog.js 머리말 [원인 ②]).
               · rx_loss/rx_aloss — 받은 영상·오디오 손실률(%)
               · rx_conceal       — 소리가 끊겨 브라우저가 «메꾼» 비율(%). 「소리 끊김」의 직접 지표
               · rx_freeze        — 받은 영상이 멈춘 횟수
               · p95_loss         — 보내는 쪽 손실의 상위 5%. 평균이 가리는 스파이크를 남긴다
               · peers            — 그 1분 동안 동시에 붙어 있던 상대 수(유령 연결 판별)
             ⚠️ «모름» 은 -1 이다. 0 으로 적으면 «표본이 없는 사람» 이 «제일 좋은 사람» 이 된다.
             ⚠️ CREATE 문에는 넣지 않는다 — 같은 표를 만드는 CREATE 가 api-admin.ts 에 한 벌 더
                있고 IF NOT EXISTS 는 먼저 실행된 쪽이 이긴다(위 novideo 주석과 같은 사정). */
          for (const c of ['rx_loss REAL DEFAULT -1', 'rx_aloss REAL DEFAULT -1', 'rx_conceal REAL DEFAULT -1',
                           'rx_freeze INTEGER DEFAULT 0', 'p95_loss REAL DEFAULT 0', 'peers INTEGER DEFAULT 0']) {
            try { await env.DB.exec(`ALTER TABLE vc_quality ADD COLUMN ${c}`); } catch {}
          }
          /* 🛰 (2026-09-03 class-1016·meet-123 Farrah) «어떤 길로 갔는가» — 중계(TURN)/직접(P2P).
             RTT 1초가 2분 뒤 60ms 로 떨어졌는데 경로가 바뀐 것인지 회선이 풀린 것인지 가릴 칸이 없었다.
               · path        — 'relay' | 'direct' | 'mixed' | ''(모름). ⛔ 모름을 direct 로 적지 않는다
               · relay_ticks — 그 1분에 «중계» 였던 4초 틱 수 · path_ticks — 경로를 «안» 틱 수
               · turn        — 내 쪽이 중계일 때 그 TURN 서버(host:port proto). Cloudflare 인지 무료 폴백인지가 여기서 갈린다
             ⚠️ 역시 ALTER 로만 붙인다(위 주석과 같은 사정). 첫 로그가 들어와야 칸이 생긴다. */
          for (const c of ["path TEXT DEFAULT ''", "turn TEXT DEFAULT ''", 'relay_ticks INTEGER DEFAULT 0', 'path_ticks INTEGER DEFAULT 0']) {
            try { await env.DB.exec(`ALTER TABLE vc_quality ADD COLUMN ${c}`); } catch {}
          }
          /* 🌐 (2026-09-03 필리핀 사무실 회선) net·isp·country — «어느 인터넷 회선인가».
             [왜] 강사 약 10명이 사무실 공인 IP 하나를 나눠 쓰는데, 이 표는 사람(uid)별이라
                «그 회선이 매일 몇 시에 막히는가» 를 볼 수 없었다. 통신사에 항의할 근거가 그 표다.
             ⛔ IP 를 통째로 남기지 않는다 — 이 표에는 학생(다수가 미성년자) 기록도 함께 쌓인다.
                묶는 데 필요한 것은 네트워크 부분뿐이라 /24(IPv4)·/48(IPv6)로 자른다(src/net-prefix.ts).
             ⚠️ CREATE 문에는 넣지 않는다 — 위 novideo·rx_* 와 같은 사정(CREATE 가 두 벌이다). */
          for (const c of ['net TEXT', 'isp TEXT', 'country TEXT']) {
            try { await env.DB.exec(`ALTER TABLE vc_quality ADD COLUMN ${c}`); } catch {}
          }
        });
        /* ⚠️ rx_* 는 «모름» 이 -1 이라 `Number(x) || 0` 을 쓰면 안 된다 — 모름이 0(=완벽)으로 뒤집힌다.
           화면에서 정확히 그 형태의 사고가 났었다(CLAUDE.md 2장 「영상이 죽은 사람이 회선이 제일 좋은 사람으로」). */
        const num = (v: any, dflt: number) => { const n = Number(v); return Number.isFinite(n) ? n : dflt; };
        /* 🛰 path 는 «아는 값» 만 받는다(모르는 문자열은 빈 값 = 모름). turn 은 서버 주소 한 줄이라 글자를 좁히고 길이를 자른다
           — 이 경로는 무인증이라 본문이 곧 남의 손이다(관리자 화면에 그대로 그려진다). */
        const PATHS = ['relay', 'direct', 'mixed'];
        const pathV = PATHS.indexOf(String(b.path || '')) >= 0 ? String(b.path) : '';
        const turnV = String(b.turn || '').replace(/[^A-Za-z0-9.:\-_ ]/g, '').slice(0, 96);
        /* 🌐 회선 식별 — 서버가 «본» 값만 쓴다. ⛔ 본문(b)에서 받지 않는다(위조 가능).
           ⚠️ request.cf 는 로컬 개발·테스트에서 없다. 없으면 빈 값이고 그게 정상이다. */
        const _cf: any = (request as any).cf || {};
        const _net = ipToNet(request.headers.get('CF-Connecting-IP') || '');
        const _isp = asLabel(_cf.asn, _cf.asOrganization);
        const _cc = String(_cf.country || '').slice(0, 2);
        await env.DB.prepare(`INSERT INTO vc_quality (ts, room, uid, name, role, avg_loss, max_loss, avg_rtt, aao, samples, novideo, rx_loss, rx_aloss, rx_conceal, rx_freeze, p95_loss, peers, path, turn, relay_ticks, path_ticks, net, isp, country) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(Date.now(), String(b.room || ''), String(b.uid), String(b.name || ''), String(b.role || ''),
            Number(b.avg_loss) || 0, Number(b.max_loss) || 0, Number(b.avg_rtt) || 0, Number(b.aao) || 0, Number(b.samples) || 0,
            Number(b.novideo) || 0,
            num(b.rx_loss, -1), num(b.rx_aloss, -1), num(b.rx_conceal, -1),
            num(b.rx_freeze, 0), num(b.p95_loss, 0), num(b.peers, 0),
            pathV, turnV, Math.max(0, num(b.relay_ticks, 0)), Math.max(0, num(b.path_ticks, 0)),
            _net, _isp, _cc).run();
        if (Math.random() < 0.02) { try { await env.DB.prepare(`DELETE FROM vc_quality WHERE ts < ?`).bind(Date.now() - 30 * 86400000).run(); } catch (e) { console.warn('[vc-quality-log] 30일 정리 실패', (e as any)?.message); } }  /* 30일 지난 것 가끔 정리. ⚠️ 2026-09-03 부터 접속 회선(net·isp·country)도 담기므로
     이 정리가 조용히 실패하면 그 기록이 계속 쌓인다. 📌 이 표는 승인받은 파기 정본(src/retention.ts)에
     **없다** — 정본에 등록할지는 사람이 정할 일이다(작업기록 6장). */
        return json({ ok: true });
      } catch (e) {
        /* 로깅은 실패해도 수업과 무관하니 200 을 돌려주지만, 쓰기가 실패한 «사실» 은 남긴다 — 칸이 늘 때마다
           INSERT 가 조용히 죽어도 아무도 모르는 것이 이 표의 반복 사고였다(silent_catch_harness). */
        console.warn('[vc-quality-log] 기록 실패', (e as any)?.message);
        return json({ ok: true });
      }
    }

    // ===== 🛠️ 진단 + 테이블 부트스트랩 =====
    if (path === '/api/_bootstrap' && method === 'GET') {
      const result: any = { ok: true, ts: new Date().toISOString(), tables_created: [], errors: [] };
      const tables = [
        ['teacher_profiles', `CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`],
        ['community_posts', `CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        ['student_payments', `CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`],
        // ═══ Phase P1: 포인트 시스템 ═══
        ['student_points', `CREATE TABLE IF NOT EXISTS student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);`],
        ['point_transactions', `CREATE TABLE IF NOT EXISTS point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);`],
        ['point_rules', `CREATE TABLE IF NOT EXISTS point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);`],
        ['gift_catalog', `CREATE TABLE IF NOT EXISTS gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        ['gift_redemptions', `CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);`],
        ['point_rule_log', `CREATE TABLE IF NOT EXISTS point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT);`],
        // ═══ Phase K1: 화상수업 채팅 영속화 ═══
        ['chat_messages', `CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, sent_at INTEGER NOT NULL, meta TEXT);`],
        // ═══ Phase E1: 학생 평가서 ═══
        ['student_evaluations', `CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_speaking INTEGER, score_overall INTEGER, strengths TEXT, improvements TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified INTEGER DEFAULT 0, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`],
        // ═══ Phase POP: 팝업/공지 시스템 ═══
        ['popup_announcements', `CREATE TABLE IF NOT EXISTS popup_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'mixed', body_html TEXT, image_url TEXT, video_url TEXT, link_url TEXT, link_text TEXT, width INTEGER DEFAULT 480, height INTEGER DEFAULT 360, width_mobile INTEGER, height_mobile INTEGER, position TEXT DEFAULT 'center', priority INTEGER DEFAULT 0, start_at INTEGER, end_at INTEGER, enabled INTEGER DEFAULT 1, dismiss_options TEXT DEFAULT 'today,7days', target_filter TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, view_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0);`],
        ['popup_views', `CREATE TABLE IF NOT EXISTS popup_views (id INTEGER PRIMARY KEY AUTOINCREMENT, popup_id INTEGER NOT NULL, user_id TEXT, viewed_at INTEGER NOT NULL, clicked INTEGER DEFAULT 0, click_target TEXT, user_agent TEXT);`],
        ['popup_dismissals', `CREATE TABLE IF NOT EXISTS popup_dismissals (popup_id INTEGER NOT NULL, user_id TEXT NOT NULL, dismissed_at INTEGER NOT NULL, dismissed_until INTEGER NOT NULL, PRIMARY KEY (popup_id, user_id));`],
      ];
      for (const [name, sql] of tables) {
        try {
          await env.DB.exec(sql);
          const check = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first();
          if (check) result.tables_created.push(name);
          else result.errors.push({ table: name, error: '생성 후 조회 실패' });
        } catch (e: any) {
          result.errors.push({ table: name, error: String(e?.message || e) });
        }
      }
      result.build_stamp = (env as any).BUILD_STAMP || 'unknown';
      result.ok = result.errors.length === 0;
      return json(result);
    }

    // ===== 📝 학생/학부모 수업 피드백 조회 (본인 것만) — 2026-07-22 학부모 컴플레인 #3 =====
    //   teacher_feedbacks 는 그동안 관리자/강사 화면에서만 소비돼 학부모가 볼 수 없었다.
    //   /api/student/feedbacks?uid=  — 토큰 uid(또는 본인 등록 이름) 일치 필수, IDOR 차단.
    if (path === '/api/student/feedbacks' && method === 'GET') {
      const uid = (url.searchParams.get('uid') || '').trim();
      const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
      if (!uid) return json({ ok: true, rows: [], count: 0 });
      const fbAuthUid = await authUidGlobal(request, url, env);
      if (!fbAuthUid) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 피드백만 조회할 수 있습니다.' }, 401);
      }
      // 본인 판정 — recordings 와 동일 규칙(피드백도 student_uid 없으면 '이름'으로 저장됨)
      let fbNames: string[] = [uid];
      if (fbAuthUid !== uid) {
        let own: string[] = [];
        try {
          const s: any = await env.DB.prepare(`SELECT student_name, korean_name, english_name, username FROM students_erp WHERE user_id = ?`).bind(fbAuthUid).first();
          own = [s?.student_name, s?.korean_name, s?.english_name, s?.username]
            .map((v: any) => String(v || '').trim()).filter((v: string) => !!v);
        } catch {}
        const DEMO_FB_NAMES: Record<string, string> = {
          hong: '홍길동', kim: '김민수', lee: '이지민', park: '박서연', navy111p: '정우영', student: '데모학생',
        };
        if (DEMO_FB_NAMES[fbAuthUid]) own.push(DEMO_FB_NAMES[fbAuthUid]);
        if (!own.includes(uid)) {
          return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 피드백만 조회할 수 있습니다.' }, 401);
        }
      } else {
        // 토큰 주인 본인 조회 — 이름으로 저장된 과거 피드백도 함께 보이도록 등록 이름 추가
        try {
          const s: any = await env.DB.prepare(`SELECT student_name, korean_name, english_name, username FROM students_erp WHERE user_id = ?`).bind(uid).first();
          [s?.student_name, s?.korean_name, s?.english_name, s?.username]
            .map((v: any) => String(v || '').trim()).filter((v: string) => !!v)
            .forEach((n: string) => { if (!fbNames.includes(n)) fbNames.push(n); });
        } catch {}
      }
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_feedbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, room_id TEXT, attendance_id INTEGER, teacher_name TEXT, class_at INTEGER NOT NULL, rating INTEGER, summary TEXT, content TEXT, action_items TEXT, created_at INTEGER NOT NULL);`);
        const ph = fbNames.map(() => '?').join(',');
        const rs = await env.DB.prepare(
          `SELECT id, teacher_name, class_at, rating, summary, content, created_at
             FROM teacher_feedbacks WHERE user_id IN (${ph})
            ORDER BY class_at DESC LIMIT ?`
        ).bind(...fbNames, limit).all();
        const rows = (rs.results || []) as any[];
        return json({ ok: true, rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ===== 📼 공개 학생 녹화본 조회 (본인이 참여한 수업만) =====
    //   /api/student/recordings?uid=정우영&limit=50
    //   recordings 테이블에서 participant_ids LIKE '%uid%' 또는 teacher_name = uid
    //   재생 URL: file_url 우선, 없으면 R2 blob URL 자동 생성
    if (path === '/api/student/recordings' && method === 'GET') {
      const uid = (url.searchParams.get('uid') || '').trim();
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
      if (!uid) return json({ ok: true, rows: [], count: 0 });
      // 🔐 [PII] 본인 녹화만 — 토큰 uid 일치 요구(남의 수업영상 목록·재생키 열람 차단, IDOR)
      //   녹화는 화상수업 관례상 학생 '이름'으로 저장되는 경우가 있어, 토큰 주인의
      //   등록 이름으로 조회하는 것도 본인으로 인정한다. (student_name 이 NULL 인 이관
      //   데이터가 많아 korean_name·english_name·username 까지 본인 이름으로 본다)
      const recAuthUid = await authUidGlobal(request, url, env);
      /* 🧑‍🏫 (2026-08-13, 필리핀 IT매니저 Karl «Double Login Issue»)
         [사고] 이미 «Teacher Win» 으로 로그인한 강사가 메뉴 → 「녹화 보기」를 누르면
                로그인 창이 한 번 더 떴다. 교사·본사·지사 로그인은 admin_sessions 쿠키만
                만들고 학생용 mango_token 은 만들지 않는데(idx-user-session.js 116줄 참고),
                이 «목록» 엔드포인트만 토큰을 요구했기 때문이다.
         [근거] 같은 녹화의 «재생» 은 이미 관리자 세션을 받는다(recordings-r2.ts 367줄).
                목록만 안 받아서 생긴 한쪽짜리 게이트였고, 관리자 세션 보유자는 이미
                /api/recordings/list-recent 로 전체 녹화를 열람할 수 있다 — 권한이 넓어지는
                지점은 없고, 재생 쪽과 판정을 맞추는 것뿐이다.
         ⚠️ 학생 신분(mangoi_logged_user)을 만들어 주는 방식으로 풀지 말 것 —
            교사 계정으로 학생 전용 기능이 열린다. 여기서 조회 권한만 인정한다. */
      const recAdminSess = recAuthUid ? { ok: false } : await checkAdminSession(request, env as any);
      if (!recAuthUid && !recAdminSess.ok) {
        return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 녹화만 조회할 수 있습니다.' }, 401);
      }
      // 재생 URL 에 동봉할 원본 토큰 (authUidGlobal 과 동일한 우선순위: Bearer > ?token=)
      //   관리자·교사 세션으로 들어온 요청은 토큰이 없다 → 빈 문자열. 재생은 쿠키로 통과한다.
      const recPlayHdr = request.headers.get('Authorization') || '';
      const recPlayTok = recPlayHdr.startsWith('Bearer ') ? recPlayHdr.slice(7).trim()
        : String(url.searchParams.get('token') || '').trim();
      if (recAuthUid && recAuthUid !== uid) {
        let recOwnNames: string[] = [];
        try {
          const s: any = await env.DB.prepare(`SELECT student_name, korean_name, english_name, username FROM students_erp WHERE user_id = ?`).bind(recAuthUid).first();
          recOwnNames = [s?.student_name, s?.korean_name, s?.english_name, s?.username]
            .map((v: any) => String(v || '').trim()).filter((v: string) => !!v);
        } catch {}
        // 🎭 데모 빠른 로그인 카드 — 화상수업 표시이름(카드 이름)이 계정 이름과 달라
        //    index.html demoStudents 매핑을 서버에서도 본인 이름으로 인정 (데모 전용)
        const DEMO_CARD_NAMES: Record<string, string> = {
          hong: '홍길동', kim: '김민수', lee: '이지민', park: '박서연', navy111p: '정우영', student: '데모학생',
        };
        if (DEMO_CARD_NAMES[recAuthUid]) recOwnNames.push(DEMO_CARD_NAMES[recAuthUid]);
        if (!recOwnNames.includes(uid)) {
          return json({ ok: false, error: 'auth_required', message: '로그인 후 본인 녹화만 조회할 수 있습니다.' }, 401);
        }
      }
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, teacher_id TEXT, teacher_name TEXT, filename TEXT, file_url TEXT, size_bytes INTEGER, duration_ms INTEGER, participant_ids TEXT, participant_names TEXT, consented_user_ids TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, storage TEXT, expires_at INTEGER);`);
        const likePattern = '%' + JSON.stringify(uid).slice(1, -1) + '%';
        const rs = await env.DB.prepare(
          `SELECT id, room_id, teacher_id, teacher_name, filename, file_url, size_bytes, duration_ms,
                  started_at, ended_at, status, storage, participant_names, participant_ids
             FROM recordings
            WHERE (participant_ids LIKE ? OR participant_names LIKE ? OR teacher_name = ? OR teacher_id = ?)
              AND status != 'deleted'
              -- 'aborted' = 시작만 하고 데이터가 어디에도 없는 빈 껍데기.
              -- 학생 목록에 ⏳준비중 으로 영원히 남아 «언젠가 볼 수 있나» 오해를 준다 (2026-08-05)
              AND status != 'aborted'
            ORDER BY started_at DESC
            LIMIT ?`
        ).bind(likePattern, likePattern, uid, uid, limit).all();
        const raw = (rs.results || []) as any[];
        const rows = await Promise.all(raw.map(async (r: any) => {
          const startMs = r.started_at || 0;
          const date = startMs ? new Date(startMs).toISOString().slice(0,10) : '-';
          const durSec = r.duration_ms ? Math.round(r.duration_ms / 1000) : 0;
          const durStr = durSec >= 60 ? Math.round(durSec / 60) + '분' : (durSec + '초');
          const sizeMB = r.size_bytes
            ? (r.size_bytes >= 1048576 ? (Math.round(r.size_bytes / 104857.6) / 10) + ' MB' : Math.round(r.size_bytes / 1024) + ' KB')
            : '-';
          // 🎬 재생 URL — 인증 게이트가 있는 /api/recording/play?id= 로 발급 (2026-07-20).
          //   과거엔 공개 blob 키 URL 을 그대로 줬는데, 키를 아는 누구나 재생 가능한 통로라
          //   서명 토큰을 동봉한 play 엔드포인트로 교체(소유권은 서버가 재검증).
          //   학생은 요청에 들고 온 mango_token 을 그대로 되돌려 준다(recPlayTok).
          //   📼 교사·관리자 세션(쿠키 인증)은 토큰이 없다 — 그대로 두면 카톡 인앱 브라우저·
          //   안드로이드 WebView 가 ⬇저장(다운로드)을 쿠키 없는 다운로드 관리자에 위임할 때
          //   401 로 조용히 실패한다(«휴대폰 저장 안 됨», 2026-08-13). 그래서 이 녹화 1건
          //   전용 단기 서명(&sig=)을 동봉한다 — 발급은 이 핸들러의 인증을 통과한 뒤에만,
          //   범위는 id 하나뿐이라 권한이 넓어지는 지점이 없다(auth-token.ts signRecDlSig).
          let playUrl = '';
          if (r.file_url && /^https?:\/\//.test(String(r.file_url))) {
            playUrl = String(r.file_url);         // 외부 http(s) 녹화는 그대로
          } else if (r.file_url || r.filename) {
            playUrl = '/api/recording/play?id=' + r.id
              + (recPlayTok ? '&token=' + encodeURIComponent(recPlayTok)
                            : '&sig=' + encodeURIComponent(await signRecDlSig(r.id, env)));
          }
          // 🔴 2026-08-04: 업로드가 실패한 녹화는 DB status 가 'completed' 여도 R2 에 실물이
          //   없다(storage 로만 구분됨). 재생 URL 을 주면 학생이 눌렀을 때 404 → "재생할 수
          //   없어요"(보관기간 만료로 오해)가 뜬다. 여기서 미리 걸러 '저장 실패'로 알린다.
          const storageStr = String(r.storage || '');
          const failed = storageStr === 'r2_failed' || storageStr === 'error'
            || storageStr === 'debug' || String(r.status || '') === 'upload_failed';
          return {
            id: r.id,
            date,
            topic: '방 ' + (r.room_id || '-') + ' 수업',
            teacher: r.teacher_name || '-',
            duration: durStr,
            size: sizeMB,
            url: failed ? '' : playUrl,
            status: r.status || 'completed',
            storage: storageStr,
            failed,
          };
        }));
        return json({ ok: true, rows, recordings: rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, rows: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // 🤖 AI 추천 — 학생 녹화본 중 '집중도 높고 끊김 적은 최고의 수업' 자동 선택
    //   GET /api/admin/student/best-recording?uid=  (admin)
    //   점수 = 집중도(gaze)×0.5 + 참여율(active%)×0.3 + 끊김 적을수록 가점×0.2
    if (method === 'GET' && path === '/api/admin/student/best-recording') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid 필요' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS recordings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, teacher_id TEXT, teacher_name TEXT, filename TEXT, file_url TEXT, size_bytes INTEGER, duration_ms INTEGER, participant_ids TEXT, participant_names TEXT, consented_user_ids TEXT, started_at INTEGER, ended_at INTEGER, status TEXT, storage TEXT, expires_at INTEGER);`);
        const likePattern = '%' + JSON.stringify(uid).slice(1, -1) + '%';
        const rs = await env.DB.prepare(
          `SELECT id, room_id, file_url, filename, duration_ms, started_at, status
             FROM recordings
            WHERE (participant_ids LIKE ? OR participant_names LIKE ? OR teacher_name = ? OR teacher_id = ?)
              AND status != 'deleted'
            ORDER BY started_at DESC LIMIT 50`
        ).bind(likePattern, likePattern, uid, uid).all();
        const recs = (rs.results || []) as any[];
        const scored: any[] = [];
        for (const r of recs) {
          let att: any = null;
          try {
            att = await env.DB.prepare(
              `SELECT gaze_score, disconnect_count, total_active_ms, total_session_ms
                 FROM attendance WHERE room_id = ? AND user_id = ? ORDER BY joined_at DESC LIMIT 1`
            ).bind(r.room_id, uid).first();
          } catch {}
          const gaze = (att && typeof att.gaze_score === 'number') ? att.gaze_score : null;
          const disc = (att && att.disconnect_count) || 0;
          const activePct = (att && att.total_session_ms > 0)
            ? Math.round(att.total_active_ms * 100 / att.total_session_ms) : null;
          const gazeV = gaze == null ? 60 : gaze;        // 데이터 없으면 중립값
          const activeV = activePct == null ? 70 : activePct;
          const smoothV = Math.max(0, 100 - Math.min(100, disc * 20));
          const score = Math.round(gazeV * 0.5 + activeV * 0.3 + smoothV * 0.2);
          const key = r.file_url || r.filename || '';
          const date = r.started_at ? new Date(r.started_at).toISOString().slice(0, 10) : '-';
          scored.push({
            id: r.id, room_id: r.room_id, recording_key: key, date,
            duration_sec: Math.round((r.duration_ms || 0) / 1000),
            gaze, disconnect: disc, active_pct: activePct, score,
          });
        }
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0] || null;
        let reason = '';
        if (best) {
          const parts: string[] = [];
          if (best.gaze != null) parts.push('집중도 ' + best.gaze);
          parts.push('끊김 ' + best.disconnect + '회');
          if (best.active_pct != null) parts.push('참여율 ' + best.active_pct + '%');
          reason = parts.join(' · ') + ' — 종합 ' + best.score + '점';
        }
        return json({ ok: true, best, reason, items: scored });
      } catch (e: any) {
        return json({ ok: false, error: e?.message }, 500);
      }
    }

    // ===== 👨‍🏫 공개 강사 목록 (학생 홈페이지 강사진 미리보기용) =====
    if (path === '/api/teacher-profiles' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);`);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)));
        const rs = await env.DB.prepare(
          `SELECT id, korean_name, english_name, image_url, intro_video_url, group_name, career, certifications, education, available_days, available_hours, status, origin_region, notes FROM teacher_profiles WHERE status = '활동중' ORDER BY korean_name ASC LIMIT ?`
        ).bind(limit).all();
        const rows = (rs.results || []) as any[];
        return json({ ok: true, items: rows, rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, items: [], rows: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // ===== 📢 공개 공지사항 (학생 홈페이지에서 인증 없이 조회) =====
    //   /api/community/posts?limit=20  →  community_posts 테이블에서 핀고정 우선·최신순으로 반환
    //   응답 shape: { ok, rows, posts, count } — 프론트엔드는 rows 또는 posts 둘 다 인식
    if (path === '/api/community/posts' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
        const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
        const rs = await env.DB.prepare(
          `SELECT id, title, body, author, pinned, created_at, updated_at
             FROM community_posts
            ORDER BY pinned DESC, created_at DESC
            LIMIT ?`
        ).bind(limit).all();
        const rows = (rs.results || []) as any[];
        return json({ ok: true, rows, posts: rows, count: rows.length });
      } catch (e: any) {
        return json({ ok: true, rows: [], posts: [], count: 0, _err: String(e?.message || e) });
      }
    }

    // ===== 출석 =====
    // 🔐 [무결성·제로회귀] 출석 쓰기용 소프트 인증 가드 (2026-07-19).
    //   원칙: "자격증명이 있는데 그게 다른 uid 를 가리킬 때만" 거부(=인증된 크로스유저 위조 차단).
    //   자격증명이 아예 없는 요청은 통과 → 결석률 100% 버그 방어 설계(무인증도 출석 인정)를 절대 안 깬다.
    //   교사=관리자 세션 쿠키(checkAdminSession, role 무관 통과)·학생=mango_token 이면 본인은 항상 OK.
    //   반환값: true = 진행 허용, false = 명백한 위조(거부해야 함).
    //
    //   🔴 (2026-09-04) claimedAccountUid 는 반드시 «계정 아이디» 여야 한다 — 출석 호출부는 account_uid.
    //     [무슨 일이 있었나] 출석 두 호출부(join·checkin)가 b.user_id 를 넘기고 있었다. 그런데
    //       mango-attendance.js 의 user_id 는 계정이 아니라 **기기 식별자(`u_`+난수) 또는 DO 임시번호**이고
    //       (아래 join INSERT 옆 주석·그 파일 accountUid 주석), 계정은 account_uid 로 «따로» 실린다.
    //       로그인해서 mango_token 을 실은 학생은 토큰 uid(jye46712) ≠ user_id(u_j4cs5c65bp) → **항상 403
    //       uid_mismatch**. 통과하는 사람은 «토큰 없는 요청(비로그인·토큰 없는 계정)» 과 «교사(관리자 세션)» 뿐이었다.
    //     [잰 것 — 2026-09-03 운영 D1] attendance.account_uid 가 남은 계정은 전 기간 4개(jeong·student·
    //       delaware·Lee — 관리자 jeong 외 셋은 «계정은 있는데 토큰은 없던» 로그인으로 보인다[추론]).
    //       최근 7일 vc_quality 에 잡힌 로그인 학생 11명 중 출석에 account_uid 가 남은 사람은 관리자
    //       jeong 하나. 그날 학생 출석 22행 중 19행은 이름·host·account_uid 가 전부 빈 행
    //       (/api/gaze-score 의 «행이 없으면 만든다» 폴백이 만든 것).
    //     [왜 아무도 몰랐나] 함수도 조건도 «있고» 틀린 것은 «무엇과 비교하는가» 뿐이라 문자열 하니스가
    //       전부 초록이었다. 2026-07-19 라이브 검증(보안_PII_감사.md 「본인토큰 200」)은 user_id 칸에
    //       계정을 넣어 보낸 것으로 보인다[추론 — 그 문서에 payload 가 없고, 옛 코드에서 200 이 나오려면
    //       그럴 수밖에 없다]. 실제 클라이언트는 그렇게 보내지 않는다(7/19 당시 클라이언트도 user_id=state.userId).
    //     [규칙] 토큰이 있으면 «토큰 uid === 계정 아이디» 일 때만 통과. 계정 아이디가 비어 있으면(옛
    //       클라이언트·비로그인) 지금처럼 통과 — account_uid 칸에는 아무것도 안 적히므로 «계정 칸 위조» 는
    //       성립하지 않고, 7/19 의 «자격증명 없는 요청은 통과» 취지(결석률 100% 버그 방어)도 지켜진다.
    //       ⚠️ 다만 user_id 를 계정으로 읽는 곳이 실재한다(api-students.ts 학부모 대시보드·api-games.ts·
    //       api-reports.ts·learning-insights.ts 의 `attendance WHERE user_id = ?`). 토큰 보유자가 account_uid 를
    //       비우고 user_id 에 남의 계정 문자열을 넣는 것은 막지 않는데, 그건 **익명 요청이 원래부터 할 수
    //       있던 일**이라 7/19 가 의도적으로 남긴 한계와 같은 수준이다(옛 게이트보다 나빠지지 않는다).
    //     [consents 호출부는 그대로 b.user_id] — mango-consent.js 는 user_id 칸에 «계정»(getCurrentUser 의
    //       uid)을 실어 보내므로 뜻이 같다(그 파일 83·192행). 그 표의 user_id 가 곧 계정 칸이다.
    //     감시: test-harness/attendance_soft_auth_harness.mjs — 이 함수와 호출부의 인자식을 소스에서
    //       오려 내 가짜 요청으로 **실제로 돌린다**(옛 인자 b.user_id 로 되돌리면 실제 FAIL).
    const _attnSoftAuthOk = async (claimedAccountUid: string, body: any): Promise<boolean> => {
      try {
        const _adm = await checkAdminSession(request, env as any);
        if (_adm.ok) return true;                          // 교사/관리자 세션 → 허용(대상 uid 무관)
        const _tok = await authUidGlobal(request, url, env, body);
        if (!_tok) return true;                             // 자격증명 없음 → 기존대로 허용(회귀 0)
        const _claimed = String(claimedAccountUid || '').trim();
        if (!_claimed) return true;                         // 계정을 안 적는 요청 → 남의 계정에 적힐 것이 없다(옛 클라·비로그인)
        return _tok === _claimed;                           // 토큰 있음 → 본인 계정일 때만 허용, 남의 계정이면 위조 거부
      } catch { return true; }                              // 검증 중 오류는 출석을 막지 않음(보수적)
    };

    if (path === '/api/attendance/join' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      /* 🚪 이 요청을 «받은 워커» 가 자기 DO 네임스페이스 지문을 이 도메인 이름으로 적어 둔다.
         두 워커는 D1·KV 를 공유하지만 DO 만 갈리므로, 도메인이 서로 다른 워커에 붙으면
         같은 방 번호로도 서로 못 만난다(2026-08-19·08-25·08-27·09-01 네 번 사고).
         15분 감시견(checkRoomSplit)이 이 값을 대조해 갈렸으면 사장님께 문자를 보낸다.
         ⚠️ 네트워크 호출 0회(순수 계산)이고, 절대 던지지 않는다 — 출석 기록을 막으면 안 된다. */
      try { await recordHostRoomNamespace(env as any, request.headers.get('Host')); } catch {}
      // 🔐 비교 대상은 «계정»(account_uid) — user_id 는 기기 식별자라 토큰과 영영 안 맞는다(2026-09-04, 헬퍼 주석).
      if (!(await _attnSoftAuthOk(b.account_uid, b))) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const now = Date.now();
      const date = today(now);
      // 📣 오늘 처음 보는 (room_id, date) 조합이면 "수업 시작" 알림 큐에 적재
      //    INSERT 와 별개 트랜잭션 — 알림 실패가 출석 기록을 막지 않도록.
      const existing = await env.DB.prepare(
        `SELECT 1 FROM attendance WHERE room_id = ? AND date = ? LIMIT 1`
      ).bind(b.room_id, date).first();
      // 📡 M1 — last_seen_at 은 서버 시각(now = Date.now(), 여기선 클라 값으로 대체되지 않음)
      let res;
      try {
        /* 🆔 (2026-08-12) account_uid — «계정» 아이디를 따로 남긴다.
           user_id 는 계정이 아니다. 로그인해도 브라우저 localStorage 의 기기 식별자
           (`u_`+난수)가 오고, 로그인 안 하면 접속마다 바뀌는 임시 번호가 온다.
           실측으로 한 기기 값이 두 계정에 걸쳐 있었다(같은 PC 를 두 사람이 씀).
           그래서 이 표만으로는 «누구의 수업인가» 를 끝내 알 수 없었고, 녹화 참가자와
           녹화 동의가 계정에 이어지지 못했다.
           ⚠️ user_id 는 그대로 둔다 — 출석·발화시간 집계가 그 값에 이어져 있다. 새 칸만 더한다. */
        res = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, account_uid, username, role, joined_at, status, date, last_seen_at, host)
           VALUES (?, ?, ?, ?, ?, ?, 'present', ?, ?, ?)`
        ).bind(b.room_id, b.user_id, b.account_uid || null, b.username || null, b.role || 'student', now, date, now, request.headers.get('Host') || null).run();
      } catch {
        // 컬럼이 아직 없는 배포본 → 한 번 만들어 두고 아래 기존 경로로 처리(다음 입장부터 채워진다)
        try {
          await env.DB.exec(`ALTER TABLE attendance ADD COLUMN account_uid TEXT`);
        } catch (e: any) {
          // 이미 있으면 여기로 온다(정상). 그 밖의 이유면 계정 아이디가 영영 안 쌓이므로 남긴다.
          const m = String(e?.message || e);
          if (!/duplicate column/i.test(m)) console.warn('[attendance] account_uid 컬럼 추가 실패:', m);
        }
        try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN host TEXT`); } catch {} // 이미 있으면 무시
        // 아직 checkin 이 한 번도 안 돌아 컬럼이 없는 배포본 대비 폴백(다음 checkin 이 ALTER 로 보강)
        res = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, username, role, joined_at, status, date)
           VALUES (?, ?, ?, ?, ?, 'present', ?)`
        ).bind(b.room_id, b.user_id, b.username || null, b.role || 'student', now, date).run();
      }
      /* ═══════════════════════════════════════════════════════════════════════
         🎓 강사가 레벨테스트 방에 들어오면 «수락한 것» 으로 본다  (2026-08-07)
         ───────────────────────────────────────────────────────────────────────
         [무슨 일이 있었나] 8/7 18:00 레벨테스트(신청 #15 · schedule 854).
           강사가 18:01 에 들어와 18:45 까지 빈 방을 지켰는데, 신청은 끝까지
           `proposed` 였다. 이 단계에서는 설계상 교사 이름을 학생에게 숨긴다
           (교사가 거절했을 때 «담당이 바뀌었다» 는 혼선을 막으려고).
           그래서 학생 홈 카드는 수업이 끝난 뒤까지 「담당 선생님 배정 중」 이었다.
         [왜 입장이 곧 수락인가] «들어왔다» 보다 분명한 수락 신호는 없다.
           별도의 수락 버튼을 새로 만들어 강사에게 하나 더 누르게 하는 것보다,
           이미 하는 행동을 읽는 편이 실제로 작동한다.
         [안전] proposed 일 때만 올린다 — confirmed·done·cancelled 는 그대로 둔다.
                실패해도 출석 기록에는 영향이 없다(위 INSERT 와 분리된 try).
         ═══════════════════════════════════════════════════════════════════════ */
      if ((b.role || 'student') === 'teacher') {
        try {
          const m = /^class-(\d+)-\d{8}$/.exec(String(b.room_id || ''));
          if (m) {
            await env.DB.prepare(
              `UPDATE leveltest_applications
                  SET status = 'confirmed', teacher_confirmed_at = ?, updated_at = ?
                WHERE schedule_id = ? AND status = 'proposed'`
            ).bind(now, now, Number(m[1])).run();
          }
        } catch { /* 레벨테스트 표가 없는 배포본 등 — 출석은 그대로 진행 */ }
      }

      if (!existing) {
        await enqueueNotification(env, {
          type: 'class_start',
          title: `🎬 수업 시작 — 방 ${b.room_id}`,
          body: `${b.username || b.user_id} 님 입장 (${b.role || 'student'})`,
          meta: { room_id: b.room_id, user_id: b.user_id, role: b.role || 'student', joined_at: now }
        });
        // 🆕 학생 본인 + 학부모에게 Web Push (학부모 user_id 매핑 시도)
        try {
          if ((b.role || 'student') === 'student') {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);`);
            // 본인 푸시 (학습 동기부여)
            const pushTitle = '🎓 수업 입장 완료!';
            const pushBody = `${b.username || b.user_id} 님 수업 시작했어요. 화이팅!`;
            const subRows = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(b.user_id).all();
            const eps = (subRows.results || []).map((r:any)=>r.endpoint);
            for (const ep of eps) {
              await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
                .bind(ep, pushTitle, pushBody, '/?go=videocall', '/img/icon-192.png', '/img/icon-192.png', `lesson-join-${b.room_id}`, now).run();
            }
            if (eps.length) await broadcastWebPush(eps, env as any);

            // 학부모 푸시 (parent_user_id 매핑) — students_erp.parent_user_id 컬럼 (없으면 무시)
            try {
              const stu = await env.DB.prepare(`SELECT parent_user_id, parent_name, student_name FROM students_erp WHERE user_id = ? LIMIT 1`).bind(b.user_id).first<any>();
              if (stu?.parent_user_id) {
                const parentTitle = `👨‍👩‍👧 ${stu.student_name || b.username || '자녀'}님 수업 시작`;
                const parentBody = `방금 영어 수업에 입장했어요. 대시보드에서 진행 상황 확인 가능합니다.`;
                const parentSubs = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ? AND enabled = 1`).bind(stu.parent_user_id).all();
                const peps = (parentSubs.results || []).map((r:any)=>r.endpoint);
                for (const ep of peps) {
                  await env.DB.prepare(`INSERT INTO push_queue (endpoint, title, body, url, icon, badge, tag, queued_at) VALUES (?,?,?,?,?,?,?,?)`)
                    .bind(ep, parentTitle, parentBody, '/parent.html?uid=' + encodeURIComponent(b.user_id), '/img/icon-192.png', '/img/icon-192.png', `lesson-join-parent-${b.room_id}`, now).run();
                }
                if (peps.length) await broadcastWebPush(peps, env as any);
              }
            } catch (e: any) { /* students_erp.parent_user_id 컬럼 없을 수 있음 — 무시 */ }
          }
        } catch (e: any) {
          console.warn('[attendance/join push] error:', e?.message);
        }
      }
      return json({ ok: true, attendance_id: res.meta.last_row_id, joined_at: now });
    }

    // ===== 🥭 출결 체크인 (방 입장 확정) — 결석률 100% 버그 방어용 핵심 엔드포인트 =====
    //  POST /api/attendance/checkin
    //    body: { room_id, user_id, role?('student'|'teacher'), timestamp?, username? }
    //  목적:
    //    - WebRTC 시그널링 서버 / 클라이언트가 "학생이 방에 실제 입장" 했을 때 호출.
    //    - attendance 행을 '출석(attended)' 으로 확정하고 attended_at(실제 입장 시각) 기록.
    //    - 결석 배치가 이미 status='absent' 로 바꿔놨더라도, 입장이 수업 시간 내면 '출석'으로 복구.
    //    - 대시보드(/api/admin/stats/today)는 attendance.date 기준 DISTINCT user_id 를 출석자로 세므로
    //      이 엔드포인트가 안정적으로 행을 남기면 "활성 52명 전원 결석(100%)" 오류가 사라진다.
    if (path === '/api/attendance/checkin' && method === 'POST') {
      const b = await parseJsonBody(request);

      // ── 1) 데이터 무결성 검증 ── user_id / room_id 필수 + 형식 검사
      const userId = b?.user_id != null ? String(b.user_id).trim() : '';
      const roomId = b?.room_id != null ? String(b.room_id).trim() : '';
      const ID_RE = /^[A-Za-z0-9_.:@-]{1,128}$/; // 허용 문자/길이 제한 (SQL injection·쓰레기 입력 방어)
      if (!ID_RE.test(userId) || !ID_RE.test(roomId)) {
        return invalidBody(['room_id', 'user_id']);
      }
      // 🔐 소프트 인증(위 join 과 동일): 자격증명 있는데 남의 «계정» 이면 위조 거부, 없으면 통과(결석버그 방어 유지).
      //    ⛔ userId(=b.user_id) 를 넘기지 말 것 — 기기 식별자라 로그인 학생이 전부 403 이 된다(2026-09-04, 헬퍼 주석).
      if (!(await _attnSoftAuthOk(b.account_uid, b))) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const role = (b.role === 'teacher') ? 'teacher' : 'student';

      // 입장 시각: 클라이언트가 보낸 timestamp(ms 또는 ISO 문자열)를 신뢰하되,
      // 과거 24h ~ 미래 5분 범위만 허용(시계 오차·위변조 방어). 벗어나면 서버 시각 사용.
      // 📡 M1 — last_seen_at 은 반드시 '서버 시각'만 쓴다.
      //   아래 now 는 클라이언트가 보낸 timestamp 로 대체될 수 있어(정상 동작), 정산 근거로는 쓸 수 없다.
      const srvNow = Date.now();
      let now = srvNow;
      if (b.timestamp != null) {
        const parsed = typeof b.timestamp === 'number' ? b.timestamp : Date.parse(String(b.timestamp));
        if (Number.isFinite(parsed) && parsed > Date.now() - 86400000 && parsed < Date.now() + 300000) {
          now = parsed;
        }
      }
      const date = today(now); // KST 기준 YYYY-MM-DD (대시보드 집계 키와 동일)

      // ── 2) 자가치유 ── 운영 D1 에 테이블/컬럼이 없을 수 있으므로 보강 (NOOP if exists)
      //   🧱 (2026-08-06) isolate 당 1회로 제한. 예전엔 입장 «요청마다» 아래 5개가 전부 돌았다.
      await ensureSchemaOnce('attendance', async () => {
        try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0, last_seen_at INTEGER);`);
      } catch {}
      try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN attended_at INTEGER`); } catch {} // 이미 있으면 무시
      // 📡 M1 — 서버 시각 하트비트(last_seen_at)
      //   왜 필요한가: 종료 시각(left_at)은 클라이언트가 /api/attendance/leave 를 호출해야만 기록된다.
      //   그런데 회선이 끊기면 페이지는 언로드되지 않으므로 그 호출이 영영 오지 않고, left_at 은 NULL 로 남는다.
      //   (특히 재택 강사 회선 끊김 — 사후에 "실제로 몇 시까지 수업했는가"를 확인할 방법이 전혀 없었다.)
      //   클라이언트는 이미 30초마다 /api/speaking-time 을, gaze 모듈은 10초마다 /api/gaze-score 를 보내고 있다.
      //   그 요청이 '서버에 도착한 시각'을 찍어 두면, 마지막 도착 시각 = 마지막으로 살아 있던 시각이 된다.
      //   → 끊겨서 leave 가 못 와도 종료 시각을 오차 30초 이내로 복원할 수 있다.
      //   ⚠️ 클라이언트가 보내는 값(total_session_ms)은 오프라인 동안에도 계속 누적되므로 신뢰할 수 없다.
      //      그래서 클라이언트 시각이 아니라 반드시 '서버 시각'을 쓴다. D1 쓰기는 늘지 않는다(기존 UPDATE 에 컬럼만 추가).
      try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN last_seen_at INTEGER`); } catch {} // 이미 있으면 무시
      /* 🌐 (2026-08-25) host — 이 요청이 어느 도메인으로 들어왔는지.
         [왜 필요한가] 이 저장소는 워커를 두 벌(webrtc-unified-platform · -prod) 배포하고,
         Durable Object 네임스페이스는 스크립트마다 갈린다(wrangler.toml 주석 참고).
         화상수업 WS 는 location.host 로 방을 정하므로, 같은 room_id 로 들어와도
         서로 다른 도메인이면 서로 다른 «방»(DO)에 앉는다 — 그런데 D1(이 표 포함)은
         두 워커가 같은 id 를 공유해서 attendance 만 보면 «둘 다 같은 방에 있었다» 로
         보인다(2026-08-19 강선생님 건, CLAUDE.md 2장 「같은 방 번호인데 서로 안 보이고…」).
         host 를 남겨 두면 다음에 같은 사고가 나도 SQL 한 줄로 확인된다:
           SELECT user_id, role, host FROM attendance WHERE room_id=? — host 가 갈리면 그게 원인이다. */
      try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN host TEXT`); } catch {} // 이미 있으면 무시
      try { await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`); } catch {}
      });
      const reqHost = request.headers.get('Host') || null;

      // ── 3) 오늘 수업 스케줄 조회(class_schedules) ── 입장이 "수업 시간 내" 인지 판정
      //    스케줄이 없으면 막지 않고 출석 인정(보수적 기본값 = true). → 버그 재발 방지 우선.
      //  검증: test-harness/attendance_checkin_harness.mjs (54건 통과)
      //  스키마/표기 편차에 견딤 — one_off↔onetime, day_of_week=영문CSV('mon,wed')·숫자·한글,
      //  duration_min↔duration_minutes. 후보를 모두 가져와 JS에서 매칭하고, 입장 시각(now)을
      //  윈도우에 포함하는 스케줄을 우선 선택한다. 조회 실패 시 출석 인정(보수적 = withinClass true).
      let withinClass = true;
      let scheduleId: number | null = null;
      try {
        const dow = new Date(now + 9 * 3600 * 1000).getUTCDay(); // KST 요일 0=일
        const ENG_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const ENG_FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const KOR = ['일', '월', '화', '수', '목', '금', '토'];
        const dayMatches = (stored: any): boolean => {
          if (stored == null) return false;
          const want = new Set([String(dow), String(dow === 0 ? 7 : dow), ENG_ABBR[dow], ENG_FULL[dow], KOR[dow]]);
          return String(stored).split(/[\s,/|;]+/).map((t: string) => t.trim()).filter(Boolean)
            .some((t: string) => want.has(t) || want.has(t.toLowerCase()));
        };
        const within = (s: any): boolean => {
          const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => parseInt(x, 10));
          const dur = Number(s.duration_min ?? s.duration_minutes ?? 30);
          const dayStartKst = new Date(date + 'T00:00:00+09:00').getTime();
          const start = dayStartKst + ((hh || 0) * 60 + (mm || 0)) * 60000;
          const end = start + dur * 60000;
          return now >= start - 30 * 60000 && now <= end + 15 * 60000; // grace: 시작30분전~종료15분후
        };
        const rs: any = await env.DB.prepare(`SELECT * FROM class_schedules WHERE user_id = ?`).bind(userId).all();
        const rows = (rs?.results || []).filter((r: any) => String(r.status || 'active').toLowerCase() === 'active');
        const cands = rows.filter((r: any) => (r.scheduled_date === date) || (!r.scheduled_date && dayMatches(r.day_of_week)));
        if (cands.length) {
          const picked = cands.find((s: any) => within(s)) || cands[0];
          scheduleId = (picked.id != null) ? Number(picked.id) : null;
          withinClass = within(picked);
        }
      } catch (e: any) {
        // class_schedules 스키마 편차/부재 시에도 출석은 인정 (withinClass=true 유지)
        console.warn('[checkin] schedule lookup skipped:', e?.message);
      }

      // ── 4) 방어적 UPSERT ── 오늘 (user_id, room_id, date) 행이 있으면 출석으로 복구, 없으면 생성
      const existing = await env.DB.prepare(
        `SELECT id, status FROM attendance
          WHERE user_id = ? AND room_id = ? AND date = ?
          ORDER BY joined_at DESC LIMIT 1`
      ).bind(userId, roomId, date).first<any>();

      let attendanceId: number;
      let recovered = false; // 결석→출석 복구 여부
      if (existing) {
        if (withinClass) {
          // 입장이 수업 시간 내 → status='attended' 로 확정/복구 (결석 배치 결과 덮어쓰기)
          await env.DB.prepare(
            `UPDATE attendance
                SET status = 'attended',
                    attended_at = COALESCE(attended_at, ?),
                    role     = COALESCE(role, ?),
                    username = COALESCE(username, ?),
                    last_seen_at = ?,
                    host = COALESCE(host, ?)
              WHERE id = ?`
          ).bind(now, role, b.username || null, srvNow, reqHost, existing.id).run();
          recovered = (existing.status === 'absent');
        } else {
          // 수업 시간 밖 입장 → status 는 건드리지 않고 attended_at 만 보강
          await env.DB.prepare(
            `UPDATE attendance SET attended_at = COALESCE(attended_at, ?), last_seen_at = ?, host = COALESCE(host, ?) WHERE id = ?`
          ).bind(now, srvNow, reqHost, existing.id).run();
        }
        attendanceId = Number(existing.id);
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, username, role, joined_at, attended_at, status, date, last_seen_at, host)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(roomId, userId, b.username || null, role, now, now, withinClass ? 'attended' : 'present', date, srvNow, reqHost).run();
        attendanceId = Number(ins.meta.last_row_id);
      }

      // ── 5) 알림 센터 연동 ── 첫 출석 확정 시 class_start 이벤트 적재
      //    (실서비스 경로) D1 notification_queue → cron 이 SOLAPI 알림톡/카카오로 발송.
      const firstAttend = !existing || recovered;
      if (firstAttend && role === 'student') {
        await enqueueNotification(env, {
          type: 'class_start',
          title: `🎬 수업 시작 — 방 ${roomId}`,
          body: `${b.username || userId} 님 출석 확정 (${date})`,
          meta: { room_id: roomId, user_id: userId, role, attended_at: now, schedule_id: scheduleId }
        });

        // ──────────────────────────────────────────────────────────────────
        // 🔮 (예비/가짜코드) Cloudflare Queue 직접 적재 경로 — 바인딩 추가 시 활성화.
        //   wrangler.toml 에 아래를 추가하고 MangoEnv 에 `QUEUE?: Queue` 선언한 뒤 주석 해제:
        //     [[queues.producers]]
        //     binding = "QUEUE"
        //     queue   = "class-events"
        //   consumer Worker 가 이 메시지를 받아 SOLAPI 알림톡 발송 대기열로 넘긴다.
        // ──────────────────────────────────────────────────────────────────
        // if ((env as any).QUEUE) {
        //   await (env as any).QUEUE.send({
        //     event: 'class_start',
        //     room_id: roomId,
        //     user_id: userId,
        //     role,
        //     attended_at: now,
        //     notify: { channel: 'kakao_alimtalk', template: 'CLASS_START' } // SOLAPI 발송 대기 큐 페이로드
        //   });
        // }
      }

      return json({
        ok: true,
        attendance_id: attendanceId,
        user_id: userId,
        room_id: roomId,
        status: withinClass ? 'attended' : 'present',
        attended_at: now,
        date,
        within_class: withinClass,
        schedule_id: scheduleId,
        recovered_from_absent: recovered
      });
    }

    if (path === '/api/attendance/leave' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      const now = Date.now();
      // 가장 최근 미종료 row 업데이트
      // 📡 M1 — 정상 퇴장이면 left_at 과 last_seen_at 이 같아진다.
      //   반대로 last_seen_at 만 있고 left_at 이 NULL 인 행 = "끊겨서 leave 를 못 보낸 세션" 이며,
      //   그 경우 실제 종료 시각은 last_seen_at 으로 본다(오차 ≤ 30초).
      try {
        await env.DB.prepare(
          `UPDATE attendance
           SET left_at = ?,
               last_seen_at = ?,
               total_active_ms = COALESCE(?, total_active_ms),
               total_session_ms = COALESCE(?, total_session_ms),
               disconnect_count = COALESCE(?, disconnect_count),
               status = ?
           WHERE id = (
             SELECT id FROM attendance
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL
             ORDER BY joined_at DESC LIMIT 1
           )`
        ).bind(
          now, now,
          b.total_active_ms ?? null,
          b.total_session_ms ?? null,
          b.disconnect_count ?? null,
          b.status || 'left',
          b.room_id,
          b.user_id
        ).run();
      } catch {
        await env.DB.prepare(
          `UPDATE attendance
           SET left_at = ?,
               total_active_ms = COALESCE(?, total_active_ms),
               total_session_ms = COALESCE(?, total_session_ms),
               disconnect_count = COALESCE(?, disconnect_count),
               status = ?
           WHERE id = (
             SELECT id FROM attendance
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL
             ORDER BY joined_at DESC LIMIT 1
           )`
        ).bind(
          now,
          b.total_active_ms ?? null,
          b.total_session_ms ?? null,
          b.disconnect_count ?? null,
          b.status || 'left',
          b.room_id,
          b.user_id
        ).run();
      }
      return json({ ok: true, left_at: now });
    }

    if (path === '/api/attendance/heartbeat' && method === 'POST') {
      // 🟢 (2026-07-24 비용절감) 이 엔드포인트는 예전에 `hb:room:user` 키를 KV 에 60초 TTL 로 썼는데,
      //   그 키를 **읽는 코드가 저장소 어디에도 없었다**(온라인 표시용으로 만들었으나 미사용).
      //   그런데 참가자당 10초마다 호출돼 KV 쓰기 비용의 최대 원인이었다(40명 동시 = 240 write/분).
      //   → KV 쓰기를 없앤다. 온라인 여부는 이미 DO 가 WebSocket 으로 알고 있어 KV 가 불필요하다.
      //   응답 형태는 그대로 유지(클라이언트 호환). 클라이언트도 곧 호출 자체를 멈춘다.
      return json({ ok: true, noop: true });
    }

    // ===== 발화시간 =====
    if (path === '/api/speaking-time' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) return invalidBody(['room_id', 'user_id']);
      const now = Date.now();
      // 📡 M1 — 이 엔드포인트가 서버 시각 하트비트의 본체다(클라이언트가 30초마다 호출).
      //   total_active_ms / total_session_ms 는 클라이언트가 자체 누적한 값이라
      //   회선이 끊긴 동안에도 계속 늘어난다(브라우저 타이머는 계속 돌기 때문). 즉 지급 근거로 쓸 수 없다.
      //   반면 last_seen_at = '이 요청이 서버에 실제로 도착한 시각' 이므로 위조도 과다계상도 불가능하다.
      //   회선이 끊기면 이 갱신이 멈추고, 그 마지막 값이 곧 그 사람이 마지막으로 살아 있던 시각이 된다.
      //   D1 쓰기는 늘지 않는다 — 기존 UPDATE 문에 컬럼 하나만 더 얹었다.
      /* 🔎 (2026-08-05) 「말하기 점수가 왜 비어 있는가」를 알 수 있게 진단값을 남긴다.
         [실측] 최근 30일 attendance 4,513행 중 total_session_ms>0 은 4,293행(95%)인데
                total_active_ms>0 은 581행(13%)뿐이다. 즉 수업 시간은 재는데 «발화» 만 0 이다.
         원인 후보가 셋인데(마이크 분석기 미생성 / 마이크 꺼짐 / AudioContext suspended),
         클라이언트는 이미 그 셋을 보내고 있었고 서버가 «그냥 버리고» 있었다.
         → 한 칸(spk_diag)에 모아 둔다. 하루치 실제 수업이면 어느 원인인지 숫자로 갈린다.
         추측으로 감지 로직을 고치면 과다·과소 집계가 나고, 그건 강사 평가에 그대로 간다.
         ⚠️ 컬럼은 더하기만 한다(TEXT, NULL 허용). 기존 조회·집계에 영향 없음. */
      const _spkDiag = [
        'an=' + (b.has_analyser ? 1 : 0),
        'mic=' + (b.mic_enabled ? 1 : 0),
        'ac=' + String(b.ac_state || '?').slice(0, 12)
      ].join(';');
      try {
        await env.DB.prepare(
          `UPDATE attendance
           SET total_active_ms = ?, total_session_ms = ?, last_seen_at = ?, spk_diag = ?
           WHERE id = (
             SELECT id FROM attendance
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL
             ORDER BY joined_at DESC LIMIT 1
           )`
        ).bind(b.total_active_ms || 0, b.total_session_ms || 0, now, _spkDiag, b.room_id, b.user_id).run();
      } catch {
        /* 컬럼이 아직 없는 배포본 → 한 번 만들어 두고, 이번 요청은 아래 기존 경로로 처리한다.
           (여기서 재시도까지 하면 실패가 겹칠 때 수업 중 D1 쓰기가 늘어난다) */
        try { await env.DB.exec(`ALTER TABLE attendance ADD COLUMN spk_diag TEXT`); } catch {}
        // 컬럼이 아직 없는 배포본 대비 폴백 — 발화시간 집계는 절대 멈추지 않게(기존 동작 유지)
        await env.DB.prepare(
          `UPDATE attendance
           SET total_active_ms = ?, total_session_ms = ?
           WHERE id = (
             SELECT id FROM attendance
             WHERE room_id = ? AND user_id = ? AND left_at IS NULL
             ORDER BY joined_at DESC LIMIT 1
           )`
        ).bind(b.total_active_ms || 0, b.total_session_ms || 0, b.room_id, b.user_id).run();
      }
      return json({ ok: true, recorded_at: now });
    }

    // ===== 시선 점수 =====
    //  - public/js/mango-gaze.js 가 10초마다 호출
    //  - session_* 필드가 있으면 그걸 누적값으로 사용(권장)
    //  - 없으면 이번 윈도우의 forward_samples/samples 로 단순 덮어쓰기
    //  - 같은 (room_id, user_id) 의 가장 최신 attendance row 를 업데이트
    if (path === '/api/gaze-score' && method === 'POST') {
      const b = await request.json() as any;
      if (!b.room_id || !b.user_id) {
        return json({ ok: false, error: 'room_id and user_id required' }, 400);
      }
      const now = Date.now();
      const cameraOff = b.camera_off === true;

      // 점수/샘플 결정: session_* 가 들어왔으면 누적값으로, 아니면 윈도우값 사용
      const totalSamples = (typeof b.session_samples === 'number')
        ? b.session_samples
        : Number(b.samples || 0);
      const forwardSamples = (typeof b.session_forward_samples === 'number')
        ? b.session_forward_samples
        : Number(b.forward_samples || 0);
      let score: number | null = null;
      if (cameraOff) {
        // 카메라 OFF 신호 → 점수는 null 로 유지 (admin 에서 "—" 로 보이되 샘플=0 으로 원인 구분 가능)
        score = null;
      } else if (typeof b.session_score === 'number' && !Number.isNaN(b.session_score)) {
        score = b.session_score;
      } else if (typeof b.gaze_score === 'number' && !Number.isNaN(b.gaze_score)) {
        score = b.gaze_score;
      } else if (totalSamples > 0) {
        score = Math.round((forwardSamples / totalSamples) * 1000) / 10;
      }

      // 가장 최근 열린 attendance row 우선, 없으면 가장 최근 row 로 fallback
      // (heartbeat 타이밍/예상치 못한 leave 순서 문제로 left_at 이 먼저 찍힌 경우 대비)
      const targetRow = await env.DB.prepare(
        `SELECT id, gaze_score FROM attendance
         WHERE room_id = ? AND user_id = ?
         ORDER BY (CASE WHEN left_at IS NULL THEN 0 ELSE 1 END), joined_at DESC
         LIMIT 1`
      ).bind(b.room_id, b.user_id).first<{ id: number; gaze_score: number | null }>();

      if (!targetRow) {
        // attendance row 자체가 없으면(이례적) 하나 만들어둔다 — 점수 보고가 유실되지 않도록.
        const date = today(now);
        const res = await env.DB.prepare(
          `INSERT INTO attendance (room_id, user_id, username, role, joined_at, status, date,
             gaze_score, gaze_samples, gaze_forward_samples)
           VALUES (?, ?, ?, ?, ?, 'present', ?, ?, ?, ?)`
        ).bind(
          b.room_id, b.user_id, b.username || null, b.role || 'student',
          now, date,
          score, totalSamples, forwardSamples
        ).run();
        return json({
          ok: true, attendance_id: res.meta.last_row_id,
          gaze_score: score, bootstrapped: true, camera_off: cameraOff
        });
      }

      // 카메라 OFF 신호인 경우엔 기존에 유효한 score 가 있다면 덮어쓰지 않음
      // (중간에 카메라를 잠깐 끈 경우에도 이전 측정치를 보존)
      if (cameraOff && targetRow.gaze_score !== null && targetRow.gaze_score !== undefined) {
        await env.DB.prepare(
          `UPDATE attendance
             SET gaze_samples = ?, gaze_forward_samples = ?
           WHERE id = ?`
        ).bind(totalSamples, forwardSamples, targetRow.id).run();
        return json({
          ok: true, attendance_id: targetRow.id,
          gaze_score: targetRow.gaze_score,
          camera_off: true, preserved_previous: true
        });
      }

      // 📡 M1 — gaze 모듈은 10초마다 호출되므로, 켜져 있는 수업에서는 하트비트 해상도가 30초→10초로 올라간다.
      //   (카메라 OFF·모듈 비활성 시엔 speaking-time 30초 하트비트만 남는다. 어느 쪽이든 동작한다.)
      try {
        await env.DB.prepare(
          `UPDATE attendance
           SET gaze_score = ?,
               gaze_samples = ?,
               gaze_forward_samples = ?,
               last_seen_at = ?
           WHERE id = ?`
        ).bind(score, totalSamples, forwardSamples, now, targetRow.id).run();
      } catch {
        await env.DB.prepare(
          `UPDATE attendance
           SET gaze_score = ?,
               gaze_samples = ?,
               gaze_forward_samples = ?
           WHERE id = ?`
        ).bind(score, totalSamples, forwardSamples, targetRow.id).run();
      }
      return json({
        ok: true, attendance_id: targetRow.id,
        gaze_score: score, camera_off: cameraOff, recorded_at: now
      });
    }

    // ===== 카카오 ID =====
    if (path === '/api/kakao-id' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.user_id) return invalidBody(['user_id']);
      const now = Date.now();
      await env.DB.prepare(
        `INSERT INTO kakao_ids (user_id, role, username, kakao_id, phone, opted_in_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           kakao_id = excluded.kakao_id,
           phone = excluded.phone,
           username = excluded.username,
           role = excluded.role,
           updated_at = excluded.updated_at`
      ).bind(b.user_id, b.role || 'teacher', b.username || null, b.kakao_id || null, b.phone || null, now, now).run();
      return json({ ok: true });
    }

    if (path === '/api/kakao-id/teachers' && method === 'GET') {
      // 🔐 [PII] 전 강사 전화번호 대량 노출 차단 — 관리자 전용
      const ktAdmin = await checkAdminSession(request, env as any);
      if (!ktAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      const rs = await env.DB.prepare(
        `SELECT user_id, username, kakao_id, phone FROM kakao_ids WHERE role = 'teacher' AND kakao_id IS NOT NULL`
      ).all();
      return json(rs.results || []);
    }

    if (path.startsWith('/api/kakao-id/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/kakao-id/', ''));
      // 🔐 [PII] 임의 유저 전화번호 조회 차단 — 관리자 또는 본인 토큰만. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, userId))) {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      const row = await env.DB.prepare(
        `SELECT user_id, role, username, kakao_id, phone, opted_in_at FROM kakao_ids WHERE user_id = ?`
      ).bind(userId).first();
      return json(row || null);
    }

    // ===== 비상 이벤트 =====
    if (path === '/api/emergency' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.room_id || !b.user_id) {
        return invalidBody(['room_id', 'user_id']);
      }
      const now = Date.now();
      const res = await env.DB.prepare(
        `INSERT INTO emergency_events (room_id, user_id, target_user_id, event_type, triggered_at, meta)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(b.room_id, b.user_id, b.target_user_id || null, b.event_type || 'kakao_button', now, JSON.stringify(b.meta || {})).run();
      // 📣 비상 이벤트는 항상 즉시 알림
      await enqueueNotification(env, {
        type: 'emergency',
        title: `🚨 비상 이벤트 — 방 ${b.room_id}`,
        body: `${b.user_id} 가 ${b.event_type || 'kakao_button'} 트리거 (대상: ${b.target_user_id || '전체'})`,
        meta: { room_id: b.room_id, user_id: b.user_id, target_user_id: b.target_user_id || null, event_type: b.event_type || 'kakao_button', triggered_at: now, emergency_id: res.meta.last_row_id }
      });
      return json({ ok: true, id: res.meta.last_row_id });
    }

    // ===== 보상 =====
    if (path === '/api/reward' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.teacher_id || !b.student_id || !b.type) {
        return invalidBody(['teacher_id', 'student_id', 'type']);
      }
      const now = Date.now();
      const date = today(now);
      const DAILY_LIMIT = 30; // 교사당 일일 발급 상한 (v3 §9)
      // 일일 상한 체크
      const limitRow = await env.DB.prepare(
        `SELECT count FROM reward_limits WHERE teacher_id = ? AND date = ?`
      ).bind(b.teacher_id, date).first<{ count: number }>();
      const currentCount = limitRow?.count || 0;
      if (currentCount >= DAILY_LIMIT) {
        return json({ ok: false, error: 'daily_limit_exceeded', limit: DAILY_LIMIT, current: currentCount }, 429);
      }
      const expiresAt = b.expires_at || (now + 90 * 24 * 3600 * 1000); // 90일
      const res = await env.DB.prepare(
        `INSERT INTO rewards (teacher_id, student_id, room_id, type, value, message, issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.teacher_id, b.student_id, b.room_id || null, b.type, b.value || null, b.message || null, now, expiresAt).run();
      // 카운트 증가
      await env.DB.prepare(
        `INSERT INTO reward_limits (teacher_id, date, count) VALUES (?, ?, 1)
         ON CONFLICT(teacher_id, date) DO UPDATE SET count = count + 1`
      ).bind(b.teacher_id, date).run();
      return json({ ok: true, reward_id: res.meta.last_row_id, daily_remaining: DAILY_LIMIT - currentCount - 1 });
    }

    if (path.startsWith('/api/rewards/student/') && method === 'GET') {
      const studentId = decodeURIComponent(path.replace('/api/rewards/student/', ''));
      // 🔐 [PII] 본인 보상만 — 토큰 uid 일치 요구
      const rwAuth = await authUidGlobal(request, url, env);
      if (!rwAuth || rwAuth !== studentId) return json({ ok: false, error: 'auth_required' }, 401);
      const rs = await env.DB.prepare(
        `SELECT id, teacher_id, type, value, message, issued_at, expires_at, status
         FROM rewards WHERE student_id = ? AND status = 'active'
         ORDER BY issued_at DESC LIMIT 100`
      ).bind(studentId).all();
      return json(rs.results || []);
    }

    // ===== 대시보드 =====
    if (path === '/api/dashboard' && method === 'GET') {
      const days = parseInt(url.searchParams.get('days') || '7', 10);
      const since = Date.now() - days * 24 * 3600 * 1000;

      /* 🗓️ (2026-08-15) 예약 행 제외 — attendance 에는 아직 안 한 «예약» 수업이
         status='scheduled' + 미래 joined_at 으로 미리 들어 있다(2030년까지!).
         joined_at >= since 는 미래 방향으로도 통과라, 출석 차트 x축이 2030 까지
         늘어지고(현장 제보) 총 세션·평균 접속률(active 0%가 평균을 깎음)도 오염됐다.
         실제로 일어난 출석만 센다 — 예약이 실제 출석으로 바뀌면 status 가 바뀌어 포함된다. */
      const NOT_SCHEDULED = `COALESCE(status,'') <> 'scheduled'`;
      const [attTotal, attByDay, disconnectStats, emergencyCount, rewardCount, topSpeakers] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) AS c FROM attendance WHERE joined_at >= ? AND ${NOT_SCHEDULED}`).bind(since).first(),
        env.DB.prepare(
          `SELECT date, COUNT(DISTINCT user_id) AS unique_users, COUNT(*) AS sessions
           FROM attendance WHERE joined_at >= ? AND ${NOT_SCHEDULED} GROUP BY date ORDER BY date DESC`
        ).bind(since).all(),
        env.DB.prepare(
          `SELECT COUNT(*) AS total_sessions,
                  SUM(disconnect_count) AS total_disconnects,
                  AVG(CASE WHEN total_session_ms > 0 THEN (total_active_ms*100.0/total_session_ms) ELSE 0 END) AS avg_active_pct
           FROM attendance WHERE joined_at >= ? AND ${NOT_SCHEDULED}`
        ).bind(since).first(),
        env.DB.prepare(`SELECT COUNT(*) AS c, event_type FROM emergency_events WHERE triggered_at >= ? GROUP BY event_type`).bind(since).all(),
        env.DB.prepare(`SELECT COUNT(*) AS c, type FROM rewards WHERE issued_at >= ? GROUP BY type`).bind(since).all(),
        env.DB.prepare(
          `SELECT user_id, username, SUM(total_active_ms) AS active_ms, SUM(total_session_ms) AS session_ms
           FROM attendance WHERE joined_at >= ? AND ${NOT_SCHEDULED} AND total_session_ms > 0
           GROUP BY user_id ORDER BY active_ms DESC LIMIT 10`
        ).bind(since).all()
      ]);

      return json({
        period_days: days,
        attendance: {
          total: (attTotal as any)?.c || 0,
          by_day: attByDay.results || []
        },
        connection: disconnectStats || {},
        emergency: emergencyCount.results || [],
        rewards: rewardCount.results || [],
        top_speakers: topSpeakers.results || []
      });
    }

    // ===== 관리자 개입: 수업 강제 종료 (Phase 4) =====
    //   POST /api/admin/room/:roomId/force-end
    //     - 해당 room 의 VideoCallRoom DO 에 /force-end 를 위임
    //     - DO 가 모든 연결에 force_end 브로드캐스트 + close
    if (method === 'POST' && /^\/api\/admin\/room\/[^/]+\/force-end$/.test(path)) {
      const m = path.match(/^\/api\/admin\/room\/([^/]+)\/force-end$/);
      const roomId = m ? decodeURIComponent(m[1]) : '';
      if (!roomId) return invalidBody(['room_id(path)']);
      const envAny = env as any;
      if (!envAny.VIDEO_CALL_ROOM) {
        return json({ ok: false, error: 'VIDEO_CALL_ROOM binding missing' }, 500);
      }
      const doId = envAny.VIDEO_CALL_ROOM.idFromName(roomId);
      const stub = envAny.VIDEO_CALL_ROOM.get(doId);
      // body 로 reason 전달 가능 — 없으면 기본 문구
      const b = await parseJsonBody(request);
      const reason = (b && typeof b.reason === 'string' && b.reason.trim()) ? b.reason.trim() : '관리자가 수업을 종료했습니다.';
      const resp = await stub.fetch('http://do/force-end?reason=' + encodeURIComponent(reason), { method: 'POST' });
      const body = await resp.text();
      // 📣 강제 종료는 운영 액션 — 알림 큐 적재
      let parsed: any = null; try { parsed = JSON.parse(body); } catch {}
      await enqueueNotification(env, {
        type: 'class_force_end',
        title: `🛑 수업 강제 종료 — 방 ${roomId}`,
        body: `사유: ${reason} · 알림 ${parsed?.notified ?? '?'}명`,
        meta: { room_id: roomId, reason, notified: parsed?.notified ?? null, ended_at: Date.now() }
      });
      return new Response(body, {
        status: resp.status,
        headers: {
          'Content-Type': resp.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // ===== 📣 알림 큐 (Phase 5) =====
    //   GET   /api/admin/notifications?status=pending&limit=50
    //   POST  /api/admin/notifications/test     (관리자가 임의 메시지 큐에 적재 — 검증용)
    //   PATCH /api/admin/notifications/:id      body: { status: 'sent'|'failed'|'discarded', error?: string }
    if (path === '/api/admin/notifications' && method === 'GET') {
      await ensureNotifSchema(env);
      const wantStatus = url.searchParams.get('status') || 'pending';
      const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10)));
      let rs;
      if (wantStatus === 'all') {
        rs = await env.DB.prepare(
          `SELECT id, type, title, body, meta, channel, status, created_at, sent_at, error
           FROM notification_queue ORDER BY created_at DESC LIMIT ?`
        ).bind(lim).all();
      } else {
        rs = await env.DB.prepare(
          `SELECT id, type, title, body, meta, channel, status, created_at, sent_at, error
           FROM notification_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?`
        ).bind(wantStatus, lim).all();
      }
      // 카운트 (status 별 합계)
      const countRs = await env.DB.prepare(
        `SELECT status, COUNT(*) AS c FROM notification_queue GROUP BY status`
      ).all();
      const counts: any = {};
      for (const row of (countRs.results || []) as any[]) counts[row.status] = row.c;
      return json({ ok: true, items: rs.results || [], counts });
    }

    if (path === '/api/admin/notifications/test' && method === 'POST') {
      const b = await parseJsonBody(request);
      const title = (b && b.title) || '🧪 테스트 알림';
      const body  = (b && b.body)  || '알림 큐 동작 검증용 메시지입니다.';
      await enqueueNotification(env, { type: 'manual', title, body, meta: { issued_by: 'admin', at: Date.now() } });
      return json({ ok: true, enqueued: { title, body } });
    }

    if (method === 'PATCH' && /^\/api\/admin\/notifications\/\d+$/.test(path)) {
      await ensureNotifSchema(env);
      const m = path.match(/^\/api\/admin\/notifications\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['sent', 'failed', 'discarded', 'pending']);
      if (!allowed.has(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      }
      const sentAt = b.status === 'sent' ? Date.now() : null;
      await env.DB.prepare(
        `UPDATE notification_queue SET status = ?, sent_at = ?, error = ? WHERE id = ?`
      ).bind(b.status, sentAt, b.error || null, id).run();
      return json({ ok: true, id, status: b.status, sent_at: sentAt });
    }

    // ===== 📥 CSV 내보내기 (Phase 6) =====
    //   GET /api/admin/export/recordings.csv?q=&date_from=&date_to=&status=
    //   GET /api/admin/export/attendance.csv?date_from=&date_to=&user_id=&room_id=
    //   - 기존 /api/recordings 검색 파라미터 동일하게 받음
    //   - LIMIT 10000 (실무 용도). 더 크면 페이징 필요하지만 일반 사례에선 충분.
    if (method === 'GET' && path === '/api/admin/export/recordings.csv') {
      const qSearch  = (url.searchParams.get('q') || '').trim();
      const dateFrom = url.searchParams.get('date_from');
      const dateTo   = url.searchParams.get('date_to');
      const statusF  = url.searchParams.get('status');
      const where: string[] = [];
      const binds: any[] = [];
      if (qSearch) {
        where.push("(r.room_id LIKE ? OR COALESCE(r.teacher_name,'') LIKE ? OR COALESCE(r.teacher_id,'') LIKE ?)");
        const p = `%${qSearch}%`;
        binds.push(p, p, p);
      }
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { where.push('r.started_at >= ?'); binds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { where.push('r.started_at <= ?'); binds.push(ms); }
      }
      /* 🔴 2026-08-28 — CSV 가 화면 목록과 «다른 말» 을 하고 있었다. 위 /api/recordings 는
         0초 부산물과 «목록에서 내린» 행을 기본에서 감추는데 여기엔 그 규칙이 없어서,
         화면 「총 626건」인데 CSV 는 2,022행이 나왔다(어느 쪽이 맞는지 알 수 없게 된다).
         ⛔ 규칙을 여기에 새로 쓰지 말고 «같은 문장» 을 쓸 것 — 어긋나면 그대로 사고다. */
      const statusFNorm = statusF === 'ended' ? 'completed' : statusF;
      if (statusFNorm && statusFNorm !== 'all') { where.push('r.status = ?'); binds.push(statusFNorm); }
      if (!statusFNorm || statusFNorm === 'all') {
        where.push("NOT (r.status = 'aborted' AND COALESCE(r.size_bytes, 0) = 0)");
        where.push("r.status != 'deleted'");
      }
      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sql = `SELECT r.id, r.room_id, r.teacher_id, r.teacher_name, r.started_at, r.ended_at,
                          r.duration_ms, r.size_bytes, r.status, r.storage,
                          r.participant_names, r.consented_user_ids
                   FROM recordings r ${whereSQL}
                   ORDER BY r.started_at DESC LIMIT 10000`;
      const rs = binds.length
        ? await env.DB.prepare(sql).bind(...binds).all()
        : await env.DB.prepare(sql).all();
      // ms epoch → ISO 문자열 변환 (CSV 가독성)
      const rows = ((rs.results || []) as any[]).map(r => ({
        ...r,
        started_at_iso: r.started_at ? new Date(r.started_at).toISOString() : '',
        ended_at_iso:   r.ended_at   ? new Date(r.ended_at).toISOString()   : '',
        duration_sec:   r.duration_ms ? Math.round(r.duration_ms / 1000) : 0,
        size_mb:        r.size_bytes  ? Math.round(r.size_bytes / 1024 / 1024 * 10) / 10 : 0
      }));
      const csv = toCSV(rows, [
        { key: 'id',                label: 'id' },
        { key: 'room_id',           label: 'room_id' },
        { key: 'teacher_id',        label: 'teacher_id' },
        { key: 'teacher_name',      label: 'teacher_name' },
        { key: 'started_at_iso',    label: 'started_at' },
        { key: 'ended_at_iso',      label: 'ended_at' },
        { key: 'duration_sec',      label: 'duration_sec' },
        { key: 'size_mb',           label: 'size_mb' },
        { key: 'status',            label: 'status' },
        { key: 'storage',           label: 'storage' },
        { key: 'participant_names', label: 'participant_names' },
        { key: 'consented_user_ids',label: 'consented_user_ids' }
      ]);
      const fname = 'recordings_' + new Date().toISOString().slice(0, 10) + '.csv';
      return csvResponse(fname, csv);
    }

    if (method === 'GET' && path === '/api/admin/export/attendance.csv') {
      const dateFrom = url.searchParams.get('date_from');
      const dateTo   = url.searchParams.get('date_to');
      const userId   = url.searchParams.get('user_id');
      const roomId   = url.searchParams.get('room_id');
      const where: string[] = [];
      const binds: any[] = [];
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { where.push('a.joined_at >= ?'); binds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { where.push('a.joined_at <= ?'); binds.push(ms); }
      }
      if (userId) { where.push('a.user_id = ?'); binds.push(userId); }
      if (roomId) { where.push('a.room_id = ?'); binds.push(roomId); }
      const whereSQL = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const sql = `SELECT a.id, a.room_id, a.user_id, a.username, a.role,
                          a.joined_at, a.left_at, a.status, a.date,
                          a.total_session_ms, a.total_active_ms, a.disconnect_count,
                          a.gaze_score, a.gaze_samples, a.gaze_forward_samples
                   FROM attendance a ${whereSQL}
                   ORDER BY a.joined_at DESC LIMIT 10000`;
      const rs = binds.length
        ? await env.DB.prepare(sql).bind(...binds).all()
        : await env.DB.prepare(sql).all();
      const rows = ((rs.results || []) as any[]).map(a => ({
        ...a,
        joined_at_iso: a.joined_at ? new Date(a.joined_at).toISOString() : '',
        left_at_iso:   a.left_at   ? new Date(a.left_at).toISOString()   : '',
        active_pct:    a.total_session_ms > 0 ? Math.round((a.total_active_ms / a.total_session_ms) * 1000) / 10 : 0,
        session_min:   a.total_session_ms ? Math.round(a.total_session_ms / 60000 * 10) / 10 : 0,
        active_min:    a.total_active_ms  ? Math.round(a.total_active_ms  / 60000 * 10) / 10 : 0
      }));
      const csv = toCSV(rows, [
        { key: 'id',                   label: 'id' },
        { key: 'date',                 label: 'date' },
        { key: 'room_id',              label: 'room_id' },
        { key: 'user_id',              label: 'user_id' },
        { key: 'username',             label: 'username' },
        { key: 'role',                 label: 'role' },
        { key: 'joined_at_iso',        label: 'joined_at' },
        { key: 'left_at_iso',          label: 'left_at' },
        { key: 'status',               label: 'status' },
        { key: 'session_min',          label: 'session_min' },
        { key: 'active_min',           label: 'active_min' },
        { key: 'active_pct',           label: 'active_pct' },
        { key: 'disconnect_count',     label: 'disconnect_count' },
        { key: 'gaze_score',           label: 'gaze_score' },
        { key: 'gaze_samples',         label: 'gaze_samples' },
        { key: 'gaze_forward_samples', label: 'gaze_forward_samples' }
      ]);
      const fname = 'attendance_' + new Date().toISOString().slice(0, 10) + '.csv';
      return csvResponse(fname, csv);
    }

    // ═══════════════════════════════════════════════════════════════
    // 🛡️ 관리자 통계/KPI → api-admin.ts 로 분리 (REFACTOR_PLAN 1단계, admin 1회차)
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/ai/') || path === '/api/admin/ai-command'
        || path === '/api/student/ai-command' || path === '/api/admin/ai-action') {
      const rAi = await handleAiApi(request, url, env);
      if (rAi) return rAi;
    }
    if (path.startsWith('/api/push/') || path.startsWith('/api/admin/push/')
        || path.startsWith('/api/chat/') || path.startsWith('/api/admin/chat/')
        || path.startsWith('/api/notify/') || path.startsWith('/api/admin/kakao/')
        || path === '/api/webhook/kakao-inbound' || path === '/api/admin/voice/all-stats') {
      const rNotify = await handleNotifyApi(request, url, env);
      if (rNotify) return rNotify;
    }
    if (path.startsWith('/api/admin/monthly-report') || path.startsWith('/api/report/monthly')) {
      const rReports = await handleReportsApi(request, url, env);
      if (rReports) return rReports;
    }
    if (path.startsWith('/api/calendar') || path.startsWith('/api/admin/calendar')
        || path.startsWith('/api/admin/homework') || path.startsWith('/api/eval/')
        || path.startsWith('/api/admin/eval/')) {
      const rLessons = await handleLessonsApi(request, url, env);
      if (rLessons) return rLessons;
    }
    if (path.startsWith('/api/points') || path.startsWith('/api/gifts')
        || path.startsWith('/api/admin/points') || path.startsWith('/api/admin/gifts')
        || path.startsWith('/api/ratings') || path.startsWith('/api/admin/ratings')
        || path.startsWith('/api/ai-feedback') || path === '/api/teacher/my-ratings'
        || path.startsWith('/api/admin/judgment') || path.startsWith('/api/judgment/')
        || path === '/api/vc/roster') {
      const rPoints = await handlePointsApi(request, url, env, ctx);
      if (rPoints) return rPoints;
    }
    // 🎥 수업 종료 후 AI 리포트 (집중도·발화·영어사용 통합) — 수업 경로와 완전 분리된 배치/조회 전용
    if (path === '/api/admin/lesson-insights' || path.startsWith('/api/admin/lesson-insights/')) {
      const rIns = await handleLessonInsightApi(request, url, env as any);
      if (rIns) return rIns;
    }
    if (path.startsWith('/api/admin/nps/') || path === '/api/nps/respond'
        || path.startsWith('/api/admin/subscription') || path === '/api/subscription/create'
        || path.startsWith('/api/admin/inquiry/') || path === '/api/consult-bot' || path === '/api/student/inquiry'
        || path === '/api/bug-report' || path === '/api/admin/bug-reports' || path.startsWith('/api/admin/bug-reports/')
        || path.startsWith('/api/admin/alerts') || path === '/api/admin/audit-logs'
        || path.startsWith('/api/admin/briefing') || path === '/api/admin/chat-messages'
        || path.startsWith('/api/admin/dunning') || path === '/api/admin/exams'
        || path.startsWith('/api/admin/famil') || path === '/api/admin/forbidden-words'
        || path.startsWith('/api/admin/forecast') || path.startsWith('/api/admin/ghost')
        || path.startsWith('/api/admin/nps') || path === '/api/admin/room-attendance'
        || path.startsWith('/api/admin/schedule/') || path.startsWith('/api/admin/subscription')
        || path.startsWith('/api/admin/whisper') || path.startsWith('/api/alumni/')
        || path.startsWith('/api/family/') || path.startsWith('/api/nps/')
        || path.startsWith('/api/subscription/')
        || path.startsWith('/api/textbook-files') || path.startsWith('/api/admin/textbook-files')
        /* 🙈 (2026-09-07) 교재 라이브러리 숨김 — **2026-08-13 신설 이래 줄곧 404 였다.**
           index.ts 의 인증 게이트(①, 5787행)와 라우팅 허용목록(②, 1274행)에는 있었는데
           이 위임 가드(③)에만 빠져 handleAdminApi 까지 못 갔다. 바로 위 textbook-files 는
           startsWith 로 걸리지만 «textbook-hidden-books» 는 그 접두사에도 /api/admin/textbooks
           에도 안 걸린다(문자열 전수 대조로 확인 — 108개 중 걸리는 것 0건).
           ⚠️ 화면에서는 «고장» 으로 안 보였다 — 404 본문 {error:'Not Found'} 에 ok 칸이 없어
              업로더(/textbook-uploader.html)의 숨김 상자는 「목록을 불러오지 못했습니다」로만 떴다.
           📜 teacher-contacts(8/13)·finance-cafe24(8/15)·classes/today(7/23→8/25)·vc/(8/27)와
              **같은 원인의 다섯 번째**다. 새 /api/admin/* 경로는 반드시 관문 셋을 다 등록할 것. */
        || path === '/api/admin/textbook-hidden-books'
        || path.startsWith('/api/recordings/')
        || path.startsWith('/api/mango-videos') || path.startsWith('/api/admin/mango-videos')
        || path.startsWith('/api/admin/franchises') || path.startsWith('/api/admin/centers')
        || path.startsWith('/api/leveltest/') || path === '/api/teacher/leveltest-assignments'
        || path.startsWith('/api/admin/enrollments') || path.startsWith('/api/admin/community-posts')
        || path.startsWith('/api/admin/textbooks') || path === '/api/lesson-video'
        || path.startsWith('/api/get-lesson-video/') || path.startsWith('/api/admin/mango-videos')
        || path.startsWith('/api/admin/students/') || path.startsWith('/api/admin/selfscore/')
        || path === '/api/admin/attendance/import-cafe24' || path === '/api/admin/attendance/today' || path === '/api/admin/payments/import-cafe24'
        // 🚷 (2026-08-13 수정요청 #05) 장기 결석생 — 핸들러는 api-admin.ts 에 있다.
        //    ⚠️ 여기 안 적으면 handleAdminApi 까지 못 가서 **404** 다. 바로 위 teacher-contacts 가
        //       그렇게 통째로 먹통이었다(8/13 기록). 새 /api/admin/* 경로는 여기도 반드시 추가할 것.
        //    ℹ️ index.ts isAgencyAllowedApi 에는 «일부러» 넣지 않았다 — 이 화면(admin.html)은
        //       본사 전용이고, 지사·대리점 계정은 index.ts 가 /admin/exec 로 돌려보낸다.
        //       (그래도 쿼리 자체에는 scopeFragments 격리를 걸어 뒀다. 나중에 열어도 안 샌다.)
        || path === '/api/admin/attendance/long-absent'
        // 📊 (2026-08-19) 학원별 학생 수업현황(SLP 출석 통계) — 핸들러는 api-admin.ts 에 있다.
        //    안 적으면 handleAdminApi 까지 못 가서 404 (바로 위 long-absent 와 같은 함정).
        || path === '/api/admin/attendance/school-stats'
        || path === '/api/admin/payments/cafe24-diag'
        || path === '/api/admin/absent-sweep/run'
        || path === '/api/admin/lesson-reminder/run'
        || path.startsWith('/api/admin/referrals') || path.startsWith('/api/admin/counseling/')
        || path.startsWith('/api/admin/teacher-links')
        // 📇 (2026-08-13) 강사 «연락처» 연결 — 핸들러(api-admin.ts)와 index.ts 게이트는 8/7부터
        //    있었는데 이 위임 가드에만 빠져 있어 라이브에서 GET/POST 전부 404 였다.
        //    (「🔗 강사 연결」 화면·프로필 연결 API 가 통째로 먹통이던 원인)
        || path.startsWith('/api/admin/teacher-contacts')
        // 📶 (2026-08-27) 화상 회선품질·강제 릴레이 — teacher-contacts 와 똑같이 «핸들러와
        //    index.ts 게이트는 있는데 이 위임 가드에만 빠져» GET/POST 전부 404 였다.
        || path.startsWith('/api/admin/vc/')
        // 💳 (2026-08-13) 법인카드 CODEF 연동
        || path.startsWith('/api/admin/corpcard/')
        // 🏦 (2026-08-14) 신한은행 계좌 입출금 — 바로빌 계좌조회
        || path.startsWith('/api/admin/bankacct/')
        // 학생·학부모측 창구(관리자 표의 반대쪽 반쪽). 인증게이트는 index.ts 에 등록돼 있다.
        || path.startsWith('/api/referral/') || path.startsWith('/api/counseling/')
        || path === '/api/admin/attendance/qr-gen' || path === '/api/attendance/check-in'
        // 🎮 (2026-08-11 삭제) /api/battle/leaderboard·history 위임 가드 제거 — 영어 배틀 기능째 삭제.
        // 💰 (2026-08-15) 카페24 회계 실데이터(장부·급여·지출·세금·예치금·손익요약)
        //    핸들러(api-admin.ts)와 index.ts 인증게이트에는 있었는데 이 위임 가드에만 빠져 있어서
        //    /api/admin/finance-cafe24/{summary,ledger,payroll,expenses,tax,deposits} 가
        //    전부 index.ts 끝단 404({error:'Not Found'}) 로 떨어졌다 → 화면에 «집계 실패: Not Found»,
        //    «불러오기 실패: Not Found». teacher-contacts(8/13)·teacher-hr-analysis 와 같은 원인.
        || path.startsWith('/api/admin/finance-cafe24/')
        || path === '/api/admin/org/import-cafe24' || path === '/api/admin/staff/graph-list'
        || path === '/api/admin/org/hq'   // 🏯 본사 관리 (2026-08-18) — 여기 없으면 handleAdminApi 까지 못 가서 404
        // 🗓 (2026-08-19) 지난 수업에서 일정 만들기 — 미리보기/적용. 같은 이유로 여기에도 등록해야 한다
        || path.startsWith('/api/admin/schedule-seed/')
        // 👥 (2026-08-19) 진행 중인 수업의 강사·학생 이름 — 여기 없으면 handleAdminApi 까지 못 가서 404
        //     (teacher-contacts·finance-cafe24 가 같은 이유로 통째로 먹통이던 이력이 있다)
        || path === '/api/admin/live-classes'
        // 🔴 (2026-08-20) 예약 기준 지금 수업 현황 — 여기 없으면 handleAdminApi 까지 못 가서 404
        || path === '/api/admin/classes-now'
        /* 📅 (2026-08-25) 오늘 수업 전체(매니저 «바로 입장» 카드) — **2026-07-23 신설 이래 줄곧 404 였다.**
           index.ts 라우팅 목록(②)에는 있었지만 이 위임 가드(③)에 없어서 handleAdminApi 까지 못 갔다.
           ⚠️ 화면에서는 «고장» 으로 안 보였다 — 404 본문 {error:'Not Found'} 에는 `ok` 칸이 없어
              `if (d.ok === false)` 검사를 통과하고, `d.sessions || []` 가 빈 배열이 되어
              **「오늘 예정된 수업이 없습니다」라는 정상 문구**로 그려졌다(8/25 매니저 보고서 ②의 정체). */
        || path === '/api/admin/classes/today'
        || path === '/api/admin/teachers/graph-list' || path === '/api/admin/books/graph-list'
        || path === '/api/admin/level-tests' || path.startsWith('/api/admin/leveltest/')
        || path.startsWith('/api/admin/retention/')
        || path.startsWith('/api/admin/teacher/mbti') || path.startsWith('/api/mbti/')
        || path === '/api/teachers/mbti-list' || path.startsWith('/api/admin/teacher/praise')
        || path === '/api/teacher/praise' || path === '/api/teachers/list-public'
        || path.startsWith('/api/admin/payments/overdue') || path === '/api/admin/payments/notify-overdue'
        || path === '/api/admin/payments/notify-all-overdue' || path === '/api/admin/payments/record'
        || path.startsWith('/api/admin/ai-analyze/')
        || path.startsWith('/api/admin/schedules') || path.startsWith('/api/admin/unassigned-students')
        || path.startsWith('/api/admin/notify-queue') || path.startsWith('/api/admin/class-schedules')
        || path.startsWith('/api/admin/no-shows') || path === '/api/admin/students/merge-duplicates'
        || path.startsWith('/api/popups') || path.startsWith('/api/admin/popups')
        || path.startsWith('/api/admin/posters')
        || path.startsWith('/api/admin/teacher-profiles') || path.startsWith('/api/admin/teachers')
        || path.startsWith('/api/admin/teacher-classes') || path.startsWith('/api/admin/teacher-evaluation')
        // 📊 인사평가 근거 분석 — index.ts 게이트에만 있고 여기 빠져 있어서 목록 셀이
        //    전부 '불러오기 실패' 였다. (두 게이트 모두 등록해야 handleAdminApi 까지 간다)
        || path === '/api/admin/teacher-hr-analysis'
        || path === '/api/teacher/mbti-self' || path === '/api/admin/export/payroll.csv'
        || path.startsWith('/api/admin/stats/') || path.startsWith('/api/admin/kpi/')
        || path.startsWith('/api/admin/payroll/') || path.startsWith('/api/admin/schedule-requests')
        || path.startsWith('/api/admin/feedback-drafts')) {
      // ctx 를 넘긴다 — 교재 /raw 가 엣지 캐시 쓰기(waitUntil)에 쓴다 (2026-08-13)
      const rAdmin = await handleAdminApi(request, url, env, ctx);
      if (rAdmin) return rAdmin;
    }


    // ════════════════════════════════════════════════════════════
    // 🔎 통합 실시간 검색 — 학생(ERP 명부) + 교사 이름을 DB 에서 즉시 조회
    //   GET /api/admin/omnisearch?q=  → {ok, results:[{type,name,sub,uid,url}]}
    if (method === 'GET' && path === '/api/admin/omnisearch') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return json({ ok: true, results: [] });
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      const results: any[] = [];
      try {
        // 🧹 (2026-08-20) 숨김 지정한 중복 계정은 통합검색에도 안 나온다 — 명부와 답이 갈리면 안 된다.
        const _omniHide = await hiddenExcludeCond(env as any);
        const rs = await env.DB.prepare(
          `SELECT user_id, username, korean_name, english_name FROM students_erp
           WHERE (korean_name LIKE ? OR english_name LIKE ? OR username LIKE ? OR user_id LIKE ?)
           ${_omniHide ? 'AND ' + _omniHide : ''}
           LIMIT 25`
        ).bind(like, like, like, like).all();
        for (const r of ((rs.results as any[]) || [])) {
          const name = r.korean_name || r.english_name || r.username || r.user_id;
          if (!name) continue;
          const uid = r.user_id || r.username || '';
          results.push({ type: 'student', name, sub: [r.english_name, r.user_id].filter(Boolean).join(' · '), uid, url: uid ? '/admin/student?uid=' + encodeURIComponent(uid) : '' });
        }
      } catch {}
      // 출석 기록 기반 학생 (ERP 미등록이라도 이름으로 검색) — 중복 제거
      try {
        const seen = new Set(results.map((x: any) => String(x.uid || x.name)));
        const rs = await env.DB.prepare(
          `SELECT user_id, MAX(username) AS username FROM attendance
           WHERE username LIKE ? OR user_id LIKE ?
           GROUP BY user_id LIMIT 25`
        ).bind(like, like).all();
        for (const r of ((rs.results as any[]) || [])) {
          const uid = r.user_id || '';
          const name = r.username || uid;
          if (!name || seen.has(String(uid || name))) continue;
          seen.add(String(uid || name));
          results.push({ type: 'student', name, sub: uid, uid, url: uid ? '/admin/student?uid=' + encodeURIComponent(uid) : '' });
        }
      } catch {}
      try {
        const rs = await env.DB.prepare(`SELECT name, status FROM teachers WHERE name LIKE ? LIMIT 25`).bind(like).all();
        for (const r of ((rs.results as any[]) || [])) {
          if (!r.name) continue;
          results.push({ type: 'teacher', name: r.name, sub: r.status || '', uid: '', url: '' });
        }
      } catch {}
      return json({ ok: true, q, results: results.slice(0, 30) });
    }

    // (🎛️ AI 명령 라우터 3매처 → api-ai.ts — 27차)

    // (🥭 Phase WS 주간스케줄·미배정·알림큐·수업스케줄 → api-admin.ts — admin 5회차)

    // 🥭 Phase RM (Room-Match) — GET /api/class/sessions/today
    //   예약(class_schedules)에서 "오늘의 수업 세션"을 계산해 결정론적 room_id + 입장 시간창을 반환.
    //   ▸ 왜? 지금까지는 교사·학생이 방 코드를 손으로 입력 → 오타/기본값으로 서로 다른 방에 들어가 못 만났음.
    //     이제 둘 다 같은 예약(schedule.id)을 참조 → room_id = `class-{scheduleId}-{YYYYMMDD}` 로 항상 동일 → 엇갈림 원천 차단.
    //   ▸ 입장 시간창(join_open)도 서버(신뢰 시계)가 계산 → "너무 일찍/늦게" 입장 방지.
    //   query: ?user_id=X | ?student_name=Y (학생) · ?role=teacher&user_id=teacherUid | &student_name=강사명 (교사)
    if (method === 'GET' && path === '/api/class/sessions/today') {
      // 🧱 (2026-08-06) isolate 당 1회 — 이 API 는 학생·교사 양쪽이 입장할 때마다 부른다(정각 폭주 경로).
      await ensureSchemaOnce('class_schedules', async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`);
      });
      const url = new URL(request.url);
      const userId = (url.searchParams.get('user_id') || '').trim();
      const nameParam = (url.searchParams.get('student_name') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim().toLowerCase();
      const isTeacher = role === 'teacher' || role === 'admin';

      // ── 대상 예약 수집 조건 (신원: uid 우선, 없으면 이름으로 보강) ──
      /* 🎯 (2026-08-06 동시접속 진단) 신원 조회를 «2단계» 로 나눈다 — 계정 ID 우선, 이름은 폴백.
       *
       *  [예전 구조와 그 사고]
       *   조건을 전부 OR 로 묶어 한 번에 조회했다. 그래서 계정 ID 가 정확해도 «이름이 같은 남»의
       *   예약까지 목록에 섞였고, 자동입장은 «지금 시각에 가장 가까운 수업»을 고르므로
       *   남의 방으로 들어갈 수 있었다.
       *   · 강사 실사례: teachers 'FAR'(id 22, 담당 35건) 가 'HT FARRAH'(id 3) 안에 들어 있어
       *     FARRAH 로 조회하면 FAR 의 수업 35건이 함께 나왔다(부분일치 양방향).
       *     📌 (2026-09-08 사장님 확인) **그 둘은 실은 같은 사람이다** — id 3 은 퇴사 행이고
       *        지금 활성 수업 0건·계정 연결 0건이다. 그래도 **이 구조는 그대로 둔다**:
       *        여기서 막는 것은 그 쌍만이 아니라 «부분일치 일반» 이고, 아래 학생 동명이인
       *        (김민서 71명·김민준 56명)이 그 규칙의 진짜 이유다.
       *   · 학생: 동명이인이 실제로 많다(김민서 71명·김민준 56명). 지금 사고가 안 난 것은
       *     예약이 걸린 663명 중 이름이 겹치는 쌍이 «아직» 없어서일 뿐이다.
       *
       *  [새 구조] 1차 = 계정 ID 로만 조회. 오늘 수업이 하나라도 잡히면 거기서 끝.
       *           2차 = 1차가 0건일 때만 이름으로 조회(예전 완화책을 그대로 보존).
       *   → 계정이 제대로 연결된 사람에게는 남의 수업이 절대 섞이지 않고,
       *     계정 연결이 어긋난 사람(2026-07-24 에 완화했던 그 경우)은 예전처럼 이름으로 구제된다.
       *  ⚠️ 매칭을 «좁히기만» 한다. 예전에 찾아지던 사람이 못 찾아지는 경우는 없다.
       */
      const condsUid: string[] = [];
      const bindsUid: any[] = [];
      const condsName: string[] = [];
      const bindsName: any[] = [];

      if (isTeacher) {
        if (userId) { condsUid.push('cs.teacher_id = ?'); bindsUid.push(userId); }
        if (nameParam) {
          try {
            // 🔧 (2026-07-24 실사고) 로그인 계정명(admin_account.name, 예:'강선생님')과
            //   teachers.name(예:'중국어 강선생님') 표기가 다를 수 있어 완전일치면 매칭 실패 →
            //   교사가 "오늘 예약된 수업 없음"으로 오판, 학생과 다른 방(mangoi-class)에 들어가 못 만났다.
            //   부분일치(양방향)로 완화. — 이 완화는 유지하되 «완전일치가 있으면 그쪽만» 쓴다.
            const rs = await env.DB.prepare(
              `SELECT CAST(id AS TEXT) AS tid, (name = ?) AS exact FROM teachers WHERE name = ? OR name LIKE ('%' || ? || '%') OR (length(name) > 0 AND ? LIKE ('%' || name || '%'))`
            ).bind(nameParam, nameParam, nameParam, nameParam).all<any>();
            const all = (rs.results || []).filter((x: any) => x.tid);
            const exact = all.filter((x: any) => Number(x.exact) === 1);
            // 이름이 정확히 일치하는 강사가 있으면 부분일치분은 버린다(동명이인·부분일치 오염 차단)
            for (const x of (exact.length ? exact : all)) { condsName.push('cs.teacher_id = ?'); bindsName.push(x.tid); }
          } catch {}
        }
      } else {
        if (userId) {
          condsUid.push('cs.user_id = ?'); bindsUid.push(userId);
          /* 🔤 (2026-08-27) 예약 행의 아이디는 표기가 어긋난 채 들어오기도 한다 — 실측: 같은 학생의
             예약이 'Jjy2323'(수강신청 확정)과 'jjy2323' 두 표기로 나란히 존재했다. 로그인으로 확정된
             uid 를 NOCASE 로 넓히는 것은 학생 로그인의 대소문자 무시 결정(2026-08-26 사장님)을 따르는
             확장이다. ⚠️ 전제: 대소문자만 다른 두 계정이 «다른 사람»인 사례는 실측상 아직 없다
             (Kim/kim·Lee/lee 전부 동일인 — CLAUDE.md 2장). 그런 사례가 생기면 이 줄부터 다시 보라. */
          condsUid.push('LOWER(cs.user_id) = LOWER(?)'); bindsUid.push(userId);
        }
        if (nameParam) {
          condsName.push('cs.student_name = ?'); bindsName.push(nameParam);
          /* 🔑 (2026-08-27 실사고 — heyst 김사랑 · ubckt01 조연희) 로비 입력칸은 «아이디» 를 묻는데
             («아이디·비밀번호만 입력하면…»), 이 폴백은 이름 칸(korean_name·username)만 대조했다.
             그래서 비로그인 학생이 아이디를 치면 예약이 있어도 항상 「오늘 예약된 수업이 없어요」
             → 공용방 폴백으로 흘러 강사와 영영 못 만났다(둘 다 그날 밤 수업 불성립).
             아이디로도 찾는다 — 규칙은 학생 로그인과 동일(CLAUDE.md 2장 대소문자 항목):
             ① 정확일치 우선 ② 대소문자만 다른 후보는 정확히 1건일 때만. 모르면 안 붙인다. */
          try {
            const rs2 = await env.DB.prepare(
              `SELECT user_id, (user_id = ?) AS exact FROM students_erp WHERE user_id = ? COLLATE NOCASE OR login_id = ? COLLATE NOCASE`
            ).bind(nameParam, nameParam, nameParam).all<any>();
            const cand = (rs2.results || []).filter((x: any) => x.user_id);
            const ex = cand.filter((x: any) => Number(x.exact) === 1);
            const pick = ex.length ? ex : (cand.length === 1 ? cand : []);
            // 예약 행 쪽 표기 어긋남(위 'Jjy2323' 실측)도 함께 구제 — 이미 계정 1건으로 확정된 뒤라 안전
            for (const x of pick) { condsName.push('LOWER(cs.user_id) = LOWER(?)'); bindsName.push(x.user_id); }
          } catch {}
          /* ⚠️ 아래 «이름 → 계정» 구제는 2026-08-27 까지 없는 컬럼('stu_' || id)을 참조해
             조용히 죽어 있었다(no such column: id → catch 가 삼킴) — 이름 구제의 실체는
             cs.student_name 한 줄뿐이었다. SQL 을 고치되, 동명이인이 실재하므로(김민서 71명·
             김민준 56명) **이름이 정확히 한 계정으로만 떨어질 때만** 잇는다. 둘 이상이면 남의
             수업에 들어갈 수 있어 안 붙인다(cs.student_name 직접 일치는 기존대로 유지). */
          try {
            const rs = await env.DB.prepare(
              `SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`
            ).bind(nameParam, nameParam).all<any>();
            const uids = Array.from(new Set((rs.results || []).map((x: any) => x.uid).filter(Boolean)));
            if (uids.length === 1) { condsName.push('LOWER(cs.user_id) = LOWER(?)'); bindsName.push(uids[0]); }
          } catch {}
        }
      }
      if (!condsUid.length && !condsName.length) return json({ ok: false, error: 'identity_required', sessions: [], current: null }, 400);

      // ── KST(UTC+9) 기준 오늘 날짜/요일 계산 (Workers 는 UTC 라 명시 변환) ──
      const now = Date.now();
      const KST = 9 * 3600 * 1000;
      const k = new Date(now + KST);
      const kY = k.getUTCFullYear(), kMo = k.getUTCMonth(), kD = k.getUTCDate();
      const kDow = k.getUTCDay(); // 0=일 ~ 6=토 (KST 기준)
      const pad = (n: number) => String(n).padStart(2, '0');
      const ymd = `${kY}${pad(kMo + 1)}${pad(kD)}`;
      const todayStr = `${kY}-${pad(kMo + 1)}-${pad(kD)}`;

      // 🗓️ (2026-07-24) 요일 표기 관용 파서 — 저장 형식이 한 가지가 아니다.
      //   숫자 '5' / 콤마목록 '1,3' / 영문 'Mon'(캘린더 드래그 PATCH 가 이 형식으로 저장)
      //   / 한글 '월'. 기존엔 Number(x)===kDow 단일 비교라 뒤 두 형식은 NaN 이 되어
      //   예약이 있는데도 "오늘 예약된 수업이 없어요" 가 떴다. (매칭을 넓히기만 함)
      const DOW_MAP: Record<string, number> = {
        sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
        tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
        thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
        sat: 6, saturday: 6, '토': 6, '토요일': 6,
      };
      const dowMatches = (raw: any, target: number): boolean => {
        for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
          const q = p.trim();
          if (!q) continue;
          if (/^\d+$/.test(q)) { if (Number(q) === target) return true; continue; }
          const v = DOW_MAP[q.toLowerCase()];
          if (v != null && v === target) return true;
        }
        return false;
      };

      const OPEN_BEFORE = 10 * 60 * 1000;            // 정규 수업: 시작 10분 전부터 입장 허용
      /* ⏰ (2026-08-07) 레벨테스트만 30분 — 처음 오는 사람이라 카메라·마이크를 미리 켜 보고
         기다릴 시간이 필요하다. 가장 서툰 사람에게 가장 짧은 준비 시간을 주고 있었다.
         ⛔ 정규 수업은 그대로 둔다 — 학생 29,000명 전체의 입장 시각을 바꾸는 일이다.
         ⚠️ leveltest-ticket.ts 의 OPEN_BEFORE_MS 와 **같은 값**이어야 한다. 한쪽만 고치면
            «티켓엔 입장 버튼이 떴는데 서버는 아직 안 열어주는» 상태가 된다. */
      const OPEN_BEFORE_LEVELTEST = 30 * 60 * 1000;  // 레벨테스트: 시작 30분 전부터
      const LATE_AFTER = 15 * 60 * 1000;  // 종료 15분 후까지 지각 입장 허용

      /** 조건 한 벌로 «오늘 발생하는» 수업 목록을 만든다. 2단계 조회(ID → 이름)에서 두 번 쓰인다. */
      const runPass = async (conds: string[], binds: any[]): Promise<any[]> => {
        if (!conds.length) return [];
        const whereSql = `cs.status != 'cancelled' AND (${conds.join(' OR ')})`;
        const sqlJoin = `SELECT cs.id, cs.user_id, cs.student_name, cs.schedule_kind, cs.class_type, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.teacher_id, cs.status, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE ${whereSql}`;
        const sqlNoJoin = `SELECT id, user_id, student_name, schedule_kind, class_type, day_of_week, scheduled_date, start_time, duration_min, teacher_id, status FROM class_schedules cs WHERE ${whereSql}`;
        let rows: any;
        try { rows = await env.DB.prepare(sqlJoin).bind(...binds).all<any>(); }
        catch { rows = await env.DB.prepare(sqlNoJoin).bind(...binds).all<any>(); }

        const seen = new Set<number>();
        const out: any[] = [];
        for (const s of (rows.results || [])) {
          if (seen.has(s.id)) continue;
          // 오늘 발생하는 수업인가? (일회성=날짜 일치 / 반복=요일 일치)
          let occurs = false;
          if (s.scheduled_date) occurs = (s.scheduled_date === todayStr);
          else if (s.day_of_week != null && s.day_of_week !== '') occurs = dowMatches(s.day_of_week, kDow);
          if (!occurs) continue;
          seen.add(s.id);
          const [hh, mm] = String(s.start_time || '00:00').split(':').map((x: string) => Number(x));
          const start_ts = Date.UTC(kY, kMo, kD, hh, mm, 0) - KST; // KST 벽시계 → UTC ms
          const dur = Number(s.duration_min) || 30;
          const end_ts = start_ts + dur * 60000;
          // 레벨테스트만 30분 전부터 (위 상수 주석 참조) — 그 외는 전부 10분 그대로
          const openBefore = (String(s.class_type || '') === 'level_test') ? OPEN_BEFORE_LEVELTEST : OPEN_BEFORE;
          const open_at_ts = start_ts - openBefore;
          const close_at_ts = end_ts + LATE_AFTER;
          let status: string;
          if (now < open_at_ts) status = 'early';
          else if (now < start_ts) status = 'open';
          else if (now <= close_at_ts) status = 'live';
          else status = 'ended';
          const join_open = now >= open_at_ts && now <= close_at_ts;
          out.push({
            schedule_id: s.id,
            room_id: `class-${s.id}-${ymd}`, // ← 결정론적: 같은 예약 → 항상 같은 방
            student_uid: s.user_id,
            student_name: s.student_name || null,
            teacher_id: s.teacher_id || null,
            teacher_name: s.teacher_name || null,
            start_ts, end_ts, open_at_ts, close_at_ts,
            duration_min: dur, status, join_open,
            starts_in_ms: start_ts - now,
          });
        }
        return out;
      };

      // 1차 = 계정 ID 로만. 2차 = 1차가 0건일 때만 이름으로(계정 연결이 어긋난 사람 구제).
      let matchedBy: 'uid' | 'name' | 'none' = 'none';
      let sessions = await runPass(condsUid, bindsUid);
      if (sessions.length) matchedBy = 'uid';
      else {
        sessions = await runPass(condsName, bindsName);
        if (sessions.length) matchedBy = 'name';
      }
      sessions.sort((a, b) => a.start_ts - b.start_ts);

      /* 🚪 「오늘은 이 방으로」 — 선생님·관리자가 지정해 둔 회의방이 있으면 room_id 를 갈아 끼운다.
         학생 화면은 이 답을 그대로 쓰므로(js/idx-main.js 「빈 방코드 → 오늘 예약 방으로 자동 교정」)
         **학생이 하는 일은 평소와 똑같다.** 정본·주의사항은 src/class-room-override.ts.
         ⚠️ 이 호출은 던지지 않는다(fail-open) — 지정이 안 걸리면 예약방 그대로다. */
      await applyRoomOverrides(env.DB, sessions, ymd);

      /* 🚪 「문을 열어 줄 것인가」 — «지금이 수업 시간인가»(join_open)와 **다른 질문**이다.
         (2026-09-11 마이마이 제보 「나가면 다시 못 들어온다」) 강사 포털은 2026-08-07 부터 하루 종일
         열려 있는데 이 API 만 종료+15분에 닫혀, 수업에서 나간 강사가 홈에서 다시 못 들어왔다.
         ⛔ close_at_ts 는 손대지 않는다 — 상태 라벨·카운트다운·「지금 진행 중인 수업」이 거기 걸려 있다.
         규칙·근거는 src/class-entry-window.ts 한 곳에 있다. */
      {
        const dayStartTs = Date.UTC(kY, kMo, kD, 0, 0, 0) - KST;
        const starts = sessions.map((x: any) => x.start_ts);
        for (const s2 of sessions) {
          const w = entryWindow({
            isTeacher,
            dayStartTs,
            openAtTs: s2.open_at_ts,
            endTs: s2.end_ts,
            nextStartTs: nextStartAfter(starts, s2.start_ts),
          });
          s2.enter_from_ts = w.from;
          s2.enter_until_ts = w.until;
          s2.can_enter = canEnterNow(w, now);
          // 막을 때 보여 줄 문구를 **서버가** 만든다 — 한/영 병기 + 첫 화면 예산(여유 70바이트) 보호.
          if (!s2.can_enter) s2.enter_msg = enterBlockedMsg(w, now);
        }
      }

      // 자동 입장 대상(current): 지금 입장 가능한 것 우선(진행중/열림), 없으면 가장 가까운 예정 수업
      let current: any = null;
      const joinable = sessions.filter(x => x.join_open);
      if (joinable.length) current = joinable.sort((a, b) => Math.abs(a.start_ts - now) - Math.abs(b.start_ts - now))[0];
      else { const up = sessions.filter(x => x.status === 'early'); if (up.length) current = up[0]; }

      /* 🚪 student_gate — 학생을 공용방으로 흘려보내지 않는 기능의 on/off 를 «서버가» 알려 준다.
         화면(index.html)은 정적 파일이라 wrangler 변수를 직접 못 읽는다. 이 API 는 학생이
         입장을 누르는 바로 그 지점에서 호출되므로, 여기에 실어 보내는 것이 가장 확실하다.
         ⛔ 기본 'off' — 지금 켜면 실제 학생 예약이 6건뿐이라 대다수가 입장 불가가 된다(wrangler.toml 주석 참고). */
      const studentGate = ((env as any).VC_STUDENT_ROOM_GATE === 'on') ? 'on' : 'off';

      /* 🔁 net_relay — 이 수업은 «중계(TURN) 강제» 로 붙을지를 서버가 알려 준다.
         위 student_gate 와 같은 사정이다(정적 화면은 설정을 직접 못 읽는다) + 이 API 는
         학생·교사 «양쪽» 이 입장 직전에 부르므로 두 사람이 같은 정책을 받는다.

         [왜 필요한가] 지금은 직접(P2P) 연결이 **실패해야** 릴레이로 넘어간다(idx-main.js createPeer).
         그런데 중국 회선은 «연결은 되는데 패킷만 흘리는» 경우가 많아 그 조건에 안 걸린다.
         2026-08-21 중국어 수업(class-851)에서 강사 영상이 AAO 로 통째로 꺼졌다.

         [왜 이름이 아니라 번호인가] 강사 번호는 세 갈래라 이름으로 이으면 남의 것이 붙는다
         (CLAUDE.md 2장). 여기 teacher_id 는 class_schedules ↔ teachers.id 한 도메인이라
         어긋날 수 없다. 게다가 위 sqlNoJoin 경로에는 teacher_name 이 아예 없다. */
      let netRelay = false;
      const relayTid = String((current && current.teacher_id) || '').trim();
      if (relayTid) {
        try {
          await ensureSchemaOnce('vc_relay_force', async () => {
            await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_relay_force (teacher_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, note TEXT, updated_at INTEGER, updated_by TEXT)`);
          });
          const rrow = await env.DB.prepare(`SELECT enabled FROM vc_relay_force WHERE teacher_id = ?`).bind(relayTid).first<any>();
          /* ⛔ Cloudflare TURN 이 설정돼 있을 때만 켠다. 없으면 /api/ice-servers 가 대체 목록으로
             **무료 공개 TURN(openrelay.metered.ca)** 을 내려주는데, 거기로 «강제» 릴레이하면
             직접 연결보다 나빠질 수 있다. 회선을 살리려다 더 망가뜨리는 교환은 하지 않는다. */
          const hasCfTurn = !!((env as any).TURN_KEY_ID && (env as any).TURN_KEY_API_TOKEN);
          netRelay = hasCfTurn && !!(rrow && Number(rrow.enabled) === 1);
        } catch { netRelay = false; }   // 표가 없거나 조회 실패 = 평소대로(직접 연결). 수업을 막지 않는다.
      }

      // matched_by: 'uid'=계정 ID 로 찾음(가장 안전) · 'name'=이름 폴백(계정 연결 어긋남 → 운영에서 고쳐야 할 대상)
      return json({ ok: true, now, today: todayStr, role: isTeacher ? 'teacher' : 'student', sessions, current, matched_by: matchedBy, student_gate: studentGate, net_relay: netRelay });
    }

    // 🥭 (2026-08-24) GET /api/class/schedule/mine — 학생 홈 화면 "내 수업" 위젯.
    //   [왜] 위 /sessions/today 는 "오늘" 만 본다. 학생이 홈에서 "무슨 요일 몇 시에 수업이
    //        있는지"를 미리 알 방법이 아예 없었다(내일부터 수업인 학생은 "오늘 예약 없음"만 봄).
    //   [무엇] 입장 판정과는 무관한 **읽기 전용 안내**다. class_schedules 를 그대로 보여주고,
    //        반복 요일은 "다음에 오는 날짜"까지 계산해 준다. 방 조회·입장 로직은 건드리지 않는다.
    //   ⚠️ 요일 파서(dowList)는 /sessions/today 의 dowMatches 와 반드시 같은 표기를 인식해야
    //      한다 — 한쪽만 알아듣는 표기가 있으면 "화면엔 있는데 입장은 안 되는" 어긋남이 생긴다.
    /* ═══════════════════════════════════════════════════════════════════════
       🛠 원격 수리·점검 PIN (2026-08-30, v4 제안서 07)
       ───────────────────────────────────────────────────────────────────────
       [무엇] 관리자·강사가 6자리 PIN 을 만들고, 학생이 그 PIN 을 자기 화면에 넣으면
         «원격 지원을 허용했다» 는 사실이 서버에 남는다. 그 다음 실제 화면 제어는
         **Quick Assist / Chrome 원격 데스크톱**(index.html 의 원격 지원 안내)이 한다.
       ⛔ 우리가 화면을 직접 제어하지 않는다 — 그런 코드를 만들지 말 것. 브라우저에는 «남의 기기를
          조작하는» API 가 아예 없다(보안상 일부러 없다). 실제 조작은 Quick Assist·Chrome 원격
          데스크톱이 하고, 우리는 ① «누가 언제 허락했는가» 를 남기고 ② 직원이 만든 **접속 코드를
          학생 화면까지 날라다 준다**. 그 둘이 이 기능의 전부다.
          (허락 기록이 없으면 「누가 내 컴퓨터를 봤나」에 답할 수가 없다.)

       📞 (2026-09-01 사장님 지시 «직원이 원격으로 들어가서 수리») 왜 코드를 날라다 주나 —
          Quick Assist 는 **도우미(직원)가 6자리 보안코드를 만들고 학생이 그것을 입력**하는 구조다.
          그 코드를 전화로 불러 주고 받아 적게 하는 것이 이 흐름에서 제일 자주 깨지는 자리였다
          (아이 · 한국어를 못 읽는 필리핀 강사). 직원이 붙여넣으면 학생 화면에 크게 뜬다.
       ⚠️ 학생 쪽 조회는 PIN 이 아니라 claim 때 받은 **세션 토큰**으로 한다 — PIN(6자리)으로
          조회를 열면 그 경로로 번호를 무제한 찍어 볼 수 있다(claim 의 5회 제한을 우회한다).

       [왜 /api/class/ 밑인가] 이 접두사는 src/index.ts 라우팅에 **이미** 올라와 있어
         공동 금지구역을 한 줄도 안 건드린다. 대신 라우팅과 인증은 다른 것이므로
         발급 경로는 **핸들러 안에서 관리자 세션을 직접 확인**한다
         (CLAUDE.md 2장 「라우팅 허용목록에 올렸으니 인증도 된 것」).

       ⚠️ 학생 쪽(claim)은 로그인 없이도 눌러야 한다 — 컴퓨터가 고장 나서 부르는 자리다.
          그래서 무인증이지만 ① 6자리 · ② 10분 만료 · ③ 시도 5회 제한 · ④ 1회용으로 좁힌다.
       ⛔ 응답에 학생 이름·연락처를 넣지 말 것 — 무인증 경로다. «맞다/틀리다» 까지만 말한다.
       ═══════════════════════════════════════════════════════════════════════ */
    /* 표는 이미 운영에 있으므로 CREATE 만으로는 새 칸이 안 생긴다 — 지연 ALTER 로 붙인다
       (attendance.host·vc_quality.novideo 와 같은 방식). ⚠️ 읽는 쪽보다 «먼저» 돌아야 하므로
       세 경로가 전부 이 함수를 부른다. 키를 v2 로 바꿔 배포 뒤 한 번은 반드시 돌게 한다. */
    const ensureRemoteSupportSchema = async () => {
      await ensureSchemaOnce('remote_support_pins_v2', async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS remote_support_pins (pin TEXT PRIMARY KEY, student_uid TEXT, student_name TEXT, issued_by TEXT, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER DEFAULT 0, claimed_at INTEGER)`);
        for (const col of ['session TEXT', 'helper_code TEXT', 'helper_tool TEXT', 'helper_at INTEGER',
                           'student_code TEXT', 'student_tool TEXT', 'student_code_at INTEGER']) {
          try { await env.DB.exec(`ALTER TABLE remote_support_pins ADD COLUMN ${col}`); } catch { /* 이미 있음 */ }
        }
      });
    };

    if (path === '/api/class/remote-support/issue' && method === 'POST') {
      const rsSess: any = await checkAdminSession(request, env as any);
      if (!rsSess || !rsSess.ok) return json({ ok: false, error: 'admin_session_required' }, 401);
      await ensureRemoteSupportSchema();
      const rsBody: any = await request.json().catch(() => ({}));
      const now = Date.now();
      const TTL_MS = 10 * 60 * 1000;

      /* 🔢 6자리 — 예측 가능한 Math.random 대신 crypto 로 뽑는다. 앞자리 0 도 허용한다
         (000123 을 버리면 후보가 줄고, 사람에게 읽어 주는 데는 아무 문제가 없다). */
      let pin = '';
      for (let i = 0; i < 6; i++) {
        const b = new Uint32Array(1); crypto.getRandomValues(b);
        pin += String(b[0] % 10);
      }
      try {
        // 만료된 옛 PIN 은 그때그때 치운다 — 따로 도는 청소 작업을 만들지 않는다
        await env.DB.prepare(`DELETE FROM remote_support_pins WHERE expires_at < ?`).bind(now).run();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO remote_support_pins (pin, student_uid, student_name, issued_by, issued_at, expires_at, attempts, claimed_at)
           VALUES (?,?,?,?,?,?,0,NULL)`
        ).bind(pin, String(rsBody.student_uid || '').trim() || null, String(rsBody.student_name || '').trim() || null,
                String(rsSess.username || rsSess.uid || 'admin'), now, now + TTL_MS).run();
      } catch (e: any) {
        return json({ ok: false, error: 'issue_failed', message: String(e?.message || e).slice(0, 200) }, 500);
      }
      return json({ ok: true, pin, expires_at: now + TTL_MS, ttl_sec: Math.round(TTL_MS / 1000) });
    }

    if (path === '/api/class/remote-support/claim' && method === 'POST') {
      await ensureRemoteSupportSchema();
      const rcBody: any = await request.json().catch(() => ({}));
      const rcPin = String(rcBody.pin || '').replace(/\D/g, '');
      if (rcPin.length !== 6) return json({ ok: false, error: 'bad_pin' }, 400);
      let row: any = null;
      try {
        row = await env.DB.prepare(`SELECT pin, student_uid, expires_at, attempts, claimed_at FROM remote_support_pins WHERE pin = ?`).bind(rcPin).first();
      } catch {
        /* 표가 아직 없다 = 아무도 PIN 을 만든 적이 없다. «틀렸다» 로 답한다(내부 사정을 알리지 않는다) */
        return json({ ok: false, error: 'not_found' }, 404);
      }
      const now2 = Date.now();
      if (!row) return json({ ok: false, error: 'not_found' }, 404);
      if (Number(row.attempts) >= 5) return json({ ok: false, error: 'too_many_attempts' }, 429);
      if (Number(row.expires_at) < now2) return json({ ok: false, error: 'expired' }, 410);
      if (row.claimed_at) return json({ ok: false, error: 'already_used' }, 409);

      /* 학생 아이디를 함께 보냈으면 «발급할 때 지정한 학생» 과 맞는지 본다.
         ⚠️ 지정 없이 발급했으면(현장에서 이름을 모를 때) 이 검사는 건너뛴다 —
            그때는 PIN 을 «읽어 준 사람» 이 곧 확인 절차다. */
      const rcUid = String(rcBody.user_id || '').trim();
      if (row.student_uid && rcUid && String(row.student_uid).toLowerCase() !== rcUid.toLowerCase()) {
        try { await env.DB.prepare(`UPDATE remote_support_pins SET attempts = attempts + 1 WHERE pin = ?`).bind(rcPin).run(); } catch {}
        return json({ ok: false, error: 'uid_mismatch' }, 403);
      }
      /* 🎫 세션 토큰 — 이 뒤로 학생 화면은 PIN 이 아니라 이것으로 조회한다(머리말 ⚠️ 참고). */
      const rcSession = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      try {
        await env.DB.prepare(`UPDATE remote_support_pins SET claimed_at = ?, attempts = attempts + 1, session = ? WHERE pin = ?`).bind(now2, rcSession, rcPin).run();
      } catch (e: any) {
        /* 🔴 «허락했다» 는 기록을 못 남기면 이 기능의 존재 이유가 사라진다 — 조용히 넘기지 않는다.
           그렇다고 학생을 막지도 않는다(컴퓨터가 고장 나서 부르는 자리다). 로그로 남기고 통과.
           ⚠️ 다만 이때는 세션이 저장되지 않았으므로 코드 받기도 안 된다 — 학생 화면이
              «기다리는 중» 에서 안 넘어가는 것이 조용히 틀린 코드를 보여 주는 것보다 낫다. */
        console.warn('[remote-support] claim 기록 실패:', (e as any)?.message);
      }
      return json({ ok: true, claimed_at: now2, session: rcSession, expires_at: Number(row.expires_at) });
    }

    /* 📮 직원 → 학생 : 접속 코드 보내기 (관리자 세션 필요)
       ⛔ 라우팅과 인증은 다른 것이다 — /api/class/ 는 라우팅만 열려 있으므로 여기서 직접 확인한다. */
    if (path === '/api/class/remote-support/helper-code' && method === 'POST') {
      const hcSess: any = await checkAdminSession(request, env as any);
      if (!hcSess || !hcSess.ok) return json({ ok: false, error: 'admin_session_required' }, 401);
      await ensureRemoteSupportSchema();
      const hcBody: any = await request.json().catch(() => ({}));
      const hcPin = String(hcBody.pin || '').replace(/\D/g, '');
      /* 숫자만 받는다. Quick Assist 6자리 · Chrome 원격 데스크톱 12자리 · AnyDesk 9~10자리를 덮는다.
         ⛔ 자유 문자열로 받지 말 것 — 이 값은 학생 화면에 그대로 그려진다. */
      const hcCode = String(hcBody.code || '').replace(/\D/g, '');
      const hcTool = ['quickassist', 'chromeremote', 'anydesk'].includes(String(hcBody.tool || ''))
        ? String(hcBody.tool) : 'quickassist';
      if (hcPin.length !== 6) return json({ ok: false, error: 'bad_pin' }, 400);
      if (hcCode.length < 4 || hcCode.length > 12) return json({ ok: false, error: 'bad_code' }, 400);
      let hcRow: any = null;
      try {
        hcRow = await env.DB.prepare(`SELECT pin, expires_at, claimed_at FROM remote_support_pins WHERE pin = ?`).bind(hcPin).first();
      } catch { return json({ ok: false, error: 'not_found' }, 404); }
      if (!hcRow) return json({ ok: false, error: 'not_found' }, 404);
      if (Number(hcRow.expires_at) < Date.now()) return json({ ok: false, error: 'expired' }, 410);
      /* ⚠️ 학생이 아직 번호를 안 넣었으면 보낼 곳이 없다 — «보냈다» 고 답하면 직원이 기다리기만 한다. */
      if (!hcRow.claimed_at) return json({ ok: false, error: 'not_claimed' }, 409);
      try {
        await env.DB.prepare(`UPDATE remote_support_pins SET helper_code = ?, helper_tool = ?, helper_at = ? WHERE pin = ?`)
          .bind(hcCode, hcTool, Date.now(), hcPin).run();
      } catch (e: any) {
        return json({ ok: false, error: 'save_failed', message: String(e?.message || e).slice(0, 200) }, 500);
      }
      return json({ ok: true, sent_at: Date.now() });
    }

    /* 👀 직원 화면이 «학생이 번호를 넣었나» 를 본다 (관리자 세션 필요).
       이게 없으면 직원은 전화로 계속 물어봐야 한다. */
    if (path === '/api/class/remote-support/pin-status' && method === 'GET') {
      const psSess: any = await checkAdminSession(request, env as any);
      if (!psSess || !psSess.ok) return json({ ok: false, error: 'admin_session_required' }, 401);
      await ensureRemoteSupportSchema();
      const psPin = String(url.searchParams.get('pin') || '').replace(/\D/g, '');
      if (psPin.length !== 6) return json({ ok: false, error: 'bad_pin' }, 400);
      let psRow: any = null;
      try {
        psRow = await env.DB.prepare(`SELECT claimed_at, expires_at, helper_at, student_code, student_tool, student_code_at FROM remote_support_pins WHERE pin = ?`).bind(psPin).first();
      } catch { return json({ ok: false, error: 'not_found' }, 404); }
      if (!psRow) return json({ ok: false, error: 'not_found' }, 404);
      return json({ ok: true, claimed: !!psRow.claimed_at, claimed_at: Number(psRow.claimed_at) || null,
                    code_sent: !!psRow.helper_at, expires_at: Number(psRow.expires_at) || null,
                    /* ⬅️ 반대 방향 — 모바일(AnyDesk 등)은 «학생이 번호를 만들고 직원이 접속» 한다 */
                    student_code: psRow.student_code || null, student_tool: psRow.student_tool || null,
                    student_code_at: Number(psRow.student_code_at) || null });
    }

    /* ⬅️ 학생 → 직원 : 내 접속 번호 알려주기 (무인증, 세션 토큰 필요)
       [왜 반대 방향이 필요한가] Quick Assist 는 «직원이 코드를 만들고 학생이 입력» 이지만,
         **모바일에서 쓰는 도구(AnyDesk 등)는 정반대**다 — 학생 기기가 9~10자리 ID 를 갖고 있고
         직원이 그 번호로 «접속» 한다. 사장님 지시가 «모바일에도 들어가서 수리» 라 이 방향이 있어야
         폰을 덮는다. 지금까지는 그 번호를 카톡으로 불러 주게 안내하고 있었다.
       ⛔ PIN 이 아니라 세션 토큰으로 받는다 — PIN 으로 열면 6자리를 찍어 볼 수 있다.
       ⛔ 자유 문자열 금지 — 이 값은 직원 화면에 그대로 그려진다. 숫자만 받는다. */
    if (path === '/api/class/remote-support/student-code' && method === 'POST') {
      await ensureRemoteSupportSchema();
      const scBody: any = await request.json().catch(() => ({}));
      const scSession = String(scBody.session || '').trim();
      const scCode = String(scBody.code || '').replace(/\D/g, '');
      const scTool = ['anydesk', 'quickassist', 'chromeremote'].includes(String(scBody.tool || ''))
        ? String(scBody.tool) : 'anydesk';
      if (!/^[0-9a-f]{32}$/.test(scSession)) return json({ ok: false, error: 'bad_session' }, 400);
      if (scCode.length < 4 || scCode.length > 12) return json({ ok: false, error: 'bad_code' }, 400);
      let scRow: any = null;
      try {
        scRow = await env.DB.prepare(`SELECT pin, expires_at FROM remote_support_pins WHERE session = ?`).bind(scSession).first();
      } catch { return json({ ok: false, error: 'not_found' }, 404); }
      if (!scRow) return json({ ok: false, error: 'not_found' }, 404);
      if (Number(scRow.expires_at) < Date.now()) return json({ ok: false, error: 'expired' }, 410);
      try {
        await env.DB.prepare(`UPDATE remote_support_pins SET student_code = ?, student_tool = ?, student_code_at = ? WHERE session = ?`)
          .bind(scCode, scTool, Date.now(), scSession).run();
      } catch (e: any) {
        return json({ ok: false, error: 'save_failed', message: String(e?.message || e).slice(0, 200) }, 500);
      }
      return json({ ok: true, sent_at: Date.now() });
    }

    /* 📥 학생 화면이 «직원이 코드를 보냈나» 를 본다 — 무인증이지만 세션 토큰이 있어야 한다.
       ⛔ PIN 으로 조회할 수 있게 만들지 말 것(6자리를 찍어 볼 수 있게 된다 — 머리말 ⚠️). */
    if (path === '/api/class/remote-support/status' && method === 'GET') {
      await ensureRemoteSupportSchema();
      const stSession = String(url.searchParams.get('session') || '').trim();
      if (!/^[0-9a-f]{32}$/.test(stSession)) return json({ ok: false, error: 'bad_session' }, 400);
      let stRow: any = null;
      try {
        stRow = await env.DB.prepare(`SELECT expires_at, helper_code, helper_tool, helper_at FROM remote_support_pins WHERE session = ?`).bind(stSession).first();
      } catch { return json({ ok: false, error: 'not_found' }, 404); }
      if (!stRow) return json({ ok: false, error: 'not_found' }, 404);
      if (Number(stRow.expires_at) < Date.now()) return json({ ok: false, error: 'expired' }, 410);
      return json({ ok: true, code: stRow.helper_code || null, tool: stRow.helper_tool || null,
                    sent_at: Number(stRow.helper_at) || null, expires_at: Number(stRow.expires_at) || null });
    }

    if (method === 'GET' && path === '/api/class/schedule/mine') {
      await ensureSchemaOnce('class_schedules', async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT)`);
      });
      const msUserId = (url.searchParams.get('user_id') || '').trim();
      const msName = (url.searchParams.get('student_name') || '').trim();
      if (!msUserId && !msName) return json({ ok: false, error: 'identity_required', schedules: [] }, 400);

      const DOW_LABEL_KO = ['일', '월', '화', '수', '목', '금', '토'];
      const DOW_LABEL_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const MS_DOW_MAP: Record<string, number> = {
        sun: 0, sunday: 0, '일': 0, '일요일': 0, mon: 1, monday: 1, '월': 1, '월요일': 1,
        tue: 2, tuesday: 2, '화': 2, '화요일': 2, wed: 3, wednesday: 3, '수': 3, '수요일': 3,
        thu: 4, thursday: 4, '목': 4, '목요일': 4, fri: 5, friday: 5, '금': 5, '금요일': 5,
        sat: 6, saturday: 6, '토': 6, '토요일': 6,
      };
      const dowList = (raw: any): number[] => {
        const out: number[] = [];
        for (const p of String(raw ?? '').split(/[,\s/·]+/)) {
          const q = p.trim();
          if (!q) continue;
          if (/^\d+$/.test(q)) { const n = Number(q); if (n >= 0 && n <= 6) out.push(n); continue; }
          const v = MS_DOW_MAP[q.toLowerCase()];
          if (v != null) out.push(v);
        }
        return out;
      };

      const runMsPass = async (cond: string, bind: string): Promise<any[]> => {
        const sqlJoin = `SELECT cs.id, cs.day_of_week, cs.scheduled_date, cs.start_time, cs.duration_min, cs.class_type, t.name AS teacher_name
                          FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id
                          WHERE cs.status != 'cancelled' AND ${cond}`;
        const sqlNoJoin = `SELECT id, day_of_week, scheduled_date, start_time, duration_min, class_type FROM class_schedules WHERE status != 'cancelled' AND ${cond}`;
        try { return (await env.DB.prepare(sqlJoin).bind(bind).all<any>()).results || []; }
        catch { return (await env.DB.prepare(sqlNoJoin).bind(bind).all<any>()).results || []; }
      };

      let msRows: any[] = [];
      let msMatchedBy: 'uid' | 'name' | 'none' = 'none';
      if (msUserId) { msRows = await runMsPass('cs.user_id = ?', msUserId); if (msRows.length) msMatchedBy = 'uid'; }
      if (!msRows.length && msName) { msRows = await runMsPass('cs.student_name = ?', msName); if (msRows.length) msMatchedBy = 'name'; }

      const msNow = Date.now();
      const MS_KST = 9 * 3600 * 1000;
      const msK = new Date(msNow + MS_KST);
      const msKY = msK.getUTCFullYear(), msKMo = msK.getUTCMonth(), msKD = msK.getUTCDate(), msKDow = msK.getUTCDay();
      const msPad = (n: number) => String(n).padStart(2, '0');

      const schedules = msRows.map((r: any) => {
        const dows = r.scheduled_date ? [] : dowList(r.day_of_week);
        const [hh, mm] = String(r.start_time || '00:00').split(':').map((x: string) => Number(x));
        let nextDate: string | null = null;
        let nextStartTs: number | null = null;
        if (r.scheduled_date) {
          const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(r.scheduled_date));
          if (dm) {
            const sTs = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), hh, mm, 0) - MS_KST;
            const graceMs = (Number(r.duration_min) || 30) * 60000 + 15 * 60000;
            if (sTs + graceMs >= msNow) { nextDate = r.scheduled_date; nextStartTs = sTs; }
          }
        } else if (dows.length) {
          let bestDelta = 8;
          for (const d of dows) {
            let delta = (d - msKDow + 7) % 7;
            if (delta === 0) {
              const todayStartTs = Date.UTC(msKY, msKMo, msKD, hh, mm, 0) - MS_KST;
              const graceMs = (Number(r.duration_min) || 30) * 60000 + 15 * 60000;
              if (msNow > todayStartTs + graceMs) delta = 7;   // 오늘 수업은 이미 끝났다 → 다음 주로
            }
            if (delta < bestDelta) bestDelta = delta;
          }
          const nd = new Date(msNow + MS_KST + bestDelta * 86400000);
          const ny = nd.getUTCFullYear(), nmo = nd.getUTCMonth(), nda = nd.getUTCDate();
          nextStartTs = Date.UTC(ny, nmo, nda, hh, mm, 0) - MS_KST;
          nextDate = `${ny}-${msPad(nmo + 1)}-${msPad(nda)}`;
        }
        return {
          schedule_id: r.id,
          day_labels_ko: dows.map(d => DOW_LABEL_KO[d]),
          day_labels_en: dows.map(d => DOW_LABEL_EN[d]),
          scheduled_date: r.scheduled_date || null,
          start_time: r.start_time,
          duration_min: r.duration_min,
          class_type: r.class_type,
          teacher_name: r.teacher_name || null,
          next_date: nextDate,
          next_start_ts: nextStartTs,
        };
      }).filter((s: any) => s.day_labels_ko.length || s.scheduled_date)
        .sort((a: any, b: any) => (a.next_start_ts == null ? Infinity : a.next_start_ts) - (b.next_start_ts == null ? Infinity : b.next_start_ts));

      return json({ ok: true, matched_by: msMatchedBy, schedules });
    }

    /* ═══ 📡 /api/class/sfu/* — Realtime SFU 자격증명 경계 (2026-09-02, C안 1단계) ═══
       [무엇] 참관 팬아웃을 서버(SFU)가 하게 만들려면 브라우저가 SFU 를 불러야 하는데,
              앱 시크릿을 브라우저에 주면 안 된다. 그래서 워커가 신원·방을 확인하고 대신 부른다.
       [지금 상태] ⛔ REALTIME_APP_ID · REALTIME_APP_TOKEN 시크릿이 없으면
              { ok:true, enabled:false } 만 돌려주고 **바깥으로 요청을 한 번도 보내지 않는다.**
              즉 켜기 전까지 서비스 동작은 그대로다. 브라우저 쪽 코드는 아직 없다(검증 불가).
       [왜 /api/class/ 밑인가] 이 접두사는 src/index.ts 라우팅 허용목록에 **이미** 있다
              (1271행 startsWith). 공동 금지구역을 한 줄도 안 고쳐도 된다.
       ⚠️ 인증은 라우팅과 다른 것이다 — 여기서 «직접» 확인한다(CLAUDE.md 2장). */
    if (method === 'POST' && path.startsWith('/api/class/sfu/')) {
      const op = path.slice('/api/class/sfu/'.length);
      const appId = (env as any).REALTIME_APP_ID as string | undefined;
      const appToken = (env as any).REALTIME_APP_TOKEN as string | undefined;
      /* ⚠️ 시크릿 검사를 여기서 «먼저» 하지 않는다 — 미로그인 호출자가 { enabled:false } 로
         인프라 상태를 알아내지 못하게, 신원 확인 뒤 sfuProxy 안에서 판정한다(모듈 ①②). */
      if (!Object.prototype.hasOwnProperty.call(SFU_OPS, op)) {
        return json({ ok: false, enabled: true, error: 'unknown_op' }, 400);
      }
      const body = await request.json().catch(() => null) as any;
      if (!body) return json({ ok: false, enabled: true, error: 'invalid_body' }, 400);

      /* 신원 — 학생 토큰(mango_token) 또는 관리자 세션 쿠키. 둘 다 없으면 401.
         ⛔ 본문에 적힌 uid 를 믿지 않는다(CLAUDE.md 2장 「본문 값을 그대로 쓰는 API」). */
      let identity: { uid: string; kind: 'admin' | 'student' } | null = null;
      try {
        const tokUid = await authUidGlobal(request, new URL(request.url), env as any, body);
        if (tokUid) identity = { uid: String(tokUid), kind: 'student' };
      } catch {}
      if (!identity) {
        try {
          const a = await checkAdminSession(request, env as any);
          if (a && (a as any).ok && (a as any).username) identity = { uid: String((a as any).username), kind: 'admin' };
        } catch {}
      }

      /* 🔒 방 소속 — sfuProxy 에 닿기 «전» 에 본다(위 sfuRoomAllowed 주석). */
      if (identity && !(await sfuRoomAllowed(env as any, String(body.room_id || ''), identity))) {
        return json({ ok: false, enabled: true, error: 'not_your_room' }, 403);
      }
      const r = await sfuProxy(
        {
          appId, appToken,
          kv: (env as any).SESSION_STATE || null,
          fetchImpl: (u, init) => fetch(u, init) as any,
          identity,
        },
        op,
        String(body.room_id || ''),
        body.session_id ? String(body.session_id) : null,
        body.payload,
      );
      return json(r.body, r.status);
    }

    /* ═══ 📡 POST /api/class/sfu-peers — SFU 참가자 명단(신호) (2026-09-04, C안 2단계) ═══
       [무엇] SFU 는 «누가 같은 방인가» 를 모릅니다(Cloudflare 문서: 「It does not define rooms,
              participants, roles, or presence for your application」). 그래서 내가 만든
              세션 id 와 트랙 이름을 여기에 적어 두고, 같은 방의 남의 것을 받아 갑니다.
       [왜 화상방 DO 가 아니라 여기인가] 그 신호를 WebSocket 으로 보내려면 `src/video-call-room.ts`
              에 case 를 하나 더해야 하는데 거기는 공동 금지구역입니다(모르는 type 은 그냥 버려집니다).
              D1 한 표로 하면 금지구역을 한 줄도 안 건드리고, 덤으로 «강하게 일관» 합니다
              (KV 는 읽기-수정-쓰기 경합에서 한쪽 announce 가 조용히 사라질 수 있습니다).
       [왜 /api/class/ 밑인가] 그 접두사는 라우팅 허용목록에 **이미** 있습니다(src/index.ts).
       ⚠️ 인증은 라우팅과 다른 것이라 여기서 «직접» 봅니다(CLAUDE.md 2장).
       🔴 [게이트가 «둘» 인 이유 — 하나만으로는 남의 수업이 열립니다]
          `sfu:sess:<sid>` 소유권 기록만 보면 «내가 만든 세션인가» 까지만 지켜집니다. 그런데
          `session-new` 는 방 번호가 비었는지만 보므로(realtime-sfu.ts ④) **아무나 아무 방으로
          세션을 만들 수 있습니다.** 방 번호는 `class-{예약id}-{YYYYMMDD}` 로 결정론적이고,
          학생 비밀번호는 29,417명 중 0명이 설정돼 있습니다(CLAUDE.md 2장) — 즉 소유권 검사
          «하나만» 두면 로그인만 하면 남의 수업 세션 id·트랙 이름을 받아 그 반의 영상·소리를
          끌어갈 수 있습니다(미성년자 수업입니다). 그래서 `sfuRoomAllowed()` 를 함께 봅니다.
          ⚠️ 여기는 **막는 쪽으로 실패**합니다 — 막혀도 수업은 mesh 로 그대로 돌아가고
             SFU 만 안 켜지므로, verify-room 의 fail-open 과 균형이 다릅니다. */
    if (method === 'POST' && path === '/api/class/sfu-peers') {
      const b = await request.json().catch(() => null) as any;
      if (!b) return json({ ok: false, error: 'invalid_body' }, 400);

      /* 신원 — 학생 토큰 또는 관리자 세션. ⛔ 본문의 uid 를 신원으로 믿지 않습니다. */
      let ident: { uid: string; kind: 'admin' | 'student' } | null = null;
      try {
        const t = await authUidGlobal(request, new URL(request.url), env as any, b);
        if (t) ident = { uid: String(t), kind: 'student' };
      } catch {}
      if (!ident) {
        try {
          const a = await checkAdminSession(request, env as any);
          if (a && (a as any).ok && (a as any).username) ident = { uid: String((a as any).username), kind: 'admin' };
        } catch {}
      }
      if (!ident) return json({ ok: false, error: 'unauthorized' }, 401);

      /* 시크릿이 없으면 «꺼짐» — 표를 만들지도, 아무것도 적지도 않습니다. 화면은 그대로 mesh 로 갑니다. */
      if (!sfuConfigured({ appId: (env as any).REALTIME_APP_ID, appToken: (env as any).REALTIME_APP_TOKEN })) {
        return json({ ok: true, enabled: false, reason: 'no_secrets', peers: [] });
      }

      const room = String(b.room_id || '').trim();
      if (!room || room.length > 120) return json({ ok: false, enabled: true, error: 'room_required' }, 400);
      const sid = String(b.session_id || '').trim();
      if (!SFU_SESSION_RE.test(sid)) return json({ ok: false, enabled: true, error: 'bad_session_id' }, 400);

      /* ⛔ «내가 이 방에 만든 세션» 이어야 합니다 — 아니면 남의 수업 명단을 들여다볼 수 있습니다. */
      const kv = (env as any).SESSION_STATE;
      if (!kv) return json({ ok: false, enabled: true, error: 'owner_store_unavailable' }, 503);
      let own: any = null;
      try { own = JSON.parse((await kv.get(`sfu:sess:${sid}`)) || 'null'); } catch { own = null; }
      if (!own || own.uid !== ident.uid || own.room !== room) {
        return json({ ok: false, enabled: true, error: 'not_your_session' }, 403);
      }
      if (!(await sfuRoomAllowed(env as any, room, ident))) {
        return json({ ok: false, enabled: true, error: 'not_your_room' }, 403);
      }

      await ensureSchemaOnce('sfu_peers', async () => {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS sfu_peers (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, session_id TEXT, audio_track TEXT, video_track TEXT, name TEXT, role TEXT, account_uid TEXT, updated_at INTEGER, PRIMARY KEY (room_id, peer_id))`);
      });

      /* peer_id = 화상방(DO)이 접속마다 새로 발급하는 임시 번호입니다 — 계정이 아닙니다.
         타일을 맞추는 데만 쓰므로 본문에서 받되, 길이·글자를 좁힙니다(그대로 화면에 그려집니다). */
      const peerId = String(b.peer_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      if (!peerId) return json({ ok: false, enabled: true, error: 'peer_id_required' }, 400);
      const now = Date.now();

      if (b.leave) {
        try { await env.DB.prepare(`DELETE FROM sfu_peers WHERE room_id = ? AND peer_id = ?`).bind(room, peerId).run(); } catch {}
        return json({ ok: true, enabled: true, peers: [] });
      }

      const cut = (v: any, n: number) => String(v == null ? '' : v).slice(0, n);
      try {
        await env.DB.prepare(
          `INSERT INTO sfu_peers (room_id, peer_id, session_id, audio_track, video_track, name, role, account_uid, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)
           ON CONFLICT(room_id, peer_id) DO UPDATE SET
             session_id = excluded.session_id, audio_track = excluded.audio_track,
             video_track = excluded.video_track, name = excluded.name, role = excluded.role,
             account_uid = excluded.account_uid, updated_at = excluded.updated_at`
        ).bind(room, peerId, sid, cut(b.audio_track, 128), cut(b.video_track, 128),
               cut(b.name, 60), cut(b.role, 20), ident.uid, now).run();
      } catch (e: any) {
        console.error('[sfu-peers] 명단 기록 실패', e && e.message);
        return json({ ok: false, enabled: true, error: 'announce_failed' }, 500);
      }

      /* 나 말고, «최근 40초 안에» 알린 사람만. 탭이 죽어 남은 줄이 유령으로 보이지 않게. */
      let peers: any[] = [];
      try {
        const rs = await env.DB.prepare(
          `SELECT peer_id, session_id, audio_track, video_track, name, role
             FROM sfu_peers WHERE room_id = ? AND peer_id <> ? AND updated_at > ? LIMIT 12`
        ).bind(room, peerId, now - 40000).all();
        peers = (rs.results || []) as any[];
      } catch (e: any) { console.warn('[sfu-peers] 명단 조회 실패', e && e.message); }

      /* 오래된 줄 가끔 정리(30분). ⚠️ 조용히 실패하면 표가 계속 자랍니다 — 로그로 남깁니다. */
      if (Math.random() < 0.05) {
        try { await env.DB.prepare(`DELETE FROM sfu_peers WHERE updated_at < ?`).bind(now - 1800000).run(); }
        catch (e: any) { console.warn('[sfu-peers] 오래된 줄 정리 실패', e && e.message); }
      }

      return json({ ok: true, enabled: true, peers });
    }

    // 🥭 Phase RM 3단계 — GET /api/class/verify-room
    //   예약제 방(class-{id}-{YYYYMMDD})에 '남의 방'으로 잘못 입장하는 것을 서버가 검증.
    //   ▸ 정상 예약자(학생)·담당 교사·관리자는 통과. 예약을 못 찾거나 신원 불명이면 fail-open(통과)로 정상수업 방해 금지.
    //   ▸ authorized === false 일 때만 클라이언트가 차단. (class-* 패턴이 아닌 임의 방은 게이트 안 함)
    //   query: ?room_id=class-123-20260705&user_id=X&student_name=Y&role=student|teacher
    if (method === 'GET' && path === '/api/class/verify-room') {
      const url = new URL(request.url);
      const roomId = (url.searchParams.get('room_id') || '').trim();
      const userId = (url.searchParams.get('user_id') || '').trim();
      const nameParam = (url.searchParams.get('student_name') || '').trim();
      const role = (url.searchParams.get('role') || 'student').trim().toLowerCase();
      const m = /^class-(\d+)-(\d{8})$/.exec(roomId);
      if (!m) return json({ ok: true, authorized: true, reason: 'not_managed_room' }); // 예약제 방이 아니면 게이트 안 함
      /* 🔓 (2026-08-26 사장님 지시) 예전에는 admin 도 여기서 함께 빠졌다. 그런데 그 조기 통과가
         「이 예약의 학생이면 역할을 내린다」 교정을 **admin 에서만 통째로 건너뛰게** 만들었다 —
         resolved_role 이 없으니 클라이언트가 내릴 근거를 못 받는다. 사장님(jeong)은 학생 세션 없이
         관리자 폴백으로 로그인해 입장 역할이 admin 으로 잡히는데(idx-main.js 「else if (_admUid)」),
         그래서 학생 자리로 들어가도 수업 내내 «스태프» 인 채였다(실측 10분 — 얼굴 크기가 뒤집히고
         화면공유·교재 넘김 권한까지 열렸다). 이제 admin 도 조회를 거쳐 **역할만 사실대로 알려 준다.**
         ⛔ 그렇다고 «막지» 는 않는다 — 관리자는 어느 방이든 들어갈 수 있어야 한다(아래 authorized 참고).
         ℹ️ 참관(observer)은 그대로 조기 통과다. 참관은 vcJoinAsObserver 라는 별도 경로라 이 API 를
            애초에 부르지 않지만, 다른 경로가 role=observer 를 보내도 안전하도록 남겨 둔다. */
      const isAdminRole = (role === 'admin');
      if (role === 'observer') return json({ ok: true, authorized: true, reason: 'privileged' });
      if (!userId && !nameParam) return json({ ok: true, authorized: 'unknown', reason: 'no_identity' }); // 신원 불명 → 통과
      const schedId = Number(m[1]);
      let row: any = null;
      try {
        row = await env.DB.prepare(`SELECT cs.id, cs.user_id, cs.student_name, cs.teacher_id, t.name AS teacher_name FROM class_schedules cs LEFT JOIN teachers t ON CAST(t.id AS TEXT) = cs.teacher_id WHERE cs.id = ? LIMIT 1`).bind(schedId).first<any>();
      } catch {
        try { row = await env.DB.prepare(`SELECT id, user_id, student_name, teacher_id FROM class_schedules WHERE id = ? LIMIT 1`).bind(schedId).first<any>(); } catch {}
      }
      if (!row) return json({ ok: true, authorized: 'unknown', reason: 'schedule_not_found' }); // 예약 없음 → 통과(fail-open)
      let ok = false;
      /* 🎭 (2026-08-08 강사 피드백 Teacher Ana ① 「먼저 들어온 학생이 강사 역할을 받는다」)
       *  여태 역할은 **클라이언트가 말한 것을 그대로** 썼다(DO 도 그 값을 로스터에 박는다).
       *  그래서 브라우저에 남아 있던 낡은 'teacher' 하나로 학생이 강사가 됐다.
       *  이 게이트는 이미 «이 사람이 이 예약의 학생인가 교사인가» 를 알아내고 있다 —
       *  그 답을 버리지 말고 `resolved_role` 로 함께 돌려준다.
       *  🔑 클라이언트는 이 값을 **내리는 데만** 쓴다. 올리는 데 쓰면 이름 매칭 한 번 어긋난 것으로
       *     학생이 강사가 되어 지금 고치는 사고를 반대 방향으로 다시 만든다.
       *  ⚠️ 확실할 때만 값을 채운다. 모르면 null → 예전과 100% 동일(«수업을 막지 않는다» 1원칙 유지). */
      let resolvedRole: 'student' | 'teacher' | null = null;
      if (userId) {
        if (String(row.user_id) === userId) { ok = true; resolvedRole = 'student'; }       // 학생 uid 일치
        if (!ok && String(row.teacher_id || '') === userId) { ok = true; resolvedRole = 'teacher'; }  // 교사 uid == teacher_id
        if (!ok) {
          // 이름 기반 학생 uid 병합(동명/키 다양성 대비)
          try {
            /* ⚠️ (2026-08-27) 여기 있던 ('stu_' || id) 는 students_erp 에 없는 컬럼이라
               `no such column: id` 로 죽었고 catch 가 삼켰다 — 이 폴백 자체가 무동작이었다.
               동명이인이 여럿이어도 아래는 «내 uid 와 같은가» 만 보므로 넓혀도 안전하다. */
            const rs = await env.DB.prepare(`SELECT COALESCE(user_id, login_id) AS uid FROM students_erp WHERE korean_name = ? OR username = ?`).bind(row.student_name || '', row.student_name || '').all<any>();
            for (const x of (rs.results || [])) { if (String(x.uid) === userId) { ok = true; resolvedRole = 'student'; break; } }
          } catch {}
        }
      }
      if (!ok && nameParam) {
        // 🔧 (2026-07-28 실사고) 역할 접두사('교사 …')를 떼고도 비교한다.
        //   마이페이지 '수업 입장'은 vc_name 을 '교사 {계정명}' 으로 만들어 보내는데(mypage.html ph…),
        //   teachers.name 에는 과목 접두사가 붙어 있다(예: '중국어 강선생님').
        //   → '교사 강선생님' 과 '중국어 강선생님' 은 서로를 포함하지 않아 양방향 부분일치가 둘 다 깨졌다.
        //   같은 교사가 sessions/today 에서는 매칭되는데(거기엔 접두사 없는 이름을 보냄)
        //   문 앞에서만 막히던 원인. 두 API 가 같은 사람에 대해 다른 이름을 받는 구조라서 생긴 사고다.
        const stripRolePrefix = (s: string) =>
          String(s || '').replace(/^\s*(?:교사|강사|선생님|Teacher|Tutor)\s+/i, '').trim();
        const npRaw = nameParam;
        const npBare = stripRolePrefix(nameParam);
        if (row.student_name && (row.student_name === npRaw || row.student_name === npBare)) { ok = true; resolvedRole = 'student'; }  // 학생 이름 일치
        // 🔧 (2026-07-24) 교사 이름은 완전일치 대신 부분일치(양방향) — sessions/today 매칭 완화와 동일 사유.
        if (!ok && row.teacher_name) {
          const tnRaw = String(row.teacher_name);
          const tnBare = stripRolePrefix(tnRaw);
          const hit = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
          for (const t of [tnRaw, tnBare]) {
            for (const n of [npRaw, npBare]) { if (hit(t, n)) { ok = true; break; } }
            if (ok) break;
          }
          /* ⚠️ 교사 이름 매칭은 «부분일치» 다 — 이름이 짧으면 우연히 걸릴 수 있다.
             그래서 이 경로로 붙은 것은 **강사로 «올리는» 근거로 쓰지 않는다.**
             (resolvedRole 은 클라이언트에서 내림 전용이므로 null 로 두면 아무 일도 안 일어난다) */
        }
      }
      /* 🔐 (2026-08-26 실사고) — teacher/portal(자기 목록)엔 뜨는 수업인데 verify-room 은
         "담당 강사가 아니다" 로 경고한다. 원인: teacher/portal(api-teacher.ts)은 로그인 세션으로
         계정→강사원부를 ① teacher_account_links 수동 연결 ② class_schedules.teacher_id 에
         **로그인 계정명이 그대로 들어간 행**(teachers 원부에 이름이 없는 계정, mangoi_0XX 류)
         ③ teachers.name 낱말경계 일치 — 셋 중 하나로 확정하는데, 이 게이트는 위에서 ③(그것도
         nameParam 문자열 비교)만 본다. joinClass()(teacher.html)도 user_id 를 안 보내
         userId 매칭 경로 자체가 안 걸린다 → ①·② 로만 배정된 강사는 매번 이 경고를 본다.
         verify-room 호출은 credentials:'include' 라 admin_sessions 쿠키가 이미 와 있다
         (교사가 다른 탭에서 로그인한 상태라면). 있으면 teacher/portal 과 **같은 두 경로**로
         한 번 더 확인한다 — 신원이 «더 명확해지는» 쪽으로만 넓히고, 세션이 없거나 그래도
         못 찾으면 그대로 기존 폴백(경고만, 입장은 막지 않음)으로 이어진다. */
      if (!ok) {
        try {
          const sess = await checkAdminSession(request, env as any);
          if (sess.ok && sess.username) {
            /* 🔑 강사 판정이 «먼저» 다 — 강사로 확정되면 아래 학생 판정으로 내려가지 않는다. */
            if (/teacher/.test(role)) {
              if (String(row.teacher_id || '') === sess.username) { ok = true; resolvedRole = 'teacher'; }
              if (!ok) {
                const link = await env.DB.prepare(
                  `SELECT teacher_id FROM teacher_account_links WHERE username = ? COLLATE NOCASE LIMIT 1`
                ).bind(sess.username).first<any>().catch(() => null);
                if (link && link.teacher_id && String(row.teacher_id || '') === String(link.teacher_id)) {
                  ok = true; resolvedRole = 'teacher';
                }
              }
            }
            /* 🎓 (2026-08-26) 이 예약의 «학생» 인가 — 관리자 세션만 있는 계정은 user_id 를 못 보낸다.
               홈 통합 로그인의 관리자 폴백(idx-user-session.js tryAdminLoginFallback)은
               `mangoi_admin_session` 만 만들고 학생 세션(`mangoi_logged_user`)은 만들지 않는다.
               그래서 getCurrentUser() 가 null 이라 위쪽 userId 경로가 통째로 비어 있었다.
               쿠키는 이미 와 있으므로(credentials:'include') 그 아이디로 예약의 학생과 대조한다.
               ⚠️ 대소문자는 무시한다 — students_erp.user_id 는 BINARY 라 `Kim`/`kim` 이 둘 다
                  실재하고(2026-08-26 실측), 아이디 대소문자는 로그인 쪽도 이미 무시한다.
               ⛔ 이름으로는 붙이지 않는다 — 여기서 틀리면 «남의 수업에서 학생이 되는» 것이라
                  아이디 완전일치(대소문자만 무시)에서 멈춘다. */
            if (!ok) {
              const su = String(sess.username);
              const ru = String(row.user_id || '');
              if (ru && (ru === su || ru.toLowerCase() === su.toLowerCase())) { ok = true; resolvedRole = 'student'; }
            }
          }
        } catch { /* 세션 확인 실패해도 기존 폴백으로 이어진다 — 수업은 막지 않는다 */ }
      }
      /* 🎭 학생 이름으로만 붙었는데 «강사» 를 주장하는 경우 = 이번 신고의 그림 그대로다.
         (공용 PC 에 남아 있던 낡은 teacher 를 물려받은 학생) → resolvedRole 이 'student' 로 남아
         클라이언트가 스스로 역할을 내린다. 그래도 **입장은 막지 않는다**(1원칙 유지). */
      // 🔒 (2026-07-28) 교사는 차단하지 않는다 — "수업을 방해하지 않는다"가 이 게이트의 1원칙이다.
      //   담당 지정이 어긋나 있어도 수업은 열려야 한다(어긋남 자체는 운영에서 흔하다).
      //   클라이언트는 authorized === false 일 때만 막으므로, 'unknown' 을 주면 경고만 띄우고 통과한다.
      //   ※ 이 게이트는 보안 경계가 아니다 — role 은 클라이언트가 보내는 값이고 admin·observer 는 무조건 통과다
      //     (2026-08-26 부터 admin 은 «통과하되 역할은 사실대로» 로 바뀌었다. 막고 안 막고는 그대로).
      //   ※ role 표기가 경로마다 다르다 — 마이페이지 입장 버튼은 'teacher', 홈 통합로그인 폴백은 'hq_teacher'
      //     를 쓴다(index.html tryAdminLoginFallback). 정확히 'teacher' 만 보면 안전장치가 새 경로에서 빠진다.
      /* 🔄 (2026-08-28) 이 날짜에 1회성 대체강사가 배정돼 있으면 그 강사도 "담당 강사" 로 인정한다.
         'recurring' 행은 정본 teacher_id 를 그대로 두므로(다음 회차 자동복귀를 위해 —
         enroll-ops.ts 의 (m-2)/(m-3) 참고) 위의 모든 검사는 여전히 "원래 강사" 기준이라
         대체강사는 매번 이 경고를 본다. 'dated' 행(수강신청 자동생성)은 teacher_id 를
         그 자리에서 바로 바꾸므로 이미 위에서 잡힌다 — 여기는 recurring 오버레이 전용. */
      if (!ok && /teacher/.test(role) && m[2]) {
        try {
          const subDate = m[2].slice(0, 4) + '-' + m[2].slice(4, 6) + '-' + m[2].slice(6, 8);
          const sub = await env.DB.prepare(
            `SELECT cs2.substitute_teacher_id, t2.name AS sub_name FROM class_substitutions cs2
               LEFT JOIN teachers t2 ON CAST(t2.id AS TEXT) = CAST(cs2.substitute_teacher_id AS TEXT)
              WHERE cs2.schedule_id = ? AND cs2.sub_date = ? AND cs2.status = 'active' LIMIT 1`
          ).bind(schedId, subDate).first<any>();
          if (sub && sub.substitute_teacher_id) {
            const subId = String(sub.substitute_teacher_id);
            if (userId && userId === subId) { ok = true; resolvedRole = 'teacher'; }
            if (!ok && nameParam) {
              const stripRolePrefix = (s: string) => String(s || '').replace(/^\s*(?:교사|강사|선생님|Teacher|Tutor)\s+/i, '').trim();
              const subName = String(sub.sub_name || '');
              const hit = (a: string, b: string) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));
              /* ⚠️ (2026-08-28 trap-check 지적) 이름 부분일치는 위(1991행 근처)의 원래 교사
                 매칭과 같은 이유로 resolvedRole 을 올리지 않는다 — 짧은 이름이면 우연히
                 걸릴 수 있어 "강사로 올리는" 근거로 쓰면 안 된다. ok 만 세워 입장은
                 허용하되, 화면이 역할을 스스로 내리는 데는 이 값을 쓰지 않는다. */
              if (hit(subName, nameParam) || hit(subName, stripRolePrefix(nameParam))) { ok = true; }
            }
            if (!ok) {
              const sess2 = await checkAdminSession(request, env as any).catch(() => null);
              if (sess2 && (sess2 as any).ok && (sess2 as any).username) {
                const su2 = String((sess2 as any).username);
                if (su2 === subId) { ok = true; resolvedRole = 'teacher'; }
                if (!ok) {
                  const link = await env.DB.prepare(
                    `SELECT teacher_id FROM teacher_account_links WHERE username = ? COLLATE NOCASE LIMIT 1`
                  ).bind(su2).first<any>().catch(() => null);
                  if (link && link.teacher_id && String(link.teacher_id) === subId) { ok = true; resolvedRole = 'teacher'; }
                }
              }
            }
          }
        } catch { /* 실패해도 기존 폴백(경고만, 입장은 안 막음)으로 이어진다 */ }
      }
      if (!ok && /teacher/.test(role)) {
        return json({ ok: true, authorized: 'unknown', reason: 'teacher_not_assigned', owner_name: row.student_name || null, teacher_name: row.teacher_name || null, resolved_role: resolvedRole });
      }
      /* 🔓 관리자는 어느 방이든 통과다(예전 조기 통과와 «막고 안 막고» 는 100% 동일).
         달라진 것은 resolved_role 을 **함께 준다**는 것뿐이고, 클라이언트는 그 값을 내리는 데만 쓴다. */
      if (isAdminRole) {
        return json({ ok: true, authorized: true, reason: ok ? 'match' : 'privileged', owner_name: row.student_name || null, resolved_role: resolvedRole });
      }
      return json({ ok: true, authorized: ok, owner_name: row.student_name || null, reason: ok ? 'match' : 'mismatch', resolved_role: resolvedRole });
    }

    // (🥭 노쇼·스케줄CRUD·중복병합 → api-admin.ts — admin 5회차)

    // (🎁 Phase P1+P4 포인트·기프티콘·별점평가 29매처 → api-points.ts — 11차)

    // (📢 Phase POP 팝업/공지·포스터 16라우트 → api-admin.ts — admin 4회차)

    // (📅 Phase CAL 캘린더 3라우트 → api-lessons.ts — 13차)

    // ═══════════════════════════════════════════════════════════════
    // 🌐 i18n 자동번역 — 사전(DICT)에 없는 한국어 UI 텍스트를 AI로 ko→en 번역 (+KV 캐시)
    //   클라이언트(i18n-sweep.js)가 미번역 한국어를 모아 배치 호출 → localStorage 캐시.
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/i18n/translate') {
      const b: any = await request.json().catch(() => ({}));
      let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
      texts = Array.from(new Set(texts)).slice(0, 50);
      if (!texts.length) return json({ ok: true, map: {} });
      const ai = (env as any).AI;
      const kv = (env as any).SESSION_STATE;
      const map: Record<string, string> = {};
      const need: string[] = [];
      // ⚡ (2026-08-08) KV 조회를 순차 await 로 돌던 것을 병렬로 — 50개면 왕복이 50번 쌓여
      //   전부 캐시 적중이어도 1.5초 넘게 걸렸다(강사 제보: "EN 누르면 한참 기다린다").
      const cachedList = await Promise.all(texts.map(async (t) => {
        if (!kv) return null;
        try { return await kv.get('i18n:en:' + t) as string | null; } catch { return null; }
      }));
      for (let i = 0; i < texts.length; i++) {
        if (cachedList[i] != null) map[texts[i]] = cachedList[i] as string; else need.push(texts[i]);
      }
      const kvPuts: Promise<any>[] = [];
      if (need.length && ai) {
        // ⚡ (2026-08-08) 20개씩 끊은 청크를 순차로 돌던 것을 병렬로 — 50개 요청 하나가
        //   AI 왕복 3번을 줄줄이 기다려 실측 16.2초였다. 병렬이면 가장 느린 1번으로 줄어든다.
        const aiChunks: string[][] = [];
        for (let i = 0; i < need.length; i += 20) aiChunks.push(need.slice(i, i + 20));
        await Promise.all(aiChunks.map(async (chunk) => {
          // ⚠️ llama 는 "JSON 배열로만" 지시를 자주 무시 → 번호 줄 형식이 훨씬 안정적.
          //    (JSON 파싱 실패 시 원문을 그대로 돌려줘 자동번역이 통째로 무력화되던 버그 수정 2026-07-21)
          const numbered = chunk.map((s, k) => (k + 1) + '. ' + s).join('\n');
          const prompt = `Translate each numbered Korean app-UI string into natural, concise English for a button/menu/label.
Keep emojis, numbers, punctuation and placeholders (\${...}, {x}, %s) unchanged.
Output EXACTLY one line per item, same order, formatted as:
1. <english>
2. <english>
No quotes, no notes, no blank lines, no Korean.

${numbered}`;
          let got: string[] = [];
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                messages: [
                  { role: 'system', content: 'You are a precise Korean-to-English UI translator. Reply with numbered lines only, never Korean.' },
                  { role: 'user', content: prompt }
                ],
                max_tokens: 1800,
              });
              const txt = String(typeof resp === 'string' ? resp : (resp && typeof resp.response === 'string' ? resp.response : '') || '');
              const clean = txt.replace(/```[a-zA-Z]*|```/g, '');
              const tmp: string[] = [];
              for (const ln of clean.split(/\r?\n/)) {
                const lm = ln.match(/^\s*(\d{1,2})\s*[.)]\s*(.+?)\s*$/);
                if (!lm) continue;
                const idx = parseInt(lm[1], 10) - 1;
                if (idx >= 0 && idx < chunk.length) tmp[idx] = lm[2].replace(/^["']|["']$/g, '');
              }
              // 혹시 JSON 배열로 왔으면 그것도 받아줌(이중 파서)
              if (!tmp.filter(Boolean).length) {
                const mm = clean.match(/\[[\s\S]*\]/);
                if (mm) { try { const arr = JSON.parse(mm[0]); if (Array.isArray(arr)) arr.forEach((v: any, k: number) => { if (typeof v === 'string') tmp[k] = v; }); } catch { /* 무시 */ } }
              }
              if (tmp.filter(Boolean).length > got.filter(Boolean).length) got = tmp;
              if (got.filter(Boolean).length >= chunk.length) break;   // 다 받았으면 재시도 불필요
            } catch { /* 다음 시도 */ }
          }
          for (let j = 0; j < chunk.length; j++) {
            let en = (typeof got[j] === 'string' && got[j].trim()) ? got[j].trim() : '';
            if (!en || /[가-힣]/.test(en)) en = chunk[j];   // 번역 실패(빈값·한글 잔존) → 원문 유지, 캐시 안 함
            map[chunk[j]] = en;
            // ⚡ 캐시 쓰기는 응답을 붙잡지 않는다 — 아래 waitUntil 로 넘긴다.
            if (kv && en !== chunk[j]) kvPuts.push(kv.put('i18n:en:' + chunk[j], en, { expirationTtl: 60 * 60 * 24 * 180 }).catch(() => {}));
          }
        }));
      } else if (need.length) { for (const c of need) map[c] = c; }
      if (kvPuts.length) {
        const allPuts = Promise.all(kvPuts).catch(() => {});
        if (ctx && ctx.waitUntil) ctx.waitUntil(allPuts); else await allPuts;
      }
      return json({ ok: true, map });
    }

    // ── POST /api/translate — 양방향 번역 (평가 글·건의사항 등 실제 콘텐츠) ──
    //   body: { texts: string[], target: 'en'|'ko'|'zh' } → { map: { 원문: 번역 } }
    //   이미 목표 언어면 그대로 통과, 아니면 Workers AI 번역 + KV 캐시(방향별)
    //   🌐 (2026-07-29) 'zh' 추가 — 화상수업 채팅 번역(한↔영·한↔중). 기존 en/ko 동작은 그대로.
    if (method === 'POST' && path === '/api/translate') {
      const b: any = await request.json().catch(() => ({}));
      const target = (b.target === 'ko') ? 'ko' : (b.target === 'zh') ? 'zh' : 'en';
      // 💬 (2026-07-29) mode='chat' — 화상수업 채팅 전용. 번역모델(m2m100) 대신 언어모델을 쓴다.
      //   m2m100 은 짧은 구어체 한국어에 약해 실측에서 '숙제'를 job·집안일로 옮겼다(수업 대화에선 오해가 난다).
      //   언어모델엔 '온라인 영어수업 채팅'이라는 맥락을 줄 수 있어 훨씬 정확하다.
      //   ⚠️ 새 경로를 만들지 않고 이 엔드포인트에 모드만 더한 이유: index.ts 게이트가
      //      path === '/api/translate' **정확 일치**라, 새 경로는 등록 없이는 404 가 된다.
      const chatMode = b.mode === 'chat';
      // 🗣️ (2026-08-24) mode='learn' — 학생 화면의 «뜻 보기» 전용(웜업·AI친구·음성코치·게임). AI 튜터의 영어 문장을
      //   학생이 이해하도록 한국어로 «의역» 한다. 모드 없는 기본 경로(m2m100)가
      //   "Let's warm up before class" 를 「수업 전에 따뜻하게하자」로 직역한 제보가 출발점.
      //   대상 언어가 ko 가 아니면 결과 검증(hasHangul)에서 걸러져 m2m100 으로 넘어간다.
      //   🔴 (2026-08-31) 「Good job!」 → 「훌륭한 직업!」 제보 — 뿌리가 둘이었다.
      //      ① ai-friend.html 이 이 모드를 «안 쓰고» 있었다(웜업만 고쳐져 있었다) → 화면 쪽 수리.
      //      ② 모드를 켜도 확률이라, 말머리 칭찬 상투구는 src/learn-phrase-ko.ts 로 «결정론» 처리한다.
      const learnMode = b.mode === 'learn';

      /* ═══════════════════════════════════════════════════════════════════════
         📝 mode='note' — 수업 일지 전용 (2026-08-10)

         필리핀 강사가 **영어로 편하게 쓰면** 한 번의 호출로 둘을 받는다.
           ① en — 문법·표현을 다듬은 영어 (강사가 «내가 무엇을 승인하는지» 확인용)
           ② ko — 학부모에게 나가는 한국어

         ⛔ mode='chat' 을 그대로 쓰면 안 되는 이유(실제 코드에서 확인):
            · 응답에서 **첫 줄만** 취한다(아래 chatTranslate 의 `split(/\r?\n/)[0]`)
              → 세 문장짜리 일지가 한 문장이 되어 학부모에게 간다.
            · max_tokens 300 — 일지 길이에 모자란다.
            · KV 캐시가 원문 전체를 키로 180일 저장 — 일지는 매번 다른 문장이라
              재사용률이 0 인데 KV 만 쌓인다. → 이 모드는 **캐시하지 않는다**.

         🔒 학생 실명은 {{STUDENT}} 로 가려서 보내고 돌아오면 되돌린다
            (번역 API 로 학생 실명이 새던 전례가 있다).
         🔴 한국어가 안 나오면 ok:false 를 준다 — 화면이 **발송을 막아야** 한다.
            (아래 일반 경로의 m2m100 폴백은 실패 시 «원문 그대로» 를 돌려주므로,
             그 경로를 타면 학부모에게 영어가 나간다.)
         ═══════════════════════════════════════════════════════════════════════ */
      if (b.mode === 'note') {
        const raw = String(b.text || '').trim().slice(0, 2000);
        if (!raw) return json({ ok: false, error: 'empty_text' }, 400);
        const ai0 = (env as any).AI;
        if (!ai0) return json({ ok: false, error: 'ai_unavailable' }, 503);

        const stuName = String(b.student_name || '').trim();
        const MASK = '{{STUDENT}}';
        const masked = stuName ? raw.split(stuName).join(MASK) : raw;

        const sys = 'You help a Filipino English teacher write a short after-class note for the KOREAN PARENT of a child. '
          + 'You do two things at once: (1) rewrite the teacher\'s English so it is correct and natural, '
          + '(2) translate that into Korean for the parent. '
          + 'Keep every fact the teacher wrote. Never invent skills, topics, scores or quotes that are not there. '
          + 'Keep it to 2-4 short sentences. Do not add greetings or sign-offs. '
          + `Keep the placeholder ${MASK} exactly as it is if it appears. `
          // 학부모가 읽는 글이다 — 존댓말과 어투는 타협하지 않는다(chat 모드와 같은 규칙).
          + 'The Korean MUST use polite speech (합니다체 or 해요체). Never 반말. '
          + 'Write natural Korean: 합니다 / 해요 / 좋겠습니다. Never stack endings (합니다요 is not Korean). '
          + 'In a school context "숙제" is school homework, never housework or a job. '
          // 학부모에게 통보처럼 읽히면 안 된다.
          + 'Soften blunt or judgemental wording into what the child did and what will help next '
          + '(e.g. "he is lazy" becomes "found it hard to stay focused"). Never compare the child with other students. '
          + 'Reply with STRICT JSON only: {"en":"<polished English>","ko":"<Korean for the parent>"}';

        let outEn = '', outKo = '';
        const dbgNote: any = { raw: null, err: null, fallback: false };
        try {
          const resp: any = await ai0.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: sys },
              // 🪤 JSON 지시를 system 에만 두면 모델이 설명문을 붙여 내보낸다(실측).
              //    user 쪽에도 한 번 더 못 박아야 «{...}» 만 나온다.
              { role: 'user', content: `Teacher's note:\n${masked}\n\nReturn ONLY this JSON, nothing else:\n{"en":"...","ko":"..."}` },
            ],
            max_tokens: 700,
          });
          const text = typeof resp === 'string' ? resp : (typeof resp?.response === 'string' ? resp.response : '');
          dbgNote.raw = String(text || '').slice(0, 500);
          const m = String(text || '').match(/\{[\s\S]*\}/);
          if (m) {
            try { const j = JSON.parse(m[0]); outEn = String(j.en || '').trim(); outKo = String(j.ko || '').trim(); }
            catch (pe: any) { dbgNote.err = 'parse:' + String(pe?.message || pe).slice(0, 80); }
          }
        } catch (e: any) {
          dbgNote.err = 'ai:' + String(e?.message || e).slice(0, 120);
          console.warn('[translate:note] ai err:', e?.message);
        }

        /* 🛟 폴백 — JSON 이 깨졌거나 한국어가 비면 «번역만» 한 번 더 시킨다.
           한 문장짜리 지시라 모델이 훨씬 안정적이다(chat 모드가 이미 이 방식으로 돌고 있다).
           강사를 두 번 기다리게 하지 않으려고 **실패했을 때만** 탄다. */
        if (!/[가-힣]/.test(outKo)) {
          dbgNote.fallback = true;
          try {
            const base = outEn || masked;
            const r2: any = await ai0.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
              messages: [
                { role: 'system', content:
                    'You translate a teacher\'s after-class note into Korean for the child\'s parent. '
                  + 'Reply with ONLY the Korean sentences — no quotes, no notes, no English. '
                  + 'Always polite Korean (합니다체 or 해요체), never 반말. Keep it to 2-4 short sentences. '
                  + 'In a school context "숙제" is school homework. '
                  + `Keep the placeholder ${MASK} exactly as it is if it appears.` },
                { role: 'user', content: base },
              ],
              max_tokens: 500,
            });
            const t2 = typeof r2 === 'string' ? r2 : (typeof r2?.response === 'string' ? r2.response : '');
            let ko2 = String(t2 || '').trim().replace(/^```[a-zA-Z]*\s*|\s*```$/g, '').trim();
            ko2 = ko2.replace(/^(translation|번역|korean)\s*[:：]\s*/i, '').trim();
            if (ko2.length > 1 && /^["'“”「『]/.test(ko2) && /["'“”」』]$/.test(ko2)) ko2 = ko2.slice(1, -1).trim();
            if (/[가-힣]/.test(ko2)) outKo = ko2;
          } catch (e: any) { dbgNote.err = (dbgNote.err || '') + ' fb:' + String(e?.message || e).slice(0, 80); }
        }

        // 어미 중첩 교정 — 존댓말을 시키면 모델이 -습니다 뒤에 「요」를 한 번 더 붙인다(chat 모드와 같은 처리)
        outKo = outKo
          .replace(/(습니다|합니다|입니다|ㅂ니다)요(?=[\s.!?,]|$)/g, '$1')
          .replace(/(습니까|합니까|입니까|니까)요(?=[\s.!?,]|$)/g, '$1')
          .replace(/(이에요|예요|어요|아요|해요|세요)요(?=[\s.!?,]|$)/g, '$1');

        // 가림막 복원
        if (stuName) { outEn = outEn.split(MASK).join(stuName); outKo = outKo.split(MASK).join(stuName); }

        const noteDebug = url.searchParams.get('debug') === '1';
        const hasKo = /[가-힣]/.test(outKo);
        if (!hasKo) {
          return json({ ok: false, error: 'no_korean', message: '한국어를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.',
                        ...(noteDebug ? { _debug: dbgNote } : {}) }, 502);
        }
        if (!outEn) outEn = raw;   // 영어 다듬기만 실패하면 원문을 그대로 보여 준다(발송은 한국어로 나가므로 무해)
        return json({ ok: true, en: outEn, ko: outKo, ...(noteDebug ? { _debug: dbgNote } : {}) });
      }

      //   ⚠️ 채팅 캐시 접두사에 번호를 붙인다. 프롬프트를 고치면 반드시 올릴 것 —
      //      안 올리면 옛 프롬프트로 만든 번역이 180일 동안 그대로 나온다.
      //      trc2: 존댓말 고정 / trc3: 어미 중첩 금지(프롬프트) / trc4: 어미 중첩 코드 교정(2026-07-29).
      //      trl1: learn 모드 첫 프롬프트(2026-08-24) — 접두사가 달라 기존 tr:/trc4: 캐시(직역)와 안 섞인다.
      //      trl2: learn 모드 «말머리 상투구 결정론 + 직역금지 예시»(2026-08-31) — 「훌륭한 직업!」이 담긴 trl1 캐시와 안 섞인다.
      const cacheKey = (t: string) => (learnMode ? 'trl2:' : chatMode ? 'trc4:' : 'tr:') + target + ':' + t;
      let texts: string[] = Array.isArray(b.texts) ? b.texts.map((t: any) => String(t || '')).filter((t: string) => t.trim()) : [];
      texts = Array.from(new Set(texts)).slice(0, 50);
      if (!texts.length) return json({ ok: true, map: {} });
      const hasHangul = (s: string) => /[가-힣ᄀ-ᇿ㄰-㆏]/.test(s);
      const hasHan = (s: string) => /[一-鿿]/.test(s);
      const ai = (env as any).AI;
      const kv = (env as any).SESSION_STATE;
      const map: Record<string, string> = {};
      const need: string[] = [];
      for (const t of texts) {
        const isKo = hasHangul(t);
        // 이미 목표 언어면 번역 불필요
        //   zh 판정은 '한글이 없고 한자가 있으면 중국어'. 한자를 섞어 쓴 한국어는 한글이 있으니 걸러진다.
        const already = (target === 'en') ? !isKo && !hasHan(t)
                      : (target === 'ko') ? isKo
                      : (!isKo && hasHan(t));
        if (already) { map[t] = t; continue; }
        let cached: string | null = null;
        if (kv) { try { cached = await kv.get(cacheKey(t)); } catch {} }
        if (cached != null) map[t] = cached; else need.push(t);
      }
      const dbg: any = { ai: !!ai, need: need.length, raw: null, err: null };
      // 번역 전용 모델 m2m100 (LLM 프롬프트보다 안정적). 텍스트별 번역.
      // 원문 언어 감지: 한글이 있으면 korean, 한자면 chinese, 나머지는 english.
      //   ⚠️ 한글 검사를 한자보다 먼저 해야 한다 — 순서를 바꾸면 한자 섞인 한국어가 중국어로 잡힌다.
      const srcOf = (s: string) => hasHangul(s) ? 'korean' : (hasHan(s) ? 'chinese' : 'english');
      const tgtLang = target === 'en' ? 'english' : (target === 'zh' ? 'chinese' : 'korean');
      // 💬 채팅 모드 — 언어모델로 한 문장씩. 실패하면 아래 m2m100 이 그대로 받아준다.
      const LANG_NAME: Record<string, string> = { en: 'English', ko: 'Korean', zh: 'Simplified Chinese' };
      // 🗣️ learn 모드 프롬프트 — 「뜻 보기」는 «영어가 무슨 뜻인지» 를 학생에게 알려 주는 카드다.
      //   직역이 아니라 의역을 시키고(warm up ≠ 따뜻하게), 학생이 읽는 글이라 친근한 해요체로 고정한다.
      const learnSys = 'You translate what an AI English tutor or an English practice app said, '
        + 'so a young Korean student (elementary or middle school) can understand what the English means. '
        + 'Give the MEANING in natural, friendly Korean — a free translation, never word-for-word. '
        + 'Cheers, greetings and set phrases must be translated as what a Korean teacher would actually say, '
        + 'NOT by translating each word: ' + LEARN_GLOSS_HINT + ' '
        + 'Reply with ONLY the Korean. No quotes, no notes, no romanization, no explanation. '
        + 'Use friendly polite 해요체 (해요 / 볼까요? / 어때요?). Never 반말, never stiff formal 합니다체. '
        + 'Never translate a question as 「~습니까?」 — a child reads this. Use 「~예요?」 / 「~해요?」. '
        + 'Never write 「당신」 for "you" — Korean drops it. "Do you have a pet?" is 「반려동물 키워요?」, not 「당신은 애완동물이 있습니까?」. '
        + 'Keep names, numbers, quoted titles and emoji exactly as they are. '
        + 'Never stack endings — 해요요, 습니다요 are not Korean.';
      async function chatTranslate(t: string): Promise<string> {
        const from = srcOf(t) === 'korean' ? 'Korean' : (srcOf(t) === 'chinese' ? 'Simplified Chinese' : 'English');
        const to = LANG_NAME[target] || 'English';
        const chatSys = 'You translate one chat message at a time for a live online English class. '
          + 'Speakers are Korean office staff and Filipino or Chinese teachers talking about lessons, '
          + 'homework, schedules and students. Reply with ONLY the translated message. '
          + 'No quotes, no notes, no romanization, no explanation. '
          + 'Keep it short and natural, the way a person actually speaks in chat. '
          + 'Keep names, @mentions, numbers, times and emoji exactly as they are. '
          + 'In a school context "숙제" is school homework, never housework or a job. '
          // 존댓말 고정 — 상대가 강사·학부모·직원이라 반말이 섞이면 무례하게 읽힌다.
          //   모델이 영어 원문의 캐주얼한 말투를 그대로 옮겨 "숙제는 끝냈어?" 처럼 반말이 나왔다.
          + 'When the target language is Korean, ALWAYS use polite speech (해요체 or 합니다체). '
          + 'Never use 반말 / plain form, even if the source sounds casual. '
          // ⚠️ "문장을 요/니다로 끝내라" 고 못박았더니 모델이 곧이곧대로 따라
          //    "죄송합니다요" 같은 없는 말을 만들었다. 규칙이 아니라 예시로 보여준다.
          + 'Write natural Korean: 합니다 / 해요 / 하셨어요 / 죄송합니다 / 감사합니다. '
          + 'Never stack endings — 합니다요, 습니다요, 이에요요 are not Korean. '
          + 'When the target language is Chinese, use polite 您 rather than 你 when addressing a person.';
        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: learnMode ? learnSys : chatSys },
            { role: 'user', content: learnMode
                ? `Translate this ${from} message into natural ${to} (free translation of the meaning):\n${t}`
                : `Translate this ${from} chat message into ${to}:\n${t}` },
          ],
          max_tokens: 300,
        });
        let out = String(typeof resp === 'string' ? resp : (resp && typeof resp.response === 'string' ? resp.response : '') || '').trim();
        // 모델이 가끔 따옴표로 감싸거나 "Translation:" 을 붙인다 → 벗겨낸다
        out = out.replace(/^```[a-zA-Z]*\s*|\s*```$/g, '').trim();
        out = out.replace(/^(translation|번역)\s*[:：]\s*/i, '').trim();
        if (out.length > 1 && /^["'“”「『]/.test(out) && /["'“”」』]$/.test(out)) out = out.slice(1, -1).trim();
        // 여러 줄로 떠들면 — 채팅은 첫 줄만(한 메시지 = 한 줄), learn 은 여러 문장짜리
        // 말풍선이 있어 첫 줄만 취하면 뜻이 잘린다 → 한 줄로 이어 붙인다.
        out = learnMode ? out.replace(/\s*\r?\n\s*/g, ' ').trim() : out.split(/\r?\n/)[0].trim();
        /* 어미 중첩 교정 — 프롬프트로 금지해도 모델이 "죄송합니다요" 를 계속 만든다.
           존댓말을 시켰더니 이미 존댓말인 -습니다/-습니까 뒤에 요를 한 번 더 붙인다.
           확률에 맡기지 말고 여기서 확정적으로 떼어낸다. */
        if (target === 'ko') {
          out = out.replace(/(습니다|합니다|입니다|ㅂ니다)요(?=[\s.!?,]|$)/g, '$1')
                   .replace(/(습니까|합니까|입니까|니까)요(?=[\s.!?,]|$)/g, '$1')
                   .replace(/(이에요|예요|어요|아요|해요|세요)요(?=[\s.!?,]|$)/g, '$1');
        }
        // 목표 언어가 아니면(그대로 되뇌었거나 엉뚱한 언어) 실패로 본다 → m2m100 으로 넘긴다
        if (!out || out === t) return '';
        if (target === 'ko' && !hasHangul(out)) return '';
        if (target === 'zh' && !hasHan(out)) return '';
        if (target === 'en' && (hasHangul(out) || hasHan(out))) return '';
        return out;
      }

      /* ⏱ (2026-09-01) 여러 문장을 «동시에» 번역한다 — 순차로는 배치 호출이 못 쓴다.
         [왜] 우주몬스터 게임은 게임 시작을 막고 한 번에 최대 50문장을 물어보는데, 이 루프가
              문장마다 모델을 하나씩 기다렸다. 그래서 그 화면만 「뜻」 의역(mode:'learn')을
              못 켜고 직역으로 남아 «같은 영어가 화면마다 다른 한국어» 가 되고 있었다.
         [무엇을 바꿨나] 호출 «횟수» 는 그대로다. 바뀐 것은 «동시에 몇 개를 기다리는가» 뿐이다.
         ⛔ 상한을 크게 올리지 말 것 — Workers AI 는 뉴런이 소진되면 429 를 주고, 이 루프는
            실패를 재시도하지 않고 원문으로 떨어뜨린다(그러면 그 문장은 게임에서 빠진다).
         ℹ️ 각 반복은 서로 독립이다 — `map` 은 문장마다 다른 키에 쓰고, KV 키도 문장마다 다르다.
            `dbg` 만 마지막 것이 남는데 그건 ?debug=1 전용이라 무해하다. */
      const TRANSLATE_CONCURRENCY = 4;
      if (need.length && ai) {
        const queue = need.slice();
        const runOne = async (t: string) => {
          try {
            /* 🗣️ learn 모드 — 말머리 칭찬 상투구는 «모델에게 맡기지 않고» 여기서 떼어 낸다.
               「Good job!」을 m2m100 이 「훌륭한 직업!」으로 옮긴 제보(2026-08-31)가 출발점이고,
               언어모델로 바꿔도 확률이라 자주 나오는 상투구는 결정론으로 못 박는다.
               정본 표: src/learn-phrase-ko.ts. 종결부호가 없으면 떼지 않으므로
               「Good job on your sentence」 같은 진짜 문장은 그대로 통째로 번역된다. */
            /* 고정 인사말은 손으로 다듬은 의역이 정본이다(learn-phrase-ko.ts).
               ⛔ 이 판정을 화면 쪽에 다시 만들지 말 것 — 2026-09-01 에 warmup.html 의
                  같은 정규식(curatedMeaning)을 지우고 여기 한 곳으로 모았다. */
            if (learnMode && target === 'ko') {
              const greet = curatedLearnMeaning(t);
              if (greet) {
                map[t] = greet;
                if (kv) { try { await kv.put(cacheKey(t), greet, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
                return;   // 이 문장은 여기서 끝 — 번역을 부르지 않는다
              }
            }
            const lead = (learnMode && target === 'ko') ? peelLearnLead(t) : { leadKo: '', rest: t };
            const src = lead.rest;
            /* 남은 것이 이모지·부호뿐이면 번역하지 않는다 — 모델에 넣어 봐야 엉뚱한 글자가 돌아온다.
               ⚠️ 말머리를 «실제로 뗀» 경우에만 이 지름길을 쓴다. 조건을 넓히면 기본·chat 경로까지
                  바뀌어, 이 글자범위에 없는 언어(가나·키릴 등)가 번역 없이 원문 그대로 나간다. */
            const needsMt = !lead.leadKo || /[A-Za-z\u3131-\uD79D\u4E00-\u9FFF]/.test(src);
            let out = '';
            /* 🔴 번역이 «실제로» 나왔는가 — 캐시(180일) 판정에 쓴다.
               예전에는 실패하면 out = t(원문)라서 `out !== t` 가 거짓이 되어 저절로 캐시를 비켜 갔다.
               말머리를 떼면 실패해도 「잘했어요! Do you have a pet animal?」처럼 t 와 «달라져서»
               그 반쪽짜리가 180일 굳는다. 같은 사고 전례: 폴백 음성을 «요청 화자» 키로 캐시해
               그 문장이 영원히 다른 목소리가 됐던 건(CLAUDE.md 2장). 실패는 캐시하지 않는다. */
            let mtOk = true;
            if (!needsMt) {
              out = joinLearnLead(lead.leadKo, src);
            } else {
              let mt = '';
              if (chatMode || learnMode) {
                try { mt = await chatTranslate(src); }
                catch (e: any) { dbg.err = 'chat:' + String(e?.message || e); }
              }
              if (!mt) {
                const resp: any = await ai.run('@cf/meta/m2m100-1.2b', { text: src, source_lang: srcOf(src), target_lang: tgtLang });
                if (dbg.raw == null) dbg.raw = JSON.stringify(resp).slice(0, 300);
                mt = (resp && typeof resp.translated_text === 'string' && resp.translated_text.trim()) ? String(resp.translated_text) : '';
              }
              mtOk = !!mt;
              // 번역이 없으면 원문(src)을 그대로 붙여 둔다 — 뗀 말머리만이라도 보여 주는 편이 낫다.
              // 다만 «다음에 다시 시도» 할 수 있게 캐시는 하지 않는다(mtOk=false).
              out = joinLearnLead(lead.leadKo, mt || src);
            }
            map[t] = out;
            if (kv && mtOk && out && out !== t) { try { await kv.put(cacheKey(t), out, { expirationTtl: 60 * 60 * 24 * 180 }); } catch {} }
          } catch (e: any) { dbg.err = String(e?.message || e); map[t] = t; }
        };
        await Promise.all(
          Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, queue.length) }, async () => {
            for (;;) { const t = queue.shift(); if (t === undefined) return; await runOne(t); }
          }),
        );
      } else if (need.length) { for (const c of need) map[c] = c; }
      if (url.searchParams.get('debug') === '1') return json({ ok: true, map, _debug: dbg });
      return json({ ok: true, map });
    }

    // ═══════════════════════════════════════════════════════════════
    // 🎮 게임/학습 도메인 → api-games.ts 로 분리 (REFACTOR_PLAN 1단계)
    //   🧩 Phase RQ(복습퀴즈) + 📚 Phase VOC(단어장) + 🧠 Phase ML(마이크로러닝)
    //   null 반환 시 기존 라우팅 계속 — 모든 매처가 exact/전용 prefix 라 순서 영향 없음
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/voice/')
        || path.startsWith('/api/review-quiz/') || path.startsWith('/api/admin/review-quiz/')
        || path.startsWith('/api/vocab') || path.startsWith('/api/admin/microlearn/')
        || path.startsWith('/api/badges/') || path.startsWith('/api/admin/badges/')
        || path.startsWith('/api/streak/') || path.startsWith('/api/admin/streak/')) {
      const rGames = await handleGamesApi(request, url, env);
      if (rGames) return rGames;
    }

    // (📝 Phase HW 숙제 → api-lessons.ts — 12차)

    // (💬 K1 채팅+K2~K4 알림톡 → api-notify.ts — 19차)

    // (📝 Phase E1~E4 평가서 → api-lessons.ts — 12차)


    // (💰 Phase F1~F2 미납 알림 → api-admin.ts — 14차)


    // (📊 Phase D1~D2 KPI 대시보드 → api-admin.ts — admin 1회차)

    // (💌 Phase I1~I2 신규상담 4매처 → api-admin.ts — 24차)

    // (🔔 Phase WP 웹푸시 9매처 → api-notify.ts — 24차)



    // ═══════════════════════════════════════════════════════════════
    // 👨‍👩‍👧 학부모 도메인 → api-students.ts 로 분리 (REFACTOR_PLAN 1단계 4차)
    //   PD(대시보드)·자녀연결·WD(다이제스트)·PFB(상담챗봇) — null 시 계속
    // ═══════════════════════════════════════════════════════════════
    if (path.startsWith('/api/oauth/')
        || path.startsWith('/api/parent/') || path.startsWith('/api/admin/parent-chat/')
        || path.startsWith('/api/student/')) {
      const rStudents = await handleStudentsApi(request, url, env);
      if (rStudents) return rStudents;
    }

    // 😊 패스키(WebAuthn) 얼굴/지문 로그인 → api-passkey.ts
    if (path.startsWith('/api/passkey/')) {
      const rPasskey = await handlePasskeyApi(request, url, env);
      if (rPasskey) return rPasskey;
    }



    // (🎙 Phase AV 음성코칭 5라우트 → api-games.ts — 15차)


    // (💬 K5 양방향+TVS → api-notify.ts — 19차)


    // (📝 Phase BE 일괄평가 → api-lessons.ts — 12차)



    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase AEd — AI 평가서 자동 작성 (강사 키워드 → 완성 텍스트)
    // ═══════════════════════════════════════════════════════════════
    // ── POST /api/eval/ai-draft — 키워드 → AI 가 4영역 텍스트 생성 ──
    if (method === 'POST' && path === '/api/eval/ai-draft') {
      try {
        const b: any = await request.json().catch(() => ({}));
        const studentName = String(b.student_name || '학생').slice(0, 40);
        const teacherName = String(b.teacher_name || '강사').slice(0, 40);
        const lessonTitle = String(b.lesson_title || '오늘 수업').slice(0, 80);
        const keywords = Array.isArray(b.keywords) ? b.keywords.slice(0, 8).map((k: any) => String(k).slice(0, 50)) : [];
        const scores = b.scores || {};
        const scoresText = ['참여', '이해', '숙제', '태도', '스피킹']
          .map((k, i) => {
            const key = ['participation','comprehension','homework','attitude','speaking'][i];
            return scores[key] != null ? `${k} ${scores[key]}점` : null;
          })
          .filter(Boolean).join(' / ');
        const ai = (env as any).AI;
        if (!ai) return json({ ok: false, error: 'workers_ai_not_bound' }, 503);

        const prompt = `당신은 망고아이 영어학원의 친절한 한국어 평가서 작성 도우미입니다.
강사가 입력한 키워드와 점수를 보고 학부모/학생용 평가서 4개 영역을 작성하세요.

학생: ${studentName}
강사: ${teacherName}
수업: ${lessonTitle}
점수: ${scoresText || '미입력'}
강사 키워드: ${keywords.length ? keywords.join(', ') : '(없음)'}

요구사항:
- 한국어로만 작성 (영어 단어는 따옴표로 인용 가능)
- 학부모/학생이 자랑스러워할 따뜻한 톤
- 각 영역 2~3 문장
- JSON 으로만 응답 (다른 설명 X)

응답 형식 (정확히 이 JSON 구조로만):
{
  "strengths": "이번 수업에서 잘한 점 (구체적인 행동/성취 언급, 2~3 문장)",
  "improvements": "보완하면 좋을 부분 (긍정적인 표현으로 부드럽게, 2~3 문장)",
  "next_goals": "다음 수업에서 도전할 학습 목표 (구체적/실행가능한 1~2개, 2~3 문장)",
  "teacher_comment": "강사 종합 코멘트 (격려와 응원, 2~3 문장)"
}`;

        const resp: any = await ai.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
          messages: [
            { role: 'system', content: 'You are a friendly Korean English-academy evaluation writer. Reply with JSON only.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
        });
        // Workers AI 응답은 { response: "..." } 또는 { response: {...} } 또는 stream 등 다양 — 모두 string 으로 정규화
        let text = '';
        if (typeof resp === 'string') text = resp;
        else if (resp && typeof resp.response === 'string') text = resp.response;
        else if (resp && resp.response && typeof resp.response === 'object') text = JSON.stringify(resp.response);
        else if (resp && typeof resp === 'object') text = JSON.stringify(resp);
        text = String(text || '');

        const m = text.match(/\{[\s\S]*\}/);
        // 매칭 실패 시: resp 객체 자체가 { strengths, ... } 인지 시도
        let parsed: any = {};
        if (m) {
          try { parsed = JSON.parse(m[0]); } catch (e: any) {
            return json({ ok: false, error: 'ai_json_invalid', raw: m[0].slice(0, 300) }, 500);
          }
        } else if (resp && typeof resp === 'object' && (resp.strengths || resp.response?.strengths)) {
          // 일부 모델은 이미 객체로 반환
          parsed = resp.strengths ? resp : resp.response;
        } else {
          return json({ ok: false, error: 'ai_parse_failed', raw: text.slice(0, 300) }, 500);
        }
        return json({
          ok: true,
          draft: {
            strengths: String(parsed.strengths || '').slice(0, 600),
            improvements: String(parsed.improvements || '').slice(0, 600),
            next_goals: String(parsed.next_goals || '').slice(0, 600),
            teacher_comment: String(parsed.teacher_comment || '').slice(0, 600),
          },
          model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
          tokens_estimate: Math.round(prompt.length / 3),
        });
      } catch (e: any) {
        console.warn('[ai-draft] error:', e?.message);
        return json({ ok: false, error: e?.message || 'draft_failed' }, 500);
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 🤖 Phase AEd 끝
    // ═══════════════════════════════════════════════════════════════


    // (🚨 Phase ARR 이탈위험+케어액션 → api-admin.ts — 18차)


    // (📚 VOC·🧠 ML·🧩 RQ → api-games.ts — 위임은 Phase RQ 자리(위쪽)에서 일괄 처리)


    // (📄 MR·MAR 월간리포트 → api-reports.ts — 20차)


    // (🧠 MBTI 매칭 + 🌟 교사 칭찬 8매처 → api-admin.ts — 16차)


    // (🔐 UID 서명토큰 클로저 → auth-token.ts 로 통합(중복제거, 5차 2026-07-14)
    //  검증=authUidGlobal(모듈), 발급=signUidToken(auth-token) — 알고리즘·시크릿 동일 확인함)

    // (🔐 Phase LOGIN 학생 로그인/가입 → api-students.ts — 5차 이동)



    // (🌐 Phase OAUTH 소셜로그인 3매처 → api-students.ts — 17차)


    // (💵 stats revenue·rankings·flow·storage → api-admin.ts — admin 1회차)


    // (💼 강사관리·급여 슈퍼블록 13라우트 → api-admin.ts — admin 3회차)

    // ===== 👨‍🎓 학생 ERP 풀 레코드 (Phase 10) =====
    //   별도 students 테이블에 ERP 컬럼 (결제타입·종료일·조직 다단계·전화번호 등) 보관
    //   GET  /api/admin/students/erp-list
    //   POST /api/admin/students/erp           (단건 등록)
    //   POST /api/admin/students/erp-seed      (22명 데모 일괄 시드)
    if (path === '/api/admin/students/erp-list' && method === 'GET') {
      // 🥭 Phase 35b — 500 핫픽스
      //   Phase 20d 에서 다른 스키마(user_id PK, id 컬럼 없음)로 자동 생성될 수 있음
      //   ① 테이블이 없을 때만 풀 스키마로 생성 (이미 다른 모양이면 NOOP)
      //   ② 누락된 컬럼은 ALTER TABLE ADD COLUMN 으로 보강
      //   ③ ORDER BY 는 SQLite 의 내장 rowid 사용 — 어떤 스키마든 항상 존재
      //   ④ 실패해도 200 OK + 빈 배열 (프론트가 깨지지 않게)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT, username TEXT, login_id TEXT,
          payment_type TEXT, end_date TEXT, signup_date TEXT,
          classes_per_week INTEGER, points INTEGER DEFAULT 0,
          student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
          shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
          franchise TEXT, status TEXT DEFAULT '정상',
          created_at INTEGER, updated_at INTEGER,
          korean_name TEXT, english_name TEXT, user_id TEXT
        );`);
      } catch {}
      // 누락 컬럼 보강 — ADD COLUMN 은 이미 있으면 throw 하므로 개별 try/catch
      const addCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      };
      await addCol('username', 'TEXT');
      await addCol('login_id', 'TEXT');
      await addCol('payment_type', 'TEXT');
      await addCol('classes_per_week', 'INTEGER');
      await addCol('points', 'INTEGER DEFAULT 0');
      await addCol('student_phone', 'TEXT');
      await addCol('parent_phone', 'TEXT');
      await addCol('teacher_phone', 'TEXT');
      await addCol('shop_name', 'TEXT');
      await addCol('hq_name', 'TEXT');
      await addCol('branch1_name', 'TEXT');
      await addCol('branch2_name', 'TEXT');
      await addCol('franchise', 'TEXT');
      await addCol('updated_at', 'INTEGER');

      const lim = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '500', 10)));
      try {
        // rowid 는 모든 SQLite 테이블에 항상 존재 — id 컬럼 없는 스키마에서도 동작
        const _swErp = await studentScopeWhere(env, request);  // 🔒 지사/대리점 격리
        /* 🧹 (2026-08-20) 숨김 지정한 중복 계정 제외 — students_erp 는 카페24가 정본이라
           지워도 밤에 되살아난다. 그래서 «읽을 때» 거른다(정본: src/student-override.ts).
           ⚠️ 이 handler 는 어떤 에러든 삼켜 빈 배열을 돌려준다. 표가 없을 때 조건절이
              붙으면 `no such table` 로 **명부 전체가 사라진 것처럼** 보이므로,
              hiddenExcludeCond 는 그럴 때 빈 문자열을 준다(fail-open). 그 성질에 기대고 있다. */
        const _erpConds = [_swErp.cond, await hiddenExcludeCond(env as any)].filter(Boolean);
        const rs = await env.DB.prepare(
          `SELECT rowid AS _rowid, * FROM students_erp ${_erpConds.length ? 'WHERE ' + _erpConds.join(' AND ') + ' ' : ''}ORDER BY rowid DESC LIMIT ?`
        ).bind(..._swErp.binds, lim).all<any>();
        const items = (rs.results || []).map(r => {
          // id 컬럼이 없으면 rowid 를 id 로 사용 (프론트 호환)
          if (r.id == null) r.id = r._rowid;
          // korean_name / english_name 만 있으면 username 에 채움 (Phase 20d 스키마 호환)
          if (!r.username && r.korean_name) r.username = r.korean_name;
          if (!r.login_id && r.user_id) r.login_id = r.user_id;
          return r;
        });
        const _piiItems = applyPIIScope(items, _swErp.scope);  // 🔒 권한별 PII 마스킹(hq/none=원본, 지사/대리점=마스킹)
        /* 📘 (2026-09-15) 「예약」 칸 — `students_erp` 의 수강 칸(signup_date·end_date·
           classes_per_week·payment_type)은 **카페24가 정본**이라, 관리자 화면에서 수업을
           넣어도(그건 class_schedules 에만 쓴다) 이 목록은 늘 «—» 였다.
           ⚠️ 기존 칸을 이 값으로 «채우지» 않는다 — 뜻이 다르다(정본 머리말 참고).
           ⚠️ 실패하면 빈 Map → 그 칸만 «—» 이고 명부는 그대로 뜬다(fail-open). */
        const _schedMap = await loadSchedSummaryMap(env as any);
        for (const _it of (_piiItems as any[])) {
          _it.sched = _schedMap.get(String(_it?.user_id || '').trim()) || { ...EMPTY_SCHED_SUMMARY };
        }
        return json({ ok: true, items: _piiItems, can_view_pii: canViewPII(_swErp.scope) });
      } catch (e: any) {
        // 어떤 에러든 빈 배열로 graceful — UI 가 "데이터 없음" 으로 표시
        console.warn('[erp-list] query failed:', e?.message || e);
        return json({ ok: true, items: [], warning: String(e?.message || e) });
      }
    }

    if (path === '/api/admin/students/erp' && method === 'POST') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT, username TEXT NOT NULL, login_id TEXT,
        payment_type TEXT, end_date TEXT, signup_date TEXT,
        classes_per_week INTEGER, points INTEGER DEFAULT 0,
        student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
        shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
        franchise TEXT, status TEXT DEFAULT '정상',
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );`);
      const b = await parseJsonBody(request);
      if (!b || !b.username) return invalidBody(['username']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO students_erp (student_id, username, login_id, payment_type, end_date, signup_date,
                                    classes_per_week, points, student_phone, parent_phone, teacher_phone,
                                    shop_name, hq_name, branch1_name, branch2_name, franchise, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.student_id || null, b.username, b.login_id || null,
        b.payment_type || 'B2C 결제', b.end_date || null, b.signup_date || null,
        b.classes_per_week != null ? Number(b.classes_per_week) : null,
        b.points != null ? Number(b.points) : 0,
        b.student_phone || null, b.parent_phone || null, b.teacher_phone || null,
        b.shop_name || null, b.hq_name || null, b.branch1_name || null, b.branch2_name || null,
        b.franchise || null, b.status || '정상', now, now
      ).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 22명 데모 시드 (스크린샷 데이터 기반)
    if (path === '/api/admin/students/erp-seed' && method === 'POST') {
      // 🥭 Phase 35b — 스키마 충돌 대비 (Phase 20d 의 다른 스키마와 호환)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS students_erp (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT, username TEXT, login_id TEXT,
          payment_type TEXT, end_date TEXT, signup_date TEXT,
          classes_per_week INTEGER, points INTEGER DEFAULT 0,
          student_phone TEXT, parent_phone TEXT, teacher_phone TEXT,
          shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT,
          franchise TEXT, status TEXT DEFAULT '정상',
          created_at INTEGER, updated_at INTEGER,
          korean_name TEXT, english_name TEXT, user_id TEXT
        );`);
      } catch {}
      // 누락 컬럼 보강 — ALTER TABLE ADD COLUMN (이미 있으면 throw, 개별 try/catch)
      const _addCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN ${col} ${type}`); } catch {}
      };
      await _addCol('student_id', 'TEXT');
      await _addCol('username', 'TEXT');
      await _addCol('login_id', 'TEXT');
      await _addCol('payment_type', 'TEXT');
      await _addCol('classes_per_week', 'INTEGER');
      await _addCol('points', 'INTEGER DEFAULT 0');
      await _addCol('student_phone', 'TEXT');
      await _addCol('parent_phone', 'TEXT');
      await _addCol('teacher_phone', 'TEXT');
      await _addCol('shop_name', 'TEXT');
      await _addCol('hq_name', 'TEXT');
      await _addCol('branch1_name', 'TEXT');
      await _addCol('branch2_name', 'TEXT');
      await _addCol('franchise', 'TEXT');
      await _addCol('updated_at', 'INTEGER');
      // 🥭 Phase 36 — 가짜 학생 20명 (테스트 전용, 다양한 패턴)
      // [student_id, username, login_id, pay, end_date, signup, classes, points, stu_ph, par_ph, t_ph, shop, hq, b1, b2, fran]
      const SEED = [
        ['MG001','김민수','mango_minsu',    'B2C 결제', '2026-12-31', '2026-03-01', 2, 150, '010-1111-1001', '010-2001-1001', '010-3001-1001', '망고아이 강남센터', '망고아이 본사', '강남지사', '강남캠퍼스', '망고아이'],
        ['MG002','이지은','mango_jieun',    'B2C 결제', '2026-09-30', '2026-03-05', 2, 80,  '010-1111-1002', '010-2001-1002', null,             '망고아이 서초센터', '망고아이 본사', '서초지사', '서초캠퍼스', '망고아이'],
        ['MG003','박서준','mango_seojun',   'B2C 결제', null,         '2026-03-10', 3, 220, '010-1111-1003', '010-2001-1003', '010-3001-1003', '망고아이 송파센터', '망고아이 본사', '송파지사', '송파캠퍼스', '망고아이'],
        ['MG004','최예린','mango_yerin',    'B2B 결제', '2027-03-31', '2026-03-12', 2, 50,  '010-1111-1004', '010-2001-1004', null,             '킹스영어 분당',     '에듀비전 본사', '제퍼슨',   '분당캠퍼스', '에듀비전'],
        ['MG005','정태현','mango_taehyun',  'B2C 결제', null,         '2026-03-15', 1, 30,  '010-1111-1005', '010-2001-1005', null,             '망고아이 안양센터', '망고아이 본사', '안양지사', '안양캠퍼스', '망고아이'],
        ['MG006','강유진','mango_yujin',    'B2C 결제', '2026-08-15', '2026-03-18', 2, 180, '010-1111-1006', '010-2001-1006', '010-3001-1006', '망고아이 일산센터', '망고아이 본사', '고양지사', '일산캠퍼스', '망고아이'],
        ['MG007','조현우','mango_hyunwoo',  'B2B 결제', null,         '2026-03-20', 3, 90,  '010-1111-1007', '010-2001-1007', null,             '에듀파인 부산',     '에듀비전 본사', 'SLP',      '부산캠퍼스', '에듀비전'],
        ['MG008','윤수아','mango_sua',      'B2C 결제', '2026-11-20', '2026-03-22', 2, 120, '010-1111-1008', '010-2001-1008', null,             '망고아이 수원센터', '망고아이 본사', '수원지사', '수원캠퍼스', '망고아이'],
        ['MG009','임도윤','mango_doyoon',   'B2C 결제', null,         '2026-03-25', 1, 0,   '010-1111-1009', '010-2001-1009', null,             '망고아이 인천센터', '망고아이 본사', '인천지사', '연수캠퍼스', '망고아이'],
        ['MG010','한지호','mango_jiho',     'B2C 결제', '2026-10-31', '2026-03-28', 3, 250, '010-1111-1010', '010-2001-1010', '010-3001-1010', '망고아이 대전센터', '망고아이 본사', '대전지사', '둔산캠퍼스', '망고아이'],
        ['MG011','송하연','mango_hayeon',   'B2C 결제', null,         '2026-04-01', 2, 60,  '010-1111-1011', '010-2001-1011', null,             '망고아이 광주센터', '망고아이 본사', '광주지사', '광주캠퍼스', '망고아이'],
        ['MG012','오시우','mango_siwoo',    'B2B 결제', '2027-01-31', '2026-04-03', 2, 110, '010-1111-1012', '010-2001-1012', null,             '리딩스타 대구',     '에듀비전 본사', '제퍼슨',   '대구캠퍼스', '에듀비전'],
        ['MG013','신아라','mango_ara',      'B2C 결제', null,         '2026-04-05', 1, 40,  '010-1111-1013', '010-2001-1013', null,             '망고아이 천안센터', '망고아이 본사', '천안지사', '천안캠퍼스', '망고아이'],
        ['MG014','배준영','mango_junyoung', 'B2C 결제', '2026-12-15', '2026-04-08', 2, 200, '010-1111-1014', '010-2001-1014', '010-3001-1014', '망고아이 청주센터', '망고아이 본사', '청주지사', '청주캠퍼스', '망고아이'],
        ['MG015','황소희','mango_sohee',    'B2C 결제', null,         '2026-04-10', 3, 75,  '010-1111-1015', '010-2001-1015', null,             '망고아이 울산센터', '망고아이 본사', '울산지사', '남구캠퍼스', '망고아이'],
        ['MG016','노지민','mango_jimin',    'B2B 결제', '2027-04-30', '2026-04-12', 2, 95,  '010-1111-1016', '010-2001-1016', null,             '잉글리쉬타운 분당', '에듀비전 본사', 'SLP',      '판교캠퍼스', '에듀비전'],
        ['MG017','서다은','mango_daeun',    'B2C 결제', null,         '2026-04-15', 1, 20,  '010-1111-1017', '010-2001-1017', null,             '망고아이 세종센터', '망고아이 본사', '세종지사', '세종캠퍼스', '망고아이'],
        ['MG018','권현서','mango_hyunseo',  'B2C 결제', '2026-09-15', '2026-04-18', 2, 130, '010-1111-1018', '010-2001-1018', '010-3001-1018', '망고아이 창원센터', '망고아이 본사', '창원지사', '창원캠퍼스', '망고아이'],
        ['MG019','류재희','mango_jaehee',   'B2C 결제', null,         '2026-04-20', 2, 55,  '010-1111-1019', '010-2001-1019', null,             '망고아이 전주센터', '망고아이 본사', '전주지사', '전주캠퍼스', '망고아이'],
        ['MG020','안민서','mango_minseo',   'B2C 결제', '2026-11-30', '2026-04-22', 3, 170, '010-1111-1020', '010-2001-1020', '010-3001-1020', '망고아이 제주센터', '망고아이 본사', '제주지사', '제주시캠퍼스', '망고아이']
      ];
      const now = Date.now();
      let created = 0, skipped = 0;
      const errors: string[] = [];
      for (const row of SEED) {
        const [sid, name, lid, pay, end_dt, signup, cw, pts, sp, pp, tp, shop, hq, b1, b2, fr] = row;
        try {
          // 중복 체크 — rowid 사용 (id 컬럼 없는 스키마에서도 동작)
          const exists: any = await env.DB.prepare(`SELECT rowid FROM students_erp WHERE student_id = ? LIMIT 1`).bind(sid).first();
          if (exists) { skipped++; continue; }
          await env.DB.prepare(
            `INSERT INTO students_erp (student_id, username, login_id, payment_type, end_date, signup_date,
                                        classes_per_week, points, student_phone, parent_phone, teacher_phone,
                                        shop_name, hq_name, branch1_name, branch2_name, franchise, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '정상', ?, ?)`
          ).bind(sid, name, lid, pay, end_dt, signup, cw, pts, sp, pp, tp, shop, hq, b1, b2, fr, now, now).run();
          created++;
        } catch (e: any) {
          errors.push(sid + ': ' + (e?.message || e));
        }
      }

      // 🥭 Phase 36 — 수강신청도 함께 시드 (📅 스케줄 캘린더 즉시 테스트 가능)
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS enrollments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_name TEXT NOT NULL, student_user_id TEXT,
          package TEXT, monthly_fee_krw INTEGER, started_at INTEGER, end_date TEXT,
          days_of_week TEXT, time TEXT, class_size TEXT, type TEXT, teacher_name TEXT,
          status TEXT DEFAULT 'active', created_at INTEGER NOT NULL
        );`);
      } catch {}
      // enrollments 누락 컬럼 보강
      const _addEnrCol = async (col: string, type: string) => {
        try { await env.DB.exec(`ALTER TABLE enrollments ADD COLUMN ${col} ${type}`); } catch {}
      };
      await _addEnrCol('days_of_week', 'TEXT');
      await _addEnrCol('time', 'TEXT');
      await _addEnrCol('class_size', 'TEXT');
      await _addEnrCol('type', 'TEXT');
      await _addEnrCol('teacher_name', 'TEXT');
      await _addEnrCol('end_date', 'TEXT');

      // 다양한 패턴 (요일·시간·인원·강사) — 학생 20명에 분배
      const patterns = [
        { days:'월수금', time:'10:30', size:'1:1', type:'정규수업', teacher:'Teacher Belle' },
        { days:'화목',   time:'15:00', size:'1:1', type:'체험수업', teacher:'Teacher Anna' },
        { days:'월수금', time:'월 7:00, 수 8:30, 금 6:00', size:'1:1', type:'정규수업', teacher:'Teacher David' },
        { days:'화목',   time:'17:30', size:'1:3', type:'정규수업', teacher:'Teacher Sarah' },
        { days:'월수',   time:'19:00', size:'1:2', type:'레벨테스트', teacher:'Teacher Mike' },
        { days:'토',     time:'09:00', size:'1:1', type:'체험수업', teacher:'Teacher Belle' },
        { days:'월화수목금', time:'08:00', size:'1:1', type:'정규수업', teacher:'Teacher Anna' },
        { days:'화금',   time:'14:30', size:'1:2', type:'정규수업', teacher:'Teacher David' },
        { days:'수금',   time:'수 16:00, 금 17:30', size:'1:1', type:'정규수업', teacher:'Teacher Sarah' },
        { days:'월목',   time:'18:00', size:'1:3', type:'정규수업', teacher:'Teacher Mike' }
      ];
      let enrollCreated = 0;
      const today = new Date();
      const todayStr = today.toISOString().slice(0,10);
      const startMs = today.getTime() - 14 * 86400000; // 2주 전부터
      for (let i = 0; i < SEED.length; i++) {
        const sid = SEED[i][0]; const name = SEED[i][1]; const lid = SEED[i][2];
        const endDate = SEED[i][4]; const fee = (i % 4 === 0) ? 0 : (200000 + (i % 6) * 30000);
        const p = patterns[i % patterns.length];
        try {
          // 같은 학생의 enrollment 가 이미 있으면 skip
          const exEnr: any = await env.DB.prepare(`SELECT rowid FROM enrollments WHERE student_user_id = ? LIMIT 1`).bind(lid).first();
          if (exEnr) continue;
          const pkg = p.type === '정규수업' ? '정규반' : (p.type === '체험수업' ? '체험반' : '레벨테스트반');
          await env.DB.prepare(
            `INSERT INTO enrollments
             (student_name, student_user_id, package, monthly_fee_krw, started_at, end_date,
              days_of_week, time, class_size, type, teacher_name, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`
          ).bind(
            name, lid, pkg, fee || null, startMs, endDate || null,
            p.days, p.time, p.size, p.type, p.teacher, now
          ).run();
          enrollCreated++;
        } catch {}
      }

      return json({ ok: true, total: SEED.length, created, skipped, enrollments_created: enrollCreated, errors: errors.length ? errors : undefined });
    }

    // (👨‍🎓 학생목록·graph-list·cafe24 임포트·레벨테스트 집계 → api-admin.ts — 21차)

    // (🏢 Phase 9 메뉴6+레벨테스트+교재동영상·망고비디오 → api-admin.ts — 22차)

    // (📚 Phase 39 교재파일+망고비디오 → api-admin.ts — 29차)


    // ===== 학생별 드릴다운 (Phase 2) =====
    //   GET /api/admin/student/:user_id?days=30
    //   - 프로필 (최초/마지막 접속, 전체 세션 수)
    //   - 요약 (기간 내 집계)
    //   - 일자별 by_day (차트용)
    //   - 세션 리스트 (최근순)
    //
    //   ⚠ Phase 12 — /api/admin/student/:uid/(full|consultations|...) 같은 sub-route 가 추가되면서
    //      `startsWith` 매칭이 충돌함. /api/admin/student/foo/full 의 userId 가 'foo/full' 로
    //      잘못 파싱돼 404 가 떨어졌음. user_id 만 있는 경로로 한정하기 위해 정규식으로 좁힘.
    if (/^\/api\/admin\/student\/[^\/]+$/.test(path) && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/admin/student/', ''));
      if (!userId) return invalidBody(['user_id(path)']);
      const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
      const since = Date.now() - days * 24 * 3600 * 1000;

      const [profileRow, summaryRow, byDayRows, sessionRows] = await Promise.all([
        // 프로필: 기간 무관 전체 history
        env.DB.prepare(
          `SELECT user_id, COALESCE(MAX(username), user_id) AS username, COALESCE(MAX(role), 'student') AS role,
                  MIN(joined_at) AS first_seen, MAX(joined_at) AS last_seen,
                  COUNT(*) AS total_sessions_all_time
           FROM attendance WHERE user_id = ?`
        ).bind(userId).first(),
        // 요약: 기간 내 집계
        env.DB.prepare(
          `SELECT COUNT(*) AS session_count,
                  COALESCE(SUM(total_session_ms), 0) AS total_session_ms,
                  COALESCE(SUM(total_active_ms), 0)  AS total_active_ms,
                  COALESCE(SUM(disconnect_count), 0) AS disconnect_sum,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score,
                  COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_score_count
           FROM attendance WHERE user_id = ? AND joined_at >= ?`
        ).bind(userId, since).first(),
        // 일자별 (차트용)
        env.DB.prepare(
          `SELECT date,
                  COUNT(*) AS session_count,
                  COALESCE(SUM(total_session_ms), 0) AS total_session_ms,
                  COALESCE(SUM(total_active_ms), 0)  AS total_active_ms,
                  AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score
           FROM attendance WHERE user_id = ? AND joined_at >= ?
           GROUP BY date ORDER BY date ASC`
        ).bind(userId, since).all(),
        // 세션 리스트 (최근순)
        env.DB.prepare(
          `SELECT id, room_id, joined_at, left_at, status, date,
                  total_session_ms, total_active_ms, disconnect_count,
                  gaze_score, gaze_samples, gaze_forward_samples
           FROM attendance WHERE user_id = ? AND joined_at >= ?
           ORDER BY joined_at DESC LIMIT 200`
        ).bind(userId, since).all()
      ]);

      if (!profileRow || !(profileRow as any).user_id) {
        return json({ ok: false, error: 'student_not_found', user_id: userId }, 404);
      }

      return json({
        ok: true,
        profile: profileRow,
        period_days: days,
        summary: summaryRow || {},
        by_day: byDayRows.results || [],
        sessions: sessionRows.results || []
      });
    }

    // ════════════════════════════════════════════════════════════════
    // 🎓 Phase 12 — 학생 드릴다운 풀 멀티탭
    //   GET  /api/admin/student/:uid/full           — 모든 탭 데이터 한 번에
    //   GET  /api/admin/student/:uid/consultations  — 상담 내역
    //   POST /api/admin/student/:uid/consultations  — 상담 기록 추가
    //   GET  /api/admin/student/:uid/evaluations    — 평가서 (시험 점수·종합 평가)
    //   POST /api/admin/student/:uid/evaluations    — 평가서 작성
    //   GET  /api/admin/student/:uid/feedbacks      — 교사 피드백 (수업별)
    //   POST /api/admin/student/:uid/feedbacks      — 피드백 작성
    //   GET  /api/admin/student/:uid/payments       — 수업료 결제 내역
    //   POST /api/admin/student/:uid/payments       — 수업료 기록 추가
    //   PATCH /api/admin/student/:uid/contact       — 연락처·학교 등 students_erp 업데이트
    //   GET  /api/admin/student/:uid/recordings     — 학생 참여 녹화 영상
    //   GET  /api/admin/student/:uid/textbooks      — 배정된 교재
    // ════════════════════════════════════════════════════════════════

    // 스키마 보장 — 5개 테이블 (idempotent)
    const ensureStudentDetailSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, consult_at INTEGER NOT NULL, channel TEXT, counselor TEXT, topic TEXT, content TEXT, follow_up_at INTEGER, status TEXT DEFAULT 'open', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, eval_at INTEGER NOT NULL, eval_type TEXT, level TEXT, score_speaking REAL, score_listening REAL, score_reading REAL, score_writing REAL, score_total REAL, evaluator TEXT, comment TEXT, next_goal TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS teacher_feedbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, room_id TEXT, attendance_id INTEGER, teacher_name TEXT, class_at INTEGER NOT NULL, rating INTEGER, summary TEXT, content TEXT, action_items TEXT, created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_textbook_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, textbook_id INTEGER, textbook_name TEXT, level TEXT, started_at INTEGER, ended_at INTEGER, progress_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL);`);
      // students_erp 에 학교·카톡 컬럼 추가 (이미 있으면 무시)
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN school TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN grade TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN kakao_id TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN parent_kakao_id TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN address TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN birth_date TEXT;`); } catch {}
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN notes TEXT;`); } catch {}
      // password_hash — api-students.ts 의 ensureLoginTable() 과 동일한 안전망(이미 있으면 무시)
      try { await env.DB.exec(`ALTER TABLE students_erp ADD COLUMN password_hash TEXT;`); } catch {}
    };

    // /api/admin/student/:uid/full — 한 번에 모든 탭 데이터 적재 (Promise.allSettled)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/full$/);
      if (m && method === 'GET') {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') || '30', 10)));
        const since = Date.now() - days * 24 * 3600 * 1000;

        const queries = await Promise.allSettled([
          // 1. erp 정보 (학생 마스터)
          env.DB.prepare(`SELECT * FROM students_erp WHERE ${ERP_BY_UID} LIMIT 1`).bind(...erpUidBinds(uid)).first(),
          // 2. 출석 프로필 + 요약
          env.DB.prepare(
            `SELECT user_id, COALESCE(MAX(username), user_id) AS username, COALESCE(MAX(role),'student') AS role,
                    MIN(joined_at) AS first_seen, MAX(joined_at) AS last_seen,
                    COUNT(*) AS total_sessions_all_time
             FROM attendance WHERE user_id = ?`
          ).bind(uid).first(),
          env.DB.prepare(
            `SELECT COUNT(*) AS session_count,
                    COALESCE(SUM(total_session_ms),0) AS total_session_ms,
                    COALESCE(SUM(total_active_ms),0)  AS total_active_ms,
                    COALESCE(SUM(disconnect_count),0) AS disconnect_sum,
                    AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score,
                    COUNT(CASE WHEN gaze_score IS NOT NULL THEN 1 END) AS gaze_score_count,
                    COUNT(DISTINCT date) AS active_days
             FROM attendance WHERE user_id = ? AND joined_at >= ?`
          ).bind(uid, since).first(),
          // 3. 일자별 (차트)
          env.DB.prepare(
            `SELECT date, COUNT(*) AS session_count,
                    COALESCE(SUM(total_session_ms),0) AS total_session_ms,
                    COALESCE(SUM(total_active_ms),0)  AS total_active_ms,
                    AVG(CASE WHEN gaze_score IS NOT NULL THEN gaze_score END) AS avg_gaze_score
             FROM attendance WHERE user_id = ? AND joined_at >= ?
             GROUP BY date ORDER BY date ASC`
          ).bind(uid, since).all(),
          // 4. 세션 (최근 200건)
          env.DB.prepare(
            `SELECT id, room_id, joined_at, left_at, status, date,
                    total_session_ms, total_active_ms, disconnect_count,
                    gaze_score, gaze_samples, gaze_forward_samples
             FROM attendance WHERE user_id = ? AND joined_at >= ?
             ORDER BY joined_at DESC LIMIT 200`
          ).bind(uid, since).all(),
          // 5. 수강 이력
          env.DB.prepare(`SELECT * FROM enrollments WHERE student_user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
          // 6. 수업료 결제
          env.DB.prepare(`SELECT * FROM student_payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 50`).bind(uid).all(),
          // 7. 평가서
          env.DB.prepare(`SELECT * FROM student_evaluations WHERE user_id = ? ORDER BY eval_at DESC LIMIT 50`).bind(uid).all(),
          // 8. 교사 피드백
          env.DB.prepare(`SELECT * FROM teacher_feedbacks WHERE user_id = ? ORDER BY class_at DESC LIMIT 50`).bind(uid).all(),
          // 9. 상담 내역
          env.DB.prepare(`SELECT * FROM student_consultations WHERE user_id = ? ORDER BY consult_at DESC LIMIT 50`).bind(uid).all(),
          // 10. 보상(스티커·쿠폰)
          env.DB.prepare(`SELECT * FROM rewards WHERE student_id = ? ORDER BY issued_at DESC LIMIT 50`).bind(uid).all(),
          // 11. 녹화 영상 (이 학생이 참여한)
          env.DB.prepare(
            `SELECT id, room_id, teacher_name, filename, started_at, ended_at, duration_ms, size_bytes, status
             FROM recordings
             WHERE participant_ids LIKE ? OR consented_user_ids LIKE ?
             ORDER BY started_at DESC LIMIT 50`
          ).bind('%' + uid + '%', '%' + uid + '%').all(),
          // 12. 배정 교재
          env.DB.prepare(`SELECT * FROM student_textbook_assignments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(uid).all(),
          // 13. 동의 현황
          env.DB.prepare(`SELECT * FROM consents WHERE user_id = ? AND withdrawn_at IS NULL ORDER BY consented_at DESC LIMIT 1`).bind(uid).first(),
        ]);

        const pick = (i: number) => {
          const r = queries[i];
          if (r.status !== 'fulfilled') return null;
          return r.value;
        };
        const pickList = (i: number) => {
          const v = pick(i) as any;
          if (!v) return [];
          if (Array.isArray(v.results)) return v.results;
          if (Array.isArray(v)) return v;
          return [];
        };

        const _fullScope = await getScope(env as any, request);  // 🔒 PII 열람 권한 판정
        const _erpRow: any = pick(0);
        const _fullErpPII = (_erpRow && !canViewPII(_fullScope)) ? maskRecordPII(_erpRow) : _erpRow;

        // 🎓 카페24 성적(그래프DB) — 월말평가(상세 코멘트5)·일별·교재퀴즈·레벨테스트·포인트. Neo4j 미연결 시 조용히 빈배열.
        let cafe24Scores: any = { monthly: [], daily: [], quiz: [], points: [], points_balance: 0, leveltest: [], enroll: [], counsel: [], teacher_score: null, review: [], self_avg: null, self_count: 0 };
        try {
          const { fields, values } = await runCypher(env, `
            OPTIONAL MATCH (m:MonthlyScore {user_id: $uid})
            WITH m ORDER BY m.year DESC, m.month DESC
            WITH collect(m { year: m.year, month: m.month, subject: m.subject, level: m.level, comment: m.comment, c1: m.c1, c2: m.c2, c3: m.c3, c4: m.c4, c5: m.c5 })[0..24] AS monthly
            OPTIONAL MATCH (d:DailyScore {user_id: $uid})
            WITH monthly, d ORDER BY d.date DESC
            WITH monthly, collect(d { date: d.date, s1: d.s1, s2: d.s2, s3: d.s3, s4: d.s4, s5: d.s5, comment: d.comment })[0..90] AS daily
            OPTIONAL MATCH (lt:LevelTest {user_id: $uid})
            WITH monthly, daily, lt ORDER BY lt.year DESC, lt.month DESC, lt.day DESC
            WITH monthly, daily, collect(lt { year: lt.year, month: lt.month, day: lt.day, level: lt.level, pass: lt.pass, s1: lt.s1, s2: lt.s2, s3: lt.s3, s4: lt.s4, s5: lt.s5, comment: lt.comment })[0..20] AS leveltest
            OPTIONAL MATCH (en:Enrollment {user_id: $uid})
            WITH monthly, daily, leveltest, en ORDER BY en.start_date DESC
            WITH monthly, daily, leveltest, collect(en { start_date: en.start_date, end_date: en.end_date, state: en.state, progress: en.progress, reg_date: en.reg_date })[0..30] AS enroll
            OPTIONAL MATCH (cn:Counsel {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, cn ORDER BY cn.date DESC
            WITH monthly, daily, leveltest, enroll, collect(cn { date: cn.date, counselor: cn.counselor, title: cn.title, content: cn.content, answer: cn.answer })[0..40] AS counsel
            OPTIONAL MATCH (rv:Review {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, rv ORDER BY rv.date DESC
            WITH monthly, daily, leveltest, enroll, counsel, collect(rv { rating: rv.rating, content: rv.content, date: rv.date, teacher_id: rv.teacher_id })[0..30] AS review
            OPTIONAL MATCH (ts:TeacherScore {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, count(ts) AS ts_count, avg((coalesce(ts.s1,0)+coalesce(ts.s2,0)+coalesce(ts.s3,0)+coalesce(ts.s4,0)+coalesce(ts.s5,0))/5.0) AS ts_avg
            OPTIONAL MATCH (c:Class {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, collect(DISTINCT c.class_id) AS classIds
            OPTIONAL MATCH (q:QuizResult) WHERE q.class_id IN classIds
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, q ORDER BY q.date DESC
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, collect(q { quiz_id: q.quiz_id, state: q.state, page: q.page, date: q.date, q_total: q.q_total, correct: q.correct, score_pct: q.score_pct })[0..60] AS quiz
            OPTIONAL MATCH (pt:PointTx {user_id: $uid})
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz, pt ORDER BY pt.ts DESC
            WITH monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz,
                 collect(pt { amount: pt.amount, name: pt.name, date: pt.date, ts: pt.ts })[0..100] AS points,
                 sum(pt.amount) AS points_balance
            OPTIONAL MATCH (st:Student {student_id: $uid})
            RETURN monthly, daily, leveltest, enroll, counsel, review, ts_count, ts_avg, quiz, points, points_balance,
                   st.self_avg AS self_avg, st.self_count AS self_count
          `, { uid }, 'READ');
          if (values.length) {
            const idx = (n: string) => fields.indexOf(n);
            const g = (n: string) => values[0][idx(n)];
            cafe24Scores = {
              monthly: g('monthly') || [], daily: g('daily') || [], leveltest: g('leveltest') || [],
              quiz: g('quiz') || [], points: g('points') || [], points_balance: g('points_balance') || 0,
              enroll: g('enroll') || [], counsel: g('counsel') || [], review: g('review') || [],
              teacher_score: (Number(g('ts_count'))>0) ? { count: g('ts_count'), avg: Math.round((Number(g('ts_avg'))||0)*10)/10 } : null,
              self_avg: g('self_avg') != null ? Math.round(Number(g('self_avg'))*10)/10 : null,
              self_count: g('self_count') || 0,
            };
          }
        } catch (e: any) {
          console.warn('[student/full] cafe24 성적 조회 실패:', e?.message || e);
        }

        // 📘 (2026-09-15) 「예약 수업」 — 목록과 «같은 정본» 을 쓴다(화면마다 답이 다르면 안 된다)
        const _fullSched = await loadSchedSummaryOne(env as any, uid);

        return json({
          ok: true,
          user_id: uid,
          period_days: days,
          sched: _fullSched,
          erp: _fullErpPII,
          can_view_pii: canViewPII(_fullScope),
          profile: pick(1),
          summary: pick(2) || {},
          by_day: pickList(3),
          sessions: pickList(4),
          enrollments: pickList(5),
          payments: pickList(6),
          evaluations: pickList(7),
          feedbacks: pickList(8),
          consultations: pickList(9),
          rewards: pickList(10),
          recordings: pickList(11),
          textbooks: pickList(12),
          consent: pick(13),
          // 🎓 카페24 성적 (월별/일별 점수 + 교재퀴즈) — 그래프DB 실데이터
          cafe24_scores: cafe24Scores,
        });
      }
    }

    // /api/admin/student/:uid/consultations
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/consultations$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_consultations WHERE user_id = ? ORDER BY consult_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['content or topic']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_consultations (user_id, consult_at, channel, counselor, topic, content, follow_up_at, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.consult_at || now,
            b.channel || 'phone',
            b.counselor || null,
            b.topic || null,
            b.content || '',
            b.follow_up_at || null,
            b.status || 'open',
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/evaluations
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/evaluations$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_evaluations WHERE user_id = ? ORDER BY eval_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['eval_type or score_total']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_evaluations (user_id, eval_at, eval_type, level, score_speaking, score_listening, score_reading, score_writing, score_total, evaluator, comment, next_goal, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.eval_at || now,
            b.eval_type || 'monthly',
            b.level || null,
            b.score_speaking ?? null,
            b.score_listening ?? null,
            b.score_reading ?? null,
            b.score_writing ?? null,
            b.score_total ?? null,
            b.evaluator || null,
            b.comment || null,
            b.next_goal || null,
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/feedbacks
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/feedbacks$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM teacher_feedbacks WHERE user_id = ? ORDER BY class_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b) return invalidBody(['summary']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO teacher_feedbacks (user_id, room_id, attendance_id, teacher_name, class_at, rating, summary, content, action_items, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.room_id || null,
            b.attendance_id || null,
            b.teacher_name || null,
            b.class_at || now,
            b.rating ?? null,
            b.summary || '',
            b.content || null,
            b.action_items || null,
            now
          ).run();
          // 📣 (2026-07-22) 학부모 컴플레인 #3: 수동 작성 피드백도 학부모에게 즉시 문자.
          let fbNotify: any = undefined;
          try {
            const stu: any = await env.DB.prepare(
              `SELECT * FROM students_erp WHERE user_id = ? OR login_id = ? LIMIT 1`
            ).bind(uid, uid).first();
            const phone = stu && String(stu.parent_phone || stu.student_phone || stu.phone || '').trim();
            if (phone) {
              const stuName = (stu && (stu.korean_name || stu.student_name || stu.name)) || uid;
              const bodyTxt = String(b.content || b.summary || '').slice(0, 350);
              const msg = `[망고아이] ${stuName} 학생의 수업 피드백이 도착했어요 💌\n👩‍🏫 ${b.teacher_name || '담당 선생님'}:\n"${bodyTxt}"`;
              const rr = await sendPlainSms(env as any, phone, msg);
              fbNotify = rr && rr.ok ? 'sent' : (rr && (rr.error || rr.message)) || 'failed';
            } else fbNotify = 'no_phone';
          } catch (e: any) { fbNotify = 'error:' + String(e?.message || e).slice(0, 80); }
          return json({ ok: true, id: r.meta.last_row_id, parent_notify: fbNotify });
        }
      }
    }

    // /api/admin/student/:uid/payments
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/payments$/);
      if (m) {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        if (method === 'GET') {
          const rs = await env.DB.prepare(
            `SELECT * FROM student_payments WHERE user_id = ? ORDER BY paid_at DESC LIMIT 100`
          ).bind(uid).all();
          return json({ ok: true, items: rs.results || [] });
        }
        if (method === 'POST') {
          const b = await parseJsonBody(request);
          if (!b || b.amount_krw == null) return invalidBody(['amount_krw']);
          const now = Date.now();
          const r = await env.DB.prepare(
            `INSERT INTO student_payments (user_id, paid_at, period_start, period_end, amount_krw, method, memo, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            uid,
            b.paid_at || now,
            b.period_start || null,
            b.period_end || null,
            Math.round(Number(b.amount_krw) || 0),
            b.method || null,
            b.memo || null,
            b.status || 'paid',
            now
          ).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
      }
    }

    // /api/admin/student/:uid/contact (PATCH — students_erp 업데이트)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/contact$/);
      if (m && method === 'PATCH') {
        await ensureStudentDetailSchema();
        const uid = decodeURIComponent(m[1]);
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['<any contact field>']);
        const allowed = ['student_phone','parent_phone','teacher_phone','school','grade','kakao_id','parent_kakao_id','address','birth_date','notes','shop_name','franchise'];
        const PII_GUARD = new Set(['student_phone','parent_phone','teacher_phone','kakao_id','parent_kakao_id']);
        const sets: string[] = []; const vals: any[] = []; const skippedMasked: string[] = [];
        for (const k of allowed) {
          if (b[k] === undefined) continue;
          // 🔒 마스킹된 표시값(*) 저장 차단 — 마스킹 문자열을 그대로 저장해 원본을 덮어쓰는 손상 방지
          if (PII_GUARD.has(k) && isMaskedValue(b[k])) { skippedMasked.push(k); continue; }
          sets.push(`${k} = ?`); vals.push(b[k]);
        }
        // 🥭 학생 이름 — korean_name·username 을 «함께» 고친다(이 페이지 왼쪽 카드는 username 만 읽는다).
        //   빈 문자열이면 손대지 않는다 — 이름을 NULL 로 지우면 화면 전체가 uid 로 떨어진다.
        let nameChanged = false;
        const newName = (typeof b.korean_name === 'string') ? b.korean_name.trim() : '';
        if (newName) {
          sets.push('korean_name = ?'); vals.push(newName);
          sets.push('username = ?'); vals.push(newName);
          nameChanged = true;
        }
        // 새 비밀번호 — students_erp.password_hash, api-students.ts hashPwd() 와 동일한 해시(SHA-256 + 고정 salt)
        let passwordChanged = false;
        if (typeof b.new_password === 'string' && b.new_password.length > 0) {
          if (b.new_password.length < 4) return json({ ok: false, error: 'weak_password', message: '비밀번호는 4자 이상이어야 합니다.' }, 400);
          const enc = new TextEncoder().encode(b.new_password + '|mangoi-salt-2026');
          const buf = await crypto.subtle.digest('SHA-256', enc);
          const ph = Array.from(new Uint8Array(buf)).map(x => x.toString(16).padStart(2, '0')).join('');
          sets.push('password_hash = ?'); vals.push(ph);
          passwordChanged = true;
        }
        if (sets.length === 0) {
          return skippedMasked.length
            ? json({ ok: false, error: 'masked_values_rejected', skipped_masked: skippedMasked }, 400)
            : json({ ok: false, error: 'nothing_to_update' }, 400);
        }
        sets.push('updated_at = ?'); vals.push(Date.now());
        /* 🔑 override 에 쓸 진짜 user_id 는 «UPDATE 앞» 에서 구한다.
           이름을 바꾸면 SET 에 `username = ?` 가 들어가는데, 그 행이 세 갈래 중
           «username = uid» 로만 매칭됐다면 UPDATE 뒤에는 같은 키로 다시 찾을 수 없다
           → realUid 가 null → override 미기록 → 야간 동기화가 이름을 되돌린다
           (이 블록이 막으려던 바로 그 사고). 에러가 안 나서 조용히 재현된다. */
        const preRow = nameChanged ? await env.DB.prepare(
          `SELECT user_id FROM students_erp WHERE ${ERP_BY_UID} LIMIT 1`
        ).bind(...erpUidBinds(uid)).first<{ user_id: string }>().catch(() => null) : null;
        // 매칭 조건은 ERP_BY_UID 정본 하나 (user_id 를 빠뜨려 수동 등록 학생이 0행 갱신되던 사고 — 2026-09-14)
        vals.push(...erpUidBinds(uid));
        await env.DB.prepare(
          `UPDATE students_erp SET ${sets.join(', ')} WHERE ${ERP_BY_UID}`
        ).bind(...vals).run();
        // 🧹 이름을 바꿨으면 student_erp_override 에도 적어 둔다 — 안 그러면 카페24 야간
        //   동기화(03:00 KST)가 하룻밤 만에 원래 이름으로 되돌린다(CLAUDE.md 2장 「학생 이름·
        //   계정을 D1 에서 고치거나 지웠는데 다음날 원복됨」). 실제 매칭 키는 user_id 라
        //   student_id/login_id/username 중 무엇으로 찾아왔든 진짜 user_id 를 먼저 구한다.
        //   ⚠️ fail-open — 여기서 실패해도 오늘 화면은 이미 바뀌었으니 저장 자체는 성공으로 둔다.
        if (nameChanged) {
          try {
            const realUid = preRow && preRow.user_id;
            if (realUid && await ensureStudentOverrideTable(env as any)) {
              const now = Date.now();
              await env.DB.prepare(
                `INSERT INTO student_erp_override (user_id, korean_name, created_at, updated_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET korean_name = excluded.korean_name, updated_at = excluded.updated_at`
              ).bind(realUid, newName, now, now).run();
            }
          } catch { /* 이름 고정 실패 — 오늘은 바뀌고 내일 밤 되돌아갈 뿐, 저장 자체는 막지 않는다 */ }
        }
        return json({ ok: true, updated_fields: sets.length - 1 - (nameChanged ? 1 : 0), skipped_masked: skippedMasked, password_changed: passwordChanged, name_changed: nameChanged });
      }
    }

    // /api/admin/student/:uid/extend (POST — 수강 연장)
    //   body: { months: 1|3|6|12 } 또는 { new_end_date: 'YYYY-MM-DD' }
    //   - students_erp.end_date 갱신
    //   - 활성 enrollments 의 ended_at 도 같이 연장 (있으면)
    //   - extension_log 에 기록 (감사 추적)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/extend$/);
      if (m && method === 'POST') {
        await ensureStudentDetailSchema();
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prev_end_date TEXT, new_end_date TEXT NOT NULL, months_added INTEGER, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL);`);
        const uid = decodeURIComponent(m[1]);
        const b = await parseJsonBody(request);
        if (!b) return invalidBody(['months or new_end_date']);

        // 현재 end_date 조회
        const cur = await env.DB.prepare(
          `SELECT end_date FROM students_erp WHERE ${ERP_BY_UID} LIMIT 1`
        ).bind(...erpUidBinds(uid)).first<{ end_date: string }>();

        // 새 종료일 계산
        let newEnd: string;
        const months = parseInt(b.months, 10);
        if (b.new_end_date && /^\d{4}-\d{2}-\d{2}$/.test(b.new_end_date)) {
          newEnd = b.new_end_date;
        } else if (months > 0 && months <= 60) {
          // 기존 end_date 기준, 없으면 오늘 기준
          const baseStr = (cur?.end_date && /^\d{4}-\d{2}-\d{2}$/.test(cur.end_date))
            ? cur.end_date
            : new Date().toISOString().slice(0, 10);
          const d = new Date(baseStr + 'T00:00:00Z');
          d.setUTCMonth(d.getUTCMonth() + months);
          newEnd = d.toISOString().slice(0, 10);
        } else {
          return json({ ok: false, error: 'invalid_months_or_date' }, 400);
        }

        // students_erp.end_date 갱신
        await env.DB.prepare(
          `UPDATE students_erp SET end_date = ?, updated_at = ?
           WHERE ${ERP_BY_UID}`
        ).bind(newEnd, Date.now(), ...erpUidBinds(uid)).run();

        // enrollments 도 함께 연장 (활성 행 1개) — KST 기준 종료시각 ms
        const newEndMs = new Date(newEnd + 'T23:59:59+09:00').getTime();
        await env.DB.prepare(
          `UPDATE enrollments SET ended_at = ?, status = 'confirmed', updated_at = ?
           WHERE student_user_id = ? AND (status = 'pending' OR status = 'confirmed' OR status IS NULL)`
        ).bind(newEndMs, Date.now(), uid).run();

        // 연장 로그 기록
        await env.DB.prepare(
          `INSERT INTO student_extensions (user_id, prev_end_date, new_end_date, months_added, reason, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uid,
          cur?.end_date || null,
          newEnd,
          months || null,
          b.reason || null,
          b.created_by || 'admin',
          Date.now()
        ).run();

        return json({
          ok: true,
          prev_end_date: cur?.end_date || null,
          new_end_date: newEnd,
          months_added: months || null
        });
      }
    }

    // /api/admin/student/:uid/extensions (GET — 연장 이력)
    {
      const m = path.match(/^\/api\/admin\/student\/([^\/]+)\/extensions$/);
      if (m && method === 'GET') {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS student_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prev_end_date TEXT, new_end_date TEXT NOT NULL, months_added INTEGER, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL);`);
        const uid = decodeURIComponent(m[1]);
        const rs = await env.DB.prepare(
          `SELECT * FROM student_extensions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
        ).bind(uid).all();
        return json({ ok: true, items: rs.results || [] });
      }
    }

    // ===== 녹화(Recording) =====
    // 🔐 2026-08-05: 이 엔드포인트는 인증이 없어 «누구나» 녹화 행을 무제한 생성할 수 있었고,
    //   그 id 로 /api/recordings/upload/* 를 열어 우리 R2 에 파일을 쌓을 수 있었다(저장 비용).
    //   토큰을 곧바로 필수로 만들면 교사 브라우저가 토큰을 안 보내는 경우 녹화가 통째로 멈추므로
    //   (MangoV3.api 는 쿠키만 보내고 Authorization 을 안 붙인다), 우선 **IP 당 속도 제한**으로
    //   남용만 막는다.
    //   (토큰 필수화는 클라이언트가 토큰을 보내는 것을 배포·확인한 뒤 2단계에서)
    //
    // ⚠️ 2026-08-07 검토: 한도를 30 → 300 으로 올린다.
    //   30 은 «강사 한 명이 시간당 몇 번 수업하나» 로 잡은 수인데, 세는 단위는 **IP** 다.
    //   필리핀 사무실 강사들이 공인 IP 하나를 나눠 쓰면 그 IP 로 전부 합산된다.
    //   운영 D1 실측(최근 14일, 시간대별 recordings.started_at):
    //     2026-07-28 19시 **37건**(강사 14명) · 08-04 20시 21건 · 07-25 13시 18건
    //   피크 37 > 한도 30 → 그 시간대에 정상 녹화가 429 로 막혔을 것이다.
    //   더 나쁜 건 **자동녹화는 실패해도 화면에 아무 말이 없다**는 점이다
    //   (mango-rec.js `if (!auto) alert(...)`) — 조용히 녹화가 안 남고, 나중에 찾을 때야 안다.
    //   강사 21명 × 시간당 3회 = 63건이 이론상 최대라 300 이면 5배 여유이고,
    //   남용은 수천 건 단위로 들어오므로 300 으로도 그대로 막힌다.
    //   ⚠️ 이 값을 다시 내리려면 위 실측을 먼저 다시 뜰 것. 「몇 건이면 충분하겠지」로 정하지 말 것.
    const REC_START_MAX_PER_IP_HOUR = 300;
    if (path === '/api/recordings/start' && method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();
      try {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown';
        const rkey = `recstart:${ip}:${Math.floor(now / 3600000)}`;   // 1시간 단위
        const cur = parseInt((await (env as any).SESSION_STATE?.get?.(rkey)) || '0', 10) || 0;
        if (cur >= REC_START_MAX_PER_IP_HOUR) {
          console.error(`[recordings] start 속도제한 ip=${ip} count=${cur}`);
          return json({ ok: false, error: 'rate_limited' }, 429);
        }
        await (env as any).SESSION_STATE?.put?.(rkey, String(cur + 1), { expirationTtl: 7200 });
      } catch { /* KV 장애로 정상 수업이 막히면 안 되므로 통과 */ }

      /* 🎥 (2026-09-08 사장님 「왜 자꾸 동시에 두번씩 녹화가 되는 거지?」)
         같은 방을 «두 기기가 각각» 찍고 있으면 두 번째를 거절한다. 두 파일은 내용이 같고,
         한 벌이 실시간 영상과 같은 CPU·업로드 회선을 나눠 쓴다(파일 머리말: recording-dup-guard.ts).

         ⚠️ 「가장 수업에 덜 지장있게」(같은 날 지시) — 이 게이트는 **막는 쪽으로 실패하지 않는다.**
            조회가 실패하면(표가 없다·D1 이 흔들린다) rows 가 null 이라 정본이 그냥 통과시킨다.
            잃을 것이 «수업 녹화 그 자체» 라, 두 벌보다 0벌이 나쁘기 때문이다.
         ⚠️ 「살아 있는가」는 recording_parts.created_at 으로 잰다 — recordings 에는 그 시각 칸이
            없고, 새 칸을 지연 ALTER 로 붙이면 없는 DB 에서 조회가 통째로 죽는다(CLAUDE.md 함정).
         ⛔ LEFT JOIN 으로 바꾸지 말 것 — 파트가 여럿이면 행이 늘어 «같은 녹화» 가 여러 번 걸린다.
         ⚠️ 200 으로 돌려준다 — 화면이 «실패» 로 오인해 재시도 폭주하지 않게(consent_required 선례). */
      /* ⚠️ room_id 가 비면 이 게이트를 건너뛴다 — 빈 값('')끼리 «같은 방» 으로 묶여
            서로 다른 수업이 서로를 막는다(클라이언트는 vcRoomId 가 미정의면 '' 를 보낸다). */
      if (String(b.room_id || '').trim()) try {
        let dupRows: any[] | null = null;
        try {
          const rs = await env.DB.prepare(
            `SELECT r.id AS id, r.teacher_name AS teacher_name,
                    COALESCE((SELECT MAX(p.created_at) FROM recording_parts p
                               WHERE p.recording_id = r.id), r.started_at) AS alive_at
               FROM recordings r
              WHERE r.room_id = ? AND r.status = 'recording'
              ORDER BY r.started_at DESC
              LIMIT 10`
          ).bind(String(b.room_id || '')).all();
          dupRows = (rs.results || []) as any[];
        } catch (e: any) {
          // 표가 아직 없거나 D1 이 흔들렸다 = «모른다» → 막지 않는다
          console.error('[recordings] 동시녹화 조회 실패(통과시킴):', e?.message || e);
          dupRows = null;
        }
        const gate = recordingDupGate({ rows: dupRows, now, windowMs: REC_DUP_LIVE_WINDOW_MS });
        if (gate.block) {
          console.log(`[recordings] 동시 녹화 거절 room=${b.room_id} holder=${gate.holderId}`);
          /* ⛔ «누가 찍고 있는지» 를 응답에 싣지 않는다 — 그 값(recordings.teacher_name)은
                화면의 아이디 입력칸(index.html `#vc-name-input`, autocomplete="username")에서 온
                **학생 로그인 아이디**일 수 있다(9/8 실측: 그 칸에 `ysyt01`·`mby1` 이 그대로 찍혔다).
                이 경로는 무인증이고 room_id 는 `class-{예약id}-{YYYYMMDD}` 로 열거 가능해서,
                수업 시간대 내내 «그 방 학생의 아이디» 를 아무나 받아 가는 통로가 된다.
                이 서비스에서 아이디는 곧 비밀번호다(password_hash 가 설정된 학생 0명 — CLAUDE.md 2장).
             ✅ 사람에게는 「다른 기기에서 녹화 중」 하나면 충분하고, 화면은 이름 없이도 그린다. */
          return json({
            ok: false,
            error: 'already_recording',
            retry_after_ms: REC_DUP_LIVE_WINDOW_MS,
            message: '이 수업은 다른 기기에서 이미 녹화하고 있습니다.'
          }, 200);
        }
      } catch (e: any) {
        console.error('[recordings] 동시녹화 판정 예외(통과시킴):', e?.message || e);
      }

      const participantIds = (b.participant_ids || []) as string[];
      const participantNames = (b.participant_names || []) as string[];

      // 🔴 2026-08-05: 화상수업 화면이 넘겨주는 참가자 정보는 «접속할 때마다 새로 생기는 임시
      //   번호»(bsqcli1ybw1team263jbo 같은)와 화면 표시 이름뿐이라, 학생 «계정 아이디» 가 한 번도
      //   안 들어갔다. 그래서 학생이 로그인해도 목록 API(participant_ids LIKE '%uid%')가 못 찾아
      //   **자기 수업 녹화가 안 보였다** — 완료 416건 중 318건(76%)이 참가자=강사뿐.
      //   같은 이유로 아래 동의 조회도 대상이 비어 consented_user_ids 가 416건 전부 빈 값이었다
      //   (미성년 수업 영상인데 녹화 동의가 한 건도 기록되지 않음).
      //   → 방 번호가 `class-<스케줄id>-<날짜>` 면 서버가 스케줄에서 학생 계정을 채운다.
      //     클라이언트는 안 건드린다. (meet-*·mangoi-class 같은 공용방은 스케줄이 없어 해당 없음)
      const schedMatch = /^class-(\d+)-/.exec(String(b.room_id || ''));
      if (schedMatch) {
        try {
          const cs: any = await env.DB.prepare(
            `SELECT user_id, student_name FROM class_schedules WHERE id = ?`
          ).bind(parseInt(schedMatch[1], 10)).first();
          const suid = String(cs?.user_id || '').trim();
          const sname = String(cs?.student_name || '').trim();
          if (suid && !participantIds.includes(suid)) participantIds.push(suid);
          if (sname && !participantNames.includes(sname)) participantNames.push(sname);
        } catch (e: any) {
          console.error('[recordings] 스케줄에서 학생 채우기 실패:', e?.message || e);
        }
      }

      /* 🏫 (2026-08-12) 공용방(`mangoi-class`)에는 스케줄이 없어 위 경로가 통째로 비켜간다.
         [규모] 운영 D1 실측 recordings 1,552건 중 공용방이 1,329건(86%). 위 스케줄 경로가
                덮는 `class-<id>-` 는 58건(3.7%)뿐이라, 공용방을 안 채우면 사실상 안 고친 것이다.
         [무엇을 근거로 채우나] `attendance.last_seen_at`.
                이 값은 클라이언트가 30초마다 부르는 /api/speaking-time 이 **서버 도착 시각으로**
                찍는다(클라 값으로 대체되지 않는다). 그래서 위조도 과다계상도 안 된다.
                account_uid 역시 mango_token 과 다르면 거부되므로(_attnSoftAuthOk) 남의 계정을 못 적는다
                (⚠️ 2026-09-04 정정 — 전에는 «user_id» 라고 적혀 있었는데 그 칸은 기기 식별자다).
         [왜 «겹침»이 아니라 «지금 살아 있음» 인가] left_at 은 자주 안 닫힌다 —
                공용방 학생 1,583행 중 272행이 left_at 없음이고, 세션 길이 최대치가 15일이었다.
                그걸로 시간겹침을 재면 무관한 학생까지 걸린다(느슨한 창으로 재 봤을 때 1,359건 중
                1,122건이 «학생 2명 이상»에 걸렸다 = 남의 아이 영상이 보일 위험).
                반면 「방금 하트비트를 보냈다」는 회선이 끊기면 바로 멈추므로 지금 있는 사람만 남는다.
         [같은 방에 여럿이면?] 공용방은 Durable Object 하나(정원 4명)라, 같은 시각에 있는 사람은
                서로의 화면을 이미 보고 있는 «같은 수업»이다. 함께 적는 것이 사실과 맞다.
         [안전] 실패해도 녹화는 그대로 시작된다(try 로 감쌌다). */
      if (!schedMatch) {
        try {
          /* 세 조건을 모두 만족해야 «지금 이 방에 있는 사람» 이다. 하나라도 빼면 남이 섞인다.
             ① 하트비트가 90초 안 — 주기가 30초이므로 3번 연속 안 오면 끊긴 것으로 본다
             ② 아직 나가지 않음 — 퇴장은 sendBeacon 으로 left_at 을 남긴다
             ③ 이미 들어와 있음 — joined_at 이 녹화 시작보다 앞(시계 오차 60초 허용)
             느슨하게 3분+겹침으로 재 봤더니 앞 수업 학생까지 걸려 한 녹화에 9개 아이디가 붙었다. */
          const FRESH_MS = 90 * 1000;
          const live = await env.DB.prepare(
            `SELECT DISTINCT account_uid, username
               FROM attendance
              WHERE room_id = ?
                AND last_seen_at IS NOT NULL
                AND last_seen_at >= ?
                AND joined_at <= ?
                AND (left_at IS NULL OR left_at >= ?)`
          ).bind(b.room_id, now - FRESH_MS, now + 60000, now).all();
          for (const r of ((live.results || []) as any[])) {
            /* 🆔 account_uid «만» 쓴다. user_id 는 계정이 아니라 기기·접속 식별자라
               학생 로그인과 영영 안 맞는다(그걸 넣으면 목록·재생·동의 어느 것도 안 붙는다).
               로그인 안 한 참가자는 account_uid 가 비어 있고, 그건 지금 구조로는 계정을 알 길이
               없다는 뜻이다 — 이름만 남긴다. */
            const uid = String(r.account_uid || '').trim();
            const unm = String(r.username || '').trim();
            if (uid && !participantIds.includes(uid)) participantIds.push(uid);
            if (unm && !participantNames.includes(unm)) participantNames.push(unm);
          }
        } catch (e: any) {
          console.error('[recordings] 공용방 참가자 채우기 실패:', e?.message || e);
        }
      }

      // 동의 안 한 학생 필터링
      let consentedIds: string[] = [];
      if (participantIds.length > 0) {
        // ⚠️ (2026-08-07) participant_ids 는 요청 본문에서 그대로 온 배열입니다.
        //    100개를 넘으면 D1 이 거절하는데 이 쿼리는 try/catch 밖이라 녹화 시작이
        //    통째로 실패했습니다. 청크로 나눠 조회 — 동의자 집합은 합집합이라 동일합니다.
        const rows = await selectInChunks<{ user_id: string }>(env.DB, participantIds,
          (ph) => `SELECT user_id FROM consents WHERE user_id IN (${ph}) AND withdrawn_at IS NULL AND recording_consent = 1`);
        consentedIds = rows.map(r => r.user_id);
      }

      /* 🛑 (2026-08-12 사장님 결정) «동의하지 않았으면 녹화 자체를 하지 않는다».
         예전엔 동의를 조회만 하고 결과에 상관없이 녹화를 만들었다(자동녹화는 팝업조차 건너뛰었다).

         [무엇을 «미동의» 로 볼 것인가 — 여기가 이 규칙의 전부다]
         판정 대상은 «누구인지 아는 학생» 뿐이다:
           · 강사 본인(teacher_id)은 뺀다 — 촬영 주체지 피촬영 동의 대상이 아니다.
           · 임시 접속번호는 뺀다 — 비로그인 참가자라 어떤 동의 행과도 이어지지 않는다.
             이걸 «미동의» 로 세면 로그인 안 한 사람이 한 명만 있어도 수업 녹화가 통째로 멈춘다.
         ⚠️ 그래서 이 게이트는 «신원이 확인된 학생이 거부했거나 아직 안 물어봤을 때» 막는다.
            비로그인 참가자는 못 막는다 — 남은 구멍이며, 그건 로그인 강제가 있어야 닫힌다.

         [왜 지금 켜도 수업이 안 멈추나] 학생 화면이 입장할 때 동의를 먼저 묻고(mango-consent.js),
         그 답이 저장된 뒤에야 녹화가 시작된다. 즉 «아직 안 물어본 사람» 은 정상 흐름에서 안 생긴다.
         그래도 막혔다면 그건 진짜 미동의이므로 막는 것이 맞다. */
      const _looksEphemeral = (s: string) => /^[a-z0-9]{18,}$/.test(s);
      const teacherId = String(b.teacher_id || '').trim();
      const identified = participantIds.filter(id =>
        id && id !== teacherId && !_looksEphemeral(String(id)));
      const blockers = identified.filter(id => !consentedIds.includes(id));
      if (blockers.length > 0) {
        console.log(`[recordings] 동의 없음으로 녹화 거절 room=${b.room_id} 미동의=${blockers.join(',')}`);
        return json({
          ok: false,
          error: 'consent_required',
          non_consented: blockers,
          message: '녹화 동의를 하지 않은 참가자가 있어 녹화를 시작하지 않았습니다.'
        }, 200);   // 200 — 수업 화면이 «실패» 로 오인해 재시도 폭주하지 않도록(본문으로 판단)
      }

      // 녹화 보관기간 = 6개월 (2026-09-02 사장님 결정. 그 전 3개월 · 더 전 30일)
      /* ⚠️ 이 값은 «앞으로 만들어질» 녹화에만 적용된다. 이미 있는 행의 expires_at 은
            그대로 둔다 — 학부모가 동의한 시점의 기간보다 더 오래 갖고 있게 되면
            보관기간을 늘리는 것이 곧 동의 범위를 넘는 일이 되기 때문.
            (recordings.expires_at 을 UPDATE 하는 코드는 저장소에 0곳이다 — 그렇게 지킨다)

         📅 2026-09-02 사장님 결정으로 3개월 → **6개월**.
            먼저 동의 화면(js/mango-consent.js)의 안내 문구를 6개월로 바꾸고 이 값을 올렸다.
            ⛔ 기존 2,098행은 «3개월» 이라 안내받고 동의한 것이므로 소급하지 않는다.
               그래서 한동안 3개월짜리와 6개월짜리가 섞여 있다 — 화면 문구에서 숫자를 뺀 이유다.

         🔴 다만 «6개월 안내를 본 사람의 녹화만 180일» 이 되는 것은 **아니다.**
            mangoConsentEnsure() 는 동의 행이 이미 있으면 그 자리에서 돌아가고
            CONSENT_VERSION 을 비교하지 않는다(저장만 하고 읽는 곳이 없다).
            ⟹ 예전에 3개월로 안내받고 동의한 학생의 **앞으로 찍힐** 녹화에도 180일이 붙는다.
               그 사람은 6개월 문구를 볼 기회가 없다.
            이 틈을 닫으려면 CONSENT_VERSION 비교를 넣어 다시 묻게 해야 하는데,
            학생 29,000명에게 동의를 다시 받는 일이라 **사람이 정할 문제**다(2026-09-02 미결).
            ⛔ 그때까지 이 자리를 「동의 범위 안이다」로 적지 마세요 — 과거 데이터에 대해서만 참이다.

         📌 2026-09-02 이전 옛 30일 행 1,483건을 90일로 맞춘 적이 있는데(파기를 켜던 날),
            그건 «늘린» 것이 아니라 동의 문구가 이미 3개월이었던 것에 **맞춘** 것이다. */
      const RETENTION_MS = 180 * 24 * 3600 * 1000; // 6개월
      const res = await env.DB.prepare(
        /* 🎥 (2026-09-08) status 를 «명시» 한다 — 예전엔 컬럼 목록에서 빼고 DEFAULT 에 기댔는데,
              그 기본값이 두 벌이라 환경에 따라 갈렸다: schema.sql:83 은 DEFAULT 'recording' 인데
              런타임 `CREATE TABLE IF NOT EXISTS recordings` 3곳(api-mango 2 · index.ts 1)에는 없다.
              DEFAULT 가 없는 DB 에서는 status 가 NULL 이라
                ① 파트 업로드가 통째로 거절되고(recordings-r2.ts 의 `status !== 'recording'`)
                ② 동시녹화 게이트가 영원히 0행을 봐서 «넣었는데 한 번도 안 도는» 상태가 된다.
              값은 운영 DB 의 DEFAULT 와 같으므로 기존 동작은 바뀌지 않는다. */
        `INSERT INTO recordings (room_id, teacher_id, teacher_name, filename, participant_ids, participant_names, consented_user_ids, started_at, expires_at, storage, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', 'recording')`
      ).bind(
        b.room_id, b.teacher_id, b.teacher_name || null,
        b.filename || `rec_${b.room_id}_${now}.webm`,
        JSON.stringify(participantIds), JSON.stringify(participantNames),
        JSON.stringify(consentedIds), now, now + RETENTION_MS
      ).run();
      return json({
        ok: true,
        recording_id: res.meta.last_row_id,
        consented_count: consentedIds.length,
        total_participants: participantIds.length,
        non_consented: participantIds.filter(id => !consentedIds.includes(id))
      });
    }

    // 🔴 2026-08-04: 이 엔드포인트가 조건 없이 status='completed' 로 덮어써서, R2 업로드가
    //   실패해 'upload_failed' 로 찍힌 녹화까지 다시 «정상»으로 되돌려 놓고 있었다.
    //   그 결과 목록엔 초록색 ▶재생 이 뜨는데 실물 파일은 없어 학생이 누르면 404 →
    //   "녹화를 재생할 수 없어요"(=보관기간 만료로 오해). 07-31 에 넣은 안전장치가 무력화된 것.
    //   → 종료 메타(시간·길이·용량)는 그대로 기록하되, 실패/삭제 판정은 절대 덮지 않는다.
    if (path === '/api/recordings/stop' && method === 'POST') {
      const b = await request.json() as any;
      const now = Date.now();

      /* 🔴 2026-08-26: 예전엔 R2 업로드가 됐든 안 됐든 **무조건 'completed'** 로 적었다.
         그래서 클라우드에 한 조각도 안 올라간 녹화가 목록에 초록색 「완료 · 2.1MB」로 떴다
         (그 용량은 브라우저가 잰 «로컬» 값이다). 8/25 에 1,692건이 전부 「완료」인데
         「⚠️ 영상 없음」이던 화면의 절반이 이것이었다 — 화면이 «저장됐다» 고 말해 버리니
         아무도 «안 올라갔다» 는 것을 알 수 없었다.
         → 적기 전에 **실물이 있는지 서버가 직접 확인**한다. 클라이언트 말만 믿지 않는다. */
      const cur = await env.DB.prepare(
        `SELECT file_url, status, size_bytes, duration_ms FROM recordings WHERE id = ?`
      ).bind(b.recording_id).first<{ file_url: string | null; status: string | null; size_bytes: number | null; duration_ms: number | null }>();

      // 실물 확인은 «진짜 R2 키» 일 때만. 'CLIENT_ERR:'·'DEBUG:' 는 옛 클라이언트가 오류
      // 메시지를 이 칸에 적어 둔 것이라 키가 아니다(video-call/js/recorder.js `_callStop`).
      const curKey = String(cur?.file_url || '');
      const looksLikeKey = !!curKey && !curKey.startsWith('CLIENT_ERR:') && !curKey.startsWith('DEBUG:');
      let headProven = false;    // 실물을 «봤다» — 이때만 완료로 올려준다(자가복구 포함)
      let headChecked = false;   // 조회가 성립했는가 — 예외면 판단을 보류한다
      const recBucket = (env as any).RECORDINGS as R2Bucket | undefined;
      if (looksLikeKey && recBucket) {
        try { headProven = !!(await recBucket.head(curKey)); headChecked = true; } catch { headChecked = false; }
      }

      /* ⚠️ 강등은 «없다고 밝혀졌을 때» 만 한다. 조회를 못 했으면 예전 동작(완료)을 유지한다 —
         이 경로는 수업이 끝날 때마다 도는 곳이라, 막는 쪽이 아니라 통과시키는 쪽으로 실패해야
         멀쩡한 녹화가 무더기로 «실패» 로 찍히지 않는다. */
      const provenMissing = headChecked && !headProven;
      const clientSaysFailed = b.r2_success === false;   // 새 클라이언트만 보낸다(옛 것은 undefined)
      /* 🔢 본문 값은 «숫자로 강제» 해서만 쓴다 — 아래 SQL 의 MAX() 보호가 숫자일 때만
         성립하기 때문이다(자세한 이유는 UPDATE 문 위 주석). */
      const stopDurMs = Math.max(0, Number(b.duration_ms) || 0);
      const stopSizeB = Math.max(0, Number(b.size_bytes) || 0);

      /* 🔴 (2026-09-02) «없던 일(aborted)» 판정은 클라이언트가 보낸 값만으로 하면 안 된다.
         탭을 닫고 나가면 onstop 이 안 돌아 이 요청은 duration 0 · size 0 으로 온다.
         그런데 그 사이 조각 업로드가 이미 size_bytes 를 적어 뒀을 수 있다(recordings-r2.ts
         «업로드 중 size_bytes 갱신»). 그걸 안 보면 **진짜 찍힌 수업이 «없던 일» 로 분류되고**
         목록이 «aborted + size 0» 을 통째로 감추므로 화면에서 사라진다.
         → DB 에 이미 적힌 값도 함께 본다. 하나라도 0 보다 크면 «없던 일» 이 아니다. */
      const recordedBytes = Math.max(stopSizeB, Number(cur?.size_bytes) || 0);
      const recordedMs = Math.max(stopDurMs, Number(cur?.duration_ms) || 0);
      const nothingRecorded = !(recordedMs > 0) && !(recordedBytes > 0);
      const fallbackStatus = (provenMissing || clientSaysFailed)
        ? (nothingRecorded ? 'aborted' : 'upload_failed')   // 1초도 안 찍힌 건 «실패» 가 아니라 «없던 일»
        : 'completed';

      /* ⚠️ duration_ms·size_bytes 를 «덮어쓰지» 않는다(MAX) — 이 요청이 0 으로 와도
         조각 업로드가 이미 적어 둔 값을 지우면 위 판정이 다음번에 또 뒤집힌다.
         🔴 그런데 그 보호는 **바인드가 «숫자» 일 때만** 성립한다. SQLite 의 스칼라 MAX() 는
            타입 우선순위(TEXT > 숫자)로 비교하므로 문자열 "0" 하나면 613000 을 0 으로 지운다
            (2026-09-02 node:sqlite 로 실측). 이 엔드포인트는 소유권 검사가 없는 공개 POST 라
            본문이 무엇이든 올 수 있다 → **Number 로 강제**한다(형제 파일 recordings-r2.ts 와 같은 방식).
         ⛔ `b.duration_ms || 0` 로 되돌리지 말 것 — "0" 은 truthy 라 그대로 통과한다. */
      await env.DB.prepare(
        `UPDATE recordings
            SET ended_at = ?, duration_ms = MAX(COALESCE(duration_ms, 0), ?), size_bytes = MAX(COALESCE(size_bytes, 0), ?),
                status = CASE
                  WHEN status = 'deleted'       THEN status
                  WHEN ? = 1                    THEN 'completed'
                  WHEN status = 'upload_failed' THEN status
                  ELSE ?
                END,
                file_url = COALESCE(?, file_url), storage = COALESCE(?, storage)
          WHERE id = ?`
      ).bind(now, stopDurMs, stopSizeB,
             headProven ? 1 : 0, fallbackStatus,
             b.file_url || null, b.storage || null, b.recording_id).run();
      const after = await env.DB.prepare(`SELECT status, storage FROM recordings WHERE id = ?`)
        .bind(b.recording_id).first<{ status: string | null; storage: string | null }>();
      return json({
        ok: true, ended_at: now,
        status: after?.status || null, storage: after?.storage || null,
        cloud_verified: headProven,          // 화면·진단이 «정말 올라갔나» 를 알 수 있게 함께 준다
      });
    }

    if (path === '/api/recordings' && method === 'GET') {
      // 녹화 목록 조회 — D1 의 recordings 메타데이터 + (참여도 점수) 함께 반환.
      // 참여도 점수는 attendance 테이블의 talk-time 비율로 도출한다.
      //   speaking_score : (총 활성 발화시간 / 총 세션시간) × 100
      //                    같은 room_id 이면서 해당 녹화 시간대(joined_at 이 녹화 window 내부)인
      //                    attendance 행만 평균. 시간대 필터가 없으면 과거 수업 데이터가
      //                    섞여 점수가 일정하게 나오므로 반드시 window 로 제한해야 함.
      //   gaze_score    : MediaPipe FaceLandmarker 로 계산된 "정면 응시 비율"(%).
      //                   public/js/mango-gaze.js → /api/gaze-score 경로로 attendance 에 누적.
      //                   speaking_score 와 동일 시간 window 로 평균.
      // 가중평균/총참여도(participation_score) 계산은 프런트(JS)에서 수행하여 점수 정의 변경 시 배포 없이 조정 가능하게 함.
      // --- 필터·페이지네이션 파라미터 (Phase 3) ----------------------
      const teacherId = url.searchParams.get('teacher_id');
      const roomId    = url.searchParams.get('room_id');
      const qSearch   = (url.searchParams.get('q') || '').trim();           // 방ID / 교사명 / 교사ID LIKE
      const dateFrom  = url.searchParams.get('date_from');                  // YYYY-MM-DD (KST 기준 00:00)
      const dateTo    = url.searchParams.get('date_to');                    // YYYY-MM-DD (KST 기준 23:59:59)
      const status    = url.searchParams.get('status');                     // completed | upload_failed | recording | aborted | deleted | all  ('ended' 는 옛 이름 — completed 로 정규화)
      const limit     = Math.max(1,  Math.min(200, parseInt(url.searchParams.get('limit')  || '50', 10)));
      const offset    = Math.max(0,                parseInt(url.searchParams.get('offset') || '0',  10));

      // WHERE 조립 (count + list 공용)
      const whereParts: string[] = [];
      const whereBinds: any[]    = [];
      if (teacherId) { whereParts.push('r.teacher_id = ?'); whereBinds.push(teacherId); }
      if (roomId)    { whereParts.push('r.room_id = ?');    whereBinds.push(roomId); }
      if (qSearch) {
        /* 🎓 2026-09-01 — 「학생」 칸을 만들면서 검색도 함께 넓힌다.
           안 넓히면 화면에 학생 이름이 보이는데 그 이름으로 검색하면 0건이 나온다
           (「검색했는데 아무것도 없다」로 읽힌다 — CLAUDE.md 2장 「전용 검색창」 항목과 같은 뿌리).
           ⚠️ participant_names·participant_ids 에는 교사 표시이름과 임시 접속번호도 섞여 있어
              여기 검색은 «학생만» 이 아니라 «그 방에 적힌 것 전부» 다. 화면 칸(학생)보다 넓게
              걸리는 것이 정상이고, 좁게 걸리는 것보다 낫다(못 찾는 것이 더 나쁘다). */
        /* 🧑‍🏫 2026-09-04 — 「교사」·「아이디」 칸을 «예약에 배정된 강사» 로 바꾸면서 검색도 넓힌다.
           그 칸의 값(예: 방 class-1079 의 교사 「KRYSTEL」·아이디 「mangoi_169」)은 recordings
           어느 칸에도 없다 — 안 넓히면 **화면에 보이는 이름으로 검색하면 0건**이 나온다.
           ⚠️ `cs.id` 는 PK 라 상관 서브쿼리라도 한 건 조회다. 방 번호에서 예약 id 를 떼는 식은
              `class-1079-20260903` → `1079` (SUBSTR 7 부터 다음 «-» 앞까지). */
        whereParts.push(
          "(r.room_id LIKE ? OR COALESCE(r.teacher_name,'') LIKE ? OR COALESCE(r.teacher_id,'') LIKE ?"
          + " OR COALESCE(r.participant_names,'') LIKE ? OR COALESCE(r.participant_ids,'') LIKE ?"
          + " OR EXISTS (SELECT 1 FROM class_schedules cs"
          + "             WHERE r.room_id LIKE 'class-%'"
          + "               AND cs.id = CAST(SUBSTR(r.room_id, 7, INSTR(SUBSTR(r.room_id, 7), '-') - 1) AS INTEGER)"
          + "               AND (EXISTS (SELECT 1 FROM teachers t"
          + "                             WHERE CAST(t.id AS TEXT) = CAST(cs.teacher_id AS TEXT)"
          + "                               AND COALESCE(t.name,'') LIKE ?)"
          + "                 OR EXISTS (SELECT 1 FROM teacher_account_links tal"
          + "                             WHERE CAST(tal.teacher_id AS TEXT) = CAST(cs.teacher_id AS TEXT)"
          + "                               AND COALESCE(tal.username,'') LIKE ?)"
          /* 🎓 2026-09-14 — 「학생」 칸의 첫 근거는 예약표(cs.user_id·cs.student_name,
             src/recording-students.ts)인데 여기 검색은 participant_* 만 봐서, 동의 안 한
             학생은 화면에 이름이 보이는데 그 이름으로 검색하면 0건이었다. */
          + "                 OR COALESCE(cs.student_name,'') LIKE ?"
          + "                 OR COALESCE(cs.user_id,'') LIKE ?)))");
        const p = `%${qSearch}%`;
        whereBinds.push(p, p, p, p, p, p, p, p, p);
      }
      if (dateFrom) {
        const ms = Date.parse(dateFrom + 'T00:00:00+09:00');
        if (!isNaN(ms)) { whereParts.push('r.started_at >= ?'); whereBinds.push(ms); }
      }
      if (dateTo) {
        const ms = Date.parse(dateTo + 'T23:59:59+09:00');
        if (!isNaN(ms)) { whereParts.push('r.started_at <= ?'); whereBinds.push(ms); }
      }
      /* 🔤 상태값 정규화 (2026-08-28) — 화면 필터 「종료」의 value 가 'ended' 인데
         D1 에 실제로 들어가는 값은 'completed' 다(운영 실측: completed·deleted·aborted·
         upload_failed·recording 다섯 뿐, 'ended' 행은 **0건**). 그래서 「종료」를 고르면
         조건이 `r.status='ended'` 가 되어 **에러 없이 늘 0건**이었다.
         ⚠️ 화면 option value 만 바꾸면 옛 북마크·옛 캐시가 그대로 0건을 본다 —
            서버가 두 이름을 같은 것으로 받아 준다. */
      const statusNorm = status === 'ended' ? 'completed' : status;
      if (statusNorm && statusNorm !== 'all') {
        whereParts.push('r.status = ?');
        whereBinds.push(statusNorm);
      }
      /* 🧹 (2026-08-05) 0초짜리 «부산물» 행은 기본 목록에서 감춘다.
         [무엇인가] R2 멀티파트는 마지막이 아닌 파트가 «5MiB 고정» 이라, 그만큼 안 모이면
           올릴 파트가 하나도 없다. 이때 브라우저는 R2 에 쓰레기를 남기지 않으려고 abort 한다.
           즉 status='aborted' + size 0 은 «사고» 가 아니라 «올바른 뒷정리» 다.
         [언제 생기나] 새로고침·재입장처럼 방에 잠깐 들어왔다 나가면 그 조각마다 한 행씩 생긴다.
           [실측 7일] 정규수업 24건 중 6건, 회의·공용 106건 중 40건이 이것이었다.
         [왜 감추나] 진짜 봐야 할 것은 「저장 실패」와 「준비중」이다. 0초 행이 목록을 채우면
           강사·관리자가 그 둘을 못 찾는다. 실제 수업 영상이 아니므로 숨겨도 잃는 것이 없다.
         ⚠️ 지우지 않는다. 감추기만 한다 — ?status=aborted 로 부르면 그대로 다 보인다(원인 추적용). */
      /* 🗑️ (2026-08-28 사장님 승인 — 「이거 영상 없는 이유가 뭐야?」 제보의 조치 ①)
         «삭제됨» 도 기본 목록에서 감춘다 — 위 0초 행과 같은 이유.
         [무엇인가] 보관기간 3개월이 지나면 `retention.ts` 가 그 행을 status='deleted' 로
           내린다. 그러면 관리자 화면이 그 행마다 「⚠ 영상 없음」을 붙인다.
         ⚠️ **«파일이 지워졌다» 는 뜻이 아니다.** `retention.ts:50` 이 명시한다 —
            그 단계는 D1 표시만 바꾸고 **R2 실물은 그대로 두며**, 고아 청소기가 그 key 를
            «살아있는 파일» 로 보고 보호한다. 실제 파기는 아직 켜지 않은 별건이다.
            그러니 이 행을 두고 «지웠다» 고 단정하지 말 것 — 화면 문구도 그렇게 쓰지 않는다.
         [얼마나] 2026-08-28 운영 실측 — 목록 1,862건 중 **1,236건(66%)이 이것**이었고
           **1,236건 전부 만료일이 지나 있었다**(고장이 아니라 정상 정리분).
         [왜 감추나] 진짜 봐야 할 「저장 실패 76건」이 그 66% 에 파묻혀 안 보였다.
           사장님이 「영상 없는 이유가 뭐냐」고 물으신 화면이 정확히 이 상태였다.
         ⛔ 지우지 않는다. 감추기만 한다 — ?status=deleted 로 부르면 그대로 다 보이고
            복원 버튼도 그대로다(0초 행과 같은 방식). */
      if (!statusNorm || statusNorm === 'all') {
        whereParts.push("NOT (r.status = 'aborted' AND COALESCE(r.size_bytes, 0) = 0)");
        whereParts.push("r.status != 'deleted'");
      }
      const whereSQL = whereParts.length ? ('WHERE ' + whereParts.join(' AND ')) : 'WHERE 1=1';

      // Total count (필터 적용된 상태에서의 전체 건수 — 페이지네이션 UI 에 사용)
      const countStmt = env.DB.prepare(`SELECT COUNT(*) AS total FROM recordings r ${whereSQL}`);
      const countRow  = whereBinds.length
        ? await countStmt.bind(...whereBinds).first<{ total: number }>()
        : await countStmt.first<{ total: number }>();
      const total = countRow?.total || 0;

      /* ⚠️ `r.participant_ids` 는 화면이 그리는 칸이 아니라 **학생 칸 판정의 첫 번째 근거**다
            (src/recording-students.ts ①). 2026-09-01 에 이 SELECT 목록에서 빠져 있어
            `resolveRecordingStudents()` 의 `parseIdList(r.participant_ids)` 가 **늘 빈 배열**이었고,
            그 근거 하나가 «에러 없이» 죽어 있었다(학생 칸이 그래도 채워진 것은 나머지 세
            근거 — 예약·consented_user_ids·teacher_name — 덕분이라 아무도 못 알아챘다).
         📊 [되살려도 오늘 화면은 그대로다 — D1 전수 실측 2026-09-04]
            `recordings` **2,122행 전수**에서 학생 칸이 «늘어나는» 행 **0건**이었다.
            participant_ids 안의 실재 학생 계정 244개가 **전부** 이미 다른 근거로 잡힌다.
            구조적으로 그렇다 — `/api/recordings/start` 가 `consented_user_ids` 를
            «participant_ids 중 동의한 사람» 으로 계산해 넣고, 동의 안 한 학생은 그 아래
            「동의 없으면 녹화 금지」 게이트가 막는다. ⟹ 두 칸이 사실상 겹친다.
            그러니 이 수리는 «화면을 바꾸는 것» 이 아니라 **«정본이 읽겠다고 선언한 칸을
            서버가 실제로 준다» 는 계약을 되돌리는 것**이다. 그 게이트나 동의 정책이 바뀌는
            날(또는 consents 조회가 실패해 consented 가 비는 날) 이 근거가 실제로 일한다.
         ⛔ 판정에 쓰는 칸을 SELECT 에서 빼지 말 것. 빼도 화면이 «고장» 으로 보이지 않는다.
            감시: test-harness/recording_student_column_harness.mjs A절. */
      let q = `SELECT r.id, r.room_id, r.teacher_id, r.teacher_name, r.filename, r.file_url,
                      r.size_bytes, r.duration_ms,
                      r.participant_names, r.participant_ids, r.consented_user_ids,
                      r.started_at, r.ended_at, r.status, r.storage, r.expires_at,
                      /* 시선 점수 — 해당 녹화 시간대의 attendance.gaze_score 평균
                         window = [started_at - 30s, ended_at 또는 started_at + duration + 30s] */
                      (SELECT ROUND(AVG(a.gaze_score), 1)
                       FROM attendance a
                       WHERE a.room_id = r.room_id
                         AND a.gaze_score IS NOT NULL
                         AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                         AND a.joined_at <= (
                               COALESCE(
                                 r.ended_at,
                                 r.started_at + COALESCE(r.duration_ms, 0),
                                 r.started_at + 10800000
                               ) + 30000
                             )
                      ) AS gaze_score,
                      /* 말하기 점수 — 해당 녹화 시간대에 속한 attendance 행만 평균(0~100)
                         window = [started_at - 30s, ended_at 또는 started_at + duration + 30s]
                         ended_at 이 null 이면 started_at + duration_ms 로 대체,
                         duration 도 없으면 started_at + 3h (비정상 케이스) 로 제한 */
                      (SELECT ROUND(AVG(
                                CAST(a.total_active_ms AS REAL) * 100.0
                                / NULLIF(a.total_session_ms, 0)
                              ), 1)
                       FROM attendance a
                       WHERE a.room_id = r.room_id
                         AND a.total_session_ms > 0
                         AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                         AND a.joined_at <= (
                               COALESCE(
                                 r.ended_at,
                                 r.started_at + COALESCE(r.duration_ms, 0),
                                 r.started_at + 10800000
                               ) + 30000
                             )
                      ) AS speaking_score,
                      /* 진단 필드 (admin UI 툴팁용) — "왜 점수가 — 인가?" 를 사후 추적 */
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS attendance_count,
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND (a.gaze_samples = 0 OR a.gaze_samples IS NULL)
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS gaze_missing_count,
                      (SELECT COUNT(1) FROM attendance a
                        WHERE a.room_id = r.room_id
                          AND COALESCE(a.total_session_ms, 0) > 0
                          AND COALESCE(a.total_active_ms, 0) = 0
                          AND a.joined_at >= (COALESCE(r.started_at, 0) - 30000)
                          AND a.joined_at <= (
                                COALESCE(r.ended_at,
                                         r.started_at + COALESCE(r.duration_ms, 0),
                                         r.started_at + 10800000) + 30000
                              )
                      ) AS speaking_zero_count
               FROM recordings r ${whereSQL}
               ORDER BY r.started_at DESC LIMIT ? OFFSET ?`;
      const listBinds = [...whereBinds, limit, offset];
      const rs = await env.DB.prepare(q).bind(...listBinds).all();

      /* 📼 저장·링크 URL 동봉 (2026-09-01 사장님 «카카오에 저장도 안돼»)
         [무엇이 문제였나] 관리자 목록의 ⬇저장이 `/api/recordings/blob/<키>` + <a download> 였다.
           그 통로는 Range 를 그대로 존중해 **206** 을 돌려주는데, 갤럭시 일부 기기가
           저장 요청에 `Range: bytes=0-` 를 끼워 넣는다 → 안드로이드 DownloadManager 가
           사유 없이 «다운로드에 실패했습니다» 만 반복한다. 이건 2026-08-15 에 이미 진단돼
           `/api/recording/play?…&dl=1` 쪽에만 고쳐져 있었고(=Range 무시·200 전체 본문 +
           Content-Disposition), 강사 화면(flow.js)은 그것을 쓰는데 **관리자 목록만** 옛
           통로에 남아 있었다.
         [왜 화면이 아니라 서버가 URL 을 만드나] 화면은 «그 녹화가 정말 재생되는가» 를 모른다.
           play 엔드포인트는 file_url/filename 으로 키를 풀고 status·storage·만료까지 보고
           404 를 낸다. 같은 판정을 여기서 한 번 해서, 풀리지 않으면 아예 안 준다 —
           화면은 그때만 옛 blob 통로로 폴백한다(지금 되는 것을 잃지 않는다).
         [sig 를 왜 동봉하나] 교사·관리자는 쿠키로만 인증되는데 카톡 인앱 브라우저·안드로이드
           WebView 는 저장을 쿠키 없는 다운로드 관리자에 위임한다(2026-08-13 «휴대폰 저장 안 됨»).
           범위가 녹화 id 하나뿐인 단기 서명이라 권한이 넓어지는 지점이 없다
           (발급 방식·근거는 /api/student/recordings 와 똑같다 — auth-token.ts signRecDlSig).
         ⚠️ 이 API 는 **로그인 전용**이다 — `index.ts` 의 `isAdminPath()` 에 `/api/recordings` GET 이
            등록돼 있어 무인증으로는 못 부른다(`isAdminOnlyApi` 라는 함수는 이 저장소에 없다).
            ⚠️ 다만 «관리자 전용» 은 아니다 — 경로가 `/api/admin/` 접두사가 아니라서 강사 차단
            (`TEACHER_BLOCKED_PREFIXES`)도 스코프 차단(`forbidden_scope`)도 안 걸린다.
            «서명은 인증을 통과한 뒤에만 발급된다» 는 전제가 여기에 걸려 있다 — 공개로 열지 말 것.
         감시: test-harness/recording_download_link_harness.mjs */
      const _nowMs = Date.now();
      /* 🎓 「학생」 칸 (2026-09-01 사장님 «여기에 학생 목록도 넣어줄 수 있어?»)
         [왜 서버가 푸나] 「교사」 칸에는 방을 먼저 켠 사람이 찍혀 학생 계정이 그대로 올라온다
           (실측: heyst·cys01·mby1…). 누가 학생인지는 예약(class_schedules)과 학생 명부
           (students_erp)를 봐야 알 수 있고, 그건 화면이 못 하는 일이다.
         ⛔ participant_names 를 그대로 쓰지 말 것 — 임시 접속번호가 섞여 있다.
         판정 정본·근거는 src/recording-students.ts. 실패해도 목록은 그대로 뜬다(빈 배열). */
      /* 🧑‍🏫 「교사」·「아이디」 칸 (2026-09-04 사장님 «교사 이름에 아이디가 나와»)
         [왜 서버가 푸나] 이 표의 `teacher_name` 은 «방을 먼저 켠 사람» 이고 `teacher_id` 는
           **DO 임시번호**(`u_…`, 실측 99.2%)다 — 둘 다 교사도 아이디도 아니다. 진짜 교사는
           예약(class_schedules)→원부(teachers)→계정(teacher_account_links)을 타야 나온다.
         판정 정본·근거는 src/recording-teacher.ts. 실패해도 목록은 그대로 뜬다(빈 값). */
      const _recRows = ((rs.results || []) as any[]);
      const _recStudents = await resolveRecordingStudents(env as any, _recRows);
      const _recTeachers = await resolveRecordingTeachers(env as any, _recRows);
      const _recItems = await Promise.all(_recRows.map(async (_raw: any, _si: number) => {
        /* ⛔ `participant_ids` 는 «판정 근거» 라서 SELECT 로 받지만 **응답에는 싣지 않는다**.
              그 배열은 곧 «누가 이 녹화를 재생할 수 있는가» 목록이고(recordings-r2.ts —
              `mango_token uid ∈ participant_ids` 면 재생 허용), 이 API 는 `/api/admin/` 접두사가
              **아니라서** 강사·지사·대리점 세션도 그대로 받는다(index.ts 의 스코프·강사 차단은
              그 접두사에만 걸린다). 화면은 이 칸을 안 쓰므로 여기서 끊는다 — 판정에 필요한 것과
              화면에 보내는 것은 다르다. */
        const { participant_ids: _pidForResolverOnly, ...row } = _raw;
        const students = _recStudents[_si] || [];
        const teacher  = _recTeachers[_si] || { uid: '', name: '', source: 'none' };
        // /api/recording/play 와 **같은** 판정 — 여기서 통과 못 하면 그 엔드포인트도 404 다.
        let key = String(row.file_url || '');
        if (!key && row.filename) {
          const fn = String(row.filename);
          key = (fn.startsWith('rec/') || fn.startsWith('recordings/')) ? fn : 'recordings/' + fn;
        }
        const st = String(row.storage || '');
        const playable = !!key && !/^https?:\/\//.test(key)
          && row.status !== 'deleted' && row.status !== 'upload_failed'
          && st !== 'r2_failed' && st !== 'error' && st !== 'debug'
          && !(row.expires_at && Number(row.expires_at) < _nowMs);
        if (!playable) return { ...row, students, teacher };
        const sig = await signRecDlSig(row.id, env);
        const qs = '?id=' + row.id + '&sig=' + encodeURIComponent(sig);
        return {
          ...row,
          students,
          teacher,
          // 저장 — Range 무시·200 전체 본문 + Content-Disposition (갤럭시 다운로드 실패 방지)
          dl_url: '/api/recording/play' + qs + '&dl=1',
          // 링크 — 사람에게 보내는 주소는 정본 도메인으로(SITE_ORIGIN, CLAUDE.md 0장)
          share_url: siteUrl('/api/recording/play' + qs),
          // 서명은 "만료ms.서명" 형식 — TTL 을 또 적지 않고 그 값을 그대로 읽는다(두 벌이면 어긋난다)
          share_expires_at: parseInt(String(sig).split('.')[0], 10) || 0,
        };
      }));

      // 응답 본문은 배열 그대로 유지 (하위 호환성). 페이지네이션 메타는 헤더로 전달.
      return new Response(JSON.stringify(_recItems), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'X-Total-Count, X-Offset, X-Limit',
          'X-Total-Count': String(total),
          'X-Offset':      String(offset),
          'X-Limit':       String(limit),
          'Cache-Control': 'no-store'
        }
      });
    }

    if (path.startsWith('/api/recordings/') && method === 'DELETE') {
      const id = parseInt(path.replace('/api/recordings/', ''), 10);
      if (!id) return json({ ok: false, error: 'invalid_id' }, 400);
      // 🔐 [무결성/파괴] 관리자만 녹화 삭제 — 미성년자 수업영상을 무인증 정수 id 열거로 삭제(은폐)하는 것을 차단 (2026-07-19 self-pentest).
      const rdAdmin = await checkAdminSession(request, env as any);
      if (!rdAdmin.ok) return json({ ok: false, error: 'auth_required' }, 401);
      await env.DB.prepare(`UPDATE recordings SET status = 'deleted' WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    // ===== 동의(Consent) =====
    if (path === '/api/consents' && method === 'POST') {
      const b = await parseJsonBody(request);
      if (!b || !b.user_id) return invalidBody(['user_id']);
      /* 🔐 (2026-08-12) 남의 이름으로 동의를 만들 수 없게 한다.
         예전엔 아무 검사가 없었다. 그때는 이 표가 아무 데도 안 쓰여서 티가 안 났지만,
         이제 이 값이 «녹화를 할지 말지» 를 정한다 — 위조가 되면 남의 아이 동의를 대신
         눌러 녹화를 켤 수 있고, 반대로 남의 동의를 «철회» 시켜 수업 녹화를 끌 수도 있다.
         출석과 같은 규칙을 쓴다(_attnSoftAuthOk): 자격증명이 있는데 그게 다른 uid 를
         가리킬 때만 거부한다. 자격증명이 아예 없는 요청은 예전처럼 통과시킨다 —
         여기서 조이면 로그인 없이 들어온 학생이 동의를 «남길 수조차» 없어진다.
         ℹ️ 여기의 user_id 는 «계정» 이다(mango-consent.js 가 getCurrentUser 의 uid 를 그 칸에 싣는다) —
            출석의 user_id(기기 식별자)와 이름만 같고 뜻이 다르다. 그래서 출석 호출부는 account_uid 를
            넘기고 여기는 user_id 를 넘긴다(2026-09-04, 헬퍼 주석). */
      if (!(await _attnSoftAuthOk(b.user_id, b))) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const now = Date.now();
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = request.headers.get('user-agent') || '';
      const res = await env.DB.prepare(
        `INSERT INTO consents (user_id, username, role, consent_version,
           recording_consent, voice_analysis_consent, attendance_consent, reward_consent, kakao_consent,
           guardian_required, guardian_status, guardian_contact,
           ip_address, user_agent, consented_at, raw_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        b.user_id, b.username || null, b.role || 'student', b.consent_version || 'v1.0',
        /* 🔐 (2026-09-01) 「안 물어봤다」와 「거절했다」를 갈라 적는다.
           그 전에는 둘 다 **0** 이었다. 그런데 동의 화면(js/mango-consent.js)은 recording·attendance
           만 묻고 voice_analysis·reward·kakao 는 **키 자체를 안 보낸다** → 그 셋은 구조적으로 늘 0.
           [잰 것] 2026-09-01 D1: consents 11행 — 녹화 7 · 출석 7 · **음성분석 0 · 보상 0 · 카카오 0**.
           그 0 을 읽는 쪽들이 「거절」로 읽고 있었다:
             · admin/student.html 이 빨간 «미동의» 배지를 띄워 **묻지도 않은 것을 거절했다고** 직원에게 말했다
             · retention.ts 가 그 값으로 kakao_ids 를 파기한다(매일 밤 도는 크론이다).
           [거기서 내린 판단 — 측정 아님] 카카오를 연결한 학생이 수업에 한 번 들어가 동의를 남기는
             순간(동의는 입장 때 자동으로 남는다) 그날 밤 연결이 지워졌을 것이다.
             ⚠️ 「지금까지 지워진 적이 없다」는 **증명할 수 없다** — 지워지면 흔적이 안 남는다.
                2026-09-01 현재 kakao_ids(50행)와 consents(11행) 사이에 겹치는 계정이 없다는 것까지가 잰 것이다.
           ⛔ 없는 값을 0 으로 채우지 말 것 — 이 저장소가 가장 오래 속은 방식이다(규칙서 2장).
           ⚠️ 화면이 그 항목을 묻기 시작해도 **이미 동의 행이 있는 사람에게는 다시 안 묻는다** —
              js/mango-consent.js 의 askedBefore() 가 행이 있으면 즉시 반환하고 consent_version 을
              비교하지 않는다. 그 사람들의 칸은 계속 NULL 로 남는다(다시 묻게 하려면 그쪽을 함께 고쳐야 한다). */
        b.recording ? 1 : 0,
        /* «== null» 은 undefined 와 명시적 null 을 함께 잡는다 — 둘 다 «모름» 이다. */
        b.voice_analysis == null ? null : (b.voice_analysis ? 1 : 0),
        b.attendance ? 1 : 0,
        b.reward == null ? null : (b.reward ? 1 : 0),
        b.kakao == null ? null : (b.kakao ? 1 : 0),
        b.guardian_required ? 1 : 0, b.guardian_status || (b.guardian_required ? 'pending' : 'not_required'), b.guardian_contact || null,
        ip, ua, now, JSON.stringify(b)
      ).run();
      return json({ ok: true, consent_id: res.meta.last_row_id, consented_at: now });
    }

    if (path.startsWith('/api/consents/') && method === 'GET') {
      const userId = decodeURIComponent(path.replace('/api/consents/', ''));
      // 🔐 [PII] 동의 이력(전화·IP·기기정보) 조회 차단 — 관리자 또는 본인 토큰만. [공용 헬퍼, strict=게스트 미허용]
      if (!['admin', 'self'].includes(await resolveOwnerScope(request, url, env as any, userId))) {
        return json({ ok: false, error: 'auth_required' }, 401);
      }
      const row = await env.DB.prepare(
        `SELECT * FROM consents WHERE user_id = ? AND withdrawn_at IS NULL
         ORDER BY consented_at DESC LIMIT 1`
      ).bind(userId).first();
      return json(row || null);
    }

    if (path === '/api/consents/withdraw' && method === 'POST') {
      const b = await request.json() as any;
      if (!b || !b.user_id) return invalidBody(['user_id']);
      // 🔐 철회도 본인만 — 남의 동의를 철회시키면 그 학생 수업의 녹화가 꺼진다(위와 같은 규칙. user_id = 계정).
      if (!(await _attnSoftAuthOk(b.user_id, b))) return json({ ok: false, error: 'uid_mismatch' }, 403);
      const now = Date.now();
      await env.DB.prepare(
        `UPDATE consents SET withdrawn_at = ? WHERE user_id = ? AND withdrawn_at IS NULL`
      ).bind(now, b.user_id).run();
      return json({ ok: true, withdrawn_at: now });
    }

    // (🔥 Phase ST 스트릭 → api-games.ts — 3차 이동)


    // (🤖 AW 영작+CF 친구챗 8매처 → api-ai.ts — 25차)


    // (📅 Phase WD 위클리 다이제스트 → api-students.ts — 4차 이동)


    // (🧠 Phase ML 은 api-games.ts 로 이동 — 위 Phase VOC 위임 지점에서 함께 처리)


    // (🎙 Phase ALR AI 학습리포트 → api-lessons.ts — 28차)


    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase RT — WebRTC 화상강의실 JWT 입장 토큰 (안전 모듈)
    //   기존 SignalingRoom DO 와 충돌 없음 — 신규 테이블·라우트만 추가
    //   사용 흐름: 학생 → /join → JWT 발급 → (옵션) 시그널링 연결 시 검증
    // ═══════════════════════════════════════════════════════════════
    const ensureRoomTokenSchema = async () => {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_members (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT, role TEXT NOT NULL, invited_at INTEGER NOT NULL, invited_by TEXT, UNIQUE(room_id, user_id));`);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS room_tokens (jti TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER DEFAULT 0, consumed_at INTEGER, ip TEXT, user_agent TEXT);`);
      await env.DB.exec(`CREATE INDEX IF NOT EXISTS idx_room_tokens_room ON room_tokens(room_id, expires_at);`);
    };

    // ── JWT 유틸 (Web Crypto API, HS256) ──
    const b64urlEnc = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const b64urlDec = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const getRoomSecret = (): string => {
      // 우선 secret(ROOM_JWT_SECRET) → 없으면 강한 상수 폴백(공개 BUILD_STAMP 사용 금지, 2026-07-12 보안)
      // ⚠️ 운영 환경에서는 반드시 `npx wrangler secret put ROOM_JWT_SECRET --env production` 으로 설정
      //   폴백 상수는 auth-token.ts / api-mango 8713 / signaling-room.ts 와 동일해야 방JWT 상호검증됨.
      return (env as any).ROOM_JWT_SECRET || 'mgi-fb-d0895a3a232c5ef0f0950c6128a04a5311ec69ba142cb4a86a8d334e33c56f30';
    };

    const signRoomJWT = async (payload: any): Promise<string> => {
      const enc = new TextEncoder();
      const header = b64urlEnc(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const body = b64urlEnc(JSON.stringify(payload));
      const data = `${header}.${body}`;
      const key = await crypto.subtle.importKey('raw', enc.encode(getRoomSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
      const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `${data}.${sigB64}`;
    };

    const verifyRoomJWT = async (token: string): Promise<any | null> => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [h, p, s] = parts;
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', enc.encode(getRoomSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
        const sigBytes = Uint8Array.from(b64urlDec(s), c => c.charCodeAt(0));
        const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(`${h}.${p}`));
        if (!ok) return null;
        const payload = JSON.parse(b64urlDec(p));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
      } catch { return null; }
    };

    // 🔐 [보안 2026-07-27] 방 관리 액션(invite·kick·members) 공용 게이트.
    //   그동안 이 셋은 **인증이 한 줄도 없었다** — room_id 만 알면 누구나 진행 중인 수업에서
    //   참가자를 강제 퇴장시키거나(kick) 참가자 이름·아이디를 조회할 수 있었다(members).
    //   호출처를 전수 확인한 결과 셋 다 관리자 콘솔뿐이라(adm-s2.js · admin/ghost-view.html)
    //   관리자 세션을 요구해도 회귀가 없다.
    //   ⚠️ 강사가 자기 수업에서 직접 kick 하는 동선을 나중에 만들면, 여기서 관리자 세션 대신
    //      '이 방의 role=teacher 짜리 room JWT' 도 허용하도록 확장할 것(지금은 그 호출처가 없다).
    const _requireAdminForRoom = async (): Promise<Response | null> => {
      const _s = await checkAdminSession(request, env as any);
      if (_s.ok) return null;
      return json({ ok: false, error: 'auth_required' }, 401);
    };

    // ── POST /api/rooms/:room_id/invite — 강사가 학생 초대 (사전 권한 등록) ──
    const inviteMatch = path.match(/^\/api\/rooms\/([^\/]+)\/invite$/);
    if (method === 'POST' && inviteMatch) {
      const _deny = await _requireAdminForRoom(); if (_deny) return _deny;
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(inviteMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      const userName = String(b.user_name || '').trim();
      const role = String(b.role || 'student').trim();
      const invitedBy = String(b.invited_by || '').trim();
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);
      if (!['teacher', 'student', 'observer'].includes(role)) return json({ ok: false, error: 'invalid_role' }, 400);
      const now = Date.now();
      try {
        await env.DB.prepare(
          `INSERT INTO room_members (room_id, user_id, user_name, role, invited_at, invited_by) VALUES (?,?,?,?,?,?) ON CONFLICT(room_id, user_id) DO UPDATE SET role=excluded.role, user_name=excluded.user_name`
        ).bind(roomId, userId, userName || null, role, now, invitedBy || null).run();
        return json({ ok: true, room_id: roomId, user_id: userId, role });
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // ── POST /api/rooms/:room_id/join — 입장 요청 → 단기 JWT 발급 ──
    const joinMatch = path.match(/^\/api\/rooms\/([^\/]+)\/join$/);
    if (method === 'POST' && joinMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(joinMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const userId = String(b.user_id || '').trim();
      if (!userId) return json({ ok: false, error: 'user_id_required' }, 400);

      // 사전 등록(invite) 확인
      const member: any = await env.DB.prepare(
        `SELECT role, user_name FROM room_members WHERE room_id = ? AND user_id = ?`
      ).bind(roomId, userId).first();

      // 사전 등록 없으면 → 기존 학생 인증 정보 폴백 (옵션 b.allow_open=true)
      let role = member?.role;
      if (!role) {
        if (b.allow_open === true) {
          // 🔐 [보안 2026-07-27] 폴백 경로에서는 **role 을 클라이언트가 못 정한다**.
          //   과거엔 body.role 을 그대로 믿어서, 아무나 {allow_open:true, role:'teacher'} 로
          //   교사 권한 방 토큰을 발급받을 수 있었다(권한 상승). 폴백은 항상 student 로 고정.
          //   호출처 확인: index.html:11463 · adm-s2.js:53 둘 다 student → 회귀 0.
          //   ⚠️ 폴백 자체(초대 없이 발급)를 없애면 수업 입장이 막힐 수 있어 지금은 유지한다.
          //      제거하려면 예약 테이블 대조로 서버가 판단하도록 먼저 바꿀 것.
          role = 'student';
        } else {
          return json({ ok: false, error: 'not_invited', message: '이 강의실에 사전 등록되지 않았습니다. 강사에게 초대를 요청하세요.' }, 403);
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const ttl = Number(b.ttl_sec) || 300;            // 기본 5분, 길게 원하면 b.ttl_sec
      const jti = crypto.randomUUID().replace(/-/g, '');
      const payload = {
        iss: 'mangoi',
        sub: userId,
        aud: `room:${roomId}`,
        role,
        iat: now,
        exp: now + ttl,
        jti,
      };
      const token = await signRoomJWT(payload);

      // DB 에 발급 기록 (회수·1회용 검증 가능)
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ua = (request.headers.get('user-agent') || '').slice(0, 255);
      try {
        await env.DB.prepare(
          `INSERT INTO room_tokens (jti, room_id, user_id, role, issued_at, expires_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)`
        ).bind(jti, roomId, userId, role, now * 1000, (now + ttl) * 1000, ip || null, ua || null).run();
      } catch (e: any) { console.error('[room/join] token save:', e?.message); }

      return json({
        ok: true,
        room_token: token,
        room_id: roomId,
        role,
        user_name: member?.user_name || '',
        expires_in: ttl,
        jti,
      });
    }

    // ── POST /api/rooms/:room_id/verify-token — 토큰 검증 (시그널링 연결 전) ──
    const verifyMatch = path.match(/^\/api\/rooms\/([^\/]+)\/verify-token$/);
    if (method === 'POST' && verifyMatch) {
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(verifyMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const token = String(b.token || '').trim();
      if (!token) return json({ ok: false, error: 'token_required' }, 400);

      const payload = await verifyRoomJWT(token);
      if (!payload) return json({ ok: false, error: 'invalid_or_expired' }, 401);
      if (payload.aud !== `room:${roomId}`) return json({ ok: false, error: 'wrong_room' }, 403);

      // DB 회수 여부 + 1회용 사용 마킹
      const tok: any = await env.DB.prepare(
        `SELECT revoked, consumed_at FROM room_tokens WHERE jti = ?`
      ).bind(payload.jti).first();
      if (!tok) return json({ ok: false, error: 'unknown_jti' }, 401);
      if (tok.revoked) return json({ ok: false, error: 'revoked' }, 401);
      if (tok.consumed_at && b.allow_reuse !== true) return json({ ok: false, error: 'already_used' }, 401);
      if (!tok.consumed_at) {
        try {
          await env.DB.prepare(`UPDATE room_tokens SET consumed_at = ? WHERE jti = ?`)
            .bind(Date.now(), payload.jti).run();
        } catch {}
      }
      return json({ ok: true, room_id: roomId, user_id: payload.sub, role: payload.role, jti: payload.jti });
    }

    // ── POST /api/rooms/:room_id/kick — 강제 퇴장 (토큰 회수) ──
    const kickMatch = path.match(/^\/api\/rooms\/([^\/]+)\/kick$/);
    if (method === 'POST' && kickMatch) {
      const _deny = await _requireAdminForRoom(); if (_deny) return _deny;
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(kickMatch[1]);
      const b: any = await request.json().catch(() => ({}));
      const targetUid = String(b.user_id || '').trim();
      if (!targetUid) return json({ ok: false, error: 'user_id_required' }, 400);
      await env.DB.prepare(
        `UPDATE room_tokens SET revoked = 1 WHERE room_id = ? AND user_id = ? AND revoked = 0`
      ).bind(roomId, targetUid).run();
      return json({ ok: true, room_id: roomId, user_id: targetUid });
    }

    // ── GET /api/rooms/:room_id/members — 초대된 학생/강사 목록 ──
    const membersMatch = path.match(/^\/api\/rooms\/([^\/]+)\/members$/);
    if (method === 'GET' && membersMatch) {
      const _deny = await _requireAdminForRoom(); if (_deny) return _deny;
      await ensureRoomTokenSchema();
      const roomId = decodeURIComponent(membersMatch[1]);
      const rs: any = await env.DB.prepare(
        `SELECT user_id, user_name, role, invited_at, invited_by FROM room_members WHERE room_id = ? ORDER BY role DESC, invited_at ASC`
      ).bind(roomId).all();
      return json({ ok: true, room_id: roomId, items: rs.results || [] });
    }
    // ═══════════════════════════════════════════════════════════════
    // 🔐 Phase RT 끝
    // ═══════════════════════════════════════════════════════════════


    // (👁 Phase GM 관리자통제·구독·가족·동문회·NPS 등 → api-admin.ts — 23차)


    // [Phase VDI] - AI Voice Diary → api-diary.ts 로 분리 (docs/REFACTOR_PLAN.md 1단계)
    if (path.startsWith('/api/diary/')) {
      const rDiary = await handleDiaryApi(request, url, env);
      if (rDiary) return rDiary;
    }

    // [Phase MT] - Mini TOEIC 자체 영어 시험 → api-exam.ts (2026-07-13 백엔드 신규 구현)
    if (path.startsWith('/api/exam/') || path === '/api/admin/exams' || path.startsWith('/api/admin/exam/')) {
      const rExam = await handleExamApi(request, url, env);
      if (rExam) return rExam;
    }

    // 📟 UptimeRobot 장애 웹훅 → 관리자 문자 (api-uptime.ts)
    if (path === '/api/uptime-hook') {
      const rHook = await handleUptimeApi(request, url, env);
      if (rHook) return rHook;
    }

    // [Phase SUP] - Teacher Supervisor Mode
    //   - Mentor teacher observes junior teacher's class via Ghost view + sends real-time guidance
    //   - Piggybacks on existing ghost-view.html + GM-Whisper infra
    if (path === '/api/supervisor/assign' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.mentor_uid || !body.junior_uid) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO supervisor_assignments (mentor_uid, junior_uid, room_id, status, start_at, end_at, created_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(String(body.mentor_uid), String(body.junior_uid), body.room_id || '', 'active', now, null, now).run();
        return json({ ok: true, assignment_id: result?.meta?.last_row_id, start_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_assign_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/active' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const mentorUid = url.searchParams.get('mentor_uid');
        if (!mentorUid) return json({ ok: false, error: 'missing_mentor_uid' }, 400);
        const rs = await env.DB.prepare(`SELECT * FROM supervisor_assignments WHERE mentor_uid = ? AND status = 'active' ORDER BY start_at DESC`).bind(mentorUid).all();
        return json({ ok: true, assignments: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_active_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/note' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.assignment_id || !body.message) return json({ ok: false, error: 'missing_fields' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        const now = Date.now();
        const result: any = await env.DB.prepare(`INSERT INTO supervisor_notes (assignment_id, mentor_uid, junior_uid, room_id, message, priority, acknowledged, created_at) VALUES (?,?,?,?,?,?,0,?)`)
          .bind(
            Number(body.assignment_id),
            String(body.mentor_uid || ''),
            String(body.junior_uid || ''),
            body.room_id || '',
            String(body.message),
            body.priority || 'normal',
            now
          ).run();
        return json({ ok: true, note_id: result?.meta?.last_row_id, created_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_note_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/notes/incoming' && method === 'GET') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        const juniorUid = url.searchParams.get('junior_uid');
        if (!juniorUid) return json({ ok: false, error: 'missing_junior_uid' }, 400);
        const rs = await env.DB.prepare(`SELECT * FROM supervisor_notes WHERE junior_uid = ? AND acknowledged = 0 ORDER BY created_at DESC LIMIT 50`).bind(juniorUid).all();
        return json({ ok: true, notes: rs.results || [] });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_incoming_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/note/ack' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.note_id) return json({ ok: false, error: 'missing_note_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, assignment_id INTEGER, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, message TEXT, priority TEXT DEFAULT 'normal', acknowledged INTEGER DEFAULT 0, created_at INTEGER);`);
        await env.DB.prepare('UPDATE supervisor_notes SET acknowledged = 1 WHERE id = ?').bind(Number(body.note_id)).run();
        return json({ ok: true, acknowledged_at: Date.now() });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_ack_failed' }, 500);
      }
    }

    if (path === '/api/supervisor/end' && method === 'POST') {
      try {
        const body = await parseJsonBody(request);
        if (!body || !body.assignment_id) return json({ ok: false, error: 'missing_assignment_id' }, 400);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);`);
        const now = Date.now();
        await env.DB.prepare(`UPDATE supervisor_assignments SET status = 'ended', end_at = ? WHERE id = ?`).bind(now, Number(body.assignment_id)).run();
        return json({ ok: true, ended_at: now });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'supervisor_end_failed' }, 500);
      }
    }

    // ════════════════════════════════════════════════════════════
    // 📊 월간 NPS 설문 (Net Promoter Score) — stats / send / respond
    // (💚 NPS + 🔁 구독결제 route-group → api-admin.ts — 26차)

    // No matching route in this handler
    return null;
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'mango_api_unhandled' }, 500);
  }
}
