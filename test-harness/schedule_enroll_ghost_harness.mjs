#!/usr/bin/env node
/* 🔕 학생 상세 캘린더 — 「신청만 있고 실제 수업은 없는」 수강신청은 그리지 않는다
 *
 * 2026-09-21 사장님 제보: 금요일 14:20 「체험수업」 카드가 계속 보인다.
 * 실측 — enrollments 103 은 status='confirmed' 인데 그 신청이 만든 수업
 * (source='adm-enroll:103') 4건이 전부 cancelled 였다.
 *   ⛔ enr.status 로는 못 가린다(신청서는 살아 있다).
 *   ✅ GET /api/admin/class-schedules 는 cs.status != 'cancelled' 라 «살아 있는 것» 만
 *      주므로, 그 목록에 이 신청의 수업이 0건이면 «수업 없음» 이다.
 *
 * 📜 같은 날 앞 판(#1059)은 «회색으로 낮추고 사실을 적기» 였다. 사장님이 그것을
 *    「체험수업이 없는데 나오는 것은 안돼. 캘린더에 나오지 않게 해줘」로 바꾸셨다.
 *    ⟹ 옛 경계(「회색이 된다」)를 느슨하게 푼 것이 아니라 «새 경계» 로 옮겨 적는다:
 *       ① 캘린더에 안 그린다 ② 대신 «안 그린 N건» 한 줄이 그 사실을 남긴다
 *       ③ 살아 있는 신청·못 읽은 경우는 예전 그대로다.
 *
 * ⚠️ 문자열 하니스로는 이 사고를 못 본다 — 함수도 값도 다 «있고» 틀린 것은
 *    «무엇이 그려지는가» 뿐이다. 그래서 렌더 함수를 중괄호 짝으로 오려 내
 *    가짜 DOM 으로 «실제로 돌려» 나온 HTML 을 본다.
 * ⚠️ 「안 그린다」 옆에 반드시 «살아 있으면 예전 그대로다» 를 짝으로 둔다 —
 *    앞만 보면 «전부 안 그리기» 도 통과한다.
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


console.log('\n🔕 수강신청 유령 카드 — 「캘린더에 그리지 않는다」\n');
console.log('① 정본 판정 — 오려 내 실제로 돌린다');

const fnSrc   = cut('function mgsEnrHasLiveClass(enr)');
const noteSrc = cut('function mgsSetGhostNote(n)');
const weekSrc = cut('function renderDSchedWeek()');
const monthSrc= cut('function renderDSchedMonth()');
/* 🗓 (2026-09-22) 두 렌더가 예약 수업 판정 정본을 쓰게 되면서 그 블록도 함께 주입해야 한다.
   안 주입하면 `mgsSchedTime is not defined` 로 [전제] 가 빨간불이 된다(실제로 그렇게 잡혔다).
   ⛔ 여기 함수를 베껴 적지 말 것 — 소스에서 오려 낸다. */
const canonSrc = [
  cut('var MGS_DOW_IN = {') + ';',
  cut('function mgsDowIdx(v)'),
  cut('function mgsYmd(d)'),
  cut('function mgsSchedHitsDate(sch, date)'),
  cut('function mgsSchedTime(sch)'),
  cut('var MGS_AI_COLORS = {') + ';',
  cut('function mgsAiColors(sch)'),
  cut('function mgsSrcLabel(sch)'),  // 🏷 2026-09-24 카드 이름표(source 별)
  /* 🎌 2026-09-25 공휴일 표시 도우미 — 두 렌더가 부른다. 소스에서 그 구간을 통째로 오려 낸다
     (fetch 가 없는 이 샌드박스에서는 조용히 «공휴일 없음» 으로 그려진다 — 그것이 정본의 실패 방향). */
  holSrc()
].join('\n');
function holSrc() {
  const a = html.indexOf('const _mgsHol = {'), b = html.indexOf('function renderDSchedule() {');
  return (a > 0 && b > a) ? html.slice(a, b) + '\nfunction esc(s){ return String(s); }\nvar fetch = function(){ return Promise.reject(new Error("no fetch")); };' : '';
}
ok('[전제] 예약 판정 정본을 오려 냈다', canonSrc.length > 700, canonSrc.length + '자');

ok('[전제] 판정 함수를 오려 냈다', fnSrc.length > 120, fnSrc.length + '자');
ok('[전제] 안내 함수를 오려 냈다', noteSrc.length > 120, noteSrc.length + '자');
ok('[전제] 주간 렌더를 오려 냈다', weekSrc.length > 1500, weekSrc.length + '자');
ok('[전제] 월간 렌더를 오려 냈다', monthSrc.length > 800, monthSrc.length + '자');

/* ⛔ 색을 하니스에 손으로 적지 말 것 — 소스에서 바꾸면 조용히 어긋난다. 표에서 읽는다. */
const TRIAL = (() => {
  const m = html.match(/'체험수업':\s*\{\s*bg:'([^']+)',\s*border:'([^']+)'/);
  return m ? { bg: m[1], border: m[2] } : null;
})();
const TRIAL_M = (() => {
  const m = html.match(/'체험수업':\{bg:'([^']+)',b:'([^']+)'\}/);
  return m ? { bg: m[1], b: m[2] } : null;
})();
ok('[전제] 주간 체험수업 색을 소스에서 읽었다', !!(TRIAL && TRIAL.bg), JSON.stringify(TRIAL));
ok('[전제] 월간 체험수업 색을 소스에서 읽었다', !!(TRIAL_M && TRIAL_M.bg), JSON.stringify(TRIAL_M));

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
  vm.runInContext(canonSrc + '\n' + fnSrc + '\n' + noteSrc + '\n' + weekSrc + '\n' + monthSrc, sandbox);
  const snapNote = () => {
    const el = els['d-sched-ghost-note'];
    return el ? { text: String(el.textContent || ''), display: String(el.style.display) } : null;
  };
  const out = {};
  vm.runInContext('renderDSchedWeek();', sandbox);  out.week = cal.innerHTML;  out.weekNote = snapNote();
  cal.innerHTML = '';
  vm.runInContext('renderDSchedMonth();', sandbox); out.month = cal.innerHTML; out.monthNote = snapNote();
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
    dead:   run(ENR, [],         true),   // 살아 있는 수업 0건 → 안 그린다
    alive:  run(ENR, LIVE_ROW,   true),   // 살아 있음 → 예전 그대로
    other:  run(ENR, OTHER_ROW,  true),   // 남의 신청 수업뿐 → 안 그린다
    unread: run(ENR, [],         false),  // 못 읽었다 → 예전 그대로(fail-open)
    en:     run(ENR, [],         true, 'en')
  };
} catch (e) {
  ok('[전제] 렌더가 가짜 DOM 에서 돈다', false, String(e && e.message || e));
}

/* ⚠️ 주간 카드는 border-left 3px 실선, AI 오버레이는 border 2px dashed 라 서로 다르다.
   그래서 이 모양은 «수강신청 카드» 만 가리킨다(AI 카드에 걸려 헛돌지 않는다). */
if (R.dead) {
  ok('판정: 살아 있는 수업이 0건이면 «없음»', R.dead.live === false);
  ok('짝 — 살아 있으면 «있음»',              R.alive.live === true);
  ok('짝 — 남의 신청 수업은 안 센다',         R.other.live === false);
  ok('짝 — 못 읽었으면 «있음»(fail-open)',   R.unread.live === true);

  const W_CARD = 'background:' + TRIAL.bg + ';border-left:3px solid ' + TRIAL.border;
  const M_CARD = 'background:' + TRIAL_M.bg + ';border-left:3px solid ' + TRIAL_M.b;

  console.log('\n② 주간 뷰 — 실제로 그려진 HTML');
  ok('캘린더에 그리지 않는다(카드 0개)', !R.dead.week.includes(W_CARD));
  ok('그 신청의 강사 이름도 안 남는다',   !R.dead.week.includes('중국어 강선생님'));
  ok('짝 — 살아 있으면 예전 그대로 그린다', R.alive.week.includes(W_CARD) && R.alive.week.includes('중국어 강선생님'));
  ok('짝 — 못 읽었으면 예전 그대로 그린다', R.unread.week.includes(W_CARD) && R.unread.week.includes('중국어 강선생님'));
  ok('짝 — 남의 신청 수업뿐이면 안 그린다', !R.other.week.includes(W_CARD));
  /* 2026-09-21 사장님이 «회색으로 낮추기»(#1059)를 «안 그리기» 로 바꾸셨다 —
     회색 카드로 되돌아가면 그 지시가 조용히 풀린 것이다. */
  ok('회색 카드로 되돌아가지 않았다',
     !R.dead.week.includes('신청만') && !R.dead.week.includes('수업 없음'));

  console.log('\n③ 월간 뷰 — «같은» 정본을 쓴다');
  ok('캘린더에 그리지 않는다',            !R.dead.month.includes(M_CARD));
  ok('짝 — 살아 있으면 그대로',           R.alive.month.includes(M_CARD));
  ok('짝 — 못 읽었으면 그대로',           R.unread.month.includes(M_CARD));
  ok('회색 카드로 되돌아가지 않았다',      !R.dead.month.includes('신청만'));

  console.log('\n④ «안 그린 N건» 한 줄 — 어긋남이 화면에서 사라지지 않게');
  ok('안 그렸으면 안내 줄이 보인다', R.dead.weekNote && R.dead.weekNote.display !== 'none', JSON.stringify(R.dead.weekNote));
  ok('건수를 말한다(1건)',           !!(R.dead.weekNote && /(^|[^0-9])1건/.test(R.dead.weekNote.text)), R.dead.weekNote && R.dead.weekNote.text);
  /* ⚠️ 한 신청이 9월 금요일 세 번(11·18·25)에 걸려도 «1건» 이라야 한다 — 날짜가 아니라 신청 id 로 센다. */
  ok('월간에서도 여러 날 → 1건',      !!(R.dead.monthNote && /(^|[^0-9])1건/.test(R.dead.monthNote.text)), R.dead.monthNote && R.dead.monthNote.text);
  ok('짝 — 살아 있으면 안내가 없다',  !!(R.alive.weekNote) && R.alive.weekNote.display === 'none' && R.alive.weekNote.text === '');
  ok('짝 — 못 읽었으면 안내가 없다',  !!(R.unread.weekNote) && R.unread.weekNote.display === 'none');
  ok('짝 — 월간도 살아 있으면 없다',  !!(R.alive.monthNote) && R.alive.monthNote.display === 'none');
  ok('영어에서는 영어로 말한다',      !!(R.en.weekNote) && /no live class/.test(R.en.weekNote.text) && !/건은/.test(R.en.weekNote.text), R.en.weekNote && R.en.weekNote.text);
  ok('짝 — 한국어는 한국어로',        !!(R.dead.weekNote) && /수강신청/.test(R.dead.weekNote.text));
}

console.log('\n⑤ 배선·구조');
const code = stripComments(html);
ok('판정 정본은 한 곳뿐(복제 금지)',
  (code.match(/function mgsEnrHasLiveClass\s*\(/g) || []).length === 1);
ok('안내 정본도 한 곳뿐(복제 금지)',
  (code.match(/function mgsSetGhostNote\s*\(/g) || []).length === 1);
ok('주간 렌더가 그 정본을 부른다',  /mgsEnrHasLiveClass\s*\(/.test(stripComments(weekSrc)));
ok('월간 렌더가 그 정본을 부른다',  /mgsEnrHasLiveClass\s*\(/.test(stripComments(monthSrc)));
ok('주간 렌더가 안내를 갱신한다',   /mgsSetGhostNote\s*\(/.test(stripComments(weekSrc)));
ok('월간 렌더가 안내를 갱신한다',   /mgsSetGhostNote\s*\(/.test(stripComments(monthSrc)));
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

console.log('\n⑥ 화면 요소 · 색');
ok('안내 줄 요소가 마크업에 있다', /id="d-sched-ghost-note"/.test(html));
ok('기본은 숨김이다',              /id="d-sched-ghost-note"[^>]*display:none/.test(html));
/* 회색 카드를 안 그리므로 그 범례가 남아 있으면 화면이 없는 것을 설명한다. */
ok('옛 회색 범례는 지웠다',        !html.includes('신청만 · 수업 없음'));

/* ⚠️ 이 화면은 adm-light-theme.css 를 실어 «밝은» 테마다 — 어두운 패널인 줄 알고
      #cbd5e1 같은 밝은 글자를 주면 대비 1.36 으로 안 읽힌다(실제로 한 번 그렇게 줬다).
   ⛔ 색을 하니스에 손으로 적지 말고 마크업에서 «읽어» 잰다. */
const noteStyle = (html.match(/id="d-sched-ghost-note"[^>]*style="([^"]*)"/) || [])[1] || '';
const pick = (k) => (noteStyle.match(new RegExp('(?:^|;)\\s*' + k + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1] || '';
const NOTE_FG = pick('color'), NOTE_BG = pick('background');
ok('[전제] 안내 줄 글자색·배경색을 읽었다', !!(NOTE_FG && NOTE_BG), NOTE_FG + ' on ' + NOTE_BG);
const lum = (hex) => {
  const v = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16) / 255)
    .map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
};
const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); const hi = Math.max(L1,L2), lo = Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };
const cr = (NOTE_FG && NOTE_BG) ? ratio(NOTE_FG, NOTE_BG) : 0;
ok('안내 줄 글자 대비 ≥ 4.5 (AA)', cr >= 4.5, cr.toFixed(2));


console.log('\n⑦ 안내 줄이 «가리키는 곳» 이 실재하는가');
/* 🔴 처음에 「아래 «수강신청 이력»」이라 적었는데 그 표는 **다른 표**(카페24 ClassOrders)이고
   **📋 평가서 탭** 안이며 조건부라 없을 수도 있었습니다 — 감추기를 막으려 넣은 줄이
   «없는 곳» 으로 사람을 보냈습니다(함정 대조가 잡음).
   ⛔ 탭 이름을 하니스에 손으로 적지 말고 **탭 버튼에서 읽어** 대조합니다. */
const tabKo = (html.match(/data-tab="enrollment"\s+data-ko="([^"]+)"/) || [])[1] || '';
const tabEn = (html.match(/data-tab="enrollment"[^>]*data-en="([^"]+)"/) || [])[1] || '';
ok('[전제] 📝 등록·수강 탭 이름을 읽었다', !!(tabKo && tabEn), tabKo + ' / ' + tabEn);
if (R.dead && R.dead.weekNote) {
  ok('그 신청이 실제로 남아 있는 탭을 가리킨다', R.dead.weekNote.text.includes(tabKo), R.dead.weekNote.text);
  ok('영어도 같은 곳을 가리킨다(한쪽만 사실이면 안 된다)',
     !!(R.en && R.en.weekNote) && R.en.weekNote.text.includes(tabEn), R.en && R.en.weekNote.text);
  ok('다른 표(「수강신청 이력」)로 보내지 않는다', !R.dead.weekNote.text.includes('수강신청 이력'));
}

console.log('\n⑧ 주간·월간이 «같은 건수» 를 말하는가');
/* 판정 호출이 주간에서 요일·시각 매칭 «앞» 에 있으면, 그 주에 원래 안 그려질 신청까지 세어
   「그리지 않았습니다」가 거짓이 됩니다(두 뷰가 한 화면에서 다른 답을 하는 사고). */
const NO_DAY = [{ id: 103, status:'confirmed', type:'체험수업', days_of_week:'', time:'14:20',
  class_size:'1:1', teacher_name:'중국어 강선생님',
  started_at: new Date('2026-09-11T00:00:00').getTime(), end_date:'2026-10-11' }];
/* 그 주에는 칸이 없고(월) 월간에는 있는 신청 — 주간이 세면 거짓이다. */
const MON_ONLY = [{ id: 103, status:'confirmed', type:'체험수업', days_of_week:'월', time:'14:20',
  class_size:'1:1', teacher_name:'중국어 강선생님',
  started_at: new Date('2026-09-23T00:00:00').getTime(), end_date:'2026-10-11' }];
let N = {}, M = {};
try { N = run(NO_DAY, [], true); M = run(MON_ONLY, [], true); } catch (e) { ok('[전제] 돌았다', false, String(e && e.message)); }
if (N.weekNote) {
  const n = (t) => { const m = String(t||'').match(/(\d+)건/); return m ? +m[1] : (String(t||'') ? -1 : 0); };
  ok('요일이 없는 신청 — 주간은 세지 않는다', n(N.weekNote.text) === 0, JSON.stringify(N.weekNote));
  ok('짝 — 월간도 세지 않는다',              n(N.monthNote.text) === 0, JSON.stringify(N.monthNote));
  ok('그 주에 칸이 없는 신청 — 주간은 세지 않는다', n(M.weekNote.text) === 0, JSON.stringify(M.weekNote));
  ok('짝 — 월간에는 칸이 있으므로 센다',       n(M.monthNote.text) === 1, JSON.stringify(M.monthNote));
  ok('짝 — 그래도 카드는 안 그린다(주간·월간)',
     !M.week.includes('중국어 강선생님') && !M.month.includes('중국어 강선생님'));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail + '\n');
process.exit(fail > 0 ? 1 : 0);
