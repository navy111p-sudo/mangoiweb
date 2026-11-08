// Run: node --test test/ai-speaking-settings-timing.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname,'../public/js/ai-speaking-settings.js'),'utf8');
const root = {}; vm.runInNewContext(source, {window:root});
const settings = root.AiSpeakSettings;
function store() { const data = new Map(); return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),data}; }
test('does not write settings on read',()=>{const s=store();assert.equal(settings.read(s).timing,'');assert.equal(s.data.size,0);});
test('explicit timing persists independently of correction strength',()=>{const s=store();settings.chooseCorr(s,'balanced');assert.equal(settings.chooseTiming(s,'after-lesson'),true);assert.equal(settings.read(s).corr,'balanced');assert.equal(settings.read(s).timing,'after-lesson');});
test('invalid timing rejected',()=>{const s=store();assert.equal(settings.chooseTiming(s,'always'),false);assert.equal(s.data.size,0);});
test('level defaults do not write',()=>{const s=store();assert.equal(settings.effectiveTiming(s,1),'immediate');assert.equal(settings.effectiveTiming(s,4),'key-mistakes');assert.equal(settings.effectiveTiming(s,8),'after-lesson');assert.equal(s.data.size,0);});
