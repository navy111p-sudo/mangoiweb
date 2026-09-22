// -*- coding: utf-8 -*-
/*
 * 📅 매니저 「오늘 전체 수업」 — 줄에서 바로 연기·변경·취소 (2026-09-22)
 *
 *   [왜 만들었나]
 *     매니저 요청으로 학생 이름 옆에 연기·변경 버튼을 붙였다. 그 길은 **새 판정을 만들지 않고**
 *     서버의 기존 두 경로(/schedule-requests + /decide, DELETE /class-schedules/:id)를 그대로
 *     쓰는데, 그러다 보니 «조용히 무너지면 아무도 모르는» 자리가 셋 생겼다.
 *
 *   [무엇을 못 박나]
 *     ① 🔴 카페24 미러 도장 — /decide 의 UPDATE 가 'c24-mirror:manual' 을 **같은 UPDATE 안에서**
 *        찍지 않으면, 야간 미러가 start_time 을 카페24 값으로 되돌린다.
 *        실측(2026-09-22): 앞으로 잡힌 수업 230건 중 **190건(83%)이 미러 행**이다.
 *        ⟹ 도장이 빠지면 매니저 이동의 대부분이 **밤사이 되돌아간다.**
 *     ② «누가 냈는가» — body 를 믿지 않고 서버 세션으로 확인한 관리자일 때만 'admin' 이다.
 *        (예전 코드는 값이 무엇이든 'teacher' 로 떨어뜨려 관리자가 한 일을 강사 탓으로 적었다.)
 *     ③ can_move — «여기서 옮길 수 있는 줄인가» 를 서버가 판정한다. 근거는 /decide 의
 *        `isDated` 와 **같은 칸(scheduled_date)** 이어야 한다. 어긋나면 화면은 «된다» 고 하고
 *        서버는 'recorded' 를 돌려준다. ⛔ schedule_kind 로 추측하면 안 된다 — 실측 값이
 *        one_off(2,196)·dated(72)·recurring(4) 으로 **셋**이라 `=== 'one_off'` 는 72건을 잘못 막는다.
 *
 *   ⚠️ 「그 글자가 있는가」로 묻지 않는다 — 조건을 뒤집어도 글자는 남는다.
 *      SQL 은 **진짜 SQLite 에 실제로 돌리고**, 판정식은 **오려 내 실행**한다.
 *   ℹ️ «무엇이 화면에 그려지는가» 는 여기서 못 본다 →
 *      test-harness/manual/manager-today-reschedule-browser.mjs (사람이 부른다)
 */
import { readFileSync } from 'node:fs';

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  건너뜀 — 이 node 에는 node:sqlite 가 없습니다(Node 22+ 필요)'); process.exit(0); }

const API = readFileSync(new URL('../cloudflare-deploy/src/api-admin.ts', import.meta.url), 'utf8');
const MGR = readFileSync(new URL('../cloudflare-deploy/public/manager.html', import.meta.url), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  OK   ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? ' — ' + extra : '')); }
};

/** 주석을 벗긴 사본 — 부정 검사가 «내가 적은 설명» 을 잡지 않게(CLAUDE.md 2장). */
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
const API_S = strip(API);

/** 중괄호 짝으로 블록을 자른다 — 길이로 자르면 옆 코드를 먹는다(CLAUDE.md 2장). */
function blockFrom(src, anchor) {
  const a = src.indexOf(anchor);
  if (a < 0) return '';
  const s = src.indexOf('{', a);
  if (s < 0) return '';
  let d = 0;
  for (let i = s; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(s, i + 1); }
  }
  return '';
}

/* ══════════════════════════════════════════════════════════════════════════
   ① 카페24 미러 도장 — **진짜 SQLite 에 실제로 돌려서** 확인한다
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n[①] /decide 가 옮길 때 «사람 손» 도장을 같은 UPDATE 안에서 찍는가');

const decideBlk = blockFrom(API, "path === '/api/admin/schedule-requests/decide'");
ok('전제 — /decide 라우트를 잘라 냈다', decideBlk.length > 500, decideBlk.length);

/* 그 안의 UPDATE 문 네 개(이동 미러/이동 일반/연기 미러/연기 일반)를 그대로 꺼낸다.
   ⛔ 하니스에 SQL 을 베껴 적지 말 것 — 소스가 바뀌면 그 복제가 조용히 낡는다. */
const updSqls = (decideBlk.match(/`UPDATE class_schedules SET [^`]+`/g) || []).map((x) => x.slice(1, -1));
ok('이동·연기 UPDATE 를 네 갈래로 꺼냈다 (미러/일반 × 이동/연기)', updSqls.length === 4, updSqls.length);

/* ⛔ 도장 값을 하니스에 베껴 적지 말 것 — 정본(c24-mirror.ts)에서 읽는다.
   ⚠️ 소스의 SQL 은 `${MIRROR_SOURCE_MANUAL}` 로 «상수 이름» 이 박혀 있다(문자열이 아니다).
      그러니 «이름» 으로 찾고, 진짜 SQLite 에 돌릴 때만 값으로 바꿔 넣는다. */
const MIR_SRC = readFileSync(new URL('../cloudflare-deploy/src/c24-mirror.ts', import.meta.url), 'utf8');
const mManual = MIR_SRC.match(/MIRROR_SOURCE_MANUAL\s*=\s*'([^']+)'/);
ok('전제 — 도장 값을 정본에서 읽었다', !!mManual, mManual && mManual[1]);
const MANUAL = mManual ? mManual[1] : '(?)';
const HOLDER = '${MIRROR_SOURCE_MANUAL}';
const fill = (q) => q.split(HOLDER).join(MANUAL);
const stamped = updSqls.filter((q) => q.indexOf(HOLDER) >= 0);
ok('도장을 찍는 갈래가 둘이다 (이동·연기)', stamped.length === 2, stamped.length);
// 짝 — 미러가 아닌 행은 source 를 건드리지 않는다(예전 동작 그대로)
ok('도장을 안 찍는 갈래도 둘 남아 있다 (짝)', updSqls.length - stamped.length === 2);
ok('도장은 «같은 UPDATE 안» 에 있다 (뒤에 따로 찍지 않는다)',
   stamped.length === 2 && stamped.every((q) => /^UPDATE class_schedules SET .*source = '/.test(q)));

// 진짜 SQLite 에 돌려 본다 — 문법이 성립하는가 + 실제로 값이 바뀌는가
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, scheduled_date TEXT, start_time TEXT,
         status TEXT, source TEXT, updated_at INTEGER)`);
db.exec(`INSERT INTO class_schedules VALUES (1,'2026-09-22','15:00','active','c24-mirror',0),
                                            (2,'2026-09-22','15:00','active','adm-enroll:99',0)`);
const moveMirror  = updSqls.find((q) => /scheduled_date/.test(q) && q.indexOf(HOLDER) >= 0);
const movePlain   = updSqls.find((q) => /scheduled_date/.test(q) && q.indexOf(HOLDER) < 0);
const postpMirror = updSqls.find((q) => /postponed/.test(q) && q.indexOf(HOLDER) >= 0);
ok('전제 — 네 갈래를 각각 찾았다', !!(moveMirror && movePlain && postpMirror));

let ran = true;
try {
  db.prepare(fill(moveMirror)).run('2026-09-25', '19:30', 1, 1);
  db.prepare(fill(movePlain)).run('2026-09-25', '19:30', 1, 2);
  db.prepare(fill(postpMirror)).run(1, 1);
} catch (e) { ran = false; ok('UPDATE 가 진짜 SQLite 에서 돈다', false, String(e.message)); }
if (ran) {
  ok('UPDATE 가 진짜 SQLite 에서 돈다', true);
  const r1 = db.prepare('SELECT source, start_time FROM class_schedules WHERE id=1').get();
  const r2 = db.prepare('SELECT source, start_time FROM class_schedules WHERE id=2').get();
  ok('미러 행은 «사람 손» 으로 도장이 바뀐다', r1.source === MANUAL, r1.source);
  ok('시각도 실제로 옮겨진다', r1.start_time === '19:30', r1.start_time);
  ok('연기 UPDATE 도 미러 행에 도장을 찍는다',
     db.prepare("SELECT status, source FROM class_schedules WHERE id=1").get().status === 'postponed');
  // 짝 — 없으면 «전부 도장 찍기» 도 통과한다
  ok('미러가 아닌 행의 source 는 그대로다 (짝)', r2.source === 'adm-enroll:99', r2.source);
}

/* 🪤 여기까지는 «SQL 이 옳은가» 뿐이다 — 그것만 물으면 **어느 갈래로 가는지 정하는 판정**을
      한 번도 안 본다. 변이시험 실측(2026-09-22): `_isMirror` 를 `false` 로 바꾸거나
      `===` 를 `!==` 로 뒤집어도 이 절이 **PASS 43 / FAIL 0** 으로 통과했다.
      (그 두 변이는 각각 «도장을 영영 안 찍는다»·«엉뚱한 행에 찍는다» 로,
       고치려던 사고가 그대로 재현되는 상태다.)
      ⟹ 판정식도 **오려 내 실제로 돌린다.** */
/** 타입 표기를 벗긴다 — `as any` 가 있으면 new Function 이 못 돈다. */
const noTsTop = (x) => x.replace(/ as any/g, '');
const mIsMirror = API.match(/const _isMirror = ([^;]+);/);
ok('전제 — 미러 판정식을 찾았다', !!mIsMirror, mIsMirror && mIsMirror[1]);
const mMirConst = MIR_SRC.match(/MIRROR_SOURCE\s*=\s*'([^']+)'/);
ok('전제 — 미러 표식을 정본에서 읽었다', !!mMirConst, mMirConst && mMirConst[1]);
if (mIsMirror && mMirConst) {
  const MIRV = mMirConst[1];
  /* ⚠️ 타입 표기(`as any`)를 벗겨야 돈다. 그리고 «부를 때» 까지 try 로 감싼다 —
        변이가 문법을 깨면 «깔끔한 FAIL» 이 아니라 하니스 크래시가 되어
        결과줄조차 안 나온다(CLAUDE.md 2장). */
  const noTs = (x) => x.replace(/ as any/g, '');
  let im = null;
  try { im = new Function('cs', 'MIRROR_SOURCE', 'return ' + noTs(mIsMirror[1]) + ';'); }
  catch (e) { ok('미러 판정식을 실제로 돌린다', false, String(e.message)); }
  if (im) {
    let r = null;
    try {
      r = {
        mirror: im({ source: MIRV }, MIRV),
        enroll: im({ source: 'adm-enroll:99' }, MIRV),
        manual: im({ source: 'c24-mirror:manual' }, MIRV),
        none: im({}, MIRV),
        nul: im({ source: null }, MIRV),
      };
    } catch (e) { ok('미러 판정식을 실제로 돌린다', false, String(e.message)); }
    if (r) {
      ok('미러 판정식을 실제로 돌린다', true);
      ok('미러 행이면 «사람 손» 도장을 찍는다', r.mirror === true, r.mirror);
      // 짝 — 없으면 «전부 도장» 도 통과한다(엉뚱한 행의 source 를 갈아치운다)
      ok('수강신청이 만든 행에는 안 찍는다 (짝)', r.enroll === false, r.enroll);
      ok('사람이 이미 손댄 행에도 안 찍는다 (짝)', r.manual === false, r.manual);
      ok('source 를 모르면 안 찍는다 (짝)', r.none === false && r.nul === false);
    }
  }
}

/* 그리고 «그 판정이 실제로 SQL 을 고르는가» — 삼항식을 통째로 오려 내 평가한다.
   ⛔ 「도장 SQL 이 파일에 있다」로 묻지 말 것 — 두 갈래를 맞바꿔도 글자는 그대로다. */
/* ⚠️ 조건 «이름» 을 못 박지 말 것 — 이동은 날짜 규칙이 붙어 이름이 다르다(아래 ①-b).
      그래서 «무엇이든 한 이름 ? `SQL` : `SQL`» 로 찾고, 그 이름은 **소스에서 읽어** 쓴다. */
const terns = decideBlk.match(/\b(_\w+)\s*\?\s*`[^`]+`\s*:\s*`[^`]+`/g) || [];
ok('전제 — 갈래를 고르는 삼항식이 둘이다 (이동·연기)', terns.length === 2, terns.length);
for (let i = 0; i < terns.length; i++) {
  const nm = (terns[i].match(/^\s*(_\w+)/) || [])[1] || '_x';
  let picked = null;
  try {
    const pick = new Function(nm, 'MIRROR_SOURCE_MANUAL', 'return (' + terns[i] + ');');
    picked = { yes: pick(true, MANUAL), no: pick(false, MANUAL) };
  } catch (e) { ok('삼항식 ' + (i + 1) + ' 을 평가했다', false, String(e.message)); }
  if (picked) {
    ok('삼항식 ' + (i + 1) + '(' + nm + ') — 참이면 도장 SQL 을 고른다', picked.yes.indexOf(MANUAL) >= 0, picked.yes.slice(0, 60));
    ok('삼항식 ' + (i + 1) + '(' + nm + ') — 거짓이면 도장이 없는 SQL 이다 (짝)', picked.no.indexOf(MANUAL) < 0, picked.no.slice(0, 60));
  }
}

/* ══ ①-b 🔴 날짜가 바뀌는 이동에는 도장을 찍지 «않는다» ═══════════════════════
   [잰 것 — 2026-09-22, 진짜 SQLite] 미러의 부분 유니크 인덱스가
     `ON class_schedules(notes) WHERE source='c24-mirror'` 라 도장 찍은 행은 그 «밖» 이다.
       · 도장 없음 → 야간 미러의 새 INSERT 가 UNIQUE 위반으로 거절 (중복 없음)
       · 도장 있음 → INSERT 성공 ⟹ **옛 날짜에 그 수업이 다시 생긴다**
   ⟹ 2026-09-01 「미러가 «없는 수업» 을 만듦 — 강사가 20분 헛기다림」과 같은 모양이다.
   ⚠️ 도장이 실제로 일하는 것은 «같은 날짜에 머무는» 수정뿐이다(planMirror 실측:
      시각만 옮김 → diverged · 연기 → manual_locked · 연기 뒤 강사 변경 → manual_locked).      */
const mStampMove = API.match(/const _stampMove = ([^;]+);/);
ok('전제 — 이동의 도장 조건을 찾았다', !!mStampMove, mStampMove && mStampMove[1]);
if (mStampMove) {
  let sm = null;
  try { sm = new Function('_isMirror', 'row', 'cs', 'return ' + noTsTop(mStampMove[1]) + ';'); }
  catch (e) { ok('이동 도장 조건을 실제로 돌린다', false, String(e.message)); }
  if (sm) {
    let r2 = null;
    try {
      const CS = (d) => ({ scheduled_date: d });
      r2 = {
        same:  sm(true,  { new_date: '2026-09-25' }, CS('2026-09-25')),
        moved: sm(true,  { new_date: '2026-09-28' }, CS('2026-09-25')),
        plain: sm(false, { new_date: '2026-09-25' }, CS('2026-09-25')),
        noCs:  sm(true,  { new_date: '2026-09-25' }, null),
      };
    } catch (e) { ok('이동 도장 조건을 실제로 돌린다', false, String(e.message)); }
    if (r2) {
      ok('이동 도장 조건을 실제로 돌린다', true);
      ok('같은 날 안에서 시각만 옮기면 도장을 찍는다', r2.same === true, r2.same);
      // 🔴 짝 — 이 줄이 없으면 «전부 도장» 이 되어 옛 날짜에 유령이 되살아난다
      ok('🔴 날짜가 바뀌면 도장을 «안» 찍는다 (유령 방지) (짝)', r2.moved === false, r2.moved);
      ok('미러 행이 아니면 애초에 안 찍는다 (짝)', r2.plain === false, r2.plain);
      ok('행을 못 읽었으면 안 찍는다 (막는 쪽으로 실패) (짝)', r2.noCs === false, r2.noCs);
    }
  }
}
/* ⚠️ 연기는 날짜가 안 바뀌므로 «언제나» 찍는다 — 그쪽 조건에 날짜 규칙이 붙으면
      2026-09-01 강사 변경 덮어쓰기(planMirror 'update')를 다시 못 막는다. */
const postpTern = terns.find((t) => /postponed/.test(t));
ok('연기 갈래는 날짜 조건 없이 미러면 찍는다', !!postpTern && /^_isMirror\b/.test(postpTern.trim()),
   postpTern && postpTern.trim().slice(0, 20));

/* ⚠️ 이 도장이 지키는 것 — 미러 sweep 의 UPDATE 가 source='c24-mirror' 만 건드린다는 사실.
      그 전제가 바뀌면 이 검사는 뜻을 잃으므로 함께 못 박는다. */
const MIR = readFileSync(new URL('../cloudflare-deploy/src/c24-mirror.ts', import.meta.url), 'utf8');
ok('전제 — 미러 sweep 은 source=? 로 자기 행만 덮어쓴다',
   /UPDATE class_schedules SET start_time[\s\S]{0,200}WHERE id = \? AND source = \?/.test(MIR));

/* ══════════════════════════════════════════════════════════════════════════
   ② «누가 냈는가» — 판정식을 오려 내 실제로 돌린다
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n[②] requester_role — body 를 믿지 않는다');

const mAdmin = API.match(/const _byAdmin = ([^;]+);/);
const mRole = API.match(/const requesterRole = ([^;]+);/);
ok('전제 — 두 판정식을 찾았다', !!(mAdmin && mRole));
if (mAdmin && mRole) {
  const f = new Function('body', '_srcActor',
    'const _byAdmin = ' + mAdmin[1] + '; return ' + mRole[1] + ';');
  const A = (role, actor) => f({ requester_role: role }, actor);
  const adminOk = { ok: true, isTeacher: false };
  ok('관리자가 admin 으로 보내면 admin 이다', A('admin', adminOk) === 'admin');
  // 짝 — 아래 셋이 없으면 «전부 admin» 도 통과한다
  ok('강사가 admin 을 적어 보내도 teacher 다 (짝)', A('admin', { ok: true, isTeacher: true }) === 'teacher');
  ok('로그인 없이 admin 을 적어도 teacher 다 (짝)', A('admin', { ok: false, isTeacher: false }) === 'teacher');
  ok('학생 요청은 예전 그대로 student 다 (짝)', A('student', { ok: false, isTeacher: false }) === 'student');
  ok('강사 마이페이지 요청은 예전 그대로 teacher 다 (짝)', A(undefined, { ok: false, isTeacher: false }) === 'teacher');
}
/* ⛔ 「그 식이 파일에 없다」로 묻지 않는다 — `body.requester_role === 'student' ? … : 'teacher'`
      는 requesterRole 의 **정당한 폴백**으로 그대로 남는다(학생·강사 경로는 안 바뀌었다).
      물어야 할 것은 «INSERT 가 body 를 «직접» 바인딩하지 않는가» 다. */
const mBind = API_S.match(/scheduleId, reqType, ([^,]+),/);
ok('전제 — INSERT 의 3번째 인자를 찾았다', !!mBind, mBind && mBind[1]);
ok('INSERT 가 서버 판정(requesterRole)을 쓴다', !!mBind && mBind[1].trim() === 'requesterRole', mBind && mBind[1]);
ok('⛔ INSERT 가 body 를 직접 바인딩하지 않는다', !!mBind && mBind[1].indexOf('body.') < 0);

/* ══════════════════════════════════════════════════════════════════════════
   ③ can_move — /decide 의 isDated 와 «같은 칸» 인가
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n[③] can_move');

const mCan = API.match(/can_move: ([^,\n]+),/);
const mDated = API.match(/const isDated = ([^;]+);/);
ok('전제 — 두 판정을 찾았다', !!(mCan && mDated));
if (mCan && mDated) {
  const col = (s) => (s.match(/\b(scheduled_date|day_of_week|schedule_kind)\b/g) || []).sort().join(',');
  ok('둘 다 scheduled_date 를 근거로 삼는다', col(mCan[1]) === 'scheduled_date' && col(mDated[1]) === 'scheduled_date',
     mCan[1] + '  /  ' + mDated[1]);
  const g = new Function('s', 'return ' + mCan[1] + ';');
  ok('날짜가 있으면 true', g({ scheduled_date: '2026-09-22' }) === true);
  ok('날짜가 없으면 false (매주 반복) (짝)', g({ scheduled_date: null, day_of_week: 'Thu' }) === false);
  ok('빈 문자열도 false (짝)', g({ scheduled_date: '' }) === false);
  ok('⛔ schedule_kind 로 추측하지 않는다', !/schedule_kind/.test(mCan[1]));
}
ok('카페24 줄은 can_move:false 로 못 박는다', /can_move: false,[\s\S]{0,200}source: 'cafe24'/.test(API_S));

/* ══════════════════════════════════════════════════════════════════════════
   ④ 화면 배선 — 판정을 복제하지 않았는가
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n[④] manager.html 배선');

/* ⚠️ 부정 검사는 **주석을 벗긴 사본**으로 판정한다 — 「⛔ …하지 말 것」 이라고 적은
      설명 주석이 그 글자를 담고 있어 검사가 «자기 주석» 을 잡는다(CLAUDE.md 2장).
      지금은 그 주석이 taRun «밖» 이라 우연히 통과하지만, 한 줄만 안으로 옮겨도
      **멀쩡한 코드가 거짓 FAIL** 이 된다. */
const MGR_S = strip(MGR);
const taRun = blockFrom(MGR_S, 'function taRun(pan, sid)');
ok('전제 — 주석을 벗긴 사본으로 본다', MGR_S.length > 0 && MGR_S.length < MGR.length);
ok('전제 — taRun 을 잘라 냈다', taRun.length > 800, taRun.length);
ok('취소는 «진짜 취소» 경로(DELETE /class-schedules/:id)를 부른다',
   /\/api\/admin\/class-schedules\/' \+ encodeURIComponent\(sid\)[\s\S]{0,120}method: 'DELETE'/.test(taRun));
// ⛔ 취소를 request_type:'cancel' 로 보내면 서버가 «연기»(postponed)로 처리해 화면이 거짓말을 한다
ok('⛔ 취소를 request_type:\'cancel\' 로 보내지 않는다', taRun.indexOf("'cancel'") < 0 || !/request_type: *'cancel'/.test(taRun));
ok('연기·변경은 기존 두 경로를 그대로 쓴다',
   /\/api\/admin\/schedule-requests'/.test(taRun) && /schedule-requests\/decide'/.test(taRun));
ok('«무엇을 했는가» 판정문은 reqMsgOf 를 재사용한다 (복제 금지)', /reqMsgOf\(res\.j, 'approve'\)/.test(taRun));
ok('오류 문구도 reqErrOf 를 재사용한다 (복제 금지)', /reqErrOf\(/.test(taRun));
ok('되돌릴 수 없으므로 확인을 한 번 받는다', /window\.confirm\(ask\)/.test(taRun));
/* 🪤 «그 글자가 있는가» 로는 `if (false) return;` 한 글자를 못 잡는다 — 확인창을 건너뛰면
      매니저가 누르는 «순간» 수업이 옮겨진다(되돌릴 수 없다). 조건까지 함께 본다. */
ok('⛔ 확인창을 «건너뛰지» 않는다 (조건 뒤집기 방지)', /if \(!window\.confirm\(ask\)\) return;/.test(taRun));

/* «누가 냈는가» — 화면이 서버에 무엇이라고 말하는가.
   ⚠️ 서버가 세션으로 다시 확인하므로 위조는 안 되지만, 화면이 'teacher' 로 보내면
      노쇼 리포트·알림에 **관리자가 한 일이 강사 것으로** 적힌다(②절이 지키는 그 값). */
const mSendRole = taRun.match(/requester_role: *'([^']+)'/);
ok('화면은 자기를 admin 으로 밝힌다', !!mSendRole && mSendRole[1] === 'admin', mSendRole && mSendRole[1]);

/* 반쪽 성공 — 접수는 됐는데 승인이 실패하면 «어디서 마저 하는지» 를 말해야 한다.
   ⛔ 이 줄이 없으면 요청이 결재함에 남아 있는데 화면은 «실패» 로만 보인다. */
ok('승인이 실패하면 «요청은 저장됐다 + 어디서 마저 하는지» 를 말한다',
   /요청은 저장됐습니다/.test(taRun) && /수업 연기·변경 요청/.test(taRun));

/* 💰 「연기」는 강사 수업료에 닿는다 — 확인창이 그 말을 하는가.
   서버가 연기·취소 요청에 fee_type 을 자동으로 매기고(시작 30분보다 이르면 'free'),
   급여가 그 값을 읽어 postponed_early_pay_percent(**amount 0 으로 심어져 있다**)를 쓴다.
   ⟹ 매니저가 «앞으로 있을» 수업을 연기하면 그 수업 강사료가 0원이 될 수 있다.
   ⛔ 조용히 두지 말 것 — 되돌릴 수 없는 «돈» 축이다(CLAUDE.md 2장). */
const mFee = taRun.match(/var feeWarn = ([\s\S]*?)\n      : '';/);
ok('전제 — 급여 경고 조건을 찾았다', !!mFee);
if (mFee) {
  const cond = (mFee[1].match(/^\(([^)]*\))*[^)]*\)/) || [mFee[1].split('\n')[0]])[0];
  let fw = null;
  try { fw = new Function('mode', 'mins', 'return ' + (mFee[1].split('\n')[0].trim()) + ';'); }
  catch (e) { ok('급여 경고 조건을 실제로 돌린다', false, String(e.message)); }
  if (fw) {
    let r3 = null;
    try {
      r3 = { far: fw('postpone', 600), near: fw('postpone', 10), edge: fw('postpone', 30),
             unknown: fw('postpone', null), change: fw('change', 600), cancel: fw('cancel', 600) };
    } catch (e) { ok('급여 경고 조건을 실제로 돌린다', false, String(e.message)); }
    if (r3) {
      ok('급여 경고 조건을 실제로 돌린다', true);
      ok('💰 30분보다 이른 연기에는 «사전 연기» 를 경고한다', r3.far === true, r3.far);
      // 짝 — 없으면 «늘 경고» 도 통과한다(양치기 소년이 되어 아무도 안 읽는다)
      ok('시작이 코앞이면 경고하지 않는다 (짝)', r3.near === false, r3.near);
      ok('경계(30분)에서는 경고하지 않는다 (짝)', r3.edge === false, r3.edge);
      ok('시각을 모르면 지어내지 않는다 (짝)', r3.unknown === false, r3.unknown);
      ok('변경·취소는 그 축이 아니라 경고하지 않는다 (짝)', r3.change === false && r3.cancel === false);
    }
  }
  ok('⛔ 퍼센트 숫자를 화면이 지어내지 않는다', !/0\s*%|0원이 됩니다|100%/.test(mFee[1]), mFee[1].slice(0, 40));
  ok('연기 확인창에 그 경고를 실제로 붙인다', /연기할까요[\s\S]{0,240}\+ feeWarn;/.test(taRun));
}

/* 🔴 «무엇을 고르셨나» 판정 — 여기가 틀리면 매니저가 「수업 취소」를 골랐는데
      «연기» 가 나갑니다(둘 다 «성공» 이라 에러도 안 납니다). 폴백까지 함께 못 박는다. */
const mMode = MGR_S.match(/function taModeOf\(([^)]*)\)/);
const taModeBlk = blockFrom(MGR_S, 'function taModeOf');
ok('전제 — taModeOf 를 잘라 냈다', taModeBlk.length > 20, taModeBlk.length);
ok('고른 버튼은 aria-pressed 로 읽는다', /aria-pressed/.test(taModeBlk));
ok('못 읽으면 «연기» 로 떨어진다 (가장 덜 위험한 쪽)',
   /'postpone'/.test(taModeBlk) && !/return 'cancel'/.test(taModeBlk.replace(/data-ta-mode/g, '')));

const taPanel = blockFrom(MGR_S, 'function taPanelHtml(r)');
ok('전제 — taPanelHtml 을 잘라 냈다', taPanel.length > 400, taPanel.length);
const mCancelGate = taPanel.match(/var canCancel = ([^;]+);/);
ok('전제 — 취소 게이트를 찾았다', !!mCancelGate);
if (mCancelGate) {
  const h = new Function('IS_HQ', 'r', 'return ' + mCancelGate[1] + ';');
  ok('본사 + 날짜 지정 수업이면 취소를 준다', h(true, { can_move: true }) === true);
  // 짝 — 되돌릴 수 없는 조작이라 «막는 쪽으로» 실패해야 한다
  ok('지사·대리점에는 안 준다 (DELETE 가 403) (짝)', h(false, { can_move: true }) === false);
  ok('매주 반복에는 안 준다 (모든 주가 죽는다) (짝)', h(true, { can_move: false }) === false);
  ok('«모름» 에도 안 준다 (막는 쪽으로 실패) (짝)', h(true, {}) === false);
}

const mChip = blockFrom(MGR_S, 'function paintTodayAll()');
ok('카페24·매주반복 줄에는 칩을 안 준다', /r\.schedule_id && r\.can_move === false/.test(mChip) && /else if \(r\.schedule_id\)/.test(mChip));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
if (FAIL) process.exit(1);
