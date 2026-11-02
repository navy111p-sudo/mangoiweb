// 🏷️ 단어장 «어색한 표현» 꼬리표 하니스 (2026-11-02)
//   AI 영작에서 🟡 어색한 표현을 원어민 표현으로 고친 카드만 단어장 화면에 따로 표시되는가.
//   ① 정본 src/vocab-tags.ts 를 진짜 SQLite(D1 모양)로 실제로 돌림 — 표시·읽기·실패해도 안 던짐
//   ② 저장 경로(api-ai.ts): 🟡 만 꼬리표, 🔴 는 안 붙임 — 후보 목록 조립식을 오려 실제로 평가
//   ③ 목록 API(api-games.ts)가 꼬리표를 실어 보내는가 · ④ 화면이 그것으로 따로 그리는가(짝: 일반 카드는 안 그림)
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes } from 'node:module';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };
const ROOT = new URL('../cloudflare-deploy/', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

// D1 모양으로 감싼 진짜 SQLite
function d1(db) {
  return {
    prepare(sql) {
      const st = db.prepare(sql);
      const mk = (args) => ({
        run: async () => { const r = st.run(...args); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: r.changes } }; },
        all: async () => ({ results: st.all(...args) }),
        first: async () => st.get(...args) ?? null,
      });
      return { ...mk([]), bind: (...a) => mk(a) };
    },
  };
}

console.log('[ ① 정본 vocab-tags.ts 실행 ]');
const modSrc = stripTypeScriptTypes(read('src/vocab-tags.ts'));
const mod = await import('data:text/javascript,' + encodeURIComponent(modSrc));
{
  const db = d1(new DatabaseSync(':memory:'));
  ok('①-1 표가 없어도 읽기는 빈 Map(던지지 않음)', (await mod.loadVocabTags(db, 'kim')).size === 0);
  ok('①-2 표시하면 true', await mod.markVocabTag(db, 7, 'kim', mod.VOCAB_TAG_AWKWARD) === true);
  await mod.markVocabTag(db, 9, 'lee', mod.VOCAB_TAG_AWKWARD);
  const m = await mod.loadVocabTags(db, 'kim');
  ok('①-3 그 학생 카드만 돌아온다', m.size === 1 && m.get(7) === 'awkward');
  ok('①-4 남의 카드는 안 섞인다', !m.has(9));
  ok('①-5 id 가 없으면 표시 안 함', await mod.markVocabTag(db, 0, 'kim', 'awkward') === false);
  const broken = { prepare() { throw new Error('D1 down'); } };
  let threw = false;
  try { ok('①-6 DB 가 죽어도 표시 false', await mod.markVocabTag(broken, 3, 'kim', 'awkward') === false);
        ok('①-7 DB 가 죽어도 읽기 빈 Map', (await mod.loadVocabTags(broken, 'kim')).size === 0); } catch { threw = true; }
  ok('①-8 던지지 않는다', !threw);
  ok('①-9 CREATE 는 한 줄(exec 여러 줄 함정 회피)', !/CREATE TABLE[^`]*\n/.test(read('src/vocab-tags.ts')));
}

console.log('[ ② 저장 경로 — 🟡 만 꼬리표 ]');
const AI = read('src/api-ai.ts');
{
  const m = AI.match(/const vocabCands = (\[[^;]+\]);/);
  ok('②-1 후보 목록을 찾았다', !!m);
  let cands = [];
  try { cands = new Function('issues', 'suggestions', 'return ' + m[1].replace(/\(iss: any\)/g, '(iss)'))([{ suggested: 'I went' }], [{ suggested: "I'm not feeling well today." }]); } catch (e) { console.log('   ', e.message); }
  ok('②-2 오류가 먼저', cands[0]?.iss?.suggested === 'I went' && cands[0]?.awkward === false);
  ok('②-3 어색한 표현은 awkward', cands[1]?.awkward === true);
  ok('②-4 넣은 행 id 로 표시', /if \(awkward\) await markVocabTag\(env\.DB, Number\(vIns\?\.meta\?\.last_row_id\), uid, VOCAB_TAG_AWKWARD\)/.test(AI));
  ok('②-5 판단력 오답 기록은 여전히 오류만', /const jList = issues\.length/.test(AI));
}

console.log('[ ③ 목록·복습 API 가 꼬리표를 싣는가 — 헬퍼를 실제로 돌림 ]');
const G = read('src/api-games.ts');
{
  const blockOf = (route) => { const i = G.indexOf(`path === '${route}'`); return i < 0 ? '' : G.slice(i, G.indexOf('\n    }\n', i)); };
  const list = blockOf('/api/vocab/list'), due = blockOf('/api/vocab/due');
  ok('③-1 목록 응답이 꼬리표 헬퍼를 지난다', /words = await attachVocabTags\(await readableVocab\(/.test(list) && /words, trial: gate\.trial/.test(list));
  ok('③-2 복습 퀴즈 응답도 같은 헬퍼를 지난다', /words: await attachVocabTags\(await readableVocab\(/.test(due));
  // 헬퍼 몸통을 오려 가짜 loadVocabTags 로 실제 실행 — 꼬리표 있는 카드에만 tag
  const m = G.match(/const attachVocabTags = async \(words: any\[\], uid: string\) => \{([\s\S]*?)\n    \};/);
  ok('③-3 헬퍼를 찾았다', !!m);
  let out = [];
  try {
    const body = m[1].replace(/ as any\[\]/g, '');
    const fn = new Function('loadVocabTags', 'env', 'return async (words, uid) => {' + body + '};')(
      async (_db, uid) => new Map(uid === 'kim' ? [[1, 'awkward']] : []), { DB: {} });
    out = await fn([{ id: 1, word: 'a' }, { id: 2, word: 'b' }], 'kim');
  } catch (e) { console.log('   ', e.message); }
  ok('③-4 꼬리표 카드에만 tag', out[0]?.tag === 'awkward' && out[1]?.tag === undefined);
}

console.log('[ ④ 화면이 따로 그리는가 — 짝 검사 ]');
const H = read('public/vocab.html');
{
  const i = H.indexOf('async function loadCollection');
  const j = H.indexOf('async function delWord', i);
  const body = H.slice(i, j);
  const cardFn = body.match(/(?:d\.words|shown)\.map\(w => \{([\s\S]*?)\n      \}\)\.join/);
  ok('④-1 카드 그리기를 찾았다', !!cardFn);
  let render = null;
  try { render = new Function('w', 'esc', 'rarity', '_en', cardFn[1]); } catch (e) { console.log('   ', e.message); }
  const esc = (s) => String(s);
  const rarity = () => ({ cls: 'r-seed', tag: '새싹', stars: '🌱' });
  const a = render ? render({ id: 1, word: "I'm not feeling well today.", korean: 'x', level: 0, tag: 'awkward' }, esc, rarity, false) : '';
  const n = render ? render({ id: 2, word: 'apple', korean: '사과', level: 0 }, esc, rarity, false) : '';
  const e = render ? render({ id: 1, word: 'x', korean: 'x', level: 0, tag: 'awkward' }, esc, rarity, true) : '';
  ok('④-2 어색한 표현 카드에 표시', /awk-badge/.test(a) && /원어민 표현/.test(a) && /class="dexc r-seed awk"/.test(a));
  ok('④-3 일반 카드에는 표시 없음(짝)', !/awk-badge/.test(n) && !/ awk"/.test(n));
  ok('④-4 영어 화면은 영어로', /Natural/.test(e) && !/원어민 표현/.test(e));
  ok('④-5 머리글에 개수 줄', /awkN \?/.test(body) && /w\.tag === 'awkward'/.test(body));
  ok('④-6 표시 CSS 가 있다', /\.dexc \.awk-badge\{/.test(H) && /\.dexc\.awk\{/.test(H));
}

console.log('[ ⑥ «원어민 표현만» 모아 보기 — renderDex 를 실제로 돌림 ]');
{
  const m = H.match(/function renderDex\(\)\{([\s\S]*?)\n\}\nasync function delWord/);
  ok('⑥-1 renderDex 를 찾았다', !!m);
  const run = (words, filter, lang = 'ko') => {
    const el = { innerHTML: '' };
    let after = filter;
    try {
      const body = m[1].replace(/_dexFilter = 'all';/, "_dexFilter = 'all'; __set('all');");
      new Function('document', 'window', 'esc', 'rarity', '_dexWords', '_dexFilter', '__set', body)(
        { getElementById: () => el }, { getLang: () => lang }, (x) => String(x),
        () => ({ cls: 'r-seed', tag: '새싹', stars: '🌱' }), words, filter, (v) => { after = v; });
    } catch (e) { return { html: '<err:' + e.message + '>', after }; }
    return { html: el.innerHTML, after };
  };
  const W = [{ id: 1, word: 'apple', level: 0 }, { id: 2, word: "I'm not feeling well today.", level: 0, tag: 'awkward' }, { id: 3, word: 'go', level: 0 }];
  const cards = (h) => (h.match(/class="dexc /g) || []).length;
  const all = run(W, 'all'), only = run(W, 'awkward');
  ok('⑥-2 «전체» 는 카드 3장', cards(all.html) === 3);
  ok('⑥-3 «원어민 표현만» 은 그 카드 1장뿐', cards(only.html) === 1 && /feeling well/.test(only.html) && !/apple/.test(only.html));
  ok('⑥-4 필터 단추와 개수가 보인다(짝: 전체/원어민)', /setDexFilter\('all'\)/.test(all.html) && /setDexFilter\('awkward'\)/.test(all.html) && /원어민 표현만 1/.test(all.html) && /전체 3/.test(all.html));
  ok('⑥-5 누른 쪽이 켜짐 표시', /class="dxf awk on" aria-pressed="true"/.test(only.html) && /class="dxf on" aria-pressed="true"/.test(all.html));
  const none = run([{ id: 1, word: 'apple', level: 0 }], 'awkward');
  ok('⑥-6 원어민 카드가 0장이면 단추 없음 · 전체로 되돌림(빈 화면 금지)', !/dex-filter/.test(none.html) && cards(none.html) === 1 && none.after === 'all');
  ok('⑥-7 영어 화면은 영어 단추', /Natural expressions 1/.test(run(W, 'all', 'en').html));
  ok('⑥-8 필터를 바꿔도 다시 받지 않는다(화면에서만 거름)', /function setDexFilter\(f\)\{[^}]*renderDex\(\);/.test(H) && !/function setDexFilter[^}]*fetch/.test(H));
  ok('⑥-9 필터 CSS', /\.dex-filter \.dxf\.awk\.on\{/.test(H));
}

console.log('[ ⑤ 복습 퀴즈 화면 — 네 문제 모양 모두, 짝 검사 ]');
{
  const fm = H.match(/function awkQuizTag\(w\)\{([\s\S]*?)\n\}/);
  ok('⑤-1 표시 함수를 찾았다', !!fm);
  let raw = null;
  try { raw = new Function('window', 'w', fm[1]); } catch (e) { console.log('   ', e.message); }
  const tag = (w, lang = 'ko') => { try { return raw ? raw({ getLang: () => lang }, w) : '<err>'; } catch (e) { return '<err:' + e.message + '>'; } };
  ok('⑤-2 원어민 표현 카드에 표시', /q-awk/.test(tag({ tag: 'awkward' })) && /원어민 표현/.test(tag({ tag: 'awkward' })));
  ok('⑤-3 일반 카드는 표시 없음(짝)', tag({ word: 'apple' }) === '' && tag(null) === '');
  ok('⑤-3b 영어 화면은 영어로', /Natural expression/.test(tag({ tag: 'awkward' }, 'en')) && !/원어민/.test(tag({ tag: 'awkward' }, 'en')));
  for (const fn of ['renderFlashQ', 'renderChoiceQ', 'renderReverseQ', 'renderSpellQ']) {
    const i = H.indexOf('function ' + fn + '(w)');
    const b = i < 0 ? '' : H.slice(i, H.indexOf('\nfunction ', i + 10));
    ok(`⑤-4 ${fn} 가 표시를 그린다`, /\$\{awkQuizTag\(w\)\}/.test(b));
  }
  ok('⑤-5 표시 CSS', /\.q-awk\{/.test(H));
}

console.log(`\n${fail ? '⚠' : '🎉'} vocab_awkward_tag_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
