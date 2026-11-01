// -*- coding: utf-8 -*-
// AI 영작 — «🎬 장면·글감 선택» 하나 + 그림 바로 아래 브레인스토밍 + 📌 선생님 글감 만들기 (2026-10-19 사장님 지시)
//   ① 글감 고르는 곳은 목록 하나(그림 장면 · 선생님 글감 · 내 경험 · 오늘의 글감 네 묶음)
//   ② 무엇을 고르든 그림 «바로 아래» 6하원칙 브레인스토밍이 그 글감으로 바뀐다(PC 2단은 왼쪽 칸에 함께)
//   ③ 그림이 없는 글감은 그림 칸에 «제목 카드» — 그림 전용 버튼은 감춘다
//   ④ 원장·선생님(서버가 can_create 를 줄 때만)에게 «선생님 글감 만들기» 칸 → 초안 → 바로 지금 주제 → 저장·올리기
//   서버는 스텁입니다(진짜 판정은 test-harness/write_topics_harness.mjs 가 정본을 돌려 봅니다).
//   자동으로 안 돕니다 — 사람이 부릅니다:
//       PW_DIR=/tmp/pw node test-harness/manual/ai-write-topic-picker-browser.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireBrowser } from './_pw.mjs';
const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../../cloudflare-deploy/public');
const PAGE = process.env.AW_PAGE || 'ai-write.html';   // 변이시험: AW_PAGE=<public 안 사본 이름>
const { chromium, exe } = requireBrowser();
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2' };
const Q = (k, ko, en, starter, ex) => ({ k, p: 0, ko, en, starter, ph: '예) ' + ex });
const QS = [Q('when','🕒 When — 언제 갔나요?','🕒 When — When did you go?','It happened ','last summer'),
  Q('where','📍 Where — 어디로 갔나요?','📍 Where — Where did you go?','I was at ','a lake'),
  Q('who','🧑 Who — 누구와 갔나요?','🧑 Who — Who was with you?','I was with ','my dad'),
  Q('what','💡 What — 무엇을 했나요?','💡 What — What did you do?','First, ','we set up a tent'),
  Q('why','❓ Why — 왜 좋았나요?','❓ Why — Why was it fun?','It was fun because ','the stars were bright'),
  Q('how','💗 How — 기분이 어땠나요?','💗 How — How did you feel?','I felt ','happy')];
const PUB_ITEM = { id: 7, title_ko: '나의 첫 캠핑', title_en: 'My first camping trip', icon: '⛺', open: 'Last summer, I went camping.', questions: QS, words: ['tent','fire','stars'], image_url: '' };
let MODE = 'student', posts = [];
const server = createServer(async (req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/class/write-topics') {
    if (req.method === 'POST') {
      let b = ''; for await (const c of req) b += c; const body = JSON.parse(b || '{}'); posts.push(body);
      if (body.action === 'draft') { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ ok: true, ai_used: true, item: { id: 9, status: 'draft', title_ko: body.title, title_en: 'Our school trip', icon: '🚌', open: 'Last week, we went on a school trip.', questions: QS, words: ['bus','museum','lunch'], image_url: '', created_by: 'hq_t_kim' } })); }
      res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ ok: true, item: { id: body.id || 9, status: body.action === 'publish' ? 'published' : 'draft', title_ko: body.title_ko || '소풍', title_en: body.title_en || 'Trip', icon: '🚌', open: body.open || '', questions: body.questions || QS, words: body.words || [], image_url: '' } }));
    }
    res.writeHead(200, {'content-type':'application/json'});
    if (MODE === 'teacher') return res.end(JSON.stringify({ ok: true, items: [PUB_ITEM], can_create: true, manage: [{ ...PUB_ITEM, status: 'published', created_by: 'hq_t_kim' }], ai_left: 29, ai_cap: 30 }));
    return res.end(JSON.stringify({ ok: true, items: [PUB_ITEM], can_create: false }));
  }
  if (p.startsWith('/api/')) { res.writeHead(200, {'content-type':'application/json'}); return res.end('{"ok":false}'); }
  try { const buf = await readFile(join(PUB, p.replace(/^\//, ''))); res.writeHead(200, {'content-type': MIME[extname(p)] || 'application/octet-stream'}); res.end(buf); }
  catch { res.writeHead(404).end('nope'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (n, c, x='') => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  (' + x + ')' : '')); } else { fail++; console.log('  ❌ FAIL ' + n + (x ? '  → ' + x : '')); } };
async function open(w, h, lang, mode) {
  MODE = mode || 'student';
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((l) => { try { if (!sessionStorage.getItem('__c')) { localStorage.clear(); sessionStorage.setItem('__c','1'); } localStorage.setItem('mangoi_aiwrite_howto_v1','1'); localStorage.setItem('mangoi_aiwrite_guide_seen','1'); localStorage.setItem('mangoi_lang', l); } catch(e){} }, lang || 'ko');
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(BASE + '/' + PAGE + '?_nc=' + Date.now(), { waitUntil: 'load' });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}
const snap = (page) => page.evaluate(() => {
  const g = id => document.getElementById(id), r = id => { const e = g(id); return e ? e.getBoundingClientRect() : null; };
  const pc = g('picChoice');
  return { groups: [...pc.querySelectorAll('optgroup')].map(o => o.label), val: pc.value, nopt: pc.options.length,
    cur: (document.querySelector('.go-cur-t') || {}).textContent || '', src: (document.querySelector('.go-cur-src') || {}).textContent || '',
    nq: document.querySelectorAll('#goBody .go-q').length, q0: (document.querySelector('#goBody .go-q-label') || {}).textContent || '',
    topicHidden: g('picTopic').hidden, topicT: g('picTopicT').textContent, topicDisp: getComputedStyle(g('picTopic')).display,
    photoOp: getComputedStyle(g('picPhoto')).opacity, cap: g('picCapTxt').textContent,
    mode: g('picCard').className, goBtn: getComputedStyle(document.querySelector('.pic-btn.go')).display,
    words: [...document.querySelectorAll('#missionWords .mword')].map(e => e.textContent.trim()),
    wt: { hidden: g('wtPanel').hidden, disp: getComputedStyle(g('wtPanel')).display, edit: g('wtEdit').hidden },
    pos: { pic: r('picCard').top + scrollY, wt: r('wtPanel').top + scrollY, go: r('goCard').top + scrollY, mis: r('missionCard').top + scrollY, help: r('awHelp').top + scrollY, text: r('text').top + scrollY,
           picL: r('picCard').left, goL: r('goCard').left, textL: r('text').left, goThemesBottom: r('goThemes').bottom, picH: r('picScene').height, ih: innerHeight },
    over: document.documentElement.scrollWidth > innerWidth };
});
for (const [w, h] of [[390, 844], [1440, 900], [1280, 720]]) {
  console.log(`── student ${w}×${h}`);
  const { ctx, page, errs } = await open(w, h, 'ko');
  let s = await snap(page);
  ok('에러 없음', errs.length === 0, errs.join(' | ').slice(0, 300));
  ok('묶음 4개(선생님·그림·경험·글감)', s.groups.length === 4 && /선생님/.test(s.groups[0]) && /그림/.test(s.groups[1]), s.groups.join(','));
  ok('기본 값 = 그림', /^pic:\d+$/.test(s.val), s.val);
  ok('기본 주제 = 그림, 질문이 그림 밑에 있다', s.nq >= 4 && /지금 주제/.test(s.cur), s.cur + ' · q' + s.nq);
  ok("순서: 그림 < 브레인스토밍 (폰: < 도움 < 쓰기칸)", s.pos.pic < s.pos.go && (w >= 1200 || (s.pos.go < s.pos.help && s.pos.help < s.pos.text)), JSON.stringify(s.pos));
  ok('학생에게 선생님 칸 안 보임', s.wt.hidden && s.wt.disp === 'none');
  ok('가로 넘침 없음', !s.over);
  if (w >= 1200) {
    ok('PC: 그림과 브레인스토밍이 왼쪽, 쓰기 칸이 오른쪽', Math.abs(s.pos.picL - s.pos.goL) < 2 && s.pos.textL > s.pos.goL + 200, `${s.pos.picL}/${s.pos.goL}/${s.pos.textL}`);
    ok('PC: 그림이 최소보다 크다', s.pos.picH > 310 || s.pos.ih < 800, `goThemesBottom ${Math.round(s.pos.goThemesBottom)} / ih ${s.pos.ih} · pic ${Math.round(s.pos.picH)}`);
  }
  await page.selectOption('#picChoice', 'story:lost'); await page.waitForTimeout(400);
  s = await snap(page);
  ok('내 경험 고르면 제목 카드', !s.topicHidden && s.topicDisp === 'flex' && /잃어버린/.test(s.topicT) && s.photoOp === '0', s.topicT + ' op ' + s.photoOp);
  ok('그림 전용 버튼 감춤', s.goBtn === 'none');
  ok('질문이 그 글감으로', /잃어버린|소중/.test(s.cur) && s.nq >= 4, s.cur);
  ok('목록 값 = story:lost', s.val === 'story:lost', s.val);
  await page.selectOption('#picChoice', 'custom:7'); await page.waitForTimeout(400);
  s = await snap(page);
  ok('선생님 글감: 제목 카드(그림 없음)', !s.topicHidden && /캠핑/.test(s.topicT), s.topicT);
  ok('선생님 글감 질문 6개', s.nq === 6 && /언제 갔나요/.test(s.q0), s.q0);
  ok('미션 단어 = 선생님 단어', s.words.join(',').indexOf('tent') >= 0, s.words.join(','));
  ok('캡션 📌', /^📌/.test(s.cap), s.cap);
  await page.selectOption('#picChoice', 'topic:0'); await page.waitForTimeout(300);
  s = await snap(page);
  ok('오늘의 글감 고르면 제목 카드', !s.topicHidden && s.val === 'topic:0', s.topicT);
  await page.selectOption('#picChoice', 'pic:2'); await page.waitForTimeout(500);
  s = await snap(page);
  ok('그림으로 돌아오면 제목 카드 걷힘·사진 보임', s.topicHidden && s.topicDisp === 'none' && !/custom-mode|topic-mode/.test(s.mode) && s.goBtn !== 'none', s.mode + ' ' + s.photoOp);
  ok('목록 값 = pic:2', s.val === 'pic:2', s.val);
  // 🔀 다른 그림 → 주제가 그림을 따라감
  await page.selectOption('#picChoice', 'story:bday'); await page.waitForTimeout(300);
  await page.click('.pic-btn.shuffle'); await page.waitForTimeout(500);
  s = await snap(page);
  ok('다른 그림을 누르면 주제가 그림으로', /^pic:\d+$/.test(s.val) && s.topicHidden, s.val);
  // 새로고침 뒤 선생님 글감 유지
  await page.selectOption('#picChoice', 'custom:7'); await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(900);
  s = await snap(page);
  ok('새로고침 뒤에도 선생님 글감 유지', s.val === 'custom:7' && /캠핑/.test(s.topicT), s.val);
  // 영어
  await page.evaluate(() => window.setLang && window.setLang('en')); await page.waitForTimeout(400);
  s = await snap(page);
  ok('EN: 묶음 이름 영어', /Teacher/.test(s.groups[0]) && /Picture/.test(s.groups[1]), s.groups.join(','));
  ok('EN: 제목 카드 영어', /camping/i.test(s.topicT), s.topicT);
  ok('EN 이후 에러 없음', errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}
{
  // 🌐 영어로 저장된 학생이 «처음» 열 때 — 이 화면 스크립트는 공용 i18n 엔진(defer)보다 먼저 돌아 늘 한국어로 그린다.
  //    data-ko/data-en 으로 못 고치는 목록 «묶음 이름»·지금 주제 줄이 한국어로 남던 것을 2026-10-19 에 잡았다(DOMContentLoaded 에 다시 그림).
  console.log('── student EN 첫 화면 390×844');
  const { ctx, page, errs } = await open(390, 844, 'en');
  const s = await snap(page);
  ok('EN 첫 화면: 묶음 이름이 영어', s.groups.length > 0 && !/[가-힣]/.test(s.groups.join('')), s.groups.join(','));
  ok('EN 첫 화면: 지금 주제 줄이 영어', /^Topic:/.test(s.cur) && !/[가-힣]/.test(s.cur + s.src), s.cur + ' · ' + s.src);
  ok('EN 첫 화면: 에러 없음', errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}
for (const [w, h] of [[390, 844], [1440, 900]]) {
  console.log(`── teacher ${w}×${h}`);
  posts = [];
  const { ctx, page, errs } = await open(w, h, 'ko', 'teacher');
  let s = await snap(page);
  ok('선생님 칸 보임', !s.wt.hidden && s.wt.disp !== 'none');
  ok('순서: 그림 < 선생님 칸 < 브레인스토밍', s.pos.pic < s.pos.wt && s.pos.wt < s.pos.go, JSON.stringify(s.pos));
  await page.fill('#wtTitleIn', '우리 반 소풍'); await page.click('#wtDraftBtn'); await page.waitForTimeout(700);
  s = await snap(page);
  ok('초안 POST', posts.some(p => p.action === 'draft' && p.title === '우리 반 소풍'), JSON.stringify(posts));
  ok('초안이 바로 지금 주제', /소풍/.test(s.cur) && s.val === 'custom:9', s.cur + ' ' + s.val);
  ok('편집 칸 펼침', !s.wt.edit);
  const opt = await page.evaluate(() => [...document.querySelectorAll('#picChoice option')].map(o => o.textContent).filter(t => /소풍/.test(t)));
  ok('목록에 «(아직 안 올림)»', opt.some(t => /아직 안 올림/.test(t)), opt.join(','));
  await page.click('#wtPubBtn'); await page.waitForTimeout(700);
  ok('올리기 = 저장 후 publish', posts.some(p => p.action === 'save') && posts.some(p => p.action === 'publish'), posts.map(p => p.action).join(','));
  const msg = await page.evaluate(() => document.getElementById('wtMsg').textContent);
  ok('메시지', msg.length > 0, msg);
  ok('에러 없음', errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}
await browser.close(); server.close();
console.log('────────────────────────────────────────────────────────────');
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
