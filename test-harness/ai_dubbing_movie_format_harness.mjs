// A browser may expose both WebM recording and MP4; saved movies must prefer MP4.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../cloudflare-deploy/public/js/ai-dubbing.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('  function pickMime()'), source.indexOf('  function startMovie('));
const mp4 = 'video/mp4;codecs=avc1,mp4a.40.2';
const webm = 'video/webm;codecs=vp8,opus';
for (const [supported, expected] of [
  [[mp4, 'video/mp4', webm, 'video/webm'], mp4],
  [['video/mp4', webm], 'video/mp4'],
  [[webm, 'video/webm'], webm],
  [['video/webm'], 'video/webm'],
  [[], ''],
]) {
  const MediaRecorder = { isTypeSupported: type => supported.includes(type) };
  const context = { window: { MediaRecorder }, MediaRecorder };
  vm.createContext(context); vm.runInContext(helper, context);
  assert.equal(context.pickMime(), expected);
}
const missing = { window: {} };
vm.createContext(missing); vm.runInContext(helper, missing);
assert.equal(missing.pickMime(), '');
console.log('PASS: MP4 preference, generic MP4, WebM fallback and unavailable recorder');
