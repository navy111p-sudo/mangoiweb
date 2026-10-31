// 🔴 「예약 기준 지금 수업」에 수강신청 수업도 뜨는가 — 2026-09-01
//
// [무엇이 문제였나]
//   /api/admin/classes-now 는 `attendance` 의 `room_id LIKE 'c24-%'` 씨앗만 읽었다.
//   그래서 수강신청 확정으로 만든 망고아이 수업(class_schedules, source='adm-enroll:*')은
//   카페24에 기록이 없어 **한 번도 뜬 적이 없다.** 실측(2026-09-01 21:52 KST) 그 시각
//   진행 중이던 망고아이 수업 8건이 전부 빠져 있었고, 위쪽 «화상방 접속» 목록은 사람이
//   실제로 붙어야 뜨므로 21:20 수업은 강사가 들어온 21:23 까지 어느 목록에도 없었다.
//   같은 시각 「오늘 수업」(classes/today)은 둘을 합쳐 보여 주고 있었다 — 두 화면이
//   서로 다른 말을 하고 있었던 것이다.
//
// [왜 문자열 검사만으로는 모자란가]
//   여기서 틀리는 것은 전부 «무슨 답이 나오는가» 다 — 요일 표기('Thu'·'목'·'1,3,5'),
//   자정을 넘는 창, 미러 중복. 함수도 값도 다 «있고» 답만 틀린다. 그래서 판정 정본
//   (src/classes-now.ts)을 **번들해 실제로 돌린다**(운영 DB 무접촉).
//
// 실행: node test-harness/classes_now_mangoi_harness.mjs
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = resolve(__dir, '..', 'cloudflare-deploy');
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const admin = rd('../cloudflare-deploy/src/api-admin.ts');
const mod = rd('../cloudflare-deploy/src/classes-now.ts');
const s1 = rd('../cloudflare-deploy/public/js/adm-s1.js');
const core = rd('../cloudflare-deploy/public/js/adm-core.js');
const ghost = rd('../cloudflare-deploy/public/admin/ghost-view.html');
/* 📦 (2026-09-02) 관제탑의 화면 코드는 인라인이 아니라 /js/monitor-wall.js 에 있다.
   한쪽만 읽으면 이 검사가 통째로 헛돈다(함수도 값도 «없다» 로 보인다) — 두 파일을 합쳐서 본다. */
const wall = rd('../cloudflare-deploy/public/admin/monitor-wall.html')
           + '\n' + rd('../cloudflare-deploy/public/js/monitor-wall.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* 부정 검사는 주석을 벗긴 사본으로 — 「왜 그렇게 안 했는지」 적어 둔 설명이 자기 검사에 걸린다.
   ⚠️ 블록주석을 정규식 한 줄로 지우지 말 것(문자열 안의 별표+슬래시 하나에 뒤가 통째로 사라진다). */
function stripComments(src) {
  const out = []; let inBlock = false;
  for (const line of String(src).split('\n')) {
    let res = '';
    for (let i = 0; i < line.length; i++) {
      if (inBlock) { if (line[i] === '*' && line[i + 1] === '/') { inBlock = false; i++; } continue; }
      if (line[i] === '/' && line[i + 1] === '*') { inBlock = true; i++; continue; }
      if (line[i] === '/' && line[i + 1] === '/') break;
      res += line[i];
    }
    out.push(res);
  }
  return out.join('\n');
}
/** 중괄호 짝으로 블록을 자른다 — 길이(slice)로 자르면 옆 함수가 딸려 들어온다. */
function blockAt(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const open = src.indexOf('{', i); if (open < 0) return '';
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return '';
}

/* ═══ ⓪ 판정 정본이 있고 핸들러가 그것을 쓴다 ═══════════════════════════════ */
console.log('\n⓪ 판정 정본 배선');
check('src/classes-now.ts 가 있다', mod.length > 500);
check('classes-now 핸들러가 정본을 import 한다',
  /import\s*\{[^}]*buildMangoiClassesNow[^}]*\}\s*from\s*'\.\/classes-now'/.test(admin));

const handler = blockAt(admin, "if (method === 'GET' && path === '/api/admin/classes-now')");
check('classes-now 핸들러를 중괄호 짝으로 잘라 냈다', handler.length > 1000);
const hStrip = stripComments(handler);
check('핸들러가 class_schedules 를 읽는다', /FROM class_schedules/.test(hStrip));
check('핸들러가 카페24 씨앗도 그대로 읽는다', /room_id LIKE 'c24-%'/.test(hStrip));
check('두 갈래를 mergeClassesNow 로 합친다', /mergeClassesNow\(/.test(hStrip));
/* ⛔ 요일을 Number() 로 비교하면 반복수업이 통째로 사라진다 — 정본 파서를 주입해야 한다 */
check('요일 판정은 정본 admDowMatches 를 주입해 쓴다', /dowMatches:\s*admDowMatches/.test(hStrip));
check('요일 파서를 이 파일에서 새로 만들지 않았다', !/DOW_MAP/.test(stripComments(mod)));
/* 🔒 강사 차단 — 전사 학생 이름이 한 화면에 모인다 */
check('강사에게는 닫혀 있다(forbidden_teacher)', /isTeacher\)\s*return json\(\s*(?:\{\s*ok:\s*false,\s*error:\s*'forbidden_teacher'|forbiddenTeacherBody\()/.test(hStrip));
/* 🔒 지사·대리점 격리 — 새로 넣은 class_schedules 조회에도 스코프가 걸려야 한다 */
const schedSql = (hStrip.match(/SELECT cs\.id[\s\S]*?`\s*\)\s*\.bind\(\.\.\.stu\.binds\)/) || [])[0] || '';
check('class_schedules 조회에 스코프 조건이 붙어 있다',
  /\$\{stu\.cond \? `AND \(\$\{stu\.cond\}\)` : ''\}/.test(schedSql), schedSql.slice(-200));
check('그 조회는 students_erp 를 별칭 se 로 조인한다(스코프가 읽는 별칭)',
  /LEFT JOIN students_erp se ON se\.user_id = cs\.user_id/.test(schedSql));

/* ═══ ① 정본을 번들해 실제로 돌린다 ═══════════════════════════════════════ */
console.log('\n① 판정 정본 실행 — 수강신청 수업이 창에 걸리는가');
let esbuildApi = null;
try { esbuildApi = createRequire(join(CF, 'package.json'))('esbuild'); } catch { /* 미설치 */ }

let M = null;
if (!esbuildApi) {
  console.log('  ⏭ esbuild 없음 — 실행 검증 건너뜀 (정적 검사만 유효)');
} else {
  const out = join(mkdtempSync(join(tmpdir(), 'cnow-')), 'cn.mjs');
  let ok = true;
  try {
    esbuildApi.buildSync({ entryPoints: [join(CF, 'src', 'classes-now.ts')], bundle: true, format: 'esm',
      platform: 'neutral', outfile: out, logLevel: 'silent' });
  } catch { ok = false; }
  check('classes-now.ts 를 번들해 실제로 돌릴 수 있다', ok);
  if (ok) M = await import('file://' + out.replace(/\\/g, '/'));
}

// 정본 요일 파서를 소스에서 오려 내 주입한다(복제 금지 — 두 판정이 갈리면 화면끼리 말이 달라진다)
let dowMatches = null;
if (esbuildApi) {
  const admMap = (admin.match(/const ADM_DOW_MAP[\s\S]*?\n\};/) || [])[0] || '';
  const admFn = blockAt(admin, 'function admDowMatches');
  check('admDowMatches 를 소스에서 찾았다', admFn.length > 50 && admMap.length > 50);
  if (admFn && admMap) {
    const js = esbuildApi.transformSync(admMap + '\n' + admFn + '\nexport { admDowMatches };',
      { loader: 'ts', format: 'esm' }).code;
    dowMatches = (await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))).admDowMatches;
  }
}

const MIN = 60000;
const KST9 = 9 * 3600 * 1000;
/** KST 벽시계 → UTC ms */
const kst = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi, 0) - KST9;

if (M && dowMatches) {
  const W = (now) => ({ now, graceMs: 5 * MIN, aheadMs: 15 * MIN });
  const run = (rows, now, deps = {}) => M.buildMangoiClassesNow(rows, W(now), { dowMatches, ...deps });

  /* 🎯 실사고 재현 — 2026-09-01(화) 21:20~21:40, 최윤서 / 강사 JANE, 예약 id 1086 */
  const yunseo = {
    id: 1086, user_id: 'cys01', student_name: '최윤서', scheduled_date: '2026-09-01',
    start_time: '21:20', duration_min: 20, teacher_id: '6', t_name: 'JANE',
    source: 'adm-enroll:91', notes: '수강신청 확정 자동생성 · JANE · 화목 · 정규수업',
  };
  const at = (h, mi) => kst(2026, 9, 1, h, mi);

  const r2120 = run([yunseo], at(21, 20));
  check('수업 시작 시각에 목록에 있다', r2120.length === 1 && r2120[0].student_name === '최윤서', r2120);
  check('방 번호가 결정론적이다 (class-1086-20260901)',
    r2120[0] && r2120[0].room_id === 'class-1086-20260901', r2120[0] && r2120[0].room_id);
  /* 🔴 이 한 줄이 이번 사고의 핵심 — 아무도 안 붙은 시각에도 참관할 수 있어야 한다 */
  check('아무도 안 붙었어도 참관할 방이 있다 (observable)', r2120[0] && r2120[0].observable === true);
  check('접속 기록이 없으면 connected=false · live_room=null',
    r2120[0] && r2120[0].connected === false && r2120[0].live_room === null);
  check('시각 표기가 KST 다 (21:20~21:40)',
    r2120[0] && r2120[0].start_kst === '21:20' && r2120[0].end_kst === '21:40',
    r2120[0] && [r2120[0].start_kst, r2120[0].end_kst]);

  check('시작 10분 전에는 «곧 시작» 으로 이미 보인다',
    (run([yunseo], at(21, 10))[0] || {}).phase === 'soon');
  check('진행 중에는 phase=now', (run([yunseo], at(21, 30))[0] || {}).phase === 'now');
  check('끝난 직후 5분은 «방금 끝남» 으로 남는다', (run([yunseo], at(21, 43))[0] || {}).phase === 'ended');
  check('끝난 지 오래면 목록에서 빠진다', run([yunseo], at(21, 50)).length === 0);
  check('16분 뒤 시작하는 수업은 아직 안 나온다', run([yunseo], at(21, 4)).length === 0);
  check('15분 뒤 시작하는 수업은 나온다', run([yunseo], at(21, 5)).length === 1);

  /* 실제 접속 기록이 있으면 그 방을 잡는다 — 이름 추측 없이 방 번호로만 */
  const live = [{ room_id: 'class-1086-20260901', joined_at: at(21, 23), left_at: null, last_seen_at: at(21, 39) }];
  const rc = run([yunseo], at(21, 30), { liveRows: live });
  check('그 방에 붙은 기록이 있으면 connected=true', rc[0] && rc[0].connected === true);
  check('그때 live_room 은 그 방이다', rc[0] && rc[0].live_room === 'class-1086-20260901');
  const rOther = run([yunseo], at(21, 30), { liveRows: [{ room_id: 'class-999-20260901', joined_at: at(21, 23), last_seen_at: at(21, 39) }] });
  check('남의 방 접속을 내 수업으로 잇지 않는다', rOther[0] && rOther[0].connected === false);

  /* ── 요일 표기 — 반복수업. 2026-09-01 은 화요일(2) ─────────────────────── */
  console.log('\n② 요일 표기 (반복수업) — 운영 값에 섞여 있는 모양 그대로');
  const rec = (dow) => ({ id: 7, user_id: 'u1', student_name: '홍길동', day_of_week: dow, start_time: '21:20', duration_min: 20 });
  for (const [label, dow, want] of [
    ['숫자 2 (화)', 2, true], ['숫자 4 (목)', 4, false],
    ["영어 'Tue'", 'Tue', true], ["영어 'tuesday'", 'tuesday', true], ["영어 'Thu'", 'Thu', false],
    ["한글 '화'", '화', true], ["한글 '화요일'", '화요일', true], ["한글 '목'", '목', false],
    ["나열 '2,4,6'", '2,4,6', true], ["나열 '1,3,5'", '1,3,5', false],
    ["나열 'Mon,Tue'", 'Mon,Tue', true], ["나열 'Mon,Thu'", 'Mon,Thu', false],
  ]) {
    check(`반복수업 ${label} → ${want ? '나온다' : '안 나온다'}`,
      (run([rec(dow)], at(21, 30)).length > 0) === want);
  }

  /* ── 자정을 넘는 창 ───────────────────────────────────────────────────── */
  console.log('\n③ 자정 넘김 — 하루만 보면 조용히 사라진다');
  const nextDay = { id: 11, user_id: 'u2', student_name: '내일학생', scheduled_date: '2026-09-02', start_time: '00:05', duration_min: 20 };
  check('23:55 에 다음 날 00:05 수업이 «곧 시작» 으로 보인다',
    (run([nextDay], kst(2026, 9, 1, 23, 55))[0] || {}).phase === 'soon');
  const lateNight = { id: 12, user_id: 'u3', student_name: '어제학생', scheduled_date: '2026-09-01', start_time: '23:40', duration_min: 20 };
  check('00:03 에 어제 23:40~00:00 수업이 «방금 끝남» 으로 남는다',
    (run([lateNight], kst(2026, 9, 2, 0, 3))[0] || {}).phase === 'ended');
  check('자정 근처가 아니면 날짜를 하나만 훑는다',
    M.classesNowScanDates(W(at(21, 30))).length === 1);
  check('자정 근처에서는 두 날짜를 훑는다',
    M.classesNowScanDates(W(kst(2026, 9, 1, 23, 55))).length === 2);

  /* ── 자리표시 · 대체강사 · 미러 중복 ───────────────────────────────────── */
  console.log('\n④ 자리표시 · 대체강사 · 미러 중복');
  const ph = (uid) => ({ id: 13, user_id: uid, student_name: null, scheduled_date: '2026-09-01', start_time: '21:20', duration_min: 20 });
  check("옛 LMS 자리표시(user_id='lms')는 수업이 아니다", run([ph('lms')], at(21, 30)).length === 0);
  check("시연 시드(user_id='type_seed')도 수업이 아니다", run([ph('type_seed')], at(21, 30)).length === 0);
  check('대문자 LMS 도 자리표시로 본다', run([ph('LMS')], at(21, 30)).length === 0);

  const sub = run([yunseo], at(21, 30), { subName: (d, id) => (d === '2026-09-01' && String(id) === '1086') ? 'KES' : undefined });
  check('대체강사가 배정된 회차는 대체강사 이름이 나온다', sub[0] && sub[0].teacher_name === 'KES');
  check('원래 강사는 substituted_from 에 남는다', sub[0] && sub[0].substituted_from === 'JANE');
  check('배정이 없으면 원래 강사 그대로', r2120[0] && r2120[0].teacher_name === 'JANE' && r2120[0].substituted === false);

  // 🪞 미러가 만든 행은 notes 에 c24:<번호> — 같은 수업이 카페24 줄로도 온다
  const mirrored = { id: 21, user_id: 'u9', student_name: '미러학생', scheduled_date: '2026-09-01',
    start_time: '21:20', duration_min: 20, source: 'c24-mirror', notes: 'c24:511923' };
  const mg = run([mirrored], at(21, 30));
  const c24 = [
    { room_id: 'c24-511923', start_ms: at(21, 20), end_ms: at(21, 40), source: 'cafe24', observable: false, phase: 'now', connected: false, live_room: null, student_name: '미러학생', teacher_name: null },
    { room_id: 'c24-999999', start_ms: at(21, 30), end_ms: at(21, 50), source: 'cafe24', observable: false, phase: 'now', connected: false, live_room: null, student_name: '남학생', teacher_name: null },
  ];
  const merged = M.mergeClassesNow(c24, mg);
  check('미러된 수업은 카페24 줄이 빠지고 망고아이 줄만 남는다',
    merged.length === 2 && !merged.some(c => c.room_id === 'c24-511923')
      && merged.some(c => c.room_id === 'class-21-20260901'), merged.map(c => c.room_id));
  check('미러가 아닌 카페24 수업은 그대로 남는다', merged.some(c => c.room_id === 'c24-999999'));
  check('합친 목록은 시작 시각 순이다', merged[0].start_ms <= merged[1].start_ms);
  check('카페24 줄에는 참관할 방이 없다(observable=false)',
    merged.filter(c => c.source === 'cafe24').every(c => c.observable === false));

  /* ── 여러 건이 같이 도는 시각 (실측 재현) ───────────────────────────────── */
  console.log('\n⑤ 실측 재현 — 2026-09-01 밤에 빠져 있던 망고아이 수업들');
  const eight = [
    [972, '김수희', '21:10'], [988, '이수현', '21:50'], [996, '김사랑', '21:50'], [1008, '김연숙', '21:10'],
    [1070, '박주형', '21:10'], [1078, '김선우', '21:20'], [1086, '최윤서', '21:20'], [1094, '지승연', '21:00'],
  ].map(([id, nm, st]) => ({ id, user_id: 'u' + id, student_name: nm, scheduled_date: '2026-09-01', start_time: st, duration_min: 20 }));
  /* 21:30 — 최윤서(21:20~21:40)·김선우(21:20~21:40)가 진행 중이고, 21:50 두 건은 «곧 시작».
     수리 전에는 이 시각에 여덟 건이 **한 줄도** 안 나왔다. */
  const g30 = run(eight, at(21, 30));
  const n30 = g30.map(c => c.student_name);
  check('21:30 — 진행 중이던 최윤서가 목록에 있다', n30.includes('최윤서'), n30);
  check('21:30 — 같은 시각 진행 중인 김선우도 있다', n30.includes('김선우'), n30);
  check('21:30 — 20분 뒤 시작하는 이수현은 아직 안 나온다', !n30.includes('이수현'), n30);
  check('21:30 — 이미 끝난 21:00 지승연은 빠진다', !n30.includes('지승연'), n30);
  /* 21:10~21:30 세 건은 «막 끝난» 것이라 아직 남는다(끝시각이 곧 지금) — 그것까지 5건.
     ⛔ 이 숫자를 «2건» 으로 적어 두면 정상 동작이 FAIL 로 나온다(처음에 그렇게 적었다가 잡혔다). */
  check('21:30 — 창에 걸리는 다섯 건만 나온다', g30.length === 5, n30);
  check('21:30 — 막 끝난 21:10 수업들은 아직 남는다',
    ['김수희', '김연숙', '박주형'].every(n => n30.includes(n)), n30);

  /* 21:52 — 최윤서 수업은 21:40 에 끝나 «방금 끝남» 5분 창(21:45)도 지났다.
     ⛔ 그러니 이 목록에 없는 것이 «맞다» — 그때도 방에 남아 있던 사람은 위쪽
        «화상방 접속» 목록이 담당한다. 두 목록의 역할을 여기서 못 박아 둔다. */
  const n52 = run(eight, at(21, 52)).map(c => c.student_name);
  check('21:52 — 그때 시작한 이수현·김사랑이 나온다', n52.includes('이수현') && n52.includes('김사랑'), n52);
  check('21:52 — 12분 전에 끝난 최윤서는 예약 목록에서 빠진다(방 목록이 담당)',
    !n52.includes('최윤서'), n52);
  check('21:44 — 끝난 직후 5분 안이면 «방금 끝남» 으로 아직 보인다',
    run(eight, at(21, 44)).some(c => c.student_name === '최윤서' && c.phase === 'ended'));
}

/* ═══ ⑥ 화면 3곳 — 참관 버튼을 observable 로 가르는가 ═══════════════════════ */
console.log('\n⑥ 화면 배선 — 참관 버튼 판정');
for (const [nm, src] of [['adm-s1.js(수업 관찰 목록)', s1], ['ghost-view.html(수업 고르기)', ghost], ['monitor-wall.html(관제탑)', wall]]) {
  const t = stripComments(src);
  /* ⛔ live_room 하나로 가르면 «시작 직전 아무도 안 붙은 그 순간» 에 버튼이 사라진다 —
     정작 그때가 「왜 아직 아무도 안 들어왔지」 하고 봐야 할 시각이다. */
  check(nm + ' — 참관 방을 observable 로 가른다', /\.observable\s*\?/.test(t));
  check(nm + ' — 그때 room_id 를 쓴다', /observable\s*\?\s*\(?c\.room_id/.test(t));
  check(nm + ' — 카페24 줄은 live_room 일 때만 참관', /:\s*\(?c\.live_room/.test(t));
  check(nm + ' — 제목이 «카페24 전용» 이라고 말하지 않는다',
    !/예약 기준 지금 수업 \(카페24\)/.test(t));
}
/* 🔴 네 번째 화면 — 관리자 「실시간 수업 현황」 카드(adm-core.js `_schedRowsHtml`).
   이 카드도 classes-now 를 그대로 그린다. 한 곳만 고치면 「화면마다 답이 다른」 사고가 된다. */
{
  const t = stripComments(core);
  const sched = t.slice(t.indexOf('function _schedRowsHtml'), t.indexOf('async function loadActiveRooms'));
  check('adm-core.js(실시간 수업 현황) — 참관 방을 observable 로 가른다',
    /c\.observable\s*\?\s*\(c\.room_id/.test(sched));
  check('adm-core.js — 카페24 줄에는 참관할 방을 주지 않는다', /:\s*''/.test(sched));
  check('adm-core.js — 버튼은 표 위임(data-act) + rm-act 색 규칙을 쓴다(전역 파란 알약 회피)',
    /data-act="observe"/.test(sched) && /rm-act-observe/.test(sched));
  check('adm-core.js — 제목이 «카페24 전용» 이라고 말하지 않는다',
    !/예약 기준 지금 수업 \(카페24\)/.test(t));
  check('adm-core.js — 출처를 화면에 적는다(수강신청 / 카페24)',
    /수강신청/.test(sched) && /카페24/.test(sched));
}

/* 정적자산 캐시 — 고친 js 를 부르는 HTML 의 ?v= 가 함께 올라가야 한다
   (immutable 캐시라 안 올리면 옛 파일이 그대로 나온다 — CLAUDE.md 2장) */
const adminHtml = rd('../cloudflare-deploy/public/admin.html');
check('admin.html 의 adm-s1.js ?v= 가 8보다 크다',
  (Number((adminHtml.match(/adm-s1\.js\?v=(\d+)/) || [])[1]) || 0) > 8);
check('admin.html 의 adm-core.js ?v= 가 190보다 크다',
  (Number((adminHtml.match(/adm-core\.js\?v=(\d+)/) || [])[1]) || 0) > 190);

console.log(`\n${FAIL === 0 ? '✅' : '❌'} classes_now_mangoi_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:'); FAILS.forEach(f => console.log('  · ' + f)); process.exit(1); }
