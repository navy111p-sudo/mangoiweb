#!/usr/bin/env node
/**
 * 🌙🌒 매니저 「🚪 오늘 수업」 — 시간대 거르기
 *      (2026-09-08 「23시 이후」 · 2026-09-09 「야간 — 자정 이후 포함」 사장님 요청)
 *
 * 왜 만들었나
 *   늦은 밤 수업만 따로 보고 싶다는 요청. 이 목록은 하루 160건 안팎이라 눈으로는 못 찾는다.
 *   그리고 「23시 이후」만으로는 **자정을 넘긴 수업이 통째로 빠졌다** — 이 목록은 하루치라
 *   그 줄이 «맨 앞»(00:00~)에 있기 때문이다. 그래서 하루의 «양 끝» 을 함께 보는 「야간」을 더했다.
 *
 * ⚠️ 이런 변경에서 틀릴 수 있는 것은 «무엇이 남는가» 하나뿐이고, 그것은 문자열 검사가
 *    원리상 못 본다(함수도 값도 전부 «있다» 로 통과한다 — CLAUDE.md 2장 반복 교훈).
 *    그래서 화면 파일을 **가짜 DOM 에 올려 실제로 render() 를 돌려** 표를 세어 본다.
 *
 * 이 하니스가 지키는 것
 *   ① 선택칸이 화면에 있고 세 갈래(전체·23시 이후·야간)를 KO/EN 라벨과 함께 갖는다
 *   ② 문턱(23·6)은 **한 곳**이 정본이다 — 화면 HTML 에 판정을 복제하지 않는다
 *   ③ 「23시 이후」 경계를 실제로 돌려 본다: 22:59 제외 · 23:00 포함 · 23:59 포함 · 00:10 제외
 *   ③-N 「야간」 경계도: 00:00·00:10·05:59 포함 · 06:00 제외 · 22:59 제외 · 23:00~ 포함
 *   ④ **끄면 전부 돌아온다** — «남긴다» 검사만 두면 «전부 숨기기» 도 통과한다(짝으로 둔다)
 *   ⑤ 다른 거르개(검색·출처)와 함께 걸린다
 *   ⑥ 0건일 때 «왜» 를 말한다 — 고른 시간대와 전체 건수를 함께
 *   ⑦ 시작 시각을 모르는 줄을 밤으로도 **새벽으로도** 세지 않는다 — 켠 채로도 «전체 N건» 은 그대로
 *      (⚠️ `h < 6` 만 쓰면 «모름»(-1)이 새벽으로 둔갑한다. 그 변이를 실제로 잡는다)
 *   ⑧ 선택칸 변경을 실제로 듣는다 (안 들으면 골라도 표가 그대로다)
 *   ⑨ 야간일 때 «날짜 경계» 를 화면이 말한다 — 이어지는 새벽은 다음 날짜 목록에 있다
 *      (그리고 야간이 아닐 때는 그 줄을 안 그린다 — 뜻 없는 문장이 늘 떠 있으면 안 읽힌다)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const TCJS_PATH = process.env.TC_LATE_SRC || join(__dir, '../cloudflare-deploy/public/js/adm-today-classes.js');
const TCJS = readFileSync(TCJS_PATH, 'utf8');
const ADMIN = readFileSync(join(__dir, '../cloudflare-deploy/public/admin.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(label, ok, why) {
  if (ok) { PASS++; console.log('  ✅ ' + label); }
  else { FAIL++; FAILS.push(label); console.log('  ⚠ FAIL ' + label + (why ? ' — ' + why : '')); }
}

/* 주석을 벗긴 사본 — 부정 검사(«이 낱말이 없어야 한다»)는 이쪽으로 판정한다.
   설명 주석을 검사가 자기 자신으로 잡는 사고가 이 저장소에 실재한다(CLAUDE.md 2장). */
function stripComments(t) {
  let out = '', inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = l.indexOf('/*');
      if (b < 0) break;
      const e = l.indexOf('*/', b + 2);
      if (e < 0) { l = l.slice(0, b); inBlock = true; break; }
      l = l.slice(0, b) + l.slice(e + 2);
    }
    out += l.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}
const TCJS_NC = stripComments(TCJS);
const ADMIN_NC = stripComments(ADMIN.replace(/<!--[\s\S]*?-->/g, ''));

/* ── 화면 파일을 가짜 DOM 에 올려 «실제로» 그린다 ────────────────────────────
   ⚠️ 서버를 안 부르고 값을 손으로 넣으면 그 검사는 정본을 한 번도 안 돌린 것이 된다
      (CLAUDE.md 2장 「가짜 DB 로 하니스를 돌렸는데 검사가 헛돌며 통과」). 여기서는
      tcLoadToday() → render() 를 그대로 태운다. */
function renderOnce(sessions, opts = {}) {
  const els = {}; const bound = [];
  /* ⚠️ 그린 «뒤» 에 도는 배선(2026-09-08 main: 교재 미배정 배지 → 배정 창)이
     `box.querySelectorAll('.tc-book-pin')` 을 부른다. 가짜 요소에 그 함수가 없으면
     render() 가 그 줄에서 던지고 **표가 통째로 안 그려진다** — 화면 버그가 아니라
     검사 환경 문제다(CLAUDE.md 2장 「FAIL 이 나면 검사 쪽을 먼저 의심하라」).
     여기서 재는 것은 «무엇이 남는가» 뿐이라 빈 목록으로 충분하다. */
  const mk = (id) => (els[id] || (els[id] = {
    id, innerHTML: '', textContent: '', value: '', checked: false,
    querySelectorAll: () => [], querySelector: () => null,
    addEventListener(t) { bound.push(id + ':' + t); }, removeEventListener() {},
  }));
  mk('tc-body'); mk('tc-count'); mk('tc-night'); mk('tc-only-live'); mk('tc-source'); mk('tc-q');
  if (opts.q != null) els['tc-q'].value = opts.q;
  if (opts.src != null) els['tc-source'].value = opts.src;
  els['tc-night'].value = opts.night || '';
  els['tc-only-live'].checked = !!opts.onlyLive;
  const doc = { getElementById: (id) => els[id] || null, dispatchEvent: () => true, addEventListener() {} };
  const win = { adminLang: 'ko', addEventListener() {}, removeEventListener() {} };
  win.document = doc;
  const ctx = {
    window: win, document: doc,
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, sessions, date: '2026-09-08', counts: {} }) }),
    console: { log() {}, warn() {}, error() {} },
    Date, Number, String, Math, JSON, Array, Object, RegExp, isFinite, encodeURIComponent, decodeURIComponent, setTimeout,
  };
  ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(TCJS, ctx, { filename: 'adm-today-classes.js' });
  return win.tcLoadToday().then(() => ({
    html: els['tc-body'].innerHTML, count: els['tc-count'].textContent, bound,
  }));
}

/* KST 벽시계로 «그 날 몇 시» 를 만든다 — 실행 시각과 무관해야 한다(밤에 돌리면 결과가
   달라지는 검사는 그때부터 아무도 안 믿는다). */
const kst = (h, mi) => Date.UTC(2026, 8, 8, h, mi, 0) - 9 * 3600 * 1000;
const row = (name, h, mi, extra = {}) => Object.assign({
  schedule_id: null, source: 'cafe24', observable: false, room_id: 'c24-' + name,
  student_uid: name, student_name: name, academy: null, contact_phone: null,
  level: null, textbook: null, textbook_assigned: false, teacher_name: 'T',
  start_ts: kst(h, mi), end_ts: kst(h, mi) + 12e5, status: 'early', join_open: false, is_level_test: false,
}, extra);

/* 경계를 전부 덮는다 — 자정 정각 · 자정십분 · 새벽 끝(05:59) · 아침 첫 시각(06:00) ·
   낮 · 22:59 · 23:00 · 23:59 */
const SESSIONS = [
  row('자정정각', 0, 0),
  row('자정십분', 0, 10),
  row('다섯시오십구', 5, 59),
  row('여섯시정각', 6, 0),
  row('낮두시', 14, 0),
  row('스물두시오십구', 22, 59),
  row('스물세시정각', 23, 0),
  row('스물세시오십구', 23, 59),
];
const names = (html) => (html.match(/<b>([^<]+)<\/b>/g) || []).map(s => s.replace(/<\/?b>/g, ''));

console.log('\n── ① 선택칸이 화면에 있는가 ────────────────────────────');
check('①-1 admin.html 에 #tc-night 선택칸이 있다', /<select[^>]*id="tc-night"/.test(ADMIN));
const nightBlock = (ADMIN.match(/id="tc-night"[\s\S]{0,900}?<\/select>/) || [''])[0];
const optVals = [...nightBlock.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
check('①-2 갈래가 «전체 · 23시 이후 · 야간» 셋이다', optVals.join(',') === ',late,night', optVals.join(','));
check('①-3 세 갈래 모두 KO/EN 라벨을 갖는다 (EN 스태프에게도 읽힌다)',
  (nightBlock.match(/data-ko="/g) || []).length === 3 && (nightBlock.match(/data-en="/g) || []).length === 3);
const nightOpt = (nightBlock.match(/value="night"[^>]*>/) || [''])[0];
const lateOpt = (nightBlock.match(/value="late"[^>]*>/) || [''])[0];
check('①-4 「23시 이후」 라벨이 그 시간대를 그대로 적는다', /23:00/.test(lateOpt) && /23:59/.test(lateOpt), lateOpt.slice(0, 160));
check('①-5 「야간」 라벨이 «자정 이후 포함» 과 시간대를 말한다',
  /자정 이후/.test(nightOpt) && /23:00/.test(nightOpt) && /05:59/.test(nightOpt), nightOpt.slice(0, 200));
check('①-6 #tc-body «밖» 에 있다 (표를 다시 그려도 고른 값이 안 풀린다)',
  ADMIN.indexOf('id="tc-night"') < ADMIN.indexOf('id="tc-body"'));
/* ⛔ 두 범위가 포개져 있어 체크박스 둘이면 «둘 다 켠 상태» 의 뜻이 모호해진다 */
check('①-7 옛 체크박스(#tc-late)가 남아 있지 않다 (판정 자리가 둘이 되지 않게)',
  !/id="tc-late"/.test(ADMIN) && !/tc-late/.test(TCJS_NC));

console.log('\n── ② 문턱은 한 곳이 정본인가 ───────────────────────────');
const thrLate = TCJS_NC.match(/LATE_FROM_HOUR\s*=\s*(\d+)/g) || [];
const thrNight = TCJS_NC.match(/NIGHT_UNTIL_HOUR\s*=\s*(\d+)/g) || [];
check('②-1 LATE_FROM_HOUR 선언이 정확히 한 번이다', thrLate.length === 1, thrLate.join(','));
check('②-2 NIGHT_UNTIL_HOUR 선언이 정확히 한 번이다', thrNight.length === 1, thrNight.join(','));
check('②-3 판정이 그 상수들을 쓴다 (숫자를 조건식에 다시 적지 않는다)',
  /getUTCHours\(\)/.test(TCJS_NC) && />=\s*LATE_FROM_HOUR/.test(TCJS_NC) && /<\s*NIGHT_UNTIL_HOUR/.test(TCJS_NC));
check('②-4 admin.html 이 시각 «판정» 을 복제하지 않는다 (화면은 고르는 칸만 둔다)',
  !/getUTCHours|LATE_FROM_HOUR|NIGHT_UNTIL_HOUR/.test(ADMIN_NC));

console.log('\n── ③ 「23시 이후」 경계를 실제로 돌려 본다 ─────────────');
const late = await renderOnce(SESSIONS, { night: 'late' });
const lateNames = names(late.html);
check('③-1 23:00 정각이 남는다', lateNames.includes('스물세시정각'), lateNames.join(','));
check('③-2 23:59 이 남는다', lateNames.includes('스물세시오십구'), lateNames.join(','));
check('③-3 22:59 는 빠진다 (한 칸 앞은 안 걸린다)', !lateNames.includes('스물두시오십구'), lateNames.join(','));
check('③-4 낮 수업은 빠진다', !lateNames.includes('낮두시'), lateNames.join(','));
check('③-5 자정 00:10 은 빠진다 (「23시 이후」는 뒤쪽만 본다)', !lateNames.includes('자정십분'), lateNames.join(','));
check('③-6 남은 줄이 정확히 두 개다', lateNames.length === 2, lateNames.join(','));
check('③-7 거르는 중이면 «표시 N건 / 전체» 를 둘 다 말한다',
  /표시 2건/.test(late.count) && /전체 8건/.test(late.count), late.count);

console.log('\n── ③-N 「야간」 경계 — 자정 이후가 실제로 들어오는가 ──');
const night = await renderOnce(SESSIONS, { night: 'night' });
const nightNames = names(night.html);
check('③N-1 자정 00:00 정각이 들어온다', nightNames.includes('자정정각'), nightNames.join(','));
check('③N-2 00:10 이 들어온다 (「23시 이후」가 빠뜨리던 바로 그 줄)', nightNames.includes('자정십분'), nightNames.join(','));
check('③N-3 새벽 끝 05:59 이 들어온다', nightNames.includes('다섯시오십구'), nightNames.join(','));
check('③N-4 06:00 은 빠진다 (거기부터는 아침)', !nightNames.includes('여섯시정각'), nightNames.join(','));
check('③N-5 22:59 는 빠진다', !nightNames.includes('스물두시오십구'), nightNames.join(','));
check('③N-6 낮 수업은 빠진다', !nightNames.includes('낮두시'), nightNames.join(','));
check('③N-7 23:00·23:59 도 함께 남는다 (야간은 밤 + 새벽)',
  nightNames.includes('스물세시정각') && nightNames.includes('스물세시오십구'), nightNames.join(','));
check('③N-8 남은 줄이 정확히 다섯이다', nightNames.length === 5, nightNames.join(','));
/* ⚠️ 「23시 이후」보다 넓어야 한다 — 좁아지거나 같아지면 새 갈래를 만든 뜻이 없다 */
check('③N-9 야간이 「23시 이후」를 통째로 품고 더 넓다',
  lateNames.every(n => nightNames.includes(n)) && nightNames.length > lateNames.length);

console.log('\n── ④ 끄면 전부 돌아오는가 (짝 검사) ────────────────────');
const off = await renderOnce(SESSIONS, { night: '' });
check('④-1 전체를 고르면 8건 전부 보인다', names(off.html).length === 8, names(off.html).join(','));
check('④-2 그때는 «표시 N건» 을 안 붙인다 (숫자가 두 번 나오면 헷갈린다)', !/표시/.test(off.count), off.count);
const bogus = await renderOnce(SESSIONS, { night: 'zzz' });
check('④-3 모르는 값은 «전체» 로 떨어진다 (옛 화면이 캐시에 남아도 줄이 안 사라진다)',
  names(bogus.html).length === 8, names(bogus.html).join(','));

console.log('\n── ⑤ 다른 거르개와 함께 걸리는가 ───────────────────────');
const both = await renderOnce(SESSIONS, { night: 'night', q: '자정십분' });
check('⑤-1 검색 + 야간 = 한 줄', names(both.html).length === 1, names(both.html).join(','));
const wrongSrc = await renderOnce(SESSIONS, { night: 'night', src: 'mangoi' });
check('⑤-2 출처가 안 맞으면 0건 (거르개가 서로를 지우지 않는다)', names(wrongSrc.html).length === 0);

console.log('\n── ⑥ 0건일 때 «왜» 를 말하는가 ─────────────────────────');
const none = await renderOnce([row('낮두시', 14, 0)], { night: 'night' });
check('⑥-1 «조건에 맞는 수업이 없습니다» 로 말한다 (원래 없다고 하지 않는다)',
  /조건에 맞는 수업이 없습니다/.test(none.html), none.html.slice(0, 160));
check('⑥-2 고른 시간대(야간)를 그 자리에 적는다', /야간/.test(none.html), none.html.slice(0, 220));
check('⑥-3 전체 건수도 함께 적는다 (수업이 사라진 게 아니다)', /전체 1건/.test(none.html), none.html.slice(0, 220));
const noneLate = await renderOnce([row('낮두시', 14, 0)], { night: 'late' });
check('⑥-4 「23시 이후」일 때는 그 시간대를 적는다 (두 갈래가 같은 말을 하지 않는다)',
  /23시 이후/.test(noneLate.html) && !/야간/.test(noneLate.html), noneLate.html.slice(0, 220));

console.log('\n── ⑦ 모르는 시작 시각 ──────────────────────────────────');
const unknown = [row('시각모름', 23, 0, { start_ts: null }), row('스물세시정각', 23, 0)];
const unk = await renderOnce(unknown, { night: 'late' });
check('⑦-1 시작 시각을 모르는 줄을 «늦은 밤» 으로 세지 않는다',
  !names(unk.html).includes('시각모름'), names(unk.html).join(','));
/* 🔴 여기가 「야간」이 새로 만든 위험이다 — `h < 6` 만 쓰면 «모름»(-1)이 새벽으로 둔갑한다 */
const unkNight = await renderOnce(unknown, { night: 'night' });
check('⑦-2 야간에서도 «모름» 을 새벽으로 세지 않는다 (h >= 0 짝이 살아 있는가)',
  !names(unkNight.html).includes('시각모름'), names(unkNight.html).join(','));
check('⑦-3 켠 채로도 «전체 2건» 은 그대로다 (감추는 것이지 목록에서 지우는 게 아니다)',
  /표시 1건/.test(unkNight.count) && /전체 2건/.test(unkNight.count), unkNight.count);
const unkOff = await renderOnce(unknown, { night: '' });
check('⑦-4 전체로 되돌리면 그 줄이 돌아온다 (거르개 밖에서는 손대지 않는다)',
  names(unkOff.html).includes('시각모름'), names(unkOff.html).join(','));

console.log('\n── ⑧ 골랐을 때 다시 그리는가 ───────────────────────────');
check('⑧ #tc-night 의 change 를 듣는다 (안 들으면 골라도 표가 그대로다)',
  off.bound.includes('tc-night:change'), off.bound.join(','));

console.log('\n── ⑨ 야간일 때 «날짜 경계» 를 말하는가 ─────────────────');
check('⑨-1 새벽·밤 건수를 갈라서 말한다', /새벽 3건/.test(night.html) && /밤 2건/.test(night.html),
  (night.html.match(/🌒[^<]*/) || [''])[0].slice(0, 200));
check('⑨-2 «이어지는 새벽은 다음 날짜 목록» 이라고 말한다 (감추면 「필터가 빠뜨린다」가 된다)',
  /다음 날짜/.test(night.html), (night.html.match(/🌒[^<]*/) || [''])[0].slice(0, 240));
check('⑨-3 「23시 이후」에서는 그 줄을 안 그린다 (뜻 없는 문장이 늘 떠 있으면 안 읽힌다)',
  !/🌒/.test(late.html));
check('⑨-4 전체에서도 안 그린다', !/🌒/.test(off.html));

/* ⚠️ 요약 줄의 «모양» 이 곧 계약이다 — run.mjs 는 꼬리 25줄에서 «숫자 + FAIL» 을 실패로 읽어서
   `PASS 24   FAIL 0` 은 "24   FAIL" 로 잡혀 **통과한 하니스가 FAIL 로 분류된다**(실측).
   저장소 관례대로 숫자와 FAIL 사이에 «⚠» 를 둔다(today_classes_contact_harness 와 같은 모양). */
console.log('\n════════════════════════════════════════════');
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) console.log('  실패: ' + FAILS.join(' / '));
console.log('════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
