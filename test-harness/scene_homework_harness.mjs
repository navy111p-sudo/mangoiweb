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
  const run = ({ user, isReview = false, mode = 'words', search = '', stored = '' }) => {
    const sent = [];
    const store = { mangoi_uid: user || null, mangoi_scene_book: stored || null };
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
      code + '; return {recordResult:recordResult,restoreBook:restoreBook,keepBook:keepBook};');
    const api = f(localStorage, navigator, Blob, items, review, isReview, mode, 123, $, manifest, location, bookOptions, () => ({ catch() {} }));
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

console.log(`✍️ scene_homework_harness — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
