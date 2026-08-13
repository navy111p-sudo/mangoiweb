// -*- coding: utf-8 -*-
// 🚷 장기 결석생 하네스 (2026-08-13 수정요청 #05)
//   실행: node test-harness/long_absent_harness.mjs
//
//   이 기능은 «틀려도 티가 안 나는» 종류다. 표에 이름이 몇 줄 뜨면 맞아 보이기 때문이다.
//   그래서 운영 D1 실측으로 확인한 함정 네 가지를 여기에 못박는다.
//
//   ① 출처를 class_schedules 로 바꾸면 안 된다 — 673행뿐이고 학생은 6명, 대부분 type_seed
//      데모라 실수업과 연결돼 있지 않다. 실제 수업은 attendance(18.3만행)에 있다.
//   ② attendance.date 최대값이 **2030-02-20** 이다(예약이 미리 들어온다).
//      오늘로 자르지 않으면 «아직 오지도 않은 수업» 을 결석으로 센다.
//   ③ 연속 3회 이상 후보 207명 중 **154명은 결석이 아니다** —
//      명부에 없음 132 · 출석기록 없음 13 · 수강종료 8 · 비활성 1. 걸러내되 숫자로 보여 줘야 한다.
//   ④ 새 /api/admin/* 는 index.ts 게이트 + api-mango.ts 위임 가드 **둘 다** 등록해야 한다.
//      (index.ts 쪽은 mango_gate_harness 가 실행까지 해서 확인한다. 여기서는 위임 가드를 본다.)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const admin = rd('../cloudflare-deploy/src/api-admin.ts');
const mango = rd('../cloudflare-deploy/src/api-mango.ts');
const html  = rd('../cloudflare-deploy/public/admin.html');
const js    = rd('../cloudflare-deploy/public/js/adm-longabsent.js');
const ia6   = rd('../cloudflare-deploy/public/js/adm-ia6.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => { cond ? PASS++ : (FAIL++, FAILS.push(name)); console.log(`  ${cond ? '✅' : '❌'} ${name}`); };

// 핸들러 본문만 떼어 본다(고정 길이로 자르면 주석이 길어질 때 뒷부분이 잘린다)
const hStart = admin.indexOf(`path === '/api/admin/attendance/long-absent'`);
const hEnd   = hStart >= 0 ? admin.indexOf('can_view_pii: canViewPII', hStart) : -1;
const H = (hStart >= 0 && hEnd > hStart) ? admin.slice(hStart, hEnd) : '';

console.log('\n[ ① 데이터 출처 — attendance 여야 한다 ]');
check('핸들러를 찾았다 (아래 검사의 전제)', H.length > 200);
check('attendance 에서 센다', /FROM attendance a/.test(H));
check('🔴 class_schedules 를 «출결 판정» 에 쓰지 않는다 (담당강사 조인에만 등장)',
  !/FROM class_schedules[\s\S]{0,80}ROW_NUMBER/.test(H));
check('강사 행을 학생 결석으로 세지 않는다 (role 필터)',
  /COALESCE\(a\.role,'student'\) = 'student'/.test(H));

console.log('\n[ ② 미래 수업을 결석으로 세지 않는다 (date 최대값 2030-02-20) ]');
check('오늘(KST)로 위를 자른다', /a\.date <= \?/.test(H));
check('조회 기간 아래도 자른다', /a\.date >= \?/.test(H));
check('오늘 값을 KST 헬퍼로 만든다', /const _laToday = today\(\);/.test(admin));

console.log('\n[ ③ 연속 횟수 — 최신부터 거꾸로, 출석을 만나면 멈춘다 (요구사항 4) ]');
check('학생별 역순 번호를 매긴다',
  /ROW_NUMBER\(\) OVER \(PARTITION BY a\.user_id ORDER BY a\.date DESC, a\.id DESC\)/.test(H));
check('첫 «출석» 행의 번호를 찾는다', /MIN\(CASE WHEN status = 'present' THEN rn END\)/.test(H));
check('연속 횟수 = 첫 출석 번호 - 1 (중간 출석이 곧 리셋)', /COALESCE\(fp - 1, rows_n\)/.test(H));
check('마지막 출석일도 함께 준다', /MAX\(CASE WHEN status = 'present' THEN date END\)/.test(H));

console.log('\n[ ④ 레거시·비대상은 빼되 «숫자로» 보여 준다 (요구사항 주의사항) ]');
check('명부에 없는 uid 를 가려낸다',    /'no_roster'/.test(H));
check('출석 기록이 없는 학생을 가려낸다', /'never_present'/.test(H));
check('수강 종료를 가려낸다',           /'ended'/.test(H));
check('비활성을 가려낸다',              /'inactive'/.test(H));
check('왜 몇 명이 빠졌는지 응답에 담는다', /excluded: _laExcluded/.test(H));
check('걸러내기 «전» 후보 수도 담는다',   /candidates: _laRows\.length/.test(H));
check('화면이 그 숫자를 실제로 적는다',   /renderNote/.test(js) && /명부에 없음|not in roster/.test(js));

console.log('\n[ ⑤ 최근 14일은 «확정 전» 이라고 알린다 (cafe24 야간 증분이 14일만 재조회) ]');
check('확정 경계 날짜를 계산한다', /_laSettleCut/.test(admin));
check('연속 구간 «안» 의 것만 센다',  /g\.fp IS NULL OR r\.rn < g\.fp/.test(H));
check('응답에 확정 경계를 담는다',    /settle_cut: _laSettleCut/.test(H));
check('화면이 ⏳ 로 표시한다',        /recent_unsettled/.test(js) && /⏳/.test(js));

console.log('\n[ ⑥ 권한 — 남의 학생이 보이면 안 된다 ]');
check('지사/대리점 격리를 건다 (scopeFragments)', /const _laScope = await scopeFragments\(env, request\)/.test(H));
check('그 조건을 실제 쿼리에 넣는다', /\$\{_laScope\.uidScope\}/.test(H));
check('전화번호는 권한별로 마스킹한다', /applyPIIScope\(_laItems, _laScope\.scope\)/.test(H));

console.log('\n[ ⑦ 배선 — 두 게이트 다 등록해야 404 가 안 난다 (CLAUDE.md 함정) ]');
{
  const gs = mango.indexOf("path.startsWith('/api/admin/nps/')");
  const ge = mango.indexOf('const rAdmin = await handleAdminApi(', gs);
  const guard = (gs >= 0 && ge > gs) ? mango.slice(gs, ge) : '';
  check('api-mango.ts 위임 가드에 있다', guard.includes("'/api/admin/attendance/long-absent'"));
  // index.ts 게이트는 mango_gate_harness 가 조건식을 «실행»해서 확인한다(여기선 존재만 본다)
  check('index.ts 게이트에도 있다',
    rd('../cloudflare-deploy/src/index.ts').includes("path === '/api/admin/attendance/long-absent'"));
}

console.log('\n[ ⑧ 화면 — 클릭 한 번으로 닿아야 한다 (요구사항 «메뉴 위치») ]');
check('카드가 admin.html 에 있다', /id="card-long-absent"/.test(html));
check('카드를 열면 목록을 부른다 (ontoggle)', /id="card-long-absent"[^>]*ontoggle="if\(this\.open&&window\.laLoad\)laLoad\(\)"/.test(html));
check('스크립트는 카드를 열 때 받는다 (지연 로드)',
  /type="text\/lazy-js"[^>]*data-src="\/js\/adm-longabsent\.js\?v=\d+"[^>]*data-card="card-long-absent"/.test(html));
check('지연 태그가 노출 함수 목록을 들고 있다 (대역 함수용)',
  /data-src="\/js\/adm-longabsent\.js[^"]*"[^>]*data-globals="[^"]*laLoad[^"]*"/.test(html));
check('사이드바에 «자기 항목» 이 있다 — 다른 카드와 겹쳐 놓지 않는다',
  /\{ ko: '장기 결석생',[^}]*cards: \['card-long-absent'\] \}/.test(ia6));
check('검색·정렬 입력이 있다 (요구사항 5)',
  /id="la-q"/.test(html) && /id="la-sort"/.test(html) && /id="la-min"/.test(html));
check('목록에 필수 항목이 다 있다 (이름·아이디·담당강사·연속결석·마지막출석)',
  /학생명/.test(js) && /아이디/.test(js) && /담당 강사/.test(js) && /연속 결석/.test(js) && /마지막 출석/.test(js));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
