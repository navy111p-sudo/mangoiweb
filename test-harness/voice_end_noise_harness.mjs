// voice_end_noise_harness.mjs — 녹음(Whisper) 경로의 «말 끝 판단» 이 주변 소음에 맞춰 가르는가 (2026-11-05)
//
// [왜] js/mangoi-voice-input.js 는 «peak > 8/128 이면 말소리» 라는 고정 문턱만 봤다. 폰의 자동 음량(AGC)이
//      주변 소음을 키우면 소음이 늘 8 을 넘어 «조용함» 이 한 번도 안 와서, 안드로이드 A.i 말하기 «자동으로» 모드가
//      상한(20초)까지 녹음했다(사장님 「휴대폰에서 무조건 빨리」). 이제 최근 3초 «소음 바닥» 에 맞춰 가른다.
// [어떻게] 모듈을 «원문 그대로» 가짜 브라우저에서 돌린다 — 가짜 마이크가 대본대로 소리 크기를 내고, 가짜 시계·타이머·
//      requestAnimationFrame 으로 시간을 흘려 «녹음기가 언제 멈췄는가» 를 답으로 잰다(판정 함수만 따로 부르지 않는다 —
//      그러면 «record() 가 그 판정을 실제로 쓰는가» 를 아무도 안 본다).
// ⚠️ 짝으로 본다: 시끄러운 곳에서 «빨리 멈춘다» 옆에 «말하기 전엔 안 멈춘다»·«말 사이 쉼에는 안 멈춘다»·
//    «조용한 방·작은 목소리는 예전과 같다».
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(process.env.VOICE_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'js', 'mangoi-voice-input.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

const SILENCE = 1600;   // A.i 말하기 «자동으로» 가 넘기는 값(warmup.html micViaWhisper)
const STEP = 20;        // 한 프레임(ms)

/* level(t) = 그 순간 마이크 소리 크기(0~127). 녹음기가 멈춘 시각(ms)과 상태 기록을 돌려준다. */
async function runRecord(level, opts = {}) {
  const clock = { t: 0 };
  const timers = [];   // { id, at, cb }
  let nextId = 1;
  const st = { stopAt: null, states: [] };
  class FakeMR {
    constructor() { st.mr = this; }
    start() {}
    stop() { if (st.stopAt == null) st.stopAt = clock.t; if (this.ondataavailable) this.ondataavailable({ data: { size: 5000, type: 'audio/webm' } }); if (this.onstop) this.onstop(); }
  }
  FakeMR.isTypeSupported = (t) => /webm/i.test(t);
  class FakeAC {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      return {
        fftSize: 0,
        getByteTimeDomainData(buf) { buf.fill(128); buf[0] = 128 + Math.max(0, Math.min(127, Math.round(level(clock.t)))); },
      };
    }
    close() {}
  }
  const sb = {
    console,
    Uint8Array, Math, Promise,
    Date: { now: () => clock.t },
    navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }) } },
    MediaRecorder: FakeMR,
    AudioContext: FakeAC,
    Blob: class { constructor(p) { this.size = (p || []).reduce((a, x) => a + (x.size || 0), 0); this.type = 'audio/webm'; } },
    FormData: class { append() {} },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, text: 'hello' }) }),
    setTimeout: (cb, ms) => { const id = nextId++; timers.push({ id, at: clock.t + (ms || 0), cb }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    requestAnimationFrame: (cb) => { const id = nextId++; timers.push({ id, at: clock.t + STEP, cb }); return id; },
    cancelAnimationFrame: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  const p = sb.MangoiVoice.record({ silenceMs: SILENCE, onState: (s) => st.states.push([s, clock.t]), ...opts });
  await new Promise((r) => setImmediate(r));   // getUserMedia → 녹음 시작
  const END = 25000;
  while (st.stopAt == null && clock.t < END) {
    clock.t += STEP;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > clock.t) break;
      const t = timers.shift();
      try { t.cb(); } catch (e) { st.err = String(e); }
      if (st.stopAt != null) break;
    }
  }
  await p.catch(() => {});
  st.spokeAt = (st.states.find((x) => x[0] === 'speaking') || [])[1];
  return st;
}

/* 대본 부품 */
const wobble = (t, lo, hi) => lo + ((Math.floor(t / STEP) * 7) % (hi - lo + 1));   // lo~hi 를 들쭉날쭉
const speech = (t) => ((t % 300) < 220 ? 45 + ((Math.floor(t / STEP) * 13) % 40) : 6);   // 음절: 0.22초 소리 · 0.08초 틈
const inAny = (t, spans) => spans.some(([a, b]) => t >= a && t < b);

console.log('\n[A] 조용한 방 — 예전과 같다');
{
  const r = await runRecord((t) => (inAny(t, [[500, 2500]]) ? speech(t) : wobble(t, 1, 3)));
  ok('A-1 말이 끝나고 «침묵 시간» 만큼 지나면 멈춘다(약 2.5초 + 1.6초)', r.stopAt != null && Math.abs(r.stopAt - (2500 + SILENCE)) <= 120, r.stopAt);
  ok('A-2 말소리를 들었다고 알린다(speaking)', r.spokeAt != null && r.spokeAt >= 500 && r.spokeAt < 700, r.spokeAt);
  const soft = await runRecord((t) => (inAny(t, [[500, 2500]]) ? wobble(t, 9, 12) : 1));
  ok('A-3 (짝) 작은 목소리(9~12)도 예전처럼 «말소리» 로 듣는다', soft.spokeAt != null && Math.abs(soft.stopAt - (2500 + SILENCE)) <= 120, { spoke: soft.spokeAt, stop: soft.stopAt });
  // 아주 조용한 방(0~1)에 숨소리·딸깍(5~7)만 — 예전 문턱(8) 아래라 «말» 이 아니다. 말로 보면 1.6초 뒤 말하기도 전에 끊긴다.
  const breath = await runRecord((t) => ((t % 1000) < 60 ? 5 + ((t / 20) % 3) : (t % 2)));
  ok('A-4 (짝) 아주 조용한 방의 숨소리·딸깍(8 아래)은 말소리로 안 본다 — «첫 마디 대기»(9초)까지 기다린다', breath.spokeAt == null && breath.stopAt >= 8900 && breath.stopAt <= 9300, { stop: breath.stopAt, spoke: breath.spokeAt });
}

console.log('\n[B] 시끄러운 곳(폰 자동 음량이 키운 소음 10~20) — 이번에 고친 것');
{
  const noise = (t) => wobble(t, 10, 20);
  const r = await runRecord((t) => (inAny(t, [[500, 2500]]) ? speech(t) + 20 : noise(t)));
  ok('B-1 말이 끝나면 «침묵 시간» 안팎에 멈춘다(예전엔 소음이 늘 8 을 넘어 상한 20초까지 녹음)', r.stopAt != null && r.stopAt <= 2500 + SILENCE + 400, r.stopAt);
  ok('B-2 그렇다고 말 끝보다 일찍 멈추지는 않는다', r.stopAt >= 2500 + SILENCE - 200, r.stopAt);
  const quietKid = await runRecord(noise);
  ok('B-3 (짝) 아이가 아직 말을 안 했으면 «첫 마디 대기»(9초)까지 기다린다 — 소음을 말로 보고 곧장 끊지 않는다', quietKid.stopAt >= 8900 && quietKid.stopAt <= 9300 && quietKid.spokeAt == null, { stop: quietKid.stopAt, spoke: quietKid.spokeAt });
  const pause = await runRecord((t) => (inAny(t, [[500, 1500], [2500, 3500]]) ? speech(t) + 20 : noise(t)));
  ok('B-4 (짝) 말 사이 1초 쉼에는 안 멈춘다(두 번째 말까지 듣고 멈춘다)', pause.stopAt >= 3500 + SILENCE - 200 && pause.stopAt <= 3500 + SILENCE + 400, pause.stopAt);
  const long = await runRecord((t) => (inAny(t, [[500, 7500]]) ? speech(t) + 20 : noise(t)));
  ok('B-5 (짝) 7초 동안 길게 말해도 도중에 안 멈춘다(소음 바닥이 말소리로 따라 올라가지 않는다)', long.stopAt >= 7500 + SILENCE - 200 && long.stopAt <= 7500 + SILENCE + 400, long.stopAt);
  // 크게 말하다(0.5~1.5초) 작게 이어 말함(1.5~4초, 25~28 — 소음 10~20 보다는 확실히 크지만 «말소리» 문턱보다는 작다).
  // 그 작은 말소리를 «조용함» 으로 세면 아이가 말하는 도중(약 3.1초)에 끊긴다 — 애매한 크기는 «그대로 둔다».
  const trail = await runRecord((t) => (inAny(t, [[500, 1500]]) ? speech(t) + 20 : inAny(t, [[1500, 4000]]) ? wobble(t, 25, 28) : noise(t)));
  // ⚠️ 작은 말소리가 3초 창보다 길게 이어지면 그 크기가 새 «바닥» 이 되어, 끝난 뒤 침묵 시간보다 조금 일찍(약 1.2초) 멈출 수 있다 — 그건 «말이 끝난 뒤» 라 괜찮다.
  //    묻는 것은 «말하는 도중(4초 전)에 끊지 않는가» 다(애매를 조용으로 세면 약 3.1초에 끊긴다).
  ok('B-6 (짝) 크게 말하다 작게 이어 말하는 동안에는 안 끊는다(애매한 크기는 조용함이 아니다)', trail.stopAt >= 4000 + 400, trail.stopAt);
}

console.log('\n[C] 소음이 중간에 커질 때(TV 를 켬)');
{
  const r = await runRecord((t) => {
    if (inAny(t, [[4000, 6000]])) return speech(t) + 30;
    return t < 2000 ? wobble(t, 2, 4) : wobble(t, 12, 22);
  });
  ok('C-1 3초 안에 새 소음 바닥에 맞춰, 그 뒤 말이 끝나면 멈춘다', r.stopAt != null && r.stopAt <= 6000 + SILENCE + 400 && r.stopAt >= 6000 + SILENCE - 200, r.stopAt);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
