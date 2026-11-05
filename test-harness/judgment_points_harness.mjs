import { fileURLToPath } from 'node:url';
// 🪙 판단력 훈련 정답 2P (2026-11-02) — 정본 awardJudgmentPoint 를 진짜 SQLite 로 실제 실행 + 화면 judgPtsView 실행
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n); } };
const tsSrc = fs.readFileSync(root + 'cloudflare-deploy/src/judgment-points.ts', 'utf8');
const js = stripTypeScriptTypes(tsSrc).replace(/export /g, '');
const mod = new Function(js + '; return { awardJudgmentPoint, JUDGMENT_RULE, JUDGMENT_POINTS };')();
ok('① 금액은 2P', mod.JUDGMENT_POINTS === 2);

function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE point_rule_log (id INTEGER PRIMARY KEY, user_id TEXT, rule_code TEXT, amount INTEGER, triggered_at INTEGER, txn_id INTEGER, meta TEXT)');
  const wrap = sql => { const st = db.prepare(sql); const mk = args => ({ first: async () => st.get(...args) ?? null, all: async () => ({ results: st.all(...args) }), run: async () => st.run(...args) }); return { bind: (...a) => mk(a), ...mk([]) }; };
  return { DB: { prepare: wrap }, raw: db };
}
let txns = 0, allowNext = { ok: true };
const deps = { checkEarnAllowed: async () => allowNext, applyPointTransaction: async () => ({ txnId: ++txns }) };
const NOW = Date.UTC(2026, 10, 2, 5);
const call = (env, o) => mod.awardJudgmentPoint(env, { uid: 'stu1', scope: 'self', sid: 's1', trusted: true, correct: true, now: NOW, ...o }, deps);
{
  const env = mkEnv();
  const r = await call(env, {});
  ok('② 정답·정답지·본인 → got +2', r.status === 'got' && r.amount === 2 && r.earned_today === 2 && txns === 1);
  const r2 = await call(env, {});
  ok('③ 같은 문항 다시 → dup (적립 안 늘어남)', r2.status === 'dup' && txns === 1 && r2.earned_today === 2);
  const r3 = await call(env, { sid: 's2' });
  ok('③ 짝: 다른 문항은 적립', r3.status === 'got' && r3.earned_today === 4 && txns === 2);
  const r4 = await call(env, { sid: 's3', correct: false });
  ok('④ 틀림 → none, 오늘 합계는 그대로', r4.status === 'none' && r4.earned_today === 4 && txns === 2);
  const r5 = await call(env, { sid: 's4', trusted: false });
  ok('⑤ 화면 정답지(서버 정답지 아님) → not_trusted', r5.status === 'not_trusted' && txns === 2);
  const r6 = await call(env, { sid: null });
  ok('⑤ sid 없음 → not_trusted', r6.status === 'not_trusted' && txns === 2);
  for (const sc of ['admin', 'guest', 'deny']) { const r = await call(env, { sid: 'x-' + sc, scope: sc }); ok('⑥ scope ' + sc + ' → guest(적립 안 함)', r.status === 'guest' && txns === 2); }
  const rg = await call(env, { uid: 'guest_abc' });
  ok('⑥ guest_ 아이디 → guest', rg.status === 'guest' && txns === 2);
  allowNext = { ok: false, error: 'game_daily_cap_reached', cap: 30 };
  const r7 = await call(env, { sid: 's9' });
  ok('⑦ 상한 → capped + 사유', r7.status === 'capped' && r7.cap === 30 && r7.cap_error === 'game_daily_cap_reached' && txns === 2);
  allowNext = { ok: true };
  const yday = await mod.awardJudgmentPoint(env, { uid: 'stu1', scope: 'self', sid: 'old', trusted: true, correct: true, now: NOW + 86400000 }, deps);
  ok('⑧ 다음 날 오늘 합계는 새로(2)', yday.status === 'got' && yday.earned_today === 2);
}
{
  const bad = { DB: { prepare: () => { throw new Error('db down'); } } };
  let threw = false, r; try { r = await call(bad, {}); } catch { threw = true; }
  ok('⑨ DB 장애에도 던지지 않음 → unknown', !threw && r.status === 'unknown');
}
// 배선
const pts = fs.readFileSync(root + 'cloudflare-deploy/src/api-points.ts', 'utf8');
const ans = pts.slice(pts.indexOf("path === '/api/judgment/answer'"), pts.indexOf("path === '/api/judgment/inclass'"));
ok('⑩ 채점 경로가 awardJudgmentPoint 를 부름', /r\.points = await awardJudgmentPoint\(env, \{/.test(ans));
ok('⑩ 서버 정답지 여부를 넘김(화면 correct_index 아님)', /trusted: trustedKey/.test(ans) && /const trustedKey = !!\(r && r\._answer_key_trusted\)/.test(ans));
ok('⑩ 내부 칸은 응답에서 뗌', /delete r\._answer_key_trusted/.test(ans));
ok('⑩ scope 를 넘김', /scope: ansScope/.test(ans));
const jd = fs.readFileSync(root + 'cloudflare-deploy/src/api-judgment.ts', 'utf8');
ok('⑪ 평가 함수가 trusted 를 실어 보냄', /_answer_key_trusted: trusted,/.test(jd));
const pol = fs.readFileSync(root + 'cloudflare-deploy/src/point-policy.ts', 'utf8');
const gq = (pol.match(/GAME_QUIZ_RULES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
ok('⑫ 게임·퀴즈 30점 묶음에 들어감', /'judgment_correct'/.test(gq.replace(/\/\/.*$/gm, '')));
// 화면
const html = fs.readFileSync(root + 'cloudflare-deploy/public/judgment.html', 'utf8');
const i = html.indexOf('  function judgPtsView(p){'), j = html.indexOf('  function renderResult(d){');
let view = null;
try { view = new Function('LANG', html.slice(i, j) + `; function T(ko,en,zh){ return LANG==='en' ? en : LANG==='zh' ? (zh||en) : ko; } return judgPtsView;`); } catch (e) { console.log(e.message); }
const V = (p, L = 'ko') => { try { return view(L)(p); } catch (e) { return 'ERR ' + e.message; } };
ok('⑬ got → +2P · 오늘 합계', /\+2P/.test(V({ status: 'got', amount: 2, earned_today: 6 })) && /\+6P/.test(V({ status: 'got', amount: 2, earned_today: 6 })));
ok('⑬ 서버 칸 없음 → 아무것도 안 그림', V(undefined) === '' && V(null) === '');
ok('⑬ none → 정답이면 2P 안내(+P 지어내지 않음)', /2P를 받아요/.test(V({ status: 'none', earned_today: 0 })) && !/\+\d+P/.test(V({ status: 'none', earned_today: 0 })));
ok('⑬ capped 게임 상한 문구', /하루 30점까지/.test(V({ status: 'capped', cap: 30, cap_error: 'game_daily_cap_reached' })));
ok('⑬ dup / guest / unknown 문구', /이미 포인트/.test(V({ status: 'dup' })) && /로그인하면/.test(V({ status: 'guest' })) && /확인하지 못했/.test(V({ status: 'unknown' })));
ok('⑬ 영어·중국어', /Mango points/.test(V({ status: 'got', amount: 2 }, 'en')) && /芒果积分/.test(V({ status: 'got', amount: 2 }, 'zh')));
const live = html.replace(/\/\*[\s\S]*?\*\//g, '');
ok('⑭ 결과 화면 배너 아래에 judgPtsView(d.points)', /bannerText\(ok, d\.choice_score\)\+'<\/div>'\+\s*judgPtsView\(d\.points\)\+/.test(live));
console.log(`judgment_points_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
