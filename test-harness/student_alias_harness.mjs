// 👥 카페24 쌍둥이 계정(X ↔ mangoai_X) — 학생 «내 수업» 찾기 (2026-10-02 lby01)
// 정본 src/student-alias.ts 를 타입 제거로 «실제로» 돌리고(진짜 SQLite),
// api-mango.ts 의 배선 세 곳(sessions/today · schedule/mine · verify-room)을 오려 내 가짜 부품으로 실행한다.
// 「잇는다」 옆에 「이름이 다르면·조회 실패면 안 잇는다」를 짝으로 둔다(짝이 없으면 «전부 잇기» 도 통과).
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const rd = (p) => readFileSync(p, 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name); } };

const M = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')))).toString('base64'));

console.log('① 순수 함수');
ok('X → mangoai_X', M.twinCandidate('lby01') === 'mangoai_lby01');
ok('mangoai_X → X', M.twinCandidate('mangoai_delaware') === 'delaware');
ok('빈 값 → null', M.twinCandidate('') === null && M.twinCandidate('mangoai_') === null);
ok('「김연숙 MANGOAI」 = 「김연숙」', M.sameTwinName('김연숙 MANGOAI', '김연숙'));
ok('다른 이름은 다르다', !M.sameTwinName('김연숙', '김연수'));
ok('빈 이름은 같다고 안 본다', !M.sameTwinName('', '') && !M.sameTwinName('MANGOAI', ''));

console.log('② resolveStudentTwins (진짜 SQLite)');
function d1(db) {
  return { prepare(sql) { const st = db.prepare(sql); return { bind(...a) { return { all: async () => ({ results: st.all(...a) }) }; } }; } };
}
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT)`);
const ins = db.prepare(`INSERT INTO students_erp VALUES (?,?,?)`);
ins.run('lby01', '이보영', null); ins.run('mangoai_lby01', '이보영 MANGOAI', null);
ins.run('kim1', '김민서', null); ins.run('mangoai_kim1', '김민준', null);     // 이름이 다르다
ins.run('solo', '홍길동', null);                                                 // 쌍둥이 없음
ins.run('noname', null, null); ins.run('mangoai_noname', null, null);            // 이름 없음
const D = d1(db);
ok('이름이 같으면 쌍둥이를 준다', JSON.stringify(await M.resolveStudentTwins(D, 'lby01')) === '["mangoai_lby01"]');
ok('반대 방향도 준다', JSON.stringify(await M.resolveStudentTwins(D, 'mangoai_lby01')) === '["lby01"]');
ok('이름이 다르면 안 준다', (await M.resolveStudentTwins(D, 'kim1')).length === 0);
ok('쌍둥이 계정이 없으면 안 준다', (await M.resolveStudentTwins(D, 'solo')).length === 0);
ok('이름이 없으면 안 준다', (await M.resolveStudentTwins(D, 'noname')).length === 0);
ok('내 계정 행이 없으면 안 준다', (await M.resolveStudentTwins(D, 'ghost')).length === 0);
const BAD = { prepare() { throw new Error('D1 down'); } };
let threw = false; let r = null;
try { r = await M.resolveStudentTwins(BAD, 'lby01'); } catch { threw = true; }
ok('조회가 실패해도 던지지 않고 [] (예전 동작)', !threw && Array.isArray(r) && r.length === 0);

console.log('③ 배선 (api-mango.ts 를 오려 내 실행)');
const API = rd(resolve(SRC, 'api-mango.ts'));
ok('import 가 있다', /import \{ resolveStudentTwins \} from '\.\/student-alias'/.test(API));
function blockFrom(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const j = src.indexOf('{', i + anchor.length - 1); let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
// sessions/today — 쌍둥이 조건은 «계정» 단계(condsUid)에 들어가야 한다(이름 단계면 계정으로 하나라도 잡히면 안 돈다)
const st = API.indexOf("path === '/api/class/sessions/today'");
const stBody = st >= 0 ? API.slice(st, API.indexOf('const now = Date.now();', st)) : '';
const twLine = (stBody.match(/for \(const tw of await resolveStudentTwins\([^\n]*\n/) || [''])[0];
ok('sessions/today: 쌍둥이 줄을 찾았다(전제)', !!twLine);
try {
  const f = new Function('resolveStudentTwins', 'env', 'userId', 'condsUid', 'bindsUid', 'condsName', 'bindsName',
    `return (async () => { ${twLine} })();`);
  const cU = [], bU = [], cN = [], bN = [];
  await f(async () => ['mangoai_lby01'], { DB: {} }, 'lby01', cU, bU, cN, bN);
  ok('sessions/today: 계정 단계에 쌍둥이를 더한다', bU.includes('mangoai_lby01') && cU.length === 1);
  ok('sessions/today: 이름 단계에는 안 넣는다', cN.length === 0);
  const cU2 = [], bU2 = [];
  await f(async () => [], { DB: {} }, 'solo', cU2, bU2, [], []);
  ok('sessions/today: 쌍둥이가 없으면 아무것도 안 더한다', cU2.length === 0);
} catch (e) { ok('sessions/today 배선 실행: ' + e.message, false); }
// 그 줄이 «학생» 갈래 안(교사 갈래 밖)인가
ok('sessions/today: 교사 갈래가 아니라 학생 갈래에 있다', stBody.indexOf(twLine) > stBody.indexOf('} else {') && stBody.indexOf('} else {') > 0);

// schedule/mine
const ms = API.indexOf("path === '/api/class/schedule/mine'");
const msBlock = ms >= 0 ? blockFrom(API.slice(ms), 'if (msUserId) {') : '';
ok('schedule/mine: 블록을 오려 냈다(전제)', msBlock.includes('resolveStudentTwins'));
try {
  const f2 = new Function('resolveStudentTwins', 'runMsPass', 'env', 'msUserId',
    `return (async () => { let msRows = []; let msMatchedBy = 'none'; ${msBlock} return { msRows, msMatchedBy }; })();`);
  const rows = { lby01: [{ id: 2 }], mangoai_lby01: [{ id: 1 }] };
  const out = await f2(async () => ['mangoai_lby01'], async (_c, id) => rows[id] || [], { DB: {} }, 'lby01');
  ok('schedule/mine: 내 계정 + 쌍둥이 예약을 다 담는다', out.msRows.length === 2 && out.msMatchedBy === 'uid');
  const out2 = await f2(async () => [], async (_c, id) => rows[id] || [], { DB: {} }, 'lby01');
  ok('schedule/mine: 쌍둥이가 없으면 내 것만', out2.msRows.length === 1);
  const out3 = await f2(async () => [], async () => [], { DB: {} }, 'nobody');
  ok('schedule/mine: 아무것도 없으면 matched_by 를 안 정한다', out3.msMatchedBy === 'none');
} catch (e) { ok('schedule/mine 배선 실행: ' + e.message, false); }

// verify-room
const vLine = (API.match(/if \(!ok && row\.user_id && \(await resolveStudentTwins\([^\n]*\n/) || [''])[0];
ok('verify-room: 쌍둥이 줄을 찾았다(전제)', !!vLine);
try {
  const f3 = new Function('resolveStudentTwins', 'env', 'userId', 'row',
    `return (async () => { let ok = false, resolvedRole = null; ${vLine} return { ok, resolvedRole }; })();`);
  const a = await f3(async () => ['mangoai_lby01'], { DB: {} }, 'lby01', { user_id: 'mangoai_lby01' });
  ok('verify-room: 쌍둥이 예약이면 학생으로 통과', a.ok && a.resolvedRole === 'student');
  const b = await f3(async () => ['mangoai_lby01'], { DB: {} }, 'lby01', { user_id: 'mangoai_other' });
  ok('verify-room: 남의 예약이면 통과시키지 않는다', !b.ok);
  const c = await f3(async () => [], { DB: {} }, 'lby01', { user_id: 'mangoai_lby01' });
  ok('verify-room: 쌍둥이로 확인 안 되면 통과시키지 않는다', !c.ok);
} catch (e) { ok('verify-room 배선 실행: ' + e.message, false); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
