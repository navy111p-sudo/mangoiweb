// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🎥 「녹화 관리 › 저장소 상태」 KPI 타일 + 「🔧 진단」 — 진짜 브라우저로 재는 검사
   (2026-08-26 신설)

   [왜 필요한가] 이 카드는 오랫동안 **거짓말을 하고 있었다.**
     · KPI 4칸(12.4GB · 156파일 · 248MB · ₩4,820)은 admin.html 에 박아 둔 «예시 숫자» 였고
       채우는 코드가 아예 없었다.
     · 옆의 「🔄 새로고침」이 부르는 window.refreshStorageStats 는 저장소 어디에도 없어
       눌러도 아무 일이 없었다(무동작).
     · 「🔧 진단」은 R2 의 'recordings/' 한 접두사만 세어, 실제 녹화가 쌓이는 'rec/' 를
       한 개도 안 봤다 → 파일이 있어도 늘 「0개」.
   셋 다 **문자열 하니스로는 안 보인다** — 함수도 값도 «있는» 것처럼 보이기 때문이다.
   그래서 실제로 그려서 «칸에 무엇이 적혔나» 를 읽는다.

   ⚠️ manual/ 규약상 파일 이름이 *_harness.mjs 가 아니라 **게이트가 물어 가지 않는다.**
      이 카드(또는 /api/recordings/storage-stats · test-r2)를 건드리면 사람이 직접 부를 것:
        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
        PW_DIR=/tmp/pw node test-harness/manual/recording-storage-kpi-browser.mjs

   [무엇을 스텁하나] 로그인이 필요한 API 는 씨앗값으로 대신한다.
   ⚠️ 스텁 때문에 나는 다른 화면의 오류를 이 카드의 버그로 착각하지 말 것.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.RECKPI_PORT || 8913);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* ── 씨앗 — 실제 payload 모양 그대로 ──
   R2 는 3.5GB · 1,234 파일, D1 은 1,692건 중 완료 1,300 · 실패 42 · 30일 내 만료 7.
   실패를 0 이 아닌 값으로 두는 이유: «0 이라 안 보이는 것» 과 «못 채워서 안 보이는 것» 을
   가르려면 눈에 띄는 값이어야 한다. */
const STATS = {
  ok: true,
  r2: { files: 1234, bytes: 3_758_096_384, snapshots: 3, truncated: false },
  d1: { total: 1692, completed: 1300, failed: 42, recording: 5, expiring30d: 7 },
};
const TESTR2 = {
  ok: true, bucket: 'connected', testWrite: true, testContent: 'test-1',
  rec: { prefix: 'rec/', count: 1234, truncated: false },
  legacy: { prefix: 'recordings/', count: 8, truncated: false },
  recordingFiles: [{ key: 'rec/class-895-20260825/9001_1787000000000.webm', size: 2_100_000, uploaded: '2026-08-25T12:38:14Z' }],
};

async function serve() {
  try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 아직 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/admin.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

async function open(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  /* 🪤 «환영 안내»(#aw-overlay)는 열릴 때 html{overflow:hidden} 을 걸고 사람이 닫아야 푼다.
        빈 브라우저는 «첫 방문자» 라 그게 떠 있어 멀쩡한 화면도 실패로 나온다(CLAUDE.md 2장). */
  await page.addInitScript(() => {
    try { localStorage.setItem('mangoi_admin_welcome_v1_done', '1'); } catch (e) { /* 시크릿 모드 */ }
  });
  /* ⚠️ playwright 는 **나중에 등록한 route 가 이긴다.** 포괄 스텁을 먼저 깔고
        구체적인 것을 뒤에 등록해야 한다 — 반대로 하면 포괄이 전부 삼켜
        «화면이 못 채운다» 는 거짓 실패가 난다(이 검사를 짜다 실제로 밟았다). */
  await ctx.route('**/api/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: [], rows: [] }) }));
  await ctx.route('**/api/recordings/blob/list*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], count: 0, truncated: false }) }));
  await ctx.route('**/api/recordings/storage-stats*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATS) }));
  await ctx.route('**/api/recordings/test-r2*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TESTR2) }));
  await page.goto(BASE + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const txt = (page, id) => page.evaluate(i => {
  const e = document.getElementById(i); return e ? (e.textContent || '').trim() : null;
}, id);

async function run() {
  const { chromium, exe } = requireBrowser();
  const server = await serve();
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  try {
    console.log('\n1부 — 저장소 상태 타일이 «진짜» 값으로 채워지는가 (1280px)');
    const { ctx, page } = await open(browser, 1280, 900);

    const hasFn = await page.evaluate(() => typeof window.refreshStorageStats === 'function');
    check('window.refreshStorageStats 가 존재한다 (예전엔 없어서 새로고침이 무동작이었다)', hasFn);

    await page.evaluate(() => window.refreshStorageStats && window.refreshStorageStats());
    await page.waitForTimeout(600);

    const r2size = await txt(page, 'rs-r2-size');
    const r2files = await txt(page, 'rs-r2-files');
    const d1total = await txt(page, 'rs-d1-size');
    const d1done = await txt(page, 'rs-d1-tables');
    const failed = await txt(page, 'rs-rec-failed');
    const failedU = await txt(page, 'rs-rec-failed-u');
    const expiring = await txt(page, 'rs-rec-expiring');

    check('R2 용량이 씨앗값(3.5 GB)으로 그려진다', r2size === '3.5 GB', 'got=' + r2size);
    check('R2 파일 수가 1,234 파일로 그려진다', /1,234/.test(r2files || ''), 'got=' + r2files);
    check('D1 녹화 기록 총건수 1,692', d1total === '1,692', 'got=' + d1total);
    check('D1 완료 건수 1,300 이 단위 칸에 있다', /1,300/.test(d1done || ''), 'got=' + d1done);
    check('저장 실패 42 건', failed === '42', 'got=' + failed);
    check('저장 실패 단위 설명이 있다', !!failedU && failedU !== '—', 'got=' + failedU);
    check('30일 내 만료 7 건', expiring === '7', 'got=' + expiring);

    /* 🔴 예전 «예시 숫자» 가 남아 있으면 안 된다 — 이 카드가 거짓말하던 그 값들이다.
       (하드코딩을 다시 넣으면 이 줄이 FAIL 낸다) */
    const stale = await page.evaluate(() => {
      const g = document.getElementById('rs-kpi-grid');
      const t = g ? (g.textContent || '') : '';
      return ['12.4', '156', '248', '4,820', '1,243'].filter(v => t.includes(v));
    });
    check('옛 예시 숫자(12.4·156·248·₩4,820·1,243)가 화면에 없다', stale.length === 0, '남음: ' + stale.join(', '));

    /* 🌐 JS 로 쓴 글자는 data-ko/data-en 을 함께 박아야 언어 전환을 따라온다(CLAUDE.md 2장) */
    const i18n = await page.evaluate(() => {
      const ids = ['rs-r2-files', 'rs-d1-tables', 'rs-rec-failed-u', 'rs-rec-expiring-u'];
      return ids.map(i => {
        const e = document.getElementById(i);
        return { id: i, ko: e && e.getAttribute('data-ko'), en: e && e.getAttribute('data-en') };
      });
    });
    const missing = i18n.filter(x => !x.ko || !x.en).map(x => x.id);
    check('JS 가 그린 단위 칸 4곳에 data-ko·data-en 이 함께 박혀 있다', missing.length === 0, '빠짐: ' + missing.join(', '));

    console.log('\n2부 — 「🔧 진단」이 rec/ 접두사를 센다');
    await page.evaluate(() => window.testR2 && window.testR2());
    await page.waitForTimeout(600);
    const diag = await txt(page, 'test-r2-result');
    check('진단 문구에 rec/ 개수(1234)가 나온다', /1234/.test(diag || ''), 'got=' + diag);
    check('진단 문구가 두 접두사를 함께 적는다', /rec\//.test(diag || '') && /recordings\//.test(diag || ''), 'got=' + diag);
    check('진단이 «0개» 라고 말하지 않는다', !/[^\d]0개/.test(diag || ''), 'got=' + diag);

    console.log('\n3부 — 레이아웃 (가로 넘침·타일 겹침)');
    for (const w of [390, 768, 1280]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(400);
      const over = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      }));
      check(`${w}px — 문서가 가로로 넘치지 않는다`, over.sw <= over.iw + 1, `scrollWidth=${over.sw} innerWidth=${over.iw}`);
      const cut = await page.evaluate(() => {
        const g = document.getElementById('rs-kpi-grid');
        if (!g) return 'grid 없음';
        const bad = [];
        g.querySelectorAll('.rs-kpi').forEach((k, i) => {
          if (k.scrollWidth > k.clientWidth + 2) bad.push(i + ':' + k.scrollWidth + '>' + k.clientWidth);
        });
        return bad.join(', ');
      });
      check(`${w}px — 타일 안 글자가 칸을 넘지 않는다`, cut === '', cut);
    }

    console.log('\n4부 — 값이 실제로 읽히는가 (관리자 화면은 CSS·페인터가 색을 덮는다)');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);
    const contrast = await page.evaluate(() => {
      const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const L = rgb => { const m = String(rgb).match(/\d+(\.\d+)?/g).map(Number); return 0.2126 * lin(m[0]) + 0.7152 * lin(m[1]) + 0.0722 * lin(m[2]); };
      const bgOf = el => { let n = el; while (n) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return b; n = n.parentElement; } return 'rgb(255,255,255)'; };
      const out = [];
      ['rs-r2-size', 'rs-d1-size', 'rs-rec-failed', 'rs-rec-expiring'].forEach(i => {
        const e = document.getElementById(i); if (!e) return;
        const a = L(getComputedStyle(e).color), b = L(bgOf(e));
        const hi = Math.max(a, b), lo = Math.min(a, b);
        out.push({ id: i, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, size: parseFloat(getComputedStyle(e).fontSize) });
      });
      return out;
    });
    contrast.forEach(c => {
      // 값 글자는 크다(보통 24px 이상) → WCAG 큰 글자 기준 3:1
      check(`${c.id} 값이 읽힌다 (대비 ${c.ratio}, ${c.size}px)`, c.ratio >= 3, '대비 ' + c.ratio);
    });

    await ctx.close();
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}`);
  process.exit(FAIL ? 1 : 0);
}

run().catch(e => { console.error(e); process.exit(1); });
