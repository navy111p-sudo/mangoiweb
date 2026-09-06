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

console.log('\n════════ ⑥ 배지가 «왜 안 찍는지» 를 본문 글자로 말한다 ════════');
{
  /* ⛔ 여기서 «눌러서 시작» 이라고만 쓰면, 걷어낸 CPU·업로드 부하를 화면이 다시 켜라고 권유하는 꼴이 된다.
     ⛔ 사유를 title(툴팁)에만 두면 폰에서는 영영 안 보인다 — 툴팁은 마우스 전용이다. */
  const r = makeRun({ teacher: true });
  r.body.classList.add('vc-in-call');
  await r.advance(2000); await r.advance(4000); await r.advance(2500);
  const b = r.badge();
  const txt = b ? (b.querySelectorAll('.mango-rec-time-text')[0] || {}).textContent || '' : '';
  chk('강사 배지가 «꺼짐 · 눌러서 시작» 이라고 말하지 않는다', !/눌러서 시작/.test(txt), `본문: "${txt}"`);
  chk('본문 글자가 «안 찍는 이유» 를 말한다(툴팁이 아니라 본문)', /회선|bandwidth/i.test(txt), `본문: "${txt}"`);
  chk('그래도 툴팁에는 손으로 켜는 길이 남아 있다(안전판)',
      !!b && /눌러|Tap/i.test(String(b.title || '')));
  /* ⛔ «학생이 녹화 중» 이라고 본문에서 단정하지 않는다 — 이 기기에서 확인할 수 없는 사실이다 */
  chk('⛔ 본문이 «학생이 녹화 중» 이라고 단정하지 않는다', !/학생.*녹화 중|student.*is recording/i.test(txt));
}

console.log('\n════════ ⑦ 스냅샷 사각지대 — 비트레이트를 내리면 함께 봐야 한다 ════════');
{
  /* 첫 5MiB 파트가 생기기 전에는 서버에 아무것도 없다. 그 구간을 스냅샷이 덮는다.
     비트레이트를 내리면 그 구간이 «길어지므로» 스냅샷 간격도 함께 줄여야 한다. */
  const b = /videoBitsPerSecond:\s*([\d_]+)/.exec(REC);
  const first = /SNAP_FIRST_MS\s*=\s*(\d+)/.exec(REC);
  const every = /SNAP_EVERY_MS\s*=\s*(\d+)/.exec(REC);
  const bps = Number(String(b[1]).replace(/_/g, ''));
  const gapMs = (5 * 1024 * 1024 * 8) / bps * 1000;        // 5MiB 를 채우는 데 걸리는 시간
  const snaps = 1 + Math.floor((gapMs - Number(first[1])) / Number(every[1]));
  chk('첫 파트가 생기기 전 구간을 스냅샷이 두 번 이상 덮는다',
      snaps >= 2, `구간 ${Math.round(gapMs / 1000)}초 · 스냅샷 ${snaps}회 (첫 ${first[1]}ms · 간격 ${every[1]}ms)`);
  const worstSec = Math.round(Number(every[1]) / 1000);
  chk('탭이 갑자기 닫혔을 때 최악 손실이 15초를 넘지 않는다', worstSec <= 15, `최악 ${worstSec}초`);
}

console.log('\n════════ ⑧ 그리기 fps 가 실제로 제한되는가 (가드 식을 오려 내 돌린다) ════════');
{
  /* [무엇이 낭비였나] draw() 는 requestAnimationFrame 으로 도니 화면 주사율(보통 60fps)로
     그리는데 captureStream 은 그중 일부만 가져간다 = 그린 것의 대부분을 버린다.
     ⛔ 이 검사를 «captureStream 인자가 몇인가» 로 쓰지 말 것 — 캡처만 낮추면 그리기는 그대로다.
        그래서 **가드 식을 소스에서 오려 내 60fps 로 몰아 호출하고 «실제로 그린 횟수»** 를 센다. */
  const fpsM   = /const REC_FPS\s*=\s*(\d+)/.exec(REC);
  const frameM = /const FRAME_MS\s*=\s*([^;]+);/.exec(REC);
  chk('녹화 fps 상수(REC_FPS)가 선언돼 있다', !!fpsM, fpsM && fpsM[1]);
  /* 🔴 «가드가 도는가» 만 보면 REC_FPS 를 60 으로 되돌려도 이 절이 **전부 통과**한다
     (함정 대조 실측). 그러면 다음 사람이 «가볍게» 를 되돌려도 초록불이다.
     지키려는 것은 «가드의 존재» 가 아니라 **«실제로 가볍다»** 이므로 상한을 함께 못 박는다.
     ⛔ 올릴 거면 필리핀·중국 강사 회선의 업로드를 먼저 재고 이 숫자를 함께 고칠 것. */
  chk('REC_FPS 가 화면 주사율보다 한참 낮다(«가볍게» 가 되돌려지지 않게)',
      !!fpsM && Number(fpsM[1]) <= 15, fpsM && `${fpsM[1]}fps ≤ 15`);
  chk('FRAME_MS 를 REC_FPS 에서 계산한다(두 값이 어긋날 수 없게)',
      !!frameM && /REC_FPS/.test(frameM[1]), frameM && frameM[1].trim());

  const guardM = /const _now = Date\.now\(\);\s*\n\s*if \(_now - composeDrawAt < ([^)]+)\) \{([\s\S]*?)\n\s*\}\s*\n\s*composeDrawAt = _now;/.exec(REC);
  chk('draw() 첫머리에 fps 가드가 있다', !!guardM);

  if (fpsM && frameM && guardM) {
    const REC_FPS = Number(fpsM[1]);
    const FRAME_MS = 1000 / REC_FPS;
    const skipBody = guardM[2];

    /* 🔴 문턱 식을 «손으로 다시 적으면» 이 검사는 통째로 헛돈다 — 소스에서 문턱을 0 으로
       바꿔도(=고치기 전과 같음) 초록불이었다(2026-09-06 변이시험에서 실측).
       그래서 **오려 낸 식 자체를 평가**한다. 여기에 손으로 적힌 숫자가 없어야 한다. */
    const condExpr = guardM[1].trim();
    const cond = new Function('_now', 'composeDrawAt', 'FRAME_MS', 'REC_FPS',
                              `return _now - composeDrawAt < (${condExpr});`);

    // 가드를 그대로 재현해 60fps 로 1초간 몰아 호출한다
    let composeDrawAt = 0, composeTickAt = 0, drew = 0, tickUpdates = 0;
    const step = (nowMs) => {
      const _now = nowMs;
      if (cond(_now, composeDrawAt, FRAME_MS, REC_FPS)) {
        if (/composeTickAt\s*=\s*_now/.test(skipBody)) { composeTickAt = _now; tickUpdates++; }
        return false;
      }
      composeDrawAt = _now; return true;
    };
    for (let t = 0; t < 1000; t += 1000 / 60) if (step(Math.round(t))) drew++;
    chk(`60fps 로 1초를 몰아도 «실제로 그리는» 것은 ${REC_FPS}회 안팎이다`,
        drew <= REC_FPS + 1 && drew >= REC_FPS - 1, `실제 ${drew}회 (가드 없으면 60회)`);
    /* 위 검사는 «REC_FPS 를 지키는가» 라 REC_FPS 자체가 60 이면 60회도 통과한다.
       그래서 «고치기 전(60회)보다 실제로 줄었는가» 를 따로 센다. */
    chk('그린 횟수가 고치기 전(60회)보다 확실히 줄었다',
        drew < 20, `실제 ${drew}회 < 20`);

    /* ⚠️ 건너뛸 때 composeTickAt 을 갱신하지 않으면 keepAlive(700ms)가 «rAF 가 멎었다» 로
       오판해 오히려 두 번 그린다 — 가볍게 하려다 무겁게 만드는 실수다. */
    chk('건너뛸 때도 composeTickAt 을 갱신한다(keepAlive 오판 방지)',
        tickUpdates > 0, `갱신 ${tickUpdates}회`);

    /* 🔴 건너뛸 때 rAF 를 다시 걸지 않으면 그 자리에서 그리기가 «영영» 멎는다
       (가볍게 하려다 녹화를 정지시키는 최악의 실수 — 화면은 멀쩡해 보이고 녹화만 얼어붙는다). */
    chk('건너뛸 때 rAF 를 다시 건다(그리기가 멎지 않게)',
        /requestAnimationFrame\(draw\)/.test(skipBody) && /\breturn\b/.test(skipBody));

    /* 백그라운드에서는 keepAlive 가 이 가드에 걸리면 안 된다(걸리면 캔버스가 얼어붙는다). */
    const keepM = /Date\.now\(\) - composeTickAt > (\d+)/.exec(REC);
    chk('백그라운드 keepAlive 간격이 FRAME_MS 보다 커서 가드에 안 걸린다',
        !!keepM && Number(keepM[1]) > FRAME_MS, `keepAlive ${keepM && keepM[1]}ms > frame ${Math.round(FRAME_MS)}ms`);

    /* 그리기와 캡처가 같은 상수여야 «버리는 프레임» 이 다시 생기지 않는다 */
    chk('captureStream 이 REC_FPS 를 그대로 쓴다(숫자를 다시 적지 않는다)',
        /captureStream\(REC_FPS\)/.test(REC));
  }

  chk('합성 캔버스가 alpha:false 다(투명 채널이 필요 없다)',
      /getContext\('2d',\s*\{\s*alpha:\s*false\s*\}\)/.test(REC));
}

console.log('\n' + '═'.repeat(60));
console.log(`  ${fail === 0 ? '✅' : '❌'} ${fail === 0 ? '전부 통과' : 'FAIL ' + fail + '건'}`);
process.exit(fail ? 1 : 0);
