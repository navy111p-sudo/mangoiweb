// 🇵🇭 강사 브라우저는 «자동» 녹화를 하지 않는다 — 필리핀 회선·CPU 보호 (2026-09-02 사장님 결정)
//
// 배경 — 그전에는 수업에 들어온 «모든 사람» 이 각자 녹화했다. D1 실측(class-* 방, 최근 2주):
//   class-1008 교사 224.5MB/24.3분 + 학생 265MB/27.6분 · class-988 교사 235.2MB/26.0분 + 학생 210MB/22.5분
//   class-967 교사 191.9MB/23.1분 + 학생 218.8MB/23.1분 · class-1070 교사 166.7MB/26.7분 + 학생 246.3MB/26.6분
//   두 파일은 내용이 같다(둘 다 화면 전체를 합성). 그런데 그 한 벌이 강사 노트북에서
//   1920×1080@15fps 소프트웨어 VP8 인코딩 + 약 1.1Mbps 업로드(5MB 조각 = 36초마다 몰아 쏨)를
//   수업 내내 하고 있었다. 학생에게 보내는 실시간 영상이 최대 1.2Mbps 이니 업로드가 거의 두 배가 된다.
//
// 이 하니스는 **mango-rec.js 를 가짜 DOM·가짜 시계 위에서 실제로 돌려서** 확인한다.
//   · 강사면 자동 녹화를 «시도조차» 안 하는가
//   · 학생이면 예전처럼 시도하는가  ← 이 짝이 없으면 «전부 안 찍기» 도 통과한다
//   · 판정을 모를 때(함수 없음·예외)는 «찍는» 쪽으로 실패하는가
//   · 강사도 배지를 누르면 손으로 시작할 수 있는가 (안전판)
//   · 녹화 해상도·비트레이트가 실제로 내려갔는가
//
// ⛔ 이 검사를 «그 함수가 있는가» 로 쓰지 말 것 — 조건을 뒤집어도 글자는 그대로 남는다.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CD = path.join(HERE, '..', 'cloudflare-deploy');
const read = (p) => fs.readFileSync(path.join(CD, p), 'utf8');
const REC = read('public/js/mango-rec.js');

let fail = 0;
const chk = (label, ok, extra) => {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${extra ? '  — ' + extra : ''}`);
  if (!ok) fail++;
};

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


/* 한 판 = 새 가짜 DOM + 새 가짜 시계 + mango-rec.js 한 벌.
   판마다 완전히 새로 만든다 — 모듈 상태(autoRecStarted 등)가 판 사이로 새면 검사가 헛돈다. */
function makeRun(opts) {
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



  let apiCalls = [];
  const MangoV3 = {
    api: async (url) => { apiCalls.push(url); return { ok: false }; },
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
  /* 역할 판정을 «판마다» 심는다. undefined 로 두면 «그 함수가 아예 없는» 화면을 흉내 낸다. */
  if (opts && 'teacher' in opts) {
    sandbox.window.vcIsTeacherRole = (opts.teacher === 'throw')
      ? () => { throw new Error('역할 조회 실패'); }
      : () => !!opts.teacher;
  }
  vm.createContext(sandbox);
  vm.runInContext(REC, sandbox, { filename: 'mango-rec.js' });
  return {
    sandbox, apiCalls, advance, body, document,
    badge: () => document.getElementById('mango-rec-badge'),
    starts: () => apiCalls.filter((u) => /recordings\/start/.test(u)).length,
  };
}

console.log('\n════════ ① 강사 브라우저는 자동 녹화를 시도하지 않는다 ════════');
{
  const r = makeRun({ teacher: true });
  r.body.classList.add('vc-in-call');
  await r.advance(2000);   // 1차 폴링
  await r.advance(4000);   // 3초 대기 뒤 자동 시작이 걸릴 자리
  await r.advance(6000);   // 폴링이 몇 번 더 돌아도
  chk('강사면 /api/recordings/start 를 한 번도 부르지 않는다', r.starts() === 0, `실제 ${r.starts()}회`);
  chk('그래도 배지는 남는다 — 손으로 켤 수 있어야 한다(안전판)', !!r.badge());
}

console.log('\n════════ ② 학생은 예전처럼 자동으로 찍는다 (짝 검사) ════════');
{
  const r = makeRun({ teacher: false });
  r.body.classList.add('vc-in-call');
  await r.advance(2000);
  await r.advance(4000);
  chk('🔴 학생이면 자동 녹화를 시도한다 — 이 짝이 없으면 «전부 안 찍기» 도 통과한다',
      r.starts() >= 1, `실제 ${r.starts()}회`);
}

console.log('\n════════ ③ 모르면 «찍는» 쪽으로 실패한다 ════════');
{
  const r = makeRun({});               // vcIsTeacherRole 자체가 없는 화면
  r.body.classList.add('vc-in-call');
  await r.advance(2000); await r.advance(4000);
  chk('역할 함수가 아예 없으면 찍는다', r.starts() >= 1, `실제 ${r.starts()}회`);

  const r2 = makeRun({ teacher: 'throw' });
  r2.body.classList.add('vc-in-call');
  await r2.advance(2000); await r2.advance(4000);
  chk('역할 조회가 예외를 던져도 찍는다 — 막는 쪽으로 실패하면 녹화가 통째로 사라진다',
      r2.starts() >= 1, `실제 ${r2.starts()}회`);
}

console.log('\n════════ ④ 되돌리는 스위치 ════════');
{
  const r = makeRun({ teacher: true });
  r.sandbox.window.__mangoRecStaffAuto = true;
  r.body.classList.add('vc-in-call');
  await r.advance(2000); await r.advance(4000);
  chk('__mangoRecStaffAuto = true 면 강사도 예전처럼 자동 녹화한다', r.starts() >= 1, `실제 ${r.starts()}회`);
}

console.log('\n════════ ⑤ 녹화 부담이 실제로 내려갔는가 ════════');
{
  const w = /composeCanvas\.width\s*=\s*(\d+)/.exec(REC);
  const h = /composeCanvas\.height\s*=\s*(\d+)/.exec(REC);
  const b = /videoBitsPerSecond:\s*([\d_]+)/.exec(REC);
  const W = w && Number(w[1]), H = h && Number(h[1]);
  const B = b && Number(String(b[1]).replace(/_/g, ''));
  chk('녹화 캔버스가 1080p 보다 작다', !!W && !!H && W * H < 1920 * 1080,
      `${W}×${H} (픽셀 ${W && H ? Math.round((W * H) / (1920 * 1080) * 100) : '?'}%)`);
  chk('녹화 비트레이트가 실시간 영상 상한(1.2Mbps)을 넘지 않는다', !!B && B <= 1_200_000, `${B} bps`);
  /* ⛔ 배치는 width/height 에 비례해야 한다 — 고정 픽셀을 다시 넣으면 해상도를 못 바꾼다 */
  chk('영상 칸 폭이 캔버스 폭에 비례해서 정해진다',
      /VID_W\s*=\s*Math\.floor\(composeCanvas\.width\s*\*/.test(REC));
}

console.log('\n' + '═'.repeat(60));
console.log(`  ${fail === 0 ? '✅' : '❌'} ${fail === 0 ? '전부 통과' : 'FAIL ' + fail + '건'}`);
process.exit(fail ? 1 : 0);
