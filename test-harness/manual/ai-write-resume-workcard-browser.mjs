// -*- coding: utf-8 -*-
// AI 영작 — ✍️ 이어 쓰기(제안 5) · 🏆 내 작품 카드(제안 9) (2026-10-26)
//   ① «📂 내가 만든 주제» 가 최근에 쓴 순 · 쓰던 글이 있으면 «✍️ 이어 쓰기» → 그 주제·글을 되살린다
//   ② 첨삭 결과의 «🏆 내 작품 카드로 저장» → 카드(제목·완성 글·잘한 점)가 화면 맨 위에 뜨고 인쇄 버튼이 눌린다
//   서버는 스텁입니다(진짜 판정은 test-harness/write_topics_harness.mjs [G] 절).
//   자동으로 안 돕니다 — 사람이 부릅니다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-resume-workcard-browser.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';
const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const PAGE = process.env.AW_PAGE || 'ai-write.html';
const { chromium, exe } = requireBrowser();
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const Q = (k, ko, en, starter, ex) => ({ k, p: 0, ko, en, starter, ph: '예) ' + ex });
const QS = [Q('what','💡 What — 무엇을 했나요?','💡 What — What did you do?','I ','play with my dog'), Q('how','💗 How — 기분이 어땠나요?','💗 How — How did you feel?','I felt ','happy')];
const now = Date.now();
const MINE = [
  { id: 31, status: 'draft', title_ko: '우리 집 강아지', title_en: 'My Dog', icon: '🐶', open: '', questions: QS, words: [], image_url: '', updated_at: now - 86400000 * 3, created_by: 'stu:kim' },
  { id: 32, status: 'draft', title_ko: '주말에 한 일', title_en: 'My Weekend', icon: '⚽', open: '', questions: QS, words: [], image_url: '', updated_at: now - 86400000 * 5, created_by: 'stu:kim' },
];
const RESULT = { ok: true, score: 88, level: 'A1', corrected: 'On the weekend, I played soccer with my friends.', issues: [], upgrades: [], tip: 'Great!', reply: 'Soccer sounds fun!', mission_used: [] };
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const J = o => { res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(o)); };
  if (p === '/api/class/write-topics') return J({ ok: true, items: [], can_create: true, role: 'student', manage: MINE, ai_left: 9, ai_cap: 10 });
  if (p === '/api/ai/write-correct') return J(RESULT);
  if (p.startsWith('/api/')) return J({ ok: false });
  try { const buf = await readFile(join(PUB, p.replace(/^\//, ''))); res.writeHead(200, {'content-type': MIME[extname(p)] || 'application/octet-stream'}); res.end(buf); }
  catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (n, c, x='') => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  (' + x + ')' : '')); } else { fail++; console.log('  ❌ FAIL ' + n + (x ? '  → ' + x : '')); } };
for (const [w, h, lang] of [[390, 844, 'ko'], [1280, 720, 'ko'], [1280, 720, 'en']]) {
  console.log(`── ${w}×${h} ${lang}`);
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([l, n]) => { try { if (!sessionStorage.getItem('__c')) { localStorage.clear(); sessionStorage.setItem('__c','1');
    localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'kim', name: '김망고', role: 'student' }));
    localStorage.setItem('mangoi_aiwrite_topicwork_v1:kim', JSON.stringify({ 'custom:32': { t: 'On the weekend I play soccer with my friend.', a: { what: 'play soccer' }, ts: n } }));
    localStorage.setItem('mangoi_aiwrite_topicwork_v1:lee', JSON.stringify({ 'custom:31': { t: 'NOT MINE', a: {}, ts: n } }));
  } localStorage.setItem('mangoi_aiwrite_howto_v1','1'); localStorage.setItem('mangoi_aiwrite_guide_seen','1'); localStorage.setItem('mangoi_lang', l); } catch(e){} }, [lang, now]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const d = document.getElementById('wtMine'); if (d) d.open = true; });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#wtMineList .wt-item')].map(r => ({ t: r.querySelector('.wt-item-t').textContent, b: [...r.querySelectorAll('button')].map(x => x.textContent.trim()) })));
  ok('에러 없음', errs.length === 0, errs.join(' | ').slice(0, 200));
  ok('내 주제 2개 · 최근에 쓴 것(주말)이 위', rows.length === 2 && /주말/.test(rows[0].t), rows.map(r => r.t).join(' / '));
  ok('쓰던 글이 있으면 «이어 쓰기» + 단어 수', lang === 'en' ? /Continue/.test(rows[0].b[0]) && /words written/.test(rows[0].t) : /이어 쓰기/.test(rows[0].b[0]) && /9단어/.test(rows[0].t), rows[0].b.join(',') + ' | ' + rows[0].t);
  ok('남의 계정 기록은 안 보인다(강아지는 «쓰기»)', lang === 'en' ? /^✍️ Write$/.test(rows[1].b[0]) : /^✍️ 쓰기$/.test(rows[1].b[0]), rows[1].b[0]);
  // 이어 쓰기 버튼이 눌리는가(맨 위인가)
  const hit = await page.evaluate(() => { const b = document.querySelector('#wtMineList .wt-item .wt-go'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); });
  ok('«이어 쓰기» 버튼이 맨 위(눌린다)', hit);
  await page.click('#wtMineList .wt-item .wt-go');
  await page.waitForTimeout(700);
  const st = await page.evaluate(() => ({ v: document.getElementById('text').value, pick: document.getElementById('picChoice').value, cur: (document.querySelector('.go-cur-t') || {}).textContent || '', a: [...document.querySelectorAll('#goBody .go-q input')].map(i => i.value) }));
  ok('주제·글·메모를 되살렸다', st.v === 'On the weekend I play soccer with my friend.' && st.pick === 'custom:32' && st.a.includes('play soccer'), JSON.stringify(st).slice(0, 200));
  // 첨삭 → 작품 카드
  await page.click('#submitBtn'); await page.waitForTimeout(1200);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#resultBox button')].find(x => /openWorkCard/.test(x.getAttribute('onclick') || '')); b.scrollIntoView({ block: 'center' }); });
  await page.click('#resultBox button[onclick="openWorkCard()"]'); await page.waitForTimeout(500);
  const card = await page.evaluate(() => { const m = document.getElementById('sheetModal'); const pr = m.querySelector('.sh-tools button'); const r = pr.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { shown: getComputedStyle(m).display, title: (m.querySelector('.wk-title') || {}).textContent, text: (m.querySelector('.wk-text') || {}).textContent, good: m.querySelectorAll('.wk-good li').length, printTop: e === pr || pr.contains(e), over: m.scrollWidth > m.clientWidth + 1, saved: JSON.parse(localStorage.getItem('mangoi_aiwrite_works_v1:kim') || '{}').items };
  });
  ok('카드가 뜬다 · 제목 = 주제 영어 제목 · 완성 글', card.shown === 'block' && card.title === 'My Weekend' && /played soccer/.test(card.text), card.title + ' | ' + card.text);
  ok('잘한 점이 1~3줄', card.good >= 1 && card.good <= 3, String(card.good));
  ok('인쇄 버튼이 맨 위(홈/EN 칩에 안 가림)', card.printTop);
  ok('카드가 옆으로 넘치지 않는다', !card.over);
  ok('이 기기에 1장 저장', Array.isArray(card.saved) && card.saved.length === 1, JSON.stringify(card.saved || '').slice(0, 80));
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => { const b = document.querySelector('button[onclick="openWorks()"]'); b.scrollIntoView({ block: 'center' }); });
  await page.click('button[onclick="openWorks()"]'); await page.waitForTimeout(300);
  ok('«🏆 내 작품» 으로 다시 열린다', await page.evaluate(() => getComputedStyle(document.getElementById('sheetModal')).display === 'block' && /My Weekend/.test(document.getElementById('sheetModal').textContent)));
  if (w === 390 && lang === 'ko') await page.screenshot({ path: '/tmp/claude-0/-home-user-mangoiweb/6b5b6258-a283-581e-9a66-03c51c0052f0/scratchpad/workcard-390.png', fullPage: false });
  await ctx.close();
}
await browser.close(); server.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
