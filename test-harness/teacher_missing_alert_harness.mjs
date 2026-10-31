/* ══════════════════════════════════════════════════════════════════════
   🧑‍🏫 «학생은 왔는데 강사가 없다» → 강사 먼저, 안 닿으면 운영자 문자 1통  (2026-10-28)

   [무슨 일이 있었나] 2026-10-28 19:20 class-4576-20261028 (중국어 강선생님 · 정우영)
     · 학생은 19:18 부터 세 번 들어와 기다렸고, 강사는 그날 서버 요청 0건(중국 회선 추정).
     · 학생 화면의 「강사 미입장」 알림이 두 번 기록됐지만 푸시 0 · 알림톡 0 — 강사 연락처 0.
     · 운영자 문자는 9/6·9/8 에 꺼져 있어 아무도 몰랐다.

   [이 하니스가 지키는 것] — 정본(src/teacher-missing-alert.ts)을 «실제로 돌린다»(node 타입 제거)
     A. 그 사고 그대로 → 운영자 문자 1통이 «음소거 중에도» 나간다 (짝: KV 'all' 이면 여전히 막힌다)
     B. 강사가 있었다 / 모른다 / 이름 없는 «교사» 가 있다 → 문자 0통 (헛문자 방지)
     C. 강사에게 닿았다(이메일·푸시·학생 화면 알림) → 운영자 문자 0통 (짝: 안 닿으면 1통)
     D. 방마다 한 번 · dry 는 아무것도 안 보낸다 · DB 가 던져도 크론을 안 멈춘다
     E. absent-sweep 배선 — «학생이 들어온» 수업을 넘기고, «결석 없음» 조기 반환보다 앞에서 부른다
     F. 운영자 문자 예외 목록에 이 종류가 있고, 9/6 의 「결석 위험」은 여전히 꺼져 있다
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '../cloudflare-deploy/src');
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
/* 블록·줄 주석을 벗긴 사본(문자열 안의 // 는 살린다) — 부정 검사용 */
function stripComments(src) {
  let out = '', inStr = null, inLine = false, inBlock = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { out += c; if (c === '\\') { out += n; i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') inStr = c;
    out += c;
  }
  return out;
}

console.log('\n🧑‍🏫 학생은 왔는데 강사가 없다 → 강사 먼저, 안 닿으면 운영자\n');

// ═══════════════ A~D. 정본을 실제로 돌린다 ═══════════════
const FILES = ['teacher-missing-alert.ts', 'no-show-truth.ts', 'd1-chunk.ts', 'teacher-push.ts', 'web-push.ts',
               'email.ts', 'solapi-client.ts', 'site-url.ts', 'owner-sms-mute.ts'];
const tmp = mkdtempSync(join(tmpdir(), 'tma-'));
const fix = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
for (const f of FILES) writeFileSync(join(tmp, f), fix(rd(f)));

const runner = `
  import { runTeacherMissingAlerts, shouldEscalateTeacherMissing, hasUnattributedTeacher, teacherMissingOwnerText } from './teacher-missing-alert.ts';
  const NOW = Date.UTC(2026, 9, 28, 10, 32, 0);          // 2026-10-28 19:32 KST (+12분)
  const ROOM = 'class-4576-20261028';
  const OWNER = '01099998888';
  const out = {};
  const calls = [];                                       // 바깥으로 나간 요청(문자·이메일)
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    let body = null; try { body = JSON.parse(init && init.body || 'null'); } catch {}
    calls.push({ url: u, body });
    if (u.includes('solapi')) return new Response(JSON.stringify({ statusCode: '2000', messageId: 'm' + calls.length }), { status: 200 });
    if (u.includes('resend')) return new Response(JSON.stringify({ id: 'e' + calls.length }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  console.log = () => {}; console.warn = () => {};      // 정본의 로그는 결과 JSON 을 가리지 않게

  function mkDb(cfg = {}) {
    const st = { claimed: new Set(cfg.claimed || []), inserts: 0, updates: [] };
    const first = (sql, a) => {
      if (/FROM teacher_missing_alert WHERE room_id/.test(sql)) return st.claimed.has(a[0]) ? { 1: 1 } : null;
      if (/FROM class_no_show/.test(sql)) return cfg.ns || { p: 0, k: 0 };
      return null;
    };
    const all = (sql, a) => {
      if (/FROM attendance WHERE room_id IN/.test(sql)) {
        if (cfg.attInThrow) throw new Error('attendance IN boom');
        return (cfg.att || []).map(r => ({ room_id: ROOM, joined_at: NOW - 600000, out_at: NOW - 1000, ...r }));
      }
      if (/FROM attendance WHERE room_id = \\?/.test(sql)) return cfg.att || [];
      if (/FROM teacher_account_links l/.test(sql)) return cfg.links || [];
      if (/FROM teacher_account_links WHERE CAST/.test(sql)) return (cfg.accounts || []).map(u => ({ username: u }));
      if (/FROM push_subscriptions/.test(sql)) return (cfg.subs || []).map(e => ({ endpoint: e }));
      return [];
    };
    const run = (sql, a) => {
      if (/INSERT OR IGNORE INTO teacher_missing_alert/.test(sql)) {
        if (st.claimed.has(a[0])) return { meta: { changes: 0 } };
        st.claimed.add(a[0]); st.inserts++; return { meta: { changes: 1 } };
      }
      if (/UPDATE teacher_missing_alert/.test(sql)) st.updates.push(a);
      return { meta: { changes: 1 } };
    };
    const mk = (sql, a) => ({ first: async () => first(sql, a), all: async () => ({ results: all(sql, a) }), run: async () => run(sql, a) });
    return { st, exec: async () => ({}), prepare(sql) { if (cfg.throwAll) throw new Error('boom'); return { ...mk(sql, []), bind: (...a) => mk(sql, a) }; } };
  }
  const env = (db, extra = {}) => ({
    DB: db, OWNER_ALERT_PHONE: OWNER,
    SOLAPI_API_KEY: 'k', SOLAPI_API_SECRET: 's', SOLAPI_FROM_PHONE: '16440561',
    SESSION_STATE: { async get() { return extra.kv === undefined ? null : extra.kv; } },
    ...(extra.email ? { RESEND_API_KEY: 'r', RESEND_FROM: 'noreply@mangoi.ai' } : {}),
    ...(extra.push ? { WEB_PUSH_MODE: 'mock' } : {}),
  });
  const contact = (c = {}) => async () => ({ name: '중국어 강선생님', phone: null, email: null, why: 'linked_but_no_contact', ...c });
  const CASE = { room_id: ROOM, schedule_id: 4576, teacher_id: '29', user_id: 'jeong', student_name: '정우영', start_time: '19:20', late_min: 12 };
  const STUDENT = [{ role: 'student', username: 'jeong' }];
  const smsTo = () => calls.filter(c => c.url.includes('solapi')).map(c => c.body && c.body.message);
  const go = async (name, cfg, extra, opts = {}) => {
    calls.length = 0;
    const db = mkDb(cfg);
    const r = await runTeacherMissingAlerts(env(db, extra), opts.cases || [CASE], NOW, { dry: !!opts.dry, findContact: opts.findContact || contact(opts.c) });
    out[name] = { r, sms: smsTo(), emails: calls.filter(c => c.url.includes('resend')).length, inserts: db.st.inserts, updates: db.st.updates.length };
    return db;
  };

  // A. 10/28 그대로 — 학생만 있고, 강사 연락처 0, 푸시 0 → 운영자 문자 1통(음소거 기본값 KV=null 에서도)
  await go('A1', { att: STUDENT });
  // A2. 짝 — KV 'all'(완전 침묵) 이면 그래도 막힌다
  await go('A2', { att: STUDENT }, { kv: 'all' });
  // B. 강사가 있었다(교사 강선생님 = 중국어 강선생님) / 모른다(이름 붙은 접속 0) / 이름 없는 «교사»
  await go('B1', { att: [...STUDENT, { role: 'teacher', username: '교사 강선생님' }] });
  await go('B2', { att: [{ role: 'student', username: '' }] });
  await go('B3', { att: [...STUDENT, { role: 'student', username: '교사' }] });
  await go('B4', { att: [...STUDENT, { role: 'teacher', username: '교사 Someone Else' }] });
  // B5. 출석 조회가 실패 → 정본이 빈 Map(판정 없음 = undefined) → «모름» 으로 멈춘다(«없었다» 로 읽지 않는다)
  await go('B5', { att: STUDENT, attInThrow: true });
  // C. 강사에게 닿았다 → 운영자 0통 / 이메일 실패면 → 1통(짝)
  await go('C1', { att: STUDENT }, { email: true }, { c: { email: 'kang@example.com', why: 'linked' } });
  await go('C2', { att: STUDENT }, {}, { c: { email: 'kang@example.com', why: 'linked' } });   // 키 없음 → 이메일 disabled
  await go('C3', { att: STUDENT, ns: { p: 1, k: 0 } });
  await go('C4', { att: STUDENT, accounts: ['hq_t_kang'], subs: ['https://push.example/ep1'] }, { push: true });
  // D. 방마다 한 번 · dry · 던지는 DB · 강사 미배정
  {
    calls.length = 0;
    const db = mkDb({ att: STUDENT });
    const e = env(db);
    const r1 = await runTeacherMissingAlerts(e, [CASE], NOW, { findContact: contact() });
    const r2 = await runTeacherMissingAlerts(e, [CASE], NOW + 900000, { findContact: contact() });
    out.D1 = { s1: r1.details[0].status, s2: r2.details[0].status, sms: smsTo().length };
  }
  {
    // D1b. 두 호출이 «동시에» 돌아도(둘 다 «아직 안 봄» 을 통과) 선점에 이긴 쪽만 보낸다
    calls.length = 0;
    const e = env(mkDb({ att: STUDENT }));
    const rs = await Promise.all([1, 2].map(() => runTeacherMissingAlerts(e, [CASE], NOW, { findContact: contact() })));
    out.D1b = { st: rs.map(r => r.details[0].status).sort(), sms: smsTo().length };
  }
  await go('D2', { att: STUDENT }, {}, { dry: true });
  {
    let threw = false, r = null;
    try { r = await runTeacherMissingAlerts(env(mkDb({ throwAll: true })), [CASE], NOW, { findContact: contact() }); } catch { threw = true; }
    out.D3 = { threw, status: r && r.details[0] && r.details[0].status };
  }
  await go('D4', { att: STUDENT }, {}, { cases: [{ ...CASE, teacher_id: null }] });
  await go('D5', { att: STUDENT }, {}, { findContact: async () => { throw new Error('contact boom'); } });

  out.pure = {
    t: [shouldEscalateTeacherMissing(false, false), shouldEscalateTeacherMissing(false, true),
        shouldEscalateTeacherMissing(null, false), shouldEscalateTeacherMissing(true, false),
        shouldEscalateTeacherMissing(undefined, false)],
    u: [hasUnattributedTeacher([{ role: 'student', username: '교사' }]), hasUnattributedTeacher([{ role: 'student', username: ' Teacher ' }]),
        hasUnattributedTeacher([{ role: 'teacher', username: 'x' }]), hasUnattributedTeacher([{ role: 'student', username: 'jeong' }]),
        hasUnattributedTeacher([{ role: 'student', username: '교사 강선생님' }]), hasUnattributedTeacher([])],
    text: teacherMissingOwnerText('중국어 강선생님', '정우영', '19:20', 12, '푸시 no_linked_account · 이메일 no_email'),
  };
  process.stdout.write(JSON.stringify(out));
`;
writeFileSync(join(tmp, 'run.mjs'), runner);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
rmSync(tmp, { recursive: true, force: true });
let O = null;
try { O = JSON.parse(r.stdout); } catch { console.log(r.stdout.slice(0, 800)); console.log(r.stderr.slice(0, 1500)); }
check('전제: 정본을 타입 제거로 실제로 돌렸다', !!O);

if (O) {
  const st = (k) => O[k] && O[k].r && O[k].r.details[0] && O[k].r.details[0].status;
  console.log('\n[ A. 10/28 그 사고 → 운영자 문자 1통 ]');
  check('A1 학생만 있고 강사 연락처 0 → owner_escalated', st('A1') === 'owner_escalated');
  check('A1 문자가 «실제로» 1통 나갔다 (음소거 기본값 KV=null 에서도)', O.A1.sms.length === 1 && O.A1.r.escalated === 1);
  check('A1 받는 사람은 운영자 번호다', O.A1.sms[0] && O.A1.sms[0].to === '01099998888');
  check('A1 문자에 강사·학생·시각·+분이 들어 있다',
    !!O.A1.sms[0] && /중국어 강선생님/.test(O.A1.sms[0].text) && /정우영/.test(O.A1.sms[0].text)
    && /19:20/.test(O.A1.sms[0].text) && /\+12분/.test(O.A1.sms[0].text));
  check('A1 «왜 안 닿았는지» 를 싣는다 (푸시·이메일 사유)', !!O.A1.sms[0] && /푸시 no_linked_account/.test(O.A1.sms[0].text) && /이메일/.test(O.A1.sms[0].text));
  check('A1 처리 결과를 표에 남긴다(선점 1 · 결과 기록 1)', O.A1.inserts === 1 && O.A1.updates === 1);
  check("A2 짝: KV 'all'(완전 침묵) 이면 여전히 막힌다 → muted", O.A2.sms.length === 0 && O.A2.r.details[0].owner_sms === 'muted');

  console.log('\n[ B. 헛문자 방지 — 있었다·모른다·이름 없는 교사 ]');
  check('B1 «교사 강선생님» 이 있었다 → teacher_present, 문자 0', st('B1') === 'teacher_present' && O.B1.sms.length === 0);
  check('B1 강사가 있으면 선점도 안 한다(나중 수업 판정을 막지 않는다)', O.B1.inserts === 0);
  check('B2 이름 붙은 접속이 0 → presence_unknown, 문자 0', st('B2') === 'presence_unknown' && O.B2.sms.length === 0);
  check('B3 이름 없는 «교사» 가 있다 → teacher_like_in_room, 문자 0', st('B3') === 'teacher_like_in_room' && O.B3.sms.length === 0);
  check('B4 role=teacher 인데 이름이 안 맞는 접속 → teacher_like_in_room, 문자 0', st('B4') === 'teacher_like_in_room' && O.B4.sms.length === 0);
  check('B5 출석 조회 실패(판정 없음) → presence_unknown, 문자 0 — «모름» 을 «없었다» 로 안 읽는다',
    st('B5') === 'presence_unknown' && O.B5.sms.length === 0);

  console.log('\n[ C. 강사에게 닿았으면 운영자 0통 — 짝으로 ]');
  check('C1 이메일이 실제로 나갔다 → teacher_reached, 운영자 0통', st('C1') === 'teacher_reached' && O.C1.emails === 1 && O.C1.sms.length === 0);
  check('C2 짝: 이메일 주소는 있지만 발송 실패(키 없음) → 운영자 1통', st('C2') === 'owner_escalated' && O.C2.sms.length === 1);
  check('C3 학생 화면의 노쇼 알림이 푸시로 닿았다(notified_push=1) → 운영자 0통', st('C3') === 'teacher_reached' && O.C3.sms.length === 0);
  check('C4 강사 웹푸시가 나갔다 → 운영자 0통', st('C4') === 'teacher_reached' && O.C4.r.details[0].push === 'sent' && O.C4.sms.length === 0);

  console.log('\n[ D. 한 번만 · dry · 던지지 않는다 ]');
  check('D1 같은 방을 15분 뒤 다시 봐도 두 번 안 보낸다', O.D1.s1 === 'owner_escalated' && O.D1.s2 === 'already_alerted' && O.D1.sms === 1);
  check('D1b 동시에 두 번 돌아도 문자는 1통 (선점에 진 쪽은 already_alerted)',
    O.D1b.sms === 1 && JSON.stringify(O.D1b.st) === JSON.stringify(['already_alerted', 'owner_escalated']));
  check('D2 dry 는 선점·발송 0 · «할 일» 만 말한다', st('D2') === 'would_notify_teacher' && O.D2.sms.length === 0 && O.D2.inserts === 0);
  check('D3 DB 가 던져도 크론을 안 멈춘다(예외 없이 error 상태)', O.D3.threw === false && /^error:/.test(String(O.D3.status)));
  check('D4 강사 미배정 수업 → no_teacher_id, 문자 0', st('D4') === 'no_teacher_id' && O.D4.sms.length === 0);
  check('D5 연락처 조회가 던져도 예외 없이 넘어간다', /^error:/.test(String(st('D5'))) && O.D5.sms.length === 0);

  console.log('\n[ 판정 정본 — 진리표 ]');
  check('shouldEscalate: (없었다,안닿음)=참 · (없었다,닿음)=거짓 · (모름)=거짓 · (있었다)=거짓 · (undefined)=거짓',
    JSON.stringify(O.pure.t) === JSON.stringify([true, false, false, false, false]));
  check('hasUnattributedTeacher: 교사·Teacher·role=teacher 는 참 / 학생·«교사 강선생님»·빈 목록은 거짓',
    JSON.stringify(O.pure.u) === JSON.stringify([true, true, true, false, false, false]));
}

// ═══════════════ E. absent-sweep 배선 ═══════════════
console.log('\n[ E. absent-sweep 배선 ]');
{
  const sweep = rd('absent-sweep.ts');
  const code = stripComments(sweep);
  const fnIdx = code.indexOf('export async function runAbsentStudentSweep');
  const body = fnIdx >= 0 ? blockFrom(code, code.indexOf('{', code.indexOf(')', fnIdx))) : '';
  check('전제: runAbsentStudentSweep 본문을 잘라 냈다', body.length > 2000);
  const callIdx = body.indexOf('runTeacherMissingAlerts(env, studentJoined');
  const earlyIdx = body.indexOf('if (!newlyAbsent.length) return result;');
  check('학생이 들어온 수업을 그대로 넘긴다 (studentJoined)', callIdx > 0);
  check('«결석 없음» 조기 반환보다 «앞» 에서 부른다 (뒤면 학생이 다 온 날 한 번도 안 돈다)', callIdx > 0 && earlyIdx > 0 && callIdx < earlyIdx);
  check('들어온 학생 분기에서 studentJoined 에 담는다',
    /status: 'joined' \}\); studentJoined\.push\(c\); continue;/.test(body));
  check('dry 와 연락처 정본(findTeacherContact)을 함께 넘긴다',
    /runTeacherMissingAlerts\(env, studentJoined, now, \{ dry, findContact: findTeacherContact \}\)/.test(body));
  check('부르는 자리가 try 로 감싸여 있다 (결석 감지가 멈추지 않게)',
    /try \{\s*result\.teacher_missing = await runTeacherMissingAlerts/.test(body));
}

// ═══════════════ F. 운영자 문자 예외 목록 ═══════════════
console.log('\n[ F. 운영자 문자 예외 — 이 종류만 더했다 ]');
{
  const mute = stripComments(rd('owner-sms-mute.ts'));
  const m = mute.match(/OWNER_ALWAYS_KINDS\s*=\s*\[([^\]]*)\]/);
  const kinds = m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map(x => x[1]) : [];
  check("예외 목록에 'teacher-missing' 이 있다", kinds.includes('teacher-missing'));
  check("9/6 에 끈 «결석 위험»(absent)·노쇼(no-show) 는 여전히 목록에 없다", !kinds.includes('absent') && !kinds.includes('no-show'));
  const tma = stripComments(rd('teacher-missing-alert.ts'));
  const all = [...tma.matchAll(/sendPlainSms\(/g)].length;
  const tagged = [...tma.matchAll(/sendPlainSms\([^;]*?kind:\s*'teacher-missing'/g)].length;
  check(`이 파일의 sendPlainSms 는 «전부» 종류를 밝힌다 (${tagged}/${all})`, all > 0 && tagged === all);
  check('⛔ class_no_show 에 행을 «쓰지» 않는다 (급여 판정과 이어진 표)', !/INSERT\s+INTO\s+class_no_show/i.test(tma));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:', FAILS.join(' | ')); process.exit(1); }
