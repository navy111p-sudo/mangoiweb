// Execute the real route and browser cache policy without network or production storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cf = path.join(root, 'cloudflare-deploy');
const require = createRequire(path.join(cf, 'package.json'));
const esbuild = require('esbuild'), ts = require('typescript');
const bundled = esbuild.buildSync({ entryPoints:[path.join(cf,'src/api-voice-tts.ts')], bundle:true, write:false, platform:'node', format:'cjs' }).outputFiles[0].text;
const mod = {exports:{}};
new Function('module','exports','require',bundled)(mod,mod.exports,require);
const route = mod.exports.handleVoiceTtsApi;
let pass=0;
async function check(name, fn) { await fn(); pass++; console.log('PASS '+name); }
function fixture() {
  const cache=new Map(), calls=[];
  let failPrimary=false, failAll=false;
  return { cache,calls, fail(primary,all=false){failPrimary=primary;failAll=all;}, env:{
    RECORDINGS:{async get(k){const v=cache.get(k);return v ? {body:v.bytes.slice(),customMetadata:v.meta.customMetadata}:null;},async put(k,b,meta){cache.set(k,{bytes:new Uint8Array(b),meta});}},
    AI:{async run(model){calls.push(model);if(failAll || (failPrimary && model.includes('aura-2')))throw new Error('fixture unavailable');return new Uint8Array(400).fill(model.includes('aura-2')?2:1).buffer;}}
  }};
}
async function request(f, speaker='asteria') {
  const req=new Request('https://local.test/api/voice/tts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:'Well, I like cats.',lang:'en',speaker})});
  return route(req,new URL(req.url),f.env);
}
for(const speaker of ['asteria','delia','aries','odysseus']) await check(speaker+': fallback plays once, then primary recovers and caches',async()=>{
  const f=fixture();f.fail(true);
  const fallback=await request(f,speaker);
  assert.equal(fallback.headers.get('X-TTS-Engine'),'aura-1');
  assert.equal(f.cache.size,0);
  f.fail(false);const good=await request(f,speaker);
  assert.equal(good.headers.get('X-TTS-Engine'),'aura-2');
  const calls=f.calls.length;
  assert.equal((await request(f,speaker)).headers.get('X-TTS-Engine'),'r2-cache:aura-2');
  assert.equal(f.calls.length,calls);
});
for(const eng of [undefined,'aura-1','melotts']) await check('old '+eng+' cache is regenerated once',async()=>{
  const f=fixture();await request(f);const v=[...f.cache.values()][0];v.meta.customMetadata=eng?{eng}:undefined;v.bytes.fill(1);
  const res=await request(f);assert.equal(res.headers.get('X-TTS-Engine'),'aura-2');assert.equal(new Uint8Array(await res.arrayBuffer())[0],2);
  assert.equal((await request(f)).headers.get('X-TTS-Engine'),'r2-cache:aura-2');
});
await check('total provider failure still returns error for device fallback',async()=>{
  const f=fixture();f.fail(true,true);assert.equal((await request(f)).status,502);assert.equal(f.cache.size,0);
});
const warm=fs.readFileSync(path.join(cf,'public/warmup.html'),'utf8');
const script=[...warm.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join('\n');
function named(source,name) {
  const ast=ts.createSourceFile('source.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let found;
  function visit(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===name)found=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
  assert.ok(found,name);return found;
}
const scope={_warmLang:'en'};vm.createContext(scope);
vm.runInContext(named(script,'_speechText')+'\n'+named(script,'_ttsCacheable'),scope);
await check('correction quotes retain the spaces between all three copies',()=>{
  const sentence='My favorite animal is a lion';
  const raw='You can say... "'+sentence+'" "'+sentence+'" "'+sentence+'" Can you say it with me?';
  assert.equal(scope._speechText(raw),raw);
  assert.equal(scope._speechText('Wow! 😀 **I like cats.**'),'Wow! I like cats.');
});
for(const eng of ['aura-1','melotts','r2-cache:aura-1','r2-cache','', 'aura-2','r2-cache:aura-2']) await check('browser caches only primary: '+eng,async()=>{
  const expected=['aura-2','r2-cache:aura-2'].includes(eng);
  assert.equal(scope._ttsCacheable({got:'asteria',eng},'asteria'),expected);
  const js=fs.readFileSync(path.join(cf,'public/js/game-tts.js'),'utf8').replace(/\}\)\(\);\s*$/, 'window.test={fetchTTS,cache};})();');
  const context={window:{},localStorage:{getItem(){return 'en';}},URL:{createObjectURL(){return 'blob:fixture';}},fetch:async()=>new Response(new Uint8Array(400),{headers:{'content-type':'audio/mpeg','X-TTS-Speaker':'asteria','X-TTS-Engine':eng}})};
  vm.createContext(context);vm.runInContext(js,context);
  context.window.MangoiTTS.setSpeaker('asteria');await context.window.test.fetchTTS('Well, I like cats.');
  assert.equal(Object.keys(context.window.test.cache).length,expected?1:0);
});
await check('all warmup cache writes use the engine gate; Chinese remains unchanged',()=>{
  assert.equal((warm.match(/if\(_ttsCacheable\(o, spk\)\)\{ _ttsCache/g)||[]).length,3);
  scope._warmLang='zh';assert.equal(scope._ttsCacheable({got:'asteria',eng:'gtts'},'asteria'),true);
  assert.equal(scope._ttsCacheable({got:'other',eng:'gtts'},'asteria'),false);
});
console.log('PASS '+pass+' / FAIL 0');
