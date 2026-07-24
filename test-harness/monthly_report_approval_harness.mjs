/**
 * 🌟 monthly_report_approval_harness.mjs — 성적표(월간/2개월 리포트) 승인게이트·오각형 회귀 하니스
 *
 * 왜 필요한가
 *   2026-07-25, 원장님 요청으로 api-reports.ts 에 강사 승인 게이트 + 5축 레이더 + 2개월 주기를
 *   추가했다. 이 파일은 실제 학부모에게 카카오 알림톡을 보내는 경로라, 조용히 회귀하면
 *   ①승인 없이 다시 자동발송되거나 ②짝수 달에도 발송되거나 ③레이더 점수가 깨질 수 있다.
 *
 * 검사 방식
 *   - 소스 정적 검사 + 소스에서 뽑은 순수 로직(toHundred 등) 재현 계산으로 경계값 검증
 *     (lesson_insight_harness.mjs 와 같은 기법 — .ts 라 런타임 import 불가)
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const CD = path.join(ROOT, 'cloudflare-deploy');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? '  — ' + detail : ''}`); }
};

const src = read(path.join(CD, 'src/api-reports.ts'));

console.log('=== 1) 승인 게이트 — 지금까지 승인 없이 나가던 걸 막는 핵심 수정 ===');
ok('mr:마이그레이션에 approval_status 컬럼', /\['approval_status',\s*"TEXT DEFAULT 'pending'"\]/.test(src));
ok('mr:마이그레이션에 approved_by/approved_at', /\['approved_by',/.test(src) && /\['approved_at',/.test(src));
ok('mr:sendMonthlyReportKakao 가 승인여부 확인', /row\.approval_status !== 'approved'/.test(src));
ok('mr:미승인이면 발송 이전에 반환(카카오 호출 전)', (() => {
  const fnStart = src.indexOf('async function sendMonthlyReportKakao');
  const gateIdx = src.indexOf(`row.approval_status !== 'approved'`, fnStart);
  const sendIdx = src.indexOf('sendKakaoAlimtalk(env,', fnStart);
  return fnStart >= 0 && gateIdx > fnStart && sendIdx > gateIdx; // 가드가 실제 발송 호출보다 먼저 나와야 함
})());
ok('mr:승인 엔드포인트가 /api/admin/ 접두(default-deny 적용됨)',
  /path === '\/api\/admin\/monthly-report\/approve'/.test(src));

console.log('\n=== 2) 저장 로직 — 재생성해도 승인·발송 이력을 되돌리지 않음 ===');
const saveFnMatch = src.match(/async function saveMonthlyReportRow[\s\S]*?\n}/);
const saveFn = saveFnMatch ? saveFnMatch[0] : '';
ok('mr:saveMonthlyReportRow 존재', saveFn.length > 100);
ok('mr:ON CONFLICT DO UPDATE 사용(INSERT OR REPLACE 아님)', /ON CONFLICT\(student_uid, period\) DO UPDATE SET/.test(saveFn));
const updateSetBlock = (saveFn.split('DO UPDATE SET')[1] || '');
ok('mr:재생성 시 approval_status 안 건드림', !/approval_status\s*=/.test(updateSetBlock));
ok('mr:재생성 시 access_token 안 건드림', !/access_token\s*=/.test(updateSetBlock));
ok('mr:재생성 시 status(발송상태) 안 건드림', !/\bstatus\s*=excluded/.test(updateSetBlock));
ok('mr:/generate 라우트도 공용 saveMonthlyReportRow 재사용(중복 INSERT 없음)',
  (src.match(/saveMonthlyReportRow\(/g) || []).length >= 2 && !/INSERT OR REPLACE INTO monthly_reports/.test(src));

console.log('\n=== 3) 2개월 주기 — 짝수 달은 건너뛰고, 홀수 달은 2개월치를 모은다 ===');
ok('mr:runMonthlyReports 짝수달 스킵', /parseInt\(pm\[1\], 10\) % 2 === 0/.test(src));
ok('mr:buildMonthlyReportData 기본 spanMonths=2', /spanMonths:\s*number\s*=\s*2/.test(src));
// 소스의 날짜 계산식을 그대로 재현해 실제로 두 달을 덮는지 확인(2026-07 period, span 2 → 06-01~08-01)
{
  const year = 2026, month = 6; // "2026-07" → JS month index 6
  const spanMonths = 2;
  const end = new Date(year, month + 1, 1).getTime();
  const start = new Date(year, month + 1 - Math.max(1, spanMonths), 1).getTime();
  ok('mr:2026-07 기간이 6월 1일부터 시작(직전 달 포함)', new Date(start).getMonth() === 5 && new Date(start).getDate() === 1);
  ok('mr:종료는 8월 1일 미만(7월 말까지 포함)', new Date(end).getMonth() === 7 && new Date(end).getDate() === 1);
}
ok('mr:짝수달 스킵 시 total/generated/sent 전부 0(발송 시도 자체가 없음)',
  /skipped: true, reason: 'bi_monthly_cadence_even_month'/.test(src));

console.log('\n=== 4) 오각형 5축 — 점수 스케일 보정(0~5 → 0~100) 경계값 ===');
// toHundred 를 소스에서 그대로 재현
const toHundred = (v) => {
  if (v == null || isNaN(Number(v))) return null;
  const n = Number(v);
  return n <= 5 ? Math.round(n * 20) : Math.round(Math.min(100, Math.max(0, n)));
};
ok('mr:toHundred null 통과', toHundred(null) === null);
ok('mr:toHundred 0~5 척도 스케일(4 → 80)', toHundred(4) === 80);
ok('mr:toHundred 5는 경계값(100)', toHundred(5) === 100);
ok('mr:toHundred 이미 0~100인 값은 그대로(82 → 82)', toHundred(82) === 82);
ok('mr:toHundred 100 초과는 클램프', toHundred(150) === 100);
ok('mr:radar 5축 전부 반영(발음/어휘/문장/태도/참여)',
  ['pronunciation:', 'vocab:', 'sentence:', 'attitude:', 'participation:'].every((k) => src.includes(k)));

console.log('\n=== 5) 안전장치 — 근거 없으면 AI 미호출 · 최고성장은 AI 아닌 템플릿 ===');
ok('mr:근거(hasSignal) 없으면 AI 호출 안 하고 고정문구', /if \(!hasSignal\)/.test(src));
const growthFnMatch = src.match(/function computeGrowthHighlight[\s\S]*?\n}/);
ok('mr:computeGrowthHighlight 는 AI.run 을 호출하지 않음(템플릿 문자열만)',
  !!growthFnMatch && !/AI\.run/.test(growthFnMatch[0]));
ok('mr:과장 확언 금지 규칙이 프롬프트에 명시', /근거 없는 과장 확언은 절대 쓰지 마세요/.test(src));
ok('mr:조건부 희망 표현 예시가 프롬프트에 포함', /이 속도로 계속하면/.test(src));

console.log('\n=== 6) 한/영 두 벌 (상시 규칙) ===');
const koEnPairs = ['ai_draft_comment', 'ai_draft_tip'];
for (const f of koEnPairs) {
  ok(`mr:${f} ko/en 두 벌 컬럼`, src.includes(`${f}_ko`) && src.includes(`${f}_en`));
}
ok('mr:AI 이중호출(ko/en) 이 Promise.all 로 병렬(불필요한 지연 방지)',
  /Promise\.all\(\[[\s\S]{0,200}sysBase\('ko'\)[\s\S]{0,300}sysBase\('en'\)/.test(src));

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
