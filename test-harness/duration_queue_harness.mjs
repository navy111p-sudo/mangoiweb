// 📅 수업 길이 변경 «월 1회 일괄 반영» 하니스 — 2026-08-17
//
//   왜 필요한가 —
//     30분을 열면서 생긴 두 번째 숙제. 5시 학생이 20→30분으로 바꾸면 뒤 학생이
//     줄줄이 밀린다. 그래서 «신청은 상시 · 반영은 월 1회» 로 나눴다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 아무도 모르는» 것들:
//     ① 미리보기(dry_run)가 기본이 아니면 실수로 수십 건이 한 번에 반영된다
//     ② 「월 1회」 게이트가 없으면 한 달에 몇 번이고 눌려 약속이 깨진다
//     ③ excludeId 를 안 넘기면 «자기 자신과 겹친다» 며 아무것도 못 바꾼다
//     ④ 판정을 여기서 새로 짜면 schedule-conflict.ts 와 어긋난다
//     ⑤ 라우팅·인증 게이트에 등록 안 하면 404 (이 저장소가 반복해 밟은 함정)
//
//   실행: node test-harness/duration_queue_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(root, 'cloudflare-deploy', 'src');
const q   = readFileSync(join(SRC, 'duration-change-queue.ts'), 'utf8');
const idx = readFileSync(join(SRC, 'index.ts'), 'utf8');
const pol = readFileSync(join(SRC, 'class-policy.ts'), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 순수 판정 함수를 원문에서 오려내 «실제로 실행» 한다 ─────────────── */
const parts = [];
parts.push(pol.match(/export const DEFAULT_CLASS_MINUTES = \d+;/)[0].replace(/^export /, ''));
// ⚠️ 순서 주의 — ALLOWED_CLASS_MINUTES 가 ENABLE_25MIN 을 참조하므로 스위치를 먼저 넣는다
parts.push(pol.match(/export const ENABLE_25MIN: boolean = \w+;/)[0]
  .replace(/^export /, '').replace(': boolean', ''));
parts.push(pol.match(/export const ALLOWED_CLASS_MINUTES: number\[\] =[^;]*;/)[0]
  .replace(/^export /, '').replace(': number[]', ''));
parts.push(pol.match(/export function isAllowedClassMinutes[\s\S]*?\n}/)[0]
  .replace(/^export /, '').replace(/\(minutes: any\): boolean \{/, '(minutes) {'));
// 반환 타입이 객체 리터럴({ ok: boolean; … })이라 «첫 { 까지» 로 자르면 시그니처가 깨진다.
// 그래서 시그니처 «줄 하나» 를 통째로 갈아끼운다.
const SIGN = {
  kstMonth: 'function kstMonth(now = Date.now()) {',
  validateDurationRequest: 'function validateDurationRequest(fromMinutes, toMinutes) {',
  canApplyMonth: 'function canApplyMonth(alreadyAppliedMonth, targetMonth) {',
};
for (const fn of Object.keys(SIGN)) {
  const m = q.match(new RegExp(`export function ${fn}[\\s\\S]*?\\n}`));
  if (!m) { console.error(`FAIL extract ${fn}`); process.exit(1); }
  const lines = m[0].split('\n');
  lines[0] = SIGN[fn];                       // 첫 줄(시그니처)만 교체, 본문은 원문 그대로
  parts.push(lines.join('\n'));
}
let api;
try {
  api = new Function(parts.join('\n') + '; return {kstMonth, validateDurationRequest, canApplyMonth, ALLOWED_CLASS_MINUTES};')();
  check('판정 함수가 실행된다', true);
} catch (e) { check('판정 함수가 실행된다', false, e.message); process.exit(1); }

console.log('\n════════ 1부. 신청 검증 ════════');
check('20 → 30분 신청은 통과', api.validateDurationRequest(20, 30).ok === true);
check('20 → 40분 신청은 통과', api.validateDurationRequest(20, 40).ok === true);
check('30 → 20분(줄이기)도 통과', api.validateDurationRequest(30, 20).ok === true);
check('같은 길이는 거부 (바꿀 것이 없다)', api.validateDurationRequest(30, 30).error === 'same_minutes');
check('고를 수 없는 길이(25분)는 거부 — 스위치가 꺼져 있다', api.validateDurationRequest(20, 25).error === 'bad_minutes');
check('고를 수 없는 길이(15분)는 거부', api.validateDurationRequest(20, 15).error === 'bad_minutes');
check('길이 목록은 class-policy 가 정본 (여기 베껴 적지 않는다)',
  !/\[\s*20\s*,\s*30\s*,\s*40\s*\]/.test(q), '큐 모듈에 길이 목록이 복사돼 있다');
check('현재 길이가 비어 있으면 기본 20분으로 본다', api.validateDurationRequest(null, 20).error === 'same_minutes');

console.log('\n════════ 2부. 「월 1회」 게이트 ════════');
check('이번 달에 아직 안 했으면 반영 가능', api.canApplyMonth('2026-07', '2026-08') === true);
check('⛔ 같은 달에 두 번은 막는다', api.canApplyMonth('2026-08', '2026-08') === false);
check('한 번도 반영한 적 없으면 가능', api.canApplyMonth(null, '2026-08') === true);
check('대상 달이 비면 불가(안전)', api.canApplyMonth('2026-07', '') === false);
check('kstMonth 는 KST 기준 YYYY-MM — UTC 15시는 이미 다음 날(한국)',
  api.kstMonth(Date.parse('2026-08-31T15:30:00Z')) === '2026-09',
  api.kstMonth(Date.parse('2026-08-31T15:30:00Z')));
check('kstMonth — UTC 14시는 아직 같은 날(한국 23시)',
  api.kstMonth(Date.parse('2026-08-31T14:00:00Z')) === '2026-08');

console.log('\n════════ 3부. 적용 계약 (되돌아가면 사고) ════════');
check('⛔ 미리보기가 기본 — dry_run 을 명시적으로 false 해야 실제 반영된다',
  /const dryRun = b\.dry_run !== false;/.test(q));
check('⛔ 실제 반영 전에 「월 1회」 게이트를 통과해야 한다',
  /if \(!canApplyMonth\(last\?\.m, month\) && !force\)/.test(q));
check('⛔ 겹침·정원 판정은 schedule-conflict 한 곳을 쓴다 (새로 짜지 않는다)',
  /findScheduleConflicts/.test(q) && !/rowOverlaps|longClassCapReached/.test(q));
check('⛔ excludeId 를 넘긴다 — 없으면 자기 자신과 겹쳐 아무것도 못 바꾼다',
  /excludeId: row\.schedule_id/.test(q));
check('삭제·종료된 수업은 건너뛴다 (유령 행을 만들지 않는다)',
  /sched_status == null/.test(q) && /!== 'active'/.test(q));
check('반영하면 변경 이력을 남긴다', /writeClassAudit/.test(q) && /duration-monthly/.test(q));
check('같은 수업에 대기 신청은 한 건만 (UNIQUE 부분 인덱스)',
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_cdr_one_pending[\s\S]*?WHERE status = 'pending'/.test(q));
check('중복 신청은 409 로 돌려준다', /'already_pending'/.test(q));

console.log('\n════════ 4부. 라우팅·인증 등록 (안 하면 404) ════════');
check('⛔ index.ts 라우팅에 위임이 등록돼 있다', /handleDurationQueue\(request, env as any, path, request\.method\)/.test(idx));
check('⛔ index.ts 관리자 인증 게이트에 경로가 등록돼 있다',
  /path\.startsWith\('\/api\/admin\/duration-requests'\)/.test(idx));
check('handleMangoApi 보다 «먼저» 걸린다 (뒤면 다른 핸들러가 먼저 삼킬 수 있다)',
  idx.indexOf('handleDurationQueue(request') < idx.indexOf('const res = await handleMangoApi(request, url, env, ctx)'));
check('관리자 세션을 확인한다', /checkAdminSession/.test(q));

console.log('\n════════ 5부. 화면 계약 ════════');
{
  const html = readFileSync(join(root, 'cloudflare-deploy', 'public', 'admin', 'duration-requests.html'), 'utf8');
  check('대기 목록 화면이 있다', html.length > 500);
  check('미리보기 버튼이 dry_run:true 로 부른다', /dry_run:\s*true/.test(html));
  check('⛔ 실제 반영은 확인창을 거친다', /confirm\(/.test(html));
  check('이번 달 반영 여부를 화면에 보여 준다', /can_apply_this_month/.test(html));
}

console.log('\n' + '─'.repeat(58));
console.log(fail === 0 ? `✅ ALL PASS (${pass})` : `⚠ PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
