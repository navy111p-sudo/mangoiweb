// Input validation, never a pronunciation/fluency scorer or a live provider test.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {buildSync}=createRequire(new URL('../cloudflare-deploy/package.json',import.meta.url))('esbuild');
const dir=mkdtempSync(join(tmpdir(),'speaking-audio-')),originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout;
let calls=0;
try{
 const out=join(dir,'azure.mjs');
 buildSync({entryPoints:['cloudflare-deploy/src/azure-pronunciation.ts'],outfile:out,bundle:true,format:'esm',platform:'node'});
 const M=await import(pathToFileURL(out));
 function wav(seconds=1){const b=Buffer.alloc(44+32000*seconds);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);return b;}
 const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);
 assert.equal(M.wavSeconds(ab(wav())),1);
 const list=Buffer.from([76,73,83,84,1,0,0,0,0,0]); // Odd-sized metadata + padding.
 const extended=Buffer.concat([wav().subarray(0,36),list,wav().subarray(36)]);extended.writeUInt32LE(extended.length-8,4);
 assert.equal(M.wavSeconds(ab(extended)),1,'metadata and padding are not counted as speech');
 const bad=[];
 for(const [offset,value,width] of [[4,1,4],[16,8,4],[20,3,2],[22,2,2],[24,48000,4],[28,0xffffffff,4],[32,4,2],[34,8,2],[40,32001,4]]){const b=wav();width===2?b.writeUInt16LE(value,offset):b.writeUInt32LE(value,offset);bad.push(b);}
 bad.push(wav().subarray(0,100),wav(0),Buffer.from('not a WAV file'));
 const noFormat=wav();noFormat.write('JUNK',12);bad.push(noFormat);
 const duplicate=Buffer.concat([wav(),wav().subarray(36)]);duplicate.writeUInt32LE(duplicate.length-8,4);bad.push(duplicate);
 globalThis.fetch=async()=>{calls++;throw new Error('Live network forbidden by audio validation harness');};
 const fixtureEnv={AZURE_SPEECH_KEY:'local-fixture-key-never-valid-remotely',AZURE_SPEECH_REGION:'fixture'};
 for(const b of bad){assert.equal(M.wavSeconds(ab(b)),null);assert.equal((await M.assessPronunciation(fixtureEnv,ab(b),'This is a local test.','en')).reason,'not_wav');}
 assert.equal((await M.assessPronunciation(fixtureEnv,ab(wav(60)),'This is a local test.','en')).reason,'too_long');
 assert.equal(calls,0,'invalid inputs never reach a paid provider');
 globalThis.setTimeout=()=>{throw new Error('Invalid configuration must not allocate a request timer');};
 assert.equal((await M.assessPronunciation({...fixtureEnv,AZURE_SPEECH_KEY:'short'},ab(wav()),'This is a local test.','en')).reason,'key_too_short');
 globalThis.setTimeout=originalTimer;
 // Retry responses must satisfy the same recognition gate and timeout as the first request.
 const scores={AccuracyScore:0,FluencyScore:75,CompletenessScore:100,PronScore:50};
 for(const status of ['NoMatch','InitialSilenceTimeout','', 'Success']){
  let requests=0,firstSignal,retrySignal;
  globalThis.fetch=async(url,options)=>{
   requests++;
   if(requests===1){firstSignal=options.signal;return Response.json({RecognitionStatus:'Success',NBest:[{Display:'This is a local test.'}]});}
   retrySignal=options.signal;
   return Response.json({RecognitionStatus:status,NBest:[{Display:'This is a local test.',PronunciationAssessment:scores}]});
  };
  const result=await M.assessPronunciation(fixtureEnv,ab(wav()),'This is a local test.','en');
  assert.equal(requests,2);
  assert.equal(retrySignal,firstSignal,'retry shares the total request deadline');
  assert.equal(result.ok,status==='Success','retry rejects unsuccessful recognition even with scores');
  if(status==='Success'){assert.equal(result.scoreFieldsPresent,true);assert.equal(result.accuracy,0);}
 }
 let deadline,requests=0;
 globalThis.setTimeout=fn=>{deadline=fn;return 0;};
 globalThis.fetch=async(url,options)=>{
  if(++requests===1)return Response.json({RecognitionStatus:'Success',NBest:[{}]});
  deadline();
  assert.equal(options.signal.aborted,true,'retry is aborted by the original deadline');
  throw new DOMException('fixture deadline','AbortError');
 };
 assert.equal((await M.assessPronunciation(fixtureEnv,ab(wav()),'This is a local test.','en')).ok,false);
 globalThis.setTimeout=originalTimer;
 globalThis.fetch=async()=>{calls++;throw new Error('Live network forbidden');};
 console.log('PASS retry recognition status, measured zero and shared request deadline');
 const audioIndex=process.argv.indexOf('--audio');
 if(audioIndex>=0){
  const b=readFileSync(process.argv[audioIndex+1]),seconds=M.wavSeconds(ab(b));
  assert.ok(seconds>0&&seconds<=M.AZURE_TUNING.MAX_SECONDS,'actual synthetic audio is supported');
  const expectedIndex=process.argv.indexOf('--expected-seconds');
  if(expectedIndex>=0)assert.ok(Math.abs(seconds-Number(process.argv[expectedIndex+1]))<1/16000,'duration agrees with external decoder');
  assert.equal((await M.assessPronunciation({},ab(b),'This is a local test.','en')).reason,'no_key');
  assert.equal(calls,0);
  console.log('PASS actual local synthetic WAV duration '+seconds+'s; live assessment blocked (no isolated provider credential); skill scores not measured');
 }
 console.log('PASS PCM WAV chunks, metadata, format/rate/length tampering, truncation, duplicates and no paid calls for rejected inputs');
}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;rmSync(dir,{recursive:true,force:true});}
