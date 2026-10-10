// parent_request_harness.mjs — 학부모 요청 → 선생님 반영 확인 (2026-10-10, 경쟁사 분석 적용 ⑤)
//   정본 src/parent-request.ts 를 «실제로» 돌린다(타입 제거 + 진짜 d1-chunk·student-alias, 진짜 SQLite 를 D1 모양으로).
//   배선(api-teacher·api-students)과 화면(teacher.html·parent.html)은 «오려 내 실행» 하거나 «위치» 로 묻는다.
//   「한다」 옆에 「안 한다」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = p => readFileSync(p, 'utf8');
const R_FILE = process.env.PREQ_SRC || resolve(SRC, 'parent-request.ts');
const API_T = process.env.PREQ_API_T || resolve(SRC, 'api-teacher.ts');
const API_S = process.env.PREQ_API_S || resolve(SRC, 'api-students.ts');
const UI_T = process.env.PREQ_UI_T || resolve(PUB, 'teacher.html');
const UI_P = process.env.PREQ_UI_P || resolve(PUB, 'parent.html');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
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
const asData = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
function inject(code, ns) {
  return code.replace(/^import\s*\{([^}]*)\}\s*from\s*'[^']+';?/gm, (m, names) =>
    names.split(',').map(n => n.trim().replace(/^type\s+/, '')).filter(Boolean)
      .map(n => `const ${n} = globalThis.${ns}.${n};`).join('\n'));
}
const stripC = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const run = f => { try { return f(); } catch (e) { return { __err: e.message }; } };
const DAY = 86400000;

/* ── 정본 로드 ── */
let M = null;
try {
  const DC = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'd1-chunk.ts')))));
  const SA = await import(asData(stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')))));
  globalThis.__PR = { ...DC, ...SA };
  M = await import(asData(inject(stripTypeScriptTypes(rd(R_FILE)), '__PR')));
} catch (e) { console.log('  (정본 로드 실패: ' + e.message + ')'); }

console.log('① 순수 함수');
ok('전제: 정본을 불러왔다', !!(M && M.setParentRequest && M.markParentRequestDone && M.parentReqView && M.PARENT_REQUESTS));
if (M) {
  const L = M.PARENT_REQUESTS;
  ok('보기는 5~6개', L.length >= 5 && L.length <= 6, String(L.length));
  ok('보기마다 ko·en 이 있고 key 가 겹치지 않는다', L.every(r => r.key && r.ko && r.en) && new Set(L.map(r => r.key)).size === L.length);
  ok('영어 문구에 한글이 섞이지 않는다(외국인 강사용)', L.every(r => !/[가-힣]/.test(r.en)));
  ok('parentReqByKey: 아는 key', run(() => M.parentReqByKey('more_speaking'))?.key === 'more_speaking');
  ok('짝: 모르는 key·빈 값은 null', run(() => M.parentReqByKey('free text')) === null && run(() => M.parentReqByKey('')) === null);
  const now = 500 * DAY;
  const open = { id: 3, req_key: 'grammar', created_at: now - DAY, status: 'open' };
  ok('열린 요청 → open', run(() => M.parentReqView(open, now))?.status === 'open');
  const done = { ...open, status: 'done', done_at: now - 2 * DAY, done_by_name: 'Kaye' };
  const dv = run(() => M.parentReqView(done, now));
  ok('반영한 요청 → done + 이름·시각', dv?.status === 'done' && dv.done_by_name === 'Kaye' && dv.done_at === now - 2 * DAY, JSON.stringify(dv));
  ok('오래된(14일 넘은) 반영 요청은 null', run(() => M.parentReqView({ ...done, done_at: now - 15 * DAY }, now)) === null);
  ok('짝: 14일 안의 반영 요청은 보인다', run(() => M.parentReqView({ ...done, done_at: now - 13 * DAY }, now)) !== null);
  ok('바뀐/취소한 요청은 null', run(() => M.parentReqView({ ...open, status: 'replaced' }, now)) === null && run(() => M.parentReqView({ ...open, status: 'cleared' }, now)) === null);
  ok('모르는 key 행은 null(지어내지 않는다)', run(() => M.parentReqView({ ...open, req_key: 'x' }, now)) === null);
}

/* ── ② 진짜 SQLite ── */
function d1(db, failOn) {
  return {
    prepare(sql) {
      if (failOn && failOn.test(sql)) throw new Error('no such table (simulated)');
      const st = db.prepare(sql); let args = [];
      const o = { bind(...a) { args = a; return o; },
        async all() { return { results: st.all(...args) }; },
        async first() { return st.get(...args) ?? null; },
        async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes) } }; },
        __exec: () => st.run(...args) };
      return o;
    },
    async batch(list) { db.exec('BEGIN'); try { for (const s of list) s.__exec(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
console.log('② 저장·반영 — 진짜 SQLite');
if (M) {
  const now = 600 * DAY;
  const db = new DatabaseSync(':memory:');
  const D = d1(db);
  db.exec(`CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, username TEXT)`);
  const se = db.prepare('INSERT INTO students_erp VALUES (?,?,?)');
  se.run('delaware', '김연숙', 'delaware'); se.run('mangoai_delaware', '김연숙', 'x');
  se.run('jin', '박진', 'jin'); se.run('mangoai_jin', '다른사람', 'y');
  const openOf = u => db.prepare(`SELECT COUNT(*) AS n FROM parent_requests WHERE student_uid = ? AND status = 'open'`).get(u).n;

  const bad = await M.setParentRequest(D, { uid: 'kim', key: 'please do X', nowMs: now });
  ok('보기 밖 key 는 거절(자유 입력 안 받음)', bad.ok === false && bad.error === 'unknown_request');
  const r1 = await M.setParentRequest(D, { uid: 'kim', key: 'more_speaking', nowMs: now });
  ok('요청을 저장한다(열림)', r1.ok === true && r1.request && r1.request.key === 'more_speaking' && r1.request.status === 'open', JSON.stringify(r1));
  await M.setParentRequest(D, { uid: 'kim', key: 'grammar', nowMs: now + 10 });
  ok('새로 보내면 열린 요청은 하나뿐(앞 것은 replaced)', openOf('kim') === 1 &&
     db.prepare(`SELECT COUNT(*) AS n FROM parent_requests WHERE student_uid='kim' AND status='replaced'`).get().n === 1);
  ok('…그리고 최신 것이 보인다', (await M.loadParentRequest(D, 'kim', now + 20))?.key === 'grammar');
  const clr = await M.setParentRequest(D, { uid: 'kim', key: '', nowMs: now + 30 });
  ok('빈 key = 취소', clr.ok === true && clr.request === null && openOf('kim') === 0);

  await M.setParentRequest(D, { uid: 'lee', key: 'slower', nowMs: now });
  await M.setParentRequest(D, { uid: 'Lee', key: 'praise', nowMs: now });
  const lee = await M.loadParentRequest(D, 'lee', now + 1);
  ok('uid 정확일치 — Lee 의 요청이 lee 에 안 섞인다', lee?.key === 'slower', JSON.stringify(lee));
  const wrong = await M.markParentRequestDone(D, { uid: 'Lee', id: lee.id, by: 't', byName: 'T', nowMs: now + 2 });
  ok('남의 학생 요청 id 로는 반영 못 함(0행)', wrong.ok === false && wrong.error === 'not_open' && openOf('lee') === 1);
  const dn = await M.markParentRequestDone(D, { uid: 'lee', id: lee.id, by: 'mangoi_007', byName: 'Kaye', nowMs: now + 3 });
  ok('반영함 → done + 이름', dn.ok === true && dn.request?.status === 'done' && dn.request.done_by_name === 'Kaye', JSON.stringify(dn));
  const again = await M.markParentRequestDone(D, { uid: 'lee', id: lee.id, by: 't', byName: 'Other', nowMs: now + 4 });
  ok('이미 반영한 것은 다시 못 바꾼다(처음 반영한 사람 유지)', again.ok === false &&
     db.prepare('SELECT done_by_name FROM parent_requests WHERE id = ?').get(lee.id).done_by_name === 'Kaye');
  ok('짝: id 가 숫자가 아니면 거절', (await M.markParentRequestDone(D, { uid: 'lee', id: 'x', by: 't', byName: 'T', nowMs: now })).ok === false);
  ok('반영한 요청은 14일 동안 «반영함» 으로 보인다', (await M.loadParentRequest(D, 'lee', now + 13 * DAY))?.status === 'done');
  ok('…14일이 지나면 안 보인다(다시 고르기)', (await M.loadParentRequest(D, 'lee', now + 15 * DAY)) === null);

  /* 쌍둥이 계정 — 학부모는 로그인 계정(delaware)에 적고, 강사 수업 줄은 mangoai_delaware 일 수 있다 */
  await M.setParentRequest(D, { uid: 'delaware', key: 'review', nowMs: now });
  const tMap = await M.loadParentRequests(D, ['mangoai_delaware'], now + 1);
  const tv = tMap.get('mangoai_delaware');
  ok('강사 줄이 쌍둥이 계정이어도 학부모 요청이 보인다', tv?.key === 'review', JSON.stringify(tv));
  const tdone = await M.markParentRequestDone(D, { uid: 'mangoai_delaware', id: tv.id, by: 't', byName: 'Len', nowMs: now + 2 });
  ok('…그 줄에서 반영하면 학부모 화면(로그인 계정)도 ✔', tdone.ok === true && (await M.loadParentRequest(D, 'delaware', now + 3))?.status === 'done');
  await M.setParentRequest(D, { uid: 'mangoai_delaware', key: 'praise', nowMs: now + 5 });
  await M.setParentRequest(D, { uid: 'delaware', key: 'slower', nowMs: now + 6 });
  ok('쌍둥이 한쪽에서 새로 보내면 다른 쪽 열린 요청도 끝난다', openOf('mangoai_delaware') === 0 && openOf('delaware') === 1);
  await M.setParentRequest(D, { uid: 'mangoai_jin', key: 'praise', nowMs: now });
  ok('이름이 다른 «가짜 쌍둥이» 요청은 안 보인다', !(await M.loadParentRequests(D, ['jin'], now + 1)).has('jin'));
  await M.setParentRequest(D, { uid: 'jin', key: 'grammar', nowMs: now + 2 });
  ok('…jin 에 보내도 mangoai_jin 요청은 그대로', openOf('mangoai_jin') === 1 && openOf('jin') === 1);

  const many = await M.loadParentRequests(D, ['kim', 'lee', 'delaware', 'nobody'], now + 7);
  ok('여러 학생을 한 번에 읽는다(없는 학생은 빠진다)', many.get('delaware')?.key === 'slower' && many.get('lee')?.status === 'done' && !many.has('kim') && !many.has('nobody'));

  const empty = await M.loadParentRequests(d1(new DatabaseSync(':memory:')), ['kim'], now);
  ok('표가 아직 없으면 빈 Map(던지지 않는다)', empty instanceof Map && empty.size === 0);
  const thrown = await M.loadParentRequests(d1(db, /parent_requests/), ['kim'], now).then(() => 'ok', () => 'threw');
  ok('조회가 실패해도 던지지 않는다', thrown === 'ok');
}

/* ── ③ 강사 포털 배선 ── */
console.log('③ 강사 포털 (api-teacher.ts)');
{
  const s = rd(API_T);
  ok('게이트: POST ?part=preq 도 핸들러에 닿는다', /isPreqPost\s*=\s*method === 'POST' && url\.searchParams\.get\('part'\) === 'preq'/.test(s) && /!isGoalPost && !isPreqPost/.test(s));
  const at = s.indexOf('if (isPreqPost) {');
  const blk = at > 0 ? bodyFrom(s, at) : '';
  ok('전제: 반영 블록을 오려 냈다', blk.length > 100);
  const json = (o, st) => ({ body: o, status: st || 200 });
  const mk = () => {
    const calls = [];
    return { calls, fn: async (db, a) => { calls.push(a); return { ok: true, request: { id: a.id, status: 'done' } }; } };
  };
  async function go(body, classes) {
    const m = mk();
    let f;
    try {
      const code = stripTypeScriptTypes('async function __f(request, classes, env, actor, now, json, markParentRequestDone) {' + blk.slice(1, -1) + " return 'fallthrough'; }");
      f = new Function(code + '; return __f;')();
    } catch (e) { return { err: e.message, calls: m.calls }; }
    try {
      const out = await f({ json: async () => body }, classes, { DB: {} }, { username: 'mangoi_007', name: 'Kaye' }, 1000, json, m.fn);
      return { out, calls: m.calls };
    } catch (e) { return { err: e.message, calls: m.calls }; }
  }
  const cls = [{ kind: 'class', student_uid: 'kim' }, { kind: 'lms', student_uid: 'lmsu' }];
  const a = await go({ student_uid: 'kim', request_id: 7 }, cls);
  ok('내 오늘 학생이면 반영한다(이름·시각·id 그대로)', a.out?.status === 200 && a.calls.length === 1 && a.calls[0].uid === 'kim' && a.calls[0].id === 7 && a.calls[0].byName === 'Kaye', JSON.stringify(a));
  const b = await go({ student_uid: 'lee', request_id: 7 }, cls);
  ok('짝: 남의 학생은 403 이고 저장을 안 부른다', b.out?.status === 403 && b.calls.length === 0, JSON.stringify(b));
  const c = await go({ student_uid: 'Kim', request_id: 7 }, cls);
  ok('대소문자만 다른 계정은 남이다(403)', c.out?.status === 403 && c.calls.length === 0);
  const d = await go({ student_uid: 'lmsu', request_id: 7 }, cls);
  ok('LMS 자리표시 줄은 권한 범위가 아니다(403)', d.out?.status === 403 && d.calls.length === 0);
  const e = await go({ request_id: 7 }, cls);
  ok('uid 가 없으면 400', e.out?.status === 400 && e.calls.length === 0);
  const ld = s.indexOf('const pBy = await loadParentRequests(');
  ok('목록에 요청을 싣는다(수업 줄에만)', ld > 0 && /if \(pr && c\.kind === 'class'\) c\.parent_request = pr;/.test(s.slice(ld, ld + 400)));
  ok('짝: «다음 수업» 배너(?only=next)에서는 안 읽는다', /if \(!onlyNext\) try \{\s*const pUids/.test(s));
}

/* ── ④ 학부모 대시보드 배선 ── */
console.log('④ 학부모 대시보드 (api-students.ts)');
{
  const s = rd(API_S);
  ok('POST ?part=request 가 같은 경로·같은 게이트로 들어온다', /isParentReqPost = method === 'POST' && path === '\/api\/parent\/dashboard' && url\.searchParams\.get\('part'\) === 'request'/.test(s) &&
     /if \(\(method === 'GET' \|\| isParentReqPost\) && path === '\/api\/parent\/dashboard'\)/.test(s));
  const iAuth = s.indexOf("error: 'auth_required', message: '자녀 계정으로 로그인해주세요.'");
  const iPw = s.indexOf("error: 'password_not_set'");
  const iPost = s.indexOf('if (isParentReqPost) {');
  ok('요청 저장은 본인확인(토큰 + 비밀번호) «뒤» 에만', iAuth > 0 && iPw > 0 && iPost > iAuth && iPost > iPw);
  const post = iPost > 0 ? bodyFrom(s, iPost) : '';
  ok('저장은 DB 표기 childUid 로(본문 uid 를 믿지 않는다)', /setParentRequest\(env\.DB, \{ uid: childUid,/.test(post) && !/b\.child_uid|b\.student_uid/.test(post));
  ok('GET 응답에 요청·보기를 싣는다', /parent_request: parentRequest,/.test(s) && /request_options: PARENT_REQUESTS\.map/.test(s));
}

/* ── ⑤ 강사 화면 ── */
console.log('⑤ 강사 화면 (teacher.html)');
{
  const s = rd(UI_T);
  const i = s.indexOf('function preqHtml(c)');
  const fnSrc = i > 0 ? 'function preqHtml(c)' + bodyFrom(s, i) : '';
  ok('전제: preqHtml 을 오려 냈다', fnSrc.length > 100);
  let F = null;
  try {
    F = new Function('LANG', `var EN=function(){return LANG!=='ko'}; var T=function(en,ko){return EN()?en:ko};
      var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})};
      ${fnSrc}; return preqHtml;`);
  } catch (e) { F = null; }
  const pr = (lang, c) => { try { return F(lang)(c); } catch (e) { return '__err ' + e.message; } };
  const openC = { kind: 'class', student_uid: 'kim', parent_request: { id: 9, key: 'grammar', ko: '문법을 더 짚어 주세요', en: 'Please point out grammar more', status: 'open' } };
  const h1 = pr('en', openC);
  ok('열린 요청: 영어 문구 + «Done ✔» 버튼(id·uid 를 싣는다)', /Please point out grammar more/.test(h1) && /class="preq-done"/.test(h1) && /data-id="9"/.test(h1) && /data-uid="kim"/.test(h1), h1);
  const h2 = pr('en', { ...openC, parent_request: { ...openC.parent_request, status: 'done', done_by_name: 'Kaye' } });
  ok('짝: 반영한 요청은 버튼 없이 ✔ + 이름', /✔/.test(h2) && /Kaye/.test(h2) && !/preq-done/.test(h2), h2);
  ok('한국어 화면은 한국어 문구', /문법을 더 짚어 주세요/.test(pr('ko', openC)));
  ok('요청이 없으면 아무것도 안 그린다', pr('en', { kind: 'class', student_uid: 'kim' }) === '');
  ok('LMS 자리표시 줄에는 안 그린다', pr('en', { ...openC, kind: 'lms' }) === '');
  ok('수업 줄이 preqHtml 을 부른다', /\+\s*goalHtml\(c\)\s*\+\s*preqHtml\(c\)/.test(s));
  ok('다시그리기 지문에 요청 id·상태가 들어간다(반영 직후 다시 그린다)', /sc\.parent_request \? sc\.parent_request\.id \+ sc\.parent_request\.status/.test(s));
  const li = s.indexOf("closest('button.preq-done')");
  const lis = li > 0 ? s.slice(s.lastIndexOf("document.addEventListener('click'", li), li + 2400) : '';
  ok('버튼은 확인을 받고 ?part=preq 로 POST 한다', /window\.confirm\(/.test(lis) && /\/api\/teacher\/portal\?part=preq/.test(lis) && /request_id: id/.test(lis));
  ok('짝: 실패하면 «저장 안 됨» 을 말하고 버튼을 되살린다', /disabled = false/.test(lis) && /Not saved/.test(lis));
}

/* ── ⑥ 학부모 화면 ── */
console.log('⑥ 학부모 화면 (parent.html)');
{
  const s = rd(UI_P);
  const i = s.indexOf('function pdReqHtml(r, opts, en)');
  const fnSrc = i > 0 ? 'function pdReqHtml(r, opts, en)' + bodyFrom(s, i) : '';
  ok('전제: pdReqHtml 을 오려 냈다', fnSrc.length > 100);
  let F = null;
  try { F = new Function(`var esc=function(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return '&#'+c.charCodeAt(0)+';'})}; ${fnSrc}; return pdReqHtml;`)(); } catch (e) { F = null; }
  const ph = (...a) => { try { return F(...a); } catch (e) { return '__err ' + e.message; } };
  const opts = [{ key: 'more_speaking', ko: '말하기를 더 많이 시켜 주세요', en: 'Please give more speaking time' }, { key: 'grammar', ko: '문법을 더 짚어 주세요', en: 'Please point out grammar more' }];
  ok('보기 목록이 없으면(옛 응답) 카드를 감춘다(null)', ph(null, undefined, false) === null && ph(null, [], false) === null);
  const h0 = ph(null, opts, false);
  ok('요청이 없으면 고르개 + 안내', /<select id="pd-req-pick"/.test(h0) && /요청 고르기/.test(h0) && /말하기를 더 많이/.test(h0), h0);
  const h1 = ph({ id: 1, key: 'grammar', ko: '문법을 더 짚어 주세요', en: 'x', status: 'open' }, opts, false);
  ok('열린 요청: 그 보기가 골라져 있고 «아직 반영 전»', /value="grammar" selected/.test(h1) && /아직 반영 전/.test(h1) && /요청 취소/.test(h1), h1);
  const h2 = ph({ id: 1, key: 'grammar', ko: '문법을 더 짚어 주세요', en: 'x', status: 'done', done_by_name: 'Kaye', done_at: 700 * DAY }, opts, false);
  ok('반영한 요청: ✔ + «반영했어요» + 선생님 이름', /✔/.test(h2) && /반영했어요/.test(h2) && /Kaye/.test(h2), h2);
  ok('짝: 반영한 요청은 «아직 반영 전» 이 아니다', !/아직 반영 전/.test(h2));
  ok('영어 화면은 영어 문구', /Please point out grammar more/.test(ph(null, opts, true)));
  ok('대시보드가 카드를 그린다(d.parent_request·d.request_options)', /pdReqRender\(d\.parent_request \|\| null, d\.request_options\)/.test(s));
  const sv = s.indexOf('async function pdReqSave(sel)');
  const svb = sv > 0 ? bodyFrom(s, sv) : '';
  ok('저장은 같은 경로 POST ?part=request + 토큰', /\/api\/parent\/dashboard\?part=request&child_uid=/.test(svb) && /token=/.test(svb) && /method: 'POST'/.test(svb));
  const cat = svb.indexOf('} catch (e) {');
  const catb = cat > 0 ? bodyFrom(svb, cat + 2) : '';
  ok('짝: 실패하면(catch) 원래 값으로 되돌리고 «저장 안 됨» 을 말한다', /sel\.value = _pdReqCur/.test(catb) && /disabled = false/.test(catb) && /저장 안 됨/.test(catb), catb.slice(0, 80));
  ok('취소는 한 번 묻는다', /confirm\(/.test(svb));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
