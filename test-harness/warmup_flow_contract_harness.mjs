// Execute the existing stateless help handler with mocked bindings; no network/credentials.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync(new URL('../cloudflare-deploy/src/class-ask.ts',import.meta.url),'utf8');
const M=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
let passed=0;function ck(v,name){assert.ok(v,name);passed++;console.log('PASS '+name);}
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s});
const request=b=>new Request('https://fixture.test/api/ai/class-ask',{method:'POST',body:JSON.stringify(b)});
for(const lang of ['en','zh'])for(const audience of ['kid','child','teen','adult']){
 let calls=0,prompt='';const kv=new Map();
 const env={SESSION_STATE:{get:async k=>kv.get(k),put:async(k,v)=>kv.set(k,v)},AI:{run:async(m,o)=>{calls++;prompt=o.messages[0].content;return{response:lang==='zh'?'ZH: 这是礼貌的表达。\nKO: 공손한 표현이에요.':'EN: It is polite.\nKO: 공손한 표현이에요.'};}}};
 const r=await M.handleClassAsk(request({q:'무슨 뜻인가요?',lang,audience,title:'BTS 1',lines:['Current sentence','Previous correction: was → now']}),env,{json,linkRule:'SIMPLE ENGLISH LINK RULE'}),d=await r.json();
 ck(r.status===200&&d.ok&&typeof d[lang==='zh'?'zh':'en']==='string','help contract '+lang+'/'+audience);
 ck(calls===1&&prompt.includes('BTS 1')&&prompt.includes('Previous correction: was → now')&&prompt.includes(audience),'exact supplied context/age reaches one model call '+lang+'/'+audience);
 ck(lang==='zh'?!prompt.includes('SIMPLE ENGLISH LINK RULE')&&prompt.includes('ZH:'):prompt.includes('EN:'),'language rules remain separate '+lang+'/'+audience);
 ck([...kv.keys()].every(k=>k.startsWith('classaskcap:')),'help writes only existing quota, no chat/fix/reward history '+lang+'/'+audience);
}
for(const raw of ['EN: This is English.\nKO: 영어예요.','ZH: 사과예요','ZH: <img src=x>苹果','ZH: English only','[object Object]',null])ck(M.parseClassAskZh(raw)===null,'reject invalid Chinese output '+String(raw));
ck(M.parseClassAskZh('ZH: 苹果。\nKO: 사과예요.').zh==='苹果。','valid Chinese parser');
ck(M.parseClassAsk('EN: Original English.\nKO: 영어예요.').en==='Original English.','existing English parser preserved');
let blockedCalls=0;const capped={AI:{run:async()=>{blockedCalls++;}},SESSION_STATE:{get:async()=>String(M.CLASS_ASK_MAX_PER_IP_DAY)}};
const r=await M.handleClassAsk(request({q:'why',lang:'zh'}),capped,{json});ck(r.status===429&&blockedCalls===0,'Chinese help retains shared daily cap before model call');
let retries=0;const broken={AI:{run:async()=>{retries++;return{response:'EN: English fallback is not Chinese.'};}},SESSION_STATE:{get:async()=>null,put:async()=>{}}};
const failed=await M.handleClassAsk(request({q:'why',lang:'zh'}),broken,{json});ck(failed.status===503&&retries===M.CLASS_ASK_MODELS.length,'malformed Chinese is not shown as an explanation');
const flow=readFileSync(new URL('../cloudflare-deploy/public/js/warmup-flow.js',import.meta.url),'utf8');
const files=[...flow.matchAll(/file:'([^']+)'/g)].map(m=>m[1]);
const originalScenes=['bakery','restaurant','warmup-shopping','library','playground','warmup-gardening','airport','train','beach','space','castle','camping','aquarium','soccer'];
ck(new Set(files).size===files.length&&originalScenes.every(file=>files.includes(file)),'original scene assets remain distinct and available');
ck(files.includes('hf-runway')&&files.includes('hf-raft'),'recovered runway and raft are connected to the scene catalog');
for(const file of files){const url=new URL('../cloudflare-deploy/public/img/write-scenes/'+file+'.webp',import.meta.url);ck(existsSync(url)&&statSync(url).size>0&&statSync(url).size<160000,'nonempty local static asset exists and is under 160KB: '+file);}
console.log('warmup_flow_contract_harness PASS '+passed+' / FAIL 0');
