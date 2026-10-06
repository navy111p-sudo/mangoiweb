// 🚨 «같은 수업인데 서로 다른 방» 감시 (2026-10-07 — 10/6 delaware · LEN 실사고)
// 정본 src/room-mismatch.ts 를 타입 제거로 «실제로» 돌리고, api-admin.ts classes-now 배선과
// 화면(adm-core.js _renderRoomMismatch)을 오려 내 가짜 부품으로 실행한다.
// 「경고한다」 옆에 「제자리면·예약방이 비었으면·옛 접속이면 경고하지 않는다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name); } };

const RM_SRC = process.env.RM_SRC || resolve(SRC, 'room-mismatch.ts');
const alias = stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')));
const rmCode = stripTypeScriptTypes(rd(RM_SRC)).replace(/^import [^\n]*from '\.\/student-alias';?\n/m, '');
const M = await import('data:text/javascript;base64,' + Buffer.from(alias + '\n' + rmCode).toString('base64'));

console.log('① 10/6 실사고 재현 (21:20 무렵 — 학생 4379 · LEN 4397)');
const NOW = 1791289700000;
const live = [
  { account_uid: null, room_id: 'class-4397-20261006', last_seen_at: NOW - 30000, left_at: null },        // LEN(계정 칸 없음)
  { account_uid: 'delaware', room_id: 'class-4379-20261006', last_seen_at: NOW - 20000, left_at: null },  // 학생
];
const cls = [
  { schedule_id: 4397, room_id: 'class-4397-20261006', phase: 'now', student_name: '김연숙', teacher_name: 'LEN', start_kst: '21:10' },
];
const uidOf = (id) => ({ 4397: 'delaware', 4379: 'mangoai_delaware' })[id] || null;
let r = [];
try { r = M.findRoomMismatches(cls, live, uidOf, NOW); } catch (e) { ok('실행: ' + e.message, false); }
ok('실사고를 잡는다(1건)', r.length === 1);
ok('예약방 = 4397 · 학생방 = 4379', r[0] && r[0].expected_room === 'class-4397-20261006' && r[0].student_room === 'class-4379-20261006');
ok('이름·강사·시각을 싣는다', r[0] && r[0].student_name === '김연숙' && r[0].teacher_name === 'LEN' && r[0].start_kst === '21:10');
ok('계정 그대로 접속이면 via_twin=false', r[0] && r[0].via_twin === false);
ok('응답에 학생 계정(아이디)을 싣지 않는다', r[0] && !JSON.stringify(r[0]).includes('delaware'));

console.log('② 짝 — 경고하지 않아야 할 때');
const T = (o) => M.findRoomMismatches(cls, o, uidOf, NOW).length;
ok('학생이 예약방에 있으면 안 함', T([{ account_uid: 'delaware', room_id: 'class-4397-20261006', last_seen_at: NOW - 1000 }]) === 0);
ok('학생이 다른 방 + 예약방에도 동시 접속이면 안 함', T([...live, { account_uid: 'delaware', room_id: 'class-4397-20261006', last_seen_at: NOW - 1000 }]) === 0);
ok('예약방이 비었으면 안 함(소음)', T([live[1]]) === 0);
ok('학생 접속이 3분보다 오래됐으면 안 함', T([live[0], { ...live[1], last_seen_at: NOW - 4 * 60000 }]) === 0);
ok('예약방 접속이 오래됐으면 안 함', T([{ ...live[0], last_seen_at: NOW - 4 * 60000 }, live[1]]) === 0);
ok('학생 행에 퇴장 기록이 있으면 안 함', T([live[0], { ...live[1], left_at: NOW - 5000 }]) === 0);
ok('남의 계정이면 안 함', T([live[0], { ...live[1], account_uid: 'kim1' }]) === 0);
ok('부분일치로 잇지 않는다(dela)', T([live[0], { ...live[1], account_uid: 'dela' }]) === 0);
ok('지금 수업이 아니면(soon/ended) 안 함', M.findRoomMismatches([{ ...cls[0], phase: 'soon' }], live, uidOf, NOW).length === 0
  && M.findRoomMismatches([{ ...cls[0], phase: 'ended' }], live, uidOf, NOW).length === 0);
ok('예약 계정을 모르면 안 함', M.findRoomMismatches(cls, live, () => null, NOW).length === 0);

console.log('③ 넓히는 쪽 — 쌍둥이·대소문자');
const twinLive = [live[0], { ...live[1], account_uid: 'mangoai_delaware' }];
const tw = M.findRoomMismatches(cls, twinLive, uidOf, NOW);
ok('쌍둥이 계정으로 다른 방이면 잡는다 + via_twin=true', tw.length === 1 && tw[0].via_twin === true);
ok('대소문자만 다른 계정도 같은 학생', T([live[0], { ...live[1], account_uid: 'Delaware' }]) === 1);
ok('mangoai_ 예약 + 원래 계정 접속도 잡는다', M.findRoomMismatches(cls, live, () => 'mangoai_delaware', NOW).length === 1);

console.log('④ isLiveNow');
ok('3분 안 + 퇴장 없음 = 접속 중', M.isLiveNow({ last_seen_at: NOW - 10000 }, NOW));
ok('last_seen 0 은 아님(카페24 씨앗)', !M.isLiveNow({ last_seen_at: 0 }, NOW));
ok('퇴장 0 은 «없음»', M.isLiveNow({ last_seen_at: NOW, left_at: 0 }, NOW));

console.log('⑤ 배선 — api-admin.ts classes-now');
const API = rd(resolve(SRC, 'api-admin.ts'));
ok('import 했다', /import \{ findRoomMismatches \} from '\.\/room-mismatch'/.test(API));
const ci = API.indexOf("path === '/api/admin/classes-now'");
const cBody = ci > 0 ? API.slice(ci, API.indexOf('/* 🔍 GET /api/admin/textbook-files/dup-report', ci)) : '';
ok('classes-now 블록을 잘랐다(전제)', cBody.length > 1000);
ok('실접속 행에 account_uid 를 뽑는다(+옛 DB 폴백)', /user_id, username, account_uid, room_id/.test(cBody) && /catch \{\s*try \{ const r: any = await q\('user_id, username, room_id/.test(cBody));
ok('응답에 room_mismatch 를 싣는다', /room_mismatch: roomMismatch,/.test(cBody));
ok('판정을 try 로 감싼다(목록은 그대로)', /try \{[\s\S]{0,400}findRoomMismatches\(mgClasses[\s\S]{0,200}\} catch/.test(cBody));
ok('판정에 «방 지정 반영 뒤» mgClasses 를 넘긴다', cBody.indexOf('findRoomMismatches(mgClasses') > cBody.indexOf('applyRoomOverrides('));
{
  const m = cBody.match(/const uidBySched = new Map<number, string>\(\);\n([^\n]*)\n/);
  ok('예약 id → 학생 계정 표를 schedRows 로 만든다', !!m && /schedRows/.test(m[1]) && /r\.user_id/.test(m[1]));
}

console.log('⑥ 화면 — adm-core.js _renderRoomMismatch (가짜 DOM 으로 실행)');
const CORE = rd(resolve(PUB, 'js/adm-core.js'));
function fnBody(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i + sig.length - 1); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const rf = fnBody(CORE, 'function _renderRoomMismatch(list, _L) {');
const escF = fnBody(CORE, 'function _esc(s){');
ok('함수를 오려 냈다(전제)', !!rf && !!escF);
function mkDom() {
  const els = {};
  const parent = { kids: [], insertBefore(n, ref) { this.kids.push(n); els[n.id] = n; n.parentNode = this; } };
  const sum = { id: 'rooms-now-summary', parentNode: parent };
  els[sum.id] = sum;
  const doc = {
    getElementById: (id) => els[id] || null,
    createElement: () => ({ id: '', style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, remove() { delete els[this.id]; } }),
  };
  return { doc, els };
}
try {
  const run = new Function('document', 'list', '_L', `${escF}\n${rf}\n_renderRoomMismatch(list, _L);`);
  const d1 = mkDom(); run(d1.doc, r, false);
  const box = d1.els['rooms-mismatch-alert'];
  ok('경고 띠를 그린다', !!box && /서로 다른 방/.test(box.innerHTML) && /class-4379-20261006/.test(box.innerHTML) && /LEN 선생님은/.test(box.innerHTML));
  ok('role=alert', box && box.attrs.role === 'alert');
  const d2 = mkDom(); run(d2.doc, r, true);
  ok('영어 화면은 영어로', /different rooms/.test(d2.els['rooms-mismatch-alert'].innerHTML));
  const d3 = mkDom(); run(d3.doc, [], false);
  ok('0건이면 안 그린다', !d3.els['rooms-mismatch-alert']);
  const d4 = mkDom(); run(d4.doc, null, false);
  ok('서버가 그 칸을 안 주면(null) 안 그린다', !d4.els['rooms-mismatch-alert']);
  const d5 = mkDom(); run(d5.doc, r, false); run(d5.doc, [], false);
  ok('다음 갱신에 0건이면 지운다', !d5.els['rooms-mismatch-alert']);
  const d6 = mkDom(); run(d6.doc, [{ ...r[0], student_name: '<img src=x>' }], false);
  ok('이름을 이스케이프한다', !/<img/.test(d6.els['rooms-mismatch-alert'].innerHTML));
} catch (e) { ok('화면 실행: ' + e.message, false); }
ok('loadActiveRooms 가 서버 칸을 넘긴다', /mism = Array\.isArray\(cj\.room_mismatch\) \? cj\.room_mismatch : null/.test(CORE) && /_renderRoomMismatch\(mism, _L\);/.test(CORE));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
