#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
 * 🔒 login_token_sync_harness — 「다른 기기에서 로그인되었습니다」 자가 퇴출 방지 (2026-09-22)
 *
 *   무엇을 지키나 —
 *     운영은 SINGLE_SESSION='on' 이라 로그인에 «성공할 때마다» 새 sid 가 발급되고 이전 토큰은
 *     그 자리에서 401 이 된다. 그런데 토큰 칸이 두 벌이다 —
 *       mango_token(홈·학습 화면 전부)  /  mangoi_parent_token(마이 페이지)
 *     서로를 안 갱신하면 «같은 기기·같은 사람» 인데 자기가 자기를 밀어낸다(사장님 제보 lby01).
 *
 *   ⚠️ 문자열 검사로는 못 잡는다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 답이 나오는가» 뿐이다.
 *      그래서 두 구현을 **소스에서 오려 내 가짜 localStorage 로 실제로 돌려** 답을 본다.
 *
 *   ⛔ 「갱신한다」만 검사하면 «전부 갱신»(= 홈에 로그인한 적 없는 기기에 토큰을 만들어
 *      2026-07-30 제보 #3 을 푸는 것)도 통과한다. 반드시 «짝» 으로 본다:
 *        ① 같은 계정이면 갱신한다      ↔  ② 없으면 «만들지» 않는다
 *        ③ 다른 계정이면 안 건드린다   ↔  ④ 대소문자만 달라도 «다른 계정» 이다
 * ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok  = (name, cond, extra) => { if (cond) { pass++; } else { fail++; console.log(`❌ ${name}` + (extra ? ` — ${extra}` : '')); } };

const P_HTML = readFileSync(ROOT + 'cloudflare-deploy/public/parent.html', 'utf8');
const U_JS   = readFileSync(ROOT + 'cloudflare-deploy/public/js/idx-user-session.js', 'utf8');

/* 중괄호 «짝» 으로 함수 몸통을 자른다 — 길이로 자르면 옆 코드가 딸려 온다(CLAUDE.md 2장). */
function cutFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

/* 대입식 함수(window.foo = function(){…})의 몸통을 중괄호 «짝» 으로 자른다.
   ⛔ 「시작 ~ 다음 함수 이름」으로 자르지 말 것 — 그 사이에 든 «옆 함수» 가 딸려 와,
      정작 이 블록의 호출을 지워도 옆 함수의 것이 잡혀 «거짓 통과» 한다(변이 Ⓖ 로 실측). */
function cutAssign(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return '';
}

/* 가짜 localStorage — throw 하는 판까지 만든다(시크릿 창·저장 차단). */
function fakeLS(seed, opts = {}) {
  const box = Object.assign({}, seed);
  return {
    box,
    getItem(k) { if (opts.throwOnGet) throw new Error('blocked'); return Object.prototype.hasOwnProperty.call(box, k) ? box[k] : null; },
    setItem(k, v) { if (opts.throwOnSet) throw new Error('blocked'); box[k] = String(v); },
    removeItem(k) { delete box[k]; },
  };
}

/* 진짜 토큰과 «같은 모양» 으로 만든다 — payload(b64url JSON) + '.' + 서명 */
/* ⚠️ exp 는 «고정값» 이어야 한다 — Date.now() 로 만들면 같은 인자인데 회차마다 문자열이
   달라져 «저장값이 그대로인가» 대조가 흔들린다(실제로 거짓 FAIL 이 났다). */
function tok(uid, sid = 's1') {
  const p = Buffer.from(JSON.stringify({ uid, exp: 4102444800000, sid })).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return p + '.' + 'sig' + sid;
}

// ── ① 전제: 두 구현을 실제로 오려 냈는가 ──────────────────────────────
//    앵커가 어긋나면 아래 검사가 «빈 문자열» 을 보고 조용히 통과한다.
const pdUid  = cutFn(P_HTML, 'pdTokenUid');
const pdSync = cutFn(P_HTML, 'pdSyncHomeToken');
const lmUid  = cutFn(U_JS,   'lmTokenUid');
const lmSync = cutFn(U_JS,   'lmSyncParentToken');
ok('①-1 parent.html 에서 pdTokenUid 를 오려 냈다',        pdUid.length  > 40);
ok('①-2 parent.html 에서 pdSyncHomeToken 을 오려 냈다',   pdSync.length > 40);
ok('①-3 idx-user-session.js 에서 lmTokenUid 를 오려 냈다', lmUid.length  > 40);
ok('①-4 idx-user-session.js 에서 lmSyncParentToken 을 오려 냈다', lmSync.length > 40);

/* 오려 낸 것을 «실제로» 돌린다. 만들기와 «부를 때» 를 모두 try 로 감싼다 —
   변이가 문법을 깨면 하니스 크래시가 아니라 «깔끔한 FAIL» 이 되어야 한다. */
function build(uidSrc, syncSrc, fnName) {
  try {
    const f = new Function('localStorage', 'atob', `${uidSrc}\n${syncSrc}\nreturn ${fnName};`);
    return (ls, newToken) => { try { return f(ls, globalThis.atob)(newToken); } catch (e) { return '__THREW__'; } };
  } catch (e) { return null; }
}
const runPd = build(pdUid, pdSync, 'pdSyncHomeToken');
const runLm = build(lmUid, lmSync, 'lmSyncParentToken');
ok('①-5 두 함수가 실제로 평가된다', !!runPd && !!runLm);

/* 두 구현은 «보는 칸» 만 다르고 규칙은 같아야 한다.
   ⛔ 기대값을 손으로 적지 않는다 — 같은 시나리오를 양쪽에 넣어 «같은 답» 인지 본다. */
const SIDE = [
  { tag: '마이 페이지→홈', key: 'mango_token',         run: () => runPd },
  { tag: '홈→마이 페이지', key: 'mangoi_parent_token', run: () => runLm },
];

for (const s of SIDE) {
  const call = s.run();
  if (!call) { ok(`②~⑤ ${s.tag} 실행 준비`, false, '함수를 못 만들었다'); continue; }

  // ── ② 같은 계정이면 갱신한다 ──
  {
    const ls = fakeLS({ [s.key]: tok('lby01', 'old') });
    const r = call(ls, tok('lby01', 'new'));
    ok(`②-1 ${s.tag}: 같은 계정이면 갱신한다`, r === true, `반환 ${r}`);
    ok(`②-2 ${s.tag}: 실제로 새 토큰이 들어갔다`, ls.box[s.key] === tok('lby01', 'new'));
  }

  // ── ③ 없으면 «만들지» 않는다 (2026-07-30 제보 #3 정책) ──
  {
    const ls = fakeLS({});
    const r = call(ls, tok('lby01', 'new'));
    ok(`③-1 ${s.tag}: 저장된 토큰이 없으면 갱신하지 않는다`, r === false, `반환 ${r}`);
    ok(`③-2 ${s.tag}: 없던 칸을 «만들지» 않는다`, !(s.key in ls.box), `생긴 값 ${ls.box[s.key]}`);
  }

  // ── ④ 다른 계정이면 손대지 않는다 ──
  {
    const ls = fakeLS({ [s.key]: tok('jeong', 'old') });
    const r = call(ls, tok('lby01', 'new'));
    ok(`④-1 ${s.tag}: 다른 계정이면 갱신하지 않는다`, r === false, `반환 ${r}`);
    ok(`④-2 ${s.tag}: 남의 토큰을 덮어쓰지 않는다`, ls.box[s.key] === tok('jeong', 'old'));
  }

  // ── ④-b 대소문자만 달라도 «다른 계정» 이다 (Kim/kim 처럼 실재한다) ──
  {
    const ls = fakeLS({ [s.key]: tok('Lee', 'old') });
    const r = call(ls, tok('lee', 'new'));
    ok(`④-3 ${s.tag}: 대소문자만 다르면 다른 계정으로 본다`, r === false, `반환 ${r}`);
    ok(`④-4 ${s.tag}: 그때 저장값이 그대로다`, ls.box[s.key] === tok('Lee', 'old'));
  }

  // ── ⑤ 모르는 값이면 손대지 않는다 (깨진 토큰·빈 값) ──
  {
    const a = fakeLS({ [s.key]: 'garbage-not-a-token' });
    ok(`⑤-1 ${s.tag}: 저장값이 깨졌으면 갱신하지 않는다`, call(a, tok('lby01')) === false);
    const b = fakeLS({ [s.key]: tok('lby01', 'old') });
    ok(`⑤-2 ${s.tag}: 새 토큰이 깨졌으면 갱신하지 않는다`, call(b, 'garbage') === false);
    ok(`⑤-3 ${s.tag}: 그때 저장값이 그대로다`, b.box[s.key] === tok('lby01', 'old'));
    const c = fakeLS({ [s.key]: tok('lby01', 'old') });
    ok(`⑤-4 ${s.tag}: 새 토큰이 빈 값이면 갱신하지 않는다`, call(c, '') === false);
  }

  // ── ⑤-b 저장소가 막힌 기기에서도 «던지지» 않는다 ──
  {
    const g = fakeLS({ [s.key]: tok('lby01') }, { throwOnGet: true });
    ok(`⑤-5 ${s.tag}: localStorage 읽기가 막혀도 던지지 않는다`, call(g, tok('lby01')) === false);
    const w = fakeLS({ [s.key]: tok('lby01', 'old') }, { throwOnSet: true });
    const r = call(w, tok('lby01', 'new'));
    ok(`⑤-6 ${s.tag}: localStorage 쓰기가 막혀도 던지지 않는다`, r === false || r === true, `반환 ${r}`);
    ok(`⑤-7 ${s.tag}: 그때도 크래시가 아니다`, r !== '__THREW__');
  }
}

// ── ⑥ 두 구현이 «같은 답» 을 내는가 (복제가 어긋나면 한쪽만 조용히 고쳐진다) ──
if (runPd && runLm) {
  const CASES = [
    ['같은 계정', tok('a', 'old'), tok('a', 'new')],
    ['다른 계정', tok('b', 'old'), tok('a', 'new')],
    ['대소문자만 다름', tok('A', 'old'), tok('a', 'new')],
    ['저장값 없음', null, tok('a', 'new')],
    ['저장값 깨짐', 'zzz', tok('a', 'new')],
    ['새 토큰 깨짐', tok('a', 'old'), 'zzz'],
    ['새 토큰 빈 값', tok('a', 'old'), ''],
  ];
  for (const [tag, cur, nt] of CASES) {
    const l1 = fakeLS(cur === null ? {} : { mango_token: cur });
    const l2 = fakeLS(cur === null ? {} : { mangoi_parent_token: cur });
    const r1 = runPd(l1, nt), r2 = runLm(l2, nt);
    ok(`⑥ 두 구현이 같은 답 — ${tag}`, r1 === r2, `parent=${r1} / home=${r2}`);
  }
}

/* ── ⑦ 배선 — «부르는가» 를 위치로 본다 ─────────────────────────────
   「그 글자가 파일에 있는가」로 물으면 주석 한 줄로 통과한다. 주석을 벗긴 사본에서,
   «로그인 성공을 처리하는 그 블록 안» 에 호출이 있는지 본다. */
const stripComments = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const P = stripComments(P_HTML), U = stripComments(U_JS);

{
  const body = cutFn(P, 'pdLogin');
  ok('⑦-1 pdLogin 몸통을 오려 냈다', body.length > 80);
  ok('⑦-2 마이 페이지 로그인 성공 자리에서 홈 토큰을 갱신한다', /pdSyncHomeToken\s*\(\s*d\.token\s*\)/.test(body));
}
{
  const body = cutAssign(P, 'window.pdGo');
  ok('⑦-3 pdGo 몸통을 오려 냈다', body.length > 80);
  ok('⑦-4 «계정 상태 확인» 응답 토큰도 버리지 않는다', /pdSyncHomeToken\s*\(\s*d\.token\s*\)/.test(body));
}
{
  const body = cutFn(U, 'pkStoreLogin');
  ok('⑦-5 pkStoreLogin 몸통을 오려 냈다', body.length > 40);
  ok('⑦-6 패스키 로그인도 마이 페이지 토큰을 갱신한다', /lmSyncParentToken\s*\(\s*d\.token\s*\)/.test(body));
}
{
  const body = cutAssign(U, 'window.doStudentLogin');
  ok('⑦-7 doStudentLogin 블록을 오려 냈다', body.length > 200);
  ok('⑦-8 홈 아이디·비밀번호 로그인이 마이 페이지 토큰을 갱신한다', /lmSyncParentToken\s*\(\s*d\.token\s*\)/.test(body));
}

{
  // 데모 빠른 로그인도 같은 sid 갱신이다 — 검사가 없으면 «넣었다» 가 «검사한다» 로 읽힌다.
  const body = cutAssign(U, 'window.doLogin');
  ok('⑦-9 데모 빠른 로그인 블록을 오려 냈다', body.length > 100);
  ok('⑦-10 데모 빠른 로그인도 마이 페이지 토큰을 갱신한다', /lmSyncParentToken\s*\(\s*d\.token\s*\)/.test(body));
}

/* ── ⑧ 아직 정본을 안 지나는 자리 — FAIL 이 아니라 «이름을 찍어» 둔다 ──────
   이 네 화면도 로그인에 성공하면 sid 가 갱신되어 마이 페이지 토큰을 죽인다.
   반경(로그인 화면이라 빈도가 낮다)과 파일 수를 견주어 «사람이 정할 일» 로 남긴 자리다.
   ⛔ 여기에 이름이 남아 있는 동안에는 「전부 고쳤다」고 적지 말 것. */
const TODO = ['eval.html', 'report.html', 'signup.html', 'ai-friend.html'];
const left = [];
for (const f of TODO) {
  const src = stripComments(readFileSync(ROOT + 'cloudflare-deploy/public/' + f, 'utf8'));
  if (/setItem\(\s*['"]mango_token['"]/.test(src) && !/mangoi_parent_token/.test(src)) left.push(f);
}
console.log(`ℹ️  아직 마이 페이지 토큰을 함께 갱신하지 않는 로그인 화면 ${left.length}곳 — ${left.join(', ') || '없음'} (사람이 정할 일)`);

console.log(`\nlogin_token_sync_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
