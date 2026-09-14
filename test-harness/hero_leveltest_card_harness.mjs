/* ══════════════════════════════════════════════════════════════════════
   🎟️ 홈 «내 레벨테스트» 카드 — 끝난 수업을 붙들지 않는다  (2026-08-07)

   [무슨 일이 있었나] 사장님이 밤에 홈을 여시니 **오늘 18시에 이미 끝난** 레벨테스트가
     「8월 7일(금) 18:00 · 담당 선생님 배정 중」 이라고 그대로 앉아 있었다.
     원인이 둘이었다.
       ① 티켓 경로 — 서버가 close_at_ts(종료+15분) 를 내려주는데 화면이 **안 봤다**.
       ② 회원 경로 — «날짜만» 비교해서(setHours(0,0,0,0)) 오늘 18시 수업이
                      오늘 자정까지 «다가올 수업» 이었다.

   [이 하니스가 하는 일] 문구를 grep 하는 게 아니라, index.html 안의 **그 IIFE 를 통째로
     떼어내 실제로 실행**한다. 가짜 DOM·localStorage·fetch 만 끼워 준다.
     그래야 «고쳤다» 가 아니라 «이 입력에 이 화면이 나온다» 를 말할 수 있다.
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';   // 분해 대응
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
/* 🌐 배포 뒤에는 «라이브가 내려주는 그 HTML» 에 같은 검사를 돌린다.
   저장소가 옳아도 CDN 에 구버전이 남아 있으면 사용자가 보는 화면은 옛것이다.
     HERO_LT_HTML=<내려받은파일> node test-harness/hero_leveltest_card_harness.mjs */
// 분해 대응(2026-08-09): 이 IIFE 는 index.html 에서 /js/idx-leveltest-card.js 로 옮겨갔다.
//   코드는 한 글자도 안 바뀌었지만 «파일 하나» 만 읽으면 못 찾는다.
//   readPageSource 는 그 페이지가 로드하는 스크립트까지 이어붙여 준다.
//   (HERO_LT_HTML 로 내려받은 파일을 직접 지정한 경우는 그 파일만 본다 — CDN 검증용 경로)
const HTML = process.env.HERO_LT_HTML
  ? readFileSync(process.env.HERO_LT_HTML, 'utf8')
  : readPageSource('index.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ' — ' + extra : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
}

/* ── index.html 에서 그 IIFE 만 오려낸다 ─────────────────────────────────
   시작: `var KEY = 'mangoi_lt_ticket';` 을 품은 `(function(){`
   끝  : 그 뒤 첫 `})();`  (이 블록은 중첩 IIFE 가 없다) */
const anchor = HTML.indexOf("var KEY = 'mangoi_lt_ticket';");
if (anchor < 0) { console.log('❌ hero-lt IIFE 를 못 찾음 — 하니스가 낡았다'); process.exit(1); }
const start = HTML.lastIndexOf('(function(){', anchor);
const end = HTML.indexOf('})();', anchor);
if (start < 0 || end < 0) { console.log('❌ IIFE 경계를 못 찾음'); process.exit(1); }
const SRC = HTML.slice(start, end + 5);

/* ── 가짜 브라우저 ─────────────────────────────────────────────────────── */
function node() {
  return { hidden: true, href: '', textContent: '', _cls: new Set(), _attr: {},
    classList: { add(c){ this._o._cls.add(c); }, remove(c){ this._o._cls.delete(c); } },
    setAttribute(k, v){ this._attr[k] = v; } };
}
function makeEl() { const n = node(); n.classList._o = n; return n; }

async function run({ ls, ticket, my }) {
  const el = makeEl(), whenEl = makeEl(), subEl = makeEl();
  const ctx = {
    document: { hidden: false, addEventListener: () => {}, getElementById: (id) => ({ 'hero-lt': el, 'hero-lt-when': whenEl, 'hero-lt-sub': subEl }[id] || null) },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), removeItem: (k) => { delete ls[k]; }, setItem: (k, v) => { ls[k] = v; } },
    URL, URLSearchParams, Date, console, setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {},
    fetch: async (u) => ({ json: async () => (String(u).indexOf('/ticket') >= 0 ? ticket : my) }),
    addEventListener: () => {},
  };
  ctx.window = ctx;
  const fn = new Function(...Object.keys(ctx), SRC);
  fn(...Object.values(ctx));
  await new Promise(r => setImmediate(r));            // fetch .then 체인 소화
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  return { el, whenEl, subEl, sub: subEl.textContent, when: whenEl.textContent };
}

const MIN = 60000, H = 60 * MIN;
const now = Date.now();
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const hm  = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };

const TICKET_LS = { mangoi_lt_ticket: 'https://x.test/t.html?k=15.999.abc' };
const MEMBER_LS = { mangoi_uid: 'lt15', mango_token: 'tok' };
const tk = (o) => ({ ok: true, ticket: Object.assign({ now, status: 'proposed', desired_date: ymd(now), desired_time: '18:00', join_open: false }, o) });

console.log('\n🎟️ 홈 «내 레벨테스트» 카드\n');

console.log('[ ① 🎫 티켓 경로 — 끝난 수업을 붙들지 않는다 ]');
{
  const r = await run({ ls: { ...TICKET_LS }, ticket: tk({ start_ts: now - 3*H, end_ts: now - 3*H + 20*MIN, close_at_ts: now - 2*H, has_result: false }) });
  check('끝났고 결과도 없으면 카드를 내린다 (사장님이 보신 그 화면)', r.el.hidden === true, '보임 · sub=' + r.sub);
  check('«담당 선생님 배정 중» 이 더는 안 남는다', !/배정 중/.test(r.sub), r.sub);
}
{
  const r = await run({ ls: { ...TICKET_LS }, ticket: tk({ status: 'done', start_ts: now - 3*H, end_ts: now - 3*H + 20*MIN, close_at_ts: now - 2*H, has_result: true }) });
  check('결과가 나왔으면 «결과 보기» 로 남긴다', r.el.hidden === false && /결과 보기/.test(r.sub), r.sub);
  check('영어도 같이 바뀐다 (강사·해외 학부모)', r.subEl._attr['data-en'] === 'Test completed — see result →', r.subEl._attr['data-en']);
}
{
  const r = await run({ ls: { ...TICKET_LS }, ticket: tk({ start_ts: now + 2*H, close_at_ts: now + 3*H, has_result: false }) });
  check('아직 안 끝난 수업은 그대로 보인다 (회귀 0)', r.el.hidden === false && /배정 중/.test(r.sub), r.sub);
  check('«몇 분 뒤» 안내도 그대로', /분 뒤/.test(r.sub), r.sub);
}
{
  const r = await run({ ls: { ...TICKET_LS }, ticket: tk({ join_open: true, start_ts: now + 5*MIN, close_at_ts: now + 3*H }) });
  check('입장 창이 열리면 초록 «지금 입장하기» (회귀 0)', r.el._cls.has('is-open') && /지금 입장하기/.test(r.sub), r.sub);
}

console.log('\n[ ② 🙋 회원 경로 — «날짜만» 이 아니라 시각까지 본다 ]');
const app = (o) => Object.assign({ id: 15, status: 'proposed', desired_date: ymd(now), desired_time: '18:00', final_level: null }, o);
{
  // 오늘 18:00 수업인데 지금은 그보다 3시간 뒤 — 예전 코드는 자정까지 «다가올 수업» 이라 했다
  const past = now - 3*H;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ desired_date: ymd(past), desired_time: hm(past) })] } });
  check('오늘 이미 지난 수업은 카드를 내린다', r.el.hidden === true, 'sub=' + r.sub);
}
{
  const soon = now + 2*H;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ desired_date: ymd(soon), desired_time: hm(soon) })] } });
  check('오늘 «앞으로» 있을 수업은 보인다 (회귀 0)', r.el.hidden === false && /배정 중/.test(r.sub), r.sub);
}
{
  // 방금 시작한 수업 — 유예 안에서는 남긴다(늦게 들어가는 사람의 길을 끊지 않는다)
  const justNow = now - 10*MIN;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ desired_date: ymd(justNow), desired_time: hm(justNow) })] } });
  check('방금 시작한 수업은 아직 남긴다 (지각 입장 길을 끊지 않는다)', r.el.hidden === false, 'sub=' + r.sub);
}
{
  const past = now - 5*H;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ status: 'done', desired_date: ymd(past), desired_time: hm(past), final_level: 'B1' })] } });
  check('지난 건이라도 결과가 있으면 «결과 보기» 로 남긴다', r.el.hidden === false && /결과 보기/.test(r.sub), r.sub);
}
{
  const a = now + 5*H, b = now + 2*H;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ id: 1, desired_date: ymd(a), desired_time: hm(a) }), app({ id: 2, desired_date: ymd(b), desired_time: hm(b) })] } });
  check('여러 건이면 «가장 가까운» 것을 고른다', r.when.indexOf(hm(b)) >= 0, r.when);
}
{
  const past = now - 3*H;
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ status: 'cancelled', desired_date: ymd(now + 2*H), desired_time: hm(now + 2*H) }), app({ desired_date: ymd(past), desired_time: hm(past) })] } });
  check('취소된 건은 «다가올 수업» 으로 세지 않는다 (회귀 0)', r.el.hidden === true, 'sub=' + r.sub);
}

{
  // 🤖 (2026-09-14) AI 자가 진단만 돌린 행(source='ai-diagnosis', 날짜 없음) — 신청서가 아니다.
  //    옛 코드는 「일정 협의 중 / 테스트 완료」 로 그려 «신청한 적 없는데 협의 중» 이 됐다(사장님 화면).
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ status: 'pending', desired_date: null, desired_time: null, final_level: 'C2', source: 'ai-diagnosis' })] } });
  check('AI 진단만 한 행은 «AI 진단 완료 · 레벨» 로 사실대로 적는다', r.el.hidden === false && r.when === 'AI 진단 완료 · C2', 'when=' + r.when);
  check('«일정 협의 중» 이라고 말하지 않는다', !/협의 중/.test(r.when) && !/테스트 완료/.test(r.sub), 'when=' + r.when + ' sub=' + r.sub);
  check('영어도 같이 바뀐다', r.whenEl._attr['data-en'] === 'AI diagnosis done · C2' && r.subEl._attr['data-en'] === 'See result →', r.whenEl._attr['data-en']);
}
{
  // 짝: 날짜만 없고 source 가 신청서(폼)면 예전 그대로 — «날짜 없음» 만으로 짐작하지 않는다
  const r = await run({ ls: { ...MEMBER_LS }, my: { ok: true, items: [app({ status: 'done', desired_date: null, desired_time: null, final_level: 'B1', source: 'form' })] } });
  check('신청서 행은 source 가 달라 예전 문구 그대로 (회귀 0)', r.el.hidden === false && /테스트 완료/.test(r.sub) && /협의 중/.test(r.when), 'when=' + r.when + ' sub=' + r.sub);
}

console.log('\n[ ③ 🚫 신청이 없으면 아무 요청도 안 한다 (홈 첫 화면 비용 0) ]');
{
  let called = 0;
  const el = makeEl();
  const ctx = { document: { hidden: false, addEventListener: () => {}, getElementById: () => el }, localStorage: { getItem: () => null, removeItem(){}, setItem(){} },
    URL, URLSearchParams, Date, console, setInterval: () => 0, setTimeout: () => 0, clearInterval: () => {},
    fetch: async () => { called++; return { json: async () => ({}) }; }, addEventListener: () => {} };
  ctx.window = ctx;
  new Function(...Object.keys(ctx), SRC)(...Object.values(ctx));
  await new Promise(r => setImmediate(r));
  check('티켓도 없고 로그인도 아니면 fetch 0회', called === 0, called + '회');
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
