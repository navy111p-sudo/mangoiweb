// Dedicated isolated entry point. Production index never imports this file.
// Reuses the existing application's static UI and student password verification.
// Never bind production DB or scheduled triggers. AI is restricted to the gated trial.
import {handleTrial20,runTrial20LiveSession} from './eleader-trial20';
import {trialSiteReady} from './eleader-trial-site';
import {trial20CloudflareProvider} from './eleader-trial20-provider';
import {handleEleaderTrial} from './eleader-trial';
import {handleStudentsApi} from './api-students';
export default {
  async fetch(request:Request,env:any):Promise<Response>{
    const url=new URL(request.url);
    const ready=await trialSiteReady(request,env);
    if(url.pathname.startsWith('/api/ai/eleader/trial20/'))return ready?runTrial20LiveSession(request,env,trial20CloudflareProvider(env.AI)):handleTrial20(request);
    if(url.pathname.startsWith('/api/')){
      if(!ready)return Response.json({error:'trial_disabled'},{status:403,headers:{'Cache-Control':'no-store'}});
      const trialResponse=await handleEleaderTrial(request,env,handleStudentsApi);
      if(ready&&url.pathname==='/api/ai/eleader/state'&&trialResponse?.ok){const data:any=await trialResponse.json();if(data.trial&&data.role==='student')data.trial.voice_mode='cloudflare';return Response.json(data,{headers:trialResponse.headers});}
      return trialResponse||Response.json({error:'trial_disabled'},{status:404,headers:{'Cache-Control':'no-store'}});
    }
    if(!['GET','HEAD'].includes(request.method)||!env.ASSETS)return new Response('Not found',{status:404});
    const r=await env.ASSETS.fetch(request);const headers=new Headers(r.headers);
    headers.set('Permissions-Policy',ready?'microphone=(self), camera=(), display-capture=()':'microphone=(), camera=(), display-capture=()');
    headers.set('Content-Security-Policy',ready?"connect-src 'self'; media-src blob:; frame-src 'self'; object-src 'none'":"connect-src 'self'; media-src 'none'; frame-src 'self'; object-src 'none'");
    headers.set('Cache-Control','no-store');
    return new Response(r.body,{status:r.status,headers});
  }
};
