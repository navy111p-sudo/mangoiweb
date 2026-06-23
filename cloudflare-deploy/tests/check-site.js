/* =====================================================================
 * 망고아이 메인 웹 자동 점검 하네스 (의존성 없음 — Node 기본 모듈만 사용)
 * 실행: node tests/check-site.js   (또는 test.bat 더블클릭)
 *
 * 무엇을 점검하나:
 *   1) public/index.html 의 AI 상담사 위젯이 정상적으로 들어있는지
 *   2) PC(데스크톱) 30% 확대 규칙과 반응형 위치계산이 살아있는지
 *   3) 제거하기로 한 우하단 둥근 공 장식이 완전히 빠졌는지
 *   4) <style>/<script> 태그 짝이 맞는지
 *   5) public 폴더의 모든 .html 의 기본 건전성(빈 파일/스크립트 짝)
 *
 * 매 수정 후 이 스크립트를 돌려 PASS 가 나오면 안심하고 배포(deploy.bat)하세요.
 * ===================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const INDEX = path.join(PUBLIC, "index.html");
const ADMIN = path.join(PUBLIC, "admin.html");

let pass = 0, fail = 0, warn = 0;
const fails = [];

function ok(name)      { pass++; console.log("  [PASS] " + name); }
function bad(name, hint) {
  fail++; fails.push(name);
  console.log("  [FAIL] " + name + (hint ? "  -> " + hint : ""));
}
function warning(name, hint) { warn++; console.log("  [WARN] " + name + (hint ? "  -> " + hint : "")); }
function check(name, cond, hint) { cond ? ok(name) : bad(name, hint); }
// 거대 SPA 는 JS 문자열 안에 <script> 같은 마크업이 들어있어 단순 카운트가 어긋날 수 있음 → 실패 대신 경고
function checkWarn(name, cond, hint) { cond ? ok(name) : warning(name, hint); }

// ---- 0. index.html 읽기 ----
if (!fs.existsSync(INDEX)) {
  console.log("[FAIL] public/index.html 파일을 찾을 수 없습니다: " + INDEX);
  process.exit(1);
}
const html = fs.readFileSync(INDEX, "utf8");

console.log("\n=== 1) AI 상담사 위젯 존재 확인 ===");
check('위젯 컨테이너 #mangoi-widget',  /id="mangoi-widget"/.test(html), 'id="mangoi-widget" 누락');
check('토글 버튼 #mangoi-toggle',      /id="mangoi-toggle"/.test(html), 'id="mangoi-toggle" 누락');
check('상담 iframe #mangoi-frame',     /id="mangoi-frame"/.test(html),  'id="mangoi-frame" 누락');
check('아바타 주소 연결(mangoi-ai-avatar-cf)',
      /mangoi-ai-avatar-cf\.navy111p\.workers\.dev/.test(html),
      'iframe src 가 아바타 Worker 주소를 가리키지 않음');
check('라벨 텍스트 "A.i 상담사"',       /A\.i 상담사/.test(html), '라벨 문구 누락');

console.log("\n=== 2) PC 확대(2배) + 반응형 위치계산 ===");
// 2026-06-17: 홈 AI 상담사 위젯 PC 확대가 30%(토글 83px/채팅 382px) → 2배(토글 128px/채팅 588px)로 변경됨.
//             옛 83/382 값을 찾던 검사를 현재 실제 값(128/588)에 맞춰 갱신(레거시 값도 허용).
check('PC 전용 미디어쿼리 @media (min-width:481px)',
      /@media\s*\(min-width:481px\)/.test(html), '데스크톱 확대 미디어쿼리 누락');
check('확대된 토글 크기(128px, 레거시 83px 허용)',
      /#mangoi-toggle\s*\{[^}]*128px/.test(html) || /width:128px/.test(html) ||
      /#mangoi-toggle\s*\{[^}]*83px/.test(html)  || /width:83px/.test(html),
      'PC 토글 확대 규칙(128px/83px) 누락');
check('확대된 채팅창 폭(588px, 레거시 382px 허용)',
      /width:588px/.test(html) || /width:382px/.test(html), 'PC 채팅창 확대 폭(588px/382px) 규칙 누락');
check('위치계산 반응형(isPC) 로직',     /var\s+isPC\s*=\s*window\.innerWidth\s*>=\s*481/.test(html),
      'positionPanel 의 isPC 분기 누락 — 확대된 창이 화면 밖으로 열릴 수 있음');

console.log("\n=== 3) 제거한 둥근 공 장식(deco-mini-galaxies) ===");
check('장식 HTML 요소가 실제로 제거됨',
      !/<div[^>]*class="[^"]*deco-mini-galaxies/.test(html),
      '<div class="deco-mini-galaxies"> 요소가 아직 남아있음');
check('장식 CSS 규칙(.mg) 제거됨',
      !/\.deco-mini-galaxies\s+\.mg\b/.test(html),
      '.deco-mini-galaxies .mg CSS 가 아직 남아있음');

console.log("\n=== 4) index.html 태그 짝 맞춤 ===");
const styleOpen  = (html.match(/<style[\s>]/g)  || []).length;
const styleClose = (html.match(/<\/style>/g)    || []).length;
const scriptOpen = (html.match(/<script[\s>]/g) || []).length;
const scriptClose= (html.match(/<\/script>/g)   || []).length;
checkWarn('<style> 짝 (' + styleOpen + ' = ' + styleClose + ')',  styleOpen === styleClose, '여는/닫는 <style> 수 불일치(문자열 속 태그면 무시 가능)');
checkWarn('<script> 짝 (' + scriptOpen + ' = ' + scriptClose + ')', scriptOpen === scriptClose, '여는/닫는 <script> 수 불일치(문자열 속 태그면 무시 가능)');

console.log("\n=== 4-b) 관리자 대시보드 우하단 통합 Speed Dial(admin.html) ===");
if (!fs.existsSync(ADMIN)) {
  bad('admin.html 존재', 'public/admin.html 파일을 찾을 수 없음');
} else {
  const admin = fs.readFileSync(ADMIN, "utf8");
  // 2026-06-18: 3종 FAB(아바타·카톡·새로고침)를 하나의 Speed Dial 로 통합.
  //  평소엔 상담원 아바타 트리거 1개만 노출, 탭하면 위로 [AI상담 → 카톡상담 → 새로고침] 펼침.

  // ── 컨테이너 / 트리거 ──
  check('Speed Dial 컨테이너 #mi-speed-dial',
        /id="mi-speed-dial"/.test(admin), 'id="mi-speed-dial" 누락');
  check('우하단 코너 고정(right:16px; bottom:16px; z-index:9992)',
        /#mi-speed-dial\s*\{[^}]*right:16px[^}]*bottom:16px[^}]*z-index:9992/.test(admin),
        '#mi-speed-dial 우하단 고정 규칙(right:16px; bottom:16px; z-index:9992) 누락');
  check('평소 접힘 기본값(data-open="false")',
        /id="mi-speed-dial"[^>]*data-open="false"/.test(admin),
        '#mi-speed-dial 기본 접힘 상태(data-open="false") 누락');
  check('바깥 클릭 닫기용 백드롭 #mi-sd-backdrop',
        /id="mi-sd-backdrop"/.test(admin), 'id="mi-sd-backdrop" 누락');
  check('트리거 #mi-ops-fab → 토글(miSdToggle) 연결',
        /id="mi-ops-fab"[\s\S]{0,300}?window\.miSdToggle/.test(admin),
        '트리거(#mi-ops-fab) onclick 에서 window.miSdToggle 호출 누락');
  check('트리거 아바타 얼굴 영상 #mi-ops-fab-vid',
        /id="mi-ops-fab-vid"/.test(admin), '#mi-ops-fab-vid 아바타 영상 누락');
  check('라벨 텍스트 "AI 운영비서"',
        /id="mi-ops-fab-label"[^>]*>[\s\S]*?AI 운영비서/.test(admin), '라벨 문구 누락');
  check('펼침 시 닫기(✕) 오버레이 .mi-ops-fab-close',
        /class="mi-ops-fab-close"/.test(admin), '닫기 표시(.mi-ops-fab-close) 누락');

  // ── 펼쳐지는 3개 액션 ──
  check('액션 컨테이너 #mi-sd-actions',
        /id="mi-sd-actions"/.test(admin), 'id="mi-sd-actions" 누락');
  check('AI 상담 액션 #mi-sd-ai → window.miAsstOpen()',
        /id="mi-sd-ai"[\s\S]{0,300}?window\.miAsstOpen\(\)/.test(admin),
        'AI 상담 액션(#mi-sd-ai)에서 window.miAsstOpen() 호출 누락');
  check('카톡상담 액션 #kakao-chat-fab → pf.kakao.com 채팅 링크',
        /id="kakao-chat-fab"[\s\S]{0,200}?pf\.kakao\.com\/_mango_i\/chat/.test(admin),
        '카톡상담 액션(#kakao-chat-fab)의 카카오 채팅 링크 누락');
  check('새로고침 액션 #adm-refresh-fab + window.admRefresh 정의',
        /id="adm-refresh-fab"/.test(admin) && /window\.admRefresh\s*=\s*admRefresh/.test(admin),
        '새로고침 액션(#adm-refresh-fab) 또는 window.admRefresh 정의 누락');

  // ── 토글 동작 / 애니메이션 ──
  check('토글 함수 정의(miSdToggle/miSdOpen/miSdClose)',
        /window\.miSdToggle\s*=/.test(admin) && /window\.miSdClose\s*=/.test(admin) && /window\.miSdOpen\s*=/.test(admin),
        'miSdToggle/miSdOpen/miSdClose 정의 누락');
  check('.is-open 기반 펼침 애니메이션 규칙',
        /#mi-speed-dial\.is-open\s+\.mi-sd-action/.test(admin),
        '.is-open 펼침 애니메이션(.mi-sd-action) 규칙 누락');

  // ── PC 30% 확대 유지 ──
  check('PC 30% 확대 규칙(83px)',
        /#mi-ops-fab-btn\s*\{[^}]*83px/.test(admin) || /#mi-ops-fab\s*\{[^}]*83px/.test(admin),
        'PC 확대(83px) 규칙 누락');

  console.log("\n=== 4-c) AI 운영비서 = 새 아바타 iframe(성우 '재선' 녹음 음성·검색/입력창·마이크·메뉴 라우팅) ===");
  // ★ 2026-06-17: 운영비서는 옛 커스텀 슬라이드 패널(#mi-asst-panel, 기계음·입력창 없음)이 아니라,
  //   아바타 Worker(mangoi-ai-avatar-cf 루트=ops) iframe 으로 열려야 한다. FAB → miAsstOpen=openAv.
  check('FAB 가 새 아바타 iframe 을 엶(miAsstOpen=openAv 활성)',
        /window\.miAsstOpen=openAv/.test(admin),
        'window.miAsstOpen=openAv 누락 — FAB 가 옛 커스텀 패널(기계음)을 열게 됨');
  check('아바타 iframe 컨테이너 #mi-ops-av / 프레임 #mi-ops-av-frame',
        /id="mi-ops-av"/.test(admin) && /id="mi-ops-av-frame"/.test(admin),
        '운영비서 아바타 iframe(#mi-ops-av / #mi-ops-av-frame) 누락');
  check('아바타 주소 = ops 운영비서(mangoi-ai-avatar-cf 루트)',
        /SRC\s*=\s*'https:\/\/mangoi-ai-avatar-cf\.navy111p\.workers\.dev'/.test(admin),
        'iframe SRC 가 아바타 Worker 루트(ops)를 가리키지 않음');
  check('마이크·자동재생 허용(allow=autoplay; microphone)',
        /id="mi-ops-av-frame"[\s\S]{0,200}?allow="autoplay;\s*microphone"/.test(admin),
        'iframe allow 에 microphone/autoplay 누락 — 마이크·음성 동작 안 함');
  check('수동 열기 핸들 보존(miOpsAvatarOpen=openAv)',
        /window\.miOpsAvatarOpen=openAv/.test(admin), 'miOpsAvatarOpen 수동 핸들 누락');
  // 학생용 고객 상담사는 /student.html 로 분리되어 영향 없어야 함(메인 웹 임베드가 /student.html 을 가리킴 — index.html 점검은 본 하네스 1)에서 별도)
  check('학생/관리자 아바타 분리 주석(/student.html 분리 명시)',
        /student\.html/.test(admin), '학생용 분리(/student.html) 흔적 누락 — 학생 상담사 손상 위험');
}

console.log("\n=== 4-d) Worker 음성 프록시 라우트(src/index.ts) ===");
const WORKER = path.join(ROOT, "src", "index.ts");
if (!fs.existsSync(WORKER)) {
  warning('src/index.ts 존재', '워커 소스를 찾지 못함(점검 생략)');
} else {
  const wk = fs.readFileSync(WORKER, "utf8");
  check("'/api/ops-tts' 라우트 존재",
        /path === '\/api\/ops-tts'/.test(wk), "src/index.ts 에 /api/ops-tts 프록시 라우트 누락");
  check('아바타 Worker /api/tts 로 프록시',
        /mangoi-ai-avatar-cf\.navy111p\.workers\.dev\/api\/tts/.test(wk), '프록시 대상(아바타 Worker /api/tts) 누락');
}

console.log("\n=== 4-e) 강사 급여 접근 제어(admin.html) — 경영진·관리자 전체 / 교사 본인만 / 그 외 차단 ===");
if (fs.existsSync(ADMIN)) {
  const admin = fs.readFileSync(ADMIN, "utf8");
  check('급여 권한 게이트 window.payrollAccess 정의',
        /window\.payrollAccess\s*=\s*function/.test(admin), 'payrollAccess 게이트 함수 누락');
  check('거절 메시지 "죄송합니다. 경영자와 관리자가 아니라서 열어드릴 수 없네요."',
        /죄송합니다\. 경영자와 관리자가 아니라서 열어드릴 수 없네요\./.test(admin), '요청한 거절 메시지 문구 누락');
  check('경영진(hq_exec)·관리자(hq_mgr) 전체 허용',
        /role === 'hq_exec' \|\| s\.role === 'hq_mgr'.*ok:true, ownOnly:false/.test(admin) ||
        /'hq_exec'[\s\S]{0,80}ok:true,\s*ownOnly:false/.test(admin),
        'exec/mgr 전체 허용 분기 누락');
  check('교사(hq_teacher) 본인만(ownOnly) 허용',
        /hq_teacher[\s\S]{0,160}ok:true,\s*ownOnly:true/.test(admin), '교사 본인만(ownOnly:true) 분기 누락');
  check('jumpToMenu 에서 급여 카드 접근 제어 호출',
        /card-payroll[\s\S]{0,120}window\.payrollAccess\(id\)/.test(admin), 'jumpToMenu 의 급여 게이트 호출 누락');
  check('렌더 단계 교사 본인 행 필터(renderPayrollTable)',
        /_payrollIsOwnRow\(r, _sessPR\)/.test(admin), 'renderPayrollTable 의 본인 행 필터 누락');
  check('교사 보기에서 CSV/마감/그래프/시드 숨김',
        /_applyPayrollTeacherUI/.test(admin), '교사용 컨트롤 숨김(_applyPayrollTeacherUI) 누락');
  check('AI 운영비서 급여 응답 게이트(doNav)',
        /payrollAccess\(o\.menu_id\)/.test(admin), 'doNav 의 급여 게이트 누락');
  check('급여 자동정산 카드(card-payroll-auto) mgrOrUp 정책',
        /'card-payroll-auto':\s*'mgrOrUp'/.test(admin), 'card-payroll-auto 정책 누락');
  check('권한 매트릭스: 지사·대리점 급여 차단(branch/agency ❌)',
        /teacher_payroll[\s\S]{0,200}branch:'❌',\s*agency:'❌'/.test(admin), '매트릭스 def 의 지사/대리점 차단 누락');
}

console.log("\n=== 4-f) 숙제 관리 — 학원→학생 대상 선택 출제(admin.html + Worker API) ===");
if (fs.existsSync(ADMIN)) {
  const admin = fs.readFileSync(ADMIN, "utf8");
  // 프런트: 출제 폼 모달 + 학원/학생 선택 + 목록
  check('새 숙제 출제 버튼 → hwOpenForm()',
        /onclick="hwOpenForm\(\)"/.test(admin), '숙제 출제 버튼이 hwOpenForm() 을 호출하지 않음(아직 alert 자리표시자?)');
  check('출제 폼 모달 #hw-modal 존재',
        /id="hw-modal"/.test(admin), '#hw-modal 모달 누락');
  check('① 학원 선택 드롭다운 #hw-academy',
        /id="hw-academy"/.test(admin), '#hw-academy 학원 선택 드롭다운 누락');
  check('② 학생 다중선택 영역 #hw-students + 이 학원 전체 #hw-all-students',
        /id="hw-students"/.test(admin) && /id="hw-all-students"/.test(admin),
        '학생 선택 영역(#hw-students/#hw-all-students) 누락');
  check('학원→학생 연동 핸들러 hwOnAcademyChange',
        /window\.hwOnAcademyChange\s*=/.test(admin), 'hwOnAcademyChange(학원 선택 시 학생 로드) 누락');
  check('대상 타입 산출(all/academy/students) 로직',
        /target_type:'all'/.test(admin) && /target_type:'academy'/.test(admin) && /target_type:'students'/.test(admin),
        'hwTarget 의 all/academy/students 분기 누락');
  check('학생 목록 erp-list 로드',
        /\/api\/admin\/students\/erp-list/.test(admin), '학생 목록(erp-list) 로드 누락');
  check('출제 저장 → POST /api/admin/homework/save',
        /\/api\/admin\/homework\/save/.test(admin), '출제 저장 호출(/api/admin/homework/save) 누락');
  check('출제 목록 → GET /api/admin/homework/list',
        /\/api\/admin\/homework\/list/.test(admin), '출제 목록 호출(/api/admin/homework/list) 누락');
}
const APIM = path.join(ROOT, "src", "api-mango.ts");
if (fs.existsSync(APIM)) {
  const am = fs.readFileSync(APIM, "utf8");
  check("Worker: /api/admin/homework/save 핸들러",
        /path === '\/api\/admin\/homework\/save'/.test(am), 'save 핸들러 누락');
  check("Worker: /api/admin/homework/list 핸들러",
        /path === '\/api\/admin\/homework\/list'/.test(am), 'list 핸들러 누락');
  check("Worker: homework 테이블 생성(ensureHomeworkTables)",
        /CREATE TABLE IF NOT EXISTS homework/.test(am), 'homework 테이블 DDL 누락');
  check("Worker: 대상 컬럼(target_type/target_academy/target_student_ids)",
        /target_type/.test(am) && /target_academy/.test(am) && /target_student_ids/.test(am),
        '대상 컬럼 누락');
}
const IDX = path.join(ROOT, "src", "index.ts");
if (fs.existsSync(IDX)) {
  const ix = fs.readFileSync(IDX, "utf8");
  const hwGates = (ix.match(/\/api\/admin\/homework\//g) || []).length;
  check("index.ts: 숙제 라우트 게이트 2곳 등록(dispatch + isAdminApi)",
        hwGates >= 2, "homework 라우트가 dispatch 게이트와 isAdminApi 양쪽에 등록되어야 함(현재 " + hwGates + "곳)");
}

// ---- 6. 캐피타운 프랜차이즈 정산 통합 점검 (2026-06-20) ----
console.log("\n=== 6) 캐피타운 프랜차이즈 정산 통합 ===");
{
  const CAPI = path.join(PUBLIC, "admin", "capitown-settlement.html");
  if (!fs.existsSync(CAPI)) {
    bad("캐피타운 정산 페이지 존재", "public/admin/capitown-settlement.html 없음");
  } else {
    const c = fs.readFileSync(CAPI, "utf8");
    check("6-a authGuard + /api/admin/me",
          c.includes("authGuard") && c.includes("/api/admin/me"),
          "비로그인/무권한 차단 가드");
    check("6-b allowed = capitown + hq_exec",
          c.includes("['capitown','hq_exec']") || c.includes('["capitown","hq_exec"]'),
          "allowed 배열");
    check("6-c 미로그인시 login.html redirect",
          c.includes("/admin/login.html") && c.includes("location.replace"),
          "serverOk 실패시 이동");
    check("6-d denyGate + appWrap + initSettlement",
          c.includes("denyGate") && c.includes("appWrap") && c.includes("function initSettlement"),
          "게이트/래퍼/초기화");
    check("6-e 관리자 상단바(마이페이지/대시보드/로그아웃)",
          c.includes("adm-top") && c.includes("admLogout") && c.includes("/admin/mypage.html"),
          "상단바/로그아웃");
    const hasBuild = c.indexOf("<!-- BUILD:") !== -1;
    check("6-f BUILD 주석(배포 갱신)", hasBuild, "BUILD 마커");
    // 6-k: 모바일 레이아웃 — @media(max-width:860px)에서 .app 세로정렬(사이드바/본문 스택). 없으면 사이드바가 폭을 먹고 본문이 짜부라짐.
    const mq = (c.match(/@media\(max-width:860px\)\{[\s\S]*?\.app\{flex-direction:column\}/));
    check("6-k 모바일 .app 세로정렬(레이아웃 깨짐 방지)",
          !!mq,
          "@media(max-width:860px) 안에 .app{flex-direction:column}");
    // 6-l: 파일 끝 정상(닫는 태그) — 한글 대형 HTML truncation 사고 감지
    check("6-l 파일 끝 닫는 태그 정상(truncation 방지)",
          c.includes("</script>") && c.includes("</body>") && c.includes("</html>"),
          "</script></body></html> 존재");
  }
  const LOGIN = path.join(PUBLIC, "admin", "login.html");
  if (fs.existsSync(LOGIN)) {
    const lg = fs.readFileSync(LOGIN, "utf8");
    check("6-g login.html capitown role + 전용 홈",
          lg.includes("'capitown'") && lg.includes("capitown-settlement.html"),
          "role 유도 + redirect");
  }
  const MYP = path.join(PUBLIC, "admin", "mypage.html");
  if (fs.existsSync(MYP)) {
    const mp = fs.readFileSync(MYP, "utf8");
    check("6-h mypage 캐피타운 탭 + 역할 게이트",
          mp.indexOf('data-tab="capitown"') !== -1 && mp.indexOf("tab-capitown") !== -1 && mp.indexOf("capitown-settlement.html") !== -1,
          "탭/패널/게이트");
  }
  const adminSrc = fs.readFileSync(ADMIN, "utf8");
  check("6-i admin 사이드바 진입점 + 게이트",
        adminSrc.indexOf("ph85-capitown") !== -1 && adminSrc.indexOf("capitown-settlement.html") !== -1,
        "회계/포인트 그룹 링크");
  const AUTH = path.join(ROOT, "src", "auth-admin.ts");
  if (fs.existsSync(AUTH)) {
    const au = fs.readFileSync(AUTH, "utf8");
    check("6-j auth-admin capitown 시드(비번유지)",
          au.includes("'capitown'") && au.includes("u !== 'capitown'"),
          "시드 + 강제동기 제외");
  }
}

console.log("\n=== 5) public 폴더 전체 .html 기본 건전성 ===");
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.toLowerCase().endsWith(".html")) out.push(p);
  }
  return out;
}
const htmlFiles = walk(PUBLIC, []);
let sweepFail = 0;
for (const f of htmlFiles) {
  const rel = path.relative(PUBLIC, f);
  const src = fs.readFileSync(f, "utf8");
  const so = (src.match(/<script[\s>]/g) || []).length;
  const sc = (src.match(/<\/script>/g)   || []).length;
  const empty = src.trim().length === 0;
  if (empty)        { bad("기본점검: " + rel, "빈 파일"); sweepFail++; }
  else if (so !== sc) { warning("기본점검: " + rel, "<script> 짝 불일치 (" + so + "/" + sc + ") — 문자열 속 태그면 무시 가능"); }
}
if (sweepFail === 0) ok(htmlFiles.length + "개 .html 파일 모두 기본 점검 통과(빈 파일 없음)");

// ---- 결과 요약 ----
console.log("\n========================================");
console.log("  결과:  PASS " + pass + " /  FAIL " + fail + " /  WARN " + warn);
if (fail === 0) console.log("  전부 통과! 안심하고 deploy.bat 으로 배포하세요.");
else console.log("  실패: " + fails.join(", "));
console.log("========================================\n");
process.exit(fail > 0 ? 1 : 0);
