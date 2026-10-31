// -*- coding: utf-8 -*-
// 📋 수강신청 «이렇게 하세요» 안내 줄 브라우저 검사 (2026-09-24)
//
//   무엇을 보나 — js/adm-enroll-guide.js 가 관리자 › 수강신청 카드에 얹는 안내 줄.
//     · 글: 4단계 + «일괄 등록» 을 사실대로 말하는가(카톡은 «복사», 등록은 «미리보기 뒤 한 번 더»)
//     · 음성: «누를 때만» 나오는가(열자마자 말하면 FAIL) · 다시 누르면 멈추는가
//     · 음소거: 켜면 말하지 않고, 새로고침해도 기억하는가 · 풀면 다시 된다(짝)
//     · 한/영: EN 토글 뒤 글·음성이 영어로 바뀌고 ②④ 번호표가 안 사라지는가
//     · 보인다·눌린다·읽힌다: 관리자 화면의 전역 버튼 규칙·밝기 페인터에 안 먹히는가
//
//   왜 브라우저인가 — 함수도 값도 «있고» 틀리는 것은 «보이는가·언제 말하는가» 뿐이라
//   문자열 하니스로는 원리상 못 본다.
//
//   ⚠️ 자동으로 안 돕니다 — manual/ 규약상 게이트가 물어 가지 않습니다. 사람이 부릅니다:
//        PW_DIR=/tmp/pw node test-harness/manual/enroll-guide-browser.mjs
//      (이 컨테이너는 전역 playwright 가 있어 PW_DIR 없이도 돕니다)
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadPlaywright, findChromium } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8967;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};

function getPw() {
  let pw = loadPlaywright();
  if (!pw) { try { pw = createRequire('/opt/node22/lib/node_modules/')('playwright-core'); } catch { /* 없음 */ } }
  if (!pw) { try { pw = createRequire('/opt/node22/lib/node_modules/playwright/')('playwright-core'); } catch { /* 없음 */ } }
  const exe = findChromium();
  if (!pw || !exe) { console.log('  ⏭ playwright-core 또는 Chromium 없음 — 건너뜁니다.'); process.exit(0); }
  return { chromium: pw.chromium, exe };
}

async function serve() {
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill(); throw new Error('정적 서버를 못 띄웠습니다');
}

// 가짜 speechSynthesis — «무엇을 몇 번 말하려 했나» 를 센다(이 컨테이너엔 소리가 없다)
const SYNTH_STUB = () => {
  const log = { speaks: [], cancels: 0 };
  window.__egLog = log;
  const fake = {
    speaking: false,
    getVoices() { return [{ lang: 'ko-KR', name: 'KO' }, { lang: 'en-US', name: 'EN' }]; },
    resume() {}, pause() {},
    cancel() { log.cancels++; },
    speak(u) { log.speaks.push({ text: u.text, lang: u.lang }); setTimeout(() => { try { u.onend && u.onend(); } catch (e) {} }, 5); },
  };
  try { Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => fake }); } catch (e) {}
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
};

async function openPage(browser, width, keepStorage) {
  const ctx = keepStorage || await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await ctx.newPage();
  await page.addInitScript(SYNTH_STUB);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin' }));
    } catch (e) {}
  });
  await ctx.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"items":[]}' }));
  await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.getElementById('en-guide') && typeof window.jumpToMenu === 'function', null, { timeout: 30000 });
  await page.evaluate(() => { try { window.jumpToMenu('card-enrollments'); } catch (e) {} const d = document.getElementById('card-enrollments'); if (d) d.open = true; });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('en-guide').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  return { ctx, page };
}

// 반투명 층을 아래에서 위로 합성한 배경 위 대비
const contrastOf = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return null;
  const P = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map(x => parseFloat(x)); return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 }; };
  const layers = []; let n = el;
  while (n && n.nodeType === 1) { const c = P(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } n = n.parentElement; }
  let bg = { r: 255, g: 255, b: 255 };
  for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i]; bg = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) }; }
  const fg = P(getComputedStyle(el).color);
  const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const a = L(fg), b = L(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}, sel);

const onTop = (page, sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel); if (!el) return false;
  const r = el.getBoundingClientRect(); if (!r.width) return false;
  const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!t && (t === el || el.contains(t));
}, sel);

(async () => {
  const { chromium, exe } = getPw();
  const srv = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('① PC 1600 — 자리·글·보임');
    const { ctx, page } = await openPage(browser, 1600);
    const pos = await page.evaluate(() => {
      const g = document.getElementById('en-guide'); const grid = document.querySelector('#card-enrollments .enroll-bulk-grid');
      return { visible: !!(g && g.offsetParent), before: !!(g && grid && (g.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING)), text: g ? g.innerText : '' };
    });
    check('안내 줄이 보인다', pos.visible);
    check('두 카드(양식 받기/등록) «위» 에 있다', pos.before);
    check('4단계가 순서대로 있다', /수강신청 메뉴[\s\S]*양식 받기[\s\S]*작성하기[\s\S]*양식 등록/.test(pos.text), pos.text.slice(0, 120));
    check('카톡은 «복사» 라고 사실대로 말한다', /카톡은 양식 글이 복사/.test(pos.text));
    check('«일괄 등록» 을 한 번 더 누른다고 말한다', /일괄 등록/.test(pos.text));
    const badges = await page.evaluate(() => [...document.querySelectorAll('#card-enrollments .enroll-bulk-head .eg-badge')].map(b => b.textContent));
    check('카드 제목 앞 번호표 ②·④', badges.join(',') === '2,4', badges.join(','));

    await page.waitForTimeout(2500);  // 밝기 보정 페인터가 돌 시간을 준다 — 그 «뒤» 가 사람이 보는 색
    const prio = await page.evaluate(() => [...document.querySelectorAll('#en-guide button, #en-guide .eg-num, #card-enrollments .eg-badge')].filter(e => e.style.getPropertyPriority('color') === 'important').length);
    check('밝기 보정 페인터가 글자색을 덮어쓰지 않는다', prio === 0, prio + '개 덮임');
    for (const s of ['#en-guide .eg-title', '#en-guide .eg-note', '#en-guide .eg-shint', '#en-guide button.eg-play', '#en-guide button.eg-mute', '#en-guide button.eg-fold', '#en-guide .eg-num', '#card-enrollments .eg-badge']) {
      const cr = await contrastOf(page, s);
      check(`대비 ≥4.5 ${s} (${cr})`, cr != null && cr >= 4.5);
    }
    const btnStyle = await page.evaluate(() => { const b = document.querySelector('#en-guide button.eg-mute'); const cs = getComputedStyle(b); return { bgImg: cs.backgroundImage, h: Math.round(b.getBoundingClientRect().height) }; });
    check('전역 파란 알약 그라데이션에 안 먹혔다', btnStyle.bgImg === 'none', btnStyle.bgImg);
    check('버튼 높이 ≥ 30px (누르기 쉬움)', btnStyle.h >= 30, btnStyle.h);
    check('🔊 버튼이 맨 위(눌린다)', await onTop(page, '#en-guide button.eg-play'));

    console.log('② 음성 — 누를 때만');
    await page.waitForTimeout(500);
    check('열자마자는 말하지 않는다(자동재생 없음)', (await page.evaluate(() => window.__egLog.speaks.length)) === 0);
    await page.click('#en-guide button.eg-play');
    await page.waitForTimeout(300);
    const sp = await page.evaluate(() => window.__egLog.speaks);
    check('누르면 한국어로 6문장을 읽는다', sp.length === 6 && sp.every(x => x.lang === 'ko-KR'), JSON.stringify(sp.map(x => x.lang)));
    check('읽는 말에도 «일괄 등록» 단계가 있다', sp.some(x => /일괄 등록/.test(x.text)));
    // 읽는 도중 멈추기 — 긴 문장 흉내로 onend 를 막고 다시 누른다
    await page.evaluate(() => { window.__egLog.speaks = []; window.speechSynthesis.speak = function (u) { window.__egLog.speaks.push({ text: u.text, lang: u.lang }); }; });
    await page.click('#en-guide button.eg-play');
    await page.waitForTimeout(150);
    check('읽는 중엔 버튼이 «멈추기» 로 바뀐다', /멈추기/.test(await page.textContent('#en-guide button.eg-play')));
    const c0 = await page.evaluate(() => window.__egLog.cancels);
    await page.click('#en-guide button.eg-play');
    await page.waitForTimeout(150);
    check('다시 누르면 멈춘다(cancel)', (await page.evaluate(() => window.__egLog.cancels)) > c0 && /설명 듣기/.test(await page.textContent('#en-guide button.eg-play')));

    console.log('③ 음소거 — 기억하고, 풀 수 있다');
    await page.click('#en-guide button.eg-mute');
    await page.waitForTimeout(150);
    const mState = await page.evaluate(() => ({ ls: localStorage.getItem('mangoi_enroll_guide_mute'), dis: document.querySelector('#en-guide button.eg-play').disabled }));
    check('음소거하면 저장되고 🔊 가 잠긴다', mState.ls === '1' && mState.dis === true, JSON.stringify(mState));
    const p2 = (await openPage(browser, 1600, ctx)).page;
    await p2.evaluate(() => { const b = document.querySelector('#en-guide button.eg-play'); b.disabled = false; b.click(); });
    await p2.waitForTimeout(200);
    check('새로고침 뒤에도 음소거가 기억되고, 억지로 눌러도 안 읽는다', (await p2.evaluate(() => window.__egLog.speaks.length)) === 0 && /음소거 해제/.test(await p2.textContent('#en-guide button.eg-mute')));
    await p2.click('#en-guide button.eg-mute');
    await p2.waitForTimeout(100);
    await p2.click('#en-guide button.eg-play');
    await p2.waitForTimeout(300);
    check('음소거를 풀면 다시 읽는다(짝)', (await p2.evaluate(() => window.__egLog.speaks.length)) === 6);

    console.log('④ 한/영');
    await p2.evaluate(() => { if (typeof window.toggleAdminLang === 'function') window.toggleAdminLang(); });
    await p2.waitForTimeout(600);
    const en = await p2.evaluate(() => ({ lang: window.adminLang, text: document.getElementById('en-guide').innerText, badges: [...document.querySelectorAll('#card-enrollments .enroll-bulk-head .eg-badge')].map(b => b.textContent).join(',') }));
    check('EN 토글 뒤 안내가 영어로 바뀐다', en.lang === 'en' && /How to register classes/.test(en.text) && /Register all/.test(en.text), en.lang + ' / ' + en.text.slice(0, 60));
    check('EN 토글 뒤에도 번호표 ②④ 가 남는다', en.badges === '2,4', en.badges);
    await p2.evaluate(() => { window.__egLog.speaks = []; });
    await p2.click('#en-guide button.eg-play');
    await p2.waitForTimeout(300);
    const spEn = await p2.evaluate(() => window.__egLog.speaks);
    check('EN 에서는 영어(en-US)로 읽는다', spEn.length === 6 && spEn.every(x => x.lang === 'en-US'));
    await p2.evaluate(() => { if (window.adminLang === 'en' && typeof window.toggleAdminLang === 'function') window.toggleAdminLang(); });

    console.log('⑤ 접기 — 기억한다');
    await p2.waitForTimeout(300);
    await p2.click('#en-guide button.eg-fold');
    await p2.waitForTimeout(150);
    const folded = await p2.evaluate(() => ({ steps: !!document.querySelector('#en-guide .eg-steps'), play: !!document.querySelector('#en-guide button.eg-play') }));
    check('접으면 단계는 숨고 🔊 는 남는다', !folded.steps && folded.play, JSON.stringify(folded));
    const p3 = (await openPage(browser, 1600, ctx)).page;
    check('새로고침 뒤에도 접힌 채', !(await p3.evaluate(() => !!document.querySelector('#en-guide .eg-steps'))));
    await p3.click('#en-guide button.eg-fold');
    await p3.waitForTimeout(100);
    check('다시 펼 수 있다(짝)', await p3.evaluate(() => !!document.querySelector('#en-guide .eg-steps')));
    await ctx.close();

    console.log('⑥ 폰 390');
    const m = await openPage(browser, 390);
    const mob = await m.page.evaluate(() => { const g = document.getElementById('en-guide'); return { over: g.scrollWidth > g.clientWidth + 1, docOver: document.documentElement.scrollWidth > innerWidth + 1, w: Math.round(g.getBoundingClientRect().width) }; });
    check('폰에서 안내 줄이 옆으로 넘치지 않는다', !mob.over, JSON.stringify(mob));
    check('🔊 버튼이 폰에서도 눌린다', await onTop(m.page, '#en-guide button.eg-play'));
    await m.ctx.close();
  } catch (e) {
    fail++; console.log('  ❌ 실행 오류: ' + (e && e.stack || e));
  } finally {
    await browser.close(); srv.kill();
  }
  console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
