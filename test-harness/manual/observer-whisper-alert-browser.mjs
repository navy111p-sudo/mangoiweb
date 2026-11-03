/**
 * 📢↩ 참관자 귓속말 «놓칠 수 없는 알림» + 강사 답장 — 진짜 브라우저로 확인 (2026-11-04)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   자동 하니스(observer_whisper_reply_harness)는 가짜 DOM 으로 «무엇이 나가는가» 를 본다.
 *   이번 제보의 뿌리는 «화면에 무엇이 보이나» 였다 — 메시지는 도착했는데 강사가 못 봤다
 *   (구석·남색·8초). 그래서 진짜 index.html 위에서 카드가 «맨 위에, 상단바 아래에, 화면 안에»
 *   있는지와, 실제 마우스 클릭으로 답장이 나가는지를 잰다. 관리자·수업 화면의 전역 CSS 가
 *   버튼을 덮어쓰는 사고가 잦아(CLAUDE.md 2장) 그것도 함께 잰다.
 *
 * ⚠️ file:// 로 열면 안 된다 — /js/… 절대경로가 전부 404 가 된다(CLAUDE.md 2장).
 * ⚠️ WebSocket 은 물리지 않는다 — vcConn 을 «받아 적는» 가짜로 두고 무엇이 나가는지 잰다.
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. 귓속말 카드·답장을 건드리면 사람이 불러야 한다:
 *   node test-harness/manual/observer-whisper-alert-browser.mjs
 *   (스크린샷이 필요하면 SHOT_DIR=<폴더> 를 붙인다)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8941;
const SHOT = process.env.SHOT_DIR || '';

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

/* 수업 중 상태를 만든다 — 실제 입장은 WebSocket·미디어를 잡으므로 «결과 상태» 만 만든다. */
async function openClass(page, { role, me, observer, lang }) {
  page.on('dialog', async d => { try { await d.accept(); } catch (_) {} });
  await page.addInitScript((lng) => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) {}
    try { if (lng) localStorage.setItem('mangoi_lang', lng); } catch (e) {}
  }, lang || 'ko');
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.vcWhisperOn === 'function' && typeof window.vcAddChatSystem === 'function',
                             null, { timeout: 30000 });
  await page.evaluate(({ role, me, observer }) => {
    /* 실제 입장과 같은 순서 — 수업 화면을 띄운 뒤 vc-in-call (idx-main.js vcJoinRoom) */
    try { if (typeof window.showView === 'function') window.showView('view-videocall-call'); } catch (e) {}
    document.body.classList.add('vc-in-call');
    window.vcMyRole = role || '';
    window._vcObserverMode = !!observer;
    vcUserId = me;                       // let 이라 window 에 없다 — 스코프 체인으로 대입
    window.__sent = [];
    window.vcConn = { send: (m) => { window.__sent.push(m); return true; } };
  }, { role, me, observer });
}

/* 카드가 «맨 위» 에 있는가 — 카드 가운데 점을 눌렀을 때 잡히는 것이 카드 안인가 */
const measure = (sel) => {
  const c = document.querySelector(sel);
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
  const tb = document.querySelector('.toolbar');
  const tr = tb ? tb.getBoundingClientRect() : null;
  const cs = getComputedStyle(c);
  const okb = c.querySelector('[data-vcw-ok]');
  const ob = okb ? okb.getBoundingClientRect() : null;
  return {
    top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width,
    vw: document.documentElement.clientWidth || innerWidth, vh: innerHeight,   // 스크롤바 폭을 뺀 폭
    onTop: !!hit && c.contains(hit), hit: hit ? (hit.id || hit.className || hit.tagName) : '',
    toolbarBottom: tr && tr.bottom > 0 ? tr.bottom : 0,
    bg: cs.backgroundColor, color: cs.color, display: cs.display,
    okW: ob ? ob.width : 0, okH: ob ? ob.height : 0, okDisp: okb ? getComputedStyle(okb).display : '',
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    text: c.innerText,
  };
};

try {
  // ── ① 강사 PC — 카드가 잘 보이는 자리에 뜬다 ──
  console.log('\n① 강사 PC(1280×800): 카드가 맨 위·상단바 아래·화면 안에 뜬다');
  const p1 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openClass(p1, { role: 'teacher', me: 't1' });
  await p1.evaluate(() => window.vcWhisperOn('admin-whisper',
    { message: 'Hello teacher', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }));
  await p1.waitForTimeout(300);
  const m1 = await p1.evaluate(measure, '#vc-whisper-alert');
  ok('카드가 뜬다', !!m1, m1 ? m1.text.replace(/\n/g, ' / ').slice(0, 120) : '(없음)');
  if (m1) {
    ok('카드가 맨 위에 있다 (가려지지 않는다)', m1.onTop, m1.hit);
    ok('상단바를 덮지 않는다 (상단바 아래에서 시작)', m1.top >= m1.toolbarBottom, `카드 top ${m1.top} · 상단바 bottom ${m1.toolbarBottom}`);
    /* ⚠️ 수업 화면은 body 가 스크롤바 자리(15px)를 비워 둔 폭이라 left:50% 가 7.5px 왼쪽에 선다
       (2026-11-04 실측: body 1265 · 창 1280 · 변형 조상 없음). 같은 방식의 #vc-mode-badge 도 같다 — 10px 까지 허용. */
    ok('화면 가운데에 있다', Math.abs((m1.left + m1.right) / 2 - m1.vw / 2) < 10, `${m1.left}~${m1.right} / ${m1.vw}`);
    ok('밝은 바탕에 어두운 글자다 (남색 수업 화면과 구분된다)', /255, 248, 219/.test(m1.bg) && /27, 31, 39/.test(m1.color), m1.bg + ' / ' + m1.color);
    ok('「확인」 버튼이 전역 CSS 에 먹히지 않고 제 크기다', m1.okDisp !== 'none' && m1.okW >= 50 && m1.okW <= 160 && m1.okH >= 30 && m1.okH <= 60,
       `${m1.okW}×${m1.okH} ${m1.okDisp}`);
  }
  await p1.waitForTimeout(9000);
  ok('9초가 지나도 카드가 남아 있다 (예전에는 8초에 사라졌다)', await p1.evaluate(() => !!document.getElementById('vc-whisper-alert')));
  /* 강사가 수업에 들어오면 «화면 전체» 사용법 안내 창(#vc-guide-ov)이 자동으로 뜬다(idx-vc-guide.js).
     2026-11-04 실측: 카드와 z-index 가 같아 나중에 열린 안내 창이 카드를 덮고 클릭을 가로챘다. */
  const guideOpen = await p1.evaluate(() => !!document.getElementById('vc-guide-ov'));
  const mG = await p1.evaluate(measure, '#vc-whisper-alert');
  ok('사용법 안내 창이 열려 있어도 카드가 맨 위에 있다', !!mG && mG.onTop,
     (guideOpen ? '안내 창 열림' : '⚠ 안내 창이 안 열려 이 조건을 못 잼') + ' · 맨 위: ' + (mG ? mG.hit : '(카드 없음)'));
  ok('(전제) 이 검사 때 사용법 안내 창이 실제로 열려 있었다', guideOpen);
  if (SHOT) await p1.screenshot({ path: join(SHOT, 'whisper-teacher-pc.png') });

  // 실제 마우스로 빠른 답장 누르기
  await p1.click('#vc-whisper-alert [data-vcw-quick]');
  const s1 = await p1.evaluate(() => ({ sent: window.__sent, card: !!document.getElementById('vc-whisper-alert') }));
  const r1 = s1.sent.find(m => m.type === 'observer-whisper-reply' && m.data && m.data.message);
  ok('실제 클릭으로 빠른 답장이 그 참관자에게 나간다', !!r1 && r1.data.toUserId === 'o1', JSON.stringify(s1.sent));
  ok('보내면 카드가 닫힌다', !s1.card);

  // 직접 입력 + 보내기
  await p1.evaluate(() => window.vcWhisperOn('admin-whisper',
    { message: 'Can you speak a bit slower?', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }));
  await p1.fill('#vc-whisper-alert [data-vcw-input]', 'Sure, I will');
  await p1.click('#vc-whisper-alert [data-vcw-send]');
  const s2 = await p1.evaluate(() => window.__sent.filter(m => m.data && m.data.message === 'Sure, I will').length);
  ok('입력칸에 쓴 답장이 보내기 버튼으로 나간다', s2 === 1, String(s2));

  // 확인 버튼 → 읽음
  await p1.evaluate(() => { window.__sent.length = 0; window.vcWhisperOn('admin-whisper',
    { message: '수고하셨어요', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }); });
  await p1.click('#vc-whisper-alert [data-vcw-ok]');
  const s3 = await p1.evaluate(() => window.__sent);
  ok('「확인」을 누르면 읽음 표시가 참관자에게 간다', s3.length === 1 && s3[0].data.read === true && s3[0].data.toUserId === 'o1', JSON.stringify(s3));
  ok('채팅창에 받은 글이 남아 있다 (내 화면에만)', await p1.evaluate(() => /수고하셨어요/.test(document.getElementById('vc-chat-messages').textContent)));
  await p1.close();

  // ── ② 강사 폰(390px) — 화면 밖으로 안 넘친다 ──
  console.log('\n② 강사 폰(390×844): 카드가 화면 안에 들어온다');
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await openClass(p2, { role: 'teacher', me: 't1' });
  await p2.evaluate(() => window.vcWhisperOn('admin-whisper',
    { message: 'Hello teacher — please check the student mic, she cannot hear you well.', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }));
  await p2.waitForTimeout(300);
  const m2 = await p2.evaluate(measure, '#vc-whisper-alert');
  ok('카드가 뜬다', !!m2);
  if (m2) {
    ok('좌우가 화면 안에 있다', m2.left >= 0 && m2.right <= m2.vw, `${m2.left}~${m2.right} / ${m2.vw}`);
    ok('가로 스크롤을 만들지 않는다', !m2.hScroll);
    ok('맨 위에 있다', m2.onTop, m2.hit);
  }
  await p2.tap('#vc-whisper-alert [data-vcw-quick]');
  const s4 = await p2.evaluate(() => window.__sent.filter(m => m.type === 'observer-whisper-reply' && m.data.message));
  ok('폰에서 탭 한 번에 답장이 «한 번만» 나간다 (touchend+click 이중 실행 없음)', s4.length === 1, JSON.stringify(s4));
  if (SHOT) {
    await p2.evaluate(() => window.vcWhisperOn('admin-whisper',
      { message: 'Hello teacher — please check the student mic.', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }));
    await p2.screenshot({ path: join(SHOT, 'whisper-teacher-phone.png') });
  }
  await p2.close();

  // ── ③ 영어 화면 ──
  console.log('\n③ 영어 화면(EN)');
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openClass(p3, { role: 'teacher', me: 't1', lang: 'en' });
  await p3.evaluate(() => window.vcWhisperOn('admin-whisper',
    { message: 'Hello teacher', from: 'Maimai', fromId: 'o1', observer: true, at: Date.now() }));
  const t3 = await p3.evaluate(() => (document.getElementById('vc-whisper-alert') || {}).innerText || '');
  ok('영어로 말한다 (EN)', /Message from Maimai/.test(t3) && /OK, got it/.test(t3) && /Send/.test(t3) && !/확인|보내기/.test(t3), t3.replace(/\n/g, ' / '));
  if (SHOT) await p3.screenshot({ path: join(SHOT, 'whisper-teacher-en.png') });
  await p3.close();

  // ── ④ 학생 화면 — 바뀌지 않았다 ──
  console.log('\n④ 학생 화면: 예전 그대로');
  const p4 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openClass(p4, { role: 'student', me: 's1' });
  const st = await p4.evaluate(() => {
    window.vcWhisperOn('admin-whisper', { message: '강사용 지시', from: 'Maimai', fromId: 'o1', observer: true });
    const a = !!document.getElementById('vc-whisper-alert') || !!document.getElementById('vc-whisper-box');
    window.vcWhisperOn('admin-whisper', { message: '마이크를 확인해 주세요', direct: true, to: 's1', toStaff: false, from: '', fromId: '' });
    return { leaked: a, box: !!document.getElementById('vc-whisper-box'), card: !!document.getElementById('vc-whisper-alert') };
  });
  ok('강사용 귓속말은 학생 화면에 안 뜬다', !st.leaked);
  ok('학생에게 온 것은 예전 작은 상자로 뜬다 (큰 카드 아님)', st.box && !st.card, JSON.stringify(st));
  await p4.close();

  // ── ⑤ 참관자 화면 — 강사 답장이 보인다 ──
  console.log('\n⑤ 참관자 화면: 강사 답장 카드 + 읽음 줄');
  const p5 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openClass(p5, { role: '', me: 'o1', observer: true });
  await p5.evaluate(() => {
    window.vcWhisperOn('admin-whisper', { kind: 'reply', message: '👍 OK', from: 'Teacher Len', fromId: 't1', direct: true, to: 'o1', toStaff: true, at: Date.now() });
  });
  const m5 = await p5.evaluate(measure, '#vc-whisper-alert');
  ok('참관자 화면에 답장 카드가 뜬다', !!m5 && /Teacher Len/.test(m5.text) && /OK/.test(m5.text), m5 ? m5.text.replace(/\n/g, ' / ') : '(없음)');
  ok('그 카드가 맨 위에 있다', !!m5 && m5.onTop, m5 ? m5.hit : '');
  if (SHOT) await p5.screenshot({ path: join(SHOT, 'whisper-observer-reply.png') });
  await p5.evaluate(() => window.vcWhisperOn('admin-whisper', { kind: 'read', message: '', from: 'Teacher Len', direct: true, to: 'o1', toStaff: true }));
  ok('«읽음» 이 참관자 채팅창에 남는다', await p5.evaluate(() => /확인했습니다/.test(document.getElementById('vc-chat-messages').textContent)));
  await p5.close();

  console.log(`\n───────────────────────────────\n  통과 ${pass} · 실패 ${fail}\n───────────────────────────────`);
} finally {
  await browser.close();
  try { srv.kill(); } catch (_) {}
}
process.exit(fail ? 1 : 0);
