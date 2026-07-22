// -*- coding: utf-8 -*-
// 🧪 인사평가 근거 분석 하니스 (2026-07-22)
//   실행:  node test-harness/hr_analysis_harness.mjs
//   지키려는 규칙:
//     1) 인사평가 점수를 **프런트에서 지어내지 않는다** — 예전 id 해시 기반 가짜 점수(_hrScore)
//        가 되살아나면 실패시킨다. 인사·급여 판단에 쓰이는 숫자라 근거 없는 값 금지.
//     2) 목록의 점수 셀은 클릭 가능하고 분석 모달(openHrAnalysis)로 연결된다.
//     3) 서버 엔드포인트가 index.ts 인증 게이트에 등록돼 있다(등록 누락 = 404 회귀).
//     4) 근거 없는 항목은 score:null('미측정')로 두고 가중치를 재정규화한다.
//   ※ 총점 계산식 자체는 아래 4)에서 사양(spec) 미러로 검산한다.

import { readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSrc, allAdm } from './_srcbundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const SRC = allSrc();
const ADM = allAdm();
const IDX = read('cloudflare-deploy/src/index.ts');
const CORE = read('cloudflare-deploy/public/js/adm-core.js');
const HR = read('cloudflare-deploy/public/js/adm-hr-analysis.js');
const HTML = read('cloudflare-deploy/public/admin.html');

console.log('\n[1] 가짜 점수 금지 (되살리기 방지)');
check('adm-core.js 에 해시 기반 가짜 점수 생성기(_hrSeed)가 없다', !/function\s+_hrSeed\s*\(/.test(CORE));
check('adm-core.js 에 _hrScore 점수 생성 함수가 없다', !/function\s+_hrScore\s*\(/.test(CORE));
check('프런트가 60+해시 방식으로 점수를 만들지 않는다', !/60\s*\+\s*\(\s*s\s*[%>]/.test(CORE));

console.log('\n[2] 목록 셀 → 분석 모달 연결');
check('점수 셀에 hrv-<id> 앵커가 있다', /id="hrv-'\s*\+\s*t\.id/.test(CORE));
check('순위 셀에 hrr-<id> 앵커가 있다', /id="hrr-'\s*\+\s*t\.id/.test(CORE));
check('점수 셀 클릭이 openHrAnalysis 를 호출한다', /openHrAnalysis\s*&&\s*window\.openHrAnalysis\(/.test(CORE));
check('목록 렌더 후 서버 점수 채우기를 호출한다', /window\.hrFillTeacherScores\s*===?\s*'function'|typeof window\.hrFillTeacherScores === 'function'/.test(CORE));
check('adm-hr-analysis.js 가 hrFillTeacherScores 를 노출한다', /window\.hrFillTeacherScores\s*=/.test(HR));
check('adm-hr-analysis.js 가 openHrAnalysis 를 노출한다', /window\.openHrAnalysis\s*=/.test(HR));
check('admin.html 이 adm-hr-analysis.js 를 defer 로 로드한다',
  /<script src="\/js\/adm-hr-analysis\.js\?v=\d+" defer><\/script>/.test(HTML));
check('모달이 서버 상세 API 를 호출한다', /teacher-hr-analysis\?id=/.test(HR));
check('데이터 없는 강사는 점수를 만들지 않고 "데이터 없음" 표시', /데이터 없음/.test(HR));

console.log('\n[3] 서버 라우트·인증 게이트');
check('api-admin 에 /api/admin/teacher-hr-analysis 핸들러가 있다',
  /path === '\/api\/admin\/teacher-hr-analysis'/.test(SRC));
check('index.ts 인증 게이트에 등록돼 있다 (미등록이면 404)',
  /path === '\/api\/admin\/teacher-hr-analysis'/.test(IDX));
check('강사는 남의 인사평가를 볼 수 없다(본인 스코프 체크)',
  /본인 인사평가만 조회할 수 있습니다/.test(SRC));
check('집계는 실제 기록 테이블에서만 온다',
  /FROM class_ratings/.test(SRC) && /FROM class_schedules/.test(SRC)
  && /lesson_late_minutes/.test(SRC) && /class_no_show/.test(SRC)
  && /FROM student_evaluations/.test(SRC) && /FROM teacher_praises/.test(SRC));
check('근거 없는 항목은 score:null 로 내려간다', /score: null/.test(SRC));

console.log('\n[4] 총점 계산 사양 미러 — 측정된 항목만 가중치 재정규화');
//   서버 로직과 같은 식: total = Σ(score×weight) / Σ(weight of measured)
function total(cats) {
  const m = cats.filter(c => c.score != null);
  const w = m.reduce((s, c) => s + c.weight, 0);
  return w > 0 ? Math.round((m.reduce((s, c) => s + c.score * c.weight, 0) / w) * 10) / 10 : null;
}
const W = { cls: 0.25, ret: 0.30, punct: 0.20, admin: 0.15, contr: 0.10 };
check('가중치 합계는 1.0', Math.abs(Object.values(W).reduce((a, b) => a + b, 0) - 1) < 1e-9);
check('전 항목 측정 시 단순 가중평균',
  total([{ weight: W.cls, score: 80 }, { weight: W.ret, score: 80 }, { weight: W.punct, score: 80 },
         { weight: W.admin, score: 80 }, { weight: W.contr, score: 80 }]) === 80);
check('미측정 항목은 총점을 끌어내리지 않는다 (0점 취급 금지)',
  total([{ weight: W.cls, score: 90 }, { weight: W.ret, score: null }, { weight: W.punct, score: null },
         { weight: W.admin, score: null }, { weight: W.contr, score: null }]) === 90);
check('일부만 측정되면 남은 항목끼리 재정규화',
  //  수업 90(0.25) + 근태 70(0.20) → (90×.25 + 70×.20) / .45 = 81.1
  total([{ weight: W.cls, score: 90 }, { weight: W.ret, score: null }, { weight: W.punct, score: 70 },
         { weight: W.admin, score: null }, { weight: W.contr, score: null }]) === 81.1);
check('측정된 항목이 하나도 없으면 총점은 null (0점 아님)',
  total([{ weight: W.cls, score: null }, { weight: W.ret, score: null }]) === null);

console.log('\n[5] 평가 구성(항목·배점) 안내');
// 경량화(2026-07-22) 이후: 상세 모달에는 막대만, 설명 제목은 「📋 평가 기준」 모달로 옮겼다
check('배점 구성 막대가 있다', /function weightBar\(/.test(HR));
check('배점 설명은 평가 기준 모달이 담당한다', /인사평가 기준/.test(HR));
check('항목별 색·설명 정의(CATS)가 5개다', (HR.match(/ko_desc:/g) || []).length === 5);
check('배점이 25/30/20/15/10 으로 서버 가중치와 같다',
  /w: 25,/.test(HR) && /w: 30,/.test(HR) && /w: 20,/.test(HR) && /w: 15,/.test(HR) && /w: 10,/.test(HR));
check('실제 숫자로 된 계산식을 보여준다', /function formulaLine\(/.test(HR) && /계산식/.test(HR));
check('미측정이 있으면 항목별 "실제 적용 배점"을 함께 표시', /실제 /.test(HR) && /applied/.test(HR));
check('강사 선택 없이 기준만 보는 모달이 있다', /window\.openHrCriteria\s*=/.test(HR));
check('목록 위에 "평가 기준" 버튼이 있다',
  /id="tp-hr-criteria"[^>]*onclick="window\.openHrCriteria/.test(HTML));
check('기준 모달이 미측정 처리 방식을 설명한다', /0점으로 깎지 않습니다/.test(HR));

console.log('\n[6] 🌐 한/영 이중언어 (강사 다수가 필리핀·외국인 — 사장님 상시 지시)');
//   라벨만 영어고 근거 문장이 한국어로 남는 것이 실제 사고 지점이라 서버 응답까지 검사한다.
const ADMTS = read('cloudflare-deploy/src/api-admin.ts');
// 인사평가 엔드포인트 구간만 잘라서 센다 (source: 같은 흔한 키가 다른 기능에도 있으므로)
const HRBLOCK = ADMTS.slice(
  Math.max(0, ADMTS.indexOf("path === '/api/admin/teacher-hr-analysis'")),
  ADMTS.indexOf("path === '/api/teacher/mbti-self'")
);
const cnt = (re) => (HRBLOCK.match(re) || []).length;
check('인사평가 엔드포인트 구간을 찾았다', HRBLOCK.length > 3000);
check('카테고리 10개 분기 모두 label_en 이 있다 (측정/미측정 × 5항목)', cnt(/label_en:/g) >= 10);
check('근거 문장 fact 에 영어판(fact_en)이 함께 간다', cnt(/\bfact:/g) === cnt(/\bfact_en:/g) && cnt(/\bfact:/g) === 10);
check('출처 source 에 영어판(source_en)이 함께 간다', cnt(/\bsource:/g) === cnt(/\bsource_en:/g) && cnt(/\bsource:/g) === 10);
check('수동 평가 등급도 영어 라벨을 만든다', /grade_en/.test(SRC));
check('프런트가 언어별 필드 선택 헬퍼(F)를 쓴다', /function F\(obj, field\)/.test(HR));
check('근거·출처를 F() 로 뽑는다', /F\(c, 'fact'\)/.test(HR) && /F\(c, 'source'\)/.test(HR));
check('한국어 학생 의견은 영어 화면에서 자동 번역한다',
  /\/api\/translate/.test(HR) && /function translateComments/.test(HR));
// 🔴 외국(영문 이름) 강사는 로그인 직후 첫 화면부터 영어여야 한다.
//    window.adminLang 은 오랫동안 **어디에서도 대입되지 않아 undefined** 였고,
//    그 값을 보는 영어 분기 30여 곳이 전부 죽어 있었다. 되풀이 방지용 가드.
const BOOT = (HTML.match(/<script id="adm-lang-boot">([\s\S]*?)<\/script>/) || ['',''])[1];
check('adm-lang-boot 이 head 에 있다', BOOT.length > 200);
check('부팅 시 window.adminLang 을 대입한다 (undefined 회귀 방지)', /window\.adminLang\s*=/.test(BOOT));
check('영문 이름 계정을 영어로 판정한다', /hasKo\(/.test(BOOT) && /mangoi_admin_session/.test(BOOT));
check('사용자가 고른 언어(mangoi_lang)가 이름 판정보다 우선', /getItem\('mangoi_lang'\)/.test(BOOT));
check('언어 변경 시 adminLang 도 따라간다', /attributeFilter: \['lang'\]/.test(BOOT) && /mangoi_lang/.test(BOOT));

console.log('\n[6-2] ⚡ 경량화 — 관리자 화면은 이미 무겁다');
check('인사평가 열이 숨겨져 있으면 집계 API 를 부르지 않는다', /hr-hidden/.test(HR));
check('항목 출처는 본문이 아니라 툴팁으로', /title="' \+ esc\(F\(c, 'source'\)\)/.test(HR));
check('상세 모달에서 범례 줄을 빼고 항목 색점으로 대신한다',
  !/weightLegend\(it\.categories\)/.test(HR) && /weightBar\(it\.categories\)/.test(HR));
check('요약과 신뢰도를 한 덩어리로 합쳤다', !/신뢰도 미측정/.test(HR) && /100%로 환산했습니다/.test(HR));

console.log('\n[7] 관리자 수동 평가(기존 5점 척도)와의 연결');
check('상세 응답에 관리자 수동 평가를 붙인다', /manual_evaluation/.test(SRC));
check('teacher_evaluations 를 이름으로 연결한다',
  /FROM teacher_evaluations te JOIN teachers t ON t\.id = te\.teacher_id/.test(SRC));
check('모달이 수동 평가를 자동 점수와 구분해 보여준다',
  /위 자동 점수와는 별개 기록입니다/.test(HR));

console.log(`\n════ 인사평가 근거 분석 하니스: PASS ${PASS} / FAIL ${FAIL} ════`);
if (FAIL) { console.log('실패 항목:\n  - ' + FAILS.join('\n  - ')); process.exit(1); }
