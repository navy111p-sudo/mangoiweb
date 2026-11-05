/**
 * 📦 퇴사·비활동 강사의 «남은 수업 넘기기» + 🙈 숨긴 계정의 카페24 줄 표시 (2026-11-05)
 *
 *   [왜] 매니저 제보 둘:
 *     ① 「Krystel 을 퇴사로 바꿨는데 수업이 그대로 · 오늘 시간표에 KRYSTEL 과 Teacher Krystel 두 이름」
 *        → «퇴사» 는 이미 잡힌 수업을 옮기지 않는다. 정본 src/teacher-class-transfer.ts 가 남은 수업을 보여 주고
 *          기존 담당 강사 변경 엔진(moveSchedulesAtomically)으로 한꺼번에 넘긴다.
 *     ② 「mangoai_lee 를 연기하려는데 Move 버튼이 없다」 → 숨긴(삭제) 계정이라 망고아이에 행이 없다.
 *        정본 src/cafe24-hidden-student.ts 가 «숨긴 계정» 표시 + 같은 시각·같은 강사 망고아이 수업을 알려 준다.
 *
 *   [무엇을 못 박나] — 문자열이 아니라 «실제로 돌려서»
 *     A. 순수 판정(남은 수업인가·구분·요약·요청 검사·50건 묶음)
 *     B. markHiddenCafe24 — 표시만 하고 «빼지 않는다» 짝, 쌍둥이는 «같은 시각 + 같은 강사» 일 때만
 *     C. 진짜 핸들러 + 진짜 이동 엔진 + 진짜 SQLite:
 *          본사만 · 지난/취소 수업은 안 건드림 · 겹치는 강사는 미리보기에서 막힘 · 넘기면 teacher_id 가 바뀌고
 *          미러 줄은 c24-mirror:manual · 감사 기록 · 이 강사 것이 아닌 번호는 거절 · 낡은 화면은 거절 · 카페24 건수
 *     D. 배선 — 라우트·오늘 수업·화면 세 곳이 정본을 «부르는가»(주석 벗긴 사본으로)
 *     E. 화면 글자 함수(tcHiddenNoteHtml)를 오려 내 실제로 돌린다
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');
const SELF = fileURLToPath(import.meta.url);

/** 주석 벗기기(문자열 안은 지키며) — 배선 검사가 설명 주석을 잡지 않게. */
function strip(src) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (inBlock) { if (c === '*' && d === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && d === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && d === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') q = c;
    out += c; i++;
  }
  return out;
}
/** «시작 위치의 여는 중괄호» 부터 짝이 맞는 닫는 중괄호까지 */
function block(src, start) {
  const open = src.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return '';
}

if (process.env.TCT_CHILD === '1') {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : JSON.stringify(detail) });
  const RealDate = Date;
  const NOW = RealDate.parse('2026-11-05T12:00:00+09:00');
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  };
  globalThis.fetch = async () => { throw new Error('External network is forbidden in this harness'); };
  const { DatabaseSync } = await import('node:sqlite');
  const sq = new DatabaseSync(':memory:');
  const norm = v => v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a.map(norm)),
    async first(col) { const row = sq.prepare(sql).get(...args); return row ? col ? row[col] : { ...row } : null; },
    async all() { return { success: true, results: sq.prepare(sql).all(...args).map(r => ({ ...r })), meta: {} }; },
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }, results: [] }; },
  });
  let onEngineStart = null;   // 이동 엔진이 시작하는 순간(= 바깥 묶음 검사 «뒤») 끼어드는 다른 관리자
  const DB = {
    prepare: sql => {
      if (onEngineStart && /CREATE TABLE IF NOT EXISTS schedule_move_guard/.test(sql)) { const h = onEngineStart; onEngineStart = null; h(); }
      return statement(sql);
    },
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(stmts) {
      const out = [];
      sq.exec('BEGIN IMMEDIATE');
      try { for (const s of stmts) out.push(await s.run()); sq.exec('COMMIT'); }
      catch (e) { sq.exec('ROLLBACK'); throw e; }
      return out;
    },
  };
  const env = { DB };
  const imp = f => import(pathToFileURL(join(SRC, f)).href);

  // ── A. 순수 판정 ──
  const T = await imp('teacher-class-transfer.ts');
  const { isTransferCandidate: cand, transferKindOf: kind, summarizeTransfer: sum, parseTransferApply: parse, chunkIds, kstStartMs, TRANSFER_CHUNK } = T;
  check('A1 앞으로의 날짜 수업은 넘길 대상', cand({ status: 'active', scheduled_date: '2026-11-06', start_time: '14:00', user_id: 'lby01' }, NOW) === true);
  check('A2 짝: 이미 시작한(지난) 날짜 수업은 안 건드린다 — 급여·출결 보호', cand({ status: 'active', scheduled_date: '2026-11-05', start_time: '11:59', user_id: 'x' }, NOW) === false
    && cand({ status: 'active', scheduled_date: '2026-11-01', start_time: '14:00', user_id: 'x' }, NOW) === false);
  check('A3 오늘이라도 아직 안 시작한 수업은 넘긴다', cand({ status: 'active', scheduled_date: '2026-11-05', start_time: '12:01', user_id: 'x' }, NOW) === true);
  check('A4 매주 반복(날짜 없음)은 앞으로의 모든 주라 넘긴다', cand({ status: 'active', scheduled_date: null, day_of_week: 'Fri', start_time: '14:00', user_id: 'x' }, NOW) === true);
  check('A5 취소·종료·완료는 안 건드린다', ['cancelled', 'ended', 'completed', ' Cancelled '].every(st => cand({ status: st, scheduled_date: '2026-12-01', start_time: '10:00', user_id: 'x' }, NOW) === false));
  check('A6 자리표시(lms·type_seed) 행은 안 건드린다', cand({ status: 'active', scheduled_date: '2026-12-01', start_time: '10:00', user_id: 'LMS' }, NOW) === false);
  check('A7 연기된 날짜 수업도 넘긴다(새 강사로 다시 잡게)', cand({ status: 'postponed', scheduled_date: '2026-12-01', start_time: '10:00', user_id: 'x' }, NOW) === true);
  check('A8 시각을 못 읽는 날짜 행은 «넣고» 엔진이 거절하게 — 조용히 0건이 되지 않게', cand({ status: 'active', scheduled_date: '2026-12-01', start_time: '??', user_id: 'x' }, NOW) === true);
  check('A9 KST 시각 계산', kstStartMs('2026-11-06', '14:00') === RealDate.parse('2026-11-06T14:00:00+09:00') && Number.isNaN(kstStartMs('x', '14:00')) && Number.isNaN(kstStartMs('2026-11-06', '25:00')));
  check('A10 구분: adm-enroll → 수강등록 · c24-mirror(:manual) → 복사본 · 그 밖 → 기타',
    kind('adm-enroll:114') === 'enroll' && kind('c24-mirror') === 'mirror' && kind('c24-mirror:manual') === 'mirror' && kind('leveltest_app') === 'other' && kind(null) === 'other');
  const s1 = sum([{ source: 'adm-enroll:1', user_id: 'a', scheduled_date: '2026-11-06' }, { source: 'c24-mirror', user_id: 'b', scheduled_date: '2026-11-13' }, { source: 'x', user_id: 'a', scheduled_date: null }]);
  check('A11 요약: 건수·구분·학생·기간·매주', s1.total === 3 && s1.by_kind.enroll === 1 && s1.by_kind.mirror === 1 && s1.by_kind.other === 1 && s1.students === 2 && s1.weekly === 1 && s1.first_date === '2026-11-06' && s1.last_date === '2026-11-13', s1);
  const okBody = { to_teacher_id: '21', ids: ['5', 5, '6'], expected: { 5: 'v5', 6: 'v6' } };
  const p1 = parse(okBody);
  check('A12 요청 검사: 정상 본문(중복 번호는 하나로)', p1.ok === true && p1.ids.join(',') === '5,6' && p1.to === '21' && p1.expected['5'] === 'v5', p1);
  check('A13 요청 검사: 강사 없음·번호 없음·잘못된 번호·expected 없음은 거절',
    parse({ ...okBody, to_teacher_id: '' }).ok === false && parse({ ...okBody, ids: [] }).ok === false
    && parse({ ...okBody, ids: ['5', 'x'] }).ok === false && parse({ ...okBody, expected: { 5: 'v5' } }).ok === false
    && parse({ ...okBody, ids: ['0'] }).ok === false);
  check('A14 요청 검사: 상한을 넘으면 거절', parse({ to_teacher_id: '21', ids: Array.from({ length: T.TRANSFER_MAX_IDS + 1 }, (_, i) => String(i + 1)), expected: {} }).error === 'too_many');
  const pg = parse({ ...okBody, allow_group_ids: ['6'] });
  check('A14b 묶음 허용 목록: 없으면 빈 목록 · 있으면 그대로 · 잘못된 값은 거절',
    p1.allowGroup instanceof Set && p1.allowGroup.size === 0 && pg.ok === true && pg.allowGroup.has('6')
    && parse({ ...okBody, allow_group_ids: ['x'] }).ok === false && parse({ ...okBody, allow_group_ids: 'all' }).ok === false);
  const ch = chunkIds(Array.from({ length: 120 }, (_, i) => String(i + 1)));
  check('A15 50건 묶음(엔진 상한)', TRANSFER_CHUNK === 50 && ch.length === 3 && ch[0].length === 50 && ch[2].length === 20);

  // ── B. 숨긴 계정 표시 ──
  const { markHiddenCafe24: mark } = await imp('cafe24-hidden-student.ts');
  const nt = v => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/^teacher\s+/, '');
  const at = RealDate.parse('2026-11-06T14:00:00+09:00');
  const mk = () => [
    { source: 'mangoi', student_uid: 'lby01', student_name: '이병엽', start_ts: at, teacher_name: 'KRYSTEL' },
    { source: 'cafe24', student_uid: 'mangoai_lee', start_ts: at, teacher_name: 'Teacher Krystel' },
    { source: 'cafe24', student_uid: '정우영2', start_ts: at + 3600000, teacher_name: 'Teacher Kaye' },
    { source: 'cafe24', student_uid: 'visible_kid', start_ts: at, teacher_name: 'Teacher Krystel' },
    { source: 'mangoi', student_uid: 'other_t', start_ts: at, teacher_name: 'BELLE' },
    { source: 'mangoi', student_uid: 'cancelled_kid', start_ts: at, teacher_name: 'KRYSTEL', cancelled: true },
  ];
  let rows = mk();
  const n1 = mark(rows, new Set(['mangoai_lee', '정우영2']), nt);
  check('B1 숨긴 계정 두 줄에 표시 · 표시 수를 돌려준다', n1 === 2 && rows[1].student_hidden === true && rows[2].student_hidden === true, n1);
  check('B2 짝: 줄을 빼지 않는다(숨긴 계정에도 진짜 수업이 있다 — 정우영2)', rows.length === 6);
  check('B3 짝: 숨기지 않은 계정에는 표시가 없다', !rows[3].student_hidden && !rows[0].student_hidden);
  check('B4 같은 시각 + 같은 강사(정규화 이름) 망고아이 수업을 알려 준다', JSON.stringify(rows[1].hidden_twins || null) === JSON.stringify([{ student_uid: 'lby01', student_name: '이병엽' }]), rows[1].hidden_twins);
  check('B5 짝: 다른 강사(BELLE)·취소된 줄은 쌍둥이가 아니다', Array.isArray(rows[1].hidden_twins) && !rows[1].hidden_twins.some(t => t.student_uid === 'other_t' || t.student_uid === 'cancelled_kid'));
  check('B6 짝: 같은 강사여도 시각이 다르면 쌍둥이가 없다', Array.isArray(rows[2].hidden_twins) && rows[2].hidden_twins.length === 0);
  rows = mk();
  check('B7 숨김 목록을 못 읽으면(빈 Set) 아무 표시도 안 한다 — 지어내지 않는다', mark(rows, new Set(), nt) === 0 && rows.every(r => !r.student_hidden));
  rows = mk();
  check('B8 아이디는 대소문자까지 정확일치(MANGOAI_LEE ≠ mangoai_lee)', mark(rows, new Set(['MANGOAI_LEE']), nt) === 0);
  rows = mk(); rows[0].teacher_name = 'KRYSTELLA';
  mark(rows, new Set(['mangoai_lee']), nt);
  check('B9 짝: 부분일치로 강사를 잇지 않는다(KRYSTELLA ≠ Krystel)', Array.isArray(rows[1].hidden_twins) && rows[1].hidden_twins.length === 0);
  rows = mk(); rows[0].postponed = true;
  mark(rows, new Set(['mangoai_lee']), nt);
  check('B10 짝: 연기된 망고아이 줄은 그 시각에 수업이 없다 — 쌍둥이 아님', Array.isArray(rows[1].hidden_twins) && rows[1].hidden_twins.length === 0);

  // ── C. 진짜 핸들러 + 이동 엔진 + SQLite ──
  // 2026-11-05 main(#2113)이 api-admin.ts 를 여러 모듈(admin-*.ts·api-admin-*.ts)로 나눠 teachers 등의 CREATE 가 옮겨 갔다 —
  // DDL 은 «그 묶음 전체» 에서 찾는다(파일 이름을 하나로 못 박으면 다음 분리 때 또 «no such table» 로 죽는다).
  const adminSrc = readdirSync(SRC).filter(f => f === 'api-admin.ts' || /^(admin-|api-admin-).*\.ts$/.test(f)).sort()
    .map(f => readFileSync(join(SRC, f), 'utf8')).join('\n');
  const lessonSrc = readFileSync(join(SRC, 'api-lessons.ts'), 'utf8');
  const scopeSrc = readFileSync(join(SRC, 'scope.ts'), 'utf8');
  const ddl = (src, table, needs = '') => {
    for (const m of src.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g'))) {
      if (m[1].includes(needs)) return m[1];
    }
    throw new Error('Production DDL not found: ' + table);
  };
  sq.exec(ddl(adminSrc, 'class_schedules', 'duration_min INTEGER DEFAULT 20'));
  sq.exec('ALTER TABLE class_schedules ADD COLUMN starts_on TEXT');
  sq.exec(ddl(scopeSrc, 'admin_scope'));
  const ti = adminSrc.indexOf('`CREATE TABLE IF NOT EXISTS teachers (`');
  const te = adminSrc.indexOf("].join(' ')", ti);
  sq.exec([...adminSrc.slice(ti, te).matchAll(/`([^`]*)`/g)].map(m => m[1]).join(' '));
  sq.exec(ddl(adminSrc, 'teacher_unavailability'));
  sq.exec(ddl(lessonSrc, 'calendar_events'));
  sq.exec(ddl(adminSrc, 'teacher_profiles', 'leave_date TEXT, education TEXT'));
  sq.exec('ALTER TABLE teacher_profiles ADD COLUMN linked_teacher_id INTEGER');
  sq.exec('CREATE TABLE teacher_payroll_auto (teacher_id INTEGER, teacher_name TEXT, year INTEGER, month INTEGER)');
  sq.exec('CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, user_id TEXT, date TEXT, joined_at INTEGER, teacher_uid TEXT, status TEXT)');
  sq.exec('CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT)');
  const exec = (sql, ...a) => sq.prepare(sql).run(...a);
  const insert = (table, data) => {
    const keys = Object.keys(data);
    return Number(exec(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...Object.values(data)).lastInsertRowid);
  };
  for (const [id, name, active] of [[16, 'KRYSTEL', 0], [21, 'KAYE', 1], [22, 'FAR', 1], [23, 'OLD', 0]]) insert('teachers', { id, name, active, created_at: NOW, updated_at: NOW });
  insert('teacher_profiles', { id: 7, korean_name: 'Teacher Krystel', english_name: 'Teacher Krystel', status: '퇴사', linked_teacher_id: 16, created_at: NOW });
  insert('teacher_profiles', { id: 8, korean_name: 'Unlinked', status: '퇴사', created_at: NOW });
  for (const [u, s] of [['boss', 'hq'], ['branchy', 'branch'], ['tchr', 'teacher']]) insert('admin_scope', { username: u, scope_type: s, updated_at: NOW });
  insert('students_erp', { user_id: 'lby01', korean_name: '이병엽' });
  const seed = (o = {}) => insert('class_schedules', {
    user_id: 'lby01', student_name: null, schedule_kind: 'dated', class_type: 'regular', day_of_week: null,
    scheduled_date: '2026-11-06', start_time: '14:00', duration_min: 20, teacher_id: '16', status: 'active',
    source: 'adm-enroll:114', created_at: NOW, updated_at: null, starts_on: null, ...o,
  });
  const R = {
    e1: seed(),
    e2: seed({ scheduled_date: '2026-11-13' }),
    mir: seed({ user_id: 'JMJ01', scheduled_date: '2026-11-06', start_time: '15:10', source: 'c24-mirror', notes: 'c24:1' }),
    week: seed({ user_id: 'gng01', scheduled_date: null, schedule_kind: 'recurring', day_of_week: 'Wed', start_time: '21:40' }),
    past: seed({ scheduled_date: '2026-11-04' }),
    cancelled: seed({ scheduled_date: '2026-11-20', status: 'cancelled' }),
    placeholder: seed({ user_id: 'lms', scheduled_date: '2026-11-20' }),
    other: seed({ user_id: 'zz', teacher_id: '21', scheduled_date: '2026-11-20' }),
    farBusy: seed({ user_id: 'far_kid', teacher_id: '22', scheduled_date: '2026-11-06', start_time: '15:20', source: 'manual' }),   // 15:10~15:30 과 «어긋나게» 겹침 → 충돌
    kayeSame: seed({ user_id: 'kaye_one', teacher_id: '21', scheduled_date: '2026-11-13', start_time: '14:00', source: 'manual' }),   // e2 와 «같은 자리» → 엔진은 묶음으로 허용
  };
  // 카페24: 191 = Teacher Krystel(퇴사 → leftTeacherId 로 이어짐) · 300 = Teacher Kaye
  insert('teacher_payroll_auto', { teacher_id: 191, teacher_name: 'Teacher Krystel', year: 2026, month: 10 });
  insert('teacher_payroll_auto', { teacher_id: 300, teacher_name: 'Teacher Kaye', year: 2026, month: 10 });
  const c24 = (u, ymd, hm, tid) => insert('attendance', { room_id: 'c24-' + u + ymd + hm, user_id: u, date: ymd, joined_at: RealDate.parse(`${ymd}T${hm}:00+09:00`), teacher_uid: String(tid), status: 'scheduled' });
  c24('mangoai_lee', '2026-11-06', '14:00', 191); c24('mangoai_lee', '2026-11-13', '14:00', 191); c24('gng01', '2026-11-11', '21:40', 191);
  c24('gng01', '2026-11-04', '21:40', 191);   // 지난 것 — 세지 않는다
  c24('kaye_kid', '2026-11-06', '10:00', 300); // 다른 강사 — 세지 않는다

  const { handleTeacherClassTransfer: handle } = await imp('teacher-class-transfer.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  await ensureClassAuditTable(env);
  const hq = { ok: true, username: 'boss', name: '본사', isTeacher: false };
  const snap = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const tidOf = id => String(sq.prepare('SELECT teacher_id FROM class_schedules WHERE id=?').get(id).teacher_id);
  const call = (actor, body, pid = 7) => handle(env, actor, pid, body, NOW);

  let r = await call(hq, { action: 'nope' });
  check('C1 모르는 action 은 400', r.status === 400 && r.body.error === 'unknown_action', r);
  const before = snap();
  for (const [name, actor] of [['강사', { ok: true, username: 'tchr', isTeacher: true }], ['지사', { ok: true, username: 'branchy', isTeacher: false }],
    ['스코프 모름', { ok: true, username: 'ghost', isTeacher: false }], ['로그인 안 함', { ok: false, username: '' }]]) {
    const g1 = await call(actor, { action: 'transfer_preview' });
    const g2 = await call(actor, { action: 'transfer_apply', to_teacher_id: '21', ids: [String(R.e1)], expected: { [R.e1]: 'x' } });
    check('C2 ' + name + ' 은 보기·넘기기 모두 막힘', g1.status >= 401 && g1.status <= 403 && g2.status >= 401 && g2.status <= 403 && g1.body.ok === false, { g1: g1.status, g2: g2.status });
  }
  check('C3 막힌 요청은 아무것도 안 바꿨다', snap() === before);
  r = await call(hq, { action: 'transfer_preview' }, 8);
  check('C4 원부와 연결 안 된 프로필은 «not_linked» 로 말한다(추측해 잇지 않는다)', r.status === 409 && r.body.error === 'not_linked', r);

  r = await call(hq, { action: 'transfer_preview' });
  const ids = (r.body.rows || []).map(x => x.id);
  check('C5 미리보기: 남은 수업 = 날짜 2 + 복사본 1 + 매주 1', r.status === 200 && r.body.ok === true && r.body.summary.total === 4
    && r.body.summary.by_kind.enroll === 3 && r.body.summary.by_kind.mirror === 1 && r.body.summary.weekly === 1, r.body.summary);
  check('C6 짝: 지난·취소·자리표시·다른 강사 수업은 목록에 없다', ![R.past, R.cancelled, R.placeholder, R.other, R.farBusy].some(id => ids.includes(String(id))), ids);
  check('C7 학생 이름은 명부에서', r.body.rows.find(x => x.id === String(R.e1)).student_name === '이병엽');
  check('C8 넘겨받을 후보 = 활동중인 다른 강사만(퇴사 OLD·자기 자신 없음)', JSON.stringify(r.body.targets.map(t => t.name)) === JSON.stringify(['FAR', 'KAYE']), r.body.targets);
  check('C9 카페24: Teacher Krystel(퇴사자)을 찾아 앞으로의 예약만 센다', r.body.cafe24.known === true && r.body.cafe24.count === 3 && r.body.cafe24.students === 2
    && r.body.cafe24.c24_ids.join(',') === '191' && r.body.cafe24.names.includes('Teacher Krystel'), r.body.cafe24);
  check('C10 짝: 미리보기는 아무것도 안 바꾼다', snap() === before);

  r = await call(hq, { action: 'transfer_preview', to_teacher_id: '22' });
  const mirRow = r.body.rows.find(x => x.id === String(R.mir));
  check('C11 어긋나게 겹치는 강사(FAR 15:20)는 그 줄만 «못 넘김», 나머지는 가능', mirRow.verdict === 'blocked' && mirRow.reason === 'conflict' && r.body.movable === 3, { mirRow, movable: r.body.movable });
  r = await call(hq, { action: 'transfer_preview', to_teacher_id: '23' });
  check('C12 퇴사 강사에게는 못 넘긴다', r.status === 400 && r.body.error === 'target_invalid', r);
  r = await call(hq, { action: 'transfer_preview', to_teacher_id: '16' });
  check('C13 자기 자신에게는 못 넘긴다', r.status === 400 && r.body.error === 'target_invalid', r);

  const pv = await call(hq, { action: 'transfer_preview', to_teacher_id: '21' });
  const e2Row = pv.body.rows.find(x => x.id === String(R.e2));
  check('C14 KAYE 로는 3건 «가능» + 1건 «묶음 주의»(KAYE 가 같은 자리에 kaye_one 수업이 있다 — 1:1 이 조용히 그룹이 되지 않게)',
    pv.body.movable === 3 && pv.body.group_count === 1 && e2Row.verdict === 'group' && JSON.stringify(e2Row.group_with) === JSON.stringify(['kaye_one']), pv.body.rows);
  check('C14b 짝: 넘길 줄끼리는 묶음 주의가 아니다(KAYE 의 «기존» 수업만 본다)', pv.body.rows.filter(x => x.verdict === 'group').length === 1);
  const exp = Object.fromEntries(pv.body.rows.map(x => [x.id, x.move_version]));
  // 이 강사 것이 아닌 번호(지난 수업)를 끼우면 통째로 거절
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: [String(R.e1), String(R.past)], expected: { ...exp, [R.past]: 'x' } });
  check('C15 남은 수업이 아닌 번호(지난 수업)를 끼우면 거절 · 아무것도 안 바꿈', r.status === 409 && r.body.error === 'not_candidate' && snap() === before, r);
  // 낡은 화면(expected 불일치)은 엔진이 거절
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: [String(R.e1)], expected: { [R.e1]: 'stale' } });
  check('C16 낡은 화면은 거절(다른 변경을 덮지 않는다) · 아무것도 안 바꿈', r.body.ok === false && r.body.error === 'schedule_changed' && snap() === before, r);

  const pick = [String(R.e1), String(R.e2), String(R.mir), String(R.week)];
  // 👥 묶음이 되는 줄(e2)을 «허용» 없이 보내면 서버가 거절 — 화면을 거치지 않은 요청이어도 1:1 이 조용히 그룹이 되지 않게
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: pick, expected: exp });
  check('C16b 묶음 허용 없이 묶음이 되는 줄을 보내면 409 group_not_allowed · 아무것도 안 바꿈',
    r.status === 409 && r.body.error === 'group_not_allowed' && JSON.stringify(r.body.ids) === JSON.stringify([String(R.e2)]) && snap() === before, r);
  // 미리보기 «뒤» 에 넘겨받을 강사에게 같은 자리 수업이 새로 생긴 경우(TOCTOU) — e1(11/06 14:00)
  const lateId = seed({ user_id: 'late_kid', teacher_id: '21', scheduled_date: '2026-11-06', start_time: '14:00', source: 'manual' });
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: [String(R.e1)], expected: { [R.e1]: exp[R.e1] } });
  check('C16c 미리보기 뒤 새로 생긴 같은 자리 수업도 넘기는 순간 다시 잡는다(TOCTOU)', r.status === 409 && r.body.error === 'group_not_allowed' && tidOf(R.e1) === '16', r);
  exec('DELETE FROM class_schedules WHERE id = ?', lateId);
  // 🏁 Codex 지적(PR #2114): 바깥 검사가 끝난 «뒤», 엔진이 스냅샷을 잡기 «전» 에 같은 자리 수업이 생기는 경우 —
  //    엔진은 같은 자리 묶음을 원래 허용하므로, 묶음 허용은 엔진 «안» 에서 그 스냅샷과 같은 사실로 판정해야 한다.
  let raceId = null;
  onEngineStart = () => { raceId = seed({ user_id: 'race_kid', teacher_id: '21', scheduled_date: '2026-11-06', start_time: '14:00', source: 'manual' }); };
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: [String(R.e1)], expected: { [R.e1]: exp[R.e1] }, allow_group_ids: [] });
  check('C16d 바깥 검사 뒤·엔진 스냅샷 전에 생긴 같은 자리 수업도 엔진이 거절(group_not_allowed) · e1 그대로',
    raceId !== null && r.body.ok === false && r.body.error === 'group_not_allowed' && tidOf(R.e1) === '16', { r, raceId });
  onEngineStart = null;
  if (raceId) exec('DELETE FROM class_schedules WHERE id = ?', raceId);
  r = await call(hq, { action: 'transfer_apply', to_teacher_id: '21', ids: pick, expected: exp, allow_group_ids: [String(R.e2)] });
  check('C17 넘기기 성공: 4건', r.status === 200 && r.body.ok === true && r.body.moved === 4, r);
  check('C18 넘긴 줄의 담당 강사가 KAYE(21)로 바뀌었다', pick.every(id => tidOf(id) === '21'), pick.map(tidOf));
  check('C17b 사람이 고른 «묶음 주의» 줄도 넘어간다(엔진의 묶음 계약)', tidOf(R.e2) === '21' && tidOf(R.kayeSame) === '21');
  check('C19 짝: 지난·취소·다른 강사 줄은 그대로', tidOf(R.past) === '16' && tidOf(R.cancelled) === '16' && tidOf(R.other) === '21' && tidOf(R.farBusy) === '22');
  const mirSrc = sq.prepare('SELECT source FROM class_schedules WHERE id=?').get(R.mir).source;
  check('C20 미러 줄은 «사람이 고친 수업»(c24-mirror:manual) — 카페24 동기화가 되돌리지 않게', mirSrc === 'c24-mirror:manual', mirSrc);
  const dateKept = sq.prepare('SELECT scheduled_date, start_time FROM class_schedules WHERE id=?').get(R.e1);
  check('C21 날짜·시각은 그대로(강사만 바뀜)', dateKept.scheduled_date === '2026-11-06' && dateKept.start_time === '14:00', dateKept);
  const audits = sq.prepare("SELECT schedule_id, action, reason, detail FROM class_audit_log WHERE action='reschedule'").all();
  check('C22 줄마다 감사 기록(누가·왜) — 사유에 «KRYSTEL → KAYE»', audits.length === 4 && audits.every(a => /KRYSTEL → KAYE/.test(a.reason || '') && JSON.parse(a.detail).teacher_changed === true), audits);
  r = await call(hq, { action: 'transfer_preview' });
  check('C23 넘긴 뒤 다시 보면 남은 망고아이 수업 0건(카페24 예약은 그대로 3건 — 카페24에서 바꿀 일)', r.body.summary.total === 0 && r.body.cafe24.count === 3, { s: r.body.summary, c: r.body.cafe24.count });

  // ── E. 화면 글자 함수(tcHiddenNoteHtml)를 오려 내 실제로 돌린다 ──
  const ui = strip(readFileSync(join(PUB, 'js/adm-today-classes.js'), 'utf8'));
  const fnStart = ui.indexOf('function tcHiddenNoteHtml(s)');
  const fnSrc = fnStart >= 0 ? block(ui, fnStart) : '';
  let noteFn = null;
  try {
    noteFn = new Function('T', 'esc', fnSrc + '\nreturn tcHiddenNoteHtml;')(
      (ko, en) => ko, s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  } catch (e) { check('E0 전제: tcHiddenNoteHtml 을 오려 냈다', false, e.message); }
  check('E0 전제: tcHiddenNoteHtml 을 오려 냈다', typeof noteFn === 'function');
  if (typeof noteFn === 'function') {
    const withTwin = noteFn({ hidden_twins: [{ student_uid: 'lby01', student_name: '이병엽' }] });
    const noTwin = noteFn({ hidden_twins: [] });
    check('E1 쌍둥이가 있으면 그 학생(아이디)과 «그 줄에서 연기» 를 말한다', /숨긴\(삭제\)/.test(withTwin) && withTwin.includes('lby01') && /그 줄의 📅/.test(withTwin), withTwin);
    check('E2 쌍둥이가 없으면 «카페24에서» 를 말한다(지어내지 않는다)', /카페24에서 바꾸거나 정리/.test(noTwin) && !noTwin.includes('lby01'), noTwin);
    check('E3 이름은 이스케이프한다', noteFn({ hidden_twins: [{ student_uid: '<b>x', student_name: null }] }).includes('&lt;b&gt;x'));
  }

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
}

// ── 부모: 배선 검사(주석 벗긴 사본) + 자식 실행 ──
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); } };
const rd = p => readFileSync(join(ROOT, 'cloudflare-deploy', p), 'utf8');
const admin = strip(rd('src/api-admin.ts'));
// D1 라우트: teacher-profiles/:id 블록 «안» 에서 POST 를 정본으로 넘긴다
const tpAt = admin.indexOf("const tpMatch = path.match(/^\\/api\\/admin\\/teacher-profiles\\/(\\d+)$/);");
const tpBlock = tpAt >= 0 ? block(admin, admin.indexOf('if (tpMatch)', tpAt)) : '';
ok('D0 전제: teacher-profiles/:id 블록을 잘라 냈다', tpBlock.length > 200);
const postAt = tpBlock.indexOf("if (method === 'POST')");
const postBlock = postAt >= 0 ? block(tpBlock, postAt) : '';
ok('D1 그 블록의 POST 가 handleTeacherClassTransfer 를 부르고 그 결과를 돌려준다', /handleTeacherClassTransfer\(\s*env[^,]*,\s*_tpiActor\s*,\s*id\s*,/.test(postBlock) && /return\s+_hoRes/.test(postBlock), postBlock.slice(0, 200));
ok('D2 짝: 강사 차단(non-GET 403)이 POST «앞» 에 있다', tpBlock.indexOf("_tpiActor.isTeacher && method !== 'GET'") >= 0 && tpBlock.indexOf("_tpiActor.isTeacher && method !== 'GET'") < postAt);
// D3 오늘 수업: 숨김 조회 → markHiddenCafe24 → 응답 칸
const todayAt = admin.indexOf("if (method === 'GET' && path === '/api/admin/classes/today')");
const today = todayAt >= 0 ? block(admin, todayAt) : '';
ok('D3 오늘 수업이 숨김 정본 loadHiddenStudents(미러와 같은 판정)의 결과를 markHiddenCafe24 에 넘긴다(SQL 복제 없음)',
  /markHiddenCafe24\(\s*sessions\s*,\s*await loadHiddenStudents\(/.test(today) && !/student_erp_override WHERE hidden = 1/.test(today));
ok('D4 응답에 cafe24_hidden_student 를 싣는다(셈이 0 으로 하드코딩되지 않았다)', /cafe24_hidden_student:\s*c24HiddenStudents/.test(today) && /c24HiddenStudents\s*=\s*markHiddenCafe24/.test(today));
ok('D5 짝: 숨긴 계정 줄을 «빼는» 코드가 없다(filter 로 student_hidden 을 거르지 않는다)', !/student_hidden[^;\n]*filter|filter\([^)]*student_hidden/.test(today));
const markAt = today.indexOf('markHiddenCafe24(sessions');
ok('D6 순서: 다른 날로 옮긴 줄을 넣은 «뒤», 연락처 «앞» 에 표시한다', markAt > today.indexOf('loadMovedAwayEvents') && markAt < today.indexOf('loadContactPhones'));
// 화면
const tc = strip(rd('public/js/adm-today-classes.js'));
ok('D7 admin 오늘 수업: 카페24 줄에서 student_hidden 이면 tcHiddenNoteHtml 을 붙인다', /if\s*\(\s*s\.student_hidden\s*\)\s*act\s*\+=\s*tcHiddenNoteHtml\(s\)/.test(tc));
const mg = strip(rd('public/manager.html'));
ok('D8 manager.html: r.student_hidden 이면 숨김 안내와 hidden_twins 를 그린다', /if\s*\(\s*r\.student_hidden\s*\)/.test(mg) && /r\.hidden_twins/.test(mg));
const core = strip(rd('public/js/adm-core.js'));
ok('D9 강사 명부 상태 메뉴에 «남은 수업 넘기기» 항목과 그 클릭이 창을 연다', /data-act="transfer"/.test(core) && /act === 'transfer'[^\n]*window\.tpOpenClassTransfer\(id\)/.test(core));
ok('D10 퇴사·비활동으로 바꾼 직후(되돌리기 아님) 남은 수업이 있을 때만 창을 연다', /!_tpIsWorking\(next\)[^\n]*tpOpenClassTransfer/.test(core) && /tpOpenClassTransfer\(id,\s*\{\s*onlyIfAny:\s*true/.test(core));
ok('D10b 창이 토스트를 덮으므로 «되돌리기» 를 창에 넘긴다(undo → 이전 상태로)', /undo:\s*function\s*\(\)\s*\{\s*window\.tpSetTeacherStatus\(id,\s*prev,\s*true\)/.test(core));
ok('D10c 수정 창: «활동중 → 퇴사·비활동» 으로 바뀐 경우에만 연다(이미 퇴사인 강사의 다른 칸 저장은 안 연다)',
  /editId && _tpPrevRow && _tpIsWorking\(_tpPrevStatus\) && !_tpIsWorking\(body\.status\)/.test(core) && /const _tpPrevRow = editId \? \(window\._tpRowById/.test(core)
  && core.indexOf('const _tpPrevRow') < core.indexOf("'/api/admin/teacher-profiles/' + editId"));
const xf = strip(rd('public/js/adm-teacher-transfer.js'));
ok('D11 창이 같은 경로(POST teacher-profiles/:id)로 transfer_preview·transfer_apply 를 보낸다', /\/api\/admin\/teacher-profiles\//.test(xf) && /action:\s*'transfer_preview'/.test(xf) && /action:\s*'transfer_apply'/.test(xf));
ok('D12 창은 «성공이라고 말했는가» 로 판정한다(d.ok === true)', /d\.ok === true/.test(xf));
ok('D13 창은 넘기기 요청에 expected(move_version)를 싣는다 — 낡은 화면 거절', /expected\[r\.id\]\s*=\s*r\.move_version/.test(xf) && /expected:\s*expected/.test(xf));
ok('D14 짝: 창에 data-ko/data-en 을 달지 않는다(i18n 이 textContent 를 갈아끼운다)', !/data-ko=|data-en=/.test(xf));
ok('D14c 창이 «묶음 허용» 목록(allow_group_ids)을 싣고, 열 때 가려지는 토스트를 걷고 ↩ 되돌리기를 준다',
  /allow_group_ids:\s*allowGroup/.test(xf) && /if \(r\.verdict === 'group'\) allowGroup\.push\(r\.id\)/.test(xf)
  && /getElementById\('tp-st-toast'\)/.test(xf) && /t\.id === 'tpx-undo'/.test(xf));
ok('D14b «묶음 주의» 줄은 사람이 고른 것만 넘긴다(기본 제외)', /r\.verdict === 'group'\) return !!\(S\.groupOn && S\.groupOn\[r\.id\]\)/.test(xf));
const html = rd('public/admin.html');
ok('D15 admin.html 이 adm-teacher-transfer.js 를 싣는다', /<script src="\/js\/adm-teacher-transfer\.js\?v=\d+" defer><\/script>/.test(html));
const xfer = strip(rd('src/teacher-class-transfer.ts'));
ok('D16 정본은 새 UPDATE 를 만들지 않고 이동 엔진(moveSchedulesAtomically)으로만 옮긴다', /moveSchedulesAtomically\(env,\s*actor,/.test(xfer) && !/UPDATE\s+class_schedules/i.test(xfer));
ok('D17 정본은 본사 게이트(teacherMoveDenyReason)를 지난다', /teacherMoveDenyReason\(/.test(xfer));
ok('D18 미리보기와 넘기기가 «같은 함수»(groupMembersFor)로 묶음을 판정한다', (xfer.match(/groupMembersFor\(/g) || []).length >= 3);

const tmp = mkdtempSync(join(tmpdir(), 'teacher-class-transfer-'));
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', pathToFileURL(join(tmp, 'reg.mjs')).href, SELF], {
    encoding: 'utf8', env: { ...process.env, TCT_CHILD: '1' }, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
  });
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0 || child.status !== 0) {
    fail++; console.log('FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout);
  } else {
    for (const res of JSON.parse(child.stdout.slice(marker + '@@RESULTS@@'.length).trim())) {
      if (res.pass) { pass++; console.log('PASS ' + res.name); }
      else { fail++; console.log('FAIL ' + res.name + ' — ' + res.detail); }
    }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nTeacher class transfer: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
