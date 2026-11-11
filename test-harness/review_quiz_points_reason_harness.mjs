import { gamesSrc } from './_srcbundle.mjs';
import { fileURLToPath } from 'node:url';
// 🪙 복습퀴즈 결과 «획득 포인트» 이유 (2026-11-02) — 서버 적립 블록을 오려 진짜 SQLite 로 실행 + 화면 rqPtsNote 실행(두 페이지)
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n); } };
const g = gamesSrc();
const a = g.indexOf('      let awarded = 0, balance: number | null = null, streak = 0, firstClear = false;');
const b = g.indexOf('      // 🧠 [판단력 D3]', a);
const blk = a > 0 && b > a ? g.slice(a, b) : '';
ok('① 적립 블록을 오려 냈다', blk.includes('points_full') || blk.includes('pointsFull'));
let run = null;
try {
  const js = stripTypeScriptTypes('async function __run(env, quizId, userId, userName, score, percent, now, insRes, dailyAllowance, applyPointTransaction){\n' + blk + '\nreturn { awarded, pointsFull, pointsCap, pointsDup, pointsUnknown };\n}');
  run = new Function(js + '; return __run;')();
} catch (e) { console.log('compile:', e.message); }
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE review_quiz_results (id INTEGER PRIMARY KEY, quiz_id INTEGER, user_id TEXT, created_at INTEGER); CREATE TABLE student_points (user_id TEXT, balance INTEGER)');
  const wrap = sql => { const st = db.prepare(sql); const mk = args => ({ first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => { const r = st.run(...args); return { meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) } }; } }); return { bind: (...x) => mk(x), ...mk([]) }; };
  return { DB: { prepare: wrap, exec: async s => db.exec(s) }, raw: db };
}
const NOW = Date.UTC(2026, 10, 2, 5);
async function go(env, o = {}) {
  const resultId = o.resultId ?? 1;
  env.raw.prepare('INSERT OR IGNORE INTO review_quiz_results (id, quiz_id, user_id, created_at) VALUES (?,?,?,?)').run(resultId, 7, 'stu1', NOW);
  let txn = 0;
  const allow = o.allow ?? 999;
  try {
    const r = await run(env, 7, o.uid ?? 'stu1', null, o.score ?? 3, o.percent ?? 60, NOW, { meta: { last_row_id: resultId } },
      async () => { if (o.allowThrows) throw new Error('x'); return allow; }, async () => { if (o.txThrows) throw new Error('tx'); txn++; return {}; });
    return { ...r, txn };
  } catch (e) { return { err: e.message }; }
}
{
  const env = mkEnv();
  const r = await go(env, {});
  ok('② 정상: 첫 클리어 3문제 → 30+30=60 전액', r.awarded === 60 && r.pointsFull === 60 && r.pointsCap === null && !r.pointsDup && !r.pointsUnknown);
}
{
  const env = mkEnv();
  const r = await go(env, { allow: 20 });
  ok('③ 깎이면 cap=daily, full=60, awarded=20', r.pointsCap === 'daily' && r.pointsFull === 60 && r.awarded === 20);
  const r0 = await go(env, { resultId: 3, allow: 0 });
  ok('③ 한도 소진 → awarded 0 + cap daily', r0.awarded === 0 && r0.pointsCap === 'daily');
}
{
  const env = mkEnv();
  env.raw.exec('CREATE TABLE review_quiz_rewards (award_id TEXT PRIMARY KEY, user_id TEXT, amount INTEGER, created_at INTEGER)');
  env.raw.prepare('INSERT INTO review_quiz_rewards VALUES (?,?,?,?)').run('old', 'stu1', 480, NOW);
  const r = await go(env, {});
  ok('④ 복습퀴즈 하루 500 남은 20 → cap quiz', r.pointsCap === 'quiz' && r.awarded === 20 && r.pointsFull === 60);
}
{
  const env = mkEnv();
  await go(env, {});
  const again = await go(env, {});   // 같은 resultId → INSERT OR IGNORE 0행
  ok('⑤ 같은 결과 다시 → dup, 적립 0', again.pointsDup === true && again.awarded === 0 && again.txn === 0);
}
{
  const env = mkEnv();
  const r = await go(env, { allowThrows: true });
  ok('⑥ 적립 단계 실패 → unknown(던지지 않음)', r.pointsUnknown === true && r.awarded === 0 && !r.err);
  const z = await go(mkEnv(), { score: 0, percent: 0 });
  ok('⑦ 0문제 → full 0, cap 없음', z.pointsFull === 0 && z.pointsCap === null && z.awarded === 0);
}
ok('⑧ 응답에 칸을 실음', /points_full: pointsFull, points_cap: pointsCap, points_dup: pointsDup, points_unknown: pointsUnknown,\s*points_guest: \/\^guest\/i\.test\(userId\)/.test(g));
for (const page of ['review-quiz.html', 'review-quiz-cn.html']) {
  const h = fs.readFileSync(root + 'cloudflare-deploy/public/' + page, 'utf8');
  const i = h.indexOf('    function rqPtsNote(r, en){'), j = h.indexOf('    function showResult(', i);
  let f = null; try { f = new Function(h.slice(i, j) + '; return rqPtsNote;')(); } catch (e) { console.log(page, e.message); }
  const N = (r, en = false) => { try { return f(r, en); } catch (e) { return 'ERR ' + e.message; } };
  ok(page + ' ⑨ 깎임 → 원래·받은 점수와 이유', /원래 60점/.test(N({ awarded: 20, points_full: 60, points_cap: 'daily' })) && /\+20점만/.test(N({ awarded: 20, points_full: 60, points_cap: 'daily' })));
  ok(page + ' ⑨ 짝: 전액이면 아무 말 없음', N({ awarded: 60, points_full: 60, points_cap: null }) === '');
  ok(page + ' ⑨ 옛 서버(칸 없음) → 아무 말 없음', N({ awarded: 0 }) === '');
  ok(page + ' ⑨ dup / guest / unknown / 0점', /이미/.test(N({ points_dup: true })) && /로그인하면/.test(N({ points_guest: true })) && /확인하지 못했/.test(N({ points_unknown: true })) && /10점/.test(N({ points_full: 0, awarded: 0 })));
  ok(page + ' ⑨ 연습 모드는 말 안 함', N({ practice: true, points_unknown: true }) === '');
  ok(page + ' ⑩ 결과 화면에 rqPtsNote 를 그림', /rqPtsNote\(r, (isEn\(\)|false)\)/.test(h.slice(h.indexOf('    function showResult('))));
}
{
  const h = fs.readFileSync(root + 'cloudflare-deploy/public/review-quiz.html', 'utf8');
  const i = h.indexOf('    function rqPtsNote(r, en){'), j = h.indexOf('    function showResult(', i);
  const f = new Function(h.slice(i, j) + '; return rqPtsNote;')();
  ok('⑪ 영어', /because of/.test(f({ awarded: 20, points_full: 60, points_cap: 'quiz' }, true)));
}
console.log(`review_quiz_points_reason_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
