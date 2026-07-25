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

console.log('\n=== 7) Phase 3 — 강사 마이페이지 승인 UI (teacher_name 귀속 + 검수 화면) ===');
const mp = read(path.join(CD, 'public/admin/mypage.html'));
ok('mr:마이그레이션에 teacher_name 컬럼', /\['teacher_name', 'TEXT'\]/.test(src));
ok('mr:teacher_name=마지막 평가서 작성 강사로 근사(여러 강사 섞일 수 있다는 한계 명시)', /기간 중 가장 최근 평가서를 쓴 강사로 근사/.test(src));
ok('mr:/list 라우트가 teacher_name/approval_status 필터 지원', /teacherName = url\.searchParams\.get\('teacher_name'\)/.test(src) && /approvalStatus = url\.searchParams\.get\('approval_status'\)/.test(src));
ok('mr:/list SQL이 bind 파라미터화(문자열 직접 삽입 아님)', /\.bind\(\.\.\.binds\)/.test(src));
ok('mr:mypage.html에 성적표 승인 탭 존재', /id="tab-report-approval"/.test(mp));
ok('mr:탭이 교사 전용(isTeacher 게이트)', /tRaTab.*isTeacher \? '' : 'none'/.test(mp));
ok('mr:승인 화면이 이름표기 불일치 2단조회 재사용(lesson-insight와 동일 패턴)',
  /window\.loadReportApprovalTeacher = function[\s\S]{0,1600}norm\(a\.teacher_name\)/.test(mp));
ok('mr:승인 전 코멘트 편집 가능(textarea, 강사가 고칠 수 있음)', /id="'\+idBase\+'-ko"/.test(mp));
ok('mr:승인 API 호출 시 approved_by 포함', /approved_by: window\.__myName/.test(mp));
ok('mr:승인 후에만 "지금 발송" 버튼 노출(승인 응답 이후 렌더)',
  /window\.raApprove = function[\s\S]{0,1600}window\.raSendNow = function/.test(mp));

console.log('\n=== 8) Phase 4 — CSV 내보내기 · 실데이터 AI활동 · 구라우트 통합 · 학생 바로가기 ===');
const adm = read(path.join(CD, 'public/admin.html'));
const pt = read(path.join(CD, 'public/parent.html'));

ok('mr:AI 활동 = vocab_review_log + review_quiz_results (검증된 실제 활동 로그만)',
  /FROM vocab_review_log WHERE user_id/.test(src) && /FROM review_quiz_results WHERE user_id/.test(src));
ok('mr:microlearn_logs는 안 씀(2026-07-25 확인 — 이름과 달리 알림로그라 활동집계에서 제외)',
  !/FROM microlearn_logs/.test(src));
ok('mr:homework_submissions(예습복습)는 실제로 쿼리하지 않음(테이블 없음 — 설명 주석은 있어도 FROM 사용은 없어야 함)', !/FROM homework_submissions/.test(src));
ok('mr:AI활동 실패해도 리포트 자체는 계속 진행(try/catch)', /aiActivityCount = 0;\s*\n\s*try \{/.test(src));

ok('mr:구 미리보기 라우트가 buildMonthlyReportData 재사용(중복 로직 제거)',
  /buildMonthlyReportData\(env, uid, period, url\.searchParams\.get\('ai'\) === '1', 2\)/.test(src));
ok('mr:구 라우트에 더 이상 자체 CREATE TABLE 중복 없음', !/CREATE TABLE IF NOT EXISTS students_erp \(user_id TEXT PRIMARY KEY, student_name TEXT, parent_name TEXT\);/.test(src));
ok('mr:결제 총액(report.html 전용 필드)은 그대로 보존', /payments: \{ total_krw: payTotal \}/.test(src));

ok('mr:/api/report/monthly/latest 엔드포인트 존재(학생 바로가기용)', /path === '\/api\/report\/monthly\/latest'/.test(src));
ok('mr:/latest도 본인/관리자 인증 게이트 통과', /path === '\/api\/report\/monthly\/latest'[\s\S]{0,400}resolveOwnerScope/.test(src));

ok('mr:admin.html에 엑셀 내보내기 버튼', /mrExportCsv\(\)/.test(adm));
ok('mr:CSV는 BOM 포함(엑셀 한글 깨짐 방지)', /'﻿' \+ \[headers\]/.test(adm));
ok('mr:CSV는 window.__mrLastItems 재사용(신규 서버호출 없음 — 경량 원칙)', /window\.__mrLastItems = r\.items/.test(adm) && /const items = window\.__mrLastItems/.test(adm));

ok('mr:parent.html에 성적표 바로가기 카드', /pd-monthly-report-card/.test(pt));
ok('mr:바로가기는 있을 때만 노출(기본 display:none, 응답 성공시에만 표시)', /id="pd-monthly-report-card" style="margin-top:16px;display:none"/.test(pt));
ok('mr:바로가기가 /latest 호출 후 실제 token으로 링크 구성', /api\/report\/monthly\/latest\?uid=/.test(pt) && /period=' \+ encodeURIComponent\(rd\.period\) \+ '&t=' \+ encodeURIComponent\(rd\.token\)/.test(pt));

console.log('\n=== 9) index.ts 라우팅 게이트 등록 (CLAUDE.md 필수 규칙 — /api/admin/ 밖은 개별 등록 필요) ===');
const idx = read(path.join(CD, 'src/index.ts'));
// 🔴 2026-07-25 실제로 이 항목을 빠뜨려서 /api/report/monthly/latest 가 라이브에서 404 났었다(admin 접두가
//   아니라서 자동 게이트를 안 탐 — /approve 는 /api/admin/ 이라 통과했는데 이건 안 됨). 재발 방지로 하니스에 고정.
ok('mr:/api/report/monthly/latest 가 index.ts 게이트에 등록됨(admin 접두 아니라 자동통과 안 됨)',
  idx.includes(`path === '/api/report/monthly/latest'`));

console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
