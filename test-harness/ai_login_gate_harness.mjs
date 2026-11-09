// ai_login_gate_harness — A.i 학습 로그인 게이트(js/ai-login-gate.js)를 가짜 화면으로 «실제로» 돌린다.
//   2026-11-09 사장님 지시: 학생 계정으로 로그인하지 않으면 A.i 컨텐츠를 이용할 수 없어야 한다.
//   「막힌다」 옆에 「로그인하면 열린다」·「수업 안에서는 안 막는다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const SRC = readFileSync(join(PUB, 'js/ai-login-gate.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name); } };

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const GOOD = b64url({ uid: 'stu01', exp: Date.now() + 86400000 }) + '.sig';
const OLD = b64url({ uid: 'stu01', exp: Date.now() - 1000 }) + '.sig';

function run({ mode = 'page', store = {}, webdriver = false, force = false, off = false, parentInCall = null } = {}) {
  const appended = [];
  const listeners = {};
  const body = { appendChild: (el) => { appended.push(el); el.parentNode = body; }, classList: { contains: () => false } };
  const doc = {
    body,
    documentElement: { style: {} },
    currentScript: { getAttribute: (k) => (k === 'data-mode' && mode === 'home' ? 'home' : null) },
    createElement: () => ({ style: {}, setAttribute() {}, innerHTML: '' }),
    getElementById: (id) => appended.find((e) => e.id === id) || (id === 'ai-friends-ov' ? { style: {} } : null),
    addEventListener: (t, fn) => { listeners[t] = fn; },
  };
  const win = { __mgAiGateForce: force, __mgAiGateOff: off };
  win.window = win;
  win.parent = parentInCall === null ? win : { document: { body: { classList: { contains: (c) => c === 'vc-in-call' && parentInCall } } } };
  let loginOpened = 0;
  win.openLoginModal = () => { loginOpened++; };
  const ctx = {
    window: win, document: doc, navigator: { webdriver },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    location: { search: '', pathname: '/', hash: '' }, history: { replaceState() {} },
    URLSearchParams, atob: (s) => Buffer.from(s, 'base64').toString('binary'), JSON, Date, String,
    setTimeout: () => 0, alert: () => {},
  };
  vm.runInNewContext(SRC, ctx);
  return { gate: appended.find((e) => e.id === 'mg-ai-login-gate'), listeners, win, loginOpened: () => loginOpened };
}

console.log('① A.i 화면');
ok('비로그인 → 안내로 덮는다', !!run({}).gate);
ok('학생 토큰 → 안 막는다', !run({ store: { mango_token: GOOD } }).gate);
ok('만료된 토큰 → 막는다', !!run({ store: { mango_token: OLD } }).gate);
ok('깨진 토큰 → 막는다', !!run({ store: { mango_token: 'xx.yy' } }).gate);
ok('교사·본사 세션 → 안 막는다', !run({ store: { mangoi_admin_session: JSON.stringify({ uid: 'jeong', name: '정우영' }) } }).gate);
ok('빈 관리자 세션 → 막는다', !!run({ store: { mangoi_admin_session: '{}' } }).gate);
ok('화상수업 안 iframe → 안 막는다', !run({ parentInCall: true }).gate);
ok('수업이 아닌 화면의 iframe → 막는다', !!run({ parentInCall: false }).gate);
ok('자동화 브라우저 → 비켜선다', !run({ webdriver: true }).gate);
ok('자동화 브라우저 + 강제 → 막는다', !!run({ webdriver: true, force: true }).gate);
ok('검사용 끄기 스위치 → 비켜선다', !run({ off: true }).gate);
ok('안내의 로그인 링크는 /?menu=login', /href="\/\?menu=login"/.test(run({}).gate.innerHTML));

console.log('② 홈 «AI와 친구하기» 카드');
function click(r) {
  let prevented = false;
  const ev = { target: { closest: (sel) => (sel === '#ai-friends-ov .aif-item' ? {} : null) }, preventDefault() { prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} };
  r.listeners.click(ev);
  return prevented;
}
{ const r = run({ mode: 'home', force: true }); ok('비로그인 → 이동 막고 로그인 창', click(r) && r.loginOpened() === 1); }
{ const r = run({ mode: 'home', force: true, store: { mango_token: GOOD } }); ok('로그인 → 그대로 이동', !click(r) && r.loginOpened() === 0); }
ok('홈에서는 화면을 덮지 않는다', !run({ mode: 'home' }).gate);

console.log('③ 배선');
const PAGES = ['ai-class', 'stories', 'ai-dubbing', 'ai-speaking', 'speech-coach', 'ai-write', 'micro-quiz', 'review-quiz', 'review-quiz-cn', 'judgment', 'student-games', 'warmup', 'ai-friend'];
for (const p of PAGES) {
  const h = readFileSync(join(PUB, p + '.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  ok(p + '.html 이 게이트를 싣는다', /<script(?: defer)? src="\/js\/ai-login-gate\.js\?v=\d+"><\/script>/.test(h));
}
const idx = readFileSync(join(PUB, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
ok('index.html 이 홈 모드로 싣는다', /<script defer src="\/js\/ai-login-gate\.js\?v=\d+" data-mode="home"><\/script>/.test(idx));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
