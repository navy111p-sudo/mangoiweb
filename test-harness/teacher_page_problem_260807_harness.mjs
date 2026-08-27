// -*- coding: utf-8 -*-
// 🧾 「NEW TEACHER'S PAGE PROBLEM (2)」(마이마이, 2026-08-07 · 17건) 하네스
//   실행: node test-harness/teacher_page_problem_260807_harness.mjs
//
//   앞선 12건 하네스(teacher_page_feedback_260808_harness.mjs)와 «겹치지 않는» 것만 여기서 본다.
//   겹치는 항목(②수업료 열 · ④연기버튼 · ⑯매니저 차단 · ⑬왼쪽정렬)은 그 파일이 이미 지킨다.
//
//   ⚠️ 규칙으로 쓴다 — «그 글자가 있는가» 가 아니라 «그 규칙이 지켜지는가».
//      (실제로 이번에도 prompt→작은 창 리팩터링에서 옛 하네스 2건이 깨졌다)
//   ⛔ 검사 대상이 아닌 항목: ⑫ RAM 증설(하드웨어) · ⑰ 샘플 교재가 MES 였다(자료 관찰, 문서도 "No changes")
import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';   // 분해 대응: 페이지 코드 전체를 읽는다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try {
  // 분해 대응: public/*.html 은 «그 페이지가 로드하는 스크립트까지» 읽는다
  const m = /public\/([\w.-]+\.html)$/.exec(p);
  if (m) return readPageSource(m[1]);
  return readFileSync(resolve(__dir, p), 'utf8');
} catch { return ''; } };

const tapi   = rd('../cloudflare-deploy/src/api-teacher.ts');
const mapi   = rd('../cloudflare-deploy/src/api-mango.ts');
const aapi   = rd('../cloudflare-deploy/src/api-admin.ts');
const thtml  = rd('../cloudflare-deploy/public/teacher.html');
const mypage = rd('../cloudflare-deploy/public/admin/mypage.html');
const idx    = rd('../cloudflare-deploy/public/index.html');
const q6     = rd('../cloudflare-deploy/public/js/adm-q6.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ①  레벨테스트도 「내 수업」 목록에 보인다 ]');
/* "Level test classes can also be found in My classes."
   원인: 마이페이지 「📚 내 수업」에는 **개별 수업 목록 자체가 없었다**(카운트다운 1건 + 요일별 «몇 타임»).
   레벨테스트는 🎯 신청 탭에만 있었는데 그건 «신청» 이지 «내 수업» 이 아니다. */
check('내 수업 탭에 개별 수업 목록이 있다', /id="tw-next-list"/.test(mypage));
check('목록이 유형(레벨테스트·체험·보강)을 구분해 보여준다',
  /tw-next-list[\s\S]{0,4000}?level_test[\s\S]{0,600}?trial[\s\S]{0,600}?makeup/.test(mypage));
check('유형은 서버가 준 값(lesson_type)으로만 판정한다 (화면이 다시 추측하지 않는다)',
  /KIND\[String\(l\.lesson_type/.test(mypage));
check('🔴 수업이 0건일 때 «불러오는 중…» 으로 남지 않는다',
  /if \(!lessons\.length\)\{[\s\S]{0,400}tw-next-list[\s\S]{0,300}\}/.test(mypage));
check('레벨테스트 예약이 class_schedules 로 들어간다 (그래서 이 목록에 잡힌다)',
  /INSERT INTO class_schedules[\s\S]{0,200}'level_test'/.test(rd('../cloudflare-deploy/src/leveltest-schedule.ts')));

console.log('\n[ ②  수업료 — 「언제 연기했나」로 금액이 갈린다 ]');
/* 문서 규칙: 시작 30분 이내 연기 = 50php(전액) · 30분보다 이른 연기 = 0php.
   판정은 요청 시점에 이미 끝나 있다(schedule_change_requests.fee_type paid/free) → 여기서 다시 계산하지 않는다. */
check('연기 지급률이 요청 시점 판정(fee_type)을 읽는다', /pFeeType === 'free'/.test(aapi));
check('🔴 판정 근거가 없는 연기는 기존 규칙 그대로 (모르는 것을 «사전 연기» 로 단정하지 않는다)',
  /pFeeType === 'free' \? earlyPostponePct : postponePct/.test(aapi));
/* ⚠️ (2026-08-13) 이 검사는 원래 «꺼진 채로 들어온다» 였다 — 코드가 급여를 조용히 바꾸지
   못하게 막는 규칙이었다. 오늘 **사장님이 「30분전 연기는 0으로」 결정**하셨으므로
   규칙 자체가 바뀌었다. 이제 검사할 것은 «꺼짐» 이 아니라 다음 셋이다:
     ① 켜진 채로 들어온다(0%, enabled=1)  ② 이미 배포된 DB 도 1회 마이그레이션으로 켠다
     ③ 되돌리는 길이 남아 있다(관리자가 끄면 예전 계산으로 복귀) */
check('🔴 사전 연기 0% 규칙이 «켜진 채로» 들어온다 (2026-08-13 사장님 결정)',
  /'postponed_early_pay_percent'[\s\S]{0,200}'policy_percent',0,1,/.test(aapi));
check('🔴 이미 배포된 DB 도 1회 마이그레이션으로 켠다 (INSERT OR IGNORE 는 기존 행을 안 건드린다)',
  /early_postpone_on_260813[\s\S]{0,400}UPDATE payroll_deduction_rules SET enabled = 1[\s\S]{0,120}postponed_early_pay_percent/.test(aapi));
check('🔴 되돌리는 길이 있다 (관리자가 끄면 예전 지급률로 복귀)',
  /earlyPostponeOn[\s\S]{0,200}: postponePct;/.test(aapi));
check('규칙이 꺼져 있으면 기존 지급률과 같다', /earlyPostponeOn[\s\S]{0,200}: postponePct;/.test(aapi));
check('강사 화면이 «왜 이 금액인지» 를 한 줄로 설명한다', /postpone_fee_type/.test(mypage));
check('요청 기록은 마지막 승인만 쓴다 (여러 번 요청했을 때)',
  /postponeReq\[k\][\s\S]{0,200}created_at/.test(aapi));
check('표에 «단위: 페소» 가 적혀 있다 (원화 오해 방지)', /Unit: PHP|단위: 페소/.test(mypage));

console.log('\n[ ⑤⑪ 강사 문은 그날 하루 종일 열려 있다 ]');
/* ⑤ "Can class be open even before the class?" · ⑪ "Can we enter the class anytime…
   Class extension is not possible if we close the class." */
check('서버가 «들어갈 수 있는 창» 을 따로 내려준다', /enter_from_ts/.test(tapi) && /enter_until_ts/.test(tapi));
check('그 창이 그날 00:00~24:00 이다',
  /enterFromTs = Date\.UTC\(kY, kMo, kD, 0, 0, 0\) - KST/.test(tapi)
  && /enterUntilTs = enterFromTs \+ 86400000 - 1/.test(tapi));
check('🔴 «수업 시간인가»(join_open)와 «들어갈 수 있나»(can_enter)를 섞지 않는다',
  /join_open: now >= open_at_ts/.test(tapi) && /can_enter: now >= enterFromTs/.test(tapi));
check('🔴 학생 입장 창은 건드리지 않았다 (29,000명 전체의 입장 시각)',
  /OPEN_BEFORE/.test(mapi) && !/enter_from_ts/.test(mapi));
check('시작 전에는 [미리 입장] 이 눌린다 (비활성 «N분 뒤 입장» 이 아니다)',
  /btn-early[\s\S]{0,400}data-join/.test(thtml));
check('끝난 수업도 [다시 입장] 이 된다 (연장·마무리)', /btn-reenter/.test(thtml));
check('🔴 옛 응답(캐시)에는 없는 권한을 지어내지 않는다',
  /c\.enter_from_ts != null && c\.enter_until_ts != null[\s\S]{0,160}: open;/.test(thtml));
/* (2026-08-27 마이마이 8/26 ①) 계약 갱신: 끝난 수업에는 일지 버튼이 «반드시 하나» 붙는다 —
   안 썼으면 [일지 쓰기](data-eval), 이미 썼으면 [일지 ✓ 보기](data-evview).
   옛 계약(항상 data-eval)은 «쓴 일지가 화면에 안 보인다» 는 제보의 원인이라 뒤집었다.
   재입장이 일지를 대체하지 않는다는 원래 의도는 그대로다(버튼이 항상 공존). */
check('일지 버튼은 그대로 남는다 (재입장이 일지를 대체하지 않는다 — 쓰기 또는 보기)',
  /btn-reenter[\s\S]{0,1200}data-eval(view)?=/.test(thtml)
  && /data-evview/.test(thtml) && /data-eval="/.test(thtml));
check('✍ 이미 쓴 수업은 «일지 ✓ 보기» 로 바뀐다 (쓴 것이 화면에 보인다)',
  /c\.eval_written[\s\S]{0,300}data-evview/.test(thtml) && /openEvalView/.test(thtml));

console.log('\n[ ⑥  주간 스케줄을 날짜로 바로 이동 ]');
/* "Add quick option for years, months and dates — the new teacher's page just Prev and Next." */
check('날짜 입력칸이 있다 (폰에서는 OS 달력 = 연·월·일 한 번에)', /id="wk-date"/.test(thtml));
check('고르면 바로 이동한다 (버튼을 또 눌러야 하지 않는다)',
  /wk-date[\s\S]{0,400}addEventListener\('change'[\s\S]{0,80}loadWeekOf/.test(thtml));
check('🔴 날짜를 로컬 자정으로 읽는다 (UTC 로 읽으면 필리핀·한국에서 하루씩 밀린다)',
  /new Date\(dateStr \+ 'T00:00:00'\)/.test(thtml));
check('먼 주로 뛰면 [이전/다음] 에 불을 켜 두지 않는다 (지금 어디인지 거짓말 금지)',
  /off === -1 \? 'wk-prev' : \(off === 1 \? 'wk-next' : ''\)/.test(thtml));

console.log('\n[ ⑦  교재 페이지 목록 ]');
/* "The list of pages of the book should be easily be visible." (옛 시스템의 Document list) */
check('페이지 목록 버튼이 있다', /pdfTogglePageList\(\)/.test(idx));
check('파일 시퀀스와 PDF 내부 쪽을 둘 다 보여준다',
  /data-seq=/.test(idx) && /data-page=/.test(idx));
check('🔴 이동은 기존 함수만 쓴다 (학생 화면과 어긋나는 두 번째 경로 금지)',
  /_pdfGoSeqFile\(f\)/.test(idx) && /pdfGoToPage\(n\);[\s\S]{0,120}_pdfBroadcastPage/.test(idx));
/* ⚠️ (2026-08-13) 이 검사도 «거리(1800자)» 로 보고 있었다 — 바로 아래 주석이 경고한
   그 함정이다. 창 크기 조절(마이마이 8/13 ②)이 붙어 글자 수가 늘자 **규칙은 그대로인데
   검사만 깨졌다.** 아래 ⑦ 검사들처럼 «그 함수 안에 있는가» 로 바꾼다. */
{
  const _s2 = idx.indexOf('async function pdfTogglePageList');
  const _e2 = idx.indexOf('window.pdfTogglePageList =', _s2);
  const _fn2 = (_s2 >= 0 && _e2 > _s2) ? idx.slice(_s2, _e2) : '';
  check('시퀀스가 없으면 서버에서 다시 만든다 (새 기기·재접속에서도 목록이 나온다)',
    /pdfEnsureSequence\(\)/.test(_fn2));
}
/* ⚠️ (2026-08-11) 예전엔 «pdfTogglePageList 뒤 4000자 안에» 로 봤다. 그런데 그 함수에
   기능(④ 목록에서 빼기)이 붙자 거리가 늘어 **규칙은 그대로인데 검사만 깨졌다.**
   거리가 아니라 «그 함수 안에 있는가» 로 본다 — 거리는 규칙이 아니다. */
{
  const _s = idx.indexOf('async function pdfTogglePageList');
  const _e = idx.indexOf('window.pdfTogglePageList =', _s);
  const _fn = (_s >= 0 && _e > _s) ? idx.slice(_s, _e) : '';
  check('교재를 안 열었을 때는 이유를 말해 준다 (빈 상자 금지)',
    /Open a textbook first/.test(_fn) && /먼저 교재를 열어 주세요/.test(_fn));
}

console.log('\n[ ⑧  수업 중에 영상이 튀어나오지 않는다 ]');
/* "No need for the videos for BTS, SIU and Teachers videos during the class."
   원인은 «영상이 있다» 가 아니라 교재를 여는 순간 **탭이 넘어가고 자동 재생**된 것. */
/* 🔀 2026-08-07 병합 — 두 갈래가 같은 버그를 opts.manual / opts.autoOpen 으로 각각 고쳐서
   이름을 autoOpen 으로 통일했다(manual 도 계속 받는다). 예전엔 «if (!manual){...return;}» 이라는
   **구현 모양**을 글자로 박아 뒀는데, 옳은 통일에도 검사가 깨졌다 → 게이트가 걸려 있는지만 본다.
   실제 «교재를 열면 탭이 안 넘어간다» 는 동작 증명은 가짜 브라우저로 돌리는
   vc_textbook_video_audio_260808_harness.mjs 가 맡는다. */
check('교재를 열어도 영상 탭으로 자동 전환하지 않는다',
  /if\(autoOpen\)\{[\s\S]{0,160}vcSwitchTab\('video'\)/.test(idx)
  && !/^\s*try\{ if\(typeof vcSwitchTab==='function'\) vcSwitchTab\('video'\); \}catch\(_\)\{\}\s*\/\/ 동영상 탭으로 전환/m.test(idx));
check('있다는 사실만 조용히 알린다', /mangoiNoteLessonVideo/.test(idx));
check('강사가 직접 부르면 예전처럼 재생된다 (필요할 때 쓸 길은 남긴다)',
  /mangoiPlayLessonVideo\(p\.bookId, \{ manual: true \}\)/.test(idx));
check('알림은 스스로 사라진다 (수업 화면에 오래 남는 것 자체가 방해)',
  /_mlNoteT = setTimeout/.test(idx));

console.log('\n[ ⑨  왼쪽 마이크 미터 — 2026-08-10 제거됨 (부활 금지) ]');
/* ⑨는 원래 «미터가 화면분할 설정을 가리지 않는 자리에 있는가»(left/z-index/bottom)를 검사했다.
   그런데 자리를 두 번 옮겨도(가운데→왼쪽 236px) 신고가 이어졌고, 2026-08-10 사장님이
   «얼굴 타일 밑 음량 막대와 중복이니 왼쪽 것은 삭제» 로 결정 — 미터 자체를 제거했다.
   위치 검사는 전부 무의미해졌으므로, 대신 «다시 만들지 않는가»를 지킨다(CLAUDE.md 1-3). */
check('🗑 떠 있는 마이크 미터(#vc-mic-meter)를 다시 만들지 않는다', !/vc-mic-meter/.test(idx));
check('🗑 미터 생성 코드(cssText 조립)도 남아 있지 않다', !/_micMeterEl\.style\.cssText/.test(idx));

console.log('\n[ ⑩  얼굴이 사라지면 되돌리는 길이 보인다 ]');
/* "Teacher and student's videos hide sometimes and the option to show it again is not visible."
   + "I don't know if it was mine that is working or the student's mic." */
check('접힌 동안 큰 복귀 알약이 뜬다', /vc-side-restore/.test(idx));
check('표시 여부는 CSS 한 곳에서만 정한다 (두 곳에서 만지면 어긋난다)',
  /body\.vc-in-call\.vc-side-collapsed-on #vc-side-restore \{ display: inline-flex; \}/.test(idx));
check('탭바의 접기 버튼도 접힌 동안 눈에 띈다',
  /vc-side-collapsed-on #vc-side-collapse-btn \{[\s\S]{0,200}background/.test(idx));
/* (2026-08-10) 「미터가 «내 마이크» 라고 밝힌다」·「상태 글자가 언어를 따른다」 두 검사는
   미터 제거와 함께 삭제 — «내 것/학생 것» 구분은 이제 얼굴 타일의 음량 막대가 담당한다. */

console.log('\n[ ⑭⑮ 휴식시간 — 지우는 법 · 직접 고르는 시간 ]');
/* ⑭ "how to remove the teachers' breaktime. Will it be permanently Monday breaktime?"
   ⑮ "it would be nice to have manually select the teacher's break time like the current one" */
check('캘린더에서 차단 카드를 눌러 지운다', /data-block[\s\S]{0,2000}DELETE/.test(q6));
check('🔴 수업 카드는 이 경로로 지워지지 않는다', /if \(!bid\) return;/.test(q6));
check('카드가 «매주 반복» 인지 «이 날짜만» 인지 말해 준다',
  /s\.recurring \? ph54T\('매주 반복 차단'/.test(q6));
check('차단 카드가 누를 수 있어 보인다 (cursor:pointer)', /cursor:pointer;opacity:\.92/.test(q6));
check('시작·종료를 직접 고른다 (1시간 고정이 아니다)',
  /ph54-blk-from/.test(q6) && /ph54-blk-to/.test(q6));
check('🔴 종료가 시작보다 빠르면 막는다', /if \(t <= f\)\{/.test(q6));
const blkDlgBody = (/function ph54BlockDialog\(([\s\S]*?)\n  \}\n/.exec(q6) || ['', ''])[1];
check('🔴 차단 창은 저장하지 않는다 (저장 경로는 한 곳)',
  blkDlgBody.length > 0 && !blkDlgBody.includes('fetch('));
check('🌐 확인 문구가 한/영 둘 다다 (매니저가 필리핀 사람이다)',
  /function ph54T\(ko, en\)/.test(q6) && /ph54T\('매주 /.test(q6));

console.log('\n[ ⑬  «맨 왼쪽» 으로 되돌리는 길 ]');
/* "The middle still shows every time we select an option sir, not the left most part of the page."
   자동 복귀는 이미 두 번 고쳤다(scrollIntoView·hashchange). 그 밖의 경로까지 뒤쫓는 대신
   **언제든 한 번에 되돌리는 버튼**을 둔다 — 밀려 있을 때만 나타난다. */
const ahtml2 = rd('../cloudflare-deploy/public/admin.html');
check('가로로 밀려 있을 때만 나타나는 버튼이 있다', /adm-snap-left/.test(ahtml2));
check('누르면 문서와 컨테이너 가로 스크롤을 0 으로 되돌린다', /function snapAllLeft\(\)/.test(ahtml2));
check('🔴 자동으로 되돌리지 않는다 (일부러 오른쪽을 보고 있을 수 있다)',
  !/setInterval\([\s\S]{0,80}snapAllLeft/.test(ahtml2));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
