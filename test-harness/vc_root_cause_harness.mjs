import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../cloudflare-deploy/src/vc-root-cause.ts', import.meta.url), 'utf8')
  .replace(/export type[\s\S]*?;\n/g, '')
  .replace(/export interface[\s\S]*?\n}\n/g, '')
  .replace(/export function /g, 'function ')
  .replace(/: QualityWindow\[\]/g, '')
  .replace(/: QualityWindow/g, '')
  .replace(/: Diagnosis/g, '')
  .replace(/: unknown/g, '')
  .replace(/: n is number/g, '')
  .replace(/\nconst known/, '\nconst known');
const ctx={}; vm.createContext(ctx); vm.runInContext(src+'\nthis.classifyRootCause=classifyRootCause;this.isBadWindow=isBadWindow;',ctx);
let pass=0; const check=(v,m)=>{assert.ok(v,m);pass++;};
const c=ctx.classifyRootCause;
check(c([{role:'teacher',teacher_network_type:'HOME',avg_loss:5},{role:'teacher',teacher_network_type:'HOME',rx_conceal:8}]).category==='HOME_TEACHER_NETWORK','HOME only');
check(c([{role:'teacher',teacher_network_type:'OFFICE',avg_loss:5},{role:'teacher',teacher_network_type:'OFFICE',rx_freeze:1}]).category==='OFFICE_TEACHER_NETWORK','OFFICE only');
check(c([{role:'student',avg_loss:5},{role:'student',rx_aloss:5}]).category==='STUDENT_NETWORK','student only');
check(c([{role:'teacher',teacher_network_type:'HOME',avg_loss:5,path:'relay'},{role:'teacher',teacher_network_type:'OFFICE',avg_loss:5,path:'relay'}]).category==='STUN_TURN','relay only has priority when evidence isolates relay');
check(c([{role:'teacher',teacher_network_type:'HOME',avg_loss:5,path:'direct'},{role:'teacher',teacher_network_type:'OFFICE',avg_loss:5,path:'direct'}]).category==='COMMON_WEBRTC','both groups');
check(c([{role:'teacher',teacher_network_type:'UNKNOWN',avg_loss:0}]).category==='UNKNOWN','healthy/unknown does not invent cause');
check(ctx.isBadWindow({role:'student',rx_loss:-1})===false,'unknown -1 is not bad');
check(ctx.isBadWindow({role:'student',rx_conceal:5})===true,'conceal threshold');
console.log('vc_root_cause_harness: PASS '+pass+' / FAIL 0');
