// 🚪 «학생이 다른 방에 있어요» + 🗼 Class Monitor 입구 (2026-10-21)
// ─────────────────────────────────────────────────────────────────────────────
// 필리핀 강사 요청(BODA 처럼 학생 방에 직접 들어가기) · 사장님 「관리자들이 잘 찾게」.
// 정본 src/teacher-student-elsewhere.ts 를 타입 제거로 «실제로» 돌리고, teacher.html 의 함수를
// 오려 내 가짜 부품으로 실행한다. 「붙인다」 옆에 「붙이지 않는다」를 짝으로 둔다
// (짝이 없으면 «언제나 붙이기» · «언제나 안 붙이기» 가 둘 다 통과한다).
// 변이시험: TSE_SRC=<사본> · TEACHER_HTML=<사본> · API_TEACHER=<사본> · MANAGER_HTML=<사본> · IA6_JS=<사본>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const PUB = resolve(ROOT, 'cloudflare-deploy/public');
const rd = (p) => readFileSync(p, 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌ FAIL', name, extra ? '— ' + String(extra).slice(0, 200) : ''); }
};

/** 주석을 벗긴 사본 — 문자열·템플릿 안의 // 는 건드리지 않는다(CLAUDE.md 2장). */
function stripComments(t) {
  let out = '', i = 0, q = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    out += c; i++;
  }
  return out;
}
/** `function name(` 선언부터 중괄호 짝까지. JS 함수라 반환 타입이 없다 — 선언 뒤 첫 { 부터 센다. */
function fnBlock(t, name) {
  const s = t.indexOf('function ' + name + '(');
  if (s < 0) return '';
  let i = t.indexOf('{', s), d = 0, q = null;
  for (; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return t.slice(s, i + 1); }
  }
  return '';
}

/* ── 정본 모듈 불러오기 ──────────────────────────────────────────────────── */
const TSE_SRC = process.env.TSE_SRC || resolve(SRC, 'teacher-student-elsewhere.ts');
let M = null;
try {
  const alias = stripTypeScriptTypes(rd(resolve(SRC, 'student-alias.ts')));
  const rm = stripTypeScriptTypes(rd(resolve(SRC, 'room-mismatch.ts'))).replace(/^import [^\n]*\n/mg, '');
  const tse = stripTypeScriptTypes(rd(TSE_SRC)).replace(/^import [^\n]*\n/mg, '');
  M = await import('data:text/javascript;base64,' + Buffer.from(alias + '\n' + rm + '\n' + tse).toString('base64'));
} catch (e) { ok('정본 모듈을 불러왔다', false, e.message); }
ok('전제: 정본 모듈을 불러왔다', !!(M && M.findStudentElsewhere && M.applyStudentElsewhere));

const NOW = Date.UTC(2026, 9, 21, 12, 10, 0);       // 21:10 KST
const ST = Date.UTC(2026, 9, 21, 12, 0, 0);          // 21:00 시작
const mk = (o) => Object.assign({
  kind: 'class', schedule_id: 4397, room_id: 'class-4397-20261021', student_uid: 'delaware',
  class_state: 'ongoing', start_ts: ST, end_ts: ST + 20 * 60000, close_at_ts: ST + 35 * 60000,
}, o || {});
const run = (c, live, now) => { try { return M.findStudentElsewhere(c, live, now == null ? NOW : now); } catch (e) { return { __err: e.message }; } };

console.log('① 붙인다 — 10/6 같은 모양(학생은 옛 예약방 · 강사 화면은 이 수업)');
{
  const live = [
    { account_uid: 'delaware', user_id: 'u_a', room_id: 'class-4379-20261021', last_seen_at: NOW - 20000, left_at: null },
    { account_uid: null, user_id: 'u_t', room_id: 'class-4397-20261021', last_seen_at: NOW - 30000, left_at: null },
  ];
  const r = run(mk(), live);
  ok('학생이 있는 방을 싣는다', r && r.room === 'class-4379-20261021', JSON.stringify(r));
  ok('방 종류 = class', r && r.room_kind === 'class');
  ok('그 방에 다른 사람 0명', r && r.others === 0);
  ok('계정 그대로면 via_twin=false', r && r.via_twin === false);
  ok('seen_at 은 마지막 접속 시각', r && r.seen_at === NOW - 20000);
  ok('응답에 학생 계정·남의 이름을 싣지 않는다', r && !/delaware|u_a|u_t/.test(JSON.stringify(r)));
  const r2 = run(mk(), [{ account_uid: 'mangoai_delaware', user_id: 'u_b', room_id: 'mangoi-class', last_seen_at: NOW - 5000 }]);
  ok('쌍둥이 계정으로 공용방에 있어도 잡는다(via_twin=true · public)', r2 && r2.room === 'mangoi-class' && r2.via_twin === true && r2.room_kind === 'public', JSON.stringify(r2));
  const r3 = run(mk(), [{ account_uid: 'DELAWARE', room_id: 'meet-1234', last_seen_at: NOW - 5000 }]);
  ok('대소문자만 다른 계정도 같은 학생으로 본다', r3 && r3.room === 'meet-1234' && r3.room_kind === 'meeting' && r3.via_twin === false);
  const r4 = run(mk({ class_state: 'scheduled' }), [{ account_uid: 'delaware', room_id: 'mangoi-class', last_seen_at: NOW - 5000 }], ST - 10 * 60000);
  ok('시작 10분 전 일찍 와서 엉뚱한 방에 있어도 잡는다', r4 && r4.room === 'mangoi-class');
}

console.log('② 짝 — 붙이지 않아야 할 때');
{
  const away = { account_uid: 'delaware', room_id: 'mangoi-class', last_seen_at: NOW - 5000, left_at: null };
  ok('학생이 제자리에 있으면 안 붙인다', run(mk(), [{ account_uid: 'delaware', room_id: 'class-4397-20261021', last_seen_at: NOW - 5000 }]) === null);
  ok('기기 둘 중 하나라도 제자리면 안 붙인다', run(mk(), [away, { account_uid: 'delaware', room_id: 'class-4397-20261021', last_seen_at: NOW - 9000 }]) === null);
  ok('쌍둥이 계정이 제자리에 있어도 안 붙인다', run(mk(), [away, { account_uid: 'mangoai_delaware', room_id: 'class-4397-20261021', last_seen_at: NOW - 9000 }]) === null);
  ok('3분 넘게 소식이 없으면(지난 접속) 안 붙인다', run(mk(), [Object.assign({}, away, { last_seen_at: NOW - 4 * 60000 })]) === null);
  ok('퇴장 기록이 있으면 안 붙인다', run(mk(), [Object.assign({}, away, { left_at: NOW - 1000 })]) === null);
  ok('학생이 아무 데도 없으면 안 붙인다', run(mk(), []) === null);
  ok('다른 학생이 다른 방에 있는 것은 상관없다', run(mk(), [{ account_uid: 'heyst', room_id: 'mangoi-class', last_seen_at: NOW - 5000 }]) === null);
  ok('이름 앞부분만 같은 계정은 같은 학생이 아니다', run(mk(), [{ account_uid: 'delaware2', room_id: 'mangoi-class', last_seen_at: NOW - 5000 }]) === null);
  ok('취소된 수업엔 안 붙인다', run(mk({ class_state: 'cancelled' }), [away]) === null);
  ok('연기된 수업엔 안 붙인다', run(mk({ class_state: 'postponed' }), [away]) === null);
  ok('옛 LMS 자리표시(kind=lms)엔 안 붙인다', run(mk({ kind: 'lms' }), [away]) === null);
  ok('학생 계정이 없는 줄엔 안 붙인다', run(mk({ student_uid: null }), [away]) === null);
  ok('시작 15분보다 이르면 안 붙인다', run(mk(), [away], ST - 16 * 60000) === null);
  ok('닫힌 뒤(종료+15분 지남)엔 안 붙인다', run(mk(), [away], ST + 36 * 60000) === null);
  ok('시작 15분 전 경계는 붙인다', !!run(mk(), [Object.assign({}, away, { last_seen_at: ST - 15 * 60000 - 1000 })], ST - 15 * 60000));
}

console.log('③ 그 방에 몇 명이 더 있나(others)');
{
  const live = [
    { account_uid: 'delaware', user_id: 'u_1', room_id: 'mangoi-class', last_seen_at: NOW - 3000 },
    { account_uid: 'delaware', user_id: 'u_2', room_id: 'mangoi-class', last_seen_at: NOW - 4000 },        // 학생 두 번째 기기 — 안 셈
    { account_uid: 'kim', user_id: 'u_3', room_id: 'mangoi-class', last_seen_at: NOW - 5000 },
    { account_uid: 'kim', user_id: 'u_4', room_id: 'mangoi-class', last_seen_at: NOW - 6000 },             // 같은 사람 두 기기 — 한 명
    { account_uid: null, user_id: 'u_teacher', room_id: 'mangoi-class', last_seen_at: NOW - 7000 },        // 계정 칸 없는 강사 — 기기로 센다
    { account_uid: 'lee', user_id: 'u_6', room_id: 'mangoi-class', last_seen_at: NOW - 5 * 60000 },        // 지난 접속 — 안 셈
    { account_uid: 'park', user_id: 'u_7', room_id: 'class-1-20261021', last_seen_at: NOW - 5000 },        // 다른 방 — 안 셈
  ];
  const r = run(mk(), live);
  ok('계정 없는 접속까지 세되 학생·같은 사람·지난 접속·다른 방은 빼서 2명', r && r.others === 2, JSON.stringify(r));
}

console.log('④ 방 종류');
{
  const k = (x) => { try { return M.roomKindOf(x); } catch (e) { return 'ERR'; } };
  ok('mangoi-class = public', k('mangoi-class') === 'public');
  ok('meet-1234 · MEET-1234 = meeting', k('meet-1234') === 'meeting' && k('MEET-1234') === 'meeting');
  ok('class-<id>-<날짜> = class', k('class-4379-20261021') === 'class');
  ok('그 밖 = other', k('demo-1') === 'other' && k('class-x') === 'other');
}

console.log('⑤ 「오늘은 이 방으로」(회의방 지정) 뒤에 본다');
{
  const c = mk({ room_id: 'meet-55', room_id_original: 'class-4397-20261021', room_override: true });
  ok('지정된 회의방에 제대로 있으면 안 붙인다', run(c, [{ account_uid: 'delaware', room_id: 'meet-55', last_seen_at: NOW - 5000 }]) === null);
  const r = run(c, [{ account_uid: 'delaware', room_id: 'class-4397-20261021', last_seen_at: NOW - 5000 }]);
  ok('옛 예약방에 남아 있으면 붙인다', r && r.room === 'class-4397-20261021');
}

console.log('⑥ applyStudentElsewhere — D1 은 «볼 수업이 있을 때만», 실패해도 던지지 않는다');
{
  const fakeDb = (rows, opt) => {
    const log = { sql: [], binds: [] };
    return { log, prepare(sql) { log.sql.push(sql); return { bind(...b) { log.binds.push(b); return { all: async () => { if (opt && opt.throws) throw new Error('D1 down'); return { results: rows }; } }; } }; } };
  };
  const rows = [
    { account_uid: 'delaware', user_id: 'u_1', room_id: 'mangoi-class', last_seen_at: NOW - 3000, left_at: null },
    { account_uid: null, user_id: 'u_t', room_id: 'mangoi-class', last_seen_at: NOW - 3000, left_at: null },
  ];
  const db1 = fakeDb(rows);
  const cs = [mk(), mk({ schedule_id: 1, kind: 'lms', student_uid: null })];
  let n = -1; try { n = await M.applyStudentElsewhere(db1, cs, NOW); } catch (e) { ok('던지지 않는다', false, e.message); }
  ok('대상 수업에 붙였다(1건)', n === 1 && cs[0].student_elsewhere && cs[0].student_elsewhere.room === 'mangoi-class');
  ok('계정 없는 접속도 others 로 셌다(=SQL 이 account_uid 로 미리 거르지 않았다)', cs[0].student_elsewhere && cs[0].student_elsewhere.others === 1);
  ok('자리표시 줄엔 안 붙였다', !cs[1].student_elsewhere);
  ok('조회는 한 번', db1.log.sql.length === 1);
  const sql = stripComments(db1.log.sql[0] || '');
  ok('joined_at 으로 범위를 자른다(인덱스) + 최근 3분', /joined_at\s*>=\s*\?/.test(sql) && /last_seen_at\s*>=\s*\?/.test(sql));
  ok('SQL 이 account_uid 로 거르지 않는다', !/WHERE[\s\S]*account_uid\s*(IS NOT NULL|<>|=|IN)/i.test(sql));
  ok('바인드 = [now-12시간, now-3분]', JSON.stringify(db1.log.binds[0]) === JSON.stringify([NOW - 12 * 3600000, NOW - 180000]), JSON.stringify(db1.log.binds[0]));
  const db2 = fakeDb(rows);
  const cs2 = [mk({ class_state: 'done' }), mk({ start_ts: NOW + 3600000, end_ts: NOW + 4800000, close_at_ts: NOW + 5700000 })];
  cs2[0].close_at_ts = NOW - 1; let n2 = -1; try { n2 = await M.applyStudentElsewhere(db2, cs2, NOW); } catch (e) {}
  ok('볼 수업이 없으면 D1 을 아예 안 읽는다', n2 === 0 && db2.log.sql.length === 0);
  const db3 = fakeDb(rows, { throws: true });
  const cs3 = [mk()]; let n3 = -1, threw = false;
  try { n3 = await M.applyStudentElsewhere(db3, cs3, NOW); } catch (e) { threw = true; }
  ok('조회가 실패해도 던지지 않고 아무것도 안 붙인다', !threw && n3 === 0 && !cs3[0].student_elsewhere);
}

console.log('⑦ 강사 포털 배선(api-teacher.ts)');
{
  const t = stripComments(rd(process.env.API_TEACHER || resolve(SRC, 'api-teacher.ts')));
  ok('정본을 import 한다', /import\s*\{\s*applyStudentElsewhere\s*\}\s*from\s*'\.\/teacher-student-elsewhere'/.test(t));
  const iOv = t.indexOf('await applyRoomOverrides(env.DB, classes, ymd)');
  const m = /if\s*\(\s*!onlyNext\s*\)\s*await\s+applyStudentElsewhere\(\s*env\.DB\s*,\s*classes\s*,\s*now\s*\)/.exec(t);
  const iCall = m ? m.index : -1;
  const iEnrich = t.indexOf('enrichClassesToday(env as any, classes');
  ok('배너(?only=next)가 아닐 때 classes·now 로 부른다', iCall > 0);
  ok('방을 갈아 끼운 «뒤» 에 부른다', iOv > 0 && iCall > iOv);
  ok('응답을 돌려주기 «전» 에 부른다(칸이 응답에 실린다)', iCall > 0 && iEnrich > iCall);
  ok('부르는 곳은 한 곳', (t.match(/applyStudentElsewhere\(/g) || []).length === 1);
}

console.log('⑧ 강사 화면(teacher.html) — 오려 내 실제로 돌린다');
{
  const html = rd(process.env.TEACHER_HTML || resolve(PUB, 'teacher.html'));
  const code = ['awayRoomLabel', 'awayHtml', 'goStudentRoom'].map((n) => fnBlock(html, n)).join('\n');
  ok('전제: 함수 셋을 오려 냈다', /function awayHtml\(/.test(code) && /function goStudentRoom\(/.test(code) && /function awayRoomLabel\(/.test(code));
  const env = (lang, confirmAns) => {
    const st = { href: null, asked: [], joined: null };
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const fnSrc = code + '\nreturn { awayHtml: awayHtml, goStudentRoom: goStudentRoom };';
    let api = null;
    try {
      api = new Function('T', 'EN', 'esc', 'freshClass', 'joinClass', 'DATA', 'location', 'window', fnSrc)(
        (en, ko) => (lang === 'en' ? en : ko), () => lang === 'en', esc, (c) => c, (c) => { st.joined = c.room_id; },
        { me: { name: 'Kaye' } }, { set href(v) { st.href = v; }, get href() { return st.href; } },
        { confirm: (m) => { st.asked.push(m); return confirmAns; } });
    } catch (e) { st.err = e.message; }
    return { api, st };
  };
  const away = { room: 'mangoi-class', room_kind: 'public', others: 2, via_twin: true, seen_at: NOW };
  {
    const { api, st } = env('ko', true);
    let h = '', h0 = 'x';
    try { h = api.awayHtml({ student_elsewhere: away }, 3); h0 = api.awayHtml({}, 3); } catch (e) { st.err = e.message; }
    ok('그릴 때 던지지 않는다', !st.err, st.err);
    ok('칸이 없으면 아무것도 안 그린다(짝)', h0 === '');
    ok('빨간 상자 + 버튼(data-away=행 번호)', /class="cls-away"/.test(h) && /data-away="3"/.test(h));
    ok('한국어: 「학생이 다른 방에 있어요」·「학생 방으로 들어가기」·공용 대기방·2명', /학생이 다른 방에 있어요/.test(h) && /학생 방으로 들어가기/.test(h) && /공용 대기방/.test(h) && /2명이 더/.test(h));
    ok('쌍둥이 계정이면 그 사실을 말한다', /다른 계정으로 접속/.test(h));
    const hx = api.awayHtml({ student_elsewhere: Object.assign({}, away, { room: '<img onerror=1>', others: 0, via_twin: false }) }, 0);
    ok('방 이름을 이스케이프한다', !/<img/.test(hx) && /&lt;img/.test(hx));
    ok('0명이면 «더 있어요» 를 말하지 않는다(짝)', !/더 있어요/.test(hx) && !/다른 계정/.test(hx));
    try { api.goStudentRoom({ room_id: 'class-4397-20261021', student_elsewhere: away }); } catch (e) { st.err = e.message; }
    ok('누르면 한 번 묻고(사람 수를 말한다) 그 방으로 강사로 들어간다',
      st.asked.length === 1 && /2명이 더/.test(st.asked[0]) && /vc_autojoin=1/.test(st.href || '') && /vc_role=teacher/.test(st.href || '')
      && /vc_room=mangoi-class(&|$)/.test(st.href || '') && /vc_name=/.test(st.href || ''), (st.href || '') + ' | ' + st.asked.join('/'));
    ok('이 수업 방(예약방)으로는 안 보낸다', !/class-4397/.test(st.href || ''));
  }
  {
    const { api, st } = env('en', false);
    const h = api.awayHtml({ student_elsewhere: Object.assign({}, away, { others: 1 }) }, 0);
    ok('영어: «The student is in a different room» · «Go to the student\'s room» · 1 other person', /The student is in a different room/.test(h) && /Go to the student&#39;s room|Go to the student's room/.test(h) && /1 other person/.test(h));
    api.goStudentRoom({ room_id: 'class-4397-20261021', student_elsewhere: away });
    ok('«아니오» 를 누르면 아무 데도 안 간다(짝)', st.asked.length === 1 && st.href === null);
  }
  {
    const { api, st } = env('ko', true);
    api.goStudentRoom({ room_id: 'class-4397-20261021' });
    ok('그사이 학생이 제자리로 왔으면 이 수업 방으로(옛 방 아님)', st.joined === 'class-4397-20261021' && st.href === null && st.asked.length === 1);
  }
  const t = stripComments(html);
  // ⚠️ 파일 전체에서 «awayHtml(c, i)» 를 찾으면 «함수 선언» 이 잡혀 호출을 지워도 통과한다 — renderClasses 몸통 안에서 묻는다
  const rc = fnBlock(t, 'renderClasses');
  ok('행 HTML 이 awayHtml(c, i) 를 부른다(renderClasses 안 · 선언은 하나)', /\+\s*awayHtml\(c,\s*i\)/.test(rc) && (t.match(/function awayHtml\(/g) || []).length === 1);
  ok('줄 강조 클래스는 칸이 있을 때만', /\(c\.student_elsewhere\s*\?\s*' cls-away-row'\s*:\s*''\)/.test(t));
  ok('버튼을 goStudentRoom 에 잇는다', /querySelectorAll\('\[data-away\]'\)[\s\S]{0,200}goStudentRoom\(list\[\+this\.getAttribute\('data-away'\)\]\)/.test(t));
  ok('지문(sig)에 student_elsewhere 를 넣는다 — 안 넣으면 학생이 옮겨 가도 옛 상자가 남는다', /sig \+=[\s\S]{0,4000}sc\.student_elsewhere/.test(t));
  // 대비 — CSS 에서 색을 읽어 계산한다(손으로 적지 않는다)
  const css = html;
  const lum = (hex) => { const n = hex.replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(n.length === 3 ? n[i / 2] + n[i / 2] : n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const pick = (re) => { const m = re.exec(css); return m ? m[1] : null; };
  const boxBg = pick(/\n\.cls-away\{[^}]*background:(#[0-9a-f]{3,6})/i), boxFg = pick(/\n\.cls-away\{[^}]*;color:(#[0-9a-f]{3,6})/i);
  const subFg = pick(/\n\.cls-away \.away-sub\{[^}]*color:(#[0-9a-f]{3,6})/i);
  const btnBg = pick(/\n\.cls-away \.btn-away\{[^}]*background:(#[0-9a-f]{3,6})/i), btnFg = pick(/\n\.cls-away \.btn-away\{[^}]*;color:(#[0-9a-f]{3,6})/i);
  const dBg = pick(/html\[data-t="dark"\] \.cls-away\{[^}]*background:(#[0-9a-f]{3,6})/i), dFg = pick(/html\[data-t="dark"\] \.cls-away\{[^}]*;color:(#[0-9a-f]{3,6})/i);
  const dSub = pick(/html\[data-t="dark"\] \.cls-away \.away-sub\{[^}]*color:(#[0-9a-f]{3,6})/i);
  ok('전제: 색을 CSS 에서 읽었다', [boxBg, boxFg, subFg, btnBg, btnFg, dBg, dFg, dSub].every(Boolean), JSON.stringify([boxBg, boxFg, subFg, btnBg, btnFg, dBg, dFg, dSub]));
  if ([boxBg, boxFg, subFg, btnBg, btnFg, dBg, dFg, dSub].every(Boolean)) {
    const v = [cr(boxFg, boxBg), cr(subFg, boxBg), cr(btnFg, btnBg), cr(dFg, dBg), cr(dSub, dBg)];
    console.log('    대비(실측 계산):', v.map((x) => x.toFixed(2)).join(' · '));
    ok('글자 대비가 전부 4.5 이상(밝은·어두운 화면)', v.every((x) => x >= 4.5));
  }
  ok('상자에 display:flex 를 쓰지 않는다(짧은 문장이 낱글자로 쪼개짐)', !/\n\.cls-away\{[^}]*display:flex/.test(css));
}

console.log('⑨ 매니저 화면(manager.html) — 🗼 Class Monitor 입구');
{
  const html = rd(process.env.MANAGER_HTML || resolve(PUB, 'manager.html'));
  const n = (html.match(/href="\/admin\/monitor-wall\.html"/g) || []).length;
  ok(`입구가 넷(상단 버튼·자주 쓰는 기능·사이드바·진행 중 카드) — 실제 ${n}`, n >= 4);
  ok('상단 버튼(#toMonitorTop)·자주 쓰는 기능(#toMonitor) 둘 다 «처음엔 감춤»',
    /id="toMonitorTop"[^>]*\shidden[\s>]/.test(html) && /id="toMonitor"[^>]*\shidden[\s>]/.test(html));
  ok('자주 쓰는 기능 맨 앞에 있다', /<div class="qbar">\s*(<!--[\s\S]*?-->\s*)?<a id="toMonitor"/.test(html));
  ok('사이드바 «본사 매니저 전용» 첫 줄에 있다', /data-ko="본사 매니저 전용">HQ managers<\/div>\s*<div class="sgrp">\s*<a href="\/admin\/monitor-wall\.html"/.test(html));
  ok('글자에만 data-ko/data-en(링크 «자체» 에 달면 🌐 에 🗼 가 지워진다)',
    !/<a [^>]*monitor-wall\.html[^>]*data-(ko|en)=/.test(html) && /🗼 <span[^>]*data-en="Class Monitor/.test(html));
  // 본사일 때만 푼다 — 그 줄을 오려 내 가짜 document 로 돌린다(짝: 본사 아니면 감춘 채)
  const m = /\['toMonitor',\s*'toMonitorTop'\]\.forEach\(function\(id\)\{[^}]*\}\);/.exec(stripComments(html));
  ok('전제: 공개 판정 줄을 찾았다', !!m);
  if (m) {
    const runReveal = (isHq) => {
      const els = { toMonitor: { hidden: true }, toMonitorTop: { hidden: true } };
      try { new Function('document', 'IS_HQ', m[0])({ getElementById: (id) => els[id] || null }, isHq); } catch (e) { return 'ERR ' + e.message; }
      return els;
    };
    const a = runReveal(true), b = runReveal(false);
    ok('본사(IS_HQ)면 두 입구가 보인다', a.toMonitor && a.toMonitor.hidden === false && a.toMonitorTop.hidden === false, JSON.stringify(a));
    ok('본사가 아니면 감춘 채(짝)', b.toMonitor && b.toMonitor.hidden === true && b.toMonitorTop.hidden === true, JSON.stringify(b));
  }
  ok('보라 버튼 색이 다크 규칙에 안 덮인다(한 칸 센 선택자)', /html\.dark \.qbar \.qlink\.qmon,html\.dark \.tbtn\.tbtn-mon\{/.test(html));
}

console.log('⑩ 관리자 사이드바(adm-ia6.js) — 「오늘 수업」 바로 아래 · Class Monitor');
{
  const ia6 = stripComments(rd(process.env.IA6_JS || resolve(PUB, 'js/adm-ia6.js')));
  const iToday = ia6.indexOf("ko: '오늘 수업'"), iMon = ia6.indexOf("ko: '수업 관제탑'"), iAttn = ia6.indexOf("ko: '출결'");
  // 바로 아래 = 두 항목 사이에 다른 메뉴 항목(ko: '…')이 하나도 없다(주석은 이미 벗겼다)
  const between = (iToday > 0 && iMon > iToday) ? ia6.slice(iToday + 1, iMon) : '';
  ok('「오늘 수업」 바로 아래, 「출결」 앞에 있다', iToday > 0 && iMon > iToday && iAttn > iMon && !/ko:\s*'/.test(between));
  const item = ia6.slice(iMon, ia6.indexOf('}', iMon));
  ok("영어 이름은 'Class Monitor'", /en:\s*'Class Monitor'/.test(item));
  ok('관제탑 화면으로 간다 · 강사에게만 감춘다(그대로)', /href:\s*'\/admin\/monitor-wall\.html'/.test(item) && /hideFrom:\s*\['teacher'\]/.test(item));
  const qa = rd(resolve(PUB, 'js/adm-quick-access.js'));
  ok('⚡ 자주 쓰는 기능의 관제탑 칸은 고정(pin) · 영어 이름 Class Monitor', /key:\s*'관제탑'[\s\S]{0,200}?pin:\s*true/.test(qa) && /key:\s*'관제탑'[^\n]*en:\s*'Class Monitor/.test(qa));
}

console.log('⑪ 무작위 반복(퍼징) — 정본 대 «따로 쓴» 기준 구현, 시드 고정');
{
  // 기준 구현은 정본을 보지 않고 규칙(머리말 [판정])만 보고 다시 썼다 — 두 구현이 같은 답을 내야 한다.
  const LEAD = 15 * 60000, FRESH = 3 * 60000;
  const oracle = (c, live, now) => {
    if (!c || c.kind !== 'class') return null;
    if (c.class_state === 'cancelled' || c.class_state === 'postponed') return null;
    const uid = String(c.student_uid || '').trim().toLowerCase();
    const room = String(c.room_id || '');
    if (!uid || !room.trim()) return null;
    const st = Number(c.start_ts), cl = Number(c.close_at_ts);
    if (!Number.isFinite(st) || !Number.isFinite(cl)) return null;
    if (now < st - LEAD || now > cl) return null;
    const twin = uid.startsWith('mangoai_') ? (uid.slice(8) || '') : 'mangoai_' + uid;
    const acct = (r) => String(r.account_uid ?? '').trim().toLowerCase();
    const isMe = (a) => !!a && (a === uid || (!!twin && a === twin));
    const alive = live.filter((r) => {
      const seen = Number(r.last_seen_at) || 0, l = r.left_at;
      return seen > 0 && seen >= now - FRESH && (l == null || l === '' || Number(l) === 0) && String(r.room_id || '') !== '';
    });
    const mine = alive.filter((r) => isMe(acct(r)));
    if (!mine.length) return null;
    if (mine.some((r) => String(r.room_id) === room)) return null;
    let best = null;
    for (const r of mine) if (!best || (Number(r.last_seen_at) || 0) > (Number(best.last_seen_at) || 0)) best = r;
    const sroom = String(best.room_id);
    const who = new Set();
    for (const r of alive) {
      if (String(r.room_id) !== sroom) continue;
      const a = acct(r);
      if (isMe(a)) continue;
      const k = a || ('dev:' + String(r.user_id ?? '').trim());
      if (k !== 'dev:') who.add(k);
    }
    const kind = sroom === 'mangoi-class' ? 'public' : /^meet-/i.test(sroom) ? 'meeting' : /^class-\d+-\d{8}$/.test(sroom) ? 'class' : 'other';
    return { room: sroom, room_kind: kind, others: who.size, via_twin: acct(best) !== uid, seen_at: Number(best.last_seen_at) || 0 };
  };
  let seed = Number(process.env.FUZZ_SEED || 20261021) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const UIDS = ['delaware', 'Delaware', ' delaware ', 'mangoai_delaware', 'MANGOAI_Delaware', 'mangoai_', 'kim', '', '   ', null];
  const ACCTS = ['delaware', 'DELAWARE', 'mangoai_delaware', 'Mangoai_Delaware', 'kim', 'lee', 'mangoai_kim', 'hq_t_kang', '', '  ', null, undefined];
  const ROOMS = ['class-4397-20261021', 'class-4379-20261021', 'mangoi-class', 'meet-1234', 'MEET-77', 'demo-1', 'c24-1', '', null];
  const N = Math.max(1, Number(process.env.FUZZ_N || 4000));
  let same = 0, hit = 0, firstBad = null, threw = 0;
  for (let n = 0; n < N; n++) {
    const st = NOW + Math.round((rnd() * 120 - 60)) * 60000;
    const c = {
      kind: pick(['class', 'class', 'class', 'class', 'leveltest', 'other', undefined]),
      class_state: pick(['ongoing', 'scheduled', 'upcoming', 'done', 'cancelled', 'postponed', undefined]),
      student_uid: pick(UIDS),
      room_id: pick(['class-4397-20261021', 'class-4397-20261021', 'meet-1234', 'mangoi-class', '', null]),
      start_ts: rnd() < 0.03 ? 'x' : st,
      close_at_ts: rnd() < 0.03 ? undefined : st + Math.round(5 + rnd() * 40) * 60000,
    };
    const live = [];
    // 절반은 «있을 법한» 사례로 기운다 — 대상 수업 + 그 학생(또는 쌍둥이) 접속을 한두 줄 심는다(안 하면 거의 다 «해당 없음» 으로 헛돈다)
    if (rnd() < 0.5) {
      c.kind = 'class'; c.class_state = pick(['ongoing', 'scheduled']); c.student_uid = pick(['delaware', 'Delaware', 'mangoai_delaware']);
      c.room_id = 'class-4397-20261021'; c.start_ts = NOW - Math.round(rnd() * 20 - 10) * 60000; c.close_at_ts = c.start_ts + 35 * 60000;
      const m = 1 + Math.floor(rnd() * 2);
      for (let j = 0; j < m; j++) live.push({ account_uid: pick(['delaware', 'DELAWARE', 'mangoai_delaware']), user_id: pick(['u_s1', 'u_s2']), room_id: pick(ROOMS), last_seen_at: NOW - Math.round(rnd() * 200) * 1000, left_at: pick([null, null, '', 0]) });
    }
    const k = Math.floor(rnd() * 9);
    for (let j = 0; j < k; j++) {
      const ago = Math.round(rnd() * 400) * 1000;
      live.push({
        account_uid: pick(ACCTS),
        user_id: pick(['u_a', 'u_b', 'u_c', 'u_d', '', null, ' ']),
        room_id: pick(ROOMS),
        last_seen_at: pick([NOW - ago, NOW - ago, NOW - ago, 0, null, NOW + 5000, String(NOW - ago)]),
        left_at: pick([null, null, null, '', 0, NOW - 1000, '0', 'x']),
      });
    }
    let got;
    try { got = M.findStudentElsewhere(c, live, NOW); } catch (e) { threw++; got = { __err: e.message }; }
    const want = oracle(c, live, NOW);
    const eq = JSON.stringify(got) === JSON.stringify(want);
    if (eq) same++; else if (!firstBad) firstBad = { c, live, got, want };
    if (want) hit++;
    // 불변식(기준 구현과 무관하게): 붙였다면 그 방은 이 수업 방이 아니고, others 는 0 이상 정수
    if (got && !got.__err && (got.room === String(c.room_id) || !(Number.isInteger(got.others) && got.others >= 0))) { if (!firstBad) firstBad = { c, live, got, why: 'invariant' }; same--; }
  }
  console.log(`    ${N}회 · 붙인 경우 ${hit}회 · 일치 ${same}회`);
  ok(`정본과 기준 구현이 ${N}회 모두 같은 답`, same === N, firstBad && JSON.stringify(firstBad).slice(0, 600));
  ok('한 번도 던지지 않았다', threw === 0);
  ok('전제: 무작위 사례 중 «붙이는» 경우가 충분히 나왔다(헛돌지 않는다)', hit >= Math.min(50, Math.floor(N / 40)), hit);
  ok('전제: «안 붙이는» 경우도 충분히 나왔다(짝)', N - hit >= Math.floor(N / 4), N - hit);

  // markStudentElsewhere 도 같은 답을 붙이는가 · 아무것도 없는 수업에 칸을 만들지 않는가
  let markOk = true;
  for (let n = 0; n < 300 && markOk; n++) {
    const cs = [mk(), mk({ student_uid: 'kim', room_id: 'class-1-20261021' }), mk({ class_state: 'cancelled' })];
    const live = [];
    for (let j = 0; j < 6; j++) live.push({ account_uid: pick(ACCTS), user_id: pick(['u_a', 'u_b', null]), room_id: pick(ROOMS), last_seen_at: NOW - Math.round(rnd() * 300) * 1000, left_at: pick([null, '', NOW - 9]) });
    const cnt = M.markStudentElsewhere(cs, live, NOW);
    const exp = cs.map((c) => oracle(c, live, NOW));
    const real = cs.filter((c) => c.student_elsewhere).length;
    markOk = cnt === exp.filter(Boolean).length && real === cnt
      && cs.every((c, ix) => (exp[ix] ? JSON.stringify(c.student_elsewhere) === JSON.stringify(exp[ix]) : !('student_elsewhere' in c)));
  }
  ok('markStudentElsewhere 300회 — 붙인 수 = 실제로 붙은 칸 수 = 기준 구현', markOk);

  // teacher.html 상자: 아무 방 이름이 와도 날것의 < > " ' & 가 HTML 로 새지 않는다
  const html2 = rd(process.env.TEACHER_HTML || resolve(PUB, 'teacher.html'));
  const body = fnBlock(html2, 'awayHtml') + '\n' + fnBlock(html2, 'awayRoomLabel');
  let esc2 = null;
  try {
    esc2 = new Function('T', 'esc', body + '\nreturn awayHtml;')((en, ko) => ko,
      (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));
  } catch (e) { esc2 = null; }
  let xssOk = !!esc2;
  const nasty = ['<img src=x onerror=1>', '"><script>1</script>', "'><b>", 'meet-<b>x</b>', 'a&b', '‮', ''];
  for (let n = 0; n < 500 && xssOk; n++) {
    let room = '';
    const len = 1 + Math.floor(rnd() * 24);
    for (let j = 0; j < len; j++) room += rnd() < 0.2 ? pick(['<', '>', '"', "'", '&', '/', '=']) : String.fromCharCode(97 + Math.floor(rnd() * 26));
    if (rnd() < 0.2) room = pick(nasty) || 'x';
    const h = esc2({ student_elsewhere: { room, room_kind: pick(['public', 'meeting', 'class', 'other']), others: Math.floor(rnd() * 4), via_twin: rnd() < 0.5 } }, n);
    const inner = h.replace(/<\/?(div|span|button)\b[^>]*>/g, '');
    xssOk = !/[<>]/.test(inner) && (h.match(/<button\b/g) || []).length === 1;
  }
  ok('상자 500회 — 어떤 방 이름이 와도 태그가 새지 않고 버튼은 정확히 하나', xssOk);
}

console.log(`\n결과: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
