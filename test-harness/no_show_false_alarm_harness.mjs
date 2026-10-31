/* ══════════════════════════════════════════════════════════════════════════
   🔎 「강사 미입장」 오판 표시 — 회귀 감시 (2026-08-19)

   [무슨 일이었나] `class_no_show` 의 «강사 미입장» 행은 **학생 브라우저가** 만든다.
     5분을 기다려도 상대가 화면에 안 보이면 신고하는 구조라, 기록되는 사실은
     «상대가 안 왔다» 가 아니라 «내 화면에 안 보였다» 다.
     두 사람이 서로 다른 워커의 방에 있던 동안(CLAUDE.md 2장의 DO 분리 함정)
     중국어 강선생님은 매번 들어와 13분씩 수업 화면을 지켰는데도 알림이 떴고,
     실측 13건 중 **11건이 오판**이었다. 그 숫자가 강사 90일 평가 지표에 그대로
     들어가고 있었다 — 잘못이 없는 강사가 조용히 낮게 평가되던 것.

   [이 하니스가 지키는 것]
     ① 판정이 **한 곳**(src/no-show-truth.ts)에만 있다 — 두 벌이면 화면마다 답이 갈린다
     ② 낱말 경계 규칙이 실제로 맞는다 ('강선생님' ⊂ '중국어 강선생님' 살림 / 'Anna' ⊂ 'HANNAH' 막음)
     ③ ⛔ `role='teacher'` 만으로 오판 판정하지 않는다 (role 은 클라이언트 값 — 위조 전례)
     ④ 노쇼 리포트 API 가 대조 결과를 실어 내린다
     ⑤ 강사 90일 지표가 오판을 빼고 센다
     ⑥ 화면이 오판을 «오판» 으로 그리고, [다시 알림] 버튼을 주지 않는다
     ⑦ ⛔ 기록을 지우거나 고쳐 쓰지 않는다 (DELETE/UPDATE 로 «정리» 하지 말 것)
   ══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => { try { return readFileSync(resolve(__dir, '../' + p), 'utf8'); } catch { return ''; } };
/* 부정 검사는 주석을 벗겨 낸 사본으로 판정한다 — 「왜 안 하는지」 적은 설명 주석에 그 단어가
   들어가면 검사가 자기 주석을 잡는다(CLAUDE.md 2장, c24_finance_kcpm_harness ③ 전례). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

let pass = 0; const fails = [];
const check = (label, ok) => { if (ok) { pass++; console.log('  ✅ ' + label); } else { fails.push(label); console.log('  ❌ ' + label); } };

const truth = read('cloudflare-deploy/src/no-show-truth.ts');
const admin = read('cloudflare-deploy/src/api-admin.ts');
const q1 = read('cloudflare-deploy/public/js/adm-q1.js');

console.log('\n[ ① 판정은 한 곳에만 있다 ]');
check('src/no-show-truth.ts 가 있다', truth.length > 0);
check('teacherPresenceByRoom 을 내보낸다', /export async function teacherPresenceByRoom/.test(truth));
check('api-admin.ts 가 그 함수를 들여온다', /import\s*\{[^}]*teacherPresenceByRoom[^}]*\}\s*from\s*'\.\/no-show-truth'/.test(admin));
check('api-admin.ts 가 판정을 자기 안에 다시 짜지 않았다 (호출만 한다)',
  !/function\s+\w*[Tt]eacherPresence/.test(strip(admin)));
check('D1 바인드 100개 한도 — 공용 selectInChunks 를 쓴다 (손으로 자르지 않는다)',
  /selectInChunks/.test(truth) && !/\+=\s*90/.test(strip(truth)));

console.log('\n[ ② 낱말 경계 이름 판정이 실제로 맞는가 (함수를 직접 돌린다) ]');
let sameTeacherByWord = null;
try {
  // TS 파일이라 import 는 못 한다 → 함수 세 개를 그대로 떼어 내 평가한다(원문 그대로여야 통과).
  const m = truth.match(/const stripRolePrefix[\s\S]*?export function sameTeacherByWord[\s\S]*?\n\}/);
  if (m) {
    const js = m[0]
      /* ⚠️ 타입 «이름» 을 하나씩 적어 두면 정본에 새 타입이 생기는 순간 추출이 조용히 깨진다.
         2026-09-08 에 실제로 밟았다 — `const NAME_ALIASES: readonly (readonly string[])[]` 가
         이 목록에 없어 `Missing initializer in const declaration` 으로 죽었고, 이 하니스의
         검사 5건(그중 「⛔ 막을 것 — 'Anna' 는 'HANNAH' 가 아니다」)이 조용히 사라졌다.
         → 변수 선언의 타입은 «이름» 이 아니라 «자리»(const 이름 : … =)로 벗긴다. */
      .replace(/\bconst\s+([A-Za-z_$][\w$]*)\s*:[^=]+=/g, 'const $1 =')
      .replace(/:\s*any\b/g, '').replace(/:\s*string\[\]/g, '').replace(/:\s*string\b/g, '')
      .replace(/:\s*boolean\b/g, '').replace(/^export /gm, '');
    sameTeacherByWord = new Function(js + '; return sameTeacherByWord;')();
  }
} catch (e) { console.log('     (추출 실패: ' + e.message + ')'); }
check('sameTeacherByWord 를 원문에서 떼어 내 실행할 수 있다', typeof sameTeacherByWord === 'function');
if (typeof sameTeacherByWord === 'function') {
  check("살릴 것 — '교사 강선생님' ↔ '중국어 강선생님' 은 같은 사람",
    sameTeacherByWord('교사 강선생님', '중국어 강선생님') === true);
  check("살릴 것 — 'Teacher Len' ↔ 'LEN' 은 같은 사람(대소문자·접두사 무시)",
    sameTeacherByWord('Teacher Len', 'LEN') === true);
  check("⛔ 막을 것 — 'Anna' 는 'HANNAH' 가 아니다 (낱말 속 우연일치)",
    sameTeacherByWord('Anna', 'HANNAH') === false);
  check("⛔ 막을 것 — 학생 'jeong' 은 '중국어 강선생님' 이 아니다",
    sameTeacherByWord('jeong', '중국어 강선생님') === false);
  check('⛔ 막을 것 — 빈 이름끼리는 «같다» 가 아니다', sameTeacherByWord('', '') === false);
}

console.log('\n[ ③ ⛔ role=teacher 만으로 오판 판정하지 않는다 (role 은 클라이언트 값) ]');
const truthCode = strip(truth);
check("판정에 role === 'teacher' 를 근거로 쓰지 않는다",
  !/role\s*===?\s*['"]teacher['"]/.test(truthCode));
check('이름 일치(sameTeacherByWord)를 근거로 쓴다', /sameTeacherByWord\(/.test(truthCode));
check('왜 role 을 안 믿는지 파일에 적혀 있다', /role[\s\S]{0,400}(클라이언트|위조|먼저 들어온)/.test(truth));

console.log('\n[ ④ 노쇼 리포트 API 가 대조 결과를 내려준다 ]');
check('/api/admin/no-shows 가 teacherPresenceByRoom 을 부른다',
  /teacherPresenceByRoom\(env\.DB, items\)/.test(admin));
check('행마다 false_alarm 을 실어 준다', /false_alarm\s*=/.test(admin));
check('요약에 teacher_false_alarm 이 있다', /teacher_false_alarm/.test(admin));
check('«모름»(판정 불가)을 오판과 구분해 내려준다', /teacher_unknown/.test(admin));

console.log('\n[ ⑤ 강사 90일 지표가 오판을 빼고 센다 ]');
const nsMetric = admin.match(/강사 노쇼[\s\S]{0,2400}?\}\)\(\),/);
check('노쇼 지표 블록을 찾을 수 있다', !!nsMetric);
if (nsMetric) {
  check('같은 함수(teacherPresenceByRoom)로 판정한다', /teacherPresenceByRoom/.test(nsMetric[0]));
  check('오판이면 세지 않고 건너뛴다', /present\s*===\s*true\)\s*continue/.test(nsMetric[0]));
  check('«모름»은 빼지 않는다 (진짜 노쇼를 감추지 않으려고)',
    /present\s*===\s*true/.test(nsMetric[0]) && !/present\s*!==\s*false/.test(nsMetric[0]));
}

/* 🔴 (2026-08-19) 필드 이름 대조 — **문자열 검사만으로는 못 잡는 사고**가 실제로 났다.
   hr-signals 쿼리가 `SELECT teacher_name AS tn` 로 별칭만 두는 바람에, 결과 행에
   `teacher_name` 이 없어 판정 함수가 이름을 빈 값으로 읽었다 → 전부 «모름» →
   **오판이 한 건도 제외되지 않았다.** 에러가 안 나서 하니스도 35/35 로 통과했다.
   그래서 「부르는가」가 아니라 「**무엇을 실어 보내는가**」를 검사한다. */
console.log('\n[ ⑨ 판정 함수에 넘기는 행이 teacher_name 을 실제로 담고 있다 ]');
const nsSelects = admin.match(/SELECT[^`]*?FROM class_no_show/g) || [];
check('class_no_show 조회문을 찾을 수 있다', nsSelects.length >= 2);
check('teacher_name 을 «별칭만» 두고 지나가는 조회가 없다',
  nsSelects.every((s) => !/teacher_name\s+AS\s+\w+/i.test(s) || /teacher_name\s*,/i.test(s)));
check('판정에 쓰는 조회는 student_name 도 싣는다 (학생과의 혼동 배제용)',
  nsSelects.filter((s) => /teacher_name/i.test(s)).every((s) => /student_name/i.test(s)));
check('판정 함수의 입력 타입이 teacher_name 을 요구한다 (이름이 계약으로 남아 있다)',
  /interface NoShowRowLike[\s\S]{0,600}teacher_name\?/.test(truth));

/* ⑧ 급여. 상태가 teacher_no_show 면 그 수업은 **수업료가 0원**이 된다(amount 는
   finish·student_absent·postponed 에만 붙는다). 오판을 그대로 두면 «들어와서 수업한
   강사에게 0원» 이 되므로, 여기서도 같은 함수로 대조해야 한다. */
console.log('\n[ ⑧ 급여 계산도 같은 함수로 대조한다 ]');
/* 컬럼 순서가 아니라 «무엇을 싣는가» 로 검사한다 — 순서를 못 박으면 컬럼 하나 더할 때마다 깨진다 */
check('급여용 노쇼 조회가 teacher_name·student_name 을 함께 읽는다 (이름 대조에 필요)',
  nsSelects.some((s) => /schedule_id/.test(s) && /\bteacher_name\b/.test(s) && /\bstudent_name\b/.test(s)));
check('급여 쪽도 teacherPresenceByRoom 을 부른다', /nsPresence\s*=\s*await teacherPresenceByRoom/.test(admin));
check("오판이면 teacher_no_show 로 보지 않는다",
  /missing_role === 'teacher' && !nsIsFalseAlarm\(ns\)\) st = 'teacher_no_show'/.test(admin));
check('«모름»은 되돌리지 않는다 (진짜 노쇼에 수업료가 나가지 않게)',
  /present === true/.test(admin.slice(admin.indexOf('nsIsFalseAlarm'), admin.indexOf('nsIsFalseAlarm') + 400)));

console.log('\n[ ⑥ 화면이 오판을 오판으로 그린다 ]');
check('오판 배지를 그린다', /오판/.test(q1));
check('강사 접속 시간을 함께 보여 준다', /teacher_seen_min/.test(q1));
check('⛔ 오판에는 [다시 알림] 버튼을 주지 않는다',
  /isFalse\s*\?\s*''\s*:\s*'<button onclick="noShowContact/.test(q1));
check('판정 불가는 «확인 필요» 로 따로 알린다', /teacher_present\s*===\s*null/.test(q1));
const ver = read('cloudflare-deploy/public/admin.html').match(/adm-q1\.js\?v=(\d+)/);
check('admin.html 의 adm-q1.js ?v= 가 2보다 크다 (immutable 캐시에 옛 파일이 남지 않게)',
  !!ver && Number(ver[1]) > 2);

/* ⚠️ 「UPDATE 를 전부 금지」로 적으면 안 된다 — `contacted_at`(누구에게 다시 연락했나) 기록은
      정당한 쓰기이고 이 기능과 무관하다. 막아야 하는 것은 **오판 판정을 기록에 굳히는 것**뿐이다.
      학생이 못 본 것은 사실이라 지우면 «왜 수업이 성립하지 않았나» 가 함께 사라지고,
      컬럼으로 굳히면 나중에 판정이 좋아져도 옛 값이 남는다. */
console.log('\n[ ⑦ ⛔ 기록을 지우거나 판정을 굳히지 않는다 (읽을 때 대조한다) ]');
const adminCode = strip(admin);
const VERDICT_COL = /(false_alarm|is_false|voided|teacher_present|no_show_valid)/i;
check('class_no_show 행을 지우지 않는다', !/DELETE\s+FROM\s+class_no_show/i.test(adminCode));
check('오판 판정을 class_no_show 에 UPDATE 하지 않는다',
  !(adminCode.match(/UPDATE\s+class_no_show\s+SET[^;`]*/gi) || []).some((s) => VERDICT_COL.test(s)));
check('오판 판정용 컬럼을 새로 만들지 않는다',
  !(adminCode.match(/ALTER\s+TABLE\s+class_no_show\s+ADD\s+COLUMN\s+\w+/gi) || []).some((s) => VERDICT_COL.test(s)));
check('대신 조회 응답에서 계산해 붙인다 (읽을 때 판정)',
  /r\.false_alarm\s*=\s*r\.teacher_present\s*===\s*true/.test(admin));

/* 🔴 ⑩ 여기가 이번 사고의 진짜 교훈이다 — 위 ⑨ 같은 문자열 검사도 «다음번» 모양은 못 잡는다.
   판정 함수를 **컴파일해서 실제로 돌려**, 각 호출부가 실어 보내는 행 모양 그대로 넣어 본다.
   ⚠️ typescript 는 cloudflare-deploy/node_modules 에 있다(ci-gates.sh 전제: npm ci 가 먼저 돈다).
      없으면 이 묶음만 건너뛴다 — 하니스 전체가 죽는 것이 더 나쁘다. */
console.log('\n[ ⑩ 판정 함수를 컴파일해 실제로 돌려 본다 ]');
let mod = null, tsWhy = '';
try {
  const ts = (await import(pathToFileURL(resolve(__dir, '../cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  const src = truth.replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/d1-chunk';\s*$/m, '');
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  /* selectInChunks 를 «가짜 DB» 로 대체.
     ⚠️ 이 파일은 이제 표를 **두 개** 읽는다(attendance · teacher_account_links) —
        SQL 을 보고 갈라 주지 않으면 계정 해석 쪽에 출석행이 들어가 조용히 무력화된다.
     · db.__links 를 안 주면 빈 목록 → 계정 해석 없음 = 예전 동작 그대로. */
  const stub = `const selectInChunks = async (db, values, sqlFn) => {
    const sql = typeof sqlFn === 'function' ? sqlFn(values.map(() => '?').join(',')) : '';
    if (/teacher_account_links/i.test(sql)) {
      if (db.__linksThrow) throw new Error('no such table: teacher_account_links');
      const want = new Set((values || []).map((v) => String(v).toUpperCase()));
      return (db.__links || []).filter((l) => want.has(String(l.acct).toUpperCase()));
    }
    return db.__rows;
  };\n`;
  mod = await import('data:text/javascript;base64,' + Buffer.from(stub + js, 'utf8').toString('base64'));
} catch (e) { tsWhy = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 건너뜀 (' + tsWhy.slice(0, 80) + ')');
} else {
  const ROOM = 'class-849-20260819';
  const att = [
    { room_id: ROOM, role: 'teacher', username: '교사 강선생님', joined_at: 1000, out_at: 781000 },
    { room_id: ROOM, role: 'student', username: 'jeong', joined_at: 2000, out_at: 700000 },
  ];
  const db = { __rows: att };
  const run = (rows) => mod.teacherPresenceByRoom(db, rows).then((m) => m.get(ROOM));

  const ok = await run([{ room_id: ROOM, missing_role: 'teacher', teacher_name: '중국어 강선생님', student_name: '정우영' }]);
  check('정상 형태 — 오판으로 판정하고 접속 시간을 계산한다',
    !!ok && ok.present === true && ok.minutes === 13);

  // 🔴 이번에 실제로 난 사고 그대로: teacher_name 대신 tn 만 실어 보낸 경우
  const aliased = await run([{ room_id: ROOM, missing_role: 'teacher', tn: '중국어 강선생님', student_name: '정우영' }]);
  check('⛔ 이름을 안 실으면 «오판» 이라고 단정하지 않는다 (모름으로 남는다)',
    !!aliased && aliased.present === null);

  const gone = await run([{ room_id: ROOM, missing_role: 'teacher', teacher_name: 'MAIMAI', student_name: '정우영' }]);
  check('진짜 노쇼 — 그 방에 그 강사 흔적이 없으면 false', !!gone && gone.present === false);

  // 낱말 자체가 겹치는 경우: 강사 'Len' / 학생 'Len Kim' 이 같은 방에 있으면 구분 불가
  const db2 = { __rows: [{ room_id: ROOM, role: 'student', username: 'Len Kim', joined_at: 1000, out_at: 781000 }] };
  const amb = (await mod.teacherPresenceByRoom(db2,
    [{ room_id: ROOM, missing_role: 'teacher', teacher_name: 'Len', student_name: 'Len Kim' }])).get(ROOM);
  check('⛔ 학생과 구분이 안 되는 접속은 «강사 있었음» 으로 세지 않는다 (모름)',
    !!amb && amb.present === null);

  const noAtt = await mod.teacherPresenceByRoom({ __rows: [] },
    [{ room_id: ROOM, missing_role: 'teacher', teacher_name: '중국어 강선생님', student_name: '정우영' }]);
  check('출석 기록이 아예 없으면 모름 (없었다고 단정하지 않는다)',
    noAtt.get(ROOM) && noAtt.get(ROOM).present === null);

  /* 🔴 ⑪ (2026-08-26) 출석 이름이 «계정아이디» 로 찍히면 이름만으로는 안 맞는다.
     실사고: 예약 'HANNAH'(teachers.id=24) ↔ 출석 '교사 mangoi_167' → 낱말이 하나도 안 겹쳐
       present:false(=「없었다」로 **확정**)가 됐고, 급여는 true 일 때만 되돌리므로
       들어와 수업한 강사에게 0원이 나갈 상태였다. teacher_account_links 로 한 번 풀어서도 맞춘다.
     ⚠️ 이 묶음이 지키는 것은 «푼다» 만이 아니다 — «함부로 넓히지 않는다» 를 함께 못 박는다. */
  console.log('\n[ ⑪ 계정아이디로 찍힌 이름을 «원부 이름» 으로 풀어서도 맞춘다 ]');
  const R2 = 'class-895-20260825';
  const att2 = [
    { room_id: R2, role: 'teacher', username: '교사 mangoi_167', joined_at: 1000, out_at: 781000 },
    { room_id: R2, role: 'student', username: 'delaware', joined_at: 2000, out_at: 700000 },
  ];
  const ns2 = [{ room_id: R2, missing_role: 'teacher', teacher_name: 'HANNAH', student_name: '김연숙' }];
  const at2 = (db) => mod.teacherPresenceByRoom(db, ns2).then((m) => m.get(R2));

  // 운영 실측: 링크는 «대문자» Mangoi_167 쪽에만 붙어 있다 → 대소문자 무시로 찾아야 한다.
  const solved = await at2({ __rows: att2, __links: [{ acct: 'Mangoi_167', tname: 'HANNAH' }] });
  check('계정 → 원부 이름을 풀어 오판을 잡는다 (present=true)', !!solved && solved.present === true);
  check('⛔ 계정 조회는 대소문자를 무시한다 (mangoi_167 ↔ Mangoi_167)',
    !!solved && solved.present === true);

  const noLink = await at2({ __rows: att2 });
  check('링크가 없으면 예전 그대로 판정한다 (회귀 0)', !!noLink && noLink.present === false);

  const threw = await at2({ __rows: att2, __linksThrow: true });
  check('⛔ 링크 조회가 실패해도 던지지 않고 예전 동작으로 내려간다',
    !!threw && threw.present === false);

  const two = await at2({ __rows: att2,
    __links: [{ acct: 'Mangoi_167', tname: 'HANNAH' }, { acct: 'Mangoi_167', tname: 'MELCA' }] });
  check('⛔ 한 계정이 여러 강사로 풀리면 버린다 (틀린 이름을 붙이지 않는다)',
    !!two && two.present === false);

  const other = await at2({ __rows: att2, __links: [{ acct: 'Mangoi_167', tname: 'MELCA' }] });
  check('⛔ 링크가 «다른» 강사를 가리키면 오판으로 올리지 않는다', !!other && other.present === false);

  /* 학생 대조도 같은 규칙을 써야 한다 — 강사 쪽만 넓히면 «학생과 구분이 안 되는» 안전장치가 헐거워진다. */
  const stuAmb = (await mod.teacherPresenceByRoom(
    { __rows: att2, __links: [{ acct: 'Mangoi_167', tname: '김연숙' }] },
    [{ room_id: R2, missing_role: 'teacher', teacher_name: '김연숙', student_name: '김연숙' }])).get(R2);
  check('⛔ 푼 이름이 학생과도 걸리면 «강사 있었음» 으로 세지 않는다 (모름)',
    !!stuAmb && stuAmb.present === null);

  /* 🔴 ⑫ (2026-08-26) 「접속 시간」은 «맨 처음~맨 마지막» 의 간격이 아니라 «구간의 합» 이다.
     실사고: class-895-20260825 가 **314분** 으로 떴다 — 16:27 시험 입장부터 21:41 마지막
       퇴장까지의 간격이라, 나갔다 들어오기를 반복한 사이의 빈 시간이 전부 들어갔다.
       20분짜리 수업 옆에 「5시간 14분 접속」 이 붙는 셈이고, 이 숫자는 «오판입니다» 라는
       판정 바로 옆에 나온다 — 그 판정이 수업료를 되돌리므로, 말이 안 되는 숫자가 붙으면
       맞는 판정까지 못 믿게 된다. 고친 뒤 같은 데이터가 **34분**.
     ⚠️ 그냥 더해도 안 된다 — 같은 사람이 두 기기로 «동시에» 들어와 있는 일이 실제로 있다. */
  console.log('\n[ ⑫ 접속 시간은 구간의 «합» 이다 (간격도, 단순 덧셈도 아니다) ]');
  const R3 = 'class-777-20260826';
  const M = 60000;
  const B = 1787600000000;   // 기준 시각 — 0 을 쓰면 «시각 없음» 가드에 걸려 행이 통째로 빠진다
  const mins = async (spans) => {
    const rows = spans.map(([s, e]) => ({ room_id: R3, role: 'teacher', username: '교사 강선생님', joined_at: s, out_at: e }));
    const v = (await mod.teacherPresenceByRoom({ __rows: rows },
      [{ room_id: R3, missing_role: 'teacher', teacher_name: '중국어 강선생님', student_name: '정우영' }])).get(R3);
    return v ? v.minutes : null;
  };

  // 10분 붙어 있다 → 2시간 비었다 → 다시 10분. 간격을 세면 140분, 구간 합이면 20분.
  check('떨어진 두 구간은 «사이의 빈 시간» 을 빼고 더한다 (140분이 아니라 20분)',
    (await mins([[B, B + 10 * M], [B + 130 * M, B + 140 * M]])) === 20);

  // 두 기기 동시 접속 — 0~30분과 10~20분. 단순 덧셈이면 40분, 합집합이면 30분.
  check('⛔ 겹치는 구간을 두 번 세지 않는다 (40분이 아니라 30분)',
    (await mins([[B, B + 30 * M], [B + 10 * M, B + 20 * M]])) === 30);

  // 끝과 시작이 맞닿으면 하나로 잇는다
  check('맞닿은 구간은 하나로 이어 센다 (20분)',
    (await mins([[B, B + 10 * M], [B + 10 * M, B + 20 * M]])) === 20);

  // 시각이 없거나 뒤집힌 행은 셈에서 뺀다 — 그것 때문에 전체가 null 이 되면 안 된다
  check('시각이 비었거나 뒤집힌 행은 빼고 나머지로 센다 (10분)',
    (await mins([[B, B + 10 * M], [0, 0], [B + 50 * M, B + 40 * M]])) === 10);

  // 실사고 축약 — 시험 입장(짧게 2번) + 수업 중 재입장. 간격을 세면 314분이 나오던 자리.
  const real = await mins([
    [1787642833491, 1787642850080], [1787642890764, 1787642894826],
    [1787659429300, 1787660233867], [1787660251623, 1787660495452],
    [1787660507855, 1787661037598], [1787661131040, 1787661352695],
    [1787661462231, 1787661695388],
  ]);
  check('실사고(class-895) 데이터가 314분이 아니라 34분으로 나온다 [현재 ' + real + ']', real === 34);
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fails.length}건 중 ✅ ${pass} 통과 / ❌ ${fails.length} 실패`);
if (fails.length) { console.log('실패:'); for (const f of fails) console.log('  - ' + f); }
/* 🔴 (2026-09-08) 실패해도 종료코드가 0 이라 `run.mjs` 가 이 하니스를 늘 ✅ 로 셌다.
   그래서 정본에 새 타입이 생겨 **위 추출이 깨지고 검사 5건이 조용히 사라졌는데도**
   `--fast` 합계가 한 자리도 안 움직였다(실측: 39건 → 34건인데 게이트는 초록).
   ⚠️ 그 5건 안에 「⛔ 막을 것 — 'Anna' 는 'HANNAH' 가 아니다」가 들어 있었다 —
      이 저장소가 «가장 나쁜 방향» 이라고 못 박은 바로 그 안전속성의 감시다.
   ⛔ 이 줄을 지우지 말 것. 검사가 사라진 것을 «통과» 로 세면 감시 자체가 장식이 된다. */
if (fails.length) process.exit(1);
