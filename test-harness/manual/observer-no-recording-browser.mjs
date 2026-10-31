// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   👁 「참관자는 녹화하지 않는다」 — 진짜 브라우저에서 «요청이 나가는가» 로 재는 검사
   (2026-08-26 신설 · 사장님 지시 「관찰자는 녹화 안 하게 해줘」)

   [왜 문자열 검사로는 부족한가] 자동녹화는 2초마다 도는 폴링 + 3초 지연으로 시작한다.
   조건이 한 줄만 어긋나도 «코드는 있는데 그래도 켜지는» 상태가 되는데, 소스만 봐서는
   그걸 알 수 없다. 그래서 **네트워크로 `/api/recordings/start` 가 나가는지**를 본다.
   (이 저장소의 반복된 교훈 — CLAUDE.md 2장 「화면 좌표가 틀린 버그를 하니스가 못 잡음」)

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      mango-rec.js 의 자동녹화·참관 판정을 건드리면 사람이 직접 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/observer-no-recording-browser.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.OBSREC_PORT || 8917);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

async function serve() {
  try { const r = await fetch(BASE + '/index.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/index.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

/** 수업 화면에 «들어와 있는» 상태를 만든다. observer=true 면 참관자로. */
async function openCall(browser, observer) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const started = [];   // 나간 /api/recordings/start 요청

  // 참관 여부는 **페이지 스크립트보다 먼저** 심는다(참관 입장은 DOMContentLoaded 직후다)
  await page.addInitScript((obs) => {
    try { localStorage.setItem('mangoi_lang', 'ko'); } catch (e) { /* 시크릿 */ }
    if (obs) { window._vcObserverMode = true; }
  }, observer);

  await ctx.route('**/api/**', route => {
    const u = route.request().url();
    if (/\/api\/recordings\/start/.test(u)) started.push(u);
    // 시작 요청에는 «동의 다 됨» 모양으로 답한다 — 여기서 막히면 관찰자든 아니든 0건이 되어
    // 검사가 «통과» 로 보이는 거짓 초록이 난다.
    if (/\/api\/recordings\/start/.test(u)) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, recording_id: 1, consented_count: 1, total_participants: 1, non_consented: [] }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], rows: [] }) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 수업 화면에 «들어온» 상태로 만든다 — 자동녹화 폴링이 보는 것은 이 둘뿐이다.
  await page.evaluate((obs) => {
    if (obs) { window._vcObserverMode = true; window.vcIsObserver = true; }
    document.body.classList.add('vc-in-call');
    var v = document.getElementById('view-videocall-call');
    if (v) v.style.display = '';
  }, observer);

  return { ctx, page, started };
}

async function run() {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    /* 자동녹화는 «2초 폴링 + 3초 지연» 이라 넉넉히 9초를 기다린다. */
    console.log('\n1부 — 참관자로 수업 화면에 있어도 녹화가 시작되지 않는가');
    {
      const { ctx, page, started } = await openCall(browser, true);
      await page.waitForTimeout(9000);
      check('참관 중에는 /api/recordings/start 가 한 번도 안 나간다', started.length === 0, '나감: ' + started.length + '건');

      const flags = await page.evaluate(() => ({
        obs: !!window._vcObserverMode,
        inCall: document.body.classList.contains('vc-in-call'),
        badge: !!document.getElementById('mango-rec-badge'),
      }));
      check('검사 전제가 성립한다 (참관 + 수업 화면 안)', flags.obs && flags.inCall,
            JSON.stringify(flags));
      check('«녹화 꺼짐 · 눌러서 시작» 배지도 안 뜬다', !flags.badge);

      // 손으로 눌러도 안 켜져야 한다
      await page.evaluate(() => { try { window.MangoV3 && window.MangoV3.startRecording && window.MangoV3.startRecording(); } catch (e) {} });
      await page.waitForTimeout(1500);
      check('수동으로 불러도 시작되지 않는다', started.length === 0, '나감: ' + started.length + '건');
      await ctx.close();
    }

    /* 🔴 이 두 번째가 없으면 «아무것도 안 켜지는» 상태도 통과해 버린다.
       즉 검사에 판별력이 있는지 스스로 확인하는 절이다. */
    console.log('\n2부 — 참관이 아니면 «여전히» 녹화가 시작되는가 (거짓 초록 방지)');
    {
      const { ctx, page, started } = await openCall(browser, false);
      await page.waitForTimeout(9000);
      check('일반 입장에서는 /api/recordings/start 가 나간다', started.length > 0,
            '한 건도 안 나갔다 — 참관 여부와 무관하게 녹화가 죽었을 수 있다');
      await ctx.close();
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
