/* 🎭 아바타 «머리만 살짝 움직이기» (js/mango-avatar.js v13, 2026-10-18)
 *
 * 왜: 사장님 「머리도 살아있는 거처럼 조금 씩 움직이게 해줘」 — 그림 캐릭터 여섯(lily·noah·emma·mei·long·jake)
 *     의 «머리만» 목 가운데를 축으로 아주 작게 기울고(최대 약 1°) 끄덕입니다. 몸(어깨)은 그대로입니다.
 *
 * 무엇을 보는가 — «글자가 있는가» 가 아니라 파일을 가짜 DOM·가짜 캔버스·가짜 시계로 «실제로 돌려» 봅니다.
 *   ① HEAD 표: 그림 캐릭터가 다 있고, 머리 경계(y1)가 눈 칸·입 칸 «아래» 이며, 축이 눈 칸 안에 있고,
 *      원본 크기(w·h)가 실제 그림 파일과 같다 · 영상 캐릭터에는 없다
 *   ② 그리는 순서: 기운 경계 → 'source-out' 으로 몸 → 'lighter' 로 기운 머리 (몸은 안 기운다)
 *   ③ 크기: 최대 기울기 ≤ 1°(말할 때 ≤ 1.35°) · 실제로 움직인다(짝) · 끄덕임 ≤ 0.7%
 *   ④ 머리 경계 그림: 목 가운데에서는 y1 위 = 머리, y2 아래 = 몸 · 목 밖에서는 경계가 위로 올라간다
 *   ⑤ 쉬는 동안: 초당 약 20번만 그린다 · 탭이 숨으면/화면 밖이면/움직임 줄이기면 멈추고 다시 켜진다(짝)
 *   ⑥ 말하는 동안: 그리기 루프 하나만 돈다(rAF 가 겹치지 않는다) · 말이 끝나면 쉬는 움직임으로 돌아간다
 *   ⑦ 영상 캐릭터(jake_classic — 2026-10-18 부터 jake 는 그림 캐릭터)로 바꾸면 안 기운다 · 머리 캐릭터로 돌아오면 다시 켜진다(짝)
 *   ⑧ 2배 comp: 머리 캐릭터는 comp 가 640 폭(원본 그대로) · 영상 캐릭터는 320 폭
 *   ⑨ 전환 섞기: 투명 그림 캐릭터는 캔버스 사본으로 섞는다(getImageData 픽셀 루프 없이)
 *   ⑩ 화면 밖 캔버스를 못 만들면: 예전처럼 화면에 바로 그리고 안 기운다(실패해도 얼굴은 그대로)
 *   ⑪ 상주 setInterval 이 없다
 *
 * 실제 픽셀(몸이 한 픽셀도 안 바뀌는가 · 목에 틈이 없는가)은 브라우저 검사가 잽니다:
 *   test-harness/manual/avatar-head-sway-browser.mjs (자동으로 안 돕니다 — 사람이 부릅니다)
 */
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC_FILE = process.env.AVATAR_SRC || join(PUB, 'js', 'mango-avatar.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 아바타 머리 움직임 (js/mango-avatar.js v13)');
const AV = readFileSync(SRC_FILE, 'utf8');

function stripComments(t) {
  let out = '', i = 0, q = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    out += c; i++;
  }
  return out;
}
const CODE = stripComments(AV);
ok(CODE.length > AV.length * 0.4, `주석을 벗긴 사본이 통째로 사라지지 않았다 (${CODE.length}/${AV.length}자)`);

const grab = (re, label) => { const m = CODE.match(re); try { return m && new Function('return ' + m[1])(); } catch { return null; } };
const HEAD = grab(/var HEAD\s*=\s*(\{[\s\S]*?\}\});/);
const EYES = grab(/var EYES\s*=\s*(\{[^;]*\});/);
const PREC = grab(/var PRECISION\s*=\s*(\{[\s\S]*?\}\});/);
let CH = null;
{ const m = CODE.match(/var CHARACTERS = \{[\s\S]*?\n  \};/); try { CH = m && new Function(m[0].replace(/^var /, 'const ') + ' return CHARACTERS;')(); } catch { CH = null; } }
const num = re => { const m = CODE.match(re); return m ? Number(m[1]) : NaN; };
const ROT_DEG = num(/\bSWAY_ROT_DEG\s*=\s*([\d.]+)/), NOD = num(/\bSWAY_NOD\s*=\s*([\d.]+)/), TALK = num(/\bSWAY_TALK\s*=\s*([\d.]+)/);
const IDLE_MS = num(/\bSWAY_IDLE_MS\s*=\s*(\d+)/);
ok(!!HEAD && !!EYES && !!PREC && !!CH, `HEAD·EYES·PRECISION·CHARACTERS 표를 소스에서 읽었다 (${HEAD ? Object.keys(HEAD).join(',') : '없음'})`,
  '못 읽으면 아래 검사가 조용히 아무것도 안 재게 됩니다');
ok(ROT_DEG > 0 && ROT_DEG <= 1.5 && NOD > 0 && NOD <= 0.012 && TALK >= 1 && TALK <= 1.6 && IDLE_MS >= 30 && IDLE_MS <= 100,
  `크기·속도 상수가 «조금씩» 범위다 (기울기 ${ROT_DEG}° · 끄덕임 ${NOD} · 말할 때 ×${TALK} · 쉴 때 ${IDLE_MS}ms)`,
  '「조금 씩」 지시입니다 — 크게 키우면 얼굴이 흔들리는 것으로 보입니다');

/* ── ① HEAD 표 ──────────────────────────────────────────────────────── */
console.log('\n■ ① HEAD 표 — 머리 경계가 눈·입 «아래» 이고 원본 크기가 맞다');
function webpSize(buf) {
  const tag = buf.toString('ascii', 12, 16);
  if (tag === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (tag === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (tag === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  return null;
}
const imageChars = CH ? Object.keys(CH).filter(k => CH[k].frames) : [];
const videoChars = CH ? Object.keys(CH).filter(k => CH[k].sources) : [];
ok(imageChars.length >= 6 && videoChars.length >= 1, `(전제) 그림 캐릭터 ${imageChars.length} · 영상 캐릭터 ${videoChars.length}`);
for (const k of imageChars) ok(!!(HEAD && HEAD[k]), `${k}: 그림 캐릭터라 HEAD 에 있다(머리가 움직인다)`, '빠지면 그 캐릭터만 조용히 안 움직입니다');
for (const k of videoChars) ok(!(HEAD && HEAD[k]), `${k}: 영상 캐릭터라 HEAD 에 없다(영상 자체가 움직임)`);
for (const [name, h] of Object.entries(HEAD || {})) {
  const c = CH && CH[name];
  ok(!!c && c.keyed === false, `${name}: 투명 그림(keyed:false) 캐릭터다 — 머리 층을 오려도 배경이 안 섞인다`);
  const still = c && (c.still || '').split('?')[0];
  let wh = null; try { wh = webpSize(readFileSync(join(PUB, still))); } catch {}
  ok(!!wh && wh[0] === h.w && wh[1] === h.h, `${name}: HEAD 의 원본 크기가 그림 파일과 같다 (${wh ? wh.join('x') : '?'} = ${h.w}x${h.h})`);
  ok(h.y2 - h.y1 >= 30 && h.y2 > h.y1, `${name}: 섞는 띠가 충분히 넓다 (${h.y1}→${h.y2}, ${h.y2 - h.y1}px)`, '좁으면 목에 경계선이 보입니다');
  const e = EYES && EYES[name];
  ok(!!e && e.y + e.h < h.y1, `${name}: 머리 경계(y1 ${h.y1})가 눈 칸 아래 끝(${e ? e.y + e.h : '?'})보다 아래다`, '위면 눈이 반쯤 몸에 남아 찢어집니다');
  ok(!!e && h.x > e.x && h.x < e.x + e.w, `${name}: 축(x ${h.x})이 눈 칸(${e ? e.x + '~' + (e.x + e.w) : '?'}) 안 — 얼굴 가운데다`);
  const p = PREC && PREC[name];
  if (p) ok(p.y + p.h <= h.y1, `${name}: 머리 경계(y1 ${h.y1})가 입 칸 아래 끝(${p.y + p.h})보다 아래다`, '위면 말할 때 입 칸 아랫부분이 몸에 남아 턱이 찢어집니다');
  ok(h.nw > 0 && h.nw < h.w / 2, `${name}: 목 반폭 nw(${h.nw})가 그럴듯하다`);
}

/* ── 가짜 세계 ─────────────────────────────────────────────────────── */
let T = 1_000_000, intervals = 0;
const timers = []; let tid = 0;
const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: T + (ms || 0), fn }); return id; };
const clearTimeout_ = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
function makeCtx(cv) {
  const st = { gco: 'source-over', rot: 0, sy: 1, alpha: 1, base: 1, stack: [] };
  const ctx = {
    canvas: cv, ops: [], st,
    get globalCompositeOperation() { return st.gco; }, set globalCompositeOperation(v) { st.gco = v; },
    get globalAlpha() { return st.alpha; }, set globalAlpha(v) { st.alpha = v; },
    setTransform(a) { st.rot = 0; st.sy = 1; st.base = a; },
    translate() {}, rotate(r) { st.rot += r; }, scale(x, y) { st.sy *= y; },
    save() { st.stack.push({ gco: st.gco, rot: st.rot, sy: st.sy, alpha: st.alpha, base: st.base }); },
    restore() { const p = st.stack.pop(); if (p) Object.assign(st, p); },
    clearRect() { ctx.ops.push({ op: 'clear' }); },
    drawImage(im, ...a) { ctx.ops.push({ op: 'draw', src: im, a, gco: st.gco, rot: st.rot, sy: st.sy, alpha: st.alpha }); },
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData(d) { ctx.ops.push({ op: 'put' }); cv.__put = d; },
    getImageData(x, y, w, h) { ctx.ops.push({ op: 'get' }); return { data: new Uint8ClampedArray(w * h * 4) }; }
  };
  return ctx;
}
const created = [];
function makeCanvas(tag) {
  const cls = new Set();
  const cv = { __tag: tag, width: 300, height: 150, style: {}, isConnected: true,
    classList: { toggle(c, on) { on ? cls.add(c) : cls.delete(c); }, contains: c => cls.has(c) } };
  cv.ctx = makeCtx(cv);
  cv.getContext = (t, opt) => { cv.ctxOpts = opt; return cv.ctx; };
  return cv;
}
class Image {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) {
    this._src = v;
    queueMicrotask(() => {
      const emma = /emma-v2/.test(v);
      this.complete = true; this.naturalWidth = emma ? 512 : 640; this.naturalHeight = emma ? 640 : 800; this.onload && this.onload();
    });
  }
  get src() { return this._src; }
}
class Media {
  constructor() { this.events = {}; this.paused = true; this.ended = false; this.readyState = 4; this.style = {}; }
  addEventListener(n, f) { (this.events[n] ||= []).push(f); }
  emit(n) { for (const f of this.events[n] || []) f(); }
  pause() { this.paused = true; } load() {} removeAttribute() {} appendChild() {} removeChild() {}
}
class AudioContext {
  constructor() { this.state = 'running'; this.destination = {}; }
  createAnalyser() { return { fftSize: 512, getByteTimeDomainData(a) { a.fill(180); } }; }
  createMediaElementSource() { return { connect() {} }; }
}

function world({ offscreen = true, want = 'lily' } = {}) {
  const canvas = makeCanvas('visible'); canvas.width = 320; canvas.height = 400;
  const video = new Media(), wrap = { classList: { toggle() {} } }, ring = { style: {}, getBoundingClientRect: () => ({ width: 320 }) };
  const heads = [], listeners = {};
  const mq = { matches: false, ls: [], addEventListener(t, f) { this.ls.push(f); } };
  const io = { cb: null, el: null };
  const pendingRaf = new Map(); let rafId = 0;
  const document = {
    readyState: 'complete', hidden: false,
    head: { appendChild(st) { heads.push(st); } },
    createElement: tag => { if (tag === 'canvas' && offscreen) { const c = makeCanvas('off'); created.push(c); return c; } return {}; },
    addEventListener(n, f) { (listeners[n] ||= []).push(f); },
    getElementById(id) {
      return { 'tavatar-video': video, 'tavatar-canvas': canvas, 'tavatar-wrap': wrap, 'tavatar-ring': ring }[id] || heads.find(h => h.id === id) || null;
    }
  };
  class IntersectionObserver { constructor(cb) { io.cb = cb; } observe(el) { io.el = el; } }
  const window = { __mgAvatarWant: want, AudioContext, matchMedia: () => mq };
  const FakeMath = Object.create(Math); FakeMath.random = () => 0.37;
  const FakeDate = { now: () => T };
  let ranOk = true;
  try {
    vm.runInNewContext(AV, { window, document, Image, Math: FakeMath, Date: FakeDate, WeakMap, Uint8Array, Uint8ClampedArray, Promise,
      IntersectionObserver, setTimeout: setTimeout_, clearTimeout: clearTimeout_,
      setInterval: (fn, ms) => { intervals++; return setTimeout_(fn, ms); }, clearInterval: clearTimeout_, getComputedStyle: () => ({ width: '320px' }),
      requestAnimationFrame(f) { pendingRaf.set(++rafId, f); return rafId; }, cancelAnimationFrame(id) { pendingRaf.delete(id); } });
  } catch (e) { ranOk = false; console.log('     · ' + e.message); }
  const frame = () => { const fs = [...pendingRaf.values()]; pendingRaf.clear(); fs.forEach(f => f()); };
  return { canvas, video, document, listeners, mq, io, pendingRaf, frame, window, ranOk, av: window.MangoAvatar };
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(queueMicrotask); };

created.length = 0;
const W1 = world({ want: 'lily' });
ok(W1.ranOk, '파일을 가짜 DOM 에서 실제로 실행했다');
await flush();
const { canvas, frame, pendingRaf, av } = W1;
const vops = () => canvas.ctx.ops;
// present() 한 번 = 화면 캔버스의 clearRect 하나로 시작한다 → 그 뒤 draw 묶음을 «한 장» 으로 본다.
function lastPresent() {
  const o = vops(); let i = o.length - 1;
  while (i >= 0 && o[i].op !== 'clear') i--;
  return i < 0 ? [] : o.slice(i + 1).filter(x => x.op === 'draw');
}
const presents = () => vops().filter(x => x.op === 'clear').length;
const comp = created[0];

/* ── ⑧ 2배 comp ─────────────────────────────────────────────────────── */
console.log('\n■ ⑧ 머리 캐릭터는 comp 를 원본 해상도(2배)로 짠다');
ok(!!comp && comp.ctxOpts && comp.ctxOpts.willReadFrequently === true, '(전제) 화면 밖 캔버스(comp)를 만들었고 픽셀 읽기용으로 열었다');
ok(!(canvas.ctxOpts && canvas.ctxOpts.willReadFrequently), '화면 캔버스는 픽셀 읽기용으로 안 연다(그리기만 — 가볍게)');
ok(comp && comp.width === 640 && comp.height === 800 && comp.ctx.st.base === 2,
  `lily: comp 가 640x800 이고 320 좌표 그대로 그리도록 2배가 걸렸다 (${comp && comp.width}x${comp && comp.height} · 배율 ${comp && comp.ctx.st.base})`,
  '1배로 짜고 기울이면 얼굴이 눈에 띄게 뿌예집니다(브라우저 실측: 선명도 31~50%)');

/* ── ② 그리는 순서 ─────────────────────────────────────────────────── */
console.log('\n■ ② 그리는 순서 — 기운 경계 → 몸(source-out) → 기운 머리(lighter)');
T += 1000; frame();
let P = lastPresent();
ok(P.length === 3, `한 장에 drawImage 가 정확히 셋이다 (${P.length})`);
if (P.length === 3) {
  ok(P[0].rot !== 0 && P[0].gco === 'source-over' && P[0].src !== comp, `① 기운 경계 그림을 먼저 깐다 (기울기 ${(P[0].rot * 180 / Math.PI).toFixed(3)}°)`);
  ok(P[1].src === comp && P[1].gco === 'source-out' && P[1].rot === 0 && P[1].sy === 1, '② 몸은 «안 기운» comp 를 경계 밖에만 둔다(source-out)', '몸이 기울면 어깨가 흔들립니다');
  ok(P[2].src !== comp && P[2].src !== P[0].src && P[2].gco === 'lighter' && P[2].rot === P[0].rot && P[2].sy === P[0].sy,
    '③ 머리는 경계와 «같은» 각도로 기울여 lighter 로 더한다', '각도가 다르면 목에 반투명한 띠가 생깁니다(브라우저 실측 알파 245/255)');
  ok(P.every(d => d.a[2] === 320 && d.a[3] === 400), '세 장 다 화면 크기(320x400)로 그린다(2배 comp 를 줄여서)');
}
ok(vops().filter(x => x.op === 'draw').every(d => d.gco !== 'lighter' || d.rot !== 0), '(짝) lighter 로 더하는 것은 «기운 머리» 뿐이다');

/* ── ③ 크기 ─────────────────────────────────────────────────────────── */
console.log('\n■ ③ 크기 — 조금씩, 그러나 실제로 움직인다');
let maxRot = 0, maxNod = 0, rots = new Set();
for (let i = 0; i < 400; i++) {
  T += 100; frame();
  const p = lastPresent(); if (p.length === 3) { maxRot = Math.max(maxRot, Math.abs(p[2].rot)); maxNod = Math.max(maxNod, Math.abs(p[2].sy - 1)); rots.add(p[2].rot.toFixed(5)); }
}
const deg = maxRot * 180 / Math.PI;
ok(deg <= ROT_DEG + 1e-6, `쉬는 동안 최대 기울기 ≤ ${ROT_DEG}° (${deg.toFixed(3)}°)`);
ok(deg >= ROT_DEG * 0.5, `40초 동안 실제로 기운다 (최대 ${deg.toFixed(3)}°)`, '0 에 가까우면 «움직인다» 가 거짓말입니다');
ok(maxNod <= NOD + 1e-9 && maxNod >= NOD * 0.4, `끄덕임이 범위 안이고 실제로 있다 (최대 ${(maxNod * 100).toFixed(3)}%)`);
ok(rots.size > 100, `같은 자세가 되풀이되지 않는다 (서로 다른 각도 ${rots.size}개)`);

/* ── ④ 머리 경계 그림 ──────────────────────────────────────────────── */
console.log('\n■ ④ 머리 경계 그림 — 목 가운데·바깥');
const mask = created.find(c => c.__put && c.__put.width === 320);
ok(!!mask, '(전제) 머리 경계 그림(320 폭)을 만들었다');
if (mask && HEAD) {
  const d = mask.__put.data, h = HEAD.lily, k = 320 / h.w, px = Math.round(h.x * k);
  const a = (x, y) => d[(y * 320 + x) * 4 + 3];
  const Y1 = Math.floor(h.y1 * k), Y2 = Math.ceil(h.y2 * k);
  ok(a(px, 10) === 255 && a(px, Y1 - 1) === 255, `목 가운데: y1 위는 «머리» (알파 ${a(px, Y1 - 1)})`);
  ok(a(px, Y2 + 1) === 0 && a(px, 399) === 0, `목 가운데: y2 아래는 «몸» (알파 ${a(px, Y2 + 1)})`);
  let mono = true; for (let y = 1; y < 400; y++) if (a(px, y) > a(px, y - 1)) mono = false;
  ok(mono, '목 가운데에서 위→아래로 머리 몫이 줄기만 한다(얼룩 없음)');
  ok(a(2, Y1 + 1) === 0, `목 밖(어깨 쪽)에서는 경계가 위로 올라가 y1 바로 아래부터 «몸» 이다 (알파 ${a(2, Y1 + 1)})`, '안 올리면 기울 때 어깨선이 같이 출렁입니다');
  ok(a(px, Y1 + 1) > 200, `(짝) 목 가운데의 같은 높이는 아직 «머리» 쪽이다 (알파 ${a(px, Y1 + 1)})`);
}

/* ── ⑤ 쉬는 동안 ───────────────────────────────────────────────────── */
console.log('\n■ ⑤ 쉬는 동안 — 초당 약 20번 · 숨으면 멈춤');
let n0 = presents();
for (let i = 0; i < 60; i++) { T += 16; frame(); }
const perSec = (presents() - n0) / (60 * 16 / 1000);
ok(perSec >= 15 && perSec <= 23, `60Hz 화면에서도 초당 ${perSec.toFixed(1)}번만 다시 그린다`, '매 프레임 그리면 폰 배터리를 씁니다');
ok(pendingRaf.size === 1, `쉬는 동안 rAF 가 정확히 하나 걸려 있다 (${pendingRaf.size})`);
W1.document.hidden = true; frame();
ok(pendingRaf.size === 0, `탭이 숨으면 rAF 를 다시 걸지 않는다 (${pendingRaf.size})`);
n0 = presents(); T += 500; frame();
ok(presents() === n0, '숨은 동안에는 그리지 않는다');
W1.document.hidden = false; (W1.listeners.visibilitychange || []).forEach(f => f());
ok(pendingRaf.size === 1, `다시 보이면 다시 켜진다 (${pendingRaf.size})`);
(W1.listeners.visibilitychange || []).forEach(f => f());
ok(pendingRaf.size === 1, '여러 번 보여도 rAF 가 겹치지 않는다');
ok(!!W1.io.cb && W1.io.el === canvas, '(전제) 캔버스가 화면 안인지 지켜본다(IntersectionObserver)');
W1.io.cb([{ isIntersecting: false }]); T += 100; frame();
ok(pendingRaf.size === 0, '캔버스가 화면 밖이면 멈춘다');
W1.io.cb([{ isIntersecting: true }]);
ok(pendingRaf.size === 1, '화면 안으로 돌아오면 다시 켜진다');
canvas.isConnected = false; T += 100; frame();
ok(pendingRaf.size === 0, '캔버스가 문서에서 빠지면 멈춘다');
canvas.isConnected = true; (W1.listeners.visibilitychange || []).forEach(f => f());
W1.mq.matches = true; W1.mq.ls.forEach(f => f());
P = lastPresent();
ok(P.length === 1 && P[0].src === comp && P[0].rot === 0, '«움직임 줄이기» 를 켜면 그 자리에서 곧게 편 얼굴(comp 그대로)을 그린다');
T += 100; frame();
ok(pendingRaf.size === 0, '«움직임 줄이기» 동안은 쉬는 루프가 멈춘다');
W1.mq.matches = false; W1.mq.ls.forEach(f => f());
T += 100; frame();
P = lastPresent();
ok(pendingRaf.size === 1 && P.length === 3 && P[2].rot !== 0, '«움직임 줄이기» 를 끄면 다시 움직인다(짝)');

/* ── ⑥ 말하는 동안 ─────────────────────────────────────────────────── */
console.log('\n■ ⑥ 말하는 동안 — 루프는 하나 · 끝나면 쉬는 움직임으로');
const a = new Media();
av.attach(a); a.paused = false; a.emit('playing');
let overlap = 0, talkMax = 0; n0 = presents();
for (let i = 0; i < 300; i++) {
  T += 16; frame();
  if (pendingRaf.size !== 1) overlap++;
  const p = lastPresent(); if (p.length === 3) talkMax = Math.max(talkMax, Math.abs(p[2].rot));
}
ok(overlap === 0, `말하는 동안 rAF 가 하나뿐이다(쉬는 루프와 겹치지 않음 — 어긋난 프레임 ${overlap})`);
ok(presents() - n0 >= 290, `말하는 동안은 매 프레임 그린다 (${presents() - n0}/300)`);
ok(talkMax * 180 / Math.PI <= ROT_DEG * TALK + 1e-6, `말할 때도 최대 기울기 ≤ ${(ROT_DEG * TALK).toFixed(2)}° (${(talkMax * 180 / Math.PI).toFixed(3)}°)`);
a.paused = true; a.emit('pause');
ok(pendingRaf.size === 1, `말이 끝나면 쉬는 움직임이 다시 켜진다 (${pendingRaf.size})`);

/* ── ⑨ 전환 섞기 ───────────────────────────────────────────────────── */
console.log('\n■ ⑨ 전환 섞기 — 투명 그림은 캔버스 사본으로');
av.setCharacter('mei'); await flush();
const compOpsStart = comp.ctx.ops.length;
av.plainStart();
for (let i = 0; i < 40; i++) { T += 16; frame(); }
const cOps = comp.ctx.ops.slice(compOpsStart);
ok(cOps.filter(o => o.op === 'get').length === 0, `mei: 입 모양을 바꿔도 getImageData 를 안 부른다 (${cOps.filter(o => o.op === 'get').length}회)`,
  '2배 comp 에서 픽셀 루프를 돌리면 폰에서 프레임이 끊깁니다');
const atop = cOps.filter(o => o.op === 'draw' && o.gco === 'source-atop');
// 첫 장(경과 0)은 앞 화면 그대로(1) — 그 뒤로 줄어들어야 «섞는» 것이다.
const aSeq = atop.map(o => o.alpha);
ok(aSeq.length > 1 && aSeq.every(a => a > 0 && a <= 1) && aSeq.some(a => a < 1) && aSeq.every((a, i) => i === 0 || a < aSeq[i - 1]),
  `mei: 앞 화면을 source-atop 으로 (1-a) 만큼 얹어, 갈수록 옅게 섞는다 (${aSeq.length}회 · ${aSeq.map(a => a.toFixed(2)).join(' ')})`);
av.plainStop();

/* ── ⑦ 영상 캐릭터 ─────────────────────────────────────────────────── */
console.log('\n■ ⑦ 영상 캐릭터로 바꾸면 안 기운다');
av.setCharacter('jake_classic'); await flush();
ok(comp.width === 320 && comp.ctx.st.base === 1, `jake_classic: comp 가 1배(320)로 돌아간다 (${comp.width} · 배율 ${comp.ctx.st.base})`, '초록 지우기 픽셀 루프가 4배가 되지 않게');
T += 200; frame();
ok(pendingRaf.size === 0, 'jake_classic: 쉬는 움직임 루프가 멈춘다');
W1.video.emit('loadeddata');
P = lastPresent();
ok(P.length === 1 && P[0].src === comp && P[0].rot === 0, 'jake_classic: comp 를 기울이지 않고 그대로 옮긴다');
av.setCharacter('noah'); await flush();
T += 200; frame();
P = lastPresent();
ok(pendingRaf.size === 1 && P.length === 3 && P[2].rot !== 0 && comp.width === 640, 'noah 로 돌아오면 다시 기울고 comp 도 2배(짝)');

/* ── ⑩ 화면 밖 캔버스를 못 만들면 ───────────────────────────────────── */
console.log('\n■ ⑩ 화면 밖 캔버스를 못 만들면 예전처럼');
const W2 = world({ offscreen: false, want: 'lily' });
await flush();
ok(W2.ranOk && W2.canvas.ctxOpts && W2.canvas.ctxOpts.willReadFrequently === true, '화면 캔버스를 예전처럼(픽셀 읽기용으로) 연다');
W2.document.listeners = null; T += 6000; W2.frame();
const d2 = W2.canvas.ctx.ops.filter(o => o.op === 'draw');
ok(d2.length >= 1 && d2.every(o => o.rot === 0) && d2.some(o => /lily-closed/.test(o.src && o.src.src || '')), '얼굴을 화면에 바로 그리고 기울이지 않는다');
ok(W2.pendingRaf.size === 0, '쉬는 움직임 루프가 아예 안 돈다');

/* ── ⑪ 소스 규칙 ─────────────────────────────────────────────────────── */
console.log('\n■ ⑪ 소스 규칙');
ok(!/\bsetInterval\s*\(/.test(CODE) && intervals === 0, `상주 setInterval 이 없다 (실행 중 ${intervals}회)`);
ok(/prefers-reduced-motion:\s*reduce/.test(CODE), '«움직임 줄이기» 설정을 묻는다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
