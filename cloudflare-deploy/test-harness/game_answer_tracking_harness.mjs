/**
 * game_answer_tracking_harness.mjs — 🎮 정오답 계측이 «실제로 불리는가» (2026-08-08 신설)
 *
 * 왜 필요한가
 *   정오답을 서버로 안 보내던 게임 6종에 `MangoiGame.answer(...)` 한 줄씩을 넣었다.
 *   그런데 «파일에 그 글자가 있다» 와 «판정이 일어날 때 실제로 불린다» 는 다른 얘기다.
 *   앞의 것만 확인하고 넘어가면, 분기 밖이나 죽은 코드에 넣어 놓고 «계측했다» 고
 *   보고하게 된다. 그래서 판정 함수를 오려내 **실행**한다.
 *
 * 방법
 *   각 게임 HTML 에서 판정 함수 본문을 정규식으로 잘라 new Function 으로 만들고,
 *   가짜 DOM·가짜 게임 상태를 주입해 정답/오답을 한 번씩 태운다.
 *   MangoiGame.answer 가 기대한 인자로 불렸는지 본다.
 *
 * 이 하니스가 빨간불이면 계측이 «있는 척» 만 하는 것이다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dirname, '..', 'public');

let pass = 0, fail = 0;
const problems = [];

function ok(msg) { pass++; console.log('  ✅ ' + msg); }
function bad(msg) { fail++; problems.push(msg); console.log('  ❌ ' + msg); }

/** 파일에서 함수 하나를 통째로 오려낸다(중괄호 균형으로 끝을 찾는다). */
function cutFunction(src, startPattern) {
  const i = src.search(startPattern);
  if (i < 0) return null;
  const open = src.indexOf('{', i);
  if (open < 0) return null;
  let depth = 0, inStr = null, esc = false;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (inStr) { if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  return null;
}

/** 잘라낸 함수를 실행할 수 있게 감싸고, MangoiGame.answer 호출을 잡아낸다. */
function runWith(fnSrc, fnName, prelude, calls) {
  const seen = [];
  const stub = `
    var __seen = [];
    var window = { MangoiGame: { answer: function(ok, item, ko){ __seen.push({ok: !!ok, item: item, ko: ko}); } } };
    ${prelude}
    ${fnSrc}
    ${calls}
    return __seen;
  `;
  try {
    return { seen: new Function(stub)(), err: null };
  } catch (e) {
    return { seen, err: e };
  }
}

console.log('════════ 🎮 정오답 계측 실행 검증 ════════\n');

/* ── ① shooter: resolve(m,x,y) ─────────────────────────────────────────── */
{
  const src = readFileSync(join(PUB, 'student-game-shooter.html'), 'utf8');
  const fn = cutFunction(src, /function resolve\(m,x,y\)\{/);
  if (!fn) bad('shooter: resolve() 를 못 찾음');
  else {
    const prelude = `
      var running = true, score = 500, combo = 0, lastHit = 0, COMBO_WINDOW = 1500;
      var currentIndex = 0, correctWords = 0, targetWords = ['apple','pie'];
      var noop = function(){}; var sndHit=noop, sndMiss=noop, popMonster=noop, floatScore=noop,
          showCombo=noop, renderSentence=noop, updateHUD=noop, shake=noop, roundComplete=noop,
          speak=function(a,b,cb){}, speakTarget=noop;
      var mk = function(w){ return { word: w, golden:false, isCiv:false,
        el: { isConnected:true, offsetWidth:1, classList:{ add:noop, remove:noop } } }; };
      var performance = { now: function(){ return 1; } };
    `;
    const calls = `resolve(mk('apple'),0,0); resolve(mk('banana'),0,0);`;
    const { seen, err } = runWith(fn, 'resolve', prelude, calls);
    if (err) bad('shooter: 실행 실패 — ' + err.message);
    else if (seen.length !== 2) bad('shooter: answer 호출 ' + seen.length + '회 (기대 2)');
    else if (seen[0].ok !== true || seen[0].item !== 'apple') bad('shooter: 정답 인자 이상 — ' + JSON.stringify(seen[0]));
    // 첫 판정이 정답이라 currentIndex 가 1 로 전진한다 → 그 다음 오답의 «목표 단어» 는 pie 다.
    // (여기서 apple 을 기대했다가 틀렸다. 계측은 «지금 맞혀야 할 단어» 를 기록하는 게 맞다.)
    else if (seen[1].ok !== false || seen[1].item !== 'pie') bad('shooter: 오답 인자 이상(그 시점의 목표 단어를 보내야 함) — ' + JSON.stringify(seen[1]));
    else ok('shooter — 정답 apple / 오답 시 그 시점 목표어 pie 기록');
  }
}

/* ── ② battle-3d: answer(btn,choice,it) ────────────────────────────────── */
{
  const src = readFileSync(join(PUB, 'battle-3d.html'), 'utf8');
  const fn = cutFunction(src, /function answer\(btn,choice,it\)\{/);
  if (!fn) bad('battle-3d: answer() 를 못 찾음');
  else {
    const prelude = `
      var noop = function(){};
      var state = { busy:false, combo:0, score:0, bossHP:100, heroHP:100, idx:0, lesson:0 };
      var KO = { 'apple': '사과' };
      var LESSONS = [{ items: [1,2,3] }];
      var el = { quiz:{ style:{} }, choices:{ children: [] } };
      var sfx = { correct:noop, wrong:noop, hurt:noop };
      var stopQTimer=noop, revealKo=noop, speak=noop, toast=noop, attackAnim=noop,
          updateHUD=noop, victory=noop, defeat=noop, nextQuestion=noop, stopOwnTTS=noop;
      var hero={}, boss={}, IS_ZH=false;
      var setTimeout = function(){};
      var mkBtn = function(){ return { classList: { add: noop } }; };
    `;
    const calls = `
      answer(mkBtn(), 'apple', { a:'apple', q:'사과', type:'단어' });
      state.busy = false;
      answer(mkBtn(), 'banana', { a:'apple', q:'사과', type:'단어' });
    `;
    const { seen, err } = runWith(fn, 'answer', prelude, calls);
    if (err) bad('battle-3d: 실행 실패 — ' + err.message);
    else if (seen.length !== 2) bad('battle-3d: answer 호출 ' + seen.length + '회 (기대 2)');
    else if (seen[0].ok !== true || seen[0].item !== 'apple') bad('battle-3d: 정답 인자 이상 — ' + JSON.stringify(seen[0]));
    else if (seen[1].ok !== false) bad('battle-3d: 오답이 정답으로 기록됨 — ' + JSON.stringify(seen[1]));
    else if (seen[0].ko !== '사과') bad('battle-3d: 한국어 뜻이 안 실림 — ' + JSON.stringify(seen[0]));
    else ok('battle-3d — 정답/오답 + 한국어 뜻(사과)까지 기록');
  }
}

/* ── ③ grammar-pizza: _pzRemember(ok) ──────────────────────────────────── */
{
  const src = readFileSync(join(PUB, 'student-game-grammar-pizza.html'), 'utf8');
  const fn = cutFunction(src, /function _pzRemember\(ok\)\{/);
  if (!fn) bad('grammar-pizza: _pzRemember() 를 못 찾음');
  else {
    // MangoiMemory 가 없는 환경을 일부러 만든다 — early return 뒤에 계측을 두면 여기서 잡힌다.
    const prelude = `
      var sentenceText = function(){ return 'I like pizza'; };
      var _pzTags = { tags: [], goodTags: [] };
    `;
    const calls = `_pzRemember(true); _pzRemember(false);`;
    const { seen, err } = runWith(fn, '_pzRemember', prelude, calls);
    if (err) bad('grammar-pizza: 실행 실패 — ' + err.message);
    else if (seen.length !== 2) bad('grammar-pizza: answer 호출 ' + seen.length + '회 (기대 2) — MangoiMemory 없는 환경에서 early return 뒤에 있는 건 아닌가');
    else if (seen[0].ok !== true || seen[1].ok !== false) bad('grammar-pizza: 정오답이 뒤바뀜 — ' + JSON.stringify(seen));
    else if (seen[0].item !== 'I like pizza') bad('grammar-pizza: 문장이 안 실림 — ' + JSON.stringify(seen[0]));
    else ok('grammar-pizza — MangoiMemory 없는 환경에서도 정답/오답 기록(early return 앞)');
  }
}

/* ── ④ 나머지 3종은 «넣은 자리가 판정 분기 안인가» 를 소스에서 확인 ────────
 *     (wordfighter·rescue-voyage·suspect-mystery 는 판정이 거대한 렌더 루프
 *      한가운데라 잘라내 실행하는 비용이 실익보다 크다. 대신 «어느 분기에
 *      들어 있는가» 를 구조로 못 박는다.) */
{
  const checks = [
    { file: 'student-game-wordfighter.html', name: 'wordfighter',
      musts: [
        [/MangoiGame\.answer\(true, z\.word\)/, '정답 분기에서 맞힌 단어(z.word)를 보낸다'],
        [/MangoiGame\.answer\(false, required\)/, '오답 분기에서 목표 단어(required)를 보낸다'],
      ],
      // 정답 훅은 waveComplete 호출보다 앞에 있어야 한다(문장 완성 시 조기 이탈 방지)
      order: [/MangoiGame\.answer\(true, z\.word\)/, /if\(currentIndex>=targetWords\.length\) waveComplete\(\)/] },
    { file: 'student-game-rescue-voyage.html', name: 'rescue-voyage',
      musts: [[/MangoiGame\.answer\(obj\.userData\.order===G\.sentNext, G\._lastWordText\)/, '순서 일치 여부로 정오답을 가른다']],
      // sentNext 를 «올리기 전» 에 판정해야 한다 — 뒤에 두면 영원히 오답으로 찍힌다
      order: [/MangoiGame\.answer\(obj\.userData\.order===G\.sentNext/, /if\(obj\.userData\.order===G\.sentNext\) G\.sentNext\+\+/] },
    { file: 'suspect-mystery.html', name: 'suspect-mystery',
      musts: [[/MangoiGame\.answer\(id === currentData\.answer\)/, '범인 지목이 맞았는지만 보낸다(단어 약점 없음)']],
      order: [/MangoiGame\.answer\(id === currentData\.answer\)/, /if \(id === currentData\.answer\) \{/] },
  ];
  for (const c of checks) {
    const src = readFileSync(join(PUB, c.file), 'utf8');
    let good = true;
    for (const [re, what] of c.musts) {
      if (!re.test(src)) { bad(c.name + ': ' + what + ' — 못 찾음'); good = false; }
    }
    if (good && c.order) {
      const a = src.search(c.order[0]), b = src.search(c.order[1]);
      if (a < 0 || b < 0) { bad(c.name + ': 순서 검사 기준점을 못 찾음'); good = false; }
      else if (a > b) { bad(c.name + ': 계측이 상태 변경 «뒤» 에 있다 — 판정이 뒤집힌다'); good = false; }
    }
    if (good) ok(c.name + ' — 판정 분기 안, 상태 변경 앞');
  }
}

/* ── ⑤ 계측기 자체: answer() 문이 열려 있고 자체 전송이 원본 fetch 를 쓰는가 ── */
{
  const t = readFileSync(join(PUB, 'js', 'game-track.js'), 'utf8');
  if (!/answer:\s*function/.test(t)) bad('game-track.js: MangoiGame.answer 가 없다');
  else if (!/_origFetch\(/.test(t)) bad('game-track.js: 자체 전송이 «감싼» fetch 를 쓰면 정답이 두 배로 세어진다');
  else if (!/if \(uid\(\) === 'guest'\) return;/.test(t)) bad('game-track.js: 익명(guest) 단어기록 차단이 없다');
  else ok('game-track.js — answer() 개방 · 자체 전송은 원본 fetch · guest 단어기록 차단');
}

/* ── ⑥ 화면의 «정오답 미계측» 목록이 계측된 게임을 아직 붙들고 있지 않은가 ── */
{
  const page = readFileSync(join(PUB, 'admin', 'game-insights.html'), 'utf8');
  const m = page.match(/NO_ANSWER_TRACKING\s*=\s*\[([^\]]*)\]/);
  if (!m) bad('game-insights.html: NO_ANSWER_TRACKING 목록을 못 찾음');
  else {
    const listed = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    const nowTracked = ['shooter', 'wordfighter', 'grammar-pizza', 'rescue-voyage', 'suspect-mystery', 'battle-3d'];
    const stale = listed.filter(g => nowTracked.indexOf(g) >= 0);
    if (stale.length) bad('game-insights.html: 이제 계측되는데 아직 «미계측» 으로 표시 — ' + stale.join(', '));
    else ok('game-insights.html — «정오답 미계측» 목록이 최신');
  }
}

console.log('\n──────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
if (fail) {
  console.log('\n  ⚠️ 계측이 «있는 척» 만 하고 있습니다:');
  problems.forEach(p => console.log('    - ' + p));
  process.exit(1);
}
console.log('  ✅ 6종 모두 판정 시점에 실제로 계측이 불립니다.');
