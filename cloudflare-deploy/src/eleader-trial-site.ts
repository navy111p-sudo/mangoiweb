// Dedicated isolated deployment only. Never imported by production index.ts.
export const TRIAL_HOST='mangoiweb-eleader-ed-trial.navy111p.workers.dev';
export async function trialSiteReady(request:Request,env:any):Promise<boolean>{
 const u=new URL(request.url);
 if(u.protocol!=='https:'||u.host!==TRIAL_HOST||env.ELEADER_TRIAL_ACTIVATION!=='owner-approved-61-040-v1'||env.ELEADER_TRIAL_ACCOUNT!=='7ae16a3c4bcc84743c70828a5156ebb3'||env.ELEADER_TRIAL_DATABASE!=='mangoi-eleader-ed-trial'||!/^[a-f0-9-]{36}$/.test(env.ELEADER_TRIAL_DATABASE_ID||'')||env.ELEADER_TRIAL_ONLY!=='local-synthetic'||typeof env.ROOM_JWT_SECRET!=='string'||env.ROOM_JWT_SECRET.length<32||!env.AI||typeof env.AI.run!=='function')return false;
 try{return !!await env.DB.prepare("SELECT 1 FROM eleader_trial_site WHERE id=1 AND database_id=? AND worker_name='mangoiweb-eleader-ed-trial' AND account_id='7ae16a3c4bcc84743c70828a5156ebb3' AND approved=1").bind(env.ELEADER_TRIAL_DATABASE_ID).first();}catch{return false;}
}
