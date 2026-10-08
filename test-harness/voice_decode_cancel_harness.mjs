// Actual inline voice functions, deferred synthetic speech decoding; no media/provider/network.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), require=createRequire(import.meta.url);
const ts=require(resolve(root,'cloudflare-deploy/node_modules/typescript'));
function extract(page,name){
  const html=readFileSync(resolve(root,'cloudflare-deploy/public/'+page+'.html'),'utf8');
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/\bsrc=|application\/ld\+json/.test(match[1]))continue;
    const file=ts.createSourceFile('inline.js',match[2],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
    let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(file);if(!found)ts.forEachChild(node,visit);}visit(file);
    if(found)return found;
  }
  throw Error('Missing function '+page+':'+name);
}
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
function fixture(page){
  const decodes=[],sent=[],options=[],input={value:''};
  const s={console,Promise,_whisperOn:false,_recognizing:false,_friendMicSeq:0,_warmEpoch:1,_warmVoiceEpoch:1,_warmPaused:false,_warmInputTrace:null,_warmPendingTrace:null,_warmMicCancel:null,
    _pendingVoice:false,_pendingVoiceTrace:null,_micManual:()=>false,_whisperUserStop:false,wuT:x=>x,_warmLang:'en',MIC_MANUAL_IDLE:30000,MIC_MANUAL_MAX:180000,
    setMicState(on){s._recognizing=on;},updateMicUI(){},micHint(){},_setListenLabel(){},stopSpeakingNow(){},addMsg(){},sendMsg(){sent.push(input.value);},document:{getElementById:()=>input},
    MangoiVoice:{supported:()=>true,record:async opts=>{options.push(opts);opts.onAudio({synthetic:true});return 'Synthetic quiet speech';},cancel(){},stop(){}},
    MangoiVoiceCheck:{blobHasVoice:()=>new Promise(resolve=>decodes.push(resolve))},
  };
  s.window=s;vm.createContext(s);
  const names=page==='warmup'?['micViaWhisper','_blobHasVoice','_micAbortQuiet']:['micViaWhisper','cancelFriendMic'];
  vm.runInContext(names.map(name=>extract(page,name)).join('\n'),s);
  return {s,decodes,sent,options,input,start:()=>s.micViaWhisper(true),cancel:()=>page==='warmup'?s._micAbortQuiet():s.cancelFriendMic()};
}
let pass=0,fail=0;const results=[];
async function test(name,run){try{await run();pass++;results.push({name,passed:true});console.log('PASS '+name);}catch(e){fail++;results.push({name,passed:false,error:e.message});console.log('FAIL '+name+': '+e.message);}}
for(const page of ['warmup','ai-friend']){
  await test(page+': cancel during quiet decode suppresses the late transcript',async()=>{
    const f=fixture(page),p=f.start();await flush();assert.equal(f.decodes.length,1);f.cancel();f.decodes[0](true);await p;assert.deepEqual(f.sent,[]);
  });
  await test(page+': cancel then new capture never submits the older decode',async()=>{
    const f=fixture(page),old=f.start();await flush();f.cancel();const current=f.start();await flush();assert.equal(f.decodes.length,2);
    f.decodes[0](true);await old;assert.deepEqual(f.sent,[]);f.decodes[1](true);await current;assert.deepEqual(f.sent,['Synthetic quiet speech']);
  });
  for(const decoded of [true,false,null])await test(page+': decoder '+decoded+' preserves quiet-speech versus silence policy',async()=>{
    const f=fixture(page),p=f.start();await flush();f.decodes[0](decoded);await p;
    assert.equal(f.sent.length,decoded===true?1:0);assert.equal(f.s._whisperOn,false);assert.equal(f.s._recognizing,false);
    assert.equal(f.options[0].firstMs,0);
  });
}
console.log(`voice_decode_cancel: PASS ${pass} / FAIL ${fail}`);
if(process.env.RESULT_PATH)writeFileSync(process.env.RESULT_PATH,JSON.stringify({kind:'Actual inline functions with synthetic capture and deferred local decoder; no microphone, provider or network',pass,fail,results},null,2));
process.exitCode=fail?1:0;
