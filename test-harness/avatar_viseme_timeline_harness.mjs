import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const window={};vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/avatar-visemes.js',import.meta.url),'utf8'),{window,Map,Promise,Number});
const api=window.AvatarVisemes,cs=[{start:0,end:.2,value:'A'},{start:.2,end:.7,value:'F'}];
assert(api.valid(cs));assert.equal(api.at(cs,0),'A');assert.equal(api.at(cs,.199),'A');assert.equal(api.at(cs,.2),'F');assert.equal(api.at(cs,.7),'X');assert.equal(api.at(cs,NaN),'X');
for(const bad of [[{start:0,end:Infinity,value:'A'}],[{start:-1,end:1,value:'A'}],[{start:0,end:1,value:'bad'}],[{start:0,end:2,value:'A'},{start:1,end:3,value:'B'}]])assert.equal(api.valid(bad),null);
assert.equal(await api.prepare('blob:unsupported'),null);
const connected=[{start:0,end:.3,value:'D'},{start:.3,end:.6,value:'F'},{start:.6,end:.9,value:'A'},{start:.9,end:1.2,value:'G'}];
assert.equal(api.frame(connected,.2).tile,-1,'long vowel reaches its anchor');
assert(api.frame(connected,.29).tile>=0,'anticipatory coarticulation');
assert(api.frame(connected,.31).tile>=0,'release coarticulation');
assert(api.frame(connected,.57).tile>=0,'lips approach closure before M/B/P');
assert.equal(api.frame(connected,.6).pose,'A');
assert.equal(api.frame(connected,.6).tile,-1,'M/B/P fully closed at onset');
assert.equal(api.frame(connected,.899).pose,'A','M/B/P stays closed through the cue');
assert.equal(api.frame(connected,.899).tile,-1);
assert(api.frame(connected,.91).tile>=0,'closed lip release is animated after onset');
assert.equal(api.frame(connected,1.2).pose,'X','end is closed immediately');
const gap=[{start:0,end:.3,value:'D'},{start:.4,end:.6,value:'F'}];
assert(api.frame(gap,.27).tile>=0,'speech eases into the following silence');
assert(api.frame(gap,.42).tile>=0,'speech opens only after silence');
assert.equal(api.frame(gap,.35).pose,'X');
const tiles=new Set();
for(const from of 'XABCDEFGH')for(const to of 'XABCDEFGH'){
 if(from===to||from==='X'||to==='X'||to==='A')continue;
 const pair=[{start:0,end:1,value:from},{start:1,end:2,value:to}];
 for(let t=.95;t<1.05;t+=.001){const f=api.frame(pair,t);if(f.tile>=0){assert(f.tile<288);tiles.add(f.tile);}}
}
assert(tiles.size>=196,'all usable ordered transitions are addressable');
assert.equal(api.frame(connected,NaN).pose,'X');
console.log('PASS: timeline boundaries, silence, invalid values, overlap, unavailable worker fallback');
console.log('PASS: coarticulation, M/B/P closure, silence gaps and transition sheet indexing');

for(const closed of ['A','X']) {
 const pair=[{start:0,end:.3,value:'D'},{start:.3,end:.6,value:closed},{start:.6,end:.9,value:'F'}];
 for(let t=.3;t<.6;t+=.001)assert.equal(api.frame(pair,t).tile,-1,'no motion within closure');
 assert(api.frame(pair,.62).tile>=0);
}
const single=[{start:.2,end:.8,value:'D'}];
assert.equal(api.frame(single,.19).pose,'X');
assert(api.frame(single,.22).tile>=0,'first speech onset releases rest');
assert(api.frame(single,.77).tile>=0,'last speech ends gently');
assert.equal(api.frame(single,.8).pose,'X');
for(const t of [.22,.4,.77])assert.deepEqual(api.frame(single,t),api.frame(single,t),'seek sampling is deterministic');
console.log('PASS: eased closures, speech onset/offset, silent intervals and deterministic seek');
