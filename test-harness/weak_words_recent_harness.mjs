// 2026-10-18 — 게임 «약점 단어» 정본(src/weak-words.ts) — 개선안 2순위 ⑥
//   정본을 타입 제거로 실제 실행하고, 그 조각을 진짜 SQLite 에 돌립니다.
//   짝: «오래된 약점은 빠진다» 옆에 «최근 약점은 남는다»·«정답이 앞선 단어는 원래처럼 빠진다».
//   배선: 두 호출부가 조각을 «실제로 쓰고» 창 값을 바인드하는가(소스에서 SQL·bind 를 오려 내 돌림).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const R = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const MOD = R('cloudflare-deploy/src/weak-words.ts', 'WW_SRC');
const AI = R('cloudflare-deploy/src/api-ai.ts', 'AI_SRC');
const AD = R('cloudflare-deploy/src/api-admin.ts', 'AD_SRC');
const IX = R('cloudflare-deploy/src/index.ts', 'IX_SRC');
const GR = R('cloudflare-deploy/public/game-report.html', 'GR_SRC');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

let W = null;
try { W = new Function(stripTypeScriptTypes(MOD).replace(/^export\s+/gm, '') + '\nreturn { WEAK_RECENT_DAYS, WEAK_WHERE, WEAK_ORDER, weakSince, WEAK_OLDER_WHERE: typeof WEAK_OLDER_WHERE === "string" ? WEAK_OLDER_WHERE : null };')(); }
catch (e) { check('정본 실행', false, e.message); }
check('정본을 실제로 실행했다(전제)', !!W);
if (!W) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

const NOW = Date.UTC(2026, 9, 18);
const D = 86400000;
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE game_progress (id INTEGER PRIMARY KEY, user_id TEXT, lang TEXT, item TEXT, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, pron_best INTEGER DEFAULT 0, pron_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, game TEXT DEFAULT '')`);
const ins = db.prepare(`INSERT INTO game_progress (user_id, lang, item, ko, wrong_count, correct_count, last_seen, updated_at) VALUES (?,?,?,?,?,?,?,?)`);
ins.run('u', 'en', 'old-big', '', 9, 0, NOW - 120 * D, NOW - 120 * D);      // 오래된 큰 약점
ins.run('u', 'en', 'recent-small', '', 1, 0, NOW - 2 * D, NOW - 2 * D);     // 최근 작은 약점
ins.run('u', 'en', 'recent-mid', '', 3, 1, NOW - 10 * D, NOW - 10 * D);
ins.run('u', 'en', 'learned', '', 2, 5, NOW - 1 * D, NOW - 1 * D);          // 정답이 앞섬
ins.run('u', 'en', 'edge-in', '', 2, 0, NOW - 59 * D, null);
ins.run('u', 'en', 'edge-out', '', 2, 0, NOW - 61 * D, null);
ins.run('u', 'en', 'no-seen-upd', '', 2, 0, null, NOW - 5 * D);             // last_seen 없음 → updated_at
ins.run('u', 'en', 'no-seen-at-all', '', 2, 0, null, null);
ins.run('other', 'en', 'not-mine', '', 5, 0, NOW - 1 * D, NOW - 1 * D);
ins.run('u', 'en', 'edge-exact', '', 2, 0, NOW - 60 * D, null);          // 정확히 창 시작 — 창 «안»(창 밖 세기와 겹치면 안 됨)
ins.run('u', 'en', 'old-learned', '', 2, 5, NOW - 100 * D, null);        // 오래됐지만 정답이 앞섬 — 창 밖 «약점» 으로도 안 센다

const pick = (where, order, bindsBefore, since) => db.prepare(`SELECT item FROM game_progress WHERE user_id = ? AND lang = 'en' AND ${where} ORDER BY ${order} LIMIT 20`).all(...bindsBefore, since).map(r => r.item);
const got = pick(W.WEAK_WHERE, W.WEAK_ORDER, ['u'], W.weakSince(NOW));
check('창은 60일', W.WEAK_RECENT_DAYS === 60 && W.weakSince(NOW) === NOW - 60 * D);
check('오래된 약점(120일)은 목록에서 빠진다', !got.includes('old-big'), got);
check('짝: 최근 약점은 남는다', got.includes('recent-small') && got.includes('recent-mid'), got);
check('짝: 정답이 앞선 단어는 원래처럼 빠진다', !got.includes('learned'), got);
check('경계: 59일 안 / 61일 밖', got.includes('edge-in') && !got.includes('edge-out'), got);
check('last_seen 이 없으면 updated_at 으로 본다', got.includes('no-seen-upd'), got);
check('기록 시각이 아예 없으면 창 밖', !got.includes('no-seen-at-all'), got);
check('최근에 본 것이 먼저 — 오답 수보다 앞선다', got[0] === 'recent-small' && got.indexOf('recent-mid') < got.indexOf('edge-in'), got);
check('weakSince: 이상한 now 면 0(예전 동작 쪽으로 실패)', W.weakSince(NaN) === 0 && W.weakSince(0) === 0 && W.weakSince(-5) === 0);
const all0 = pick(W.WEAK_WHERE, W.WEAK_ORDER, ['u'], W.weakSince(NaN));
check('창이 0 이면 오래된 약점도 다시 나온다(조회가 죽지 않음)', all0.includes('old-big') && !all0.includes('learned'), all0);

// ── 배선: 두 호출부의 SQL·bind 를 오려 내 같은 DB 에 실제로 돌린다 ──
function wire(name, src, anchor) {
  const a = src.indexOf(anchor);
  check(name + ': 호출부를 찾았다(전제)', a > 0);
  if (a < 0) return;
  // 그 자리부터 바로 뒤 백틱 SQL 과 그 뒤의 인자 목록
  const s1 = src.lastIndexOf('`', a), s2 = src.indexOf('`', a);
  const sql = src.slice(s1 + 1, s2);
  check(name + ': 조건을 다시 적지 않고 정본 조각을 쓴다', /\$\{WEAK_WHERE\}/.test(sql) && /\$\{WEAK_ORDER\}/.test(sql) && !/wrong_count\s*>=\s*correct_count/.test(sql), sql);
  const tail = src.slice(s2 + 1, s2 + 200);
  check(name + ': 창 값(weakSince)을 바인드한다', /weakSince\(Date\.now\(\)\)/.test(tail), tail.slice(0, 80));
  let rows = null;
  try {
    const real = new Function('WEAK_WHERE', 'WEAK_ORDER', 'return `' + sql + '`;')(W.WEAK_WHERE, W.WEAK_ORDER);
    rows = db.prepare(real).all('u', W.weakSince(NOW)).map(r => r.item);
  } catch (e) { check(name + ': SQL 실행', false, e.message); }
  check(name + ': 실제로 돌리면 오래된 약점이 없고 최근 것이 먼저', !!rows && !rows.includes('old-big') && rows[0] === 'recent-small', rows);
}
wire('AI 친구', AI, "SELECT item, ko FROM game_progress WHERE user_id = ? AND lang = 'en'");
wire('강사 AI 피드백', AD, 'SELECT item, ko, wrong_count FROM game_progress');
check('두 호출부가 정본을 import 한다', /from '\.\/weak-words'/.test(AI) && /from '\.\/weak-words'/.test(AD));

// ── 창 밖 «옛 약점» 세기 — 화면이 「없다」와 「오래돼서 뺐다」를 갈라 말하게 ──
check('정본이 창 밖 조각(WEAK_OLDER_WHERE)을 내보낸다(전제)', typeof W.WEAK_OLDER_WHERE === 'string');
if (W.WEAK_OLDER_WHERE) {
  const cnt = (where, since) => db.prepare(`SELECT COUNT(*) AS n FROM game_progress WHERE user_id = 'u' AND lang = 'en' AND ${where}`).get(since).n;
  const inN = cnt(W.WEAK_WHERE, W.weakSince(NOW)), outN = cnt(W.WEAK_OLDER_WHERE, W.weakSince(NOW));
  const core = db.prepare(`SELECT COUNT(*) AS n FROM game_progress WHERE user_id = 'u' AND lang = 'en' AND wrong_count > 0 AND wrong_count >= correct_count`).get().n;
  check('창 안 + 창 밖 = 약점 전체(겹치지도 빠지지도 않는다)', inN + outN === core && inN === 5 && outN === 3, { inN, outN, core });
}

// ── 배선(공동 금지구역 src/index.ts — 2026-10-18 승인): 게임 약점 목록·맞춤 추천 ──
function bodyOf(src, decl) {
  const i = src.indexOf(decl); if (i < 0) return '';
  let j = src.indexOf('{', i + decl.length), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, k + 1);
}
function runTpl(sql, binds) {
  const real = new Function('WEAK_WHERE', 'WEAK_ORDER', 'WEAK_OLDER_WHERE', 'return `' + sql + '`;')(W.WEAK_WHERE, W.WEAK_ORDER, W.WEAK_OLDER_WHERE);
  return db.prepare(real).all(...binds);
}
function sqlAfter(body, anchor) {
  const a = body.indexOf(anchor); if (a < 0) return null;
  const s1 = body.lastIndexOf('`', a), s2 = body.indexOf('`', a);
  return { sql: body.slice(s1 + 1, s2), tail: body.slice(s2 + 1, s2 + 120) };
}
check('index.ts 가 정본을 import 한다', /import\s*\{[^}]*\bWEAK_WHERE\b[^}]*\}\s*from\s*'\.\/weak-words'/.test(IX));
const GW = bodyOf(IX, 'async function handleGamesWeak(');
const GRC = bodyOf(IX, 'async function handleGamesRecommend(');
check('게임 두 함수 몸통을 오려 냈다(전제)', GW.length > 300 && GRC.length > 300, [GW.length, GRC.length]);
for (const [name, body, anchor, bindRe, binds] of [
  ['게임 약점 목록(/api/games/weak)', GW, 'SELECT item, ko, wrong_count, correct_count, pron_best, pron_count FROM game_progress', /^\s*\)\.bind\(userId, lang, since, limit\)/, ['u', 'en', W.weakSince(NOW), 20]],
  ['맞춤 추천(/api/games/recommend)', GRC, 'SELECT item, ko, wrong_count, correct_count FROM game_progress', /^\s*\)\.bind\(userId, lang, weakSince\(Date\.now\(\)\)\)/, ['u', 'en', W.weakSince(NOW)]],
]) {
  const x = sqlAfter(body, anchor);
  check(name + ': SQL 을 찾았다(전제)', !!x);
  if (!x) continue;
  check(name + ': 조건을 다시 적지 않고 정본 조각을 쓴다', /\$\{WEAK_WHERE\}/.test(x.sql) && /\$\{WEAK_ORDER\}/.test(x.sql) && !/wrong_count\s*>=\s*correct_count/.test(x.sql), x.sql);
  check(name + ': 창 값을 바인드한다', bindRe.test(x.tail), x.tail.slice(0, 70));
  let rows = null;
  try { rows = runTpl(x.sql, binds).map((r) => r.item); } catch (e) { check(name + ': SQL 실행', false, e.message); }
  check(name + ': 실제로 돌리면 오래된 약점이 없고 최근 것이 먼저', !!rows && !rows.includes('old-big') && rows[0] === 'recent-small' && !rows.includes('not-mine'), rows);
}
check('약점 목록의 창(since)은 정본 weakSince 로 만든다', /const since = weakSince\(Date\.now\(\)\);/.test(GW));
{
  const x = sqlAfter(GW, 'SELECT COUNT(*) AS n FROM game_progress');
  check('창 밖 옛 약점 수를 정본 조각으로 센다', !!x && /\$\{WEAK_OLDER_WHERE\}/.test(x.sql) && /^\s*\)\.bind\(userId, lang, since\)/.test(x.tail), x && x.sql);
  let n = null; try { n = x ? runTpl(x.sql, ['u', 'en', W.weakSince(NOW)])[0].n : null; } catch (e) {}
  check('실제로 돌리면 창 밖 옛 약점 3개를 센다', n === 3, n);
}
check('응답에 창 길이·옛 약점 수를 싣는다', /window_days:\s*WEAK_RECENT_DAYS/.test(GW) && /\bolder\b/.test(GW.slice(GW.lastIndexOf('JSON.stringify({ ok: true'))));
check('선생님 리포트가 옛 문구(«아직 약점이 없어요»·«자주 틀린 순»)로 되돌아가지 않았다', !/아직 약점으로 잡힌 단어가 없어요/.test(GR) && !/\(자주 틀린 순\)/.test(GR));
// 화면 함수를 오려 내 가짜 DOM·fetch 로 «실제로» 그려 본다 — 「d.older 가 있는가」로는 한 자리만 끊는 변이를 못 본다.
async function renderReport(d) {
  const m = GR.match(/function escapeHtml\(s\)\{[^\n]*\}/);
  const fn = bodyOf(GR, 'function loadReport(');
  if (!m || !fn) return null;
  const els = { uid: { value: 'kid' }, summary: { innerHTML: '', textContent: '' }, content: { innerHTML: '' } };
  const doc = { getElementById: (id) => els[id] || { innerHTML: '' } };
  let done; const p = new Promise((r) => { done = r; });
  const fakeFetch = () => ({ then: (f1) => { const v = f1({ ok: true, json: () => d }); return { then: (f2) => { f2(v); done(); return { catch() {} }; } }; } });
  try {
    new Function('document', 'fetch', 'history', 'LANG', 'CUR_UID', m[0] + '\n' + fn + '\nloadReport();')(doc, fakeFetch, { replaceState() {} }, 'en', '');
  } catch (e) { return { err: String(e && e.message || e) }; }
  await Promise.race([p, new Promise((r) => setTimeout(r, 200))]);
  return { summary: els.summary.innerHTML, content: els.content.innerHTML };
}
{
  const e1 = await renderReport({ ok: true, weak: [], window_days: 60, older: 3 });
  check('리포트: 약점 0개 + 옛 약점 3개면 «최근 60일 · 오래된 3개는 뺐다» 를 말한다', !!e1 && /최근 60일/.test(e1.content || '') && /오래된 약점 3개/.test(e1.content || '') && /3 older/.test(e1.content || ''), e1);
  const e2 = await renderReport({ ok: true, weak: [], window_days: 60, older: 0 });
  check('리포트(짝): 옛 약점이 없으면 «뺐다» 줄이 없다', !!e2 && /최근 60일/.test(e2.content || '') && !/오래된 약점/.test(e2.content || ''), e2);
  const e3 = await renderReport({ ok: true, weak: [{ item: 'apple', ko: '사과', wrong: 2, correct: 0 }], window_days: 60, older: 4 });
  check('리포트: 목록 위에 «최근 60일 · 오래된 4개 제외» 를 적는다', !!e3 && /최근 60일/.test(e3.summary || '') && /4개 제외/.test(e3.summary || '') && /apple/.test(e3.content || ''), e3);
  const e4 = await renderReport({ ok: true, weak: [] });
  check('리포트(짝): 옛 서버(older 없음)면 «뺐다» 를 지어내지 않는다', !!e4 && !/오래된 약점/.test(e4.content || ''), e4);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
