// 🎬 A.i영화더빙 6편(dub-006) — 브라우저 검사 (2026-10-20)
//
//   ⚠️ 자동으로 안 돕니다(manual/ — 게이트가 물어 가지 않음). 사람이 부릅니다:
//      PW_DIR=/opt/node-tools node test-harness/manual/ai-dubbing-ep6-browser.mjs
//
//   6편은 이 사이트에서 처음으로 «완성(final) · 동기(synced) · 캐릭터별 음성 파일(스템)» 로 도는 편이다.
//   문자열 하니스(ai_dubbing_harness ⑥-c)는 매니페스트 «모양» 을 보고, 여기서는 실제 화면이
//     ① 6장면을 «영상에 맞춰 진행» 으로 보여 주는가
//     ② 고를 수 있는 캐릭터가 하나·마테오·지비 셋뿐인가(위스커스 선장은 손님 — 칩이 없다)
//     ③ 장면을 틀면 BGM + 캐릭터 음성 트랙이 실제로 돌고, 학생이 고른 캐릭터만 0 인가
//     ④ 손님(위스커스)이 말하는 장면 4에서도 손님 음성은 그대로 나오는가
//     ⑤ TTS 를 한 번도 부르지 않는가 · 페이지 오류 0건인가
//   를 본다.
//
//   ⚠️ 이 컨테이너 Chromium 은 H.264(mp4)를 못 튼다 — 장면 mp4 요청을 가로채 같은 장면의 webm 을 돌려준다.
//      webm 이 없으면 ffmpeg(libvpx)로 임시 폴더에 만든다. 그것도 안 되면 «건너뜀».
//      (MEDIA_DIR 을 주면 거기서 scene-1..6.webm · mic.wav 를 찾는다)
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', '..', 'cloudflare-deploy', 'public');
const EP = JSON.parse(await readFile(join(PUB, 'data', 'dubbing', 'dub-006.json'), 'utf8'));

/* ── 시험용 webm 준비 ─────────────────────────────────────────────────── */
let MEDIA = process.env.MEDIA_DIR || '';
const haveAll = (d) => d && [1, 2, 3, 4, 5, 6].every((n) => existsSync(join(d, 'scene-' + n + '.webm'))) && existsSync(join(d, 'mic.wav'));
if (!haveAll(MEDIA)) {
  MEDIA = join(tmpdir(), 'mangoi-dub006-webm');
  await mkdir(MEDIA, { recursive: true });
  const ff = (args) => spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { stdio: 'inherit' }).status === 0;
  let ok = true;
  for (const s of EP.scenes) {
    const out = join(MEDIA, 'scene-' + s.no + '.webm');
    if (existsSync(out)) continue;
    ok = ok && ff(['-i', join(PUB, s.video), '-vf', 'scale=640:360', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '600k', '-an', out]);
  }
  if (!existsSync(join(MEDIA, 'mic.wav'))) {
    ok = ok && ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1.4', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
      '-filter_complex', '[0:a]aresample=48000[a];[1:a]atrim=0:2.6[b];[a][b]concat=n=2:v=0:a=1', '-c:a', 'pcm_s16le', join(MEDIA, 'mic.wav')]);
  }
  if (!ok || !haveAll(MEDIA)) { console.log('⏭  건너뜀 — webm 을 만들 수 없습니다(ffmpeg libvpx 필요 · 또는 MEDIA_DIR)'); process.exit(0); }
}
const { chromium, exe } = requireBrowser();

let PASS = 0, FAIL = 0;
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 가짜 서버 — public/ 을 그대로 서빙, 장면 mp4 만 webm 으로 ────────────── */
const LOG = { tts: 0, mp3: new Set() };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (p === '/api/voice/tts') { LOG.tts++; res.writeHead(500); return res.end(''); }
    if (p === '/api/voice/transcribe') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"text":"I can do it"}'); }
    if (p === '/api/voice/coach') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true,"scores":{"overall":80,"accuracy":80,"fluency":80},"feedback":"ok"}'); }
    if (p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
    const m = /^\/media\/dubbing\/dub-006\/scene-(\d)\.mp4$/.exec(p);
    if (m) { res.writeHead(200, { 'Content-Type': 'video/webm' }); return res.end(await readFile(join(MEDIA, 'scene-' + m[1] + '.webm'))); }
    if (/^\/media\/dubbing\/dub-006\/.+\.mp3$/.test(p)) LOG.mp3.add(p);
    const data = await readFile(join(PUB, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + join(MEDIA, 'mic.wav'), '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.grantPermissions(['microphone'], { origin: BASE });
await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('__t')) { localStorage.clear(); sessionStorage.setItem('__t', '1'); } } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
const until = async (fn, arg, ms = 30000) => { try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch { return false; } };

console.log('🎬 ai-dubbing-ep6-browser');
console.log('  (Chromium mp3: ' + await page.evaluate(() => new Audio().canPlayType('audio/mpeg')) + ')');

/* ── ① 불러오기 ─────────────────────────────────────────────────────────── */
console.log('\n── ① 불러오기 · 장면 6개 · 동기 표시');
await page.goto(BASE + '/ai-dubbing.html?ep=dub-006');
check('①-1 학생 명단 칸이 열린다', await until(() => !document.getElementById('dub-cast-panel').hidden));
check('①-2 6편 제목을 말하고 오류 표시가 없다', await page.evaluate(() => {
  const st = document.getElementById('dub-status');
  return /감동의 해피엔딩/.test(st.innerText) && !st.classList.contains('err');
}));
check('①-3 6장면 모두 «이 장면 더빙» 버튼이 눌린다', await page.evaluate(() =>
  [...document.querySelectorAll('#dub-scenes button[data-scene]')].filter((b) => !b.disabled).length === 6));
check('①-4 «영상에 맞춰 진행» 으로 표시', await page.evaluate(() => /영상에 맞춰 진행/.test(document.getElementById('dub-scenes').innerText)));

/* ── ② 캐릭터 칩 — 손님 제외 ─────────────────────────────────────────────── */
console.log('\n── ② 고를 수 있는 캐릭터');
const chips = await page.evaluate(() => [...new Set([...document.querySelectorAll('#dub-cast .chip[data-c]')].map((c) => c.dataset.c))].sort());
check('②-1 칩은 hana·mateo·zibi 셋뿐(위스커스 선장은 손님 — 칩 없음)', JSON.stringify(chips) === JSON.stringify(['hana', 'mateo', 'zibi']), chips);
await page.click('#dub-cast .chip[data-i="0"][data-c="hana"]');
const mute = await page.evaluate(() => (document.querySelector('#dub-cast .mutesum') || {}).innerText || '');
check('②-2 음소거 요약: 학생 = 하나, 원어민 = 마테오·지비', /학생이 말해요[^\n]*하나/.test(mute) && /원어민이 말해요[^\n]*마테오/.test(mute) && /원어민이 말해요[^\n]*지비/.test(mute), mute);

/* ── ③ 장면 1 재생 — 트랙과 음소거 ──────────────────────────────────────── */
async function runScene(idx, label) {
  await page.click('#dub-scenes button[data-scene="' + idx + '"]');
  const going = await until(() => {
    const r = window.__dub.S.run; return !!(r && r.tracks && r.tracks.length && r.tracks.every((t) => t.el.currentTime > 0.5));
  }, null, 20000);
  const T = await page.evaluate(() => (window.__dub.S.run ? window.__dub.S.run.tracks.map((t) => ({ kind: t.kind, cid: t.cid, g: t.route.gain ? t.route.gain.gain.value : (t.el.muted ? 0 : 1), paused: t.el.paused, err: t.el.error && t.el.error.code })) : []));
  const vid = await page.evaluate(() => { const v = document.getElementById('dub-video'); return { w: v.videoWidth, t: v.currentTime, muted: v.muted }; });
  return { going, T, vid };
}
console.log('\n── ③ 장면 1 (하나·마테오·지비)');
const S1 = await runScene(0);
check('③-1 BGM + 음성 3줄이 영상과 함께 돈다(mp3 가 실제로 재생)', S1.going && S1.T.length === 4 && S1.T.every((t) => !t.paused && !t.err), S1.T);
check('③-2 BGM 트랙이 있다(크기 1)', S1.T.filter((t) => t.kind === 'bgm').length === 1 && S1.T.find((t) => t.kind === 'bgm').g === 1, S1.T);
check('③-3 학생이 고른 하나만 0, 마테오·지비는 1',
  S1.T.find((t) => t.cid === 'hana')?.g === 0 && S1.T.find((t) => t.cid === 'mateo')?.g === 1 && S1.T.find((t) => t.cid === 'zibi')?.g === 1, S1.T);
check('③-4 영상이 실제로 그려진다(webm 대체)', S1.vid.w > 0 && S1.vid.t > 0.5, S1.vid);
check('③-5 videoAudio=mute 라 원본 영상 소리는 꺼져 있다', S1.vid.muted === true, S1.vid);
check('③-6 하나 대사 구간에 학생 표시(🎤) 자막', await until(() => {
  const s = document.getElementById('dub-sub'); return !s.hidden && s.classList.contains('me');
}, null, 20000));
check('③-7 장면 끝에서 멈춘다', await until(() => !window.__dub.S.run, null, 40000));

/* ── ④ 장면 4 — 손님 위스커스 ───────────────────────────────────────────── */
console.log('\n── ④ 장면 4 (위스커스 선장 = 손님)');
const S4 = await runScene(3);
const wk = S4.T.find((t) => t.cid === 'whiskers');
check('④-1 손님 위스커스 음성 트랙이 돈다(크기 1 — 학생이 고를 수 없으니 언제나 원어민)', S4.going && !!wk && wk.g === 1 && !wk.paused, S4.T);
check('④-2 그 장면의 학생 캐릭터(하나)만 0', S4.T.find((t) => t.cid === 'hana')?.g === 0, S4.T);
await page.click('#dub-stop').catch(() => {});
await until(() => !window.__dub.S.run, null, 15000);

/* ── ⑤ 전체 ─────────────────────────────────────────────────────────────── */
console.log('\n── ⑤ TTS · 오류');
check('⑤-1 동기·스템 편은 TTS 를 한 번도 부르지 않는다', LOG.tts === 0, LOG.tts);
check('⑤-2 완성(final)이라 «미리보기» 안내를 띄우지 않는다', await page.evaluate(() => document.getElementById('dub-stage-note').hidden));
check('⑤-3 받은 mp3 는 전부 이 편 폴더(/media/dubbing/dub-006/)', LOG.mp3.size >= 8 && [...LOG.mp3].every((p) => p.startsWith('/media/dubbing/dub-006/')), [...LOG.mp3]);
check('⑤-4 페이지 오류 0건', errs.length === 0, errs);

await browser.close();
server.close();
console.log(`\n🎬 ai-dubbing-ep6-browser — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
