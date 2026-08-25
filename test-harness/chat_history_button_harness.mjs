// chat_history_button_harness.mjs — 「이전 대화 보기」가 «누를 때만» 도는 상태를 지킨다 (2026-08-25)
//
// 배경
//   2026-07-24 사장님 지시로 채팅 이력 «자동» 로드를 껐다(「상담 내용이 다음 수업에 그대로 남는 문제」).
//   2026-08-25 에 그 지시를 지킨 채 불편만 푸는 방법으로 «버튼» 을 넣었다 —
//   기본은 빈 채팅, 필요한 사람이 누를 때만 불러온다.
//
//   이 하니스가 막는 것은 «다음 사람이 좋은 뜻으로 자동 로드를 되살리는 것» 이다.
//   그 한 줄이면 7월에 껐던 그 동작으로 조용히 돌아간다.
//
// ⚠️ 이 검사로 못 잡는 것
//   «어떤 순서로 그려지나»·«배지가 뜨나» 는 문자열로 볼 수 없다.
//   그건 사람이 부르는 브라우저 검사다:  node test-harness/manual/chat-history-browser.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SRC = join(__dir, '../cloudflare-deploy/src');

const read = p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/* 부정 검사(«이 단어가 없어야 한다»)는 반드시 주석을 벗겨 낸 사본으로 판정한다.
   「왜 그렇게 하면 안 되는지」 적은 설명 주석이 자기 검사에 걸리기 때문이다(CLAUDE.md 함정). */
const strip = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/<!--[\s\S]*?-->/g, '');

const html = read(join(PUB, 'index.html'));
const main = read(join(PUB, 'js/idx-main.js'));
const hist = read(join(PUB, 'js/idx-vc-chat-history.js'));
const api = read(join(SRC, 'api-notify.ts'));

const histCode = strip(hist);
const htmlCode = strip(html);

let fail = 0;
const check = (name, pass, why = '') => {
  console.log(`${pass ? '✅' : '🚨'} ${name}${pass || !why ? '' : `\n     ${why}`}`);
  if (!pass) fail++;
};

console.log('💬 이전 대화 보기 — 회귀 감시\n');

// ① 파일이 있고, 화면에 defer 로 걸려 있다
check('① idx-vc-chat-history.js 가 있다', hist.length > 0);
check('① index.html 이 그 파일을 defer 로 부른다',
  /<script[^>]*src=["']\/js\/idx-vc-chat-history\.js\?v=\d+["'][^>]*\bdefer\b[^>]*>|<script[^>]*\bdefer\b[^>]*src=["']\/js\/idx-vc-chat-history\.js\?v=\d+["'][^>]*>/.test(htmlCode),
  'blocking 으로 바꾸면 첫 화면 예산(first_paint_budget_harness)이 넘칩니다. index.html 상한에 이미 거의 닿아 있습니다.');

// ② 버튼이 채팅창 안에 있다
check('② 채팅창에 「이전 대화 보기」 버튼이 있다',
  /id=["']vc-chat-history-btn["']/.test(htmlCode) && /data-ko=["']이전 대화 보기["']/.test(htmlCode));
check('② 버튼이 채팅 패널 안(채팅 지우기 옆)에 있다',
  htmlCode.indexOf('vc-chat-history-btn') > htmlCode.indexOf('id="vc-chat-panel"') &&
  htmlCode.indexOf('vc-chat-history-btn') < htmlCode.indexOf('vcResetChat()'));

// ③ 🔴 자동 로드는 여전히 꺼져 있어야 한다 (7월 지시)
check('③ 입장 시 자동 로드는 스위치가 꺼진 채다',
  /window\.__vcChatAutoLoadHistory\s*===\s*true/.test(main),
  'idx-main.js 의 vcJoinRoom 에서 vcLoadChatHistory() 를 조건 없이 부르면 7월에 껐던 동작으로 돌아갑니다.');
check('③ 이 파일이 입장에 스스로 끼어들지 않는다',
  !/vcJoinRoom|__vcChatAutoLoadHistory\s*=\s*true/.test(histCode),
  '「입장하면 자동 호출」로 바꾸면 버튼을 만든 이유가 사라집니다.');

// ④ 불러온 메시지가 알림을 울리지 않는다
check('④ 불러온 메시지에 _loadedAt 을 붙인다',
  /_loadedAt\s*:/.test(histCode),
  '이 표시가 없으면 재입장마다 안읽음 배지가 200개로 뜨고 채팅창이 저절로 열립니다(idx-main.js vcReceiveChat).');

// ⑤ 방 종류에 따라 기간이 갈린다
check('⑤ 날짜 박힌 수업방 48시간 / 고정 기본방 1시간',
  /48\s*\*\s*HOUR/.test(histCode) && /\bWINDOW_SHARED\s*=\s*1\s*\*\s*HOUR/.test(histCode) &&
  /\^class-\.\+-\\d\{8\}\$/.test(histCode),
  '기본방(mangoi-class)은 여러 수업이 한 방을 돌려 씁니다. 2026-08-25 사장님 지시로 1시간입니다 — 늘리면 앞 타임 상담이 다음 학생에게 보입니다.');

// ⑥ 「채팅 지우기」와 짝이 맞는다
check('⑥ 지운 시각을 방마다 기억해 그 뒤만 불러온다',
  /vcResetChat/.test(histCode) && /mangoi_chat_cleared_/.test(histCode) &&
  /Math\.max\(/.test(histCode),
  '이게 없으면 «지웠는데 다시 들어오니 살아 있다» 가 됩니다.');

// ⑦ 같은 기능이 두 벌이 되지 않는다
check('⑦ 옛 vcLoadChatHistory 를 이쪽으로 모은다',
  /window\.vcLoadChatHistory\s*=\s*loadHistory/.test(histCode),
  'idx-main.js 의 옛 경로는 「채팅 지우기」 시각을 몰라 지운 대화를 되살립니다.');

// ⑧ 방 번호를 window 로 읽지 않는다 (CLAUDE.md 함정)
check('⑧ 방 번호를 window.vcRoomId 로 읽지 않는다',
  !/window\.vcRoomId/.test(histCode),
  'vcRoomId 는 let 이라 window 에 없습니다 — 항상 undefined 가 되어 조용히 빈 값으로 흐릅니다.');

// ⑨ 서버가 기간 경계를 지킨다
check('⑨ GET /api/chat/messages 가 since 를 받아 거른다',
  /searchParams\.get\('since'\)/.test(api) && /sent_at\s*>=\s*\?/.test(api) &&
  /\.bind\(roomId,\s*since,\s*limit\)/.test(api),
  '화면에서만 자르면 실제로는 전부 내려받습니다.');
check('⑨ since 를 안 보내면 예전대로 동작한다 (관리자 조회 보호)',
  /sinceRaw\s*>\s*0\s*\?\s*sinceRaw\s*:\s*0/.test(api));

console.log(`\n${fail ? `🚨 FAIL ${fail}` : '✅ 전부 통과'} — 총 13건`);
process.exit(fail ? 1 : 0);
