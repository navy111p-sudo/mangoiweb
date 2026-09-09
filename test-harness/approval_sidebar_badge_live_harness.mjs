// -*- coding: utf-8 -*-
/*
 * 🧾 사이드바 「결재함」 실시간 배지 + 지연 색 (2026-09-09 A+B)
 *   실행: node test-harness/approval_sidebar_badge_live_harness.mjs
 *   변이시험: APPR_SRC_FILE=<고친 adm-appr-badge.js 사본> IA6_SRC_FILE=<사본> ADM_SRC_FILE=<admin.html 사본> 으로 바꿔 끼워 돌린다.
 *
 * [왜 만들었나]
 *   사장님 「결재가 뜨면 여기 결재카드에 표시가 나게 해줘」(2026-09-09). 코드로 확인한 사실은
 *   «배지는 이미 있는데 세 가지가 빠져 있다» 였다 —
 *     ① 화면을 연 뒤 3초에 «한 번만» 조회 → 열어 둔 사이 도착한 건은 새로고침 전까지 안 뜸
 *     ② 지연은 「자주 쓰는 기능」 칸의 마우스 툴팁에만 → 폰에서는 못 봄
 *     ③ 결재함 <a> 에 data-ko/data-en → EN/KO 를 누르면 i18n 이 textContent 를 갈아끼워 배지 요소가 지워짐
 *   이 셋은 전부 «함수도 값도 있고» 틀린 것은 «언제·무엇을 그리는가» 라 문자열 검사로는 안 잡힌다.
 *   그래서 결재 블록(/js/adm-appr-badge.js — 2026-09-09 첫 화면 예산 때문에 admin.html 인라인에서 분리)을
 *   **통째로 가짜 DOM·가짜 시계·가짜 fetch 로 실제로 돌린다.**
 *
 * [검사가 지키는 계약]
 *   A. 첫 조회는 여전히 3초 뒤(첫 화면과 경쟁 금지) · 그 뒤 POLL_MS(≥60초)마다 · 숨은 탭에서는 안 묻는다 ·
 *      탭 복귀·포커스 때 다시 묻는다 · 새 건이 «늘어난 순간» 만 .fresh 가 잠깐 붙는다(줄어들 때는 아님)
 *   B. 지연(stage_due_at 지남)이 있으면 .late + 「지연 N · N일째」(EN 은 late N · N days) · 없으면 둘 다 없음
 *   C. 판정 apprSummary 는 순수 함수 — origin_created_at 우선(회수 후 다시 올린 건은 원래 날부터), 기한 없음·미래 기한은 지연 아님
 *   D. adm-ia6.js 는 data-ko/data-en 을 <a> 가 아니라 라벨 span 에만 단다(③ 함정) · #ia6-appr-sub 자리가 있다
 *   E. 옛 adm-ia6.js 가 캐시에 남아 #ia6-appr-sub 가 없어도 배지·색은 그려진다(던지지 않는다)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const ADM = readFileSync(process.env.ADM_SRC_FILE || join(PUB, 'admin.html'), 'utf8');
const IA6 = readFileSync(process.env.IA6_SRC_FILE || join(PUB, 'js', 'adm-ia6.js'), 'utf8');
// 2026-09-09: 결재 블록은 admin.html 인라인이 아니라 /js/adm-appr-badge.js(defer) — 첫 화면 예산 때문
const APPR = readFileSync(process.env.APPR_SRC_FILE || join(PUB, 'js', 'adm-appr-badge.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
const ok = (n, c, x) => { if (c) PASS++; else { FAIL++; FAILS.push(n + (x ? ' — ' + x : '')); }
  console.log(`  ${c ? '✅' : '❌'} ${n}${c || !x ? '' : ' — ' + x}`); };

/* ── 블록 = defer 파일 통째로(IIFE 하나) ── */
const BLOCK = APPR;

/* 함수 몸통을 중괄호 짝으로 자른다(TS 반환타입 없음 — 화면 JS) */
function cutFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return '';
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  return '';
}

console.log('\n[ 0 전제 — 블록을 오려 냈는가 ]');
ok('결재 배지 파일(adm-appr-badge.js)을 읽었다 — IIFE 하나', BLOCK.length > 200 && /^\s*\(function\(\)\{/m.test(BLOCK), String(BLOCK.length));
ok('admin.html 이 그 파일을 defer 로 싣고 ?v= 가 있다', /<script src="\/js\/adm-appr-badge\.js\?v=\d+" defer><\/script>/.test(ADM));
ok('⛔ admin.html 에 결재 블록 인라인 사본이 남아 있지 않다 (두 벌이 되면 조회가 두 번 나간다)',
  !/paintSidebar\(s\)/.test(ADM) && !/apprSummary\(/.test(ADM));
const fnSummary = cutFn(BLOCK, 'apprSummary');
const fnSub = cutFn(BLOCK, 'apprSubText');
ok('apprSummary 를 오려 냈다', fnSummary.length > 0);
ok('apprSubText 를 오려 냈다', fnSub.length > 0);

/* ── C. 순수 함수 판정 ── */
console.log('\n[ C 판정 함수 — 실제로 돌린다 ]');
const DAY = 86400000, NOW = 1_800_000_000_000;
// apprSummary 는 바깥 상수 DAY_MS 를 읽는다 — 손으로 다시 적지 않고 «블록에서 읽어» 앞에 붙인다(값이 바뀌면 검사도 따라온다)
const mDay = BLOCK.match(/var DAY_MS\s*=\s*(\d+)\s*;/);
ok('DAY_MS 선언을 블록에서 읽었다(=86400000)', !!mDay && Number(mDay[1]) === 86400000, mDay ? mDay[1] : 'none');
const DAY_DECL = mDay ? mDay[0] + '\n' : 'var DAY_MS = 86400000;\n';
const apprSummary = fnSummary ? new Function(DAY_DECL + fnSummary + '\nreturn apprSummary;')() : null;
const apprSubText = fnSub ? new Function(fnSub + '\nreturn apprSubText;')() : null;
if (apprSummary && apprSubText) {
  const s0 = apprSummary([], NOW);
  ok('빈 inbox → n 0 · late 0 · days 0', s0.n === 0 && s0.late === 0 && s0.days === 0, JSON.stringify(s0));
  const s1 = apprSummary([{ stage_due_at: NOW + DAY, created_at: NOW - 2 * DAY }], NOW);
  ok('기한이 미래면 지연이 아니다', s1.late === 0 && s1.n === 1, JSON.stringify(s1));
  const s2 = apprSummary([{ stage_due_at: null, created_at: NOW - 9 * DAY }], NOW);
  ok('기한이 없으면 지연이 아니다 (며칠째는 센다)', s2.late === 0 && s2.days === 9, JSON.stringify(s2));
  const s3 = apprSummary([
    { stage_due_at: NOW - 1000, created_at: NOW - 3 * DAY },
    { stage_due_at: NOW + DAY, created_at: NOW - DAY },
    { stage_due_at: NOW - DAY, created_at: NOW - 5 * DAY - 1 },
  ], NOW);
  ok('지연 2건 · 가장 오래된 건 5일째', s3.n === 3 && s3.late === 2 && s3.days === 5, JSON.stringify(s3));
  const s4 = apprSummary([{ stage_due_at: NOW - 1, created_at: NOW - DAY, origin_created_at: NOW - 6 * DAY }], NOW);
  ok('회수 후 다시 올린 건은 origin_created_at(원래 날)부터 센다', s4.days === 6, JSON.stringify(s4));
  const s5 = apprSummary(null, NOW);
  ok('inbox 가 배열이 아니어도 던지지 않는다', s5.n === 0);
  ok('지연 0 → 부제 없음', apprSubText({ n: 3, late: 0, days: 4 }, false) === '');
  ok('KO: 지연 1 · 3일째', apprSubText({ n: 3, late: 1, days: 3 }, false) === '· 지연 1 · 3일째', apprSubText({ n: 3, late: 1, days: 3 }, false));
  ok('KO: 오늘 올라온 지연(0일)은 «오늘»', /오늘/.test(apprSubText({ n: 1, late: 1, days: 0 }, false)));
  ok('EN: late 2 · 1 day', apprSubText({ n: 2, late: 2, days: 1 }, true) === '· late 2 · 1 day', apprSubText({ n: 2, late: 2, days: 1 }, true));
  ok('EN: 복수형 days', /3 days$/.test(apprSubText({ n: 2, late: 1, days: 3 }, true)));
}

/* ── 가짜 브라우저 ── */
function makeEl(tag) {
  const el = {
    tagName: tag, id: '', className: '', textContent: '', title: '', style: { cssText: '', display: '' },
    children: [], _cls: new Set(),
    classList: {
      add: (t) => { el._cls.add(t); }, remove: (t) => { el._cls.delete(t); },
      contains: (t) => el._cls.has(t),
      toggle: (t, force) => { const on = force === undefined ? !el._cls.has(t) : !!force; if (on) el._cls.add(t); else el._cls.delete(t); return on; },
    },
    appendChild: (c) => { el.children.push(c); return c; },
    querySelector: (sel) => el.children.find((c) => sel.startsWith('.') && String(c.className).split(/\s+/).includes(sel.slice(1))) || null,
  };
  return el;
}
function makeWorld(opts) {
  const o = Object.assign({ withSub: true, withQuick: true }, opts || {});
  const row = makeEl('A'); row.id = 'ia6-appr';
  const n = makeEl('SPAN'); n.id = 'ia6-appr-n';
  const sub = o.withSub ? makeEl('SPAN') : null; if (sub) sub.id = 'ia6-appr-sub';
  const quick = o.withQuick ? makeEl('DIV') : null;
  const byId = { 'ia6-appr': row, 'ia6-appr-n': n }; if (sub) byId['ia6-appr-sub'] = sub;
  const docListeners = {}, winListeners = {};
  const document = {
    hidden: false,
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => (/data-qa="결재함"/.test(sel) ? quick : null),
    createElement: (t) => makeEl(t),
    addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  };
  const window = { adminLang: 'ko', addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); } };
  const timers = [];
  const setTimeout_ = (fn, ms) => { timers.push({ fn, ms, once: true }); return timers.length; };
  const setInterval_ = (fn, ms) => { timers.push({ fn, ms, once: false }); return timers.length; };
  const clearInterval_ = (id) => { if (timers[id - 1]) timers[id - 1].dead = true; };
  let T = NOW;
  const Date_ = { now: () => T };
  let payload = { ok: true, inbox: [] }, fetches = 0, fetchFail = false;
  const fetch_ = () => { fetches++; return Promise.resolve(fetchFail
    ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => payload }); };
  const run = new Function('document', 'window', 'fetch', 'setTimeout', 'setInterval', 'clearInterval', 'Date', BLOCK);
  run(document, window, fetch_, setTimeout_, setInterval_, clearInterval_, Date_);
  const tick = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
  const fire = async (ms) => { for (const t of timers) if (!t.dead && t.ms === ms) { if (t.once) t.dead = true; t.fn(); } await tick(); };
  return {
    row, n, sub, quick, timers, document, window, docListeners, winListeners,
    setPayload: (p) => { payload = p; }, setFail: (b) => { fetchFail = b; }, fetches: () => fetches,
    advance: (ms) => { T += ms; }, now: () => T, fire, tick,
    hasTimer: (ms, once) => timers.some((t) => t.ms === ms && (once === undefined || t.once === once)),
  };
}

const POLL = (BLOCK.match(/var POLL_MS\s*=\s*(\d+)/) || [])[1];

console.log('\n[ A 실시간 갱신 — 블록을 가짜 DOM 에서 돌린다 ]');
{
  const w = makeWorld();
  ok('첫 조회는 3초 뒤(첫 화면과 경쟁 금지) 그대로', w.hasTimer(3000, true));
  ok('주기 조회가 있고 60초 이상이다 (POLL_MS)', POLL && Number(POLL) >= 60000 && w.hasTimer(Number(POLL), false), String(POLL));
  ok('탭 복귀(visibilitychange)를 듣는다', (w.docListeners.visibilitychange || []).length === 1);
  ok('창 포커스를 듣는다', (w.winListeners.focus || []).length === 1);

  // 첫 조회: 대기 0건
  await w.fire(3000);
  ok('첫 조회가 나갔다', w.fetches() === 1, String(w.fetches()));
  ok('0건 → 배지 비어 있음 · 켜짐 아님 · 지연 아님', w.n.textContent === '' && !w.row.classList.contains('on') && !w.row.classList.contains('late'));
  ok('0건 → 새 도착 표시(.fresh)가 붙지 않는다 (첫 조회는 도착이 아니다)', !w.row.classList.contains('fresh'));

  // 60초 뒤: 새 결재 2건 도착(그중 1건 지연, 3일째)
  w.setPayload({ ok: true, inbox: [
    { id: 1, stage_due_at: w.now() - 1000, created_at: w.now() - 3 * DAY },
    { id: 2, stage_due_at: w.now() + DAY, created_at: w.now() - 1000 },
  ] });
  w.advance(Number(POLL) || 60000);
  await w.fire(Number(POLL) || 60000);
  ok('주기 조회가 새로고침 없이 다시 물었다', w.fetches() === 2, String(w.fetches()));
  ok('배지가 2 로 바뀌었다', w.n.textContent === '2', w.n.textContent);
  ok('켜졌다(.on)', w.row.classList.contains('on'));
  ok('B: 지연이 있으면 .late', w.row.classList.contains('late'));
  ok('B: 부제 「· 지연 1 · 3일째」', w.sub.textContent === '· 지연 1 · 3일째', w.sub.textContent);
  ok('A: 늘어난 순간 .fresh 가 붙고 1.5초 타이머가 있다', w.row.classList.contains('fresh') && w.hasTimer(1500, true));
  await w.fire(1500);
  ok('1.5초 뒤 .fresh 가 걷힌다 (반복 깜빡임 없음)', !w.row.classList.contains('fresh'));
  ok('「자주 쓰는 기능」 칸에도 숫자 2 · 툴팁에 지연 1건', w.quick && w.quick.querySelector('.mi-appr-n') &&
     w.quick.querySelector('.mi-appr-n').textContent === '2' && /지연 1/.test(w.quick.querySelector('.mi-appr-n').title));

  // EN 토글 → 4초 되입힘에서 영어 부제
  w.window.adminLang = 'en';
  await w.fire(4000);
  ok('EN 이면 부제도 영어 「· late 1 · 3 days」', w.sub.textContent === '· late 1 · 3 days', w.sub.textContent);
  w.window.adminLang = 'ko';

  // 숨은 탭에서는 묻지 않는다
  w.document.hidden = true; w.advance(Number(POLL) || 60000);
  await w.fire(Number(POLL) || 60000);
  ok('숨은 탭에서는 주기 조회를 건너뛴다', w.fetches() === 2, String(w.fetches()));
  // 돌아오면 바로 한 번
  w.document.hidden = false; w.advance(6000);
  for (const fn of (w.docListeners.visibilitychange || [])) fn();
  await w.tick();
  ok('탭으로 돌아오면 곧바로 한 번 묻는다', w.fetches() === 3, String(w.fetches()));
  // 5초 안 중복은 합친다
  for (const fn of (w.winListeners.focus || [])) fn();
  await w.tick();
  ok('5초 안의 포커스 중복 호출은 한 번으로 합친다', w.fetches() === 3, String(w.fetches()));
  w.advance(6000);
  for (const fn of (w.winListeners.focus || [])) fn();
  await w.tick();
  ok('5초가 지나면 포커스에도 다시 묻는다', w.fetches() === 4, String(w.fetches()));

  // 줄어들 때(처리됨)는 .fresh 가 안 붙고, 지연이 사라지면 .late 도 사라진다
  w.setPayload({ ok: true, inbox: [{ id: 2, stage_due_at: w.now() + DAY, created_at: w.now() - 1000 }] });
  w.advance(Number(POLL) || 60000);
  await w.fire(Number(POLL) || 60000);
  ok('건수가 줄면 .fresh 가 붙지 않는다', !w.row.classList.contains('fresh'));
  ok('지연이 사라지면 .late 도 걷히고 부제도 빈다', !w.row.classList.contains('late') && w.sub.textContent === '' && w.n.textContent === '1', w.sub.textContent);

  // 조회 실패 → 마지막 값 유지(거짓 0건으로 지우지 않는다)
  w.setFail(true); w.advance(Number(POLL) || 60000);
  await w.fire(Number(POLL) || 60000);
  ok('조회가 실패하면 마지막 값을 그대로 둔다 (0건으로 지우지 않는다)', w.n.textContent === '1' && w.row.classList.contains('on'));
}

console.log('\n[ E 옛 adm-ia6.js 가 캐시에 남아 부제 자리가 없어도 ]');
{
  const w = makeWorld({ withSub: false, withQuick: false });
  w.setPayload({ ok: true, inbox: [{ id: 1, stage_due_at: w.now() - 1, created_at: w.now() - DAY }] });
  let threw = false;
  try { await w.fire(3000); } catch (e) { threw = true; }
  ok('#ia6-appr-sub 가 없어도 던지지 않는다', !threw);
  ok('배지·켜짐·지연 색은 그대로 그려진다', w.n.textContent === '1' && w.row.classList.contains('on') && w.row.classList.contains('late'));
  ok('「자주 쓰는 기능」 표가 없어도 500ms 재시도만 걸고 넘어간다', w.hasTimer(500, false));
}

console.log('\n[ D adm-ia6.js — i18n 이 배지를 지우지 않게 ]');
{
  const blk = (IA6.match(/var appr = document\.createElement[\s\S]{0,1600}?frag\.appendChild\(appr\);/) || [''])[0];
  ok('결재함 줄을 만드는 구간을 찾았다', blk.length > 0);
  ok('⛔ <a> 에 data-ko/data-en 을 달지 않는다 (i18n 이 textContent 를 갈아끼워 배지가 사라진다)',
    !/appr\.setAttribute\('data-(ko|en)'/.test(blk));
  ok('라벨 span 에만 data-ko/data-en 이 있다',
    /<span class="ia6-appr-l" data-ko="결재함" data-en="Approvals">/.test(blk));
  ok('부제 자리 #ia6-appr-sub 가 있다', /id="ia6-appr-sub"/.test(blk));
  ok('배지 #ia6-appr-n 은 그대로 있다', /id="ia6-appr-n"/.test(blk));
  ok('라벨 span 이 .ia6-appr-t 안에 있다 (부제와 한 줄)', /class="ia6-appr-t">\s*'\s*\+\s*'<span class="ia6-appr-l"/.test(blk) || /ia6-appr-t"><span class="ia6-appr-l"/.test(blk.replace(/'\s*\+\s*'/g, '')));
  ok('adm-ia6.js 를 고쳤으면 ?v= 도 올렸다 (57 이상)', Number((ADM.match(/adm-ia6\.js\?v=(\d+)/) || [])[1]) >= 57);
}

console.log('\n[ B-CSS 지연 색 · 새 도착 표시 — 색만 ]');
{
  const css = (ADM.match(/<style id="ia6-appr-css">[\s\S]*?<\/style>/) || [''])[0];
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  ok('.late 규칙이 있다 (테두리·글자 빨강)', /#ia6-appr\.late\{[^}]*#b42318/.test(code));
  ok('.late.on 은 배경까지 빨강', /#ia6-appr\.late\.on\{[^}]*background:#b42318/.test(code));
  ok('.late.on 의 배지 글자도 빨강(흰 배지 위)', /#ia6-appr\.late\.on \.ia6-appr-n\{[^}]*color:#b42318/.test(code));
  ok('.fresh 는 outline(색)만 — transform 없음', /#ia6-appr\.fresh\{[^}]*outline/.test(code) && !/transform/.test(code));
  ok('부제가 비면 자리를 차지하지 않는다', /\.ia6-appr-sub:empty\{display:none\}/.test(code));
  ok('한 줄 유지 (nowrap + ellipsis)', /\.ia6-appr-t\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis/.test(code));
}

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
