// -*- coding: utf-8 -*-
// warmup-setup-browser.mjs — 수업 전 AI 웜업의 «시작 전 연령·수준 고르기» 를 진짜 브라우저에서 눌러 본다.
//
//   [왜 필요한가]  2026-08-26 사장님 지시로 웜업에 «연령 · 대화 수준» 설정을 앞세웠다.
//     지켜야 하는 것이 «순서» 다 — 고르기 전에 첫 인사(AI 호출)가 나가면 안 된다.
//     ⚠️ 「순서가 틀린 것」은 문자열 하니스로 안 보인다(함수도 값도 다 «있다»).
//        그래서 여기서는 실제로 «/api/warmup/chat 요청이 언제 나갔는지» 를 센다.
//     ⚠️ 「보인다 / 눌린다 / 글자가 안 쪼개진다」도 코드로는 못 본다 — 좌표와 줄 수를 잰다
//        (CLAUDE.md 2장 「짧은 라벨에 flex 를 썼더니 낱글자로 쪼개짐」).
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   warmup.html 의 설정 화면·시작 순서·수준 찾기를 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/warmup-setup-browser.mjs
//
//   ⚠️ file:// 로 열면 안 된다(외부 스크립트가 전부 404) — 작은 http 서버를 직접 띄운다.
//   ⚠️ /api/* 는 전부 스텁이라 첫 인사는 «폴백 인사» 로 떨어진다. 그건 정상이다 —
//      여기서 재는 것은 «AI 가 뭐라고 답했나» 가 아니라 «언제 시작했나» 다.
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
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};
let apiHits = [];
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) {
    apiHits.push(p);
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end('{"ok":false}');
  }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

async function openWarmup(width, height, url = '/warmup.html') {
  // ⚠️ isMobile 은 켜지 않는다 — 폭만 좁히면 되는 검사에서 좌표가 어긋난다(CLAUDE.md 2장)
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  apiHits = [];
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  return { ctx, page };
}

console.log('\n[ 1. 열자마자 — 고르기 화면이 먼저 뜨고, 대화는 아직 시작 안 됐다 ]');
{
  const { ctx, page } = await openWarmup(1280, 900);
  const seen = await page.evaluate(() => {
    const el = document.getElementById('wuSetup');
    const r = el.getBoundingClientRect();
    // 「열렸다」와 「보인다」는 다르다 — 화면 한가운데에 정말 이 화면이 맨 위에 있는가
    const top = document.elementsFromPoint(innerWidth / 2, innerHeight / 2)[0];
    return {
      hidden: el.hidden, display: getComputedStyle(el).display,
      covers: r.width >= innerWidth - 2 && r.height > 0,
      onTop: !!(top && el.contains(top)),
      ages: document.querySelectorAll('#wusAges .wus-card').length,
      levels: document.querySelectorAll('#wusLevels .wus-item').length,
      cta: (document.getElementById('wusStart') || {}).textContent || '',
      logMsgs: document.querySelectorAll('#log .msg').length,
    };
  });
  check('설정 화면이 떠 있다', seen.hidden === false && seen.display !== 'none', JSON.stringify(seen));
  check('화면을 덮고 맨 위에 있다', seen.covers && seen.onTop, JSON.stringify(seen));
  check('연령대 4개가 그려졌다', seen.ages === 4, String(seen.ages));
  check('대화 수준 8단계가 그려졌다', seen.levels === 8, String(seen.levels));
  check('시작 버튼이 «시작하기» 로 보인다', /웜업 시작하기/.test(seen.cta), seen.cta);
  check('아직 대화가 시작되지 않았다(말풍선 0개)', seen.logMsgs === 0, String(seen.logMsgs));
  check('아직 웜업 대화 API 를 부르지 않았다', !apiHits.some((h) => h === '/api/warmup/chat'), apiHits.join(','));
  await ctx.close();
}

console.log('\n[ 2. 골라서 시작 — 고른 값이 그대로 서버 요청에 실린다 ]');
{
  const { ctx, page } = await openWarmup(1280, 900);
  const sent = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/warmup/chat')) { try { sent.push(JSON.parse(r.postData() || '{}')); } catch { sent.push({}); } }
  });
  await page.click('#wusAges [data-age="adult"]');
  await page.click('#wusLevels [data-lvl="6"]');
  const marked = await page.evaluate(() => ({
    age: !!document.querySelector('#wusAges [data-age="adult"].on'),
    lvl: !!document.querySelector('#wusLevels [data-lvl="6"].on'),
    menuAge: (document.getElementById('ageVal') || {}).textContent || '',
    menuLvl: (document.getElementById('lvlVal') || {}).textContent || '',
  }));
  check('고른 연령대에 «지금» 표시가 붙는다', marked.age, JSON.stringify(marked));
  check('고른 수준에 «지금» 표시가 붙는다', marked.lvl, JSON.stringify(marked));
  check('⋮ 메뉴 표시도 함께 바뀐다', /성인/.test(marked.menuAge) && /6단계/.test(marked.menuLvl), JSON.stringify(marked));
  await page.click('#wusStart');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    hidden: document.getElementById('wuSetup').hidden,
    ai: document.querySelectorAll('#log .msg.ai').length,
    savedAge: localStorage.getItem('mangoi_warmup_age'),
    savedLvl: localStorage.getItem('mangoi_warmup_level'),
  }));
  check('시작하면 설정 화면이 닫힌다', after.hidden === true);
  check('첫 인사가 실제로 나온다', after.ai >= 1, String(after.ai));
  check('고른 값이 저장된다(다음에 다시 와도 그대로)', after.savedAge === 'adult' && after.savedLvl === '6',
    `${after.savedAge}/${after.savedLvl}`);
  // 대화 API 로 실제로 실려 나가는지 — 입력창에 한 마디 보내 본다
  await page.fill('#inp', 'Hello!');
  await page.click('#sendBtn');
  await page.waitForTimeout(1200);
  const body = sent[sent.length - 1] || {};
  check('요청에 age_group 이 실린다', body.age_group === 'adult', JSON.stringify(body).slice(0, 200));
  check('요청에 difficulty 가 함께 실린다', body.difficulty === 6, JSON.stringify(body).slice(0, 200));
  await ctx.close();
}

console.log('\n[ 3. 🎯 내 수준 찾기 — 3번 눌러 끝나고, 서버를 부르지 않는다 ]');
{
  const { ctx, page } = await openWarmup(1280, 900);
  apiHits = [];
  await page.click('#wusFind');
  await page.waitForTimeout(200);
  const q1 = await page.evaluate(() => ({
    probe: !document.getElementById('wusProbe').hidden,
    main: document.getElementById('wusMain').hidden,
    step: (document.querySelector('.wus-probe-q') || {}).textContent || '',
    sent: (document.querySelector('.wus-sent') || {}).textContent || '',
  }));
  check('수준 찾기 화면으로 바뀐다', q1.probe && q1.main, JSON.stringify(q1));
  check('1 / 3 로 시작한다', /1 \/ 3/.test(q1.step), q1.step);
  check('영어 문장을 실제로 보여준다', /[a-zA-Z]{3,}/.test(q1.sent), q1.sent);
  await page.click('[data-pb="up"]');   // 쉬워요 → 위로
  await page.waitForTimeout(150);
  await page.click('[data-pb="up"]');
  await page.waitForTimeout(150);
  await page.click('[data-pb="up"]');
  await page.waitForTimeout(250);
  const done = await page.evaluate(() => ({
    go: !!document.querySelector('[data-pb="go"]'),
    lvl: (document.getElementById('lvlVal') || {}).textContent || '',
    txt: (document.getElementById('wusProbe') || {}).textContent || '',
  }));
  check('3번 만에 결과가 나온다', done.go, done.txt.slice(0, 80));
  check('«쉬워요» 만 고르면 위쪽 수준으로 간다', /8단계|7단계/.test(done.lvl), done.lvl);
  check('찾는 동안 서버를 한 번도 부르지 않는다', !apiHits.length, apiHits.join(','));
  await page.click('[data-pb="go"]');
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({
    hidden: document.getElementById('wuSetup').hidden,
    ai: document.querySelectorAll('#log .msg.ai').length,
  }));
  check('결과 화면의 시작 버튼으로 바로 대화가 시작된다', after.hidden === true && after.ai >= 1, JSON.stringify(after));
  await ctx.close();
}

console.log('\n[ 4. 대화 중 ⋮ 로 다시 고르기 — 대화를 새로 시작하지 않는다 ]');
{
  const { ctx, page } = await openWarmup(1280, 900);
  await page.click('#wusStart');
  await page.waitForTimeout(1000);
  const before = await page.evaluate(() => document.querySelectorAll('#log .msg.ai').length);
  await page.click('#menuBtn');
  await page.waitForTimeout(200);
  await page.click('.menu-reopen');
  await page.waitForTimeout(300);
  const reopened = await page.evaluate(() => ({
    open: !document.getElementById('wuSetup').hidden,
    cta: (document.getElementById('wusStart') || {}).textContent || '',
    menuOpen: document.getElementById('menuPanel').classList.contains('open'),
  }));
  check('⋮ 에서 설정 화면을 다시 열 수 있다', reopened.open, JSON.stringify(reopened));
  check('메뉴는 함께 닫힌다', !reopened.menuOpen);
  check('버튼이 «계속하기» 로 바뀐다', /계속하기/.test(reopened.cta), reopened.cta);
  await page.click('#wusAges [data-age="kid"]');
  await page.click('#wusStart');
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    ai: document.querySelectorAll('#log .msg.ai').length,
    sys: [...document.querySelectorAll('#log .msg.sys')].map((e) => e.textContent).join(' | '),
  }));
  check('첫 인사를 다시 만들지 않는다(AI 말풍선 개수 그대로)', after.ai === before, `${before} → ${after.ai}`);
  check('바뀐 눈높이를 한 줄로 알려 준다', /유아|이어갈게요/.test(after.sys), after.sys.slice(0, 120));
  await ctx.close();
}

console.log('\n[ 5. 휴대폰 폭(390) — 넘치지 않고 글자가 쪼개지지 않는다 ]');
{
  const { ctx, page } = await openWarmup(390, 844);
  const m = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > innerWidth + 1;
    // 「낱글자로 쪼개짐」 판정 — 라벨 한 줄짜리가 3줄 이상이면 쪼개진 것이다
    const worst = [...document.querySelectorAll('#wusAges .wus-name, #wusLevels .wus-name')].map((el) => {
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      return { t: el.textContent.trim().slice(0, 18), lines: Math.round(el.getBoundingClientRect().height / lh) };
    }).sort((a, b) => b.lines - a.lines)[0];
    const cta = document.getElementById('wusStart').getBoundingClientRect();
    return { overflow, worst, ctaW: Math.round(cta.width), inner: innerWidth };
  });
  check('문서가 가로로 넘치지 않는다', !m.overflow);
  check('라벨이 낱글자로 쪼개지지 않는다(3줄 미만)', m.worst && m.worst.lines < 3, JSON.stringify(m.worst));
  check('시작 버튼이 화면 폭 안에 있다', m.ctaW <= m.inner, `${m.ctaW}/${m.inner}`);
  await ctx.close();
}

console.log('\n[ 6. ?setup=0 — 수업 흐름에서 곧바로 대화 ]');
{
  const { ctx, page } = await openWarmup(1280, 900, '/warmup.html?setup=0');
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => ({
    hidden: document.getElementById('wuSetup').hidden,
    ai: document.querySelectorAll('#log .msg.ai').length,
  }));
  check('설정 화면 없이 바로 시작한다', r.hidden === true && r.ai >= 1, JSON.stringify(r));
  await ctx.close();
}

console.log('\n[ 7. ⬅️🏠 나가는 길 — 설정 화면이 상단바를 덮으므로 화면 안에 있어야 한다 ]');
{
  // 「띄웠다」와 「보인다」는 다르다(CLAUDE.md 2장) — 좌표와 «맨 위에 무엇이 있나» 를 잰다.
  // 대비비는 반투명 층을 합성해서 잰다(그냥 읽으면 멀쩡한 글자가 거짓 실패로 나온다).
  const { ctx, page } = await openWarmup(390, 844);
  const m = await page.evaluate(() => {
    const px = (c) => (String(c).match(/[\d.]+/g) || [0, 0, 0, 1]).map(Number);
    // ⚠️ backgroundColor 만 읽으면 «그라데이션 배경» 이 투명으로 잡혀, 어두운 화면이
    //    흰 바탕으로 계산된다 → 멀쩡한 글자가 거짓 실패로 나온다. 그라데이션은 첫 색을 쓴다.
    const layerOf = (n) => {
      const cs = getComputedStyle(n);
      const c = px(cs.backgroundColor);
      const a = c.length > 3 ? c[3] : 1;
      if (a > 0) return [c[0], c[1], c[2], a];
      const g = (cs.backgroundImage || '').match(/rgba?\([^)]+\)/g);
      if (g && g.length) { const q = px(g[0]); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; }
      return null;
    };
    const bgOf = (el) => {                      // 불투명한 층을 만날 때까지 쌓았다가 아래에서 위로 합성
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const L = layerOf(n);
        if (L) { layers.push(L); if (L[3] >= 1) break; }
      }
      let out = [255, 255, 255];
      for (let i = layers.length - 1; i >= 0; i--) {
        const [r, g, b, a] = layers[i];
        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
      }
      return out;
    };
    const lum = (c) => { const f = c.map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * f[0] + .7152 * f[1] + .0722 * f[2]; };
    const ratio = (el) => {
      const fg = px(getComputedStyle(el).color), bg = bgOf(el);
      const a = lum(fg) + .05, b = lum(bg) + .05;
      return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100;
    };
    const back = document.getElementById('wusNavBack');
    const home = document.getElementById('wusNavHome');
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      // ⚠️ 줄 수는 «글자 상자» 로만 센다 — 테두리·안쪽 여백을 빼지 않으면 한 줄짜리가 2줄로 잡힌다
      const cs = getComputedStyle(el);
      const pad = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((n, k) => n + (parseFloat(cs[k]) || 0), 0);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
      return { in: r.top >= 0 && r.bottom <= innerHeight && r.width > 0, onTop: !!(top && el.contains(top)), top: Math.round(r.top),
               lines: Math.round((r.height - pad) / lh) };
    };
    return { back: seen(back), home: seen(home), href: home.getAttribute('href'),
             cr: { back: ratio(back), home: ratio(home) },
             topBack: !!document.querySelector('.top button.back'), topHome: !!document.querySelector('.top a.back.home') };
  });
  check('설정 화면에 «← 뒤로» 가 보이고 실제로 맨 위에 있다', m.back.in && m.back.onTop, JSON.stringify(m.back));
  check('설정 화면에 «🏠 홈» 이 보이고 실제로 맨 위에 있다', m.home.in && m.home.onTop, JSON.stringify(m.home));
  check('홈 버튼은 사이트 홈(/)으로 간다', m.href === '/', String(m.href));
  check('글자가 낱글자로 쪼개지지 않는다(2줄 미만)', m.back.lines < 2 && m.home.lines < 2, JSON.stringify(m));
  check('두 버튼 글자가 읽힌다(대비 4.5 이상)', m.cr.back >= 4.5 && m.cr.home >= 4.5, JSON.stringify(m.cr));
  check('상단바에도 ← 뒤로 · 🏠 홈 이 나뉘어 있다', m.topBack && m.topHome, JSON.stringify(m));
  // 8단계 목록이라 끝까지 내려가면 사라지면 안 된다 — sticky 로 남아 있어야 한다
  await page.evaluate(() => { document.getElementById('wuSetup').scrollTop = 99999; });
  await page.waitForTimeout(200);
  const stuck = await page.evaluate(() => {
    const r = document.getElementById('wusNavBack').getBoundingClientRect();
    return { top: Math.round(r.top), visible: r.top >= 0 && r.top < 80 };
  });
  check('끝까지 내려도 나가는 길이 남아 있다(sticky)', stuck.visible, JSON.stringify(stuck));
  await ctx.close();
}

console.log('\n[ 8. ⬅️ 뒤로 — 어디에서 왔느냐에 따라 돌아갈 곳이 다르다 ]');
{
  // ① 수준 찾기 중 → 목록으로 (그만두는 길이 아래 버튼 말고도 위에 있다)
  const { ctx, page } = await openWarmup(1280, 900);
  await page.click('#wusFind');
  await page.waitForTimeout(200);
  await page.click('#wusNavBack');
  await page.waitForTimeout(200);
  const back1 = await page.evaluate(() => ({
    probe: document.getElementById('wusProbe').hidden,
    main: !document.getElementById('wusMain').hidden,
    setup: !document.getElementById('wuSetup').hidden,
  }));
  check('수준 찾기 중에 누르면 목록으로 돌아온다(페이지를 벗어나지 않는다)',
    back1.probe && back1.main && back1.setup, JSON.stringify(back1));
  // ② 대화 중 ⋮ 로 열었으면 → 대화로 (홈으로 튕기면 대화가 사라진다)
  await page.click('#wusStart');
  await page.waitForTimeout(900);
  const aiBefore = await page.evaluate(() => document.querySelectorAll('#log .msg.ai').length);
  await page.click('#menuBtn'); await page.waitForTimeout(150);
  await page.click('.menu-reopen'); await page.waitForTimeout(250);
  await page.click('#wusNavBack'); await page.waitForTimeout(250);
  const back2 = await page.evaluate(() => ({
    setup: document.getElementById('wuSetup').hidden,
    ai: document.querySelectorAll('#log .msg.ai').length,
    url: location.pathname,
  }));
  check('대화 중에 열었다가 누르면 대화로 돌아온다', back2.setup && back2.ai === aiBefore && /warmup/.test(back2.url),
    JSON.stringify(back2));
  await ctx.close();
}
{
  // ③ 밖에서 바로 들어온 첫 화면 → 홈으로 (history 가 없으면 아무 데도 못 가는 것이 제일 나쁘다)
  const { ctx, page } = await openWarmup(1280, 900);
  await page.click('#wusNavBack');
  await page.waitForTimeout(600);
  const url = new URL(page.url());
  check('바로 들어온 첫 화면에서 누르면 홈으로 나간다', url.pathname === '/', page.url());
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`웜업 시작설정 브라우저 검사: ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
