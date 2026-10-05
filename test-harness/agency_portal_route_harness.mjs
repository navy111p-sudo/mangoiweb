// 🏫 대리점 전용 화면 /agency (2026-10-02) — 지사 화면(branch.html)을 같이 쓰고, 역할마다 착지 화면을 가른다.
// src/index.ts 의 managerPortalRedirect·isAdminPath 를 «오려 내 실제로 실행» 한다(가짜 getScope·getAdminActor).
// 「대리점은 /agency 로」 옆에 「지사는 /branch 그대로」·「본사는 통과」·「강사는 /teacher」를 짝으로 둔다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(resolve(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };

const IDX = rd('cloudflare-deploy/src/index.ts');
function fnBlock(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  // 선언 뒤 «몸통» 여는 중괄호 — 인자 목록·반환 타입 안의 { 는 건너뛴다(괄호·꺾쇠 깊이 0 인 것)
  let par = 0, ang = 0, j = -1;
  for (let k = i + head.length - 1; k < src.length; k++) {
    const c = src[k];
    if (c === '(') par++; else if (c === ')') par--;
    else if (c === '<') ang++; else if (c === '>') ang--;
    else if (c === '{' && par === 0 && ang === 0) { j = k; break; }
  }
  let d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}

console.log('① managerPortalRedirect — 역할별 착지');
const mprSrc = fnBlock(IDX, 'async function managerPortalRedirect(');
ok('함수를 오려 냈다(전제)', mprSrc.length > 500);
const mprJs = stripTypeScriptTypes(mprSrc);
const mk = new Function('getScope', 'getAdminActor', 'PH_MANAGERS', mprJs + '\nreturn managerPortalRedirect;');
async function land(scopeType, path, actor = { ok: true, isTeacher: false, role: 'hq', username: 'x' }) {
  const f = mk(async () => ({ type: scopeType }), async () => actor, []);
  const url = new URL('https://mangoi.ai' + path);
  const r = await f({ url: url.toString() }, url, url.pathname, {});
  return r ? new URL(r.headers.get('Location')).pathname : null;
}
try {
  ok('대리점이 /admin → /agency', await land('agency', '/admin') === '/agency');
  ok('대리점이 /manager → /agency', await land('agency', '/manager') === '/agency');
  ok('대리점이 /branch → /agency', await land('agency', '/branch') === '/agency');
  ok('대리점이 /agency → 그대로(null)', await land('agency', '/agency') === null);
  ok('지사장은 /branch 그대로', await land('branch', '/branch') === null);
  ok('지사장이 /agency → /branch', await land('branch', '/agency') === '/branch');
  ok('지사장이 /manager → /branch (예전 그대로)', await land('branch', '/manager') === '/branch');
  ok('지사본사가 /agency → /manager', await land('franchise', '/agency') === '/manager');
  ok('지사본사는 /manager 그대로', await land('franchise', '/manager') === null);
  ok('본사(hq)는 /agency 를 볼 수 있다', await land('hq', '/agency') === null);
  ok('강사가 /agency → /teacher', await land('none', '/agency', { ok: true, isTeacher: true, role: 'teacher' }) === '/teacher');
  ok('?full=1 탈출구는 그대로', await land('agency', '/admin?full=1') === null);
} catch (e) { ok('실행: ' + e.message, false); }

console.log('② 로그인 게이트 — /agency 는 로그인 필수 + 미인증이면 로그인 화면으로');
const iap = fnBlock(IDX, 'function isAdminPath(');
try {
  const f = new Function(stripTypeScriptTypes(iap) + '\nreturn isAdminPath;')();
  ok('isAdminPath(/agency)', f('/agency', 'GET') === true && f('/agency/', 'GET') === true);
} catch (e) { ok('isAdminPath 실행: ' + e.message, false); }
const redirList = IDX.slice(IDX.indexOf("if (path === '/admin' || path === '/admin/' || path === '/admin.html'\n            || path.startsWith('/admin/')"), IDX.indexOf('const next = encodeURIComponent(path + url.search);'));
ok('미인증 리다이렉트 목록에 /agency', /path === '\/agency'/.test(redirList));
const route = IDX.slice(IDX.indexOf("if (path === '/agency' || path === '/agency/') {"));
ok('/agency 는 branch.html 을 서빙', route.length > 0 && /'\/branch\.html' \+ url\.search/.test(route.slice(0, 400)));

console.log('③ 로그인 뒤 첫 화면(정본 auth-admin.ts home_path)');
const AA = rd('cloudflare-deploy/src/auth-admin.ts');
ok("agency → '/agency'", /rr\.role === 'agency' \? '\/agency'/.test(AA));
ok("branch → '/branch' 그대로", /rr\.role === 'branch' \? '\/branch'/.test(AA));

console.log('④ 화면 — 대리점 말로 바꾸기 (branch.html 블록을 오려 내 가짜 DOM 으로 실행)');
const BR = rd('cloudflare-deploy/public/branch.html');
const blk = (BR.match(/    if \(sc\.type === 'agency'\) \{\n      var _ag = [\s\S]*?\n    \}\n/) || [''])[0];
ok('블록을 오려 냈다(전제)', blk.length > 0);
function fakeEls() {
  return BR.match(/<[^>]*data-agency-ko="[^"]*"[^>]*>/g).map((tag) => {
    const a = {}; tag.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { a[k] = v; });
    return { a, textContent: a['data-ko'], getAttribute: (k) => a[k], setAttribute: (k, v) => { a[k] = v; } };
  });
}
function runBlk(type, en) {
  const els = fakeEls(); const doc = { title: 'Branch · Mangoi', querySelectorAll: () => els };
  new Function('sc', 'document', 'EN', 'T', blk)({ type }, doc, () => en, (e, k) => (en ? e : k));
  return { els, doc };
}
try {
  const n = (BR.match(/data-agency-ko="/g) || []).length;
  ok('바꿀 요소가 7곳(사이드 3·탭 1·묶음머리 1·카드 제목 2)', n === 7);
  const a = runBlk('agency', false);
  ok('대리점(KO): 「가맹점 · 대리점 명부」 → 「내 대리점 정보」', a.els.some((e) => e.textContent === '내 대리점 정보') && !a.els.some((e) => /가맹점/.test(e.textContent)));
  ok('대리점(KO): 정산 제목 → 「우리 대리점 정산」', a.els.some((e) => e.textContent === '우리 대리점 정산'));
  ok('대리점: data-ko 도 바꿔 🌐 를 눌러도 안 되돌아간다', a.els.every((e) => e.getAttribute('data-ko') === e.getAttribute('data-agency-ko')));
  ok('대리점: 탭 제목', a.doc.title === '대리점 · Mangoi');
  const ae = runBlk('agency', true);
  ok('대리점(EN): 「My academy」', ae.els.some((e) => e.textContent === 'My academy'));
  const b = runBlk('branch', false);
  ok('지사는 예전 그대로(가맹점 말)', b.els.some((e) => e.textContent === '가맹점 · 대리점 명부') && b.doc.title === 'Branch · Mangoi');
} catch (e) { ok('화면 블록 실행: ' + e.message, false); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
