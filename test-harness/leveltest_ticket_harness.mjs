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

console.log('\n[ ③-2 결과는 «전화번호 뒷 4자리» 로 잠근다 (실제 소스 실행) ]');
/* 링크는 문자로 가지만 문자는 남이 볼 수 있다. 일정·입장이 새는 건 큰일이 아니지만
   성적은 다르다. 새 비밀번호를 만들게 하는 대신(신청 단계의 마찰=이탈) 끝 4자리만 묻는다.
   🔑 절대 조건: 잠겨도 «입장» 은 막히지 않는다. 수업에 못 들어가는 일을 만들지 않는다. */
if (T) {
  const APP = { id: 15, student_name: 'p', phone: '010-8986-2224', status: 'done',
    desired_date: '2026-08-07', desired_time: '18:00', schedule_id: null,
    ai_score: 82, pron_score: null, teacher_score: null, final_level: 'B1',
    recommended_textbook: null, next_class_guide: null };
  let fails = 0;
  const envOf = (app) => ({
    DB: { prepare: (q) => ({ bind: () => ({ first: async () => q.includes('leveltest_applications') ? app : null }) }) },
    SESSION_STATE: { get: async () => String(fails || ''), put: async (_k, v) => { fails = Number(v); } },
  });
  const noPin = await T.buildLtTicket(envOf(APP), 15, 'tok');
  check('핀 없이는 결과가 안 나온다', noPin.result_locked === true && noPin.result === null);
  check('«결과가 있다» 는 사실은 알려준다 (잠긴 빈 상자를 안 보여주려고)', noPin.has_result === true);
  check('어느 번호인지 힌트만 준다 (전체 번호 노출 금지)',
    noPin.phone_hint === '010-****-2224' && !String(noPin.phone_hint).includes('8986'));
  const bad = await T.buildLtTicket(envOf(APP), 15, 'tok', '1234');
  check('⛔ 틀린 4자리는 안 열린다', bad.result_locked === true && bad.result === null);
  check('틀리면 실패 횟수를 센다 (4자리는 경우의 수가 1만뿐)', fails === 1);
  const good = await T.buildLtTicket(envOf(APP), 15, 'tok', '2224');
  check('맞는 4자리면 열린다', good.result_locked === false && good.result.final_level === 'B1');
  const full = await T.buildLtTicket(envOf(APP), 15, 'tok', '010-8986-2224');
  check('전체 번호를 넣어도 뒤 4자리로 본다 (형식 관용)', full.result_locked === false);
  fails = 5;
  const over = await T.buildLtTicket(envOf(APP), 15, 'tok', '2224');
  check('⛔ 시도 초과면 맞는 4자리도 안 열린다 (전수 시도 차단)', over.result_locked === true);
  fails = 0;
  const noResult = await T.buildLtTicket(envOf({ ...APP, ai_score: null, final_level: null }), 15, 'tok');
  check('결과가 없으면 잠글 것도 없다', noResult.has_result === false && noResult.result_locked === false);
  const noPhone = await T.buildLtTicket(envOf({ ...APP, phone: null }), 15, 'tok');
  check('🔑 신청서에 번호가 없으면 열어준다 (안 그러면 본인도 영영 못 본다)',
    noPhone.result_locked === false && noPhone.result.final_level === 'B1');

  // 🔑 절대 조건 — 결과가 잠겨도 입장은 열려 있어야 한다
  const nowMs = Date.now(), KSTMS = 9 * 3600 * 1000;
  const kd = new Date(nowMs + KSTMS), pz = (n) => String(n).padStart(2, '0');
  const today = `${kd.getUTCFullYear()}-${pz(kd.getUTCMonth() + 1)}-${pz(kd.getUTCDate())}`;
  const hhmm = `${pz(kd.getUTCHours())}:${pz(kd.getUTCMinutes())}`;
  const SCHED = { id: 854, scheduled_date: today, start_time: hhmm, duration_min: 20, status: 'active' };
  const envLive = {
    DB: { prepare: (q) => ({ bind: () => ({ first: async () => q.includes('class_schedules') ? SCHED : ({ ...APP, schedule_id: 854, desired_date: today, desired_time: hhmm }) }) }) },
    SESSION_STATE: { get: async () => '', put: async () => {} },
  };
  const locked = await T.buildLtTicket(envLive, 15, 'tok');
  check('🔑 결과가 잠겨도 «입장» 은 열려 있다 (수업에 못 들어가는 일 금지)',
    locked.result_locked === true && locked.join_open === true && !!locked.join_url);
}
check('API 가 p(4자리) 파라미터를 받는다', /url\.searchParams\.get\('p'\)/.test(api));
check('화면이 4자리 입력을 그린다', /id="pin-go"/.test(page) && /id="pin"/.test(page));
check('4자리를 저장하지 않는다 (남의 폰에서 열리면 안 된다)',
  /var PIN = '';/.test(page) && !/setItem\([^)]*PIN/.test(page));

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
/* ⚠️ (2026-08-07) 신청 화면은 홈 모달 한 벌로 통일됐다 — 옛 level-test.html 의 폼은
   회원가입·동의 없이 접수되던 «두 번째 신청서» 라 폐지하고 모달로 넘겨주는 다리만 남겼다.
   검사도 그 정책을 지킨다: 옛 페이지엔 폼이 없어야 하고, 대신 모달이 링크를 보여준다. */
check('옛 신청 화면이 되살아나지 않았다 (신청서는 한 벌)',
  !/leveltest\/apply/.test(ltHtml) && /menu=leveltest/.test(ltHtml));
check('홈 가입 팝업도 그 링크를 보여준다', /ad\.ticket_url\) ticketUrl = ad\.ticket_url/.test(gridJs));
check('홈 팝업 버튼이 «내 신청 확인하기» 다', /🎟️ 내 신청 확인하기/.test(gridJs));
/* (2026-08-07) 대비책이 2단이 됐다: 티켓 → (계정 있으면) 마이페이지 → (계정도 없으면)
   «문자로 보냈다» 안내. 빈 uid 로 마이페이지에 보내면 남의 화면이 뜨므로 링크를 만들지 않는다. */
check('링크를 못 받았을 때의 대비책이 있다 (버튼이 사라지지 않게)',
  /ticketUrl[\s\S]{0,40}?\? `<a class="info-cta" href="\$\{ticketUrl\}"[\s\S]{0,300}?`<a class="info-cta" href="\/parent\.html/.test(gridJs));
check('계정도 티켓도 없으면 «문자로 보냈다» 고만 말한다 (빈 uid 로 마이페이지 금지)',
  /확인 링크를 문자로 보내드렸어요/.test(gridJs));
{
  const v = (idxHtml.match(/idx-grid-menu\.js\?v=(\d+)/) || [])[1];
  check(`캐시 버전이 21 이상 (안 올리면 옛 js 가 그대로) [현재 ${v}]`, Number(v || 0) >= 21);
}

console.log('\n[ ⑤-3 홈에서 «내 레벨테스트» 를 바로 찾을 수 있어야 한다 ]');
/* 처음 망고아이를 접한 사람이 자기 예약을 홈에서 못 찾으면 그대로 이탈한다.
   문자를 놓치거나 탭을 닫으면 들어갈 문이 아예 없었다. */
// (2026-08-07) 신청 화면은 홈 팝업 하나뿐 — 옛 페이지 검사는 위 «되살아나지 않았다» 로 대체됨
check('신청할 때 티켓 주소를 남긴다 (홈 팝업)', /localStorage\.setItem\('mangoi_lt_ticket', ticketUrl\)/.test(gridJs));
check('홈에 «내 레벨테스트» 카드가 있다', /id="hero-lt"/.test(idxHtml));
check('히어로 CTA «위» 에 온다 (가장 먼저 보여야 한다)',
  idxHtml.indexOf('id="hero-lt"') < idxHtml.indexOf('<div id="hero-guest">'));
check('신청한 적 없으면 안 보인다 (기본 hidden — 화면을 늘리지 않는다)',
  /<a id="hero-lt" hidden/.test(idxHtml));
/* 🔴 (2026-08-07 사장님 제보) hidden 을 «적어두는 것»만으로는 안 숨는다.
   `#hero-lt{display:block}` 은 저작자 스타일이라 브라우저 기본 `[hidden]{display:none}` 을 이긴다.
   그래서 신청한 적 없는 사람에게도 «제목만 있고 날짜·상태는 빈» 카드가 보였고,
   href 가 아직 '#' 이라 눌러도 아무 일도 일어나지 않았다. CSS 로 hidden 을 되살려야 한다. */
check('⛔ hidden 이 CSS 에 지지 않는다 (display:block 이 [hidden] 을 덮는 함정)',
  /#hero-lt\[hidden\]\{display:none!important\}/.test(idxHtml));
/* 같은 함정을 쓰는 다른 요소가 또 있는지 훑는다 — 이번이 두 번째다
   (#mango-intro-overlay 에서 한 번 밟고 규칙을 넣어뒀는데, 새 카드에서 그대로 반복됐다). */
{
  const trapped = [];
  const idRe = /<[a-z]+ id="([a-zA-Z0-9_-]+)"[^>]*\shidden[\s>]/g;
  let m;
  while ((m = idRe.exec(idxHtml)) !== null) {
    const id = m[1];
    const hasDisplay = new RegExp('#' + id + '\\{[^}]*display:(?!none)', 'i').test(idxHtml);
    const hasGuard = new RegExp('#' + id + '\\[hidden\\]\\s*\\{[^}]*display:\\s*none', 'i').test(idxHtml);
    if (hasDisplay && !hasGuard) trapped.push(id);
  }
  check(`⛔ hidden 인데 CSS display 가 그걸 덮는 요소가 없다${trapped.length ? ' [' + trapped.join(', ') + ']' : ''}`,
    trapped.length === 0);
}
/* (2026-08-07) 회원 경로가 붙었다 — 티켓은 «신청한 그 브라우저» 에만 남아서, 폰으로 신청하고
   PC 로 오면 카드가 통째로 안 떴다. 회원은 서버에 본인 신청을 물어 채운다.
   ⚠️ «비용 0» 보증은 그대로여야 한다: 티켓도 없고 로그인도 아니면 요청 0건. */
check('티켓도 없고 로그인도 아니면 요청조차 하지 않는다 (홈 첫 화면 비용 0)',
  /if \(!k && !canAskServer\) return;/.test(idxHtml));
check('로그인 회원은 서버에 본인 신청을 물어 카드를 채운다',
  /\/api\/leveltest\/my\?uid=/.test(idxHtml) && /function loadMine\(\)/.test(idxHtml));
check('티켓이 있으면 티켓 쪽을 쓴다 («지금 입장하기» 까지 알려주는 쪽)',
  /if \(!k\) \{ loadMine\(\); return; \}/.test(idxHtml));
check('티켓이 죽어도 회원이면 신청을 다시 찾는다 (티켓만 만료된 경우)',
  /localStorage\.removeItem\(KEY\)[\s\S]{0,160}?loadMine\(\);/.test(idxHtml));
check('⛔ 회원 경로에서 «지금 입장하기» 를 만들지 않는다 (join_open 을 모른다)',
  /function loadMine\(\)[\s\S]{0,1400}?el\.classList\.remove\('is-open'\)/.test(idxHtml)
  && !/function loadMine\(\)[\s\S]{0,1400}?classList\.add\('is-open'\)/.test(idxHtml));
check('회원 카드는 마이페이지로 보낸다 (거기에 「내 레벨테스트」 가 있다)',
  /el\.href = '\/parent\.html\?uid=' \+ encodeURIComponent\(myUid\)/.test(idxHtml));
check('취소된 신청은 홈에 띄우지 않는다',
  /a\.status !== 'cancelled'/.test(idxHtml));
check('입장 시간이 되면 초록으로 «확» 바뀐다',
  /#hero-lt\.is-open\{background:linear-gradient\(135deg,#34d399/.test(idxHtml)
  && /el\.classList\.add\('is-open'\)/.test(idxHtml));
check('열어두면 저절로 바뀐다 (새로고침 강요 금지)', /setInterval\(load, 60000\)/.test(idxHtml));
check('만료·무효 링크면 카드와 저장값을 지운다 (죽은 카드 금지)',
  /localStorage\.removeItem\(KEY\)[\s\S]{0,60}?el\.hidden = true/.test(idxHtml));
check('🌐 두 언어를 data-ko/data-en 으로 심는다 (화면 규칙을 따른다)',
  /function put\(node, ko, en\)/.test(idxHtml) && /node\.setAttribute\('data-en', en\)/.test(idxHtml));
check('⛔ 언어 배선을 직접 하지 않는다 (반쪽 번역으로 굳었던 자리)',
  !/mangoi:lang-change', reRenderForLang/.test(idxHtml));
{
  const v = (idxHtml.match(/idx-grid-menu\.js\?v=(\d+)/) || [])[1];
  check(`캐시 버전이 22 이상 [현재 ${v}]`, Number(v || 0) >= 22);
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

console.log('\n[ ⑧ 운영자가 링크를 «다시 건네줄» 수 있어야 한다 (2026-08-07) ]');
/* [왜] 링크는 ①신청 직후 문자 ②확정 문자 ③10분 전 리마인더 에만 실려 나갔다.
   신청자가 그 문자를 못 찾으면 상담직원도 꺼내 줄 데가 없었다 — 실제 사고(신청 #15).
   링크 하나가 확인·일정·장비점검·당일 입장을 전부 담당하는데 다시 줄 방법이 없던 것이다. */
{
  const admCore = rd('../cloudflare-deploy/public/js/adm-core.js');
  const admHtml = rd('../cloudflare-deploy/public/admin.html');
  const ltTicket = rd('../cloudflare-deploy/src/leveltest-ticket.ts');
  check('관리자 목록 API 가 티켓 링크를 함께 내려준다',
    /ltTicketUrlMap\(items\.map/.test(api) && /a\.ticket_url = tmap\[Number\(a\.id\)\]/.test(api));
  check('행마다 HMAC 키를 새로 만들지 않는다 (500행까지 내려간다)',
    /export async function ltTicketUrlMap/.test(ltTicket) && /importKey[\s\S]{0,400}?Promise\.all\(ids\.map/.test(ltTicket));
  check('링크를 못 만들어도 목록 자체는 뜬다 (신청 현황이 통째로 죽으면 안 된다)',
    /catch \(e\) \{ items\.forEach\(a => \{ a\.ticket_url = null; \}\); \}/.test(api));
  check('관리자 표에 «링크 복사» 버튼이 있다',
    /ltCopyTicket\(this,/.test(admCore) && /🎟️ \$\{adminLang==='en'\?'Copy link':'링크 복사'\}/.test(admCore));
  check('신청자가 보는 화면을 그대로 열어볼 수 있다 (↗)',
    /target="_blank" rel="noopener"[\s\S]{0,200}?↗/.test(admCore));
  check('⛔ 링크가 없는 행에 «눌러도 안 되는 버튼» 을 만들지 않는다',
    /const tk = a\.ticket_url \|\| ''/.test(admCore) && /🎟️ —/.test(admCore));
  check('복사가 막히는 환경(비보안 컨텍스트)에도 길이 있다',
    /window\.isSecureContext/.test(admCore) && /execCommand\('copy'\)/.test(admCore));
  check('alert 로 손을 묶지 않는다 (여러 건 연속 처리)',
    !/function ltCopyTicket[\s\S]{0,900}?alert\(/.test(admCore));
  check('한/영 둘 다 나온다 (강사·매니저 다수가 필리핀)',
    /'Copy link':'링크 복사'/.test(admCore) && /'Link unavailable — reload the page':'링크를 받지 못했습니다/.test(admCore));
  {
    const v = (admHtml.match(/adm-core\.js\?v=(\d+)/) || [])[1];
    check(`캐시 버전이 40 이상 (안 올리면 옛 js 가 그대로) [현재 ${v}]`, Number(v || 0) >= 40);
  }
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
