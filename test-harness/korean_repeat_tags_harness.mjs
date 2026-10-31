// 2026-10-18 — 한국인 학습자 «되풀이 작은 실수» 이어 받기 (개선안 2순위 ⑦)
//   정본(recent-mistakes.ts 의 loadRecentFixTags·carryRepeatTags)과 교정 게이트(warmup-correction.ts
//   decideWarmupFixShow)를 타입 제거로 실제 실행하고, 기록은 진짜 SQLite 에 넣어 봅니다.
//   짝: «최근에 고쳐 준 관사는 새 대화의 첫 실수부터 고친다» 옆에
//       «기록 없으면 예전대로 두 번째부터» · «word_choice 는 이어 받지 않는다» · «간격 규칙은 그대로».
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const R = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const RM = R('cloudflare-deploy/src/recent-mistakes.ts', 'RM_SRC');
const WC = R('cloudflare-deploy/src/warmup-correction.ts', 'WC_SRC');
const AI = R('cloudflare-deploy/src/api-ai.ts', 'AI_SRC');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };
const load = (src, names) => new Function(stripTypeScriptTypes(src).replace(/^\s*import\s[^;]*;\s*$/gm, '').replace(/^export\s+/gm, '') + '\nreturn {' + names.join(',') + '};')();

let M = null, G = null;
try { M = load(RM, ['loadRecentFixTags', 'carryRepeatTags', 'KOREAN_REPEAT_TAGS', 'logAiFriendFix', 'AIFRIEND_FIX_DDL']); } catch (e) { check('recent-mistakes 실행', false, e.message); }
try { G = load(WC, ['decideWarmupFixShow']); } catch (e) { check('warmup-correction 실행', false, e.message); }
check('두 정본을 실제로 실행했다(전제)', !!(M && G));
if (!M || !G) { console.log(`\n결과: PASS ${pass} / FAIL ${fail}`); process.exit(1); }

const NOW = Date.UTC(2026, 9, 18), D = 86400000;
const sq = new DatabaseSync(':memory:');
sq.exec(`CREATE TABLE warmup_fix_log (id INTEGER PRIMARY KEY, session_id TEXT, user_id TEXT NOT NULL, was TEXT NOT NULL, fixed TEXT NOT NULL, why_ko TEXT, tag TEXT, severity TEXT, lang TEXT, created_at INTEGER NOT NULL)`);
for (const d of M.AIFRIEND_FIX_DDL) sq.exec(d);
const db = { prepare: (sql) => { const st = sq.prepare(sql); const at = (...a) => ({ all: async () => ({ results: st.all(...a) }), run: async () => st.run(...a), first: async () => st.get(...a) }); return { ...at(), bind: at }; }, exec: async (sql) => sq.exec(sql) };
const wins = sq.prepare(`INSERT INTO warmup_fix_log (user_id, was, fixed, tag, severity, lang, created_at) VALUES (?,?,?,?,?,?,?)`);
wins.run('kid', 'I have dog', 'I have a dog', 'article', 'minor', 'en', NOW - 3 * D);
wins.run('kid', 'two cat', 'two cats', 'plural', 'minor', 'en', NOW - 20 * D);       // 14일 밖
wins.run('kid', '我喜欢', '我很喜欢', 'article', 'minor', 'zh', NOW - 1 * D);          // 중국어는 안 셈
wins.run('kid', 'make a homework', 'do homework', 'word_choice', 'minor', 'en', NOW - 1 * D);
wins.run('other', 'in Monday', 'on Monday', 'preposition', 'minor', 'en', NOW - 1 * D);
await M.logAiFriendFix(db, 'kid', { was: 'at Monday', now: 'on Monday', tag: 'preposition', severity: 'minor' }, NOW - 2 * D);

const hist = await M.loadRecentFixTags(db, 'kid', NOW);
check('최근 14일·영어·내 기록만 센다(두 표 합쳐서)', hist.article === 1 && !hist.plural && hist.preposition === 1 && hist.word_choice === 1, hist);
check('다른 학생 기록은 안 센다', Object.values(hist).reduce((a, b) => a + b, 0) === 3, hist);
check('던지지 않는다 — db 없음·uid 없음·표 없음', JSON.stringify(await M.loadRecentFixTags(null, 'kid', NOW)) === '{}' && JSON.stringify(await M.loadRecentFixTags(db, '', NOW)) === '{}'
  && JSON.stringify(await M.loadRecentFixTags({ prepare: () => { throw new Error('no table'); } }, 'kid', NOW)) === '{}');

const fix = (tag) => ({ was: 'x', now: 'y', why_ko: 'z', tag, severity: 'minor' });
const first = (tag, h) => G.decideWarmupFixShow(fix(tag), M.carryRepeatTags(null, h), 1).show;
check('최근에 고쳐 준 관사 → 새 대화 첫 관사 실수부터 바로 고친다', !!first('article', hist));
check('전치사도(AI 친구 기록에서 이어 받음)', !!first('preposition', hist));
/* 2026-10-30 — 작은 실수는 이제 기록이 없어도 «첫 번째» 에 고친다(warmup-correction.ts). 이어 받기는 word_choice 를 «여전히» 안 연다. */
check('2026-10-30: 기록이 없어도 첫 관사 실수를 고친다', !!first('article', {}) && !!first('article', null));
check('짝: 14일 밖(복수)은 이어 받지 않는다 — 메모에 안 얹는다', !(M.carryRepeatTags(null, hist).tags || {}).plural);
check('짝: word_choice 는 기록이 있어도 이어 받지 않는다(매번 교정 방지)', !first('word_choice', hist));
check('목록은 관사·복수·전치사 셋', JSON.stringify([...M.KOREAN_REPEAT_TAGS]) === '["article","plural","preposition"]');

// 간격 규칙은 그대로 — 방금(턴 3) 고쳐 줬으면 턴 4 의 관사는 안 띄운다
const m2 = M.carryRepeatTags({ tags: { article: 2 }, lastShownTurn: 3, shown: 1 }, hist);
check('짝: 연달아 고치지 않는 간격은 그대로 걸린다', !G.decideWarmupFixShow(fix('article'), m2, 4).show && !!G.decideWarmupFixShow(fix('article'), m2, 5).show);
const orig = { tags: { article: 0 }, lastShownTurn: 7 };
const c = M.carryRepeatTags(orig, hist);
check('원본 메모를 바꾸지 않는다', orig.tags.article === 0 && c.tags.article === 1 && c.lastShownTurn === 7);
check('이미 센 값을 줄이지 않는다', M.carryRepeatTags({ tags: { article: 3 } }, hist).tags.article === 3);

// 배선: AI 친구가 게이트 «앞» 에서 이어 받는가 · 큰 실수에는 조회하지 않는가
{
  const a = AI.indexOf('memoIn = carryRepeatTags(memoIn, await loadRecentFixTags(env.DB, uid, Date.now()))');
  const g = AI.indexOf('const decided = decideWarmupFixShow(verified, memoIn, turnNo');
  check('AI 친구: 게이트를 부르기 «전» 에 이어 받는다', a > 0 && g > a && g - a < 300, [a, g]);
  const line = AI.slice(AI.lastIndexOf('\n', a), a);
  check('AI 친구: 작은 실수일 때만 조회한다', /if \(verified && verified\.severity !== 'major'\)/.test(line), line);
  check('AI 친구: 정본을 import 한다', /loadRecentFixTags, carryRepeatTags \} from '\.\/recent-mistakes'/.test(AI));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
