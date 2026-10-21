// 👀 A.i영화더빙 «먼저 보기»(감상) — 브라우저 검사 (2026-10-21)
//
//   ⚠️ 자동으로 안 돕니다(manual/ — 게이트가 물어 가지 않음). 사람이 부릅니다:
//      MEDIA_DIR=<webm·wav 가 든 폴더> PW_DIR=/opt/node-tools node test-harness/manual/ai-dubbing-watch-browser.mjs
//
//   왜 «진짜 브라우저» 인가 — 감상에서 틀릴 수 있는 것은 «소리·시간·화면» 이다.
//     원어민 목소리가 나오나 · 효과음·배경음악 엔진이 깨나 · 멈춤이 실제로 멈추나 · 마이크·녹음이 «안» 켜지나
//     · 끝까지 보면 «봤어요» 가 남나 · 더빙과 동시에 돌지 않나 는 문자열 하니스로 원리상 못 본다.
//
//   준비물(MEDIA_DIR) — ai-dubbing-browser.mjs 와 같은 폴더를 쓴다.
//     scene1..6.webm : 장면 영상(VP8/Opus). ⚠️ 이 컨테이너 Chromium 은 H.264(mp4)를 못 튼다 —
//                      /media/dubbing/<편>/scene-N.mp4 를 가로채 sceneN.webm 을 돌려준다.
//     tts.wav        : 원어민 TTS 대신 돌려줄 짧은 소리
//     voice-dino.wav : 동기 장면의 캐릭터 음성·배경음악 파일 대신(.mp3 를 가로챈다)
//   서버 API 는 가짜(스텁)로 대신한다 — /api/voice/tts.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', '..', 'cloudflare-deploy', 'public');
const MEDIA = process.env.MEDIA_DIR || '';
if (!MEDIA || !existsSync(join(MEDIA, 'scene1.webm'))) {
  console.log('⏭  건너뜀 — MEDIA_DIR 에 scene1.webm 등 시험용 미디어가 없습니다(머리말 참고)');
  process.exit(0);
}
const { chromium, exe } = requireBrowser();

let PASS = 0, FAIL = 0;
const check = (name, ok, extra) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
};

/* ── 가짜 서버 ─────────────────────────────────────────────────────────── */
const LOG = { tts: [], manifest: [] };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webm': 'video/webm', '.wav': 'audio/wav' };
function readBody(req) { return new Promise((r) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => r(Buffer.concat(b))); }); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/voice/tts') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      LOG.tts.push({ text: body.text, speaker: body.speaker, lang: body.lang });
      const wav = await readFile(join(MEDIA, 'tts.wav'));
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'X-TTS-Speaker': body.speaker || '', 'X-TTS-Engine': 'stub' });
      return res.end(wav);
    }
    if (p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
    /* 장면 영상 mp4 → 같은 번호의 webm · 소리 파일 mp3 → wav (주소의 번호를 그대로 쓴다 — 손으로 적지 않는다) */
    const mv = /^\/media\/dubbing\/[^/]+\/scene-(\d+)\.mp4$/.exec(p);
    if (mv) {
      res.writeHead(200, { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' });
      return res.end(await readFile(join(MEDIA, 'scene' + (((Number(mv[1]) - 1) % 6) + 1) + '.webm')));
    }
    if (/^\/media\/dubbing\/.+\.mp3$/.test(p)) {
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Access-Control-Allow-Origin': '*' });
      return res.end(await readFile(join(MEDIA, 'voice-dino.wav')));
    }
    if (p.startsWith('/data/dubbing/')) LOG.manifest.push(p);
    const data = await readFile(join(PUB, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const browser = await chromium.launch({ executablePath: exe, args: ['--autoplay-policy=no-user-gesture-required'] });
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.addInitScript(([lang, keep]) => {
    try {
      if (!sessionStorage.getItem('__t')) {
        if (!keep) localStorage.clear();
        sessionStorage.setItem('__t', '1');
        if (lang) localStorage.setItem('mangoi_lang', lang);
      }
    } catch (e) {}
    /* 감상에는 마이크·녹음이 «없어야» 한다 — 부르는 횟수를 센다 */
    window.__probe = { gum: 0, rec: 0, audios: [] };
    try {
      if (navigator.mediaDevices) {
        const g = navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function () { window.__probe.gum++; return g ? g.apply(null, arguments) : Promise.reject(new Error('no')); };
      }
      if (window.MediaRecorder) {
        const MR = window.MediaRecorder;
        window.MediaRecorder = function () { window.__probe.rec++; return new MR(...arguments); };
        window.MediaRecorder.isTypeSupported = MR.isTypeSupported.bind(MR);
      }
      /* 동기 장면의 소리 파일 — 만들어진 Audio 를 붙잡아 «음소거 안 됨» 을 본다 */
      const A0 = window.Audio;
      window.Audio = function () { const a = new A0(...arguments); window.__probe.audios.push(a); return a; };
      window.Audio.prototype = A0.prototype;
    } catch (e) {}
  }, [opts.lang || '', !!opts.keep]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  return { ctx, page, errs };
}
const until = async (page, fn, arg, ms = 30000) => {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 150 }); return true; } catch { return false; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickSafe = async (page, sel) => { try { await page.click(sel, { timeout: 4000 }); return true; } catch { return false; } };

console.log('👀 ai-dubbing-watch-browser');

/* ── ① 먼저 보기 칸 ───────────────────────────────────────────────────── */
console.log('\n── ① 먼저 보기 칸 · 안 본 에피소드 권하기 · 소리 설정');
const A = await newPage();
await A.page.goto(BASE + '/ai-dubbing.html?ep=dub-001');
check('①-1 먼저 보기 칸이 열린다', await until(A.page, () => !document.getElementById('dub-watch-panel').hidden));
await until(A.page, () => !document.getElementById('dub-w-all').hidden, null, 8000);
const P1 = await A.page.evaluate(() => ({
  dots: document.querySelectorAll('#dub-w-seen .wd').length,
  on: document.querySelectorAll('#dub-w-seen .wd.on').length,
  film: document.getElementById('dub-w-film').innerText,
  filmOff: document.getElementById('dub-w-film').disabled,
  all: document.getElementById('dub-w-all').innerText,
  allHidden: document.getElementById('dub-w-all').hidden,
  watchBtns: [...document.querySelectorAll('#dub-scenes button[data-watch]')].filter((b) => !b.disabled).length,
  nudgeBtn: !!document.querySelector('#dub-nudge button[data-watch]'),
  nudgeHidden: document.getElementById('dub-nudge').hidden,
  snd: ['music', 'sfx', 'ko'].map((k) => document.getElementById('dub-snd-' + k).checked),
}));
check('①-2 본 에피소드 점 6개 · 처음엔 하나도 안 켜짐', P1.dots === 6 && P1.on === 0, P1);
check('①-3 «이 작품 에피소드 6개 이어 보기» 가 눌린다', /6/.test(P1.film) && !P1.filmOff, P1.film);
check('①-4 «모든 작품 이어 보기 (6편)» 이 보인다', !P1.allHidden && /6/.test(P1.all), P1.all);
check('①-5 에피소드 카드마다 «👀 보기» 6개', P1.watchBtns === 6, P1.watchBtns);
check('①-6 고른 에피소드를 안 봤으면 «먼저 보기» 를 권한다', !P1.nudgeHidden && P1.nudgeBtn);
check('①-7 소리 설정은 기본으로 다 켜짐', P1.snd.every(Boolean), P1.snd);

/* ── ② 한 에피소드 보기 — 끝까지 ───────────────────────────────────────── */
console.log('\n── ② 에피소드 1 «👀 보기» — 원어민 목소리·효과음·끝까지 보면 «봤어요»');
LOG.tts.length = 0;
await A.page.click('#dub-scenes button[data-watch="0"]');
check('②-1 무대가 «감상» 조작줄로 열린다(더빙 줄·마이크 막대는 숨김)', await until(A.page, () => {
  const g = (id) => document.getElementById(id);
  return !g('dub-player').hidden && !g('dub-w-row').hidden && g('dub-d-row').hidden && g('dub-meter-wrap').hidden;
}, null, 8000));
check('②-2 제목 카드가 «EP 1» 과 에피소드 이름을 보여 준다', await until(A.page, () => {
  const c = document.getElementById('dub-tcard');
  return !c.hidden && /EP 1/.test(document.getElementById('dub-tc-t').textContent) && document.getElementById('dub-tc-s').textContent.length > 0;
}, null, 6000));
check('②-3 더빙 버튼들이 잠긴다(동시에 못 돈다)', await A.page.evaluate(() =>
  document.getElementById('dub-start').disabled && document.getElementById('dub-w-film').disabled
  && [...document.querySelectorAll('#dub-scenes button')].every((b) => b.disabled)));
check('②-4 자막이 원어민 대사로 뜬다(🎤 학생 표시 없음)', await until(A.page, () => {
  const s = document.getElementById('dub-sub');
  return !s.hidden && document.getElementById('dub-sub-en').textContent.length > 0 && !s.classList.contains('me')
    && document.getElementById('dub-sub-who').textContent.indexOf('🎤') < 0;
}, null, 12000));
check('②-5 원어민 목소리를 TTS 로 받는다(화자 지정·영어)', LOG.tts.length > 0 && LOG.tts.every((t) => t.lang === 'en' && t.speaker), LOG.tts.slice(0, 2));
const SND = await A.page.evaluate(() => { const m = window.__dub.mix(); return m && m.snd ? m.snd.state() : null; });
check('②-6 배경음악·효과음 엔진이 깨어 돈다(장면 분위기)', !!SND && SND.on && !!SND.mood, SND);
check('②-7 진행 표시 «1 / 1 · 1편 · EP 1»', await A.page.evaluate(() => /^1 \/ 1/.test(document.getElementById('dub-w-prog').textContent)
  && document.getElementById('dub-w-prev').disabled));
const finished2 = await until(A.page, () => !window.__dub.S.watching, null, 60000);
check('②-8 끝까지 보면 무대가 닫히고 잠금이 풀린다', finished2 && await A.page.evaluate(() =>
  document.getElementById('dub-player').hidden && !document.getElementById('dub-start').disabled
  && !document.getElementById('dub-w-film').disabled));
const P2 = await A.page.evaluate(() => ({
  seen: JSON.parse(localStorage.getItem('mangoi_dub_seen_v1') || '{}'),
  mark: !!document.querySelector('#dub-scenes .scene:nth-child(1) .seenmark'),
  mark2: !!document.querySelector('#dub-scenes .scene:nth-child(2) .seenmark'),
  on: document.querySelectorAll('#dub-w-seen .wd.on').length,
  done: !document.getElementById('dub-w-done').hidden && !!document.querySelector('#dub-w-done button[data-act="dub"]'),
  nudgeOk: document.getElementById('dub-nudge').classList.contains('ok'),
  gum: window.__probe.gum, rec: window.__probe.rec,
}));
check('②-9 «봤어요» 가 이 기기에 남는다({dub-001:[1]})', JSON.stringify(P2.seen) === '{"dub-001":[1]}', P2.seen);
check('②-10 본 에피소드 카드에만 «👀 봤어요»', P2.mark && !P2.mark2);
check('②-11 점 하나가 켜진다(1 / 6)', P2.on === 1, P2.on);
check('②-12 «다 봤어요 · 🎤 더빙하러 가기» 안내가 뜬다', P2.done);
check('②-13 고른 에피소드를 봤으면 권하기 대신 «봤어요» 로 바뀐다', P2.nudgeOk);
check('②-14 감상 동안 마이크·녹음은 한 번도 안 켜졌다', P2.gum === 0 && P2.rec === 0, { gum: P2.gum, rec: P2.rec });
await A.page.click('#dub-w-done button[data-act="dub"]');
check('②-15 «더빙하러 가기» 를 누르면 안내가 닫히고 그 에피소드가 골라진다', await A.page.evaluate(() =>
  document.getElementById('dub-w-done').hidden && window.__dub.S.sel === 0));

/* ── ③ 작품 하나 이어 보기 — 멈춤·다음·이전·그만 ────────────────────────── */
console.log('\n── ③ «이 작품 에피소드 6개 이어 보기» — 멈춤·다음·이전·그만');
await A.page.click('#dub-w-film');
check('③-1 진행 «1 / 6»', await until(A.page, () => /^1 \/ 6/.test(document.getElementById('dub-w-prog').textContent), null, 6000));
await until(A.page, () => !document.getElementById('dub-sub').hidden, null, 12000);
await A.page.click('#dub-w-pause');
const p0 = await A.page.evaluate(() => ({ en: document.getElementById('dub-sub-en').textContent, label: document.getElementById('dub-w-pause').innerText, tts: 0 }));
const ttsBefore = LOG.tts.length;
await sleep(2500);
const p1 = await A.page.evaluate(() => ({
  en: document.getElementById('dub-sub-en').textContent,
  paused: window.__dub.watch().state().paused,
  sndPaused: window.__dub.mix().snd.state().paused,
  playing: window.__probe.audios.filter((a) => !a.paused).length,
}));
check('③-2 «⏸ 멈춤» 을 누르면 단추가 «▶ 이어 보기» 로', /이어 보기|Resume/.test(p0.label), p0.label);
check('③-3 멈춘 동안 대사가 넘어가지 않는다(2.5초)', p1.en === p0.en && p1.paused, { p0: p0.en, p1 });
check('③-4 멈춘 동안 소리(목소리·효과음 엔진)가 멈춘다', p1.sndPaused && p1.playing === 0, p1);
check('③-5 멈춘 동안 새 목소리를 받지 않는다', LOG.tts.length === ttsBefore, { before: ttsBefore, after: LOG.tts.length });
await A.page.click('#dub-w-pause');
check('③-6 이어 보면 대사가 다시 흐른다', await until(A.page, (en) => document.getElementById('dub-sub-en').textContent !== en || document.getElementById('dub-sub').hidden, p0.en, 12000));
await A.page.click('#dub-w-next');
check('③-7 «⏭ 다음» → «2 / 6»', await until(A.page, () => /^2 \/ 6/.test(document.getElementById('dub-w-prog').textContent), null, 6000));
await A.page.click('#dub-w-prev');
check('③-8 «⏮ 이전» → «1 / 6»', await until(A.page, () => /^1 \/ 6/.test(document.getElementById('dub-w-prog').textContent), null, 6000));
await A.page.click('#dub-w-stop');
check('③-9 «⏹ 그만 보기» 를 누르면 곧바로 닫힌다', await until(A.page, () => !window.__dub.S.watching && document.getElementById('dub-player').hidden, null, 8000));
check('③-10 중간에 그만두면 «다 봤어요» 안내는 안 뜬다', await A.page.evaluate(() => document.getElementById('dub-w-done').hidden));
check('③-11 넘기거나 그만둔 에피소드는 «봤어요» 로 안 남는다', await A.page.evaluate(() =>
  JSON.stringify(JSON.parse(localStorage.getItem('mangoi_dub_seen_v1') || '{}')) === '{"dub-001":[1]}'));

/* ── ④ 모든 작품 이어 보기 ──────────────────────────────────────────────── */
console.log('\n── ④ «모든 작품 이어 보기» — 6편 매니페스트를 정본으로 읽어 36개를 잇는다');
LOG.manifest.length = 0;
await A.page.click('#dub-w-all');
check('④-1 진행 «1 / 36»', await until(A.page, () => /^1 \/ 36/.test(document.getElementById('dub-w-prog').textContent), null, 15000),
  await A.page.evaluate(() => document.getElementById('dub-w-prog').textContent));
check('④-2 다른 5편 매니페스트를 받는다(지금 편은 다시 안 받음)', ['dub-002', 'dub-003', 'dub-004', 'dub-005', 'dub-006'].every((id) => LOG.manifest.some((m) => m.indexOf(id) >= 0))
  && !LOG.manifest.some((m) => m.indexOf('dub-001') >= 0), LOG.manifest);
/* 4편(동기 장면) 첫 에피소드 = 19번째로 건너뛴다 */
for (let k = 0; k < 18; k++) { await clickSafe(A.page, '#dub-w-next'); await sleep(120); }
check('④-3 다음을 18번 → «19 / 36 · 4편 · EP 1»', await until(A.page, () => /^19 \/ 36 · (4편|Film 4)/.test(document.getElementById('dub-w-prog').textContent), null, 10000),
  await A.page.evaluate(() => document.getElementById('dub-w-prog').textContent));
check('④-4 4편 제목 카드가 그 편 이름을 말한다', await until(A.page, () => /4편/.test(document.getElementById('dub-tc-k').textContent), null, 4000));
const syncOk = await until(A.page, () => window.__probe.audios.filter((a) => /\.mp3/.test(a.src) && !a.paused).length >= 5, null, 15000);
const SY = await A.page.evaluate(() => window.__probe.audios.filter((a) => /\.mp3/.test(a.src) && !a.paused).map((a) => ({ src: a.src.split('/').pop(), muted: a.muted, t: Math.round(a.currentTime * 10) / 10 })));
check('④-5 동기 장면은 캐릭터 음성 파일 5개가 함께 흐른다(아무도 음소거 안 함)', syncOk && SY.length >= 5 && SY.every((x) => !x.muted), SY);
check('④-6 동기 장면 자막이 영상 시각에 맞춰 뜬다', await until(A.page, () => !document.getElementById('dub-sub').hidden, null, 12000));
await A.page.click('#dub-w-stop');
check('④-7 그만 보기 → 닫힘 · 소리 파일 정리', await until(A.page, () => !window.__dub.S.watching, null, 8000)
  && await A.page.evaluate(() => window.__probe.audios.filter((a) => /\.mp3/.test(a.src) && !a.paused).length === 0));

/* ── ⑤ 6편(배경음악 파일 + 동기) ────────────────────────────────────────── */
console.log('\n── ⑤ 6편 — 배경음악 파일 · «🎵 배경음악» 끄기가 파일에도 걸린다');
const B = await newPage();
await B.page.goto(BASE + '/ai-dubbing.html?ep=dub-006');
await until(B.page, () => !document.getElementById('dub-watch-panel').hidden);
await B.page.click('#dub-scenes button[data-watch="0"]');
const bgmOk = await until(B.page, () => window.__probe.audios.filter((a) => /bgm\.mp3/.test(a.src) && !a.paused).length === 1, null, 15000);
const B1 = await B.page.evaluate(() => {
  const m = window.__dub.mix(); const st = m && m.snd ? m.snd.state() : null;
  return { voices: window.__probe.audios.filter((a) => /\.mp3/.test(a.src) && !/bgm/.test(a.src) && !a.paused).length, st };
});
check('⑤-1 배경음악 파일 1개 + 캐릭터 음성 3개가 흐른다', bgmOk && B1.voices === 3, B1);
/* musicOn 은 «🎵 설정» 이고 on·timer 가 «지금 합성 음악이 도는가» 다 — 설정은 켜진 채(파일은 들려야 함) 합성 음악만 쉰다 */
check('⑤-2 배경음악 파일이 있으면 합성 음악은 쉰다(겹치지 않게)', !!B1.st && B1.st.musicOn === true && B1.st.on === false && !B1.st.timer, B1.st);
await B.page.click('#dub-w-stop');
await until(B.page, () => !window.__dub.S.watching, null, 8000);

/* ── ⑥ 소리 설정 · 한글 자막 ────────────────────────────────────────────── */
console.log('\n── ⑥ 소리 설정 — 기억 · 한글 자막 끄기');
await B.page.click('#dub-snd-ko');
await B.page.click('#dub-snd-music');
const S6 = await B.page.evaluate(() => ({
  noko: document.getElementById('dub-stage').classList.contains('noko'),
  saved: JSON.parse(localStorage.getItem('mangoi_dub_snd_v1') || 'null'),
  musicOn: window.__dub.mix().snd.state().musicOn,
}));
check('⑥-1 «한글 자막» 끄면 무대 한글 줄이 숨는다', S6.noko, S6);
check('⑥-2 끈 설정이 이 기기에 남는다', S6.saved && S6.saved.ko === false && S6.saved.music === false && S6.saved.sfx === true, S6.saved);
check('⑥-3 «🎵 배경음악» 끄면 엔진의 음악도 꺼진다', S6.musicOn === false, S6);
await B.page.reload();
await until(B.page, () => !document.getElementById('dub-watch-panel').hidden);
check('⑥-4 다시 열어도 그대로(체크 칸·한글 자막)', await B.page.evaluate(() =>
  !document.getElementById('dub-snd-ko').checked && !document.getElementById('dub-snd-music').checked
  && document.getElementById('dub-snd-sfx').checked && document.getElementById('dub-stage').classList.contains('noko')));

/* ── ⑦ 영어로 처음 연 화면 ──────────────────────────────────────────────── */
console.log('\n── ⑦ 영어로 저장된 학생이 처음 연 화면');
const E = await newPage({ lang: 'en' });
await E.page.goto(BASE + '/ai-dubbing.html?ep=dub-001');
await until(E.page, () => !document.getElementById('dub-watch-panel').hidden);
await sleep(800);
const E1 = await E.page.evaluate(() => ({
  film: document.getElementById('dub-w-film').innerText, seen: document.getElementById('dub-w-seen').innerText,
  nudge: document.getElementById('dub-nudge').innerText, watch: document.querySelector('#dub-scenes button[data-watch="0"]').innerText,
}));
check('⑦-1 먼저 보기 칸 글자가 영어', /Watch all 6 episodes/.test(E1.film) && /Watched/.test(E1.seen) && /Watch/.test(E1.watch), E1);
check('⑦-2 권하기 글자도 영어', /Watch first/.test(E1.nudge), E1.nudge);

/* ── ⑧ 폰 폭 ─────────────────────────────────────────────────────────── */
console.log('\n── ⑧ 폰 폭(390) — 감상 단추가 화면 안에 · 가로 넘침 없음');
const F = await newPage({ viewport: { width: 390, height: 844 } });
await F.page.goto(BASE + '/ai-dubbing.html?ep=dub-001');
await until(F.page, () => !document.getElementById('dub-watch-panel').hidden);
await F.page.click('#dub-w-film');
await until(F.page, () => !document.getElementById('dub-w-row').hidden, null, 6000);
await sleep(900);
const F1 = await F.page.evaluate(() => {
  const ids = ['dub-w-prev', 'dub-w-pause', 'dub-w-next', 'dub-w-stop'];
  return {
    over: document.documentElement.scrollWidth > innerWidth + 1,
    btns: ids.map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: Math.round(r.width), right: Math.round(r.right), h: Math.round(r.height) }; }),
  };
});
check('⑧-1 가로 넘침 없음', !F1.over);
check('⑧-2 감상 단추 넷이 화면 안 · 누를 만한 크기(높이 ≥ 36)', F1.btns.every((b) => b.right <= 390 && b.w > 40 && b.h >= 36), F1.btns);
await F.page.click('#dub-w-stop');

const allErrs = [...A.errs, ...B.errs, ...E.errs, ...F.errs];
check('⑨ 화면 오류(pageerror) 0건', allErrs.length === 0, allErrs.slice(0, 5));

await browser.close();
server.close();
console.log('\n👀 ai-dubbing-watch-browser — PASS ' + PASS + ' / FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
