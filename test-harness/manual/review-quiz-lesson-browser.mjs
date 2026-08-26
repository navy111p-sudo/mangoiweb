// -*- coding: utf-8 -*-
// 🈶 수업 안 복습퀴즈 «과(진도) 고르기» 브라우저 검사 (2026-08-26)
//
//   왜 브라우저인가 —
//     문자열 하니스는 「그 줄이 있는가」만 본다. 이 기능이 실제로 걸린 곳은 전부
//     «순서»·«어디에 붙었나»·«두 번 눌리면» 같은, 소스만 봐서는 안 보이는 것들이다
//     (CLAUDE.md 2장 「틀린 것이 «순서» 뿐일 때 문자열 하니스는 전부 초록불」).
//
//   무엇을 확인하나 —
//     ① 중국어 수업이면 과 고르기 줄이 생긴다 / ⛔ 영어 수업이면 안 생긴다
//     ② 줄이 #rqv-body «밖» 에 있다 — 안에 넣으면 문항 넘길 때마다 사라진다(#rqv-live 와 같은 이유)
//     ③ 과를 누르면 mangoi_current_lesson 에 저장되고 rqvAuto(true) 가 다시 불린다
//        (그 칸은 예전엔 **저장하는 코드가 저장소 전체에 0곳**이라 늘 0 이었다)
//     ④ ⛔ 물어보기(probe)는 auto_generate:0 — 탭 열 때마다 AI 가 퀴즈를 찍어내면 안 된다
//     ⑤ 언어 버튼이 EN 이면 «한 번만» 中文 으로 돌린다(토글이라 두 번이면 도로 영어)
//     ⑥ 글자가 실제로 읽히는가(WCAG 대비) — 반투명 배경은 «합성» 해서 잰다
//
//   실행: PW_DIR=/tmp/pw node test-harness/manual/review-quiz-lesson-browser.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPlaywright, findChromium } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0; const FAILS = [];
const check = (n, ok) => { if (ok) { pass++; console.log('  ✅ ' + n); } else { fail++; FAILS.push(n); console.log('  ❌ ' + n); } };
const eq = (n, a, b) => check(`${n} (=${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));

const pw = loadPlaywright();
const exe = findChromium();
if (!pw || !exe) {
  console.log('⏭ 건너뜀 — playwright-core 나 Chromium 이 없습니다.');
  console.log('   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core');
  process.exit(0);
}

/* 복습퀴즈 패널의 «뼈대만» 그대로 옮긴 시험판.
   index.html(1.6MB·화상수업 전체)을 띄우지 않는 이유: 여기서 보려는 것은 ⑩절 하나이고,
   전체를 띄우면 카메라·WebSocket 때문에 재현이 들쭉날쭉해진다.
   ⚠️ DOM 구조와 id 는 index.html 8984~9012 와 «같아야» 한다 — 다르면 이 검사가 헛돈다. */
const FIXTURE = (opts) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
<body style="background:#0a1530;color:#e6ecff;margin:0">
  <div class="tab-panel" id="tab-review-quiz" style="display:flex;flex-direction:column;height:100vh">
    <div style="padding:12px 16px;display:flex;gap:10px">
      <span id="rqv-ctx"></span>
      <button id="rqv-lang-btn" onclick="rqvToggleLang()">${opts.langBtn}</button>
    </div>
    <div id="rqv-live" style="display:none"></div>
    <div id="rqv-body" style="flex:1;min-height:0;overflow-y:auto">본문</div>
  </div>
  <script>
    window.__calls = { auto: [], toggle: 0, fetches: [] };
    window.__mangoiCurrentBookId = ${JSON.stringify(opts.book)};
    try { localStorage.setItem('mangoi_current_level', 'Lv 3'); } catch(e){}
    // idx-x8.js 의 전역 세 개를 «같은 이름·같은 모양» 으로 흉내낸다.
    window.rqvAuto = function(force){ window.__calls.auto.push(!!force); return Promise.resolve(); };
    window.rqvLoadList = function(){ return Promise.resolve(); };
    window.rqvOnEnter = function(){ return Promise.resolve(); };
    window.rqvToggleLang = function(){
      window.__calls.toggle++;
      var b = document.getElementById('rqv-lang-btn');
      b.textContent = (b.textContent.indexOf('EN') >= 0) ? '\\uD83C\\uDDE8\\uD83C\\uDDF3 \\u4E2D\\u6587' : '\\uD83C\\uDDEC\\uD83C\\uDDE7 EN';
    };
  <\/script>
  <script defer src="/js/idx-vc-mobilefix.js"><\/script>
</body></html>`;

const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.html': 'text/html; charset=utf-8' };
let fixtureOpts = { book: '다락원 중국어 마스터 3', langBtn: '🇬🇧 EN' };
const server = createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/__fixture') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(FIXTURE(fixtureOpts));
  }
  try {
    const buf = readFileSync(join(PUB, url));
    res.writeHead(200, { 'Content-Type': MIME[extname(url)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

console.log('🈶 복습퀴즈 과 고르기 브라우저 검사 · ' + new Date().toISOString());

const browser = await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

/** 한 번 띄우고, /api/review-quiz/auto 응답을 정해 준 대로 돌려준다. */
async function open(opts, apiResp) {
  fixtureOpts = opts;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });  // ⛔ isMobile 은 켜지 않는다(좌표 함정)
  const page = await ctx.newPage();
  const seen = [];
  await page.route('**/api/review-quiz/auto', async (route) => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    seen.push(body);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiResp) });
  });
  await page.goto(BASE + '/__fixture', { waitUntil: 'networkidle' });
  /* 학생이 복습퀴즈 탭을 «여는» 순간을 흉내낸다 — ⑩절은 idx-x8.js 의 세 입구
     (rqvOnEnter·rqvAuto·rqvLoadList)를 감싸 두었다가 그때 줄을 그린다.
     ⚠️ 이걸 빠뜨리면 «줄이 안 생긴다» 는 거짓 실패가 난다(2026-08-26 실제로 밟음). */
  await page.evaluate(() => window.rqvOnEnter());
  await page.waitForTimeout(500);
  return { ctx, page, seen };
}

const ZH_RESP = { ok: true, matched: false, quiz: null, lang: 'zh', textbook: '중국어 마스터', lessons: [1,2,3,4,5,6,7,8,9,10,11,12,13,14], lesson_no: null };
const EN_RESP = { ok: true, matched: false, quiz: null, lang: 'en', textbook: 'BTS 1 001 (Welcome to school)', lessons: [], lesson_no: null };

// ── ① 중국어 수업 ──────────────────────────────────────────────
console.log('\n[①] 중국어 수업이면 과 고르기 줄이 생긴다');
{
  const { ctx, page, seen } = await open({ book: '다락원 중국어 마스터 3', langBtn: '🇬🇧 EN' }, ZH_RESP);
  check('과 고르기 줄(#rqv-lesson-bar)이 생겼다', await page.locator('#rqv-lesson-bar').count() === 1);
  check('줄이 화면에 실제로 보인다', await page.locator('#rqv-lesson-bar').isVisible());
  const n = await page.locator('#rqv-lesson-bar button').count();
  eq('버튼 개수 = 전체 + 14과', n, 15);
  check('「제1과」 버튼이 있다', (await page.locator('#rqv-lesson-bar').innerText()).includes('제1과'));
  check('「제14과」 버튼이 있다', (await page.locator('#rqv-lesson-bar').innerText()).includes('제14과'));

  // ② 붙은 자리 — #rqv-body «밖» 이어야 한다
  const outside = await page.evaluate(() => {
    var bar = document.getElementById('rqv-lesson-bar'), body = document.getElementById('rqv-body');
    return { insideBody: body.contains(bar), sameParent: bar.parentNode === body.parentNode, before: bar.nextElementSibling === body };
  });
  check('⚠️ 줄이 #rqv-body «안» 에 있지 않다(문항 넘길 때 안 지워짐)', outside.insideBody === false);
  check('줄이 #rqv-body 의 형제이고 바로 앞에 있다', outside.sameParent && outside.before);

  // ④ probe 는 퀴즈를 만들지 않는다
  check('⛔ 물어보기는 auto_generate:0 (탭 열 때 AI 출제 안 함)',
    seen.length > 0 && seen.every(b => b.auto_generate === 0));
  check('물어볼 때 수업 교재를 그대로 넘긴다', seen.some(b => b.textbook === '다락원 중국어 마스터 3'));

  // ⑤ 언어 자동 전환 — 한 번만
  const t = await page.evaluate(() => window.__calls.toggle);
  eq('EN 이면 中文 으로 «한 번만» 돌린다', t, 1);
  eq('그 결과 언어 버튼이 中文 이다', (await page.locator('#rqv-lang-btn').innerText()).includes('中文'), true);
  eq('다음 수업을 위해 mangoi_review_lang 을 zh 로 남긴다',
    await page.evaluate(() => localStorage.getItem('mangoi_review_lang')), 'zh');

  // ③ 과를 누르면 저장 + 다시 조회
  const before = await page.evaluate(() => window.__calls.auto.length);
  await page.locator('#rqv-lesson-bar button', { hasText: '제7과' }).first().click();
  await page.waitForTimeout(250);
  eq('🔴 고른 과가 mangoi_current_lesson 에 «저장» 된다',
    await page.evaluate(() => localStorage.getItem('mangoi_current_lesson')), '7');
  check('누르면 rqvAuto(true) 가 다시 불린다',
    await page.evaluate(() => window.__calls.auto.length) > before &&
    await page.evaluate(() => window.__calls.auto[window.__calls.auto.length - 1] === true));
  const on = await page.evaluate(() => {
    var b = Array.from(document.querySelectorAll('#rqv-lesson-bar button')).find(x => x.textContent.indexOf('제7과') >= 0);
    return getComputedStyle(b).backgroundColor;
  });
  check('고른 과가 강조된다(앰버)', on === 'rgb(251, 191, 36)');

  // 「전체」로 되돌리기
  await page.locator('#rqv-lesson-bar button', { hasText: '전체' }).first().click();
  await page.waitForTimeout(200);
  eq('「전체」를 누르면 0 으로 되돌아간다',
    await page.evaluate(() => localStorage.getItem('mangoi_current_lesson')), '0');

  // ⑥ 글자가 읽히는가 — 반투명 배경은 «합성» 해서 잰다
  const contrast = await page.evaluate(() => {
    function parse(c){ var m=String(c).match(/[\d.]+/g)||[]; return { r:+m[0]||0, g:+m[1]||0, b:+m[2]||0, a:(m[3]==null?1:+m[3]) }; }
    function lum(c){ var f=[c.r,c.g,c.b].map(function(v){ v/=255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }); return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]; }
    var el = document.querySelector('#rqv-lesson-bar button');
    // 🔴 반투명 층을 만나면 멈추지 말고 쌓아 두었다가 아래에서 위로 합성한다
    //    (CLAUDE.md: 그냥 쓰면 멀쩡한 대비를 1.16 으로 잘못 읽는다)
    var layers = [], n = el;
    while (n && n !== document.documentElement) { var c = parse(getComputedStyle(n).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a >= 1) break; } n = n.parentElement; }
    layers.push({ r:255, g:255, b:255, a:1 });
    var bg = layers[layers.length-1];
    for (var i = layers.length-2; i >= 0; i--) { var t = layers[i];
      bg = { r: t.r*t.a + bg.r*(1-t.a), g: t.g*t.a + bg.g*(1-t.a), b: t.b*t.a + bg.b*(1-t.a), a:1 }; }
    var fg = parse(getComputedStyle(el).color);
    var L1 = lum(fg), L2 = lum(bg);
    return Math.round(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))*100)/100;
  });
  check(`버튼 글자 대비 ${contrast}:1 ≥ 4.5 (본문 기준)`, contrast >= 4.5);

  // 문서가 옆으로 안 밀린다 (390px 폰)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('390px 폰에서 문서가 가로로 안 밀린다', overflow === false);
  await ctx.close();
}

// ── ⛔ 영어 수업 ───────────────────────────────────────────────
console.log('\n[⛔] 영어 수업이면 과 고르기 줄이 «안» 생긴다');
{
  const { ctx, page } = await open({ book: 'BTS 1 001 (Welcome to school)', langBtn: '🇬🇧 EN' }, EN_RESP);
  eq('줄이 없다', await page.locator('#rqv-lesson-bar').count(), 0);
  eq('⛔ 언어를 中文 으로 돌리지 않는다', await page.evaluate(() => window.__calls.toggle), 0);
  await ctx.close();
}

// ── 이미 中文 이면 토글하지 않는다 ─────────────────────────────
console.log('\n[⑤-2] 학생이 이미 中文 을 골라 뒀으면 건드리지 않는다');
{
  const { ctx, page } = await open({ book: '다락원 중국어 마스터 3', langBtn: '🇨🇳 中文' }, ZH_RESP);
  eq('토글 0회 (도로 영어가 되면 안 된다)', await page.evaluate(() => window.__calls.toggle), 0);
  eq('그래도 과 고르기 줄은 있다', await page.locator('#rqv-lesson-bar').count(), 1);
  await ctx.close();
}

await browser.close();
server.close();

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 과 고르기 전체 통과 — 중국어 수업에서만 뜨고, 고른 과가 실제로 저장·재조회된다.');
