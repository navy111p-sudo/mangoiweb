import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../cloudflare-deploy/src/vc-root-cause.ts', import.meta.url), 'utf8');
let pass=0;
const check=(v,m)=>{assert.ok(v,m);pass++;};

// TypeScript validity is enforced by the CI tsc gate. This dependency-free harness
// locks the evidence-first classification contract without attempting regex transpilation.
check(src.includes("export type TeacherNetworkType = 'HOME' | 'OFFICE' | 'UNKNOWN'"), 'network types are explicit');
for (const c of ['STUDENT_NETWORK','HOME_TEACHER_NETWORK','OFFICE_TEACHER_NETWORK','COMMON_WEBRTC','STUN_TURN','UNKNOWN']) {
  check(src.includes("'" + c + "'"), 'category exists: ' + c);
}
check(/avg_loss\)\s*&&\s*w\.avg_loss\s*>=\s*3/.test(src), 'send loss threshold is 3%');
check(/rx_loss\)\s*&&\s*w\.rx_loss\s*>=\s*3/.test(src), 'receive video loss threshold is 3%');
check(/rx_aloss\)\s*&&\s*w\.rx_aloss\s*>=\s*3/.test(src), 'receive audio loss threshold is 3%');
check(/rx_conceal\)\s*&&\s*w\.rx_conceal\s*>=\s*5/.test(src), 'audio conceal threshold is 5%');
check(/w\.rx_freeze\s*>\s*0/.test(src), 'freeze is degradation evidence');
check(/w\.recovery_failed\s*===\s*true/.test(src), 'failed recovery is degradation evidence');
check(src.includes("teacher_network_type === 'HOME'"), 'HOME evidence is counted');
check(src.includes("teacher_network_type === 'OFFICE'"), 'OFFICE evidence is counted');
check(src.includes("x.path === 'relay'"), 'relay evidence is counted');
check(src.includes("x.path === 'direct'"), 'direct comparison exists');
check(src.includes('The evidence is mixed or insufficient'), 'mixed evidence stays UNKNOWN');
check(src.includes('required_verification'), 'classifier requires verification');
check(src.includes('proposed_fix'), 'classifier separates proposed fixes');
console.log('vc_root_cause_harness: PASS '+pass+' / FAIL 0');
