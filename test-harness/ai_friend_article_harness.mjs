// Execute the production speech path: standard spelling must reach TTS without
// modifying lesson text, voice selection, rate or completion callbacks.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ui = readFileSync(new URL('../cloudflare-deploy/public/ai-friend.html', import.meta.url), 'utf8');
const begin = ui.indexOf('    function speakText(');
const end = ui.indexOf('    /* ══ 🎤 말하기', begin);
assert.ok(begin >= 0 && end > begin, 'production speech functions found');
let calls = [], completed = 0, selectedSpeaker = '';
const tts = { setLang() {}, setSpeaker(s) { selectedSpeaker = s; },
  speak(text, rate, done) { calls.push({ text, rate }); done(); } };
const ctx = vm.createContext({
  window: { MangoiTTS: tts }, MangoiTTS: tts,
  document: { querySelectorAll: () => [] },
  friendRatePreference: { loaded: true }, _ttsLangSet: false,
  personNow: () => 'emma', speakerFor: () => 'asteria',
  rateFor: (_, rate) => rate, currentRate: 0.9,
});
vm.runInContext(ui.slice(begin, end), ctx);
const cases = [
  ['I hit a home run.', 'I hit a home run.'],
  ['You can say... "I hit a home run." Can you say it with me?', 'You can say... "I hit a home run." Can you say it with me?'],
  ['A home run! I hit a home run!', 'A home run! I hit a home run!'],
  ['I hit a home runaway.', 'I hit a home runaway.'],
  ['The letter a. Say "a". I got an A. Plan A is ready.', 'The letter a. Say "a". I got an A. Plan A is ready.'],
  ['I have a dog and a cat.', 'I have a dog and a cat.'],
];
for (const [original, expected] of cases) {
  const row = { textContent: original, classList: { add() {}, remove() {} } };
  ctx.speakText(original, null, row, () => completed++);
  assert.equal(calls.at(-1).text, expected);
  assert.equal(calls.at(-1).rate, 0.9);
  assert.equal(selectedSpeaker, 'asteria');
  assert.equal(row.textContent, original, 'visible lesson stays unchanged');
}
// Both streamed sentences and replay call this same entry point; repeated replay
// must preserve the same standard spelling on every request.
ctx.speakText(cases[0][0], null, null, () => completed++);
assert.equal(calls.at(-1).text, cases[0][1]);
assert.equal(completed, cases.length + 1);
console.log(`PASS ${cases.length + 1} speech executions: article, alphabet, cache input, voice, rate, callbacks and visible text`);

// Speaking already uses standard spelling; preserve correction quotes and repeats.
const warmup = readFileSync(new URL('../cloudflare-deploy/public/warmup.html', import.meta.url), 'utf8');
const speechStart = warmup.indexOf('function _speechText(s){');
const speechEnd = warmup.indexOf('\n}', speechStart) + 2;
assert.ok(speechStart >= 0 && speechEnd > speechStart);
const warmCtx = vm.createContext({});
vm.runInContext(warmup.slice(speechStart, speechEnd), warmCtx);
const correction = 'You can say... "I hit a home run." "I hit a home run." "I hit a home run." Can you say it with me?';
for (const input of [...cases.map(c => c[0]), correction]) {
  ctx.speakText(input, null, null);
  assert.equal(calls.at(-1).text, input, 'friend keeps standard spelling');
  assert.equal(warmCtx._speechText(input), input, 'speaking keeps standard spelling and quote boundaries');
}
console.log('PASS both speech inputs: standard spelling and focused correction 1 + 3');
