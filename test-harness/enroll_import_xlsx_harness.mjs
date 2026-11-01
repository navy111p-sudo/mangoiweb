// 📥 수강신청 «파일 가져오기» 진짜 엑셀(.xlsx) — adm-core.js 의 _enXlsxCell·_enRowsToCsv 와
//   importEnrollmentFromFile 의 갈래를 소스에서 오려 내 실제로 돌린다(문자열 검사 아님).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.CORE_SRC || path.join(ROOT, 'cloudflare-deploy/public/js/adm-core.js');
const code = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };

function fnAt(name) {
  const i = code.indexOf((name.startsWith('async ') ? '' : 'function ') + name + '(');
  if (i < 0) return '';
  const b = code.indexOf('{', code.indexOf(')', i));
  let d = 0;
  for (let k = b; k < code.length; k++) { if (code[k] === '{') d++; else if (code[k] === '}') { d--; if (!d) return code.slice(i, k + 1); } }
  return '';
}
const cellSrc = fnAt('_enXlsxCell'), rowsSrc = fnAt('_enRowsToCsv'), csvSrc = fnAt('_parseCsvEnrollments'), lineSrc = fnAt('_parseCsvLine');
ok('전제: 함수들을 오려 냄', !!(cellSrc && rowsSrc && csvSrc && lineSrc));
let toCsv, parseCsv;
try {
  const norm = (r) => ({ ...r });
  toCsv = new Function(cellSrc + '\n' + rowsSrc + '\nreturn _enRowsToCsv;')();
  parseCsv = new Function('_normalizeEnrollment', lineSrc + '\n' + csvSrc + '\nreturn _parseCsvEnrollments;')(norm);
} catch (e) { ok('함수 만들기', false, String(e)); }

if (toCsv && parseCsv) {
  let recs = [];
  try {
    // 머리글 + 여러 줄. 엑셀이 저장한 모양 그대로 — 시작일은 일련번호, 시간은 하루의 비율.
    const rows = [
      ['학생 이름', '학생 UID', '수업 유형', '요일', '시간', '시작일', '월 수강료'],
      ['홍길동', 'hong01', '정규', '월수', '0.7916666666666666', '46329', '50000'],
      ['김, 하나', 'kim02', '체험', '화', '19:30', '2026-11-04', ''],
      ['', '', '', '', '', '', ''],
    ];
    recs = parseCsv(toCsv(rows));
  } catch (e) { ok('실행', false, String(e)); }
  ok('빈 줄 빼고 2명', recs.length === 2, recs.length);
  ok('시작일 일련번호 → 날짜', recs[0] && recs[0].started_at === '2026-11-03', recs[0] && recs[0].started_at);
  ok('시간 비율 → 19:00', recs[0] && recs[0].time === '19:00', recs[0] && recs[0].time);
  ok('수강료 숫자는 그대로(짝)', recs[0] && recs[0].monthly_fee_krw === '50000', recs[0] && recs[0].monthly_fee_krw);
  ok('쉼표 든 이름 보존', recs[1] && recs[1].student_name === '김, 하나', recs[1] && recs[1].student_name);
  ok('글자로 적힌 날짜·시간은 그대로(짝)', recs[1] && recs[1].started_at === '2026-11-04' && recs[1].time === '19:30', recs[1]);

  // 「항목,값」 한 사람 모양
  let one = [];
  try { one = parseCsv(toCsv([['항목', '값'], ['학생 이름', '이삼'], ['시작일', '46330'], ['시간', '0.75'], ['학생 UID', '20000123']])); } catch (e) { ok('항목/값 실행', false, String(e)); }
  ok('항목/값 → 1명', one.length === 1, one.length);
  ok('항목/값 시작일 변환', one[0] && one[0].started_at === '2026-11-04', one[0]);
  ok('항목/값 시간 변환', one[0] && one[0].time === '18:00', one[0]);
  ok('날짜 아닌 칸의 5자리 숫자는 안 바꿈(짝)', one[0] && one[0].student_user_id === '20000123', one[0]);
}

// 갈래: zip(PK) 이면 엑셀 경로, 옛 .xls(D0CF11E0) 은 안내, 나머지는 예전대로 text()
const imp = fnAt('async importEnrollmentFromFile') || code.slice(code.indexOf('async function importEnrollmentFromFile'), code.indexOf('function importEnrollmentFromKakao'));
ok('zip 머리(PK)로 가른다', /head\[0\] === 0x50 && head\[1\] === 0x4B/.test(imp));
ok('zip 이면 _enXlsxToCsv 를 거쳐 CSV 파서로', /_enXlsxToCsv\(await file\.arrayBuffer\(\)\)/.test(imp) && /_renderImportPreview\(_parseCsvEnrollments\(text\)/.test(imp));
ok('엑셀 경로가 text() 보다 앞', imp.indexOf('_enXlsxToCsv') > 0 && imp.indexOf('_enXlsxToCsv') < imp.indexOf('await file.text()'));
ok('옛 .xls 는 안내', /0xD0 && head\[1\] === 0xCF/.test(imp));
ok('읽기 정본을 빌린다(복제 없음)', /window\.__smBulk/.test(fnAt('async _enXlsxToCsv') || code) && !/DecompressionStream/.test(code));

console.log(`enroll_import_xlsx_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
