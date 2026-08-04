// -*- coding: utf-8 -*-
// 📊🪑 신규 관리자 API (강사 가동률 · 대기자 명단) 하네스 (2026-08-04)
//   실행: node test-harness/admin_new_apis_harness.mjs
//
//   가장 중요한 것 — «도달 가능성».
//     이 저장소에서 새 /api 경로는 세 곳을 모두 통과해야 실제로 동작한다.
//       ① src/index.ts  라우팅 게이트  (여기 없으면 handleMangoApi 까지 못 감)
//       ② src/index.ts  인증 게이트    (여기 없으면 관리자 세션 검사를 안 받음 = 보안 구멍)
//       ③ src/api-mango.ts 전달 목록   (여기 없으면 handleAdminApi 까지 못 감)
//     index.ts 는 공동 금지구역이라 손댈 수 없어, 세 곳에 «이미» 열려 있는 접두사
//     '/api/admin/stats/' 아래에 붙였다. 누가 경로를 옮기면 조용히 404 가 되므로 여기서 막는다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSrc } from './_srcbundle.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const indexTs = rd('../cloudflare-deploy/src/index.ts');
const mangoTs = rd('../cloudflare-deploy/src/api-mango.ts');
const src     = allSrc();
const admHtml = rd('../cloudflare-deploy/public/admin.html');
const utilJs  = rd('../cloudflare-deploy/public/js/adm-teacher-util.js');
const waitJs  = rd('../cloudflare-deploy/public/js/adm-waitlist.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const NEW_PATHS = [
  '/api/admin/stats/teacher-utilization',
  '/api/admin/stats/waitlist',
];
const OPEN_PREFIX = '/api/admin/stats/';

console.log('\n[ 도달 가능성 — 세 관문을 다 통과하는가 ]');
check('① index.ts 라우팅 게이트에 접두사가 열려 있다',
  indexTs.includes(`path.startsWith('${OPEN_PREFIX}')`));
check('② index.ts 인증 게이트에도 같은 접두사가 있다 (무인증 노출 방지)',
  (indexTs.match(new RegExp(`startsWith\\('${OPEN_PREFIX}'\\)`, 'g')) || []).length >= 2);
check('③ api-mango.ts 가 handleAdminApi 로 전달한다',
  mangoTs.includes(`path.startsWith('${OPEN_PREFIX}')`));
for (const p of NEW_PATHS) {
  check(`경로가 열린 접두사 안에 있다 — ${p}`, p.startsWith(OPEN_PREFIX));
  check(`핸들러가 실제로 존재한다 — ${p}`,
    new RegExp(`path === '${p.replace(/[/-]/g, m => '\\' + m)}'`).test(src));
}

console.log('\n[ 📊 강사 가동률 — 정의가 흔들리지 않게 ]');
check('일회성(one_off) 수업은 제외하고 정기수업만 센다',
  /teacher-utilization[\s\S]{0,4000}?schedule_kind = 'recurring'/.test(src));
check('강사 주간 근무불가(teacher_unavailability weekly)를 가능시간에서 뺀다',
  /teacher-utilization[\s\S]{0,4000}?teacher_unavailability WHERE kind = 'weekly'/.test(src));
check('운영시간대를 실제 수업에서 관측한다 (임의 상수 고정 아님)',
  /observed_from_schedules/.test(src));
check('가능시간 0 일 때 0으로 나누지 않는다',
  /available > 0 \? Math\.round/.test(src));
check('가동률 필드명이 utilization_pct 로 고정',
  /utilization_pct/.test(src) && /avg_utilization_pct/.test(src));
check('설명문을 한/영 두 벌로 내려준다',
  /teacher-utilization[\s\S]{0,6000}?note_en:/.test(src));

console.log('\n[ 🪑 대기자 명단 ]');
check('class_waitlist 테이블을 자동 생성한다',
  /CREATE TABLE IF NOT EXISTS class_waitlist/.test(src));
check('add / resolve / cancel 세 동작을 지원한다',
  /'add'/.test(src) && /action === 'resolve' \|\| action === 'cancel'/.test(src));
check('상태값은 waiting / enrolled / cancelled',
  /'waiting'/.test(src) && /'enrolled'/.test(src) && /'cancelled'/.test(src));
check('희망 시간에 «비어 있는 강사» 를 서버가 계산해준다',
  /free_teachers/.test(src) && /free_teacher_count/.test(src));
check('빈 강사 계산에 근무불가(weekly)도 반영한다',
  /waitlist[\s\S]{0,6000}?teacher_unavailability WHERE kind='weekly'/.test(src));
check('이름 없이 등록되지 않는다',
  /name_required/.test(src));

console.log('\n[ 화면 배선 ]');
check('가동률 화면이 강사관리 카드 «안» 에 있다 (최상위 메뉴를 늘리지 않음)',
  /id="sub-teacher-util"/.test(admHtml) && !/id="card-teacher-util"/.test(admHtml));
check('대기자 화면이 신규상담 카드 «안» 에 있다',
  /id="sub-waitlist"/.test(admHtml) && !/id="card-waitlist"/.test(admHtml));
check('두 스크립트가 admin.html 에 ?v= 와 함께 등록돼 있다',
  /adm-teacher-util\.js\?v=\d+/.test(admHtml) && /adm-waitlist\.js\?v=\d+/.test(admHtml));
check('카드를 펼칠 때 불러온다 (미리 다 받지 않음)',
  /sub-teacher-util"[^>]*ontoggle="if\(this\.open/.test(admHtml) && /sub-waitlist"[^>]*ontoggle="if\(this\.open/.test(admHtml));

console.log('\n[ 한/영 병기 — 강사·운영 인력 상당수가 필리핀 ]');
for (const [nm, js] of [['adm-teacher-util.js', utilJs], ['adm-waitlist.js', waitJs]]) {
  check(`${nm} 이 언어 분기를 갖는다`, /isEn\s*\(/.test(js));
  check(`${nm} 이 한국어만 하드코딩하지 않는다`, /en \?/.test(js));
  check(`${nm} 이 XSS 이스케이프를 쓴다`, /function esc\(/.test(js) && /&amp;/.test(js));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
