// warmup_reply_speed_harness.mjs — A.i 말하기 연습 «말이 끝난 뒤 얼마나 기다렸다 보내나» (2026-09-25)
//
// 사장님 「A.i 가 답하는 시간을 더 빠르게」 — 학생이 말을 마친 뒤 전송까지의 침묵 대기를 줄였다.
//   ① 문장이 끝나 보이면 1.5초 안팎(옛 2.6초)
//   ② 덜 끝난 문장·아직 아무 말 없음은 «그대로» 넉넉히 — 아이가 「음…」 하고 쉬는 동안 끊겨
//      보내지던 2026-07-23 사고가 그 둘로 막혀 있다(짝으로 본다)
//   ③ 녹음(Whisper) 경로는 «문장이 끝났나» 를 모르므로 기본 2.5초보다 짧되 1.5초까지는 안 줄인다
//
// 📌 2026-10-02 수동(버튼) 모드 — 침묵으로 끝내지 않고 ⏹ 를 눌러야 보낸다. 위 ①~③ 은 «자동 말하기» 에만.
// ⚠️ 숫자를 글자로 못 박지 않고, 소스에서 상수·판정을 오려 내 «실제로 돌려» 몇 ms 인지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(process.env.WARMUP_SRC || path.join(ROOT, 'cloudflare-deploy', 'public', 'warmup.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra !== undefined ? '— ' + JSON.stringify(extra) : ''); }
}

console.log('\n[A] 브라우저 인식 경로 — 침묵 대기 판정을 실제로 돌린다');
// ⚠️ 상수 «이름 목록» 을 못 박지 않는다(2026-11-05 SIL_MID 가 생기며 옛 정규식이 깨졌다) — 그 줄을 통째로 가져와 돌린다.
const consts = HTML.match(/var SIL_FIRST=\d+[^;]*;/);
const dangling = HTML.match(/var MIC_DANGLING=(\/.*\/i);/);
const unfin = HTML.match(/function micUnfinished\(s\)\{[\s\S]*?\n\}/);
const oneWord = HTML.match(/function micOneWordReply\(s\)\{[\s\S]*?\n\}/);
// 식 «모양» 을 못 박지 않는다 — _armSilence 안의 «var ms = …;» 를 그대로 가져와 돌린다.
const arm = HTML.match(/function _armSilence\(\)\{[\s\S]*?\n  \}/);
const pick = arm && arm[0].match(/var ms = ([^;]+);/);
ok('A-0 (전제) 상수·판정·고르는 식을 소스에서 찾았다', !!(consts && dangling && unfin && pick));
ok('A-0b (전제) 한 낱말 대답 판정(micOneWordReply)을 소스에서 찾았다', !!oneWord);
const manualSrc = HTML.match(/var MIC_MANUAL_IDLE=(\d+);/);
ok('A-0c (전제) 수동 모드 대기값을 소스에서 찾았다', !!manualSrc);
// _micManual 을 바꿔 끼워 «자동 말하기» 와 «수동 버튼» 두 경우를 따로 돌린다(2026-10-02)
let waitFor2 = () => NaN;
try {
  waitFor2 = new Function('t', 'isManual',
    `${consts[0]}
     var MIC_MANUAL_IDLE=${manualSrc ? manualSrc[1] : 'NaN'};
     var MIC_DANGLING=${dangling[1]};
     function _micManual(){ return isManual; }
     ${unfin[0]}
     ${oneWord ? oneWord[0] : ''}
     return ${pick[1]};`);
} catch (e) { ok('A-0d 판정식을 실행할 수 있다', false, String(e)); }
const run = (t) => { try { return waitFor2(t, false); } catch (e) { return NaN; } };       // 자동 말하기
const runM = (t) => { try { return waitFor2(t, true); } catch (e) { return NaN; } };       // 수동 버튼

const done1 = run('I like pizza'), done2 = run('My favorite sport is soccer');
ok('A-1 (자동) 끝난 문장이면 2초 안에 보낸다(옛 2.6초보다 빠름)', done1 <= 2000 && done2 <= 2000, { done1, done2 });
ok('A-2 (자동) 그래도 1.2초보다는 기다린다(숨 한 번 쉬는 사이에 잘리지 않게)', done1 >= 1200, done1);
ok('A-3 (자동·짝) 덜 끝난 문장(“I like …”)은 여전히 4초 넘게 기다린다', run('I like') >= 4000 && run('I want to') >= 4000, { a: run('I like'), b: run('I want to') });
ok('A-4 (자동·짝) 아직 아무 말 없으면 여전히 8초 넘게 기다린다', run('') >= 8000, run(''));
// 🙋 2026-11-02 — 얼굴 크게(자동 말하기)에서 학생 «질문» 이 5초씩 기다리던 것
const qDone = ['What is this', 'Do you like it', 'How about you', 'What do you like', 'Is this your dog', 'Why do you like it', 'Can you say it again'];
const qWaits = qDone.map(run);
ok('A-7 (자동) 끝난 질문(you·it·this·like 로 끝남)은 2초 안에 보낸다', qWaits.every((v) => v <= 2000), Object.fromEntries(qDone.map((q, i) => [q, qWaits[i]])));
ok('A-8 (자동) 인식기가 물음표를 붙이면 끝난 질문으로 본다', run('Do you have a') >= 4000 && run('Do you have a cat?') <= 2000 && run('Is that a?') <= 2000, { a: run('Do you have a'), b: run('Do you have a cat?') });
const qHold = ['Why do you', 'What do you', 'Do you want to', 'Can you', 'How do you', 'What is the'];
const qHoldW = qHold.map(run);
ok('A-9 (자동·짝) 덜 끝난 질문(주어 you·to·the 로 끝남)은 여전히 4초 넘게 기다린다', qHoldW.every((v) => v >= 4000), Object.fromEntries(qHold.map((q, i) => [q, qHoldW[i]])));
ok('A-10 (자동·짝) 질문이 아닌 문장은 예전 판정 그대로(“I love you” 는 기다린다)', run('I love you') >= 4000 && run('I like it') >= 4000 && run('My name is Minsu') <= 2000, { a: run('I love you'), b: run('I like it'), c: run('My name is Minsu') });
// ⚡ 2026-11-05 사장님 「내가 답하면 최대한 빨리」 — 짧은 대답이 5초씩 기다리던 것
const shortDone = ['Yes', 'No.', 'Okay', 'OK', 'Thank you', "I'm fine", 'Me too', 'Yes!', 'Of course', "I'm fine, thank you.", 'Nice to meet you'];
const shortDoneW = shortDone.map(run);
ok('A-11 (자동) 그 자체로 끝난 짧은 대답(Yes·No·Thank you·I\'m fine)은 2초 안에 보낸다', shortDoneW.every((v) => v <= 2000), Object.fromEntries(shortDone.map((q, i) => [q, shortDoneW[i]])));
const oneW = ['Pizza', 'Blue.', 'Ten', '10', 'Soccer', 'Chicken', 'Hello', 'Hi', 'Never'];   // Hello·Hi·Never 는 뒤에 말이 붙기 쉬워 1.2초가 아니라 2초
const oneWW = oneW.map(run);
ok('A-12 (자동) 한 낱말 대답(Pizza·Blue)은 3초 안에 보내되 끝난 문장보다는 더 기다린다', oneWW.every((v) => v <= 3000 && v > done1), Object.fromEntries(oneW.map((q, i) => [q, oneWW[i]])));
const holdShort = ['I', "I'm", "It's", 'My dog', 'Yesterday', 'Um', 'Well', 'Maybe', 'Because', 'The', 'My'];
const holdShortW = holdShort.map(run);
ok('A-13 (자동·짝) 뒤에 말이 붙기 쉬운 짧은 말(I\'m·Yesterday·My dog·Um)은 여전히 4초 넘게 기다린다', holdShortW.every((v) => v >= 4000), Object.fromEntries(holdShort.map((q, i) => [q, holdShortW[i]])));
ok('A-14 (자동·짝) 중국어(띄어쓰기 없음)는 예전 판정 그대로(한 낱말 대기로 빠지지 않는다)', run('我喜欢吃披萨') === run('I like'), { zh: run('我喜欢吃披萨'), en: run('I like') });
ok('A-16 (자동·짝) 끝난 인사 목록이 «덜 끝난» 말까지 삼키지 않는다(5낱말 상한·I love you 는 기다림)', run('I love you') >= 4000 && run('Thank you and') >= 4000 && run('Nice to meet you and') >= 4000, { a: run('I love you'), b: run('Thank you and'), c: run('Nice to meet you and') });
ok('A-15 (수동·짝) 짧은 대답도 수동이면 침묵으로 안 끝낸다', runM('Yes') >= 20000 && runM('Pizza') >= 20000, { a: runM('Yes'), b: runM('Pizza') });
ok('A-5 (수동) 끝난 문장이어도 침묵 20초 안에는 끝내지 않는다', runM('I like pizza') >= 20000, runM('I like pizza'));
ok('A-6 (수동) 덜 끝난 문장·빈 말도 20초 넘게 기다린다', runM('I like') >= 20000 && runM('') >= 20000, { a: runM('I like'), b: runM('') });

console.log('\n[B] 녹음(Whisper) 경로');
// ⚡ 2026-11-05 «미리 받아쓰기» — 호출이 MangoiVoice.record(_micEarly(manual, { … })) 로 감싸였다(감싸지 않은 옛 모양도 받는다)
const rec = HTML.match(/MangoiVoice\.record\((?:_micEarly\(manual,\s*)?\{([\s\S]*?)onState/);
const sm = rec && rec[1].match(/silenceMs:\s*([^,]+),/);
ok('B-0 (전제) 웜업의 녹음 호출을 찾았다', !!(rec && sm));
const evalSil = (isManual) => {
  if (!sm) return 2500;   // 안 넘기면 모듈 기본 2500
  try { return Number(new Function('manual', 'MIC_MANUAL_IDLE', 'return ' + sm[1])(isManual, manualSrc ? Number(manualSrc[1]) : NaN)); } catch (e) { return NaN; }
};
const sA = evalSil(false), sM = evalSil(true);
ok('B-1 (자동) 녹음 경로도 기본(2.5초)보다 빨리 보낸다', sA < 2500, sA);
ok('B-2 (자동) 녹음 경로는 1.5초까지 줄이지 않는다(문장이 끝났는지 모르므로)', sA >= 1600, sA);
ok('B-3 (수동) 녹음 경로도 침묵 20초 안에는 끝내지 않는다', sM >= 20000, sM);

console.log('\n[C] 수동 모드 — ⏹ 를 안 눌렀으면 보내지 않는다(2026-10-02 피드백)');
// 브라우저 인식 경로의 _finishMic 을 중괄호 짝으로 오려 내 가짜 부품으로 돌린다.
function bodyAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  let d = 0, st = src.indexOf('{', i);
  for (let k = st; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
const fin = bodyAt(HTML, 'function _finishMic(){');
ok('C-0 (전제) _finishMic 을 오려 냈다', !!fin);
function runFinish(isManual, stopWanted) {
  const log = { sent: 0, held: 0 };
  try {
    new Function('isManual', 'stopWanted', 'log',
      `var _micBase='I like', _micSess='pizza', _micStopWanted=stopWanted, _micWhisperRetried=false;
       var inp={value:''}; var document={getElementById:function(){return inp;}};
       function setMicState(){} function addMsg(){}
       function _mergeSpeech(a,b){ return (a+' '+b).trim(); } function _tidySpeech(x){ return x; }
       function _micManual(){ return isManual; }
       function _micManualHold(){ log.held++; }
       function sendMsg(){ log.sent++; }
       var micViaWhisper=function(){}; var window={};
       ${fin}
       _finishMic();`)(isManual, stopWanted, log);
  } catch (e) { log.err = String(e); }
  return log;
}
const m1 = runFinish(true, false), m2 = runFinish(true, true), a1 = runFinish(false, false);
ok('C-1 수동 + 침묵으로 끝남 → 보내지 않고 입력칸에 남긴다', m1.sent === 0 && m1.held === 1, m1);
ok('C-2 (짝) 수동 + ⏹ 누름 → 보낸다', m2.sent === 1 && m2.held === 0, m2);
ok('C-3 (짝) 자동 말하기 + 침묵 → 예전처럼 보낸다', a1.sent === 1 && a1.held === 0, a1);
const wh = bodyAt(HTML, 'async function micViaWhisper(){');
ok('C-4 녹음 경로도 «수동인데 사람이 안 멈췄으면» 보내지 않는다', /if\(said && manual && !_whisperUserStop\)\{ _micManualHold\(said\); return; \}/.test(wh));
ok('C-5 녹음 경로의 ⏹ 는 «사람이 멈춤» 으로 적는다(두 자리 다)',
  (HTML.match(/_whisperUserStop=true; MangoiVoice\.stop\(\)/g) || []).length >= 2);
ok('C-6 자동 말하기 모듈이 없으면 «수동» 으로 본다', /function _micManual\(\)\{ try\{ return !\(window\.WarmupAutoTalk && WarmupAutoTalk\.isOn\(\)\); \}catch\(e\)\{ return true; \} \}/.test(HTML));

console.log('\n[D] 침묵 «시계» — 같은 글자가 다시 와도 처음부터 다시 세지 않는다(2026-11-05)');
// _armSilence 와 그것이 기대는 줄을 소스에서 오려 내, 가짜 시계(Date·setTimeout)로 «언제 멈추는가» 를 잰다.
const armBody = bodyAt(HTML, 'function _armSilence(){');
const unitsFn = bodyAt(HTML, 'function _micUnits(t){');
const silVars = HTML.match(/var _silUnits=[^;]*;/);
const onstartM = HTML.match(/_recog\.onstart=function\(\)\{([^\n]*?)\};/);
ok('D-0 (전제) _armSilence·_micUnits·시계 변수·onstart 를 오려 냈다', !!(armBody && unitsFn && silVars && consts && unfin && onstartM));
function clockBox(isManual) {
  const S = { now: 0, timer: null, stops: 0, heard: '' };
  const fakeDate = { now: () => S.now };
  const fakeSet = (fn, ms) => { S.timer = { fn, at: S.now + ms }; return S.timer; };
  const fakeClear = (t) => { if (S.timer === t) S.timer = null; };
  const api = new Function('S', 'Date', 'setTimeout', 'clearTimeout', 'isManual',
    `${consts[0]}
     var MIC_MANUAL_IDLE=${manualSrc ? manualSrc[1] : 'NaN'};
     var MIC_DANGLING=${dangling[1]};
     function _micManual(){ return isManual; }
     ${unfin[0]}
     ${oneWord ? oneWord[0] : ''}
     var _silence=null, _micBySilence=false, _latSilence=null;
     var _recog={ stop:function(){ S.stops++; } };
     function _micFast(){ if(!S.fast) return false; S.fasts=(S.fasts||0)+1; return true; }   // 진짜 판정은 [E] 가 따로 돌린다
     function _micHeard(){ return S.heard; }
     ${silVars[0]}
     ${unitsFn}
     ${armBody}
     var _warmPaused=false, micEpoch=0, _warmEpoch=0, micVoiceEpoch=0, _warmVoiceEpoch=0, _micSess='';
     function setMicState(){}
     var onstart=function(){ ${onstartM ? onstartM[1] : ''} };
     return { arm:_armSilence, onstart:onstart, get lat(){ return _latSilence; } };`)(S, fakeDate, fakeSet, fakeClear, isManual);
  // 시각 at 에 글자 txt 로 «결과가 왔다» → arm
  S.say = (at, txt) => { S.now = at; S.heard = txt; api.arm(); };
  // 시각 at 에 인식기가 세션을 (다시) 켰다 — 안드로이드는 확정 뒤 스스로 끊고 다시 켠다(들은 말은 그대로)
  S.restart = (at) => { S.now = at; api.onstart(); };
  S.api = api;
  // 멈출 때까지 시계를 돌려 «언제 멈췄나» 를 돌려준다
  S.fireAt = () => (S.timer ? S.timer.at : null);
  return S;
}
let ck = null;
try { ck = clockBox(false); } catch (e) { ok('D-0b 시계 상자를 만들 수 있다', false, String(e)); }
if (ck) {
  const done = run('we played soccer');
  ck.say(0, 'we played soccer');
  ck.say(800, 'We played soccer.');          // 최종 확정 — 같은 낱말, 대소문자·마침표만 다름
  ok('D-1 같은 문장이 다시 와도 첫 대기 시각에 멈춘다(처음부터 다시 세지 않음)', ck.fireAt() === done, { fireAt: ck.fireAt(), want: done });
  ck = clockBox(false);
  ck.say(0, 'we played'); ck.say(800, 'we played soccer');
  ok('D-2 (짝) 새 낱말이 들리면 그때부터 다시 센다', ck.fireAt() === 800 + run('we played soccer'), { fireAt: ck.fireAt() });
  ck = clockBox(false);
  ck.say(0, 'I like'); ck.say(1000, "I'd like");    // 고쳐 적기(같은 낱말 수) — 시계는 이어 가되 판정은 새 글자로
  ok('D-3 고쳐 적기(같은 낱말 수)는 시계를 이어 간다', ck.fireAt() === run("I'd like"), { fireAt: ck.fireAt(), want: run("I'd like") });
  ck = clockBox(false);
  ck.say(0, 'yes'); ck.say(500, 'yesterday');   // 같은 1단위인데 «끝남(1.2초)» → «덜 끝남(5초)»
  ok('D-3b (짝) 같은 낱말 수라도 판정은 새 글자로 다시 한다(yes→yesterday 는 1.2초에 안 끊김)', ck.fireAt() === run('yesterday') && run('yesterday') > run('yes'), { fireAt: ck.fireAt(), want: run('yesterday') });
  ck = clockBox(false);
  ck.say(0, ''); ck.say(3000, '');
  ok('D-4 (짝) 아직 아무 말도 없으면 매번 새로 센다(생각할 시간을 안 줄임)', ck.fireAt() === 3000 + run(''), { fireAt: ck.fireAt() });
  ck = clockBox(false);
  ck.say(0, '我喜欢'); ck.say(1500, '我喜欢吃披萨');
  ok('D-5 (짝) 중국어는 글자가 늘면 새 말로 본다(띄어쓰기가 없어도)', ck.fireAt() === 1500 + run('我喜欢吃披萨'), { fireAt: ck.fireAt() });
  ck = clockBox(false);
  ck.say(0, '我喜欢'); ck.say(1500, '我喜欢');
  ok('D-5b 중국어도 같은 글자가 다시 오면 시계를 이어 간다(글자 단위로 셈)', ck.fireAt() === run('我喜欢'), { fireAt: ck.fireAt(), want: run('我喜欢') });
  ck = clockBox(false);
  ck.say(0, 'I like pizza'); ck.say(5000, 'I like pizza');
  ok('D-6 이미 지난 대기여도 바로(최소 0.15초 뒤) 멈춘다 — 음수 대기 없음', ck.fireAt() === 5150, ck.fireAt());
  ck = clockBox(true);
  ck.say(0, 'I like pizza'); ck.say(10000, 'I like pizza.');
  ok('D-7 (수동) 같은 글자가 다시 와도 «새 말이 없던» 시간을 이어서 센다', ck.fireAt() === Number(manualSrc && manualSrc[1]), ck.fireAt());
  ck = clockBox(false);
  ck.say(0, 'I like pizza'); ck.restart(1000);
  ok('D-8 (짝) 인식기가 세션을 다시 켜면 새로 충분히 듣는다(재시작 공백을 침묵으로 안 셈)', ck.fireAt() === 1000 + run('I like pizza'), { fireAt: ck.fireAt(), want: 1000 + run('I like pizza') });
  ck = clockBox(false);
  ck.say(0, 'we played soccer'); ck.say(5000, 'We played soccer.');   // 늦게 다시 온 같은 문장 — 0.15초 하한이 걸려 «실제» 와 «명목(1.2초)» 이 갈린다
  ck.now = ck.fireAt(); try { ck.timer.fn(); } catch (e) {}
  const lat = ck.api.lat;
  ok('D-9 멈추면 인식을 끄고, ?lat=1 «기다림» 에는 마지막 새 말부터 «실제로» 기다린 시간을 적는다(명목값이 아니라)', ck.stops === 1 && lat && lat.wait === 5150 && lat.wait !== done, { stops: ck.stops, lat });
  ck = clockBox(false); ck.fast = true;
  ck.say(0, 'we played soccer');
  ck.now = ck.fireAt(); try { ck.timer.fn(); } catch (e) {}
  ok('D-10 (짝) 빠른 마무리(_micFast)가 맡으면 stop() 을 또 부르지 않는다(한 번만 끝냄)', ck.fasts === 1 && ck.stops === 0 && !!ck.api.lat, { fasts: ck.fasts, stops: ck.stops });
}

console.log('\n[E] ⚡ 빠른 마무리 _micFast — onend 를 «한없이» 기다리지 않는다(2026-11-05 「듣기 시간 최소화」)');
// _micFast 와 유예 상수를 소스에서 오려 내 가짜 인식기·가짜 타이머로 실제로 돌린다(단위). 실제 세션 코드 전체는 [G] 가 돌린다.
const fastFn = bodyAt(HTML, 'function _micFast(byUser){');
const graceVars = HTML.match(/var MIC_GRACE=\d+, MIC_GRACE_USER=\d+;/);
ok('E-0 (전제) _micFast·유예 상수를 오려 냈다', !!(fastFn && graceVars));
ok('E-0b (전제) 침묵 타이머가 _micFast 를 «먼저» 묻고, 맡지 않을 때만 stop() 한다', !!armBody && /if\(_micFast\(\)\) return; try\{ _recog && _recog\.stop\(\); \}/.test(armBody));
const GR = graceVars ? Number(graceVars[0].match(/MIC_GRACE=(\d+)/)[1]) : NaN, GRU = graceVars ? Number(graceVars[0].match(/MIC_GRACE_USER=(\d+)/)[1]) : NaN;
function fastBox(isManual, heard, opt = {}) {
  const L = { finished: 0, aborted: 0, stopped: 0, timers: [], cleared: [] };
  const r = opt.noRecog ? null : { onstart() {}, onresult() {}, onerror() {}, onend() {}, abort() { L.aborted++; }, stop() { L.stopped++; } };
  L.r = r;
  try {
    L.api = new Function('isManual', 'heard', 'r', 'L', 'setTimeout', 'clearTimeout',
      `var _recog=r, _recognizing=true, _silence=${opt.pendingSilence ? '"S1"' : 'null'}, _micGrace=null;
       function _micManual(){ return isManual; }
       function _micHeard(){ return heard; }
       function _finishMic(){ L.finished++; _recognizing=false; }
       ${graceVars ? graceVars[0] : ''}
       ${fastFn}
       return { fast:_micFast, endFirst:function(){ _recognizing=false; }, get silence(){ return _silence; } };`)(
      isManual, heard, r, L, (fn, ms) => { const t = { fn, ms, id: 'G' + L.timers.length }; L.timers.push(t); return t.id; }, (id) => { L.cleared.push(id); });
  } catch (e) { L.err = String(e); }
  L.fire = () => { const t = L.timers[L.timers.length - 1]; if (t && !L.cleared.includes(t.id)) t.fn(); };
  L.detached = () => !!r && r.onstart === null && r.onresult === null && r.onerror === null && r.onend === null;
  return L;
}
{
  const a = fastBox(false, 'I like pizza');
  const ret = a.api && a.api.fast(false);
  ok('E-1 자동 + 들은 말 있음 → 맡는다 · abort 가 아니라 stop()(이미 말한 마지막 낱말의 최종 결과는 받는다) · 유예 타이머', ret === true && a.stopped === 1 && a.aborted === 0 && a.finished === 0 && a.timers.length === 1 && a.timers[0].ms === GR, { ret, a: { stopped: a.stopped, aborted: a.aborted, finished: a.finished, t: a.timers.map((t) => t.ms) }, err: a.err });
  a.fire();
  ok('E-2 유예 안에 onend 가 안 오면 → 그 인식기의 핸들러 4개를 다 떼고 abort · 그때까지 적힌 글자로 한 번 보낸다', a.finished === 1 && a.aborted === 1 && a.detached(), { finished: a.finished, aborted: a.aborted, detached: a.detached() });
  const b = fastBox(false, 'I like pizza');
  b.api.fast(false); b.api.endFirst(); b.fire();
  ok('E-3 (짝) 유예 안에 onend 가 먼저 끝냈으면 유예는 아무것도 안 한다(두 번 안 보냄 · 핸들러 그대로)', b.finished === 0 && b.aborted === 0 && !b.detached(), { finished: b.finished, aborted: b.aborted });
  const c = fastBox(false, 'I like pizza', { pendingSilence: true });
  c.api.fast(true);
  ok('E-4 남아 있던 침묵 타이머를 지운다(옛 타이머가 다음 턴을 끊지 않게 — 함정 대조 재현 사고)', c.cleared.includes('S1') && c.api.silence === null, { cleared: c.cleared, silence: c.api.silence });
  const d = fastBox(false, 'I like pizza');
  d.api.fast(false); const again = d.api.fast(false);
  ok('E-5 마무리 중에 다시 불려도(늦은 결과가 침묵 타이머를 다시 켬) stop·유예를 또 만들지 않는다', again === true && d.stopped === 1 && d.timers.length === 1, { again, stopped: d.stopped, timers: d.timers.length });
  const m = fastBox(true, 'I like pizza'); const mRet = m.api.fast(false);
  ok('E-6 (짝) 수동 + 침묵으로 끝남 → 맡지 않는다(입력칸에 남기는 길은 onend 뒤 그대로)', mRet === false && m.stopped === 0 && m.timers.length === 0, { mRet, stopped: m.stopped });
  const e0 = fastBox(false, ''); const eRet = e0.api.fast(false);
  ok('E-7 (짝) 빈손 → 맡지 않는다(Whisper 한 번 더 듣기는 인식기가 다 닫힌 onend 뒤에)', eRet === false && e0.stopped === 0, { eRet });
  const n0 = fastBox(false, 'Yes', { noRecog: true }); const nRet = n0.api ? n0.api.fast(false) : 'err';
  ok('E-8 인식기가 없으면 맡지 않는다(예외 없음)', nRet === false && !n0.err, { nRet, err: n0.err });
  const u = fastBox(true, 'I like pizza'); const uRet = u.api.fast(true);
  ok('E-9 ⏹(수동이어도) + 들은 말 → 맡는다 · 유예는 ⏹ 쪽이 더 길다(말 끝에 바로 눌러 마지막 낱말이 늦게 적히는 경우)', uRet === true && u.timers[0] && u.timers[0].ms === GRU && GRU > GR, { uRet, ms: u.timers[0] && u.timers[0].ms, GR, GRU });
  const ue = fastBox(true, ''); const ueRet = ue.api.fast(true);
  ok('E-10 (짝) ⏹ 인데 빈손 → 맡지 않는다(«다음부터 녹음 방식» 안내는 onend 뒤에)', ueRet === false && ue.stopped === 0, { ueRet });
  ok('E-11 유예는 «한없이» 가 아니라 1초 안쪽이다(침묵 끝 < ⏹ ≤ 1초)', GR > 0 && GR < GRU && GRU <= 1000, { GR, GRU });
}
const tgl = bodyAt(HTML, 'function toggleMic(){');
ok('E-12 ⏹ 배선 — toggleMic 이 «멈춤 표시 → 빠른 마무리 → (안 맡으면) stop()» 순서로 부른다',
  /if\(_recognizing\)\{ _micStopWanted=true; _micUserStop=true; if\(_micFastStop && _micFastStop\(\)\) return; try\{ _recog && _recog\.stop\(\); \}catch\(e\)\{\} return; \}/.test(tgl), tgl.slice(0, 80));
ok('E-13 ⏹ 배선 — 인식 세션이 «사람이 누름» 으로 _micFast 를 내보낸다', /_micFastStop=function\(\)\{ return _micFast\(true\); \};/.test(HTML));

console.log('\n[F] ⚡ 미리 받아쓰기 배선 _micEarly — 녹음 경로가 실제로 감싸지는가');
const earlyFn = bodyAt(HTML, 'function _micEarly(manual, o){');
ok('F-0 (전제) _micEarly 를 오려 냈다', !!earlyFn);
ok('F-0b 웜업 녹음 호출이 _micEarly(manual, …) 로 감싸여 있다', /MangoiVoice\.record\(_micEarly\(manual,\s*\{/.test(wh));
ok('F-0c 미리 받아쓰기 모듈을 싣는다', /<script defer src="\/js\/mangoi-voice-early\.js\?v=\d+"><\/script>/.test(HTML));
function runEarly(isManual, mod) {
  const seen = {};
  let out;
  try {
    out = new Function('isManual', 'mod', 'seen',
      `${consts[0]}
       var MIC_DANGLING=${dangling[1]};
       ${unfin[0]}
       var window={ MangoiVoiceEarly: mod }; var MangoiVoiceEarly=mod;
       ${earlyFn}
       return _micEarly(isManual, { silenceMs: 1600 });`)(isManual, mod, seen);
  } catch (e) { return { err: String(e) }; }
  return { out, seen };
}
const fakeMod = { wrap(o, cfg) { fakeMod.cfg = cfg; return Object.assign({ wrapped: true }, o); } };
const e1 = runEarly(false, fakeMod), e1cfg = fakeMod.cfg;
ok('F-1 자동 → 감싸고, «끝난 말» 판정을 넘긴다(브라우저 인식 경로와 같은 micUnfinished)',
  e1.out && e1.out.wrapped && e1cfg && typeof e1cfg.accept === 'function' && e1cfg.accept('I like pizza.') === true && e1cfg.accept('I like') === false && e1cfg.accept('Yes.') === true, { out: e1.out, err: e1.err });
const e2 = runEarly(true, fakeMod), e2cfg = fakeMod.cfg;
ok('F-2 (짝) 수동 → 감싸되 «그 자리에서 끝내기» 는 안 넘긴다(⏹ 로만 끝남)', e2.out && e2.out.wrapped && e2cfg && !e2cfg.accept, { out: e2.out, cfg: e2cfg });
const e3 = runEarly(false, undefined);
ok('F-3 모듈이 없으면 예전 그대로(같은 opts)', e3.out && !e3.out.wrapped && e3.out.silenceMs === 1600, e3);
const e4 = runEarly(false, { wrap() { throw new Error('boom'); } });
ok('F-4 모듈이 던져도 예전 그대로(녹음은 계속된다)', e4.out && !e4.out.wrapped && e4.out.silenceMs === 1600, e4);


console.log('\n[G] 🧪 실제 인식 세션 코드를 통째로 돌린다 — 다음 턴을 끊지 않는가 · 늦은 낱말 · 두 번 안 보냄 (함정 대조 재현 사고 2026-11-05)');
// warmup.html 의 «var _recog=null, _recognizing=false;» ~ «4. 첫 안내 메시지» 사이(인식 세션 전체: toggleMic·_startSttSession·_finishMic …)를
// 가짜 SpeechRecognition·가짜 시계로 vm 에서 실행한다. ⚠️ [E] 처럼 _finishMic 을 가짜로 바꾸면 «남은 타이머가 다음 세션을 끊는» 사고는 원리상 안 보인다.
const vm = await import('node:vm');
const lines = HTML.split('\n');
const ga = lines.findIndex((l) => l.startsWith('var _recog=null, _recognizing=false;'));
const gb = lines.findIndex((l, k) => k > ga && l.startsWith('/* ── 4. 첫 안내 메시지'));
ok('G-0 (전제) 인식 세션 코드를 오려 냈다', ga > 0 && gb > ga, { ga, gb });
function sttWorld(manual, { endMs = 300 } = {}) {
  const clock = { t: 0 }, timers = []; let id = 1;
  const log = [], recs = [];
  const later = (ms, cb) => { const k = id++; timers.push({ k, at: clock.t + ms, cb }); return k; };
  class SR {
    constructor() { this.n = recs.length; recs.push(this); this.active = false; }
    start() { this.active = true; later(50, () => { if (this.onstart) this.onstart(); }); }
    stop() { log.push(['stop', this.n, clock.t]); if (!this.active) return; this.active = false; later(endMs, () => { if (this.onend) this.onend(); }); }
    abort() { log.push(['abort', this.n, clock.t]); this.active = false; }
    say(txt) { if (this.onresult) this.onresult({ results: [[{ transcript: txt }]] }); }
  }
  const inp = { value: '' };
  const sb = {
    console, Math, String, Number, RegExp, Object, Date: { now: () => clock.t },
    setTimeout: (cb, ms) => later(ms || 0, cb), clearTimeout: (k) => { const x = timers.findIndex((y) => y.k === k); if (x >= 0) timers.splice(x, 1); },
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: (x) => (x === 'inp' ? inp : null) },
    _warmLang: 'en', _warmPaused: false, _warmEpoch: 0, _warmVoiceEpoch: 0, _warmMicCancel: null, sending: false, _latSilence: null,
    WarmupAutoTalk: { isOn: () => !manual, on() {} },
    MangoiVoice: { supported: () => true, stop() {}, cancel() {} },
    addMsg: (t) => log.push(['msg', String(t).slice(0, 24), clock.t]),
    sendMsg: () => log.push(['SEND', inp.value, clock.t]),
    unlockAudio() {}, _stopSpeak() {}, isZh: () => false, wuT: (k) => k,
  };
  sb.window = sb; sb.SpeechRecognition = SR;
  vm.createContext(sb);
  vm.runInContext(lines.slice(ga, gb).join('\n'), sb);
  vm.runInContext('micViaWhisper=function(){ __whisper(); };', Object.assign(sb, { __whisper: () => log.push(['whisper', clock.t]) }));
  const run = (until) => { while (clock.t < until) { clock.t += 10; for (;;) { timers.sort((x, y) => x.at - y.at); if (!timers.length || timers[0].at > clock.t) break; timers.shift().cb(); } } };
  return { sb, recs, log, run, at: (t, f) => { run(t); f(); }, sends: () => log.filter((e) => e[0] === 'SEND') };
}
if (ga > 0 && gb > ga) {
  // G-1 버튼 모드(기본): 1턴 ⏹ → 2턴에서 오래 말함. 옛 침묵 타이머(1턴 마지막 말 + 30초)가 2턴을 끊으면 안 된다.
  const w1 = sttWorld(true);
  w1.at(0, () => w1.sb.toggleMic()); w1.at(1000, () => w1.recs[0].say('I like pizza')); w1.at(1500, () => w1.sb.toggleMic());
  w1.at(8000, () => w1.sb.toggleMic()); w1.at(9000, () => w1.recs[1].say('My favorite food'));
  w1.at(20000, () => w1.recs[1].say('My favorite food is pizza')); w1.at(30800, () => w1.recs[1].say('My favorite food is pizza and chicken'));
  w1.run(40000);
  const held = w1.log.filter((e) => e[0] === 'msg' && e[2] < 40000 && e[2] > 8000);
  ok('G-1 (버튼 모드) ⏹ 뒤 다음 턴에서 말하는 도중 마이크가 꺼지지 않는다(옛 침묵 타이머가 남지 않음)', w1.sends().length === 1 && held.length === 0 && w1.sb._recognizing === true, { sends: w1.sends(), held, rec: w1.sb._recognizing });
  // G-2 자동 모드: 1턴 «I want to»(5초 대기) → ⏹ → 2턴이 빨리 열림. 옛 타이머가 2턴 조각(«My dog»)을 보내면 안 된다.
  const w2 = sttWorld(false);
  w2.at(0, () => w2.sb.toggleMic()); w2.at(1000, () => w2.recs[0].say('I want to')); w2.at(1200, () => w2.sb.toggleMic());
  w2.at(3500, () => w2.sb.toggleMic()); w2.at(4500, () => w2.recs[1].say('My dog')); w2.at(6500, () => w2.recs[1].say('My dog is very cute'));
  w2.run(20000);
  const s2 = w2.sends().map((e) => e[1]);
  ok('G-2 (자동) 다음 턴은 «다 말한 문장» 으로 보낸다(옛 타이머가 조각을 보내지 않음)', s2.length === 2 && s2[1] === 'My dog is very cute', w2.sends());
  // G-3 ⏹ 뒤 onend 가 2초 늦는 기기: 유예(⏹ 쪽) 뒤에 보내고, 늦게 온 onend 는 두 번 보내지 않는다.
  const w3 = sttWorld(true, { endMs: 2000 });
  w3.at(0, () => w3.sb.toggleMic()); w3.at(1000, () => w3.recs[0].say('I like')); w3.at(1500, () => w3.sb.toggleMic());
  w3.at(1800, () => w3.recs[0].say('I like pizza'));   // ⏹ 0.3초 뒤 «마지막 낱말» 의 최종 결과 — stop() 이라 아직 받는다
  w3.run(6000);
  const s3 = w3.sends();
  ok('G-3 ⏹ 뒤 onend 가 늦어도 유예(⏹+' + GRU + 'ms)에 보낸다 · 그사이 온 마지막 낱말까지 담는다', s3.length === 1 && s3[0][1] === 'I like pizza' && s3[0][2] === 1500 + GRU, s3);
  ok('G-4 (짝) 늦게 온 onend·결과로 두 번 보내지 않는다 · «듣는 중» 이 다시 켜지지 않는다', s3.length === 1 && w3.sb._recognizing === false, { s3, rec: w3.sb._recognizing });
  // G-5 onend 가 빠른 기기(0.3초)는 예전과 똑같이 onend 에서 끝낸다
  const w5 = sttWorld(true, { endMs: 300 });
  w5.at(0, () => w5.sb.toggleMic()); w5.at(1000, () => w5.recs[0].say('I like pizza')); w5.at(1500, () => w5.sb.toggleMic());
  w5.run(5000);
  ok('G-5 (짝) onend 가 유예 안에 오면 예전처럼 그때 보낸다(⏹+0.3초 · abort 없음)', w5.sends().length === 1 && w5.sends()[0][2] === 1800 && !w5.log.some((e) => e[0] === 'abort'), w5.log);
  // G-6 자동 · 침묵 끝 · onend 가 2초 늦는 기기: 침묵 대기 + 유예(침묵 쪽)에 보낸다(예전: + 2초)
  const w6 = sttWorld(false, { endMs: 2000 });
  w6.at(0, () => w6.sb.toggleMic()); w6.at(1000, () => w6.recs[0].say('I like pizza'));
  w6.run(8000);
  const done6 = run('I like pizza');
  ok('G-6 (자동) 침묵 대기가 끝나면 onend(2초)를 다 안 기다리고 유예 뒤에 보낸다', w6.sends().length === 1 && w6.sends()[0][2] === 1000 + done6 + GR, { sends: w6.sends(), want: 1000 + done6 + GR });
  // G-7 ⏹ 인데 빈손: 예전처럼 onend 뒤에 «다음부터 녹음 방식» 안내(빠른 마무리 안 탐)
  const w7 = sttWorld(true, { endMs: 600 });
  w7.at(0, () => w7.sb.toggleMic()); w7.at(1500, () => w7.sb.toggleMic());
  w7.run(4000);
  ok('G-7 (짝) ⏹ 인데 빈손 → 보내지 않고 onend 뒤 안내(빠른 마무리 안 탐)', w7.sends().length === 0 && w7.log.some((e) => e[0] === 'msg' && e[2] === 2100) && !w7.log.some((e) => e[0] === 'abort'), w7.log);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
