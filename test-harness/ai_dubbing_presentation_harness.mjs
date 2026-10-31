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
const document = { getElementById: el, querySelectorAll: () => [], body: el('body'),
  events: {}, addEventListener(k, f) { this.events[k] = f; } };
const context = { document, console, setTimeout, clearTimeout, URL, location: { search: '' } };
context.window = context;
vm.createContext(context);
vm.runInContext(read('cloudflare-deploy/public/js/ai-dubbing-core.js'), context);
const source = read('cloudflare-deploy/public/js/ai-dubbing.js');
const boot = source.indexOf("  if (document.readyState === 'loading')");
assert.ok(boot > 0);
vm.runInContext(source.slice(0, boot) + `
  window.testDub = { S, wire, showLine, wShowLine, dubbingText, startRun, renderScenes, waitForPracticeDone, setButtons };
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
assert.match(el('dub-start').innerHTML, /내 목소리로 녹음 시작/);
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
assert.match(el('dub-start').innerHTML, /자막 없이 발표 녹음/);
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

// A practice clock is advisory, even after silence or time runs out.
let practiceTick, timerCleared = false;
context.setInterval = fn => { practiceTick = fn; return 1; };
context.clearInterval = () => { timerCleared = true; };
const manualRun = { mode: 'practice', wakers: [] };
d.S.run = manualRun;
d.setButtons('student');
assert.equal(el('dub-done').disabled, false);
assert.equal(el('dub-skip').disabled, true, 'Practice cannot bypass Done through Skip');
let manualFinished = false;
const manualWait = d.waitForPracticeDone(manualRun).then(() => { manualFinished = true; });
for (let i = 0; i < 12; i++) practiceTick();
await Promise.resolve();
assert.equal(manualFinished, false, 'Time expiry must never end practice');
assert.match(el('dub-practice-time').textContent, /계속 녹음/);
manualRun.moreNow();
assert.match(el('dub-practice-time').textContent, /5초/, 'More time adds five seconds');
manualRun.doneNow(); await manualWait;
assert.equal(manualFinished, true);
assert.equal(timerCleared, true);
assert.equal(manualRun.wakers.length, 0);
assert.equal(manualRun.doneNow, null);
assert.equal(manualRun.moreNow, null);
assert.equal(el('dub-more-time').hidden, true);
const stoppedRun = { mode: 'practice', aborted: true, wakers: [] };
await d.waitForPracticeDone(stoppedRun);
assert.equal(stoppedRun.wakers.length, 0, 'Stopped practice cleans up pending wait');
d.S.run = { mode: 'presentation' };
d.setButtons('native');
assert.equal(el('dub-done').disabled, true);
assert.equal(el('dub-more-time').hidden, true, 'Presentation keeps its original timeline');
console.log('PASS: manual practice wait, no timeout advance, +5 seconds, Done and stop cleanup');
