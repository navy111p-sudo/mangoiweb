/** Server-generated, authenticated observations only. No public write endpoint.
 * Does not store audio or full transcripts; no text-derived numeric skill scores.
 */
export const SPEAKING_GROWTH_DDL = [
  `CREATE TABLE IF NOT EXISTS speaking_growth_events (event_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,session_id TEXT NOT NULL,feature TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,grade TEXT,correction_json TEXT,skills_json TEXT NOT NULL,source TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_speaking_growth_user_time ON speaking_growth_events(user_id,created_at)`,
];
const schemaReady=new WeakSet<object>();
export async function logSpeakingGrowth(db: D1Database, uid: string, feature: 'warmup'|'friend'|'speech-coach', p: any, eventKey: string, audio?: {skills:Record<string,number>;source:string}) {
  if (!uid || /^(guest|anon)/i.test(uid) || !p || p.source!=='warmup-verified-turn' || typeof p.sessionId!=='string' || !p.sessionId || p.sessionId.length>200 || !eventKey || eventKey.length>200) return false;
  const skills:Record<string,number>={};
  if(audio){
    if(audio.source!=='azure-server-reference-sentence')return false;
    for(const key of ['pronunciation','fluency']){const v=audio.skills[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100)skills[key]=v;}
    if(Object.keys(skills).length!==2)return false;
  }
  const correction=!audio&&p.correction&&typeof p.correction.was==='string'&&typeof p.correction.now==='string'?{was:p.correction.was.slice(0,300),now:p.correction.now.slice(0,300)}:null;
  try{
    if(!schemaReady.has(db)){for(const ddl of SPEAKING_GROWTH_DDL)await db.prepare(ddl).run();schemaReady.add(db);}
    await db.prepare(`INSERT OR IGNORE INTO speaking_growth_events (event_id,user_id,session_id,feature,kind,created_at,grade,correction_json,skills_json,source) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(JSON.stringify([uid,feature,p.sessionId,eventKey]),uid,p.sessionId,feature,audio?'reference-reading':'text-chat',Date.now(),!audio&&['perfect','partial','incomplete'].includes(p.grade)?p.grade:null,correction?JSON.stringify(correction):null,JSON.stringify(skills),audio?.source||'server-confirmed-chat').run();
    return true;
  }catch{console.warn('[speaking-growth] write unavailable');return false;}
}

export async function readSpeakingGrowth(db: D1Database, uid: string, start: number, end: number) {
  if(!uid||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
  try{
    const row:any=await db.prepare(`SELECT COUNT(*) AS turns,COUNT(DISTINCT feature || ':' || session_id) AS sessions,SUM(CASE WHEN grade='perfect' THEN 1 ELSE 0 END) AS perfect,SUM(CASE WHEN grade='partial' THEN 1 ELSE 0 END) AS partial,SUM(CASE WHEN grade='incomplete' THEN 1 ELSE 0 END) AS incomplete FROM speaking_growth_events WHERE user_id=? AND created_at>=? AND created_at<?`).bind(uid,start,end).first();
    const audio:any=await db.prepare(`SELECT COUNT(*) AS samples,AVG(json_extract(skills_json,'$.pronunciation')) AS pronunciation,AVG(json_extract(skills_json,'$.fluency')) AS fluency FROM speaking_growth_events WHERE user_id=? AND created_at>=? AND created_at<? AND kind='reference-reading' AND source='azure-server-reference-sentence'`).bind(uid,start,end).first();
    const fixes:any=await db.prepare(`SELECT correction_json FROM speaking_growth_events WHERE user_id=? AND created_at>=? AND created_at<? AND correction_json IS NOT NULL ORDER BY created_at DESC,event_id DESC LIMIT 2`).bind(uid,start,end).all();
    const measured=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=100?Math.round(v):null;
    return {turns:Number(row?.turns||0),sessions:Number(row?.sessions||0),grades:{perfect:Number(row?.perfect||0),partial:Number(row?.partial||0),incomplete:Number(row?.incomplete||0)},reading:{samples:Number(audio?.samples||0),pronunciation:measured(audio?.pronunciation),fluency:measured(audio?.fluency)},skills:{pronunciation:null,fluency:null,grammar:null,vocabulary:null,sentence:null},corrections:(fixes.results||[]).map((x:any)=>JSON.parse(x.correction_json)),basis:'authenticated-server-events',start,end};
  }catch{return null;}
}
