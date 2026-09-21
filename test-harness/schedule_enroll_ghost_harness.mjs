#!/usr/bin/env node
/* 🔖 학생 상세 캘린더 — 「신청만 있고 실제 수업은 없는」 수강신청을 회색으로 낮춘다
 *
 * 2026-09-21 사장님 제보: 금요일 14:20 「체험수업」 초록 카드가 계속 보인다.
 * 실측 — enrollments 103 은 status='confirmed' 인데 그 신청이 만든 수업
 * (source='adm-enroll:103') 4건이 전부 cancelled 였다.
 *   ⛔ enr.status 로는 못 가린다(신청서는 살아 있다).
 *   ✅ GET /api/admin/class-schedules 는 cs.status != 'cancelled' 라 «살아 있는 것» 만
 *      주므로, 그 목록에 이 신청의 수업이 0건이면 «수업 없음» 이다.
 *
 * ⚠️ 문자열 하니스로는 이 사고를 못 본다 — 함수도 값도 다 «있고» 틀린 것은
 *    «무엇이 그려지는가» 뿐이다. 그래서 렌더 함수를 중괄호 짝으로 오려 내
 *    가짜 DOM 으로 «실제로 돌려» 나온 HTML 을 본다.
 * ⚠️ 「회색이 된다」 옆에 반드시 «살아 있으면 예전 그대로다» 를 짝으로 둔다 —
 *    앞만 보면 «전부 회색» 도 통과한다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.GHOST_SRC || join(ROOT, 'cloudflare-deploy/public/admin/student.html');
const html = readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (detail ? '  — ' + detail : '')); }
};

/* 주석을 벗긴 사본 — 부정 검사가 «내가 적은 ⛔ 주석» 을 잡지 않게.
   ⚠️ 문자열 안의 https:// 가 잘리지 않도록 따옴표 상태를 함께 좇는다. */
function stripComments(src) {
  let out = '', i = 0, q = '';
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === '\\') { out += c + (n || ''); i += 2; continue; }
      if (c === q) q = '';
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; out += ' '; continue; }
    out += c; i++;
  }
  return out;
}

/* 중괄호 짝으로 블록을 자른다 — ⛔ 길이로 자르지 말 것(여유가 없어지면 조용히 어긋난다). */
function braceBlock(src, from) {
  const s = src.indexOf('{', from);
  if (s < 0) return '';
  let d = 0;
  for (let i = s; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(from, i + 1); }
  }
  return '';
}

function cut(anchor) {
  const i = html.indexOf(anchor);
  return i < 0 ? '' : braceBlock(html, i);
}

console.log('\n🔖 수강신청 유령 카드 — 「신청만 · 수업 없음」\n');
console.log('① 정본 판정 — 오려 내 실제로 돌린다');

const fnSrc   = cut('function mgsEnrHasLiveClass(enr)');
/* 📅 (2026-09-21 병합 — #1067) 같은 카드에 **판정이 둘** 있다. 이 하니스가 보는 «회색»
   말고, 그 «앞» 에서 아예 안 그리는 enrCalHidden(«있었는데 전부 취소» → 감춤)이 있다.
   두 렌더가 그것을 부르므로 **함께 오려 넣지 않으면** 가짜 DOM 에서 ReferenceError 로 죽는다
   — 그러면 이 절이 통째로 헛돈다(실제로 병합 직후 그렇게 됐다). */
const hidSrc  = cut('function enrCalHidden(enr)');
const weekSrc = cut('function renderDSchedWeek()');
const monthSrc= cut('function renderDSchedMonth()');
const deadLine = (html.match(/var MGS_ENR_DEAD = \{[^}]*\};/) || [''])[0];

ok('[전제] 판정 함수를 오려 냈다', fnSrc.length > 120, fnSrc.length + '자');
ok('[전제] 앞단 «감춤» 판정도 오려 냈다(#1067)', hidSrc.length > 120, hidSrc.length + '자');
ok('[전제] 주간 렌더를 오려 냈다', weekSrc.length > 1500, weekSrc.length + '자');
ok('[전제] 월간 렌더를 오려 냈다', monthSrc.length > 800, monthSrc.length + '자');
/* ⛔ 색을 하니스에 손으로 적지 말 것 — 소스에서 바꾸면 조용히 어긋난다.
   상수를 «평가해» 가져오고, 살아 있는 쪽 색도 화면의 표에서 읽는다. */
const DEAD = (() => { try { return vm.runInNewContext(deadLine + ' MGS_ENR_DEAD'); } catch { return null; } })();
const TRIAL = (() => {
  const m = html.match(/'체험수업':\s*\{\s*bg:'([^']+)',\s*border:'([^']+)'/);
  return m ? { bg: m[1], border: m[2] } : null;
})();
ok('[전제] 회색 상수를 오려 내 평가했다', !!(DEAD && DEAD.bg && DEAD.border && DEAD.text), JSON.stringify(DEAD));
ok('[전제] 체험수업 색을 소스에서 읽었다', !!(TRIAL && TRIAL.bg), JSON.stringify(TRIAL));
/* 카드가 «놓이는» 슬롯 격자선만 콕 집는다 — 요일 머리글 구분선까지 세면
   무관한 색에 걸려 거짓 FAIL 이 난다(실제로 밟았다). */
const SLOT_LINE = (html.match(/border-right:1px solid (#[0-9a-fA-F]{6});border-top:/) || [])[1] || '';
ok('[전제] 슬롯 격자선 색을 읽었다', /^#[0-9a-fA-F]{6}$/.test(SLOT_LINE), SLOT_LINE);
ok('회색 카드가 슬롯 격자선과 다른 색이다',
   !!DEAD && SLOT_LINE && DEAD.bg.toLowerCase() !== SLOT_LINE.toLowerCase(),
   '같으면 카드가 격자에 묻힌다 (' + (DEAD && DEAD.bg) + ' vs ' + SLOT_LINE + ')');

/* 가짜 DOM 으로 두 렌더를 실제로 돌린다. */
function run(enrollments, aiSchedules, aiOk, lang) {
  const cal = { innerHTML: '', textContent: '', style: {} };
  const mk = () => ({ innerHTML: '', textContent: '', value: '', style: {},
                      classList: { add() {}, remove() {}, contains() { return false; } },
                      addEventListener() {}, querySelectorAll: () => [] });
  const els = { 'd-sched-calendar': cal };
  const sandbox = {
    console,
    document: { getElementById: (id) => (els[id] || (els[id] = mk())) },
    _lang: lang || 'ko',
    _dSchedState: {
      view: 'week',
      weekStart: new Date('2026-09-20T00:00:00'),
      year: 2026, month: 8,
      enrollments, aiSchedules, aiOk
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(deadLine + '\n' + hidSrc + '\n' + fnSrc + '\n' + weekSrc + '\n' + monthSrc, sandbox);
  const out = {};
  vm.runInContext('renderDSchedWeek();', sandbox); out.week = cal.innerHTML;
  cal.innerHTML = '';
  vm.runInContext('renderDSchedMonth();', sandbox); out.month = cal.innerHTML;
  out.live = vm.runInContext('mgsEnrHasLiveClass(_dSchedState.enrollments[0])', sandbox);
  return out;
}

// 사장님 제보 그대로: 금 14:20 체험수업, 신청은 confirmed
const ENR = [{
  id: 103, student_user_id: 'jeong', status: 'confirmed', type: '체험수업',
  days_of_week: '금', time: '14:20', class_size: '1:1',
  teacher_name: '중국어 강선생님',
  started_at: new Date('2026-09-11T00:00:00').getTime(), end_date: '2026-10-11'
}];
const LIVE_ROW = [{ id: 2334, source: 'adm-enroll:103', start_time: '14:20', class_type: 'trial', scheduled_date: '2026-09-25', status: 'active' }];
/* ⚠️ 반례를 «남의 번호» 하나로만 두면 느슨한 비교(=== 를 includes 로)가 안 잡힌다.
   103 을 «접두사로 품는» 번호(1030)를 반드시 섞는다. */
const OTHER_ROW = [
  { id: 999,  source: 'adm-enroll:104',  start_time: '14:20', class_type: 'trial', scheduled_date: '2026-09-25', status: 'active' },
  { id: 1000, source: 'adm-enroll:1030', start_time: '14:20', class_type: 'trial', scheduled_date: '2026-09-25', status: 'active' }
];

let R = {};
try {
  R = {
    dead:   run(ENR, [],         true),   // 살아 있는 수업 0건 → 회색
    alive:  run(ENR, LIVE_ROW,   true),   // 살아 있음 → 예전 그대로
    other:  run(ENR, OTHER_ROW,  true),   // 남의 신청 수업뿐 → 회색
    unread: run(ENR, [],         false),  // 못 읽었다 → 예전 그대로(fail-open)
    en:     run(ENR, [],         true, 'en')
  };
} catch (e) {
  ok('[전제] 렌더가 가짜 DOM 에서 돈다', false, String(e && e.message || e));
}

if (R.dead) {
  ok('판정: 살아 있는 수업이 0건이면 «없음»', R.dead.live === false);
  ok('짝 — 살아 있으면 «있음»',              R.alive.live === true);
  ok('짝 — 남의 신청 수업은 안 센다',         R.other.live === false);
  ok('짝 — 못 읽었으면 «있음»(fail-open)',   R.unread.live === true);

  console.log('\n② 주간 뷰 — 실제로 그려진 HTML');
  /* ⚠️ «그 색이 HTML 어딘가에 있는가» 로 물으면 안 된다 — 캘린더 격자선이
     border-right:1px solid #f1f5f9 라 처음에 그것까지 세어 검사가 헛돌았다.
     카드가 실제로 쓰는 모양(background+border-left)으로 좁힌다. */
const DEAD_CARD = 'background:' + DEAD.bg + ';border-left:3px solid ' + DEAD.border;
const LIVE_CARD = 'background:' + TRIAL.bg + ';border-left:3px solid ' + TRIAL.border;
ok('회색 카드로 낮춘다',              R.dead.week.includes(DEAD_CARD));
  ok('「신청만」이라 적는다',            R.dead.week.includes('신청만'));
  ok('「수업 없음」이라 적는다',          R.dead.week.includes('수업 없음'));
  ok('감추지 않는다(카드는 남는다)',      R.dead.week.includes('체험수업'));
  ok('짝 — 살아 있으면 초록 그대로',      R.alive.week.includes(LIVE_CARD) && !R.alive.week.includes(DEAD_CARD));
  ok('짝 — 살아 있으면 강사 이름 그대로', R.alive.week.includes('중국어 강선생님') && !R.alive.week.includes('신청만'));
  ok('짝 — 못 읽었으면 예전 그대로',      R.unread.week.includes(LIVE_CARD) && !R.unread.week.includes('신청만'));

  console.log('\n③ 월간 뷰 — «같은» 정본을 쓴다');
  ok('회색 카드로 낮춘다',         R.dead.month.includes(DEAD_CARD));
  ok('「신청만」이라 적는다',       R.dead.month.includes('신청만'));
  ok('짝 — 살아 있으면 그대로',    R.alive.month.includes(LIVE_CARD) && !R.alive.month.includes('신청만'));
  ok('짝 — 못 읽었으면 그대로',    R.unread.month.includes(LIVE_CARD));

  console.log('\n④ 한/영');
  ok('영어에서는 request only', R.en.week.includes('request only') && R.en.week.includes('no class'));
  ok('짝 — 한국어는 한국어로',  R.dead.week.includes('신청만') && !R.dead.week.includes('request only'));
}

console.log('\n⑤ 배선·구조');
const code = stripComments(html);
ok('판정 정본은 한 곳뿐(복제 금지)',
  (code.match(/function mgsEnrHasLiveClass\s*\(/g) || []).length === 1);
ok('주간 렌더가 그 정본을 부른다',  /mgsEnrHasLiveClass\s*\(/.test(stripComments(weekSrc)));
ok('월간 렌더가 그 정본을 부른다',  /mgsEnrHasLiveClass\s*\(/.test(stripComments(monthSrc)));
ok('판정 함수는 최상위에 있다',
  (() => { const i = code.indexOf('function mgsEnrHasLiveClass'); if (i < 0) return false;
           let d = 0; for (let k = 0; k < i; k++) { const c = code[k]; if (c === '{') d++; else if (c === '}') d--; }
           return d === 0; })());

/* aiOk 를 정하는 식 — 오려 내 «실제로 평가» 한다.
   ⚠️ 「warning 이라는 글자가 있는가」로 물으면 `false &&` 한 글자에 뚫린다. */
const okExpr = (code.match(/_dSchedState\.aiOk = ([^;]*\baiR\b[^;]*);/) || [])[1] || '';
ok('[전제] aiOk 식을 찾았다', okExpr.length > 10, okExpr);
const evalOk = (aiR) => { try { return vm.runInNewContext('(function(aiR){ return ' + okExpr + '; })', { Array })(aiR); } catch { return 'ERR'; } };
ok('제대로 받으면 읽은 것',        evalOk({ ok: true, items: [] }) === true);
ok('warning 이 있으면 «못 읽음»',  evalOk({ ok: true, items: [], warning: 'no such column' }) === false);
ok('ok:false 면 «못 읽음»',        evalOk({ ok: false }) === false);
ok('빈 응답이면 «못 읽음»',        evalOk({}) === false);

console.log('\n⑥ 색 — 흰 캘린더에서 읽히는가 (페인터가 «구제» 하지 않게)');
const lum = (hex) => {
  const v = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16) / 255)
    .map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
};
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1,L2), lo = Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };
const cr = ratio(DEAD.text, DEAD.bg);
ok('회색 글자 대비 ≥ 4.5 (AA)', cr >= 4.5, cr.toFixed(2));

console.log('\n⑦ 범례');
ok('범례에 「신청만 · 수업 없음」이 있다', html.includes('신청만 · 수업 없음'));

/* ⑧ (2026-09-21 병합 — #1067) 같은 카드의 «두 판정» 이 서로 침범하지 않는가
   ──────────────────────────────────────────────────────────────────────────
   · enrCalHidden()       «있었는데 전부 취소» → 아예 안 그린다(사장님이 «감추기» 로 고르심)
   · mgsEnrHasLiveClass() «살아 있는 수업 0건» → 회색 + 「신청만 · 수업 없음」
   ⚠️ 짝으로 묻는다 — 앞만 보면 «전부 감추기» 도, 뒤만 보면 «전부 회색» 도 통과한다.
   ⛔ 「이 카드는 절대 안 감춘다」로 읽지 말 것: 회색이 실제로 닿는 것은
      «아직 수업을 안 만든 신청» 쪽이고, 그쪽은 규칙서가 감추지 말라고 못 박은 경우다. */
console.log('\n⑧ 두 판정이 서로 침범하지 않는가 (#1067 병합)');
const ENR_GONE = [Object.assign({}, ENR[0], { class_total: 4, class_active: 0 })];
const ENR_NEW  = [Object.assign({}, ENR[0], { class_total: 0, class_active: 0 })];
try {
  const gone = run(ENR_GONE, [], true);
  const fresh = run(ENR_NEW,  [], true);
  ok('«전부 취소» 된 신청은 주간에 아예 안 그려진다',
     !gone.week.includes('체험') && !gone.week.includes('신청만'), gone.week.slice(0, 120));
  ok('짝 — 월간도 같다', !gone.month.includes('체험') && !gone.month.includes('신청만'));
  /* ⛔ 짝이 없으면 «전부 감추기» 도 통과한다 */
  ok('짝 — «아직 수업을 안 만든» 신청은 감추지 않고 회색으로 말한다',
     fresh.week.includes('신청만'), fresh.week.slice(0, 120));
  ok('짝 — 살아 있는 수업이 있으면 예전 그대로다',
     R.alive.week.includes('중국어 강선생님') && !R.alive.week.includes('신청만'));
} catch (e) {
  ok('[전제] ⑧ 을 돌리는 중 예외', false, String(e && e.message || e));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail + '\n');
process.exit(fail > 0 ? 1 : 0);
