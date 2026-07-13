/**
 * 📷🎤 내 타일 아이콘 클릭 토글 검증 (2026-07-13)
 *  1) 내 타일(vc-local-box)의 .vs-cam / .vs-mic 이 클릭 가능(pointer-events)
 *  2) 📷 클릭 → vcCamOn=false, 비디오트랙 disabled, 아이콘 .off(✖), 타일 덮개(.vc-cam-cover) 표시
 *  3) 📷 재클릭 → 전부 원복
 *  4) 🎤 클릭 → vcMicOn=false, 오디오트랙 disabled, 아이콘 .off / 재클릭 원복
 *  5) 덮개가 떠 있어도 상태 아이콘이 위(z-index)라 다시 켤 수 있음
 * 실행: node test-harness/vc_tile_toggle_harness.mjs  (서버 내장, 8791)
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('cloudflare-deploy/public');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.json':'application/json', '.svg':'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  fs.readFile(p.endsWith(path.sep) || !path.extname(p) ? path.join(ROOT,'index.html') : p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});
let ownServer = true;
await new Promise((resolve) => {
  server.once('error', (e) => { if (e.code === 'EADDRINUSE') { ownServer = false; resolve(); } else throw e; });
  server.listen(8791, resolve);
});
if (!ownServer) console.log('  (8791 기존 서버 재사용)');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
         '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 160)));
await page.setViewport({ width: 1200, height: 800 });
await page.goto('http://localhost:8791/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

const setup = await page.evaluate(async () => {
  ['mango-intro-overlay'].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
  document.querySelectorAll('.view.active').forEach(v => v.classList.remove('active'));
  document.getElementById('view-videocall-call').classList.add('active');
  document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  vcLocalStream = stream;
  const box = document.getElementById('vc-local-box');
  attachStreamMonitor(box, stream);
  const st = box.querySelector('.video-status');
  return { hasStatus: !!st, pe: getComputedStyle(st).pointerEvents,
           camCursor: getComputedStyle(st.querySelector('.vs-cam')).cursor };
});
console.log('1) 상태바 클릭 가능:', setup, setup.hasStatus && setup.pe === 'auto' && setup.camCursor === 'pointer' ? '✅' : '❌');

const snap = () => page.evaluate(() => {
  const box = document.getElementById('vc-local-box');
  const cam = box.querySelector('.vs-cam'), mic = box.querySelector('.vs-mic');
  const cov = box.querySelector('.vc-cam-cover');
  const st = box.querySelector('.video-status');
  return {
    camOn: vcCamOn, micOn: vcMicOn,
    vTrack: vcLocalStream.getVideoTracks()[0].enabled,
    aTrack: vcLocalStream.getAudioTracks()[0].enabled,
    camOff: cam.classList.contains('off'), micOff: mic.classList.contains('off'),
    boxCamOff: box.classList.contains('cam-off'),
    coverShown: cov ? getComputedStyle(cov).display : 'none',
    coverTxt: cov ? (cov.querySelector('.cc-txt') || {}).textContent : null,
    zStatus: getComputedStyle(st).zIndex, zCover: cov ? getComputedStyle(cov).zIndex : null,
  };
});

// 2) 카메라 끄기
await page.evaluate(() => document.querySelector('#vc-local-box .vs-cam').click());
await new Promise(r => setTimeout(r, 600));
let s = await snap();
console.log('2) 📷 클릭(끄기):', s,
  (!s.camOn && !s.vTrack && s.camOff && s.boxCamOff && s.coverShown === 'flex' && Number(s.zStatus) > Number(s.zCover)) ? '✅' : '❌');

// 3) 카메라 다시 켜기 (덮개 위에서 클릭)
await page.evaluate(() => document.querySelector('#vc-local-box .vs-cam').click());
await new Promise(r => setTimeout(r, 600));
s = await snap();
console.log('3) 📷 재클릭(켜기):', { camOn: s.camOn, vTrack: s.vTrack, camOff: s.camOff, boxCamOff: s.boxCamOff, coverShown: s.coverShown },
  (s.camOn && s.vTrack && !s.camOff && !s.boxCamOff && s.coverShown === 'none') ? '✅' : '❌');

// 4) 마이크 끄기/켜기
await page.evaluate(() => document.querySelector('#vc-local-box .vs-mic').click());
await new Promise(r => setTimeout(r, 600));
s = await snap();
console.log('4) 🎤 클릭(음소거):', { micOn: s.micOn, aTrack: s.aTrack, micOff: s.micOff },
  (!s.micOn && !s.aTrack && s.micOff) ? '✅' : '❌');
await page.evaluate(() => document.querySelector('#vc-local-box .vs-mic').click());
await new Promise(r => setTimeout(r, 600));
s = await snap();
console.log('5) 🎤 재클릭(해제):', { micOn: s.micOn, aTrack: s.aTrack, micOff: s.micOff },
  (s.micOn && s.aTrack && !s.micOff) ? '✅' : '❌');

// 6) 상단 컨트롤바 버튼과 동기화 확인
const btns = await page.evaluate(() => ({
  cam: document.getElementById('vc-btn-cam').textContent,
  mic: document.getElementById('vc-btn-mic') ? document.getElementById('vc-btn-mic').textContent : null,
}));
console.log('6) 상단 버튼 동기화(둘 다 켜짐):', btns, btns.cam === '📷' ? '✅' : '❌');

await browser.close();
if (ownServer) server.close();
process.exit(0);
