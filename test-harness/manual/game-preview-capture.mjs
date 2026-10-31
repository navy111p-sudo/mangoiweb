// -*- coding: utf-8 -*-
// game-preview-capture.mjs — 잠긴 게임 «미리보기» 슬라이드를 실제 게임 화면에서 굽는다.
//
//   [무엇]  각 게임을 헤드리스 Chromium 으로 실제로 띄우고, 시작 화면을 눌러 넘긴 뒤
//     플레이 화면을 2장 찍어 cloudflare-deploy/public/img/games/preview/<mode>-1.webp,-2.webp
//     로 저장한다. 그 경로를 js/game-preview.js 의 GAME_PREVIEW 에 적으면 미리보기 창이
//     카드 사진 대신 «진짜 플레이 화면 슬라이드» 를 보여 준다.
//
//   [왜 손으로 찍지 않나]  게임이 21개다. 그리고 게임 화면이 바뀌면 사진도 다시 찍어야 하는데,
//     사람이 21판을 다시 도는 것은 현실적이지 않다. 이 스크립트는 언제든 다시 돌릴 수 있다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   게임 화면을 크게 바꿨을 때 **사람이 불러서** 다시 굽는다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/game-preview-capture.mjs
//       PW_DIR=/tmp/pw ONLY=pizza,tetris node test-harness/manual/game-preview-capture.mjs   # 일부만
//
//   ⚠️ 로그인·서버 데이터가 없으면 게임이 시작 화면에서 멈춘다 → 아래 stub 이 가짜 단어·문장을
//      돌려준다. 실제 학생 데이터는 쓰지 않는다(운영 DB 를 건드리지 않는다).
//   ⚠️ 헤드리스에는 음성합성·마이크가 없다. 없는 채로 두면 «말하기» 게임이 기다리다 멈추므로
//      addInitScript 로 가짜를 심는다.
//   ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 가 된다(CLAUDE.md 2장).
//      그래서 이 파일이 작은 http 서버를 직접 띄운다.
//   ⚠️ WebP 변환은 **브라우저 canvas** 로 한다 — 이 컨테이너에 ImageMagick 이 없다.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const OUT = join(PUB, 'img/games/preview');
await mkdir(OUT, { recursive: true });

// 미리보기 창(.pv-media)이 16:10 이라 뷰포트도 16:10 으로 찍는다 → 잘라낼 필요가 없다
const VW = 1120, VH = 700;
const OW = 720, OH = 450;          // 저장 크기 — 폰에서 충분하고 가볍다
const QUALITY = 0.72;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};

// ── 가짜 학습 데이터 — 게임이 «플레이» 상태까지 가도록만. 운영 DB 는 안 본다. ──
const WORDS = [
  ['apple', '사과'], ['school', '학교'], ['teacher', '선생님'], ['friend', '친구'],
  ['water', '물'], ['music', '음악'], ['garden', '정원'], ['window', '창문'],
  ['bridge', '다리'], ['market', '시장'], ['forest', '숲'], ['rocket', '로켓'],
  ['pencil', '연필'], ['orange', '오렌지'], ['summer', '여름'], ['winter', '겨울'],
].map(([en, ko]) => ({ en, ko }));

const KO = ['나는 매일 아침 학교에 간다', '그녀는 책 읽기를 좋아한다', '우리는 수업 후 축구를 한다',
  '고양이가 탁자 위에 있다', '그는 물을 마시고 싶어 한다', '그들은 나의 가장 친한 친구들이다',
  '우리 선생님은 매우 친절하시다', '나는 커다란 로켓을 볼 수 있다'];
const SENTS = [
  'I go to school every morning', 'She likes to read books', 'We play soccer after class',
  'The cat is on the table', 'He wants to drink water', 'They are my best friends',
  'My teacher is very kind', 'I can see a big rocket',
].map((en, i) => ({ en, ko: KO[i], words: en.split(' ') }));

const stub = (p) => {
  if (p.startsWith('/api/games/en-vocab')) return { ok: true, sentences: SENTS, words: WORDS };
  if (p.startsWith('/api/games/zh-vocab')) return { ok: true, sentences: [], words: [] };
  if (p.startsWith('/api/games/vocab')) return { ok: true, textbook: 'BTS 1 001', level: 'Basic', sentences: SENTS, words: WORDS };
  if (p.startsWith('/api/games/lessons')) return {
    ok: true, glang: 'en', textbook: 'BTS 1 001', level: 'Basic', assigned: true,
    textbooks: ['BTS 1 001'], lessons: [{ lesson_no: 1, count: SENTS.length, sentences: SENTS }],
  };
  if (p.startsWith('/api/games/define')) return { ok: true, ko: '뜻', pinyin: '' };
  if (p.startsWith('/api/games/weak')) return { ok: true, weak: [] };
  if (p.startsWith('/api/games/recommend')) return { ok: false };
  return { ok: true };
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {
    // TTS 는 404 로 — 소리가 없어도 게임은 진행된다
    if (p.includes('tts') || p.includes('/voice/')) { res.writeHead(404).end('no'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(stub(req.url)));
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

const SENT = encodeURIComponent('I go to school every morning');
/* mode · 주소(inline 이면 null — student-games.html 안에서 연다) */
const GAMES = [
  ['spacemonster', '/student-game-space-monster.html'],
  ['avatar', '/student-game-avatar.html?v=1'],
  ['pizza', '/student-game-grammar-pizza.html?v=16'],
  ['escape', '/student-game-escape-voice.html?v=1'],
  ['escapezombie', '/student-game-escape-zombie.html?v=1'],
  ['escapeschool', '/student-game-escape-school.html?v=1'],
  ['tank', '/student-game-tank-battle.html?v=3'],
  ['langace', '/student-game-language-ace.html?v=5'],
  ['p383d', '/student-game-p38-3d.html?v=1'],
  ['battle3d', '/battle-3d.html'],
  ['fish', `/english-mastery-suite.html?game=fish&sentence=${SENT}&lang=ko`],
  ['shooter', `/student-game-shooter.html?sentence=${SENT}&lang=ko`],
  ['suspect', '/suspect-mystery.html'],
  ['speaking', '/speaking-quiz.html'],
  ['wordfighter', '/student-game-wordfighter.html'],
  ['tetris', '/student-game-tetris.html?v=2'],
  ['rescue', '/student-game-rescue-voyage.html?v=1'],
  ['brick', null], ['match', null], ['fill', null], ['balloon', null],
];

// 시작 화면을 넘기는 «흔한 버튼» 글자
const STARTERS = ['영어 모드', 'English', '게임 시작', '시작하기', '시작', 'START', 'Start', 'PLAY',
  '출격', '입장', '들어가기', '플레이', '계속', '확인', '훈련', '실전'];
// 게임마다 시작 화면이 달라 «이 글자를 먼저 눌러라» 를 따로 준다
const HINTS = {
  tetris:      ['영어 모드'],
  // 탈출 3종은 안내문 → «방에 들어가기» 를 한 번 더 눌러야 진짜 방이 나온다.
  // 넓은 후보 목록에 맡기면 엉뚱한 것을 먼저 눌러 안내문에 머문다.
  escape:       ['방에 들어가기', '들어가기'],
  escapeschool: ['학교로 돌아가기', '들어가기'],
  escapezombie: ['실험실로 돌아가기', '실험실로 들어가기', '들어가기'],
  shooter:     ['English', '우주', '게임 시작'],
  fish:        ['English', '시작'],
  p383d:       ['훈련', '출격 START', '출격'],
  rescue:      ['English', '영어'],
  avatar:      ['사이버 셰프 판다', '판다', '시작', '선택'],
  battle3d:    ['영어 배틀', '우주 소녀', '우주 기사', '배틀 시작', '시작'],
  langace:     ['English', '낮', '출격'],
  tank:        ['English', '초원', '전투 시작'],
  wordfighter: ['확인하고 계속하기', '시작'],
};

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({
  executablePath: exe,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
});

/* PNG 버퍼를 720x450 WebP 로 굽는다.
   ⚠️ 이 컨테이너에 ImageMagick 이 없어 브라우저 canvas 로 변환한다. */
const conv = await browser.newPage();
async function toWebp(pngBuf) {
  const b64 = pngBuf.toString('base64');
  const out = await conv.evaluate(async ([src, w, h, q]) => {
    const im = new Image();
    await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = src; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    // object-fit:cover 와 같은 방식으로 채운다 — 비율이 달라도 찌그러지지 않는다
    const s = Math.max(w / im.width, h / im.height);
    const dw = im.width * s, dh = im.height * s;
    g.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return c.toDataURL('image/webp', q).split(',')[1];
  }, ['data:image/png;base64,' + b64, OW, OH, QUALITY]);
  return Buffer.from(out, 'base64');
}

const report = [];
for (const [mode, url] of GAMES) {
  if (ONLY && !ONLY.includes(mode)) continue;
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_logged_user', 'demo');
      localStorage.setItem('mangoi_lang', 'ko');
      localStorage.setItem('mangoi_quest_mode', 'off');      // 인라인 게임을 열려면 잠금이 없어야 한다
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
    } catch (_) {}
    // 헤드리스에는 음성합성·마이크가 없다 — 게임이 그걸 기다리다 멈추지 않게 가짜를 둔다
    try {
      window.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [], addEventListener() {} };
      window.SpeechRecognition = window.webkitSpeechRecognition = function () {
        return { start() {}, stop() {}, abort() {}, addEventListener() {} };
      };
    } catch (_) {}
  });
  const page = await ctx.newPage();
  try {
    if (url) {
      await page.goto(BASE + url, { waitUntil: 'load', timeout: 30000 });
    } else {
      // 인라인 미니게임 — 허브 안에서 연다
      await page.goto(BASE + '/student-games.html', { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.evaluate((m) => { try { hubOpenGame(m); } catch (_) {} }, mode);
    }
  } catch (e) {
    report.push([mode, '× ' + String(e.message).slice(0, 50)]); await ctx.close(); continue;
  }
  await page.waitForTimeout(2500);

  // 시작 화면을 눌러 «플레이 화면» 까지 간다
  let clicked = 0;
  for (const labels of [...(HINTS[mode] || []).map((h) => [h]), STARTERS, STARTERS, STARTERS]) {
    const hit = await page.evaluate((ls) => {
      const vis = (el) => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        // ⚠️ 스크롤 상자 «밖» 이어도 진짜 버튼이다 — top/bottom 으로 자르면 못 찾는다
        //    (슈팅 게임의 시작 버튼이 안내 모달 아래쪽에 있어 실제로 안 눌렸다)
        return r.width > 24 && r.height > 14 && cs.visibility !== 'hidden'
          && cs.display !== 'none' && el.offsetParent !== null;
      };
      // 동의 체크박스를 먼저 켠다 — 안 켜면 «계속» 이 비활성이다(워드 파이터의 보호자 확인)
      document.querySelectorAll('input[type=checkbox]').forEach((c) => {
        if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      // 카드형 선택지는 button 이 아니라 div 인 경우가 많다
      const cands = Array.from(document.querySelectorAll(
        'button, a, [role=button], .btn, [onclick], li, label, [class*=card], [class*=opt], [class*=choice], [class*=select]'));
      for (const el of cands) {
        const t = (el.textContent || '').trim();
        if (!t || t.length > 90 || !vis(el)) continue;
        if (ls.some((l) => t.includes(l))) {
          try { el.scrollIntoView({ block: 'center' }); } catch (_) {}
          el.click(); return t.slice(0, 20);
        }
      }
      return null;
    }, labels);
    if (!hit) continue;
    clicked++;
    await page.waitForTimeout(2200);
  }

  // 📸 두 장 — 시작 직후와 3.5초 뒤. 슬라이드가 «움직이는» 인상을 준다.
  await page.waitForTimeout(1500);
  const a = await toWebp(await page.screenshot());
  await page.waitForTimeout(3500);
  const b = await toWebp(await page.screenshot());
  await writeFile(join(OUT, mode + '-1.webp'), a);
  await writeFile(join(OUT, mode + '-2.webp'), b);
  report.push([mode, `클릭 ${clicked} · ${Math.round(a.length / 1024)}KB + ${Math.round(b.length / 1024)}KB`]);
  await ctx.close();
}

await browser.close();
server.close();
console.log('\n' + '═'.repeat(56));
for (const [m, s] of report) console.log('  ' + m.padEnd(14) + s);
console.log('═'.repeat(56));
console.log('→ ' + OUT);
console.log('\n다음: js/game-preview.js 의 GAME_PREVIEW 에 쓸 만한 것만 적는다.');
console.log('⛔ 시작 화면·설정 화면만 찍힌 게임은 적지 마세요 — 카드 사진 폴백이 낫습니다.');
