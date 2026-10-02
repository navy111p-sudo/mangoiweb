// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   ✏️ 평가(1분 수업일지) «고치기 · 지금 쓰기» + 카페24 줄 안내 — 2026-10-01

   [왜] 매니저 요청(9/30): 「오늘 수업」 줄에서 오늘·지난 평가를 «바로 열고 고치거나 쓰게» 해 달라.
        «바로 열기» 는 9/30 에 붙었고(eval_quick_view_harness), 이번에 «고치기»·«쓰기» 를 붙였다.
        그리고 «왜 어떤 줄엔 연기·변경 버튼이 없나» — 카페24 줄이 아무 말도 안 하고 있었다.
   [무엇을]
     A. 서버 판정 evalEditAllowed 를 **오려 내 실제로 돌린다** — 강사는 자기 것만 · 본사는 전부 ·
        지사·대리점은 못 고침 · 모르면 막음 (짝으로).
     B. PATCH /api/eval/:id 라우트를 **가짜 D1 로 실제로 실행** — 글 세 칸만 고치고, 고치기 전 글을
        이력에 남기고, 남의 일지는 403, 학부모 문자는 다시 안 보낸다.
     C. 공용 창 renderEval/renderEdit — 서버가 can_edit 을 줄 때만 「✏️ 고치기」(짝).
     D. 강사 화면 「✍ 지금 쓰기」 — 시작 전·이미 쓴 것·연기된 것에는 안 준다(짝).
     E. 매니저 화면 — 카페24 줄에 «왜 버튼이 없는지» 를 글자로.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const LES = readFileSync(process.env.LES_SRC || join(CF, 'src', 'api-lessons.ts'), 'utf8');
const AUTH = readFileSync(join(CF, 'src', 'auth-admin.ts'), 'utf8');
const VIEW = readFileSync(process.env.EVQ_SRC || join(CF, 'public', 'js', 'eval-quick-view.js'), 'utf8');
const TCH = readFileSync(process.env.TCH_SRC || join(CF, 'public', 'teacher.html'), 'utf8');
const MGR = readFileSync(process.env.MGR_SRC || join(CF, 'public', 'manager.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
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
const stripTs = (t) => t
  .replace(/\bas any\[\]/g, '').replace(/\bas any\b/g, '')
  .replace(/:\s*Record<string,\s*[^>]+>/g, '')
  .replace(/:\s*any\[\]/g, '').replace(/:\s*any\b/g, '')
  .replace(/\((\w+):\s*string\)/g, '($1)');

/* ── A. evalEditAllowed ─────────────────────────────────────── */
console.log('\n[A] 서버 판정 evalEditAllowed 를 실제로 돌린다');
const orgBody = braceFrom(AUTH, AUTH.indexOf('export function isOrgScopedRole('));
const isOrg = new Function('role', stripTs(orgBody).replace(/^\{|\}$/g, ''));
// 시그니처의 타입 «안» 에도 { } 가 있으므로 «): boolean {» 뒤 첫 중괄호부터 자른다
const ai = LES.indexOf('export function evalEditAllowed(');
const bi = ai >= 0 ? LES.indexOf('): boolean {', ai) : -1;
const allowSrc = bi > 0 ? braceFrom(LES, bi) : '';
ok('A-0 전제: evalEditAllowed 를 오려 냈다', allowSrc.length > 100);
let allow = () => { throw new Error('not built'); };
try { allow = new Function('isOrgScopedRole', 'actor', 'row', allowSrc.slice(1, -1)).bind(null, isOrg); }
catch (e) { ok('A-0b 만들 수 있다', false, e.message); }
const run = (a, r) => { try { return allow(a, r); } catch (e) { return 'THROW:' + e.message; } };
const T1 = { ok: true, username: 'mangoi_018', role: 'teacher', isTeacher: true };
ok('A-1 강사: 자기가 쓴 것은 고친다', run(T1, { teacher_uid: 'mangoi_018' }) === true);
ok('A-2 강사: 대소문자만 달라도 자기 것', run(T1, { teacher_uid: 'Mangoi_018' }) === true);
ok('A-3 강사: 남이 쓴 것은 못 고친다(짝)', run(T1, { teacher_uid: 'mangoi_007' }) === false);
ok('A-4 강사: 쓴 사람이 비어 있으면 못 고친다', run(T1, { teacher_uid: null }) === false);
ok('A-5 강사: 부분일치로 안 붙는다', run(T1, { teacher_uid: 'mangoi_0180' }) === false);
ok('A-6 본사 매니저: 남이 쓴 것도 고친다', run({ ok: true, username: 'mgr_karl', role: 'hq', isTeacher: false }, { teacher_uid: 'mangoi_007' }) === true);
for (const r of ['branch', 'agency', 'franchise']) {
  ok('A-7 ' + r + ': 못 고친다', run({ ok: true, username: 'branch_busan', role: r, isTeacher: false }, { teacher_uid: 'x' }) === false);
}
ok('A-8 세션 없음: 못 고친다', run({ ok: false, username: '', role: 'none', isTeacher: false }, { teacher_uid: 'x' }) === false);
ok('A-9 아이디 비어 있음: 못 고친다', run({ ok: true, username: '', role: 'hq', isTeacher: false }, { teacher_uid: 'x' }) === false);
ok('A-10 행 없음: 못 고친다', run({ ok: true, username: 'mgr', role: 'hq', isTeacher: false }, null) === false);

/* ── B. PATCH 라우트 실제 실행 ──────────────────────────────── */
console.log('\n[B] PATCH /api/eval/:id 를 가짜 D1 로 실제로 돌린다');
const pi = LES.indexOf("if (method === 'PATCH' && /^\\/api\\/eval\\/\\d+$/.test(path))");
const di = LES.indexOf("if (method === 'DELETE' && /^\\/api\\/eval\\/\\d+$/.test(path))");
ok('B-0 전제: PATCH 라우트를 찾았다', pi > 0);
ok('B-0b PATCH 가 DELETE 보다 앞(같은 경로 다른 메서드)', pi > 0 && di > pi);
const patchBlock = pi > 0 ? braceFrom(LES, pi) : '';
ok('B-0c 그 블록에 문자 발송이 없다(학부모에게 다시 안 보낸다)', patchBlock && !/sendPlainSms|sendKakaoAlimtalk|solapi|notify_pending\s*=\s*1/.test(patchBlock));
let routeFn = null;
try {
  routeFn = new Function('ctx', 'with (ctx) { return (async () => ' + stripTs(patchBlock) + ')(); }');
} catch (e) { ok('B-0d 라우트를 만들 수 있다', false, e.message); }
const allowForRoute = (a, r) => allow(a, r);
async function callPatch(actor, row, body) {
  const runs = [];
  const DB = {
    prepare(sql) {
      const st = { sql, binds: [] };
      return {
        bind(...b) { st.binds = b; return this; },
        async first() { return /SELECT \* FROM student_evaluations/.test(sql) ? row : null; },
        async run() { runs.push(st); return { success: true }; },
      };
    },
  };
  let resp = null;
  const json = (b, s) => ({ status: s || 200, body: b });
  try {
    resp = await routeFn({
      method: 'PATCH', path: '/api/eval/' + (row ? row.id : 9), env: { DB },
      request: { json: async () => body },
      getAdminActor: async () => actor, ensureEvalTable: async () => {}, json,
      evalEditAllowed: allowForRoute, Date, JSON, String, Number, Object,
    });
  } catch (e) { resp = { status: 'THROW', body: { error: e.message } }; }
  return { resp, runs };
}
if (routeFn) {
  const ROW = { id: 41, teacher_uid: 'mangoi_018', note_en: 'old en', note_ko: '예전 글', teacher_comment: null, parent_notified: 1, edit_history: null };
  const MGR_ACT = { ok: true, username: 'mgr_karl', role: 'hq', isTeacher: false };
  {
    const { resp, runs } = await callPatch(T1, { ...ROW }, { note_en: 'new en', note_ko: '새 글입니다', score_overall: 1 });
    ok('B-1 자기 일지는 200', resp.status === 200 && resp.body.ok === true, JSON.stringify(resp));
    const up = runs.find(r => /UPDATE student_evaluations/.test(r.sql));
    ok('B-2 UPDATE 가 나갔다', !!up);
    ok('B-3 점수(score_*)는 안 고친다', up && !/score_/.test(up.sql));
    ok('B-4 바뀐 글이 그대로 들어간다', up && up.binds.includes('new en') && up.binds.includes('새 글입니다'));
    const hist = up && up.binds.find(b => typeof b === 'string' && b.startsWith('['));
    ok('B-5 고치기 전 글을 이력에 남긴다', !!hist && hist.includes('old en') && hist.includes('예전 글'));
    ok('B-6 누가 고쳤는지 남긴다', up && up.binds.includes('mangoi_018'));
    ok('B-7 학부모에게 이미 갔다는 사실을 알려 준다', resp.body.parent_notified === true);
  }
  {
    const { resp, runs } = await callPatch(T1, { ...ROW, teacher_uid: 'mangoi_007' }, { note_en: 'x' });
    ok('B-8 남이 쓴 일지는 403 not_your_eval(짝)', resp.status === 403 && resp.body.error === 'not_your_eval');
    ok('B-9 그때 UPDATE 는 안 나간다', !runs.some(r => /UPDATE/.test(r.sql)));
  }
  {
    const { resp } = await callPatch(MGR_ACT, { ...ROW, teacher_uid: 'mangoi_007' }, { note_en: 'fixed by manager' });
    ok('B-10 본사 매니저는 남의 일지도 고친다', resp.status === 200);
  }
  {
    const { resp } = await callPatch({ ok: false }, { ...ROW }, { note_en: 'x' });
    ok('B-11 로그인 없음 401', resp.status === 401);
  }
  {
    const { resp } = await callPatch(T1, { ...ROW }, { note_ko: 'This is English only text' });
    ok('B-12 학부모 칸이 한국어가 아니면 400', resp.status === 400 && resp.body.error === 'note_not_korean');
  }
  {
    const { resp } = await callPatch(T1, { ...ROW }, { score_overall: 5, room_id: 'x' });
    ok('B-13 글 칸이 없으면 400 nothing_to_update', resp.status === 400 && resp.body.error === 'nothing_to_update');
  }
}
{
  const gi = LES.indexOf("if (method === 'GET' && /^\\/api\\/eval\\/\\d+$/.test(path))");
  const g = gi > 0 ? braceFrom(LES, gi) : '';
  ok('B-14 GET 이 can_edit 을 실어 보낸다', /can_edit/.test(g) && /return json\(\{ ok: true, eval: row, can_edit \}\)/.test(g));
  ok('B-15 학부모(self)에겐 판정조차 안 한다 — admin 일 때만', /if \(evScope === 'admin'\)[\s\S]{0,200}evalEditAllowed/.test(g));
}

/* ── C. 공용 창 ─────────────────────────────────────────────── */
console.log('\n[C] 공용 창 renderEval / renderEdit');
const win = {};
vm.runInNewContext(VIEW, { window: win, document: { getElementById: () => null, head: { appendChild() {} } }, fetch: () => new Promise(() => {}), console });
const R = win.mgEvalQuick && win.mgEvalQuick._render;
const RE = win.mgEvalQuick && win.mgEvalQuick._renderEdit;
ok('C-0 전제: 두 그리기 함수가 있다', typeof R === 'function' && typeof RE === 'function');
if (R && RE) {
  const E = { id: 3, note_en: 'a', note_ko: '가', parent_notified: 1 };
  ok('C-1 can_edit 이면 「✏️ Edit」', R({ ...E, __canEdit: true }, true).includes('data-evq-edit'));
  ok('C-2 아니면 버튼 없음 + 이유(짝)', !R({ ...E }, true).includes('data-evq-edit') && R({ ...E }, true).includes('View only'));
  const ed = RE(E, false);
  ok('C-3 고치기 화면: 글 두 칸', /data-evq-f="note_en"/.test(ed) && /data-evq-f="note_ko"/.test(ed));
  ok('C-4 이미 문자가 갔으면 «다시 안 간다» 고 말한다', ed.includes('문자는 다시 안 갑니다'));
  ok('C-5 안 갔으면 그 말을 안 한다(짝)', !RE({ ...E, parent_notified: 0 }, false).includes('문자는 다시 안 갑니다'));
  ok('C-6 점수 칸은 고치기 화면에 없다', !/score/.test(ed));
  ok('C-7 글을 탈출한다(XSS)', !RE({ ...E, note_en: '</textarea><img src=x onerror=1>' }, true).includes('<img'));
}
ok('C-8 서버가 can_edit 을 «true 로 말할 때만» 켠다', /__canEdit = x\.d\.can_edit === true/.test(VIEW));
ok('C-9 저장 성공은 «ok === true» 로 가른다', /x\.st === 200 && x\.d && x\.d\.ok === true/.test(VIEW));

/* ── D. 강사 「✍ 지금 쓰기」 ───────────────────────────────── */
console.log('\n[D] 강사 화면 「✍ 지금 쓰기」');
{
  const i = TCH.indexOf('  function extrasHtml(c, wi){');
  const src = i > 0 ? braceFrom(TCH, i) : '';
  ok('D-0 전제: extrasHtml(c, wi) 를 오려 냈다', src.length > 200);
  let f = null;
  try { f = new Function('esc', 'T', 'hhmm', 'EN', 'function x(c, wi)' + src + ' return x;')(
    (s) => String(s == null ? '' : s).replace(/</g, '&lt;'), (en) => en, () => '09:00', () => true); }
  catch (e) { ok('D-0b 만들 수 있다', false, e.message); }
  if (f) {
    const base = { attendance: { state: 'attended' }, class_date: '2026-10-01', today_eval: null, eval_written: false };
    ok('D-1 시작한 수업·일지 없음이면 「✍ Write now」 (data-eval=번호)', /data-eval="4"/.test(f(base, 4)));
    ok('D-2 시작 전(wi=-1)이면 안 준다(짝)', !/data-eval=/.test(f(base, -1)));
    ok('D-3 이미 쓴 수업이면 안 준다', !/data-eval=/.test(f({ ...base, eval_written: true }, 4)));
    ok('D-4 오늘 평가가 있으면 안 준다', !/data-eval=/.test(f({ ...base, today_eval: { id: 1, text: 'x' } }, 4)));
    ok('D-5 연기된 수업이면 안 준다', !/data-eval=/.test(f({ ...base, class_state: 'postponed' }, 4)));
  }
  ok('D-6 부르는 쪽이 «시작했거나 끝났을 때만» 번호를 넘긴다', /extrasHtml\(c, \(live \|\| done\) \? i : -1\)/.test(TCH));
  ok('D-7 그 버튼은 기존 일지 창 배선(data-eval → openEval)을 쓴다', /querySelectorAll\('\[data-eval\]'\)[\s\S]{0,200}openEval/.test(TCH));
}

/* ── E. 매니저 카페24 줄 ───────────────────────────────────── */
console.log('\n[E] 매니저 화면 — 버튼이 없는 줄에 이유');
{
  const i = MGR.indexOf("      var resch = '';");
  const j = MGR.indexOf("/* 📋 (2026-09-23 매니저 요청)", i);
  const src = i > 0 && j > i ? MGR.slice(i, j) : '';
  ok('E-0 전제: resch 블록을 오려 냈다', src.length > 100);
  let g = null;
  try { g = new Function('r', 'esc', 'T', 'var act="";' + src + ' return resch;'); } catch (e) { ok('E-0b 만들 수 있다', false, e.message); }
  if (g) {
    const T = (en) => en, e = (s) => String(s);
    ok('E-1 카페24 줄: «change in cafe24» 라고 말한다', /cafe24/.test(g({ source: 'cafe24', schedule_id: null, can_move: false }, e, T)));
    ok('E-2 날짜 지정 줄: 버튼(짝)', /data-ta="7"/.test(g({ schedule_id: 7, can_move: true }, e, T)));
    ok('E-3 매주 반복 줄: «use timetable»', /timetable/.test(g({ schedule_id: 8, can_move: false }, e, T)));
    ok('E-4 미러로 망고아이 행이 있는 카페24 줄은 버튼(짝)', /data-ta="9"/.test(g({ source: 'cafe24', schedule_id: 9, can_move: true }, e, T)));
  }
}

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) process.exit(1);
