/**
 * 🎤 음성 입력 폴백 회귀 하니스 (2026-07-23)
 *
 * 제보: "웜업·AI친구 마이크가 계속 말썽이다."
 * 재점검에서 나온 **아직 안 고쳐졌던 두 가지**를 고정한다.
 *
 *  ① 브라우저 음성인식이 **없는 환경**(앱 WebView·카카오 인앱 브라우저·구형 iOS)에서
 *     "이 브라우저는 지원하지 않아요" 로 끝나 마이크를 아예 못 썼다.
 *     → js/mangoi-voice-input.js (녹음 → 서버 Whisper 전사) 로 폴백.
 *  ② 영어 낭독은 **클라우드 TTS라 <audio> 로 재생**되는데 화면들이 speechSynthesis.cancel()
 *     만 불러서, AI 목소리가 나오는 채로 마이크가 열렸다 → 음성인식이 AI 목소리를 받아 적음.
 *     → MangoiTTS.stop() 신설 + 마이크 켜기 전 호출.
 *
 * 실행: node test-harness/voice_input_fallback_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

/* ── 가짜 브라우저에서 mangoi-voice-input.js 를 원문 그대로 실행 ───────────── */
function loadVoiceModule(opts) {
  opts = opts || {};
  const state = { states: [], posted: null, tracksStopped: 0 };
  const timers = [];
  const fireAll = () => { const t = timers.splice(0); t.forEach(x => x.cb()); };

  const recType = opts.iosLike ? 'audio/mp4' : 'audio/webm';
  class FakeMediaRecorder {
    constructor(stream, o) { this.stream = stream; this.mimeType = (o && o.mimeType) || ''; state.mr = this; state.usedMime = this.mimeType; }
    start() { this.started = true; }
    stop() {
      this.stopped = true;
      if (this.ondataavailable) this.ondataavailable({ data: { size: opts.chunkSize == null ? 5000 : opts.chunkSize, type: recType } });
      if (this.onstop) this.onstop();
    }
  }
  class FakeBlob {
    constructor(parts) { this.size = (parts || []).reduce((a, p) => a + (p.size || 0), 0); this.type = recType; }
  }
  class FakeFormData { constructor(){ this.f = {}; } append(k, v, name){ this.f[k] = v; this.names = this.names || {}; this.names[k] = name; } }

  const sandbox = {
    console,
    navigator: {
      mediaDevices: opts.noMediaDevices ? undefined : {
        getUserMedia: () => opts.denied
          ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
          : Promise.resolve({ getTracks: () => [{ stop(){ state.tracksStopped++; } }] }),
      },
    },
    MediaRecorder: opts.noRecorder ? undefined : Object.assign(FakeMediaRecorder, {
      // 지원 형식을 브라우저별로 흉내 (iOS 사파리는 webm 을 못 만들고 mp4 만 된다)
      isTypeSupported: (t) => (opts.iosLike ? /mp4|aac/i.test(t) : /webm/i.test(t)),
    }),
    Blob: FakeBlob, FormData: FakeFormData,
    setTimeout: (cb, ms) => { const id = timers.length + 1; timers.push({ id, cb, ms }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    fetch: (url, init) => {
      state.posted = { url, init };
      if (opts.serverFail) return Promise.resolve({ ok: false, json: () => Promise.resolve(null) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, text: opts.text || 'I like blue cars' }) });
    },
  };
  sandbox.window = sandbox;                     // 모듈이 window.MediaRecorder 등을 본다
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-voice-input.js'), 'utf8'), sandbox);
  return { V: sandbox.MangoiVoice, state, fireAll };
}

/* ══ 1. 녹음 → Whisper 전사 정상 흐름 ══ */
console.log('\n▶ mangoi-voice-input.js — 녹음 후 서버 전사');
{
  const { V, state, fireAll } = loadVoiceModule({});
  check('이 환경에서 녹음 가능', V.supported() === true);
  const p = V.record({ onState: (s) => state.states.push(s) });
  await new Promise(r => setImmediate(r));      // getUserMedia 프라미스 진행
  check('마이크 준비·대기 상태를 알려줌', state.states.includes('ready') && state.states.includes('waiting'),
        JSON.stringify(state.states));
  fireAll();                                    // 안전 상한 타이머 → 녹음 종료
  const text = await p;
  check('전사 텍스트를 돌려줌', text === 'I like blue cars', `실제="${text}"`);
  check('/api/voice/transcribe 로 보냄', state.posted && state.posted.url === '/api/voice/transcribe',
        JSON.stringify(state.posted && state.posted.url));
  check('전사 중 상태를 알려줌', state.states.includes('thinking'), JSON.stringify(state.states));
  check('마이크 트랙을 반드시 반납', state.tracksStopped === 1, '반납=' + state.tracksStopped);
}

/* ══ 1-B. 🍎 iOS 사파리 — webm 을 못 만든다. 형식과 파일 이름이 맞아야 서버가 오인하지 않는다 ══ */
console.log('\n▶ iOS 사파리(webm 불가) 대응');
{
  const { V, state, fireAll } = loadVoiceModule({ iosLike: true });
  const p = V.record({ onState: () => {} });
  await new Promise(r => setImmediate(r));
  fireAll();
  const text = await p;
  check('지원되는 형식(mp4)으로 녹음', /mp4|aac/i.test(state.usedMime || ''), 'mime=' + state.usedMime);
  check('전사 성공', text === 'I like blue cars', `실제="${text}"`);
  const name = state.posted && state.posted.init && state.posted.init.body
             && state.posted.init.body.names && state.posted.init.body.names.audio;
  check('파일 이름을 실제 형식에 맞춤(.webm 로 오인 전송 안 함)', /\.m4a$/.test(name || ''), '이름=' + name);
}
{
  const { V, state, fireAll } = loadVoiceModule({});      // 일반(크롬/안드로이드)
  const p = V.record({ onState: () => {} });
  await new Promise(r => setImmediate(r));
  fireAll();
  await p;
  const name = state.posted && state.posted.init && state.posted.init.body
             && state.posted.init.body.names && state.posted.init.body.names.audio;
  check('크롬은 그대로 webm 으로 전송', /\.webm$/.test(name || ''), '이름=' + name);
  check('크롬은 webm 형식 선택', /webm/i.test(state.usedMime || ''), 'mime=' + state.usedMime);
}

/* ══ 1-C. ⏹ 는 언제 눌러도 들어야 한다 ══
   stop/cancel 을 getUserMedia 이후에 붙이면, **마이크 권한 대기 중에 누른 ⏹ 가 무시**되고
   버튼이 '듣는 중'에 굳는다(2026-07-23 재점검에서 발견). */
console.log('\n▶ ⏹ 반응성 (권한 대기 중 포함)');
{
  const { V, state } = loadVoiceModule({});
  const p = V.record({ onState: () => {} });
  V.stop();                                     // 아직 스트림도 못 받은 시점에 ⏹
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const t = await p;
  check('권한 대기 중 ⏹ → 녹음기가 실제로 멈춤', !!(state.mr && state.mr.stopped), '녹음기가 계속 돌고 있음');
  check('멈춘 뒤에도 지금까지 녹음분으로 전사', t === 'I like blue cars', `실제="${t}"`);
  check('마이크 트랙 반납', state.tracksStopped === 1, '반납=' + state.tracksStopped);
}
{
  const { V, state } = loadVoiceModule({});
  const p = V.record({ onState: () => {} });
  V.cancel();                                   // 취소는 전사도 하지 않는다
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const t = await p;
  check('취소 → 빈 결과', t === '');
  check('취소 시 서버를 부르지 않음', state.posted === null);
}

/* ══ 2. 실패 상황을 조용히 넘기지 않는가 ══ */
console.log('\n▶ 실패 상황 안내');
{
  const { V, state } = loadVoiceModule({ denied: true });
  const p = V.record({ onState: (s, i) => state.states.push(s + (i && i.reason ? ':' + i.reason : '')) });
  await new Promise(r => setImmediate(r));
  const t = await p;
  check('권한 거부 → error:denied 로 알려줌', state.states.some(s => s === 'error:denied'), JSON.stringify(state.states));
  check('권한 거부 시 빈 문자열 반환(오동작 없음)', t === '');
}
{
  const { V, state, fireAll } = loadVoiceModule({ serverFail: true });
  const p = V.record({ onState: (s, i) => state.states.push(s + (i && i.reason ? ':' + i.reason : '')) });
  await new Promise(r => setImmediate(r));
  fireAll();
  const t = await p;
  check('서버 실패 → error:server 로 알려줌', state.states.some(s => s === 'error:server'), JSON.stringify(state.states));
  check('서버 실패 시 빈 문자열 반환', t === '');
}
{
  const { V, state, fireAll } = loadVoiceModule({ chunkSize: 10 });   // 사실상 무음
  const p = V.record({ onState: (s, i) => state.states.push(s + (i && i.reason ? ':' + i.reason : '')) });
  await new Promise(r => setImmediate(r));
  fireAll();
  const t = await p;
  check('녹음된 소리가 없으면 error:no_audio', state.states.some(s => s === 'error:no_audio'), JSON.stringify(state.states));
  check('무음이면 서버를 부르지 않음(낭비 방지)', state.posted === null);
}
{
  const { V } = loadVoiceModule({ noRecorder: true });
  check('녹음 불가 브라우저 → supported() false', V.supported() === false);
  const t = await V.record({ onState: () => {} });
  check('녹음 불가여도 예외 없이 빈 문자열', t === '');
}

/* ══ 3. 화면 배선 — 음성인식이 없으면 폴백을 타는가 ══ */
console.log('\n▶ 화면 배선 (warmup · ai-friend)');
for (const f of ['warmup.html', 'ai-friend.html']) {
  const h = readFileSync(join(PUB, f), 'utf8');
  check(`${f} — 폴백 모듈을 불러옴`, /mangoi-voice-input\.js/.test(h));
  check(`${f} — 음성인식 미지원이면 micViaWhisper 로`, /micViaWhisper\(\)/.test(h));
  check(`${f} — 더 이상 "지원하지 않아요"로 끝내지 않음`,
        !/지원하지 않아요 😢 크롬/.test(h) && !/is not supported on this browser\. Please use Chrome/.test(h));
  check(`${f} — network 오류 시 녹음 방식으로 전환`, /micViaWhisper\(\); \}, 300\)/.test(h));
  check(`${f} — 마이크 권한 꺼짐 안내 존재`, /마이크 권한이 꺼져 있어요/.test(h));
}

/* ══ 3-B. 고정 시간 녹음 폐기 — 말이 끝날 때까지 듣는가 ══
   micro-quiz·vocab 은 **3초 고정 녹음**이라 아이가 조금만 뜸들이면 말이 통째로 잘렸다. */
console.log('\n▶ 고정 시간 녹음 폐기 (micro-quiz · vocab)');
for (const f of ['micro-quiz.html', 'vocab.html']) {
  const h = readFileSync(join(PUB, f), 'utf8');
  check(`${f} — 3초 고정 녹음이 사라짐`,
        !/setTimeout\(res,\s*3000\)/.test(h), '아직 3초 고정 녹음이 남아 있음');
  check(`${f} — 공용 녹음 모듈 사용(말 끝나면 종료)`, /MangoiVoice\.record\(/.test(h));
  check(`${f} — 폴백 모듈을 불러옴`, /mangoi-voice-input\.js/.test(h));
  check(`${f} — 안내 문구에서 "3초" 제거`, !/말하기 \(3초\)|Tap & speak \(3s\)/.test(h));
}

/* ══ 3-C. 따라 말하기 — AI 낭독 중에 마이크를 켜지 않는가 ══ */
console.log('\n▶ 따라 말하기: AI 목소리를 받아 적지 않게');
for (const f of ['index.html', 'student-games.html']) {
  const h = readFileSync(join(PUB, f), 'utf8');
  check(`${f} — gameSpeak 이 낭독 종료(onend)를 넘겨줌`,
        /window\.gameSpeak = function\(text, onend\)/.test(h));
  check(`${f} — 850ms 고정으로 마이크를 켜지 않음`,
        !/gameSpeak\(text\); \}catch\(_\)\{\}\s*\n\s*var SR=/.test(h));
  check(`${f} — 낭독이 끝난 뒤 시작(_afterSpeak)`, /_afterSpeak/.test(h));
  /* 음성인식이 없는 환경(앱 WebView·카톡 인앱)에서도 발음 채점을 받아야 한다.
     예전 index.html 은 "잘 듣고 따라 말해보세요"만 띄우고 넘어가 채점이 아예 없었다. */
  check(`${f} — 음성인식 없으면 녹음+Whisper 로 채점`, /_shadowViaWhisper\(text, fb\)/.test(h));
  check(`${f} — 폴백 모듈을 불러옴`, /mangoi-voice-input\.js/.test(h));
}

/* ══ 4. 에코 차단 — 마이크 켜기 전에 클라우드 낭독을 끄는가 ══ */
console.log('\n▶ AI 목소리를 마이크가 받아 적지 않게 (에코 차단)');
{
  const js = readFileSync(join(PUB, 'js', 'game-tts.js'), 'utf8');
  check('game-tts.js — stop() 공개', /stop:\s*stop/.test(js));
  check('game-tts.js — stop() 이 <audio> 를 정지', /audioEl\.pause\(\)/.test(js));

  // 실제로 멈추는지 행위로 확인
  const audio = { paused: false, pause(){ this.paused = true; }, currentTime: 5 };
  const sandbox = {
    console, fetch: () => Promise.reject(new Error('no')),
    Audio: function(){ return audio; },
    localStorage: { getItem: () => null, setItem: () => {} },
    speechSynthesis: { cancel(){ sandbox.__canceled = true; }, getVoices: () => [], speak(){} },
    SpeechSynthesisUtterance: function(){ return {}; },
    setTimeout: () => 0, clearTimeout: () => {},
    URL: { createObjectURL: () => 'blob:x' },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  // 재생 중인 상태를 흉내내기 위해 내부 audioEl 을 만든 뒤 stop()
  sandbox.MangoiTTS.speak('hello');             // fetch 실패 → 브라우저 폴백 경로
  if (typeof sandbox.MangoiTTS.stop === 'function') {
    sandbox.MangoiTTS.stop();
    check('MangoiTTS.stop() — speechSynthesis 취소', sandbox.__canceled === true);
  } else {
    check('MangoiTTS.stop() — speechSynthesis 취소', false, 'MangoiTTS.stop 이 없음');
  }

  const af = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');
  check('ai-friend — 마이크 켜기 전 MangoiTTS.stop() 호출', /MangoiTTS\.stop\(\)/.test(af));
  check('ai-friend — game-tts 캐시버스터 인상(?v=3)', /game-tts\.js\?v=3/.test(af));
  const wu = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  check('warmup — 마이크 켤 때 낭독 정지(_stopSpeak)', /function toggleMic\(\)\{[\s\S]{0,200}_stopSpeak\(\)/.test(wu));
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
