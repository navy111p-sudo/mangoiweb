// vc_handover_inclass_harness.mjs — 수업 중 «🤝 인수인계» (2026-10-18, 개선안 3순위 ⑧)
//
// 무엇을 지키나
//   ① index.html 이 js/idx-vc-handover.js 를 «defer» 로 싣는다(blocking 이면 첫 화면 예산을 먹는다)
//   ② 정본 vchLines 가 teacher.html 의 handoverHtml 과 «같은 말» 을 한다 — 두 함수를 실제로 돌려 대조
//   ③ pickHandover 는 방 번호 «완전일치» 로만 고르고, 모양이 다르면 undefined(«모름»)
//   ④ 서버 글자를 innerHTML 로 넣지 않는다 · 상주 타이머/MutationObserver 가 없다 · r.ok 를 본다
//   ⑤ 강사가 아니면 포털을 부르지 않는다(짝: 강사면 부른다) — 파일을 가짜 DOM 에서 «실제로» 돌린다
// 브라우저 검사: PW_DIR=/tmp/pw node test-harness/manual/vc-handover-browser.mjs (사람이 부릅니다)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = readFileSync(join(PUB, 'js', 'idx-vc-handover.js'), 'utf8');
const IDX = readFileSync(join(PUB, 'index.html'), 'utf8');
const TEA = readFileSync(join(PUB, 'teacher.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ FAIL ' + m + (x ? '\n       · ' + x : ''))); };

/* 주석을 벗긴 사본(부정 검사용) — 줄주석·블록주석, 문자열 안은 건드리지 않음 */
function stripComments(t) {
  let o = '', i = 0, q = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (q) { o += c; if (c === '\\') { o += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; o += c; i++; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    o += c; i++;
  }
  return o;
}
const CODE = stripComments(SRC);
ok(CODE.length > SRC.length * 0.3, '전제: 주석 벗기기가 파일을 통째로 먹지 않았다', CODE.length + '/' + SRC.length);

console.log('\n① index.html 배선');
const tag = IDX.match(/<script[^>]*src="\/js\/idx-vc-handover\.js\?v=\d+"[^>]*><\/script>/);
ok(!!tag, 'index.html 이 이 파일을 ?v= 와 함께 싣는다');
ok(!!tag && /\bdefer\b/.test(tag[0]), '«defer» 로 싣는다(첫 화면을 막지 않는다)', tag && tag[0]);
ok(/id='vcq-panel'|id="vcq-panel"|panel\.id='vcq-panel'/.test(IDX) && /fab\.id='vcq-fab'/.test(IDX), '전제: 얹을 자리(💡 AI 질문 버튼·패널)가 index.html 에 실재한다');

console.log('\n② 가짜 DOM 에서 파일을 실제로 돌린다');
function makeEnv({ teacher, room, inCall }) {
  const listeners = { win: {}, doc: {} };
  const fetches = [];
  const el = (id) => ({ id, classList: { contains: () => false }, querySelector: () => null, appendChild() {}, setAttribute() {} });
  const document = {
    body: { classList: { contains: (c) => c === 'vc-in-call' && inCall } },
    head: { appendChild() {} }, documentElement: { appendChild() {} },
    getElementById: () => null, createElement: (t) => ({ tagName: t, style: {}, appendChild() {}, setAttribute() {} }),
    createTextNode: (t) => ({ t }), querySelector: () => null,
    addEventListener: (k, f) => { (listeners.doc[k] = listeners.doc[k] || []).push(f); },
  };
  const timers = [];
  let tid = 0;
  const window = {
    getLang: () => 'ko',
    vcIsTeacherRole: () => teacher,
    showView: function (id) { return 'sv:' + id; },
    addEventListener: (k, f) => { (listeners.win[k] = listeners.win[k] || []).push(f); },
  };
  const ctx = {
    window, document, console: { warn() {}, log() {} },
    fetch: (u, o) => { fetches.push({ u, o }); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, classes: [] }) }); },
    // 진짜 브라우저처럼 clearTimeout 이 실제로 지웁니다(no-op 이면 두 갈래가 생겨 «끝이 있다» 검사가 헛돕니다).
    setTimeout: (f, ms) => { const id = ++tid; timers.push({ id, f }); return id; },
    clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    vcRoomId: room,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { ctx, window, fetches, timers, listeners };
}
let E;
try { E = makeEnv({ teacher: true, room: 'class-1-20261018', inCall: false }); } catch (e) { E = null; ok(false, '파일을 가짜 DOM 에서 실행했다', String(e && e.stack || e).slice(0, 300)); }
if (E) {
  ok(typeof E.window.__vchLines === 'function' && typeof E.window.__vchPick === 'function', '정본 함수가 드러나 있다(__vchLines·__vchPick)');
  const r = E.window.showView('view-videocall-call');
  ok(r === 'sv:view-videocall-call', 'showView 를 감싸도 원래 값을 그대로 돌려준다', String(r));
  // 감싼 뒤 1.5초짜리 확인이 걸렸다 → 그것을 돌린다(inCall=false 지만 처음 세 번은 기다린다)
  const before = E.fetches.length;
  for (let i = 0; i < 3 && E.timers.length; i++) E.timers.shift().f();
  ok(E.fetches.length === before + 1 && /\/api\/teacher\/portal$/.test(E.fetches[before]?.u || ''), '강사 + 예약 방이면 포털을 «한 번» 묻는다', JSON.stringify(E.fetches));
  ok(E.fetches[0] && E.fetches[0].o && E.fetches[0].o.credentials === 'same-origin', '쿠키를 싣고 묻는다(credentials:same-origin) — 화면은 uid 를 안 보낸다');
  ok(!/uid|student/i.test(E.fetches[0]?.u || ''), '주소에 학생 uid 를 싣지 않는다', E.fetches[0]?.u);
}
// 짝: 학생이면 안 묻는다
let S2;
try { S2 = makeEnv({ teacher: false, room: 'class-1-20261018', inCall: true }); } catch (e) { S2 = null; }
if (S2) {
  S2.window.showView('view-videocall-call');
  for (let i = 0; i < 25 && S2.timers.length; i++) S2.timers.shift().f();
  ok(S2.fetches.length === 0, '학생이면 포털을 묻지 않는다(짝)', 'fetch=' + S2.fetches.length);
  ok(S2.timers.length === 0, '확인은 «끝이 있다» — 20번 뒤 멈춘다(상주 타이머 아님)', 'left=' + S2.timers.length);
}
// 짝: 연습방이면 안 묻는다
let S3;
try { S3 = makeEnv({ teacher: true, room: 'demo-1', inCall: true }); } catch (e) { S3 = null; }
if (S3) {
  S3.window.showView('view-videocall-call');
  for (let i = 0; i < 25 && S3.timers.length; i++) S3.timers.shift().f();
  ok(S3.fetches.length === 0, '연습방(demo-)에는 묻지 않는다', 'fetch=' + S3.fetches.length);
}

console.log('\n③ pickHandover — 완전일치·모름');
if (E) {
  const P = E.window.__vchPick;
  const H = { goal: { text: 'g' } };
  ok(P({ classes: [{ kind: 'class', room_id: 'class-1-20261018', handover: H }] }, 'class-1-20261018') === H, '같은 방이면 그 인수인계');
  ok(P({ classes: [{ kind: 'class', room_id: 'class-10-20261018', handover: H }] }, 'class-1-20261018') === null, '앞가리 방 번호(class-10…)는 안 고른다(완전일치)');
  ok(P({ classes: [{ kind: 'c24', room_id: 'class-1-20261018', handover: H }] }, 'class-1-20261018') === null, 'kind 가 class 가 아니면 안 고른다');
  // 지정 회의방(meet-…)은 날짜 꼬리가 없어 «앞이 같은» 번호가 실재할 수 있습니다 — 양쪽 방향 다 안 고릅니다.
  ok(P({ classes: [{ kind: 'class', room_id: 'meet-12345', handover: H }] }, 'meet-1234') === null, '내 방 번호로 «시작하는» 남의 방(meet-12345)은 안 고른다');
  ok(P({ classes: [{ kind: 'class', room_id: 'meet-1234', handover: H }] }, 'meet-12345') === null, '남의 방 번호로 «시작하는» 내 방도 안 고른다(짝)');
  ok(P({ items: [] }, 'x') === undefined, '모양이 다르면 undefined(«모름» — 0건으로 위장하지 않음)');
  ok(P({ classes: [{ kind: 'class', room_id: 'r', handover: null }] }, 'r') === null, '그 방에 인수인계가 없으면 null');
}

console.log('\n④ teacher.html handoverHtml 과 같은 말을 하는가');
function sliceFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), depth = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) break; } }
  return src.slice(i, k + 1);
}
const hHtml = sliceFn(TEA, 'handoverHtml');
ok(hHtml.length > 200, '전제: teacher.html 에서 handoverHtml 을 오려 냈다', String(hHtml.length));
const strip = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const CASES = [
  { goal: { text: 'Use past tense', date: '2026-10-16', from: 'teacher_note', lang: 'en' }, fix: { total: 4, practiced: 1, unfixed: [{ from: 'I go', to: 'I went' }, { from: 'She have', to: 'She has' }], unfixed_n: 2 } },
  { goal: { text: '과거형 쓰기', date: null, from: 'lesson_report', lang: 'ko' }, fix: { total: 3, practiced: 0, unfixed: [{ from: 'a', to: 'b' }], unfixed_n: 5 } },
  { goal: null, fix: { total: 2, practiced: 2, unfixed: [], unfixed_n: 0 }, story: { n: 2, fixes: 1, last: 'He went home.', last_was: 'He go home.', date: '2026-10-17' } },
  { goal: null, fix: null },
  { goal: null, fix: { total: 0, practiced: 0, unfixed: [], unfixed_n: 0 } },
];
if (E && hHtml) {
  for (const en of [false, true]) {
    const T = (e, k) => (en ? e : k);
    let teacherFn;
    try { teacherFn = new Function('esc', 'T', 'EN', hHtml + '\nreturn handoverHtml;')((s) => String(s), T, () => en); }
    catch (e) { ok(false, 'handoverHtml 을 실행할 수 있다', String(e).slice(0, 200)); continue; }
    CASES.forEach((h, n) => {
      const t = strip(teacherFn({ handover: h }));
      const L = E.window.__vchLines(h, en);
      if (!t) { ok(L.length === 0, `[${en ? 'EN' : 'KO'}] 사례 ${n}: 강사 페이지가 안 그리면 수업 화면도 안 그린다`, JSON.stringify(L)); return; }
      const missing = [];
      for (const l of L) {
        if (!t.includes(l.label)) missing.push('label:' + l.label);
        // 강사 페이지는 «아직 연습 안 한 문장» 첫 줄만 보여 준다 — 그 첫 줄의 글자는 같아야 한다
        if (l.ico !== '🔁' || l === L.find((x) => x.ico === '🔁')) {
          if (l.text && !t.includes(l.text)) missing.push('text:' + l.text);
          if (l.was && !t.includes(l.was)) missing.push('was:' + l.was);
        }
      }
      ok(L.length > 0 && missing.length === 0, `[${en ? 'EN' : 'KO'}] 사례 ${n}: 같은 문구·같은 내용`, missing.join(' / ') + ' ‖ ' + t);
    });
  }
}

console.log('\n⑤ 안전 규칙(주석을 벗긴 사본으로)');
ok(!/\.(?:innerHTML|outerHTML)\s*\+?=/.test(CODE) && !/insertAdjacentHTML/.test(CODE), '서버 글자를 innerHTML 로 넣지 않는다(textContent 만)');
ok(!/setInterval\s*\(/.test(CODE), '상주 setInterval 이 없다');
ok(!/MutationObserver/.test(CODE), 'MutationObserver 가 없다(홈을 멎게 한 전력)');
ok(/if\s*\(\s*!r\.ok\s*\)/.test(CODE), 'fetch 의 r.ok 를 따로 본다(403·500 은 reject 가 아님)');
ok(/addEventListener\('mangoi:lang-changed'/.test(CODE) && /w\.addEventListener\('mangoi:lang-changed'/.test(CODE) && /d\.addEventListener\('mangoi:lang-changed'/.test(CODE), '🌐 언어 이벤트를 window·document 둘 다 듣는다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
