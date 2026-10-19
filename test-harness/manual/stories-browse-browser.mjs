#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// 📚 stories-browse-browser — 영어 독서 «고르기 화면» C안 (2026-10-18 사장님 「스크롤 없이 한 장에 · 드롭다운」)
//   진짜 Chromium 으로 /stories.html 을 열어 «무엇이 그려지고 눌리는가» 를 잰다:
//   ① 한 화면 맞춤 — PC 3크기에서 페이지·목록·상세 모두 스크롤 0, 12편 전부 보임, 가로 스크롤 0
//      (짝) 폰 390 은 한 장 고정을 풀고 목록 → 상세로 쌓인다
//   ② 드롭다운 — 열면 항목이 «맨 위» · 다른 것을 열면 앞의 것이 닫힘 · Esc 로 닫히고 포커스가 단추로 · 바깥 누르면 닫힘
//   ③ 거르기 — «하는 중» 이면 그 글만 · (짝) «전체» 로 되돌리면 12편
//   ④ 고르기 — 목록을 누르면 상세가 그 글 · ↓/↑ 로 옮겨 다님 · 다음 글/이전 글
//   ⑤ 읽기 → 목록 — 읽기 화면에서는 한 장 고정이 풀리고, 돌아오면 그 글이 그대로 골라져 있다
//   ⑥ 그림 동화책 — 2단계에만 있다 (짝) 1단계에는 없다
//   ⑦ 영어 — EN 에서는 우리말 제목이 빠진다 (짝) KO 에는 있다
//   ⑧ 글자 대비 — 밝은·어두운 모드에서 주요 글자가 WCAG 기준 이상(반투명 층은 합성해서 잰다)
//   ⑨ JS 오류 0
//   ⑩ 실제 노트북 «창» 높이(2026-10-19) — 1366×768 화면은 창이 약 640px, 1280×720 은 약 600px 이다.
//      그 창에서도 12편이 목록 안쪽 스크롤 없이 다 보인다 · 4단계 48편 전부 제목칸이 안 잘리고 «읽기 시작» 이 «맨 위»
//      태블릿 1024×768 · 낮은 노트북 1024×600 · EN 900×600·960×640 에서도 48편 전부 목록·상세 칸 안쪽 스크롤이 없다
//   ⑪ 좁은 창(821~1100) 압축 — 도구 줄 한 줄 · 이전·다음 글은 화살표(이름은 낭독기에 남음) · 계단·«단계»«정렬» 이름표·편수는 감춤
//      (짝) 넓은 창에서는 전부 그대로 보이고, «주제»·«상태» 이름표는 좁은 창에서도 남는다
//      (짝) 버튼 줄은 한 장 고정일 때만 상세 칸 바닥에 붙고(sticky) 폰 390 에서는 붙지 않는다
//   ⑫ 한 줄 맞추기(2026-10-19) — «N단계로 올라가기» 가 뜨면 도구 줄이 다시 두 줄로 접혔다(2단계 · 아이패드 가로 · 900~1100 창).
//      줄이 «실제로 넘칠 때만» js(fitRows)가 «N/12편» → 계단 → 긴 이름 → 단계 이름 순으로 줄여 한 줄로 만든다
//      · 줄인 이름도 낭독기 이름은 그대로(접근성 트리) · 그림책 버튼은 🖼 만 · 머리줄도 한 줄(부제만 «…»)
//      (짝) 넓은 창은 아무것도 안 줄인다 · 아래로 쌓는 창(800 폭)은 안 건드린다 · 창 크기를 바꾸면 다시 잰다
//   ⚠️ 자동으로 안 돕니다 — 사람이 부릅니다:  node test-harness/manual/stories-browse-browser.mjs
//   STORIES_SRC=<고친 public 폴더> 로 변이시험을 합니다(저장소 파일은 건드리지 마세요).
//   서버는 python http.server 로 띄우고, /api/** 는 가짜 응답이라 D1 에 아무것도 안 씁니다.
// ═══════════════════════════════════════════════════════════════════════
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
for (const p of [process.env.PW_DIR && resolve(process.env.PW_DIR, 'node_modules/playwright'), process.env.PW_DIR && resolve(process.env.PW_DIR, 'node_modules/playwright-core'), '/opt/node22/lib/node_modules/playwright', 'playwright']) {
  if (!p) continue; try { pw = require(p); break; } catch {}
}
if (!pw) { console.log('playwright 없음 — 건너뜀'); process.exit(0); }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUB = process.env.STORIES_SRC || resolve(ROOT, 'cloudflare-deploy/public');
// STORIES_PORT — 변이시험처럼 여러 벌을 동시에 돌릴 때 포트가 겹치지 않게(겹치면 남의 사본을 재거나 도중에 연결이 끊김)
const PORT = Number(process.env.STORIES_PORT) || 8600 + Math.floor(Math.random() * 150);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: PUB, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 900));

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ❌ FAIL ' + n + (x != null ? ' — ' + x : '')); } };

// 1단계: 01 완료 · 02·03 하는 중 · 나머지 새 글 — 세 상태가 다 있어야 거르기가 무엇을 하는지 보인다
const SEED = { stage: 1, prog: { 's1-01': { k: 'ok', m: 'ok', s: 'great' }, 's1-02': { k: 'ok', m: 'retry' }, 's1-03': { k: 'ok' } } };
const DOING = ['s1-02', 's1-03'];

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => pw.chromium.launch());

async function openPage({ w, h, lang = 'ko', scheme = 'light', seed = SEED }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  // 한 번만 심는다 — reload 마다 다시 지우면 «돌아와도 남는가» 를 못 잰다
  await page.addInitScript(([lang, seed]) => {
    try {
      if (!sessionStorage.getItem('__rlSeeded')) {
        localStorage.clear();
        localStorage.setItem('story_lang', lang);
        localStorage.setItem('reading_ladder_v1', JSON.stringify(seed));
        sessionStorage.setItem('__rlSeeded', '1');
      }
    } catch (e) {}
  }, [lang, seed]);
  await page.goto(`http://127.0.0.1:${PORT}/stories.html?_nc=${Date.now()}`, { waitUntil: 'load' });
  await page.waitForTimeout(450);
  return { ctx, page, errs };
}

const T2 = (lang, ko, en) => (lang === 'en' ? en : ko);
const dd = (page, i) => page.locator('details.rl-dd').nth(i);
const openDd = (page) => page.evaluate(() => [...document.querySelectorAll('details.rl-dd')].map((d) => d.open));
const ids = (page) => page.evaluate(() => [...document.querySelectorAll('.rl-item')].map((x) => x.getAttribute('data-id')));
const selId = (page) => page.evaluate(() => { const s = document.querySelector('.rl-item.sel'); return s ? s.getAttribute('data-id') : null; });
const detTitle = (page) => page.evaluate(() => { const h = document.querySelector('.rl-detail h2'); return h ? h.textContent : null; });
const itemTitle = (page, id) => page.evaluate((id) => { const b = document.querySelector('.rl-item[data-id="' + id + '"] b'); return b ? b.textContent : null; }, id);
async function safeClick(loc, name) {
  try { await loc.click({ timeout: 3000 }); return true; } catch (e) { ok(false, name + ' — 누를 수 없음', String(e.message).split('\n')[0]); return false; }
}

try {
  // ── ① 한 화면 맞춤 ────────────────────────────────────────────────
  console.log('▶ ① 한 화면 맞춤');
  for (const [w, h, lang] of [[1440, 860, 'ko'], [1280, 720, 'ko'], [1280, 720, 'en'], [1024, 700, 'ko']]) {
    const { ctx, page, errs } = await openPage({ w, h, lang });
    const tag = `${w}x${h} ${lang}`;
    const m = await page.evaluate(() => {
      const L = document.querySelector('.rl-list'), D = document.querySelector('.rl-detail');
      return { sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth,
        browse: document.documentElement.classList.contains('rl-browse'),
        list: L ? [L.scrollHeight, L.clientHeight] : null, det: D ? [D.scrollHeight, D.clientHeight] : null,
        items: document.querySelectorAll('.rl-item').length,
        lastIn: (() => { const it = [...document.querySelectorAll('.rl-item')].pop(); if (!it) return false; const r = it.getBoundingClientRect(); return r.bottom <= innerHeight + 1; })(),
        cta: (() => { const c = document.querySelector('.rl-cta'); if (!c) return false; const r = c.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight + 1 && !!t && c.contains(t); })() };
    });
    ok(m.browse, `${tag} 고르기 화면에 rl-browse 가 붙는다`);
    ok(m.sh <= m.ih + 1, `${tag} 페이지 세로 스크롤 없음`, `${m.sh} > ${m.ih}`);
    ok(m.sw <= m.iw, `${tag} 가로 스크롤 없음`, `${m.sw} > ${m.iw}`);
    ok(m.items === 12, `${tag} 1단계 12편이 목록에 다 있다`, m.items);
    ok(m.list && m.list[0] <= m.list[1] + 1, `${tag} 목록 안쪽도 스크롤 없음`, m.list && m.list.join('/'));
    ok(m.det && m.det[0] <= m.det[1] + 1, `${tag} 상세 안쪽도 스크롤 없음`, m.det && m.det.join('/'));
    ok(m.lastIn, `${tag} 마지막 글(12번)이 화면 안에 있다`);
    ok(m.cta, `${tag} 큰 버튼이 화면 안이고 «맨 위» 에 있다`);
    ok(errs.length === 0, `${tag} JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }
  {
    // (짝) 폰 — 한 장 고정을 풀고 쌓는다(안 풀면 글자가 깨알이 된다)
    const { ctx, page, errs } = await openPage({ w: 390, h: 844 });
    const m = await page.evaluate(() => {
      const L = document.querySelector('.rl-list').getBoundingClientRect(), D = document.querySelector('.rl-detail').getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, stacked: D.top >= L.bottom - 1 };
    });
    ok(m.sw <= m.iw, '390 가로 스크롤 없음', `${m.sw} > ${m.iw}`);
    ok(m.stacked, '390 목록 → 상세로 쌓인다');
    ok(m.sh > m.ih, '390 은 한 장 고정이 풀려 아래로 스크롤한다', `${m.sh} <= ${m.ih}`);
    ok(errs.length === 0, '390 JS 오류 0', errs.join(' | '));
    await ctx.close();
  }

  // ── ②~⑤ 실제 조작 (1280×720) ─────────────────────────────────────
  console.log('▶ ②~⑤ 드롭다운·거르기·고르기·읽기↔목록');
  {
    const { ctx, page, errs } = await openPage({ w: 1280, h: 720 });
    ok(JSON.stringify(await openDd(page)) === JSON.stringify([false, false, false, false]), '전제: 시작할 때 드롭다운 4개가 다 닫혀 있다', JSON.stringify(await openDd(page)));

    // ② 주제 드롭다운 — 열리고 항목이 «맨 위»
    if (await safeClick(dd(page, 1).locator('summary'), '주제 드롭다운')) {
      await page.waitForTimeout(150);
      const t = await page.evaluate(() => {
        const d = document.querySelectorAll('details.rl-dd')[1]; const opts = [...d.querySelectorAll('.rl-dd-opt')];
        return { open: d.open, n: opts.length, top: opts.length > 0 && opts.every((o) => { const r = o.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return y < innerHeight && !!hit && o.contains(hit); }) };
      });
      ok(t.open, '주제 드롭다운이 열린다');
      ok(t.n >= 2, '주제 항목이 «전체» 말고도 있다', t.n);
      ok(t.top, '주제 항목이 전부 화면 안 «맨 위» 에 있다(가려지지 않음)');
    }
    // 다른 것을 열면 앞의 것이 닫힌다
    if (await safeClick(dd(page, 2).locator('summary'), '상태 드롭다운')) {
      await page.waitForTimeout(150);
      const o = await openDd(page);
      ok(o[2] === true && o[1] === false, '상태를 열면 주제는 닫힌다', JSON.stringify(o));
    }
    // Esc → 닫히고 포커스가 그 단추로
    await page.keyboard.press('Escape'); await page.waitForTimeout(120);
    const esc = await page.evaluate(() => ({ any: [...document.querySelectorAll('details.rl-dd')].some((d) => d.open), focusSummary: !!(document.activeElement && document.activeElement.matches && document.activeElement.matches('details.rl-dd summary')) }));
    ok(!esc.any, 'Esc 로 드롭다운이 닫힌다');
    ok(esc.focusSummary, 'Esc 뒤 포커스가 드롭다운 단추로 돌아온다');
    // 바깥 누르기 → 닫힘
    if (await safeClick(dd(page, 1).locator('summary'), '주제 드롭다운(다시)')) {
      await page.waitForTimeout(100);
      await page.mouse.click(1270, 710); await page.waitForTimeout(150);
      ok((await openDd(page)).every((x) => !x), '바깥을 누르면 드롭다운이 닫힌다', JSON.stringify(await openDd(page)));
    }

    // ③ 상태 «하는 중» → 그 글만 · (짝) «전체» → 12편
    if (await safeClick(dd(page, 2).locator('summary'), '상태 드롭다운(거르기)')) {
      await page.waitForTimeout(100);
      if (await safeClick(dd(page, 2).locator('[data-v="doing"]'), '«하는 중» 항목')) {
        await page.waitForTimeout(150);
        const got = await ids(page);
        ok(JSON.stringify(got) === JSON.stringify(DOING), '«하는 중» 으로 거르면 그 글만 남는다', got.join(','));
        const cnt = await page.evaluate(() => (document.querySelector('.rl-count b') || {}).textContent);
        ok(cnt === String(DOING.length), '보이는 편수가 거른 결과와 같다', cnt);
      }
    }
    if (await safeClick(dd(page, 2).locator('summary'), '상태 드롭다운(되돌리기)')) {
      await page.waitForTimeout(100);
      if (await safeClick(dd(page, 2).locator('[data-v=""]'), '«전체» 항목')) {
        await page.waitForTimeout(150);
        ok((await ids(page)).length === 12, '(짝) «전체» 로 되돌리면 12편', (await ids(page)).length);
      }
    }

    // ④ 고르기 — 5번 글을 누르면 상세가 그 글
    if (await safeClick(page.locator('.rl-item[data-id="s1-05"]'), '5번 글')) {
      await page.waitForTimeout(150);
      ok((await selId(page)) === 's1-05', '누른 글이 골라진다', await selId(page));
      ok((await detTitle(page)) === (await itemTitle(page, 's1-05')), '상세 제목이 고른 글과 같다', await detTitle(page));
      // ↓ → 6번 · ↑ → 다시 5번
      await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
      const afterDown = await selId(page);
      ok(afterDown === 's1-06', '↓ 로 다음 글이 골라진다', afterDown);
      const focusOn = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-id'));
      ok(focusOn === 's1-06', '↓ 뒤 포커스도 그 글로 옮겨 간다(다시 그려도 안 잃음)', focusOn);
      await page.keyboard.press('ArrowUp'); await page.waitForTimeout(150);
      ok((await selId(page)) === 's1-05', '↑ 로 앞 글로 돌아간다', await selId(page));
      // 다음 글 / 이전 글
      if (await safeClick(page.locator('.rl-detail [data-act="step"][data-v="1"]'), '다음 글')) {
        await page.waitForTimeout(150);
        ok((await selId(page)) === 's1-06', '«다음 글» 이 6번으로 옮긴다', await selId(page));
      }
      if (await safeClick(page.locator('.rl-detail [data-act="step"][data-v="-1"]'), '이전 글')) {
        await page.waitForTimeout(150);
        ok((await selId(page)) === 's1-05', '«이전 글» 이 5번으로 되돌린다', await selId(page));
      }
    }

    // ⑤ 읽기 → 목록 — 돌아오면 그 글이 그대로 골라져 있다
    if (await safeClick(page.locator('.rl-cta'), '읽기 시작')) {
      await page.waitForTimeout(200);
      const rd = await page.evaluate(() => ({ browse: document.documentElement.classList.contains('rl-browse'), key: document.querySelectorAll('[data-act="key"]').length, list: document.querySelectorAll('.rl-item').length }));
      ok(!rd.browse, '읽기 화면에서는 한 장 고정(rl-browse)이 풀린다');
      ok(rd.key > 0 && rd.list === 0, '읽기 화면이 그려진다(문장 고르기가 있고 목록은 없다)', JSON.stringify(rd));
      if (await safeClick(page.locator('[data-act="list"]').first(), '목록으로')) {
        await page.waitForTimeout(200);
        ok(await page.evaluate(() => document.documentElement.classList.contains('rl-browse')), '목록으로 돌아오면 rl-browse 가 다시 붙는다');
        ok((await selId(page)) === 's1-05', '돌아오면 읽던 글이 그대로 골라져 있다', await selId(page));
      }
    }
    // 새로고침해도 단계·진도는 이 기기에 남는다(고른 글은 저장 안 함 — 그건 화면 상태)
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
    ok((await ids(page)).length === 12 && (await page.evaluate(() => document.querySelectorAll('.rl-item.done').length)) === 1, '새로고침해도 진도(완료 1편)가 남는다');
    ok(errs.length === 0, '조작 내내 JS 오류 0', errs.join(' | '));
    await ctx.close();
  }

  // ── ⑥ 그림 동화책은 2단계에만 ─────────────────────────────────────
  console.log('▶ ⑥ 그림 동화책 4권');
  for (const [stage, want] of [[2, true], [1, false]]) {
    const { ctx, page, errs } = await openPage({ w: 1280, h: 720, seed: { stage, prog: {} } });
    const n = await page.evaluate(() => document.querySelectorAll('details.rl-dd a.rl-dd-item').length);
    if (want) ok(n === 4, '2단계에는 그림 동화책 4권이 드롭다운에 있다', n);
    else ok(n === 0, '(짝) 1단계에는 그림 동화책 드롭다운이 없다', n);
    ok(errs.length === 0, `${stage}단계 JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }

  // ── ⑦ 영어 ────────────────────────────────────────────────────────
  console.log('▶ ⑦ 영어 전환');
  {
    const { ctx, page, errs } = await openPage({ w: 1280, h: 720, lang: 'ko' });
    const ko = await page.evaluate(() => ({ hero: !!document.querySelector('.rl-hero-ko'), sub: document.querySelectorAll('.rl-item .rl-tt span').length, lab: (document.querySelector('.rl-dd-lab') || {}).textContent }));
    ok(ko.hero && ko.sub === 12, 'KO 에는 우리말 제목이 있다(상세·목록)', JSON.stringify(ko));
    ok(ko.lab === '단계', 'KO 드롭다운 이름은 «단계»', ko.lab);
    if (await safeClick(page.locator('#langBtn'), 'EN 단추')) {
      await page.waitForTimeout(200);
      const en = await page.evaluate(() => ({ hero: !!document.querySelector('.rl-hero-ko'), sub: document.querySelectorAll('.rl-item .rl-tt span').length, lab: (document.querySelector('.rl-dd-lab') || {}).textContent, sh: document.documentElement.scrollHeight, ih: innerHeight }));
      ok(!en.hero && en.sub === 0, 'EN 에서는 우리말 제목이 빠진다', JSON.stringify(en));
      ok(en.lab === 'Step', 'EN 드롭다운 이름은 «Step»', en.lab);
      ok(en.sh <= en.ih + 1, 'EN 에서도 한 화면에 들어간다', `${en.sh} > ${en.ih}`);
    }
    ok(errs.length === 0, '언어 전환 JS 오류 0', errs.join(' | '));
    await ctx.close();
  }

  // ── ⑧ 글자 대비 ───────────────────────────────────────────────────
  console.log('▶ ⑧ 글자 대비(밝은·어두운)');
  const SEL = ['.rl-item b', '.rl-item .rl-tt span', '.rl-item .rl-topic', '.rl-item .rl-wc', '.rl-no', '.rl-eyebrow', '.rl-detail h2', '.rl-hero-ko', '.rl-facts span',
    '.rl-hero-bg', '.rl-how h3', '.rl-how li b', '.rl-how li p', '.rl-foot .rl-prog > span:last-child', '.rl-ghost', '.rl-cta', '.rl-dd-lab', '.rl-dd-val', '.rl-count',
    '.rl-stchip', '.overall span', '.rl-tb-btn'];
  for (const scheme of ['light', 'dark']) {
    const { ctx, page, errs } = await openPage({ w: 1280, h: 720, scheme });
    const res = await page.evaluate((SEL) => {
      const parse = (c) => {
        const k = /color\(srgb ([^)]+)\)/.exec(c); if (k) { const q = k[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r: q[0] * 255, g: q[1] * 255, b: q[2] * 255, a: q.length > 3 ? q[3] : 1 }; }
        const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return null;
        const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      // 반투명 층은 불투명한 층을 만날 때까지 모았다가 아래에서 위로 합성한다(CLAUDE.md 2장)
      const bgOf = (el) => {
        const layers = [];
        for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
        let out = { r: 255, g: 255, b: 255 };
        for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i]; out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) }; }
        return out;
      };
      return SEL.map((s) => {
        const el = document.querySelector(s);
        if (!el || !el.offsetParent) return { s, miss: 1 };
        const cs = getComputedStyle(el); let fg = parse(cs.color); if (!fg) return { s, miss: 1 };
        let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const bg = bgOf(el), a = fg.a * op;
        fg = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
        const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
        return { s, cr: Math.round(cr * 100) / 100, need: (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5 };
      });
    }, SEL);
    let low = null;
    for (const r of res) {
      ok(!r.miss, `${scheme} «${r.s}» 가 화면에 있다(대비를 잴 수 있다)`);
      if (r.miss) continue;
      ok(r.cr >= r.need, `${scheme} «${r.s}» 대비 ${r.need}:1 이상`, r.cr);
      if (!low || r.cr < low.cr) low = r;
    }
    // 성공해도 값을 찍는다 — 보고서에 숫자를 옮겨 적을 때 이 줄을 보세요(CLAUDE.md 「문턱만 보는데 값을 적을 때」)
    if (low) console.log(`  · ${scheme} 가장 낮은 대비: ${low.s} ${low.cr}:1 (필요 ${low.need})`);
    ok(errs.length === 0, `${scheme} JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }

  // ── ⑩ 실제 노트북 창 높이 ─────────────────────────────────────────
  //   ⚠️ 화면 크기(1366×768)가 아니라 «창» 크기(주소창·탭·작업표시줄을 뺀 값)로 잰다 — 2026-10-19 에
  //      1280×720 으로만 재서 통과했는데 실제 창(1280×600)에서는 목록이 안쪽 스크롤되고 제목이 잘렸다.
  console.log('▶ ⑩ 실제 노트북 창 높이');
  for (const [w, h] of [[1366, 640], [1280, 650], [1280, 600]]) {
    const { ctx, page, errs } = await openPage({ w, h });
    const tag = `${w}x${h}`;
    const m = await page.evaluate(() => {
      const L = document.querySelector('.rl-list');
      return { browse: document.documentElement.classList.contains('rl-browse'), sh: document.documentElement.scrollHeight, ih: innerHeight,
        list: L ? [L.scrollHeight, L.clientHeight] : null, items: document.querySelectorAll('.rl-item').length,
        lastIn: (() => { const it = [...document.querySelectorAll('.rl-item')].pop(); if (!it) return false; const r = it.getBoundingClientRect(), lr = L.getBoundingClientRect(); return r.bottom <= Math.min(innerHeight, lr.bottom) + 1; })() };
    });
    ok(m.browse, `${tag} 한 장 고정(rl-browse)이다`);
    ok(m.sh <= m.ih + 1, `${tag} 페이지 세로 스크롤 없음`, `${m.sh} > ${m.ih}`);
    ok(m.items === 12, `${tag} 12편이 목록에 다 있다`, m.items);
    ok(m.list && m.list[0] <= m.list[1] + 1, `${tag} 목록 안쪽 스크롤 없음(12편이 한 번에 보인다)`, m.list && m.list.join('/'));
    ok(m.lastIn, `${tag} 마지막 글(12번)이 목록 칸 안에 보인다`);
    ok(errs.length === 0, `${tag} JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }
  //   4단계 × 12편 전부 — 제목칸이 안 잘리고 «읽기 시작» 이 맨 위. 가장 빡빡한 두 창(KO 1280×600 · EN 900×600)에서 잰다.
  //   fit=true 인 창은 «목록·상세 칸 안쪽 스크롤 없음» 까지 잰다:
  //     1024×768(태블릿 가로) — «이렇게 읽어요» 3칸을 세로로 쌓으면 상세가 넘친다(2026-10-19 실측)
  //     1024×600(낮은 노트북) — 좁고 낮은 창에서 설명 줄을 접지 않으면 상세가 넘친다
  //     EN 900×600 · 960×640 — 영어 버튼 글자가 길어 버튼 줄이 3줄, 도구 줄이 2줄로 접혀 넘쳤다(2026-10-19 두 번째 수리 전)
  //   ⚠️ 821~899 폭(예: 840×600)은 아직 조금 넘친다 — 재지 않는다(알고 둔 한계. 태블릿 세로는 820 이하라 쌓는 화면)
  for (const [w, h, lang, fit] of [[1280, 600, 'ko', true], [1280, 600, 'en', true], [900, 600, 'en', true], [960, 640, 'en', true], [1024, 768, 'ko', true], [1024, 600, 'ko', true]]) {
    let n = 0, heroCut = [], ctaBad = [], footOut = [], notBrowse = 0, over = [];
    let sticky = null;
    for (let stage = 1; stage <= 4; stage++) {
      const { ctx, page, errs } = await openPage({ w, h, lang, seed: { stage, prog: {} } });
      const list = await ids(page);
      ok(list.length === 12, `${w}x${h} ${lang} ${stage}단계 12편`, list.length);
      for (const id of list) {
        await page.evaluate((id) => { const b = document.querySelector('.rl-item[data-id="' + id + '"]'); if (b) b.click(); }, id);
        await page.waitForTimeout(30);
        const m = await page.evaluate(() => {
          const D = document.querySelector('.rl-detail'), hero = D && D.querySelector('.rl-hero');
          const hr = hero ? hero.getBoundingClientRect() : null;
          // 제목칸 «안» 의 글자(h2·우리말 제목·사실 줄·배경)가 제목칸 상자 밖으로 나가면 overflow:hidden 에 잘린 것
          const cut = !hero || [...hero.querySelectorAll('h2,.rl-hero-ko,.rl-facts,.rl-hero-bg')].some((e) => { const r = e.getBoundingClientRect(); return r.height < 2 || r.top < hr.top - 1 || r.bottom > hr.bottom + 1; });
          const cta = D && D.querySelector('.rl-cta'); const r = cta ? cta.getBoundingClientRect() : null;
          const hit = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const foot = D && D.querySelector('.rl-foot'); const fr = foot && foot.getBoundingClientRect(), dr = D && D.getBoundingClientRect();
          const L = document.querySelector('.rl-list');
          return { browse: document.documentElement.classList.contains('rl-browse'), cut,
            over: (L && L.scrollHeight > L.clientHeight + 1 ? 'list ' + L.scrollHeight + '/' + L.clientHeight + ' ' : '') + (D && D.scrollHeight > D.clientHeight + 1 ? 'detail ' + D.scrollHeight + '/' + D.clientHeight : ''),
            cta: !!r && r.bottom <= innerHeight + 1 && r.top >= 0 && !!hit && cta.contains(hit),
            footIn: !!fr && fr.bottom <= dr.bottom + 1 && fr.top >= dr.top - 1,
            pos: foot ? getComputedStyle(foot).position : null };
        });
        n++;
        if (!m.browse) notBrowse++;
        if (m.cut) heroCut.push(id);
        if (!m.cta) ctaBad.push(id);
        if (!m.footIn) footOut.push(id);
        if (m.over) over.push(id + ' ' + m.over.trim());
        if (sticky === null) sticky = m.pos;
      }
      ok(errs.length === 0, `${w}x${h} ${lang} ${stage}단계 JS 오류 0`, errs.join(' | '));
      await ctx.close();
    }
    const tag = `${w}x${h} ${lang}`;
    ok(n === 48, `${tag} 전제: 4단계 48편을 다 눌러 봤다`, n);
    ok(notBrowse === 0, `${tag} 48편 내내 한 장 고정이다`, notBrowse);
    ok(heroCut.length === 0, `${tag} 48편 전부 제목칸이 안 잘린다`, heroCut.join(','));
    ok(ctaBad.length === 0, `${tag} 48편 전부 «읽기 시작» 이 화면 안 «맨 위»`, ctaBad.join(','));
    ok(footOut.length === 0, `${tag} 48편 전부 버튼 줄이 상세 칸 안에 보인다`, footOut.join(','));
    ok(sticky === 'sticky', `${tag} 버튼 줄이 상세 칸 바닥에 붙어 있다(sticky)`, sticky);
    if (fit) ok(over.length === 0, `${tag} 48편 전부 목록·상세 칸 안쪽 스크롤 없음`, over.slice(0, 4).join(' | '));
    console.log(`  · ${tag}: 48편 · 제목 잘림 ${heroCut.length} · 버튼 가려짐 ${ctaBad.length} · 안쪽 스크롤 ${over.length}${fit ? '' : '(재기만 함)'}`);
  }
  {
    // (짝) 폰 — 쌓는 화면에서는 버튼 줄을 바닥에 붙이지 않는다(붙이면 페이지 스크롤 내내 떠다닌다)
    const { ctx, page, errs } = await openPage({ w: 390, h: 844 });
    const pos = await page.evaluate(() => { const f = document.querySelector('.rl-foot'); return f ? getComputedStyle(f).position : null; });
    ok(pos === 'static', '(짝) 390 에서는 버튼 줄이 sticky 가 아니다', pos);
    ok(errs.length === 0, '390(⑩) JS 오류 0', errs.join(' | '));
    await ctx.close();
  }

  // ── ⑪ 좁은 창 압축(도구 줄 · 이전/다음 글) ───────────────────────────
  console.log('▶ ⑪ 좁은 창 압축');
  const tbProbe = (page) => page.evaluate(() => {
    const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 2;
    const tb = document.querySelector('.rl-tb');
    const lab = (cls) => vis(document.querySelector('.rl-dd.' + cls + ' .rl-dd-lab'));
    const plainLabs = [...document.querySelectorAll('.rl-dd:not(.rl-dd-stage):not(.rl-dd-sort) .rl-dd-lab')].map(vis);
    const pn = [...document.querySelectorAll('.rl-detail [data-act="step"]')];
    const acts = document.querySelector('.rl-acts');
    return { tbH: Math.round(tb.getBoundingClientRect().height), stair: vis(document.querySelector('.rl-tb>.rl-stair')),
      stageLab: lab('rl-dd-stage'), sortLab: lab('rl-dd-sort'), plainLabs, count: vis(document.querySelector('.rl-tb>.rl-count')),
      pnN: pn.length, arrowVis: pn.map((b) => vis(b.querySelector('.rl-garr'))), textVis: pn.map((b) => { const t = b.querySelector('.rl-gtx'); return !!t && t.getBoundingClientRect().width > 4; }),
      pnW: pn.map((b) => Math.round(b.getBoundingClientRect().width)), actsH: acts ? Math.round(acts.getBoundingClientRect().height) : null };
  });
  for (const [w, h, lang, stage, narrow] of [[900, 600, 'en', 2, true], [900, 600, 'ko', 2, true], [1024, 768, 'en', 1, true], [1280, 720, 'en', 2, false], [1440, 860, 'ko', 2, false]]) {
    const { ctx, page, errs } = await openPage({ w, h, lang, seed: { stage, prog: {} } });
    const tag = `${w}x${h} ${lang} ${stage}단계`;
    const m = await tbProbe(page);
    ok(m.pnN === 2, `${tag} 전제: 이전·다음 글 버튼 2개`, m.pnN);
    ok(m.tbH <= 40, `${tag} 도구 줄이 한 줄이다`, m.tbH);
    ok(m.actsH !== null && m.actsH <= 44, `${tag} 버튼 줄(이전·다음·그림책·읽기 시작)이 한 줄이다`, m.actsH);
    ok(m.plainLabs.length >= 2 && m.plainLabs.every(Boolean), `${tag} «주제»·«상태» 이름표는 보인다`, JSON.stringify(m.plainLabs));
    // 버튼의 «이름» 은 접혀도 남아야 한다 — 낭독기·음성조작이 그 말로 부른다(접근성 트리로 잰다)
    const nm = { prev: await page.getByRole('button', { name: T2(lang, '이전 글', 'Previous'), exact: true }).count(), next: await page.getByRole('button', { name: T2(lang, '다음 글', 'Next'), exact: true }).count() };
    ok(nm.prev === 1 && nm.next === 1, `${tag} 이전·다음 글 버튼 이름이 그대로다(접근성 트리)`, JSON.stringify(nm));
    if (narrow) {
      ok(!m.stair, `${tag} 계단 그림은 감춘다(«단계» 드롭다운과 같은 일)`);
      ok(!m.stageLab && !m.sortLab, `${tag} «단계»·«정렬» 이름표는 감춘다`, JSON.stringify([m.stageLab, m.sortLab]));
      ok(!m.count, `${tag} 편수 숫자는 감춘다`);
      ok(m.arrowVis.every(Boolean) && m.textVis.every((x) => !x), `${tag} 이전·다음 글은 화살표만 보인다`, JSON.stringify([m.arrowVis, m.textVis]));
      ok(m.pnW.every((x) => x <= 44), `${tag} 화살표 버튼은 동그란 40px 이다(다른 규칙의 여백이 안 붙음)`, m.pnW.join(','));
    } else {
      ok(m.stair && m.stageLab && m.sortLab && m.count, `(짝) ${tag} 넓은 창에서는 계단·이름표·편수가 그대로 보인다`, JSON.stringify([m.stair, m.stageLab, m.sortLab, m.count]));
      ok(m.arrowVis.every((x) => !x) && m.textVis.every(Boolean), `(짝) ${tag} 넓은 창에서는 이전·다음 글이 글자로 보인다`, JSON.stringify([m.arrowVis, m.textVis]));
    }
    // 화살표 버튼을 실제로 눌러 본다 — 좁아져도 «다음 글» 이 일한다
    const before = await selId(page);
    if (await safeClick(page.locator('.rl-detail [data-act="step"][data-v="1"]'), `${tag} 다음 글(화살표)`)) {
      await page.waitForTimeout(150);
      const after = await selId(page);
      ok(!!before && !!after && before !== after, `${tag} 다음 글 버튼을 누르면 다른 글이 골라진다`, `${before} → ${after}`);
    }
    ok(errs.length === 0, `${tag} JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }

  // ── ⑫ 한 줄 맞추기 («N단계로 올라가기» · 좁은 창 · 머리줄) ─────────────
  console.log('▶ ⑫ 한 줄 맞추기');
  const allDone = (stage) => { const prog = {}; for (let i = 1; i <= 12; i++) prog['s' + stage + '-' + String(i).padStart(2, '0')] = { k: 'ok', m: 'ok', s: 'great' }; return { stage, prog }; };
  const LV = ['rl-nocount', 'rl-nostair', 'rl-short', 'rl-tiny'];
  const fitProbe = (page) => page.evaluate(() => {
    const one = (el) => { if (!el) return null; let h = 0; for (const k of el.children) h = Math.max(h, k.getBoundingClientRect().height); return el.getBoundingClientRect().height <= h + 2; };
    const tb = document.querySelector('.rl-tb'), acts = document.querySelector('.rl-acts');
    const seen = (b, sel) => { const e = b && b.querySelector(sel); return !!e && e.getBoundingClientRect().width > 2; };
    const nx = document.querySelector('.rl-tb-next'), dr = document.querySelector('.rl-tb [data-act="drill"]'), gh = document.querySelector('.rl-acts a.rl-ghost');
    const L = document.querySelector('.rl-list'), D = document.querySelector('.rl-detail'), top = document.querySelector('.top');
    return { tbCls: tb.className.split(/\s+/), acCls: acts ? acts.className.split(/\s+/) : [], tbOne: one(tb), acOne: one(acts), topOne: one(top),
      next: !!nx, nextFull: seen(nx, '.rl-full'), nextAbbr: seen(nx, '.rl-abbr'), drillFull: seen(dr, '.rl-full'), drillAbbr: seen(dr, '.rl-abbr'),
      ghW: gh ? Math.round(gh.getBoundingClientRect().width) : null, ghH: gh ? Math.round(gh.getBoundingClientRect().height) : null, L: L.scrollHeight - L.clientHeight, D: D.scrollHeight - D.clientHeight };
  });
  const cut = (m) => LV.filter((c) => m.tbCls.includes(c));
  // 다섯째 칸: 'wide' = 아무것도 안 줄임(짝) · 'lean' = 숫자·계단만 감추고 이름은 그대로(필요한 만큼만 줄이는가)
  //   ⚠ 'lean' 은 영어로만 — 한국어는 1180 에서 아무것도 안 줄여도 한 줄이라 «감춘 것이 있다» 가 거짓 기대가 됨(실측)
  for (const [w, h, lang, stage, want] of [[900, 600, 'en', 2], [960, 640, 'ko', 2], [1024, 690, 'en', 2], [1133, 744, 'en', 2, 'lean'], [1180, 740, 'en', 2, 'lean'],
    [1194, 760, 'en', 2, 'lean'], [834, 1100, 'en', 2], [834, 1100, 'en', 1], [1280, 600, 'ko', 3], [1440, 860, 'en', 2, 'wide'], [1920, 940, 'ko', 2, 'wide']]) {
    const { ctx, page, errs } = await openPage({ w, h, lang, seed: allDone(stage) });
    const tag = `${w}x${h} ${lang} ${stage}단계 «올라가기» 있음`;
    const m = await fitProbe(page);
    ok(m.next, `${tag} 전제: «${stage + 1}단계로 올라가기» 버튼이 떠 있다`);
    ok(m.tbOne, `${tag} 도구 줄이 한 줄이다`, cut(m).join(' '));
    ok(m.acOne, `${tag} 버튼 줄이 한 줄이다`);
    ok(m.topOne, `${tag} 머리줄이 한 줄이다`);
    ok(m.L <= 0 && m.D <= 0, `${tag} 목록·상세 칸 안쪽 스크롤이 없다`, `L${m.L} D${m.D}`);
    // 줄여도 낭독기 이름은 긴 이름 그대로 — 짧은 이름은 aria-hidden 이라 이름에 두 번 끼지 않는다
    const nmDrill = await page.getByRole('button', { name: '🔁 ' + T2(lang, '핵심 찾기 반복', 'Main-idea drill'), exact: true }).count();
    const nmNext = await page.getByRole('button', { name: '🎉 ' + T2(lang, (stage + 1) + '단계로 올라가기', 'Go up to Step ' + (stage + 1)), exact: true }).count();
    ok(nmDrill === 1 && nmNext === 1, `${tag} 반복·올라가기 버튼 이름이 긴 이름 그대로다(접근성 트리)`, JSON.stringify([nmDrill, nmNext]));
    if (want === 'lean') {
      ok(!m.tbCls.includes('rl-short') && m.nextFull && m.drillFull && cut(m).length > 0, `${tag} 숫자·계단만 감추면 한 줄이라 이름은 줄이지 않는다(필요한 만큼만)`, cut(m).join(' '));
    }
    if (want === 'wide') {
      ok(cut(m).length === 0 && m.nextFull && !m.nextAbbr && m.drillFull && !m.drillAbbr, `(짝) ${tag} 넓은 창은 아무것도 안 줄인다 — 긴 이름이 보인다`, cut(m).join(' '));
    } else if (m.tbCls.includes('rl-short')) {
      ok(!m.nextFull && m.nextAbbr && !m.drillFull && m.drillAbbr, `${tag} 줄인 줄은 짧은 이름만 보인다(긴 이름은 화면에서만 감춤)`, JSON.stringify([m.nextFull, m.nextAbbr, m.drillFull, m.drillAbbr]));
    }
    // 줄인 채로도 «올라가기» 가 일한다
    if (await safeClick(page.locator('.rl-tb-next'), `${tag} 올라가기`)) {
      await page.waitForTimeout(150);
      const st = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('reading_ladder_v1')).stage; } catch (e) { return null; } });
      ok(st === stage + 1, `${tag} 누르면 ${stage + 1}단계로 올라간다`, st);
    }
    ok(errs.length === 0, `${tag} JS 오류 0`, errs.join(' | '));
    await ctx.close();
  }
  { // (짝) 아래로 쌓는 창(폭 800)은 줄이지 않는다 — 그 배치는 원래 줄이 접히고 페이지가 스크롤한다
    const { ctx, page } = await openPage({ w: 800, h: 1000, lang: 'en', seed: { stage: 1, prog: {} } });
    const m = await fitProbe(page);
    ok(cut(m).length === 0 && !m.acCls.includes('rl-short'), '(짝) 800×1000(쌓는 배치)은 도구 줄·버튼 줄을 줄이지 않는다', cut(m).concat(m.acCls).join(' '));
    await ctx.close();
  }
  { // 그림책 버튼 — 840×600 EN 은 버튼 줄이 넘쳐 🖼 만 남는다 · 이름은 «Picture book»
    const { ctx, page } = await openPage({ w: 840, h: 600, lang: 'en', seed: { stage: 1, prog: {} } });
    const m = await fitProbe(page);
    // «동그라미» 는 폭 = 높이로 잰다 — «44px 이하» 로만 물으면 동그라미 CSS 를 지워도(43×40, 🖼 가 한쪽으로 쏠림) 통과했다(변이 실측)
    ok(m.acCls.includes('rl-short') && m.acOne && m.ghW !== null && m.ghW <= 44 && Math.abs(m.ghW - m.ghH) <= 1, '840×600 EN 버튼 줄이 한 줄 · 그림책은 🖼 동그라미', JSON.stringify([m.acCls, m.acOne, m.ghW, m.ghH]));
    const nm = await page.getByRole('link', { name: '🖼 Picture book', exact: true }).count();
    ok(nm === 1, '840×600 EN 그림책 버튼 이름은 «Picture book» 그대로(접근성 트리)', nm);
    ok(m.topOne && m.L <= 0 && m.D <= 0, '840×600 EN 머리줄 한 줄 · 안쪽 스크롤 없음', `L${m.L} D${m.D}`);
    await ctx.close();
  }
  { // 창 크기를 바꾸면 다시 잰다 — 넓게 열었다 좁히면 줄이고, 다시 넓히면 되돌린다
    const { ctx, page } = await openPage({ w: 1440, h: 860, lang: 'en', seed: allDone(2) });
    const a = await fitProbe(page);
    await page.setViewportSize({ width: 1024, height: 690 }); await page.waitForTimeout(300);
    const b = await fitProbe(page);
    await page.setViewportSize({ width: 1440, height: 860 }); await page.waitForTimeout(300);
    const c = await fitProbe(page);
    ok(cut(a).length === 0 && b.tbCls.includes('rl-short') && b.tbOne && cut(c).length === 0, '창을 좁히면 줄이고(한 줄) 다시 넓히면 되돌린다', JSON.stringify([cut(a), cut(b), b.tbOne, cut(c)]));
    await ctx.close();
  }
} finally {
  await browser.close().catch(() => {});
  srv.kill();
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
