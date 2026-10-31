import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function recorder(media=async()=>({getTracks:()=>[{stop(){}}]})){
 const events=[];const sandbox={Blob,FormData,Uint8Array,Promise,setTimeout,clearTimeout,cancelAnimationFrame(){},navigator:{mediaDevices:{getUserMedia:media}},fetch:async()=>{events.push('legacy-fetch');return Response.json({ok:true,text:'old route'});}};
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable({data:new Blob([new Uint8Array(1500)],{type:'audio/webm'})});this.onstop();}}
 sandbox.window=sandbox;sandbox.MediaRecorder=Recorder;vm.runInNewContext(readFileSync(new URL('../../cloudflare-deploy/public/js/mangoi-voice-input.js',import.meta.url),'utf8'),sandbox);
 return {voice:sandbox.MangoiVoice,events};
}
test('existing recorder honors scoped transport and retains legacy default',async()=>{
 const r=recorder();let calls=0;const p=r.voice.record({lang:'en',transcribe:async fd=>{calls++;assert.equal(fd.get('lang'),'en');return {ok:true,text:'cats'};}});await Promise.resolve();r.voice.stop();assert.equal(await p,'cats');assert.equal(calls,1);assert.deepEqual(r.events,[]);
 const old=r.voice.record({});await Promise.resolve();r.voice.stop();assert.equal(await old,'old route');assert.deepEqual(r.events,['legacy-fetch']);
});
test('cancel while permission pending releases tracks and never uploads',async()=>{
 let resolveMedia,stopped=0,uploads=0;const r=recorder(()=>new Promise(resolve=>resolveMedia=resolve));const p=r.voice.record({transcribe:async()=>{uploads++;return {ok:true,text:'bad'};}});r.voice.cancel();resolveMedia({getTracks:()=>[{stop(){stopped++;}}]});assert.equal(await p,'');assert.equal(stopped,1);assert.equal(uploads,0);assert.deepEqual(r.events,[]);
});
test('permission denial stays text-only without invoking any transport',async()=>{
 const r=recorder(async()=>{throw Object.assign(new Error('fixture denied'),{name:'NotAllowedError'});});const states=[];assert.equal(await r.voice.record({onState:(s,info)=>states.push([s,info.reason])}), '');assert.ok(states.some(([s,reason])=>s==='error'&&reason==='denied'));assert.deepEqual(r.events,[]);
});
