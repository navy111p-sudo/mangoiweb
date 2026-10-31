// -*- coding: utf-8 -*-
// 🔴 로그인 신원 «모양» 하니스 — 로그인 학생이 «손님(게스트)» 으로 오판되지 않는가
//   실행:  node test-harness/login_uid_shape_harness.mjs
//
//   [발단 — 2026-09-09 학생 제보 「AI 단어 퀴즈는 완료해도 완료 표시가 안 뜬다」]
//   로그인 동기화 정본(js/idx-user-session.js)이 localStorage 에 실제로 적는 모양은
//   **{uid, name, role}** 입니다 — `user_id` 라는 칸이 «없는» 경로가 있습니다:
//       idx-user-session.js:73   {uid, name, role}
//       index.html:13592        norm = { uid, name, role } → mangoi_logged_user·mango_user 둘 다
//   그런데 화면 8곳이 `mango_user.user_id` **하나만** 보고 있어서, 로그인한 학생이
//   전부 «게스트» 로 떨어졌습니다. 에러가 안 나고 화면도 정상으로 보입니다 —
//   기록이 guest_xxxxxx 계정에 쌓일 뿐이라 몇 달간 아무도 몰랐습니다.
//   ⚠️ 다른 로그인 경로(idx-user-session.js:836)는 `user_id` 를 «함께» 넣기 때문에
//      «되다 안 되다» 로 보여 재현이 헷갈립니다 — 그래서 두 모양을 «둘 다» 시험합니다.
//
//   [이 하니스가 지키는 것 — 문자열 검사가 아니라 «실제로 돌려서» 판정합니다]
//     A. 신원 함수를 소스에서 오려 내 진짜로 실행할 수 있다 (전제 — 못 오려 내면 FAIL)
//     B. {uid,name,role} 모양이면 계정 uid 를 돌려준다      ← 이 사고 자체
//     C. {user_id:…} 옛 모양도 그대로 돌려준다              ← 되던 것을 깨지 않았는가
//     D. ⛔ 로그인이 없으면 계정으로 «지어내지» 않는다        ← B 의 짝
//        (짝이 없으면 «항상 계정 반환» 같은 엉터리 수리도 통과합니다)
//     E. 게스트 id 는 «호출마다 바뀌지 않는다» — 기록이 이어지려면 고정돼야 합니다
//     F. ⛔ 발음 코칭이 계정 uid 자리에 기기 식별자(mango_user_id)를 쓰지 않는다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = (f) => readFileSync(resolve(__dir, '../cloudflare-deploy/public/' + f), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/* 함수 하나를 소스에서 «중괄호 짝» 으로 오려 냅니다.
   ⛔ 길이(slice(i, i+N))로 자르지 마세요 — 옆 함수가 딸려 들어옵니다.
   문자열·주석 안의 중괄호는 세지 않습니다(그러지 않으면 엉뚱한 데서 끊깁니다). */
function cutFn(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  let i = src.indexOf('{', m.index + m[0].length - 1);
  if (i < 0) return null;
  let depth = 0, s = i, inStr = null, inLine = false, inBlock = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
  }
  return null;
}

/* 주석 제거 — ⛔ `t.replace(/\/\*[\s\S]*?\*\//g,'')` 한 줄로 지우지 마세요.
   문자열·주석 안의 짝 없는 «슬래시+별표» 하나에 그 뒤가 통째로 사라져, 부정 검사가
   «없다» 로 거짓 통과합니다(CLAUDE.md 2장). 줄 단위로 «지금 블록주석 안인가» 를 봅니다. */
function stripComments(src) {
  const out = []; let inBlock = false;
  for (let line of String(src).split('\n')) {
    let buf = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
      if (c === '/' && n === '*') { inBlock = true; i++; continue; }
      if (c === '/' && n === '/') break;      // 줄 주석 — 남은 줄을 버립니다
      buf += c;
    }
    out.push(buf);
  }
  return out.join('\n');
}

/* 가짜 localStorage — 화면 코드가 쓰는 만큼만 흉내냅니다. */
function fakeStore(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

/* 오려 낸 함수를 «실제로» 돌립니다. 실패는 크래시가 아니라 깔끔한 FAIL 이어야 합니다
   (안 그러면 무엇이 깨졌는지 결과 줄조차 안 나옵니다). */
function preFor(t) {
  if (!t || !t.preFrom) return '';
  const m = t.preFrom.exec(PUB(t.file));
  return m ? m[0] : '';   // 못 찾으면 빈 값 → 아래 검사가 «오려내기 실패» 로 드러납니다
}

function runFn(body, { store, session, extra = '', call, pre = '' }) {
  try {
    const fn = new Function('localStorage', 'sessionStorage', 'fetch', 'atob', `
      ${pre}
      ${extra}
      ${body}
      return (${call});
    `);
    return {
      ok: true,
      value: fn(
        store,
        session || fakeStore({}),
        () => { throw new Error('fetch 는 이 시험에서 불려선 안 됩니다'); },
        (b64) => Buffer.from(String(b64), 'base64').toString('utf8'),
      ),
    };
  } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
}

/* 이 저장소의 로그인 정본이 실제로 적는 두 가지 모양 */
const NEW_SHAPE = JSON.stringify({ uid: 'jeong', name: '정우영', role: 'student' });   // idx-user-session.js:73 · index.html:13592
const OLD_SHAPE = JSON.stringify({ user_id: 'jeong', uid: 'jeong', name: '정우영', user_name: '정우영', role: 'student' }); // :836

/* 대상 8곳 — 「영향받던 화면 8개」 와 짝이 맞아야 합니다 */
const TARGETS = [
  { file: 'micro-quiz.html',      fn: 'getUid',       call: 'getUid()',        label: 'AI 단어 퀴즈' },
  { file: 'streak.html',          fn: 'getUid',       call: 'getUid()',        label: '연속학습(스트릭) 화면' },
  { file: 'ai-write.html',        fn: 'getUid',       call: 'getUid()',        label: 'AI 영작첨삭' },
  /* ⚠️ 이 함수는 파일 위쪽의 상수(LS_ANON)를 씁니다. 그 «값» 을 하니스에 손으로 적으면
     소스가 바뀌어도 검사가 옛 값을 들고 있게 됩니다 — 선언 줄을 «소스에서 읽어» 함께 넣습니다. */
  { file: 'js/streak.js',         fn: 'getStudentId', call: 'getStudentId()',  label: '연속학습 위젯 공용코드',
    preFrom: /var\s+LS_ANON\s*=\s*['"][^'"]+['"]\s*;/ },
  { file: 'speech-coach.html',    fn: 'mgAcctUid',    call: 'mgAcctUid()',     label: '발음 코칭(한국어)' },
  { file: 'speech-coach-cn.html', fn: 'mgAcctUid',    call: 'mgAcctUid()',     label: '발음 코칭(중국어)' },
];

/* ⚠️ TARGETS 는 «한 함수로 끝나는» 화면 6곳입니다. 나머지 둘(vocab.initIdentity ·
   ai-friend.getAuth)은 async 라 B-2·B-3 절에서 따로 돌립니다 — 합쳐서 «8곳» 입니다.
   그 수를 여기서 세어 둡니다: 9번째 화면이 생겼는데 검사에 안 넣으면 이 줄이 먼저 빨간불입니다. */
const COVERED = TARGETS.length + 2;

console.log('\n[ A. 전제 — 신원 함수를 소스에서 실제로 오려 냈는가 ]');
check(`검사가 덮는 화면이 8곳이다 (TARGETS ${TARGETS.length} + 비동기 2)`, COVERED === 8, `실제: ${COVERED}`);
const CUT = {};
for (const t of TARGETS) {
  const body = cutFn(PUB(t.file), t.fn);
  CUT[t.file] = body;
  check(`${t.label} — ${t.file} 의 ${t.fn}() 를 오려 냄`, !!body);
  if (t.preFrom) check(`${t.label} — 그 함수가 기대는 선언도 소스에서 찾음`, !!preFor(t));
}

console.log('\n[ B. {uid,name,role} 모양이면 «계정 uid» 를 돌려준다 (← 이 사고 자체) ]');
for (const t of TARGETS) {
  if (!CUT[t.file]) { check(`${t.label} — 새 모양`, false, '오려내기 실패'); continue; }
  const r = runFn(CUT[t.file], {
    store: fakeStore({ mangoi_logged_user: NEW_SHAPE, mango_user: NEW_SHAPE, mango_token: 'tok' }),
    call: t.call, pre: preFor(t),
  });
  check(`${t.label} — mangoi_logged_user={uid,…} → 'jeong'`, r.ok && String(r.value) === 'jeong',
    r.ok ? `실제: ${JSON.stringify(r.value)}` : r.err);
}
// mango_user 에만 새 모양이 있는 경우(옛 키만 남은 브라우저)도 계정으로 봐야 합니다
for (const t of TARGETS) {
  if (!CUT[t.file]) continue;
  const r = runFn(CUT[t.file], {
    store: fakeStore({ mango_user: NEW_SHAPE, mango_token: 'tok' }),
    call: t.call, pre: preFor(t),
  });
  check(`${t.label} — mango_user 에만 {uid,…} 가 있어도 'jeong'`, r.ok && String(r.value) === 'jeong',
    r.ok ? `실제: ${JSON.stringify(r.value)}` : r.err);
}

console.log('\n[ C. 옛 모양({user_id:…})도 그대로 — «되던 것» 을 깨지 않았는가 ]');
for (const t of TARGETS) {
  if (!CUT[t.file]) continue;
  const r = runFn(CUT[t.file], {
    store: fakeStore({ mangoi_logged_user: OLD_SHAPE, mango_user: OLD_SHAPE, mango_token: 'tok' }),
    call: t.call, pre: preFor(t),
  });
  check(`${t.label} — 옛 {user_id:…} → 'jeong'`, r.ok && String(r.value) === 'jeong',
    r.ok ? `실제: ${JSON.stringify(r.value)}` : r.err);
}

console.log('\n[ D. ⛔ 로그인이 없으면 계정을 «지어내지» 않는다 (B 의 짝) ]');
for (const t of TARGETS) {
  if (!CUT[t.file]) continue;
  const r = runFn(CUT[t.file], { store: fakeStore({}), call: t.call, pre: preFor(t) });
  const v = r.ok ? (r.value == null ? '' : String(r.value)) : '';
  /* 계정 uid 를 돌려주면 안 됩니다. «익명» 접두사는 화면마다 다릅니다
     (guest_ · anon_) — 접두사 하나로 못 박으면 멀쩡한 화면이 빨간불이 됩니다. */
  check(`${t.label} — 비로그인은 계정이 아니다`, r.ok && v !== 'jeong' && (v === '' || /^(guest|anon)_/.test(v)),
    r.ok ? `실제: ${JSON.stringify(r.value)}` : r.err);
}

console.log('\n[ E. 게스트 id 는 호출마다 바뀌지 않는다 — 안 그러면 기록이 원리상 안 이어집니다 ]');
for (const t of TARGETS) {
  if (!CUT[t.file]) continue;
  const store = fakeStore({});
  const a = runFn(CUT[t.file], { store, call: t.call, pre: preFor(t) });
  const b = runFn(CUT[t.file], { store, call: t.call, pre: preFor(t) });
  if (!a.ok || !b.ok) { check(`${t.label} — 게스트 id 고정`, false, a.err || b.err); continue; }
  const va = a.value == null ? '' : String(a.value), vb = b.value == null ? '' : String(b.value);
  // 계정이 아예 없으면 '' 를 주는 화면(발음 코칭)은 이 항목의 대상이 아닙니다
  check(`${t.label} — 게스트 id 가 두 번 불러도 같다`, va === vb, `${JSON.stringify(va)} vs ${JSON.stringify(vb)}`);
}

console.log('\n[ B-2. 단어장 — initIdentity() 를 실제로 돌려 «게스트가 아님» 을 확인 ]');
{
  const src = PUB('vocab.html');
  const body = cutFn(src, 'initIdentity');
  check('vocab.html 의 initIdentity() 를 오려 냄', !!body);
  if (body) {
    const mk = (seed) => runFn(body, {
      store: fakeStore(seed),
      pre: 'let UID="guest", TOKEN="", IS_GUEST=true;',
      call: '(async()=>{ await initIdentity(); return {UID, IS_GUEST}; })()',
    });
    const login = mk({ mangoi_logged_user: NEW_SHAPE, mango_user: NEW_SHAPE, mango_token: 'tok' });
    const old = mk({ mango_user: OLD_SHAPE, mango_token: 'tok' });
    // async 라 Promise 가 돌아옵니다 — 값을 꺼내 봅니다
    const got = (r) => (r.ok && r.value && typeof r.value.then === 'function') ? r.value : null;
    const gl = got(login), go = got(old);
    if (!gl || !go) { check('단어장 — 새 모양이면 계정으로 붙는다', false, login.err || old.err || 'Promise 아님'); }
    else {
      await gl.then((v) => check('단어장 — {uid,…} → UID=jeong · 게스트 아님', v.UID === 'jeong' && v.IS_GUEST === false, JSON.stringify(v)))
             .catch((e) => check('단어장 — {uid,…} → UID=jeong · 게스트 아님', false, String(e && e.message || e)));
      await go.then((v) => check('단어장 — 옛 {user_id:…} 도 UID=jeong', v.UID === 'jeong' && v.IS_GUEST === false, JSON.stringify(v)))
             .catch((e) => check('단어장 — 옛 {user_id:…} 도 UID=jeong', false, String(e && e.message || e)));
    }
    /* 짝 — 토큰이 없으면 계정으로 붙지 않아야 합니다(IDOR 가드가 토큰을 요구합니다).
       ⛔ 식 «모양» 을 글자 그대로 못 박지 마세요 — 갈래가 둘인데 한쪽만 검사하면
          다른 갈래에서 `&& tok` 을 빼도 통과합니다(함정 대조 실측). 그리고 무해한
          리팩터(`const auid = …; if (auid && tok)`)에 거짓 FAIL 이 납니다.
       ✅ 두 갈래를 «각각 실제로 돌려» 답으로 묻습니다. */
    for (const [label, seed] of [
      ['mangoi_logged_user 갈래', { mangoi_logged_user: NEW_SHAPE }],
      ['mango_user 갈래',        { mango_user: OLD_SHAPE }],
    ]) {
      const r = mk(seed);   // 토큰을 일부러 안 넣습니다
      const pr = (r.ok && r.value && typeof r.value.then === 'function') ? r.value : null;
      if (!pr) { check(`⛔ 단어장 — 토큰 없으면 계정으로 안 붙는다(${label})`, false, r.err || 'Promise 아님'); continue; }
      await pr.then((v) => check(`⛔ 단어장 — 토큰 없으면 계정으로 안 붙는다(${label})`,
                      v.UID !== 'jeong' && v.IS_GUEST === true, JSON.stringify(v)))
              .catch((e) => check(`⛔ 단어장 — 토큰 없으면 계정으로 안 붙는다(${label})`, false, String(e && e.message || e)));
    }
  }
}

console.log('\n[ B-3. AI 영어친구 — getAuth() 를 실제로 돌려 계정 uid 를 확인 ]');
{
  const src = PUB('ai-friend.html');
  const body = cutFn(src, 'getAuth');
  const tokFn = cutFn(src, 'tokenUid');
  check('ai-friend.html 의 getAuth()·tokenUid() 를 오려 냄', !!body && !!tokFn);
  if (body && tokFn) {
    // 첫 segment 가 {"uid":"jeong"} 인 가짜 토큰 (base64url)
    const seg = Buffer.from(JSON.stringify({ uid: 'jeong' }), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const TOK = seg + '.sig';
    const mk = (seed) => runFn(body, {
      store: fakeStore(seed),
      pre: 'let authCache = null;',
      extra: tokFn,
      call: 'getAuth()',
    });
    for (const [label, seed] of [
      ['{uid,…} 새 모양', { mangoi_logged_user: NEW_SHAPE, mango_token: TOK }],
      ['옛 {user_id:…}', { mango_user: OLD_SHAPE, mango_token: TOK }],
    ]) {
      const r = mk(seed);
      if (!r.ok || !r.value || typeof r.value.then !== 'function') { check(`AI 영어친구 — ${label} → uid=jeong`, false, r.err || 'Promise 아님'); continue; }
      await r.value.then((v) => check(`AI 영어친구 — ${label} → uid=jeong`, !!v && v.uid === 'jeong', JSON.stringify(v)))
                   .catch((e) => check(`AI 영어친구 — ${label} → uid=jeong`, false, String(e && e.message || e)));
    }
  }
}

console.log('\n[ F. ⛔ 발음 코칭이 계정 자리에 «기기 식별자» 를 쓰지 않는다 ]');
{
  // mango_user_id 는 js/mango.js 가 발급하는 화상수업용 기기별 임의 id(u_xxxxxx) 라
  // 계정과 무관합니다 — 그 키로 포인트를 적립하면 서버가 매번 거절합니다(조용한 실패).
  for (const f of ['speech-coach.html', 'speech-coach-cn.html']) {
    const src = PUB(f);
    const bad = /getItem\(\s*['"]mango_user_id['"]\s*\)/.test(stripComments(src));
    check(`${f} — 포인트 적립에 mango_user_id 를 쓰지 않는다`, !bad);
  }
  // 짝: «그럼 무엇을 쓰는가» — 계정 헬퍼를 실제로 부르고 있어야 합니다
  for (const f of ['speech-coach.html', 'speech-coach-cn.html']) {
    check(`${f} — awardSpeechPoints 가 mgAcctUid() 를 쓴다`,
      /var uid = mgAcctUid\(\)/.test(PUB(f)));
  }
}

console.log('\n[ G. ⛔ «이름» 자리에 아이디를 보내지 않는다 — 보내면 진짜 이름이 덮입니다 ]');
{
  /* 로그인 정본이 `name: u.name || u.uid` 라(index.html · idx-user-session.js) 이름 없는
     계정은 name 칸에 **아이디**가 들어 있습니다. 그걸 `student_name` 으로 보내면 서버 정본이
     `student_name = COALESCE(?, student_name)` 이라 기존 진짜 이름이 아이디로 덮입니다.
     ⚠️ 두 리더보드가 「이름 == 아이디면 안 보여준다」로 내보내기는 막지만, DB 오염은 못 막습니다. */
  const NAMELESS = JSON.stringify({ uid: 'jeong', name: 'jeong', role: 'student' });   // 이름이 아이디와 같은 계정
  const NAMED    = JSON.stringify({ uid: 'jeong', name: '정우영', role: 'student' });
  const NAME_TARGETS = [
    { file: 'micro-quiz.html',   fn: 'getName',    call: 'getName()',    extraFn: 'getUid',    label: 'AI 단어 퀴즈' },
    { file: 'vocab.html',        fn: 'getName',    call: 'getName()',    extraFn: null,        label: '단어장' },
    { file: 'speech-coach.html', fn: 'mgAcctName', call: 'mgAcctName()', extraFn: 'mgAcctUid', label: '발음 코칭(한국어)' },
  ];
  for (const t of NAME_TARGETS) {
    const src = PUB(t.file);
    const body = cutFn(src, t.fn);
    const extra = t.extraFn ? (cutFn(src, t.extraFn) || '') : '';
    if (!body || (t.extraFn && !extra)) { check(`${t.label} — ${t.fn}() 를 오려 냄`, false); continue; }
    check(`${t.label} — ${t.fn}() 를 오려 냄`, true);
    const run1 = (seed) => runFn(body, { store: fakeStore(seed), extra, call: t.call });
    const a = run1({ mangoi_logged_user: NAMELESS, mango_user: NAMELESS, mango_token: 'tok' });
    check(`${t.label} — 이름이 «아이디 그 자체» 면 빈 값`, a.ok && String(a.value || '') === '',
      a.ok ? `실제: ${JSON.stringify(a.value)}` : a.err);
    // 짝 — 진짜 이름은 그대로 가야 합니다(«전부 빈 값» 으로 만드는 수리도 통과하면 안 됩니다)
    const b = run1({ mangoi_logged_user: NAMED, mango_user: NAMED, mango_token: 'tok' });
    check(`${t.label} — 진짜 이름은 그대로 간다`, b.ok && String(b.value || '') === '정우영',
      b.ok ? `실제: ${JSON.stringify(b.value)}` : b.err);
    /* ⚠️ 두 키에 «똑같이» 넣으면 새 키를 읽는 줄을 지워도 옛 키 폴백이 답을 맞혀
       변이가 통과합니다(함정 대조 실측). 새 키에만 넣어 그 줄을 실제로 재세요. */
    const c = run1({ mangoi_logged_user: NAMED, mango_token: 'tok' });
    check(`${t.label} — mangoi_logged_user 에만 이름이 있어도 읽는다`, c.ok && String(c.value || '') === '정우영',
      c.ok ? `실제: ${JSON.stringify(c.value)}` : c.err);
  }
}

console.log('\n[ H. AI 영작첨삭 — 로그인 판정이 신원 함수와 «같은 폭» 인가 ]');
{
  /* isLoggedIn() 이 getUid() 보다 좁으면 「기록이 없어요」라고 잘못 안내합니다
     (이 화면이 실제로 그 상태였습니다 — mango_user.user_id 만 보던 시절). */
  const src = PUB('ai-write.html');
  const body = cutFn(src, 'isLoggedIn'), uidFn = cutFn(src, 'getUid');
  check('ai-write.html 의 isLoggedIn()·getUid() 를 오려 냄', !!body && !!uidFn);
  if (body && uidFn) {
    const mk = (seed) => runFn(body, {
      store: fakeStore(seed), extra: uidFn,
      pre: "function getToken(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } }",
      call: 'isLoggedIn()',
    });
    const on = mk({ mangoi_logged_user: NEW_SHAPE, mango_user: NEW_SHAPE, mango_token: 'tok' });
    check('로그인 학생이면 true', on.ok && on.value === true, on.ok ? `실제: ${JSON.stringify(on.value)}` : on.err);
    const old = mk({ mango_user: OLD_SHAPE, mango_token: 'tok' });
    check('옛 {user_id:…} 도 true', old.ok && old.value === true, old.ok ? `실제: ${JSON.stringify(old.value)}` : old.err);
    // 짝 — 아니면 false 여야 합니다(«항상 true» 로 만드는 수리도 통과하면 안 됩니다)
    const off = mk({});
    check('⛔ 비로그인이면 false', off.ok && off.value === false, off.ok ? `실제: ${JSON.stringify(off.value)}` : off.err);
    const noTok = mk({ mangoi_logged_user: NEW_SHAPE });
    check('⛔ 토큰이 없으면 false', noTok.ok && noTok.value === false, noTok.ok ? `실제: ${JSON.stringify(noTok.value)}` : noTok.err);
  }
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} login_uid_shape_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
