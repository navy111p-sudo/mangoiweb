// warmup_auto_talk_harness.mjs — A.i 말하기 연습 «자동 말하기 (베타)» 회귀 감시 (2026-09-24)
//
// 무엇을 지키나
//   ① 기본은 버튼 모드 — AI 말이 끝나도 마이크가 저절로 열리지 않는다(기존 동작 보존)
//   ② 자동 모드 — AI 말이 «끝난 뒤» 에만 연다. 말하는 중·전송 중·멈춤·글 입력 중에는 안 연다
//   ③ 화상수업 안(iframe)에서는 베타 동안 꺼 둔다
//   ④ 안드로이드는 녹음+Whisper 경로(삐 소리 없음), 그 밖은 기존 toggleMic
//   ⑤ 아무 말 없이 연속 2번이면 쉬고, 🎤 를 누르면 다시 깨어난다
//   ⑥ warmup.html 의 speak() 가 «끝까지 읽은 대화 차례» 에만 aiDone 을 보낸다(배선을 실제로 돌림)
//
// ⚠️ 문자열 검사만으로는 못 잡는 종류라 모듈과 speak() 를 가짜 DOM·가짜 시계로 «실제로» 돌린다.
//    각 «연다» 검사 옆에 «안 연다» 짝을 둔다 — 짝이 없으면 «언제나 열기»/«절대 안 열기» 가 통과한다.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const MOD_SRC = fs.readFileSync(process.env.AUTOTALK_SRC || path.join(PUB, 'js', 'warmup-auto-talk.js'), 'utf8');
const HTML = fs.readFileSync(process.env.WARMUP_SRC || path.join(PUB, 'warmup.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra !== undefined ? '— ' + JSON.stringify(extra) : ''); }
}

/* ── 가짜 DOM / 시계 ─────────────────────────────────────── */
function makeEl(id) {
  const el = {
    id, hidden: false, innerHTML: '', textContent: '', value: '', children: [], attrs: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    parentNode: null, _ls: {},
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); },
    insertBefore(n, ref) { n.parentNode = this; this.children.push(n); if (n.id) reg[n.id] = n; },
    get firstChild() { return this.children[0] || null; },
  };
  return el;
}
let reg = {};
function makeWorld({ embedded = false, android = false, mode = null, unlocked = true, menuUi = false } = {}) {
  reg = {};
  let now = 0; const timers = [];
  const store = {}; if (mode) store.mangoi_warmup_talk_mode = mode;
  const calls = { toggleMic: 0, micViaWhisper: 0, abort: 0 };
  const wgState = makeEl('wgState'); const composer = makeEl('composer'); wgState.parentNode = composer;
  const inp = makeEl('inp'); const setup = makeEl('wuSetup'); setup.hidden = true;
  const menu = makeEl('menuPanel');
  ['wgState', 'inp', 'wuSetup', 'menuPanel'].forEach((k, i) => { reg[k] = [wgState, inp, setup, menu][i]; });
  const doc = {
    readyState: 'complete', hidden: false, activeElement: null, head: { appendChild() {} },
    getElementById: (id) => reg[id] || (menuUi && reg.menuTalkGroup && (id === 'menuTalkBtns' || id === 'talkVal') ? (reg[id] = makeEl(id)) : null),
    querySelector: (sel) => (menuUi && sel === '#menuPanel .menu-scroll' ? (reg.__scroll = reg.__scroll || makeEl('')) : null),
    createElement: (t) => makeEl(''),
    addEventListener() {},
  };
  const win = {
    document: doc, navigator: { userAgent: android ? 'Mozilla/5.0 (Linux; Android 14)' : 'Mozilla/5.0 (Windows NT 10.0)' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    setTimeout: (f, ms) => { const t = { f, at: now + ms, id: timers.length + 1, dead: false }; timers.push(t); return t; },
    clearTimeout: (t) => { if (t) t.dead = true; },
    _warmPaused: false, sending: false, _recognizing: false, _whisperOn: false, _audioUnlocked: unlocked, _ttsAudio: null,
    speechSynthesis: { speaking: false },
    toggleMic() { calls.toggleMic++; win.WarmupAutoTalk.on('press'); win._recognizing = true; win.WarmupAutoTalk.on('mic', true); },
    micViaWhisper() { calls.micViaWhisper++; win._whisperOn = true; win.WarmupAutoTalk.on('mic', true); },
    closeMenu() { calls.closeMenu = (calls.closeMenu || 0) + 1; menu.classList.remove('open'); },
    _micAbortQuiet() { calls.abort++; win._recognizing = false; win._whisperOn = false; win.WarmupAutoTalk.on('mic', false); },
  };
  win.window = win; win.parent = embedded ? {} : win;
  vm.createContext(win);
  vm.runInContext(MOD_SRC, win);
  const T = {
    win, calls, store, inp, menu, setup,
    tick(ms) { const end = now + ms; for (;;) { const due = timers.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; due.dead = true; now = due.at; due.f(); } now = end; },
    on: (e, a) => win.WarmupAutoTalk.on(e, a),
    endMic() { win._recognizing = false; win._whisperOn = false; win.WarmupAutoTalk.on('mic', false); },
    pill: () => reg.autoTalkPill,
  };
  return T;
}
const DELAY = 600;

console.log('\n[A] 기본은 버튼 모드 — 기존 동작 보존');
{
  const T = makeWorld();
  ok('A-1 저장값이 없으면 버튼 모드', T.win.WarmupAutoTalk.mode() === 'button');
  T.on('aiDone'); T.tick(5000);
  ok('A-2 버튼 모드에서는 AI 말이 끝나도 마이크가 안 열린다', T.calls.toggleMic === 0 && T.calls.micViaWhisper === 0, T.calls);
  ok('A-3 기본값을 저장소에 «미리» 써 넣지 않는다', !('mangoi_warmup_talk_mode' in T.store));
  T.on('sent');
  ok('A-4 버튼 모드에서는 상태 표시가 안 뜬다', !T.pill() || T.pill().hidden === true);
}

console.log('\n[B] 자동 모드 — 끝난 «뒤» 에만 연다');
{
  const T = makeWorld({ mode: 'auto' });
  T.on('aiDone'); T.tick(DELAY - 1);
  ok('B-1 잔향 대기 전에는 안 연다', T.calls.toggleMic === 0);
  T.tick(1);
  ok('B-2 대기 뒤 기존 toggleMic 으로 연다(짝)', T.calls.toggleMic === 1, T.calls);
  ok('B-3 열리면 «👂 듣는 중»', T.pill() && !T.pill().hidden && /듣는 중/.test(T.pill().innerHTML), T.pill() && T.pill().innerHTML);
  T.on('phase', 'speak');
  ok('B-4 말이 들리면 «🗣️ 말하는 중»', /말하는 중/.test(T.pill().innerHTML));
  T.win._recognizing = false; T.on('mic', false); T.on('sent');
  ok('B-5 보내면 «🤖 AI 확인 중»', /AI 확인 중/.test(T.pill().innerHTML));
  T.on('reply');
  ok('B-6 답이 오면 «✅ 완료»', /완료/.test(T.pill().innerHTML));
  T.tick(2000);
  ok('B-7 보낸 차례는 «못 들음» 으로 세지 않는다', T.win.WarmupAutoTalk._state.misses === 0);
}

console.log('\n[C] 자동 모드라도 안 여는 때');
const blockers = [
  ['C-1 AI 가 아직 말하는 중(오디오 재생)', (T) => { T.win._ttsAudio = { paused: false, ended: false }; }],
  ['C-2 기기 음성으로 말하는 중', (T) => { T.win.speechSynthesis.speaking = true; }],
  ['C-3 전송 중', (T) => { T.win.sending = true; }],
  ['C-4 멈춤 상태', (T) => { T.win._warmPaused = true; }],
  ['C-5 한 번도 안 눌러 브라우저가 마이크를 막는 상태', (T) => { T.win._audioUnlocked = false; }],
  ['C-6 글을 입력하는 중(포커스)', (T) => { T.win.document.activeElement = T.inp; }],
  ['C-7 입력칸에 글이 남아 있음', (T) => { T.inp.value = 'I like'; }],
  ['C-8 이미 듣는 중', (T) => { T.win._recognizing = true; }],
  ['C-9 탭이 가려짐', (T) => { T.win.document.hidden = true; }],
  ['C-10 설정 화면이 떠 있음', (T) => { T.setup.hidden = false; }],
  ['C-11 ⋮ 메뉴를 고르는 중', (T) => { T.menu.classList.add('open'); }],
];
for (const [name, set] of blockers) {
  const T = makeWorld({ mode: 'auto' }); set(T); T.on('aiDone'); T.tick(5000);
  ok(name, T.calls.toggleMic === 0 && T.calls.micViaWhisper === 0, T.calls);
}
{
  const T = makeWorld({ mode: 'auto' }); T.on('aiDone'); T.tick(200); T.on('aiStart'); T.tick(5000);
  ok('C-12 여는 대기 중에 AI 가 다시 말하면 취소', T.calls.toggleMic === 0);
  const T2 = makeWorld({ mode: 'auto' }); T2.on('aiDone'); T2.tick(200); T2.inp._ls.input && T2.inp._ls.input.forEach((f) => f()); T2.tick(5000);
  ok('C-13 여는 대기 중에 글을 쓰기 시작하면 취소', T2.calls.toggleMic === 0 && !!T2.inp._ls.input);
}

console.log('\n[D] 열려 있는데 AI 가 다시 말하면 «보내지 않고» 닫는다');
{
  const T = makeWorld({ mode: 'auto' }); T.on('aiDone'); T.tick(DELAY);
  T.on('aiStart');
  ok('D-1 자동으로 연 듣기는 조용히 닫는다', T.calls.abort === 1, T.calls);
  const T2 = makeWorld({ mode: 'auto' }); T2.on('press'); T2.win._recognizing = true; T2.on('mic', true); T2.on('aiStart');
  ok('D-2 사람이 직접 연 듣기는 건드리지 않는다(짝 — 버튼 모드 동작 보존)', T2.calls.abort === 0);
}

console.log('\n[E] 환경');
{
  const T = makeWorld({ mode: 'auto', android: true }); T.on('aiDone'); T.tick(DELAY);
  ok('E-1 안드로이드는 녹음+Whisper 경로(삐 소리 없음)', T.calls.micViaWhisper === 1 && T.calls.toggleMic === 0, T.calls);
  const T2 = makeWorld({ mode: 'auto', android: false }); T2.on('aiDone'); T2.tick(DELAY);
  ok('E-2 그 밖은 기존 toggleMic(짝)', T2.calls.toggleMic === 1 && T2.calls.micViaWhisper === 0, T2.calls);
  const T3 = makeWorld({ mode: 'auto', embedded: true }); T3.on('aiDone'); T3.tick(5000);
  ok('E-3 화상수업 안(iframe)에서는 저장값이 자동이어도 안 연다', T3.calls.toggleMic === 0 && T3.calls.micViaWhisper === 0);
  ok('E-4 화상수업 안에서는 isOn() 이 거짓', T3.win.WarmupAutoTalk.isOn() === false);
}

console.log('\n[F] 아무 말 없으면 쉬고, 🎤 로 깨운다');
{
  const T = makeWorld({ mode: 'auto' });
  T.on('aiDone'); T.tick(DELAY); T.endMic();
  // Whisper 한 번 더 듣기가 곧바로 이어지는 경우는 세지 않는다
  T.tick(100); T.win._whisperOn = true; T.on('mic', true); T.tick(2000); T.endMic(); T.tick(1000);
  ok('F-1 빈손 1번(Whisper 재시도가 이어진 것은 한 번으로 셈)', T.win.WarmupAutoTalk._state.misses === 1, T.win.WarmupAutoTalk._state.misses);
  T.on('aiDone'); T.tick(DELAY); T.endMic(); T.tick(1000);
  ok('F-2 연속 2번이면 쉰다', T.win.WarmupAutoTalk._state.resting === true);
  const before = T.calls.toggleMic;
  T.on('aiDone'); T.tick(5000);
  ok('F-3 쉬는 동안은 AI 말이 끝나도 안 연다', T.calls.toggleMic === before);
  ok('F-4 쉰다는 사실을 화면이 말한다', /쉬어요/.test(reg.wgState.textContent), reg.wgState.textContent);
  T.on('press');
  ok('F-5 🎤 를 누르면 깨어난다', T.win.WarmupAutoTalk._state.resting === false);
}

console.log('\n[G] 모드 고르기');
{
  const T = makeWorld();
  T.win.WarmupAutoTalk.setMode('auto');
  ok('G-1 자동을 고르면 저장된다', T.store.mangoi_warmup_talk_mode === 'auto');
  T.win.WarmupAutoTalk.setMode('button'); T.on('aiDone'); T.tick(5000);
  ok('G-2 버튼으로 되돌리면 다시 안 연다', T.calls.toggleMic === 0 && T.store.mangoi_warmup_talk_mode === 'button');
}
// 2026-09-24 제보 — 인사가 끝난 뒤 ⋮ 메뉴에서 «자동» 을 골랐는데 아무 일도 없었다.
{
  const T = makeWorld();
  T.win.WarmupAutoTalk.setMode('auto'); T.tick(DELAY);
  ok('G-3 조용할 때 자동을 고르면 그 자리에서 연다', T.calls.toggleMic === 1, T.calls);
}
{
  const T = makeWorld(); T.win._ttsAudio = { paused: false, ended: false };
  T.win.WarmupAutoTalk.setMode('auto'); T.tick(DELAY);
  ok('G-4 (짝) AI 가 말하는 중에 고르면 안 연다', T.calls.toggleMic === 0, T.calls);
}
{
  const T = makeWorld(); T.menu.classList.add('open');
  T.win.WarmupAutoTalk.setMode('auto'); T.tick(DELAY);
  ok('G-5 ⋮ 메뉴가 열린 동안에는 고르기만 하고 안 연다', T.calls.toggleMic === 0, T.calls);
  T.win.closeMenu(); T.tick(DELAY - 1);
  ok('G-6 메뉴를 닫아도 잔향 대기 전엔 안 연다', T.calls.toggleMic === 0);
  T.tick(1);
  ok('G-7 메뉴를 닫으면 연다(원래 closeMenu 도 그대로 불림)', T.calls.toggleMic === 1 && T.calls.closeMenu === 1 && !T.menu.classList.contains('open'), T.calls);
}
{
  const T = makeWorld(); T.menu.classList.add('open');
  T.win.closeMenu(); T.tick(5000);
  ok('G-8 (짝) 버튼 모드에서 메뉴를 닫으면 안 연다', T.calls.toggleMic === 0 && T.calls.closeMenu === 1, T.calls);
}
// 2026-09-24 두 번째 제보 — ⋮ 메뉴에서 «자동» 을 누르고 메뉴를 열어 둔 채 기다림 → 안 켜짐.
function clickTalk(T, which) {
  const box = reg.menuTalkBtns; const fn = box && box._ls.click && box._ls.click[0];
  if (!fn) return false;
  fn({ target: { closest: () => ({ getAttribute: () => which }) } }); return true;
}
{
  const T = makeWorld({ menuUi: true }); T.menu.classList.add('open');
  ok('G-10 (전제) ⋮ 메뉴 안 «말하는 방법» 칸이 실제로 붙었다', !!(reg.menuTalkBtns && reg.menuTalkBtns._ls.click));
  clickTalk(T, 'auto'); T.tick(DELAY);
  ok('G-11 메뉴에서 «자동» 을 누르면 메뉴가 닫히고 마이크가 켜진다', !T.menu.classList.contains('open') && T.calls.toggleMic === 1, T.calls);
}
{
  const T = makeWorld({ menuUi: true, mode: 'auto' }); T.menu.classList.add('open');
  clickTalk(T, 'button'); T.tick(5000);
  ok('G-12 (짝) «버튼» 을 누르면 메뉴는 그대로·마이크 안 켬', T.menu.classList.contains('open') && T.calls.toggleMic === 0, T.calls);
}
{
  const T = makeWorld({ mode: 'auto' });
  T.win.closeMenu(); T.tick(5000);
  ok('G-9 (짝) 이미 닫힌 메뉴를 또 닫는 호출(다른 기능이 부름)로는 안 연다', T.calls.toggleMic === 0, T.calls);
}

// 2026-09-24 사장님 「햄버거 안 뿐만 아니라 잘 보이는 곳에」 — 입력칸 바로 위 스위치.
console.log('\n[J] 입력칸 위 «말하는 방법» 스위치');
function clickSw(which) {
  const box = reg.talkSwitch; const fn = box && box._ls.click && box._ls.click[0];
  if (!fn) return false;
  fn({ target: { closest: () => ({ getAttribute: () => which }) } }); return true;
}
{
  const T = makeWorld();
  const sw = reg.talkSwitch;
  ok('J-1 (전제) 스위치가 입력칸 쪽(wgState 와 같은 부모)에 붙었다', !!(sw && sw.parentNode === reg.wgState.parentNode));
  ok('J-2 기본은 «버튼» 이 켜져 보인다', /data-talk="button" aria-pressed="true" class="on"/.test(sw.innerHTML) && /data-talk="auto" aria-pressed="false">/.test(sw.innerHTML), sw.innerHTML);
  clickSw('auto'); T.tick(DELAY);
  ok('J-3 스위치에서 «자동» 을 누르면 저장되고 바로 마이크가 켜진다', T.store.mangoi_warmup_talk_mode === 'auto' && T.calls.toggleMic === 1, T.calls);
  ok('J-4 누른 뒤 «자동» 이 켜져 보인다', /data-talk="auto" aria-pressed="true" class="on"/.test(sw.innerHTML), sw.innerHTML);
}
{
  const T = makeWorld({ mode: 'auto' });
  clickSw('button'); T.on('aiDone'); T.tick(5000);
  ok('J-5 (짝) «버튼» 을 누르면 다시 저절로 안 켜진다', T.store.mangoi_warmup_talk_mode === 'button' && T.calls.toggleMic === 0, T.calls);
}
{
  const T = makeWorld({ embedded: true });
  ok('J-6 수업 안(iframe)에서는 스위치를 안 그린다', !reg.talkSwitch);
}

/* ── ⑥ warmup.html 의 배선 — speak() 를 오려 내 실제로 돌린다 ─────────── */
console.log('\n[H] warmup.html 배선 (speak 를 실제로 실행)');
function bodyOf(src, head) {
  const i = src.indexOf(head); if (i < 0) return null;
  const b = src.indexOf('{', i); let d = 0;
  for (let k = b; k < src.length; k++) { const c = src[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return null;
}
const speakSrc = bodyOf(HTML, 'function speak(text, btn){');
const stopSrc = bodyOf(HTML, 'function _stopSpeak(){');
ok('H-0 전제: speak()·_stopSpeak() 를 오려 냈다', !!speakSrc && !!stopSrc);
function runSpeak({ speechOn = true, btn = null, interrupt = false, synth = false }) {
  let synthDone = null;
  const hooks = [];
  const audio = { play: () => ({ then: (f) => ({ catch() {} }) }), pause() {} };
  const ctx = {
    hooks, _warmPaused: false, _speechOn: speechOn, _speakSeq: 0, _ttsAudio: null, _lastAiSpeak: null,
    _speechEverStarted: false, AUDIO_RATE: { 3: 1 }, _rateLevel: 3, ZH_MALE_PITCH: 0.78,
    _ttsCache: { 'emma|hi there': 'blob:x' }, _ttsEng: { 'emma|hi there': 'azure' },
    window: {}, Audio: function () { return audio; },
    _speechText: (t) => t, isZh: () => synth, _voiceGender: () => (synth ? 'male' : 'female'), _zhMaleVoiceReady: () => synth,
    nextSpeaker: () => 'emma', _zhMaleWanted: () => false, _synthSpeak(t, b, d) { synthDone = d; }, _ttsSpeak() {},
    _autoHook: (e, a) => hooks.push(e),
  };
  vm.createContext(ctx);
  try { vm.runInContext(stopSrc + '\n' + speakSrc + '\nspeak("hi there", __btn);', Object.assign(ctx, { __btn: btn })); }
  catch (e) { return { err: String(e && e.message), hooks }; }
  if (interrupt) vm.runInContext('_stopSpeak();', ctx);
  // 기기 음성은 cancel() 뒤에도 onend 가 «불린다» — 그 경로에서 _speakSeq 비교가 일한다
  try { if (synth) { synthDone && synthDone(); } else if (audio.onended) audio.onended(); } catch (e) { return { err: String(e.message), hooks }; }
  return { hooks };
}
{
  const r1 = runSpeak({});
  ok('H-1 대화 차례 낭독이 끝나면 aiStart → aiDone', !r1.err && r1.hooks.join(',') === 'aiStart,aiDone', r1);
  const r2 = runSpeak({ btn: { classList: { add() {}, remove() {} } } });
  ok('H-2 «다시 듣기»(btn) 는 aiDone 을 안 보낸다(짝)', !r2.err && r2.hooks.includes('aiStart') && !r2.hooks.includes('aiDone'), r2);
  const r3 = runSpeak({ interrupt: true });
  ok('H-3 중간에 끊긴 낭독은 aiDone 을 안 보낸다', !r3.err && !r3.hooks.includes('aiDone'), r3);
  const r3b = runSpeak({ synth: true, interrupt: true });
  ok('H-3b 기기 음성이 멈춤 뒤 onend 를 불러도 aiDone 을 안 보낸다', !r3b.err && r3b.hooks.includes('aiStart') && !r3b.hooks.includes('aiDone'), r3b);
  const r3c = runSpeak({ synth: true });
  ok('H-3c 기기 음성이 끝까지 읽으면 aiDone(짝)', !r3c.err && r3c.hooks.join(',') === 'aiStart,aiDone', r3c);
  const r4 = runSpeak({ speechOn: false });
  ok('H-4 소리를 꺼 두었으면 곧바로 aiDone', !r4.err && r4.hooks.join(',') === 'aiDone', r4);
  const r5 = runSpeak({ speechOn: false, btn: { classList: { add() {}, remove() {} } } });
  ok('H-5 소리 꺼짐 + 다시 듣기는 아무것도 안 보낸다', !r5.err && r5.hooks.length === 0, r5);
}

console.log('\n[I] warmup.html 배선 (나머지 연결 지점)');
{
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const sms = bodyOf(HTML, 'function setMicState(on){');
  ok('I-1 setMicState 가 듣기 열림/닫힘을 알린다', !!sms && /_autoHook\(\s*'mic'\s*,\s*on\s*\)/.test(strip(sms)));
  const tm = bodyOf(HTML, 'function toggleMic(){');
  const tmS = tm && strip(tm);
  ok('I-2 toggleMic 이 «눌림» 을 알린다 — 멈춤·전송 가드 «뒤»', !!tmS && tmS.indexOf("_autoHook('press')") > tmS.indexOf('if(_warmPaused || sending)return;') && tmS.indexOf('if(_warmPaused || sending)return;') >= 0);
  const sm = bodyOf(HTML, 'async function sendMsg(){');
  const smS = sm && strip(sm);
  ok('I-3 sendMsg 가 sent·reply·settled 를 알린다', !!smS && ["'sent'", "'reply'", "'settled'"].every((k) => smS.includes('_autoHook(' + k)));
  ok('I-4 reply 는 AI 말풍선을 그리기 «전»', !!smS && smS.indexOf("_autoHook('reply')") < smS.indexOf("addMsg(d.ai_response"));
  const ab = bodyOf(HTML, 'function _micAbortQuiet(){');
  ok('I-5 _micAbortQuiet 이 있다', !!ab);
  if (ab) {
    const c = { _whisperOn: true, _recognizing: true, _warmVoiceEpoch: 0, _micStopWanted: false, _micBase: 'x', _micSess: 'y', canceled: 0, stopped: 0, sent: 0, states: [] };
    c.MangoiVoice = { cancel() { c.canceled++; } }; c._recog = { stop() { c.stopped++; } };
    c.setMicState = (on) => c.states.push(on); c.sendMsg = () => c.sent++;
    vm.createContext(c); vm.runInContext(ab + '\n_micAbortQuiet();', c);
    ok('I-6 닫을 때 들은 조각을 버리고 «보내지 않는다»', c.canceled === 1 && c.stopped === 1 && c._micStopWanted === true && c._micBase === '' && c._micSess === '' && c.sent === 0, c);
  }
  ok('I-7 모듈을 싣는다(defer)', /<script src="\/js\/warmup-auto-talk\.js\?v=\d+" defer><\/script>/.test(HTML));
  const noHook = HTML.includes('function _autoHook(');
  ok('I-8 _autoHook 은 모듈이 없어도 안 죽는다(try)', noHook && /function _autoHook\(ev, a\)\{ try\{/.test(HTML));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
