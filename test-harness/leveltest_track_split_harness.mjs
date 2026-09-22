#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   🎯 leveltest_track_split_harness — 레벨테스트 «화상수업 학생 / AI 전용 학생» 구분

   [왜 이 검사가 있나 — 2026-09-21]
     레벨테스트 흐름이 «하나» 뿐이라 두 유형이 같은 표에 같은 모양으로 쌓였다.
     AI 학습도구만 쓰는 학생은 선생님 평가 단계가 없는데도 status='pending' 으로
     들어가 «처리 대기» 가 영영 안 풀렸고(실측 7건 전부 pending · 선생님 평가 0건),
     화면은 AI 점수만으로 나온 레벨과 선생님이 확정한 레벨을 «둘 다 A2» 로 그렸다.

   [문자열로 물으면 못 잡는다]
     함수도 값도 다 «있고» 틀린 것은 «무슨 답이 나오는가» 와 «그 답을 실제로 쓰는가»
     뿐이다. 그래서 정본을 오려 내 실제로 돌리고, SQL 은 진짜 SQLite 에 건다.

   [짝으로 묻는다]
     「AI 전용이면 뺀다」만 두면 «전부 빼기» 도 통과한다 — 「화상수업 학생은 그대로
     대기에 남는다」·「모르면 대기」를 짝으로 둔다.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = (p) => fs.readFileSync(path.join(ROOT, 'cloudflare-deploy', p), 'utf8');
const TRACK_SRC = process.env.TRACK_SRC || 'src/student-track.ts';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

/* ── 주석을 벗겨 낸 사본으로 부정 검사 (CLAUDE.md: 부정 검사가 자기 주석을 잡는다) ── */
function strip(t) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (n || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* ── 중괄호 짝으로 몸통 자르기 (TS 는 반환 타입 안에도 { 가 있다 — 괄호·꺾쇠 깊이 0만 인정) ── */
function bodyAfter(src, fromIdx) {
  let i = fromIdx, par = 0, ang = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') par++; else if (c === ')') par--;
    else if (c === '<') ang++; else if (c === '>') ang--;
    else if (c === '{' && par === 0 && ang <= 0) break;
  }
  if (i >= src.length) return null;
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

/* ── 괄호 짝으로 `.bind(…)` 인자 목록 자르기 ──
   ⚠️ `[^)]*` 로 물으면 안 된다 — 인자 안에 `(uid ? String(uid) : '…')` 처럼
   괄호가 들어 있어 거기서 끊기고, 그러면 멀쩡한 코드가 «안 넘긴다» 로 나온다. */
function bindArgs(src, fromIdx) {
  const at = src.indexOf('.bind(', fromIdx);
  if (at < 0) return null;
  let d = 0;
  for (let j = at + 5; j < src.length; j++) {
    if (src[j] === '(') d++;
    else if (src[j] === ')') { d--; if (d === 0) return src.slice(at + 6, j); }
  }
  return null;
}

console.log('\n① 유형 판정 정본을 실제로 돌린다 (student-track.ts)');
const trackSrc = SRC(TRACK_SRC);
// 타입 표기를 걷어 내 그대로 실행한다 (⚠️ 배열 표기를 먼저 — ' as any[]' 를 나중에 지우면 (x[]) 가 된다)
let runnable = trackSrc
  .replace(/^export (type|interface)[\s\S]*?(?=^export |^\/\*|^const |^\/\/)/gm, '')
  .replace(/:\s*Promise<[^>]*>/g, '')
  .replace(/:\s*StudentTrackResult/g, '')
  .replace(/:\s*StudentTrack\b/g, '')
  .replace(/:\s*'pending'\s*\|\s*'ai_done'/g, '')
  .replace(/:\s*string\s*\|\s*null\s*\|\s*undefined/g, '')
  .replace(/:\s*any\b/g, '')
  .replace(/:\s*number\b/g, '')
  .replace(/^export /gm, '');

let mod = null;
try {
  mod = new Function(runnable + '\n;return { resolveStudentTrack, leveltestStatusFor, NOT_PLACEHOLDER };')();
  ok(true, '정본을 오려 내 실행했다 (전제)');
} catch (e) {
  ok(false, '정본 실행 실패 — 이후 ①은 헛돈다: ' + e.message);
}

const fakeDb = (n, throws) => ({
  DB: { prepare: () => ({ bind: () => ({ first: async () => { if (throws) throw new Error('D1 down'); return n === null ? null : { n }; } }) }) }
});

if (mod) {
  const T = async (env, uid) => { try { return await mod.resolveStudentTrack(env, uid); } catch (e) { return { track: 'THREW:' + e.message, live_count: -9 }; } };
  const r1 = await T(fakeDb(5), 'stu1');
  ok(r1.track === 'live_ai' && r1.live_count === 5, `활성 예약 5건 → live_ai (나온 값 ${r1.track})`);
  const r2 = await T(fakeDb(0), 'stu2');
  ok(r2.track === 'ai_only' && r2.live_count === 0, `활성 예약 0건 → ai_only (나온 값 ${r2.track})`);
  // 🔴 짝: 못 물어봤을 때 'ai_only' 로 떨어지면 화상수업 학생 건이 조용히 대기에서 빠진다
  const r3 = await T(fakeDb(0, true), 'stu3');
  ok(r3.track === 'unknown' && r3.live_count === -1, `조회가 던지면 unknown — ai_only 로 떨어지지 않는다 (나온 값 ${r3.track})`);
  const r4 = await T(fakeDb(null), 'stu4');
  ok(r4.track === 'unknown', `행이 없으면 unknown — Number(null) === 0 은 유한수다 (나온 값 ${r4.track})`);
  const r5 = await T(fakeDb(3), '');
  ok(r5.track === 'unknown' && r5.live_count === -1, 'uid 가 비면 unknown — 조회하지 않는다');

  ok(mod.leveltestStatusFor('ai_only') === 'ai_done', 'ai_only → status ai_done');
  // 🔴 짝 둘: 없으면 «전부 ai_done» 도 통과한다
  ok(mod.leveltestStatusFor('live_ai') === 'pending', '짝: live_ai → status pending (화상수업 학생은 대기에 남는다)');
  ok(mod.leveltestStatusFor('unknown') === 'pending', '짝: unknown → status pending (모르면 사람이 한 번 본다)');
}

console.log('\n② 자리표시(lms·type_seed)를 세지 않는가 — 진짜 SQLite 로');
let sqliteOk = false;
try {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (user_id TEXT, status TEXT)`);
  db.exec(`INSERT INTO class_schedules VALUES ('stuA','active'),('lms','active'),('type_seed','active'),('stuB','cancelled')`);
  const m = trackSrc.match(/NOT_PLACEHOLDER\s*=\s*`([^`]+)`/);
  ok(!!m, 'NOT_PLACEHOLDER 조건을 소스에서 읽었다 (전제)');
  if (m) {
    const q = `SELECT COUNT(*) AS n FROM class_schedules WHERE user_id = ? AND status = 'active' AND ${m[1]}`;
    const a = db.prepare(q).get('stuA');
    ok(Number(a.n) === 1, `진짜 학생은 세어진다 (${a.n}건)`);
    const l = db.prepare(q).get('lms');
    ok(Number(l.n) === 0, `자리표시 lms 는 0건 — 안 세어진다 (${l.n}건)`);
    const t = db.prepare(q).get('type_seed');
    ok(Number(t.n) === 0, `자리표시 type_seed 는 0건 (${t.n}건)`);
    const b = db.prepare(q).get('stuB');
    ok(Number(b.n) === 0, `취소된 예약은 안 세어진다 (${b.n}건)`);
  }
  sqliteOk = true;
} catch (e) {
  console.log('  ⏭ node:sqlite 없음 — ②를 건너뜀 (' + e.message + ')');
}

console.log('\n③ 진단 저장이 그 판정을 «실제로 쓰는가» (배선)');
const adminSrc = SRC('src/api-admin.ts');
const adminNoC = strip(adminSrc);
const insIdx = adminNoC.indexOf("INSERT INTO leveltest_applications (student_name, student_uid, status, ai_score, final_level, source");
ok(insIdx > 0, 'AI 진단 INSERT 문을 찾았다 (전제)');
if (insIdx > 0) {
  const around = adminNoC.slice(Math.max(0, insIdx - 1200), insIdx + 600);
  // 🔴 «status 를 하드코딩하지 않는가» — 'pending' 리터럴이면 판정이 아무 일도 안 한다
  ok(!/VALUES \(\?, \?, 'pending'/.test(around), "status 를 'pending' 으로 하드코딩하지 않는다");
  ok(/leveltestStatusFor\s*\(/.test(around), '판정 정본 leveltestStatusFor 를 부른다');
  ok(/resolveStudentTrack\s*\(/.test(around), '유형 판정 resolveStudentTrack 을 부른다');
  // «부르기만» 하면 안 된다 — 그 결과가 바인드에 실려야 한다
  const args = bindArgs(around, around.indexOf('INSERT INTO leveltest_applications'));
  ok(args != null, '.bind(…) 인자 목록을 괄호 짝으로 잘라 냈다 (전제)');
  ok(args != null && /\bappStatus\b/.test(args), '그 결과(appStatus)를 INSERT 에 실제로 넘긴다');
  // «짝» — 넘기기만 하고 그 자리에 'pending' 을 또 적으면 판정이 무력해진다
  ok(args != null && !/'pending'/.test(args), "그 인자 목록에 'pending' 을 다시 적지 않는다");
}
ok(/from '\.\/student-track'/.test(adminSrc), 'student-track 정본을 import 한다 (판정 복제 금지)');

console.log('\n③-a 그 배선을 «실제로 돌려» 무엇이 쓰이는지 본다');
/* 🔴 «부르는가» · «이름이 바인드에 실렸는가» 까지만 물으면 아무것도 안 지켜집니다 —
   함정 대조 실측(2026-09-21): 다음 셋이 전부 통과했습니다.
     ⓐ `leveltestStatusFor(…) && 'pending'`  → 수리 통째 무력화
     ⓑ `(await resolveStudentTrack(…), { track:'ai_only' })` → 모든 진단이 ai_done
        (= «선생님 대기가 통째로 비는» 방향 — 이 파일이 막아야 한다고 못 박은 그 방향)
     ⓒ `resolveStudentTrack(env, authedUid || uid)` → 주석이 ⛔ 로 금지한 본문 uid 폴백
   ✅ 그래서 블록을 중괄호 짝으로 오려 내 가짜 D1·가짜 판정으로 돌리고,
      «무엇이 바인드되는가» 와 «판정에 무엇을 넘기는가» 를 짝으로 묻습니다. */
const wireStart = adminSrc.indexOf('let authedUid');
let wireSrc = null;
if (wireStart > 0) {
  const ifAt = adminSrc.indexOf('if (appId != null)', wireStart);
  if (ifAt > 0) {
    let d = 0, end = -1, seen = false;
    for (let j = ifAt; j < adminSrc.length; j++) {
      const c = adminSrc[j];
      if (c === '{') { d++; seen = true; }
      else if (c === '}') {
        d--;
        if (seen && d === 0) {
          if (/^\s*else/.test(adminSrc.slice(j + 1, j + 10))) { seen = false; continue; }
          end = j + 1; break;
        }
      }
    }
    if (end > 0) wireSrc = adminSrc.slice(wireStart, end);
  }
}
ok(!!wireSrc, '전제: 진단 저장 배선 블록을 중괄호 짝으로 오려 냈다');
if (wireSrc) {
  const runWire = async (opts) => {
    const log = { trackArg: 'MISSING', bound: null, promoted: false };
    const body = wireSrc
      .replace(/:\s*string\s*\|\s*null/g, '')
      .replace(/\s+as\s+any\b/g, '')
      .replace(/\s+as\s+number\b/g, '')
      .replace(/catch\s*\(e:\s*any\)/g, 'catch (e)');
    const fakeDb = {
      prepare(sql) {
        return { bind(...args) {
          if (/INSERT INTO leveltest_applications/.test(sql)) log.bound = args;
          if (/SET status = 'pending'/.test(sql)) log.promoted = true;
          return { run: async () => ({ meta: { last_row_id: 99 } }) };
        } };
      }
    };
    const fn = new Function('env','request','url','b','uid','name','ai_score','level','now','appId',
      'authUidGlobal','resolveStudentTrack','leveltestStatusFor','console',
      'return (async () => {\n' + body + '\nreturn appId; })();');
    await fn(
      { DB: fakeDb }, {}, {}, opts.body, opts.body && opts.body.student_uid, 'n', 40, 'A2', 1,
      (opts.appId === undefined ? null : opts.appId),
      async () => opts.authedUid,
      async (_env, id) => { log.trackArg = (id === undefined ? 'MISSING' : id); return { track: opts.track, live_count: 0 }; },
      (t) => (t === 'ai_only' ? 'ai_done' : 'pending'),
      { warn() {} }
    );
    return log;
  };
  const r1 = await runWire({ authedUid: 'stuA', track: 'live_ai', body: { student_uid: 'stuA' } });
  ok(r1.bound && r1.bound[2] === 'pending', `화상수업 학생 → INSERT 에 'pending' 이 바인드된다 (${r1.bound && r1.bound[2]})`);
  const r2 = await runWire({ authedUid: 'stuB', track: 'ai_only', body: { student_uid: 'stuB' } });
  ok(r2.bound && r2.bound[2] === 'ai_done', `짝: AI 전용 학생 → 'ai_done' 이 바인드된다 (${r2.bound && r2.bound[2]})`);
  const r3 = await runWire({ authedUid: null, track: 'unknown', body: { student_uid: 'bodyUid' } });
  ok(r3.bound && r3.bound[2] === 'pending', `짝: 몰라도 'pending' 이다 (${r3.bound && r3.bound[2]})`);
  ok(r3.trackArg === null, `토큰을 못 확인했으면 판정에 null 을 넘긴다 — 본문 uid 폴백 없음 (넘긴 값: ${JSON.stringify(r3.trackArg)})`);
  const r4 = await runWire({ authedUid: 'stuC', track: 'live_ai', body: { student_uid: 'stuC' }, appId: 7 });
  ok(r4.promoted === true, '기존 건 재진단 + 화상수업 학생 → ai_done → pending 되돌리기가 실제로 돈다');
  const r5 = await runWire({ authedUid: 'stuD', track: 'ai_only', body: { student_uid: 'stuD' }, appId: 8 });
  ok(r5.promoted === false, '짝: AI 전용이면 되돌리기를 안 돌린다');
}

console.log('\n③-b 재진단했을 때 «ai_done → pending» 은 되돌리고 반대는 안 하는가');
/* 윗줄 UPDATE 는 status 를 안 건드린다 — 그래서 AI 전용이다가 화상수업을 시작한
   학생의 건이 «ai_done» 에 굳어 선생님 목록에 영영 안 뜨는 길이 남는다.
   ⚠️ «되돌린다» 만 물으면 «언제나 pending 으로 덮기» 도 통과한다 — 짝을 둘다. */
const promoIdx = adminNoC.indexOf("SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'ai_done'");
ok(promoIdx > 0, "ai_done → pending 되돌리기 UPDATE 가 있다");
if (promoIdx > 0) {
  const pre = adminNoC.slice(Math.max(0, promoIdx - 400), promoIdx);
  ok(/appStatus === 'pending'/.test(pre), "그 되돌리기는 판정 결과(appStatus)가 pending 일 때만 돈다");
  // 짝: 반대 방향(pending → ai_done) UPDATE 는 없어야 한다
  ok(!/SET status = 'ai_done'/.test(adminNoC), "짝: pending → ai_done 으로 덮는 UPDATE 는 없다");
}
/* 진짜 SQLite 로 «그 UPDATE 가 누구를 건드리는가» 를 실제로 돌린다 */
if (sqliteOk && promoIdx > 0) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db2 = new DatabaseSync(':memory:');
    db2.exec(`CREATE TABLE leveltest_applications (id INTEGER PRIMARY KEY, status TEXT, updated_at INTEGER)`);
    db2.exec(`INSERT INTO leveltest_applications VALUES (1,'ai_done',0),(2,'pending',0),(3,'done',0),(4,'confirmed',0)`);
    const up = db2.prepare(`UPDATE leveltest_applications SET status = 'pending', updated_at = ? WHERE id = ? AND status = 'ai_done'`);
    for (const i of [1,2,3,4]) up.run(1, i);
    const g = (i) => db2.prepare('SELECT status FROM leveltest_applications WHERE id = ?').get(i).status;
    ok(g(1) === 'pending', 'ai_done 건은 pending 으로 돌아온다');
    ok(g(3) === 'done', '짝: 사람이 끝낸 건(done)은 안 건드린다');
    ok(g(4) === 'confirmed', '짝: confirmed 도 안 건드린다');
  } catch (e) { console.log('  ⏭ ③-b SQLite 건너뜀 (' + e.message + ')'); }
}

console.log('\n③-c 새 상태를 «읽는 옆 자리» 들이 함께 알고 있는가');
/* 상태값을 하나 늘리면 «그 칸을 보는 다른 곳» 이 함께 걸립니다(CLAUDE.md
   「새 기입이 «상태를 하나 더» 만들었는데 옛 정지 경로가 그것을 모름」). */
ok(/status IN \('pending','proposed','ai_done'\)/.test(adminNoC),
   '관리자가 수업을 잡으면 ai_done 건도 confirmed 로 올라간다');
/* 짝: «처리 대기 N건» 배지는 여전히 pending 만 센다 — 그것이 이 수리의 목적이다.
   여기에 ai_done 을 넣으면 고치려던 그 대기가 그대로 돌아옵니다. */
ok(/COUNT\(\*\) AS n FROM leveltest_applications WHERE status = 'pending'/.test(adminNoC),
   "짝: «처리 대기» 건수는 pending 만 센다(ai_done 은 안 센다)");

console.log('\n④ 재시험이 옛 ai_done 건을 다시 찾는가 (안 찾으면 행이 계속 쌓인다)');
const reQ = adminNoC.match(/SELECT id FROM leveltest_applications WHERE status[^`]*/g) || [];
ok(reQ.length >= 2, `진단 재매칭 조회 ${reQ.length}개를 찾았다 (전제)`);
ok(reQ.length > 0 && reQ.every(q => /IN\s*\('pending'\s*,\s*'ai_done'\)/.test(q)),
   '두 조회 모두 pending 과 ai_done 을 함께 찾는다');

console.log('\n⑤ 상태 맵 «전부» 가 새 상태를 아는가 (모르면 «ai_done» 이 날것으로 뜬다)');
/* 🔴 처음엔 이 절이 「화면 «두 곳»」이었고, 그래서 강사 마이페이지(admin/mypage.html)가
   같은 API 를 부르면서 자기 STMAP 에 ai_done 이 없는 것을 구조적으로 감쌌습니다
   (2026-09-21 함정 대조가 잡음 — 「같은 판정이 두 곳이면 한쪽만 고쳐집니다」).
   ⛔ 화면을 손으로 적지 마세요 — 새 화면이 생기면 조용히 빠집니다.
   ✅ 「그 API 를 부르는 파일」을 훑어 «전부» 가 아는지 봅니다. */
const STATUS_SCREENS = [
  ['public/js/adm-core.js',        '관리자 레벨테스트 표'],
  ['public/parent.html',           '학부모 대시보드'],
  ['public/admin/mypage.html',     '강사 마이페이지'],
  ['public/t.html',                '신청자 티켓 화면'],
];
for (const [f, label] of STATUS_SCREENS) {
  let src = '';
  try { src = SRC(f); } catch (e) { /* 파일이 사라졌으면 아래에서 FAIL */ }
  ok(!!src, `전제: ${label}(${f}) 을 읽었다`);
  if (src) ok(/\bai_done\s*:/.test(strip(src)), `${label} 의 상태 맵이 ai_done 을 안다`);
}
/* 짝: 옛 상태가 사라지지 않았는가 — 없으면 «전부 갈아치우기» 도 통과합니다 */
for (const [f, label] of STATUS_SCREENS) {
  let src = ''; try { src = SRC(f); } catch (e) {}
  if (src) ok(/\bpending\s*:/.test(strip(src)), `짝: ${label} 에 옛 상태(pending)도 그대로 있다`);
}

const admCore = SRC('public/js/adm-core.js');
const stmap = admCore.slice(admCore.indexOf('const STMAP'), admCore.indexOf('const STMAP') + 900);
ok(/ai_done\s*:\s*\[/.test(stmap), '관리자 STMAP 에 ai_done 이 있다');
const parentHtml = SRC('public/parent.html');
const stIdx = parentHtml.indexOf('const ST = {');
const stBlk = stIdx > 0 ? parentHtml.slice(stIdx, stIdx + 1200) : '';
ok(/ai_done\s*:\s*\[/.test(stBlk), '학부모 화면 ST 에 ai_done 이 있다');

console.log('\n⑤-c 관리자 상태 필터에서 «골라 볼» 수 있는가');
/* 기본값이 «상태 전체» 라 목록에는 나오지만, 옵션이 없으면 골라 볼 길이 없다.
   필터는 `String(a.status) === fs` 정확일치라 value 가 서버 값과 «글자까지» 같아야 한다. */
const admHtml = SRC('public/admin.html');
const selIdx = admHtml.indexOf('id="lt-apps-status"');
ok(selIdx > 0, '전제: 레벨테스트 상태 필터 <select> 를 찾았다');
if (selIdx > 0) {
  const sel = admHtml.slice(selIdx, admHtml.indexOf('</select>', selIdx));
  ok(/value="ai_done"/.test(sel), '상태 필터에 ai_done 옵션이 있다');
  ok(/value="pending"/.test(sel), '짝: 옛 옵션(pending)도 그대로 있다');
}

console.log('\n⑤-b 강사 마이페이지도 «누가 정한 레벨인지» 말하는가');
/* 하필 선생님이 «직접 평가를 매기는» 화면이라 그 구분이 가장 필요한 자리다. */
const myp = SRC('public/admin/mypage.html');
const mypCell = (() => {
  const i2 = myp.indexOf("a.final_level?('<b style=\"color:#34d399\"");
  if (i2 < 0) return null;
  const e2 = myp.indexOf('\n', i2);
  return e2 < 0 ? null : myp.slice(i2, e2);
})();
ok(!!mypCell, '전제: 강사 마이페이지의 레벨 칸을 오려 냈다');
if (mypCell) {
  const m2 = mypCell.match(/a\.teacher_score\s*!=\s*null/);
  ok(!!m2, '강사 마이페이지: teacher_score 로 «선생님 확정 / AI 자동» 을 가른다');
  /* 짝: 0점도 «선생님이 매긴 것» 이어야 한다(|| 함정) — 식을 실제로 평가 */
  if (m2) {
    const f2 = new Function('a', 'return ' + m2[0] + ';');
    ok(f2({ teacher_score: 0 }) === true, '짝: 0점도 «선생님이 매긴 것» 이다');
    ok(f2({ teacher_score: null }) === false, '짝: 없으면 «AI 자동»');
  }
  ok(/선생님 확정/.test(mypCell) && /AI 자동/.test(mypCell), '두 문구가 그 칸에 실제로 들어 있다');
}

console.log('\n⑥ 레벨 표시가 «AI 자동» 과 «선생님 확정» 을 가르는가 — 식을 오려 내 평가');
// 관리자
const admExpr = admCore.match(/const _lvByTeacher = ([^;]+);/);
ok(!!admExpr, '관리자 판정식을 찾았다 (전제)');
if (admExpr) {
  const f = new Function('a', 'return ' + admExpr[1] + ';');
  ok(f({ teacher_score: 80 }) === true, '관리자: 선생님 점수가 있으면 «선생님 확정»');
  ok(f({ teacher_score: null }) === false, '짝: 선생님 점수가 없으면 «AI 자동»');
  ok(f({ teacher_score: 0 }) === true, '0점도 «선생님이 매긴 것» 이다 (|| 함정 회피)');
}
// 학부모
const pExpr = parentHtml.match(/var _lvByT = ([^;]+);/);
ok(!!pExpr, '학부모 판정식을 찾았다 (전제)');
if (pExpr) {
  const f2 = new Function('a', 'return ' + pExpr[1] + ';');
  ok(f2({ teacher_score: 72 }) === true, '학부모: 선생님 점수가 있으면 «최종 레벨»');
  ok(f2({ teacher_score: null }) === false, '짝: 없으면 «AI 추정 레벨»');
  ok(f2({ teacher_score: 0 }) === true, '학부모: 0점도 선생님이 매긴 것');
}
ok(/AI 추정 레벨/.test(parentHtml), '학부모 화면에 «AI 추정 레벨» 문구가 있다');
ok(/최종 레벨/.test(parentHtml), '짝: «최종 레벨» 문구도 남아 있다 (선생님 확정 건)');

console.log('\n⑦ 학생이 보는 결과 화면도 «다음 단계» 를 사실대로 말하는가');
/* [왜 이 절이 생겼나 — 2026-09-22]
   2026-09-21 에 상태(ai_done)와 «관리자·학부모·강사·티켓» 넷은 갈랐는데, 정작 **학생이 보는
   결과 화면**(level-test-ai.html)은 모든 학생에게 「선생님 1:1 평가 후 최종 레벨·확정 교재가
   학부모님 문자로 안내됩니다」라고 말하고 있었다 — AI 학습만 하는 학생에게는 그 단계가 없어
   **오지 않을 문자를 기다리게** 하는 거짓말이다. 화면이 유형을 알려면 서버가 실어 줘야 한다. */
const ltHtml = SRC('public/level-test-ai.html');

// ⓐ 서버가 유형을 실어 주는가 — 그리고 예약 수까지 흘리지는 않는가(짝)
const diagRet = (adminSrc.match(/return json\(\{ ok: true, ai_score[^\n]*\);/) || [])[0] || '';
ok(!!diagRet, '전제: 진단 응답 줄을 오려 냈다');
ok(/\btrack:\s*trackInfo\.track\b/.test(diagRet), '서버가 응답에 track 을 싣는다');
ok(!/live_count/.test(diagRet), '짝: 예약 수(live_count)는 싣지 않는다 — 화면이 쓸 일이 없다');

// ⓑ 화면이 그 값을 «실제로 써서» 문구를 가르는가 — 절을 오려 내 가짜 DOM 으로 돌린다
const trAt = ltHtml.indexOf("var track = d.track || 'unknown';");
const trEnd = ltHtml.indexOf('var bk = d.breakdown', trAt);
const trBlk = (trAt >= 0 && trEnd > trAt) ? ltHtml.slice(trAt, trEnd) : null;
ok(!!trBlk, '전제: 학생 화면의 유형 분기를 오려 냈다');
if (trBlk) {
  /* ⛔ 「그 글자가 있는가」로 묻지 말 것 — `if (false && ...)` 한 글자에 뚫린다. 실제로 돌려
     «무슨 글자가 화면에 들어가는가» 를 답으로 본다. */
  const runBranch = (track) => {
    const els = {
      'ai-next-step': { innerHTML: '[기본:선생님평가]' },
      'ai-final-note': { innerHTML: '[기본:참고용]' },
    };
    const $ = (id) => els[id] || null;
    try { new Function('$', 'd', trBlk)($, { track }); } catch (e) { return { err: String(e && e.message) }; }
    return { step: els['ai-next-step'].innerHTML, note: els['ai-final-note'].innerHTML };
  };
  const onlyR = runBranch('ai_only');
  const liveR = runBranch('live_ai');
  const unkR = runBranch('unknown');
  ok(!onlyR.err && !liveR.err && !unkR.err, '분기를 실제로 돌렸다', onlyR.err || liveR.err || unkR.err);
  // AI 전용: 「선생님 단계가 없다」고 말해야 한다
  ok(/선생님 1:1 평가 단계가 없어요/.test(onlyR.step || ''),
     'AI 전용: 「선생님 1:1 평가 단계가 없어요」라고 말한다', '실제: ' + (onlyR.step || '').slice(0, 60));
  ok(!/문자로 안내/.test(onlyR.step || ''),
     '짝: AI 전용에게 «오지 않을 문자» 를 약속하지 않는다', '실제: ' + (onlyR.step || '').slice(0, 60));
  ok(/화상수업/.test(onlyR.step || ''), 'AI 전용: 되돌리는 길(화상수업 시작)을 함께 말한다');
  // 짝 — 모르면 예전 그대로여야 한다(한쪽만 보면 «전부 바꾸기» 도 통과한다)
  ok(liveR.step === '[기본:선생님평가]' && liveR.note === '[기본:참고용]',
     '짝: 화상수업 학생(live_ai)의 문구는 한 글자도 안 바뀐다');
  ok(unkR.step === '[기본:선생님평가]' && unkR.note === '[기본:참고용]',
     '짝: 유형을 모르면(unknown) 예전 문구 그대로다');
}

// ⓒ 「발음 평가까지 합쳐 최종 레벨이 확정된다」는 사실이 아니다
/* [잰 것 — 2026-09-22] voice_coaching 을 읽는 곳은 관리자 화면의 «보여주기»(오버레이)뿐이고
   final_level 을 바꾸는 코드는 0곳이다. 선생님이 그 점수를 «참고» 할 수는 있지만 «합쳐서 확정»
   은 지금 일어나지 않는다 — 화면이 하지 않는 일을 약속하면 안 된다. */
const noteBlk = (ltHtml.match(/<p id="ai-final-note"[\s\S]*?<\/p>/) || [])[0] || '';
ok(!!noteBlk, '전제: 결과 화면 맨 아래 안내를 오려 냈다');
/* ⛔ 태그가 낀 원문으로 부정 검사를 하지 말 것 — 「발음 평가</b>까지 합쳐」처럼 사이에
   태그가 들어가면 정규식이 그것을 못 넘어 **거짓 문구를 되돌려도 통과한다**
   (2026-09-22 변이시험 Ⓖ에서 실제로 0건 검출이었다). 태그를 벗긴 «사람이 읽는 글자» 로 본다. */
const noteText = noteBlk.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
ok(noteText.length > 10, '전제: 태그를 벗긴 글자가 남았다', '실제: ' + noteText);
ok(!/까지 합쳐/.test(noteText),
   '「발음 평가까지 합쳐 최종 레벨이 확정」이라고 말하지 않는다', '실제: ' + noteText);
ok(/발음 평가/.test(noteText), '짝: 발음 평가를 «없는 것» 취급하지도 않는다(선생님이 참고한다)');
ok(/추정/.test(noteText), '이 레벨이 «추정» 값임을 말한다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
