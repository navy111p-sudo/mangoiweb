// EP02 staging regression — executable with Node 20+
// node test-harness/ai_dubbing_ep02_staging.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const dir=dirname(fileURLToPath(import.meta.url));
const pub=resolve(dir,'../cloudflare-deploy/public');
const core=require(join(pub,'js/ai-dubbing-core.js'));
const ep=JSON.parse(readFileSync(join(pub,'data/dubbing/dub-002.json'),'utf8'));
const idx=JSON.parse(readFileSync(join(pub,'data/dubbing/index.json'),'utf8'));
const ui=readFileSync(join(pub,'ai-dubbing.html'),'utf8');
const js=readFileSync(join(pub,'js/ai-dubbing.js'),'utf8');
const r=core.normalizeEpisode(ep);
assert(r.ok && r.problems.length===0,JSON.stringify(r.problems));
assert(ep.status==='preview','Cannot advertise phoneme-accurate final lip sync without visual QC');
assert.equal(r.episode.scenes.length,6);
assert.equal(r.episode.scenes.reduce((sum,s)=>sum+s.lines.length,0),48);
for (const sc of r.episode.scenes){
 assert.equal(sc.voiceMode,'stems','scene '+sc.no+' lacks playable voice stems');
 assert.equal(sc.timing,'synced','scene '+sc.no+' has invalid timeline');
 assert.equal(sc.lines.length,8);
 assert.equal(Object.keys(sc.voices).length,4);
 for(const url of [sc.video,sc.poster,sc.bgm,...Object.values(sc.voices)])assert(/^https:\/\//.test(url));
 assert(sc.video.endsWith('.mp4'));assert(sc.poster.endsWith('.webp'));
 assert(sc.bgm.endsWith('.mp3'));
 for(const url of Object.values(sc.voices))assert(url.endsWith('.mp3'));
 for(const id of ['kai','emma','maya','pip'])assert.equal(sc.lines.filter(l=>l.speaker===id).length,2);
}
const ready=core.normalizeIndex(idx).filter(e=>e.status==='ready').map(e=>e.id);
assert(ready.includes('dub-001')&&ready.includes('dub-002')&&ready.includes('dub-003'));
for(const chosen of [['kai'],['kai','emma'],['kai','emma','maya','pip']]){
 const cast=chosen.map((character,i)=>({name:'Student '+i,character}));
 assert.deepEqual(core.castProblems(cast,r.episode),[]);
 for(const sc of r.episode.scenes){
  const assigned=core.assignLines(sc,cast,{});
  for(const x of assigned)assert.equal(x.performer.type,chosen.includes(x.line.speaker)?'student':'native');
 }
}
const duo=core.assignLines(r.episode.scenes[0],[{name:'A',character:'pip'},{name:'B',character:'pip'}],{});
assert.deepEqual(duo.filter(x=>x.line.speaker==='pip').map(x=>x.performer.idx),[0,1]);
assert(ui.includes('id="dub-listen-all"'));
assert(ui.includes('/js/ai-dubbing.js?v=4'));
assert(js.includes('listenOnly: listenOnly'));
assert(js.includes('run.listenOnly ? {} : C.mutedCharacters(S.cast)'));
console.log('EP02 STAGING TEST PASSED: 6 scenes, 48 dialogue lines, timed native tracks, selectable muting, 1/2/4-person cast, full listening mode.');
