// 🎬 A.i영화더빙 — 브라우저 검사 (2026-10-20)
//
//   ⚠️ 자동으로 안 돕니다(manual/ — 게이트가 물어 가지 않음). 사람이 부릅니다:
//      MEDIA_DIR=<webm·wav 가 든 폴더> PW_DIR=/opt/node-tools node test-harness/manual/ai-dubbing-browser.mjs
//
//   왜 «진짜 브라우저» 인가 — 이 화면에서 틀릴 수 있는 것은 거의 다 «소리·시간·화면» 이다.
//     누가 말하나(음소거)·마이크가 열리나·채점이 돌아오나·완성 영상이 실제로 구워지나는
//     문자열 하니스(ai_dubbing_harness)로는 원리상 못 본다.
//
//   준비물(MEDIA_DIR) —
//     scene1..6.webm  : 장면 영상(VP8/Opus). ⚠️ 이 컨테이너 Chromium 은 H.264(mp4)를 못 튼다 —
//                       그래서 CloudFront 주소를 가로채 같은 장면의 webm 을 돌려준다(내용은 같은 클립).
//     tts.wav         : 원어민 TTS 대신 돌려줄 짧은 소리
//     voice-dino.wav · voice-mina.wav : 동기 모드 캐릭터 음성(스템)
//     mic.wav         : 가짜 마이크(1.4초 소리 + 2.6초 조용 반복) — «말이 끝나면 다음» 을 재현
//
//   서버 API 는 가짜(스텁)로 대신한다 — /api/voice/tts · transcribe · coach · azure-token.
//   검사 항목은 아래 각 절 머리말.
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
const LOG = { tts: [], transcribe: [], coach: [], manifest: [] };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.webm': 'video/webm', '.wav': 'audio/wav' };
const SYNC_MANIFEST = {
  id: 'test-sync', title: { ko: '동기 시험', en: 'Sync test' }, status: 'final', timing: 'synced',
  characters: {
    dino: { name: { ko: '디노', en: 'Dino' }, emoji: '🦖', ttsSpeaker: 'aries' },
    mina: { name: { ko: '미나', en: 'Mina' }, emoji: '👧', ttsSpeaker: 'thalia' },
  },
  playable: ['dino', 'mina'],
  scenes: [{
    no: 1, label: { ko: '동기 장면', en: 'Synced scene' }, video: '/test-media/scene1.webm', durationSec: 12,
    videoAudio: 'clean', voices: { dino: '/test-media/voice-dino.wav', mina: '/test-media/voice-mina.wav' },
    lines: [
      { id: 'a', speaker: 'dino', en: 'Hello, I am Dino.', ko: '안녕, 나는 디노야.', start: 1.0, end: 3.0 },
      { id: 'b', speaker: 'mina', en: 'Nice to meet you, Dino.', ko: '만나서 반가워, 디노.', start: 4.0, end: 6.0 },
      { id: 'c', speaker: 'dino', en: 'Let us play together.', ko: '같이 놀자.', start: 7.0, end: 9.0 },
    ],
  }],
};
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
    if (p === '/api/voice/transcribe') {
      const body = (await readBody(req)).toString('latin1');
      LOG.transcribe.push({ hasPrompt: /name="prompt"/.test(body), hasLangEn: /name="lang"\r\n\r\nen/.test(body), bytes: body.length });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, text: 'I can do it' }));
    }
    if (p === '/api/voice/coach') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      LOG.coach.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, scores: { overall: 83, accuracy: 80, fluency: 86 }, tier: { emoji: '🌟' }, feedback: 'Nice' }));
    }
    if (p.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"ok":false}'); }
    if (p.startsWith('/data/dubbing/')) LOG.manifest.push(p);
    if (p === '/data/dubbing/test-sync.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(SYNC_MANIFEST)); }
    if (p.startsWith('/test-media/')) {
      const data = await readFile(join(MEDIA, p.slice('/test-media/'.length)));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      return res.end(data);
    }
    const data = await readFile(join(PUB, p === '/' ? '/index.html' : p));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

/* CloudFront 장면 영상 → 같은 장면의 webm (장면 번호는 매니페스트에서 읽는다 — 손으로 적지 않는다) */
const epJson = JSON.parse(await readFile(join(PUB, 'data', 'dubbing', 'dub-001.json'), 'utf8'));
const urlToScene = {};
epJson.scenes.forEach((s) => { urlToScene[s.video] = s.no; });

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    '--use-file-for-fake-audio-capture=' + join(MEDIA, 'mic.wav'), '--autoplay-policy=no-user-gesture-required'],
});
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await ctx.grantPermissions(['microphone'], { origin: BASE });
  await ctx.addInitScript(([lang]) => {
    try { if (!sessionStorage.getItem('__t')) { localStorage.clear(); sessionStorage.setItem('__t', '1'); if (lang) localStorage.setItem('mangoi_lang', lang); } } catch (e) {}
  }, [opts.lang || '']);
  await ctx.route(/cloudfront\.net\//, async (route) => {
    const no = urlToScene[route.request().url()];
    if (!no) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ status: 200, headers: { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*' }, body: await readFile(join(MEDIA, 'scene' + no + '.webm')) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message || e)));
  return { ctx, page, errs };
}
const SHOTS = process.env.SHOTS || '';   // 폴더를 주면 중간 화면을 찍어 둔다(사람이 눈으로 보려고)
const shot = async (page, name, full) => { if (SHOTS) { try { await page.screenshot({ path: join(SHOTS, name + '.png'), fullPage: !!full }); } catch (e) {} } };
const until = async (page, fn, arg, ms = 30000) => {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); return true; } catch { return false; }
};

/* ── ① 화면이 매니페스트를 읽고 무대를 연다 ─────────────────────────────── */
console.log('🎬 ai-dubbing-browser');
console.log('\n── ① 불러오기 · 학생 명단(1~5명) · 음소거 요약');
const A = await newPage();
await A.page.goto(BASE + '/ai-dubbing.html');
check('①-1 학생 명단 칸이 열린다', await until(A.page, () => !document.getElementById('dub-cast-panel').hidden));
check('①-2 제목·미리보기 안내를 말한다', await A.page.evaluate(() => {
  const t = document.getElementById('dub-status').innerText;
  return t.indexOf('공룡이 우리 반에 전학 왔다') >= 0 && !document.getElementById('dub-status').classList.contains('err');
}));
check('①-3 6장면 모두 «이 장면 더빙» 버튼이 눌린다', await A.page.evaluate(() =>
  [...document.querySelectorAll('#dub-scenes button[data-scene]')].filter((b) => !b.disabled).length === 6));
check('①-4 «처음부터 끝까지» 줄이 보인다', await A.page.evaluate(() => !document.getElementById('dub-all-row').hidden));
check('①-5 인원 버튼은 1~5', await A.page.evaluate(() => [...document.querySelectorAll('#dub-cast .cnt')].map((b) => b.dataset.n).join(',') === '1,2,3,4,5'));
await A.page.click('#dub-cast .cnt[data-n="5"]');
check('①-6 5명을 고르면 5줄', await A.page.evaluate(() => document.querySelectorAll('#dub-cast .stu').length === 5));
await A.page.click('#dub-cast .cnt[data-n="2"]');
check('①-7 다시 2명으로 줄이면 2줄', await A.page.evaluate(() => document.querySelectorAll('#dub-cast .stu').length === 2));
await A.page.click('#dub-cast .chip[data-i="0"][data-c="dino"]');
await A.page.click('#dub-cast .chip[data-i="1"][data-c="mina"]');
await A.page.fill('#dub-cast .stu-name[data-i="0"]', 'Amy');
await A.page.fill('#dub-cast .stu-name[data-i="1"]', 'Ben');
const mute = await A.page.evaluate(() => document.querySelector('#dub-cast .mutesum').innerText);
await shot(A.page, '1-cast', true);
check('①-8 음소거 요약: 학생 = 디노·미나, 원어민 = 레오(고르지 않은 캐릭터는 원어민 그대로)',
  /학생이 말해요[^\n]*디노[^\n]*미나/.test(mute) && /원어민이 말해요[^\n]*레오/.test(mute) && !/원어민이 말해요[^\n]*(디노|미나)/.test(mute), mute);
check('①-9 대사가 없는 캐릭터(로보)는 요약에 안 나온다', !/로보/.test(mute), mute);
check('①-10 명단이 기기에 남는다(다음에 열어도 그대로)', await A.page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mangoi_dub_cast_v1:dub-001') || '[]');
  return s.length === 2 && s[0].character === 'dino' && s[1].character === 'mina' && s[0].name === 'Amy';
}));

/* ── ② 장면 1 차례 모드 · 넘어가기 · 채점 · 완성 영상 ───────────────────── */
console.log('\n── ② 장면 1 (차례 모드) — 넘어가기·자동 다음·채점·완성 영상');
LOG.tts.length = 0; LOG.transcribe.length = 0; LOG.coach.length = 0;
await A.page.click('#dub-scenes button[data-scene="0"]');
check('②-1 무대가 열린다', await until(A.page, () => !document.getElementById('dub-player').hidden, null, 8000));
check('②-2 원본 영상 소리는 꺼져 있다(생성기 목소리 차단)', await until(A.page, () => {
  const v = document.getElementById('dub-video'); return !!v.src && v.muted === true;
}, null, 8000));
check('②-3 영상이 실제로 돈다(webm 이 그려짐)', await until(A.page, () => {
  const v = document.getElementById('dub-video'); return v.readyState >= 2 && v.videoWidth > 0 && v.currentTime > 0.2;
}, null, 15000));
check('②-4 학생 차례가 오면 «차례예요» 를 말한다', await until(A.page, () => /차례예요/.test(document.getElementById('dub-turn').innerText), null, 20000));
check('②-5 학생 차례에는 «다 말했어요» 가 눌린다', await A.page.evaluate(() => !document.getElementById('dub-done').disabled));
const firstTurnWho = await A.page.evaluate(() => document.getElementById('dub-turn').innerText);
await A.page.evaluate(() => document.getElementById('dub-player').scrollIntoView({ block: 'start' }));
await shot(A.page, '2-student-turn');
// 첫 학생 차례는 «넘어가기» — 녹음은 버리고 채점하지 않는다
await A.page.waitForTimeout(900);
await A.page.click('#dub-skip');
const finished = await until(A.page, () => !window.__dub.S.run, null, 120000);
check('②-6 장면 1 이 끝까지 돈다(멈추지 않는다)', finished);
const doneScoring = await until(A.page, () => window.__dub.S.results.every((r) => r.status !== 'queued' && r.status !== 'scoring'), null, 40000);
check('②-7 채점이 모두 끝난다', doneScoring);
const R = await A.page.evaluate(() => window.__dub.S.results.map((r) => ({ who: r.studentIdx, sp: r.line.speaker, st: r.status, sc: r.score && r.score.overall })));
check('②-8 학생 대사 4줄(미나 2·디노 2)만 결과에 오른다', R.length === 4 && R.filter((r) => r.sp === 'mina').length === 2 && R.filter((r) => r.sp === 'dino').length === 2, R);
check('②-9 대사마다 «고른 학생» 이 맡았다(디노=Amy, 미나=Ben)', R.every((r) => (r.sp === 'dino' ? r.who === 0 : r.who === 1)), R);
check('②-10 넘어간 첫 줄은 «넘어감» 이고 채점하지 않는다', R[0].st === 'skipped' && !R[0].sc, R[0]);
check('②-11 나머지 3줄은 채점됐다(83점)', R.slice(1).every((r) => r.st === 'done' && r.sc === 83), R);
check('②-12 전사 요청 = 채점한 줄 수(3) · prompt 를 안 보낸다 · lang=en', LOG.transcribe.length === 3 && LOG.transcribe.every((t) => !t.hasPrompt && t.hasLangEn), LOG.transcribe);
check('②-13 로그인 안 했으면 coach 에 guest 로 보낸다', LOG.coach.length === 3 && LOG.coach.every((c) => c.student_uid === 'guest' && !c.token), LOG.coach.map((c) => c.student_uid));
check('②-14 원어민 목소리는 레오(apollo)만 — 학생이 맡은 디노(aries)·미나(thalia) 목소리는 요청조차 안 한다',
  LOG.tts.length >= 1 && LOG.tts.every((t) => t.speaker === 'apollo' && t.lang === 'en'), LOG.tts);
const resTxt = await A.page.evaluate(() => document.getElementById('dub-results').innerText);
check('②-15 결과 화면: 학생별 평균과 «넘어감» 을 그린다', /Amy/.test(resTxt) && /Ben/.test(resTxt) && /83/.test(resTxt) && /넘어감/.test(resTxt), resTxt.slice(0, 200));
const MV = await A.page.evaluate(() => {
  const m = window.__dub.S.movies[0];
  const v = document.querySelector('#dub-movies video'), a = document.querySelector('#dub-movies a[download]');
  return { n: window.__dub.S.movies.length, size: m && m.size, mime: m && m.mime, blob: !!(v && /^blob:/.test(v.src)), dl: a && a.getAttribute('download'),
    panel: !document.getElementById('dub-movies-panel').hidden, fin: !document.getElementById('dub-final').disabled };
});
check('②-16 완성 영상이 구워진다(Blob · 크기 > 50KB · webm)', MV.n === 1 && MV.size > 50000 && /webm/.test(MV.mime || ''), MV);
check('②-17 완성 영상을 화면에서 보고 «저장» 으로 내려받을 수 있다', MV.panel && MV.blob && /^mangoi-dub-001-1\.webm$/.test(MV.dl || ''), MV);
check('②-18 «완성 영상 보기» 버튼이 열린다', MV.fin);
const meta = await A.page.evaluate(() => new Promise((res) => {
  const v = document.querySelector('#dub-movies video');
  if (!v) return res(null);
  const done = () => res({ w: v.videoWidth, h: v.videoHeight, err: v.error && v.error.code });
  if (v.readyState >= 1) return done();
  v.addEventListener('loadedmetadata', done, { once: true }); v.addEventListener('error', done, { once: true });
  setTimeout(done, 6000);
}));
await shot(A.page, '3-results-movie', true);
check('②-19 구워진 영상이 다시 열린다(960×540)', meta && meta.w === 960 && meta.h === 540 && !meta.err, meta);
/* 브라우저가 구운 webm 은 길이 칸이 비어(Infinity) 0:00 으로 보이고 못 넘긴다 — 화면이 끝까지 한 번 찾아가 길이를 채우는가 */
const dur = await A.page.evaluate(() => new Promise((res) => {
  const v = document.querySelector('#dub-movies video');
  if (!v) return res(null);
  const t0 = Date.now();
  (function poll() {
    if (isFinite(v.duration) && v.duration > 0) return res(v.duration);
    if (Date.now() - t0 > 8000) return res(v.duration);
    setTimeout(poll, 200);
  })();
}));
check('②-19b 완성 영상의 길이가 채워진다(0:00 이 아니다 · 넘겨 볼 수 있다)', typeof dur === 'number' && isFinite(dur) && dur > 3, dur);
/* 첫 장면이 로딩되는 동안 검은 화면으로 시작하지 않는가 — 첫 0.3초 프레임의 밝기를 잰다 */
const firstLuma = await A.page.evaluate(() => new Promise((res) => {
  const v = document.querySelector('#dub-movies video');
  if (!v) return res(null);
  const measure = () => {
    try {
      const c = document.createElement('canvas'); c.width = 96; c.height = 54;
      const g = c.getContext('2d'); g.drawImage(v, 0, 0, 96, 54);
      const d = g.getImageData(0, 0, 96, 54).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      res(s / (d.length / 4));
    } catch (e) { res('err:' + e.message); }
  };
  v.addEventListener('seeked', () => setTimeout(measure, 150), { once: true });
  try { v.currentTime = 0.3; } catch (e) { res('err:' + e.message); }
  setTimeout(measure, 4000);
}));
check('②-19c 완성 영상 첫 프레임이 검은 화면이 아니다(밝기 > 12)', typeof firstLuma === 'number' && firstLuma > 12, firstLuma);
const finLabel = await A.page.evaluate(() => document.getElementById('dub-final').textContent);
check('②-19d «완성 영상» 버튼 이름이 «보기» 로 바뀐다', /완성 영상 보기|Watch my movie/.test(finLabel || ''), finLabel);
check('②-20 페이지 오류 0건', A.errs.length === 0, A.errs);
console.log('     (첫 학생 차례 안내: ' + firstTurnWho + ')');

/* ── ③ 그만하기 ─────────────────────────────────────────────────────────── */
console.log('\n── ③ 그만하기');
await A.page.click('#dub-scenes button[data-scene="1"]');
await until(A.page, () => !!window.__dub.S.run, null, 5000);
await A.page.waitForTimeout(2500);
await A.page.click('#dub-stop');
check('③-1 그만하면 곧바로 멈춘다', await until(A.page, () => !window.__dub.S.run, null, 15000));
check('③-2 그만둔 판은 완성 영상으로 남기지 않는다', await A.page.evaluate(() => window.__dub.S.movies.length === 1));
check('③-3 무대가 닫히고 장면 버튼이 다시 눌린다', await A.page.evaluate(() =>
  document.getElementById('dub-player').hidden && [...document.querySelectorAll('#dub-scenes button[data-scene]')].every((b) => !b.disabled)));

/* ── ④ 언어 ─────────────────────────────────────────────────────────────── */
console.log('\n── ④ KO/EN');
await A.page.evaluate(() => { if (typeof window.setLang === 'function') window.setLang('en', 'user'); });
check('④-1 🌐 영어로 바꾸면 명단·장면·결과가 영어로 다시 그려진다', await until(A.page, () => {
  const t = document.body.innerText;
  return /How many students\?/.test(t) && /Dub this scene/.test(t) && /Native voice:/.test(t) && /Skipped/.test(t);
}, null, 5000));
await A.ctx.close();
const E = await newPage({ lang: 'en' });
await E.page.goto(BASE + '/ai-dubbing.html');
check('④-2 영어로 저장된 학생은 «처음 열 때부터» 영어', await until(E.page, () => {
  const t = document.body.innerText;
  return !document.getElementById('dub-cast-panel').hidden && /Dino Comes to School/.test(t) && /Dub this scene/.test(t) && /How many students\?/.test(t);
}, null, 8000));
await E.ctx.close();

/* ── ⑤ 동기 모드 — 캐릭터 음성 스템 · 학생 캐릭터만 0 ────────────────────── */
console.log('\n── ⑤ 동기 모드(영상 시각 + 캐릭터별 음성 파일)');
LOG.tts.length = 0; LOG.transcribe.length = 0;
const Y = await newPage();
await Y.page.goto(BASE + '/ai-dubbing.html?ep=test-sync');
await until(Y.page, () => !document.getElementById('dub-cast-panel').hidden, null, 8000);
check('⑤-1 synced 매니페스트는 «영상에 맞춰 진행» 으로 표시', await Y.page.evaluate(() => /영상에 맞춰 진행/.test(document.getElementById('dub-scenes').innerText)));
await Y.page.click('#dub-cast .chip[data-i="0"][data-c="dino"]');
await Y.page.click('#dub-scenes button[data-scene="0"]');
const gains = await until(Y.page, () => {
  const r = window.__dub.S.run; return !!(r && r.tracks && r.tracks.length === 2 && r.tracks.every((t) => t.el.currentTime > 0.3));
}, null, 15000);
const G = await Y.page.evaluate(() => (window.__dub.S.run ? window.__dub.S.run.tracks.map((t) => ({ cid: t.cid, g: t.route.gain ? t.route.gain.gain.value : null, paused: t.el.paused })) : []));
check('⑤-2 음성 스템 두 줄이 영상과 함께 돈다', gains && G.length === 2 && G.every((t) => !t.paused), G);
check('⑤-3 학생이 고른 디노 음성만 0, 미나는 그대로', G.find((t) => t.cid === 'dino')?.g === 0 && G.find((t) => t.cid === 'mina')?.g === 1, G);
check('⑤-4 «clean» 장면은 영상 소리를 켠다', await Y.page.evaluate(() => document.getElementById('dub-video').muted === false));
check('⑤-5 학생 대사 구간에 디노 대사 자막 + 학생 표시', await until(Y.page, () => {
  const s = document.getElementById('dub-sub'); return !s.hidden && s.classList.contains('me') && /Dino/.test(document.getElementById('dub-sub-en').innerText);
}, null, 8000));
check('⑤-6 미나 대사 구간은 학생 표시가 없다(원어민 차례)', await until(Y.page, () => {
  const s = document.getElementById('dub-sub'); return !s.hidden && !s.classList.contains('me') && /Nice to meet you/.test(document.getElementById('dub-sub-en').innerText);
}, null, 8000));
check('⑤-7 장면 끝에서 멈춘다', await until(Y.page, () => !window.__dub.S.run, null, 25000));
await until(Y.page, () => window.__dub.S.results.every((r) => r.status !== 'queued' && r.status !== 'scoring'), null, 30000);
const YR = await Y.page.evaluate(() => window.__dub.S.results.map((r) => ({ sp: r.line.speaker, st: r.status })));
check('⑤-8 학생 결과는 디노 대사 2줄뿐', YR.length === 2 && YR.every((r) => r.sp === 'dino'), YR);
check('⑤-9 동기 모드(스템)는 TTS 를 부르지 않는다', LOG.tts.length === 0, LOG.tts);
check('⑤-10 완성본(final)에는 «미리보기» 안내를 띄우지 않는다', await Y.page.evaluate(() => document.getElementById('dub-stage-note').hidden));
check('⑤-11 동기 판도 완성 영상이 구워진다', await Y.page.evaluate(() => window.__dub.S.movies.length === 1 && window.__dub.S.movies[0].size > 50000));
check('⑤-12 페이지 오류 0건', Y.errs.length === 0, Y.errs);
await Y.ctx.close();

/* ── ⑥ 못 불러올 때 · 이상한 주소 · 폰 폭 ──────────────────────────────── */
console.log('\n── ⑥ 실패 · 주소 조작 · 폰');
const F = await newPage();
await F.page.goto(BASE + '/ai-dubbing.html?ep=missing-ep');
check('⑥-1 매니페스트가 없으면 «불러오지 못했어요» 를 말한다', await until(F.page, () => document.getElementById('dub-status').classList.contains('err'), null, 8000));
check('⑥-2 그때 장면은 «준비 중» 그대로 — 눌러서 갈 곳이 없다', await F.page.evaluate(() =>
  document.querySelectorAll('#dub-scenes button[data-scene]').length === 0 && document.getElementById('dub-cast-panel').hidden));
LOG.manifest.length = 0;
await F.page.goto(BASE + '/ai-dubbing.html?ep=..%2F..%2Fadmin');
await until(F.page, () => !document.getElementById('dub-cast-panel').hidden, null, 8000);
check('⑥-3 이상한 에피소드 이름은 받지 않고 기본(dub-001)으로', LOG.manifest.length >= 1 && LOG.manifest.every((p) => p === '/data/dubbing/dub-001.json'), LOG.manifest);
await F.ctx.close();
const M = await newPage({ viewport: { width: 390, height: 844 } });
await M.page.goto(BASE + '/ai-dubbing.html');
await until(M.page, () => !document.getElementById('dub-cast-panel').hidden, null, 8000);
check('⑥-4 폰 폭(390)에서 옆으로 넘치지 않는다', await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
  await M.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
await M.page.click('#dub-cast .cnt[data-n="5"]');
await shot(M.page, '4-phone-5students', true);
check('⑥-5 폰에서 5명 명단도 넘치지 않는다', await M.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
await M.ctx.close();

await browser.close();
server.close();
console.log(`\n🎬 ai-dubbing-browser — PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
