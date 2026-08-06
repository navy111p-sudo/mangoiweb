// ════════════════════════════════════════════════════════════════════════════
// attendance_no_fabrication_harness.mjs — 출석현황 카드가 «기록을 지어내지» 않는지
//
// 왜 이 하니스가 있나 (2026-08-05):
//   출석현황 카드(adm-p5.js)는 서버 엔드포인트가 없다는 이유로,
//   **실제 강사 이름(Karl·Melca·Mo…)에 지각·결강·별점을 계산식으로 만들어 붙이고 있었다.**
//   화면에는 «예시 데이터» 경고 배너가 있었지만 **엑셀로 내보내면 배너가 사라져**
//   실기록과 구분이 안 됐다. 이 카드는 급여 공제 판단에 쓰인다 —
//   지어낸 지각이 강사 급여를 깎는 경로가 열려 있었다.
//
//   고친 뒤에도 «서버가 없으니 일단 만들어서 보여주자» 는 유혹은 계속 생긴다.
//   그래서 소스에 그 흔적이 돌아오면 여기서 잡는다. 소스가 곧 사양.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const P5 = join(__dir, '..', 'cloudflare-deploy', 'public', 'js', 'adm-p5.js');
const src = readFileSync(P5, 'utf8');

let pass = 0, fail = 0;
const check = (label, cond, detail) => {
  if (cond) { console.log('  ✅ ' + label); pass++; }
  else { console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); fail++; }
};

console.log('① 소스에 «기록을 지어내는» 코드가 없어야 한다');

// 옛 시드 생성기의 지문들 — 하나라도 살아 있으면 지어낸 값이 화면에 뜬다.
check('시드 생성 루프(seedBase)가 없다', !/seedBase/.test(src));
check('결정적 난수식(seed % 17 등)이 없다', !/seed\s*%\s*\d+/.test(src));
check('옛 시드 저장 키(mango_class_attendance_seed_v1)를 쓰지 않는다',
      !/localStorage\.(get|set)Item\(\s*['"]mango_class_attendance_seed_v1/.test(src)
      && !/CA_LS_KEY/.test(src));
check('_caSeeded 를 true 로 세우는 곳이 없다', !/_caSeeded\s*=\s*true/.test(src));

console.log('\n② 기록의 원천은 급여 계산과 «같은» 엔드포인트여야 한다');
check('payroll/lessons?all=1 을 읽는다', /payroll\/lessons\?all=1/.test(src));
check('없는 엔드포인트(/api/admin/class-attendance)를 더 이상 부르지 않는다',
      !/fetch\([^)]*\/api\/admin\/class-attendance/.test(src));

console.log('\n③ 못 불러왔을 때 «0건» 으로 보이면 안 된다');
check('실패 사유를 담는 변수가 있다', /_caLoadError/.test(src));
check('실패 시 records 를 비운다', /_caRecords\s*=\s*\[\];[\s\S]{0,200}_caLoadError\s*=/.test(src));
check('배너가 «없는 것이지 0건이 아니다» 를 말한다', /0건.*아닙니다|not\s*«?zero/.test(src));

console.log('\n④ 엑셀 내보내기가 실기록이 아닌 것을 흘리면 안 된다');
const exportFn = src.slice(src.indexOf('window.caExportExcel'), src.indexOf('window.caExportExcel') + 1400);
check('내보내기 함수를 찾았다', exportFn.length > 100);
check('시드 상태면 내보내기를 막는다', /_caSeeded\s*\)/.test(exportFn) && /return;/.test(exportFn));
check('불러오기 실패 상태면 내보내기를 막는다', /_caLoadError/.test(exportFn));

console.log('\n⑤ 별점 되돌리기는 화면만 바꾸면 안 된다(급여와 어긋난다)');
check('별점 초기화가 서버 지각분 API 를 부른다',
      /caResetPenalty[\s\S]{0,900}payroll\/late-minutes/.test(src));
check('일괄 되돌리기도 서버 지각분 API 를 부른다',
      /caBulkReset[\s\S]{0,1400}payroll\/late-minutes/.test(src));
check('되돌린 뒤 서버에서 다시 읽는다', /caResetPenalty[\s\S]{0,1100}loadRecords\(\)/.test(src));

console.log('\n⑥ 급여 계산 → 표 한 줄 변환이 값을 지어내지 않는다');
const grab = (name) => {
  const i = src.indexOf('function ' + name);
  if (i < 0) throw new Error('not found: ' + name);
  let d = 0, started = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; started = true; }
    else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
};
const map = new Function(grab('pad2') + '\n' + grab('mapLessonToRecord') + '\nreturn mapLessonToRecord;')();
const eq = (label, got, want) => check(label + ' → ' + JSON.stringify(got),
                                       JSON.stringify(got) === JSON.stringify(want),
                                       'want=' + JSON.stringify(want));

const L = (o) => Object.assign({ schedule_id: 1, date: '2026-08-01', duration_minutes: 25,
                                 teacher_name: 'T', status: 'finish', late_minutes: 0 }, o);
eq('지각 0 → 규정시각 그대로', map(L({ start_time: '14:00' })).actual, '14:00');
eq('지각 7분 → 14:07',          map(L({ start_time: '14:00', late_minutes: 7 })).actual, '14:07');
eq('지각 7분 → 별점 -7',        map(L({ start_time: '14:00', late_minutes: 7 })).penalty, -7);
eq('지각 30분 → 별점 -10 상한', map(L({ start_time: '09:50', late_minutes: 30 })).penalty, -10);
eq('노쇼 → 입장시각 비움',      map(L({ start_time: '20:00', status: 'teacher_no_show' })).actual, '');
eq('노쇼 → 별점 -10',           map(L({ start_time: '20:00', status: 'teacher_no_show' })).penalty, -10);
eq('예정 수업은 줄을 안 만든다', map(L({ status: 'upcoming' })), null);
eq('시작시각 없으면 비움',      map(L({ start_time: '' })).actual, '');
eq('23:55 + 10분 → 00:05',      map(L({ start_time: '23:55', late_minutes: 10 })).actual, '00:05');

console.log('\n⑦ 서버가 all=1 을 실제로 지원해야 한다(안 그러면 표가 늘 비어 있다)');
const API = join(__dir, '..', 'cloudflare-deploy', 'src', 'api-admin.ts');
const api = readFileSync(API, 'utf8');
check("payroll/lessons 에 all=1 분기가 있다", /searchParams\.get\('all'\)\s*===\s*'1'/.test(api));
check('all=1 은 강사에게 차단된다',
      /searchParams\.get\('all'\)[\s\S]{0,300}isTeacher[\s\S]{0,120}403/.test(api));
check('all=1 이 급여와 같은 계산(computeLessonFeeMonth)을 쓴다',
      /searchParams\.get\('all'\)[\s\S]{0,400}computeLessonFeeMonth/.test(api));

// ⚠️ 요약 형식 주의 — run.mjs 는 마지막 25줄에서 /([1-9]\d*)\s*(?:FAIL|실패)/ 를 찾는다.
//   "PASS 27   FAIL 0" 처럼 쓰면 «27 FAIL» 로 읽혀 통과인데도 배포가 막힌다(실제로 겪음).
//   숫자와 FAIL 사이에 공백 아닌 글자(⚠)를 둔다 — 다른 하니스들과 같은 형식.
console.log(`\n════════════════════════════════════════\n  ✅ PASS ${pass}   ⚠ FAIL ${fail}\n════════════════════════════════════════`);
process.exit(fail ? 1 : 0);
