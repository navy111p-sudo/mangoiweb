#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
 * 🔁 관리자 «변경(앞으로 계속)» 실제 적용 + 주간 캘린더 «그 주만 빠진 날» (2026-10-14)
 *
 * [왜]
 *  ① enroll-ops.ts series-move 는 planSeries(날짜 오름차순) 순서 그대로 UPDATE 했다.
 *     +7일 이동이면 첫 회가 «아직 안 비운 둘째 회 자리» 로 들어가 uq_sched_teacher_slot 에 걸려
 *     batch 전체가 롤백됐다(10/14·21·28 → 실측 UNIQUE constraint failed).
 *  ② 옛 WHERE 의 substr(start_time,1,5)='09:00' 은 DB 에 '9:00' 으로 적힌 행과 영영 안 맞아
 *     그 회차가 조용히 0행이었다(planSeries 는 normTime 으로 골라 온다).
 *  ③ /api/admin/schedules 의 반복 분기만 recurStartedOn(skip_dates·starts_on)을 안 지나
 *     «그 주 하루만» 옮긴 수업이 관리자 주간표에 «원래 칸 + 보강 칸» 둘 다 보였다.
 *
 * [어떻게] 문자열이 아니라 «실제로 돌려서» 묻는다 —
 *  ①② 소스에서 정렬식과 UPDATE SQL 을 오려 내 진짜 SQLite(node:sqlite, 운영과 같은 부분 유니크 인덱스)에서 실행.
 *  ③ 정본 recurStartedOn 을 import 해 돌리고, 캘린더 반복 분기가 그것을 (r, d) 로 부르는지 «그 분기 안» 에서 확인.
 *  짝: «안 막아야 할 것은 그대로 지나가는가» 를 함께 둔다(전부 막기·전부 통과 변이가 통과하지 않게).
 * ═══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (f) => join(ROOT, 'cloudflare-deploy', 'src', f);
const ENROLL = process.env.SERIES_SRC_FILE || SRC('enroll-ops.ts');
const ADMIN = process.env.ADMIN_SRC_FILE || SRC('api-admin.ts');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/* 중괄호 짝으로 블록 자르기 — 문자열·주석은 단순 추적(이 파일 범위에서 충분) */
function blockFrom(src, openIdx) {
  let depth = 0, i = openIdx, q = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

/* ───────── ①② series-move 적용 ───────── */
console.log('\n① 변경(앞으로 계속) — UPDATE 순서와 시각 비교 (진짜 SQLite)');
const es = readFileSync(ENROLL, 'utf8');
const head = es.indexOf("if (path === '/api/pay/enroll/admin/series-move' && method === 'POST')");
const route = head >= 0 ? blockFrom(es, es.indexOf('{', head)) : '';
ok('전제: series-move 라우트를 중괄호 짝으로 잘라 냈다', route.length > 500);

const ordM = route.match(/const ordered = (plan\.items\.slice\(\)\.sort\([\s\S]*?\)\));/);
ok('전제: 정렬식(const ordered = …)을 찾았다', !!ordM);
const sqlM = route.match(/:\s*`(UPDATE class_schedules SET scheduled_date = \?, start_time = \?, updated_at = \?[\s\S]*?)`/);
ok('전제: (강사 안 바꿈) UPDATE SQL 을 찾았다', !!sqlM);
const rawBindOk = /rawTimeById\.get\(String\(it\.id\)\)\s*\|\|\s*it\.from_time/.test(route);
ok('시각은 «DB 에 적힌 그대로» 를 바인딩한다(rawTimeById)', rawBindOk);
ok('그 지도를 «실제로 조회한 행» 으로 채운다', /for \(const r of \(\(rs\?\.results as any\[\]\) \|\| \[\]\)\) rawTimeById\.set\(String\(r\.id\), String\(r\.start_time/.test(route));

function runCase(label, delta, dates, opts = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules(id INTEGER PRIMARY KEY, teacher_id TEXT, scheduled_date TEXT, start_time TEXT, status TEXT, updated_at INTEGER);
           CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time)
             WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL;`);
  const rawT = opts.rawTime || '19:00';
  dates.forEach((d, i) => db.prepare(`INSERT INTO class_schedules VALUES(?, 't1', ?, ?, 'active', 0)`).run(i + 1, d, rawT));
  const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const plan = { delta_days: delta, items: dates.map((d, i) => ({ id: i + 1, from_date: d, from_time: opts.fromTime || '19:00', to_date: add(d, delta), to_time: opts.fromTime || '19:00' })) };
  const rawTimeById = new Map(dates.map((_, i) => [String(i + 1), rawT]));
  let ordered;
  try { ordered = new Function('plan', 'return ' + ordM[1] + ';')(plan); }
  catch (e) { return { err: 'sort-eval: ' + e.message }; }
  const sql = sqlM[1];
  let moved = 0;
  try {
    db.exec('BEGIN');
    for (const it of ordered) {
      const tBind = rawBindOk ? (rawTimeById.get(String(it.id)) || it.from_time) : it.from_time;
      const r = db.prepare(sql).run(it.to_date, it.to_time, 1, it.id, it.from_date, tBind);
      moved += Number(r.changes) || 0;
    }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} return { err: e.message }; }
  const final = db.prepare('SELECT scheduled_date FROM class_schedules ORDER BY id').all().map((r) => r.scheduled_date);
  return { moved, final };
}

if (ordM && sqlM) {
  const fwd = runCase('+7', 7, ['2026-10-14', '2026-10-21', '2026-10-28']);
  ok('+7일 이동(10/14·21·28) 이 유니크 충돌 없이 끝난다', !fwd.err, fwd.err);
  ok('+7일 이동 결과 = 10/21·10/28·11/04, 3회 모두 옮김', fwd.moved === 3 && JSON.stringify(fwd.final) === JSON.stringify(['2026-10-21', '2026-10-28', '2026-11-04']), JSON.stringify(fwd));
  const back = runCase('-7', -7, ['2026-10-21', '2026-10-28', '2026-11-04']);
  ok('-7일(앞당기기) 도 충돌 없이 3회 옮긴다', !back.err && back.moved === 3 && back.final[0] === '2026-10-14', JSON.stringify(back));
  const far = runCase('+14', 14, ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04']);
  ok('+14일(두 칸 건너뛰기) 도 충돌 없이 4회 옮긴다', !far.err && far.moved === 4, JSON.stringify(far));
  const same = runCase('0', 0, ['2026-10-14', '2026-10-21'], { fromTime: '19:00' });
  ok('짝: 날짜 그대로(delta 0) 도 정상 처리', !same.err && same.moved === 2, JSON.stringify(same));
  const hm = runCase('H:MM', 7, ['2026-10-14'], { rawTime: '9:00', fromTime: '09:00' });
  ok("DB 에 '9:00' 으로 적힌 행도 실제로 옮겨진다(옛 substr 비교는 0행)", !hm.err && hm.moved === 1, JSON.stringify(hm));

  /* 대조: 옛 «오름차순» 순서는 실제로 실패한다 — 이 검사가 헛돌지 않는다는 증거 */
  const oldOrdM = ordM; ordM[1] = 'plan.items.slice()';
  const old = runCase('old', 7, ['2026-10-14', '2026-10-21', '2026-10-28']);
  ok('대조: 옛 오름차순 순서는 실제로 UNIQUE 충돌이 난다(재현)', !!old.err && /UNIQUE/.test(old.err), JSON.stringify(old));
  void oldOrdM;
}

/* ───────── ③ 주간 캘린더 반복 분기 ───────── */
console.log('\n③ 관리자 주간 캘린더 — «그 주 하루만 빠진 날» 은 안 그린다');
const ad = readFileSync(ADMIN, 'utf8');
const sh = ad.indexOf("if (method === 'GET' && path === '/api/admin/schedules')");
const sroute = sh >= 0 ? blockFrom(ad, ad.indexOf('{', sh)) : '';
ok('전제: /api/admin/schedules 라우트를 잘라 냈다', sroute.length > 2000);
const wi = sroute.indexOf('const want = normDow(r.day_of_week);');
const forI = wi >= 0 ? sroute.indexOf('for (const d of weekDates)', wi) : -1;
const loop = forI >= 0 ? blockFrom(sroute, sroute.indexOf('{', forI)) : '';
ok('전제: 반복 분기의 요일 루프를 잘라 냈다', loop.length > 40);
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const loopCode = strip(loop);
ok('그 루프가 recurStartedOn(r, d) 를 «조건으로» 쓴다', /if\s*\([^)]*recurStartedOn\(r,\s*d\)[^)]*\)\s*\{\s*items\.push/.test(loopCode), loopCode.slice(0, 200));
ok('죽은 조건(false &&, true ||)이 없다', !/(false\s*&&|true\s*\|\||!\s*recurStartedOn)/.test(loopCode));
ok('정본을 import 한다(복제하지 않는다)', /import\s*\{[^}]*recurStartedOn[^}]*\}\s*from\s*'\.\/class-start-date'/.test(ad));

const { recurStartedOn } = await import(join(ROOT, 'cloudflare-deploy', 'src', 'class-start-date.ts'));
const rec = { day_of_week: 'Wed', skip_dates: '2026-10-14', starts_on: null };
ok('정본: skip_dates 에 든 날은 false(안 그림)', recurStartedOn(rec, '2026-10-14') === false);
ok('짝: 그 외 주는 true(그대로 그림)', recurStartedOn(rec, '2026-10-21') === true);
ok('짝: skip_dates 가 없는 반복 행은 true', recurStartedOn({ day_of_week: 'Wed' }, '2026-10-14') === true);
ok('정본: starts_on 이전은 false', recurStartedOn({ starts_on: '2026-10-20' }, '2026-10-14') === false);
ok('짝: 날짜 지정 행은 언제나 true', recurStartedOn({ scheduled_date: '2026-10-14', skip_dates: '2026-10-14' }, '2026-10-14') === true);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
