// -*- coding: utf-8 -*-
// AI 영작 — 📅 숙제·마감일(제안 6) · ⭐ 칭찬 먼저(제안 7) · 🔒 안심 표시·🌱 부드러운 거르기(제안 8) (2026-10-26)
//   학생: 숙제 안내 줄 · 목록 맨 위 «📅 숙제» 묶음 · 첨삭 → «잘한 점» 이 맨 위 · 그 숙제가 ✓ 로 · 요청에 topic_id
//   선생님: 마감일 칸 · «내 글감» 의 숙제 꼬리표 · «📋 제출 확인» 표
//   거르기: 서버가 unsafe_topic 을 주면 빨간 오류가 아니라 부드러운 안내
//   서버는 스텁입니다(진짜 판정은 test-harness/write_topics_harness.mjs [H] 절).
//   자동으로 안 돕니다 — 사람이 부릅니다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-homework-praise-browser.mjs
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
const QS = [Q('what','💡 What — 무엇을 했나요?','💡 What — What did you do?','I ','played soccer'), Q('how','💗 How — 기분이 어땠나요?','💗 How — How did you feel?','I felt ','happy')];
const HW = { id: 41, title_ko: '나의 주말', title_en: 'My weekend', icon: '🏖', open: '', questions: QS, words: [], image_url: '', due_date: '2099-12-31' };
const HW2 = { id: 42, title_ko: '나의 꿈', title_en: 'My dream', icon: '🌠', open: '', questions: QS, words: [], image_url: '', due_date: '2099-12-30' };
const PLAIN = { id: 43, title_ko: '그냥 글감', title_en: 'Just a topic', icon: '📝', open: '', questions: QS, words: [], image_url: '' };
const RESULT = { ok: true, score: 88, level: 'A1', corrected: 'On the weekend, I played soccer with my friends.', issues: [{ original: 'play', corrected: 'played', explanation: '과거형' }], upgrades: [], tip: 'Great!', reply: 'Soccer sounds fun!', mission_used: [] };
let MODE = 'student', posts = [];
const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  const J = (o, st = 200) => { res.writeHead(st, {'content-type':'application/json'}); res.end(JSON.stringify(o)); };
  if (p === '/api/class/write-topics') {
    if (req.method === 'POST') {
      let b = ''; for await (const c of req) b += c; const body = JSON.parse(b || '{}'); posts.push(body);
      if (body.action === 'draft' && /씨발/.test(body.title || '')) return J({ ok: false, error: 'unsafe_topic', kind: 'swear', message: '이 말은 글쓰기 주제로 쓸 수 없어요. 다른 주제를 골라 볼까요? / This word can\'t be used. Shall we pick another topic?' }, 400);
      return J({ ok: true, ai_used: true, item: { id: 99, status: 'draft', title_ko: body.title || 'x', title_en: 'X', icon: '📝', questions: QS, words: [], image_url: '', created_by: 'stu:kim' } });
    }
    if (u.searchParams.has('submits')) return J({ ok: true, items: [{ uid: 'kimsu', name: '김수아', n: 2, last_at: Date.now(), best: 88 }, { uid: 'leeyu', name: '이유나', n: 1, last_at: Date.now() - 86400000, best: 60 }] });
    if (MODE === 'teacher') return J({ ok: true, items: [HW, PLAIN], can_create: true, role: 'staff', manage: [{ ...HW, status: 'published', created_by: 'hq_t_kim', submit_count: 2 }, { ...PLAIN, status: 'published', created_by: 'hq_t_kim' }], ai_left: 29, ai_cap: 30 });
    return J({ ok: true, items: [HW, HW2, PLAIN], can_create: true, role: 'student', manage: [{ id: 51, status: 'draft', title_ko: '우리 집 강아지', title_en: 'My Dog', icon: '🐶', open: '', questions: QS, words: [], image_url: '', created_by: 'stu:kim' }], ai_left: 9, ai_cap: 10, done_ids: [] });
  }
  if (p === '/api/ai/write-correct') { let b = ''; for await (const c of req) b += c; posts.push(JSON.parse(b || '{}')); return J(RESULT); }
  if (p.startsWith('/api/')) return J({ ok: false });
  try { const buf = await readFile(join(PUB, p.replace(/^\//, ''))); res.writeHead(200, {'content-type': MIME[extname(p)] || 'application/octet-stream'}); res.end(buf); }
  catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (n, c, x='') => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  (' + x + ')' : '')); } else { fail++; console.log('  ❌ FAIL ' + n + (x ? '  → ' + x : '')); } };
// 글자 대비 — 반투명 층은 아래에서 위로 합성(배경이 그라데이션이면 첫 색)
const CONTRAST = `(el) => {
  const rgb = s => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const a = m[1].split(',').map(Number); return { r: a[0], g: a[1], b: a[2], a: a.length > 3 ? a[3] : 1 }; };
  const layers = []; let e = el;
  while (e && e.nodeType === 1) { const cs = getComputedStyle(e); let c = rgb(cs.backgroundColor);
    if ((!c || c.a === 0) && cs.backgroundImage && cs.backgroundImage !== 'none') c = rgb((cs.backgroundImage.match(/rgba?\\([^)]+\\)/) || [''])[0]);
    if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } e = e.parentElement; }
  let bg = { r: 255, g: 255, b: 255 };
  for (const c of layers.reverse()) bg = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) };
  const fg = rgb(getComputedStyle(el).color);
  const L = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const a = L(fg), b = L(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}`;
const topHit = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b) return 'none'; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === b || b.contains(e); }, sel);
async function open(w, h, lang, mode) {
  MODE = mode; posts = [];
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(([l, m]) => { try { if (!sessionStorage.getItem('__c')) { localStorage.clear(); sessionStorage.setItem('__c','1');
    if (m === 'student') { localStorage.setItem('mangoi_logged_user', JSON.stringify({ uid: 'kim', name: '김망고', role: 'student' })); localStorage.setItem('mango_token', 'tok'); }
  } localStorage.setItem('mangoi_aiwrite_howto_v1','1'); localStorage.setItem('mangoi_aiwrite_guide_seen','1'); localStorage.setItem('mangoi_lang', l); } catch(e){} }, [lang, mode]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  return { ctx, page, errs };
}
for (const [w, h, lang] of [[390, 844, 'ko'], [1280, 720, 'ko'], [1280, 720, 'en']]) {
  console.log(`── 학생 ${w}×${h} ${lang}`);
  const { ctx, page, errs } = await open(w, h, lang, 'student');
  ok('에러 없음', errs.length === 0, errs.join(' | ').slice(0, 200));
  const note = await page.evaluate((C) => { const el = document.getElementById('awHwNote'); const f = new Function('return ' + C)(); const r = el.getBoundingClientRect();
    return { hidden: el.hidden, disp: getComputedStyle(el).display, t: el.textContent, cr: f(el), h: r.height, over: document.documentElement.scrollWidth > innerWidth }; }, CONTRAST);
  ok('숙제 안내 줄이 보인다', !note.hidden && note.disp !== 'none' && note.h > 10, note.t);
  ok('안내 줄 글자: 숙제 2개 · 가장 급한 것', lang === 'en' ? /2 homework/.test(note.t) && /My dream/.test(note.t) : /숙제 2개/.test(note.t) && /나의 꿈/.test(note.t), note.t);
  ok('안내 줄 대비 4.5 이상', note.cr >= 4.5, 'contrast ' + note.cr);
  ok('가로 넘침 없음', !note.over);
  const grp = await page.evaluate(() => { const pc = document.getElementById('picChoice'); const g = [...pc.querySelectorAll('optgroup')]; return { labels: g.map(o => o.label), first: g[0] ? [...g[0].querySelectorAll('option')].map(o => [o.value, o.textContent]) : [] }; });
  ok('목록 맨 위 묶음 = 📅 숙제', /^📅/.test(grp.labels[0] || ''), grp.labels.join(' | '));
  ok('숙제 묶음에 숙제 둘(마감 빠른 것 먼저) · 꼬리표', grp.first.map(x => x[0]).join(',') === 'custom:42,custom:41' && (lang === 'en' ? /Due 12\/30/.test(grp.first[0][1]) : /12\/30까지/.test(grp.first[0][1])), JSON.stringify(grp.first));
  ok('«내 주제» 묶음 이름에 🔒', grp.labels.some(l => /🔒/.test(l)), grp.labels.join(' | '));
  await page.selectOption('#picChoice', 'custom:41');
  await page.waitForTimeout(400);
  await page.fill('#text', 'On the weekend I play soccer with my friends. It was very fun and I was happy all day long with them.');
  await page.evaluate(() => document.getElementById('submitBtn').scrollIntoView({ block: 'center' }));
  await page.click('#submitBtn'); await page.waitForTimeout(1300);
  const sent = posts.find(x => 'topic_id' in x);
  ok('첨삭 요청에 topic_id=41', sent && sent.topic_id === 41, JSON.stringify(sent && sent.topic_id));
  const rs = await page.evaluate((C) => { const pt = document.getElementById('awPraiseTop'), hd = document.querySelector('#resultBox .result-head'); const f = new Function('return ' + C)();
    const li = pt ? pt.querySelector('li') : null;
    return { has: !!pt, above: pt && hd ? pt.getBoundingClientRect().top < hd.getBoundingClientRect().top : false, first: pt ? pt.parentElement.firstElementChild === pt : false,
      t: pt ? pt.textContent : '', cr: li ? f(li) : 0, crT: pt ? f(pt.querySelector('.t span') || pt) : 0, fix: document.getElementById('resultBox').textContent };
  }, CONTRAST);
  ok('«잘한 점» 이 결과 맨 위(점수보다 위)', rs.has && rs.above && rs.first, rs.t.slice(0, 80));
  ok('«잘한 점» 글자 언어', lang === 'en' ? /What you did well/.test(rs.t) && !/[가-힣]/.test(rs.t) : /잘한 점/.test(rs.t), rs.t.slice(0, 80));
  ok('«잘한 점» 대비 4.5 이상', rs.cr >= 4.5 && rs.crT >= 4.5, `li ${rs.cr} / title ${rs.crT}`);
  ok('«⚠️ 발견된 점» 대신 «💡 이렇게 고치면 더 좋아요»', !/발견된 점/.test(rs.fix) && (lang === 'en' ? /Make it even better/.test(rs.fix) : /이렇게 고치면 더 좋아요/.test(rs.fix)));
  const after = await page.evaluate(() => ({ t: document.getElementById('awHwNote').textContent, opt: [...document.querySelectorAll('#picChoice optgroup')][0] ? [...[...document.querySelectorAll('#picChoice optgroup')][0].querySelectorAll('option')].map(o => o.textContent) : [] }));
  ok('첨삭 뒤: 그 숙제가 ✓ · 남은 숙제 1개', after.opt.some(t => /✓/.test(t) && /(주말|weekend)/.test(t)) && (lang === 'en' ? /1 homework/.test(after.t) : /숙제 1개/.test(after.t)), after.t + ' | ' + after.opt.join(' / '));
  // 🌱 거르기 — 부드러운 안내
  await page.evaluate(() => { const p = document.getElementById('wtPanel'); if (p) p.scrollIntoView({ block: 'center' }); });
  const canDraft = await page.evaluate(() => !document.getElementById('wtPanel').hidden);
  ok('학생에게 주제 만들기 칸이 있다(전제)', canDraft);
  if (canDraft) {
    await page.fill('#wtTitleIn', '씨발 진짜');
    await page.click('#wtDraftBtn'); await page.waitForTimeout(500);
    const m = await page.evaluate((C) => { const el = document.getElementById('wtMsg'); return { t: el.textContent, c: el.className, cr: new Function('return ' + C)()(el) }; }, CONTRAST);
    ok('걸러진 주제 → 🌱 부드러운 안내(warn · 빨간 오류 아님)', /🌱/.test(m.t) && /warn/.test(m.c) && !/err/.test(m.c), m.c + ' | ' + m.t);
    ok('안내 글자 언어', lang === 'en' ? /pick another topic/.test(m.t) : /다른 주제/.test(m.t), m.t);
    ok('안내 대비 4.5 이상', m.cr >= 4.5, 'contrast ' + m.cr);
  }
  ok('주제 만들기 머리에 «🔒 나만 보여요»', await page.evaluate(() => /🔒/.test(document.getElementById('wtWho').textContent)));
  await page.fill('#wtTitleIn', '우리 집 강아지'); await page.click('#wtDraftBtn'); await page.waitForTimeout(600);
  const sd = await page.evaluate(() => { const b = document.getElementById('wtDueBox'); return { edit: !document.getElementById('wtEdit').hidden, dueVis: !!(b && b.offsetParent) }; });
  ok('학생 초안 편집 칸이 열려도 마감일 칸은 없다', sd.edit && !sd.dueVis, JSON.stringify(sd));
  ok('끝까지 에러 없음', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.screenshot({ path: `/tmp/hw-student-${w}-${lang}.png`, fullPage: false });
  await ctx.close();
}
for (const [w, h, lang] of [[390, 844, 'ko'], [1280, 720, 'en']]) {
  console.log(`── 선생님 ${w}×${h} ${lang}`);
  const { ctx, page, errs } = await open(w, h, lang, 'teacher');
  ok('에러 없음', errs.length === 0, errs.join(' | ').slice(0, 200));
  ok('선생님에게는 학생 숙제 안내 줄이 없다', await page.evaluate(() => document.getElementById('awHwNote').hidden));
  await page.evaluate(() => { const d = document.getElementById('wtMine'); if (d) d.open = true; });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#wtMineList .wt-item')].map(r => ({ t: r.textContent, sub: !!r.querySelector('button[onclick^="wtSubmits("]') })));
  ok('숙제 글감 줄에 꼬리표(마감일·제출 2명) · «📋 제출 확인»', rows[0] && (lang === 'en' ? /2 submitted/.test(rows[0].t) : /제출 2명/.test(rows[0].t)) && rows[0].sub, JSON.stringify(rows[0]).slice(0, 200));
  ok('(짝) 숙제 아닌 글감에는 «제출 확인» 이 없다', rows[1] && !rows[1].sub);
  ok('«📋 제출 확인» 이 맨 위(눌린다)', await topHit(page, '#wtMineList .wt-item button[onclick^="wtSubmits("]') === true);
  await page.click('#wtMineList .wt-item button[onclick^="wtSubmits("]'); await page.waitForTimeout(500);
  const sb = await page.evaluate((C) => { const el = document.getElementById('wtSubs'); const td = el.querySelector('td'); return { hidden: el.hidden, t: el.textContent, rows: el.querySelectorAll('tbody tr').length, cr: td ? new Function('return ' + C)()(td) : 0, over: document.documentElement.scrollWidth > innerWidth }; }, CONTRAST);
  ok('제출 표: 학생 2줄 · 이름 · 최고 점수', !sb.hidden && sb.rows === 2 && /김수아/.test(sb.t) && /88/.test(sb.t), sb.t.slice(0, 120));
  ok('제출 표 대비 4.5 이상 · 가로 넘침 없음', sb.cr >= 4.5 && !sb.over, 'contrast ' + sb.cr);
  // 마감일 칸
  await page.evaluate(() => { const b = document.querySelector('#wtMineList .wt-item button[onclick^="wtOpen("]') || document.querySelector('#wtMineList .wt-item button'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const due = await page.evaluate(() => { const b = document.getElementById('wtDueBox'), i = document.getElementById('wtDue'); return { vis: !!b && !b.hidden && getComputedStyle(b).display !== 'none' && !document.getElementById('wtEdit').hidden, v: i ? i.value : '' }; });
  ok('선생님은 마감일 칸이 보이고 그 글감의 날짜가 들어 있다', due.vis && due.v === '2099-12-31', JSON.stringify(due));
  ok('끝까지 에러 없음', errs.length === 0, errs.join(' | ').slice(0, 200));
  await page.screenshot({ path: `/tmp/hw-teacher-${w}-${lang}.png`, fullPage: false });
  await ctx.close();
}
await browser.close(); server.close();
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
