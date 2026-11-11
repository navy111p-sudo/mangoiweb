// 🎤 웜업 «소리가 잘 안 들렸어요» 오판 감시 (2026-10-07 MAIMAI 제보 — 수업 안 demo-1).
// 녹음 모듈 판정(peak>8)이 놓친 «작은 말소리» 를 녹음 파일로 다시 재서 버리지 않는가 +
// 무음·일정한 잡음·딸깍 한 번은 여전히 버리는가(짝). 함수를 소스에서 오려 내 실제로 돌립니다.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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
const run = (x, noisy) => { try { return f ? f(x, SR, noisy) : 'nofn'; } catch (e) { return 'throw:' + e.message; } };
// 작은 말소리: 바닥잡음 0.002 위에 0.03 진폭(=128 기준 peak 약 4 — 모듈 문턱 8 아래) 말 덩어리
const quietSpeech = sig(3, t => 0.002 * rnd() + ((t > 0.6 && t < 1.4) || (t > 1.7 && t < 2.3) ? 0.03 * Math.sin(2 * Math.PI * 180 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t)) : 0));
ok('작은 말소리(peak≈4/128)는 «말소리 있음»', run(quietSpeech) === true);
ok('보통 크기 말소리도 «있음»', run(sig(2, t => 0.003 * rnd() + (t > 0.5 && t < 1.5 ? 0.25 * Math.sin(2 * Math.PI * 200 * t) : 0))) === true);
ok('완전 무음은 «없음»(Whisper 환각은 계속 버림)', run(sig(3, () => 0)) === false);
ok('일정한 잡음만은 «없음»', run(sig(3, () => 0.01 * rnd())) === false);
ok('딸깍 한 번(20ms)은 «없음»', run(sig(3, t => 0.002 * rnd() + (t > 1 && t < 1.02 ? 0.5 : 0))) === false);
const fan = t => 0.018 * Math.sin(2 * Math.PI * 120 * t);
const inNoise = sig(3, t => fan(t) + (t > 0.6 && t < 1.4 ? 0.029 * Math.sin(2 * Math.PI * 210 * t) : 0));
ok('배경 소음에 묻힌 작은 발화도 말하기 화면은 살린다', run(inNoise) === false && run(inNoise, true) === true);
ok('소음 모드도 일정한 소음과 큰 충격음 하나는 버린다', run(sig(3, fan), true) === false
  && run(sig(3, t => fan(t) + (t > 1 && t < 1.02 ? 0.5 : 0)), true) === false);
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

// Execute the warmup recorder with a stale early result and the final selected result.
const spoken=[], messages=[], submitted=[];
const input={value:''};
let recheck='unavailable';
const warm={
  _prepositionRepeatEpoch:null, _warmPaused:false, _warmEpoch:1, _warmVoiceEpoch:0, _whisperOn:false,
  _warmLang:'en', _wuCorrMode:'focused', wuT:(ko,en)=>en,
  MIC_MANUAL_IDLE:30000, MIC_MANUAL_MAX:180000, _micManual:()=>false,
  setMicState(){}, _setListenLabel(){}, _autoHook(){}, ansCardClear(){}, fixCardClear(){},
  addMsg:(text,who)=>messages.push([text,who]), speak:text=>spoken.push(text),
  document:{getElementById:()=>input}, sendMsg:()=>submitted.push(input.value),
  _micEarly:(manual,opts)=>{
    const post=opts.transcribe;
    return {...opts, transcribe:async fd=>{
      await post(new Map([['stale',true]]));
      return post(fd);
    }};
  },
  MangoiVoice:{
    supported:()=>true,
    post:async fd=>({ok:true,text:'I am interested in music.',preposition_recheck:fd.get('stale')?'unavailable':recheck}),
    record:async opts=>{
      opts.onState('speaking',{});
      return (await opts.transcribe(new Map())).text;
    }
  }
};
warm.window=warm; vm.createContext(warm); vm.runInContext('async '+mv,warm);
await warm.micViaWhisper();
await warm.micViaWhisper();
ok('두 보조 인식 실패: 화면과 음성에 같은 재질문을 한 번만 내보내고 대화 요청은 막는다',
   spoken.length===1 && messages.filter(m=>m[1]==='ai').length===1 &&
   spoken[0]===messages[0][0] && messages[1][1]==='sys' && submitted.length===0);
recheck='unchanged';
await warm.micViaWhisper();
ok('최종 전사가 in을 유지하면 이전 미리받기 실패와 상관없이 그대로 전송한다',
   submitted[0]==='I am interested in music.' && spoken.length===1);

// 배선 — A.i 친구하기 micViaWhisper(async) 몸통
html = fHtml;
const fv = (() => { const i = fHtml.indexOf('async function micViaWhisper('); if (i < 0) return ''; let d = 0; for (let k = fHtml.indexOf('{', i); k < fHtml.length; k++) { if (fHtml[k] === '{') d++; else if (fHtml[k] === '}' && --d === 0) return fHtml.slice(i, k + 1); } return ''; })();
ok('전제: A.i 친구하기 micViaWhisper 를 오려 냈다', fv.length > 500);
ok('A.i 친구하기: 녹음 파일을 받아 둔다', /onAudio\s*:\s*(\w+)\s*=>\s*\{\s*recBlob\s*=\s*\1/.test(fv));
// The former "only if auto && !heard" assertion encoded the bug: a click bypassed it.
// Execute the shared adapter and real PCM classifier instead of pinning that old branch.
const shared = fnBody('friendRecordVoice');
ok('A.i 친구하기: 공용 검사 함수를 실제로 호출한다', /await friendRecordVoice\(/.test(fv) && shared.length > 500);
async function probe(samples, cancel = false) {
  let current = true, uploads = 0, checks = 0;
  const ctx = {
    Promise, String,
    MangoiVoiceCheck: { blobHasVoice: async (b, noisy) => { checks++; if (cancel) current = false; return run(b.samples, noisy); } },
    MangoiVoice: { record: async opts => {
      opts.onAudio({ samples }); opts.onState('speaking', {}); // a peak is not an exemption
      const d = await opts.transcribe({ append() {} }); return d?.text || '';
    } },
    fetch: async () => { uploads++; return { ok: true, json: async () => ({ ok: true, text: 'Yes.' }) }; }
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext('async ' + shared, ctx);
  const said = await ctx.friendRecordVoice({ isCurrent: () => current, onState() {} });
  return { said, uploads, checks };
}
const quiet = await probe(quietSpeech);
ok('A.i 친구하기: 작은 말소리는 공용 판정으로 살린다', quiet.said === 'Yes.' && quiet.uploads === 1 && quiet.checks === 1);
for (const [label, samples] of [['무음', sig(3, () => 0)], ['딸깍', sig(3, t => t > 1 && t < 1.02 ? .5 : 0)], ['모름', new Float32Array(0)]]) {
  const r = await probe(samples);
  ok('A.i 친구하기: ' + label + '은 peak 이벤트가 있어도 업로드 전에 막는다', !r.said && r.uploads === 0);
}
const noisy = await probe(inNoise);
ok('A.i 친구하기: 소음에 묻힌 발화도 실제로 전사에 보낸다', noisy.said === 'Yes.' && noisy.uploads === 1);
const canceled = await probe(quietSpeech, true);
ok('A.i 친구하기: 기다린 사이 새 녹음이 시작됐으면 물러난다', !canceled.said && canceled.uploads === 0);
ok('A.i 친구하기: 버튼 모드는 9초에 끊지 않는다', /firstMs\s*:\s*auto\s*\?\s*0\s*:\s*20000/.test(fv));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
