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

const DO_SRC = R('cloudflare-deploy/src/video-call-room.ts');
const ADMIN_SRC = R('cloudflare-deploy/src/api-admin.ts');
/* 🪤 (2026-08-23) idx-main.js 를 «홈» 과 «수업»(idx-main-vc.js) 으로 갈랐다.
   여기서 보는 것은 «수업 화면의 행동» 이라 절반이 다른 파일로 옮겨갔다 —
   한 파일만 읽으면 «기능이 사라졌다» 고 오판한다. 둘을 이어서 본다. */
const CLIENT_SRC = R('cloudflare-deploy/public/js/idx-main.js') + '\n' + R('cloudflare-deploy/public/js/idx-main-vc.js');
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
  // '/whisper' 블록만 잘라서 본다 — 파일 전체에 isStaffAtt 가 있다고 통과시키면 의미가 없다.
  const i = DO_CODE.indexOf("url.pathname === '/whisper'");
  const seg = i >= 0 ? DO_CODE.slice(i, i + 2200) : '';
  check("'/whisper' 가 isStaffAtt 로 staff 소켓만 고른다", /isStaffAtt\(/.test(seg),
        i < 0 ? '/whisper 블록을 못 찾음' : '블록 안에 isStaffAtt 가 없다 — 학생에게 샌다');
  check("'/whisper' 가 broadcastAll 로 방 전체에 뿌리지 않는다", !/broadcastAll\s*\(/.test(seg),
        'broadcastAll 은 학생 소켓까지 포함한다');
}

// ── ③ 참관자 채팅을 버리지 않고 staff 로 돌린다 ─────────────────────────────
console.log('\n[ ③ 참관자 메시지를 조용히 버리지 않는다 ]');
check('참관자 전용 처리 함수가 있다', /handleObserverWhisper/.test(DO_CODE));
check("chat-message 에서 role==='observer' 를 갈라 낸다",
      /case\s*'chat-message'[\s\S]{0,400}?observer[\s\S]{0,200}?handleObserverWhisper/.test(DO_CODE),
      '참관자 분기가 없으면 usernameOf() 에서 조용히 버려진다');
{
  const i = DO_CODE.indexOf('private handleObserverWhisper');
  const seg = i >= 0 ? DO_CODE.slice(i, i + 1800) : '';
  check('handleObserverWhisper 도 isStaffAtt 로 자른다', /isStaffAtt\(/.test(seg),
        i < 0 ? '함수를 못 찾음' : '학생에게 샌다');
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

// ── 결과 ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) {
  console.log('  실패 항목:');
  for (const f of FAILS) console.log('   · ' + f);
}
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
