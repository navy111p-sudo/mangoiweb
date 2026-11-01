// Isolated local trial only. This module never invokes any provider.
export async function reserveTrialLogin(DB:D1Database, now:number):Promise<boolean> {
  const r=await DB.prepare(`INSERT INTO eleader_trial_login_limit(id,window_start,attempts)
    VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET
    attempts=CASE WHEN window_start<=?-900000 THEN 1 ELSE attempts+1 END,
    window_start=CASE WHEN window_start<=?-900000 THEN ? ELSE window_start END
    WHERE window_start<=?-900000 OR (window_start<=? AND attempts<5)
    RETURNING attempts`).bind(now,now,now,now,now,now).first();
  return !!r;
}

export const TRIAL_VOICE_CAP = 20_000_000; // nanodollars = US$0.02
export const TRIAL_VOICE_COST = {stt:85_500,chat:8_023_320,tts:6_000_000} as const;
type Kind=keyof typeof TRIAL_VOICE_COST;
type Limits={pcmBytes?:number;sampleRate?:number;channels?:number;bits?:number;inputBytes?:number;maxTokens?:number;text?:string};
// Server-computed measurements, never trusted client duration/token declarations.
export function validTrialVoiceBounds(kind:Kind,b:Limits):boolean {
  if(kind==='stt')return b.sampleRate===16000&&b.channels===1&&b.bits===16&&Number.isInteger(b.pcmBytes)&&b.pcmBytes!>0&&b.pcmBytes!<=320000&&b.pcmBytes!%2===0;
  if(kind==='chat')return Number.isInteger(b.inputBytes)&&b.inputBytes!>0&&b.inputBytes!<=24000&&b.maxTokens===440;
  return kind==='tts'&&typeof b.text==='string'&&/^[\x20-\x7e]{1,200}$/.test(b.text);
}
/** NOT connected to HTTP routes. All prerequisites remain disabled by default.
 * lease and owner grant must be server verified by a future caller; a public JSON
 * flag must never construct this context. SQL rechecks lease on reservation.
 * An uncertain reservation never authorizes a retry. Unique kind consumes even
 * failed/unknown outcomes. No reset/refund operation exists. */
export async function reserveTrialVoice(DB:D1Database,ctx:{enabled?:boolean;ownerVerified?:boolean;lease:number},kind:Kind,key:string,bounds:Limits,now:number):Promise<boolean> {
  if(ctx.enabled!==true||ctx.ownerVerified!==true||!Object.hasOwn(TRIAL_VOICE_COST,kind)||!validTrialVoiceBounds(kind,bounds)||!/^[a-zA-Z0-9_-]{16,80}$/.test(key)||!Number.isSafeInteger(now))return false;
  const r=await DB.prepare(`INSERT OR IGNORE INTO eleader_trial_voice_budget(lease_id,kind,request_key,reserved_nanos,status)
    SELECT ?,?,?,?,'reserved' WHERE EXISTS(SELECT 1 FROM eleader_trial_lease WHERE id=1 AND student_uid='ED' AND academy_id='ed-sandbox' AND issued_at=? AND issued_at<=? AND expires_at>? AND expires_at-issued_at<=3600000 AND revoked_at IS NULL)
    AND COALESCE((SELECT SUM(reserved_nanos) FROM eleader_trial_voice_budget),0)+?<=?
    RETURNING request_key`).bind(ctx.lease,kind,key,TRIAL_VOICE_COST[kind],ctx.lease,now,now,TRIAL_VOICE_COST[kind],TRIAL_VOICE_CAP).first();
  return !!r;
}
export async function finishTrialVoice(DB:D1Database,key:string,status:'succeeded'|'failed'|'unknown'):Promise<void>{
  if(!['succeeded','failed','unknown'].includes(status))throw new Error('invalid_status');
  await DB.prepare("UPDATE eleader_trial_voice_budget SET status=? WHERE request_key=? AND status='reserved'").bind(status,key).run();
}
