#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 📖 story_ai_fix_harness — 영어 동화책 «바꿔 쓰기» 2단계(AI 한 번 더 보기 · 강사용 기록, 2026-10-13)
//   ① 서버 정본 src/story-correct.ts 를 «실제로» 돌린다(타입 제거 + 진짜 english-only·correction-reason)
//      — 상한(경계값·fail-open 짝) · 검증(학생 낱말·문장 틀) · 라우트(가짜 AI·가짜 KV·진짜 SQLite)
//   ② 강사 인수인계: summarizeStory · handoverWorthShowing · teacher.html handoverHtml 을 오려 내 실행
//   ③ 화면 공용 js/story-kit.js 의 aiState·aiFix·logWrite 를 가짜 fetch 로 실행
//   ④ 4편 배선(규칙 먼저 → AI · 늦은 답 버림 · 내 문장 그대로 · 듣기 도장 뒤 기록)
//   ⑤ api-ai.ts 배선(비어 있던 POST 에 얹음 · GET 보다 앞)
// ═══════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
const SC_FILE = process.env.STORY_CORRECT_SRC || resolve(SRC, 'story-correct.ts');
const KIT_FILE = process.env.STORY_KIT_SRC || resolve(PUB, 'js/story-kit.js');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const asData = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function inject(code, ns) {
  return code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map((n) => n.trim().replace(/^type\s+/, '')).filter(Boolean)
      .map((n) => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
}
function bodyFrom(s, from) {
  const i = s.indexOf('{', from); if (i < 0) return '';
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return s.slice(i, k + 1); }
  }
  return '';
}

/* ── ① 서버 정본 ── */
console.log('① 서버 정본 src/story-correct.ts');
let S = null;
try {
  const EO = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  const CR = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'correction-reason.ts')))));
  globalThis.__SC = { ...EO, ...CR };
  S = await import(asData(inject(stripTypeScriptTypes(rd(SC_FILE)), '__SC')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }
ok(!!(S && S.handleStoryApi && S.verifyStoryFix), '전제: 정본을 불러왔다');
const run = (f) => { try { return f(); } catch (e) { return { __err: e.message }; } };

if (S) {
  const CAP = S.STORY_FIX_MAX_PER_DEVICE_DAY;
  ok(CAP === 30, '기기당 하루 30회(사장님 결정 추천안)');
  ok(S.storyFixAllowed(0, CAP) && S.storyFixAllowed(CAP - 1, CAP), '상한 아래는 허락');
  ok(!S.storyFixAllowed(CAP, CAP) && !S.storyFixAllowed(CAP + 1, CAP), '(짝) 상한에 닿으면 막음');
  ok([null, undefined, '', 'x', -1, NaN].every((v) => S.storyFixAllowed(v, CAP)), '(짝) 못 세면 막지 않음(fail-open)');
  const k1 = S.storyCapKey('dev', 'sd_abc', Date.UTC(2026, 9, 13, 14, 59)), k2 = S.storyCapKey('dev', 'sd_abc', Date.UTC(2026, 9, 13, 15, 1));
  ok(k1 !== k2 && k1.startsWith('storyfix:dev:sd_abc:'), '카운터는 KST 자정에 새로 시작');

  const good = { story: 'red-umbrella', a: 'go hmoe', b: 'it rain', slots: ['vp', 'cl'], device: 'sd_abcdef', sentence: 'Let’s go hmoe before it rain.' };
  ok(!!run(() => S.cleanStoryFix(good)), '모양이 맞는 요청은 받음');
  ok([{ ...good, story: 'Red Umbrella' }, { ...good, slots: ['vp'] }, { ...good, slots: ['vp', 'xx'] }, { ...good, device: 'x' },
      { ...good, a: '집에 가자' }, { ...good, a: 'a'.repeat(90) }].every((b) => S.cleanStoryFix(b) === null), '(짝) 모양이 틀리면 거절');

  ok(JSON.stringify(S.parseStoryFix('Sure! {"a":"go home","b":"it rains."}')) === '{"a":"go home","b":"it rains"}', 'JSON 앞 말·끝 마침표를 걷고 꺼냄');
  ok(S.parseStoryFix('[object Object]') === null && S.parseStoryFix('no json') === null, '(짝) 못 꺼내면 null');
  ok(S.storyAiText({ response: { a: 'x', b: 'y' } }) === '{"a":"x","b":"y"}', '객체로 온 응답도 글자로(«[object Object]» 함정)');

  const O = { a: 'go hmoe', b: 'it rain' }, SL = ['vp', 'cl'];
  ok(S.verifyStoryFix(O, { a: 'go home', b: 'it rains' }, SL).ok, '철자·3인칭 s 고침은 통과');
  ok(S.verifyStoryFix({ a: 'go home', b: 'dad come' }, { a: 'go home', b: 'Dad comes home' }, SL).ok, '낱말 하나 보탬(기능어 아닌 학생 낱말 반복)은 통과');
  ok(S.verifyStoryFix(O, { a: 'go shop', b: 'it rains' }, SL).why === 'new_word', '(짝) 학생이 안 쓴 낱말로 바꾸면 거절');
  ok(S.verifyStoryFix({ a: 'go home', b: 'it rain' }, { a: 'he goes home', b: 'it rains' }, SL).why === 'frame', '(짝) 동사로 시작할 칸이 주어로 시작하면 거절');
  ok(S.verifyStoryFix(O, { a: 'go home and eat a big dinner', b: 'it rains' }, SL).ok === false, '(짝) 크게 길어지면 거절');
  ok(S.verifyStoryFix(O, { a: 'go to the beach', b: 'it rains' }, SL).ok === false, '(짝) 새 낱말이 너무 많으면 거절');
  ok(S.verifyStoryFix(O, { a: '집에 가', b: 'it rains' }, SL).why === 'not_english', '(짝) 영어가 아니면 거절');

  const rs = S.storyFixReasons(O, { a: 'go home', b: 'it rains' });
  ok(rs.length === 2 && rs.every((r) => /[가-힣]/.test(r.ko)), '고친 이유는 결정론 설명기 한국어(모르면 일반 문구)');
  ok(S.storyFixReasons(O, { a: 'go hmoe', b: 'It rain' }).length === 0, '(짝) 대소문자만 다르면 이유 없음');

  /* 라우트 — 가짜 AI·KV · 진짜 SQLite */
  const { DatabaseSync } = await import('node:sqlite');
  function mkEnv(aiOut, kvInit = {}) {
    const kv = new Map(Object.entries(kvInit)), calls = { ai: 0 };
    const db = new DatabaseSync(':memory:');
    const D1 = {
      exec: async (sql) => db.exec(sql),
      prepare: (sql) => ({ bind: (...a) => ({ run: async () => db.prepare(sql).run(...a) }) }),
      _db: db,
    };
    return {
      calls, kv,
      env: {
        AI: aiOut === undefined ? undefined : { run: async () => { calls.ai++; if (aiOut instanceof Error) throw aiOut; return aiOut; } },
        SESSION_STATE: { get: async (k) => kv.has(k) ? kv.get(k) : null, put: async (k, v) => { kv.set(k, v); } },
        DB: D1,
      },
    };
  }
  const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
  const req = (body, ip = '1.2.3.4') => new Request('https://x/api/ai/write-history', { method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': ip } });
  async function call(env, body, authUid = null) {
    const r = await S.handleStoryApi(req(body), env, { json, authUid: async () => authUid, recordFailure: async () => {} });
    return { status: r.status, d: await r.json() };
  }
  const fixBody = { action: 'story_fix', ...good };

  let E = mkEnv({ response: '{"a":"go home","b":"it rains"}' });
  let r = await call(E.env, fixBody);
  ok(r.d.ok && r.d.changed && r.d.a === 'go home' && r.d.b === 'it rains' && r.d.reasons.length === 2, 'AI 가 고치면 고친 두 칸과 이유를 돌려줌');
  ok(!('uid' in r.d) && !JSON.stringify(r.d).includes('sd_abcdef'), '(짝) 응답에 학생·기기 아이디를 싣지 않음');
  E = mkEnv({ response: '{"a":"go home","b":"it rains"}' });
  r = await call(E.env, { ...fixBody, a: 'go home', b: 'it rains', sentence: 'Let’s go home before it rains.' });
  ok(r.d.ok && r.d.changed === false, '고칠 곳이 없으면 changed:false');
  E = mkEnv({ response: '{"a":"go to the beach","b":"it rains"}' });
  r = await call(E.env, fixBody);
  ok(!r.d.ok && r.d.error === 'unverified' && !('a' in r.d), '검사 탈락이면 고친 문장을 안 보여 줌');
  E = mkEnv(new Error('boom'));
  r = await call(E.env, fixBody);
  ok(r.status === 503 && r.d.error === 'ai_unavailable' && E.calls.ai === 2, 'AI 가 실패하면 두 모델 다 시도 후 ai_unavailable(«틀린 곳 없음» 아님)');
  E = mkEnv(undefined);
  r = await call(E.env, fixBody);
  ok(r.d.error === 'ai_unavailable', 'AI 바인딩이 없으면 ai_unavailable');

  const today = Date.now();
  E = mkEnv({ response: '{"a":"go home","b":"it rains"}' }, { [S.storyCapKey('dev', 'sd_abcdef', today)]: String(CAP) });
  r = await call(E.env, fixBody);
  ok(r.status === 429 && r.d.error === 'daily_cap' && E.calls.ai === 0, '기기 상한이면 AI 를 «부르지 않고» daily_cap');
  E = mkEnv({ response: '{"a":"go home","b":"it rains"}' }, { [S.storyCapKey('dev', 'sd_abcdef', today)]: String(CAP - 1) });
  r = await call(E.env, fixBody);
  ok(r.d.ok && E.calls.ai === 1 && E.kv.get(S.storyCapKey('dev', 'sd_abcdef', today)) === String(CAP), '(짝) 상한 직전이면 부르고 카운터를 하나 올림');
  E = mkEnv({ response: '{"a":"go home","b":"it rains"}' }, { [S.storyCapKey('ip', '1.2.3.4', today)]: String(S.STORY_FIX_MAX_PER_IP_DAY) });
  r = await call(E.env, { ...fixBody, device: 'sd_newdevice' });
  ok(r.status === 429 && E.calls.ai === 0, '기기 id 를 바꿔 끼워도 회선(IP) 상한에 걸림');
  const ipKey = S.storyCapKey('ip', '1.2.3.4', today);
  E = mkEnv({ response: '{"a":"go home","b":"it rains"}' }, { [S.storyCapKey('dev', 'sd_abcdef', today)]: String(CAP), [ipKey]: '5' });
  r = await call(E.env, fixBody);
  ok(r.status === 429 && E.kv.get(ipKey) === '5', '(짝) 기기 상한에 막힌 요청은 회선 카운터를 먹지 않음(같은 반 다른 아이 보호)');
  E = mkEnv({ response: '{"a":"don\'t go","b":"it rains"}' });
  r = await call(E.env, { ...fixBody, a: 'don’t go', b: 'it rains', sentence: 'Let’s don’t go before it rains.' });
  ok(r.d.ok && r.d.changed === false, '둥근 따옴표(don’t)와 곧은 따옴표(don\'t)만 다르면 «고칠 곳 없음»');

  r = await call(mkEnv({}).env, { action: 'delete_all' });
  ok(r.status === 400 && r.d.error === 'unknown_action', '모르는 action 은 400');

  const logBody = { action: 'story_log', uid: 'kim01', story: 'robot-dance', sentence: 'I can’t dance well, but I can sing songs.', original: 'I can’t dance well, but I can sings songs.', fixes: 1, ai: 'fixed' };
  E = mkEnv({});
  r = await call(E.env, logBody, 'kim01');
  const rows = E.env.DB._db.prepare('SELECT * FROM story_write_log').all();
  ok(r.d.saved === true && rows.length === 1 && rows[0].student_uid === 'kim01' && rows[0].fixes === 1 && rows[0].ai === 'fixed', '본인 토큰이면 진짜 SQLite 에 기록');
  E = mkEnv({});
  r = await call(E.env, logBody, 'lee02');
  ok(r.d.saved === false && r.d.reason === 'not_logged_in', '(짝) 토큰 주인이 다르면 저장 안 함');
  E = mkEnv({});
  r = await call(E.env, { ...logBody, uid: 'guest_abc' }, 'guest_abc');
  ok(r.d.saved === false, '(짝) 게스트는 저장 안 함');
  ok(S.cleanStoryLog({ ...logBody, fixes: 99, ai: 'hack' }).fixes === 10 && S.cleanStoryLog({ ...logBody, ai: 'hack' }).ai === 'none', '고친 곳 수·상태값은 범위 안으로');
}

/* ── ② 강사 인수인계 ── */
console.log('② 강사 인수인계');
let H = null;
try {
  const EO = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'english-only.ts')))));
  globalThis.__FC2 = { isEnglishText: EO.isEnglishText };
  const FC = await import(asData(inject(stripTypeScriptTypes(rd(resolve(SRC, 'fix-cards.ts'))), '__FC2')));
  const DC = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts')))));
  globalThis.__TH2 = { ...FC, ...DC };
  H = await import(asData(inject(stripTypeScriptTypes(rd(resolve(SRC, 'teacher-handover.ts'))), '__TH2')));
} catch (e) { console.log('  (인수인계 로드 실패: ' + e.message + ')'); }
if (H) {
  const st = H.summarizeStory([{ sentence: 'new', original: 'old', fixes: 2, created_at: Date.UTC(2026, 9, 12) }, { sentence: 'b', fixes: 1, created_at: 1 }]);
  ok(st.n === 2 && st.fixes === 3 && st.last === 'new' && st.last_was === 'old', '최근 문장·문장 수·고친 곳 합');
  ok(H.summarizeStory(null) === null && H.summarizeStory([]).n === 0, '(짝) 못 읽음(null)과 0문장을 구분');
  ok(H.handoverWorthShowing({ goal: null, fix: null, story: { n: 1, fixes: 0 } }) === true, '동화책 기록만 있어도 카드를 싣음');
  ok(H.handoverWorthShowing({ goal: null, fix: null, story: { n: 0, fixes: 0 } }) === false, '(짝) 0문장이면 싣지 않음');
  // 표가 아직 없는 DB 에서도 던지지 않고 «0»
  const db = { prepare: (sql) => ({ bind: () => ({ all: async () => { if (/story_write_log/.test(sql)) throw new Error('D1_ERROR: no such table: story_write_log'); return { results: [] }; } }) }) };
  const m = await H.loadHandovers(db, ['kim01'], Date.now(), Date.now() - 3600000);
  ok(m instanceof Map && m.size === 0, '표가 없어도 던지지 않음(학생 목록을 막지 않음)');
}
const T_HTML = rd(resolve(PUB, 'teacher.html'));
const hi = T_HTML.indexOf('function handoverHtml(c)');
const hb = bodyFrom(T_HTML, hi);
let handoverHtml = null;
try { handoverHtml = new Function('esc', 'T', 'EN', 'return function(c)' + hb)((x) => String(x), (en, ko) => ko, () => false); } catch (e) { console.log('  (handoverHtml 오리기 실패: ' + e.message + ')'); }
ok(!!handoverHtml, '전제: teacher.html handoverHtml 을 오려 냈다');
if (handoverHtml) {
  const out = handoverHtml({ handover: { goal: null, fix: null, story: { n: 2, fixes: 3, last: 'Let’s go home.', last_was: 'Let’s goes home.', date: '2026-10-12' } } });
  ok(/동화책 바꿔 쓰기/.test(out) && /2문장 · 고친 곳 3개/.test(out) && /cls-hand-was">Let’s goes home\./.test(out), '강사 화면에 «N문장 · 고친 곳 M개 · 최근 문장(고치기 전→후)»');
  ok(handoverHtml({ handover: { goal: null, fix: null, story: { n: 0, fixes: 0, last: '' } } }) === '', '(짝) 0문장이면 줄을 안 그림');
}

/* ── ③ 화면 공용 story-kit.js ── */
console.log('③ js/story-kit.js 네트워크 배선');
function loadKit(store, fetchImpl) {
  const g = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, fetch: fetchImpl, AbortController: globalThis.AbortController, setTimeout, clearTimeout };
  new Function('window', rd(KIT_FILE))(g);
  return g.StoryKit;
}
const sent = [];
const fk = (resp) => async (url, o) => { sent.push({ url, body: JSON.parse(o.body), headers: o.headers }); return { json: async () => resp }; };
let K = loadKit({}, fk({ ok: true, changed: true, a: 'go home', b: 'it rains', reasons: [{ ko: '철자를 고쳤어요.', en: 'x' }, { ko: '3인칭', en: 'y' }] }));
ok(!!(K && K.aiFix && K.aiState && K.logWrite && K.aiNote), '전제: 2단계 함수가 있다');
const ar = await K.aiFix({ story: 'red-umbrella', a: 'go hmoe', b: 'it rain', slots: ['vp', 'cl'], sentence: 's' });
ok(ar.state === 'fixed' && ar.a === 'go home' && ar.issues.length === 2 && ar.issues[0].from === 'hmoe' && ar.issues[0].to === 'home', 'AI 답 → «고침» 상태와 바뀐 낱말');
ok(sent[0].url === '/api/ai/write-history' && sent[0].body.action === 'story_fix' && /^sd_/.test(sent[0].body.device) && !('uid' in sent[0].body), '(짝) AI 확인 요청에는 기기 id 만, 학생 아이디는 안 실음');
ok(K.aiState(null, {}).state === 'unavailable' && K.aiState({ ok: false, error: 'daily_cap' }, {}).state === 'cap' && K.aiState({ ok: false, error: 'unverified' }, {}).state === 'unavailable', '못 받음·상한·검사탈락을 «틀린 곳 없음» 으로 읽지 않음');
ok(K.aiState({ ok: true, changed: false }, {}).state === 'ok', '(짝) 고칠 곳 없음은 ok');
ok(K.aiState({ ok: true, changed: true, a: "don't go", b: 'x' }, { a: 'don’t go', b: 'x' }).state === 'ok', '화면도 둥근/곧은 따옴표 차이는 고침으로 안 봄');
{
  const KH = loadKit({}, () => new Promise(() => {}));   // 영영 답이 안 오는 fetch
  const t0 = Date.now();
  // 하니스 자신의 안전망 — 화면 쪽 타이머가 빠지면 «크래시» 가 아니라 깔끔한 FAIL 이 되게
  const hr = await Promise.race([KH.aiFix({ story: 'red-umbrella', a: 'go home', b: 'it rains', slots: ['vp', 'cl'], sentence: 's' }), new Promise((z) => setTimeout(() => z({ state: 'HUNG' }), 12000))]);
  ok(hr.state === 'unavailable' && Date.now() - t0 < 12000, '답이 영영 안 와도 타이머가 끝내고 «못 봄»(기다리는 중에 멈추지 않음)');
}
ok(/하지 못했어요/.test(K.aiNote('unavailable').ko) && /30/.test(K.aiNote('cap').ko) && K.aiNote('fixed') === null, '상태별 안내 문구');
sent.length = 0;
K = loadKit({}, fk({ ok: true, saved: true }));
await K.logWrite({ story: 'red-umbrella', sentence: 'x', fixes: 1, ai: 'none' });
ok(sent.length === 0, '로그인 안 했으면 기록 요청을 아예 안 보냄');
K = loadKit({ mangoi_logged_user: JSON.stringify({ uid: 'kim01' }), mango_token: 'tok' }, fk({ ok: true, saved: true }));
await K.logWrite({ story: 'red-umbrella', sentence: 'x', fixes: 1, ai: 'none' });
ok(sent.length === 1 && sent[0].body.action === 'story_log' && sent[0].body.uid === 'kim01' && sent[0].headers.Authorization === 'Bearer tok', '(짝) 로그인했으면 토큰과 함께 기록');

/* ── ④ 4편 배선 ── */
console.log('④ 동화책 4편 배선');
for (const id of ['red-umbrella', 'birthday-cake', 'robot-dance', 'treasure-map']) {
  const html = rd(resolve(PUB, 'story-' + id + '.html'));
  const wi = html.indexOf("document.getElementById('wcheck').addEventListener(");
  const wc = bodyFrom(html, wi);
  const g = wc.indexOf('kitR.grammar > 0'), ai = wc.indexOf('StoryKit.aiFix('), sd = wc.indexOf("storyDone('write')");
  ok(g > 0 && ai > g, id + ': 규칙 점검이 먼저, AI 는 그다음');
  ok(/if \(WBUSY\) return;/.test(wc) && wc.indexOf('if (WBUSY) return;') < wc.indexOf('StoryKit.aiFix('), id + ': 기다리는 동안 다시 눌러도 AI 를 두 번 부르지 않음');
  ok(/if \(seq !== WSEQ\) return;/.test(wc) && /WSEQ\+\+; paintWrite\(\)/.test(html), id + ': 그사이 고쳐 쓰면 늦게 온 AI 답은 버림');
  ok(/if \(!\(window\.StoryKit && StoryKit\.aiFix\)\) \{ finishW\('skipped'\); return; \}/.test(wc), id + ': (짝) StoryKit 이 없으면 예전처럼 바로 도장');
  ok(/showFix\(res, false, true\)/.test(wc) && /id=\\"wkeep\\"|id="wkeep"/.test(html) && /b\.id === 'wkeep' && WKEEP/.test(html), id + ': AI 고침에는 «내 문장 그대로 낼래요» 길이 있음(막다른 길 없음)');
  ok(sd > 0 && /finishW\(res\.state\)/.test(wc), id + ': AI 가 고칠 곳이 없거나 못 보면 도장');
  const ws = bodyFrom(html, html.indexOf("document.getElementById('wsay').addEventListener("));
  // 2026-10-16 사장님: «고친 문장으로 바꾸기 → 듣기 → 도장» 길을 없앴다 — 학생이 직접 고쳐 다시 «완성하기» 로만 도장.
  ok(ws.length > 50 && !/storyDone\(/.test(ws) && !/storyLog\(/.test(ws), id + ': «내 문장 듣기» 는 도장·기록을 안 함(직접 고쳐 다시 완성하기로만)');
  ok(/var lg = WLOG; WLOG = null;/.test(wc) && /lg \? lg\.original : mine0/.test(wc) && /\(lg && lg\.ai === 'fixed'\)/.test(wc), id + ': (짝) 고친 뒤 다시 완성하면 처음 문장·AI 고침 여부를 기록');
  ok(html.includes('/js/story-kit.js?v=2'), id + ': story-kit.js 새 번호(?v=2)');
}

/* ── ⑤ api-ai.ts 배선 ── */
console.log('⑤ api-ai.ts 배선');
const AI = rd(resolve(SRC, 'api-ai.ts'));
const pPost = AI.indexOf("if (method === 'POST' && path === '/api/ai/write-history')");
const pGet = AI.indexOf("if (method === 'GET' && path === '/api/ai/write-history')");
ok(pPost > 0 && pGet > pPost, '비어 있던 POST 에 얹음(src/index.ts 무수정)');
ok(/handleStoryApi\(request, env, \{ json, authUid:/.test(AI.slice(pPost, pPost + 400)), '판정은 story-correct.ts 정본에 맡김');
ok((AI.match(/method === 'POST' && path === '\/api\/ai\/write-history'/g) || []).length === 1, '(짝) 같은 경로·메서드 처리가 하나뿐');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
