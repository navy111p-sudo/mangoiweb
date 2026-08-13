// -*- coding: utf-8 -*-
// 🧾 「NEW TEACHER'S PAGE PROBLEM」 2026-08-13 접수분 하네스
//   실행: node test-harness/teacher_page_problem_260813_harness.mjs
//
//   마이마이(필리핀 매니저) 8/13 신고 3건 + 그 조사에서 나온 정정 2건을 규칙으로 굳힌다.
//     ① 「라이브러리에 MES 교재가 아직 보인다 — server textbooks」
//     ② 「페이지 고르는 창이 바로 닫힌다 · 크기를 못 늘린다 · 페이지 번호가 안 보인다」
//     ③ 「라이브러리 교재가 여전히 느리다」 (8/10·8/11·8/12 포함 5번 반복 신고)
//   + 사장님 결정: 「30분전 연기는 0으로」 (2026-08-13)
//
//   ⚠️ 규칙으로 쓴다 — «그 글자가 있는가» 가 아니라 «그 규칙이 지켜지는가».
//      거리(N자 안)로 보지 않는다. 기능이 붙으면 규칙은 그대로인데 검사만 깨진다(8/13에 실제로 겪었다).
import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try {
  const m = /public\/([\w.-]+\.html)$/.exec(p);
  if (m) return readPageSource(m[1]);
  return readFileSync(resolve(__dir, p), 'utf8');
} catch { return ''; } };

const aapi     = rd('../cloudflare-deploy/src/api-admin.ts');
const index_ts = rd('../cloudflare-deploy/src/index.ts');
const x3       = rd('../cloudflare-deploy/public/js/idx-x3.js');
const main     = rd('../cloudflare-deploy/public/js/idx-main.js');
const idx      = rd('../cloudflare-deploy/public/index.html');
const uploader = rd('../cloudflare-deploy/public/textbook-uploader.html');
const lessons  = rd('../cloudflare-deploy/public/lessons.html');
const curri    = rd('../cloudflare-deploy/public/curriculum.html');
const grid     = rd('../cloudflare-deploy/public/js/idx-grid-menu.js');
const lvtest   = rd('../cloudflare-deploy/public/level-test-ai.html');
const admin    = rd('../cloudflare-deploy/public/admin.html');
const admcore  = rd('../cloudflare-deploy/public/js/adm-core.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

// pdfTogglePageList 함수 «본문» 만 떼어 본다 (거리로 보지 않기 위해)
const _s = main.indexOf('async function pdfTogglePageList');
const _e = main.indexOf('window.pdfTogglePageList =', _s);
const pageListFn = (_s >= 0 && _e > _s) ? main.slice(_s, _e) : '';

console.log('\n[ ①  라이브러리 숨김은 «이름 맞히기» 가 아니라 «사람이 고른 목록» 이다 ]');
/* 8/11 필터가 안 통한 이유: 서버 교재의 묶음 이름은 파일명 앞 [대괄호]에서 나온다.
   실제 이름이 「LEVEL 1~7」·「Mangoi Books」 라 'MES' 라는 글자가 어디에도 없었다. */
check('숨김 목록 테이블이 있다 (지우지 않고 감춘다)',
  /CREATE TABLE IF NOT EXISTS textbook_hidden_books/.test(aapi));
check('관리자가 묶음 목록을 받아 본다 (숨김 여부 포함)',
  /\/api\/admin\/textbook-hidden-books/.test(aapi) && /hidden: hidden\.has/.test(aapi));
check('공개 라이브러리(group=1)가 숨긴 묶음을 뺀다 — 트리·카드·검색이 이 응답 하나를 본다',
  /const hidden = await loadHiddenBooks\(\)[\s\S]{0,300}filter\(\(g: any\) => !hidden\.has/.test(aapi));
check('🔴 파일을 지우는 길은 만들지 않았다 (숨김/되살림뿐)',
  !/DELETE FROM textbook_files/.test(aapi.slice(aapi.indexOf('textbook_hidden_books'), aapi.indexOf('textbook_hidden_books') + 3000)));
check('🔴 라우팅 두 곳에 모두 등록했다 (게이트 + 관리자 판정)',
  (index_ts.match(/\/api\/admin\/textbook-hidden-books/g) || []).length >= 2);
check('🔴 강사는 못 만진다 — 한 명이 체크하면 전 강사의 교재가 사라진다',
  /TEACHER_BLOCKED_PREFIXES[\s\S]{0,2500}'\/api\/admin\/textbook-hidden-books'/.test(index_ts));
check('관리자 화면에 체크박스 목록이 있다 (교재 업로더)',
  /textbook-hidden-books/.test(uploader) && /data-hide-book=/.test(uploader));
check('🔴 저장 실패를 «된 것처럼» 보여주지 않는다 (체크를 되돌린다)',
  /this\.checked = !hidden;/.test(uploader));
check('이름 기반 필터도 남겨 둔다 (JAMES 오탐 방지 낱말경계 포함)',
  /RETIRED_COURSES/.test(x3) && /\(\^\|\[\^A-Z\]\)/.test(x3));

console.log('\n[ ②  페이지 목록 — 고르면 닫히지 않는다 · 크기를 늘린다 ]');
/* "The page window closes immediately after selecting the page, can we let it stay
    until we close it? Also can we resize it, the pages # are not visible…" */
check('🔴 파일을 골라도 창이 닫히지 않는다 (닫는 길은 [✕] 하나뿐)',
  /data-seq[\s\S]{0,600}_pdfPageListMark\(this, 'seq'\)/.test(pageListFn)
  && !/_pdfGoSeqFile\(f\);[\s\S]{0,120}pdfClosePageList\(\);/.test(pageListFn));
check('🔴 파일 안쪽 쪽을 골라도 닫히지 않는다',
  /_pdfPageListMark\(this, 'page'\)/.test(pageListFn)
  && !/_pdfBroadcastPage\(\); \} catch\(_\)\{\}[\s\S]{0,60}pdfClosePageList\(\);/.test(pageListFn));
check('🔴 다시 그리지 않고 «강조만» 옮긴다 (스크롤 위치와 늘린 크기가 초기화되면 안 된다)',
  /function _pdfPageListMark/.test(main) && !/_pdfPageListMark[\s\S]{0,400}pdfTogglePageList\(\)/.test(main));
check('창 크기를 조절할 수 있다 (resize)', /resize:both/.test(pageListFn));
check('🔴 세로도 늘어난다 (max-height 로 묶으면 안 늘어난다 → height 로 준다)',
  /height:min\(58vh,520px\)/.test(pageListFn) && /min-height:160px/.test(pageListFn));
check('늘린 크기를 기억한다 (매 수업 다시 늘리게 하지 않는다)',
  /mangoi_pagelist_size/.test(pageListFn) && /ResizeObserver/.test(pageListFn));
check('파일명 앞에 순번이 붙는다 (BODA 처럼 «몇 번째 쪽» 이 보인다)',
  /\(i \+ 1\) \+ '\. ' \+ nm/.test(pageListFn));
check('여러 쪽 PDF 는 «n쪽 / 총쪽수» 를 보여준다',
  /pdfDoc\.numPages/.test(pageListFn) && /'쪽'\) \+ ' \/ ' \+ pdfDoc\.numPages/.test(pageListFn));
check('🔴 닫는 버튼은 그대로 있다 (열어 두는 것과 «못 닫는 것» 은 다르다)',
  /pdfClosePageList\(\)/.test(pageListFn));

console.log('\n[ ③  교재 느림 — 미리 받는 범위를 넓힌다 ]');
/* 운영 DB 실측(2026-08-13): 38,922개 중 38,860개(99.84%)가 JPG, PDF 는 62개뿐.
   「PDF 가 느리다」의 실체는 «1장=1파일 JPG 를 넘길 때마다 새로 받는 것» 이었다. */
check('앞뒤 여러 장을 미리 받는다 (한 장만 받던 것을 넓혔다)',
  /PDF_PREFETCH_AHEAD/.test(main) && /PDF_PREFETCH_BEHIND/.test(main));
check('뒤로 넘기는 경우도 대비한다 (이전 장도 받아 둔다)',
  /cur - b/.test(main));
check('🔴 동시에 여러 개를 받지 않는다 (수업 회선 WebRTC 와 경쟁하면 안 된다)',
  /_pdfPrefetchBusy/.test(main) && /queue\.shift\(\)/.test(main));
check('🔴 20MB 넘는 파일은 건너뛴다 (받다 만 응답은 캐시에 안 남는다)',
  /20 \* 1024 \* 1024/.test(main) && /r\.body\.cancel\(\)/.test(main));
check('이미 받은 것은 다시 받지 않는다',
  /_pdfPrefetchedUrls\[/.test(main));

console.log('\n[ ④  사장님 결정 — 「30분전 연기는 0으로」 (2026-08-13) ]');
check('규칙이 켜진 채로 들어온다 (0%, enabled=1)',
  /'postponed_early_pay_percent'[\s\S]{0,200}'policy_percent',0,1,/.test(aapi));
check('이미 배포된 DB 도 1회 마이그레이션으로 켠다',
  /early_postpone_on_260813/.test(aapi));
check('🔴 딱 한 번만 돈다 (관리자가 일부러 끈 것을 되켜면 안 된다)',
  /SELECT value FROM payroll_meta WHERE key = 'early_postpone_on_260813'/.test(aapi));
check('🔴 금액(%)은 손대지 않는다 (사장님이 0 이외 값을 넣었다면 그 값을 지킨다)',
  /UPDATE payroll_deduction_rules SET enabled = 1, updated_at = \? WHERE code = 'postponed_early_pay_percent'/.test(aapi)
  && !/UPDATE payroll_deduction_rules SET enabled = 1, amount/.test(aapi));
check('🔴 되돌리는 길이 있다 (끄면 예전 지급률로 복귀)',
  /earlyPostponeOn[\s\S]{0,200}: postponePct;/.test(aapi));

console.log('\n[ ⑤  MES 잔존 — 수업 화면 밖 (2026-08-13 사장님 「커리큘럼 페이지도 빼줘」) ]');
check('동영상 강의의 MES 탭이 기본으로 켜져 있지 않다',
  !/class="tb-tab active" data-tb="MES"/.test(lessons));
check('시작 교재가 MES 가 아니다', !/let curTb = 'MES'/.test(lessons));
check('🔴 지우지 않고 감췄다 (옛 영상·기록은 그대로)',
  /data-tb="MES"/.test(lessons));
/* 🙈 커리큘럼 소개는 «학부모에게 보이는» 곳이라 숫자까지 같이 맞춰야 한다.
   카드만 감추고 제목을 안 고치면 «3종» 이라 써 놓고 2개만 보인다. */
check('커리큘럼: MES 카드를 감췄다',
  /<details class="book-item" style="display:none">[\s\S]{0,300}>MES<\/span>/.test(curri));
check('🔴 커리큘럼: 제목의 교재 수도 함께 고쳤다 (3종 → 2종)',
  /자체 개발 교재 2종/.test(curri) && !/자체 개발 교재 3종"/.test(curri));
check('커리큘럼: 이제 BTS 가 처음 펼쳐진다 (맨 위가 빈 채로 열리지 않게)',
  /<details class="book-item" open>[\s\S]{0,300}>BTS<\/span>/.test(curri));
check('🔴 커리큘럼: 지우지 않고 감췄다 (10년 쓴 교재 설명 원문 보존)',
  /Mango English Study \(MES\)/.test(curri));
check('홈 교재 카드도 같이 고쳤다 — 감춤 + «2종» + 추천표에서 MES 줄 제거',
  /<details class="book-item" style="display:none">/.test(grid)
  && /전용 교재 2종/.test(grid)
  && !/📘 MES<\/td>/.test(grid));
check('🔴 홈 추천표: MES 가 맡던 «처음 시작» 구간을 BTS 가 이어받는다 (빈 구간을 남기지 않는다)',
  /🥤 BTS<\/td>[\s\S]{0,160}Lv 1-5/.test(grid));
check('AI 레벨테스트가 학부모에게 MES 를 추천하지 않는다',
  !/'Starter':'Phonics\(파닉스\) · MES/.test(lvtest) && !/MES \(Mango English Study\)'/.test(lvtest));
check('관리자: 새 영상에 MES 를 «고르는» 목록에서 뺐다 (옛 영상 값은 그대로 보이게 hidden)',
  /<option value="MES" hidden>/.test(admin));
check('🔴 관리자 교재명부 필터: MES 를 지우지 않았다 — 데이터에 있으면 칩이 자동으로 나온다',
  !/'전체교재', 'Phonics', 'MES'/.test(admcore) && /var extra = \{\}/.test(admcore));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
