// -*- coding: utf-8 -*-
// game-hub-audio-mute-browser.mjs — 게임 허브(student-games.html) 안내음성의 «🔇 무음» 이 진짜 멈추는가.
//
//   [왜 필요한가]  2026-08-23 사장님 제보 「소리가 멈추지 않아. 무음 클릭해도 멈추지 않아」.
//     원인은 «순서» 였다 — 화면 아무 데나 누르면 안내음성을 멈추는 document pointerdown 처리가
//     무음 버튼을 누를 때도 먼저 돌아 `pause()` + `_hubIntroDismissed=true` 로 만들고,
//     곧이어 오는 click 의 toggleHubAudioMute() 가 그 값을 뒤집어 **그 자리에서 다시 재생**했다.
//     그래서 몇 번을 눌러도 소리가 계속 나고 버튼도 🔊 그대로였다.
//   ⚠️ 이런 «이벤트 순서» 사고는 문자열 하니스로 절대 안 보인다 — 함수도 조건도 다 «있다».
//      그래서 진짜 브라우저에서 버튼을 눌러 보고 `audio.paused` 와 `currentTime` 을 잰다.
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   허브 안내음성(`_hubPlayIntroAudio`·`toggleHubAudioMute`·pointerdown 자동정지)을 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/game-hub-audio-mute-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다(외부 스크립트가 전부 404) — 그래서 작은 http 서버를 직접 띄운다.
//   ⚠️ 헤드리스는 기본이 «자동재생 허용» 이 아니다. 두 상태를 모두 본다:
//        A. 자동재생 허용(--autoplay-policy=no-user-gesture-required) = 사장님 PC 처럼 소리가 나는 상태
//        B. 자동재생 차단 = 휴대폰·처음 방문 — 첫 클릭은 «되듣기» 지 «음소거» 가 아니다

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const { chromium, exe } = requireBrowser();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {            // 로그인·서버 데이터 없이도 되는 화면이다
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

// 「멈췄다」는 paused 만으로 판정하지 않는다 — 잠깐 멈췄다 되살아나는 사고였으므로
// 조금 기다린 뒤 currentTime 이 더 안 흘렀는지까지 본다.
const snap = (page) => page.evaluate(() => {
  const a = document.getElementById('hub-intro-audio');
  const b = document.getElementById('hub-audio-mute-btn');
  return { paused: a.paused, t: a.currentTime, btn: b.textContent.trim(), pulse: b.classList.contains('needs-tap') };
});

const open = async (browser, w = 1280, h = 800) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/student-games.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  return page;
};

/* ── A. 소리가 나고 있는 상태에서 «무음» 을 누르면 진짜 멈추는가 ───────────────── */
{
  console.log('\n▶ A. 자동재생 허용 (소리가 나고 있는 상태)');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await open(browser);

  const s0 = await snap(page);
  check('안내음성이 재생 중이다(검사 전제)', !s0.paused, JSON.stringify(s0));

  await page.click('#hub-audio-mute-btn');
  await page.waitForTimeout(700);
  const s1 = await snap(page);
  check('① 무음 한 번에 멈춘다', s1.paused, JSON.stringify(s1));
  check('② 버튼이 🔇 로 바뀐다', s1.btn === '🔇', s1.btn);

  await page.waitForTimeout(700);
  const s1b = await snap(page);
  check('③ 멈춘 뒤 스스로 되살아나지 않는다', s1b.paused && Math.abs(s1b.t - s1.t) < 0.05,
        s1.t.toFixed(2) + ' → ' + s1b.t.toFixed(2));

  await page.click('#hub-audio-mute-btn');
  await page.waitForTimeout(700);
  const s2 = await snap(page);
  check('④ 한 번 더 누르면 다시 들린다(되듣기)', !s2.paused && s2.btn === '🔊', JSON.stringify(s2));

  await page.click('#hub-audio-mute-btn');
  await page.waitForTimeout(700);
  const s3 = await snap(page);
  check('⑤ 세 번째도 멈춘다(«두 번에 한 번만 먹는» 상태가 아님)', s3.paused && s3.btn === '🔇', JSON.stringify(s3));

  // 원래 있던 동작 — 게임 시작·메뉴 이동 등 아무 데나 누르면 그 즉시 멈춘다
  await page.click('#hub-audio-mute-btn');           // 다시 재생시켜 놓고
  await page.waitForTimeout(500);
  await page.click('#hub-title');
  await page.waitForTimeout(500);
  const s4 = await snap(page);
  check('⑥ 다른 곳을 눌러도 여전히 멈춘다(원래 동작 유지)', s4.paused, JSON.stringify(s4));

  await browser.close();
}

/* ── B. 자동재생이 막힌 첫 방문 — 첫 클릭은 «되듣기» 지 «음소거» 가 아니다 ─────── */
{
  console.log('\n▶ B. 자동재생 차단 (휴대폰·첫 방문)');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'] });
  const page = await open(browser, 390, 844);

  const s0 = await snap(page);
  check('⑦ 막혔음을 버튼이 알린다(흔들림)', s0.pulse && s0.paused, JSON.stringify(s0));

  await page.click('#hub-audio-mute-btn');
  await page.waitForTimeout(900);
  const s1 = await snap(page);
  check('⑧ 첫 클릭은 «들려주기» 다(그 자리에서 음소거로 삼키지 않는다)', !s1.paused && s1.btn === '🔊', JSON.stringify(s1));

  await page.click('#hub-audio-mute-btn');
  await page.waitForTimeout(700);
  const s2 = await snap(page);
  check('⑨ 그다음 클릭은 음소거다', s2.paused && s2.btn === '🔇', JSON.stringify(s2));

  await browser.close();
}

server.close();
console.log('\n' + (fail ? '❌ 실패 ' + fail + '건 / ' : '✅ ') + '통과 ' + pass + '건');
process.exit(fail ? 1 : 0);
