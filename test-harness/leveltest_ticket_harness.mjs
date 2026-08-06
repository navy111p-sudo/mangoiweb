// -*- coding: utf-8 -*-
// 🎟️ 레벨테스트 티켓(확인+입장 링크 하나) 하네스 (2026-08-06)
//   실행: node test-harness/leveltest_ticket_harness.mjs
//
//   왜 만들었나 — 신청자가 «확인할 방법도 입장할 방법도» 사실상 없었다.
//     · 접수 문자엔 입장 링크가 아예 없었다(문의 카톡 주소만).
//     · 확정 문자는 "예약 10분 전 화상 링크를 보내드립니다" 라고 약속했는데, 그 링크를
//       보내는 코드는 전화번호를 students_erp 에서만 찾는다 → 계정 없는 신청자에겐
//       구조적으로 못 간다. 지키지 못할 약속이었다.
//     · 설령 갔어도 링크가 방이 아니라 홈(1.9MB·로그인 필요)이었다.
//
//   ⚠️ 이 하네스의 원칙: 토큰 검증은 **실제 소스를 번들해서 진짜로 실행**한다.
//      같은 알고리즘을 여기에 다시 적어 비교하면 «내가 쓴 것과 내가 쓴 것» 을 맞춰보는
//      가짜 검사가 된다(그 함정으로 이미 두 번 당했다).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const mod    = rd('../cloudflare-deploy/src/leveltest-ticket.ts');
const api    = rd('../cloudflare-deploy/src/api-admin.ts');
const index  = rd('../cloudflare-deploy/src/index.ts');
const page   = rd('../cloudflare-deploy/public/t.html');
const mango  = rd('../cloudflare-deploy/src/api-mango.ts');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 티켓 API 가 존재하고 «게이트에 등록» 돼 있다 ]');
check('GET /api/leveltest/ticket 핸들러가 있다', /path === '\/api\/leveltest\/ticket'/.test(api));
check('캘린더(.ics) 경로도 있다', /path === '\/api\/leveltest\/ticket\.ics'/.test(api));
check('index.ts 라우팅·인증 게이트에 둘 다 등록 (누락이면 404)',
  /path === '\/api\/leveltest\/ticket'/.test(index) && /path === '\/api\/leveltest\/ticket\.ics'/.test(index));
check('ics 는 text/calendar 로 내려간다 (아니면 브라우저가 그냥 연다)',
  /'Content-Type': 'text\/calendar/.test(api));

console.log('\n[ ② 입장 시각이 서버(sessions/today)와 «같은 값» 이어야 한다 ]');
// 여기만 늘리면 티켓엔 버튼이 떴는데 서버는 아직 안 열어주는 상태가 된다
const openBefore = (mod.match(/OPEN_BEFORE_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/) || [])[1];
const lateAfter  = (mod.match(/LATE_AFTER_MS\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/) || [])[1];
const srvOpen    = (mango.match(/OPEN_BEFORE\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/) || [])[1];
const srvLate    = (mango.match(/LATE_AFTER\s*=\s*(\d+)\s*\*\s*60\s*\*\s*1000/) || [])[1];
check(`입장 시작이 서버와 일치 (티켓 ${openBefore} = 서버 ${srvOpen})`, !!openBefore && openBefore === srvOpen);
check(`지각 마감이 서버와 일치 (티켓 ${lateAfter} = 서버 ${srvLate})`, !!lateAfter && lateAfter === srvLate);
check('방 주소 형식이 서버와 같다 (class-{예약}-{YYYYMMDD})',
  /class-\$\{sched\.id\}-\$\{m\[1\]\}\$\{m\[2\]\}\$\{m\[3\]\}/.test(mod) && /class-\$\{s\.id\}-\$\{ymd\}/.test(mango));
check('입장 링크가 «경량» 페이지다 (/video-call/ 까지만 쓰면 1.9MB 홈으로 되돌아간다)',
  /\/video-call\/index\.html\?room=/.test(mod));

console.log('\n[ ③ 남의 티켓이 열리면 안 된다 — 서명 (실제 소스 실행) ]');
// 진짜 코드를 번들해서 돌린다. 여기에 알고리즘을 다시 적으면 검사가 아니라 자기복사가 된다.
let T = null, bundleErr = '';
try {
  const out = join(tmpdir(), 'mangoi-lt-ticket-harness.mjs');
  execFileSync('npx', ['esbuild', 'src/leveltest-ticket.ts', '--bundle', '--format=esm',
                       '--platform=neutral', '--outfile=' + out],
    { cwd: resolve(__dir, '../cloudflare-deploy'), stdio: 'pipe', shell: process.platform === 'win32' });
  if (existsSync(out)) T = await import('file://' + out.replace(/\\/g, '/') + '?v=' + Date.now());
} catch (e) { bundleErr = String(e && e.message || e).slice(0, 120); }
check('실제 소스를 번들해 불러왔다' + (bundleErr ? ' — ' + bundleErr : ''), !!T);

if (T) {
  const env = { ROOM_JWT_SECRET: 'harness-secret-abc' };
  const tok = await T.signLtTicket(13, env);
  check('발급한 토큰이 그대로 검증된다 → 신청번호 복원', (await T.verifyLtTicket(tok, env)) === 13);
  check('토큰이 짧다 (문자에 들어가야 한다, 48자 이하)', tok.length <= 48);

  // 신청번호만 바꿔치기 = 남의 티켓 훔쳐보기 시도
  const parts = tok.split('.');
  const forged = ['14', parts[1], parts[2]].join('.');
  check('⛔ 신청번호를 바꾸면 거절된다 (남의 티켓 차단)', (await T.verifyLtTicket(forged, env)) === null);
  check('⛔ 서명을 한 글자 고치면 거절된다',
    (await T.verifyLtTicket(parts[0] + '.' + parts[1] + '.' + (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1), env)) === null);
  check('⛔ 다른 시크릿으로 만든 토큰은 거절된다',
    (await T.verifyLtTicket(await T.signLtTicket(13, { ROOM_JWT_SECRET: 'other' }), env)) === null);
  check('⛔ 만료된 토큰은 거절된다', (await T.verifyLtTicket(await T.signLtTicket(13, env, -1000), env)) === null);
  check('⛔ 형식이 깨진 값에 안 죽는다', (await T.verifyLtTicket('..', env)) === null && (await T.verifyLtTicket('', env)) === null);
  check('⛔ 만료시각을 미래로 늘려도 서명이 안 맞아 거절된다',
    (await T.verifyLtTicket(parts[0] + '.' + (Number(parts[1]) + 99999) + '.' + parts[2], env)) === null);

  const url = await T.ltTicketUrl(13, env);
  check('티켓 주소가 운영 도메인이다 (mango-i.com 은 등록조차 안 된 도메인)',
    url.startsWith('https://test.mangoi.co.kr/t.html?k=') && !url.includes('mango-i.com'));

  // 캘린더 파일 — 쉼표·줄바꿈 이스케이프를 빠뜨리면 캘린더 앱이 통째로 무시한다
  const ics = T.buildLtIcs(
    { app_id: 13, teacher: 'Teacher A, B', start_ts: Date.UTC(2026, 7, 6, 9, 0), end_ts: Date.UTC(2026, 7, 6, 9, 20) },
    'https://test.mangoi.co.kr/t.html?k=x');
  check('ics 가 VCALENDAR 로 시작·끝난다', /^BEGIN:VCALENDAR\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics));
  check('ics 줄바꿈이 CRLF 다 (LF 만 쓰면 일부 캘린더가 거부한다)', !/[^\r]\n/.test(ics));
  check('ics 에 시작·종료 시각이 UTC 로 들어간다', /DTSTART:20260806T090000Z/.test(ics) && /DTEND:20260806T092000Z/.test(ics));
  check('ics 안의 쉼표가 이스케이프된다 (안 하면 줄이 깨져 무시된다)', /Teacher A\\, B/.test(ics));
  check('ics 에 10분 전 알람이 있다', /TRIGGER:-PT10M/.test(ics));
}

console.log('\n[ ④ 배정 검토 중인 교사 이름은 티켓에도 안 나온다 (2단계 승인) ]');
check("confirmed/done 일 때만 teacher 를 채운다",
  /const confirmed = app\.status === 'confirmed' \|\| app\.status === 'done'/.test(mod) &&
  /teacher: confirmed \? \(app\.assigned_teacher \|\| null\) : null/.test(mod));
check('취소된 수업은 입장 대상에서 뺀다',
  /if \(sched && sched\.status === 'cancelled'\) sched = null/.test(mod));

console.log('\n[ ⑤ 문자에 «실제로» 링크가 실린다 ]');
check('접수 문자에 티켓 링크가 들어간다', /레벨테스트 신청이 접수됐어요[\s\S]{0,200}?\$\{ticketLine\}/.test(api));
/* ⚠️ 주석을 걷어내고 본다. 걷어내지 않으면 «옛 문구를 없앴다» 는 검사가, 그 문구를 인용한
   주석("예전엔 …라고 약속만 했다")에 걸려 영영 실패한다 — 실제로 그렇게 됐다. */
const apiCode = api.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
check('확정 문자가 «보내드립니다» 약속 대신 링크를 «지금» 준다',
  !/예약 10분 전 카카오톡 채널로 화상 링크를 보내드립니다/.test(apiCode) && /\$\{ticketLine2\}/.test(apiCode));
check('링크 만들기가 실패해도 문자는 나간다 (try/catch 로 감쌈)',
  /try \{ ticketUrl = await ltTicketUrl[\s\S]{0,160}?\} catch \{\}/.test(api));

console.log('\n[ ⑤-2 «신청이 됐는지» 를 화면에서도 확인할 수 있어야 한다 ]');
/* 문자만 믿으면 «문자가 늦거나 안 오는» 사람은 자기 신청이 들어갔는지 확인할 길이 없다.
   신청한 본인에게 주는 링크라 노출 문제도 없다 — 응답에 실어 화면에도 남긴다. */
const gridJs = rd('../cloudflare-deploy/public/js/idx-grid-menu.js');
const ltHtml = rd('../cloudflare-deploy/public/level-test.html');
const idxHtml = rd('../cloudflare-deploy/public/index.html');
check('신청 응답이 티켓 주소를 돌려준다', /ticket_url: ticketUrl \|\| null/.test(api));
check('전화번호가 없어 문자를 못 보내도 링크는 만든다',
  /if \(!ticketUrl\) \{ try \{ ticketUrl = await ltTicketUrl/.test(api));
check('레벨테스트 신청 화면이 그 링크를 보여준다', /var myLink = ticketUrl/.test(ltHtml));
check('홈 가입 팝업도 그 링크를 보여준다', /ad\.ticket_url\) ticketUrl = ad\.ticket_url/.test(gridJs));
check('홈 팝업 버튼이 «내 신청 확인하기» 다', /🎟️ 내 신청 확인하기/.test(gridJs));
check('링크를 못 받았을 때의 대비책이 있다 (버튼이 사라지지 않게)',
  /ticketUrl \? `<a class="info-cta" href="\$\{ticketUrl\}"[\s\S]{0,200}?: `<a class="info-cta" href="\/parent\.html/.test(gridJs));
{
  const v = (idxHtml.match(/idx-grid-menu\.js\?v=(\d+)/) || [])[1];
  check(`캐시 버전이 21 이상 (안 올리면 옛 js 가 그대로) [현재 ${v}]`, Number(v || 0) >= 21);
}

console.log('\n[ ⑥ T-10 리마인더 — 지금 «안 닿는» 사람에게 닿아야 한다 ]');
check('리마인더 스윕이 있다', /export async function runLeveltestReminderSweep/.test(mod));
check('cron 에서 실제로 불린다 (정의만 하면 아무 일도 안 일어난다)',
  /runLeveltestReminderSweep\(env as any\)/.test(index) && /import \{ runLeveltestReminderSweep \}/.test(index));
check('🔑 번호를 «신청서» 것으로 먼저 본다 (계정에서만 찾으면 지금 버그가 그대로 남는다)',
  /let phone = String\(r\.phone \|\| ''\)\.trim\(\);[\s\S]{0,120}?if \(!phone && r\.student_uid\)/.test(mod));
check('건당 1회만 보낸다 (15분 크론이 같은 사람에게 반복 발송 금지)',
  /leveltest_reminder_log WHERE app_id = \? AND kind = 't10'/.test(mod));
check('번호가 없어도 로그를 남긴다 (매 15분 재시도 폭주 방지)',
  /status = 'no_phone'[\s\S]{0,300}?INSERT INTO leveltest_reminder_log/.test(mod));
check('킬스위치가 있다', /leveltest_reminder_send/.test(mod));
check('한 번에 보내는 양에 상한이 있다', /MAX_SMS_PER_SWEEP/.test(mod));
check('리마인더 문자에도 티켓 링크가 실린다', /▶ 입장하기\(클릭\): \$\{url\}/.test(mod));

console.log('\n[ ⑦ 티켓 화면 — 로그인을 «절대» 묻지 않는다 ]');
check('t.html 이 있다', page.length > 500);
check('티켓 API 를 부른다', /fetch\('\/api\/leveltest\/ticket\?k='/.test(page));
check('⛔ 로그인·비밀번호를 요구하지 않는다 (신청자 절반은 계정이 없다)',
  !/password|로그인해|login\(/i.test(page.replace(/로그인 없이|로그인·앱설치|로그인을 물으면|로그인 불필요|로그인을 절대/g, '')));
check('입장 가능할 때 큰 입장 버튼을 «맨 위» 에 그린다',
  /if \(d\.join_open && d\.join_url\)\{[\s\S]{0,200}?class="join"/.test(page));
check('아직이면 언제 열리는지 말해 준다 (그냥 버튼만 없으면 고장으로 보인다)',
  /시작 10분 전부터 입장 버튼이 열려요/.test(page));
check('열어 두면 «저절로» 버튼이 나타난다 (새로고침 시키면 그 순간 이탈한다)',
  /setInterval\(load, 30000\)/.test(page));
check('탭으로 돌아오면 즉시 갱신한다', /visibilitychange/.test(page));
check('장비 점검·캘린더 추가 버튼이 있다', /precheck_url/.test(page) && /ics_url/.test(page));
check('한/영 둘 다 나온다', /localStorage\.getItem\('mangoi_lang'\)/.test(page) && /data-en=/.test(page));
check('외부 스크립트·폰트를 안 쓴다 (경량 원칙)', !/<script[^>]+src=|fonts\.googleapis|cdn\./i.test(page));
check('검색엔진에 노출되지 않는다 (개인 링크)', /name="robots" content="noindex/.test(page));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
