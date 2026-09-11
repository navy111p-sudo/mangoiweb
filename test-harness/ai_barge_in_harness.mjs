/* B — AI 가 말하는 중에 학생이 말을 걸면 멈추는가 (웜업 · A.i 친구하기).
 *
 * [왜 있나 — 2026-09-11]
 * 지금까지 대화는 «차례를 기다리는 것» 이었습니다. 학생 121명 중 41명(34%)이 1턴만 하고
 * 나가는데(D1 실측), 하고 싶은 말이 있어도 AI 가 말을 마칠 때까지 못 거는 것도 그 이유일 수 있습니다.
 *
 * 🔴 A-1(문장 큐)이 이것을 깨뜨릴 수 있습니다 — MangoiTTS.stop() «만» 부르면 큐가 다음 문장을
 *    이어 재생해 «멈춘 것처럼 보였다가 곧 다시 말합니다». 정지는 한 곳으로 모여야 합니다.
 * ⛔ 음성으로 «자동» 감지(VAD)하지 않습니다 — 스피커로 들으면 AI 가 자기 말에 끼어듭니다
 *    (2026-07-23 「음성인식이 AI 말을 받아 적던」 사고와 같은 뿌리). 학생의 «몸짓» 에만 반응합니다.
 */
import { readFileSync } from 'node:fs';

const AIF = readFileSync(new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url), 'utf8');
const WUP = readFileSync(new URL('../cloudflare-deploy/public/warmup.html', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, e = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e ? ' — ' + e : '')); } };
function strip(t) {
  let o = '', b = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (b) { const e = l.indexOf('*/'); if (e < 0) { o += '\n'; continue; } l = l.slice(e + 2); b = false; }
    for (;;) { const s = l.indexOf('/*'); if (s < 0) break;
      const e = l.indexOf('*/', s + 2);
      if (e < 0) { l = l.slice(0, s); b = true; break; }
      l = l.slice(0, s) + l.slice(e + 2); }
    o += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return o;
}
/** `(function NAME(){` 부터 짝이 맞는 `})();` 까지 */
function iife(src, name) {
  const i = src.indexOf('(function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

const A = strip(AIF), W = strip(WUP);

console.log('\n① A.i 친구하기 — 정지가 «한 곳» 인가');
ok('정지 정본 stopSpeakingNow 가 있다', /function stopSpeakingNow\(\)/.test(A));
/* 🔴 A-1 이 만든 위험 — 큐를 안 끊으면 다음 문장이 이어집니다. */
const stopBody = (() => { const i = A.indexOf('function stopSpeakingNow()'); if (i < 0) return '';
  const o = A.indexOf('{', i); let d = 0;
  for (let k = o; k < A.length; k++) { if (A[k] === '{') d++; else if (A[k] === '}') { d--; if (!d) return A.slice(i, k + 1); } } return ''; })();
ok('정지가 문장 큐(stmReset)를 «함께» 끊는다', /stmReset\(\)/.test(stopBody), stopBody.slice(0, 80));
ok('정지가 TTS 를 멈춘다', /MangoiTTS\.stop\(\)/.test(stopBody));
ok('정지가 아바타 입도 멈춘다', /MangoAvatar\.plainStop\(\)/.test(stopBody));
/* 마이크로 말을 걸면 그 정본을 지나야 합니다 — 따로 멈추면 큐가 남습니다. */
const micIdx = A.indexOf('async function micViaWhisper()');
const micHead = micIdx > 0 ? A.slice(micIdx, micIdx + 900) : '';
ok('마이크를 열 때 그 정본을 부른다', /stopSpeakingNow\(\)/.test(micHead));
ok('마이크 경로가 «따로» 멈추지 않는다 (큐가 남지 않게)',
   !/MangoiTTS\.stop\(\)/.test(micHead.replace(/stopSpeakingNow\(\);/g, '')), '따로 멈추는 줄이 남아 있습니다');

console.log('\n② 타이핑으로도 끼어들 수 있는가 — 핸들러를 실제로 돌린다');

for (const [label, src, fnName, stopName] of [
  ['A.i 친구하기', AIF, 'armTypingBarge', 'stopSpeakingNow'],
  ['웜업', WUP, 'armWarmupTypingBarge', '_stopSpeak'],
]) {
  const body = iife(src, fnName);
  ok(`${label} — 타이핑 리스너를 오려 냈다 (전제)`, body.length > 150, String(body.length));
  if (!body) continue;
  let stops = 0, listeners = {};
  const el = {
    value: '', _bargeBound: false, _bargeDone: false,
    addEventListener: (t, f) => { listeners[t] = f; },
  };
  /* ⚠️ iife() 는 «닫는 중괄호» 까지만 줍니다 — 즉시실행 꼬리 )() 를 붙여야 실제로 돕니다. */
  const fn = new Function('document', stopName, body + ')();');
  fn({ getElementById: () => el }, () => { stops++; });
  ok(`${label} — input 이벤트를 듣는다`, typeof listeners.input === 'function');
  if (typeof listeners.input !== 'function') continue;

  /* 지우는 것은 «말을 거는 것» 이 아닙니다. */
  el.value = ''; listeners.input();
  ok(`${label} — 빈 값에는 안 멈춘다`, stops === 0, String(stops));
  /* 글자를 치면 멈춥니다. */
  el.value = 'H'; listeners.input();
  ok(`${label} — 글자를 치면 멈춘다`, stops === 1, String(stops));
  /* ⚠️ 매 글자마다 부르면 발화 순번만 계속 오릅니다 — 한 번이어야 합니다. */
  el.value = 'He'; listeners.input();
  el.value = 'Hel'; listeners.input();
  ok(`${label} — 한 턴에 «한 번만» 멈춘다`, stops === 1, String(stops));
  /* 보낸 뒤에는 다음 답변에 다시 끼어들 수 있어야 합니다. */
  el._bargeDone = false;
  el.value = 'Next'; listeners.input();
  ok(`${label} — 보낸 뒤 다시 끼어들 수 있다`, stops === 2, String(stops));
}

console.log('\n③ 웜업 — 마이크 경로는 이미 멈추고 있는가 (건드리지 않았다)');
ok('마이크를 켤 때 _stopSpeak 을 부른다', /_stopSpeak\(\);\s*\n?\s*\/\/ AI 낭독/.test(WUP) || /_stopSpeak\(\)/.test(W));
ok('보낸 뒤 표시를 푼다 (다음 답변에도 끼어들기)', /_bargeDone = false/.test(W));

console.log('\n④ ⛔ 음성 «자동» 감지로 끼어들지 않는다 (에코 사고 방지)');
/* AI 가 스피커로 나오는데 마이크가 그것을 듣고 «학생이 말했다» 로 오인하면
   AI 가 자기 말에 끼어듭니다. 2026-07-23 에 그 뿌리의 사고가 있었습니다. */
for (const [label, src] of [['A.i 친구하기', A], ['웜업', W]]) {
  ok(`${label} — 상시 음량 감시로 끼어들지 않는다`,
     !/createAnalyser\(\)[\s\S]{0,400}(stopSpeakingNow|_stopSpeak)\(/.test(src));
  ok(`${label} — 상주 타이머로 끼어들지 않는다`,
     !/setInterval\([^)]*\)[\s\S]{0,200}(stopSpeakingNow|_stopSpeak)\(/.test(src));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
