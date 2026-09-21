// -*- coding: utf-8 -*-
// ⏸ AI 자동 진단 «중간 멈춤 · 이어서 하기» 하니스 (의존성 없음)
//   실행:  node test-harness/leveltest_resume_harness.mjs
//   대상:  cloudflare-deploy/public/level-test-ai.html
//
//   발단(2026-09-21 제보): 「24문항 중 14문항(약 7분) 풀고 전화를 받고 돌아오니 처음부터
//   다시 시작해야 됨. 중간 멈춤 기능이 있었으면 함.」
//   원인은 진행 상태(answers·idx)가 화면의 JS 변수에만 있던 것 — 폰은 전화·앱 전환만으로도
//   탭을 버린다. 에러가 안 나서 그때까지 하니스가 전부 초록이었다.
//
//   ⚠️ 저장·복구 함수는 «있는가» 로 보지 않고 소스에서 오려 내 **실제로 돌린다**(CLAUDE.md 2장).
//      되돌리기(0을 falsy 로 판정 · TTL 제거 · 채점 실패에도 저장을 지우기)는 아래에서 실제로 FAIL 난다.
//   📄 브라우저 검사(사람이 부름): test-harness/manual/leveltest-resume-browser.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(resolve(__dir, p), 'utf8');
const HTML = rd('../cloudflare-deploy/public/level-test-ai.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const fn = (name) => (HTML.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}')) || [''])[0];
/* 선택지 클릭 핸들러 — 길이로 자르지 않고 중괄호 짝으로(옆 코드가 딸려 오지 않게) */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  let d = 0, start = src.indexOf('{', i);
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(start, j + 1); }
  }
  return '';
}

console.log('\n[ A. 저장·복구 함수를 실제로 돌린다 ]');
let L, store;
{
  const src = ['countDone', 'saveProgress', 'clearSaved', 'loadSaved', 'whenLabel', 'firstUnanswered'].map(fn).join('\n');
  const lsKey = (HTML.match(/var LS_KEY = '([^']+)'/) || [])[1];
  const ttlExpr = (HTML.match(/var SAVE_TTL_MS = ([^;]+);/) || [])[1];
  check('저장·복구 함수 6개를 소스에서 오려 냈다', src.length > 700 && !!lsKey && !!ttlExpr, `len=${src.length} key=${lsKey}`);
  check('저장 키가 이 저장소 규약(mangoi_*)을 따른다', /^mangoi_/.test(lsKey || ''), lsKey);

  /* 가짜 localStorage — 시크릿 창처럼 «던지는» 경우도 흉내 낸다 */
  store = { data: {}, throws: false };
  const fakeLS = {
    getItem(k) { if (store.throws) throw new Error('blocked'); return k in store.data ? store.data[k] : null; },
    setItem(k, v) { if (store.throws) throw new Error('blocked'); store.data[k] = String(v); },
    removeItem(k) { if (store.throws) throw new Error('blocked'); delete store.data[k]; },
  };
  /* 🪤 되돌리기 시험에서 문법이 깨지면 스택트레이스만 남아 «무엇이 깨졌는지» 가 안 보인다
     → try/catch 로 깔끔한 FAIL 로 바꾼다 (recording_stop_truth_harness ⑧절 선례) */
  let mk;
  try {
    mk = new Function('localStorage', '$', 'answers', 'questions', 'SAVE_TTL_MS_IN',
      'var LS_KEY = ' + JSON.stringify(lsKey) + '; var SAVE_TTL_MS = SAVE_TTL_MS_IN;\n' + src +
      '\nreturn { countDone, saveProgress, clearSaved, loadSaved, whenLabel, firstUnanswered, TTL: SAVE_TTL_MS };');
  } catch (e) {
    check('오려 낸 저장·복구 함수가 문법에 맞는다', false, String(e && e.message).slice(0, 120));
    console.log(`\n  ⚠ 실패 ${FAIL}건 / 통과 ${PASS}건 — 함수를 못 만들어 아래 검사를 건너뜁니다\n`);
    process.exit(1);
  }
  const TTL = Number(new Function('return ' + ttlExpr)());
  const ANSWERS = {}, QS = [];
  for (const lv of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']) for (let i = 1; i <= 4; i++) QS.push({ id: `${lv.toLowerCase()}_${i}` });
  L = mk(fakeLS, () => ({ value: '김망고' }), ANSWERS, QS, TTL);
  check('보관기간이 하루(24시간)다', TTL === 24 * 60 * 60 * 1000, String(TTL));

  // ① 저장 → 복구
  ANSWERS.a1_1 = 0; ANSWERS.a1_2 = 3; ANSWERS.a1_3 = 1;
  L.saveProgress();
  let sv = L.loadSaved();
  check('① 저장한 것이 그대로 되살아난다', !!sv && sv.done === 3 && sv.answers.a1_2 === 3, JSON.stringify(sv && { done: sv.done, a1_2: sv.answers.a1_2 }));
  check('① 이름도 함께 저장된다', !!sv && sv.name === '김망고', sv && sv.name);
  check('① 문항 «번호» 가 아니라 «id» 로 저장한다(은행이 바뀌어도 남의 답이 안 붙게)',
    !!sv && 'a1_1' in sv.answers && !('0' in sv.answers), JSON.stringify(sv && Object.keys(sv.answers)));

  // ② 🔴 A번(0) 함정
  check('🔴 ② A번(인덱스 0)을 고른 문항도 «푼 것» 으로 센다', L.countDone() === 3, String(L.countDone()));
  check('🔴 ② firstUnanswered 가 A번을 고른 문항을 건너뛴다 (0 은 falsy 다)',
    L.firstUnanswered() === 3, String(L.firstUnanswered()));
  for (const q of QS) ANSWERS[q.id] = 0;   // 전부 A번
  check('🔴 ② 전부 A번으로 답해도 «다 풀었다»(-1)로 본다', L.firstUnanswered() === -1, String(L.firstUnanswered()));
  for (const q of QS) delete ANSWERS[q.id];
  ANSWERS.a1_1 = 0; ANSWERS.a1_2 = 3; ANSWERS.a1_3 = 1;

  // ③ TTL
  L.saveProgress();
  store.data[lsKey] = JSON.stringify({ ...JSON.parse(store.data[lsKey]), ts: Date.now() - TTL - 1000 });
  check('③ 보관기간이 지난 저장은 안 내준다', L.loadSaved() === null);
  check('③ 그리고 정리한다(계속 남아 헷갈리지 않게)', !(lsKey in store.data));

  // ④ 망가진 값
  const bad = [['null', 'null'], ['깨진 JSON', '{oops'], ['옛 판(v:2)', '{"v":2,"answers":{},"done":3,"ts":' + Date.now() + '}'],
               ['answers 없음', '{"v":1,"done":3,"ts":' + Date.now() + '}'], ['0문항', '{"v":1,"answers":{},"done":0,"ts":' + Date.now() + '}']];
  let ok4 = true;
  for (const [, v] of bad) { store.data[lsKey] = v; if (L.loadSaved() !== null) ok4 = false; }
  check('④ 망가진·옛 판·0문항 저장은 전부 «없음» 으로 본다(던지지 않는다)', ok4);

  // ⑤ localStorage 가 던지는 환경(시크릿 창·저장 차단)
  store.throws = true;
  let threw = false, savedRet;
  try { savedRet = L.saveProgress(); L.clearSaved(); if (L.loadSaved() !== null) threw = true; } catch (e) { threw = true; }
  store.throws = false;
  check('⑤ localStorage 가 막힌 환경에서도 던지지 않는다(시험은 그대로 돌아간다)', !threw);
  /* 🔴 (2026-09-21 함정 대조) «저장됐다고 말하기 전에 저장됐는지 확인한다».
     조용히 삼키면 화면이 «여기까지 저장했어요» 라고 단정하고, 학생은 안심하고 나가서
     처음부터 다시 푼다 — 이 화면이 고치려던 바로 그 사고다. */
  check('🔴 ⑤ 저장이 막히면 saveProgress 가 false 를 돌려준다(조용히 삼키지 않는다)', savedRet === false, String(savedRet));
  store.data = {}; ANSWERS.a1_1 = 0;
  check('🔴 ⑤ 정상일 때는 true 를 돌려준다(«못 한다» 쪽으로만 실패하지 않게)', L.saveProgress() === true, String(L.saveProgress()));
  /* setItem 이 던지지 «않고» 아무것도 안 하는 환경도 있다 — 다시 읽어 확인해야 잡힌다 */
  store.data = {}; const realSet = fakeLS.setItem;
  fakeLS.setItem = function(){ /* 쓴 척만 한다 */ };
  check('🔴 ⑤ 쓴 척만 하는 환경도 false 로 잡는다(다시 읽어 확인한다)', L.saveProgress() === false);
  fakeLS.setItem = realSet;

  // ⑥ 언제 저장했는지
  const now = Date.now();
  check('⑥ 오늘 저장은 «오늘 오전/오후 h:mm»', /^오늘 (오전|오후) \d{1,2}:\d{2}$/.test(L.whenLabel(now)), L.whenLabel(now));
  check('⑥ 어제 저장은 «어제 …»', /^어제 /.test(L.whenLabel(now - 86400000)), L.whenLabel(now - 86400000));
  check('⑥ 분은 두 자리로 찍는다(3:7 이 아니라 3:07)',
    /:\d{2}$/.test(L.whenLabel(new Date(2026, 8, 21, 15, 7).getTime())), L.whenLabel(new Date(2026, 8, 21, 15, 7).getTime()));
}

console.log('\n[ B. 배선 — 함수가 «있는가» 가 아니라 «그 자리에서 쓰는가» ]');
{
  const clickBody = blockAt(HTML, "b.addEventListener('click', function(){");
  check('선택지 클릭 블록을 중괄호 짝으로 오려 냈다', clickBody.length > 60 && /answers\[q\.id\] = i/.test(clickBody));
  check('🔴 답을 고르면 «넘어가기 전에» 저장한다 (마지막 한 문항이 안 날아가게)',
    /answers\[q\.id\] = i;[\s\S]{0,140}?saveProgress\(\)/.test(clickBody), clickBody.replace(/\s+/g, ' ').slice(0, 140));
  check('🔴 그 결과를 «보고» 실패하면 화면 약속을 거둔다 (부르기만 하면 아무것도 안 막는다)',
    /if \(!saveProgress\(\)\) markSaveBroken\(\);/.test(clickBody), clickBody.replace(/\s+/g, ' ').slice(0, 140));

  const start = blockAt(HTML, 'function startQuiz(resume){');
  check('이어서 하기는 문항 «id» 로 답을 되살린다', /sv\.answers\[q\.id\]/.test(start));
  check('지금 받은 문항에 없는 id 의 답은 버린다(은행이 바뀐 경우)',
    /questions\.forEach\(function\(q\)\{[\s\S]{0,200}?sv\.answers\[q\.id\]/.test(start));
  check('처음부터 시작할 때는 저장본을 지운다', /\} else \{\s*\n\s*clearSaved\(\);/.test(start));
  check('🔴 전부 답해 둔 상태면 문항을 다시 풀리지 않고 바로 채점한다(채점만 실패했던 경우)',
    /idx = firstUnanswered\(\);[\s\S]{0,200}?if \(idx < 0\) \{ finish\(\); return; \}/.test(start));
  check('이어서 하기가 아닌 시작은 저장본이 있으면 되묻는다', /!resume && loadSaved\(\) && !window\.confirm\(/.test(start));

  const finish = blockAt(HTML, 'function finish(){');
  check('🔴 «성공이라고 말했는가»(ok===true + level)로 가른다 — fetch 는 500 에 reject 하지 않는다',
    /if \(!d \|\| d\.ok !== true \|\| !d\.level\) \{ gradeFailed\(\); return; \}/.test(finish), finish.replace(/\s+/g, ' ').slice(0, 160));
  check('🔴 저장본은 «결과가 확인된 뒤에만» 지운다 (채점 실패에 24문항이 날아가지 않게)',
    finish.indexOf('d.ok !== true') < finish.indexOf('clearSaved()') && finish.indexOf('clearSaved()') > 0);
  const failFn = fn('gradeFailed');
  check('채점이 실패하면 시작 화면이 «이어서 하기» 를 다시 내준다', /paintStartCard\(\)/.test(failFn));
  check('그 안내가 «저장돼 있다» 고 말한다(사람이 다시 풀지 않게)', /저장돼 있으니/.test(failFn));

  const paint = fn('paintStartCard');
  check('저장본이 있으면 큰 버튼을 «처음부터» 로 바꾼다 (눌러서 날리지 않게)', /처음부터 새로 하기/.test(paint));
  check('언제 저장한 것인지 화면에 적는다 (사람이 고를 수 있게)', /whenLabel\(sv\.ts\)/.test(paint));
  check('몇 문항까지 풀었는지 적는다', /sv\.done \+ ' \/ '/.test(paint));

  const pause = blockAt(HTML, "$('ai-pause').addEventListener('click', function(){");
  check('⏸ 멈춤 버튼이 저장하고 멈춤 화면을 연다', /saveProgress\(\)/.test(pause) && /pause-card/.test(pause));
  check('⏸ 멈춤 화면이 몇 문항까지 했는지 말한다', /pause-cnt/.test(pause));
  /* 🔴 저장이 실패했는데 «저장했어요» 라고 하면, 학생이 안심하고 나가서 처음부터 다시 푼다 */
  check('🔴 ⏸ 멈춤 화면이 저장 «결과» 를 보고 말을 고른다',
    /var ok = saveProgress\(\);/.test(pause) && /pause-title'\)\.textContent = ok \?/.test(pause), pause.replace(/\s+/g, ' ').slice(0, 160));
  check('🔴 ⏸ 저장 못 했을 때 «저장하지 못했어요» 라고 사실대로 말한다', /저장하지 못했어요/.test(pause));
  check('🔴 ⏸ 그때 «지금 끝까지 푸는 것이 안전» 이라고 할 일을 준다', /끝까지 마치는 것이 안전/.test(pause));
  const broken = fn('markSaveBroken');
  check('🔴 저장이 안 되는 것이 확인되면 문항 화면의 «자동 저장돼요» 약속을 거둔다',
    /ai-savednote/.test(broken) && /저장되지 않아요/.test(broken), broken.replace(/\s+/g, ' ').slice(0, 140));
  check('시작 화면의 «중간에 멈춰도 괜찮아요» 도 함께 거둔다', /ai-savehint/.test(broken));
  check('⛔ 미리 겁주지 않는다 — 실제로 실패한 뒤 «한 번만» 바꾼다', /if \(!saveOk\) return;/.test(broken));
}

console.log('\n[ C. 화면이 «안전하다» 고 말하는가 · 폰트 계약 ]');
{
  check('시작 화면이 «중간에 멈춰도 된다» 고 미리 알린다', /중간에 멈춰도 괜찮아요/.test(HTML));
  check('문항 화면에 자동 저장 안내가 있다', /푼 문항은 자동으로 저장돼요/.test(HTML));
  check('⏸ 잠시 멈추기 버튼이 있다', /id="ai-pause"/.test(HTML) && /잠시 멈추기/.test(HTML));
  check('이어서 하기 / 처음부터 버튼이 둘 다 있다', /id="rsm-go"/.test(HTML) && /id="rsm-fresh"/.test(HTML));
  check('멈춤 화면에 나가는 길이 있다', /id="pause-card"[\s\S]{0,900}?href="\/\?menu=leveltest"/.test(HTML));
  /* 🈶 한자 글꼴 검사가 <style> 안 CSS 주석의 홑낫표를 세므로 그 안에서는 « » 를 쓴다 */
  const styleBlock = (HTML.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
  check('<style> 안에 CJK 홑낫표가 없다 (983KB 한자 폰트 오판 방지)', !/[「」]/.test(styleBlock));
  /* 아이콘만 있는 버튼이 아니라 글자가 함께 있는 버튼이라 data-ko/data-en 함정은 안 밟는다 */
  check('새 버튼에 data-ko/data-en 을 달지 않았다 (textContent 를 통째로 갈아끼운다)',
    !/id="(ai-pause|rsm-go|rsm-fresh|pause-go)"[^>]*data-(ko|en)/.test(HTML));
}

console.log('\n════════════════════════════════════════');
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
console.log('════════════════════════════════════════\n');
