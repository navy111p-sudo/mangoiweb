import {trialSiteReady} from './eleader-trial-site';
import {verifyUidToken} from './auth-token';
import {ELEADER_BOOK_UNITS,bookQuestionContext} from './eleader-book-pack';
export const TRIAL20_MODELS={stt:'@cf/openai/whisper-large-v3-turbo',chat:'@cf/meta/llama-3.3-70b-instruct-fp8-fast',tts:'@cf/deepgram/aura-2-en'} as const;
export const TRIAL20_CAP=400_000_000; // US$0.40, nanodollars, never client supplied.
const policy='adult-trial20-v1';
type Kind='stt'|'chat'|'tts';
export type Trial20Provider={mode:'mock'|'cloudflare';stt(wav:Uint8Array):Promise<string>;chat(messages:{role:string;content:string}[]):Promise<string>;tts(text:string):Promise<Uint8Array>};
type Env={DB:D1Database;ROOM_JWT_SECRET?:string;[key:string]:any};
const reply=(error:string,status=403)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function trial20Hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
async function read(request:Request,max:number){const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0;const parts:Uint8Array[]=[];try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>max){await reader.cancel();throw Error('size');}parts.push(r.value);}}finally{reader.releaseLock();}const all=new Uint8Array(size);let i=0;for(const p of parts){all.set(p,i);i+=p.length;}return all;}
export function trial20Wav(wav:Uint8Array):boolean {
 if(wav.length<46||wav.length>480044)return false;
 const d=new DataView(wav.buffer,wav.byteOffset,wav.byteLength),s=(a:number,n:number)=>String.fromCharCode(...wav.slice(a,a+n));
 return s(0,4)==='RIFF'&&s(8,4)==='WAVE'&&s(12,4)==='fmt '&&d.getUint32(16,true)===16&&d.getUint16(20,true)===1&&d.getUint16(22,true)===1&&d.getUint32(24,true)===16000&&d.getUint32(28,true)===32000&&d.getUint16(32,true)===2&&d.getUint16(34,true)===16&&s(36,4)==='data'&&d.getUint32(40,true)===wav.length-44&&d.getUint32(4,true)===wav.length-8&&(wav.length-44)%2===0;
}
// Fail closed public gate. An env flag or client parameter cannot enable real calls.
export async function handleTrial20(_request:Request):Promise<Response>{return reply('trial20_not_released');}
/** Local harness/internal preparation only. NOT invoked by the deployed Worker.
 * Real provider remains excluded until plan, credentials and technical gates pass. */
export async function runTrial20MockSession(request:Request,env:Env,provider:Trial20Provider,now=()=>Date.now()):Promise<Response>{
 if(env.ELEADER_TRIAL20_LOCAL!=='mock-only'||provider.mode!=='mock')return reply('trial20_not_released');
 return runSession(request,env,provider,now,'mock-only');
}
export async function runTrial20LiveSession(request:Request,env:Env,provider:Trial20Provider):Promise<Response>{
 if(provider.mode!=='cloudflare'||!await trialSiteReady(request,env))return reply('trial20_not_released');
 return runSession(request,env,provider,()=>Date.now(),'cloudflare');
}
async function runSession(request:Request,env:Env,provider:Trial20Provider,now:()=>number,mode:'mock-only'|'cloudflare'):Promise<Response>{
 const url=new URL(request.url),action=url.pathname.split('/').pop();
 if(request.method!=='POST'||request.headers.get('Origin')!==url.origin)return reply('same_origin_post_required');
 const authorization=request.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return reply('student_required',401);
 const token=authorization.slice(7);
 try{
  if(await verifyUidToken(token,env)!=='ED')return reply('student_required',401);
  const authHash=await trial20Hash(token);
  const accessSQL=`EXISTS(SELECT 1 FROM eleader_trial_lease t WHERE t.id=1 AND t.student_uid='ED' AND t.academy_id='ed-sandbox' AND t.issued_at<=? AND t.expires_at>? AND t.expires_at-t.issued_at<=3600000 AND t.revoked_at IS NULL)
    AND (SELECT COUNT(*) FROM students_erp)=1 AND EXISTS(SELECT 1 FROM students_erp WHERE user_id='ED' AND length(password_hash)>0)
    AND (SELECT COUNT(*) FROM eleader_members)=1 AND EXISTS(SELECT 1 FROM eleader_members m JOIN eleader_academies a ON a.id=m.academy_id WHERE m.subject='ED' AND m.kind='student' AND m.role='student' AND m.academy_id='ed-sandbox' AND a.enabled=1)`;
  const lease=async()=>!!await env.DB.prepare(`SELECT 1 WHERE ${accessSQL}`).bind(now(),now()).first();
  if(!await lease())return reply('trial_expired_or_unavailable');
  if(action==='start'){
   if(!request.headers.get('Content-Type')?.startsWith('application/json'))return reply('invalid_body',400);
   const attempt=await env.DB.prepare(`UPDATE eleader_trial20_owner SET attempts=attempts+1 WHERE id=1 AND attempts<5 AND used_at IS NULL AND expires_at>? RETURNING id`).bind(now()).first();
   if(!attempt)return reply('start_unavailable');
   const body=JSON.parse(new TextDecoder().decode(await read(request,1024)));
   if(!body||!/^[a-f0-9]{32}$/.test(body.code)||!ELEADER_BOOK_UNITS.some(b=>b.id===body.book)||body.policy!==policy||body.adult!==true||body.processing!==true)return reply('start_unavailable');
   const codeHash=await trial20Hash(body.code),session=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join(''),sessionHash=await trial20Hash(session);
   const row=await env.DB.prepare(`UPDATE eleader_trial20_owner SET used_at=?,session_hash=?,auth_hash=?,book_id=? WHERE id=1 AND used_at IS NULL AND code_hash=? AND expires_at>? AND policy=? AND ${accessSQL} RETURNING expires_at`).bind(now(),sessionHash,authHash,body.book,codeHash,now(),policy,now(),now()).first<{expires_at:number}>();
   if(!row||request.signal.aborted||!await lease())return reply('start_unavailable');
   return Response.json({ok:true,book:body.book,expires_at:row.expires_at,mode},{headers:{'Cache-Control':'no-store','Set-Cookie':`__Host-ed-trial20=${session}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((row.expires_at-now())/1000))}`}});
  }
  const session=/\b__Host-ed-trial20=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('Cookie')||'')?.[1];
  if(!session)return reply('owner_required');
  const sessionHash=await trial20Hash(session);
  const owner=async()=>env.DB.prepare(`SELECT book_id,next_step,expires_at FROM eleader_trial20_owner WHERE id=1 AND used_at IS NOT NULL AND session_hash=? AND auth_hash=? AND expires_at>? AND policy=? AND ${accessSQL}`).bind(sessionHash,authHash,now(),policy,now(),now()).first<{book_id:string;next_step:number;expires_at:number}>();
  const current=await owner();if(!current)return reply('owner_expired_or_changed');
  const book=ELEADER_BOOK_UNITS.find(b=>b.id===current.book_id);if(!book)return reply('invalid_book');
  if(action!=='question'&&action!=='turn')return reply('route_disabled');
  if(request.headers.get('X-Trial20-Policy')!==policy||request.headers.get('X-Trial20-Confirm')!=='yes')return reply('processing_confirmation_required');
  const step=Number(request.headers.get('X-Trial20-Step')),key=request.headers.get('X-Trial20-Request')||'';
  if(!request.headers.has('X-Trial20-Step')||!Number.isInteger(step)||step!==current.next_step||step<0||step>20||!/^[-a-zA-Z0-9_]{16,80}$/.test(key)||(step===0)!==(action==='question'))return reply('invalid_step_or_request',409);
  const validOwner=async(expected=step)=>{if(mode==='cloudflare'&&!await trialSiteReady(request,env))return false;const row=await owner();return !!row&&row.book_id===current.book_id&&row.next_step===expected&&row.expires_at===current.expires_at;};
  let wav:Uint8Array|null=null,skip=false;
  try{if(step>0){
   if(request.headers.get('Content-Type')==='audio/wav'){wav=await read(request,480044);if(!trial20Wav(wav))return reply('invalid_audio',400);}
   else if(request.headers.get('Content-Type')?.startsWith('application/json')){const b=JSON.parse(new TextDecoder().decode(await read(request,128)));if(b?.skip!==true||Object.keys(b).length!==1)return reply('invalid_body',400);skip=true;}
   else return reply('invalid_body',400);
  }}catch{return reply('invalid_body',400);}
  if(request.signal.aborted)return reply('canceled',409);
  const claimed=await env.DB.prepare(`INSERT OR IGNORE INTO eleader_trial20_claims(step,request_key)
   SELECT ?,? WHERE EXISTS(SELECT 1 FROM eleader_trial20_owner WHERE id=1 AND next_step=? AND session_hash=? AND auth_hash=? AND expires_at>? AND policy=?) AND ${accessSQL} RETURNING step`).bind(step,key,step,sessionHash,authHash,now(),policy,now(),now()).first();
  if(!claimed)return reply('step_already_used_or_unavailable',409);
  async function call<T>(kind:Kind,fn:()=>Promise<T>):Promise<T>{
   if(request.signal.aborted||!await validOwner())throw Error('access');
   const cost=kind==='stt'?128250:kind==='chat'?7392480:step===0?3000000:9600000;
   const max=kind==='tts'?21:20;
   const reserved=await env.DB.prepare(`INSERT OR IGNORE INTO eleader_trial20_calls(step,kind,request_key,reserved_nanos)
    SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM eleader_trial20_calls WHERE kind=?)<?
    AND COALESCE((SELECT SUM(reserved_nanos) FROM eleader_trial20_calls),0)+?<=?
    AND EXISTS(SELECT 1 FROM eleader_trial20_owner WHERE id=1 AND next_step=? AND session_hash=? AND auth_hash=? AND expires_at>? AND policy=?) AND ${accessSQL} RETURNING step`).bind(step,kind,key+'-'+kind,cost,kind,max,cost,TRIAL20_CAP,step,sessionHash,authHash,now(),policy,now(),now()).first();
   if(!reserved)throw Error('budget');
   try{if(request.signal.aborted||!await validOwner())throw Error('access');const result=await fn();
    if(request.signal.aborted||!await validOwner())throw Error('access');
    await env.DB.prepare("UPDATE eleader_trial20_calls SET status='succeeded' WHERE step=? AND kind=?").bind(step,kind).run();return result;
   }catch{await env.DB.prepare("UPDATE eleader_trial20_calls SET status='unknown' WHERE step=? AND kind=? AND status='reserved'").bind(step,kind).run();throw Error('provider_or_access');}
  }
  try{
   let spoken=book.questions[0].question;
   if(step>0){
    let feedback='We can skip this one.';
    if(!skip){
     const answer=await call('stt',()=>provider.stt(wav!));
     if(typeof answer!=='string'||!answer.trim()||answer.length>120||/@|\d{3,}|[<>]|ignore.{0,20}instructions|system prompt/i.test(answer))throw Error('unrecognized_or_unsafe');
     const q=book.questions[step-1];
     const messages=[{role:'system',content:bookQuestionContext(book.id,q.id)!+' For this fixed twenty-question trial, produce ONLY a JSON object with example:string, one optional complete sentence of 2 to 10 words. Preserve explicit negative meaning and the current question topic. Do NOT ask a question; the server appends it. Never claim correctness. Use only simple vocabulary from the question and prepared example.'},{role:'user',content:JSON.stringify({answer})}];
     if(new TextEncoder().encode(JSON.stringify(messages)).length>6000)throw Error('input_limit');
     const raw=await call('chat',()=>provider.chat(messages));
     const parsed=JSON.parse(raw);
     const example=parsed?.example;
     const words=(value:string)=>value.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g)||[];
     const negative=(value:string)=>/\b(no|none|nope|not|never|cannot|can't|dont|don't|doesn't|shouldn't|won't)\b/i.test(value);
     const grammar='I you we it a an the my your is am are do does not no yes can cannot should could would have has like want eat drink with in on at to for and or';
     const allowed=new Set(words(q.question+' '+q.model+' '+answer+' '+grammar));
     if(typeof example!=='string'||!/^([A-Za-z]+(?:'[A-Za-z]+)?)( [A-Za-z]+(?:'[A-Za-z]+)?){1,9}\.$/.test(example)||example.length>150||words(example).some(w=>!allowed.has(w))||/\b(kill|suicide|sex|password|address)\b/i.test(example)||negative(answer)&&!negative(example)||negative(q.model)&&!negative(example))throw Error('feedback_contract');
     const same=answer.toLowerCase().replace(/[^a-z ]/g,'').trim()===example.toLowerCase().replace(/[^a-z ]/g,'').trim();
     feedback=same?'Thanks for sharing.':['You could say: ','For example: ','You can try: '][step%3]+'"'+example+'"';
    }
    const conditional=book.book===1&&(step===1||step===3)?'Imagine a pet, or skip this question. ':'';
    spoken=feedback+' '+conditional+(step<20?book.questions[step].question:'We are done. Thank you for practicing.');
   }
   if(!/^[\x20-\x7e]+$/.test(spoken)||spoken.length>(step===0?100:320))throw Error('tts_limit');
   const audio=await call('tts',()=>provider.tts(spoken));
   if(!(audio instanceof Uint8Array)||audio.length<4||audio.length>2_000_000||!(audio[0]===0xff&&(audio[1]&0xe0)===0xe0||String.fromCharCode(...audio.slice(0,3))==='ID3'))throw Error('invalid_audio_reply');
   if(request.signal.aborted||!await validOwner())throw Error('access');
   await env.DB.prepare(`UPDATE eleader_trial20_owner SET next_step=? WHERE id=1 AND next_step=? AND session_hash=? AND auth_hash=? AND expires_at>?`).bind(step+1,step,sessionHash,authHash,now()).run();
   await env.DB.prepare("UPDATE eleader_trial20_claims SET status='succeeded' WHERE step=?").bind(step).run();
   if(request.signal.aborted||!await validOwner(step+1))throw Error('access');
   return new Response(new Uint8Array(audio).buffer,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store','X-Trial20-Next':String(step+1),'X-Trial20-Complete':String(step===20),'X-Trial20-Mode':mode}});
  }catch{await env.DB.prepare("UPDATE eleader_trial20_claims SET status='unknown' WHERE step=?").bind(step).run();return reply('turn_failed_no_retry',502);}
 }catch{return reply('trial20_unavailable',503);}
}
