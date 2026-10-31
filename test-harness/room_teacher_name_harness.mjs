#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   👩‍🏫 «담당 강사 이름» 세 자리 — 회귀 감시 (2026-10-08)
   ───────────────────────────────────────────────────────────────────────────
   왜: 사장님 「나머지 세 곳도 서버부터 고쳐서 넣어줘」. 세 화면이 강사 정보를
     서버에서 «아예 안 받고» 있었다.
       ① 학생 상세 「수업」 탭 접속 기록 — 방 번호만 받음
          → 서버가 class-{예약id}-{날짜} 로 예약·대체강사를 되찾아 이름을 붙인다(room-teacher.ts).
       ② b2b-pay.html 학생별 수업 기록 칩 — lite() 가 강사 칸을 버리고 있었음
       ③ enroll-ops.html 공휴일 자동 연기 미리보기 — 학생 아이디·날짜만
   ⚠️ 문자열로는 «무엇이 나오는가» 를 못 본다 — 정본·화면 함수를 오려 내 실제로 돌린다.
   ⚠️ 「붙인다」 옆에 「모르면 지어내지 않는다」를 짝으로 둔다(⛔ attendance.teacher_name 금지).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };

/* 주석 벗기기(문자열 안은 건드리지 않음) — 부정 검사가 설명 주석을 잡지 않게 */
function strip(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    out += c; i++;
  }
  return out;
}
/* 중괄호 짝으로 함수 몸통 자르기 (JS 화면 코드 — 반환 타입 없음) */
function funcAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const b = src.indexOf('{', i); let d = 0;
  for (let k = b; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}

const esbuild = (() => { try { return createRequire(join(ROOT, 'cloudflare-deploy/package.json'))('esbuild'); } catch { return null; } })();

/* ── ① 정본 room-teacher.ts ── */
console.log('\n[ ① 방 번호 → 담당 강사 (정본을 실제로 돌림) ]');
if (!esbuild) console.log('  ⏭ esbuild 없음 — ①을 건너뜁니다');
else {
  const built = esbuild.buildSync({ entryPoints: [join(ROOT, 'cloudflare-deploy/src/room-teacher.ts')], bundle: true, write: false, format: 'cjs', platform: 'neutral', logLevel: 'silent' }).outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'console', built)(mod, mod.exports, createRequire(import.meta.url), { warn() {}, log() {}, error() {} });
  const M = mod.exports;

  const p = M.parseClassRoom('class-1070-20260901');
  check('예약방을 예약 번호·날짜로 푼다', p && p.scheduleId === '1070' && p.date === '2026-09-01');
  check('예약방이 아니면 모름(meet- · mangoi-class · c24- · 빈 값)', ['meet-1234', 'mangoi-class', 'c24-511741', '', null, 'class-12-2026091', 'xclass-1-20260901'].every(r => M.parseClassRoom(r) === null));

  const ids = M.roomTeacherIds(
    ['class-1-20261001', 'class-1-20261008', 'class-2-20261008', 'meet-9', 'class-3-20261008'],
    [{ id: 1, teacher_id: 22 }, { id: 2, teacher_id: 7 }, { id: 3, teacher_id: null }],
    [{ schedule_id: 1, sub_date: '2026-10-08', substitute_teacher_id: 29 }],
  );
  check('대체강사는 «그 날짜만» 이긴다', ids.get('class-1-20261008') === '29' && ids.get('class-1-20261001') === '22');
  check('대체가 없으면 원래 강사', ids.get('class-2-20261008') === '7');
  check('강사 없는 예약·예약방이 아닌 방은 안 붙인다(짝)', !ids.has('class-3-20261008') && !ids.has('meet-9'));

  // 가짜 D1 — 질의문을 보고 답한다
  const seen = [];
  const mkDb = (fail) => ({
    prepare(sql) {
      seen.push(sql);
      const ans = () => {
        if (fail) throw new Error('db down');
        if (/FROM class_schedules/.test(sql)) return [{ id: 1, teacher_id: 22 }, { id: 2, teacher_id: 'mangoi_018' }];
        if (/FROM class_substitutions/.test(sql)) return [{ schedule_id: 1, sub_date: '2026-10-08', substitute_teacher_id: 29 }];
        if (/FROM teachers/.test(sql)) return [{ id: 22, name: 'FAR' }, { id: 29, name: '중국어 강선생님' }];
        if (/teacher_account_links/.test(sql)) return [{ username: 'mangoi_018', teacher_id: 22 }];
        if (/attendance/i.test(sql)) return [{ teacher_name: '남의 이름' }];
        return [];
      };
      const st = { all: async () => ({ results: ans() }), first: async () => ans()[0] || null };
      return { ...st, bind: () => st };
    },
  });
  const nameOf = await M.loadRoomTeacherNames({ DB: mkDb(false) }, ['class-1-20261001', 'class-1-20261008', 'class-2-20261008', 'meet-5', null]);
  check('원래 강사 이름', nameOf('class-1-20261001') === 'FAR');
  check('그 날 대체강사 이름', nameOf('class-1-20261008') === '중국어 강선생님');
  check('계정형 강사 번호도 계정 연결로 이름을 찾는다', nameOf('class-2-20261008') === 'FAR');
  check('예약방이 아니면 빈 이름(지어내지 않음)', nameOf('meet-5') === '' && nameOf(null) === '');
  check('⛔ attendance.teacher_name 을 읽지 않는다', !seen.some(s => /attendance/i.test(s)));
  check('대체 조회는 active 만', seen.some(s => /class_substitutions/.test(s) && /status\s*=\s*'active'/.test(s)));
  const dead = await M.loadRoomTeacherNames({ DB: mkDb(true) }, ['class-1-20261001']);
  check('DB 가 죽어도 던지지 않고 빈 이름', dead('class-1-20261001') === '');
  const none = await M.loadRoomTeacherNames({ DB: mkDb(false) }, ['meet-1', 'mangoi-class']);
  seen.length = 0; none('meet-1');
  check('예약방이 하나도 없으면 DB 를 안 부른다', seen.length === 0);
}

/* ── ② /full 배선 + 학생 상세 화면 ── */
console.log('\n[ ② 학생 상세 「수업」 탭 ]');
{
  const mango = strip(rd('cloudflare-deploy/src/api-mango.ts'));
  check('/full 이 정본 loadRoomTeacherNames 를 부른다', /loadRoomTeacherNames\(\s*env[^,]*,\s*_fullSessions\.map\(\s*\(x[^)]*\)\s*=>\s*x\?\.room_id\s*\)\s*\)/.test(mango));
  check('응답 sessions 가 이름 붙은 목록이다', /sessions:\s*_fullSessions\b/.test(mango) && !/sessions:\s*pickList\(4\)/.test(mango));
  check('결과를 실제로 각 행에 쓴다', /_s\.teacher_name\s*=\s*_roomT\(\s*_s\?\.room_id\s*\)/.test(mango));

  const html = rd('cloudflare-deploy/public/admin/student.html');
  const fn = funcAt(html, 'function renderClasses(){');
  check('renderClasses 를 오려 냈다(전제)', fn.length > 200);
  const run = (sessions) => {
    const box = { innerHTML: '' }, kp = { innerHTML: '' };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const f = new Function('_state', '$', 't', 'esc', 'fmtDate', 'fmtMs', 'pctBadge', 'scoreBadge', 'statusBadge', fn + '; renderClasses();');
    try { f({ full: { sessions, summary: {}, erp: {}, profile: {} } }, id => id === 'classBox' ? box : kp, k => (k === 'thTeacher' ? '교사' : k), esc, x => String(x), x => String(x), () => '', () => '', () => ''); }
    catch (e) { return 'ERR ' + e.message; }
    return box.innerHTML;
  };
  const out = run([{ room_id: 'class-1-20261008', teacher_name: '<b>강선생님</b>' }, { room_id: 'meet-5', teacher_name: null }]);
  check('이름이 있으면 그 줄에 «교사 이름» 을 그린다(이스케이프)', out.includes('교사 &lt;b&gt;강선생님&lt;/b&gt;'));
  check('이름이 없으면 아무것도 안 그린다(짝)', (out.match(/sess-tch/g) || []).length === 1);
  check('열 수는 그대로(10칸)', (out.match(/<th>/g) || []).length === 10);
}

/* ── ③ b2b ── */
console.log('\n[ ③ b2b 학생별 수업 기록 ]');
{
  const ts = rd('cloudflare-deploy/src/b2b-tuition-load.ts');
  const body = funcAt(ts, 'function lite(i: any) {').replace('function lite(i: any) {', 'function lite(i) {').replace(/\s+as\s+any\b/g, '');
  check('lite 를 오려 냈다(전제)', body.length > 100);
  let lite = () => ({});
  try { lite = new Function('LEDGER_STATES', body + '; return lite;')({ done: { ko: '완료', en: 'Done' } }); }
  catch (e) { check('lite 를 실행할 수 있다: ' + e.message, false); }
  check('lite 가 강사 이름을 싣는다', lite({ state: 'done', teacher_name: 'FAR', teacher_id: 22 }).teacher_name === 'FAR');
  const l2 = lite({ state: 'done', teacher_id: 22 });
  check('이름이 없으면 null(짝) · ⛔ 강사 번호는 안 싣는다', l2.teacher_name === null && !('teacher_id' in l2));
  const page = rd('cloudflare-deploy/public/b2b-pay.html');
  const line = page.split('\n').find(l => l.includes("'<span class=\"chip s-'")) || '';
  check('칩 본문에 강사 이름(이스케이프)', /i\.teacher_name\s*\?\s*' · '\s*\+\s*esc\(i\.teacher_name\)/.test(line));
}

/* ── ④ 공휴일 자동 연기 ── */
console.log('\n[ ④ 공휴일 자동 연기 미리보기 ]');
{
  const ops = strip(rd('cloudflare-deploy/src/enroll-ops.ts'));
  // ⚠️ 인자 타입 `{ dry?: boolean }` 의 중괄호가 먼저 걸리므로 몸통의 «Promise<any> {» 부터 짝을 센다
  const _si = ops.indexOf('export async function runHolidayShiftSweep(');
  const _bi = _si < 0 ? -1 : ops.indexOf('Promise<any> {', _si);
  const sweep = _bi < 0 ? '' : (ops.slice(_si, _bi) + funcAt(ops.slice(_bi), 'Promise<any> {'));
  check('스윕을 오려 냈다(전제)', sweep.length > 500);
  check('항목에 원부 강사 번호를 담는다', /out\.items\.push\(\{[^}]*teacher_id:\s*tid/.test(sweep));
  check('정본 loadTeacherNameOf 로 이름을 붙인다', /nameOf\s*=\s*await\s+loadTeacherNameOf\(env\)/.test(sweep) && /it\.teacher_name\s*=\s*nameOf\(it\.teacher_id\)/.test(sweep));
  check('이름 붙이기는 UPDATE 와 무관(실패해도 이동은 그대로 — try 로 감쌈)', /try\s*\{\s*nameOf\s*=\s*await\s+loadTeacherNameOf/.test(sweep));
  const page = rd('cloudflare-deploy/public/enroll-ops.html');
  const h = funcAt(page, "$('sHol').onclick = async function(){");
  check('미리보기 표에 「담당 강사」 칸(한/영)', h.includes("L('담당 강사','Teacher')"));
  const thN = (h.match(/<th>/g) || []).length, tdN = (h.match(/<td /g) || []).length;
  check('머리글 수 = 칸 수', thN === 4 && tdN === 4);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
