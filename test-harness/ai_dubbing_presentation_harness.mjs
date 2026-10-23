// Exercise the real player in a small DOM without microphones or remote APIs.
// Run: node test-harness/ai_dubbing_presentation_harness.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, {
    value: '', checked: false, hidden: false, disabled: false, textContent: '', innerHTML: '', style: {},
    events: {}, classList: { toggle() {}, contains() { return false; }, remove() {}, add() {} },
    addEventListener(k, f) { this.events[k] = f; }, scrollIntoView() {}, setAttribute() {},
  });
  return elements.get(id);
}
const document = { getElementById: el, querySelectorAll: () => [], body: el('body') };
const context = { document, console, setTimeout, clearTimeout, URL, location: { search: '' } };
context.window = context;
vm.createContext(context);
vm.runInContext(read('cloudflare-deploy/public/js/ai-dubbing-core.js'), context);
const source = read('cloudflare-deploy/public/js/ai-dubbing.js');
const boot = source.indexOf("  if (document.readyState === 'loading')");
assert.ok(boot > 0);
vm.runInContext(source.slice(0, boot) + `
  window.testDub = { S, wire, showLine, wShowLine, dubbingText, startRun, renderScenes };
  ensureMix = function () {};
  openMic = function () { return new Promise(function () {}); };
  applySndPrefs = function () {};
  closeSheet = function () {};
  setRunning = function () {};
  openSheet = function () { window.rolesOpened = true; };
})();`, context);
const d = context.testDub;
d.S.ep = { id: 'fixture', playable: ['mina'], characters: { mina: { emoji: '👧', name: { ko: '미나', en: 'Mina' } } }, scenes: [
  { no: 1, label: { ko: '장면', en: 'Scene' }, video: '/fixture.mp4', lines: [{ id: 'a', speaker: 'mina', en: 'Hello!', ko: '안녕!' }] },
] };
d.S.cast = [{ name: '수진', character: 'mina' }, { name: '민수', character: 'mina' }];
d.S.sel = 0;
el('dub-mode').value = 'practice';
d.wire();
assert.equal(el('dub-korean-option').hidden, true);
assert.match(el('dub-start').innerHTML, /연습 시작/);
const line = d.S.ep.scenes[0].lines[0];
const actor = { type: 'student', idx: 0 };
const previousTake = { studentIdx: 0, status: 'done', score: { overall: 82 } };
d.S.results.push(previousTake);
d.startRun([0]);
assert.equal(d.S.results.length, 0, 'A new recording excludes previous scores');
previousTake.score.overall = 99;
assert.equal(d.S.results.length, 0, 'A delayed previous score cannot reappear');
const thisTake = { studentIdx: 0, status: 'done', score: { overall: 90 } };
d.S.results.push(thisTake);
d.startRun([0]);
assert.equal(d.S.results[0], thisTake, 'An ignored start must not clear an active recording');
assert.equal(context.MangoiDubCore.summarize(d.S.results, d.S.cast)[0].avg, 90, 'Only this recording contributes to the average');
assert.equal(d.S.run.mode, 'practice');
assert.equal(d.S.run.scriptMode, 'both');
d.showLine(d.S.run, line, actor);
assert.equal(el('dub-sub-en').textContent, 'Hello!');
assert.equal(el('dub-sub-ko').textContent, '안녕!');
assert.equal(el('dub-sub-en').hidden, false);
d.S.run = null;
el('dub-mode').value = 'presentation';
el('dub-mode').events.change();
assert.equal(el('dub-korean-option').hidden, false);
assert.match(el('dub-start').innerHTML, /발표 더빙 시작/);
d.startRun([0]);
assert.equal(d.S.results.length, 0, 'Presentation starts with its own results');
assert.equal(d.S.run.mode, 'presentation');
assert.equal(d.S.run.scriptMode, 'none');
d.showLine(d.S.run, line, actor);
assert.equal(el('dub-sub').hidden, true);
assert.equal(el('dub-sub-en').textContent, '');
assert.equal(el('dub-sub-ko').textContent, '');
assert.equal(d.dubbingText(line, d.S.run.scriptMode).en, '');
el('dub-live-korean').checked = true;
el('dub-live-korean').events.change.call(el('dub-live-korean'));
assert.equal(el('dub-sub').hidden, false);
assert.equal(el('dub-sub-en').textContent, '');
assert.equal(el('dub-sub-ko').textContent, '안녕!');
assert.equal(d.dubbingText(line, d.S.run.scriptMode).ko, '안녕!');
el('dub-live-korean').checked = false;
el('dub-live-korean').events.change.call(el('dub-live-korean'));
assert.equal(el('dub-sub').hidden, true);
d.wShowLine(d.S.ep, line);
assert.equal(el('dub-sub-en').hidden, false);
assert.equal(el('dub-sub-en').textContent, 'Hello!');
d.S.run = null;
const groupScene = { lines: [line, { ...line, id: 'b' }] };
const groupLines = context.MangoiDubCore.assignLines(groupScene, d.S.cast, {});
assert.deepEqual(Array.from(groupLines, x => x.performer.idx), [0, 1]);
d.renderScenes();
assert.match(el('dub-scenes').innerHTML, /data-ko="더빙"/);
assert.doesNotMatch(el('dub-scenes').innerHTML, /바로 더빙/);
const button = { disabled: false, getAttribute: () => '0' };
el('dub-scenes').events.click({ target: { closest: selector => selector.includes('data-scene') ? button : null } });
assert.equal(context.rolesOpened, true);
assert.equal(d.S.run, null, 'Step 2 must not start recording');
assert.match(source, /var sub = run.sub;/, 'Saved video uses the same subtitle payload');
console.log('PASS: practice/presentation starts, subtitles on/off, watch recovery, roles-only navigation');
