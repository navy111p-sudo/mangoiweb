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

  class FakeMediaRecorder {
    constructor(stream) { this.stream = stream; state.mr = this; }
    start() { this.started = true; }
    stop() {
      this.stopped = true;
      if (this.ondataavailable) this.ondataavailable({ data: { size: opts.chunkSize == null ? 5000 : opts.chunkSize, type: 'audio/webm' } });
      if (this.onstop) this.onstop();
    }
  }
  class FakeBlob {
    constructor(parts) { this.size = (parts || []).reduce((a, p) => a + (p.size || 0), 0); this.type = 'audio/webm'; }
  }
  class FakeFormData { constructor(){ this.f = {}; } append(k, v){ this.f[k] = v; } }

  const sandbox = {
    console,
    navigator: {
      mediaDevices: opts.noMediaDevices ? undefined : {
        getUserMedia: () => opts.denied
          ? Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
          : Promise.resolve({ getTracks: () => [{ stop(){ state.tracksStopped++; } }] }),
      },
    },
    MediaRecorder: opts.noRecorder ? undefined : FakeMediaRecorder,
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
