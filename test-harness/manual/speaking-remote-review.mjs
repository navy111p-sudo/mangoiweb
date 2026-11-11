// Pinned remote review reproduction, not a production or live evaluator test.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../../cloudflare-deploy/package.json',import.meta.url));
const ref='42e936283a9857155785a5cf2b0302416a766eed';
const source=execFileSync('git',['show',ref+':cloudflare-deploy/src/ai-speaking-session.ts'],{encoding:'utf8'});
const dir=mkdtempSync(join(tmpdir(),'speaking-remote-review-')),sql=new DatabaseSync(':memory:'),originalFetch=globalThis.fetch;
try{
 const out=join(dir,'review.mjs');
 await require('esbuild').build({stdin:{contents:source+'\nexport {signUidToken} from "./auth-token";export {creditFriendAward} from "./ai-friend-point-credit";',loader:'ts',resolveDir:resolve('cloudflare-deploy/src')},outfile:out,bundle:true,format:'esm',platform:'node',plugins:[{name:'no-badge-effects',setup(build){build.onResolve({filter:/^\.\/api-games-badges$/},()=>({path:'badges',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function checkAndAwardBadges(){}'}));}}]});
 const M=await import(pathToFileURL(out));
 const stmt=(text,args=[])=>({sql:text,args,bind(...values){return stmt(text,values);},async first(){return sql.prepare(text).get(...args)||null;},async all(){return{success:true,results:sql.prepare(text).all(...args)};},async run(){const r=sql.prepare(text).run(...args);return{meta:{changes:Number(r.changes)}};}});
 let inferences=0;
 const env={DB:{prepare:stmt,async batch(items){sql.exec('BEGIN IMMEDIATE');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out;}catch(error){sql.exec('ROLLBACK');throw error;}}},ROOM_JWT_SECRET:'local-review-fixture-only-secret',AI:{async run(){inferences++;return{response:JSON.stringify({skills:{grammar:99,vocabulary:99,sentence:99}})};}}};
 globalThis.fetch=async()=>{throw new Error('Live network forbidden');};
 const pointSource=readFileSync('cloudflare-deploy/src/api-points.ts','utf8');
 for(const table of ['student_points','point_transactions','point_rule_log','point_awards','point_rules'])sql.exec(pointSource.match(new RegExp('`(CREATE TABLE IF NOT EXISTS '+table+' \\([\\s\\S]*?;)`'))[1]);
 const uid='review-fixture',token=await M.signUidToken(uid,env),url=new URL('https://local.test/api/ai/speaking-progress');
 const request=body=>new Request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const start=await(await M.handleSpeakingSession(request({action:'start',app:'friend'}),url,env)).json();
 const body={progress_session:start.sessionId,progress_turn:'fixture-turn'};
 await M.recordSpeakingTurn(request(body),env,body,{app:'friend',student:'Hello',assistant:'What do you like?'});
 const paid=await M.creditFriendAward(env.DB,uid,crypto.randomUUID(),'ai_friend_chat');assert.equal(paid,2);
 const finished=await(await M.handleSpeakingSession(request({action:'finish',sessionId:start.sessionId}),url,env)).json();
 assert.equal(finished.ok,true);assert.equal(inferences,1);
 assert.equal(finished.result.evaluationStatus,'measured');assert.equal(finished.result.skills.grammar,99);assert.equal(finished.result.skills.sentence,99);
 assert.equal(finished.result.score,null);
 assert.equal(finished.result.rewards.pointsBalance,2);assert.equal(finished.result.rewards.pointsEarned,0,'incompatible session metadata loses attribution after a naive merge');
 console.log(JSON.stringify({ref,fixtureOnly:true,recordedStudentWords:1,evaluationStatus:finished.result.evaluationStatus,acceptedFixtureScores:finished.result.skills,overall:finished.result.score,compatibilityProbe:{actualAtomicAward:paid,reportedSessionEarned:finished.result.rewards.pointsEarned},liveProviderCalls:0}));
 console.log('REVIEW BLOCKER: uncalibrated model numbers are marked measured; this fixture is not a real learner assessment');
}finally{globalThis.fetch=originalFetch;sql.close();rmSync(dir,{recursive:true,force:true});}
