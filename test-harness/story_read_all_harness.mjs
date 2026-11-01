/* ═══════════════════════════════════════════════════════════════════════════
   📖 동화책 «① 읽고 듣기» 도장 = 모든 문장을 «끝까지» 들어야 · «예시 넣어 보기» 없음 — 2026-10-20 신설

   [왜] 사장님 제보 두 가지:
     ① «중간까지만 들어도 읽기 완료가 됩니다» — 문장 5개만 눌러 들어도 도장이었는데, 1단계 짧은 글은
        그게 절반이었습니다. → 모든 문장을 끝까지 들어야(처음부터 듣기 + 문장 누르기를 합쳐 셈).
     ② «예시 넣어 보기» 를 눌러 넣고 그대로 «완성하기» 를 누르면 스스로 생각해 쓰지 않습니다 → 버튼을 뺌.

   [무엇을 지키나 — 180편 전부(손으로 만든 4권 + 생성기 176권)]
     ⓪ 전제: 읽기 블록·데이터를 오려 냈다
     ① «예시 넣어 보기» 버튼 줄이 없다 · 예시 문장(WRITE_EX)은 철자 점검용으로 남아 있다
     ② 읽기 코드를 «실제로» 돌린다 — 가짜 DOM + 가짜 소리(크롬처럼 «멈출 때도 onend» 를 보내는 최악판)
        - 문장 5개만 끝까지 들어도 도장 «아님» (옛 규칙 되돌림 방지)
        - 같은 문장을 문장 수만큼 되풀이해도 «아님» (짝)
        - 모든 문장을 끝까지 들으면 도장 «정확히 한 번»
        - 듣다가 다른 문장을 누르면 앞 문장은 안 셈(멈춘 소리의 onend)
        - «처음부터 듣기» 를 중간에 멈추면 아님 → 다시 끝까지 들으면 도장
        - «처음부터 듣기» 앞부분 + 나머지 문장 누르기 = 합쳐서 도장
        - «처음부터 다시»(초기화) 뒤에는 다시 다 들어야
        - 들은 문장 수 표시(N / M · ✅) · 소리를 못 내는 브라우저는 예전처럼 «처음부터 듣기» 로 받음
     ③ 배선: «처음부터 다시» 가 들은 문장도 지운다
     ④ 변이시험: 판정을 일부러 망가뜨려 ② 가 실제로 FAIL 하는지(조건 뒤집기 포함)
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let PASS = 0, FAIL = 0, CASES = 0;
const ok = (c, m) => { if (c) { PASS++; } else { FAIL++; console.log('  ❌ ' + m); } };
const okv = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };

// 표지 갤러리는 목록 화면이며 읽기·도장 활동은 없다. 별도 gallery 하니스가 검사한다.
const FILES = readdirSync(PUB).filter((f) => /^story-.+\.html$/.test(f) && f !== 'story-cover-gallery.html').sort();
const START = '  // ---- speech: server MP3 works without installed English voices ----';
const END = "  document.getElementById('stopAll').addEventListener('click', stop);";

/** 대괄호 짝으로 리터럴을 오려 냄(문자열 안 괄호는 건너뜀). */
function literalAfter(src, marker) {
  const at = src.indexOf(marker); if (at < 0) return null;
  let i = src.indexOf('=', at) + 1; while (/\s/.test(src[i])) i++;
  const open = src[i], close = open === '[' ? ']' : '}';
  let d = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === open) d++; else if (ch === close) { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

// ── 가짜 DOM ────────────────────────────────────────────────────────────
function classList() {
  const s = new Set();
  return { add: (...a) => a.forEach((x) => s.add(x)), remove: (...a) => a.forEach((x) => s.delete(x)), contains: (x) => s.has(x),
    toggle: (x, f) => { const on = f === undefined ? !s.has(x) : !!f; if (on) s.add(x); else s.delete(x); return on; } };
}
function el(tag) {
  const e = { tag, children: [], dataset: {}, style: {}, className: '', innerHTML: '', textContent: '', hidden: false, tabIndex: -1, parentNode: null,
    classList: classList(), listeners: {},
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
    getBoundingClientRect() { return { top: 100, bottom: 120 }; }, scrollIntoView() {},
    click() { (this.listeners.click || []).forEach((f) => f.call(this, { target: this, preventDefault() {} })); } };
  return e;
}
/** 크롬처럼: speak 는 하나씩, cancel 하면 «지금 소리» 에도 onend 를 «곧바로» 보냄(최악판 — 번호 검사가 막아야 함). */
function fakeSynth() {
  const s = { cur: null, spoken: [], speaking: false, getVoices: () => [], onvoiceschanged: null,
    speak(u) { s.cur = u; s.spoken.push(u.text); },
    cancel() { const c = s.cur; s.cur = null; if (c && c.onend) c.onend(); },
    end() { const c = s.cur; s.cur = null; if (c && c.onend) c.onend(); } };
  return s;
}

/** 페이지의 읽기 블록을 가짜 환경에서 실제로 돌린다. */
function boot(block, STORY, opts = {}) {
  const ids = {};
  const document = {
    readyState: 'complete', addEventListener() {},
    getElementById: (id) => (ids[id] = ids[id] || el('div')),
    createElement: (tag) => el(tag), createTextNode: (text) => ({ text }),
    querySelectorAll: (sel) => (sel === '.s.pick' ? spansOf().filter((s) => s.classList.contains('pick')) : []),
  };
  const synth = fakeSynth();
  const st = opts.state || {};
  const window = { speechSynthesis: opts.noSynth ? null : synth, StoryFun: { state: () => st },
    // Simulated media backend; actual StoryAudio cancellation/error behavior is
    // covered separately by story_audio_stress_harness and the browser sandbox.
    StoryAudio: {
      speak(text, rate, onend) { if (!opts.audioFailure) synth.speak({ text, onend }); },
      stop() { synth.cancel(); },
    },
  };
  const done = [];
  function SpeechSynthesisUtterance(text) { this.text = text; this.onend = null; }
  let spansRef = null;
  function spansOf() { return spansRef ? spansRef() : []; }
  const prelude = 'var sumSeq; function t(ko){ return ko; } function flash(){} function storyDone(k){ __done.push(k); }\n';
  const tail = '\nreturn { spans: function(){ return spans; }, RT: function(){ return RT; }, stop: stop };';
  const f = new Function('window', 'document', 'SpeechSynthesisUtterance', 'innerHeight', 'STORY', '__done', prelude + block + tail);
  const api = f(window, document, SpeechSynthesisUtterance, 800, STORY, done);
  spansRef = api.spans;
  const spans = api.spans();
  return {
    synth, done, st, spans, ids, window, api,
    readDone: () => done.filter((k) => k === 'read').length,
    tap: (i) => spans[i].click(),
    end: () => synth.end(),
    readAll: () => ids.readAll.click(),
    stopBtn: () => ids.stopAll.click(),
    prog: () => document.getElementById('readProg').innerHTML,   // 아직 안 그렸으면 빈 상자

  };
}

/** 한 페이지의 시나리오들 — 실패한 것의 이름 목록을 돌려줌(변이시험에서 다시 씀). */
function scenarios(block, STORY) {
  const bad = [];
  const T = (name, fn) => { CASES++; let r; try { r = fn(); } catch (e) { r = 'throw ' + e.message; } if (r !== true) bad.push(name + ' → ' + r); };
  const N = STORY.reduce((a, p) => a + p.length, 0);

  T('문장 5개만 끝까지 들으면 도장 아님(옛 규칙 되돌림 방지)', () => {
    const b = boot(block, STORY); for (let i = 0; i < 5; i++) { b.tap(i); b.end(); }
    return N > 5 ? (b.readDone() === 0 || 'done ' + b.readDone()) : true;
  });
  T('같은 문장을 문장 수만큼 되풀이해도 도장 아님(짝)', () => {
    const b = boot(block, STORY); for (let i = 0; i < N; i++) { b.tap(0); b.end(); }
    return b.readDone() === 0 || 'done ' + b.readDone();
  });
  T('모든 문장을 끝까지 들으면 도장 정확히 한 번', () => {
    const b = boot(block, STORY); for (let i = 0; i < N; i++) { b.tap(i); b.end(); }
    if (b.readDone() !== 1) return 'done ' + b.readDone();
    b.tap(0); b.end();   // 다 들은 뒤 또 들어도 도장 판정은 같은 결과(도장판 쪽이 한 번만 찍음)
    return b.readDone() >= 1 || 'lost';
  });
  T('듣다가 다른 문장을 누르면 앞 문장은 안 셈', () => {
    const b = boot(block, STORY);
    for (let i = 0; i < N; i++) { b.tap(i); }   // 하나도 끝까지 안 듣고 계속 누름 → 멈춘 소리의 onend 는 안 셈
    if (b.api.RT().count() !== 0) return 'count ' + b.api.RT().count();
    b.end();   // 마지막 문장만 끝까지
    return (b.api.RT().count() === 1 && b.readDone() === 0) || 'count ' + b.api.RT().count();
  });
  T('«멈추기» 로 끊은 문장은 안 셈', () => {
    const b = boot(block, STORY); b.tap(0); b.stopBtn();
    return (b.api.RT().count() === 0) || 'count ' + b.api.RT().count();
  });
  T('처음부터 듣기를 중간에 멈추면 아님 → 다시 끝까지 들으면 도장', () => {
    const b = boot(block, STORY); b.readAll();
    const half = Math.floor(N / 2); for (let i = 0; i < half; i++) b.end();
    b.stopBtn();
    if (b.readDone() !== 0) return 'early done';
    if (b.api.RT().count() !== half) return 'half count ' + b.api.RT().count() + '/' + half;
    if (b.synth.cur) return 'still speaking after stop';
    b.readAll(); for (let i = 0; i < N; i++) b.end();
    return b.readDone() === 1 || 'done ' + b.readDone();
  });
  T('처음부터 듣기 앞부분 + 나머지 문장 누르기 = 합쳐서 도장', () => {
    const b = boot(block, STORY); b.readAll();
    const half = Math.floor(N / 2); for (let i = 0; i < half; i++) b.end();
    b.stopBtn();
    for (let i = half; i < N; i++) { b.tap(i); b.end(); }
    return b.readDone() === 1 || 'done ' + b.readDone() + ' count ' + b.api.RT().count();
  });
  T('처음부터 듣기를 끝까지 = 도장 · 소리는 문장 수만큼', () => {
    const b = boot(block, STORY); b.readAll(); for (let i = 0; i < N; i++) b.end();
    return (b.readDone() === 1 && b.synth.spoken.length === N && !b.synth.cur) || `done ${b.readDone()} spoken ${b.synth.spoken.length}/${N}`;
  });
  T('초기화(«처음부터 다시») 뒤에는 다시 다 들어야', () => {
    const b = boot(block, STORY); for (let i = 0; i < N; i++) { b.tap(i); b.end(); }
    if (typeof b.window.__storyReadReset !== 'function') return 'no reset hook';
    b.window.__storyReadReset();
    if (b.api.RT().count() !== 0) return 'not cleared';
    b.tap(0); b.end();
    return b.readDone() === 1 || 'done ' + b.readDone();   // 초기화 전 한 번만 — 하나 듣고 또 찍히면 안 됨
  });
  T('들은 문장 수 표시 N / M → ✅', () => {
    const b = boot(block, STORY);
    if (!/0 \/ /.test(b.prog()) && b.prog() !== '') return 'start ' + b.prog();
    b.tap(0); b.end();
    if (!new RegExp('1 / ' + N + '\\b').test(b.prog())) return 'after1 ' + b.prog();
    for (let i = 1; i < N; i++) { b.tap(i); b.end(); }
    return /✅/.test(b.prog()) || 'end ' + b.prog();
  });
  T('이미 도장이 있으면 «이미 받았어요» 로 말함(0개 들었을 때)', () => {
    const b = boot(block, STORY, { state: { read: 1 } });
    b.window.__storyReadReset && b.window.__storyReadReset();   // 표시를 한 번 그리게
    return /이미 받았어요/.test(b.prog()) || b.prog();
  });
  T('기기 음성 없는 브라우저도 서버 음성을 끝까지 들어야 도장', () => {
    const b = boot(block, STORY, { noSynth: true }); b.readAll();
    if (b.readDone() !== 0) return 'stamped before audio ended';
    for (let i = 0; i < N; i++) b.end();
    return b.readDone() === 1 || 'done ' + b.readDone();
  });
  T('서버 음성 실패를 읽기 완료로 세지 않음', () => {
    const b = boot(block, STORY, { noSynth: true, audioFailure: true }); b.readAll();
    return b.readDone() === 0 && b.api.RT().count() === 0 || 'false completion';
  });
  return bad;
}

console.log('\n[ ⓪ 전제 · ① 예시 버튼 없음 · ② 읽기 실제 실행 — ' + FILES.length + '편 ]');
okv(FILES.length >= 180, `동화책 페이지 ${FILES.length}편`);
let blocks = 0, exOk = 0, runOk = 0, firstBad = '';
const sentenceCounts = [];
let templateBlock = null, templateStory = null;
for (const f of FILES) {
  const html = readFileSync(join(PUB, f), 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  const one = a > 0 && b > a && html.indexOf(START, a + 1) < 0;
  ok(one, f + ': 읽기 블록을 오려 냈다');
  if (!one) continue;
  blocks++;
  const block = html.slice(a, b + END.length);
  const STORY = new Function('return ' + literalAfter(html, 'var STORY = '))();
  sentenceCounts.push(STORY.reduce((x, p) => x + p.length, 0));
  // ① 예시 넣어 보기 — 화면(마크업)에 버튼 줄이 없고, 예시 문장은 철자 점검용으로 남는다
  const ex = (() => { try { return JSON.parse(literalAfter(html, 'var WRITE_EX = ')); } catch { return null; } })();
  const noBtn = !/class="chip"|class="ex-row"|data-ko="예시 넣어 보기"/.test(html) && !/querySelectorAll\('#mywrite \.chip'\)/.test(html);
  const exUsed = /WRITE_EX\.forEach\(function\(x\)\{ a\.push\(x\[0\], x\[1\]\); \}\)/.test(html);
  const noOld = !/Object\.keys\(heard\)\.length >= 5/.test(html) && !/예시를 눌러 보세요/.test(html);
  if (noBtn && Array.isArray(ex) && ex.length === 3 && ex.every((p) => p.length === 2 && p[0] && p[1]) && exUsed && noOld) exOk++;
  else if (!firstBad) firstBad = f + ` 버튼없음=${noBtn} 예시=${JSON.stringify(ex)} 철자점검=${exUsed} 옛규칙없음=${noOld}`;
  // ② 실제 실행
  const bad = scenarios(block, STORY);
  if (bad.length === 0) runOk++;
  else console.log('  ❌ ' + f + ': ' + bad.slice(0, 3).join(' | '));
  if (f === 'story-birthday-cake.html') { templateBlock = block; templateStory = STORY; }
  // ③ 배선: «처음부터 다시» 가 들은 문장도 지운다
  ok(/if \(window\.__storyReadReset\) window\.__storyReadReset\(\);/.test(html), f + ': «처음부터 다시» 가 들은 문장도 지움');
  ok(/renderEnds\(\); paintWrite\(\); paintReadProg\(\);/.test(html), f + ': 언어를 바꾸면 들은 문장 표시도 다시 그림');
}
okv(blocks === FILES.length, `읽기 블록 ${blocks}/${FILES.length}편`);
okv(exOk === FILES.length, `«예시 넣어 보기» 버튼 줄이 없고 예시 문장은 철자 점검에만 — ${exOk}/${FILES.length}편` + (firstBad ? ` (예: ${firstBad})` : ''));
okv(runOk === FILES.length, `읽기 시나리오 12종을 실제로 돌려 통과 — ${runOk}/${FILES.length}편`);
okv(sentenceCounts.length && Math.min(...sentenceCounts) > 5, `모든 편이 문장 5개보다 길다(옛 규칙 검사가 뜻이 있음) — 최소 ${Math.min(...sentenceCounts)}문장`);

// ④ 변이시험 — 판정을 망가뜨리면 ② 가 실제로 FAIL 해야 함
console.log('\n[ ④ 변이시험 — 틀(story-birthday-cake)의 읽기 블록 ]');
okv(!!templateBlock, '틀의 읽기 블록을 찾았다');
if (templateBlock) {
  const MUT = [
    ['조건 뒤집기 (g !== gen → g === gen)', 'if (g !== gen || ', 'if (g === gen || '],
    ['옛 규칙(5개면 도장)', 'if (n >= total) onAll();', 'if (n >= 5) onAll();'],
    ['같은 문장 중복으로 셈', 'if (!heard[i]) { heard[i] = 1; n++; onChange(); }', 'heard[i] = 1; n++; onChange();'],
    ['멈출 때 번호를 안 바꿈', 'cancel: function(){ gen++; },', 'cancel: function(){},'],
    ['stop() 이 번호를 안 바꿈', 'if (RT) RT.cancel(); ', ''],
    ['처음부터 듣기가 문장을 안 셈', 'if (i > 0) RT.heardTo(i - 1, g);', ''],
    ['문장 누르기가 끝을 안 기다림(누르면 바로 셈)', 'say(sp.textContent, function(){ RT.heardTo(at, g); });', 'say(sp.textContent); RT.heardTo(at, g);'],
    ['초기화가 안 지움', 'reset: function(){ heard = {}; n = 0; gen++; onChange(); }', 'reset: function(){ onChange(); }'],
    ['처음부터 듣기 끝에 무조건 도장(옛 코드)', 'if (i >= spans.length) { playing = false; return; }', "if (i >= spans.length) { playing = false; storyDone('read'); return; }"],
    ['stop() 이 표시를 늦게 내림(멈춘 뒤 다음 문장을 읽음)', 'function stop(){ playing = false; sumSeq = (sumSeq || 0) + 1; if (RT) RT.cancel(); window.StoryAudio.stop();', 'function stop(){ sumSeq = (sumSeq || 0) + 1; if (RT) RT.cancel(); window.StoryAudio.stop(); playing = false;'],
  ];
  for (const [name, from, to] of MUT) {
    const n = templateBlock.split(from).length - 1;
    if (n !== 1) { okv(false, `변이 «${name}» — 바꿀 자리를 정확히 1번 못 찾음(${n}번)`); continue; }
    const bad = scenarios(templateBlock.replace(from, () => to), templateStory);
    okv(bad.length > 0, `변이 «${name}» → 실제로 FAIL ${bad.length}건` + (bad.length ? ` (예: ${bad[0].slice(0, 80)})` : ''));
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}  (시나리오 ${CASES}회)`);
process.exit(FAIL ? 1 : 0);
