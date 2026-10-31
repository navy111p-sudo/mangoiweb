// 🪑 긴 수업(20분 초과) 하루 정원 하니스 — 2026-08-17
//
//   왜 필요한가 —
//     30분을 열면서 생긴 문제는 «빈틈» 이 아니라 «자리 부족» 이다. 강사가 적은데
//     긴 수업을 무제한으로 받으면 한 강사의 하루가 차서 20분 학생이 못 들어간다.
//     격자로는 못 막고 정원으로 막아야 한다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 아무도 모르는» 것들:
//     ① 기본값이 0(무제한)에서 벗어나면 «설정한 적 없는 모든 강사» 가 일제히 막힌다
//     ② 30분만 세고 40분을 빠뜨리면 정원이 그대로 새어나간다
//     ③ 20분 수업까지 세면 멀쩡한 등록이 막힌다
//     ④ 자기 자신을 세면 «수업을 옮기는» 것이 정원 초과로 막힌다
//     ⑤ 요일별로 안 세고 통째로 세면 월요일이 찼다고 수요일까지 막힌다
//
//   판정 함수는 src/schedule-conflict.ts 원문에서 오려내 «실제로 실행» 한다.
//   («이렇게 적혀 있다» 는 확인이 아니다 — DB 접근부만 주입으로 대체한다)
//
//   실행: node test-harness/long_class_cap_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pol = readFileSync(join(root, 'cloudflare-deploy', 'src', 'class-policy.ts'), 'utf8');
const sc  = readFileSync(join(root, 'cloudflare-deploy', 'src', 'schedule-conflict.ts'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 원문에서 순수 함수·상수를 오려낸다 ───────────────────────────── */
const parts = [];
for (const fn of ['isLongClass', 'longClassCapReached']) {
  const m = pol.match(new RegExp(`export function ${fn}[\\s\\S]*?\\n}`));
  if (!m) { console.error(`FAIL extract ${fn}`); process.exit(1); }
  parts.push(m[0].replace(/^export /, '')
    .replace(/\(([^)]*)\): (?:number|boolean) \{/, (s, a) => `(${a.replace(/: (?:number|any)/g, '')}) {`));
}
for (const cn of ['DEFAULT_CLASS_MINUTES', 'DEFAULT_LONG_CLASS_DAILY_CAP']) {
  const m = pol.match(new RegExp(`export const ${cn} = \\d+;`));
  if (!m) { console.error(`FAIL extract ${cn}`); process.exit(1); }
  parts.push(m[0].replace(/^export /, ''));
}
const whole = sc.match(/export async function findLongClassCapBlock[\s\S]*?\n\}/);
if (!whole) { console.error('FAIL extract findLongClassCapBlock'); process.exit(1); }
// 시그니처는 «| null> {» 로 끝난다 — Promise<{…}> 안의 여는 중괄호에 속지 않게 그 지점을 기준으로 자른다
const MARK = '| null> {';
const bodyStart = whole[0].indexOf(MARK) + MARK.length;
const body = ('async function findLongClassCapBlock(env, q) {' + whole[0].slice(bodyStart))
  .replace('await longClassCapFor(env, teacherId)', 'env.__cap')
  .replace('await longClassCountsByDay(env, teacherId, q)', 'env.__counts');
parts.push(body);

let api;
try {
  api = new Function(parts.join('\n') + '; return {findLongClassCapBlock, isLongClass, longClassCapReached, DEFAULT_LONG_CLASS_DAILY_CAP, DEFAULT_CLASS_MINUTES};')();
  check('정원 판정 함수가 실행된다', true);
} catch (e) {
  check('정원 판정 함수가 실행된다', false, e.message);
  process.exit(1);
}

const E = (cap, counts) => ({ __cap: cap, __counts: counts });
const REC = (days, dur, ex) => ({ kind: 'recurring', teacherId: 'T1', days, durationMin: dur, excludeId: ex });
const ONE = (d, dur) => ({ kind: 'one_off', teacherId: 'T1', schedDate: d, durationMin: dur });

console.log('\n════════ 1부. 기본값 — 켜지 않으면 아무것도 안 막는다 ════════');
check('⛔ 기본 정원은 0(무제한) — 바꾸면 설정 안 한 모든 강사가 일제히 막힌다',
  api.DEFAULT_LONG_CLASS_DAILY_CAP === 0, api.DEFAULT_LONG_CLASS_DAILY_CAP);
check('정원 0 이면 아무리 많아도 통과', await api.findLongClassCapBlock(E(0, { '1': 99 }), REC([1], 30)) === null);

console.log('\n════════ 2부. 무엇을 «긴 수업» 으로 세는가 ════════');
check('20분은 긴 수업이 아니다', api.isLongClass(20) === false);
check('30분은 긴 수업', api.isLongClass(30) === true);
check('⛔ 40분도 긴 수업 — 30분만 세면 40분으로 그대로 새어나간다', api.isLongClass(40) === true);
check('20분 수업은 정원과 무관 (세면 멀쩡한 등록이 막힌다)',
  await api.findLongClassCapBlock(E(2, { '1': 9 }), REC([1], 20)) === null);
check('40분 등록도 정원에 걸린다',
  (await api.findLongClassCapBlock(E(2, { '1': 2 }), REC([1], 40))) !== null);

console.log('\n════════ 3부. 정원 경계 ════════');
check('정원 4 · 이미 3건 → 통과', await api.findLongClassCapBlock(E(4, { '1': 3 }), REC([1], 30)) === null);
{
  const r = await api.findLongClassCapBlock(E(4, { '1': 4 }), REC([1], 30));
  check('정원 4 · 이미 4건 → 막힘', !!r, r);
  check('막힌 사유에 현재/정원이 담긴다 (4/4)', r && r.count === 4 && r.cap === 4, r);
}
check('경계 판정은 «>=» — 정원과 같으면 이미 꽉 찬 것',
  api.longClassCapReached(4, 4) === true && api.longClassCapReached(3, 4) === false);

console.log('\n════════ 4부. 요일·날짜를 따로 센다 ════════');
{
  const r = await api.findLongClassCapBlock(E(3, { '1': 1, '3': 3 }), REC([1, 3], 30));
  check('⛔ 월 여유·수 만석 → 수요일 때문에 막힌다 (통째로 세면 안 된다)', !!r && r.day === '3', r);
}
check('월만 신청하면 수요일이 꽉 차 있어도 통과',
  await api.findLongClassCapBlock(E(3, { '1': 1, '3': 3 }), REC([1], 30)) === null);
check('1회성 — 그 날짜가 꽉 차면 막힘',
  (await api.findLongClassCapBlock(E(2, { '2026-09-01': 2 }), ONE('2026-09-01', 30))) !== null);
check('1회성 — 다른 날짜는 무관',
  await api.findLongClassCapBlock(E(2, { '2026-09-01': 2 }), ONE('2026-09-02', 30)) === null);

console.log('\n════════ 5부. 안전장치 ════════');
check('강사 미지정이면 정원 판정 안 함',
  await api.findLongClassCapBlock(E(1, { '1': 5 }), { kind: 'recurring', teacherId: '', days: [1], durationMin: 30 }) === null);
check('⛔ 자기 자신을 빼는 excludeId 가 판정부에 남아 있다 (없으면 «옮기기» 가 막힌다)',
  /excludeId/.test(sc) && /String\(row\.id\) === exclude\) continue/.test(sc));
check('⛔ 조회 실패는 «여유 있음» 으로 본다 (등록을 막지 않는다)',
  /catch \{ \/\* 조회 실패는/.test(sc));
check('duration_min 이 비면 옛 20분 수업으로 보고 안 센다',
  /Number\(row\.duration_min\) \|\| DEFAULT_CLASS_MINUTES/.test(sc));

console.log('\n════════ 6부. 화면·저장 계약 ════════');
{
  const ops = readFileSync(join(root, 'cloudflare-deploy', 'src', 'enroll-ops.ts'), 'utf8');
  check('teacher_pricing 에 정원 컬럼을 붙인다(재배포 호환 ALTER)',
    /ALTER TABLE teacher_pricing ADD COLUMN long_class_daily_cap/.test(ops));
  check('⛔ 요율만 저장하는 호출이 정원을 지우지 않는다 (COALESCE)',
    /long_class_daily_cap=COALESCE\(\?, teacher_pricing\.long_class_daily_cap\)/.test(ops));
  check('학생 예약 화면의 강사 목록에서 정원 찬 강사를 뺀다',
    /teachersFreeAt long-class cap/.test(ops) && /isLongClass\(minutes\)/.test(ops));
  const html = readFileSync(join(root, 'cloudflare-deploy', 'public', 'enroll-ops.html'), 'utf8');
  check('관리 화면에 정원 입력칸이 있다', /input class="cap"/.test(html));
  check('관리 화면이 정원을 함께 저장한다', /long_class_daily_cap: cap/.test(html));
}

console.log('\n' + '─'.repeat(58));
console.log(fail === 0 ? `✅ ALL PASS (${pass})` : `⚠ PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
