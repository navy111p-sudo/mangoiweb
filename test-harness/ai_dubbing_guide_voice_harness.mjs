// ═══════════════════════════════════════════════════════════════════════
// 🔊 A.i영화더빙 «사용방법» 음성 안내 회귀 하니스 (2026-10-26)
//   요청(사장님): 안내를 «클릭하면 바로 들리게» · «끄기» 버튼
//   ① 판정 — sceneAt(장면 경계 앞뒤·범위 밖·이상값) · 장면 시작 시각 표(11개·0부터·늘어남) · 음원 주소
//   ② 동작 — 가짜 화면·가짜 <audio> 에서 진짜 파일을 «실제로 돌려» 본다
//        저절로 열림=소리 0 · 사람이 엶=바로 소리 · 듣기↔끄기 · ✕·Esc·오늘 숨김=끔 · 시작하기=이어 듣기+아래 막대
//        다른 영상 재생·녹음 시작·페이지 떠남=끔 · 언어 바꿈=그 장면 처음부터 · 늦게 온 실패는 무시 · 실패는 말한다
//   ③ 배선 — 화면이 싣는 순서·?v= · 안내창이 열림/닫힘을 알리는 자리 · 음원 파일(머리·길이가 표와 맞는가) · CSS
//   ④ 하지 말 것 — 마이크·AudioContext·speechSynthesis 0 · 미리 받기 0 · 문서에 붙이기 0 · innerHTML·data-ko/en 0
//   ⑤ 변이시험 — 하나씩 망가뜨린 사본에서 실제로 FAIL 이 나야 한다(조건 뒤집기 포함)
//   «들리는가·보이는가» 는 브라우저 검사가 잰다: node test-harness/manual/ai-dubbing-guide-voice-browser.mjs
//   변이 사본으로 돌리기: DGV_SRC=<고친 사본> node test-harness/ai_dubbing_guide_voice_harness.mjs
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const SRC_PATH = process.env.DGV_SRC || path.join(PUB, 'js', 'ai-dubbing-guide-voice.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── 판정만 싣기(window·document 없음) ───────────────────────────────── */
function loadPure(src) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'ai-dubbing-guide-voice.js' });
  if (!ctx.MangoiDubVoice) throw new Error('MangoiDubVoice 가 없다');
  return ctx.MangoiDubVoice;
}

/* ── 가짜 화면 한 벌 ─────────────────────────────────────────────────── */
function world(src, opts = {}) {
  const W = { lang: opts.lang || 'ko', guideOpen: !!opts.guideOpen, plays: [], pauses: 0, timers: [], focused: null,
    playMode: 'resolve', pending: [], clock: 1000, audios: [] };
  const byId = {};
  function el(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), id: '', type: '', className: '', textContent: '', hidden: false,
      attrs: {}, kids: [], ls: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      appendChild(c) { this.kids.push(c); c.parentNode = this; return c; },
      append(...cs) { cs.forEach(c => this.appendChild(c)); },
      addEventListener(n, f) { (this.ls[n] = this.ls[n] || []).push(f); },
      removeEventListener(n, f) { this.ls[n] = (this.ls[n] || []).filter(x => x !== f); },
      focus() { W.focused = this; },
      closest() { return null; }
    };
    if (e.tagName === 'AUDIO') {
      e.paused = true; e.readyState = 0; e.preload = ''; e._src = ''; e._t = 0;
      Object.defineProperty(e, 'src', { get() { return this._src; }, set(v) { this._src = String(v); this.readyState = 0; } });
      Object.defineProperty(e, 'currentTime', { get() { return this._t; }, set(v) { this._t = Number(v); } });
      e.play = function () {
        W.plays.push({ src: this._src, t: this._t });
        this.paused = false;
        if (W.playMode === 'throw') throw new Error('play 실패');
        if (W.playMode === 'reject') return Promise.reject(new Error('NotAllowedError'));
        if (W.playMode === 'pending') return new Promise((res, rej) => W.pending.push({ res, rej }));
        return Promise.resolve();
      };
      e.pause = function () { this.paused = true; W.pauses++; };
      W.audios.push(e);
    }
    return e;
  }
  const docLs = [];
  const body = el('body');
  const doc = {
    body, createElement: el,
    getElementById(id) { return byId[id] || null; },
    addEventListener(n, f, cap) { docLs.push({ n, f, cap: cap === true || !!(cap && cap.capture) }); },
    removeEventListener() {}
  };
  const winLs = {};
  const win = {
    getLang: () => W.lang,
    addEventListener(n, f) { (winLs[n] = winLs[n] || []).push(f); },
    MangoiDubGuide: { isOpen: () => W.guideOpen }
  };
  const q = el('button'); q.id = 'dub-guide-open'; byId['dub-guide-open'] = q;
  const ctx = { window: win, document: doc, console, Date: { now: () => W.clock },
    setTimeout: (f, ms) => { W.timers.push({ f, ms }); return W.timers.length; } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'ai-dubbing-guide-voice.js' });
  W.api = win.MangoiDubVoice;
  W.el = el; W.body = body; W.q = q; W.docLs = docLs;
  W.audio = () => W.audios[0] || null;
  W.bar = () => body.kids.find(k => k.id === 'dub-voice-bar') || null;
  W.barShown = () => { const b = W.bar(); return !!b && !b.hidden; };
  W.barButton = () => { const b = W.bar(); return b ? b.kids.find(k => k.tagName === 'BUTTON') : null; };
  W.barText = () => { const b = W.bar(); const s = b ? b.kids.find(k => k.tagName === 'SPAN') : null; return s ? s.textContent : ''; };
  /* 문서 수준은 «잡기 단계» 리스너만 받는다 — 미디어 이벤트는 거품이 없고, 클릭은 다른 손잡이가 막을 수 있다 */
  W.fireDoc = (n, target) => docLs.filter(l => l.n === n && l.cap).forEach(l => l.f({ type: n, target }));
  W.fireWin = (n) => (winLs[n] || []).slice().forEach(f => f({ type: n }));
  W.fire = (target, n) => (target.ls[n] || []).slice().forEach(f => f({ type: n, target }));
  W.flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  W.runTimers = () => { const t = W.timers.splice(0); t.forEach(x => x.f()); };
  W.state = () => W.api.state();
  return W;
}

/* ── 음원 머리(첫 프레임) ───────────────────────────────────────────── */
function mp3Info(buf) {
  let off = 0;
  if (buf.slice(0, 3).toString('latin1') === 'ID3') {
    off = 10 + (((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f));
  }
  while (off < buf.length - 4 && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++;
  const b1 = buf[off + 1], b2 = buf[off + 2], b3 = buf[off + 3];
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], SR = [44100, 48000, 32000];
  const kbps = BR[b2 >> 4];
  return { mpeg1: ((b1 >> 3) & 3) === 3, layer3: ((b1 >> 1) & 3) === 1, kbps, sr: SR[(b2 >> 2) & 3], mono: (b3 >> 6) === 3,
    seconds: kbps ? (buf.length - off) * 8 / (kbps * 1000) : 0 };
}
/* 중괄호 짝으로 함수 몸통 자르기 */
function body(code, head) {
  const i = code.indexOf(head); if (i < 0) return '';
  const j = code.indexOf('{', i); let d = 0;
  for (let k = j; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (d === 0) return code.slice(j, k + 1); } }
  return '';
}

/* ── 실행 한 벌 — 원본·변이 사본이 같은 검사를 받는다 ──────────────────── */
async function runAll(src) {
  const fails = [], sections = {};
  const check = (sec, name, cond, extra) => {
    sections[sec] = sections[sec] || { pass: 0, fail: 0 };
    if (cond) sections[sec].pass++; else { sections[sec].fail++; fails.push(sec + ' · ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 180) : '')); }
  };
  let api;
  try { api = loadPure(src); } catch (e) { fails.push('전제 · 판정 모듈을 싣지 못함: ' + e.message); return { fails, sections }; }
  const OFF = api.OFFSETS;

  // ① 판정
  for (const lang of ['ko', 'en']) {
    const o = OFF[lang] || [];
    check('① 판정', `${lang} 장면은 11개`, o.length === 11, o.length);
    check('① 판정', `${lang} 첫 장면은 0초`, o[0] === 0, o[0]);
    check('① 판정', `${lang} 장면 시작 시각은 늘어나기만 한다(최소 5초 간격)`, o.every((t, i) => i === 0 || t - o[i - 1] >= 5));
    o.forEach((t, i) => {
      check('① 판정', `${lang} ${t}초 = ${i + 1}번째 장면`, api.sceneAt(o, t) === i, api.sceneAt(o, t));
      check('① 판정', `${lang} ${t}+0.5초 = ${i + 1}번째 장면`, api.sceneAt(o, t + 0.5) === i);
      if (i > 0) check('① 판정', `${lang} ${t}−0.2초 = ${i}번째 장면(앞 장면)`, api.sceneAt(o, t - 0.2) === i - 1);
    });
    for (const [t, want] of [[-5, 0], [NaN, 0], [undefined, 0], ['abc', 0], [1e6, o.length - 1], [Infinity, o.length - 1]]) {
      let got; try { got = api.sceneAt(o, t); } catch (e) { got = 'throw'; }
      check('① 판정', `${lang} 이상값 ${String(t)} → ${want}`, got === want, got);
    }
  }
  check('① 판정', '두 언어 장면 수가 같다(언어를 바꿔도 같은 장면으로 간다)', (OFF.ko || []).length === (OFF.en || []).length);
  check('① 판정', '음원 주소 — 한국어', api.audioUrl('ko') === '/audio/dubbing-guide/guide-ko.mp3?v=' + api.AUDIO_V, api.audioUrl('ko'));
  check('① 판정', '음원 주소 — 영어', api.audioUrl('en') === '/audio/dubbing-guide/guide-en.mp3?v=' + api.AUDIO_V, api.audioUrl('en'));
  check('① 판정', '모르는 언어는 한국어 음원', api.audioUrl('zz') === api.audioUrl('ko'));

  // ② 동작
  const S = '② 동작';
  const isListen = (b) => /듣기|Listen/.test(b.textContent) && !/끄기|off/i.test(b.textContent);
  const isOff = (b) => /끄기|Sound off/.test(b.textContent);
  try {
    { // 저절로 열림 → 소리 0
      const W = world(src, { guideOpen: true }); const b = W.api.mount(W.el('div'));
      check(S, '창 안 버튼이 생긴다(type=button · dg-voice)', !!b && b.type === 'button' && /dg-voice/.test(b.className));
      check(S, '처음 글은 «소리로 듣기»', isListen(b), b.textContent);
      W.api.guideOpened(false); await W.flush();
      check(S, '저절로 열리면 소리를 틀지 않는다', W.plays.length === 0, W.plays.length);
      check(S, '저절로 열린 뒤에도 «듣기» 그대로', isListen(b) && W.state() === 'idle');
      check(S, '음원을 미리 받지 않는다(요소조차 안 만든다)', W.audios.length === 0, W.audios.length);
    }
    { // 사람이 엶 → 바로 소리
      const W = world(src, { guideOpen: true }); const b = W.api.mount(W.el('div'));
      W.playMode = 'pending';
      W.api.guideOpened(true);
      check(S, '사람이 열면 그 자리에서 play() 한 번', W.plays.length === 1, W.plays.length);
      check(S, '한국어 화면 = 한국어 음원', W.plays[0] && W.plays[0].src === W.api.audioUrl('ko'), W.plays[0]);
      check(S, '처음부터(0초)', W.plays[0] && W.plays[0].t === 0);
      check(S, '받는 동안 «준비 중» 을 말한다', /준비|Loading/.test(b.textContent), b.textContent);
      check(S, '받는 동안에도 «켜짐» 표시(dgv-on)', /dgv-on/.test(b.className));
      W.pending[0].res(); await W.flush();
      check(S, '틀어지면 글이 «소리 끄기»', isOff(b) && W.state() === 'playing', b.textContent);
      check(S, '음원은 preload=none', W.audio() && W.audio().preload === 'none');
      check(S, '창이 열려 있는 동안 아래 막대는 숨는다(창 안 버튼이 끄기)', !W.barShown());
      W.api.guideOpened(true); await W.flush();
      check(S, '이미 나오는 중에 다시 열어도 처음부터 다시 틀지 않는다', W.plays.length === 1, W.plays.length);
      W.audio().currentTime = 30; W.audio().readyState = 4;   // 30초까지 듣다가
      W.fire(b, 'click'); await W.flush();
      check(S, '«소리 끄기» 를 누르면 멈춘다(pause)', W.audio().paused && W.state() === 'idle');
      check(S, '멈추면 글이 «소리로 듣기» 로', isListen(b) && !/dgv-on/.test(b.className), b.textContent);
      W.playMode = 'resolve';
      W.fire(b, 'click'); await W.flush();
      check(S, '«소리로 듣기» 를 누르면 다시 처음(0초)부터 튼다', W.plays.length === 2 && W.plays[1].t === 0 && W.state() === 'playing', W.plays[1]);
    }
    for (const why of ['x', 'esc', 'hide', 'api']) { // ✕·Esc·오늘 숨김 → 끔
      const W = world(src, { guideOpen: true }); W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      W.guideOpen = false; W.api.guideClosed(why); await W.flush();
      check(S, `«${why}» 로 닫으면 소리도 꺼진다`, W.state() === 'idle' && W.audio().paused, W.state());
      check(S, `«${why}» 로 닫으면 아래 막대도 없다`, !W.barShown());
    }
    { // 시작하기 → 이어 듣기 + 아래 막대
      const W = world(src, { guideOpen: true }); const b = W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      W.guideOpen = false; W.api.guideClosed('start'); await W.flush();
      check(S, '«시작하기» 로 닫으면 소리가 이어진다', W.state() === 'playing' && !W.audio().paused);
      check(S, '그때 화면 아래 막대가 보인다', W.barShown());
      check(S, '막대는 role=region + 이름(음성 안내)', W.bar() && W.bar().getAttribute('role') === 'region' && /음성 안내/.test(W.bar().getAttribute('aria-label') || ''));
      check(S, '막대 글 = 음성 안내 중 · 1/11', /음성 안내 중/.test(W.barText()) && /1\/11/.test(W.barText()), W.barText());
      check(S, '막대 버튼 = «끄기»', W.barButton() && /끄기/.test(W.barButton().textContent) && W.barButton().type === 'button', W.barButton() && W.barButton().textContent);
      W.audio().currentTime = W.api.OFFSETS.ko[4] + 1; W.fire(W.audio(), 'timeupdate');
      check(S, '재생 자리가 넘어가면 장면 번호가 따라간다(5/11)', /5\/11/.test(W.barText()), W.barText());
      W.guideOpen = true; W.api.guideOpened(true); await W.flush();
      check(S, '다시 창을 열면 막대는 숨고 창 안 버튼이 «끄기»', !W.barShown() && isOff(b) && W.plays.length === 1);
      W.guideOpen = false; W.api.guideClosed('start'); await W.flush();
      W.fire(W.barButton(), 'click'); await W.flush();
      check(S, '막대의 «끄기» 를 누르면 멈춘다', W.state() === 'idle' && W.audio().paused);
      check(S, '멈추면 막대가 사라진다', !W.barShown());
      check(S, '막대가 사라지면 포커스는 ‘❓ 사용방법’ 으로', W.focused === W.q);
    }
    { // 다른 영상·소리 → 끔
      const W = world(src); W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      W.fireDoc('play', W.audio()); await W.flush();
      check(S, '자기 소리의 play 이벤트로는 안 꺼진다', W.state() === 'playing');
      W.fireDoc('play', W.el('video')); await W.flush();
      check(S, '화면의 다른 영상이 재생되면 바로 끈다(잡기 단계)', W.state() === 'idle' && W.audio().paused);
      W.fireDoc('play', W.el('video')); await W.flush();
      check(S, '이미 꺼진 뒤의 재생 이벤트로 다시 켜지지 않는다', W.state() === 'idle' && W.plays.length === 1);
    }
    { // 녹음 시작 클릭 → 끔
      const W = world(src); W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      const other = W.el('button'); other.closest = () => null;
      W.fireDoc('click', other); await W.flush();
      check(S, '다른 곳을 눌러서는 안 꺼진다', W.state() === 'playing');
      const rec = W.el('span'); let asked = '';
      rec.closest = (sel) => { asked = sel; return /#dub-start\b/.test(sel) ? rec : null; };
      W.fireDoc('click', rec); await W.flush();
      check(S, '‘내 목소리로 녹음 시작’(#dub-start 안쪽) 을 누르면 끈다', W.state() === 'idle', asked);
      check(S, '‘모든 장면 이어서 더빙하기’(#dub-all) 도 같은 감시에 들어 있다', /#dub-all\b/.test(asked), asked);
      check(S, '감상 시작(‘👀 보기’ · 이 작품 이어 보기 · 모든 작품 이어 보기)도 같은 감시에 들어 있다',
        /button\[data-watch\]/.test(asked) && /#dub-w-film\b/.test(asked) && /#dub-w-all\b/.test(asked), asked);
      const html0 = fs.readFileSync(path.join(PUB, 'ai-dubbing.html'), 'utf8'), player0 = fs.readFileSync(path.join(PUB, 'js', 'ai-dubbing.js'), 'utf8');
      for (const id of (asked.match(/#[\w-]+/g) || [])) check(S, `감시하는 ${id} 가 화면에 실제로 있다`, html0.includes(`id="${id.slice(1)}"`), id);
      check(S, '감시하는 data-watch 버튼을 화면이 실제로 그린다', /class="btn wbtn" data-watch="/.test(player0));
      check(S, '텍스트 노드(closest 없음)를 눌러도 던지지 않는다', (() => { try { W.fireDoc('click', { nodeType: 3 }); return true; } catch (e) { return false; } })());
    }
    { // 페이지 떠남 → 끔
      const W = world(src); W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      W.fireWin('pagehide'); await W.flush();
      check(S, '페이지를 떠나면(pagehide) 끈다', W.state() === 'idle' && W.audio().paused);
    }
    { // 끝까지 들음
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      W.fire(W.audio(), 'ended'); await W.flush();
      check(S, '끝까지 들으면 «소리로 듣기» 로 돌아간다', W.state() === 'idle' && isListen(b));
    }
    { // 못 틀었음(브라우저가 막음) → 말한다 → 잠시 뒤 원래 글
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.playMode = 'reject'; W.api.guideOpened(true); await W.flush();
      check(S, '못 틀면 «켜짐» 으로 남지 않는다', W.state() === 'idle' && !/dgv-on/.test(b.className));
      check(S, '못 틀면 그렇다고 말한다(다시 누르기)', /못 틀었어요/.test(b.textContent), b.textContent);
      W.clock += 5000; W.runTimers();
      check(S, '잠시 뒤 «소리로 듣기» 로 돌아간다', isListen(b), b.textContent);
      W.playMode = 'throw'; W.fire(b, 'click'); await W.flush();
      check(S, 'play() 가 던져도 화면은 안 멈추고 실패를 말한다', W.state() === 'idle' && /못 틀었어요/.test(b.textContent));
      W.playMode = 'resolve'; W.fire(b, 'click'); await W.flush();
      W.fire(W.audio(), 'error'); await W.flush();
      check(S, '듣는 중 음원 오류(error) 도 실패로 말한다', W.state() === 'idle' && /못 틀었어요/.test(b.textContent));
    }
    { // 늦게 온 실패는 무시 ① 끈 뒤
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.playMode = 'pending'; W.api.guideOpened(true);
      W.fire(b, 'click'); await W.flush();              // 받는 중에 끄기
      W.pending[0].rej(new Error('AbortError')); await W.flush();
      check(S, '끈 뒤에 온 AbortError 를 «못 틀었어요» 로 말하지 않는다', isListen(b) && !/못 틀었어요/.test(b.textContent), b.textContent);
    }
    { // 늦게 온 실패는 무시 ② 끄고 다시 켠 뒤 — 앞 요청의 실패가 «새 요청이 받는 중» 에 도착
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.playMode = 'pending'; W.api.guideOpened(true);   // 요청 0
      W.fire(b, 'click');                                 // 끄기
      W.fire(b, 'click');                                 // 다시 켬 = 요청 1
      W.pending[0].rej(new Error('AbortError')); await W.flush();
      check(S, '앞 요청의 실패가 새로 켠 소리를 끄지 않는다', W.state() === 'loading' && /dgv-on/.test(b.className), W.state());
      W.pending[1].res(); await W.flush();
      check(S, '새 요청이 끝나면 «소리 끄기»', W.state() === 'playing' && isOff(b));
    }
    { // 언어 바꿈 — 그 장면 처음부터 다른 언어로
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      const k = 3, ko = W.api.OFFSETS.ko, en = W.api.OFFSETS.en;
      W.audio().currentTime = ko[k] + 2.5; W.audio().readyState = 4;
      W.lang = 'en'; W.fireWin('mangoi:lang-changed'); await W.flush();
      check(S, '듣는 중 언어를 바꾸면 영어 음원으로 다시 튼다', W.plays.length === 2 && W.plays[1].src === W.api.audioUrl('en'), W.plays.map(p => p.src));
      W.fire(W.audio(), 'loadedmetadata');
      check(S, '그 장면(4번째) 처음 자리로 간다', Math.abs(W.audio().currentTime - en[k]) < 0.001, W.audio().currentTime);
      check(S, '글도 영어로(Sound off)', /Sound off/.test(b.textContent), b.textContent);
      W.fireWin('mangoi:lang-changed'); await W.flush();
      check(S, '같은 언어로 또 알려도(두 번 쏨) 다시 틀지 않는다', W.plays.length === 2);
      W.audio().readyState = 4; W.audio().currentTime = en[7] + 1;
      W.lang = 'ko'; W.fireWin('mangoi:lang-changed'); await W.flush();
      check(S, '받아 둔 뒤면 곧바로 그 장면 자리(8번째)로', W.plays.length === 3 && W.plays[2].src === W.api.audioUrl('ko'), W.plays.length);
      W.fire(W.audio(), 'loadedmetadata');
      check(S, '한국어 8번째 장면 시작 자리', Math.abs(W.audio().currentTime - ko[7]) < 0.001, W.audio().currentTime);
    }
    { // 꺼져 있을 때 언어 바꿈 — 글만
      const W = world(src); const b = W.api.mount(W.el('div'));
      W.lang = 'en'; W.fireWin('mangoi:lang-changed'); await W.flush();
      check(S, '꺼져 있으면 언어를 바꿔도 소리는 안 난다', W.plays.length === 0);
      check(S, '글은 영어로(Listen)', /Listen/.test(b.textContent), b.textContent);
    }
    { // 영어 화면에서 시작
      const W = world(src, { lang: 'en' }); W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      check(S, '영어 화면이면 영어 음원부터', W.plays[0] && W.plays[0].src === W.api.audioUrl('en'));
      W.guideOpen = false; W.api.guideClosed('start'); await W.flush();
      check(S, '영어 막대 = Voice guide · Turn off', /Voice guide/.test(W.barText()) && /Turn off/.test(W.barButton().textContent), W.barText());
    }
    { // 버튼이 둘이어도 함께
      const W = world(src); const b1 = W.api.mount(W.el('div')), b2 = W.api.mount(W.el('div'));
      W.api.guideOpened(true); await W.flush();
      check(S, '단 버튼이 여럿이면 글이 함께 바뀐다', isOff(b1) && isOff(b2));
      check(S, '틀 곳이 없으면(null) 버튼을 안 단다', W.api.mount(null) === null);
    }
  } catch (e) { check(S, '동작 검사 중 예외 없음', false, String(e && e.stack || e).slice(0, 300)); }

  // ③ 배선
  const html = fs.readFileSync(path.join(PUB, 'ai-dubbing.html'), 'utf8');
  const guide = strip(fs.readFileSync(path.join(PUB, 'js', 'ai-dubbing-guide.js'), 'utf8'));
  const css = fs.readFileSync(path.join(PUB, 'css', 'ai-dubbing-guide.css'), 'utf8');
  const iV = html.search(/<script defer src="\/js\/ai-dubbing-guide-voice\.js\?v=\d+"><\/script>/);
  const iG = html.search(/<script defer src="\/js\/ai-dubbing-guide\.js\?v=\d+"><\/script>/);
  check('③ 배선', '화면이 음성 스크립트를 버전 달아 defer 로 싣는다', iV > 0);
  check('③ 배선', '음성 스크립트가 안내창 «앞» 에 실린다(저절로 열리기 전에 준비)', iV > 0 && iG > iV);
  const fOpen = body(guide, 'function open('), fClose = body(guide, 'function close('), fBuild = body(guide, 'function build(');
  check('③ 배선', '안내창이 «사람이 열었는가» 를 알린다(open 안 · guideOpened(!!opener))', /voice\(\)\.guideOpened\(!!opener\)/.test(fOpen));
  check('③ 배선', '이미 열린 창을 다시 열 때는 알리지 않는다(앞에서 return)', fOpen.indexOf('if (was) return') > 0 && fOpen.indexOf('if (was) return') < fOpen.indexOf('guideOpened'));
  check('③ 배선', '안내창이 «왜 닫혔는가» 를 알린다(close 안 · guideClosed(why))', /voice\(\)\.guideClosed\(why\)/.test(fClose));
  check('③ 배선', '닫힘 알림은 «시작하기» 로 빠져나가기 전에 한다', fClose.indexOf('guideClosed(why)') > 0 && fClose.indexOf('guideClosed(why)') < fClose.indexOf("if (why === 'start')"));
  check('③ 배선', '닫힘 알림은 창을 숨긴 «뒤» (막대가 창 상태를 바로 읽게)', fClose.indexOf('ov.hidden = true') > 0 && fClose.indexOf('ov.hidden = true') < fClose.indexOf('guideClosed(why)'));
  check('③ 배선', '창 아래 줄에 «소리로 듣기» 버튼을 단다(build 안 · mount(row))', /voice\(\)\.mount\(row\)/.test(fBuild));
  check('③ 배선', '음성이 안 실려도 안내창은 돈다(voice() 가 없으면 null)', /function voice\(\)[^\n]*typeof v\.mount === 'function' \? v : null/.test(guide));
  check('③ 배선', '‘❓ 사용방법’ 클릭은 버튼을 opener 로 넘긴다 = 사람이 엶', /btn\.addEventListener\('click', function \(\) \{ open\(0, btn\); \}\)/.test(guide));
  check('③ 배선', '저절로 열기는 opener 없이(null) = 소리 0', /\) open\(0, null\);/.test(guide));
  check('③ 배선', '안내창은 isOpen 을 내놓는다(막대가 창 상태를 읽는 곳)', /api\.isOpen = function/.test(guide));
  // 음원
  for (const lang of ['ko', 'en']) {
    const f = path.join(PUB, 'audio', 'dubbing-guide', `guide-${lang}.mp3`);
    const ex = fs.existsSync(f);
    check('③ 배선', `음원 guide-${lang}.mp3 가 있다`, ex);
    if (!ex) continue;
    const buf = fs.readFileSync(f), m = mp3Info(buf), o = OFF[lang] || [0];
    check('③ 배선', `guide-${lang}.mp3 = MPEG1 Layer3 · 64kbps · 44.1kHz · 모노`, m.mpeg1 && m.layer3 && m.kbps === 64 && m.sr === 44100 && m.mono, m);
    check('③ 배선', `guide-${lang}.mp3 는 2MB 이하(폰 회선)`, buf.length <= 2 * 1024 * 1024, buf.length);
    const last = o[o.length - 1];
    check('③ 배선', `guide-${lang}.mp3 길이가 장면 표와 맞다(마지막 장면 5~25초)`, m.seconds - last >= 5 && m.seconds - last <= 25, { seconds: m.seconds, last });
  }
  check('③ 배선', '음원 주소에 버전이 붙는다(AUDIO_V)', /AUDIO_V = '\d+'/.test(src) &&/'\.mp3\?v=' \+ AUDIO_V/.test(src));
  check('③ 배선', '대본 문서가 있다(11장면)', (() => {
    const d = path.join(ROOT, 'docs', 'A.i영화더빙_음성안내_AI성우대본.md');
    if (!fs.existsSync(d)) return false;
    return (fs.readFileSync(d, 'utf8').match(/^## 씬 \d+\./gm) || []).length === 11;
  })());
  // CSS
  const barRule = (css.match(/\.dgv-bar\{[^}]*\}/) || [''])[0];
  check('③ 배선', '막대 폭은 «내용만큼» + 화면 안(width:max-content · max-width)', /width:max-content/.test(barRule) && /max-width:calc\(100vw/.test(barRule));
  const zBar = Number((barRule.match(/z-index:(\d+)/) || [])[1]), zOv = Number(((css.match(/\.dg-ov\{[^}]*\}/) || [''])[0].match(/z-index:(\d+)/) || [])[1]);
  check('③ 배선', '막대는 드로어(100000) 위 · 안내창(100002) 아래', zBar > 100000 && zBar < zOv, { zBar, zOv });
  check('③ 배선', '막대 [hidden] 은 정말 숨는다', /\.dgv-bar\[hidden\]\{display:none!important\}/.test(css));
  const mob = (css.match(/@media\(max-width:860px\)\{[\s\S]*?\n\}/) || [''])[0];
  check('③ 배선', '폰에서는 아래 고정 바(.mbar) 위로 올린다', /\.dgv-bar\{[^}]*bottom:calc\((8\d|9\d|1\d\d)px/.test(mob), mob.slice(0, 160));
  check('③ 배선', '역할 고르기 시트가 열리면 위쪽으로 옮긴다(시트 버튼을 가리지 않게)', /body\.dub-sheet-open \.dgv-bar\{[^}]*top:/.test(mob));
  check('③ 배선', '버튼 손가락 칸 44px 이상', /\.dg-voice\{[^}]*min-height:4[4-9]px/.test(css) && /\.dgv-off\{[^}]*min-height:4[4-9]px/.test(css));

  // ④ 하지 말 것
  const code = strip(src);
  check('④ 안전', '마이크·녹음 API 0', !/getUserMedia|mediaDevices|MediaRecorder/.test(code));
  check('④ 안전', 'AudioContext·speechSynthesis 0(화면의 녹음 섞개를 건드리지 않는다)', !/AudioContext|speechSynthesis/.test(code));
  check('④ 안전', '미리 받지 않는다(preload none · autoplay 0)', /preload = 'none'/.test(code) && !/autoplay/i.test(code) && !/preload = '(auto|metadata)'/.test(code));
  check('④ 안전', '소리 요소를 문서에 붙이지 않는다(다른 소리 감시에 자기가 안 걸리게)', !/appendChild\(audio\)|appendChild\(a\)|append\(audio\)/.test(code));
  check('④ 안전', 'innerHTML 0', !/innerHTML|insertAdjacentHTML/.test(code));
  check('④ 안전', 'data-ko/data-en 0(글은 그릴 때 고른다)', !/data-ko|data-en/.test(code));
  check('④ 안전', '저장소를 쓰지 않는다(끄기는 이번 화면에서만)', !/localStorage|sessionStorage/.test(code));
  check('④ 안전', '홑낫표 0(CJK 낫표 대신 ‘ ’·« »)', !/[「」]/.test(src));
  check('④ 안전', '언어 판정은 공용 getLang()', /root\.getLang\(\) === 'en'/.test(code));
  return { fails, sections };
}

/* ── 실행 ────────────────────────────────────────────────────────────── */
console.log('🔊 A.i영화더빙 사용방법 음성 안내 하니스 — ' + path.relative(ROOT, SRC_PATH));
const base = await runAll(SRC);
for (const [k, v] of Object.entries(base.sections)) console.log(`  ${v.fail ? '❌' : '✅'} ${k}: 통과 ${v.pass} / ${v.pass + v.fail}`);
for (const f of base.fails) console.log('    ✗ ' + f);
const total = Object.values(base.sections).reduce((a, v) => a + v.pass + v.fail, 0);

console.log('\n── ⑤ 변이시험 (각 사본에서 실패가 «나야» 통과)');
const MUTANTS = [
  ['저절로 열려도 소리를 튼다', 'api.guideOpened = function (byUser) { if (byUser) start(); else render(); };', 'api.guideOpened = function (byUser) { start(); };'],
  ['조건 뒤집기 — 사람이 열면 소리 0', 'if (byUser) start(); else render();', 'if (!byUser) start(); else render();'],
  ['✕ 로 닫아도 소리가 계속', "if (why !== 'start') stop('close'); else render();", 'render();'],
  ['조건 뒤집기 — 시작하기로 닫으면 끄고 ✕ 면 이어 듣기', "if (why !== 'start') stop('close');", "if (why === 'start') stop('close');"],
  ['끄기가 멈추지 않는다(pause 빠짐)', 'if (audio) { try { audio.pause(); } catch (e) {} }', 'if (audio) {}'],
  ['다른 소리 감시가 거품 단계(못 받음)', "stop('media'); }, true);", "stop('media'); }, false);"],
  ['녹음 버튼 감시가 엉뚱한 곳', "var STOP_ON = '#dub-start, #dub-all, button[data-watch], #dub-w-film, #dub-w-all';", "var STOP_ON = '#dub-nothing';"],
  ['감상 시작 버튼이 감시에서 빠짐', "var STOP_ON = '#dub-start, #dub-all, button[data-watch], #dub-w-film, #dub-w-all';", "var STOP_ON = '#dub-start, #dub-all';"],
  ['감시가 없는 id 를 가리킴', "#dub-w-film, #dub-w-all';", "#dub-w-films, #dub-w-all';"],
  ['앞 요청의 늦은 실패가 새 소리를 끔', "if (my !== run || state === 'idle') return;", "if (state === 'idle') return;"],
  ['언어를 바꾸면 처음(0초)부터', 'begin(OFFSETS[next][n]);', 'begin(0);'],
  ['언어를 바꾸면 같은 «초» 로(장면이 어긋남)', 'begin(OFFSETS[next][n]);', 'begin(now());'],
  ['창이 열려 있어도 막대가 보임', "var show = state !== 'idle' && !guideShown();", "var show = state !== 'idle';"],
  ['끝까지 들어도 «끄기» 로 남음', "audio.addEventListener('ended', function () { stop('ended'); });", "audio.addEventListener('ended', function () {});"],
  ['못 틀어도 «켜짐» 으로 남음', 'halt();\n    failedAt = Date.now();', 'failedAt = Date.now();'],
  ['영어 화면에도 한국어 음원', "lang = isEn() ? 'en' : 'ko';", "lang = 'ko';"],
  ['음원을 미리 받음', "audio.preload = 'none';", "audio.preload = 'auto';"],
  ['소리 요소를 문서에 붙임', "audio.preload = 'none';", "audio.preload = 'none'; document.body.appendChild(audio);"],
  ['페이지를 떠나도 계속', "root.addEventListener('pagehide', function () { stop('leave'); });", ''],
  ['버튼에 data-ko(글자 갈아끼움 함정)', "var b = document.createElement('button'); b.type = 'button'; b.className = 'dg-voice';", "var b = document.createElement('button'); b.type = 'button'; b.className = 'dg-voice'; b.setAttribute('data-ko', '소리');"],
  ['실패를 말하지 않음', 'failed ? UI.failed : UI.listen', 'UI.listen'],
  ['다시 켜도 처음 자리로 안 돌아감', '} else { try { a.currentTime = at > 0 ? at : 0; } catch (e) {} }', '}'],
  ['막대 끄기가 포커스를 잃음', "var back = document.getElementById('dub-guide-open');", 'var back = null;']
];
let mutOk = 0, mutBad = 0;
if (base.fails.length) {
  console.log('  ⏭  원본이 실패 중이라 변이시험을 건너뛴다(전제 불충족)');
} else {
  for (const [name, from, to] of MUTANTS) {
    if (!SRC.includes(from)) { mutBad++; console.log(`  ❌ 변이 «${name}» — 바꿀 자리를 소스에서 못 찾음`); continue; }
    const r = await runAll(SRC.replace(from, to));
    if (r.fails.length) { mutOk++; console.log(`  ✅ 변이 «${name}» → 잡힘(${r.fails.length}건)`); }
    else { mutBad++; console.log(`  ❌ 변이 «${name}» → 못 잡음`); }
  }
}
console.log('\n──────────────────────────────────────────────────────────────────');
console.log(`  검사 ${total}건 · 통과 ${total - base.fails.length} · 변이 ${mutOk}/${MUTANTS.length} 잡음`);
const bad = base.fails.length + mutBad;
console.log(bad ? `  결과: ${bad} FAIL` : '  결과: 전부 통과');
process.exit(bad ? 1 : 0);
