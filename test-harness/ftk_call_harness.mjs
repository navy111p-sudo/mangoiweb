// -*- coding: utf-8 -*-
// 📞 A.i 말하기 «얼굴 대화» 영상통화 화면(js/ftk-call.js) — 자막 계산·손(누르고 말하기) 모드·연결을 «실제로 돌려» 봅니다.
//   (2026-11-08 사장님 「영상 앱과 똑같이」 — 낱말씩 나오는 자막 2줄 · 듣는 중/생각 중 · 자동/손 모드)
//   화면 모양·버튼은 브라우저로: test-harness/manual/ftk-call-browser.mjs
//   짝으로 묻는 것: 「소리가 나기 전엔 자막이 없다」 ↔ 「소리가 난 만큼 나온다」
//                  「손 모드는 쉬며 기다린다」 ↔ 「자동은 바로 듣는다」
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const pub = join(dirname(fileURLToPath(import.meta.url)), '../cloudflare-deploy/public');
const read = (p) => readFileSync(join(pub, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (d ? '  ' + d : '')); } };
/* 중괄호 짝으로 함수 하나를 오려 낸다(문자열 안 중괄호는 이 함수들에 없다) */
function cut(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); }
  return '';
}

const call = read('js/ftk-call.js');
console.log('▶ ① 자막 — 말한 조각 + 지금 조각의 재생 비율');
const ctx = vm.createContext({});
vm.runInContext(cut(call, 'function units(') + '\n' + cut(call, 'function capText('), ctx);
ok('전제: 자막 함수 두 개를 소스에서 오려 냈다', typeof ctx.capText === 'function' && typeof ctx.units === 'function');
const P = ["You'd say 'Can I do both together?'", 'Totally!'];
ok('소리가 나기 전(idx -1)에는 자막이 없다', ctx.capText(P, -1, 0) === '');
ok('첫 조각 재생 시작 → 첫 낱말이 나온다', ctx.capText(P, 0, 0) === "You'd");
const half = ctx.capText(P, 0, 0.5);
ok('반쯤 → 일부만(전부 아님)', half.split(' ').length > 1 && half.split(' ').length < 6, half);
ok('조각 끝 → 그 조각 전부', ctx.capText(P, 0, 1) === P[0]);
ok('다음 조각 → 앞 조각 전부 + 새 낱말', ctx.capText(P, 1, 0) === P[0] + ' Totally!');
ok('조각 수보다 재생이 많아지면 전부 보인다', ctx.capText(P, 5, 0.1) === P.join(' '));
ok('빈 조각 목록 → 빈 자막', ctx.capText([], 0, 0.5) === '');
const zh = ctx.capText(['你好吗？', '我很好。'], 1, 0);
ok('중국어(띄어쓰기 없음)는 글자 단위로 늘어난다', zh === '你好吗？我', zh);
ok('되풀이해도 낱말 수가 줄지 않는다(비율 증가 = 자막 증가)', [0, .2, .4, .6, .8, 1].map(f => ctx.capText(P, 0, f).split(' ').length).every((n, i, a) => !i || n >= a[i - 1]));

console.log('▶ ② A.i 친구 — 손 모드는 선생님 말이 끝난 뒤 «쉬며» 기다린다');
const af = read('js/aifriend-facetalk.js');
async function runNext(hands) {
  const log = [];
  const c = vm.createContext({ window: { FtkCall: { handsFree: () => hands } }, log,
    turnSeq: 0, active: true, waitQuiet: async () => { log.push('quiet'); return true; },
    listen: () => { log.push('listen'); }, setState: (s) => log.push('state:' + s) });
  vm.runInContext('var turnSeq = 0, active = true;\n' + cut(af, 'function isCurrentTurn(') + '\n' + cut(af, 'function handsFree(') + '\n' + cut(af, 'async function next('), c);
  await vm.runInContext('next()', c);
  return log.join(',');
}
ok('자동(기본) → 바로 듣는다', (await runNext(true)) === 'listen', await runNext(true));
ok('손 모드 → 말이 끝나길 기다린 뒤 쉰다(듣지 않는다)', (await runNext(false)) === 'quiet,state:pause', await runNext(false));
ok('대답 뒤·첫 인사 뒤·들어올 때 모두 next() 를 지난다(손 모드가 새지 않는다)',
  /\n\s*next\(\);\n\s*\}\n\s*\/\* 선생님이 말하기 시작하면/.test(af) && /if \(my === turnSeq\) next\(\);/.test(af) && /if \(!hasTalk\) greet\(\); else next\(\);/.test(af));

{
  /* 대답 소리가 sendMsg 보다 늦게 나도 «말하는 중» 으로 보여야 자막이 나온다(브라우저 검사에서 실제로 빠졌던 자리) */
  const log = [];
  const c = vm.createContext({ log, Date, setTimeout, QUIET_MS: 700, SPEAK_WAIT_MS: 60000 });
  vm.runInContext('var state = "think", pending = 1, lastSpeakEnd = 0, turnSeq = 1, active = true;\n'
    + 'function avatarSpeaking(){ return false; } function setState(s){ state = s; log.push(s); }\n'
    + cut(af, 'function isCurrentTurn(') + '\n' + cut(af, '  function waitQuiet('), c);
  vm.runInContext('waitQuiet(1); setTimeout(function(){ pending = 0; lastSpeakEnd = 0; }, 50);', c);
  await new Promise(r => setTimeout(r, 400));
  ok('대답을 기다리는 동안 선생님 소리가 남아 있으면 «말하는 중»(speak) 으로 바꾼다', log[0] === 'speak', log.join(','));
}

console.log('▶ ③ 웜업 — 손 모드는 쉬고, 나갈 때 원래 말하기 방법으로');
const wu = read('js/warmup-facetalk.js');
ok('쉬는(idle) 자리에서 손 모드면 다시 듣기를 걸지 않는다', /if \(s === 'idle' && !handsFree\(\)\) \{ setState\('pause'\); return; \}/.test(wu));
ok('들어올 때 손 모드면 엔진을 «버튼» 으로', /AT\(\)\.setMode\(handsFree\(\) \? 'auto' : 'button'\)/.test(wu));
ok('원래 자동이던 사람은 나갈 때 자동으로 되돌린다', /else if \(AT\(\)\.mode\(\) !== 'auto'\) AT\(\)\.setMode\('auto'\)/.test(wu));

console.log('▶ ④ 연결 — 두 얼굴 화면이 손잡이를 넘기고, HTML 이 스킨을 싣는다');
for (const [file, mod, html] of [['js/aifriend-facetalk.js', af, 'ai-friend.html'], ['js/warmup-facetalk.js', wu, 'warmup.html']]) {
  const b = cut(mod, '  function build() {');
  ok(file + ': build() 안에서 FtkCall.mount(root, CALL)', /FtkCall\.mount\(root, CALL\)/.test(b));
  for (const k of ['en', 'title', 'text', 'parts', 'audio', 'tap', 'close', 'finish', 'replay', 'slow', 'hands', 'turns'])
    ok(file + ': 손잡이 ' + k, new RegExp('\\n    ' + k + ': ').test(mod));
  ok(file + ': 도움판이 열리면 gl-open(영상통화 화면은 그때만 보인다)', /root\.classList\.toggle\('gl-open', open\)/.test(mod));
  const h = readFileSync(join(pub, html), 'utf8');
  const i1 = h.indexOf('/js/ftk-call.js?v='), i2 = h.indexOf(file.replace('js/', '/js/') + '?v=');
  ok(html + ': 스킨을 싣고(얼굴 화면 스크립트보다 앞)', i1 > 0 && i2 > i1);
}

console.log('▶ ⑤ 스킨이 #ftk 의 속성을 «쓰지» 않는다(관찰자 되먹임 없음)');
const body = call.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('mount 밖에서 root.classList·root.setAttribute 를 쓰지 않는다', !/root\.(setAttribute|classList\.(add|remove|toggle))/.test(body.replace(/root = r; root\.classList\.add\('ftk-call'\);/, '')));
ok('관찰자는 #ftk 하나의 data-s·class 만 본다(body 아님)', /observe\(root, \{ attributes: true, attributeFilter: \['data-s', 'class'\] \}\)/.test(call) && !/observe\(document\.body/.test(call));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
