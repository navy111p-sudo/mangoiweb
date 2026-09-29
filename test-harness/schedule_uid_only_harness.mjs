/* 🆔 주간 스케줄 «새 슬롯» — 아이디만 적어도 등록 (2026-09-29 사장님 지시)
 *  ① 화면 파싱을 소스에서 오려 내 실제로 돌린다: 아이디만 → uid · 한글만 → 이름(예전) · 이름:아이디 → 둘 다
 *  ② 서버 확인 블록을 오려 내 진짜 SQLite 로 돌린다: 명부에 있음 → 통과 · 없음 → 거절 ·
 *     대소문자만 다른 후보 하나 → 명부 표기로 · 둘 → 거절 · 조회 실패 → 막지 않음 · 플래그 없으면 검사 안 함
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let PASS = 0, FAIL = 0;
const ok = (c, n) => { if (c) { PASS++; console.log('  ✅ ' + n); } else { FAIL++; console.log('  ❌ ' + n); } };
const W = readFileSync('cloudflare-deploy/public/admin/weekly-schedule.html', 'utf8');
const A = readFileSync('cloudflare-deploy/src/api-admin.ts', 'utf8');

console.log('① 화면 파싱');
{
  const i0 = W.indexOf("raw.split('\\n').forEach(function(line){");
  let dep = 0, i1 = -1;   // 중괄호 짝으로 자른다(push({…}); 안의 «});» 에 속지 않게)
  for (let i = W.indexOf('{', i0); i0 > 0 && i < W.length; i++) { if (W[i] === '{') dep++; else if (W[i] === '}') { dep--; if (!dep) { i1 = i; break; } } }
  const src = i0 > 0 && i1 > i0 ? W.slice(i0, i1 + 1) + ');' : '';
  ok(src.length > 0, '전제: 파싱 블록을 오려 냈다');
  let parse = null;
  try { parse = new Function('raw', 'var students=[];' + src + '\nreturn students;'); } catch (e) { console.log('  ' + e.message); }
  const run = (raw) => { try { return parse(raw); } catch (e) { return null; } };
  const a = run('jjy2323');
  ok(a && a.length === 1 && a[0].uid === 'jjy2323' && a[0].name === '' && a[0].byUid === true, '아이디만 → uid 로 보낸다(이름 없이)');
  const b = run('홍길동');
  ok(b && b[0].name === '홍길동' && b[0].uid === '' && !b[0].byUid, '(짝) 한글 이름만 → 예전처럼 이름으로');
  const c = run('김민수:test_st_1');
  ok(c && c[0].name === '김민수' && c[0].uid === 'test_st_1' && !c[0].byUid, '(짝) 이름:아이디 → 예전 그대로');
  const d = run(' jjy2323 \n\n lee ');
  ok(d && d.length === 2 && d[1].uid === 'lee', '여러 줄·빈 줄·앞뒤 공백');
  ok(/if\(stu\.byUid\)payload\.require_known_uid=1;/.test(W), '아이디만 적은 줄은 서버에 «명부 확인» 을 요청한다');
}

console.log('② 서버 확인');
{
  const i0 = A.indexOf('if (body.require_known_uid) {');
  let depth = 0, i1 = -1;
  for (let i = A.indexOf('{', i0); i < A.length; i++) { if (A[i] === '{') depth++; else if (A[i] === '}') { depth--; if (!depth) { i1 = i; break; } } }
  const src = i0 > 0 && i1 > 0 ? A.slice(i0, i1 + 1).replace(/<any>/g, '').replace(/: string \| null/g, '') : '';
  ok(src.length > 0, '전제: 서버 블록을 오려 냈다');
  const mkEnv = (boom) => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY)`);
    for (const u of ['jjy2323', 'Kim', 'kim', 'Lee2']) db.prepare('INSERT INTO students_erp VALUES (?)').run(u);
    return { DB: { prepare: (sql) => { if (boom) throw new Error('boom'); const st = db.prepare(sql); return { bind: (...a) => ({ first: async () => st.get(...a) ?? null, all: async () => ({ results: st.all(...a) }) }) }; } } };
  };
  let fn = null;
  try { fn = new Function('env', 'body', 'userId', 'bad', `return (async () => { ${src}\n return { ok: true, userId }; })();`); } catch (e) { console.log('  ' + e.message); }
  const bad = (error) => ({ ok: false, error });
  const run = async (uid, flag = 1, boom = false) => { try { return await fn(mkEnv(boom), flag ? { require_known_uid: 1 } : {}, uid, bad); } catch (e) { return { crash: e.message }; } };
  let r = await run('jjy2323'); ok(r.ok && r.userId === 'jjy2323', '명부에 있는 아이디 → 통과');
  r = await run('jjy2324'); ok(r.ok === false && r.error === 'student_not_found', '(짝) 명부에 없는 아이디(오타) → 거절');
  r = await run('lee2'); ok(r.ok && r.userId === 'Lee2', '대소문자만 다른 후보가 하나 → 명부 표기로 바꾼다');
  r = await run('KIM'); ok(r.ok === false, '(짝) 대소문자만 다른 후보가 둘(Kim/kim) → 거절(아무거나 안 집음)');
  r = await run('kim'); ok(r.ok && r.userId === 'kim', '정확일치가 먼저(kim)');
  r = await run('zzz', 1, true); ok(r.ok && r.userId === 'zzz', '조회가 실패하면 막지 않는다(예전 동작)');
  r = await run('zzz', 0); ok(r.ok && r.userId === 'zzz', '(짝) 플래그 없는 다른 화면은 검사하지 않는다(동작 그대로)');
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
