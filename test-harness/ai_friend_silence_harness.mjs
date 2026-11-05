import { gamesSrc } from './_srcbundle.mjs';
// Execute the real page function and server route with local doubles. No live AI/DB calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { sttRejectReason } from '../cloudflare-deploy/src/stt-confidence.ts';
import { isSttRepeatLoop } from '../cloudflare-deploy/src/stt-loop.ts';
const read = p => readFileSync(new URL('../cloudflare-deploy/' + p, import.meta.url), 'utf8');
let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS ' + name); }
const hallucination = 'Thank you very much for watching.';
check('empty recognition is terminal', () => assert.equal(sttRejectReason({ text: '' }), 'no_speech'));
check('VAD found zero speech', () => assert.equal(sttRejectReason({ text: hallucination,
  transcription_info: { duration: 9, duration_after_vad: 0 } }), 'no_speech'));
check('weak no-speech segment is rejected', () => assert.equal(sttRejectReason({ text: hallucination,
  segments: [{ text: hallucination, no_speech_prob: .95, avg_logprob: -1.5 }] }), 'no_speech'));
check('uncertain speech is rejected', () => assert.equal(sttRejectReason({ text: 'You',
  segments: [{ text: 'You', avg_logprob: -1.1 }] }), 'low_confidence'));
for (const text of ['Yes.', 'No.', hallucination, 'I like cartoons.']) {
  check('genuine speech survives: ' + text, () => assert.equal(sttRejectReason({ text,
    segments: [{ text, avg_logprob: -.1, no_speech_prob: .01 }] }), null));
}
check('missing metadata is not fabricated silence', () => assert.equal(sttRejectReason({ text: 'Yes.' }), null));

// Execute the existing audio detector with PCM: silence, stationary noise, click, quiet short answer.
const audio = { window: {} }; vm.createContext(audio);
vm.runInContext(read('public/js/voice-has-speech.js'), audio);
const pcm = (frames, amplitude) => {
  const x = new Float32Array(16000);
  for (let f = 0; f < frames; f++) for (let j = 0; j < 320; j++)
    x[3200 + f * 320 + j] = amplitude * Math.sin(j * .19);
  return x;
};
check('PCM silence rejected', () => assert.equal(audio.window.MangoiVoiceCheck.inSamples(pcm(0, 0), 16000), false));
check('PCM click rejected', () => assert.equal(audio.window.MangoiVoiceCheck.inSamples(pcm(1, .8), 16000), false));
check('PCM quiet short answer retained', () => assert.equal(audio.window.MangoiVoiceCheck.inSamples(pcm(10, .02), 16000), true));
check('PCM stationary noise rejected', () => assert.equal(audio.window.MangoiVoiceCheck.inSamples(new Float32Array(16000).fill(.03), 16000), false));

const page = read('public/ai-friend.html');
const micCode = page.slice(page.indexOf('    async function friendRecordVoice(opts)'), page.indexOf('    function toggleMic()', page.indexOf('    async function micViaWhisper(auto)')));
async function micCase({ voice = true, auto = true, text = hallucination, late = '', override = false } = {}) {
  const sent = [], hints = [], requests = []; let checks = 0;
  const ctx = { Promise, String, _friendMicSeq: 0, _whisperOn: false, _recognizing: false,
    _lastRecBlob: null, _pendingVoice: false, document: { getElementById: () => ({ value: '' }) },
    updateMicUI() {}, stopSpeakingNow() {}, isEn: () => false,
    micHint: msg => hints.push(msg), sendMsg: () => sent.push('sent'),
    FriendAutoTalk: { micState() {}, empty: reason => hints.push(reason), pause() {} },
    MangoiVoiceCheck: { blobHasVoice: async () => { checks++; if (late === 'check') ctx._friendMicSeq++; return voice; } },
    fetch: async (_url, opts) => { requests.push(opts); if (late === 'network') ctx._friendMicSeq++; return { ok: true, json: async () => ({ ok: true, text }) }; },
    MangoiVoice: { supported: () => true, record: async opts => {
      opts.onAudio({}); opts.onState('speaking', {}); // loud click falsely marked as speech
      if (override) return text;
      const fields = new Map(); const d = await opts.transcribe({ append: (k, v) => fields.set(k, v) });
      if (requests.length) assert.equal(fields.get('strict'), '1');
      return d?.text || '';
    } }
  };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(micCode, ctx);
  await ctx.micViaWhisper(auto);
  return { sent, requests, hints, checks, ctx };
}
for (const auto of [true, false]) for (const voice of [false, null]) {
  const r = await micCase({ auto, voice });
  check(`no speech/unknown cannot upload or send (auto=${auto}, voice=${voice})`, () => {
    assert.equal(r.requests.length, 0); assert.equal(r.sent.length, 0); assert.ok(r.hints.length);
  });
}
for (const auto of [true, false]) {
  const r = await micCase({ auto, text: 'Yes.' });
  check(`short valid answer sent once (auto=${auto})`, () => {
    assert.equal(r.requests.length, 1); assert.equal(r.sent.length, 1); assert.equal(r.checks, 1);
  });
}
for (const late of ['check', 'network']) {
  const r = await micCase({ late });
  check('canceled result never submits: ' + late, () => assert.equal(r.sent.length, 0));
}
const overridden = await micCase({ override: true, voice: false });
check('submission boundary catches recorder override', () => assert.equal(overridden.sent.length, 0));
const empty = await micCase({ text: '' });
check('server rejection creates no user turn', () => assert.equal(empty.sent.length, 0));
const face = read('public/js/aifriend-facetalk.js');
const faceListen = face.slice(face.indexOf('  async function listen()'), face.indexOf('  async function send('));
for (const voice of [false, true, null]) {
  const r = await micCase({ voice, text: 'Yes.' });
  r.sent.length = 0; r.requests.length = 0;
  Object.assign(r.ctx, { turnSeq: 0, active: true, silentRuns: 1, waitQuiet: async () => true,
    setState() {}, showPauseNote() {}, showStuck() {}, clearHelp() {}, open: false,
    root: { classList: { add() {} } }, noteEl: { textContent: '' }, chipsEl: { innerHTML: '' },
    send: async text => r.sent.push(text) });
  vm.runInContext(faceListen, r.ctx);
  await r.ctx.listen();
  check('face conversation uses same acoustic guard voice=' + voice, () => {
    assert.equal(r.sent.length, voice === true ? 1 : 0);
    assert.equal(r.requests.length, voice === true ? 1 : 0);
  });
}

const api = gamesSrc();
const start = api.indexOf("    if (method === 'POST' && path === '/api/voice/transcribe')");
const end = api.indexOf('    // ── POST /api/voice/coach', start);
const route = new Function('request', 'env', 'json', 'sttRejectReason', 'isSttRepeatLoop', 'assessPronunciation',
  stripTypeScriptTypes(`function run(){return (async () => {const method='POST', path='/api/voice/transcribe', url=new URL(request.url); ${api.slice(start, end)} })()} `) + 'return run();');
async function serverCase(result, { strict = true, fail = false } = {}) {
  const calls = []; const fd = new FormData(); fd.append('audio', new Blob([new Uint8Array(2000)]), 'speech.webm');
  fd.append('lang', 'en'); if (strict) fd.append('strict', '1');
  const req = new Request('https://local.invalid/api/voice/transcribe', { method: 'POST', body: fd });
  const r = await route(req, { AI: { run: async (model) => {
    calls.push(model); if (fail && model.includes('turbo')) throw new Error('offline');
    return result;
  } } }, (body, status = 200) => ({ body, status }), sttRejectReason, isSttRepeatLoop, async () => null);
  return { ...r, calls };
}
for (const strict of [true, false]) {
  const r = await serverCase({ text: '' }, { strict });
  check('empty turbo never invokes fallback strict=' + strict, () => {
    assert.equal(r.calls.length, 1); assert.equal(r.body.text, ''); assert.equal(r.body.dropped, 'no_speech');
  });
}
const weak = await serverCase({ text: hallucination, segments: [{ text: hallucination, avg_logprob: -2, no_speech_prob: .9 }] });
check('route actually applies confidence guard', () => { assert.equal(weak.body.text, ''); assert.equal(weak.calls.length, 1); });
const coach = await serverCase({ text: 'Hello', segments: [{ text: 'Hello', avg_logprob: -2 }] }, { strict: false });
check('pronunciation coach retains weak speech for scoring', () => assert.equal(coach.body.text, 'Hello'));
const error = await serverCase({}, { fail: true });
check('strict service failure never invokes base model', () => { assert.equal(error.status, 503); assert.equal(error.calls.length, 1); });
const fallback = await serverCase({ text: 'Yes.' }, { fail: true, strict: false });
check('non-chat fallback remains available on actual failure', () => { assert.equal(fallback.body.text, 'Yes.'); assert.equal(fallback.calls.length, 2); });
const valid = await serverCase({ text: 'Yes.', segments: [{ text: 'Yes.', avg_logprob: -.1 }] });
check('valid server reply preserved', () => assert.equal(valid.body.text, 'Yes.'));
console.log(`PASS ${count} / FAIL 0`);
