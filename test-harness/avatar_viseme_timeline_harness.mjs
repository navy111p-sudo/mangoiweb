import vm from 'node:vm';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
const window={};vm.runInNewContext(readFileSync(new URL('../cloudflare-deploy/public/js/avatar-visemes.js',import.meta.url),'utf8'),{window,Map,Promise,Number});
const api=window.AvatarVisemes,cs=[{start:0,end:.2,value:'A'},{start:.2,end:.7,value:'F'}];
assert(api.valid(cs));assert.equal(api.at(cs,0),'A');assert.equal(api.at(cs,.199),'A');assert.equal(api.at(cs,.2),'F');assert.equal(api.at(cs,.7),'X');assert.equal(api.at(cs,NaN),'X');
for(const bad of [[{start:0,end:Infinity,value:'A'}],[{start:-1,end:1,value:'A'}],[{start:0,end:1,value:'bad'}],[{start:0,end:2,value:'A'},{start:1,end:3,value:'B'}]])assert.equal(api.valid(bad),null);
assert.equal(await api.prepare('blob:unsupported'),null);
console.log('PASS: timeline boundaries, silence, invalid values, overlap, unavailable worker fallback');
