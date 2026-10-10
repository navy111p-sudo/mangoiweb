/**
 * 강사 스케줄 캘린더(js/adm-q6.js «ph54») 드래그 이동 — 연기·변경 (2026-10-10)
 *
 * [왜] 드롭이 PATCH /class-schedules/:id 에 «요일» 만 보냈다. 활성 수업 대부분은 날짜 지정
 *      (one_off·dated) 행이라 «날짜는 그대로» 인데 서버는 ok, 화면은 「✅ 저장됨」 — 새로고침하면
 *      원래 날짜로 돌아갔다. 실패해도 「화면만 이동」 으로 남겼고, 그룹은 한 학생만 옮겼고,
 *      30분 칸 스냅이라 14:20 수업이 14:00/14:30 이 됐고, LMS 점유칸도 끌렸다.
 *
 * [무엇을 재나] 화면의 순수 함수(ph54Movable·ph54DropMinute·ph54MoveGroupIds·ph54BuildMovePlan·
 *      ph54MoveResult)를 **소스에서 오려 내** 돌리고, 그 결과 요청을 **실제 서버 모듈**
 *      (src/class-schedule-move.ts — weekly-schedule 도 쓰는 원자적 이동)에 **진짜 SQLite** 로
 *      넣는다. 무작위 시나리오 수백 회(시드 고정) × «성공하면 DB 가 정확히 그 자리 · 실패하면
 *      한 글자도 안 바뀜 · 되돌리기는 원래대로» 를 확인한다. 드롭 핸들러와 저장 함수도 오려 내
 *      가짜 DOM 으로 실행해 «저장 전에 화면을 안 옮긴다·확인을 누르기 전엔 안 보낸다» 를 본다.
 * ⛔ 운영 HTTP·운영 DB 는 안 씀(외부 fetch 차단).
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'cloudflare-deploy/src');
const Q6 = process.env.PH54_SRC || join(ROOT, 'cloudflare-deploy/public/js/adm-q6.js');
const SELF = fileURLToPath(import.meta.url);
const TRIALS = Number(process.env.PH54_TRIALS || 600);

/* 중괄호 짝으로 함수 하나를 오려 낸다(문자열 안 중괄호는 이 함수들에 없다 — 전제 검사로 확인). */
function cutFn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', src.indexOf(')', at));
  const start = src.slice(Math.max(0, at - 6), at) === 'async ' ? at - 6 : at;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
function cutCall(src, anchor) {   // track.addEventListener('drop', function(ev){ ... }) 의 함수 본문
  const at = src.indexOf(anchor);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return null;
}

if (process.env.PH54_CHILD === '1') {
  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: pass ? '' : JSON.stringify(detail)?.slice(0, 600) });
  const RealDate = Date;
  const NOW = RealDate.parse('2026-10-05T09:00:00+09:00');   // 월요일 — 이번 주 10/5~10/11
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
    async run() { const r = sq.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) }, results: [] }; },
  });
  const DB = {
    prepare: sql => statement(sql),
    async exec(sql) { sq.exec(sql); return { count: 1 }; },
    async batch(statements) {
      const out = [];
      sq.exec('BEGIN IMMEDIATE');
      try { for (const s of statements) out.push(await s.run()); sq.exec('COMMIT'); }
      catch (e) { sq.exec('ROLLBACK'); throw e; }
      return out;
    },
  };
  const env = { DB };
  const actor = { ok: true, username: 'admin', name: '관리자', isTeacher: false };
  const imp = f => import(pathToFileURL(join(SRC, f)).href);
  const { moveSchedulesAtomically: move, scheduleMoveVersion: version } = await imp('class-schedule-move.ts');
  const { ensureClassAuditTable } = await imp('class-audit.ts');
  const adminSrc = readFileSync(join(SRC, 'api-admin.ts'), 'utf8');
  const lessonSrc = readFileSync(join(SRC, 'api-lessons.ts'), 'utf8');
  const scopeSrc = readFileSync(join(SRC, 'scope.ts'), 'utf8');
  const ddl = (src, table, needs = '') => {
    for (const m of src.matchAll(new RegExp('`(CREATE TABLE IF NOT EXISTS ' + table + '\\s*\\([\\s\\S]*?\\);?)`', 'g')))
      if (m[1].includes(needs)) return m[1];
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
  await ensureClassAuditTable(env);
  const exec = (sql, ...a) => sq.prepare(sql).run(...a);
  const insert = (table, data) => {
    const k = Object.keys(data);
    return Number(exec(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`, ...Object.values(data)).lastInsertRowid);
  };
  for (const [id, name] of [[1, 'ALPHA'], [2, 'BETA'], [3, 'GAMMA'], [4, 'DELTA']])
    insert('teachers', { id, name, active: 1, created_at: NOW, updated_at: NOW });
  insert('admin_scope', { username: 'admin', scope_type: 'hq', updated_at: NOW });

  /* ── 화면 쪽 순수 함수 — 소스에서 오려 낸다(⛔ 하니스에 베끼지 않는다) ── */
  const q6 = readFileSync(process.env.PH54_SRC_IN, 'utf8');
  const consts = q6.match(/var PH54_START_H = \d+, PH54_END_H = \d+, PH54_HOUR_PX = \d+, PH54_SNAP = \d+;/);
  const snapDecl = q6.match(/var PH54_MOVE_SNAP = \d+;/);
  const names = ['ph54Pad', 'ph54FmtMin', 'ph54MinOf', 'ph54Movable', 'ph54DropMinute', 'ph54MoveGroupIds', 'ph54BuildMovePlan', 'ph54MoveResult'];
  const cuts = names.map(n => [n, cutFn(q6, n)]);
  check('전제: 상수·함수를 소스에서 오려 냈다', consts && snapDecl && cuts.every(([, c]) => c), cuts.filter(([, c]) => !c).map(([n]) => n));
  let ui = {};
  try {
    ui = new Function(consts[0] + snapDecl[0] + cuts.map(([, c]) => c).join('\n') + '\nreturn {' + names.join(',') + ', START:PH54_START_H, END:PH54_END_H, SNAP:PH54_MOVE_SNAP};')();
  } catch (e) { check('전제: 오려 낸 함수가 실행된다', false, String(e)); }
  const okFns = names.every(n => typeof ui[n] === 'function');
  check('전제: 오려 낸 함수가 실행된다', okFns, Object.keys(ui));

  /* /api/admin/schedules 가 주는 move_field 식도 서버 소스에서 오려 평가한다(⛔ 베끼지 않음). */
  const mfm = adminSrc.match(/move_field: (\(\(String\(r\.schedule_kind \|\| 'recurring'\) === 'one_off'\) \|\| r\.scheduled_date\)\s*\? 'scheduled_date' : 'day_of_week')/);
  check('전제: 서버 move_field 판정식을 오려 냈다', !!mfm);
  const moveField = mfm ? new Function('r', 'return ' + mfm[1] + ';') : () => '';

  const WEEK = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowOf = ymd => DOW[new RealDate(ymd + 'T00:00:00Z').getUTCDay()];
  /* 서버 /api/admin/schedules 의 카드 모양(이번 주에 펼친 것) — 화면이 받는 그대로. */
  const cards = () => {
    const rows = sq.prepare(`SELECT * FROM class_schedules WHERE (status IS NULL OR status='active')`).all().map(r => ({ ...r }));
    const out = [];
    for (const r of rows) {
      const uid = String(r.user_id || '').toLowerCase();
      const base = { id: r.id, move_version: version(r), teacher_id: Number(r.teacher_id), start_time: r.start_time,
        duration_min: r.duration_min || 20, origin: uid === 'lms' ? 'lms' : uid === 'type_seed' ? 'sample' : 'class',
        students: [{ name: r.student_name }], move_field: moveField(r) };
      if (String(r.schedule_kind || 'recurring') === 'one_off' || r.scheduled_date) {
        if (WEEK.includes(r.scheduled_date)) out.push({ ...base, date: r.scheduled_date });
      } else for (const d of WEEK) if (dowOf(d) === r.day_of_week) out.push({ ...base, date: d });
    }
    return out;
  };
  const snapshot = () => JSON.stringify(sq.prepare('SELECT * FROM class_schedules ORDER BY id').all());
  const row = id => ({ ...sq.prepare('SELECT * FROM class_schedules WHERE id=?').get(id) });
  const reset = () => sq.exec('DELETE FROM class_schedules; DELETE FROM class_audit_log; DELETE FROM teacher_unavailability; DELETE FROM calendar_events;');

  /* 시드 고정 난수 — 실패를 다시 재현할 수 있게. */
  let seed = Number(process.env.PH54_SEED || 20261010);
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

  if (okFns) {
    /* ① 드롭 위치 → 시각: 수천 개 무작위 점에서 불변식 */
    let bad = [];
    const total = (ui.END - ui.START) * 60;
    for (let i = 0; i < 4000; i++) {
      const dur = pick([20, 30, 40, 50, 60, 90]);
      const ratio = rnd() * 1.2 - 0.1, off = rnd() * dur;
      const m = ui.ph54DropMinute(ratio, off, dur);
      if (m % ui.SNAP !== 0 || m < ui.START * 60 || m + dur > ui.END * 60) bad.push({ ratio, off, dur, m });
    }
    check('① 무작위 4,000점 — 시각은 언제나 10분 칸 · 06:00 이후 · 24:00 전에 끝난다', !bad.length, bad.slice(0, 5));
    bad = [];
    for (let st = ui.START * 60; st <= 23 * 60; st += 10) {
      for (const dur of [20, 30, 40]) {
        if (st + dur > ui.END * 60) continue;
        for (const offFrac of [0, 0.25, 0.5, 0.99]) {   // 카드 «어디를» 잡았든 제자리에 놓으면 그 시각
          const off = dur * offFrac;
          const ratio = (st - ui.START * 60 + off) / total;
          if (ui.ph54DropMinute(ratio, off, dur) !== st) bad.push({ st, dur, offFrac });
        }
      }
    }
    check('① 카드의 어디를 잡든 제자리에 놓으면 «같은 시각»(14:20 → 14:20, 30분 칸 스냅 안 함)', !bad.length, bad.slice(0, 5));
    check('① 이상한 입력(NaN·음수)도 범위 안으로', [NaN, -1, Infinity].every(x => { const m = ui.ph54DropMinute(x, x, x); return m >= ui.START * 60 && m % 10 === 0; }));

    /* ② 옮길 수 있는가 — 짝으로 */
    check('② 진짜 수업은 끌린다', ui.ph54Movable({ id: 5, origin: 'class' }) === true);
    check('② 차단·LMS·시드·id 없음은 안 끌린다',
      [{ id: 1, source: 'unavailability' }, { id: 1, type: 'blocked' }, { id: 1, origin: 'lms' }, { id: 1, origin: 'sample' }, { origin: 'class' }, null]
        .every(x => ui.ph54Movable(x) === false));

    /* ③ 옛 경로의 결함을 실제로 재현(대조) — 요일만 보내면 날짜 지정 수업은 날짜가 안 바뀐다 */
    reset();
    const d0 = insert('class_schedules', { user_id: 'kid', student_name: 'Kid', schedule_kind: 'dated', class_type: 'regular',
      scheduled_date: '2026-10-07', start_time: '14:20', duration_min: 20, teacher_id: '1', status: 'active', source: 'adm-enroll:1', created_at: NOW });
    const old = await move(env, actor, { ids: [d0], patch: { day_of_week: 'Fri', start_time: '14:20' } });
    check('③ 대조: 옛 방식(요일만)은 «성공» 이라 답하면서 날짜는 그대로다 — 고치기 전 사고 재현',
      old.ok === true && row(d0).scheduled_date === '2026-10-07', { old, row: row(d0) });

    /* ④ 무작위 시나리오 — 화면 계산 → 실제 서버 모듈 → DB 가 정확히 그 자리인가 · 되돌리기 */
    let ran = 0, moved = 0, refused = 0, undone = 0, same = 0, undoRefused = 0, occupied = 0;
    const errorsSeen = {};
    const fails = [];
    const KNOWN = new Set(['teacher_busy', 'student_busy', 'teacher_unavailable', 'conflict', 'schedule_conflict', 'class_conflict',
      'group_changed', 'schedule_changed', 'teacher_vacation', 'student_conflict', 'teacher_conflict']);
    for (let t = 0; t < TRIALS; t++) {
      reset();
      // 시간표 하나를 무작위로 깐다 — 날짜 지정·하루짜리·매주 반복·그룹·카페24 미러·LMS 점유·휴가
      const n = 2 + Math.floor(rnd() * 7);
      for (let k = 0; k < n; k++) {
        const kind = pick(['dated', 'one_off', 'recurring', 'recurring', 'dated']);
        const date = pick(WEEK.slice(0, 6));
        const st = 6 * 60 + 10 * Math.floor(rnd() * 100);
        const tid = String(1 + Math.floor(rnd() * 3));
        const groupSize = rnd() < 0.2 ? 2 + Math.floor(rnd() * 3) : 1;
        const src = pick(['adm-enroll:7', 'c24-mirror', 'harness', 'c24-mirror:manual']);
        const uidBase = rnd() < 0.08 ? 'lms' : 's' + k;
        for (let g = 0; g < groupSize; g++) {
          insert('class_schedules', { user_id: uidBase === 'lms' ? 'lms' : uidBase + '_' + g, student_name: uidBase + '_' + g,
            schedule_kind: kind, class_type: groupSize > 1 ? 'group' : 'regular',
            scheduled_date: kind === 'recurring' ? null : date, day_of_week: kind === 'recurring' ? dowOf(date) : null,
            start_time: hhmm(st), duration_min: pick([20, 20, 30, 40]), teacher_id: tid, status: 'active', source: src, created_at: NOW });
          if (uidBase === 'lms') break;
        }
      }
      if (rnd() < 0.15) insert('calendar_events', { event_type: 'vacation', title: 'Leave', teacher_name: pick(['ALPHA', 'BETA']), date: pick(WEEK), created_at: NOW });
      if (rnd() < 0.15) insert('teacher_unavailability', { teacher_id: pick(['1', '2']), kind: 'weekly', day_of_week: Math.floor(rnd() * 7), start_time: '12:00', end_time: '15:00', created_at: NOW });

      const recs = cards();
      if (!recs.length) continue;
      const rec = pick(recs);
      const total = (ui.END - ui.START) * 60;
      const dur = rec.duration_min || 20;
      const off = rnd() * dur;
      const targetDay = rnd() < 0.35 ? WEEK.indexOf(rec.date) : Math.floor(rnd() * 7);
      const ratio = rnd() < 0.15 ? (ui.ph54MinOf(rec) - ui.START * 60 + off) / total : rnd();
      const newMin = ui.ph54DropMinute(ratio, off, dur);
      const newDate = WEEK[targetDay];
      const plan = ui.ph54BuildMovePlan(rec, recs, newDate, newMin);
      ran++;
      if (!ui.ph54Movable(rec)) {
        if (plan.ok || plan.reason !== 'not_movable') fails.push({ t, why: 'LMS 카드가 계획을 만들었다', plan });
        continue;
      }
      if (!plan.ok) {
        if (plan.reason === 'occupied') {
          // «이미 수업이 있는 정확한 자리» — 같은 강사·날짜·분에 옮길 수 있는 «남의» 수업이 실제로 있어야 맞는 거절
          const grp = new Set(recs.filter(r => ui.ph54Movable(r) && String(r.teacher_id) === String(rec.teacher_id) && r.date === rec.date && ui.ph54MinOf(r) === ui.ph54MinOf(rec)).map(r => String(r.id)));
          const real = recs.some(r => ui.ph54Movable(r) && !grp.has(String(r.id)) && String(r.teacher_id) === String(rec.teacher_id) && r.date === newDate && ui.ph54MinOf(r) === newMin);
          if (!real) fails.push({ t, why: '빈 자리인데 «이미 수업 있음» 으로 거절', plan, newDate, newMin });
          else occupied++;
          continue;
        }
        if (plan.reason !== 'same' || newDate !== rec.date || newMin !== ui.ph54MinOf(rec)) fails.push({ t, why: '정상 카드인데 계획 거절', plan, rec });
        else same++;
        continue;
      }
      // 짝: 계획이 나왔다면 그 정확한 자리에 같은 강사의 «남의» 수업이 없어야 한다
      if (recs.some(r => ui.ph54Movable(r) && !plan.ids.includes(String(r.id)) && String(r.teacher_id) === String(rec.teacher_id) && r.date === newDate && ui.ph54MinOf(r) === newMin))
        fails.push({ t, why: '이미 수업이 있는 정확한 자리로 보내려 한다(되돌리기가 «구성원 변경» 으로 막힌다)', plan });
      // 계획 자체: 묶음 = 같은 강사·날짜·분의 «옮길 수 있는» 카드 전부
      const want = recs.filter(r => ui.ph54Movable(r) && String(r.teacher_id) === String(rec.teacher_id) && r.date === rec.date && ui.ph54MinOf(r) === ui.ph54MinOf(rec)).map(r => String(r.id));
      if (JSON.stringify([...new Set(want)].sort()) !== JSON.stringify([...plan.ids].sort())) fails.push({ t, why: '그룹 묶음이 다르다', want, ids: plan.ids });
      if (plan.body.start_time !== hhmm(newMin)) fails.push({ t, why: '시각이 다르다', plan });

      const before = snapshot();
      const origin = Object.fromEntries(plan.ids.map(id => [id, row(Number(id))]));
      const res = await move(env, actor, plan.body);
      const verdict = ui.ph54MoveResult(res.ok === true, res);
      if (!res.ok) {
        refused++;
        errorsSeen[res.error] = (errorsSeen[res.error] || 0) + 1;
        if (snapshot() !== before) fails.push({ t, why: '거절됐는데 DB 가 바뀌었다', res });
        if (verdict.ok || !verdict.msg) fails.push({ t, why: '화면 판정이 실패를 실패로 안 읽는다', verdict, res });
        if (!KNOWN.has(res.error) && !/busy|conflict|unavail|vacation|changed/.test(String(res.error))) fails.push({ t, why: '모르는 거절 사유', res });
        continue;
      }
      moved++;
      if (!verdict.ok || !verdict.versions) fails.push({ t, why: '성공을 성공으로 못 읽는다', res });
      for (const id of plan.ids) {
        const a = row(Number(id)), o = origin[id];
        const dated = !!o.scheduled_date || o.schedule_kind === 'one_off';
        if (dated && a.scheduled_date !== newDate) fails.push({ t, why: '날짜 지정 수업의 날짜가 안 바뀜', id, a, newDate });
        if (!dated && (a.day_of_week !== dowOf(newDate) || a.scheduled_date)) fails.push({ t, why: '매주 반복 수업에 날짜가 박혔거나 요일이 틀림', id, a, newDate });
        if (a.start_time !== hhmm(newMin)) fails.push({ t, why: '시각이 틀림', id, a });
        if (String(a.teacher_id) !== String(o.teacher_id)) fails.push({ t, why: '강사가 바뀌었다', id });
        if (a.duration_min !== o.duration_min) fails.push({ t, why: '길이가 바뀌었다', id });
        if (o.source === 'c24-mirror' && a.source !== 'c24-mirror:manual') fails.push({ t, why: '카페24 미러 도장이 안 찍혔다', id, a });
      }
      // 다른 행은 그대로
      const others = JSON.parse(before).filter(r => !plan.ids.includes(String(r.id)));
      const nowOthers = JSON.parse(snapshot()).filter(r => !plan.ids.includes(String(r.id)));
      if (JSON.stringify(others) !== JSON.stringify(nowOthers)) fails.push({ t, why: '다른 수업이 바뀌었다' });
      // 화면이 다시 읽으면 그 자리에 나온다(카드가 새 날짜·시각에 보이는가)
      const after = cards();
      for (const id of plan.ids) {
        if (!after.some(c => String(c.id) === id && c.date === newDate && ui.ph54MinOf(c) === newMin)) fails.push({ t, why: '다시 읽은 화면에 새 자리가 없다', id });
      }
      // ↩ 되돌리기 — 저장 함수가 만드는 그 모양 그대로
      const back = { ids: plan.ids, destination_date: rec.date, start_time: hhmm(ui.ph54MinOf(rec)), source_date: newDate, expected: verdict.versions };
      const ur = await move(env, actor, back);
      if (!ur.ok) {
        /* 되돌리기가 거절돼도 되는 경우는 하나뿐 — 원래 자리가 «이미» 다른 수업과 겹쳐 있던 이중배정이라
           서버가 그 겹침을 다시 만들기를 거부할 때(겹친 상대가 이번 이동과 무관하게 원래부터 있던 행).
           그 밖의 거절은 결함이다. 거절돼도 DB 는 «옮긴 뒤» 상태 그대로여야 한다(반쪽 되돌림 금지). */
        const beforeRows = JSON.parse(before);
        const clash = [].concat(ur.conflicts || [], ur.teacher_conflicts || []).map(r => String(r.id)).filter(id => !plan.ids.includes(id));
        const preExisting = clash.length && clash.every(id => {
          const b = beforeRows.find(r => String(r.id) === id), a = row(Number(id));
          return b && JSON.stringify(b) === JSON.stringify(a);
        });
        if (!(ur.error === 'conflict' && preExisting)) fails.push({ t, why: '되돌리기가 거절됐다', ur: { error: ur.error, message: ur.message }, back });
        else undoRefused++;
        for (const id of plan.ids) if (row(Number(id)).start_time !== hhmm(newMin)) fails.push({ t, why: '거절된 되돌리기가 반쪽만 바꿨다', id });
      } else {
        undone++;
        for (const id of plan.ids) {
          const a = row(Number(id)), o = origin[id];
          const keep = ['teacher_id', 'scheduled_date', 'day_of_week', 'start_time', 'duration_min', 'user_id', 'status'];
          if (keep.some(k => String(a[k] ?? '') !== String(o[k] ?? ''))) fails.push({ t, why: '되돌린 뒤 원래와 다르다', id, a, o });
        }
      }
    }
    check(`④ 무작위 ${ran}회 — 실패 0건 (옮김 ${moved} · 서버가 겹침 등으로 거절 ${refused} · 제자리 ${same} · 되돌림 ${undone} · 원래 이중배정이라 되돌리기 거절 ${undoRefused})`,
      fails.length === 0, fails.slice(0, 4));
    check('④ 시나리오가 실제로 «옮김» 과 «거절» 을 둘 다 만들었다(헛돌지 않음)', moved > TRIALS * 0.2 && refused > 0 && undone + undoRefused === moved && undone > moved * 0.9, { moved, refused, undone, undoRefused, errorsSeen });
    console.error('[ph54] 거절 사유 분포', JSON.stringify(errorsSeen), '이미 수업 있음(화면이 막음)', occupied);

    /* ④-b 결정적 대조 — 같은 강사의 다른 수업 «정확히 그 자리» 로 놓기 (브라우저 300회 왕복에서 찾은 결함)
       서버는 «같은 시각·같은 길이» 를 그룹 합류로 받아 «성공» 하지만, 그 뒤 ↩ 되돌리기가 «구성원 변경» 으로 막힌다.
       그래서 화면이 그 드롭을 미리 막는다(주간 전체 스케줄과 같은 규칙). */
    reset();
    const a1 = insert('class_schedules', { user_id: 'kidA', student_name: 'A', schedule_kind: 'dated', class_type: 'regular',
      scheduled_date: WEEK[2], start_time: '14:20', duration_min: 20, teacher_id: '1', status: 'active', source: 'adm-enroll:1', created_at: NOW });
    insert('class_schedules', { user_id: 'kidB', student_name: 'B', schedule_kind: 'dated', class_type: 'regular',
      scheduled_date: WEEK[4], start_time: '15:00', duration_min: 20, teacher_id: '1', status: 'active', source: 'adm-enroll:2', created_at: NOW });
    const recsB = cards(), recA = recsB.find(c => String(c.id) === String(a1));
    const pB = ui.ph54BuildMovePlan(recA, recsB, WEEK[4], 15 * 60);
    const pB2 = ui.ph54BuildMovePlan(recA, recsB, WEEK[4], 15 * 60 + 30);
    check('④-b 같은 강사의 다른 수업이 «정확히» 있는 자리는 화면이 막고(occupied), 바로 옆 빈자리는 허용한다(짝)',
      pB.ok === false && pB.reason === 'occupied' && pB2.ok === true, { pB, pB2 });
    const joinRes = await move(env, actor, { ids: [String(a1)], destination_date: WEEK[4], start_time: '15:00', source_date: WEEK[2], expected: { [a1]: recA.move_version } });
    const undoRes = joinRes.ok ? await move(env, actor, { ids: [String(a1)], destination_date: WEEK[2], start_time: '14:20', source_date: WEEK[4], expected: joinRes.move_versions }) : null;
    check('④-b 대조: 막지 않으면 서버는 «합류» 로 받고 ↩ 되돌리기가 거절된다 — 막는 이유의 재현',
      joinRes.ok === true && undoRes && undoRes.ok === false, { joinRes, undoRes });
  }

  /* ⑤ 드롭 핸들러를 오려 내 가짜 DOM 으로 — «확인 전엔 안 보낸다·저장 전엔 화면을 안 옮긴다» */
  const dropBody = cutCall(q6, "track.addEventListener('drop', function(ev)");
  check('전제: 드롭 핸들러를 오려 냈다', !!dropBody && dropBody.includes('ph54BuildMovePlan'));
  if (dropBody && okFns) {
    const mk = (opts) => {
      const log = { saves: [], renders: 0, toasts: [], confirms: 0 };
      const recs = opts.recs;
      const col = { dataset: { day: String(opts.day), ...(opts.teacher ? { teacher: String(opts.teacher) } : {}) }, classList: { contains: c => c === (opts.fold ? 'ph54-cal-fold' : 'ph54-cal-col'), remove() {}, add() {} },
        getBoundingClientRect: () => ({ top: 100, height: 900 }) };
      const ev = { target: { closest: () => col }, clientY: opts.clientY, preventDefault() {} };
      const track = { querySelectorAll: () => [] };
      const days = WEEK.map(d => new RealDate(d + 'T00:00:00'));
      const ph54State = { _drag: { idx: 0, offsetMin: opts.off || 0 }, records: recs };
      const win = { confirm: (m) => { log.confirms++; log.ask = String(m); return opts.yes; } };
      const fn = new Function('PH54_DROP_SEL', 'ev', 'track', 'days', 'ph54State', 'window', 'ph54Render', 'ph54Toast', 'ph54SaveMove', 'ph54T', 'ph54DowLabel', 'ph54TodayKst', 'ph54FmtDate',
        'PH54_START_H', 'PH54_END_H', ...names,
        dropBody);
      try {
        fn('.ph54-cal-col, .ph54-cal-fold', ev, track, days, ph54State, win, () => log.renders++, m => log.toasts.push(m), (...a) => log.saves.push(a), (k) => k, () => '월', () => '2026-10-05',
          d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
          ui.START, ui.END, ...names.map(n => ui[n]));
      } catch (e) { log.err = String(e); }
      return log;
    };
    const rec = { id: 9, origin: 'class', teacher_id: 1, date: '2026-10-07', start_time: '14:20', duration_min: 20, move_version: 'v9', move_field: 'scheduled_date', students: [{ name: 'Kid' }] };
    const yOf = (min) => 100 + (min - 360) / ((24 - 6) * 60) * 900;
    let L = mk({ recs: [rec], day: 4, clientY: yOf(16 * 60 + 40), yes: false });
    check('⑤ 확인에서 «취소» 하면 저장도 다시 그리기도 안 한다', !L.err && L.confirms === 1 && L.saves.length === 0 && L.renders === 0, L);
    L = mk({ recs: [rec], day: 4, clientY: yOf(16 * 60 + 40), yes: true });
    const s = L.saves[0];
    check('⑤ «예» 면 저장 함수 한 곳으로 보내고, 저장 전에 화면을 다시 그리지 않는다', !L.err && L.saves.length === 1 && L.renders === 0, L);
    check('⑤ 보내는 요청 = 서버 원자 이동 모양(destination_date·start_time·source_date·expected)',
      s && s[0].body.destination_date === '2026-10-09' && s[0].body.start_time === '16:40' && s[0].body.source_date === '2026-10-07' && s[0].body.expected['9'] === 'v9', s && s[0]);
    L = mk({ recs: [rec], day: 2, clientY: yOf(14 * 60 + 20), yes: true });
    check('⑤ 제자리에 놓으면 아무것도 안 묻고 안 보낸다', !L.err && L.confirms === 0 && L.saves.length === 0, L);
    L = mk({ recs: [{ ...rec, move_version: undefined }], day: 4, clientY: yOf(15 * 60), yes: true });
    check('⑤ 버전이 없으면(옛 화면) 보내지 않고 «새로고침» 을 말한다', !L.err && L.saves.length === 0 && L.toasts.some(m => /새로고침|reload/i.test(m)), L);
    L = mk({ recs: [{ ...rec, origin: 'lms' }], day: 4, clientY: yOf(15 * 60), yes: true });
    check('⑤ LMS 점유칸은 놓아도 안 보낸다', !L.err && L.saves.length === 0, L);
    L = mk({ recs: [rec], day: 5, clientY: 0, fold: true, yes: true });
    check('⑤ 접힌 요일 띠에 놓으면 «같은 시각» 으로', !L.err && L.saves[0] && L.saves[0][0].body.start_time === '14:20' && L.saves[0][0].body.destination_date === '2026-10-10', L.saves[0]);
    // 확인 창 문구 — 짝으로(«말한다» 옆에 «안 말한다»)
    const recW = { ...rec, move_field: 'day_of_week' };
    L = mk({ recs: [recW], day: 4, clientY: yOf(16 * 60), yes: false });
    const Ld = mk({ recs: [rec], day: 4, clientY: yOf(16 * 60), yes: false });
    check('⑤ 매주 반복이면 «매주 바뀝니다» 를 말하고, 날짜 지정이면 말하지 않는다', /매주/.test(L.ask || '') && !/매주/.test(Ld.ask || ''), { w: L.ask, d: Ld.ask });
    L = mk({ recs: [rec], day: 4, teacher: 2, clientY: yOf(16 * 60), yes: false });
    const Ls = mk({ recs: [rec], day: 4, teacher: 1, clientY: yOf(16 * 60), yes: false });
    check('⑤ 다른 강사 열에 놓으면 «강사는 그대로» 를 말하고, 같은 강사 열이면 말하지 않는다', /강사는 그대로/.test(L.ask || '') && !/강사는 그대로/.test(Ls.ask || ''), { o: L.ask, s: Ls.ask });
    const g2 = [{ ...rec, type: 'group' }, { ...rec, id: 10, type: 'group', move_version: 'v10' }];
    const d2 = [{ ...rec, type: '1on1' }, { ...rec, id: 10, type: '1on1', move_version: 'v10' }];
    L = mk({ recs: g2, day: 4, clientY: yOf(16 * 60), yes: false });
    const Lx = mk({ recs: d2, day: 4, clientY: yOf(16 * 60), yes: false });
    check('⑤ 그룹이면 «그룹 수업», 1:1 이 겹친 것이면 «겹친 수업» 이라 말한다(둘 다 함께 옮김)', /그룹 수업/.test(L.ask || '') && !/그룹 수업/.test(Lx.ask || '') && /겹친 수업 2건/.test(Lx.ask || ''), { g: L.ask, x: Lx.ask });

    /* ⑤-b 드래그 시작 — 옮길 수 없는 칸·저장 중에는 끌기 자체를 막는다(짝: 옮길 수 있으면 허용) */
    const dsBody = cutCall(q6, "track.addEventListener('dragstart', function(ev)");
    check('전제: 드래그 시작 핸들러를 오려 냈다', !!dsBody && dsBody.includes('ph54Movable'));
    if (dsBody) {
      const ds = (r0, saving) => {
        const log = { prevented: false, toasts: [] };
        const card = { dataset: { idx: '0' }, closest: (q) => q === '.ph54-ev' ? card : null, getBoundingClientRect: () => ({ top: 0 }), classList: { add() {} } };
        const ev = { target: { closest: () => card }, clientY: 0, preventDefault() { log.prevented = true; }, dataTransfer: { setData() {} } };
        const st = { records: [r0], _saving: saving };
        try { new Function('ev', 'ph54State', 'ph54Movable', 'ph54Toast', 'ph54T', 'PH54_START_H', 'PH54_END_H', dsBody)(ev, st, ui.ph54Movable, m => log.toasts.push(m), k => k, ui.START, ui.END); }
        catch (e) { log.err = String(e); }
        log.drag = st._drag; return log;
      };
      const a1 = ds(rec, false), a2 = ds({ ...rec, origin: 'lms' }, false), a3 = ds(rec, true);
      check('⑤-b 옮길 수 있는 수업은 끌기 시작(기록이 남는다)', !a1.err && !a1.prevented && a1.drag && a1.drag.idx === 0, a1);
      check('⑤-b LMS 점유칸은 끌기 자체를 막는다', !a2.err && a2.prevented && !a2.drag, a2);
      check('⑤-b 앞 이동을 저장하는 중에는 끌기를 막고 사유를 말한다', !a3.err && a3.prevented && !a3.drag && a3.toasts.some(m => /저장/.test(m)), a3);
    }
  }

  /* ⑥ 저장 함수 — 성공·실패 모두 서버에서 다시 읽고, 실패면 «옮기지 않음» 이라 말하고 되돌리기를 안 낸다 */
  const saveSrc = cutFn(q6, 'ph54SaveMove');
  check('전제: 저장 함수를 오려 냈다', !!saveSrc && saveSrc.includes("'/api/admin/class-schedules/move'"));
  if (saveSrc && okFns) {
    const run = async (resp, o) => { try { return await run0(resp, o || {}); } catch (e) { return { err: String(e), order: [], toasts: [] }; } };
    const run0 = async (resp, o) => {
      const log = { order: [], undo: null, toasts: [] };
      const st = o.saving ? { _saving: true } : {};
      const fetchFn = async (u, o) => { log.order.push('fetch:' + u + ':' + o.method); if (resp === 'throw') throw new Error('net'); return { ok: resp.http, status: resp.status || 200, json: async () => resp.body }; };
      const f = new Function('fetch', 'ph54State', 'ph54HideUndo', 'ph54Toast', 'ph54LoadRecords', 'ph54Render', 'ph54OfferUndo', 'ph54DowLabel', 'ph54T', 'ph54FmtMin', 'ph54MoveResult',
        saveSrc + '\nreturn ph54SaveMove;')(fetchFn, st, () => {}, m => log.toasts.push(m), async () => log.order.push('reload'), () => log.order.push('render'),
        (b) => { log.undo = b; }, () => '금', k => k, ui.ph54FmtMin, ui.ph54MoveResult);
      const plan = { ids: ['9'], body: { ids: ['9'], destination_date: '2026-10-09', start_time: '16:40', source_date: '2026-10-07', expected: { 9: 'v9' } } };
      log.ret = await f(plan, { date: '2026-10-07', min: 14 * 60 + 20 }, '2026-10-09', '16:40', 20, !!o.undo);   // 되돌리기도 from 을 넘겨 «isUndo» 판정만 따로 잰다
      log.saving = st._saving;
      return log;
    };
    let L = await run({ http: true, body: { ok: true, move_versions: { 9: 'v9b' } } });
    check('⑥ 성공: 저장 → 다시 읽기 → 그리기 순서, ✅ 와 되돌리기',
      L.ret === true && L.order.join('|') === 'fetch:/api/admin/class-schedules/move:PATCH|reload|render' && L.undo && L.undo.body.destination_date === '2026-10-07'
        && L.undo.body.start_time === '14:20' && L.undo.body.source_date === '2026-10-09' && L.undo.body.expected['9'] === 'v9b' && L.toasts.some(m => /✅/.test(m)) && !L.saving, L);
    L = await run({ http: false, status: 409, body: { ok: false, error: 'teacher_busy', message: '그 시간에 다른 수업' } });
    check('⑥ 거절: 다시 읽어 «옮기지 않음» 을 말하고 되돌리기를 안 낸다',
      L.ret === false && L.order.includes('reload') && !L.undo && L.toasts.some(m => /❌/.test(m) && /다른 수업/.test(m)) && !L.saving, L);
    L = await run({ http: false, status: 404, body: { error: 'Not Found' } });
    check('⑥ 404 본문(ok 칸 없음)도 성공으로 안 읽는다', L.ret === false && !L.undo, L);
    L = await run('throw');
    check('⑥ 네트워크 오류도 «옮기지 않음» + 잠금 풀림', L.ret === false && !L.undo && !L.saving && L.order.includes('reload'), L);
    L = await run({ http: true, body: { ok: true, move_versions: { 9: 'v9b' } } }, { saving: true });
    check('⑥ 저장 중에 또 부르면 보내지 않는다(겹친 저장 막기)', L.ret === false && !L.order.some(x => /^fetch/.test(x)), L);
    L = await run({ http: true, body: { ok: true, move_versions: { 9: 'v9c' } } }, { undo: true });
    check('⑥ «되돌리기» 저장이 성공하면 또 되돌리기를 내지 않는다(↩ 를 말한다)', L.ret === true && !L.undo && L.toasts.some(m => /되돌렸/.test(m)), L);
  }

  /* ⑥-b 되돌리기 막대 — 누르면 원래 자리로 «서버에» 보내고, 색은 페인터가 덮지 않는 밝은 값 */
  const undoSrc = cutFn(q6, 'ph54OfferUndo'), hideSrc = cutFn(q6, 'ph54HideUndo');
  check('전제: 되돌리기 함수를 오려 냈다', !!undoSrc && !!hideSrc);
  if (undoSrc && hideSrc) {
    const els = []; const saves = [];
    const mkEl = (tag) => { const e = { tag, style: {}, children: [], listeners: {}, set textContent(v) { this._t = v; }, get textContent() { return this._t; },
      appendChild(c) { this.children.push(c); }, addEventListener(t, f) { this.listeners[t] = f; }, remove() { this.removed = true; } }; els.push(e); return e; };
    const doc = { createElement: mkEl, getElementById: () => null, body: { appendChild() {} } };
    let err = null;
    try {
      new Function('document', 'ph54T', 'ph54SaveMove', 'setTimeout', 'clearTimeout', hideSrc + '\n' + undoSrc + '\nreturn ph54OfferUndo;')(doc, k => k, (...a) => saves.push(a), () => 0, () => {})
        ({ ids: ['9'], body: { ids: ['9'] } }, '2026-10-07', '14:20', 20);
    } catch (e) { err = String(e); }
    const btn = els.find(e => e.tag === 'button');
    check('⑥-b 되돌리기 버튼이 생긴다', !err && !!btn, err);
    if (btn && btn.listeners.click) btn.listeners.click();
    check('⑥-b 누르면 원래 자리로 «되돌리기 저장» 을 보낸다(isUndo=true)', saves.length === 1 && saves[0][2] === '2026-10-07' && saves[0][3] === '14:20' && saves[0][5] === true, saves);
    const lum = (hex) => { const m = /#([0-9a-f]{6})/i.exec(hex || ''); if (!m) return -1; const v = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const bg = (/background:\s*(#[0-9a-f]{6})/i.exec(btn ? btn.style.cssText : '') || [])[1];
    check('⑥-b 버튼 배경이 밝다(어두우면 밝기 페인터가 희게 덮어 흰 글자가 안 보인다)', lum(bg) >= 0.16, bg);
  }

  /* ⑦ 옛 경로가 되살아나지 않았는가 — 드롭 핸들러가 «요일만» PATCH /:id 를 보내지 않는다 */
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const live = strip(dropBody || '') + strip(saveSrc || '');
  check('⑦ 옛 «요일만» 저장 경로가 없다', !/class-schedules\/' \+ rec\.id/.test(live) && !/day_of_week: dowKeyByIdx/.test(live));
  check('⑦ 실패해도 «화면만 이동» 으로 남기는 낙관적 갱신이 없다', !/rec\.date = newDate/.test(live) && !/화면만 이동/.test(live));

  process.stdout.write('\n@@RESULTS@@' + JSON.stringify(results) + '\n');
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), 'ph54-drag-'));
let pass = 0, fail = 0;
try {
  writeFileSync(join(tmp, 'hooks.mjs'), `import { existsSync } from 'node:fs'; import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
 if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.(ts|js|mjs|json)$/.test(spec) && ctx.parentURL) {
  const u = new URL(spec + '.ts', ctx.parentURL); if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
 } return next(spec, ctx);
}`);
  writeFileSync(join(tmp, 'reg.mjs'), `import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);`);
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--import', join(tmp, 'reg.mjs'), SELF], {
    encoding: 'utf8', env: { ...process.env, PH54_CHILD: '1', PH54_SRC_IN: Q6 }, timeout: 300000, maxBuffer: 32 * 1024 * 1024,
  });
  if (child.stderr) process.stderr.write(child.stderr.split('\n').filter(l => /\[ph54\]/.test(l)).join('\n') + '\n');
  const marker = child.stdout?.lastIndexOf('@@RESULTS@@') ?? -1;
  if (marker < 0 || child.status !== 0) {
    fail++; console.log('❌ FAIL harness child crashed\n' + child.stderr + '\n' + child.stdout);
  } else {
    for (const r of JSON.parse(child.stdout.slice(marker + 11).trim())) {
      if (r.pass) { pass++; console.log('✅ PASS ' + r.name); }
      else { fail++; console.log('❌ FAIL ' + r.name + ' — ' + r.detail); }
    }
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`\nph54 drag move: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
