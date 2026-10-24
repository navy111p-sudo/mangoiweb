// Real episode timings: no dropped/repeated syllables during drift correction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import C from '../cloudflare-deploy/public/js/ai-dubbing-core.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../cloudflare-deploy/public');
const ep = JSON.parse(fs.readFileSync(path.join(root, 'data/dubbing/dub-007.json')));
let checks = 0;
function media(t) {
  return { _t:t, paused:false, playbackRate:1, seeks:[],
    get currentTime(){return this._t;}, set currentTime(v){this.seeks.push(v);this._t=v;},
    pause(){this.paused=true;}, play(){this.paused=false;return Promise.resolve();} };
}
for (const sc of ep.scenes) for (const l of sc.lines) {
  for (const drift of [-0.4, 0.4]) {
    const t = (l.start + l.end) / 2, a = media(t - drift);
    const f = C.clockFollower({lines:sc.lines});
    f.step(t, [a], null);
    assert.equal(a.seeks.length, 0, `scene ${sc.no} ${l.id}: seek inside speech`);
    assert.equal(a.playbackRate, drift > 0 ? 1.03 : 0.97);
    a._t = t + 0.2; f.step(t + 0.21, [a], null);
    assert.equal(a.playbackRate, 1, 'reset speed once aligned');
    checks++;
  }
  // Neither the leading consonant nor the trailing word may be skipped.
  for (const [from,to] of [[l.start-0.2,l.start+0.3],[l.end-0.3,l.end+0.2]]) {
    const a=media(from); C.clockFollower({lines:sc.lines}).step(to,[a],null);
    assert.equal(a.seeks.length,0, `scene ${sc.no} ${l.id}: seek across speech boundary`); checks++;
  }
}
const a=media(2), f=C.clockFollower({lines:ep.scenes[0].lines});
f.step(2.4,[a],null); assert.equal(a.currentTime,2.4); checks++;
for (const speed of [.75, 1.5, 2]) {
  const clock=media(11.4), voice=media(11);clock.playbackRate=speed;
  const h=C.clockFollower({lines:ep.scenes[0].lines});h.step(11.4,[voice],clock);
  assert.equal(voice.playbackRate,speed*1.03);assert.equal(voice.seeks.length,0);
  voice._t=11.59;h.step(11.6,[voice],clock);assert.equal(voice.playbackRate,speed);checks++;
}
// A video stall still holds audio, and recovery cannot skip a spoken word.
const b=media(11), g=C.clockFollower({lines:ep.scenes[0].lines});
g.step(11.4,[b],null);g.step(11.4,[b],null);g.step(11.4,[b],null);
assert.equal(b.paused,true);g.step(11.5,[b],null);
assert.equal(b.paused,false);assert.equal(b.seeks.length,0);checks++;
for (const p of ['ai-dubbing.js','ai-dubbing-watch.js']) {
  assert.match(fs.readFileSync(path.join(root,'js',p),'utf8'), /C\.clockFollower\(\{[^}]*lines: sc\.lines/); checks++;
}
console.log(`dub-007 continuity: PASS ${checks}, 36 lines, lag + lead + boundaries + stall/resume`);
