// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════
 * 원장 검수 피드백 2·6번 수정이 «화면에서 실제로» 동작하는가 (11건)
 *   (2026-08-24, PR #445 — docs/작업기록/260824_원장피드백_… 참고)
 *
 *   A. index.html — 중국어 복습퀴즈 조건 표시 + 「레벨 테스트」 타일
 *      · 비수강생: 드로어·퀵버튼·「AI와 친구하기」 목록의 중국어 항목 전부 숨김
 *      · mangoi_zh_learner=1 이면 전부 복귀
 *   B. judgment.html — 「레벨 다시 재기」 상시 버튼 + ?placement=1 즉시 시작
 *
 *   ⚠️ 원장 피드백 1번(웜업 「뜻」 직역)과 3·4·5번(판단력 훈련 문법)은
 *      각각 PR #443·#448 이 더 근본적인 방식으로 이미 해결해서 이 PR 에서는 뺐다
 *      (겹치면 같은 함수에 서로 다른 2차 교정 로직이 두 벌 쌓인다) — 그래서 C 섹션(warmup.html) 없음.
 *
 *   ⚠️ 문자열 하니스로는 못 잡는 것들이라 실제 Chromium 으로 잰다.
 *      «게이트가 물어 가지 않는» manual/ 검사다 — 이 화면들을 고치면 사람이 부른다:
 *        mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
 *        PW_DIR=/tmp/pw node test-harness/manual/feedback-menu-level-warmup-browser.mjs
 *   ⚠️ API 는 전부 스텁이다(로그인·AI 불필요). 스텁 응답 때문에 나는 콘솔 에러를
 *      진짜 버그로 읽지 말 것(CLAUDE.md 2장).
 * ═══════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC = join(ROOT, 'cloudflare-deploy', 'public');
const PORT = Number(process.env.FB_PORT || 8931);
const BASE = `http://127.0.0.1:${PORT}`;

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  OK   ' + n); }
  else { FAIL++; console.log('  FAIL ' + n + (why ? ' — ' + why : '')); }
};

/* ── 정적 서버 (crumb-sticky-browser.mjs 와 같은 패턴) ─────────────────── */
async function serve() {
  try { const r = await fetch(BASE + '/index.html', { method: 'HEAD' }); if (r.ok) return null; } catch { /* 띄운다 */ }
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: PUBLIC, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const r = await fetch(BASE + '/index.html', { method: 'HEAD' }); if (r.ok) return p; } catch { /* 아직 */ }
  }
  p.kill();
  throw new Error(`정적 서버를 못 띄웠습니다 (${PUBLIC})`);
}

/* ── API 스텁 — 판단력 시나리오·번역만 진짜 모양, 나머지는 {ok:true} ────── */
const SCEN = {
  ok: true, situation: 'Your friend wants to play right now.',
  options: ['I can play later.', 'No, I am busy.', 'Can I play tomorrow?'],
  correct_index: 2, option_scores: [70, 40, 95], difficulty: 2,
  why: 'x', why_ko: 'y', sid: 's1', reading_band: 4, reading_band_label: 'mid',
  reading_band_name: 'Basic', band_mode: 'auto', band_moved: 0, band_at_edge: false, band_picked: 0,
  band_catalog: [
    { band: 3, n: '기초', en: 'Basic', zh: '基础', lv: 'Lv 5-8', d: '짧은 문장', den: 'short', dzh: '短句' },
    { band: 4, n: '중급', en: 'Mid', zh: '中级', lv: 'Lv 9-12', d: '보통 문장', den: 'mid', dzh: '中句' },
  ],
  based_on: { source: 'none' },
};
async function stubApis(context) {
  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/judgment/scenario'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCEN) });
    if (url.includes('/api/translate')) {
      let body = {}; try { body = route.request().postDataJSON(); } catch { /* 무시 */ }
      const map = {}; (body.texts || []).forEach((t) => { map[t] = 'SERVER_TRANSLATION'; });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, map }) });
    }
    if (url.includes('/api/warmup/context'))     // 실패시켜 fallbackGreeting(고정 첫인사)으로 보낸다
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
}

const server = await serve();
const { chromium, exe } = requireBrowser();
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  /* ══ A. index.html — 중국어 메뉴 조건 표시 + 레벨 테스트 타일 ══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    await stubApis(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);

    const hidden = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-go="review-quiz-cn"], button[onclick*="review-quiz-cn"]');
      return { n: els.length, hidden: Array.prototype.every.call(els, (e) => e.style.display === 'none') };
    });
    check('A1 비수강생: 정적 중국어 버튼 전부 숨김 (드로어·퀵버튼)', hidden.n >= 2 && hidden.hidden, `버튼 ${hidden.n}개`);

    // 「AI와 친구하기」 목록은 처음 열 때 만들어진다 — 옵저버가 붙는 순간 가리는지
    await page.evaluate(() => window.openAiFriendsOverlay && window.openAiFriendsOverlay());
    await page.waitForTimeout(800);
    const aif = await page.evaluate(() => {
      const ov = document.getElementById('ai-friends-ov');
      if (!ov) return null;
      const cn = Array.prototype.find.call(ov.querySelectorAll('.aif-item'),
        (b) => (b.getAttribute('onclick') || '').indexOf('review-quiz-cn') >= 0);
      return { cnExists: !!cn, cnHidden: cn ? cn.style.display === 'none' : null };
    });
    check('A2 비수강생: 「AI와 친구하기」 목록의 중국어 항목도 숨김(옵저버)', !!aif && aif.cnExists && aif.cnHidden, JSON.stringify(aif));

    await page.evaluate(() => window.openAllMenuOverlay && window.openAllMenuOverlay());
    await page.waitForTimeout(600);
    const tiles = await page.evaluate(() => {
      const g = document.getElementById('mgam-grid');
      return g ? Array.prototype.map.call(g.querySelectorAll('.mgam-card span:last-child'), (s) => s.textContent.trim()) : null;
    });
    check('A3 비수강생: 전체메뉴에 중국어 복습퀴즈 없음', !!tiles && !tiles.includes('중국어 복습퀴즈'), tiles ? tiles.length + '타일' : '그리드 없음');
    check('A4 전체메뉴에 「레벨 테스트」 타일 있음', !!tiles && tiles.includes('레벨 테스트'));
    const lvUrl = await page.evaluate(() => {
      const a = Array.prototype.find.call(document.querySelectorAll('#mgam-grid a'), (x) => x.textContent.indexOf('레벨 테스트') >= 0);
      return a ? a.getAttribute('href') : '';
    });
    check('A5 레벨 테스트 타일 → /judgment.html?placement=1', lvUrl === '/judgment.html?placement=1', lvUrl);

    await page.evaluate(() => localStorage.setItem('mangoi_zh_learner', '1'));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const shown = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-go="review-quiz-cn"], button[onclick*="review-quiz-cn"]');
      return Array.prototype.every.call(els, (e) => e.style.display !== 'none');
    });
    check('A6 수강생 표시 후: 중국어 버튼 전부 복귀', shown);
    await page.evaluate(() => window.openAllMenuOverlay && window.openAllMenuOverlay());
    await page.waitForTimeout(600);
    const tiles2 = await page.evaluate(() => {
      const g = document.getElementById('mgam-grid');
      return g ? Array.prototype.map.call(g.querySelectorAll('.mgam-card span:last-child'), (s) => s.textContent.trim()) : [];
    });
    check('A7 수강생: 전체메뉴에 중국어 복습퀴즈 복귀', tiles2.includes('중국어 복습퀴즈'));
    await ctx.close();
  }

  /* ══ B. judgment.html — 레벨 다시 재기 + ?placement=1 ══ */
  {
    const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
    await stubApis(ctx);
    await ctx.addInitScript(() => {
      localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'stu1', name: 'Test' }));
      localStorage.setItem('mangoi_lang', 'ko');
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/judgment.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    const q = await page.evaluate(() => {
      const stage = document.getElementById('stage');
      const btn = Array.prototype.find.call(stage.querySelectorAll('.lvladj button'), (b) => b.textContent.indexOf('레벨 다시 재기') >= 0);
      return { hasSituation: stage.textContent.indexOf('Your friend wants to play') >= 0, hasBtn: !!btn };
    });
    check('B1 문제 화면 렌더(스텁 시나리오)', q.hasSituation);
    check('B2 [레벨 다시 재기] 버튼 상시 노출', q.hasBtn);
    await page.evaluate(() => {
      const btn = Array.prototype.find.call(document.querySelectorAll('.lvladj button'), (b) => b.textContent.indexOf('레벨 다시 재기') >= 0);
      btn && btn.click();
    });
    await page.waitForTimeout(1500);
    check('B3 버튼 클릭 → 레벨 찾기(배치) 시작',
      await page.evaluate(() => document.getElementById('stage').textContent.indexOf('레벨 찾기') >= 0));

    const page2 = await ctx.newPage();
    await page2.goto(BASE + '/judgment.html?placement=1', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page2.waitForTimeout(2000);
    const pl2 = await page2.evaluate(() => {
      const t = document.getElementById('stage').textContent;
      return { placement: t.indexOf('레벨 찾기') >= 0, step: t.indexOf('1 / 6') >= 0 };
    });
    check('B4 ?placement=1 → 곧장 「레벨 찾기 1/6」', pl2.placement && pl2.step, JSON.stringify(pl2));
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

console.log(`\n원장 피드백 화면 검사: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
