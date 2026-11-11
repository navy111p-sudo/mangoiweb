/* ══════════════════════════════════════════════════════════════════════
   🔔 수업 취소·연기·변경 → 담당 강사 웹푸시 + 연기 수업 «Paid / Unpaid»  (2026-11-11 maimai 요청)

   [무슨 일이 있었나] 필리핀 매니저 maimai: 「학생 이름·시간과 함께, 수업이 취소·연기되면 강사 페이지에
     알림이 오나? 30분 안이면 유급, 그 전이면 무급」 — 알림은 관리자 카톡으로만 갔고, 강사는 달력을 열어야 알았다.

   [이 하니스가 지키는 것] — 정본을 «실제로 돌린다»(node 타입 제거 + 진짜 SQLite)
     A. 문구(classChangeAlertText) — 취소/연기/옮김 · 몇 분 전 · «30분 이내» 표시 · EN+KO ·
        ⛔ 알림에 Paid/Unpaid 없음(2026-11-11 사장님 «시간만 표시» — 급여와 어긋나지 않게)
     B. 보내기(alertTeacherOfClassChange) — 24시간 안·시작 30분 뒤까지만 · 강사 본인 변경 제외 ·
        같은 자리면 안 보냄 · DB 가 죽어도 안 던짐
     C. 배선 — writeClassAudit 를 진짜로 불러 푸시 큐에 한 줄이 생긴다 · 이동 엔진의 훅 블록을 오려 내 실행
     D. 강사 화면 Paid/Unpaid 식 = 급여 식 — admin-lesson-fees.ts 의 postponePct/earlyPostponePct 식을 오려 내 같은 입력으로 대조
     E. 강사 화면 — payPctText·sboxHtml 를 오려 내 실행(«Paid» 가 상자에 실제로 들어간다 · 없으면 지어내지 않는다)
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '../cloudflare-deploy/src');
const PUB_DIR = join(HERE, '../cloudflare-deploy/public');
const rd = (f) => readFileSync(join(SRC_DIR, f), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
/* 주석·문자열을 추적하며 중괄호 짝으로 블록을 자른다(CLAUDE.md 2장 «중괄호 짝으로 자르세요»). */
function blockFrom(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

console.log('\n🔔 수업 취소·연기·변경 → 강사 푸시 + Paid/Unpaid\n');

// ═══════════════ A~C. 정본을 실제로 돌린다 ═══════════════
const FILES = ['teacher-change-alert.ts', 'postpone-pay.ts', 'session-ledger.ts', 'class-start-date.ts', 'teacher-push.ts', 'web-push.ts', 'd1-chunk.ts', 'class-audit.ts'];
const tmp = mkdtempSync(join(tmpdir(), 'tca-'));
const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
for (const f of FILES) writeFileSync(join(tmp, f), fix(rd(f)));

/* 이동 엔진의 훅 블록 — «🔔 (2026-11-11)» 주석 다음 if 문을 중괄호 짝으로 오려 낸다 */
const MOVE = rd('class-schedule-move.ts');
const mAt = MOVE.indexOf('🔔 (2026-11-11)');
const ifAt = MOVE.indexOf('if (!guarded', mAt);
const forOpen = MOVE.indexOf('{', MOVE.indexOf('for (let i = 0; i < rows.length; i++)', ifAt));
const MOVE_HOOK = mAt > 0 && ifAt > 0 && forOpen > 0 ? MOVE.slice(ifAt, forOpen) + blockFrom(MOVE, forOpen) : '';
writeFileSync(join(tmp, 'move-hook.json'), JSON.stringify(MOVE_HOOK));

const runner = `
  import { DatabaseSync } from 'node:sqlite';
  import { readFileSync } from 'node:fs';
  import { classChangeAlertText, alertTeacherOfClassChange } from './teacher-change-alert.ts';
  import { postponePayPercent } from './postpone-pay.ts';
  import { writeClassAudit } from './class-audit.ts';
  console.warn = () => {}; console.log = () => {};
  const out = {};
  const NOW = Date.UTC(2026, 10, 11, 10, 0, 0);            // 2026-11-11 19:00 KST

  // A. 문구
  out.A_cancel = classChangeAlertText({ kind: 'cancel', student: 'Minji', date: '2026-11-11', time: '19:20', minutesBefore: 20 });
  out.A_post20 = classChangeAlertText({ kind: 'postpone', student: 'Minji', date: '2026-11-11', time: '19:20', minutesBefore: 20 });
  out.A_post30 = classChangeAlertText({ kind: 'postpone', student: 'Minji', date: '2026-11-11', time: '19:30', minutesBefore: 30 });
  out.A_post31 = classChangeAlertText({ kind: 'postpone', student: 'Minji', date: '2026-11-11', time: '19:31', minutesBefore: 31 });
  out.A_post125 = classChangeAlertText({ kind: 'postpone', student: 'Minji', date: '2026-11-11', time: '21:05', minutesBefore: 125 });
  out.A_move = classChangeAlertText({ kind: 'move', student: 'Minji', date: '2026-11-11', time: '19:20', minutesBefore: 20, toDate: '2026-11-12', toTime: '15:00' });
  out.A_late = classChangeAlertText({ kind: 'cancel', student: 'Minji', date: '2026-11-11', time: '18:50', minutesBefore: -10 });

  // B. 진짜 SQLite
  function mkEnv(opts = {}) {
    const sq = new DatabaseSync(':memory:');
    sq.exec(\`
      CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, teacher_id INTEGER, student_name TEXT, scheduled_date TEXT, start_time TEXT, status TEXT, skip_dates TEXT);
      CREATE TABLE schedule_change_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, request_type TEXT, orig_date TEXT, fee_type TEXT, status TEXT, created_at INTEGER);
      CREATE TABLE payroll_deduction_rules (code TEXT PRIMARY KEY, amount INTEGER, enabled INTEGER);
      CREATE TABLE teacher_account_links (teacher_id INTEGER, username TEXT);
      CREATE TABLE push_subscriptions (user_id TEXT, endpoint TEXT, enabled INTEGER);
      CREATE TABLE push_queue (endpoint TEXT, title TEXT, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER);
      INSERT INTO teacher_account_links VALUES (7, 'mangoi_007');
      INSERT INTO push_subscriptions VALUES ('mangoi_007', 'https://push.example/ep1', 1);
      INSERT INTO payroll_deduction_rules VALUES ('postponed_pay_percent', 100, 1), ('postponed_early_pay_percent', 0, \${opts.earlyOff ? 0 : 1});
    \`);
    if (opts.noRules) sq.exec('DROP TABLE payroll_deduction_rules');
    const st = (sql, args = []) => ({
      bind: (...a) => st(sql, a),
      async first() { if (opts.throwAll) throw new Error('boom'); const r = sq.prepare(sql).get(...args); return r ? { ...r } : null; },
      async all() { if (opts.throwAll) throw new Error('boom'); return { results: sq.prepare(sql).all(...args).map(r => ({ ...r })) }; },
      async run() { if (opts.throwAll) throw new Error('boom'); const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    });
    const DB = { prepare: (sql) => st(sql), async exec(sql) { sq.exec(sql); return {}; } };
    return { sq, env: { DB, WEB_PUSH_MODE: 'mock' } };
  }
  const queue = (sq) => sq.prepare('SELECT title, body, tag FROM push_queue').all().map(r => ({ ...r }));
  const go = async (name, rows, reqs, a, opts) => {
    const { sq, env } = mkEnv(opts);
    for (const r of rows) sq.prepare('INSERT INTO class_schedules (id, teacher_id, student_name, scheduled_date, start_time, status, skip_dates) VALUES (?,?,?,?,?,?,?)').run(r.id, r.teacher_id ?? 7, r.student_name || 'Minji', r.scheduled_date, r.start_time, r.status || 'active', r.skip_dates || null);
    for (const q of reqs) sq.prepare('INSERT INTO schedule_change_requests (schedule_id, request_type, orig_date, fee_type, status, created_at) VALUES (?,?,?,?,?,?)').run(q.schedule_id, q.request_type || 'postpone', q.orig_date, q.fee_type, q.status || 'approved', q.created_at || 1);
    let threw = false, why = null;
    try { why = await alertTeacherOfClassChange(env, a, NOW); } catch { threw = true; }
    out[name] = { why, threw, q: opts && opts.throwAll ? [] : queue(sq) };
  };
  const base = { schedule_id: 1, lesson_date: '2026-11-11', lesson_time: '19:20', student_name: 'Minji', actor_role: 'admin' };
  await go('B_cancel', [{ id: 1, scheduled_date: '2026-11-11', start_time: '19:20', status: 'cancelled' }], [], { ...base, action: 'remove' });
  await go('B_byTeacher', [{ id: 1, scheduled_date: '2026-11-11', start_time: '19:20', status: 'cancelled' }], [], { ...base, action: 'remove', actor_role: 'teacher' });
  await go('B_far', [{ id: 1, scheduled_date: '2026-11-13', start_time: '19:20', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_date: '2026-11-13' });
  await go('B_edge24', [{ id: 1, scheduled_date: '2026-11-12', start_time: '19:00', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_date: '2026-11-12', lesson_time: '19:00' });
  await go('B_pastStart', [{ id: 1, scheduled_date: '2026-11-11', start_time: '18:20', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_time: '18:20' });
  await go('B_justStarted', [{ id: 1, scheduled_date: '2026-11-11', start_time: '18:40', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_time: '18:40' });
  await go('B_weeklyAll', [{ id: 1, scheduled_date: null, start_time: '19:20', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_date: null });
  await go('B_postPaid', [{ id: 1, scheduled_date: '2026-11-11', start_time: '19:20', status: 'postponed' }],
    [{ schedule_id: 1, orig_date: '2026-11-11', fee_type: 'paid' }], { ...base, action: 'postpone' });
  await go('B_postFree', [{ id: 1, scheduled_date: '2026-11-11', start_time: '21:00', status: 'postponed' }],
    [{ schedule_id: 1, orig_date: '2026-11-11', fee_type: 'free' }], { ...base, action: 'postpone', lesson_time: '21:00' });
  await go('B_move', [{ id: 1, scheduled_date: '2026-11-12', start_time: '15:00', status: 'active' }], [], { ...base, action: 'postpone' });
  // Codex P1 — 매주 반복 줄: «기록만» 승인(회차 그대로) → 안 보냄 / 그 날이 skip_dates 에 있으면 → 보냄
  await go('B_recurRecorded', [{ id: 1, scheduled_date: null, start_time: '19:20', status: 'active' }], [], { ...base, action: 'postpone' });
  await go('B_recurSkipped', [{ id: 1, scheduled_date: null, start_time: '19:20', status: 'active', skip_dates: '2026-11-04,2026-11-11' }], [], { ...base, action: 'postpone' });
  await go('B_recurOtherSkip', [{ id: 1, scheduled_date: null, start_time: '19:20', status: 'active', skip_dates: '2026-11-04' }], [], { ...base, action: 'reschedule' });
  // Codex P2 — 강사가 함께 바뀐 승인: 행은 이미 새 강사(9), 원래 강사(7)를 넘기면 7 에게 간다(9 는 연결 계정 없음)
  await go('B_origTeacher', [{ id: 1, teacher_id: 9, scheduled_date: '2026-11-12', start_time: '15:00', status: 'active' }], [], { ...base, action: 'postpone', teacher_id: 7 });
  await go('B_newTeacherOnly', [{ id: 1, teacher_id: 9, scheduled_date: '2026-11-12', start_time: '15:00', status: 'active' }], [], { ...base, action: 'postpone' });
  await go('B_sameSlot', [{ id: 1, scheduled_date: '2026-11-11', start_time: '19:20', status: 'active' }], [], { ...base, action: 'reschedule' });
  await go('B_notChange', [{ id: 1, scheduled_date: '2026-11-11', start_time: '19:20', status: 'active' }], [], { ...base, action: 'end' });
  await go('B_noAccount', [{ id: 1, teacher_id: 99, scheduled_date: '2026-11-11', start_time: '19:20', status: 'cancelled' }], [], { ...base, action: 'remove' });
  await go('B_throwAll', [], [], { ...base, action: 'remove' }, { throwAll: true });
  await go('B_shortTime', [{ id: 1, scheduled_date: '2026-11-12', start_time: '9:20', status: 'cancelled' }], [], { ...base, action: 'remove', lesson_date: '2026-11-12', lesson_time: '9:20' });

  // C-1. writeClassAudit 를 진짜로 부른다 — 이력 한 줄 + 푸시 한 줄 (시각은 지금 기준으로 — writeClassAudit 는 now 를 안 받는다)
  {
    const { sq, env } = mkEnv();
    const soon = new Date(Date.now() + 20 * 60000 + 9 * 3600000).toISOString();   // 20분 뒤(KST 글자)
    const d = soon.slice(0, 10), t = soon.slice(11, 16);
    sq.prepare('INSERT INTO class_schedules (id, teacher_id, student_name, scheduled_date, start_time, status) VALUES (?,?,?,?,?,?)').run(5, 7, 'Jisoo', d, t, 'cancelled');
    await writeClassAudit(env, { action: 'remove', schedule_id: 5, student_name: 'Jisoo', lesson_date: d, lesson_time: t, actor: 'Mai', actor_role: 'admin', source: 'ui' });
    const auditRows = sq.prepare('SELECT action FROM class_audit_log').all().length;
    await writeClassAudit(env, { action: 'remove', schedule_id: 5, student_name: 'Jisoo', lesson_date: d, lesson_time: t, actor: 'T', actor_role: 'teacher', source: 'ui' });
    out.C_audit = { auditRows, q: queue(sq) };
    // 이력 표가 없어 기록이 실패해도(던지지 않고) 푸시는 따로 간다
    const e2 = mkEnv();
    e2.sq.prepare('INSERT INTO class_schedules (id, teacher_id, student_name, scheduled_date, start_time, status) VALUES (?,?,?,?,?,?)').run(5, 7, 'Jisoo', d, t, 'cancelled');
    const badEnv = { ...e2.env, DB: { ...e2.env.DB, exec: async () => { throw new Error('no audit'); } } };
    let threw = false; try { await writeClassAudit(badEnv, { action: 'remove', schedule_id: 5, lesson_date: d, lesson_time: t, actor_role: 'admin' }); } catch { threw = true; }
    out.C_auditFail = { threw, q: queue(e2.sq) };
  }

  // C-2. 이동 엔진 훅 — 소스에서 오려 낸 블록을 실제로 돌린다
  {
    const HOOK = JSON.parse(readFileSync(new URL('./move-hook.json', import.meta.url), 'utf8'));
    const same = (a, b) => String(a ?? '') === String(b ?? '');
    const runHook = async (guarded, actor, rows, destinations) => {
      const calls = [];
      const alertTeacherOfClassChange = async (env, a) => { calls.push(a); return 'ok'; };
      const fn = new Function('guarded', 'actor', 'rows', 'destinations', 'same', 'alertTeacherOfClassChange', 'env',
        'return (async () => { ' + HOOK + ' })();');
      await fn(guarded, actor, rows, destinations, same, alertTeacherOfClassChange, {});
      return calls;
    };
    const r0 = { id: 3, scheduled_date: '2026-11-11', start_time: '19:20', teacher_id: 7, student_name: 'Minji' };
    out.C_move = {
      hookLen: HOOK.length,
      moved: await runHook(false, { ok: true }, [r0], [{ ...r0, scheduled_date: '2026-11-12', start_time: '15:00' }]),
      timeOnly: await runHook(false, { ok: true }, [r0], [{ ...r0, start_time: '20:00' }]),
      movedAndTeacher: await runHook(false, { ok: true }, [r0], [{ ...r0, scheduled_date: '2026-11-12', teacher_id: 9 }]),
      teacherOnly: await runHook(false, { ok: true }, [r0], [{ ...r0, teacher_id: 9 }]),
      byTeacher: await runHook(false, { ok: true, isTeacher: true }, [r0], [{ ...r0, scheduled_date: '2026-11-12' }]),
      guarded: await runHook(true, { ok: true }, [r0], [{ ...r0, scheduled_date: '2026-11-12' }]),
    };
  }

  // D. 급여 식 대조 — 하니스 쪽에서 오려 낸 식을 받는다
  {
    const PAY = JSON.parse(readFileSync(new URL('./pay-expr.json', import.meta.url), 'utf8'));
    const payroll = new Function('rules', 'pFeeType', PAY.decl + '; return (pFeeType === \\'free\\' ? earlyPostponePct : postponePct);');
    const R = (b, e) => { const r = {}; if (b) r.postponed_pay_percent = b; if (e) r.postponed_early_pay_percent = e; return r; };
    const cases = [];
    for (const b of [null, { amount: 100, enabled: 1 }, { amount: 70, enabled: 1 }, { amount: 70, enabled: 0 }, { amount: 150, enabled: 1 }, { amount: 'x', enabled: 1 }])
      for (const e of [null, { amount: 0, enabled: 1 }, { amount: 30, enabled: 1 }, { amount: 30, enabled: 0 }, { amount: -5, enabled: 1 }])
        for (const f of ['paid', 'free', null, 'weird']) cases.push([R(b, e), f]);
    const bad = cases.filter(([r, f]) => payroll(r, f) !== postponePayPercent(r, f));
    out.D = { n: cases.length, bad: bad.length, declLen: PAY.decl.length };
  }
  process.stdout.write(JSON.stringify(out));
`;
/* D. 급여 정본에서 «postponePct ~ earlyPostponePct» 선언을 오려 낸다(그대로 — 베껴 적지 않는다) */
const LF = rd('admin-lesson-fees.ts');
const pS = LF.indexOf('const postponePct = rules.postponed_pay_percent');
const pE = LF.indexOf(';', LF.indexOf('const earlyPostponePct', pS)) + 1;
const decl = pS > 0 && pE > pS ? LF.slice(pS, pE).replace(/\/\*[\s\S]*?\*\//g, '') : '';
writeFileSync(join(tmp, 'pay-expr.json'), JSON.stringify({ decl }));
writeFileSync(join(tmp, 'run.mjs'), runner);

const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse(r.stdout); } catch { console.log(r.stdout, r.stderr); }
rmSync(tmp, { recursive: true, force: true });
check('정본 실행 결과를 받았다', !!o);
o = o || {};
const has = (m, s) => !!m && (m.title + '\n' + m.en + '\n' + m.ko).includes(s);

console.log('\n[A] 문구');
check('취소 — 학생·시각·«cancelled»·«취소» (EN/KO)', has(o.A_cancel, 'Minji') && has(o.A_cancel, '11/11 19:20') && has(o.A_cancel, 'cancelled') && has(o.A_cancel, '취소'));
check('취소 — «20 min before class» / «수업 20분 전»', has(o.A_cancel, '20 min before class') && has(o.A_cancel, '수업 20분 전'));
check('20분 전 → «within 30 min» / «30분 이내»', has(o.A_post20, '20 min before class — within 30 min') && has(o.A_post20, '수업 20분 전 변경 · 30분 이내'));
check('경계: 정확히 30분 전 → «30분 이내»(fee_type paid 와 같은 경계)', has(o.A_post30, 'within 30 min') && has(o.A_post30, '30분 이내'));
check('짝: 31분 전 → «30분 이내» 없음', !!o.A_post31 && !has(o.A_post31, 'within 30') && !has(o.A_post31, '30분 이내'));
check('2시간 5분 전 → «2 h 5 min» / «2시간 5분» · 30분 이내 없음', has(o.A_post125, '2 h 5 min') && has(o.A_post125, '2시간 5분') && !has(o.A_post125, '30분 이내'));
check('⛔ 알림 문구에 Paid/Unpaid·수업료 없음(사장님 «시간만 표시»)', ['A_cancel', 'A_post20', 'A_post125', 'A_move', 'A_late'].every(k => o[k] && !/Paid|Unpaid|Pay:|수업료/.test(o[k].title + o[k].en + o[k].ko)));
check('옮김 → «moved to 11/12 15:00» / «11/12 15:00(으)로»', has(o.A_move, 'moved to 11/12 15:00') && has(o.A_move, '11/12 15:00(으)로'));
check('시작 뒤 변경 → «after the class started»', has(o.A_late, 'after the class started') && has(o.A_late, '수업 시작 뒤'));

console.log('\n[B] 보내기 — 진짜 SQLite');
const q1 = (k) => (o[k] && o[k].q) || [];
check('취소(20분 전) → 푸시 1줄 · 제목에 학생 시각', o.B_cancel?.why === 'sent' && q1('B_cancel').length === 1 && q1('B_cancel')[0].title.includes('11/11 19:20'));
check('취소 푸시 본문에 EN+KO 둘 다', q1('B_cancel')[0]?.body.includes('cancelled') && q1('B_cancel')[0]?.body.includes('취소됐습니다'));
check('강사 본인 변경 → 안 보냄', o.B_byTeacher?.why === 'by_teacher' && q1('B_byTeacher').length === 0);
check('이틀 뒤 수업 → 안 보냄(24시간 밖)', o.B_far?.why === 'out_of_window' && q1('B_far').length === 0);
check('짝: 정확히 24시간 뒤 → 보냄', o.B_edge24?.why === 'sent' && q1('B_edge24').length === 1);
check('시작 40분 뒤 → 안 보냄', o.B_pastStart?.why === 'out_of_window' && q1('B_pastStart').length === 0);
check('짝: 시작 20분 뒤 → 보냄', o.B_justStarted?.why === 'sent' && q1('B_justStarted').length === 1);
check('매주 반복 줄 전체 취소(날짜 없음) → 안 보냄', o.B_weeklyAll?.why === 'no_time');
check('연기(20분 전) → «postponed» · «within 30 min» · 수업료 글자 없음', !!q1('B_postPaid')[0] && q1('B_postPaid')[0].title.includes('postponed') && q1('B_postPaid')[0].body.includes('within 30 min') && !/Paid|Unpaid|수업료/.test(q1('B_postPaid')[0].body));
check('짝: 연기(2시간 전) → «30분 이내» 없음', !!q1('B_postFree')[0] && !q1('B_postFree')[0].body.includes('30분 이내'));
check('다른 날로 옮김 → «moved to 11/12 15:00»', q1('B_move')[0]?.body.includes('moved to 11/12 15:00'));
check('매주 반복 «기록만» 승인(회차 그대로 열림) → 안 보냄', o.B_recurRecorded?.why === 'no_visible_change' && q1('B_recurRecorded').length === 0);
check('짝: 그 날이 skip_dates 에 있음 → «postponed» 보냄', o.B_recurSkipped?.why === 'sent' && q1('B_recurSkipped')[0]?.title.includes('postponed'));
check('짝: 다른 날만 빠짐 → 안 보냄', o.B_recurOtherSkip?.why === 'no_visible_change');
check('강사가 함께 바뀜 + 원래 강사 id 넘김 → 원래 강사에게 보냄', o.B_origTeacher?.why === 'sent' && q1('B_origTeacher').length === 1);
check('짝: 안 넘기면 지금 담당(새 강사)을 본다', o.B_newTeacherOnly?.why === 'no_linked_account');
check('같은 날·같은 시각(강사만 바뀜 등) → 안 보냄', o.B_sameSlot?.why === 'no_visible_change' && q1('B_sameSlot').length === 0);
check('종료(end) 등 변경 아닌 이력 → 안 보냄', o.B_notChange?.why === 'not_change');
check('연결 계정 없는 강사 → 이유만 돌려줌', o.B_noAccount?.why === 'no_linked_account');
check('DB 가 전부 던져도 → 안 던지고 «error»', o.B_throwAll && o.B_throwAll.threw === false && o.B_throwAll.why === 'error');
check('시각 «9:20» → 09:20 으로 읽음(내일 09:20 = 14시간 20분 뒤 → 보냄)', o.B_shortTime?.why === 'sent' && q1('B_shortTime')[0]?.title.includes('11/12 09:20') && q1('B_shortTime')[0]?.body.includes('14 h 20 min'));

console.log('\n[C] 배선');
check('writeClassAudit(관리자 취소) → 이력 1줄 + 푸시 1줄', o.C_audit?.auditRows === 1 && (o.C_audit?.q || []).length === 1);
check('짝: writeClassAudit(강사 본인) → 푸시 안 늘어남', (o.C_audit?.q || []).length === 1);
check('이력 기록이 실패해도 안 던지고 푸시는 간다', o.C_auditFail?.threw === false && (o.C_auditFail?.q || []).length === 1);
const cm = o.C_move || {};
check('이동 엔진 훅 블록을 소스에서 오려 냈다', cm.hookLen > 50);
check('이동(날짜 바뀜) → 원래 강사·원래 시각으로 1번', (cm.moved || []).length === 1 && cm.moved[0].teacher_id === 7 && cm.moved[0].lesson_date === '2026-11-11' && cm.moved[0].lesson_time === '19:20');
check('이동(시각만 바뀜) → 1번', (cm.timeOnly || []).length === 1);
check('날짜+강사가 함께 바뀜 → «원래» 강사(7)에게', (cm.movedAndTeacher || []).length === 1 && cm.movedAndTeacher[0].teacher_id === 7);
check('짝: 강사만 바뀜 → 0번', Array.isArray(cm.teacherOnly) && cm.teacherOnly.length === 0);
check('짝: 강사 본인 이동 → 0번', Array.isArray(cm.byTeacher) && cm.byTeacher.length === 0);
check('짝: 되돌리기·복구(guarded) → 0번', Array.isArray(cm.guarded) && cm.guarded.length === 0);

{
  const DAYS = rd('api-admin-class-days.ts');
  const setAt = DAYS.indexOf('_origTeacherId = cs.teacher_id');
  const updAt = DAYS.indexOf("UPDATE class_schedules SET teacher_id = ? WHERE id = ?");
  const auAt = DAYS.indexOf("source: 'schedule-request',");
  check('승인 경로 — 강사 바꾸기 «전» 스냅샷에서 원래 강사를 잡는다', setAt > 0 && updAt > setAt);
  check('승인 경로 — 그 값을 writeClassAudit 의 teacher_id 로 넘긴다', auAt > 0 && /teacher_id:\s*_origTeacherId/.test(DAYS.slice(auAt - 300, auAt)));
  const AUTO = rd('student-auto-postpone.ts');
  const aAt = AUTO.indexOf("source: 'schedule-request-auto'");
  check('자동 연기 경로 — writeClassAudit 에 바꾸기 전 cs.teacher_id', aAt > 0 && /teacher_id:\s*cs\.teacher_id/.test(AUTO.slice(aAt - 300, aAt)));
  check('이력 표에는 teacher_id 를 안 쓴다(INSERT 칸 목록 그대로)', !/INSERT INTO class_audit_log \([^)]*teacher_id/.test(rd('class-audit.ts')));
}

console.log('\n[D] 강사 화면 Paid/Unpaid 식 = 급여 식');
check('급여 정본에서 식을 오려 냈다', (o.D?.declLen || 0) > 100);
check(`규칙·fee 조합 ${o.D?.n || 0}개 전부 급여와 같은 지급률`, o.D && o.D.n >= 100 && o.D.bad === 0);

console.log('\n[E] 강사 화면');
{
  const H = readFileSync(join(PUB_DIR, 'teacher.html'), 'utf8');
  const cut = (name) => { const i = H.indexOf('function ' + name + '('); return i < 0 ? '' : H.slice(i, H.indexOf('{', i)) + blockFrom(H, H.indexOf('{', i)); };
  const src = cut('payPctText') + '\n' + cut('sboxHtml');
  let lang = 'en';
  const T = (en, ko) => lang === 'en' ? en : ko;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let fns = null;
  try { fns = new Function('T', 'esc', src + '; return { payPctText, sboxHtml };')(T, esc); } catch (e) { console.log(e.message); }
  check('payPctText·sboxHtml 를 오려 냈다', !!fns);
  if (fns) {
    check('100 → Paid · 0 → Unpaid · 50 → Paid 50%', fns.payPctText({ pay_pct: 100 }) === 'Paid' && fns.payPctText({ pay_pct: 0 }) === 'Unpaid' && fns.payPctText({ pay_pct: 50 }) === 'Paid 50%');
    check('짝: pay_pct 없음/null → 빈 글자', fns.payPctText({}) === '' && fns.payPctText({ pay_pct: null }) === '' && fns.payPctText(null) === '');
    check('연기 상자에 «Unpaid» 가 실제로 들어간다', fns.sboxHtml({ postponed_info: { by: 'Mai', pay_pct: 0 } }, 'post').includes('Unpaid'));
    check('짝: pay_pct 없으면 상자에 Paid/Unpaid 없음', !/Paid|Unpaid/.test(fns.sboxHtml({ postponed_info: { by: 'Mai' } }, 'post')));
    lang = 'ko';
    check('KO → «수업료 미지급»', fns.sboxHtml({ postponed_info: { pay_pct: 0 } }, 'post').includes('수업료 미지급'));
  }
  const rowAt = H.indexOf("if (c.class_state === 'postponed'){");
  const row = rowAt > 0 ? blockFrom(H, H.indexOf('{', rowAt)) : '';
  check('폰 줄(연기 행)에도 payPctText 를 그린다', /payPctText\(c\.postponed_info\)/.test(row));
  const tAt = H.indexOf("if (c.class_state === 'postponed') return '<span class=\"cls-tbl-pnote\">'");
  check('표 보기(기본) 연기 칸에도 payPctText 를 그린다', tAt > 0 && /payPctText\(c\.postponed_info\)/.test(H.slice(tAt, tAt + 400)));
  check('다시 그리기 키에 pay_pct 가 들어 있다(값이 바뀌면 다시 그림)', /postponed_info\.pay_pct/.test(H));
  const AT = rd('api-teacher.ts');
  const piAt = AT.indexOf('c.postponed_info = {');
  check('강사 API — postponed_info 에 급여 식(postponePayPercent)으로 pay_pct', piAt > 0 && /pay_pct:\s*payRules \? postponePayPercent\(payRules, r\.fee_type\)/.test(AT.slice(piAt, piAt + 300)));
  check('강사 API — 그 SELECT 가 fee_type 을 읽는다', /SELECT schedule_id, decided_at, decided_by, requester_name, fee_type FROM schedule_change_requests/.test(AT));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:', FAILS.join(' | ')); process.exit(1); }
