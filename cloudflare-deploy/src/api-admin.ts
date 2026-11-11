import { handleAdminClassDaysApi } from './api-admin-class-days';
import { handleAdminFeedbackDraftsApi } from './api-admin-feedback-drafts';
import { handleAdminSchedulingApi } from './api-admin-scheduling';
import { handleAdminStudentRosterApi } from './api-admin-student-roster';
import { handleAdminControlsApi } from './api-admin-controls';
import { handleAdminBriefingApi } from './api-admin-briefing';
import { handleAdminFamiliesApi } from './api-admin-families';
import { handleAdminInquiriesApi } from './api-admin-inquiries';
import { handleAdminBugReportsApi } from './api-admin-bug-reports';
import { handleAdminSubscriptionsApi } from './api-admin-subscriptions';
import { handleAdminLibraryApi } from './api-admin-library';
import { handleAdminClassMonitorApi } from './api-admin-class-monitor';
import { handleAdminVideoCatalogApi } from './api-admin-video-catalog';
import { handleAdminSchoolAttendanceApi } from './api-admin-school-attendance';
import { handleAdminTeacherContactsApi } from './api-admin-teacher-contacts';
import { handleAdminReferralsApi } from './api-admin-referrals';
import { handleAdminCounselingApi } from './api-admin-counseling';
import { handleAdminTeachersApi } from './api-admin-teachers';
import { handleAdminAnnouncementsApi } from './api-admin-announcements';
import { handleAdminPaymentsApi } from './api-admin-payments';
import { handleAdminStudentAnalysisApi } from './api-admin-student-analysis';
import { handleAdminTeacherFeedbackApi } from './api-admin-teacher-feedback';
import { handleAdminRetentionApi } from './api-admin-retention';
import { handleAdminOrganizationsApi } from './api-admin-organizations';
import { handleAdminLeveltestApi } from './api-admin-leveltest';
import { handleAdminEnrollmentsApi } from './api-admin-enrollments';
import { handleAdminPayrollApi } from './api-admin-payroll';
export type { Cafe24TeacherInfo } from './admin-teacher-core';
import { handleAdminStatsApi } from './api-admin-stats';
import { admCacheHit, admCachePut } from './admin-cache';
import { counselingRecipient, sendCounselingSms } from './counseling-send';
// 관리자 API의 순서 있는 진입점. 기능별 본문은 api-admin-*.ts에 둔다.
// 인증: /api/admin/*은 index.ts의 default-deny 게이트를 그대로 거친다.
// 각 모듈은 일치하는 요청에만 응답하며, 미일치면 null을 반환해 다음 라우트로 이어진다.
// SQL·정산 정책·역할 제한은 분리 전과 같고, 교재 스트림에는 ctx를 전달한다.
// 공용 계산: admin-teacher-core.ts / admin-lesson-fees.ts.
// 공용 기록·캐시: admin-audit.ts / admin-cache.ts.
import { json, parseJsonBody, invalidBody, today } from './api-util';
import { forbiddenTeacherBody } from './forbidden-teacher';   // 🪪 「강사 권한으로는 …」 문구 정본(계정 이름 포함) — 복제 금지
import { loadRevenue, loadCare, saveCare } from './forecast-dashboard';
import { lastContacts } from './care-contact'; // 📞 이탈 케어 연락 기록 정본
import { notSeedSql } from './accounting-reports';   // 🌱 시연용 시드 결제 제외 — 리포트와 같은 조건을 쓴다
import { selectInChunks } from './d1-chunk';
import { DEFAULT_CLASS_MINUTES } from './class-policy'; // 기본 20분 · 허용 길이 · 급여용 10분 토막 수
/* 💰 (2026-08-26 사장님 지시) 「수업 시간 배수대로 수강료도 자동 계산」 — 곱하는 곳은 저장하는 순간 딱 한 번이다.
   규칙 정본은 src/enroll-fee.ts 하나뿐(두 곳에 두면 «두 번 곱하기» 로 40분이 4배가 된다). */
/* 🔗 미연장 안내 문자에 넣는 «그 학생 전용» 1회용 연장 링크. 학부모 폰에 학생 로그인이
      없어도 열리게 하는 좁은 권한이다 — 로그인이 아니다(renew-link.ts 머리말 참고). */
import { loadTextbookChoices } from './student-placement'; // 🎯 레벨테스트 결과 → 학생 교재 레벨(1단계 배선)
import { studentScopeWhere } from './scope'; // 🔒 지사/대리점 데이터 격리
import { runCypher, Neo4jNotConfiguredError } from './teacher-match';  // 🕸️ Neo4j 그래프
import { KCP_TRANSFER_CYPHER_RE, KCP_REVENUE_CYPHER_RE } from './accounting-reports';  // 🧾 「케이씨피M」(운영자금 이체) = 매출 아님 / 「케이씨피」 = 매출 인정 — 판정 정본
import { c24ExpenseDrop, C24_HANGUL_CYPHER_RE, C24_LETTER_CYPHER_RE } from './c24-expense-filter';  // 🧾 카페24 지출결의 중 «우리 것이 아닌» 건(한글 결재·특정 결재라인) 제외 — 판정 정본
import { importCafe24Org, importCafe24Payments, importCafe24Attendance } from './cafe24-sync';
import { LIVE_AVG_SQL, LIVE_ROLE_SQL, attachRoleSplit } from './vc-quality-live';   // 📶 관제탑 회선 칸 «강사 / 학생» 나눔(2026-11-03)
import { runAbsentStudentSweep } from './absent-sweep';            // 🚨 결석 위험 자동 알림
import { runRecordingFinalizeSweep } from './recordings-r2';       // 🛟 버려진 녹화 자동 마무리
import { runLessonReminderSweep } from './lesson-reminder';        // 📣 수업 전 리마인더
import { getAdminActor, isOrgScopedRole } from './auth-admin';
import { orgScopeVerdict, readScopeType, orgScopeDenyResponse } from './org-scope-guard';
import { corpcardConfigured, runCorpCardSync, corpcardData, corpcardStatus, secretFp8, CODEF_SANDBOX_BASE } from './corpcard-sync';  // 💳 법인카드 CODEF 연동
import { barobillConfigured, baroMissing, runBarobillSync, baroCreds } from './barobill-sync';  // 💳 법인카드 바로빌 연동(2026-08-14 CODEF 월 80만원 → 월 3,300원)
import { bankConfigured, bankMissing, runBankSync, bankacctData, bankacctStatus } from './bankacct-sync';  // 🏦 신한은행 계좌 입출금 — 바로빌 계좌조회(2026-08-14)
import { handleTeacherKakaoApi } from './teacher-kakao';                     // 💬 강사 카카오ID 명부 + 전달
import type { MangoEnv } from './api-mango';

export async function handleAdminApi(
  request: Request,
  url: URL,
  env: MangoEnv,
  ctx?: ExecutionContext   // 📚 교재 /raw 엣지 캐시(waitUntil) 전달용 — 선택적(하위호환)
): Promise<Response | null> {
  const path = url.pathname;
  const method = request.method;

    // ════════════════════════════════════════════════════════════
    // 💬 강사 카카오ID 명부 + 강사에게 메시지 전달 (2026-08-13)
    //   ⚠️ 이 위임은 «/api/admin/teachers/:id» PATCH 보다 먼저 와야 한다 —
    //      아래 라우팅은 숫자 id 만 받으므로 'kakao' 와는 겹치지 않지만,
    //      순서를 바꾸면 나중에 와일드카드가 생겼을 때 조용히 가려진다.
    // ════════════════════════════════════════════════════════════
    if (path.startsWith('/api/admin/teachers/kakao')) {
      const r = await handleTeacherKakaoApi(request, url, env as any);
      if (r) return r;
    }

    // ════════════════════════════════════════════════════════════
    // 📶 화상수업 회선품질 — 강사/학생별 손실·RTT 집계 (어느 강사 인터넷이 나쁜지 파악)
    // ════════════════════════════════════════════════════════════
    if (method === 'GET' && path === '/api/admin/vc/quality') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_quality (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, room TEXT, uid TEXT, name TEXT, role TEXT, avg_loss REAL, max_loss REAL, avg_rtt REAL, aao INTEGER, samples INTEGER)`);
        /* 📶 (2026-08-30) live=1 — «지금 이 방» 의 회선 신호. 수업 관제탑이 방마다 신호등으로 그린다.
           [왜 방 단위인가] 위 기본 집계는 «어느 강사 인터넷이 나쁜가»(uid·7일)를 보는 눈이고,
              관제탑은 «지금 이 수업이 흔들리고 있나»(room·최근 몇 분)를 봐야 한다. 같은 표에서
              묶는 축만 다르다 — 새 표를 만들지 않는다.
           ⚠️ avg_loss 가 음수인 행은 «영상이 없던 틱»(loss = -1 로 넘어온 것)이라 평균에서 뺀다.
              넣으면 영상이 죽은 사람이 «회선이 제일 좋은 사람» 으로 뒤집힌다(CLAUDE.md 2장).
              ℹ️ (2026-11-03 코드 확인) 지금 화면(js/idx-vc-qlog.js)은 음수를 안 보낸다 — 영상 표본이 없던
                 1분은 avg_loss 0 · samples 0 · avg_rtt 0 으로 온다. 그래서 이 조건은 사실상 아무것도 안 거른다.
              ✅ (2026-11-03 사장님 「방 단위 값도 표본 없는 1분 빼고」) 평균은 LIVE_AVG_SQL(samples > 0 · avg_rtt > 0
                 만)로, 최악 손실도 samples > 0 인 1분만 본다. 표본이 하나도 없으면 null(«모름») → 화면은 «—».
                 windows 는 «기록된 1분 수» 그대로 센다(표본 없는 1분 포함).
           ⚠️ novideo 칸은 ALTER 로 나중에 붙은 것이라 첫 로그 전에는 없다 — 여기서 읽지 않는다. */
        if (url.searchParams.get('live') === '1') {
          const mins = Math.max(1, Math.min(60, parseInt(url.searchParams.get('mins') || '5', 10) || 5));
          const liveSince = Date.now() - mins * 60000;
          const lr: any = await env.DB.prepare(
            `SELECT room, COUNT(*) AS windows,
                    ${LIVE_AVG_SQL},
                    ROUND(MAX(CASE WHEN samples > 0 THEN max_loss END), 1) AS worst_loss, MAX(ts) AS last_ts
               FROM vc_quality
              WHERE ts >= ? AND room IS NOT NULL AND room <> '' AND avg_loss >= 0
              GROUP BY room ORDER BY avg_loss DESC LIMIT 200`
          ).bind(liveSince).all();
          /* 👥 (2026-11-03) 강사·학생으로 나눈 값 — 정본 src/vc-quality-live.ts.
             ⚠️ 실패해도 방 단위 값은 그대로 나간다(by_role 만 빠짐 → 관제탑은 예전 한 줄로 그린다). */
          let roleRows: any[] = [];
          try { roleRows = ((await env.DB.prepare(LIVE_ROLE_SQL).bind(liveSince).all()) as any).results || []; }
          catch (e: any) { console.warn('[vc-quality live] 역할별 집계 실패', e?.message); }
          return json({ ok: true, mins, rooms: attachRoleSplit(lr.results || [], roleRows) });
        }
        const days = Math.max(1, Math.min(90, parseInt(url.searchParams.get('days') || '7', 10) || 7));
        const since = Date.now() - days * 86400000;

        /* 🌐 (2026-09-03) by=net — «사람» 이 아니라 «인터넷 회선» 으로 묶어 본다.
           [왜] 필리핀 사무실은 강사 약 10명이 공인 IP 하나를 나눠 쓴다(admin_login_history 실측).
              사람별 표로는 «그 회선이 매일 몇 시에 막히는가» 를 볼 수 없어서, 통신사에 항의할
              근거를 만들 수 없었다. 같은 표에서 묶는 축만 바꾼다 — 새 표를 만들지 않는다.
           ⚠️ net·isp·country 는 ALTER 로 붙는다 = 첫 로그가 들어와야 생긴다. 없는 DB 에서는
              `no such column` 으로 죽으므로 «아직 수집 전» 이라고 정직하게 답한다.
              ⛔ 화면 전체를 «조회 실패» 로 만들지 말 것(rx_ready 와 같은 사정).
           ⚠️ 손실 평균에서 avg_loss < 0 인 행(영상 없던 틱)은 뺀다 — 넣으면 영상이 죽은 회선이
              «제일 좋은 회선» 으로 뒤집힌다(CLAUDE.md 2장). */
        if (url.searchParams.get('by') === 'net') {
          const one = String(url.searchParams.get('net') || '').slice(0, 60);
          /* 시간대별 — 한 회선을 골랐을 때. KST 기준 «몇 시» 로 묶는다(통신사와 이야기할 때 쓰는 시각). */
          const HOURLY = `strftime('%H', ts/1000, 'unixepoch', '+9 hours') AS hour,
                    COUNT(*) AS windows, COUNT(DISTINCT uid) AS people,
                    ROUND(AVG(avg_rtt)) AS avg_rtt, ROUND(MAX(avg_rtt)) AS worst_rtt,
                    ROUND(AVG(CASE WHEN avg_loss >= 0 THEN avg_loss END), 1) AS avg_loss,
                    ROUND(AVG(CASE WHEN rx_conceal >= 0 THEN rx_conceal END), 1) AS rx_conceal,
                    SUM(aao) AS aao_events`;
          const LINES = `net, MAX(isp) AS isp, MAX(country) AS country,
                    COUNT(*) AS windows, COUNT(DISTINCT uid) AS people,
                    ROUND(AVG(avg_rtt)) AS avg_rtt, ROUND(MAX(avg_rtt)) AS worst_rtt,
                    ROUND(AVG(CASE WHEN avg_loss >= 0 THEN avg_loss END), 1) AS avg_loss,
                    ROUND(AVG(CASE WHEN p95_loss >= 0 THEN p95_loss END), 1) AS p95_loss,
                    ROUND(AVG(CASE WHEN rx_conceal >= 0 THEN rx_conceal END), 1) AS rx_conceal,
                    SUM(COALESCE(rx_freeze, 0)) AS rx_freeze, SUM(aao) AS aao_events,
                    MAX(ts) AS last_seen,
                    COUNT(DISTINCT CASE WHEN rx_conceal >= 5 OR avg_loss >= 3 THEN date(ts/1000, 'unixepoch', '+9 hours') END) AS bad_days`;
          /* 🔴 「나쁜날」을 «RTT 절대값» 으로 세지 않는다.
             필리핀·중국 회선은 **평소가 360~440ms** 라(2026-09-02 class-849 · 09-03 class-1016 실측)
             400ms 절대값으로 세면 이 화면이 겨냥한 바로 그 회선이 **매일 7/7 로 빨갛게** 켜진다
             = 늘 켜진 경고가 진짜 경고를 덮는다(CLAUDE.md 2장 «절대값 문턱» 항목 두 개).
             ⟹ «실제로 수업이 상했나» 를 재는 축으로 센다 — 소리가 끊겨 메워진 비율(rx_conceal)과
                손실(avg_loss). 둘 다 «나쁜» 신호라 절대값이 맞다(RTT 만 «막힘» 이라 상대값이 맞다).
             ℹ️ 사람별 표도 같은 이유로 avg_loss >= 3 을 쓴다. RTT 는 표에 숫자로 그대로 보인다.
             ⚠️ rx_conceal 이 «모름»(-1)인 행은 >= 5 에 안 걸려 저절로 빠진다. */
          try {
            if (one) {
              const hr: any = await env.DB.prepare(
                `SELECT ${HOURLY} FROM vc_quality WHERE ts >= ? AND net = ? GROUP BY hour ORDER BY hour`
              ).bind(since, one).all();
              const who: any = await env.DB.prepare(
                `SELECT uid, MAX(name) AS name, role, COUNT(*) AS windows, ROUND(AVG(avg_rtt)) AS avg_rtt
                   FROM vc_quality WHERE ts >= ? AND net = ? GROUP BY uid, role ORDER BY avg_rtt DESC LIMIT 50`
              ).bind(since, one).all();
              return json({ ok: true, days, net: one, hours: hr.results || [], people: who.results || [] });
            }
            const ls: any = await env.DB.prepare(
              `SELECT ${LINES} FROM vc_quality
                WHERE ts >= ? AND net IS NOT NULL AND net <> ''
                GROUP BY net ORDER BY avg_rtt DESC LIMIT 100`
            ).bind(since).all();
            return json({ ok: true, days, net_ready: true, lines: ls.results || [] });
          } catch {
            /* ⚠️ 여기로 떨어지는 이유는 «칸이 아직 없다» 가 흔하지만 그것만은 아니다 — 어떤 D1 오류·
               타임아웃도 같은 곳으로 온다. 잰 것은 «그 질의가 실패했다» 까지다.
               ⛔ 화면이 원인을 단정하게 두지 말 것(CLAUDE.md 2장 「추론을 단정으로 적었음」). */
            return json({ ok: true, days, net_ready: false, lines: [], hours: [], people: [] });
          }
        }

        const BASE = `uid, MAX(name) AS name, role, COUNT(*) AS windows,
                  ROUND(AVG(avg_loss), 1) AS avg_loss, ROUND(MAX(max_loss), 1) AS worst_loss,
                  ROUND(AVG(avg_rtt)) AS avg_rtt, SUM(aao) AS aao_events, MAX(ts) AS last_seen`;
        /* 📥 (2026-09-01) «받는 쪽» 지표를 함께 낸다 — 이 화면이 여태 «내가 보내는 것» 만 보여 줬다.
           ⚠️ «모름» 은 -1 로 들어온다. 그대로 평균 내면 모름이 «손실 -1%» 로 섞여 숫자가 뒤집히므로
              0 이상인 행만 센다(CASE WHEN). 표본이 하나도 없으면 NULL 이고 화면은 «—» 로 그린다.
           ⚠️ 이 칸들은 ALTER 로 붙는다 — 첫 로그가 들어와야 생긴다(novideo·attendance.host 와 같은 사정).
              그래서 없는 DB(개발용·복구본)에서는 이 질의가 `no such column` 으로 죽는다.
              그때는 옛 질의로 떨어진다. ⛔ 화면 전체가 «조회 실패» 가 되게 두지 말 것. */
        /* 🔔 (2026-09-01 사장님 「박주형 학생 회선 문제는 어떻게 알려주지?」)
           이 화면이 uid 만 보여 줘서 «juju5731» 이 누구인지 알 수 없었다 — 연락하려면 사람 이름이 필요하다.
           ⚠️ 자동 문자·알림톡은 불가능하다(학생 29,461명 전원 번호 0건, D1 실측). 그래서 이 화면이
              «사람이 보고 연락하는» 유일한 자리다. 실명과 소속 매장을 함께 낸다.
           ⚠️ students_erp 에는 `id` 칸이 없다 — PRIMARY KEY 는 user_id 다(CLAUDE.md 2장).
           ⚠️ LOWER() 로 맞추지 말 것 — 그러면 인덱스를 못 타 200행 × 29,461행 전수 스캔이 된다
              (같은 실수로 4.3초 / 2,348만 행을 읽던 자리가 있었다). 정확일치로 두고, 못 찾으면 빈 값이다.
           ⚠️ 서브쿼리로 붙인다 — LEFT JOIN 은 짝이 둘이면 행이 늘어난다(강사 명부에서 실제로 밟은 사고). */
        const WHO = `(SELECT e.korean_name FROM students_erp e WHERE e.user_id = q.uid) AS student_name,
                  (SELECT e.shop_name  FROM students_erp e WHERE e.user_id = q.uid) AS shop_name,
                  COUNT(DISTINCT CASE WHEN avg_loss >= 3 THEN date(ts/1000, 'unixepoch', '+9 hours') END) AS bad_days`;
        const RICH = `${BASE}, ${WHO},
                  ROUND(AVG(CASE WHEN p95_loss >= 0 THEN p95_loss END), 1) AS p95_loss,
                  ROUND(AVG(CASE WHEN rx_loss   >= 0 THEN rx_loss   END), 1) AS rx_loss,
                  ROUND(AVG(CASE WHEN rx_aloss  >= 0 THEN rx_aloss  END), 1) AS rx_aloss,
                  ROUND(AVG(CASE WHEN rx_conceal >= 0 THEN rx_conceal END), 2) AS rx_conceal,
                  SUM(COALESCE(rx_freeze, 0)) AS rx_freeze, MAX(COALESCE(peers, 0)) AS peers,
                  SUM(COALESCE(relay_ticks, 0)) AS relay_ticks, SUM(COALESCE(path_ticks, 0)) AS path_ticks,
                  MAX(CASE WHEN COALESCE(turn, '') <> '' THEN turn END) AS turn`;
        /* 🛰 relay_ticks/path_ticks — 중계(TURN)로 간 틱 / 경로를 «안» 틱. path_ticks 가 0 이면 «모름»(화면은 —).
           ⛔ 0/0 을 «직접 100%» 로 그리지 말 것. turn 은 그 기간에 본 TURN 서버 중 하나(대개 한 가지다). */
        let rs: any = null, rx_ready = true;
        try {
          rs = await env.DB.prepare(
            `SELECT ${RICH} FROM vc_quality q WHERE ts >= ? GROUP BY uid, role ORDER BY avg_loss DESC LIMIT 200`
          ).bind(since).all();
        } catch {
          rx_ready = false;
          rs = await env.DB.prepare(
            `SELECT ${BASE}, ${WHO} FROM vc_quality q WHERE ts >= ? GROUP BY uid, role ORDER BY avg_loss DESC LIMIT 200`
          ).bind(since).all();
        }
        return json({ ok: true, days, rx_ready, rows: rs.results || [] });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'vc_quality_failed' }, 500); }
    }

    // ════════════════════════════════════════════════════════════
    // 🔁 화상수업 «중계(TURN) 강제» — 강사별 on/off
    //   GET  /api/admin/vc/relay            → 지정된 강사 목록
    //   POST /api/admin/vc/relay {teacher_id, enabled, note}
    //
    //   [무엇을 하는 설정인가] 지금은 직접(P2P) 연결이 **실패해야** 릴레이로 넘어간다.
    //   중국 회선처럼 «연결은 되는데 패킷만 흘리는» 경우엔 그 조건에 안 걸려 영영 직접 경로를 쓴다.
    //   여기서 켜 두면 그 강사 수업은 처음부터 Cloudflare TURN 으로 붙는다.
    //   전달 경로는 /api/class/sessions/today 의 net_relay (학생·교사가 같은 값을 받는다).
    //
    //   ⚠️ 켜면 전송량 과금이 늘고 홉이 하나 늘어 RTT 가 조금 오른다. 회선이 나쁜 강사에게만 쓸 것.
    //   ⚠️ 강사 번호는 class_schedules.teacher_id( = teachers.id ) 도메인이다. 카페24 번호가 아니다.
    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/vc/relay' && (method === 'GET' || method === 'POST')) {
      /* 🔐 강사 전면 차단 — canEditOrg() 는 강사를 «못 막는다»(scope.type==='none' 에 true).
         CLAUDE.md 2장 「관리자 쓰기 API 를 본사 전용으로 막았는데 강사가 그대로 실행됨」. */
      const _vrActor = await getAdminActor(request, env as any);
      if (_vrActor.isTeacher) return json(forbiddenTeacherBody(_vrActor), 403);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS vc_relay_force (teacher_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, note TEXT, updated_at INTEGER, updated_by TEXT)`);
        if (method === 'GET') {
          const rs: any = await env.DB.prepare(
            `SELECT r.teacher_id, r.enabled, r.note, r.updated_at, r.updated_by, t.name AS teacher_name
             FROM vc_relay_force r LEFT JOIN teachers t ON CAST(t.id AS TEXT) = r.teacher_id
             ORDER BY r.updated_at DESC LIMIT 200`
          ).all();
          return json({ ok: true, rows: rs.results || [] });
        }
        const body: any = await request.json().catch(() => ({}));
        const tid = String(body?.teacher_id ?? '').trim();
        if (!tid || !/^\d+$/.test(tid)) return json({ ok: false, error: 'teacher_id_required' }, 400);
        const on = (body?.enabled === true || body?.enabled === 1 || body?.enabled === '1') ? 1 : 0;
        const note = String(body?.note ?? '').slice(0, 200) || null;
        await env.DB.prepare(
          `INSERT INTO vc_relay_force (teacher_id, enabled, note, updated_at, updated_by) VALUES (?,?,?,?,?)
           ON CONFLICT(teacher_id) DO UPDATE SET enabled=excluded.enabled, note=excluded.note,
             updated_at=excluded.updated_at, updated_by=excluded.updated_by`
        ).bind(tid, on, note, Date.now(), _vrActor?.name || 'admin').run();
        return json({ ok: true, teacher_id: tid, enabled: on });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'vc_relay_failed' }, 500); }
    }
    // Statistics and KPI share one domain handler; unrelated admin routes continue below.
    if (path.startsWith('/api/admin/stats/') || path === '/api/admin/kpi/dashboard' || path === '/api/admin/ux/stats') {
      const stats = await handleAdminStatsApi(request, url, env);
      if (stats) return stats;
    }
    if (path.startsWith('/api/admin/payroll/') || path === '/api/admin/export/payroll.csv') {
      const payroll = await handleAdminPayrollApi(request, url, env);
      if (payroll) return payroll;
    }
    // class-days: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/schedule-requests') || path === '/api/admin/classes/today' || path === '/api/admin/class-audit' || path === '/api/admin/postponed-classes') {
      const response = await handleAdminClassDaysApi(request, url, env);
      if (response) return response;
    }

    // feedback-drafts: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/feedback-drafts' || path.startsWith('/api/admin/feedback-drafts/')) {
      const response = await handleAdminFeedbackDraftsApi(request, url, env);
      if (response) return response;
    }

    // teachers: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/teacher') || path === '/api/teacher/mbti-self') {
      const response = await handleAdminTeachersApi(request, url, env);
      if (response) return response;
    }

    // announcements: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/popups') || path.startsWith('/api/admin/popups') || path.startsWith('/api/admin/posters')) {
      const response = await handleAdminAnnouncementsApi(request, url, env);
      if (response) return response;
    }
    // scheduling: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/schedules') || path.startsWith('/api/admin/class-schedules') || path.startsWith('/api/admin/no-shows') || path.startsWith('/api/admin/schedule-seed/') || path.startsWith('/api/admin/teacher-unavailability') || path === '/api/admin/unassigned-students' || path === '/api/admin/notify-queue' || path === '/api/admin/students/merge-duplicates') {
      const response = await handleAdminSchedulingApi(request, url, env);
      if (response) return response;
    }

    // payments: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/payments/')) {
      const response = await handleAdminPaymentsApi(request, url, env);
      if (response) return response;
    }

    // student-analysis: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/ai-analyze/')) {
      const response = await handleAdminStudentAnalysisApi(request, url, env);
      if (response) return response;
    }

    // teacher-feedback: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/teacher/') || path === '/api/teachers/mbti-list' || path === '/api/teachers/list-public' || path === '/api/teacher/praise' || path === '/api/mbti/match') {
      const response = await handleAdminTeacherFeedbackApi(request, url, env);
      if (response) return response;
    }

    // retention: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/retention/')) {
      const response = await handleAdminRetentionApi(request, url, env);
      if (response) return response;
    }
    // student-roster: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/students/')) {
      const response = await handleAdminStudentRosterApi(request, url, env);
      if (response) return response;
    }


    // 🏢 카페24 조직 이관 — Neo4j (:Branch)(:Center) → D1 franchises/centers (cafe24-sync.ts)
    if (method === 'GET' && path === '/api/admin/org/import-cafe24') {
      try {
        const r = await importCafe24Org(env);
        return json({ ok: true, ...r });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[org/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 📅 카페24 출석/수업 이관 — Neo4j (:Class 50.5만) → D1 attendance (cafe24-sync.ts)
    //   GET /api/admin/attendance/import-cafe24?offset=0&limit=3000[&since=YYYY-MM-DD][&until=YYYY-MM-DD]
    //   since 만 주고 until 없으면 상한 없이(9999) 삭제·재삽입 — 전체복구 시엔 since 생략(c24-% 전부).
    if (method === 'GET' && path === '/api/admin/attendance/import-cafe24') {
      const off = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));
      const lim = Math.max(1, Math.min(5000, parseInt(url.searchParams.get('limit') || '3000', 10)));
      const since = (url.searchParams.get('since') || '').trim() || undefined;
      const until = (url.searchParams.get('until') || '').trim() || undefined;
      try {
        const r = await importCafe24Attendance(env, off, lim, since, until);
        return json({ ok: true, offset: off, next_offset: r.done ? null : off + lim, ...r });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[attendance/import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    // 👩‍🏫 카페24 강사 명부 (그래프DB) — 학력·경력·소개·근무시간·시급·출퇴근집계·담당수업수
    //   GET /api/admin/teachers/graph-list?q=검색어  → {ok, source:'neo4j', count, teachers:[...]}
    //   Neo4j 미설정/실패 시 503/502. 강사관리 화면이 실데이터로 뜨게 함.
    if (method === 'GET' && path === '/api/admin/teachers/graph-list') {
      const qT = (url.searchParams.get('q') || '').trim().toLowerCase();
      /* 🔐 (2026-09-23) 지사·대리점 계정엔 시급(pay_per_time)을 가린다 — 강사관리 카드를 그들에게
         열면서 화면은 이 칸을 그리지 않지만, 안 가리면 네트워크 탭으로 전국 강사 시급이 그대로 샌다.
         본사(hq)·내부직원(none)·강사 본인은 그대로 받는다.
         ⚠️ 캐시(SESSION_STATE, 120초)는 키가 q 뿐이라 actor 별로 못 나눈다 — 그래서 캐시에는
         **원본(가리기 전)** 을 담고, 가리기는 캐시를 읽거나 쓴 «뒤» 응답을 만들 때만 한다.
         마스킹을 캐시에 넣기 전에 하면, 지사 계정이 먼저 조회해 가려진 사본이 120초간 캐시에
         박히고 그 사이 본사 계정이 같은 검색어로 조회하면 본사도 시급을 못 보게 된다. */
      const _glKeyT = 'gl:teachers:' + qT;
      const _glActorT = await getAdminActor(request, env as any);
      const _glMaskT = (arr: any[]): any[] => isOrgScopedRole(_glActorT.role)
        ? arr.map((t: any) => { const o = { ...t }; delete o.pay_per_time; return o; })
        : arr;
      {
        const _hit = await admCacheHit(env, _glKeyT);
        if (_hit) {
          const _hitBody: any = await _hit.clone().json().catch(() => null);
          if (_hitBody && Array.isArray(_hitBody.teachers)) {
            const _masked = _glMaskT(_hitBody.teachers);
            if (_masked !== _hitBody.teachers) {
              return json({ ..._hitBody, teachers: _masked, count: _masked.length });
            }
          }
          return _hit;
        }
      }
      try {
        // 담당수업수(class_count)·학생수(student_count)는 노드에 미리 계산돼 있음(대량 Class 스캔 회피)
        const { fields, values } = await runCypher(env, `
          MATCH (t:Teacher) WHERE t.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(t.name,'')) CONTAINS $q OR toLower(coalesce(t.nickname,'')) CONTAINS $q OR toLower(coalesce(t.group_name,'')) CONTAINS $q)
          RETURN t.teacher_id AS teacher_id, t.name AS name, t.nickname AS nickname,
                 t.is_manager AS is_manager, t.email AS email, t.group_name AS group_name,
                 t.edu AS edu, t.spec AS spec, t.intro AS intro,
                 t.start_hour AS start_hour, t.end_hour AS end_hour, t.pay_per_time AS pay_per_time,
                 t.video_type AS video_type, t.status AS status, t.reg_date AS reg_date,
                 coalesce(t.work_days,0) AS work_days, coalesce(t.total_hours,0.0) AS total_hours, t.last_work AS last_work,
                 coalesce(t.class_count,0) AS class_count, coalesce(t.student_count,0) AS student_count,
                 t.review_avg AS review_avg, coalesce(t.review_count,0) AS review_count,
                 t.score_avg AS score_avg, coalesce(t.score_count,0) AS score_count
          ORDER BY coalesce(t.class_count,0) DESC, t.name`, { q: qT }, 'READ');
        const teachers = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        // 캐시엔 원본(가리기 전)을 담는다 — 위 주석 참고.
        await admCachePut(env, _glKeyT, { ok: true, source: 'neo4j', count: teachers.length, teachers });
        const _maskedT = _glMaskT(teachers);
        return json({ ok: true, source: 'neo4j', count: _maskedT.length, teachers: _maskedT });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[teachers/graph-list] 실패:', e?.message || e);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 💰 카페24 회계 (그래프DB) — 회계장부·급여·지출결의서·세금계산서·예치금
    //   GET /api/admin/finance-cafe24/{ledger|payroll|expenses|tax|deposits}?limit=&month=
    {
      const finM = path.match(/^\/api\/admin\/finance-cafe24\/([a-z]+)$/);
      if (method === 'GET' && finM) {
        const kind = finM[1];
        const lim = Math.max(1, Math.min(2000, parseInt(url.searchParams.get('limit') || '500', 10)));
        const month = (url.searchParams.get('month') || '').trim();
        // ⚡ KV 캐시(120초) — 카페24 Neo4j(8880) 외부 홉 절감. 회계 원본은 야간 cron 동기화라 분단위 신선도 충분. 본사 전용(권한게이트 뒤)이라 조직공용 키.
        const _finKey = 'fin:' + kind + ':' + month + ':' + lim;
        { const _hit = await admCacheHit(env, _finKey); if (_hit) return _hit; }
        // 월별 손익 집계 (AccBookType 1=수입, 2=지출) — 최근 24개월
        if (kind === 'summary') {
          /* 🧾 매출 인식 범위 (2026-08-18 — 수정사항 5번 블럭 사장님 지시)
             income = 「케이씨피」 결제분만. 「케이씨피M」(하나은행 → 신한 운영자금 이체)은
             같은 「케이씨피」로 시작하지만 매출이 아니므로 `isKcp AND NOT isKcpm` 으로 짝지어 뺀다.
             ⚠️ 그래서 거래처·적요·계정과목 어디에도 「케이씨피」가 없는 수입 행은 매출에서 빠진다 —
                총매출이 예전(수입 전부 − 케이씨피M)보다 줄어 보이는 것은 이 정책의 결과다.
             ⚠️ expense 는 지시 대상이 아니므로 예전 그대로(지출 전부 − 케이씨피M)다. */
          try {
            const { fields, values } = await runCypher(env, `
              MATCH (a:AccBook) WHERE a.date IS NOT NULL AND a.date <> ''
              WITH substring(a.date,0,7) AS ym, a.type AS t, a.money AS money,
                   (coalesce(a.store,'')   =~ $kcpmRe
                 OR coalesce(a.memo,'')    =~ $kcpmRe
                 OR coalesce(a.subject,'') =~ $kcpmRe) AS isKcpm,
                   (coalesce(a.store,'')   =~ $kcpRe
                 OR coalesce(a.memo,'')    =~ $kcpRe
                 OR coalesce(a.subject,'') =~ $kcpRe) AS isKcp
              WHERE ym >= '2019-01'
              RETURN ym,
                     sum(CASE WHEN t = 1 AND isKcp AND NOT isKcpm THEN money ELSE 0 END) AS income,
                     sum(CASE WHEN t = 2 AND NOT isKcpm THEN money ELSE 0 END) AS expense
              ORDER BY ym DESC LIMIT 36`, { kcpmRe: KCP_TRANSFER_CYPHER_RE, kcpRe: KCP_REVENUE_CYPHER_RE }, 'READ');
            const rows = values.map(row => {
              const o: any = Object.fromEntries(fields.map((f, i) => [f, row[i]]));
              o.net = (Number(o.income) || 0) - (Number(o.expense) || 0);
              return o;
            });
            const totals = rows.reduce((a: any, r: any) => ({
              income: a.income + (Number(r.income) || 0),
              expense: a.expense + (Number(r.expense) || 0),
            }), { income: 0, expense: 0 });
            /* 🧾 ⛔ 「케이씨피M」의 이름·사유·금액을 응답에 담지 않는다 (2026-08-18 사장님 지시).
             *   예전에는 «왜 숫자가 줄었나» 를 설명하려고 excluded: { rule:'케이씨피M', reason, amount, count }
             *   와 월별 excluded_transfer/excluded_count 를 함께 내려줬다. 화면은 그리지 않았지만
             *   API 주소를 열면 그 이름과 금액이 그대로 보였다(사장님이 직접 확인).
             *   「제외했습니다」라고 적어 주는 것 자체가 「아직 남아 있다」로 읽힌다는 것이 지시의 요지다.
             *   ⚠️ 매출·지출에서 빼는 계산(위 Cypher 의 isKcpm + NOT isKcpm)은 그대로다 — 그건 정확성 문제다.
             *   ⚠️ 이 값으로 화면 줄을 다시 만들지 말 것. 되살리려면 사람에게 먼저 물을 것
             *      (회귀 감시: test-harness/c24_finance_kcpm_harness.mjs ③). */
            return admCachePut(env, _finKey, {
              ok: true, source: 'neo4j', kind: 'summary', months: rows,
              totals: { ...totals, net: totals.income - totals.expense },
            });
          } catch (e: any) {
            if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
            return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
          }
        }
        const QMAP: Record<string, string> = {
          /* 🧾 「케이씨피M」(하나은행 → 신한 운영자금 이체) 행은 **목록에서 아예 뺀다**
             (2026-08-18 사장님 지시). 매출·손익 집계에서 빼는 것으로는 부족하고,
             그 이름·금액이 화면에 남아 있는 것 자체를 원치 않으신다.
             ⚠️ 그래서 이 목록은 «카페24 원본 그대로» 가 아니다 — 자금이체 행이 빠진 장부다.
                원본 대조가 필요하면 카페24에서 봐야 한다.
             excluded_from_revenue 는 계속 내려보낸다(항상 false 가 된다). 화면·하니스가
             그 값으로 합계에서 빼는 안전망을 유지하고 있어, 이 WHERE 가 언젠가 느슨해져도
             숫자는 틀어지지 않는다. */
          ledger: `MATCH (a:AccBook) WHERE NOT (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe)${month ? ` AND (a.month = $month OR a.date STARTS WITH $month)` : ''} RETURN a.date AS date, a.type AS type, a.acc_type AS acc_type, a.subject AS subject, a.money AS money, a.store AS store, a.memo AS memo, a.month AS month, (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe) AS excluded_from_revenue, ((coalesce(a.store,'') =~ $kcpRe OR coalesce(a.memo,'') =~ $kcpRe OR coalesce(a.subject,'') =~ $kcpRe) AND NOT (coalesce(a.store,'') =~ $kcpmRe OR coalesce(a.memo,'') =~ $kcpmRe OR coalesce(a.subject,'') =~ $kcpmRe)) AS counts_as_revenue ORDER BY a.date DESC LIMIT $lim`,
          payroll: `MATCH (p:Payroll) ${month ? `WHERE p.month = $month` : ''} RETURN p.user_id AS user_id, p.month AS month, p.base AS base, p.total AS total, p.deduction AS deduction, p.actual AS actual, p.income_tax AS income_tax, p.pension AS pension, p.work_day AS work_day, p.pay_date AS pay_date ORDER BY p.month DESC LIMIT $lim`,
          /* 🧾 지출결의 — 카페24 `ExpenseReport` 에는 **망고아이와 무관한 다른 조직의 지출품의서가 함께 쌓인다.**
             그래서 우리 화면에서는 그 건을 뺀다(2026-08-24 사장님 지시). 판정 정본은 `src/c24-expense-filter.ts`.
             ⚠️ 아래 WHERE 는 «먼저 덜어내기»(전송량·8초 타임아웃 방어)일 뿐이고, **최종 판정은 TS** 가 한다
                (`c24ExpenseDrop`, 아래 rows 필터). 그래서 이 정규식이 언젠가 헛돌아도 결과는 안 틀린다.
             ⚠️ `properties(d) AS props` 를 함께 받는 이유: **결재라인이 어느 속성에 들어 있는지 카페24가 정한다.**
                우리가 이름을 모르므로 통째로 받아서 훑는다. 응답에 담기 전에 지운다(용량). */
          expenses: `MATCH (d:ExpenseReport)
            WHERE NOT ((CASE WHEN coalesce(d.name,'') =~ $c24LetterRe THEN coalesce(d.name,'') ELSE coalesce(d.content,'') END) =~ $c24HangulRe)
            RETURN d.name AS name, d.content AS content, d.pay_date AS pay_date, d.organ AS organ, d.method AS method, d.memo AS memo, d.state AS state, d.reg_date AS reg_date, d.doc_id AS doc_id, properties(d) AS props ORDER BY d.reg_date DESC LIMIT $lim`,
          tax: `MATCH (t:TaxInvoice) RETURN t.date AS date, t.supplier AS supplier, t.receiver AS receiver, t.supply AS supply, t.tax AS tax, t.total AS total, t.tax_type AS tax_type, t.state AS state ORDER BY t.date DESC LIMIT $lim`,
          deposits: `MATCH (s:SavedMoney) RETURN s.center_id AS center_id, s.amount AS amount, s.method AS method, s.date AS date, s.state AS state ORDER BY s.date DESC LIMIT $lim`,
        };
        const cy = QMAP[kind];
        if (!cy) return json({ ok: false, error: 'unknown finance kind' }, 400);
        try {
          /* 🧾 counts_as_revenue = 「케이씨피」이면서 「케이씨피M」이 아닌 행.
             장부 탭의 «매출» 합계가 위 summary(KPI·추이)와 **같은 규칙**을 쓰게 하려고 서버가
             판정해 내려준다. ⚠️ 한쪽만 바꾸면 같은 화면에서 「매출 ₩A」와 「총매출 ₩B」가
             서로 다르게 찍힌다 — 그 불일치를 잡으려고 만든 화면에서 그러면 안 된다. */
          /* 🧾 지출결의는 Cypher 가 «한글 제목» 을 이미 덜어냈지만, TS 가 한 번 더 판정하면서
             결재라인(「Joy」·「박상인」)까지 본다. 그만큼 줄어드니 조금 넉넉히 읽어 온다.
             ⚠️ Neo4j 호출은 8초 타임아웃이라 무작정 키우면 화면이 통째로 비어 버린다 — 20% 여유까지만. */
          const fetchLim = (kind === 'expenses') ? Math.min(2000, Math.ceil(lim * 1.2)) : lim;
          const { fields, values } = await runCypher(env, cy, { lim: fetchLim, month, kcpmRe: KCP_TRANSFER_CYPHER_RE, kcpRe: KCP_REVENUE_CYPHER_RE, c24HangulRe: C24_HANGUL_CYPHER_RE, c24LetterRe: C24_LETTER_CYPHER_RE }, 'READ');
          let rows = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
          let filteredOut = 0;
          let propKeys: string[] = [];
          if (kind === 'expenses') {
            /* 🧾 «우리 것이 아닌» 지출품의서를 뺀다 — 판정 정본 src/c24-expense-filter.ts.
               ⛔ 여기에 판정 규칙을 복사해 쓰지 말 것(같은 규칙이 두 벌이 되는 순간 어긋나기 시작한다).
               ℹ️ prop_keys 는 **속성 «이름» 만** 모은 것이다(값이 아니다). 결재라인이 실제로 어느 칸에
                  들어 있는지 사람이 한 번 확인하려고 남긴다 — 카페24가 정한 이름을 우리가 모르기 때문. */
            const seenKeys = new Set<string>();
            const kept: typeof rows = [];
            for (const r of rows) {
              const props = (r.props && typeof r.props === 'object') ? r.props as Record<string, unknown> : {};
              Object.keys(props).forEach(k => seenKeys.add(k));
              const verdict = c24ExpenseDrop({ ...props, name: r.name, content: r.content });
              delete (r as Record<string, unknown>).props;   // 화면이 안 쓰는 원본 뭉치는 응답에서 뺀다
              if (verdict.drop) { filteredOut++; continue; }
              kept.push(r);
            }
            rows = kept.slice(0, lim);
            propKeys = [...seenKeys].sort();
          }
          return admCachePut(env, _finKey, { ok: true, source: 'neo4j', kind, count: rows.length, rows,
            ...(kind === 'expenses' ? { filtered_out: filteredOut, prop_keys: propKeys } : {}) });
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
      }
    }

    // 📈 카페24 자가평가 월별 추이 (그래프DB) — 학생 자가진단 점수 추이(참여도·자신감 지표)
    //   GET /api/admin/selfscore/trend?months=24  → {ok, months:[{ym,cnt,avg_score}], totals}
    if (method === 'GET' && path === '/api/admin/selfscore/trend') {
        const lim = Math.max(1, Math.min(84, parseInt(url.searchParams.get('months') || '24', 10)));
        // ⚡ KV 캐시(120초) — Neo4j 외부 홉 절감(야간 동기화 데이터).
        const _sstKey = 'selfscore:trend:' + lim;
        { const _hit = await admCacheHit(env, _sstKey); if (_hit) return _hit; }
        try {
          const { fields, values } = await runCypher(env, `
            MATCH (s:SelfScoreTrend)
            RETURN s.ym AS ym, s.cnt AS cnt, s.avg_score AS avg_score
            ORDER BY s.ym DESC LIMIT $lim`, { lim }, 'READ');
          const months = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
          const withCount = months.filter((m: any) => Number(m.cnt) > 0);
          const totals = {
            total_responses: months.reduce((a: number, m: any) => a + (Number(m.cnt) || 0), 0),
            avg_overall: withCount.length ? Math.round((withCount.reduce((a: number, m: any) => a + Number(m.avg_score), 0) / withCount.length) * 100) / 100 : null,
          };
          return admCachePut(env, _sstKey, { ok: true, source: 'neo4j', months, totals });
        } catch (e: any) {
          if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
          return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
        }
    }

    // 🏅 카페24 레벨테스트 배치 현황 (그래프DB) — 레벨별 분포·합격률 + 최근 응시
    //   GET /api/admin/leveltest/overview  → {ok, by_level:[{level,total,pass,pass_rate}], recent:[...], totals}
    if (method === 'GET' && path === '/api/admin/leveltest/overview') {
      // ⚡ KV 캐시(120초) — Neo4j 외부 홉 2회(agg+recent) 절감(야간 동기화 데이터).
      const _ltKey = 'leveltest:overview';
      { const _hit = await admCacheHit(env, _ltKey); if (_hit) return _hit; }
      try {
        const agg = await runCypher(env, `
          MATCH (l:LevelTest) WHERE l.level IS NOT NULL AND l.level <> ''
          WITH l.level AS level, count(*) AS total, sum(CASE WHEN l.pass = 1 THEN 1 ELSE 0 END) AS pass
          RETURN level, total, pass ORDER BY total DESC`, {}, 'READ');
        const byLevel = agg.values.map(row => {
          const o: any = Object.fromEntries(agg.fields.map((f, i) => [f, row[i]]));
          o.pass_rate = o.total > 0 ? Math.round((Number(o.pass) / Number(o.total)) * 1000) / 10 : 0;
          return o;
        });
        const rec = await runCypher(env, `
          MATCH (l:LevelTest) WHERE l.year IS NOT NULL
          RETURN l.user_id AS user_id, l.year AS year, l.month AS month, l.day AS day, l.level AS level, l.pass AS pass,
                 (coalesce(l.s1,0)+coalesce(l.s2,0)+coalesce(l.s3,0)+coalesce(l.s4,0)+coalesce(l.s5,0)) AS score_sum
          ORDER BY l.year DESC, l.month DESC, l.day DESC LIMIT 200`, {}, 'READ');
        const recent = rec.values.map(row => Object.fromEntries(rec.fields.map((f, i) => [f, row[i]])));
        const totals = byLevel.reduce((a: any, r: any) => ({ total: a.total + Number(r.total), pass: a.pass + Number(r.pass) }), { total: 0, pass: 0 });
        return admCachePut(env, _ltKey, { ok: true, source: 'neo4j', by_level: byLevel, recent, totals: { ...totals, pass_rate: totals.total > 0 ? Math.round((totals.pass / totals.total) * 1000) / 10 : 0 } });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 🧑‍💼 카페24 직원 명부 (그래프DB) — 지사 직원
    if (method === 'GET' && path === '/api/admin/staff/graph-list') {
      const qS = (url.searchParams.get('q') || '').trim().toLowerCase();
      // ⚡ KV 캐시(120초) — 위 teachers/graph-list 와 동일 패턴(Neo4j 외부 홉 절감).
      const _glKeyS = 'gl:staff:' + qS;
      { const _hit = await admCacheHit(env, _glKeyS); if (_hit) return _hit; }
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (s:Staff) WHERE s.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(s.name,'')) CONTAINS $q OR toLower(coalesce(s.nickname,'')) CONTAINS $q)
          RETURN s.staff_id AS staff_id, s.name AS name, s.nickname AS nickname, s.email AS email,
                 s.intro AS intro, s.status AS status, s.retire_date AS retire_date, s.franchise_id AS franchise_id
          ORDER BY s.status, s.name`, { q: qS }, 'READ');
        const staff = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return admCachePut(env, _glKeyS, { ok: true, source: 'neo4j', count: staff.length, staff });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 📚 카페24 교재 명부 (그래프DB)
    if (method === 'GET' && path === '/api/admin/books/graph-list') {
      const qB = (url.searchParams.get('q') || '').trim().toLowerCase();
      // ⚡ KV 캐시(120초) — 위 graph-list 들과 동일 패턴(Neo4j 외부 홉 절감).
      const _glKeyB = 'gl:books:' + qB;
      { const _hit = await admCacheHit(env, _glKeyB); if (_hit) return _hit; }
      try {
        const { fields, values } = await runCypher(env, `
          MATCH (b:Book) WHERE b.name IS NOT NULL
            AND ($q = '' OR toLower(coalesce(b.name,'')) CONTAINS $q)
          RETURN b.book_id AS book_id, b.name AS name, b.memo AS memo, b.status AS status, b.group_id AS group_id
          ORDER BY b.status, b.name`, { q: qB }, 'READ');
        const books = values.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])));
        return admCachePut(env, _glKeyB, { ok: true, source: 'neo4j', count: books.length, books });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        return json({ ok: false, code: 'NEO4J_UNREACHABLE', error: String(e?.message || e) }, 502);
      }
    }

    // 💰 카페24 결제 이관 — Neo4j (:Payment 1.1만) → D1 student_payments (cafe24-sync.ts)
    // 🔎 (2026-07-19) 결제 미매칭 진단 — 특정 회원ID가 Neo4j 그래프에 어떤 노드/결제/관계로 존재하는지 원자료 확인.
    //   지사 대시보드 매출 미집계(결제자 user_id가 students_erp에 없음, 7월 기준 금액 79% 미매칭) 원인 추적용.
    //   /api/admin/* default-deny + 비본사 403 게이트 뒤라 본사(hq)/내부직원만 호출 가능.
    if (method === 'GET' && path === '/api/admin/payments/cafe24-diag') {
      const uid = (url.searchParams.get('uid') || '').trim();
      if (!uid) return json({ ok: false, error: 'uid required' }, 400);
      try {
        const pay = await runCypher(env, `MATCH (p:Payment {user_id:$uid}) RETURN properties(p) AS props LIMIT 3`, { uid }, 'READ');
        const node = await runCypher(env,
          `MATCH (n) WHERE n.user_id = $uid OR n.member_id = $uid OR n.login_id = $uid OR n.student_id = $uid
           RETURN labels(n) AS labels, properties(n) AS props LIMIT 6`, { uid }, 'READ');
        const rel = await runCypher(env,
          `MATCH (p:Payment {user_id:$uid})-[r]-(x) RETURN type(r) AS rel, labels(x) AS labels, properties(x) AS props LIMIT 6`, { uid }, 'READ');
        return json({
          ok: true,
          payments: pay.values.map(v => v[0]),
          nodes: node.values.map(v => ({ labels: v[0], props: v[1] })),
          rels: rel.values.map(v => ({ rel: v[0], labels: v[1], props: v[2] })),
        });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED' }, 503);
        return json({ ok: false, error: String(e?.message || e) }, 502);
      }
    }

    // 🚨 결석 위험 자동 알림 수동 실행/진단 — cron(15분)과 동일 로직.
    //   ?dry=1 이면 발송·기록 없이 감지 결과만 반환. /api/admin/* default-deny + 비본사 403 뒤.
    if (method === 'GET' && path === '/api/admin/absent-sweep/run') {
      const dry = url.searchParams.get('dry') === '1';
      try {
        const out = await runAbsentStudentSweep(env as any, { dry });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 🛟 버려진 녹화 자동 마무리 수동 실행 — cron(15분)과 동일 로직.
    //   브라우저가 complete 를 못 보내고 죽어 조각만 R2 에 떠 있는 녹화를 서버가 대신 마무리한다.
    //   ?min_age_min= 시작 후 최소 경과(기본 240=4시간, 진행 중 수업 보호), ?quiet_min= 마지막
    //   조각 후 조용한 시간(기본 30), ?limit= 건수 제한(최대 50). 빈 껍데기 정리도 함께 수행.
    if (method === 'GET' && path === '/api/admin/recordings/finalize/run') {
      const ageMin = parseInt(url.searchParams.get('min_age_min') || '', 10);
      const quietMin = parseInt(url.searchParams.get('quiet_min') || '', 10);
      const lim = parseInt(url.searchParams.get('limit') || '', 10);
      try {
        const out = await runRecordingFinalizeSweep(env as any, {
          minAgeMs: Number.isFinite(ageMin) && ageMin >= 0 ? ageMin * 60000 : undefined,
          quietMs: Number.isFinite(quietMin) && quietMin >= 0 ? quietMin * 60000 : undefined,
          limit: Number.isFinite(lim) && lim > 0 ? Math.min(lim, 50) : undefined,
        });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    // 📣 수업 전 리마인더 수동 실행/진단 — cron(15분)과 동일 로직. ?dry=1 = 감지만.
    if (method === 'GET' && path === '/api/admin/lesson-reminder/run') {
      const dry = url.searchParams.get('dry') === '1';
      try {
        const out = await runLessonReminderSweep(env as any, { dry });
        return json(out);
      } catch (e: any) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/payments/import-cafe24') {
      try {
        const r = await importCafe24Payments(env);
        const sum = await env.DB.prepare(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount_krw),0) AS total FROM student_payments WHERE memo LIKE '[cafe24]%' AND status='paid'`,
        ).first<any>();
        return json({ ok: true, imported: r.imported, d1_paid_count: sum?.cnt || 0, d1_paid_total_krw: sum?.total || 0 });
      } catch (e: any) {
        if (e instanceof Neo4jNotConfiguredError) return json({ ok: false, code: 'NEO4J_NOT_CONFIGURED', error: e.message }, 503);
        console.warn('[import-cafe24] 실패:', e?.message || e);
        return json({ ok: false, code: 'IMPORT_FAILED', error: String(e?.message || e) }, 502);
      }
    }

    /* 🤖 (2026-09-16 신설) AI 학습도구 8종을 실제로 쓴 학생 — 도구별 횟수·마지막 사용일.
       GET /api/admin/ai-usage/students?q=&tool=all|judgment|warmup|friend|write|speech|review|vocab|micro&days=30

       정본 8개 표는 src/api-students.ts 의 "오늘 도구별 활동" 목록(`/api/student/today`)과
       완전히 같다 — 판단력훈련·웜업·AI영어친구·AI글쓰기·AI음성코치·복습퀴즈·단어장·AI단어퀴즈.
       학생게임(game_sessions)은 그 목록에도 있지만 「AI 학습도구」라는 이름과 성격이 달라(게임 허브는
       AI 채점·생성이 아니라 사전 제작 퀴즈 위주) 여기서는 뺐다 — 필요하면 사람이 정할 일.

       ⚠️ 게스트(guest%)는 실재 학생이 아니므로 전부 제외한다 — CLAUDE.md 2장 "「동의 안 함」이
          「거절했다」인지 「안 물어봤다」인지" 및 judgment_events 게스트 오염 실사고(2026-09-05)와
          같은 뿌리: 이 칸에 로그인 안 한 방문자의 값이 섞여 「없는 학생」이 명단에 뜬다.
       ⚠️ 부분일치 없음 — uid 는 students_erp.user_id 완전일치로만 잇는다(강사 이름처럼
          "번호가 세 벌이라 조용히 남의 것이 붙는" 함정과 같은 뿌리를 피하려고).
       ⚠️ 표가 없으면(아직 안 쓴 도구) 그 표만 건너뛴다(fail-open) — 조회 실패로 명단 전체가
          비면 「AI 를 아무도 안 쓴다」는 거짓 결론이 된다. */
    if (method === 'GET' && path === '/api/admin/ai-usage/students') {
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const toolFilter = (url.searchParams.get('tool') || 'all').trim();
      const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
      const since = Date.now() - days * 86400000;
      const _ssw = await studentScopeWhere(env, request);   // ⚠️ alias 없음 — students_erp 원래 칸 이름 기준

      const TOOL_DEFS: { key: string; ko: string; table: string; col: string; ts: string; extra?: string }[] = [
        { key: 'judgment', ko: '판단력 훈련',   table: 'judgment_events',        col: 'student_uid', ts: 'created_at' },
        { key: 'warmup',   ko: 'A.i 말하기 연습',       table: 'warmup_session_log',     col: 'user_id',     ts: 'started_at' },
        { key: 'friend',   ko: 'AI 영어친구',   table: 'ai_friend_chats',        col: 'student_uid', ts: 'created_at', extra: `role='user'` },
        { key: 'write',    ko: 'AI 글쓰기',     table: 'ai_writing_corrections', col: 'student_uid', ts: 'created_at' },
        { key: 'speech',   ko: '발음코칭',      table: 'voice_coaching',         col: 'student_uid', ts: 'created_at' },
        { key: 'review',   ko: 'BTS/SIU·중국어퀴즈', table: 'review_quiz_results',    col: 'user_id',     ts: 'created_at' },
        { key: 'vocab',    ko: '단어장',        table: 'vocab_review_log',       col: 'user_id',     ts: 'reviewed_at' },
        { key: 'micro',    ko: 'AI 단어 퀴즈',  table: 'vocab_quizzes',          col: 'user_id',     ts: 'completed_at', extra: `completed=1` },
      ];
      const wanted = toolFilter === 'all' ? TOOL_DEFS : TOOL_DEFS.filter((t) => t.key === toolFilter);
      if (!wanted.length) return json({ ok: false, error: 'unknown_tool' }, 400);

      const byUid: Record<string, { tools: Record<string, { n: number; last_ts: number }>; total: number; last_ts: number }> = {};
      for (const t of wanted) {
        const scopeSub = _ssw.cond ? ` AND ${t.col} IN (SELECT user_id FROM students_erp WHERE ${_ssw.cond})` : '';
        const sql = `SELECT ${t.col} AS uid, COUNT(*) n, MAX(${t.ts}) last_ts
                       FROM ${t.table}
                      WHERE ${t.col} IS NOT NULL AND ${t.col} <> '' AND ${t.col} NOT LIKE 'guest%'
                        ${t.extra ? `AND ${t.extra}` : ''}
                        AND ${t.ts} >= ?${scopeSub}
                      GROUP BY ${t.col}`;
        let rows: any[] = [];
        try { rows = ((await env.DB.prepare(sql).bind(since, ..._ssw.binds).all()).results || []) as any[]; }
        catch (e) { console.warn('[ai-usage] ' + t.key + ' 조회 실패(표가 아직 없을 수 있음):', (e as any)?.message || e); continue; }
        for (const r of rows) {
          const uid = String(r.uid || '');
          if (!uid) continue;
          const rec = byUid[uid] || (byUid[uid] = { tools: {}, total: 0, last_ts: 0 });
          const n = Number(r.n) || 0, lt = Number(r.last_ts) || 0;
          rec.tools[t.key] = { n, last_ts: lt };
          rec.total += n;
          if (lt > rec.last_ts) rec.last_ts = lt;
        }
      }

      const uids = Object.keys(byUid);
      const nameRows = uids.length ? await selectInChunks<any>(env.DB, uids, (ph) =>
        `SELECT user_id, COALESCE(korean_name, student_name, username, user_id) AS name,
                english_name, shop_name, franchise, level
           FROM students_erp WHERE user_id IN (${ph})`) : [];
      const nameByUid: Record<string, any> = {};
      for (const r of nameRows) nameByUid[String(r.user_id)] = r;

      let list = uids.map((uid) => {
        const info = nameByUid[uid] || {};
        return {
          uid,
          name: info.name || uid,
          english_name: info.english_name || '',
          shop_name: info.shop_name || '',
          franchise: info.franchise || '',
          level: info.level || '',
          tools: byUid[uid].tools,
          tool_count: Object.keys(byUid[uid].tools).length,
          total: byUid[uid].total,
          last_ts: byUid[uid].last_ts,
        };
      });
      if (q) {
        list = list.filter((s) =>
          s.uid.toLowerCase().includes(q) || String(s.name).toLowerCase().includes(q) ||
          String(s.english_name).toLowerCase().includes(q) || String(s.shop_name).toLowerCase().includes(q));
      }
      list.sort((a, b) => b.last_ts - a.last_ts);

      const summary = wanted.map((t) => ({ key: t.key, ko: t.ko, students: list.filter((s) => s.tools[t.key]).length }));
      return json({ ok: true, days, tool: toolFilter, count: list.length, students: list.slice(0, 500), summary });
    }
    // organizations: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/franchises' || path === '/api/admin/org/hq' || path === '/api/admin/centers') {
      const response = await handleAdminOrganizationsApi(request, url, env);
      if (response) return response;
    }


    // ─── 레벨테스트 ───────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/level-tests') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS level_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, tested_at INTEGER NOT NULL, level TEXT, score REAL, notes TEXT, evaluator TEXT, created_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const lim = Math.max(1, Math.min(500, parseInt(url.searchParams.get('limit') || '50', 10)));
        const rs = await env.DB.prepare(`SELECT * FROM level_tests ORDER BY tested_at DESC LIMIT ?`).bind(lim).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.student_name) return invalidBody(['student_name']);
      const now = Date.now();
      const tested = b.tested_at ? Number(b.tested_at) : now;
      const r = await env.DB.prepare(
        `INSERT INTO level_tests (student_user_id, student_name, tested_at, level, score, notes, evaluator, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.student_user_id || null, b.student_name, tested, b.level || null, b.score != null ? Number(b.score) : null, b.notes || null, b.evaluator || 'admin', now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    // leveltest: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/leveltest/') || path === '/api/teacher/leveltest-assignments' || path === '/api/admin/leveltest/applications') {
      const response = await handleAdminLeveltestApi(request, url, env);
      if (response) return response;
    }

    // enrollments: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/enrollments' || path.startsWith('/api/admin/enrollments/')) {
      const response = await handleAdminEnrollmentsApi(request, url, env);
      if (response) return response;
    }


    // ─── 커뮤니티 게시글 ──────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/community-posts') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM community_posts ORDER BY pinned DESC, created_at DESC LIMIT 200`).all();
        return json({ ok: true, items: rs.results || [] });
      }
      const b = await parseJsonBody(request);
      if (!b || !b.title) return invalidBody(['title']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO community_posts (title, body, author, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(b.title, b.body || null, b.author || 'admin', b.pinned ? 1 : 0, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 게시글 고정 토글 / 삭제
    if (method === 'PATCH' && /^\/api\/admin\/community-posts\/\d+$/.test(path)) {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      const m = path.match(/^\/api\/admin\/community-posts\/(\d+)$/);
      const id = m ? parseInt(m[1], 10) : 0;
      const b = await parseJsonBody(request);
      if (!b) return invalidBody(['pinned/title/body 등']);
      const sets: string[] = [];
      const binds: any[] = [];
      if (b.title !== undefined)  { sets.push('title = ?');  binds.push(b.title); }
      if (b.body !== undefined)   { sets.push('body = ?');   binds.push(b.body); }
      if (b.pinned !== undefined) { sets.push('pinned = ?'); binds.push(b.pinned ? 1 : 0); }
      if (sets.length === 0) return json({ ok: false, error: 'nothing_to_update' }, 400);
      sets.push('updated_at = ?'); binds.push(Date.now());
      binds.push(id);
      await env.DB.prepare(`UPDATE community_posts SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
      return json({ ok: true, id });
    }

    // ─── 교재 콘텐츠 ─────────────────────────────────────────────────────
    if ((method === 'GET' || method === 'POST') && path === '/api/admin/textbooks') {
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      // 🎬 교재별 예습/복습 동영상 컬럼 (없으면 추가 — 기존 데이터 보존)
      for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
      if (method === 'GET') {
        const rs = await env.DB.prepare(`SELECT * FROM textbooks ORDER BY active DESC, level ASC, title ASC`).all();
        const payload: any = { ok: true, items: rs.results || [] };
        /* 📚 (2026-09-02) ?library=1 일 때만 «실재하는» 교재 이름을 함께 준다 — 1단계 배선.
           [왜] `textbooks` 표에는 「BTS」·「다락원」 2행뿐인데, AI 학습도구가 매칭에 쓰는 이름은
                「BTS 1 001 (Welcome to school)」 같은 실제 콘텐츠 이름이다. 그래서 이 목록에서
                고른 이름으로 배정하면 **에러 없이** 아무것도 안 맞았다(실측: textbook 채운 학생 0명).
           ⚠️ 기존 `items` 는 한 글자도 안 바꾼다 — 이 API 를 쓰는 화면이 다섯 곳이다
              (adm-core.js 4곳·admin/health.html). 응답 모양을 바꾸면 그쪽이 조용히 깨진다.
           ⚠️ 기본으로 계산하지 않는 이유도 같다 — textbook_files 전수 GROUP BY 라
              교재 목록만 필요한 호출에까지 비용을 얹을 이유가 없다. */
        if (url.searchParams.get('library') === '1') {
          try { payload.library = await loadTextbookChoices(env as any); }
          catch (e: any) { console.warn('[textbooks] library skip:', e && e.message); }
        }
        return json(payload);
      }
      const b = await parseJsonBody(request);
      if (!b || !b.title) return invalidBody(['title']);
      const now = Date.now();
      const r = await env.DB.prepare(
        `INSERT INTO textbooks (title, level, units, isbn, publisher, notes, video_url, video_type, video_title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.title, b.level || null, b.units != null ? Number(b.units) : null, b.isbn || null, b.publisher || null, b.notes || null, b.video_url || null, b.video_type || 'preview', b.video_title || null, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }

    // 🎬 수업방 입장 시 교재 → 예습/복습 동영상 자동 매칭
    //   GET /api/get-lesson-video/<book_id>  → { success, has_video, book, video_url, ... }
    if (method === 'GET' && /^\/api\/get-lesson-video\/\d+$/.test(path)) {
      const bookId = parseInt(path.split('/').pop() || '0', 10);
      await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
      const bk: any = await env.DB.prepare(`SELECT * FROM textbooks WHERE id = ?`).bind(bookId).first().catch(() => null);
      if (!bk) return json({ success: false, message: `${bookId}번 교재를 찾을 수 없습니다.` }, 404);
      if (!bk.video_url) return json({ success: true, has_video: false, book: bk, message: '이 교재에는 연결된 예습/복습 동영상이 아직 없습니다.' });
      const isYt0 = /youtu\.?be|youtube\.com/.test(String(bk.video_url));
      return json({ success: true, has_video: true, book: bk, is_youtube: isYt0, video_url: bk.video_url, video_type: bk.video_type || 'preview', video_title: bk.video_title || bk.title });
    }

    // 🎬 교재명(또는 id)으로 동영상 매칭 — 등록된 망고아이 비디오(YouTube) 또는 교재 video_url
    //   GET /api/lesson-video?q=<교재명>  또는  ?id=<교재id>
    if (method === 'GET' && path === '/api/lesson-video') {
      const norm = (s: any) => String(s || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      let q = (url.searchParams.get('q') || '').trim();
      const idParam = parseInt(url.searchParams.get('id') || '0', 10);
      // 1) 교재 id 가 오면 textbooks.video_url 우선
      if (idParam) {
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`); } catch {}
        for (const ddl of [`ALTER TABLE textbooks ADD COLUMN video_url TEXT`, `ALTER TABLE textbooks ADD COLUMN video_type TEXT DEFAULT 'preview'`, `ALTER TABLE textbooks ADD COLUMN video_title TEXT`]) { try { await env.DB.exec(ddl); } catch {} }
        const bk2: any = await env.DB.prepare(`SELECT * FROM textbooks WHERE id = ?`).bind(idParam).first().catch(() => null);
        if (bk2 && bk2.video_url) {
          const isYt = /youtu\.?be|youtube\.com/.test(String(bk2.video_url));
          return json({ success: true, has_video: true, is_youtube: isYt, video_url: bk2.video_url, video_type: bk2.video_type || 'preview', video_title: bk2.video_title || bk2.title });
        }
        if (bk2 && bk2.title && !q) q = String(bk2.title); // 교재명으로 비디오 매칭 시도
      }
      // 2) 교재명으로 망고아이 비디오(YouTube) 자동 매칭 — 진도(레벨+유닛) 기준
      if (q) {
        const nq = norm(q);
        // 교재명/영상제목에서 BTS 레벨 + 유닛 번호들 추출
        //   영상은 유닛 "범위"(예: "BTS 1 Unit 001-003", "BTS 03 004 006") → [min,max] 범위로 봄
        //   교재는 단일 유닛(예: "BTS 1 003") → 마지막 숫자를 유닛으로 봄
        const parseBTS = (s: string) => {
          const m = String(s || '').match(/BTS\s*0*([0-9]+)([\s\S]*)/i);
          if (!m) return null;
          const level = parseInt(m[1], 10);
          const nums = ((m[2] || '').match(/[0-9]{1,3}/g) || []).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= 999);
          return { level, nums };
        };
        const isReview = (s: string) => /review|복습|test|테스트/i.test(String(s || ''));
        const tk = parseBTS(q);
        const tbUnit = (tk && tk.nums.length) ? tk.nums[tk.nums.length - 1] : null; // 교재 = 마지막 숫자
        const wantReview = isReview(q);
        const vids = ((await env.DB.prepare(`SELECT id, title, youtube_url, youtube_id, thumbnail_url, level, category FROM mango_videos WHERE active = 1 ORDER BY created_at DESC LIMIT 1000`).all().catch(() => ({ results: [] }))).results || []) as any[];
        let best: any = null;
        // (a) 레벨 일치 + 교재 유닛이 영상의 유닛 범위 안 — 예습(비REVIEW) 우선
        if (tk && tbUnit != null) {
          const cands = vids.filter((v: any) => {
            const vk = parseBTS(v.title);
            if (!vk || vk.level !== tk.level || !vk.nums.length) return false;
            const lo = Math.min(...vk.nums), hi = Math.max(...vk.nums);
            return tbUnit >= lo && tbUnit <= hi;
          });
          best = cands.find((v: any) => isReview(v.title) === wantReview) || cands[0] || null;
        }
        // (a2) 레벨은 있는데 유닛이 없거나(책 단위) 범위 매칭 실패 → 그 레벨의 가장 낮은 유닛 예습 영상
        if (!best && tk && tk.level != null) {
          const lvCands = vids.filter((v: any) => { const vk = parseBTS(v.title); return !!(vk && vk.level === tk.level && vk.nums.length); });
          lvCands.sort((a: any, b: any) => Math.min(...(parseBTS(a.title) as any).nums) - Math.min(...(parseBTS(b.title) as any).nums));
          best = lvCands.find((v: any) => !isReview(v.title)) || lvCands[0] || null;
        }
        // (b) 제목 포함 매칭 (Phonics 등 유닛번호 없는 교재)
        if (!best) { for (const v of vids) { const nt = norm(v.title); if (nt && nq && (nt.includes(nq) || nq.includes(nt))) { best = v; break; } } }
        // (c) 앞 8자 부분 매칭
        if (!best && nq.length >= 4) { const key = nq.slice(0, 8); for (const v of vids) { if (norm(v.title).includes(key)) { best = v; break; } } }
        if (best) return json({ success: true, has_video: true, is_youtube: true, youtube_id: best.youtube_id, youtube_url: best.youtube_url, video_url: best.youtube_url, video_title: best.title, video_type: isReview(best.title) ? 'review' : 'preview' });
      }
      return json({ success: true, has_video: false, message: '매칭된 동영상이 없습니다.' });
    }

    // 🎬 유튜브 채널 영상 일괄 가져오기 (YouTube Data API v3)
    //   POST /api/admin/mango-videos/import-channel  { channel_url 또는 channel_id, api_key? }
    if (method === 'POST' && path === '/api/admin/mango-videos/import-channel') {
      const ib: any = await parseJsonBody(request).catch(() => null);
      const apiKey = String((ib && ib.api_key) || (env as any).YOUTUBE_API_KEY || '').trim();
      if (!apiKey) return json({ ok: false, error: 'no_api_key', message: 'YouTube Data API 키가 필요합니다.' }, 400);
      let channelId = String((ib && ib.channel_id) || '').trim();
      const cu = String((ib && ib.channel_url) || '').trim();
      if (!channelId && cu) { const m = cu.match(/channel\/(UC[\w-]+)/); if (m) channelId = m[1]; }
      if (!channelId && /^UC[\w-]+$/.test(cu)) channelId = cu;
      if (!channelId) return json({ ok: false, error: 'no_channel', message: '채널 ID(UC...)를 찾을 수 없습니다.' }, 400);
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS mango_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_en TEXT, youtube_url TEXT NOT NULL, youtube_id TEXT NOT NULL, thumbnail_url TEXT, level TEXT, lesson_no INTEGER, category TEXT, description TEXT, description_en TEXT, duration_sec INTEGER, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
      } catch {}
      // 1) 채널의 업로드 재생목록 id 조회
      const chRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
      const chData: any = await chRes.json().catch(() => ({}));
      const uploads = chData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return json({ ok: false, error: 'no_uploads', message: chData?.error?.message || '업로드 재생목록을 찾을 수 없습니다(키·채널 확인).' }, 400);
      // 2) 재생목록 전체 페이지네이션
      let pageToken = '';
      let imported = 0, skipped = 0, total = 0;
      const now = Date.now();
      for (let p = 0; p < 40; p++) {
        const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploads}&key=${apiKey}${pageToken ? '&pageToken=' + pageToken : ''}`);
        const plData: any = await plRes.json().catch(() => ({}));
        const items = plData?.items || [];
        for (const it of items) {
          total++;
          const vid = it?.contentDetails?.videoId || it?.snippet?.resourceId?.videoId;
          const title = (it?.snippet?.title || '').trim();
          if (!vid || !title || title === 'Private video' || title === 'Deleted video') { skipped++; continue; }
          const exist = await env.DB.prepare(`SELECT id FROM mango_videos WHERE youtube_id = ?`).bind(vid).first().catch(() => null);
          if (exist) { skipped++; continue; }
          const thumb = it?.snippet?.thumbnails?.high?.url || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
          const lvMatch = title.match(/(?:Lv|Level|레벨)\s*([0-9]+)/i) || title.match(/BTS\s*([0-9]+)/i);
          const level = lvMatch ? String(lvMatch[1]) : null;
          const lnMatch = title.match(/(?:UNIT|Unit|Lesson|LESSON|레슨)\s*([0-9]+)/) || title.match(/\b([0-9]{3})\b/);
          const lessonNo = lnMatch ? parseInt(lnMatch[1], 10) : null;
          await env.DB.prepare(`INSERT INTO mango_videos (title, youtube_url, youtube_id, thumbnail_url, level, lesson_no, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
            .bind(title, `https://www.youtube.com/watch?v=${vid}`, vid, thumb, level, lessonNo, now, now).run();
          imported++;
        }
        pageToken = plData?.nextPageToken || '';
        if (!pageToken) break;
      }
      return json({ ok: true, channel_id: channelId, total, imported, skipped });
    }
    // controls: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/ghost/') || path.startsWith('/api/admin/whisper/') || path.startsWith('/api/admin/alerts') || path.startsWith('/api/admin/forbidden-words') || path === '/api/admin/chat-messages' || path === '/api/admin/room-attendance' || path === '/api/admin/audit-logs' || path.startsWith('/api/admin/feedback-drafts/report-')) {
      const response = await handleAdminControlsApi(request, url, env);
      if (response) return response;
    }

    // briefing: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/briefing/')) {
      const response = await handleAdminBriefingApi(request, url, env);
      if (response) return response;
    }



    // ═══════════════════════════════════════════════════════════════
    // 💰 Phase AD — 미납 자동 에스컬레이션 (Auto Dunning)
    // ═══════════════════════════════════════════════════════════════
    /* ⏹ 껐습니다 (2026-08-17 사장님 지시) — 지운 것이 아니라 «끈» 것입니다.
         아래 DUNNING_RUN_ENABLED 를 true 로 바꾸면 예전 동작 그대로 돌아옵니다.

       왜 껐나 —
         이 경로는 매일 03:00(KST) cron 이 사람 없이 돌렸습니다(index.ts). 그런데
           · 읽는 표가 `payments` 인데 **17행짜리 껍데기**입니다.
             진짜 결제는 `student_payments`(11,643행)에 있고 둘은 이어져 있지 않습니다.
           · 스코프 필터가 없어 지사·대리점 구분 없이 전부 훑습니다.
           · 문구의 `[학생명]` 자리표시자가 **끝까지 안 채워집니다.**
           · 실제 발송 호출이 없습니다 — `dunning_log` 에 문구만 적습니다.
         그 결과 30일에 489번 돌며 로그만 1,065행 쌓였고(대상자는 28명),
         화면에는 「독촉이 돌고 있다」고 보였습니다. **실제로는 아무에게도 안 갔습니다.**
         돌지도 않는 것이 돌고 있는 것처럼 보이는 편이 더 위험합니다.

       ⚠️ 다시 켜기 전에 반드시 —
         ① `payments` 가 아니라 `student_payments` 를 읽게 고칠 것
         ② 스코프(getScope + scopeStudentCond)를 걸 것
         ③ `[학생명]` 을 실제 이름으로 채울 것
         ④ 학부모 전화번호를 확보할 것 — 지금 students_erp 29,398행 중 3개뿐입니다
         ⑤ **이미 보내는 경로(payments/notify-overdue)와 겹치지 않게** 할 것.
            둘 다 켜면 CLAUDE.md 의 「학부모에게 문자가 두 번 감」 그대로입니다.
       ⚠️ 기록 조회(GET /api/admin/dunning/log)는 그대로 둡니다 — 지난 이력은 봐야 합니다. */
    const DUNNING_RUN_ENABLED = false;
    if (method === 'POST' && path === '/api/admin/dunning/run') {
      if (!DUNNING_RUN_ENABLED) {
        return json({
          ok: false, error: 'dunning_disabled', disabled: true,
          message: '자동 독촉은 꺼져 있습니다. 실제로 보내지 않고 기록만 쌓던 기능이라 2026-08-17 에 껐습니다. 미납·미연장 안내는 「회계관리 → 수강료 미연장 자동 알림」을 쓰세요.',
          message_en: 'Auto-dunning is turned off. It logged messages without ever sending them; disabled 2026-08-17. Use Payments → overdue notice instead.',
        }, 503);
      }
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS dunning_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, stage TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);

        const now = Date.now();
        const day = 86400000;
        // 스테이지별 미납 — d1: 1~6일, d7: 7~13일, d14: 14일+
        const buckets: Array<{ stage: 'd1' | 'd7' | 'd14'; minDays: number; maxDays: number; tone: string }> = [
          { stage: 'd1',  minDays: 1,  maxDays: 6,   tone: '친근하고 부드러운' },
          { stage: 'd7',  minDays: 7,  maxDays: 13,  tone: '정중하지만 단호한' },
          { stage: 'd14', minDays: 14, maxDays: 9999, tone: '강한 경고와 긴급한' },
        ];

        const sentBy: Record<string, number> = { d1: 0, d7: 0, d14: 0 };
        const errors: any[] = [];

        for (const b of buckets) {
          const minTs = now - b.maxDays * day;
          const maxTs = now - b.minDays * day;
          const rs: any = await env.DB.prepare(`SELECT id, user_id, amount, due_at FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(minTs, maxTs).all();
          const items = (rs.results || []) as any[];
          for (const p of items) {
            // 24시간 내 같은 단계 발송 중복 방지
            try {
              const dup: any = await env.DB.prepare(`SELECT id FROM dunning_log WHERE user_id = ? AND stage = ? AND sent_at >= ?`).bind(p.user_id, b.stage, now - day).first();
              if (dup) continue;
            } catch {}

            const daysOverdue = Math.floor((now - p.due_at) / day);
            const amountWon = p.amount ? (p.amount / 10000).toFixed(0) + '만원' : '';
            let msg = '';
            try {
              if (env.AI) {
                const prompt = `학원 수강료 ${daysOverdue}일 연체 (${amountWon}) 안내 카톡 알림톡을 작성해 주세요. ${b.tone} 톤으로 한국어 존댓말, 3-4문장, 90자 이내. 학생 이름은 [학생명]으로 자리표시자만 두세요.`;
                const ai: any = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
                  messages: [
                    { role: 'system', content: 'You are a polite Korean parent-communication assistant for a kids English academy.' },
                    { role: 'user', content: prompt }
                  ],
                  max_tokens: 256,
                });
                msg = (ai?.response || '').trim();
              }
            } catch (aiErr: any) { errors.push({ user_id: p.user_id, error: aiErr?.message }); }

            if (!msg) {
              if (b.stage === 'd1')      msg = `안녕하세요. [학생명] 수강료가 ${daysOverdue}일 연체되었습니다. 확인 부탁드립니다. — 망고아이`;
              else if (b.stage === 'd7') msg = `[학생명] 수강료가 ${daysOverdue}일 연체되었습니다(${amountWon}). 금일 중 납부 부탁드립니다. — 망고아이`;
              else                       msg = `🚨 [학생명] 수강료 ${daysOverdue}일 연체(${amountWon}). 수업 중단 전 즉시 확인 바랍니다. — 망고아이`;
            }

            let status = 'queued';
            try {
              if ((env as any).KAKAO_TOKEN) {
                // 실 발송 hook — 기존 retention/care 패턴과 동일하게 큐 보관으로 시작
                status = 'sent';
              }
            } catch {}

            await env.DB.prepare(`INSERT INTO dunning_log (user_id, stage, message, sent_at, status) VALUES (?,?,?,?,?)`)
              .bind(p.user_id, b.stage, msg, now, status).run();
            sentBy[b.stage]++;
          }
        }

        return json({ ok: true, sent: sentBy, total: sentBy.d1 + sentBy.d7 + sentBy.d14, errors });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'dunning_failed' }, 500);
      }
    }

    if (method === 'GET' && path === '/api/admin/dunning/log') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS dunning_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, stage TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);`);
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
        // 통계
        const now = Date.now();
        const day = 86400000;
        let d1 = 0, d7 = 0, d14 = 0;
        try {
          await env.DB.exec(`CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);`);
          const r1: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(now - 6 * day, now - 1 * day).first();
          d1 = r1?.n || 0;
          const r7: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at >= ? AND due_at <= ?`).bind(now - 13 * day, now - 7 * day).first();
          d7 = r7?.n || 0;
          const r14: any = await env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE (paid_at IS NULL OR paid_at = 0) AND due_at < ?`).bind(now - 14 * day).first();
          d14 = r14?.n || 0;
        } catch {}
        const rs: any = await env.DB.prepare(`SELECT id, user_id, stage, message, sent_at, status FROM dunning_log ORDER BY sent_at DESC LIMIT ?`).bind(limit).all();
        return json({ ok: true, items: rs.results || [], stats: { d1, d7, d14 } });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'dunning_log_failed' }, 500);
      }
    }


    // (🤖 Phase PFB 학부모 상담챗봇 → api-students.ts — 4차 이동)

    // ═══════════════════════════════════════════════════════════════
    // 📅 Phase AS — AI 주간 시간표 자동 짜기 (Auto Weekly Schedule)
    // ═══════════════════════════════════════════════════════════════
    if (method === 'POST' && path === '/api/admin/schedule/auto') {
      try {
        // ⚠️ (2026-08-09) 여기 있던 CREATE TABLE class_schedules (student_uid, teacher_uid, day, time, mbti_score …) 를 지웠다.
        //   그 표는 이미 다른 모양으로 존재한다(user_id · teacher_id · day_of_week · start_time …).
        //   IF NOT EXISTS 라 아무 일도 안 일어나면서, 「이 표는 이런 모양」이라는 **거짓 설명**만 남아
        //   아래 /schedule/approve 의 INSERT 가 그 거짓을 믿고 짜여 매번 실패했다.

        // Teachers (active)
        let teachers: any[] = [];
        try {
          const rs: any = await env.DB.prepare(`SELECT id, korean_name AS name, available_days, available_hours, group_name FROM teacher_profiles WHERE status IS NULL OR status = '활동중' LIMIT 200`).all();
          teachers = rs.results || [];
        } catch {}
        // 강사 MBTI 사전 (선택)
        const teacherMbti: Record<string, string> = {};
        try {
          const rs: any = await env.DB.prepare(`SELECT teacher_id, mbti FROM teacher_mbti`).all();
          for (const r of (rs.results || []) as any[]) teacherMbti[String(r.teacher_id)] = String(r.mbti || '');
        } catch {}

        // Students (active)
        let students: any[] = [];
        try {
          const cols: any = await env.DB.prepare(`PRAGMA table_info(students_erp)`).all();
          const colNames = ((cols.results || []) as any[]).map(c => c.name);
          const nCol = colNames.includes('student_name') ? 'student_name' : (colNames.includes('korean_name') ? 'korean_name' : (colNames.includes('name') ? 'name' : 'user_id'));
          const prefCol = colNames.includes('preferred_time') ? 'preferred_time' : `'오후 4-7시' AS preferred_time`;
          const mbtiCol = colNames.includes('mbti') ? 'mbti' : `'' AS mbti`;
          const rs: any = await env.DB.prepare(`SELECT user_id, ${nCol} AS student_name, ${prefCol}, ${mbtiCol} FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status = '' LIMIT 300`).all();
          students = rs.results || [];
        } catch {}

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const slots = ['16:00', '17:00', '18:00', '19:00', '20:00'];

        // MBTI 호환 점수 (단순 휴리스틱)
        function mbtiMatch(a: string, b: string): number {
          if (!a || !b || a.length !== 4 || b.length !== 4) return 50;
          let score = 0;
          for (let i = 0; i < 4; i++) if (a[i] === b[i]) score += 25;
          return score;
        }

        const proposed: any[] = [];
        const teacherSlotUsed = new Set<string>();
        let ti = 0;
        for (const s of students) {
          if (!teachers.length) break;
          // 학생 선호 시간 파싱
          const pref = String(s.preferred_time || '오후 4-7시');
          const hourMatch = pref.match(/(\d{1,2})\s*[-~]\s*(\d{1,2})/);
          let candidateSlots = slots;
          if (hourMatch) {
            const lo = parseInt(hourMatch[1]); const hi = parseInt(hourMatch[2]);
            candidateSlots = slots.filter(t => {
              const h = parseInt(t.split(':')[0]);
              return h >= lo && h < hi + 12; // 오후 처리 단순화
            });
            if (!candidateSlots.length) candidateSlots = slots;
          }

          let best: any = null;
          for (let attempt = 0; attempt < teachers.length; attempt++) {
            const t = teachers[(ti + attempt) % teachers.length];
            const tMbti = teacherMbti[String(t.id)] || '';
            const score = mbtiMatch(s.mbti, tMbti);
            // 사용 가능한 day/slot 찾기
            const tDays = String(t.available_days || 'Mon,Tue,Wed,Thu,Fri').split(/[,\s]+/);
            for (const d of days) {
              if (!tDays.includes(d) && t.available_days) continue;
              for (const slot of candidateSlots) {
                const key = `${t.id}|${d}|${slot}`;
                if (teacherSlotUsed.has(key)) continue;
                if (!best || score > best.mbti_score) {
                  best = { teacher: t, day: d, time: slot, mbti_score: score, t_mbti: tMbti };
                }
                if (score >= 75) break;
              }
              if (best && best.mbti_score >= 75) break;
            }
            if (best && best.mbti_score >= 75) break;
          }

          if (best) {
            teacherSlotUsed.add(`${best.teacher.id}|${best.day}|${best.time}`);
            proposed.push({
              student_uid: s.user_id,
              student_name: s.student_name,
              student_mbti: s.mbti || '',
              teacher_uid: String(best.teacher.id),
              teacher_name: best.teacher.name,
              teacher_mbti: best.t_mbti,
              day: best.day,
              time: best.time,
              mbti_score: best.mbti_score,
            });
            ti = (ti + 1) % teachers.length;
          }
        }

        return json({ ok: true, count: proposed.length, rows: proposed, teachers_count: teachers.length, students_count: students.length });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'schedule_auto_failed' }, 500);
      }
    }

    if (method === 'POST' && path === '/api/admin/schedule/approve') {
      try {
        // 🔧 (2026-08-09) 이 기능은 «한 건도 저장하지 않으면서 성공했다고» 답하고 있었다.
        //   사슬:
        //     ① 여기서 class_schedules 를 student_uid/teacher_uid/day/time/mbti_score 로 만들려 했다
        //     ② 그런데 그 표는 이미 있다 → IF NOT EXISTS 라 **아무 일도 안 일어난다**
        //        운영 실제 컬럼: user_id · teacher_id · day_of_week · start_time · scheduled_date …
        //     ③ 아래 INSERT 가 「no such column: student_uid」 로 매번 실패
        //     ④ 그 실패를 catch {} 가 조용히 삼킴 → inserted 는 0
        //     ⑤ return { ok:true, inserted:0 } — 화면엔 성공으로 보인다
        //   ①의 CREATE 를 지우고, INSERT 를 **운영 실제 컬럼**에 맞춘다.
        //   (mbti_score 는 표에 자리가 없어 notes 에 남긴다 — 값을 버리지 않기 위해)
        const b: any = await request.json().catch(() => ({}));
        const rows = Array.isArray(b.rows) ? b.rows : [];
        if (!rows.length) return json({ ok: false, error: 'rows_required' }, 400);
        const now = Date.now();
        let inserted = 0;
        const failures: string[] = [];
        for (const r of rows) {
          try {
            await env.DB.prepare(
              `INSERT INTO class_schedules (user_id, teacher_id, day_of_week, start_time, duration_min, schedule_kind, source, status, notes, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)`
            ).bind(
              String(r.student_uid || ''), String(r.teacher_uid || ''),
              String(r.day || ''), String(r.time || ''),
              // ⚠️ duration_min 은 반드시 명시한다 — 운영 표의 DEFAULT 가 옛 정책(30분)이라
              //   생략하면 30 이 들어간다(class-policy.ts 주석). 하니스가 이 누락을 잡는다.
              Number(r.duration_min) || DEFAULT_CLASS_MINUTES,
              'weekly', 'ai_auto', 'proposed',
              `mbti_score=${Number(r.mbti_score || 0)}`, now
            ).run();
            inserted++;
          } catch (e: any) {
            // ⚠️ 조용히 삼키지 않는다 — 위 ④가 이 기능을 죽여 놓고도 성공으로 보이게 한 원인이다.
            if (failures.length < 5) failures.push(String(e?.message || e));
          }
        }
        if (!inserted && failures.length) {
          console.warn('[schedule/approve] 전건 실패:', failures[0]);
          return json({ ok: false, error: 'insert_failed', inserted: 0, detail: failures[0] }, 500);
        }
        return json({ ok: true, inserted, failed: rows.length - inserted, ...(failures.length ? { errors: failures } : {}) });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || 'schedule_approve_failed' }, 500);
      }
    }


    // ═══════════════════════════════════════════════════════════════
    // 📈 Phase RCF — AI 매출/이탈 예측 (Revenue & Churn Forecast)
    // ═══════════════════════════════════════════════════════════════
    if (path === '/api/admin/forecast/revenue' || path === '/api/admin/forecast/churn' || path === '/api/admin/forecast/message') {
      const actor = await getAdminActor(request, env as any);
      if (!actor.ok) return json({ ok: false, error: 'auth_required' }, 401);
      if (actor.isTeacher) return json({ ok: false, error: 'forbidden' }, 403);
      const denied = orgScopeDenyResponse(orgScopeVerdict(await readScopeType(env, actor.username), actor.role));
      if (denied) return denied;
      const reply = (body: any, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
      try {
        if (path.endsWith('/message')) {
          if (method === 'GET') {
            const recipient = await counselingRecipient(env, String(url.searchParams.get('uid') || ''));
            return reply(recipient ? { ok: true, recipient } : { ok: false, error: 'student_not_found' }, recipient ? 200 : 404);
          }
          if (method === 'POST') {
            if (request.headers.get('Origin') !== url.origin) return reply({ ok: false, error: 'invalid_origin' }, 403);
            return reply(await sendCounselingSms(env, await parseJsonBody(request), actor.username));
          }
          return reply({ ok: false, error: 'method_not_allowed' }, 405);
        }
        if (method === 'GET') {
          if (path.endsWith('/revenue')) return reply(await loadRevenue(env.DB, notSeedSql()));
          const _care: any = await loadCare(env.DB, notSeedSql());
          /* 📞 (2026-10-13 케어 보드 2단계) «마지막 연락» 을 다섯 원천에서 읽어 덮는다 — 정본 lastContacts.
             ⚠️ 이 칸은 «사례» 가 아니라 «학생» 의 마지막 연락이다(지난 사례의 연락도 보인다 — 또 연락하지 않게).
             A(이탈 위험) 카드에서 보낸 문자·전화도 여기 «마지막 연락» 에 보인다. 더 최근 것만 덮는다. */
          try {
            const _rows: any[] = Array.isArray(_care.rows) ? _care.rows : [];
            const { map: _m, failed: _f } = await lastContacts(env.DB, _rows.map(r => r.user_id));
            _care.last_contact_ok = _f === 0;
            for (const r of _rows) {
              const c = _m.get(String(r.user_id));
              if (c && !(Number(r.contacted_at) >= c.at)) r.contacted_at = c.at;
              r.contact_via = c ? c.via : null;
            }
          } catch (e: any) { console.warn('[forecast] last_contact 실패:', e?.message); }
          return reply(_care);
        }
        // Churn care is saved explicitly; no message delivery or AI generation on page load.
        if (method === 'POST' && path.endsWith('/churn')) {
          if (request.headers.get('Origin') !== url.origin) return reply({ ok: false, error: 'invalid_origin' }, 403);
          const result = await saveCare(env.DB, await parseJsonBody(request), actor.username);
          return reply(result.body, result.status);
        }
        return reply({ ok: false, error: 'method_not_allowed' }, 405);
      } catch (e: any) {
        console.warn('[forecast]', e?.message);
        return reply({ ok: false, error: 'forecast_unavailable' }, 503);
      }
    }
    // families: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/family/') || path === '/api/admin/families' || path.startsWith('/api/family/') || path.startsWith('/api/alumni/')) {
      const response = await handleAdminFamiliesApi(request, url, env);
      if (response) return response;
    }

    // inquiries: unmatched paths continue through the original admin route order.
    if (path === '/api/consult-bot' || path === '/api/student/inquiry' || path.startsWith('/api/admin/inquiry/')) {
      const response = await handleAdminInquiriesApi(request, url, env);
      if (response) return response;
    }

    // bug-reports: unmatched paths continue through the original admin route order.
    if (path === '/api/bug-report' || path.startsWith('/api/admin/bug-reports')) {
      const response = await handleAdminBugReportsApi(request, url, env);
      if (response) return response;
    }


    // (💼 Phase G1~G2 급여정산·SR 연기변경·FD 피드백초안 13라우트 → api-admin.ts — admin 2회차)


    // (🤖 Phase A1~A2 AI 학습분석 → api-admin.ts — 14차)




    // ════════════════════════════════════════════════════════════
    if (path === '/api/admin/nps/stats' || path === '/api/admin/nps/send-monthly' || path === '/api/nps/respond') {
      try {
        await env.DB.exec(`CREATE TABLE IF NOT EXISTS nps_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, parent_phone TEXT, score INTEGER NOT NULL, comment TEXT, ym TEXT NOT NULL, created_at INTEGER NOT NULL);`);
      } catch {}
      const kstYm = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);

      // ── 통계 조회 ──
      if (method === 'GET' && path === '/api/admin/nps/stats') {
        const ym = (url.searchParams.get('ym') || kstYm());
        const agg: any = await env.DB.prepare(
          `SELECT COUNT(*) AS total, IFNULL(AVG(score),0) AS avg_score,
                  SUM(CASE WHEN score>=9 THEN 1 ELSE 0 END) AS promoters,
                  SUM(CASE WHEN score BETWEEN 7 AND 8 THEN 1 ELSE 0 END) AS passives,
                  SUM(CASE WHEN score<=6 THEN 1 ELSE 0 END) AS detractors
           FROM nps_responses WHERE ym = ?`
        ).bind(ym).first().catch(() => ({}));
        const total = agg?.total || 0;
        const promoters = agg?.promoters || 0;
        const passives = agg?.passives || 0;
        const detractors = agg?.detractors || 0;
        const promoter_pct = total > 0 ? Math.round(promoters * 100 / total) : 0;
        const detractor_pct = total > 0 ? Math.round(detractors * 100 / total) : 0;
        const nps = total > 0 ? (promoter_pct - detractor_pct) : 0;
        const cm = await env.DB.prepare(
          `SELECT score, comment, created_at FROM nps_responses WHERE ym = ? AND comment IS NOT NULL AND comment != '' ORDER BY created_at DESC LIMIT 10`
        ).bind(ym).all().catch(() => ({ results: [] }));
        return json({ ok: true, ym, nps, avg_score: Math.round((agg?.avg_score || 0) * 10) / 10, total, promoters, passives, detractors, promoter_pct, detractor_pct, recent_comments: (cm as any).results || [] });
      }

      // ── 월간 발송 (학부모 수만큼 큐 등록) ──
      if (method === 'POST' && path === '/api/admin/nps/send-monthly') {
        const cnt: any = await env.DB.prepare(
          `SELECT COUNT(*) AS n FROM students_erp WHERE status IN ('정상','활동','active') OR status IS NULL OR status=''`
        ).first().catch(() => ({ n: 0 }));
        return json({ ok: true, queued: cnt?.n || 0, ym: kstYm() });
      }

      // ── 응답 수집 (학부모) ──
      if (method === 'POST' && path === '/api/nps/respond') {
        const b: any = await parseJsonBody(request);
        const score = Math.max(0, Math.min(10, parseInt(b?.score, 10) || 0));
        const ym = (b?.ym || kstYm());
        await env.DB.prepare(
          `INSERT INTO nps_responses (user_id, student_name, parent_phone, score, comment, ym, created_at) VALUES (?,?,?,?,?,?,?)`
        ).bind(b?.user_id || null, b?.student_name || null, b?.parent_phone || null, score, b?.comment || null, ym, Date.now()).run();
        return json({ ok: true });
      }
    }
    // subscriptions: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/subscriptions' || path.startsWith('/api/admin/subscription/') || path === '/api/subscription/create' || path.startsWith('/api/admin/billing/')) {
      const response = await handleAdminSubscriptionsApi(request, url, env);
      if (response) return response;
    }

    // library: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/textbook-') || path.startsWith('/api/textbook-files')) {
      const response = await handleAdminLibraryApi(request, url, env, ctx);
      if (response) return response;
    }

    // class-monitor: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/live-classes' || path === '/api/admin/classes-now') {
      const response = await handleAdminClassMonitorApi(request, url, env);
      if (response) return response;
    }

    // video-catalog: unmatched paths continue through the original admin route order.
    if (path === '/api/mango-videos' || path.startsWith('/api/admin/mango-videos')) {
      const response = await handleAdminVideoCatalogApi(request, url, env);
      if (response) return response;
    }


    // ===== 관리자 개입: 녹화 상태 변경 (Phase 4) =====
    //   PATCH /api/recordings/:id/status  body: { status: 'completed' | 'deleted' | 'aborted' }  ('ended' 는 옛 이름)
    //     - 기존 DELETE /api/recordings/:id 는 deleted 로만 변경 가능 → 복원(ended) 을 이걸로 처리
    if (method === 'PATCH' && /^\/api\/recordings\/\d+\/status$/.test(path)) {
      const m = path.match(/^\/api\/recordings\/(\d+)\/status$/);
      const id = m ? parseInt(m[1], 10) : 0;
      if (!id) return invalidBody(['id(path)']);
      const b = await parseJsonBody(request);
      if (!b || !b.status) return invalidBody(['status']);
      const allowed = new Set(['ended', 'completed', 'deleted', 'aborted']);
      if (!allowed.has(b.status)) {
        return json({ ok: false, error: 'invalid_status', allowed: Array.from(allowed) }, 400);
      }
      /* 🔴 2026-08-28 두 가지를 함께 고쳤다.
         ① 「복원」이 status='ended' 를 썼는데 **저장소 어디도 그 값을 모른다** — D1 실측
            2,022행의 상태는 completed·deleted·aborted·upload_failed·recording 다섯뿐이고
            'ended' 는 0건이다. 복원하면 배지 자리에 영문 코드가 날것으로 뜨고 「완료」
            집계에서도 빠졌다. → 'completed' 로 옮겨 적는다(옛 이름도 계속 받아 준다).
         ② 보관기간이 끝난 녹화는 R2 파일이 이미 지워졌다. 그걸 그대로 「완료」로 되돌리면
            **«완료인데 영상 없음»** — 이 저장소가 8/26 에 고친 바로 그 사고를 다시 만든다.
            → 되살릴 때는 실물을 head() 로 «봤을 때만» 완료로 올린다.
         ⚠️ 조회 자체가 실패하면(예외) 막지 않는다 — 통과시키는 쪽으로 실패한다. */
      let nextStatus = b.status === 'ended' ? 'completed' : b.status;
      if (nextStatus === 'completed') {
        const cur = await env.DB.prepare(`SELECT file_url FROM recordings WHERE id = ?`)
          .bind(id).first<{ file_url: string | null }>();
        const key = String(cur?.file_url || '');
        /* ⚠️ 키가 «아예 없는» 행(옛 local 저장분 등)은 확인할 대상조차 없다 —
           그대로 「완료」로 올리면 «완료인데 영상 없음» 이 새로 생긴다. 그건 막는다.
           반대로 외부 http(s) 주소는 우리가 확인할 수 없으니 예전처럼 통과시킨다. */
        const isExternal = /^https?:\/\//.test(key);
        const isJunk = key.startsWith('CLIENT_ERR:') || key.startsWith('DEBUG:');
        if (!key || isJunk) {
          return json({
            ok: false, error: 'file_gone',
            message: '이 녹화에는 영상 파일 위치가 남아 있지 않아 복원할 수 없습니다. 기록만 남아 있습니다.',
            message_en: 'This recording has no stored file location, so it cannot be restored.',
          }, 409);
        }
        const looksLikeKey = !isExternal;
        const bucket = (env as any).RECORDINGS as R2Bucket | undefined;
        if (looksLikeKey && bucket) {
          let proven = false, checked = false;
          try { proven = !!(await bucket.head(key)); checked = true; } catch { checked = false; }
          if (checked && !proven) {
            return json({
              ok: false, error: 'file_gone',
              /* ⛔ 사유를 단정하지 않는다 — 여기서 잰 것은 «R2 에 그 키가 없다» 까지다.
                 보관기간 만료일 수도, 애초에 업로드가 실패했던 것일 수도 있다.
                 게다가 2026-09-02 부터 보관기간이 3개월(기존분)과 6개월(신규분)로 섞여 있어
                 한 숫자로 사유를 적으면 어느 쪽이든 거짓이 된다. */
              message: '영상 파일이 남아 있지 않아 복원할 수 없습니다. 기록만 남아 있습니다.',
              message_en: 'No video file remains for this recording, so it cannot be restored. Only the record is left.',
            }, 409);
          }
        }
      }
      await env.DB.prepare(`UPDATE recordings SET status = ? WHERE id = ?`).bind(nextStatus, id).run();
      return json({ ok: true, id, status: nextStatus });
    }
    // school-attendance: unmatched paths continue through the original admin route order.
    if (path === '/api/admin/attendance/long-absent' || path === '/api/admin/attendance/school-stats' || path === '/api/admin/attendance/today') {
      const response = await handleAdminSchoolAttendanceApi(request, url, env);
      if (response) return response;
    }

    // teacher-contacts: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/teacher-links') || path === '/api/admin/teacher-contacts') {
      const response = await handleAdminTeacherContactsApi(request, url, env);
      if (response) return response;
    }


    /* ── 💳 법인카드(신한) — CODEF 연동 (corpcard-sync.ts) ──────────────────────
       admin.html 「법인카드 사용내역」 카드가 부른다. CODEF 키(secret) 3개가 없으면
       ok:false + codef_not_configured 로 답하고 화면은 «미연동» 을 그대로 보여 준다.
       ⚠️ 새 API 등록 3종 세트를 잊지 말 것: index.ts 게이트 + api-mango 위임 가드
          + (재무 데이터라) index.ts TEACHER_BLOCKED_PREFIXES — 셋 다 했다(2026-08-13). */
    if (method === 'POST' && path === '/api/admin/corpcard/sync') {
      /* 🔀 프로바이더 선택 (2026-08-14) — 바로빌 키가 있으면 바로빌, 없으면 기존 CODEF.
         CODEF 정식 견적이 월 80만원이라 바로빌(월 3,300원)로 옮기는 중이다. 두 경로를
         함께 두는 이유: 시크릿만 넣으면 전환되고, 문제가 생겨도 되돌릴 자리가 남는다. */
      /* 🏦 계좌도 같이 — «신한 동기화» 버튼 하나로 카드+계좌를 함께 당긴다(2026-08-14).
         계좌번호 시크릿이 없으면 조용히 건너뛰지 않고 결과에 «왜 안 했는지» 를 싣는다. */
      const bank = bankConfigured(env)
        ? await runBankSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }))
        : { ok: false, error: 'bankacct_not_configured', missing: bankMissing(env) };
      if (barobillConfigured(env)) {
        const sync = await runBarobillSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
        const data = await corpcardData(env, url.searchParams.get('month') || undefined);
        const status = await corpcardStatus(env, data).catch(() => null);
        return json({ ok: true, provider: 'barobill', sync, bank, data, status });
      }
      if (!corpcardConfigured(env)) {
        return json({
          ok: false, error: 'not_configured',
          missing_barobill: baroMissing(env),
          bank,
          message: '카드사 연동 키가 등록되지 않았습니다. 바로빌 시크릿 4개(BAROBILL_CERTKEY/CORPNUM/ID/CARDNUM)를 등록하면 바로 동작합니다.',
          message_en: 'No card provider keys configured. Set the four BAROBILL_* secrets.',
        });
      }
      const sync = await runCorpCardSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      const data = await corpcardData(env, url.searchParams.get('month') || undefined);
      const status = await corpcardStatus(env, data).catch(() => null);
      return json({ ok: true, sync, bank, data, status });
    }

    /* ── 🏦 신한은행 계좌 입출금 (bankacct-sync.ts) ────────────────────────────
       급여 이체·임대료처럼 계좌에서 바로 나가는 돈. 손익계산서(reports/statement)가
       이 테이블(bankacct_transactions)의 출금분을 실지출로 읽는다.
       ⚠️ 새 API 등록 3종 세트: index.ts 게이트 + api-mango 위임 가드
          + (재무 데이터라) TEACHER_BLOCKED_PREFIXES — 셋 다 했다(2026-08-14). */
    if (method === 'POST' && path === '/api/admin/bankacct/sync') {
      if (!bankConfigured(env)) {
        return json({
          ok: false, error: 'not_configured', missing: bankMissing(env),
          message: '계좌 연동 키가 없습니다. BAROBILL_BANK_ACCTNUM(계좌번호)을 등록하면 켜집니다(CERTKEY·CORPNUM·ID 는 카드 연동과 공유).',
          message_en: 'Bank sync not configured. Set BAROBILL_BANK_ACCTNUM.',
        });
      }
      const sync = await runBankSync(env).catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      const data = await bankacctData(env, url.searchParams.get('month') || undefined);
      const status = await bankacctStatus(env, data).catch(() => null);
      return json({ ok: true, provider: 'barobill-bank', sync, data, status });
    }
    /* 🧪 자가진단 — 실제 조회하되 dryRun 으로 적재만 안 한다(카드 selftest 와 같은 방식) */
    if (method === 'POST' && path === '/api/admin/bankacct/selftest') {
      if (!bankConfigured(env)) {
        return json({ ok: false, error: 'not_configured', missing: bankMissing(env) });
      }
      const result = await runBankSync(env, { dryRun: true })
        .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      return json({ ok: true, provider: 'barobill-bank', demo: false, result });
    }
    if (method === 'GET' && path === '/api/admin/bankacct/transactions') {
      const data = await bankacctData(env, url.searchParams.get('month') || undefined);
      const status = await bankacctStatus(env, data).catch(() => null);
      return json({ ok: true, configured: bankConfigured(env), missing: bankMissing(env), data, status });
    }

    /* 🧪 연동 자가진단  POST /api/admin/corpcard/selftest
       «키가 맞나 / CODEF 가 응답하나 / 파싱이 되나» 를 샌드박스 호스트로 확인한다.
       ⛔ 돌아오는 건 CODEF 의 데모 거래다. 그래서 dryRun 고정 — D1 에 한 줄도 안 쓰고,
          «마지막 동기화» 기록도 안 덮는다. 화면에서도 회계 표가 아니라 진단 상자에만 뜬다. */
    if (method === 'POST' && path === '/api/admin/corpcard/selftest') {
      /* 바로빌은 «연습용 응답» 이라는 개념이 없다(실계정 = 실데이터). 그래서 자가진단도
         실제 조회를 하되 dryRun 으로 **적재만 안 한다** — 접속·인증·파싱까지 확인된다. */
      if (barobillConfigured(env)) {
        const result = await runBarobillSync(env, { dryRun: true })
          .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
        return json({ ok: true, provider: 'barobill', demo: false, result });
      }
      if (!corpcardConfigured(env)) {
        return json({ ok: false, error: 'not_configured', missing_barobill: baroMissing(env) });
      }
      const result = await runCorpCardSync(env, { base: CODEF_SANDBOX_BASE, dryRun: true })
        .catch((e: any) => ({ ok: false, errors: [String(e?.message || e)] }));
      return json({ ok: true, demo: true, result });
    }
    if (method === 'GET' && path === '/api/admin/corpcard/transactions') {
      const configured = corpcardConfigured(env);
      // 🔬 진단(2026-08-13): 시크릿 4개를 등록했는데 런타임이 codef_not_configured 를 돌려줘,
      //    «활성 배포판에 어떤 키가 보이는지» 를 불리언으로만 노출한다(값은 절대 노출 금지).
      const have = {
        client_id: !!(env as any).CODEF_CLIENT_ID,
        client_secret: !!(env as any).CODEF_CLIENT_SECRET,
        connected_id: !!(env as any).CODEF_CONNECTED_ID,
        api_base: (env as any).CODEF_API_BASE || null,
        // env 에 실린 바인딩 «이름» 전부(값 없음) — 시크릿이 env 로 안 오는 계층을 찾는 중
        env_keys: Object.keys(env as any).sort(),
        // 길이만(값 미노출): 원본 vs ASCII 소독 후 — 붙여넣기 오염(제어문자·CR) 판정용
        id_len: [String((env as any).CODEF_CLIENT_ID || '').length, String((env as any).CODEF_CLIENT_ID || '').replace(/[^\x20-\x7E]/g, '').trim().length],
        secret_len: [String((env as any).CODEF_CLIENT_SECRET || '').length, String((env as any).CODEF_CLIENT_SECRET || '').replace(/[^\x20-\x7E]/g, '').trim().length],
        // 지문(SHA-256 앞 8자리, 값 미노출) — 로컬에서 성공한 키와 «같은 값»인지 대조용
        id_fp: await secretFp8((env as any).CODEF_CLIENT_ID),
        secret_fp: await secretFp8((env as any).CODEF_CLIENT_SECRET),
      };
      // 💳 바로빌 진단 — 값은 절대 노출하지 않고 «어느 항목이 비었는지» 이름만 (2026-08-14)
      const barobill = {
        configured: barobillConfigured(env),
        missing: baroMissing(env),
        ws: baroCreds(env).ws,          // 접속 주소는 값이 아니라 설정이라 그대로 보여 준다
      };
      const data = await corpcardData(env, url.searchParams.get('month') || undefined);
      const status = await corpcardStatus(env, data).catch(() => null);
      /* ⚠️ (2026-08-13) 예전엔 여기서 «적재분이 없으면 codef_not_configured» 로 답했다.
         그래서 키가 멀쩡한데도(=샌드박스 계정이라 조회만 막힌 상태) 화면은 «연동 안 됨» 이라고
         말했고, 진짜 원인(CF-00017)은 아무 데도 안 보였다. 이제는 항상 ok:true 로 답하고
         «무엇이 왜 비었는지» 는 status 가 설명한다. */
      return json({ ok: true, configured, have, barobill, data, status });
    }
    // referrals: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/admin/referrals') || path.startsWith('/api/referral/')) {
      const response = await handleAdminReferralsApi(request, url, env);
      if (response) return response;
    }

    // counseling: unmatched paths continue through the original admin route order.
    if (path.startsWith('/api/counseling/') || path.startsWith('/api/admin/counseling/')) {
      const response = await handleAdminCounselingApi(request, url, env);
      if (response) return response;
    }


    // 🎮 (2026-08-11 삭제) 영어 배틀 leaderboard/history 핸들러 제거 — 카드·게이트째 삭제.
    //   game_progress(살아있는 게임 기록 테이블)는 건드리지 않는다 — 여기선 읽기만 했다.

    // ── 📷 QR 출결 — QR 생성(관리자) + 학생 체크인(공개, 토큰이 인증) ──
    //   프런트 계약(admin.html:7205): { ok, qr_url(상대경로), token, expires_at(ms) }
    //   흐름: 관리자 qr-gen → 학생 폰이 QR 의 /qr-checkin.html?token= 접속
    //        → 랜딩이 POST /api/attendance/check-in {token, user_id} → attendance upsert.
    //   경로 표기 주의: 학생용은 '/api/attendance/check-in'(대시) — index.ts 게이트 기등록 경로.
    //   기존 '/api/attendance/checkin'(무대시, 시그널링용)과는 다른 엔드포인트.
    if (path === '/api/admin/attendance/qr-gen' || path === '/api/attendance/check-in') {
      try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance_qr_tokens (token TEXT PRIMARY KEY, room_id TEXT NOT NULL, teacher_uid TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_count INTEGER DEFAULT 0);`); } catch {}
    }
    if (method === 'POST' && path === '/api/admin/attendance/qr-gen') {
      const b = await parseJsonBody(request);
      const roomId = String(b?.room_id || '').trim();
      const teacher = String(b?.teacher_uid || '').trim();
      if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(roomId)) return invalidBody(['room_id']);
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000; // 5분 유효 — 카드 안내 문구와 동일
      try {
        await env.DB.prepare(`INSERT INTO attendance_qr_tokens (token, room_id, teacher_uid, created_at, expires_at) VALUES (?,?,?,?,?)`).bind(token, roomId, teacher || null, now, expiresAt).run();
        try { await env.DB.prepare(`DELETE FROM attendance_qr_tokens WHERE expires_at < ?`).bind(now - 86400000).run(); } catch {} // 만료 하루 지난 토큰 청소
        return json({ ok: true, token, qr_url: `/qr-checkin.html?token=${token}`, room_id: roomId, expires_at: expiresAt });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'insert_failed' }, 500); }
    }
    if (method === 'POST' && path === '/api/attendance/check-in') {
      const b = await parseJsonBody(request);
      const token = String(b?.token || '').trim();
      const userId = String(b?.user_id || '').trim();
      if (!/^[a-f0-9]{32}$/.test(token)) return json({ ok: false, error: 'invalid_token' }, 400);
      if (!/^[A-Za-z0-9_.:@-]{1,128}$/.test(userId)) return invalidBody(['user_id']);
      const now = Date.now();
      try {
        const t = await env.DB.prepare(`SELECT token, room_id, expires_at FROM attendance_qr_tokens WHERE token = ?`).bind(token).first<any>();
        if (!t) return json({ ok: false, error: 'token_not_found' }, 404);
        if (Number(t.expires_at) < now) return json({ ok: false, error: 'token_expired', expired: true }, 410);
        const roomId = String(t.room_id);
        const date = today(now);
        // attendance upsert — /api/attendance/checkin(api-mango.ts) 과 동일한 스키마·status 관례
        try { await env.DB.exec(`CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT, role TEXT DEFAULT 'student', joined_at INTEGER NOT NULL, left_at INTEGER, status TEXT DEFAULT 'present', date TEXT, attended_at INTEGER, total_session_ms INTEGER DEFAULT 0, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0);`); } catch {}
        const existing = await env.DB.prepare(`SELECT id, status FROM attendance WHERE user_id = ? AND room_id = ? AND date = ? ORDER BY joined_at DESC LIMIT 1`).bind(userId, roomId, date).first<any>();
        if (existing) {
          await env.DB.prepare(`UPDATE attendance SET status = 'attended', attended_at = COALESCE(attended_at, ?), username = COALESCE(username, ?) WHERE id = ?`).bind(now, b?.username || null, existing.id).run();
        } else {
          await env.DB.prepare(`INSERT INTO attendance (room_id, user_id, username, role, joined_at, attended_at, status, date) VALUES (?,?,?,'student',?,?,'attended',?)`).bind(roomId, userId, b?.username || null, now, now, date).run();
        }
        try { await env.DB.prepare(`UPDATE attendance_qr_tokens SET used_count = used_count + 1 WHERE token = ?`).bind(token).run(); } catch {}
        return json({ ok: true, room_id: roomId, user_id: userId, date, status: 'attended', attended_at: now, already: !!existing });
      } catch (e: any) { return json({ ok: false, error: e?.message || 'checkin_failed' }, 500); }
    }

  return null;  // 이 도메인 라우트가 아님 → 호출측이 기존 라우팅 계속
}


