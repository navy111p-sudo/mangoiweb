// -*- coding: utf-8 -*-
// ai-write-onescreen-browser.mjs — AI 영작 첨삭 PC 2단 배치(2026-10-16)를 «여러 화면 크기 × 여러 조작» 으로 반복해서 잰다.
//
//   [자동으로 안 돕니다 — 사람이 부릅니다]
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-onescreen-browser.mjs
//       ROUNDS=300 BASE_PUB=/tmp/base/cloudflare-deploy/public PW_DIR=… node …   (기준 사본과 대조)
//
//   재는 것(화면 크기마다):
//     ① 가로 넘침 없음(scrollWidth <= innerWidth)
//     ② 글자 크기가 «바꾸기 전»(BASE_PUB 의 같은 파일)과 같다 — 지시가 «글자 크기는 그대로» 였다
//     ③ 1200px 이상: 왼쪽(난이도·장면·그림·브레인스토밍)과 오른쪽(소개·쓰기 칸·첨삭 버튼)이 서로 안 겹친다,
//        📅 (2026-10-19 사장님 지시) 브레인스토밍(#goCard)은 그림 «바로 아래» 라 왼쪽 칸 목록에 함께 둔다(선생님 칸 #wtPanel 은 학생에게 안 보여 빠진다),
//        오른쪽 칸들이 위→아래 순서로 서로 안 겹친다, 그림 카드도 그 위의 장면 칸과 안 겹친다
//     ④ 1200px 이상 + 높이 900 이상: 첨삭 버튼·그림 카드가 하단 «말로 쓰기» 바보다 위(스크롤 없이 보임)
//     ④-b 1200px 이상(높이 무관 — 노트북 포함): 첫 화면에서 첨삭 버튼이 바 위에 보이고 눌린다(낮으면 바 위에 붙음). 큰 화면은 안 붙음.
//     ⑤ 1200px 미만: 주요 칸의 위치가 «바꾸기 전» 과 같다(폰·태블릿은 손대지 않았다)
//     ⑥ 첨삭 버튼으로 스크롤하면 그 가운데의 «맨 위» 가 그 버튼(가려지지 않음)
//   조작 시나리오(넓은 화면에서): 🙋 도움 펼치기 · 미션 단어 숨김 · 쓰기 칸에 긴 글 · 다른 그림 · EN 전환
//     → 그 뒤에도 ①③⑥ 이 성립하는가.
//   ⚠️ file:// 로 열지 않는다(<script src="/js/…"> 가 전부 404) — 작은 http 서버를 띄운다.
//   ⚠️ 첫 방문 «사용 방법» 창은 «본 것» 으로 두고 연다(그 창이 덮으면 모든 좌표 검사가 헛돈다).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = process.env.TEST_PUB || join(__dir, '../../cloudflare-deploy/public');   // 변이시험용 사본을 가리킬 수 있게
const BASE_PUB = process.env.BASE_PUB && existsSync(join(process.env.BASE_PUB, 'ai-write.html')) ? process.env.BASE_PUB : null;
const ROUNDS = Number(process.env.ROUNDS || 60);
const { chromium, exe } = requireBrowser();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4' };
function serve(root) {
  const s = createServer(async (req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
    try { const b = await readFile(join(root, p.replace(/^\//, ''))); res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404).end('no'); }
  });
  return new Promise((r) => s.listen(0, '127.0.0.1', () => r({ s, url: 'http://127.0.0.1:' + s.address().port })));
}

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) { if (cond) pass++; else { fail++; if (fails.length < 60) fails.push('❌ FAIL ' + name + (extra ? '  → ' + extra : '')); } }

// 결정론 난수(회차마다 같은 크기를 재현할 수 있게)
let seed = 20261016; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

const FONT_SEL = ['.hero-title', '.hero-sub', '.level-btn', '#picChoice', '.pic-cap-txt', '.draft-label', '#draftHelp', '#text', '.submit-btn', '.awg-step', '.aw-how-btn', '.aw-help-sum', '.mission-head', '.char-count'];
const POS_SEL = ['#awGuide', '.hero', '#levelRow', '.scene-picker', '#picCard', '#awHelp', '#text', '#submitBtn'];

async function measure(page) {
  return page.evaluate(({ FONT_SEL, POS_SEL }) => {
    // 첨삭 버튼 묶음은 낮은 화면에서 바 위에 «붙는다»(sticky) — 순서·겹침은 «원래 자리» 로 잰다(붙은 모습은 ④-b 가 따로 잰다).
    const sbx = document.getElementById('submitBtn').parentNode, prevPos = sbx.style.position; sbx.style.position = 'static';
    try {
    const box = (s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none') return null;
      const b = e.getBoundingClientRect(); return { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY, w: b.width, h: b.height }; };
    const fonts = {}; for (const s of FONT_SEL) { const e = document.querySelector(s); fonts[s] = e ? getComputedStyle(e).fontSize : null; }
    const pos = {}; for (const s of POS_SEL) pos[s] = box(s);
    const right = ['#awGuide', '.hero', '#missionCard', '#awHelp', '#goMemo', '.draft-label', '#draftHelp', '#text', '#charCount', '#submitBtn'].map((s) => [s, box(s)]).filter((x) => x[1] && x[1].h > 0);
    const left = ['.aw-how-btn', '#levelRow', '.scene-picker', '#picCard', '#wtPanel', '#goCard'].map((s) => [s, box(s)]).filter((x) => x[1] && x[1].h > 0);
    const mic = document.getElementById('dictationBar').getBoundingClientRect();
    return { fonts, pos, right, left, micTop: mic.top, inner: innerHeight, innerW: innerWidth, sw: document.documentElement.scrollWidth };
    } finally { sbx.style.position = prevPos; }
  }, { FONT_SEL, POS_SEL });
}

async function topIsSubmit(page) {
  return page.evaluate(() => {
    const b = document.getElementById('submitBtn');
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    return !!(el && (el === b || b.contains(el)));
  });
}

function checkLayout(tag, m, w, h) {
  ok(tag + ' 가로 넘침 없음', m.sw <= m.innerW, m.sw + '>' + m.innerW);
  if (w >= 1200) {
    const L = m.left, R = m.right;
    const lMax = Math.max(...L.map((x) => x[1].r)), rMin = Math.min(...R.map((x) => x[1].l));
    ok(tag + ' 왼쪽·오른쪽 칸이 안 겹침', lMax <= rMin + 0.5, lMax + ' > ' + rMin);
    for (let i = 1; i < R.length; i++) ok(tag + ' 오른쪽 ' + R[i - 1][0] + '→' + R[i][0] + ' 순서·안 겹침', R[i][1].t >= R[i - 1][1].b - 0.5, R[i - 1][1].b + ' > ' + R[i][1].t);
    for (let i = 1; i < L.length; i++) ok(tag + ' 왼쪽 ' + L[i - 1][0] + '→' + L[i][0] + ' 순서·안 겹침', L[i][1].t >= L[i - 1][1].b - 0.5, L[i - 1][1].b + ' > ' + L[i][1].t);
  }
}

const servers = [await serve(PUB)];
if (BASE_PUB) servers.push(await serve(BASE_PUB));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

async function open(url, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('mangoi_aiwrite_howto_v1', '1'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(url + '/ai-write.html?_=' + Date.now(), { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#picCapTxt') && document.querySelector('#picCapTxt').textContent !== '—', null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(250);
  return { ctx, page };
}

// 고정 크기(실제 모니터) + 무작위 크기
const sizes = [[1920, 920], [1920, 1080], [2560, 1300], [1600, 860], [1440, 900], [1366, 640], [1280, 720], [1200, 900], [1199, 900], [1024, 768], [820, 1180], [390, 844], [360, 640]];
while (sizes.length < ROUNDS) sizes.push([Math.round(340 + rnd() * 2300), Math.round(560 + rnd() * 900)]);

for (const [w, h] of sizes) {
  const tag = w + 'x' + h;
  const { ctx, page } = await open(servers[0].url, w, h);
  const m = await measure(page);
  checkLayout(tag, m, w, h);
  // 💻 노트북(2026-10-16): 1200px 이상이면 높이와 무관하게 첫 화면에서 첨삭 버튼이 «말로 쓰기» 바 위에 보이고 눌린다.
  //    짝: 큰 화면(첫 화면에 다 들어감)에서는 붙지(sticky) 않는다 — 원래 자리 그대로.
  if (w >= 1200) {
    const st = await page.evaluate(() => { scrollTo(0, 0); const b = document.getElementById('submitBtn'), r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { b: r.bottom, t: r.top, bar: document.getElementById('dictationBar').getBoundingClientRect().top, hit: !!(el && b.contains(el)), stuck: b.parentNode.classList.contains('aw-stuck') }; });
    ok(tag + ' 첫 화면에서 첨삭 버튼이 바 위에 보임', st.t >= 0 && st.b <= st.bar + 0.5, st.b + ' > ' + st.bar);
    ok(tag + ' 첫 화면에서 첨삭 버튼이 눌림(맨 위)', st.hit);
    if (w >= 1600 && h >= 900) ok(tag + ' 큰 화면은 붙지 않음(원래 자리)', !st.stuck);
  }
  if (w >= 1200 && h >= 900) {
    const sb = m.pos['#submitBtn'], pc = m.pos['#picCard'];
    // 글자를 안 줄이므로 좁은 PC 는 다 못 넣을 수 있다 — 그때는 «최소 높이까지 줄였다» 가 정답(그 이상 줄이면 쓰기 칸·그림이 못 쓸 만큼 작아진다).
    const hs = await page.evaluate(() => ({ ta: document.getElementById('text').getBoundingClientRect().height, sc: document.getElementById('picScene').getBoundingClientRect().height }));
    ok(tag + ' 첨삭 버튼이 말로 쓰기 바 위(또는 쓰기 칸이 최소 160)', sb && (sb.b <= m.micTop + 0.5 || hs.ta <= 160.5), sb && (sb.b + ' > ' + m.micTop + ' ta=' + hs.ta));
    ok(tag + ' 그림 카드가 말로 쓰기 바 위(또는 그림이 최소 300)', pc && (pc.b <= m.micTop + 0.5 || hs.sc <= 300.5), pc && (pc.b + ' > ' + m.micTop + ' sc=' + hs.sc));
    if (w >= 1600 && h >= 900) ok(tag + ' 넓은 PC 는 반드시 첫 화면 안', sb && pc && sb.b <= m.micTop + 0.5 && pc.b <= m.micTop + 0.5, sb && pc && (sb.b + '/' + pc.b + ' > ' + m.micTop));
  }
  ok(tag + ' 첨삭 버튼 가운데 «맨 위» 가 그 버튼', await topIsSubmit(page));
  if (BASE_PUB) {
    const { ctx: c2, page: p2 } = await open(servers[1].url, w, h);
    const b = await measure(p2);
    for (const s of FONT_SEL) ok(tag + ' 글자 크기 그대로 ' + s, m.fonts[s] === b.fonts[s], m.fonts[s] + ' vs ' + b.fonts[s]);
    if (w < 1200) for (const s of POS_SEL) {
      const a = m.pos[s], c = b.pos[s];
      ok(tag + ' (1200 미만) 위치 그대로 ' + s, (!a && !c) || (a && c && Math.abs(a.t - c.t) < 1 && Math.abs(a.l - c.l) < 1 && Math.abs(a.w - c.w) < 1), JSON.stringify([a, c]));
    }
    await c2.close();
  }
  await ctx.close();
}

// 조작 시나리오 — 넓은 화면에서 칸이 늘거나 줄어도 순서·겹침·버튼이 유지되는가
for (const [w, h] of [[1920, 920], [1440, 900], [1280, 720], [2560, 1300]]) {
  const tag = w + 'x' + h;
  const { ctx, page } = await open(servers[0].url, w, h);
  const steps = [
    ['도움 펼침', () => page.evaluate(() => { document.getElementById('awHelp').open = true; })],
    ['긴 글 입력', () => page.fill('#text', 'Yesterday I go to school and I see many friends. '.repeat(30))],
    ['미션 숨김', () => page.evaluate(() => { document.getElementById('missionCard').style.display = 'none'; })],
    ['다른 그림', () => page.evaluate(() => { try { shufflePic(); } catch (e) {} })],
    ['EN 전환', () => page.evaluate(() => { try { (window.setLang || window.toggleLang)('en'); } catch (e) {} })],
    ['도움 접음', () => page.evaluate(() => { document.getElementById('awHelp').open = false; })],
    ['결과 상자 표시', () => page.evaluate(() => { const r = document.getElementById('resultBox'); r.style.display = 'block'; r.innerHTML = '<div style="height:600px">result</div>'; })],
  ];
  for (const [name, fn] of steps) {
    await fn(); await page.waitForTimeout(200);
    const m = await measure(page);
    checkLayout(tag + ' [' + name + ']', m, w, h);
    ok(tag + ' [' + name + '] 첨삭 버튼 가운데 «맨 위» 가 그 버튼', await topIsSubmit(page));
    if (name === '결과 상자 표시') {
      const rb = await page.evaluate(() => { const r = document.getElementById('resultBox').getBoundingClientRect(); const s = document.getElementById('submitBtn').getBoundingClientRect(); const p = document.getElementById('picCard').getBoundingClientRect(); return { rt: r.top, rl: r.left, rw: r.width, sb: s.bottom, pb: p.bottom }; });
      ok(tag + ' 결과 상자는 첨삭 버튼·그림 아래, 두 칸 폭', rb.rt >= rb.sb - 0.5 && rb.rt >= rb.pb - 0.5 && rb.rw > w * 0.6, JSON.stringify(rb));
    }
  }
  await ctx.close();
}

await browser.close();
for (const s of servers) s.s.close();
for (const f of fails) console.log(f);
console.log(`\n화면 크기 ${sizes.length}개 + 조작 시나리오 28개 ${BASE_PUB ? '(기준 사본과 대조)' : '(기준 대조 없음 — BASE_PUB 를 주면 글자 크기·폰 위치도 잽니다)'}`);
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
