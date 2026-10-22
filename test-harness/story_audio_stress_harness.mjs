import assert from 'node:assert/strict';
import { setup } from './story_audio_harness.mjs';
const rates = [0, 0.5, 0.8, 0.88, 1, 1.5, 4, NaN];
let seed = 20261022;
function random(n) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }
let scenarios = 0, operations = 0;
for (let run = 0; run < 1000; run++) {
  const env = setup({ voices: run % 2 ? [{ lang: 'en-US' }] : [], deferred: true });
  const { api, media, synth, timers, events } = env;
  let generation = 0, total = 0, callbacks = new Map(), stale = [];
  for (let step = 0; step < 30; step++) {
    const action = random(9);
    if (!media.length || action < 3) {
      generation++;
      const token = generation;
      api.speak('“Hello class!” Why do we practice every day? ' + 'We learn together. '.repeat(random(70)), rates[random(rates.length)], () => {
        assert.equal(generation, token, 'a cancelled utterance must never finish');
        callbacks.set(token, (callbacks.get(token) || 0) + 1);
        assert.equal(callbacks.get(token), 1, 'finish at most once'); total++;
      });
    } else if (action === 3) { generation++; api.stop(); assert.equal(api.isSpeaking(), false); }
    else if (action === 4) { const fn = media[0].onended; if (fn) { stale.push(fn); fn(); } }
    else if (action === 5) { const fn = media[0].onerror; if (fn) { stale.push(fn); fn(); } }
    else if (action === 6) { const u = synth.current; if (u) { stale.push(u.onend); random(2) ? u.onend() : u.onerror(); } }
    else if (action === 7) { const p = media[0].pending?.shift(); if (p) random(2) ? p.resolve() : p.reject({ name: random(2) ? 'NotAllowedError' : 'NotSupportedError' }); }
    else { generation++; events.pagehide(); assert.equal(api.isSpeaking(), false); }
    await Promise.resolve();
    assert.ok(timers.size <= 1, `multiple deadlines in scenario ${run}, step ${step}: ${timers.size}`);
    operations++;
  }
  generation++; api.stop(); const before = total;
  for (const fn of stale) if (fn) fn();
  for (const p of media[0]?.pending || []) p.reject({ name: 'NotAllowedError' });
  if (synth.current) { synth.current.onend(); synth.current.onerror(); }
  await Promise.resolve();
  assert.equal(total, before); assert.equal(api.isSpeaking(), false); assert.equal(timers.size, 0);
  scenarios++;
}
// Repeated taps on the recovery button must not leave a second timeout behind.
{
  const { api, media, notices, timers } = setup({ deferred: true });
  api.speak('Retry rapidly.', 1);
  media[0].pending.shift().reject({ name: 'NotAllowedError' }); await Promise.resolve();
  const retry = notices[0].child.onclick;
  retry(); retry();
  assert.equal(timers.size, 1, 'double tap must have only one deadline');
  media[0].pending[1].resolve();
  media[0].pending[0].reject({ name: 'NotAllowedError' }); await Promise.resolve();
  assert.equal(api.isSpeaking(), true, 'late rejection from an older play attempt must be ignored');
  api.stop();
}
console.log(JSON.stringify({ result: 'PASS', scenarios, operations, seed: 20261022 }));
