// warmup_fix_trace_harness — 웜업 교정 «판정 사유» 기록(src/warmup-fix-trace.ts) 검사 (2026-10-31)
// 실행: node test-harness/warmup_fix_trace_harness.mjs
// 확인하는 것:
//   · 정상 기록 한 줄이 들어간다(사유·모드·태그가 그대로)
//   · DB 가 없거나 던져도 호출한 쪽에 예외를 던지지 않는다(대화를 멈추지 않는다)
//   · 표는 한 번만 만든다(매 턴 CREATE 를 보내지 않는다)
//   · 학생 발화·문장은 어디에도 실리지 않는다(함수가 받는 필드만 저장)
//   · 판정 블록이 index.ts 에 실제로 연결돼 있다(사유를 세는 줄 전부)
//   ➕ (2026-11-04 「웜업 쪽도 내일 같이 재봐줘」) 답장 «시작 말 종류» 네 칸
//   · 옛 표(칸 없음)에서도 기록이 죽지 않는다 — 처음 한 번 ALTER 후 다시 넣고, 끝내 안 되면 옛 일곱 칸
//   · 분류(src/warmup-reply-start.ts)를 실제로 돌린다 — 첫마디·칭찬·교정 앞머리·그 밖, 그리고 «본문이 안 새는가»
//   · index.ts 가 «최종 답장»(교정 앞머리까지 붙은 뒤)을 넘기고, 첫마디 판정 조건이 [연결 표현] 줄과 같다

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { deadAt, commentsBalanced, hasLineCommentedCode } from './helpers/live-code.mjs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
};

const src = readFileSync(join(root, 'cloudflare-deploy/src/warmup-fix-trace.ts'), 'utf8');
// 모듈 수준 캐시(표 만들기 완료 여부)가 검사 사이에 새지 않도록, 검사마다 새 모듈 인스턴스를 받는다.
const load = () => import('data:text/javascript,' + encodeURIComponent(stripTypeScriptTypes(src)) + '//' + Math.random());
let M;
try {
  M = await load();
} catch (e) {
  ok('정본을 읽어 실행할 수 있다', false, e?.message || e);
  console.log(`\nwarmup_fix_trace_harness — PASS ${pass} / FAIL ${fail}`);
  process.exit(1);
}

function fakeDb({ failCreate = false, failInsert = false } = {}) {
  const log = { creates: 0, inserts: [] };
  return {
    log,
    prepare(sql) {
      return {
        run: async () => {
          if (/CREATE TABLE/.test(sql)) { log.creates++; if (failCreate) throw new Error('create down'); return {}; }
          if (failInsert) throw new Error('insert down');
          return {};
        },
        bind: (...args) => ({
          run: async () => { if (failInsert) throw new Error('insert down'); log.inserts.push({ sql, args }); return {}; },
        }),
      };
    },
  };
}

const row = { userId: 'kim01', sessionId: 's1', lang: 'en', mode: 'focused', reason: 'held_gap', tag: 'tense' };

console.log('\n[1] 정상 기록');
{
  const db = fakeDb();
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('한 줄이 들어간다', db.log.inserts.length === 1, db.log.inserts.length);
  const a = db.log.inserts[0]?.args || [];
  ok('사유·모드·태그·언어가 그대로 들어간다', a[4] === 'held_gap' && a[3] === 'focused' && a[5] === 'tense' && a[2] === 'en', a);
  ok('저장 칸은 정해진 열한 개뿐이다(학생 발화·답장 본문 칸이 없다)', a.length === 11, a.length);
  ok('새 네 칸은 비어 있으면 빈 값', a.slice(7).every(v => v === ''), a.slice(7));
  const db2 = fakeDb();
  await M.logWarmupFixTrace({ DB: db2 }, { ...row, openerTurn: 'on', startKind: 'opener', startWord: 'Oh no.', grade: 'partial' });
  const b = db2.log.inserts[0]?.args || [];
  ok('첫마디 상태·시작 종류·시작 말·등급이 그대로 들어간다', b[7] === 'on' && b[8] === 'opener' && b[9] === 'Oh no.' && b[10] === 'partial', b.slice(7));
  ok('INSERT 칸 이름이 열한 개(옛 일곱 + 넷)', /created_at, opener_turn, start_kind, start_word, grade\) VALUES \(\?,\?,\?,\?,\?,\?,\?,\?,\?,\?,\?\)/.test(db2.log.inserts[0]?.sql || ''), db2.log.inserts[0]?.sql);
  const createSql = /CREATE TABLE IF NOT EXISTS warmup_fix_trace \(([\s\S]*?)\)`/.exec(src)?.[1] || '';
  const extraCols = (/const EXTRA_COLS = \[([^\]]*)\]/.exec(src)?.[1] || '').match(/'([a-z_]+)'/g)?.map(x => x.slice(1, -1)) || [];
  ok('새 칸 목록(EXTRA_COLS)이 넷이고 CREATE 에도 전부 있다', extraCols.length === 4 && extraCols.every(c => new RegExp('\\b' + c + ' TEXT').test(createSql)), extraCols);
}

console.log('\n[2] 표는 한 번만 만든다');
{
  M = await load();
  const db = fakeDb();
  for (let i = 0; i < 5; i++) await M.logWarmupFixTrace({ DB: db }, row);
  ok('다섯 번 불러도 CREATE 는 한 번', db.log.creates === 1, db.log.creates);
  ok('다섯 번 모두 기록된다', db.log.inserts.length === 5, db.log.inserts.length);
}

console.log('\n[3] 실패해도 던지지 않는다');
{
  let threw = false;
  try { await M.logWarmupFixTrace(undefined, row); await M.logWarmupFixTrace({}, row); } catch { threw = true; }
  ok('DB 가 없으면 조용히 넘어간다', !threw);
  threw = false;
  try { await M.logWarmupFixTrace({ DB: fakeDb({ failCreate: true }) }, row); } catch { threw = true; }
  ok('표 만들기가 실패해도 던지지 않는다', !threw);
  threw = false;
  try { await M.logWarmupFixTrace({ DB: fakeDb({ failInsert: true }) }, row); } catch { threw = true; }
  ok('기록(INSERT)이 실패해도 던지지 않는다', !threw);
}

console.log('\n[4] 실패한 표 만들기는 다음 턴에 다시 시도한다');
{
  M = await load();
  // 첫 번째 시도만 실패하게 — 그 뒤엔 살아난다고 보고 다시 만들기를 시도해야 한다.
  let calls = 0;
  const db = { prepare: (sql) => ({ run: async () => { if (/CREATE/.test(sql)) { calls++; if (calls === 1) throw new Error('once'); } return {}; }, bind: () => ({ run: async () => ({}) }) }) };
  await M.logWarmupFixTrace({ DB: db }, row);
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('첫 실패 뒤 다음 턴에 CREATE 를 다시 보낸다', calls === 2, calls);
}

console.log('\n[5] 판정 블록이 index.ts 에 연결돼 있다');
{
  const idx = readFileSync(join(root, 'cloudflare-deploy/src/index.ts'), 'utf8');
  const callLines = idx.split('\n').filter(l => /logWarmupFixTrace\(env,/.test(l));
  ok('턴마다 기록을 부르는 줄이 정확히 하나', callLines.length === 1, callLines.length);
  const reasonSets = idx.split('\n').filter(l => /traceReason = /.test(l)).length;
  ok('사유를 바꾸는 대입이 셋 이상(없음/거절은 한 줄, 보류·가림·보여줌)', reasonSets >= 3, reasonSets);
  ok('엘리더잼 표시를 교정 판정에 넘기지 않는다', !/resolveWarmupHonest\([^)]*eleader:/.test(idx));
}

console.log('\n[6] 옛 표(네 칸이 없음) — 한 번 ALTER 하고 다시 넣는다');
{
  M = await load();
  const log = { alters: 0, full: 0, legacy: 0, fullTries: 0 };
  let cols = false;
  const db = { prepare: (sql) => ({
    run: async () => {
      if (/ALTER TABLE warmup_fix_trace ADD COLUMN/.test(sql)) { log.alters++; if (log.alters >= 4) cols = true; return {}; }
      return {};
    },
    bind: () => ({ run: async () => {
      if (/opener_turn/.test(sql)) { log.fullTries++; if (!cols) throw new Error('D1_ERROR: table warmup_fix_trace has no column named opener_turn: SQLITE_ERROR'); log.full++; return {}; }
      log.legacy++; return {};
    } }),
  }) };
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('칸 없음 오류 뒤 네 칸을 ALTER 한다', log.alters === 4, log.alters);
  ok('ALTER 뒤 다시 넣어 «새 칸 포함» 한 줄이 들어간다', log.full === 1 && log.legacy === 0, log);
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('두 번째 턴엔 ALTER 를 다시 안 보낸다(왕복이 안 는다)', log.alters === 4 && log.full === 2 && log.fullTries === 3, log);
}

console.log('\n[7] ALTER 로도 안 되면 옛 일곱 칸으로라도 남긴다(판정 사유가 통째로 죽지 않게)');
{
  M = await load();
  const log = { alters: 0, fullTries: 0, legacy: [] };
  const db = { prepare: (sql) => ({
    run: async () => { if (/ALTER/.test(sql)) { log.alters++; throw new Error('not authorized'); } return {}; },
    bind: (...args) => ({ run: async () => {
      if (/opener_turn/.test(sql)) { log.fullTries++; throw new Error('table warmup_fix_trace has no column named opener_turn'); }
      log.legacy.push(args); return {};
    } }),
  }) };
  let threw = false;
  try { await M.logWarmupFixTrace({ DB: db }, row); } catch { threw = true; }
  ok('던지지 않는다', !threw);
  ok('옛 일곱 칸 한 줄이 들어간다', log.legacy.length === 1 && log.legacy[0].length === 7 && log.legacy[0][4] === 'held_gap', log.legacy);
  await M.logWarmupFixTrace({ DB: db }, row);
  ok('그 뒤 턴은 바로 옛 일곱 칸(새 칸 시도·ALTER 를 되풀이하지 않는다)', log.fullTries === 2 && log.alters === 4 && log.legacy.length === 2, log);
}

console.log('\n[7b] ALTER 뒤 다시 넣기가 «일시» 실패 — 굳히지 않고 다음 턴에 다시 시도(두 줄도 안 쓴다)');
{
  M = await load();
  const log = { alters: 0, full: 0, legacy: 0, fullTries: 0 };
  let cols = false, flaky = 1;
  const db = { prepare: (sql) => ({
    run: async () => { if (/ALTER/.test(sql)) { log.alters++; if (log.alters >= 4) cols = true; } return {}; },
    bind: () => ({ run: async () => {
      if (/opener_turn/.test(sql)) {
        log.fullTries++;
        if (!cols) throw new Error('table warmup_fix_trace has no column named opener_turn');
        if (flaky-- > 0) throw new Error('Network connection lost.');
        log.full++; return {};
      }
      log.legacy++; return {};
    } }),
  }) };
  const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  let threw = false;
  try { await M.logWarmupFixTrace({ DB: db }, row); } catch { threw = true; }
  ok('던지지 않고, 이번 턴은 옛 일곱 칸으로 «또» 쓰지 않는다(두 줄 방지)', !threw && log.legacy === 0 && log.full === 0, log);
  ok('일시 실패를 경고로 남긴다', warns.some(w => /warmup-fix-trace/.test(w) && /Network connection lost/.test(w)), warns);
  await M.logWarmupFixTrace({ DB: db }, row);
  console.warn = ow;
  ok('다음 턴엔 새 칸으로 다시 넣어 성공한다(옛 칸으로 굳지 않는다)', log.full === 1 && log.legacy === 0, log);
}

console.log('\n[7c] 정말로 못 붙이면(또 칸 없음) 옛 칸으로 내려가며 경고를 남긴다');
{
  M = await load();
  const db = { prepare: (sql) => ({
    run: async () => { if (/ALTER/.test(sql)) throw new Error('not authorized'); return {}; },
    bind: () => ({ run: async () => { if (/opener_turn/.test(sql)) throw new Error('table warmup_fix_trace has no column named opener_turn'); return {}; } }),
  }) };
  const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  await M.logWarmupFixTrace({ DB: db }, row);
  console.warn = ow;
  ok('«옛 일곱 칸으로 남긴다» 경고 한 줄', warns.some(w => /extra columns unavailable/.test(w)), warns);
}

console.log('\n[11] 진짜 SQLite — 운영의 옛 표(일곱 칸)에서 ALTER 가 실제로 먹고 네 칸이 채워진다');
{
  let DatabaseSync = null;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
  ok('node:sqlite 를 쓸 수 있다(이 절의 전제)', !!DatabaseSync);
  if (DatabaseSync) {
    const OLD_DDL = `CREATE TABLE warmup_fix_trace (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL DEFAULT '', session_id TEXT NOT NULL DEFAULT '', lang TEXT NOT NULL DEFAULT 'en', mode TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL)`;
    const d1 = (db) => ({ prepare: (sql) => ({
      run: async () => { db.prepare(sql).run(); return {}; },
      bind: (...a) => ({ run: async () => { db.prepare(sql).run(...a); return {}; } }),
    }) });
    const cols = (db) => db.prepare('PRAGMA table_info(warmup_fix_trace)').all().map(r => r.name);
    // ① 옛 표 → 첫 기록에서 ALTER → 네 칸 채워짐
    {
      M = await load();
      const db = new DatabaseSync(':memory:');
      db.exec(OLD_DDL);
      db.prepare(`INSERT INTO warmup_fix_trace (user_id, session_id, lang, mode, reason, tag, created_at) VALUES ('old','s0','en','','shown','',1)`).run();
      await M.logWarmupFixTrace({ DB: d1(db) }, { ...row, openerTurn: 'on', startKind: 'opener', startWord: 'Oh no.', grade: 'perfect' });
      const c = cols(db);
      ok('네 칸이 실제로 붙었다', ['opener_turn', 'start_kind', 'start_word', 'grade'].every(x => c.includes(x)), c);
      const r = db.prepare(`SELECT * FROM warmup_fix_trace ORDER BY id DESC LIMIT 1`).get();
      ok('새 줄에 네 칸 값이 들어갔다', r && r.opener_turn === 'on' && r.start_kind === 'opener' && r.start_word === 'Oh no.' && r.grade === 'perfect', r);
      const old = db.prepare(`SELECT * FROM warmup_fix_trace WHERE user_id='old'`).get();
      ok('옛 줄은 빈 값으로 남는다(기존 데이터 무변경)', old && old.opener_turn === '' && old.reason === 'shown', old);
      await M.logWarmupFixTrace({ DB: d1(db) }, { ...row, startKind: 'praise', startWord: 'Great job!' });
      ok('두 번째 턴도 새 칸으로', db.prepare(`SELECT COUNT(*) n FROM warmup_fix_trace WHERE start_kind='praise'`).get().n === 1);
    }
    // ② 다른 워커가 칸 일부를 먼저 붙인 경우 — 중복 칸 오류를 삼키고 나머지를 붙인다
    {
      M = await load();
      const db = new DatabaseSync(':memory:');
      db.exec(OLD_DDL);
      db.exec(`ALTER TABLE warmup_fix_trace ADD COLUMN opener_turn TEXT NOT NULL DEFAULT ''`);
      db.exec(`ALTER TABLE warmup_fix_trace ADD COLUMN start_kind TEXT NOT NULL DEFAULT ''`);
      let threw = false;
      try { await M.logWarmupFixTrace({ DB: d1(db) }, { ...row, openerTurn: 'rest', startKind: 'other', grade: 'partial' }); } catch { threw = true; }
      const r = db.prepare(`SELECT * FROM warmup_fix_trace ORDER BY id DESC LIMIT 1`).get();
      ok('일부가 이미 있어도 나머지를 붙여 새 칸으로 들어간다', !threw && r && r.opener_turn === 'rest' && r.grade === 'partial', r);
    }
    // ③ 새 DB — CREATE 한 번으로 네 칸까지
    {
      M = await load();
      const db = new DatabaseSync(':memory:');
      await M.logWarmupFixTrace({ DB: d1(db) }, { ...row, openerTurn: 'first', startKind: 'other' });
      const r = db.prepare(`SELECT * FROM warmup_fix_trace`).get();
      ok('새 DB 는 CREATE 만으로 네 칸이 있다', r && r.opener_turn === 'first', r);
    }
  }
}

console.log('\n[8] 칸 문제가 아닌 실패는 예전처럼 넘어간다(옛 일곱 칸으로 두 번 쓰지 않는다)');
{
  M = await load();
  const log = { legacy: 0, alters: 0 };
  const db = { prepare: (sql) => ({
    run: async () => { if (/ALTER/.test(sql)) log.alters++; return {}; },
    bind: () => ({ run: async () => { if (/opener_turn/.test(sql)) throw new Error('D1 overloaded'); log.legacy++; return {}; } }),
  }) };
  let threw = false;
  try { await M.logWarmupFixTrace({ DB: db }, row); } catch { threw = true; }
  ok('던지지 않고 ALTER·옛 기록도 안 한다', !threw && log.alters === 0 && log.legacy === 0, log);
}

console.log('\n[9] 답장 «시작 말 종류» — 정본을 실제로 돌린다');
let R = null, C = null, E = null;
{
  const dir = mkdtempSync(join(tmpdir(), 'wrs-'));
  for (const f of ['conversation-connectors', 'warmup-empathy', 'warmup-reply-start']) {
    const t = readFileSync(join(root, 'cloudflare-deploy/src', f + '.ts'), 'utf8');
    const js = stripTypeScriptTypes(t).replace(/from '\.\/([\w-]+)'/g, "from './$1.mjs'");
    writeFileSync(join(dir, f + '.mjs'), js);
  }
  try {
    R = await import(pathToFileURL(join(dir, 'warmup-reply-start.mjs')).href);
    C = await import(pathToFileURL(join(dir, 'conversation-connectors.mjs')).href);
    E = await import(pathToFileURL(join(dir, 'warmup-empathy.mjs')).href);
  } catch (e) { ok('분류 정본을 읽어 실행할 수 있다', false, e?.message || e); }
}
if (R) {
  const S = (t) => R.replyStartOf(t);
  const eq = (name, t, kind, word) => { const r = S(t); ok(name, r.kind === kind && (word === undefined || r.word === word), JSON.stringify(r)); };
  eq('첫마디 «Oh no.»', 'Oh no. That sounds hard. What happened?', 'opener', 'Oh no.');
  eq('첫마디 «Sure!»', "Sure! Let's talk about dogs. Do you have one?", 'opener', 'Sure!');
  eq('첫마디 «Sounds fun!»(칭찬 아님)', 'Sounds fun! What did you play?', 'opener', 'Sounds fun!');
  eq('첫마디 «Anyway,»', 'Anyway, what is your favorite food?', 'opener', 'Anyway,');
  eq('칭찬 «Great job!»', 'Great job! What else did you eat?', 'praise', 'Great job!');
  eq('«Oh, nice!» 는 첫마디가 아니라 칭찬(칭찬이 이긴다)', 'Oh, nice! What color is it?', 'praise', 'Oh, nice!');
  eq('겹칭찬 «Great try! Nice one!»', 'Great try! Nice one! Do you like cats?', 'praise', 'Great try! Nice one!');
  eq('칭찬뿐인 답장도 칭찬', 'Awesome!', 'praise', 'Awesome!');
  eq('집중교정 앞머리', 'You can say... "I went to school." "I went to school." "I went to school." Can you say it with me?', 'fix', 'You can say');
  eq('교정 카드 앞머리', 'Let\'s say it like this: "I ate pizza." What did you eat?', 'fix', "Let's say it like this");
  eq('중국어 교정 앞머리', '我们可以这样说："我吃了米饭。" 你喜欢吃什么？', 'fix', '我们可以这样说');
  eq('질문으로 바로 시작 → 그 밖', 'What did you eat for lunch?', 'other', '');
  eq('이모지·따옴표가 앞에 있어도', '😊 "Oh no. What happened?"', 'opener', 'Oh no.');
  eq('빈 답장 → 모름', '   ', '', '');
  for (const bad of [null, undefined, {}, 42, { toString() { throw new Error('x'); } }]) {
    let threw = false, r = null; try { r = S(bad); } catch { threw = true; }
    ok('이상한 값에도 던지지 않는다: ' + (bad === null ? 'null' : typeof bad), !threw && r && typeof r.kind === 'string' && typeof r.word === 'string');
  }
  // 🔒 본문이 새지 않는다 — 이름·내용이 머리말에 섞여도 word 에 안 들어간다
  eq('«Oh, Minsu!» → 첫마디지만 이름은 안 남는다', "Oh, Minsu! What is your dog's name?", 'opener', 'Oh');
  eq('«Minsu, …» → 그 밖·빈 값', 'Minsu, what did you eat today?', 'other', '');
  eq('«Pizza! …» → 그 밖·빈 값', 'Pizza! I love pizza too. What toppings?', 'other', '');
  eq('부호만 바꾼 첫마디 «Oh no!» → 후보 «Oh no.» 로 남긴다', 'Oh no! What happened?', 'opener', 'Oh no.');
  eq('후보에 없는 «Oh, cute!» → «Oh» 만', 'Oh, cute! What is its name?', 'opener', 'Oh');
  eq('«Well, …» → «Well,»', 'Well, I like it too. Do you?', 'opener', 'Well,');
  { const r = S('By the river, we can play. Do you like rivers?'); ok('«By the river,» 를 «By the way,» 로 세지 않는다', r.word !== 'By the way,', JSON.stringify(r)); }
  eq('«By the way,» 는 그대로', 'By the way, do you have a pet?', 'opener', 'By the way,');
  // 목록과 정본의 짝 — 후보는 전부 «자기 말 그대로» 첫마디로, 칭찬 칸은 전부 칭찬으로 잡혀야 한다
  for (const [cs, list] of Object.entries(C.TURN_OPENERS)) for (const o of list) eq('첫마디 후보 ' + cs + ' «' + o + '»', o + ' Do you like it?', 'opener', o);
  for (const p of C.TURN_PRAISE) eq('칭찬 칸 «' + p + '» 는 칭찬', p + ' Do you like it?', 'praise', p);
  // 🔒 무작위 퍼즈 — word 는 «목록의 말» 로만 이루어진다
  const allowedOpener = new Set(['', 'Oh', 'Well,', 'By the way,', 'Anyway,', ...Object.values(C.TURN_OPENERS).flat()]);
  const cheerWords = new Set(['oh', ...E.CHEER_LEADS.flatMap(k => k.split(' '))].map(w => w.replace(/[’‘]/g, "'")));
  const pool = ['Oh', 'oh', 'Nice', 'Great', 'job', 'Minsu', 'Jiwoo', 'pizza', 'dog', 'Sure', 'Well', 'By', 'the', 'way', 'Anyway', 'I', 'see', 'You', 'can', 'say', 'Wow', 'yes', 'Perfect', 'my', 'home', 'secret', '123', 'Sounds', 'fun', 'No', 'way', 'Really'];
  const punct = ['', ',', '!', '.', '?', ' '];
  let seed = 7, leaks = 0, n = 0, firstLeak = '';
  const rnd = (k) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % k; };
  for (let i = 0; i < 4000; i++) {
    let t = '';
    const len = 1 + rnd(6);
    for (let j = 0; j < len; j++) t += pool[rnd(pool.length)] + punct[rnd(punct.length)] + ' ';
    const r = S(t);
    n++;
    let bad = false;
    if (r.kind === 'opener') bad = !allowedOpener.has(r.word);
    else if (r.kind === 'praise') bad = !r.word.toLowerCase().split(/[\s,!.?~]+/).filter(Boolean).every(w => cheerWords.has(w));
    else if (r.kind === 'fix') bad = !['You can say', "Let's say it like this", '我们可以这样说'].includes(r.word);
    else bad = r.word !== '';
    if (bad) { leaks++; if (!firstLeak) firstLeak = JSON.stringify({ t, r }); }
  }
  ok('무작위 답장 ' + n + '개 — 남기는 말은 전부 «목록의 말»', leaks === 0, firstLeak);

  // 첫마디 줄이 실린 턴인가
  const H1 = [{ role: 'user', content: 'I like dogs.' }, { role: 'assistant', content: 'What is your dog\'s name?' }];
  const H2 = [{ role: 'user', content: 'My dog is sick.' }, { role: 'assistant', content: 'Oh no. What happened to him?' }];
  ok('세션 첫 답 → first', R.openerTurnState(true, []) === 'first', R.openerTurnState(true, []));
  ok('앞 답이 첫마디가 아니면 → on (정본 turnOpenerLine 도 줄을 낸다)', R.openerTurnState(true, H1) === 'on' && !!C.turnOpenerLine(H1));
  ok('앞 답이 첫마디면 → rest (정본도 빈 줄)', R.openerTurnState(true, H2) === 'rest' && C.turnOpenerLine(H2) === '');
  ok('연결 표현을 안 싣는 대화 → off', R.openerTurnState(false, H1) === 'off');
  let threw = false; try { R.openerTurnState(true, { length: 3 }); R.openerTurnState(true, null); } catch { threw = true; }
  ok('이상한 기록에도 던지지 않는다', !threw);
}

console.log('\n[10] index.ts 배선 — «최종» 답장을 넘기고, 첫마디 조건이 [연결 표현] 줄과 같다');
{
  const idx = readFileSync(join(root, 'cloudflare-deploy/src/index.ts'), 'utf8');
  const fnFrom = idx.indexOf('async function handleWarmupChat(');
  const leadIn = idx.indexOf('aiText = correctionLeadIn(aiText, showFix', fnFrom);
  const startAt = idx.indexOf('const traceStart = replyStartOf(aiText);', fnFrom);
  const callAt = idx.indexOf('await logWarmupFixTrace(env, {', fnFrom);
  const histAt = idx.indexOf('// ── 히스토리 갱신', fnFrom);
  ok('분류를 부르는 줄이 살아 있다(주석 밖)', startAt > 0 && deadAt(idx, startAt, fnFrom) === '', deadAt(idx, startAt, fnFrom));
  ok('기록을 부르는 줄이 살아 있다(주석 밖)', callAt > 0 && deadAt(idx, callAt, fnFrom) === '', deadAt(idx, callAt, fnFrom));
  ok('순서: 교정 앞머리 붙이기 → 분류 → 기록 → 히스토리 저장', leadIn > 0 && leadIn < startAt && startAt < callAt && callAt < histAt, [leadIn, startAt, callAt, histAt]);
  const between = idx.slice(startAt, histAt);
  ok('분류 뒤 히스토리 저장 전까지 답장을 다시 바꾸지 않는다(학생이 들은 그대로를 센다)', !/\baiText\s*=[^=]/.test(between.replace('replyStartOf(aiText)', '')));
  const callEnd = idx.indexOf('});', callAt);
  const call = idx.slice(callAt, callEnd + 3);
  ok('기록 호출 조각 안에 주석으로 막힌 줄이 없다', commentsBalanced(call) && !hasLineCommentedCode(call), call);
  ok('시작 종류·시작 말을 분류 결과 그대로 넘긴다', /startKind:\s*traceStart\.kind/.test(call) && /startWord:\s*traceStart\.word/.test(call), call);
  ok('등급을 넘긴다(정직한 칭찬 등급 변수)', /grade:\s*honestGrade\b/.test(call), call);
  const condOpen = /if \(([^\n]*?)\) sys \+= '\\n\[연결 표현\]\\n'/.exec(idx)?.[1] || '';
  const condTrace = /openerTurn:\s*openerTurnState\(([\s\S]*?),\s*history\)/.exec(call)?.[1] || '';
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  ok('첫마디 판정 조건이 [연결 표현] 줄과 같다', !!condOpen && norm(condOpen) === norm(condTrace), [condOpen, condTrace]);
  ok('예전 자리(교정 앞머리 «전»)에는 기록 호출이 남지 않았다', idx.slice(fnFrom, leadIn).indexOf('logWarmupFixTrace(env') < 0);
}

console.log(`\nwarmup_fix_trace_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
