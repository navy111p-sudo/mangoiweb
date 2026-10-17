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
 *   ⑤ 눈 그림이 없는 캐릭터(emma)로 바꾸면 깜빡임 타이머·숨쉬기가 꺼진다(짝: lily 는 켜져 있었다)
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
for (const [name, r] of Object.entries(EYES || {})) {
  const f = join(PUB, 'img', 'visemes', `${name}-eyes.webp`), st = statSafe(f);
  ok(!!st, `${name}: 눈 그림이 저장소에 있다 (img/visemes/${name}-eyes.webp)`, '표에만 적고 파일을 커밋에 안 담으면 조용히 깜빡임이 없어집니다');
  if (!st) continue;
  ok(st.size <= 300 * 1024, `${name}: 눈 그림이 300KB 이하다 (${Math.round(st.size / 1024)}KB)`);
  const wh = webpSize(readFileSync(f));
  ok(!!wh && wh[0] === r.w * 3 && wh[1] === r.h, `${name}: 그림 크기 = EYES 사각형 × 3칸 (${wh ? wh.join('x') : '?'} = ${r.w * 3}x${r.h})`);
  const ells = ELL && ELL[name], pad = pyPad ? +pyPad[1] : 0;
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
function advance(ms) {
  const end = T + ms;
  for (;;) {
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
const ctx = { clearRect() {}, drawImage(im, ...a) { draws.push({ src: im && im.src, a }); },
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
  createElement: () => ({}),
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
  const k = 320 / 640;
  ok(sy === 0 && sw === r.w && sh === r.h, `그림에서 한 칸(${r.w}x${r.h})만 잘라 온다`);
  ok(Math.abs(dx - r.x * k) < 0.01 && Math.abs(dy - r.y * k) < 0.01 && Math.abs(dw - r.w * k) < 0.01 && Math.abs(dh - r.h * k) < 0.01,
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
console.log('\n■ ④ 눈썹 — 크게 말할 때만');
const a = new Media();
// 이 절에서는 깜빡임을 멀리 미뤄 둔다 — 눈썹만 따로 재고, 겹칠 때는 일부러 당겨서 잰다.
const parkBlinks = () => timers.forEach(t => { if (t.fn.name === 'blink') t.at = T + 1e9; });
parkBlinks();
av.attach(a); a.paused = false; a.emit('playing');
LEVEL = 180; draws = [];
frame();
ok(eyeDraws().length === 0, '말 첫마디에는 눈썹을 올리지 않는다');
T += 3000; draws = [];
frame();
ok(lastEyeCol('lily') === 2, `크게 말하는 중(1.2초 뒤)에는 눈썹(2칸)을 올린다 (${lastEyeCol('lily')})`);
const bt = timers.find(t => t.fn.name === 'blink');
ok(!!bt, '(전제) 깜빡임 타이머가 살아 있다');
if (bt) bt.at = T + 100;            // 눈썹을 올린 «그 사이» 에 깜빡임이 오게 한다
advance(150); draws = []; frame();
ok(lastEyeCol('lily') === 2, `눈썹을 올린 동안에는 깜빡임이 끼어들지 않는다 (${lastEyeCol('lily')})`);
ok(timers.some(t => t.fn.name === 'blink'), '끼어들지 못한 깜빡임은 버리지 않고 다시 예약한다');
parkBlinks();
T += 800; draws = []; frame();
ok(eyeDraws().length === 0, `잠깐 뒤 눈썹을 내린다 (${eyeDraws().length})`);
// 조용히 말할 때는 올리지 않는다(짝)
LEVEL = 128; T += 20000; draws = []; frame(); frame();
ok(eyeDraws().length === 0, '조용히(작은 소리) 말할 때는 시간이 지나도 눈썹을 올리지 않는다');
// 말이 끝나면 올린 눈썹을 내린다
LEVEL = 180; T += 20000; frame();
ok(lastEyeCol('lily') === 2, '(전제) 다시 크게 말하자 눈썹이 올라갔다');
draws = []; a.paused = true; a.emit('pause');
ok(eyeDraws().length === 0 && draws.length >= 1, '말이 끝나면(pause) 올린 눈썹을 내린 얼굴로 그린다');

/* ── ⑤ 눈 그림이 없는 캐릭터 ─────────────────────────────────────────── */
console.log('\n■ ⑤ 눈 그림이 없는 캐릭터로 바꾸면 꺼진다');
av.setCharacter('emma'); await flush();
ok(!classes.has('mg-alive'), 'emma: 숨쉬기 클래스가 빠진다');
ok(blinkTimers() === 0, `emma: 깜빡임 타이머가 없다 (${blinkTimers()})`);
draws = []; advance(20000);
ok(eyeDraws().length === 0, 'emma: 시간이 지나도 눈 패치를 그리지 않는다');
av.setCharacter('noah'); await flush();
ok(classes.has('mg-alive') && blinkTimers() === 1, 'noah 로 돌아오면 다시 켜진다(짝)');
draws = []; advance(6000);
const nz = eyeDraws();
ok(nz.length >= 1 && /noah-eyes\.webp$/.test(nz[0].src), `noah: 자기 눈 그림으로 깜빡인다 (${nz[0] ? nz[0].src : '없음'})`);

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

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
