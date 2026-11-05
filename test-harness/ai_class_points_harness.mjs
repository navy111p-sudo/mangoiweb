import { fileURLToPath } from 'node:url';
// 🪙 A.i 선생님 수업 포인트 — 서버 판정·라우트 배선·끝 창 문구·호출 배선 (2026-11-03)
//   정본 src/ai-class-points.ts 를 타입만 벗겨 «실제로» 돌리고, 화면 js 를 가짜 DOM·fetch 로 실제로 돌린다.
//   변이시험: AP_SRC=<고친 ts> · APJS_SRC=<고친 js> · APAPI_SRC=<고친 api-points.ts> · APHTML_SRC=<고친 ai-class.html>
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R = (env, p) => readFileSync(process.env[env] || ROOT + p, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ FAIL ' + m); } };

const ts = R('AP_SRC', 'cloudflare-deploy/src/ai-class-points.ts');
let M = null;
try { M = new Function(stripTypeScriptTypes(ts).replace(/^export /gm, '') + '\nreturn {AI_CLASS_POINT_RULE,AI_CLASS_POINT_AMOUNT,AI_CLASS_POINT_DAILY_CAP,aiClassPointGate};')(); }
catch (e) { console.log('  (정본 실행 실패: ' + e.message + ')'); }
ok(!!M, '전제: 정본을 실제로 돌렸다');

console.log('\n① 판정 정본');
const g = m => { try { return M.aiClassPointGate(m); } catch (e) { return { ok: 'crash' }; } };
if (M) {
  ok(M.AI_CLASS_POINT_RULE === 'ai_class_done' && M.AI_CLASS_POINT_AMOUNT === 5 && M.AI_CLASS_POINT_DAILY_CAP === 1, '규칙 ai_class_done · 5P · 하루 1번(사장님 승인 값)');
  ok(g({ stars: 3, targets: 10, lesson: 'BTS 1' }).ok === true, '별 3/10 이면 준다');
  ok(g({ stars: 1, targets: 1 }).ok === true, '짝: 경계 — 별 1/1 이면 준다');
  ok(g({ stars: 0, targets: 10 }).error === 'no_stars', '별 0 이면 안 준다(no_stars)');
  ok(g({ stars: 11, targets: 10 }).error === 'bad_result', '별 > 문항이면 안 준다');
  ok(g({ stars: 2.5, targets: 10 }).error === 'bad_result', '소수면 안 준다');
  ok(g({ stars: -1, targets: 10 }).error === 'bad_result', '음수면 안 준다');
  ok(g({ stars: 1, targets: 0 }).error === 'bad_result', '문항 0 이면 안 준다');
  ok(g({ stars: 1, targets: 301 }).error === 'bad_result', '문항이 터무니없으면 안 준다');
  ok(g({}).error === 'bad_result' && g(null).error === 'bad_result' && g({ stars: '3', targets: 'x' }).error === 'bad_result', '값이 없거나 깨졌으면 안 준다(던지지 않음)');
  ok(g({ stars: 1, targets: 2, lesson: 'x'.repeat(500) }).lesson.length === 120, '레슨 이름은 120자로 자른다');
}

console.log('\n② 라우트 배선(api-points.ts)');
const api = R('APAPI_SRC', 'cloudflare-deploy/src/api-points.ts');
const live = api.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const i0 = live.indexOf("path === '/api/points/earn-by-rule'");
const iBlk = live.indexOf('if (ruleCode === AI_CLASS_POINT_RULE)', i0);
const iRule = live.indexOf('SELECT * FROM point_rules WHERE code=? AND enabled=1', i0);
const iCap = live.indexOf('checkEarnAllowed(', i0);
ok(i0 > 0 && iBlk > i0, '전제: earn-by-rule 안에 A.i 수업 갈래가 있다');
ok(iBlk > 0 && iBlk < iRule && iRule < iCap, '갈래는 규칙 조회·하루 전체 상한 «앞» 이다(상한을 건너뛰지 않음)');
const blk = iBlk > 0 ? live.slice(iBlk, iRule) : '';
ok(/aiClassPointGate\(\s*body\.meta\s*\)/.test(blk), '정본 판정을 body.meta 로 실제로 부른다');
ok(/if\s*\(\s*!\s*g\.ok\s*\)\s*return\s+json\(/.test(blk), '판정이 거절하면 적립 전에 돌아간다');
ok(/body\.meta\s*=\s*\{\s*lesson:\s*g\.lesson,\s*stars:\s*g\.stars,\s*targets:\s*g\.targets\s*\}/.test(blk), 'meta 는 판정이 다듬은 값만 남긴다');
ok(/AI_CLASS_POINT_AMOUNT/.test(blk) && !/VALUES\s*\(\?,'A\.i 선생님 수업 완주',\s*5\b/.test(blk), '금액은 정본 상수로 시드한다(숫자 복제 없음)');

console.log('\n③ 화면(js/ai-class-points.js) — 가짜 DOM·fetch 로 실제 실행');
const jsSrc = R('APJS_SRC', 'cloudflare-deploy/public/js/ai-class-points.js');
function world(o) {
  const els = {}, calls = [];
  const mk = id => ({ id, style: {}, textContent: '', setAttribute() {}, parentNode: null });
  const stars = mk('endStars'); stars.parentNode = { insertBefore(n) { els[n.id] = n; } }; els.endStars = stars;
  const store = Object.assign({}, o.ls || {});
  const win = { getLang: () => o.lang || 'ko' };
  const doc = { getElementById: id => els[id] || null, createElement: () => mk('') };
  const fetchFn = (u, init) => { calls.push({ u, body: JSON.parse(init.body) }); return o.fetchFail ? Promise.reject(new Error('x')) : Promise.resolve({ json: () => Promise.resolve(o.resp) }); };
  try {
    new Function('window', 'document', 'localStorage', 'fetch', jsSrc)(win, doc, { getItem: k => (k in store ? store[k] : null) }, fetchFn);
  } catch (e) { return { err: e.message, calls, els }; }
  return { win, calls, els, text: () => (els.endPts ? els.endPts.textContent : '') };
}
const tick = () => new Promise(r => setTimeout(r, 5));
const LOGGED = { mangoi_logged_user: JSON.stringify({ uid: 'kim', name: '김' }), mango_token: 't1' };
async function scenario(o, r) { const w = world(o); if (w.err) return { w, t: 'ERR ' + w.err }; try { w.win.__mgAiClassPts.run(r); } catch (e) { return { w, t: 'CRASH ' + e.message }; } await tick(); return { w, t: w.text() }; }

{
  let s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5, newBalance: 125, rule: { amount: 5 } } }, { stars: 4, targets: 9, lesson: 'BTS 1' });
  ok(/\+5P/.test(s.t) && /125P/.test(s.t), '받으면 «+5P · 내 포인트 125P» (서버 값 그대로): ' + s.t);
  ok(s.w.calls.length === 1 && s.w.calls[0].body.rule_code === 'ai_class_done' && s.w.calls[0].body.user_id === 'kim' && s.w.calls[0].body.meta.stars === 4, '서버에 ai_class_done · 계정 · 별 수를 보낸다');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 3, rule: { amount: 5 } } }, { stars: 1, targets: 2 });
  ok(/\+3P/.test(s.t) && !/\+5P/.test(s.t), '실제로 더한 값(signed)을 그린다 — 지어내지 않음');
  s = await scenario({ ls: { mangoi_logged_user: JSON.stringify({ user_id: 'lee' }) }, resp: { ok: true, signed: 5 } }, { stars: 1, targets: 2 });
  ok(s.w.calls.length === 1 && s.w.calls[0].body.user_id === 'lee', '로그인 모양이 user_id 여도 계정으로 붙는다');
  s = await scenario({ ls: {}, resp: { ok: true, signed: 5 } }, { stars: 3, targets: 5 });
  ok(s.w.calls.length === 0 && /로그인/.test(s.t), '비로그인은 서버에 안 묻고 로그인 안내');
  s = await scenario({ ls: { mangoi_logged_user: JSON.stringify({ uid: 'guest_ab12' }) } }, { stars: 3, targets: 5 });
  ok(s.w.calls.length === 0 && /로그인/.test(s.t), '게스트 계정도 로그인 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5 } }, { early: true, stars: 3, targets: 9 });
  ok(s.w.calls.length === 0 && /끝까지/.test(s.t), '«끝내기» 로 중간에 멈추면 묻지 않고 «끝까지 마치면» 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: true, signed: 5 } }, { stars: 0, targets: 9 });
  ok(s.w.calls.length === 0 && /별/.test(s.t), '별 0 이면 묻지 않고 «별 1개 이상» 안내');
  s = await scenario({ ls: LOGGED, resp: { ok: false, error: 'daily_cap_reached' } }, { stars: 2, targets: 3 });
  ok(/이미 받았어요/.test(s.t) && !/\+\d+P/.test(s.t), '하루 1번 다 쓰면 «이미 받았어요»');
  s = await scenario({ ls: LOGGED, resp: { ok: false, error: 'daily_total_cap_reached' } }, { stars: 2, targets: 3 });
  ok(/다 채웠어요/.test(s.t), '하루 전체 상한이면 «다 채웠어요»');
  s = await scenario({ ls: LOGGED, fetchFail: true }, { stars: 2, targets: 3 });
  ok(/확인하지 못했어요/.test(s.t) && !/\+\d+P/.test(s.t), '통신 실패면 금액 없이 «확인하지 못했어요»');
  s = await scenario({ ls: LOGGED, lang: 'en', resp: { ok: true, signed: 5, newBalance: 10 } }, { stars: 2, targets: 3 });
  ok(/You earned \+5P/.test(s.t), 'EN 화면은 영어로');
  { const w = world({ ls: LOGGED, resp: { ok: true, signed: 5 } }); w.win.__mgAiClassPts.run({ stars: 2, targets: 3 }); await tick(); w.win.__mgAiClassPts.run({ stars: 2, targets: 3 }); await tick();
    ok(w.calls.length === 1 && /\+5P/.test(w.text()), '«다시 하기» 로 또 끝내도 다시 묻지 않고 받은 결과를 보여 준다'); }
}

console.log('\n④ 호출 배선(ai-class.html)');
const html = R('APHTML_SRC', 'cloudflare-deploy/public/ai-class.html');
const htmlLive = html.replace(/<!--[\s\S]*?-->/g, '');
ok(/<script src="\/js\/ai-class-points\.js\?v=\d+" defer><\/script>/.test(htmlLive), '화면이 js/ai-class-points.js 를 싣는다(주석 밖)');
const se = html.indexOf('function showEnd(e){'); const seEnd = html.indexOf('\n  }', se);
const body = se > 0 ? html.slice(se, seEnd).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '') : '';
ok(se > 0 && /__mgAiClassPts\.run\(\{\s*early:\s*!!e\.early,\s*stars:\s*e\.stars,\s*targets:\s*e\.targets/.test(body), 'showEnd 가 별·문항·early 를 넘겨 실제로 부른다');
ok(/window\.__mgAiClassPts\s*&&\s*window\.__mgAiClassPts\.run\(/.test(body) && !/(if\s*\(\s*(false|0|null)\s*[)&|])|((false|0)\s*&&\s*window\.__mgAiClassPts)/.test(body), '그 호출은 «파일이 실렸는가» 만 묻는다(죽은 조건 없음)');
const eb = html.indexOf("$('endBtn').addEventListener('click'"); const ebBlk = eb > 0 ? html.slice(eb, html.indexOf('});', eb)) : '';
ok(/showEnd\(\{[^}]*early:\s*true/.test(ebBlk), '«🚪 끝내기» 버튼은 early:true 로 연다(중간 종료에 포인트 없음)');
const ce = html.indexOf('if (o.end) showEnd(o.end);');
ok(ce > 0, '짝: 수업이 끝까지 가서 여는 끝 창(o.end)은 early 없이 연다');

console.log(`\nai_class_points_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
