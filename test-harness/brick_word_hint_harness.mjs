/**
 * 📖 문장 벽돌 "단어 뜻 말풍선" 검증 하니스 (2026-07-12)
 *
 * 검증 대상: cloudflare-deploy/public/student-games.html (+ index.html 이식본)
 *  - 브릭 클릭 → #brick-word-hint 말풍선(단어 + 한국어 뜻, 중국어는 병음) 표시
 *  - 로컬 사전(_GAME_WORDS/_ZH_WORDS/_EN_WORDS + 기능어) 즉시 조회
 *  - 3.5초 후 자동 사라짐 · 라운드 전환 시 정리
 *
 * 실행: node test-harness/brick_word_hint_harness.mjs
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAMES = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'student-games.html');
const INDEX = path.resolve(__dirname, '..', 'cloudflare-deploy', 'public', 'index.html');
const CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

async function runLang(lang) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
  await page.setViewport({ width: 400, height: 850, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(l => { try { localStorage.setItem('mangoi_game_lang', l); } catch (_) {} }, lang);
  await page.goto('file:///' + GAMES.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 800));

  // ── 로컬 사전 단위 확인 ──
  const dict = await page.evaluate(() => ({
    en_i: (_lookupWordLocal('I') || {}).ko || '',
    en_love: (_lookupWordLocal('love') || {}).ko || '',
    zh_wo: (typeof _ZH_FUNC_KO !== 'undefined' && _ZH_FUNC_KO['我']) || '',
    lang: GAME_LANG,
  }));
  if (lang === 'en') {
    check('en: GAME_LANG=en', dict.lang === 'en', dict.lang);
    check("en: 'I' → 기능어 뜻", dict.en_i === '나는', dict.en_i);
    check("en: 'love' → 어휘 뜻", !!dict.en_love, dict.en_love);
  } else {
    check('zh: GAME_LANG=zh', dict.lang === 'zh', dict.lang);
  }

  // ── 브릭 게임 시작 → 첫 브릭 클릭 ──
  await page.evaluate(() => {
    document.getElementById('hub-menu').style.display = 'none';
    document.getElementById('hub-game').classList.add('active');
    document.getElementById('hub-scorebar').style.display = 'flex';
    _gameState.mode = 'brick';
    gameInit();
  });
  await page.waitForSelector('.brick-btn', { timeout: 15000 });
  // 사전에 있는 단어의 브릭을 우선 클릭(뜻이 확실히 나오는지 보기 위해)
  const picked = await page.evaluate(() => {
    var btns = Array.from(document.querySelectorAll('.brick-btn'));
    var btn = btns.find(b => _lookupWordLocal(b.dataset.word)) || btns[0];
    btn.click();
    return { word: btn.dataset.word, local: !!_lookupWordLocal(btn.dataset.word) };
  });
  await new Promise(r => setTimeout(r, 300));
  const hint = await page.evaluate(() => {
    var el = document.getElementById('brick-word-hint');
    if (!el) return null;
    var r = el.getBoundingClientRect();
    return { text: el.innerText.replace(/\n/g, ' | '), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 };
  });
  check(`${lang}: 클릭 → 말풍선 표시`, !!hint, hint ? hint.text.slice(0, 80) : '말풍선 없음');
  if (hint) {
    check(`${lang}: 말풍선 화면 안`, hint.inView, '');
    check(`${lang}: 단어 포함`, hint.text.indexOf(picked.word) >= 0, picked.word);
    if (picked.local) check(`${lang}: 뜻 즉시 표시(로컬)`, !/뜻 찾는 중|찾지 못했/.test(hint.text), hint.text.slice(0, 80));
    if (lang === 'zh') check('zh: 병음 표시', /\[.+\]/.test(hint.text), hint.text.slice(0, 80));
  }
  // 말풍선 탭 → 재발음(에러 없이) + 자동 사라짐
  const tapOk = await page.evaluate(() => { try { document.getElementById('brick-word-hint').click(); return true; } catch (_) { return false; } });
  check(`${lang}: 말풍선 탭 재발음 무에러`, tapOk, '');
  await new Promise(r => setTimeout(r, 3600));
  const gone = await page.evaluate(() => !document.getElementById('brick-word-hint'));
  check(`${lang}: 3.5초 후 자동 사라짐`, gone, '');
  await page.close();
}

async function runIndexTab() {
  // index.html 쌍둥이: 함수 존재 + 로컬 사전 동작 (게임 탭은 로그인 UI 뒤라 단위 확인만)
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [pageerror:index]', String(e).slice(0, 200)));
  await page.goto('file:///' + INDEX.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  const u = await page.evaluate(() => ({
    fn: typeof _brickShowWordHint === 'function' && typeof _resolveWordHint === 'function',
    i: (_lookupWordLocal('I') || {}).ko || '',
    apple: (_lookupWordLocal('apple') || {}).ko || '',
  }));
  check('index.html: 헬퍼 함수 존재', u.fn, '');
  check("index.html: 'I' 기능어 뜻", u.i === '나는', u.i);
  check("index.html: 'apple' 어휘 뜻", u.apple === '사과', u.apple);
  await page.close();
}

try {
  await runLang('en');
  await runLang('zh');
  await runIndexTab();
} finally {
  await browser.close();
}
const fails = results.filter(r => !r.ok);
console.log(`\n${fails.length ? '❌ FAIL ' + fails.length : '✅ ALL PASS'} (${results.length} checks)`);
process.exit(fails.length ? 1 : 0);
