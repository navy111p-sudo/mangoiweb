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
assert.equal(api.frame(connected,.59).tile,-1,'closure is not blurred early');
assert.equal(api.frame(connected,.899).pose,'A','M/B/P stays closed through the cue');
assert.equal(api.frame(connected,.899).tile,-1);
assert(api.frame(connected,.91).tile>=0,'closed lip release is animated after onset');
assert.equal(api.frame(connected,1.2).pose,'X','end is closed immediately');
const gap=[{start:0,end:.3,value:'D'},{start:.4,end:.6,value:'F'}];
assert.equal(api.frame(gap,.299).tile,-1,'do not morph across silence');
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
