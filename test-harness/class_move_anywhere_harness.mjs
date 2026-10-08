#!/usr/bin/env node
/* 📅 «아무 날짜나» 연기·변경·취소 — 2026-10-08 매니저 요청
   (「오늘 수업」에서 다음 주로 넘기면 버튼이 없다 / 학생 목록·스케줄 캘린더에도 달아 달라)

   정본을 «실제로» 돌린다 — 수백 번:
     A. 요일 표기 판정 — 화면(class-move-modal.js pickDowList) == 서버(schedule-split.ts splitDowList), 무작위 3,000건
     B. 회차 펼치기(pickOccurrences) — 무작위 400 시나리오를 «독립 오라클» 과 대조
     C. 나누기 + focus_date(runScheduleSplit) — 진짜 SQLite 로 무작위 400 시나리오
        (범위 밖이면 «한 줄도 안 쓴다» · dry 는 안 쓴다 · 그 날 id 가 정말 그 날 수업인가 · 강사 겹침이면 null)
     D. 서버 can_split 식(api-admin.ts) — 오려 내 범위·출처 전 조합 대입
     E. 화면 판정 — mvWeekly·mvCanCancel 진리표, 오늘수업·매니저 버튼 조건, 학생 목록·상세의 «본사만» 판정
   「된다」 옆에 «안 된다»(지사·대리점·카페24·지난 날짜·모름)를 짝으로 둔다. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => join(ROOT, p);
const MODAL = process.env.MOVE_MODAL_SRC || P('cloudflare-deploy/public/js/class-move-modal.js');
const SPLIT = process.env.SPLIT_SRC || P('cloudflare-deploy/src/schedule-split.ts');
const ADMIN_TS = process.env.ADMIN_SRC || P('cloudflare-deploy/src/api-admin.ts');
const TODAY_JS = P('cloudflare-deploy/public/js/adm-today-classes.js');
const MGR = P('cloudflare-deploy/public/manager.html');
const CORE = P('cloudflare-deploy/public/js/adm-core.js');
const STU = P('cloudflare-deploy/public/admin/student.html');

let PASS = 0, FAIL = 0;
const ok = (n, c, x) => { if (c) { PASS++; } else { FAIL++; console.log('  ❌ ' + n + (x !== undefined ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const sec = (t) => console.log('\n' + t);
/* 결정론적 난수 — 실패를 다시 재현할 수 있게 */
let seed = Number(process.env.SEED || 20261008);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const dowOf = (ymd) => new Date(ymd + 'T00:00:00Z').getUTCDay();

/* 중괄호 짝으로 함수 몸통 자르기(JS — 반환 타입 없음) */
function blockFrom(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const s = src.indexOf('{', i + head.length - 1);
  let d = 0;
  for (let k = s; k < src.length; k++) {
    const c = src[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}

/* ── 모달 파일을 vm 에서 실제로 실행해 내보낸 함수를 얻는다 ─────────────── */
const modalSrc = readFileSync(MODAL, 'utf8');
const ctx = { window: {}, document: { getElementById: () => null }, console, Date, Math, JSON, Number, String, Array, isFinite, encodeURIComponent };
vm.createContext(ctx);
let MM = null;
try { vm.runInContext(modalSrc, ctx); MM = ctx.window.mangoiMoveModal; } catch (e) { console.log('  ❌ 모달 파일 실행 실패: ' + e.message); }
ok('전제 — 모달 파일을 실행해 mangoiMoveModal 을 얻었다', !!MM && typeof MM.pickOccurrences === 'function' && typeof MM.pickDowList === 'function' && typeof MM.isWeekly === 'function');

let SP = null;
try { SP = await import(pathToFileURL(SPLIT).href + '?t=' + Date.now()); } catch (e) { console.log('  ❌ schedule-split.ts 불러오기 실패: ' + e.message); }
ok('전제 — 서버 정본(schedule-split.ts)을 불러왔다', !!SP && typeof SP.runScheduleSplit === 'function');
if (!MM || !SP) { console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL); process.exit(1); }

/* ══ A. 요일 표기 — 화면과 서버가 «같은 답» 인가 (3,000건) ══════════════════ */
sec('A. 요일 표기: 화면 pickDowList == 서버 splitDowList');
{
  const TOK = ['0', '1', '2', '3', '4', '5', '6', '7', '9', '10', 'Mon', 'mon', 'MON', 'Tue', 'tuesday', 'Wed', 'Thu', 'thursday', 'Fri', 'sat', 'Sun',
    '월', '화', '수', '목', '금', '토', '일', '월요일', '수요일', '금요일', 'xyz', '', ' ', 'Mo', 'Thurs'];
  const SEP = [',', ', ', ' ', '/', '·', ' , ', ',,', '  '];
  let diff = 0, firstDiff = null;
  for (let n = 0; n < 3000; n++) {
    const k = ri(0, 4);
    let s = '';
    for (let j = 0; j < k; j++) s += (j ? pick(SEP) : '') + pick(TOK);
    if (rnd() < 0.05) s = null;
    const a = JSON.stringify(Array.from(MM.pickDowList(s)));
    const b = JSON.stringify(SP.splitDowList(s));
    if (a !== b) { diff++; if (!firstDiff) firstDiff = { s, a, b }; }
  }
  ok('무작위 3,000건 — 화면과 서버가 한 건도 다르지 않다', diff === 0, firstDiff);
  ok('숫자·영문·한글·나열을 다 읽는다', JSON.stringify(Array.from(MM.pickDowList('1, Wed/금·sun'))) === '[1,3,5,0]');
  ok('모르면 빈 배열(지어내지 않는다)', MM.pickDowList('xyz').length === 0 && MM.pickDowList('7').length === 0 && MM.pickDowList(null).length === 0);
}

/* ══ B. 회차 펼치기 — 독립 오라클과 대조 (400 시나리오) ═════════════════════ */
sec('B. pickOccurrences — 무작위 400 시나리오 × 오라클');
function oracle(items, today, days, nowMs, canSplit) {
  const out = [];
  const n = Math.max(1, Math.min(Number(days) || 28, 120));
  const last = addDays(today, n - 1);
  const ended = (ymd, hm, dur) => {
    const t = Date.parse(ymd + 'T' + (/^\d{1,2}:\d{2}$/.test(hm) ? hm.padStart(5, '0') : '00:00') + ':00+09:00');
    return isFinite(t) && t + (Number(dur) || 20) * 60000 <= nowMs;
  };
  for (const s of items) {
    if (!s || !s.id) continue;
    const st = String(s.status || 'active');
    if (st === 'cancelled') continue;
    if (/^(lms|type_seed)$/i.test(String(s.user_id || ''))) continue;
    const hm = String(s.start_time || '').slice(0, 5);
    const mirror = String(s.source || '').startsWith('c24-mirror');
    const sd = String(s.scheduled_date || '').slice(0, 10);
    if (sd) {
      if (sd < today || sd > last || st === 'postponed' || ended(sd, hm, s.duration_min)) continue;
      out.push({ key: sd + '|' + hm + '|' + s.id, can_move: true, can_split: false });
    } else {
      const dows = SP.splitDowList(s.day_of_week);
      const so = String(s.starts_on || '').slice(0, 10);
      for (let d = today; d <= last; d = addDays(d, 1)) {
        if (!dows.includes(dowOf(d))) continue;
        if (/^\d{4}-\d{2}-\d{2}$/.test(so) && d < so) continue;
        if (ended(d, hm, s.duration_min)) continue;
        out.push({ key: d + '|' + hm + '|' + s.id, can_move: false, can_split: !mirror && canSplit !== false });
      }
    }
  }
  return out.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}
{
  const TODAY = '2026-10-08';
  let mism = 0, firstMis = null, total = 0, sortBad = 0, keyBad = 0;
  for (let sc = 0; sc < 400; sc++) {
    const items = [];
    const k = ri(0, 9);
    for (let i = 0; i < k; i++) {
      const dated = rnd() < 0.5;
      items.push({
        id: rnd() < 0.03 ? 0 : 1000 + sc * 20 + i,
        user_id: pick(['jeong', 'jeong', 'kim01', 'LMS', 'type_seed', 'delaware']),
        student_name: '학생' + i,
        scheduled_date: dated ? addDays(TODAY, ri(-6, 45)) : (rnd() < 0.1 ? '' : null),
        day_of_week: dated ? pick(['', 'Wed', null]) : pick(['1', 'Tue', '목', '1,3,5', 'Mon Thu', '월/수', 'xyz', '6', '0', 'fri']),
        starts_on: rnd() < 0.3 ? addDays(TODAY, ri(-10, 30)) : (rnd() < 0.1 ? 'bad' : null),
        start_time: pick(['07:00', '09:20', '14:20', '19:30', '21:10', '23:40', '9:00', '']),
        duration_min: pick([20, 30, 40, null]),
        status: pick(['active', 'active', 'active', 'postponed', 'cancelled']),
        source: pick(['adm-enroll:5', 'ai_enroll', 'c24-mirror', 'c24-mirror:manual', null, 'schedule_split']),
        teacher_name: pick(['MAIMAI', 'FAR', ''])
      });
    }
    const days = pick([28, 7, 1, 0, 200, 14]);
    const nowMs = Date.parse(TODAY + 'T' + pick(['00:00', '09:30', '14:30', '19:45', '23:59']) + ':00+09:00');
    const canSplit = pick([true, false, undefined]);
    const got = MM.pickOccurrences(items, TODAY, days, nowMs, canSplit);
    const exp = oracle(items, TODAY, days, nowMs, canSplit);
    total += exp.length;
    const g = got.map(o => ({ key: o.ymd + '|' + o.hm + '|' + o.sch.id, can_move: o.row.can_move, can_split: o.row.can_split }))
      .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    if (JSON.stringify(g) !== JSON.stringify(exp)) { mism++; if (!firstMis) firstMis = { sc, got: g, exp }; }
    for (let i = 1; i < got.length; i++) {
      const a = got[i - 1], b = got[i];
      if (a.ymd > b.ymd || (a.ymd === b.ymd && a.hm > b.hm)) sortBad++;
    }
    for (const o of got) {
      if (o.row.schedule_id !== Number(o.sch.id)) keyBad++;
      if (o.row.can_move && o.row.can_split) keyBad++;           // 둘 다 참이면 안 된다
      if (o.row.mirror && o.row.can_split) keyBad++;             // 카페24 매주는 못 나눈다
    }
  }
  ok('400 시나리오 — 오라클과 전부 같다 (펼친 회차 ' + total + '개)', mism === 0, firstMis);
  ok('날짜·시각 순으로 정렬된다', sortBad === 0, sortBad);
  ok('행 모양 — id 일치 · can_move/can_split 동시 참 없음 · 카페24 매주는 can_split 거짓', keyBad === 0, keyBad);
  ok('펼친 회차가 실제로 있다(검사가 빈 목록만 보고 있지 않다)', total > 300, total);
  /* 콕 집은 규칙 — 짝으로 */
  const T0 = '2026-10-08', now0 = Date.parse(T0 + 'T09:00:00+09:00');
  const one = (s, cs) => MM.pickOccurrences([Object.assign({ id: 9, user_id: 'jeong', start_time: '19:30', duration_min: 20, status: 'active' }, s)], T0, 14, now0, cs);
  ok('매주(목) 2주 → 목요일 두 번(10/8·10/15)', one({ day_of_week: 'Thu' }).map(o => o.ymd).join() === '2026-10-08,2026-10-15');
  ok('날짜가 요일을 이긴다(날짜 수업은 그 날짜에만)', one({ day_of_week: 'Thu', scheduled_date: '2026-10-12' }).map(o => o.ymd).join() === '2026-10-12');
  ok('시작일(starts_on) 전에는 안 연다', one({ day_of_week: 'Thu', starts_on: '2026-10-10' }).map(o => o.ymd).join() === '2026-10-15');
  ok('이미 끝난 오늘 회차는 빼고 남은 것만', MM.pickOccurrences([{ id: 9, user_id: 'a', day_of_week: 'Thu', start_time: '08:00', duration_min: 20, status: 'active' }], T0, 14, now0).map(o => o.ymd).join() === '2026-10-15');
  ok('본사면 매주 줄을 나눌 수 있다(can_split)', one({ day_of_week: 'Thu' }, true)[0].row.can_split === true);
  ok('지사·대리점(canSplit=false)이면 매주 줄은 잠긴다 (짝)', one({ day_of_week: 'Thu' }, false)[0].row.can_split === false);
  ok('카페24 매주 줄은 본사라도 못 나눈다 (짝)', one({ day_of_week: 'Thu', source: 'c24-mirror' }, true)[0].row.can_split === false);
  ok('카페24 «날짜» 수업은 옮길 수 있다(can_move) — 서버가 manual 도장', one({ scheduled_date: '2026-10-12', source: 'c24-mirror' })[0].row.can_move === true);
  ok('이미 연기된 날짜 수업·취소·자리표시는 안 고르게 한다', one({ scheduled_date: '2026-10-12', status: 'postponed' }).length === 0
     && one({ day_of_week: 'Thu', status: 'cancelled' }).length === 0 && one({ day_of_week: 'Thu', user_id: 'lms' }).length === 0);
  ok('잘못된 today·빈 목록·배열 아님은 빈 결과', MM.pickOccurrences([], T0, 14).length === 0 && MM.pickOccurrences(null, T0).length === 0 && MM.pickOccurrences([{ id: 1, day_of_week: 'Thu', start_time: '19:00' }], '10/08').length === 0);
  ok('start_ts 는 KST 기준', one({ day_of_week: 'Thu' })[0].row.start_ts === Date.parse('2026-10-08T19:30:00+09:00'));
}

/* ══ C. 나누기 + focus_date — 진짜 SQLite (400 시나리오) ═══════════════════ */
sec('C. runScheduleSplit(focusDate) — 진짜 SQLite × 400');
/* 💰 급여 계산(computeLessonFeeMonth)의 «이 달 수업 전개» 를 정본에서 그대로 오려 낸다(⛔ 하니스에 베껴 적지 않는다).
   SELECT(살아 있는 줄) · 나눈 매주 줄 조회(splitPast) · 전개 루프까지 — 진짜 SQLite 에 실제로 돈다. */
const PAY = (() => {
  const ts = readFileSync(ADMIN_TS, 'utf8');
  const a = ts.indexOf('const ls: any = await env.DB.prepare(', ts.indexOf('const computeLessonFeeMonth'));
  const b = ts.indexOf('instances.sort(', a);
  if (a < 0 || b < 0) return null;
  const body = ts.slice(a, b).replace(/: any\[\]/g, '').replace(/: any/g, '').replace(/\(v\): number \| null =>/g, '(v) =>');
  try {
    const AF = Object.getPrototypeOf(async function () {}).constructor;
    return new AF('env', 'year', 'month', 'splitOriginsFromNotes', 'splitPastDay',
      'const ymPrefix = `${year}-${String(month).padStart(2, "0")}`;\n' + body + '\nreturn instances;');
  } catch (e) { console.log('PAY 오려내기 실패', e.message); return null; }
})();
ok('전제 — 급여 전개 코드를 정본에서 오려 냈다(나눈 매주 줄 포함)', typeof PAY === 'function' && /splitPast/.test(String(PAY)));
const payKeys = async (env, uid, y, m, TODAY) => (await PAY(env, y, m, SP.splitOriginsFromNotes, SP.splitPastDay))
  .filter(x => x.user_id === uid && x._date < TODAY)
  .map(x => `${x.id}|${x._date}|${x.status || 'active'}|${x._mins}`).sort().join(',');
function mkEnv() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 20, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT, starts_on TEXT);
    CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL;
    CREATE TABLE enrollments (id INTEGER PRIMARY KEY, student_user_id TEXT, status TEXT, end_date TEXT, days_of_week TEXT, time TEXT);`);
  let writes = 0;
  const wrap = (sql, args = []) => ({
    bind: (...a) => wrap(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { writes++; const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { db, get writes() { return writes; }, env: { DB: { prepare: (sql) => wrap(sql), batch: async (st) => { const o = []; for (const s of st) o.push(await s.run()); return o; } } } };
}
const snap = (db) => JSON.stringify(db.prepare('SELECT * FROM class_schedules ORDER BY id').all());
{
  const TODAY = '2026-10-08';
  let stats = { notInPlan: 0, dry: 0, real: 0, existFocus: 0, conflictFocus: 0, normal: 0, refused: 0 };
  const bad = [];
  for (let sc = 0; sc < 400; sc++) {
    const E = mkEnv(), db = E.db;
    const uid = 'stu' + sc, tm = pick(['19:30', '14:20', '21:10']), teacher = pick(['29', '22', null]);
    const dows = Array.from(new Set(Array.from({ length: ri(1, 3) }, () => ri(0, 6))));
    const dowStr = pick([dows.join(','), dows.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(','), dows.map(d => '일월화수목금토'[d]).join(',')]);
    const startsOn = rnd() < 0.3 ? addDays(TODAY, ri(-5, 20)) : null;
    const src = rnd() < 0.08 ? 'c24-mirror' : pick(['adm-enroll:7', 'ai_enroll']);
    const status = rnd() < 0.05 ? 'cancelled' : 'active';
    db.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,teacher_id,source,status,created_at,starts_on) VALUES (500,?,?,?,?,?,?,?,1,?)`)
      .run(uid, '학생', dowStr, tm, teacher, src, status, startsOn);
    if (rnd() < 0.4) db.prepare(`INSERT INTO enrollments VALUES (1,?,'confirmed',?,?,?)`).run(uid, addDays(TODAY, ri(-3, 120)), dowStr, tm);
    const row0 = db.prepare('SELECT * FROM class_schedules WHERE id=500').get();
    const plan0 = SP.planScheduleSplit(row0, TODAY, await SP.findEnrollmentEnd(E.env, row0));   // 정본과 같은 종료일로
    /* 이미 있는 날짜 수업 · 강사 겹침을 무작위로 심는다 */
    let existDates = [], conflictDates = [];
    if (plan0.ok) {
      for (const d of plan0.dates) {
        const r = rnd();
        if (r < 0.1) { db.prepare(`INSERT INTO class_schedules (user_id,day_of_week,scheduled_date,start_time,teacher_id,status,source,created_at) VALUES (?,NULL,?,?,?, 'active','x',1)`).run(uid, d, tm, teacher); existDates.push(d); }
        else if (r < 0.25 && teacher) { db.prepare(`INSERT INTO class_schedules (user_id,scheduled_date,start_time,teacher_id,status,source,created_at) VALUES ('other',?,?,?,'active','x',1)`).run(d, tm, teacher); conflictDates.push(d); }
      }
    }
    /* focus — 계획 안 / 밖 / 형식 오류 / 없음 */
    const fk = rnd();
    let focus;
    if (fk < 0.55 && plan0.ok && plan0.dates.length) focus = pick(plan0.dates);
    else if (fk < 0.8) focus = addDays(TODAY, ri(-10, 200));
    else if (fk < 0.88) focus = pick(['2026/10/12', 'x', '20261012']);
    else focus = null;
    const dry = rnd() < 0.25;
    const payBefore = {};
    for (const [y, m] of [[2026, 9], [2026, 10]]) payBefore[y + '-' + m] = await payKeys(E.env, uid, y, m, TODAY);
    const before = snap(db);
    let res;
    try { res = await SP.runScheduleSplit(E.env, 500, { dry, actor: 'h', today: TODAY, focusDate: focus }); }
    catch (e) { bad.push({ sc, err: e.message }); continue; }
    const after = snap(db);
    const plan = res.plan;
    const inPlan = plan && plan.ok && focus && /^\d{4}-\d{2}-\d{2}$/.test(focus) && plan.dates.includes(focus);
    const fail = (why) => bad.push({ sc, why, focus, dry, res: { ok: res.ok, error: res.error, focus_id: res.focus_id, made: res.made } });

    if (!plan.ok || !plan.dates.length) {             // 미러·취소·요일 없음·범위에 날짜 0개 — 아무것도 안 쓴다
      stats.refused++;
      if (res.ok !== false || before !== after) fail('계획이 안 되면 실패 + 무변경이어야');
      /* 💰 짝 — «그냥» 취소된 매주 줄(나눈 적 없음)의 지난 회차는 급여에 되살리지 않는다 */
      if (status === 'cancelled') { stats.plainCancel = (stats.plainCancel || 0) + 1; if (payBefore['2026-9']) fail('나눈 적 없는 취소 줄이 급여에 되살아났다'); }
      continue;
    }
    if (focus != null && focus !== '' && !inPlan) {   // 범위 밖·형식 오류 → 한 줄도 안 쓴다
      stats.notInPlan++;
      if (res.ok !== false || res.error !== 'focus_not_in_plan' || before !== after) fail('범위 밖 focus 는 거절 + 무변경');
      continue;
    }
    if (dry) {
      stats.dry++;
      if (before !== after) fail('dry 는 아무것도 안 쓴다');
      if (focus && existDates.includes(focus)) {
        const want = db.prepare(`SELECT id FROM class_schedules WHERE user_id=? AND start_time=? AND scheduled_date=? AND status='active' ORDER BY id DESC LIMIT 1`).get(uid, tm, focus);
        if (res.focus_id !== want.id) fail('dry: 이미 있는 그 날 id 를 알려 준다');
      } else if (res.focus_id != null) fail('dry: 없는 id 를 지어내지 않는다');
      continue;
    }
    stats.real++;
    const orig = db.prepare('SELECT status FROM class_schedules WHERE id=500').get();
    const live = db.prepare(`SELECT scheduled_date FROM class_schedules WHERE user_id=? AND start_time=? AND status='active' AND scheduled_date IS NOT NULL`).all(uid, tm).map(r => r.scheduled_date);
    if (res.ok) {
      if (orig.status !== 'cancelled') fail('나눴으면 원본은 «취소» 로 내린다(지우지 않는다)');
      if (!db.prepare('SELECT 1 FROM class_schedules WHERE id=500').get()) fail('원본 행이 사라졌다');
      if (res.made + res.existing.length !== plan.dates.filter(d => !conflictDates.includes(d) || existDates.includes(d)).length) fail('만든 수 + 이미 있던 수 = 계획 − 강사 겹침');
      for (const d of live) if (!plan.dates.includes(d)) fail('계획 밖 날짜에 수업이 생겼다: ' + d);
      { const seen = new Set(); for (const d of live) { if (seen.has(d)) fail('같은 날 수업이 두 줄(중복): ' + d); seen.add(d); } }
      /* 💰 급여 — 나누기 전/후 «지난 회차» 가 같은 id·날짜·상태·길이로 남는가(지난달·이번 달).
         ⛔ 개수만 세면 «새 id 로 다시 만들기»(노쇼·연기·지각·피드백 연결이 끊김)를 못 잡는다. */
      for (const [y, m] of [[2026, 9], [2026, 10]]) {
        const aKeys = await payKeys(E.env, uid, y, m, TODAY);
        if (aKeys !== payBefore[y + '-' + m]) fail(`급여: ${y}-${m} 지난 회차가 바뀌었다`);
        /* 짝 — 오늘부터는 원래 매주 줄로 세지 않는다(날짜 줄과 이중 계상 금지) */
        const fut = (await PAY(E.env, y, m, SP.splitOriginsFromNotes, SP.splitPastDay)).filter(x => x.user_id === uid && x._date >= TODAY);
        if (fut.some(x => x.id === 500)) fail(`급여: ${y}-${m} 나눈 날 이후에도 원래 매주 줄을 센다(이중 계상)`);
      }
      stats.payChecked = (stats.payChecked || 0) + 1;
      for (const d of plan.dates) if (!conflictDates.includes(d) && !live.includes(d)) fail('계획 날짜에 수업이 없다: ' + d);
    } else {
      if (res.error !== 'nothing_created' || orig.status !== 'active') fail('하나도 못 만들면 원본을 안 내린다');
    }
    if (focus) {
      const want = db.prepare(`SELECT id, scheduled_date, user_id, start_time FROM class_schedules WHERE user_id=? AND start_time=? AND scheduled_date=? AND status='active' ORDER BY id DESC LIMIT 1`).get(uid, tm, focus);
      if (want) {
        if (res.focus_id !== want.id) fail('focus_id 는 «그 날» 의 살아 있는 날짜 수업');
        if (existDates.includes(focus)) stats.existFocus++; else stats.normal++;
      } else {
        stats.conflictFocus++;
        if (res.focus_id != null) fail('그 날 수업이 못 만들어졌으면 focus_id 는 null(지어내지 않는다)');
        if (!conflictDates.includes(focus)) fail('focus 가 없는데 강사 겹침도 아니다');
      }
    }
  }
  ok('400 시나리오 — 규칙 위반 0건', bad.length === 0, bad.slice(0, 3));
  ok('범위 밖 focus 거절 경로를 실제로 탔다', stats.notInPlan >= 30, stats);
  ok('dry 경로를 실제로 탔다', stats.dry >= 30, stats);
  ok('실제 나누기 경로를 실제로 탔다', stats.real >= 100, stats);
  ok('«그 날이 이미 있던» 경우를 실제로 탔다', stats.existFocus >= 3, stats);
  ok('«강사 겹침으로 그 날이 안 생긴» 경우를 실제로 탔다', stats.conflictFocus >= 3, stats);
  ok('미러·취소 원본 거절을 실제로 탔다', stats.refused >= 10, stats);
  ok('💰 급여 전/후 대조를 실제로 탔다(지난 회차가 같은 id·날짜·상태로 남는다)', (stats.payChecked || 0) >= 100, stats);
  ok('💰 짝 — «그냥 취소된» 매주 줄 경로를 실제로 탔다', (stats.plainCancel || 0) >= 5, stats);
  console.log('  ℹ️ ' + JSON.stringify(stats));
}
/* 콕 집은 — 실사고 모양(jeong 화요일 19:30, 다음 주 수업을 그 날만) */
{
  const E = mkEnv(), db = E.db;
  db.prepare(`INSERT INTO class_schedules (id,user_id,student_name,day_of_week,start_time,teacher_id,source,created_at) VALUES (848,'jeong','정우영','Mon','19:30','27','adm-enroll:103',1)`).run();
  const r = await SP.runScheduleSplit(E.env, 848, { dry: false, actor: 'h', today: '2026-10-08', focusDate: '2026-10-12' });
  const row = db.prepare('SELECT * FROM class_schedules WHERE id=?').get(r.focus_id);
  ok('실사고 모양: 다음 주 월(10/12) 수업 id 를 돌려준다', r.ok && row && row.scheduled_date === '2026-10-12' && row.start_time === '19:30' && row.user_id === 'jeong', r);
  ok('그 행은 날짜 수업(dated)이고 같은 강사·출처', row && row.schedule_kind === 'dated' && row.teacher_id === '27' && row.source === 'adm-enroll:103');
  ok('원래 매주 줄은 «취소» (지우지 않음)', db.prepare('SELECT status FROM class_schedules WHERE id=848').get().status === 'cancelled');
  const E2 = mkEnv();
  E2.db.prepare(`INSERT INTO class_schedules (id,user_id,day_of_week,start_time,created_at) VALUES (1,'a','Mon','19:30',1)`).run();
  const w0 = E2.writes;
  const r2 = await SP.runScheduleSplit(E2.env, 1, { dry: false, actor: 'h', today: '2026-10-08', focusDate: '2026-10-13' });
  ok('focus 가 그 요일이 아니면(화) 한 줄도 안 쓰고 거절', r2.ok === false && r2.error === 'focus_not_in_plan' && E2.writes === w0, r2);
  const r3 = await SP.runScheduleSplit(E2.env, 1, { dry: false, actor: 'h', today: '2026-10-08' });
  ok('focus 없이 부르면 예전 그대로 나눈다(짝 — 기존 「날짜별로 나누기」 버튼)', r3.ok === true && r3.focus_id === null && r3.made === 12, r3);
}

/* ══ D. 서버 can_split 식 — 오려 내 대입 ════════════════════════════════════ */
sec('D. 서버 classes/today 의 can_split');
{
  const ts = readFileSync(ADMIN_TS, 'utf8');
  const m = ts.match(/can_split:\s*([\s\S]*?),\s*\n\s*is_level_test/);
  ok('전제 — can_split 식을 찾았다', !!m);
  if (m) {
    let f = null;
    try { f = new Function('s', '_ctScope', 'return (' + m[1] + ');'); } catch (e) { ok('식 평가', false, e.message); }
    const call = (s, t) => { try { return f(s, { type: t }); } catch (e) { return 'ERR'; } };
    let n = 0, wrong = [];
    for (const t of ['hq', 'none', 'franchise', 'branch', 'agency', 'teacher', undefined])
      for (const sd of [null, '', '2026-10-12'])
        for (const src of [null, 'adm-enroll:1', 'c24-mirror', 'c24-mirror:manual', 'ai_enroll']) {
          n++;
          const want = !sd && !String(src || '').startsWith('c24-mirror') && (t === 'hq' || t === 'none');
          if (call({ scheduled_date: sd, source: src }, t) !== want) wrong.push({ t, sd, src });
        }
    ok('범위 7 × 날짜 3 × 출처 5 = ' + n + '조합 전부 기대대로', wrong.length === 0, wrong.slice(0, 4));
    ok('본사 + 매주 + 일반 출처면 참', call({ scheduled_date: null, source: 'adm-enroll:1' }, 'hq') === true);
    ok('지사·대리점은 거짓 (짝)', ['franchise', 'branch', 'agency'].every(t => call({ scheduled_date: null, source: 'x' }, t) === false));
    ok('날짜 수업은 거짓 (나눌 필요 없음 — can_move 쪽)', call({ scheduled_date: '2026-10-12', source: 'x' }, 'hq') === false);
  }
  ok('can_move 는 그대로 «날짜가 있는가»', /can_move:\s*!!s\.scheduled_date,/.test(ts));
  const route = blockFrom(ts, "if (method === 'POST' && /^\\/api\\/admin\\/class-schedules\\/\\d+$/.test(path))");
  ok('전제 — 나누기 라우트를 잘라 냈다', route.length > 500, route.length);
  ok('나누기는 본사 전용(enrollAdminHqOnly)이 «먼저»', route.indexOf('enrollAdminHqOnly') > 0 && route.indexOf('enrollAdminHqOnly') < route.indexOf('runScheduleSplit'));
  ok('focus_date 를 정본에 넘긴다', /runScheduleSplit\(env, id, \{[^}]*focusDate:\s*body\.focus_date/.test(route));
  ok('⛔ dry_run 기본값은 그대로(명시적으로 false 일 때만 쓴다)', /const dry = body\.dry_run !== false;/.test(route));
}

/* ══ E. 화면 판정 ════════════════════════════════════════════════════════════ */
sec('E. 화면 판정');
{
  /* mvWeekly · mvCanCancel 진리표 — 모듈 «안» 의 함수를 오려 내 실행 */
  const wk = blockFrom(modalSrc, 'function mvWeekly(r)').match(/return ([^;]+);/);
  const cc = blockFrom(modalSrc, 'function mvCanCancel(r)').match(/return ([^;]+);/);
  ok('전제 — mvWeekly·mvCanCancel 을 찾았다', !!wk && !!cc);
  if (wk && cc) {
    const W = new Function('r', 'return ' + wk[1] + ';');
    const C0 = new Function('_opt', 'r', 'mvWeekly', 'return ' + cc[1] + ';');
    let n = 0, wrong = [];
    for (const canCancel of [true, false, undefined, 'yes'])
      for (const cm of [true, false, undefined])
        for (const cs of [true, false, undefined])
          for (const sid of [7, 0, null]) {
            n++;
            const r = { can_move: cm, can_split: cs, schedule_id: sid };
            const wantW = cm !== true && cs === true && !!sid;
            const wantC = canCancel === true && (cm === true || wantW);
            if (W(r) !== wantW || C0({ canCancel }, r, W) !== wantC) wrong.push({ canCancel, cm, cs, sid });
          }
    ok('진리표 ' + n + '칸 — 매주=«can_split 참 + 날짜 아님 + id 있음», 취소=«본사 + (날짜 또는 나눌 수 있는 매주)»', wrong.length === 0, wrong.slice(0, 4));
    ok('«모름»(빈 행·null)에는 아무것도 안 준다', W(null) === false && C0({ canCancel: true }, null, W) === false && C0({ canCancel: true }, {}, W) === false);
  }
  /* 실행 경로 — 매주면 «나누기 → 그 날 id» 를 먼저 탄다 */
  const run = blockFrom(modalSrc, 'function mvRun(r, day)');
  ok('전제 — mvRun 을 잘라 냈다', run.length > 200);
  ok('매주 갈래가 mvRun 맨 앞에서 mvSplitFirst 를 부른다', run.indexOf('if (mvWeekly(r))') >= 0 && run.indexOf('if (mvWeekly(r))') < run.indexOf('var act = mvAct();') && /mvSplitFirst\(r, day\)\.then/.test(run));
  const sf = blockFrom(modalSrc, 'function mvSplitFirst(r, day)');
  ok('나누기 요청 = 그 수업 id · action:split · dry_run:false · focus_date', /\/api\/admin\/class-schedules\/' \+ encodeURIComponent\(Number\(r\.schedule_id\)\), \{ action: 'split', dry_run: false, focus_date: day \}/.test(sf));
  ok('나누기 전에 확인을 받고, 취소하면 아무 요청도 안 한다', /if \(!window\.confirm\([\s\S]*?\)\) return Promise\.resolve\(false\);/.test(sf) && sf.indexOf('window.confirm') < sf.indexOf('mvReq('));
  ok('성공하면 그 날 id(focus_id)로 바꿔 탄다', /r\.schedule_id = Number\(j\.focus_id\);/.test(sf) && /r\.can_move = true; r\.can_split = false;/.test(sf));
  ok('focus_id 가 없으면(강사 겹침) 진행하지 않고 말한다 (짝)', /if \(!\(Number\(j\.focus_id\) > 0\)\)[\s\S]{0,400}return false;/.test(sf));
  ok('나눈 뒤엔 닫을 때 목록을 다시 받게 표시(_mvChanged)', sf.indexOf('_mvChanged = true;') > 0);
  ok('범위 밖·403·카페24 를 사람 말로 (한/영)', /focus_not_in_plan/.test(sf) && /res\.st === 403/.test(sf) && /mirror_row/.test(sf) && /Nothing was changed/.test(sf));
  ok('미리보기가 필요한 동작(변경·연기보강)은 나눈 뒤 한 번 더 누르게', /act0 === 'series' \|\| act0 === 'end'/.test(run) && /mvSync\(r, day\)/.test(run));
  ok('⛔ 매주 줄에서 연기보강 미리보기를 서버에 안 묻는다(날짜 수업이 없다)', /if \(mvWeekly\(r\)\) \{ _mvEnd = \{ ok: false, weekly: true \}; return; \}/.test(blockFrom(modalSrc, 'function mvEndLoad(r, day)')));
  ok('⛔ 매주 줄에서 «앞으로 계속» 미리보기를 서버에 안 묻는다', blockFrom(modalSrc, 'function mvLoadSeries(r)').indexOf('if (mvWeekly(r))') < blockFrom(modalSrc, 'function mvLoadSeries(r)').indexOf("mvReq('POST'"));

  /* 오늘 수업(관리자) · 오늘 전체 수업(매니저) 버튼 조건 — 오려 내 대입 */
  const tj = readFileSync(TODAY_JS, 'utf8');
  const mT = tj.match(/if \((s\.can_move === false && s\.can_split !== true)\)/);
  const mg = readFileSync(MGR, 'utf8');
  const mM = mg.match(/else if \((r\.schedule_id && r\.can_move === false && r\.can_split !== true)\)/);
  ok('전제 — 두 화면의 «버튼 대신 안내» 조건을 찾았다', !!mT && !!mM);
  if (mT && mM) {
    const fT = new Function('s', 'return ' + mT[1] + ';'), fM = new Function('r', 'return ' + mM[1] + ';');
    let wrong = [];
    for (const cm of [true, false]) for (const cs of [true, false, undefined]) {
      const row = { schedule_id: 5, can_move: cm, can_split: cs };
      const tag = cm === false && cs !== true;          // 안내(버튼 없음)
      if (fT(row) !== tag || fM(row) !== tag) wrong.push(row);
    }
    ok('매주 + can_split → 버튼 · 매주 + 못 나눔 → 안내 · 날짜 → 버튼 (두 화면이 같은 답)', wrong.length === 0, wrong);
  }
  /* 학생 목록(adm-core) — «본사만» 판정을 오려 내 실행 */
  const core = readFileSync(CORE, 'utf8');
  const sm = blockFrom(core, 'function smOpenMovePick(uid, name)');
  ok('전제 — smOpenMovePick 을 잘라 냈다', sm.length > 200);
  const runSm = (role) => {
    let got = null;
    const win = { adminLang: 'ko', __ADM_ME: role === undefined ? null : { role, name: 'X' }, mangoiMoveModal: { pickOpen: (s, o) => { got = { s, o }; } } };
    try { new Function('window', 'alert', sm + '\nsmOpenMovePick("jeong","정우영");')(win, () => {}); } catch (e) { return 'ERR:' + e.message; }
    return got;
  };
  const hq = runSm('hq'), stf = runSm('staff');
  ok('본사·내부직원 → 취소·나누기 줌', hq && hq.o.canCancel === true && hq.o.canSplit === true && stf && stf.o.canCancel === true, hq);
  ok('지사·대리점·지사본사·강사 → 안 줌 (짝)', ['branch', 'agency', 'franchise', 'teacher'].every(r => { const g = runSm(r); return g && g.o.canCancel === false && g.o.canSplit === false; }));
  ok('역할을 모르면 안 줌(막는 쪽으로 실패)', (() => { const g = runSm(undefined); return g && g.o.canCancel === false && g.o.canSplit === false; })());
  ok('그 학생으로 연다', hq && hq.s.uid === 'jeong' && hq.s.name === '정우영');
  ok('학생 목록 줄에 버튼이 실제로 그려진다', /class="sm-move-go"[^>]*smOpenMovePick\(/.test(core) || /smOpenMovePick\([^)]*\)[^<]*연기·변경·취소/.test(core));
  /* 학생 상세(캘린더·날짜 칩) */
  const stu = readFileSync(STU, 'utf8');
  const mr = blockFrom(stu, 'function mgsuMeRole(cb)');
  const hqLine = mr.match(/hq: (!!role && \[[^\]]+\]\.indexOf\(role\) < 0)/);
  ok('전제 — 학생 상세 «본사» 판정을 찾았다', !!hqLine);
  if (hqLine) {
    const f = new Function('role', 'return ' + hqLine[1] + ';');
    ok('학생 상세도 학생 목록과 같은 답(역할 7종)', ['hq', 'staff', 'teacher', 'franchise', 'branch', 'agency', ''].every(r => f(r) === runSm(r || undefined).o.canSplit));
  }
  const om = blockFrom(stu, 'function mgsuOpenMove(key)');
  ok('학생 상세: 카페24 매주는 «카페24에서» 로 막는다', /if \(!dated && mirror\)/.test(om));
  ok('학생 상세: 본사가 아니면 매주는 막고 말한다 (짝)', /if \(!dated && !row\.can_split\) \{ alert\(/.test(om));
  ok('학생 상세: 이미 끝난·연기된 회차는 안 연다', /mgsuEnded\(/.test(om) && /'postponed'/.test(om));
  ok('학생 상세: 캘린더 카드가 그 창을 부른다', /data-mgs-move/.test(stu) && /mgsuOpenMove\(/.test(stu));
  /* 창을 부르는 화면들이 «같은 번호» 로 */
  const vers = ['cloudflare-deploy/public/admin.html', 'cloudflare-deploy/public/manager.html', 'cloudflare-deploy/public/branch.html', 'cloudflare-deploy/public/admin/student.html']
    .map(f => (readFileSync(P(f), 'utf8').match(/class-move-modal\.js\?v=(\d+)/) || [])[1]);
  ok('공용 창을 부르는 4곳이 같은 ?v=', vers.every(v => v && v === vers[0]), vers);
}

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) process.exit(1);
