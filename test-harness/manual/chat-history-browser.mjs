/**
 * 💬 「이전 대화 보기」 — 진짜 브라우저로 확인 (2026-08-25)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   문자열 하니스(chat_history_button_harness)는 «있는가» 만 본다. 이 기능에서 실제로
 *   틀릴 수 있는 것은 전부 «어떻게 놓이는가» 다 —
 *     · 불러온 대화가 «지금 대화» 앞에 오는가 (vcReceiveChat 은 항상 맨 뒤에 붙인다)
 *     · 불러온 200개가 안읽음 배지를 올리거나 채팅창을 저절로 열지 않는가(_loadedAt)
 *     · 「채팅 지우기」 뒤에 지운 대화가 되살아나지 않는가
 *     · 방 종류에 따라 기간이 갈리는가 (수업방 48시간 / 고정 기본방 1시간)
 *   전부 코드를 읽어서는 확인할 수 없어서 실제로 눌러 보고 잰다.
 *
 * ⚠️ file:// 로 열면 안 된다 — index.html 의 <script src="/js/…"> 가 전부 404 가 되어
 *    버튼도 vcReceiveChat 도 없는 상태가 된다(CLAUDE.md 2장 함정). HTTP 로 띄운다.
 * ⚠️ 서버(D1)에는 아무것도 묻지 않는다 — fetch 를 가짜로 물려 응답을 만든다.
 *    개발·운영이 같은 DB 라 검사가 실제 채팅을 건드리면 안 된다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 채팅 이력·「채팅 지우기」·vcReceiveChat 을 건드리면
 *    사람이 불러야 한다:
 *   PW_DIR=/tmp/pw node test-harness/manual/chat-history-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8934;
const ROOM_DATED = 'class-849-20260825';   // 이름에 날짜가 있는 예약 수업방
const ROOM_SHARED = 'mangoi-class';        // 여러 수업이 돌려 쓰는 고정 기본방

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label + (detail ? ' — ' + detail : '')); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on('dialog', async d => { try { await d.accept(); } catch (_) {} });
  /* 첫 방문 오버레이가 클릭을 막고, 학생 토큰이 없으면 조회가 401 로 끝난다 */
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mango_token', 'TESTTOKEN');
    } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#vc-chat-history-btn', { state: 'attached', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  // ── ① 기본값: 버튼만 있고 아무것도 안 불러온다 ──
  console.log('\n① 기본값 — 자동으로는 아무것도 안 올라온다');
  const init = await page.evaluate(() => {
    const b = document.getElementById('vc-chat-history-btn');
    const box = document.getElementById('vc-chat-messages');
    return { label: b.textContent.trim(), wired: b.dataset.wired, len: box.innerHTML.trim().length };
  });
  ok('버튼이 채팅창에 있다', init.label.length > 0, init.label);
  ok('클릭 배선이 붙었다 (defer 파일이 실제로 실행됨)', init.wired === '1');
  ok('입장 전 채팅창은 비어 있다', init.len === 0, `${init.len}바이트`);

  // ── ② 눌렀을 때 ──
  console.log('\n② 눌렀을 때 — 순서·배지·라벨');
  const clicked = await page.evaluate(async (room) => {
    vcRoomId = room;                 // let 이라 window 에 없다 — 스코프 체인으로 대입
    vcUserId = 'stu1';
    let asked = null;
    const real = window.fetch;
    window.fetch = async (u, o) => {
      if (String(u).indexOf('/api/chat/messages') === 0) {
        asked = String(u);
        const now = Date.now();
        return new Response(JSON.stringify({ ok: true, count: 2, rows: [
          { id: 1, sender_uid: 'stu1', sender_name: '지웅',   sender_role: 'student', message: '선생님 조금 늦어요', sent_at: now - 3600000 },
          { id: 2, sender_uid: 't9',   sender_name: 'HANNAH', sender_role: 'teacher', message: '네 기다릴게요',     sent_at: now - 3500000 },
        ] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return real(u, o);
    };
    // «지금 세션» 대화가 이미 한 줄 있다고 가정
    window.vcReceiveChat({ userId: 't9', username: 'HANNAH', message: '지금 시작할게요', type: 'user' });
    const badgeBefore = document.getElementById('vc-chat-badge').textContent;

    document.getElementById('vc-chat-history-btn').click();
    await new Promise(r => setTimeout(r, 900));

    const box = document.getElementById('vc-chat-messages');
    const txt = box.innerText;
    const b = document.getElementById('vc-chat-history-btn');
    return {
      asked,
      pos: [txt.indexOf('선생님 조금 늦어요'), txt.indexOf('네 기다릴게요'), txt.indexOf('지금 시작할게요')],
      head: txt.indexOf('이전 대화 2개') >= 0,
      tail: txt.indexOf('여기부터 지금 대화') >= 0,
      label: b.textContent.trim(),
      dataKo: b.getAttribute('data-ko'),
      badgeBefore, badgeAfter: document.getElementById('vc-chat-badge').textContent,
      panelOpen: document.getElementById('vc-chat-panel').classList.contains('open'),
      scrollTop: box.scrollTop,
      kept: txt.indexOf('지금 시작할게요') >= 0,
    };
  }, ROOM_DATED);

  ok('서버에 since·limit 을 붙여 묻는다',
     /since=\d{10,}/.test(clicked.asked || '') && /limit=200/.test(clicked.asked || ''),
     (clicked.asked || '').replace(/token=[^&]*/, 'token=…'));
  ok('시간순으로 놓인다 (이전 → 이전 → 지금)',
     clicked.pos[0] >= 0 && clicked.pos[0] < clicked.pos[1] && clicked.pos[1] < clicked.pos[2],
     `위치 ${clicked.pos.join(' < ')}`);
  ok('«이전 대화 N개» 구분선이 있다', clicked.head);
  ok('«여기부터 지금 대화» 구분선이 있다', clicked.tail);
  ok('지금 세션 대화가 지워지지 않는다', clicked.kept);
  ok('불러온 대화가 안읽음 배지를 올리지 않는다 (_loadedAt)',
     clicked.badgeBefore === clicked.badgeAfter, `${clicked.badgeBefore} → ${clicked.badgeAfter}`);
  ok('채팅창이 저절로 열리지 않는다', !clicked.panelOpen);
  ok('라벨을 바꿀 때 data-ko 도 함께 바꾼다 (🌐 로 안 되돌아감)',
     clicked.label === clicked.dataKo, `${clicked.label} / data-ko=${clicked.dataKo}`);
  ok('읽을 수 있게 맨 위로 올려 준다', clicked.scrollTop === 0);

  // ── ③ 「채팅 지우기」와 짝 ──
  console.log('\n③ 「채팅 지우기」 뒤 — 지운 것이 되살아나지 않는다');
  const cleared = await page.evaluate(async (room) => {
    const rc = window.confirm; window.confirm = () => true;
    window.vcResetChat();
    window.confirm = rc;
    const at = parseInt(localStorage.getItem('mangoi_chat_cleared_' + room) || '0', 10);
    let asked = null;
    const real = window.fetch;
    window.fetch = async (u, o) => {
      if (String(u).indexOf('/api/chat/messages') === 0) {
        asked = String(u);
        return new Response(JSON.stringify({ ok: true, count: 0, rows: [] }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return real(u, o);
    };
    const b = document.getElementById('vc-chat-history-btn');
    b.disabled = false; b.click();
    await new Promise(r => setTimeout(r, 700));
    return {
      at,
      since: parseInt((asked || '').match(/since=(\d+)/)?.[1] || '0', 10),
      label: b.textContent.trim(),
      disabled: b.disabled,
      gone: document.getElementById('vc-chat-messages').innerText.indexOf('선생님 조금 늦어요') < 0,
    };
  }, ROOM_DATED);
  ok('지운 시각을 방마다 기억한다', cleared.at > 0);
  ok('지운 뒤에는 그 시각 이후만 묻는다', cleared.since >= cleared.at, `since=${cleared.since} ≥ ${cleared.at}`);
  ok('지운 대화가 되살아나지 않는다', cleared.gone);
  ok('불러올 것이 없으면 그렇게 알려 준다', /없어요|No earlier/.test(cleared.label), cleared.label);
  ok('«없어요» 뒤에도 다시 누를 수 있다', cleared.disabled === false,
     '수업 도중 뒤늦게 이력이 생겨도 부를 수 있어야 합니다');

  // ── ④ 방 종류별 기간 ──
  console.log('\n④ 방 종류별 기간 — 한 숫자로 통일하지 않는다');
  const hoursFor = async (room) => page.evaluate(async (r) => {
    vcRoomId = r;
    try { localStorage.removeItem('mangoi_chat_cleared_' + r); } catch (e) {}
    let asked = null;
    const real = window.fetch;
    window.fetch = async (u, o) => {
      if (String(u).indexOf('/api/chat/messages') === 0) {
        asked = String(u);
        return new Response(JSON.stringify({ ok: true, count: 0, rows: [] }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return real(u, o);
    };
    const b = document.getElementById('vc-chat-history-btn');
    b.disabled = false; b.click();
    await new Promise(x => setTimeout(x, 700));
    const since = parseInt((asked || '').match(/since=(\d+)/)?.[1] || '0', 10);
    return Math.round((Date.now() - since) / 3600000);
  }, room);

  const hShared = await hoursFor(ROOM_SHARED);
  ok('고정 기본방(mangoi-class)은 1시간만', hShared === 1, `${hShared}시간`);
  const hDated = await hoursFor(ROOM_DATED);
  ok('날짜 박힌 수업방은 48시간까지', hDated === 48, `${hDated}시간`);

} finally {
  await browser.close().catch(() => {});
  srv.kill();
  console.log(`\n${fail ? `❌ FAIL ${fail}` : '✅ 전부 통과'} · PASS ${pass} / 총 ${pass + fail}건`);
  process.exit(fail ? 1 : 0);
}
