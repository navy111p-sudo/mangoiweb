/**
 * 📶 화상수업 다중 동시접속 + 네트워크 열화 E2E 하네스 (puppeteer-core)
 * -----------------------------------------------------------------------------
 * 실서버(test.mangoi.co.kr)의 격리된 하네스 전용 방(harness-net-*)에
 * 가짜 카메라/마이크로 3명(교사1+학생2)을 동시 입장시켜 검증한다.
 *
 *  P1) 다중 동시 접속: 3자 메시(mesh) 전원 P2P connected + 입장→연결 소요시간 측정
 *  P2) 미디어 실흐름: 각 클라이언트 framesDecoded/bytesReceived 실제 증가
 *  P3) 송신 상한 적용: maxBitrate ≤ 1.2Mbps + degradationPreference=balanced (저전력·적응 기반)
 *  P4) 대역 제한 생존: CDP로 학생1의 HTTP/WS 를 300kbps+400ms 로 조이고 20초 —
 *      수업(WS·P2P)이 튕기지 않는지 확인
 *      ⚠️ CDP Network.emulateNetworkConditions 는 WebRTC UDP 미디어는 조이지 못함.
 *         미디어 자체의 패킷손실 시뮬은 Windows 에선 clumsy.exe 로 별도 수행(가이드 참조).
 *  P5) 오프라인→복귀 자동 재연결: 학생1을 setOfflineMode(true) 10초 → 복귀 후
 *      WebSocket OPEN + 전 피어 재-connected 자동 복구 확인 (무한 재시도·online 핸들러 검증)
 *  P6) 피어 강제 재연결(vcReconnectPeer) 복구: 교사가 특정 피어를 강제 재빌드 →
 *      재협상 후 다시 connected + 프레임 재유입 확인 (이동 중 끊김 복구 경로)
 *
 * 실행:
 *   node test-harness/vc_netem_multiclient_harness.mjs
 * 옵션(env):
 *   BASE_URL    기본 https://test.mangoi.co.kr
 *   CHROME_PATH 기본 C:/Program Files/Google/Chrome/Application/chrome.exe
 *   CLIENTS     기본 3 (2~4)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE_URL || 'https://test.mangoi.co.kr';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CLIENTS = Math.min(4, Math.max(2, parseInt(process.env.CLIENTS || '3', 10)));
const ROOM = 'harness-net-' + Date.now().toString(36);

let pass = 0, fail = 0;
const chk = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name + (extra ? '  (' + extra + ')' : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  — ' + extra : '')); }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 페이지 안에서 조건이 참이 될 때까지 1초 간격 폴링 */
async function waitFor(page, fn, timeoutMs, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    let v = null;
    try { v = await page.evaluate(fn, arg); } catch (_) {}
    if (v) return { ok: true, ms: Date.now() - t0, value: v };
    await sleep(1000);
  }
  return { ok: false, ms: Date.now() - t0, value: null };
}

/** 연결 상태 스냅샷 (페이지 컨텍스트) */
const snapFn = () => {
  const out = { inCall: document.body.classList.contains('vc-in-call'), ws: -1, peers: [] };
  try { if (typeof vcConn !== 'undefined' && vcConn && vcConn.ws) out.ws = vcConn.ws.readyState; } catch (_) {}
  try {
    Object.keys(typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : {}).forEach(id => {
      const pc = vcPeerConnections[id];
      out.peers.push({ id: id, ice: pc.iceConnectionState, conn: pc.connectionState });
    });
  } catch (_) {}
  return out;
};
const connectedFn = (need) => {
  try {
    const ids = Object.keys(typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : {});
    const good = ids.filter(id => ['connected', 'completed'].includes(vcPeerConnections[id].iceConnectionState));
    return good.length >= need ? good.length : 0;
  } catch (_) { return 0; }
};
const statsFn = async () => {
  const res = [];
  try {
    for (const id of Object.keys(typeof vcPeerConnections !== 'undefined' ? vcPeerConnections : {})) {
      const pc = vcPeerConnections[id];
      let frames = 0, bytes = 0;
      try {
        const st = await pc.getStats();
        st.forEach(r => {
          if (r.type === 'inbound-rtp') {
            if (r.kind === 'video' || r.mediaType === 'video') frames = Math.max(frames, r.framesDecoded || 0);
            bytes += r.bytesReceived || 0;
          }
        });
      } catch (_) {}
      res.push({ id: id, frames: frames, bytes: bytes });
    }
  } catch (_) {}
  return res;
};

console.log(`📶 화상수업 네트워크 내성 E2E — ${BASE}  방=${ROOM}  인원=${CLIENTS}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',      // 권한 팝업 자동 허용
    '--use-fake-device-for-user-media',    // 가짜 캠(움직이는 패턴)+가짜 마이크(톤)
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  /* ── P1) 다중 동시 접속 ── */
  console.log('\n[P1] 다중 동시 접속 (' + CLIENTS + '명 메시)');
  const names = ['T-하네스교사', 'S-하네스학생1', 'S-하네스학생2', 'S-하네스학생3'].slice(0, CLIENTS);
  const pages = [];
  for (const n of names) {
    const p = await browser.newPage();
    await p.setViewport({ width: 1280, height: 800 });
    p.on('pageerror', e => console.log('  [pageerror ' + n + ']', String(e).slice(0, 140)));
    pages.push(p);
  }
  const t0 = Date.now();
  await Promise.all(pages.map((p, i) =>
    p.goto(`${BASE}/?vc_autojoin=1&vc_room=${ROOM}&vc_name=${encodeURIComponent(names[i])}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 })));

  const need = CLIENTS - 1;   // 메시: 각자 나머지 전원과 연결
  const joins = await Promise.all(pages.map(p => waitFor(p, connectedFn, 60000, need)));
  joins.forEach((j, i) => chk(`${names[i]}: 피어 ${need}명 전원 connected`, j.ok, `입장→연결 ${(j.ms / 1000).toFixed(1)}초`));
  const worst = Math.max(...joins.map(j => j.ms));
  chk('최악 연결 수립 시간 < 40초', worst < 40000, (worst / 1000).toFixed(1) + '초');
  console.log('  ⏱ 전체 시작→전원 연결:', ((Date.now() - t0) / 1000).toFixed(1) + '초');

  /* ── P2) 미디어 실흐름 ── */
  console.log('\n[P2] 미디어 실흐름 (framesDecoded/bytesReceived 증가)');
  const s1 = await Promise.all(pages.map(p => p.evaluate(statsFn)));
  await sleep(6000);
  const s2 = await Promise.all(pages.map(p => p.evaluate(statsFn)));
  pages.forEach((_, i) => {
    const before = s1[i], after = s2[i];
    const flowing = after.length && after.every(a => {
      const b = before.find(x => x.id === a.id) || { frames: 0, bytes: 0 };
      return a.bytes > b.bytes;   // 최소 바이트 증가 (프레임은 상대 캠 상태 따라 0일 수 있음)
    });
    const vid = after.some(a => { const b = before.find(x => x.id === a.id) || { frames: 0 }; return a.frames > b.frames; });
    chk(`${names[i]}: 수신 바이트 증가(전 피어)`, flowing);
    chk(`${names[i]}: 비디오 프레임 디코딩 증가(1개 이상)`, vid);
  });

  /* ── P3) 송신 상한 적용 ── */
  console.log('\n[P3] 송신 인코딩 상한(적응형 비트레이트 기반값)');
  const params = await pages[0].evaluate(() => {
    const out = [];
    try {
      Object.keys(vcPeerConnections).forEach(id => {
        const s = vcPeerConnections[id].getSenders().find(x => x.track && x.track.kind === 'video');
        if (s && s.getParameters) {
          const p = s.getParameters();
          const e = (p.encodings && p.encodings[0]) || {};
          out.push({ id: id, br: e.maxBitrate || 0, fps: e.maxFramerate || 0, dp: p.degradationPreference || '' });
        }
      });
    } catch (_) {}
    return out;
  });
  chk('비디오 sender 파라미터 조회됨', params.length > 0, JSON.stringify(params));
  chk('maxBitrate ≤ 1.2Mbps 상한 적용', params.length > 0 && params.every(x => x.br > 0 && x.br <= 1200 * 1000));
  chk('degradationPreference=balanced', params.length > 0 && params.every(x => x.dp === 'balanced'));

  /* ── P4) 대역 제한(300kbps+400ms) 생존 ── */
  console.log('\n[P4] 대역 제한 생존 — 학생1 HTTP/WS 300kbps·400ms 20초 (UDP 미디어는 CDP 한계로 미적용)');
  const cdp = await pages[1].createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 400,
    downloadThroughput: 300 * 1024 / 8, uploadThroughput: 300 * 1024 / 8,
  });
  await sleep(20000);
  const p4 = await pages[1].evaluate(snapFn);
  chk('학생1: 수업 유지(vc-in-call)', p4.inCall);
  chk('학생1: WebSocket OPEN 유지', p4.ws === 1, 'readyState=' + p4.ws);
  chk('학생1: P2P 전원 connected 유지', p4.peers.length >= need && p4.peers.every(x => ['connected', 'completed'].includes(x.ice)),
      p4.peers.map(x => x.ice).join(','));
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  /* ── P5) 오프라인 10초 + 시그널링 강제 절단 → 복귀 자동 재연결 ──
     CDP 오프라인은 '이미 수립된' WebSocket 을 안 끊는 크롬 버전이 있어,
     실제 기지국 전환처럼 소켓을 직접 절단(비정상 코드)해 재연결 로직을 강제로 태운다. */
  console.log('\n[P5] 오프라인 10초 + WS 강제절단 → 복귀 자동 재연결 (학생1)');
  await pages[1].setOfflineMode(true);
  await pages[1].evaluate(() => { try { vcConn.ws.close(3000, 'harness-sim-drop'); } catch (_) {} });
  await sleep(10000);
  const p5mid = await pages[1].evaluate(snapFn);
  chk('학생1: 오프라인 중 WS 끊김 확인(재연결 대기)', p5mid.ws !== 1, 'readyState=' + p5mid.ws);
  await pages[1].setOfflineMode(false);
  const wsBack = await waitFor(pages[1], () => {
    try { return (typeof vcConn !== 'undefined' && vcConn && vcConn.ws && vcConn.ws.readyState === 1) ? 1 : 0; } catch (_) { return 0; }
  }, 30000);
  chk('학생1: 복귀 후 WebSocket 자동 재연결', wsBack.ok, (wsBack.ms / 1000).toFixed(1) + '초');
  const peersBack = await waitFor(pages[1], connectedFn, 45000, need);
  chk('학생1: 복귀 후 P2P 전원 재-connected', peersBack.ok, (peersBack.ms / 1000).toFixed(1) + '초');
  const othersOk = await waitFor(pages[0], connectedFn, 45000, need);
  chk('교사: 학생1 복귀 반영(전원 connected)', othersOk.ok);

  /* ── P6) 피어 강제 재연결(vcReconnectPeer) 복구 ── */
  console.log('\n[P6] 피어 강제 재연결 복구 (이동 중 끊김 복구 경로)');
  const target = await pages[0].evaluate(() => Object.keys(vcPeerConnections)[0] || null);
  chk('재연결 대상 피어 선정', !!target, String(target));
  if (target) {
    await pages[0].evaluate((id) => {
      try { Object.keys(__vcReconnectAt).forEach(k => delete __vcReconnectAt[k]); } catch (_) {}   // 쿨다운 해제
      vcReconnectPeer(id);
    }, target);
    const rec = await waitFor(pages[0], (id) => {
      try {
        const pc = vcPeerConnections[id];
        return pc && ['connected', 'completed'].includes(pc.iceConnectionState) ? 1 : 0;
      } catch (_) { return 0; }
    }, 40000, target);
    chk('재빌드 피어 재-connected', rec.ok, (rec.ms / 1000).toFixed(1) + '초');
    const f1 = await pages[0].evaluate(statsFn);
    await sleep(5000);
    const f2 = await pages[0].evaluate(statsFn);
    const flow = f2.some(a => { const b = f1.find(x => x.id === a.id) || { bytes: 0 }; return a.bytes > b.bytes; });
    chk('재연결 후 미디어 재유입', flow);
  }

  /* ── 정리: 전원 명시적 퇴장(방 잔존 방지) ── */
  for (const p of pages) {
    try { await p.evaluate(() => { try { vcConn && vcConn.close(); } catch (_) {} }); } catch (_) {}
  }
} catch (e) {
  fail++;
  console.error('❌ 하네스 실행 오류:', e && e.message);
} finally {
  await browser.close().catch(() => {});
}

console.log('\n════════════════════════════════════');
console.log(fail === 0 ? `🎉 네트워크 내성 E2E 전 항목 통과 (${pass})` : `⚠️ 실패 ${fail} / 통과 ${pass}`);
process.exit(fail === 0 ? 0 : 1);
