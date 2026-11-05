import { fileURLToPath } from 'node:url';
// 🪙 교재 낱말 쓰기 숙제 포인트 — 서버 판정·라우트 배선·결과 칸 문구·호출 배선 (2026-11-03)
//   정본 src/scene-words-points.ts 를 타입만 벗겨 «실제로» 돌리고, 화면 js 를 가짜 DOM·fetch 로 실제로 돌린다.
//   변이시험: SW_SRC=<ts> · SWJS_SRC=<js/scene-words-points.js> · SWAPI_SRC=<api-points.ts> · SWCUR_SRC=<scene-curriculum.js> · SWHTML_SRC=<html>
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R = (env, p) => readFileSync(process.env[env] || ROOT + p, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

const ts = R('SW_SRC', 'cloudflare-deploy/src/scene-words-points.ts');
let M = null;
try { M = new Function(stripTypeScriptTypes(ts).replace(/^export /gm, '') + '\nreturn {SCENE_WORDS_POINT_RULE,SCENE_WORDS_POINT_AMOUNT,SCENE_WORDS_POINT_DAILY_CAP,sceneWordsPointGate};')(); }
catch (e) { console.log('  (정본 실행 실패: ' + e.message + ')'); }
ok(!!M, '전제: 정본을 실제로 돌렸다');

console.log('\n① 판정 정본');
const g = m => { try { return M.sceneWordsPointGate(m); } catch (e) { return { ok: 'crash' }; } };
if (M) {
  ok(M.SCENE_WORDS_POINT_RULE === 'scene_words_done' && M.SCENE_WORDS_POINT_AMOUNT === 5 && M.SCENE_WORDS_POINT_DAILY_CAP === 1, '규칙 scene_words_done · 5P · 하루 1번(사장님 승인 값)');
  ok(g({ correct: 7, items: 10, book: 'bts-05' }).ok === true, '7/10 이면 준다');
  ok(g({ correct: 1, items: 1 }).ok === true, '짝: 경계 — 1/1 이면 준다');
  ok(g({ correct: 0, items: 10 }).error === 'no_correct', '0개면 안 준다(no_correct)');
  ok(g({ correct: 11, items: 10 }).error === 'bad_result', '정답 > 문항이면 안 준다');
  ok(g({ correct: 2.5, items: 10 }).error === 'bad_result', '소수면 안 준다');
  ok(g({ correct: -1, items: 10 }).error === 'bad_result', '음수면 안 준다');
  ok(g({ correct: 1, items: 0 }).error === 'bad_result', '문항 0 이면 안 준다');
  ok(g({ correct: 1, items: 101 }).error === 'bad_result', '문항이 터무니없으면 안 준다');
  ok(g({}).error === 'bad_result' && g(null).error === 'bad_result' && g({ correct: '3', items: 'x' }).error === 'bad_result', '값이 없거나 깨졌으면 안 준다(던지지 않음)');
  ok(g({ correct: 1, items: 2, book: 'x'.repeat(500) }).book.length === 80, '교재 id 는 80자로 자른다');
}

console.log('\n② 라우트 배선(api-points.ts) · 오늘의 학습 카드');
const api = R('SWAPI_SRC', 'cloudflare-deploy/src/api-points.ts');
const live = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const i0 = live.indexOf("path === '/api/points/earn-by-rule'");
const iBlk = live.indexOf('if (ruleCode === SCENE_WORDS_POINT_RULE)', i0);
const iRule = live.indexOf('SELECT * FROM point_rules WHERE code=? AND enabled=1', i0);
const iCap = live.indexOf('checkEarnAllowed(', i0);
ok(i0 > 0 && iBlk > i0, '전제: earn-by-rule 안에 숙제 갈래가 있다');
ok(iBlk > 0 && iBlk < iRule && iRule < iCap, '갈래는 규칙 조회·하루 전체 상한 «앞» 이다');
const blk = iBlk > 0 ? live.slice(iBlk, live.indexOf('\n      }\n', iBlk) + 8) : '';
ok(/sceneWordsPointGate\(\s*body\.meta\s*\)/.test(blk), '정본 판정을 body.meta 로 실제로 부른다');
ok(/if\s*\(\s*!\s*g\.ok\s*\)\s*return\s+json\(/.test(blk), '판정이 거절하면 적립 전에 돌아간다');
ok(/body\.meta\s*=\s*\{\s*book:\s*g\.book,\s*correct:\s*g\.correct,\s*items:\s*g\.items\s*\}/.test(blk), 'meta 는 판정이 다듬은 값만 남긴다');
ok(/SCENE_WORDS_POINT_AMOUNT/.test(blk), '금액은 정본 상수로 시드한다');
const tp = R('SWTP_SRC', 'cloudflare-deploy/src/today-points.ts');
let toolFor = null;
try { toolFor = new Function(stripTypeScriptTypes(tp).replace(/^export /gm, '') + '\nreturn toolForRule;')(); } catch (e) {}
ok(toolFor && toolFor('scene_words_done', null) === 'scene', '오늘의 A.i 학습 카드: scene_words_done → «교재 낱말 쓰기 숙제»');

console.log('\n③ 화면(js/scene-words-points.js) — 가짜 DOM·fetch 로 실제 실행');
const jsSrc = R('SWJS_SRC', 'cloudflare-deploy/public/js/scene-words-points.js');
function world(o) {
  const els = {}, calls = [];
  const host = { id: 'cq-result', children: [], appendChild(n) { n.parentNode = host; els[n.id] = n; host.children.push(n); } };
  els['cq-result'] = host;
  const store = Object.assign({}, o.ls || {});
  const win = {};
  const doc = { documentElement: { lang: o.lang || 'ko' }, getElementById: id => els[id] || null, createElement: () => ({ id: '', style: {}, textContent: '', setAttribute() {}, parentNode: null }) };
  const fetchFn = (u, init) => { calls.push({ u, body: JSON.parse(init.body) }); return o.fetchFail ? Promise.reject(new Error('x')) : Promise.resolve({ json: () => Promise.resolve(o.resp) }); };
  try { new Function('window', 'document', 'localStorage', 'fetch', jsSrc)(win, doc, { getItem: k => (k in store ? store[k] : null) }, fetchFn); }
  catch (e) { return { err: e.message, calls, els }; }
  return { win, calls, els, host, text: () => (els.cqPts ? els.cqPts.textContent : '') };
}
const tick = () => new Promise(r => setTimeout(r, 5));
const LOGGED = { mangoi_logged_user: JSON.stringify({ uid: 'kim', name: '김' }), mango_token: 't1' };
async function scenario(o, r) { const w = world(o); if (w.err) return { w, t: 'ERR ' + w.err }; try { w.win.__mgSceneWordsPts.run(r); } catch (e) { return { w, t: 'CRASH ' + e.message }; } await tick(); return { w, t: w.text() }; }
{
  let s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5, newBalance: 88, rule: { amount: 5 } } }, { correct: 8, items: 10, book: 'bts-05' });
  ok(/\+5P/.test(s.t) && /88P/.test(s.t), '받으면 «+5P · 내 포인트 88P» (서버 값 그대로): ' + s.t);
  ok(s.w.calls.length === 1 && s.w.calls[0].body.rule_code === 'scene_words_done' && s.w.calls[0].body.user_id === 'kim' && s.w.calls[0].body.meta.correct === 8 && s.w.calls[0].body.meta.items === 10, '서버에 scene_words_done · 계정 · 정답/문항 수를 보낸다');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 2 } }, { correct: 1, items: 2 });
  ok(/\+2P/.test(s.t) && !/\+5P/.test(s.t), '실제로 더한 값(signed)을 그린다 — 지어내지 않음');
  s = await scenario({ ls: { mangoi_uid: 'park' }, resp: { ok: true, signed: 5 } }, { correct: 1, items: 2 });
  ok(s.w.calls.length === 1 && s.w.calls[0].body.user_id === 'park', 'mangoi_uid 로 로그인한 학생도 계정으로 붙는다(scene-curriculum 과 같은 순서)');
  s = await scenario({ ls: { mangoi_logged_user: JSON.stringify({ user_id: 'lee' }) }, resp: { ok: true, signed: 5 } }, { correct: 1, items: 2 });
  ok(s.w.calls.length === 1 && s.w.calls[0].body.user_id === 'lee', '로그인 모양이 user_id 여도 계정으로 붙는다');
  s = await scenario({ ls: {} }, { correct: 3, items: 5 });
  ok(s.w.calls.length === 0 && /로그인/.test(s.t), '비로그인은 서버에 안 묻고 로그인 안내');
  s = await scenario({ ls: { mangoi_uid: 'guest_x1' } }, { correct: 3, items: 5 });
  ok(s.w.calls.length === 0 && /로그인/.test(s.t), '게스트 계정도 로그인 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5 } }, { review: true, correct: 3, items: 3 });
  ok(s.w.calls.length === 0 && /다시 도전/.test(s.t), '«다시 도전» 판은 묻지 않고 «포인트 없음» 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5 } }, { correct: 0, items: 10 });
  ok(s.w.calls.length === 0 && /1개 이상/.test(s.t), '0개 맞히면 묻지 않고 «1개 이상» 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: false, error: 'daily_cap_reached' } }, { correct: 2, items: 3 });
  ok(/이미 받았어요/.test(s.t) && !/\+\d+P/.test(s.t), '하루 1번 다 쓰면 «이미 받았어요»');
  s = await scenario({ ls: LOGGED, resp: { ok: false, error: 'daily_total_cap_reached' } }, { correct: 2, items: 3 });
  ok(/다 채웠어요/.test(s.t), '하루 전체 상한이면 «다 채웠어요»');
  s = await scenario({ ls: LOGGED, fetchFail: true }, { correct: 2, items: 3 });
  ok(/확인하지 못했어요/.test(s.t) && !/\+\d+P/.test(s.t), '통신 실패면 금액 없이 «확인하지 못했어요»');
  s = await scenario({ ls: LOGGED, lang: 'en', resp: { ok: true, signed: 5, newBalance: 10 } }, { correct: 2, items: 3 });
  ok(/You earned \+5P/.test(s.t), 'EN 화면은 영어로');
  { const w = world({ ls: LOGGED, resp: { ok: true, signed: 5 } }); w.win.__mgSceneWordsPts.run({ correct: 2, items: 3 }); await tick(); w.win.__mgSceneWordsPts.run({ correct: 2, items: 3 }); await tick();
    ok(w.calls.length === 1 && /\+5P/.test(w.text()), '또 끝내도 다시 묻지 않고 받은 결과를 보여 준다'); }
}

console.log('\n④ 호출 배선(scene-curriculum.js · html)');
const cur = R('SWCUR_SRC', 'cloudflare-deploy/public/js/scene-curriculum.js');
const fi = cur.indexOf('function finish(){'); const fe = cur.indexOf('\n', fi);
const fin = fi > 0 ? cur.slice(fi, fe).replace(/\/\*[\s\S]*?\*\//g, '') : '';
ok(fi > 0 && /__mgSceneWordsPts\.run\(\{review:isReview,items:items\.length,correct:items\.filter\(function\(it\)\{return review\.indexOf\(it\)<0;\}\)\.length/.test(fin), 'finish 가 review·문항·정답 수(recordResult 와 같은 계산)를 넘겨 부른다');
ok(fin.indexOf('__mgSceneWordsPts') > fin.indexOf("$('result').replaceChildren()"), '결과 칸을 다시 그린 «뒤» 에 부른다(안 그러면 지워짐)');
ok(/if\(root\.__mgSceneWordsPts\)root\.__mgSceneWordsPts\.run\(/.test(fin) && !/if\s*\(\s*(false|0|!0|null)\s*[)&|]/.test(fin), '그 호출은 «파일이 실렸는가» 만 묻는다(죽은 조건 없음)');
const html = R('SWHTML_SRC', 'cloudflare-deploy/public/student-game-scene-quest.html').replace(/<!--[\s\S]*?-->/g, '');
ok(/<script src="\/js\/scene-words-points\.js\?v=\d+" defer><\/script>/.test(html), '화면이 js/scene-words-points.js 를 싣는다(주석 밖)');
ok(html.indexOf('scene-words-points.js') < html.indexOf('scene-curriculum.js'), '포인트 파일이 scene-curriculum.js 보다 먼저 실린다');

console.log(`\nscene_words_points_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
