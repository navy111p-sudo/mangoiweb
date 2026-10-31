#!/usr/bin/env node
/**
 * 🔄 수업 «변경(앞으로 계속)» — 시리즈 판정 정본(src/class-series-move.ts)을 실제로 돌린다.
 *
 * (2026-09-23 사장님) 「연기는 지정한 날짜에 한 번이고, 변경은 계속이야.」
 * 문자열로는 «어느 행이 같은 시리즈인가» 를 못 본다 — 정본을 node 타입 제거로 실행해
 * «옮긴다» 옆에 «안 옮긴다(다른 요일·다른 강사·미러·지난 회)» 를 짝으로 둔다.
 * 서버 배선(enroll-ops.ts)은 «정본을 부르는가 · 적용이 옛 자리를 다시 확인하는가» 만 본다.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.SERIES_SRC || join(ROOT, 'cloudflare-deploy/src/class-series-move.ts');
const OPS = join(ROOT, 'cloudflare-deploy/src/enroll-ops.ts');

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

const tmp = mkdtempSync(join(tmpdir(), 'series-'));
writeFileSync(join(tmp, 'm.ts'), readFileSync(SRC, 'utf8'));
writeFileSync(join(tmp, 'run.mjs'), `
import * as M from './m.ts';
const A = { id: 1, user_id: 'kim', scheduled_date: '2026-09-23', start_time: '15:40', teacher_id: '22', source: 'adm-enroll:9', status: 'active' };
const R = (o) => Object.assign({}, A, o);
const rows = [
  R({ id: 2, scheduled_date: '2026-09-30' }),
  R({ id: 3, scheduled_date: '2026/10/07' }),
  R({ id: 4, scheduled_date: '2026-09-16' }),              // 지난 회
  R({ id: 5, scheduled_date: '2026-10-01' }),              // 다른 요일(목)
  R({ id: 6, scheduled_date: '2026-10-14', teacher_id: '7' }),
  R({ id: 7, scheduled_date: '2026-10-21', start_time: '16:00' }),
  R({ id: 8, scheduled_date: '2026-10-28', status: 'cancelled' }),
  R({ id: 9, scheduled_date: '2026-11-04', user_id: 'lee' }),
  R({ id: 10, scheduled_date: '2026-11-11', source: 'adm-enroll:10' }),
];
const out = {};
out.move = M.planSeries(A, rows, '2026-09-24', '18:20');
out.mirror = M.planSeries(R({ source: 'c24-mirror' }), rows, '2026-09-24', '18:20');
out.mirrorManual = M.planSeries(R({ source: 'c24-mirror:manual' }), rows, '2026-09-24', '18:20');
out.weekly = M.planSeries(R({ scheduled_date: '' }), rows, '2026-09-24', '18:20');
out.same = M.planSeries(A, rows, '2026-09-23', '15:40');
out.bad = M.planSeries(A, rows, '2026-13-99', '18:20');
out.inactive = M.planSeries(R({ status: 'cancelled' }), rows, '2026-09-24', '18:20');
out.many = M.planSeries(A, rows, '2026-09-24', '18:20', 2);
out.timeOnly = M.planSeries(A, rows, '2026-09-23', '09:05');
const ids = new Set(['1', '2', '3']);
out.rcSelf = M.realConflict({ has: true, student: [{ id: 2 }], teacher: [{ id: 3 }] }, ids);
out.rcOther = M.realConflict({ has: true, student: [{ id: 99 }], teacher: [] }, ids);
out.rcTeacherOther = M.realConflict({ has: true, student: [], teacher: [{ id: 50 }] }, ids);
out.rcCap = M.realConflict({ has: true, student: [], teacher: [], cap: { n: 3 } }, ids);
out.rcNone = M.realConflict({ has: false, student: [{ id: 99 }], teacher: [] }, ids);
out.dow = M.dowOf('2026-09-23');
console.log(JSON.stringify(out));
`);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { /* 아래 전제에서 FAIL */ }

console.log('🔄 class_series_move_harness');
check('전제: 정본을 실제로 실행했다', !!o, (r.stderr || '').slice(0, 300));
if (o) {
  const ids = (p) => (p.items || []).map((x) => x.id).join(',');
  check('① 같은 시리즈(같은 학생·출처·강사·시각·요일, 이후 회)만 고른다 → 1,2,3', o.move.ok && ids(o.move) === '1,2,3', ids(o.move));
  check('① 지난 회·다른 요일·다른 강사·다른 시각·취소·남의 학생·다른 신청은 안 고른다', !/\b(4|5|6|7|8|9|10)\b/.test(ids(o.move)));
  check('① 날짜 차이만큼 옮긴다(+1일, 18:20)',
    o.move.delta_days === 1 && o.move.items[1].to_date === '2026-10-01' && o.move.items[2].to_date === '2026-10-08'
      && o.move.items.every((x) => x.to_time === '18:20' && x.from_time === '15:40'));
  check('① «2026/10/07» 표기도 같은 시리즈로 읽는다', o.move.items.some((x) => x.id === 3 && x.from_date === '2026-10-07'));
  check('② 카페24 미러 행은 막는다(mirror_series)', !o.mirror.ok && o.mirror.error === 'mirror_series');
  check('② c24-mirror:manual 도 막는다', !o.mirrorManual.ok && o.mirrorManual.error === 'mirror_series');
  check('③ 매주 반복 행(날짜 없음)은 weekly_row', !o.weekly.ok && o.weekly.error === 'weekly_row');
  check('③ 같은 날짜·시각이면 no_change', !o.same.ok && o.same.error === 'no_change');
  check('③ 잘못된 날짜는 bad_params', !o.bad.ok && o.bad.error === 'bad_params');
  check('③ 취소된 기준 회는 schedule_not_found', !o.inactive.ok && o.inactive.error === 'schedule_not_found');
  check('③ 상한을 넘으면 잘라서 옮기지 않고 거절(too_many)', !o.many.ok && o.many.error === 'too_many' && (o.many.items || []).length === 0);
  check('③ 시각만 바꿔도 된다(delta 0)', o.timeOnly.ok && o.timeOnly.delta_days === 0 && o.timeOnly.items.length === 3);
  check('④ 시리즈 자신과의 겹침은 진짜 겹침이 아니다', o.rcSelf === false);
  check('④ 다른 수업과의 겹침은 진짜다(학생)', o.rcOther === true);
  check('④ 다른 수업과의 겹침은 진짜다(강사)', o.rcTeacherOther === true);
  check('④ 정원(cap) 초과는 진짜다', o.rcCap === true);
  check('④ has=false 면 겹침 아님', o.rcNone === false);
  check('⑤ 요일은 UTC 로 뽑는다(2026-09-23 = 수)', o.dow === 3);
}

// ── 서버 배선 ──
const ops = readFileSync(OPS, 'utf8');
const at = ops.indexOf("'/api/pay/enroll/admin/series-move'");
const i2 = ops.indexOf("'/api/pay/enroll/admin/series-move'", at + 10);
const body = i2 > 0 ? ops.slice(i2, ops.indexOf('(m-3)', i2) > 0 ? ops.indexOf('(m-3)', i2) : i2 + 12000) : '';
check('⑥ 전제: series-move 라우트를 찾았다', body.length > 500);
check('⑥ 자체 게이트 목록에 등록돼 있다', /ENROLL_ADMIN_SELF_GATED[\s\S]{0,2000}series-move/.test(ops));
check('⑥ 정본 planSeries 를 부른다', /planSeries\(/.test(body));
check('⑥ 겹침은 realConflict 로 거른다', /realConflict\(/.test(body));
check('⑥ 기본은 미리보기(apply 가 참일 때만 쓴다)', /apply/.test(body) && /dry_run/.test(body));
check('⑥ 적용 UPDATE 가 옛 날짜·시각을 WHERE 에서 다시 확인한다',
  /UPDATE class_schedules[\s\S]{0,300}WHERE id = \?[\s\S]{0,200}status\s*=\s*'active'[\s\S]{0,200}scheduled_date[\s\S]{0,200}start_time/.test(body));
check('⑥ 강사 변경은 teacherMoveDenyReason 게이트를 지난다', /teacherMoveDenyReason\(/.test(body));
check('⑥ 행마다 감사 이력을 남긴다', /writeClassAudit\(/.test(body));

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
