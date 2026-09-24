#!/usr/bin/env node
/* schedule_once_and_sched_col_harness — 2026-09-21
 *
 * [왜] 사장님 제보 셋을 고친 뒤 되돌아가지 않게 못 박는다(jeong · 활성 예약 5건).
 *   ① 학생 명부 «예약» 칸이 도입(9/15) 이래 항상 «—» 였다.
 *      값을 싣는 곳은 erp-list 인데 그 표가 실제로 부르는 것은 unified 였고,
 *      화면 매핑(apiItems)에도 sched 를 옮기는 줄이 없어 «두 겹» 으로 빠져 있었다.
 *   ② 홈 «내 수업» 카드가 이미 끝난 날짜 지정 수업(9/14)을 계속 보여 줬다.
 *      서버가 status != 'cancelled' 만 보고 지난 날짜를 안 걸렀다
 *      (실측 2026-09-21: 지난 날짜인데 활성인 행 1,808건 · 학생 495명).
 *   ③ 관리자 스케줄 줄이 «이 날 하루만» 이라고 말하지 않아, 하루짜리 수업을
 *      «매주 도는 수업» 으로 읽으셨다(배지 «정규수업» 은 수업 종류이지 반복이 아니다).
 *
 * [어떻게] 문자열로 «그 줄이 있는가» 를 묻지 않는다 — 셋 다 «무슨 답이 나오는가» 로 묻는다.
 *   · ②는 api-mango.ts 의 map/filter/sort 블록을 오려 내 esbuild 로 변환해 실제로 돌린다.
 *   · ③은 mgsOnceInfo() 를 오려 내 실제로 돌린다.
 *   · ①은 화면 매핑 객체를 오려 내 실제로 평가해 «sched 가 옮겨지는가» 를 답으로 본다.
 *   그리고 «막힌다» 옆에 언제나 «그대로다» 를 짝으로 둔다 — 짝이 없으면
 *   «전부 빼기»·«전부 넣기» 같은 엉터리 수리도 통과한다.
 */
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) pass++; else fail++;
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); };

/** 중괄호 짝으로 블록을 자른다 (길이로 자르면 옆 코드가 딸려 온다 — CLAUDE.md 2장). */
const braceBlock = (s, from) => {
  const st = s.indexOf('{', from);
  if (st < 0) return '';
  let d = 0;
  for (let i = st; i < s.length; i++) {
    if (s[i] === '{') d++;
    else if (s[i] === '}') { d--; if (!d) return s.slice(st, i + 1); }
  }
  return '';
};

/** 부정 검사(«이 글자가 없어야 한다»)용 — 주석을 벗긴 사본.
 *  ⛔ 안 벗기면 「⛔ … 하지 말 것」 이라고 적은 내 주석을 검사가 잡는다(CLAUDE.md 2장).
 *  ⚠️ 문자열 안의 `https://` 가 잘리지 않게 «문자열 안인가» 도 함께 좇는다. */
const stripComments = (src) => {
  let out = '', i = 0, q = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') { out += c + (n || ''); i += 2; continue; }
             if (c === q) q = ''; out += c; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; out += ' '; continue; }
    out += c; i++;
  }
  return out;
};

const RUN_ESBUILD = (esbuildPath, args, opts) => (process.platform === 'win32'
  ? execFileSync(process.execPath, [esbuildPath, ...args], opts)
  : execFileSync(esbuildPath, args, opts));

/* ══════════════════════════════════════════════════════════════
   ② 홈 «내 수업» — 이미 끝난 날짜 지정 수업을 서버가 걸러 주는가
   ══════════════════════════════════════════════════════════════ */
console.log('\n② /api/class/schedule/mine — 지난 «날짜 지정» 수업 제외');

const MANGO = rd('cloudflare-deploy/src/api-mango.ts');
const MS_START = 'const schedules = msRows.map((r: any) => {';
const MS_END = '(b.next_start_ts == null ? Infinity : b.next_start_ts));';
const msI = MANGO.indexOf(MS_START);
const msJ = MANGO.indexOf(MS_END, msI);
const msBlock = (msI >= 0 && msJ > msI) ? MANGO.slice(msI, msJ + MS_END.length) : '';
// ⚠️ 전제 — 못 오려 내면 아래 검사가 빈 문자열을 보고 조용히 통과한다.
ok('[전제] schedules 조립 블록을 오려 냈다', msBlock.length > 400);

/* 📅 (2026-09-24) 블록이 시작일 정본 normStartsOn 을 부른다 — ⛔ 베끼지 말고 정본 파일에서 오려 온다. */
const SO_SRC = rd('cloudflare-deploy/src/class-start-date.ts');
const SO_FN = (SO_SRC.match(/const YMD = [^\n]*\n/) || [''])[0]
  + ((SO_SRC.match(/export function normStartsOn[\s\S]*?\n}\n/) || [''])[0]).replace(/^export /, '');
ok('[전제] 시작일 정본(normStartsOn)을 오려 냈다', /function normStartsOn/.test(SO_FN));

let msRun = null;
if (msBlock) {
  try {
    const tsSrc = `
export function run(msRows, msNow) {
  const MS_KST = 9 * 3600 * 1000;
  const msK = new Date(msNow + MS_KST);
  const msKY = msK.getUTCFullYear(), msKMo = msK.getUTCMonth(), msKD = msK.getUTCDate(), msKDow = msK.getUTCDay();
  const msPad = (n: number) => String(n).padStart(2, '0');
  const dowList = (v: any) => String(v || '').split(',').map((x: string) => x.trim()).filter(Boolean)
    .map((x: string) => ({ sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 } as any)[x.toLowerCase()])
    .filter((n: any) => n !== undefined);
  const DOW_LABEL_KO = ['일','월','화','수','목','금','토'];
  const DOW_LABEL_EN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  ${SO_FN}
  ${msBlock};
  return schedules;
}`;
    // ⚠️ transform 모드(stdin→stdout)에는 --outfile 이 없다 — 결과를 받아 직접 쓴다.
    const outDir = mkdtempSync(join(tmpdir(), 'mangoi-once-'));
    const outFile = join(outDir, 'mine.mjs');
    const js = RUN_ESBUILD(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [
      '--loader=ts', '--format=esm', '--target=es2022',
    ], { input: tsSrc, stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    writeFileSync(outFile, js);
    msRun = (await import(pathToFileURL(outFile).href)).run;
  } catch (e) {
    console.log('  ❌ esbuild 변환 실패 — 이 절은 esbuild 가 있어야 돕니다:',
      String((e && (e.stderr ? e.stderr.toString() : e.message)) || e).split('\n')[0]);
    fail++;
  }
}

if (msRun) {
  // 2026-09-21 12:00 KST 를 «지금» 으로 둔다
  const NOW = Date.UTC(2026, 8, 21, 3, 0, 0);
  const row = (o) => Object.assign(
    { id: 1, day_of_week: null, scheduled_date: null, start_time: '18:30', duration_min: 20,
      class_type: 'regular', teacher_name: 'MAIMAI' }, o);
  const ids = (list) => list.map((s) => s.schedule_id).sort((a, b) => a - b).join(',');

  // 사장님 화면의 실제 데이터 (D1 실측 — 일회성 9/14 + 반복 4건)
  const jeong = [
    row({ id: 2479, scheduled_date: '2026-09-14' }),
    row({ id: 848, day_of_week: 'tue', start_time: '19:20' }),
    row({ id: 849, day_of_week: 'wed', start_time: '19:20' }),
    row({ id: 850, day_of_week: 'thu', start_time: '19:20' }),
    row({ id: 851, day_of_week: 'fri', start_time: '19:20' }),
  ];
  const got = msRun(jeong, NOW);
  ok('지난 일회성(9/14)은 빠진다 — 제보의 그 줄', ids(got) === '848,849,850,851');
  // ⛔ 짝 — 이것이 없으면 «전부 빼기» 도 통과한다
  ok('[짝] 매주 반복 4건은 그대로 남는다', got.length === 4);
  // 📅 (2026-09-24) 매주 반복의 시작일이 미래면 «다음 회차» 가 시작일 이후 첫 요일로 밀린다
  const soGot = msRun([row({ id: 20, day_of_week: 'fri', starts_on: '2026-10-09' })], NOW);
  ok('시작일(10/9 금)이 미래면 다음 회차가 10/9 다', soGot[0] && soGot[0].next_date === '2026-10-09');
  ok('[짝] 시작일이 지났으면 예전대로 이번 주 금요일(9/25)', (msRun([row({ id: 21, day_of_week: 'fri', starts_on: '2026-09-01' })], NOW)[0] || {}).next_date === '2026-09-25');
  ok('[짝] 오늘(9/21) 일회성은 남는다',
    ids(msRun([row({ id: 7, scheduled_date: '2026-09-21', start_time: '23:00' })], NOW)) === '7');
  ok('[짝] 앞으로 올 일회성(9/30)은 남는다',
    ids(msRun([row({ id: 8, scheduled_date: '2026-09-30' })], NOW)) === '8');
  // 오늘 수업이라도 «끝나고 유예(길이+15분)» 가 지났으면 빠진다 — 반복 수업과 같은 기준
  ok('오늘이라도 끝난 지 오래면 빠진다(09:00 수업을 12:00 에 봄)',
    msRun([row({ id: 9, scheduled_date: '2026-09-21', start_time: '09:00' })], NOW).length === 0);
  ok('끝난 직후 유예 안이면 남는다(11:30+20분 수업)',
    msRun([row({ id: 10, scheduled_date: '2026-09-21', start_time: '11:30' })], NOW).length === 1);
  // 모르면 «남기는 쪽» 으로 실패한다 — 수업이 조용히 사라지는 것이 더 나쁘다
  ok('날짜 형식이 깨지면 남긴다(모르면 안 지움)',
    msRun([row({ id: 11, scheduled_date: '2026/09/14' })], NOW).length === 1);
  // 내부 표시는 응답으로 새면 안 된다
  ok('내부 표시(_past)는 응답에 안 실린다',
    Object.keys(msRun([row({ id: 12, scheduled_date: '2026-09-30' })], NOW)[0] || {})
      .every((k) => k !== '_past'));
}

/* ══════════════════════════════════════════════════════════════
   ③ 관리자 스케줄 줄 — «이 날 하루만» · «지난 수업»
   ══════════════════════════════════════════════════════════════ */
console.log('\n③ 관리자 학생 상세 — «이 날 하루만» · «지난 수업» 표시');

const STU = rd('cloudflare-deploy/public/admin/student.html');
const oiI = STU.indexOf('function mgsOnceInfo');
const oiBlock = oiI >= 0 ? STU.slice(oiI, oiI + braceBlock(STU, oiI).length + (STU.indexOf('{', oiI) - oiI)) : '';
ok('[전제] mgsOnceInfo 를 오려 냈다', oiBlock.includes('return {'));

let onceInfo = null;
try { onceInfo = new Function(oiBlock + '\nreturn mgsOnceInfo;')(); } catch { /* 아래 검사에서 잡힌다 */ }
ok('[전제] mgsOnceInfo 가 실제로 돈다', typeof onceInfo === 'function');

if (typeof onceInfo === 'function') {
  const T = '2026-09-21';
  ok('9/14 일회성 → 하루짜리이고 «지났다»',
    onceInfo('2026-09-14', T).once === true && onceInfo('2026-09-14', T).past === true);
  ok('[짝] 오늘 일회성 → 하루짜리이지만 «안 지났다»',
    onceInfo('2026-09-21', T).once === true && onceInfo('2026-09-21', T).past === false);
  ok('[짝] 앞으로 올 일회성 → 안 지났다', onceInfo('2026-09-30', T).past === false);
  ok('[짝] 매주 반복(날짜 없음) → 하루짜리가 아니다',
    onceInfo(null, T).once === false && onceInfo(null, T).past === false);
  /* ⚠️ 반례를 잘못 고르면 이 검사가 헛돌아 «형식 검사를 지우는 변이» 를 못 잡는다.
     '2026/09/14' 는 문자열로도 오늘보다 «큼» 이라 형식 검사 없이도 false 가 나왔다
     (2026-09-21 변이시험에서 실제로 밟음). 사전순으로 «작은» 깨진 값으로 물어야 한다. */
  ok('날짜 형식이 깨지면 «지났다» 고 안 적는다(사전순으로는 과거인 값)',
    onceInfo('2025/09/14', T).past === false && onceInfo('2025-9-14', T).past === false);
  ok('[짝] 형식이 맞는 과거는 제대로 «지났다»', onceInfo('2025-09-14', T).past === true);
}

// 배선 — 판정을 «부르고» 그 답을 실제로 그리는가 («그 글자가 있는가» 로는 조건 뒤집기를 못 잡는다)
const stuRender = STU.slice(STU.indexOf('listEl.innerHTML = items.map'), STU.indexOf('}).join(\'\');', STU.indexOf('listEl.innerHTML = items.map')));
ok('[전제] 스케줄 줄 렌더 블록을 오려 냈다', stuRender.length > 500);
ok('렌더가 mgsOnceInfo() 를 실제로 부른다', /mgsOnceInfo\s*\(/.test(stuRender));
ok('그 답(_oi.once)으로 «하루만» 칩을 만든다', /_oi\.once\s*\n?\s*\?/.test(stuRender) || /_oi\.once\s*\?/.test(stuRender));
ok('그 답(_oi.past)으로 «지난 수업» 칩을 만든다', /_oi\.past\s*\n?\s*\?/.test(stuRender) || /_oi\.past\s*\?/.test(stuRender));
ok('두 칩이 실제로 HTML 에 붙는다', /\+\s*_onceChip\s*\+\s*_pastChip/.test(stuRender));
ok('EN/KO 를 함께 낸다', /_lang === 'en'/.test(stuRender));
// ⛔ 날짜를 두 곳에서 재면 조용히 어긋난다
/* ⚠️ 부정 검사라 «주석을 벗긴» 사본으로 판정한다 — 바로 위에 내가
   「⛔ 여기서 날짜를 다시 재지 말 것」 이라고 적어 두었기 때문이다. */
ok('렌더가 날짜를 다시 재지 않는다(정본은 mgsOnceInfo 한 곳)',
  !/new Date\(\)\s*[<>]/.test(stripComments(stuRender)));

/* ══════════════════════════════════════════════════════════════
   ① 학생 명부 «예약» 칸 — 값이 화면까지 닿는가
   ══════════════════════════════════════════════════════════════ */
console.log('\n① 학생 명부 «예약» 칸 — 서버가 싣고 화면이 옮기는가');

const ADMIN = rd('cloudflare-deploy/src/api-admin.ts');
const uniI = ADMIN.indexOf("path === '/api/admin/students/unified'");
const uniBlock = uniI >= 0 ? braceBlock(ADMIN, uniI) : '';
ok('[전제] unified 라우트 블록을 오려 냈다', uniBlock.length > 500);
ok('unified 가 예약 요약 정본을 부른다', /loadSchedSummaryMap\s*\(/.test(uniBlock));
ok('그 값을 학생마다 sched 로 넣는다', /\.sched\s*=/.test(uniBlock));
ok('넣는 자리가 응답을 만들기 «전» 이다',
  uniBlock.indexOf('.sched =') > 0 && uniBlock.indexOf('.sched =') < uniBlock.lastIndexOf('return json('));
// ⛔ 짝 — erp-list 쪽을 대신 지우는 «수리» 를 막는다
/* ⛔ 검사 범위를 «길이» 로 자르지 않는다 — 4000자 창은 여유가 104자뿐이라
   무해한 주석 133자만 들어와도 거짓 FAIL 이 났다(2026-09-21 함정 대조 실측).
   라우트 블록을 중괄호 짝으로 자른다(CLAUDE.md 2장). */
const erpI = MANGO.indexOf("students/erp-list");
const erpBlock = erpI >= 0 ? braceBlock(MANGO, erpI) : '';
ok('[전제] erp-list 라우트 블록을 오려 냈다', erpBlock.length > 500);
ok('[짝] erp-list 도 여전히 그 값을 싣는다',
  /loadSchedSummaryMap\s*\(/.test(erpBlock) && /\.sched\s*=/.test(erpBlock));
// 정본은 한 곳 — 라벨 문장을 서버·화면이 따로 만들면 반드시 어긋난다
/* ⚠️ 부정 검사를 «파일 전체» 에 걸지 않는다 — 무관한 코드가 걸려 거짓 FAIL 이 난다.
   예약 칸을 그리는 «그 자리»(_schedTd)만 잘라서 주석을 벗기고 본다. */
const CORE_FOR_NEG = rd('cloudflare-deploy/public/js/adm-core.js');
const tdNegI = CORE_FOR_NEG.indexOf('const _schedTd = (s) =>');
const tdNeg = tdNegI >= 0 ? stripComments(braceBlock(CORE_FOR_NEG, tdNegI)) : '';
ok('[전제] 예약 칸 렌더를 부정 검사용으로 오려 냈다', tdNeg.length > 80);
ok('«주 N회» 문장을 서버 밖에서 조립하지 않는다',
  !/'주 '\s*\+/.test(tdNeg) && !/[Ww]eekly/.test(tdNeg));

// 화면 매핑 — 객체를 «실제로 평가» 해 sched 가 옮겨지는지 답으로 본다
const CORE = rd('cloudflare-deploy/public/js/adm-core.js');
const mapI = CORE.indexOf('apiItems = rows.map(s => ({');
const mapBlock = mapI >= 0 ? CORE.slice(CORE.indexOf('({', mapI) + 1, CORE.indexOf('}));', mapI) + 1) : '';
ok('[전제] 명부 매핑 객체를 오려 냈다', mapBlock.length > 300);
let mapped = null;
try {
  mapped = new Function('s', 'return ' + mapBlock + ';')({
    user_id: 'jeong', name: '정우영',
    sched: { weekly: 4, upcoming: 0, past: 1, total: 5, label_ko: '주 4회', label_en: '4/wk' },
  });
} catch { /* 아래에서 잡힌다 */ }
ok('[전제] 매핑이 실제로 돈다', mapped && typeof mapped === 'object');
if (mapped) {
  ok('서버가 준 예약 요약이 화면 행까지 옮겨진다', !!mapped.sched && mapped.sched.label_ko === '주 4회');
  // ⛔ 짝 — «항상 값이 있는 척» 하는 엉터리 수리를 막는다
  let none = null;
  try { none = new Function('s', 'return ' + mapBlock + ';')({ user_id: 'x', name: 'x' }); } catch {}
  ok('[짝] 서버가 안 주면 지어내지 않는다', none && !none.sched);
}

// 칸을 그리는 쪽 — 라벨을 «고르기만» 하는가
const tdI = CORE.indexOf('const _schedTd = (s) =>');
const tdBlock = tdI >= 0 ? braceBlock(CORE, tdI) : '';
ok('[전제] 예약 칸 렌더를 오려 냈다', tdBlock.length > 100);
ok('칸이 s.sched 를 읽는다', /s\.sched/.test(tdBlock));
ok('라벨은 서버 값(label_ko/label_en)을 고르기만 한다',
  /label_en/.test(tdBlock) && /label_ko/.test(tdBlock));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
