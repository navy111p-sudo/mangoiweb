// warmup_reply_speed_harness.mjs — A.i 말하기 연습 «말이 끝난 뒤 얼마나 기다렸다 보내나» (2026-09-25)
//
// 사장님 「A.i 가 답하는 시간을 더 빠르게」 — 학생이 말을 마친 뒤 전송까지의 침묵 대기를 줄였다.
//   ① 문장이 끝나 보이면 1.5초 안팎(옛 2.6초)
//   ② 덜 끝난 문장·아직 아무 말 없음은 «그대로» 넉넉히 — 아이가 「음…」 하고 쉬는 동안 끊겨
//      보내지던 2026-07-23 사고가 그 둘로 막혀 있다(짝으로 본다)
//   ③ 녹음(Whisper) 경로는 «문장이 끝났나» 를 모르므로 기본 2.5초보다 짧되 1.5초까지는 안 줄인다
//
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
let waitFor = () => NaN;
try {
  waitFor = new Function('t',
    `var SIL_FIRST=${consts[1]}, SIL_SHORT=${consts[2]}, SIL_DONE=${consts[3]};
     var MIC_DANGLING=${dangling[1]};
     ${unfin[0]}
     return ${pick[1]};`);
} catch (e) { ok('A-0b 판정식을 실행할 수 있다', false, String(e)); }
const run = (t) => { try { return waitFor(t); } catch (e) { return NaN; } };

const done1 = run('I like pizza'), done2 = run('My favorite sport is soccer');
ok('A-1 끝난 문장이면 2초 안에 보낸다(옛 2.6초보다 빠름)', done1 <= 2000 && done2 <= 2000, { done1, done2 });
ok('A-2 그래도 1.2초보다는 기다린다(숨 한 번 쉬는 사이에 잘리지 않게)', done1 >= 1200, done1);
ok('A-3 (짝) 덜 끝난 문장(“I like …”)은 여전히 4초 넘게 기다린다', run('I like') >= 4000 && run('I want to') >= 4000, { a: run('I like'), b: run('I want to') });
ok('A-4 (짝) 아직 아무 말 없으면 여전히 8초 넘게 기다린다', run('') >= 8000, run(''));

console.log('\n[B] 녹음(Whisper) 경로');
const rec = HTML.match(/MangoiVoice\.record\(\{([\s\S]*?)onState/);
const sm = rec && rec[1].match(/silenceMs:\s*(\d+)/);
ok('B-0 (전제) 웜업의 녹음 호출을 찾았다', !!rec);
const s = sm ? Number(sm[1]) : 2500;   // 안 넘기면 모듈 기본 2500
ok('B-1 녹음 경로도 기본(2.5초)보다 빨리 보낸다', s < 2500, s);
ok('B-2 녹음 경로는 1.5초까지 줄이지 않는다(문장이 끝났는지 모르므로)', s >= 1600, s);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
