// ai_login_gate_harness — A.i 콘텐츠 로그인 안내 (2026-11-05)
//   js/ai-login-gate.js 를 가짜 DOM·가짜 localStorage 로 «실제로 돌려» 봅니다.
//   짝: 「월요일 전에는 안 막는다」↔「월요일부터 막는다」, 「손님은 막는다」↔「로그인 키마다 안 막는다」.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'cloudflare-deploy/public');
const SRC = fs.readFileSync(path.join(PUB, 'js/ai-login-gate.js'), 'utf8');
const SG = fs.readFileSync(path.join(PUB, 'js/session-guard.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('❌ FAIL', m); } };

const CUTOFF = Date.UTC(2026, 10, 8, 15, 0, 0);   // 2026-11-09 00:00 KST

function run(store, nowMs, opts = {}) {
  const added = [];
  const body = { appendChild(el) { added.push(el); el.parentNode = body; }, removeChild(el) { const i = added.indexOf(el); if (i >= 0) added.splice(i, 1); } };
  const mkEl = () => ({ style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, f) { this['on_' + t] = f; }, querySelector() { return { focus() {} }; }, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } });
  const nav = { href: '' };
  const win = {
    __mgAiGateNow: nowMs,
    addEventListener() {},
    getLang: opts.en ? () => 'en' : undefined,
  };
  win.top = win;
  const ctx = {
    window: win, document: { readyState: 'complete', body, documentElement: { style: {} }, createElement: mkEl, addEventListener() {} },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    location: nav, setTimeout: () => 0, Date, Number, String, JSON, isFinite,
  };
  vm.createContext(ctx);
  try { vm.runInContext(SRC, ctx, { timeout: 1000 }); } catch (e) { ok(false, 'run threw ' + e.message); }
  return { added, win, nav };
}
const blocked = (r) => r.added.length === 1 && r.added[0].id === 'mg-ai-login-gate';

// ① 날짜 — 정본 상수가 2026-11-09 00:00 KST 인가(소스에서 읽은 값으로 실행)
{ const r = run({}, CUTOFF); ok(r.win.__mgAiLoginGate && r.win.__mgAiLoginGate.CUTOFF_MS === CUTOFF, '① 경계 시각이 2026-11-09 00:00 KST'); }
// ② 일요일까지는 비로그인도 그대로(짝: 월요일 0시부터는 막힘)
ok(!blocked(run({}, CUTOFF - 1)), '② 일요일 23:59:59.999 KST 손님 — 안 막힘');
ok(!blocked(run({}, Date.UTC(2026, 10, 5, 3, 0))), '② 오늘(11/5) 손님 — 안 막힘');
ok(blocked(run({}, CUTOFF)), '② 월요일 00:00 KST 손님 — 막힘');
ok(blocked(run({}, CUTOFF + 86400000 * 30)), '② 한 달 뒤 손님 — 막힘');
// ③ 로그인 키마다 안 막힘(짝: 손님 uid 는 막힘)
const AFTER = CUTOFF + 3600000;
const logged = {
  'mangoi_logged_user {uid}': { mangoi_logged_user: JSON.stringify({ uid: 'jeong', name: 'x' }) },
  'mango_user {user_id}': { mango_user: JSON.stringify({ user_id: 'lee' }) },
  'mango_token': { mango_token: 'abc.def' },
  'mangoi_token': { mangoi_token: 'abc' },
  'mangoi_admin_session {uid}': { mangoi_admin_session: JSON.stringify({ uid: 'hq_t_kang', name: '강' }) },
};
for (const [k, st] of Object.entries(logged)) ok(!blocked(run(st, AFTER)), '③ 로그인(' + k + ') — 안 막힘');
ok(blocked(run({ mango_user: JSON.stringify({ uid: 'guest_abc123' }) }, AFTER)), '③ 손님 uid(guest_) — 막힘');
ok(blocked(run({ mangoi_logged_user: JSON.stringify({ uid: 'anon_x' }), mango_token: 'null' }, AFTER)), '③ anon_ + 토큰 null — 막힘');
ok(blocked(run({ mangoi_logged_user: 'not json' }, AFTER)), '③ 깨진 값 — 막힘(던지지 않음)');
// ④ 문구 — 「로그인을 해야」 안내 + 영어
{ const r = run({}, AFTER); ok(/로그인을 해야/.test(r.added[0]?._html || ''), '④ 한국어 안내 문구'); }
{ const r = run({}, AFTER, { en: true }); ok(/Please log in/.test(r.added[0]?._html || ''), '④ 영어 안내 문구'); }
// ⑤ 로그인 버튼은 홈 ?login=1 로(맨 위 창)
{ const r = run({}, AFTER); const el = r.added[0];
  el.on_click({ target: { closest: () => ({ getAttribute: () => 'login' }) } });
  ok(r.nav.href === '/?login=1', '⑤ 로그인 버튼 → /?login=1'); }

// ⑥ 화면 목록 — AI 학습 화면에는 실리고, 홈·레벨테스트·이용권·설명서에는 안 실린다
const TAG = '<script src="/js/ai-login-gate.js" defer></script>';
const PAGES = ['today','ai-class','ai-speaking','warmup','ai-friend','stories','ai-dubbing','ai-dubbing-studio','judgment','speech-coach','speech-coach-cn','ai-write','review-quiz','review-quiz-cn','micro-quiz','vocab','student-games','speaking-quiz','english-mastery-suite','battle-3d','suspect-mystery','game-learning-science'];
const all = fs.readdirSync(PUB).filter((f) => f.endsWith('.html'));
const want = new Set(PAGES.map((p) => p + '.html').concat(all.filter((f) => /^story-(s\d-\d\d|birthday-cake|red-umbrella|robot-dance|treasure-map)\.html$/.test(f) || /^student-game-.+\.html$/.test(f))));
for (const f of want) { const s = fs.readFileSync(path.join(PUB, f), 'utf8'); ok(s.split(TAG).length === 2 && s.indexOf(TAG) < s.indexOf('</head>'), '⑥ ' + f + ' 에 head 안 한 번'); }
for (const f of ['index.html', 'level-test-ai.html', 'ai-pass.html', 'ai-guide.html']) ok(!fs.readFileSync(path.join(PUB, f), 'utf8').includes('ai-login-gate.js'), '⑥ ' + f + ' 에는 안 실림');
ok(!all.some((f) => /ai-login-gate\.js\?v=/.test(fs.readFileSync(path.join(PUB, f), 'utf8'))), '⑥ ?v= 없이 실린다(no-cache)');
ok(want.size >= 200, '⑥ 전제: 대상 화면을 읽었다 (' + want.size + ')');

// ⑦ 홈 ?login=1 — 로그인창을 연다(짝: 홈 밖·로그인 상태·파라미터 없음은 안 연다)
const sgBlock = SG.slice(SG.indexOf('/* 🔐 홈 ?login=1'));
ok(sgBlock.length > 100, '⑦ 전제: session-guard 의 ?login=1 절을 오려 냈다');
function runSg(pathname, search, store) {
  let opened = 0; const st = { replaced: '' };
  const win = { openLoginModal() { opened++; } };
  const ctx = { window: win, location: { pathname, search, hash: '' }, URLSearchParams, localStorage: { getItem: (k) => store[k] ?? null },
    history: { replaceState: (a, b, u) => { st.replaced = u; } }, setTimeout, JSON, String };
  vm.createContext(ctx); vm.runInContext(sgBlock, ctx, { timeout: 1000 });
  return { opened, st };
}
{ const r = runSg('/', '?login=1&next=%2Fwarmup.html', {}); ok(r.opened === 1, '⑦ 홈 ?login=1 손님 → 로그인창'); ok(r.st.replaced === '/', '⑦ 주소에서 login·next 를 지움'); }
ok(runSg('/', '?login=1', { mangoi_logged_user: JSON.stringify({ uid: 'jeong' }) }).opened === 0, '⑦ 이미 로그인 → 안 엶');
ok(runSg('/warmup.html', '?login=1', {}).opened === 0, '⑦ 홈 밖 → 안 엶');
ok(runSg('/', '?menu=x', {}).opened === 0, '⑦ 파라미터 없음 → 안 엶');

console.log(`ai_login_gate_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
