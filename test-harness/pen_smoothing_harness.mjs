/* pen_smoothing_harness.mjs — 판서 선 보정 (2026-10-02 P3 · 「판서 선이 울퉁불퉁하다」)
   ────────────────────────────────────────────────────────────────
   무엇을 지키나
     ① idx-main.js 의 wbInkPath(점 배열 → 경로 정본)가 «중점 2차곡선» 으로 잇고
        첫 점·끝 점을 그대로 지나는가 — 교재 필기(pdfDrawStroke)·칠판 원본 잉크
        (wbPaintStroke)·AI 미리보기가 전부 그것을 «실제로» 부르는가(가짜 ctx 로 실행).
     ② 지우개·직선·사각형·원(wbPaintSeg 원본)·도형·글자는 예전 그대로인가.
     ③ 칠판 펜 mousemove 가 보내는 데이터 모양이 그대로인가 — 핸들러를 소스에서 오려 내
        가짜 캔버스로 «실제로 돌려» 보낸 객체의 칸을 셉니다(옛 화면과 섞여 그려야 하므로).
     ④ idx-vc-mobilefix.js ⑰절(토막 이어 곡선 · 꼬리 마저 그리기 · 사이 점 하나 더)을
        가짜 window/document/타이머로 실제로 돌립니다.
          · 「곡선으로 잇는다」 옆에 「지우개·도형은 원본 그대로」를 짝으로
          · 「꼬리를 마저 그린다」 옆에 「지운 뒤·다시 그린 뒤에는 옛 꼬리를 안 그린다」를 짝으로
          · 「사이 점을 넣는다」 옆에 「getCoalescedEvents 가 없으면/느리면/펜이 아니면 안 넣는다」를 짝으로
     ⑤ 데이터 모양 — ⑰절은 아무것도 보내지 않고, 받은 토막 객체를 고치지 않는다.

   변이시험(2026-10-02 실측 — 각 변이를 사본에 넣고 IDXMAIN_SRC / MOBILEFIX_SRC 로 가리켜 돌림)
     M1 «조건 뒤집기» 래퍼 `d.tool !== 'pen'` → `=== 'pen'`            → FAIL
     M2 wbInkPath 의 quadraticCurveTo → lineTo(옛 꺾은선)             → FAIL
     M3 wbInkPath 의 마지막 lineTo 제거(끝 점을 안 지남)               → FAIL
     M4 사이 점 판정 `bestD >= gap` → `bestD < gap`(조건 뒤집기)        → FAIL
     M5 지우개 등 «다른 것 칠하기 전 꼬리 마저 그리기» 제거            → FAIL
     M6 전체 지우기 때 기다리던 꼬리 버리기 제거                        → FAIL
     M7 isTrusted 검사 제거(가짜 이벤트에 또 반응)                       → FAIL
     M8 mousemove 의 wbPaintSeg 호출 제거(내 화면에 안 그림)             → FAIL
     M9 pdfDrawStroke 를 옛 forEach/lineTo 로 되돌림                     → FAIL 2
     M10 «조건 항상참» 래퍼 `if (true)`(펜도 원본 직선으로)              → FAIL 9
   (FAIL 줄 수: M1 10 · M2 5 · M3 5 · M4 4 · M5 1 · M6 1 · M7 4 · M8 2)
*/
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public/js');
const MAIN = readFileSync(process.env.IDXMAIN_SRC || join(PUB, 'idx-main.js'), 'utf8');
const MOB = readFileSync(process.env.MOBILEFIX_SRC || join(PUB, 'idx-vc-mobilefix.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, hint) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (hint ? '  — ' + hint : '')); }
}

/* 문자열·주석을 건너뛰며 중괄호 짝을 맞춘다 */
function matchBrace(src, open) {
  let d = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const ch = src[i], nx = src[i + 1];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '/' && nx === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (ch === '/' && nx === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
function fnSrc(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  const open = src.indexOf('{', i + header.length - 1);
  const close = matchBrace(src, open);
  return close < 0 ? '' : src.slice(i, close + 1);
}

/* 호출을 적어 두는 가짜 ctx */
function fakeCtx(tag) {
  const calls = [];
  const target = { calls, tag };
  ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'save', 'restore', 'rect', 'ellipse',
   'fillText', 'strokeText', 'clearRect'].forEach(m => { target[m] = (...a) => calls.push([m, ...a]); });
  return new Proxy(target, {
    set(t, k, v) { if (k !== '__mgInk') calls.push(['set', k, v]); t[k] = v; return true; }
  });
}
const names = c => c.calls.filter(x => x[0] !== 'set').map(x => x[0]);
const near = (a, b) => Math.abs(a - b) < 1e-9;

/* ── ① wbInkPath ─────────────────────────────────────────────── */
console.log('\n① wbInkPath — 중점 2차곡선, 첫·끝 점은 그대로');
const inkSrc = fnSrc(MAIN, 'function wbInkPath(');
ok('전제: wbInkPath 를 소스에서 오려 냈다', inkSrc.length > 50);
let wbInkPath = null;
try { wbInkPath = new Function(inkSrc + '\nreturn wbInkPath;')(); } catch (e) { console.log('   ', e.message); }
ok('전제: wbInkPath 가 실행된다', typeof wbInkPath === 'function');
if (typeof wbInkPath === 'function') {
  const P = [[0, 0], [0.1, 0.2], [0.3, 0.2], [0.5, 0.6], [0.9, 1]];
  const c = fakeCtx(); wbInkPath(c, P, 100, 50);
  const q = c.calls.filter(x => x[0] === 'quadraticCurveTo');
  ok('점 5개 → 곡선 3개', q.length === 3, JSON.stringify(names(c)));
  ok('첫 호출이 moveTo(첫 점)', c.calls[0] && c.calls[0][0] === 'moveTo' && near(c.calls[0][1], 0) && near(c.calls[0][2], 0));
  const last = c.calls[c.calls.length - 1];
  ok('마지막이 lineTo(끝 점) — 끝 점을 그대로 지난다', last && last[0] === 'lineTo' && near(last[1], 90) && near(last[2], 50));
  ok('사이에 lineTo 가 없다(꺾은선이 아니다)', c.calls.filter(x => x[0] === 'lineTo').length === 1);
  ok('곡선 조절점 = 중간 점, 끝 = 다음 점과의 중점',
     q[0] && near(q[0][1], 10) && near(q[0][2], 10) && near(q[0][3], 20) && near(q[0][4], 10));
  const c2 = fakeCtx(); wbInkPath(c2, [[0, 0], [1, 1]], 10, 10);
  ok('점 2개 → moveTo + lineTo(곡선 없음)', JSON.stringify(names(c2)) === '["moveTo","lineTo"]');
  const c1 = fakeCtx(); wbInkPath(c1, [[0.5, 0.5]], 10, 10);
  ok('점 1개 → moveTo 만(예전과 같이 아무것도 안 그림)', JSON.stringify(names(c1)) === '["moveTo"]');
  const c0 = fakeCtx(); let threw = false; try { wbInkPath(c0, [], 10, 10); } catch { threw = true; }
  ok('점 0개 → 던지지 않고 아무 호출도 없다', !threw && c0.calls.length === 0);
}

/* ── ② 점 배열을 그리는 곳이 정본을 실제로 쓰는가 · 도형·글자·지우개는 그대로 ── */
console.log('\n② 교재 필기·칠판 원본 잉크가 wbInkPath 로 그려지고, 나머지는 예전 그대로');
function load(header, name, extra = '') {
  const s = fnSrc(MAIN, header);
  if (!s) return null;
  try {
    return new Function('wbInkPath', 'wbRenderShape', extra + s + `\nreturn ${name};`);
  } catch (e) { console.log('   ', name, e.message); return null; }
}
{
  const shapes = [];
  const shapeStub = (...a) => shapes.push(a);
  const mk = load('function pdfDrawStroke(', 'pdfDrawStroke');
  const pdfDrawStroke = mk ? mk(wbInkPath, shapeStub) : null;
  ok('전제: pdfDrawStroke 를 오려 내 실행할 수 있다', typeof pdfDrawStroke === 'function');
  if (pdfDrawStroke) {
    const pts = [[0.1, 0.1], [0.2, 0.3], [0.4, 0.3], [0.6, 0.1]];
    const c = fakeCtx(); pdfDrawStroke(c, 200, 100, { tool: 'pen', color: '#f00', size: 3, points: pts });
    ok('교재 펜 → quadraticCurveTo 로 그린다', c.calls.some(x => x[0] === 'quadraticCurveTo'));
    ok('교재 펜 → 끝 점(0.6,0.1)을 지난다', c.calls.some(x => x[0] === 'lineTo' && near(x[1], 120) && near(x[2], 10)));
    const h = fakeCtx(); pdfDrawStroke(h, 200, 100, { tool: 'highlighter', color: '#ff0', size: 4, points: pts });
    ok('형광펜 → 반투명 0.32 · 굵기 ×5 그대로',
       h.calls.some(x => x[0] === 'set' && x[1] === 'globalAlpha' && x[2] === 0.32) &&
       h.calls.some(x => x[0] === 'set' && x[1] === 'lineWidth' && x[2] === 20));
    const er = fakeCtx(); pdfDrawStroke(er, 200, 100, { tool: 'eraser', color: '#000', size: 3, points: pts });
    ok('교재 지우개 → destination-out 그대로', er.calls.some(x => x[0] === 'set' && x[1] === 'globalCompositeOperation' && x[2] === 'destination-out'));
    const sh = fakeCtx(); pdfDrawStroke(sh, 200, 100, { tool: 'shape', shape: { t: 'line' }, color: '#00f', size: 2 });
    ok('교재 도형 → wbRenderShape 그대로(곡선 없음)', shapes.length === 1 && !sh.calls.some(x => x[0] === 'quadraticCurveTo'));
    const tx = fakeCtx(); pdfDrawStroke(tx, 200, 100, { tool: 'text', text: 'Hi', x: 0.5, y: 0.5, color: '#000', size: 3 });
    ok('교재 글자 → fillText 그대로', tx.calls.some(x => x[0] === 'fillText' && x[1] === 'Hi'));
    const em = fakeCtx(); pdfDrawStroke(em, 200, 100, { tool: 'pen', color: '#f00', size: 3, points: [] });
    ok('점이 없는 획 → 아무것도 안 그린다', em.calls.length === 0);
  }
  const mk2 = load('function wbPaintStroke(', 'wbPaintStroke');
  const wbPaintStroke = mk2 ? mk2(wbInkPath, shapeStub) : null;
  ok('전제: wbPaintStroke 를 오려 내 실행할 수 있다', typeof wbPaintStroke === 'function');
  if (wbPaintStroke) {
    const c = fakeCtx(); wbPaintStroke(c, 100, 100, { points: [[0, 0], [0.5, 0.5], [1, 0]], color: '#123', size: 4 });
    ok('칠판 원본 잉크 → 곡선 + 끝 점', c.calls.some(x => x[0] === 'quadraticCurveTo') && c.calls.some(x => x[0] === 'lineTo' && near(x[1], 100) && near(x[2], 0)));
    ok('칠판 원본 잉크 → save/restore 로 감싼다', names(c)[0] === 'save' && names(c).slice(-1)[0] === 'restore');
  }
  /* 원본 wbPaintSeg — 지우개·직선·사각형·원은 예전 모양 그대로 */
  const mk3 = load('function wbPaintSeg(', 'wbPaintSeg');
  const seg = mk3 ? mk3(wbInkPath, shapeStub) : null;
  ok('전제: 원본 wbPaintSeg 를 실행할 수 있다', typeof seg === 'function');
  if (seg) {
    const base = { fromX: 0.1, fromY: 0.1, toX: 0.5, toY: 0.5, color: '#00f', size: 2 };
    const e = fakeCtx(); seg(e, 100, 100, { ...base, tool: 'eraser' });
    ok('원본: 지우개 = 흰색 · 굵기 ×3 · 직선', e.calls.some(x => x[0] === 'set' && x[1] === 'strokeStyle' && x[2] === '#ffffff') &&
       e.calls.some(x => x[0] === 'set' && x[1] === 'lineWidth' && x[2] === 6) && names(e).includes('lineTo') && !names(e).includes('quadraticCurveTo'));
    const r = fakeCtx(); seg(r, 100, 100, { ...base, tool: 'rect' });
    ok('원본: 사각형 = rect', names(r).includes('rect'));
    const ci = fakeCtx(); seg(ci, 100, 100, { ...base, tool: 'circle' });
    ok('원본: 원 = ellipse', names(ci).includes('ellipse'));
    const li = fakeCtx(); seg(li, 100, 100, { ...base, tool: 'line' });
    ok('원본: 직선 = moveTo+lineTo', JSON.stringify(names(li)) === '["beginPath","moveTo","lineTo","stroke"]');
  }
  /* AI 미리보기·확정 경로도 정본을 쓰는가 — 실행해서 본다 */
  {
    const wbInkCalls = [];
    const inkSpy = (c, P, W, H) => { wbInkCalls.push([P.length, W, H]); return wbInkPath(c, P, W, H); };
    const dpSrc = fnSrc(MAIN, 'function wbDrawPending(');
    const aiCtx = fakeCtx('ai');
    const doc = { getElementById: id => id === 'wb-ai-layer' ? { width: 10, height: 10, getContext: () => aiCtx } : null };
    let ran = false;
    try {
      new Function('document', 'wbInkPath', 'wbOcrPending', dpSrc + '\nwbDrawPending();')(doc, inkSpy,
        [{ points: [[1, 1], [5, 5], [9, 1]], color: '#000', size: 2 }]);
      ran = true;
    } catch (e) { console.log('   ', e.message); }
    ok('대기 손글씨 미리보기(wbDrawPending)도 wbInkPath(px, 1,1) 로 그린다', ran && wbInkCalls.some(x => x[0] === 3 && x[1] === 1 && x[2] === 1));
  }
}

/* ── ③ 칠판 펜 mousemove — 보내는 데이터 모양 그대로 ── */
console.log('\n③ 칠판 펜이 보내는 토막(whiteboard-draw) 모양이 그대로인가 — 핸들러를 실제로 돌림');
{
  const hdr = "canvas.addEventListener('mousemove', e => {";
  const i = MAIN.indexOf(hdr);
  const open = MAIN.indexOf('{', i + hdr.length - 1);
  const close = matchBrace(MAIN, open);
  const body = i >= 0 && close > 0 ? MAIN.slice(open, close + 1) : '';
  ok('전제: mousemove 핸들러를 오려 냈다', body.length > 200);
  function run(tool) {
    const sent = [], rec = [], painted = [];
    const ctx = fakeCtx();
    const canvas = { width: 400, height: 200, getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 200 }) };
    const document = { getElementById: id => ({ 'wb-color': { value: '#abcdef' }, 'wb-size': { value: '5' } })[id] || null };
    const code = `let wbDrawing = true, wbTool = ${JSON.stringify(tool)}, wbLastX = 100, wbLastY = 50,
      wbAiMode = false, wbOcrMode = false, wbAiPoints = null, wbSnapshot = null;
      const h = (e) => ${body};
      h(evt);
      return { wbLastX, wbLastY };`;
    let st = null, err = null;
    try {
      st = new Function('canvas', 'ctx', 'document', 'vcConn', 'wbRecord', 'wbPaintSeg', 'wbAiPreview', 'evt', code)(
        canvas, ctx, document, { send: m => sent.push(m) }, op => rec.push(op),
        (c, W, H, d) => painted.push({ c, W, H, d }), () => {}, { clientX: 210, clientY: 120 });
    } catch (e) { err = e; }
    return { sent, rec, painted, st, err, ctx };
  }
  for (const tool of ['pen', 'eraser']) {
    const r = run(tool);
    ok(`[${tool}] 핸들러가 던지지 않는다`, !r.err, r.err && r.err.message);
    const m = r.sent[0];
    ok(`[${tool}] whiteboard-draw 한 번 보낸다`, r.sent.length === 1 && m && m.type === 'whiteboard-draw');
    const keys = m ? Object.keys(m.data).sort().join(',') : '';
    ok(`[${tool}] 데이터 칸이 예전 그대로(color,fromX,fromY,size,toX,toY,tool)`, keys === 'color,fromX,fromY,size,toX,toY,tool', keys);
    ok(`[${tool}] 좌표는 0~1 정규화 그대로`, m && near(m.data.fromX, 0.25) && near(m.data.fromY, 0.25) && near(m.data.toX, 0.5) && near(m.data.toY, 0.5));
    ok(`[${tool}] 내 화면은 «보낸 그 토막» 으로 wbPaintSeg 를 통해 칠한다`, r.painted.length === 1 && m && r.painted[0].d === m.data && r.painted[0].W === 400 && r.painted[0].H === 200);
    ok(`[${tool}] 기록도 같은 토막`, r.rec.length === 1 && r.rec[0].k === 'seg' && m && r.rec[0].d === m.data);
    ok(`[${tool}] 핸들러가 직접 lineTo 로 칠하지 않는다(칠하기 정본은 하나)`, !r.ctx.calls.some(x => x[0] === 'lineTo'));
    ok(`[${tool}] 마지막 점을 갱신한다`, r.st && r.st.wbLastX === 200 && r.st.wbLastY === 100);
  }
}

/* ── ④ ⑰절 실행 ─────────────────────────────────────────────── */
console.log('\n④ idx-vc-mobilefix.js ⑰절 — 토막 이어 곡선 · 꼬리 · 사이 점');
const secStartMark = '⑰ 🖍 판서 선 보정';
const sm = MOB.indexOf(secStartMark);
const secStart = sm < 0 ? -1 : MOB.lastIndexOf('/*', sm);
const secEnd = MOB.indexOf('/* ⑰ 끝 */');
const SEC = secStart >= 0 && secEnd > secStart ? MOB.slice(secStart, secEnd) : '';
ok('전제: ⑰절을 오려 냈다', SEC.length > 1000);

class FakeMouseEvent { constructor(type, init) { this.type = type; Object.assign(this, init || {}); this.isTrusted = false; } }
class FakePointerEvent extends FakeMouseEvent {}

function env(opts = {}) {
  const timers = [];
  const orig = [];       // 원본 wbPaintSeg 로 간 호출
  const wbCtx = fakeCtx('wb');
  const canvas = { id: 'wb-canvas', getContext: () => wbCtx, dispatched: [], dispatchEvent(ev) { this.dispatched.push(ev); } };
  const listeners = {};
  const document = {
    addEventListener(t, f, cap) { (listeners[t] = listeners[t] || []).push({ f, cap }); },
    getElementById: id => id === 'wb-canvas' ? canvas : null,
  };
  const window = {
    wbPaintSeg(ctx, W, H, d) { orig.push({ ctx, W, H, d }); ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(-2, -2); ctx.stroke(); },
    wbPaintStroke(ctx) { ctx.beginPath(); ctx.moveTo(-9, -9); ctx.stroke(); },
    wbPaintText(ctx) { ctx.fillText('T', 0, 0); },
    wbRenderShape(ctx) { ctx.rect(0, 0, 1, 1); },
    wbRedrawAll() { wbCtx.clearRect(0, 0, 1, 1); (opts.redrawOps || []).forEach(d => window.wbPaintSeg(wbCtx, 100, 100, d)); },
    wbReceiveClear() { wbCtx.clearRect(0, 0, 1, 1); },
    vcConn: { send() { window.__sent = (window.__sent || 0) + 1; } },
  };
  const setT = (f) => { timers.push(f); return timers.length; };
  const clrT = (id) => { if (id) timers[id - 1] = null; };
  let setVar = null, err = null;
  try {
    setVar = new Function('window', 'document', 'setTimeout', 'clearTimeout', 'MouseEvent', 'PointerEvent',
      'var wbDrawing = false, wbTool = "pen", pdfDrawTool = "none";\n' + SEC +
      '\nreturn function (k, v) { if (k === "wbDrawing") wbDrawing = v; else if (k === "wbTool") wbTool = v; else if (k === "pdfDrawTool") pdfDrawTool = v; };')(
      window, document, setT, clrT, FakeMouseEvent, FakePointerEvent);
  } catch (e) { err = e; }
  const fire = (t, ev) => (listeners[t] || []).forEach(l => l.f(ev));
  const flushTimers = () => { for (let i = 0; i < timers.length; i++) { const f = timers[i]; if (f) { timers[i] = null; f(); } } };
  return { window, document, canvas, wbCtx, orig, timers, flushTimers, setVar, err, fire, listeners };
}
const S = (fx, fy, tx, ty, extra = {}) => ({ tool: 'pen', fromX: fx, fromY: fy, toX: tx, toY: ty, color: '#f00', size: 3, ...extra });

{
  const E = env();
  ok('전제: ⑰절이 던지지 않고 실행된다', !E.err, E.err && E.err.message);
  ok('전제: wbPaintSeg 를 감쌌다', E.window.wbPaintSeg && E.window.wbPaintSeg.__mgInk === 1);
}
if (SEC) {
  // E1 — 이어진 펜 토막 세 개
  {
    const E = env(); const c = fakeCtx('live'); const P = E.window.wbPaintSeg;
    P(c, 100, 100, S(0, 0, 0.2, 0)); P(c, 100, 100, S(0.2, 0, 0.4, 0.2)); P(c, 100, 100, S(0.4, 0.2, 0.6, 0.2));
    const cs = c.calls.filter(x => x[0] !== 'set');
    ok('첫 토막: 시작점에서 중점까지 직선(첫 점을 지난다)',
       cs[1] && cs[1][0] === 'moveTo' && near(cs[1][1], 0) && near(cs[1][2], 0) && cs[2][0] === 'lineTo' && near(cs[2][1], 10));
    const q = cs.filter(x => x[0] === 'quadraticCurveTo');
    ok('다음 토막들: 이음점을 조절점으로 한 곡선 2개', q.length === 2 && near(q[0][1], 20) && near(q[0][2], 0) && near(q[0][3], 30) && near(q[0][4], 10));
    ok('펜 토막은 원본(직선) 으로 안 보낸다', E.orig.length === 0);
    ok('손을 떼기 전에는 끝 점까지 그리지 않는다(다음 토막을 기다림)', !cs.some(x => x[0] === 'lineTo' && near(x[1], 60)));
    E.flushTimers();
    const cs2 = c.calls.filter(x => x[0] !== 'set');
    const lastL = cs2.filter(x => x[0] === 'lineTo').slice(-1)[0];
    ok('220ms 뒤 꼬리를 끝 점(60,20)까지 그린다 — 끝 점을 지난다', lastL && near(lastL[1], 60) && near(lastL[2], 20));
    ok('꼬리 색·굵기는 그 획 그대로', c.calls.filter(x => x[0] === 'set' && x[1] === 'strokeStyle').every(x => x[2] === '#f00'));
  }
  // E2 — 지우개 직전에 꼬리를 먼저 그린다 · 지우개는 원본
  {
    const E = env(); const c = fakeCtx(); const P = E.window.wbPaintSeg;
    P(c, 100, 100, S(0, 0, 0.5, 0.5));
    P(c, 100, 100, { tool: 'eraser', fromX: 0.9, fromY: 0.9, toX: 0.8, toY: 0.8, color: '#000', size: 3 });
    const iTail = c.calls.findIndex(x => x[0] === 'lineTo' && near(x[1], 50) && near(x[2], 50));
    const iOrig = c.calls.findIndex(x => x[0] === 'moveTo' && x[1] === -1);
    ok('지우개 토막은 원본 wbPaintSeg 로 간다', E.orig.length === 1 && E.orig[0].d.tool === 'eraser');
    ok('기다리던 펜 꼬리를 지우개보다 «먼저» 그린다', iTail >= 0 && iOrig > iTail, `${iTail} / ${iOrig}`);
  }
  // E3 — 직선·사각형·원은 원본 그대로
  {
    const E = env(); const c = fakeCtx(); const P = E.window.wbPaintSeg;
    ['line', 'rect', 'circle'].forEach(t => P(c, 100, 100, S(0.1, 0.1, 0.3, 0.3, { tool: t })));
    ok('직선·사각형·원은 원본으로 그린다(3번)', E.orig.length === 3 && E.orig.map(o => o.d.tool).join() === 'line,rect,circle');
    ok('도형에는 곡선을 안 쓴다', !c.calls.some(x => x[0] === 'quadraticCurveTo'));
  }
  // E4·E5 — 안 이어진 토막 / 색이 다른 토막은 새 획
  {
    const E = env(); const c = fakeCtx(); const P = E.window.wbPaintSeg;
    P(c, 100, 100, S(0, 0, 0.2, 0)); P(c, 100, 100, S(0.7, 0.7, 0.8, 0.8));
    ok('끝이 안 맞는 토막 → 새 획(곡선 아님)', !c.calls.some(x => x[0] === 'quadraticCurveTo'));
    P(c, 100, 100, S(0.8, 0.8, 0.9, 0.9, { color: '#0f0' }));
    ok('색이 다르면 이어 붙이지 않는다', !c.calls.some(x => x[0] === 'quadraticCurveTo'));
  }
  // E6 — 다시 그리기: 옛 꼬리는 버리고, 다시 그린 획의 꼬리는 바로 마저 그린다
  {
    const E = env({ redrawOps: [S(0.1, 0.1, 0.2, 0.1, { color: '#00f' }), S(0.2, 0.1, 0.3, 0.3, { color: '#00f' })] });
    const P = E.window.wbPaintSeg;
    P(E.wbCtx, 100, 100, S(0.5, 0.5, 0.9, 0.5));          // 진행 중인 획(꼬리 대기)
    E.window.wbRedrawAll();
    const iClear = E.wbCtx.calls.findIndex(x => x[0] === 'clearRect');
    const after = E.wbCtx.calls.slice(iClear);
    ok('다시 그린 획의 꼬리(30,30)를 바로 그린다', after.some(x => x[0] === 'lineTo' && near(x[1], 30) && near(x[2], 30)));
    const before = E.wbCtx.calls.length;
    E.flushTimers();
    ok('지운 뒤에는 옛 꼬리(90,50)를 그리지 않는다', !E.wbCtx.calls.slice(before).some(x => x[0] === 'lineTo' && near(x[1], 90)));
  }
  // E7 — 전체 지우기
  {
    const E = env(); const P = E.window.wbPaintSeg;
    P(E.wbCtx, 100, 100, S(0, 0, 0.4, 0.4));
    E.window.wbReceiveClear();
    const n = E.wbCtx.calls.length; E.flushTimers();
    ok('전체 지우기 뒤 기다리던 꼬리가 되살아나지 않는다', E.wbCtx.calls.length === n);
  }
  // E8 — 손을 떼면 바로
  {
    const E = env(); const P = E.window.wbPaintSeg;
    P(E.wbCtx, 100, 100, S(0, 0, 0.4, 0.4));
    E.fire('mouseup', { type: 'mouseup', target: {} });
    ok('mouseup 에서 꼬리를 바로 그린다', E.wbCtx.calls.some(x => x[0] === 'lineTo' && near(x[1], 40) && near(x[2], 40)));
    const n = E.wbCtx.calls.length; E.flushTimers();
    ok('그 뒤 타이머가 꼬리를 또 그리지 않는다', E.wbCtx.calls.length === n);
  }
  // E9 — 다른 것(원본 잉크·글자·도형) 직전에도 꼬리 먼저
  {
    const E = env(); const P = E.window.wbPaintSeg;
    P(E.wbCtx, 100, 100, S(0, 0, 0.4, 0.4));
    E.window.wbPaintStroke(E.wbCtx, 100, 100, {});
    const iTail = E.wbCtx.calls.findIndex(x => x[0] === 'lineTo' && near(x[1], 40));
    const iStroke = E.wbCtx.calls.findIndex(x => x[0] === 'moveTo' && x[1] === -9);
    ok('원본 잉크보다 꼬리가 먼저', iTail >= 0 && iStroke > iTail);
  }
  // E10 — 데이터 모양: 아무것도 안 보내고, 받은 토막을 고치지 않는다
  {
    const E = env(); const P = E.window.wbPaintSeg; const c = fakeCtx();
    const d1 = S(0, 0, 0.2, 0.2), d2 = S(0.2, 0.2, 0.5, 0.1);
    const snap = JSON.stringify([d1, d2]);
    P(c, 100, 100, d1); P(c, 100, 100, d2); E.flushTimers();
    ok('⑰절은 아무것도 보내지 않는다', !E.window.__sent);
    ok('받은 토막 객체를 고치지 않는다', JSON.stringify([d1, d2]) === snap);
  }
  // E11~ — 사이 점(getCoalescedEvents)
  const pm = (target, x, y, list, extra = {}) => ({ type: 'pointermove', isTrusted: true, target, clientX: x, clientY: y, buttons: 1,
    pointerId: 7, pointerType: 'pen', isPrimary: true,
    ...(list ? { getCoalescedEvents: () => list.map(([a, b]) => ({ clientX: a, clientY: b })) } : {}), ...extra });
  const down = (target, x, y) => ({ type: 'pointerdown', isTrusted: true, target, clientX: x, clientY: y });
  {
    const E = env(); E.setVar('wbDrawing', true); E.setVar('wbTool', 'pen');
    E.fire('pointerdown', down(E.canvas, 0, 0));
    E.fire('pointermove', pm(E.canvas, 40, 0, [[10, 0], [20, 0], [30, 0], [40, 0]]));
    const d = E.canvas.dispatched;
    ok('칠판 펜 · 빠르게 → 사이 점 «하나» 를 mousemove 로 넣는다', d.length === 1 && d[0].type === 'mousemove' && d[0].clientX === 20 && d[0].clientY === 0, JSON.stringify(d));
    E.fire('pointermove', pm(E.canvas, 43, 0, [[41, 0], [42, 0], [43, 0]]));
    ok('천천히(6px 미만) → 넣지 않는다(보내는 양 그대로)', d.length === 1);
    E.fire('pointermove', pm(E.canvas, 90, 0, null));
    ok('getCoalescedEvents 가 없으면 → 넣지 않는다(예전과 같다)', d.length === 1);
    E.fire('pointermove', pm(E.canvas, 140, 0, [[100, 0], [120, 0], [140, 0]], { isTrusted: false }));
    ok('가짜(untrusted) 이벤트에는 반응하지 않는다', d.length === 1);
    let threw = false;
    try { E.fire('pointermove', pm(E.canvas, 200, 0, null, { getCoalescedEvents() { throw new Error('x'); } })); } catch { threw = true; }
    ok('getCoalescedEvents 가 던져도 → 조용히 넘어간다', !threw && d.length === 1);
    E.setVar('wbTool', 'eraser');
    E.fire('pointermove', pm(E.canvas, 260, 0, [[220, 0], [240, 0], [260, 0]]));
    ok('지우개 → 넣지 않는다(펜만)', d.length === 1);
    E.setVar('wbTool', 'pen'); E.setVar('wbDrawing', false);
    E.fire('pointermove', pm(E.canvas, 320, 0, [[280, 0], [300, 0], [320, 0]]));
    ok('그리는 중이 아니면 → 넣지 않는다', d.length === 1);
  }
  {
    const E = env();
    const anno = { classList: { contains: c => c === 'pdf-anno' }, dispatched: [], dispatchEvent(ev) { this.dispatched.push(ev); } };
    E.setVar('pdfDrawTool', 'pen');
    E.fire('pointerdown', down(anno, 0, 0));
    E.fire('pointermove', pm(anno, 0, 40, [[0, 10], [0, 20], [0, 30], [0, 40]]));
    const d = anno.dispatched;
    ok('교재 펜 → 사이 점 하나를 pointermove 로 넣는다(같은 pointerId)', d.length === 1 && d[0].type === 'pointermove' && d[0].clientY === 20 && d[0].pointerId === 7);
    E.fire('pointermove', pm(anno, 0, 80, [[0, 50], [0, 60], [0, 80]], { buttons: 0 }));
    ok('교재 · 누르지 않은 채 움직임 → 넣지 않는다', d.length === 1);
    E.setVar('pdfDrawTool', 'highlighter');
    E.fire('pointermove', pm(anno, 0, 140, [[0, 100], [0, 120], [0, 140]]));
    ok('교재 형광펜 → 넣지 않는다(펜만)', d.length === 1);
  }
  // 두 번 실행해도 이중으로 감싸지 않는다
  {
    const E = env();
    const w1 = E.window.wbPaintSeg;
    let err = null;
    try {
      new Function('window', 'document', 'setTimeout', 'clearTimeout', 'MouseEvent', 'PointerEvent',
        'var wbDrawing=false, wbTool="pen", pdfDrawTool="none";\n' + SEC)(E.window, E.document, () => 0, () => {}, FakeMouseEvent, FakePointerEvent);
    } catch (e) { err = e; }
    ok('두 번 실행해도 이중으로 감싸지 않는다', !err && E.window.wbPaintSeg === w1);
  }
}

/* ── ⑤ 정적 확인 — 꺾은선 복제가 되살아나지 않았나(주석 벗긴 사본) ── */
console.log('\n⑤ 꺾은선 복제가 되살아나지 않았나');
{
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const h of ['function wbPaintStroke(', 'function pdfDrawStroke(', 'function wbAiPreview(', 'function wbDrawPending(', 'function wbCommitRawStroke(', 'function wbCommitPendingAsInk(']) {
    const b = strip(fnSrc(MAIN, h));
    ok(`${h.slice(9, -1)} 에 점마다 lineTo 하는 forEach 가 없다`, b.length > 0 && !/forEach\([^)]*\)\s*=>\s*\{[^}]*lineTo/.test(b) && /wbInkPath\(|wbPaintStroke\(/.test(b.replace(h, '')));
  }
}

console.log(`\n${fail === 0 ? '✅' : '🚨'} 판서 선 보정 — PASS ${pass} / FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
