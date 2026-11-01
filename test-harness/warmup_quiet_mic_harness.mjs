// 🎤 웜업 «소리가 잘 안 들렸어요» 오판 감시 (2026-10-07 MAIMAI 제보 — 수업 안 demo-1).
// 녹음 모듈 판정(peak>8)이 놓친 «작은 말소리» 를 녹음 파일로 다시 재서 버리지 않는가 +
// 무음·일정한 잡음·딸깍 한 번은 여전히 버리는가(짝). 함수를 소스에서 오려 내 실제로 돌립니다.
import { readFileSync } from 'node:fs';
const SRC = process.env.WARMUP_SRC || new URL('../cloudflare-deploy/public/warmup.html', import.meta.url);
const JS = process.env.CHECK_SRC || new URL('../cloudflare-deploy/public/js/voice-has-speech.js', import.meta.url);
const FR = process.env.FRIEND_SRC || new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url);
const wHtml = readFileSync(SRC, 'utf8'), jsSrc = readFileSync(JS, 'utf8'), fHtml = readFileSync(FR, 'utf8');
let html = jsSrc;   // fnBody 가 읽는 대상(처음엔 공용 정본)
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

ok('정본이 전역으로 내보낸다', /window\.MangoiVoiceCheck\s*=\s*\{\s*inSamples\s*:\s*_voiceInSamples\s*,\s*blobHasVoice\s*:\s*_blobHasVoice/.test(jsSrc));
ok('웜업은 판정을 복제하지 않는다(정본만 부름)', !/function\s+_voiceInSamples/.test(wHtml) && /MangoiVoiceCheck\.blobHasVoice\(/.test(wHtml));
for (const [nm, h] of [['웜업', wHtml], ['A.i 친구하기', fHtml]])
  ok(nm + ' 이 정본 파일을 싣는다', /<script[^>]+src="\/js\/voice-has-speech\.js\?v=\d+"/.test(h));

// 배선 — 웜업 micViaWhisper 몸통 안에서
html = wHtml;
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

// 배선 — A.i 친구하기 micViaWhisper(async) 몸통
html = fHtml;
const fv = (() => { const i = fHtml.indexOf('async function micViaWhisper('); if (i < 0) return ''; let d = 0; for (let k = fHtml.indexOf('{', i); k < fHtml.length; k++) { if (fHtml[k] === '{') d++; else if (fHtml[k] === '}' && --d === 0) return fHtml.slice(i, k + 1); } return ''; })();
ok('전제: A.i 친구하기 micViaWhisper 를 오려 냈다', fv.length > 500);
ok('A.i 친구하기: 녹음 파일을 받아 둔다', /onAudio\s*:\s*(\w+)\s*=>\s*\{\s*recBlob\s*=\s*\1/.test(fv));
const fg = fv.indexOf('MangoiVoiceCheck.blobHasVoice(recBlob)'), fd = fv.indexOf("if (auto && !heard) said = '';");
ok('A.i 친구하기: 버리기 «전» 에 다시 잰다', fg > 0 && fd > fg);
ok('A.i 친구하기: 판정이 놓친 자동 모드에서만', /if\s*\(\s*auto\s*&&\s*!heard\s*&&\s*said\s*\)/.test(fv.slice(fv.lastIndexOf('if (', fg) - 5, fg)));
ok('A.i 친구하기: true 일 때만 살린다', /if\s*\(\s*v\s*===\s*true\s*\)\s*heard\s*=\s*true/.test(fv));
ok('A.i 친구하기: 기다린 사이 새 녹음이 시작됐으면 물러난다', /blobHasVoice\(recBlob\)[\s\S]{0,120}if\s*\(\s*micSeq\s*!==\s*_friendMicSeq\s*\)\s*return/.test(fv));
ok('A.i 친구하기: 버튼 모드는 9초에 끊지 않는다', /firstMs\s*:\s*auto\s*\?\s*0\s*:\s*20000/.test(fv));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
