import {verifyUidToken} from './auth-token';
import {handleEleaderApi} from './api-eleader';
import {reserveTrialLogin} from './eleader-trial-limits';
import {ELEADER_BOOK_UNITS,ELEADER_BOOK_CURRICULUM} from './eleader-book-pack';

// LOCAL PREPARATION ONLY: deliberately not wired into index.ts. The production
// staged gate remains unconditional. No password/lease/account is provisioned here.
type Env = {DB:D1Database; ELEADER_TRIAL_ONLY?:string; [key:string]:any};
type Login = (request:Request,url:URL,env:any)=>Promise<Response|null>;
const deny=(error:string,status=403)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function handleEleaderTrial(request:Request,env:Env,login:Login,now=()=>Date.now()):Promise<Response|null> {
  if(env.ELEADER_TRIAL_ONLY!=='local-synthetic')return null;
  const url=new URL(request.url),path=url.pathname;
  if(!path.startsWith('/api/'))return null;
  const isLogin=path==='/api/student/login'&&request.method==='POST';
  const isRead=['/api/ai/eleader/entry','/api/ai/eleader/state'].includes(path)&&request.method==='GET';
  // First ED trial is read-only practice: no progress/admin writes or paid routes.
  if(!isLogin&&!isRead)return deny('trial_route_disabled');
  if(request.method==='POST'&&request.headers.get('Origin')!==url.origin)return deny('same_origin_required');
  async function lease(){
    const r=await env.DB.prepare(`SELECT t.issued_at,t.expires_at,t.revoked_at FROM eleader_trial_lease t WHERE t.id=1 AND t.student_uid='ED' AND t.academy_id='ed-sandbox' AND (SELECT COUNT(*) FROM students_erp)=1 AND EXISTS(SELECT 1 FROM students_erp WHERE user_id='ED' AND length(password_hash)>0) AND (SELECT COUNT(*) FROM eleader_members)=1 AND EXISTS(SELECT 1 FROM eleader_members WHERE academy_id='ed-sandbox' AND kind='student' AND subject='ED' AND role='student')`).first<{issued_at:number;expires_at:number;revoked_at:number|null}>();
    const time=now();
    return r&&r.revoked_at===null&&Number.isSafeInteger(r.issued_at)&&Number.isSafeInteger(r.expires_at)&&r.issued_at<=time&&time<r.expires_at&&r.expires_at-r.issued_at<=3600000?r:null;
  }
  try{
    const before=await lease();if(!before)return deny('trial_expired_or_unavailable');
    let response:Response|null;
    if(isLogin){
      // Reserve before parsing/password verification; all attempts consume capacity.
      if(!await reserveTrialLogin(env.DB,now()))return deny('trial_login_limited',429);
      if(!request.headers.get('Content-Type')?.startsWith('application/json'))return deny('invalid_login',400);
      const reader=request.body?.getReader();if(!reader)return deny('invalid_login',400);
      const chunks:Uint8Array[]=[];let n=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>2048){await reader.cancel();return deny('login_too_large',413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
      const input=JSON.parse(new TextDecoder().decode(bytes));
      if(typeof input.user_id!=='string'||input.user_id.toUpperCase()!=='ED'||typeof input.password!=='string'||input.password.length<1||input.handoff)return deny('invalid_login',401);
      // Approved isolated ED password policy; actual hash still verified below.
      // This password alone never authorizes voice: trial20 requires the owner code.
      // Existing password verification/token issuance, with bounded known fields only.
      response=await login(new Request(url,{method:'POST',headers:request.headers,body:JSON.stringify({user_id:'ED',password:input.password})}),url,env);
    }else{
      const authorization=request.headers.get('Authorization')||'';
      const uid=authorization.startsWith('Bearer ')?await verifyUidToken(authorization.slice(7),env):null;
      if(uid!=='ED')return deny('trial_student_required',401);
      if(path!=='/api/ai/eleader/entry'&&url.searchParams.get('academy')!=='ed-sandbox')return deny('trial_tenant_required');
      response=await handleEleaderApi(request,url,{...env,ELEADER_PILOT:'on',ELEADER_LIVE_AI:'off'} as any);
    }
    const after=await lease();
    // Expiry/revocation while login or a read is in-flight cannot release a token/data.
    if(!after||after.issued_at!==before.issued_at||after.expires_at!==before.expires_at)return deny('trial_expired_or_unavailable');
    if(response?.ok&&path==='/api/ai/eleader/state')return Response.json({...await response.json() as object,
      // Explicit isolated ED read-only preset. No synthetic progress or DB writes.
      units:ELEADER_BOOK_UNITS,assignments:ELEADER_BOOK_UNITS.map(u=>({student_uid:'ED',unit_id:u.id})),progress:[],
      curriculum:ELEADER_BOOK_CURRICULUM,
      trial:{read_only:true,expires_at:after.expires_at}},{headers:{'Cache-Control':'no-store'}});
    return response||deny('trial_unavailable',503);
  }catch{return deny('trial_unavailable',503);}
}
