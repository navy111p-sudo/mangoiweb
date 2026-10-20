// 🎬 A.i 더빙동영상 스튜디오 — 소리와 화면 맞춤 회귀 감시 (2026-10-20)
//
//   왜 필요한가 —
//     사장님 「소리와 화면이 일치하지 않는 것 같아 · 말하는 내용과 화면도 달라」.
//     잰 원인 셋(작업기록 261020): ① 음성은 미리 받는데 영상은 대사마다 그때 받아 소리가 먼저 나갔다
//     ② 3·5초 영상을 대사 끝까지 «반복» 해 긴 대사는 말하는 도중 첫 장면으로 튀었다(148줄 중 62줄),
//        짧은 대사는 움직이다 중간에 멈췄다(44줄) ③ 대본에 없는 웅얼거림이 섞인 음성 3개.
//     고친 것은 ai-dubbing-studio.html 인라인 스크립트에 있고, 그 판정은 «순서»(영상이 움직인 «뒤» 에 소리)와
//     «빠르기»(대사 길이에 맞춰 한 번) 라서 문자열 검사로는 원리상 안 보인다 — 함수를 오려 내 실제로 돌린다.
//
//   이 하니스가 못 박는 것 —
//     ① clipRate — 대사 길이에 맞춘 빠르기 · 상하한 · 모르면 예전 값
//     ② showClip — 반복하지 않는다 · 빠르기를 건다 · «playing» 뒤에야 끝난다 · 너무 늦으면 기다리지 않는다
//     ③ 멈추면(pauseClip) 아직 영상을 기다리던 showClip 이 손을 뗀다(멈춘 뒤 저절로 움직이지 않게)
//     ④ 같은 영상을 다시 틀 때도 앞 장면을 붙잡아 둔다 · 이미 돌고 있으면 기다리지 않는다
//     ⑤ runLine/startTurn — 소리·차례 막대는 showClip 이 끝난 «뒤» · 그 사이 멈췄으면 안 낸다(짝)
//     ⑥ 다음 대사 영상을 미리 받는다 · 다른 에피소드 영상은 놓는다(걸린 영상부터 걷어내고)
//     ⑦ 갈아 끼운 음성 3개는 ?v= 로 부른다 — 미디어는 7일 캐시라 안 붙이면 옛 소리가 그대로 난다
//     ⑧ 변이시험 — 일부러 망가뜨린 사본으로 같은 검사를 돌려 «실제로 FAIL» 이 나는지
//        (원본은 0건이어야 한다 — 전제 검사)
//
//   ⚠️ 못 재는 것: 실제 영상의 입 모양이 대사와 맞는지(클립 «내용») — 사람이 봐야 한다.
//      이 컨테이너 크로미움은 H.264 를 못 틀어 실제 재생도 못 잰다(CLAUDE.md 2장).
//
//   실행: node test-harness/dubbing_studio_av_sync_harness.mjs
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const HTML_PATH = process.env.DUB_STUDIO_SRC || join(PUB, 'ai-dubbing-studio.html'); // 변이 사본으로 종료코드를 확인할 때만 바꾼다
const HTML = readFileSync(HTML_PATH, 'utf8');
const INDEX_TS = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'index.ts'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 소스 자르기(문자열·주석·템플릿을 건너뛰며 괄호 짝을 맞춘다) ───────────────── */
function skipQuote(s, i) {
  const q = s[i]; i++;
  while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === q) return i + 1; i++; }
  return i;
}
function skipTemplate(s, i) {
  i++;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '`') return i + 1;
    if (s[i] === '$' && s[i + 1] === '{') { const e = scanTo(s, i + 2, () => false); if (e < 0) return s.length; i = e + 1; continue; }
    i++;
  }
  return i;
}
/* 깊이 0에서 stop(c) 이 참인 자리, 또는 «여는 괄호 밖으로 나가는» 닫는 괄호 자리 */
function scanTo(s, i, stop) {
  let depth = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { const n = s.indexOf('\n', i); i = n < 0 ? s.length : n; continue; }
    if (c === '/' && d === '*') { const n = s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + 2; continue; }
    if (c === "'" || c === '"') { i = skipQuote(s, i); continue; }
    if (c === '`') { i = skipTemplate(s, i); continue; }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') { depth--; if (depth < 0) return i; }
    else if (depth === 0 && stop(c)) return i;
    i++;
  }
  return -1;
}
function stripComments(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { const n = s.indexOf('\n', i); i = n < 0 ? s.length : n; continue; }
    if (c === '/' && d === '*') { const n = s.indexOf('*/', i + 2); i = n < 0 ? s.length : n + 2; continue; }
    if (c === "'" || c === '"') { const e = skipQuote(s, i); out += s.slice(i, e); i = e; continue; }
    if (c === '`') { const e = skipTemplate(s, i); out += s.slice(i, e); i = e; continue; }
    out += c; i++;
  }
  return out;
}
function mainScript(html) {
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, best = '';
  while ((m = re.exec(html))) if (m[1].length > best.length) best = m[1];
  return best;
}
function fnSrc(js, name) {
  const at = js.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
  if (at < 0) throw new Error('함수 없음: ' + name);
  const p = js.indexOf('(', at);
  const pe = scanTo(js, p + 1, () => false);
  const b = js.indexOf('{', pe);
  const be = scanTo(js, b + 1, () => false);
  if (pe < 0 || b < 0 || be < 0) throw new Error('함수 자르기 실패: ' + name);
  return js.slice(at, be + 1);
}
function stmtSrc(js, head) {
  const at = js.indexOf(head);
  if (at < 0) throw new Error('문장 없음: ' + head);
  const e = scanTo(js, at, (c) => c === ';');
  if (e < 0) throw new Error('문장 자르기 실패: ' + head);
  return js.slice(at, e + 1);
}

/* ── 가짜 브라우저 (샌드박스 안에서 돈다) ─────────────────────────────────────── */
const PRELUDE = String.raw`
const __rec = { fetch: [], revoke: [], play: 0, speak: [], speakMine: [], showClip: [], beginTurn: [], loopSets: [], draws: 0, order: [] };
let runId = 0;
const state = { speed: 1, mode: 'dub', roles: new Set(), echo: false, autoNext: true };
const mk = (n) => Array.from({ length: n }, (_, k) => ({ who: k % 2 ? 'mina' : 'dino', en: 'line ' + k, sec: 2 }));
let EP = { media: '/media/dubbing/bday-', bg: 'x', clipLines: null, lines: mk(14) };
const episode = () => EP;
const lines = () => EP.lines;
const stillFor = (i) => 'still' + i;
const posterFor = (ep) => (ep.media ? ep.media + 'key.jpg' : '');
let __audio = null; // 원어민 음성(가짜). 길이를 아직 모르면 duration 이 NaN
const audioFor = () => __audio;
const lineSec = (line) => (__audio && __audio.duration > 0 ? __audio.duration : line.sec);
const window = { devicePixelRatio: 1 };
function makeVideo() {
  const L = {};
  const cls = new Set();
  return {
    hidden: false, readyState: 0, videoWidth: 0, videoHeight: 0, duration: NaN,
    _ct: 0, paused: true, ended: false, _loop: false, playbackRate: 1, poster: '', dataset: {}, _src: null,
    playDelay: 30, metaDelay: 10, meta: { duration: 3, w: 640, h: 360 }, firePlaying: true,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, f) => { if (f === undefined) f = !cls.has(c); if (f) cls.add(c); else cls.delete(c); return f; } },
    get loop() { return this._loop; }, set loop(x) { __rec.loopSets.push(x); this._loop = x; },
    get currentTime() { return this._ct; }, set currentTime(x) { __rec.order.push('seek:' + x); this._ct = x; },
    get src() { return this._src || ''; },
    set src(u) {
      __rec.order.push('src:' + u); this._src = u; this.readyState = 0; this.videoWidth = 0; this.paused = true;
      setTimeout(() => { if (this._src !== u) return; this.readyState = 4; this.duration = this.meta.duration;
        this.videoWidth = this.meta.w; this.videoHeight = this.meta.h; this.dispatch('loadedmetadata'); }, this.metaDelay);
    },
    getAttribute(n) { return n === 'src' ? this._src : null; },
    removeAttribute(n) { if (n === 'src') { __rec.order.push('rmsrc'); this._src = null; } },
    load() { __rec.order.push('load'); },
    addEventListener(t, f) { (L[t] = L[t] || []).push(f); },
    removeEventListener(t, f) { L[t] = (L[t] || []).filter((g) => g !== f); },
    dispatch(t) { __rec.order.push('ev:' + t); (L[t] || []).slice().forEach((f) => f({ type: t })); },
    play() {
      __rec.play++; __rec.order.push('play');
      const was = !this.paused; this.paused = false; this.ended = false;
      if (this.firePlaying && !was) setTimeout(() => { if (!this.paused) this.dispatch('playing'); }, this.playDelay);
      return Promise.resolve();
    },
    pause() { this.paused = true; __rec.order.push('pause'); },
  };
}
const ELS = {
  vid: makeVideo(),
  'vid-fade': { clientWidth: 320, clientHeight: 180, width: 0, height: 0, style: { opacity: '0', transition: '' },
    get offsetWidth() { return 320; },
    getContext() { return { drawImage() { __rec.draws++; __rec.order.push('draw'); } }; } },
  scene: { innerHTML: '', hidden: false }, 'ai-badge': { hidden: true }, finish: { hidden: true },
};
const $ = (id) => ELS[id];
const __fetchCtl = { manual: false, pending: [] };
function fetch(u) {
  __rec.fetch.push(u);
  return new Promise((res) => {
    const go = () => res({ ok: true, blob: () => Promise.resolve({ u }) });
    if (__fetchCtl.manual) __fetchCtl.pending.push(go); else setTimeout(go, 5);
  });
}
const URL = { n: 0, createObjectURL() { return 'blob:' + (++this.n); },
  revokeObjectURL(u) { __rec.revoke.push(u); __rec.order.push('revoke:' + u); } };
const BG = { x: '<g/>' }; const castOf = () => []; const charSVG = () => '';
const isMine = (line) => state.roles.has(line.who);
let __recs = {}; const recFor = (i) => __recs[i];
function stopAll() { runId++; }
function renderCurrent() {} function duck() {} function setTalking() {} function advance() {} function later() {}
function speak(line, i) { __rec.speak.push(i); }
function speakMine(line, i) { __rec.speakMine.push(i); }
function beginTurn(line, i) { __rec.beginTurn.push(i); }
`;

function buildEnv(html, { fakeShowClip = false } = {}) {
  const js = mainScript(html);
  const parts = [
    PRELUDE,
    stmtSrc(js, 'const pad2'), stmtSrc(js, 'const VOICE_V'), stmtSrc(js, 'const mediaFor'),
    stmtSrc(js, 'const CLIP_RATE_MIN'),
    // 기다림 상한은 시험에서만 줄인다(실제 값은 아래 정적 검사가 따로 본다)
    stmtSrc(js, 'const CLIP_WAIT_MS').replace(/=\s*\d+/, '= 200'),
    stmtSrc(js, 'const clipBlobs'),
    fnSrc(js, 'prefetchClip'), fnSrc(js, 'releaseClips'), fnSrc(js, 'clipRate'),
    stmtSrc(js, 'const withTimeout'), fnSrc(js, 'whenVid'), fnSrc(js, 'holdFrame'), fnSrc(js, 'fadeFrame'),
    stmtSrc(js, 'let clipSeq'),
    fakeShowClip
      ? 'const __sc = { pending: [] };\nfunction showClip(i, autoplay, speechSec) { __rec.showClip.push([i, autoplay, speechSec]); return new Promise((r) => __sc.pending.push(r)); }'
      : fnSrc(js, 'showClip') + '\nconst __sc = { pending: [] };',
    fnSrc(js, 'pauseClip'), fnSrc(js, 'startTurn'), fnSrc(js, 'runLine'), fnSrc(js, 'renderScene'),
    `globalThis.__T = { __rec, __fetchCtl, __sc, ELS, state, clipBlobs, URL,
      setEP: (e) => { EP = e; }, mk, setRecs: (r) => { __recs = r; }, setAudio: (a) => { __audio = a; },
      getRunId: () => runId, stopAll, clipRate, showClip, pauseClip, releaseClips, prefetchClip, runLine, startTurn,
      mediaFor, renderScene, getClipSeq: () => clipSeq };`,
  ];
  const ctx = vm.createContext({ setTimeout, clearTimeout, performance, Promise, console });
  vm.runInContext(parts.join('\n'), ctx, { filename: 'ai-dubbing-studio.inline.js' });
  return ctx.__T;
}

/* ── 검사 묶음 (원본·변이 모두 같은 길로 돈다) ─────────────────────────────── */
async function suite(html, { quick = false } = {}) {
  const res = [];
  const ok = (name, cond, extra) => res.push({ name, ok: !!cond, extra });
  const guard = async (name, f) => { try { await f(); } catch (e) { res.push({ name: name + ' (실행 실패)', ok: false, extra: String(e && e.message || e) }); } };

  await guard('① clipRate', async () => {
    const T = buildEnv(html);
    ok('① 영상 3초 · 소리 2.5초 → 1.2배(대사 끝에 영상도 끝남)', Math.abs(T.clipRate(3, 2.5, 1) - 1.2) < 1e-9, T.clipRate(3, 2.5, 1));
    ok('① 영상 5초 · 소리 1.5초 → 상한 2배에서 멈춤', T.clipRate(5, 1.5, 1) === 2, T.clipRate(5, 1.5, 1));
    ok('① 영상 3초 · 소리 10초 → 하한 0.6배(넘치는 시간은 마지막 장면)', T.clipRate(3, 10, 1) === 0.6, T.clipRate(3, 10, 1));
    ok('① 영상 길이를 모르면(NaN·Infinity) 예전 빠르기', T.clipRate(NaN, 2, 0.8) === 0.8 && T.clipRate(Infinity, 2, 0.8) === 0.8);
    ok('① 소리 길이를 모르면 예전 빠르기', T.clipRate(3, 0, 1.2) === 1.2 && T.clipRate(3, NaN, 1.2) === 1.2);
  });

  await guard('② 새 영상', async () => {
    const T = buildEnv(html);
    const v = T.ELS.vid;
    Object.assign(v, { _src: 'blob:old', readyState: 4, videoWidth: 640, videoHeight: 360, duration: 5, paused: true });
    v.dataset.clip = '/media/dubbing/bday-09.mp4';
    v.meta.duration = 3;
    let doneAt = -1;
    await T.showClip(0, true, 2.5).then(() => { T.__rec.order.push('resolved'); doneAt = T.__rec.order.length; });
    const o = T.__rec.order;
    ok('② 반복하지 않는다(loop 를 한 번도 true 로 두지 않음)', T.__rec.loopSets.length > 0 && T.__rec.loopSets.every((x) => x === false), T.__rec.loopSets);
    ok('② 미리 받은 영상(blob)으로 건다', String(v._src).startsWith('blob:') && v._src !== 'blob:old', v._src);
    ok('② 대사 길이에 맞춘 빠르기(3초 영상 · 2.5초 대사 → 1.2배)', Math.abs(v.playbackRate - 1.2) < 1e-9, v.playbackRate);
    ok('② 처음 장면부터 튼다', o.includes('seek:0'));
    ok('② «playing» 이 온 «뒤» 에야 끝난다(그래야 소리가 화면을 앞서지 않는다)',
      o.indexOf('ev:playing') >= 0 && o.indexOf('ev:playing') < o.indexOf('resolved'), o);
    ok('② 장면 넘김: 영상을 바꾸기 «전» 에 앞 장면을 붙잡아 둔다', o.indexOf('draw') >= 0 && o.indexOf('draw') < o.findIndex((x) => x.startsWith('src:blob')), o);
    ok('② 새 영상이 움직이면 붙잡아 둔 장면을 걷는다', T.ELS['vid-fade'].style.opacity === '0' && /opacity/.test(T.ELS['vid-fade'].style.transition));
    ok('② (전제) 끝났다', doneAt > 0);
  });

  await guard('②-b 대사 길이 기본값', async () => {
    const T = buildEnv(html);
    T.state.speed = 0.8; // 2초 대사를 0.8배로 → 2.5초 소리
    await T.showClip(0, true);
    ok('②-b speechSec 를 안 주면 대사 길이÷빠르기로 맞춘다(3초 영상 · 2.5초 → 1.2배)', Math.abs(T.ELS.vid.playbackRate - 1.2) < 1e-9, T.ELS.vid.playbackRate);
  });

  await guard('②-d 음성 길이를 아직 모를 때', async () => {
    // 첫 대사는 음성을 아직 다 안 받았을 수 있다 — 어림값(2초)으로 맞추면 영상이 소리보다 오래 움직인다(브라우저 실측으로 밟음)
    const T = buildEnv(html);
    const L = {};
    const a = { duration: NaN, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); }, removeEventListener: (t, f) => { L[t] = (L[t] || []).filter((g) => g !== f); } };
    T.setAudio(a);
    setTimeout(() => { a.duration = 2.5; (L.loadedmetadata || []).slice().forEach((f) => f({ type: 'loadedmetadata' })); }, 30);
    await T.showClip(0, true);
    ok('②-d 음성 길이가 들어온 «뒤» 에 빠르기를 정한다(3초 영상 · 2.5초 음성 → 1.2배, 어림값 2초면 1.5배)', Math.abs(T.ELS.vid.playbackRate - 1.2) < 1e-9, T.ELS.vid.playbackRate);
    const T2 = buildEnv(html);
    T2.setAudio({ duration: NaN, addEventListener() {}, removeEventListener() {} }); // 끝내 안 오는 음성
    const t0 = Date.now();
    await T2.showClip(0, true);
    const ms = Date.now() - t0;
    ok('②-d (짝) 음성 길이가 끝내 안 와도 기다림 상한 안에서 어림값으로 튼다', ms < 1500 && Math.abs(T2.ELS.vid.playbackRate - 1.5) < 1e-9, { ms, rate: T2.ELS.vid.playbackRate });
  });

  if (!quick) await guard('②-c 영상이 안 움직이면', async () => { // 0.3초 기다리는 검사 — 변이 반복에서는 뺀다(다른 절이 같은 변이를 잡는다)
    const T = buildEnv(html);
    T.ELS.vid.firePlaying = false;
    const t0 = Date.now();
    await T.showClip(0, true, 2);
    const ms = Date.now() - t0;
    ok('②-c 영상이 안 움직여도 수업을 멈추지 않는다(기다림 상한에서 끝남)', ms < 1500, ms);
    ok('②-c 그래도 바로 끝나지는 않는다(움직일 시간을 준다)', ms >= 150, ms);
  });

  await guard('③ 멈춤', async () => {
    const T = buildEnv(html);
    T.__fetchCtl.manual = true;
    const p = T.showClip(0, true, 2);
    await sleep(15);
    T.pauseClip();
    T.__fetchCtl.pending.splice(0).forEach((go) => go());
    await p; await sleep(80);
    ok('③ 멈춘 뒤 늦게 온 영상은 걸지도 틀지도 않는다', T.__rec.play === 0 && !T.ELS.vid.dataset.clip, { play: T.__rec.play, clip: T.ELS.vid.dataset.clip });
    // 짝: 멈추지 않았으면 튼다
    const U = buildEnv(html);
    U.__fetchCtl.manual = true;
    const q = U.showClip(0, true, 2);
    await sleep(15);
    U.__fetchCtl.pending.splice(0).forEach((go) => go());
    await q;
    ok('③ (짝) 멈추지 않았으면 그대로 튼다', U.__rec.play === 1 && U.ELS.vid.dataset.clip === '/media/dubbing/bday-01.mp4', { play: U.__rec.play });
  });

  await guard('④ 같은 영상 다시', async () => {
    const T = buildEnv(html);
    const v = T.ELS.vid;
    Object.assign(v, { _src: 'blob:x', readyState: 4, videoWidth: 640, videoHeight: 360, duration: 3, _ct: 2.0, paused: true });
    v.dataset.clip = '/media/dubbing/bday-01.mp4';
    await T.showClip(0, true, 3);
    const o = T.__rec.order;
    ok('④ 같은 영상을 처음부터 다시 틀 때도 앞 장면을 붙잡아 둔다(툭 끊기지 않게)', o.indexOf('draw') >= 0 && o.indexOf('draw') < o.indexOf('seek:0'), o);
    ok('④ 같은 영상은 다시 받지 않는다', T.__rec.fetch.every((u) => u !== '/media/dubbing/bday-01.mp4'), T.__rec.fetch);
    ok('④ 다시 튼다', T.__rec.play === 1);
    const U = buildEnv(html);
    const w = U.ELS.vid;
    Object.assign(w, { _src: 'blob:x', readyState: 4, videoWidth: 640, videoHeight: 360, duration: 3, _ct: 1.0, paused: false });
    w.dataset.clip = '/media/dubbing/bday-01.mp4';
    const t0 = Date.now();
    await U.showClip(0, true, 3);
    const ms = Date.now() - t0;
    ok('④ 이미 돌고 있는 영상이면 «playing» 을 기다리지 않는다(다시 오지 않는다)', ms < 150, ms);
  });

  await guard('④-b 영상 없는 대사', async () => {
    const T = buildEnv(html);
    T.setEP({ media: '/media/dubbing/bday-', bg: 'x', clipLines: [2], lines: T.mk(4) });
    const v = T.ELS.vid;
    v._src = 'blob:x'; v.dataset.clip = '/media/dubbing/bday-02.mp4';
    await T.showClip(0, true, 2);
    ok('④-b 영상이 없는 대사는 앞 영상을 걷어내고 그림을 천천히 확대한다', !v._src && !v.dataset.clip && v.classList.contains('kenburns'));
    ok('④-b 영상이 없는 대사는 받으러 가지 않는다', T.__rec.fetch.length === 0, T.__rec.fetch);
    await T.showClip(0, false);
    ok('④-b 멈춘 화면에서는 확대하지 않는다', !v.classList.contains('kenburns'));
  });

  await guard('⑤ 소리 순서', async () => {
    const T = buildEnv(html, { fakeShowClip: true });
    T.runLine(0);
    ok('⑤ runLine 은 원어민 음성이면 길이를 넘기지 않는다(showClip 이 다 받은 음성 길이로 잰다)', T.__rec.showClip.length === 1 && T.__rec.showClip[0][0] === 0 && T.__rec.showClip[0][1] === true && T.__rec.showClip[0][2] === undefined, T.__rec.showClip);
    await sleep(10);
    ok('⑤ 영상이 움직이기 «전» 에는 소리를 내지 않는다', T.__rec.speak.length === 0, T.__rec.speak);
    T.__sc.pending.splice(0).forEach((r) => r());
    await sleep(5);
    ok('⑤ 영상이 움직인 «뒤» 에 소리를 낸다', T.__rec.speak.length === 1 && T.__rec.speak[0] === 0, T.__rec.speak);
    ok('⑤ 다음 두 대사 영상을 미리 받는다', T.__rec.fetch.includes('/media/dubbing/bday-02.mp4') && T.__rec.fetch.includes('/media/dubbing/bday-03.mp4'), T.__rec.fetch);
  });

  await guard('⑤-b 그 사이 멈춤', async () => {
    const T = buildEnv(html, { fakeShowClip: true });
    T.runLine(0);
    T.stopAll(); // 영상을 기다리는 사이 사람이 멈춤·다른 대사로 넘어감
    T.__sc.pending.splice(0).forEach((r) => r());
    await sleep(5);
    ok('⑤-b 그 사이 멈췄으면 소리를 내지 않는다', T.__rec.speak.length === 0, T.__rec.speak);
  });

  await guard('⑤-c 내 녹음', async () => {
    const T = buildEnv(html, { fakeShowClip: true });
    T.state.mode = 'review'; T.state.roles.add('dino');
    T.setRecs({ 0: { audio: { duration: 3.3 } } });
    T.runLine(0);
    ok('⑤-c 내 녹음은 그 녹음 길이에 영상을 맞춘다', T.__rec.showClip[0] && T.__rec.showClip[0][2] === 3.3, T.__rec.showClip);
    T.__sc.pending.splice(0).forEach((r) => r());
    await sleep(5);
    ok('⑤-c 영상이 움직인 뒤 내 녹음을 튼다', T.__rec.speakMine.length === 1 && T.__rec.speak.length === 0);
  });

  await guard('⑤-d 내 차례', async () => {
    const T = buildEnv(html, { fakeShowClip: true });
    T.state.roles.add('dino');
    T.runLine(0);
    await sleep(5);
    ok('⑤-d 내 차례 막대는 영상이 움직이기 «전» 에 시작하지 않는다', T.__rec.showClip.length === 1 && T.__rec.beginTurn.length === 0, { sc: T.__rec.showClip, bt: T.__rec.beginTurn });
    T.__sc.pending.splice(0).forEach((r) => r());
    await sleep(5);
    ok('⑤-d 영상이 움직인 뒤 차례 막대를 시작한다', T.__rec.beginTurn.length === 1);
    const U = buildEnv(html, { fakeShowClip: true });
    U.state.roles.add('dino');
    U.runLine(0);
    U.stopAll();
    U.__sc.pending.splice(0).forEach((r) => r());
    await sleep(5);
    ok('⑤-d 그 사이 멈췄으면 차례 막대를 시작하지 않는다', U.__rec.beginTurn.length === 0);
  });

  await guard('⑥ 에피소드 바꿈', async () => {
    const T = buildEnv(html);
    T.clipBlobs.set('/media/dubbing/show-01.mp4', Promise.resolve('blob:show'));
    T.clipBlobs.set('/media/dubbing/bday-05.mp4', Promise.resolve('blob:bday'));
    const v = T.ELS.vid;
    v._src = 'blob:show'; v.dataset.clip = '/media/dubbing/show-01.mp4';
    T.releaseClips('/media/dubbing/bday-');
    await sleep(5);
    const o = T.__rec.order;
    ok('⑥ 다른 에피소드 영상은 놓는다', T.__rec.revoke.includes('blob:show') && !T.clipBlobs.has('/media/dubbing/show-01.mp4'), T.__rec.revoke);
    ok('⑥ 이 에피소드 영상은 남긴다', !T.__rec.revoke.includes('blob:bday') && T.clipBlobs.has('/media/dubbing/bday-05.mp4'));
    ok('⑥ 화면에 걸린 영상을 «먼저» 걷어낸다(걸린 채 놓으면 오류로 그림 무대로 넘어간다)', o.indexOf('rmsrc') >= 0 && o.indexOf('rmsrc') < o.indexOf('revoke:blob:show') && !v.dataset.clip, o);
    const U = buildEnv(html);
    U.renderScene();
    ok('⑥ 에피소드를 열면 첫 두 대사 영상을 미리 받는다', U.__rec.fetch.includes('/media/dubbing/bday-01.mp4') && U.__rec.fetch.includes('/media/dubbing/bday-02.mp4'), U.__rec.fetch);
  });

  await guard('⑦ 갈아 끼운 음성', async () => {
    const T = buildEnv(html);
    ok('⑦ bday 1번 음성은 ?v= 로 부른다', /bday-01\.mp3\?v=\d+$/.test(T.mediaFor(0).voice), T.mediaFor(0).voice);
    ok('⑦ (짝) 안 바꾼 음성은 주소 그대로(전원이 다시 받지 않게)', /bday-02\.mp3$/.test(T.mediaFor(1).voice), T.mediaFor(1).voice);
    T.setEP({ media: '/media/dubbing/show-', bg: 'x', clipLines: null, lines: T.mk(14) });
    ok('⑦ show 12번 음성은 ?v=', /show-12\.mp3\?v=\d+$/.test(T.mediaFor(11).voice), T.mediaFor(11).voice);
    T.setEP({ media: '/media/dubbing/treasure-', bg: 'x', clipLines: null, lines: T.mk(14) });
    ok('⑦ treasure 4번 음성은 ?v=', /treasure-04\.mp3\?v=\d+$/.test(T.mediaFor(3).voice), T.mediaFor(3).voice);
  });
  return res;
}

/* ── 정적 검사(원본만) ─────────────────────────────────────────────────── */
function staticChecks() {
  const res = [];
  const ok = (name, cond, extra) => res.push({ name, ok: !!cond, extra });
  const js = mainScript(HTML);
  const code = stripComments(js);
  ok('S 영상을 반복하는 코드가 없다(loop = true / loop = autoplay)', !/\.loop\s*=\s*(true|autoplay)\b/.test(code));
  const wait = Number((stmtSrc(js, 'const CLIP_WAIT_MS').match(/=\s*(\d+)/) || [])[1]);
  ok('S 영상 기다림 상한이 0.5~2초(그보다 길면 수업이 멈춘 것처럼 보인다)', wait >= 500 && wait <= 2000, wait);
  const rate = stmtSrc(js, 'const CLIP_RATE_MIN');
  const mn = Number((rate.match(/CLIP_RATE_MIN\s*=\s*([\d.]+)/) || [])[1]);
  const mx = Number((rate.match(/CLIP_RATE_MAX\s*=\s*([\d.]+)/) || [])[1]);
  ok('S 빠르기 상하한이 0.5~2.5 안', mn >= 0.5 && mx <= 2.5 && mn < 1 && mx > 1, { mn, mx });
  ok('S 장면 넘김 캔버스가 화면에 있다', /<canvas id="vid-fade"/.test(HTML) && /\.stage \.vid-fade\s*\{[^}]*pointer-events:\s*none/.test(HTML));
  const vv = stmtSrc(js, 'const VOICE_V');
  const keys = [...vv.matchAll(/'([a-z]+-\d\d)'\s*:/g)].map((m) => m[1]);
  ok('S ?v= 를 붙인 음성 파일이 실재한다', keys.length >= 3 && keys.every((k) => existsSync(join(PUB, 'media', 'dubbing', k + '.mp3'))), keys);
  const m = INDEX_TS.match(/const _mVersioned = ([^;]+);/);
  let verOk = false;
  if (m) {
    try {
      const f = new Function('url', 'path', 'return ' + m[1]);
      verOk = f({ search: '?v=2' }, '/media/dubbing/bday-01.mp3') === true && f({ search: '' }, '/media/dubbing/bday-01.mp3') === false;
    } catch (e) { verOk = false; }
  }
  ok('S 워커가 ?v= 붙은 음성을 «새 주소» 로 본다(안 붙이면 7일 캐시)', verOk);
  return res;
}

/* ── 변이시험 ───────────────────────────────────────────────────────────── */
const MUTATIONS = [
  ['빠르기를 대사에 안 맞춤', 'return Math.min(CLIP_RATE_MAX, Math.max(CLIP_RATE_MIN, clipSec / speechSec));', 'return fallback;'],
  ['소리를 영상보다 먼저 냄', 'showClip(i, true, speechSec).then(() => {', 'showClip(i, true, speechSec); Promise.resolve().then(() => {'],
  ['영상 반복 되살림', 'vid.loop = false;', 'vid.loop = true;'],
  ['멈춤이 기다리던 영상을 안 놓음', '  clipSeq++; // 아직', '  // 아직'],
  ['«playing» 을 안 기다림', "await whenVid(vid, 'playing'", "whenVid(vid, 'playing'"],
  ['갈아 끼운 음성 ?v= 제거', "const v = VOICE_V[key] ? `?v=${VOICE_V[key]}` : '';", "const v = '';"],
  ['다음 대사 영상 미리 받기 제거', 'prefetchClip(i + 1); prefetchClip(i + 2);', ''],
  ['차례 막대를 영상보다 먼저 시작', 'showClip(i, true).then(() => { if (run === runId) beginTurn(line, i, run, kind, done); });', 'showClip(i, true); beginTurn(line, i, run, kind, done);'],
  ['빠르기를 예전 값으로', 'vid.playbackRate = clipRate(vid.duration, sp, state.speed);', 'vid.playbackRate = state.speed;'],
  ['걸린 영상을 걷지 않고 놓음', "  if (vid.dataset.clip && !keep(vid.dataset.clip)) { vid.removeAttribute('src'); delete vid.dataset.clip; vid.load(); }\n", ''],
  ['이미 돌고 있어도 «playing» 을 기다림', ' if (wasPlaying) fin();', ''],
  ['같은 영상 다시 틀 때 앞 장면을 안 붙잡음', 'if (!changed && vid.currentTime > 0.05) holdFrame();', ''],
  ['조건 뒤집기: 멈췄을 때만 소리', '    if (run !== runId) return;\n    (useMyVoice ? speakMine : speak)', '    if (run === runId) return;\n    (useMyVoice ? speakMine : speak)'],
  ['에피소드 열 때 미리 받기 제거', 'prefetchClip(0); prefetchClip(1);', ''],
  ['음성 길이를 기다리지 않고 어림값으로 맞춤', "    if (a && !(a.duration > 0)) await whenVid(a, 'loadedmetadata', left());\n", ''],
  ['원어민 음성에도 어림 길이를 넘김', 'myDur > 0 ? myDur : undefined;', 'myDur > 0 ? myDur : lineSec(line, i) / state.speed;'],
  ['showClip 의 낡은 호출 가드 항상거짓', "    if (seq !== clipSeq) return;\n    if (autoplay) holdFrame();", "    if (false) return;\n    if (autoplay) holdFrame();"],
];

const failsOf = (r) => r.filter((x) => !x.ok);
let FAIL = 0, PASS = 0;
const print = (r) => r.forEach((x) => { if (x.ok) { PASS++; console.log('  ✅ ' + x.name); } else { FAIL++; console.log('  ❌ ' + x.name + (x.extra !== undefined ? '  →  ' + JSON.stringify(x.extra) : '')); } });

console.log('▶ A.i 더빙동영상 스튜디오 — 소리·화면 맞춤');
print(staticChecks());
const base = await suite(HTML);
print(base);

console.log('▶ 변이시험');
const baseFails = failsOf(base).length;
if (baseFails > 0) { FAIL++; console.log('  ❌ (전제) 원본이 깨끗하지 않아 변이시험을 믿을 수 없습니다 — 원본 실패 ' + baseFails); }
else {
  for (const [name, from, to] of MUTATIONS) {
    const n = HTML.split(from).length - 1;
    if (n !== 1) { FAIL++; console.log('  ❌ 변이 앵커를 못 찾음(' + n + '곳): ' + name); continue; }
    const r = await suite(HTML.replace(from, to), { quick: true });
    const f = failsOf(r);
    if (f.length > 0) { PASS++; console.log('  ✅ 변이 «' + name + '» → 실제 FAIL ' + f.length + '건 (' + f[0].name + ')'); }
    else { FAIL++; console.log('  ❌ 변이 «' + name + '» 를 아무 검사도 못 잡음'); }
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL > 0 ? 1 : 0);
