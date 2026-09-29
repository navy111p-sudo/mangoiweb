// 교사 [수업 입장] — 방(room_id)이 바뀐 뒤에도 옛 방으로 가지 않는가 (2026-09-29)
// teacher.html 의 freshClass·joinClass 를 오려 내 «실제로 돌리고», renderClasses 지문에
// room_id 가 들어가는지를 지문 조립식을 평가해 확인한다. 브라우저 판: manual/teacher-join-room-sync-browser.mjs
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../cloudflare-deploy/public/teacher.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (m, c) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FAIL', m); } };
function fnBody(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
const fresh = fnBody('freshClass'), join = fnBody('joinClass');
ok('전제: freshClass·joinClass 를 오려 냈다', !!fresh && !!join);
let nav = null;
function run(DATA, c) {
  nav = null;
  try {
    const f = new Function('DATA', 'c', 'location', fresh + '\n' + join + '\n joinClass(c);');
    const loc = {}; f(DATA, c, loc); nav = loc.href || null;
  } catch (e) { nav = 'ERR ' + e.message; }
  return nav ? decodeURIComponent((String(nav).match(/vc_room=([^&]*)/) || [])[1] || '') : '';
}
const old = { schedule_id: 7, kind: 'class', room_id: 'class-7-20260929' };
ok('DATA 가 새 방이면 누르는 순간 새 방으로 간다', run({ me: { name: 'Kaye' }, classes: [{ schedule_id: 7, kind: 'class', room_id: 'meet-1234' }] }, old) === 'meet-1234');
ok('(짝) DATA 가 그대로면 원래 방', run({ me: {}, classes: [old] }, old) === 'class-7-20260929');
ok('(짝) 다른 수업 번호의 방을 가져오지 않는다', run({ me: {}, classes: [{ schedule_id: 8, kind: 'class', room_id: 'meet-9' }] }, old) === 'class-7-20260929');
ok('(짝) 번호가 같아도 안내 줄(kind 다름)은 안 가져온다', run({ me: {}, classes: [{ schedule_id: 7, kind: 'c24', room_id: 'meet-9' }] }, old) === 'class-7-20260929');
ok('(짝) DATA 가 없으면 받은 줄 그대로', run(null, old) === 'class-7-20260929');
// 지문
const rc = fnBody('renderClasses');
const si = rc.indexOf("var sig = LANG + '|';"), se = rc.indexOf('if (sig === lastSig) return;');
ok('전제: 지문 조립부를 찾았다', si > 0 && se > si);
const loop = rc.slice(si, se);
function sigOf(row) {
  try { return new Function('LANG', 'list', 'now', 'stuName', 'stuUid', loop.replace("var sig = LANG + '|';", "var sig = LANG + '|'; var t = now();") + '\nreturn sig;')('ko', [row], () => 0, () => '', () => ''); }
  catch (e) { return 'ERR ' + e.message; }
}
const base = { schedule_id: 7, start_time: '19:00', open_at_ts: 1, start_ts: 2, close_at_ts: 3, room_id: 'class-7-20260929', duration_min: 20 };
ok('지문이 돈다', !String(sigOf(base)).startsWith('ERR'));
ok('room_id 만 바뀌어도 지문이 바뀐다(다시 그림)', sigOf(base) !== sigOf({ ...base, room_id: 'meet-1234' }));
ok('길이만 바뀌어도 지문이 바뀐다', sigOf(base) !== sigOf({ ...base, duration_min: 40, close_at_ts: 9 }));
ok('(짝) 아무것도 안 바뀌면 지문이 같다', sigOf(base) === sigOf({ ...base }));
// 방 지정 성공 뒤 곧바로 다시 받는가
const ro = fnBody('openRoomOverride');
const okAt = ro.indexOf('d.ok !== true'), refAt = ro.indexOf('scheduleAutoRefresh(');
ok('방 지정 «성공 뒤» 에 곧바로 포털을 다시 받는다', okAt > 0 && refAt > okAt);
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
