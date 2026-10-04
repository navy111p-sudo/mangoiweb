// Repeat approved local integration checks; no live HTTP, DB, provider or media.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>process.argv.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const mode=arg('--mode')||'focused';
if(!['focused','fast'].includes(mode))throw Error('mode must be focused or fast');
const rounds=Number(arg('--rounds')||(mode==='fast'?2:3));
if(!Number.isInteger(rounds)||rounds<1||rounds>10)throw Error('rounds must be 1–10');
const out=resolve(root,arg('--output')||'docs/integration-seven-track/evidence/focused');
mkdirSync(out,{recursive:true});
const guard=resolve(root,'test-harness/helpers/offline-network-guard.cjs');
const focusedSuites=[
 'vc_network_epoch','webrtc_sandbox_guard','vc_office_recovery',
 'ai_voice_latency','warmup_voice_latency','speech_preferences_lifecycle',
 'speech_preferences_fault','speech_preferences_sqlite','game_vocab_account_race',
 'daily_handover','daily_handover_reminder_delivery','handover_pending_delivery','daily_handover_client_race',
 'payment_schedule_integrity','c24_mirror_identity','c24_mirror_move_sync',
 'student_schedule_lifecycle_sync','weekly_drag_change_cutoff','student_entitlement_contract','offline_network_guard'
];
const suites=mode==='fast'?['repository_fast']:focusedSuites;
const env={PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR||out,
 NODE_OPTIONS:'--require='+guard,npm_config_offline:'true',npm_config_update_notifier:'false',
 SKIP_LIVE_PROBE:'1',MANGO_BASE:'',BASE_URL:'',TZ:'UTC'};
if(process.env.SystemRoot)env.SystemRoot=process.env.SystemRoot;
const rows=[];
for(let round=1;round<=rounds;round++)for(const suite of suites){
 const file=resolve(root,mode==='fast'?'test-harness/run.mjs':'test-harness/'+suite+'_harness.mjs');
 const args=mode==='fast'?[file,'--fast']:[file];
 const networkLog=resolve(out,suite+'-'+round+'-blocked-network.log');
 writeFileSync(networkLog,'');
 const t=Date.now(), logPath=resolve(out,suite+'-'+round+'.log'), fd=openSync(logPath,'w');
 // Direct file descriptors keep stdout synchronous, including legacy process.exit().
 let r;try{r=spawnSync(process.execPath,args,{cwd:root,env:{...env,MANGOI_OFFLINE_NETWORK_LOG:networkLog},stdio:['ignore',fd,fd],timeout:mode==='fast'?600000:180000});}finally{closeSync(fd);}
 const log=readFileSync(logPath,'utf8');
 const denied=existsSync(networkLog)?readFileSync(networkLog,'utf8').trim().split('\n').filter(Boolean).length:0;
 const counts=mode==='fast'?log.match(/PASS (\d+)\s+.*SKIP\(E2E\) (\d+)\s+.*FAIL (\d+)\s+\(총 (\d+)\)/):null;
 const row={suite,round,gateCounts:counts?{passed:Number(counts[1]),excluded:Number(counts[2]),failed:Number(counts[3]),total:Number(counts[4])}:undefined,exit:r.status,signal:r.signal,elapsedMs:Date.now()-t,blockedTransportAttempts:denied,pass:r.status===0&&!r.error&&denied===0&&(mode!=='fast'||(!!counts&&Number(counts[3])===0))&&(suite!=='student_schedule_lifecycle_sync'||/Student schedule lifecycle sync: PASS \d+ \/ FAIL 0/.test(log))};rows.push(row);
 console.log(JSON.stringify(row));
}
const result={scope:'offline synthetic integration; no browser/media/provider validation',mode,rounds,suites:suites.length,passedRuns:rows.filter(x=>x.pass).length,failedRuns:rows.filter(x=>!x.pass).length,rows};
writeFileSync(resolve(out,'summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,rows:undefined}));
if(result.failedRuns)process.exitCode=1;
