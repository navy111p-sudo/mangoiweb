// 교재 «살짝만 건드려도 다음 장» 보호(idx-vc-mobilefix.js ⑱) — 2026-10-08
// 그 절을 소스에서 오려 내 가짜 document·가짜 시계로 «실제로» 돌린다.
// 「막는다」 옆에 「넘겨야 할 때는 넘긴다」를 짝으로 둔다(없으면 «전부 막기» 도 통과).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MOBILEFIX_SRC || path.join(ROOT, 'cloudflare-deploy/public/js/idx-vc-mobilefix.js');
const src = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (name, c) => { if (c) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };

const s = src.indexOf('⑱ 📖');
const e = src.indexOf('/* ⑱ 끝 */');
ok('전제: ⑱ 절을 오려 냈다', s > 0 && e > s);
const body = src.slice(src.indexOf('(function () {', s), e);

function makeEnv() {
  let now = 1_000_000;
  const listeners = {};
  const timers = [];
  const anno = { active: false };
  const wrap = { scrollWidth: 390, clientWidth: 390, scrollLeft: 0 };
  const el = { closest: (sel) => sel === '#pdf-scroll-wrap' ? wrap : null };
  const outside = { closest: () => null };
  const calls = { next: 0, prev: 0 };
  let pending = null;
  const win = {
    pdfNextPage: function () { calls.next++; return pending ? pending.p : Promise.resolve(); },
    pdfPrevPage: function () { calls.prev++; return Promise.resolve(); },
  };
  const FakeDate = class extends Date { static now() { return now; } };
  const doc = {
    addEventListener: (t, fn, cap) => { (listeners[t] = listeners[t] || []).push({ fn, cap }); },
    querySelector: (sel) => (sel === '.pdf-anno.active' && anno.active) ? {} : null,
  };
  const ctx = vm.createContext({ window: win, document: doc, Date: FakeDate, Math, Promise,
    setTimeout: (fn) => { timers.push(fn); return 1; }, console });
  try { vm.runInContext(body, ctx); } catch (err) { console.log('  ⚠ 실행 실패: ' + err.message); }
  const fire = (type, ev) => (listeners[type] || []).forEach(l => l.cap && l.fn(ev));
  const flush = () => { while (timers.length) timers.shift()(); };
  const T = (x, y) => ({ clientX: x, clientY: y });
  // 원래 idx-main.js 의 스와이프 처리가 «같은 이벤트 안에서» 부르는 것을 흉내 낸다
  function swipe({ from = [300, 300], to, ms = 200, two = false, target = el, thenCall = 'next' }) {
    fire('touchstart', { target, touches: [T(...from)] });
    if (two) fire('touchstart', { target, touches: [T(...from), T(10, 10)] });
    now += ms;
    if (two) fire('touchend', { target, touches: [T(...to)], changedTouches: [T(10, 10)] });
    fire('touchend', { target, touches: [], changedTouches: [T(...to)] });
    if (thenCall) win[thenCall === 'next' ? 'pdfNextPage' : 'pdfPrevPage']();
    flush();
  }
  return { win, calls, wrap, anno, outside, swipe, advance: (ms) => { now += ms; },
    tap(target = outside) { fire('touchstart', { target, touches: [T(5, 5)] }); now += 60;
      fire('touchend', { target, touches: [], changedTouches: [T(5, 5)] }); win.pdfNextPage(); flush(); },
    setPending(v) { pending = v; } };
}

console.log('A) 스와이프 판정');
{ const v = makeEnv(); ok('설치됨(가드 표식)', !!(v.win.pdfNextPage.__mgSwipeGuard && v.win.pdfPrevPage.__mgSwipeGuard)); }
{ const v = makeEnv(); v.swipe({ to: [180, 300] });           // 폭 맞춤 · 120px
  ok('㉠ 폭 맞춤 교재 120px 스와이프는 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.swipe({ to: [150, 300] });           // 150px: 옛 기준·새 최소선은 넘지만 폭의 40%(156) 미만
  ok('㉠ 폭 맞춤 교재는 화면 폭 40% 미만이면 막는다(150px)', v.calls.next === 0); }
{ const v = makeEnv(); v.swipe({ to: [90, 300] });            // 210px ≥ 390×0.4
  ok('짝: 폭 맞춤 교재 210px 스와이프는 넘긴다', v.calls.next === 1); }
{ const v = makeEnv(); v.swipe({ from: [80, 300], to: [290, 300], thenCall: 'prev' });
  ok('짝: 오른쪽으로 밀면 이전 장', v.calls.prev === 1); }
{ const v = makeEnv(); v.swipe({ to: [80, 300], two: true });
  ok('㉡ 두 손가락 확대 뒤 떼기는 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.anno.active = true; v.swipe({ to: [60, 300] });
  ok('㉢ 펜 필기 중 가로 긋기는 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.swipe({ to: [90, 220] });            // dx 210 · dy 80 → 3배 못 미침
  ok('비스듬한 동작(가로<세로×3)은 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.swipe({ to: [60, 300], ms: 700 });
  ok('천천히 끈 동작(0.5초 넘음)은 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.wrap.scrollWidth = 900; v.wrap.scrollLeft = 200; v.swipe({ to: [80, 300] });
  ok('확대 교재: 오른쪽 끝에 닿지 않은 채 시작하면 막는다', v.calls.next === 0); }
{ const v = makeEnv(); v.wrap.scrollWidth = 900; v.wrap.scrollLeft = 510; v.swipe({ to: [80, 300] });
  ok('짝: 이미 오른쪽 끝에서 한 번 더 밀면 넘긴다', v.calls.next === 1); }

const tick = () => new Promise(r => setImmediate(r));
{ const v = makeEnv(); v.wrap.scrollWidth = 900; v.wrap.scrollLeft = 0; v.swipe({ from: [80, 300], to: [290, 300], thenCall: 'prev' });
  ok('짝: 확대 교재 왼쪽 끝에서 오른쪽으로 밀면 이전 장', v.calls.prev === 1); }
{ const v = makeEnv(); v.wrap.scrollWidth = 900; v.wrap.scrollLeft = 200; v.swipe({ from: [80, 300], to: [290, 300], thenCall: 'prev' });
  ok('확대 교재: 왼쪽 끝이 아닌 데서 시작하면 이전 장도 막는다', v.calls.prev === 0); }
console.log('B) 연속 넘김 막기');
{ const v = makeEnv(); v.win.pdfNextPage(); await tick(); v.win.pdfNextPage();
  ok('PC 버튼(터치 없음) 두 번은 둘 다 넘긴다', v.calls.next === 2); }
{ const v = makeEnv(); v.tap(); await tick(); v.advance(300); v.tap(); await tick();
  ok('터치로 0.3초 안에 두 번 → 한 번만', v.calls.next === 1);
  v.advance(700); v.tap(); await tick(); ok('짝: 0.6초 지나면 다시 넘긴다', v.calls.next === 2); }
{ const v = makeEnv(); let res; v.setPending({ p: new Promise(r => { res = r; }) });
  v.win.pdfNextPage(); v.win.pdfNextPage();
  ok('다음 파일을 받는 중에는 한 번 더 안 넘긴다', v.calls.next === 1);
  v.setPending(null); res(); await Promise.resolve(); await Promise.resolve();
  v.win.pdfNextPage(); ok('짝: 다 받은 뒤에는 다시 넘긴다', v.calls.next === 2); }
{ const v = makeEnv(); v.setPending({ p: new Promise(() => {}) }); v.win.pdfNextPage();
  v.advance(4500); v.setPending(null); v.win.pdfNextPage();
  ok('끝나지 않는 넘김도 4초 뒤에는 풀린다', v.calls.next === 2); }
{ const v = makeEnv(); v.swipe({ to: [180, 300] }); v.advance(5); v.win.pdfNextPage();
  ok('막힌 판정은 그 이벤트가 끝나면 사라진다(뒤의 버튼은 동작)', v.calls.next === 1); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
