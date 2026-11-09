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
async function runNext(hands, needTap) {
  const log = [];
  const c = vm.createContext({ window: { FtkCall: { handsFree: () => hands } }, log,
    turnSeq: 0, active: true, waitQuiet: async () => { log.push('quiet'); return true; },
    listen: () => { log.push('listen'); }, setState: (s) => log.push('state:' + s) });
  vm.runInContext('var turnSeq = 0, active = true, needTap = ' + !!needTap + ';\n' + cut(af, 'function isCurrentTurn(') + '\n' + cut(af, 'function handsFree(') + '\n' + cut(af, 'async function next('), c);
  await vm.runInContext('next()', c);
  return log.join(',');
}
ok('자동(기본) → 바로 듣는다', (await runNext(true)) === 'listen', await runNext(true));
ok('손 모드 → 말이 끝나길 기다린 뒤 쉰다(듣지 않는다)', (await runNext(false)) === 'quiet,state:pause', await runNext(false));
ok('저절로 열렸고 아직 화면을 안 눌렀으면 자동이어도 첫 마이크는 안 연다(쉬며 기다림)', (await runNext(true, true)) === 'quiet,state:pause', await runNext(true, true));
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
  /* 도움판도 자막처럼 투명 바탕(2026-11-09 「계속 투명한 바탕에」) — 규칙 «한 개» 를 잘라 그 안에서 묻는다 */
  const rule = (sel) => { const i = css.indexOf(sel + '{'); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const gl = rule('#ftk.ftk-call .ftk-glass');
  ok('전제: 도움판 규칙을 잘라 냈다', gl.length > 40, gl.slice(0, 60));
  ok('도움판 바탕이 투명하다(흰 카드 아님)', /background:transparent/.test(gl) && !/rgba\(255,255,255,\.9/.test(gl), gl);
  ok('투명 바탕이라 글자에 그림자(자막과 같은 읽힘)', /text-shadow:[^;]*rgba\(0,0,0/.test(gl) && /color:#fff/.test(gl));
  ok('선생님 글은 흰색 · 내 글은 밝은 초록(흰 카드용 짙은 색이 아님)', /\.ftk-teacher\{color:#fff/.test(css) && /\.ftk-me\{color:#bbf7d0/.test(css) && !/\.ftk-teacher\{color:#111/.test(css));
  ok('고르기 단추는 어두운 바탕(투명 위에서도 단추로 보인다)', /\.ftk-chips button\{background:rgba\(32,34,38/.test(css));
  ok('도움판이 열리면 아래 어둠을 넓힌다(밝은 셔츠 위 흰 글자 방지)', /#ftk\.ftk-call\.gl-open \.fc-shade\{height:(5\d|6\d)%\}/.test(css));
  ok('도움판이 열린 동안 «다시 듣기» 는 숨는다(투명 글과 겹침 방지)', /#ftk\.ftk-call\.gl-open \.fc-replay\{visibility:hidden\}/.test(css));
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

console.log('▶ ⑦ 웜업 «시작» 하면 곧바로 얼굴 대화(2026-11-09 — 휴대폰 키면 기본)');
{
  /* 감싸는 블록을 소스에서 오려 내 가짜 startWarmup·enter 로 실제로 돌린다 */
  const i = wu.indexOf('  var autoDone = ');
  const k = wu.indexOf('  (function wrapStart() {', i);
  const body = i < 0 || k < 0 ? '' : wu.slice(i, wu.indexOf('  })();', k) + 7);
  ok('전제: 감싸는 블록을 오려 냈다', body.length > 50 && /function wrapStart/.test(body) && /function eleaderOn/.test(body));
  const run = (o) => {
    o = o || {};
    const log = [];
    const c = vm.createContext({ log, active: false, location: { search: o.search || '' },
      localStorage: { getItem: (k) => (k === 'mangoi_ai_screen_mode' ? (o.screen || null) : null) } });
    c.window = c;
    if (o.sit) c.situationActive = () => true;          // warmup.html 전역(?sit= 가 유효한 상황)
    c.WCTX = { textbook: o.book || '' };
    c._warmStarted = !!o.started;
    vm.runInContext('function g(n){ try { return window[n]; } catch (e) { return undefined; } }\n'
      + 'function startWarmup(){ log.push("start"); _warmStarted = true; return 7; }\n'
      + 'function enter(){ log.push("enter"); active = true; }\n' + body, c);
    return { c, log };
  };
  const safe = (o) => { try { return run(o); } catch (e) { ok('감싸기 실행', false, String(e)); return null; } };
  const A = safe();
  if (A) {
    const r = A.c.startWarmup();
    ok('시작 → 원래 시작을 먼저 부르고 그 뒤 얼굴 대화를 연다', A.log.join(',') === 'start,enter' && r === 7, A.log.join(','));
    A.c.active = false;                               // ✕ 로 나간 뒤 🎚️ 로 다시 시작
    A.c.startWarmup();
    ok('✕ 로 나간 뒤 다시 시작해도 저절로 다시 열지 않는다(한 페이지 한 번)', A.log.join(',') === 'start,enter,start', A.log.join(','));
  }
  const S0 = safe({ search: '?setup=0&age=kid' });
  if (S0) { S0.c.startWarmup(); S0.c.startWarmup();
    ok('?setup=0(수업 흐름·공유 링크, 상황 아님)은 끝까지 저절로 안 연다', S0.log.join(',') === 'start,start', S0.log.join(',')); }
  /* 🎯 상황별 말하기(?setup=0&sit=) — «대화 화면» 설정을 따른다(2026-11-09 사장님 「상황 고르기에서도 간단 대화」) */
  const Sit = safe({ started: true, search: '?setup=0&lang=en&sit=store', sit: true });
  ok('상황 연습 + 간단 대화(기본) → 얼굴 화면을 연다(인라인이 먼저 시작한 경로)', Sit && Sit.log.join(',') === 'enter', Sit && Sit.log.join(','));
  const SitS = safe({ started: true, search: '?setup=0&sit=store', sit: true, screen: 'simple' });
  ok('상황 연습 + «간단 대화» 를 고름 → 연다', SitS && SitS.log.join(',') === 'enter', SitS && SitS.log.join(','));
  const SitF = safe({ started: true, search: '?setup=0&sit=store', sit: true, screen: 'full' });
  ok('상황 연습 + «학습 도구» 를 고름 → 채팅 화면 그대로(짝)', SitF && SitF.log.join(',') === '', SitF && SitF.log.join(','));
  const SitN = safe({ started: true, search: '?setup=0&sit=zzz' });
  ok('모르는 상황(situationActive 거짓)은 예전처럼 안 연다(짝)', SitN && SitN.log.join(',') === '', SitN && SitN.log.join(','));
  const SitX = safe({ search: '?setup=0&sit=store', sit: true });
  if (SitX) { SitX.c.startWarmup(); SitX.c.active = false; SitX.c.startWarmup();
    ok('상황 연습도 ✕ 로 나간 뒤 🎚️ 로 다시 시작하면 다시 안 연다(한 페이지 한 번)', SitX.log.join(',') === 'start,enter,start', SitX.log.join(',')); }
  /* 배선 — 상황 판정은 warmup.html 의 전역 situationActive() 하나(새 판정을 만들지 않는다) */
  ok('autoDone 은 setup=0 이고 «상황이 아닐 때만» 참', /var autoDone = \/\[\?&\]setup=0\(\?:&\|\$\)\/\.test\(location\.search\) && !sitOn\(\);/.test(wu));
  /* 🪤 ?setup=0 은 이 파일이 실리는 «그 순간» enter() 가 돈다 — 자동 열기 블록이 CALL 보다 위면 var CALL 이 undefined 라
     영상통화 화면이 빈 손잡이(A = {})로 붙어 제목·✕·다시 듣기·끝내기가 죽는다(2026-11-09 브라우저 실측) */
  ok('자동 열기 블록은 var CALL «뒤» (먼저 시작한 경로에서도 손잡이가 찬다)', wu.indexOf('  var CALL = {') > 0 && wu.indexOf('  var CALL = {') < wu.indexOf('  var autoDone = '));
  ok('sitOn 은 warmup.html 의 situationActive 를 부른다', /function sitOn\(\)[^\n]*window\.situationActive\(\)/.test(wu)
    && /\nfunction situationActive\(\)\{/.test(read('warmup.html')));
  const S1 = safe({ search: '?setup=01' });
  if (S1) { S1.c.startWarmup();
    ok('setup=01 처럼 다른 값은 예외가 아니다(짝)', S1.log.join(',') === 'start,enter', S1.log.join(',')); }
  const E = safe({ book: '엘리더잼 L1 · Pets' });
  if (E) { E.c.startWarmup();
    ok('엘리더잼(진행 막대가 채팅 쪽)은 저절로 안 연다', E.log.join(',') === 'start', E.log.join(','));
    E.c.WCTX.textbook = 'BTS 2 Korea';                 // 같은 페이지에서 일반 교재로 다시 시작
    E.c.startWarmup();
    ok('엘리더잼 뒤 일반 교재로 시작하면 그때 연다(«한 번» 을 엘리더잼이 먹지 않음)', E.log.join(',') === 'start,start,enter', E.log.join(',')); }
  const B = safe({ book: 'BTS 1 001 (Welcome to school)' });
  if (B) { B.c.startWarmup();
    ok('일반 교재는 연다(짝)', B.log.join(',') === 'start,enter', B.log.join(',')); }
  const Er = safe({ started: true });
  ok('이 파일이 오기 «전» 에 이미 시작했으면 곧바로 연다', Er && Er.log.join(',') === 'enter', Er && Er.log.join(','));
  const Er2 = safe({ started: true, search: '?setup=0' });
  ok('…단 ?setup=0 이면 그때도 안 연다', Er2 && Er2.log.join(',') === '', Er2 && Er2.log.join(','));
  /* 배선 — ?setup=0 부팅(감싸기 전에 시작)은 인라인이 먼저 돈다 */
  const H = read('warmup.html');
  ok('?setup=0 부팅은 인라인에서 startWarmup 을 바로 부른다(감싸기 전)',
    /Q\.get\('setup'\)[^\n]*===\s*'0'\)\{\s*startWarmup\(\);/.test(H) && H.indexOf("Q.get('setup')") < H.indexOf('/js/warmup-facetalk.js'));
  ok('수업 안(iframe)은 enter() 가 스스로 막는다', /function enter\(\)\s*\{[\s\S]{0,400}embedded\(\)/.test(wu));
  ok('배선: _warmStarted·WCTX 는 var(전역 속성)라 g() 로 읽힌다', /\nvar WCTX = \{/.test(H) && /\nvar _warmStarted = false;/.test(H));
  /* 손 모드 — 얼굴 대화가 «자동» 을 켜 두므로 떠날 때(pagehide) 학생 설정으로 되돌린다 */
  ok('exit() 와 pagehide 가 같은 restoreMode 로 되돌린다',
    /function exit\(\) \{[\s\S]{0,600}restoreMode\(\);/.test(wu) && /addEventListener\('pagehide', function \(\) \{ if \(active\) restoreMode\(\); \}\)/.test(wu));
}

console.log('▶ ⑧ A.i 친구하기는 열자마자 얼굴 대화(2026-11-09 — 휴대폰 열면 바로)');
{
  const leaked = []; const onLeak = (e) => leaked.push(String(e && e.message || e)); process.on('unhandledRejection', onLeak);
  const i = af.indexOf('(function autoOpen() {');
  const body = i < 0 ? '' : af.slice(i, af.indexOf('  })();', i) + 7);
  ok('전제: 자동 열기 블록을 오려 냈다', body.length > 50 && /__aiFriendHistory/.test(body));
  const run = async (o) => {
    const log = [];
    const L = {};
    const doc = { hidden: !!o.hidden,
      addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); },
      removeEventListener: (t, f) => { L[t] = (L[t] || []).filter(x => x !== f); } };
    const fire = (t) => (L[t] || []).slice().forEach(f => f({}));
    const c = vm.createContext({ log, active: !!o.active, location: { search: o.search || '' }, document: doc });
    c.window = c;
    if (o.iframe) c.window = { top: {} };              // 다른 화면 안
    else c.window.top = c.window;
    let release;
    c.window.__aiFriendHistory = (o.history === 'none' || o.iframe) ? undefined
      : o.history === 'fail' ? (function () { const p = Promise.reject(new Error('x')); p.catch(function () {}); return p; })()   // 하니스 쪽 «처리 안 된 거절» 로 죽지 않게
      : new Promise(function (r) { release = r; });
    try { vm.runInContext('function enter(a){ log.push("enter:" + a); active = true; }\n' + body, c); }
    catch (e) { return { err: String(e), log }; }
    await new Promise(r => setTimeout(r, 0));
    const before = log.join(',');
    if (o.touch) fire('pointerdown');                // 기록이 오기 전에 학생이 먼저 누름
    if (release) release();
    await new Promise(r => setTimeout(r, 0));
    const mid = log.join(',');
    if (o.hidden) { doc.hidden = false; fire('visibilitychange'); }
    return { before, mid, after: log.join(','), left: (L.pointerdown || []).length + (L.keydown || []).length, log };
  };
  const A = await run({});
  ok('기록을 다 불러온 «뒤» 에 «저절로» 표시(enter(true))로 연다', A.before === '' && A.after === 'enter:true', JSON.stringify(A));
  ok('열고 나면 «먼저 누름» 감시를 걷는다', A.left === 0, JSON.stringify(A));
  const B = await run({ history: 'none' });
  ok('옛 HTML(기다릴 것이 없음)이어도 연다', B.after === 'enter:true', JSON.stringify(B));
  const C = await run({ history: 'fail' });
  ok('기록 불러오기가 실패해도 연다', C.after === 'enter:true', JSON.stringify(C));
  await new Promise(r => setTimeout(r, 5));
  ok('불러오기 실패가 «처리 안 된 거절» 로 새지 않는다', leaked.length === 0, leaked.join(';'));
  process.off('unhandledRejection', onLeak);
  const D = await run({ iframe: true });
  ok('다른 화면 안(iframe)에서는 안 연다', D.after === '', JSON.stringify(D));
  const E = await run({ search: '?practice=dubbing', history: 'none' });
  ok('더빙 연습(?practice=)은 안 연다', E.after === '', JSON.stringify(E));
  const F = await run({ search: '?x=1', history: 'none' });
  ok('다른 쿼리는 그대로 연다(짝)', F.after === 'enter:true', JSON.stringify(F));
  const G = await run({ active: true, history: 'none' });
  ok('이미 열렸으면 다시 안 부른다', G.after === '', JSON.stringify(G));
  const T = await run({ touch: true });
  ok('기록이 오기 전에 학생이 먼저 눌렀으면 끼어들지 않는다', T.after === '' && T.left === 0, JSON.stringify(T));
  const Hd = await run({ hidden: true });
  ok('숨은 탭이면 보일 때까지 기다렸다 연다', Hd.mid === '' && Hd.after === 'enter:true', JSON.stringify(Hd));
  const H = read('ai-friend.html');
  ok('배선: HTML 이 기록 불러오기를 window.__aiFriendHistory 로 건넨다',
    /\(window\.__aiFriendHistory\s*=\s*loadHistory\(\)\)\.then\(/.test(H));
  ok('배선: 자동 열기는 arm() 뒤', af.indexOf('(function autoOpen() {') > af.indexOf('\n  arm();'));
  ok('배선: ▶ 로 들어가면 «저절로» 표시 없이 enter() — 첫 마이크도 예전처럼 자동',
    /ring\.addEventListener\('click', function \(\) \{ if \(!active\) enter\(\); \}\)/.test(af) && /needTap = auto === true && !activated\(\);/.test(af));

  /* 🔊 소리 — «이 동안만» 켜고 나갈 때 되돌린다(열자마자 열리므로 저장값을 '1' 로 덮어 두면 방문마다 설정이 사라진다) */
  const snd = (stored) => {
    const ls = { v: stored };
    const c = vm.createContext({ active: true,
      localStorage: { getItem: () => ls.v, setItem: (k, v) => { ls.v = v; } },
      isSoundOn: () => ls.v !== '0', updateSoundBtn: () => {}, window: { addEventListener: () => {} } });
    const a = af.indexOf("  var SOUND_KEY = 'mangoi_aifriend_sound'");
    const b = af.indexOf('  window.addEventListener(\'pagehide\'', a);
    vm.runInContext(a < 0 || b < 0 ? 'throw new Error("cut")' : af.slice(a, b), c);
    return { ls, c };
  };
  let S = null; try { S = snd('0'); } catch (e) { ok('소리 블록 실행', false, String(e)); }
  if (S) {
    vm.runInContext('forceSound()', S.c);
    ok('꺼 둔 소리는 얼굴 화면 동안 켠다', S.ls.v === '1');
    vm.runInContext('restoreSound()', S.c);
    ok('나가면 꺼 둔 그대로(0) 되돌린다', S.ls.v === '0');
    const S2 = snd(null);
    vm.runInContext('forceSound(); restoreSound();', S2.c);
    ok('원래 켜져 있었으면(값 없음) 아무것도 안 쓴다(짝)', S2.ls.v === null, String(S2.ls.v));
  }
  ok('배선: exit() 가 소리를 되돌린다 · 떠날 때(pagehide)도', /function exit\(\) \{\n    if \(!active\) return;\n    active = false;\n    stopAll\(\);\n    restoreSound\(\);/.test(af)
    && /addEventListener\('pagehide', function \(\) \{ if \(active\) restoreSound\(\); \}\)/.test(af));
  /* 🎤 첫 마이크 — 저절로 열렸는데 브라우저가 소리를 막는 중이면(누르기 전) 학생이 눌러서 연다 */
  {
    const a2 = af.indexOf('  function activated() {');
    const b2 = a2 < 0 ? -1 : af.indexOf('\n  }\n', a2);
    const src = a2 < 0 || b2 < 0 ? 'throw new Error("cut")' : af.slice(a2, b2 + 4);
    const probe = (o) => {
      const closed = [];
      const c = vm.createContext({ navigator: o.ua === undefined ? {} : { userActivation: { hasBeenActive: !!o.ua } }, window: {} });
      if (o.ctx) c.window.AudioContext = function () { if (o.ctx === 'throw') throw new Error('x'); this.state = o.ctx; this.close = () => closed.push(1); };
      try { vm.runInContext(src, c); return { v: vm.runInContext('activated()', c), closed: closed.length }; } catch (e) { return { err: String(e) }; }
    };
    const P1 = probe({ ua: true });
    ok('이미 누른 적 있으면(제스처) 자동 그대로', P1.v === true, JSON.stringify(P1));
    const P2 = probe({ ua: false, ctx: 'running' });
    ok('안 눌렀어도 브라우저가 소리를 허락하면(running) 자동 그대로 · 시험 상자는 닫는다', P2.v === true && P2.closed === 1, JSON.stringify(P2));
    const P3 = probe({ ua: false, ctx: 'suspended' });
    ok('막혀 있으면(suspended) 첫 마이크는 눌러서 연다', P3.v === false && P3.closed === 1, JSON.stringify(P3));
    const P4 = probe({ ua: false });
    ok('AudioContext 가 없으면 눌러서 연다', P4.v === false, JSON.stringify(P4));
    const P5 = probe({ ua: false, ctx: 'throw' });
    ok('만들다 던지면 눌러서 연다(던지지 않음)', P5.v === false, JSON.stringify(P5));
  }
  ok('배선: 화면에 «눌러 말해요» 를 알린다(waitTap) · 껍데기는 그때 «쉬는 중» 대신 «마이크를 눌러 말해요»',
    /waitTap: function \(\) \{ return needTap; \}/.test(af)
    && /s === 'pause' \? \(hf && !call\('waitTap'\) \?/.test(read('js/ftk-call.js')));
  ok('나갈 때 빈 화면이면 맨 아래로 안 내린다(작은 폰에서 «오늘의 단어» 가 아바타 밑으로 숨음)',
    /if \(chat && !chat\.querySelector\('\.empty-state'\)\) chat\.scrollTop = chat\.scrollHeight;/.test(af));
  ok('옛 «영구히 1 로 덮기» 가 enter() 에 안 남았다', !/function enter\(auto\) \{[\s\S]{0,1500}localStorage\.setItem\('mangoi_aifriend_sound', '1'\)/.test(af));
}

// ✓ 끝내기 — 보이는 글자가 생기고, 그 글자로 시작하는 이름(음성 조작으로 부를 수 있게 · WCAG 2.5.3) · 2026-11-09
console.log('▶ ✓ 끝내기 글자와 이름');
for (const lang of ['ko', 'en']) {
  const mk = () => { const kids = {}, at = {}; return { kids, at, style: {}, textContent: '', hidden: false, title: '', placeholder: '', firstChild: { style: {} },
    classList: { toggle() {}, contains() { return false; } }, setAttribute(k, v) { at[k] = v; }, getAttribute(k) { return at[k]; },
    querySelector(q) { return kids[q] || (kids[q] = mk()); }, parentNode: { setAttribute() {} } }; };
  const names = ['title', 'done', 'cam', 'close', 'replay', 'mic', 'slow', 'cc', 'auto', 'hand', 'status', 'dots', 'prog', 'cap', 'sideh', 'log', 'in', 'send', 'type'];
  const el = Object.fromEntries(names.map(n => [n, mk()]));
  const c = vm.createContext({ el, root: { getAttribute() { return 'pause'; }, classList: { contains() { return false; } } },
    t: (k, e) => lang === 'en' ? e : k, handsFree: () => true, call: () => '', camStream: null, slowOn: false, ccOn: () => true, GOAL: 10, A: {}, paintLog() {} });
  let ran = true;
  try { vm.runInContext(cut(call, '  function label(') + '\n' + cut(call, '  function lb(') + '\n' + cut(call, '  function paint() {') + '\npaint();', c); } catch (e) { ran = String(e); }
  const word = el.done.kids['.fc-done-t'] && el.done.kids['.fc-done-t'].textContent, name = el.done.at['aria-label'] || '';
  ok(lang + ': paint() 가 실제로 돈다(전제)', ran === true, ran);
  ok(lang + ': ✓ 버튼에 «' + (lang === 'en' ? 'Finish' : '끝내기') + '» 글자', word === (lang === 'en' ? 'Finish' : '끝내기'), word);
  ok(lang + ': 버튼 이름이 보이는 글자로 시작한다', !!word && name.indexOf(word) === 0, name);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
