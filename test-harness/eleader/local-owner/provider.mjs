// Owner PC only. No token refresh, credential output, retries, or remote provisioning.
import {readFileSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
const account='7ae16a3c4bcc84743c70828a5156ebb3';
const models={stt:'@cf/openai/whisper-large-v3-turbo',chat:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',tts:'@cf/deepgram/aura-2-en'};
export function readExistingOAuth(path){
 const text=readFileSync(path,'utf8');const token=/^oauth_token\s*=\s*"([^"\r\n]+)"\s*$/m.exec(text)?.[1],expiry=/^expiration_time\s*=\s*"([^"\r\n]+)"\s*$/m.exec(text)?.[1];
 const scopes=/^scopes\s*=\s*\[([\s\S]*?)\]/m.exec(text)?.[1]||'';
 if(!/"ai:(?:read|write)"/.test(scopes))throw Error('Existing OAuth lacks documented AI scope; do not expand grants automatically.');
 if(!token||!expiry||!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()+60000)throw Error('Existing OAuth is expired or nearly expired; renew separately on owner PC.');
 return {token,expiresAt:Date.parse(expiry)};
}
export function createOwnerAI({token,ledgerPath,expiresAt,transport=fetch}){
 // Exclusive durable marker forbids restart/reset under the same authorization.
 const fd=openSync(ledgerPath,'wx',0o600);writeSync(fd,JSON.stringify({authorization:'owner-61-040',expiresAt})+'\n');fsyncSync(fd);
 let total=0,counts={stt:0,chat:0,tts:0},closed=false;
 return {close(){if(!closed){closed=true;closeSync(fd);}},async run(model,input){
  if(closed||Date.now()>=expiresAt)throw Error('Trial expired');
  const kind=Object.keys(models).find(k=>models[k]===model);if(!kind)throw Error('Model denied');
  if(kind==='stt'&&(typeof input.audio!=='string'||input.audio.length>640060))throw Error('Audio limit');
  if(kind==='chat'&&(input.max_tokens!==160||Buffer.byteLength(JSON.stringify(input.messages))>6000))throw Error('Token limit');
  const maxChars=counts.tts===0?100:320;
  if(kind==='tts'&&(typeof input.text!=='string'||input.text.length>maxChars||!/^[\x20-\x7e]+$/.test(input.text)||input.speaker!=='asteria'))throw Error('Speech limit');
  const cost=kind==='stt'?128250:kind==='chat'?7392480:counts.tts===0?3000000:9600000;
  if(counts[kind]>=(kind==='tts'?21:20)||total+cost>400000000)throw Error('Budget exhausted');
  // Synchronous fsync before network: uncertain failures consume, never refund.
  counts[kind]++;total+=cost;writeSync(fd,JSON.stringify({kind,count:counts[kind],reserved_nanos:cost,total_nanos:total})+'\n');fsyncSync(fd);
  let r;try{r=await transport('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+model,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw Error('Provider result uncertain; no retry');}
  if(!r.ok)throw Error('Provider request failed; no retry');
  if(kind==='tts'){if(!r.headers.get('Content-Type')?.startsWith('audio/'))throw Error('Audio response invalid');return r.body;}
  const data=await r.json();if(!data.success||!data.result)throw Error('Provider response invalid');return data.result;
 }};
}
