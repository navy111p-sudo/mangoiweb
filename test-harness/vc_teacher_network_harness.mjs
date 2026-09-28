import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../cloudflare-deploy/src/vc-teacher-network.ts', import.meta.url), 'utf8')
  .replace(/export type TeacherNetworkType[^;]+;/, '')
  .replace(/export function /g, 'function ')
  .replace(/: unknown/g, '')
  .replace(/: TeacherNetworkType/g, '');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(src + '\nthis.teacherNetworkTypeFromGroup=teacherNetworkTypeFromGroup;this.sanitizeTeacherNetworkType=sanitizeTeacherNetworkType;', ctx);

let pass=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);pass++;};
eq(ctx.teacherNetworkTypeFromGroup('Home-based'),'HOME','Home-based');
eq(ctx.teacherNetworkTypeFromGroup('home based'),'HOME','home based');
eq(ctx.teacherNetworkTypeFromGroup('HOME'),'HOME','HOME');
eq(ctx.teacherNetworkTypeFromGroup('재택'),'HOME','재택');
eq(ctx.teacherNetworkTypeFromGroup('Office'),'OFFICE','Office');
eq(ctx.teacherNetworkTypeFromGroup('Office Teacher'),'OFFICE','deployed Office Teacher roster label');
eq(ctx.teacherNetworkTypeFromGroup('office-based'),'OFFICE','office-based');
eq(ctx.teacherNetworkTypeFromGroup('사무실'),'OFFICE','사무실');
eq(ctx.teacherNetworkTypeFromGroup('Head Teacher'),'UNKNOWN','manager group is not guessed');
eq(ctx.teacherNetworkTypeFromGroup(''),'UNKNOWN','empty is unknown');
eq(ctx.teacherNetworkTypeFromGroup(null),'UNKNOWN','null is unknown');
eq(ctx.sanitizeTeacherNetworkType('HOME'),'HOME','HOME accepted');
eq(ctx.sanitizeTeacherNetworkType('OFFICE'),'OFFICE','OFFICE accepted');
eq(ctx.sanitizeTeacherNetworkType('home'),'UNKNOWN','client-like lowercase not silently trusted');
eq(ctx.sanitizeTeacherNetworkType('anything'),'UNKNOWN','unknown rejected');
console.log('vc_teacher_network_harness: PASS '+pass+' / FAIL 0');
