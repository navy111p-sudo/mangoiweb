import {tmpdir as handoffTmp} from 'node:os';import {resolve as handoffResolve} from 'node:path';import {pathToFileURL as handoffURL,fileURLToPath as handoffFile} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(new URL('../../cloudflare-deploy/package.json',import.meta.url));
const out=(handoffTmp()+'/eleader-staged-')+process.pid+'.mjs';
await require('esbuild').build({entryPoints:[handoffFile(new URL('../../cloudflare-deploy/src/index.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
const {default:worker}=await import(handoffURL(out));
for(const method of ['GET','POST','PUT','DELETE','OPTIONS'])for(const action of ['entry','state','chat','tts','transcribe','settings','assign','complete'])test(`shipped gate ${method} ${action}: no env, DB, audio read or provider`,async()=>{
 let touched=0;const fail=()=>{touched++;throw Error('No bindings may be accessed');};
 const env=new Proxy({ELEADER_PILOT:'on',ELEADER_LIVE_AI:'approved'},{get:fail,ownKeys:fail});
 const req=new Request('https://mangoi.ai/api/ai/eleader/'+action+'?academy=eleaderjam',{method,headers:{Origin:'https://mangoi.ai',Authorization:'Bearer synthetic','X-Eleader-Confirm':'yes'},...(method==='POST'?{body:'synthetic-never-transmitted'}:{})});
 const r=await worker.fetch(req,env,{waitUntil:fail});assert.equal(r.status,404);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{error:'pilot_disabled',release:'staged-v5',voice_enabled:false});assert.equal(req.bodyUsed,false);assert.equal(touched,0);
});
