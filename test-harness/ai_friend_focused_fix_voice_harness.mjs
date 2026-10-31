/*!
 * 🎯 ai_friend_focused_fix_voice_harness — A.i친구 집중교정 «아바타가 고친 문장을 3번 말한다» 감시 (2026-10-31)
 *
 * 발단 — 사장님 화면 실측: 집중교정을 골랐는데 "Hamburgers is yummy." 의 교정이
 *   카드 글자로만 뜨고 아바타는 말하지 않았다. 말하기(warmup)는 ensureFocusedFixSpoken 으로
 *   고친 문장을 3번 말하는데 A.i친구 화면(ai-friend.html)에는 그 처리가 없었다.
 *
 * 고침 — 답장을 다 읽은 «뒤에» "You can say... <fix.now>" 를 3번 읽는다(speakFocusedFix).
 *
 * 🪤 Codex 리뷰(PR #1913)가 잡은 것: 서버가 답을 바꾼 턴(replaced:1)은 stmReset() 이 _stmGen 을
 *    올리는데, 세대 번호를 그 «앞에서» 잡으면 교정 3번이 통째로 건너뛰어진다. ⑥절이 그 경우다.
 *
 * ⛔ 문자열로 «있는가» 만 보지 않는다 — 함수와 재생 블록을 소스에서 오려 내 가짜 TTS 로 «실제로 돌려»
 *    무엇을 몇 번, 어떤 순서로 읽었는지를 답으로 묻는다.
 * 실행: node test-harness/ai_friend_focused_fix_voice_harness.mjs
 *   (변이시험용: AIF_HTML=<다른 경로> 로 사본을 넘길 수 있다)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML_PATH = process.env.AIF_HTML || join(ROOT, 'cloudflare-deploy', 'public', 'ai-friend.html');
const HTML = readFileSync(HTML_PATH, 'utf8');

let pass = 0, fail = 0; const failures = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name); console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

/** start 위치부터 처음 만나는 '{' 의 짝 '}' 까지 자른다(문자열·주석은 단순 추적). */
function sliceBraces(src, start) {
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0, i = open, q = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

// ── ⓪ 정본에서 오려 내기 ────────────────────────────────────────────
const iTimes = HTML.indexOf('const FOCUSED_FIX_SAY_TIMES');
const iFn = HTML.indexOf('function speakFocusedFix(');
const iReset = HTML.indexOf('function stmReset(');
const iBlock = HTML.indexOf('let fixGen = _stmGen;');
const TIMES_SRC = iTimes >= 0 ? HTML.slice(iTimes, HTML.indexOf(';', iTimes) + 1) : '';
const FN_SRC = iFn >= 0 ? sliceBraces(HTML, iFn) : '';
const RESET_SRC = iReset >= 0 ? sliceBraces(HTML, iReset) : '';
// 재생 블록: fixGen 선언부터 «else if (isSoundOn()) { … }» 의 짝 중괄호까지
const iElse = iBlock >= 0 ? HTML.indexOf('else if (isSoundOn())', iBlock) : -1;
const BLOCK_SRC = (iBlock >= 0 && iElse >= 0)
  ? HTML.slice(iBlock, iElse) + sliceBraces(HTML, iElse) : '';

console.log('\n⓪ 정본에서 오려 내기');
ok('⓪-1 FOCUSED_FIX_SAY_TIMES 선언을 찾았다', !!TIMES_SRC);
ok('⓪-2 speakFocusedFix 함수를 오려 냈다', FN_SRC.length > 50);
ok('⓪-3 stmReset 함수를 오려 냈다', RESET_SRC.includes('_stmGen++'));
ok('⓪-4 답장 재생 블록을 오려 냈다', BLOCK_SRC.includes('speakText(') && BLOCK_SRC.includes('fixAfterReply'));
if (!TIMES_SRC || !FN_SRC || !RESET_SRC || !BLOCK_SRC) {
  console.log(`\n결과: PASS ${pass} · FAIL ${fail} (정본을 못 읽어 실행 검사를 할 수 없음)`);
  process.exit(1);
}

// ── 실행 틀: 가짜 TTS 로 오려 낸 코드를 그대로 돌린다 ─────────────────────
const factory = new Function(`
  let currentCorr = 'focused', soundOn = true;
  var _stmGen = 0, _stmChain = Promise.resolve(), _stmSpoke = false, _stmRow = null;
  let spoken = [], onSpeak = null;
  const window = {}, document = { querySelectorAll: () => [] };
  function isSoundOn() { return soundOn; }
  function speakText(text, btn, row, onDone) {
    spoken.push(String(text));
    if (onSpeak) onSpeak(String(text));
    if (typeof onDone === 'function') setTimeout(onDone, 0);   // 재생이 «끝난 뒤» 신호
  }
  ${RESET_SRC}
  ${TIMES_SRC}
  ${FN_SRC}
  return async function run(o) {
    currentCorr = o.mode || 'focused'; soundOn = o.sound !== false;
    _stmGen = 5; _stmSpoke = !!o.streamed; spoken = []; onSpeak = null;
    _stmChain = o.streamed
      ? new Promise(r => setTimeout(() => { spoken.push('[stream]'); r(); }, 0))
      : Promise.resolve();
    if (o.newTurnAfter) {
      let n = 0;
      onSpeak = t => { if (t.indexOf('You can say') === 0 && ++n === o.newTurnAfter) _stmGen++; };
    }
    const d = o.d;
    ${BLOCK_SRC}
    for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0));
    return spoken.slice();
  };
`);
const run = factory();

const FIX = { was: 'Hamburgers is yummy.', now: 'Hamburgers are yummy.' };
const REPLY = 'Great try! Do you eat hamburgers at home or outside?';
const LINE = 'You can say... ' + FIX.now;
const fixCount = arr => arr.filter(t => t === LINE).length;

// ① 집중교정 + 일반 재생
console.log('\n① 집중교정 — 일반(비스트리밍) 재생');
{
  const s = await run({ mode: 'focused', d: { reply: REPLY, fix: FIX } });
  ok('①-1 답장을 읽는다', s[0] === REPLY, JSON.stringify(s));
  ok('①-2 고친 문장을 정확히 3번 읽는다', fixCount(s) === 3, JSON.stringify(s));
  ok('①-3 교정은 답장 «뒤에» 온다(겹치면 TTS 가 앞 문장을 끊음)', s.indexOf(LINE) > s.indexOf(REPLY));
  ok('①-4 읽는 문장은 서버가 준 fix.now 그대로다(지어내지 않음)', s.slice(1).every(t => t === LINE));
}

// ② 짝: 다른 모드는 카드만 — 소리로 안 읽는다
console.log('\n② 짝 — 균형·자유대화는 교정을 소리로 안 읽는다');
for (const m of ['balanced', 'free_talk']) {
  const s = await run({ mode: m, d: { reply: REPLY, fix: FIX } });
  ok(`②-${m} 답장만 읽고 교정은 0번`, s.length === 1 && s[0] === REPLY && fixCount(s) === 0, JSON.stringify(s));
}

// ③ 교정이 없거나 불완전하면 아무것도 덧붙이지 않는다
console.log('\n③ 교정 없음 / 불완전');
{
  const s1 = await run({ mode: 'focused', d: { reply: REPLY, fix: null } });
  ok('③-1 fix 가 null 이면 답장만', s1.length === 1 && s1[0] === REPLY, JSON.stringify(s1));
  const s2 = await run({ mode: 'focused', d: { reply: REPLY, fix: { was: 'x', now: '   ' } } });
  ok('③-2 fix.now 가 빈칸이면 답장만', s2.length === 1, JSON.stringify(s2));
}

// ④ 소리 끔
console.log('\n④ 소리 끔');
{
  const s = await run({ mode: 'focused', sound: false, d: { reply: REPLY, fix: FIX } });
  ok('④-1 소리가 꺼져 있으면 아무것도 안 읽는다', s.length === 0, JSON.stringify(s));
}

// ⑤ 스트리밍으로 이미 읽은 턴
console.log('\n⑤ 스트리밍으로 이미 읽은 턴(replaced 없음)');
{
  const s = await run({ mode: 'focused', streamed: true, d: { reply: REPLY, fix: FIX } });
  ok('⑤-1 답장을 다시 읽지 않는다', !s.includes(REPLY), JSON.stringify(s));
  ok('⑤-2 스트리밍이 끝난 뒤 교정을 3번 읽는다', s[0] === '[stream]' && fixCount(s) === 3, JSON.stringify(s));
}

// ⑥ 🪤 Codex 지적 — 서버가 답을 바꾼 턴
console.log('\n⑥ 🪤 서버가 답을 바꾼 턴(replaced:1) — stmReset 이 세대를 올려도 교정이 살아 있다');
{
  const s = await run({ mode: 'focused', streamed: true, d: { reply: REPLY, fix: FIX, replaced: 1 } });
  ok('⑥-1 바뀐 답장을 다시 읽는다', s.includes(REPLY), JSON.stringify(s));
  ok('⑥-2 교정 3번이 건너뛰어지지 않는다', fixCount(s) === 3, JSON.stringify(s));
  ok('⑥-3 교정은 바뀐 답장 «뒤에» 온다', s.indexOf(LINE) > s.indexOf(REPLY), JSON.stringify(s));
}

// ⑦ 반복 도중 새 턴이 시작되면 남은 반복은 버린다
console.log('\n⑦ 반복 도중 새 턴·정지');
{
  const s = await run({ mode: 'focused', d: { reply: REPLY, fix: FIX }, newTurnAfter: 1 });
  ok('⑦-1 첫 번째 뒤에 새 턴이 오면 그 뒤 반복은 멈춘다', fixCount(s) === 1, JSON.stringify(s));
}

console.log('\n════════════════════════════════════════════');
console.log(`  결과: PASS ${pass} · FAIL ${fail}`);
console.log('════════════════════════════════════════════');
if (fail) { console.log('  실패: ' + failures.join(' | ')); process.exit(1); }
