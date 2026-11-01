import {TRIAL20_MODELS,type Trial20Provider} from './eleader-trial20';
// Fixed existing Cloudflare stack, one invocation per method, no retries/fallbacks.
// NOT called by any released route. Tests inject a fake AI binding.
export function trial20CloudflareProvider(AI:{run:(model:string,input:any)=>Promise<any>}):Trial20Provider {
 return {mode:'cloudflare',async stt(wav){
  let raw='';for(const b of wav)raw+=String.fromCharCode(b);
  const r=await AI.run(TRIAL20_MODELS.stt,{audio:btoa(raw),language:'en',task:'transcribe'});
  if(typeof r?.text!=='string')throw Error('stt_shape');return r.text;
 },async chat(messages){
  const r=await AI.run(TRIAL20_MODELS.chat,{messages,max_tokens:160,temperature:0.2});
  if(typeof r?.response!=='string')throw Error('chat_shape');return r.response;
 },async tts(text){
  const r=await AI.run(TRIAL20_MODELS.tts,{text,speaker:'asteria',encoding:'mp3'});
  if(!(r instanceof ReadableStream))throw Error('tts_shape');
  const reader=r.getReader(),parts:Uint8Array[]=[];let n=0;
  try{while(true){const x=await reader.read();if(x.done)break;if(!(x.value instanceof Uint8Array))throw Error('tts_bytes');n+=x.value.length;if(n>2_000_000){await reader.cancel();throw Error('tts_size');}parts.push(x.value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(n);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
 }};
}
