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
ok('import 가 있다', /import \{[^}]*\bresolveStudentTwins\b[^}]*\} from '\.\/student-alias'/.test(API));
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

console.log('④ 겹친 쌍둥이 예약 빼기 (2026-10-06 delaware · LEN — 서로 다른 방)');
{
  const T = 1000 * 60;
  const S = (id, uid, start, dur = 20) => ({ schedule_id: id, student_uid: uid, start_ts: start * T, end_ts: (start + dur) * T });
  // 실사고 그대로: 21:10 에 HANNAH 잔재(4379, mangoai_delaware)와 LEN 진짜(4397, delaware)
  const real = [S(4379, 'mangoai_delaware', 1270), S(4397, 'delaware', 1270)];
  const out = M.dropShadowedTwinSessions(real, 'delaware');
  ok('실사고: 겹친 쌍둥이(4379)를 빼고 내 예약(4397)만 남긴다', out.length === 1 && out[0].schedule_id === 4397);
  // 짝: 쌍둥이 예약이 혼자면 그대로 (10/2 lby01 구제 유지)
  const alone = [S(1, 'mangoai_lby01', 840)];
  ok('짝: 쌍둥이 예약이 혼자면 안 뺀다', M.dropShadowedTwinSessions(alone, 'lby01').length === 1);
  // 짝: 안 겹치면 둘 다 남긴다 (lby01 14:00 + 16:30)
  const apart = [S(1, 'mangoai_lby01', 840), S(2, 'lby01', 990)];
  ok('짝: 시간이 안 겹치면 둘 다 남긴다', M.dropShadowedTwinSessions(apart, 'lby01').length === 2);
  // 경계: 끝난 직후 시작(맞닿음)은 겹침이 아니다
  const touch = [S(1, 'mangoai_x1', 1270), S(2, 'x1', 1290)];
  ok('경계: 맞닿기만 하면 안 뺀다', M.dropShadowedTwinSessions(touch, 'x1').length === 2);
  // 일부만 겹쳐도 뺀다
  const part = [S(1, 'mangoai_x1', 1275), S(2, 'x1', 1270)];
  ok('일부만 겹쳐도 쌍둥이를 뺀다', M.dropShadowedTwinSessions(part, 'x1').map(s => s.schedule_id).join() === '2');
  // 대소문자만 다른 내 계정도 «내 것»
  ok('대소문자만 다른 내 예약도 내 것으로 본다', M.dropShadowedTwinSessions([S(1, 'mangoai_delaware', 1270), S(2, 'Delaware', 1270)], 'delaware').map(s => s.schedule_id).join() === '2');
  // 남의 계정은 건드리지 않는다
  ok('쌍둥이가 아닌 남의 예약은 안 뺀다', M.dropShadowedTwinSessions([S(1, 'mangoai_other', 1270), S(2, 'delaware', 1270)], 'delaware').length === 2);
  // 내 예약을 빼지 않는다 (반대 방향 로그인: mangoai_X 로 로그인하면 X 쪽이 쌍둥이)
  ok('mangoai_ 로 로그인하면 그쪽이 «내 것»', M.dropShadowedTwinSessions(real, 'mangoai_delaware').map(s => s.schedule_id).join() === '4379');
  ok('uid 가 비면 그대로', M.dropShadowedTwinSessions(real, '').length === 2);
}
console.log('④-2 정본 출처로 고르기 (2026-10-07 — «로그인 계정 우선» 의 구멍)');
{
  const T = 1000 * 60;
  const S = (id, uid, start, source, dur = 20) => ({ schedule_id: id, student_uid: uid, start_ts: start * T, end_ts: (start + dur) * T, source });
  // 실사고 출처 그대로: 4379 = 카페24 미러 자동 행(HANNAH 잔재) · 4397 = 수강신청 확정(LEN)
  const real = () => [S(4379, 'mangoai_delaware', 1270, 'c24-mirror'), S(4397, 'delaware', 1270, 'adm-enroll:123')];
  const a = M.pickTwinSessions(real(), 'delaware');
  ok('delaware 로 로그인 → 4397(LEN)', a.sessions.map(s => s.schedule_id).join() === '4397' && !a.ambiguous);
  const b = M.pickTwinSessions(real(), 'mangoai_delaware');
  ok('🔴 mangoai_delaware 로 로그인해도 → 4397(LEN) (옛 규칙은 4379 로 갔다)', b.sessions.map(s => s.schedule_id).join() === '4397' && !b.ambiguous);
  ok('두 계정 어느 쪽이든 같은 방', a.sessions[0].schedule_id === b.sessions[0].schedule_id);
  ok('버려진 쪽을 알려 준다', b.dropped.map(s => s.schedule_id).join() === '4379');
  // 짝: 미러 행이 «정본» 이면(사람이 손댄 manual) 미러 자동 행에 지지 않는다 — 급이 같아 예전 규칙 + ambiguous
  const tie = M.pickTwinSessions([S(1, 'mangoai_x1', 1270, 'c24-mirror:manual'), S(2, 'x1', 1270, 'adm-enroll:9')], 'x1');
  ok('같은 급이면 예전 규칙(로그인 계정 쪽) + 판정불가 표시', tie.sessions.map(s => s.schedule_id).join() === '2' && tie.ambiguous === true);
  const tie2 = M.pickTwinSessions([S(1, 'mangoai_x1', 1270, 'c24-mirror'), S(2, 'x1', 1270, 'c24-mirror')], 'mangoai_x1');
  ok('둘 다 미러 자동 행이면 로그인 계정 쪽 + 판정불가', tie2.sessions.map(s => s.schedule_id).join() === '1' && tie2.ambiguous === true);
  // 짝: 미러가 «내 계정» 쪽이어도 진다(방향이 아니라 출처)
  const rev = M.pickTwinSessions([S(1, 'x1', 1270, 'c24-mirror'), S(2, 'mangoai_x1', 1270, 'enroll:ORD1')], 'x1');
  ok('내 계정 쪽이 미러 잔재면 쌍둥이(정본)를 남긴다', rev.sessions.map(s => s.schedule_id).join() === '2' && !rev.ambiguous);
  // 짝: 안 겹치면 아무것도 안 뺀다(lby01 구제)
  const apart = M.pickTwinSessions([S(1, 'mangoai_lby01', 840, 'c24-mirror'), S(2, 'lby01', 990, 'adm-enroll:1')], 'lby01');
  ok('안 겹치면 둘 다 남긴다(미러여도)', apart.sessions.length === 2 && apart.dropped.length === 0);
  const alone = M.pickTwinSessions([S(1, 'mangoai_lby01', 840, 'c24-mirror')], 'lby01');
  ok('쌍둥이 미러 예약이 혼자면 안 뺀다', alone.sessions.length === 1);
  // 짝: 같은 계정끼리 겹친 것은 건드리지 않는다
  const self = M.pickTwinSessions([S(1, 'x1', 1270, 'c24-mirror'), S(2, 'x1', 1270, 'adm-enroll:2')], 'x1');
  ok('같은 계정끼리 겹친 예약은 안 건드린다(예전 동작)', self.sessions.length === 2);
  // 남의 계정
  const other = M.pickTwinSessions([S(1, 'mangoai_other', 1270, 'adm-enroll:3'), S(2, 'x1', 1270, 'c24-mirror')], 'x1');
  ok('쌍둥이가 아닌 남의 예약 때문에 내 예약을 빼지 않는다', other.sessions.length === 2);
  ok('출처 급: c24-mirror 만 0', M.sessionSourceRank('c24-mirror') === 0 && M.sessionSourceRank('c24-mirror:manual') === 1 && M.sessionSourceRank('adm-enroll:1') === 1 && M.sessionSourceRank(null) === 1);
}
// 배선: sessions/today 가 이름 폴백이 아니라 계정 단계 결과에, 학생일 때만, current 고르기 «전에» 거는가
{
  const st2 = API.indexOf("path === '/api/class/sessions/today'");
  const body = API.slice(st2, API.indexOf('let current', st2));
  const bi = body.indexOf("if (!isTeacher && matchedBy === 'uid') {");
  ok('배선: sessions/today 에서 정본(pickTwinSessions)을 부른다(전제)', bi > 0 && body.indexOf('pickTwinSessions(sessions, userId)', bi) > bi);
  ok('배선: import 했다', /import \{[^}]*pickTwinSessions[^}]*\} from '\.\/student-alias'/.test(API));
  ok('배선: SELECT 두 벌 모두 source 를 뽑는다', /cs\.status, cs\.source\$\{_soSelT\}, t\.name AS teacher_name/.test(API) && /teacher_id, status, source\$\{_soSelT\} FROM class_schedules cs WHERE/.test(API));
  ok('배선: 세션에 source 를 싣는다', /source: s\.source \|\| null,/.test(body));
  ok('배선: 응답 전에 source 를 뗀다', /delete \(s3 as any\)\.source/.test(body));
  // 블록을 중괄호 짝으로 오려 실제로 돌린다
  let blk = '';
  if (bi > 0) { let d = 0; for (let k = body.indexOf('{', bi); k < body.length; k++) { if (body[k] === '{') d++; else if (body[k] === '}') { d--; if (d === 0) { blk = body.slice(bi, k + 1); break; } } } }
  try {
    const g = new Function('pickTwinSessions', 'isTeacher', 'matchedBy', 'userId', 'sessions0',
      `let sessions = sessions0; ${blk.replace(/: any/g, '')} return sessions;`);
    const T = 60000, two = () => [
      { schedule_id: 4379, student_uid: 'mangoai_delaware', start_ts: 1270 * T, end_ts: 1290 * T, source: 'c24-mirror' },
      { schedule_id: 4397, student_uid: 'delaware', start_ts: 1270 * T, end_ts: 1290 * T, source: 'adm-enroll:123' }];
    const warn = console.warn; console.warn = () => {};
    const r1 = g(M.pickTwinSessions, false, 'uid', 'mangoai_delaware', two());
    console.warn = warn;
    ok('배선 실행: mangoai_ 로그인도 4397 로', r1.length === 1 && r1[0].schedule_id === 4397);
    ok('배선 실행: 교사 화면은 안 건드린다', g(M.pickTwinSessions, true, 'uid', 'delaware', two()).length === 2);
    ok('배선 실행: 이름 폴백 결과는 안 건드린다', g(M.pickTwinSessions, false, 'name', 'delaware', two()).length === 2);
  } catch (e) { ok('배선 실행: ' + e.message, false); }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
