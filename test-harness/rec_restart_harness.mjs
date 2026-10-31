// 녹화를 «끄면 다시 켤 수 없던» 사고 회귀 하니스 (2026-08-06)
//
// 배경 — 강사 신고: "녹화 버튼이 꺼지거나 실수로 눌러서 꺼지면, 다시 켜는 방법을 못 찾겠다."
//   확인해 보니 정말로 길이 없었다. 세 겹이었다.
//   ① 정지하면 mango-rec.js 가 배지를 DOM 에서 통째로 지웠다(recBadge.remove()).
//   ② 다시 켤 수 있는 유일한 버튼 #mango-rec-btn 은 .toolbar-center 안에 있는데,
//      vc-dock.js 가 'body.vc-in-call.vc-dock-on .toolbar-center{display:none}' 로 그 줄을 덮는다.
//   ③ 자동녹화도 autoRecStarted 가 true 로 남아 다시 걸리지 않는다.
//   → 수업을 나갔다 다시 들어오는 것 말고는 방법이 없었다. 녹화는 '30일 복습' 이라는
//     학부모 약속이라, 한 번 잘못 눌린 수업은 그대로 사라졌다.
//
// 이 하니스는 **실제로 mango-rec.js 를 가짜 DOM 위에서 돌려서** 다음을 확인한다.
//   · 녹화가 꺼진 동안 배지가 DOM 에 남아 있는가 (= 누를 것이 있는가)
//   · 그 배지가 '꺼짐(mango-rec-off)' 으로 보이는가
//   · 그 배지를 누르면 녹화 시작이 실제로 다시 시도되는가
//   · 수업 밖으로 나가면 배지가 사라지는가 (홈 화면까지 따라오면 안 됨)
// 그리고 모바일 통합바(mango-topbar-unified.js)가 '배지 존재 = 녹화 중' 이라는
// 이제는 틀린 가정을 다시 쓰지 않는지 소스에서 확인한다.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CD = path.join(HERE, '..', 'cloudflare-deploy');
const read = (p) => fs.readFileSync(path.join(CD, p), 'utf8');

let fail = 0;
const chk = (label, ok, extra) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) fail++;
};

console.log('🔴 녹화 — 끄고 나서 «다시 켜는 길»이 있는가\n');

/* ─────────────────────────────────────────────────────────────────────────
   최소 가짜 DOM — mango-rec.js 가 배지를 만들고 칠하는 데 필요한 만큼만.
   (jsdom 을 쓰지 않는다: 이 리포 하니스는 의존성 없이 도는 것이 규칙)
   ───────────────────────────────────────────────────────────────────────── */
function makeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', title: '', textContent: '',
    children: [], parentNode: null, _listeners: {}, _attrs: {},
    style: new Proxy({ cssText: '' }, { get: (t, k) => t[k] ?? '', set: (t, k, v) => (t[k] = v, true) }),
  };
  const classes = new Set();
  el.classList = {
    add: (...c) => c.forEach((x) => classes.add(x)),
    remove: (...c) => c.forEach((x) => classes.delete(x)),
    contains: (c) => classes.has(c),
    toggle: (c, on) => (on === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c))
                                         : (on ? classes.add(c) : classes.delete(c))),
  };
  Object.defineProperty(el, 'className', { get: () => [...classes].join(' '), set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); } });
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html || '',
    set: (html) => {                       // 고정된 <span class=..>텍스트</span> 묶음만 다룬다
      el._html = html;
      el.children = [];
      const re = /<(\w+)([^>]*)>(.*?)<\/\1>/g;
      let m;
      while ((m = re.exec(String(html)))) {
        const child = makeEl(m[1]);
        const cls = /class="([^"]*)"/.exec(m[2]);
        const cid = /id="([^"]*)"/.exec(m[2]);
        if (cls) child.className = cls[1];
        if (cid) child.id = cid[1];
        child.textContent = m[3];
        child.parentNode = el;
        el.children.push(child);
      }
    },
  });
  el.setAttribute = (k, v) => { el._attrs[k] = String(v); };
  el.getAttribute = (k) => (k in el._attrs ? el._attrs[k] : null);
  el.removeAttribute = (k) => { delete el._attrs[k]; };
  el.appendChild = (c) => { c.parentNode = el; el.children.push(c); return c; };
  el.insertBefore = (c) => el.appendChild(c);
  el.removeChild = (c) => { el.children = el.children.filter((x) => x !== c); c.parentNode = null; };
  el.remove = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  el.closest = () => null;
  const walk = (node, out = []) => { node.children.forEach((c) => { out.push(c); walk(c, out); }); return out; };
  el.querySelector = (sel) => el.querySelectorAll(sel)[0] || null;
  el.querySelectorAll = (sel) => {
    const s = String(sel).trim();
    return walk(el).filter((c) => (s.startsWith('.') ? c.classList.contains(s.slice(1))
                                 : s.startsWith('#') ? c.id === s.slice(1)
                                 : c.tagName === s.toUpperCase()));
  };
  el.addEventListener = (type, fn) => { (el._listeners[type] ||= []).push(fn); };
  el.removeEventListener = (type, fn) => { el._listeners[type] = (el._listeners[type] || []).filter((f) => f !== fn); };
  el.click = () => (el._listeners.click || []).map((fn) => fn({ type: 'click' }));
  el.getContext = () => ({});               // canvas 대비(여기선 안 탄다)
  return el;
}

const body = makeEl('body');
const head = makeEl('head');
const callView = makeEl('div'); callView.id = 'view-videocall-call'; callView.style.display = 'block';
body.appendChild(callView);

const document = {
  body, head,
  documentElement: makeEl('html'),
  readyState: 'complete',
  createElement: makeEl,
  getElementById: (id) => [body, head].flatMap((r) => r.querySelectorAll('#' + id))[0] || null,
  querySelector: (sel) => (/toolbar-(right|center)/.test(sel) ? null : body.querySelector(sel)),
  querySelectorAll: (sel) => body.querySelectorAll(sel),
  addEventListener: () => {}, removeEventListener: () => {},
};

/* 가짜 시계 — 실제로 7초를 기다리지 않는다 */
let now = 0;
const timers = [];
let seq = 0;
const fakeSetTimeout  = (fn, ms) => (timers.push({ id: ++seq, at: now + (ms || 0), fn, every: 0 }), seq);
const fakeSetInterval = (fn, ms) => (timers.push({ id: ++seq, at: now + (ms || 0), fn, every: ms || 1 }), seq);
const fakeClear = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
const flush = () => new Promise((r) => setImmediate(r));   // vm 밖의 진짜 타이머로 마이크로태스크 배수
async function advance(ms) {
  const until = now + ms;
  for (;;) {
    const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at;
    if (due.every) due.at = now + due.every; else fakeClear(due.id);
    try { due.fn(); } catch (e) { console.log('    (timer 예외)', e.message); }
    await flush(); await flush();
  }
  now = until;
  await flush(); await flush();
}

/* M.api 를 실패로 두면 startRecording 이 MediaRecorder 까지 가기 전에 되돌아온다.
   → 미디어 스택 전체를 흉내 낼 필요 없이 '시작을 시도했는가' 만 정확히 셀 수 있다. */
let apiCalls = [];
const MangoV3 = {
  api: async (url, payload) => { apiCalls.push(url); return { ok: false }; },
  getUserId: () => 'T-TEST',
};

const sandbox = {
  window: null, document, console: { log(){}, warn(){}, error(){}, info(){} },
  navigator: { sendBeacon: () => true },
  fetch: async () => ({ ok: false, json: async () => ({ ok: false }) }),
  setTimeout: fakeSetTimeout, setInterval: fakeSetInterval,
  clearTimeout: fakeClear, clearInterval: fakeClear,
  requestAnimationFrame: (fn) => fakeSetTimeout(fn, 16), cancelAnimationFrame: fakeClear,
  Date, Math, JSON, Promise, Blob: class {}, MediaStream: class {}, URL,
  MediaRecorder: class { static isTypeSupported() { return true; } },
  AudioContext: class {}, Event: class {},
};
sandbox.window = sandbox;
sandbox.window.MangoV3 = MangoV3;
sandbox.window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
sandbox.window.confirm = () => true;
sandbox.window.getLang = () => 'ko';
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(read('public/js/mango-rec.js'), sandbox, { filename: 'mango-rec.js' });

const badge = () => document.getElementById('mango-rec-badge');

/* ── ① 수업에 들어가 자동녹화가 «실패»한 뒤 — 손으로 켤 버튼이 있어야 한다 ───────── */
console.log('· 자동녹화가 걸리지 않았을 때');
body.classList.add('vc-in-call');
await advance(2000);                       // 1차 폴링 → 3초 대기 예약
await advance(4000);                       // 자동 시작 시도 → M.api 실패로 되돌아옴
const triedAuto = apiCalls.length;
await advance(2500);                       // 다음 폴링 → 꺼짐 배지가 떠야 한다
chk('자동 시작을 시도는 했다(검사 성립)', triedAuto >= 1, `/api/recordings/start ${triedAuto}회`);
chk('녹화가 꺼져 있어도 배지가 DOM 에 있다', !!badge());
chk("배지가 '꺼짐'으로 표시된다", !!badge() && badge().classList.contains('mango-rec-off'));
chk('배지 문구가 «눌러서 시작» 임을 알린다',
  !!badge() && /시작|start/i.test(badge().querySelector('.mango-rec-time-text')?.textContent || ''),
  badge()?.querySelector('.mango-rec-time-text')?.textContent);

/* ── ② 그 배지를 누르면 실제로 다시 시작을 시도해야 한다 ─────────────────────── */
console.log('\n· 꺼진 배지를 눌렀을 때');
apiCalls = [];
if (badge()) badge().click();   // 예전 코드엔 누를 것 자체가 없었다 — 던지지 말고 실패로 남긴다
await flush(); await flush(); await flush();
chk('누르면 녹화 시작이 다시 호출된다', apiCalls.includes('/api/recordings/start'),
  apiCalls.length ? apiCalls.join(', ') : '호출 없음 — 여전히 되돌아올 길이 없다');
await advance(2500);
chk('시작이 실패하면 다시 «눌러서 시작» 으로 돌아온다',
  !!badge() && badge().classList.contains('mango-rec-off'));
chk('굳어버리지 않는다(다시 누를 수 있다)', !!badge() && badge().style.pointerEvents !== 'none');

/* ── ②-b 서버가 «학생 미동의(consent_required)» 로 거절하면 — 사유가 보여야 한다 ──
   서버는 이 거절을 일부러 HTTP 200 + ok:false 로 준다(재시도 폭주 방지).
   그래서 2026-08-27 까지는 배지가 그냥 «눌러서 시작» 으로 되돌아갔고, 몇 번을 눌러도
   절대 성공할 수 없는 상태가 「녹화 버튼 고장」 으로 제보됐다(Teacher Shas, class-971). */
console.log('\n· 서버가 «학생 미동의» 로 거절했을 때');
MangoV3.api = async (url) => { apiCalls.push(url); return { ok: false, error: 'consent_required' }; };
if (badge()) badge().click();
await flush(); await flush(); await flush();
await advance(2500);
chk('배지에 미동의 상태 클래스가 붙는다', !!badge() && badge().classList.contains('mango-rec-consent'));
chk('배지 «본문 글자» 가 사유를 말한다(툴팁은 폰에서 안 보인다)',
  /미동의|consent/i.test(badge()?.querySelector('.mango-rec-time-text')?.textContent || ''),
  badge()?.querySelector('.mango-rec-time-text')?.textContent);
chk('굳어버리지 않는다(재시도 탭 가능 — 학생이 뒤늦게 동의하면 성공해야 한다)',
  !!badge() && badge().style.pointerEvents !== 'none');
// 일반 실패로 돌아가면 미동의 표시는 걷혀야 한다 — 안 걷히면 멀쩡한 실패까지 «학생 탓» 이 된다
MangoV3.api = async (url) => { apiCalls.push(url); return { ok: false }; };
if (badge()) badge().click();
await flush(); await flush(); await flush();
await advance(2500);
chk('일반 실패로 돌아가면 미동의 표시가 걷힌다', !!badge() && !badge().classList.contains('mango-rec-consent'));

/* ── ③ 수업 밖에서는 흔적을 남기지 않는다 ─────────────────────────────────── */
console.log('\n· 수업에서 나갔을 때');
body.classList.remove('vc-in-call');
await advance(2500);
chk('홈으로 나가면 꺼짐 배지가 사라진다', !badge());

/* ── ④ 모바일 통합바가 «배지 존재 = 녹화 중» 을 다시 쓰지 않는지 ──────────────── */
console.log('\n· 모바일 통합 바(mango-topbar-unified.js)');
const uni = read('public/js/mango-topbar-unified.js');
chk("녹화 여부를 'mango-rec-off' 클래스로 판단한다", /mango-rec-off/.test(uni));
chk('«getElementById 가 참이면 녹화 중» 식 판정이 남아 있지 않다',
  !/if\s*\(\s*document\.getElementById\(['"]mango-rec-badge['"]\)\s*\)\s*bar\.classList\.add/.test(uni));
chk('꺼짐 상태에서도 점이 보인다(rec-off 스타일 존재)', /rec-off\s+\.uni-rec/.test(uni));
chk('꺼짐일 때는 펼치지 않고 곧바로 시작으로 넘긴다',
  /mango-rec-off[\s\S]{0,80}rb\.click\(\)/.test(uni));

/* ── ⑤ 정지 경로가 배지를 지우지 않는지 (원인 ①의 재발 방지) ──────────────────── */
console.log('\n· 원인 재발 방지');
const rec = read('public/js/mango-rec.js');
chk('stopRecording 이 배지를 지우지 않는다(칠하기만)',
  /paintRecBadge\(\);\s*\/\/ 지우지 않는다/.test(rec) && !/hideRecBadge\(\);/.test(rec));
chk('꺼진 동안에도 폴링이 배지를 되살린다', /!isRecording && !autoRecPending[\s\S]{0,40}showRecBadge\(\)/.test(rec));
chk('강사 문구가 한/영 두 벌이다', /Tap to start[\s\S]*?눌러서 시작|눌러서 시작[\s\S]*?Tap to start/.test(rec));

console.log(fail === 0 ? '\n🎉 ALL PASS' : `\n❌ ${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
