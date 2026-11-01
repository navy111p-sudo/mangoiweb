'use strict';
/**
 * EP02 manifest regression checks. Run from repository root:
 * node cloudflare-deploy/test-harness/ai_dubbing_ep002_contract.cjs
 *
 * This deliberately does NOT approve visual casting, final lip sync or production release.
 * It only checks that EP02 uses the same learning engine contract as EP03.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = path.resolve(__dirname, '..', 'public');
const core = require(path.join(base, 'js', 'ai-dubbing-core.js'));
const ep = JSON.parse(fs.readFileSync(path.join(base, 'data', 'dubbing', 'dub-002.json'), 'utf8'));
const ep3 = JSON.parse(fs.readFileSync(path.join(base, 'data', 'dubbing', 'dub-003.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(base, 'data', 'dubbing', 'index.json'), 'utf8'));

assert.equal(ep.id, 'dub-002');
assert.equal(ep.status, 'preview', 'Unapproved visuals must remain preview');
assert.equal(ep.timing, ep3.timing, 'Same student-led turn practice as film 3');
assert.equal(ep.scenes.length, ep3.scenes.length);
assert.deepEqual([...ep.playable].sort(), ['emma', 'kai', 'maya', 'pip']);
assert.equal(new Set(ep.scenes.flatMap(s => s.lines.map(x => x.id))).size, 48, '48 unique lines');
assert.equal(ep.scenes.reduce((n, s) => n + s.durationSec, 0), 240, '240-second footage');

for (const scene of ep.scenes) {
  assert.match(scene.video, /^https:\/\//, 'Review source video must use HTTPS');
  assert.equal(scene.videoAudio, 'clean', 'Only clean BGM/SFX may accompany spoken turns');
  assert.equal(scene.lines.length, 8);
  for (const role of ep.playable) {
    assert.equal(scene.lines.filter(l => l.speaker === role).length, 2, role + ' needs two lines per scene');
  }
  for (const l of scene.lines) {
    assert.ok(l.en.trim() && l.ko.trim(), 'Bilingual line required');
    assert.match(l.id, /^s[1-6]-l[1-8]$/);
    assert.ok(l.scored);
  }
}

const normalized = core.normalizeEpisode(ep);
assert.ok(normalized.ok, 'Manifest is playable in the common dubbing engine');
assert.deepEqual(normalized.problems, []);
assert.ok(normalized.episode.scenes.every(s => s.timing === 'turn' && s.voiceMode === 'tts'));
const threeStudents = [
  { name: 'Student A', character: 'kai' },
  { name: 'Student B', character: 'emma' },
  { name: 'Student C', character: 'maya' }
];
assert.deepEqual(core.castProblems(threeStudents, normalized.episode), []);
const muted = core.mutedCharacters(threeStudents);
assert.equal(muted.kai, true);
assert.equal(muted.emma, true);
assert.equal(muted.maya, true);
assert.equal(!!muted.pip, false);

const listing = index.episodes.find(x => x.id === ep.id);
assert.ok(listing, 'Episode 2 must exist in existing navigation');
assert.equal(listing.status, 'coming', 'Until character and lip-sync QA pass, do not expose the film as ready');

console.log('EP02 MATCHED TO EP03: 6 scenes, 48 lines, same turn/TTS study engine, 1–4 roles; QA release gate preserved');
