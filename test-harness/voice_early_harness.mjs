// voice_early_harness.mjs — 녹음(Whisper) 경로 «미리 받아쓰기» 가 실제로 빨라지고, 말하는 도중엔 안 끊는가 (2026-11-05)
//
// [왜] 사장님 「듣기 시간과 녹음 시간을 최소화해서 아바타가 가능한 빨리 말하게 — 특히 휴대폰」.
//      안드로이드 «자동으로»·앱(WebView)은 녹음 경로인데, 예전 순서는 «말 끝 → 침묵 1.6초를 다 기다림 → 그제야 업로드·받아쓰기»
//      라서 침묵 대기와 받아쓰기 시간이 «차례로» 더해졌다. js/mangoi-voice-early.js 가 말이 멎으면 먼저 받아 적어 둔다.
// [어떻게] 공용 모듈(js/mangoi-voice-input.js)과 미리 받아쓰기(js/mangoi-voice-early.js)를 «원문 그대로» 가짜 브라우저에서 돌린다 —
//      가짜 마이크가 대본대로 소리 크기를 내고, 가짜 MediaRecorder 가 requestData 에 «지금까지 분량» 을 주고,
//      가짜 서버가 정해진 지연 뒤 받아 적은 글자를 돌려준다. 가짜 시계로 «언제 글자가 손에 들어왔나(=보낼 수 있나)» 를 잰다.
// ⚠️ 짝으로 본다: «빨라졌다» 옆에 «다시 말하면 안 끊는다»·«지난 말을 보내지 않는다»·«iOS(mp4)·다른 화면은 예전 그대로»·
//    «실패하면 예전처럼 다시 올린다»·«업로드 횟수에 상한이 있다».
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public', 'js');
const CORE = readFileSync(process.env.VOICE_SRC || join(PUB, 'mangoi-voice-input.js'), 'utf8');
const EARLY = readFileSync(process.env.EARLY_SRC || join(PUB, 'mangoi-voice-early.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

const SILENCE = 1600;   // A.i 말하기 «자동으로» 가 넘기는 값(warmup.html micViaWhisper)
const STEP = 20;        // 한 프레임(ms)
const BPMS = 4;         // 녹음 1ms 당 바이트(가짜)

/**
 * level(t): 그 순간 마이크 소리 크기. sc: { early(true=감싸기)·cfg·mime·lat(서버 지연 ms)·text(size→글자)·fail(n→true면 n번째 업로드 실패)·
 *   stopAt(⏹ 누르는 시각)·opts(공용 모듈 opts 덧붙이기)·earlyThrows }
 */
async function run(level, sc = {}) {
  const clock = { t: 0 };
  const timers = [];
  let nextId = 1;
  const st = { stopAt: null, doneAt: null, text: null, uploads: [], requestData: 0, states: [] };
  const later = (ms, cb) => { const id = nextId++; timers.push({ id, at: clock.t + (ms || 0), cb }); return id; };
  const mime = sc.mime || 'webm';
  class FakeMR {
    constructor(stream, o) { this.state = 'inactive'; this.type = (o && o.mimeType) || ('audio/' + mime); this.mark = 0; st.mr = this; }
    start() { this.state = 'recording'; this.mark = clock.t; }
    _emit() { const size = Math.max(0, (clock.t - this.mark) * BPMS); this.mark = clock.t; if (this.ondataavailable) this.ondataavailable({ data: { size, type: this.type } }); }
    requestData() { if (this.state !== 'recording') throw new Error('InvalidStateError'); st.requestData++; later(0, () => this._emit()); }
    stop() { if (this.state !== 'recording') return; this.state = 'inactive'; if (st.stopAt == null) st.stopAt = clock.t; later(0, () => { this._emit(); if (this.onstop) this.onstop(); }); }
  }
  FakeMR.isTypeSupported = (t) => new RegExp(mime, 'i').test(t);
  class FakeAC {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() { return { fftSize: 0, getByteTimeDomainData(buf) { buf.fill(128); buf[0] = 128 + Math.max(0, Math.min(127, Math.round(level(clock.t)))); } }; }
    close() {}
  }
  class FakeBlob { constructor(parts, o) { this.size = (parts || []).reduce((a, x) => a + (x.size || 0), 0); this.type = (o && o.type) || ''; } }
  class FakeFD { constructor() { this.f = {}; } append(k, v, name) { this.f[k] = v; if (name) this.f[k + '_name'] = name; } }
  const sb = {
    console, Uint8Array, Math, Promise, Object, String, Number, RegExp, Error,
    Date: { now: () => clock.t },
    navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({ getTracks: () => [{ stop() {} }] }) } },
    MediaRecorder: FakeMR, AudioContext: FakeAC, Blob: FakeBlob, FormData: FakeFD,
    fetch: (url, init) => {
      const n = st.uploads.length + 1, size = init.body.f.audio.size;
      st.uploads.push({ at: clock.t, size, name: init.body.f.audio_name, lang: init.body.f.lang });
      return new Promise((res, rej) => later(sc.lat == null ? 800 : sc.lat, () => {
        if (sc.fail && sc.fail(n) === 'throw') return rej(new Error('network'));
        if (sc.fail && sc.fail(n)) return res({ ok: false, json: () => Promise.resolve(null) });
        res({ ok: true, json: () => Promise.resolve({ ok: true, text: sc.text ? sc.text(size, n) : 'I like pizza.' }) });
      }));
    },
    setTimeout: (cb, ms) => later(ms, cb),
    clearTimeout: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
    requestAnimationFrame: (cb) => later(STEP, cb),
    cancelAnimationFrame: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(CORE, sb);
  vm.runInContext(EARLY, sb);
  if (sc.noPost) delete sb.MangoiVoice.post;   // 옛 공용 모듈(고리·post 없음)을 흉내
  let opts = { silenceMs: SILENCE, lang: 'en', onState: (s) => st.states.push([s, clock.t]), ...(sc.opts || {}) };
  if (sc.earlyThrows) opts.early = () => { throw new Error('boom'); };
  if (sc.early) opts = sb.MangoiVoiceEarly.wrap(opts, sc.cfg || { accept: (t) => !/\b(like|and|to|my|the|i)\.?$/i.test(t) });
  const p = sb.MangoiVoice.record(opts).then((t) => { st.doneAt = clock.t; st.text = t; });
  const flush = () => new Promise((r) => setImmediate(r));
  await flush();
  const END = 40000;
  while (st.doneAt == null && clock.t < END) {
    clock.t += STEP;
    if (sc.stopAt != null && clock.t === sc.stopAt) sb.MangoiVoice.stop();
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > clock.t) break;
      const t = timers.shift();
      try { t.cb(); } catch (e) { st.err = String(e); }
      await flush();
    }
    await flush();
  }
  if (st.doneAt != null) await p.catch(() => {});
  return st;
}

/* 대본 부품 — 조용한 방(1~3) · 음절(0.22초 소리 · 0.08초 틈) */
const room = (t) => 1 + ((Math.floor(t / STEP) * 7) % 3);
const speech = (t) => ((t % 300) < 220 ? 45 + ((Math.floor(t / STEP) * 13) % 40) : 6);
const inAny = (t, spans) => spans.some(([a, b]) => t >= a && t < b);
const say = (...spans) => (t) => (inAny(t, spans) ? speech(t) : room(t));
const near = (v, want, tol = 120) => v != null && Math.abs(v - want) <= tol;
/* 그 구간의 «마지막 소리» 시각 — 음절 틈(0.08초) 때문에 구간 끝과 다를 수 있다(4.5초 구간은 4.42초에 소리가 끝난다) */
const lastSound = (level, b) => { for (let t = b - 1; t > 0; t -= 1) if (level(t) > 20) return t; return 0; };

console.log('\n[A] 기준 — 감싸지 않으면 예전 그대로(다른 화면이 쓰는 경로)');
const base = await run(say([500, 2500]));
ok('A-1 말 끝 + 침묵 1.6초에 멈추고, 그 뒤 업로드 한 번', near(base.stopAt, 2500 + SILENCE) && base.uploads.length === 1, { stop: base.stopAt, up: base.uploads.length });
ok('A-2 글자는 «멈춘 뒤 + 서버 지연(0.8초)» 에 손에 들어온다(이번에 줄이려는 것)', near(base.doneAt, 2500 + SILENCE + 800, 160), base.doneAt);
ok('A-3 (짝) early 를 안 넘긴 화면에서는 녹음 «도중» 에 잘라 받지 않는다(requestData 0번)', base.requestData === 0, base.requestData);
ok('A-4 업로드 파일 이름·언어 힌트는 예전과 같다(speech.webm · lang)', base.uploads[0] && base.uploads[0].name === 'speech.webm' && base.uploads[0].lang === 'en', base.uploads[0]);

console.log('\n[B] 미리 받아쓰기 — 빨라진다');
const fin = await run(say([500, 2500]), { early: true });
ok('B-1 «끝난 말» 이면 침묵 1.6초를 다 안 채우고 끝낸다(말 끝 + 0.5초 + 서버 0.8초 안팎)', near(fin.doneAt, 2500 + 500 + 800, 200), fin.doneAt);
ok('B-2 그만큼 예전보다 1초 넘게 빠르다', fin.doneAt != null && base.doneAt - fin.doneAt >= 1000, { before: base.doneAt, after: fin.doneAt });
ok('B-3 업로드는 한 번뿐(같은 말을 다시 올리지 않는다)', fin.uploads.length === 1, fin.uploads.map((u) => u.at));
ok('B-4 받아 적은 글자를 그대로 준다', fin.text === 'I like pizza.', fin.text);
const unf = await run(say([500, 2500]), { early: true, text: () => 'I like' });
ok('B-5 «덜 끝난 말» 이면 침묵 1.6초는 그대로 기다린다', near(unf.stopAt, 2500 + SILENCE), unf.stopAt);
ok('B-6 그래도 멈추자마자 글자가 있다(미리 받아 둠 — 다시 올리지 않음)', near(unf.doneAt, 2500 + SILENCE, 120) && unf.uploads.length === 1, { done: unf.doneAt, up: unf.uploads.length });
const fast = await run(say([500, 2500]), { early: true, lat: 100 });
ok('B-7 (짝) 서버가 아주 빨라도 «끝난 말» 은 최소 1초는 조용해야 끝낸다(숨 한 번 쉬고 이어 말할 틈)', fast.stopAt >= 2500 + 1000 - 40 && near(fast.stopAt, 2500 + 1000, 120), fast.stopAt);

console.log('\n[C] 짝 — 다시 말하면 안 끊고, 지난 말을 보내지 않는다');
// 0.8초 쉼(미리받기가 시작됨) 뒤 다시 말함 — 결과(3.8초)가 «말하는 도중» 에 도착한다
const sayR = say([500, 2500], [3300, 4500]), endR = lastSound(sayR, 4500);
const resume = await run(sayR, { early: true, text: (size) => (size < 3300 * BPMS ? 'I like pizza.' : 'I like pizza and chicken.') });
ok('C-1 미리 받은 결과가 말하는 도중에 와도 녹음을 끊지 않는다(다시 말한 뒤 1초 넘게 조용해야 끝)', resume.stopAt >= endR + 1000 - 40, { stop: resume.stopAt, endR });
ok('C-2 끝에 보내는 글자는 «다시 말한 것까지» 들어간 것이다(지난 미리받기를 쓰지 않는다)', resume.text === 'I like pizza and chicken.', resume.text);
ok('C-3 다시 멎은 뒤 새로 받는다(업로드 2번 — 두 번째가 더 길다)', resume.uploads.length === 2 && resume.uploads[1].size > resume.uploads[0].size, resume.uploads);
// 결과는 «최소 1초» 전에 왔는데(서버 0.1초), 그 1초가 다 차기 전에 다시 말함
const resume2 = await run(sayR, { early: true, lat: 100, text: (size) => (size < 3300 * BPMS ? 'I like pizza.' : 'I like pizza and chicken.') });
ok('C-4 «1초 기다렸다 끝내기» 가 걸린 사이 다시 말하면 그 끝내기는 취소된다(첫 말 + 1초 = 3.5초에 안 끊김)', resume2.stopAt >= endR + 1000 - 40 && resume2.text === 'I like pizza and chicken.', { stop: resume2.stopAt, endR, text: resume2.text });
// 다시 말한 «뒤» 에 침묵이 다 차서 끝나는 경우 — 끝의 미리받기가 없으면(덜 끝난 말) 전체를 다시 올린다
const resume3 = await run(say([500, 2500], [3300, 3700]), { early: true, lat: 2500, text: (size) => (size < 3300 * BPMS ? 'I like' : 'I like it and') });
ok('C-5 (짝) 끝까지 조용하지 않았던 미리받기는 버리고, 끝의 것(또는 전체)을 쓴다', resume3.text === 'I like it and', { text: resume3.text, up: resume3.uploads.map((u) => u.size) });

console.log('\n[D] 짝 — iOS(mp4)·실패·수동·상한');
const ios = await run(say([500, 2500]), { early: true, mime: 'mp4' });
ok('D-1 iOS(mp4)는 녹음 «도중» 을 잘라 보내지 않는다(예전 그대로 · requestData 0번)', ios.requestData === 0 && ios.uploads.length === 1 && near(ios.stopAt, 2500 + SILENCE), { rd: ios.requestData, up: ios.uploads.length, stop: ios.stopAt });
ok('D-1b iOS 파일 이름은 m4a 그대로', ios.uploads[0] && ios.uploads[0].name === 'speech.m4a', ios.uploads[0]);
const bad = await run(say([500, 2500]), { early: true, fail: (n) => n === 1 });
ok('D-2 미리받기가 실패하면 끝에서 예전처럼 전체를 올린다(글자를 잃지 않음)', bad.uploads.length === 2 && bad.text === 'I like pizza.' && near(bad.stopAt, 2500 + SILENCE), { up: bad.uploads.length, text: bad.text, stop: bad.stopAt });
const net = await run(say([500, 2500]), { early: true, fail: (n) => (n === 1 ? 'throw' : false) });
ok('D-2b 네트워크 오류(예외)여도 같다', net.uploads.length === 2 && net.text === 'I like pizza.', { up: net.uploads.length, text: net.text });
// 수동(⏹): 침묵으로 안 끝남 — 사람이 3.5초에 ⏹. 미리받기(3.0초 시작 → 3.8초 도착)를 그대로 쓴다
const man = await run(say([500, 2500]), { early: true, cfg: {}, stopAt: 3500, opts: { silenceMs: 30000, firstMs: 30000 } });
ok('D-3 수동은 «끝난 말» 이어도 스스로 끝내지 않는다(⏹ 누른 3.5초에 멈춤)', man.stopAt === 3500, man.stopAt);
ok('D-4 ⏹ 뒤 «받아적는 중» 이 줄어든다(⏹ + 0.8초가 아니라 미리받기 도착 3.8초 · 업로드 1번)', near(man.doneAt, 3800, 120) && man.uploads.length === 1, { done: man.doneAt, up: man.uploads.length });
// 길게 쉬며 말하기 — 쉼마다 «처음부터 지금까지» 를 올리므로 상한이 있어야 한다
const spans = []; for (let i = 0; i < 9; i++) spans.push([500 + i * 1500, 500 + i * 1500 + 800]);
const many = await run(say(...spans), { early: true, text: () => 'I like', opts: { maxMs: 30000 } });
const earlyUps = many.uploads.length - 1;
ok('D-5 한 녹음의 미리받기는 5번까지(업로드 = 미리받기 ≤5 + 끝 1)', many.uploads.length <= 6 && many.uploads.length >= 2, many.uploads.length);
ok('D-6 (짝) 상한 뒤에도 녹음은 끝까지 듣는다(마지막 말 뒤 침묵에 멈춤)', near(many.stopAt, spans[8][1] + SILENCE, 160), { stop: many.stopAt, want: spans[8][1] + SILENCE, earlyUps });

console.log('\n[E] 짝 — 고리가 망가져도 녹음은 계속된다');
const thr = await run(say([500, 2500]), { earlyThrows: true });
ok('E-1 early 가 던져도 공용 모듈은 예전처럼 녹음·전사한다', near(thr.stopAt, 2500 + SILENCE) && thr.uploads.length === 1 && thr.text === 'I like pizza.' && !thr.err, { stop: thr.stopAt, up: thr.uploads.length, err: thr.err });
const quiet = await run(room, { early: true });
ok('E-2 아무 말도 안 하면 미리받기를 안 한다(«첫 마디 대기» 9초에 멈춤 · requestData 0번)', quiet.requestData === 0 && quiet.stopAt >= 8900 && quiet.stopAt <= 9300, { rd: quiet.requestData, stop: quiet.stopAt });

const old = await run(say([500, 2500]), { early: true, noPost: true });
ok('E-3 공용 모듈이 옛 판(post 없음)이면 감싸지 않는다 — 예전 그대로 녹음·전사', old.requestData === 0 && old.uploads.length === 1 && old.text === 'I like pizza.' && near(old.stopAt, 2500 + SILENCE), { rd: old.requestData, up: old.uploads.length, text: old.text });

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
