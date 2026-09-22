#!/usr/bin/env node
/* 🔒 org_scope_guard_harness — 지사·대리점 계정 차단 (2026-09-22)
 *
 * 지키는 것
 *   ① 학생 랭킹(/api/admin/stats/student-rankings)은 본사 전용
 *   ② 녹화 관리자 API(/api/recordings/*)는 본사 전용
 *   ③ 녹화 재생(/api/recording/play)은 조직 세션을 «관리자» 로 인정하지 않는다
 *   그리고 셋 다 «조직인지 모르면» 막는다(fail-closed).
 *
 * 방식 — 판정 정본(src/org-scope-guard.ts)을 **실제로 돌린다**(node --experimental-strip-types).
 *   isOrgScopedRole 은 auth-admin.ts 에서 «오려 내» 쓴다(⛔ 하니스에 베끼지 않는다).
 *   배선은 라우트를 **중괄호 짝**으로 잘라 «판정을 부르는가 + 그 결과로 막는가 + SQL 보다 앞인가» 를 본다.
 *   짝: 「막는다」 옆에 반드시 「본사는 통과한다」를 둔다(없으면 «전부 막기» 도 통과한다).
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  — ' + extra : '')); }
};

/* 주석 벗기기 — 줄 단위로 블록주석 안인지 추적 + 문자열 밖의 // 줄주석 제거 */
function stripComments(t) {
  let out = '', i = 0, inBlock = false, q = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; } else { if (c === '\n') out += '\n'; i++; } continue; }
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
/* 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 */
function braceBlock(t, openIdx) {
  let d = 0;
  for (let i = openIdx; i < t.length; i++) {
    if (t[i] === '{') d++;
    else if (t[i] === '}') { d--; if (d === 0) return t.slice(openIdx, i + 1); }
  }
  return '';
}

/* ── ① 판정 정본을 실제로 돌린다 ── */
console.log('\n① 판정 정본(orgScopeVerdict·readScopeType·orgScopeDenyResponse)');
{
  const auth = read('auth-admin.ts');
  const m = auth.match(/export function isOrgScopedRole\([^)]*\)[^{]*\{/);
  check('①-0 전제: auth-admin.ts 에서 isOrgScopedRole 을 오려 냈다', !!m);
  const fn = m ? braceBlock(auth, auth.indexOf('{', m.index)) : '';
  const dir = mkdtempSync(join(tmpdir(), 'orgguard-'));
  try {
    writeFileSync(join(dir, 'auth-admin.ts'), (m ? auth.slice(m.index, auth.indexOf('{', m.index)) : '') + fn + '\n');
    writeFileSync(join(dir, 'org-scope-guard.ts'), read('org-scope-guard.ts').replace(/from '\.\/auth-admin'/, "from './auth-admin.ts'"));
    writeFileSync(join(dir, 'run.mjs'), `
import { orgScopeVerdict as V, readScopeType as R, orgScopeDenyResponse as D } from './org-scope-guard.ts';
const out = {};
out.v = {
  agency: V('agency', 'none'), branch: V('branch', 'none'), franchise: V('franchise', 'none'),
  hq: V('hq', 'staff'), none: V('none', 'staff'), teacher: V('teacher', 'teacher'),
  nullScope: V(null, 'staff'), emptyScope: V('  ', 'staff'), undef: V(undefined),
  roleOrgScopeHq: V('hq', 'agency'), roleOrgScopeNull: V(null, 'branch'),
};
const db = (first) => ({ DB: { prepare: (sql) => ({ bind: (u) => ({ first: async () => first(sql, u) }) }) } });
out.r = {
  found: await R(db(() => ({ scope_type: 'agency' })), 'a1'),
  trimmed: await R(db(() => ({ scope_type: ' hq ' })), 'a1'),
  missingRow: await R(db(() => null), 'a1'),
  emptyCol: await R(db(() => ({ scope_type: '' })), 'a1'),
  throws: await R(db(() => { throw new Error('D1 down'); }), 'a1'),
  noUser: await R(db(() => ({ scope_type: 'hq' })), ''),
};
let bound = null;
await R(db((sql, u) => { bound = { sql, u }; return { scope_type: 'hq' }; }), 'mgr_x');
out.bound = bound;
const dh = D('hq'), dorg = D('org'), dun = D('unknown');
out.d = { hq: dh, org: dorg && dorg.status, orgBody: dorg && await dorg.json(), unk: dun && dun.status, unkBody: dun && await dun.json() };
console.log(JSON.stringify(out));
`);
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(dir, 'run.mjs')], { encoding: 'utf8' });
    let o = null;
    try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch {}
    check('①-1 정본을 실제로 실행했다', !!o, (r.stderr || '').slice(0, 300));
    if (o) {
      check('①-2 agency·branch·franchise 는 org', o.v.agency === 'org' && o.v.branch === 'org' && o.v.franchise === 'org');
      check('①-3 (짝) 본사(hq·none)·강사는 막지 않는다', o.v.hq === 'hq' && o.v.none === 'hq' && o.v.teacher === 'hq');
      check('①-4 근거가 없거나 비면 «모름»(=막음)', o.v.nullScope === 'unknown' && o.v.emptyScope === 'unknown' && o.v.undef === 'unknown');
      check('①-5 역할이 조직이면 DB 가 hq 라 해도 org', o.v.roleOrgScopeHq === 'org' && o.v.roleOrgScopeNull === 'org');
      check('①-6 readScopeType: 있으면 그 값(공백 제거)', o.r.found === 'agency' && o.r.trimmed === 'hq');
      check('①-7 readScopeType: 행 없음·빈 칸·예외·아이디 없음은 null(삼키지 않고 «모름»)',
        o.r.missingRow === null && o.r.emptyCol === null && o.r.throws === null && o.r.noUser === null);
      check('①-8 readScopeType 은 그 아이디로 admin_scope 를 좁혀 읽는다',
        !!o.bound && o.bound.u === 'mgr_x' && /FROM\s+admin_scope\s+WHERE\s+username\s*=\s*\?/i.test(o.bound.sql));
      check('①-9 (짝) hq 면 응답을 만들지 않는다(통과)', o.d.hq === null);
      check('①-10 org·unknown 은 403 + 서로 다른 사유', o.d.org === 403 && o.d.unk === 403
        && o.d.orgBody.error === 'forbidden_scope' && o.d.unkBody.error === 'scope_unknown');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* 배선 공통 — 가드 블록이 «판정 → 막기» 인가 */
const wiredGuard = (blk, denyVar) =>
  /orgScopeVerdict\(\s*await\s+readScopeType\(\s*env\s*,\s*\w+\.username\s*\)\s*,\s*\w+\.role\s*\)/.test(blk);

/* ── ② 학생 랭킹 ── */
console.log('\n② 학생 랭킹 — /api/admin/stats/student-rankings');
{
  const t = stripComments(read('api-admin.ts'));
  const a = t.indexOf("path === '/api/admin/stats/student-rankings'");
  check('②-0 전제: 라우트를 찾았다', a > 0);
  const body = a > 0 ? braceBlock(t, t.indexOf('{', a)) : '';
  check('②-0b 전제: 몸통을 중괄호 짝으로 잘라 냈다', body.length > 500);
  const gi = body.search(/orgScopeDenyResponse\(/);
  const qi = body.indexOf('FROM attendance');
  check('②-1 판정을 «DB 근거 + 역할» 로 부른다', wiredGuard(body));
  check('②-2 그 결과가 있으면 그대로 돌려준다(막는다)', /if\s*\(\s*(\w+)\s*\)\s*return\s+\1\s*;/.test(body.slice(gi, gi + 400)));
  check('②-3 가드가 랭킹 SQL 보다 앞이다', gi > 0 && qi > 0 && gi < qi);
  check('②-4 getAdminActor 를 먼저 부른다(admin_scope 행을 심는다)',
    body.indexOf('getAdminActor(') >= 0 && body.indexOf('getAdminActor(') < gi);
}

/* ── ③ 녹화 관리자 API — index.ts 게이트 ── */
console.log('\n③ 녹화 관리자 API — src/index.ts 인증 게이트');
{
  const t = stripComments(read('index.ts'));
  const a = t.search(/if\s*\(\s*sess\.ok\s*&&\s*path\.startsWith\(\s*'\/api\/recordings'\s*\)\s*\)/);
  check('③-0 전제: 녹화 경로 게이트 블록을 찾았다', a > 0);
  const blk = a > 0 ? braceBlock(t, t.indexOf('{', a)) : '';
  check('③-1 판정을 «DB 근거 + 역할» 로 부른다', wiredGuard(blk));
  check('③-2 결과가 있으면 돌려준다(막는다)', /if\s*\(\s*(\w+)\s*\)\s*return\s+\1\s*;/.test(blk));
  const gate = t.search(/if\s*\(\s*isAdminPath\(\s*path\s*,\s*request\.method\s*\)\s*&&\s*!isAuthPublicPath\(\s*path\s*\)\s*\)/);
  const gateBlk = gate > 0 ? braceBlock(t, t.indexOf('{', gate)) : '';
  check('③-3 그 블록이 관리자 인증 게이트 «안» 에 있다(세션 확인 뒤)', gateBlk.length > 0 && gateBlk.includes(blk) && blk.length > 0);
  const listed = [
    "path === '/api/recordings' && method === 'GET'",
    "path.startsWith('/api/recordings/blob/') && method === 'GET'",
    "path.startsWith('/api/recordings/blob/') && method === 'DELETE'",
    "path === '/api/recordings/list-recent'",
  ];
  check('③-4 (전제) 막으려는 녹화 경로들이 isAdminPath 에 관리자 전용으로 등록돼 있다',
    listed.every(s => t.includes(s)));
  check('③-5 (짝) 학생 업로드·시작 경로는 관리자 전용으로 바뀌지 않았다',
    !/if\s*\(\s*path\.startsWith\(\s*'\/api\/recordings\/upload'\s*\)\s*\)\s*return\s+true/.test(t));
}

/* ── ④ 녹화 재생 — recordings-r2.ts ── */
console.log('\n④ 녹화 재생 — /api/recording/play');
{
  const t = stripComments(read('recordings-r2.ts'));
  const a = t.indexOf('path === "/api/recording/play"');
  check('④-0 전제: 재생 라우트를 찾았다', a > 0);
  const body = a > 0 ? braceBlock(t, t.indexOf('{', a)) : '';
  check('④-1 관리자 세션도 조직이면 adminOk 를 내린다(판정 !== hq)',
    /if\s*\(\s*orgScopeVerdict\(\s*await\s+readScopeType\(\s*env\s*,\s*\w+\.username\s*\)\s*,\s*\w+\.role\s*\)\s*!==\s*'hq'\s*\)\s*adminOk\s*=\s*false/.test(body));
  check('④-2 학생 경로 진입 판정이 sess.ok 가 아니라 adminOk 를 본다',
    /if\s*\(\s*!adminOk\s*\)\s*\{/.test(body) && !/if\s*\(\s*!sess\.ok\s*\)/.test(body));
  check('④-3 소유권 대조도 adminOk 를 본다(조직 세션은 «남의 녹화» 404)',
    /if\s*\(\s*!adminOk\s*&&\s*!sigOk\s*\)/.test(body) && !/!sess\.ok\s*&&\s*!sigOk/.test(body));
  check('④-4 (짝) adminOk 의 출발값은 세션 결과다(본사는 그대로 재생)', /let\s+adminOk\s*=\s*sess\.ok\s*;/.test(body));
  const ai = body.indexOf('adminOk = false'), qi = body.indexOf('FROM recordings');
  check('④-5 판정이 녹화 조회보다 앞이다(열거 차단 유지)', ai > 0 && qi > 0 && ai < qi);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
