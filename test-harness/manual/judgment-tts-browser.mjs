// -*- coding: utf-8 -*-
/**
 * judgment-tts-browser.mjs — 판단력 훈련(judgment.html) 원어민 음성·무음 «진짜 브라우저» 검사
 *   (2026-08-26, 사장님 지시 「원어민 음성 + 듣기 연습 + 무음버튼」)
 *
 * 왜 문자열 하니스로는 모자란가
 *   여기서 깨지는 것은 «순서»와 «좌표»다 — judgment_tts_harness 는 전부 초록불인데도
 *   ① 스피커를 눌렀더니 답까지 골라지고 ② 무음을 켰는데 소리가 계속 나고
 *   ③ 🌐 를 누를 때마다 문장을 다시 읽는 일이 얼마든지 생긴다. 그래서 실제로 눌러 본다.
 *
 * 🪤 밟았던 함정들
 *   · 보기(.opt)가 <button> 이라 스피커를 <button> 으로 넣으면 파서가 바깥 버튼을 먼저 닫는다
 *     → 여기서 «보기 4개가 다 BUTTON 인가» 를 세는 이유.
 *   · 클릭 좌표는 화면 «안» 이어야 한다. 처음엔 보기가 화면 아래에 있어 클릭이 통째로 허공에
 *     떨어졌고 «안 눌린다» 로 오독했다 → 누르기 전에 scrollIntoViewIfNeeded.
 *   · isMobile 문맥은 좌표가 어긋나 멀쩡한 버튼도 «가려졌다» 로 나온다(CLAUDE.md 2장)
 *     → 폭만 좁히고 isMobile 은 켜지 않는다.
 *
 * 돌리는 법 (자동으로 안 돕니다 — 사람이 부릅니다)
 *   mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *   PW_DIR=/tmp/pw node test-harness/manual/judgment-tts-browser.mjs
 */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.JDG_PORT || 8911);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* 씨앗 — 실제 /api/judgment/scenario 응답 모양 그대로 */
const SCENARIO = {
  ok: true,
  situation: 'Your teacher is explaining and you did not hear the last part clearly.',
  options: ['Could you say that again, please?', 'Say it again.', 'What?', 'Repeat please!'],
  correct_index: 0, option_scores: [96, 40, 25, 55], difficulty: 3, sid: 's1',
  skill_tag: 'REGISTER_MISMATCH', reading_band: 3, reading_band_label: 'Lv 5-8', band_mode: 'auto', band_moved: 0,
};
const ANSWER = {
  ok: true, correct: false, choice_score: 60, reasoning_score: 70,
  best_option: 'Could you say that again, please?', chosen_index: 1, correct_index: 0,
  options: SCENARIO.options, option_scores: SCENARIO.option_scores,
  feedback_ko: '조금 더 공손하게 말해 볼까요?', why_chosen_ko: '친구끼리 쓰는 말투예요.',
  misconception: 'REGISTER_MISMATCH',
};

async function serve() {
  try { const r = await fetch(BASE + '/judgment.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/judgment.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

/* 🪤 isMobile 은 켜지 않는다 — 좌표가 어긋나 멀쩡한 버튼이 «가려졌다» 로 나온다(CLAUDE.md 2장) */
async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  // 서버 TTS 는 부르지 않는다 — «무엇을 어떤 목소리로 달라고 했는가» 만 받아 적고 소리는 만든다.
  await page.addInitScript(() => { window.__tts = []; });
  await ctx.route('**/api/voice/tts', async route => {
    let body = {};
    try { body = JSON.parse(route.request().postData() || '{}'); } catch { /* 무시 */ }
    await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(2048) });
    await page.evaluate(b => window.__tts.push(b), body).catch(() => {});
  });
  // 🪤 playwright 의 route 는 «나중에 등록한 것이 먼저» 잡는다. 넓은 그물(judgment 전체)을
  //    뒤에 걸면 시나리오까지 삼켜 «문제를 못 불러왔어요» 가 된다 → 넓은 것 먼저, 구체적인 것 뒤에.
  // ⛔ 주석 안에 glob 을 그대로 적지 말 것 — 별표+슬래시가 블록주석을 «거기서» 닫아
  //    뒷부분이 코드가 되고 「api is not defined」 로 죽는다(2026-08-26 실제로 밟음).
  await ctx.route('**/api/judgment/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await ctx.route('**/api/judgment/scenario', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCENARIO) }));
  await ctx.route('**/api/judgment/answer', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANSWER) }));
  await page.goto(BASE + '/judgment.html?uid=demo1&lang=ko', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.opt', { timeout: 15000 });
  await page.waitForTimeout(900);   // defer 로 오는 game-tts.js + 자동 낭독까지
  await hookSpeak(page);
  return { ctx, page };
}

/* 🪤 «읽어 줬는가» 를 /api/voice/tts 요청 수로 세면 안 된다 — 이 화면은 문제를 그릴 때
      보기까지 미리 받아 두므로(prefetch), 눌렀을 때는 **캐시에서 바로 재생**되어 요청이
      한 건도 안 나간다. 멀쩡한 동작이 «소리가 안 난다» 로 보인다(2026-08-26 실제로 오독).
      그래서 «이 화면이 무엇을 읽어 달라고 했는가» 를 speak 호출로 받아 적는다.
      ⚠️ 이건 «함수를 감싸서 판정» 이라 그 함수가 조용히 되돌아가는 경우를 못 본다 —
      그래서 ①(화자·언어)은 여전히 진짜 네트워크 요청으로 확인한다. */
async function hookSpeak(page) {
  await page.evaluate(() => {
    if (!window.MangoiTTS || window.__saidHooked) return;
    window.__saidHooked = true;
    window.__said = [];
    const orig = window.MangoiTTS.speak;
    window.MangoiTTS.speak = function (t, r, cb) { window.__said.push(String(t)); return orig.apply(this, arguments); };
  });
}
const said = page => page.evaluate(() => (window.__said || []).slice());

(async () => {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

  try {
    /* ── ① 첫 문제에서 «상황문» 을 미국 원어민 여성 목소리로 요청하는가 ──────── */
    console.log('\n[1] 문제 화면 — 자동 낭독과 화자');
    const { ctx, page } = await open(browser, 1200, 900);
    {
      const calls = await page.evaluate(() => window.__tts.slice());
      const sit = calls.find(c => c.text === SCENARIO.situation);
      check('① 새 문제가 오면 상황문을 자동으로 읽는다', !!sit, '요청: ' + JSON.stringify(calls.map(c => c.text)));
      check('① 영어·여성 화자(asteria)로 요청한다',
        !!sit && sit.lang === 'en' && sit.speaker === 'asteria', sit ? JSON.stringify(sit) : '요청 없음');
      check('① 보기 4개를 미리 받아 둔다(다음 재생이 즉시 나게)',
        SCENARIO.options.every(o => calls.some(c => c.text === o)));
    }

    /* ── ② 보기가 «버튼» 인 채로 남아 있는가 (파서가 안 무너뜨렸는가) ────────── */
    {
      const m = await page.evaluate(() => ({
        tags: [...document.querySelectorAll('.opt')].map(o => o.tagName),
        spk: [...document.querySelectorAll('.opt')].map(o => !!o.querySelector('.spk')),
        sitSpk: !!document.querySelector('.sit-spk'),
      }));
      check('② 보기 4개가 모두 <button> 그대로다(스피커가 카드를 무너뜨리지 않았다)',
        m.tags.length === 4 && m.tags.every(t => t === 'BUTTON'), JSON.stringify(m.tags));
      check('② 보기마다·상황문에 스피커가 있다', m.spk.every(Boolean) && m.sitSpk, JSON.stringify(m));
    }

    /* ── ③ 🔴 스피커를 눌러도 답이 골라지지 않는가 ────────────────────────── */
    console.log('\n[2] 스피커를 눌렀을 때');
    {
      await page.evaluate(() => { window.__said.length = 0; });
      const spk = page.locator('.opt .spk').first();
      await spk.scrollIntoViewIfNeeded();
      await spk.click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        sel: document.querySelectorAll('.opt.sel').length,
        submitDisabled: !!(document.getElementById('submit') || {}).disabled,
        texts: window.__said.slice(),
      }));
      check('③ 스피커를 누르면 그 보기를 읽어 준다',
        after.texts.includes(SCENARIO.options[0]), JSON.stringify(after.texts));
      check('③ 🔴 스피커를 눌러도 답은 골라지지 않는다(전파를 멈춘다)',
        after.sel === 0 && after.submitDisabled, JSON.stringify(after));
    }

    /* ── ④ 보기를 고르면 그 문장을 읽어 주는가(듣기 연습) ────────────────── */
    {
      await page.evaluate(() => { window.__said.length = 0; });
      const opt = page.locator('.opt').nth(1);
      await opt.scrollIntoViewIfNeeded();
      await opt.click({ position: { x: 60, y: 20 } });
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({
        sel: document.querySelectorAll('.opt.sel').length,
        submitDisabled: !!(document.getElementById('submit') || {}).disabled,
        texts: window.__said.slice(),
      }));
      check('④ 보기를 고르면 선택되고, 그 표현을 읽어 준다',
        after.sel === 1 && !after.submitDisabled && after.texts.includes(SCENARIO.options[1]), JSON.stringify(after));
    }

    /* ── ⑤ 🔴 무음 — 새 재생을 막고 다음 방문까지 기억하는가 ───────────────── */
    console.log('\n[3] 무음 버튼');
    {
      await page.click('#muteBtn');
      await page.waitForTimeout(150);
      const ui = await page.evaluate(() => {
        const b = document.getElementById('muteBtn');
        const r = b.getBoundingClientRect();
        return { text: b.textContent, title: b.title, pressed: b.getAttribute('aria-pressed'),
                 stored: localStorage.getItem('mangoi_judgment_muted'),
                 h: Math.round(r.height), scrollH: b.scrollHeight };
      });
      check('⑤ 아이콘이 🔇 로 바뀌고 «소리 켜기» 로 안내한다',
        ui.text === '🔇' && /켜기/.test(ui.title) && ui.pressed === 'true', JSON.stringify(ui));
      check('⑤ 버튼 안에 문장이 들어앉지 않는다(넘치지 않는다)',
        ui.scrollH <= ui.h + 2, JSON.stringify(ui));
      check('⑤ 무음을 기억한다(다음 방문에도)', ui.stored === '1');

      await page.evaluate(() => { window.__said.length = 0; });
      const spk = page.locator('.opt .spk').first();
      await spk.scrollIntoViewIfNeeded(); await spk.click();
      await page.waitForTimeout(500);
      check('⑤ 🔴 무음이면 눌러도 소리를 만들지 않는다',
        (await said(page)).length === 0, JSON.stringify(await said(page)));
    }

    /* ── ⑥ 무음인 채로 새로고침해도 조용한가 ───────────────────────────── */
    {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.opt', { timeout: 15000 });
      await page.waitForTimeout(900);
      await hookSpeak(page);
      const m = await page.evaluate(() => ({ text: document.getElementById('muteBtn').textContent, n: window.__tts.length }));
      check('⑥ 무음 상태로 새로고침해도 자동 낭독이 없다', m.text === '🔇' && m.n === 0, JSON.stringify(m));
      await page.click('#muteBtn');   // 다시 켠다
      await page.waitForTimeout(150);
    }

    /* ── ⑦ 채점 결과 — 표현마다 스피커 + 모범 표현 자동 낭독 ────────────── */
    console.log('\n[4] 채점 결과 화면');
    {
      const opt = page.locator('.opt').nth(1);
      await opt.scrollIntoViewIfNeeded(); await opt.click({ position: { x: 60, y: 20 } });
      await page.fill('#why', '선생님께 하는 말이라서 공손하게 골랐어요.');
      await page.evaluate(() => { window.__said.length = 0; });
      await page.click('#submit');
      await page.waitForSelector('.ot-row', { timeout: 15000 });
      await page.waitForTimeout(800);
      const m = await page.evaluate(() => ({
        otSpk: document.querySelectorAll('.ot-row .spk').length,
        bestSpk: !!document.querySelector('.best .spk'),
        myPickSpk: !!document.querySelector('.mypick .spk'),
        texts: window.__said.slice(),
      }));
      check('⑦ 표현마다 다시 들어 볼 수 있다(표 4줄 + 모범 표현 + 내 선택)',
        m.otSpk === 4 && m.bestSpk && m.myPickSpk, JSON.stringify(m));
      check('⑦ 채점이 끝나면 «가장 자연스러운 표현» 을 한 번 들려준다',
        m.texts.includes(ANSWER.best_option), JSON.stringify(m.texts));
    }

    /* ── ⑧ 🔴 🌐 언어 토글이 문장을 다시 읽지 않는가 ──────────────────── */
    {
      await page.evaluate(() => { window.__said.length = 0; });
      await page.click('#langBtn');
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => ({
        n: window.__said.length, title: document.getElementById('muteBtn').title,
        rows: document.querySelectorAll('.ot-row .spk').length,
      }));
      check('⑧ 🔴 언어를 바꿔도 다시 읽지 않는다(재렌더는 낭독이 아니다)', m.n === 0, JSON.stringify(m));
      check('⑧ 무음 버튼 안내도 언어를 따라간다', /sound/i.test(m.title), m.title);
      check('⑧ 언어를 바꿔도 스피커는 그대로 있다', m.rows === 4, String(m.rows));
    }
    await ctx.close();

    /* ── ⑨ 휴대폰 폭 — 넘치지 않고 스피커가 맨 위에 있는가 ─────────────── */
    console.log('\n[5] 휴대폰 폭 390px');
    {
      const { ctx: c2, page: p2 } = await open(browser, 390, 844);
      const m = await p2.evaluate(() => {
        const spk = document.querySelector('.opt .spk');
        spk.scrollIntoView({ block: 'center' });
        const r = spk.getBoundingClientRect();
        const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
          optOverflow: [...document.querySelectorAll('.opt')].filter(o => o.scrollWidth > o.clientWidth + 1).length,
          spk: Math.round(r.width) + 'x' + Math.round(r.height),
          top: stack.length ? (stack[0] === spk ? 'spk' : (stack[0].className || stack[0].tagName)) : 'offscreen',
        };
      });
      check('⑨ 문서가 옆으로 밀리지 않는다', m.docOverflow <= 0, '넘침 ' + m.docOverflow + 'px');
      check('⑨ 보기 안에서도 넘치지 않는다', m.optOverflow === 0, String(m.optOverflow) + '개 넘침');
      check('⑨ 스피커가 «맨 위» 에 있다(가려서 못 누르는 일이 없다)', m.top === 'spk', m.top + ' / ' + m.spk);
      await c2.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n${FAIL === 0 ? '✅' : '🚨'} judgment-tts-browser — PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.error('🚨 검사 실행 실패:', e && e.message); process.exit(1); });
