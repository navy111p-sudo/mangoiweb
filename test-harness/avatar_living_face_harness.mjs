/* 👁 아바타 «살아 있는 얼굴» — 눈 깜빡임·눈썹 올림·숨쉬기 (js/mango-avatar.js v10, 2026-10-17)
 *
 * 왜: 사장님 「왜 눈과 다른 얼굴 표정은 아직도 그대로야」 — 렌더러가 «원본 초상화 + 입 패치» 만
 *     그려서 눈·눈썹은 처음부터 한 번도 안 움직였습니다.
 *
 * 무엇을 보는가 — «글자가 있는가» 가 아니라 파일을 가짜 DOM·가짜 시계로 «실제로 돌려» 봅니다.
 *   ① 눈 그림(아틀라스)이 저장소에 있고 크기가 EYES 사각형 × 3칸과 같은가
 *      + tools/build-eye-patches.py 의 타원에서 계산한 사각형과 EYES 가 같은가(두 곳이 짝)
 *   ② 깜빡임: 시간이 지나면 반감음(0칸)→감음(1칸)→반감음→원본 순서로 «그 자리에» 그린다
 *   ③ 탭이 숨겨지면 멈추고(타이머 0개), 다시 보이면 다시 건다 · 캔버스가 빠지면 멈춘다
 *   ④ 눈썹: 크게 말할 때만, 말 첫마디 뒤에, 잠깐 — 조용히 말할 때는 안 올린다(짝)
 *      말이 끝나면(pause) 내린다 · 눈썹 중에는 깜빡이지 않는다
 *      (v15) Lily·Noah 는 눈썹 띠를 여러 프레임에 걸쳐 «밀어 올렸다» 내린다(한 번에 바꿔 끼우거나 겹쳐 그리면 FAIL)
 *   ⑤ 눈 그림이 없는 캐릭터(영상 폴백 jake_classic)로 바꾸면 깜빡임 타이머·숨쉬기가 꺼진다(짝: lily 는 켜져 있었다)
 *   ⑤-2 (v11·v12, 2026-10-18) emma·mei·long·jake 도 «자기» 눈 그림으로 깜빡이고 숨쉬기가 켜진다
 *        jake 의 사각형은 tools/build-jake-poses.py(영상 프레임에서 만듦)의 EYE_ELL·EP·TOP 과 짝입니다.
 *   ⑥ 눈 그림을 못 받으면 깜빡임만 없고 얼굴은 그대로 그린다(실패해도 빈 얼굴이 되지 않게)
 *   ⑦ 상주 setInterval 이 없다(주석을 벗긴 코드로 판정) · 움직임 줄이기 설정을 따른다
 */
import vm from 'node:vm';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC_FILE = process.env.AVATAR_SRC || join(PUB, 'js', 'mango-avatar.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };
const statSafe = p => { try { return statSync(p); } catch { return null; } };

console.log('■ 아바타 살아 있는 얼굴 (js/mango-avatar.js v10)');
const AV = readFileSync(SRC_FILE, 'utf8');
// 2026-10-18: lily·noah 는 얼굴을 확대해 잘라 보여 줍니다(CHARACTERS.rect) — 원본 px → 캔버스 px 는 그 rect 를 거쳐야 합니다.
function charRect(name){ const m = AV.match(new RegExp("still:'/img/(?:visemes/)?" + name + "-closed\\.webp(?:\\?v=\\d+)?', rect:\\{ l:([\\d.]+), t:([\\d.]+), r:([\\d.]+), b:([\\d.]+) \\}"));
  return m ? { l:+m[1], t:+m[2], r:+m[3], b:+m[4] } : { l:0, t:0, r:1, b:1 }; }


/* 주석 벗기기 — 글자를 훑으며 «블록주석 안인가 · 문자열 안인가» 를 함께 추적한다
   (정규식 한 줄로 지우면 문자열 속 '/*' 에 파일이 통째로 먹힌다 — CLAUDE.md 2장). */
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

/* ── ① 눈 그림과 사각형 ─────────────────────────────────────────────── */
const em = CODE.match(/var EYES\s*=\s*(\{[^;]*\});/);
let EYES = null;
try { EYES = em && new Function('return ' + em[1])(); } catch { EYES = null; }
ok(!!EYES && Object.keys(EYES).length >= 2, `EYES 표를 소스에서 읽었다 (${EYES ? Object.keys(EYES).join(',') : '없음'})`);
function webpSize(buf) {
  // RIFF....WEBP + VP8L(무손실) / VP8X 머리에서 폭·높이를 읽는다.
  const tag = buf.toString('ascii', 12, 16);
  if (tag === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (tag === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (tag === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  return null;
}
const PY = readFileSync(join(ROOT, 'tools', 'build-eye-patches.py'), 'utf8');
const pyEll = PY.match(/ELLIPSES=(\{[^\n]*\})/), pyPad = PY.match(/\nPAD=(\d+)/);
let ELL = null;
try { ELL = pyEll && new Function('return ' + pyEll[1].replace(/\(/g, '[').replace(/\)/g, ']'))(); } catch { ELL = null; }
ok(!!ELL && !!pyPad, 'build-eye-patches.py 의 타원 표와 PAD 를 읽었다');
// 🦸 jake 는 생성 이미지가 아니라 원래 영상에서 만든다 — 생성기가 다르다(build-jake-poses.py, 512x496 = 위 16px 잘림).
const JPY = readFileSync(join(ROOT, 'tools', 'build-jake-poses.py'), 'utf8');
const jEll = JPY.match(/\nEYE_ELL = (\[[^\n]*\])/), jPad = JPY.match(/\nEP = (\d+)/), jTop = JPY.match(/\nTOP = (\d+)/);
let JELL = null;
try { JELL = jEll && new Function('return ' + jEll[1].replace(/\(/g, '[').replace(/\)/g, ']'))(); } catch { JELL = null; }
ok(!!JELL && JELL.length === 2 && !!jPad && !!jTop, 'build-jake-poses.py 의 눈 타원·EP·TOP 을 읽었다');
const genFor = name => name === 'jake'
  ? { ells: JELL && JELL.map(([cx, cy, rx, ry]) => [cx, cy - (jTop ? +jTop[1] : 0), rx, ry]), pad: jPad ? +jPad[1] : 0 }
  : { ells: ELL && ELL[name], pad: pyPad ? +pyPad[1] : 0 };
for (const [name, r] of Object.entries(EYES || {})) {
  const f = join(PUB, 'img', 'visemes', `${name}-eyes.webp`), st = statSafe(f);
  ok(!!st, `${name}: 눈 그림이 저장소에 있다 (img/visemes/${name}-eyes.webp)`, '표에만 적고 파일을 커밋에 안 담으면 조용히 깜빡임이 없어집니다');
  if (!st) continue;
  ok(st.size <= 300 * 1024, `${name}: 눈 그림이 300KB 이하다 (${Math.round(st.size / 1024)}KB)`);
  const wh = webpSize(readFileSync(f));
  ok(!!wh && wh[0] === r.w * 3 && wh[1] === r.h, `${name}: 그림 크기 = EYES 사각형 × 3칸 (${wh ? wh.join('x') : '?'} = ${r.w * 3}x${r.h})`);
  const { ells, pad } = genFor(name);
  if (ells) {
    const x0 = Math.min(...ells.map(e => e[0] - e[2])) - pad, y0 = Math.min(...ells.map(e => e[1] - e[3])) - pad;
    const x1 = Math.max(...ells.map(e => e[0] + e[2])) + pad, y1 = Math.max(...ells.map(e => e[1] + e[3])) + pad;
    ok(x0 === r.x && y0 === r.y && x1 - x0 === r.w && y1 - y0 === r.h,
      `${name}: EYES 사각형이 생성기의 타원에서 나온 사각형과 같다 ([${x0},${y0},${x1 - x0},${y1 - y0}])`,
      '한쪽만 고치면 눈이 엉뚱한 자리에 그려집니다');
  } else ok(false, `${name}: 생성기 타원 표에 그 이름이 있다`);
}

/* ── 가짜 세계 ─────────────────────────────────────────────────────── */
let T = 1_000_000, R = 0.5, LEVEL = 180, intervals = 0;
const timers = []; let tid = 0;
const setTimeout_ = (fn, ms) => { const id = ++tid; timers.push({ id, at: T + (ms || 0), fn }); return id; };
const clearTimeout_ = id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); };
let RUNAWAY = false;   // 같은 시각 타이머를 끝없이 다시 거는 코드가 있으면 하니스가 멎지 않고 «깔끔한 FAIL» 이 나게(⑦절)
function advance(ms) {
  const end = T + ms; let n = 0;
  for (;;) {
    if (++n > 200000) { RUNAWAY = true; break; }
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers[0];
    if (!t || t.at > end) break;
    timers.shift(); T = Math.max(T, t.at); t.fn();
  }
  T = end;
}
const blinkTimers = () => timers.filter(t => t.fn && t.fn.name === 'blink').length;
const FAIL_URLS = new Set();
class Image {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; }
  set src(v) {
    this._src = v;
    queueMicrotask(() => {
      if (FAIL_URLS.has(v)) { this.onerror && this.onerror(); return; }
      this.complete = true; this.naturalWidth = 640; this.naturalHeight = 800; this.onload && this.onload();
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
  createAnalyser() { return { fftSize: 512, getByteTimeDomainData(a) { a.fill(LEVEL); } }; }
  createMediaElementSource() { return { connect() {} }; }
}
let draws = [];
let canvasOn = false; const offs = [];   // 눈썹 띠를 그리는 작업 캔버스 — 줄마다 «원본의 어느 줄» 을 가져왔는지 남긴다
function fakeCanvas() {
  const cv = { width: 0, height: 0, rows: [] };
  cv.getContext = () => ({ canvas: cv, setTransform() {}, clearRect() { cv.rows = []; }, fillRect() {}, globalCompositeOperation: 'source-over',
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh) { cv.rows.push({ src: im && im.src, sx, sy, sw, sh, dx, dy, dw, dh }); } });
  offs.push(cv); return cv;
}
const ctx = { globalAlpha: 1, clearRect() {}, drawImage(im, ...a) { draws.push({ src: im && im.src, im, a, alpha: this.globalAlpha }); },
  save() {}, restore() {}, setTransform() {},
  getImageData() { return { data: new Uint8ClampedArray(4) }; }, putImageData() {} };
const classes = new Set();
const canvas = { width: 320, height: 400, style: {}, isConnected: true, getContext: () => ctx,
  classList: { toggle(c, on) { on ? classes.add(c) : classes.delete(c); }, contains: c => classes.has(c) } };
const video = new Media(), wrap = { classList: { toggle() {} } };
const ring = { style: {}, getBoundingClientRect: () => ({ width: 320 }) };
const heads = [], listeners = {};
const document = {
  readyState: 'complete', hidden: false,
  head: { appendChild(st) { heads.push(st); } },
  // ④절부터만 «그릴 수 있는» 캔버스를 준다 — 처음부터 주면 화면 밖 캔버스(comp)가 생겨 ①~③절의 그리기 경로가 바뀝니다.
  createElement: () => (canvasOn ? fakeCanvas() : {}),
  addEventListener(n, f) { (listeners[n] ||= []).push(f); },
  getElementById(id) {
    return { 'tavatar-video': video, 'tavatar-canvas': canvas, 'tavatar-wrap': wrap, 'tavatar-ring': ring }[id]
      || heads.find(h => h.id === id) || null;
  }
};
const pendingRaf = new Map(); let rafId = 0;
const window = { __mgAvatarWant: 'lily', AudioContext };
const FakeMath = Object.create(Math); FakeMath.random = () => R;
const FakeDate = { now: () => T };
let ranOk = true;
try {
  vm.runInNewContext(AV, { window, document, Image, Math: FakeMath, Date: FakeDate, WeakMap, Uint8Array, Uint8ClampedArray, Promise,
    setTimeout: setTimeout_, clearTimeout: clearTimeout_,
    // 상주 타이머를 쓰면 크래시가 아니라 «깔끔한 FAIL» 이 나게 세기만 한다(⑦절).
    setInterval: (fn, ms) => { intervals++; return setTimeout_(fn, ms); }, clearInterval: clearTimeout_, getComputedStyle: () => ({ width: '320px' }),
    requestAnimationFrame(f) { pendingRaf.set(++rafId, f); return rafId; }, cancelAnimationFrame(id) { pendingRaf.delete(id); } });
} catch (e) { ranOk = false; console.log('     · ' + e.message); }
ok(ranOk, '파일을 가짜 DOM 에서 실제로 실행했다');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(queueMicrotask); };
const frame = () => { const fs = [...pendingRaf.values()]; pendingRaf.clear(); fs.forEach(f => f()); };
const eyeDraws = () => draws.filter(d => /-eyes\.webp$/.test(d.src || ''));
const lastEyeCol = (name) => { const e = eyeDraws(); if (!e.length) return null; return e[e.length - 1].a[0] / EYES[name].w; };
const av = window.MangoAvatar;
await flush();

/* ── ② 깜빡임 ───────────────────────────────────────────────────────── */
console.log('\n■ ② 깜빡임 (말하지 않을 때)');
ok(classes.has('mg-alive'), 'lily: 숨쉬기 클래스(mg-alive)가 캔버스에 붙었다');
ok(heads.some(h => h.id === 'mg-alive-css' && /prefers-reduced-motion/.test(h.textContent || '')),
  '숨쉬기 CSS 가 한 번 주입되고 «움직임 줄이기» 설정을 따른다');
ok(blinkTimers() === 1, `lily: 눈 그림을 받은 뒤 깜빡임 타이머가 정확히 1개다 (${blinkTimers()})`);
draws = [];
advance(2200 + R * 3800 - 1);
ok(eyeDraws().length === 0, '예정 시각 전에는 눈을 덮어 그리지 않는다');
advance(1);
const e1 = eyeDraws();
ok(e1.length === 1 && e1[0].a[0] === 0, `시각이 되면 «반감음»(0칸)을 그린다 (sx=${e1[0] ? e1[0].a[0] : '없음'})`);
if (e1[0] && EYES) {
  const [sx, sy, sw, sh, dx, dy, dw, dh] = e1[0].a, r = EYES.lily;
  const cr = charRect('lily'), k = 320 / (640 * (cr.r - cr.l)), ox = 640 * cr.l, oy = 800 * cr.t;
  ok(sy === 0 && sw === r.w && sh === r.h, `그림에서 한 칸(${r.w}x${r.h})만 잘라 온다`);
  ok(Math.abs(dx - (r.x - ox) * k) < 0.01 && Math.abs(dy - (r.y - oy) * k) < 0.01 && Math.abs(dw - r.w * k) < 0.01 && Math.abs(dh - r.h * k) < 0.01,
    `초상화의 눈 자리에 그린다 (dx=${dx}, dy=${dy}, ${dw}x${dh})`);
}
ok(draws.length >= 2 && !/-eyes\.webp$/.test(draws[0].src || ''), '눈보다 얼굴(원본)을 «먼저» 그린다', '순서가 바뀌면 얼굴이 눈을 덮습니다');
advance(50);
ok(lastEyeCol('lily') === 1, `50ms 뒤 «감음»(1칸) (${lastEyeCol('lily')})`);
advance(85);
ok(lastEyeCol('lily') === 0, `다시 «반감음»(0칸) (${lastEyeCol('lily')})`);
const before = eyeDraws().length; draws = [];
advance(65);
ok(draws.length >= 1 && eyeDraws().length === 0, '마지막엔 눈 패치 없이 원본 얼굴만 다시 그린다(눈을 뜬다)');
ok(blinkTimers() === 1 && before === 3, `한 번 깜빡인 뒤 다음 깜빡임이 다시 예약된다 (타이머 ${blinkTimers()})`);

// 가끔 두 번 깜빡인다 — 무작위가 0.1 이면 감음이 두 번 나온다(짝: 0.5 일 때는 한 번이었다).
R = 0.1; draws = [];
advance(2200 + 0.5 * 3800);   // 예약은 앞에서 R=0.5 로 잡혔다
advance(1000);
const closedCount = eyeDraws().filter(d => d.a[0] === EYES.lily.w).length;
ok(closedCount === 2, `무작위가 작으면 두 번 깜빡인다 (감음 ${closedCount}번)`);
R = 0.5;

/* ── ③ 숨김·떼어냄 ───────────────────────────────────────────────────── */
console.log('\n■ ③ 탭이 숨겨지면 멈춘다');
document.hidden = true; draws = [];
advance(7000);
ok(eyeDraws().length === 0 && blinkTimers() === 0, `숨겨진 탭에서는 그리지도, 다시 예약하지도 않는다 (타이머 ${blinkTimers()})`);
document.hidden = false;
(listeners.visibilitychange || []).forEach(f => f());
ok(blinkTimers() === 1, `다시 보이면 깜빡임을 다시 건다 (${blinkTimers()})`);
(listeners.visibilitychange || []).forEach(f => f());
ok(blinkTimers() === 1, '여러 번 보였다 숨어도 타이머가 겹치지 않는다');
canvas.isConnected = false; draws = [];
advance(7000);
ok(eyeDraws().length === 0 && blinkTimers() === 0, '캔버스가 화면에서 빠지면 멈춘다');
canvas.isConnected = true;
(listeners.visibilitychange || []).forEach(f => f());

/* ── ④ 눈썹 ─────────────────────────────────────────────────────────── */
/* (v15, 2026-10-18) 사장님 「lily 랑 noah 가 눈썹도 말할 때 자연스럽게」 — Lily·Noah 는 «올린 눈썹 그림» 을
   바꿔 끼우지 않고, 원본 얼굴의 눈썹 띠를 «밀어 올려» 그린다(줄마다 조금 아래 원본 줄을 가져온다).
   높이는 몇 프레임에 걸쳐 오르고 내리며, 강세(크게 벌린 입이 «새로» 시작되는 순간)에 맞춰 건다.
   ⚠️ «그림이 있는가» 가 아니라 «원본을 몇 px 끌어올렸는가» 를 프레임마다 잽니다 — 한 번에 바꿔 끼우면
      «첫 높이 = 끝 높이» 라 아래 «부드럽게» 검사가 FAIL 합니다.
   ⛔ 올린 그림을 반투명으로 겹치는 방식으로 되돌리지 마세요 — 중간 높이에서 «눈썹이 두 줄» 이 됩니다
      (2026-10-18 크로미움 렌더 확인). 아래 «올린 눈썹 그림을 겹쳐 그리지 않는다» 가 그것을 막습니다. */
console.log('\n■ ④ 눈썹 — Lily·Noah 는 눈썹 띠를 «밀어 올려» 부드럽게 (v15)');
const BS = CODE.match(/var BROW_SMOOTH\s*=\s*(\{[^;]*\});/);
let BROW = null; try { BROW = BS && new Function('return ' + BS[1])(); } catch { BROW = null; }
ok(!!BROW && !!BROW.lily && !!BROW.noah, `눈썹 띠 표에 lily·noah 가 있다 (${BROW ? Object.keys(BROW).join(',') : '없음'})`);
for (const [n, b] of Object.entries(BROW || {})) {
  const e = EYES && EYES[n];
  ok(!!e && b.x0 >= e.x && b.x1 <= e.x + e.w && b.top >= e.y - 2 && b.bot <= e.y + e.h + 2,
    `${n}: 눈썹 띠가 EYES 상자 안이다 — 프레임마다 다시 까는 칸 밖으로 안 나간다`, '밖으로 나가면 앞 프레임의 올린 눈썹이 남습니다');
  ok(b.top < b.b0 && b.b0 <= b.b1 && b.b1 < b.bot && b.D < 0.7 * (b.b0 - b.top) && b.D < 0.7 * (b.bot - b.b1),
    `${n}: 띠의 경사가 완만하다 — 피부가 뒤집혀 접히지 않는다 (D=${b.D} · 위 ${b.b0 - b.top}px · 아래 ${b.bot - b.b1}px)`);
  // (v17, 2026-10-19) 눈썹 아래 피부(b1..bot)가 늘어나는 배율 — 크로미움으로 D 8~12 를 그려 눈으로 보니
  //   배율 1.9 근처(Lily D 10)부터 윗눈꺼풀 주름이 겹으로 보이기 시작하고 2.2 이상(D 12)이면 뚜렷했다.
  //   그래서 «1.85 이하» 를 지킨다(지금 Lily 1.75 · Noah 1.83). ⚠️ 렌더를 본 판단이고 사람 확인은 배포 후.
  const stretch = (b.bot - b.b1) / (b.bot - b.b1 - b.D);
  ok(b.D > 0 && stretch <= 1.85,
    `${n}: 눈썹 아래 피부가 1.85배 넘게 늘어나지 않는다 (D=${b.D} · 배율 ${stretch.toFixed(2)})`,
    'D 를 더 키우면 윗눈꺼풀 주름이 두 겹으로 보입니다 — 렌더부터 다시 보세요');
}
canvasOn = true;
const a = new Media();
// 이 절에서는 깜빡임을 멀리 미뤄 둔다 — 눈썹만 따로 재고, 겹칠 때는 일부러 당겨서 잰다.
const parkBlinks = () => timers.forEach(t => { if (t.fn.name === 'blink') t.at = T + 1e9; });
// 이번 프레임에 눈썹 띠를 몇 px 끌어올렸나(원본 px) — 줄 Y 의 «가져온 원본 줄» 이 «안 휘었을 때» 보다 얼마나 아래인가.
const browLift = () => {
  if (!draws.some(d => d.im && d.im.rows)) return 0;          // 이번 프레임에 띠를 안 그렸다
  const cv = draws.filter(d => d.im && d.im.rows).pop().im, r = cv.rows;
  if (!r.length) return 0;
  // 첫 토막의 시작과 마지막 토막의 끝은 «안 휜» 자리(높이 0) — 그 둘로 «안 휘었을 때» 의 대응을 잡는다.
  const z = r[r.length - 1], k = ((z.sy + z.sh) - r[0].sy) / ((z.dy + z.dh) - r[0].dy); let m = 0;
  for (const row of r) m = Math.max(m, row.sy - (r[0].sy + (row.dy - r[0].dy) * k), (row.sy + row.sh) - (r[0].sy + (row.dy + row.dh - r[0].dy) * k));
  return m;
};
let ghost = 0;   // 올린 눈썹 그림(3칸)을 겹쳐 그린 횟수 — 0 이어야 한다
const talk = (n, ms = 16) => { const out = []; for (let i = 0; i < n; i++) { T += ms; draws = []; frame(); out.push(browLift());
  ghost += eyeDraws().filter(d => d.a[0] / EYES.lily.w === 2).length; } return out; };
const D = BROW && BROW.lily ? BROW.lily.D : 0;
parkBlinks();
av.attach(a); a.paused = false; a.emit('playing');
LEVEL = 180; draws = [];
frame();
ok(browLift() === 0, '말 첫마디(첫 프레임)에는 눈썹을 올리지 않는다');
LEVEL = 128; talk(90);                         // 조용한 1.4초 — 강세가 «새로» 시작될 자리를 만든다
LEVEL = 180;
const up = talk(18);                           // 큰 소리가 새로 시작 — 그 뒤 0.29초
const firstUp = up.find(v => v > 0) || 0, peak = Math.max(...up);
ok(peak > 0.3 * D && peak <= D + 1e-6, `강세가 새로 시작되면 눈썹을 밀어 올린다 (최고 ${peak.toFixed(2)}px / 최대 ${D}px)`);
ok(firstUp > 0 && firstUp < peak * 0.5, `한 번에 바꿔 끼우지 않고 «부드럽게» 올라간다 (첫 프레임 ${firstUp.toFixed(2)}px → 최고 ${peak.toFixed(2)}px)`,
  '한 번에 바꾸면 첫 프레임부터 최고 높이입니다');
const rising = up.slice(0, up.indexOf(peak) + 1).filter(v => v > 0);
ok(rising.length >= 3 && rising.every((v, i) => i === 0 || v >= rising[i - 1] - 1e-9), `올라가는 동안 높이가 줄지 않는다 (${rising.length}프레임에 걸쳐)`);
const last = offs.length ? offs[offs.length - 1].rows : [];
ok(last.length >= 2 && last.length <= 3 && last.every(r => r.src && /\/img\/lily-(closed|mid|wide)\.webp/.test(r.src)), `띠는 «원본 초상화»(그 순간의 lily 얼굴) 에서 토막 몇 개로만 늘여 가져온다 (${last.length}토막 — 줄마다 그리면 느린 기기에서 프레임이 밀린다)`);
ok(last.every(r => r.sh > 0 && r.dh > 0) && last.every((r, i) => i === 0 || (Math.abs(r.sy - (last[i - 1].sy + last[i - 1].sh)) < 1e-6 && Math.abs(r.dy - (last[i - 1].dy + last[i - 1].dh)) < 1e-6)), '토막이 위에서 아래로 빈틈·겹침 없이 이어진다 — 피부가 뒤집혀 접히거나 찢어지지 않는다');
const bt = timers.find(t => t.fn.name === 'blink');
ok(!!bt, '(전제) 깜빡임 타이머가 살아 있다');
if (bt) bt.at = T + 10;                        // 눈썹을 올린 «그 사이» 에 깜빡임이 오게 한다
advance(16); draws = []; frame();
ok(eyeDraws().length === 0 && browLift() > 0, `눈썹을 올린 동안에는 깜빡임이 끼어들지 않는다`);
ok(timers.some(t => t.fn.name === 'blink'), '끼어들지 못한 깜빡임은 버리지 않고 다시 예약한다');
parkBlinks();
// (v18, 2026-10-19) 사장님 「눈썹 조금 더 자연스럽게 내려오게」 — 내려오는 곡선이 «천천히 시작 · 가운데 빠름 · 살며시 착지» 인가.
//   전에는 지수 감쇠라 «첫 프레임이 가장 많이» 떨어졌습니다(툭). 프레임마다 떨어진 양을 재어 가장 많이 떨어진 곳이
//   처음·끝이 아니라 가운데인지, 처음·끝 걸음이 가장 큰 걸음의 절반보다 작은지 봅니다.
const easeCheck = (vals, label) => {
  // 마지막 «0 으로 끊기» 한 걸음은 뺀다 — 높이가 0.01 아래면 띠를 안 그리므로(drawEyes) 0.1px 안쪽에서 0 이 됩니다(눈에 안 보임).
  let tail = vals.slice(); while (tail.length >= 2 && tail[tail.length - 1] === 0 && tail[tail.length - 2] === 0) tail.pop();
  if (tail.length >= 2 && tail[tail.length - 1] === 0 && tail[tail.length - 2] <= 0.02 * D) tail.pop();
  const steps = tail.slice(1).map((v, i) => tail[i] - v).filter(d => d > 1e-9);
  const big = Math.max(...steps), at = steps.indexOf(big);
  ok(steps.length >= 6 && steps[0] < 0.5 * big && steps[steps.length - 1] < 0.5 * big && at > 0 && at < steps.length - 1,
    `${label}: 천천히 떨어지기 시작해 가운데서 가장 빠르고 살며시 내려앉는다 (걸음 ${steps.length}개 · 첫 ${steps[0] ? steps[0].toFixed(3) : '—'} · 가장 큰 ${Number.isFinite(big) ? big.toFixed(3) : '—'}(${at + 1}번째) · 끝 ${steps.length ? steps[steps.length - 1].toFixed(3) : '—'}px)`,
    '지수 감쇠로 되돌리면 첫 걸음이 가장 큽니다 — 툭 떨어지는 느낌');
};
const down = talk(60);                         // 계속 크게 말하지만 새 강세는 없다 — 잠깐 뒤 내려앉는다
const mid = down.filter(v => v > 0.05 * D && v < peak * 0.9);
ok(mid.length >= 3, `내려올 때도 «뚝» 이 아니라 여러 프레임에 걸쳐 내려온다 (중간 높이 ${mid.length}프레임)`);
ok(down[down.length - 1] === 0, `잠깐 뒤 눈썹을 다 내린다 (${down[down.length - 1]})`);
{ const top = Math.max(...down), i0 = down.lastIndexOf(top); easeCheck(down.slice(i0), '말하는 도중(지키기가 끝난 뒤)'); }
ok(ghost === 0, `올린 눈썹 그림을 반투명으로 겹쳐 그리지 않는다 (${ghost}번)`, '겹치면 중간 높이에서 «눈썹이 두 줄» 로 보입니다');
// 조용히 말할 때는 올리지 않는다(짝)
LEVEL = 128; const quiet = talk(200);
ok(quiet.every(v => v === 0), '조용히(작은 소리) 말할 때는 시간이 지나도 눈썹을 올리지 않는다');
// 말이 끝나면 «뚝» 대신 짧게 내려앉는다
T += 5000; LEVEL = 180; const up2 = talk(14);
ok(Math.max(...up2) > 0.3 * D, '(전제) 다시 크게 말하자 눈썹이 올라갔다');
const browBefore = up2[up2.length - 1];
draws = []; a.paused = true; a.emit('pause');
ok(draws.length >= 1, '말이 끝나면(pause) 얼굴을 다시 그린다');
const settle = []; for (let i = 0; i < 60 && (settle.length === 0 || settle[settle.length - 1] > 0); i++) { T += 16; draws = []; frame(); settle.push(browLift()); }
ok(settle.length >= 3 && settle[0] > 0 && settle[0] < browBefore, `말이 끝나면 «뚝» 이 아니라 짧게 내려앉는다 (${browBefore.toFixed(2)} → ${settle.map(v => v.toFixed(2)).slice(0, 4).join(' → ')}…px)`);
ok(settle[settle.length - 1] === 0 && settle.length * 16 <= 752, `0.75초 안에 다 내려앉는다 (${settle.length * 16}ms)`);
easeCheck([browBefore, ...settle], '말이 끝난 뒤');
ok(settle.length * 16 >= 448, `(v18) 서두르지 않고 천천히 내려온다 — 0.45초 이상 (${settle.length * 16}ms)`, '0.2~0.3초로 줄이면 다시 «툭» 에 가깝습니다');
T += 2000; draws = []; frame();
ok(pendingRaf.size === 0, '다 내려앉으면 따로 도는 그리기를 멈춘다(rAF 0개)');
// (v18) 시계가 «뒤로» 가도(시간 동기화 등) 올라간 채 멈추지 않는다 — 내려오는 진행을 절대 시각으로 재므로,
//   뒤로 가면 그 순간부터 다시 잽니다. ⚠️ 이 검사가 없으면 «p < 0 이면 0» 으로 되돌려도 아무도 모릅니다(함정 대조 실측).
T += 5000; draws = []; a.paused = false; a.emit('playing'); LEVEL = 128; talk(90); LEVEL = 180; talk(14);
ok(browLift() > 0.3 * D, '(전제) 다시 크게 말하자 눈썹이 올라갔다');
draws = []; a.paused = true; a.emit('pause');
for (let i = 0; i < 6; i++) { T += 16; draws = []; frame(); }
T -= 10000;
const back = []; for (let i = 0; i < 80 && (back.length === 0 || back[back.length - 1] > 0); i++) { T += 16; draws = []; frame(); back.push(browLift()); }
ok(back[back.length - 1] === 0 && back.length * 16 <= 752, `시계가 10초 뒤로 가도 0.75초 안에 다 내려앉는다 (${back.length * 16}ms · 마지막 ${back[back.length - 1].toFixed(2)}px)`);
T += 2000; draws = []; frame();
ok(pendingRaf.size === 0, '시계가 뒤로 간 뒤에도 따로 도는 그리기를 멈춘다(rAF 0개)');
// (v16, 2026-10-19) 사장님 「더 자주 올라가게」 — 강세마다 1~2초 간격으로 «매번» 올린다(전에는 1.4~4초·80%).
//   0.128초씩 크게/작게 번갈아(강세 0.256초마다) 6초 말하게 하고, 눈썹이 «새로» 올라가기 시작한 횟수와 간격을 잰다.
//   ⚠️ 강세를 «촘촘히» 주는 이유 — 0.5초 간격으로 주면 눈썹이 다음 강세 전에 못 내려와 0.6초 간격 변이를
//      원리상 못 가립니다(함정 대조 실측). 그래서 «다 내려왔나» 가 아니라 «다시 오르기 시작했나» 로 셉니다.
//   ⚠️ 난수는 0.5 로 고정이라 «80% 조건» 이 늘 참입니다 — 난수 0.85 로 한 번 더 돌려 «그래도 올린다» 를 짝으로 둡니다.
const speakPulses = () => {
  draws = []; a.paused = false; a.emit('playing');
  const ups = []; let armed = true, lo = Infinity, hi = 0;
  for (let i = 0; i < 375; i++) {               // 375 × 16ms = 6초
    LEVEL = (Math.floor(i / 8) % 2 === 0) ? 180 : 128;
    T += 16; draws = []; frame();
    const v = browLift();
    if (armed) { lo = Math.min(lo, v); if (v > lo + 0.25 * D) { ups.push(T); armed = false; hi = v; } }
    else { hi = Math.max(hi, v); if (v < hi - 0.15 * D) { armed = true; lo = v; } }
  }
  a.paused = true; a.emit('pause');
  for (let i = 0; i < 60; i++) { T += 16; draws = []; frame(); }
  return ups;
};
const ups = speakPulses();
const gaps = ups.slice(1).map((t, i) => t - ups[i]);
ok(ups.length >= 3, `강세가 이어지면 눈썹을 «자주» 올린다 — 6초에 ${ups.length}번 (간격 ${gaps.map(g => (g / 1000).toFixed(2) + '초').join(' · ') || '—'}, 가짜 시계·난수 0.5)`,
  '전에는 1.4~4초 간격이라 6초에 2번 안팎이었습니다');
ok(gaps.length >= 1 && gaps.every(g => g >= 950), `그래도 강세마다(0.26초마다) 올리지는 않는다 — 간격이 1초 안팎 이상 (최소 ${gaps.length ? (Math.min(...gaps) / 1000).toFixed(2) : '—'}초)`,
  '너무 자주 올리면 기계처럼 보입니다');
R = 0.85; T += 3000;
const ups85 = speakPulses();
R = 0.5;
ok(ups85.length >= 2, `난수가 0.8 을 넘어도 올린다 — «매번» (난수 0.85 에서 6초에 ${ups85.length}번)`, '«80% 만» 으로 되돌리면 이 난수에서는 한 번도 안 올립니다');
// 미룬 깜빡임은 눈썹이 «내려앉은 직후» 다시 온다 — 그 시각에 눈썹이 다 내려와 있고, 실제로 눈을 그린다.
//   ⚠️ «2초 안에 다시 예약했나» 만 보면 50ms 마다 졸라 대는 변이도 통과합니다 — 다시 온 그 순간의 눈썹 높이를 함께 봅니다.
T += 3000; LEVEL = 128; draws = []; a.paused = false; a.emit('playing'); talk(90);
LEVEL = 180; talk(18);
ok(browLift() > 0.3 * D, '(전제) 다시 크게 말하자 눈썹이 올라가 있다');
const bt2 = timers.find(t => t.fn.name === 'blink');
if (bt2) bt2.at = T + 10;
advance(16); draws = []; frame();
const reBlink = timers.find(t => t.fn.name === 'blink');
const reIn = reBlink ? reBlink.at - T : NaN;
ok(!!reBlink && reIn < 2000, `미룬 깜빡임을 새로 2.2~6초 기다리지 않는다 (${reBlink ? (reIn / 1000).toFixed(2) : '—'}초 뒤 다시)`);
let liftAt = NaN, sawEye = false;
if (reBlink) {
  const at = reBlink.at;
  while (T + 16 < at) { advance(16); draws = []; frame(); }
  liftAt = browLift();
  for (let i = 0; i < 25 && !sawEye; i++) { advance(16); draws = []; frame(); sawEye = eyeDraws().length > 0; }
}
ok(liftAt < 0.1 * D, `다시 온 그 순간에는 눈썹이 이미 내려앉아 있다 (${Number.isFinite(liftAt) ? liftAt.toFixed(2) : '—'}px / 최대 ${D}px)`, '내려앉기 전에 다시 오면 또 미뤄질 뿐입니다');
ok(sawEye, '다시 온 깜빡임이 실제로 눈을 그린다');
// (v18) 가장 높이 올리고(난수 0 → 큰 강세 0.85) 재시도 여유가 가장 짧을 때(+0.12초)도 «완전히» 내려온 뒤 깜빡인다.
//   ⚠️ 난수 0.5 만 보면 재시도 여유(+0.32초)가 내려오기 남은 시간을 늘 덮어 줘서, 깜빡임 미루기를 옛 «+0.45초» 로
//      되돌려도 통과합니다(함정 대조 실측). 그러면 다 내려오기 전에 눈 그림이 덮어 눈썹이 «뚝» 내려갑니다.
{
  a.paused = true; a.emit('pause');
  for (let i = 0; i < 60; i++) { advance(16); draws = []; frame(); }   // 앞의 깜빡임(눈 감기 단계)을 끝까지 돌려 눈을 뜬 상태로
  R = 0; T += 3000; parkBlinks(); LEVEL = 128; draws = []; a.paused = false; a.emit('playing'); talk(90);
  LEVEL = 180; talk(12);
  ok(browLift() > 0.5 * D, `(전제) 난수 0 — 크게 올라갔다 (${browLift().toFixed(2)}px)`);
  const b3 = timers.find(t => t.fn.name === 'blink'); if (b3) b3.at = T + 10;
  advance(16); draws = []; frame();
  const rb = timers.find(t => t.fn.name === 'blink');
  let l0 = NaN;
  if (rb) { while (T + 16 < rb.at) { advance(16); draws = []; frame(); } l0 = browLift(); }
  R = 0.5;
  ok(l0 === 0, `가장 높이·가장 빨리 다시 와도 그 순간 눈썹이 완전히 내려와 있다 (${Number.isFinite(l0) ? l0.toFixed(2) : '—'}px)`,
    '깜빡임 미루기를 내려오기 시간보다 짧게 잡으면 눈 그림이 덜 내려온 눈썹을 덮습니다');
}
a.paused = true; a.emit('pause');
for (let i = 0; i < 60; i++) { T += 16; draws = []; frame(); }

/* ── ④-2 입모양 큐(진짜 TTS 경로) ───────────────────────────────────── */
/* (v19, 2026-10-19) 사장님 「왜 아직도 noah랑 lily 눈썹이 안움직여」 — 웜업·영어친구의 서버 TTS 는 입모양 큐(Rhubarb)를
   받아 그 큐로 입을 움직입니다. 그 경로에서 눈썹 방아쇠가 'D'(가장 크게 벌린 입) 큐뿐이었는데, 진짜 음성 실측에서
   'D' 는 답 하나에 0.1~0.34초뿐이라 눈썹이 한 답에 0~2번(한국어는 0번)만 올라갔습니다. 위 ④ 는 음량(RMS) 경로만
   시험해서 이것을 원리상 못 봤습니다 — 그래서 여기서는 «소리는 조용한데(LEVEL 128) 큐만 있는» 상태로 잽니다.
   ⚠️ 큐에 'D' 를 «하나도» 넣지 않습니다 — 넣으면 옛 방아쇠로도 올라가 이 절이 헛돕니다.
   짝: ⓐ 열린 모음(C·E)이 없는 큐(A·B·F·X)면 한 번도 안 올린다 ⓑ Emma(옛 눈썹)는 'D' 없는 큐에서 예전처럼 안 올린다. */
console.log('\n■ ④-2 입모양 큐 경로에서도 눈썹을 올린다 (v19 — 실제 TTS 는 이 경로)');
const mkCues = (seq, step = 0.13, total = 7) => { const out = []; let t = 0, i = 0; while (t < total) { out.push({ start: +t.toFixed(3), end: +(t + step).toFixed(3), value: seq[i % seq.length] }); t += step; i++; } return out; };
const atCue = (cues, time) => { for (const c of cues) if (time >= c.start && time < c.end) return c.value; return 'X'; };
let CUES = [];
window.AvatarVisemes = { prepare: () => Promise.resolve(CUES), at: atCue, frame: () => null };
const cueTalk = async (name, seq) => {
  av.setCharacter(name); await flush();
  parkBlinks();
  CUES = mkCues(seq);
  const el = new Media(); el.src = '/audio/cue-' + name + '-' + seq.join('') + '.mp3'; el.currentTime = 0;
  av.prepare(el); await flush();
  LEVEL = 128;                                   // 소리(RMS)는 조용 — 큐만 보고 움직이는지 잰다
  T += 2000; draws = []; el.paused = false; el.emit('playing');
  const ups = []; let armed = true, lo = Infinity, hi = 0, browUp = 0;
  for (let i = 0; i < 375; i++) {               // 375 × 16ms = 6초
    T += 16; el.currentTime += 0.016; draws = []; frame();
    const v = browLift();
    if (armed) { lo = Math.min(lo, v); if (v > lo + 0.25 * D) { ups.push(T); armed = false; hi = v; } }
    else { hi = Math.max(hi, v); if (v < hi - 0.15 * D) { armed = true; lo = v; } }
    if (EYES[name] && eyeDraws().some(d => d.a[0] === 2 * EYES[name].w)) browUp++;
  }
  el.paused = true; el.emit('pause');
  for (let i = 0; i < 60; i++) { T += 16; draws = []; frame(); }
  return { ups, browUp, cued: !!CUES.length };
};
const OPEN = ['B', 'C', 'B', 'A', 'E', 'B', 'X'];   // 'D' 없음 — 실제 음성처럼 C·E 가 자주 나온다
const cueLily = await cueTalk('lily', OPEN);
const cueGaps = cueLily.ups.slice(1).map((t, i) => t - cueLily.ups[i]);
ok(!OPEN.includes('D') && cueLily.cued, "(전제) 큐에 'D'(크게 벌린 입)가 하나도 없고, 소리는 조용하다(LEVEL 128)");
ok(cueLily.ups.length >= 3, `lily: 큐 경로에서 열린 모음(C·E)마다 눈썹을 올린다 — 6초에 ${cueLily.ups.length}번 (간격 ${cueGaps.map(g => (g / 1000).toFixed(2) + '초').join(' · ') || '—'})`,
  "'D' 큐만 보면 이 큐에서는 한 번도 안 올라갑니다(실제 TTS 답 하나에 0~2번 — 2026-10-19 실측)");
ok(cueGaps.length >= 1 && cueGaps.every(g => g >= 950), `큐 경로에서도 간격은 1초 안팎 이상 (최소 ${cueGaps.length ? (Math.min(...cueGaps) / 1000).toFixed(2) : '—'}초)`);
const cueNoah = await cueTalk('noah', OPEN);
ok(cueNoah.ups.length >= 3, `noah: 큐 경로에서도 올린다 — 6초에 ${cueNoah.ups.length}번`);
const shut = await cueTalk('lily', ['B', 'A', 'F', 'X', 'B']);
ok(shut.ups.length === 0, `짝: 열린 모음이 없는 큐(A·B·F·X)에서는 한 번도 안 올린다 (${shut.ups.length}번)`, '«아무 큐에나 올리기» 로 넓히면 이 짝이 FAIL 합니다');
const cueEmma = await cueTalk('emma', OPEN);
ok(cueEmma.browUp === 0, `짝: emma(옛 눈썹)는 'D' 없는 큐에서 예전처럼 올린 눈썹 칸을 안 그린다 (${cueEmma.browUp}프레임)`,
  '옛 캐릭터까지 새 방아쇠로 바꾸면 Emma·Jake 눈썹이 훨씬 자주 튑니다');
const cueEmmaD = await cueTalk('emma', ['B', 'D', 'B', 'A', 'D', 'B', 'X']);
ok(cueEmmaD.browUp > 0, `(전제) emma: 'D' 가 있는 큐에서는 예전처럼 올린 눈썹 칸을 그린다 (${cueEmmaD.browUp}프레임)`,
  '이것이 없으면 위 «emma 는 안 그린다» 가 «emma 눈썹이 아예 안 도는» 것과 구별되지 않습니다');
delete window.AvatarVisemes;
av.setCharacter('lily'); await flush(); av.attach(a);
canvasOn = false;

/* ── ⑤ 눈 그림이 없는 캐릭터 ─────────────────────────────────────────── */
console.log('\n■ ⑤ 눈 그림이 없는 캐릭터로 바꾸면 꺼진다');
// 영상 폴백(jake_classic)에는 눈 그림이 없다 — EYES 에 그 이름이 «정말 없는지» 를 전제로 둔다.
// (v12 에서 jake 가 눈 그림을 얻어 «눈 없는» 자리를 영상 폴백으로 옮겼습니다. 폴백까지 눈을 넣으면 이 절을 또 옮기세요.)
const NOEYE = 'jake_classic';
ok(!!EYES && !EYES[NOEYE] && new RegExp('\\b' + NOEYE + '\\s*:\\s*\\{\\s*sources').test(CODE), `(전제) ${NOEYE} 는 영상 캐릭터이고 EYES 에 없다`);
av.setCharacter(NOEYE); await flush();
ok(!classes.has('mg-alive'), `${NOEYE}: 숨쉬기 클래스가 빠진다`);
ok(blinkTimers() === 0, `${NOEYE}: 깜빡임 타이머가 없다 (${blinkTimers()})`);
draws = []; advance(20000);
ok(eyeDraws().length === 0, `${NOEYE}: 시간이 지나도 눈 패치를 그리지 않는다`);
av.setCharacter('noah'); await flush();
ok(classes.has('mg-alive') && blinkTimers() === 1, 'noah 로 돌아오면 다시 켜진다(짝)');
draws = []; advance(6000);
const nz = eyeDraws();
ok(nz.length >= 1 && /noah-eyes\.webp$/.test(nz[0].src), `noah: 자기 눈 그림으로 깜빡인다 (${nz[0] ? nz[0].src : '없음'})`);

/* ── ⑤-2 emma·mei·long 도 깜빡인다 (v11) ────────────────────────────── */
console.log('\n■ ⑤-2 emma·mei·long·jake 도 자기 눈 그림으로 깜빡인다');
for (const name of ['emma', 'mei', 'long', 'jake']) {
  ok(!!EYES && !!EYES[name], `${name}: EYES 에 사각형이 있다`);
  av.setCharacter(NOEYE); await flush();          // 한 번 «눈 없는» 상태로 만든 뒤 바꾼다(짝)
  ok(!classes.has('mg-alive') && blinkTimers() === 0, `(전제) ${name} 로 바꾸기 전에는 꺼져 있다`);
  av.setCharacter(name); await flush();
  ok(classes.has('mg-alive'), `${name}: 숨쉬기 클래스가 붙는다`);
  ok(blinkTimers() === 1, `${name}: 깜빡임 타이머가 정확히 1개다 (${blinkTimers()})`);
  draws = []; advance(6000);
  const ez = eyeDraws(), want = new RegExp('/' + name + '-eyes\\.webp$');
  ok(ez.length >= 1 && ez.every(d => want.test(d.src)), `${name}: «자기» 눈 그림으로 깜빡인다 (${ez[0] ? ez[0].src : '없음'})`);
  ok(ez.some(d => d.a[0] === EYES[name].w), `${name}: 감음(1칸)까지 간다`);
  ok(ez.length >= 1 && ez[0].a[2] === EYES[name].w && ez[0].a[3] === EYES[name].h, `${name}: 눈 그림을 «그 캐릭터의» 사각형 크기로 잘라 온다`);
}

// (v16) 짝 — 미룬 깜빡임을 «내려앉은 직후» 다시 거는 것은 Lily·Noah 만. Emma 는 예전처럼 새로 2.2~6초를 기다린다.
//   (없으면 그 보정을 모든 친구로 넓히는 변이가 통과합니다 — 함정 대조 실측.)
av.setCharacter('emma'); await flush();
draws = []; a.paused = false; a.emit('playing'); LEVEL = 180;
let emmaUp = false;
for (let i = 0; i < 250 && !emmaUp; i++) { T += 16; draws = []; frame(); emmaUp = eyeDraws().some(d => d.a[0] === 2 * EYES.emma.w); }
ok(emmaUp, '(전제) emma: 크게 말하는 동안 «올린 눈썹 칸» 을 그렸다');
const eb = timers.find(t => t.fn.name === 'blink');
if (eb) eb.at = T + 10;
advance(16);
const eRe = timers.find(t => t.fn.name === 'blink');
ok(!!eRe && eRe.at - T >= 2200, `emma: 눈썹 때문에 미룬 깜빡임은 예전처럼 새로 2.2~6초 뒤 (${eRe ? ((eRe.at - T) / 1000).toFixed(2) : '—'}초 뒤)`);
a.paused = true; a.emit('pause');
for (let i = 0; i < 60; i++) { T += 16; draws = []; frame(); }

/* ── ⑥ 눈 그림을 못 받으면 ───────────────────────────────────────────── */
console.log('\n■ ⑥ 눈 그림을 못 받으면 깜빡임만 없다');
FAIL_URLS.add('/img/visemes/lily-eyes.webp');
av.setCharacter('lily'); await flush();
ok(blinkTimers() === 0, `lily 눈 그림 실패: 깜빡임 타이머가 없다 (${blinkTimers()})`);
draws = []; advance(20000); a.emit('pause');
ok(eyeDraws().length === 0 && draws.length >= 1, '얼굴(원본)은 그대로 그리고 눈 패치는 없다');
FAIL_URLS.clear();

/* ── ⑦ 소스 규칙 ─────────────────────────────────────────────────────── */
console.log('\n■ ⑦ 소스 규칙');
ok(!/\bsetInterval\s*\(/.test(CODE) && intervals === 0, `상주 setInterval 이 없다(깜빡임은 setTimeout 하나를 이어 건다 — 실행 중 ${intervals}회)`);
ok(/document\.hidden/.test(CODE) && /visibilitychange/.test(CODE), '숨겨진 탭에서는 멈추고 다시 보이면 켠다');
ok(!RUNAWAY, '같은 시각에 타이머를 끝없이 다시 거는 곳이 없다');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
