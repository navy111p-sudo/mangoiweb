/* C — 두 화면의 음성 입력 (웜업 · A.i 친구하기).
 *
 * [왜 있나 — 2026-09-11]
 * 같은 말을 해도 화면마다 다르게 들립니다. 웜업은 브라우저 인식(즉시 자막), A.i 친구하기는
 * 서버 Whisper(말이 끝나야)입니다. 그런데 그 갈라짐은 «사고» 가 아니라 결정입니다 —
 * 2026-07-26 직원 피드백(억양 섞인 아이 발음을 브라우저가 "I like dog"→"talk" 로 오인식)으로
 * A.i 친구하기가 «사장님 승인» 을 받아 서버 Whisper 로 바꿨습니다.
 *
 * ⛔ 그래서 «AI 친구하기에 브라우저 인식을 되살리기» 로 통일하면 안 됩니다 — 그 결정을
 *    되돌리는 일입니다. 이 검사가 그것을 못 박습니다.
 * ✅ 대신 웜업이 «빈손» 으로 끝날 때 서버 Whisper 로 한 번 더 듣습니다 — 되던 것(실시간 자막)을
 *    안 깨고, 지금까지 「🎤 를 다시 누르세요」 로 끝나 학생이 그냥 그만두던 경우를 구합니다.
 */
import { readFileSync } from 'node:fs';

const WUP = readFileSync(new URL('../cloudflare-deploy/public/warmup.html', import.meta.url), 'utf8');
const AIF = readFileSync(new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url), 'utf8');

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
function fnBody(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const o = src.indexOf('{', i);
  let d = 0;
  for (let k = o; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}

console.log('\n① 웜업 — «빈손» 이면 서버 Whisper 로 한 번 더 (실제로 돌린다)');

const body = fnBody(WUP, 'function _finishMic()');
ok('_finishMic 을 오려 냈다 (전제)', body.length > 300, String(body.length));

/** 가짜 환경으로 _finishMic 을 돌려 «무엇이 불렸는가» 를 봅니다. */
function runFinish({ said, stopWanted, retried, whisperOk = true }) {
  const calls = { send: 0, whisper: 0, msgs: [] };
  const inp = { value: '' };
  const env = {
    setMicState: () => {},
    _tidySpeech: (x) => x, _mergeSpeech: (a, b) => (a || '') + (b || ''),
    document: { getElementById: () => inp },
    sendMsg: () => { calls.send++; },
    addMsg: (t) => { calls.msgs.push(t); },
    micViaWhisper: () => { calls.whisper++; if (!whisperOk) throw new Error('no mic'); },
    window: { MangoiVoice: { supported: () => true } },
    MangoiVoice: { supported: () => true },
  };
  const src = `
    var _micBase = ${JSON.stringify(said || '')}, _micSess = '';
    var _micStopWanted = ${!!stopWanted}, _micWhisperRetried = ${!!retried};
    ${body}
    _finishMic();
    return { calls, retried: _micWhisperRetried };
  `;
  const f = new Function('setMicState', '_tidySpeech', '_mergeSpeech', 'document', 'sendMsg',
                         'addMsg', 'micViaWhisper', 'window', 'MangoiVoice', 'calls', src);
  const out = f(env.setMicState, env._tidySpeech, env._mergeSpeech, env.document, env.sendMsg,
                env.addMsg, env.micViaWhisper, env.window, env.MangoiVoice, calls);
  return { ...out, calls };
}

if (body) {
  const r1 = runFinish({ said: 'I like dogs' });
  ok('들었으면 그대로 보낸다 (되던 것을 안 깬다)', r1.calls.send === 1 && r1.calls.whisper === 0,
     JSON.stringify(r1.calls));
  ok('들었으면 «한 번 더 듣기» 표시를 푼다', r1.retried === false);

  const r2 = runFinish({ said: '' });
  ok('빈손이면 서버 Whisper 로 다시 듣는다', r2.calls.whisper === 1, JSON.stringify(r2.calls));
  ok('그때 학생에게 말해 준다 (조용히 하지 않는다)', r2.calls.msgs.length === 1, JSON.stringify(r2.calls.msgs));
  ok('다시 들을 때 옛 문구(«다시 누르세요»)를 띄우지 않는다', !/다시 누르/.test(r2.calls.msgs.join('')));

  /* ⚠️ 두 번 연속 빈손이면 그냥 안내 — 계속 녹음을 켜면 더 나쁩니다. */
  const r3 = runFinish({ said: '', retried: true });
  ok('두 번째 빈손에는 다시 듣지 않는다', r3.calls.whisper === 0, JSON.stringify(r3.calls));
  ok('그때는 옛 안내를 띄운다', /다시 누르/.test(r3.calls.msgs.join('')));

  /* ⚠️ 학생이 스스로 멈춘 것은 «빈손» 이 아니라 «그만» 입니다. */
  const r4 = runFinish({ said: '', stopWanted: true });
  ok('학생이 스스로 멈추면 다시 듣지 않는다', r4.calls.whisper === 0 && r4.calls.msgs.length === 0,
     JSON.stringify(r4.calls));

  /* Whisper 가 못 켜져도 학생은 무엇을 할지 알아야 합니다. */
  const r5 = runFinish({ said: '', whisperOk: false });
  ok('Whisper 가 실패하면 옛 안내로 떨어진다', /다시 누르/.test(r5.calls.msgs.join('')), JSON.stringify(r5.calls.msgs));
}

console.log('\n② 새 세션에서는 다시 쓸 수 있는가');
const W = strip(WUP);
ok('마이크를 새로 켜면 표시를 푼다', /_micStopWanted=false;\s*\n\s*_micWhisperRetried=false/.test(W));

console.log('\n③ ⛔ 되돌리면 안 되는 것 — 2026-07-26 사장님 승인 결정');
const A = strip(AIF);
/* A.i 친구하기는 «항상» 서버 Whisper 입니다. 브라우저 인식을 되살리면 그 결정이 뒤집힙니다. */
ok('A.i 친구하기에 브라우저 음성인식을 되살리지 않았다',
   !/new\s+(webkit)?SpeechRecognition\s*\(/.test(A) && !/window\.webkitSpeechRecognition\s*\)/.test(A));
ok('A.i 친구하기는 서버 Whisper 경로를 그대로 쓴다', /MangoiVoice\.record\(/.test(A));
/* 웜업의 실시간 자막(브라우저 인식)은 그대로 둡니다 — 대체가 아니라 «폴백» 입니다. */
ok('웜업의 브라우저 인식을 대체하지 않았다', /_recog\.onresult\s*=/.test(W));
ok('웜업은 미지원 기기에서 여전히 Whisper 로 간다', /if\(!sttSupported\(\)\)\{\s*micViaWhisper\(\)/.test(W));

console.log('\n④ 두 화면이 같은 정본을 쓴다');
for (const [label, src] of [['웜업', WUP], ['A.i 친구하기', AIF]])
  ok(`${label} — 공용 음성 입력 모듈을 싣는다`, /mangoi-voice-input\.js/.test(src));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
