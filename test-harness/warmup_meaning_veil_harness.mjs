// warmup_meaning_veil_harness.mjs — 웜업 «뜻» 도움 정리 (2026-10-02 사장님 제보 6건)
//
//  ① 버튼이 너무 많다            → 뜻은 가려진 줄 하나, 대답 예시는 «문장 자체가 버튼»
//  ② 뜻에 「ㅋㅋㅋㅋ」가 나온다     → src/learn-meaning-check.ts (캐시 읽을 때도 거른다)
//  ③ 예시가 늘 Yes, I do · No, I don't → src/warmup-answers.ts swapAnswers(낱말 하나만 바꾼 두 대답)
//  ④ 「입력칸에 넣고 고치기」 3개   → js/warmup-guide.js 에서 그 버튼이 사라졌다
//  ⑤⑥ 흐름·모바일               → 1 혼자 → 2 뜻 → 3 대답 예시, 뜻은 «모를 때만»(가리개 + 5/8초 반짝)
//  + 「blue balls」 실사고         → src/reply-sanity.ts 'unsafe' (버리고 다시 뽑는다)
//
// ⚠️ 글자가 있는가만 보지 않는다 — 판정·함수를 소스에서 오려 내 «실제로 돌려» 답을 본다.
//    그리고 «막는다» 옆에 «정상은 그대로다» 를 짝으로 둔다(짝이 없으면 «전부 막기» 도 통과한다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, 'cloudflare-deploy', p);
const R = (p) => fs.readFileSync(P(p), 'utf8');
const imp = (p) => import('file://' + P(p).replace(/\\/g, '/'));
// 주석을 벗긴 사본 — 부정 검사가 «왜 지웠는지» 적은 자기 주석을 잡지 않게(줄 단위 추적)
function strip(src) {
  let out = '', i = 0, inB = false, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inB) { if (c === '*' && n === '/') { inB = false; i += 2; } else i++; continue; }
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && n === '*') { inB = true; i += 2; continue; }
    if (c === '/' && n === '/' && src[i - 1] !== ':') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
// 중괄호 짝으로 함수 몸통을 자른다(«길이» 로 자르지 않는다)
function fnAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const b = src.indexOf('{', i); let d = 0;
  for (let j = b; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); } }
  return '';
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra !== undefined ? '— ' + JSON.stringify(extra) : ''); }
}

console.log('\n[A] ② 뜻에 «ㅋㅋㅋㅋ» — 정본을 실제로 돌린다');
const M = await imp('src/learn-meaning-check.ts');
ok('A-1 「ㅋㅋㅋㅋ」 만 온 뜻은 버린다', M.isUsableKoMeaning('ㅋㅋㅋㅋ', 'Haha') === false);
ok('A-2 (짝) 멀쩡한 뜻은 그대로 쓴다', M.isUsableKoMeaning('빨간 공을 좋아하니?', 'Do you like the red ball?') === true);
ok('A-3 자모 덩어리만 걷어 내면 뜻이 남는다', M.stripJamoRuns('ㅋㅋㅋㅋ 좋아요!') === '좋아요!', M.stripJamoRuns('ㅋㅋㅋㅋ 좋아요!'));
ok('A-4 원문을 그대로 돌려준 «번역» 은 버린다', M.isUsableKoMeaning('Hello', 'Hello') === false);
ok('A-5 한글이 한 글자도 없으면 버린다', M.isUsableKoMeaning('...', 'x') === false && M.isUsableKoMeaning('', 'x') === false);
ok('A-6 (짝) 자모 한 글자(ㅇ)는 «덩어리» 가 아니다 — 2글자 이상만 걷는다', M.stripJamoRuns('네 ㅇ 좋아') === '네 ㅇ 좋아');
const MANGO = strip(R('src/api-mango.ts'));
ok('A-7 번역 처리기가 정본을 불러 쓴다(import)', /import \{[^}]*isUsableKoMeaning[^}]*\} from '\.\/learn-meaning-check'/.test(MANGO));
ok('A-8 캐시에서 꺼낼 때도 거른다(옛 「ㅋㅋㅋㅋ」 가 180일 남아 있으므로)',
  /cached != null[^;]*learnMode && target === 'ko' && !isUsableKoMeaning\(cached, t\)/.test(MANGO));
ok('A-9 새로 만든 뜻도 거르고 못 쓰면 비운다(=캐시 안 함)',
  /if \(learnMode && target === 'ko' && mt\) \{ mt = stripJamoRuns\(mt\); if \(!isUsableKoMeaning\(mt, src\)\) mt = ''; \}/.test(MANGO));
ok('A-10 (짝) 그 거르기는 «뜻(learn)» 일 때만 — 채팅 번역의 「ㅋㅋ」 는 그대로 둔다',
  !/isUsableKoMeaning\((?:cached|mt)[^)]*\)/.test(MANGO.replace(/learnMode && target === 'ko' && !?isUsableKoMeaning\([^)]*\)/g, '')
    .replace(/if \(!isUsableKoMeaning\(mt, src\)\)/g, '')));

console.log('\n[B] ③ 예시가 늘 Yes/No — 낱말 하나만 바꾼 두 대답');
const A = await imp('src/warmup-answers.ts');
const red = A.warmupAnswerChips('Okay! Do you like the red ball?', 1);
ok('B-1 사장님 화면의 그 질문 → 「the red ball」·「the blue ball」', red[0] === 'I like the red ball.' && red[1] === 'I like the blue ball.', red);
ok('B-2 1단계는 막혔을 때 말이 하나 붙는다', red.includes('One more time, please.'), red);
const piz = A.warmupAnswerChips('Do you like pizza?', 3);
ok('B-3 음식도 바꿔 준다(3단계엔 막힘 말 없음)', piz.length === 2 && piz[0] === 'I like pizza.' && piz[1] === 'I like chicken.', piz);
const pet = A.warmupAnswerChips('Do you have a pet?', 1);
ok('B-4 (짝) 바꿀 낱말이 없으면 예전처럼 Yes/No', pet.some((x) => /^Yes/.test(x)) && pet.some((x) => /^No/.test(x)), pet);
const either = A.warmupAnswerChips('Do you like pizza or chicken?', 2);
ok('B-5 (짝) 양자택일은 예전 그대로(질문 속 두 말)', either.join('|').includes('pizza') && either.join('|').includes('chicken'), either);
const two = A.warmupAnswerChips('Do you like dogs and cats?', 1);
ok('B-6 바꿀 낱말이 둘이면 지어내지 않는다(Yes/No 로)', two.some((x) => /^Yes/.test(x)), two);
ok('B-7 4단계 이상은 칩을 안 만든다(서버 정본 그대로)', A.warmupAnswerChips('Do you like the red ball?', 4).length === 0);
ok('B-8 모든 보기가 그 단계 낱말 수 상한 안이다',
  [[red, 1], [piz, 3], [pet, 1]].every(([l, lv]) => l.every((s) => s.split(/\s+/).length <= A.WARMUP_CHIP_WORD_CAP[lv])));

console.log('\n[C] 「blue balls」 — 아이에게 내보내면 안 되는 표현은 버리고 다시 뽑는다');
const S = await imp('src/reply-sanity.ts');
ok('C-1 사장님 화면의 그 문장은 «unsafe»', S.replyRejectReason('Okay! Do you like blue balls?') === 'unsafe');
for (const ok1 of ['Do you like the red ball?', 'I like baseball and basketball.', 'Do you play football?', 'I saw it with my naked eye.'])
  ok('C-2 (짝) 멀쩡한 문장은 통과 — ' + ok1, S.replyRejectReason(ok1) === '', S.replyRejectReason(ok1));
const IDX = R('src/index.ts');
ok('C-3 웜업 대화가 그 판정으로 «다시 뽑는» 경로를 이미 지난다', /let broke = aiText \? replyRejectReason\(aiText, sanityCap\)/.test(IDX));

console.log('\n[D] 화면(js/warmup-guide.js) — 함수를 오려 내 실제로 돌린다');
const GJ = R('public/js/warmup-guide.js');
const G = strip(GJ);
ok('D-1 「입력칸에 넣고 고치기」 버튼이 없다(④)', !/입력칸에 넣고 고치기/.test(G));
ok('D-2 옛 3단계 사다리(nextHelp·wgHelpNext)가 없다(①)', !/nextHelp|wgHelpNext/.test(G));
// 막힘 말 목록 — 서버 정본과 «같은 글자» 인가
const stuckM = GJ.match(/var STUCK = (\[[^\]]*\]);/);
// warmup-zh.ts 는 확장자 없는 import 가 있어 그대로 못 부른다 — 선언 줄을 «읽어» 쓴다(하니스에 베끼지 않는다)
const zhM = R('src/warmup-zh.ts').match(/export const WARMUP_ZH_STUCK_CHIPS: string\[\] = (\[[^\]]*\]);/);
let ZH_STUCK = []; try { ZH_STUCK = zhM ? eval(zhM[1]) : []; } catch {}
ok('D-2b (전제) 중국어 막힘 말 정본을 읽었다', ZH_STUCK.length >= 1);
let STUCK = []; try { STUCK = stuckM ? eval(stuckM[1]) : []; } catch {}
const serverStuck = A.WARMUP_STUCK_CHIPS.concat(ZH_STUCK);
ok('D-3 막힘 말 목록이 서버 두 정본과 같다', STUCK.length === serverStuck.length && serverStuck.every((s) => STUCK.includes(s)), { STUCK, serverStuck });
// 노란 «바꿀 낱말» 자리
const sw = fnAt(GJ, 'function swapIndex(');
let swapIndex = null; try { swapIndex = new Function(sw + '; return swapIndex;')(); } catch (e) {}
ok('D-4 (전제) swapIndex 를 오려 냈다', typeof swapIndex === 'function');
const si = (a, b) => { try { return swapIndex(a, b); } catch { return 'ERR'; } };
ok('D-5 두 대답에서 다른 낱말 자리를 찾는다(red/blue → 3번째 낱말)', si('I like the red ball.', 'I like the blue ball.') === 3);
ok('D-6 (짝) 두 군데 이상 다르면 칠하지 않는다', si('I like the red ball.', 'You want a blue cat.') === -1);
ok('D-7 (짝) 길이가 다르면 칠하지 않는다', si('Yes, I do.', 'No, I don’t like it.') === -1);
// 반짝임 시간 — 1~2단계 5초 · 그 위 8초
const sn = fnAt(GJ, 'function scheduleNudge(');
const msM = sn.match(/var ms=([^;]+);/);
const msAt = (lv) => { try { return new Function('_warmLevel', 'return ' + msM[1])(lv); } catch { return NaN; } };
ok('D-8 (전제) 반짝임 시간 식을 찾았다', !!msM);
ok('D-9 1·2단계는 5초', msAt(1) === 5000 && msAt(2) === 5000, [msAt(1), msAt(2)]);
ok('D-10 (짝) 3단계부터는 8초', msAt(3) === 8000 && msAt(8) === 8000, [msAt(3), msAt(8)]);
// «도움» 버튼: 사람이 누르면 뜻부터 · 혼자 멈춘 것(25초)은 «반짝» 만
const oh = fnAt(GJ, 'function offerHelp(');
const runOffer = (byUser, meaningOpen, veil) => {
  const calls = [];
  try {
    new Function('byUser', 'meaningOpen', 'veil', 'calls',
      `var _warmPaused=false, sending=false, _recognizing=false;
       function nudge(){calls.push('nudge');}
       function openLatestMeaning(){calls.push('openMeaning');return veil;}
       function meaningOpened(){calls.push('meaningOpened');}
       function showAnswers(){calls.push('answers');}
       ${oh}; offerHelp(byUser);`)(byUser, meaningOpen, veil, calls);
  } catch (e) { calls.push('ERR:' + e.message); }
  return calls.join(',');
};
ok('D-11 사람이 누르면(뜻을 아직 안 봤으면) 뜻부터 연다', runOffer(true, false, true) === 'openMeaning', runOffer(true, false, true));
ok('D-12 혼자 멈춘 것(자동 호출)은 열지 않고 반짝이기만 한다', runOffer(undefined, false, true) === 'nudge', runOffer(undefined, false, true));
ok('D-13 뜻을 이미 봤으면 대답 예시', runOffer(true, true, true) === 'answers', runOffer(true, true, true));
ok('D-14 가려진 줄이 없으면(옛 말풍선) 바로 2단계로', runOffer(true, false, false) === 'openMeaning,meaningOpened', runOffer(true, false, false));
ok('D-15 선생님 요약이 «혼자 · 뜻 본 뒤 · 예시 사용» 셋으로 나뉜다',
  /On own \/ 혼자[\s\S]{0,80}After meaning \/ 뜻 본 뒤[\s\S]{0,80}With example \/ 예시 사용/.test(G));
ok('D-16 답에 «그때 받은 도움» 을 붙여 둔다', /answers\.push\(\{[^}]*help:helpLevel/.test(G));
ok('D-17 화면 쪽 API 에 meaningOpened 가 있다', /MangoWarmupGuide=\{[^}]*meaningOpened:meaningOpened/.test(G));

console.log('\n[E] warmup.html — 뜻은 «모를 때만»');
const H = strip(R('public/warmup.html'));
ok('E-1 AI 말풍선에 «가려진 뜻» 줄이 붙는다', /mb\.className = 'mean-btn mean-veil'/.test(H));
ok('E-2 1~2단계 자동 열기가 없다(교육 효과 — 사장님 지시)', !/_warmLevel <= 2 && _subMode === 'on'/.test(H));
ok('E-3 누르면 열리고 화면 흐름(2단계)에 알린다', /function openMeaningVeil\([\s\S]{0,300}MangoWarmupGuide\.meaningOpened/.test(H));
const sac = fnAt(R('public/warmup.html'), 'function showAnswerChips(');
ok('E-4 대답 예시가 8초 뒤 저절로 열리지 않는다(뜻을 본 뒤에만)', !!sac && !/setTimeout\([^)]*offerHelp/.test(strip(sac)));
ok('E-5 도움 패널에 단계 표시·대답 예시 버튼 자리가 있다', /id="wgHelpSteps"/.test(H) && /id="wgHelpMore"/.test(H));
ok('E-6 (짝) 자동 마이크 모듈은 그대로 실린다', /js\/warmup-auto-talk\.js/.test(H));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
