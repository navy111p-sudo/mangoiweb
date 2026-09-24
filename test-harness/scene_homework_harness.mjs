// ✍️ scene_homework_harness — 교재 낱말 쓰기 숙제(장면 탐험대 «그림 단어장») 배선 (2026-09-24)
//
// 사장님 「게임보다 교재 연동 쓰기 숙제로 — ① 오늘의 학습 숙제 연결 + 성적표 약한 낱말」.
// ⚠️ 문자열 검사로는 못 잡는 자리라(값도 함수도 다 «있고» 틀린 것은 «무슨 답이 나오는가» 뿐) 전부 실제로 돌립니다.
//   A) 정본 today-plan.ts 를 esbuild 로 번들해 계획에 숙제가 «들어가야 할 때만» 들어가는지 (짝: 중국어·집에서 하는 날은 안 들어감)
//   B) api-students 가 그 숙제를 «했나» 로 세는지 — Promise.all 의 자리와 구조분해 자리가 짝인지
//   C) 성적표 SQL 을 소스에서 오려 내 진짜 SQLite 에 돌려 «이 기간 · 이 게임 · 이 학생» 만 세는지
//   D) 화면(scene-curriculum.js)의 기록 함수를 오려 내 가짜 브라우저로 돌려 «무엇을 보내는가» (짝: 게스트·복습판은 안 보냄)
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const rd = p => readFileSync(join(CF, p), 'utf8');
let PASS = 0, FAIL = 0;
const check = (name, cond, got) => { if (cond) { PASS++; } else { FAIL++; console.log('  ❌ ' + name + (got !== undefined ? '  →  ' + JSON.stringify(got) : '')); } };
function block(src, at) { const open = src.indexOf('{', at); let d = 0; for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(at, i + 1); } return null; }

// ═══ A) 정본 today-plan ═══
let mod = null;
try {
  const out = join(mkdtempSync(join(tmpdir(), 'scene-hw-')), 'tp.mjs');
  execFileSync(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [join(CF, 'src', 'today-plan.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
  mod = await import(pathToFileURL(out).href);
} catch (e) { console.log('  ❌ esbuild 번들 실패 — ' + (e && e.message)); FAIL++; }

if (mod) {
  const { buildTodayPlan, sceneBookId, TOOLS } = mod;
  const manifest = JSON.parse(rd('public/data/scene-curriculum/v1/manifest.json'));
  const ids = new Set(manifest.books.map(b => b.id));
  /* 교재 이름 → 묶음 id. ⛔ 「BTS 1」이 「BTS 12」를 물면 남의 교재다. */
  const cases = [['BTS 1 001 (Welcome to school)', 'bts-01'], ['BTS 12 Korea (Jobs, Going to work)', 'bts-12'], ['BTS 2 Korea (Shapes and colors)', 'bts-02'],
    ['SIU BASIC 3', 'siu-basic-03'], ['SIU ADVANCE 20', 'siu-advance-20'], ['siu basic 008', 'siu-basic-08'],
    ['다락원 중국어 마스터 3', null], ['BTS 99', null], ['', null], [null, null], ['Harry BTS 3', null]];
  for (const [t, want] of cases) check(`sceneBookId(${JSON.stringify(t)}) = ${want}`, sceneBookId(t) === want, sceneBookId(t));
  for (const [, want] of cases) if (want) check(`그 묶음(${want})이 실제로 있다`, ids.has(want));
  check('TOOLS.scene 이 장면 탐험대 화면을 곧바로 연다(?cur=1)', /student-game-scene-quest\.html\?cur=1$/.test(TOOLS.scene && TOOLS.scene.url), TOOLS.scene && TOOLS.scene.url);

  const cls = { band: 3, dow: 4, nowMin: 21 * 60, classes: [{ start: '14:00', minutes: 20, source: 'mangoi' }], weekClassDows: [2, 4], done: {} };
  const find = p => p.steps.find(s => s.key === 'scene');
  const a = buildTodayPlan({ ...cls, textbook: 'BTS 3 Korea (My family)' });
  check('수업일 · 영어 교재 → 쓰기 숙제가 들어간다', !!find(a));
  check('교재 묶음이 있으면 book= 이 붙는다', find(a) && /&book=bts-03$/.test(find(a).url), find(a) && find(a).url);
  check('쓰기 숙제는 «집에서» 칸이다', find(a) && find(a).slot === 'home');
  const b = buildTodayPlan({ ...cls, textbook: null });
  check('교재를 몰라도 들어간다(students_erp.textbook 전원 빈칸 — 2026-09-24 실측)', !!find(b));
  check('교재를 모르면 book= 을 지어내지 않는다', find(b) && !/book=/.test(find(b).url), find(b) && find(b).url);
  const z = buildTodayPlan({ ...cls, textbook: '다락원 중국어 마스터 3', zh: true });
  check('짝: 중국어 교재 학생에게는 안 들어간다', !find(z));
  check('짝: 중국어 학생의 주간표에도 안 들어간다', !z.week.some(d => (d.tools || []).includes('scene')), z.week.map(d => d.tools));
  check('영어 학생의 주간표 수업일에는 들어간다', a.week.some(d => d.isClass && (d.tools || []).includes('scene')));
  const h = buildTodayPlan({ ...cls, classes: [], weekClassDows: [], textbook: 'BTS 3' });
  check('짝: 수업이 없는 날(집에서 하는 날)에는 안 들어간다', !find(h));
  const d = buildTodayPlan({ ...cls, textbook: 'BTS 3', done: { scene: 1 } });
  check('오늘 한 판 했으면 «했음» 으로 표시된다', find(d) && find(d).done === true);
  check('짝: 안 했으면 «안 함»', find(a) && find(a).done === false);
}

// ═══ B) 오늘 했나 — 쿼리 자리와 구조분해 자리가 짝인가 ═══
{
  const src = rd('src/api-students.ts');
  const i = src.indexOf('const [doneWarmup');
  const names = src.slice(i, src.indexOf(']', i)).replace('const [', '').split(',').map(s => s.trim()).filter(Boolean);
  const pa = src.indexOf('await Promise.all([', i);
  const body = src.slice(pa, src.indexOf('env.DB.prepare(', pa));
  const cnts = body.match(/cnt\(`[^`]*`/g) || [];
  const at = names.indexOf('doneScene');
  check('doneScene 이 구조분해에 있다', at >= 0);
  check('그 자리의 쿼리가 scene-words 판을 센다(자리가 어긋나면 남의 도구를 «했음» 으로 센다)', at >= 0 && /game_sessions[^`]*game = 'scene-words'/.test(cnts[at] || ''), cnts[at]);
  check('done 표에 scene: doneScene 이 실린다', /scene:\s*doneScene/.test(src));
}

// ═══ C) 성적표 SQL — 진짜 SQLite ═══
try {
  const { DatabaseSync } = await import('node:sqlite');
  const src = rd('src/api-reports.ts');
  const i = src.indexOf('let sceneWords');
  const seg = block(src, src.indexOf('try {', i));
  const sqls = [...seg.matchAll(/prepare\(\s*`([^`]*)`/g)].map(m => m[1]);
  check('성적표 쓰기 숙제 SQL 두 개를 오려 냈다(전제)', sqls.length === 2, sqls.length);
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE game_sessions (uid TEXT, game TEXT, items INTEGER, correct INTEGER, created_at INTEGER);
           CREATE TABLE game_progress (user_id TEXT, lang TEXT, item TEXT, wrong_count INTEGER, correct_count INTEGER, last_seen INTEGER, game TEXT);`);
  const S = 1000, E = 2000;
  const ins = db.prepare('INSERT INTO game_sessions VALUES (?,?,?,?,?)');
  ins.run('kid', 'scene-words', 10, 7, 1500); ins.run('kid', 'scene-words', 10, 9, 1600);
  ins.run('kid', 'tetris', 10, 1, 1500);        // 다른 게임
  ins.run('kid', 'scene-words', 10, 0, 2500);   // 다른 달
  ins.run('other', 'scene-words', 10, 0, 1500); // 다른 학생
  const gp = db.prepare('INSERT INTO game_progress VALUES (?,?,?,?,?,?,?)');
  gp.run('kid', 'en', 'nice', 3, 1, 1500, 'scene-words');
  gp.run('kid', 'en', 'desk', 1, 1, 1500, 'scene-words');
  gp.run('kid', 'en', 'apple', 0, 2, 1500, 'scene-words');   // 틀린 적 없음
  gp.run('kid', 'en', 'rocket', 5, 0, 1500, 'tetris');       // 다른 게임
  gp.run('kid', 'en', 'old', 4, 0, 500, 'scene-words');      // 이 달에 안 만남
  gp.run('other', 'en', 'zebra', 5, 0, 1500, 'scene-words'); // 다른 학생
  const ss = db.prepare(sqls[0]).get('kid', S, E);
  check('판 수는 이 학생 · 이 게임 · 이 기간만', ss.n === 2 && ss.it === 20 && ss.c === 16, ss);
  const weak = db.prepare(sqls[1]).all('kid', S, E).map(r => r.item);
  check('약한 낱말 = 이 기간에 만났고 틀린 횟수 ≥ 맞힌 횟수 (많이 틀린 순)', JSON.stringify(weak) === JSON.stringify(['nice', 'desk']), weak);
  const none = db.prepare(sqls[0]).get('nobody', S, E);
  check('짝: 한 판도 안 했으면 0 (화면이 카드째 생략)', none.n === 0);
} catch (e) { console.log('  ❌ 성적표 SQL 실행 실패 — ' + (e && e.message)); FAIL++; }
{
  const page = rd('public/monthly-report.html');
  check('성적표 화면이 scene_words 를 그린다', /d\.scene_words/.test(page) && /다시 볼 낱말/.test(page));
  check('쓰기 숙제만 한 달도 «기록 없음» 으로 가리지 않는다(hasData)', /hasData[^;]*scene_words/.test(page));
  check('기록이 없으면 카드를 안 그린다(지어내지 않음)', /if\(sw&&sw\.sessions>0\)/.test(page));
}

// ═══ D) 화면 — 무엇을 보내는가 ═══
{
  const src = rd('public/js/scene-curriculum.js');
  const a = src.indexOf("var BOOK_KEY='mangoi_scene_book';"), b = src.indexOf('async function enter(){', a);
  check('기록 절을 오려 냈다(전제)', a > 0 && b > a);
  const code = src.slice(a, b);
  const run = ({ user, isReview = false, mode = 'words', search = '', stored = '', fetchImpl = null, srv = '' }) => {
    const sent = [];
    const store = { mangoi_uid: user || null, mangoi_scene_book: stored || null, mangoi_scene_book_srv: srv || null, mango_token: 'tk' };
    const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
    const navigator = { sendBeacon: (url, blob) => { sent.push({ url, body: blob._t }); return true; } };
    class Blob { constructor(p) { this._t = p.join(''); } }
    const items = [{ word: 'Nice' }, { word: 'desk' }, { word: 'apple' }], review = [items[1]];
    const els = { series: { value: 'bts' }, book: { value: '' } };
    const $ = id => els[id];
    const manifest = { books: [{ id: 'bts-03', series: 'bts' }, { id: 'siu-basic-02', series: 'siu' }] };
    const location = { search };
    let rebuilt = 0; const bookOptions = () => { rebuilt++; };
    const f = new Function('localStorage', 'navigator', 'Blob', 'items', 'review', 'isReview', 'mode', 'quizStartedAt', '$', 'manifest', 'location', 'bookOptions', 'fetch',
      code + '; return {recordResult:recordResult,restoreBook:restoreBook,keepBook:keepBook,serverBook:serverBook};');
    const api = f(localStorage, navigator, Blob, items, review, isReview, mode, 123, $, manifest, location, bookOptions, fetchImpl || (() => ({ catch() {} })));
    return { api, sent, els, store, rebuilt: () => rebuilt };
  };
  try {
    const r = run({ user: 'kid' }); r.api.recordResult();
    const ses = r.sent.find(x => x.url === '/api/games/session'), prog = r.sent.find(x => x.url === '/api/games/progress');
    const sj = ses && JSON.parse(ses.body), pj = prog && JSON.parse(prog.body);
    check('판 기록: game=scene-words · 3개 중 2개 맞힘', sj && sj.game === 'scene-words' && sj.uid === 'kid' && sj.items === 3 && sj.correct === 2 && sj.wrong === 1, sj);
    check('낱말 기록: 복습 목록에 든 낱말만 «틀림» · 소문자', pj && pj.game === 'scene-words' && JSON.stringify(pj.events.map(e => [e.item, e.correct])) === JSON.stringify([['nice', true], ['desk', false], ['apple', true]]), pj);
    const g = run({ user: 'guest_ab12' }); g.api.recordResult();
    check('짝: 게스트는 안 남긴다', g.sent.length === 0, g.sent.length);
    const n = run({ user: '' }); n.api.recordResult();
    check('짝: 로그인 안 했으면 안 남긴다', n.sent.length === 0);
    const rv = run({ user: 'kid', isReview: true }); rv.api.recordResult();
    check('짝: «어려웠던 표현 다시 도전» 판은 안 남긴다(같은 낱말을 두 번 셈)', rv.sent.length === 0);
    const sm = run({ user: 'kid', mode: 'sentences' }); sm.api.recordResult();
    check('문장 모드는 판만 남기고 낱말 기록은 안 보낸다', sm.sent.length === 1 && sm.sent[0].url === '/api/games/session', sm.sent.map(x => x.url));
    const u = run({ user: 'kid', search: '?cur=1&book=siu-basic-02' }); u.api.restoreBook();
    check('주소의 book= 이 그 교재를 고른다(시리즈까지 바꿔서)', u.els.series.value === 'siu' && u.els.book.value === 'siu-basic-02' && u.rebuilt() === 1, [u.els.series.value, u.els.book.value]);
    const s2 = run({ user: 'kid', stored: 'bts-03' }); s2.api.restoreBook();
    check('주소에 없으면 이 기기가 기억한 교재', s2.els.book.value === 'bts-03');
    const x = run({ user: 'kid', search: '?book=bts-999' }); x.api.restoreBook();
    check('짝: 없는 교재 id 는 무시한다(첫 교재 그대로)', x.els.book.value === '');
    const k = run({ user: 'kid' }); k.els.book.value = 'bts-03'; k.api.keepBook();
    check('고른 교재를 기억한다', k.store.mangoi_scene_book === 'bts-03');
  } catch (e) { console.log('  ❌ 기록 절 실행 실패 — ' + (e && e.message)); FAIL++; }
  /* 👩‍🏫 선생님이 정한 권(?scenebook=1) — «새로 정해졌을 때 한 번만» 학생 선택을 이긴다 */
  try {
    const mk = (resp, calls) => async (url) => { calls.push(url); if (resp instanceof Error) throw resp; return { ok: resp.status ? resp.status < 400 : true, json: async () => resp.body }; };
    let calls = [];
    const n = run({ user: 'kid', stored: 'bts-03', fetchImpl: mk({ body: { ok: true, book: 'siu-basic-02' } }, calls) });
    await n.api.serverBook(); n.api.restoreBook();
    check('새로 정해진 권이 학생의 마지막 선택을 이긴다', n.els.book.value === 'siu-basic-02', n.els.book.value);
    check('그 권을 «마지막으로 받은 권» 으로 적어 둔다', n.store.mangoi_scene_book_srv === 'siu-basic-02');
    check('본인 토큰·아이디로 묻는다', /scenebook=1&uid=kid&token=tk$/.test(calls[0] || ''), calls[0]);
    calls = [];
    const same = run({ user: 'kid', stored: 'bts-03', srv: 'siu-basic-02', fetchImpl: mk({ body: { ok: true, book: 'siu-basic-02' } }, calls) });
    await same.api.serverBook(); same.api.restoreBook();
    check('짝: 이미 받은 권이면 학생이 고른 권 그대로', same.els.book.value === 'bts-03', same.els.book.value);
    calls = [];
    const url = run({ user: 'kid', search: '?book=bts-03', fetchImpl: mk({ body: { ok: true, book: 'siu-basic-02' } }, calls) });
    await url.api.serverBook(); url.api.restoreBook();
    check('주소의 book= 이 있으면 묻지도 않는다', calls.length === 0 && url.els.book.value === 'bts-03', [calls.length, url.els.book.value]);
    calls = [];
    const g = run({ user: 'guest_ab12', stored: 'bts-03', fetchImpl: mk({ body: { ok: true, book: 'siu-basic-02' } }, calls) });
    await g.api.serverBook();
    check('게스트는 묻지 않는다', calls.length === 0);
    for (const [nm, resp] of [['ok:false', { body: { ok: false } }], ['401', { status: 401, body: { ok: false } }], ['통신 실패', new Error('net')], ['book 없음', { body: { ok: true, book: null } }]]) {
      const e = run({ user: 'kid', stored: 'bts-03', fetchImpl: mk(resp, []) });
      await e.api.serverBook(); e.api.restoreBook();
      check('못 물어보면(' + nm + ') 예전 그대로', e.els.book.value === 'bts-03' && !e.store.mangoi_scene_book_srv, [e.els.book.value, e.store.mangoi_scene_book_srv]);
    }
    const ent = block(src, src.indexOf('async function enter(){'));
    check('enter() 가 restoreBook 전에 serverBook 을 기다린다', /await serverBook\(\);[^;]*;restoreBook\(\)/.test(ent || '') || (ent || '').indexOf('await serverBook()') >= 0 && (ent || '').indexOf('await serverBook()') < (ent || '').indexOf('restoreBook()'));
  } catch (e) { console.log('  ❌ 선생님 지정 권 절 실행 실패 — ' + (e && e.message)); FAIL++; }
  const fin = block(src, src.indexOf('function finish(){'));
  check('끝날 때 recordResult 를 실제로 부른다', /recordResult\(\);/.test(fin || ''));
  check('?cur=1 이면 곧바로 그림 단어장을 연다', /get\('cur'\)==='1'\)enter\(\)/.test(src));
  const page = rd('public/student-game-scene-quest.html');
  check('화면이 오늘의 학습 «돌아가기» 알약을 싣는다', /<script[^>]*src="\/js\/today-bar\.js\?v=\d+"/.test(page));
}

// ═══ E) 게임 이름 화이트리스트 ═══
{
  const gi = rd('src/game-insights.ts');
  const list = gi.slice(gi.indexOf('export const KNOWN_GAMES'), gi.indexOf('] as const', gi.indexOf('export const KNOWN_GAMES')));
  check("KNOWN_GAMES 에 'scene-words' — 없으면 'other' 로 섞여 성적표가 0건", /'scene-words'/.test(list));
}

// ═══ F) 숙제 현황·학부모 안내 정본(src/scene-homework.ts) — 실제로 돌린다 ═══
{
  let hw = null;
  try {
    const out = join(mkdtempSync(join(tmpdir(), 'scene-hw2-')), 'sh.mjs');
    execFileSync(join(CF, 'node_modules', 'esbuild', 'bin', 'esbuild'), [join(CF, 'src', 'scene-homework.ts'), '--bundle', '--format=esm', '--platform=neutral', `--outfile=${out}`, '--log-level=error']);
    hw = await import(pathToFileURL(out).href);
  } catch (e) { console.log('  ❌ scene-homework 번들 실패 — ' + (e && e.message)); FAIL++; }
  if (hw) {
    const { clampDays, groupSceneHomework, pickNoticeTargets, dialable, sceneHomeworkNoticeText, buildSceneHomework, sceneHomeworkRouter } = hw;
    check('clampDays: 모르는 값은 30 · 상한 90 · 하한 1', clampDays('x') === 30 && clampDays(500) === 90 && clampDays(7) === 7 && clampDays(0) === 30);
    const g = groupSceneHomework(
      [{ uid: 'a', n: 2, it: 20, c: 15, last_at: 100 }, { uid: 'b', n: 1, it: 0, c: 0, last_at: 300 }],
      [{ user_id: 'a', item: 'w1' }, { user_id: 'a', item: 'w2' }, { user_id: 'a', item: 'w3' }, { user_id: 'a', item: 'w4' }, { user_id: 'a', item: 'w5' }, { user_id: 'a', item: 'w6' }, { user_id: 'a', item: 'w1' }],
      { a: '김하나' });
    check('최근에 한 학생이 위', g[0].uid === 'b');
    const A = g.find(r => r.uid === 'a');
    check('정답률 = 맞힌 수 / 문제 수', A.rate === 75, A.rate);
    check('짝: 문제가 0 이면 정답률은 «모름»(0% 가 아니다)', g.find(r => r.uid === 'b').rate === null);
    check('다시 볼 낱말은 학생당 5개 · 중복 없음', A.weak.length === 5 && new Set(A.weak).size === 5, A.weak);
    check('이름을 붙인다(없으면 빈 값)', A.name === '김하나' && g.find(r => r.uid === 'b').name === '');
    check('dialable: 10자리 미만은 못 보낸다', dialable('010-1234-5678') === '01012345678' && dialable('12345') === '' && dialable(null) === '');
    const pk = pickNoticeTargets([{ uid: 'a', name: 'A', parent: '010-1111-2222' }, { uid: 'b', name: 'B', parent: '01011112222' }, { uid: 'c', name: 'C', parent: '' }, { uid: 'd', name: 'D', parent: '01033334444' }], new Set(['d']));
    check('같은 번호는 한 번만', pk.targets.length === 1 && pk.targets[0].uid === 'a', pk.targets);
    check('이미 보낸 학생은 빼고 센다', pk.already === 1);
    check('번호 없는 학생은 따로 센다', pk.noPhone === 1);
    const txt = sceneHomeworkNoticeText('김하나');
    check('안내 문구에 이름과 정본 링크', txt.indexOf('김하나 학생') >= 0 && txt.indexOf('https://mangoi.ai/today.html') >= 0, txt);
    check('짝: 이름이 없으면 «자녀» 로(지어내지 않는다)', sceneHomeworkNoticeText('').indexOf('자녀') >= 0);

    /* 진짜 SQLite 로 buildSceneHomework — 이 게임·이 기간·(uid 가 오면) 이 학생만 */
    let sqlite = null; try { sqlite = await import('node:sqlite'); } catch {}
    if (sqlite) {
      const db = new sqlite.DatabaseSync(':memory:');
      db.exec(`CREATE TABLE game_sessions (uid TEXT, game TEXT, created_at INTEGER, items INTEGER, correct INTEGER);
               CREATE TABLE game_progress (user_id TEXT, lang TEXT, game TEXT, item TEXT, wrong_count INTEGER, correct_count INTEGER, last_seen INTEGER);
               CREATE TABLE students_erp (user_id TEXT, korean_name TEXT, student_name TEXT);`);
      const now = Date.now(), old = now - 40 * 86400000;
      const ins = db.prepare('INSERT INTO game_sessions VALUES (?,?,?,?,?)');
      ins.run('kim', 'scene-words', now - 1000, 10, 8); ins.run('kim', 'scene-words', now - 2000, 10, 6);
      ins.run('kim', 'escape-school', now, 10, 10); ins.run('lee', 'scene-words', old, 10, 1); ins.run('park', 'scene-words', now - 500, 5, 5);
      const gp = db.prepare('INSERT INTO game_progress VALUES (?,?,?,?,?,?,?)');
      gp.run('kim', 'en', 'scene-words', 'nice', 3, 1, now); gp.run('kim', 'en', 'scene-words', 'apple', 0, 3, now); gp.run('kim', 'en', 'other', 'cat', 5, 0, now);
      gp.run('kim', 'en', 'scene-words', 'old', 4, 0, old);
      db.prepare('INSERT INTO students_erp VALUES (?,?,?)').run('kim', '김하나', null);
      const env = { DB: { prepare(sql) { const st = db.prepare(sql); let args = []; const o = { bind(...a) { args = a; return o; }, all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) ?? null, run: async () => st.run(...args) }; return o; } } };
      const r = await buildSceneHomework(env, 30);
      const K = r.rows.find(x => x.uid === 'kim');
      check('이 게임만 센다(다른 게임 판은 안 섞인다)', K && K.sessions === 2 && K.items === 20 && K.correct === 14, K);
      check('짝: 기간 밖 판은 안 센다', !r.rows.find(x => x.uid === 'lee'));
      check('다시 볼 낱말 = 이 게임 · 이 기간 · 틀림 ≥ 맞음', K && JSON.stringify(K.weak) === '["nice"]', K && K.weak);
      check('이름을 명부에서 붙인다', K && K.name === '김하나');
      const one = await buildSceneHomework(env, 30, 'park');
      check('uid 를 주면 그 학생만', one.rows.length === 1 && one.rows[0].uid === 'park', one.rows.map(x => x.uid));
      const none = await buildSceneHomework(env, 30, 'nobody');
      check('짝: 안 한 학생은 빈 목록(0 행을 지어내지 않는다)', none.rows.length === 0);
    } else console.log('  ⏭  node:sqlite 없음 — buildSceneHomework SQL 절 건너뜀');

    /* 라우터 — 조회는 GET 만, 안내는 로그인 없이 못 보낸다 */
    const req = (m, body) => new Request('https://x/api/admin/reports/scene-homework', { method: m, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const envNo = { DB: { prepare() { throw new Error('DB 를 건드리면 안 된다'); } } };
    const r1 = await sceneHomeworkRouter(envNo, req('POST'), new URL('https://x/api/admin/reports/scene-homework'), 'scene-homework');
    check('조회 경로는 GET 만(405)', r1 && r1.status === 405);
    let r2 = null; try { r2 = await sceneHomeworkRouter(envNo, req('POST', { dry_run: false, confirm: true }), new URL('https://x/'), 'scene-homework-notify'); } catch (e) { r2 = { status: 'throw:' + e.message }; }
    check('로그인 없으면 안내 문자 경로는 401 (DB·발송 전에 막는다)', r2 && r2.status === 401, r2 && r2.status);
    const r3 = await sceneHomeworkRouter(envNo, req('GET'), new URL('https://x/'), 'monthly');
    check('모르는 경로는 null(다른 리포트로 넘긴다)', r3 === null);
  }
  const shSrc = rd('src/scene-homework.ts');
  const sendExpr = (shSrc.match(/const send = ([^;]+);/) || [])[1] || '';
  check('보내기 판정식을 찾았다', !!sendExpr);
  if (sendExpr) {
    const f = new Function('b', 'return ' + sendExpr + ';');
    check('기본은 보내지 않는다(빈 본문)', f({}) === false);
    check('짝: dry_run:false 만으로는 안 보낸다', f({ dry_run: false }) === false);
    check('짝: confirm:true 만으로는 안 보낸다', f({ confirm: true }) === false);
    check('둘 다 명시해야 보낸다', f({ dry_run: false, confirm: true }) === true);
    check("confirm 이 문자열 'true' 면 안 보낸다(정확히 true 만)", f({ dry_run: false, confirm: 'true' }) === false);
  }
  /* 🔐 강사·조직 계정 가드 — 세션을 흉내 낼 수 없어 «그 조건식» 을 오려 내 실제로 평가한다(짝: 본사는 통과) */
  const gm = shSrc.match(/if \(([^\n]*isTeacher[^\n]*)\) return jres\(\{ ok: false, error: 'forbidden_scope' \}/);
  check('강사·조직 가드를 찾았다', !!gm);
  if (gm) {
    const g = new Function('actor', 'isOrgScopedRole', 'return (' + gm[1] + ');');
    const org = r => ['franchise', 'branch', 'agency'].includes(r);
    check('강사는 막는다', g({ isTeacher: true, role: 'teacher' }, org) === true);
    check('지사·대리점은 막는다', g({ isTeacher: false, role: 'branch' }, org) === true && g({ isTeacher: false, role: 'agency' }, org) === true);
    check('짝: 본사는 통과', g({ isTeacher: false, role: 'hq' }, org) === false);
    check('가드가 발송 기록 표·조회보다 앞', shSrc.indexOf(gm[0]) < shSrc.indexOf('CREATE TABLE IF NOT EXISTS scene_homework_notice_log'));
  }
  const ar = rd('src/accounting-reports.ts');
  check('reportsRouter 가 숙제 경로를 부른다', /p === 'scene-homework'[\s\S]{0,120}sceneHomeworkRouter\(/.test(ar));
}

// ═══ G) 서버 «선생님이 정한 권» 갈래 · 학생 상세 지정 칸 ═══
{
  const st = rd('src/api-students.ts');
  const gate = st.indexOf("if (scope !== 'self' && scope !== 'admin')", st.indexOf("path === '/api/student/today'"));
  const br = st.indexOf("get('scenebook')");
  check('scenebook 갈래는 본인·관리자 게이트 «뒤»', gate > 0 && br > gate, [gate, br]);
  check('판정은 정본 sceneBookId 를 부른다', /scenebook[\s\S]{0,700}sceneBookId\(/.test(st));
  const sh = rd('public/admin/student.html');
  const sw = block(sh, sh.indexOf('function sqWire(){')) || '';
  check('학생 상세가 «이 학생만» 으로 지정한다(user_ids · only_empty:false)', /user_ids:\s*\[uid\]/.test(sw) && /only_empty:\s*false/.test(sw));
  check('권 목록은 장면 탐험대 목차에서 읽는다(손으로 안 적음)', /scene-curriculum\/v1\/manifest\.json/.test(sw));
  check('«지정됐다» 는 서버가 실제로 바꿨을 때만(updated > 0)', /Number\(j\.updated\) > 0/.test(sw));
  check('이 학생의 숙제 현황을 정본 경로로 부른다', /reports\/scene-homework\?days=30&uid=/.test(sw));
  const rt = block(sh, sh.indexOf('function renderTextbook(){')) || '';
  check('교재 탭이 비어 있어도 지정 칸을 그린다', (rt.match(/sqBlockHtml\(\)/g) || []).length === 2 && (rt.match(/sqWire\(\)/g) || []).length === 2);
  const page = rd('public/admin/scene-homework.html');
  check('현황 화면: 보내기 전에 확인창', /window\.confirm\(/.test(page) && /dry_run:false,confirm:true/.test(page));
  check('현황 화면: 기본 버튼은 «대상 확인»(dry_run)', /\{dry_run:true\}/.test(page));
  const ia6 = rd('public/js/adm-ia6.js');
  check('사이드바 항목 + 강사·조직 계정에게 감춤(서버 차단과 짝)', /href: '\/admin\/scene-homework\.html',\s*hideFrom: \['teacher', 'franchise', 'branch', 'agency'\]/.test(ia6));
}

console.log(`✍️ scene_homework_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
