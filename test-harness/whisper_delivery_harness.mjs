// -*- coding: utf-8 -*-
// 📢 관리자·참관자 귓속말이 «강사에게만» 실제로 도착하는지 하니스
//   실행:  node test-harness/whisper_delivery_harness.mjs
//   대상:  cloudflare-deploy/src/video-call-room.ts · src/api-admin.ts · public/js/idx-main.js
//
//   ── 왜 만들었나 (2026-08-19 Melca 8/19 제보 2-③) ──────────────────────────
//   「Chat is not visible as observer send message at the classroom」
//   참관자가 교실에서 메시지를 보내도 강사 화면에 아무것도 안 떴다. 원인이 **둘**이었다:
//
//     ① 참관자는 «유령»(joined:false)으로 붙는데(handleJoinObserve),
//        handleChatMessage 첫 줄이 usernameOf() 로 «입장한 사람» 만 통과시켜
//        참관자 메시지를 **에러도 응답도 없이 버렸다.**
//     ② /api/admin/whisper/send 는 D1 에 기록만 하고 끝났다. 코드에
//        `// GM-4 미구현: 실제 WebSocket push 는 추후` 가 그대로 남아 있었고
//        응답은 영원히 delivery_status:'queued' 였다.
//
//   둘 다 «에러가 안 나서» 오래 방치됐다. 화면에는 보내기 버튼이 멀쩡히 있었다.
//   그래서 «되돌아가면 FAIL» 이 나게 이 하니스로 못 박는다.
//
//   ⛔ 이 기능에서 가장 위험한 것은 **학생에게 새는 것**이다.
//      관리자가 강사에게 하는 지시를 학생이 보면 안 된다.
//      아래 ②·③·⑥ 이 그 게이트를 지킨다.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, '..', p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/** 주석을 벗긴 사본 — «이 말이 없어야 한다» 류 검사는 반드시 이걸로 한다.
 *  (설명 주석에 그 단어가 들어가면 검사가 자기 주석을 잡는다 — CLAUDE.md 2장) */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** 표시 문구부터 «중괄호 짝» 까지를 정확히 잘라 낸다.
 *  ⚠️ slice(i, i+N) 으로 «대충» 자르면 옆 함수까지 딸려 들어와 거짓 FAIL 이 난다 —
 *     2026-08-26 에 실제로 밟았다(handleObserverWhisper 뒤의 handleChatMessage 안
 *     broadcastAll 이 잡혀 「대상 지정이 방 전체로 샌다」고 나왔다).
 *  못 찾으면 빈 문자열 → 부르는 쪽이 «못 찾음» 으로 FAIL 낸다(조용히 통과시키지 않는다). */
function blockAt(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return '';
}

const DO_SRC = R('cloudflare-deploy/src/video-call-room.ts');
const ADMIN_SRC = R('cloudflare-deploy/src/api-admin.ts');
const CLIENT_SRC = R('cloudflare-deploy/public/js/idx-main.js');
/* 📢 그리기는 별도 파일(defer). idx-main.js 는 849KB 이고 index.html 첫 화면 blocking
   예산에 들어간다 — 강사만 쓰는 기능을 학생 29,000명에게 내려보내지 않는다. */
const WHISPER_SRC = R('cloudflare-deploy/public/js/idx-whisper.js');
const DO_CODE = strip(DO_SRC);
const ADMIN_CODE = strip(ADMIN_SRC);
const CLIENT_CODE = strip(CLIENT_SRC);
const WHISPER_CODE = strip(WHISPER_SRC);

console.log('\n════════ 📢 귓속말 전달 하니스 ════════');

// ── ① DO 에 전달 경로가 실제로 있다 ─────────────────────────────────────────
console.log('\n[ ① DO 가 귓속말을 받는 길이 있다 ]');
check("HTTP '/whisper' 경로가 있다", /url\.pathname\s*===\s*'\/whisper'/.test(DO_CODE));
check("admin-whisper 메시지 타입을 실제로 내보낸다", /type:\s*'admin-whisper'/.test(DO_CODE));

// ── ② 학생에게 새지 않는다 (가장 중요) ──────────────────────────────────────
console.log('\n[ ② 🔒 학생 차단 — 이 게이트가 이 기능의 핵심이다 ]');
{
  /* '/whisper' 블록만 잘라서 본다 — 파일 전체에 isStaffAtt 가 있다고 통과시키면 의미가 없다.
     ⚠️ slice(i, i+N) 으로 «대충» 자르지 않는다. 2026-08-26 에 이 블록에 «콕 집은 한 사람»
        분기가 붙어 길어졌고, 폭이 좁으면 뒤쪽 staff 경로를 아예 못 본다. */
  const seg = blockAt(DO_CODE, "url.pathname === '/whisper'");
  check("'/whisper' 블록을 찾았다", !!seg);
  check("'/whisper' 가 isStaffAtt 로 staff 소켓만 고른다", /isStaffAtt\(/.test(seg),
        !seg ? '/whisper 블록을 못 찾음' : '블록 안에 isStaffAtt 가 없다 — 학생에게 샌다');
  check("'/whisper' 가 broadcastAll 로 방 전체에 뿌리지 않는다", !!seg && !/broadcastAll\s*\(/.test(seg),
        'broadcastAll 은 학생 소켓까지 포함한다');
  /* «대상 없음» 경로는 예전 그대로여야 한다 — 옛 화면·다른 호출자가 그대로 쓴다.
     for 문 안의 isStaffAtt 가 그 경로다(대상 지정 분기의 isStaffAtt(ta) 와 다른 것). */
  check('대상을 안 고른 경로는 여전히 강사 전원 루프다',
        /for \(const ws of this\.state\.getWebSockets\(\)\)[\s\S]{0,200}?isStaffAtt\(att\)/.test(seg),
        '이 루프가 사라지면 옛 화면의 「강사에게 귓속말」이 조용히 죽는다');
}

// ── ③ 참관자 채팅을 버리지 않고 staff 로 돌린다 ─────────────────────────────
console.log('\n[ ③ 참관자 메시지를 조용히 버리지 않는다 ]');
check('참관자 전용 처리 함수가 있다', /handleObserverWhisper/.test(DO_CODE));
check("chat-message 에서 role==='observer' 를 갈라 낸다",
      /case\s*'chat-message'[\s\S]{0,400}?observer[\s\S]{0,200}?handleObserverWhisper/.test(DO_CODE),
      '참관자 분기가 없으면 usernameOf() 에서 조용히 버려진다');
{
  const seg = blockAt(DO_CODE, 'private handleObserverWhisper');
  check('handleObserverWhisper 도 isStaffAtt 로 자른다', /isStaffAtt\(/.test(seg),
        !seg ? '함수를 못 찾음' : '학생에게 샌다');
  check('보낸 참관자에게 회신(ack)을 준다', /admin-whisper-ack/.test(seg),
        '회신이 없으면 «갔는지 안 갔는지» 를 몰라 같은 말을 여러 번 쓴다');
}

// ── ④ 관리자 API 가 실제로 밀어 넣는다 ─────────────────────────────────────
console.log('\n[ ④ /api/admin/whisper/send 가 기록만 하고 끝나지 않는다 ]');
{
  const i = ADMIN_CODE.indexOf("path === '/api/admin/whisper/send'");
  const seg = i >= 0 ? ADMIN_CODE.slice(i, i + 3500) : '';
  check('VIDEO_CALL_ROOM DO 로 실제로 fetch 한다', /VIDEO_CALL_ROOM[\s\S]{0,400}?\/whisper/.test(seg),
        i < 0 ? '핸들러를 못 찾음' : 'D1 기록만 하고 끝나던 상태로 되돌아갔다');
  check("전달되면 delivery_status 가 'delivered' 가 된다", /'delivered'/.test(seg));
  check('전달 못 했으면 정직하게 queued 로 답한다', /'queued'/.test(seg),
        '방이 비었는데 «보냈다» 고 하면 관리자가 강사가 받은 줄 알고 기다린다');
}
check('「GM-4 미구현」 표시가 남아 있지 않다 (주석 제외 후 판정)',
      !/GM-4\s*미구현[\s\S]{0,120}WebSocket push/.test(ADMIN_CODE));

// ── ⑤ 강사 화면이 실제로 그린다 ────────────────────────────────────────────
console.log('\n[ ⑤ 강사 화면이 받은 것을 그린다 ]');
check("idx-main.js 가 admin-whisper 를 받아 넘긴다", /case\s*'admin-whisper'/.test(CLIENT_CODE));
check("참관자 회신(admin-whisper-ack)도 받는다", /case\s*'admin-whisper-ack'/.test(CLIENT_CODE));
check('그리기 파일이 아직 없으면 큐에 담아 둔다', /__vcWhisperQ/.test(CLIENT_CODE),
      '큐가 없으면 수업 중에 온 첫 메시지 하나가 조용히 사라진다');
check('idx-whisper.js 가 큐를 비운다', /__vcWhisperQ/.test(WHISPER_CODE));
check('idx-whisper.js 가 window.vcWhisperOn 을 만든다', /window\.vcWhisperOn\s*=/.test(WHISPER_CODE));
check('index.html 이 idx-whisper.js 를 defer 로 부른다',
      /idx-whisper\.js\?v=\d+"\s+defer/.test(R('cloudflare-deploy/public/index.html')),
      'defer 가 아니면 첫 화면 blocking 예산(first_paint_budget_harness)을 깬다');

// ── ⑥ 클라이언트 이중 방어 + 과거 사고 재발 방지 ───────────────────────────
console.log('\n[ ⑥ 클라이언트 쪽 안전장치 ]');
{
  const seg = WHISPER_CODE;   // 그리기는 전부 이 파일 안에 있다
  check('내 역할이 강사·관리자가 아니면 그리지 않는다 (이중 방어)',
        /vcMyRole[\s\S]{0,160}?teacher[\s\S]{0,80}?admin/.test(seg),
        '서버가 막지만 한 겹 더 둔다 — 서버 회귀 때 학생 화면에 바로 뜬다');
  check('메시지를 textContent 로 넣는다 (innerHTML 금지)',
        /b\.textContent\s*=\s*text/.test(seg) && !/\.innerHTML\s*=/.test(seg),
        '관리자가 쓴 글이 그대로 HTML 이 되면 XSS 다');
  check('닫을 때 같은 id 를 전부 지운다 (querySelectorAll)',
        /querySelectorAll\('#'\s*\+\s*BOX_ID\)/.test(seg),
        '하나만 지우면 «닫아도 안 사라지는» 상자가 남는다 (CLAUDE.md 2장)');
  check('opacity:0 으로 시작하지 않는다',
        !/opacity\s*:\s*0\s*[;'"]/.test(seg),
        '백그라운드 탭에서 transition 이 멈춰 «영영 안 보이는» 사고가 난다 (CLAUDE.md 2장)');
  check('스스로 사라지는 타이머가 있다', /setTimeout\([\s\S]{0,40}?8000\)/.test(seg),
        '안 닫아도 사라지는 안전망이 필요하다');
  check('touchend 로도 닫힌다', /touchend/.test(seg),
        '인앱 브라우저에서 click 이 안 오는 경우가 있다 (CLAUDE.md 2장)');
}

// ── ⑦ 유령 참관 계약이 깨지지 않았다 ───────────────────────────────────────
console.log('\n[ ⑦ 유령 참관 설계 계약 유지 ]');
check("참관자는 여전히 joined:false 로 붙는다",
      /role:\s*'observer',\s*joined:\s*false/.test(DO_CODE),
      '참관자가 참가자 목록에 들어가면 «학생·강사 모르게» 계약이 깨진다');
check('참관 입장이 user-joined 를 방송하지 않는다',
      !/handleJoinObserve[\s\S]{0,1500}?broadcastAll\(\s*\{\s*type:\s*'user-joined'/.test(DO_CODE));

// ── ⑧ 학생에게도 보내기 (2026-08-26 사장님 지시) ───────────────────────────
//   [왜] 「수업 관찰로 보다가 학생에게도 메시지 보낼 수 있게 해줘」.
//   [무엇이 위험한가] 이 길을 열면서 «전체에 뿌리는» 쪽으로 미끄러지면 학생 전원이 남에게
//     간 지시를 본다. 그래서 «한 사람에게만» 을 여기서 못 박는다.
console.log('\n[ ⑧ 대상을 콕 집으면 그 한 사람에게만 간다 ]');
{
  const fn = blockAt(DO_CODE, 'private handleObserverWhisper');
  const seg = blockAt(fn, 'if (toUserId)');      // «대상 지정» 분기만 — 옆 코드가 섞이면 판정이 흐려진다
  check('화면이 고른 대상(toUserId)을 읽는다', /toUserId/.test(fn),
        !fn ? '함수를 못 찾음' : '안 읽으면 학생을 골라도 강사에게 간다 (2026-08-26 그 상태였다)');
  check('«대상 지정» 분기가 있다', !!seg, '분기가 사라지면 학생에게 보내는 길이 통째로 없어진다');
  check('그 한 사람 소켓만 찾아 보낸다 (wsOf)', /wsOf\(\s*toUserId\s*\)/.test(seg));
  check('대상 지정 경로가 broadcast 로 새지 않는다',
        !!seg && !/broadcast(All)?\s*\(/.test(seg),
        '방 전체에 뿌리면 학생 전원이 남에게 간 귓속말을 본다');
  check('받는 쪽 이중 방어용 표시를 함께 보낸다 (direct·to)',
        /direct:\s*true/.test(seg) && /\bto:\s*toUserId/.test(seg),
        '화면이 «나에게 온 것인가» 를 확인할 근거가 없으면 서버 회귀 때 그대로 샌다');
  check('학생에게는 보낸 사람 이름을 넘기지 않는다',
        /from:\s*staff\s*\?/.test(seg),
        '«관찰자» 라는 낯선 이름이 학생 화면에 뜨면 «투명 유령» 참관 설계가 화면에서 깨진다');
  check('회신(ack)에 본문을 함께 실어 준다', /message:\s*body/.test(fn),
        '본문이 없으면 화면이 «내가 무엇을 보냈는지» 를 채팅창에 남길 수 없다');
}
{
  const seg = WHISPER_CODE;
  check('화면은 «나에게 온 것» 일 때만 그린다 (to === 내 id)',
        /d\.direct\s*===\s*true[\s\S]{0,320}?String\(d\.to\)\s*!==\s*me/.test(seg),
        '서버가 회귀해 전원에게 뿌려도 남의 글이 내 화면에 뜨지 않아야 한다');
  check('내 id 를 window.vcUserId 로 읽지 않는다',
        !/window\.vcUserId/.test(seg) && /typeof\s+vcUserId\s*!==\s*'undefined'/.test(seg),
        'vcUserId 는 idx-main.js 의 let 이라 window 에 없다 — 항상 빈 값이 되어 조용히 안 그린다 (CLAUDE.md 2장)');
  check('학생에게는 «학생에게는 보이지 않습니다» 를 말하지 않는다',
        /toStaff\s*===\s*false/.test(seg),
        '받는 사람이 학생인데 그 문구를 띄우면 말이 안 된다');
}

// ── ⑨ 「채팅창에 아무것도 안 나타난다」 재발 방지 ───────────────────────────
//   [왜] 2026-08-26 사장님이 참관 중 채팅창에 「왜 안들어와요?」를 쓰셨는데 화면에 아무
//     흔적도 남지 않았다. 참관자 메시지는 방에 안 뿌려지므로 «에코» 가 없다 — 토스트만
//     몇 초 떴다 사라져서, 보낸 사람은 기능이 죽은 줄 안다.
console.log('\n[ ⑨ 보낸 사람 화면에 «보낸 기록» 이 남는다 ]');
{
  const seg = WHISPER_CODE;
  check('회신을 받으면 채팅창에 한 줄 남긴다 (vcAddChatSystem)',
        /vcAddChatSystem/.test(seg),
        '토스트만 있으면 몇 초 뒤 사라져 «아무것도 안 나타난다» 가 된다');
  check('보낸 본문도 함께 적는다', /d\.message/.test(seg),
        '「전달했습니다」만 있고 무엇을 보냈는지 없으면 대화가 안 읽힌다');
  check('누구에게 갔는지 이름으로 알려 준다', /d\.toName/.test(seg));
}

// ── ⑩ 참관자에게 «채팅» 이 아니라 «귓속말» 이라고 말해 준다 ────────────────
//   [왜] 사장님 「여기 어디에 귓속말이 있어?」 — 기능은 있었는데 화면 어디에도 그 말이
//     없었다. 이름표가 사실과 다르면 있는 기능도 없는 것이다.
console.log('\n[ ⑩ 참관 중 이름표가 사실과 맞다 ]');
{
  const GUARD = strip(R('cloudflare-deploy/public/js/vc-observe-guard.js'));
  check('하단 독 채팅 버튼을 «귓속말» 로 바꾼다', /vc-dock-chat/.test(GUARD) && /귓속말/.test(GUARD));
  check('라벨을 data-ko·data-en 까지 함께 갱신한다',
        /setAttribute\('data-ko'/.test(GUARD) && /setAttribute\('data-en'/.test(GUARD),
        'textContent 만 바꾸면 i18n 엔진이 다시 «채팅» 으로 덮어쓴다 (CLAUDE.md 2장)');
  check('대상 칩 «전체» 를 «강사에게만» 으로 고친다', /chat-target-chip/.test(GUARD));
  check('참관 중이 아니면 손대지 않는다', /if\s*\(!observing\(\)\)\s*return;/.test(GUARD),
        '일반 학생·강사 화면의 «채팅» 이름표까지 바뀌면 안 된다');
  check('상주 setInterval 로 이름표를 지키지 않는다',
        !/setInterval\([\s\S]{0,80}?relabel/.test(GUARD),
        '홈에 머무는 학생 폰을 계속 깨운다 (CLAUDE.md 2장)');
  check('index.html 이 vc-observe-guard.js 를 defer 로 부른다',
        /vc-observe-guard\.js\?v=\d+"\s+defer/.test(R('cloudflare-deploy/public/index.html')));

  /* ⛔ 참관자 귓속말이 D1 채팅 이력에 남으면 학생이 「이전 대화 보기」로 그대로 읽는다.
     (GET /api/chat/messages 는 그 방 참가자면 통과한다 — api-notify.ts) */
  check('참관 중에는 vcSendChat 을 가로채 D1 저장을 건너뛴다',
        /wrapSend|__vcObsSend/.test(GUARD) && /observerSendChat/.test(GUARD),
        '저장되면 «강사에게만» 한 귓속말을 학생이 이력으로 불러온다');
  check('가로챈 전송이 /api/chat/messages 를 부르지 않는다',
        !/api\/chat\/messages/.test(GUARD),
        '참관자 글은 소켓으로만 보낸다 — 서버가 귓속말로 돌린다');
  check('대상을 고른 경우 toUserId 를 실어 보낸다', /toUserId:\s*t\.userId/.test(GUARD));
}

// ── ⑪ 관리자 「수업 관찰」 화면에서도 학생에게 (2026-08-26 사장님 지시) ─────
//   [왜] 방 안 참관 화면에는 PR #514 로 길을 냈지만, 방 밖에서 보는
//     /admin/ghost-view.html 은 「📢 강사에게 귓속말」 하나뿐이었다.
//   [무엇이 위험한가] ① 오배달(학생에게 보내려던 글이 강사에게) ② «보낸 척»
//     (아무도 안 받았는데 화면이 「전송 완료」라고 하는 것).
console.log('\n[ ⑪ 관리자 수업 관찰 화면 — 콕 집어 보내기 ]');
{
  const seg = blockAt(DO_CODE, "url.pathname === '/whisper'");
  const dir = blockAt(seg, 'if (toUserId || toName)');
  check('DO 가 대상(to·to_name)을 읽는다', /body\?\.to\b/.test(seg) && /body\?\.to_name/.test(seg));
  check('«대상 지정» 분기가 있다', !!dir);
  check('그 분기가 broadcast 로 새지 않는다', !!dir && !/broadcast(All)?\s*\(/.test(dir),
        '방 전체에 뿌리면 학생 전원이 남에게 간 지시를 본다');
  check('이름은 후보가 «정확히 하나» 일 때만 쓴다',
        /hits\.length === 1/.test(dir),
        '둘 이상인데 아무거나 고르면 남에게 보낸다 (CLAUDE.md 2장 「남의 이름이 뜸」과 같은 규칙)');
  check('못 찾으면 강사 전원으로 폴백하지 않는다',
        /resolved_by/.test(dir) && !/isStaffAtt\(att\)/.test(dir),
        '학생에게 보내려던 글이 강사에게 가면 그것이 오배달이다');
  check('학생에게는 보낸 사람 이름을 넘기지 않는다', /from:\s*toStaff\s*\?/.test(dir));
  check('받는 쪽 이중 방어 표시를 함께 보낸다 (direct·to)',
        /direct:\s*true/.test(dir) && /\bto:\s*ta\.userId/.test(dir));
}
{
  const seg = blockAt(ADMIN_CODE, "path === '/api/admin/whisper/send'");
  check('API 가 target_uid·target_name 을 받는다',
        /b\.target_uid/.test(seg) && /b\.target_name/.test(seg), !seg ? '핸들러를 못 찾음' : '');
  check('대상을 안 보내면 예전 그대로 강사 전원 (옛 화면 호환)',
        /const directed = !!\(targetUid \|\| targetName\)/.test(seg) && /directed \? \{ to: targetUid/.test(seg));
  check('번호와 이름을 둘 다 넘긴다 (번호는 재접속하면 죽는다)',
        /to: targetUid, to_name: targetName/.test(seg));
  check('전달 못 했을 때 왜인지까지 말해 준다', /ambiguous_name/.test(seg),
        '«보낸 척» 하면 관리자가 학생이 받은 줄 알고 기다린다');
}
{
  const GV = strip(R('cloudflare-deploy/public/admin/ghost-view.html'));
  check('화면에 «받는 사람» 고르는 칸이 있다', /id="ghd-whisper-to"/.test(GV));
  check('참가자 목록으로 그 칸을 채운다', /ghdFillWhisperTargets/.test(GV));
  check('사람 이름을 화면에 하드코딩하지 않았다',
        !/<option value="[^"]+">[^<]*(Hannah|delaware)/i.test(GV),
        '기본값은 «강사 전원» 하나뿐이어야 한다 — 나머지는 실제 접속자로 그린다');
  check('학생 카드에도 귓속말 버튼이 있다',
        /ghdFocusWhisper\('\$\{esc\(m\.user_id\)\}'\)/.test(GV) &&
        !/m\.role === 'teacher' \? `<button onclick="ghdFocusWhisper/.test(GV),
        '강사 카드에만 있으면 학생에게 보낼 입구가 없다');
  check('보낼 때 대상 번호·이름·역할을 함께 싣는다',
        /body\.target_uid/.test(GV) && /body\.target_name/.test(GV) && /body\.target_role/.test(GV));
  check('«성공이라고 말했는가» 로 판정한다 (d.ok === true)',
        /d\.ok !== true/.test(GV),
        '종단 404 본문에는 ok 칸이 없어 d.ok === false 검사는 그냥 통과한다 (CLAUDE.md 2장)');
  check('delivered 를 보고 «갔다/안 갔다» 를 가른다',
        /Number\(d\.delivered \|\| 0\) > 0/.test(GV),
        '기록은 남으므로 ok:true 만 보면 아무도 안 받았는데 «전송 완료» 가 된다');
  check('서버가 준 이유(note)를 화면에 그대로 남긴다', /d\.note/.test(GV) && /ghdWhisperNote/.test(GV));
  check('목록이 갱신돼도 고른 대상을 잃지 않는다', /const keep = sel\.value/.test(GV),
        '5초마다 도는 새로고침에 대상이 «강사 전원» 으로 돌아가면 오배달이 난다');
}

// ── 결과 ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) {
  console.log('  실패 항목:');
  for (const f of FAILS) console.log('   · ' + f);
}
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
