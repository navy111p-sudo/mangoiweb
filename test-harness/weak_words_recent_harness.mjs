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
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

let W = null;
try { W = new Function(stripTypeScriptTypes(MOD).replace(/^export\s+/gm, '') + '\nreturn { WEAK_RECENT_DAYS, WEAK_WHERE, WEAK_ORDER, weakSince };')(); }
catch (e) { check('정본 실행', false, e.message); }
check('정본을 실제로 실행했다(전제)', !!W);
if (!W) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

const NOW = Date.UTC(2026, 9, 18);
const D = 86400000;
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE game_progress (id INTEGER PRIMARY KEY, user_id TEXT, lang TEXT, item TEXT, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, game TEXT DEFAULT '')`);
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

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
