// -*- coding: utf-8 -*-
// ⏸ 연기 수업 현황 하네스 (2026-07-23) — 의존성 없음 · node 로 바로 실행
//   실행:  node test-harness/postponed_classes_harness.mjs
//   대상:  GET /api/admin/postponed-classes (api-admin.ts)
//          + /admin/postponed-classes 페이지 라우팅/게이트 (index.ts)
//          + public/admin/postponed-classes.html (매니저 화면)
//
//   ⚠️ 이 화면은 필리핀 매니저가 매일 보는 화면이라 두 가지가 특히 중요하다:
//      ① 유료/무료 판정 방향이 뒤집히면 안 된다(30분 '전보다 일찍'=무료).
//      ② 시각은 KST 로 그려야 한다(브라우저 로컬시간으로 그리면 필리핀에서만 1시간 어긋남).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond){
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const API   = R('../cloudflare-deploy/src/api-admin.ts');
const INDEX = R('../cloudflare-deploy/src/index.ts');
const PAGE_PATH = resolve(__dir, '../cloudflare-deploy/public/admin/postponed-classes.html');
const ADMIN = R('../cloudflare-deploy/public/admin.html');

console.log('\n[ 1. 백엔드 엔드포인트 ]');
check('GET /api/admin/postponed-classes 핸들러 존재', /path === '\/api\/admin\/postponed-classes'/.test(API));
check('연기 요청(schedule_change_requests) 을 읽는다', /FROM schedule_change_requests WHERE created_at/.test(API));
check('변경이력(class_audit_log) 도 합친다', /listClassAudit\(env, \{ from, to/.test(API));
check("승인분 중복 제외(source==='schedule-request')", /a\.source === 'schedule-request'\) continue/.test(API));
check('강사 로그인은 본인 것만', /_pcActor\.isTeacher[\s\S]{0,200}teacherQ = _pcActor\.name/.test(API));
check('정책 상수 30분이 코드에 있음', /FREE_IF_MINUTES_BEFORE_GT = 30/.test(API));
check('응답에 policy 를 실어 화면이 규칙을 설명할 수 있음', /policy: \{ free_if_minutes_before_gt/.test(API));

console.log('\n[ 2. 유료/무료 판정 — 방향이 뒤집히면 정산 사고 ]');
// 서버 코드와 동일한 규칙을 여기서 독립 구현해 경계값을 고정한다.
const feeOf = (m) => (m === null ? null : (m > 30 ? 'free' : 'paid'));
check('수업 2시간 전 연기 = 무료', feeOf(120) === 'free');
check('31분 전 연기 = 무료(경계 바로 바깥)', feeOf(31) === 'free');
check('30분 전 연기 = 유료(경계값 포함)', feeOf(30) === 'paid');
check('5분 전 연기 = 유료', feeOf(5) === 'paid');
check('수업 시작 후 연기 = 유료', feeOf(-10) === 'paid');
check('원 수업 일시를 모르면 판정 불가(null)', feeOf(null) === null);
// 서버가 쓰는 KST 파싱이 실제로 KST 로 해석되는지 (UTC 로 새면 9시간 어긋남)
const startKst = Date.parse('2026-07-23T21:00:00+09:00');
check('KST 파싱 정확(21:00 KST = 12:00 UTC)', new Date(startKst).toISOString() === '2026-07-23T12:00:00.000Z');
const requestedAt = Date.parse('2026-07-23T20:45:00+09:00');   // 15분 전 요청
check('KST 기준 분차 계산 = 15분 → 유료', feeOf(Math.round((startKst - requestedAt) / 60000)) === 'paid');

// 🔴 사장님 확정 예시 (26-07-23) — 이 두 줄이 이 규칙의 정본이다. 바뀌면 여기부터 고칠 것.
//    "7시30분 수업인데 6시59분에 연기하면 무료, 7시 3분에 연기하면 유료."
//    = 수업 30분 전 선(=19:00)을 넘기 전이면 무료, 넘긴 뒤면 유료.
const lesson1930 = Date.parse('2026-07-24T19:30:00+09:00');
const minsTo1930 = (hhmm) => Math.round((lesson1930 - Date.parse('2026-07-24T' + hhmm + ':00+09:00')) / 60000);
check('사장님 예시 ① 19:30 수업 · 18:59 연기 = 무료(31분 전)', minsTo1930('18:59') === 31 && feeOf(minsTo1930('18:59')) === 'free');
check('사장님 예시 ② 19:30 수업 · 19:03 연기 = 유료(27분 전)', minsTo1930('19:03') === 27 && feeOf(minsTo1930('19:03')) === 'paid');
check('경계선 19:00 정각 = 유료(30분 이내에 포함)', minsTo1930('19:00') === 30 && feeOf(minsTo1930('19:00')) === 'paid');
check('경계선 18:59 직전 19:01 = 유료', feeOf(minsTo1930('19:01')) === 'paid');

console.log('\n[ 3. 라우팅·인증 게이트 (빠지면 404 또는 무인증 노출) ]');
check('API 가 admin 라우팅 게이트에 등록됨', /path === '\/api\/admin\/postponed-classes' \|\|/.test(INDEX));
check('페이지 확장자 없는 주소가 .html 로 연결됨', /\/admin\/postponed-classes\.html' \+ url\.search/.test(INDEX));
check('페이지가 isAdminPath 로그인 게이트에 등록됨', /path === '\/admin\/postponed-classes' \|\| path === '\/admin\/postponed-classes\/'/.test(INDEX));

console.log('\n[ 4. 매니저 화면 ]');
check('페이지 파일 존재', existsSync(PAGE_PATH));
const PAGE = existsSync(PAGE_PATH) ? readFileSync(PAGE_PATH, 'utf8') : '';
check('영어 기본(로그인 언어 미설정 시 en)', /localStorage\.getItem\('mangoi_lang'\) \|\| 'en'/.test(PAGE));
check('공용 언어키 mangoi_lang 사용(구키 mango_lang 아님)', PAGE.includes("'mangoi_lang'") && !/['"]mango_lang['"]/.test(PAGE));
check('한/영 사전 두 벌 존재', /I18N = \{[\s\S]*en: \{/.test(PAGE) && /ko: \{/.test(PAGE));
check('요금 규칙 설명이 영어에도 있음', /more than 30 minutes before/.test(PAGE));
check('요금 규칙 설명이 한국어에도 있음', /30분 전보다 일찍/.test(PAGE));
check('시각을 KST 고정으로 그림(로컬시간 아님)', /function kst\(ms\)\{ return fmtAt\(ms, 9\); \}/.test(PAGE));
check('필리핀 시간(PHT) 보조 표기', /function pht\(ms\)\{ return fmtAt\(ms, 8\); \}/.test(PAGE));
check('유료/무료 배지 렌더', /function feeBadge/.test(PAGE) && /b-paid/.test(PAGE) && /b-free/.test(PAGE));
check('추정치는 추정이라고 표시', /fee_estimated\?'<span class="est">/.test(PAGE));
check('연기시각 + 수업까지 남은시간 함께 표시', /lead:function\(m\)/.test(PAGE));
check('CSV 내려받기 제공', /csvHead/.test(PAGE) && /a\.download = d\.csvName/.test(PAGE));
check('모바일 카드 레이아웃 존재', /class="m-card"/.test(PAGE));
check('PC 확대는 페이지 자체 zoom:1.3 (공용 CSS 아님)', /min-width: 1024px\) \{ body \{ zoom: 1\.3; \} \}/.test(PAGE));
check('이모지 Unicode 13 미만만 사용(ZWJ 조합 없음)', !/‍/.test(PAGE));

console.log('\n[ 5. admin.html 진입 동선 — 못 찾으면 없는 기능과 같다 ]');
check('상단 사용자 메뉴에 링크', /href="\/admin\/postponed-classes"[^>]*data-ko="⏸ 연기 수업 현황"/.test(ADMIN));
check('좌측 사이드바(강사 통합)에 링크', /location\.href='\/admin\/postponed-classes'/.test(ADMIN));
check('기존 연기요청·변경이력 카드에서 바로가기 2곳', (ADMIN.match(/href="\/admin\/postponed-classes"/g) || []).length >= 3);

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { console.log('실패:', FAILS.join(', ')); process.exit(1); }
