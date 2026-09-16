/* manual/vc-aao-realpc-browser.mjs — 음성전용(AAO) 끄기·켜기를 «진짜 RTCPeerConnection» 으로 (2026-09-16)
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다(manual/ 규약: 게이트가 물어 가지 않음).
 *
 *   준비:  mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   실행:  PW_DIR=/tmp/pw node test-harness/manual/vc-aao-realpc-browser.mjs
 *
 * [왜 이 파일이 따로 있나]
 *   aao_freeze_harness 는 «가짜 sender»(setParameters 가 객체를 바꿔치기만 하는 흉내)로
 *   판정을 잽니다. 그것으로는 원리상 못 보는 것이 셋 있습니다 —
 *     ① encodings[0].active=false 가 «실제로» 프레임을 멈추는가
 *     ② active=true 로 되돌리면 «실제로» 다시 나가는가(= 이 수리의 목적 그 자체)
 *     ③ 사람이 카메라를 끈 상태에서 그 «되살리기» 가 얼굴을 내보내지 않는가(프라이버시)
 *   여기서는 크로미움의 진짜 RTCPeerConnection 둘을 로컬로 붙이고, 받는 쪽 <video> 의
 *   framesDecoded 와 «화면 픽셀» 로 잽니다. 흉내가 아니라 결과를 봅니다.
 *
 * ⚠️ 가짜 카메라(--use-fake-device-for-media-stream)는 «움직이는 색 무늬» 입니다.
 *    그래서 «검은가» 로 프라이버시를 가릴 수 있습니다(끈 카메라는 검은 프레임).
 * ⚠️ 「켰다」와 「나간다」는 다릅니다 — framesDecoded 가 실제로 늘어야 통과입니다.
 * ⚠️ 짝을 반드시 함께 둡니다 — 「멈춘다」 옆에 「다시 나간다」, 「안 켠다」 옆에
 *    「인코딩은 되살린다」. 한쪽만 두면 «전부 끄기»·«전부 켜기» 도 통과합니다.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* ⚠️ 변이시험용 — QLOG_SRC 로 «고친 사본» 을 가리킬 수 있다.
   ⛔ 저장소의 진짜 파일을 고쳤다 되돌리는 방식을 쓰지 말 것(git 은 «방금 쓴 것» 을 모르고,
      public/ 안에 백업을 두면 deploy.ps1 이 통째로 업로드한다). 사본은 os.tmpdir() 에. */
const QLOG = process.env.QLOG_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'js', 'idx-vc-qlog.js');

let pass = 0, fail = 0;
const ok = (c, msg, detail) => {
  if (c) { pass++; }
  else { fail++; console.log('  ❌ ' + msg + (detail ? '  — ' + detail : '')); }
};
const sec = (t) => console.log('\n' + t);

/* ── 최소 화면 — 이 파일이 만지는 DOM 만 둔다 ───────────────────────────── */
const PAGE = `<!doctype html><meta charset="utf-8"><title>aao-realpc</title>
<style>.video-box{position:relative;width:320px;height:240px;background:#000}
video{width:100%;height:100%;object-fit:cover}</style>
<div id="vc-local-box" class="video-box"><video id="vlocal" autoplay muted playsinline></video></div>
<div id="vc-video-u1" class="video-box"><video id="vremote" autoplay muted playsinline></video></div>
<script src="/js/idx-vc-qlog.js"></script>`;

const server = createServer((req, res) => {
  if (req.url.startsWith('/js/idx-vc-qlog.js')) {
    res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
    res.end(readFileSync(QLOG));
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
         '--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(m.text()));
await page.goto(BASE, { waitUntil: 'load' });

/* ⚠️ 여기부터는 반드시 finally 로 감싼다 — 도중에 예외가 나면 브라우저와 http 서버가
   이벤트 루프를 붙잡아 «결과줄조차 안 나온 채 매달립니다»(CLAUDE.md: 크래시는 FAIL 이 아니라
   «확인 안 함» 이 «문제없음» 으로 위장하는 것). 예외도 한 건의 ❌ 로 세어 깔끔하게 끝낸다. */
try {

/* ── 진짜 PeerConnection 둘을 로컬로 붙인다 ─────────────────────────────── */
const wired = await page.evaluate(async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 320, height: 240, frameRate: 15 }, audio: true
  });
  document.getElementById('vlocal').srcObject = stream;
  const pc1 = new RTCPeerConnection(), pc2 = new RTCPeerConnection();
  pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate);
  pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate);
  pc2.ontrack = e => { document.getElementById('vremote').srcObject = e.streams[0]; };
  stream.getTracks().forEach(t => pc1.addTrack(t, stream));
  await pc1.setLocalDescription(await pc1.createOffer());
  await pc2.setRemoteDescription(pc1.localDescription);
  await pc2.setLocalDescription(await pc2.createAnswer());
  await pc1.setRemoteDescription(pc2.localDescription);
  for (let i = 0; i < 100 && pc1.connectionState !== 'connected'; i++) await new Promise(r => setTimeout(r, 100));
  window.__pc1 = pc1; window.__pc2 = pc2; window.__stream = stream;
  /* ⚠️ 이 파일이 보는 정본 — 실제 PeerConnection 을 그대로 넘긴다 */
  window.vcPeerConnections = { u1: pc1 };
  const vs = pc1.getSenders().find(s => s.track && s.track.kind === 'video');
  /* 진짜 sender 의 setParameters 호출 «횟수» 를 센다(평상시 불필요한 터치 검사용) */
  window.__sp = 0;
  const origSet = vs.setParameters.bind(vs);
  vs.setParameters = (p) => { window.__sp++; return origSet(p); };
  window.__vsender = vs;
  /* 자기 타일의 «속성 쓰기» 횟수 — class/style 을 다시 쓰면 남의 관찰자가 깨어난다 */
  window.__domWrites = 0;
  new MutationObserver(r => { window.__domWrites += r.length; })
    .observe(document.getElementById('vc-local-box'), { attributes: true });
  return { state: pc1.connectionState, hasSender: !!vs, tickIsFn: typeof vcAaoTick === 'function' };
});

const frames = () => page.evaluate(async () => {
  const st = await window.__pc2.getStats(); let f = 0;
  st.forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video' && typeof r.framesDecoded === 'number') f = Math.max(f, r.framesDecoded); });
  return f;
});
/* 받는 쪽 화면의 «밝기» — 가짜 카메라는 움직이는 색 무늬, 끈 카메라는 검정 */
const luma = () => page.evaluate(() => {
  const v = document.getElementById('vremote');
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 48);
  const d = g.getImageData(0, 0, 64, 48).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
  return s / (d.length / 4);
});
const tick = (n = 1) => page.evaluate(async (k) => {
  for (let i = 0; i < k; i++) { vcAaoTick(); await new Promise(r => setTimeout(r, 60)); }
}, n);
const setAao = (on) => page.evaluate((v) => { window.__vcAAO = { active: v }; }, on);
const active = () => page.evaluate(() => {
  const p = window.__vsender.getParameters();
  return p.encodings && p.encodings.length ? p.encodings[0].active : null;
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log('════════ 음성전용(AAO) — 진짜 RTCPeerConnection 통합 ════════');
console.log('  연결 상태: ' + wired.state + ' · 영상 sender ' + (wired.hasSender ? '있음' : '없음')
          + ' · vcAaoTick ' + (wired.tickIsFn ? '전역에 있음' : '없음'));

sec('① 전제 — 진짜로 붙었고 영상이 흐르는가(이게 아니면 아래가 전부 헛돈다)');
ok(wired.state === 'connected', 'A-1 두 PeerConnection 이 실제로 연결됐다', wired.state);
ok(wired.hasSender, 'A-2 영상 sender 를 찾았다');
ok(wired.tickIsFn, 'A-3 vcAaoTick 이 전역에 있다(분리 파일이 정상 로드됐다)');
const f0 = await frames(); await sleep(1500); const f1 = await frames();
ok(f1 > f0, 'A-4 평상시 영상이 실제로 흐른다 — framesDecoded 가 는다', f0 + ' → ' + f1);
const l0 = await luma();
ok(l0 > 8, 'A-5 받는 화면이 검지 않다(가짜 카메라 무늬가 실제로 그려진다)', 'luma ' + l0.toFixed(1));

sec('② 평상시 틱 — 이미 켜져 있는 sender 를 건드리지 않는가 (사용자 확인 ②·⑤)');
await setAao(false);
await page.evaluate(() => { window.__sp = 0; window.__domWrites = 0; });
await tick(6);                                   // 4초 틱 6회 ≈ 24초치
const idle = await page.evaluate(() => ({ sp: window.__sp, dom: window.__domWrites }));
ok(idle.sp === 0, 'B-1 평상시 6틱 동안 setParameters 를 한 번도 부르지 않는다(인코더를 안 흔든다)', 'setParameters ' + idle.sp + '회');
ok(idle.dom === 0, 'B-2 평상시 6틱 동안 자기 타일 속성을 한 글자도 다시 쓰지 않는다(남의 관찰자를 안 깨운다)', '속성쓰기 ' + idle.dom + '회');
const f2 = await frames(); await sleep(800); const f3 = await frames();
ok(f3 > f2, 'B-3 짝 — 그 사이에도 영상은 계속 흐른다(«아무것도 안 함» 이 «꺼짐» 이 아니다)', f2 + ' → ' + f3);

sec('③ 회선 저하 → 음성전용 — 실제로 프레임이 멈추는가 (사용자 확인 ③ 앞단)');
await setAao(true);
await tick(1);
await sleep(300);
ok(await active() === false, 'C-1 영상 인코딩이 실제로 꺼졌다(encodings[0].active=false)');
await sleep(1200);
const fA = await frames(); await sleep(1500); const fB = await frames();
ok(fB - fA <= 2, 'C-2 받는 쪽 프레임이 실제로 멈춘다', fA + ' → ' + fB + ' (증가 ' + (fB - fA) + ')');
ok(await page.evaluate(() => window.__vsender.track.readyState === 'live' && window.__vsender.track.enabled === true),
   'C-3 그래도 트랙은 살아 있다 — 되살릴 때 재협상이 필요 없어야 한다');

sec('④ 네트워크 회복 → 새로고침 없이 영상이 돌아오는가 (사용자 확인 ③ · 이 수리의 핵심)');
await setAao(false);
await tick(1);
await sleep(300);
ok(await active() === true, 'D-1 4초 틱이 영상 인코딩을 다시 켰다');
await sleep(1500);
const fC = await frames(); await sleep(1500); const fD = await frames();
ok(fD - fC >= 5, 'D-2 받는 쪽 프레임이 «실제로» 다시 늘어난다 — 새로고침 없이 복귀', fC + ' → ' + fD + ' (증가 ' + (fD - fC) + ')');
const lR = await luma();
ok(lR > 8, 'D-3 받는 화면에 다시 그림이 그려진다', 'luma ' + lR.toFixed(1));

sec('⑤ 한 번 거절돼도 다음 틱이 되살리는가 (옛 한쪽짜리 재적용이면 여기서 영영 안 돌아왔다)');
await setAao(true); await tick(1); await sleep(300);
await page.evaluate(() => {                       // «회복 그 틱» 의 setParameters 를 한 번만 거절시킨다
  const vs = window.__vsender, orig = vs.setParameters.bind(vs);
  let once = false;
  vs.setParameters = (p) => { if (!once) { once = true; return Promise.reject(new DOMException('InvalidStateError')); } return orig(p); };
});
await setAao(false);
await tick(1); await sleep(200);
ok(await active() === false, 'E-1 전제: 첫 «켜기» 는 실제로 거절됐다(꺼진 채로 남았다)');
ok(logs.some(t => /setParameters 거절/.test(t)), 'E-2 그 거절을 삼키지 않고 말한다 (사용자 확인 ④)',
   logs.filter(t => /vc-aao/.test(t)).join(' | ') || '(vc-aao 로그 없음)');
await tick(1); await sleep(1500);
ok(await active() === true, 'E-3 다음 4초 틱이 다시 켠다 — 거절 한 번이 수업 끝까지 가지 않는다');
const fE = await frames(); await sleep(1500); const fF = await frames();
ok(fF - fE >= 5, 'E-4 짝 — 그래서 영상이 실제로 돌아온다', fE + ' → ' + fF);

sec('⑥ 프라이버시 — 사람이 끈 카메라를 회복 틱이 다시 켜지 않는가 (사용자 확인 ⑥)');
await page.evaluate(() => { window.__stream.getVideoTracks().forEach(t => { t.enabled = false; }); });
await sleep(1200);
const lOff = await luma();
ok(lOff < 6, 'F-1 전제: 사람이 카메라를 끄면 받는 화면이 검어진다', 'luma ' + lOff.toFixed(1));
await setAao(true); await tick(1); await sleep(400);      // AAO 로 껐다가
await setAao(false); await tick(3); await sleep(1500);    // 회복 틱을 세 번 건다
ok(await page.evaluate(() => window.__vsender.track.enabled === false),
   'F-2 회복 틱이 트랙을 다시 켜지 않는다 — 카메라를 끈 사람의 얼굴이 나가지 않는다');
const lStill = await luma();
ok(lStill < 6, 'F-3 픽셀로 확인 — 받는 화면이 «여전히» 검다(프라이버시가 실제로 지켜진다)', 'luma ' + lStill.toFixed(1));
ok(await active() === true, 'F-4 짝 — 그래도 인코딩은 되살아나 있다(카메라를 다시 켜면 바로 나가야 한다)');
await page.evaluate(() => { window.__stream.getVideoTracks().forEach(t => { t.enabled = true; }); });
await sleep(1500);
const lBack = await luma();
ok(lBack > 8, 'F-5 짝 — 카메라를 다시 켜면 그 순간 바로 나간다(F-2 를 «영영 안 켜기» 로 푼 것이 아니다)', 'luma ' + lBack.toFixed(1));

sec('⑦ 두 «탭» — 받는 쪽이 다른 탭(다른 렌더러)이어도 같은가');
/* [왜] ①~⑥ 은 한 탭 안에서 PC 둘을 붙였습니다. 사장님이 실제로 쓰는 모양은 «두 창» 이므로
   받는 쪽을 진짜 다른 탭으로 옮겨 한 번 더 잽니다(미디어가 프로세스 경계를 넘습니다).
   ⚠️ 여기서도 «수업 화면 전체» 는 아닙니다 — 방(Durable Object)·로그인·동의는 서버가 필요합니다.
      그 한계는 README 와 작업기록에 적어 두었습니다. */
const pageB = await browser.newPage();
await pageB.goto('data:text/html,<meta charset=utf-8><video id=v autoplay muted playsinline width=320 height=240></video>');
/* trickle 없이 — ICE 수집이 끝난 SDP 를 통째로 주고받는다(로컬 host 후보뿐이라 이것으로 충분) */
const offer = await page.evaluate(async () => {
  const pc = new RTCPeerConnection();
  window.__stream.getTracks().forEach(t => pc.addTrack(t, window.__stream));
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise(r => { if (pc.iceGatheringState === 'complete') return r();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && r(); });
  window.__pcA = pc;
  window.vcPeerConnections = { u2: pc };          // 이 파일이 보는 정본을 새 연결로 바꾼다
  const vs = pc.getSenders().find(x => x.track && x.track.kind === 'video');
  window.__vsender = vs;
  return pc.localDescription.sdp;
});
const answer = await pageB.evaluate(async (sdp) => {
  const pc = new RTCPeerConnection();
  pc.ontrack = e => { document.getElementById('v').srcObject = e.streams[0]; };
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await new Promise(r => { if (pc.iceGatheringState === 'complete') return r();
    pc.onicegatheringstatechange = () => pc.iceGatheringState === 'complete' && r(); });
  window.__pcB = pc;
  return pc.localDescription.sdp;
}, offer);
await page.evaluate(async (sdp) => { await window.__pcA.setRemoteDescription({ type: 'answer', sdp }); }, answer);
const framesB = () => pageB.evaluate(async () => {
  const st = await window.__pcB.getStats(); let f = 0;
  st.forEach(r => { if (r.type === 'inbound-rtp' && r.kind === 'video' && typeof r.framesDecoded === 'number') f = Math.max(f, r.framesDecoded); });
  return f;
});
for (let i = 0; i < 100; i++) {
  if (await page.evaluate(() => window.__pcA.connectionState) === 'connected') break;
  await sleep(100);
}
ok(await page.evaluate(() => window.__pcA.connectionState) === 'connected',
   'G-1 전제: 두 «탭» 사이에 진짜 연결이 맺혔다', await page.evaluate(() => window.__pcA.connectionState));
await sleep(1500);
const g0 = await framesB(); await sleep(1500); const g1 = await framesB();
ok(g1 > g0, 'G-2 다른 탭에서 영상이 실제로 흐른다', g0 + ' → ' + g1);
await setAao(true); await tick(1); await sleep(1500);
const g2 = await framesB(); await sleep(1500); const g3 = await framesB();
ok(g3 - g2 <= 2, 'G-3 음성전용 — 다른 탭의 프레임이 멈춘다', g2 + ' → ' + g3 + ' (증가 ' + (g3 - g2) + ')');
await setAao(false); await tick(1); await sleep(2000);
const g4 = await framesB(); await sleep(1500); const g5 = await framesB();
ok(g5 - g4 >= 5, 'G-4 회복 — 새로고침 없이 다른 탭에 영상이 돌아온다 (사용자 시나리오 그대로)', g4 + ' → ' + g5 + ' (증가 ' + (g5 - g4) + ')');

} catch (e) {
  fail++;
  console.log('  ❌ 검사 도중 예외 — ' + ((e && e.message) || e));
} finally {
  try { await browser.close(); } catch (_) {}
  server.close();
}
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
