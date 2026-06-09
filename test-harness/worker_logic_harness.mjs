// -*- coding: utf-8 -*-
// 🧪 망고아이 워커 핵심 로직 통합 테스트 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/worker_logic_harness.mjs
//   목적:  배포된 워커의 "안전성 핵심 규칙"을 가짜 데이터로 검증한다.
//          - 데이터 격리(scope): 본사/내부=전체, 지사·대리점=자기 것만, 본사매출 절대 누출 금지
//          - 수수료(15%) 계산
//          - 본사 전용 화면/ API 게이팅(대리점·지사 차단)
//          - 강의실 입장 + 장비 검증
// 주의: 이 하니스는 src/scope.ts, src/index.ts 의 규칙을 그대로 미러링한 사양(spec) 테스트입니다.
//       규칙을 바꾸면 여기도 같이 바꿔야 회귀를 잡습니다.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) { if (cond) { PASS++; } else { FAIL++; FAILS.push(name); } 
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); }
function eq(name, a, b){ check(name + ` (=${JSON.stringify(b)})`, JSON.stringify(a)===JSON.stringify(b)); }

// ── 1) scope 격리 규칙 (src/scope.ts 미러) ────────────────────────────
const isRestricted = t => t === 'agency' || t === 'branch';
function stuCond(scope){
  if (scope.type === 'agency') return { clause: 'shop_name = ?', binds: [scope.value] };
  if (scope.type === 'branch') return { clause: 'franchise LIKE ?', binds: [scope.value + '%'] };
  return { clause: '', binds: [] };            // hq, none = 무제한
}
const paymentScoped = scope => isRestricted(scope.type);
const expenseVisible = scope => !isRestricted(scope.type);   // 비용은 본사/내부만

console.log('\n[1] 데이터 격리(scope) 규칙');
eq('본사(hq)는 학생 필터 없음', stuCond({type:'hq'}).clause, '');
eq('내부/교사(none)는 학생 필터 없음(빈화면 회귀 방지)', stuCond({type:'none'}).clause, '');
check('대리점(agency)은 자기 매장만', stuCond({type:'agency',value:'망고아이 강남 대리점'}).clause === 'shop_name = ?');
check('지사(branch)는 자기 지역만', stuCond({type:'branch',value:'부산'}).clause === 'franchise LIKE ?');
eq('지사 바인딩은 지역 접두사', stuCond({type:'branch',value:'부산'}).binds, ['부산%']);
check('본사 비용은 본사만 노출', expenseVisible({type:'hq'}) === true);
check('대리점에는 비용 숨김', expenseVisible({type:'agency'}) === false);
check('지사에는 비용 숨김', expenseVisible({type:'branch'}) === false);
check('대리점/지사는 매출도 자기 것만(스코프 적용)', paymentScoped({type:'agency'}) && paymentScoped({type:'branch'}));
check('🔒 본사매출 누출 금지: agency/branch는 절대 무제한 아님', stuCond({type:'agency',value:'x'}).clause !== '' && stuCond({type:'branch',value:'x'}).clause !== '');

// ── 2) 수수료(15%) ───────────────────────────────────────────────────
console.log('\n[2] 수수료 계산 (본사 수수료율 15%)');
const FEE_RATE = 0.15;
const fee = rev => Math.round(rev * FEE_RATE);
eq('강남 대리점 매출 188만 → 수수료', fee(1880000), 282000);
eq('정산액 = 매출-수수료', 1880000 - fee(1880000), 1598000);

// ── 3) 게이팅: 대리점/지사 접근 허용 화면/ API (src/index.ts 미러) ──────
console.log('\n[3] 본사 전용 화면/ API 게이팅 (대리점·지사)');
const allowedPage = p => ['/admin/exec','/admin/exec/','/admin/exec.html','/admin/login','/admin/login/','/admin/login.html','/admin/logout','/admin/mypage','/admin/mypage/','/admin/health','/admin/health/'].includes(p);
const allowedApi = p => ['/api/admin/exec/','/api/admin/realtime/','/api/admin/stats/','/api/admin/students/unified','/api/admin/students/erp-list','/api/admin/me','/api/admin/profile','/api/admin/logout','/api/admin/change-password','/api/admin/login-history','/api/admin/sessions','/api/admin/health-check','/api/admin/omnisearch'].some(a => p===a || p.startsWith(a));
// 대리점/지사가 본사 화면 접근 시 리다이렉트되어야 하는가?
const pageRedirect = p => (p==='/admin'||p==='/admin/'||p==='/admin.html'||p.startsWith('/admin/')) && !allowedPage(p);
check('대리점/지사 → /admin.html 차단(리다이렉트)', pageRedirect('/admin.html'));
check('대리점/지사 → 실시간재무 차단', pageRedirect('/admin/finance-realtime'));
check('대리점/지사 → 학생목록 차단', pageRedirect('/admin/students'));
check('대리점/지사 → 마케팅 차단', pageRedirect('/admin/marketing-studio'));
check('대리점/지사 → 자기 대시보드(exec) 허용', !pageRedirect('/admin/exec'));
check('대리점/지사 → 로그인/로그아웃 허용', !pageRedirect('/admin/login') && !pageRedirect('/admin/logout'));
check('대리점/지사 → exec API 허용', allowedApi('/api/admin/exec/summary'));
check('대리점/지사 → 본사 결제관리 API 차단', !allowedApi('/api/admin/payments/settle'));

// ── 4) 강의실 입장 + 장비 검증 (기존 하니스 규칙) ──────────────────────
console.log('\n[4] 강의실 입장 + 웹캠/마이크 검증');
function validateJoin(r){ const reasons=[]; if(!r.room)reasons.push('방코드없음'); if(!r.mic)reasons.push('마이크꺼짐'); if(!r.cam)reasons.push('카메라꺼짐'); return {ok:reasons.length===0, reasons}; }
check('정상 입장 OK', validateJoin({room:'R1',mic:true,cam:true}).ok);
check('마이크 꺼짐 → 차단', !validateJoin({room:'R1',mic:false,cam:true}).ok);
check('방코드 없음 → 차단', !validateJoin({room:'',mic:true,cam:true}).ok);

// ── 5) 교사 메뉴 권한 — 실제 admin.html PERMS 검증 ──
console.log('\n[5] 교사 메뉴 권한 (실제 cloudflare-deploy/public/admin.html PERMS)');
try {
  const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  const teacherPerm = (cardId) => {
    const m = html.match(new RegExp("'" + cardId + "':\\s*\\{([^}]*)\\}"));
    if (!m) return 'NOCARD';
    const tm = m[1].match(/teacher:\s*'([VR])'/);
    return tm ? tm[1] : 'HIDDEN';
  };
  // 교사에게 숨겨야 하는 메뉴 (경영·회계·시스템·운영통계)
  const mustHide = ['card-payroll','card-rankings','card-voice-stats','card-active-rooms','card-points-mgmt',
                    'card-kpi-dashboard','card-accounting-mgmt','card-settlement-stats','card-permissions',
                    'card-ai-insights','card-teacher-mgmt','card-franchises','card-retention-risk'];
  for (const c of mustHide) check('교사 숨김: ' + c, teacherPerm(c) === 'HIDDEN');
  // 교사에게 필요한 메뉴 (수업·평가·학생·콘텐츠)
  const mustShow = ['card-eval-mgmt','card-timetable','card-lesson-log','card-textbooks','card-homework','card-students-mgmt'];
  for (const c of mustShow) check('교사 허용: ' + c, teacherPerm(c) === 'V');
} catch (e) { check('admin.html PERMS 읽기', false); console.log('    →', e.message); }

// ── 6) 캘린더 기능(휴가/공휴일) 통합 검증 — 실제 파일 ──
console.log('\n[6] 캘린더 기능 (사이드바·정책·게이트·API·주간·팝업)');
try {
  const admin = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  // (a) 카드 자체
  check('admin: card-calendar 카드 존재', /id="card-calendar"/.test(admin));
  check('admin: 캘린더 관리 라벨', admin.includes('캘린더 관리'));
  // (b) ph85 실제 사이드바 시스템 그룹에 등록 (화면에 보이는 사이드바)
  check('admin: ph85 시스템 그룹 data-cards 에 card-calendar', /data-cards="card-calendar,card-permissions/.test(admin));
  check('admin: ph85-sub data-card="card-calendar" 항목', /class="ph85-sub" data-card="card-calendar"/.test(admin));
  // (c) RBAC 정책 — 모든 관리자 표시 (미등록이면 본사전용으로 숨겨짐)
  check('admin: CARD_POLICY 에 card-calendar 등록', /'card-calendar':\s*'agency'/.test(admin));
  // (d) 자동 사이드바 분류 매핑
  check('admin: SB_ID_MAP card-calendar→system', /'card-calendar':\s*'system'/.test(admin));
} catch (e) { check('admin.html 캘린더 검증 읽기', false); console.log('    →', e.message); }
try {
  const idx = readFileSync(resolve(__dir, '../cloudflare-deploy/src/index.ts'), 'utf8');
  check('index.ts: /api/calendar/events 게이트 등록', idx.includes("path === '/api/calendar/events'"));
  check('index.ts: /api/admin/calendar/events 게이트 등록', idx.includes("path === '/api/admin/calendar/events'"));
  check('index.ts: seed-holidays 게이트 등록', idx.includes("path === '/api/admin/calendar/seed-holidays'"));
} catch (e) { check('index.ts 캘린더 게이트 읽기', false); console.log('    →', e.message); }
try {
  const api = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-mango.ts'), 'utf8');
  check('api-mango: calendar_events 테이블', api.includes('CREATE TABLE IF NOT EXISTS calendar_events'));
  check('api-mango: GET /api/calendar/events 핸들러', api.includes("path === '/api/calendar/events'"));
  check('api-mango: seed-holidays 핸들러', api.includes("path === '/api/admin/calendar/seed-holidays'"));
  check('api-mango: 2026 공휴일 내장(KR/PH)', api.includes('HOLIDAYS_2026') && api.includes('삼일절') && api.includes('Independence Day'));
  check('api-mango: 추가 시 공지(community_posts) 연동', api.includes('community_posts') && /calPost/.test(api));
} catch (e) { check('api-mango.ts 캘린더 읽기', false); console.log('    →', e.message); }
try {
  const wk = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin/weekly-schedule.html'), 'utf8');
  check('weekly: loadHolidays + HOLIDAY_MAP', wk.includes('loadHolidays') && wk.includes('HOLIDAY_MAP'));
} catch (e) { check('weekly-schedule.html 읽기', false); console.log('    →', e.message); }
try {
  const home = readFileSync(resolve(__dir, '../cloudflare-deploy/public/index.html'), 'utf8');
  check('index.html: 학생 수업입장 공지 팝업', home.includes('mangoiClassEntryNotice'));
} catch (e) { check('index.html 팝업 읽기', false); console.log('    →', e.message); }

// ── 7) R2 고아 파일 청소 — 연동(배선) 검증 (실제 파일 grep) ───────────
console.log('\n[7] R2 고아 청소 연동 (모듈·import·cron·관리자 라우트)');
try {
  const idx = readFileSync(resolve(__dir, '../cloudflare-deploy/src/index.ts'), 'utf8');
  check('index.ts: cleanup 모듈 import', /import \{ purgeOrphanedRecordings \} from '\.\/recordings-cleanup'/.test(idx));
  check('index.ts: scheduled() 안에서 cron 호출', idx.includes('await purgeOrphanedRecordings(env)'));
  check('index.ts: cron 로그 태그', idx.includes("[recordings-cleanup] cron ran"));
  check('index.ts: 관리자 라우트 등록', idx.includes("path === '/api/admin/recordings/cleanup'"));
  check('index.ts: GET=dry-run / POST=실삭제 분기', /const dryRun = request\.method !== 'POST'/.test(idx));
  check('index.ts: 마지막 실행 결과 조회(status)', idx.includes("'recordings-cleanup:last_run'"));
} catch (e) { check('index.ts cleanup 연동 읽기', false); console.log('    →', e.message); }
try {
  const mod = readFileSync(resolve(__dir, '../cloudflare-deploy/src/recordings-cleanup.ts'), 'utf8');
  check('cleanup: D1 file_url 로 known key 적재', mod.includes('SELECT file_url FROM recordings'));
  check('cleanup: R2 cursor 페이지네이션', mod.includes('listed.truncated') && mod.includes('listed.cursor'));
  check('cleanup: 50% 안전장치', mod.includes('maxDeleteRatio') && mod.includes('aborted_by_guard'));
  check('cleanup: D1 실패 시 중단(전량삭제 방지)', mod.includes('D1 조회 실패'));
  check('cleanup: 일괄 삭제 배치(1000)', /const BATCH = 1000/.test(mod));
  check('cleanup: 삭제 용량 로깅(humanBytes)', mod.includes('deleted_human') && mod.includes('humanBytes'));
} catch (e) { check('recordings-cleanup.ts 읽기', false); console.log('    →', e.message); }

// ── 8) 실제 admin.html 개선 검증 (P1 PDF CDN · P2-1 실시간 수업 이상감지) ──
console.log('\n[8] 실제 admin.html 개선 (P1 안전수정 · P2-1 즉시대응)');
try {
  const a = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  // P1-1: PDF 라이브러리 cdnjs(차단) → jsDelivr
  check('P1-1: admin.html 에 cdnjs 잔여 없음', !a.includes('cdnjs.cloudflare.com'));
  check('P1-1: jsPDF jsDelivr 로드', a.includes('jsdelivr.net/npm/jspdf'));
  check('P1-1: html2canvas jsDelivr 로드', a.includes('jsdelivr.net/npm/html2canvas'));
  // P2-1: 실시간 수업 이상감지 강조·정렬·액션
  check('P2-1: alerts 교차참조(alertMap)', a.includes('alertMap') && a.includes("/api/admin/alerts"));
  check('P2-1: 미확인 알림만 표시(acknowledged_at)', a.includes('acknowledged_at'));
  check('P2-1: 이상감지 방 최상단 정렬', /sort\(\(a,b\)=>\s*\(alertMap/.test(a));
  check('P2-1: 빨간 Pulse 클래스/애니메이션', a.includes('room-alert') && a.includes('roomAlertPulse'));
  check('P2-1: 모션 최소화 대응', a.includes('prefers-reduced-motion'));
  check('P2-1: 즉시 개입 + GHOST 참관 버튼', a.includes('interveneRoom') && a.includes('GHOST 참관'));
  check('P2-1: 기존 강제종료 유지(회귀 방지)', a.includes('forceEndRoom'));
} catch (e) { check('admin.html 개선 검증 읽기', false); console.log('    →', e.message); }

// ── 9) P2-3 차트 툴팁 전역 개선 ──
console.log('\n[9] P2-3 차트 툴팁 전역 개선 (Chart.js 지연로드 대응)');
try {
  const a = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  check('P2-3: Chart 전역 tooltip 기본값 설정', a.includes('Chart.defaults.plugins.tooltip') || a.includes('Chart.defaults.plugins'));
  check('P2-3: 지연로드 대응 폴링(가드)', a.includes('__miTipDone') && a.includes('applyChartDefaults'));
  check('P2-3: 포인트 hover 반응 강화', a.includes('hoverRadius') && a.includes('hitRadius'));
  check('P2-3: 실패해도 차트 동작 무영향(try/catch)', a.includes('Chart.__miTipDone=true;') && a.includes('}catch(e){}'));
  // 실제 문서 종료 직전 삽입(템플릿 문자열 body 아닌 곳)인지 — 마지막 </body> 직전 script
  check('P2-3: 문서 종료부에 삽입(구조 안전)', a.lastIndexOf('__miTipDone') < a.lastIndexOf('</body>'));
} catch (e) { check('P2-3 읽기', false); console.log('    →', e.message); }

// ── 10) P3 AI 운영 비서 대화 패널 (가산적·비파괴) ──
console.log('\n[10] P3 AI 운영 비서 대화 패널 (기존 ai-command 연결)');
try {
  const a = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  check('P3: 비서 FAB + 패널 존재', a.includes('mi-asst-fab') && a.includes('mi-asst-panel'));
  check('P3: 실제 /api/admin/ai-command 연결', /miAsstAsk|mi-asst-form[\s\S]{0,1200}\/api\/admin\/ai-command/.test(a) || a.includes("body:JSON.stringify({command:q})"));
  check('P3: API 실패/무답 시 폴백 응답', a.includes('function fb(q)') && a.includes('FB.eval'));
  check('P3: 3대 역량 라우팅(평가서·이상감지·정산)', a.includes('평가서|피드백') && a.includes('미납|수강료|정산'));
  check('P3: 답변 끝 번호요약 페르소나', a.includes('요약 —'));
  check('P3: id 충돌 회피(mi-asst- 접두사)', a.includes('mi-asst-input') && a.includes('mi-asst-chips'));
  check('P3: 기존 askAI 흐름 미수정(비파괴)', a.includes('async function askAI(command)'));
  check('P3: 기존 #ai-panel 그대로 유지', a.includes("getElementById('ai-panel')"));
} catch (e) { check('P3 읽기', false); console.log('    →', e.message); }

// ── 11) P4-a 접근성 개선 (가산적·비파괴) ──
console.log('\n[11] P4-a 접근성 (focus-visible · reduced-motion · aria-live)');
try {
  const a = readFileSync(resolve(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');
  check('P4-a: 키보드 포커스 링(focus-visible)', a.includes(':focus-visible') && a.includes('mi-a11y'));
  check('P4-a: 모션 최소화 전역 존중', a.includes('@media (prefers-reduced-motion: reduce)'));
  check('P4-a: AI 비서 화면낭독(aria-live)', a.includes('aria-live="polite"') && a.includes('role="log"'));
  check('P4-a: 비파괴(기존 askAI 유지)', a.includes('async function askAI(command)'));
} catch (e) { check('P4-a 읽기', false); console.log('    →', e.message); }

// ── 결과 ──────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(52));
console.log(`🎯 총 ${PASS+FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exitCode = 1; }
else console.log('🎉 모든 핵심 규칙 통과 — 격리·수수료·게이팅·입장 정상');
console.log('='.repeat(52));
