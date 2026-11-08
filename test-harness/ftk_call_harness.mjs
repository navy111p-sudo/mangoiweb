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
  for (const k of ['en', 'title', 'text', 'parts', 'audio', 'tap', 'close', 'finish', 'replay', 'slow', 'hands', 'turns', 'log', 'type'])
    ok(file + ': 손잡이 ' + k, new RegExp('\\n    ' + k + ': ').test(mod));
  ok(file + ': 도움판이 열리면 gl-open(영상통화 화면은 그때만 보인다)', /root\.classList\.toggle\('gl-open', open\)/.test(mod));
  const h = readFileSync(join(pub, html), 'utf8');
  const i1 = h.indexOf('/js/ftk-call.js?v='), i2 = h.indexOf(file.replace('js/', '/js/') + '?v=');
  ok(html + ': 스킨을 싣고(얼굴 화면 스크립트보다 앞)', i1 > 0 && i2 > i1);
}

console.log('▶ ⑤ 스킨이 #ftk 의 속성을 «쓰지» 않는다(관찰자 되먹임 없음)');
const body = call.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok('mount 밖에서 root.classList·root.setAttribute·className 을 쓰지 않는다', !/root\.(setAttribute|className\s*\+?=|classList\.(add|remove|toggle))/.test(body.replace(/root = r; root\.classList\.add\('ftk-call'\);/, '')));
ok('관찰자는 #ftk 하나의 data-s·class 만 본다(body 아님)', /observe\(root, \{ attributes: true, attributeFilter: \['data-s', 'class'\] \}\)/.test(call) && !/observe\(document\.body/.test(call));

console.log('▶ ⑥ 넓은 화면(PC) 2단 · 버튼 글자 · 자막 겹침 (2026-11-09 사장님 「추천한대로」)');
{
  /* 대화 기록 — 손잡이 log() 를 실제로 돌려 그린다 */
  const mk = () => { const kids = []; return { kids, set textContent(v) { if (v === '') kids.length = 0; }, appendChild(c) { kids.push(c); }, scrollTop: 0, scrollHeight: 999 }; };
  const logEl = mk(); let items = [];
  const c = vm.createContext({ el: { log: logEl }, call: (n) => (n === 'log' ? items : undefined),
    document: { createElement: () => ({ className: '', textContent: '' }) } });
  vm.runInContext("var logKey = '';\n" + cut(call, '  function paintLog('), c);
  ok('전제: paintLog 를 소스에서 오려 냈다', typeof c.paintLog === 'function');
  items = [{ me: false, text: 'Hi!' }, { me: true, text: 'I like guitar.' }, { me: false, text: "That's cool!" }];
  c.paintLog();
  ok('말풍선 순서 그대로 · 내 말은 me', logEl.kids.map(k => (k.className === 'me' ? '나:' : '') + k.textContent).join('|') === "Hi!|나:I like guitar.|That's cool!", logEl.kids.map(k => k.textContent).join('|'));
  ok('맨 아래로 스크롤', logEl.scrollTop === 999);
  logEl.kids.push('표식'); c.paintLog();
  ok('바뀐 것이 없으면 다시 그리지 않는다', logEl.kids.length === 4);
  items = items.concat([{ me: true, text: 'Yes!' }]); c.paintLog();
  ok('새 말이 오면 다시 그린다', logEl.kids.length === 4 && logEl.kids[3].textContent === 'Yes!' && logEl.kids[3].className === 'me');
  items = Array.from({ length: 60 }, (_, i) => ({ me: i % 2 === 1, text: 'm' + i })); c.paintLog();
  ok('긴 대화는 마지막 40개만', logEl.kids.length === 40 && logEl.kids[39].textContent === 'm59');
  items = [{ me: false, text: '' }, { me: true, text: 'ok' }]; c.paintLog();
  ok('빈 말풍선은 건너뛴다', logEl.kids.length === 1);
  /* 화면 모양 — 좁으면 얼굴 가득, 넓으면 오른쪽 칸 */
  const css = call.slice(call.indexOf('var CSS'), call.indexOf('var LB'));
  const wide = css.slice(css.indexOf('@media (min-width:1024px)'));
  ok('기본(폰)은 오른쪽 칸을 숨긴다', /#ftk \.fc-side\{display:none\}/.test(css));
  ok('1024px 이상에서만 얼굴을 왼쪽으로 줄이고 오른쪽 칸을 편다', /^@media \(min-width:1024px\)\{#ftk\.ftk-call\{right:36%\}/.test(wide) && /#ftk \.fc-side\{display:flex/.test(wide.slice(0, wide.indexOf('}}'))));
  ok('도움판이 열리면 흰 자막을 감춘다(카드 뒤로 겹쳐 비치던 것)', /#ftk\.ftk-call\.gl-open \.fc-cap\{visibility:hidden\}/.test(css));
  const btns = cut(call, '  function build() {');
  ok('아이콘 버튼 6개에 글자 자리(LB)', ['fc-replay"><span>', 'fc-mic">', 'fc-slow"', 'fc-cc"', 'fc-auto">', 'fc-hand">']
    .every(k => { const i = btns.indexOf(k); return i > 0 && btns.slice(i, btns.indexOf('</button>', i)).includes('LB'); }));
  ok('paint() 가 그 6개 글자를 채운다', ['mic', 'slow', 'cc', 'auto', 'hand', 'replay'].every(k => new RegExp('lb\\(el\\.' + k + ',').test(cut(call, '  function paint() {'))));
  /* 글쓰기 칸 — submit 핸들러를 실제로 돌린다: 받으면 비우고, 안 받으면(생각 중·보내는 중) 글을 남긴다 */
  async function runSubmit(val, accept) {
    let h = null; const sent = [];
    const c = vm.createContext({ el: { type: { addEventListener: (n, f) => { if (n === 'submit') h = f; } }, in: { value: val } },
      call: (n, v) => { sent.push(n + ':' + v); return accept; } });
    vm.runInContext(cut(call, "    el.type.addEventListener('submit', function (e) {") + ');', c);
    let prevented = false; h && h({ preventDefault: () => { prevented = true; } });
    return { sent: sent.join(','), left: c.el.in.value, prevented };
  }
  const s1 = await runSubmit(' I love music ', true), s2 = await runSubmit('Wait', false), s3 = await runSubmit('   ', true);
  ok('글쓰기: 받으면 손잡이 type(다듬은 글) 후 칸을 비운다', s1.sent === 'type:I love music' && s1.left === '' && s1.prevented, JSON.stringify(s1));
  ok('글쓰기: 안 받으면(생각 중) 글이 칸에 그대로 남는다(짝)', s2.sent === 'type:Wait' && s2.left === 'Wait', JSON.stringify(s2));
  ok('글쓰기: 빈 글은 보내지 않는다', s3.sent === '', JSON.stringify(s3));
}
{
  /* A.i 친구 — 글로 쓴 턴은 «말하기» 보너스를 세지 않고, 말한 턴은 그대로 센다(짝) */
  async function runSend(typed, start) {
    const seen = [];
    const c = vm.createContext({ seen, window: { sendMsg: async () => { seen.push(c._pendingVoice); } },
      document: { getElementById: () => ({ value: '', blur() {} }) },
      t: (a) => a, meEl: {}, teacherEl: {}, noteEl: {} });
    vm.runInContext('var _pendingVoice = ' + !!start + ', silentRuns = 0, said = [], spokeThisTurn = true, turnSeq = 1;\n'
      + 'function clearHelp(){} function refreshOpen(){} function setState(){} function watchSpeakState(){} function fillText(){} function setOpen(){} function next(){} function exit(){}\n'
      + 'function isCurrentTurn(m){ return m === turnSeq; }\n' + cut(af, '  async function send('), c);
    await vm.runInContext('send("Hello", 1' + (typed ? ', true' : '') + ')', c);
    return seen[0];
  }
  ok('말로 보낸 턴 → 말하기 보너스 표시(true)', (await runSend(false)) === true);
  ok('글로 보낸 턴 → 보너스 표시 없음(false)', (await runSend(true)) === false);
  ok('남아 있던 표시(true)가 있어도 글로 보낸 턴은 끈다', (await runSend(true, true)) === false);
  /* 글쓰기 손잡이 — 생각 중이면 안 받고(false), 아니면 send(…, true) 로 보내고 true */
  async function runType(state) {
    const sends = [];
    const c = vm.createContext({ sends });
    vm.runInContext('var active = true, state = ' + JSON.stringify(state) + ', turnSeq = 0; function stopAll(){}\n'
      + 'function send(t, m, typed){ sends.push(t + "|" + typed); }\nvar T = ({' + cut(af, '    type: function (txt) {') + '}).type;', c);
    return { r: vm.runInContext('T("Hi")', c), sends: sends.join(',') };
  }
  const tA = await runType('listen'), tB = await runType('think');
  ok('A.i 친구 글쓰기: 듣는 중이면 받아서 send(글, …, true)', tA.r === true && tA.sends === 'Hi|true', JSON.stringify(tA));
  ok('A.i 친구 글쓰기: 생각 중이면 안 받는다(false, 안 보냄)', tB.r === false && tB.sends === '', JSON.stringify(tB));
  ok('글쓰기 손잡이는 send(…, true) 로 보낸다', /type: function \(txt\) \{[^}]*send\(txt, \+\+turnSeq, true\)/.test(af));
  /* 기록 손잡이 — 두 화면의 말풍선을 [{me, text}] 로 */
  const fake = (nodes) => ({ querySelectorAll: () => nodes });
  const node = (cls, text, extra) => Object.assign({ classList: { contains: (k) => cls.split(' ').includes(k) }, textContent: text }, extra || {});
  const afLog = vm.runInContext('({' + cut(af, '    log: function () {') + '}).log', vm.createContext({ document: fake([node('msg user', ' I like guitar. '), node('ai-text', "That's cool!")]) }));
  ok('A.i 친구 기록: 내 말·선생님 말을 가른다', JSON.stringify(afLog()) === JSON.stringify([{ me: true, text: 'I like guitar.' }, { me: false, text: "That's cool!" }]));
  ok('A.i 친구 기록: 정본 말풍선(.ai-row .ai-text)과 흘러나오는 미리보기(.stm-preview)', /'#chat \.msg\.user, #chat \.ai-row \.ai-text, #chat \.stm-preview'/.test(af));
  const wuLog = vm.runInContext('({' + cut(wu, '    log: function () {') + '}).log', vm.createContext({ document: fake([node('msg ai', '이름표 Hi 🔊 다시 듣기', { _warmText: 'Hi' }), node('msg me', '나 Yes', { _warmText: 'Yes' })]) }));
  ok('웜업 기록: 이름표·버튼 글자 없이 원문(_warmText)만', JSON.stringify(wuLog()) === JSON.stringify([{ me: false, text: 'Hi' }, { me: true, text: 'Yes' }]));
  const wuType = (sending) => { const picks = [];
    const c = vm.createContext({ picks }); vm.runInContext('var active = true; function g(n){ return n === "sending" ? ' + sending + ' : undefined; }\n'
      + 'function pickChip(t){ picks.push(t); }\nvar T = ({' + cut(wu, '    type: function (txt) {') + '}).type;', c);
    return { r: vm.runInContext('T("Yes")', c), picks: picks.join(',') }; };
  const wA = wuType(false), wB = wuType(true);
  ok('웜업 글쓰기: 대답 고르기 길(pickChip)로 보내고 true', wA.r === true && wA.picks === 'Yes', JSON.stringify(wA));
  ok('웜업 글쓰기: 보내는 중이면 안 받는다(false, 글 남김)', wB.r === false && wB.picks === '', JSON.stringify(wB));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
