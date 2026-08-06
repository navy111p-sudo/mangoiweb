#!/usr/bin/env node
/**
 * 📅 매니저 「오늘 수업」이 매일 비어 있던 것 — 요일 파서 (2026-08-06)
 *
 * 사고 내용
 *   본사 매니저 Maimai: "no class in manager's page sir" + "where to enter sir?"
 *   관리자 화면의 «오늘 수업(바로 입장)» 카드가 **하루도 빠짐없이** 비어 있었다.
 *
 * 원인
 *   /api/admin/classes/today 만 `Number(s.day_of_week) === kDow` 로 비교했다.
 *   운영 D1 의 class_schedules.day_of_week 는 전부 **영문 텍스트**다 —
 *   'Wed' 153건 · 'Fri' 142 · 'Tue' 123 · 'Thu' 108 · 'Mon' 106 · 'Sat' 26 (총 662건).
 *   Number('Thu') = NaN 이고 NaN === 4 는 항상 false → 반복수업 662건이 매일 전량 탈락.
 *   테이블 DDL 에 `day_of_week INTEGER` 라고 적혀 있던 것이 함정이다.
 *   SQLite 는 선언 타입을 강제하지 않는다(실측 typeof = 'text').
 *
 *   ⚠️ 에러가 한 줄도 안 났다. 화면은 "오늘 예정된 수업이 없습니다"라는 **정상 문구**를
 *      띄웠고, 그래서 몇 달째 아무도 «고장»으로 신고하지 않았다.
 *
 *   학생(api-mango.ts)·강사(api-teacher.ts) 경로는 2026-07-24 에 같은 사고를 겪고
 *   관용 파서로 이미 고쳤다. 그때 **매니저 경로만 빠졌다**.
 *
 * 이 하니스가 지키는 것
 *   - 세 경로(매니저·학생·강사)가 **모두** 관용 파서를 쓸 것 (한 곳만 좁으면 엇갈린다)
 *   - 매니저 API 에 Number(day_of_week) 직접 비교가 **되살아나지 않을** 것
 *   - 실제 운영에 들어 있는 표기('Thu','wed','월','1,3',4)가 전부 매칭될 것
 *   - 레벨테스트 수업이 같은 목록에 «구분되어» 실릴 것 (마이마이 요청 #2)
 *
 * ⚠️ 로직을 베껴 쓰지 않는다. api-admin.ts 에서 실제 함수 소스를 떼어 실행한다.
 *    (베껴 쓰면 베낀 쪽만 통과하는 «가짜 검사»가 된다 — 2026-08-06 레벨테스트 하니스 교훈)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '../cloudflare-deploy/src');
const ADMIN = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
const MANGO = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
const TEACHER = readFileSync(join(SRC, 'api-teacher.ts'), 'utf8');
const TCJS = readFileSync(join(__dir, '../cloudflare-deploy/public/js/adm-today-classes.js'), 'utf8');
const ADMIN_HTML = readFileSync(join(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok) {
  if (ok) { PASS++; console.log('  ✅ ' + label); }
  else { FAIL++; FAILS.push(label); console.log('  ⚠ FAIL ' + label); }
}

// ── 0. /api/admin/classes/today 핸들러 본문만 떼어낸다 ────────────────────
const hStart = ADMIN.indexOf(`path === '/api/admin/classes/today'`);
check('① /api/admin/classes/today 핸들러가 api-admin.ts 에 있다', hStart > 0);
const HANDLER = hStart > 0 ? ADMIN.slice(hStart, hStart + 4000) : '';

// ── 1. 되살아나면 안 되는 것 — 숫자 직접 비교 ─────────────────────────────
//    이것이 정확히 그 버그다. 주석이 아니라 실행 코드에 남아 있으면 안 된다.
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
check('② 매니저 핸들러에 Number(day_of_week) 직접 비교가 없다  ← 이 사고의 본체',
  !/Number\(\s*s\.day_of_week\s*\)\s*===/.test(codeOnly(HANDLER)));

// ── 2. 실제 파서 소스를 떼어 «실행» 한다 (베껴 쓰지 않는다) ────────────────
function loadFn(src, mapName, fnName) {
  const mapAt = src.indexOf(`const ${mapName}`);
  const fnAt = src.indexOf(`function ${fnName}`);
  if (mapAt < 0 || fnAt < 0) return null;
  const mapSrc = src.slice(mapAt, src.indexOf('};', mapAt) + 2);
  const fnSrc = src.slice(fnAt, src.indexOf('\n}', fnAt) + 2);
  // TS 타입만 벗긴다 (로직은 한 글자도 건드리지 않는다)
  const strip = (s) => s
    .replace(/:\s*Record<string,\s*number>/g, '')
    .replace(/\(raw:\s*any,\s*target:\s*number\)\s*:\s*boolean/g, '(raw, target)');
  try {
    // eslint-disable-next-line no-new-func
    return new Function(`${strip(mapSrc)}\n${strip(fnSrc)}\nreturn ${fnName};`)();
  } catch (e) { return null; }
}

const admDow = loadFn(ADMIN, 'ADM_DOW_MAP', 'admDowMatches');
check('③ 매니저용 관용 파서(admDowMatches)를 소스에서 떼어 실행할 수 있다', typeof admDow === 'function');

if (typeof admDow === 'function') {
  // 운영 D1 에 실제로 들어 있는 표기 (2026-08-06 SELECT 실측)
  const REAL = [
    ['Thu', 4, true,  '영문 대문자 시작 — 운영 108건'],
    ['Wed', 3, true,  '영문 — 운영 153건(최다)'],
    ['Fri', 5, true,  '영문 — 운영 142건'],
    ['Tue', 2, true,  '영문 — 운영 123건'],
    ['Mon', 1, true,  '영문 — 운영 106건'],
    ['Sat', 6, true,  '영문 — 운영 26건'],
    ['wed', 3, true,  '소문자 — 운영 1건(표기 흔들림)'],
    ['thu', 4, true,  '소문자 — 운영 1건'],
    ['월',  1, true,  '한글 표기'],
    ['월요일', 1, true, '한글 긴 표기'],
    ['1,3', 3, true,  '콤마 목록'],
    [4,     4, true,  '숫자(옛 형식) — 넓히기만 했는지 확인'],
    ['Thu', 5, false, '다른 요일은 매칭되면 안 된다'],
    ['Mon', 4, false, '다른 요일은 매칭되면 안 된다'],
    ['',    4, false, '빈 값은 매칭 금지'],
    [null,  4, false, 'null 은 매칭 금지'],
  ];
  for (const [raw, target, want, why] of REAL) {
    check(`④ day_of_week=${JSON.stringify(raw)} vs ${target} → ${want}  (${why})`,
      admDow(raw, target) === want);
  }

  // 🔁 재현 검사 — 옛 코드(Number 비교)로는 «반드시 실패»해야 한다.
  //   이게 통과하면 하니스가 사고를 못 잡는다는 뜻이다.
  const oldWay = (raw, target) => Number(raw) === target;
  check('⑤ 옛 방식(Number 비교)은 운영 데이터에서 실제로 실패한다 = 재현됨',
    oldWay('Thu', 4) === false && admDow('Thu', 4) === true);
}

// ── 3. 세 경로가 같은 규칙인가 — 한 곳만 좁으면 엇갈린다 ────────────────────
check('⑥ 학생 경로(api-mango sessions/today)도 관용 파서를 쓴다',
  /dowMatches\(\s*s\.day_of_week/.test(MANGO));
check('⑦ 강사 경로(api-teacher)도 관용 파서를 쓴다',
  /dowMatches\(\s*s\.day_of_week/.test(TEACHER));
check('⑧ 매니저 경로도 관용 파서를 쓴다',
  /admDowMatches\(\s*s\.day_of_week/.test(HANDLER));

// 세 파서의 요일 사전이 같은 키를 갖는가 (한쪽만 'sunday' 를 빠뜨리면 또 엇갈린다)
const keysOf = (src, name) => {
  const at = src.indexOf(`const ${name}`);
  if (at < 0) return [];
  const body = src.slice(at, src.indexOf('};', at));
  return [...body.matchAll(/(?:^|[{,\s])'?([a-z가-힣]+)'?\s*:/gm)].map(m => m[1]).sort();
};
const kAdm = keysOf(ADMIN, 'ADM_DOW_MAP'), kTea = keysOf(TEACHER, 'DOW_MAP');
check(`⑨ 매니저·강사 요일 사전의 키가 동일하다 (${kAdm.length}개)`,
  kAdm.length > 0 && kAdm.join('|') === kTea.join('|'));

// ── 4. 마이마이 요청 #2 — 레벨테스트와 일반수업을 «한 화면»에서 ─────────────
check('⑩ 응답에 is_level_test 구분이 실린다', /is_level_test\s*:/.test(HANDLER));
check('⑪ 레벨테스트 판별이 source·notes 를 함께 본다',
  /is_level_test[\s\S]{0,160}s\.source[\s\S]{0,80}s\.notes/.test(HANDLER));
check('⑫ 화면이 레벨테스트 배지를 그린다', /is_level_test/.test(TCJS) && /레벨테스트/.test(TCJS));
check('⑬ 요약줄에도 레벨테스트 건수가 나온다', /레벨테스트 '\s*\+\s*lt|lt \+ ' level test'/.test(TCJS));

// ── 5. 캐시 무효화 — 화면 js 를 고쳤으면 ?v= 를 올려야 반영된다 ─────────────
const vm = ADMIN_HTML.match(/adm-today-classes\.js\?v=(\d+)/);
check('⑭ admin.html 이 adm-today-classes.js 를 ?v= 로 물고 있다', !!vm);
check(`⑮ ?v= 가 4 이상이다  [현재: ${vm ? vm[1] : '없음'}]  ← 안 올리면 옛 js 가 그대로 캐시된다`,
  !!vm && Number(vm[1]) >= 4);

// ── 6. 강사 계정 미연결을 «수업 없음»으로 말하지 않는가 (mangoi_033) ────────
check('⑯ 강사 포털이 계정 미연결 상태를 응답에 싣는다(identity_unlinked)',
  /identity_unlinked/.test(TEACHER));
const TEACHER_HTML = readFileSync(join(__dir, '../cloudflare-deploy/public/teacher.html'), 'utf8');
check('⑰ 화면이 미연결을 «수업 없음»과 다른 문구로 알린다',
  /identity_unlinked/.test(TEACHER_HTML) && /강사 명부와 연결/.test(TEACHER_HTML));

// ── 7. 레벨테스트 수락이 «과거»에 수업을 만들지 않는가 ──────────────────────
//    실사고: 신청 #11(희망 2026-07-13)을 08-06 16:15 에 수락 → 수업 #853 이 한 달 전 날짜로
//    생성됐다. 어느 화면에도 안 뜨고 에러도 없다 → "where to enter sir?"
const CORE = readFileSync(join(__dir, '../cloudflare-deploy/public/js/adm-core.js'), 'utf8');
const csAt = ADMIN.indexOf(`String(b.action || '') === 'create_schedule'`);
/* 📦 (2026-08-06) 「신청 → 수업 만들기」 본체가 leveltest-schedule.ts 로 옮겨졌다.
   신청 직후 **자동으로도** 같은 일을 하게 되면서, 자동·수동이 서로 다르게 동작하지 않도록
   로직을 한 곳에 모은 것이다. 규칙(지난 날짜 차단·KST 기준)은 그대로다 —
   그래서 검사도 두 파일을 함께 본다. 위치만 옮겼는데 실패하면 잘못된 경보가 된다. */
const SCHEDMOD = (() => {
  try { return readFileSync(join(__dir, '../cloudflare-deploy/src/leveltest-schedule.ts'), 'utf8'); }
  catch { return ''; }
})();
const CREATE = [csAt > 0 ? ADMIN.slice(csAt, csAt + 3500) : '', SCHEDMOD].join('\n');
check('⑱ create_schedule 에 지난 날짜 차단(past_date)이 있다', /error:\s*'past_date'/.test(CREATE));
check('⑲ 차단 기준이 KST 오늘이다 (UTC 로 재면 한국 새벽에 오늘이 지난 날이 된다)',
  /9\s*\*\s*3600\s*\*\s*1000[\s\S]{0,120}slice\(0,\s*10\)/.test(CREATE));
check('⑳ 관리자가 새 날짜로 다시 만들 수 있다 (b.scheduled_date 를 받는다)',
  /b\.scheduled_date/.test(CREATE));
check('㉑ 화면이 past_date 에서 새 날짜를 되묻는다 (막기만 하고 끝내지 않는다)',
  /past_date/.test(CORE) && /scheduled_date:\s*nd\.trim\(\)/.test(CORE));
check('㉒ 되물은 날짜를 실제로 서버에 실어 보낸다',
  /body:\s*JSON\.stringify\(\{[^}]*scheduled_date:\s*opts\.scheduled_date/.test(CORE));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
