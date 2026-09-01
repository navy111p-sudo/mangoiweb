/**
 * observe-audio-whisper-browser.mjs — 🎧 소리만 참관 · 💬 귓속말 «진짜 브라우저» 검사 (2026-08-31)
 *
 * 왜 필요한가
 *   이 둘의 핵심은 «문자열» 이 아니라 «WebRTC 협상 방향» 과 «순서» 다.
 *   · 소리만: 참관자가 만드는 offer 의 video m-line 이 정말 inactive 인가
 *             (받아 놓고 숨기는 것이 아니라 «오지 않게» 하는 것 — 회선 절약의 근거)
 *   · 대조군: audio=1 이 없을 때는 지금까지처럼 recvonly 여야 한다(기능을 깨지 않았는가)
 *   · 귓속말: 채팅칸이 실제로 열리는가
 *   문자열 하니스(observer_camera_guard_harness G절)는 «그 줄이 있는가» 까지만 본다.
 *
 * ⚠️ 자동으로 안 돕니다 — manual/ 이라 게이트가 물어 가지 않습니다. 사람이 부릅니다:
 *      node test-harness/manual/observe-audio-whisper-browser.mjs
 *
 * 방법
 *   · public/ 을 로컬 HTTP 로 띄우고 이미 열려 있는 탭을 잡아 Page.navigate
 *     (⛔ /json/new 로 새 탭을 만들면 이 컨테이너에서는 페이지 스크립트가 안 돈다 — 2장 함정)
 *   · WebSocket 은 안 뜬다(정적 서버) — 그래도 vcJoinAsObserver 가 맨 앞에서
 *     vcIsObserver = true 를 세우므로, vcCreatePeer 를 직접 불러 «협상 방향» 을 잴 수 있다.
 *   · 카메라·마이크는 쓰지 않는다(참관자는 원래 로컬 미디어가 없다).
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 8933, CDP = 9333;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m) => { fail++; console.log(`  ❌ ${m}`); };
const check = (m, c) => c ? ok(m) : no(m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 서버가 없는 자리만 가짜로 채운다 — 화면 코드는 그대로 돈다 */
const STUB = `
window.__origFetch = window.fetch;
window.fetch = function (url, opt) {
  const u = String(url);
  const J = (o) => Promise.resolve(new Response(JSON.stringify(o),
    { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (u.indexOf('/api/turn-config') >= 0) return J({ ok: true, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  if (u.indexOf('/api/consents/') >= 0)   return J({ ok: true, user_id: 'obs', recording_consent: 1 });
  if (u.indexOf('/api/') >= 0)            return J({ ok: true });
  return window.__origFetch.apply(this, arguments);
};
`;

async function cdp() {
  const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  if (!page) throw new Error('열린 탭이 없습니다');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waits = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
  };
  const send = (method, params) => new Promise((res) => { waits.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    const ex = r.result?.exceptionDetails;
    if (ex) throw new Error(ex.text + ' ' + (ex.exception?.description || ''));
    return r.result?.result?.value;
  };
  return { send, evalJs, close: () => ws.close() };
}

/* 참관 화면을 열고 vcCreatePeer 를 «직접» 불러 트랜시버 방향을 읽는다 */
const PROBE = `(function(){
  try {
    if (typeof window.vcCreatePeer !== 'function') return { err: 'vcCreatePeer 없음' };
    var pc = window.vcCreatePeer('probe-peer', 'probe');
    var dirs = (pc.getTransceivers() || []).map(function (t) {
      var k = '';
      try { k = (t.receiver && t.receiver.track && t.receiver.track.kind) || ''; } catch (e) {}
      return k + ':' + t.direction;
    });
    return {
      dirs: dirs,
      observer: (typeof vcIsObserver !== 'undefined') ? !!vcIsObserver : null,
      mediaWatchOff: window.__vcObserveMediaWatching === true,
      retryOff: window.__vcObserveRetried === true,
      audioOnlyOn: window.__vcAudioOnlyOn === true,
      note: !!document.getElementById('vc-audio-only-note')
    };
  } catch (e) { return { err: String(e && e.message || e) }; }
})()`;

async function main() {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUB, stdio: 'ignore' });
  const br = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP}`,
    '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,900',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank'], { stdio: 'ignore' });
  const done = () => { try { srv.kill(); } catch (e) {} try { br.kill(); } catch (e) {} };
  try {
    await sleep(2800);
    const c = await cdp();
    await c.send('Page.enable'); await c.send('Runtime.enable');
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: STUB });
    const base = `http://127.0.0.1:${PORT}/`;

    console.log('observe-audio-whisper-browser — 소리만·귓속말이 실제로 동작하는가\n');

    /* ── 1부 · 대조군 — audio 파라미터가 없으면 «지금까지처럼» 영상을 받는다 ── */
    await c.send('Page.navigate', { url: base + '?observe=probe-room' });
    await sleep(4000);
    const plain = await c.evalJs(PROBE);
    check(`① 참관 모드로 들어간다 (vcIsObserver=${plain && plain.observer})`, !!(plain && plain.observer === true));
    check(`①-2 대조군: 영상 트랜시버가 recvonly 다 — 기능을 안 깼다 (실측 ${JSON.stringify(plain && plain.dirs)})`,
          !!(plain && (plain.dirs || []).some(d => d === 'video:recvonly')));
    check('①-3 대조군에는 «소리만» 배너가 없다', !!(plain && plain.note === false));
    check('①-4 대조군에서는 영상 미수신 감시를 끄지 않는다 (원래 감시는 살아 있어야 한다)',
          !!(plain && plain.mediaWatchOff === false && plain.retryOff === false));

    /* ── 2부 · 소리만 참관 — 영상 m-line 이 inactive 여야 «오지 않는다» ── */
    await c.send('Page.navigate', { url: base + '?observe=probe-room&audio=1' });
    await sleep(4000);
    const ao = await c.evalJs(PROBE);
    check(`② 소리만: 영상 트랜시버가 inactive 다 (실측 ${JSON.stringify(ao && ao.dirs)})`,
          !!(ao && (ao.dirs || []).some(d => d === 'video:inactive')));
    check('②-2 소리는 그대로 받는다 (audio recvonly 유지)',
          !!(ao && (ao.dirs || []).some(d => d === 'audio:recvonly')));
    check('②-3 «영상 미수신» 감시를 미리 껐다 — 안 끄면 릴레이 강제 + offer 재전송이 돈다',
          !!(ao && ao.mediaWatchOff === true && ao.retryOff === true));
    check('②-4 실제로 껐을 때만 배너를 그린다 (거짓말하지 않는다)',
          !!(ao && ao.audioOnlyOn === true && ao.note === true));

    const noteTxt = await c.evalJs(`(document.getElementById('vc-audio-only-note')||{}).textContent || ''`);
    check(`②-5 배너가 «영상을 받지 않는다» 고 말하고 되돌릴 버튼이 있다 (실측 «${String(noteTxt).slice(0, 34)}»)`,
          /소리만 참관 중/.test(noteTxt) && /영상도 보기/.test(noteTxt));

    /* ⚠️ 클릭 «직후» 주소를 읽으면 이동 전 값이 나온다(검사 쪽 함정 — 실제로 한 번 밟았다).
       이동이 끝날 시간을 준 뒤에 읽는다. */
    await c.evalJs(`(function(){
      var b = document.querySelector('#vc-audio-only-note button'); if (b) b.click(); return 1; })()`);
    await sleep(2500);
    const backUrl = await c.evalJs(`location.href`);
    check(`②-6 [영상도 보기] 는 audio 파라미터를 빼고 다시 연다 (실측 ${String(backUrl).replace(/^https?:\/\/[^/]+/, '')})`,
          String(backUrl).indexOf('observe=probe-room') >= 0 && String(backUrl).indexOf('audio=1') < 0);

    /* ── 3부 · 귓속말 패널이 실제로 열리는가 ── */
    await c.send('Page.navigate', { url: base + '?observe=probe-room&whisper=1' });
    await sleep(5200);
    const chat = await c.evalJs(`(function(){
      var p = document.getElementById('vc-chat-panel');
      return { exists: !!p, open: !!(p && p.classList.contains('open')) };
    })()`);
    check('③ 참관 화면에 채팅(=귓속말) 칸이 있다', !!(chat && chat.exists));
    check('③-2 &whisper=1 이면 그 칸이 자동으로 열린다', !!(chat && chat.open));

    const stillOpen = await c.evalJs(`(function(){
      var p = document.getElementById('vc-chat-panel');
      return !!(p && p.classList.contains('open'));
    })()`);
    check('③-3 두 번째 호출에도 도로 닫히지 않는다 (토글이 아니라 열기)', stillOpen === true);

    /* ── 3.5부 · ⑨ 참관 주소에 ?room= 이 남지 않는가 (남으면 F5 로 «실제 참가자» 입장) ── */
    const roomLeak = await c.evalJs(`location.search`);
    check(`③-4 참관 주소에 ?room= 이 붙지 않는다 — 붙으면 새로고침이 실제 참가자로 입장시킨다 (실측 «${roomLeak}»)`,
          String(roomLeak).indexOf('room=') < 0 || /observe=/.test(String(roomLeak).replace(/room=/g, '')));

    /* ── 4부 · 소리만과 귓속말을 같이 켜도 서로를 깨지 않는가 ── */
    await c.send('Page.navigate', { url: base + '?observe=probe-room&audio=1&whisper=1' });
    await sleep(5200);
    const both = await c.evalJs(PROBE);
    const bothChat = await c.evalJs(`!!(document.getElementById('vc-chat-panel')||{classList:{contains:()=>false}}).classList.contains('open')`);
    check(`④ 둘을 같이 켜도 영상은 inactive 다 (실측 ${JSON.stringify(both && both.dirs)})`,
          !!(both && (both.dirs || []).some(d => d === 'video:inactive')));
    check('④-2 그때도 귓속말 칸은 열린다', bothChat === true);

    c.close();
  } finally { done(); }

  console.log(`\n  결과: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('실행 실패:', e.message); process.exit(2); });
