/**
 * 📚 「대기 카드에서 교재를 고를 수 있다」 — 진짜 브라우저로 확인 (2026-08-24)
 * ---------------------------------------------------------------------------
 * 왜 손으로 만들었나
 *   고친 것이 «화면 어디에 무엇이 있는가» 다. 문자열 하니스는 그것을 못 본다
 *   (CLAUDE.md: 「화면 좌표가 틀린 버그를 하니스가 못 잡음」). 원래 버그도 그랬다 —
 *   버튼은 «있었지만» 390px 폰 화면 밖(x≥735)이었고, 코드만 보면 멀쩡했다.
 *
 * 무엇을 재나
 *   ① 강사에게 대기 카드 위 입구 두 개가 «화면 안에» 그려진다
 *   ② 그 버튼이 실제로 «맨 위» 다 — 버튼 영역 9점을 elementsFromPoint 로 훑는다.
 *      (떠 있는 듀얼 시계 #mgWorldClock 는 z-index 2147483000 이고, 대기 카드는
 *       z-index:8 로 자기 쌓임 맥락을 만들어 «안에서 올려도» 못 이긴다 —
 *       그래서 «겹치지 않는 자리» 인지를 좌표로 재는 것 말고는 확인할 방법이 없다)
 *   ③ 📚 를 누르면 교재 라이브러리 모달이 정말 열린다
 *   ④ 📁 를 누르면 숨은 #pdf-upload 가 click 을 받는다(폰 파일 선택창)
 *   ⑤ 학생에게는 안 보인다 / 교재가 오면 사라진다 / 🌐 를 따라간다
 *   ⑥ 라벨이 한 줄에 들어간다 — 두 줄이 되면 카드 위 여백이 커져 미스터망고가 잘린다
 *
 * ⚠️ file:// 로 열면 안 된다 — <script src="/js/…"> 가 전부 404 다(CLAUDE.md 2장).
 *
 * ⏳ manual/ 규약상 자동으로 안 돈다. js/idx-vc-wait-actions.js ·
 *    js/idx-vc-textbook.js 의 대기 카드 · #vc-wait-card 를 건드리면 사람이 부를 것:
 *      PW_DIR=/tmp/pw node test-harness/manual/vc-wait-actions-browser.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = 8938;

let pass = 0, fail = 0;
const ok = (label, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? ' — ' + detail : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
                  { cwd: PUB, stdio: 'ignore' });
await sleep(1200);

const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });

/** 수업 중 · 교재 탭 · 교재 없음(=대기 카드) 상태를 만든다. */
async function scene(role, lang, vp) {
  const page = await browser.newPage({ viewport: vp, isMobile: vp.width < 800, hasTouch: vp.width < 800 });
  page.on('pageerror', e => console.log('   PAGEERR ' + String(e).slice(0, 160)));
  // 첫 방문자 오버레이(#aw-overlay)와 회전 안내는 스크롤·클릭을 막는다 → «본 것으로»(CLAUDE.md)
  await page.addInitScript(l => {
    try {
      localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
      localStorage.setItem('mangoi_vc_orientation_dismissed', '1');
      localStorage.setItem('mangoi_lang', l);
    } catch (_) {}
  }, lang);
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(2800);
  await page.evaluate(r => {
    window.vcMyRole = r;
    document.body.classList.add('vc-in-call', 'vc-orientation-dismissed');
    try { window.showView && window.showView('view-videocall-call'); } catch (_) {}
    try { window.vcSwitchTab && window.vcSwitchTab('pdf'); } catch (_) {}
    try { window.vcClassLockChipsRender && window.vcClassLockChipsRender(); } catch (_) {}
    try { window.vcWaitCardSync && window.vcWaitCardSync(); } catch (_) {}
  }, role);
  await sleep(900);
  return page;
}

/** 버튼 영역 9점을 훑어 «맨 위가 나인가» 를 본다 — 「보이는데 안 눌린다」 함정용. */
const PROBE = () => {
  const box = document.getElementById('vc-wait-actions');
  if (!box || getComputedStyle(box).display === 'none') return null;
  return [...box.children].map(b => {
    const q = b.getBoundingClientRect();
    const blocked = [];
    for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.15, 0.5, 0.85]) {
      const x = q.x + q.width * fx, y = q.y + q.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) { blocked.push('offscreen'); continue; }
      const t = document.elementsFromPoint(x, y)[0];
      if (t !== b) blocked.push((t && (t.id || t.tagName)) + '@' + fx + ',' + fy);
    }
    return { txt: b.textContent, x: q.x | 0, y: q.y | 0, w: q.width | 0, h: q.height | 0, blocked };
  });
};

/* ── ①②⑥ 여러 폭에서 «화면 안 · 맨 위 · 한 줄» ── */
for (const [lang, vp] of [['ko', { width: 360, height: 740 }], ['ko', { width: 390, height: 844 }],
                          ['ko', { width: 412, height: 915 }], ['ko', { width: 740, height: 360 }],
                          ['en', { width: 360, height: 740 }], ['en', { width: 390, height: 844 }],
                          ['ko', { width: 1440, height: 900 }]]) {
  const tag = `${vp.width}x${vp.height}·${lang}`;
  const page = await scene('teacher', lang, vp);
  const r = await page.evaluate(PROBE);
  ok(`${tag} 입구 2개가 그려진다`, !!r && r.length === 2, JSON.stringify(r));
  ok(`${tag} 두 버튼 모두 가려지지 않는다`, !!r && r.every(b => b.blocked.length === 0), JSON.stringify(r));
  ok(`${tag} 라벨이 한 줄에 들어간다`, !!r && r[0].y === r[1].y, JSON.stringify(r && r.map(b => [b.txt, b.y])));
  await page.close();
}

/* ── ③ 📚 → 라이브러리 모달 ── */
{
  const page = await scene('teacher', 'ko', { width: 390, height: 844 });
  await page.evaluate(() => {
    window.fetch = async () => new Response(JSON.stringify({ items: [], textbooks: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await page.locator('#vc-wait-actions > button').first().tap();
  await sleep(700);
  const m = await page.evaluate(() => {
    const el = document.getElementById('tbf-lib-modal');
    return { disp: getComputedStyle(el).display, w: el.getBoundingClientRect().width | 0 };
  });
  ok('📚 → 교재 라이브러리 모달이 실제로 열린다', m.disp === 'flex' && m.w > 0, JSON.stringify(m));
  await page.evaluate(() => { try { window.closeTextbookLibrary(); } catch (_) {} });

  /* ④ 📁 → 숨은 파일 입력. .pdf-controls 가 display:none 이어도 click 은 간다(그게 전제다). */
  await page.evaluate(() => {
    window.__upClicks = 0;
    document.getElementById('pdf-upload')
      .addEventListener('click', e => { window.__upClicks++; e.preventDefault(); }, true);
  });
  await sleep(300);
  await page.locator('#vc-wait-actions > button').nth(1).tap();
  await sleep(500);
  const u = await page.evaluate(() => ({
    clicks: window.__upClicks,
    barDisp: getComputedStyle(document.querySelector('#tab-pdf .pdf-controls')).display,
  }));
  ok('📁 → 숨은 #pdf-upload 가 click 을 받는다(파일 선택창)', u.clicks === 1, JSON.stringify(u));
  ok('(전제) 폰에서 교재 툴바는 여전히 접혀 있다', u.barDisp === 'none', u.barDisp);
  await page.close();
}

/* ── ⑤ 학생 · 교재 도착 · 🌐 ── */
{
  const page = await scene('student', 'ko', { width: 390, height: 844 });
  const r = await page.evaluate(() => {
    const box = document.getElementById('vc-wait-actions');
    return { card: document.getElementById('vc-wait-card').style.display,
             box: box ? getComputedStyle(box).display : '(안 만들어짐)' };
  });
  ok('학생에겐 카드만 보이고 교재 입구는 없다',
     r.card === 'flex' && (r.box === '(안 만들어짐)' || r.box === 'none'), JSON.stringify(r));
  await page.close();
}
{
  const page = await scene('teacher', 'ko', { width: 390, height: 844 });
  const r = await page.evaluate(() => {
    window._vcCurrentPdfUrl = '/x.jpg';
    window.vcWaitCardSync();
    return { card: document.getElementById('vc-wait-card').style.display,
             box: document.getElementById('vc-wait-actions').style.display,
             pad: document.getElementById('vc-wait-card').style.paddingTop };
  });
  ok('교재가 오면 카드·입구·여백이 함께 사라진다',
     r.card === 'none' && r.box === 'none' && !r.pad, JSON.stringify(r));
  await page.close();
}
{
  const page = await scene('teacher', 'en', { width: 390, height: 844 });
  const r = await page.evaluate(() => {
    localStorage.setItem('mangoi_lang', 'ko');
    window.vcWaitCardSync();
    return [...document.getElementById('vc-wait-actions').children].map(b => b.textContent);
  });
  ok('🌐 언어 전환을 따라간다(data-ko/data-en)', /교재/.test(r[0]), JSON.stringify(r));
  await page.close();
}

console.log((fail ? '❌' : '✅') + ` PASS ${pass} / FAIL ${fail}`);
await browser.close();
srv.kill();
process.exit(fail ? 1 : 0);
