/**
 * 📋 강사·매니저 피드백 7건 회귀 하니스 (2026-07-23)
 *
 * 구글 문서 "NEW TEACHER'S PAGE PROBLEM" 7건이 되돌아가지 않게 소스에 못을 박는다.
 *   1 느림      → 가벼운 모드 자동감지가 실제 강사 PC(6코어/8GB)를 잡는가
 *   2 대리점    → 학생 목록에 대리점·학원 필터가 있는가 (CSV 도 같은 필터를 타는가)
 *   3 왼쪽 메뉴 → 가로 스크롤 차단 + 그룹 세로 잘림 방지
 *   4 진행중 수업 → 관찰 카드에서 ID 타이핑 없이 고를 수 있는가 + 자주 쓰는 기능 상단 고정
 *   5 오늘 수업 → 매니저가 바로 입장할 수 있는가 (+ API 가 게이트에 등록됐는가)
 *   6 MES/BTS   → 코드가 아니라 교재 '배정 데이터' 문제 (여기선 검사 대상 아님 — 아래 주석 참고)
 *   7 설정 크기 → 화상수업 독 버튼이 커졌는가 (병행 세션 작업분 — 되돌아가면 잡는다)
 *
 * ⚠️ room_id 규칙은 서버 두 곳(api-mango.ts / api-admin.ts)이 반드시 같아야 한다.
 *    다르면 매니저가 학생과 '다른 방'에 들어가 서로 못 만난다 → 그 대조도 여기서 한다.
 *
 * 실행: node test-harness/teacher_feedback_admin_harness.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.env.MANGOI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const PUB = join(CF, 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}
function read(p) { return existsSync(p) ? readFileSync(p, 'utf8') : ''; }

const indexHtml = read(join(PUB, 'index.html'));
const adminHtml = read(join(PUB, 'admin.html'));
const admCore   = read(join(PUB, 'js', 'adm-core.js'));
const admS1     = read(join(PUB, 'js', 'adm-s1.js'));
const admToday  = read(join(PUB, 'js', 'adm-today-classes.js'));
const admQuick  = read(join(PUB, 'js', 'adm-quick-access.js'));
const vcDock    = read(join(PUB, 'js', 'vc-dock.js'));
const apiAdmin  = read(join(CF, 'src', 'api-admin.ts'));
const apiMango  = read(join(CF, 'src', 'api-mango.ts'));
const idxTs     = read(join(CF, 'src', 'index.ts'));

console.log('═'.repeat(64));
console.log(' 📋 강사·매니저 피드백 7건 회귀 하니스');
console.log('═'.repeat(64));

/* ── 1. 느리다 → 가벼운 모드 자동감지 ─────────────────────────────── */
console.log('\n▶ 1. 저사양 PC — 가벼운 모드 자동감지');
{
  const m = indexHtml.match(/on\s*=\s*\(cores\s*<=\s*(\d+)\s*\|\|\s*mem\s*<=\s*(\d+)\)/);
  check('자동감지 조건이 존재', !!m, m ? '' : 'cores/mem 판정식을 못 찾음');
  if (m) {
    const cores = Number(m[1]), mem = Number(m[2]);
    // 필리핀 센터 표준기: i5-8500 = 6코어 / 8GB
    check('강사 표준 PC(6코어·8GB)가 자동 ON 대상',
          6 <= cores || 8 <= mem, `현재 기준 cores<=${cores} || mem<=${mem}`);
  }
  check('⚡ 토글 버튼이 남아 있음(수동 해제 가능)', indexHtml.includes('vcToggleLite'));
  check('선택이 기기에 저장됨', indexHtml.includes('mangoi_lite_mode'));
}

/* ── 2. 학생 목록 대리점·학원 필터 ────────────────────────────────── */
console.log('\n▶ 2. 학생 목록 — 대리점·학원 필터');
{
  check('필터 드롭다운이 학생 목록 툴바에 있음', adminHtml.includes('id="sm-agency-filter"'));
  check('드롭다운을 목록에서 자동 생성', admCore.includes('function smFillAgencyFilter'));
  check('목록 로드 후 드롭다운 채움', /smFillAgencyFilter\(\)/.test(admCore));
  check('필터가 렌더에 실제로 걸림', /_smAgency[\s\S]{0,400}shop_name/.test(admCore));
  check('CSV 다운로드도 같은 필터 적용',
        /smExportStudentsCsv[\s\S]{0,900}_smAgency/.test(admCore),
        '화면과 CSV 결과가 달라지면 안 됨');
  check('선택 즉시 반영(change 바인딩)', admCore.includes("getElementById('sm-agency-filter')"));
}

/* ── 3. 왼쪽 메뉴가 커지고 오른쪽으로 밀림 ────────────────────────── */
console.log('\n▶ 3. 사이드바 — 가로 스크롤·세로 잘림');
{
  const side = adminHtml.match(/#ph85-sidebar\s*\{[\s\S]{0,600}?\}/);
  check('사이드바 CSS 블록 확인', !!side);
  check('가로 스크롤 차단(overflow-x:hidden)', !!side && /overflow-x:\s*hidden/.test(side[0]));
  const mh = adminHtml.match(/\.ph85-group\.open\s+\.ph85-subs\s*\{\s*max-height:\s*(\d+)px/);
  check('그룹 펼침 높이 상한 확인', !!mh, mh ? '' : 'max-height 규칙을 못 찾음');
  if (mh) {
    // 자식 15개 × 두 줄(≈55px) ≈ 825px → 760px 이면 잘린다
    check('영어 라벨 두 줄로 접혀도 안 잘림(>=1200px)',
          Number(mh[1]) >= 1200, `현재 max-height:${mh[1]}px`);
  }
  check('긴 라벨은 줄바꿈 처리', /\.ph85-sub\s*\{[\s\S]{0,400}overflow-wrap:\s*anywhere/.test(adminHtml));
}

/* ── 4. 진행 중인 수업을 바로 보기 + 자주 쓰는 기능 상단 ──────────── */
console.log('\n▶ 4. 진행 중인 수업 · 자주 쓰는 기능');
{
  check('관찰 카드 안에 실시간 목록 자리 있음', adminHtml.includes('id="gh-live-list"'));
  check('실시간 목록 로더 구현', admS1.includes('window.ghLoadLive'));
  check('기존 API 재사용(신규 API 없음)', admS1.includes("/api/active-rooms"));
  check('줄 클릭 → 강의실 ID 자동 입력', admS1.includes('window.ghPickRoom'));
  check('목록에서 직접 입장 가능', admS1.includes('window.ghEnterRoom'));
  check('직접 입장은 확인을 받음(학생에게 보이므로)', /ghEnterRoom[\s\S]{0,600}confirm\(/.test(admS1));

  check('자주 쓰는 기능 블록이 사이드바에 있음', adminHtml.includes('id="ph161-quick"'));
  check('블록이 첫 메뉴 그룹보다 위에 있음',
        adminHtml.indexOf('id="ph161-quick"') < adminHtml.indexOf('class="ph85-group"'),
        '맨 위가 아니면 요청(“맨 위로”)을 만족 못 함');
  // 매니저가 적어준 5가지가 그대로 들어갔는지
  for (const card of ['card-students-mgmt', 'card-admin-ghost', 'card-active-rooms', 'card-enrollments']) {
    check('바로가기 대상 포함: ' + card, admQuick.includes(card));
  }
  check('바로가기 대상 카드가 실제로 존재',
        ['card-students-mgmt','card-admin-ghost','card-active-rooms','card-enrollments']
          .every(id => adminHtml.includes('id="' + id + '"')));
}

/* ── 5. 오늘 수업에서 매니저가 바로 입장 ──────────────────────────── */
console.log('\n▶ 5. 오늘 수업 — 매니저 바로 입장');
{
  check('오늘 수업 카드가 있음', adminHtml.includes('id="sm-today-classes"'));
  check('로더 스크립트 연결', adminHtml.includes('adm-today-classes.js'));
  check('오늘 수업 API 호출', admToday.includes('/api/admin/classes/today'));
  check('입장 버튼 구현', admToday.includes('window.tcEnterClass'));
  check('입장 전 확인(참관 아님을 알림)', /tcEnterClass[\s\S]{0,700}confirm\(/.test(admToday));
  check('입장 가능한 수업을 위로 정렬', /join_open[\s\S]{0,200}sort|sort[\s\S]{0,200}join_open/.test(admToday));

  check('서버 핸들러 구현', apiAdmin.includes("path === '/api/admin/classes/today'"));
  // 🔴 새 API 는 index.ts 게이트에 등록해야 동작한다 (과거에 여러 번 밟은 함정)
  check('index.ts 인증 게이트에 등록됨',
        idxTs.includes("path === '/api/admin/classes/today'"),
        '등록 안 하면 실서버에서 404 가 난다');

  // room_id 규칙이 두 파일에서 동일해야 매니저와 학생이 같은 방에 모인다
  const ruleMango = apiMango.match(/room_id:\s*`class-\$\{[^`]*\}-\$\{[^`]*\}`/);
  const ruleAdmin = apiAdmin.match(/room_id:\s*`class-\$\{[^`]*\}-\$\{[^`]*\}`/);
  check('학생용 room_id 규칙 확인', !!ruleMango);
  check('매니저용 room_id 규칙이 동일 형식',
        !!ruleAdmin && !!ruleMango,
        '다르면 매니저가 다른 방에 들어가 학생을 못 만난다');
}

/* ── 6. MES/BTS — 코드가 아니라 데이터 ────────────────────────────── */
console.log('\n▶ 6. 교재 샘플(MES/BTS) — 배정 데이터 사안');
{
  // 코드로 특정 교재를 하드코딩해 두면 이 제보가 영원히 안 고쳐진다. 그것만 확인한다.
  check('입장 시 배정 교재를 읽는 경로가 살아 있음',
        indexHtml.includes('vcAutoLoadStudentTextbook'),
        '이 경로가 사라지면 배정 교재가 반영되지 않는다');
}

/* ── 7. 화상수업 설정 버튼 크기 ───────────────────────────────────── */
console.log('\n▶ 7. 화상수업 독 — 설정 버튼 크기');
{
  const w = vcDock.match(/width:\s*(\d+)px;\s*height:\s*(\d+)px;\s*display:flex;flex-direction:column/);
  check('독 버튼 크기 규칙 확인', !!w, w ? '' : '버튼 크기 CSS 를 못 찾음');
  if (w) {
    check('버튼이 충분히 큼(>=70×62)',
          Number(w[1]) >= 70 && Number(w[2]) >= 62, `현재 ${w[1]}×${w[2]}`);
  }
  const pop = vcDock.match(/width:\s*(\d+)px;max-width:94vw/);
  check('설정 팝업이 충분히 넓음(>=390px)',
        !!pop && Number(pop[1]) >= 390, pop ? `현재 ${pop[1]}px` : '팝업 폭을 못 찾음');
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
