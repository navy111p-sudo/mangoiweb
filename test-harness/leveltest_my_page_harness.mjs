// -*- coding: utf-8 -*-
// 🎯 「레벨테스트 신청했는데 왜 내 페이지에서 안 뜨지?」 하네스 (2026-08-06)
//   실행: node test-harness/leveltest_my_page_harness.mjs
//
//   신고: 관리자 표에는 신청이 멀쩡히 보이는데, 학생·학부모 마이페이지엔 아무 것도 없다.
//   원인은 버그가 아니라 «없음» 3겹 — 셋 다 에러가 0이라 화면만 봐선 못 찾는다.
//     ① 읽는 화면이 없다   — parent.html 에 레벨테스트 관련 코드가 한 줄도 없었다.
//     ② 읽는 API 가 없다   — leveltest_applications 를 읽는 경로는 관리자용·강사용 둘뿐.
//                            «학생이 자기 신청을 읽는» 엔드포인트가 설계상 존재하지 않았다.
//     ③ uid 가 안 붙는다   — 신청 저장 시 프론트가 localStorage 키 4개만 훑는데,
//                            마이페이지로 로그인한 학생은 mangoi_parent_uid 만 갖고 있어
//                            전부 비껴갔다. uid 없이 저장된 신청은 나중에 본인도 못 찾는다.
//                            (실측: 운영 신청 12건 중 6건이 student_uid = NULL)
//   그리고 그 상태에서 가입 완료 화면은 "마이페이지에서 확인 가능"이라고 안내하고 있었다.
//
//   ⚠ 이 하네스가 지키는 가장 중요한 선: 조회를 «이름으로» 하지 않는다.
//      동명이인이 실제로 많아(김민서 71명) 이름 매칭은 남의 신청·점수를 그대로 노출한다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const api    = rd('../cloudflare-deploy/src/api-admin.ts');
const index  = rd('../cloudflare-deploy/src/index.ts');
const parent = rd('../cloudflare-deploy/public/parent.html');
const ltPage = rd('../cloudflare-deploy/public/level-test.html');
const ltAi   = rd('../cloudflare-deploy/public/level-test-ai.html');
const grid   = rd('../cloudflare-deploy/public/js/idx-grid-menu.js');
const home   = rd('../cloudflare-deploy/public/index.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

// 새 엔드포인트 본문만 떼어 본다 (다른 핸들러의 코드에 우연히 걸리지 않도록)
const myHandler = (api.match(/path === '\/api\/leveltest\/my'[\s\S]{0,3000}?\n    \}\n/) || [''])[0];

console.log('\n[ ① 학생이 «자기» 신청을 읽는 API 가 존재한다 ]');
check('GET /api/leveltest/my 핸들러가 있다', myHandler.length > 100);
check('leveltest_applications 를 실제로 조회한다', /FROM leveltest_applications/.test(myHandler));
check('index.ts 라우팅·인증 게이트에 등록돼 있다 (등록 누락이면 404)',
  /path === '\/api\/leveltest\/my'/.test(index));

console.log('\n[ ② 남의 신청이 새면 안 된다 — 소유자 검증 ]');
check('서명 토큰으로 요청자 uid 를 확인한다', /authUidGlobal\(request, url, env\)/.test(myHandler));
check('토큰 uid 와 조회 uid 가 다르면 401 로 막는다',
  /authUid !== myUid[\s\S]{0,200}?401/.test(myHandler));
check('uid 없이 부르면 거절한다', /invalidBody\(\['uid'\]\)/.test(myHandler));
check('⛔ 이름(student_name)만으로 매칭하지 않는다 — 동명이인 유출 금지',
  !/student_name\s*=\s*\?/.test(myHandler.replace(/student_uid IS NULL AND student_name = \?/g, '')));
check('이름 매칭은 «uid 가 비었고 이름이 곧 내 uid» 인 경우로만 한정',
  /student_uid = \?\s*OR\s*\(student_uid IS NULL AND student_name = \?\)/.test(myHandler));
check('그 이름 자리에 바인딩하는 값도 uid 다 (실명이 아니다)',
  /\.bind\(myUid,\s*myUid\)/.test(myHandler));

console.log('\n[ ③ 배정 검토 중인 교사 이름은 학생에게 안 알린다 (2단계 승인) ]');
check('confirmed/done 일 때만 교사명을 내려준다',
  /status === 'confirmed' \|\| a\.status === 'done'\) \? a\.assigned_teacher : null/.test(myHandler));

console.log('\n[ ④ 마이페이지가 그 API 를 실제로 부르고 그린다 ]');
check('parent.html 에 레벨테스트 카드가 있다', /id="pd-lt-card"/.test(parent));
check('그리는 자리(pd-leveltest)가 있다', /id="pd-leveltest"/.test(parent));
check('pdLeveltest 함수가 정의돼 있다', /async function pdLeveltest\s*\(/.test(parent));
// ⚠ 주석 처리된 호출을 «있다» 고 읽으면 안 된다 — 정의만 남고 화면은 그대로인 상태를
//   그대로 통과시킨다. 줄 주석을 먼저 걷어낸 뒤에 본다.
const parentLive = parent.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
check('대시보드 로드 때 «불린다» (정의만 하고 안 부르면 화면은 그대로다)',
  /\n\s*pdLeveltest\(\);/.test(parentLive.replace(/async function pdLeveltest\s*\(\)\s*\{/, '')));
check('그 호출이 pdLoad 안에 있다 (아무 데서나 부르면 로그인 전에 401 만 난다)',
  /async function pdLoad\(\)\{[\s\S]{0,1400}?pdLeveltest\(\);/.test(parentLive));
check('본인 토큰을 실어 보낸다 (안 보내면 401)', /leveltest\/my\?uid=[\s\S]{0,120}?token=/.test(parent));
check('신청이 0건이면 카드째 숨긴다 (빈 카드 금지)',
  /if \(!items\.length\) \{ card\.style\.display = 'none'; return; \}/.test(parent));
check('한/영 둘 다 나온다 (강사·학부모 다국어)', /window\.getLang && window\.getLang\(\) === 'en'/.test(parent));

console.log('\n[ ⑤ uid 가 «붙어서» 저장돼야 나중에 본인이 찾는다 ]');
for (const [label, src] of [['level-test.html', ltPage], ['level-test-ai.html', ltAi]]) {
  check(`${label} 이 mangoi_parent_uid 도 본다 (마이페이지 로그인 학생)`,
    /'mangoi_parent_uid'/.test(src));
  check(`${label} 이 mangoi_logged_user 도 본다`, /mangoi_logged_user/.test(src));
  check(`${label} 이 서버 보험용 token 을 같이 보낸다`, /token\s*:\s*(token|detectToken\(\))/.test(src));
}
check('홈 가입 팝업(idx-grid-menu.js)도 token 을 같이 보낸다',
  /leveltest\/apply[\s\S]{0,400}?token:\s*regToken/.test(grid));
check('parent.html 로그인 시 공용 uid 키(mangoi_uid)도 심는다',
  /localStorage\.setItem\('mangoi_uid', _currentUid\)/.test(parent));
check('단 «로그인 유지» 를 켰을 때만 심는다 (2026-07-30 제보 #3 유지)',
  /if \(remember\) \{[\s\S]{0,900}?setItem\('mangoi_uid', _currentUid\)/.test(parent));
check('서버가 uid 없으면 토큰에서 직접 꺼낸다 (프론트가 놓쳐도 복구)',
  /if \(!uid\) \{[\s\S]{0,160}?authUidGlobal\(request, url, env, b\)/.test(api));

console.log('\n[ ⑥ 안내 문구가 «진짜로 되는 것» 만 말한다 ]');
/* ⚠️ (2026-08-06 갱신) 안내 대상이 «마이페이지» 에서 «티켓 링크» 로 바뀌었다.
   마이페이지는 계정이 있어야 열리는데 신청자 절반은 계정이 없다 — 그 사람들에게
   마이페이지를 가리키는 건 여전히 막다른 길이다. 티켓은 로그인 없이 열린다.
   정책이 바뀌었으니 검사도 새 정책을 지킨다(그냥 지우면 보호가 사라진다). */
check('가입 완료 화면이 «로그인 없이 확인하는 길» 을 알려준다',
  /내 신청 확인하기/.test(grid) && /로그인 불필요/.test(grid));
check('신청 완료 화면이 티켓 링크를 «먼저» 준다 (마이페이지는 대비책)',
  /var myLink = ticketUrl/.test(ltPage) && /: \(uid \? '<br><a href="\/parent\.html\?uid='/.test(ltPage));

console.log('\n[ ⑦ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
const v = (home.match(/idx-grid-menu\.js\?v=(\d+)/) || [])[1];
check('index.html 이 idx-grid-menu.js 를 버전과 함께 부른다', !!v);
check('버전이 20 이상 (이번 수정 반영)', Number(v || 0) >= 20);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
