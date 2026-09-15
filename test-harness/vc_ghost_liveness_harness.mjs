// -*- coding: utf-8 -*-
// vc_ghost_liveness_harness.mjs — 「같은 사람이 두 명으로 보인다」 회귀 감시 (2026-08-20)
//   실행: node test-harness/vc_ghost_liveness_harness.mjs
//
// [무슨 사고였나]
//   2026-08-20 class-850 수업. 사장님 제보 —
//     "왜 3명이 나와?" / "학생이 두 명 나와" / "jeong 이 두 명이야" / "중국 선생님과 연결이 잘 안 돼"
//   D1 attendance 실측: 25분간 학생 7회·교사 3회 재입장, 그중 2건은 **퇴장 기록조차 없었다**.
//   19:21:19~19:21:46 은 두 세션이 실제로 동시에 살아 있었다.
//
// [뿌리]
//   화상수업 DO 에 «N초 응답 없으면 내보낸다» 판정이 **아예 없었다.**
//   joinedUsers() 는 소켓 readyState 만 보는데, 휴대폰이 종료 신호 없이 끊기면
//   서버 쪽 소켓은 한참 OPEN 으로 남는다. 브라우저는 25초마다 ping 을 보내고 2회 무응답이면
//   스스로 끊는데(createWebSocket), 서버는 그 반대 방향 판정을 하지 않았다 = 한쪽만 있는 감시.
//
//   ⚠️ 특히 위험했던 점 — 퇴장 시각(attendance.left_at)은 **HTTP** 로 기록된다.
//      휴대폰은 WebSocket 만 먼저 죽는 일이 흔해서, **출석표에는 「정상 퇴장」인데
//      화상방에는 계속 앉아 있는** 어긋남이 생긴다. 출석 기록만 보면 이 사고는 안 보인다.
//
// [2차 피해] 유령 타일은 vc-video-* id 라 감시 로직이 «진짜 사람» 으로 오판했다 →
//   고착 워치독이 피어당 최대 4회 강제 재연결(mesh 라 전원의 업로드가 흔들림)
//   + 「🎤 상대 소리가 안 와요」 오경보(교사 마이크는 멀쩡했다).
//
// 이 파일이 깨지면 위 사고가 그대로 재발한다. 지우지 말 것.

import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => {
  const m = /public\/([\w.-]+\.html)$/.exec(p);
  return m ? readPageSource(m[1]) : readFileSync(resolve(__dir, p), 'utf8');
};

let PASS = 0, FAIL = 0; const FAILS = [];
function ok(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const DO   = R('../cloudflare-deploy/src/video-call-room.ts');
const IDX  = R('../cloudflare-deploy/public/index.html');
const GH   = R('../cloudflare-deploy/public/js/idx-vc-dupghost.js');
const MAIN = R('../cloudflare-deploy/public/js/idx-main.js');

// ── ① 서버: 생존 판정 ──────────────────────────────────────────────
console.log('\n[ ① 서버(DO) — 죽은 소켓을 스스로 내보낸다 ]');
ok('알람 핸들러가 있다(없으면 청소가 영영 안 돈다)', /async alarm\(\)\s*:/.test(DO));
ok('입장 시 청소 알람을 건다', /scheduleLivenessAlarm\(\)/.test(DO));
ok('알람이 스스로 다음 알람을 예약한다(한 번 돌고 멈추면 의미 없음)',
   /if \(alive > 0\) this\.scheduleLivenessAlarm\(\);/.test(DO));
ok('사람이 없으면 알람을 다시 걸지 않는다(빈 방을 계속 깨우지 않는다)',
   /alive > 0[\s\S]{0,200}else[\s\S]{0,120}알람 중지/.test(DO));
ok('소켓마다 «마지막으로 살아 있던 시각» 을 남긴다', /seenAt\?: number/.test(DO));
ok('accept 시점에도 seenAt 을 남긴다(join 도 ping 도 안 하는 소켓이 영원히 사는 것 방지)',
   /server\.serializeAttachment\(\{[^}]*seenAt: Date\.now\(\)/.test(DO));
ok('참관자도 청소 대상(죽은 참관 소켓이 정원 2자리를 먹는 것 방지)',
   /role: 'observer'[\s\S]{0,240}scheduleLivenessAlarm\(\)/.test(DO));

// 🔴 임계값을 좁히면 «고치려던 것보다 큰 사고» 가 난다 — 필리핀·중국 회선에서
//    멀쩡한 수업이 끊긴다. ping 주기(25초)의 4배 이상을 유지할 것.
{
  const m = DO.match(/LIVENESS_STALE_MS\s*=\s*(\d+)\s*\*\s*1000/);
  const sec = m ? Number(m[1]) : 0;
  ok(`무응답 판정이 ping 주기(25초)의 4배 이상 (현재 ${sec || '없음'}초)`, sec >= 100);
}
{
  const m = DO.match(/LIVENESS_ALARM_MS\s*=\s*(\d+)\s*\*\s*1000/);
  const sec = m ? Number(m[1]) : 0;
  ok(`점검 주기가 30초 이상 (너무 잦으면 방을 계속 깨운다 · 현재 ${sec || '없음'}초)`, sec >= 30);
}
// 🔴 1000(정상 종료)으로 닫으면 학생 화면이 «강사 퇴장» 으로 읽어 수업을 즉시 끝낸다.
ok('청소는 1000 이 아닌 코드로 닫는다(오판이어도 수업이 끝나지 않게)',
   /ws\.close\(4003, 'liveness-timeout'\)/.test(DO) && !/ws\.close\(1000, 'liveness/.test(DO));
ok('청소 퇴장은 left 가 아니라 dropped(재연결 유예를 준다)',
   /liveness[\s\S]{0,900}handleLeaveRoom\([^)]*'dropped'\)/.test(DO));
ok('ping 자동응답을 걸어 DO 를 깨우지 않고 생존 시각을 남긴다',
   /setWebSocketAutoResponse/.test(DO) && /\{"type":"ping"\}/.test(DO));
ok('자동응답이 안 먹는 클라이언트를 위해 기존 ping 핸들러도 남아 있다',
   /case 'ping':\s*this\.send\(userId, \{ type: 'pong'/.test(DO));
ok('생존 시각은 세 곳 중 «가장 최근» 을 쓴다(하나가 비어도 오판 안 함)',
   /lastSeenOf\(ws[\s\S]{0,420}getAutoResponseTimestamp/.test(DO));
// 🔴 메모리 Map 에만 적으면 hibernation 때 통째로 비고, 남는 바닥값이 «입장 시각» 뿐이라
//    **멀쩡한 수업 전원이 120초에 끊긴다.** attachment 는 hibernation 을 넘어 살아남는다.
ok('생존 시각을 attachment 에도 주기적으로 적는다(hibernation 대비)',
   /_now - \(att\.seenAt \|\| 0\) > \d+/.test(DO) && /serializeAttachment\(\{ \.\.\.att, seenAt: _now \}/.test(DO));
ok('알람이 roomId 를 되살린다(안 하면 청소 로그가 room=- 로 남아 추적 불가)',
   /if \(!this\.roomId && att\.roomId\) this\.roomId = att\.roomId;/.test(DO));

/* ──────────────────────────────────────────────────────────────────────────
   💓 (2026-09-15) 「멀쩡한 학생을 2분마다 끊어내던」 오판 방지 — 실제로 돌려서 본다.

   [사고] 9/15 수업 3건 전원이 20~30분에 8~9번씩 끊겼다. 재접속 간격이
     123·135·137·137·137·160초로 STALE(120초)+ALARM(45초) 구간과 정확히 겹쳤고,
     그때 회선은 멀쩡했다(학생 RTT 57ms·손실 0%). 배포도 무죄였다 —
     그 수업 시간대 배포 2건은 보류 게이트에 걸려 skipped 였다.
   [뿌리] 생존 판단의 정본인 getAutoResponseTimestamp 가 비면 남는 바닥값이
     «입장 시각» 뿐이라, 입장 120초 뒤 끊고 재접속 후 또 120초 뒤 끊는 순환이 된다.
   ⛔ 문자열로 「그 조건이 있는가」만 물으면 `if (false && ...)` 한 글자에 뚫린다.
      그래서 판정 함수를 오려 내 **실제로 돌려** 답으로 묻는다. */
{
  function blockAt(src, openIdx) {
    let d = 0;
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) return src.slice(openIdx + 1, i); }
    }
    return '';
  }
  let verdict = null, cutErr = '';
  try {
    const sig = DO.match(/static livenessVerdict\(([\s\S]*?)\)\s*:/);
    const open = DO.indexOf('{', DO.indexOf('static livenessVerdict'));
    const body = open > 0 ? blockAt(DO, open) : '';
    if (sig && body) {
      const params = sig[1].replace(/:\s*number/g, '').split(',').map(x => x.trim()).filter(Boolean);
      verdict = new Function(...params, body);
    }
  } catch (e) { cutErr = (e && e.message) || String(e); }

  /* 🔴 전제 — 못 오려 내면 아래 검사가 통째로 «빈 문자열» 을 보고 조용히 통과한다. */
  ok('판정 함수(livenessVerdict)를 오려 내 실행할 수 있다' + (cutErr ? ' — ' + cutErr : ''),
     typeof verdict === 'function');

  if (typeof verdict === 'function') {
    const STALE = 120000, NOPING = 600000, now = 1000000;
    const V = (silentSec, autoAt) => {
      try { return verdict(now, now - silentSec * 1000, autoAt, STALE, NOPING); }
      catch (e) { return 'ERR:' + ((e && e.message) || e); }
    };
    const AUTO = now - 30000;   // ping 근거가 잡힌 소켓

    // ── 예전 동작은 그대로여야 한다(짝이 없으면 «전부 유예» 도 통과한다) ──
    ok('ping 근거가 있고 조용한 지 얼마 안 됐으면 살아 있음', V(60, AUTO) === 'alive');
    ok('ping 근거가 있는데 STALE 을 넘겼으면 예전대로 정리한다(유령 청소가 죽지 않았다)',
       V(200, AUTO) === 'kill');
    ok('시각을 하나도 못 구한 소켓은 건드리지 않는다', verdict(now, 0, 0, STALE, NOPING) === 'alive');

    // ── 이번 수리: ping 근거가 없으면 «조용하다» 를 단정하지 않는다 ──
    ok('ping 근거가 없으면 STALE 을 넘겨도 바로 끊지 않는다(실사고 137초)',
       V(137, 0) === 'grace');
    ok('ping 근거가 없어도 경계 직전까지는 기다린다', V(599, 0) === 'grace');

    // ── 그래도 영원히 살려 두지는 않는다(2026-08-20 유령 사고 재발 방지) ──
    ok('ping 근거가 없어도 상한을 넘기면 정리한다', V(601, 0) === 'kill');

    /* ⚠️ 「끊지 않는다」만 재면 «전부 살려 두기» 가 통과한다 — 위 kill 두 줄이 그 짝이다. */
  }
}

/* 상한 값 자체도 못 박는다 — 너무 짧으면 이번 사고가 되살아나고,
   너무 길면(=사실상 무한) 죽은 소켓이 수업 내내 남아 2026-08-20 사고가 된다. */
{
  const st = Number((DO.match(/LIVENESS_STALE_MS\s*=\s*(\d+)\s*\*\s*1000/) || [])[1] || 0);
  const np = Number((DO.match(/LIVENESS_NOPING_STALE_MS\s*=\s*(\d+)\s*\*\s*1000/) || [])[1] || 0);
  ok(`ping 근거 없을 때의 상한이 기본 상한보다 넉넉하다 (${np || '없음'}초 > ${st}초)`, np > st);
  ok(`그 상한이 «사실상 무한» 은 아니다 (${np || '없음'}초 <= 1800초)`, np > 0 && np <= 1800);
}

/* ⛔ 판정을 alarm() 안에 도로 복제하면 위 «실제로 돌리는» 검사가 헛돈다. */
ok('알람은 판정을 복제하지 않고 순수 함수를 부른다',
   /const verdict = VideoCallRoom\.livenessVerdict\(/.test(DO)
   && !/if \(now - seen <= VideoCallRoom\.LIVENESS_STALE_MS\)/.test(DO));
ok('끊을 때 세 근거를 각각 남긴다(「왜 끊었나」를 사후에 가르려면 합친 값만으론 모자람)',
   /silent=\$\{[\s\S]{0,400}auto=\$\{[\s\S]{0,300}mem=\$\{[\s\S]{0,300}att=\$\{/.test(DO));
/* ⛔ 이모지는 Unicode 13 이상 금지(Win10 에서 두부로 보임 — CLAUDE.md 1-4).
   이 파일이 처음 짜였을 때 심장 이모지(U+1FAC0, Unicode 13.0)를 8곳에 썼다가 걸렸다.
   경계를 U+1FAC0 으로 잡는 이유 — 같은 블록(Extended-A) 안에서도 U+1FA70~1FA9F 는
   Unicode 12.0 이라 허용된다(이 파일에 이미 U+1FA9E 🪞 가 2026-08-12 부터 있다).
   U+1FAC0 부터가 Unicode 13.0 이 추가한 구간이다. */
ok('Unicode 13 이상 이모지를 쓰지 않는다', !/[\u{1FAC0}-\u{1FAFF}]/u.test(DO));

// ── ② 화면: 유령 타일 청소 ─────────────────────────────────────────
console.log('\n[ ② 화면 — 서버가 치우기 전 2분 동안의 즉효 완화책 ]');
ok('유령 청소 스크립트가 index.html 에 실려 있다', /idx-vc-dupghost\.js\?v=\d+/.test(IDX));
// ⚠️ idx-main.js 는 849KB 이고 학생 29,000명이 첫 화면에서 받는다. 예산 여유가 거의 없다.
ok('그 스크립트는 defer (첫 화면 blocking 예산에 얹지 않는다)',
   /idx-vc-dupghost\.js\?v=\d+"\s+defer/.test(IDX));
ok('영상이 오는 타일은 절대 지우지 않는다', /if \(it\.ok\) return;/.test(GH));
ok('붙는 중일 수 있는 시간을 준다(20초 이상)', /GHOST_MS\s*=\s*(2\d|[3-9]\d)000/.test(GH));
// 🔴 «이름만 같으면 지운다» 로 넓히면 가족 공용 계정에서 양쪽이 서로를 지우는 무한 킥이 된다.
//    반드시 «한쪽은 멀쩡히 붙어 있다» 는 비대칭이 확인될 때만 지운다.
ok('지우는 조건이 둘뿐 — 내 이름과 같거나 / 같은 이름의 다른 타일이 정상 수신 중',
   /it\.name === mine/.test(GH) && /liveByName\[it\.name\]/.test(GH));
ok('둘 다 미수신인 같은 이름 쌍은 건드리지 않는다(무한 킥 방지)',
   /if \(ok\) liveByName\[name\] = true;/.test(GH));
ok('참관자 화면에서는 동작하지 않는다', /_vcObserverMode\) return;/.test(GH));
ok('타일을 지운 만큼 참여자 수 표시도 줄인다', /Math\.min\(n, visibleCount\(\)\)/.test(GH));
ok('참여자 수는 줄이기만 한다(서버 숫자를 늘리지 않는다)', /Math\.min\(/.test(GH) && !/Math\.max\(n,/.test(GH));
ok('떠날 때 leave-room 을 한 번 더 보낸다(유령이 생기는 것 자체를 줄인다)',
   /addEventListener\('pagehide'[\s\S]{0,900}type: 'leave-room'/.test(GH));

// 🔴 아래 둘은 «고치려던 것보다 큰 사고» 를 막는 줄이다. 지우면 학생 화면에 「수업이 끝났어요」가 뜬다.
//    index.html 의 vcRemovePeer 후킹은 reason==='left' 일 때만 10초 뒤 endOfClassFlow() 를 예약한다.
ok('유령 제거는 사유 없이 부른다(«left» 로 부르면 수업 종료 흐름이 돈다)',
   /window\.vcRemovePeer\(userId\);/.test(GH) && !/vcRemovePeer\(userId, ?'left'\)/.test(GH));
ok('bfcache(persisted) 때는 leave-room 을 보내지 않는다(앱 전환만 해도 수업이 끝난다)',
   /pagehide'[\s\S]{0,900}e\.persisted\) return;/.test(GH));

// ── ③ 오경보 ───────────────────────────────────────────────────────
console.log('\n[ ③ 「🎤 상대 소리가 안 와요」 오경보 ]');
ok('한 번도 안 붙은 상대에게는 마이크 탓을 하지 않는다', /function muteFalseAudioAlarm/.test(GH));
// 띄운 뒤 지우면 3초마다 깜빡인다 — 감시견이 «띄우기 전에» 막아야 한다.
ok('띄우기 전에 막는다(noTrack 되돌리기)', /__audPrev\) pc\.__audPrev\.noTrack = 0/.test(GH));
ok('이미 떠 있던 띠도 걷는다(안전망)', /vc-noaudio-hint'\);\s*\n?\s*if \(h\) h\.remove\(\)/.test(GH));
ok('감시견 쪽에 «어디서 막는지» 표시가 남아 있다', /idx-vc-dupghost\.js/.test(MAIN));

// ── ④ 교재로 돌아갈 길 ─────────────────────────────────────────────
console.log('\n[ ④ 「나갔다 바꾸면 교재가 보이지 않는다」 ]');
// 실측(2026-08-20 헤드리스): 「📚 교재도구」 칩은 x 659~870 인데 폰 탭바는 375px 까지만 보인다.
//   버튼이 없으면 칠판·게임을 한 번 누른 뒤 교재로 돌아올 방법이 화면에 없다.
ok('교재 탭 버튼이 있다', /vcToggleContentTab\('pdf'\)/.test(IDX));
ok('교재 버튼이 탭바 «맨 앞» 이다(뒤에 두면 폰에서 화면 밖으로 밀린다)',
   (() => {
     const bar = /<div class="tab-bar">([\s\S]*?)<\/div>/.exec(IDX);
     if (!bar) return false;
     const btns = bar[1].match(/vcToggleContentTab\('(\w[\w-]*)'\)/g) || [];
     return btns.length > 0 && btns[0] === "vcToggleContentTab('pdf')";
   })());
ok('교재는 다시 눌러도 접히지 않는다(돌아오려고 누르는 버튼이 접으면 안 된다)',
   /tabName !== 'whiteboard' && tabName !== 'pdf'/.test(MAIN));
ok('교재 버튼에 한/영 라벨이 있다', /data-ko="📖 교재" data-en="📖 Textbook"/.test(IDX));

/* 🎨 (2026-08-21) 활성 탭이 «앰버 알약 + 파란 밑줄» 로 두 색이 싸우던 것.
   옛 세대 `.tab-btn.active{border-bottom-color:#38bdf8}` 위에 이 파일이 알약을 얹으면서
   밑줄을 안 껐다. 교재 버튼이 생겨 첫 화면에 늘 보이게 되자 티가 났다. */
const REF = R('../cloudflare-deploy/public/css/vc-refresh.css');
ok('활성 탭에서 옛 파란 밑줄을 끈다(알약과 색이 싸움)',
   /\.tab-btn\.active\{[^}]*border-bottom-color:\s*transparent/.test(REF));
// ⛔ box-shadow 로 그리면 저사양 모드(html.lite-mode)가 box-shadow:none !important 로 지운다(실측).
ok('테두리를 box-shadow 가 아니라 outline 으로 그린다(lite-mode 에서 사라짐)',
   /\.tab-btn\.active\{[^}]*outline:[^}]*outline-offset:\s*-1px/.test(REF)
   && !/\.tab-btn\.active\{[^}]*box-shadow:inset/.test(REF));
ok('라이트 테마는 그 테마의 강조색(하늘)으로 맞춘다(앰버 배경 + 파란 글자 방지)',
   /body\.vc-theme-light\.vc-in-call \.tab-bar \.tab-btn\.active\{/.test(REF));

console.log(`\n결과: ${PASS} 통과, ${FAIL} 실패`);
if (FAIL) { FAILS.forEach(f => console.log(`실패: ${f}`)); process.exit(1); }
