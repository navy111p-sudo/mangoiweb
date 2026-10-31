// Approved long-form dub-008: preserve six chapters, all original lines and independent roles.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import C from '../cloudflare-deploy/public/js/ai-dubbing-core.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(__dirname, '../cloudflare-deploy/public');
const raw = JSON.parse(fs.readFileSync(path.join(pub, 'data/dubbing/dub-008.json')));
const result = C.normalizeEpisode(raw);
assert.equal(result.ok, true);
assert.deepEqual(result.problems, []);
const ep = result.episode;
assert.equal(ep.scenes.length, 6);
assert.equal(ep.playable.length, 6);
assert.equal(C.MAX_STUDENTS, 5, 'Existing group size is unchanged');
assert.deepEqual(ep.scenes.map(s => s.lines.length), [29,47,54,16,16,20]);
assert.ok(Math.abs(ep.scenes.reduce((n,s) => n+s.durationSec,0)-668.333333) < .01);
for (const sc of ep.scenes) {
  assert.equal(sc.timing, 'synced');
  assert.equal(sc.voiceMode, 'stems');
  assert.equal(sc.videoAudio, 'mute');
  assert.deepEqual(sc.sfx, [], 'Original effects already reside in the background track');
  for (const url of [sc.video, sc.poster, sc.bgm, ...Object.values(sc.voices)]) {
    assert.match(url, /^\/media\/dubbing\/dub-008\//);
    const stat = fs.statSync(path.join(pub, url));
    assert.ok(stat.size > 100 && stat.size < 25*1024*1024, url);
  }
  for (const l of sc.lines) {
    assert.ok(l.ko && l.en && sc.voices[l.speaker]);
    assert.ok(l.start >= 0 && l.end <= sc.durationSec && l.end > l.start);
  }
}
for (const role of ep.playable) {
  const cast = [{name:'Student',character:role}];
  assert.deepEqual(C.castProblems(cast,ep),[]);
  const muted = C.mutedCharacters(cast);
  assert.equal(muted[role],true);
  for (const other of ep.playable.filter(r=>r!==role)) assert.ok(!muted[other]);
}
assert.ok(ep.scenes[3].lines.some(l=>l.en==='We found it.'));
assert.ok(ep.scenes[4].lines.some(l=>l.en==='We fixed it together!'));
assert.ok(ep.scenes[5].lines.some(l=>l.en==='You are my friend.'));
assert.equal(ep.scenes[5].lines.at(-1).en,'Together!');
const broken = structuredClone(raw); delete broken.scenes[0].voices.ollie;
assert.equal(C.normalizeEpisode(broken).episode.scenes[0].voiceMode,'tts', 'Missing stems are detected');
console.log('PASS dub-008: 6 chapters / 182 bilingual lines / 668s / 6 selectable roles / selective muting / all local assets / story ending');
