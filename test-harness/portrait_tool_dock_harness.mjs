// Executes the real dock controller. Layout still needs a real-device check.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
function el(rect = {left: 0, top: 0, bottom: 60}) {
  const classes = new Set(), attrs = new Map(), props = new Map();
  return { textContent: '', writes: 0,
    classList: { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, yes) => yes ? classes.add(x) : classes.delete(x) },
    getAttribute: x => attrs.get(x), setAttribute(x, value) { attrs.set(x, value); this.writes++; },
    getBoundingClientRect: () => rect,
    style: { setProperty: (k, v) => props.set(k, v), getPropertyValue: k => props.get(k) || '' }
  };
}
const materials = el(), anno = el(), wb = el(), wbTab = el(), pane = el();
const chips = {materials: el({left: -50, top: 40, bottom: 70}), write: el({left: 350, top: 600, bottom: 630})};
const selectors = {'#tab-pdf .pdf-controls': materials, '#tab-pdf .pdf-anno-bar': anno, '#tab-whiteboard .wb-toolbar': wb};
for (const key of Object.keys(chips)) selectors[`.mango-tool-chip[data-tool="${key}"]`] = chips[key];
let portrait = true, tick;
const listeners = {};
const window = {innerWidth: 393, innerHeight: 852, matchMedia: () => ({matches: portrait}), addEventListener: (k, fn) => listeners[k] = fn};
const context = {window, document: {readyState: 'complete', querySelector: s => selectors[s], getElementById: id => ({'tab-whiteboard': wbTab, 'vc-content-pane': pane})[id]}, setInterval: fn => {tick = fn;}, vcSwitchTab: () => {wbTab.classList.remove('active');}};
vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/mango-tools-dock.js', import.meta.url), 'utf8'), context);
const state = (m, a) => {assert.equal(materials.getAttribute('data-mango-dock-open'), String(m)); assert.equal(anno.getAttribute('data-mango-dock-open'), String(a));};
state(false, false);
window.mangoToggleToolDock('materials'); state(true, false);
assert.equal(materials.style.getPropertyValue('--mango-dock-left'), '8px');
window.mangoToggleToolDock('write'); state(false, true);
assert.equal(anno.style.getPropertyValue('--mango-dock-left'), '85px');
assert.equal(anno.style.getPropertyValue('--mango-dock-top'), '298px');
assert.equal(chips.write.getAttribute('aria-expanded'), 'true');
window.mangoToggleToolDock('write'); state(false, false);
wbTab.classList.add('active'); window.mangoToggleToolDock('write'); state(false, false);
assert.ok(wb.classList.contains('mango-wb-dock-open'));
window.mangoToggleToolDock('write'); assert.ok(!wb.classList.contains('mango-wb-dock-open'));
const before = [materials, anno, ...Object.values(chips)].map(e => e.writes); tick();
assert.deepEqual([materials, anno, ...Object.values(chips)].map(e => e.writes), before);
portrait = false; window.mangoToggleToolDock('materials');
assert.equal(materials.style.left, '8px');
assert.equal(materials.style.top, '76px');
console.log('PASS: initial closed, exclusive toggles, close, whiteboard context, viewport clamping, ARIA, idle stability, landscape positioning');
