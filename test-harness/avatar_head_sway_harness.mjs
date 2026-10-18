/* 🎭 아바타 «머리만 살짝 움직이기» (js/mango-avatar.js v13, 2026-10-18)
 *
 * 왜: 사장님 「머리도 살아있는 거처럼 조금 씩 움직이게 해줘」 — 그림 캐릭터 여섯(lily·noah·emma·mei·long·jake)
 *     의 «머리만» 목 가운데를 축으로 아주 작게 기울고(최대 약 1°) 끄덕입니다. 몸(어깨)은 그대로입니다.
 *
 * 무엇을 보는가 — «글자가 있는가» 가 아니라 파일을 가짜 DOM·가짜 캔버스·가짜 시계로 «실제로 돌려» 봅니다.
 *   ① HEAD 표: 그림 캐릭터가 다 있고, 머리 경계(y1)가 눈 칸·입 칸 «아래» 이며, 축이 눈 칸 안에 있고,
 *      원본 크기(w·h)가 실제 그림 파일과 같다 · 영상 캐릭터에는 없다
 *   ② 그리는 순서: 기운 경계 → 'source-out' 으로 몸 → 'lighter' 로 기운 머리 (몸은 안 기운다)
 *      머리 층은 «화면 크기» 로, comp 를 경계와 «같은 각도» 로 기울여 담은 뒤 같은 각도의 경계로 오린다.
 *   ③ 크기: 최대 기울기 ≤ 1°(말할 때 ≤ 1.35°) · 실제로 움직인다(짝) · 끄덕임 ≤ 0.7%
 *   ④ 머리 경계 그림: 목 가운데에서는 y1 위 = 머리, y2 아래 = 몸 · 목 밖에서는 경계가 위로 올라간다
 *   ⑤ 쉬는 동안: 초당 약 20번만 그린다 · 탭이 숨으면/화면 밖이면/움직임 줄이기면 멈추고 다시 켜진다(짝)
 *   ⑥ 말하는 동안: 그리기 루프 하나만 돈다(rAF 가 겹치지 않는다) · 말이 끝나면 쉬는 움직임으로 돌아간다
 *   ⑦ 영상 캐릭터(jake_classic — 2026-10-18 부터 jake 는 그림 캐릭터)로 바꾸면 안 기운다 · 머리 캐릭터로 돌아오면 다시 켜진다(짝)
 *   ⑧ 2배 comp: 머리 캐릭터는 comp 가 640 폭(원본 그대로) · 영상 캐릭터는 320 폭
 *      그리고 comp 가 «둘» 이다 — 그림 캐릭터는 그리기 전용(GPU), 초록 지우기 영상 캐릭터만 픽셀 읽기용.
 *      안 쓰는 쪽은 1x1 로 비운다(메모리).
 *   ⑨ 전환 섞기: 투명 그림 캐릭터는 캔버스 사본으로 섞는다(getImageData 픽셀 루프 없이)
 *   ⑩ 화면 밖 캔버스를 못 만들면: 예전처럼 화면에 바로 그리고 안 기운다(실패해도 얼굴은 그대로)
 *   ⑪ 상주 setInterval 이 없다
 *   ⑫ 그림 미리 올리기: 입모양 그림을 다 받으면 «말할 때 쓰는 그 comp» 에 알파 1/255 로 한 번 그리고 곧바로
 *      화면에 옮긴다(GPU 업로드를 말 첫마디가 아니라 지금 한다) · prepare() 는 두 프레임 뒤에 끝난다 ·
 *      숨은 탭(rAF 없음)에서도 300ms 타이머로 끝난다(짝) · 화면 밖 캔버스가 없으면 아무것도 안 한다
 *   ⑬ 입모양 그림 경로: 말 첫 장만 통째로, 그 뒤는 «입 칸·눈 칸» 만 지우고 줄여 둔 바탕 사본에서 같은 자리로
 *      1:1 옮긴 뒤 입을 그린다 · 그 경로에서는 전환 섞기 사본을 안 뜬다(mei 는 뜬다 — 짝) ·
 *      캐릭터가 바뀌면 다시 통째로 · 안 쓰는 사본은 1x1 로 비운다
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
let T = 1_000_000, intervals = 0, SEQ = 0;
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
    clearRect(...a) { ctx.ops.push({ op: 'clear', a, base: st.base, seq: ++SEQ }); },
    drawImage(im, ...a) { ctx.ops.push({ op: 'draw', src: im, a, gco: st.gco, rot: st.rot, sy: st.sy, alpha: st.alpha, base: st.base, seq: ++SEQ }); },
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
// ⑬ 이 «그림이 늦게 도착» 하는 경우를 만들려고 쓴다 — 고른 그림 n 장의 onload 를 붙잡아 두었다가 나중에 부른다.
const HOLD = { re: null, n: 0, size: null, list: [] };
class Image {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) {
    this._src = v;
    const fire = (size) => {
      const emma = /emma-v2/.test(v);
      this.complete = true; this.naturalWidth = size ? size[0] : emma ? 512 : 640; this.naturalHeight = size ? size[1] : emma ? 640 : 800; this.onload && this.onload();
    };
    if (HOLD.re && HOLD.n > 0 && HOLD.re.test(v)) { HOLD.n--; const size = HOLD.size; HOLD.list.push(() => fire(size)); return; }
    queueMicrotask(() => fire(null));
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

function world({ offscreen = true, want = 'lily', visemes = null } = {}) {
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
  if (visemes) window.AvatarVisemes = visemes;
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
// 가짜 시계를 ms 만큼 돌린다 — 그 사이 때가 된 타이머를 순서대로 부르고, 걸린 rAF 를 한 번 돌린다.
// 쉬는 루프는 «그린 뒤 타이머로 기다렸다가 rAF 를 한 번» 이라 타이머를 안 돌리면 멈춘 것처럼 보인다.
let wakes = 0;
const isSwayTimer = t => /swayTick/.test(String(t.fn));
// rAF 중 «그리기 루프(loop)» 와 «쉬는 루프(swayTick)» 만 센다 — 그림 준비 대기(warmFace)의 두 프레임 rAF 는 그리지 않는다.
const isLoopRaf = f => f && (f.name === 'swayTick' || f.name === 'loop');
const loopRafs = () => [...pendingRaf.values()].filter(isLoopRaf).length;
const swayPending = () => [...pendingRaf.values()].filter(f => f && f.name === 'swayTick').length + timers.filter(isSwayTimer).length;
function tick(ms) {
  T += ms;
  for (;;) {
    timers.sort((x, y) => x.at - y.at || x.id - y.id);
    const t = timers[0]; if (!t || t.at > T) break;
    timers.shift(); try { t.fn(); } catch { /* 모듈 안 예외는 다른 절이 잡는다 */ }
  }
  wakes += pendingRaf.size; frame();
}
const vops = () => canvas.ctx.ops;
// present() 한 번 = 화면 캔버스의 clearRect 하나로 시작한다 → 그 뒤 draw 묶음을 «한 장» 으로 본다.
function lastPresent() {
  const o = vops(); let i = o.length - 1;
  while (i >= 0 && o[i].op !== 'clear') i--;
  return i < 0 ? [] : o.slice(i + 1).filter(x => x.op === 'draw');
}
const presents = () => vops().filter(x => x.op === 'clear').length;
// 화면 밖 comp 는 둘이다 — created[0] = 픽셀 읽기용(초록 지우기 영상 캐릭터), created[1] = 그리기 전용(그림 캐릭터).
const compR = created[0], compG = created[1];
let comp = compG;   // 지금(lily) 쓰는 쪽 — 그림 캐릭터라 그리기 전용

/* ── ⑧ 2배 comp ─────────────────────────────────────────────────────── */
console.log('\n■ ⑧ 머리 캐릭터는 comp 를 원본 해상도(2배)로 짠다');
ok(!!compR && !!compG && compR !== compG, `(전제) 화면 밖 comp 를 둘 만들었다 (${created.length}개 중 앞 둘)`);
ok(!!compR && compR.ctxOpts && compR.ctxOpts.willReadFrequently === true, '초록 지우기용 comp 는 픽셀 읽기용으로 연다(getImageData 를 매 프레임 부른다)');
ok(!!compG && !(compG.ctxOpts && compG.ctxOpts.willReadFrequently), '그림 캐릭터용 comp 는 그리기 전용으로 연다 — 픽셀 읽기용이면 화면으로 옮길 때마다 올려 보내야 해 말하는 동안 프레임이 줄어듭니다',
  '실측(CPU 4배 제한·2초 말하기): 그림 캐릭터 comp 를 픽셀 읽기용으로 두면 프레임 76~77 · 그리기 전용이면 83~91 (원본 90~93) — 입모양 검사가 짧은 G 를 놓쳤습니다');
ok(!!compR && compR.width === 1 && compR.height === 1, `그림 캐릭터일 때 안 쓰는 픽셀 읽기용 comp 는 1x1 로 비운다 (${compR && compR.width}x${compR && compR.height})`, '두 장을 다 들고 있으면 메모리만 씁니다');
ok(!(canvas.ctxOpts && canvas.ctxOpts.willReadFrequently), '화면 캔버스는 픽셀 읽기용으로 안 연다(그리기만 — 가볍게)');
ok(comp && comp.width === 640 && comp.height === 800 && comp.ctx.st.base === 2,
  `lily: comp 가 640x800 이고 320 좌표 그대로 그리도록 2배가 걸렸다 (${comp && comp.width}x${comp && comp.height} · 배율 ${comp && comp.ctx.st.base})`,
  '1배로 짜고 기울이면 얼굴이 눈에 띄게 뿌예집니다(브라우저 실측: 선명도 31~50%)');

/* ── ② 그리는 순서 ─────────────────────────────────────────────────── */
console.log('\n■ ② 그리는 순서 — 기운 경계 → 몸(source-out) → 기운 머리(lighter)');
T += 1000; frame();
let P = lastPresent();
// 머리 층(head) 을 «한 장» 만들 때의 그리기 — 마지막 clear 뒤의 draw 묶음.
function headBuild(cv) {
  const o = (cv && cv.ctx.ops) || []; let i = o.length - 1;
  while (i >= 0 && o[i].op !== 'clear') i--;
  return i < 0 ? [] : o.slice(i + 1).filter(x => x.op === 'draw');
}
const headCv = P.length === 3 ? P[2].src : null;
ok(P.length === 3, `한 장에 drawImage 가 정확히 셋이다 (${P.length})`);
if (P.length === 3) {
  ok(P[0].rot !== 0 && P[0].gco === 'source-over' && P[0].src !== comp, `① 기운 경계 그림을 먼저 깐다 (기울기 ${(P[0].rot * 180 / Math.PI).toFixed(3)}°)`);
  ok(P[1].src === comp && P[1].gco === 'source-out' && P[1].rot === 0 && P[1].sy === 1, '② 몸은 «안 기운» comp 를 경계 밖에만 둔다(source-out)', '몸이 기울면 어깨가 흔들립니다');
  ok(P[2].src !== comp && P[2].src !== P[0].src && P[2].gco === 'lighter' && P[2].rot === 0 && P[2].sy === 1,
    '③ 화면에는 «이미 기울여 오린» 머리 층을 그대로(안 기울이고) lighter 로 더한다', '여기서 또 기울이면 머리가 두 번 기웁니다');
  ok(P.every(d => d.a[2] === 320 && d.a[3] === 400), '세 장 다 화면 크기(320x400)로 그린다(2배 comp 를 줄여서)');
  const HB = headBuild(headCv);
  ok(HB.length === 2, `(전제) 머리 층을 한 장 만들 때 drawImage 가 둘이다 — comp 담기 + 경계로 오리기 (${HB.length})`);
  if (HB.length === 2) {
    ok(HB[0].src === comp && HB[0].gco === 'source-over' && HB[0].rot === P[0].rot && HB[0].sy === P[0].sy,
      '③-1 머리 층에 comp 를 경계와 «같은» 각도로 기울여 담는다', '각도가 다르면 목에 반투명한 띠가 생깁니다(브라우저 실측 알파 245/255)');
    ok(HB[1].src === P[0].src && HB[1].gco === 'destination-in' && HB[1].rot === P[0].rot && HB[1].sy === P[0].sy,
      '③-2 같은 각도의 경계 그림으로 오린다(destination-in) — 머리 몫만 남는다');
    ok(HB.every(d => d.a[2] === 320 && d.a[3] === 400), '③-3 머리 층도 화면 크기(320x400)로 담는다 — 2배 comp 를 기울이면서 «한 번» 줄인다');
  }
  ok(!!headCv && headCv.width === 320 && headCv.height === 400, `머리 층 캔버스는 화면 크기다 (${headCv && headCv.width}x${headCv && headCv.height})`,
    '2배(640x800)로 들고 있으면 말하는 동안 프레임마다 2배 크기 그리기가 늘어 짧은 입모양을 놓칩니다');
}
ok(vops().filter(x => x.op === 'draw' && x.gco === 'lighter').every(d => d.src === headCv),
  '(짝) 화면에 lighter 로 더하는 것은 «머리 층» 뿐이다');
ok(headCv && headCv.ctx.ops.filter(x => x.op === 'draw' && x.src === comp).every(d => d.rot !== 0),
  '(짝) 머리 층에 담는 comp 는 언제나 기울어 있다');

/* ── ③ 크기 ─────────────────────────────────────────────────────────── */
console.log('\n■ ③ 크기 — 조금씩, 그러나 실제로 움직인다');
let maxRot = 0, maxNod = 0, rots = new Set();
for (let i = 0; i < 400; i++) {
  tick(100);
  const p = lastPresent(); if (p.length === 3) { maxRot = Math.max(maxRot, Math.abs(p[0].rot)); maxNod = Math.max(maxNod, Math.abs(p[0].sy - 1)); rots.add(p[0].rot.toFixed(5)); }
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
let n0 = presents(), w0 = wakes;
const STEPS = 188;                                   // 16ms × 188 ≈ 3초 — 깜빡임 한 번이 끼어도 평균이 흔들리지 않게
for (let i = 0; i < STEPS; i++) tick(16);
const perSec = (presents() - n0) / (STEPS * 16 / 1000), wakeSec = (wakes - w0) / (STEPS * 16 / 1000);
ok(perSec >= 15 && perSec <= 23, `60Hz 화면에서도 초당 ${perSec.toFixed(1)}번만 다시 그린다`, '매 프레임 그리면 폰 배터리를 씁니다');
ok(wakeSec <= 23, `rAF 로 깨어나는 것도 초당 ${wakeSec.toFixed(1)}번뿐이다(그릴 때만)`, 'rAF 를 매 프레임 다시 걸면 그리지 않는 프레임에도 폰이 깨어납니다(초당 60번)');
ok(swayPending() === 1, `쉬는 루프가 정확히 하나 걸려 있다 — rAF 또는 다음 그림 타이머 (${swayPending()})`);
W1.document.hidden = true; tick(100); tick(100);
ok(swayPending() === 0, `탭이 숨으면 rAF·타이머를 다시 걸지 않는다 (${swayPending()})`);
n0 = presents(); tick(500);
ok(presents() === n0, '숨은 동안에는 그리지 않는다');
W1.document.hidden = false; (W1.listeners.visibilitychange || []).forEach(f => f());
ok(swayPending() === 1, `다시 보이면 다시 켜진다 (${swayPending()})`);
(W1.listeners.visibilitychange || []).forEach(f => f());
ok(swayPending() === 1, '여러 번 보여도 쉬는 루프가 겹치지 않는다');
tick(16); tick(16); (W1.listeners.visibilitychange || []).forEach(f => f());
ok(swayPending() === 1, '(짝) 타이머로 기다리는 동안 다시 깨워도 겹치지 않는다');
ok(!!W1.io.cb && W1.io.el === canvas, '(전제) 캔버스가 화면 안인지 지켜본다(IntersectionObserver)');
W1.io.cb([{ isIntersecting: false }]); tick(100); tick(100);
ok(swayPending() === 0, '캔버스가 화면 밖이면 멈춘다');
W1.io.cb([{ isIntersecting: true }]);
ok(swayPending() === 1, '화면 안으로 돌아오면 다시 켜진다');
canvas.isConnected = false; tick(100); tick(100);
ok(swayPending() === 0, '캔버스가 문서에서 빠지면 멈춘다');
canvas.isConnected = true; (W1.listeners.visibilitychange || []).forEach(f => f());
W1.mq.matches = true; W1.mq.ls.forEach(f => f());
P = lastPresent();
ok(P.length === 1 && P[0].src === comp && P[0].rot === 0, '«움직임 줄이기» 를 켜면 그 자리에서 곧게 편 얼굴(comp 그대로)을 그린다');
tick(100); tick(100);
ok(swayPending() === 0, '«움직임 줄이기» 동안은 쉬는 루프가 멈춘다');
W1.mq.matches = false; W1.mq.ls.forEach(f => f());
tick(100);
P = lastPresent();
ok(swayPending() === 1 && P.length === 3 && P[0].rot !== 0, '«움직임 줄이기» 를 끄면 다시 움직인다(짝)');

/* ── ⑥ 말하는 동안 ─────────────────────────────────────────────────── */
console.log('\n■ ⑥ 말하는 동안 — 루프는 하나 · 끝나면 쉬는 움직임으로');
const a = new Media();
av.attach(a); a.paused = false; a.emit('playing');
let overlap = 0, talkMax = 0, swayTimersInTalk = 0; n0 = presents(); const wt0 = wakes;
for (let i = 0; i < 300; i++) {
  tick(16);
  if (loopRafs() !== 1) overlap++;
  if (i > 10) swayTimersInTalk += timers.filter(isSwayTimer).length;
  const p = lastPresent(); if (p.length === 3) talkMax = Math.max(talkMax, Math.abs(p[0].rot));
}
ok(overlap === 0, `말하는 동안 rAF 가 하나뿐이다(쉬는 루프와 겹치지 않음 — 어긋난 프레임 ${overlap})`);
ok(presents() - n0 >= 290, `말하는 동안은 매 프레임 그린다 (${presents() - n0}/300)`);
ok(presents() - n0 <= 302 && wakes - wt0 <= 302, `말하는 동안 쉬는 루프가 따로 그리거나 깨우지 않는다 — 한 프레임에 한 장 (그림 ${presents() - n0} · 깨움 ${wakes - wt0} / 300)`,
  '두 루프가 함께 돌면 같은 프레임에 두 번 그리고 폰이 두 배로 깨어납니다');
ok(swayTimersInTalk === 0, `말하는 동안 쉬는 루프 타이머가 남아 있지 않다 (${swayTimersInTalk})`);
ok(talkMax * 180 / Math.PI <= ROT_DEG * TALK + 1e-6, `말할 때도 최대 기울기 ≤ ${(ROT_DEG * TALK).toFixed(2)}° (${(talkMax * 180 / Math.PI).toFixed(3)}°)`);
a.paused = true; a.emit('pause');
tick(16);
ok(swayPending() === 1, `말이 끝나면 쉬는 움직임이 다시 켜진다 (${swayPending()})`);

/* ── ⑨ 전환 섞기 ───────────────────────────────────────────────────── */
console.log('\n■ ⑨ 전환 섞기 — 투명 그림은 캔버스 사본으로');
av.setCharacter('mei'); await flush();
const compOpsStart = comp.ctx.ops.length;
av.plainStart();
for (let i = 0; i < 40; i++) tick(16);
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
comp = compR;   // 초록 지우기 영상 캐릭터 → 픽셀 읽기용 comp
ok(comp.width === 320 && comp.ctx.st.base === 1, `jake_classic: 픽셀 읽기용 comp 가 1배(320)로 쓰인다 (${comp.width} · 배율 ${comp.ctx.st.base})`, '초록 지우기 픽셀 루프가 4배가 되지 않게');
ok(compG.width === 1 && compG.height === 1, `jake_classic: 안 쓰는 그림용 comp 는 1x1 로 비운다 (${compG.width}x${compG.height})`);
tick(200); tick(200);
ok(swayPending() === 0, 'jake_classic: 쉬는 움직임 루프가 멈춘다');
W1.video.emit('loadeddata');
P = lastPresent();
ok(P.length === 1 && P[0].src === comp && P[0].rot === 0, 'jake_classic: comp 를 기울이지 않고 그대로 옮긴다');
av.setCharacter('noah'); await flush();
comp = compG;
tick(200);
P = lastPresent();
ok(swayPending() === 1 && P.length === 3 && P[0].rot !== 0 && P[1].src === compG && compG.width === 640 && compR.width === 1,
  `noah 로 돌아오면 다시 기울고 그림용 comp 가 2배 · 픽셀 읽기용은 다시 비운다(짝) (그림용 ${compG.width} · 픽셀용 ${compR.width})`);

/* ── ⑩ 화면 밖 캔버스를 못 만들면 ───────────────────────────────────── */
console.log('\n■ ⑩ 화면 밖 캔버스를 못 만들면 예전처럼');
W1.document.hidden = true; tick(200); tick(200);   // W1 을 재워 둔다 — 타이머 줄을 같이 쓰므로
const W2 = world({ offscreen: false, want: 'lily' });
await flush();
ok(W2.ranOk && W2.canvas.ctxOpts && W2.canvas.ctxOpts.willReadFrequently === true, '화면 캔버스를 예전처럼(픽셀 읽기용으로) 연다');
W2.document.listeners = null; T += 6000; W2.frame();
const d2 = W2.canvas.ctx.ops.filter(o => o.op === 'draw');
ok(d2.length >= 1 && d2.every(o => o.rot === 0) && d2.some(o => /lily-closed/.test(o.src && o.src.src || '')), '얼굴을 화면에 바로 그리고 기울이지 않는다');
ok(W2.pendingRaf.size === 0 && timers.filter(isSwayTimer).length === 0, '쉬는 움직임 루프(rAF·타이머)가 아예 안 돈다');
{
  const pr = W2.av.prepare(new Media()); let done = false; pr.then(() => { done = true; });
  await flush();
  ok(done, `화면 밖 캔버스가 없으면 그림 미리 올리기도 안 하고 prepare 가 바로 끝난다 (${done})`, '예전 동작 그대로 — 기다릴 이유가 없습니다');
}

/* ── ⑫ 그림 미리 올리기 ─────────────────────────────────────────────── */
console.log('\n■ ⑫ 입모양 그림을 말하기 «전에» 그 comp 로 올려 둔다');
{
  // W1(lily) 부팅 때 이미 한 번 돌았다 — 그림용 comp 에 남은 «알파 1/255» 그리기를 본다.
  const warm = compG.ctx.ops.filter(o => o.op === 'draw' && o.alpha > 0 && o.alpha < 0.01);
  const names = warm.map(o => String(o.src && o.src.src || '').replace(/^.*\//, '').split('?')[0]);
  ok(['lily-closed.webp', 'lily-mouths.webp', 'lily-transitions.webp'].every(n => names.includes(n)),
    `lily: 바탕·입모양·전환 그림 셋을 그림용 comp 에 한 번씩 그린다 (${names.join(', ')})`,
    '말할 때 쓰는 그 comp 에 그려야 GPU 로 올라갑니다 — 1x1 같은 작은 캔버스(크롬은 128x129 미만을 GPU 로 안 그림)나 다른 캔버스로는 효과가 없었습니다');
  ok(warm.every(o => o.a.length === 8 && o.a[2] === 1 && o.a[3] === 1 && o.a[6] === 1 && o.a[7] === 1),
    '1픽셀만 그린다(1x1 → 1x1) — 큰 그림을 통째로 다시 그리는 비용을 안 쓴다');
  ok(warm.length > 0 && warm.every(o => o.alpha <= 1 / 255 + 1e-9), `눈에 안 보이는 알파로 그린다 (최대 ${Math.max(0, ...warm.map(o => o.alpha)).toFixed(4)})`,
    '알파 1이면 그 한 점이 얼굴 위에 남습니다');
  const lastWarm = Math.max(0, ...warm.map(o => o.seq));
  const vAfter = canvas.ctx.ops.find(o => o.op === 'clear' && o.seq > lastWarm);
  const gClear = compG.ctx.ops.find(o => o.op === 'clear' && o.seq > lastWarm);
  ok(!!vAfter && vAfter.seq === lastWarm + 1 && (!gClear || vAfter.seq < gClear.seq), `그린 «곧바로» comp 를 화면에 옮긴다 — 그래야 다음 «전체 지우기» 전에 그 그리기가 실제로 실행된다 (그리기 ${lastWarm} → 화면 ${vAfter ? vAfter.seq : '없음'})`,
    '안 옮기면 다음 composeFrame 의 clearRect 가 아직 실행 안 된 그리기를 버릴 수 있습니다');
  ok(compG.ctx.st.alpha === 1, `그린 뒤 알파를 1로 되돌린다 (${compG.ctx.st.alpha})`, '안 되돌리면 얼굴이 통째로 투명해집니다');

  // 새 세계(noah)에서 prepare() 가 «두 프레임 뒤» 에 끝나는지.
  W1.document.hidden = true; tick(200);
  const c0 = created.length;
  const W3 = world({ want: 'noah' });
  const g3 = created[c0 + 1];
  await flush();
  const pr3 = W3.av.prepare(new Media()); let d3 = false; pr3.then(() => { d3 = true; });
  await flush();
  ok(!d3, '그림을 받은 직후에는 prepare 가 아직 안 끝난다(올리는 중)');
  // 프레임·타이머가 하나도 안 돈 지금 — 화면 옮기기는 미리 올리기 «자신» 이 한 것뿐이다.
  const warm3 = g3 ? g3.ctx.ops.filter(o => o.op === 'draw' && o.alpha > 0 && o.alpha < 0.01) : [];
  const last3 = Math.max(0, ...warm3.map(o => o.seq));
  const v3 = W3.canvas.ctx.ops.find(o => o.op === 'clear' && o.seq > last3);
  ok(warm3.length >= 3 && !!v3, `noah: 프레임이 돌기 전에도 미리 올린 뒤 화면에 한 번 옮긴다 (그리기 ${warm3.length}개 · 화면 ${v3 ? v3.seq : '없음'})`,
    '옮기지 않으면 그 그리기가 다음 전체 지우기에 버려져 GPU 에 안 올라갑니다');
  W3.frame(); await flush();
  ok(!d3, '한 프레임 뒤에도 아직이다');
  W3.frame(); await flush();
  ok(d3, '두 프레임 뒤에 prepare 가 끝난다 — 말 첫마디보다 업로드가 먼저다');
  // 숨은 탭: rAF 가 안 돈다 → 타이머가 넘긴다(짝).
  const W4 = world({ want: 'emma' });
  await flush();
  const pr4 = W4.av.prepare(new Media()); let d4 = false; pr4.then(() => { d4 = true; });
  await flush();
  tick(299); await flush();
  const early4 = d4;
  W4.pendingRaf.clear();   // 숨은 탭 흉내 — rAF 는 영영 안 온다
  tick(2); await flush();
  ok(!early4 && d4, `rAF 가 안 도는 숨은 탭에서도 300ms 뒤 prepare 가 끝난다 (299ms ${early4} → 301ms ${d4})`,
    '타이머가 없으면 숨은 탭에서 prepare 가 영영 안 끝나 말을 못 합니다');
}

/* ── ⑬ 입모양 그림 경로 — 바뀌는 칸만 다시 그린다 ─────────────────────── */
console.log('\n■ ⑬ 입모양 그림 경로 — 바뀌는 칸(입·눈)만, 줄여 둔 바탕 사본에서 1:1 로');
{
  // 입모양 표(cues)가 있어야 이 경로가 돈다 — 가짜 AvatarVisemes 로 열어 둔다(입모양은 시계로 바뀐다).
  const POSES = ['A', 'D', 'F', 'C', 'B', 'E'];
  const visemes = { prepare: () => Promise.resolve([{ start: 0, end: 99, value: 'A' }]), at: () => POSES[Math.floor(T / 120) % POSES.length] };
  const c0 = created.length;
  const W5 = world({ want: 'lily', visemes });
  const g5 = created[c0 + 1];
  const tickW = (W, ms) => {
    T += ms;
    for (;;) {
      timers.sort((x, y) => x.at - y.at || x.id - y.id);
      const t = timers[0]; if (!t || t.at > T) break;
      timers.shift(); try { t.fn(); } catch { /* 다른 절이 잡는다 */ }
    }
    W.frame();
  };
  const nameOf = im => String(im && im.src || '').replace(/^.*\//, '').split('?')[0];
  const isBaseBuild = (o, file) => o.op === 'draw' && nameOf(o.src) === file && o.a.length === 8 && o.a[6] === 640 && o.a[7] === 800;
  const findBase = file => created.slice(c0).find(c => c !== g5 && c.ctx.ops.some(o => isBaseBuild(o, file)));
  const speak = async (av, a, frames) => {
    const from = g5.ctx.ops.length;
    a.paused = false; a.emit('playing');
    for (let i = 0; i < frames; i++) tickW(W5, 16);
    a.paused = true; a.emit('pause'); tickW(W5, 16);
    return g5.ctx.ops.slice(from);
  };
  const prep = async (av, a) => { const p = av.prepare(a); await flush(); W5.frame(); await flush(); W5.frame(); await flush(); await p; };
  await flush();
  ok(W5.ranOk && !!g5, '(전제) 입모양 표가 있는 세계를 띄웠다');
  const a5 = new Media(); a5.src = '/lesson-a.mp3';
  await prep(W5.av, a5);
  const baseCv = findBase('lily-closed.webp');
  ok(!!baseCv && baseCv.width === 640 && baseCv.height === 800, `lily: 줄인 얼굴 바탕 사본을 «말하기 전» 에 comp 크기로 만든다 (${baseCv ? baseCv.width + 'x' + baseCv.height : '없음'})`,
    '말 첫마디에 만들면 그 프레임이 밀려 짧은 입모양을 놓칩니다');
  ok(!!baseCv && g5.ctx.ops.some(o => o.op === 'draw' && o.src === baseCv && o.alpha > 0 && o.alpha < 0.01 && o.a[2] === 1),
    '그 사본도 미리 올리기 때 comp 에 1픽셀로 한 번 옮겨 둔다');

  const ops = await speak(W5.av, a5, 60);
  const whole = ops.filter(o => o.op === 'clear' && o.base === 2 && o.a[0] === 0 && o.a[1] === 0 && o.a[2] === 320 && o.a[3] === 400);
  const boxClear = ops.filter(o => o.op === 'clear' && o.base === 1);
  const restore = ops.filter(o => o.op === 'draw' && o.src === baseCv && o.base === 1);
  const mouths = ops.filter(o => o.op === 'draw' && nameOf(o.src) === 'lily-mouths.webp');
  ok(mouths.length >= 55, `(전제) 말하는 동안 입모양을 프레임마다 그렸다 (${mouths.length}/60)`, '이 경로가 안 돌면 아래 검사가 아무것도 안 잽니다');
  ok(whole.length === 1, `통째로 지우고 그리는 것은 말 첫 장 한 번뿐이다 (통째 지우기 ${whole.length}회 / ${mouths.length}장)`,
    '매 프레임 2배 얼굴 전체를 다시 그리면 재생을 다시 시작하는 순간 메인 스레드가 멈춰(헤드리스 실측) 1.3배속의 짧은 입모양을 놓쳤습니다');
  ok(ops.some(o => o.op === 'draw' && o.src === baseCv && o.base === 2 && o.a.length === 4 && o.a[2] === 320 && o.a[3] === 400),
    '(짝) 그 첫 장은 사본을 통째로(320 좌표 × 2배 = 장치 픽셀 1:1) 깐다');
  const EY = EYES && EYES.lily;
  ok(restore.length >= 2 * (mouths.length - 1) && restore.length === boxClear.length,
    `그 뒤 장마다 «입 칸·눈 칸» 둘만 지우고 다시 깐다 (다시 깔기 ${restore.length} · 칸 지우기 ${boxClear.length} · 장 ${mouths.length - 1})`);
  ok(restore.every(o => o.a.length === 8 && o.a.every(Number.isInteger) && o.a[0] === o.a[4] && o.a[1] === o.a[5] && o.a[2] === o.a[6] && o.a[3] === o.a[7]),
    '다시 깔기는 장치 픽셀 정수 사각형을 «같은 자리» 로 1:1 옮긴다(원본을 다시 줄여 그리지 않는다)',
    '잘린 칸에 원본을 다시 줄여 그리면 배율이 정수가 아닌 얼굴(emma·jake)은 칸 안이 몇 단계(실측 최대 5/255) 달라집니다');
  ok(boxClear.every((c, i) => restore[i] && c.a.join() === restore[i].a.slice(4).join() && c.seq < restore[i].seq),
    '칸마다 «그 칸을 지운 뒤» 그 칸만 다시 깐다');
  // 장 단위로 끊어 본다 — 입을 그린 자리에서 끊는다.
  let bad = 0, order = 0, eyeMiss = 0, thin = 0, last = -1;
  for (const m of mouths) {
    const seg = ops.filter(o => o.seq > last && o.seq < m.seq); last = m.seq;
    const rs = seg.filter(o => o.op === 'draw' && o.src === baseCv && o.base === 1);
    if (!rs.length) continue;                                   // 첫 장(통째)
    const d = m.a.slice(4).map(v => v * 2);                      // 입 그림이 놓인 자리(장치 픽셀)
    const inside = rs.some(r => d[0] >= r.a[4] && d[1] >= r.a[5] && d[0] + d[2] <= r.a[4] + r.a[6] && d[1] + d[3] <= r.a[5] + r.a[7]);
    if (!inside) bad++;
    // 칸은 입 그림보다 사방 2px 넉넉해야 한다 — 딱 맞으면 반올림·부드럽게 그리기 가장자리가 앞 프레임에 남는다.
    if (!rs.some(r => d[0] - r.a[4] >= 2 && d[1] - r.a[5] >= 2 && r.a[4] + r.a[6] - (d[0] + d[2]) >= 2 && r.a[5] + r.a[7] - (d[1] + d[3]) >= 2)) thin++;
    if (!(m.base === 2 && rs.every(r => r.seq < m.seq))) order++;
    if (EY && rs.length !== 2) eyeMiss++;
  }
  ok(bad === 0, `입 그림은 언제나 «다시 깐 칸» 안에 놓인다 (어긋난 장 ${bad})`, '칸 밖으로 나가면 앞 프레임 입이 겹쳐 남습니다');
  ok(thin === 0, `다시 깐 칸은 입 그림보다 사방 2px 이상 넉넉하다 (모자란 장 ${thin})`,
    '칸이 딱 맞으면 부드럽게 그린 입 가장자리 1px 이 다음 프레임에 지워지지 않고 남습니다');
  ok(order === 0, `입은 다시 깐 «뒤» 에, 320 좌표(2배)로 그린다 — 통째로 그릴 때와 같은 상태 (어긋난 장 ${order})`,
    '잘라 둔 채(clip) 입을 그리면 emma 처럼 칸 안이 1~2/255 달라졌습니다(브라우저 실측)');
  ok(!EY || eyeMiss === 0, `눈 칸도 장마다 함께 다시 깐다 — 깜빡임 뒤 눈이 남지 않게 (빠진 장 ${eyeMiss})`);
  const fadeSnaps = created.slice(c0).filter(c => c.ctx.ops.some(o => o.op === 'draw' && o.src === g5 && o.a.length === 2));
  ok(fadeSnaps.length === 0, `입모양 그림 경로에서는 전환 섞기 사본(comp 통째 사본)을 안 뜬다 (${fadeSnaps.length}장)`,
    '이 경로는 섞기를 안 쓰는데 입 단계가 바뀔 때마다 2배 comp 를 통째로 베끼고 있었습니다');

  // 캐릭터가 바뀌면 다음 첫 장은 다시 통째로 · 사본도 그 얼굴로 다시 만든다.
  W5.av.setCharacter('emma'); await flush();
  const a6 = new Media(); a6.src = '/lesson-b.mp3';
  await prep(W5.av, a6);
  const opsE = await speak(W5.av, a6, 30);
  const wholeE = opsE.filter(o => o.op === 'clear' && o.base === 2 && o.a[2] === 320 && o.a[3] === 400);
  const baseE = findBase('emma-v2-rest.webp');
  ok(baseE === baseCv, `emma: 같은 사본 캔버스를 다시 쓰고(새로 안 만든다) emma 얼굴로 다시 그린다`);
  ok(wholeE.length === 1 && opsE.filter(o => o.op === 'draw' && o.src === baseCv && o.base === 1).length >= 2 * 28,
    `emma: 첫 장만 통째로, 그 뒤는 칸만 (통째 ${wholeE.length} · 칸 다시 깔기 ${opsE.filter(o => o.op === 'draw' && o.src === baseCv && o.base === 1).length})`,
    '앞 캐릭터 얼굴이 칸 밖에 남으면 두 얼굴이 섞입니다');

  // 입모양 그림이 없는 캐릭터(mei) — 섞기를 쓰고(짝), 바탕 사본은 비운다(메모리).
  W5.av.setCharacter('mei'); await flush();
  const a7 = new Media(); a7.src = '/lesson-c.mp3';
  await prep(W5.av, a7);
  await speak(W5.av, a7, 30);
  const fadeCv = created.slice(c0).find(c => c.ctx.ops.some(o => o.op === 'draw' && o.src === g5 && o.a.length === 2));
  ok(!!fadeCv, '(짝) mei 는 입 단계가 바뀔 때 전환 섞기 사본을 뜬다 — 건너뛰기는 입모양 그림 경로에서만');
  ok(!!baseCv && baseCv.width === 1 && baseCv.height === 1, `mei: 안 쓰는 바탕 사본은 1x1 로 비운다 (${baseCv ? baseCv.width + 'x' + baseCv.height : '없음'})`, '들고 있으면 2MB 를 그냥 씁니다');
  W5.av.setCharacter('lily'); await flush();
  const a8 = new Media(); a8.src = '/lesson-d.mp3';
  await prep(W5.av, a8);
  await speak(W5.av, a8, 10);
  ok(!!fadeCv && fadeCv.width === 1 && fadeCv.height === 1 && !!baseCv && baseCv.width === 640,
    `lily 로 돌아오면 섞기 사본은 비우고 바탕 사본을 다시 채운다 (섞기 ${fadeCv && fadeCv.width}x${fadeCv && fadeCv.height} · 바탕 ${baseCv && baseCv.width})`,
    '두 사본을 함께 들고 있으면 메모리가 2MB 늘어납니다');

  // 말하는 도중 «쉬는 얼굴» 그림이 늦게 도착하면 카드 크기를 다시 맞춘다(setAspect) — 그때 comp 가 지워진다.
  // 같은 크기여도 지워지므로 다음 한 장은 반드시 통째로 다시 그려야 한다(칸만 깔면 얼굴이 빈다).
  const lateSpeak = async (name, file, size, label) => {
    HOLD.re = new RegExp(file); HOLD.n = 1; HOLD.size = size; HOLD.list.length = 0;
    W5.av.setCharacter(name); await flush();
    const held = HOLD.list.length;
    HOLD.re = null; HOLD.n = 0;
    const a = new Media(); a.src = '/lesson-' + name + '.mp3';
    await prep(W5.av, a);
    a.paused = false; a.emit('playing');
    for (let i = 0; i < 12; i++) tickW(W5, 16);
    const from = g5.ctx.ops.length;
    const fire = HOLD.list.shift(); if (fire) fire();
    for (let i = 0; i < 12; i++) tickW(W5, 16);
    const after = g5.ctx.ops.slice(from);
    a.paused = true; a.emit('pause'); tickW(W5, 16);
    const h = W5.canvas.height;
    const wholeN = after.filter(o => o.op === 'clear' && o.base === 2 && o.a[0] === 0 && o.a[1] === 0 && o.a[2] === 320 && o.a[3] === h).length;
    const mouthN = after.filter(o => o.op === 'draw' && nameOf(o.src) === name + '-mouths.webp').length;
    ok(held === 1 && mouthN >= 10, `(전제) ${label}: 쉬는 얼굴 그림을 붙잡아 두고 말하는 도중에 도착시켰다 (붙잡음 ${held} · 그 뒤 입 ${mouthN}장)`);
    return { after, wholeN, h };
  };
  const L1 = await lateSpeak('noah', 'noah-closed', null, 'noah 같은 크기');
  ok(L1.h === 400 && L1.wholeN === 1, `말하는 도중 카드 크기를 다시 맞추면(같은 크기여도) 다음 한 장은 통째로 다시 그린다 (통째 ${L1.wholeN}회)`,
    'comp 를 다시 잡으면 내용이 지워집니다 — 칸만 다시 깔면 입·눈 칸 밖 얼굴이 통째로 빈 채로 남습니다');
  W5.av.setCharacter('lily'); await flush(); tickW(W5, 16);
  const L2 = await lateSpeak('noah', 'noah-closed', [640, 760], 'noah 크기 바뀜');
  const bAfter = findBase('noah-closed.webp');
  ok(L2.h === 380 && L2.wholeN === 1, `크기가 바뀌면 통째로 한 번 다시 그린다 (높이 ${L2.h} · 통째 ${L2.wholeN}회)`);
  ok(!!bAfter && bAfter.width === 640 && bAfter.height === 760 && L2.after.some(o => o.op === 'draw' && o.src === bAfter && o.base === 2 && o.a[3] === 380),
    `크기가 바뀌면 바탕 사본도 새 comp 크기로 다시 만들어 깐다 (${bAfter ? bAfter.width + 'x' + bAfter.height : '없음'})`,
    '옛 크기 사본을 그대로 늘려 깔면 장치 픽셀 1:1 이 깨져 얼굴 전체가 한 번 더 흐려집니다');
  HOLD.re = null; HOLD.n = 0; HOLD.list.length = 0;
  W5.document.hidden = true; tickW(W5, 200);

  // 화면 밖 캔버스를 못 만든 브라우저 — comp 없이 화면 캔버스에 바로 그린다. 입모양 경로가 죽지 않아야 한다.
  {
    const W6 = world({ offscreen: false, want: 'lily', visemes });
    await flush();
    const a = new Media(); a.src = '/lesson-x.mp3';
    let err = null, mouthsN = 0;
    try {
      const p = W6.av.prepare(a); await flush(); W6.frame(); await flush(); W6.frame(); await flush(); await p;
      const from = W6.canvas.ctx.ops.length;
      a.paused = false; a.emit('playing');
      for (let i = 0; i < 10; i++) tickW(W6, 16);
      a.paused = true; a.emit('pause'); tickW(W6, 16);
      mouthsN = W6.canvas.ctx.ops.slice(from).filter(o => o.op === 'draw' && nameOf(o.src) === 'lily-mouths.webp').length;
    } catch (e) { err = e; }
    ok(!err && mouthsN >= 8, `화면 밖 캔버스가 없어도 입모양을 화면 캔버스에 바로 그린다 (입 ${mouthsN}장${err ? ' · ' + err.message : ''})`,
      '바탕 사본을 만들려고 comp.width 를 읽으면 그 프레임이 통째로 죽습니다');
    W6.document.hidden = true; tickW(W6, 200);
  }
}

/* ── ⑪ 소스 규칙 ─────────────────────────────────────────────────────── */
console.log('\n■ ⑪ 소스 규칙');
ok(!/\bsetInterval\s*\(/.test(CODE) && intervals === 0, `상주 setInterval 이 없다 (실행 중 ${intervals}회)`);
ok(/prefers-reduced-motion:\s*reduce/.test(CODE), '«움직임 줄이기» 설정을 묻는다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
