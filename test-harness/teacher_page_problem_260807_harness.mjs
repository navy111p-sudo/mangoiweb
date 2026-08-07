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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

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
check('🔴 새 규칙은 꺼진 채로 들어온다 (켜는 순간 급여가 바뀌므로 사람이 정한다)',
  /'postponed_early_pay_percent'[\s\S]{0,200}'policy_percent',0,0,/.test(aapi));
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
check('평가하기 버튼은 그대로 남는다 (재입장이 평가를 대체하지 않는다)',
  /btn-reenter[\s\S]{0,400}data-eval/.test(thtml));

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
check('시퀀스가 없으면 서버에서 다시 만든다 (새 기기·재접속에서도 목록이 나온다)',
  /pdfTogglePageList[\s\S]{0,1800}pdfEnsureSequence\(\)/.test(idx));
check('교재를 안 열었을 때는 이유를 말해 준다 (빈 상자 금지)',
  /pdfTogglePageList[\s\S]{0,4000}Open a textbook first/.test(idx));

console.log('\n[ ⑧  수업 중에 영상이 튀어나오지 않는다 ]');
/* "No need for the videos for BTS, SIU and Teachers videos during the class."
   원인은 «영상이 있다» 가 아니라 교재를 여는 순간 **탭이 넘어가고 자동 재생**된 것.
   ⚠️ 이 항목은 **다른 세션이 배포본에 먼저 구현**했다(`opts.autoOpen` 플래그).
      그래서 «내 구현 모양» 이 아니라 **규칙**만 본다 — 누가 어떻게 고쳤든 규칙이 지켜지면 통과.
        ① 자동으로 열지 여부가 옵션 플래그로 갈린다
        ② 교재를 여는 경로(mangoi:textbook-open)는 그 플래그 없이 부른다 = 자동 열기 아님
        ③ 그래도 «영상이 있다» 는 사실은 강사에게 알린다 */
const vidFn = (/window\.mangoiPlayLessonVideo = async function\(([\s\S]*?)\n  \};/.exec(idx) || ['', ''])[1];
check('교재 열기 함수를 찾았다', vidFn.length > 200, vidFn.slice(0, 60));
const vidFlag = (/var (autoOpen|manual) = !!\(opts && opts\.(?:autoOpen|manual)\)/.exec(vidFn) || [])[1];
check('«자동으로 열지 여부» 가 옵션 플래그로 갈린다', !!vidFlag, vidFlag);
const flat = vidFn.replace(/\s+/g, ' ');
check('🔴 탭 전환이 그 플래그 안에서만 일어난다',
  !!vidFlag && (new RegExp('if\\(' + vidFlag + '\\)\\{[^}]{0,200}vcSwitchTab').test(flat.replace(/ /g, ''))
             || new RegExp('if \\(!' + vidFlag + '\\)\\{[\\s\\S]{0,400}return;').test(vidFn)));
check('교재 열림 이벤트는 플래그 없이 부른다 (= 자동 열기 안 함)',
  /mangoi:textbook-open'[\s\S]{0,240}mangoiPlayLessonVideo\(id\);/.test(idx));
check('그래도 «영상이 있다» 는 알린다 (조용히 삼키지 않는다)',
  /showToast\(/.test(vidFn) || /mangoiNoteLessonVideo/.test(idx));

console.log('\n[ ⑨  마이크 표시기가 화면분할 설정을 가리지 않는다 ]');
/* ⚠️ 「id 에서 몇 글자 안에 left:12px 이 있는가」로 검사했더니 주석 한 줄을 늘리자 깨졌다.
   → 미터의 **style 문자열 자체**를 뽑아 그 안의 규칙을 본다(주석 길이와 무관). */
const micCss = (/_micMeterEl\.style\.cssText = '([^']*)'/.exec(idx) || ['', ''])[1];
check('스타일 문자열을 찾았다 (없으면 아래 검사가 전부 무의미하다)', micCss.length > 30, micCss.slice(0, 40));
check('왼쪽에 붙는다 (가운데 아래가 아니다)', /left:12px/.test(micCss) && !/left:50%/.test(micCss), micCss.slice(0, 60));
check('🔴 가운데로 당기는 transform 을 남기지 않았다', !/translateX\(-50%\)/.test(micCss));
check('클릭을 가로채지 않는다 (pointer-events:none)', /pointer-events:none/.test(micCss));
/* 🔴 브라우저 실측에서 잡은 것: 자리를 옮겨도 **대화상자보다 위**면 같은 신고가 다시 난다.
      [화면 분할] 시트는 z-index 9800 → 미터는 그보다 낮아야 한다.
      그리고 왼쪽 아래는 이미 4층(신고 FAB 18 · AI질문 64 · 세계시계 96~163 · 캐시 FAB 186~226)이다. */
const micZ = Number((/z-index:(\d+)/.exec(micCss) || [0, 0])[1]);
check('🔴 대화상자(z 9800)보다 아래에 그려진다', micZ > 0 && micZ < 9800, micZ);
check('왼쪽 아래에 이미 선 것들(≤226) 위로 올라가 있다',
  Number((/bottom:(\d+)px/.exec(micCss) || [0, 0])[1]) >= 230, (/bottom:(\d+)px/.exec(micCss) || [])[1]);

console.log('\n[ ⑩  얼굴이 사라지면 되돌리는 길이 보인다 ]');
/* "Teacher and student's videos hide sometimes and the option to show it again is not visible."
   + "I don't know if it was mine that is working or the student's mic." */
check('접힌 동안 큰 복귀 알약이 뜬다', /vc-side-restore/.test(idx));
check('표시 여부는 CSS 한 곳에서만 정한다 (두 곳에서 만지면 어긋난다)',
  /body\.vc-in-call\.vc-side-collapsed-on #vc-side-restore \{ display: inline-flex; \}/.test(idx));
check('탭바의 접기 버튼도 접힌 동안 눈에 띈다',
  /vc-side-collapsed-on #vc-side-collapse-btn \{[\s\S]{0,200}background/.test(idx));
check('마이크 미터가 «내 마이크» 라고 밝힌다', /MY MIC/.test(idx) && /내 마이크/.test(idx));
check('🌐 상태 글자가 강사 언어를 따른다 (라벨만 영어면 소용없다)',
  /'🔊 Loud'[\s\S]{0,200}'🔉 Quiet'/.test(idx));

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
