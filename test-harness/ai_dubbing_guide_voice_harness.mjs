// ═══════════════════════════════════════════════════════════════════════
// 🔊 A.i영화더빙 «사용방법» 음성 안내 회귀 하니스 (2026-10-26)
//   요청(사장님): 안내를 «클릭하면 바로 들리게» · «끄기» 버튼
//   ① 판정 — sceneAt(장면 경계 앞뒤·범위 밖·이상값) · 장면 시작 시각 표(11개·0부터·늘어남) · 음원 주소
//   ② 동작 — 가짜 화면·가짜 <audio> 에서 진짜 파일을 «실제로 돌려» 본다
//        저절로 열림=소리 0 · 사람이 엶=바로 소리 · 듣기↔끄기 · ✕·Esc·오늘 숨김=끔 · 시작하기=이어 듣기+아래 막대
//        다른 영상 재생·녹음 시작·페이지 떠남=끔 · 언어 바꿈=그 장면 처음부터 · 늦게 온 실패는 무시 · 실패는 말한다
//   ③ 배선 — 화면이 싣는 순서·?v= · 음원 파일(머리·길이가 표와 맞는가) · CSS(z-index 는 드로어·알림 파일에서 읽어 겨룸)
//   ③ 실행 — 안내창(ai-dubbing-guide.js)도 가짜 화면에서 «실제로» 돌려 음성 모듈에 무엇을 언제 알리는지 본다
//        (저절로=false · ❓=true · 공개 open()=false · ✕/Esc/오늘 숨김/api=끔 · 시작하기=이어 듣기 · 음성 모듈 없어도 돈다)
//   ④ 하지 말 것 — 마이크·AudioContext·speechSynthesis 0 · 미리 받기 0 · 문서에 붙이기 0 · innerHTML·data-ko/en 0
//   ⑤ 변이시험 — 하나씩 망가뜨린 사본에서 실제로 FAIL 이 나야 한다(음성 파일 + 안내창 파일 · 조건 뒤집기·줄 끝 주석 포함)
//   «들리는가·보이는가» 는 브라우저 검사가 잰다: node test-harness/manual/ai-dubbing-guide-voice-browser.mjs
//   변이 사본으로 돌리기: DGV_SRC=<음성 사본> DG_SRC=<안내창 사본> node test-harness/ai_dubbing_guide_voice_harness.mjs
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
const GUIDE_PATH = process.env.DG_SRC || path.join(PUB, 'js', 'ai-dubbing-guide.js');
const GSRC = fs.readFileSync(GUIDE_PATH, 'utf8');
/* 주석 벗기기 — 블록주석·줄주석(줄 «끝» 의 // 까지). 따옴표 안의 // · /* 는 그대로 둔다(정규식 한 줄로 지우면
   문자열 속 주소가 잘린다 — CLAUDE.md 2장). 줄 끝 주석으로 «끈» 호출이 검사를 통과하지 않게 한다 */
function strip(t) {
  let out = '', i = 0, q = null;
  const n = t.length;
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (q) { out += c; if (c === '\\') { out += d || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && d === '*') { const j = t.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
    if (c === '/' && d === '/') { const j = t.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c; i++;
  }
  return out;
}

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

/* ── 안내창(ai-dubbing-guide.js)을 가짜 화면에서 «실제로» 돌린다 — 음성 모듈은 부른 것을 적는 기록기 ── */
function guideWorld(gsrc, opts = {}) {
  const G = { calls: [], local: {}, session: {}, active: null, winLs: {}, docLs: {} };
  const byId = {};
  function simple(sel) {
    if (/^\.[\w-]+$/.test(sel)) { const c = sel.slice(1); return (n) => String(n.className).split(/\s+/).includes(c); }
    if (/^[a-z]+$/.test(sel)) { const t = sel.toUpperCase(); return (n) => n.tagName === t; }
    return null;   // 복합 선택자(#dub-scenes …)는 «없음» 으로 답한다
  }
  function mk(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), nodeType: 1, className: '', hidden: false, disabled: false, tabIndex: 0, type: '',
      attrs: {}, kids: [], ls: {}, style: {}, parentNode: null, scrollTop: 0, offsetParent: {}, _t: null, _id: '',
      get id() { return this._id; }, set id(v) { this._id = v; byId[v] = this; },
      get textContent() { return this._t != null ? this._t : this.kids.map(k => k.textContent).join(''); },
      set textContent(v) { this._t = String(v); this.kids = []; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild(c) { this.kids.push(c); c.parentNode = this; this._t = null; return c; },
      append(...cs) { cs.forEach(c => this.appendChild(c)); },
      replaceChildren(...cs) { this.kids = []; this._t = null; cs.forEach(c => this.appendChild(c)); },
      addEventListener(n, f) { (this.ls[n] = this.ls[n] || []).push(f); },
      removeEventListener(n, f) { this.ls[n] = (this.ls[n] || []).filter(x => x !== f); },
      focus() { G.active = this; }, scrollIntoView() {},
      contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      querySelectorAll(sel) {
        const m = simple(sel), out = [];
        if (!m) return out;
        const walk = (n) => { for (const k of n.kids) if (k.nodeType === 1) { if (m(k)) out.push(k); walk(k); } };
        walk(this);
        return out;
      }
    };
    e.classList = {
      toggle(c, on) { const s = new Set(String(e.className).split(/\s+/).filter(Boolean)); if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); e.className = [...s].join(' '); },
      contains(c) { return String(e.className).split(/\s+/).includes(c); }
    };
    return e;
  }
  const body = mk('body'), html = mk('html');
  const doc = {
    body, documentElement: html, createElement: mk, createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    getElementById: (id) => byId[id] || null, querySelector: () => null,
    addEventListener(n, f) { (G.docLs[n] = G.docLs[n] || []).push(f); },
    removeEventListener(n, f) { G.docLs[n] = (G.docLs[n] || []).filter(x => x !== f); },
    contains(n) { return n === body || body.contains(n); },
    get activeElement() { return G.active || body; }
  };
  const store = (o) => ({ getItem: (k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null), setItem: (k, v) => { o[k] = String(v); } });
  const win = {
    localStorage: store(G.local), sessionStorage: store(G.session), getLang: () => opts.lang || 'ko', toggleLang() {},
    scrollX: 0, scrollY: 0, scrollTo() {},
    addEventListener(n, f) { (G.winLs[n] = G.winLs[n] || []).push(f); },
    removeEventListener(n, f) { G.winLs[n] = (G.winLs[n] || []).filter(x => x !== f); }
  };
  if (!opts.noVoice) {
    const isOpen = () => !!(win.MangoiDubGuide && win.MangoiDubGuide.isOpen());
    win.MangoiDubVoice = {
      mount(row) { G.calls.push(['mount', row]); const b = mk('button'); b.className = 'dg-voice'; row.appendChild(b); return b; },
      guideOpened(byUser) { G.calls.push(['opened', byUser, isOpen()]); },
      guideClosed(why) { G.calls.push(['closed', why, isOpen()]); }
    };
  }
  const q = mk('button'); q.id = 'dub-guide-open'; body.appendChild(q);
  const qs = mk('button'); qs.id = 'dub-quick-start'; body.appendChild(qs);
  const ctx = { window: win, document: doc, location: { search: opts.search || '' }, Image: function () { return {}; }, console, Date };
  vm.createContext(ctx);
  vm.runInContext(gsrc, ctx, { filename: 'ai-dubbing-guide.js' });
  G.win = win; G.q = q; G.qs = qs;
  G.ov = () => byId['dub-guide'] || null;
  G.open = () => !!G.ov() && !G.ov().hidden;
  G.part = (cls) => { const ov = G.ov(); return ov ? ov.querySelector('.' + cls) : null; };
  G.click = (el) => (el.ls.click || []).slice().forEach(f => f({ type: 'click', target: el }));
  G.key = (k) => (G.winLs.keydown || []).slice().forEach(f => f({ key: k, preventDefault() {}, stopPropagation() {} }));
  G.of = (kind) => G.calls.filter(c => c[0] === kind);
  return G;
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
/* ── 실행 한 벌 — 원본·변이 사본이 같은 검사를 받는다 ──────────────────── */
async function runAll(src, gsrc) {
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
  const guide = strip(gsrc);
  const css = fs.readFileSync(path.join(PUB, 'css', 'ai-dubbing-guide.css'), 'utf8');
  const iV = html.search(/<script defer src="\/js\/ai-dubbing-guide-voice\.js\?v=\d+"><\/script>/);
  const iG = html.search(/<script defer src="\/js\/ai-dubbing-guide\.js\?v=\d+"><\/script>/);
  check('③ 배선', '화면이 음성 스크립트를 버전 달아 defer 로 싣는다', iV > 0);
  check('③ 배선', '음성 스크립트가 안내창 «앞» 에 실린다(저절로 열리기 전에 준비)', iV > 0 && iG > iV);
  /* ③-실행 — 안내창 파일을 가짜 화면에서 «실제로» 돌려, 음성 모듈에 «무엇을 언제» 알리는지 본다.
     (글자 검사만 두면 `if (voice() && false)`·줄 끝 주석으로 끈 호출이 통과한다 — 2026-10-26 함정 대조) */
  const X = '③ 실행';
  try {
    { // 저절로 열림
      const G = guideWorld(gsrc);
      check(X, '(전제) 들어오면 안내창이 저절로 열린다', G.open());
      const m = G.of('mount');
      check(X, '창을 만들 때 «🔊 소리로 듣기» 자리를 한 번 단다(mount)', m.length === 1, m.length);
      const row = m[0] && m[0][1], foot = G.part('dg-foot');
      check(X, '그 자리는 창 아래 줄 — ‘오늘은 다시 보지 않기’ 와 같은 줄', !!row && !!foot && foot.contains(row) && !!row.querySelector('.dg-hide'));
      const o = G.of('opened');
      check(X, '저절로 열림은 «사람이 안 엶»(false) 으로 한 번 알린다', o.length === 1 && o[0][1] === false, o.map(x => x[1]));
      check(X, '열림 알림은 창이 보인 «뒤»', o[0] && o[0][2] === true);
      G.click(G.part('dg-x'));
      const c = G.of('closed');
      check(X, '✕ 로 닫으면 «x» 로 알린다', c.length === 1 && c[0][1] === 'x', c.map(x => x[1]));
      check(X, '닫힘 알림은 창을 숨긴 «뒤»(막대가 창 상태를 바로 읽게)', c[0] && c[0][2] === false);
      G.click(G.q);
      const o2 = G.of('opened');
      check(X, '‘❓ 사용방법’ 을 누르면 «사람이 엶»(true) 으로 알린다', o2.length === 2 && o2[1][1] === true, o2.map(x => x[1]));
      check(X, '다시 열어도 버튼을 또 달지 않는다', G.of('mount').length === 1);
      G.key('Escape');
      check(X, 'Esc 로 닫으면 «esc» 로 알린다', G.of('closed').slice(-1)[0][1] === 'esc');
      G.click(G.q);
      for (let i = 0; i < 5 && G.open(); i++) G.click(G.part('dg-next'));   // 마지막 장의 ‘시작하기’ 까지
      check(X, '‘시작하기’ 로 닫으면 «start» 로 알린다(이어 듣기)', !G.open() && G.of('closed').slice(-1)[0][1] === 'start', G.of('closed').map(x => x[1]));
      check(X, '‘시작하기’ 는 ‘짧은 더빙 시작’ 에 포커스만', G.active === G.qs);
      G.click(G.q); G.click(G.part('dg-hide'));
      check(X, '‘오늘은 다시 보지 않기’ 로 닫으면 «hide» 로 알린다', G.of('closed').slice(-1)[0][1] === 'hide');
      G.win.MangoiDubGuide.open();
      check(X, '공개 API open() 은 «사람이 안 엶»(false) — 클릭 밖에서 불릴 수 있어 소리를 켜지 않는다', G.of('opened').slice(-1)[0][1] === false);
      G.win.MangoiDubGuide.close();
      check(X, '공개 API close() 는 끄는 쪽(api)', G.of('closed').slice(-1)[0][1] === 'api');
      const n = G.of('opened').length; G.win.MangoiDubGuide.open(); G.win.MangoiDubGuide.open();
      check(X, '이미 열린 창을 또 열어도 열림 알림은 한 번', G.of('opened').length === n + 1, G.of('opened').length - n);
    }
    { // 하던 일로 들어옴(?resume=) — 저절로 안 열림 → 알림 0
      const G = guideWorld(gsrc, { search: '?resume=abc' });
      check(X, '저절로 안 열리면 열림 알림도 0', !G.open() && G.of('opened').length === 0);
      G.click(G.q);
      check(X, '그 뒤 ‘❓’ 를 누르면 «사람이 엶»', G.of('opened').length === 1 && G.of('opened')[0][1] === true);
    }
    { // 음성 파일이 못 실렸을 때 — 안내창은 소리 없이 그대로
      let G = null, err = '';
      try { G = guideWorld(gsrc, { noVoice: true }); } catch (e) { err = String(e && e.message || e); }
      check(X, '음성 모듈이 없어도 안내창이 열린다(던지지 않음)', !!G && G.open(), err);
      if (G) {
        let e2 = ''; try { G.click(G.part('dg-x')); G.click(G.q); G.key('Escape'); } catch (e) { e2 = String(e && e.message || e); }
        check(X, '음성 모듈이 없어도 ✕·❓·Esc 가 돈다', !e2 && !G.open(), e2);
        check(X, '음성 모듈이 없으면 «소리로 듣기» 버튼도 없다', !G.part('dg-voice'));
      }
    }
  } catch (e) { check(X, '안내창 실행 중 예외 없음', false, String(e && e.stack || e).slice(0, 300)); }
  // 글자로만 볼 수 있는 것
  check('③ 배선', '안내창은 isOpen 을 내놓는다(막대가 창 상태를 읽는 곳)', /api\.isOpen = function/.test(guide));
  check('③ 배선', '저절로 열기는 «사람이 안 엶»(인자 없음) = 소리 0', /\) open\(0, null\);/.test(guide));
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
  /* 겨루는 값은 손으로 적지 않고 그 파일에서 읽는다 — 공용 ☰ 드로어·덮개(mg-sidebar.js), 동기화 알림(ai-dubbing-home.css) */
  const side = fs.readFileSync(path.join(PUB, 'js', 'mg-sidebar.js'), 'utf8'), home = fs.readFileSync(path.join(PUB, 'css', 'ai-dubbing-home.css'), 'utf8');
  const zOf = (txt, sel) => { const m = txt.match(new RegExp(sel.replace(/[.#-]/g, '\\$&') + '\\{[^}]*?z-index:(\\d+)')); return m ? Number(m[1]) : NaN; };
  const zDrawer = zOf(side, '#mg-drawer'), zShade = zOf(side, '#mg-drawer-overlay'), zSync = zOf(home, '.dub-sync-notification');
  check('③ 배선', '(전제) 드로어·덮개·동기화 알림의 z-index 를 읽었다', [zDrawer, zShade, zSync].every(Number.isFinite), { zDrawer, zShade, zSync });
  check('③ 배선', '막대는 ☰ 드로어·그 덮개 «아래»(드로어를 열면 메뉴가 막대에 안 가린다)', zBar < zDrawer && zBar < zShade, { zBar, zDrawer, zShade });
  check('③ 배선', '막대는 동기화 알림·안내창 사이(알림 위 · 안내창 아래)', zBar > zSync && zBar < zOv, { zBar, zSync, zOv });
  check('③ 배선', '막대 [hidden] 은 정말 숨는다', /\.dgv-bar\[hidden\]\{display:none!important\}/.test(css));
  const mob = (css.match(/@media\(max-width:860px\)\{[\s\S]*?\n\}/) || [''])[0];
  check('③ 배선', '폰에서는 아래 고정 바(.mbar) 위로 올린다', /\.dgv-bar\{[^}]*bottom:calc\((8\d|9\d|1\d\d)px/.test(mob), mob.slice(0, 160));
  check('③ 배선', '역할 고르기 시트가 열리면 위쪽으로 옮긴다(시트 버튼을 가리지 않게)', /body\.dub-sheet-open \.dgv-bar\{[^}]*top:/.test(mob));
  check('③ 배선', '폰에서 동기화 알림이 떠 있어도 위쪽으로(알림 버튼을 가리지 않게)', /body:has\(#dub-sync-notification:not\(\[hidden\]\)\) \.dgv-bar\{[^}]*top:/.test(mob));
  check('③ 배선', ':has() 규칙은 시트 규칙과 따로 둔다(모르는 브라우저가 시트 규칙까지 버리지 않게)', !/[^{}]*dub-sheet-open[^{}]*:has\([^{}]*\{/.test(mob) && !/[^{}]*:has\([^{}]*dub-sheet-open[^{}]*\{/.test(mob));
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
const base = await runAll(SRC, GSRC);
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
/* 안내창(ai-dubbing-guide.js) 쪽 변이 — 음성 모듈에 알리는 세 자리(mount·guideOpened·guideClosed)와 ‘❓’ 클릭.
   [이름, [[바꿀 원문, 바꿀 글], …]] — 여러 군데를 함께 바꾸는 변이(순서 바꾸기)도 있다 */
const CLOSED_LINE = '    if (voice()) voice().guideClosed(why);   // «시작하기» 면 소리가 이어지고(아래 «끄기» 막대), 그 밖은 꺼진다\n';
const GUIDE_MUTANTS = [
  ['❓ 를 눌러도 소리 안 남(조건 무력화)', [['if (voice()) voice().guideOpened(!!byUser);', 'if (voice() && false) voice().guideOpened(!!byUser);']]],
  ['저절로 열려도 «사람이 엶» 으로 알림', [['if (voice()) voice().guideOpened(!!byUser);', 'if (voice()) voice().guideOpened(true);']]],
  ['❓ 클릭이 «사람이 엶» 을 안 넘김', [['open(0, btn, true); });', 'open(0, btn); });']]],
  ['공개 API open() 이 소리를 켬', [["api.open = function () { open(0, $('dub-guide-open')); };", "api.open = function () { open(0, $('dub-guide-open'), true); };"]]],
  ['조건 뒤집기 — 닫힘 알림이 음성 모듈이 «없을 때만»', [['if (voice()) voice().guideClosed(why);', 'if (!voice()) voice().guideClosed(why);']]],
  ['닫힘 알림을 줄 «끝» 주석으로 끔', [['unlockScroll();\n    if (voice()) voice().guideClosed(why);', 'unlockScroll();   // if (voice()) voice().guideClosed(why);']]],
  ['닫힘 알림을 줄 앞 주석으로 끔', [['    if (voice()) voice().guideClosed(why);', '    // if (voice()) voice().guideClosed(why);']]],
  ['닫힘 알림을 창을 숨기기 «전» 에', [[CLOSED_LINE, ''], ['  function close(why) {\n    if (!ov || ov.hidden) return;\n', '  function close(why) {\n    if (!ov || ov.hidden) return;\n' + CLOSED_LINE]]],
  ['«시작하기» 는 빠져나간 뒤라 알림이 안 감', [[CLOSED_LINE, ''], ['    target = opener && opener', CLOSED_LINE + '    target = opener && opener']]],
  ['«소리로 듣기» 자리를 안 담(조건 무력화)', [['if (voice()) voice().mount(row);', 'if (voice() && 0) voice().mount(row);']]],
  ['음성 모듈이 없으면 안내창이 죽음', [['if (voice()) voice().mount(row);', 'voice().mount(row);']]],
  ['열림 알림이 «이미 열린 창» 에서도', [['    if (was) return;', '    if (was) { if (voice()) voice().guideOpened(!!byUser); return; }']]]
];
let mutOk = 0, mutBad = 0;
const mutTotal = MUTANTS.length + GUIDE_MUTANTS.length;
if (base.fails.length) {
  console.log('  ⏭  원본이 실패 중이라 변이시험을 건너뛴다(전제 불충족)');
} else {
  for (const [name, from, to] of MUTANTS) {
    if (!SRC.includes(from)) { mutBad++; console.log(`  ❌ 변이 «${name}» — 바꿀 자리를 소스에서 못 찾음`); continue; }
    const r = await runAll(SRC.replace(from, to), GSRC);
    if (r.fails.length) { mutOk++; console.log(`  ✅ 변이 «${name}» → 잡힘(${r.fails.length}건)`); }
    else { mutBad++; console.log(`  ❌ 변이 «${name}» → 못 잡음`); }
  }
  for (const [name, pairs] of GUIDE_MUTANTS) {
    let g = GSRC, miss = '';
    for (const [from, to] of pairs) { if (!g.includes(from)) { miss = from; break; } g = g.replace(from, to); }
    if (miss) { mutBad++; console.log(`  ❌ 안내창 변이 «${name}» — 바꿀 자리를 못 찾음: ${miss.slice(0, 60)}`); continue; }
    const r = await runAll(SRC, g);
    if (r.fails.length) { mutOk++; console.log(`  ✅ 안내창 변이 «${name}» → 잡힘(${r.fails.length}건)`); }
    else { mutBad++; console.log(`  ❌ 안내창 변이 «${name}» → 못 잡음`); }
  }
}
console.log('\n──────────────────────────────────────────────────────────────────');
console.log(`  검사 ${total}건 · 통과 ${total - base.fails.length} · 변이 ${mutOk}/${mutTotal} 잡음`);
const bad = base.fails.length + mutBad;
console.log(bad ? `  결과: ${bad} FAIL` : '  결과: 전부 통과');
process.exit(bad ? 1 : 0);
