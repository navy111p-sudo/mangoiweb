// -*- coding: utf-8 -*-
// ai-write-brainstorm-browser.mjs — AI 영작 첨삭의 «4단계 파이프라인» 을 진짜 브라우저에 그려서 눌러 본다.
//
//   [왜 필요한가]  자동 하니스(ai_write_brainstorm_harness.mjs)는 «무슨 값이 나오는가» 까지만 본다.
//     「주제를 누르면 질문이 뜨는가」·「뼈대 버튼이 잠겨 있는가」·「한 장 출력이 맨 위에 오는가」·
//     「라벨이 낱글자로 쪼개지지 않는가」는 좌표와 클릭의 문제라 문자열로는 볼 수 없다
//     (CLAUDE.md 2장 「화면 «좌표» 가 틀린 버그를 하니스가 못 잡음」).
//
//   [자동으로 안 돕니다]  manual/ 규약상 *_harness.mjs 가 아니라 게이트가 물어 가지 않는다.
//   ai-write.html 의 브레인스토밍·첨삭 결과·한 장 출력을 건드리면 **사람이 불러야** 한다:
//       mkdir -p /tmp/pw && cd /tmp/pw && npm install playwright-core
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-brainstorm-browser.mjs
//
//   ⚠️ file:// 로 열면 <script src="/js/…"> 가 전부 404 라 «기능이 죽었다» 로 오진한다 → 작은 http 서버를 띄운다.
//   ⚠️ 로그인·AI 응답은 스텁으로 대신한다. 포괄 스텁(/api/*)을 «먼저» 깔고 구체적인 것을 뒤에 두어야
//      삼켜지지 않는다(CLAUDE.md 2장 「playwright 로 API 를 스텁했는데 화면이 안 채워짐」).
//   ⚠️ isMobile 은 켜지 않는다 — 폭만 좁히면 되는 검사에서 좌표가 어긋나 «멀쩡한 버튼이 안 눌린다» 가 된다.

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
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
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
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};

const AI_STUB = {
  ok: true, level: 'B1', score: 88,
  corrected: 'One day, I lost something very important to me. It happened last Sunday. I was at the park. I was with my brother. I lost my favorite watch. It was special because my mom gave it to me. I felt sad, so I looked for it everywhere.',
  issues: [{ original: 'I lose', suggested: 'I lost', reason: '지난 일이니까 과거형으로 써요.' }],
  upgrades: [{ from: 'thing', to: 'property', why: '소유물을 뜻하는 어른스러운 단어예요.' }],
  tip: '잘 썼어요!', reply: 'That sounds hard. Did you find it?',
};

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
for (const [label, w, h] of [['PC 1280', 1280, 900], ['휴대폰 390', 390, 844]]) {
  console.log('\n▶ ' + label);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.removeItem('mangoi_aiwrite_go_v1'); } catch (_) {} });
  // 포괄 스텁 «먼저» → 구체 스텁 «뒤»
  await ctx.route('**/api/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"ok":false}' }));
  await ctx.route('**/api/ai/write-correct', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(AI_STUB) }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + '/ai-write.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#goThemes .go-theme', { timeout: 15000 });

  // ① 4단계 배너
  const steps = await page.evaluate(() => {
    const e = [...document.querySelectorAll('#flowSteps .fstep')];
    return { n: e.length, on: e.filter((x) => x.classList.contains('on')).map((x) => x.dataset.step).join() };
  });
  check('① 파이프라인 4단계가 뜨고 지금은 1단계', steps.n === 4 && steps.on === '1', JSON.stringify(steps));

  // ② 주제 → 6하원칙 질문 6개, 답 없으면 «뼈대로 쓰기» 잠김
  await page.click('#goThemes .go-theme');
  check('② 주제를 고르면 질문 6개', (await page.locator('#goBody .go-q input').count()) === 6);
  check('② 답이 없으면 «뼈대로 쓰기» 가 잠겨 있다', await page.locator('#goApplyBtn').isDisabled());

  // ③ 영어 4 + 한글 1 로 답하기
  await page.fill('#go-when', 'last Sunday');
  await page.fill('#go-where', 'the park');
  await page.fill('#go-what', 'I lost my favorite watch');
  await page.fill('#go-how', 'sad');
  await page.fill('#go-who', '엄마랑 동생');
  const pv = await page.evaluate(() => ({
    parts: document.querySelectorAll('#goPreview .go-part').length,
    txt: document.getElementById('goPreview').textContent,
  }));
  check('③ 서론·본론·결론 3문단 뼈대가 만들어진다', pv.parts === 3, 'parts=' + pv.parts);
  check('③ 한글 답은 뼈대 옆 «메모» 로 보인다', /엄마랑 동생/.test(pv.txt));
  check('③ 답을 넣으면 «뼈대로 쓰기» 가 열린다', !(await page.locator('#goApplyBtn').isDisabled()));

  // ④ 뼈대 적용 — 글쓰기 칸에는 «영어만»
  await page.click('#goApplyBtn');
  const ta = await page.inputValue('#text');
  check('④ 글쓰기 칸에 뼈대가 들어간다', ta.includes('It happened last Sunday.') && ta.includes('I lost my favorite watch.'), JSON.stringify(ta.slice(0, 90)));
  check('④ 🔴 글쓰기 칸에 한글이 섞이지 않는다', !/[가-힣]/.test(ta));
  check('④ 시작 문장이 답과 겹치지 않는다 (I lost I lost …)', !/I lost I lost/.test(ta));
  check('④ 브레인스토밍 메모 줄이 뜬다', await page.locator('#goMemo').isVisible());
  check('④ 2단계가 «완료» 로 표시된다', await page.locator('#flowSteps .fstep[data-step="2"]').evaluate((e) => e.classList.contains('done')));

  // ⑤ AI 첨삭 → 어휘 업그레이드 · 고쳐쓰기 대상
  await page.click('#submitBtn');
  await page.waitForSelector('#resultBox .result', { timeout: 15000 });
  check('⑤ 어휘 업그레이드가 결과에 보인다', (await page.locator('#resultBox .up-box .up-row').count()) === 1);
  const rw = (await page.locator('.rewrite-box .corrected').textContent()).trim();
  check('⑤ 긴 글은 «고쳐진 문장만» 따라쓰기 대상', rw.length > 0 && rw.length < 200, rw.slice(0, 60));
  check('⑤ 3단계가 «완료» 로 표시된다', await page.locator('#flowSteps .fstep[data-step="3"]').evaluate((e) => e.classList.contains('done')));

  // ⑥ 한 장 출력 — 「열렸다」가 아니라 「맨 위에 있다」로 판정
  await page.click('#resultBox button:has-text("한 장으로 출력")');
  const sh = await page.evaluate(() => {
    const m = document.getElementById('sheetModal'), t = m.textContent;
    const r = m.querySelector('.sh-paper').getBoundingClientRect();
    const top = document.elementsFromPoint(Math.round(r.left + r.width / 2), 200)[0];
    return { vis: getComputedStyle(m).display, secs: m.querySelectorAll('.sh-sec').length,
      brain: t.includes('브레인스토밍'), draft: t.includes('내 초안'), fb: t.includes('AI 첨삭 피드백'),
      fin: t.includes('완성본'), topIn: m.contains(top) };
  });
  check('⑥ 한 장 출력에 4구역(메모·초안·첨삭·완성본)이 있다',
    sh.vis === 'block' && sh.secs === 4 && sh.brain && sh.draft && sh.fb && sh.fin, JSON.stringify(sh));
  check('⑥ 출력 화면이 «맨 위» 에 있다 (가려지지 않음)', sh.topIn === true);
  /* 🔴 2026-08-30 실측: 홈/EN 칩(#mangoi-global-bar z=99999)이 「인쇄 / PDF 저장」 버튼 글자를 덮고 있었다.
     「버튼이 있다」와 「손이 닿는다」는 다르다 — elementsFromPoint 로 맨 위가 그 버튼인지 본다. */
  const printTop = await page.evaluate(() => {
    const btn = document.querySelector('#sheetModal .sh-tools button');
    const r = btn.getBoundingClientRect();
    const top = document.elementsFromPoint(Math.round(r.right - 12), Math.round(r.top + r.height / 2))[0];
    return { ok: btn.contains(top) || btn === top, who: top ? top.tagName + '#' + (top.id || '') : 'none' };
  });
  check('⑥ 인쇄 버튼이 다른 것에 가리지 않는다', printTop.ok === true, printTop.who);
  // 종이 위 글자가 실제로 읽히는가 — 흰 종이 + 진한 글자 (대비 4.5:1)
  const contrast = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
    const el = document.querySelector('#sheetModal .sh-en');
    const fg = rgb(getComputedStyle(el).color), bg = rgb(getComputedStyle(document.querySelector('.sh-paper')).backgroundColor);
    const a = lum(fg), b = lum(bg);
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
  });
  check('⑥ 출력 본문 글자가 읽힌다 (대비 4.5 이상)', contrast >= 4.5, String(contrast));
  await page.evaluate(() => closeSheet());

  // ⑦ 레이아웃 — 가로 넘침 / 낱글자 쪼개짐
  const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  check('⑦ 가로로 넘치지 않는다', ov.sw <= ov.iw + 1, JSON.stringify(ov));
  const shred = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#flowSteps .fs-t, .go-theme, .go-part-t').forEach((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      const n = Math.round(el.getBoundingClientRect().height / lh);
      if (n >= 3) bad.push(el.textContent.trim().slice(0, 18) + ':' + n + '줄');
    });
    return bad;
  });
  check('⑦ 라벨이 낱글자로 쪼개지지 않는다', shred.length === 0, JSON.stringify(shred));

  // ⑧ EN 전환 — 새 UI 도 영어로
  await page.evaluate(() => window.setLang && window.setLang('en'));
  const en = await page.evaluate(() => ({
    t: document.querySelector('#flowSteps .fs-t').textContent,
    th: document.querySelector('.go-theme').textContent,
    q: (document.querySelector('.go-q-label') || {}).textContent || '',
  }));
  check('⑧ EN 화면에서 새 UI 도 영어로 바뀐다', !/[가-힣]/.test(en.t + en.th + en.q), JSON.stringify(en));

  check('⑨ 페이지 오류(예외) 없음', errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await browser.close();
server.close();

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) process.exit(1);
console.log('🎉 브레인스토밍 → 첨삭 → 한 장 출력까지 실제 화면에서 전부 동작합니다.');
