/**
 * 👁📢 참관 중 귓속말 — 진짜 브라우저로 확인 (2026-08-26)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   문자열 하니스(whisper_delivery_harness)는 «그 줄이 있는가» 만 본다. 이 기능에서 실제로
 *   틀렸던 것은 전부 «화면에 무엇이 보이나» 였다 —
 *     · 사장님 「여기 어디에 귓속말이 있어?」 — 기능은 있었는데 이름표가 «채팅» 이었다
 *     · 사장님 「채팅창에 아무것도 문자 써도 안 나타나는데?」 — 참관자 글은 방에 안 뿌려져
 *       에코가 없었다. 토스트만 몇 초 떴다 사라졌다
 *     · 학생을 골라 보내도 강사에게 갔다 (서버가 toUserId 를 안 읽었다)
 *   전부 코드를 읽어서는 확인할 수 없어서 실제로 눌러 보고 잰다.
 *
 * ⚠️ file:// 로 열면 안 된다 — index.html 의 <script src="/js/…"> 가 전부 404 가 되어
 *    vc-observe-guard.js 도 idx-whisper.js 도 없는 상태가 된다(CLAUDE.md 2장 함정).
 * ⚠️ WebSocket 은 물리지 않는다 — vcConn 을 «받아 적는» 가짜로 두고 무엇이 나가는지 잰다.
 *    실제 방에 붙으면 라이브 수업을 건드린다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 참관 귓속말·채팅 대상 칩·독 라벨을 건드리면
 *    사람이 불러야 한다:
 *   PW_DIR=/tmp/pw node test-harness/manual/observer-whisper-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8937;

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
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.vcSendChat === 'function', null, { timeout: 30000 });

  /* ── 참관 상태를 만든다 ────────────────────────────────────────────────
     실제 입장(vcJoinAsObserver)은 WebSocket·미디어를 잡으므로 여기서는 그 «결과 상태» 를
     만든다: 참관 표시 + 수업 중 + 얼굴 타일 두 장(강사·학생). 대상 칩은 그 타일에서 읽는다. */
  await page.evaluate(() => {
    window._vcObserverMode = true;
    document.body.classList.add('vc-in-call');
    const grid = document.getElementById('vc-video-grid');
    for (const [uid, name] of [['t9', '교사 Teacher - Hannah'], ['s3', 'delaware']]) {
      const box = document.createElement('div');
      box.className = 'video-box';
      box.id = 'vc-video-' + uid;
      const lbl = document.createElement('div');
      lbl.className = 'video-label';
      lbl.textContent = name;
      box.appendChild(lbl);
      grid.appendChild(box);
    }
    // 가짜 연결 — 무엇이 나가는지 받아 적기만 한다
    window.__sent = [];
    window.vcConn = { send: (m) => window.__sent.push(m) };
    window.__fetched = [];
    const real = window.fetch;
    window.fetch = (u, o) => { window.__fetched.push(String(u)); return real(u, o); };
  });
  await new Promise(r => setTimeout(r, 9000));   // 가드의 «끝이 있는» 확인 타이머(최대 8초)

  // ── ① 이름표가 사실과 맞는가 ──
  console.log('\n① 참관자에게 «채팅» 이 아니라 «귓속말» 이라고 말해 주는가');
  await page.evaluate(() => window.vcOpenChat());
  await new Promise(r => setTimeout(r, 500));
  const labels = await page.evaluate(() => {
    const b = document.getElementById('vc-dock-chat');
    const lbl = b && b.querySelector('.lbl');
    const chips = [...document.querySelectorAll('#vc-chat-target-bar .chat-target-chip')]
      .map(c => ({ text: c.textContent.trim(), dm: c.classList.contains('dm') }));
    return {
      dockText: lbl ? lbl.textContent.trim() : '(독 없음)',
      dataKo: lbl ? lbl.getAttribute('data-ko') : '',
      dataEn: lbl ? lbl.getAttribute('data-en') : '',
      chips,
      ph: (document.getElementById('vc-chat-input') || {}).placeholder || '',
    };
  });
  ok('하단 독 버튼이 «귓속말» 이다', labels.dockText === '귓속말', labels.dockText);
  ok('data-ko/data-en 도 함께 바뀌었다 (🌐 눌러도 안 돌아간다)',
     labels.dataKo === '귓속말' && labels.dataEn === 'Whisper', labels.dataKo + '/' + labels.dataEn);
  const first = labels.chips[0] || { text: '' };
  ok('첫 칩이 «전체» 가 아니라 «강사에게만» 이다', /강사에게만/.test(first.text), first.text);
  ok('참가자 이름 칩이 함께 보인다 (누구에게 보낼지 고를 수 있다)',
     labels.chips.some(c => c.dm && /delaware/.test(c.text)),
     labels.chips.map(c => c.text).join(' | '));
  ok('입력칸 안내문이 «지금 누구에게 가는지» 를 말한다', /귓속말/.test(labels.ph), labels.ph);

  // ── ② 학생을 골라 보내면 그 학생에게 간다 ──
  console.log('\n② 학생을 골라 보내면 toUserId 가 실려 나간다');
  const sent = await page.evaluate(() => {
    window.__sent.length = 0; window.__fetched.length = 0;
    const chip = [...document.querySelectorAll('#vc-chat-target-bar .chat-target-chip')]
      .find(c => /delaware/.test(c.textContent));
    chip.click();                                   // 대상 고르기
    document.getElementById('vc-chat-input').value = '학생 잘 듣고 있나요?';
    document.querySelector('#vc-chat-panel button[onclick="vcSendChat()"]').click();
    return {
      sent: window.__sent,
      ph: document.getElementById('vc-chat-input').placeholder,
      left: document.getElementById('vc-chat-input').value,
      fetched: window.__fetched.filter(u => u.indexOf('/api/chat/messages') >= 0),
    };
  });
  const m = sent.sent[0] || {};
  ok('소켓으로 나갔다', sent.sent.length === 1, JSON.stringify(sent.sent));
  ok('받는 사람이 그 학생이다 (toUserId=s3)', m.data && m.data.toUserId === 's3', JSON.stringify(m.data));
  ok('보낸 뒤 입력칸이 비워진다', sent.left === '', JSON.stringify(sent.left));
  ok('D1 채팅 이력에 저장하지 않는다 (학생이 「이전 대화 보기」로 못 읽는다)',
     sent.fetched.length === 0, sent.fetched.join(', '));
  ok('대상을 고르면 안내문이 그 이름으로 바뀐다', /delaware/.test(sent.ph), sent.ph);

  // ── ③ 대상을 안 고르면 강사에게 (그때도 저장하지 않는다) ──
  console.log('\n③ 대상을 안 고르면 강사에게 — 그때도 이력에 안 남는다');
  const all = await page.evaluate(() => {
    window.__sent.length = 0; window.__fetched.length = 0;
    document.querySelector('#vc-chat-target-bar .chat-target-chip').click();   // «강사에게만» 으로 되돌리기
    document.getElementById('vc-chat-input').value = '왜 안들어와요?';
    document.querySelector('#vc-chat-panel button[onclick="vcSendChat()"]').click();
    return { sent: window.__sent, fetched: window.__fetched.filter(u => u.indexOf('/api/chat/messages') >= 0) };
  });
  ok('소켓으로 나갔다', all.sent.length === 1, JSON.stringify(all.sent));
  ok('대상을 싣지 않는다 (서버가 강사 전원에게 돌린다)',
     all.sent[0] && all.sent[0].data && !all.sent[0].data.toUserId, JSON.stringify(all.sent[0]));
  ok('D1 채팅 이력에 저장하지 않는다', all.fetched.length === 0, all.fetched.join(', '));

  // ── ④ 「아무것도 안 나타난다」 — 보낸 기록이 채팅창에 남는가 ──
  console.log('\n④ 보낸 사람 화면에 «보낸 기록» 이 남는가');
  const echo = await page.evaluate(() => {
    const box = document.getElementById('vc-chat-messages');
    box.innerHTML = '';
    window.vcWhisperOn('admin-whisper-ack', { delivered: 1, to: 's3', toName: 'delaware', message: '학생 잘 듣고 있나요?' });
    const okLine = box.textContent;
    box.innerHTML = '';
    window.vcWhisperOn('admin-whisper-ack', { delivered: 0, message: '왜 안들어와요?' });
    return { okLine, failLine: box.textContent };
  });
  ok('전달되면 «누구에게 갔는지 + 무엇을 보냈는지» 가 남는다',
     /delaware/.test(echo.okLine) && /학생 잘 듣고 있나요\?/.test(echo.okLine), echo.okLine.trim());
  ok('전달 못 하면 «안 갔다» 고 정직하게 남는다',
     /강사가 없어/.test(echo.failLine), echo.failLine.trim());

  // ── ⑤ 학생 화면 — 나에게 온 것만 뜬다 ──
  console.log('\n⑤ 학생 화면: «나를 콕 집은 것» 만 뜬다');
  const stu = await page.evaluate(() => {
    window._vcObserverMode = false;
    window.vcMyRole = 'student';
    vcUserId = 's3';                                  // let 이라 window 에 없다 — 스코프 체인으로 대입
    const seen = () => { const b = document.getElementById('vc-whisper-box'); return b ? b.innerText : ''; };

    window.vcWhisperOn('admin-whisper', { message: '천천히 가세요', from: '관찰자', direct: false });
    const broadcastToStaff = seen();
    window.vcWhisperOn('admin-whisper', { message: '남에게 간 지시', direct: true, to: 't9', toStaff: true, from: '관찰자' });
    const toSomeoneElse = seen();
    window.vcWhisperOn('admin-whisper', { message: '소리가 안 들려요? 마이크를 확인해 주세요', direct: true, to: 's3', toStaff: false, from: '' });
    const toMe = seen();
    /* «맨 위에 무엇이 있나» 를 잰다. 상자 «자신» 이 아니라 그 «안의 글자 칸» 이 잡히는 것이
       정상이므로, 잡힌 것이 상자 안에 있는지로 판정한다(CLAUDE.md 2장 elementsFromPoint). */
    const top = (() => {
      const b = document.getElementById('vc-whisper-box');
      if (!b) return '(상자 없음)';
      const r = b.getBoundingClientRect();
      const el = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      if (!el) return '(아무것도 없음)';
      return b.contains(el) ? 'ok' : (el.id || el.className || el.tagName);
    })();
    return { broadcastToStaff, toSomeoneElse, toMe, top };
  });
  ok('강사용(대상 없음) 귓속말은 학생 화면에 안 뜬다', stu.broadcastToStaff === '', stu.broadcastToStaff);
  ok('남에게 간 것은 안 뜬다 (to ≠ 내 id)', stu.toSomeoneElse === '', stu.toSomeoneElse);
  ok('나에게 온 것은 뜬다', /마이크를 확인/.test(stu.toMe), stu.toMe.replace(/\n/g, ' / '));
  ok('보낸 사람 이름 대신 «사무실» 로 보인다 (참관 사실을 학생에게 안 알린다)',
     /사무실에서 보낸 메시지/.test(stu.toMe) && !/관찰자/.test(stu.toMe), stu.toMe.replace(/\n/g, ' / '));
  ok('«학생에게는 보이지 않습니다» 라고 말하지 않는다 (받는 사람이 학생이다)',
     !/학생에게는 보이지 않습니다/.test(stu.toMe) && /나에게만/.test(stu.toMe),
     stu.toMe.replace(/\n/g, ' / '));
  ok('그 상자가 실제로 «맨 위» 에 있다 (보이는데 가려지지 않는다)',
     stu.top === 'ok', stu.top);

  // ── ⑥ 평소 화면(참관 아님)은 그대로인가 ──
  console.log('\n⑥ 참관이 아니면 아무것도 안 바뀐다');
  const normal = await page.evaluate(() => {
    window._vcObserverMode = false;
    window.__sent.length = 0; window.__fetched.length = 0;
    if (typeof window.vcRefreshChatTargets === 'function') window.vcRefreshChatTargets();
    const chip = document.querySelector('#vc-chat-target-bar .chat-target-chip');
    return { firstChip: chip ? chip.textContent.trim() : '' };
  });
  ok('일반 화면의 첫 칩은 «👥 전체» 그대로다', /전체/.test(normal.firstChip), normal.firstChip);

  console.log(`\n───────────────────────────────\n  통과 ${pass} · 실패 ${fail}\n───────────────────────────────`);
} finally {
  await browser.close();
  try { srv.kill(); } catch (_) {}
}
process.exit(fail ? 1 : 0);
