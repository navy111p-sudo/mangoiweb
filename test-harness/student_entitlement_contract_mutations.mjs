#!/usr/bin/env node
// Mutation evidence: intentionally break the complete new TS module, demand a
// failing behavioral contract suite. No production source files are modified.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), dir=mkdtempSync(join(tmpdir(),'entitlement-mutations-'));
const source=readFileSync(join(root,'cloudflare-deploy/src/student-entitlement-contract.ts'),'utf8');
const mutations=[
 ['consume_while_free','if (!activeVideos(s, from).length)', 'if (true)'],
 ['accept_partial_payment','o.paidAmount === o.expectedAmount', 'o.paidAmount > 0'],
 ['skip_subject_origin_check',"requireThat(o.studentUid === s.studentUid, 'cross_student_origin');",''],
 ['double_decrement_paid_queue','g.remainingMs -= used; elapsed -= used;', 'g.remainingMs -= used;'],
 ['ignore_selected_refund',"cl.state = 'refunded'; cl.revision++;", 'cl.revision++;'],
 ['duplicate_charge_free',"if (view.aiSource === 'video_included')", 'if (false)'],
];
let detected=0;
try{
 for(const [name,from,to] of mutations){
  if(!source.includes(from))throw Error('Mutation anchor missing: '+name);
  const path=join(dir,name+'.ts');writeFileSync(path,source.replace(from,to));
  const r=spawnSync(process.execPath,['test-harness/student_entitlement_contract_harness.mjs'],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,ENTITLEMENT_CONTRACT_SRC:path,ENTITLEMENT_SKIP_RACES:'1'}});
  const behaviorFailure=/FAIL .+: (AssertionError|EntitlementContractError|Error)/.test(r.stdout+r.stderr);
  if(r.status!==0&&behaviorFailure){detected++;console.log('DETECTED '+name);}else{console.error('MISSED '+name+' '+(r.stdout+r.stderr));}
 }
}finally{rmSync(dir,{recursive:true,force:true});}
console.log(JSON.stringify({mutants:mutations.length,detected,missed:mutations.length-detected}));process.exitCode=detected===mutations.length?0:1;
