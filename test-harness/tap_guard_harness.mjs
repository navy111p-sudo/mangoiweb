/* tap_guard_harness.mjs — 폰에서 «스크롤» 이 «탭» 으로 실행되지 않는가 (2026-10-28)
 * ────────────────────────────────────────────────────────────────────────
 * [왜] 사장님 제보 — 「휴대폰에서 살짝만 건드려도 자꾸 화면이 바뀐다」.
 *   index.html ph166 의 터치 보충이 손가락이 움직였는지 안 보고 touchend 50ms 뒤
 *   무조건 btn.click() 을 했다. 터치 target 은 손가락이 미끄러져도 «처음 닿은 요소»
 *   그대로라, 큰 버튼(수업 입장·오늘의 A.i 학습) 위에서 스크롤만 해도 화면이 넘어갔다.
 *   (헤드리스 실측: 120px 스크롤·25px 밀기 모두 synthetic click → 실행)
 *
 * ✅ 정본 판정은 js/idx-tap-guard.js 의 window.mgIsTap(e). 이 하니스는
 *   ①~③ 그 파일을 가짜 DOM 에서 «실제로 돌려» 판정과 보충 click 을 확인하고
 *   ④ touchend 로 실행하는 자리들이 그 판정을 거치는지 본다.
 * ⚠️ «막힌다» 옆에 「진짜 탭은 그대로 된다」를 짝으로 둔다 — 한쪽만 보면
 *   판정을 «항상 false» 로 바꿔도(모든 탭이 죽어도) 초록이다.
 * 브라우저 실측(사람이 돌림): 실제 터치 입력(CDP)으로 같은 시나리오 — 수정 전 2/6, 수정 후 6/6.
 */
import fs from 'node:fs';
import vm from 'node:vm';

const PUB = 'cloudflare-deploy/public';
const html = fs.readFileSync(`${PUB}/index.html`, 'utf8');
const guardSrc = fs.readFileSync(`${PUB}/js/idx-tap-guard.js`, 'utf8');
const allmenu = fs.readFileSync(`${PUB}/js/idx-allmenu.js`, 'utf8');
const x5 = fs.readFileSync(`${PUB}/js/idx-x5.js`, 'utf8');

/* ⛔ 부정 검사는 주석을 벗긴 사본으로 — 「왜 지웠나」 적은 주석이 자기를 잡는다. */
function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of src.split('\n')) {
    let res = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) { i = line.length; } else { inBlock = false; i = end + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (b !== -1 && (l === -1 || b < l)) { res += line.slice(i, b); inBlock = true; i = b + 2; }
        else if (l !== -1) { res += line.slice(i, l); i = line.length; }
        else { res += line.slice(i); i = line.length; }
      }
    }
    out.push(res);
  }
  return out.join('\n');
}

let P = 0, F = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want); ok ? P++ : F++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name} → ${JSON.stringify(got)}${ok ? '' : ' (기대 ' + JSON.stringify(want) + ')'}`);
};

/* ── 가짜 DOM: 리스너 저장·발화, 가짜 시계·타이머 ── */
function makeEnv() {
  let now = 1_000_000;
  const timers = [];
  function target() {
    const ls = [];
    return {
      ls,
      addEventListener(type, fn, opt) { ls.push({ type, fn, once: !!(opt && opt.once) }); },
      removeEventListener(type, fn) { const i = ls.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) ls.splice(i, 1); },
      fire(ev) {
        for (const l of ls.slice()) {
          if (l.type !== ev.type) continue;
          if (l.once) this.removeEventListener(l.type, l.fn);
          l.fn.call(this, ev);
        }
      },
    };
  }
  const win = target(), doc = target();
  const btn = Object.assign(target(), { clicks: 0, closest: (s) => (/\.cta-pay/.test(s) ? btn : null) });
  btn.click = function () { btn.clicks++; btn.fire({ type: 'click', isTrusted: false }); };
  const other = { closest: () => null };
  const ctx = {
    window: win, document: doc,
    Date: { now: () => now },
    setTimeout: (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; },
    String, Math,
  };
  win.window = win;
  vm.createContext(ctx);
  vm.runInContext(guardSrc, ctx);
  const touch = (x, y) => ({ clientX: x, clientY: y });
  const api = {
    win, doc, btn, other,
    tick(ms) { now += ms; for (const tm of timers.splice(0)) { if (tm.at <= now) tm.fn(); else timers.push(tm); } },
    start(x, y, el = btn, n = 1) {
      const ev = { type: 'touchstart', target: el, touches: Array.from({ length: n }, () => touch(x, y)) };
      win.fire(ev); doc.fire(ev);
    },
    move(x, y, n = 1) { win.fire({ type: 'touchmove', touches: Array.from({ length: n }, () => touch(x, y)) }); },
    end(x, y, el = btn) { const ev = { type: 'touchend', target: el, touches: [], changedTouches: [touch(x, y)] }; win.fire(ev); doc.fire(ev); return ev; },
    cancel() { win.fire({ type: 'touchcancel' }); },
    scroll() { win.fire({ type: 'scroll' }); },
    isTap: (ev) => win.mgIsTap(ev),
  };
  return api;
}

console.log('① 판정 — 진짜 탭은 탭이다 (짝: 이것이 죽으면 모든 터치 실행이 죽는다)');
{ const e = makeEnv(); e.start(100, 100); t('그대로 떼기', e.isTap(e.end(100, 100)), true); }
{ const e = makeEnv(); e.start(100, 100); e.move(104, 103); t('손떨림 4px', e.isTap(e.end(104, 103)), true); }
{ const e = makeEnv(); e.scroll(); e.tick(400); e.start(100, 100); t('스크롤이 0.4초 전에 끝났으면 탭', e.isTap(e.end(100, 100)), true); }
{ const e = makeEnv(); t('마우스 click 은 판정 대상이 아니다(true)', e.isTap({ type: 'click' }), true); }

console.log('② 판정 — 스크롤·스와이프·핀치는 탭이 아니다');
{ const e = makeEnv(); e.start(100, 100); e.move(100, 60); e.move(100, 20); t('위로 80px 스크롤', e.isTap(e.end(100, 20)), false); }
{ const e = makeEnv(); e.start(100, 100); e.move(100, 75); t('살짝 25px 밀기', e.isTap(e.end(100, 75)), false); }
{ const e = makeEnv(); e.start(100, 100); t('touchmove 없이 뗀 자리만 40px 다름', e.isTap(e.end(100, 60)), false); }
{ const e = makeEnv(); e.start(100, 100); e.move(80, 100); e.move(100, 100); t('갔다가 제자리로 돌아와 떼기', e.isTap(e.end(100, 100)), false); }
{ const e = makeEnv(); e.start(100, 100); e.start(150, 150, e.btn, 2); t('두 손가락(핀치)', e.isTap(e.end(100, 100)), false); }
{ const e = makeEnv(); e.start(100, 100); e.cancel(); t('touchcancel', e.isTap(e.end(100, 100)), false); }
{ const e = makeEnv(); e.start(100, 100); e.scroll(); t('닿아 있는 동안 화면이 스크롤됨', e.isTap(e.end(100, 100)), false); }
{ const e = makeEnv(); e.scroll(); e.tick(50); e.start(100, 100); t('관성 스크롤을 멈추려는 터치(50ms 전 스크롤)', e.isTap(e.end(100, 100)), false); }
{ const e = makeEnv(); t('touchstart 를 못 본 touchend 는 탭이 아니다', e.isTap({ type: 'touchend', changedTouches: [{ clientX: 1, clientY: 1 }] }), false); }

console.log('③ 큰 버튼 보충 click (ph166 에서 옮김) — 실제로 돌려 본다');
{ const e = makeEnv(); e.start(100, 100); e.end(100, 100); e.tick(299); const early = e.btn.clicks; e.tick(1);
  t('click 이 안 오는 기기에서 탭 → 300ms 뒤 보충 1번', `${early}/${e.btn.clicks}`, '0/1'); }
{ const e = makeEnv(); e.start(100, 100); e.end(100, 100); e.tick(120); e.btn.fire({ type: 'click', isTrusted: true }); e.tick(400);
  t('click 이 늦게(120ms) 와도 보충하지 않는다(두 번 실행 금지)', e.btn.clicks, 0); }
{ const e = makeEnv(); e.start(100, 100); e.move(100, 20); e.end(100, 20); e.tick(1000);
  t('버튼 위에서 스크롤 → 보충 0번 (이번 사고)', e.btn.clicks, 0); }
{ const e = makeEnv(); e.start(100, 100, e.other); e.end(100, 100, e.other); e.tick(1000);
  t('버튼이 아닌 곳 탭 → 보충 0번', e.btn.clicks, 0); }

console.log('④ 배선 — touchend 로 실행하는 자리가 판정을 거친다');
const htmlCode = stripComments(html.replace(/<!--[\s\S]*?-->/g, ''));
t('index.html 이 판정 파일을 defer 로 싣는다', /<script\s+defer\s+src="\/js\/idx-tap-guard\.js\?v=\d+"/.test(html), true);
const ph166 = (htmlCode.match(/<script id="ph166-quick-btn-rescue">[\s\S]*?<\/script>/) || [''])[0];
t('ph166 블록을 찾았다(전제)', ph166.includes('dispatchRoute'), true);
/* ⚠️ «.click() 이 없다» 로 묻지 말 것 — 카카오 경로의 정상적인 b.click() 이 걸린다(실제로 밟음). */
t('ph166 에 터치 리스너(무조건 강제 click 의 입구)가 되살아나지 않았다',
  /addEventListener\(\s*['"]touch(start|end)/.test(ph166), false);
const ph64 = (htmlCode.match(/card\.addEventListener\('touchend',[\s\S]{0,200}/) || [''])[0];
t('연기/변경 카드(ph64) touchend 가 mgIsTap 을 먼저 묻는다', /^card\.addEventListener\('touchend', function\(e\)\{\s*if \(!\(window\.mgIsTap && mgIsTap\(e\)\)\) return;/.test(ph64), true);
const x5Code = stripComments(x5);
t('교사로 선택 카드(idx-x5) touchend 가 mgIsTap 을 먼저 묻는다',
  /newCard\.addEventListener\('touchend', function\(e\)\{\s*if \(!\(window\.mgIsTap && window\.mgIsTap\(e\)\)\) return;/.test(x5Code), true);
const amCode = stripComments(allmenu);
const amTouch = [...amCode.matchAll(/addEventListener\(\s*'touchend'\s*,\s*([^\n]*)/g)].map(m => m[1]);
t('전체메뉴 touchend 등록이 3곳이다(전제 — 늘면 이 검사도 늘릴 것)', amTouch.length, 3);
t('그중 닫기 X·배경은 _isTap 을 거친다', amTouch.filter(s => /_isTap\(ev\)/.test(s)).length, 2);
t('전체메뉴 열기(allmenuTrigger)는 touchend 면 _isTap 을 거친다',
  /function allmenuTrigger\(e\)\{[\s\S]*?if \(e\.type === 'touchend' && !_isTap\(e\)\) return;[\s\S]*?e\.preventDefault\(\);/.test(amCode), true);
t('_isTap 은 판정 파일이 없으면 false(→ 브라우저 click 이 처리)',
  /function _isTap\(e\)\{ return !!\(window\.mgIsTap && window\.mgIsTap\(e\)\); \}/.test(amCode), true);

console.log(`\n결과: PASS ${P} / FAIL ${F}`);
process.exit(F ? 1 : 0);
