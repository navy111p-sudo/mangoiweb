import assert from 'node:assert/strict';
import { classifyRootCause, isBadWindow } from '../cloudflare-deploy/src/vc-root-cause.ts';

let pass=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);pass++;};

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'HOME',avg_loss:5},
  {role:'teacher',teacher_network_type:'HOME',rx_conceal:8}
]).category,'HOME_TEACHER_NETWORK','HOME only');

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'OFFICE',avg_loss:5},
  {role:'teacher',teacher_network_type:'OFFICE',rx_freeze:1}
]).category,'OFFICE_TEACHER_NETWORK','OFFICE only');

eq(classifyRootCause([
  {role:'student',avg_loss:5},{role:'student',rx_aloss:5}
]).category,'STUDENT_NETWORK','student only');

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'HOME',avg_loss:5,path:'relay'},
  {role:'teacher',teacher_network_type:'OFFICE',avg_loss:5,path:'relay'}
]).category,'STUN_TURN','relay-only evidence');

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'HOME',avg_loss:5,path:'direct'},
  {role:'teacher',teacher_network_type:'OFFICE',avg_loss:5,path:'direct'}
]).category,'COMMON_WEBRTC','both teacher groups');

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'HOME',avg_loss:5},
  {role:'teacher',teacher_network_type:'HOME',avg_loss:5},
  {role:'teacher',teacher_network_type:'UNKNOWN',avg_loss:5}
]).category,'UNKNOWN','UNKNOWN teacher window blocks HOME-only attribution');

eq(classifyRootCause([
  {role:'teacher',teacher_network_type:'OFFICE',avg_loss:5},
  {role:'teacher',teacher_network_type:'OFFICE',avg_loss:5},
  {role:'teacher',teacher_network_type:'UNKNOWN',avg_loss:5}
]).category,'UNKNOWN','UNKNOWN teacher window blocks OFFICE-only attribution');

eq(classifyRootCause([
  {role:'student',avg_loss:5},{role:'student',avg_loss:5},
  {role:'teacher',teacher_network_type:'UNKNOWN',avg_loss:5}
]).category,'UNKNOWN','UNKNOWN teacher window blocks student-only attribution');

eq(classifyRootCause([{role:'teacher',teacher_network_type:'UNKNOWN',avg_loss:0}]).category,'UNKNOWN','healthy unknown');
eq(isBadWindow({role:'student',rx_loss:-1}),false,'unknown -1 is not degradation');
eq(isBadWindow({role:'student',rx_conceal:5}),true,'conceal threshold');
eq(isBadWindow({role:'student',rx_freeze:1}),true,'freeze evidence');
eq(isBadWindow({role:'student',recovery_failed:true}),true,'recovery failure evidence');

console.log('vc_root_cause_harness: PASS '+pass+' / FAIL 0');
