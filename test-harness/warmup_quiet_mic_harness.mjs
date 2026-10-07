// 🎤 웜업 «소리가 잘 안 들렸어요» 오판 감시 (2026-10-07 MAIMAI 제보 — 수업 안 demo-1).
// 녹음 모듈 판정(peak>8)이 놓친 «작은 말소리» 를 녹음 파일로 다시 재서 버리지 않는가 +
// 무음·일정한 잡음·딸깍 한 번은 여전히 버리는가(짝). 함수를 소스에서 오려 내 실제로 돌립니다.
import { readFileSync } from 'node:fs';
const SRC = process.env.WARMUP_SRC || new URL('../cloudflare-deploy/public/warmup.html', import.meta.url);
const html = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
function fnBody(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) return html.slice(i, k + 1); } }
  return '';
}
const src = fnBody('_voiceInSamples');
ok('전제: _voiceInSamples 를 오려 냈다', src.length > 100);
let f = null;
try { f = new Function(src + '; return _voiceInSamples;')(); } catch (e) { console.log('  (컴파일 실패) ' + e.message); }
const SR = 48000;
function sig(sec, gen) { const x = new Float32Array(Math.round(SR * sec)); for (let i = 0; i < x.length; i++) x[i] = gen(i / SR); return x; }
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 * 2 - 1; };
const run = (x) => { try { return f ? f(x, SR) : 'nofn'; } catch (e) { return 'throw:' + e.message; } };
// 작은 말소리: 바닥잡음 0.002 위에 0.03 진폭(=128 기준 peak 약 4 — 모듈 문턱 8 아래) 말 덩어리
const quietSpeech = sig(3, t => 0.002 * rnd() + ((t > 0.6 && t < 1.4) || (t > 1.7 && t < 2.3) ? 0.03 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0));
ok('작은 말소리(peak≈4/128)는 «말소리 있음»', run(quietSpeech) === true);
ok('보통 크기 말소리도 «있음»', run(sig(2, t => 0.003 * rnd() + (t > 0.5 && t < 1.5 ? 0.25 * Math.sin(2 * Math.PI * 200 * t) : 0))) === true);
ok('완전 무음은 «없음»(Whisper 환각은 계속 버림)', run(sig(3, () => 0)) === false);
ok('일정한 잡음만은 «없음»', run(sig(3, () => 0.01 * rnd())) === false);
ok('딸깍 한 번(20ms)은 «없음»', run(sig(3, t => 0.002 * rnd() + (t > 1 && t < 1.02 ? 0.5 : 0))) === false);
ok('빈 입력은 null(모름)', run(new Float32Array(0)) === null);

// 배선 — micViaWhisper 몸통 안에서
const mv = fnBody('micViaWhisper');
ok('전제: micViaWhisper 를 오려 냈다', mv.length > 500);
ok('녹음 파일을 받아 둔다(onAudio)', /onAudio\s*:\s*function\s*\(\s*(\w+)\s*\)\s*\{\s*recBlob\s*=\s*\1/.test(mv));
const gi = mv.indexOf('_blobHasVoice(recBlob)');
const di = mv.indexOf("said=''; addMsg(wuT('🎤 소리가 잘 안 들렸어요");
ok('버리기 «전» 에 녹음 파일을 다시 잰다', gi > 0 && di > gi);
const gate = mv.slice(mv.lastIndexOf('if(', gi), gi);
ok('그 재기는 «판정이 놓친 경우» 에만', /if\(\s*said\s*&&\s*!heard\s*\)/.test(gate));
ok('true 일 때만 살린다(모르면 예전대로 버림)', /if\(\s*_v\s*===\s*true\s*\)\s*heard\s*=\s*true/.test(mv));
ok('수동 모드는 판정이 못 봐도 9초에 끊지 않는다', /firstMs\s*:\s*manual\s*\?\s*MIC_MANUAL_IDLE/.test(mv));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
