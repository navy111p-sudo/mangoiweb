/* A.i 친구하기 스트리밍 (A-1) — 문장이 끝날 때마다 먼저 읽는가, 그리고 생 JSON 이 안 새는가.
 *
 * [왜 있나 — 2026-09-11]
 * 학생 121명 중 41명(34%)이 1턴만 하고 나갑니다(D1 ai_friend_chats 전수). 지금까지는 답이
 * «다» 만들어진 뒤에야 읽기 시작했습니다. 이 검사는 그 스트리밍이 실제로 도는지,
 * 그리고 이 저장소가 두 번 낸 사고(생 JSON·"[object Object]" 유출)가 재발하지 않는지를 봅니다.
 *
 * ⚠️ 문자열 검사로는 «무엇이 나가는가» 를 못 봅니다 — 서버 스트리밍 함수를 **오려 내
 *    가짜 모델 스트림으로 실제로 돌려** 화면에 보낸 이벤트를 확인합니다.
 */
import { readFileSync } from 'node:fs';

const SRV = readFileSync(new URL('../cloudflare-deploy/src/api-ai.ts', import.meta.url), 'utf8');
const UI  = readFileSync(new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url), 'utf8');
const TAP = readFileSync(new URL('../cloudflare-deploy/src/stream-json-text.ts', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};
function strip(t) {
  let out = '', inB = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inB) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inB = false; }
    for (;;) { const b = l.indexOf('/*'); if (b < 0) break;
      const e = l.indexOf('*/', b + 2);
      if (e < 0) { l = l.slice(0, b); inB = true; break; }
      l = l.slice(0, b) + l.slice(e + 2); }
    out += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}
/** `const NAME = async (…) => {` 부터 짝이 맞는 `}` 까지. */
function arrowFn(src, name) {
  const i = src.indexOf('const ' + name + ' = async (');
  if (i < 0) return '';
  const open = src.indexOf('{', src.indexOf('=>', i));
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('\n① 서버 — 스트리밍을 «실제로» 돌린다');

/* 정본 tap 을 주입해서 돌립니다 — 검사가 자기 사본을 쓰면 정본이 바뀌어도 모릅니다. */
const tapJs = TAP.replace(/^export type [\s\S]*?^};$/gm, '')
  .replace(/:\s*Record<string,\s*string>/g, '').replace(/:\s*JsonTextTap(?=\s*[{;])/g, '')
  .replace(/:\s*\{ out: string\[\]; rest: string \}/g, '').replace(/\(key:\s*string\)/g, '(key)')
  .replace(/\(chunk:\s*string\)\s*:\s*string/g, '(chunk)')
  .replace(/\(buf:\s*string,\s*maxRun\s*=\s*160\)/g, '(buf, maxRun = 160)')
  .replace(/let state:\s*'seek' \| 'in' \| 'end'/g, 'let state')
  .replace(/const out:\s*string\[\]/g, 'const out').replace(/^export /gm, '');
const TAPMOD = await import('data:text/javascript;base64,' +
  Buffer.from(tapJs + '\nexport { createJsonTextTap, takeSentences };').toString('base64'));

let fnSrc = arrowFn(SRV, 'runFriendStreaming');
ok('runFriendStreaming 을 오려 냈다 (전제)', fnSrc.length > 400, String(fnSrc.length));

const fnJs = fnSrc
  .replace(/\(model: string, msgs: any\[\], maxTokens: number, temperature: number\): Promise<any>/,
           '(model, msgs, maxTokens, temperature)')
  .replace(/const st: any/g, 'const st').replace(/let nl: number/g, 'let nl')
  .replace(/const ev: any/g, 'const ev');

/** 가짜 모델 스트림 — 조각을 «아주 잘게» 쪼개 넣습니다(경계 처리를 실제로 시험). */
function fakeAiStream(chunks) {
  let i = 0;
  const enc = new TextEncoder();
  return { getReader: () => ({ read: async () => (i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { value: undefined, done: true }) }) };
}
function sseLines(raw, size = 7) {
  const outs = [];
  for (let i = 0; i < raw.length; i += size) outs.push('data: ' + JSON.stringify({ response: raw.slice(i, i + size) }) + '\n');
  outs.push('data: [DONE]\n');
  return outs;
}

async function runStream(modelRaw) {
  const sent = [];
  const body = `
    let latTries = 0, latModelMs = 0, streamedText = '';
    const sseSend = (o) => sent.push(o);
    const friendAIOpts = () => ({});
    const env = { AI: { run: async () => stream } };
    ${fnJs}
    return (async () => { const r = await runFriendStreaming('m', [], 300, 0.8);
      return { resp: r, streamedText, latTries, latModelMs }; })();
  `;
  const f = new Function('sent', 'stream', 'createJsonTextTap', 'takeSentences', 'TextDecoder', body);
  const out = await f(sent, fakeAiStream(sseLines(modelRaw)), TAPMOD.createJsonTextTap, TAPMOD.takeSentences, TextDecoder);
  return { sent, ...out };
}

const modelJson = '{"reply":"Hello there. How are you today? I am happy!","fix":{"was":"I go","now":"I went"}}';
const r1 = await runStream(modelJson);
const texts = r1.sent.filter(e => e.t).map(e => e.t);
ok('문장 단위로 보낸다 (토막이 아니라)', texts.length === 3, JSON.stringify(texts));
ok('첫 문장이 온전하다', texts[0] === 'Hello there.', JSON.stringify(texts[0]));
/* ⛔ 이 저장소가 두 번 낸 사고 — 생 JSON·구조 문자가 학생 화면으로 가면 안 됩니다. */
const all = texts.join(' ');
ok('중괄호·대괄호가 안 나간다', !/[{}[\]]/.test(all), all);
ok('키 이름(reply·fix·was·now)이 안 나간다', !/\b(reply|fix|was|now)\b/.test(all), all);
ok('전체 원문을 response 로 돌려준다 (뒤 처리가 fix 를 읽어야 함)', r1.resp && r1.resp.response === modelJson);
ok('보낸 문장을 streamedText 에 모은다 (replaced 판정용)', /Hello there\./.test(r1.streamedText || ''));
ok('모델 호출 횟수를 센다', r1.latTries === 1, String(r1.latTries));

/* 모델이 평문을 주면 한 글자도 안 보내야 합니다 — 화면이 done 의 정본만 그립니다. */
const r2 = await runStream('Just plain text, no JSON here at all.');
ok('평문이면 한 문장도 안 보낸다', r2.sent.filter(e => e.t).length === 0, JSON.stringify(r2.sent));
ok('그래도 원문은 돌려준다 (옛 경로가 처리)', r2.resp.response === 'Just plain text, no JSON here at all.');

console.log('\n② 서버 — 옛 화면은 «한 글자도» 안 바뀐다');
const S = strip(SRV);
ok('stream 을 안 보내면 옛 JSON 경로', /if \(!wantStream\) return json\(await runTurn\(\)\)/.test(S));
ok('stream 은 옵트인 (기본 꺼짐)', /const wantStream = \(b\.stream ===/.test(S));
ok('SSE 헤더를 준다', /text\/event-stream/.test(S));
ok('자격증명 섞인 응답을 캐시하지 않는다', /'Cache-Control': 'private, no-store'/.test(S));
ok('중간 버퍼링을 끈다 (X-Accel-Buffering)', /X-Accel-Buffering/.test(S));
/* ⛔ 스트리밍이 실패해도 대화가 죽으면 안 됩니다 — 같은 모델을 옛 방식으로 다시. */
ok('스트리밍 실패 시 옛 방식으로 떨어진다', /catch \(se: any\) \{[\s\S]{0,200}runFriend\(m, messages/.test(SRV));
ok('스트리밍은 «한 번만» 시도한다 (streamTried)', /!streamTried/.test(S) && /streamTried = true/.test(S));
/* 재시도로 답이 바뀌면 화면이 다시 읽어야 합니다. */
ok('최종본과 다르면 replaced 를 준다', /replaced: streamedText && streamedText\.trim\(\) !== reply\.trim\(\)/.test(S));

console.log('\n③ 화면 — 문장 큐와 중복 낭독');
const U = strip(UI);
ok('stream: 1 을 보낸다', /stream: 1/.test(U));
ok('Content-Type 으로 옛 서버와 가른다', /text\/event-stream/.test(U));
/* ⚠️ «바로 다음 줄» 로 못 박지 마세요 — B(끼어들기)가 그 사이에 한 줄을 넣자 보장은 그대로인데
   검사만 깨졌습니다(2026-09-11). 물어야 할 것은 «학생 말풍선을 그리기 «전» 에 끊는가» 입니다. */
(function(){
  var i = U.indexOf("appendMsg('user', msg)");
  var head = i > 0 ? U.slice(Math.max(0, i - 600), i) : '';
  ok('새 턴이 시작되면 앞 턴 큐를 끊는다', /stmReset\(\)/.test(head), head.slice(-120));
})();
/* ⛔ 연달아 부르면 발화 순번이 앞 문장을 끊습니다 — «앞 문장이 끝나면 다음» 이어야 합니다. */
ok('문장 큐가 앞 문장이 끝나기를 기다린다', /_stmChain = _stmChain\.then/.test(U));
ok('speakText 가 끝 콜백을 받는다', /function speakText\(text, btn, row, onDone\)/.test(U));
ok('끝 신호가 안 와도 큐가 멈추지 않는다 (안전망)', /setTimeout\(fin, \d+\)/.test(U));
ok('이미 읽었으면 다시 읽지 않는다', /_stmSpoke && !d\.replaced/.test(U));
ok('답이 바뀌었으면(replaced) 읽던 것을 멈추고 다시 읽는다', /if \(_stmSpoke\) \{ stmReset\(\);[\s\S]{0,80}MangoiTTS\.stop\(\)/.test(U));
/* ⛔ 미리보기 말풍선이 «정본» 말풍선으로 오인되면 안 됩니다(기존 코드가 마지막 .ai-row 를 찾습니다). */
ok('미리보기는 .ai-row 를 쓰지 않는다', /_stmRow\.className = 'msg ai stm-preview'/.test(U));
ok('done 에서 미리보기를 치운다', /_stmRow\.parentNode\.removeChild\(_stmRow\)/.test(U));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
