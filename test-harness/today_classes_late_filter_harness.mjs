#!/usr/bin/env node
/**
 * 🌙 매니저 「🚪 오늘 수업」 — 「23시 이후만」 거르기 (2026-09-08 사장님 요청)
 *
 * 왜 만들었나
 *   늦은 밤 수업만 따로 보고 싶다는 요청. 이 목록은 하루 160건 안팎이라 눈으로는 못 찾는다.
 *
 * ⚠️ 이런 변경에서 틀릴 수 있는 것은 «무엇이 남는가» 하나뿐이고, 그것은 문자열 검사가
 *    원리상 못 본다(함수도 값도 전부 «있다» 로 통과한다 — CLAUDE.md 2장 반복 교훈).
 *    그래서 화면 파일을 **가짜 DOM 에 올려 실제로 render() 를 돌려** 표를 세어 본다.
 *
 * 이 하니스가 지키는 것
 *   ① 체크박스가 화면에 있고 KO/EN 라벨을 둘 다 갖는다 (EN 스태프에게도 읽힌다)
 *   ② 문턱(23)은 **한 곳**이 정본이다 — 화면 HTML 에 판정을 복제하지 않는다
 *   ③ 경계를 실제로 돌려 본다: 22:59 제외 · 23:00 포함 · 23:59 포함 · 00:10 제외
 *      (이 목록은 «하루치» 라 자정을 넘긴 줄은 그 날짜 목록의 «맨 앞» 이다)
 *   ④ **끄면 전부 돌아온다** — «남긴다» 검사만 두면 «전부 숨기기» 도 통과한다(짝으로 둔다)
 *   ⑤ 다른 거르개(검색·출처)와 함께 걸린다
 *   ⑥ 0건일 때 «왜» 를 말한다 — 「23시 이후」가 켜져 있다는 사실과 전체 건수를 함께
 *   ⑦ 시작 시각을 모르는 줄을 «늦은 밤» 으로 세지 않는다 (모르면 안 걸린다)
 *   ⑧ 체크박스 변경을 실제로 듣는다 (안 들으면 눌러도 표가 그대로다)
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
  const mk = (id) => (els[id] || (els[id] = {
    id, innerHTML: '', textContent: '', value: '', checked: false,
    addEventListener(t) { bound.push(id + ':' + t); }, removeEventListener() {},
  }));
  mk('tc-body'); mk('tc-count'); mk('tc-late'); mk('tc-only-live'); mk('tc-source'); mk('tc-q');
  if (opts.q != null) els['tc-q'].value = opts.q;
  if (opts.src != null) els['tc-source'].value = opts.src;
  els['tc-late'].checked = !!opts.late;
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

/* 자정 00:10 · 낮 14:00 · 22:59 · 23:00 · 23:59 — 경계를 전부 덮는다 */
const SESSIONS = [
  row('자정십분', 0, 10),
  row('낮두시', 14, 0),
  row('스물두시오십구', 22, 59),
  row('스물세시정각', 23, 0),
  row('스물세시오십구', 23, 59),
];
const names = (html) => (html.match(/<b>([^<]+)<\/b>/g) || []).map(s => s.replace(/<\/?b>/g, ''));

console.log('\n── ① 체크박스가 화면에 있는가 ──────────────────────────');
check('①-1 admin.html 에 #tc-late 체크박스가 있다',
  /<input[^>]*id="tc-late"[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*id="tc-late"/.test(ADMIN));
const lateLabel = (ADMIN.match(/id="tc-late"[\s\S]{0,300}?<\/label>/) || [''])[0];
check('①-2 KO/EN 라벨을 둘 다 갖는다 (EN 스태프에게도 읽힌다)',
  /data-ko="[^"]*23/.test(lateLabel) && /data-en="[^"]*23/.test(lateLabel), lateLabel.slice(0, 120));
check('①-3 라벨이 «어느 시간대인지» 를 그대로 적는다 (23시 이후가 새벽까지라고 읽히지 않게)',
  /23:00/.test(lateLabel) && /23:59/.test(lateLabel), lateLabel.slice(0, 160));
check('①-4 #tc-body «밖» 에 있다 (다시 그려도 체크가 안 풀린다)',
  ADMIN.indexOf('id="tc-late"') < ADMIN.indexOf('id="tc-body"'));

console.log('\n── ② 문턱은 한 곳이 정본인가 ───────────────────────────');
const thr = TCJS_NC.match(/LATE_FROM_HOUR\s*=\s*(\d+)/g) || [];
check('②-1 LATE_FROM_HOUR 선언이 정확히 한 번이다', thr.length === 1, thr.join(','));
check('②-2 판정이 그 상수를 쓴다 (숫자를 조건식에 다시 적지 않는다)',
  /getUTCHours\(\)/.test(TCJS_NC) && />=\s*LATE_FROM_HOUR/.test(TCJS_NC));
check('②-3 admin.html 이 시각 판정을 복제하지 않는다 (화면은 체크박스만 둔다)',
  !/getUTCHours|LATE_FROM_HOUR/.test(ADMIN_NC));

console.log('\n── ③ 경계를 실제로 돌려 본다 ───────────────────────────');
const on = await renderOnce(SESSIONS, { late: true });
const onNames = names(on.html);
check('③-1 23:00 정각이 남는다', onNames.includes('스물세시정각'), onNames.join(','));
check('③-2 23:59 이 남는다', onNames.includes('스물세시오십구'), onNames.join(','));
check('③-3 22:59 는 빠진다 (한 칸 앞은 안 걸린다)', !onNames.includes('스물두시오십구'), onNames.join(','));
check('③-4 낮 수업은 빠진다', !onNames.includes('낮두시'), onNames.join(','));
check('③-5 자정 00:10 은 빠진다 (하루치 목록의 «맨 앞» 이지 23시 뒤가 아니다)',
  !onNames.includes('자정십분'), onNames.join(','));
check('③-6 남은 줄이 정확히 두 개다', onNames.length === 2, onNames.join(','));
check('③-7 거르는 중이면 «표시 N건 / 전체» 를 둘 다 말한다',
  /표시 2건/.test(on.count) && /5건/.test(on.count), on.count);

console.log('\n── ④ 끄면 전부 돌아오는가 (짝 검사) ────────────────────');
const off = await renderOnce(SESSIONS, { late: false });
check('④-1 체크를 안 하면 5건 전부 보인다', names(off.html).length === 5, names(off.html).join(','));
check('④-2 그때는 «표시 N건» 을 안 붙인다 (숫자가 두 번 나오면 헷갈린다)', !/표시/.test(off.count), off.count);

console.log('\n── ⑤ 다른 거르개와 함께 걸리는가 ───────────────────────');
const both = await renderOnce(SESSIONS, { late: true, q: '스물세시정각' });
check('⑤-1 검색 + 23시 이후 = 한 줄', names(both.html).length === 1, names(both.html).join(','));
const wrongSrc = await renderOnce(SESSIONS, { late: true, src: 'mangoi' });
check('⑤-2 출처가 안 맞으면 0건 (거르개가 서로를 지우지 않는다)', names(wrongSrc.html).length === 0);

console.log('\n── ⑥ 0건일 때 «왜» 를 말하는가 ─────────────────────────');
const none = await renderOnce([row('낮두시', 14, 0)], { late: true });
check('⑥-1 «조건에 맞는 수업이 없습니다» 로 말한다 (원래 없다고 하지 않는다)',
  /조건에 맞는 수업이 없습니다/.test(none.html), none.html.slice(0, 160));
check('⑥-2 「23시 이후」가 켜져 있다는 것을 그 자리에 적는다',
  /23시 이후/.test(none.html), none.html.slice(0, 200));
check('⑥-3 전체 건수도 함께 적는다 (수업이 사라진 게 아니다)',
  /전체 1건/.test(none.html), none.html.slice(0, 200));

console.log('\n── ⑦ 모르는 시작 시각 ──────────────────────────────────');
const unknown = [row('시각모름', 23, 0, { start_ts: null }), row('스물세시정각', 23, 0)];
const unk = await renderOnce(unknown, { late: true });
check('⑦-1 시작 시각을 모르는 줄을 «늦은 밤» 으로 세지 않는다',
  !names(unk.html).includes('시각모름'), names(unk.html).join(','));
const unkOff = await renderOnce(unknown, { late: false });
check('⑦-2 끄면 그 줄도 그대로 보인다 (거르개가 줄을 영영 삼키지 않는다)',
  names(unkOff.html).includes('시각모름'), names(unkOff.html).join(','));

console.log('\n── ⑧ 눌렀을 때 다시 그리는가 ───────────────────────────');
check('⑧ #tc-late 의 change 를 듣는다 (안 들으면 눌러도 표가 그대로다)',
  off.bound.includes('tc-late:change'), off.bound.join(','));

console.log('\n════════════════════════════════════════════');
/* ⚠️ 요약 줄의 «모양» 이 곧 계약이다 — run.mjs 는 꼬리 25줄에서 «숫자 + FAIL» 을 실패로 읽어서
   `PASS 24   FAIL 0` 은 "24   FAIL" 로 잡혀 **통과한 하니스가 FAIL 로 분류된다**(실측).
   저장소 관례대로 숫자와 FAIL 사이에 «⚠» 를 둔다(today_classes_contact_harness 와 같은 모양). */
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) console.log('  실패: ' + FAILS.join(' / '));
console.log('════════════════════════════════════════════');
process.exit(FAIL ? 1 : 0);
