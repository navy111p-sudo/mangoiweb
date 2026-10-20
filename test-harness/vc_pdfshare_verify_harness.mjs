// vc_pdfshare_verify_harness.mjs — «강사 화면엔 교재가 있는데 학생은 «잠시만 기다려 주세요»» (2026-10-20 class-4563)
//
// 두 가지를 «실제로 돌려» 확인한다 (문자열이 있는가가 아니라 무슨 일이 일어나는가):
//   A. idx-main.js createWebSocket — 재연결 큐가 «원래 onOpen(=join-room) 뒤» 에 나가는가.
//      앞에 나가면 DO 의 staffOnly 가 «아직 입장 전» 으로 보고 pdf-share 를 조용히 버린다.
//   B. idx-vc-pdfshare-verify.js — 공유 뒤 서버(room-media)에 그 교재가 없으면 다시 보내고,
//      «모를 때»·«다른 교재로 바뀌었을 때»·«멈췄을 때»·«나갔을 때»·«학생일 때»·«blob 일 때» 는 손대지 않는가.
//      그리고 끝까지 안 되면 강사에게 말하는가.
//   C. 변이시험 — 고침을 하나씩 되돌린 사본으로 A·B 를 다시 돌려 «실제로 FAIL 이 나는가» 를 본다.
//
// 기대값·코드는 전부 소스에서 오려 온다(손으로 베껴 적지 않는다).
// MAIN_SRC / VERIFY_SRC 환경변수로 다른 사본을 가리킬 수 있다(변이시험용 — 저장소 파일은 건드리지 않는다).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', 'cloudflare-deploy', 'public');
const MAIN_PATH = process.env.MAIN_SRC || join(ROOT, 'js', 'idx-main.js');
const VERIFY_PATH = process.env.VERIFY_SRC || join(ROOT, 'js', 'idx-vc-pdfshare-verify.js');
const QUIET = !!process.env.HARNESS_QUIET;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; if (!QUIET) console.log('  ✅ ' + msg); }
  else { fail++; console.log('  ❌ ' + msg); }
}

/* 문자열·주석·템플릿을 건너뛰며 중괄호 짝을 맞춘다 — 함수 몸통을 «길이» 가 아니라 «짝» 으로 자른다 */
function blockFrom(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return '';
  let depth = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
  }
  return '';
}

const MAIN = readFileSync(MAIN_PATH, 'utf8');
const VERIFY = readFileSync(VERIFY_PATH, 'utf8');

/* ═══════════════ A. 재연결 큐 순서 ═══════════════ */
function runA(mainSrc) {
  const r = { order: [], threwOk: null, offerDropped: null, directOk: null, extracted: false };
  const at = mainSrc.indexOf('function createWebSocket(');
  const body = at >= 0 ? blockFrom(mainSrc, at) : '';
  r.extracted = !!body && /return\s*\{/.test(body);
  if (!r.extracted) return r;

  function makeCtx() {
    const sockets = [];
    class FakeWS {
      constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
      send(s) { this.sent.push(JSON.parse(s).type); }
      close() { this.readyState = 3; }
    }
    FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
    const ctx = {
      WebSocket: FakeWS, location: { protocol: 'https:', host: 'mangoi.ai' },
      console: { log() {}, warn() {}, error() {} },
      setInterval: () => 1, clearInterval: () => {}, setTimeout: () => 1, clearTimeout: () => {},
      JSON, Date, Math,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(body + '\n;this.createWebSocket = createWebSocket;', ctx);
    return { ctx, sockets };
  }
  const openSock = (s) => { s.readyState = 1; s.onopen && s.onopen(); };

  try {
    // ① 끊긴 동안 쌓인 pdf-share 는 join-room «뒤» 에 나가야 한다
    const e = makeCtx();
    const conn = e.ctx.createWebSocket('/ws/video-call?roomId=r', () => {}, (ws) => ws.send(JSON.stringify({ type: 'join-room' })));
    conn.send({ type: 'pdf-share', data: { url: 'https://mangoi.ai/x.jpg' } });
    conn.send({ type: 'offer', data: {} });           // 큐에 안 담기는 종류(재연결 때 새로 협상)
    openSock(e.sockets[0]);
    r.order = e.sockets[0].sent.slice();
    r.offerDropped = r.order.indexOf('offer') < 0;
    // 열린 뒤 보내는 것은 곧바로 나간다
    conn.send({ type: 'pdf-page-change', data: {} });
    r.directOk = e.sockets[0].sent[e.sockets[0].sent.length - 1] === 'pdf-page-change';
  } catch (err) { r.err = String(err && err.message || err); }

  try {
    // ② 원래 onOpen 이 던져도 쌓인 신호는 나가야 한다
    const e2 = makeCtx();
    const conn2 = e2.ctx.createWebSocket('/ws/x', () => {}, () => { throw new Error('boom'); });
    conn2.send({ type: 'pdf-share', data: {} });
    try { openSock(e2.sockets[0]); } catch (_) {}
    r.threwOk = e2.sockets[0].sent.indexOf('pdf-share') >= 0;
  } catch (err) { r.threwOk = false; }
  return r;
}

/* ═══════════════ B. 확인·재전송 안전망 ═══════════════ */
function makeDom() {
  const byId = {};
  function el(tag) {
    const e = {
      tagName: tag.toUpperCase(), style: {}, textContent: '', children: [], attrs: {}, listeners: {}, parentNode: null,
      set id(v) { this._id = v; }, get id() { return this._id; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      appendChild(c) { c.parentNode = this; this.children.push(c); if (c._id) byId[c._id] = c; return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; if (c._id && byId[c._id] === c) delete byId[c._id]; },
      addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
      click() { (this.listeners.click || []).forEach(f => f({})); },
    };
    return e;
  }
  const classes = new Set(['vc-in-call']);
  const body = el('body');
  body.classList = { contains: c => classes.has(c) };
  return {
    classes, body,
    document: { body, createElement: el, getElementById: id => byId[id] || null },
  };
}
function allText(n) { return (n.textContent || '') + n.children.map(allText).join(''); }
function findButtons(n, acc = []) { if (n.tagName === 'BUTTON') acc.push(n); n.children.forEach(c => findButtons(c, acc)); return acc; }

const SHARE_AT = MAIN.indexOf('window.vcShareTextbook = function(');
const SHARE_SRC = SHARE_AT >= 0 ? blockFrom(MAIN, SHARE_AT) + ';' : '';

function makeEnv(opt = {}) {
  const dom = makeDom();
  const timers = []; let now = 0, tid = 0;
  const server = { pdfState: opt.initial || null, accept: opt.accept || (() => true), fetchFails: !!opt.fetchFails, fetches: 0 };
  const sent = [];
  const conn = {
    send(d) {
      sent.push(d);
      if (d.type === 'pdf-share' && server.accept(sent.filter(x => x.type === 'pdf-share').length)) {
        server.pdfState = { url: opt.storeRelative ? new URL(d.data.url).pathname : d.data.url, currentPage: d.data.currentPage, kind: d.data.kind, name: d.data.name };
      }
    },
  };
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    location: { origin: 'https://mangoi.ai', href: 'https://mangoi.ai/?room=class-1' },
    navigator: { language: opt.zh ? 'zh-CN' : 'ko-KR', languages: [opt.zh ? 'zh-CN' : 'ko-KR'] },
    document: dom.document, URL, Promise, JSON, Math, String, encodeURIComponent,
    setTimeout(fn, ms) { const id = ++tid; timers.push({ id, at: now + (ms || 0), fn }); return id; },
    clearTimeout(id) { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    fetch(url) {
      server.fetches++;
      if (server.fetchFails) return Promise.reject(new Error('net'));
      const ps = server.pdfState ? Object.assign({}, server.pdfState) : null;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, pdfState: ps, videoState: null }) });
    },
    showToast: undefined,
  };
  ctx.window = ctx;
  ctx.vcConn = conn;
  ctx.vcRoomId = 'class-1';
  ctx.pdfPageNum = opt.page || 1;
  ctx._vcJoinedRoomId = opt.notJoined ? '' : 'class-1';
  ctx._vcShownPdfUrl = ''; ctx._vcShownPdfKey = '';
  ctx.vcMyRole = opt.student ? 'student' : 'teacher';
  ctx.vcCanControlTextbook = () => !opt.student;
  ctx.getLang = () => (opt.en ? 'en' : 'ko');
  ctx.__stopCalls = 0;
  ctx.pdfStopShare = function () { ctx.__stopCalls++; conn.send({ type: 'pdf-stop-share', data: {} }); };
  vm.createContext(ctx);
  // 정본 vcShareTextbook 을 그대로 실어 «절대주소로 바꾸는 규칙» 까지 함께 돌린다
  vm.runInContext('var vcConn = window.vcConn; var vcRoomId = window.vcRoomId; var pdfPageNum = window.pdfPageNum;\n' + SHARE_SRC, ctx);
  vm.runInContext(opt.verifySrc || VERIFY, ctx);
  async function flush() { for (let k = 0; k < 30; k++) await Promise.resolve(); }
  async function advance(ms) {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); now = t.at; t.fn(); await flush();
    }
    now = end; await flush();
  }
  const shares = () => sent.filter(d => d.type === 'pdf-share');
  const notice = () => dom.document.getElementById('vc-pdfshare-notice');
  return { ctx, dom, server, sent, shares, advance, notice, timers, setPage: p => vm.runInContext('pdfPageNum = ' + p, ctx) };
}

async function runB(verifySrc) {
  const R = {};
  const U = '/api/video-call/pdf/pdf-1792491236894-172.jpg';
  const ABS = 'https://mangoi.ai' + U;
  const share = (env, url = U) => env.ctx.vcShareTextbook('p1', url, 'image', '172.jpg', true);

  try {
    // B1 — 첫 신호가 사라지면 다시 보내 서버에 저장되게 한다
    let e = makeEnv({ verifySrc, accept: n => n >= 2 });
    share(e); await e.advance(60000);
    R.dropRecovered = e.server.pdfState && e.server.pdfState.url === ABS;
    R.dropResends = e.shares().length - 1;
    R.dropNoNotice = !e.notice();
    R.timersLeft = e.timers.length;

    // B1-짝 — 처음부터 저장되면 다시 보내지 않는다
    e = makeEnv({ verifySrc });
    share(e); await e.advance(60000);
    R.okNoResend = e.shares().length === 1;

    // B2 — 끝까지 안 되면 강사에게 말하고, 버튼으로 다시 보낼 수 있다
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); await e.advance(30000);            // 안내는 25초에 뜨고 20초 뒤 스스로 걷힌다
    const n2 = e.notice();
    R.neverNotice = !!n2;
    R.neverResendCount = e.shares().length - 1;
    R.noticeKo = n2 ? /학생 화면/.test(allText(n2)) : false;
    const btn = n2 ? findButtons(n2)[0] : null;
    if (btn) { const before = e.shares().length; e.server.accept = () => true; btn.click(); await e.advance(10000); R.btnResends = e.shares().length > before; R.btnVerified = e.server.pdfState && e.server.pdfState.url === ABS; R.btnClosesNotice = !e.notice(); }
    // 안내는 영영 남지 않는다(스스로 걷힘)
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); await e.advance(30000);
    const shown = !!e.notice();
    await e.advance(25000);
    R.noticeAutoHides = shown && !e.notice() && e.timers.length === 0;
    // 영어·중국어 안내
    e = makeEnv({ verifySrc, accept: () => false, en: true, zh: true });
    share(e); await e.advance(30000);
    const n3 = e.notice();
    R.noticeEn = n3 ? /student may not see/i.test(allText(n3)) : false;
    R.noticeZh = n3 ? /学生/.test(allText(n3)) : false;
    R.noticeNoI18nAttr = n3 ? !('data-ko' in n3.attrs) && !('data-en' in n3.attrs) : false;

    // B3 — 서버에 물어보지 못하면(모름) 다시 보내지 않는다
    e = makeEnv({ verifySrc, accept: () => false, fetchFails: true });
    share(e); await e.advance(60000);
    R.unknownNoResend = e.shares().length === 1 && !e.notice();
    R.unknownAsked = e.server.fetches > 0;

    // B4 — 입장(room-joined) 전이면 다시 보내지 않는다
    e = makeEnv({ verifySrc, accept: () => false, notJoined: true });
    share(e); await e.advance(60000);
    R.notJoinedNoResend = e.shares().length === 1;

    // B5 — 다른 교재로 바뀌었으면 옛 교재를 다시 보내지 않는다
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); e.ctx._vcShownPdfUrl = 'https://mangoi.ai/api/video-call/pdf/other.jpg'; await e.advance(60000);
    R.supersededNoResend = e.shares().length === 1;

    // B6 — 공유를 멈추면 되살리지 않는다(원래 멈춤도 그대로 돈다)
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); e.ctx.pdfStopShare(); await e.advance(60000);
    R.stopNoResend = e.shares().length === 1;
    R.stopOrigCalled = e.ctx.__stopCalls === 1;

    // B7 — 수업을 나갔으면 손을 뗀다
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); e.dom.classes.delete('vc-in-call'); await e.advance(60000);
    R.leftNoResend = e.shares().length === 1 && !e.notice();

    // B8 — 로컬 blob 은 다른 기기가 못 열므로 확인하지 않는다
    e = makeEnv({ verifySrc, accept: () => false });
    share(e, 'blob:https://mangoi.ai/abc'); await e.advance(60000);
    R.blobNoResend = e.shares().length === 1 && e.server.fetches === 0;

    // B9 — 학생이면 확인하지 않는다
    e = makeEnv({ verifySrc, accept: () => false, student: true });
    share(e); await e.advance(60000);
    R.studentNoResend = e.shares().length === 1 && e.server.fetches === 0;

    // B10 — 서버에 «다른(낡은)» 교재가 있으면 지금 페이지로 다시 보낸다
    e = makeEnv({ verifySrc, accept: n => n >= 2, initial: { url: 'https://mangoi.ai/api/video-call/pdf/old.pdf', currentPage: 7 } });
    vm.runInContext('pdfPageNum = 3', e.ctx);
    // 첫 신호는 사라졌으므로 서버엔 낡은 교재가 그대로 — 그 사이 강사가 3쪽으로 넘겼다
    e.server.accept = n => n >= 2;
    share(e); await e.advance(60000);
    const rs = e.shares()[1];
    R.staleReplaced = e.server.pdfState && e.server.pdfState.url === ABS;
    R.resendKeepsPage = !!rs && rs.data.currentPage === 3;

    // B11 — 서버가 상대주소로 저장해도 «같은 교재» 로 본다
    e = makeEnv({ verifySrc, storeRelative: true });
    share(e); await e.advance(60000);
    R.relativeVerified = e.shares().length === 1;

    // B12 — 보내지 못했으면(false) 확인하지 않고, 원래 반환값을 그대로 돌려준다
    e = makeEnv({ verifySrc });
    vm.runInContext('vcConn = null', e.ctx);
    const rv = share(e); await e.advance(60000);
    R.falsePassThrough = rv === false && e.server.fetches === 0;

    // B13 — 저장이 확인되면 떠 있던 안내도 걷힌다
    e = makeEnv({ verifySrc, accept: () => false });
    share(e); await e.advance(30000);
    const hadNotice = !!e.notice();
    e.server.accept = () => true;
    share(e); await e.advance(10000);
    R.verifiedHidesNotice = hadNotice && !e.notice();
  } catch (err) { R.err = String(err && err.stack || err); }
  return R;
}

function judge(A, B, label = '') {
  const p = label ? '[' + label + '] ' : '';
  ok(A.extracted, p + '전제: idx-main.js 에서 createWebSocket 을 중괄호 짝으로 오려 냈다');
  ok(A.order[0] === 'join-room' && A.order.indexOf('pdf-share') > 0, p + 'A① 재연결 때 쌓인 pdf-share 는 join-room «뒤» 에 나간다 (실제 순서: ' + A.order.join(' → ') + ')');
  ok(A.order.indexOf('pdf-share') >= 0, p + 'A① 짝: 쌓인 pdf-share 가 사라지지 않고 실제로 나간다');
  ok(A.offerDropped === true, p + 'A① 짝: 큐 대상이 아닌 offer 는 예전처럼 쌓지 않는다');
  ok(A.directOk === true, p + 'A① 짝: 연결된 뒤 보내는 것은 곧바로 나간다');
  ok(A.threwOk === true, p + 'A② 원래 onOpen 이 던져도 쌓인 신호는 나간다(finally)');

  ok(!B.err, p + '전제: 안전망 시나리오가 오류 없이 돌았다' + (B.err ? ' — ' + B.err.split('\n')[0] : ''));
  ok(!!SHARE_SRC, p + '전제: 정본 vcShareTextbook 을 오려 내 함께 돌렸다');
  ok(B.dropRecovered === true, p + 'B1 첫 신호가 사라져도 다시 보내 서버에 그 교재가 저장된다');
  ok(B.dropResends >= 1, p + 'B1 짝: 실제로 다시 보냈다(' + B.dropResends + '회)');
  ok(B.dropNoNotice === true, p + 'B1 짝: 회복됐으면 강사를 놀라게 하지 않는다(안내 없음)');
  ok(B.timersLeft === 0, p + 'B1 상주 타이머가 남지 않는다(공유 직후만 산다)');
  ok(B.okNoResend === true, p + 'B1 짝: 처음부터 저장되면 다시 보내지 않는다');
  ok(B.neverNotice === true, p + 'B2 끝까지 안 되면 강사에게 안내한다');
  ok(B.neverResendCount === 3, p + 'B2 다시 보내기는 정해진 횟수(3)까지만 (' + B.neverResendCount + ')');
  ok(B.noticeKo === true, p + 'B2 안내는 한국어로 사실을 말한다');
  ok(B.btnResends === true && B.btnVerified === true, p + 'B2 안내의 «다시 보내기» 를 누르면 실제로 다시 가고 저장된다');
  ok(B.btnClosesNotice === true, p + 'B2 짝: 누르면 안내가 걷힌다');
  ok(B.noticeAutoHides === true, p + 'B2 안내는 스스로 걷히고 타이머도 남지 않는다');
  ok(B.noticeEn === true, p + 'B2 영어 화면이면 영어로 말한다');
  ok(B.noticeZh === true, p + 'B2 중국어 브라우저면 중국어 한 줄을 덧붙인다');
  ok(B.noticeNoI18nAttr === true, p + 'B2 안내 상자에 data-ko/data-en 을 달지 않는다(버튼이 지워지지 않게)');
  ok(B.unknownNoResend === true, p + 'B3 서버에 물어보지 못하면(모름) 다시 보내지도 안내하지도 않는다');
  ok(B.unknownAsked === true, p + 'B3 짝: 그래도 물어보기는 했다');
  ok(B.notJoinedNoResend === true, p + 'B4 입장(room-joined) 전이면 다시 보내지 않는다');
  ok(B.supersededNoResend === true, p + 'B5 다른 교재로 바뀌었으면 옛 교재를 다시 보내지 않는다');
  ok(B.stopNoResend === true, p + 'B6 공유를 멈추면 되살리지 않는다');
  ok(B.stopOrigCalled === true, p + 'B6 짝: 원래 «공유 중지» 는 그대로 돈다');
  ok(B.leftNoResend === true, p + 'B7 수업을 나갔으면 손을 뗀다');
  ok(B.blobNoResend === true, p + 'B8 로컬 blob 주소는 확인·재전송하지 않는다');
  ok(B.studentNoResend === true, p + 'B9 학생 화면에서는 확인하지 않는다');
  ok(B.staleReplaced === true, p + 'B10 서버에 낡은 다른 교재가 있으면 지금 교재로 바꿔 놓는다');
  ok(B.resendKeepsPage === true, p + 'B10 다시 보낼 때 강사가 보고 있는 «지금 페이지» 로 보낸다');
  ok(B.relativeVerified === true, p + 'B11 서버가 상대주소로 저장해도 같은 교재로 본다(괜히 다시 보내지 않음)');
  ok(B.falsePassThrough === true, p + 'B12 보내지 못했으면(false) 그대로 돌려주고 확인하지 않는다');
  ok(B.verifiedHidesNotice === true, p + 'B13 저장이 확인되면 떠 있던 안내가 걷힌다');
}

console.log('▶ 교재 공유 — 재연결 순서·확인·재전송 (2026-10-20 class-4563)');
const A0 = runA(MAIN);
const B0 = await runB(null);
judge(A0, B0);

/* ═══════════════ C. 변이시험 — 고침을 되돌리면 실제로 FAIL 이 나는가 ═══════════════ */
if (!process.env.MAIN_SRC && !process.env.VERIFY_SRC) {
  console.log('\n▶ 변이시험 (저장소 파일은 건드리지 않고 메모리 사본으로)');
  const mainMut = [
    ['큐를 다시 join-room «앞» 으로', s => s.replace(/onOpen = function\(sock\)\{[^\n]*\};/, "onOpen = function(sock){ try { flushQueue(); } catch(e){} if (_origOnOpenFlush) _origOnOpenFlush(sock); };")],
    ['finally 제거(onOpen 이 던지면 큐가 안 나감)', s => s.replace(/onOpen = function\(sock\)\{[^\n]*\};/, "onOpen = function(sock){ if (_origOnOpenFlush) _origOnOpenFlush(sock); try { flushQueue(); } catch(e){} };")],
  ];
  const verMut = [
    ['«모름» 이면 다시 보내지 않는 가드 제거', s => s.replace("if (!d || typeof d !== 'object') { schedule(job); return; }", "if (!d || typeof d !== 'object') { d = {}; }")],
    ['입장 전 가드 제거', s => s.replace('if (window._vcJoinedRoomId !== job.room) { schedule(job); return; }', '')],
    ['«다른 교재로 바뀜» 판정 제거', s => s.replace('abs(window._vcShownPdfUrl) === job.target &&', '')],
    ['공유 중지 감싸기 제거', s => s.replace('window.pdfStopShare = function(){ cancel(); hideNotice(); return origStop.apply(this, arguments); };', '')],
    ['학생 판정 제거(항상 강사)', s => s.replace('staff()) start(', 'true) start(')],
    ['저장 확인 조건 뒤집기', s => s.replace('abs(st.url) === job.target', 'abs(st.url) !== job.target')],
    ['다시 보낼 때 1쪽으로', s => s.replace('currentPage: curPage(),', 'currentPage: 1,')],
    ['안내를 안 띄움', s => s.replace('showNotice(job);\n        if (S.job === job) S.job = null;', 'if (S.job === job) S.job = null;')],
    ['blob 제외 제거', s => s.replace('!/^blob:/i.test(shareUrl) &&', '')],
    ['조건 항상거짓(확인 안 함)', s => s.replace('if (ok === true && shareUrl', 'if (false && ok === true && shareUrl')],
    ['다시 보내기 횟수 제한 제거', s => s.replace('if (job.tries < MAX_RESEND) {', 'if (true) {')],
  ];
  let caught = 0, total = 0;
  const silence = async (fn) => { const o = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = o; } };
  for (const [name, f] of mainMut) {
    total++;
    const src = f(MAIN);
    if (src === MAIN) { ok(false, '변이 «' + name + '» 치환이 안 먹었다(앵커가 바뀜)'); continue; }
    const before = fail; const p0 = pass;
    await silence(async () => judge(runA(src), B0, name));
    const hit = fail > before; fail = before; pass = p0;
    if (hit) caught++;
    ok(hit, '변이 «' + name + '» 를 실제로 잡는다');
  }
  for (const [name, f] of verMut) {
    total++;
    const src = f(VERIFY);
    if (src === VERIFY) { ok(false, '변이 «' + name + '» 치환이 안 먹었다(앵커가 바뀜)'); continue; }
    const before = fail; const p0 = pass;
    const Bm = await runB(src);
    await silence(async () => judge(A0, Bm, name));
    const hit = fail > before; fail = before; pass = p0;
    if (hit) caught++;
    ok(hit, '변이 «' + name + '» 를 실제로 잡는다');
  }
  console.log('  변이 ' + total + '종 중 ' + caught + '종 검출');
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
