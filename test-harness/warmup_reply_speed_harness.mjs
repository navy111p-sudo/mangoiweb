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
const consts = HTML.match(/var SIL_FIRST=(\d+), SIL_SHORT=(\d+), SIL_DONE=(\d+);/);
const dangling = HTML.match(/var MIC_DANGLING=(\/.*\/i);/);
const unfin = HTML.match(/function micUnfinished\(s\)\{[\s\S]*?\n\}/);
// 식 «모양» 을 못 박지 않는다 — _armSilence 안의 «var ms = …;» 를 그대로 가져와 돌린다.
const arm = HTML.match(/function _armSilence\(\)\{[\s\S]*?\n  \}/);
const pick = arm && arm[0].match(/var ms = ([^;]+);/);
ok('A-0 (전제) 상수·판정·고르는 식을 소스에서 찾았다', !!(consts && dangling && unfin && pick));
const manualSrc = HTML.match(/var MIC_MANUAL_IDLE=(\d+);/);
ok('A-0c (전제) 수동 모드 대기값을 소스에서 찾았다', !!manualSrc);
// _micManual 을 바꿔 끼워 «자동 말하기» 와 «수동 버튼» 두 경우를 따로 돌린다(2026-10-02)
let waitFor2 = () => NaN;
try {
  waitFor2 = new Function('t', 'isManual',
    `var SIL_FIRST=${consts[1]}, SIL_SHORT=${consts[2]}, SIL_DONE=${consts[3]};
     var MIC_MANUAL_IDLE=${manualSrc ? manualSrc[1] : 'NaN'};
     var MIC_DANGLING=${dangling[1]};
     function _micManual(){ return isManual; }
     ${unfin[0]}
     return ${pick[1]};`);
} catch (e) { ok('A-0d 판정식을 실행할 수 있다', false, String(e)); }
const run = (t) => { try { return waitFor2(t, false); } catch (e) { return NaN; } };       // 자동 말하기
const runM = (t) => { try { return waitFor2(t, true); } catch (e) { return NaN; } };       // 수동 버튼

const done1 = run('I like pizza'), done2 = run('My favorite sport is soccer');
ok('A-1 (자동) 끝난 문장이면 2초 안에 보낸다(옛 2.6초보다 빠름)', done1 <= 2000 && done2 <= 2000, { done1, done2 });
ok('A-2 (자동) 그래도 1.2초보다는 기다린다(숨 한 번 쉬는 사이에 잘리지 않게)', done1 >= 1200, done1);
ok('A-3 (자동·짝) 덜 끝난 문장(“I like …”)은 여전히 4초 넘게 기다린다', run('I like') >= 4000 && run('I want to') >= 4000, { a: run('I like'), b: run('I want to') });
ok('A-4 (자동·짝) 아직 아무 말 없으면 여전히 8초 넘게 기다린다', run('') >= 8000, run(''));
ok('A-5 (수동) 끝난 문장이어도 침묵 20초 안에는 끝내지 않는다', runM('I like pizza') >= 20000, runM('I like pizza'));
ok('A-6 (수동) 덜 끝난 문장·빈 말도 20초 넘게 기다린다', runM('I like') >= 20000 && runM('') >= 20000, { a: runM('I like'), b: runM('') });

console.log('\n[B] 녹음(Whisper) 경로');
const rec = HTML.match(/MangoiVoice\.record\(\{([\s\S]*?)onState/);
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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
