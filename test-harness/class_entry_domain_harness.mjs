#!/usr/bin/env node
// 🚪 수업 입장 «주소 옮기기» 하니스 (2026-10-16)
//   옛 주소(test.mangoi.co.kr)에서 수업에 들어가려는 순간 mangoi.ai 로 옮기고,
//   학생 로그인은 1회용 코드로 넘긴다.
//   - 서버 정본  : cloudflare-deploy/src/class-entry-handoff.ts (실제로 돌린다 — 타입 제거 후 import)
//   - 서버 배선  : cloudflare-deploy/src/api-students.ts (중괄호 짝으로 잘라 위치·조건을 본다)
//   - 화면       : cloudflare-deploy/public/js/class-entry-domain.js (가짜 window 로 «통째로» 실행)
//   ⚠️ 짝으로 묻는다 — «옮긴다» 옆에 «실패하면 예전처럼 여기서 입장한다»·«다른 주소에서는 아무것도 안 한다».
//      짝이 없으면 «언제나 옮기기»(수업에 못 들어감)나 «아무것도 안 하기» 가 통과한다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_MOD = process.env.HANDOFF_SRC || path.join(ROOT, 'cloudflare-deploy/src/class-entry-handoff.ts');
const SRC_API = process.env.STUDENTS_SRC || path.join(ROOT, 'cloudflare-deploy/src/api-students.ts');
const SRC_JS = process.env.ENTRY_JS || path.join(ROOT, 'cloudflare-deploy/public/js/class-entry-domain.js');
const SRC_IDX = path.join(ROOT, 'cloudflare-deploy/public/index.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

/** 중괄호 짝으로 «그 앵커가 여는 블록» 을 자른다(문자열·주석 무시는 하지 않음 — 앵커를 콕 집어 쓸 것). */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return '';
  const s = src.indexOf('{', i + anchor.length - 1);
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// ═══ ① 서버 정본을 실제로 돌린다 ═══
console.log('\n① 1회용 코드 정본 (class-entry-handoff.ts) — 실제 실행');
const tmpMod = path.join(os.tmpdir(), 'handoff-' + process.pid + '-' + Date.now() + '.mts');
fs.writeFileSync(tmpMod, fs.readFileSync(SRC_MOD, 'utf8'));
let H = null;
try { H = await import(pathToFileURL(tmpMod).href); } catch (e) { ok('정본을 불러왔다', false, String(e && e.message)); }
finally { try { fs.unlinkSync(tmpMod); } catch {} }

function fakeKV() {
  const m = new Map();
  return {
    m,
    async put(k, v) { m.set(k, String(v)); },
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async delete(k) { m.delete(k); },
  };
}

if (H) {
  ok('정본을 불러왔다', typeof H.createHandoff === 'function' && typeof H.redeemHandoff === 'function');
  const kv = fakeKV();
  const env = { SESSION_STATE: kv };
  const code = await H.createHandoff(env, 'jeong');
  ok('코드를 만든다(64자리 hex)', typeof code === 'string' && /^[0-9a-f]{64}$/.test(code), String(code));
  ok('KV 에 handoff: 키로 남긴다', code && kv.m.has('handoff:' + code));
  const code2 = await H.createHandoff(env, 'jeong');
  ok('매번 다른 코드다', code2 && code2 !== code);
  ok('코드를 쓰면 그 uid 를 돌려준다', (await H.redeemHandoff(env, code)) === 'jeong');
  ok('짝: 한 번 쓴 코드는 다시 못 쓴다(1회용)', (await H.redeemHandoff(env, code)) === null);
  ok('짝: 없는 코드는 null', (await H.redeemHandoff(env, 'a'.repeat(64))) === null);
  ok('모양이 틀린 코드는 KV 를 묻지도 않는다', (await H.redeemHandoff({ SESSION_STATE: { get() { throw new Error('asked'); } } }, 'handoff:../x')) === null);
  // 만료 — KV 만료에만 기대지 않는다
  const kv2 = fakeKV(); const env2 = { SESSION_STATE: kv2 };
  const old = 'b'.repeat(64);
  kv2.m.set('handoff:' + old, JSON.stringify({ uid: 'kim', at: Date.now() - (H.HANDOFF_TTL_SEC + 5) * 1000 }));
  ok('만료가 지난 코드는 null(KV 가 늦게 지워도)', (await H.redeemHandoff(env2, old)) === null);
  const fresh = 'c'.repeat(64);
  kv2.m.set('handoff:' + fresh, JSON.stringify({ uid: 'kim', at: Date.now() - 1000 }));
  ok('짝: 만료 전 코드는 통과', (await H.redeemHandoff(env2, fresh)) === 'kim');
  // 실패해도 던지지 않는다
  const throwing = { SESSION_STATE: { async put() { throw new Error('x'); }, async get() { throw new Error('x'); }, async delete() { throw new Error('x'); } } };
  let threw = false, r1, r2;
  try { r1 = await H.createHandoff(throwing, 'jeong'); r2 = await H.redeemHandoff(throwing, 'd'.repeat(64)); } catch { threw = true; }
  ok('KV 가 던져도 던지지 않고 null', !threw && r1 === null && r2 === null);
  ok('uid 가 비면 만들지 않는다', (await H.createHandoff(env, '  ')) === null);
  ok('KV 가 없으면 만들지 않는다', (await H.createHandoff({}, 'jeong')) === null);
  ok('TTL 은 짧다(5분 이하)', H.HANDOFF_TTL_SEC > 0 && H.HANDOFF_TTL_SEC <= 300, String(H.HANDOFF_TTL_SEC));
}

// ═══ ② 서버 배선 ═══
console.log('\n② 서버 배선 (api-students.ts)');
const api = stripComments(fs.readFileSync(SRC_API, 'utf8'));
const post = blockAt(api, "if (method === 'POST' && path === '/api/student/session-status')");
ok('POST session-status 블록을 잘라 냈다(전제)', post.length > 50);
ok('모르는 action 은 400 으로 거절', /action[^\n]*!==\s*'handoff'[^\n]*unknown_action[^\n]*400/.test(post));
ok('토큰을 검증한 뒤에만 코드를 만든다', post.indexOf('authUidGlobal(') >= 0 && post.indexOf('authUidGlobal(') < post.indexOf('createHandoff('));
ok('검증 실패면 401', /if\s*\(\s*!authUid\s*\)\s*return json\([^)]*401\)/.test(post));
ok('코드를 «검증된 uid» 로 만든다(본문 값이 아님)', /createHandoff\(env,\s*authUid\)/.test(post));
ok('응답을 캐시하지 않는다', /no-store/.test(post));
const login = blockAt(api, "if (method === 'POST' && path === '/api/student/login')");
ok('로그인 블록을 잘라 냈다(전제)', login.length > 200);
ok('코드가 있으면 redeemHandoff 로 uid 를 얻는다', /redeemHandoff\(env,\s*b\.handoff\)/.test(login));
ok('못 쓴 코드는 401 로 끝낸다(아이디로 넘어가지 않음)', /if\s*\(\s*!handoffUid\s*\)\s*return json\([^;]*handoff_invalid[^;]*401\)/.test(login));
ok('넘겨받은 로그인일 때 uid 는 코드가 준 값', /const uid = viaHandoff \? handoffUid : /.test(login));
ok('비밀번호 검사는 «넘겨받은 로그인» 일 때만 건너뛴다', /if \(stu\.password_hash && !viaHandoff\)/.test(login));
ok('짝: 숨김 계정 차단은 그대로 지난다', login.indexOf('isStudentHidden(') > login.indexOf('const uid ='));
ok('짝: 세션·토큰 발급은 예전 그 자리 하나', (login.match(/startSession\(/g) || []).length === 1 && (login.match(/signUidToken\(/g) || []).length === 1);

// ═══ ③ index.html 이 싣는가 ═══
console.log('\n③ index.html');
const idx = fs.readFileSync(SRC_IDX, 'utf8');
const tagM = idx.match(/<script\s+defer\s+src="\/js\/class-entry-domain\.js\?v=\d+"><\/script>/);
ok('defer 로 싣는다(첫 화면 예산 밖)', !!tagM);
const iRoom = idx.indexOf('/js/idx-vc-roomcode.js'), iMe = idx.indexOf('/js/class-entry-domain.js');
ok('방 번호 기억(idx-vc-roomcode) «뒤» 에 싣는다 — 바깥에서 감싸야 사람이 친 방 번호를 그대로 넘긴다', iRoom > 0 && iMe > iRoom);

// ═══ ④ 화면 — 가짜 브라우저로 통째로 실행 ═══
console.log('\n④ 화면 (class-entry-domain.js) — 가짜 window 로 실행');
const JS = fs.readFileSync(SRC_JS, 'utf8');

function makeEnv(opts) {
  const o = Object.assign({ host: 'test.mangoi.co.kr', search: '', ua: 'Mozilla/5.0', ls: {}, readyState: 'interactive' }, opts || {});
  const timers = [];
  const store = Object.assign({}, o.ls);
  const calls = { replace: [], fetch: [], join: 0, show: [], replaceState: [] };
  const els = {};
  const mkEl = (id) => (els[id] = els[id] || { id, value: '' });
  const dclHandlers = [];
  const document = {
    readyState: o.readyState,
    body: { appendChild() {} },
    createElement() { return { setAttribute() {}, remove() {}, style: {} }; },
    getElementById(id) { return mkEl(id); },
    addEventListener(ev, fn) { if (ev === 'DOMContentLoaded') dclHandlers.push(fn); },
  };
  const location = {
    hostname: o.host, search: o.search, pathname: '/', hash: '',
    replace(u) { calls.replace.push(u); }, set href(u) { calls.replace.push(u); }, get href() { return 'https://' + o.host + '/' + o.search; },
  };
  const responses = o.responses || {};
  const fetch = async (url, init) => {
    calls.fetch.push({ url: String(url), init: init || {} });
    for (const k of Object.keys(responses)) {
      if (String(url).indexOf(k) >= 0) {
        const r = responses[k];
        if (r === 'throw') throw new Error('net');
        return { ok: r.status ? r.status < 400 : true, status: r.status || 200, json: async () => r.body };
      }
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const win = {
    document, location, fetch, navigator: { userAgent: o.ua },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    history: { state: null, replaceState(s, t, u) { calls.replaceState.push(u); } },
    URLSearchParams, Promise, JSON, console: { warn() {}, log() {} },
    setTimeout(fn, ms) { timers.push({ fn, ms: ms || 0 }); return timers.length; },
    showView(id) { calls.show.push(id); },
    vcJoinRoom() { calls.join++; },
  };
  if (o.getCurrentUser) win.getCurrentUser = o.getCurrentUser;
  if (o.staffNow) win.vcIsStaffNow = () => true;
  win.window = win;
  return { win, calls, store, els, timers, dclHandlers };
}
async function flush(env, rounds) {
  for (let r = 0; r < (rounds || 6); r++) {
    await new Promise((res) => setImmediate(res));
    const t = env.timers.splice(0); for (const x of t) { try { x.fn(); } catch {} }
  }
}
function run(env) {
  try { vm.runInNewContext(JS, env.win, { filename: 'class-entry-domain.js' }); return true; }
  catch (e) { console.log('     (실행 오류) ' + (e && e.message)); return false; }
}

// 4-1 옛 주소 + 선생님 자동입장 링크
{
  const E = makeEnv({ search: '?vc_autojoin=1&vc_role=teacher&vc_room=class-4616-20261016&vc_name=%EA%B5%90%EC%82%AC' });
  run(E);
  ok('자동입장 링크는 mangoi.ai 같은 query 로 옮긴다', E.calls.replace[0] === 'https://mangoi.ai/?vc_autojoin=1&vc_role=teacher&vc_room=class-4616-20261016&vc_name=%EA%B5%90%EC%82%AC', String(E.calls.replace[0]));
  E.win.vcJoinRoom();
  ok('옮기는 동안 옛 주소에서는 입장(소켓)을 막는다', E.calls.join === 0);
}
// 4-2 옛 주소 + 로그인된 학생 «수업 입장» — 오늘 예약 방 + 1회용 코드
{
  const E = makeEnv({
    ls: { mango_token: 'TOK', mangoi_logged_user: JSON.stringify({ uid: 'yahee', name: '정예희' }) },
    responses: {
      '/api/class/sessions/today': { body: { sessions: [{ room_id: 'class-4616-20261016', join_open: true }], current: { room_id: 'class-4616-20261016', join_open: true } } },
      '/api/student/session-status': { body: { ok: true, code: 'e'.repeat(64) } },
    },
  });
  run(E);
  ok('입장 함수를 감쌌다', E.win.vcJoinRoom && E.win.vcJoinRoom.__entryDomainWrapped === true);
  E.win.vcJoinRoom(); await flush(E);
  const hf = E.calls.fetch.find((f) => f.url.indexOf('/api/student/session-status') >= 0);
  ok('코드는 POST + Bearer 토큰으로 받는다', hf && hf.init.method === 'POST' && /Bearer TOK/.test(JSON.stringify(hf.init.headers)) && /"action":"handoff"/.test(hf.init.body));
  ok('코드와 예약 방을 실어 mangoi.ai 로 옮긴다', E.calls.replace[0] === 'https://mangoi.ai/?handoff=' + 'e'.repeat(64) + '&mg_enter=1&mg_room=class-4616-20261016', String(E.calls.replace[0]));
  ok('짝: 옛 주소에서는 입장하지 않았다', E.calls.join === 0);
}
// 4-3 사람이 친 방 번호가 있으면 그것을 그대로(예약 조회 안 함)
{
  const E = makeEnv({
    ls: { mango_token: 'TOK', mangoi_logged_user: JSON.stringify({ uid: 'yahee' }) },
    responses: { '/api/student/session-status': { body: { ok: true, code: 'f'.repeat(64) } } },
  });
  run(E); E.els['vc-roomcode-input'] = { value: '1234' };
  E.win.vcJoinRoom(); await flush(E);
  ok('친 방 번호를 그대로 넘긴다(해석은 저쪽 입장 함수가)', /mg_room=1234$/.test(E.calls.replace[0] || ''), String(E.calls.replace[0]));
  ok('친 방 번호가 있으면 예약을 다시 묻지 않는다', !E.calls.fetch.some((f) => f.url.indexOf('sessions/today') >= 0));
}
// 4-4 코드를 못 받으면 예전처럼 여기서 입장 (fail-open)
for (const [label, resp] of [['ok:false', { body: { ok: false } }], ['401', { status: 401, body: { ok: false } }], ['네트워크 실패', 'throw']]) {
  const E = makeEnv({
    ls: { mango_token: 'TOK', mangoi_logged_user: JSON.stringify({ uid: 'yahee' }) },
    responses: { '/api/class/sessions/today': { body: { sessions: [] } }, '/api/student/session-status': resp },
  });
  run(E); E.win.vcJoinRoom(); await flush(E);
  ok('짝: 코드 실패(' + label + ')면 옮기지 않고 예전처럼 여기서 입장', E.calls.replace.length === 0 && E.calls.join === 1, 'replace=' + E.calls.replace.length + ' join=' + E.calls.join);
}
// 4-5 로그인 없이 아이디만 친 학생
{
  const E = makeEnv({ responses: { '/api/class/sessions/today': { body: { current: { room_id: 'class-9-20261016', join_open: true } } } } });
  run(E); E.els['vc-name-input'] = { value: 'yahee' };
  E.win.vcJoinRoom(); await flush(E);
  ok('아이디만 친 학생은 친 아이디·예약 방을 실어 옮긴다', E.calls.replace[0] === 'https://mangoi.ai/?mg_enter=1&mg_room=class-9-20261016&mg_name=yahee', String(E.calls.replace[0]));
  ok('짝: 로그인이 없으면 코드를 만들지 않는다', !E.calls.fetch.some((f) => f.url.indexOf('session-status') >= 0));
}
// 4-6 선생님 세션 — 방을 알면 역할을 실어 옮기고, 모르면 그대로
{
  const E = makeEnv({ ls: { mangoi_admin_session: JSON.stringify({ uid: 'hq_t_kang' }) } });
  run(E); E.els['vc-roomcode-input'] = { value: 'class-848-20261016' }; E.els['vc-name-input'] = { value: '강선생님' };
  E.win.vcJoinRoom(); await flush(E);
  ok('선생님 세션은 vc_role=teacher 로 옮긴다', /^https:\/\/mangoi\.ai\/\?vc_autojoin=1&vc_role=teacher&vc_room=class-848-20261016&vc_name=/.test(E.calls.replace[0] || ''), String(E.calls.replace[0]));
  const E2 = makeEnv({ ls: { mangoi_admin_session: JSON.stringify({ uid: 'hq_t_kang' }) } });
  run(E2); E2.win.vcJoinRoom(); await flush(E2);
  ok('짝: 선생님인데 방을 모르면 옮기지 않는다(공용방으로 보내지 않게)', E2.calls.replace.length === 0 && E2.calls.join === 1);
}
// 4-7 iOS 앱 안에서는 옮기지 않는다
{
  const E = makeEnv({ ua: 'Mozilla/5.0 MangoiApp/iOS', search: '?vc_autojoin=1&vc_room=x' });
  run(E);
  ok('iOS 앱 안에서는 옮기지 않는다', E.calls.replace.length === 0 && !(E.win.vcJoinRoom && E.win.vcJoinRoom.__entryDomainWrapped));
}
// 4-8 다른 주소에서는 아무것도 안 한다
for (const h of ['localhost', 'mangoi.co.kr', 'evil-test.mangoi.co.kr.example']) {
  const E = makeEnv({ host: h, search: '?vc_autojoin=1&vc_room=x', ls: { mango_token: 'TOK' } });
  const before = E.win.vcJoinRoom;
  run(E);
  ok('짝: ' + h + ' 에서는 아무것도 안 한다', E.calls.replace.length === 0 && E.win.vcJoinRoom === before && E.calls.fetch.length === 0);
}
// 4-9 mangoi.ai — 평소 방문엔 아무것도 안 한다
{
  const E = makeEnv({ host: 'mangoi.ai' });
  const before = E.win.vcJoinRoom;
  run(E); await flush(E);
  ok('짝: mangoi.ai 평소 방문은 아무것도 안 한다', E.calls.fetch.length === 0 && E.calls.replace.length === 0 && E.win.vcJoinRoom === before && E.calls.show.length === 0);
}
// 4-10 mangoi.ai — 코드를 받아 로그인하고 다시 연다
{
  const user = { user_id: 'yahee', user_name: '정예희', role: 'student' };
  const E = makeEnv({ host: 'mangoi.ai', search: '?handoff=' + '9'.repeat(64) + '&mg_enter=1&mg_room=class-4616-20261016', responses: { '/api/student/login': { body: { ok: true, token: 'NEWTOK', user } } } });
  run(E);
  ok('코드를 주소창에서 바로 지운다(방문기록에 안 남게)', E.calls.replaceState.length >= 1 && !/handoff/.test(E.calls.replaceState[0]), String(E.calls.replaceState[0]));
  await flush(E);
  const lf = E.calls.fetch.find((f) => f.url === '/api/student/login');
  ok('학생 로그인에 코드를 넘긴다', lf && lf.init.method === 'POST' && JSON.parse(lf.init.body).handoff === '9'.repeat(64));
  ok('새 토큰·로그인을 저장한다', E.store.mango_token === 'NEWTOK' && JSON.parse(E.store.mangoi_logged_user || '{}').uid === 'yahee');
  ok('로그인한 채로 다시 열어 입장을 이어 간다', E.calls.replace[0] === '/?mg_enter=1&mg_room=class-4616-20261016', String(E.calls.replace[0]));
}
// 4-11 mangoi.ai — 코드가 안 맞으면 로그인을 지어내지 않는다
{
  const E = makeEnv({ host: 'mangoi.ai', search: '?handoff=' + '8'.repeat(64) + '&mg_enter=1', responses: { '/api/student/login': { status: 401, body: { ok: false, error: 'handoff_invalid' } } } });
  run(E); await flush(E);
  ok('짝: 코드가 안 맞으면 토큰을 저장하지 않는다', !E.store.mango_token && !E.store.mangoi_logged_user);
  ok('짝: 코드가 안 맞으면 다시 열지 않는다', E.calls.replace.length === 0);
}
// 4-12 mangoi.ai — mg_enter 는 DOMContentLoaded 뒤 로비를 열고 입장한다
{
  const E = makeEnv({ host: 'mangoi.ai', search: '?mg_enter=1&mg_room=class-4616-20261016', ls: { mangoi_logged_user: JSON.stringify({ uid: 'yahee' }) } });
  run(E); await flush(E);
  ok('DOMContentLoaded 전에는 화면을 건드리지 않는다', E.calls.show.length === 0 && E.calls.join === 0);
  for (const fn of E.dclHandlers) fn();
  await flush(E);
  ok('로비를 열고 입장한다', E.calls.show.indexOf('view-videocall-lobby') >= 0 && E.calls.join === 1);
  ok('방 번호·아이디를 채운다', E.els['vc-roomcode-input'] && E.els['vc-roomcode-input'].value === 'class-4616-20261016' && E.els['vc-name-input'].value === 'yahee');
  ok('로비 자동입장과 겹치지 않게 표시한다', E.win.__vcLobbyAutoJoined === true);
  ok('입장 파라미터를 주소에서 지운다(새로고침에 다시 들어가지 않게)', E.calls.replaceState.some((u) => !/mg_enter/.test(u)));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
