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

/* ⑧ 급여. 상태가 teacher_no_show 면 그 수업은 **수업료가 0원**이 된다(amount 는
   finish·student_absent·postponed 에만 붙는다). 오판을 그대로 두면 «들어와서 수업한
   강사에게 0원» 이 되므로, 여기서도 같은 함수로 대조해야 한다. */
console.log('\n[ ⑧ 급여 계산도 같은 함수로 대조한다 ]');
check('노쇼 조회가 teacher_name 을 함께 읽는다 (이름 대조에 필요)',
  /SELECT room_id, schedule_id, missing_role, teacher_name, created_at FROM class_no_show/.test(admin));
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

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fails.length}건 중 ✅ ${pass} 통과 / ❌ ${fails.length} 실패`);
if (fails.length) { console.log('실패:'); for (const f of fails) console.log('  - ' + f); }
