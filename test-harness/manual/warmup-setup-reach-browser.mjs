// -*- coding: utf-8 -*-
// warmup-setup-reach-browser.mjs — 웜업의 «연령·수준 다시 고르기» 에 손이 닿는지 진짜 브라우저로 잰다.
//
//   [왜 필요한가]  2026-09-15 사장님 「PC에서 너무 밑에 있어서 잘 보이지 않고 오른쪽 카드에서도
//     찾기가 힘들어」. 재 보니 «안 보인다» 가 아니라 «화면 밖» 이었다 —
//       ⋮ 설정 카드 높이가 792px 고정이라 카드 아래 끝이 853px 인데,
//       1280x800 · 1366x768 노트북에서는 맨 아래 버튼(792~834px)이 화면을 넘어가고
//       카드에 스크롤도 없어 끌어내릴 수도 없었다(elementFromPoint 가 null).
//       중국어 선생님 칸이 보이는 학생은 926px 라 1440x900 에서도 잘렸다.
//     → 2번안(상단바 🎚️ 지름길) + 3번안(카드 안쪽만 스크롤 + 버튼 바닥 고정)을 함께 적용했다.
//
//   [문자열 하니스로는 못 잡는다]  함수도 값도 다 «있고» 틀린 것은 «화면에 들어오는가 · 눌리는가»
//     뿐이다. 그래서 여기서는 좌표를 재고 elementFromPoint 로 «맨 위가 그 버튼인가» 를 본다
//     (CLAUDE.md 2장 — 「보인다」·「눌린다」는 다른 값이다).
//
//   [자동으로 안 돕니다]  manual/ 규약상 게이트가 물어 가지 않는다. 웜업 상단바·⋮ 카드·설정 화면
//   확정 버튼을 건드리면 사람이 부른다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/warmup-setup-reach-browser.mjs
//
//   [변이시험 — 되돌리면 실제로 FAIL 난다 (2026-09-15 실측)]
//     Ⓐ 상단바 🎚️ 버튼 제거            → 실패 12
//     Ⓑ 카드 max-height·flex 를 옛날로  → 실패 10
//     Ⓒ «다시 고르기» 를 옛 회색으로     → 실패 6
//     Ⓓ 확정 띠의 sticky 제거           → 실패 6
//     되돌린 뒤 기준 점수 = 통과 72 · 실패 0
//   ⚠️ 요소가 «없을» 때 크래시가 아니라 깔끔한 FAIL 이 나야 한다 — 처음엔 Ⓐ 에서 하니스가 죽어
//      결과줄조차 안 나왔다(무엇이 깨졌는지 안 보인다). 아래 missing 처리가 그 자리다.
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
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }
  try {
    const buf = await readFile(join(PUB, p.replace(/^\//, '')));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;

let pass = 0, fail = 0;
const ck = (n, c, x = '') => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (x ? '  → ' + x : '')); } };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

// ⚠️ 1366x768 을 빼지 마세요 — 고치기 «전» 에 버튼이 실제로 잘리던 크기입니다.
const SIZES = [[1920, 1080, '큰 모니터'], [1440, 900, '노트북'], [1366, 768, '흔한 노트북'],
               [1280, 800, '노트북'], [390, 844, '휴대폰'], [360, 640, '작은 휴대폰']];

for (const [w, h, label] of SIZES) {
  console.log(`\n══ ${w}×${h} (${label}) ══`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/warmup.html?_=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  // ── ① 설정 화면 확정 버튼 — 교재 32권을 펼친 «사장님 화면» 상태로 ──
  const a = await page.evaluate(async () => {
    const more = document.querySelector('.wus-more'); if (more) more.open = true;
    const setup = document.getElementById('wuSetup'); setup.scrollTop = setup.scrollHeight;
    await new Promise((r) => setTimeout(r, 250));
    const bar = document.querySelector('.wus-ctabar'), cta = document.getElementById('wusStart'),
          pick = document.getElementById('wusPickNow');
    if (!bar || !cta) return { missing: true };
    const b = cta.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return {
      barSticky: getComputedStyle(bar).position,
      ctaTopMost: el === cta || cta.contains(el),
      ctaInView: b.top >= 0 && b.bottom <= innerHeight,
      pickText: pick ? (pick.textContent || '').trim() : '', pickHidden: pick ? pick.hidden : true,
      docOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  ck('확정 버튼이 화면 안에 있고 맨 위다(가린 것 없음)', !a.missing && a.ctaInView && a.ctaTopMost, JSON.stringify(a));
  ck('띠가 바닥에 붙어 있다(sticky)', a.barSticky === 'sticky');
  ck('«고른 것» 줄이 실제 값으로 채워졌다', !a.pickHidden && /고른 것: .+·.+/.test(a.pickText || ''), a.pickText);
  ck('가로 넘침 없음', a.docOverflow <= 0, 'overflow=' + a.docOverflow);

  // ── ② 상단바 🎚️ 지름길 (2번안) ──
  const b1 = await page.evaluate(async () => {
    document.getElementById('wusStart').click();
    await new Promise((r) => setTimeout(r, 500));
    const t = document.getElementById('setupBtn');
    // ⚠️ 없으면 크래시 말고 «못 찾았다» 로 돌려준다 — 그래야 무엇이 깨졌는지 보인다
    if (!t) return { missing: true, w: 0, inView: false, topMost: false, titleW: 999 };
    const r = t.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    const h1 = document.querySelector('.top h1').getBoundingClientRect();
    return { w: Math.round(r.width), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      topMost: el === t || t.contains(el), titleW: Math.round(h1.width) };
  });
  ck('🎚️ 버튼이 상단바에 보이고 눌린다', !b1.missing && b1.inView && b1.topMost && b1.w >= 28, JSON.stringify(b1));
  ck('제목이 뭉개지지 않는다(폭 60px 이상)', b1.titleW >= 60, '제목폭=' + b1.titleW);
  let opened = false;
  try {
    await page.click('#setupBtn', { timeout: 2500 }); await page.waitForTimeout(400);
    opened = await page.evaluate(() => !document.getElementById('wuSetup').hidden);
  } catch { opened = false; }
  ck('🎚️ 를 누르면 설정 화면이 열린다', opened);

  // ── ③ ⋮ 카드 (3번안) ──
  const c = await page.evaluate(async () => {
    document.getElementById('wusStart').click(); await new Promise((r) => setTimeout(r, 450));
    document.getElementById('menuBtn').click(); await new Promise((r) => setTimeout(r, 350));
    const p = document.getElementById('menuPanel'), re = document.querySelector('.menu-reopen'),
          sc = document.querySelector('.menu-scroll'), caret = document.querySelector('.menu-caret');
    if (!p || !re) return { missing: true };
    const pb = p.getBoundingClientRect(), rb = re.getBoundingClientRect();
    const cb = caret ? caret.getBoundingClientRect() : { height: 0, top: -1 };
    const el = document.elementFromPoint(Math.round(rb.left + rb.width / 2), Math.round(rb.top + rb.height / 2));
    return { panelBottom: Math.round(pb.bottom), innerH: innerHeight,
      reopenInView: rb.top >= 0 && rb.bottom <= innerHeight,
      reopenTopMost: el === re || re.contains(el),
      hasScrollBox: !!sc, caretVisible: cb.height > 0 && cb.top >= 0,
      reopenBg: getComputedStyle(re).backgroundImage.slice(0, 26) };
  });
  ck('⋮ 카드가 화면을 넘지 않는다', !c.missing && c.panelBottom <= c.innerH, `카드끝 ${c.panelBottom} / 화면 ${c.innerH}`);
  ck('«다시 고르기» 가 보이고 실제로 눌린다', !c.missing && c.reopenInView && c.reopenTopMost, JSON.stringify(c));
  // ⛔ 카드 «전체» 에 overflow 를 주면 말풍선 꼬리가 잘린다 — 안쪽 .menu-scroll 만 굴러야 한다
  ck('말풍선 꼬리가 안 잘렸다', !!c.caretVisible);
  ck('버튼이 파란 강조색이다(회색으로 안 돌아갔다)', (c.reopenBg || '').includes('gradient'), c.reopenBg);

  // ── ④ 카드가 가장 긴 경우 = 중국어 선생님 칸이 보이는 학생 ──
  const d = await page.evaluate(async () => {
    const zh = document.getElementById('voiceBtnsZh'), note = document.getElementById('voiceZhNote');
    if (zh) zh.hidden = false; if (note) note.hidden = false;
    await new Promise((r) => setTimeout(r, 200));
    const p = document.getElementById('menuPanel'), re = document.querySelector('.menu-reopen');
    if (!p || !re) return { ok: false, panelBottom: 0, innerH: innerHeight };
    const pb = p.getBoundingClientRect(), rb = re.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(rb.left + rb.width / 2), Math.round(rb.top + rb.height / 2));
    return { panelBottom: Math.round(pb.bottom), innerH: innerHeight,
      ok: rb.bottom <= innerHeight && (el === re || re.contains(el)) };
  });
  ck('중국어 학생(카드가 가장 길 때)도 누를 수 있다', d.ok, `카드끝 ${d.panelBottom} / 화면 ${d.innerH}`);
  await ctx.close();
}
console.log(`\n───────── 통과 ${pass} · 실패 ${fail} ─────────`);
await browser.close(); server.close();
process.exit(fail ? 1 : 0);
