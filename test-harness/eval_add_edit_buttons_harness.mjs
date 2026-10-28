// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   ✏️➕ 「오늘 수업」 지난/오늘 피드백 칸의 «고치기 · 추가» 버튼 — 2026-10-28

   [왜] 매니저·강사 제안 3번: 「강사·매니저 화면에서 오늘 피드백과 지난 피드백을 고치고 추가하는 버튼을」.
        그전에는 글이 있으면 «📄 전문 보기» 링크 → 창 안의 «✏️ 고치기» 로 두 번 눌러야 했고,
        글이 없으면(«—») 아무것도 할 수 없었다.
   [무엇을]
     A. 세 화면(admin.html = js/adm-today-classes.js xEvalAct · manager.html evAct · teacher.html extrasHtml)의
        버튼 조건을 **오려 내 같은 입력으로 실제로 돌려** 답이 같은지 본다. manager·teacher 는 «외부 리소스 0개»
        계약이라 판정이 두 벌·세 벌일 수밖에 없다 — 한쪽만 고쳐지면 여기서 빨간불.
     B. 공용 창(js/eval-quick-view.js) — 쓰기 화면 renderCreate · «지난 회차» 고르기(서버 prev_classes 그대로, 짐작 없음).
     C. 배선 — 버튼 속성 이름이 창 안 버튼(data-evq-edit)과 안 겹친다 · 세 화면이 같은 ?v= · 바로 고치기(opts.edit).
   ⚠️ 판정마다 «준다» 와 «안 준다» 를 짝으로 둔다 — 한쪽만 두면 «늘 준다/늘 안 준다» 가 통과한다.
   브라우저로 실제로 눌러 보는 검사는 test-harness/manual/eval-add-edit-browser.mjs (게이트 밖).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const ADM = readFileSync(process.env.ADM_SRC || join(PUB, 'js', 'adm-today-classes.js'), 'utf8');
const MGR = readFileSync(process.env.MGR_SRC || join(PUB, 'manager.html'), 'utf8');
const TCH = readFileSync(process.env.TCH_SRC || join(PUB, 'teacher.html'), 'utf8');
const VIEW = readFileSync(process.env.EVQ_SRC || join(PUB, 'js', 'eval-quick-view.js'), 'utf8');
const ADMIN_HTML = readFileSync(join(PUB, 'admin.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? '  → ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
function braceFrom(src, start) {
  const j = src.indexOf('{', start);
  if (j < 0 || start < 0) return '';
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  return '';
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ── A. 세 화면의 버튼 조건 ─────────────────────────────────── */
console.log('\n[A] 세 화면의 «고치기 · 추가» 조건을 실제로 돌린다');
let admAct = null, mgrAct = null, tchExtras = null;
{
  const i = ADM.indexOf('function xEvalAct(s, which)');
  const src = i >= 0 ? braceFrom(ADM, i) : '';
  ok('A-0 전제: 관리자 xEvalAct 를 오려 냈다', src.length > 200);
  try { admAct = new Function('esc', 'T', 'function xEvalAct(s, which)' + src + ' return xEvalAct;')(esc, (ko, en) => en); }
  catch (e) { ok('A-0b 관리자 xEvalAct 를 만들 수 있다', false, e.message); }
}
{
  const i = MGR.indexOf('var evAct = function (which) {');
  const body = i >= 0 ? braceFrom(MGR, i) : '';
  ok('A-0c 전제: 매니저 evAct 를 오려 냈다', body.length > 200);
  try { mgrAct = new Function('esc', 'T', 'return function (r, which) { var evAct = function (which)' + body + '; return evAct(which); };')(esc, (en) => en); }
  catch (e) { ok('A-0d 매니저 evAct 를 만들 수 있다', false, e.message); }
}
{
  const i = TCH.indexOf('  function extrasHtml(c, wi, asParts){');
  const src = i > 0 ? braceFrom(TCH, i) : '';
  ok('A-0e 전제: 강사 extrasHtml 을 오려 냈다', src.length > 200);
  try { tchExtras = new Function('esc', 'T', 'hhmm', 'EN', 'function x(c, wi, asParts)' + src + ' return x;')(esc, (en) => en, () => '09:00', () => true); }
  catch (e) { ok('A-0f 강사 extrasHtml 을 만들 수 있다', false, e.message); }
}
const has = (h, re) => re.test(String(h || ''));
const ADD_LAST = /data-evq-new="last"/, ADD_TODAY = /data-evq-new="today"/, FIX = /data-evq-fix="(\d+)"/;
const PREV = [{ date: '2026-10-26', room_id: 'class-6640-20261026', time: '15:20' }, { date: '2026-10-23', room_id: 'class-6642-20261023', time: null }];
const BASE = {
  student_uid: 'stu01', student_name: 'Mina', teacher_name: 'Kaye', room_id: 'class-6648-20261028',
  class_date: '2026-10-28', status: 'ended', source: 'mangoi', eval_hidden: false,
  last_eval: null, today_eval: null, attendance: { state: 'attended' }, prev_classes: PREV,
};
const CASES = [
  // [이름, 줄, 지난(add|fix|none), 오늘(add|fix|none)]
  ['글이 없고 수업이 끝났다', {}, 'add', 'add'],
  ['수업 중(live)', { status: 'live' }, 'add', 'add'],
  ['수업 전(open) — 오늘은 안 준다', { status: 'open' }, 'add', 'none'],
  ['예정(early) — 오늘은 안 준다', { status: 'early' }, 'add', 'none'],
  ['연기됨 — 오늘은 안 준다', { status: 'postponed' }, 'add', 'none'],
  ['휴강 — 오늘은 안 준다', { status: 'holiday' }, 'add', 'none'],
  ['지난·오늘 글이 있다 → 고치기', { last_eval: { id: 41, text: 'x' }, today_eval: { id: 42, text: 'y' } }, 'fix:41', 'fix:42'],
  ['글은 있는데 번호가 없다(옛 응답) → 아무것도 안 준다', { last_eval: { text: 'x' }, today_eval: { text: 'y' } }, 'none', 'none'],
  ['본사 전용(지사·대리점) → 아무것도 안 준다', { eval_hidden: true, last_eval: { id: 41 } }, 'none', 'none'],
  ['카페24 줄 → 아무것도 안 준다', { source: 'cafe24', room_id: 'c24-991', last_eval: { id: 41 } }, 'none', 'none'],
  ['학생 아이디가 없다 → 추가 안 줌', { student_uid: '' }, 'none', 'none'],
  ['지난 회차 목록이 없다(옛 응답·요일 칸 없음) → 지난 추가 안 줌(짐작해 지어내지 않는다)', { prev_classes: undefined }, 'none', 'add'],
  ['지난 회차 목록이 비었다 → 지난 추가 안 줌', { prev_classes: [] }, 'none', 'add'],
  ['방 번호가 결정론이 아니어도 지난 회차가 있으면 지난 추가는 준다(방은 회차의 것)', { room_id: 'demo-1' }, 'add', 'add'],
];
const verdict = (h, which) => {
  const re = which === 'last' ? ADD_LAST : ADD_TODAY;
  const m = String(h || '').match(FIX);
  if (m) return 'fix:' + m[1];
  if (re.test(String(h || ''))) return 'add';
  return 'none';
};
if (admAct && mgrAct) {
  for (const [name, patch, wantLast, wantToday] of CASES) {
    const s = { ...BASE, ...patch };
    const a = [verdict(admAct(s, 'last'), 'last'), verdict(admAct(s, 'today'), 'today')];
    const m = [verdict(mgrAct(s, 'last'), 'last'), verdict(mgrAct(s, 'today'), 'today')];
    ok('A-1 관리자: ' + name, a[0] === wantLast && a[1] === wantToday, a);
    ok('A-2 매니저 = 관리자: ' + name, m[0] === a[0] && m[1] === a[1], { mgr: m, adm: a });
  }
  const x = admAct({ ...BASE, student_uid: 'a"b<i>' }, 'today');
  ok('A-3 관리자: 학생 아이디를 탈출한다(XSS)', !/<i>/.test(x) && /a&quot;b/.test(x), x);
  const y = mgrAct({ ...BASE, student_uid: 'a"b<i>' }, 'today');
  ok('A-4 매니저: 학생 아이디를 탈출한다(XSS)', !/<i>/.test(y) && /a&quot;b/.test(y), y);
  ok('A-5 관리자: 버튼은 <button> 이 아니다(전역 인디고 알약 규칙)', !/<button/.test(admAct(BASE, 'last') + admAct({ ...BASE, last_eval: { id: 3 } }, 'last')));
}
if (tchExtras && admAct) {
  // 강사 화면은 «지난 추가» 만 새로 준다(오늘 쓰기 = 기존 「✍ 피드백 작성」, 고치기 = 기존 「📄 보기 / 수정」)
  const tLast = (c) => { const p = tchExtras(c, -1, true); return p ? verdict(p.last, 'last') : 'null'; };
  for (const [name, patch] of CASES) {
    const s = { ...BASE, ...patch };
    if (s.eval_hidden) continue;   // 강사 포털은 평가를 늘 싣는다(class_today_extras_harness 가 본다)
    const want = verdict(admAct(s, 'last'), 'last') === 'add' ? 'add' : 'none';
    const got = tLast(s) === 'add' ? 'add' : 'none';
    ok('A-6 강사 «지난 추가» = 관리자: ' + name, got === want, { tch: got, adm: want });
  }
  ok('A-7 강사: 이전 수업 요약(prev_lesson)의 일지가 있으면 «지난 추가» 를 안 준다(짝)',
    tLast({ ...BASE, prev_lesson: { eval_id: 77, date: '2026-10-27' } }) !== 'add');
  ok('A-8 강사: 옛 LMS 줄(source=lms)에는 안 준다', tLast({ ...BASE, source: 'lms' }) !== 'add');
  ok('A-9 강사: 안내용 줄(kind≠class)에는 안 준다', tLast({ ...BASE, kind: 'lms' }) !== 'add');
  const card = tchExtras({ ...BASE }, 3, false);
  ok('A-10 강사 카드 보기에도 «지난 추가» 가 붙는다', ADD_LAST.test(card));
  ok('A-11 강사: 기존 «📄 보기 / 수정» · «✍ 피드백 작성» 은 그대로', /View \/ Edit/.test(tchExtras({ ...BASE, last_eval: { id: 9 } }, 3, false))
    && /data-eval="3"/.test(card));
}

/* ── B. 공용 창 ─────────────────────────────────────────────── */
console.log('\n[B] 공용 창 — 쓰기 화면 · 날짜 짐작 · 방 번호');
const win = {};
vm.runInNewContext(VIEW, { window: win, document: { getElementById: () => null, head: { appendChild() {} } }, fetch: () => new Promise(() => {}), console });
const Q = win.mgEvalQuick || {};
ok('B-0 전제: create · _renderCreate · _pickable 가 있다',
  typeof Q.create === 'function' && typeof Q._renderCreate === 'function' && typeof Q._pickable === 'function');
if (typeof Q._pickable === 'function') {
  const P = (list) => Q._pickable({ class_date: '2026-10-28', prev_classes: list });
  ok('B-1 서버 목록을 그대로 고를 수 있다', P(PREV).length === 2 && P(PREV)[0].room_id === 'class-6640-20261026');
  ok('B-2 이 수업 날짜·이후 회차는 거른다(짝)', P([{ date: '2026-10-28', room_id: 'class-1-20261028' }, { date: '2026-10-29', room_id: 'class-1-20261029' }]).length === 0);
  ok('B-3 모양이 틀린 방 번호는 거른다(지어낸 값·주입)', P([{ date: '2026-10-26', room_id: 'class-1-20261026"x' }, { date: '2026-10-26', room_id: 'c24-1' }, { date: 'x', room_id: 'class-1-20261026' }]).length === 0);
  ok('B-4 목록이 없으면 빈 목록(짐작해 만들지 않는다)', P(undefined).length === 0 && P(null).length === 0);
}
if (typeof Q._renderCreate === 'function') {
  const last = Q._renderCreate({ which: 'last', student_name: '<img src=x>', class_date: '2026-10-28', room_id: 'class-1-20261028', prev_classes: PREV }, true);
  const lastKo = Q._renderCreate({ which: 'last', student_name: 'Mina', class_date: '2026-10-28', prev_classes: PREV }, false);
  const today = Q._renderCreate({ which: 'today', student_name: 'Mina', class_date: '2026-10-28', room_id: 'class-1-20261028', prev_classes: PREV }, false);
  ok('B-5 지난: 회차 고르기 칸 — 서버 회차가 날짜(요일)·시각으로 보인다', /data-evq-pick/.test(last) && /2026-10-26 \(Mon\) 15:20/.test(last) && /2026-10-23 \(Fri\)/.test(last), last.match(/<option[^>]*>[^<]*/g));
  ok('B-6 지난: 한국어 화면은 한국어 요일', /2026-10-26 \(월\) 15:20/.test(lastKo));
  ok('B-7 지난: 맨 위(가장 최근)가 기본으로 골라진다', /<select class="evq-in" data-evq-pick><option value="0">2026-10-26/.test(last));
  ok('B-8 오늘: 고르기 칸이 없다(짝)', !/data-evq-pick/.test(today));
  ok('B-9 날짜를 짐작하는 칸(type=date)이 없다', !/type="date"/.test(last + today));
  ok('B-10 지난: 학부모 문자 칸이 없다(문자 본문이 «오늘 수업 일지» 라 거짓이 된다)', !/data-evq-sms/.test(last));
  ok('B-11 오늘: 학부모 문자 칸이 있고 기본은 꺼져 있다(짝)', /<input type="checkbox" data-evq-sms>/.test(today) && !/data-evq-sms[^>]*checked/.test(today));
  ok('B-12 글 두 칸 + 한국어로 만들기', /data-evq-f="note_en"/.test(today) && /data-evq-f="note_ko"/.test(today) && /data-evq-tr/.test(today));
  ok('B-13 점수 칸이 없다(별점은 강사 일지 창의 몫)', !/score/.test(last + today));
  ok('B-14 이름을 탈출한다(XSS)', !/<img/.test(last));
  ok('B-15 한/영 — 한국어 화면은 한국어', /오늘 피드백 추가/.test(today) && /Add last class feedback/.test(last));
}
{
  const i = VIEW.indexOf('function showCreate(ctx, en, opts)');
  const src = i >= 0 ? braceFrom(VIEW, i) : '';
  ok('C-0 전제: showCreate 를 오려 냈다', src.length > 500);
  ok('C-1 저장은 강사 일지와 같은 길(/api/eval/manual-create)', /fetch\('\/api\/eval\/manual-create'/.test(src));
  ok('C-2 문자는 «오늘 + 고른 경우» 에만 notify_parent', /var sms = !last && !!\(smsBox && smsBox\.checked\)/.test(src) && /notify_parent: sms/.test(src));
  ok('C-3 지난: 고른 회차의 날짜·방을 그대로 쓴다(화면에서 방을 지어내지 않는다)', /var date = last \? pick\.date/.test(src) && /var room = last \? pick\.room_id/.test(src) && !/replace\(\/-\/g/.test(src));
  ok('C-4 지난: 고른 회차가 없으면 저장하지 않는다', /if \(last && !pick\)/.test(src));
  ok('C-5 teacher_uid 는 부르는 쪽이 넘긴 «쓰는 사람» 만(수업 강사로 채우지 않는다)', /teacher_uid: ctx\.teacher_uid \|\| null/.test(src));
  ok('C-6 저장 성공은 «ok === true + id» 로 가른다', /x\.st === 200 && x\.d && x\.d\.ok === true && x\.d\.id/.test(src));
  ok('C-7 두 번 눌러도 두 번 저장하지 않는다', /if \(saving\) return;/.test(src) && /saving = true/.test(src));
  ok('C-8 문자 결과를 서버 응답 그대로 말한다(밤 미룸·보냄·실패·번호 없음)', /notifyLine\(sms, x\.d\.notify, en\)/.test(src));
}
{
  ok('C-9b 고를 회차가 없으면 «지난» 창을 열지 않는다', /if \(ctx\.which === 'last' && !pickableClasses\(ctx\)\.length\) return;/.test(VIEW));
  ok('C-9 바로 고치기(opts.edit)는 서버가 허락할 때만, 아니면 보기 화면', /if \(opts && opts\.edit === true && ev\.__canEdit\) showEdit\(ev, en, opts\);\s*else showView/.test(VIEW));
}

/* ── D. 배선 ────────────────────────────────────────────────── */
console.log('\n[D] 배선 — 속성 이름 · 버전 · 다시 그리기');
ok('D-1 표의 버튼은 data-evq-fix / data-evq-new — 창 안 버튼(data-evq-edit)과 안 겹친다',
  // «만드는 표시» 와 «찾는 선택자» 만 본다 — 왜 안 쓰는지 적은 주석은 그 이름을 담고 있다(자기 주석을 잡지 않게)
  [ADM, MGR, TCH].every((s) => !/data-evq-edit[=\]]/.test(s)) && /\[data-evq-edit\]/.test(VIEW));
const vers = [ADM, MGR, TCH].map((s) => (s.match(/eval-quick-view\.js\?v=(\d+)/g) || []).map((x) => x.split('=')[1]));
ok('D-2 세 화면이 공용 창을 같은 ?v= 로 부른다(한 화면 안에서도 하나)', vers.every((v) => v.length >= 1 && v.every((x) => x === vers[0][0])), vers);
ok('D-3 관리자: 표 두 칸에 버튼을 붙였다', /xEval\(s\.last_eval, s\.eval_hidden\) \+ xEvalAct\(s, 'last'\)/.test(ADM) && /xEval\(s\.today_eval, s\.eval_hidden\) \+ xEvalAct\(s, 'today'\)/.test(ADM));
ok('D-4 관리자: 정렬값(tcSortVal)에는 버튼 글자가 섞이지 않는다', !/tcPlain\([^)]*xEvalAct/.test(ADM));
ok('D-5 관리자: 쓰거나 고친 뒤 표를 다시 받는다', /function evqSaved\(\) \{ try \{ window\.tcLoadToday\(\); \}/.test(ADM));
ok('D-6 매니저: 두 줄에 버튼을 붙였다', /ev\(r\.last_eval\) \+ evAct\('last'\)/.test(MGR) && /ev\(r\.today_eval\) \+ evAct\('today'\)/.test(MGR));
ok('D-7 매니저: 끝 스크립트가 IIFE 안 목록을 taEvalHook 으로 찾고, 다 쓰면 _stale 로 다시 받는다',
  /window\.taEvalHook = \{/.test(MGR) && /D\.todayAll\._stale = true; window\.loadTodayAll\(\)/.test(MGR));
ok('D-8 강사: 위임 → teacher-feedback-new → 공용 창 create', /dispatchEvent\(new CustomEvent\('teacher-feedback-new'/.test(TCH)
  && /addEventListener\('teacher-feedback-new'[\s\S]{0,400}mgEvalQuick\.create\(ctx/.test(TCH));
ok('D-9 강사: 쓰는 사람 = 이 강사(teacher_uid = 내 아이디)', /teacher_uid:DATA\.me && DATA\.me\.username/.test(TCH));
ok('D-9b 세 화면 모두 서버 회차(prev_classes)를 창에 넘긴다', /prev_classes: s\.prev_classes/.test(ADM) && /prev_classes: r\.prev_classes/.test(MGR) && /prev_classes:c\.prev_classes/.test(TCH));
ok('D-9c 강사: 다시그리기 지문에 지난 회차 목록이 있다(캐시 뒤 서버 응답에서 버튼이 뜨게)', /sc\.prev_classes\.length/.test(TCH));
ok('D-10 manager·teacher 는 공용 창을 정적 <script src> 로 싣지 않는다(외부 리소스 0개)',
  !/<script[^>]+src="\/js\/eval-quick-view/.test(MGR) && !/<script[^>]+src="\/js\/eval-quick-view/.test(TCH));
ok('D-11 관리자 CSS: 버튼 색은 조상 id 로(인라인은 카드 규칙에 눌린다)', /admin-inline-c\.css\?v=85/.test(ADMIN_HTML)
  && /#sm-today-classes span\.tc-evq-act\{/.test(readFileSync(join(PUB, 'css', 'admin-inline-c.css'), 'utf8')));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) process.exit(1);
